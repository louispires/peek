const net = require('net')

// aedes is published as an ES module, so it is loaded with import() to work on any Node 20.
async function startBroker() {
  const { Aedes } = await import('aedes')
  const broker = await Aedes.createBroker()
  const subscriptions = []
  const sockets = new Set()
  let server = null
  let port = 0
  let connects = 0

  broker.on('subscribe', (subs, client) => {
    for (const sub of subs) subscriptions.push({ clientId: client && client.id, topic: sub.topic })
  })

  broker.on('clientReady', () => { connects += 1 })

  function listen() {
    server = net.createServer(socket => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      broker.handle(socket)
    })
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        port = server.address().port
        resolve()
      })
    })
  }

  async function closeServer() {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => server.close(resolve))
  }

  await listen()

  const api = {
    get port() { return port },
    get url() { return `mqtt://127.0.0.1:${port}` },
    publish(topic, payload) {
      const body = typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload)
      return new Promise((resolve, reject) => {
        broker.publish({ cmd: 'publish', topic, payload: Buffer.from(body), qos: 0, retain: false }, err => (err ? reject(err) : resolve()))
      })
    },
    clients() {
      return Object.keys(broker.clients)
    },
    subscriptions() {
      return subscriptions.slice()
    },
    // Every client that ever completed a CONNECT, counting reconnects.
    connectCount() {
      return connects
    },
    async stop() {
      await closeServer()
      await new Promise(resolve => broker.close(resolve))
    },
    // Drops every connection and reopens on the same port.
    async restart() {
      await closeServer()
      await listen()
    }
  }

  return api
}

module.exports = { startBroker }
