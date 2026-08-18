import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Library, Star, Gamepad2, Trash2, Play, Plus, Search, Heart, Download, LayoutGrid, List, X } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useUIStore } from '../../store/uiStore'
import { findSteamIdByName } from '../../services/steamService'
import { getCoverUrl, getHeaderUrl, getPlaceholderCover } from '../../services/assetHelper'
import type { LibraryGame, InstalledGame } from '../../types/game'
import steamLogoImg from '../../assets/steam-logo.png'

type TabId = 'all' | 'installed' | 'favorites' | 'custom'

const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

// Global instant asset resolution memory cache to eliminate repeat probes during scrolling
const coverCache = new Map<string, { url: string; isWide: boolean }>()

/** Ultra-fast Cover Art with hardware async decoding, smart hero banner fallback, and clean shimmer loading */
export const LibraryCoverArt = React.memo(function LibraryCoverArt({ game }: { game: LibraryGame | (InstalledGame & { isInstalled: boolean }) }) {
  const resolvedId = ('steamId' in game && typeof game.steamId === 'number' && game.steamId > 0)
    ? game.steamId
    : ('appId' in game && game.appId && !isNaN(Number(game.appId)) && Number(game.appId) > 0)
      ? Number(game.appId)
      : (typeof game.id === 'string' && game.id.startsWith('steam-'))
        ? Number(game.id.replace('steam-', ''))
        : (!isNaN(Number(game.id)) && Number(game.id) > 0)
          ? Number(game.id)
          : undefined

  const cacheKey = `${game.name}_${resolvedId || game.id}`
  const cached = coverCache.get(cacheKey)

  const [imgSrc, setImgSrc] = useState<string>(() => {
    if (cached) return cached.url
    if (resolvedId) {
      return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${resolvedId}/library_600x900.jpg`
    }
    if ('coverImage' in game && game.coverImage) return game.coverImage
    if ('iconUrl' in game && game.iconUrl) return game.iconUrl
    return getPlaceholderCover(game.name)
  })

  const [isWide, setIsWide] = useState<boolean>(() => cached ? cached.isWide : false)
  const [isLoaded, setIsLoaded] = useState<boolean>(() => !!cached)
  const [fallbackStage, setFallbackStage] = useState(0)

  const handleError = useCallback(() => {
    setIsLoaded(false)
    if (resolvedId && fallbackStage === 0) {
      setFallbackStage(1)
      setImgSrc(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedId}/library_600x900.jpg`)
    } else if (resolvedId && fallbackStage === 1) {
      setFallbackStage(2)
      setIsWide(true)
      // Smart top hero banner (like in the game detail / Meccha Chameleon view)
      setImgSrc(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedId}/library_hero.jpg`)
    } else if (resolvedId && fallbackStage === 2) {
      setFallbackStage(3)
      setIsWide(true)
      // Wide Header fallback
      setImgSrc(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedId}/header.jpg`)
    } else if (resolvedId && fallbackStage === 3) {
      setFallbackStage(4)
      setIsWide(true)
      // Wide Capsule fallback
      setImgSrc(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedId}/capsule_617x283.jpg`)
    } else if (resolvedId && fallbackStage === 4) {
      setFallbackStage(5)
      setIsWide(true)
      // Store page background screenshot
      setImgSrc(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedId}/page_bg_generated_v6.jpg`)
    } else {
      setIsWide(false)
      const placeholder = getPlaceholderCover(game.name)
      setImgSrc(placeholder)
      setIsLoaded(true)
      coverCache.set(cacheKey, { url: placeholder, isWide: false })
    }
  }, [resolvedId, fallbackStage, game.name, cacheKey])

  const handleLoad = useCallback(() => {
    setIsLoaded(true)
    coverCache.set(cacheKey, { url: imgSrc, isWide })
  }, [cacheKey, imgSrc, isWide])

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0c0d13] select-none">
      {/* ─── Ultra Clean Subtle Loading Shimmer ─── */}
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0b0f] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03),transparent_70%)]" />
          <div className="w-11 h-11 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center shadow-inner animate-pulse mb-2">
            <Gamepad2 size={18} className="text-white/20" />
          </div>
          <div className="w-14 h-1 rounded-full bg-white/[0.04] animate-pulse" />
        </div>
      )}

      {isWide ? (
        <div className="relative w-full h-full overflow-hidden bg-[#0a0b0f] flex items-center justify-center p-3">
          {/* Ambient Blurred Aura */}
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover filter blur-xl scale-150 opacity-40 brightness-75 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/50 pointer-events-none" />
          <div className="absolute top-2.5 inset-x-0 flex justify-center pointer-events-none z-10">
            <span className="text-[8px] font-bold tracking-widest uppercase text-white/70 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 shadow-sm">
              PREVIEW
            </span>
          </div>
          <div className="relative z-10 w-full aspect-[16/9] rounded-lg overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.85)] border border-white/15">
            <img
              src={imgSrc}
              alt={game.name}
              loading="lazy"
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
              className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>
        </div>
      ) : (
        <img
          src={imgSrc}
          alt={game.name}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
})

