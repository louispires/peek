const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { test, expect } = require('../harness/test')
const { packagedEnabled, INSTALLED_APP, assertAllowed, zipFiles, installApp, launchInstalled, closeInstalled, killInstalled } = require('../harness/packaged-2b')

test.describe('packaged in-place update', () => {
  test.skip(!packagedEnabled, 'the packaged project runs only on macOS CI')

  test.beforeEach(() => assertAllowed())

  // A6: In-place update.
  test('A6 the update replaces the installed app and restarts it', async ({ frigate, broker }) => {
    test.setTimeout(180000)
    const marker = path.join(INSTALLED_APP, 'Contents', 'Resources', 'e2e-marker')
    const [zip] = zipFiles()
    let peek = null
    try {
      installApp()
      fs.writeFileSync(marker, 'old bundle')
      peek = await launchInstalled({
        config: { frigateUrl: frigate.url, mqtt: broker.url },
        prefs: { autoUpdate: true }
      })

      // The launch check runs 4 s after start, so the stubs go in at once.
      // The updater module is the one main.js calls through, so replacing its functions redirects the check.
      await peek.app.evaluate(({ Notification }, realZip) => {
        const fs = process.mainModule.require('fs')
        const updater = process.mainModule.require('./updater')
        updater.getLatest = async () => ({
          version: '99.0.0',
          notes: 'Test notes',
          assets: [{ name: 'Peek-99.0.0-arm64-mac.zip', url: 'stub' }]
        })
        updater.download = async (url, dest, onProgress) => {
          fs.copyFileSync(realZip, dest)
          if (onProgress) onProgress(1)
        }
        // Clicking the notification is what opens the update window.
        Notification.prototype.show = function () { this.emit('click') }
      }, zip)

      const page = await peek.pageEnding('update/update.html', 15000)
      await expect(page.locator('#next')).toHaveText('99.0.0')
      await page.click('#install')

      expect(await Promise.race([peek.exitCode, new Promise(resolve => setTimeout(resolve, 60000, 'still running'))])).not.toBe('still running')

      await expect.poll(() => fs.existsSync(marker), { timeout: 30000 }).toBe(false)
      execFileSync('codesign', ['--verify', '--deep', '--strict', INSTALLED_APP])
      await expect.poll(() => {
        try {
          return execFileSync('pgrep', ['-f', INSTALLED_APP + '/Contents/MacOS/Peek'], { encoding: 'utf8' }).trim().length > 0
        } catch (err) {
          return false
        }
      }, { timeout: 30000 }).toBe(true)
    } finally {
      killInstalled()
      await closeInstalled(peek)
      // The next test run expects an untouched install.
      installApp()
    }
  })
})
