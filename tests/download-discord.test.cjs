const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')
const { activityFromWire } = require('./discord-client-fixture.cjs')

test('late Steam artwork cannot restore a previous Discord game activity after switching to idle', async t => {
  const activities = []
  let finishLookup
  let destroyed = 0
  class Client extends EventEmitter {
    login() { queueMicrotask(() => this.emit('ready')); return Promise.resolve() }
    setActivity(activity) { activities.push(activity); return Promise.resolve() }
    request(command, { activity }) { assert.equal(command, 'SET_ACTIVITY'); return activity ? this.setActivity(activityFromWire(activity)) : this.clearActivity() }
    clearActivity() { return Promise.resolve() }
    destroy() { destroyed++; return Promise.resolve() }
  }
  function request() { const req = new EventEmitter(); req.destroy = () => {}; req.end = () => {}; return req }
  const { setDiscordActivity, setDiscordIdleActivity, stopDiscordRPC } = loadTs({
    './discordIpcClient': { DiscordIpcClient: Client },
    https: {
      get: (options, callback) => {
        if (options.hostname === 'api.steampowered.com') {
          queueMicrotask(() => {
            const response = new EventEmitter(); response.statusCode = 200; callback(response)
            response.emit('data', JSON.stringify({ response: { store_items: [{ appid: 123, assets: { community_icon: 'a'.repeat(40) } }] } }))
            response.emit('end')
          })
          return request()
        }
        finishLookup = () => {
          const response = new EventEmitter(); response.statusCode = 200; callback(response)
          response.emit('data', JSON.stringify({ items: [{ id: 123, name: 'Unmapped Test Game', tiny_image: 'https://example.com/game.png' }] })); response.emit('end')
        }
        return request()
      },
      request: (_options, callback) => {
        queueMicrotask(() => callback({ statusCode: 200, resume() {} }))
        return request()
      },
    },
  })('electron/discordRPC.ts')
  t.after(stopDiscordRPC)
  setDiscordActivity('Unmapped Test Game', Date.now())
  setDiscordIdleActivity()
  await new Promise(resolve => setImmediate(resolve))
  finishLookup()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(activities.at(-1).details, 'In Launcher')
  assert.equal(activities.some(activity => activity.largeImageKey.includes('/123/')), false)
  stopDiscordRPC()
  assert.equal(destroyed, 1)
})

test('native presence refresh reconnects Fortnite with the same timestamp and never resurrects cleared activity', async t => {
  let now = 100_000
  t.mock.method(Date, 'now', () => now)
  const clients = [], activities = []
  class Client extends EventEmitter {
    constructor() { super(); clients.push(this) }
    login() { queueMicrotask(() => this.emit('ready')); return Promise.resolve() }
    setActivity(activity) { activities.push(activity); return Promise.resolve() }
    request(command, { activity }) { assert.equal(command, 'SET_ACTIVITY'); return activity ? this.setActivity(activityFromWire(activity)) : this.clearActivity() }
    clearActivity() { return Promise.resolve() }
    destroy() { return Promise.resolve() }
  }
  const rpc = loadTs({ './discordIpcClient': { DiscordIpcClient: Client } })('electron/discordRPC.ts')
  t.after(rpc.stopDiscordRPC)
  rpc.setDiscordActivity('Fortnite', 50_000)
  await new Promise(setImmediate)
  const activity = activities.at(-1)
  assert.match(activity.largeImageKey, /mzstatic\.com\/image\/thumb\/.*AppIcon.*\/512x512bb\.jpg$/)
  clients[0].emit('close')
  now += 6000
  rpc.refreshDiscordActivity()
  await new Promise(setImmediate)
  assert.equal(clients.length, 2)
  assert.equal(activities.at(-1).details, activity.details)
  assert.equal(+activities.at(-1).startTimestamp, +activity.startTimestamp)
  const count = activities.length
  rpc.refreshDiscordActivity()
  assert.equal(activities.length, count, 'Unchanged presence does not make repeated RPC writes')
  rpc.clearDiscordActivity()
  clients[1].emit('close')
  now += 6000
  rpc.refreshDiscordActivity()
  assert.equal(clients.length, 2)
})
