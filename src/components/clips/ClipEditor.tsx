import { Select } from '../shared/Select'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Pause, X, Download, Volume2, VolumeX, Mic, Gamepad2, Film, Maximize, Minimize, RotateCcw, ChevronLeft, ChevronRight, MoreHorizontal, Copy, Check, FolderOpen, Trash2, HardDrive, Loader2, AlertCircle, Undo2, Redo2, SlidersHorizontal, Pencil } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import type { ClipAnalysis, EclipseClip } from '../../types/game'
import { ClipSharePanel } from './ClipSharePanel'
import { ClipWaveform } from './ClipWaveform'
import { ClipVideoStrip } from './ClipVideoStrip'
import { createClipAudioClock } from '../../services/clipAudioClock'
import { createClipPlayback } from '../../services/clipPlayback'
import { clampClipPosition, minimumClipSelection, clipOutputDuration, clipOutputTime, clipSourceTime, normalizeClipCuts } from '../../services/clipEdits'
import { useClipEdits } from './useClipEdits'
import type { DiscordClipCopy } from './useDiscordClipCopy'
import { clipExportRequest, DISCORD_FILE_LIMIT_BYTES } from '../../services/clipSharing'
import './clip-editor.css'
import {useMediaCleanup} from '../../hooks/useMediaCleanup'

const time = (seconds: number, precise = false) => {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const safe = precise ? Math.round(value * 100) / 100 : Math.floor(value)
  return `${Math.floor(safe/60).toString().padStart(2,'0')}:${(precise ? (safe%60).toFixed(2) : Math.floor(safe%60).toString()).padStart(precise ? 5 : 2,'0')}`
}
const bytes = (value: number) => value >= 1_000_000_000 ? `${(value/1_000_000_000).toFixed(2)} GB` : `${(value/1_000_000).toFixed(1)} MB`

