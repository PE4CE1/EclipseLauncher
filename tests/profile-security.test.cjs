const test = require('node:test'), assert = require('node:assert/strict')
const load = require('./download-loader.cjs')

function fixture(t, overrides = {}, mode = 'launcher') {
  const previous = global.window
  t.after(() => { global.window = previous })
  const writes = [], localWrites = [], lookups = [], state = {
    settings: { userUid: 'owner', friendCode: 'ECL-OWNER', username: 'User', accountSecret: 'LEGACY-KEY', steamProfileUrl: 'https://steamcommunity.com/id/test', steamLevel: 99, steamGamesCount: 50, steamRecentGames: [{ appId: '620', name: 'Portal', playtime: '20 hrs' }], ...overrides },
    library: [], installedGames: [], activeGame: null,
    updateSettings(patch) { Object.assign(state.settings, patch) },
  }
  let resolveSteam, identity = { canonicalUid: 'owner', friendCode: 'ECL-OWNER', accountSecret: 'LEGACY-KEY' }
  const steam = new Promise(resolve => { resolveSteam = resolve })
  const auth = { currentUser: { uid: 'owner', providerData: [] }, authStateReady: async () => {} }
  global.window = { electronAPI: {
    appMode: mode,
    account: { initialIdentity: identity, getIdentity: async () => identity, saveIdentity: async value => { identity = value } },
    setSettings: async patch => { localWrites.push(patch); return { success: true } },
  } }
  const document = { id:'owner', exists: () => true, data: () => ({ schemaVersion:2, uid: 'owner', friendCode: 'ECL-OWNER', accountSecret: 'SERVER-SECRET', deviceAnchorId: 'private-device', username: 'Player' }) }
  const firebase = load({
    'firebase/app': { getApps: () => [], initializeApp: () => ({}) },
    'firebase/auth': { getAuth: () => auth },
    'firebase/firestore': {
      getFirestore: () => ({}), doc: (...parts) => parts, getDoc: async () => document,
      updateDoc: async (ref, data) => { writes.push(data) }, setDoc: async (ref, data) => { writes.push(data) },
      deleteField: () => 'DELETE_FIELD', serverTimestamp: () => 'TIMESTAMP',
      collection: () => ({}), query: (...args) => args, where: (...args) => args, documentId: () => '__name__',
      limit: value => ({ limit: value }), getDocs: async value => { lookups.push(value); return { size:1, empty: false, docs: [document] } },
    },
    '../store/gameStore': { useGameStore: { getState: () => state } },
    './notificationService': { sendAppNotification() {} },
    './steamService': { fetchSteamUserProfile: () => steam },
    './accountRecovery': {
      ...load()('src/services/accountRecovery.ts'),
      validRecoveryKey: value => value === 'NEW-KEY', newRecoveryKey: () => 'NEW-KEY', protectRecovery: async () => {},
      authenticateRecovery: async () => { const previous = auth.currentUser; auth.currentUser = { uid: 'recovered' }; return { uid: 'recovered', rollback: async () => { auth.currentUser = previous } } },
      recoveryError: error => error.message,
      resumeSavedRecovery: async () => {},
    },
  })('src/services/firebaseService.ts')
  return { firebase, state, writes, auth, localWrites, lookups, resolveSteam, api: window.electronAPI, identity: () => identity,
    tick: async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)) } }
}

test('main and deferred Steam writes both respect hidden stats and never publish a recovery credential', async t => {
  const f = fixture(t, { profileShowSteamStats: false, profileShowPlaytime: false })
  await f.firebase.syncMyProfile()
  f.resolveSteam({ username: 'Steam user', steamLevel: 100, steamGamesCount: 60, steamRecentGames: [{ appId: '620', name: 'Portal', playtime: '30 hrs' }] })
  await f.tick()
  assert.equal(f.writes.length, 2)
  const stored = Object.assign({}, ...f.writes)
  assert.equal(stored.steamLevel, null); assert.equal(stored.steamGamesCount, null); assert.deepEqual(stored.steamRecentGames, [])
  for (const write of f.writes) {
    if (Object.hasOwn(write, 'steamLevel')) assert.equal(write.steamLevel, null)
    if (Object.hasOwn(write, 'steamGamesCount')) assert.equal(write.steamGamesCount, null)
    if (Object.hasOwn(write, 'steamRecentGames')) assert.deepEqual(write.steamRecentGames, [])
    assert.ok(write.accountSecret === undefined || write.accountSecret === 'DELETE_FIELD')
    assert.doesNotMatch(JSON.stringify(write), /LEGACY-KEY|SERVER-SECRET|private-device/)
  }
  assert.equal(f.state.settings.steamLevel, 100, 'private local metadata remains available')
})

