// Entry point for the behaviour project: runs the real src/main.js inside a stock Electron,
// pointed at a throwaway userData folder and with the OS-facing calls spied on.
const { app } = require('electron')
const pkg = require('../../../package.json')
const { assertSafeUserData } = require('./userdata-guard')

app.setName('Peek')
if (typeof app.setVersion === 'function') app.setVersion(pkg.version)

app.setPath('userData', assertSafeUserData(process.env.PEEK_E2E_USERDATA, app.getPath('appData')))

const spies = require('./spies')
spies.installSpies()
spies.installUpdaterStub(require('../../../src/updater'))
require('../../../src/main.js')
