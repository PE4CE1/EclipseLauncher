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
  
  // Local state for the settings when manual start is used
  const [loadSteam, setLoadSteam] = useState(settings.scanUninstalledSteam ?? true)
  const [autoScanSplash, setAutoScanSplash] = useState(settings.autoScanSplash ?? true)

  // Minimal, subtle ambient stars (organically scattered)
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

  useEffect(() => {
    useGameStore.persist.onFinishHydration(() => setHasHydrated(true))
    setHasHydrated(useGameStore.persist.hasHydrated())
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

    setStatusText(language === 'de' ? 'Scanne Spiel-Manifeste...' : 'Scanning game manifests...')
    setProgress(35)
    
    await new Promise(resolve => setTimeout(resolve, 350))
    if (!mounted) return

    setProgress(65)
    setStatusText(language === 'de' ? 'Synchronisiere Bibliotheken...' : 'Synchronizing libraries...')

    await scan({ signal: abortControllerRef.current.signal })
    if (!mounted) return

    setProgress(100)
    setStatusText(language === 'de' ? 'Bereit • Willkommen' : 'Ready • Welcome')
    setIsDone(true)

    // Brief smooth hold for completion
    await new Promise(resolve => setTimeout(resolve, 400))
    if (mounted) {
      onComplete()
    }

    return () => {
      mounted = false
    }
  }

  // Start automatically if setting is enabled and hydrated
  useEffect(() => {
    if (hasHydrated && settings.autoScanSplash) {
      const cleanup = doScan()
      return () => {
        if (abortControllerRef.current) abortControllerRef.current.abort()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated])

  const handleManualStart = async () => {
    setUserClickedStart(true)
    
    updateSettings({
      scanUninstalledSteam: loadSteam,
      autoScanSplash: autoScanSplash,
    })
    
    await doScan()
  }

  const isScanningActive = !hasHydrated || settings.autoScanSplash || userClickedStart

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-hub-base text-white select-none overflow-hidden"
    >
      {/* ─── Ambient Space Backdrop ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Soft neutral glow centered behind logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-white/[0.03] rounded-full blur-[80px]" />
        
        {/* Subtle twinkling stars */}
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
            <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
              Launcher
            </span>
            <span className="text-white/20 text-[10px]">•</span>
            <span className="text-[10px] font-medium tracking-wider text-white/40 font-mono">
              v1.1.2
            </span>
          </motion.div>
        </div>

        {/* ─── State 1: Scanning Progress ─── */}
        {isScanningActive ? (
          <div className="w-full flex flex-col items-center">
            
            {/* Smooth Spring Progress Track */}
            <div className="w-full h-1 rounded-full bg-white/10 relative overflow-hidden mb-3">
              <motion.div 
                className="h-full rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 50, damping: 15 }}
              />
            </div>

            {/* Status Information Row */}
            <div className="w-full flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2 max-w-[80%]">
                {isDone ? (
                  <Check size={13} className="text-white flex-shrink-0" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                )}
                <span className="text-xs font-medium text-white/60 truncate">
                  {statusText}
                </span>
              </div>
              <span className="text-xs font-mono font-medium text-white/40">
                {progress}%
              </span>
            </div>
          </div>
        ) : (
          /* ─── State 2: Clean Minimalist Start Options ─── */
          <div className="w-full space-y-3">
            <label className="flex items-center p-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 cursor-pointer transition-colors">
              <div className={`w-5 h-5 rounded flex items-center justify-center mr-3.5 transition-colors ${
                loadSteam ? 'bg-white' : 'bg-transparent border border-white/25'
              }`}>
                {loadSteam && <Check size={13} className="text-black stroke-[3]" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={loadSteam} 
                onChange={(e) => setLoadSteam(e.target.checked)} 
              />
              <div className="flex-1">
                <p className="text-xs font-semibold text-white">
                  {language === 'de' ? 'Steam-Bibliothek laden' : 'Load Steam Library'}
                </p>
                <p className="text-[11px] text-white/40">
                  {language === 'de' ? 'Nicht installierte Spiele einschließen' : 'Include uninstalled games'}
                </p>
              </div>
            </label>

            <label className="flex items-center p-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 cursor-pointer transition-colors">
              <div className={`w-5 h-5 rounded flex items-center justify-center mr-3.5 transition-colors ${
                autoScanSplash ? 'bg-white' : 'bg-transparent border border-white/25'
              }`}>
                {autoScanSplash && <Check size={13} className="text-black stroke-[3]" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={autoScanSplash} 
                onChange={(e) => setAutoScanSplash(e.target.checked)} 
              />
              <div className="flex-1">
                <p className="text-xs font-semibold text-white">
                  {language === 'de' ? 'Automatisch starten' : 'Always Auto-Start'}
                </p>
                <p className="text-[11px] text-white/40">
                  {language === 'de' ? 'Diesen Screen beim nächsten Start überspringen' : 'Skip this screen on next launch'}
                </p>
              </div>
            </label>

            <button
              onClick={handleManualStart}
              className="w-full mt-2 py-3 bg-white hover:bg-white/90 text-black rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-[0.99] cursor-pointer"
            >
              <Play size={13} className="fill-black text-black" />
              {language === 'de' ? 'Eclipse starten' : 'Launch Eclipse'}
            </button>
          </div>
        )}

      </div>
    </motion.div>
  )
}
