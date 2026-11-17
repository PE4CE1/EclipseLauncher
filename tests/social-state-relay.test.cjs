const test = require('node:test'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events')
const load = require('./download-loader.cjs')

function fixture() {
  class Contents extends EventEmitter { sent = []; isDestroyed() { return false } send(channel, data) { this.sent.push({ channel, data }) } }
  const owner = new Contents(), friends = new Contents(), foreign = new Contents(), handlers = new Map(), events = new Map()
  const ipc = { handle: (channel, callback) => handlers.set(channel, callback), on: (channel, callback) => events.set(channel, callback) }
  load()('electron/socialStateRelay.ts').registerSocialStateRelay(ipc, () => owner, () => friends)
  const publish = (sender, snapshot) => events.get('social:publish')({ sender }, snapshot)
  const get = sender => handlers.get('social:get')({ sender })
  const refresh = force => handlers.get('social:refresh')({ sender: friends }, force)
  const complete = (sender, result) => events.get('social:refreshed')({ sender }, result)
  const snapshot = { uid: 'owner', settings: { userUid: 'owner', username: 'Owner', eclipseFriends: [], accountSecret: 'NEVER-RELAY', rawgApiKey: 'NEVER-RELAY' }, activeGame: null, permissionDenied: false }
  return { owner, friends, foreign, publish, get, refresh, complete, snapshot }
}

test('only the main renderer may publish social state, and unrelated settings are stripped', () => {
  const f = fixture()
  f.publish(f.friends, f.snapshot); assert.equal(f.get(f.friends), null)
  f.publish(f.owner, f.snapshot)
  assert.equal(f.get(f.friends).settings.username, 'Owner')
  assert.equal(f.get(f.friends).settings.accountSecret, undefined)
  assert.equal(f.get(f.friends).settings.rawgApiKey, undefined)
  assert.throws(() => f.get(f.foreign), /unavailable/)
})

test('concurrent refreshes share one request, wait for the owner and reject forged replies', async () => {
  const f = fixture(); f.publish(f.owner, f.snapshot)
  const first = f.refresh(true), second = f.refresh(true)
  assert.equal(first, second)
  const request = f.owner.sent.find(item => item.channel === 'social:refresh').data
  let finished = false; first.then(() => { finished = true })
  f.complete(f.friends, { id: request.id, success: true }); await Promise.resolve(); assert.equal(finished, false)
  f.publish(f.owner, { ...f.snapshot, settings: { userUid: 'owner', username: 'Updated' } })
  f.complete(f.owner, { id: request.id, success: true })
  assert.equal((await first).settings.username, 'Updated')
})

test('a main renderer reload invalidates cached state and releases pending refreshes', async () => {
  const f = fixture(); f.publish(f.owner, f.snapshot)
  const pending = f.refresh(false), rejected = assert.rejects(pending, /restarting/)
  f.owner.emit('did-start-loading'); await rejected
  assert.equal(f.get(f.friends), null)
  assert.equal(f.friends.sent.at(-1).data, null)
})

test('a refresh requested during startup waits until the publisher has installed its listener', async () => {
  const f = fixture(), pending = f.refresh(true)
  assert.equal(f.owner.sent.length, 0)
  f.publish(f.owner, f.snapshot)
  const request = f.owner.sent.find(item => item.channel === 'social:refresh').data
  f.complete(f.owner, { id: request.id, success: true })
  assert.equal((await pending).settings.username, 'Owner')
})

test('destroying the owner releases pending work without sending IPC into windows during teardown', async () => {
  const f = fixture(); f.publish(f.owner, f.snapshot)
  const pending = f.refresh(false), rejected = assert.rejects(pending, /restarting/), sent = f.friends.sent.length
  f.owner.emit('destroyed'); await rejected
  assert.equal(f.friends.sent.length, sent)
})

test('a late initial snapshot cannot replace a newer live update, and unsubscribe discards pending work', async () => {
  const { receiveSocialState } = load()('src/services/socialStateSync.ts')
  let receive, finish; const values = []
  const api = { onSnapshot(callback) { receive = callback; return () => {} }, getSnapshot: () => new Promise(resolve => { finish = resolve }) }
  const stop = receiveSocialState(api, value => values.push(value))
  receive({ uid: 'new' }); finish({ uid: 'old' }); await Promise.resolve()
  assert.deepEqual(values, [{ uid: 'new' }])
  stop(); receive({ uid: 'closed' }); assert.equal(values.length, 1)
})

test('publishing ignores unrelated settings and game clock ticks but immediately forwards social changes', () => {
  const { startSocialStatePublisher } = load()('src/services/socialStateSync.ts')
  let state = { settings: { userUid: 'owner', username: 'Owner', eclipseFriends: [] }, activeGame: { id: 'game', name: 'Game', startTime: 1, lastTick: 1 } }, listener
  const snapshots = [], api = { publish: snapshot => snapshots.push(snapshot), onRefresh: () => () => {} }
  const store = { getState: () => state, subscribe: callback => { listener = callback; return () => { listener = undefined } } }
  const publisher = startSocialStatePublisher(api, store, () => 'owner', () => false, async () => {})
  state = { ...state, settings: { ...state.settings, theme: 'dark' }, activeGame: { ...state.activeGame, lastTick: 2 } }; listener()
  assert.equal(snapshots.length, 1)
  state = { ...state, settings: { ...state.settings, username: 'Renamed' } }; listener()
  assert.equal(snapshots.length, 2); assert.equal(snapshots[1].settings.username, 'Renamed')
  assert.equal(snapshots[1].settings.theme, undefined)
  publisher.stop(); assert.equal(listener, undefined)
})
