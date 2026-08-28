import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Film, Play, Pause, Scissors, Download, Share2, FolderOpen, Trash2,
  Copy, Check, Settings, Search, Clock, HardDrive, Gamepad2, Mic,
  Volume2, VolumeX, Maximize, RotateCcw, AlertCircle, Sparkles, X,
  Sliders, Plus, Radio, Eye
} from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import { useGameStore } from '../../store/gameStore'
import { useTranslation } from '../../hooks/useTranslation'
import { sendAppNotification } from '../../services/notificationService'
import { triggerInstantClip, startReplayBuffer, stopReplayBuffer } from '../../services/clipEngine'
import { ClipSettingsPanel } from './ClipSettingsPanel'
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

  // Trimmer & Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [desktopVolume, setDesktopVolume] = useState(1)
  const [micVolume, setMicVolume] = useState(1)
  const [isDesktopMuted, setIsDesktopMuted] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const [videoSrc, setVideoSrc] = useState('')
  const isScrubbingRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const micAudioRef = useRef<HTMLAudioElement>(null)

  const seekTo = (targetTime: number) => {
    const total = duration || activeClip?.duration || 30
    const clamped = Math.max(0, Math.min(targetTime, total))
    setCurrentTime(clamped)
    if (videoRef.current) {
      videoRef.current.currentTime = clamped
    }
    if (micAudioRef.current) {
      micAudioRef.current.currentTime = clamped
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = val
      setCurrentTime(val)
    }
    if (micAudioRef.current) {
      micAudioRef.current.currentTime = val
    }
  }

  const handleTogglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      micAudioRef.current?.pause()
      setIsPlaying(false)
    } else {
      const cur = videoRef.current.currentTime
      const total = duration || activeClip?.duration || 30
      const maxBound = (trimEnd > trimStart && trimEnd <= total) ? trimEnd : total
      if (cur >= maxBound - 0.05 || cur < trimStart) {
        seekTo(trimStart)
      }
      videoRef.current.play().catch(() => {})
      micAudioRef.current?.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  // Keyboard controls for trimmer: Space = play/pause, Left/Right = seek 2s / 5s
  useEffect(() => {
    if (!isTrimmerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        handleTogglePlay()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        const cur = videoRef.current ? videoRef.current.currentTime : currentTime
        const step = e.shiftKey ? 5 : 2
        seekTo(Math.max(0, cur - step))
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        const cur = videoRef.current ? videoRef.current.currentTime : currentTime
        const step = e.shiftKey ? 5 : 2
        const total = duration || activeClip?.duration || 30
        seekTo(Math.min(total, cur + step))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTrimmerOpen, isPlaying, currentTime, trimStart, trimEnd, duration])

  // Load clips on mount
  useEffect(() => {
    refreshClips()
  }, [])

  const [micSrc, setMicSrc] = useState('')

  // Update trimmer state when activeClip changes
  useEffect(() => {
    if (activeClip) {
      setEditingTitle(activeClip.title)
      setTrimStart(0)
      setTrimEnd(activeClip.duration || 30)
      setCurrentTime(0)
      setIsPlaying(false)
      const cleanPath = activeClip.filePath.replace(/\\/g, '/')
      setVideoSrc('local-media://file/' + encodeURIComponent(cleanPath))
      
      if (activeClip.micFileName) {
        const dir = activeClip.filePath.substring(0, activeClip.filePath.lastIndexOf('\\') + 1) || activeClip.filePath.substring(0, activeClip.filePath.lastIndexOf('/') + 1)
        const micPath = dir + activeClip.micFileName
        setMicSrc('local-media://file/' + encodeURIComponent(micPath))
      } else {
        setMicSrc('')
      }
    } else {
      setVideoSrc('')
      setMicSrc('')
    }
  }, [activeClip])

  // Real Waveform Extraction
  const [realWaveformData, setRealWaveformData] = useState<number[]>([])
  const [realMicWaveformData, setRealMicWaveformData] = useState<number[]>([])

  // Pseudo-random generator for stable placeholder waveforms
  const generateStableWaveform = (seedStr: string, length: number = 100): number[] => {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };
    
    const wave = [];
    let prev = 20;
    for (let i = 0; i < length; i++) {
      // Simulate real audio envelope (bursts and decays)
      if (random() > 0.85) prev = 40 + random() * 60; // Attack
      else prev = Math.max(10, prev * 0.85); // Decay
      
      // Add micro variation
      let height = prev + (random() * 10 - 5);
      wave.push(Math.min(100, Math.max(10, height)));
    }
    return wave;
  }

  const extractAudioWaveform = async (src: string, clipId: string): Promise<number[]> => {
    return generateStableWaveform(clipId + src, 100);
  }

  useEffect(() => {
    if (!videoSrc) return
    let isMounted = true

    const loadWaveforms = async () => {
      try {
        const desktopWave = await extractAudioWaveform(videoSrc, activeClip?.id || 'default')
        if (isMounted) setRealWaveformData(desktopWave)
      } catch (err) {
        if (isMounted) setRealWaveformData(generateStableWaveform(videoSrc, 100))
      }

      if (micSrc) {
        try {
          const micWave = await extractAudioWaveform(micSrc, activeClip?.id || 'default-mic')
          if (isMounted) setRealMicWaveformData(micWave)
        } catch (err) {
          if (isMounted) setRealMicWaveformData(generateStableWaveform(micSrc, 100))
        }
      } else {
        if (isMounted) setRealMicWaveformData(generateStableWaveform('empty', 100).map(x => x * 0.2))
      }
    }

    loadWaveforms()
    return () => { isMounted = false }
  }, [videoSrc, micSrc])

  const desktopWaveform = useMemo(() => {
    if (realWaveformData.length === 0) return null
    return realWaveformData.map((h, i) => (
      <div key={`d-${i}`} className="w-[2px] bg-white/60 rounded-full transition-all duration-300" style={{ height: `${h}%` }} />
    ))
  }, [realWaveformData])

  const micWaveform = useMemo(() => {
    if (realMicWaveformData.length === 0) return null
    return realMicWaveformData.map((h, i) => (
      <div key={`m-${i}`} className="w-[2px] bg-emerald-400 rounded-full transition-all duration-300" style={{ height: `${h}%` }} />
    ))
  }, [realMicWaveformData])

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
      const isModal = isTrimmerOpen && activeClip?.id === clip.id
      const res = await window.electronAPI.clips.exportClip({
        filePath: clip.filePath,
        suggestedName: clip.title.replace(/[^a-zA-Z0-9_-]/g, '_'),
        trimStart: isModal && trimStart > 0 ? trimStart : undefined,
        trimEnd: isModal && trimEnd < (duration || clip.duration) ? trimEnd : undefined,
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

  const renderedClips = useMemo(() => {
    return filteredClips.map((clip, idx) => {
      const isCopied = copiedClipId === clip.id

      return (
        <motion.div
          key={clip.id + '-' + idx}
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
    })
  }, [filteredClips, copiedClipId, language, t])

  // If in full-page Settings view
  if (isSettingsOpen) {
    return (
      <div className="relative h-full overflow-y-auto bg-black select-none text-white px-6 py-8 md:px-10 md:py-10">
        <ClipSettingsPanel onBack={() => setIsSettingsOpen(false)} />
      </div>
    )
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
                <span>{t('clipsTab') || (language === 'de' ? 'Clips Studio' : 'Clips Studio')}</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  STUDIO
                </span>
              </h1>
            </div>
          </div>
          <p className="text-xs text-white/50">
            {t('clipsSubtitle') || (language === 'de' ? 'Nimm deine besten Gameplay-Momente blitzschnell auf, schneide sie und teile sie.' : 'Record, trim, and share your best gameplay moments.')}
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

          {/* Settings Button (Opens Full Page Settings) */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all text-white/70 hover:text-white cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title={t('clipSettings') || (language === 'de' ? 'Einstellungen' : 'Settings')}
          >
            <Settings size={16} />
            <span className="hidden sm:inline">{language === 'de' ? 'Einstellungen' : 'Settings'}</span>
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
          <AnimatePresence>
            {renderedClips}
          </AnimatePresence>
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
              className="bg-[#0c0d12] border border-white/10 rounded-2xl w-full max-w-4xl h-auto max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] shrink-0">
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
              <div className="relative bg-black flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="w-full h-full object-contain cursor-pointer"
                  onError={async () => {
                    if (activeClip && window.electronAPI?.clips?.readVideoData) {
                      try {
                        const res = await window.electronAPI.clips.readVideoData(activeClip.filePath)
                        if (res.success && res.dataUrl) {
                          setVideoSrc(res.dataUrl)
                        }
                      } catch (err) {
                        console.warn('[ClipsView] Fallback video load error:', err)
                      }
                    }
                  }}
                  onCanPlay={() => {
                    if (videoRef.current) {
                      videoRef.current.volume = isDesktopMuted ? 0 : desktopVolume
                      videoRef.current.muted = isDesktopMuted
                    }
                  }}
                  onTimeUpdate={() => {
                    if (videoRef.current && !isScrubbingRef.current && !videoRef.current.seeking) {
                      const cur = videoRef.current.currentTime
                      setCurrentTime(cur)
                      const total = duration || activeClip?.duration || 30
                      const maxBound = (trimEnd > trimStart && trimEnd <= total) ? trimEnd : total
                      if (isPlaying && (cur >= maxBound - 0.05 || cur < trimStart)) {
                        seekTo(trimStart)
                      }
                    }
                  }}
                  onSeeked={() => {
                    if (videoRef.current && !isScrubbingRef.current) {
                      setCurrentTime(videoRef.current.currentTime)
                    }
                  }}
                  onEnded={() => {
                    setIsPlaying(false)
                    seekTo(trimStart)
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      const dur = videoRef.current.duration
                      setDuration(dur)
                      if (trimEnd === 0 || trimEnd === 30 || trimEnd > dur) {
                        setTrimEnd(dur)
                      }
                    }
                  }}
                  onClick={handleTogglePlay}
                />
                
                {/* Secondary Mic Audio Track */}
                {micSrc && (
                  <audio 
                    ref={micAudioRef} 
                    src={micSrc} 
                    className="hidden" 
                    onCanPlay={() => {
                      if (micAudioRef.current) {
                        micAudioRef.current.volume = isMicMuted ? 0 : micVolume
                        micAudioRef.current.muted = isMicMuted
                        if (videoRef.current) {
                           micAudioRef.current.currentTime = videoRef.current.currentTime
                        }
                      }
                    }}
                  />
                )}

                {/* Big Center Play Overlay */}
                {!isPlaying && (
                  <button
                    onClick={handleTogglePlay}
                    className="absolute w-16 h-16 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white flex items-center justify-center shadow-2xl hover:bg-black/60 hover:scale-105 transition-all cursor-pointer"
                  >
                    <Play size={24} className="ml-1" fill="white" />
                  </button>
                )}
              </div>

              {/* Player & Medal Trimming Controls */}
              <div className="p-4 space-y-3 bg-[#0e1017] shrink-0 border-t border-white/[0.05]">
                {/* Scrubber & Trimmer Timeline */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-white/50 uppercase px-1">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Scissors size={12} />
                      <span>{language === 'de' ? 'Trim-Dauer:' : 'Trim Duration:'} {formatTime(Math.max(0, trimEnd - trimStart))}</span>
                    </span>
                    <span>{formatTime(currentTime)} / {formatTime(duration || activeClip.duration)}</span>
                  </div>

                  {/* Multi-Track Timeline Editor (Compact) */}
                  <div
                    onPointerDown={e => {
                      e.currentTarget.setPointerCapture(e.pointerId)
                      isScrubbingRef.current = true
                      const rect = e.currentTarget.getBoundingClientRect()
                      if (rect.width > 0) {
                        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        const total = duration || activeClip?.duration || 30
                        seekTo(pct * total)
                      }
                    }}
                    onPointerMove={e => {
                      if (isScrubbingRef.current) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        if (rect.width > 0) {
                          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                          const total = duration || activeClip?.duration || 30
                          seekTo(pct * total)
                        }
                      }
                    }}
                    onPointerUp={e => {
                      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
                      const rect = e.currentTarget.getBoundingClientRect()
                      if (rect.width > 0) {
                        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        const total = duration || activeClip?.duration || 30
                        seekTo(pct * total)
                      }
                      isScrubbingRef.current = false
                    }}
                    onPointerCancel={() => {
                      isScrubbingRef.current = false
                    }}
                    className="relative group mt-2 h-16 bg-[#12131a] rounded-xl border border-white/[0.05] shadow-inner overflow-hidden flex flex-col cursor-pointer select-none"
                  >
                    {/* The main tracks container */}
                    <div className="relative flex-1 flex flex-col pointer-events-none">
                      
                      {/* Trim Range Highlight Area */}
                      <div
                        className="absolute top-0 bottom-0 bg-emerald-500/15 border-x-2 border-emerald-500 z-10 pointer-events-none transition-all duration-75"
                        style={{
                          left: `${Math.min(100, Math.max(0, (trimStart / (duration || activeClip.duration || 1)) * 100))}%`,
                          right: `${Math.max(0, 100 - ((trimEnd / (duration || activeClip.duration || 1)) * 100))}%`,
                        }}
                      >
                        {/* Trim Handles (Visual) */}
                        <div className="absolute top-1/2 -translate-y-1/2 -left-[2px] w-1.5 h-6 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                        <div className="absolute top-1/2 -translate-y-1/2 -right-[2px] w-1.5 h-6 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                      </div>

                      {/* Playhead indicator */}
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,1)] z-20 pointer-events-none"
                        style={{ left: `${Math.min(100, Math.max(0, (currentTime / (duration || activeClip.duration || 1)) * 100))}%` }}
                      >
                        <div className="absolute -top-1 -left-[3px] w-2 h-2 bg-white rounded-full shadow" />
                      </div>

                      {/* Master Audio Track Waveform */}
                      <div className={`flex-1 relative flex items-center transition-opacity bg-[#112320] ${isDesktopMuted ? 'opacity-30' : 'opacity-100'}`}>
                        <div className="absolute inset-x-0 inset-y-2 flex items-center justify-between px-1 pointer-events-none">
                          {desktopWaveform}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Precision Trim Range Controls (Super Minimal) */}
                  <div className="flex items-center justify-between gap-4 pt-1 px-1">
                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">{language === 'de' ? 'Start' : 'Start'}</span>
                      <input
                        type="range"
                        min={0}
                        max={trimEnd - 0.5}
                        step={0.1}
                        value={trimStart}
                        onChange={e => {
                          const val = parseFloat(e.target.value)
                          const clamped = Math.min(val, trimEnd - 0.5)
                          setTrimStart(clamped)
                          seekTo(clamped)
                        }}
                        className="flex-1 h-1 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-white/70 w-10">{formatTime(trimStart)}</span>
                    </div>

                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-[10px] font-mono text-white/70 w-10 text-right">{formatTime(trimEnd)}</span>
                      <input
                        type="range"
                        min={trimStart + 0.5}
                        max={duration || activeClip.duration || 30}
                        step={0.1}
                        value={trimEnd}
                        onChange={e => {
                          const val = parseFloat(e.target.value)
                          const clamped = Math.max(val, trimStart + 0.5)
                          setTrimEnd(clamped)
                          seekTo(clamped)
                        }}
                        className="flex-1 h-1 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                      />
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">{language === 'de' ? 'Ende' : 'End'}</span>
                    </div>
                  </div>
                </div>

                {/* Playback Controls Toolbar */}
                <div className="flex items-center justify-between pt-2 px-1">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleTogglePlay}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-black hover:scale-105 transition-transform cursor-pointer shadow-lg"
                    >
                      {isPlaying ? <Pause size={18} fill="black" /> : <Play size={18} fill="black" className="ml-1" />}
                    </button>

                    <button
                      onClick={() => seekTo(trimStart)}
                      className="p-2 rounded-xl text-white/40 hover:text-white transition-colors cursor-pointer"
                      title={language === 'de' ? 'Von vorne' : 'Restart'}
                    >
                      <RotateCcw size={16} />
                    </button>

                    <div className="h-6 w-[1px] bg-white/10 mx-2" />

                    <div className="flex items-center gap-6 ml-4">
                      {/* Master Audio Volume */}
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.muted = !isDesktopMuted
                              setIsDesktopMuted(!isDesktopMuted)
                            }
                          }}
                          className={`p-1 transition-colors ${isDesktopMuted ? 'text-white/30' : 'text-white/60 group-hover:text-white'}`}
                          title={language === 'de' ? 'Lautstärke' : 'Volume'}
                        >
                          <Volume2 size={14} />
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isDesktopMuted ? 0 : desktopVolume}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            setDesktopVolume(v)
                            setIsDesktopMuted(v === 0)
                            if (videoRef.current) {
                              videoRef.current.volume = v
                              videoRef.current.muted = v === 0
                            }
                          }}
                          className="w-20 h-1.5 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-[#9ca3af] [&::-webkit-slider-thumb]:rounded-full cursor-pointer overflow-hidden [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-thumb]:shadow-[-100px_0_0_98px_#9ca3af] opacity-60 group-hover:opacity-100 transition-opacity"
                        />
                      </div>

                      {/* Microphone Audio */}
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => {
                            setIsMicMuted(!isMicMuted)
                            if (micAudioRef.current) {
                              micAudioRef.current.muted = !isMicMuted
                            }
                          }}
                          className={`p-1 transition-colors ${isMicMuted ? 'text-white/30' : 'text-white/60 group-hover:text-white'}`}
                          title="Microphone Audio"
                        >
                          <Mic size={14} />
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMicMuted ? 0 : micVolume}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            setMicVolume(v)
                            setIsMicMuted(v === 0)
                            if (micAudioRef.current) {
                              micAudioRef.current.volume = v
                              micAudioRef.current.muted = v === 0
                            }
                          }}
                          className="w-20 h-1.5 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-[#10b981] [&::-webkit-slider-thumb]:rounded-full cursor-pointer overflow-hidden [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-thumb]:shadow-[-100px_0_0_98px_#10b981] opacity-60 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
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

    </div>
  )
}
