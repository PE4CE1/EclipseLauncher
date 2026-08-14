import { motion } from 'framer-motion'
import { 
  Play, Pause, X, CheckCircle2, ArchiveRestore, AlertCircle, 
  Download, ArrowDown, HardDrive, Check, Sparkles, FolderOpen 
} from 'lucide-react'
import { useDownloadStore } from '../../store/downloadStore'
import { useTranslation } from '../../hooks/useTranslation'
import { useGameStore } from '../../store/gameStore'

function formatBytes(bytes: number, decimals = 1) {
  if (!+bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function DownloadsView() {
  const downloads = useDownloadStore(state => state.downloads)
  const allDownloads = Object.values(downloads)
  const { t, language } = useTranslation()

  function formatTime(ms: number) {
    if (!ms || ms === Infinity) return t('calculating') || 'Berechne...'
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes} ${t('min')}`
    return `${seconds} ${t('sec')}`
  }
  
  const activeDownloads = allDownloads.filter(d => d.status !== 'done')
  const completedDownloads = allDownloads.filter(d => d.status === 'done')

  const totalSpeed = activeDownloads.reduce((acc, dl) => acc + (dl.downloadSpeed || 0), 0)

  async function handlePauseResume(infoHash: string, isPaused: boolean) {
    if (!window.electronAPI) return
    if (isPaused) {
      await window.electronAPI.resumeDownload(infoHash)
    } else {
      await window.electronAPI.pauseDownload(infoHash)
    }
  }

  async function handleCancel(infoHash: string) {
    if (!window.electronAPI) return
    await window.electronAPI.cancelDownload(infoHash)
    useDownloadStore.getState().removeDownload(infoHash)
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8 bg-transparent text-hub-text">
      {/* ─── Left-Aligned Content Container ─── */}
      <div className="w-full max-w-5xl space-y-9 pb-24">
        
        {/* ─── Top Header & Live Telemetry Bar ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white shadow-sm">
              <Download size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">{t('downloads')}</h1>
              <p className="text-xs text-white/50 mt-0.5">
                {language === 'de' ? 'Aktive Spiel-Downloads, Entpackvorgänge und Historie' : 'Active game downloads, extractions and history'}
              </p>
            </div>
          </div>

          {/* Quick Stats Pills */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-hub-surface/60 border border-white/10 text-xs">
              <ArrowDown size={13} className={totalSpeed > 0 ? "text-emerald-400 animate-bounce" : "text-white/40"} />
              <span className="text-white/50">{t('speed')}</span>
              <span className="font-bold text-white">{formatBytes(totalSpeed)}/s</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-hub-surface/60 border border-white/10 text-xs">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span className="font-semibold text-white">{activeDownloads.length}</span>
              <span className="text-white/50">{t('active')}</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-hub-surface/60 border border-white/10 text-xs">
              <Check size={13} className="text-emerald-400" />
              <span className="font-semibold text-white">{completedDownloads.length}</span>
              <span className="text-white/50">{t('done')}</span>
            </div>
          </div>
        </div>

        {/* ─── ACTIVE DOWNLOADS SECTION ─── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider uppercase text-white/60">
              {t('activeDownloads')}
            </h2>
            {activeDownloads.length > 0 && (
              <span className="text-xs text-white/40 font-medium">
                {activeDownloads.length} {activeDownloads.length === 1 ? t('tasksSingular') : t('tasksPlural')}
              </span>
            )}
          </div>

          {activeDownloads.length === 0 ? (
            <div className="bg-hub-surface/40 border border-white/10 rounded-2xl p-7 flex items-center gap-5">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 flex-shrink-0">
                <Download size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/90">
                  {t('noActiveDownloads')}
                </h3>
                <p className="text-xs text-white/40 mt-1 max-w-xl leading-relaxed">
                  {t('noActiveDownloadsDesc')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {activeDownloads.map((dl) => (
                <div 
                  key={dl.infoHash} 
                  className="group bg-hub-surface/60 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-4.5 flex flex-col gap-3.5 transition-all duration-200 shadow-lg"
                >
                  <div className="flex items-center gap-4">
                    {/* Game Cover Thumbnail */}
                    <div className="w-20 h-16 rounded-xl bg-hub-elevated overflow-hidden flex-shrink-0 relative shadow-md border border-white/10">
                      {dl.coverUrl ? (
                        <img src={dl.coverUrl} alt={dl.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/40 font-bold text-lg">
                          {dl.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    
                    {/* Game Details & Progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-2 h-2 rounded-full ${
                          dl.status === 'downloading' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' :
                          dl.status === 'paused' ? 'bg-amber-400' :
                          dl.status === 'extracting' ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)] animate-pulse' :
                          'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'
                        }`} />
                        <h3 className="font-bold text-white truncate text-sm">{dl.name}</h3>
                        
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ml-1 ${
                          dl.status === 'downloading' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                          dl.status === 'paused' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                          dl.status === 'extracting' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' :
                          'bg-red-500/10 text-red-300 border-red-500/20'
                        }`}>
                          {dl.status === 'downloading' && t('downloading')}
                          {dl.status === 'paused' && t('paused')}
                          {dl.status === 'extracting' && t('extracting')}
                          {dl.status === 'error' && t('error')}
                        </span>

                        {dl.peers !== undefined && dl.status === 'downloading' && (
                          <span className="text-[10px] text-white/50 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded ml-1">
                            {dl.peers} {t('peers')}
                          </span>
                        )}
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden my-2 relative">
                        <motion.div 
                          className={`absolute left-0 top-0 bottom-0 rounded-full ${
                            dl.status === 'error' ? 'bg-red-500' :
                            dl.status === 'extracting' ? 'bg-purple-500' :
                            'bg-white'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(0.5, dl.progress * 100)}%` }}
                          transition={{ ease: "linear", duration: 0.5 }}
                        />
                      </div>
                      
                      {/* Telemetry Stats */}
                      <div className="flex justify-between items-center text-xs font-medium mt-1.5">
                        {dl.status === 'extracting' ? (
                          <div className="flex items-center gap-2 text-purple-300 text-xs">
                            <ArchiveRestore size={14} className="animate-pulse" />
                            <span>{t('extractingGameArchive')}</span>
                          </div>
                        ) : dl.status === 'error' ? (
                          <div className="flex items-center gap-2 text-red-400 text-xs">
                            <AlertCircle size={14} />
                            <span>{t('downloadErrorOccurred')}</span>
                          </div>
                        ) : dl.length === 0 ? (
                          <div className="flex items-center gap-2 text-indigo-300 text-xs">
                            <Sparkles size={14} className="animate-spin text-indigo-400" />
                            <span>{dl.peers && dl.peers > 0 ? (language === 'de' ? `Verbinde mit ${dl.peers} Peers...` : `Connecting to ${dl.peers} peers...`) : (language === 'de' ? 'Suche Peers im Netzwerk & lade Metadaten...' : 'Searching for peers & metadata...')}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3.5 text-white/50 text-xs">
                            <span>{formatBytes(dl.downloaded)} / {formatBytes(dl.length)}</span>
                            <span className="text-white/80 font-semibold">{formatBytes(dl.downloadSpeed)}/s</span>
                            <span>{t('eta')} {formatTime(dl.timeRemaining)}</span>
                          </div>
                        )}
                        <span className="font-bold text-white text-xs">{(dl.progress * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 ml-3">
                      {dl.status !== 'extracting' && dl.status !== 'error' && (
                        <button 
                          onClick={() => handlePauseResume(dl.infoHash, dl.status === 'paused')}
                          className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition-all cursor-pointer"
                          title={dl.status === 'paused' ? t('resume') || 'Fortsetzen' : t('paused')}
                        >
                          {dl.status === 'paused' ? <Play size={13} className="fill-current text-white" /> : <Pause size={13} className="fill-current text-white" />}
                        </button>
                      )}
                      <button 
                        onClick={() => handleCancel(dl.infoHash)}
                        className="w-8 h-8 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 border border-white/10 flex items-center justify-center text-white/60 transition-all cursor-pointer"
                        title={t('cancel')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ─── COMPLETED DOWNLOADS SECTION ─── */}
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider uppercase text-white/60">
              {t('completedDownloadsHeader') || t('completed')}
            </h2>
            {completedDownloads.length > 0 && (
              <span className="text-xs text-white/40 font-medium">
                {completedDownloads.length} {t('gamesCount')}
              </span>
            )}
          </div>

          {completedDownloads.length === 0 ? (
            <div className="bg-hub-surface/30 border border-white/5 rounded-2xl p-6 flex items-center gap-4 text-white/40 text-xs">
              <CheckCircle2 size={16} className="text-white/30 flex-shrink-0" />
              <span>{t('noCompletedDownloadsDesc') || t('noCompletedDownloads')}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {completedDownloads.map((dl) => (
                <div 
                  key={dl.infoHash} 
                  className="group bg-hub-surface/40 hover:bg-hub-surface/70 border border-white/10 hover:border-white/20 rounded-2xl p-3.5 px-4 flex items-center justify-between gap-4 transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-11 rounded-xl bg-hub-elevated overflow-hidden flex-shrink-0 relative border border-white/10">
                      {dl.coverUrl ? (
                        <img src={dl.coverUrl} alt={dl.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/40 font-bold text-sm">
                          {dl.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">{dl.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                        <span>{formatBytes(dl.length)}</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <Check size={11} strokeWidth={3} /> {t('readyToPlayStatus')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {dl.installPath && (
                      <button
                        onClick={() => {
                          if (window.electronAPI?.openPath) {
                            window.electronAPI.openPath(dl.installPath!)
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title={t('openFolder')}
                      >
                        <FolderOpen size={13} />
                        <span>{t('openFolder')}</span>
                      </button>
                    )}

                    {dl.mainExe && (
                      <button
                        onClick={() => {
                          if (window.electronAPI?.launchGame) {
                            window.electronAPI.launchGame(dl.mainExe!)
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white text-black hover:bg-gray-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                      >
                        <Play size={12} className="fill-current" />
                        <span>{t('play')}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleCancel(dl.infoHash)}
                      className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-white/10 flex items-center justify-center transition-colors cursor-pointer"
                      title={t('removeFromList')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
