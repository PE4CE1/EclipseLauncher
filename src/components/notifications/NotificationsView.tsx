import { motion } from 'framer-motion'
import { Bell, RefreshCw, DownloadCloud, Loader2, CheckCircle, Zap, Trash2, CheckCircle2, AlertTriangle, Users } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'

export function NotificationsView() {
  const { 
    updateStatus, updateProgress, updateInfo, 
    notificationHistory, clearNotificationHistory, setIsFriendsOpen 
  } = useUIStore()

  const hasUpdate = updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded' || updateStatus === 'error'
  
  // Try to extract version from updateInfo object
  const newVersion = updateInfo?.version ? `v${updateInfo.version}` : 'New Version'

  return (
    <div className="h-full flex flex-col bg-[#040405] text-hub-text" style={{ backgroundColor: '#040405' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-10 py-8 border-b border-white/5 bg-[#08080a] flex-shrink-0" style={{ backgroundColor: '#08080a' }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] ring-1 ring-white/10">
            <Bell size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Notifications</h1>
            <p className="text-sm text-hub-muted mt-1">Stay up to date with system alerts and updates.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {notificationHistory.length > 0 && (
            <button
              onClick={clearNotificationHistory}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              <Trash2 size={15} />
              Clear History
            </button>
          )}
          <button 
            onClick={() => window.electronAPI?.checkUpdate()}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white shadow-lg"
          >
            <RefreshCw size={16} className={updateStatus === 'checking' ? 'animate-spin text-white' : ''} />
            Check for Updates
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-10 relative bg-[#040405]" style={{ backgroundColor: '#040405' }}>
        <div className="max-w-4xl mx-auto space-y-6 relative z-10">
          
          {updateStatus === 'checking' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-4 p-8 border border-white/10 rounded-3xl bg-hub-surface/50 backdrop-blur-md shadow-2xl"
            >
              <Loader2 size={24} className="text-white animate-spin" />
              <span className="text-base font-semibold text-white/70">Scanning satellite networks for updates...</span>
            </motion.div>
          )}

          {hasUpdate && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group relative bg-hub-surface/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] hover:border-white/20 transition-colors"
            >
              {/* Animated Background flare */}
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/[0.02] rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none group-hover:bg-white/[0.04] transition-all duration-700" />
              <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-white/[0.02] rounded-full blur-[60px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

              <div className="flex flex-col md:flex-row items-start md:items-center gap-8 relative z-10">
                {/* Icon */}
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center text-white flex-shrink-0 border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                  <Zap size={36} className="drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
                </div>
                
                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-black text-white tracking-tight">System Update</h2>
                    <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs font-bold tracking-wider uppercase shadow-[0_0_10px_rgba(255,255,255,0.05)]">
                      {newVersion}
                    </span>
                  </div>
                  <p className="text-sm text-white/50 max-w-lg mb-6 leading-relaxed">
                    A highly anticipated new version of Eclipse Launcher is available. Upgrade now to access new features, performance boosts, and enhanced stability.
                  </p>
                  
                  {/* Action Area */}
                  <div className="w-full">
                    {updateStatus === 'available' && (
                      <button 
                        onClick={() => window.electronAPI?.downloadUpdate()}
                        className="px-8 py-3.5 bg-white hover:bg-gray-200 rounded-xl text-sm font-bold text-black transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] hover:scale-[1.02] flex items-center gap-3"
                      >
                        <DownloadCloud size={18} />
                        Initiate Download
                      </button>
                    )}

                    {updateStatus === 'downloading' && (
                      <div className="w-full max-w-xl bg-black/40 p-5 rounded-2xl border border-white/5 backdrop-blur-sm">
                        <div className="flex items-center justify-between text-sm mb-3">
                          <span className="flex items-center gap-2 font-semibold text-white/80">
                            <Loader2 size={16} className="animate-spin" /> Downloading {newVersion}...
                          </span>
                          <span className="font-mono text-white/60 bg-white/5 px-2 py-0.5 rounded-md">{Math.round(updateProgress)}%</span>
                        </div>
                        <div className="h-2.5 bg-black/60 rounded-full overflow-hidden shadow-inner relative">
                          <motion.div 
                            className="absolute top-0 bottom-0 left-0 bg-white rounded-full"
                            style={{ width: `${updateProgress}%` }}
                            layoutId="downloadBar"
                          >
                            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.2),transparent)] bg-[length:200%_100%] animate-shimmer" />
                          </motion.div>
                        </div>
                      </div>
                    )}

                    {updateStatus === 'downloaded' && (
                      <button 
                        onClick={() => window.electronAPI?.installUpdate()}
                        className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl text-sm font-bold text-white transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] hover:scale-[1.02] flex items-center gap-3"
                      >
                        <CheckCircle size={18} />
                        Install & Reboot
                      </button>
                    )}

                    {updateStatus === 'error' && (
                      <div className="w-full max-w-xl bg-red-950/40 p-5 rounded-2xl border border-red-900/50 backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-sm font-bold text-red-400 mb-2">
                          Update sequence failed. Please verify your connection.
                        </div>
                        {typeof updateInfo === 'string' && (
                          <div className="text-xs font-mono text-red-300/70 bg-black/40 p-3 rounded-xl border border-red-900/30 break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {updateInfo}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Activity / Notification Stream */}
          {notificationHistory.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 px-1">Recent Activity</h3>
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
                            Open Friends
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
              <h3 className="text-xl font-bold text-white mb-2">You're all caught up!</h3>
              <p className="text-sm text-hub-muted text-center max-w-sm">
                No new alerts or system updates at this time. Check back later or use the refresh button.
              </p>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  )
}
