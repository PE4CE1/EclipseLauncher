const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const load = require('./download-loader.cjs')
const securityRequire = createRequire(path.resolve('.cache/firebase-security/package.json'))
const { initializeTestEnvironment, assertSucceeds, assertFails } = securityRequire('@firebase/rules-unit-testing')
const { doc, getDoc, setDoc, updateDoc, deleteField, collection, query, where, getDocs, arrayUnion, arrayRemove } = securityRequire('firebase/firestore')

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('Run through firebase emulators:exec with project demo-eclipse-security; production access is forbidden.')
const projectId = 'demo-eclipse-security'
let environment
test.before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } })
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', 'owner'), { schemaVersion: 2, uid: 'owner', username: 'Owner', friendCode: 'ECL-OWNER', friends: [] })
    await setDoc(doc(db, 'users', 'other'), { schemaVersion: 2, uid: 'other', username: 'Other', friendCode: 'ECL-OTHER', friends: [] })
    await setDoc(doc(db, 'users', 'legacy'), { uid: 'legacy', username: 'Legacy', accountSecret: 'OLD-EXPOSED-KEY', deviceAnchorId: 'old-device', friends: [] })
    await setDoc(doc(db, 'device_identities', 'device'), { canonicalUid: 'legacy', accountSecret: 'OLD-EXPOSED-KEY' })
  })
})
test.after(async () => { await environment?.cleanup() })

test('only authenticated readers see sanitized profiles; legacy keys and hardware anchors are inaccessible', async () => {
  const guest = environment.unauthenticatedContext().firestore(), reader = environment.authenticatedContext('reader').firestore()
  await assertFails(getDoc(doc(guest, 'users', 'owner')))
  await assertSucceeds(getDoc(doc(reader, 'users', 'owner')))
  await assertFails(getDoc(doc(reader, 'users', 'legacy')))
  await assertFails(getDoc(doc(reader, 'device_identities', 'device')))
  const result = await assertSucceeds(getDocs(query(collection(reader, 'users'), where('schemaVersion', '==', 2))))
  assert.equal(result.size, 2)
  await assertFails(getDocs(collection(reader, 'users')))
})

test('profile writes cannot introduce private fields or modify somebody else’s identity', async () => {
  const owner = environment.authenticatedContext('owner').firestore(), reader = environment.authenticatedContext('reader').firestore()
  await assertSucceeds(updateDoc(doc(owner, 'users', 'owner'), { username: 'Updated' }))
  await assertFails(updateDoc(doc(owner, 'users', 'owner'), { accountSecret: 'NEVER-PUBLIC' }))
  await assertFails(updateDoc(doc(owner, 'users', 'owner'), { deviceAnchorId: 'device' }))
  await assertFails(updateDoc(doc(owner, 'users', 'owner'), { uid: 'other' }))
  await assertFails(updateDoc(doc(reader, 'users', 'owner'), { username: 'Stolen' }))
  await assertFails(setDoc(doc(reader, 'users', 'stolen'), { schemaVersion: 2, uid: 'stolen', friends: [] }))
})

test('unsolicited bilateral additions are denied; existing connections can remove only the caller’s membership', async () => {
  const owner = environment.authenticatedContext('owner').firestore()
  await assertFails(updateDoc(doc(owner, 'users', 'other'), { friends: arrayUnion('owner') }))
  await assertFails(updateDoc(doc(owner, 'users', 'other'), { friends: arrayUnion('stranger') }))
  await assertFails(updateDoc(doc(owner, 'users', 'other'), { friends: arrayUnion('owner'), username: 'Stolen' }))
  await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(),'users','other'),{friends:['owner']}))
  await assertSucceeds(updateDoc(doc(owner, 'users', 'other'), { friends: arrayRemove('owner') }))
})

test('only the actual owner can sanitize an old profile and publish schema 2', async () => {
  const owner = environment.authenticatedContext('legacy').firestore()
  await assertSucceeds(getDoc(doc(owner, 'users', 'legacy')))
  await assertFails(updateDoc(doc(owner, 'users', 'legacy'), { schemaVersion: 2 }))
  await assertSucceeds(updateDoc(doc(owner, 'users', 'legacy'), { schemaVersion: 2, accountSecret: deleteField(), deviceAnchorId: deleteField() }))
  const publicDoc = await assertSucceeds(getDoc(doc(environment.authenticatedContext('reader').firestore(), 'users', 'legacy')))
  assert.equal(publicDoc.data().accountSecret, undefined)
})

test('recovery authenticates the existing UID, rejects old/wrong keys, and supports rollback', async () => {
  const { initializeApp, deleteApp } = require('firebase/app')
  const { getAuth, connectAuthEmulator, signInAnonymously, signOut } = require('firebase/auth')
  const { newRecoveryKey, protectRecovery, authenticateRecovery } = load()('src/services/accountRecovery.ts')
  const app = initializeApp({ projectId, apiKey: 'demo-key' }, `recovery-${Date.now()}`)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  try {
    const original = await signInAnonymously(auth), key = newRecoveryKey(), uid = original.user.uid
    await assert.rejects(protectRecovery(auth, 'somebody-else', key), error => error.code === 'recovery/session-mismatch')
    await protectRecovery(auth, uid, key)
    assert.equal(auth.currentUser.uid, uid)
    assert.equal(auth.currentUser.isAnonymous, false)
    await protectRecovery(auth, uid, key)
    await signOut(auth)
    const temporary = await signInAnonymously(auth)
    await assert.rejects(authenticateRecovery(auth, 'ECL-SEC-ABCD-EFGH-JKLM-NPQR'), error => error.code === 'recovery/invalid-key')
    await assert.rejects(authenticateRecovery(auth, newRecoveryKey()))
    assert.equal(auth.currentUser.uid, temporary.user.uid)
    const recovered = await authenticateRecovery(auth, key.toLowerCase())
    assert.equal(recovered.uid, uid)
    await recovered.rollback()
    assert.equal(auth.currentUser.uid, temporary.user.uid)
  } finally { await deleteApp(app) }
})

