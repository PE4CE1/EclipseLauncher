import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Bell, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { createPortal } from 'react-dom'

export function Notification() {
  const { notification, clearNotification } = useUIStore()
  const { t } = useTranslation()

  const icons = {
    success: <CheckCircle2 size={15} className="text-emerald-400" />,
    error:   <AlertTriangle size={15} className="text-rose-400" />,
    info:    <Bell size={15} className="text-white/90" />,
  }

  const durationSec = (notification?.duration || 5000) / 1000

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[999999] pointer-events-none select-none">
      <AnimatePresence mode="wait">
        {notification && (
          <motion.div
            key={notification.message + (notification.title || '')}
            id="toast-notification"
            drag="x"
            dragConstraints={{ left: 0, right: 120 }}
            dragElastic={{ left: 0.05, right: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 50 || info.velocity.x > 250) {
                clearNotification()
              }
            }}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-auto relative rounded-xl bg-[#08080b] border border-white/[0.09] shadow-[0_16px_48px_rgba(0,0,0,0.98)] p-3.5 min-w-[300px] max-w-[380px] cursor-grab active:cursor-grabbing overflow-hidden"
            style={{ backgroundColor: '#08080b' }}
          >
            <div className="flex items-start gap-3">
              {/* Icon Badge */}
              <div className="w-8 h-8 rounded-lg bg-black/80 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-inner">
                {icons[notification.type]}
              </div>

              {/* Text Info */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[10px] font-bold tracking-wider uppercase text-white/90">
                    {notification.title || 'Eclipse Launcher'}
                  </h3>
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span className="text-[10px] text-white/40 font-medium">{t('justNow') || 'Just now'}</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed font-normal mt-0.5 select-none break-words">
                  {notification.message}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={clearNotification}
                className="w-5 h-5 rounded-md flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer -mr-1 -mt-0.5"
                aria-label="Schließen"
              >
                <X size={13} />
              </button>
            </div>

            {/* Bottom Duration Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-white/[0.04]">
              <motion.div
                key={notification.message + '-progress'}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: durationSec, ease: 'linear' }}
                className="h-full bg-white/25"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}
