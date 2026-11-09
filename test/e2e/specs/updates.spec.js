const { test, expect, sleep } = require('../harness/test')
const pkg = require('../../../package.json')

const NEWER = {
  version: '99.0.0',
  notes: 'Test notes',
  assets: [
    { name: 'Peek-99.0.0-arm64-mac.zip', url: 'stub' },
    { name: 'Peek-Setup-99.0.0.exe', url: 'stub' }
  ]
}

function setUpdate(peek, update) {
  return peek.app.evaluate((electron, value) => { globalThis.__peekE2E.update = value }, update)
}

async function updateWindow(peek) {
  await expect.poll(() => peek.app.windows().some(p => p.url().endsWith('update/update.html'))).toBe(true)
  return peek.app.windows().find(p => p.url().endsWith('update/update.html'))
}

const updateWindowTitles = async (peek) => (await peek.windowTitles()).filter(w => w.title === 'Update Peek')

async function openUpdateWindow(peek) {
  await setUpdate(peek, { latest: NEWER })
  await peek.clickTray(['Check for updates…'])
  const page = await updateWindow(peek)
  await expect(page.locator('#next')).toHaveText('99.0.0')
  return page
}

// K1: Up to date.
test('K1 an up-to-date check says so', async ({ launch }) => {
  const peek = await launch()
  await setUpdate(peek, { latest: { version: pkg.version, notes: '', assets: [] } })

  await peek.clickTray(['Check for updates…'])

  await expect.poll(() => peek.records('dialog')).toEqual([
    expect.objectContaining({ type: 'info', message: 'You are up to date.', detail: `Peek ${pkg.version} is the latest version.` })
  ])
})

// K2: Check fails.
test('K2 a failed check shows the error', async ({ launch }) => {
  const peek = await launch()
  await setUpdate(peek, { error: 'HTTP 503' })

  await peek.clickTray(['Check for updates…'])

  await expect.poll(() => peek.records('dialog')).toEqual([
    expect.objectContaining({ type: 'error', message: 'Could not check for updates.', detail: 'HTTP 503' })
  ])
})

// K3: Newer version, skip.
test('K3 skipping a newer version saves it and closes the window', async ({ launch }) => {
  const peek = await launch()
  const page = await openUpdateWindow(peek)
  await expect(page.locator('#notes')).toContainText('Test notes')

  await page.click('#skip')

  await expect.poll(() => (peek.readPrefs() || {}).skipVersion).toBe('99.0.0')
  await expect.poll(() => updateWindowTitles(peek)).toEqual([])
})

// K4: Later.
test('K4 later closes the window and keeps the skipped version', async ({ launch }) => {
  const peek = await launch({ prefs: { skipVersion: '98.0.0' } })
  const page = await openUpdateWindow(peek)

  await page.click('#later')

  await expect.poll(() => updateWindowTitles(peek)).toEqual([])
  expect(peek.readPrefs().skipVersion).toBe('98.0.0')
})

// K5: Launch check notifies once.
test('K5 the launch check notifies once across launches', async ({ launch }) => {
  const first = await launch({ prefs: { autoUpdate: true }, ready: false })
  // The launch check runs 4 s after startup; the stub must be set before.
  await setUpdate(first, { latest: NEWER })

  await expect.poll(() => first.records('notification'), { timeout: 10000 }).toEqual([
    expect.objectContaining({ title: 'Update available', body: 'Peek 99.0.0 is ready. Click to see what’s new.' })
  ])
  expect(first.readPrefs().lastNotify.version).toBe('99.0.0')

  const second = await launch.relaunch(first, { ready: false })
  await setUpdate(second, { latest: NEWER })
  await sleep(6000)

  expect(second.records('notification')).toEqual([])
  expect(second.readPrefs().lastNotify.version).toBe('99.0.0')
})

// K6: Skipped version stays quiet.
test('K6 a skipped version raises no notification', async ({ launch }) => {
  const peek = await launch({ prefs: { autoUpdate: true, skipVersion: '99.0.0' }, ready: false })
  await setUpdate(peek, { latest: NEWER })

  await sleep(6000)

  expect(peek.records('notification')).toEqual([])
})
