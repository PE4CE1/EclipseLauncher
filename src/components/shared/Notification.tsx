import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Bell, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'

export function Notification() {
  const { notification, clearNotification } = useUIStore()
  const { t } = useTranslation()

  const icons = {
    success: <CheckCircle2 size={16} className="text-white" />,
    error:   <AlertTriangle size={16} className="text-red-400" />,
    info:    <Bell size={16} className="text-white" />,
  }

  const durationSec = (notification?.duration || 5000) / 1000

  return (
    <aside aria-label="Notifications" className="fixed bottom-6 right-6 z-[99999] pointer-events-none">
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
            initial={{ opacity: 0, y: 16, x: 10, scale: 0.94, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ 
              opacity: 0, 
              x: 32, 
              scale: 0.92, 
              filter: 'blur(8px)',
              transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } 
            }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto relative overflow-hidden bg-hub-surface/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-4 min-w-[320px] max-w-[390px] cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-start gap-3.5">
              {/* Icon Badge */}
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
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

              {/* Close Button with Smooth Rotation & Scale Micro-Animation */}
              <motion.button
                whileHover={{ scale: 1.15, rotate: 90, backgroundColor: 'rgba(255, 255, 255, 0.12)' }}
                whileTap={{ scale: 0.85, rotate: -45 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                onClick={clearNotification}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white/40 hover:text-white transition-colors flex-shrink-0 cursor-pointer"
                aria-label="Schließen"
              >
                <X size={14} />
              </motion.button>
            </div>

            {/* Bottom Duration Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5 overflow-hidden">
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
    </aside>
  )
}
