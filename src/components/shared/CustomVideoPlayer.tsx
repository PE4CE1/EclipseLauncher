import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react'

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
  
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  
  const [isLoading, setIsLoading] = useState(true)
  const [showControls, setShowControls] = useState(true)

  // Auto-hide controls when playing
  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (isPlaying && showControls) {
      timeout = setTimeout(() => setShowControls(false), 2500)
    }
    return () => clearTimeout(timeout)
  }, [isPlaying, showControls])

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
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
      setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pos = (e.clientX - rect.left) / rect.width
      videoRef.current.currentTime = pos * videoRef.current.duration
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
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

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full max-w-full max-h-full rounded-lg overflow-hidden shadow-2xl bg-black flex items-center justify-center group"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlay}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 bg-black/20">
          <div className="w-16 h-16 rounded-2xl bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-2xl">
            <Loader2 size={32} className="animate-spin text-white" />
          </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        playsInline
        className={`w-full h-full object-contain transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}
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
        className={`absolute bottom-0 left-0 right-0 p-6 pt-32 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress Bar */}
        <div 
          className="w-full h-1.5 bg-white/20 rounded-full mb-6 cursor-pointer relative group/progress"
          onClick={handleProgressClick}
        >
          <div 
            className="absolute top-0 left-0 h-full bg-white rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
          {/* Scrubber thumb */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-lg"
            style={{ left: `calc(${progress}% - 8px)` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-6">
            <button onClick={togglePlay} className="hover:text-white/70 transition-colors focus:outline-none">
              {isPlaying ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current" />}
            </button>
            <div className="text-sm font-medium tracking-wide font-mono">
              {formatTime(currentTime)} <span className="text-white/40 mx-1">/</span> {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={toggleMute} className="hover:text-white/70 transition-colors focus:outline-none">
              {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
            <button onClick={toggleFullscreen} className="hover:text-white/70 transition-colors focus:outline-none">
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
