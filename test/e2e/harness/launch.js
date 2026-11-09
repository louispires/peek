const fs = require('fs')
const os = require('os')
const path = require('path')
const { _electron } = require('@playwright/test')

const BOOT = path.join(__dirname, 'boot.js')
// `require('electron')` returns the path of the electron binary when loaded from plain Node.
const ELECTRON = require('electron')
// The developer's installed Peek may hold Ctrl+Alt+Z, so tests register a different shortcut.
const TEST_HOTKEY = 'CommandOrControl+Alt+Shift+K'

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return null
  }
}

function pageUrl(page) {
  return page.url().replace(/\\/g, '/')
}

async function waitForPage(app, suffix, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const page = app.windows().find(p => pageUrl(p).endsWith(suffix))
    if (page) return page
    if (Date.now() > deadline) throw new Error(`no window ending in ${suffix} within ${timeoutMs} ms`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

// Runs in the main process.
function serializeMenu(menu) {
  const walk = (m) => m.items.map(i => ({
    label: i.label,
    type: i.type,
    checked: i.checked,
    enabled: i.enabled,
    submenu: i.submenu ? walk(i.submenu) : null
  }))
  return menu ? walk(menu) : null
}

let launchCount = 0

// config: object to write as config.json; omit it for a first-run launch.
// prefs: object merged over { liveHotkey } and written as preferences.json.
// userData: reuse a folder from an earlier launch (relaunch) instead of making a fresh one.
async function launchPeek({ config, prefs, env, userData: reuseUserData, timeout = 30000 } = {}) {
  const dir = reuseUserData ? path.dirname(reuseUserData) : fs.mkdtempSync(path.join(os.tmpdir(), 'peek-e2e-'))
  const userData = reuseUserData || path.join(dir, 'userData')
  const logFile = path.join(dir, `events-${++launchCount}.jsonl`)
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(logFile, '')
  if (!reuseUserData) {
    if (config) fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(config, null, 2))
    const merged = Object.assign({ liveHotkey: TEST_HOTKEY }, prefs)
    fs.writeFileSync(path.join(userData, 'preferences.json'), JSON.stringify(merged, null, 2))
  }

  const launchEnv = Object.assign({}, process.env, env, { PEEK_E2E_USERDATA: userData, PEEK_E2E_LOG: logFile })
  // Set by some parent tools; with it the binary would run as plain Node and never open a window.
  delete launchEnv.ELECTRON_RUN_AS_NODE
  const app = await _electron.launch({ executablePath: ELECTRON, args: [BOOT], env: launchEnv, timeout })

  const child = app.process()
  const exitCode = new Promise(resolve => child.once('exit', code => resolve(code)))

  const handle = {
    app,
    // Playwright cannot hand the process out again once the app has closed, so it is kept here.
    child,
    dir,
    userData,
    logFile,
    exitCode,

    log() {
      return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    },
    records(kind) {
      return handle.log().filter(r => r.kind === kind)
    },
    // The `frigate-event` payloads sent to the overlay, oldest first.
    eventPayloads() {
      return handle.records('ipc-to-overlay').filter(r => r.channel === 'frigate-event').map(r => r.payload)
    },
    overlayWindow() {
      return waitForPage(app, 'renderer/index.html', 10000)
    },
    setupWindow() {
      return waitForPage(app, 'setup/setup.html', 10000)
    },
    // Visibility, focus and bounds of the overlay window as the main process sees them.
    overlayState() {
      return app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().replace(/\\/g, '/').endsWith('renderer/index.html'))
        return win ? { visible: win.isVisible(), focused: win.isFocused(), bounds: win.getBounds() } : null
      })
    },
    // Titles of every open window, including hidden ones.
    windowTitles() {
      return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ title: w.getTitle(), url: w.webContents.getURL() })))
    },
    scaleFactor() {
      return app.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor)
    },
    workArea() {
      return app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
    },
    // The latest tray menu as { label, type, checked, enabled, submenu } objects, or null before one exists.
    trayMenu() {
      return app.evaluate((electron, fnSource) => {
        const serialize = new Function('return ' + fnSource)()
        return serialize(globalThis.__peekE2E.trayMenu)
      }, serializeMenu.toString())
    },
    // clickTray(['Cameras', 'Front Door']) runs the item's click handler in the main process.
    // Electron's MenuItem.click already flips a checkbox's `checked`, so nothing is flipped here.
    clickTray(labels) {
      return app.evaluate((electron, trail) => {
        let menu = globalThis.__peekE2E.trayMenu
        let item = null
        for (const label of trail) {
          if (!menu) throw new Error('no submenu before ' + label)
          item = menu.items.find(i => i.label === label)
          if (!item) throw new Error('no tray item ' + label + ' in ' + menu.items.map(i => i.label).join(' | '))
          menu = item.submenu
        }
        item.click()
      }, labels)
    },
    readConfig() {
      return readJson(path.join(userData, 'config.json'))
    },
    readPrefs() {
      return readJson(path.join(userData, 'preferences.json'))
    }
  }
  return handle
}

async function closePeek(handle, { keepFiles = false } = {}) {
  const child = handle.child
  if (child.exitCode === null && child.signalCode === null) {
    const closed = handle.app.close().catch(() => {})
    const timer = new Promise(resolve => setTimeout(resolve, 8000, 'timeout'))
    if (await Promise.race([closed, timer]) === 'timeout') child.kill()
  }
  if (!keepFiles) fs.rmSync(handle.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

// Closes the app and starts it again on the same userData.
async function relaunch(handle, opts = {}) {
  await closePeek(handle, { keepFiles: true })
  return launchPeek(Object.assign({}, opts, { userData: handle.userData }))
}

module.exports = { launchPeek, closePeek, relaunch, TEST_HOTKEY }