test('Clips-mode profile sync preserves existing library statistics and strips optional undefined fields', async t => {
  const f = fixture(t, { username: 'Player', steamRecentGames: [{ appId: '620', name: 'Portal', iconUrl: undefined }], hardwareSpecs: { cpu: 'CPU', gpu: undefined }, showHardwareSpecs: true }, 'clips')
  await f.firebase.syncMyProfile()
  const write = f.writes[0]
  assert.equal(Object.hasOwn(write, 'totalLibraryCount'), false)
  assert.equal(Object.hasOwn(write, 'totalInstalledCount'), false)
  assert.equal(Object.hasOwn(write, 'topPlayedGames'), false)
  assert.deepEqual(write.hardwareSpecs, { cpu: 'CPU' })
  assert.equal(Object.hasOwn(write.steamRecentGames[0], 'iconUrl'), false)
})

test('privacy changes made while Steam is fetching apply to the deferred write', async t => {
  const f = fixture(t)
  await f.firebase.syncMyProfile()
  f.state.updateSettings({ profileShowSteamStats: false, profileShowPlaytime: false, username: 'Custom name' })
  f.resolveSteam({ username: 'Steam user', steamLevel: 100 })
  await f.tick()
  assert.equal(f.writes.at(-1).steamLevel, null)
  assert.equal(f.writes.at(-1).username, 'Custom name')
})

test('a public profile is an allowlisted DTO, never the whole Firestore document', async t => {
  const f = fixture(t), profile = await f.firebase.fetchUserProfile('ECL-OWNER')
  assert.equal(profile.username, 'Player')
  assert.equal(profile.accountSecret, undefined); assert.equal(profile.deviceAnchorId, undefined)
})

test('View Profile waits for restored authentication before resolving a friend code', async t => {
  const f=fixture(t);let release
  f.auth.authStateReady=()=>new Promise(resolve=>{release=resolve})
  const pending=f.firebase.fetchUserProfile(' #ecl- owner ')
  await f.tick();assert.equal(f.lookups.length,0)
  release();const profile=await pending
  assert.equal(profile.uid,'owner');assert.equal(profile.username,'Player');assert.equal(f.lookups.length,1)
})

test('a local canonical UID cannot authorize writes on behalf of another Firebase account', async t => {
  const f = fixture(t); f.auth.currentUser.uid = 'different-auth-user'
  await f.firebase.syncMyProfile()
  assert.equal(f.writes.length, 0)
  assert.equal((await f.firebase.enableSecureRecovery()).success, false)
})

test('parallel recovery setup calls keep one credential and do not race local backups', async t => {
  const f = fixture(t)
  const results = await Promise.all([f.firebase.enableSecureRecovery(), f.firebase.enableSecureRecovery()])
  assert.ok(results.every(result => result.success))
  assert.equal(f.state.settings.accountSecret, 'NEW-KEY'); assert.equal(f.identity().accountSecret, 'NEW-KEY')
})

test('a failed native identity write rolls back local settings and authenticated recovery', async t => {
  const f = fixture(t); let failures = 0
  f.api.account.saveIdentity = async () => { if (failures++ === 0) throw Error('Identity disk full') }
  const result = await f.firebase.restoreAccountBySecret('NEW-KEY')
  assert.equal(result.success, false); assert.equal(result.errorCode, 'recovery/persistence-failed')
  assert.equal(f.auth.currentUser.uid, 'owner'); assert.equal(f.firebase.getCanonicalUid(), 'owner')
  assert.equal(f.localWrites.at(-1).userUid, 'owner')
})

test('an already linked recovery credential is never replaced when its local key is missing', async t => {
  const f = fixture(t)
  f.auth.currentUser.providerData = [{ providerId: 'password' }]
  const result = await f.firebase.enableSecureRecovery()
  assert.equal(result.success, false); assert.equal(f.state.settings.accountSecret, 'LEGACY-KEY')
  assert.equal(f.identity().accountSecret, 'LEGACY-KEY')
})

test('Steam game playtime is removed independently of the Steam statistics preference', () => {
  const { publicSteamProfileStats } = load()('src/services/profileModel.ts')
  const result = publicSteamProfileStats({ profileShowPlaytime: false, steamLevel: 12, steamGames: [{ appId: '620', name: 'Portal', playtime: '20 hrs' }], steamRecentGames: [{ appId: '620', name: 'Portal', playtime: '20 hrs' }] })
  assert.equal(result.steamLevel, 12)
  assert.equal(result.steamGames[0].playtime, ''); assert.equal(result.steamRecentGames[0].playtime, '')
})
