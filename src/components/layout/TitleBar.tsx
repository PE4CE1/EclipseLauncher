import { useState, useEffect } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useUIStore } from '../../store/uiStore'
import { updateFirebasePresence } from '../../services/firebaseService'
// @ts-ignore
import eclipseLogo from '../../assets/logo.png'

const isElectron = !!window.electronAPI

function minimize() { isElectron && window.electronAPI.minimizeWindow() }
function maximize() { isElectron && window.electronAPI.maximizeWindow() }
async function close() {
  if (isElectron) {
    try {
      await updateFirebasePresence('offline', null)
    } catch {}
    window.electronAPI.closeWindow()
  }
}

export function TitleBar() {
  const [isHovered, setIsHovered] = useState(false)
  const [clicks, setClicks] = useState(0)
  const { triggerEclipseCinema, isEclipseCinemaActive } = useUIStore()

  // Reset clicks after 2s of inactivity
  useEffect(() => {
    if (clicks > 0 && clicks < 3 && !isEclipseCinemaActive) {
      const t = setTimeout(() => setClicks(0), 2000)
      return () => clearTimeout(t)
    }
  }, [clicks, isEclipseCinemaActive])

  const handleLogoClick = () => {
    if (isEclipseCinemaActive) return
    const newClicks = clicks + 1
    if (newClicks >= 3) {
      triggerEclipseCinema()
      setClicks(0)
    } else {
      setClicks(newClicks)
    }
  }

  return (
    <div className={`h-8 bg-transparent flex items-center justify-between drag-region flex-shrink-0 z-50 transition-opacity duration-300 ${
      isEclipseCinemaActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
    }`}>
      {/* Left: App branding with Easter Egg */}
      <div className="flex items-center gap-2 no-drag relative px-4">
        <motion.div 
          onClick={handleLogoClick}
          className="w-5 h-5 rounded-md flex items-center justify-center relative overflow-hidden cursor-pointer shadow-[0_0_10px_rgba(255,255,255,0.15)]"
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          animate={{ 
            scale: clicks === 1 ? 1.2 : clicks === 2 ? 1.45 : isHovered ? 1.1 : 1,
            boxShadow: clicks === 1 
              ? '0 0 15px rgba(255,255,255,0.5)' 
              : clicks >= 2 
                ? '0 0 25px rgba(255,200,100,0.8)' 
                : '0 0 10px rgba(255,255,255,0.15)',
          }}
          transition={{ duration: 0.2 }}
        >
          <img src={eclipseLogo} alt="Eclipse Logo" className="w-full h-full object-cover z-10" />
        </motion.div>
        <span className="text-xs font-bold tracking-widest text-white/50 uppercase">
          ECLIPSE
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center no-drag">
        <button
          id="titlebar-minimize"
          onClick={minimize}
          className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          id="titlebar-maximize"
          onClick={maximize}
          className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          id="titlebar-close"
          onClick={close}
          className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500/80 transition-all rounded-none"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
