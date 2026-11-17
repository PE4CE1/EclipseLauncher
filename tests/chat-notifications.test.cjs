const test = require('node:test'), assert = require('node:assert/strict'), load = require('./download-loader.cjs')
const { createChatNotificationObserver } = load()('src/services/chatNotifications.ts')
const turn = () => new Promise(resolve => setImmediate(resolve))
const thread = (id, n, senderId = 'friend') => ({ id, peerId: 'friend', senderId, messageId: 'message-' + n, text: 'Message ' + n, updatedAt: n })
function fixture() {
  let settings = {}, active = false, uid = 'owner', read = 0
  const notices = [], observer = createChatNotificationObserver({ uid: 'owner', settings: () => settings,
    friends: () => [{ id: 'friend', username: 'Friend' }], currentUid: () => uid, readAt: () => read,
    isActive: async () => active, notify: (friend, item) => notices.push(item) })
  return { observer, notices, settings: value => { settings = value }, active: value => { active = value }, uid: value => { uid = value }, read: value => { read = value } }
}
test('only new incoming messages notify; initial history, own sends and reconnect snapshots stay silent', async () => {
  const f = fixture(); f.observer.receive([thread('chat', 1)]); await turn(); assert.equal(f.notices.length, 0)
  f.observer.receive([thread('chat', 2)]); await turn(); assert.equal(f.notices.length, 1)
  f.observer.receive([thread('chat', 2)]); f.observer.receive([thread('chat', 3, 'owner')]); await turn(); assert.equal(f.notices.length, 1)
})
test('muting suppresses both alert channels without replaying the muted messages after unmute', async () => {
  const f = fixture(); f.observer.receive([])
  f.settings({ chatMutedFriends: { owner: ['friend'] } }); f.observer.receive([thread('chat', 1)]); await turn(); assert.equal(f.notices.length, 0)
  f.settings({ chatMutedFriends: { owner: [] } }); f.observer.receive([thread('chat', 1)]); await turn(); assert.equal(f.notices.length, 0)
  f.observer.receive([thread('chat', 2)]); await turn(); assert.equal(f.notices.length, 1)
})
test('actively read and already read conversations do not notify; another account mute does not apply', async () => {
  const f = fixture(); f.observer.receive([]); f.active(true)
  f.observer.receive([thread('chat', 1)]); await turn(); assert.equal(f.notices.length, 0)
  f.active(false); f.read(2); f.observer.receive([thread('chat', 2)]); await turn(); assert.equal(f.notices.length, 0)
  f.settings({ chatMutedFriends: { another: ['friend'] } }); f.observer.receive([thread('chat', 3)]); await turn(); assert.equal(f.notices.length, 1)
})
test('switching accounts or stopping discards an in-flight notification', async () => {
  const f = fixture(); f.observer.receive([]); f.observer.receive([thread('chat', 1)]); f.uid('other'); await turn(); assert.equal(f.notices.length, 0)
  f.uid('owner'); f.observer.receive([thread('chat', 2)]); f.observer.stop(); await turn(); assert.equal(f.notices.length, 0)
})
test('the shared inbox uses one source subscription for notifications and UI, with bounded lifetime', () => {
  const { createSharedChatInbox } = load()('src/services/sharedChatInbox.ts')
  let starts = 0, stops = 0, receive, fail; const values = []
  const watch = createSharedChatInbox((_uid, next, error) => { starts++; receive = next; fail = error; return () => { stops++ } })
  const first = watch('owner', value => values.push(value), () => {}); receive([thread('chat', 1)])
  const second = watch('owner', value => values.push(value), () => {}); assert.equal(starts, 1); assert.equal(values.length, 2)
  fail(Error('disconnected')); const third = watch('owner', () => {}, () => {}); assert.equal(starts, 2)
  first(); second(); assert.equal(stops, 1); third(); assert.equal(stops, 2)
})
test('local mute writes are account-scoped, serialized across windows and validate the caller', async () => {
  const { registerChatWindowIPC } = load()('electron/chatWindowIPC.ts')
  const events = new Map(), handlers = new Map(), sent = []
  let muted = {}, focused = false
  const owner = { isDestroyed: () => false, isFocused: () => focused, send: (channel, data) => sent.push({ channel, data }) }, friends = { ...owner }
  registerChatWindowIPC({ on: (key, fn) => events.set(key, fn), handle: (key, fn) => handlers.set(key, fn) }, {
    owner: () => owner, friends: () => friends, open() {}, uid: () => 'owner', loadMuted: () => muted, saveMuted: async value => { muted = value; return true },
  })
  await Promise.all([handlers.get('chat:mute')({ sender: owner }, 'owner', 'first', true), handlers.get('chat:mute')({ sender: friends }, 'owner', 'second', true)])
  assert.deepEqual(muted.owner, ['first', 'second'])
  assert.throws(() => handlers.get('chat:mute')({ sender: owner }, 'other', 'friend', true), /Invalid/)
  assert.throws(() => handlers.get('chat:mute')({ sender: {} }, 'owner', 'friend', true), /Invalid/)
  events.get('chat:context')({ sender: friends }, { uid: 'owner', peerId: 'first', visible: true })
  assert.equal(handlers.get('chat:active')({ sender: owner }, 'owner', 'first'), false)
  focused = true; assert.equal(handlers.get('chat:active')({ sender: owner }, 'owner', 'first'), true)
})
