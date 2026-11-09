const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { test, expect } = require('../harness/test')
const { newEvent } = require('../harness/events')
const pkg = require('../../../package.json')
const { packagedEnabled, INSTALLED_APP, assertAllowed, dmgFiles, zipFiles, launchInstalled, closeInstalled } = require('../harness/packaged-2b')

test.describe('packaged app', () => {
  test.skip(!packagedEnabled, 'the packaged project runs only on macOS CI')

  let peek = null
  test.beforeEach(() => assertAllowed())
  test.afterEach(async () => {
    await closeInstalled(peek)
    peek = null
  })

  const verifySealed = (bundle) => execFileSync('codesign', ['--verify', '--deep', '--strict', bundle])

  async function startApp(frigate, broker, prefs) {
    peek = await launchInstalled({ config: { frigateUrl: frigate.url, mqtt: broker.url }, prefs })
    await expect.poll(() => broker.subscriptions().some(s => s.topic === 'frigate/events'), { timeout: 15000 }).toBe(true)
    const overlay = await peek.pageEnding('renderer/index.html')
    await overlay.waitForFunction(() => !!customElements.get('video-stream'), null, { timeout: 15000 })
  }

  // A1: Build artifacts.
  test('A1 the build produced one dmg and one zip for this version', async () => {
    const names = (files) => files.map(f => path.basename(f))

    expect(names(dmgFiles())).toHaveLength(1)
    expect(names(zipFiles())).toHaveLength(1)
    for (const name of [...names(dmgFiles()), ...names(zipFiles())]) {
      expect(name).toContain(pkg.version)
      expect(name).toContain('arm64')
    }
  })

  // A2: Installed app is sealed.
  test('A2 the installed app is sealed and has the right identity', async () => {
    verifySealed(INSTALLED_APP)

    const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(INSTALLED_APP, 'Contents', 'Info.plist')], { encoding: 'utf8' }))
    expect(plist.CFBundleShortVersionString).toBe(pkg.version)
    expect(plist.CFBundleIdentifier).toBe('io.github.peek.app')
  })

  // A3: Downloaded zip is not "damaged".
  test('A3 the unzipped app still verifies with the quarantine flag set', async () => {
    const [zip] = zipFiles()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peek-zip-'))
    try {
      execFileSync('ditto', ['-x', '-k', zip, dir])
      const bundle = path.join(dir, 'Peek.app')
      execFileSync('xattr', ['-w', 'com.apple.quarantine', '0081;00000000;Safari;', bundle])

      verifySealed(bundle)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // A4: Packaged app runs.
  test('A4 the packaged app runs hidden from the Dock and shows the card', async ({ frigate, broker }) => {
    await startApp(frigate, broker)

    expect(await peek.app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await peek.app.evaluate(({ app }) => app.dock.isVisible())).toBe(false)

    await broker.publish('frigate/events', newEvent('a1', 'front_door', 'person', 0.8))

    await expect.poll(() => peek.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(w => w.webContents.getURL().endsWith('renderer/index.html') && w.isVisible())
    ), { timeout: 5000 }).toBe(true)
  })

  // A5: Open at login.
  test('A5 open at login turns on and off', async ({ frigate, broker }) => {
    const openAtLogin = () => peek.app.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin)
    const toggle = async (checked) => {
      peek.openSettings()
      const page = await peek.pageEnding('setup/setup.html')
      await expect(page.locator('#openAtLogin')).toBeVisible()
      await page.setChecked('#openAtLogin', checked)
      await page.click('#save')
      await expect.poll(() => peek.app.windows().filter(p => p.url().endsWith('setup/setup.html')).length).toBe(0)
    }
    await startApp(frigate, broker)

    await toggle(true)
    await expect.poll(openAtLogin).toBe(true)

    await toggle(false)
    await expect.poll(openAtLogin).toBe(false)
  })
})
