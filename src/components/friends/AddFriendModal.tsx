import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Check, Loader2, UserPlus, UserRound } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { fetchSteamUserProfile } from '../../services/steamService'
import { addFriendByCode, getOrCreateFriendCode, syncMyProfile, fetchUserProfile } from '../../services/socialService'
import { sendAppNotification } from '../../services/notificationService'
import { copyText } from '../../services/clipboard'
import type { EclipseFriend } from '../../types/game'
import './friends.css'

export function AddFriendModal() {
  const open=useUIStore(state=>state.isAddFriendOpen)
  return open?<AddFriendDialog/>:null
}
export function AddFriendDialog({embedded=false,onClose,onVisit}:{embedded?:boolean;onClose?:()=>void;onVisit?:(id:string)=>void}={}) {
  const {t}=useTranslation()
  const settings=useGameStore(state=>state.settings)
  const close=()=>{
    if(embedded){onClose?.();return}
    useUIStore.getState().setIsAddFriendOpen(false)
    void window.electronAPI?.addFriendModalClosed?.()
  }
  const [value,setValue]=useState(''),[copied,setCopied]=useState(false),[loading,setLoading]=useState<'add'|'profile'|null>(null),[error,setError]=useState('')
  const panel=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),busy=useRef(false),mounted=useRef(false),copyTimer=useRef<ReturnType<typeof setTimeout>>()
  const nativeCode=window.electronAPI?.account?.initialIdentity?.friendCode
  const myCode=settings.friendCode?.startsWith('ECL-')?settings.friendCode:typeof nativeCode==='string'&&nativeCode.startsWith('ECL-')?nativeCode:''
  useDialogFocus(panel,close,!embedded)
  useLayoutEffect(()=>{
    input.current?.focus({preventScroll:true})
    if(embedded)return
    // The native host waits for the opaque dialog to have a rendered frame.
    let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{void window.electronAPI?.addFriendModalReady?.()})})
    return()=>cancelAnimationFrame(frame)
  },[])
  useEffect(()=>{
    mounted.current=true
    if(!myCode)getOrCreateFriendCode()
    if(!embedded)void syncMyProfile().catch(()=>{})
    return()=>{mounted.current=false;clearTimeout(copyTimer.current)}
  },[])
  const copy=async()=>{
    try{await copyText(myCode);if(!mounted.current)return;setCopied(true);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),1800)}
    catch{if(mounted.current)setError(t('friendsCopyFailed'))}
  }
  const translateError=(raw?:string)=>{
    const text=(raw||'').toLowerCase()
    if(/selbst|yourself|self/.test(text))return t('cannotAddSelf')
    if(/bereits befreundet|already friends|already in your/.test(text))return t('alreadyFriends')
    if(/bereits|already|ausstehend|pending/.test(text))return t('requestAlreadySent')
    if(/kein spieler|not found|ungültig|invalid|nicht gefunden/.test(text))return t('playerNotFound')
    return t('friendsActionFailed')
  }
  const perform=async(kind:'add'|'profile')=>{
    const text=value.trim()
    if(!text||busy.current)return
    busy.current=true;setLoading(kind);setError('')
    const normalized=text.toUpperCase().replace(/\s+/g,'')
    const current=useGameStore.getState().settings
    try{
      if(kind==='profile'){
        const profile=await fetchUserProfile(text)
        if(!mounted.current)return
        if(profile?.uid){close();if(onVisit)onVisit(profile.uid);else useUIStore.getState().openFriendProfile(profile.uid);return}
        if(!normalized.startsWith('ECL-')){
          const steam=await fetchSteamUserProfile(text)
          if(!mounted.current)return
          if(steam?.steamId64&&steam.username&&!steam.username.toLowerCase().includes('error')){close();if(onVisit)onVisit(steam.steamId64);else useUIStore.getState().openFriendProfile(steam.steamId64);return}
        }
        setError(t('playerNotFound'));return
      }
      const ownCode=(current.friendCode||myCode).toUpperCase().replace(/\s+/g,'')
      if(normalized===ownCode||normalized===(current.userUid||'').toUpperCase()||(ownCode&&normalized.replace(/^ECL-/,'')===ownCode.replace(/^ECL-/,''))){setError(t('cannotAddSelf'));return}
      if(current.eclipseFriends?.some(friend=>friend.id.toLowerCase()===text.toLowerCase()||friend.friendCode?.toUpperCase()===normalized)){setError(t('alreadyFriends'));return}
      const result=await addFriendByCode(text)
      if(!mounted.current)return
      if(result.success){
        close()
        if(result.state==='incoming') { if(window.electronAPI?.openFriendsWindow)void window.electronAPI.openFriendsWindow();else useUIStore.getState().setIsFriendsOpen(true) }
        void sendAppNotification({title:result.state==='friends'?t('alreadyFriends'):result.state==='incoming'?t('friendsRequestTitle'):t('friendsRequestSentTitle'),body:result.state==='incoming'?t('friendsIncomingHint'):result.state==='pending'?t('requestAlreadySent'):result.state==='friends'?t('alreadyFriends'):t('requestSentSuccess'),type:'success'})
        return
      }
      if(!normalized.startsWith('ECL-')){
        const profile=await fetchSteamUserProfile(text)
        if(!mounted.current)return
        if(profile?.steamId64&&profile.username&&!profile.username.toLowerCase().includes('error')){
          const friends=useGameStore.getState().settings.eclipseFriends||[]
          if(friends.some(friend=>friend.id===profile.steamId64)){setError(t('alreadyFriends'));return}
          const friend:EclipseFriend={id:profile.steamId64,username:profile.username,avatarUrl:profile.avatarFull||'',status:profile.onlineState==='in-game'?'ingame':profile.onlineState==='online'?'online':'offline',steamProfileUrl:`https://steamcommunity.com/profiles/${profile.steamId64}`,level:profile.steamLevel||1,steamLevel:profile.steamLevel||1,steamRecentGames:profile.steamRecentGames||[],steamFavoriteBadge:profile.steamFavoriteBadge||undefined}
          useGameStore.getState().updateSettings({eclipseFriends:[...friends,friend]})
          close();void sendAppNotification({title:t('friendsAddedTitle'),body:t('friendsAddedBody',{name:friend.username}),type:'success'});return
        }
      }
      setError(translateError(result.error))
    }catch{if(mounted.current)setError(t('friendsActionFailed'))}
    finally{busy.current=false;if(mounted.current)setLoading(null)}
  }
  const content=<div ref={panel} className={'add-friend-dialog'+(embedded?' add-friend-embedded':'')} data-add-friend-dialog role={embedded?'region':'dialog'} aria-modal={embedded?undefined:true} aria-labelledby="add-friend-title" onKeyDown={event=>{if(embedded&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}} onClick={event=>event.stopPropagation()}>
      <header className="add-friend-header"><div><span><UserPlus size={17}/></span><h2 id="add-friend-title">{t('addFriendTitle')}</h2></div><button data-dialog-close data-add-friend-close className="add-friend-close" onClick={close} aria-label={t('close')}><X size={18}/></button></header>
      <div className="add-friend-body"><p className="add-friend-description">{t('friendsAddDescription')}</p><div className="add-friend-code"><div><span>{t('yourFriendCode')}</span><code>{myCode||'…'}</code></div><button data-friend-code-copy onClick={()=>void copy()} disabled={!myCode} aria-label={t('uiCopyCode')} title={t('uiCopyCode')}>{copied?<Check size={16}/>:<Copy size={16}/>}</button></div>
        <form onSubmit={event=>{event.preventDefault();void perform('add')}} aria-busy={!!loading}><label htmlFor="add-friend-input">{t('friendCodeLabel')}</label><div className="add-friend-input"><UserRound size={15}/><input ref={input} id="add-friend-input" data-add-friend-input value={value} onChange={event=>{setValue(event.target.value);if(error)setError('')}} placeholder={t('friendCodePlaceholder')} autoComplete="off" maxLength={512}/></div>
          {error&&<p className="add-friend-error" role="alert">{error}</p>}
          <div className="add-friend-actions"><button type="button" data-friend-view-profile disabled={!!loading||!value.trim()} onClick={()=>void perform('profile')}>{loading==='profile'?<Loader2 size={13} className="add-friend-loading"/>:null}{t('viewProfile')}</button><button type="submit" data-friend-submit disabled={!!loading||!value.trim()}>{loading==='add'?<Loader2 size={13} className="add-friend-loading"/>:<UserPlus size={13}/>}{t('add')}</button></div>
        </form>
        <p className="add-friend-hint">{t('friendsCodeDescription')}</p>{copied&&<span role="status" className="sr-only">{t('friendsCodeCopied')}</span>}
      </div>
    </div>
  return embedded?content:createPortal(<div className="add-friend-shade" data-add-friend-backdrop onClick={close}>{content}</div>,document.body)
}
