const path = require('path')

function sameOrInside(child, parent) {
  const norm = (p) => path.resolve(p).toLowerCase()
  const rel = path.relative(norm(parent), norm(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// Keeps a developer's real Peek config safe: a missing or wrong variable must stop the run.
// appDataDir is the OS application-data folder (%APPDATA%, ~/Library/Application Support).
function assertSafeUserData(userData, appDataDir) {
  if (!userData) throw new Error('PEEK_E2E_USERDATA is not set; refusing to start')
  if (!path.isAbsolute(userData)) throw new Error('PEEK_E2E_USERDATA must be an absolute path: ' + userData)
  const realFolders = [path.join(appDataDir, 'Peek'), path.join(appDataDir, 'peek')]
  if (realFolders.some(real => sameOrInside(userData, real))) {
    throw new Error('PEEK_E2E_USERDATA points at the real Peek folder; refusing to start: ' + userData)
  }
  return userData
}

module.exports = { assertSafeUserData }
