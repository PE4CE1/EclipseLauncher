const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
function fixture(t){
 const previous=global.window;t.after(()=>{global.window=previous})
 global.window={electronAPI:{account:{initialIdentity:{canonicalUid:'owner',friendCode:'ECL-OWNER'}}}}
 const ids=Array.from({length:65},(_,i)=>'friend-'+i),calls=[],state={settings:{eclipseFriends:[{id:'76561198000000001',username:'Steam',status:'offline'}]},updateSettings:patch=>Object.assign(state.settings,patch)}
 let failed=false,reads=0
 const sdk={getFirestore:()=>({}),doc:(_db,collection,id)=>({collection,id}),collection:(_db,name)=>name,where:(field,op,value)=>({field,op,value}),documentId:()=> '__name__',query:(collection,...filters)=>({collection,filters}),
 getDoc:async()=>{reads++;if(failed)throw Error('Network offline');return{exists:()=>true,data:()=>({schemaVersion:2,friends:ids})}},
 getDocs:async query=>{const values=query.filters.find(f=>f.op==='in').value;calls.push(values);return{docs:values.map(id=>({id,data:()=>({username:id,status:'online',lastSeen:{toMillis:()=>Date.now()}})}))}},onSnapshot:()=>()=>{}}
 const service=load({'firebase/app':{getApps:()=>[],initializeApp:()=>({})},'firebase/auth':{getAuth:()=>({authStateReady:async()=>{},currentUser:{uid:'owner'}})},'firebase/firestore':sdk,'./friendRequests':{friendFromProfile:(data,id)=>({id,...data}),createFriendRequests:()=>({start(){}})},'../store/gameStore':{useGameStore:{getState:()=>state}},'./notificationService':{}})('src/services/firebaseService.ts')
 return{service,state,calls,reads:()=>reads,fail:()=>failed=true}
}
test('friend refresh coalesces concurrent calls, loads every 30-user batch and preserves local Steam contacts',async t=>{
 const f=fixture(t),first=f.service.refreshFriendsPresence(true),second=f.service.refreshFriendsPresence(true)
 assert.equal(first,second);await first
 assert.equal(f.reads(),1);assert.deepEqual(f.calls.map(batch=>batch.length),[30,30,5]);assert.equal(f.state.settings.eclipseFriends.length,66)
 assert.ok(f.state.settings.eclipseFriends.some(friend=>friend.id==='friend-64'))
 await f.service.refreshFriendsPresence();assert.equal(f.reads(),1,'Immediate automatic refresh should reuse the completed result')
})
test('a failed friend reload reports failure and keeps the last usable list',async t=>{
 const f=fixture(t),before=f.state.settings.eclipseFriends;f.fail();t.mock.method(console,'warn',()=>{})
 await assert.rejects(f.service.refreshFriendsPresence(true),/Network offline/);assert.equal(f.state.settings.eclipseFriends,before)
})
