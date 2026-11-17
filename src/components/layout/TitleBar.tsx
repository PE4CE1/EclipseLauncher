import { useTranslation } from '../../hooks/useTranslation'
import { Minus, Square, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useUIStore } from '../../store/uiStore'
import { QuickAccess } from './QuickAccess'
// @ts-ignore
import eclipseLogo from '../../assets/logo.png'

const isElectron = !!window.electronAPI

function minimize() { isElectron && window.electronAPI.minimizeWindow() }
function maximize() { isElectron && window.electronAPI.maximizeWindow() }
function close() {
  if (isElectron) {
    // Closing can just hide Eclipse to the tray. The app's unload handler owns
    // offline presence, so background recording does not appear offline.
    window.electronAPI.closeWindow()
  }
}

export function TitleBar({ minimal = false }: { minimal?: boolean }) {
  const { t, language } = useTranslation()
  const triggerEclipseCinema = useUIStore(s => s.triggerEclipseCinema)
  const isEclipseCinemaActive = useUIStore(s => s.isEclipseCinemaActive)

  const handleLogoClick = () => {
    if (!minimal && !isEclipseCinemaActive) triggerEclipseCinema()
  }
  const eclipseLabel = language === 'de' ? 'Nächste Sonnenfinsternis anzeigen' : 'View the next eclipse'

  return (
    <div className="h-8 bg-transparent flex items-center justify-between drag-region flex-shrink-0 z-50">
      {/* App branding */}
      <div className="flex items-center gap-2 no-drag relative px-4">
        <motion.button
          type="button"
          disabled={minimal}
          data-eclipse-trigger
          aria-label={eclipseLabel}
          aria-expanded={isEclipseCinemaActive}
          aria-haspopup="dialog"
          data-active={isEclipseCinemaActive || undefined}
          title={eclipseLabel}
          onClick={handleLogoClick}
          className="w-5 h-5 p-0 border-0 bg-transparent rounded-md flex items-center justify-center relative cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-orange-300/60"
          initial={false}
          style={{ boxShadow: isEclipseCinemaActive ? '0 0 16px rgba(239,128,41,0.45)' : 'none' }}
          animate={{ scale: isEclipseCinemaActive ? [1, 1.14, 1] : 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <img src={eclipseLogo} alt="Eclipse Logo" className="w-full h-full object-cover z-10" />
        </motion.button>
        <span className="text-xs font-bold tracking-widest text-white/50 uppercase">
          ECLIPSE
        </span>
        <QuickAccess location="titlebar"/>
      </div>

      {/* Window controls */}
      <div className="flex items-center no-drag">
        <button
          id="titlebar-minimize"
          onClick={minimize}
          className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
          aria-label={t('uiMinimize')}
        >
          <Minus size={14} />
        </button>
        <button
          id="titlebar-maximize"
          onClick={maximize}
          className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
          aria-label={t('uiMaximize')}
        >
          <Square size={12} />
        </button>
        <button
          id="titlebar-close"
          onClick={close}
          className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500/80 transition-all rounded-none"
          aria-label={t('close')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
