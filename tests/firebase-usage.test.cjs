const test = require('node:test'), assert = require('node:assert/strict')
const load = require('./download-loader.cjs')

function fixture(t, { shared = false } = {}) {
  const previous = global.window
  t.after(() => { global.window = previous })
  const state = { settings: { userUid: 'owner', friendCode: 'ECL-OWNER', username: 'Owner', eclipseFriends: [] }, library: [], installedGames: [], activeGame: null,
    updateSettings(patch) { state.settings = { ...state.settings, ...patch } } }
  const listeners = new Map(), counts = { reads: 0, writes: 0, subscriptions: 0, requests: 0, sharedRefresh: 0 }
  let cloud = { uid: 'owner', schemaVersion: 2, username: 'Owner', friendCode: 'ECL-OWNER', friends: [], status: 'online', currentGame: null, lastSeen: 123 }
  const snapshot = () => ({ exists: () => true, data: () => cloud, metadata: { fromCache: false } })
  let receive, authChanged
  const auth = { currentUser: { uid: 'owner' }, authStateReady: async () => {} }
  const store = { getState: () => state, setState(patch) { Object.assign(state, patch) } }
  const sharedSnapshot = { uid: 'owner', settings: { userUid: 'owner', friendCode: 'ECL-OWNER', username: 'Owner', eclipseFriends: [{ id: 'friend', username: 'Friend', status: 'online' }] }, activeGame: null, permissionDenied: false }
  const socialState = { getSnapshot: async () => sharedSnapshot, onSnapshot(callback) { receive = callback; return () => { receive = undefined } },
    refresh: async () => { counts.sharedRefresh++; return sharedSnapshot } }
  global.window = { location: { hash: shared ? '#friends' : '' }, electronAPI: { account: { initialIdentity: { canonicalUid: 'owner', friendCode: 'ECL-OWNER' } }, ...(shared ? { socialState } : {}) } }
  const service = load({
    'firebase/app': { getApps: () => [], initializeApp: () => ({}) },
    'firebase/auth': { getAuth: () => auth, onAuthStateChanged: (_auth, callback) => { authChanged = callback; return () => {} } },
    'firebase/firestore': {
      getFirestore: () => ({}), doc: (_db, collection, id) => ({ collection, id }), collection: (_db, name) => name,
      where: () => ({}), documentId: () => '__name__', query: () => ({}),
      getDoc: async () => { counts.reads++; return snapshot() }, getDocs: async () => ({ docs: [] }),
      onSnapshot(ref, options, callback) { counts.subscriptions++; listeners.set(ref.id || 'friends', typeof options === 'function' ? options : callback); return () => listeners.delete(ref.id || 'friends') },
      updateDoc: async (_ref, patch) => { counts.writes++; cloud = { ...cloud, ...patch } },
      serverTimestamp: () => ({ timestamp: true }), deleteField: () => ({ delete: true }),
    },
    './friendRequests': { friendFromProfile: (data, id) => ({ id, ...data }), createFriendRequests: () => ({ start() { counts.requests++ }, stop() {} }) },
    '../store/gameStore': { useGameStore: store }, './notificationService': {},
  })('src/services/firebaseService.ts')
  return { service, state, counts, cloud: () => cloud, auth, snapshot,
    ownSnapshot: () => listeners.get('owner')(snapshot()), receive: value => receive(value), authChanged: () => authChanged(auth.currentUser), sharedSnapshot }
}

test('reopening an unchanged profile performs no extra reads or writes; real edits still sync', async t => {
  const f = fixture(t)
  await f.service.refreshFriendsPresence(true)
  await f.service.syncMyProfile()
  const baseline = { ...f.counts }
  for (let i = 0; i < 100; i++) await f.service.syncMyProfile()
  assert.equal(f.counts.reads, baseline.reads)
  assert.equal(f.counts.writes, baseline.writes)
  assert.equal(f.cloud().lastSeen, 123, 'Profile sync must not create extra presence heartbeats')
  f.state.updateSettings({ username: 'New name', bio: 'New bio' })
  await f.service.syncMyProfile()
  assert.equal(f.counts.writes, baseline.writes + 1)
  assert.equal(f.cloud().username, 'New name'); assert.equal(f.cloud().bio, 'New bio')
})

