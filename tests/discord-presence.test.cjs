const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')
const { activityFromWire } = require('./discord-client-fixture.cjs')

const flush = () => new Promise(setImmediate)
function clock(t) {
  let now = 1_000_000, id = 0
  const timers = new Map()
  t.mock.method(Date, 'now', () => now)
  function schedule(fn, delay, interval = 0) {
    const timer = { id: ++id, unref() {} }
    timers.set(timer, { fn, at: now + delay, interval })
    return timer
  }
  t.mock.method(global, 'setTimeout', (fn, delay) => schedule(fn, delay))
  t.mock.method(global, 'setInterval', (fn, delay) => schedule(fn, delay, delay))
  t.mock.method(global, 'clearTimeout', timer => timers.delete(timer))
  t.mock.method(global, 'clearInterval', timer => timers.delete(timer))
  return {
    timers,
    async advance(ms) {
      await flush()
      const end = now + ms
      for (let attempts = 0; attempts < 1000; attempts++) {
        const next = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) { now = end; await flush(); return }
        const [timer, value] = next
        now = value.at
        if (value.interval) value.at += value.interval
        else timers.delete(timer)
        value.fn()
        await flush()
      }
      assert.fail('Timer loop did not settle')
    },
  }
}

function fixture(t, options = {}) {
  const time = clock(t), clients = [], writes = []
  class Client extends EventEmitter {
    constructor() { super(); clients.push(this); this.destroyed = 0 }
    login() {
      if (options.login) return options.login(this)
      queueMicrotask(() => this.emit('ready'))
      return Promise.resolve()
    }
    setActivity(activity) {
      writes.push({ client: this, activity, at: Date.now() })
      return options.write?.(this, activity) || Promise.resolve()
    }
    request(command, { activity }) { assert.equal(command, 'SET_ACTIVITY'); return activity ? this.setActivity(activityFromWire(activity)) : this.clearActivity() }
    clearActivity() {
      writes.push({ client: this, activity: null, at: Date.now() })
      return options.write?.(this, null) || Promise.resolve()
    }
    destroy() { this.destroyed++; return Promise.resolve() }
  }
  const { DiscordConnection } = loadTs()('electron/discordConnection.ts')
  const connection = new DiscordConnection(() => new Client())
  t.after(() => connection.stop())
  return { time, clients, writes, connection, Client }
}

test('Discord coalesces quick game changes and serializes writes at the configured cadence', async t => {
  let finish
  const f = fixture(t, { write: (_client, value) => value?.name === 'A' ? new Promise(resolve => { finish = resolve }) : Promise.resolve() })
  f.connection.publish({ name: 'A' }, 'eclipse')
  await flush()
  f.connection.publish({ name: 'B' }, 'eclipse')
  f.connection.publish({ name: 'C' }, 'eclipse')
  assert.equal(f.writes.length, 1)
  finish(); await flush()
  await f.time.advance(3999)
  assert.equal(f.writes.length, 1)
  await f.time.advance(1)
  assert.deepEqual(f.writes.map(w => w.activity.name), ['A', 'C'])
  f.connection.publish({ name: 'C' }, 'eclipse')
  f.connection.refresh()
  await f.time.advance(20_000)
  assert.equal(f.writes.length, 2)
})

test('disabling during a pending write clears afterwards without reconnecting or restoring the game', async t => {
  let finish
  const f = fixture(t, { write: (_client, value) => value ? new Promise(resolve => { finish = resolve }) : Promise.resolve() })
  f.connection.publish({ name: 'Fortnite' }, 'eclipse'); await flush()
  f.connection.publish(null, 'eclipse')
  assert.equal(f.writes.length, 1)
  finish(); await flush()
  assert.deepEqual(f.writes.map(w => w.activity?.name || null), ['Fortnite', null])
  assert.equal(f.clients[0].destroyed, 1)
  f.clients[0].emit('ready'); f.clients[0].emit('error', new Error('Late old transport error'))
  await f.time.advance(60_000)
  assert.equal(f.clients.length, 1)
  assert.equal(f.time.timers.size, 0)
})

