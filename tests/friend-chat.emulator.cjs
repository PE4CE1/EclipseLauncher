const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),crypto=require('node:crypto')
const local=createRequire(path.resolve('.cache/firebase-security/package.json')),sdk=local('firebase/firestore'),{initializeTestEnvironment,assertFails}=local('@firebase/rules-unit-testing')
const {doc,setDoc,getDoc,getDocs,collection,query,orderBy,limit,writeBatch,serverTimestamp,Timestamp,updateDoc,deleteDoc}=sdk
const {createFriendChat,friendChatId}=require('./download-loader.cjs')({'firebase/firestore':sdk})('src/services/friendChat.ts')
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Chat security tests require a local emulator')
let env
test.before(async()=>{env=await initializeTestEnvironment({projectId:'demo-eclipse-security',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}})})
test.after(async()=>env?.cleanup())
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const [uid,friends]of Object.entries({alice:['bob','carol'],bob:['alice'],carol:['alice'],outsider:[]}))await setDoc(doc(db,'users',uid),{schemaVersion:2,uid,username:uid,friendCode:'ECL-'+uid.toUpperCase(),avatarUrl:'',friends})})})
const client=uid=>{const db=env.authenticatedContext(uid).firestore();return{db,api:createFriendChat({db,requireUid:async()=>uid})}}
const until=async check=>{const deadline=Date.now()+8000;while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Realtime chat delivery timed out')}
function rawSend(db,from,to,text='raw',extra={}){
 const id=friendChatId(from,to),messageId=crypto.randomUUID(),batch=writeBatch(db)
 batch.set(doc(db,'chats',id),{members:[from,to].sort(),lastMessage:text,lastSenderId:from,lastMessageId:messageId,updatedAt:serverTimestamp()})
 batch.set(doc(db,'chats',id,'messages',messageId),{senderId:from,text,createdAt:serverTimestamp(),...extra})
 batch.set(doc(db,'chat_cooldowns',from),{chatId:id,messageId,lastSentAt:serverTimestamp()})
 return batch.commit()
}

test('live inbox notifications honor local muting without interrupting message delivery',async t=>{
 const {createChatNotificationObserver}=require('./download-loader.cjs')()('src/services/chatNotifications.ts')
 const alice=client('alice'),bob=client('bob'),notices=[];let ready=false,threads=[],settings={}
 const observer=createChatNotificationObserver({uid:'bob',currentUid:()=> 'bob',settings:()=>settings,friends:()=>[{id:'alice',username:'Alice'}],readAt:()=>0,isActive:async()=>false,notify:(_friend,thread)=>notices.push(thread)})
 t.after(()=>observer.stop());t.after(bob.api.watchInbox('bob',value=>{ready=true;threads=value;observer.receive(value)},error=>assert.fail(error.message)))
 await until(()=>ready);await alice.api.send('bob','Notify me');await until(()=>notices.length===1)
 assert.equal(notices[0].text,'Notify me');assert.ok(notices[0].messageId)
 settings={chatMutedFriends:{bob:['alice']}}
 await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'chat_cooldowns','alice'),{lastSentAt:Timestamp.fromMillis(Date.now()-10000)}))
 await alice.api.send('bob','Delivered silently');await until(()=>threads[0]?.text==='Delivered silently')
 assert.equal(notices.length,1)
 settings={chatMutedFriends:{bob:[]}}
 observer.receive(threads);await new Promise(resolve=>setTimeout(resolve,40));assert.equal(notices.length,1)
 await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'chat_cooldowns','alice'),{lastSentAt:Timestamp.fromMillis(Date.now()-10000)}))
 await alice.api.send('bob','Unmuted again');await until(()=>notices.length===2)
})
test('two independent friends receive real-time private messages and inbox previews',async t=>{
 const alice=client('alice'),bob=client('bob');let messages=[],threads=[]
 t.after(bob.api.watchMessages('bob','alice',value=>messages=value,error=>assert.fail(error.message)))
 t.after(bob.api.watchInbox('bob',value=>threads=value,error=>assert.fail(error.message)))
 await alice.api.send('bob','Hello Bob 👋')
 await until(()=>messages.length===1&&threads.length===1)
 assert.equal(messages[0].text,'Hello Bob 👋');assert.equal(threads[0].peerId,'alice')
 await bob.api.send('alice','Hi Alice')
 await until(()=>messages.length===2)
 assert.equal(messages[1].senderId,'bob');assert.ok(messages[0].createdAt>0)
 const outsider=client('outsider'),id=friendChatId('alice','bob')
 await assertFails(getDoc(doc(outsider.db,'chats',id)))
 await assertFails(getDocs(query(collection(outsider.db,'chats',id,'messages'),limit(50))))
 await assertFails(getDoc(doc(bob.db,'chat_cooldowns','alice')))
})
test('five-second cooldown is enforced on the server across chats, clients and direct batched writes',async()=>{
 const alice=client('alice');await alice.api.send('bob','First')
 await assertFails(rawSend(alice.db,'alice','bob','Too soon'))
 await assertFails(rawSend(alice.db,'alice','carol','Other recipient'))
 await assert.rejects(client('alice').api.send('bob','Second window'),/chat-cooldown/)
 await assertFails(deleteDoc(doc(alice.db,'chat_cooldowns','alice')))
 await new Promise(resolve=>setTimeout(resolve,5100))
 await alice.api.send('carol','Allowed after five seconds')
 assert.equal((await getDocs(query(collection(alice.db,'chats',friendChatId('alice','carol'),'messages'),limit(50)))).size,1)
})
test('non-friends, spoofed senders, oversized text, edits and partial writes are rejected',async()=>{
 const alice=client('alice'),outsider=client('outsider')
 await assertFails(rawSend(outsider.db,'outsider','bob'))
 await assertFails(rawSend(outsider.db,'alice','bob'))
 await assertFails(rawSend(alice.db,'alice','bob','x'.repeat(2001)))
 await assertFails(rawSend(alice.db,'alice','bob','spoofed',{senderId:'bob'}))
 await alice.api.send('bob','Immutable')
 const ref=doc(alice.db,'chats',friendChatId('alice','bob')),chat=(await getDoc(ref)).data(),message=doc(ref,'messages',chat.lastMessageId)
 await assertFails(updateDoc(message,{text:'edited'}));await assertFails(deleteDoc(message))
 await assertFails(setDoc(doc(ref,'messages','no-cooldown'),{text:'Bypass',senderId:'alice',createdAt:serverTimestamp()}))
 await env.withSecurityRulesDisabled(async context=>{await updateDoc(doc(context.firestore(),'users','bob'),{friends:[]});await updateDoc(doc(context.firestore(),'chat_cooldowns','alice'),{lastSentAt:Timestamp.fromMillis(Date.now()-10000)})})
 await assertFails(rawSend(alice.db,'alice','bob','Friend removed'))
})
test('concurrent sends from two windows commit at most one message',async()=>{
 const a=client('alice'),b=client('alice'),results=await Promise.allSettled([a.api.send('bob','A'),b.api.send('bob','B')])
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
 const messages=await getDocs(query(collection(a.db,'chats',friendChatId('alice','bob'),'messages'),orderBy('createdAt','desc'),limit(50)))
 assert.equal(messages.size,1)
})
test('message history loads older pages without duplicating the live page',async t=>{
 const alice=client('alice');await alice.api.send('bob','First message')
 const id=friendChatId('alice','bob'),base=Date.now()+1000
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore(),batch=writeBatch(db);for(let index=0;index<100;index++)batch.set(doc(db,'chats',id,'messages','history-'+index),{senderId:'alice',text:'Message '+index,createdAt:Timestamp.fromMillis(base+index)});await batch.commit()})
 let messages=[];t.after(alice.api.watchMessages('alice','bob',items=>messages=items,error=>assert.fail(error.message)))
 await until(()=>messages.length===50)
 const older=await alice.api.history('alice','bob',messages[0])
 assert.equal(older.length,50);assert.equal(new Set([...messages,...older].map(item=>item.id)).size,100)
 assert.equal((await alice.api.history('alice','bob',older[0])).length,1)
})