test('automatic reopening uses live state; manual reload reads again without duplicating healthy listeners', async t => {
  const f = fixture(t)
  await f.service.refreshFriendsPresence(true)
  f.ownSnapshot()
  for (let i = 0; i < 100; i++) await f.service.refreshFriendsPresence()
  assert.equal(f.counts.reads, 1)
  assert.equal(f.counts.subscriptions, 1)
  await f.service.refreshFriendsPresence(true)
  assert.equal(f.counts.reads, 2)
  assert.equal(f.counts.subscriptions, 1)
})

test('a queued edit is not lost while a profile sync is in progress', async () => {
  const { coalesceProfileSync } = load()('src/services/profileSync.ts')
  let finish, value = 'old', saved = []
  const sync = coalesceProfileSync(async () => {
    const current = value
    if (!saved.length) await new Promise(resolve => { finish = resolve })
    saved.push(current)
  })
  const first = sync(); await Promise.resolve()
  value = 'new'; const second = sync(); assert.equal(first, second)
  finish(); await second; assert.deepEqual(saved, ['old', 'new'])
})

test('the Friends renderer receives live state and refreshes without any Firestore profile or request listeners', async t => {
  const f = fixture(t, { shared: true })
  const stop = f.service.initFriendsWindowSocial()
  await Promise.resolve()
  assert.equal(f.state.settings.eclipseFriends[0].username, 'Friend')
  await f.service.refreshFriendsPresence(true)
  assert.equal(f.counts.sharedRefresh, 1)
  assert.equal(f.counts.reads, 0); assert.equal(f.counts.writes, 0)
  assert.equal(f.counts.subscriptions, 0); assert.equal(f.counts.requests, 0)
  f.receive({ ...f.sharedSnapshot, settings: { ...f.sharedSnapshot.settings, eclipseFriends: [] } })
  assert.deepEqual(f.state.settings.eclipseFriends, [])
  stop()
})

test('shared state from another account is not displayed until Firebase authenticates that account', async t => {
  const f = fixture(t, { shared: true }), stop = f.service.initFriendsWindowSocial()
  await Promise.resolve()
  f.receive({ ...f.sharedSnapshot, uid: 'other', settings: { userUid: 'other', eclipseFriends: [{ id: 'private', username: 'Other account friend' }] } })
  assert.equal(f.state.settings.userUid, 'owner')
  assert.equal(f.state.settings.eclipseFriends[0].id, 'friend')
  f.auth.currentUser = { uid: 'other' }; f.authChanged()
  assert.equal(f.state.settings.userUid, 'other')
  assert.equal(f.state.settings.eclipseFriends[0].id, 'private')
  stop()
})

test('the detached chat inbox reuses owner snapshots instead of opening another Firestore listener', async t => {
  const f = fixture(t, { shared: true }), values = []
  f.sharedSnapshot.chatInbox = [{ id: 'chat', peerId: 'friend', senderId: 'friend', text: 'Hello', updatedAt: 1 }]
  const stopSocial = f.service.initFriendsWindowSocial(); await Promise.resolve()
  const stopInbox = f.service.friendChat.watchInbox('owner', value => values.push(value), assert.fail)
  assert.equal(values[0][0].text, 'Hello')
  f.receive({ ...f.sharedSnapshot, chatInbox: [{ ...f.sharedSnapshot.chatInbox[0], text: 'Updated', updatedAt: 2 }] })
  assert.equal(values.at(-1)[0].text, 'Updated'); assert.equal(f.counts.subscriptions, 0)
  stopInbox(); stopSocial()
})
