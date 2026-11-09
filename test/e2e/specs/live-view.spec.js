const { test, expect, sleep, expectOverlayBounds } = require('../harness/test')
const { newEvent } = require('../harness/events')
const { TEST_HOTKEY } = require('../harness/launch')
const {
  QUIET_MS, overlayVisible, overlayRecords, pressShortcut, isShortcutRegistered,
  trayAccelerator, waitForLiveCard
} = require('../harness/helpers-2a')

// Size and top-right position of the live grid for n > 1 cameras, from the design's formula.
function gridBounds(wa, n) {
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const w = cols * 505 + 16
  const h = rows * 284 + 16
  const scale = Math.min(1, wa.width * 0.9 / w, wa.height * 0.9 / h)
  const width = Math.round(w * scale)
  return { x: wa.x + wa.width - width - 24, y: wa.y + 24, width, height: Math.round(h * scale) }
}

// Closing while the streams are still starting takes over two seconds, so a close test waits for playback first.
async function waitForLiveVideo(page) {
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#grid video')].some(v => v.currentTime > 0)), { timeout: 10000 }).toBe(true)
}

async function singleCameraLive(peek) {
  await peek.clickTray(['Live view cameras', 'Back Yard'])
  await peek.clickTray(['Live view cameras', 'Garage Cam'])
  await pressShortcut(peek)
}

// F1: The default shortcut is registered (CI only, because a developer's installed Peek holds it).
test('F1 the default live view shortcut is registered', async ({ launch }) => {
  test.skip(!process.env.CI, 'locally the installed Peek holds CommandOrControl+Alt+Z')
  const peek = await launch({ prefs: { liveHotkey: undefined } })

  expect(await isShortcutRegistered(peek, 'CommandOrControl+Alt+Z')).toBe(true)
})

// F2: The live view shows a grid of the known cameras.
test('F2 the shortcut opens a live grid of all cameras', async ({ launch, frigate }) => {
  const peek = await launch()
  const wa = await peek.workArea()

  await pressShortcut(peek)

  await expect.poll(() => overlayRecords(peek, 'live-open').length).toBe(1)
  const [live] = overlayRecords(peek, 'live-open')
  expect(live.cameras.map(c => c.id)).toEqual(['back_yard', 'front_door', 'garage_cam'])
  expect(live.muted).toBe(true)
  await expect.poll(() => overlayVisible(peek)).toBe(true)
  const page = await peek.overlayWindow()
  await expect(page.locator('#grid .tile')).toHaveCount(3)
  await expect(page.locator('#cam')).toHaveText('Live view')
  await expectOverlayBounds(peek, gridBounds(wa, 3))
  await expect.poll(() => {
    const sources = frigate.requests.filter(r => r.method === 'WS').map(r => r.query.src)
    return ['front_door_main', 'back_yard', 'garage_cam'].every(src => sources.includes(src))
  }).toBe(true)
})

// F3: The shortcut again closes the live view.
test('F3 the shortcut again closes the live view', async ({ launch }) => {
  const peek = await launch()
  await pressShortcut(peek)
  const page = await peek.overlayWindow()
  await waitForLiveCard(page)
  await waitForLiveVideo(page)

  await pressShortcut(peek)

  await expect.poll(() => overlayVisible(peek), { timeout: 1500 }).toBe(false)
})

// F4: A single camera fills the card.
test('F4 a single live camera gets one big tile', async ({ launch }) => {
  const peek = await launch()

  await singleCameraLive(peek)

  await expect.poll(() => overlayRecords(peek, 'live-open').length).toBe(1)
  expect(overlayRecords(peek, 'live-open')[0].cameras.map(c => c.id)).toEqual(['front_door'])
  const page = await peek.overlayWindow()
  await expect(page.locator('#grid')).toHaveClass(/\bsingle\b/)
  await expect(page.locator('#cam')).toHaveText('Front Door')
  // 380 before the stream plays, 395 after.
  const slack = Number.isInteger(await peek.scaleFactor()) ? 0 : 1
  await expect.poll(async () => {
    const { bounds } = await peek.overlayState()
    return bounds.height >= 300 - slack && bounds.height <= 300 + slack &&
      [380, 395].some(w => Math.abs(bounds.width - w) <= slack)
  }).toBe(true)
})

