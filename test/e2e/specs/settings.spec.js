const { test, expect, sleep } = require('../harness/test')
const { newEvent } = require('../harness/events')
const { setupWindowShown, spawnSecondInstance } = require('../harness/helpers-2a')

const isDarwin = process.platform === 'darwin'

const optionText = (page, list) => page.locator(`${list} [role="option"]`).allTextContents()
const optionSelected = (page, list) => page.$$eval(`${list} [role="option"]`, els => els.map(e => e.getAttribute('aria-selected')))

// The setup page fills the camera list after an async call, so wait for it before touching anything.
async function openSettings(peek, cameras = 3) {
  await peek.clickTray(['Settings…'])
  const page = await peek.setupWindow()
  await expect(page.locator('#cameraList [role="option"]')).toHaveCount(cameras)
  await expect(page.locator('#mqttPort')).not.toHaveValue('')
  return page
}

const setupTitles = async (peek) => (await peek.windowTitles()).filter(w => w.title === 'Peek Setup')

// I1: Settings shows the runtime sections.
test('I1 Settings shows the runtime sections and the cameras', async ({ launch }) => {
  const peek = await launch()

  const page = await openSettings(peek)

  await expect(page.locator('#runtime')).toBeVisible()
  await expect(page.locator('#liveSection')).toBeVisible()
  expect(await optionText(page, '#cameraList')).toEqual(['Back Yard', 'Front Door', 'Garage Cam'])
  expect(await optionSelected(page, '#cameraList')).toEqual(['true', 'true', 'true'])
})

// I2: A runtime save does not relaunch.
test('I2 saving runtime settings does not relaunch', async ({ launch }) => {
  const peek = await launch()
  const page = await openSettings(peek)

  await page.check('#sound')
  await page.selectOption('#dismiss', '15')
  await page.click('#cameraList [data-value="back_yard"]')
  await page.click('#save')

  await expect.poll(() => setupTitles(peek)).toEqual([])
  expect(peek.readPrefs()).toMatchObject({ sound: true, dismissSeconds: 15, cameras: { back_yard: false } })
  expect(peek.records('relaunch')).toEqual([])
  expect(peek.child.exitCode).toBeNull()
  expect(await peek.trayMenu()).not.toBeNull()
})

// I3: A connection change relaunches.
test('I3 changing the connection relaunches the app', async ({ launch, broker }) => {
  const peek = await launch()
  const page = await openSettings(peek)

  await page.fill('#mqttPort', String(broker.port + 1))
  await page.click('#save')

  await expect.poll(() => peek.records('relaunch').length).toBe(1)
  expect(await Promise.race([peek.exitCode, sleep(5000).then(() => 'still running')])).toBe(0)
  expect(peek.readConfig().mqtt).toBe(`mqtt://127.0.0.1:${broker.port + 1}`)
})

// I4: The camera list keeps its scroll position.
test('I4 the camera list keeps its scroll position when an item is clicked', async ({ launch, broker }) => {
  const peek = await launch()
  for (let i = 0; i < 20; i++) {
    const camera = `cam${String(i).padStart(2, '0')}`
    await broker.publish('frigate/events', newEvent(`s${i}`, camera, 'person', 0.1))
  }
  await expect.poll(async () => {
    const menu = await peek.trayMenu()
    return menu.find(i => i.label === 'Cameras').submenu.length
  }).toBe(23)
  const page = await openSettings(peek, 23)
  const list = page.locator('#cameraList')
  await list.evaluate(el => { el.scrollTop = el.scrollHeight })
  const before = await list.evaluate(el => el.scrollTop)
  expect(before).toBeGreaterThan(0)
  const last = page.locator('#cameraList [role="option"]').last()
  await expect(last).toHaveAttribute('aria-selected', 'true')

  await last.click()

  await expect(last).toHaveAttribute('aria-selected', 'false')
  expect(await list.evaluate(el => el.scrollTop)).toBe(before)
})

// I5: A second instance opens Settings in the first.
test('I5 a second instance opens Settings and exits', async ({ launch }) => {
  const peek = await launch()
  const second = spawnSecondInstance(peek)
  try {
    expect(await Promise.race([second.exitCode, sleep(5000).then(() => 'still running')])).toBe(0)
    await expect.poll(() => setupWindowShown(peek)).toBe(true)
  } finally {
    second.child.kill()
  }
})

// I6: The Dock icon opens Settings (macOS only).
test('I6 activating the app opens Settings', async ({ launch }) => {
  test.skip(!isDarwin, 'the activate event exists only on macOS')
  const peek = await launch()

  await peek.app.evaluate(({ app }) => app.emit('activate'))

  await expect.poll(() => setupWindowShown(peek)).toBe(true)
})

// I7: Cancel saves nothing.
test('I7 Cancel saves nothing', async ({ launch }) => {
  const peek = await launch({ prefs: { sound: false } })
  const page = await openSettings(peek)

  await page.check('#sound')
  await page.click('#cancel')

  await expect.poll(() => setupTitles(peek)).toEqual([])
  expect(peek.readPrefs().sound).toBe(false)
})
