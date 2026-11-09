const { test, expect, sleep, expectOverlayBounds } = require('../harness/test')
const { newEvent, updateEvent, endEvent } = require('../harness/events')

// Time to wait before concluding that something did not happen.
const QUIET_MS = 1500

const overlayVisible = async (peek) => (await peek.overlayState()).visible

async function waitForPayloads(peek, count) {
  await expect.poll(() => peek.eventPayloads().length).toBe(count)
  return peek.eventPayloads()
}

async function showCard(peek, broker, event) {
  await broker.publish('frigate/events', event)
  await expect.poll(() => overlayVisible(peek)).toBe(true)
  return peek.overlayWindow()
}

// C1: A new detection pops the card.
test('C1 a new detection pops the card', async ({ launch, broker, frigate }) => {
  const peek = await launch()
  const P = frigate.port

  await broker.publish('frigate/events', newEvent('e1', 'front_door', 'person', 0.81, { box: [128, 72, 640, 360] }))

  const [payload] = await waitForPayloads(peek, 1)
  expect(payload).toEqual({
    id: 'e1',
    type: 'new',
    name: 'Front Door',
    label: 'person',
    score: 0.81,
    subLabel: null,
    plate: null,
    zones: [],
    box: [0.1, 0.1, 0.5, 0.5],
    streamUrl: `ws://127.0.0.1:${P}/live/webrtc/api/ws?src=front_door_main`,
    poster: `http://127.0.0.1:${P}/api/front_door/latest.jpg`,
    sound: false,
    dismiss: 8,
    clickUrl: `http://127.0.0.1:${P}/explore?event_id=e1`,
    showAllObjectsInFrame: true
  })
  await expect.poll(() => overlayVisible(peek)).toBe(true)
  expect((await peek.overlayState()).focused).toBe(false)
  const page = await peek.overlayWindow()
  await expect(page.locator('#cam')).toHaveText('Front Door')
  await expect(page.locator('.chip')).toHaveCount(1)
  await expect.poll(() => frigate.requests.some(r => r.method === 'GET' && r.path === '/api/front_door/latest.jpg')).toBe(true)
  await expect.poll(() => frigate.requests.some(r => r.method === 'WS' && r.query.src === 'front_door_main')).toBe(true)
})

// C2: The card starts at the default size and corner.
test('C2 the card starts at the default size and corner', async ({ launch, broker, frigate }) => {
  const peek = await launch()
  const wa = await peek.workArea()
  frigate.holdStream()

  await showCard(peek, broker, newEvent('e1', 'front_door'))

  await expectOverlayBounds(peek, { x: wa.x + wa.width - 404, y: wa.y + 24, width: 380, height: 300 })
})

async function waitForVideo(page) {
  await expect.poll(() => page.evaluate(() => {
    const video = document.querySelector('video-stream video')
    return !!video && video.currentTime > 0
  }), { timeout: 10000 }).toBe(true)
}

// C3: The card matches the stream aspect.
test('C3 the card matches the stream aspect', async ({ launch, broker }) => {
  const peek = await launch()
  const wa = await peek.workArea()

  const page = await showCard(peek, broker, newEvent('e1', 'front_door'))
  await waitForVideo(page)

  await expectOverlayBounds(peek, { x: wa.x + wa.width - 419, y: wa.y + 24, width: 395, height: 300 }, { timeout: 10000 })
})

// C4: Match aspect off restores the default width.
test('C4 turning match aspect off restores the default width', async ({ launch, broker }) => {
  const peek = await launch()
  const page = await showCard(peek, broker, newEvent('e1', 'front_door'))
  await waitForVideo(page)
  await expectOverlayBounds(peek, { width: 395 }, { timeout: 10000 })

  await peek.clickTray(['Match camera aspect ratio'])

  await expectOverlayBounds(peek, { width: 380 })
  expect(peek.readPrefs().dynamicSize).toBe(false)
})

// C5: A low score is ignored.
test('C5 a low score is ignored', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish('frigate/events', newEvent('e2', 'front_door', 'person', 0.5, { top_score: 0.55 }))

  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])
  expect(await overlayVisible(peek)).toBe(false)
})

// C6: minScore comes from the config.
test('C6 minScore from the config lets a lower score through', async ({ launch, broker }) => {
  const peek = await launch({ config: { minScore: 0.4 } })

  await broker.publish('frigate/events', newEvent('e2', 'front_door', 'person', 0.5))

  const [payload] = await waitForPayloads(peek, 1)
  expect(payload).toMatchObject({ type: 'new', score: 0.5 })
})

