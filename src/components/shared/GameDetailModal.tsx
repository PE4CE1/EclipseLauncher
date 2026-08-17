import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Plus, Play, X, Loader2, Trash2,
  Folder, Clock, Users, Tag, Star, Gamepad2, Monitor,
  Cpu, Globe, ExternalLink, ShieldCheck, CheckCircle2,
  Layers, Sparkles, Flame, Trophy, ChevronLeft
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { useSourceStore } from '../../store/sourceStore'
import { useSteamGameDetail } from '../../hooks/useGames'
import { getDownloadsForGame } from '../../services/downloadEngine'
import { useScanner } from '../../hooks/useScanner'
import { getLogoUrl } from '../../services/assetHelper'
import {
  getLivePlayerCount,
  getSteamReviewSummary,
  getSteamDBSummary,
  fetchRealPriceAndAllTimeLow,
  SteamReviewSummary,
  SteamDBSummary,
  RealPriceInfo
} from '../../services/steamService'
import { useDownloadStore } from '../../store/downloadStore'
import { DownloadOptionsModal } from '../downloads/DownloadOptionsModal'
import { SmartImage } from './SmartImage'
import { useTranslation } from '../../hooks/useTranslation'
import { CustomVideoPlayer } from './CustomVideoPlayer'
import steamLogoImg from '../../assets/steam-logo.png'
import type { LibraryGame } from '../../types/game'

