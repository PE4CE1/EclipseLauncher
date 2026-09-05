import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react'
import type { MediaState } from '../../../types/game'

interface MediaOverlayWidgetProps {
  editMode?: boolean
  autoHide?: boolean
  mediaSource?: 'all' | 'spotify' | 'youtube'
  showVisualizer?: boolean
  language?: string
}

// 8-step musical rhythm cycle (~128 BPM groove, ~195ms per step = ~5.1 FPS)
// Gives a clean hardware LED VU meter / digital beat meter look at ~0% GPU
const RHYTHM_BEAT_PATTERNS: [number, number, number][] = [
  [8.5, 7.0, 4.0], // Beat 1: Kick & melody hit
  [4.5, 8.5, 6.5], // Off-beat: Hi-hat & vocals
  [3.0, 4.5, 3.5], // Low groove
  [7.5, 5.5, 8.5], // Beat 2: Snare & crash
  [8.5, 3.5, 5.0], // Bass accent
  [4.0, 8.0, 3.0], // Vocal rise
  [6.5, 5.0, 7.5], // Pre-beat swing
  [3.0, 3.5, 4.0], // Pocket dip
]

function EqualizerCapsule() {
  const [patternIndex, setPatternIndex] = useState(0)

  useEffect(() => {
    // 195ms cadence corresponds to ~128 BPM 8th-notes: crisp rhythmic digital meter
    // Zero GPU interpolation overhead - Chromium sleeps between ticks (~0% GPU load)
    const timer = setInterval(() => {
      setPatternIndex((prev) => (prev + 1) % RHYTHM_BEAT_PATTERNS.length)
    }, 195)
    return () => clearInterval(timer)
  }, [])

  const [b1, b2, b3] = RHYTHM_BEAT_PATTERNS[patternIndex]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'absolute',
        bottom: 3.5,
        right: 3.5,
        width: 20,
        height: 14,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        border: '1px solid rgba(255, 255, 255, 0.20)',
        borderRadius: 9999,
        padding: '2.5px 3.5px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        pointerEvents: 'none',
        zIndex: 5,
        contain: 'layout paint',
      }}
    >
      <span 
        style={{
          width: 2,
          height: b1,
          borderRadius: 1,
          backgroundColor: '#FFFFFF',
          display: 'block',
          flexShrink: 0,
        }} 
      />
      <span 
        style={{
          width: 2,
          height: b2,
          borderRadius: 1,
          backgroundColor: '#FFFFFF',
          display: 'block',
          flexShrink: 0,
        }} 
      />
      <span 
        style={{
          width: 2,
          height: b3,
          borderRadius: 1,
          backgroundColor: '#FFFFFF',
          display: 'block',
          flexShrink: 0,
        }} 
      />
    </motion.div>
  )
}


