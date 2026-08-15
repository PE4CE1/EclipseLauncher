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
const coverCache = new Map<string, { url: string; isVertical: boolean }>()

/** Cover art with background preloading, instant memory cache, and zero-flicker shimmer */
export const LibraryCoverArt = React.memo(function LibraryCoverArt({ game }: { game: LibraryGame | (InstalledGame & { isInstalled: boolean }) }) {
  const cacheKey = `${game.name}_${'steamId' in game ? game.steamId : ''}_${'appId' in game ? game.appId : ''}_${game.id}`
  const initialCached = coverCache.get(cacheKey) || null

  const [resolvedId, setResolvedId] = useState<number | undefined>(() => {
    if ('steamId' in game && typeof game.steamId === 'number' && game.steamId > 0) return game.steamId
    if ('appId' in game && game.appId && !isNaN(Number(game.appId)) && Number(game.appId) > 0) return Number(game.appId)
    if (typeof game.id === 'string' && game.id.startsWith('steam-')) {
      const parsed = Number(game.id.replace('steam-', ''))
      if (!isNaN(parsed) && parsed > 0) return parsed
    }
    if (!isNaN(Number(game.id)) && Number(game.id) > 0) return Number(game.id)
    return undefined
  })

  useEffect(() => {
    if (!resolvedId && game.name) {
      findSteamIdByName(game.name).then(id => {
        if (id) setResolvedId(id)
      })
    }
  }, [game.name, resolvedId])

  const [activeCover, setActiveCover] = useState<{ url: string; isVertical: boolean } | null>(initialCached)
  const [isLoading, setIsLoading] = useState(!initialCached)

  useEffect(() => {
    if (initialCached) {
      setActiveCover(initialCached)
      setIsLoading(false)
      return
    }

    let isMounted = true
    setIsLoading(true)

    const candidates: { url: string; isVertical: boolean }[] = []
    if (resolvedId) {
      // 1. Vertical 600x900
      candidates.push({ url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${resolvedId}/library_600x900.jpg`, isVertical: true })
      candidates.push({ url: `https://cdn.akamai.steamstatic.com/steam/apps/${resolvedId}/library_600x900.jpg`, isVertical: true })
      // 2. Wide Header / Banner / Capsule
      candidates.push({ url: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedId}/header.jpg`, isVertical: false })
      candidates.push({ url: `https://cdn.akamai.steamstatic.com/steam/apps/${resolvedId}/header.jpg`, isVertical: false })
      candidates.push({ url: `https://cdn.akamai.steamstatic.com/steam/apps/${resolvedId}/capsule_617x283.jpg`, isVertical: false })
      candidates.push({ url: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedId}/library_hero.jpg`, isVertical: false })
    }
    if ('coverImage' in game && game.coverImage) {
      candidates.push({ url: game.coverImage, isVertical: false })
    }
    if ('iconUrl' in game && game.iconUrl) {
      candidates.push({ url: game.iconUrl, isVertical: false })
    }

    if (candidates.length === 0) {
      setIsLoading(false)
      setActiveCover(null)
      return
    }

    let idx = 0
    const tryNext = () => {
      if (!isMounted) return
      if (idx >= candidates.length) {
        setIsLoading(false)
        setActiveCover(null)
        return
      }

      const candidate = candidates[idx]
      const img = new Image()
      img.src = candidate.url
      img.onload = () => {
        if (!isMounted) return
        coverCache.set(cacheKey, candidate)
        setActiveCover(candidate)
        setIsLoading(false)
      }
      img.onerror = () => {
        if (!isMounted) return
        idx++
        tryNext()
      }
    }

    tryNext()

    return () => {
      isMounted = false
    }
  }, [resolvedId, game.name, cacheKey, initialCached])

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0c0d12]">
      {/* ─── Ultra-Clean Modern Skeleton Shimmer ─── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0b0e] select-none overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.03),transparent_70%)] pointer-events-none" />

            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{
                background: 'linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.015) 35%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.015) 65%, transparent 100%)',
              }}
            />

            <motion.div 
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="relative z-10 w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-md flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] mb-3"
            >
              <Gamepad2 size={20} className="text-white/40" />
            </motion.div>

            <div className="relative z-10 flex flex-col items-center gap-1.5 w-full px-6">
              <div className="w-16 h-1 rounded-full bg-white/[0.04]" />
              <div className="w-10 h-1 rounded-full bg-white/[0.02]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Case 1: Real Vertical 600x900 Poster ─── */}
      {activeCover && activeCover.isVertical && (
        <img
          key={activeCover.url}
          src={activeCover.url}
          alt={game.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}

      {/* ─── Case 2: Horizontal Header / Capsule (Mirrored Ambient Background + Centered Crisp Art) ─── */}
      {activeCover && !activeCover.isVertical && (
        <div className="relative w-full h-full overflow-hidden bg-[#0a0b0f] flex items-center justify-center p-3 select-none">
          <img
            src={activeCover.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover filter blur-xl scale-150 opacity-40 brightness-75 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40 pointer-events-none" />

          <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-10">
            <span className="text-[9px] font-semibold tracking-widest uppercase text-white/50 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 shadow-sm">
              PREVIEW
            </span>
          </div>

          <div className="relative z-10 w-full aspect-[16/9] rounded-lg overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.85)] border border-white/15 transform group-hover:scale-105 transition-transform duration-500">
            <img
              src={activeCover.url}
              alt={game.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* ─── Case 3: No image found at all — Smooth Deluxe Fallback Box Art ─── */}
      {!isLoading && !activeCover && (
        <img
          src={getPlaceholderCover(game.name)}
          alt={game.name}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  )
})

interface GridCardProps {
  game: LibraryGame | (InstalledGame & { isInstalled: boolean })
  isFav: boolean
  isInstalled: boolean
  isPlaying: boolean
  isKillingThis: boolean
  onOpenDetails: (game: any) => void
  onToggleFavorite: (id: string) => void
  onLaunchGame: (url: string, name: string) => void
  onStopGame: (id: string) => void
}

/** Memoized Grid Card for 120fps smooth scrolling */
const LibraryGridCard = React.memo(function LibraryGridCard({
  game,
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
    <div
      id={`library-grid-item-${game.id}`}
      style={{
        contain: 'paint layout style',
        contentVisibility: 'auto',
        containIntrinsicSize: '200px 300px',
        transform: 'translateZ(0)',
      }}
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
    </div>
  )
})

interface ListCardProps {
  game: LibraryGame | (InstalledGame & { isInstalled: boolean })
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
    <div
      id={`library-item-${game.id}`}
      style={{
        contain: 'paint layout style',
        contentVisibility: 'auto',
        containIntrinsicSize: '100% 64px',
        transform: 'translateZ(0)',
      }}
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
    </div>
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-hub-border/40 flex-shrink-0">
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
            <div className="flex items-center gap-1 bg-hub-surface rounded-lg p-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  id={`library-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-hub-elevated text-hub-text shadow-sm'
                      : 'text-hub-muted hover:text-hub-text'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-hub-muted" />
              <input
                id="library-search"
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search library…"
                className="w-full bg-hub-elevated/50 border border-white/10 rounded-full pl-9 pr-8 py-1.5 text-sm h-8 text-white placeholder-hub-muted/70 focus:outline-none focus:border-white/20 focus:bg-hub-elevated transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-hub-muted hover:text-white transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* View Mode Toggle Button */}
          <div className="flex items-center gap-1 bg-hub-surface border border-hub-border/40 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-hub-muted hover:text-white'
              }`}
              title="Grid View (Large Covers)"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list' ? 'bg-indigo-600 text-white shadow-sm' : 'text-hub-muted hover:text-white'
              }`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Game List / Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
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
            {filtered.map((game) => {
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
            {filtered.map((game) => {
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
