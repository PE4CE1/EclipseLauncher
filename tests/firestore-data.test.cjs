const test = require('node:test'), assert = require('node:assert/strict')
const load = require('./download-loader.cjs')

test('profile writes omit nested undefined fields while preserving Firestore values and array positions', async () => {
  const { firestoreData } = load()('src/services/firestoreData.ts')
  const { initializeApp, deleteApp } = require('firebase/app')
  const { getFirestore, doc, writeBatch, serverTimestamp, deleteField, Timestamp } = require('firebase/firestore')
  const app = initializeApp({ projectId: 'eclipse-local-validation' }, 'undefined-validation')
  try {
    const db = getFirestore(app), ref = doc(db, 'users/test'), timestamp = serverTimestamp(), removed = deleteField(), date = Timestamp.now()
    const data = { steamRecentGames: [{ name: 'Game', iconUrl: undefined, playtime: undefined }], hardwareSpecs: { cpu: 'CPU', gpu: undefined }, optional: undefined, values: [undefined, 1], timestamp, removed, date }
    assert.throws(() => writeBatch(db).update(ref, data), /undefined/)
    const clean = firestoreData(data)
    assert.equal(Object.hasOwn(clean, 'optional'), false)
    assert.deepEqual(clean.steamRecentGames, [{ name: 'Game' }])
    assert.deepEqual(clean.hardwareSpecs, { cpu: 'CPU' })
    assert.deepEqual(clean.values, [null, 1])
    assert.equal(clean.timestamp, timestamp); assert.equal(clean.removed, removed); assert.equal(clean.date, date)
    // Parsing is real SDK validation; no commit or network write is performed.
    assert.doesNotThrow(() => writeBatch(db).update(ref, clean))
    assert.equal(Object.hasOwn(data, 'optional'), true)
  } finally { await deleteApp(app) }
})

test('SteamVR runtime helpers do not start game sessions or automatic replay capture', () => {
  const { identifyGameProcess } = load()('electron/gameDetection.ts')
  for (const exe of ['vrcompositor.exe', 'vrserver.exe', 'vrmonitor.exe', 'vrdashboard.exe']) assert.equal(identifyGameProcess(exe, 'SteamVR'), undefined)
  assert.equal(identifyGameProcess('halflifealyx.exe', 'Half-Life: Alyx').name, 'Half-Life: Alyx')
})