// C7: The labels filter comes from the config.
test('C7 the labels filter from the config drops other labels', async ({ launch, broker }) => {
  const peek = await launch({ config: { labels: ['car'] } })

  await broker.publish('frigate/events', newEvent('e3', 'front_door', 'person', 0.9))
  await broker.publish('frigate/events', newEvent('e4', 'front_door', 'car', 0.9))

  await waitForPayloads(peek, 1)
  expect(peek.eventPayloads().map(p => p.id)).toEqual(['e4'])
})

// C8: A disabled camera is ignored.
test('C8 a disabled camera is ignored', async ({ launch, broker }) => {
  const peek = await launch()

  await peek.clickTray(['Cameras', 'Front Door'])
  await broker.publish('frigate/events', newEvent('e5', 'front_door'))

  expect(peek.readPrefs().cameras.front_door).toBe(false)
  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])
})

// C9: End starts the dismiss timer.
test('C9 an end event starts the dismiss timer', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { dismissSeconds: 3 } })
  await showCard(peek, broker, newEvent('e6', 'front_door'))

  const endedAt = Date.now()
  await broker.publish('frigate/events', endEvent('e6', 'front_door'))
  await waitForPayloads(peek, 2)
  expect(peek.eventPayloads()[1]).toMatchObject({ type: 'end', dismiss: 3 })

  await sleep(1000)
  expect(await overlayVisible(peek)).toBe(true)
  await expect.poll(() => overlayVisible(peek), { timeout: 4500 - (Date.now() - endedAt) }).toBe(false)
})

// C10: Until dismissed stays up.
test('C10 until dismissed stays up until the close button', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { dismissSeconds: 0 } })
  const page = await showCard(peek, broker, newEvent('e7', 'front_door'))

  await broker.publish('frigate/events', endEvent('e7', 'front_door'))
  await waitForPayloads(peek, 2)
  await sleep(5000)
  expect(await overlayVisible(peek)).toBe(true)

  await page.click('#close')

  await expect.poll(() => overlayVisible(peek), { timeout: 1500 }).toBe(false)
  expect(peek.records('open-external')).toEqual([])
})

// C11: Stationary ends the card.
test('C11 a stationary object ends the card and moving again brings it back', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish('frigate/events', newEvent('e8', 'front_door'))
  await broker.publish('frigate/events', updateEvent('e8', 'front_door', 'person', 0.81, { stationary: true }))
  await broker.publish('frigate/events', updateEvent('e8', 'front_door', 'person', 0.81, { stationary: false }))

  await waitForPayloads(peek, 3)
  expect(peek.eventPayloads().map(p => p.type)).toEqual(['new', 'end', 'new'])
})

// C12: Stationary is ignored when the setting is off.
test('C12 stationary is ignored when the setting is off', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { dismissOnStationary: false } })

  await broker.publish('frigate/events', newEvent('e9', 'front_door'))
  await broker.publish('frigate/events', updateEvent('e9', 'front_door', 'person', 0.81, { stationary: true }))

  await waitForPayloads(peek, 2)
  expect(peek.eventPayloads()[1].type).toBe('update')
})

// C13: Click opens the event.
test('C13 clicking the card opens the event', async ({ launch, broker, frigate }) => {
  const peek = await launch()
  const page = await showCard(peek, broker, newEvent('e1', 'front_door'))

  await page.click('#card')

  await expect.poll(() => peek.records('open-external').map(r => r.url)).toEqual([`${frigate.url}/explore?event_id=e1`])
})

// C14: Click action live.
test('C14 click action live opens the live view of the camera', async ({ launch, broker, frigate }) => {
  const peek = await launch({ prefs: { clickAction: 'live' } })
  const page = await showCard(peek, broker, newEvent('e10', 'front_door'))

  await page.click('#card')

  await expect.poll(() => peek.records('open-external').map(r => r.url)).toEqual([`${frigate.url}/#front_door`])
})

// C15: Click action disabled.
test('C15 click action disabled makes the card inert', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { clickAction: 'disabled' } })
  const page = await showCard(peek, broker, newEvent('e11', 'front_door'))

  expect(peek.eventPayloads()[0].clickUrl).toBeNull()
  await expect(page.locator('#card')).not.toHaveClass(/clickable/)
  await page.click('#card')
  await sleep(QUIET_MS)
  expect(peek.records('open-external')).toEqual([])
})