interface GridCardProps {
  game: LibraryGame | (InstalledGame & { isInstalled: boolean })
  index: number
  isFav: boolean
  isInstalled: boolean
  isPlaying: boolean
  isKillingThis: boolean
  onOpenDetails: (game: any) => void
  onToggleFavorite: (id: string) => void
  onLaunchGame: (url: string, name: string) => void
  onStopGame: (id: string) => void
}

/** Memoized Grid Card with 120fps hardware-accelerated entrance wave animation */
const LibraryGridCard = React.memo(function LibraryGridCard({
  game,
  index,
  isFav,
  isInstalled,
  isPlaying,
  isKillingThis,
  onOpenDetails,
  onToggleFavorite,
  onLaunchGame,
  onStopGame
}: GridCardProps) {
  const platform = game.platform

  return (
    <motion.div
      id={`library-grid-item-${game.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.018, 0.28), duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col rounded-xl bg-hub-surface border border-white/10 hover:border-white/40 hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] overflow-hidden transition-all duration-300 ease-out cursor-pointer will-change-transform"
      onClick={() => onOpenDetails(game)}
    >
      {/* Large Poster Cover Art (2:3 Aspect Ratio) */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-hub-elevated">
        <div className="w-full h-full transform group-hover:scale-[1.025] transition-transform duration-300 ease-out">
          <LibraryCoverArt game={game} />
        </div>

        {/* Clean Neutral Dark Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out flex flex-col justify-between p-3 z-10 pointer-events-none group-hover:pointer-events-auto">
          {/* Top Badges */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white/90 border border-white/10">
              {platform === 'steam' ? 'Steam' : platform === 'epic' ? 'Epic' : 'Custom'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(game.id)
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
                isFav ? 'bg-red-500/30 text-red-400 border border-red-500/40' : 'bg-black/60 text-white/70 hover:text-red-400 hover:bg-black/80 border border-white/10'
              }`}
            >
              <Heart size={13} className={isFav ? 'fill-red-400' : ''} />
            </button>
          </div>

          {/* Clean Action Button */}
          {'launchUrl' in game && game.launchUrl && (
            <div className="w-full">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isKillingThis) return
                  if (isPlaying) {
                    onStopGame(game.id as string)
                  } else {
                    onLaunchGame(game.launchUrl!, game.name)
                  }
                }}
                disabled={isKillingThis}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  isKillingThis
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : isPlaying
                      ? 'bg-red-500/90 hover:bg-red-500 text-white shadow-md'
                      : isInstalled
                        ? platform === 'steam' 
                          ? 'bg-[#1b2838] hover:bg-[#2a475e] border border-[#66c0f4]/30 text-white shadow-[0_0_10px_rgba(102,192,244,0.2)]'
                          : 'bg-white hover:bg-gray-200 text-black shadow-md'
                        : 'bg-white/15 hover:bg-white/25 text-white backdrop-blur-md border border-white/20'
                }`}
              >
                {isKillingThis ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> Cancel...
                  </>
                ) : isPlaying ? (
                  <>
                    <X size={12} className="text-white" /> Cancel
                  </>
                ) : isInstalled ? (
                  platform === 'steam' ? (
                    <>
                      <img src={steamLogoImg} className="w-3.5 h-3.5 object-contain" alt="Steam" /> Play Now
                    </>
                  ) : (
                    <>
                      <Play size={12} className="fill-black" /> Play Now
                    </>
                  )
                ) : (
                  <>
                    <Download size={12} className="text-white" /> Install
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Minimalist Card Footer */}
      <div className="p-3 bg-hub-surface flex flex-col justify-between flex-1 border-t border-hub-border/30 z-10">
        <p className="text-xs font-bold text-hub-text truncate group-hover:text-indigo-400 transition-colors">
          {game.name}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isInstalled ? 'bg-emerald-400' : 'bg-white/20'}`} />
            <span className={`text-[10px] font-medium ${isInstalled ? 'text-emerald-400' : 'text-hub-muted'}`}>
              {isInstalled ? 'Installed' : 'Library'}
            </span>
          </div>
          {'genres' in game && game.genres?.[0] && (
            <span className="text-[10px] text-hub-muted truncate max-w-[70px]">
              {game.genres[0]}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
})