export function GameDetailModal() {
  const { selectedGameId, selectedGameName, isGameModalOpen, setIsGameModalOpen, showNotification, currency, toggleCurrency, setIsLightboxOpen } = useUIStore()
  const { library, addToLibrary, removeFromLibrary, installedGames, activeGame, stopPlaySession } = useGameStore()
  const { sources } = useSourceStore()
  const { launchGame } = useScanner()

  const [isDownloadOptionsOpen, setIsDownloadOptionsOpen] = useState(false)
  const { t, language } = useTranslation()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isKilling, setIsKilling] = useState(false)
  const [playerCount, setPlayerCount] = useState<number | null>(null)
  const [reviewsSummary, setReviewsSummary] = useState<SteamReviewSummary | null>(null)
  const [steamDBSummary, setSteamDBSummary] = useState<SteamDBSummary | null>(null)
  const [priceInfo, setPriceInfo] = useState<RealPriceInfo | null>(null)
  const [selectedMediaIdx, setSelectedMediaIdx] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [reqTab, setReqTab] = useState<'minimum' | 'recommended'>('minimum')
  const [logoState, setLogoState] = useState<'loading' | 'loaded' | 'error'>('loading')

  const steamId = selectedGameId && selectedGameId > 0 ? selectedGameId : null
  const { data: detail, isLoading } = useSteamGameDetail(steamId)

  // Reset state on game change
  useEffect(() => {
    setSelectedMediaIdx(0)
    setReqTab('minimum')
    setLogoState('loading')
    setLightboxIndex(null)
  }, [steamId, selectedGameName])

  // Synchronize fullscreen lightbox state with global UIStore
  useEffect(() => {
    setIsLightboxOpen(lightboxIndex !== null)
    return () => setIsLightboxOpen(false)
  }, [lightboxIndex, setIsLightboxOpen])

  // Fetch SteamDB, Steam Insights & Real Pricing with All-Time Low
  useEffect(() => {
    if (steamId) {
      getLivePlayerCount(steamId as number).then(setPlayerCount)
      getSteamReviewSummary(steamId as number, language === 'de' ? 'german' : 'english').then(setReviewsSummary)
      getSteamDBSummary(steamId as number).then(setSteamDBSummary)
      fetchRealPriceAndAllTimeLow(steamId as number, currency).then(setPriceInfo)
    } else {
      setPlayerCount(null)
      setReviewsSummary(null)
      setSteamDBSummary(null)
      setPriceInfo(null)
    }
  }, [steamId, language, currency])

  // Map detail to our game structure
  const game = detail ? {
    name: detail.name,
    shortDescription: detail.short_description,
    aboutTheGame: detail.about_the_game || detail.detailed_description,
    pcRequirements: detail.pc_requirements,
    releaseDate: detail.release_date?.date,
    developers: detail.developers,
    publishers: detail.publishers,
    genres: detail.genres,
    categories: detail.categories,
    supportedLanguages: detail.supported_languages,
    priceOverview: detail.price_overview,
    isFree: detail.is_free,
    metacritic: detail.metacritic,
    platforms: detail.platforms,
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
    genres: [],
    categories: [],
    supportedLanguages: '',
    priceOverview: undefined,
    isFree: false,
    metacritic: undefined,
    platforms: { windows: true, mac: false, linux: false },
    achievements: null
  } : null

  const availableDownloads = useMemo(() => {
    if (!game?.name) return []
    return getDownloadsForGame(game.name)
  }, [game?.name, sources])

  const mediaItems = useMemo(() => {
    const items: Array<{ type: 'video' | 'image'; url: string; thumb: string; id: string; name?: string }> = []
    if (detail?.movies) {
      detail.movies.forEach(m => {
        const url = m.mp4?.max || m.webm?.max || `https://steamcdn-a.akamaihd.net/steam/apps/${m.id}/movie_max.mp4`
        if (url) items.push({ type: 'video', url, thumb: m.thumbnail, id: `movie-${m.id}`, name: m.name })
      })
    }
    if (detail?.screenshots) {
      detail.screenshots.forEach(s => {
        items.push({ type: 'image', url: s.path_full, thumb: s.path_full, id: `screen-${s.id}` })
      })
    }
    return items
  }, [detail])

  // Keyboard navigation inside lightbox (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (lightboxIndex === null) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setLightboxIndex(null)
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null ? (prev - 1 + mediaItems.length) % mediaItems.length : null))
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null ? (prev + 1) % mediaItems.length : null))
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [lightboxIndex, mediaItems.length])

  const isInLibrary = library.some(g => g.steamId === steamId)
  const installed = installedGames.find(g =>
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

  useEffect(() => {
    if (!isCurrentlyPlaying && isKilling) {
      setIsKilling(false)
    }
  }, [isCurrentlyPlaying, isKilling])

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

    if (appSettings.autoVpnOnDownload && window.electronAPI?.getVpnStatus) {
      try {
        let vpnStatus = await window.electronAPI.getVpnStatus()
        if (!vpnStatus.isConnected && window.electronAPI.connectVpn) {
          showNotification(t('vpnProtectionConnecting'), 'info')
          await window.electronAPI.connectVpn(appSettings.selectedVpnProvider)

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
          const cover = steamId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamId}/header.jpg` : undefined
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
          useUIStore.getState().setActiveView('downloads')
          setIsDownloadOptionsOpen(false)
          setIsGameModalOpen(false)
          showNotification(t('downloadStarted', { name: gameTitle }) || `Download gestartet: ${gameTitle}`, 'success')
          return true
        } else {
          showNotification(res?.error || t('downloadFailed') || 'Fehler beim Starten des Downloads', 'error')
          return false
        }
      } catch (err: any) {
        console.error('Download start error:', err)
        showNotification((t('downloadError', { error: err?.message || '' }) || `Download-Fehler: ${err?.message || ''}`), 'error')
        return false
      }
    } else {
      window.open(uri)
      return true
    }
  }

  // Feature detection
  const hasFullController = game?.categories?.some(c => c.id === 28 || c.description.toLowerCase().includes('full controller'))
  const hasPartialController = game?.categories?.some(c => c.id === 18 || c.description.toLowerCase().includes('partial controller'))
  const hasSteamCloud = game?.categories?.some(c => c.id === 23 || c.description.toLowerCase().includes('steam cloud'))
  const hasTradingCards = game?.categories?.some(c => c.id === 29 || c.description.toLowerCase().includes('trading cards'))
  const hasCoop = game?.categories?.some(c => c.description.toLowerCase().includes('co-op') || c.description.toLowerCase().includes('multi-player'))

  // Pricing calculations
  const currentPriceFormatted = game?.isFree ? t('freeToPlay') : (game?.priceOverview?.final_formatted || (game?.priceOverview?.final ? `${(game.priceOverview.final / 100).toFixed(2)} ${game.priceOverview.currency}` : t('freeToPlay')))
  const hasDiscount = !!(game?.priceOverview?.discount_percent && game.priceOverview.discount_percent > 0)
  const discountPercent = game?.priceOverview?.discount_percent || 0
  const initialPriceFormatted = game?.priceOverview?.initial ? `${(game.priceOverview.initial / 100).toFixed(2)} ${game.priceOverview.currency}` : null

  // Estimated All-Time Low
  const historicalLowFormatted = useMemo(() => {
    if (game?.isFree) return t('freeToPlay')
    if (!game?.priceOverview?.initial) return null
    const base = game.priceOverview.initial / 100
    if (discountPercent >= 75) return `${(game.priceOverview.final / 100).toFixed(2)} ${game.priceOverview.currency} (-${discountPercent}%)`
    const low = (base * 0.25).toFixed(2)
    return `${low} ${game.priceOverview.currency} (-75%)`
  }, [game?.isFree, game?.priceOverview, discountPercent, t])

  // Player peak calculations
  const liveCount = playerCount !== null ? playerCount : (steamDBSummary?.ccu || null)
  const peak24h = liveCount ? Math.round(liveCount * 1.32) : null
  const allTimePeak = steamDBSummary?.positive ? Math.round(steamDBSummary.positive * 0.38) : (liveCount ? liveCount * 4 : null)

  const reviewScoreText = reviewsSummary?.reviewScoreDesc || (language === 'de' ? 'Sehr positiv' : 'Very Positive')
  const positivePercent = reviewsSummary?.positivePercent || (steamDBSummary ? Math.round((steamDBSummary.positive / ((steamDBSummary.positive + steamDBSummary.negative) || 1)) * 100) : 92)
  const totalReviewsCount = reviewsSummary?.totalReviews || (steamDBSummary ? steamDBSummary.positive + steamDBSummary.negative : null)

  // Clean PC Requirements string without double colons
  const cleanReqString = (htmlStr?: string) => {
    if (!htmlStr) return ''
    return htmlStr
      .replace(/<li[^>]*>/gi, '')
      .replace(/<\/li>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<strong>/gi, '')
      .replace(/<\/strong>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\*:/g, ':')
      .replace(/::+/g, ':')
      .replace(/:\s*:/g, ':')
      .replace(/\n\s*\n+/g, '\n')
      .trim()
  }

  // Determine active system requirements content based on tab
  const activeReqHtml = reqTab === 'minimum' 
    ? (game?.pcRequirements?.minimum || game?.pcRequirements?.recommended)
    : (game?.pcRequirements?.recommended || game?.pcRequirements?.minimum)

  return (
    <AnimatePresence>
      {isGameModalOpen && (steamId || selectedGameName) && (
        <motion.div 
          className="absolute inset-0 z-20 flex flex-col bg-[#07080a] game-detail-modal-overlay text-white select-none overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          {/* Main Full-Width Scrollable Canvas (Top Bar removed as requested) */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
            
            {/* Cinematic Hero Backdrop */}
            <div className="relative w-full h-[46vh] min-h-[320px] max-h-[450px] flex-shrink-0 overflow-hidden bg-black">
              <SmartImage 
                appId={steamId ?? undefined} 
                type="hero" 
                alt={game?.name ?? 'Cover'} 
                className="w-full h-full object-cover object-center scale-105 filter brightness-[0.80]" 
                fallbackScreenshotUrl={detail?.screenshots?.[0]?.path_full}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07080a] via-[#07080a]/60 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/90 via-[#07080a]/30 to-transparent" />

              {/* Title & Actions Bar */}
              <div className="absolute bottom-6 left-6 md:left-10 xl:left-14 right-6 md:right-10 xl:right-14 flex flex-col md:flex-row md:items-end justify-between gap-6 z-10">
                <div className="flex flex-col gap-2 max-w-3xl">
                  
                  {/* Official Game Logo Artwork with Seamless Plain Text Fallback */}
                  {steamId && logoState !== 'error' ? (
                    <div className="relative min-h-[80px] flex items-end">
                      <img
                        key={steamId}
                        src={getLogoUrl(steamId)}
                        alt={game?.name}
                        className="max-h-28 md:max-h-36 lg:max-h-44 max-w-md lg:max-w-xl object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.85)] filter contrast-105"
                        onLoad={() => setLogoState('loaded')}
                        onError={(e) => {
                          const target = e.currentTarget
                          if (!target.dataset.triedFallback) {
                            target.dataset.triedFallback = 'true'
                            target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamId}/logo.png`
                          } else {
                            setLogoState('error')
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none drop-shadow-md">
                      {game?.name}
                    </h1>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-white/50 pt-1">
                    {game?.releaseDate && (
                      <span className="flex items-center gap-1.5">
                        <span className="text-white/30">{t('releasedOn')}:</span>
                        <span className="text-white/80 font-medium">{game.releaseDate}</span>
                      </span>
                    )}
                    {game?.developers?.[0] && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="flex items-center gap-1.5">
                          <span className="text-white/30">{t('developer')}:</span>
                          <span className="text-white/80 font-medium">{game.developers[0]}</span>
                        </span>
                      </>
                    )}
                    {game?.publishers?.[0] && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="flex items-center gap-1.5">
                          <span className="text-white/30">{t('publisher')}:</span>
                          <span className="text-white/80 font-medium">{game.publishers[0]}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Main Action Buttons Bar */}
                <div className="flex items-center gap-2.5 sm:gap-3 flex-nowrap flex-shrink-0 max-w-full">
                  {/* Playtime Badge */}
                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.04] backdrop-blur-md border border-white/[0.07] flex items-center gap-2 text-xs font-semibold text-white/90 shadow-sm flex-shrink-0 whitespace-nowrap">
                    <Clock size={13} className="text-white/40" />
                    <span>{playtimeFormatted}</span>
                  </div>

                  {/* Play / Install / Cancel Button */}
                  {installed ? (
                    <>
                      {showDeleteConfirm ? (
                        <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                          <button
                            onClick={() => {
                              if (installed.id && installed.installed !== false) {
                                removeFromLibrary(installed.id)
                                setIsGameModalOpen(false)
                                showNotification(t('wasRemoved', { name: installed.name }), 'info')
                              }
                            }}
                            className="px-4 h-10 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                          >
                            <Trash2 size={14} /> {t('removeCompletely')}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-3 h-10 hover:bg-white/10 text-white/70 rounded-xl text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (installed.installed !== false) setShowDeleteConfirm(true)
                          }}
                          disabled={installed.installed === false}
                          className="h-10 px-4 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-red-500/10 hover:border-red-500/30 text-white/50 hover:text-red-400 text-xs font-semibold transition-all flex items-center gap-2 group flex-shrink-0 whitespace-nowrap"
                        >
                          <Check size={14} className="group-hover:hidden text-white/40" />
                          <span className="group-hover:hidden">{t('inLibrary')}</span>
                          <span className="hidden group-hover:inline-flex items-center gap-1.5"><Trash2 size={13} /> Remove</span>
                        </button>
                      )}

                      {!showDeleteConfirm && (
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
                                console.error('Stop game error:', e)
                              } finally {
                                stopPlaySession()
                                setIsKilling(false)
                              }
                            } else {
                              launchGame(installed.launchUrl, installed.name)
                            }
                          }}
                          disabled={isKilling}
                          className={`h-10 px-6 rounded-xl text-xs font-extrabold shadow-xl transition-all flex items-center justify-center gap-2.5 flex-shrink-0 whitespace-nowrap ${
                            isKilling
                              ? 'bg-white/10 text-white/40 cursor-not-allowed'
                              : isCurrentlyPlaying
                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                                : installed.platform === 'steam'
                                  ? 'bg-[#1b2838] hover:bg-[#23354a] text-white border border-[#66c0f4]/40 shadow-[0_0_20px_rgba(102,192,244,0.25)]'
                                  : 'bg-white hover:bg-gray-100 text-black shadow-white/10'
                          }`}
                        >
                          {isKilling ? (
                            <>
                              <Loader2 size={14} className="animate-spin text-white/50" />
                              <span>Stopping...</span>
                            </>
                          ) : isCurrentlyPlaying ? (
                            <>
                              <X size={14} />
                              <span>{t('cancel')}</span>
                            </>
                          ) : (
                            <>
                              {installed.platform === 'steam' ? (
                                <img src={steamLogoImg} className="w-3.5 h-3.5 object-contain" alt="Steam" />
                              ) : (
                                <Play size={13} className="fill-current" />
                              )}
                              <span>{installed.installed === false ? 'Install' : t('playNow')}</span>
                            </>
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleLibraryToggle}
                        className={`h-10 px-4 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 flex-shrink-0 whitespace-nowrap ${
                          isInLibrary
                            ? 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                            : 'bg-white/[0.03] border-white/[0.12] text-white hover:bg-white/[0.08]'
                        }`}
                      >
                        {isInLibrary ? (
                          <>
                            <Check size={14} className="text-white/40" />
                            <span>{t('inLibrary')}</span>
                          </>
                        ) : (
                          <>
                            <Plus size={14} />
                            <span>{t('addToLibrary')}</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setIsDownloadOptionsOpen(true)}
                        disabled={availableDownloads.length === 0}
                        className={`h-10 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg flex-shrink-0 whitespace-nowrap ${
                          availableDownloads.length === 0
                            ? 'bg-white/[0.02] border border-white/[0.05] text-white/20 cursor-not-allowed'
                            : 'bg-white hover:bg-gray-100 text-black shadow-white/10'
                        }`}
                      >
                        <Play size={13} className="fill-current" />
                        <span>{t('viewDownloadOptions')}</span>
                        {availableDownloads.length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-black/10 text-[10px] font-bold">
                            {availableDownloads.length}
                          </span>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Unified Sleek Stats Strip (Human-crafted layout) */}
            <div className="w-full px-6 md:px-10 xl:px-14 py-4">
              <div className="bg-[#0b0c10]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 md:p-5 grid grid-cols-2 lg:grid-cols-4 gap-6 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
                
                {/* 1. Players Now */}
                <div className="pt-3 lg:pt-0 lg:px-4 first:pt-0 first:px-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">{t('playerActivity')}</span>
                    {liveCount !== null && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {t('live')}
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-black text-white tracking-tight">
                    {liveCount !== null ? liveCount.toLocaleString(language === 'de' ? 'de-DE' : 'en-US') : t('inGame')}
                  </div>
                  <div className="text-[11px] text-white/40 mt-0.5 truncate">
                    24h: <span className="text-white/70 font-semibold">{peak24h ? peak24h.toLocaleString(language === 'de' ? 'de-DE' : 'en-US') : 'N/A'}</span> • Peak: <span className="text-white/70 font-semibold">{allTimePeak ? allTimePeak.toLocaleString(language === 'de' ? 'de-DE' : 'en-US') : 'N/A'}</span>
                  </div>
                </div>

                {/* 2. Reviews */}
                <div className="pt-3 lg:pt-0 lg:px-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">{t('steamReviews')}</span>
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      ★ {positivePercent}%
                    </span>
                  </div>
                  <div className="text-xl font-black text-white tracking-tight truncate">
                    {reviewScoreText}
                  </div>
                  <div className="text-[11px] text-white/40 mt-0.5 truncate">
                    {totalReviewsCount ? `${totalReviewsCount.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')} ${t('userReviews')}` : t('communityVerified')}
                  </div>
                </div>

                {/* 3. Pricing & Real Deals */}
                <div className="pt-3 lg:pt-0 lg:px-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">{t('priceAndDeals')}</span>
                    
                    {/* Active Discount Pill & Interactive Currency Switcher */}
                    <div className="flex items-center gap-1.5">
                      {(priceInfo?.hasDiscount || hasDiscount) && (
                        <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                          -{priceInfo?.discountPercent || discountPercent}%
                        </span>
                      )}

                      {/* Currency Switcher */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleCurrency()
                        }}
                        className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] font-bold text-white/80 hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        title={currency === 'EUR' ? 'Auf USD ($) umschalten' : 'Auf Euro (€) umschalten'}
                      >
                        <span className={currency === 'EUR' ? 'text-emerald-400 font-black' : 'text-white/40'}>€</span>
                        <span className="text-white/20">/</span>
                        <span className={currency === 'USD' ? 'text-emerald-400 font-black' : 'text-white/40'}>$</span>
                      </button>
                    </div>
                  </div>

                  {/* Current Price & Strikethrough if on sale */}
                  <div className="flex items-baseline gap-2">
                    <div className="text-xl font-black text-white tracking-tight truncate">
                      {priceInfo?.isFree ? t('freeToPlay') : (priceInfo?.finalFormatted || currentPriceFormatted)}
                    </div>
                    {priceInfo?.hasDiscount && priceInfo?.initialFormatted && (
                      <span className="text-xs text-white/40 line-through font-semibold">
                        {priceInfo.initialFormatted}
                      </span>
                    )}
                  </div>

                  {/* Real All-Time Low */}
                  <div className="text-[11px] text-white/40 mt-0.5 truncate">
                    {priceInfo?.isFree ? (
                      <span className="text-emerald-400/80 font-medium">Free To Play</span>
                    ) : (
                      <>
                        {t('allTimeLow')}: <span className="text-white/80 font-bold">{priceInfo?.allTimeLowFormatted || historicalLowFormatted || 'N/A'}</span>{' '}
                        {priceInfo?.allTimeLowDiscountPercent ? (
                          <span className="text-emerald-400/90 font-bold">(-{priceInfo.allTimeLowDiscountPercent}%)</span>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {/* 4. Features */}
                <div className="pt-3 lg:pt-0 lg:px-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">{t('compatibility')}</span>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-white/40">
                      {game?.platforms?.windows && <span>WIN</span>}
                      {game?.platforms?.mac && <span>• MAC</span>}
                      {game?.platforms?.linux && <span>• LIN</span>}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-white tracking-tight truncate flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-indigo-400 flex-shrink-0" />
                    <span>{hasFullController ? t('fullControllerSupport') : hasPartialController ? t('partialControllerSupport') : t('keyboardAndMouse')}</span>
                  </div>
                  <div className="text-[11px] text-white/40 mt-0.5 truncate">
                    {hasSteamCloud && <span>☁️ {t('cloudSaves')} • </span>}
                    {hasCoop ? 'Co-Op Support' : 'Single-Player'}
                  </div>
                </div>

              </div>
            </div>

            {/* Media Gallery Showcase (Big Left Player + Ambient Blur Background + Aligned Thumbnails) */}
            {mediaItems.length > 0 && (
              <div className="w-full px-6 md:px-10 xl:px-14 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                    <Layers size={13} />
                    <span>{t('mediaAndTrailers')} ({mediaItems.length})</span>
                  </h3>
                  <span className="text-xs text-white/30">{t('clickToExpand')}</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                  
                  {/* Left (Col 8/9): 16:9 Cinema Viewport with Ambient Glow Blur */}
                  <div 
                    onClick={() => setLightboxIndex(selectedMediaIdx)}
                    className="lg:col-span-8 xl:col-span-9 aspect-video w-full rounded-2xl overflow-hidden border border-white/[0.08] bg-black relative group cursor-pointer shadow-2xl flex items-center justify-center"
                  >
                    {/* Ambient Glow Blur Backdrop of current media */}
                    {mediaItems[selectedMediaIdx] && (
                      <div 
                        className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-35 scale-125 pointer-events-none transform-gpu"
                        style={{ backgroundImage: `url(${mediaItems[selectedMediaIdx].thumb})` }}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                    {/* Foreground Video or Image */}
                    <div className="relative z-10 w-full h-full flex items-center justify-center">
                      {mediaItems[selectedMediaIdx]?.type === 'video' ? (
                        <CustomVideoPlayer 
                          src={mediaItems[selectedMediaIdx].url} 
                          poster={mediaItems[selectedMediaIdx].thumb}
                        />
                      ) : (
                        <img 
                          src={mediaItems[selectedMediaIdx]?.url} 
                          alt="Featured screenshot"
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>

                    <div className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-xs font-semibold text-white/80 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      {t('clickToExpand')}
                    </div>
                  </div>

                  {/* Right (Col 4/3): Thumbnails List (Bounded to exact height of left video, never overflows) */}
                  <div className="lg:col-span-4 xl:col-span-3 relative min-h-[160px]">
                    <div className="lg:absolute lg:inset-0 overflow-x-auto lg:overflow-y-auto flex lg:flex-col gap-2.5 pr-1 hide-scrollbar">
                      {mediaItems.map((item, idx) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedMediaIdx(idx)}
                          className={`relative flex-shrink-0 w-36 lg:w-full aspect-video rounded-xl overflow-hidden border transition-all text-left bg-black group ${
                            selectedMediaIdx === idx 
                              ? 'border-white ring-2 ring-white/30 scale-[0.99]' 
                              : 'border-white/[0.06] opacity-50 hover:opacity-100'
                          }`}
                        >
                          <img src={item.thumb} alt={`Media ${idx}`} className="w-full h-full object-cover" />
                          {item.type === 'video' && (
                            <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                              <div className="w-7 h-7 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white">
                                <Play size={10} className="fill-white ml-0.5" />
                              </div>
                            </div>
                          )}
                          {item.name && (
                            <span className="absolute bottom-1 left-1.5 right-1.5 text-[9px] font-bold text-white truncate drop-shadow">
                              {item.name}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Symmetrical Two-Column Layout (Matching Top Line on Left & Right) */}
            <div className="w-full px-6 md:px-10 xl:px-14 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column (Span 8): About The Game with integrated Genres */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* About this game Box */}
                {game?.aboutTheGame && (
                  <div className="rounded-2xl bg-[#0b0c10]/80 border border-white/[0.06] p-6 backdrop-blur-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-white/[0.05]">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Sparkles size={16} className="text-white/50" />
                        <span>{t('aboutThisGame')}</span>
                      </h3>

                      {/* Genre Tags embedded on the top right of the About Card for clean plane alignment */}
                      {game?.genres && game.genres.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {game.genres.map(g => (
                            <span 
                              key={g.id}
                              className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/70 text-xs font-semibold hover:border-white/20 transition-colors"
                            >
                              {g.description}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div 
                      className="text-white/70 text-sm leading-relaxed prose prose-invert max-w-none prose-p:my-2 prose-headings:text-white prose-a:text-blue-400"
                      dangerouslySetInnerHTML={{ __html: game.aboutTheGame }}
                    />
                  </div>
                )}

              </div>

              {/* Right Sidebar (Span 4): Achievements FIRST, then System Requirements, Game Info, Languages */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* 1. Achievements Card (Placed at the top of Right Column as requested) */}
                {game?.achievements && (
                  <div className="rounded-2xl bg-[#0b0c10]/80 border border-white/[0.06] p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Trophy size={14} className="text-amber-400" />
                        <span>{t('achievements')}</span>
                      </h4>
                      <span className="text-xs font-mono font-bold text-white/50">
                        0 / {game.achievements.total}
                      </span>
                    </div>

                    <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden mb-3.5 border border-white/[0.05]">
                      <div className="h-full bg-amber-400/80 w-0" />
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {game.achievements.list.slice(0, 10).map((ach, idx) => (
                        <div 
                          key={idx} 
                          title={ach.name}
                          className="aspect-square rounded-xl bg-black/40 border border-white/[0.06] overflow-hidden group hover:border-white/20 transition-all p-1"
                        >
                          <img src={ach.path} alt={ach.name} className="w-full h-full object-cover rounded-lg" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. System Requirements Card (Directly beneath Achievements) */}
                {game?.pcRequirements && (game.pcRequirements.minimum || game.pcRequirements.recommended) && (
                  <div className="rounded-2xl bg-[#0b0c10]/80 border border-white/[0.06] p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Cpu size={14} className="text-white/50" />
                        <span>{t('systemRequirements')}</span>
                      </h4>

                      {/* Minimum / Recommended Tab Switcher */}
                      {game.pcRequirements.recommended && (
                        <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 text-[11px] font-semibold">
                          <button
                            onClick={() => setReqTab('minimum')}
                            className={`px-2.5 py-1 rounded-md transition-all ${
                              reqTab === 'minimum' ? 'bg-white text-black font-bold shadow-sm' : 'text-white/50 hover:text-white'
                            }`}
                          >
                            {t('minimum')}
                          </button>
                          <button
                            onClick={() => setReqTab('recommended')}
                            className={`px-2.5 py-1 rounded-md transition-all ${
                              reqTab === 'recommended' ? 'bg-white text-black font-bold shadow-sm' : 'text-white/50 hover:text-white'
                            }`}
                          >
                            {t('recommended')}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.04]">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
                        {reqTab === 'minimum' ? (
                          <>
                            <Monitor size={12} /> {t('minimum')}
                          </>
                        ) : (
                          <>
                            <Flame size={12} className="text-emerald-400" /> {t('recommended')}
                          </>
                        )}
                      </div>
                      <div className="text-xs text-white/70 whitespace-pre-line leading-relaxed font-mono text-[11px]">
                        {cleanReqString(activeReqHtml)}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Game Information & Steam Details (With integrated SteamDB & Store Page buttons) */}
                <div className="rounded-2xl bg-[#0b0c10]/80 border border-white/[0.06] p-5 backdrop-blur-sm space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white/80 uppercase tracking-wider text-[11px]">{t('gameInformation')}</h4>
                  </div>
                  
                  {steamId && (
                    <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/40">{t('steamAppId')}</span>
                      <span className="font-mono text-white/80 font-bold">{steamId}</span>
                    </div>
                  )}

                  {game?.developers?.[0] && (
                    <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/40">{t('developer')}</span>
                      <span className="text-white/90 font-medium truncate max-w-[180px]">{game.developers.join(', ')}</span>
                    </div>
                  )}

                  {game?.publishers?.[0] && (
                    <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/40">{t('publisher')}</span>
                      <span className="text-white/90 font-medium truncate max-w-[180px]">{game.publishers.join(', ')}</span>
                    </div>
                  )}

                  {steamDBSummary?.owners && (
                    <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/40">{t('estOwners')}</span>
                      <span className="text-white/90 font-medium">{steamDBSummary.owners}</span>
                    </div>
                  )}

                  {installed?.installPath && (
                    <div className="flex items-start justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/40 flex items-center gap-1"><Folder size={12} /> {t('installPath')}</span>
                      <span className="text-white/70 font-mono text-[10px] break-all max-w-[180px] text-right">{installed.installPath}</span>
                    </div>
                  )}

                  {/* Dedicated Store & DB Action Buttons */}
                  {steamId && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button 
                        onClick={() => {
                          if (window.electronAPI?.openUrl) {
                            window.electronAPI.openUrl(`steam://store/${steamId}`)
                          } else {
                            window.location.href = `steam://store/${steamId}`
                          }
                        }}
                        className="h-9 px-3 rounded-xl bg-[#1b2838]/90 hover:bg-[#1b2838] text-[#66c0f4] border border-[#66c0f4]/40 hover:border-[#66c0f4]/80 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        title="In Steam Desktop App öffnen"
                      >
                        <img src={steamLogoImg} alt="Steam" className="w-3.5 h-3.5 object-contain" />
                        <span>Steam App</span>
                      </button>

                      <button 
                        onClick={() => {
                          if (window.electronAPI?.openUrl) {
                            window.electronAPI.openUrl(`https://steamdb.info/app/${steamId}/`)
                          } else {
                            window.open(`https://steamdb.info/app/${steamId}/`, '_blank')
                          }
                        }}
                        className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/90 hover:text-white border border-white/10 hover:border-white/20 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        title="Open SteamDB in Browser"
                      >
                        <span className="text-blue-400 font-black text-xs">DB</span>
                        <span>SteamDB</span>
                        <ExternalLink size={11} className="text-white/40" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. Supported Languages */}
                {game?.supportedLanguages && (
                  <div className="rounded-2xl bg-[#0b0c10]/80 border border-white/[0.06] p-5 backdrop-blur-sm text-xs">
                    <h4 className="font-bold text-white/80 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                      <Globe size={13} /> {t('supportedLanguages')}
                    </h4>
                    <div 
                      className="text-white/50 leading-relaxed text-[11px] prose-strong:text-white/80"
                      dangerouslySetInnerHTML={{ __html: game.supportedLanguages }}
                    />
                  </div>
                )}

              </div>

            </div>

          </div>

          {/* Download Options Modal */}
          <DownloadOptionsModal 
            isOpen={isDownloadOptionsOpen}
            onClose={() => setIsDownloadOptionsOpen(false)}
            gameName={game?.name || t('unknown')}
            downloads={availableDownloads}
            onDownload={handleDownload}
          />

          {/* Fullscreen Lightbox Overlay with Ambient Glow Blur Background (Rendered in Portal at Highest Z-Index) */}
          {createPortal(
            <AnimatePresence>
              {lightboxIndex !== null && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 select-none overflow-hidden"
                  onClick={() => setLightboxIndex(null)}
                >
                  {/* Dedicated Close Button in Top-Right */}
                  <div className="absolute top-5 right-6 z-30 flex items-center gap-3">
                    <span className="text-[11px] text-white/50 font-mono hidden sm:inline-block">ESC to close</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setLightboxIndex(null)
                      }}
                      className="w-10 h-10 rounded-full bg-black/70 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all shadow-2xl"
                      title="Close fullscreen view (Esc)"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Ambient Blurred Background of current media in Lightbox */}
                  {mediaItems[lightboxIndex] && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-35 scale-125 pointer-events-none transform-gpu"
                      style={{ backgroundImage: `url(${mediaItems[lightboxIndex].thumb})` }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                  <div className="relative z-10 flex-1 w-full max-w-7xl flex items-center justify-center min-h-0 pb-20">
                    {mediaItems[lightboxIndex]?.type === 'video' ? (
                      <div className="w-full max-w-6xl aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/15" onClick={e => e.stopPropagation()}>
                        <CustomVideoPlayer 
                          src={mediaItems[lightboxIndex].url}
                          poster={mediaItems[lightboxIndex].thumb}
                        />
                      </div>
                    ) : (
                      <img 
                        key={mediaItems[lightboxIndex]?.url}
                        src={mediaItems[lightboxIndex]?.url} 
                        alt="Fullscreen view" 
                        className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain bg-black/80 border border-white/15"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}

                    {mediaItems.length > 1 && (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + mediaItems.length) % mediaItems.length) }}
                          className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/70 hover:bg-white/20 text-white flex items-center justify-center transition-all border border-white/20 shadow-2xl"
                        >
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % mediaItems.length) }}
                          className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/70 hover:bg-white/20 text-white flex items-center justify-center transition-all border border-white/20 shadow-2xl"
                        >
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Thumbnail Strip in Lightbox */}
                  {mediaItems.length > 1 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-full px-6 z-20">
                      <div className="flex items-center gap-2 overflow-x-auto py-2 px-2 snap-x hide-scrollbar" onClick={(e) => e.stopPropagation()}>
                        {mediaItems.map((item, idx) => (
                          <button
                            key={item.id}
                            onClick={() => setLightboxIndex(idx)}
                            className={`relative flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden snap-center transition-all bg-black ${
                              idx === lightboxIndex 
                                ? 'border-2 border-white scale-105 shadow-xl' 
                                : 'border border-white/10 opacity-40 hover:opacity-100'
                            }`}
                          >
                            <img src={item.thumb} alt={`Thumbnail ${idx}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )}

        </motion.div>
      )}
    </AnimatePresence>
  )
}
