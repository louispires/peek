const { acquireLock, releaseLock } = require('./lock')
const { packagedEnabled, installApp } = require('./packaged-2b')

module.exports = async () => {
  const file = await acquireLock()
  if (packagedEnabled) installApp()
  return async () => releaseLock(file)
}
