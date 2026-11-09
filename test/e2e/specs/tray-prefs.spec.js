const { test, expect } = require('../harness/test')

const TOGGLES = ['Sound', 'Instant snapshot', 'Show all objects in frame', 'Show bounding boxes', 'Dismiss when stationary', 'Check on launch']

async function applyG1(peek) {
  for (const label of TOGGLES) await peek.clickTray([label])
  await peek.clickTray(['Dismiss after', '15 seconds'])
}

const expectedPrefs = {
  sound: true,
  snapshot: false,
  showAllObjectsInFrame: false,
  showBoundingBoxes: false,
  dismissOnStationary: false,
  autoUpdate: true,
  dismissSeconds: 15
}

// G1: Tray toggles persist.
test('G1 tray toggles persist to preferences.json', async ({ launch }) => {
  const peek = await launch()

  await applyG1(peek)

  expect(peek.readPrefs()).toMatchObject(expectedPrefs)
})

// G2: Preferences survive a restart.
test('G2 preferences survive a restart', async ({ launch }) => {
  const first = await launch()
  await applyG1(first)

  const peek = await launch.relaunch(first)

  const menu = await peek.trayMenu()
  const checked = (label) => menu.find(i => i.label === label).checked
  expect(checked('Sound')).toBe(true)
  expect(checked('Instant snapshot')).toBe(false)
  expect(checked('Show all objects in frame')).toBe(false)
  expect(checked('Show bounding boxes')).toBe(false)
  expect(checked('Dismiss when stationary')).toBe(false)
  expect(checked('Check on launch')).toBe(true)
  const dismiss = menu.find(i => i.label === 'Dismiss after').submenu
  expect(dismiss.filter(i => i.checked).map(i => i.label)).toEqual(['15 seconds'])

  await peek.clickTray(['Settings…'])
  const settings = await peek.setupWindow()
  await expect(settings.locator('#dismiss')).toHaveValue('15')
  await expect(settings.locator('#sound')).toBeChecked()
  await expect(settings.locator('#snapshot')).not.toBeChecked()
})

// G3: Open config folder.
test('G3 open config folder opens the userData folder', async ({ launch }) => {
  const peek = await launch()

  await peek.clickTray(['Open config folder'])

  await expect.poll(() => peek.records('open-path').map(r => r.path)).toEqual([peek.userData])
})
