import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useTranslation } from '../../hooks/useTranslation'
// @ts-ignore
import eclipseLogo from '../../assets/logo.png'

interface SplashViewProps {
  onComplete: () => void
}

export function SplashView({ onComplete }: SplashViewProps) {
  const { scan } = useScanner()
  const { language } = useTranslation()
  const scanMessage = useGameStore(state => state.scanMessage)
  
  const [progress, setProgress] = useState(10)
  const [statusText, setStatusText] = useState(
    language === 'de' ? 'Initialisiere Eclipse Engine...' : 'Initializing Eclipse Engine...'
  )
  const [isDone, setIsDone] = useState(false)
  const isFinishedRef = useRef(false)

  // Minimal, subtle ambient stars
  const stars = useMemo(() => [
    { id: 1, left: '12%', top: '14%', size: 1.5, opacity: 0.3, duration: '3.2s', delay: '0.2s' },
    { id: 2, left: '84%', top: '11%', size: 1,   opacity: 0.2, duration: '4.1s', delay: '1.1s' },
    { id: 3, left: '26%', top: '28%', size: 1.5, opacity: 0.2, duration: '3.6s', delay: '0.7s' },
    { id: 4, left: '76%', top: '32%', size: 1,   opacity: 0.3, duration: '4.8s', delay: '1.5s' },
    { id: 5, left: '8%',  top: '48%', size: 1.5, opacity: 0.2, duration: '3.9s', delay: '0.4s' },
    { id: 6, left: '91%', top: '54%', size: 1,   opacity: 0.2, duration: '4.3s', delay: '2.0s' },
    { id: 7, left: '18%', top: '72%', size: 1.5, opacity: 0.3, duration: '3.4s', delay: '0.9s' },
    { id: 8, left: '82%', top: '78%', size: 1,   opacity: 0.2, duration: '4.5s', delay: '1.3s' },
    { id: 9, left: '29%', top: '88%', size: 1,   opacity: 0.2, duration: '3.7s', delay: '0.6s' },
    { id: 10, left: '68%', top: '91%', size: 1.5, opacity: 0.3, duration: '4.0s', delay: '1.8s' },
  ], [])

  const finish = () => {
    if (!isFinishedRef.current) {
      isFinishedRef.current = true
      onComplete()
    }
  }

  // Safety fallback: Never freeze indefinitely
  useEffect(() => {
    const watchdog = setTimeout(() => {
      finish()
    }, 5500)
    return () => clearTimeout(watchdog)
  }, [])

  // Sync external scanner messages if provided
  useEffect(() => {
    if (scanMessage && !isDone) {
      setStatusText(scanMessage)
    }
  }, [scanMessage, isDone])

  // Stepped, cinematic loading sequence
  useEffect(() => {
    let isCancelled = false
    const abortController = new AbortController()

    const runSequence = async () => {
      // 1. Initial stage (0.4s)
      await new Promise(r => setTimeout(r, 350))
      if (isCancelled) return
      setProgress(32)
      setStatusText(language === 'de' ? 'Scanne installierte Spiele & Manifeste...' : 'Scanning game manifests...')

      // Start actual game scan in parallel
      scan({ signal: abortController.signal }).catch(() => {})

      // 2. Library sync stage (0.5s)
      await new Promise(r => setTimeout(r, 550))
      if (isCancelled) return
      setProgress(68)
      setStatusText(language === 'de' ? 'Synchronisiere Bibliotheken & Metadaten...' : 'Synchronizing libraries & metadata...')

      // 3. Database optimization stage (0.5s)
      await new Promise(r => setTimeout(r, 550))
      if (isCancelled) return
      setProgress(92)
      setStatusText(language === 'de' ? 'Optimiere Cache & Oberflächen...' : 'Optimizing cache & interface...')

      // 4. Ready stage (0.4s)
      await new Promise(r => setTimeout(r, 450))
      if (isCancelled) return
      setProgress(100)
      setIsDone(true)
      setStatusText(language === 'de' ? 'Bereit • Willkommen' : 'Ready • Welcome')

      // 5. Short hold for satisfaction then smooth exit (0.45s)
      await new Promise(r => setTimeout(r, 450))
      if (isCancelled) return
      finish()
    }

    runSequence()

    return () => {
      isCancelled = true
      abortController.abort()
    }
  }, [])

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#040405] text-white select-none overflow-hidden"
    >
      {/* ─── Ambient Glow & Starfield ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-white/[0.03] rounded-full blur-[100px]" />
        
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              animation: `pulse ${star.duration} ease-in-out infinite`,
              animationDelay: star.delay
            }}
          />
        ))}
      </div>

      {/* ─── Center Splash Container ─── */}
      <div className="relative z-10 w-full max-w-[360px] px-6 flex flex-col items-center">
        
        {/* Floating Eclipse Logo with Corona Glow */}
        <div className="relative mb-6 flex items-center justify-center w-28 h-28">
          <motion.div 
            className="absolute w-24 h-24 rounded-full bg-white/10 pointer-events-none"
            style={{ filter: 'blur(28px)' }}
            animate={{
              scale: [0.95, 1.12, 0.95],
              opacity: [0.3, 0.65, 0.3]
            }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, y: [-2, 2, -2] }}
            transition={{ 
              scale: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.5 },
              y: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }
            }}
            className="relative z-10 w-20 h-20 flex items-center justify-center"
          >
            <img 
              src={eclipseLogo} 
              alt="Eclipse Launcher" 
              className="w-18 h-18 object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.9)]" 
            />
          </motion.div>
        </div>

        {/* Brand Header */}
        <div className="text-center mb-8">
          <motion.h1 
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-xl font-bold tracking-[0.3em] uppercase text-white"
          >
            ECLIPSE
          </motion.h1>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex items-center justify-center gap-2 mt-1.5"
          >
            <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
              Unified Game Library
            </span>
            <span className="text-white/20 text-[10px]">•</span>
            <span className="text-[10px] font-medium tracking-wider text-white/40 font-mono">
              v1.1.2
            </span>
          </motion.div>
        </div>

        {/* ─── Stepped Progress Bar ─── */}
        <div className="w-full space-y-3">
          {/* Progress Track */}
          <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden relative">
            <motion.div 
              className="absolute left-0 top-0 bottom-0 bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,0.7)]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>

          {/* Status Row */}
          <div className="flex items-center justify-between text-xs px-0.5 min-h-[20px]">
            <div className="flex items-center gap-2 max-w-[260px]">
              {isDone ? (
                <Check size={13} className="text-white flex-shrink-0 animate-in zoom-in-50 duration-200" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
              )}
              <span className="text-white/60 font-medium tracking-wide truncate">
                {statusText}
              </span>
            </div>
            <span className="text-white/40 font-mono text-[11px] font-semibold flex-shrink-0">
              {progress}%
            </span>
          </div>
        </div>

      </div>
    </motion.div>
  )
}
