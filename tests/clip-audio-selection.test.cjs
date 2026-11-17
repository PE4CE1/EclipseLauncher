const test = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const load = require('./download-loader.cjs')
const { resolveClipAudioSelection: resolve } = load()('src/services/clipAudioSelection.ts')
const flush = () => new Promise(setImmediate)

test('automatic game audio follows detected games even before their first Windows audio session', () => {
  assert.equal(resolve('auto', [], { name: 'VALORANT', pid: 222 }).pid, 222)
  assert.equal(resolve(undefined, [], null).pid, undefined)
  assert.equal(resolve('none', [], { name: 'VALORANT', pid: 222 }).pid, undefined)
  const fallback = resolve('RocketLeague.exe', [{ name: 'browser.exe', pid: 123 }], { name: 'VALORANT', pid: 222 })
  assert.equal(fallback.mode, 'auto'); assert.equal(fallback.fallback, true); assert.equal(fallback.pid, 222)
  assert.equal(resolve('RocketLeague.exe', [], null).pid, undefined, 'Do not guess an unrelated desktop application')
  assert.equal(resolve('Discord.exe', [{ name: 'Discord.exe', pid: 123 }], null).pid, undefined)
})

test('manual audio selection handles case, duplicate processes and transient enumeration failure', () => {
  const apps = [{ name: 'game.exe', pid: 111 }, { name: 'game.exe', pid: 222 }]
  assert.equal(resolve('GAME.EXE', apps, { name: 'Game', pid: 222 }).pid, 222)
  assert.equal(resolve('game.exe', null, { name: 'Other', pid: 333 }).mode, 'unknown')
})

function fixture(t) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
  t.after(() => Object.defineProperty(process, 'platform', platform))
  const handlers = new Map(), intervals = new Map(), children = [], messages = []
  let next = 0, applications = [], game = null, failed = false, delayed = false
  const ready = []
  t.mock.method(global, 'setInterval', callback => { const timer = { id: ++next, unref() {} }; intervals.set(timer, callback); return timer })
  t.mock.method(global, 'clearInterval', timer => intervals.delete(timer))
  const alive = new Set()
  t.mock.method(process, 'kill', pid => { if (!alive.has(pid)) throw Object.assign(new Error('Exited'), { code: 'ESRCH' }); return true })
  const module = load({
    electron: { app: { getAppPath: () => __dirname, once() {} } },
    os: { release: () => '10.0.26100' }, fs: { existsSync: () => true },
    './ipcSecurity': { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } },
    './processMonitor': { getCurrentDetectedGame: () => game, getCurrentDetectedGamePid: () => game?.pid || 0 },
    child_process: {
      execFile: (_helper, args, _options, callback) => { assert.deepEqual(args, ['--list']); queueMicrotask(() => callback(failed ? new Error('Temporary enumeration failure') : null, applications.map(p => `${p.pid}\t${p.name}`).join('\n'))) },
      spawn: (_helper, args) => {
        assert.equal(args[0], '--capture')
        const child = new EventEmitter(); child.pid = Number(args[1]); child.exitCode = null; child.killed = false
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.ended = false
        child.stdin = { end() { child.ended = true } }
        child.kill = () => { child.killed = true; child.exitCode = 0; child.emit('exit', 0) }
        child.pcm = (time, value) => { const data = Buffer.alloc(12 + 48 * 4, value); data.writeDoubleLE(time); data.writeUInt32LE(48, 8); child.stdout.emit('data', data) }
        children.push(child)
        const activate = () => child.stderr.emit('data', Buffer.from('READY'))
        if (delayed) ready.push(activate)
        else queueMicrotask(activate)
        return child
      },
    },
  })('electron/processAudioCapture.ts')
  module.initProcessAudioCapture(); t.after(module.stopProcessAudio)
  const sender = new EventEmitter(); sender.isDestroyed = () => false; sender.send = (_event, value) => messages.push(value)
  const prepare = (selected = 'auto', discord = false) => handlers.get('clips:audio-prepare')({ sender }, { game: selected, discord, historySeconds: 36 })
  return { ...module, children, messages, intervals, sender, alive, prepare,
    setGame: value => { game = value; if (value) alive.add(value.pid) }, setApplications: value => { applications = value }, fail: value => { failed = value },
    delay: value => { delayed = value }, activate: () => ready.shift()?.(),
    tick: async () => { for (const callback of [...intervals.values()]) callback(); await flush() },
    snapshot: () => handlers.get('clips:audio-processes')(),
  }
}

