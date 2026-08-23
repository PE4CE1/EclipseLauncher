import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Film, Play, Pause, Scissors, Download, Share2, FolderOpen, Trash2,
  Copy, Check, Settings, Search, Clock, HardDrive, Gamepad2, Mic,
  Volume2, VolumeX, Maximize, RotateCcw, AlertCircle, Sparkles, X,
  Sliders, Plus, Radio, Eye, Keyboard, Bell, CheckCircle2, ShieldCheck
} from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import { useGameStore } from '../../store/gameStore'
import { useTranslation } from '../../hooks/useTranslation'
import { sendAppNotification } from '../../services/notificationService'
import { triggerInstantClip, startReplayBuffer, stopReplayBuffer } from '../../services/clipEngine'
import type { EclipseClip } from '../../types/game'

export function ClipsView() {
  const { t, language } = useTranslation()
  const {
    clips, isLoading, activeClip, isTrimmerOpen, isSettingsOpen,
    isReplayBufferActive, selectedGameFilter, searchQuery, settings,
    setClips, removeClip, updateClipMeta, setActiveClip, setIsTrimmerOpen,
    setIsSettingsOpen, setSelectedGameFilter, setSearchQuery, setSettings,
    refreshClips
  } = useClipStore()

  const { activeGame } = useGameStore()
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null)
  const [selectedSort, setSelectedSort] = useState<'newest' | 'duration' | 'size'>('newest')
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null)

  // Settings Tab Navigation
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<'capture' | 'video' | 'audio' | 'hotkeys' | 'storage'>('capture')
  const [isRecordingCustomHotkey, setIsRecordingCustomHotkey] = useState(false)

  // Trimmer & Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  // Load clips on mount
  useEffect(() => {
    refreshClips()
  }, [])

  // Update trimmer state when activeClip changes
  useEffect(() => {
    if (activeClip) {
      setEditingTitle(activeClip.title)
      setTrimStart(0)
      setTrimEnd(activeClip.duration || 30)
      setCurrentTime(0)
      setIsPlaying(false)
    }
  }, [activeClip])

  // Custom Hotkey Listener
  useEffect(() => {
    if (!isRecordingCustomHotkey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore lone modifier keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      let keyName = e.key.toUpperCase()
      if (keyName.startsWith('ARROW')) keyName = keyName.replace('ARROW', '')
      if (keyName === ' ') keyName = 'Space'

      parts.push(keyName)
      const hotkeyStr = parts.join('+')

      setSettings({ hotkey: hotkeyStr })
      setIsRecordingCustomHotkey(false)

      sendAppNotification({
        title: language === 'de' ? 'Hotkey aktualisiert! ⌨️' : 'Hotkey Updated! ⌨️',
        body: language === 'de' ? `Neuer Clipping-Hotkey: ${hotkeyStr}` : `New clipping hotkey: ${hotkeyStr}`,
        type: 'info',
        duration: 3000
      })
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [isRecordingCustomHotkey, language, setSettings])

  // Extract unique games from clips for filtering
  const uniqueGames = useMemo(() => {
    const games = new Set<string>()
    clips.forEach(c => {
      if (c.gameTitle) games.add(c.gameTitle)
    })
    return Array.from(games)
  }, [clips])

  // Filter and sort clips
  const filteredClips = useMemo(() => {
    let result = [...clips]

    if (selectedGameFilter !== 'all') {
      result = result.filter(c => c.gameTitle.toLowerCase() === selectedGameFilter.toLowerCase())
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(c => 
        c.title.toLowerCase().includes(q) || 
        c.gameTitle.toLowerCase().includes(q) ||
        c.tags?.some(tag => tag.toLowerCase().includes(q))
      )
    }

    if (selectedSort === 'newest') {
      result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    } else if (selectedSort === 'duration') {
      result.sort((a, b) => (b.duration || 0) - (a.duration || 0))
    } else if (selectedSort === 'size') {
      result.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0))
    }

    return result
  }, [clips, selectedGameFilter, searchQuery, selectedSort])

  // Total disk space calculation
  const totalDiskSpace = useMemo(() => {
    const bytes = clips.reduce((acc, c) => acc + (c.fileSize || 0), 0)
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }, [clips])

  // Helpers
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 MB'
    const mb = bytes / (1024 * 1024)
    return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
  }

  const formatRelativeTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return language === 'de' ? 'Gerade eben' : 'Just now'
    if (diffMins < 60) return language === 'de' ? `Vor ${diffMins} Min.` : `${diffMins}m ago`
    if (diffHours < 24) return language === 'de' ? `Vor ${diffHours} Std.` : `${diffHours}h ago`
    return language === 'de' ? `Vor ${diffDays} Tagen` : `${diffDays}d ago`
  }

  // Handle Copy Clip
  const handleCopyClip = async (clip: EclipseClip, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (window.electronAPI?.clips?.copyFile) {
      await window.electronAPI.clips.copyFile(clip.filePath)
      setCopiedClipId(clip.id)
      setTimeout(() => setCopiedClipId(null), 2500)
      sendAppNotification({
        title: language === 'de' ? 'In Zwischenablage kopiert! 📋' : 'Copied to Clipboard! 📋',
        body: language === 'de' ? 'Clip kopiert. Bereit zum Einfügen in Discord.' : 'Clip copied. Ready to paste.',
        type: 'info',
        duration: 3000,
      })
    }
  }

  // Handle Open in Explorer
  const handleOpenFolder = (clip?: EclipseClip, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (window.electronAPI?.clips?.openFolder) {
      window.electronAPI.clips.openFolder(clip?.filePath || '')
    }
  }

  // Handle Pick Custom Folder
  const handlePickFolder = async () => {
    if (window.electronAPI?.clips?.pickFolder) {
      const folder = await window.electronAPI.clips.pickFolder()
      if (folder) {
        setSettings({ savePath: folder })
        refreshClips()
      }
    }
  }

  // Handle Delete
  const handleDeleteClip = async (clip: EclipseClip, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (confirm(t('deleteClipConfirm') || 'Möchtest du diesen Clip wirklich löschen?')) {
      if (window.electronAPI?.clips?.deleteClip) {
        await window.electronAPI.clips.deleteClip(clip.id)
        removeClip(clip.id)
        if (activeClip?.id === clip.id) {
          setIsTrimmerOpen(false)
          setActiveClip(null)
        }
      }
    }
  }

  // Handle Export
  const handleExportClip = async (clip: EclipseClip, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (window.electronAPI?.clips?.exportClip) {
      setIsExporting(true)
      const res = await window.electronAPI.clips.exportClip({
        filePath: clip.filePath,
        suggestedName: clip.title.replace(/[^a-zA-Z0-9_-]/g, '_'),
      })
      setIsExporting(false)
      if (res.success && res.exportedPath) {
        sendAppNotification({
          title: language === 'de' ? 'Clip exportiert! 💾' : 'Clip Exported! 💾',
          body: language === 'de' ? `Erfolgreich gespeichert in ${res.exportedPath}` : `Saved to ${res.exportedPath}`,
          type: 'success',
        })
      }
    }
  }

  // Handle Save Meta
  const handleSaveMeta = async () => {
    if (!activeClip) return
    if (window.electronAPI?.clips?.updateMeta) {
      await window.electronAPI.clips.updateMeta({
        clipId: activeClip.id,
        title: editingTitle.trim() || activeClip.title,
      })
      updateClipMeta(activeClip.id, editingTitle.trim() || activeClip.title)
    }
  }

  return (
    <div className="relative h-full overflow-y-auto bg-black select-none text-white px-6 py-8 md:px-10 md:py-10 space-y-6">
      
      {/* ─── Header & Top Actions ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white">
              <Film size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <span>{t('clipsTab') || 'Clips Studio'}</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  STUDIO
                </span>
              </h1>
            </div>
          </div>
          <p className="text-xs text-white/50">
            {t('clipsSubtitle') || 'Nimm deine besten Gameplay-Momente blitzschnell auf, schneide sie und teile sie.'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Replay Buffer Status Badge & Toggle */}
          <button
            onClick={() => {
              if (isReplayBufferActive) {
                stopReplayBuffer()
              } else {
                startReplayBuffer()
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isReplayBufferActive
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:border-white/20 hover:text-white'
            }`}
            title={isReplayBufferActive ? (language === 'de' ? 'Replay-Buffer läuft im Hintergrund' : 'Replay buffer active') : (language === 'de' ? 'Klicken zum Aktivieren' : 'Click to enable')}
          >
            <span className={`w-2 h-2 rounded-full ${isReplayBufferActive ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
            <span>{isReplayBufferActive ? `Buffer ${language === 'de' ? 'Aktiv' : 'Active'} (${settings.replayDurationSeconds}s)` : (language === 'de' ? 'Buffer Starten' : 'Start Buffer')}</span>
          </button>

          {/* Quick Clip Trigger */}
          <button
            onClick={() => triggerInstantClip()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Scissors size={14} strokeWidth={2.5} />
            <span>{t('recordClip') || (language === 'de' ? 'Clip erstellen' : 'Clip That')}</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/10 text-black font-bold">
              {settings.hotkey || 'F8'}
            </span>
          </button>

          {/* Folder Button */}
          <button
            onClick={() => handleOpenFolder()}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all text-white/70 hover:text-white cursor-pointer"
            title={language === 'de' ? 'Clip-Ordner in Explorer öffnen' : 'Open Clips Folder'}
          >
            <FolderOpen size={16} />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all text-white/70 hover:text-white cursor-pointer"
            title={t('clipSettings') || (language === 'de' ? 'Einstellungen' : 'Settings')}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ─── Search, Filter Bar & Stats ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Game Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedGameFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedGameFilter === 'all'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]'
            }`}
          >
            {t('allGames') || (language === 'de' ? 'Alle Spiele' : 'All Games')} ({clips.length})
          </button>

          {uniqueGames.map(game => (
            <button
              key={game}
              onClick={() => setSelectedGameFilter(game)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedGameFilter.toLowerCase() === game.toLowerCase()
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]'
              }`}
            >
              {game} ({clips.filter(c => c.gameTitle.toLowerCase() === game.toLowerCase()).length})
            </button>
          ))}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder={language === 'de' ? 'Clip suchen...' : 'Search clips...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none w-44 sm:w-56"
            />
          </div>

          <span className="text-xs font-mono text-white/40 whitespace-nowrap">
            {clips.length} Clips • {totalDiskSpace}
          </span>
        </div>
      </div>

      {/* ─── Clips Grid ─── */}
      {filteredClips.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredClips.map(clip => {
            const isCopied = copiedClipId === clip.id

            return (
              <motion.div
                key={clip.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                onMouseEnter={() => setHoveredClipId(clip.id)}
                onMouseLeave={() => setHoveredClipId(null)}
                onClick={() => {
                  setActiveClip(clip)
                  setIsTrimmerOpen(true)
                }}
                className="group relative bg-[#0c0d12] hover:bg-[#12141c] border border-white/[0.08] hover:border-white/20 rounded-2xl overflow-hidden shadow-lg transition-all cursor-pointer flex flex-col"
              >
                {/* 16:9 Video / Thumbnail Container */}
                <div className="relative aspect-[16/9] w-full bg-black/60 overflow-hidden">
                  {clip.thumbnailUrl ? (
                    <img 
                      src={clip.thumbnailUrl} 
                      alt={clip.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/[0.02]">
                      <Film size={24} className="text-white/20" />
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d12] via-transparent to-transparent opacity-80" />

                  {/* Play Button Overlay on Hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                      <Play size={16} className="ml-0.5" fill="black" />
                    </div>
                  </div>

                  {/* Duration Pill */}
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-mono font-medium text-white">
                    {formatTime(clip.duration)}
                  </div>

                  {/* Game Tag Pill */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white/90 truncate max-w-[70%]">
                    {clip.gameTitle}
                  </div>
                </div>

                {/* Card Info & Quick Actions */}
                <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white group-hover:text-white truncate">
                      {clip.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-white/40">
                      <span>{formatRelativeTime(clip.createdAt)}</span>
                      <span>•</span>
                      <span>{formatFileSize(clip.fileSize)}</span>
                      {clip.resolution && (
                        <>
                          <span>•</span>
                          <span>{clip.resolution}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bottom Quick Action Bar */}
                  <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-white/50">
                    <button
                      onClick={(e) => handleCopyClip(clip, e)}
                      className="flex items-center gap-1 text-[11px] hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                      title={language === 'de' ? 'In Zwischenablage kopieren (Discord)' : 'Copy to Clipboard'}
                    >
                      {isCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      <span className={isCopied ? 'text-emerald-400 font-semibold' : ''}>
                        {isCopied ? (language === 'de' ? 'Kopiert' : 'Copied') : (language === 'de' ? 'Kopieren' : 'Copy')}
                      </span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleExportClip(clip, e)}
                        className="p-1.5 rounded hover:bg-white/5 hover:text-white transition-colors"
                        title={t('exportClip') || (language === 'de' ? 'Exportieren' : 'Export')}
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={(e) => handleOpenFolder(clip, e)}
                        className="p-1.5 rounded hover:bg-white/5 hover:text-white transition-colors"
                        title={t('openInFolder') || (language === 'de' ? 'In Ordner öffnen' : 'Open in Folder')}
                      >
                        <FolderOpen size={13} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClip(clip, e)}
                        className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        title={t('deleteClip') || (language === 'de' ? 'Löschen' : 'Delete')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="p-12 rounded-2xl bg-[#0c0d12] border border-white/[0.06] text-center space-y-4 max-w-lg mx-auto my-12">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-white/40">
            <Film size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">
              {t('noClipsYet') || (language === 'de' ? 'Noch keine Clips vorhanden' : 'No clips recorded yet')}
            </h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('noClipsDesc') || (language === 'de' ? 'Drücke deinen Hotkey im Spiel oder klicke oben auf "Clip erstellen", um Highlights festzuhalten.' : 'Press your hotkey in-game or click "Clip That" above.')}
            </p>
          </div>
          <button
            onClick={() => triggerInstantClip()}
            className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 transition-all inline-flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Scissors size={14} />
            <span>{language === 'de' ? 'Jetzt ersten Clip aufnehmen' : 'Record first clip now'}</span>
          </button>
        </div>
      )}

      {/* ─── Modal Video Player & Medal-Style Trimmer ─── */}
      <AnimatePresence>
        {isTrimmerOpen && activeClip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0c0d12] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    <Film size={15} />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={handleSaveMeta}
                      className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-white/50 text-sm font-bold text-white focus:outline-none transition-colors"
                    />
                    <span className="text-[11px] font-mono text-white/40 block">
                      {activeClip.gameTitle} • {formatRelativeTime(activeClip.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyClip(activeClip)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>{language === 'de' ? 'Kopieren' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={() => handleExportClip(activeClip)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 transition-all cursor-pointer"
                  >
                    <Download size={13} />
                    <span>{t('exportClip') || (language === 'de' ? 'Exportieren' : 'Export')}</span>
                  </button>

                  <button
                    onClick={() => setIsTrimmerOpen(false)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Video Player */}
              <div className="relative bg-black flex items-center justify-center overflow-hidden max-h-[50vh]">
                <video
                  ref={videoRef}
                  src={activeClip.videoUrl || `local-media://${activeClip.filePath.replace(/\\/g, '/')}`}
                  className="w-full h-full max-h-[50vh] object-contain"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime)
                      // Loop between trim bounds
                      if (videoRef.current.currentTime >= trimEnd && trimEnd > trimStart) {
                        videoRef.current.currentTime = trimStart
                      }
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration)
                      setTrimEnd(videoRef.current.duration)
                    }
                  }}
                  onClick={() => {
                    if (videoRef.current) {
                      if (isPlaying) {
                        videoRef.current.pause()
                        setIsPlaying(false)
                      } else {
                        videoRef.current.play()
                        setIsPlaying(true)
                      }
                    }
                  }}
                />

                {/* Big Center Play Overlay */}
                {!isPlaying && (
                  <button
                    onClick={() => {
                      videoRef.current?.play()
                      setIsPlaying(true)
                    }}
                    className="absolute w-14 h-14 rounded-full bg-white/90 text-black flex items-center justify-center shadow-2xl hover:scale-105 transition-transform cursor-pointer"
                  >
                    <Play size={22} className="ml-1" fill="black" />
                  </button>
                )}
              </div>

              {/* Player & Medal Trimming Controls */}
              <div className="p-6 space-y-4 bg-[#0e1017]">
                {/* Scrubber & Trimmer Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-white/50">
                    <span className="flex items-center gap-1 text-white">
                      <Scissors size={12} className="text-emerald-400" />
                      <span>{language === 'de' ? 'Getrimmte Clip-Dauer:' : 'Trimmed Duration:'}</span>
                      <strong className="text-white font-bold">{formatTime(Math.max(0, trimEnd - trimStart))}</strong>
                    </span>
                    <span>{formatTime(currentTime)} / {formatTime(duration || activeClip.duration)}</span>
                  </div>

                  {/* Dual Handle Range Slider Bar */}
                  <div className="relative h-7 bg-white/[0.04] border border-white/10 rounded-lg overflow-hidden flex items-center px-1">
                    {/* Active Trim Range Highlight */}
                    <div
                      className="absolute top-0 bottom-0 bg-emerald-500/20 border-l-2 border-r-2 border-emerald-400"
                      style={{
                        left: `${(trimStart / (duration || activeClip.duration || 1)) * 100}%`,
                        right: `${100 - ((trimEnd / (duration || activeClip.duration || 1)) * 100)}%`,
                      }}
                    />

                    {/* Current Scrubber Head */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
                      style={{
                        left: `${(currentTime / (duration || activeClip.duration || 1)) * 100}%`,
                      }}
                    />

                    {/* Interactive Click Scrubber */}
                    <input
                      type="range"
                      min={0}
                      max={duration || activeClip.duration || 30}
                      step={0.1}
                      value={currentTime}
                      onChange={e => {
                        const t = parseFloat(e.target.value)
                        setCurrentTime(t)
                        if (videoRef.current) videoRef.current.currentTime = t
                      }}
                      className="w-full absolute inset-0 opacity-0 cursor-pointer z-20"
                    />
                  </div>

                  {/* Precision Trim Range Controls */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-2 flex items-center justify-between">
                      <span className="text-[11px] text-white/50">{language === 'de' ? 'Startzeit' : 'Start Time'}:</span>
                      <input
                        type="range"
                        min={0}
                        max={trimEnd - 1}
                        step={0.5}
                        value={trimStart}
                        onChange={e => {
                          const val = parseFloat(e.target.value)
                          setTrimStart(val)
                          if (videoRef.current) videoRef.current.currentTime = val
                        }}
                        className="w-24 accent-emerald-400"
                      />
                      <span className="text-xs font-mono text-white font-semibold">{formatTime(trimStart)}</span>
                    </div>

                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-2 flex items-center justify-between">
                      <span className="text-[11px] text-white/50">{language === 'de' ? 'Endzeit' : 'End Time'}:</span>
                      <input
                        type="range"
                        min={trimStart + 1}
                        max={duration || activeClip.duration || 30}
                        step={0.5}
                        value={trimEnd}
                        onChange={e => {
                          const val = parseFloat(e.target.value)
                          setTrimEnd(val)
                        }}
                        className="w-24 accent-emerald-400"
                      />
                      <span className="text-xs font-mono text-white font-semibold">{formatTime(trimEnd)}</span>
                    </div>
                  </div>
                </div>

                {/* Playback Controls Toolbar */}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          if (isPlaying) {
                            videoRef.current.pause()
                            setIsPlaying(false)
                          } else {
                            videoRef.current.play()
                            setIsPlaying(true)
                          }
                        }
                      }}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                    </button>

                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = trimStart
                          setCurrentTime(trimStart)
                        }
                      }}
                      className="p-2 rounded-xl hover:bg-white/5 text-white/50 hover:text-white transition-all cursor-pointer"
                      title={language === 'de' ? 'Von vorne abspielen' : 'Restart'}
                    >
                      <RotateCcw size={15} />
                    </button>

                    {/* Volume */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.muted = !isMuted
                            setIsMuted(!isMuted)
                          }
                        }}
                        className="p-1.5 text-white/50 hover:text-white transition-colors"
                      >
                        {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          setVolume(v)
                          setIsMuted(false)
                          if (videoRef.current) {
                            videoRef.current.volume = v
                            videoRef.current.muted = false
                          }
                        }}
                        className="w-16 accent-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenFolder(activeClip)}
                      className="p-2 rounded-xl hover:bg-white/5 text-white/50 hover:text-white transition-all cursor-pointer"
                      title={t('openInFolder') || (language === 'de' ? 'In Ordner anzeigen' : 'Open in Folder')}
                    >
                      <FolderOpen size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClip(activeClip)}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-white/50 hover:text-red-400 transition-all cursor-pointer"
                      title={t('deleteClip') || (language === 'de' ? 'Löschen' : 'Delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Ultra-Minimalist & Feature-Rich Clips Settings Modal ─── */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-[#0b0c10] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Settings Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    <Settings size={15} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      {language === 'de' ? 'ECLIPSE CLIPS EINSTELLUNGEN' : 'ECLIPSE CLIPS SETTINGS'}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Category Tab Selector */}
              <div className="flex items-center gap-1 px-6 pt-3 pb-2 border-b border-white/[0.06] overflow-x-auto scrollbar-none">
                {[
                  { id: 'capture', label: language === 'de' ? 'Aufnahme' : 'Capture', icon: Scissors },
                  { id: 'video', label: language === 'de' ? 'Qualität' : 'Quality', icon: Film },
                  { id: 'audio', label: language === 'de' ? 'Audio & Mic' : 'Audio & Mic', icon: Mic },
                  { id: 'hotkeys', label: language === 'de' ? 'Hotkeys' : 'Hotkeys', icon: Keyboard },
                  { id: 'storage', label: language === 'de' ? 'Speicherort' : 'Storage', icon: FolderOpen },
                ].map(tab => {
                  const Icon = tab.icon
                  const isSelected = activeSettingsCategory === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSettingsCategory(tab.id as any)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                        isSelected 
                          ? 'bg-white text-black font-semibold shadow-sm' 
                          : 'text-white/50 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon size={13} />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Settings Body */}
              <div className="p-6 overflow-y-auto space-y-5 text-xs">
                
                {/* ── Tab 1: Capture & Replay Buffer ── */}
                {activeSettingsCategory === 'capture' && (
                  <div className="space-y-4">
                    {/* Enable Replay Buffer Toggle */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-white block">
                          {language === 'de' ? 'Replay-Buffer aktivieren' : 'Enable Replay Buffer'}
                        </span>
                        <span className="text-white/40 text-[11px] block">
                          {language === 'de' ? 'Hält laufend die letzten Sekunden im Speicher für den Hotkey-Klick' : 'Keeps rolling buffer in memory for one-click clip hotkey'}
                        </span>
                      </div>
                      <button
                        onClick={() => setSettings({ enabled: !settings.enabled })}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          settings.enabled 
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]' 
                            : 'bg-white/5 border-white/10 text-white/40'
                        }`}
                      >
                        {settings.enabled ? (language === 'de' ? 'Aktiv' : 'On') : (language === 'de' ? 'Aus' : 'Off')}
                      </button>
                    </div>

                    {/* Replay Buffer Duration Grid */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white/80">
                          {language === 'de' ? 'Replay-Buffer Dauer:' : 'Replay Buffer Duration:'}
                        </span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {settings.replayDurationSeconds} {language === 'de' ? 'Sekunden' : 'Seconds'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                        {[15, 30, 45, 60, 90, 120, 180, 300].map(sec => {
                          const isSel = settings.replayDurationSeconds === sec
                          return (
                            <button
                              key={sec}
                              onClick={() => setSettings({ replayDurationSeconds: sec })}
                              className={`py-2 rounded-xl text-center font-mono font-semibold text-xs border transition-all cursor-pointer ${
                                isSel
                                  ? 'bg-white text-black border-white shadow-sm'
                                  : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                              }`}
                            >
                              {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Auto-Start on Game Launch Toggle */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-white block">
                          {language === 'de' ? 'Auto-Start bei Spielstart' : 'Auto-Start on Game Launch'}
                        </span>
                        <span className="text-white/40 text-[11px] block">
                          {language === 'de' ? 'Startet den Replay-Buffer automatisch im Hintergrund, wenn ein Spiel erkannt wird' : 'Automatically starts buffer when a game is launched'}
                        </span>
                      </div>
                      <button
                        onClick={() => setSettings({ autoStartOnGame: settings.autoStartOnGame !== false ? false : true })}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          settings.autoStartOnGame !== false
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                            : 'bg-white/5 border-white/10 text-white/40'
                        }`}
                      >
                        {settings.autoStartOnGame !== false ? (language === 'de' ? 'Aktiv' : 'On') : (language === 'de' ? 'Aus' : 'Off')}
                      </button>
                    </div>

                    {/* HUD Notification Toast Toggle */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-white block">
                          {language === 'de' ? 'HUD-Benachrichtigung nach Clip' : 'HUD Notification on Clip'}
                        </span>
                        <span className="text-white/40 text-[11px] block">
                          {language === 'de' ? 'Zeigt "Clip gespeichert! 🎮" Toast im Launcher nach dem Hotkey-Druck an' : 'Show notification toast when a clip is captured'}
                        </span>
                      </div>
                      <button
                        onClick={() => setSettings({ notifyOnClip: settings.notifyOnClip !== false ? false : true })}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          settings.notifyOnClip !== false
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                            : 'bg-white/5 border-white/10 text-white/40'
                        }`}
                      >
                        {settings.notifyOnClip !== false ? (language === 'de' ? 'Aktiv' : 'On') : (language === 'de' ? 'Aus' : 'Off')}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Tab 2: Video & Quality ── */}
                {activeSettingsCategory === 'video' && (
                  <div className="space-y-4">
                    {/* Resolution */}
                    <div className="space-y-1.5">
                      <span className="font-semibold text-white/80">
                        {language === 'de' ? 'Aufnahme-Auflösung' : 'Capture Resolution'}:
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: '1440p', label: '1440p (2K Ultra)' },
                          { id: '1080p', label: '1080p (Full HD)' },
                          { id: '720p', label: '720p (HD)' },
                        ].map(q => (
                          <button
                            key={q.id}
                            onClick={() => setSettings({ quality: q.id as any })}
                            className={`py-2.5 px-2 rounded-xl font-semibold border text-center transition-all cursor-pointer ${
                              settings.quality === q.id 
                                ? 'bg-white text-black border-white shadow-sm' 
                                : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white'
                            }`}
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Frame Rate (FPS) */}
                    <div className="space-y-1.5">
                      <span className="font-semibold text-white/80">
                        {language === 'de' ? 'Bildwiederholrate (FPS)' : 'Frame Rate (FPS)'}:
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 60, label: '60 FPS (Flüssig / Silky Smooth)' },
                          { id: 30, label: '30 FPS (Standard)' },
                        ].map(f => (
                          <button
                            key={f.id}
                            onClick={() => setSettings({ fps: f.id as any })}
                            className={`py-2.5 px-2 rounded-xl font-semibold border text-center transition-all cursor-pointer ${
                              settings.fps === f.id 
                                ? 'bg-white text-black border-white shadow-sm' 
                                : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bitrate Control */}
                    <div className="space-y-1.5">
                      <span className="font-semibold text-white/80">
                        {language === 'de' ? 'Video-Bitrate & Kodierung' : 'Video Bitrate'}:
                      </span>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { id: 'ultra', label: 'Ultra (20M)' },
                          { id: 'high', label: 'Hoch (12M)' },
                          { id: 'medium', label: 'Mittel (8M)' },
                          { id: 'low', label: 'Sparsam (5M)' },
                        ].map(b => (
                          <button
                            key={b.id}
                            onClick={() => setSettings({ bitrate: b.id as any })}
                            className={`py-2 rounded-xl font-semibold text-center border transition-all cursor-pointer ${
                              (settings.bitrate || 'high') === b.id 
                                ? 'bg-white text-black border-white' 
                                : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:text-white'
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Zero Watermark Guarantee */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
                      <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0" />
                      <div className="space-y-0.5">
                        <span className="font-semibold text-white block">
                          {language === 'de' ? '100% Kostenlos & Ohne Wasserzeichen' : '100% Free & No Watermarks'}
                        </span>
                        <span className="text-white/40 text-[11px] block">
                          {language === 'de' ? 'Alle Clips werden sauber ohne Wasserzeichen in voller Qualität exportiert.' : 'All clips exported cleanly with zero watermarks.'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab 3: Audio & Voice ── */}
                {activeSettingsCategory === 'audio' && (
                  <div className="space-y-4">
                    {/* Game Audio Volume */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Volume2 size={15} className="text-white/60" />
                          <span className="font-semibold text-white">
                            {language === 'de' ? 'Spiel-Audio Lautstärke' : 'Game Audio Volume'}
                          </span>
                        </div>
                        <span className="font-mono text-emerald-400 font-bold">
                          {settings.gameAudioVolume ?? 100}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={settings.gameAudioVolume ?? 100}
                        onChange={e => setSettings({ gameAudioVolume: parseInt(e.target.value) })}
                        className="w-full accent-white"
                      />
                    </div>

                    {/* Microphone Capture Toggle */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Mic size={15} className="text-white/60" />
                          <div>
                            <span className="font-semibold text-white block">
                              {language === 'de' ? 'Eigenes Mikrofon mit aufnehmen' : 'Include Microphone in Clips'}
                            </span>
                            <span className="text-white/40 text-[11px]">
                              {language === 'de' ? 'Nimmt deine Stimme parallel zum Spiel-Sound auf' : 'Records your voice alongside game audio'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSettings({ captureMic: !settings.captureMic })}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            settings.captureMic 
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                              : 'bg-white/5 border-white/10 text-white/40'
                          }`}
                        >
                          {settings.captureMic ? (language === 'de' ? 'Ja' : 'Yes') : (language === 'de' ? 'Nein' : 'No')}
                        </button>
                      </div>

                      {/* Microphone Volume Slider */}
                      {settings.captureMic && (
                        <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-white/60">
                              {language === 'de' ? 'Mikrofon-Lautstärke' : 'Mic Gain'}:
                            </span>
                            <span className="font-mono text-emerald-400 font-bold">{settings.micVolume || 80}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={settings.micVolume || 80}
                            onChange={e => setSettings({ micVolume: parseInt(e.target.value) })}
                            className="w-full accent-emerald-400"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Tab 4: Hotkeys & Keyboard ── */}
                {activeSettingsCategory === 'hotkeys' && (
                  <div className="space-y-4">
                    {/* Replay Clipping Hotkey Selector */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-white block">
                            {language === 'de' ? 'Replay-Clip Hotkey (Letzte Sekunden)' : 'Replay Clip Hotkey'}
                          </span>
                          <span className="text-white/40 text-[11px]">
                            {language === 'de' ? 'Drücke diesen Hotkey in jedem Spiel, um den Buffer zu speichern' : 'Press in any game to capture replay'}
                          </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-white/10 font-mono font-bold text-white border border-white/10">
                          {settings.hotkey || 'F8'}
                        </span>
                      </div>

                      {/* Preset Hotkeys */}
                      <div className="grid grid-cols-4 gap-2">
                        {['F8', 'F9', 'F10', 'Alt+C'].map(hk => (
                          <button
                            key={hk}
                            onClick={() => setSettings({ hotkey: hk })}
                            className={`py-2 rounded-xl font-mono font-bold text-center border transition-all cursor-pointer ${
                              settings.hotkey === hk 
                                ? 'bg-white text-black border-white shadow-sm' 
                                : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white'
                            }`}
                          >
                            {hk}
                          </button>
                        ))}
                      </div>

                      {/* Custom Hotkey Record Button */}
                      <button
                        onClick={() => setIsRecordingCustomHotkey(!isRecordingCustomHotkey)}
                        className={`w-full py-2.5 rounded-xl border font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          isRecordingCustomHotkey 
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse' 
                            : 'bg-white/[0.04] border-white/10 hover:border-white/30 text-white'
                        }`}
                      >
                        <Keyboard size={14} />
                        <span>
                          {isRecordingCustomHotkey 
                            ? (language === 'de' ? 'Drücke eine beliebige Taste auf der Tastatur...' : 'Press any key on keyboard...') 
                            : (language === 'de' ? 'Eigener Hotkey (Tastenkombination aufnehmen)' : 'Record Custom Hotkey')}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Tab 5: Storage & Folders ── */}
                {activeSettingsCategory === 'storage' && (
                  <div className="space-y-4">
                    {/* Storage Directory */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                      <div>
                        <span className="font-semibold text-white block">
                          {language === 'de' ? 'Speicherort für Eclipse Clips' : 'Clips Storage Folder'}
                        </span>
                        <span className="text-white/40 text-[11px]">
                          {language === 'de' ? 'Hier werden alle aufgenommenen Videoclips und Highlights abgelegt' : 'Where all recorded clips are saved'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#14161c] border border-white/[0.06] font-mono text-[11px] text-white/70 truncate flex items-center justify-between">
                        <span className="truncate pr-2">{settings.savePath || 'Videos / Eclipse Clips'}</span>
                        <button
                          onClick={handlePickFolder}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-sans text-xs font-semibold whitespace-nowrap cursor-pointer"
                        >
                          {language === 'de' ? 'Ändern' : 'Browse'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => handleOpenFolder()}
                          className="text-xs text-white/70 hover:text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <FolderOpen size={14} />
                          <span>{language === 'de' ? 'Ordner in Windows Explorer öffnen' : 'Open in Windows Explorer'}</span>
                        </button>

                        <span className="text-xs font-mono text-white/40">
                          {clips.length} Clips • {totalDiskSpace}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Settings Footer */}
              <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between">
                <span className="text-[11px] text-white/40">
                  {language === 'de' ? 'Änderungen werden automatisch gespeichert' : 'Changes are saved automatically'}
                </span>

                <button
                  onClick={() => {
                    setIsRecordingCustomHotkey(false)
                    setIsSettingsOpen(false)
                  }}
                  className="px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 transition-all cursor-pointer shadow-md"
                >
                  {language === 'de' ? 'Schließen' : 'Close'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
