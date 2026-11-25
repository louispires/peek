const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// A small rolling log in the config folder, so problems that only show up after a
// restart can be traced without a console attached.
const MAX_BYTES = 512 * 1024
let file = null

function log(message) {
  console.log('[peek] ' + message)
  try {
    if (!file) file = path.join(app.getPath('userData'), 'peek.log')
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, file + '.1')
    } catch (err) {}
    fs.appendFileSync(file, new Date().toISOString() + ' ' + message + '\n')
  } catch (err) {}
}

module.exports = { log }
