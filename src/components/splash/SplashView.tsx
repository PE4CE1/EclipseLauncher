import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Play } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useTranslation } from '../../hooks/useTranslation'
// @ts-ignore
import eclipseLogo from '../../assets/logo.png'

interface SplashViewProps {
  onComplete: () => void
}

function getInitialAutoScan(): boolean {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('eclipse-game-store') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.state?.settings?.autoScanSplash !== undefined) {
        return !!parsed.state.settings.autoScanSplash
      }
    }
  } catch {}
  return true // Default: Auto-scan is ON
}

function getInitialScanSteam(): boolean {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('eclipse-game-store') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.state?.settings?.scanUninstalledSteam !== undefined) {
        return !!parsed.state.settings.scanUninstalledSteam
      }
    }
  } catch {}
  return true
}

export function SplashView({ onComplete }: SplashViewProps) {
  const updateSettings = useGameStore(state => state.updateSettings)
  const scanMessage = useGameStore(state => state.scanMessage)
  const { scan } = useScanner()
  const { language } = useTranslation()

  const [autoScanEnabled] = useState(getInitialAutoScan)
  const [userClickedStart, setUserClickedStart] = useState(false)
  const [progress, setProgress] = useState(15)
  const [statusText, setStatusText] = useState(
    language === 'de' ? 'Initialisiere Eclipse Engine...' : 'Initializing Eclipse Engine...'
  )
  const [isDone, setIsDone] = useState(false)
  const isFinishedRef = useRef(false)

  // Local settings toggles for manual start mode
  const [loadSteam, setLoadSteam] = useState(getInitialScanSteam)
  const [autoScanSplash, setAutoScanSplash] = useState(getInitialAutoScan)

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

  // Sync external scanner messages if provided
  useEffect(() => {
    if (scanMessage && !isDone) {
      setStatusText(scanMessage)
    }
  }, [scanMessage, isDone])

  const runProgressSequence = async () => {
    const abortController = new AbortController()

    // 1. Initial stage (0.35s)
    await new Promise(r => setTimeout(r, 350))
    setProgress(32)
    setStatusText(language === 'de' ? 'Scanne installierte Spiele & Manifeste...' : 'Scanning game manifests...')

    // Run parallel scan
    scan({ signal: abortController.signal }).catch(() => {})

    // 2. Library sync stage (0.55s)
    await new Promise(r => setTimeout(r, 550))
    setProgress(68)
    setStatusText(language === 'de' ? 'Synchronisiere Bibliotheken & Metadaten...' : 'Synchronizing libraries & metadata...')

    // 3. Database optimization stage (0.55s)
    await new Promise(r => setTimeout(r, 550))
    setProgress(92)
    setStatusText(language === 'de' ? 'Optimiere Cache & Oberflächen...' : 'Optimizing cache & interface...')

    // 4. Ready stage (0.45s)
    await new Promise(r => setTimeout(r, 450))
    setProgress(100)
    setIsDone(true)
    setStatusText(language === 'de' ? 'Bereit • Willkommen' : 'Ready • Welcome')

    // 5. Short hold for satisfaction then smooth exit
    await new Promise(r => setTimeout(r, 400))
    finish()
  }

  // Auto-Start immediately from frame 0 if auto-scan is active
  useEffect(() => {
    if (autoScanEnabled) {
      runProgressSequence()
    }
  }, [])

  const handleManualStart = async () => {
    setUserClickedStart(true)
    updateSettings({
      scanUninstalledSteam: loadSteam,
      autoScanSplash: autoScanSplash,
    })
    await runProgressSequence()
  }

  const isScanningActive = autoScanEnabled || userClickedStart

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[99999] flex items-center justify-center splash-screen-overlay text-white select-none overflow-hidden"
      style={{ backgroundColor: '#040405' }}
    >
      {/* ─── Ambient Space Backdrop ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] bg-white/[0.03] rounded-full blur-[100px]" />
        
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

      {/* ─── Main Splash Content Container ─── */}
      <div className="relative z-10 w-full max-w-[380px] px-6 flex flex-col items-center">
        
        {/* Floating Eclipse Logo with Corona Glow */}
        <div className="relative mb-5 flex items-center justify-center w-28 h-28">
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
        <div className="text-center mb-7">
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
              v1.1.6
            </span>
          </motion.div>
        </div>

        <AnimatePresence mode="wait">
          {isScanningActive ? (
            /* ─── State 1: Active Progress & Loading Animation ─── */
            <motion.div 
              key="scanning"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full space-y-3.5"
            >
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
                <div className="flex items-center gap-2 max-w-[280px]">
                  {isDone ? (
                    <Check size={13} className="text-white flex-shrink-0" />
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
            </motion.div>
          ) : (
            /* ─── State 2: Interactive Configuration Screen ─── */
            <motion.div 
              key="manual-options"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full space-y-3"
            >
              {/* Option 1: Load Steam Library */}
              <label className="flex items-start p-3 rounded-xl bg-[#0c0d12] hover:bg-[#12141a] border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-150 group">
                <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center mr-3 transition-colors flex-shrink-0 ${
                  loadSteam ? 'bg-white text-black' : 'bg-transparent border border-white/30 group-hover:border-white/50'
                }`}>
                  {loadSteam && <Check size={11} className="stroke-[3]" />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={loadSteam} 
                  onChange={(e) => setLoadSteam(e.target.checked)} 
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 group-hover:text-white transition-colors">
                    {language === 'de' ? 'Steam-Bibliothek laden' : 'Load Steam Library'}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {language === 'de' ? 'Nicht installierte Spiele einschließen' : 'Include uninstalled games'}
                  </p>
                </div>
              </label>

              {/* Option 2: Always Scan Automatically */}
              <label className="flex items-start p-3 rounded-xl bg-[#0c0d12] hover:bg-[#12141a] border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-150 group">
                <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center mr-3 transition-colors flex-shrink-0 ${
                  autoScanSplash ? 'bg-white text-black' : 'bg-transparent border border-white/30 group-hover:border-white/50'
                }`}>
                  {autoScanSplash && <Check size={11} className="stroke-[3]" />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={autoScanSplash} 
                  onChange={(e) => setAutoScanSplash(e.target.checked)} 
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 group-hover:text-white transition-colors">
                    {language === 'de' ? 'Zukünftig automatisch starten' : 'Always scan automatically'}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {language === 'de' ? 'Diesen Screen beim nächsten Start überspringen' : 'Skip options on next launch'}
                  </p>
                </div>
              </label>

              {/* Launch Button */}
              <button
                onClick={handleManualStart}
                className="w-full mt-2 py-3 bg-white hover:bg-white/90 active:scale-[0.99] text-black rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] cursor-pointer"
              >
                <Play size={13} className="fill-black text-black" />
                <span>{language === 'de' ? 'Eclipse starten' : 'Launch Eclipse'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  )
}
