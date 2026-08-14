import { useState, useMemo, useEffect, useDeferredValue } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download as DownloadIcon, X, ChevronDown, Check, ArrowLeft, Zap, ShieldCheck, RefreshCw } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useGameStore } from '../../store/gameStore'

function formatDateString(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function isRecentDate(dateStr?: string): boolean {
  if (!dateStr) return false
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return false
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    return d.getTime() > thirtyDaysAgo
  } catch {
    return false
  }
}

interface DownloadOption {
  title: string;
  sourceName: string;
  fileSize?: string;
  uploadDate?: string;
  uris: string[];
}

interface DownloadOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameName: string;
  downloads: DownloadOption[];
  onDownload: (uri: string, title: string, path: string, isHttp: boolean, autoExtract: boolean, autoDelete?: boolean) => void;
}

export function DownloadOptionsModal({ isOpen, onClose, gameName, downloads = [], onDownload }: DownloadOptionsModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedDownload, setSelectedDownload] = useState<DownloadOption | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const { t, language } = useTranslation()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<string>('all')

  const { settings } = useGameStore()

  // Step 2 States
  const [selectedDownloader, setSelectedDownloader] = useState<string>('')
  const [downloadPath, setDownloadPath] = useState(settings.downloadPath || 'C:\\Downloads')
  const [autoExtract, setAutoExtract] = useState(settings.autoExtractArchive ?? true)
  const [autoDelete, setAutoDelete] = useState(settings.autoDeleteArchive ?? false)

  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [linkStatuses, setLinkStatuses] = useState<Record<string, boolean | 'loading'>>({})

  // Fetch real Windows Downloads folder if not set
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setSelectedDownload(null)
      setLinkStatuses({})
      setIsStarting(false)

      if (!settings.downloadPath && window.electronAPI?.getDefaultDownloadPath) {
        window.electronAPI.getDefaultDownloadPath().then((p: string) => {
          if (p) setDownloadPath(p)
        }).catch(() => {})
      } else if (settings.downloadPath) {
        setDownloadPath(settings.downloadPath)
      }
    }
  }, [isOpen, settings.downloadPath])

  useEffect(() => {
    if (!isOpen) {
      setIsStarting(false)
    }
  }, [isOpen, step])

  const safeDownloads = Array.isArray(downloads) ? downloads : []

  const uniqueSources = useMemo(() => {
    const sources = new Set(safeDownloads.map(d => d?.sourceName).filter(Boolean))
    return Array.from(sources)
  }, [safeDownloads])

  // Optimized sorting & filtering
  const sortedAndFilteredDownloads = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    
    let result = safeDownloads.filter(d => {
      if (!d || !d.title) return false
      const matchesSearch = !query || d.title.toLowerCase().includes(query)
      const matchesSource = selectedSource === 'all' || d.sourceName === selectedSource
      return matchesSearch && matchesSource
    })
    
    result.sort((a, b) => {
      const dateA = a.uploadDate || ''
      const dateB = b.uploadDate || ''
      return dateB.localeCompare(dateA)
    })
    
    return result;
  }, [safeDownloads, deferredSearchQuery, selectedSource])

  const availableDownloaders = useMemo(() => {
    if (!selectedDownload || !Array.isArray(selectedDownload.uris)) return [];
    const hosters: { id: string; type: string; badge: string; color: string; speedPriority: number }[] = [];
    
    selectedDownload.uris.forEach(uri => {
      try {
        if (!uri) return;
        if (uri.startsWith('magnet:')) {
          hosters.push({ 
            id: uri, 
            type: 'BitTorrent (P2P)', 
            badge: '🧲 BitTorrent', 
            color: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]', 
            speedPriority: 10 
          });
        } else {
          const url = new URL(uri);
          const host = url.hostname.replace('www.', '');
          
          if (host.includes('pixeldrain.com')) {
            hosters.push({ id: uri, type: 'PixelDrain', badge: '⚡ Highspeed Direct', color: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]', speedPriority: 1 });
          } else if (host.includes('gofile.io')) {
            hosters.push({ id: uri, type: 'Gofile', badge: '⚡ Highspeed CDN', color: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]', speedPriority: 2 });
          } else if (host.includes('qiwi.gg')) {
            hosters.push({ id: uri, type: 'Qiwi', badge: '⚡ Direct CDN', color: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]', speedPriority: 3 });
          } else if (host.includes('buzzheavier.com')) {
            hosters.push({ id: uri, type: 'Buzzheavier', badge: '⚡ Direct Stream', color: 'bg-amber-500', speedPriority: 4 });
          } else if (host.includes('datanodes.to')) {
            hosters.push({ id: uri, type: 'DataNodes', badge: '⚡ Direct Mirror', color: 'bg-indigo-500', speedPriority: 5 });
          } else if (host.includes('1fichier.com')) {
            hosters.push({ id: uri, type: '1Fichier', badge: settings.realDebridKey || settings.torboxKey ? '👑 Debrid Highspeed' : 'Cloud Hoster', color: 'bg-orange-500', speedPriority: 6 });
          } else if (host.includes('mediafire.com')) {
            hosters.push({ id: uri, type: 'MediaFire', badge: 'Direct CDN', color: 'bg-blue-400', speedPriority: 7 });
          } else if (host.includes('megaup.net')) {
            hosters.push({ id: uri, type: 'MegaUp', badge: 'Mirror', color: 'bg-teal-500', speedPriority: 8 });
          } else {
            const typeName = host.charAt(0).toUpperCase() + host.slice(1).split('.')[0];
            hosters.push({ id: uri, type: typeName, badge: 'Direct Mirror', color: 'bg-gray-400', speedPriority: 9 });
          }
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    });

    hosters.sort((a, b) => a.speedPriority - b.speedPriority);
    return hosters;
  }, [selectedDownload, settings.realDebridKey, settings.torboxKey]);

  useEffect(() => {
    if (step === 2 && availableDownloaders.length > 0) {
      setSelectedDownloader(availableDownloaders[0].id);
    }
  }, [step, availableDownloaders])

  // Check link statuses when step 2 opens
  useEffect(() => {
    if (step === 2 && availableDownloaders.length > 0) {
      availableDownloaders.forEach(async (hoster) => {
        if (!hoster.id.startsWith('magnet:') && !linkStatuses[hoster.id] && linkStatuses[hoster.id] !== false) {
          setLinkStatuses(prev => ({ ...prev, [hoster.id]: 'loading' }))
          if (window.electronAPI) {
            const isOnline = await window.electronAPI.checkLinkStatus(hoster.id)
            setLinkStatuses(prev => ({ ...prev, [hoster.id]: isOnline }))
          } else {
            setLinkStatuses(prev => ({ ...prev, [hoster.id]: true }))
          }
        } else if (hoster.id.startsWith('magnet:')) {
          setLinkStatuses(prev => ({ ...prev, [hoster.id]: true }))
        }
      })
    }
  }, [step, availableDownloaders])

  if (!isOpen) return null

  function handleSelectRepack(dl: DownloadOption) {
    setSelectedDownload(dl)
    setStep(2)
  }

  function handleStartDownload() {
    if (isStarting) return
    if (selectedDownload && selectedDownloader) {
      setIsStarting(true)
      const isHttp = !selectedDownloader.startsWith('magnet:')
      onDownload(selectedDownloader, selectedDownload.title, downloadPath, isHttp, autoExtract, autoDelete)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="bg-[#111317] border border-white/10 rounded-2xl w-full max-w-2xl flex flex-col relative z-10 shadow-2xl overflow-hidden h-[75vh] max-h-[700px]"
        onClick={e => e.stopPropagation()}
      >
        {step === 1 && (
          <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="p-6 pb-4 border-b border-white/[0.08] flex items-start justify-between flex-shrink-0 bg-[#111317]">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white mb-0.5">{t('downloadOptions')}</h2>
                  <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/30 flex items-center gap-1">
                    <ShieldCheck size={11} /> {t('nativeInstaller')}
                  </span>
                </div>
                <p className="text-xs font-medium text-hub-muted truncate">{gameName} · {sortedAndFilteredDownloads.length} {t('chooseRepack')}</p>
              </div>
              <button 
                onClick={onClose}
                className="text-hub-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-4 px-6 flex gap-3 items-center bg-[#15171c] border-b border-white/[0.06] flex-shrink-0">
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  placeholder={t('filterRepacks')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0b0c0e] border border-white/10 rounded-xl py-2 px-3.5 text-xs text-white placeholder-hub-muted/60 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              <div className="relative flex-shrink-0">
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="appearance-none bg-[#0b0c0e] border border-white/10 rounded-xl py-2 pl-3.5 pr-8 text-xs font-medium text-white/90 focus:outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
                >
                  <option value="all">{t('filterBySource')}</option>
                  {uniqueSources.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hub-muted pointer-events-none opacity-60" />
              </div>
            </div>

            {/* Repack Items List */}
            <div className="flex-1 overflow-y-auto p-4 px-6 space-y-2.5 custom-scrollbar min-h-0">
              {sortedAndFilteredDownloads.length === 0 ? (
                <div className="h-full flex items-center justify-center text-hub-muted text-sm p-8">
                  {t('noMatchingRepacks')}
                </div>
              ) : (
                sortedAndFilteredDownloads.map((dl, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleSelectRepack(dl)}
                    className="group relative bg-[#16181d] hover:bg-[#1c1f26] border border-white/[0.06] hover:border-indigo-500/40 rounded-xl p-3.5 cursor-pointer transition-all duration-150 flex items-center justify-between shadow-sm"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="font-semibold text-xs text-white/90 group-hover:text-white truncate">{dl.title}</h3>
                        {isRecentDate(dl.uploadDate) && (
                          <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
                            {t('new')}
                          </span>
                        )}
                      </div>
                      
                      <div className="text-[11px] text-hub-muted/70 flex items-center gap-2 font-medium flex-wrap">
                        {dl.fileSize && (
                          <span className="text-indigo-300/90 font-semibold px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                            {dl.fileSize}
                          </span>
                        )}
                        {dl.sourceName && (
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/80">
                            {dl.sourceName}
                          </span>
                        )}
                        {dl.uploadDate && (
                          <span className="text-hub-muted/50 text-[10px]">
                            {formatDateString(dl.uploadDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] group-hover:bg-indigo-600 text-hub-muted group-hover:text-white flex items-center justify-center transition-all flex-shrink-0 border border-white/[0.06] group-hover:border-indigo-500 shadow-sm">
                      <DownloadIcon size={14} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col relative h-full"
          >
            <div className="p-6 pb-4 border-b border-white/5 flex items-start justify-between flex-shrink-0">
              <div className="flex gap-4 items-start">
                <button 
                  onClick={() => setStep(1)}
                  className="text-hub-muted hover:text-white transition-colors mt-1 p-1 hover:bg-white/10 rounded-lg cursor-pointer"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h3 className="text-base font-bold text-white mb-0.5">{t('downloadConfig')}</h3>
                  <span className="text-xs font-medium text-hub-muted truncate">{selectedDownload?.title}</span>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="text-hub-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              
              {/* Downloader Host Selection */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/70">{t('chooseHoster')}</h3>
                  <span className="text-[11px] text-hub-muted">{availableDownloaders.length} {t('optionsAvailable')}</span>
                </div>
                
                <div className="bg-[#16181c] border border-white/5 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar">
                  {availableDownloaders.map((hoster, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setSelectedDownloader(hoster.id)}
                      className={`flex items-center justify-between p-3.5 cursor-pointer transition-colors border-b border-white/5 last:border-0 ${selectedDownloader === hoster.id ? 'bg-[#1e222b] border-indigo-500/30' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${hoster.color}`}></div>
                        <span className={`text-sm font-semibold ${selectedDownloader === hoster.id ? 'text-white' : 'text-white/80'}`}>{hoster.type}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-white/70 border border-white/10">
                          {hoster.badge}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {linkStatuses[hoster.id] === 'loading' ? (
                          <span className="text-[10px] text-hub-muted bg-white/5 px-1.5 py-0.5 rounded animate-pulse">{t('checking')}</span>
                        ) : linkStatuses[hoster.id] === true ? (
                          <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            <span className="text-emerald-400 text-[10px] font-bold">{t('online')}</span>
                          </div>
                        ) : linkStatuses[hoster.id] === false ? (
                          <span className="text-rose-400 text-[10px] bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-bold">{t('offline')}</span>
                        ) : null}

                        {selectedDownloader === hoster.id && (
                          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                            <Check size={13} className="text-black stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {availableDownloaders.length === 0 && (
                    <div className="p-4 text-center text-sm text-hub-muted">{t('noValidLinks')}</div>
                  )}
                </div>
              </div>

              {/* Target Download Folder */}
              <div>
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2 block">{t('downloadDirectory')}</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-[#16181c] border border-white/10 rounded-xl px-4 py-2.5 flex items-center">
                    <span className="text-xs text-white/90 truncate font-mono">{downloadPath}</span>
                  </div>
                  <button 
                    onClick={() => {
                      if (window.electronAPI?.selectDirectory) {
                        window.electronAPI.selectDirectory().then((p: string | null) => { if (p) setDownloadPath(p) })
                      } else {
                        const newPath = prompt(t('enterNewDirectory'), downloadPath)
                        if (newPath) setDownloadPath(newPath)
                      }
                    }}
                    className="text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    {t('browse')}
                  </button>
                </div>
              </div>

              {/* Automation Toggles */}
              <div className="space-y-3 pt-1">
                <label className="flex items-center gap-3 cursor-pointer group select-none">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-colors ${autoExtract ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-white/30 group-hover:border-white/50'}`}>
                    {autoExtract && <Check size={14} className="stroke-[3]" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={autoExtract} onChange={e => setAutoExtract(e.target.checked)} />
                  <span className="text-xs text-white/90 font-medium">{t('autoExtract')}</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group select-none">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-colors ${autoDelete ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-white/30 group-hover:border-white/50'}`}>
                    {autoDelete && <Check size={14} className="stroke-[3]" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={autoDelete} onChange={e => setAutoDelete(e.target.checked)} />
                  <span className="text-xs text-white/70 font-medium">{t('autoDeleteAfterExtract')}</span>
                </label>
              </div>

              {/* Launch Download Action */}
              <button
                disabled={isStarting || !selectedDownloader}
                onClick={handleStartDownload}
                className={`w-full font-bold text-sm rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all shadow-lg ${
                  isStarting 
                    ? 'bg-white/50 text-black cursor-not-allowed' 
                    : 'bg-white hover:bg-gray-100 text-black cursor-pointer hover:shadow-white/10'
                }`}
              >
                {isStarting ? (
                  <>
                    <RefreshCw size={17} className="animate-spin" />
                    {t('startingDownload')}
                  </>
                ) : (
                  <>
                    <DownloadIcon size={17} />
                    {t('downloadNow')}
                  </>
                )}
              </button>

            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