// F5: No cameras ticked.
test('F5 live view with no cameras ticked shows a notice', async ({ launch }) => {
  const peek = await launch()
  for (const camera of ['Back Yard', 'Front Door', 'Garage Cam']) {
    await peek.clickTray(['Live view cameras', camera])
  }

  await pressShortcut(peek)

  await expect.poll(() => peek.records('notification').map(r => ({ title: r.title, body: r.body }))).toEqual([
    { title: 'Peek', body: 'No cameras for live view yet. Pick some under Live view cameras.' }
  ])
  expect(await overlayVisible(peek)).toBe(false)
  expect(overlayRecords(peek, 'live-open')).toEqual([])
})

// F6: The tray item opens the live view and shows the shortcut.
test('F6 the tray item shows the shortcut and opens the live view', async ({ launch }) => {
  const peek = await launch()

  expect(await trayAccelerator(peek, 'Show live view')).toBe(TEST_HOTKEY)
  await peek.clickTray(['Show live view'])

  await expect.poll(() => overlayRecords(peek, 'live-open').length).toBe(1)
})

// F7: A detection replaces the live view.
test('F7 a detection replaces the live view', async ({ launch, broker }) => {
  const peek = await launch()
  await pressShortcut(peek)
  const page = await peek.overlayWindow()
  await waitForLiveCard(page)

  await broker.publish('frigate/events', newEvent('f1', 'front_door', 'person', 0.8))

  await expect(page.locator('#card')).not.toHaveClass(/\blive\b/)
  await expect(page.locator('#grid')).toHaveClass(/\bhidden\b/)
  await expect(page.locator('#cam')).toHaveText('Front Door')
})

// F8: Clicking a tile opens that camera in Frigate.
test('F8 clicking a tile opens the camera in Frigate', async ({ launch, frigate }) => {
  const peek = await launch()
  await singleCameraLive(peek)
  const page = await peek.overlayWindow()
  await waitForLiveCard(page)

  await page.click('.tile.clickable')

  await expect.poll(() => peek.records('open-external').map(r => r.url)).toEqual([`http://127.0.0.1:${frigate.port}/#front_door`])
})

// F9: A tile is not clickable when clicks are disabled.
test('F9 a tile is not clickable when clicks are disabled', async ({ launch }) => {
  const peek = await launch({ prefs: { clickAction: 'disabled' } })
  await singleCameraLive(peek)
  const page = await peek.overlayWindow()
  await waitForLiveCard(page)

  await expect(page.locator('.tile')).toHaveCount(1)
  await expect(page.locator('.tile')).not.toHaveClass(/\bclickable\b/)
  await page.click('.tile')

  await sleep(QUIET_MS)
  expect(peek.records('open-external')).toEqual([])
})

// The key as setup.js builds it: Ctrl on Windows and Linux, Control on macOS.
const CAPTURED = process.platform === 'darwin' ? 'Control+Alt+L' : 'Ctrl+Alt+L'

async function openLiveSettings(peek) {
  await peek.clickTray(['Settings…'])
  const page = await peek.setupWindow()
  // The hotkey box is filled last, after the async load of saved prefs.
  await expect(page.locator('#liveHotkey')).not.toHaveValue('')
  return page
}

// F10: Change the shortcut in Settings.
test('F10 the shortcut can be changed in Settings', async ({ launch }) => {
  const peek = await launch()
  const page = await openLiveSettings(peek)

  await page.click('#liveHotkey')
  await page.keyboard.press('Control+Alt+L')
  await expect(page.locator('#liveHotkeyHint')).toHaveText('Saved when you click Save.')
  await page.click('#save')

  await expect.poll(() => peek.readPrefs().liveHotkey).toBe(CAPTURED)
  await expect.poll(() => isShortcutRegistered(peek, CAPTURED)).toBe(true)
  expect(await isShortcutRegistered(peek, TEST_HOTKEY)).toBe(false)
})

// F11: Clear the shortcut.
test('F11 the shortcut can be cleared in Settings', async ({ launch }) => {
  const peek = await launch()
  const page = await openLiveSettings(peek)

  await page.click('#liveHotkeyClear')
  await page.click('#save')

  await expect.poll(() => peek.readPrefs().liveHotkey).toBe('')
  expect(await isShortcutRegistered(peek, TEST_HOTKEY)).toBe(false)
  await expect.poll(() => trayAccelerator(peek, 'Show live view')).toBeNull()
})
