import { DropdownSurface } from '../shared/DropdownSurface'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls } from 'framer-motion'
import { X, Search, Plus, ChevronDown, User, Users, MoreHorizontal, Trash2, Check, Gamepad2, RefreshCw, MessageCircle } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { removeFirebaseFriend, restoreFirebaseFriend, acceptFriendRequest, declineFriendRequest, cancelFriendRequest, refreshFriendsPresence, isFirestorePermissionDenied } from '../../services/socialService'
import { formatLastSeen } from '../../services/assetHelper'
import { safeProfileMedia } from '../../services/profileModel'
import type { EclipseFriend } from '../../types/game'
import './friends.css'
import { AddFriendDialog } from './AddFriendModal'
import { FriendsChat } from './FriendsChat'
import { FriendMuteControl } from './FriendMuteControl'

function FriendAvatar({avatar,name,status}:{avatar?:string;name:string;status?:string}) {
  const [failed,setFailed]=useState<string>()
  const source=safeProfileMedia(avatar)
  return <span className="friends-avatar"><span><User size={18}/>{source&&source!==failed&&<img src={source} alt="" decoding="async" onError={()=>setFailed(source)}/>}</span>{status&&<i data-status={status} aria-hidden="true"/>}</span>
}

export function FriendsWindow({isStandalone=false}:{isStandalone?:boolean}) {
  const {t,language}=useTranslation()
  const open=useUIStore(state=>state.isFriendsOpen)
  const setOpen=useUIStore(state=>state.setIsFriendsOpen)
  const setAdd=useUIStore(state=>state.setIsAddFriendOpen)
  const openProfile=useUIStore(state=>state.openFriendProfile)
  const settings=useGameStore(state=>state.settings)
  const activeGame=useGameStore(state=>state.activeGame)
  const [search,setSearch]=useState(''),[onlineExpanded,setOnlineExpanded]=useState(true),[offlineExpanded,setOfflineExpanded]=useState(true)
  const [tab,setTab]=useState<'friends'|'requests'|'messages'>('friends')
  const [chatFriend,setChatFriend]=useState<string|null>(null),[unreadChats,setUnreadChats]=useState(0)
  const chat=(id:string)=>{setChatFriend(id);setTab('messages')}
  useEffect(() => {
    const api = window.electronAPI?.chatNotifications
    if (!isStandalone || !api) return
    let disposed = false, revision = 0
    const stop = api.onOpen(peer => { revision++; chat(peer); void api.pending().catch(() => {}) })
    const requested = revision
    void api.pending().then(peer => { if (!disposed && revision === requested && peer) chat(peer) }).catch(() => {})
    return () => { disposed = true; stop() }
  }, [isStandalone])
  const [adding,setAdding]=useState(false)
  const [refreshing,setRefreshing]=useState(false),[error,setError]=useState(false),[removed,setRemoved]=useState<EclipseFriend|null>(null),[pending,setPending]=useState<string|null>(null)
  const refreshLock=useRef(false),removeLock=useRef(false),mounted=useRef(false),undoTimer=useRef<ReturnType<typeof setTimeout>>()
  const drag=useDragControls()
  const origin=useRef({left:Math.max(12,window.innerWidth-364),top:Math.max(0,Math.min(80,window.innerHeight-540))})
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(undoTimer.current)}},[])
  const refresh=async(force=false)=>{
    if(refreshLock.current)return
    refreshLock.current=true;setRefreshing(true)
    try{await refreshFriendsPresence(force);if(mounted.current)setError(false)}
    catch{if(mounted.current)setError(true)}
    finally{refreshLock.current=false;if(mounted.current)setRefreshing(false)}
  }
  useEffect(()=>{if(open)void refresh()},[open])
  const friends=settings.eclipseFriends||[],requests=settings.incomingFriendRequests||[],outgoing=settings.outgoingFriendRequests||[]
  const conversationOpen=tab==='messages'&&friends.some(friend=>friend.id===chatFriend)
  const query=search.trim().toLocaleLowerCase(language)
  const online=friends.filter(friend=>friend.status==='online'||friend.status==='ingame')
  const filtered=friends.filter(friend=>!query||friend.username.toLocaleLowerCase(language).includes(query))
  const onlineResults=filtered.filter(friend=>friend.status==='online'||friend.status==='ingame'),offlineResults=filtered.filter(friend=>friend.status==='offline')
  const selfPlaying=!!activeGame
  const visit=(id:string)=>{if(isStandalone&&window.electronAPI?.openFriendProfileModal)void window.electronAPI.openFriendProfileModal(id);else openProfile(id)}
  const add=()=>setAdding(true)
  const close=()=>{setOpen(false);if(isStandalone)void window.electronAPI?.closeFriendsWindow?.()}
  const remove=async(friend:EclipseFriend)=>{
    if(removeLock.current)return
    removeLock.current=true
    try{await removeFirebaseFriend(friend.id);if(mounted.current){setRemoved(friend);clearTimeout(undoTimer.current);undoTimer.current=setTimeout(()=>setRemoved(null),5000)}}
    catch{if(mounted.current)setError(true)}
    finally{removeLock.current=false}
  }
  const undo=async()=>{
    if(!removed||removeLock.current)return
    removeLock.current=true
    try{await restoreFirebaseFriend(removed);if(mounted.current)setRemoved(null);clearTimeout(undoTimer.current)}catch{if(mounted.current)setError(true)}finally{removeLock.current=false}
  }
  const requestLock=useRef(false)
  const requestAction=async(id:string,action:'accept'|'decline'|'cancel')=>{
    if(requestLock.current)return
    requestLock.current=true
    setPending(id)
    try{const result=await(action==='accept'?acceptFriendRequest(id):action==='cancel'?cancelFriendRequest(id):declineFriendRequest(id));if(mounted.current)setError(!result.success)}catch{if(mounted.current)setError(true)}finally{requestLock.current=false;if(mounted.current)setPending(null)}
  }
  if(!open)return null
  return <motion.section initial={false} drag={!isStandalone} dragListener={false} dragControls={drag} dragMomentum={false}
    dragConstraints={{left:-origin.current.left,right:Math.max(0,window.innerWidth-340)-origin.current.left,top:-origin.current.top,bottom:Math.max(0,window.innerHeight-540)-origin.current.top}}
    className="friends-window" data-friends-window data-standalone={isStandalone||undefined} style={isStandalone?undefined:{left:origin.current.left,top:origin.current.top}} aria-label={t('friends')}>
    <header className="friends-titlebar" data-friends-drag onPointerDown={event=>{if(!isStandalone&&!(event.target as HTMLElement).closest('button'))drag.start(event)}}>
      <div><Users size={15}/><h2>{t('friends')}</h2><span>{online.length}</span></div>
      <nav><button data-friends-refresh onClick={()=>void refresh(true)} disabled={refreshing} aria-label={t('friendsRefresh')} title={t('friendsRefresh')}><RefreshCw size={14} className={refreshing?'friends-refreshing':undefined}/></button><button data-friends-close onClick={close} aria-label={t('close')}><X size={17}/></button></nav>
    </header>
    {!conversationOpen&&<div className="friends-self"><FriendAvatar avatar={settings.avatarUrl} name={settings.username||'Eclipse'} status={selfPlaying?'ingame':'online'}/><div><strong>{settings.username||'Eclipse'}</strong><span data-playing={selfPlaying||undefined}>{selfPlaying&&<Gamepad2 size={11}/>}<span>{selfPlaying?activeGame?.name:t('online')}</span></span></div></div>}
    {adding?<AddFriendDialog embedded onClose={()=>setAdding(false)} onVisit={visit}/>:<>
    {!conversationOpen&&<div className="friends-toolbar"><label><Search size={14}/><input data-friends-search value={search} onChange={event=>setSearch(event.target.value)} placeholder={t('searchFriends')} aria-label={t('searchFriends')}/>{search&&<button onClick={()=>setSearch('')} aria-label={t('friendsClearSearch')}><X size={12}/></button>}</label><button data-friends-add className="friends-add" onClick={add}><Plus size={14}/>{t('add')}</button></div>}
    {!conversationOpen&&<div className="friends-tabs" role="tablist" aria-label={t('friends')}><button role="tab" aria-selected={tab==='friends'} data-friends-tab="friends" onClick={()=>setTab('friends')}>{t('friends')}<span>{friends.length}</span></button><button role="tab" aria-selected={tab==='requests'} data-friends-tab="requests" onClick={()=>setTab('requests')}>{t('friendsRequests')}{(requests.length>0||outgoing.length>0)&&<span data-pending={requests.length>0||undefined}>{requests.length||outgoing.length}</span>}</button><button role="tab" aria-selected={tab==='messages'} data-friends-tab="messages" onClick={()=>setTab('messages')}>{language==='de'?'Nachrichten':'Messages'}{unreadChats>0&&<span data-pending>{unreadChats}</span>}</button></div>}
    {tab!=='messages'&&<div className="friends-list" data-friends-list>
      {(error||isFirestorePermissionDenied)&&<p className="friends-notice" role="status">{t('friendsSyncFailed')}</p>}
      {tab==='requests'?<>
        {requests.length>0&&<section className="friends-requests"><h3>{t('friendsRequests')}<span>{requests.length}</span></h3>{requests.map(request=><div key={request.fromUid} className="friend-request"><FriendAvatar avatar={request.fromAvatarUrl} name={request.fromUsername}/><div><button className="friend-request-profile" onClick={()=>visit(request.fromUid)}><strong>{request.fromUsername}</strong></button><span>{request.fromFriendCode}</span></div><button className="friend-request-accept" data-friend-accept={request.fromUid} disabled={!!pending} onClick={()=>void requestAction(request.fromUid,'accept')} aria-label={t('friendsAccept')} title={t('friendsAccept')}><Check size={12}/>{t('friendsAcceptShort')}</button><button data-friend-decline={request.fromUid} disabled={!!pending} onClick={()=>void requestAction(request.fromUid,'decline')} aria-label={t('friendsDecline')} title={t('friendsDecline')}><X size={14}/></button></div>)}</section>}
        {outgoing.length>0&&<section className="friends-requests"><h3>{t('friendsSentRequests')}<span>{outgoing.length}</span></h3>{outgoing.map(request=><div key={request.toUid} className="friend-request"><FriendAvatar avatar={request.toAvatarUrl} name={request.toUsername}/><div><button className="friend-request-profile" onClick={()=>visit(request.toUid)}><strong>{request.toUsername}</strong></button><span>{request.toFriendCode}</span></div><button data-friend-cancel={request.toUid} disabled={!!pending} onClick={()=>void requestAction(request.toUid,'cancel')} title={t('friendsCancelRequest')} aria-label={t('friendsCancelRequest')}><X size={14}/></button></div>)}</section>}
        {!requests.length&&!outgoing.length&&<div className="friends-request-empty"><Users size={25}/><strong>{t('friendsRequestsEmpty')}</strong><p>{t('friendsRequestsEmptyHint')}</p></div>}
      </>:<>
      {requests.length>0&&<button className="friends-request-hint" data-friends-show-requests onClick={()=>setTab('requests')}><Users size={13}/><span>{requests.length===1?t('friendsPendingSingle'):t('friendsPendingHint',{count:requests.length})}</span><ChevronDown size={12}/></button>}
      {query&&filtered.length===0?<p className="friends-empty">{t('friendsNoResults')}</p>:<>
        <section className="friends-group"><button data-friends-online className="friends-group-title" onClick={()=>setOnlineExpanded(value=>!value)} aria-expanded={onlineExpanded}><ChevronDown size={12} data-collapsed={!onlineExpanded||undefined}/><span>{t('online')}</span><small>{onlineResults.length}</small></button>{onlineExpanded&&(onlineResults.length?onlineResults.map(friend=><FriendRow key={friend.id} friend={friend} visit={visit} remove={remove} chat={chat}/>):<p className="friends-empty">{t('friendsNoOnline')}</p>)}</section>
        <section className="friends-group"><button data-friends-offline className="friends-group-title" onClick={()=>setOfflineExpanded(value=>!value)} aria-expanded={offlineExpanded}><ChevronDown size={12} data-collapsed={!offlineExpanded||undefined}/><span>{t('offline')}</span><small>{offlineResults.length}</small></button>{offlineExpanded&&(offlineResults.length?offlineResults.map(friend=><FriendRow key={friend.id} friend={friend} visit={visit} remove={remove} chat={chat}/>):!friends.length&&<p className="friends-empty">{t('friendsEmpty')}</p>)}</section>
      </>}
      </>}
    </div>}
    <FriendsChat key={settings.userUid||'anonymous'} friends={friends} selected={chatFriend} select={setChatFriend} active={tab==='messages'} language={language} unreadChanged={setUnreadChats} identityKey={settings.userUid}/>
    </>}
    <footer className="friends-footer"><span><i/>{t('friendsOnlineCount',{count:online.length})}</span><span>ECLIPSE</span></footer>
    {removed&&<div className="friends-undo" role="status"><span>{t('friendsRemoved',{name:removed.username})}</span><button onClick={()=>void undo()}>{/^\d{17}$/.test(removed.id)||removed.id.startsWith('steam_')?t('friendsUndo'):t('friendsRequestAgain')}</button></div>}
  </motion.section>
}