test('disabling during login ignores late ready and re-enabling creates one clean connection', async t => {
  const f = fixture(t, { login: () => new Promise(() => {}) })
  f.connection.publish({ name: 'Old game' }, 'eclipse')
  f.connection.publish(null, 'eclipse')
  f.clients[0].emit('ready')
  assert.equal(f.writes.length, 0)
  f.connection.publish({ name: 'New game' }, 'eclipse')
  f.clients[1].emit('ready'); await flush()
  assert.equal(f.clients.length, 2)
  assert.equal(f.writes.at(-1).activity.name, 'New game')
})

test('the actual disconnected event retries and restores only the latest game and original session time', async t => {
  const f = fixture(t)
  f.connection.publish({ name: 'Rocket League', started: 900_000 }, 'eclipse'); await flush()
  f.clients[0].emit('disconnected')
  f.connection.publish({ name: 'VALORANT', started: 999_000 }, 'eclipse')
  await f.time.advance(4999)
  assert.equal(f.clients.length, 1)
  await f.time.advance(1)
  assert.equal(f.clients.length, 2)
  assert.deepEqual(f.writes.at(-1).activity, { name: 'VALORANT', started: 999_000 })
  f.clients[0].emit('ready')
  assert.equal(f.writes.length, 2)
})

test('Discord can start later than Eclipse and disabling cancels reconnect backoff', async t => {
  const f = fixture(t, { login: client => {
    if (f.clients.length < 2) return Promise.reject(new Error('Discord not running'))
    queueMicrotask(() => client.emit('ready')); return Promise.resolve()
  } })
  f.connection.publish({ name: 'Game' }, 'eclipse'); await flush()
  f.connection.publish(null, 'eclipse')
  f.connection.publish({ name: 'Game' }, 'eclipse'); await flush()
  assert.equal(f.clients.length, 2, 'Re-enabling should not retain an old failure delay')
  assert.equal(f.writes.at(-1).activity.name, 'Game')
})

test('login and write timeouts recover without simultaneous connections or late writes', async t => {
  const f = fixture(t, { login: () => new Promise(() => {}), write: () => new Promise(() => {}) })
  f.connection.publish({ name: 'Game' }, 'eclipse')
  await f.time.advance(12_000)
  assert.equal(f.clients[0].destroyed, 1)
  await f.time.advance(5000)
  f.clients[1].emit('ready')
  assert.equal(f.writes.length, 1)
  await f.time.advance(8000)
  assert.equal(f.clients[1].destroyed, 1)
  f.connection.publish(null, 'eclipse')
  await f.time.advance(60_000)
  assert.equal(f.clients.length, 2)
})

test('a failed clear closes the old transport and cannot reconnect while disabled', async t => {
  const f = fixture(t, { write: (_client, activity) => activity ? Promise.resolve() : Promise.reject(new Error('Connection closed')) })
  f.connection.publish({ name: 'Game' }, 'eclipse'); await flush()
  f.connection.publish(null, 'eclipse'); await flush()
  assert.equal(f.clients[0].destroyed, 1)
  await f.time.advance(60_000)
  assert.equal(f.clients.length, 1)
})

test('rapid off/on while clear is pending ends with the newest enabled game', async t => {
  let finish
  const f = fixture(t, { write: (_client, activity) => activity ? Promise.resolve() : new Promise(resolve => { finish = resolve }) })
  f.connection.publish({ name: 'Old' }, 'eclipse'); await flush()
  f.connection.publish(null, 'eclipse')
  f.connection.publish({ name: 'New' }, 'eclipse')
  finish(); await flush(); await f.time.advance(4000)
  assert.deepEqual(f.writes.map(w => w.activity?.name || null), ['Old', null, 'New'])
  assert.equal(f.clients.length, 1)
})

