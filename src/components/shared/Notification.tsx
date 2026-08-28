import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Bell, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { createPortal } from 'react-dom'

export function Notification() {
  const { notification, clearNotification } = useUIStore()
  const { t } = useTranslation()

  const icons = {
    success: <CheckCircle2 size={16} className="text-emerald-400" />,
    error:   <AlertTriangle size={16} className="text-red-400" />,
    info:    <Bell size={16} className="text-blue-400" />,
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
            className="pointer-events-auto relative rounded-2xl bg-[#0e1017] border border-white/[0.12] shadow-2xl p-4 min-w-[320px] max-w-[390px] cursor-grab active:cursor-grabbing overflow-hidden"
          >
            <div className="flex items-start gap-3.5">
              {/* Icon Badge */}
              <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-inner">
                {icons[notification.type]}
              </div>

              {/* Text Info */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[11px] font-bold tracking-wider uppercase text-white/90">
                    {notification.title || 'Eclipse Launcher'}
                  </h3>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  <span className="text-[10px] text-white/40 font-medium">{t('justNow') || 'Just now'}</span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed font-medium mt-1 select-none break-words">
                  {notification.message}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={clearNotification}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer"
                aria-label="Schließen"
              >
                <X size={14} />
              </button>
            </div>

            {/* Bottom Duration Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
              <motion.div
                key={notification.message + '-progress'}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: durationSec, ease: 'linear' }}
                className="h-full bg-white/30"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}
