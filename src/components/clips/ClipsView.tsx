import { Select } from '../shared/Select'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownWideNarrow, ChevronDown, Film, FolderOpen, Gamepad2, Loader2, Scissors, Search, Settings, X } from 'lucide-react'
import { SceneTransition } from '../shared/SceneTransition'
import { useClipStore, type PendingClip } from '../../store/clipStore'
import { useTranslation } from '../../hooks/useTranslation'
import { sendAppNotification } from '../../services/notificationService'
import {captureErrorMessage} from '../../services/captureErrors'
import { triggerInstantClip, startReplayBuffer, stopReplayBuffer } from '../../services/clipEngineLifecycle'
import { ClipSettingsPanel } from './ClipSettingsPanel'
import { ClipMicrophoneStatus } from './ClipMicrophoneStatus'
import { ClipEditor } from './ClipEditor'
import { ClipLibraryCard, clipBytes } from './ClipLibraryCard'
import { PendingClipCard } from './PendingClipCard'
import { useDiscordClipCopy } from './useDiscordClipCopy'
import { clipExportRequest } from '../../services/clipSharing'
import type { EclipseClip } from '../../types/game'
import { useShallow } from 'zustand/react/shallow'
import './clip-library.css'

export function ClipsView() {
  const { language, locale } = useTranslation()
  const de = language === 'de'
  const { clips, pendingClips, isLoading, activeClip, isTrimmerOpen, isSettingsOpen, isReplayBufferActive, isSavingClip,
    selectedGameFilter, searchQuery, settings, captureStatus, setActiveClip, setIsTrimmerOpen,
    setIsSettingsOpen, setSelectedGameFilter, setSearchQuery, refreshClips, optimizeClip } = useClipStore(useShallow(state => ({
      clips: state.clips, pendingClips: state.pendingClips, isLoading: state.isLoading, activeClip: state.activeClip,
      isTrimmerOpen: state.isTrimmerOpen, isSettingsOpen: state.isSettingsOpen, isReplayBufferActive: state.isReplayBufferActive,
      isSavingClip: state.isSavingClip, selectedGameFilter: state.selectedGameFilter, searchQuery: state.searchQuery,
      settings: state.settings, captureStatus: state.captureStatus, setActiveClip: state.setActiveClip,
      setIsTrimmerOpen: state.setIsTrimmerOpen, setIsSettingsOpen: state.setIsSettingsOpen,
      setSelectedGameFilter: state.setSelectedGameFilter, setSearchQuery: state.setSearchQuery,
      refreshClips: state.refreshClips, optimizeClip: state.optimizeClip,
    })))
  const discordCopy = useDiscordClipCopy(de)
  const [optimizingClipId, setOptimizingClipId] = useState<string | null>(null)
  const [exportingClipId, setExportingClipId] = useState<string | null>(null)
  const [selectedSort, setSelectedSort] = useState<'newest' | 'duration' | 'size'>('newest')
  const [onlyDrafts, setOnlyDrafts] = useState(false)
  const draftCount = useMemo(() => clips.filter(clip => !!clip.editDraft).length, [clips])
  const [startingReplay, setStartingReplay] = useState(false)
  const exportBusy = useRef(false)
  const optimizeBusy = useRef(false)

  useEffect(() => { void refreshClips() }, [refreshClips])

  const games = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>()
    for (const clip of clips) {
      if (!clip.gameTitle) continue
      const key = clip.gameTitle.toLowerCase(), entry = counts.get(key)
      if (entry) entry.count++
      else counts.set(key, { name: clip.gameTitle, count: 1 })
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, locale))
  }, [clips, locale])

  const filteredClips = useMemo(() => {
    const query = searchQuery.toLocaleLowerCase(locale).trim()
    return clips.filter(clip => (!onlyDrafts || !!clip.editDraft) && (selectedGameFilter === 'all' || clip.gameTitle.toLowerCase() === selectedGameFilter.toLowerCase()) &&
      (!query || [clip.title, clip.gameTitle, ...(clip.tags || [])].some(text => text.toLocaleLowerCase(locale).includes(query))))
      .sort((a, b) => selectedSort === 'duration' ? b.duration - a.duration : selectedSort === 'size' ? b.fileSize - a.fileSize : b.createdAt - a.createdAt)
  }, [clips, selectedGameFilter, searchQuery, selectedSort, locale, onlyDrafts])

  const pendingVisible = useMemo(() => pendingClips.filter(clip => !onlyDrafts && (selectedGameFilter === 'all' || clip.gameTitle.toLowerCase() === selectedGameFilter.toLowerCase()) &&
    (!searchQuery.trim() || [clip.title,clip.gameTitle].some(text => text.toLocaleLowerCase(locale).includes(searchQuery.toLocaleLowerCase(locale).trim())))), [pendingClips, onlyDrafts, selectedGameFilter, searchQuery, locale])
  const groups = useMemo(() => {
    if (selectedSort !== 'newest') return [{ key: selectedSort, title: selectedSort === 'duration' ? (de ? 'Nach Länge' : 'By duration') : (de ? 'Nach Dateigröße' : 'By file size'), clips: filteredClips, pending: pendingVisible }]
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const result: { key: string; title: string; clips: EclipseClip[]; pending?: PendingClip[] }[] = []
    for (const clip of filteredClips) {
      const day = new Date(clip.createdAt || 0); day.setHours(0, 0, 0, 0)
      const key = String(day.getTime())
      let group = result[result.length - 1]
      if (group?.key !== key) {
        const title = !clip.createdAt ? (de ? 'Ohne Datum' : 'Undated') : +day === +today ? (de ? 'Heute' : 'Today') : +day === +yesterday ? (de ? 'Gestern' : 'Yesterday') : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', ...(day.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) }).format(day)
        group = { key, title, clips: [] }; result.push(group)
      }
      group.clips.push(clip)
    }
    for (const pending of pendingVisible) {
      const date = new Date(pending.createdAt); date.setHours(0,0,0,0)
      const key = String(date.getTime()), group = result.find(group => group.key === key)
      if (group) (group.pending ||= []).push(pending)
      else result.unshift({ key, title: +date === +today ? (de ? 'Heute' : 'Today') : new Intl.DateTimeFormat(locale,{day:'numeric',month:'long'}).format(date), clips: [], pending: [pending] })
    }
    return result
  }, [filteredClips, selectedSort, de, locale, pendingVisible])

  const totalBytes = useMemo(() => clips.reduce((sum, clip) => sum + (clip.fileSize || 0), 0), [clips])
  const notifyError = useCallback((title: string, error: unknown) => {
    sendAppNotification({ title, body: error instanceof Error ? error.message : String(error || ''), type: 'error' })
  }, [])
  const handleOpen = useCallback((clip: EclipseClip) => { setActiveClip(clip); setIsTrimmerOpen(true) }, [setActiveClip, setIsTrimmerOpen])
  const handleRenameClip = useCallback(async (clip: EclipseClip, title: string) => {
    const result = await window.electronAPI?.clips?.updateMeta({ clipId: clip.id, title })
    if (!result?.success || !result.meta) throw new Error(result?.error || (de ? 'Der Name konnte nicht gespeichert werden.' : 'Unable to save the name.'))
    useClipStore.getState().updateClipDraft(clip.id, result.meta.editDraft || null, result.meta.title)
  }, [de])
  const handleCopyClip = useCallback(async (clip: EclipseClip) => {
    if (!window.electronAPI?.clips?.copyFile) return
    try {
      const result = await window.electronAPI.clips.copyFile(clip.filePath)
      if (!result.success) throw new Error(result.error)
      sendAppNotification({ title: de ? 'Original kopiert' : 'Original copied', body: de ? 'Die unveränderte Datei liegt in der Zwischenablage.' : 'The original file is on the clipboard.', type: 'success' })
    } catch (error) { notifyError(de ? 'Kopieren fehlgeschlagen' : 'Copy failed', error) }
  }, [de, notifyError])
  const handleCopyDiscord = useCallback((clip: EclipseClip) => {
    void discordCopy.copy(clip.id, () => clipExportRequest(clip))
  }, [discordCopy.copy])
  const handleOpenFolder = useCallback((clip?: EclipseClip) => {
    void window.electronAPI?.clips?.openFolder(clip?.filePath || '').catch(error => notifyError(de ? 'Ordner konnte nicht geöffnet werden' : 'Unable to open folder', error))
  }, [de, notifyError])
  const handleDeleteClip = useCallback(async (clip: EclipseClip) => {
    if (!confirm(de ? 'Diesen Clip wirklich löschen?' : 'Delete this clip?') || !window.electronAPI?.clips?.deleteClip) return
    try {
      const result = await window.electronAPI.clips.deleteClip(clip.id)
      if (!result.success) throw new Error(result.error)
      const store = useClipStore.getState()
      if (store.activeClip?.id === clip.id) { store.setIsTrimmerOpen(false); store.setActiveClip(null) }
      store.removeClip(clip.id)
    } catch (error) { notifyError(de ? 'Löschen fehlgeschlagen' : 'Delete failed', error) }
  }, [de, notifyError])
  const handleExportClip = useCallback(async (clip: EclipseClip) => {
    if (exportBusy.current || !window.electronAPI?.clips?.exportClip) return
    exportBusy.current = true; setExportingClipId(clip.id)
    try {
      const request = clipExportRequest(clip)
      const result = await window.electronAPI.clips.exportClip({ ...request, suggestedName: request.suggestedName.replace(/[^a-zA-Z0-9_-]/g, '_') })
      if (result.success && result.exportedPath) sendAppNotification({ title: de ? 'Clip exportiert' : 'Clip exported', body: result.exportedPath, type: 'success' })
      else if (result.error) throw new Error(result.error)
    } catch (error) { notifyError(de ? 'Export fehlgeschlagen' : 'Export failed', error) }
    finally { exportBusy.current = false; setExportingClipId(null) }
  }, [de, notifyError])
  const handleOptimizeClip = useCallback(async (clip: EclipseClip) => {
    if (optimizeBusy.current) return
    optimizeBusy.current = true; setOptimizingClipId(clip.id)
    try {
      const result = await optimizeClip(clip.id, 'balanced')
      if (result.success && result.newSize) {
        await refreshClips()
        sendAppNotification({ title: de ? 'Clip optimiert' : 'Clip optimized', body: (de ? 'Neue Dateigröße: ' : 'New file size: ') + clipBytes(result.newSize, locale), type: 'success' })
      } else sendAppNotification({ title: de ? 'Keine weitere Komprimierung möglich' : 'No further compression available', body: result.error || '', type: 'info' })
    } catch (error) { notifyError(de ? 'Optimierung fehlgeschlagen' : 'Optimization failed', error) }
    finally { optimizeBusy.current = false; setOptimizingClipId(null) }
  }, [de, locale, notifyError, optimizeClip, refreshClips])

  const filtered = onlyDrafts || selectedGameFilter !== 'all' || !!searchQuery.trim()
  const resetFilters = () => { setSelectedGameFilter('all'); setSearchQuery(''); setOnlyDrafts(false) }
  const missingAudio = isReplayBufferActive ? [settings.captureMic && captureStatus.micAvailable === false ? (de?'Mikrofon':'Microphone') : '',settings.separateApplications && settings.gameAudioProcess !== 'none' && captureStatus.gameAudioAvailable === false ? (de?'Spielton':'Game audio') : '',settings.separateApplications && settings.captureDiscord !== false && captureStatus.discordAvailable === false ? 'Discord' : ''].filter(Boolean) : []
  const gameSelection = games.find(game => game.name.toLowerCase() === selectedGameFilter.toLowerCase())?.name || selectedGameFilter

  if (isSettingsOpen) return <SceneTransition sceneKey="settings" className="launcher-page-surface clips-studio clip-settings-page"><ClipSettingsPanel onBack={() => setIsSettingsOpen(false)} /></SceneTransition>

  return <SceneTransition sceneKey="studio" className="launcher-page-surface clips-studio clip-library view-scroll" data-clip-library>
    <header className="clip-library-header">
      <div className="clip-library-heading"><h1>Clips</h1><p>{clips.length.toLocaleString(locale)} {clips.length === 1 ? 'Clip' : 'Clips'}<span>·</span>{clipBytes(totalBytes, locale)}{(draftCount>0||onlyDrafts)&&<><span>·</span><button type="button" className="clip-library-draft-filter" data-clip-draft-filter aria-pressed={onlyDrafts} onClick={()=>setOnlyDrafts(value=>!value)}>{draftCount.toLocaleString(locale)} {de?(draftCount===1?'Entwurf':'Entwürfe'):(draftCount===1?'draft':'drafts')}</button></>}</p></div>
      <div className="clip-library-controls">
        <button className="clip-library-replay" data-active={isReplayBufferActive || undefined} disabled={startingReplay} aria-pressed={isReplayBufferActive} title={isReplayBufferActive ? (de ? 'Replay-Aufnahme pausieren' : 'Pause replay recording') : (de ? 'Replay-Aufnahme starten' : 'Start replay recording')} onClick={async () => {
          if (isReplayBufferActive) stopReplayBuffer()
          else { setStartingReplay(true); try { await startReplayBuffer() } finally { setStartingReplay(false) } }
        }}><span className="clip-library-status-dot" />{startingReplay ? (de ? 'Wird gestartet…' : 'Starting…') : isReplayBufferActive ? (de ? 'Replay aktiv' : 'Replay active') : (de ? 'Replay starten' : 'Start replay')}{isReplayBufferActive && <span className="clip-library-buffer-duration">{captureStatus.historyLimitSeconds || settings.replayDurationSeconds}s</span>}</button>
        <button id="clips-save-now" className="clip-library-save" disabled={pendingClips.length >= 3 || startingReplay} onClick={() => void triggerInstantClip()}>{isSavingClip ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}<span>{de ? 'Clip speichern' : 'Save clip'}{pendingClips.length > 0 ? ` · ${pendingClips.length}` : ''}</span><kbd>{settings.hotkey || 'F8'}</kbd></button>
        <button className="clip-library-tool" onClick={() => handleOpenFolder()} aria-label={de ? 'Clip-Ordner öffnen' : 'Open clips folder'} title={de ? 'Clip-Ordner öffnen' : 'Open clips folder'}><FolderOpen size={16} /></button>
        <button id="clips-open-settings" className="clip-library-tool" onClick={() => setIsSettingsOpen(true)} aria-label={de ? 'Clip-Einstellungen' : 'Clip settings'} title={de ? 'Clip-Einstellungen' : 'Clip settings'}><Settings size={16} /></button>
      </div>
    </header>
    {(captureStatus.error || missingAudio.length > 0) && <div className="clip-library-warning" role="status">{(captureStatus.errorCode?captureErrorMessage(captureStatus.errorCode,de):captureStatus.error) || (de ? 'Nicht verfügbar, wird nicht aufgenommen: ' : 'Unavailable and not being recorded: ') + missingAudio.join(', ')}{isReplayBufferActive && settings.captureMic && <ClipMicrophoneStatus status={captureStatus} de={de} />}</div>}
    <div className="clip-library-toolbar">
      <label className="clip-library-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label={de ? 'Clips durchsuchen' : 'Search clips'} placeholder={de ? 'Clips durchsuchen' : 'Search clips'} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} />{searchQuery && <button onClick={() => setSearchQuery('')} aria-label={de ? 'Suche leeren' : 'Clear search'}><X size={13} /></button>}</label>
      <label className="clip-library-select clip-library-game-filter"><Gamepad2 size={15} aria-hidden="true" /><Select aria-label={de ? 'Nach Spiel filtern' : 'Filter by game'} data-clip-game-filter value={gameSelection} onChange={event => setSelectedGameFilter(event.target.value)}><option value="all">{de ? 'Alle Spiele' : 'All games'} ({clips.length})</option>{gameSelection !== 'all' && !games.some(game => game.name === gameSelection) && <option value={gameSelection}>{gameSelection}</option>}{games.map(game => <option key={game.name.toLowerCase()} value={game.name}>{game.name} ({game.count})</option>)}</Select><ChevronDown size={12} aria-hidden="true" /></label>
      <span className="clip-library-result-count" aria-live="polite">{filtered ? filteredClips.length + (de ? ' Treffer' : ' results') : ''}</span>
      <label className="clip-library-select clip-library-sort"><ArrowDownWideNarrow size={14} aria-hidden="true" /><Select aria-label={de ? 'Clips sortieren' : 'Sort clips'} data-clip-sort value={selectedSort} onChange={event => setSelectedSort(event.target.value as typeof selectedSort)}><option value="newest">{de ? 'Neueste zuerst' : 'Newest first'}</option><option value="duration">{de ? 'Längste zuerst' : 'Longest first'}</option><option value="size">{de ? 'Größte zuerst' : 'Largest first'}</option></Select><ChevronDown size={12} aria-hidden="true" /></label>
    </div>
    <div className="clip-library-content" aria-busy={isLoading}>
      {isLoading && !clips.length && !pendingVisible.length ? <div className="clip-library-loading" role="status"><Loader2 size={17} className="animate-spin" />{de ? 'Clips werden geladen…' : 'Loading clips…'}</div> : filteredClips.length || pendingVisible.length ? groups.map(group => <section className="clip-library-section" key={group.key} aria-label={group.title}><div className="clip-library-section-heading"><h2>{group.title}</h2><span>{group.clips.length + (group.pending?.length || 0)}</span></div><div className="clip-library-grid">{group.pending?.map(clip => <PendingClipCard key={clip.id} clip={clip} de={de} />)}{group.clips.map(clip => <ClipLibraryCard key={clip.id} clip={clip} de={de} locale={locale} copied={discordCopy.status?.key === clip.id && discordCopy.status.phase === 'copied'} copying={discordCopy.status?.key === clip.id && discordCopy.busy} copyBusy={discordCopy.busy} copyMessage={discordCopy.status?.key === clip.id ? discordCopy.status.message : undefined} copyError={discordCopy.status?.key === clip.id && discordCopy.status.phase === 'error'} optimizing={optimizingClipId === clip.id} exporting={!!exportingClipId} onOpen={handleOpen} onCopy={handleCopyClip} onCopyDiscord={handleCopyDiscord} onExport={handleExportClip} onOptimize={handleOptimizeClip} onReveal={handleOpenFolder} onDelete={handleDeleteClip} onRename={handleRenameClip} />)}</div></section>) : <div className="clip-library-empty" data-clip-empty><Film size={30} strokeWidth={1} /><h2>{filtered ? (de ? 'Keine passenden Clips' : 'No matching clips') : (de ? 'Noch keine Clips' : 'No clips yet')}</h2><p>{filtered ? (de ? 'Versuche einen anderen Suchbegriff oder ein anderes Spiel.' : 'Try a different search or game.') : (de ? 'Starte den Replay-Buffer und speichere im Spiel mit ' : 'Start the replay buffer and save in-game with ') + (settings.hotkey || 'F8') + '.'}</p>{filtered ? <button onClick={resetFilters}>{de ? 'Filter zurücksetzen' : 'Reset filters'}</button> : <button onClick={() => setIsSettingsOpen(true)}>{de ? 'Aufnahme einrichten' : 'Set up recording'}</button>}</div>}
    </div>
    {isTrimmerOpen && activeClip && <ClipEditor key={activeClip.id} clip={activeClip} discordCopy={discordCopy} onClose={() => setIsTrimmerOpen(false)} onDelete={() => void handleDeleteClip(activeClip)} onCopy={() => void handleCopyClip(activeClip)} onOptimize={() => handleOptimizeClip(activeClip)} />}
  </SceneTransition>
}
