const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.CSC_NAME) return
  // A universal build packs x64 and arm64 into "-temp" dirs and merges them.
  // Signing those first makes their files differ and breaks the merge, so
  // only the merged app gets signed.
  if (context.appOutDir.endsWith('-temp')) return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log('[afterPack] ad-hoc re-signing ' + appPath)
  execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
