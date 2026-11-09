const fs = require('fs')
const { app, Tray, Notification, shell, dialog, globalShortcut } = require('electron')

const state = globalThis.__peekE2E = {
  records: [],
  trayMenu: null,
  notifications: [],
  shortcuts: {},
  update: null
}

function record(kind, data) {
  const entry = Object.assign({ t: Date.now(), kind }, data)
  state.records.push(entry)
  // Appended synchronously so records survive the process exiting right after.
  if (process.env.PEEK_E2E_LOG) fs.appendFileSync(process.env.PEEK_E2E_LOG, JSON.stringify(entry) + '\n')
}

function installSpies() {
  const setContextMenu = Tray.prototype.setContextMenu
  Tray.prototype.setContextMenu = function (menu) {
    state.trayMenu = menu
    record('tray-menu', { labels: menu ? menu.items.filter(i => i.type !== 'separator').map(i => i.label) : [] })
    return setContextMenu.call(this, menu)
  }

  Notification.prototype.show = function () {
    state.notifications.push(this)
    record('notification', { title: this.title, body: this.body })
  }

  shell.openExternal = async (url) => {
    record('open-external', { url })
  }
  shell.openPath = async (target) => {
    record('open-path', { path: target })
    return ''
  }
  shell.showItemInFolder = (target) => {
    record('open-path', { path: target })
  }

  dialog.showMessageBox = async (...args) => {
    const opts = args[args.length - 1] || {}
    record('dialog', { type: opts.type, title: opts.title, message: opts.message, detail: opts.detail })
    return { response: 0, checkboxChecked: false }
  }

  const register = globalShortcut.register.bind(globalShortcut)
  globalShortcut.register = (accelerator, callback) => {
    const ok = register(accelerator, callback)
    record('shortcut-register', { accelerator, ok })
    if (ok) state.shortcuts[accelerator] = callback
    return ok
  }

  app.relaunch = () => record('relaunch', {})

  // Registering a login item on a developer's machine would outlive the test.
  const setLoginItemSettings = app.setLoginItemSettings.bind(app)
  app.setLoginItemSettings = (settings) => {
    record('login-item', { settings })
    if (process.platform === 'darwin') setLoginItemSettings(settings)
  }

  app.on('browser-window-created', (event, win) => {
    const wc = win.webContents
    const send = wc.send.bind(wc)
    wc.send = (channel, ...args) => {
      if (wc.getURL().endsWith('renderer/index.html')) record('ipc-to-overlay', { channel, payload: args[0] })
      return send(channel, ...args)
    }
  })
}

// Tests set globalThis.__peekE2E.update to drive what the update check and download do.
function installUpdaterStub(updater) {
  updater.getLatest = async () => {
    const update = state.update
    if (update && update.latest) return update.latest
    if (update && update.error) throw new Error(update.error)
    throw new Error('update stub not configured')
  }
  updater.download = async (url, dest, onProgress) => {
    const update = state.update
    if (!update || !update.file) throw new Error('update stub has no file')
    fs.copyFileSync(update.file, dest)
    if (onProgress) onProgress(1)
  }
}

module.exports = { installSpies, installUpdaterStub, record }