test('changing Discord application ID retires old callbacks and sends only through the new client', async t => {
  let finish
  const f = fixture(t, { write: (_client, activity) => activity?.name === 'Old' ? new Promise(resolve => { finish = resolve }) : Promise.resolve() })
  f.connection.publish({ name: 'Old' }, 'old-app'); await flush()
  f.connection.publish({ name: 'New' }, 'new-app'); await flush()
  finish(); await flush()
  assert.equal(f.clients[0].destroyed, 1)
  assert.equal(f.clients[1].destroyed, 0)
  assert.equal(f.writes.at(-1).activity.name, 'New')
})

test('an unchanged presence is periodically restored without resetting its session or reconnecting', async t => {
  const f = fixture(t)
  f.connection.publish({ name: 'Fortnite', startTimestamp: 900_000 }, 'eclipse'); await flush()
  await f.time.advance(59_999)
  assert.equal(f.writes.length, 1)
  await f.time.advance(1)
  assert.equal(f.writes.length, 2)
  assert.equal(f.writes[1].activity.startTimestamp, 900_000)
  assert.equal(f.clients.length, 1)
  f.connection.publish(null, 'eclipse'); await flush()
  await f.time.advance(120_000)
  assert.equal(f.writes.length, 3)
  assert.equal(f.time.timers.size, 0)
})

test('a scheduled health refresh cannot delay a new game until the next minute', async t => {
  const f = fixture(t)
  f.connection.publish({ name: 'Idle' }, 'eclipse'); await flush()
  await f.time.advance(1000)
  f.connection.publish({ name: 'Fortnite' }, 'eclipse')
  await f.time.advance(2999)
  assert.equal(f.writes.length, 1)
  await f.time.advance(1)
  assert.equal(f.writes.at(-1).activity.name, 'Fortnite')
  assert.equal(f.writes.length, 2)
})

const { normalizeDiscordSettings, mergeDiscordSettings, discordPresenceMode } = loadTs()('electron/discordPresence.ts')
test('the master switch always hides all activity; an actual game outranks download and idle', () => {
  const defaults = normalizeDiscordSettings({})
  assert.equal(discordPresenceMode(defaults, null), 'idle')
  assert.equal(discordPresenceMode(defaults, null, 'Download'), 'download')
  assert.equal(discordPresenceMode(defaults, { name: 'Game' }, 'Download'), 'game')
  const off = normalizeDiscordSettings({ discordRpc: false, discordRpcIdle: true, discordRpcShowDownloads: true })
  assert.equal(discordPresenceMode(off, { name: 'Game' }, 'Download'), 'off')
  assert.equal(discordPresenceMode(off, null, 'Download'), 'off')
  assert.equal(discordPresenceMode(normalizeDiscordSettings({ discordRpcIdle: false, discordRpcShowDownloads: false }), null, 'Download'), 'off')
})

test('live aliases and persisted Discord fields merge in both directions without stale settings', () => {
  const previous = { discordRpc: true, discordEnabled: true, discordRpcIdle: true, showIdle: true, discordPrivacyMode: false, discordActivityStyle: 'clipping' }
  assert.equal(mergeDiscordSettings(previous, { discordRpc: false }).discordEnabled, false)
  assert.equal(mergeDiscordSettings(previous, { discordEnabled: false }).discordEnabled, false)
  assert.equal(mergeDiscordSettings(previous, { discordRpcIdle: false }).showIdle, false)
  assert.equal(mergeDiscordSettings(previous, { discordRpcPrivacyMode: true }).discordPrivacyMode, true)
  assert.equal(mergeDiscordSettings(previous, { discordRpcActivityStyle: 'playing' }).discordActivityStyle, 'playing')
  assert.equal(mergeDiscordSettings(previous, { discordRpcShowDownloads: false }).showDownloads, false)
  assert.equal(mergeDiscordSettings({ discordRpc: false }, { discordRpc: true }).discordEnabled, true)
})