test('administrator migration strips literal dotted private fields without exposing them under schema 2', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(),'users','migration-test'), { uid: 'wrong', accountSecret: 'old-key', 'private.key': 'secret', showSteamStats: false, steamLevel: 99, friends: [] })
  })
  const { execFileSync } = require('node:child_process')
  const output = execFileSync(process.execPath,['scripts/migrate-profile-security.cjs','--project',projectId,'--apply'],{env:process.env,encoding:'utf8',windowsHide:true})
  assert.equal(JSON.parse(output).conflicts,0)
  const snapshot = await assertSucceeds(getDoc(doc(environment.authenticatedContext('reader').firestore(),'users','migration-test')))
  assert.equal(snapshot.data().uid,'migration-test'); assert.equal(snapshot.data().accountSecret,undefined)
  assert.equal(snapshot.data()['private.key'],undefined); assert.equal(snapshot.data().steamLevel,null)
})

test('CLI REST migration uses the same schema, strips private fields, preserves timestamps and blocks stale writes', async()=>{
  const {firebaseAdminClient,adminRequest}=require('../scripts/firebase-admin-rest.cjs')
  const client=firebaseAdminClient('firestore',projectId),base=`projects/${projectId}/databases/(default)/documents/users/rest-migration`
  const device=`projects/${projectId}/databases/(default)/documents/device_identities/rest-device`
  const date={timestampValue:'2026-11-03T20:00:00.123456789Z'}
  await client.patch(device,{fields:{accountSecret:{stringValue:'private'}}},adminRequest())
  await client.patch(base,{fields:{accountSecret:{stringValue:'private'},'private.key':{stringValue:'private'},lastSeen:date,showPlaytime:{booleanValue:false}}},adminRequest())
  const initial=await client.get(base,adminRequest())
  const conditional=await client.post(`projects/${projectId}/databases/(default)/documents:commit`,{writes:[{update:{name:base,fields:initial.body.fields},currentDocument:{updateTime:initial.body.updateTime}}]},adminRequest({resolveOnHTTPError:true}))
  assert.ok(conditional.status<400)
  const {execFileSync}=require('node:child_process')
  const result=JSON.parse(execFileSync(process.execPath,['scripts/migrate-profile-security.cjs','--project',projectId,'--firebase-cli','--apply'],{env:process.env,encoding:'utf8',windowsHide:true}))
  assert.equal(result.conflicts,0);assert.ok(result.backup)
  const migrated=await client.get(base,adminRequest())
  assert.equal(migrated.body.fields.accountSecret,undefined);assert.equal(migrated.body.fields['private.key'],undefined)
  assert.deepEqual(migrated.body.fields.lastSeen,initial.body.fields.lastSeen)
  const deleted=await client.get(device,adminRequest({resolveOnHTTPError:true}));assert.equal(deleted.status,404)
  const stale=migrated.body.updateTime
  await client.patch(base,{fields:{...migrated.body.fields,username:{stringValue:'Newer'}}},adminRequest())
  const response=await client.post(`projects/${projectId}/databases/(default)/documents:commit`,{writes:[{update:{name:base,fields:migrated.body.fields},currentDocument:{updateTime:stale}}]},adminRequest({resolveOnHTTPError:true}))
  assert.equal(response.body.error.status,'FAILED_PRECONDITION')
  const fs=require('node:fs');assert.equal(path.dirname(result.backup),path.resolve('.cache/firebase-security/backups'));fs.unlinkSync(result.backup)
})

test('an authenticated administrator can migrate a legacy owner; the client resumes using only the new key',async()=>{
  const {initializeApp,deleteApp}=require('firebase/app'),{getAuth,connectAuthEmulator,signInAnonymously,signOut}=require('firebase/auth')
  const {firebaseAdminClient,adminRequest}=require('../scripts/firebase-admin-rest.cjs')
  const {newRecoveryKey,recoveryCredentials,resumeSavedRecovery,protectRecovery}=load()('src/services/accountRecovery.ts')
  const app=initializeApp({projectId,apiKey:'demo-key'},`migration-${Date.now()}`),auth=getAuth(app)
  connectAuthEmulator(auth,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true})
  try{
    const owner=(await signInAnonymously(auth)).user.uid,key=newRecoveryKey(),credential=await recoveryCredentials(key)
    const admin=firebaseAdminClient('authAccounts',projectId)
    await admin.post(`projects/${projectId}/accounts:update`,{localId:owner,email:credential.email,password:credential.password},adminRequest())
    await signOut(auth);const temporary=(await signInAnonymously(auth)).user.uid
    await assert.rejects(resumeSavedRecovery(auth,owner,'ECL-TEST1'),error=>error.code==='recovery/session-mismatch')
    assert.equal(auth.currentUser.uid,temporary)
    await resumeSavedRecovery(auth,owner,key);assert.equal(auth.currentUser.uid,owner)
    await protectRecovery(auth,owner,key)
    assert.equal(auth.currentUser.providerData.some(provider=>provider.providerId==='password'),true)
  }finally{await deleteApp(app)}
})
