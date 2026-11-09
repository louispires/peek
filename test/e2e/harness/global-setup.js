const { acquireLock, releaseLock } = require('./lock')

module.exports = async () => {
  const file = await acquireLock()
  return async () => releaseLock(file)
}