export function MediaOverlayWidget({ 
  editMode = false, 
  autoHide = false,
  mediaSource = 'all',
  showVisualizer = true,
  language = 'de'
}: MediaOverlayWidgetProps) {
  const [media, setMedia] = useState<MediaState>({
    isPlaying: false,
    title: '',
    artist: '',
    app: null,
  })

  const [isHovered, setIsHovered] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [imgError, setImgError] = useState(false)
  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTrackRef = useRef<string>('')
  const isDe = language === 'de'


  // Sync initial media status with the backend filter (optimized zero-render check)
  useEffect(() => {
    const isSame = (a: MediaState, b: MediaState) =>
      a.isPlaying === b.isPlaying &&
      a.title === b.title &&
      a.artist === b.artist &&
      a.app === b.app &&
      a.coverUrl === b.coverUrl

    if (window.electronAPI?.media?.getStatus) {
      window.electronAPI.media.getStatus(mediaSource).then((st) => {
        if (st) setMedia(prev => isSame(prev, st) ? prev : st)
      }).catch(() => {})
    }

    if (window.electronAPI?.media?.onUpdate) {
      const unsub = window.electronAPI.media.onUpdate((st) => {
        if (st) {
          if (mediaSource === 'spotify' && st.app && st.app !== 'spotify') return
          setMedia(prev => isSame(prev, st) ? prev : st)
        }
      })
      return () => unsub()
    }
  }, [mediaSource])

  // Track change trigger: smoothly expand and collapse after 3 seconds if autoHide
  useEffect(() => {
    const currentTrackKey = `${media.artist} - ${media.title} - ${media.isPlaying}`
    if (currentTrackKey !== lastTrackRef.current) {
      lastTrackRef.current = currentTrackKey
      setImgError(false)
      setIsExpanded(true)

      if (autoHide && !editMode && !isHovered) {
        if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
        collapseTimerRef.current = setTimeout(() => {
          setIsExpanded(false)
        }, 3000)
      }
    }
  }, [media.title, media.artist, media.isPlaying, autoHide, editMode, isHovered])

  // Mouse hover logic
  const handleMouseEnter = () => {
    setIsHovered(true)
    setIsExpanded(true)
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    if (window.electronAPI?.setOverlayIgnoreMouse) {
      window.electronAPI.setOverlayIgnoreMouse(false)
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)

    if (autoHide && !editMode) {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false)
      }, 3000)
    }

    if (window.electronAPI?.setOverlayIgnoreMouse && !editMode) {
      window.electronAPI.setOverlayIgnoreMouse(true)
    }
  }

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    window.electronAPI?.media?.playPause?.()
    setMedia(prev => ({ ...prev, isPlaying: !prev.isPlaying }))
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    window.electronAPI?.media?.next?.()
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    window.electronAPI?.media?.previous?.()
  }

  // Filter if not playing and no track
  const hasContent = Boolean(media.title || media.artist || media.app)
  if (!editMode && !hasContent && !media.isPlaying) {
    return null
  }

  // Filter out non-spotify if user chose Spotify only
  if (!editMode && mediaSource === 'spotify' && media.app && media.app !== 'spotify') {
    return null
  }

  const isSpotify = media.app === 'spotify'
  const isYouTube = media.app === 'youtube'

  // Clean localized formatting
  const isGenericSpotify = media.title === 'Spotify' || media.title === 'Pausiert'
  const displayTitle = isGenericSpotify
    ? (editMode ? (isDe ? 'Kein Titel aktiv' : 'No track active') : (isDe ? 'Wiedergabe bereit' : 'Ready to play'))
    : (media.title || (editMode ? (isDe ? 'Kein Titel aktiv' : 'No track active') : (isDe ? 'Wiedergabe bereit' : 'Ready to play')))

  const displayArtist = isGenericSpotify
    ? 'Spotify'
    : (media.artist || (editMode ? 'Spotify' : (isDe ? 'Eclipse Medien' : 'Eclipse Media')))

  const expanded = editMode ? true : (autoHide ? isExpanded : true)

  return (
    <>
      {/* Main Glass Widget Container - 100% Monochrome Black & White with GPU Layer Isolation */}
      <motion.div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        initial={false}
        animate={{ 
          width: expanded ? 348 : 52,
          padding: expanded ? '6px 14px 6px 6px' : '0px',
        }}
        transition={{ 
          type: 'spring', 
          stiffness: 280, 
          damping: 22, 
          mass: 0.75 
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 52,
          borderRadius: 16,
          backgroundColor: '#0a0b0f',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.65)',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          userSelect: 'none',
          pointerEvents: 'auto',
          cursor: 'default',
          outline: editMode ? '1.5px dashed rgba(255, 255, 255, 0.7)' : 'none',
          outlineOffset: 3,
          overflow: 'hidden',
          WebkitFontSmoothing: 'antialiased',
          boxSizing: 'border-box',
          contain: 'layout paint',
          transform: 'translateZ(0)',
          willChange: 'width, padding',
        }}
      >
        {/* Album Cover Art / App Badge (Seamless 100% in collapsed mode) */}
        <motion.div 
          animate={{
            width: expanded ? 40 : 52,
            height: expanded ? 40 : 52,
            borderRadius: expanded ? 11 : 15,
          }}
          transition={{
            type: 'spring',
            stiffness: 280,
            damping: 22,
            mass: 0.75,
          }}
          style={{
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {media.coverUrl && !imgError ? (
            <img 
              src={media.coverUrl} 
              alt={displayTitle}
              onError={() => setImgError(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 'inherit',
                display: 'block',
              }} 
            />
          ) : (
            <div style={{
              color: 'rgba(255, 255, 255, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Music size={expanded ? 18 : 22} />
            </div>
          )}

          {/* Equalizer overlay when playing - Ultra-Clean Zero-Overhead Monochrome Capsule */}
          <AnimatePresence>
            {media.isPlaying && Boolean(showVisualizer) && (
              <EqualizerCapsule />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Expandable Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flex: 1,
                minWidth: 0,
                marginLeft: 12,
                gap: 12,
                overflow: 'hidden',
              }}
            >
              {/* Song Title & Artist info - Monochrome Typography */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div 
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#FFFFFF',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.25,
                  }}
                >
                  {displayTitle}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 2,
                  fontSize: 10.5,
                  color: 'rgba(255, 255, 255, 0.50)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {isSpotify ? (
                    <span style={{ color: 'rgba(255, 255, 255, 0.90)', fontWeight: 600 }}>Spotify</span>
                  ) : isYouTube ? (
                    <span style={{ color: 'rgba(255, 255, 255, 0.90)', fontWeight: 600 }}>YouTube</span>
                  ) : null}

                  {(isSpotify || isYouTube) && displayArtist !== 'Spotify' && (
                    <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>•</span>
                  )}

                  {displayArtist !== 'Spotify' && (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {displayArtist}
                    </span>
                  )}
                </div>
              </div>

              {/* Minimalist Monochrome Controls Cluster */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                flexShrink: 0,
                marginRight: 4 
              }}>
                {/* Previous Track - Minimalist icon button */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.15, opacity: 1 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={handlePrev}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: '#FFFFFF',
                    opacity: 0.70,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <SkipBack size={14} />
                </motion.button>

                {/* Play / Pause - Pure High-Contrast Circle */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.90 }}
                  onClick={handlePlayPause}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#FFFFFF',
                    color: '#000000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(255, 255, 255, 0.25)',
                  }}
                >
                  {media.isPlaying ? (
                    <Pause size={13} fill="#000000" />
                  ) : (
                    <Play size={13} fill="#000000" style={{ marginLeft: 1.5 }} />
                  )}
                </motion.button>

                {/* Next Track - Minimalist icon button */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.15, opacity: 1 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={handleNext}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: '#FFFFFF',
                    opacity: 0.70,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <SkipForward size={14} />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}
