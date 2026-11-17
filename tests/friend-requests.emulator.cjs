const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),load=require('./download-loader.cjs')
const local=createRequire(path.resolve('.cache/firebase-security/package.json'))
const {initializeTestEnvironment,assertFails}=local('@firebase/rules-unit-testing'),sdk=local('firebase/firestore')
const {doc,getDoc,setDoc,updateDoc,getDocs,collection,serverTimestamp}=sdk
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Only local Firebase emulators may run these tests')
const projectId='demo-eclipse-security'
let environment
const profiles={alice:{schemaVersion:2,uid:'alice',username:'Alice',friendCode:'ECL-ALICE',avatarUrl:'',friends:[]},bob:{schemaVersion:2,uid:'bob',username:'Bob',friendCode:'ECL-BOBBY',avatarUrl:'',friends:[]},outsider:{schemaVersion:2,uid:'outsider',username:'Outsider',friendCode:'ECL-OTHER',avatarUrl:'',friends:[]}}
test.before(async()=>{environment=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync('firestore.rules','utf8')}})})
test.after(async()=>environment?.cleanup())
test.beforeEach(async()=>{await environment.clearFirestore();await environment.withSecurityRulesDisabled(async context=>{for(const [id,data]of Object.entries(profiles))await setDoc(doc(context.firestore(),'users',id),data)})})
const until=async check=>{const deadline=Date.now()+7000;while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,30))}throw Error('Request listener timed out')}
function client(t,uid){
  const db=environment.authenticatedContext(uid).firestore(),notices=[],errors=[]
  const state={settings:{language:'en',eclipseFriends:[],incomingFriendRequests:[],outgoingFriendRequests:[]},updateSettings:patch=>Object.assign(state.settings,patch)}
  const loader=load({'firebase/firestore':sdk,'../store/gameStore':{useGameStore:{getState:()=>state}},'./notificationService':{sendAppNotification:async options=>notices.push(options)}})
  const {findPublicSocialProfile}=loader('src/services/publicSocialProfile.ts')
  const manager=loader('src/services/friendRequests.ts').createFriendRequests({db,requireUid:async()=>uid,findProfile:value=>findPublicSocialProfile(db,value),reportError:(context,error)=>{errors.push({context,error});if(context.startsWith('Listen'))console.warn(uid,context,error.message)}})
  t.after(manager.stop)
  return{db,state,notices,errors,manager,lookup:value=>findPublicSocialProfile(db,value)}
}

test('friend-code profile lookup accepts copied/lowercase/prefixless codes and returns the authoritative UID',async t=>{
  const alice=client(t,'alice')
  for(const value of ['ECL-BOBBY',' #ecl- bobby\u200b ','bobby','bob']){
    const profile=await alice.lookup(value);assert.equal(profile.uid,'bob',value);assert.equal(profile.username,'Bob')
  }
  assert.equal(await alice.lookup('missing'),null);assert.equal(await alice.lookup('../bob'),null)
  await environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),'users','legacy'),{uid:'legacy',friendCode:'ECL-OLD11',accountSecret:'private'}))
  assert.equal(await alice.lookup('ECL-OLD11'),null)
})

test('sending creates a real invitation, delivers one temporary notification and never instantly adds either player',async t=>{
  const alice=client(t,'alice'),bob=client(t,'bob');alice.manager.start('alice');bob.manager.start('bob')
  assert.equal((await alice.manager.send('ECL-BOBBY')).state,'sent')
  await until(()=>bob.state.settings.incomingFriendRequests.length===1&&alice.state.settings.outgoingFriendRequests.length===1&&bob.notices.length===1)
  assert.equal(bob.state.settings.incomingFriendRequests[0].fromUsername,'Alice')
  assert.equal(bob.notices[0].duration,6000);assert.match(bob.notices[0].body,/Open Friends/)
  assert.deepEqual((await getDoc(doc(alice.db,'users','alice'))).data().friends,[])
  assert.deepEqual((await getDoc(doc(bob.db,'users','bob'))).data().friends,[])
  assert.equal((await alice.manager.send('ECL-BOBBY')).state,'pending')
  assert.equal((await bob.manager.send('ECL-ALICE')).state,'incoming')
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(bob.notices.length,1)
  assert.equal(alice.state.settings.eclipseFriends.length,0);assert.equal(bob.state.settings.eclipseFriends.length,0)
})

