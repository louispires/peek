const { test, expect, sleep, expectOverlayBounds } = require('../harness/test')
const { newEvent } = require('../harness/events')
const {
  QUIET_MS, overlayVisible, overlayRecords, pressShortcut, overlayMovable, moveOverlay,
  primaryDisplayId, waitForLiveCard
} = require('../harness/helpers-2a')

const SET_POSITION = 'Set overlay position…'
const RESET_POSITION = 'Reset overlay position'

const trayLabels = async (peek) => (await peek.trayMenu()).map(i => i.label)

// Where the test drags the card: 100 from the left, 50 from the bottom of the work area.
const dragTarget = (wa) => ({ x: wa.x + 100, y: wa.y + wa.height - 350, width: 380, height: 300 })

async function lockPlacement(peek) {
  await peek.clickTray([SET_POSITION])
  await expect.poll(() => overlayVisible(peek)).toBe(true)
  const page = await peek.overlayWindow()
  await moveOverlay(peek, dragTarget(await peek.workArea()))
  await page.click('#placement-lock')
  await expect.poll(() => peek.readConfig().placement).toBeTruthy()
  return page
}

// H1: Placement mode.
test('H1 placement mode shows a movable overlay with the lock bar', async ({ launch }) => {
  const peek = await launch()

  await peek.clickTray([SET_POSITION])

  await expect.poll(() => overlayVisible(peek)).toBe(true)
  expect(await overlayMovable(peek)).toBe(true)
  const page = await peek.overlayWindow()
  await expect(page.locator('#placement')).not.toHaveClass(/\bhidden\b/)
})

// H2: Lock saves the position.
test('H2 Lock here saves the position', async ({ launch }) => {
  const peek = await launch()

  await lockPlacement(peek)

  expect(peek.readConfig().placement).toEqual({
    displayId: await primaryDisplayId(peek),
    anchorX: 'left',
    anchorY: 'bottom',
    offsetX: 100,
    offsetY: 50
  })
  await expect.poll(() => overlayVisible(peek)).toBe(false)
  expect(await overlayMovable(peek)).toBe(false)
  expect(await trayLabels(peek)).toContain(RESET_POSITION)
})

// H3: The next card uses the saved position.
test('H3 the next card uses the saved position', async ({ launch, broker }) => {
  const peek = await launch()
  const wa = await peek.workArea()
  await lockPlacement(peek)

  await broker.publish('frigate/events', newEvent('h1', 'front_door', 'person', 0.8))

  await expect.poll(() => overlayVisible(peek)).toBe(true)
  await expectOverlayBounds(peek, { x: wa.x + 100, y: wa.y + wa.height - 350 })
})

// H4: Reset returns to the corner.
test('H4 Reset overlay position returns the card to the corner', async ({ launch, broker, frigate }) => {
  const peek = await launch()
  const wa = await peek.workArea()
  await lockPlacement(peek)
  frigate.holdStream()

  await peek.clickTray([RESET_POSITION])

  expect(peek.readConfig().placement).toBeUndefined()
  expect(await trayLabels(peek)).not.toContain(RESET_POSITION)
  await broker.publish('frigate/events', newEvent('h2', 'front_door', 'person', 0.8))
  await expect.poll(() => overlayVisible(peek)).toBe(true)
  await expectOverlayBounds(peek, { x: wa.x + wa.width - 404, y: wa.y + 24, width: 380, height: 300 })
})

// H5: Cancel saves nothing.
test('H5 Cancel saves nothing', async ({ launch }) => {
  const peek = await launch()
  await peek.clickTray([SET_POSITION])
  await expect.poll(() => overlayVisible(peek)).toBe(true)
  const page = await peek.overlayWindow()
  await moveOverlay(peek, dragTarget(await peek.workArea()))

  await page.click('#placement-cancel')

  await expect.poll(() => overlayVisible(peek)).toBe(false)
  expect(peek.readConfig().placement).toBeUndefined()
  expect(await trayLabels(peek)).not.toContain(RESET_POSITION)
})

// H6: Events are ignored while placing.
test('H6 events are ignored while placing', async ({ launch, broker }) => {
  const peek = await launch()
  await peek.clickTray([SET_POSITION])
  await expect.poll(() => overlayVisible(peek)).toBe(true)

  await broker.publish('frigate/events', newEvent('h3', 'front_door', 'person', 0.8))

  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])
})

// H7: Placement closes the live view.
test('H7 placement closes an open live view', async ({ launch }) => {
  const peek = await launch()
  await pressShortcut(peek)
  const page = await peek.overlayWindow()
  await waitForLiveCard(page)

  await peek.clickTray([SET_POSITION])

  await expect.poll(() => overlayRecords(peek, 'live-close')).toEqual([{ animate: false }])
  await expect(page.locator('#placement')).not.toHaveClass(/\bhidden\b/)
})
