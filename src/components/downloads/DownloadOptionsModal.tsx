import { useState, useMemo, useEffect, useDeferredValue } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Settings, Filter, Download as DownloadIcon, X, Network, HardDrive, Cpu, ExternalLink, ChevronDown, Check, ArrowLeft, Download } from 'lucide-react'
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

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
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
  onDownload: (uri: string, title: string, path: string, isHttp: boolean, autoExtract: boolean) => void;
}

export function DownloadOptionsModal({ isOpen, onClose, gameName, downloads, onDownload }: DownloadOptionsModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedDownload, setSelectedDownload] = useState<DownloadOption | null>(null)
  const { t } = useTranslation()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<string>('all')

  const { settings } = useGameStore()

  // Step 2 States
  const [selectedDownloader, setSelectedDownloader] = useState<string>('')
  const [downloadPath, setDownloadPath] = useState(settings.downloadPath || 'C:\\Downloads')
  const [autoExtract, setAutoExtract] = useState(true)
  const [autoDelete, setAutoDelete] = useState(false)

  const deferredSearchQuery = useDeferredValue(searchQuery)

  // Link Status Cache
  const [linkStatuses, setLinkStatuses] = useState<Record<string, boolean | 'loading'>>({})

  // Reset state when opened/closed
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setSelectedDownload(null)
      setLinkStatuses({})
    }
  }, [isOpen])

  useEffect(() => {
    if (step === 2 && selectedDownload && selectedDownload.uris.length > 0) {
      setSelectedDownloader(selectedDownload.uris[0]);
    }
  }, [step, selectedDownload])

  const uniqueSources = useMemo(() => {
    const sources = new Set(downloads.map(d => d.sourceName))
    return Array.from(sources)
  }, [downloads])

  // Optimized sorting & filtering
  const sortedAndFilteredDownloads = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    
    let result = downloads.filter(d => {
      const matchesSearch = !query || d.title.toLowerCase().includes(query)
      const matchesSource = selectedSource === 'all' || d.sourceName === selectedSource
      return matchesSearch && matchesSource
    })
    
    // Sort by uploadDate descending (fast string comparison)
    result.sort((a, b) => {
      const dateA = a.uploadDate || ''
      const dateB = b.uploadDate || ''
      return dateB.localeCompare(dateA)
    })
    
    return result;
  }, [downloads, deferredSearchQuery, selectedSource])

  const availableDownloaders = useMemo(() => {
    if (!selectedDownload) return [];
    const hosters: { id: string; type: string; color: string }[] = [];
    selectedDownload.uris.forEach(uri => {
      try {
        if (uri.startsWith('magnet:')) {
          hosters.push({ id: uri, type: 'Torrent', color: 'bg-gray-500' });
        } else {
          const url = new URL(uri);
          const host = url.hostname.replace('www.', '');
          let color = 'bg-gray-400';
          let type = host.charAt(0).toUpperCase() + host.slice(1).split('.')[0];
          
          if (host.includes('gofile.io')) { type = 'Gofile'; color = 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'; }
          else if (host.includes('pixeldrain.com')) { type = 'PixelDrain'; color = 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'; }
          else if (host.includes('1fichier.com')) { type = '1Fichier'; color = 'bg-orange-500'; }
          else if (host.includes('megaup.net')) { type = 'MegaUp'; color = 'bg-teal-500'; }
          else if (host.includes('mediafire.com')) { type = 'MediaFire'; color = 'bg-blue-400'; }
          else if (host.includes('qiwi.gg')) { type = 'Qiwi'; color = 'bg-purple-500'; }
          
          hosters.push({ id: uri, type, color });
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    });
    return hosters;
  }, [selectedDownload]);

  // Check link statuses when step 2 opens
  useEffect(() => {
    if (step === 2 && availableDownloaders.length > 0) {
      availableDownloaders.forEach(async (hoster) => {
        if (hoster.type !== 'Torrent' && !linkStatuses[hoster.id] && linkStatuses[hoster.id] !== false) {
          setLinkStatuses(prev => ({ ...prev, [hoster.id]: 'loading' }))
          if (window.electronAPI) {
            const isOnline = await window.electronAPI.checkLinkStatus(hoster.id)
            setLinkStatuses(prev => ({ ...prev, [hoster.id]: isOnline }))
          } else {
            setLinkStatuses(prev => ({ ...prev, [hoster.id]: true })) // fallback for web
          }
        } else if (hoster.type === 'Torrent') {
          setLinkStatuses(prev => ({ ...prev, [hoster.id]: true })) // Torrents assumed ok
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
    if (selectedDownload && selectedDownloader) {
      const isHttp = !selectedDownloader.startsWith('magnet:')
      onDownload(selectedDownloader, selectedDownload.title, downloadPath, isHttp, autoExtract)
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
                <h2 className="text-xl font-bold text-white mb-0.5">Download Options</h2>
                <p className="text-xs font-medium text-hub-muted truncate">{gameName} · {sortedAndFilteredDownloads.length} {t('chooseRepack') || 'repacks available'}</p>
              </div>
              <button 
                onClick={onClose}
                className="text-hub-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-4 px-6 flex gap-3 items-center bg-[#15171c] border-b border-white/[0.06] flex-shrink-0">
              <div className="flex-1 relative">
                <input 
                  type="text"
                  placeholder={t('filterRepacks') || 'Search repacks...'}
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
                  <option value="all">{t('filterBySource') || 'All Sources'}</option>
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
                  {t('noMatchingRepacks') || 'No matching repacks found'}
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
                            New
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
              className="flex flex-col relative"
            >
              <div className="p-6 pb-4 border-b border-white/5 flex items-start justify-between">
                <div className="flex gap-4 items-start">
                  <button 
                    onClick={() => setStep(1)}
                    className="text-hub-muted hover:text-white transition-colors mt-1"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-hub-muted mb-4 px-2">{t('downloadSettings')}</h3>
                    <span className="text-xs font-medium text-hub-muted truncate">{t('availableOnDisk', { size: '16.6 GB' })}</span>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="text-hub-muted hover:text-white transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-8">
                
                <div>
                  <h3 className="text-sm font-semibold text-white/90 mb-3">{t('downloader')}</h3>
                  <div className="bg-[#16181c] border border-white/5 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                    
                    {availableDownloaders.map((hoster, idx) => (
                      <div 
                        key={idx}
                        onClick={() => setSelectedDownloader(hoster.id)}
                        className={`flex items-center justify-between p-4 cursor-pointer transition-colors border-b border-white/5 last:border-0 ${selectedDownloader === hoster.id ? 'bg-[#1a1c21]' : 'hover:bg-white/5'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium ${selectedDownloader === hoster.id ? 'text-white' : 'text-hub-muted'}`}>{hoster.type}</span>
                          <div className={`w-1.5 h-1.5 rounded-full ${hoster.color}`}></div>
                          
                          {linkStatuses[hoster.id] === 'loading' ? (
                            <span className="text-[10px] text-hub-muted bg-white/5 px-1.5 py-0.5 rounded animate-pulse">{t('checking')}</span>
                          ) : linkStatuses[hoster.id] === true ? (
                            <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded" title="Online">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                              <span className="text-green-400 text-[10px] font-bold">{t('online')}</span>
                            </div>
                          ) : linkStatuses[hoster.id] === false ? (
                            <div className="text-xs text-red-400 bg-red-400/10 p-3 rounded-xl border border-red-400/20 mt-2 font-medium">{t('noValidLinks')}</div>
                          ) : null}
                        </div>
                        {selectedDownloader === hoster.id && (
                          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                            <Check size={14} className="text-black" />
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {availableDownloaders.length === 0 && (
                      <div className="p-4 text-center text-sm text-hub-muted">{t('noValidLinks')}</div>
                    )}

                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-hub-muted uppercase tracking-wider">{t('downloadDirectory')}</label>
                  <div className="flex items-center gap-3 mb-2 mt-2">
                    <div className="flex-1 bg-[#16181c] border border-white/10 rounded-lg px-4 py-2.5 flex items-center">
                      <span className="text-sm text-white/90 truncate">{downloadPath}</span>
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
                      className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1 rounded"
                    >
                      {t('change')}
                    </button>
                  </div>
                  <p className="text-[10px] text-hub-muted mt-2">{t('toChangeDefaultDir')}</p>
                </div>

                <div className="space-y-4 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${autoExtract ? 'bg-white border-white' : 'bg-transparent border-white/30 group-hover:border-white/50'}`}>
                      {autoExtract && <Check size={14} className="text-black" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={autoExtract} onChange={e => setAutoExtract(e.target.checked)} />
                    <span className="text-xs text-hub-text-secondary">{t('autoExtract')}</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${autoDelete ? 'bg-white border-white' : 'bg-transparent border-white/30 group-hover:border-white/50'}`}>
                      {autoDelete && <Check size={14} className="text-black" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={autoDelete} onChange={e => setAutoDelete(e.target.checked)} />
                    <span className="text-xs text-hub-text-secondary">{t('autoDeleteAfterExtract')}</span>
                  </label>
                </div>

                <button
                  onClick={handleStartDownload}
                  className="w-full bg-[#e6e9ef] hover:bg-white text-black font-semibold rounded-lg py-3.5 flex items-center justify-center gap-2 transition-colors mt-4"
                >
                  <Download size={18} />
                  {t('downloadNow')}
                </button>

              </div>
            </motion.div>
          )}
      </motion.div>
    </div>
  )
}