test('only accepting atomically links both users and removes the invitation from both live pending lists',async t=>{
  const alice=client(t,'alice'),bob=client(t,'bob');alice.manager.start('alice');bob.manager.start('bob')
  await alice.manager.send('ECL-BOBBY');await until(()=>bob.state.settings.incomingFriendRequests.length===1)
  const accepted=await bob.manager.accept('alice');assert.equal(accepted.success,true,accepted.error)
  await until(()=>!bob.state.settings.incomingFriendRequests.length&&!alice.state.settings.outgoingFriendRequests.length)
  assert.deepEqual((await getDoc(doc(alice.db,'users','alice'))).data().friends,['bob'])
  assert.deepEqual((await getDoc(doc(bob.db,'users','bob'))).data().friends,['alice'])
  assert.equal(bob.state.settings.eclipseFriends[0].id,'alice')
  assert.equal((await alice.manager.send('ECL-BOBBY')).state,'friends')
})

test('declining and cancelling remove pending invitations without granting friendship, and immediate resend is blocked',async t=>{
  const alice=client(t,'alice'),bob=client(t,'bob')
  await alice.manager.send('ECL-BOBBY');assert.equal((await bob.manager.decline('alice')).success,true)
  assert.equal((await getDoc(doc(alice.db,'friend_requests','alice__bob'))).data().status,'declined')
  assert.equal((await alice.manager.send('ECL-BOBBY')).success,false)
  assert.equal((await bob.manager.send('ECL-ALICE')).state,'sent')
  assert.equal((await bob.manager.cancel('alice')).success,true)
  assert.equal((await getDoc(doc(bob.db,'friend_requests','bob__alice'))).data().status,'cancelled')
  assert.deepEqual((await getDoc(doc(bob.db,'users','bob'))).data().friends,[])
})

test('outsiders cannot read requests, forge sender details, accept invitations or add themselves without consent',async t=>{
  const alice=client(t,'alice'),bob=client(t,'bob'),outsider=client(t,'outsider')
  await alice.manager.send('ECL-BOBBY')
  await assertFails(getDoc(doc(outsider.db,'friend_requests','alice__bob')))
  await assertFails(getDocs(collection(outsider.db,'friend_requests')))
  await assertFails(updateDoc(doc(alice.db,'friend_requests','alice__bob'),{status:'accepted',updatedAt:serverTimestamp()}))
  await assertFails(updateDoc(doc(bob.db,'friend_requests','alice__bob'),{status:'accepted',updatedAt:serverTimestamp()}))
  await assertFails(updateDoc(doc(outsider.db,'users','bob'),{friends:['outsider']}))
  await assertFails(updateDoc(doc(outsider.db,'users','outsider'),{friends:['bob']}))
  const forged={...(await getDoc(doc(alice.db,'friend_requests','alice__bob'))).data(),fromUsername:'Bob',toUid:'outsider',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}
  await assertFails(setDoc(doc(alice.db,'friend_requests','alice__outsider'),forged))
  await assertFails(updateDoc(doc(bob.db,'friend_requests','alice__bob'),{fromUid:'outsider',status:'declined',updatedAt:serverTimestamp()}))
  assert.equal((await getDoc(doc(bob.db,'friend_requests','alice__bob'))).data().status,'pending')
})

test('a failed acceptance keeps both friend lists unchanged and leaves the request pending',async t=>{
  const alice=client(t,'alice'),bob=client(t,'bob')
  await alice.manager.send('ECL-BOBBY')
  await environment.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'users','bob'),{friends:Array.from({length:500},(_,i)=>'friend-'+i)}))
  const result=await bob.manager.accept('alice');assert.equal(result.success,false)
  assert.deepEqual((await getDoc(doc(alice.db,'users','alice'))).data().friends,[])
  assert.equal((await getDoc(doc(bob.db,'friend_requests','alice__bob'))).data().status,'pending')
})

test('the secondary friends window receives requests without duplicate toasts and stops listeners cleanly',async t=>{
  const alice=client(t,'alice'),bob=client(t,'bob');bob.manager.start('bob',false)
  await alice.manager.send('ECL-BOBBY');await until(()=>bob.state.settings.incomingFriendRequests.length===1)
  assert.equal(bob.notices.length,0);bob.manager.stop()
  await alice.manager.cancel('bob');await new Promise(resolve=>setTimeout(resolve,100))
  assert.equal(bob.state.settings.incomingFriendRequests.length,1)
})
