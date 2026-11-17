import {useGameStore} from '../src/store/gameStore'
import type {EclipseFriend} from '../src/types/game'
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
export let isFirestorePermissionDenied=false
export const friendsFixture={refreshes:0,adds:[] as string[],profiles:[] as string[],notifications:[] as unknown[],failRefresh:false,failAdd:false,delay:90}
export async function refreshFriendsPresence(){friendsFixture.refreshes++;await wait(70);if(friendsFixture.failRefresh)throw Error('Fixture failure')}
export function getOrCreateFriendCode(){const code='ECL-TEST1';useGameStore.getState().updateSettings({friendCode:code});return code}
export async function syncMyProfile(){}
export async function addFriendByCode(code:string){friendsFixture.adds.push(code);await wait(friendsFixture.delay);if(friendsFixture.failAdd)throw Error('Offline');if(code!=='ECL-NEW01')return{success:false,error:'Player not found'};const settings=useGameStore.getState().settings;useGameStore.getState().updateSettings({outgoingFriendRequests:[...(settings.outgoingFriendRequests||[]),{toUid:'newfriend',toUsername:'New friend',toAvatarUrl:'',toFriendCode:code,timestamp:Date.now()}]});return{success:true,state:'sent' as const}}
export async function fetchUserProfile(code:string){friendsFixture.profiles.push(code);await wait(friendsFixture.delay);return code==='ECL-OTHER'?{uid:'profile-user',username:'Fixture friend'}:null}
export async function removeFirebaseFriend(id:string){const state=useGameStore.getState();state.updateSettings({eclipseFriends:state.settings.eclipseFriends?.filter(friend=>friend.id!==id)})}
export async function restoreFirebaseFriend(friend:EclipseFriend){const state=useGameStore.getState();state.updateSettings({outgoingFriendRequests:[...(state.settings.outgoingFriendRequests||[]),{toUid:friend.id,toUsername:friend.username,toAvatarUrl:friend.avatarUrl,toFriendCode:friend.friendCode||'',timestamp:Date.now()}]})}
export async function acceptFriendRequest(id:string){const state=useGameStore.getState();state.updateSettings({incomingFriendRequests:state.settings.incomingFriendRequests?.filter(request=>request.fromUid!==id)});return{success:true}}
export async function declineFriendRequest(id:string){const state=useGameStore.getState();state.updateSettings({incomingFriendRequests:state.settings.incomingFriendRequests?.filter(request=>request.fromUid!==id)});return{success:true}}
export async function cancelFriendRequest(id:string){const state=useGameStore.getState();state.updateSettings({outgoingFriendRequests:state.settings.outgoingFriendRequests?.filter(request=>request.toUid!==id)});return{success:true}}
export async function sendAppNotification(value:unknown){friendsFixture.notifications.push(value)}

type Message={id:string;senderId:string;text:string;createdAt:number}
type Thread={id:string;peerId:string;text:string;senderId:string;updatedAt:number}
const inboxListeners=new Set<(threads:Thread[])=>void>(),cooldownListeners=new Set<(until:number)=>void>(),messageListeners=new Map<string,Set<(messages:Message[])=>void>>()
const history=new Map<string,Message[]>(),threads=new Map<string,Thread>()
export const chatFixture={sends:[] as string[],failSend:false,cooldown:0,activeListeners:0,receive(peer:string,text:string){publish(peer,text,peer)}}
function publish(peer:string,text:string,senderId:string){const message={id:crypto.randomUUID(),senderId,text,createdAt:Date.now()},items=[...(history.get(peer)||[]),message];history.set(peer,items);threads.set(peer,{id:peer,peerId:peer,text,senderId,updatedAt:message.createdAt});for(const listener of messageListeners.get(peer)||[])listener(items);for(const listener of inboxListeners)listener([...threads.values()].sort((a,b)=>b.updatedAt-a.updatedAt))}
export const friendChat={
  requireUid:async()=> 'my-uid',
  watchInbox(_uid:string,receive:(threads:Thread[])=>void){inboxListeners.add(receive);receive([...threads.values()]);chatFixture.activeListeners++;return()=>{inboxListeners.delete(receive);chatFixture.activeListeners--}},
  watchCooldown(_uid:string,receive:(until:number)=>void){cooldownListeners.add(receive);receive(chatFixture.cooldown);chatFixture.activeListeners++;return()=>{cooldownListeners.delete(receive);chatFixture.activeListeners--}},
  watchMessages(_uid:string,peer:string,receive:(messages:Message[])=>void){const listeners=messageListeners.get(peer)||new Set();listeners.add(receive);messageListeners.set(peer,listeners);receive(history.get(peer)||[]);chatFixture.activeListeners++;return()=>{listeners.delete(receive);chatFixture.activeListeners--}},
  history:async()=>[] as Message[],
  async send(peer:string,text:string){if(chatFixture.failSend)throw Error('Offline');if(Date.now()<chatFixture.cooldown)throw Error('cooldown');await wait(70);chatFixture.sends.push(text);chatFixture.cooldown=Date.now()+5000;for(const listener of cooldownListeners)listener(chatFixture.cooldown);publish(peer,text,'my-uid');return{id:'sent',nextAllowedAt:chatFixture.cooldown}},
}
