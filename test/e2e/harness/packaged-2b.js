// Install and launch helpers for the packaged project. They touch the real default userData folder
// (~/Library/Application Support/Peek), so every entry point refuses to run outside macOS CI.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawn } = require('child_process')
const { _electron } = require('@playwright/test')

const packagedEnabled = process.platform === 'darwin' && !!process.env.CI

const ROOT = path.join(__dirname, '..', '..', '..')
const DIST = path.join(ROOT, 'dist')
const INSTALLED_APP = path.join(os.homedir(), 'Applications', 'Peek.app')
const INSTALLED_EXE = path.join(INSTALLED_APP, 'Contents', 'MacOS', 'Peek')
const USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'Peek')

function assertAllowed() {
  if (!packagedEnabled) throw new Error('the packaged project runs only on macOS CI; refusing to touch the real Peek folder')
}

function distFiles(pattern) {
  if (!fs.existsSync(DIST)) return []
  return fs.readdirSync(DIST).filter(name => pattern.test(name)).map(name => path.join(DIST, name))
}

const dmgFiles = () => distFiles(/\.dmg$/)
const zipFiles = () => distFiles(/-mac\.zip$/)

// Copies Peek.app out of the dmg, the way a user drags it to Applications.
function installApp() {
  assertAllowed()
  const [dmg] = dmgFiles()
  if (!dmg) throw new Error('no .dmg in ' + DIST + '; run npm run dist:mac first')
  const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'peek-dmg-'))
  execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mount])
  try {
    fs.rmSync(INSTALLED_APP, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(INSTALLED_APP), { recursive: true })
    // ditto keeps the symlinks and signature that a plain copy can break.
    execFileSync('ditto', [path.join(mount, 'Peek.app'), INSTALLED_APP])
  } finally {
    execFileSync('hdiutil', ['detach', mount, '-force'])
    fs.rmSync(mount, { recursive: true, force: true })
  }
}

function killInstalled() {
  assertAllowed()
  try {
    execFileSync('pkill', ['-f', INSTALLED_APP + '/Contents'])
  } catch (err) {
    // pkill exits 1 when nothing matched.
  }
}

function wipeUserData() {
  assertAllowed()
  fs.rmSync(USER_DATA, { recursive: true, force: true })
}

function cleanEnv() {
  const env = Object.assign({}, process.env)
  // With it the binary would run as plain Node and never open a window.
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

// Starts the installed app on a freshly wiped default userData folder.
async function launchInstalled({ config, prefs } = {}) {
  assertAllowed()
  killInstalled()
  wipeUserData()
  fs.mkdirSync(USER_DATA, { recursive: true })
  if (config) fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify(config, null, 2))
  fs.writeFileSync(path.join(USER_DATA, 'preferences.json'), JSON.stringify(prefs || {}, null, 2))

  const app = await _electron.launch({ executablePath: INSTALLED_EXE, env: cleanEnv(), timeout: 30000 })
  const child = app.process()
  const exitCode = new Promise(resolve => child.once('exit', code => resolve(code)))
  return {
    app,
    exitCode,
    pageEnding: async (suffix, timeoutMs = 10000) => {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const page = app.windows().find(p => p.url().replace(/\\/g, '/').endsWith(suffix))
        if (page) return page
        if (Date.now() > deadline) throw new Error(`no window ending in ${suffix} within ${timeoutMs} ms`)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    },
    readPrefs: () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'preferences.json'), 'utf8')),
    // A second copy of the app hands over to the running one, which then opens Settings.
    openSettings: () => {
      spawn(INSTALLED_EXE, [], { detached: true, stdio: 'ignore', env: cleanEnv() }).unref()
    }
  }
}

async function closeInstalled(handle) {
  if (!handle) return
  await Promise.race([handle.app.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 8000))])
  killInstalled()
}

module.exports = {
  packagedEnabled,
  ROOT,
  INSTALLED_APP,
  INSTALLED_EXE,
  USER_DATA,
  assertAllowed,
  dmgFiles,
  zipFiles,
  installApp,
  killInstalled,
  launchInstalled,
  closeInstalled
}
