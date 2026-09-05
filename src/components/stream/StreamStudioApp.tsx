import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Gamepad2, Monitor, RefreshCw, Layers, 
  ChevronDown, Check, Minus, Square, X, Tv
} from 'lucide-react'
import { ControllerOverlay, ControllerSkinId } from '../overlay/widgets/ControllerOverlay'

export type StreamQualityId = '1440p60' | '1080p60' | '1080p30' | '720p60' | '720p30'

interface QualityPreset {
  id: StreamQualityId
  label: string
  resolution: string
  fps: number
  width: number
  height: number
  badge: (isDe: boolean) => string
}

const QUALITY_PRESETS: QualityPreset[] = [
  { id: '1440p60', label: '1440p 60 FPS', resolution: '2560 × 1440', fps: 60, width: 2560, height: 1440, badge: () => 'Max (2K)' },
  { id: '1080p60', label: '1080p 60 FPS', resolution: '1920 × 1080', fps: 60, width: 1920, height: 1080, badge: (isDe) => isDe ? 'Standard' : 'Default' },
  { id: '1080p30', label: '1080p 30 FPS', resolution: '1920 × 1080', fps: 30, width: 1920, height: 1080, badge: (isDe) => isDe ? 'Ausgeglichen' : 'Balanced' },
  { id: '720p60',  label: '720p 60 FPS',  resolution: '1280 × 720',  fps: 60, width: 1280, height: 720,  badge: () => '60 FPS' },
  { id: '720p30',  label: '720p 30 FPS',  resolution: '1280 × 720',  fps: 30, width: 1280, height: 720,  badge: (isDe) => isDe ? 'Eco' : 'Eco' },
]

interface CaptureSource {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

const getSkinOptions = (isDe: boolean): Array<{ id: ControllerSkinId; label: string }> => [
  { id: 'ps5_black', label: isDe ? 'PS5 Midnight Schwarz' : 'PS5 DualSense (Midnight Black)' },
  { id: 'ps5_white', label: isDe ? 'PS5 DualSense (Weiß)' : 'PS5 DualSense (White)' },
  { id: 'ps4_black', label: isDe ? 'PS4 Klassisch Schwarz' : 'PS4 DualShock 4 (Black)' },
  { id: 'ps4_white', label: isDe ? 'PS4 Weiß / Rot' : 'PS4 DualShock 4 (White / Red)' },
  { id: 'xbox_one', label: 'Xbox One / Series X' },
]

export function StreamStudioApp() {
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [activeSkin, setActiveSkin] = useState<ControllerSkinId>('ps5_black')
  const [position, setPosition] = useState<'bottom_right' | 'bottom_left' | 'top_right' | 'top_left'>('bottom_right')
  const [scale, setScale] = useState<number>(85)
  const [quality, setQuality] = useState<StreamQualityId>('1080p60')
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain')
  const [gameTitle, setGameTitle] = useState<string>('Game Live')
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false)
  const [isSkinMenuOpen, setIsSkinMenuOpen] = useState(false)
  const [isPosMenuOpen, setIsPosMenuOpen] = useState(false)
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [gamepadConnected, setGamepadConnected] = useState(false)
  const [language, setLanguage] = useState<string>('de')

  const isDe = language === 'de' || language.startsWith('de')
  const skinOptions = getSkinOptions(isDe)

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const hideHeaderTimerRef = useRef<any>(null)

  // Load initial settings
  useEffect(() => {
    window.electronAPI?.getSettings?.().then((s: any) => {
      if (s) {
        if (s.language) setLanguage(s.language)
        if (s.rlControllerSkin) setActiveSkin(s.rlControllerSkin)
        if (s.overlayControllerStreamPos) setPosition(s.overlayControllerStreamPos)
        if (s.rlControllerScale) setScale(s.rlControllerScale)
        if (s.overlayStreamQuality) setQuality(s.overlayStreamQuality)
      }
    })
  }, [])

  // Listen to game updates from main process
  useEffect(() => {
    if (window.electronAPI?.stream?.onGameUpdate) {
      return window.electronAPI.stream.onGameUpdate((data) => {
        if (data.gameName) {
          setGameTitle(data.gameName)
        }
      })
    }
  }, [])

  // Listen to gamepad state for connectivity badge
  useEffect(() => {
    if (window.electronAPI?.onGamepadState) {
      return window.electronAPI.onGamepadState((state: any) => {
        setGamepadConnected(!!state?.connected)
      })
    }
  }, [])

