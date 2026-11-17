import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Send, Loader2, RefreshCw } from 'lucide-react'
import { friendChat } from '../../services/socialService'
import { CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, ChatCooldownError, type ChatMessage, type ChatThread } from '../../services/friendChat'
import type { EclipseFriend } from '../../types/game'
import { FriendMuteControl } from './FriendMuteControl'

export function FriendsChat({friends,selected,select,active,language,unreadChanged,identityKey}:{friends:EclipseFriend[];selected:string|null;select:(id:string|null)=>void;active:boolean;language:string;unreadChanged:(count:number)=>void;identityKey?:string}){
  const de=language==='de',peer=friends.find(friend=>friend.id===selected)
  const [focused, setFocused] = useState(() => document.hasFocus() && !document.hidden)
  useEffect(() => {
    const update = () => setFocused(document.hasFocus() && !document.hidden)
    window.addEventListener('focus', update); window.addEventListener('blur', update); document.addEventListener('visibilitychange', update)
    return () => { window.removeEventListener('focus', update); window.removeEventListener('blur', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  const [uid,setUid]=useState(''),[threads,setThreads]=useState<ChatThread[]>([]),[messages,setMessages]=useState<ChatMessage[]>([]),[older,setOlder]=useState<ChatMessage[]>([]),[reads,setReads]=useState<Record<string,number>>({})
  const [loading,setLoading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0),[nextSend,setNextSend]=useState(0),[seconds,setSeconds]=useState(0),[online,setOnline]=useState(navigator.onLine),[drafts,setDrafts]=useState<Record<string,string>>({}),[historyBusy,setHistoryBusy]=useState(false),[historyEnd,setHistoryEnd]=useState(false)
  const body=useRef<HTMLDivElement>(null),nearBottom=useRef(true),sendLock=useRef(false),generation=useRef(0),draftRef=useRef(drafts)
  useEffect(() => {
    const api = window.electronAPI?.chatNotifications
    if (!api || !uid) return
    api.setContext({ uid, peerId: selected, visible: active && !!peer && !document.hidden })
    return () => api.setContext({ uid, peerId: null, visible: false })
  }, [uid, selected, active, !!peer, focused])
  const readKey=(id:string)=>'eclipse-chat-reads:'+id
  const loadReads=(id:string)=>{try{const data=JSON.parse(localStorage.getItem(readKey(id))||'{}');return Object.fromEntries(Object.entries(data).filter(([key,value])=>key.length<300&&typeof value==='number'&&Number.isFinite(value)).slice(-1000)) as Record<string,number>}catch{return {}}}
  useEffect(()=>{
    let alive=true,stops:(()=>void)[]=[]
    setError(false);setUid('');setThreads([])
    void friendChat.requireUid().then(identity=>{
      if(!alive)return
      setUid(identity);setReads(loadReads(identity))
      stops.push(friendChat.watchInbox(identity,items=>{if(alive){setThreads(items);setError(false)}},()=>{if(alive)setError(true)}))
      stops.push(friendChat.watchCooldown(identity,until=>{if(alive)setNextSend(previous=>Math.max(previous,until))},()=>{if(alive)setError(true)}))
    }).catch(()=>{if(alive)setError(true)})
    return()=>{alive=false;stops.forEach(stop=>stop())}
  },[retry,identityKey])
  useEffect(()=>{draftRef.current={};setDrafts({})},[identityKey])
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
  useEffect(()=>{const update=(event:StorageEvent)=>{if(uid&&event.key===readKey(uid))setReads(loadReads(uid))};window.addEventListener('storage',update);return()=>window.removeEventListener('storage',update)},[uid])
  useEffect(()=>{
    generation.current++;setMessages([]);setOlder([]);setHistoryEnd(false);setHistoryBusy(false);nearBottom.current=true
    if(!uid||!selected||!active||!peer){setLoading(false);return}
    let alive=true;setLoading(true);setError(false)
    const stop=friendChat.watchMessages(uid,selected,items=>{if(alive){setMessages(items);setLoading(false)}},()=>{if(alive){setError(true);setLoading(false)}})
    return()=>{alive=false;stop()}
  },[uid,selected,active,!!peer,retry])
  const markRead=(timestamp:number)=>{
    if(!uid||!selected||!timestamp||!focused)return
    setReads(previous=>{if((previous[selected]||0)>=timestamp)return previous;const next={...previous,[selected]:timestamp};try{localStorage.setItem(readKey(uid),JSON.stringify(next))}catch{}return next})
  }
  useEffect(()=>{if(active&&messages.length&&nearBottom.current){if(body.current)body.current.scrollTop=body.current.scrollHeight;markRead(messages[messages.length-1].createdAt)}},[messages,active,selected,focused])
  const visibleThreads=threads.filter(thread=>friends.some(friend=>friend.id===thread.peerId))
  const unread=visibleThreads.filter(thread=>thread.senderId!==uid&&thread.updatedAt>(reads[thread.peerId]||0))
  useEffect(()=>unreadChanged(unread.length),[unread.length,unreadChanged])
  useEffect(()=>{let timer:ReturnType<typeof setInterval>|undefined;const tick=()=>{const remaining=Math.max(0,Math.ceil((nextSend-Date.now())/1000));setSeconds(remaining);if(!remaining&&timer)clearInterval(timer)};tick();if(nextSend>Date.now())timer=setInterval(tick,250);return()=>clearInterval(timer)},[nextSend])
  const changeDraft=(value:string)=>{if(!selected)return;const next={...draftRef.current,[selected]:value};draftRef.current=next;setDrafts(next)}
  async function send(){
    if(!selected||!peer||!uid||sendLock.current||seconds>0||!online)return
    const recipient=selected,text=(draftRef.current[recipient]||'').trim(),version=generation.current
    if(!text)return
    sendLock.current=true;setSending(true);setError(false)
    try{
      const result=await friendChat.send(recipient,text)
      setNextSend(Math.max(result.nextAllowedAt,Date.now()+CHAT_COOLDOWN_MS))
      if((draftRef.current[recipient]||'').trim()===text){const next={...draftRef.current,[recipient]:''};draftRef.current=next;setDrafts(next)}
      if(version===generation.current){nearBottom.current=true;if(body.current)body.current.scrollTop=body.current.scrollHeight}
    }catch(reason){if(reason instanceof ChatCooldownError)setNextSend(Math.max(reason.retryAt,Date.now()+1000));else if(version===generation.current)setError(true)}finally{sendLock.current=false;setSending(false)}
  }
  async function history(){
    if(!selected||historyBusy||historyEnd)return
    const version=generation.current,before=older[0]||messages[0]
    if(!before)return
    setHistoryBusy(true)
    const height=body.current?.scrollHeight||0
    try{const items=await friendChat.history(uid,selected,before);if(version!==generation.current)return;nearBottom.current=false;setOlder(previous=>[...items,...previous].slice(-450));setHistoryEnd(items.length<50);requestAnimationFrame(()=>{if(body.current&&version===generation.current)body.current.scrollTop+=body.current.scrollHeight-height})}catch{if(version===generation.current)setError(true)}finally{if(version===generation.current)setHistoryBusy(false)}
  }
  const notice=error?<div className="friends-chat-error" role="status"><span>{de?'Chat nicht erreichbar. Deine Nachricht bleibt erhalten.':'Chat unavailable. Your message has been kept.'}</span><button onClick={()=>setRetry(value=>value+1)} aria-label={de?'Erneut verbinden':'Reconnect'}><RefreshCw size={13}/></button></div>:!online?<p className="friends-chat-error" role="status">{de?'Offline · Verbindung wird wiederhergestellt':'Offline · Reconnecting'}</p>:null
  const draft=selected?drafts[selected]||'':''
  return <div className="friends-chat" hidden={!active}>
    {selected&&peer?<>
      <header className="friends-chat-heading"><button onClick={()=>select(null)} aria-label={de?'Zu den Nachrichten':'Back to messages'}><ArrowLeft size={16}/></button><div><strong>{peer.username}</strong><small>{peer.status==='ingame'?peer.currentGame:peer.status==='online'?(de?'Online':'Online'):(de?'Offline':'Offline')}</small></div><FriendMuteControl peer={peer.id}/></header>
      {notice}
      <div ref={body} className="friends-chat-messages" role="log" aria-live="polite" aria-label={de?'Chatverlauf':'Conversation'} onScroll={()=>{if(body.current){nearBottom.current=body.current.scrollHeight-body.current.scrollTop-body.current.clientHeight<60;if(nearBottom.current&&messages.length)markRead(messages[messages.length-1].createdAt)}}}>
        {messages.length===50&&!historyEnd&&older.length<450&&<button className="friends-chat-history" disabled={historyBusy} onClick={()=>void history()}>{historyBusy?'…':de?'Ältere Nachrichten laden':'Load older messages'}</button>}
        {loading?<div className="friends-chat-empty"><Loader2 size={19}/><span>{de?'Chat wird geladen…':'Loading conversation…'}</span></div>:!messages.length&&!older.length?<div className="friends-chat-empty"><MessageCircle size={25}/><strong>{de?'Sag Hallo!':'Say hello!'}</strong><span>{de?'Nachrichten erscheinen hier in Echtzeit.':'Messages appear here in real time.'}</span></div>:[...older.filter(item=>!messages.some(live=>live.id===item.id)),...messages].map(message=><div key={message.id} className="friends-chat-bubble" data-own={message.senderId===uid||undefined}><p>{message.text}</p><time dateTime={message.createdAt?new Date(message.createdAt).toISOString():undefined}>{message.createdAt?new Date(message.createdAt).toLocaleTimeString(de?'de-DE':'en-GB',{hour:'2-digit',minute:'2-digit'}):'…'}</time></div>)}
      </div>
      <form className="friends-chat-composer" onSubmit={event=>{event.preventDefault();void send()}}><textarea data-chat-input aria-label={de?'Nachricht':'Message'} placeholder={de?'Nachricht schreiben…':'Write a message…'} maxLength={CHAT_MAX_LENGTH} value={draft} onChange={event=>changeDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send()}}}/><div><small role="status">{sending?(de?'Wird gesendet…':'Sending…'):seconds>0?(de?`Noch ${seconds} s`:`Wait ${seconds}s`):de?'Enter senden · Shift+Enter neue Zeile':'Enter to send · Shift+Enter new line'}</small><button data-chat-send type="submit" disabled={!draft.trim()||!uid||sending||seconds>0||!online} aria-label={de?'Nachricht senden':'Send message'}>{sending?<Loader2 size={15}/>:<Send size={15}/>}</button></div></form>
    </>:<>{notice}<div className="friends-chat-inbox">{visibleThreads.length?visibleThreads.map(thread=>{const friend=friends.find(friend=>friend.id===thread.peerId)!;return <button key={thread.id} onClick={()=>select(thread.peerId)} data-chat-thread={thread.peerId}><MessageCircle size={18}/><span><strong>{friend.username}</strong><small>{thread.senderId===uid?(de?'Du: ':'You: '):''}{thread.text}</small></span>{unread.some(item=>item.id===thread.id)&&<i aria-label={de?'Ungelesen':'Unread'}/>}</button>}):<div className="friends-chat-empty"><MessageCircle size={26}/><strong>{de?'Deine Nachrichten':'Your messages'}</strong><span>{de?'Öffne einen Chat über das Sprechblasen-Symbol neben einem Freund.':'Use the chat button next to a friend to start a conversation.'}</span></div>}</div></>}
  </div>
}
