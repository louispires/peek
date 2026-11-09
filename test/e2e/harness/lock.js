const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const STALE_MS = 30 * 60 * 1000
const RETRY_MS = 30 * 1000

function run(args) {
  return execFileSync('git', args, { cwd: __dirname, encoding: 'utf8' }).trim()
}

// The lock lives in the main checkout's .plans folder so every worktree shares it.
function lockPath() {
  if (process.env.PEEK_E2E_LOCK) return process.env.PEEK_E2E_LOCK
  const common = run(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  return path.join(path.dirname(common), '.plans', 'e2e.lock')
}

function branchName() {
  try {
    return run(['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch (err) {
    return 'unknown'
  }
}

function isStale(file) {
  try {
    return Date.now() - fs.statSync(file).mtimeMs > STALE_MS
  } catch (err) {
    return true
  }
}

function tryCreate(file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${branchName()} ${os.hostname()} pid ${process.pid} ${new Date().toISOString()}\n`, { flag: 'wx' })
    return true
  } catch (err) {
    if (err.code === 'EEXIST') return false
    throw err
  }
}

// CI runs on a clean machine, so only local runs take the lock.
async function acquireLock() {
  if (process.env.CI) return null
  const file = lockPath()
  for (;;) {
    if (tryCreate(file)) return file
    if (isStale(file)) {
      fs.rmSync(file, { force: true })
      continue
    }
    console.log(`[e2e] machine lock ${file} is held; retrying in 30 s`)
    await new Promise(resolve => setTimeout(resolve, RETRY_MS))
  }
}

function releaseLock(file) {
  if (file) fs.rmSync(file, { force: true })
}

module.exports = { acquireLock, releaseLock, lockPath }