test('private Roblox presence never reveals the experience through text, image or animated updates', async t => {
  const f = fixture(t)
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client } })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  rpc.setDiscordActivity('Secret Experience', 900_000, true, 'playing', undefined, 'https://example.com/secret.png', 'Secret custom state', 'https://example.com/secret-small.png', 'Secret', true)
  await flush()
  await f.time.advance(15_000)
  assert.ok(f.writes.length >= 3)
  for (const { activity } of f.writes) {
    assert.doesNotMatch(JSON.stringify(activity), /Secret|secret/)
    assert.match(activity.details, /Playing a Game/)
    assert.equal(+activity.startTimestamp, 900_000)
  }
  for (let i = 1; i < f.writes.length; i++) assert.ok(f.writes[i].at - f.writes[i - 1].at >= 4000)
  rpc.setDiscordEnabled(false); await flush()
  const count = f.writes.length
  await f.time.advance(30_000)
  assert.equal(f.writes.length, count)
  assert.equal(f.writes.at(-1).activity, null)
})

function artworkLookup() {
  let requests = 0
  const pending = []
  const request = () => { const req = new EventEmitter(); req.destroy = () => {}; req.end = () => {}; return req }
  const https = {
    get: (options, callback) => {
      if (options.hostname === 'api.steampowered.com') {
        const input = JSON.parse(new URL('https://example.com' + options.path).searchParams.get('input_json'))
        queueMicrotask(() => {
          const response = new EventEmitter(); response.statusCode = 200; callback(response)
          response.emit('data', JSON.stringify({ response: { store_items: [{ appid: input.ids[0].appid, assets: { community_icon: 'a'.repeat(40) } }] } }))
          response.emit('end')
        })
        return request()
      }
      requests++
      pending.push(items => {
        const response = new EventEmitter(); response.statusCode = 200; callback(response)
        response.emit('data', JSON.stringify({ items })); response.emit('end')
      })
      return request()
    },
    request: (_options, callback) => {
      queueMicrotask(() => callback({ statusCode: 200, resume() {} }))
      return request()
    },
  }
  return { https, pending, requests: () => requests }
}

test('Steam artwork matches the actual game rather than the first search result and shares in-flight lookups', async t => {
  const f = fixture(t), art = artworkLookup()
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client }, https: art.https })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  const first = rpc.searchSteamArtwork('Fixture Game™')
  const second = rpc.searchSteamArtwork('Fixture Game™')
  assert.equal(first, second)
  art.pending.shift()([{ id: 666, name: 'Fixture Game Soundtrack' }, { id: 777, name: 'Fixture Game' }])
  assert.match((await first).imageUrl, /\/777\//)
  assert.match((await rpc.searchSteamArtwork('Fixture Game™')).imageUrl, /\/777\//)
  assert.equal(art.requests(), 1)
  const missing = rpc.searchSteamArtwork('No Exact Game')
  art.pending.shift()([{ id: 888, name: 'An Unrelated Game' }])
  assert.equal(await missing, null)
  assert.equal(await rpc.searchSteamArtwork('No Exact Game'), null)
  assert.equal(art.requests(), 2)
  await f.time.advance(30_001)
  const retry = rpc.searchSteamArtwork('No Exact Game')
  art.pending.shift()([])
  assert.equal(await retry, null)
  assert.equal(art.requests(), 3)
})

test('late artwork cannot undo newer style settings and known trademark game titles retain their artwork', async t => {
  const f = fixture(t), art = artworkLookup()
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client }, https: art.https })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  rpc.setDiscordActivity('Fixture Game', 900_000, false, 'clipping')
  await flush()
  rpc.setDiscordActivity('Fixture Game', 900_000, false, 'playing', undefined, undefined, undefined, undefined, undefined, true)
  assert.equal(art.requests(), 1)
  art.pending.shift()([{ id: 777, name: 'Fixture Game' }])
  await flush(); await f.time.advance(4000)
  assert.match(f.writes.at(-1).activity.details, /Playing Fixture Game/)
  assert.match(f.writes.at(-1).activity.largeImageKey, /\/777\//)
  assert.equal(+f.writes.at(-1).activity.startTimestamp, 900_000)
  rpc.setDiscordActivity('Rocket League®', 950_000)
  await f.time.advance(4000)
  assert.match(f.writes.at(-1).activity.largeImageKey, /Rocket-League-Logo/)
  assert.equal(art.requests(), 1)
})

