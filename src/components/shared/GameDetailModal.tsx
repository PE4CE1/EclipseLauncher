import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Plus, AlertTriangle, ChevronDown, Play, X, Loader2, Trash2, Folder, Clock } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { useSourceStore } from '../../store/sourceStore'
import { useSteamGameDetail } from '../../hooks/useGames'
import { getDownloadsForGame } from '../../services/downloadEngine'
import { useScanner } from '../../hooks/useScanner'
import { getLogoUrl, getCoverUrl } from '../../services/assetHelper'
import { getLivePlayerCount } from '../../services/steamService'
import { useDownloadStore } from '../../store/downloadStore'
import { DownloadOptionsModal } from '../downloads/DownloadOptionsModal'
import { SmartImage } from './SmartImage'
import { useTranslation } from '../../hooks/useTranslation'
import { CustomVideoPlayer } from './CustomVideoPlayer'
import steamLogoImg from '../../assets/steam-logo.png'
import type { LibraryGame } from '../../types/game'

export function GameDetailModal() {
  const { selectedGameId, selectedGameName, isGameModalOpen, setIsGameModalOpen, showNotification } = useUIStore()
  const { library, addToLibrary, removeFromLibrary, installedGames, activeGame, stopPlaySession, startPlaySession } = useGameStore()
  const { sources } = useSourceStore()
  const { launchGame } = useScanner()

  const [isDownloadOptionsOpen, setIsDownloadOptionsOpen] = useState(false)
  const { t, language } = useTranslation()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isKilling, setIsKilling] = useState(false)
  const [playerCount, setPlayerCount] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const steamId = selectedGameId && selectedGameId > 0 ? selectedGameId : null
  const { data: detail, isLoading } = useSteamGameDetail(steamId)

  // Fetch live player count
  useEffect(() => {
    if (steamId) {
      getLivePlayerCount(steamId as number).then(setPlayerCount)
    }
  }, [steamId])

  // Map detail to our game structure
  const game = detail ? {
    name: detail.name,
    shortDescription: detail.short_description,
    aboutTheGame: detail.about_the_game || detail.detailed_description,
    pcRequirements: detail.pc_requirements,
    releaseDate: detail.release_date?.date,
    developers: detail.developers,
    publishers: detail.publishers,
    achievements: detail.achievements ? {
      total: detail.achievements.total,
      list: detail.achievements.highlighted || []
    } : null
  } : selectedGameName ? {
    name: selectedGameName,
    shortDescription: 'Local game in library.',
    aboutTheGame: '',
    pcRequirements: null,
    releaseDate: undefined,
    developers: [],
    publishers: [],
    achievements: null
  } : null

  const availableDownloads = useMemo(() => {
    if (!game?.name) return [];
    return getDownloadsForGame(game.name);
  }, [game?.name, sources])

  const mediaItems = useMemo(() => {
    const items: Array<{ type: 'video' | 'image', url: string, thumb: string, id: string }> = [];
    if (detail?.movies) {
      detail.movies.forEach(m => {
        // Fallback to steamcdn direct URL if mp4 is missing in API
        const url = m.mp4?.max || m.webm?.max || `https://steamcdn-a.akamaihd.net/steam/apps/${m.id}/movie_max.mp4`;
        if (url) items.push({ type: 'video', url, thumb: m.thumbnail, id: `movie-${m.id}` });
      })
    }
    if (detail?.screenshots) {
      detail.screenshots.forEach(s => {
        items.push({ type: 'image', url: s.path_full, thumb: s.path_full, id: `screen-${s.id}` });
      })
    }
    return items;
  }, [detail]);

  const isInLibrary = library.some(g => g.steamId === steamId)
  const installed   = installedGames.find(g =>
    (g.appId && g.appId === String(steamId)) ||
    (game && g.name.toLowerCase().includes(game.name.toLowerCase().slice(0, 8)))
  )
  const libraryItem = library.find(g =>
    (steamId && g.steamId === steamId) ||
    (game && g.name.toLowerCase() === game.name.toLowerCase()) ||
    (selectedGameName && g.name.toLowerCase() === selectedGameName.toLowerCase())
  )
  const gamePlaytimeMins = Math.round(Math.max(installed?.playTimeMinutes || 0, libraryItem?.playTimeMinutes || 0))
  const playtimeFormatted = gamePlaytimeMins >= 60 
    ? `${(gamePlaytimeMins / 60).toFixed(1)} hrs played` 
    : gamePlaytimeMins > 0 
      ? `${gamePlaytimeMins} mins played` 
      : '0 mins played'

  function handleLibraryToggle() {
    if (!game || !steamId) return
    
    if (isInLibrary) {
      const existingGame = library.find(g => g.steamId === steamId)
      if (existingGame) {
        removeFromLibrary(existingGame.id)
        showNotification(t('wasRemoved', { name: game.name }), 'info')
      }
    } else {
      const newGame: LibraryGame = {
        id: `steam-${steamId}`,
        steamId,
        name: game.name,
        platform: installed?.platform ?? 'custom',
        installed: !!installed,
        installPath: installed?.installPath,
        launchUrl: installed?.launchUrl,
        addedAt: Date.now(),
        isFavorite: false,
        releaseDate: game.releaseDate,
        developer: game.developers?.[0],
        publisher: game.publishers?.[0],
      }
      addToLibrary(newGame)
      showNotification(t('addedToLibrary', { name: game.name }), 'success')
    }
  }

  async function handleDownload(uri: string, title: string, downloadPath: string, isHttp: boolean, autoExtract: boolean, autoDelete = false): Promise<boolean> {
    const gameTitle = game?.name || title
    const appSettings = useGameStore.getState().settings

    // Auto-VPN check: ensure VPN is active before proceeding with download
    if (appSettings.autoVpnOnDownload && window.electronAPI?.getVpnStatus) {
      try {
        let vpnStatus = await window.electronAPI.getVpnStatus()
        
        if (!vpnStatus.isConnected && window.electronAPI.connectVpn) {
          showNotification(t('vpnProtectionConnecting'), 'info')
          const connectRes = await window.electronAPI.connectVpn(appSettings.selectedVpnProvider)

          if (connectRes && !connectRes.isCLI && !connectRes.isNative) {
            showNotification(`${connectRes.vpnName || 'VPN'}: ${t('vpnWaitingPrompt')}`, 'info')
          }

          // Robust Polling: Wait for tunnel to come UP (up to 15s)
          let connected = false
          const startTime = Date.now()
          while (Date.now() - startTime < 15000) {
            await new Promise(r => setTimeout(r, 800))
            const check = await window.electronAPI.getVpnStatus()
            if (check && check.isConnected) {
              connected = true
              vpnStatus = check
              break
            }
          }

          if (!connected) {
            showNotification(t('vpnConnectTimeout'), 'error')
            return false
          } else {
            showNotification(t('vpnConnectedStartingDownload'), 'success')
          }
        }
      } catch (e) {
        console.warn('VPN check error:', e)
      }
    }

    if (window.electronAPI) {
      const downloadPromise = window.electronAPI.startNativeDownload
        ? window.electronAPI.startNativeDownload(uri, gameTitle, downloadPath, autoExtract, autoDelete)
        : (isHttp 
            ? window.electronAPI.startHttpDownload(uri, gameTitle, downloadPath, autoExtract, autoDelete)
            : window.electronAPI.startDownload(uri, downloadPath, autoExtract, autoDelete))
        
      try {
        const res = await downloadPromise
        if (res && res.success) {
          const cover = (game as any)?.coverImage || (game as any)?.headerImage || (steamId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamId}/header.jpg` : undefined)
          if (res.infoHash && cover) {
            useDownloadStore.getState().updateDownload({
              infoHash: res.infoHash,
              name: gameTitle,
              progress: 0,
              downloadSpeed: 0,
              timeRemaining: 0,
              downloaded: 0,
              length: 0,
              status: 'downloading',
              coverUrl: cover
            })
          }
          useUIStore.getState().setActiveView('downloads');
          setIsDownloadOptionsOpen(false);
          setIsGameModalOpen(false);
          showNotification(t('downloadStarted', { name: gameTitle }) || `Download gestartet: ${gameTitle}`, 'success');
          return true
        } else {
          showNotification(res?.error || t('downloadFailed') || 'Fehler beim Starten des Downloads', 'error');
          return false
        }
      } catch (err: any) {
        console.error('Download start error:', err);
        showNotification((t('downloadError', { error: err?.message || '' }) || `Download-Fehler: ${err?.message || ''}`), 'error');
        return false
      }
    } else {
      window.open(uri);
      return true
    }
  }

  // We return null only if it's NOT open to avoid rendering overhead, but AnimatePresence handles the unmount
  // Wait, if we return null immediately, AnimatePresence exit animation won't run. So we only return null if !isGameModalOpen AND exit animation is done.
  // We can just rely on AnimatePresence checking isGameModalOpen.
  const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
  
  const isCurrentlyPlaying = !!(
    activeGame && (
      (game?.name && normalize(activeGame.name) === normalize(game.name)) ||
      (installed?.name && normalize(activeGame.name) === normalize(installed.name)) ||
      activeGame.id === String(steamId) ||
      activeGame.id === installed?.launchUrl ||
      activeGame.id === installed?.id ||
      activeGame.id === game?.name
    )
  )

  // Reset isKilling when game stops
  useEffect(() => {
    if (!isCurrentlyPlaying && isKilling) {
      setIsKilling(false)
    }
  }, [isCurrentlyPlaying, isKilling])

  // Today's date mock for 'Updated'
  const today = new Date().toLocaleDateString(t('language') === 'Sprache' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })


  return (
    <AnimatePresence>
      {isGameModalOpen && (steamId || selectedGameName) && (
        <motion.div 
          className="absolute inset-0 z-40 flex flex-col bg-[#0b0c0e]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex-1 overflow-y-auto flex flex-col relative">
            {/* Banner Section */}
            <div className="relative h-[65vh] w-full flex-shrink-0">
              <SmartImage 
                appId={steamId ?? undefined} 
                type="hero" 
                alt={game?.name ?? 'Loading...'} 
                className="w-full h-full object-cover" 
                fallbackScreenshotUrl={detail?.screenshots?.[0]?.path_full}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c0e] via-[#0b0c0e]/30 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c0e]/80 via-transparent to-transparent" />

              {/* Logo */}
              <div className="absolute top-1/2 -translate-y-1/2 left-16 z-10">
                {steamId ? (
                  <img
                    src={getLogoUrl(steamId)}
                    alt={game?.name}
                    className="max-h-48 max-w-sm object-contain drop-shadow-2xl"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-2xl">{game?.name}</h1>
                )}
              </div>

              {/* Banner Info Bar (Bottom of Banner) */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md border-y border-white/5 p-4 px-8 flex items-center justify-between z-10">
                <div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60 tracking-tight drop-shadow-md">
                        {game?.name}
                      </h2>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-white/80 border border-white/10 flex items-center gap-1.5 shadow-sm backdrop-blur-md">
                        <Clock size={11} className="text-white/60" />
                        {playtimeFormatted}
                      </span>
                    </div>
                    <p className="text-[10px] font-medium text-white/40 tracking-wider">
                      {t('updated', { date: today })}
                    </p>
                  </div>
                  {installed?.installPath ? (
                    <button
                      onClick={() => {
                        if (installed.installPath && window.electronAPI?.openPath) {
                          window.electronAPI.openPath(installed.installPath)
                        }
                      }}
                      className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white transition-colors group cursor-pointer overflow-hidden max-w-[300px]"
                    >
                      <Folder size={12} className="flex-shrink-0" />
                      <div className="grid grid-cols-[0fr] group-hover:grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-out overflow-hidden">
                        <span className="truncate min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75 whitespace-nowrap">
                          {installed.installPath}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <p className="text-hub-muted text-sm mt-0.5">{availableDownloads.length} {t('downloadOptions')}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {installed ? (
                    <>
                      {showDeleteConfirm ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (installed.id && installed.installed !== false) {
                                removeFromLibrary(installed.id);
                                setIsGameModalOpen(false);
                                showNotification(t('wasRemoved', { name: installed.name }), 'info');
                              }
                            }}
                            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 rounded-md text-sm font-semibold transition-all flex items-center gap-2"
                          >
                            <Trash2 size={15} /> {t('removeCompletely')}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-4 py-2 hover:bg-white/10 text-white/70 rounded-md text-sm font-medium transition-all"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (installed.installed !== false) {
                              setShowDeleteConfirm(true)
                            }
                          }}
                          disabled={installed.installed === false}
                          className={`w-[130px] h-[38px] border rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 group/btn ${
                            installed.installed === false 
                              ? 'border-white/10 text-white/20 cursor-not-allowed bg-transparent' 
                              : 'border-white/10 text-white/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                          }`}
                          title={installed.installed === false ? 'Cannot remove uninstalled game' : t('removeGameFromLibrary')}
                        >
                          <Check size={16} className="group-hover/btn:hidden" />
                          <span className="group-hover/btn:hidden">{t('inLibrary')}</span>
                          <span className="hidden group-hover/btn:flex items-center gap-1.5"><Trash2 size={16} /> Remove</span>
                        </button>
                      )}
                      
                      {!showDeleteConfirm && (
                        <div className="flex-1 flex flex-col items-center">
                          <button
                            onClick={async () => {
                              if (isKilling) return
                              if (isCurrentlyPlaying) {
                                setIsKilling(true)
                                try {
                                  if (window.electronAPI?.stopGame) {
                                    await window.electronAPI.stopGame()
                                  }
                                } catch (e) {
                                  console.error('[GameDetailModal] Stop game error:', e)
                                } finally {
                                  stopPlaySession()
                                  setIsKilling(false)
                                }
                              } else {
                                launchGame(installed.launchUrl, installed.name)
                              }
                            }}
                            disabled={isKilling}
                            className={`px-8 h-[38px] rounded-lg text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 w-full ${
                              isKilling
                                ? 'bg-white/10 text-white/50 cursor-not-allowed'
                                : isCurrentlyPlaying
                                  ? 'bg-red-500/90 hover:bg-red-500 text-white'
                                  : installed.platform === 'steam'
                                    ? 'bg-[#1b2838] hover:bg-[#2a475e] text-white border border-[#66c0f4]/30 shadow-[0_0_15px_rgba(102,192,244,0.3)]'
                                    : 'bg-white hover:bg-gray-200 text-black'
                            }`}
                          >
                            {isKilling ? (
                              <>
                                <Loader2 size={16} className="text-white/50 animate-spin" />
                                {t('cancel') || 'Cancel'}
                              </>
                            ) : isCurrentlyPlaying ? (
                              <>
                                <X size={16} className="text-white" />
                                {t('cancel') || 'Cancel'}
                              </>
                            ) : (
                              <>
                                {installed.platform === 'steam' ? (
                                  <img src={steamLogoImg} className="w-4 h-4 object-contain" alt="Steam" />
                                ) : (
                                  <Play size={16} className="fill-black" />
                                )}
                                {installed.installed === false ? 'Install' : 'Play Now'}
                              </>
                            )}
                          </button>
                        </div>
                      )}

                    </>
                  ) : (
                    <button
                      onClick={handleLibraryToggle}
                      className={`w-[130px] h-[38px] border rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 group/btn
                        ${isInLibrary 
                          ? 'border-white/10 text-white/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30' 
                          : 'border-white/30 text-white hover:bg-white/10'}`}
                    >
                      {isInLibrary ? (
                        <>
                          <Check size={16} className="group-hover/btn:hidden" />
                          <span className="group-hover/btn:hidden">{t('inLibrary')}</span>
                          <span className="hidden group-hover/btn:flex items-center gap-1.5"><Trash2 size={16} /> Remove</span>
                        </>
                      ) : (
                        <>
                          <Plus size={16} /> {t('addToLibrary')}
                        </>
                      )}
                    </button>
                  )}
                  
                  {!installed && (
                    <button
                      onClick={() => setIsDownloadOptionsOpen(true)}
                      disabled={availableDownloads.length === 0}
                      className={`px-5 py-2.5 border rounded-lg text-sm font-medium transition-colors
                        ${availableDownloads.length === 0
                          ? 'border-white/10 text-white/30 cursor-not-allowed bg-transparent'
                          : 'border-white/30 text-white hover:bg-white/10'}`}
                    >
                      {t('viewDownloadOptions')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Content Section */}
            <div className="flex flex-1 p-8 pt-6 max-w-[1600px] mx-auto w-full gap-8">
              
              {/* Left Column */}
              <div className="flex-1 flex flex-col gap-8 min-w-0">
                
                {/* Meta Info & Player Count */}
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-hub-muted">
                  <div>
                    {game?.releaseDate && <p>{t('releasedOn')} <span className="text-white/80">{game.releaseDate}</span></p>}
                    {game?.publishers?.[0] && <p>{t('publishedBy')} <span className="text-white/80">{game.publishers[0]}</span></p>}
                  </div>
                  
                  {playerCount !== null && (
                    <div className="flex items-center gap-2 text-white/50 text-sm font-medium">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400/80 shadow-[0_0_8px_rgba(74,222,128,0.5)] animate-pulse"></div>
                      <span>{playerCount.toLocaleString(t('language') === 'Sprache' ? 'de-DE' : 'en-US')} {t('inGame')}</span>
                    </div>
                  )}
                </div>

                {/* Media Gallery */}
                {mediaItems.length > 0 && (
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-4">{t('gallery')}</h3>
                    <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                      {mediaItems.map((item, idx) => (
                        <div 
                          key={item.id} 
                          onClick={() => setLightboxIndex(idx)}
                          className="relative flex-shrink-0 w-[400px] rounded-xl overflow-hidden border border-white/10 snap-center hover:border-white/30 transition-colors cursor-pointer group"
                        >
                          <img 
                            src={item.thumb} 
                            alt={`Media ${idx}`} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          {item.type === 'video' && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/10 transition-colors">
                              <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20 text-white pl-1 shadow-2xl">
                                <Play size={24} className="fill-white" />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* About the Game */}
                {game?.aboutTheGame && (
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-4">{t('aboutThisGame')}</h3>
                    <div 
                      className="text-hub-muted/90 text-sm leading-relaxed prose prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: game.aboutTheGame }}
                    />
                  </div>
                )}

                {/* PC Requirements */}
                {game?.pcRequirements?.minimum && (
                  <div className="mt-4 mb-10">
                    <h3 className="text-white font-semibold text-lg mb-4">{t('systemRequirements')}</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-[#111317] border border-white/10 rounded-xl p-5">
                      <div>
                        <h4 className="text-white/80 font-medium mb-3 text-sm uppercase tracking-wider">{t('minimum')}</h4>
                        <div 
                          className="text-xs text-hub-muted leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: game.pcRequirements.minimum }}
                        />
                      </div>
                      {game.pcRequirements.recommended && (
                        <div>
                          <h4 className="text-white/80 font-medium mb-3 text-sm uppercase tracking-wider">{t('recommended')}</h4>
                          <div 
                            className="text-xs text-hub-muted leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: game.pcRequirements.recommended }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Right Column: Achievements */}
              <div className="w-[350px] flex-shrink-0">
                <div className="border border-white/10 rounded-xl bg-[#111317] overflow-hidden sticky top-6">
                  <div className="p-4 border-b border-white/10 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors">
                    <h3 className="font-semibold text-sm text-white flex items-center gap-1">
                      <ChevronDown size={14} className="text-white" />
                      {t('achievements')} {game?.achievements?.total ? `0/${game.achievements.total}` : '0/0'}
                    </h3>
                  </div>
                  
                  <div className="p-4 bg-[#1a1c21]/50 border-b border-white/10 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-500 font-medium leading-relaxed">
                      {t('achievementsNotSynced')}
                    </p>
                  </div>

                  <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
                    {isLoading ? (
                      <div className="p-4 text-center text-hub-muted text-sm">{t('loading')}</div>
                    ) : game?.achievements?.list && game.achievements.list.length > 0 ? (
                      game.achievements.list.map((ach, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-2 hover:bg-white/5 rounded-lg transition-colors">
                          <img src={ach.path} alt={ach.name} className="w-12 h-12 rounded-lg bg-black object-cover" />
                          <p className="text-sm text-white font-medium leading-tight">{ach.name}</p>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-hub-muted text-sm">
                        {t('noAchievementsFound')}
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 border-t border-white/10 hover:bg-white/5 transition-colors cursor-pointer">
                    <p className="text-sm text-white">{t('viewAllAchievements')}</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <DownloadOptionsModal 
            isOpen={isDownloadOptionsOpen}
            onClose={() => setIsDownloadOptionsOpen(false)}
            gameName={game?.name || t('unknown')}
            downloads={availableDownloads}
            onDownload={handleDownload}
          />

          {/* Lightbox Overlay */}
          <AnimatePresence>
            {lightboxIndex !== null && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[100] bg-[#040405]/95 flex flex-col items-center justify-center p-8"
                onClick={() => setLightboxIndex(null)}
              >
                {/* Close Button */}
                <button 
                  onClick={() => setLightboxIndex(null)}
                  className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
                >
                  <X size={24} />
                </button>
                
                {/* Main Media */}
                <div className="relative flex-1 w-full flex items-center justify-center min-h-0 pb-24">
                  {mediaItems[lightboxIndex].type === 'video' ? (
                    <CustomVideoPlayer 
                      src={mediaItems[lightboxIndex].url}
                      poster={mediaItems[lightboxIndex].thumb}
                    />
                  ) : (
                    <img 
                      key={mediaItems[lightboxIndex].url}
                      src={mediaItems[lightboxIndex].url} 
                      alt="Fullscreen view" 
                      className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  {/* Navigation Arrows */}
                  {mediaItems.length > 1 && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + mediaItems.length) % mediaItems.length) }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % mediaItems.length) }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                      </button>
                    </>
                  )}
                </div>

                {/* Thumbnail Strip */}
                {mediaItems.length > 1 && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-full px-8">
                    <div className="flex items-center gap-3 overflow-x-auto py-4 px-2 snap-x hide-scrollbar" onClick={(e) => e.stopPropagation()}>
                      {mediaItems.map((item, idx) => (
                        <button
                          key={item.id}
                          onClick={() => setLightboxIndex(idx)}
                          className={`relative flex-shrink-0 w-32 h-20 rounded-lg overflow-hidden snap-center transition-all duration-200 ${
                            idx === lightboxIndex 
                              ? 'ring-[3px] ring-white scale-110 shadow-lg' 
                              : 'opacity-50 hover:opacity-100 hover:scale-100'
                          }`}
                        >
                          <img src={item.thumb} alt={`Thumbnail ${idx}`} className="w-full h-full object-cover" />
                          {item.type === 'video' && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <Play size={16} className="fill-white opacity-80" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
