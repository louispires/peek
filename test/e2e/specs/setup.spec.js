const { test, expect, sleep, expectOverlayBounds } = require('../harness/test')
const { closedPort } = require('../harness/ports')
const { newEvent } = require('../harness/events')

const isDarwin = process.platform === 'darwin'

// The setup page fills its fields from saved prefs after an async call, and the last step
// of that is hiding the self-signed row; typing before then would be overwritten.
async function openFirstRunSetup(peek) {
  const page = await peek.setupWindow()
  await expect(page.locator('#selfSignedRow')).toBeHidden()
  return page
}

async function fillConnection(page, frigatePort, mqttPort) {
  await page.fill('#frigateHost', '127.0.0.1')
  await page.fill('#frigatePort', String(frigatePort))
  await page.fill('#mqttHost', '127.0.0.1')
  await page.fill('#mqttPort', String(mqttPort))
}

function dockVisible(peek) {
  return peek.app.evaluate(({ app }) => app.dock.isVisible())
}

// B1: First run opens setup only.
test('B1 first run opens only the setup window', async ({ launch }) => {
  const peek = await launch({ config: null })
  await peek.setupWindow()

  await expect.poll(() => peek.windowTitles()).toEqual([
    expect.objectContaining({ title: 'Peek Setup' })
  ])
  const windows = await peek.windowTitles()
  expect(windows).toHaveLength(1)
  expect(windows.filter(w => w.url.replace(/\\/g, '/').endsWith('renderer/index.html'))).toEqual([])
  expect(peek.records('tray-menu')).toEqual([])
  if (isDarwin) expect(await dockVisible(peek)).toBe(false)
})

// B2: Test connection reports a dead broker.
test('B2 test connection reports a dead broker', async ({ launch, frigate }) => {
  const peek = await launch({ config: null })
  const page = await openFirstRunSetup(peek)
  await fillConnection(page, frigate.port, await closedPort())

  await page.click('#test')

  await expect(page.locator('#status')).toHaveClass(/^err$/, { timeout: 9000 })
  await expect(page.locator('#status')).toContainText('ECONNREFUSED')
})

// B3: Test connection passes with a live broker.
test('B3 test connection passes with a live broker', async ({ launch, frigate, broker }) => {
  const peek = await launch({ config: null })
  const page = await openFirstRunSetup(peek)
  await fillConnection(page, frigate.port, broker.port)

  await page.click('#test')

  await expect(page.locator('#status')).toHaveClass(/^ok$/, { timeout: 9000 })
})

async function saveFirstRun(peek, frigate, broker) {
  const page = await openFirstRunSetup(peek)
  await fillConnection(page, frigate.port, broker.port)
  await page.click('#test')
  await expect(page.locator('#status')).toHaveClass(/^ok$/, { timeout: 9000 })
  return page
}

// B4: Save & start writes config and starts.
test('B4 save and start writes the config and starts the app', async ({ launch, frigate, broker }) => {
  const peek = await launch({ config: null })
  const page = await saveFirstRun(peek, frigate, broker)

  await page.click('#save')

  await expect.poll(() => peek.readConfig()).toMatchObject({
    frigateUrl: `http://127.0.0.1:${frigate.port}`,
    mqtt: `mqtt://127.0.0.1:${broker.port}`
  })
  await expect.poll(async () => (await peek.windowTitles()).filter(w => w.title === 'Peek Setup')).toEqual([])
  await expect.poll(() => peek.records('tray-menu').length).toBeGreaterThan(0)
  await expect.poll(() => broker.subscriptions().map(s => s.topic)).toEqual(
    expect.arrayContaining(['frigate/events', 'frigate/available', 'frigate/+/audio/+'])
  )
  const prefs = peek.readPrefs()
  expect(prefs.autoUpdate).toBe(false)
  expect(prefs.showDock).toBe(false)
  expect(prefs.openAtLogin).toBe(false)
})

// B5: Closing setup on first run quits.
test('B5 cancelling setup on first run quits the app', async ({ launch }) => {
  const peek = await launch({ config: null })
  const page = await openFirstRunSetup(peek)

  await page.click('#cancel')

  const code = await Promise.race([peek.exitCode, sleep(5000).then(() => 'still running')])
  expect(code).toBe(0)
})

// B6: Cameras from the Frigate config reach the tray.
test('B6 cameras from the Frigate config reach the tray', async ({ launch, frigate, broker }) => {
  const peek = await launch({ config: null })
  const page = await saveFirstRun(peek, frigate, broker)
  await page.click('#save')

  await expect.poll(async () => {
    const menu = await peek.trayMenu()
    const cameras = menu && menu.find(i => i.label === 'Cameras')
    return cameras ? cameras.submenu.map(i => [i.label, i.checked]) : []
  }).toEqual([['Back Yard', true], ['Front Door', true], ['Garage Cam', true]])
})

// B7: The Dock follows the setting (macOS only).
test('B7 the Dock icon follows the setting', async ({ launch, frigate, broker }) => {
  test.skip(!isDarwin, 'Dock exists only on macOS')
  const peek = await launch({ config: null })
  const page = await saveFirstRun(peek, frigate, broker)
  await page.check('#showDock')
  await page.click('#save')
  await expect.poll(() => dockVisible(peek)).toBe(true)
  // Electron ignores app.dock.hide() within 1 s of app.dock.show(), to avoid duplicate Dock icons.
  await sleep(1500)

  await expect.poll(() => peek.records('tray-menu').length).toBeGreaterThan(0)
  await peek.clickTray(['Settings…'])
  const settings = await peek.setupWindow()
  await expect(settings.locator('#showDock')).toBeChecked()
  await settings.uncheck('#showDock')
  await settings.click('#save')

  await expect.poll(() => dockVisible(peek)).toBe(false)
})

// B8: The corner setting places the card.
test('B8 the corner setting places the card bottom-left', async ({ launch, broker }) => {
  const peek = await launch({ config: { corner: 'bottom-left' } })
  const wa = await peek.workArea()

  await broker.publish('frigate/events', newEvent('e1', 'front_door', 'person', 0.8))

  await expect.poll(async () => (await peek.overlayState()).visible).toBe(true)
  await expectOverlayBounds(peek, { x: wa.x + 24, y: wa.y + wa.height - 300 - 24 })
})
