const net = require('net')

// A port nothing listens on, for tests that need a refused connection.
async function closedPort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

module.exports = { closedPort }
