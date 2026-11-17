import { memo, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Loader2, Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { MediaState } from '../../../types/game'
import '../overlay-widgets.css'

interface MediaOverlayWidgetProps {
  editMode?: boolean; autoHide?: boolean; mediaSource?: 'all' | 'spotify' | 'youtube'
  showVisualizer?: boolean; language?: string
}
const EMPTY: MediaState = { isPlaying: false, title: '', artist: '', app: null }
function sameMedia(a: MediaState, b: MediaState) {
  return a.isPlaying===b.isPlaying&&a.title===b.title&&a.artist===b.artist&&a.app===b.app&&a.coverUrl===b.coverUrl&&a.sessionId===b.sessionId&&a.error===b.error&&a.controls?.playPause===b.controls?.playPause&&a.controls?.next===b.controls?.next&&a.controls?.previous===b.controls?.previous
}

export const MediaOverlayWidget = memo(function MediaOverlayWidget({
  editMode=false, autoHide=false, mediaSource='all', showVisualizer=true, language='de',
}: MediaOverlayWidgetProps) {
  const [media,setMedia]=useState<MediaState>(EMPTY)
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[expanded,setExpanded]=useState(true)
  const [loading,setLoading]=useState(true),[image,setImage]=useState<{url?:string;state:'ready'|'error'}>({state:'ready'})
  const [busy,setBusy]=useState(false),[commandError,setCommandError]=useState(false)
  const revision=useRef(0),commandGeneration=useRef(0),commandPending=useRef(false)
  const de=language==='de'
  useEffect(()=>{
    let disposed=false
    const requested=++revision.current
    commandGeneration.current++;commandPending.current=false
    setMedia(EMPTY);setLoading(true);setBusy(false);setCommandError(false);setHovered(false);setFocused(false)
    const accept=(next:MediaState)=>{
      if(disposed||!next)return
      const state=mediaSource!=='all'&&next.app&&next.app!==mediaSource?EMPTY:next
      setMedia(previous=>sameMedia(previous,state)?previous:state);setLoading(false)
    }
    const api=window.electronAPI?.media
    const off=api?.onUpdate(next=>{revision.current++;accept(next)})
    void api?.setFilter?.(mediaSource).catch(()=>{})
    void api?.getStatus(mediaSource).then(next=>{if(revision.current===requested)accept(next)}).catch(()=>{if(!disposed){setMedia({...EMPTY,error:'unavailable'});setLoading(false)}})
    if(!api)setLoading(false)
    return()=>{disposed=true;commandGeneration.current++;off?.();void window.electronAPI?.setOverlayIgnoreMouse?.(true)}
  },[mediaSource])
  const imageState=image.url===media.coverUrl?image.state:'loading'
  useEffect(()=>{setCommandError(false)},[media.sessionId,media.title,media.artist])
  useEffect(()=>{
    setExpanded(true)
    if(!autoHide||editMode||hovered||focused||busy)return
    const timer=setTimeout(()=>setExpanded(false),3000)
    return()=>clearTimeout(timer)
  },[media.title,media.artist,media.isPlaying,autoHide,editMode,hovered,focused,busy])
  const hasContent=Boolean(media.title||media.artist||media.app||media.isPlaying)
  const visible=editMode||loading||hasContent||!!media.error
  useEffect(()=>{
    if(!visible){setHovered(false);setFocused(false);void window.electronAPI?.setOverlayIgnoreMouse?.(true)}
  },[visible])
  if(!visible)return null
  const wide=editMode||!autoHide||expanded||hovered||focused||busy
  const generic=['Spotify','Pausiert','Paused'].includes(media.title)
  const title=loading?(de?'Medien werden verbunden…':'Connecting to media…'):!generic&&media.title?media.title:media.error?(de?'Medien nicht verfügbar':'Media unavailable'):hasContent?(de?'Medienwiedergabe':'Media playback'):(de?'Keine Wiedergabe':'Nothing playing')
  const source=media.app==='spotify'||mediaSource==='spotify'?'Spotify':media.app==='youtube'?'YouTube':media.app==='browser'?(de?'Browser':'Browser'):'Media'
  const status=busy?(de?'Wird aktualisiert…':'Updating…'):commandError?(de?'Steuerung fehlgeschlagen':'Control failed'):media.error==='unsupported'?(de?'Nur unter Windows verfügbar':'Available on Windows'):media.error?(de?'Verbindung wird erneut versucht':'Reconnecting'):media.isPlaying?(de?'Wiedergabe':'Playing'):(de?'Pausiert':'Paused')
  const artist=media.artist||(!hasContent?(de?'Starte einen Titel in deinem Player':'Play a track in your player'):'')
  const command=async(action:'playPause'|'previous'|'next',event:MouseEvent)=>{
    event.preventDefault();event.stopPropagation()
    if(commandPending.current)return
    const ticket=commandGeneration.current
    commandPending.current=true;setBusy(true);setCommandError(false)
    try{
      const result=await window.electronAPI?.media?.[action](mediaSource,media.sessionId)
      if(ticket===commandGeneration.current&&!result?.success)setCommandError(true)
    }catch{if(ticket===commandGeneration.current)setCommandError(true)}
    finally{if(ticket===commandGeneration.current){commandPending.current=false;setBusy(false)}}
  }
  const disabled=(action:'playPause'|'previous'|'next')=>busy||loading||!hasContent||!!media.error||media.controls?.[action]===false
  return <div className={'overlay-panel media-hud'+(wide?' media-hud--expanded':'')} data-playing={media.isPlaying||undefined} data-interacting={hovered||focused||editMode||undefined} data-error={commandError||!!media.error||undefined} aria-busy={busy||loading}
    onMouseEnter={()=>{setHovered(true);void window.electronAPI?.setOverlayIgnoreMouse?.(false)}}
    onMouseLeave={()=>{setHovered(false);if(!editMode)void window.electronAPI?.setOverlayIgnoreMouse?.(true)}}
    onFocusCapture={()=>{setFocused(true);setExpanded(true)}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false)}}>
    <button type="button" className="media-hud__art" aria-label={de?'Mediensteuerung anzeigen':'Show media controls'} aria-expanded={wide} title={[media.title,media.artist].filter(Boolean).join(' — ')} onMouseDown={event=>event.stopPropagation()} onClick={()=>setExpanded(true)}>
      <Music size={19} aria-hidden="true"/>
      {media.coverUrl&&imageState!=='error'&&<img key={media.coverUrl} src={media.coverUrl} alt="" decoding="async" draggable={false} data-ready={imageState==='ready'||undefined} onLoad={()=>setImage({url:media.coverUrl,state:'ready'})} onError={()=>setImage({url:media.coverUrl,state:'error'})}/>}
      {loading&&<Loader2 size={15} className="media-hud__loading animate-spin" aria-hidden="true"/>}
      {media.isPlaying&&showVisualizer&&<span className="media-hud__playing" aria-hidden="true"><i/><i/><i/></span>}
    </button>
    <div className="media-hud__content" aria-hidden={!wide}>
      <div className="media-hud__track"><strong title={media.title}>{title}</strong><span title={media.artist}>{artist}</span><small role="status"><b>{source}</b><i aria-hidden="true"/> <span>{status}</span></small></div>
      <div className="media-hud__controls" onMouseDown={event=>event.stopPropagation()}>
        <button type="button" tabIndex={wide?0:-1} disabled={disabled('previous')} aria-label={de?'Vorheriger Titel':'Previous track'} onClick={event=>void command('previous',event)}><SkipBack size={14}/></button>
        <button type="button" tabIndex={wide?0:-1} disabled={disabled('playPause')} className="media-hud__play" aria-label={media.isPlaying?'Pause':de?'Wiedergeben':'Play'} onClick={event=>void command('playPause',event)}>{busy?<Loader2 size={13} className="animate-spin"/>:media.isPlaying?<Pause size={13} fill="currentColor"/>:<Play size={13} fill="currentColor"/>}</button>
        <button type="button" tabIndex={wide?0:-1} disabled={disabled('next')} aria-label={de?'Nächster Titel':'Next track'} onClick={event=>void command('next',event)}><SkipForward size={14}/></button>
      </div>
    </div>
  </div>
})
