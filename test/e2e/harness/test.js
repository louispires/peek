// Playwright `test` with the Peek fixtures: frigate, broker and launch.
const base = require('@playwright/test')
const { startFrigate } = require('./fake-frigate')
const { startBroker } = require('./fake-mqtt')
const { launchPeek, closePeek, relaunch } = require('./launch')

const { expect } = base

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Temporary: logs slow teardown steps while the macOS worker teardown hang is investigated.
async function timed(name, fn) {
  const started = Date.now()
  await fn()
  const ms = Date.now() - started
  if (ms > 2000) console.log(`[e2e] slow teardown: ${name} took ${ms} ms`)
}

// The app is up once it subscribed to Frigate events and the tray lists the cameras from /api/config
// (stream and size maps are filled just before the cameras are learned).
async function waitReady(handle, broker, config) {
  const prefix = (config && config.topicPrefix) || 'frigate'
  await expect.poll(
    () => broker.subscriptions().some(s => s.topic === `${prefix}/events`),
    { message: 'app subscribed to Frigate events', timeout: 15000 }
  ).toBe(true)
  await expect.poll(async () => {
    const menu = await handle.trayMenu()
    const cameras = menu && menu.find(i => i.label === 'Cameras')
    return cameras ? cameras.submenu.filter(i => i.type === 'checkbox').length : 0
  }, { message: 'cameras reached the tray', timeout: 15000 }).toBeGreaterThanOrEqual(3)
  // An event sent before the overlay script has run is lost, so wait until it has registered its handlers.
  const overlay = await handle.overlayWindow()
  await overlay.waitForFunction(() => !!customElements.get('video-stream'), null, { timeout: 15000 })
}

// Window bounds are whole device pixels, so on a fractional display scale (125 percent) a size in
// DIPs can come back one off. Every other scale must match exactly.
async function expectOverlayBounds(handle, expected, options) {
  const scale = await handle.scaleFactor()
  const slack = Number.isInteger(scale) ? 0 : 1
  await expect.poll(async () => {
    const { bounds } = await handle.overlayState()
    return Object.fromEntries(Object.keys(expected).map(k => [k, Math.abs(bounds[k] - expected[k]) <= slack ? expected[k] : bounds[k]]))
  }, options).toEqual(expected)
}

async function attachFailureDetails(handle, testInfo, index) {
  try {
    await testInfo.attach(`peek-${index}-events.jsonl`, { body: handle.log().map(r => JSON.stringify(r)).join('\n'), contentType: 'text/plain' })
    const pages = handle.app.windows()
    for (let i = 0; i < pages.length; i++) {
      const shot = await Promise.race([pages[i].screenshot().catch(() => null), sleep(3000).then(() => null)])
      if (shot) await testInfo.attach(`peek-${index}-window-${i}.png`, { body: shot, contentType: 'image/png' })
    }
  } catch (err) {
    // The app may already be gone; the failure itself is reported anyway.
  }
}

const test = base.test.extend({
  frigate: async ({}, use) => {
    const frigate = await startFrigate()
    await use(frigate)
    await timed('frigate.stop', () => frigate.stop())
  },

  broker: async ({}, use) => {
    const broker = await startBroker()
    await use(broker)
    await timed('broker.stop', () => broker.stop())
  },

  // launch({ config, prefs, env, ready }): config is merged over the default test config;
  // pass config: null for a first run (no config.json). ready: false skips the wait for MQTT and cameras.
  launch: async ({ frigate, broker }, use, testInfo) => {
    const handles = []
    const defaults = { frigateUrl: frigate.url, mqtt: broker.url }
    const track = (handle) => {
      handles.push(handle)
      return handle
    }
    const launch = async ({ config, prefs, env, ready = true } = {}) => {
      const effective = config === null ? undefined : Object.assign({}, defaults, config)
      const handle = track(await launchPeek({ config: effective, prefs, env }))
      if (effective && ready) await waitReady(handle, broker, effective)
      return handle
    }
    launch.relaunch = async (handle, { ready = true } = {}) => {
      handles.splice(handles.indexOf(handle), 1)
      const next = track(await relaunch(handle))
      if (ready) await waitReady(next, broker, next.readConfig())
      return next
    }
    await use(launch)
    const failed = testInfo.status !== testInfo.expectedStatus
    for (let i = 0; i < handles.length; i++) {
      if (failed) await attachFailureDetails(handles[i], testInfo, i)
      await timed('closePeek', () => closePeek(handles[i]))
    }
  }
})

module.exports = { test, expect, sleep, expectOverlayBounds }
