const { test, expect, sleep } = require('../harness/test')
const { newEvent } = require('../harness/events')

// L1: Wake reconnects MQTT.
test('L1 waking from sleep reconnects to the broker', async ({ launch, broker }) => {
  const peek = await launch()
  const before = broker.connectCount()

  await peek.app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'))

  await expect.poll(() => broker.connectCount(), { timeout: 5000 }).toBe(before + 1)
})

// L2: Broker restart.
test('L2 events flow again after the broker restarts', async ({ launch, broker }) => {
  const peek = await launch()
  const connects = broker.connectCount()
  const subscribed = broker.subscriptions().length

  await broker.restart()

  await expect.poll(() => broker.connectCount(), { timeout: 15000 }).toBeGreaterThan(connects)
  await expect.poll(() => broker.subscriptions().length, { timeout: 15000 }).toBeGreaterThanOrEqual(subscribed + 3)
  await broker.publish('frigate/events', newEvent('l1', 'front_door', 'person', 0.8))
  await expect.poll(() => peek.eventPayloads().map(p => p.id), { timeout: 15000 }).toEqual(['l1'])
})

// L3: Quit from tray.
test('L3 Quit in the tray menu exits cleanly', async ({ launch }) => {
  const peek = await launch()

  if (process.platform === 'darwin') {
    // macOS runs role items natively, so a click from code does nothing there. Check the role, then
    // quit the way the role does. MANUAL-MACOS.md covers a real click.
    const role = await peek.app.evaluate(() => globalThis.__peekE2E.trayMenu.items.find(i => i.label === 'Quit').role)
    expect(role).toBe('quit')
    peek.app.evaluate(({ app }) => app.quit()).catch(() => {})
  } else {
    // The app may exit before the call returns.
    peek.clickTray(['Quit']).catch(() => {})
  }

  expect(await Promise.race([peek.exitCode, sleep(5000).then(() => 'still running')])).toBe(0)
})
