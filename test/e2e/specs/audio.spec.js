const { test, expect, sleep } = require('../harness/test')
const { QUIET_MS, overlayVisible } = require('../harness/helpers-2a')

const SPEECH = 'frigate/front_door/audio/speech'

// E1: Audio on and off.
test('E1 audio ON pops a card without a score and OFF ends it', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish(SPEECH, 'ON')

  await expect.poll(() => peek.eventPayloads().length).toBe(1)
  expect(peek.eventPayloads()[0]).toMatchObject({ id: 'audio-front_door-speech', type: 'new', label: 'speech', score: null, box: null, zones: [] })
  await expect.poll(() => overlayVisible(peek)).toBe(true)
  const page = await peek.overlayWindow()
  await expect(page.locator('.chip')).toHaveCount(1)
  await expect(page.locator('.chip-score')).toHaveCount(0)

  await broker.publish(SPEECH, 'OFF')

  await expect.poll(() => peek.eventPayloads().length).toBe(2)
  expect(peek.eventPayloads()[1]).toMatchObject({ id: 'audio-front_door-speech', type: 'end' })
})

// E2: A repeated ON is one card.
test('E2 a repeated ON is one card', async ({ launch, broker }) => {
  const peek = await launch()

  await broker.publish(SPEECH, 'ON')
  await broker.publish(SPEECH, 'ON')

  await expect.poll(() => peek.eventPayloads().length).toBe(1)
  await sleep(QUIET_MS)
  expect(peek.eventPayloads().filter(p => p.type === 'new')).toHaveLength(1)
  expect(peek.eventPayloads()).toHaveLength(1)
})

// E3: Topics that are not labels are ignored.
test('E3 audio topics that are not labels are ignored', async ({ launch, broker }) => {
  const peek = await launch()

  for (const name of ['all', 'dBFS', 'rms', 'transcription', 'set', 'state']) {
    await broker.publish(`frigate/front_door/audio/${name}`, 'ON')
  }

  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])
  const menu = await peek.trayMenu()
  expect(menu.find(i => i.label === 'Audio labels').submenu.map(i => i.label)).toEqual(['Waiting for audio events…'])
})

// E4: An audio label can be switched off.
test('E4 switching an audio label off stops its cards', async ({ launch, broker }) => {
  const peek = await launch()
  await broker.publish(SPEECH, 'ON')
  await expect.poll(() => peek.eventPayloads().length).toBe(1)
  await broker.publish(SPEECH, 'OFF')
  await expect.poll(() => peek.eventPayloads().length).toBe(2)

  await peek.clickTray(['Audio labels', 'Speech'])
  await broker.publish(SPEECH, 'ON')

  expect(peek.readPrefs().audioLabels.speech).toBe(false)
  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toHaveLength(2)
})

// E5: A disabled camera mutes its audio.
test('E5 a disabled camera mutes its audio', async ({ launch, broker }) => {
  const peek = await launch({ prefs: { cameras: { front_door: false } } })

  await broker.publish(SPEECH, 'ON')

  await sleep(QUIET_MS)
  expect(peek.eventPayloads()).toEqual([])
})
