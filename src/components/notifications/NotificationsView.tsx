import { useTranslation } from '../../hooks/useTranslation'
import { motion } from 'framer-motion'
import { Bell, RefreshCw, Loader2, Trash2, CheckCircle2, AlertTriangle, Users } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { UpdateCard } from '../updates/UpdateCard'

export function NotificationsView() {
  const { t, language } = useTranslation()
  const updateStatus = useUIStore(s => s.updateStatus)
  const updateProgress = useUIStore(s => s.updateProgress)
  const updateInfo = useUIStore(s => s.updateInfo)
  const notificationHistory = useUIStore(s => s.notificationHistory)
  const clearNotificationHistory = useUIStore(s => s.clearNotificationHistory)
  const setIsFriendsOpen = useUIStore(s => s.setIsFriendsOpen)

  const hasUpdate = updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded' || updateStatus === 'error'
  
  return (
    <div className="notifications-update-view launcher-page-surface h-full flex flex-col bg-[#040405] text-hub-text">
      {/* Header */}
      <div className="launcher-toolbar flex items-center justify-between px-10 py-8 border-b border-white/5 bg-[#08080a] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] ring-1 ring-white/10">
            <Bell size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('notificationsTab')}</h1>
            <p className="text-sm text-hub-muted mt-1">{t('uiNotificationsIntro')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {notificationHistory.length > 0 && (
            <button
              onClick={clearNotificationHistory}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              <Trash2 size={15} />

              {t('uiClearHistory')}
            </button>
          )}
          <button 
            onClick={() => window.electronAPI?.checkUpdate()}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white shadow-lg"
          >
            <RefreshCw size={16} className={updateStatus === 'checking' ? 'animate-spin text-white' : ''} />

            {t('uiCheckUpdates')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="view-scroll launcher-page-surface flex-1 overflow-y-auto p-10 relative bg-[#040405]">
        <div className="max-w-4xl mx-auto space-y-6 relative z-10">
          
          {updateStatus === 'checking' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-4 p-8 border border-white/10 rounded-3xl launcher-card bg-[var(--launcher-card,#0a0a0c80)] backdrop-blur-md shadow-2xl"
            >
              <Loader2 size={24} className="text-white animate-spin" />
              <span className="text-base font-semibold text-white/70">{t('uiCheckingUpdates')}</span>
            </motion.div>
          )}

          {hasUpdate && <UpdateCard
            language={language}
            status={updateStatus as 'available' | 'downloading' | 'downloaded' | 'error'}
            version={updateInfo?.version}
            notes={updateInfo?.releaseNotes}
            publishedAt={updateInfo?.releaseDate}
            progress={updateProgress}
            error={typeof updateInfo === 'string' ? updateInfo : updateInfo?.error}
            onDownload={async () => {
              if (!window.electronAPI?.downloadUpdate) throw new Error(language === 'de' ? 'Updates sind nur in der Desktop-App verfügbar.' : 'Updates are only available in the desktop app.')
              return window.electronAPI.downloadUpdate()
            }}
            onInstall={async () => {
              if (!window.electronAPI?.installUpdate) throw new Error(language === 'de' ? 'Bitte Eclipse neu starten.' : 'Please restart Eclipse.')
              return window.electronAPI.installUpdate()
            }}
          />}

          {/* Activity / Notification Stream */}
          {notificationHistory.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 px-1">{t('uiRecentActivity')}</h3>
              <div className="space-y-2">
                {notificationHistory.map((item) => {
                  const isFriendReq = item.title?.toLowerCase().includes('freund') || item.title?.toLowerCase().includes('friend')
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-[#0a0a0f] border border-white/[0.08] flex items-center justify-between gap-4 transition-colors hover:border-white/20 shadow-sm"
                      style={{ backgroundColor: '#0a0a0f' }}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-white">
                          {item.type === 'success' ? (
                            <CheckCircle2 size={18} className="text-emerald-400" />
                          ) : item.type === 'error' ? (
                            <AlertTriangle size={18} className="text-red-400" />
                          ) : isFriendReq ? (
                            <Users size={18} className="text-white" />
                          ) : (
                            <Bell size={18} className="text-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                          <p className="text-xs text-white/60 mt-0.5 truncate">{item.message}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-white/40 font-mono">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isFriendReq && (
                          <button
                            onClick={() => {
                              if ((window as any).electronAPI?.openFriendsWindow) {
                                (window as any).electronAPI.openFriendsWindow()
                              } else {
                                setIsFriendsOpen(true)
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
                          >

                            {t('uiOpenFriends')}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}

          {!hasUpdate && updateStatus !== 'checking' && notificationHistory.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col items-center justify-center h-80 border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.01]"
            >
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <Bell size={32} className="text-hub-muted" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{t('uiCaughtUp')}</h3>
              <p className="text-sm text-hub-muted text-center max-w-sm">

                {t('uiNoNotifications')}
              </p>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  )
}
