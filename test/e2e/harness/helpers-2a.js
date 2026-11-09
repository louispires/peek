// Small helpers shared by the wave 2a specs. Nothing here changes the harness behaviour.
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { expect } = require('./test')
const { TEST_HOTKEY } = require('./launch')

// Time to wait before concluding that something did not happen.
const QUIET_MS = 1500

// `require('electron')` returns the path of the electron binary when loaded from plain Node.
const ELECTRON = require('electron')
const BOOT = path.join(__dirname, 'boot.js')

const overlayVisible = async (peek) => (await peek.overlayState()).visible

// Payloads sent to the overlay on one channel (`live-open`, `live-close`, ...), oldest first.
function overlayRecords(peek, channel) {
  return peek.records('ipc-to-overlay').filter(r => r.channel === channel).map(r => r.payload)
}

// Runs the callback the app registered for a shortcut, as a key press would.
function pressShortcut(peek, accelerator = TEST_HOTKEY) {
  return peek.app.evaluate((electron, accel) => {
    const callback = globalThis.__peekE2E.shortcuts[accel]
    if (!callback) throw new Error('no shortcut registered for ' + accel)
    callback()
  }, accelerator)
}

function isShortcutRegistered(peek, accelerator) {
  return peek.app.evaluate(({ globalShortcut }, accel) => globalShortcut.isRegistered(accel), accelerator)
}

// The harness tray serialisation has no accelerator, so it is read from the live menu.
function trayAccelerator(peek, label) {
  return peek.app.evaluate((electron, name) => {
    const item = globalThis.__peekE2E.trayMenu.items.find(i => i.label === name)
    return item.accelerator || null
  }, label)
}

function overlayMovable(peek) {
  return peek.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().replace(/\\/g, '/').endsWith('renderer/index.html'))
    return win.isMovable()
  })
}

// Moves the overlay the way a drag would, in the main process.
function moveOverlay(peek, bounds) {
  return peek.app.evaluate(({ BrowserWindow }, b) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().replace(/\\/g, '/').endsWith('renderer/index.html'))
    win.setBounds(b)
  }, bounds)
}

function primaryDisplayId(peek) {
  return peek.app.evaluate(({ screen }) => screen.getPrimaryDisplay().id)
}

function setupWindowShown(peek) {
  return peek.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w => w.getTitle() === 'Peek Setup' && w.isVisible()))
}

async function trayZoneLabels(peek) {
  const menu = await peek.trayMenu()
  const zones = menu.find(i => i.label === 'Only pop up in zones')
  return zones.submenu.map(i => (i.type === 'separator' ? '---' : i.label))
}

// The renderer adds `show` one frame after `live`; closing before that is ignored.
async function waitForLiveCard(page) {
  await expect(page.locator('#card')).toHaveClass(/\blive\b/)
  await expect(page.locator('#card')).toHaveClass(/\bshow\b/)
}

// Starts a second Peek process on the same userData folder.
function spawnSecondInstance(peek) {
  const env = Object.assign({}, process.env, {
    PEEK_E2E_USERDATA: peek.userData,
    PEEK_E2E_LOG: path.join(peek.dir, 'second-instance.jsonl')
  })
  delete env.ELECTRON_RUN_AS_NODE
  fs.writeFileSync(env.PEEK_E2E_LOG, '')
  const child = spawn(ELECTRON, [BOOT], { env, stdio: 'ignore' })
  const exitCode = new Promise(resolve => child.once('exit', code => resolve(code)))
  return { child, exitCode }
}

module.exports = {
  QUIET_MS,
  overlayVisible,
  overlayRecords,
  pressShortcut,
  isShortcutRegistered,
  trayAccelerator,
  overlayMovable,
  moveOverlay,
  primaryDisplayId,
  setupWindowShown,
  trayZoneLabels,
  waitForLiveCard,
  spawnSecondInstance
}