test('Eclipse uses its animated logo with static text and game-specific titles without adding animation writes', async t => {
  const f = fixture(t)
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client } })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  rpc.setDiscordIdleActivity(false); await flush()
  let activity = f.writes.at(-1).activity
  assert.equal(activity.name, 'Eclipse')
  assert.equal(activity.statusDisplayType, 0)
  assert.equal(activity.largeImageKey, rpc.ECLIPSE_LOGO_GIF_URL)
  assert.match(activity.largeImageKey, /\/eclipse-logo\.gif$/)
  const count = f.writes.length
  await f.time.advance(20_000)
  assert.equal(f.writes.length, count, 'GIF animation belongs to Discord; Eclipse needs no frame timer')
  rpc.setDiscordIdleActivity(false, true); await f.time.advance(4000)
  assert.equal(f.writes.at(-1).activity.details, 'In Eclipse Clips')
  assert.equal(f.writes.at(-1).activity.state, 'Clips Studio')
  rpc.setDiscordActivity('VALORANT', 900_000, false, 'playing'); await flush()
  activity = f.writes.at(-1).activity
  assert.equal(activity.name, 'VALORANT with Eclipse')
  assert.equal(activity.smallImageKey, rpc.ECLIPSE_LOGO_GIF_URL)
  assert.notEqual(activity.largeImageKey, rpc.ECLIPSE_LOGO_GIF_URL, 'Retain the game artwork')
  rpc.setDiscordActivity('Rocket League', 950_000)
  await f.time.advance(4000)
  assert.equal(f.writes.at(-1).activity.name, 'Rocket League with Eclipse')
  rpc.setDiscordActivity('Secret Game', 950_000, true)
  await f.time.advance(4000)
  activity = f.writes.at(-1).activity
  assert.equal(activity.name, 'Eclipse')
  assert.equal(activity.largeImageKey, rpc.ECLIPSE_LOGO_GIF_URL)
  assert.doesNotMatch(JSON.stringify(activity), /Secret/)
  rpc.setDiscordDownloadActivity('New Game')
  await f.time.advance(4000)
  assert.equal(f.writes.at(-1).activity.name, 'Eclipse')
  assert.equal(f.writes.at(-1).activity.largeImageKey, rpc.ECLIPSE_LOGO_GIF_URL)
})

test('long game titles keep the with Eclipse suffix within the Discord name limit', async t => {
  const f = fixture(t), art = artworkLookup()
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client }, https: art.https })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  rpc.setDiscordActivity('🎮'.repeat(180), 900_000, false, 'playing')
  assert.equal(art.requests(), 0, 'A title without searchable letters needs no network lookup')
  await flush()
  const activity = f.writes.at(-1).activity
  assert.equal(Array.from(activity.name).length, 128)
  assert.match(activity.name, / with Eclipse$/)
})

