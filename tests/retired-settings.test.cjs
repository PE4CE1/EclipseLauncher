const test = require('node:test'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events')
const load = require('./download-loader.cjs')

test('old Home and memory preferences are stripped without changing other settings', () => {
  const { withoutRetiredSettings } = load()('src/services/retiredSettings.ts')
  const saved = { homeLayout: 'classic', memoryTargetMB: 128, memoryHardLimitMB: 512, memoryRamLimiter: true, memoryLimiterVersion: 1,
    language: 'de', startOnBoot: true, appMode: 'clips', accountSecret: 'local-test', overlayClipNotification: true }
  const clean = withoutRetiredSettings(saved)
  assert.deepEqual(clean, { language: 'de', startOnBoot: true, appMode: 'clips', accountSecret: 'local-test', overlayClipNotification: true })
  assert.equal(saved.memoryRamLimiter, true, 'Migration must not mutate an in-flight settings snapshot')
  assert.equal(withoutRetiredSettings(clean), clean)
  assert.deepEqual(withoutRetiredSettings({ memoryRamLimiter: true }), {}, 'Stale renderer patches must not restore the limiter')
})

function legacyFixture(t, ramSupported = true) {
  const socket = new EventEmitter(), commands = []
  let broker
  socket.setEncoding = () => {}
  socket.destroy = () => socket.emit('close')
  socket.write = (line, callback) => {
    const [id, command, value] = line.trim().split('\t')
    commands.push([command, value]); callback?.()
    setImmediate(() => socket.emit('data', JSON.stringify({ id: Number(id), data: command === 'SAMPLE'
      ? { limitMB: 512, ...(ramSupported ? { ramLimitMB: 256 } : {}) }
      : command === 'SPAWN' ? { pid: 42 } : {} }) + '\n'))
    return true
  }
  const saved = process.env.ECLIPSE_MEMORY_PIPE
  process.env.ECLIPSE_MEMORY_PIPE = '\\\\.\\pipe\\Eclipse-memory-' + 'a'.repeat(32)
  let bridge
  try {
    bridge = load({ 'node:net': { createConnection: () => socket }, './externalLaunch': { setExternalBroker: value => { broker = value } } })('electron/legacyMemoryJob.ts')
  } finally {
    if (saved === undefined) delete process.env.ECLIPSE_MEMORY_PIPE
    else process.env.ECLIPSE_MEMORY_PIPE = saved
  }
  t.after(() => socket.emit('close'))
  return { bridge, commands, broker: () => broker, socket }
}

test('upgrading an inherited job releases physical and commit limits and keeps external games outside it', { skip: process.platform !== 'win32' }, async t => {
  const f = legacyFixture(t)
  await Promise.all([f.bridge.releaseInheritedMemoryLimits(), f.bridge.releaseInheritedMemoryLimits()])
  assert.deepEqual(f.commands.map(([command, value]) => [command, command === 'SAMPLE' ? 'pids' : value]), [['SAMPLE', 'pids'], ['RAM', '0'], ['LIMIT', '0']])
  const handle = await f.broker().spawn('game.exe', [], 'C:/Games')
  assert.equal(handle.pid, 42)
  let exited = false
  handle.once('exit', () => { exited = true })
  f.socket.emit('data', '{"event":"exit","pid":42}\n')
  assert.equal(exited, true)
  f.socket.emit('close')
  await assert.rejects(f.broker().spawn('other.exe', [], 'C:/Games'), /Restart Eclipse/, 'A broken legacy channel must not launch a game in the old job')
})

test('older commit-only jobs are released without sending unsupported physical limit commands', { skip: process.platform !== 'win32' }, async t => {
  const f = legacyFixture(t, false)
  await f.bridge.releaseInheritedMemoryLimits()
  assert.deepEqual(f.commands.map(item => item[0]), ['SAMPLE', 'LIMIT'])
  assert.equal(f.commands[1][1], '0')
})

test('fresh launches need no controller, job or launch broker', async () => {
  const saved = process.env.ECLIPSE_MEMORY_PIPE
  delete process.env.ECLIPSE_MEMORY_PIPE
  try {
    const bridge = load({ 'node:net': { createConnection: () => assert.fail('No controller on fresh launch') }, './externalLaunch': { setExternalBroker: () => assert.fail('No job broker on fresh launch') } })('electron/legacyMemoryJob.ts')
    await bridge.releaseInheritedMemoryLimits()
  } finally { if (saved !== undefined) process.env.ECLIPSE_MEMORY_PIPE = saved }
})