// C16: Extras line.
test('C16 the extras line shows sub label, plate and zone', async ({ launch, broker }) => {
  const peek = await launch()

  const page = await showCard(peek, broker, newEvent('e12', 'front_door', 'person', 0.81, {
    sub_label: ['Alice', 0.9],
    recognized_license_plate: 'ABC123',
    entered_zones: ['driveway']
  }))

  await expect.poll(() => page.locator('#info').textContent()).toBe('👤 Alice   🔢 ABC123   📍 driveway')
})

// C17: All objects in frame.
test('C17 all objects in the frame get a chip', async ({ launch, broker }) => {
  const peek = await launch()
  const page = await showCard(peek, broker, newEvent('e13', 'front_door', 'person'))
  // The overlay only treats the card as shown one animation frame after the first event; a second
  // event inside that frame replaces the first chip (reported to the coordinator as a finding).
  await expect(page.locator('#card')).toHaveClass(/\bshow\b/)

  await broker.publish('frigate/events', newEvent('e14', 'front_door', 'car'))

  await expect(page.locator('.chip')).toHaveCount(2)
  expect(peek.eventPayloads()).toHaveLength(2)
})

// C18: One object when the setting is off.
test('C18 only the newest object shows when all objects is off', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { showAllObjectsInFrame: false } })
  const page = await showCard(peek, broker, newEvent('e13', 'front_door', 'person'))

  await broker.publish('frigate/events', newEvent('e14', 'front_door', 'car'))

  await waitForPayloads(peek, 2)
  await expect(page.locator('.chip')).toHaveCount(1)
  await expect(page.locator('.chip')).toContainText('Car')
})

// C19: Boxes off.
test('C19 boxes off sends no box', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { showBoundingBoxes: false } })

  await broker.publish('frigate/events', newEvent('e15', 'front_door'))

  const [payload] = await waitForPayloads(peek, 1)
  expect(payload.box).toBeNull()
})

// C20: No detect size means no box.
test('C20 a camera without a detect size gets no box', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish('frigate/events', newEvent('e16', 'garage_cam'))

  const [payload] = await waitForPayloads(peek, 1)
  expect(payload.box).toBeNull()
  expect(payload.name).toBe('Garage Cam')
})

// C21: Snapshot off.
test('C21 snapshot off sends no poster and fetches no snapshot', async ({ launch, broker, frigate }) => {
  const peek = await launch({ prefs: { snapshot: false } })

  await broker.publish('frigate/events', newEvent('e17', 'back_yard'))

  const [payload] = await waitForPayloads(peek, 1)
  expect(payload.poster).toBeNull()
  await sleep(QUIET_MS)
  expect(frigate.requests.filter(r => r.path === '/api/back_yard/latest.jpg')).toEqual([])
})

// C22: Sound flag.
test('C22 the sound setting reaches the payload', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { sound: true } })

  await broker.publish('frigate/events', newEvent('e18', 'front_door'))

  const [payload] = await waitForPayloads(peek, 1)
  expect(payload.sound).toBe(true)
})

// C23: An unknown camera is learned.
test('C23 an unknown camera is learned into the tray', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish('frigate/events', newEvent('e19', 'side_gate', 'person', 0.1))

  await expect.poll(async () => {
    const cameras = (await peek.trayMenu()).find(i => i.label === 'Cameras')
    const item = cameras.submenu.find(i => i.label === 'Side Gate')
    return item ? item.checked : null
  }).toBe(true)
  expect(peek.eventPayloads()).toEqual([])
})

// C24: Bad JSON is ignored.
test('C24 bad JSON is ignored and the next event still works', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish('frigate/events', 'not json')
  await broker.publish('frigate/events', newEvent('e20', 'front_door'))

  await waitForPayloads(peek, 1)
  expect(peek.eventPayloads()[0].id).toBe('e20')
})

// C25: Topic prefix.
test('C25 the topic prefix decides which topic is heard', async ({ launch, broker }) => {
  const peek = await launch({ config: { topicPrefix: 'nvr' } })

  await broker.publish('frigate/events', newEvent('e21', 'front_door'))
  await broker.publish('nvr/events', newEvent('e22', 'front_door'))

  await waitForPayloads(peek, 1)
  expect(peek.eventPayloads().map(p => p.id)).toEqual(['e22'])
})