test('the optional version is shown for game, idle and download activity and can be removed live',async t=>{
 const f=fixture(t),rpc=loadTs({'./discordIpcClient':{DiscordIpcClient:f.Client}})('electron/discordRPC.ts'),version=require('../package.json').version
 t.after(rpc.stopDiscordRPC);rpc.setDiscordVersionVisible(true);rpc.setDiscordIdleActivity();await flush()
 assert.ok(f.writes.at(-1).activity.state.endsWith('v'+version))
 rpc.setDiscordActivity('VALORANT',900000);await f.time.advance(4000);assert.ok(f.writes.at(-1).activity.state.endsWith('v'+version))
 rpc.setDiscordDownloadActivity('Counter-Strike 2',false,{name:'Counter-Strike 2',source:'Steam',phase:'download',progress:42,appId:730});await f.time.advance(4000)
 assert.match(f.writes.at(-1).activity.state,/Steam · 42%/);assert.ok(f.writes.at(-1).activity.state.endsWith('v'+version))
 assert.match(f.writes.at(-1).activity.largeImageKey,/community_assets\/images\/apps\/730\//)
 rpc.setDiscordDownloadActivity('Secret game',false,{name:'Secret game',source:'Steam',phase:'install',progress:75,appId:730},true);await f.time.advance(4000)
 assert.doesNotMatch(JSON.stringify(f.writes.at(-1).activity),/Secret|730/)
 assert.match(f.writes.at(-1).activity.details,/Installing a game/)
 rpc.setDiscordVersionVisible(false);await f.time.advance(4000);assert.doesNotMatch(f.writes.at(-1).activity.state,/v\d/)
})

test('game, download, idle and private activities include Download Eclipse and GitHub buttons', async t => {
  const f = fixture(t), art = artworkLookup()
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client }, https: art.https })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  const expected = [
    { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' },
    { label: 'GitHub', url: 'https://github.com/PE4CE1/EclipseLauncher' },
  ]
  for (const publish of [
    () => rpc.setDiscordIdleActivity(),
    () => rpc.setDiscordIdleActivity(false, true),
    () => rpc.setDiscordActivity('VALORANT', 900_000),
    () => rpc.setDiscordDownloadActivity('Test Game'),
    () => rpc.setDiscordActivity('Private Game', 900_000, true),
  ]) {
    publish(); await f.time.advance(4000)
    assert.deepEqual(f.writes.at(-1).activity.buttons, expected)
  }
  assert.equal(art.requests(), 0)
})

test('VALORANT and Dead by Daylight use application icons while experience icons remain specific', async t => {
  const f = fixture(t), art = artworkLookup()
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client }, https: art.https })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  rpc.setDiscordActivity('VALORANT', 900_000); await flush()
  assert.match(f.writes.at(-1).activity.largeImageKey, /cbf4460132cdfeb2a97fad5f9dd25ba0bc058f76-128x128\.png$/)
  rpc.setDiscordActivity('Dead by Daylight', 900_000, false, 'playing', 381210); await f.time.advance(4000)
  assert.match(f.writes.at(-1).activity.largeImageKey, /community_assets\/images\/apps\/381210\/[a-f0-9]+\.jpg$/)
  assert.doesNotMatch(f.writes.at(-1).activity.largeImageKey, /header|logo\.png/)
  rpc.setDiscordActivity('Fixture Experience', 900_000, false, 'playing', undefined, 'https://example.com/experience.png')
  await f.time.advance(4000)
  assert.equal(f.writes.at(-1).activity.largeImageKey, 'https://example.com/experience.png')
  assert.equal(art.requests(), 0, 'Built-in icons and custom experience icons require no Steam search')
})

test('an explicit Steam ID resolves its own icon and a late response cannot reveal a private game', async t => {
  const f = fixture(t), art = artworkLookup()
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: f.Client }, https: art.https })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  rpc.setDiscordActivity('Unknown Steam Game', 900_000, false, 'playing', 999999)
  await flush(); await f.time.advance(4000)
  assert.match(f.writes.at(-1).activity.largeImageKey, /\/999999\/a{40}\.jpg$/)
  assert.equal(art.requests(), 0, 'An actual app ID should not perform a title search')
  rpc.setDiscordActivity('Pending Secret Game', 900_000)
  rpc.setDiscordActivity('Pending Secret Game', 900_000, true)
  art.pending.shift()([{ id: 777, name: 'Pending Secret Game' }])
  await flush(); await f.time.advance(4000)
  assert.equal(f.writes.at(-1).activity.largeImageKey, rpc.ECLIPSE_LOGO_GIF_URL)
  assert.doesNotMatch(JSON.stringify(f.writes.at(-1).activity), /Secret|\/777\//)
})
