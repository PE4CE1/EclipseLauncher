import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, startAfter, where, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore'
import { createSharedChatInbox } from './sharedChatInbox'

export const CHAT_COOLDOWN_MS = 5000
export const CHAT_MAX_LENGTH = 2000
export interface ChatMessage { id:string; senderId:string; text:string; createdAt:number }
export interface ChatThread { id:string; peerId:string; text:string; senderId:string; updatedAt:number; messageId?:string }
export class ChatCooldownError extends Error { constructor(readonly retryAt:number){super('chat-cooldown')} }
const millis=(value:any)=>typeof value?.toMillis==='function'?value.toMillis():0
const validUid=(uid:string)=>typeof uid==='string'&&uid.length>0&&uid.length<=128&&!/[\/]/.test(uid)
export function friendChatId(a:string,b:string){
  if(!validUid(a)||!validUid(b)||a===b)throw Error('invalid-chat-recipient')
  return [a,b].sort().join('__')
}
export function createFriendChat({db,requireUid}:{db:Firestore;requireUid:()=>Promise<string>}){
  const watchInbox = createSharedChatInbox((uid, receive, fail) => onSnapshot(query(collection(db,'chats'),where('members','array-contains',uid),orderBy('updatedAt','desc'),limit(100)),snapshot=>receive(snapshot.docs.map(item=>{const data=item.data();return{id:item.id,peerId:data.members.find((member:string)=>member!==uid),text:data.lastMessage,senderId:data.lastSenderId,updatedAt:millis(data.updatedAt),messageId:data.lastMessageId}})),fail))
  return {
    requireUid,
    watchInbox,
    watchCooldown(uid:string,receive:(until:number)=>void,fail:(error:unknown)=>void){return onSnapshot(doc(db,'chat_cooldowns',uid),snapshot=>receive(snapshot.exists()?millis(snapshot.data().lastSentAt)+CHAT_COOLDOWN_MS:0),fail)},
    watchMessages(uid:string,peer:string,receive:(messages:ChatMessage[])=>void,fail:(error:unknown)=>void){
      const ref=doc(db,'chats',friendChatId(uid,peer));let stopMessages:(()=>void)|undefined,closed=false
      const stop=onSnapshot(ref,snapshot=>{
        if(closed)return
        if(!snapshot.exists()){receive([]);return}
        if(!snapshot.data().members?.includes(uid)){fail(Error('chat-access-denied'));return}
        if(!stopMessages)stopMessages=onSnapshot(query(collection(ref,'messages'),orderBy('createdAt','desc'),limit(50)),messages=>receive(messages.docs.map(item=>({id:item.id,senderId:item.data().senderId,text:item.data().text,createdAt:millis(item.data().createdAt)})).reverse()),fail)
      },fail)
      return()=>{closed=true;stop();stopMessages?.()}
    },
    async history(uid:string,peer:string,before:ChatMessage){
      const pivot=await getDoc(doc(db,'chats',friendChatId(uid,peer),'messages',before.id))
      if(!pivot.exists())return []
      const snapshot=await getDocs(query(collection(db,'chats',friendChatId(uid,peer),'messages'),orderBy('createdAt','desc'),startAfter(pivot as QueryDocumentSnapshot),limit(50)))
      return snapshot.docs.map(item=>({id:item.id,senderId:item.data().senderId,text:item.data().text,createdAt:millis(item.data().createdAt)})).reverse()
    },
    async send(peer:string,value:string){
      const text=value.trim()
      if(!text||text.length>CHAT_MAX_LENGTH)throw Error('invalid-chat-message')
      const uid=await requireUid(),id=friendChatId(uid,peer),chat=doc(db,'chats',id),message=doc(collection(chat,'messages')),cooldown=doc(db,'chat_cooldowns',uid)
      await runTransaction(db,async transaction=>{
        const [previous,thread]=await Promise.all([transaction.get(cooldown),transaction.get(chat)])
        const retryAt=previous.exists()?millis(previous.data().lastSentAt)+CHAT_COOLDOWN_MS:0
        if(Date.now()<retryAt)throw new ChatCooldownError(retryAt)
        const members=[uid,peer].sort()
        if(thread.exists()&&JSON.stringify(thread.data().members)!==JSON.stringify(members))throw Error('chat-access-denied')
        transaction.set(chat,{members,updatedAt:serverTimestamp(),lastMessage:text,lastSenderId:uid,lastMessageId:message.id})
        transaction.set(message,{senderId:uid,text,createdAt:serverTimestamp()})
        transaction.set(cooldown,{lastSentAt:serverTimestamp(),chatId:id,messageId:message.id})
      })
      return {id:message.id,nextAllowedAt:Date.now()+CHAT_COOLDOWN_MS}
    },
  }
}
