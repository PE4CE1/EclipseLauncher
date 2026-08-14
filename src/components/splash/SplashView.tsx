import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Check, Play } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useTranslation } from '../../hooks/useTranslation'
// @ts-ignore
import eclipseLogo from '../../assets/logo.png'

interface SplashViewProps {
  onComplete: () => void
}

export function SplashView({ onComplete }: SplashViewProps) {
  const settings = useGameStore(state => state.settings)
  const scanMessage = useGameStore(state => state.scanMessage)
  const updateSettings = useGameStore(state => state.updateSettings)
  const { scan } = useScanner()
  const { language } = useTranslation()
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const [userClickedStart, setUserClickedStart] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [progress, setProgress] = useState(15)
  const [statusText, setStatusText] = useState(
    language === 'de' ? 'Initialisiere Eclipse Engine...' : 'Initializing Eclipse Engine...'
  )
  const [isDone, setIsDone] = useState(false)
  const completedRef = useRef(false)
  
  const finish = () => {
    if (!completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }

  // Local state for the settings when manual start is used
  const [loadSteam, setLoadSteam] = useState(settings.scanUninstalledSteam ?? true)
  const [autoScanSplash, setAutoScanSplash] = useState(settings.autoScanSplash ?? true)

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

  // Universal safety watchdog: NEVER hang on black screen
  useEffect(() => {
    const watchdog = setTimeout(() => {
      finish()
    }, 4500)
    return () => clearTimeout(watchdog)
  }, [])

  useEffect(() => {
    useGameStore.persist.onFinishHydration(() => setHasHydrated(true))
    if (useGameStore.persist.hasHydrated()) {
      setHasHydrated(true)
    }
  }, [])

  // Sync external scan message with progress milestones
  useEffect(() => {
    if (scanMessage) {
      setStatusText(scanMessage)
      if (scanMessage.toLowerCase().includes('steam')) {
        setProgress(prev => Math.max(prev, 55))
      } else if (scanMessage.toLowerCase().includes('epic') || scanMessage.toLowerCase().includes('rockstar')) {
        setProgress(prev => Math.max(prev, 75))
      } else if (scanMessage.toLowerCase().includes('resolv') || scanMessage.toLowerCase().includes('metadata')) {
        setProgress(prev => Math.max(prev, 90))
      }
    }
  }, [scanMessage])

  const doScan = async () => {
    let mounted = true
    abortControllerRef.current = new AbortController()

    try {
      setStatusText(language === 'de' ? 'Scanne Spiel-Manifeste...' : 'Scanning game manifests...')
      setProgress(35)
      
      await new Promise(resolve => setTimeout(resolve, 250))
      if (!mounted) return

      setProgress(65)
      setStatusText(language === 'de' ? 'Synchronisiere Bibliotheken...' : 'Synchronizing libraries...')

      const scanTask = scan({ signal: abortControllerRef.current.signal }).catch(() => {})
      const timeoutTask = new Promise(resolve => setTimeout(resolve, 2500))
      await Promise.race([scanTask, timeoutTask])
      
      if (!mounted) return

      setProgress(100)
      setStatusText(language === 'de' ? 'Bereit • Willkommen' : 'Ready • Welcome')
      setIsDone(true)

      await new Promise(resolve => setTimeout(resolve, 300))
    } catch (e) {
      console.warn('[Splash] Scan error:', e)
    } finally {
      if (mounted) {
        finish()
      }
    }

    return () => {
      mounted = false
    }
  }

  // Start automatically
  useEffect(() => {
    if (hasHydrated) {
      if (settings.autoScanSplash !== false) {
        doScan()
      }
    }
  }, [hasHydrated])

  const handleManualStart = async () => {
    setUserClickedStart(true)
    updateSettings({
      scanUninstalledSteam: loadSteam,
      autoScanSplash: autoScanSplash,
    })
    await doScan()
  }

  const isScanningActive = settings.autoScanSplash !== false || userClickedStart

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-hub-base text-white select-none overflow-hidden"
    >
      {/* ─── Ambient Space Backdrop ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-white/[0.03] rounded-full blur-[80px]" />
        
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

      {/* ─── Main Splash Content ─── */}
      <div className="relative z-10 w-full max-w-[360px] px-6 flex flex-col items-center">
        
        {/* Eclipse Logo with Soft Corona Breathing Glow */}
        <div className="relative mb-6 flex items-center justify-center w-28 h-28">
          <motion.div 
            className="absolute w-24 h-24 rounded-full bg-white/10 pointer-events-none"
            style={{ filter: 'blur(28px)' }}
            animate={{
              scale: [0.95, 1.1, 0.95],
              opacity: [0.35, 0.7, 0.35]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Floating Logo */}
          <motion.div 
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, y: [-2, 2, -2] }}
            transition={{ 
              scale: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.5 },
              y: { duration: 4, repeat: Infinity, ease: 'easeInOut' }
            }}
            className="relative z-10 w-20 h-20 flex items-center justify-center"
          >
            <img 
              src={eclipseLogo} 
              alt="Eclipse Launcher" 
              className="w-18 h-18 object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.9)]" 
            />
          </motion.div>
        </div>

        {/* Brand Typography */}
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
            <span className="text-[10px] font-bold text-white/40 tracking-[0.2em] uppercase">
              Unified Game Library
            </span>
            <span className="text-[10px] font-bold text-white/30">•</span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-white/60 font-mono">
              v1.1.2
            </span>
          </motion.div>
        </div>

        {isScanningActive ? (
          /* ─── State A: Clean Progress Bar & Live Status ─── */
          <div className="w-full space-y-3.5">
            {/* Minimalist Progress Track */}
            <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden relative">
              <motion.div 
                className="absolute left-0 top-0 bottom-0 bg-white rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>

            {/* Status Text & Percentage */}
            <div className="flex items-center justify-between text-xs px-0.5">
              <span className="text-white/60 font-medium tracking-wide truncate max-w-[240px]">
                {statusText}
              </span>
              <span className="text-white/40 font-mono text-[11px] font-semibold flex-shrink-0">
                {progress}%
              </span>
            </div>
          </div>
        ) : (
          /* ─── State B: Manual Launch Screen ─── */
          <div className="w-full space-y-5">
            <div className="bg-hub-surface/40 border border-white/10 rounded-xl p-3.5 space-y-2.5">
              <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={loadSteam} 
                  onChange={e => setLoadSteam(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-0"
                />
                <span>{language === 'de' ? 'Nicht installierte Steam-Spiele laden' : 'Load uninstalled Steam games'}</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={autoScanSplash} 
                  onChange={e => setAutoScanSplash(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-0"
                />
                <span>{language === 'de' ? 'Zukünftig automatisch starten' : 'Always scan automatically'}</span>
              </label>
            </div>

            <button
              onClick={handleManualStart}
              className="w-full py-2.5 bg-white text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] transition-all shadow-md cursor-pointer"
            >
              <Play size={14} className="fill-current" />
              <span>{language === 'de' ? 'Eclipse starten' : 'Launch Eclipse'}</span>
            </button>
          </div>
        )}

      </div>
    </motion.div>
  )
}
