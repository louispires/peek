const { test, expect, sleep } = require('../harness/test')
const { newEvent, updateEvent, endEvent } = require('../harness/events')
const { QUIET_MS, trayZoneLabels } = require('../harness/helpers-2a')

const DRIVEWAY = 'Driveway (Front Door)'
const ANYWHERE = 'Anywhere (no zone filter)'
const ZONES_MENU = 'Only pop up in zones'

async function zoneItems(peek) {
  const menu = await peek.trayMenu()
  return menu.find(i => i.label === ZONES_MENU).submenu
}

// D1: Zones from the Frigate config.
test('D1 zones from the Frigate config fill the tray in order', async ({ launch }) => {
  const peek = await launch()

  expect(await trayZoneLabels(peek)).toEqual([ANYWHERE, '---', DRIVEWAY, 'Porch (Back Yard, Front Door)'])
  const items = await zoneItems(peek)
  expect(items.filter(i => i.type === 'checkbox').map(i => [i.label, i.checked])).toEqual([
    [ANYWHERE, true],
    [DRIVEWAY, false],
    ['Porch (Back Yard, Front Door)', false]
  ])
})

// D2: The first update inside the zone pops the card.
test('D2 the first update inside the zone pops the card', async ({ launch, broker }) => {
  const peek = await launch()

  await peek.clickTray([ZONES_MENU, DRIVEWAY])

  expect(peek.readPrefs().zoneFilter).toEqual(['driveway'])
  const items = await zoneItems(peek)
  expect(items.find(i => i.label === ANYWHERE).checked).toBe(false)
  expect(items.find(i => i.label === DRIVEWAY).checked).toBe(true)

  await broker.publish('frigate/events', newEvent('z1', 'front_door', 'person', 0.8))
  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])

  await broker.publish('frigate/events', updateEvent('z1', 'front_door', 'person', 0.8, { current_zones: ['Driveway'] }))
  await expect.poll(() => peek.eventPayloads().length).toBe(1)
  expect(peek.eventPayloads()[0]).toMatchObject({ id: 'z1', type: 'new' })

  await broker.publish('frigate/events', endEvent('z1', 'front_door', 'person', 0.8))
  await expect.poll(() => peek.eventPayloads().length).toBe(2)
  expect(peek.eventPayloads()[1]).toMatchObject({ id: 'z1', type: 'end' })
})

// D3: Other zones do not pop.
test('D3 an event in another zone does not pop', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { zoneFilter: ['driveway'] } })

  await broker.publish('frigate/events', newEvent('z2', 'back_yard', 'person', 0.8, { entered_zones: ['Porch'] }))

  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])
})

// D4: A low score inside the zone retries on the next update.
test('D4 a low score inside the zone retries on the next update', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { zoneFilter: ['driveway'] } })

  await broker.publish('frigate/events', updateEvent('z3', 'front_door', 'person', 0.4, { current_zones: ['driveway'] }))
  await broker.publish('frigate/events', updateEvent('z3', 'front_door', 'person', 0.8, { current_zones: ['driveway'] }))

  await expect.poll(() => peek.eventPayloads().length).toBeGreaterThan(0)
  await sleep(QUIET_MS)
  const payloads = peek.eventPayloads()
  expect(payloads).toHaveLength(1)
  expect(payloads[0]).toMatchObject({ id: 'z3', type: 'new', score: 0.8 })
})

// D5: Audio is suppressed under a filter.
test('D5 audio is suppressed under a zone filter', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { zoneFilter: ['driveway'] } })

  await broker.publish('frigate/front_door/audio/speech', 'ON')

  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])
})

// D6: Anywhere clears the filter.
test('D6 Anywhere clears the filter', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { zoneFilter: ['driveway'] } })

  await peek.clickTray([ZONES_MENU, ANYWHERE])

  expect(peek.readPrefs().zoneFilter).toEqual([])
  await broker.publish('frigate/events', newEvent('z4', 'front_door', 'person', 0.8))
  await expect.poll(() => peek.eventPayloads().length).toBe(1)
  expect(peek.eventPayloads()[0]).toMatchObject({ id: 'z4', type: 'new' })
})

// D7: Zones are learned from events.
test('D7 zones are learned from events', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish('frigate/events', newEvent('z5', 'back_yard', 'person', 0.8, { entered_zones: ['Gate'] }))

  await expect.poll(() => trayZoneLabels(peek)).toContain('Gate (Back Yard)')
})

// D8: A saved filter is restored.
test('D8 a saved filter is restored in the tray and in Settings', async ({ launch }) => {
  const peek = await launch({ prefs: { zoneFilter: ['driveway'] } })

  const items = await zoneItems(peek)
  expect(items.find(i => i.label === DRIVEWAY).checked).toBe(true)
  expect(items.find(i => i.label === ANYWHERE).checked).toBe(false)

  await peek.clickTray(['Settings…'])
  const settings = await peek.setupWindow()
  await expect(settings.locator('#zoneList [data-value="driveway"]')).toHaveAttribute('aria-selected', 'true')
})