export function ClipEditor({ clip, onClose, onDelete, onCopy, onOptimize, discordCopy }: {
  clip: EclipseClip; onClose: () => void; onDelete: () => void; onCopy: () => void; onOptimize: () => Promise<void>; discordCopy: DiscordClipCopy
}) {
  const { language, locale } = useTranslation()
  const de = language === 'de'
  const copyStatus = discordCopy.status?.key === clip.id ? discordCopy.status : null
  const copying = copyStatus?.phase === 'working'
  const video = useRef<HTMLVideoElement>(null)
  const gameAudio = useRef<HTMLAudioElement>(null)
  const discordAudio = useRef<HTMLAudioElement>(null)
  const desktopAudio = useRef<HTMLAudioElement>(null)
  const micAudio = useRef<HTMLAudioElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const backdropPointer = useRef<number | null>(null)
  useMediaCleanup(dialog,true)
  const stage = useRef<HTMLDivElement>(null)
  const timeline = useRef<HTMLDivElement>(null)
  const playhead = useRef<HTMLDivElement>(null)
  const drag = useRef<'seek' | 'start' | 'end' | null>(null)
  const dragOrigin = useRef(0)
  const dragOffset = useRef(0)
  const resumeAfterDrag = useRef(false)
  const pendingSeek = useRef<number | null>(null)
  const seekFrame = useRef(0)
  const boundaryTimer = useRef<ReturnType<typeof setTimeout>>()
  const buffering = useRef(false)
  const closeAction = useRef(onClose); closeAction.current = onClose
  const [analysis, setAnalysis] = useState<ClipAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(true)
  const [analysisAttempt, setAnalysisAttempt] = useState(0)
  const edits = useClipEdits(clip)
  const { state: { title, start, end, gameVolume, micVolume, discordVolume = 1, desktopVolume = 1, cuts, output, cropX }, duration, setDuration, read: readEdit, readDuration, change, begin: beginEdit, commit: commitEdit, undo, redo } = edits
  const [cutMark, setCutMark] = useState<number | null>(null)
  const [smallExport, setSmallExport] = useState(false)
  const [position, setPosition] = useState(() => readEdit().start)
  const [playing, setPlaying] = useState(false)
  const [playRequested,setPlayRequested]=useState(false)
  const [mediaPending,setMediaPending]=useState(true)
  const [mediaReady,setMediaReady]=useState(false)
  const mediaFailed=useRef(false)
  const [speed, setSpeed] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [error, setError] = useState('')
  const playbackPrepare=useRef<(player:HTMLVideoElement)=>boolean>(()=>false)
  const playbackError=useRef<(error:unknown)=>void>(()=>{})
  playbackError.current=()=>{mediaFailed.current=true;setMediaPending(false);setError(de?'Der Clip kann gerade nicht abgespielt werden.':'Unable to play this clip.')}
  const playback=useRef<ReturnType<typeof createClipPlayback>>()
  if(!playback.current)playback.current=createClipPlayback(()=>video.current,player=>playbackPrepare.current(player),setPlayRequested,reason=>playbackError.current(reason))
  const facts = analysis?.clip || clip
  const frameRate = useRef(60); frameRate.current = facts.averageFps || facts.captureFps || 60
  const src = useMemo(() => `${clip.videoUrl.split('?')[0]}?v=${clip.videoFileSize || clip.fileSize || clip.createdAt}`, [clip.id, clip.videoUrl, clip.videoFileSize, clip.fileSize, clip.createdAt])
  const separate = analysis?.separateAudio === true
  const externalGame = separate && !!analysis?.game?.url
  const externalMic = separate && !!analysis?.mic?.url
  const audioError = useRef<(error: unknown) => void>(() => {})
  audioError.current = () => setError(de ? 'Eine Tonspur konnte nicht abgespielt werden.' : 'An audio track could not be played.')
  const audioClock = useRef<ReturnType<typeof createClipAudioClock>>()
  if (!audioClock.current) audioClock.current = createClipAudioClock(error => audioError.current(error))

  useEffect(() => {
    let active = true
    setAnalyzing(true); setAnalysis(null)
    window.electronAPI?.clips?.analyzeClip?.(clip.id).then(result => {
      if (!active) return
      setAnalysis(result)
      if (result.success && result.clip?.duration) {
        setDuration(result.clip.duration)
      }
    }).catch(reason => { if (active) setAnalysis({ success: false, error: String(reason) }) }).finally(() => { if (active) setAnalyzing(false) })
    return () => { active = false }
  }, [clip.id, src, analysisAttempt, setDuration])

  const syncAudio = useCallback((discontinuity = false) => {
    const source = video.current
    if (!source) return
    for (const audio of [gameAudio.current, micAudio.current, discordAudio.current, desktopAudio.current]) {
      if (!audio) continue
      audioClock.current!({ playing: !source.paused, seeking: source.seeking, currentTime: source.currentTime, playbackRate: source.playbackRate }, audio, buffering.current || !!drag.current, discontinuity)
    }
  }, [])

  useEffect(() => {
    if (video.current) { video.current.muted = separate; video.current.volume = gameVolume; video.current.playbackRate = speed }
    if (gameAudio.current) gameAudio.current.volume = gameVolume
    if (micAudio.current) micAudio.current.volume = micVolume
    if (discordAudio.current) discordAudio.current.volume = discordVolume
    if (desktopAudio.current) desktopAudio.current.volume = desktopVolume
    syncAudio()
  }, [separate, gameVolume, micVolume, discordVolume, desktopVolume, speed, syncAudio])

  const paintPosition = useCallback((value: number) => {
    const target = clampClipPosition(value, readEdit()), length = readDuration()
    if (playhead.current && length) playhead.current.style.left = target / length * 100 + '%'
    return target
  }, [readEdit, readDuration])

  const pauseMedia = useCallback(() => {
    clearTimeout(boundaryTimer.current)
    playback.current?.pause()
    for (const media of [gameAudio.current, micAudio.current, discordAudio.current, desktopAudio.current]) media?.pause()
  }, [])

  const stopAtEnd = useCallback(() => {
    const player = video.current, limit = readEdit().end
    pauseMedia()
    if (player && Math.abs(player.currentTime - limit) > .0001) player.currentTime = limit
    setPosition(paintPosition(limit)); syncAudio(true)
  }, [readEdit, paintPosition, pauseMedia, syncAudio])

  const constrainPlayback = useCallback(() => {
    const player = video.current
    if (!player || !readDuration()) return false
    if (player.paused && playback.current?.wanted()) return false
    const bounds = readEdit()
    const next = clampClipPosition(player.currentTime, bounds)
    if (next > player.currentTime + .001 && player.currentTime >= bounds.start) { if(next>=bounds.end-.001){stopAtEnd();return true} player.currentTime = next; setPosition(paintPosition(next)); syncAudio(true); return false }
    if (player.currentTime >= bounds.end - .001) { stopAtEnd(); return true }
    if (player.currentTime < bounds.start - .001) {
      player.currentTime = bounds.start; setPosition(paintPosition(bounds.start)); syncAudio(true)
    }
    return false
  }, [readDuration, readEdit, stopAtEnd, paintPosition, syncAudio])

  const scheduleBoundary = useCallback(function schedule() {
    clearTimeout(boundaryTimer.current)
    const player = video.current
    if (!player || player.paused || player.seeking || buffering.current || !readDuration()) return
    const state = readEdit(), nextCut = state.cuts?.find(cut => cut.start > player.currentTime + .001)
    const limit = nextCut?.start ?? state.end
    const remaining = (limit - player.currentTime) / player.playbackRate
    if (remaining <= .002) {
      if(nextCut){player.currentTime=nextCut.end;setPosition(paintPosition(nextCut.end));syncAudio(true)}else stopAtEnd()
      return
    }
    boundaryTimer.current = setTimeout(() => {
      if (!player.paused) {
        if (nextCut && player.currentTime >= limit - .003) { player.currentTime = nextCut.end; setPosition(paintPosition(nextCut.end)); syncAudio(true); schedule() }
        else if (player.currentTime >= readEdit().end - .003) stopAtEnd()
        else schedule()
      }
    }, Math.max(4, remaining * 1000))
  }, [readEdit, readDuration, stopAtEnd, paintPosition, syncAudio])

  const seek = useCallback((value: number) => {
    const bounds = readEdit(), cut = bounds.cuts?.find(cut=>value>=cut.start&&value<cut.end)
    const backwards = value < (drag.current === 'seek' ? dragOrigin.current : video.current?.currentTime ?? bounds.start)
    const target = clampClipPosition(cut&&backwards&&cut.start>bounds.start?cut.start-.004:value, bounds)
    setPosition(paintPosition(target)); pendingSeek.current = target
    if (seekFrame.current) return
    seekFrame.current = requestAnimationFrame(() => {
      seekFrame.current = 0
      const point = pendingSeek.current; pendingSeek.current = null
      if (point !== null && video.current) {
        video.current.currentTime = clampClipPosition(point, readEdit())
        if (!constrainPlayback()) syncAudio(true)
        scheduleBoundary()
      }
    })
  }, [readEdit, paintPosition, constrainPlayback, syncAudio, scheduleBoundary])

  const changeTrim = useCallback((kind: 'start' | 'end', value: number) => {
    const bounds = readEdit(), minimum = minimumClipSelection(readDuration())
    const target = kind === 'start' ? Math.max(0, Math.min(bounds.end - minimum, value)) : Math.max(bounds.start + minimum, Math.min(readDuration(), value))
    change({ [kind]: target }); seek(target)
  }, [readEdit, readDuration, change, seek])

  const stepPosition = useCallback((seconds: number) => {
    const state=readEdit();seek(clipSourceTime(clipOutputTime(video.current?.currentTime || 0,state)+seconds,state))
  },[readEdit,seek])

  playbackPrepare.current=player=>{
    if(!readDuration()||drag.current)return false
    const bounds=readEdit(),target=clampClipPosition(player.currentTime>=bounds.end-.001?bounds.start:player.currentTime,bounds)
    if(Math.abs(player.currentTime-target)>.001){player.currentTime=target;setPosition(paintPosition(target));return false}
    return true
  }
  const togglePlay = useCallback(() => {
    if(playback.current?.wanted()||video.current&&!video.current.paused){pauseMedia();return}
    cancelAnimationFrame(seekFrame.current);seekFrame.current=0;pendingSeek.current=null
    clearTimeout(boundaryTimer.current)
    if(video.current?.readyState&&video.current.readyState>=2&&!video.current.seeking){buffering.current=false;setMediaPending(false)}
    playback.current?.play()
  }, [pauseMedia])

  const applyHistory = useCallback((action: 'undo' | 'redo') => {
    pauseMedia()
    if (action === 'undo') undo(); else redo()
    seek(clampClipPosition(video.current?.currentTime || 0, readEdit()))
  }, [pauseMedia, undo, redo, readEdit, seek])

  const toggleFullscreen = useCallback(() => {
    const action = document.fullscreenElement === stage.current ? document.exitFullscreen() : stage.current?.requestFullscreen()
    void action?.catch(() => setError(de ? 'Vollbild konnte nicht geöffnet werden.' : 'Unable to open fullscreen.'))
  }, [de])

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  useLayoutEffect(() => {
    if (!duration) return
    const player = video.current
    const current = player?.currentTime || 0, target = clampClipPosition(current, readEdit())
    if (player && Math.abs(target - current) > .0001) { pauseMedia(); player.currentTime = target; syncAudio(true) }
    setPosition(paintPosition(target))
    if (player && current >= end - .001) stopAtEnd()
    else scheduleBoundary()
  }, [start, end, cuts, duration, readEdit, paintPosition, pauseMedia, syncAudio, stopAtEnd, scheduleBoundary])

  useEffect(() => {
    if (!playing) return
    let frame = 0, lastLabel = 0
    const update = (now: number) => {
      const player = video.current
      if (!player) return
      const current = paintPosition(player.currentTime)
      if (!drag.current && now - lastLabel > 100) { setPosition(current); lastLabel = now; syncAudio() }
      if (!drag.current && !player.seeking) constrainPlayback()
      frame = requestAnimationFrame(update)
    }
    scheduleBoundary(); frame = requestAnimationFrame(update)
    return () => { cancelAnimationFrame(frame); clearTimeout(boundaryTimer.current) }
  }, [playing, paintPosition, syncAudio, constrainPlayback, scheduleBoundary])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus({ preventScroll: true })
    return()=>{cancelAnimationFrame(seekFrame.current);pendingSeek.current=null;pauseMedia();if(previous?.isConnected)previous.focus({preventScroll:true})}
  },[pauseMedia])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[data-app-select-menu][data-state="open"]')) return
      const typing=(event.target as HTMLElement)?.closest?.('[role=combobox]')||event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement||event.target instanceof HTMLTextAreaElement||(event.target as HTMLElement)?.isContentEditable
      if (!typing && (event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopPropagation()
        applyHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo')
        return
      }
      if (event.key === 'Escape') {
        if (document.fullscreenElement) return
        event.preventDefault(); event.stopPropagation(); closeAction.current(); return
      }
      if (event.key === 'Tab') {
        const root = document.fullscreenElement || dialog.current
        const focusable = [...(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,a[href]') || [])].filter(node => node.getClientRects().length > 0)
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first?.focus() }
      }
      const handle = (event.target as HTMLElement)?.dataset?.trimHandle
      if (handle && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        const bounds = readEdit(), amount = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : 1 / frameRate.current)
        beginEdit('trim-key'); changeTrim(handle as 'start' | 'end', bounds[handle as 'start' | 'end'] + amount); commitEdit('trim-key')
        return
      }
      if (typing) return
      if (event.code === 'Space'||event.key===' ') { event.preventDefault();event.stopPropagation();if(!event.repeat)togglePlay() }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); stepPosition((event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 5 : 1)) }
      else if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen() }
    }
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('keydown', key, true)
    }
  }, [readEdit, applyHistory, seek, stepPosition, togglePlay, toggleFullscreen, beginEdit, commitEdit, changeTrim, pauseMedia])

  const point = (clientX: number) => {
    const rect = timeline.current?.getBoundingClientRect()
    return rect && rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration : 0
  }
  const move = (clientX: number) => {
    const value = point(clientX)-(drag.current==='start'||drag.current==='end'?dragOffset.current:0)
    if (drag.current === 'start' || drag.current === 'end') changeTrim(drag.current, value)
    else if (drag.current === 'seek') seek(value)
  }
  const begin = (event: React.PointerEvent, kind: 'seek' | 'start' | 'end') => {
    if (!duration || event.button !== 0) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    resumeAfterDrag.current = kind === 'seek' && !!video.current && !video.current.paused
    dragOrigin.current = video.current?.currentTime ?? start
    drag.current = kind; pauseMedia()
    dragOffset.current=kind==='seek'?0:point(event.clientX)-readEdit()[kind]
    if (kind !== 'seek') beginEdit('trim-pointer')
    if(kind==='seek')move(event.clientX)
  }
  const finish = (event: React.PointerEvent) => {
    if (!drag.current) return
    move(event.clientX)
    if (drag.current !== 'seek') commitEdit('trim-pointer')
    drag.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    if (resumeAfterDrag.current) requestAnimationFrame(() => {
      const player = video.current
      if (player && player.currentTime < readEdit().end - .001) playback.current?.play()
    })
    resumeAfterDrag.current = false
  }
  const cancelDrag = () => {
    if (drag.current && drag.current !== 'seek') { edits.cancel('trim-pointer'); seek(video.current?.currentTime || 0) }
    drag.current = null; resumeAfterDrag.current = false
  }
  const close = () => { commitEdit(); void edits.flush(); onClose() }
  closeAction.current = close
  const ticks = Array.from({ length: 7 },(_,i)=>duration*i/6)

  async function exportClip() {
    if (!duration || exporting) return
    setExporting(true); setError(''); pauseMedia()
    try {
      const state = readEdit()
      await edits.flush()
      const result = await window.electronAPI.clips?.exportClip({ ...clipExportRequest(clip,state), suggestedName: state.title.replace(/[^\p{L}\p{N}_ -]/gu,'_'), ...(smallExport ? { maxBytes: DISCORD_FILE_LIMIT_BYTES } : {}) })
      if (!result) throw new Error(de?'Der Export ist nicht verfügbar.':'Export is unavailable.')
      if (!result.success && result.error) setError(result.error)
    } catch (reason) { setError(String(reason)) } finally { setExporting(false) }
  }
  async function prepareShare() {
    pauseMedia()
    await edits.flush()
    return clipExportRequest(clip,readEdit())
  }
  async function optimizeOriginal() {
    setMenu(false); setOptimizing(true)
    const player = video.current
    pauseMedia();player?.removeAttribute('src'); player?.load()
    try { await onOptimize() } catch (reason) { setError(String(reason)) }
    finally { setOptimizing(false); if (player?.isConnected) { player.src=src; player.load() } }
  }

  const gameAvailable = analysis?.game?.available ?? true
  const micAvailable = !!analysis?.mic?.available
  const track = (kind: 'game'|'mic'|'discord'|'desktop') => {
    const isGame=kind==='game', isDiscord=kind==='discord', isDesktop=kind==='desktop', available=isDesktop?!!analysis?.desktop?.available:isDiscord?!!analysis?.discord?.available:isGame?gameAvailable:micAvailable, volume=isDesktop?desktopVolume:isDiscord?discordVolume:isGame?gameVolume:micVolume
    const field = isDesktop?'desktopVolume':isDiscord?'discordVolume':isGame ? 'gameVolume' : 'micVolume', data=isDesktop?analysis?.desktop:isDiscord?analysis?.discord:isGame?analysis?.game:analysis?.mic
    const setVolume = (value: number) => change({ [field]: value,
      ...(value > 0 && analysis?.desktop?.available ? isDesktop ? { gameVolume: 0, discordVolume: 0 } : isGame || isDiscord ? { desktopVolume: 0 } : {} : {}) })
    const label=isDesktop?(de?'Desktop-Ton':'Desktop sound'):isDiscord?'Discord':isGame?(separate?(facts.applicationAudio?(de?'Spielton':'Game audio'):(de?'Spiel-/Systemton':'Game / system')):(de?'Gemischter Ton':'Mixed audio')):(de?'Mikrofon':'Microphone')
    return <div className={`clip-track clip-track--${kind} ${!available?'clip-track--missing':''}`} data-clip-track={kind}>
      <div className="clip-track-label"><span>{isDesktop?<Volume2 size={14}/>:isGame?<Gamepad2 size={14}/>:<Mic size={14}/>} {label}</span><div>
        <button disabled={!available} onClick={()=>{beginEdit('mute');setVolume(volume?0:1);commitEdit('mute')}} aria-label={`${label}: ${volume?(de?'stumm':'mute'):(de?'Ton an':'unmute')}`}>{volume?<Volume2 size={12}/>:<VolumeX size={12}/>}</button>
        <input data-track-volume={kind} type="range" min="0" max="1" step=".01" value={volume} onPointerDown={()=>beginEdit(field)} onPointerUp={()=>commitEdit(field)} onPointerCancel={()=>commitEdit(field)} onBlur={()=>commitEdit(field)} onKeyUp={()=>commitEdit(field)} onChange={event=>{beginEdit(field);setVolume(Number(event.target.value))}} disabled={!available} aria-label={label}/><span>{Math.round(volume*100)}%</span>
      </div></div>
      <div className="clip-track-wave"><ClipWaveform peaks={data?.peaks || []} muted={!available || volume===0} color={isGame?'#dba46a':'#8ba7c0'}/>
        {!available && <span>{de?'Nicht aufgenommen':'Not recorded'}</span>}
        {available && analyzing && <span>{de?'Tonspur wird analysiert …':'Analyzing audio…'}</span>}
      </div>
    </div>
  }

  return createPortal(<div className="clip-editor-backdrop" data-clip-editor
    onPointerDown={event => { backdropPointer.current = event.target === event.currentTarget && event.button === 0 ? event.pointerId : null }}
    onPointerCancel={() => { backdropPointer.current = null }}
    onClick={event => {
      const outside = event.target === event.currentTarget && backdropPointer.current !== null
      backdropPointer.current = null
      if (outside) close()
    }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={de?'Clip bearbeiten':'Edit clip'} className={`clip-editor ${advanced?'clip-editor--advanced':'clip-editor--quick'}`} data-clip-mode={advanced?'editor':'preview'}>
      <header className="clip-editor-header"><button className="clip-icon-button" onClick={close} title={de?'Schließen (Esc)':'Close (Esc)'} data-clip-close><ChevronLeft size={18}/></button>
        <div className="clip-editor-heading"><strong>{title.trim()||edits.baseTitle}</strong><span>{clip.gameTitle} · {new Date(clip.createdAt).toLocaleDateString(locale)}<i className="clip-draft-status" data-clip-draft-status={edits.status} title={edits.savedAt?new Date(edits.savedAt).toLocaleString(locale):undefined}>{edits.status==='clean'?'':edits.status==='error'?(de?'Entwurf nicht gespeichert':'Draft not saved'):edits.status==='saved'?(de?'Entwurf gespeichert':'Draft saved'):(de?'Entwurf wird gespeichert…':'Saving draft…')}</i></span></div>
        <div className="clip-history-controls"><button className="clip-icon-button" data-clip-undo disabled={!edits.canUndo} onClick={()=>applyHistory('undo')} title={de?'Rückgängig (Strg+Z)':'Undo (Ctrl+Z)'} aria-label={de?'Rückgängig':'Undo'}><Undo2 size={17}/></button><button className="clip-icon-button" data-clip-redo disabled={!edits.canRedo} onClick={()=>applyHistory('redo')} title={de?'Wiederholen (Strg+Shift+Z / Strg+Y)':'Redo (Ctrl+Shift+Z / Ctrl+Y)'} aria-label={de?'Wiederholen':'Redo'}><Redo2 size={17}/></button></div>
        <div className="clip-menu"><button className="clip-icon-button" aria-expanded={menu} aria-label={de?'Weitere Aktionen':'More actions'} onClick={()=>setMenu(!menu)}><MoreHorizontal size={19}/></button>{menu&&<div className="clip-editor-menu">
          <button disabled={discordCopy.busy} onClick={()=>{setMenu(false);onCopy()}}><Copy size={14}/>{de?'Original kopieren':'Copy original'}</button>
          <button onClick={()=>{setMenu(false);void window.electronAPI.clips?.openFolder(clip.filePath)}}><FolderOpen size={14}/>{de?'Im Ordner anzeigen':'Show in folder'}</button>
          <button disabled={optimizing||discordCopy.busy} onClick={()=>void optimizeOriginal()}><HardDrive size={14}/>{de?'Speicher optimieren':'Optimize storage'}</button>
          <button data-clip-discard-draft disabled={!edits.hasDraft} onClick={()=>{setMenu(false);pauseMedia();void edits.discard();seek(readEdit().start)}}><RotateCcw size={14}/>{de?'Entwurf verwerfen':'Discard draft'}</button>
          <button disabled={discordCopy.busy} onClick={()=>{setMenu(false);onDelete()}}><Trash2 size={14}/>{de?'Clip löschen':'Delete clip'}</button>
        </div>}</div>
        <button className="clip-discord-button" data-clip-copy-discord disabled={discordCopy.busy||exporting||optimizing||!duration} title={de?'Schnitt und Tonmischung als Datei bis 20 MB kopieren. In Discord mit Strg+V einfügen.':'Copy the edited clip and audio mix up to 20 MB. Paste into Discord with Ctrl+V.'} onClick={()=>void discordCopy.copy(clip.id,prepareShare)}>{copying?<Loader2 size={14} className="animate-spin"/>:copyStatus?.phase==='copied'?<Check size={14}/>:<Copy size={14}/>}<span>{copying?(de?'Wird vorbereitet…':'Preparing…'):copyStatus?.phase==='copied'?(de?'Kopiert':'Copied'):(de?'Für Discord kopieren':'Copy for Discord')}</span></button>
        <button className="clip-export-button" onClick={()=>void exportClip()} disabled={exporting||optimizing||discordCopy.busy||!duration} data-clip-export>{exporting?<Loader2 size={14} className="animate-spin"/>:<Download size={14}/>} {exporting?(de?'Exportiere …':'Exporting…'):(de?'Exportieren':'Export')}</button>
        <button className="clip-icon-button" onClick={close} aria-label={de?'Schließen':'Close'}><X size={17}/></button>
      </header>
      {copyStatus&&<p className="clip-discord-status" data-clip-share-message role={copyStatus.phase==='error'?'alert':'status'}>{copyStatus.message}</p>}
      <div className="clip-editor-workspace">
        <div className="clip-editor-preview">
          <div ref={stage} className={`clip-preview-stage ${output && output !== 'source' ? 'clip-preview-cropped' : ''}`} data-clip-stage aria-busy={mediaPending} style={output && output !== 'source' ? { '--clip-ratio': output === 'portrait' ? '9/16' : '1', '--clip-crop-x': `${(cropX ?? .5)*100}%` } as React.CSSProperties : undefined}>
            <video ref={video} src={src} poster={clip.thumbnailUrl||undefined} preload="auto" playsInline muted={separate} onClick={togglePlay} onDoubleClick={toggleFullscreen}
              onLoadStart={()=>{setMediaPending(true);setMediaReady(false);mediaFailed.current=false}}
              onLoadedMetadata={()=>{const value=video.current?.duration;if(value&&Number.isFinite(value)){setDuration(value);constrainPlayback();setPosition(paintPosition(video.current?.currentTime||0))}}}
              onLoadedData={()=>{setMediaReady(true);setMediaPending(false);buffering.current=false;playback.current?.ready()}}
              onCanPlay={()=>{setMediaReady(true);if(!video.current?.seeking){buffering.current=false;setMediaPending(false);playback.current?.ready();syncAudio();scheduleBoundary()}}}
              onPlay={()=>{setPlaying(true);if(!constrainPlayback()){syncAudio();scheduleBoundary()}}} onPause={()=>{playback.current?.observedPause();setPlaying(false);clearTimeout(boundaryTimer.current);gameAudio.current?.pause();micAudio.current?.pause();discordAudio.current?.pause();desktopAudio.current?.pause()}}
              onPlaying={()=>{buffering.current=false;setMediaPending(false);if(!constrainPlayback()){syncAudio();scheduleBoundary()}}} onWaiting={()=>{buffering.current=true;setMediaPending(true);clearTimeout(boundaryTimer.current);gameAudio.current?.pause();micAudio.current?.pause();discordAudio.current?.pause();desktopAudio.current?.pause()}}
              onSeeking={()=>{setMediaPending(true);clearTimeout(boundaryTimer.current);gameAudio.current?.pause();micAudio.current?.pause();discordAudio.current?.pause();desktopAudio.current?.pause();constrainPlayback()}} onSeeked={()=>{if(video.current&&video.current.readyState>=2){buffering.current=false;setMediaPending(false)}if(!constrainPlayback()){playback.current?.ready();syncAudio(true)}scheduleBoundary();if(!drag.current&&pendingSeek.current===null)setPosition(paintPosition(video.current?.currentTime||0))}} onTimeUpdate={constrainPlayback} onRateChange={scheduleBoundary}
              onEnded={()=>{setPlaying(false);stopAtEnd()}} onError={()=>{mediaFailed.current=true;setMediaPending(false);pauseMedia();setError(de?'Die Videodatei konnte nicht geöffnet werden.':'Unable to open the video file.')}}/>
            {separate&&analysis?.desktop?.url&&<audio ref={desktopAudio} src={analysis.desktop.url} preload="auto" onCanPlay={()=>syncAudio()}/>}
            {externalGame&&<audio ref={gameAudio} src={analysis?.game?.url} preload="auto" onCanPlay={()=>syncAudio()}/>}
            {separate&&analysis?.discord?.url&&<audio ref={discordAudio} src={analysis.discord.url} preload="auto" onCanPlay={()=>syncAudio()}/>}
            {externalMic&&<audio ref={micAudio} src={analysis?.mic?.url} preload="auto" onCanPlay={()=>syncAudio()}/>}
            {mediaPending&&<div className="clip-player-loading" data-clip-loading role="status"><Loader2 size={24} className="animate-spin"/><span>{de?'Clip wird geladen…':'Loading clip…'}</span></div>}
            {!playing&&!playRequested&&!mediaPending&&<button className="clip-stage-play" onClick={togglePlay} aria-label={de?'Abspielen':'Play'}><Play size={26} fill="currentColor"/></button>}
            {fullscreen&&<button className="clip-stage-fullscreen" onClick={toggleFullscreen}><Minimize size={18}/></button>}
          </div>
          <div className="clip-transport"><div><button data-clip-play onClick={togglePlay} aria-label={playing||playRequested?(de?'Pausieren':'Pause'):(de?'Abspielen':'Play')}>{playing||playRequested?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button onClick={()=>stepPosition(-1)} title="−1s"><ChevronLeft size={16}/></button><button onClick={()=>stepPosition(1)} title="+1s"><ChevronRight size={16}/></button><span className="clip-timecode" data-clip-time>{time(clipOutputTime(position,edits.state),true)} <i>/ {time(clipOutputDuration(edits.state),true)}</i></span></div>
            <div><Select value={speed} onChange={event=>setSpeed(Number(event.target.value))} aria-label={de?'Geschwindigkeit':'Playback speed'}>{[.5,.75,1,1.25,1.5,2].map(value=><option key={value} value={value}>{value}×</option>)}</Select><button onClick={toggleFullscreen} title={de?'Vollbild (F)':'Fullscreen (F)'} data-clip-fullscreen><Maximize size={16}/></button></div></div>
        </div>
        <aside className="clip-inspector">
          <div className="clip-quick-rename"><label htmlFor="clip-title"><Pencil size={12}/>{de?'Clip-Name':'Clip name'}</label><input id="clip-title" data-clip-title value={title} maxLength={500} onFocus={()=>beginEdit('title')} onChange={event=>{beginEdit('title');change({title:event.target.value})}} onBlur={()=>{if(!readEdit().title.trim())change({title:edits.baseTitle});commitEdit('title');void edits.flush()}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur()}}} aria-label={de?'Clip-Titel':'Clip title'}/><span>{de?'Wird automatisch gespeichert':'Saves automatically'}</span></div>
          <h3>{de?'Clip-Details':'Clip details'}</h3>
          {analyzing?<p className="clip-analysis-status"><Loader2 size={13} className="animate-spin"/>{de?'Datei wird geprüft …':'Inspecting file…'}</p>:<dl>
            <div><dt>{de?'Auflösung':'Resolution'}</dt><dd>{facts.width&&facts.height?`${facts.width} × ${facts.height}`:'—'}</dd></div>
            <div><dt>{de?'Bildrate':'Frame rate'}</dt><dd>{facts.averageFps?`${facts.averageFps.toFixed(2)} FPS`:'—'}</dd></div>
            <div><dt>{de?'Gesamtbitrate':'Total bitrate'}</dt><dd>{facts.bitrate||'—'}</dd></div>
            <div><dt>{de?'Videodatei':'Video file'}</dt><dd>{bytes(facts.videoFileSize||facts.fileSize)}</dd></div>
            {!!facts.audioFileSize&&<div><dt>{de?'Separate Tonspuren':'Separate audio'}</dt><dd>{bytes(facts.audioFileSize)}</dd></div>}
            <div><dt>{de?'Belegter Speicher':'Disk usage'}</dt><dd>{bytes(facts.fileSize)}</dd></div>
          </dl>}
          {!!facts.requestedResolution&&<p className="clip-source-note">{de?'Aufnahme-Ziel':'Capture target'}: {facts.requestedResolution} · {facts.requestedFps} FPS<br/>{de?'Quelle':'Source'}: {facts.captureWidth&&facts.captureHeight?`${facts.captureWidth} × ${facts.captureHeight}`:'—'}{facts.captureFps?` · ${facts.captureFps} FPS`:''}</p>}
          <h3>{de?'Ausschnitt':'Selection'}</h3><label>{de?'Anfang':'Start'}<input data-clip-trim-start type="number" min="0" max={Math.max(0,end-.1)} step=".01" value={Number(start.toFixed(2))} onFocus={()=>beginEdit('start-input')} onBlur={()=>commitEdit('start-input')} onChange={event=>{beginEdit('start-input');pauseMedia();changeTrim('start',Number(event.target.value)||0)}}/></label>
          <label>{de?'Ende':'End'}<input data-clip-trim-end type="number" min={Math.min(duration,start+.1)} max={duration} step=".01" value={Number(end.toFixed(2))} onFocus={()=>beginEdit('end-input')} onBlur={()=>commitEdit('end-input')} onChange={event=>{beginEdit('end-input');pauseMedia();changeTrim('end',Number(event.target.value)||duration)}}/></label>
          <div className="clip-selection-duration"><span>{de?'Länge':'Length'}</span><strong>{time(clipOutputDuration(edits.state),true)}</strong></div>
          <button className="clip-reset-button" data-clip-reset-selection onClick={()=>{beginEdit('reset');change({start:0,end:duration,cuts:undefined});commitEdit('reset');seek(readEdit().start)}}><RotateCcw size={12}/>{de?'Ausschnitt zurücksetzen':'Reset selection'}</button>
          {advanced&&<><h3>{de?'Bereiche entfernen':'Remove sections'}</h3>
          <p className="clip-source-note">{de?'Markiere Anfang und Ende der Pause. Die übrigen Teile werden lückenlos zusammengefügt.':'Mark the start and end of a gap. Remaining sections are joined seamlessly.'}</p>
          <button className="clip-edit-tool" data-clip-cut-mark onClick={()=>{pauseMedia();setCutMark(video.current?.currentTime ?? start)}}>{cutMark===null?(de?'Anfang hier markieren':'Mark start here'):`${time(cutMark,true)} · ${de?'neu markieren':'mark again'}`}</button>
          <button className="clip-edit-tool" data-clip-cut-remove disabled={cutMark===null} onClick={()=>{
            pauseMedia(); const state=readEdit(), point=video.current?.currentTime ?? start
            const next=normalizeClipCuts([...(state.cuts||[]),{start:Math.min(cutMark!,point),end:Math.max(cutMark!,point)}],state.start,state.end)
            if(Math.abs(point-cutMark!)<.02 || clipOutputDuration({...state,cuts:next})<.1){setError(de?'Wähle einen Bereich und behalte mindestens 0,1 Sekunden.':'Select a gap and keep at least 0.1 seconds.');return}
            change({cuts:next});setCutMark(null);seek(point)
          }}>{de?'Bis hier entfernen':'Remove up to here'}</button>
          {!!cuts?.length&&<div className="clip-cut-list">{cuts.map((cut,index)=><div key={`${cut.start}:${cut.end}`}><span>{time(cut.start,true)} – {time(cut.end,true)}</span><button data-clip-cut-restore={index} onClick={()=>change({cuts:cuts.filter((_,i)=>i!==index)})} title={de?'Bereich wiederherstellen':'Restore section'}><X size={12}/></button></div>)}</div>}
          <h3>{de?'Exportformat':'Export format'}</h3>
          <label>{de?'Bildformat':'Aspect ratio'}<Select data-clip-output value={output||'source'} onChange={event=>{pauseMedia();change({output:event.target.value as 'source'|'portrait'|'square'})}}><option value="source">Original</option><option value="portrait">9:16 · Shorts</option><option value="square">{de?'1:1 · Quadrat':'1:1 · Square'}</option></Select></label>
          {output&&output!=='source'&&<label>{de?'Bildausschnitt':'Crop position'}<input data-clip-crop type="range" min="0" max="1" step=".01" value={cropX??.5} onPointerDown={()=>beginEdit('crop')} onPointerUp={()=>commitEdit('crop')} onBlur={()=>commitEdit('crop')} onChange={event=>{beginEdit('crop');change({cropX:Number(event.target.value)})}}/></label>}
          <label className="clip-size-limit"><span>Discord · ≤20 MB</span><input data-clip-small-export type="checkbox" checked={smallExport} onChange={event=>setSmallExport(event.target.checked)}/></label>
          <p className="clip-source-note">{de?'Der Discord-Export prüft die tatsächliche Dateigröße. Bei langen Clips kann die Bildqualität sinken.':'Discord export checks the actual file size. Long selections may reduce image quality.'}</p>
          </>}
          <ClipSharePanel filePath={clip.filePath} de={de} blocked={exporting||optimizing||discordCopy.busy||!duration} onBusy={setExporting} request={prepareShare}/>
          {!analyzing&&analysis?.success&&!separate&&<p className="clip-source-note">{de?'Dieser ältere Clip enthält zusammengemischten Ton. Eine separate Mikrofonspur ist darin nicht vorhanden.':'This older clip contains mixed audio. A separate microphone track is not available.'}</p>}
        </aside>
        <div className="clip-editor-timeline"><div className="clip-timeline-heading"><span><Film size={13}/>{de?'Zeitleiste':'Timeline'}</span><span>{de?'Leertaste: Wiedergabe · ← →: 1 s · Umschalt: 5 s':'Space: play · ← →: 1s · Shift: 5s'}</span></div>
          <div className="clip-ruler"><span>{advanced?(de?'Spuren':'Tracks'):(de?'Video':'Video')}</span><div>{ticks.map((value,i)=><span key={i} style={{left:`${i/6*100}%`}}>{time(value,duration<10)}</span>)}</div></div>
          <div className="clip-tracks"><div className="clip-track clip-track--video" hidden={advanced}><ClipVideoStrip src={src} enabled={mediaReady} durationHint={clip.duration} poster={clip.thumbnailUrl} label={de?'Video-Vorschaubilder':'Video thumbnails'} loadingLabel={de?'Vorschau wird geladen…':'Loading preview…'}/></div>{advanced&&<>{(gameAvailable||!analysis?.desktop?.available)&&track('game')}{analysis?.desktop?.available&&track('desktop')}{track('mic')}{analysis?.discord?.available&&track('discord')}</>}
            <div ref={timeline} className="clip-timeline-interaction" data-clip-timeline onPointerDown={event=>begin(event,'seek')} onPointerMove={event=>{if(drag.current)move(event.clientX)}} onPointerUp={finish} onPointerCancel={cancelDrag}>
              <div className="clip-excluded clip-excluded--left" style={{width:`${duration?start/duration*100:0}%`}}/><div className="clip-excluded clip-excluded--right" style={{left:`${duration?end/duration*100:100}%`}}/>
              <div className="clip-trim-selection" style={{left:`${duration?start/duration*100:0}%`,right:`${duration?(1-end/duration)*100:0}%`}}/>
              {cuts?.map((cut,index)=><div key={index} className="clip-removed-section" data-clip-cut style={{left:`${duration?cut.start/duration*100:0}%`,width:`${duration?(cut.end-cut.start)/duration*100:0}%`}}/>)}
              <button className="clip-trim-handle clip-trim-handle--start" data-trim-handle="start" aria-label={de?'Anfang verschieben':'Move start'} style={{left:`${duration?start/duration*100:0}%`}} onPointerDown={event=>begin(event,'start')} onPointerMove={event=>{event.stopPropagation();if(drag.current==='start')move(event.clientX)}} onPointerUp={event=>{event.stopPropagation();finish(event)}} onPointerCancel={cancelDrag}>Ⅱ</button>
              <button className="clip-trim-handle clip-trim-handle--end" data-trim-handle="end" aria-label={de?'Ende verschieben':'Move end'} style={{left:`${duration?end/duration*100:100}%`}} onPointerDown={event=>begin(event,'end')} onPointerMove={event=>{event.stopPropagation();if(drag.current==='end')move(event.clientX)}} onPointerUp={event=>{event.stopPropagation();finish(event)}} onPointerCancel={cancelDrag}>Ⅱ</button>
              <div ref={playhead} className="clip-playhead" data-clip-playhead style={{left:`${duration?clampClipPosition(position,{start,end})/duration*100:0}%`}}/>
            </div>
          </div>
          <div className="clip-editor-footer">
            <button type="button" data-clip-open-editor aria-expanded={advanced} onClick={()=>{commitEdit();setAdvanced(value=>!value)}}>{advanced?<ChevronLeft size={14}/>:<SlidersHorizontal size={14}/>}<span>{advanced?(de?'Zurück zum Clip':'Back to clip'):(de?'Im Editor öffnen':'Open in editor')}</span></button>
            <span>{de?'Ziehe die Ränder zum Schneiden':'Drag the edges to trim'}</span>
            <button type="button" className="clip-editor-delete" data-clip-delete disabled={exporting||optimizing||discordCopy.busy} onClick={()=>{setMenu(false);onDelete()}}><Trash2 size={14} aria-hidden="true" />{de?'Löschen':'Delete'}</button>
          </div>
        </div>
      </div>
      {(error||edits.saveError||analysis?.success===false)&&<div role="alert" className="clip-editor-error"><AlertCircle size={14}/><span>{error||edits.saveError||(de?'Die Mediendaten konnten nicht geprüft werden.':'Media analysis failed.')}</span><button onClick={()=>{if(edits.saveError)void edits.retry();else{setError('');if(mediaFailed.current){setMediaPending(true);video.current?.load();playback.current?.play()}setAnalysisAttempt(value=>value+1)}}}>{edits.saveError?(de?'Erneut speichern':'Save again'):(de?'Erneut prüfen':'Retry')}</button></div>}
    </section>
  </div>,document.body)
}
