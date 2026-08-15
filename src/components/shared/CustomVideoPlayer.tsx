import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Loader2 } from 'lucide-react'

interface CustomVideoPlayerProps {
  src: string
  poster?: string
}

function formatTime(seconds: number) {
  if (isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function CustomVideoPlayer({ src, poster }: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Read persisted volume & mute state from localStorage
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('eclipse_video_volume')
    if (saved !== null) {
      const parsed = parseFloat(saved)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed
    }
    return 0.8
  })

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem('eclipse_video_muted')
    return saved === 'true'
  })

  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [showControls, setShowControls] = useState(true)
  const [isHoveringVolume, setIsHoveringVolume] = useState(false)

  // Initialize and apply video volume/mute
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume
      videoRef.current.muted = isMuted
    }
  }, [src, volume, isMuted])

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
        videoRef.current.play()
      } else {
        videoRef.current.pause()
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
    }
  }

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
      localStorage.setItem('eclipse_video_muted', String(nextMuted))
      
      // If unmuting and volume is 0, reset volume to 0.5
      if (!nextMuted && volume === 0) {
        setVolume(0.5)
        videoRef.current.volume = 0.5
        localStorage.setItem('eclipse_video_volume', '0.5')
      }
    }
  }

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol))
    setVolume(clamped)
    localStorage.setItem('eclipse_video_volume', String(clamped))

    if (videoRef.current) {
      videoRef.current.volume = clamped
      if (clamped > 0 && isMuted) {
        videoRef.current.muted = false
        setIsMuted(false)
        localStorage.setItem('eclipse_video_muted', 'false')
      } else if (clamped === 0 && !isMuted) {
        videoRef.current.muted = true
        setIsMuted(true)
        localStorage.setItem('eclipse_video_muted', 'true')
      }
    }
  }

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen()
    }
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
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 bg-black/30">
          <div className="w-14 h-14 rounded-2xl bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-2xl">
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        src={src}
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
        onEnded={() => setIsPlaying(false)}
      />

      {/* Controls Overlay */}
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
              className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-all focus:outline-none"
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
                className="hover:text-white transition-colors focus:outline-none flex items-center justify-center"
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
              className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors focus:outline-none"
              title="Fullscreen"
            >
              <Maximize size={18} />
            </button>

          </div>
        </div>
      </div>
    </div>
  )
}