  // Fetch available window sources
  const fetchSources = useCallback(async () => {
    try {
      if (!window.electronAPI?.stream?.getSources) return
      const list: CaptureSource[] = await window.electronAPI.stream.getSources()
      setSources(list)

      // Auto-select game window if not selected yet
      if (!selectedSourceId && list.length > 0) {
        const gameMatch = list.find(s => 
          !s.name.includes('Eclipse') && 
          !s.name.includes('Program Manager') && 
          !s.name.includes('Taskbar') &&
          !s.name.toLowerCase().includes('discord')
        )
        if (gameMatch) {
          setSelectedSourceId(gameMatch.id)
        } else {
          setSelectedSourceId(list[0].id)
        }
      }
    } catch (e: any) {
      console.warn('[StreamStudio] Error loading sources:', e)
    }
  }, [selectedSourceId])

  useEffect(() => {
    fetchSources()
    const interval = setInterval(fetchSources, 4000)
    return () => clearInterval(interval)
  }, [fetchSources])

  // Real Hardware-Accelerated Video Capture with User Selected Quality & FPS
  useEffect(() => {
    if (!selectedSourceId) return

    let isMounted = true

    async function startCapture() {
      try {
        setStreamError(null)
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop())
          mediaStreamRef.current = null
        }

        const activePreset = QUALITY_PRESETS.find(p => p.id === quality) || QUALITY_PRESETS[1]

        // Adapt the stream window native framebuffer size to match the target quality (1440p / 1080p)
        window.electronAPI?.stream?.setResolution?.(activePreset.width, activePreset.height)

        // Native Direct3D 11 High Definition Hardware Capture
        const stream = await (navigator.mediaDevices as any).getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSourceId,
              maxWidth: activePreset.width,
              maxHeight: activePreset.height,
              minWidth: Math.min(1280, activePreset.width),
              minHeight: Math.min(720, activePreset.height),
              maxFrameRate: activePreset.fps,
              minFrameRate: activePreset.fps,
            },
            cursor: 'never',
          }
        })

        if (!isMounted) {
          stream.getTracks().forEach((t: any) => t.stop())
          return
        }

        mediaStreamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(e => console.warn('[StreamStudio] Video play error:', e))
        }
      } catch (err: any) {
        console.error('[StreamStudio] Capture failed:', err)
        if (isMounted) {
          setStreamError(isDe 
            ? 'Fensterübertragung wird initialisiert. Bitte wähle das Spielfenster oben aus.' 
            : 'Capture initializing. Please select your game window above.')
        }
      }
    }

    startCapture()

    return () => {
      isMounted = false
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
        mediaStreamRef.current = null
      }
    }
  }, [selectedSourceId, quality, isDe])

  // Auto-hide header after inactivity
  const handleMouseMove = () => {
    setIsHeaderVisible(true)
    if (hideHeaderTimerRef.current) clearTimeout(hideHeaderTimerRef.current)
    hideHeaderTimerRef.current = setTimeout(() => {
      if (!isSourceMenuOpen && !isSkinMenuOpen && !isPosMenuOpen && !isQualityMenuOpen) {
        setIsHeaderVisible(false)
      }
    }, 3500)
  }

  // Positioning classes for the controller overlay inside the stream canvas
  const positionClasses = {
    bottom_right: 'bottom-6 right-8',
    bottom_left: 'bottom-6 left-8',
    top_right: 'top-8 right-8',
    top_left: 'top-8 left-8',
  }[position]

  return (
    <div 
      onMouseMove={handleMouseMove}
      className={`relative w-screen h-screen bg-[#07080a] text-white select-none overflow-hidden flex flex-col items-center justify-center font-sans ${isHeaderVisible ? 'cursor-default' : 'cursor-none'}`}
    >
      {/* Background Game Stream Canvas (Direct3D 60FPS High-Res Video Feed) */}
      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black overflow-hidden pointer-events-none cursor-none">
        {selectedSourceId ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ 
              imageRendering: '-webkit-optimize-contrast' as any,
              transform: 'translateZ(0)',
              willChange: 'transform'
            }}
            className={`w-full h-full pointer-events-none cursor-none ${fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-white/50">
              <Monitor size={32} />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">
              {isDe ? 'Bereit für Discord-Stream' : 'Ready for Discord Stream'}
            </h2>
            <p className="text-xs text-white/50 leading-relaxed">
              {isDe 
                ? 'Wähle oben das Spielfenster aus. In Discord wählst du unter „Bildschirm übertragen ➔ Anwendungen“ einfach dieses Fenster (Eclipse Stream).'
                : 'Select your game window above. In Discord, choose Screen Share ➔ Applications ➔ "Eclipse Stream".'}
            </p>
          </div>
        )}

        {streamError && (
          <div className="absolute inset-x-8 bottom-24 p-3.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-xs text-white/80 text-center">
            {streamError}
          </div>
        )}
      </div>

      {/* Floating Animated Controller Overlay (Rendered directly in the stream video) */}
      <div className={`absolute ${positionClasses} z-20 pointer-events-none transition-all duration-300`}>
        <ControllerOverlay 
          skin={activeSkin}
          scale={scale || 85}
          isEditMode={false}
        />
      </div>

      {/* Sleek Custom Frameless Header Bar (Draggable, Auto-Hiding) */}
      <AnimatePresence>
        {isHeaderVisible && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.15 }}
            className="absolute top-3 left-4 right-4 z-30 flex items-center justify-between px-4 py-2 rounded-xl bg-[#0d0e12]/92 backdrop-blur-xl border border-white/10 shadow-2xl drag-region"
          >
            {/* Left: Stream Status Badge & Title */}
            <div className="flex items-center gap-3 no-drag">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold tracking-wider">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {isDe ? 'DISCORD LIVE' : 'DISCORD LIVE'}
              </div>

              <div className="h-4 w-px bg-white/10" />

              <span className="text-xs font-semibold text-white/90 truncate max-w-[180px]">
                {gameTitle}
              </span>

              {gamepadConnected ? (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Gamepad2 size={11} /> {isDe ? 'Controller aktiv' : 'Controller active'}
                </span>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 text-white/40 border border-white/5 flex items-center gap-1">
                  <Gamepad2 size={11} /> {isDe ? 'Controller bereit' : 'Controller ready'}
                </span>
              )}
            </div>

            {/* Right: Quick Controls & Window Buttons */}
            <div className="flex items-center gap-2 no-drag">
              
              {/* Window Source Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsSourceMenuOpen(!isSourceMenuOpen)
                    setIsSkinMenuOpen(false)
                    setIsPosMenuOpen(false)
                    setIsQualityMenuOpen(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 transition-colors cursor-pointer"
                >
                  <Monitor size={12} />
                  <span className="max-w-[120px] truncate">
                    {sources.find(s => s.id === selectedSourceId)?.name || (isDe ? 'Fenster wählen' : 'Select Window')}
                  </span>
                  <ChevronDown size={12} className="text-white/40" />
                </button>

                {isSourceMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 max-h-80 overflow-y-auto rounded-xl bg-[#121318] border border-white/10 shadow-2xl p-1.5 z-50 flex flex-col gap-1">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-white/40 tracking-wider">
                      {isDe ? 'Fenster zum Streamen' : 'Window to Stream'}
                    </div>
                    {sources.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSourceId(s.id)
                          setIsSourceMenuOpen(false)
                        }}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                          selectedSourceId === s.id ? 'bg-white/15 text-white font-semibold' : 'text-white/70 hover:bg-white/5'
                        }`}
                      >
                        {s.appIcon ? (
                          <img src={s.appIcon} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
                        ) : (
                          <Monitor size={14} className="text-white/40 flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">{s.name}</span>
                        {selectedSourceId === s.id && <Check size={12} className="text-white flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality & FPS Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsQualityMenuOpen(!isQualityMenuOpen)
                    setIsSourceMenuOpen(false)
                    setIsSkinMenuOpen(false)
                    setIsPosMenuOpen(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 transition-colors cursor-pointer"
                >
                  <Tv size={12} />
                  <span>{QUALITY_PRESETS.find(p => p.id === quality)?.label || '1080p 60 FPS'}</span>
                  <ChevronDown size={12} className="text-white/40" />
                </button>

                {isQualityMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-[#121318] border border-white/10 shadow-2xl p-1.5 z-50 flex flex-col gap-1">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-white/40 tracking-wider">
                      {isDe ? 'Stream-Qualität & FPS' : 'Stream Quality & FPS'}
                    </div>
                    {QUALITY_PRESETS.map((preset) => {
                      const isSelected = quality === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setQuality(preset.id)
                            setIsQualityMenuOpen(false)
                            window.electronAPI?.setSettings({ overlayStreamQuality: preset.id } as any)
                          }}
                          className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                            isSelected ? 'bg-white/15 text-white font-semibold' : 'text-white/70 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span>{preset.label}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-normal">
                                {preset.badge(isDe)}
                              </span>
                            </div>
                            <span className="text-[10px] text-white/40">{preset.resolution}</span>
                          </div>
                          {isSelected && <Check size={12} className="text-white flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Skin Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsSkinMenuOpen(!isSkinMenuOpen)
                    setIsSourceMenuOpen(false)
                    setIsPosMenuOpen(false)
                    setIsQualityMenuOpen(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 transition-colors cursor-pointer"
                >
                  <Gamepad2 size={12} />
                  <span>Skin</span>
                  <ChevronDown size={12} className="text-white/40" />
                </button>

                {isSkinMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-[#121318] border border-white/10 shadow-2xl p-1.5 z-50 flex flex-col gap-1">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-white/40 tracking-wider">
                      {isDe ? 'Controller-Design' : 'Controller Skin'}
                    </div>
                    {skinOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setActiveSkin(opt.id)
                          setIsSkinMenuOpen(false)
                        }}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                          activeSkin === opt.id ? 'bg-white/15 text-white font-semibold' : 'text-white/70 hover:bg-white/5'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {activeSkin === opt.id && <Check size={12} className="text-white" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Position Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsPosMenuOpen(!isPosMenuOpen)
                    setIsSourceMenuOpen(false)
                    setIsSkinMenuOpen(false)
                    setIsQualityMenuOpen(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 transition-colors cursor-pointer"
                >
                  <Layers size={12} />
                  <span>Position</span>
                  <ChevronDown size={12} className="text-white/40" />
                </button>

                {isPosMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-[#121318] border border-white/10 shadow-2xl p-1.5 z-50 flex flex-col gap-1">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-white/40 tracking-wider">
                      {isDe ? 'Overlay-Position' : 'Overlay Position'}
                    </div>
                    {[
                      { id: 'bottom_right', label: isDe ? 'Unten rechts' : 'Bottom Right' },
                      { id: 'bottom_left', label: isDe ? 'Unten links' : 'Bottom Left' },
                      { id: 'top_right', label: isDe ? 'Oben rechts' : 'Top Right' },
                      { id: 'top_left', label: isDe ? 'Oben links' : 'Top Left' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPosition(p.id as any)
                          setIsPosMenuOpen(false)
                        }}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                          position === p.id ? 'bg-white/15 text-white font-semibold' : 'text-white/70 hover:bg-white/5'
                        }`}
                      >
                        <span>{p.label}</span>
                        {position === p.id && <Check size={12} className="text-white" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fit Mode Toggle */}
              <button
                type="button"
                onClick={() => setFitMode(f => f === 'contain' ? 'cover' : 'contain')}
                title={fitMode === 'contain' ? (isDe ? 'Auf Vollbild ausfüllen' : 'Full Cover') : (isDe ? 'Original 16:9 beibehalten' : 'Original 16:9')}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                {fitMode === 'contain' ? '16:9 Fit' : 'Full Cover'}
              </button>

              {/* Refresh Sources Button */}
              <button
                type="button"
                onClick={fetchSources}
                title={isDe ? 'Fensterliste aktualisieren' : 'Refresh window list'}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw size={13} />
              </button>

              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* Minimize Window (Runs seamlessly in background without Discord pausing!) */}
              <button
                type="button"
                onClick={() => window.electronAPI?.stream?.minimize()}
                title={isDe ? 'Im Hintergrund streamen (versteckt das Fenster auf deinem Monitor, Discord streamt unterbrechungsfrei weiter)' : 'Stream in background (keeps streaming in Discord without pausing)'}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                <Minus size={13} />
              </button>

              {/* Maximize Window */}
              <button
                type="button"
                onClick={() => window.electronAPI?.stream?.maximize()}
                title={isDe ? 'Maximieren / Wiederherstellen' : 'Maximize / Restore'}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                <Square size={11} />
              </button>

              {/* Close Stream Studio Window */}
              <button
                type="button"
                onClick={() => window.electronAPI?.stream?.close()}
                title={isDe ? 'Stream-Studio Fenster schließen' : 'Close Stream Studio'}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
