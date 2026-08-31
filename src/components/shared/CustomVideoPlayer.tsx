import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Loader2, RotateCcw } from 'lucide-react'
import Hls from 'hls.js'

interface CustomVideoPlayerProps {
  src: string | string[]
  poster?: string
}

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function CustomVideoPlayer({ src, poster }: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const candidateSources = (Array.isArray(src) ? src : [src]).filter(Boolean)
  const [sourceIdx, setSourceIdx] = useState(0)
  const currentSrc = candidateSources[sourceIdx] || ''
  
  // Read persisted volume & mute state from localStorage
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('eclipse_video_volume')
      if (saved !== null) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed
      }
    } catch {}
    return 0.8
  })

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('eclipse_video_muted')
      return saved === 'true'
    } catch {}
    return false
  })

  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [showControls, setShowControls] = useState(true)
  const [isHoveringVolume, setIsHoveringVolume] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Reset state when src prop changes
  useEffect(() => {
    setSourceIdx(0)
    setHasError(false)
    setIsLoading(true)
  }, [src])

  // Setup video source (HLS vs Native MP4/WebM)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentSrc) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setHasError(false)

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const isHls = currentSrc.includes('.m3u8')

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      })
      hlsRef.current = hls

      hls.loadSource(currentSrc)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false)
        video.play().catch(() => {
          setIsPlaying(false)
        })
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn('[CustomVideoPlayer] HLS fatal error on source:', currentSrc, data.type)
          hls.destroy()
          hlsRef.current = null
          // Fall back to next source
          if (sourceIdx < candidateSources.length - 1) {
            setSourceIdx(prev => prev + 1)
          } else {
            setIsLoading(false)
            setHasError(true)
          }
        }
      })
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentSrc
      video.load()
      video.play().catch(() => {
        setIsPlaying(false)
      })
    } else {
      video.src = currentSrc
      video.load()
      video.play().catch(() => {
        setIsPlaying(false)
      })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [currentSrc, sourceIdx, candidateSources.length])

  // Initialize and apply video volume/mute
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume
      videoRef.current.muted = isMuted
    }
  }, [volume, isMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current.load()
      }
    }
  }, [])

  // Auto-hide controls when playing
  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (isPlaying && showControls && !isHoveringVolume) {
      timeout = setTimeout(() => setShowControls(false), 2800)
    }
    return () => clearTimeout(timeout)
  }, [isPlaying, showControls, isHoveringVolume])

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.duration) {
      setCurrentTime(videoRef.current.currentTime)
      setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      videoRef.current.volume = volume
      videoRef.current.muted = isMuted
      setIsLoading(false)
    }
  }

  const handleVideoError = useCallback(() => {
    console.warn('[CustomVideoPlayer] Native video load error on:', currentSrc)
    if (sourceIdx < candidateSources.length - 1) {
      setSourceIdx(prev => prev + 1)
    } else {
      setIsLoading(false)
      setHasError(true)
    }
  }, [currentSrc, sourceIdx, candidateSources.length])

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (videoRef.current && videoRef.current.duration) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      videoRef.current.currentTime = pos * videoRef.current.duration
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      const nextMuted = !isMuted
      videoRef.current.muted = nextMuted
      setIsMuted(nextMuted)
      try {
        localStorage.setItem('eclipse_video_muted', String(nextMuted))
      } catch {}
      
      if (!nextMuted && volume === 0) {
        setVolume(0.5)
        videoRef.current.volume = 0.5
        try {
          localStorage.setItem('eclipse_video_volume', '0.5')
        } catch {}
      }
    }
  }

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol))
    setVolume(clamped)
    try {
      localStorage.setItem('eclipse_video_volume', String(clamped))
    } catch {}

    if (videoRef.current) {
      videoRef.current.volume = clamped
      if (clamped > 0 && isMuted) {
        videoRef.current.muted = false
        setIsMuted(false)
        try {
          localStorage.setItem('eclipse_video_muted', 'false')
        } catch {}
      } else if (clamped === 0 && !isMuted) {
        videoRef.current.muted = true
        setIsMuted(true)
        try {
          localStorage.setItem('eclipse_video_muted', 'true')
        } catch {}
      }
    }
  }

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  const retryPlayback = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSourceIdx(0)
    setHasError(false)
    setIsLoading(true)
  }

  const effectiveVolume = isMuted ? 0 : volume

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl bg-black flex items-center justify-center group select-none"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlay}
    >
      {/* Loading Spinner */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 bg-black/40 backdrop-blur-xs">
          <div className="w-14 h-14 rounded-2xl bg-black/70 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-2xl">
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        </div>
      )}

      {/* Fallback / Error State */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80 p-6 text-center">
          {poster && (
            <img src={poster} alt="Poster" className="absolute inset-0 w-full h-full object-cover opacity-20 filter blur-sm" />
          )}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
              <Play size={20} className="text-white fill-white ml-0.5" />
            </div>
            <p className="text-sm font-semibold text-white/90">Trailer could not be streamed</p>
            <button
              onClick={retryPlayback}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs text-white transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        poster={poster}
        autoPlay
        playsInline
        className={`w-full h-full object-contain transition-opacity duration-300 ${isLoading ? 'opacity-40' : 'opacity-100'}`}
        onLoadStart={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => { setIsLoading(false); setIsPlaying(true) }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleVideoError}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Controls Overlay */}
      {!hasError && (
        <div 
          className={`absolute bottom-0 left-0 right-0 p-5 pt-28 bg-gradient-to-t from-black/95 via-black/50 to-transparent transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Progress Scrub Bar */}
          <div 
            className="w-full h-1.5 bg-white/20 hover:h-2.5 rounded-full mb-4 cursor-pointer relative group/progress transition-all"
            onClick={handleProgressClick}
          >
            <div 
              className="absolute top-0 left-0 h-full bg-white rounded-full transition-all duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-md"
              style={{ left: `calc(${progress}% - 7px)` }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between text-white">
            
            {/* Left: Play/Pause & Time */}
            <div className="flex items-center gap-4">
              <button 
                onClick={togglePlay} 
                className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-all focus:outline-none cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-0.5" />}
              </button>

              <div className="text-xs font-medium tracking-wider font-mono text-white/80">
                {formatTime(currentTime)} <span className="text-white/30 mx-1">/</span> {formatTime(duration)}
              </div>
            </div>

            {/* Right: Interactive Volume Slider & Fullscreen */}
            <div className="flex items-center gap-4">
              
              {/* Volume Control with Hover Slider */}
              <div 
                className="flex items-center gap-2 group/volume relative py-1 px-1.5 rounded-lg hover:bg-white/10 transition-colors"
                onMouseEnter={() => setIsHoveringVolume(true)}
                onMouseLeave={() => setIsHoveringVolume(false)}
              >
                <button 
                  onClick={toggleMute} 
                  className="hover:text-white transition-colors focus:outline-none flex items-center justify-center cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {effectiveVolume === 0 ? (
                    <VolumeX size={20} className="text-red-400" />
                  ) : effectiveVolume < 0.5 ? (
                    <Volume1 size={20} className="text-white/90" />
                  ) : (
                    <Volume2 size={20} className="text-white" />
                  )}
                </button>

                {/* Smooth Volume Slider */}
                <div className="w-20 md:w-24 h-5 flex items-center cursor-pointer">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={effectiveVolume}
                    onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/20 accent-white rounded-lg appearance-none cursor-pointer focus:outline-none"
                  />
                </div>
              </div>

              {/* Fullscreen Button */}
              <button 
                onClick={toggleFullscreen} 
                className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors focus:outline-none cursor-pointer"
                title="Fullscreen"
              >
                <Maximize size={18} />
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
