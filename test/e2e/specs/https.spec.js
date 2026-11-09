const base = require('../harness/test')
const { startFrigate } = require('../harness/fake-frigate')
const { newEvent } = require('../harness/events')

const { expect } = base

// A fake Frigate on HTTPS; startSecure({ auth }) adds login. Stopped after the test.
const test = base.test.extend({
  startSecure: async ({}, use) => {
    const started = []
    await use(async (opts) => {
      const server = await startFrigate(Object.assign({ https: true }, opts))
      started.push(server)
      return server
    })
    for (const server of started) await server.stop()
  }
})

const AUTH = { user: 'admin', password: 'secret' }

// The setup page fills its fields from saved prefs after an async call, and the last step
// of that is hiding the self-signed row; typing before then would be overwritten.
async function openFirstRunSetup(peek) {
  const page = await peek.setupWindow()
  await expect(page.locator('#selfSignedRow')).toBeHidden()
  return page
}

async function fillSecureForm(page, frigate, broker, { selfSigned, user, password }) {
  await page.fill('#frigateHost', '127.0.0.1')
  await page.fill('#frigatePort', String(frigate.port))
  await page.check('#frigateHttps')
  await page.setChecked('#frigateSelfSigned', selfSigned)
  if (user) await page.fill('#frigateUser', user)
  if (password) await page.fill('#frigatePass', password)
  await page.fill('#mqttHost', '127.0.0.1')
  await page.fill('#mqttPort', String(broker.port))
}

async function posterLoads(peek) {
  const overlay = await peek.overlayWindow()
  await expect.poll(
    () => overlay.evaluate(() => document.getElementById('poster').naturalWidth),
    { message: '#poster loaded' }
  ).toBeGreaterThan(0)
}

const logins = (frigate) => frigate.requests.filter(r => r.method === 'POST' && r.path === '/api/login')
const authedConfigFetches = (frigate) => frigate.requests.filter(r => r.method === 'GET' && r.path === '/api/config' && /frigate_token=/.test(r.headers.cookie || ''))

// J1: Self-signed HTTPS without login.
test('J1 self-signed HTTPS without login lists cameras and loads the poster', async ({ launch, broker, startSecure }) => {
  const secure = await startSecure()
  const peek = await launch({ config: { frigateUrl: secure.url, frigateAllowSelfSigned: true } })

  await broker.publish('frigate/events', newEvent('j1', 'front_door', 'person', 0.8))

  const menu = await peek.trayMenu()
  const cameras = menu.find(i => i.label === 'Cameras')
  expect(cameras.submenu.map(i => i.label)).toEqual(['Back Yard', 'Front Door', 'Garage Cam'])
  await posterLoads(peek)
})

// J2: Untrusted cert is reported.
test('J2 an untrusted certificate is reported', async ({ launch, broker, startSecure }) => {
  const secure = await startSecure()
  const peek = await launch({ config: null })
  const page = await openFirstRunSetup(peek)
  await fillSecureForm(page, secure, broker, { selfSigned: false })

  await page.click('#test')

  await expect(page.locator('#status')).toHaveText(
    'MQTT OK, but Frigate: Frigate certificate is not trusted by this system. Enable "Allow self-signed certificate" if this is expected.',
    { timeout: 9000 }
  )
})

// J3: Login succeeds, and the token reaches Frigate and the session.
test('J3 login succeeds and the token is used', async ({ launch, broker, startSecure }) => {
  const secure = await startSecure({ auth: AUTH })
  const peek = await launch({ config: null })
  const page = await openFirstRunSetup(peek)
  await fillSecureForm(page, secure, broker, { selfSigned: true, user: AUTH.user, password: AUTH.password })

  await page.click('#test')
  await expect(page.locator('#status')).toHaveText('MQTT broker and Frigate login OK.', { timeout: 9000 })

  const loginsBeforeSave = logins(secure).length
  await page.click('#save')

  await expect.poll(() => logins(secure).length).toBeGreaterThan(loginsBeforeSave)
  await expect.poll(() => authedConfigFetches(secure).length).toBeGreaterThan(0)
  const token = /frigate_token=([^;]+)/.exec(authedConfigFetches(secure)[0].headers.cookie)[1]
  expect(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())).toMatchObject({ sub: 'admin' })

  const cookies = await peek.app.evaluate(({ session }) => session.defaultSession.cookies.get({ name: 'frigate_token' }))
  expect(cookies.map(c => c.value)).toEqual([token])

  // The cameras only reach the tray if /api/config accepted the token.
  await expect.poll(async () => {
    const menu = await peek.trayMenu()
    const cameras = menu && menu.find(i => i.label === 'Cameras')
    return cameras ? cameras.submenu.length : 0
  }).toBeGreaterThanOrEqual(3)
  await broker.publish('frigate/events', newEvent('j2', 'front_door', 'person', 0.8))
  await posterLoads(peek)
})

// J4: Wrong password.
test('J4 a wrong password is reported', async ({ launch, broker, startSecure }) => {
  const secure = await startSecure({ auth: AUTH })
  const peek = await launch({ config: null })
  const page = await openFirstRunSetup(peek)
  await fillSecureForm(page, secure, broker, { selfSigned: true, user: AUTH.user, password: 'wrong' })

  await page.click('#test')

  await expect(page.locator('#status')).toHaveText(
    'MQTT OK, but Frigate: Invalid Frigate username or password.',
    { timeout: 9000 }
  )
})

// J5: Frigate back online logs in again.
test('J5 Frigate coming back online logs in again', async ({ launch, broker, startSecure }) => {
  const secure = await startSecure({ auth: AUTH })
  await launch({ config: { frigateUrl: secure.url, frigateAllowSelfSigned: true, frigateUser: AUTH.user, frigatePassword: AUTH.password } })
  const before = logins(secure).length
  expect(before).toBeGreaterThanOrEqual(1)

  await broker.publish('frigate/available', 'offline')
  await broker.publish('frigate/available', 'online')

  await expect.poll(() => logins(secure).length, { timeout: 3000 }).toBe(before + 1)
})
