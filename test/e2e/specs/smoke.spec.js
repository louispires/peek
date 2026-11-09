const { test, expect } = require('../harness/test')
const { newEvent } = require('../harness/events')

test('smoke: a detection makes the overlay window visible', async ({ launch, broker }) => {
  const peek = await launch()
  await broker.publish('frigate/events', newEvent('s1', 'front_door'))
  await expect.poll(async () => (await peek.overlayState()).visible).toBe(true)
  expect(peek.eventPayloads()).toHaveLength(1)
})
