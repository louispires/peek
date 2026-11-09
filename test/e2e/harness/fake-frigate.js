const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const crypto = require('crypto')
const { WebSocketServer } = require('ws')

const FIXTURES = path.join(__dirname, '..', 'fixtures')
const FRIGATE_CONFIG = fs.readFileSync(path.join(FIXTURES, 'frigate-config.json'))
const SNAPSHOT = fs.readFileSync(path.join(FIXTURES, 'snapshot.jpg'))
const STREAM = loadStream(fs.readFileSync(path.join(FIXTURES, 'stream-640x480.mp4')))

// Splits a fragmented MP4 into the init segment (ftyp + moov) and one chunk per moof + mdat pair,
// which is how go2rtc sends MSE data.
function loadStream(file) {
  const boxes = []
  for (let offset = 0; offset < file.length;) {
    const size = file.readUInt32BE(offset)
    boxes.push({ type: file.toString('latin1', offset + 4, offset + 8), data: file.subarray(offset, offset + size) })
    offset += size
  }
  const chunks = []
  let init = []
  let fragment = null
  for (const box of boxes) {
    if (box.type === 'ftyp' || box.type === 'moov') {
      init.push(box.data)
    } else if (box.type === 'moof') {
      fragment = [box.data]
    } else if (box.type === 'mdat' && fragment) {
      chunks.push(Buffer.concat([...fragment, box.data]))
      fragment = null
    }
  }
  const avcC = file.indexOf('avcC')
  const profile = file.subarray(avcC + 5, avcC + 8).toString('hex')
  return { codec: `video/mp4; codecs="avc1.${profile}"`, init: Buffer.concat(init), chunks }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function makeJwt(user, ttlSeconds) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = base64url(JSON.stringify({ sub: user, role: 'admin', exp }))
  const sig = crypto.createHmac('sha256', 'peek-e2e').update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })
}

function cookieToken(req) {
  const m = /(?:^|;\s*)frigate_token=([^;]+)/.exec(req.headers.cookie || '')
  return m ? m[1] : null
}

async function makeCert() {
  const selfsigned = require('selfsigned')
  return selfsigned.generate([{ name: 'commonName', value: '127.0.0.1' }], {
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }, { type: 2, value: 'localhost' }] }
    ]
  })
}

function sendStream(ws) {
  if (ws.readyState !== ws.OPEN) return
  ws.send(JSON.stringify({ type: 'mse', value: STREAM.codec }))
  ws.send(STREAM.init)
  for (const chunk of STREAM.chunks) ws.send(chunk)
}

// auth: null for an open Frigate, or { user, password } to require the frigate_token cookie.
async function startFrigate({ https: useHttps = false, auth = null, cert = null, tokenTtlSeconds = 3600 } = {}) {
  const requests = []
  const issued = new Set()
  let currentAuth = auth
  let streamHeld = false
  const heldSockets = new Set()
  const pems = useHttps ? (cert || await makeCert()) : null

  const log = (method, req, url) => {
    requests.push({
      t: Date.now(),
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers
    })
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    log(req.method, req, url)

    if (req.method === 'POST' && url.pathname === '/api/login') {
      let body = {}
      try { body = JSON.parse(await readBody(req)) } catch (err) {}
      if (currentAuth && body.user === currentAuth.user && body.password === currentAuth.password) {
        const token = makeJwt(body.user, tokenTtlSeconds)
        issued.add(token)
        res.writeHead(200, { 'Set-Cookie': `frigate_token=${token}; Path=/; HttpOnly`, 'Content-Type': 'application/json' })
        res.end('{}')
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end('{"message":"Login failed"}')
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      if (currentAuth && !issued.has(cookieToken(req))) {
        res.writeHead(401)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(FRIGATE_CONFIG)
      return
    }

    if (req.method === 'GET' && /^\/api\/[^/]+\/latest\.jpg$/.test(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': SNAPSHOT.length })
      res.end(SNAPSHOT)
      return
    }

    res.writeHead(404)
    res.end()
  }

  const server = useHttps
    ? https.createServer({ key: pems.private, cert: pems.cert }, handler)
    : http.createServer(handler)

  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname !== '/live/webrtc/api/ws') {
      socket.destroy()
      return
    }
    log('WS', req, url)
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary) return
        let msg
        try { msg = JSON.parse(data.toString()) } catch (err) { return }
        // WebRTC offers and candidates are ignored, so the client settles on MSE.
        if (msg.type === 'mse') {
          if (streamHeld) heldSockets.add(ws)
          else sendStream(ws)
        }
      })
      ws.on('close', () => heldSockets.delete(ws))
      ws.on('error', () => {})
    })
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  return {
    url: `${useHttps ? 'https' : 'http'}://127.0.0.1:${port}`,
    port,
    requests,
    cert: pems,
    setAuth(next) {
      currentAuth = next
      issued.clear()
    },
    // While held, MSE requests get no video, so a test can look at the card before the stream plays.
    holdStream() {
      streamHeld = true
    },
    releaseStream() {
      streamHeld = false
      for (const ws of heldSockets) sendStream(ws)
      heldSockets.clear()
    },
    async stop() {
      for (const client of wss.clients) client.terminate()
      wss.close()
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  }
}

module.exports = { startFrigate }
