const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const path = require('node:path')
const os = require('node:os')
const { randomUUID } = require('node:crypto')
const loadTs = require('./download-loader.cjs')

function packet(op, data) {
  const body = Buffer.from(JSON.stringify(data)), header = Buffer.alloc(8)
  header.writeInt32LE(op); header.writeInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

async function fixture(t, options = {}) {
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\eclipse-discord-test-${randomUUID()}` : path.join(os.tmpdir(), `eclipse-discord-${randomUUID()}.sock`)
  const sockets = new Set(), messages = [], waiting = [], pongs = []
  let connections = 0, delayReady = false
  const server = net.createServer(socket => {
    connections++; sockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
    let buffer = Buffer.alloc(0)
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 8 && buffer.length >= 8 + buffer.readInt32LE(4)) {
        const op = buffer.readInt32LE(), size = buffer.readInt32LE(4)
        const value = JSON.parse(buffer.subarray(8, 8 + size))
        buffer = buffer.subarray(8 + size)
        if (op === 0) {
          const ready = () => {
            const body = packet(1, { cmd: 'DISPATCH', evt: 'READY', data: { user: { id: 'fixture' } } })
            if (options.fragmented) { socket.write(body.subarray(0, 3)); setTimeout(() => socket.write(body.subarray(3)), 10) }
            else socket.write(body)
          }
          if (delayReady) waiting.push(ready)
          else ready()
        } else if (op === 1) {
          messages.push(value)
          if (options.oversized) {
            const header = Buffer.alloc(8); header.writeUInt32LE(1); header.writeUInt32LE(1024 * 1024 + 1, 4)
            socket.write(header); continue
          }
          if (options.rejectAssets && value.args.activity?.assets) {
            socket.write(packet(1, { cmd: value.cmd, nonce: value.nonce, evt: 'ERROR', data: { code: 4000, message: 'Invalid activity image' } }))
            continue
          }
          const ack = packet(1, { cmd: value.cmd, nonce: value.nonce, data: value.args })
          if (options.coalesced) socket.write(Buffer.concat([packet(3, { heartbeat: 'fixture' }), ack]))
          else if (options.fragmented) {
            const split = Math.max(5, ack.indexOf(Buffer.from('🎮')) + 2)
            socket.write(ack.subarray(0, split)); setTimeout(() => socket.write(ack.subarray(split)), 10)
          } else socket.write(ack)
        } else if (op === 2) socket.end()
        else if (op === 4) pongs.push(value)
      }
    })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve) })
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)) })
  // Redirect the native Discord transport to an isolated local server.
  // No real Discord instance, user account or presence is contacted.
  const connect = net.createConnection.bind(net)
  t.mock.method(net, 'createConnection', (destination, listener) => {
    assert.match(destination, /discord-ipc-/)
    return connect(endpoint, listener)
  })
  const load = loadTs()
  const { DiscordConnection } = load('electron/discordConnection.ts')
  const { createDiscordClient } = load('electron/discordClient.ts')
  const connection = new DiscordConnection(createDiscordClient, 20)
  t.after(() => connection.stop())
  return { connection, messages, sockets, waiting, pongs, connections: () => connections, delayReady: () => { delayReady = true } }
}

async function until(predicate, timeout = 3000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Discord IPC fixture did not reach the expected state')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test('native Discord IPC publishes, reconnects with the same session and clears the wire activity', { timeout: 12_000 }, async t => {
  const f = await fixture(t)
  const start = new Date(Date.now() - 60_000)
  const animatedLogo = 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/eclipse-logo.gif'
  f.connection.publish({ name: 'Rocket League with Eclipse', statusDisplayType: 0, details: 'Playing Rocket League', state: 'with Eclipse', startTimestamp: start, smallImageKey: animatedLogo, smallImageText: 'Eclipse' }, '1534714200813863136')
  await until(() => f.messages.length === 1)
  assert.equal(f.messages[0].cmd, 'SET_ACTIVITY')
  assert.equal(f.messages[0].args.activity.details, 'Playing Rocket League')
  assert.equal(f.messages[0].args.activity.name, 'Rocket League with Eclipse')
  assert.equal(f.messages[0].args.activity.status_display_type, 0)
  assert.equal(f.messages[0].args.activity.assets.small_image, animatedLogo)
  assert.equal(f.messages[0].args.activity.type, 0)
  assert.equal(f.messages[0].args.activity.timestamps.start, +start)
  for (const socket of f.sockets) socket.destroy()
  await until(() => f.connections() === 2 && f.messages.length === 2, 6500)
  assert.equal(f.messages[1].args.activity.timestamps.start, +start)
  f.connection.publish({ name: 'VALORANT with Eclipse', details: 'Playing VALORANT', state: 'with Eclipse', startTimestamp: new Date() }, '1534714200813863136')
  await until(() => f.messages.length === 3)
  assert.equal(f.messages[2].args.activity.details, 'Playing VALORANT')
  assert.equal(f.messages[2].args.activity.name, 'VALORANT with Eclipse')
  f.connection.publish(null, '1534714200813863136')
  await until(() => f.messages.length === 4 && f.sockets.size === 0)
  assert.equal(f.messages[3].args.activity, undefined)
  assert.ok(f.messages[3].args.pid > 0)
  f.connection.refresh()
  assert.equal(f.connections(), 2)
})

test('cancelling a real IPC login before its socket connects closes the late socket without publishing', { timeout: 5000 }, async t => {
  const f = await fixture(t)
  f.delayReady()
  f.connection.publish({ details: 'Must never appear' }, '1534714200813863136')
  f.connection.publish(null, '1534714200813863136')
  await until(() => f.connections() === 1 && f.sockets.size === 0)
  assert.equal(f.messages.length, 0)
})

test('native Discord IPC handles fragmented headers and split UTF-8 without losing acknowledgements', async t => {
  const f = await fixture(t, { fragmented: true })
  f.connection.publish({ name: 'Größe 🎮 with Eclipse', details: 'Größe 🎮', state: '日本語' }, '1534714200813863136')
  await until(() => f.messages.length === 1)
  f.connection.publish({ name: 'Next game' }, '1534714200813863136')
  await until(() => f.messages.length === 2)
  assert.equal(f.messages[0].args.activity.details, 'Größe 🎮')
  assert.equal(f.messages[1].args.activity.name, 'Next game')
  assert.equal(f.connections(), 1)
})

test('native Discord IPC decodes combined PING/ACK frames and responds with PONG', async t => {
  const f = await fixture(t, { coalesced: true })
  f.connection.publish({ name: 'First' }, '1534714200813863136')
  await until(() => f.pongs.length === 1)
  f.connection.publish({ name: 'Second' }, '1534714200813863136')
  await until(() => f.pongs.length === 2)
  assert.deepEqual(f.pongs[0], { heartbeat: 'fixture' })
  assert.equal(f.messages.at(-1).args.activity.name, 'Second')
})

test('presence follows the actual game PID and clears its previous association on transitions and disable', async t => {
  const f = await fixture(t)
  f.connection.publish({ name: 'Fortnite', processId: 12345 }, '1534714200813863136')
  await until(() => f.messages.length === 1)
  assert.equal(f.messages[0].args.pid, 12345)
  assert.equal(f.messages[0].args.activity.processId, undefined)
  f.connection.publish({ name: 'Fortnite', processId: 54321 }, '1534714200813863136')
  await until(() => f.messages.length === 3)
  assert.equal(f.messages[1].args.pid, 12345)
  assert.equal(f.messages[1].args.activity, undefined)
  assert.equal(f.messages[2].args.pid, 54321)
  f.connection.publish(null, '1534714200813863136')
  await until(() => f.messages.length === 4)
  assert.equal(f.messages[3].args.pid, 54321)
  assert.equal(f.messages[3].args.activity, undefined)
})

test('Discord rejecting optional artwork falls back to readable game presence without reconnect loops', async t => {
  const f = await fixture(t, { rejectAssets: true })
  f.connection.publish({ name: 'Any Game with Eclipse', state: 'Playing', largeImageKey: 'https://example.com/invalid.png' }, '1534714200813863136')
  await until(() => f.messages.length === 2)
  assert.equal(f.messages[1].args.activity.name, 'Any Game with Eclipse')
  assert.equal(f.messages[1].args.activity.assets, undefined)
  f.connection.publish({ name: 'Any Game with Eclipse', state: 'Updated', largeImageKey: 'https://example.com/invalid.png' }, '1534714200813863136')
  await until(() => f.messages.length === 3)
  assert.equal(f.messages[2].args.activity.state, 'Updated')
  assert.equal(f.messages[2].args.activity.assets, undefined)
  assert.equal(f.connections(), 1)
})

test('oversized IPC frames close the connection without allocating an advertised body', async t => {
  const f = await fixture(t, { oversized: true })
  f.connection.publish({ name: 'Game' }, '1534714200813863136')
  await until(() => f.messages.length === 1 && f.sockets.size === 0)
  f.connection.publish(null, '1534714200813863136')
  assert.equal(f.connections(), 1)
})
