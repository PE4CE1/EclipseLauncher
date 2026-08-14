import { motion } from 'framer-motion'
import { 
  Play, Pause, X, CheckCircle2, ArchiveRestore, AlertCircle, 
  Download, ArrowDown, Check, Sparkles, FolderOpen, Gamepad2
} from 'lucide-react'
import { useDownloadStore, TorrentPayload } from '../../store/downloadStore'
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

const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

export function DownloadsView() {
  const downloads = useDownloadStore(state => state.downloads)
  const allDownloads = Object.values(downloads)
  const { t, language } = useTranslation()
  const { library, installedGames } = useGameStore()

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

  // Find best cover art for a download item
  function getDownloadCover(dl: TorrentPayload): string | null {
    if (dl.coverUrl) return dl.coverUrl
    const norm = normalize(dl.name)
    const libMatch = library.find(g => normalize(g.name) === norm || norm.includes(normalize(g.name)) || normalize(g.name).includes(norm))
    if (libMatch?.coverImage) return libMatch.coverImage
    return null
  }

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
    <div className="h-full overflow-y-auto px-8 py-7 bg-transparent text-hub-text select-none">
      {/* ─── Left-Aligned Content Container ─── */}
      <div className="w-full max-w-5xl space-y-8 pb-24">
        
        {/* ─── Header & Telemetry Bar ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white shadow-sm">
              <Download size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">{t('downloads')}</h1>
              <p className="text-[11px] text-white/40 mt-0.5">
                {language === 'de' ? 'Aktive Downloads & Installationen' : 'Active downloads & installations'}
              </p>
            </div>
          </div>

          {/* Quick Stats Pills */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0c0d12]/80 border border-white/[0.06] text-xs">
              <ArrowDown size={12} className={totalSpeed > 0 ? "text-emerald-400 animate-bounce" : "text-white/30"} />
              <span className="text-white/40">{t('speed')}</span>
              <span className="font-semibold text-white">{formatBytes(totalSpeed)}/s</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c0d12]/80 border border-white/[0.06] text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-semibold text-white">{activeDownloads.length}</span>
              <span className="text-white/40">{t('active')}</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c0d12]/80 border border-white/[0.06] text-xs">
              <Check size={12} className="text-emerald-400" />
              <span className="font-semibold text-white">{completedDownloads.length}</span>
              <span className="text-white/40">{t('done')}</span>
            </div>
          </div>
        </div>

        {/* ─── ACTIVE DOWNLOADS SECTION ─── */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold tracking-wider uppercase text-white/50">
              {t('activeDownloads')}
            </h2>
            {activeDownloads.length > 0 && (
              <span className="text-[11px] text-white/30 font-medium">
                {activeDownloads.length} {activeDownloads.length === 1 ? t('tasksSingular') : t('tasksPlural')}
              </span>
            )}
          </div>

          {activeDownloads.length === 0 ? (
            <div className="bg-[#0b0c10]/40 border border-dashed border-white/[0.08] rounded-2xl py-9 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/30 mb-2.5 shadow-inner">
                <Download size={17} />
              </div>
              <h3 className="text-xs font-semibold text-white/80 mb-0.5">
                {t('noActiveDownloads')}
              </h3>
              <p className="text-[11px] text-white/35 max-w-sm leading-relaxed">
                {t('noActiveDownloadsDesc')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDownloads.map((dl) => {
                const cover = getDownloadCover(dl)
                return (
                  <div 
                    key={dl.infoHash} 
                    className="group bg-[#0b0c10]/90 backdrop-blur-xl border border-white/[0.07] hover:border-white/[0.14] rounded-2xl p-3.5 px-4 flex items-center gap-4 transition-all duration-200 shadow-xl"
                  >
                    {/* Game Cover Thumbnail */}
                    <div className="w-20 h-14 rounded-xl bg-[#14161f] overflow-hidden flex-shrink-0 relative border border-white/[0.08] shadow-sm">
                      {cover ? (
                        <img 
                          src={cover} 
                          alt={dl.name} 
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-white/[0.05] to-transparent text-white/30">
                          <Gamepad2 size={18} className="text-white/40 mb-0.5" />
                          <span className="text-[9px] font-bold tracking-wider text-white/40">{dl.name.slice(0, 4)}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Main Information & Progress */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      
                      {/* Title & Status Pills */}
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-bold text-white truncate text-xs tracking-tight">{dl.name}</h3>
                          
                          {/* Status Badge */}
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${
                            dl.status === 'downloading' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            dl.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            dl.status === 'extracting' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20 animate-pulse' :
                            'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              dl.status === 'downloading' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse' :
                              dl.status === 'paused' ? 'bg-amber-400' :
                              dl.status === 'extracting' ? 'bg-purple-400' :
                              'bg-red-400'
                            }`} />
                            {dl.status === 'downloading' && (dl.length === 0 ? (language === 'de' ? 'Verbinde...' : 'Connecting...') : t('downloading'))}
                            {dl.status === 'paused' && t('paused')}
                            {dl.status === 'extracting' && t('extracting')}
                            {dl.status === 'error' && t('error')}
                          </span>

                          {/* Peers count (if applicable) */}
                          {dl.peers !== undefined && dl.peers > 0 && dl.status === 'downloading' && (
                            <span className="text-[10px] text-white/40 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-md flex-shrink-0">
                              {dl.peers} {t('peers')}
                            </span>
                          )}
                        </div>

                        {/* Percentage */}
                        <span className="font-mono font-bold text-white text-xs flex-shrink-0">
                          {(dl.progress * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* Ultra-Clean Progress Bar */}
                      <div className="h-1 w-full bg-white/[0.08] rounded-full overflow-hidden my-1.5 relative">
                        <motion.div 
                          className={`absolute left-0 top-0 bottom-0 rounded-full ${
                            dl.status === 'error' ? 'bg-red-500' :
                            dl.status === 'extracting' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]' :
                            'bg-gradient-to-r from-emerald-400 to-teal-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(0.5, dl.progress * 100)}%` }}
                          transition={{ ease: "linear", duration: 0.3 }}
                        />
                      </div>
                      
                      {/* Telemetry Stats */}
                      <div className="flex justify-between items-center text-[11px] font-medium text-white/40 mt-0.5">
                        {dl.status === 'extracting' ? (
                          <div className="flex items-center gap-1.5 text-purple-300 text-[11px]">
                            <ArchiveRestore size={13} className="animate-pulse" />
                            <span>{t('extractingGameArchive')}</span>
                          </div>
                        ) : dl.status === 'error' ? (
                          <div className="flex items-center gap-1.5 text-red-400 text-[11px]">
                            <AlertCircle size={13} />
                            <span>{t('downloadErrorOccurred')}</span>
                          </div>
                        ) : dl.length === 0 ? (
                          <div className="flex items-center gap-1.5 text-indigo-300 text-[11px]">
                            <Sparkles size={13} className="animate-spin text-indigo-400" />
                            <span>{dl.peers && dl.peers > 0 ? (language === 'de' ? `Verbinde mit ${dl.peers} Peers...` : `Connecting to ${dl.peers} peers...`) : (language === 'de' ? 'Suche Peers im Netzwerk...' : 'Searching peers...')}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span>{formatBytes(dl.downloaded)} / {formatBytes(dl.length)}</span>
                            <span className="text-white/20">•</span>
                            <span className="text-white font-semibold">{formatBytes(dl.downloadSpeed)}/s</span>
                            <span className="text-white/20">•</span>
                            <span>ETA {formatTime(dl.timeRemaining)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Minimalist Action Buttons */}
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      {dl.status !== 'extracting' && dl.status !== 'error' && (
                        <button 
                          onClick={() => handlePauseResume(dl.infoHash, dl.status === 'paused')}
                          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/10 hover:text-white border border-white/[0.08] flex items-center justify-center text-white/60 transition-all cursor-pointer"
                          title={dl.status === 'paused' ? t('resume') || 'Fortsetzen' : t('paused')}
                        >
                          {dl.status === 'paused' ? <Play size={12} className="fill-current text-white" /> : <Pause size={12} className="fill-current text-white" />}
                        </button>
                      )}
                      <button 
                        onClick={() => handleCancel(dl.infoHash)}
                        className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 border border-white/[0.08] flex items-center justify-center text-white/40 transition-all cursor-pointer"
                        title={t('cancel')}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ─── COMPLETED DOWNLOADS SECTION ─── */}
        <section className="space-y-3.5 pt-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold tracking-wider uppercase text-white/50">
              {t('completedDownloadsHeader') || t('completed')}
            </h2>
            {completedDownloads.length > 0 && (
              <span className="text-[11px] text-white/30 font-medium">
                {completedDownloads.length} {t('gamesCount')}
              </span>
            )}
          </div>

          {completedDownloads.length === 0 ? (
            <div className="bg-[#0b0c10]/25 border border-dashed border-white/[0.06] rounded-2xl py-7 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-9 h-9 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-white/20 mb-2">
                <CheckCircle2 size={16} />
              </div>
              <p className="text-[11px] text-white/35">
                {t('noCompletedDownloadsDesc') || t('noCompletedDownloads')}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {completedDownloads.map((dl) => {
                const cover = getDownloadCover(dl)
                return (
                  <div 
                    key={dl.infoHash} 
                    className="group bg-[#0b0c10]/60 hover:bg-[#0b0c10]/90 border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-3 px-3.5 flex items-center justify-between gap-4 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-14 h-10 rounded-lg bg-[#14161f] overflow-hidden flex-shrink-0 relative border border-white/[0.08]">
                        {cover ? (
                          <img src={cover} alt={dl.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-white/[0.04] text-white/40 font-bold text-xs">
                            {dl.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-white text-xs truncate">{dl.name}</h3>
                        <div className="flex items-center gap-2 text-[11px] text-white/30 mt-0.5">
                          <span>{formatBytes(dl.length)}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <Check size={10} strokeWidth={3} /> {t('readyToPlayStatus')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dl.installPath && (
                        <button
                          onClick={() => {
                            if (window.electronAPI?.openPath) {
                              window.electronAPI.openPath(dl.installPath!)
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/60 hover:text-white border border-white/[0.08] text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          title={t('openFolder')}
                        >
                          <FolderOpen size={12} />
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
                          className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-gray-100 text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                        >
                          <Play size={11} className="fill-current" />
                          <span>{t('play')}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleCancel(dl.infoHash)}
                        className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/30 hover:text-white border border-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
                        title={t('removeFromList')}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