function FriendRow({friend,visit,remove,chat}:{friend:EclipseFriend;visit:(id:string)=>void;remove:(friend:EclipseFriend)=>Promise<void>;chat:(id:string)=>void}) {
  const {t,language}=useTranslation()
  const [menu,setMenu]=useState<{left:number;top:number}|null>(null)
  const anchor=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!menu)return
    popup.current?.querySelector('button')?.focus({preventScroll:true})
    const close=()=>setMenu(null)
    const outside=(event:PointerEvent)=>{if(!anchor.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))close()}
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();anchor.current?.focus({preventScroll:true})}}
    document.addEventListener('pointerdown',outside);document.addEventListener('scroll',close,true);window.addEventListener('keydown',key,true);window.addEventListener('resize',close)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',close,true);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',close)}
  },[menu])
  const playing=friend.status==='ingame'&&!!friend.currentGame
  return <div className="friend-row" data-friend-row={friend.id} data-offline={friend.status==='offline'||undefined}>
    <button className="friend-open" onClick={()=>visit(friend.id)}><FriendAvatar avatar={friend.avatarUrl} name={friend.username} status={friend.status}/><span><strong>{friend.username}</strong><span data-playing={playing||undefined}>{playing?<><Gamepad2 size={11}/><span>{friend.currentGame}</span></>:friend.status!=='offline'?t('online'):formatLastSeen(friend.lastSeen,language)}</span></span></button>
    <button className="friend-chat-open" data-friend-chat={friend.id} disabled={!friend.friendCode&&/^\d{17}$/.test(friend.id)} aria-label={language==='de'?`Chat mit ${friend.username}`:`Chat with ${friend.username}`} title={language==='de'?'Nachricht schreiben':'Send a message'} onClick={()=>chat(friend.id)}><MessageCircle size={15}/></button>
    <button ref={anchor} className="friend-options" aria-haspopup="menu" aria-expanded={!!menu} aria-label={t('friendsOptions',{name:friend.username})} onClick={()=>{if(menu){setMenu(null);return}const r=anchor.current!.getBoundingClientRect();setMenu({left:Math.max(8,Math.min(r.right-232,window.innerWidth-240)),top:Math.max(8,Math.min(r.bottom+5,window.innerHeight-100))})}}><MoreHorizontal size={16}/></button>
    {createPortal(<DropdownSurface open={!!menu} ref={popup} role="menu" className="friend-menu" style={menu||undefined}><FriendMuteControl peer={friend.id} label menu done={()=>setMenu(null)}/><button role="menuitem" data-friend-remove={friend.id} onClick={()=>{setMenu(null);void remove(friend)}}><Trash2 size={13}/>{t('friendsRemove')}</button></DropdownSurface>,document.body)}
  </div>
}