interface ListCardProps {
  game: LibraryGame | (InstalledGame & { isInstalled: boolean })
  index: number
  isFav: boolean
  isInstalled: boolean
  isPlaying: boolean
  isKillingThis: boolean
  onOpenDetails: (game: any) => void
  onToggleFavorite: (id: string) => void
  onRemoveFromLibrary: (id: string) => void
  onLaunchGame: (url: string, name: string) => void
  onStopGame: (id: string) => void
}

/** Memoized List Card for fast performance */
const LibraryListCard = React.memo(function LibraryListCard({
  game,
  index,
  isFav,
  isInstalled,
  isPlaying,
  isKillingThis,
  onOpenDetails,
  onToggleFavorite,
  onRemoveFromLibrary,
  onLaunchGame,
  onStopGame
}: ListCardProps) {
  const platform = game.platform

  return (
    <motion.div
      id={`library-item-${game.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.015, 0.25), duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-4 p-3 rounded-xl bg-hub-surface border border-hub-border/30 hover:border-hub-border/60 hover:bg-hub-elevated transition-all group cursor-pointer"
      onClick={() => onOpenDetails(game)}
    >
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-hub-elevated flex-shrink-0">
        <LibraryCoverArt game={game} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-hub-text truncate">{game.name}</p>
          {isInstalled && (
            <span className="badge-installed text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0">
              Installed
            </span>
          )}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
            platform === 'steam' ? 'badge-steam' :
            platform === 'epic'  ? 'badge-epic'  : 'badge-custom'
          }`}>
            {platform === 'steam' ? 'Steam' : platform === 'epic' ? 'Epic' : 'Custom'}
          </span>
        </div>
        {'genres' in game && game.genres && (
          <p className="text-xs text-hub-muted mt-0.5 truncate">
            {game.genres.slice(0, 2).join(' · ')}
          </p>
        )}
        {'rating' in game && game.rating && (
          <div className="flex items-center gap-1 mt-0.5">
            <Star size={10} className="text-yellow-400 fill-yellow-400" />
            <span className="text-xs text-hub-muted">{Number(game.rating).toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {'launchUrl' in game && game.launchUrl && (
          <button
            id={`library-launch-${game.id}`}
            onClick={(e) => {
              e.stopPropagation()
              if (isKillingThis) return
              if (isPlaying) {
                onStopGame(game.id as string)
              } else {
                onLaunchGame(game.launchUrl!, game.name)
              }
            }}
            disabled={isKillingThis}
            className={`text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-all font-semibold ${
              isKillingThis
                ? 'bg-white/10 text-white/50 cursor-not-allowed'
                : isPlaying
                  ? 'bg-red-500/90 hover:bg-red-500 text-white shadow-md'
                  : isInstalled 
                    ? platform === 'steam'
                      ? 'bg-[#1b2838] hover:bg-[#2a475e] text-white border border-[#66c0f4]/30 shadow-[0_0_10px_rgba(102,192,244,0.2)]'
                      : 'bg-white hover:bg-gray-200 text-black shadow-md'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10'
            }`}
          >
            {isKillingThis ? (
              <>
                <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> Cancel...
              </>
            ) : isPlaying ? (
              <>
                <X size={11} className="text-white" /> Cancel
              </>
            ) : isInstalled ? (
              platform === 'steam' ? (
                <>
                  <img src={steamLogoImg} className="w-3 h-3 object-contain" alt="Steam" /> Play Now
                </>
              ) : (
                <>
                  <Play size={11} className="fill-black" /> Play Now
                </>
              )
            ) : (
              <>
                <Download size={11} className="text-white" /> Install
              </>
            )}
          </button>
        )}
        <button
          id={`library-fav-${game.id}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(game.id)
          }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
            isFav
              ? 'text-red-400 bg-red-500/10'
              : 'text-hub-muted hover:text-red-400 hover:bg-red-500/10'
          }`}
          aria-label="Toggle favorite"
        >
          <Heart size={14} className={isFav ? 'fill-red-400' : ''} />
        </button>
        {!isInstalled && (
          <button
            id={`library-remove-${game.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onRemoveFromLibrary(game.id)
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-hub-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
            aria-label="Remove from library"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </motion.div>
  )
})

export function LibraryView() {
  const { library, removeFromLibrary, toggleFavorite, favoriteIds, installedGames, setInstalledGames, activeGame, stopPlaySession } = useGameStore()
  const { launchGame, addCustomGame } = useScanner()
  const { showNotification } = useUIStore()
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [killingGameId, setKillingGameId] = useState<string | null>(null)

  // Combine library + installed games (memoized with deduplication)
  const allGames = useMemo<Array<LibraryGame | (InstalledGame & { isInstalled: boolean })>>(() => {
    const map = new Map<string, LibraryGame | (InstalledGame & { isInstalled: boolean })>()

    // 1. Installed games take priority
    for (const ig of installedGames) {
      if (!ig || !ig.name) continue
      const normName = normalize(ig.name)
      const key = ig.appId ? `steam_${ig.appId}` : `name_${normName}`
      const val = { ...ig, isInstalled: ig.installed !== false }
      map.set(key, val)
      map.set(`name_${normName}`, val)
    }

    // 2. Library games merged without duplicates
    for (const lg of library) {
      if (!lg || !lg.name) continue
      const normName = normalize(lg.name)
      const steamKey = lg.steamId ? `steam_${lg.steamId}` : null
      const nameKey = `name_${normName}`

      if ((steamKey && map.has(steamKey)) || map.has(nameKey)) {
        continue
      }

      map.set(nameKey, lg)
      if (steamKey) map.set(steamKey, lg)
    }

    return Array.from(new Set(map.values()))
  }, [installedGames, library])

  const tabs = useMemo(() => [
    { id: 'all' as TabId,       label: 'All',       count: allGames.length },
    { id: 'installed' as TabId, label: 'Installed',  count: installedGames.filter(g => g.installed !== false).length },
    { id: 'custom' as TabId,    label: 'Custom',     count: library.filter(g => !installedGames.some(ig => ig.name === g.name)).length },
    { id: 'favorites' as TabId, label: 'Favorites',  count: favoriteIds.length },
  ], [allGames.length, installedGames, library, favoriteIds.length])

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    return allGames.filter(game => {
      if (s && !game.name.toLowerCase().includes(s)) return false
      const isFav = favoriteIds.includes(game.id)
      const isInstalled = 'isInstalled' in game ? game.isInstalled : game.installed
      
      if (activeTab === 'installed') return isInstalled
      if (activeTab === 'custom') return !('isInstalled' in game)
      if (activeTab === 'favorites') return isFav
      return true
    })
  }, [allGames, search, favoriteIds, activeTab])

  // Instant 0ms render: mount the visible viewport instantly, expand the rest in background frames
  const [visibleLimit, setVisibleLimit] = useState(48)

  useEffect(() => {
    setVisibleLimit(48)
  }, [search, activeTab])

  useEffect(() => {
    if (visibleLimit < filtered.length) {
      const timer = setTimeout(() => {
        setVisibleLimit(prev => Math.min(prev + 64, filtered.length))
      }, 20)
      return () => clearTimeout(timer)
    }
  }, [visibleLimit, filtered.length])

  const visibleGames = useMemo(() => {
    return filtered.slice(0, visibleLimit)
  }, [filtered, visibleLimit])

  const handleAddCustom = useCallback(async () => {
    const path = await addCustomGame()
    if (path) {
      const name = path.split('\\').pop()?.replace('.exe', '') || 'Custom Game'
      showNotification(`Added ${name} to library`, 'success')
    }
  }, [addCustomGame, showNotification])

  const openDetailsForGame = useCallback((game: any) => {
    const sId = typeof game.steamId === 'number' && game.steamId > 0
      ? game.steamId
      : ('appId' in game && game.appId && !isNaN(Number(game.appId)))
        ? Number(game.appId)
        : typeof game.id === 'number' && game.id > 0
          ? game.id
          : typeof game.id === 'string' && game.id.startsWith('steam-')
            ? Number(game.id.replace('steam-', ''))
            : undefined
    useUIStore.getState().openGameDetails(sId || 0, game.name)
  }, [])

  const handleLaunchGame = useCallback((url: string, name: string) => {
    launchGame(url, name)
  }, [launchGame])

  const handleStopGame = useCallback(async (gameId: string) => {
    setKillingGameId(gameId)
    try {
      if (window.electronAPI?.stopGame) {
        await window.electronAPI.stopGame()
      }
    } catch (e) {
      console.error('[LibraryView] Stop game error:', e)
    } finally {
      stopPlaySession()
      setKillingGameId(null)
    }
  }, [stopPlaySession])

  // Self-heal: attempt to resolve missing steam IDs once without loops
  const resolvedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    let changed = false
    const unresolved = installedGames.filter(g => !g.steamId && g.platform !== 'steam' && !resolvedRef.current.has(g.name))
    if (unresolved.length === 0) return

    unresolved.forEach(g => resolvedRef.current.add(g.name))

    const promises = unresolved.map(async (game) => {
      const id = await findSteamIdByName(game.name)
      if (id) {
        game.steamId = id
        changed = true
      }
    })
    
    Promise.all(promises).then(() => {
      if (changed) setInstalledGames([...installedGames])
    })
  }, [installedGames, setInstalledGames])

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden relative custom-scrollbar">
      {/* Header with authentic Frosted Glass Blur */}
      <div className="sticky top-0 z-20 px-6 pt-5 pb-4 border-b border-white/[0.08] bg-[#07080a]/80 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-hub-text">My Library</h2>
            <p className="text-sm text-hub-muted mt-0.5">{allGames.length} games</p>
          </div>
          <button
            id="library-add-custom"
            onClick={handleAddCustom}
            className="btn-ghost flex items-center gap-2 text-sm py-2"
          >
            <Plus size={14} />
            Add Game
          </button>
        </div>

        {/* Tabs + Search + View Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-lg p-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  id={`library-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white shadow-sm font-semibold'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                id="library-search"
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search library…"
                className="w-full bg-black/90 border border-white/10 hover:border-white/20 focus:border-white/30 rounded-full pl-9 pr-8 py-1.5 text-sm h-8 text-white placeholder-white/40 focus:outline-none focus:bg-black transition-all shadow-inner"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* View Mode Toggle Button */}
          <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
              title="Grid View (Large Covers)"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Game List / Grid */}
      <div className="px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Library size={48} className="text-hub-border mb-4" />
            <p className="text-hub-muted text-lg font-medium">
              {activeTab === 'installed' ? 'No installed games detected' :
               activeTab === 'favorites' ? 'No favorites yet' :
               'Your library is empty'}
            </p>
            <p className="text-hub-border text-sm mt-1">
              {activeTab === 'installed'
                ? 'Run a scan to detect Steam and Epic games'
                : 'Browse the Catalogue to add games'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View - Clean Minimalist Cover Cards */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleGames.map((game, i) => {
              const isInstalled = 'isInstalled' in game ? game.isInstalled : (game.installed ?? true)
              const isFav = favoriteIds.includes(game.id)
              const isPlaying = !!(activeGame && (
                normalize(activeGame.name) === normalize(game.name) ||
                activeGame.id === String(game.steamId) ||
                activeGame.id === game.launchUrl ||
                activeGame.id === game.id
              ))
              const isKillingThis = killingGameId === game.id

              return (
                <LibraryGridCard
                  key={game.id}
                  game={game}
                  index={i}
                  isFav={isFav}
                  isInstalled={isInstalled}
                  isPlaying={isPlaying}
                  isKillingThis={isKillingThis}
                  onOpenDetails={openDetailsForGame}
                  onToggleFavorite={toggleFavorite}
                  onLaunchGame={handleLaunchGame}
                  onStopGame={handleStopGame}
                />
              )
            })}
          </div>
        ) : (
          /* List View */
          <div className="grid gap-2">
            {visibleGames.map((game, i) => {
              const isInstalled = 'isInstalled' in game ? game.isInstalled : (game.installed ?? true)
              const isFav = favoriteIds.includes(game.id)
              const isPlaying = !!(activeGame && (
                normalize(activeGame.name) === normalize(game.name) ||
                activeGame.id === String(game.steamId) ||
                activeGame.id === game.launchUrl ||
                activeGame.id === game.id
              ))
              const isKillingThis = killingGameId === game.id

              return (
                <LibraryListCard
                  key={game.id}
                  game={game}
                  index={i}
                  isFav={isFav}
                  isInstalled={isInstalled}
                  isPlaying={isPlaying}
                  isKillingThis={isKillingThis}
                  onOpenDetails={openDetailsForGame}
                  onToggleFavorite={toggleFavorite}
                  onRemoveFromLibrary={removeFromLibrary}
                  onLaunchGame={handleLaunchGame}
                  onStopGame={handleStopGame}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
