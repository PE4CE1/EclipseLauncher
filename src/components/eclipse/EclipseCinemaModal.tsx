import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '../../store/uiStore'

export function EclipseCinemaModal() {
  const { isEclipseCinemaActive, closeEclipseCinema } = useUIStore()
  const [phase, setPhase] = useState<'approaching' | 'diamond' | 'totality'>('approaching')

  useEffect(() => {
    if (!isEclipseCinemaActive) {
      setPhase('approaching')
      return
    }

    // Phase 1: Approaching Occultation (0s - 3s)
    setPhase('approaching')

    // Phase 2: Diamond Ring Effect (3s - 4.4s)
    const tDiamond = setTimeout(() => {
      setPhase('diamond')
    }, 3000)

    // Phase 3: Perfect Totality & Corona Flare (4.4s - 9.5s)
    const tTotality = setTimeout(() => {
      setPhase('totality')
    }, 4400)

    // Auto-close after full animation completes
    const tClose = setTimeout(() => {
      closeEclipseCinema()
    }, 10000)

    // Keydown listener for Escape
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEclipseCinema()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(tDiamond)
      clearTimeout(tTotality)
      clearTimeout(tClose)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEclipseCinemaActive, closeEclipseCinema])

  if (!isEclipseCinemaActive) return null

  return (
    <AnimatePresence>
      <motion.div
        key="eclipse-cinema-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        onClick={closeEclipseCinema}
        className="fixed inset-0 z-[999999] bg-[#020204] flex items-center justify-center overflow-hidden cursor-pointer select-none"
      >
        {/* ─── Layer 0: Deep Space Star Field ─── */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 45 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.1 + (i % 5) * 0.15 }}
              animate={{
                opacity: [0.15, 0.85, 0.15],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 2.5 + (i % 4),
                repeat: Infinity,
                delay: (i * 0.13) % 3,
                ease: 'easeInOut',
              }}
              style={{
                position: 'absolute',
                top: `${(i * 23) % 100}%`,
                left: `${(i * 37) % 100}%`,
                width: i % 7 === 0 ? 2.5 : 1.5,
                height: i % 7 === 0 ? 2.5 : 1.5,
                borderRadius: '50%',
                backgroundColor: i % 3 === 0 ? '#ffffff' : '#ffd59e',
                boxShadow: i % 7 === 0 ? '0 0 6px rgba(255,255,255,0.8)' : 'none',
              }}
            />
          ))}
        </div>

        {/* ─── Layer 1: Volumetric Solar Corona Heat & Caustic Bloom ─── */}
        <div className="absolute pointer-events-none flex items-center justify-center">
          {/* Ambient Deep Atmospheric Plasma */}
          <motion.div
            animate={{
              scale: phase === 'totality' ? [1, 1.08, 1] : 1,
              opacity: phase === 'totality' ? [0.65, 0.85, 0.65] : 0.4,
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-[500px] h-[500px] md:w-[750px] md:h-[750px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(245,130,32,0.35)_0%,rgba(220,60,10,0.15)_45%,transparent_70%)] filter blur-3xl pointer-events-none"
          />

          {/* Inner Golden Heat Well */}
          <motion.div
            animate={{
              scale: phase === 'totality' ? [1.02, 1.12, 1.02] : 0.95,
              opacity: phase === 'totality' ? [0.8, 1, 0.8] : 0.6,
            }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute w-[360px] h-[360px] md:w-[540px] md:h-[540px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,200,80,0.5)_0%,rgba(240,90,20,0.3)_40%,transparent_70%)] filter blur-2xl pointer-events-none"
          />

          {/* Precision Caustic Solar Halo Ring */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: phase === 'totality' ? 1 : 0.7,
            }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="absolute w-[300px] h-[300px] md:w-[460px] md:h-[460px] rounded-full"
            style={{
              boxShadow:
                '0 0 50px 8px rgba(255, 170, 40, 0.75), 0 0 100px 25px rgba(240, 75, 15, 0.45), inset 0 0 35px rgba(255, 220, 100, 0.4)',
            }}
          >
            {/* Blazing Core Rim */}
            <div className="absolute inset-0 rounded-full border border-yellow-200/90 shadow-[0_0_20px_rgba(255,230,120,0.9)]" />
            <div className="absolute -inset-1 rounded-full border border-orange-400/60 filter blur-[1.5px]" />
          </motion.div>
        </div>

        {/* ─── Layer 2: The Moon Silhouette (Occulting Celestial Orb) ─── */}
        <motion.div
          initial={{ x: '90%', y: '-65%', scale: 0.98 }}
          animate={{ x: '0%', y: '0%', scale: 1 }}
          transition={{ duration: 3.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-[296px] h-[296px] md:w-[454px] md:h-[454px] rounded-full bg-[#010204] z-20 flex items-center justify-center shadow-[inset_0_0_40px_rgba(0,0,0,0.95)]"
        >
          {/* Subtle Silhouette Rim Illumination */}
          <div className="absolute inset-0 rounded-full border border-white/[0.04] pointer-events-none" />

          {/* ─── Layer 3: Diamond Ring Burst (Baily's Beads Phase) ─── */}
          <AnimatePresence>
            {phase === 'diamond' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: [0, 1, 0.9, 0], scale: [0.5, 1.8, 1.4, 0.2] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
                className="absolute -top-3 -right-3 z-40 pointer-events-none"
              >
                {/* Core Photon Bead */}
                <div className="w-8 h-8 rounded-full bg-white shadow-[0_0_40px_15px_rgba(255,255,255,1)]" />

                {/* 4-Point Anamorphic Diffraction Flare Spike */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-[2px] bg-white filter blur-[0.5px] shadow-[0_0_20px_rgba(255,255,255,0.9)] rotate-45" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-[2px] bg-white filter blur-[0.5px] shadow-[0_0_20px_rgba(255,255,255,0.9)] -rotate-45" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-[1px] bg-amber-200/80 filter blur-[1px]" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Layer 4: Cinematic Monochromatic Typography & Specular Shimmer ─── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, letterSpacing: '0.6em' }}
            animate={{
              opacity: phase === 'totality' ? 1 : 0,
              scale: phase === 'totality' ? 1 : 0.95,
              letterSpacing: phase === 'totality' ? '1.4em' : '0.8em',
            }}
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center justify-center z-30 select-none pointer-events-none"
          >
            <div className="relative overflow-hidden pl-4">
              <span className="text-white font-light text-2xl md:text-4xl tracking-[1.4em] drop-shadow-[0_0_25px_rgba(255,255,255,0.7)] font-sans">
                ECLIPSE
              </span>

              {/* Shimmer Specular Light Sweep */}
              <motion.div
                animate={{ x: ['-150%', '250%'] }}
                transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut', delay: 1 }}
                className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)',
                }}
              />
            </div>

            {/* Sub-label */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{
                opacity: phase === 'totality' ? 0.6 : 0,
                y: phase === 'totality' ? 0 : 6,
              }}
              transition={{ duration: 1.2, delay: 0.4 }}
              className="flex items-center gap-2 mt-4"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.5em] text-white/70">
                TOTALITY REACHED
              </span>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* ─── Layer 5: Anamorphic Caustic Light Rays ─── */}
        <AnimatePresence>
          {phase === 'totality' && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, ease: 'easeOut' }}
              className="absolute z-10 pointer-events-none flex items-center justify-center"
            >
              {/* Horizontal Cinematic Core Flare */}
              <div className="w-[700px] md:w-[1300px] h-[2px] bg-gradient-to-r from-transparent via-amber-300/80 to-transparent filter blur-[1px] shadow-[0_0_20px_rgba(255,190,70,0.6)]" />
              <div className="absolute w-[400px] md:w-[800px] h-[6px] bg-gradient-to-r from-transparent via-orange-400/40 to-transparent filter blur-[4px]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Layer 6: Minimalist Dismiss Notice ─── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'totality' ? 0.4 : 0 }}
          transition={{ duration: 1, delay: 2 }}
          className="absolute bottom-8 text-center pointer-events-none"
        >
          <span className="text-[11px] font-medium tracking-widest uppercase text-white/60">
            Click anywhere or press ESC to exit
          </span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