test('native process audio falls back from an inactive saved game, follows new PIDs and stops a missing game', async t => {
  const f = fixture(t)
  f.setGame({ name: 'VALORANT', exeName: 'valorant.exe', pid: 222 })
  assert.equal((await f.prepare('RocketLeague.exe')).game, true)
  assert.equal(f.children[0].pid, 222)
  f.setApplications([{ name: 'RocketLeague.exe', pid: 111 }])
  await f.tick(); assert.equal(f.children.length, 1, 'Do not snap back to an old application that reappears')
  f.setGame({ name: 'Overwatch', exeName: 'overwatch.exe', pid: 333 })
  await f.tick()
  assert.equal(f.children[0].ended, true); assert.equal(f.children[1].pid, 333)
  f.setGame(null); await f.tick()
  assert.equal(f.children[1].ended, true)
  assert.deepEqual(f.messages.at(-1), { channel: 'game', available: false })
  assert.equal(f.children.length, 2)
})

test('audio handoff retains replay history while discarding late packets from the retired process', async t => {
  const f = fixture(t), time = Date.now()
  f.setGame({ name: 'First', pid: 111 }); await f.prepare()
  f.children[0].pcm(time, 7)
  f.setGame({ name: 'Second', pid: 222 }); await f.tick()
  f.children[0].pcm(time + 1, 99)
  f.children[1].pcm(time + 2, 9)
  const wav = f.freezeProcessAudio(f.sender).game.wav(time, .01)
  assert.equal(wav[44], 7); assert.equal(wav[44 + 48 * 4], 0); assert.equal(wav[44 + 96 * 4], 9)
  f.setGame(null); await f.tick()
  assert.equal(f.freezeProcessAudio(f.sender).game.wav(time, .01)[44], 7)
  assert.deepEqual(f.freezeProcessAudio(new EventEmitter()), {})
})

test('automatic capture changes games despite a transient audio enumeration failure; exited PIDs are not captured', async t => {
  const f = fixture(t)
  f.setGame({ name: 'First', pid: 111 }); await f.prepare()
  f.fail(true); f.setGame({ name: 'Second', pid: 222 }); await f.tick()
  assert.equal(f.children.at(-1).pid, 222)
  f.alive.delete(222); await f.tick()
  assert.equal(f.children.at(-1).ended, true)
  assert.equal(f.messages.at(-1).available, false)
})

test('refreshing the source list reports the native game and destroying its owner stops all capture work', async t => {
  const f = fixture(t)
  f.setGame({ name: 'VALORANT', exeName: 'valorant.exe', pid: 222 })
  assert.equal((await f.snapshot()).detectedGame.name, 'VALORANT')
  await f.prepare(); assert.equal(f.intervals.size, 1)
  f.sender.emit('destroyed')
  assert.equal(f.intervals.size, 0); assert.equal(f.children[0].ended, true)
  assert.deepEqual(f.freezeProcessAudio(f.sender), {})
})

test('a delayed Windows activation cannot restore a game that changed while its source was opening', async t => {
  const f = fixture(t)
  f.setGame({ name: 'Old', pid: 111 }); f.delay(true)
  const prepared = f.prepare()
  await flush()
  f.setGame({ name: 'Current', pid: 222 }); f.delay(false); f.activate()
  assert.equal((await prepared).game, true); await flush()
  assert.equal(f.children[0].ended, true)
  assert.equal(f.children.at(-1).pid, 222)
  assert.equal(f.messages.at(-1).available, true)
})
