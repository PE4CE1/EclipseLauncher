import { useTranslation } from '../../hooks/useTranslation'
import { SceneTransition } from '../shared/SceneTransition'
import { PosterArt as LibraryCoverArt } from '../shared/PosterArt'
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Library, Star, Trash2, Play, Plus, Search, Heart, Download, LayoutGrid, List, X } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useUIStore } from '../../store/uiStore'
import { findSteamIdByName, KNOWN_GAME_PREVIEWS, isPlaceholderAppName, extractAppIdFromPlaceholder, getKnownSteamGameName, resolveSteamAppName } from '../../services/steamService'
import type { LibraryGame, InstalledGame } from '../../types/game'
import steamLogoImg from '../../assets/steam-logo.png'
import { isLocallyInstalled } from '../../services/gameInstallation'
import { useShallow } from 'zustand/react/shallow'
import { WindowedGrid } from '../shared/WindowedGrid'

type TabId = 'all' | 'installed' | 'favorites' | 'custom'

const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

export { PosterArt as LibraryCoverArt } from '../shared/PosterArt'

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

/** Keep layout stable; only the fixed-aspect artwork skips offscreen painting. */
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
  const { t } = useTranslation()
  const platform = game.platform
  const numId = ('steamId' in game && typeof game.steamId === 'number' && game.steamId > 0)
    ? game.steamId
    : ('appId' in game && game.appId && !isNaN(Number(game.appId)) && Number(game.appId) > 0)
      ? Number(game.appId)
      : (typeof game.id === 'string' && game.id.startsWith('steam-'))
        ? Number(game.id.replace('steam-', ''))
        : (!isNaN(Number(game.id)) && Number(game.id) > 0)
          ? Number(game.id)
          : extractAppIdFromPlaceholder(game.name) || undefined
  const isPlaceholder = isPlaceholderAppName(game.name, numId)
  const knownName = numId ? getKnownSteamGameName(numId) : null
  const displayName = (isPlaceholder && knownName) ? knownName : game.name

  return (
    <div
      id={`library-grid-item-${game.id}`}
      className="game-card library-grid-card group relative flex flex-col rounded-xl bg-hub-surface border border-white/10 hover:border-white/40 hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] overflow-hidden transition-[background-color,border-color,box-shadow] duration-200 ease-out cursor-pointer"
      onClick={() => onOpenDetails(game)}
    >
      {/* Large Poster Cover Art (2:3 Aspect Ratio) */}
      <div className="library-card-art relative aspect-[2/3] w-full overflow-hidden bg-hub-elevated">
        <div className="w-full h-full">
          <LibraryCoverArt game={game} />
        </div>

        {/* Clean Neutral Dark Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out flex flex-col justify-between p-3 z-10 pointer-events-none group-hover:pointer-events-auto">
          {/* Top Badges */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-black/70 group-hover:backdrop-blur-md text-white/90 border border-white/10">
              {platform === 'steam' ? 'Steam' : platform === 'epic' ? 'Epic' : t('uiCustomGames')}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(game.id)
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center group-hover:backdrop-blur-md transition-colors ${
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
                    onLaunchGame(game.launchUrl!, displayName)
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
                        : 'bg-white/15 hover:bg-white/25 text-white group-hover:backdrop-blur-md border border-white/20'
                }`}
              >
                {isKillingThis ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />  {t('uiCancelling')}
                  </>
                ) : isPlaying ? (
                  <>
                    <X size={12} className="text-white" />  {t('cancel')}
                  </>
                ) : isInstalled ? (
                  platform === 'steam' ? (
                    <>
                      <img src={steamLogoImg} className="w-3.5 h-3.5 object-contain" alt="Steam" />  {t('playNow')}
                    </>
                  ) : (
                    <>
                      <Play size={12} className="fill-black" />  {t('playNow')}
                    </>
                  )
                ) : (
                  <>
                    <Download size={12} className="text-white" />  {t('uiInstall')}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Minimalist Card Footer */}
      <div className="p-3 bg-hub-surface flex flex-col justify-between flex-1 border-t border-hub-border/30 z-10">
        <p className="text-xs font-bold text-hub-text truncate group-hover:text-white transition-colors" title={displayName}>
          {displayName}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isInstalled ? 'bg-emerald-400' : 'bg-white/20'}`} />
            <span className={`text-[10px] font-medium ${isInstalled ? 'text-emerald-400' : 'text-hub-muted'}`}>
              {isInstalled ? t('installed') : 'Library'}
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
  const { t } = useTranslation()
  const platform = game.platform
  const numId = ('steamId' in game && typeof game.steamId === 'number' && game.steamId > 0)
    ? game.steamId
    : ('appId' in game && game.appId && !isNaN(Number(game.appId)) && Number(game.appId) > 0)
      ? Number(game.appId)
      : (typeof game.id === 'string' && game.id.startsWith('steam-'))
        ? Number(game.id.replace('steam-', ''))
        : (!isNaN(Number(game.id)) && Number(game.id) > 0)
          ? Number(game.id)
          : extractAppIdFromPlaceholder(game.name) || undefined
  const isPlaceholder = isPlaceholderAppName(game.name, numId)
  const knownName = numId ? getKnownSteamGameName(numId) : null
  const displayName = (isPlaceholder && knownName) ? knownName : game.name

  return (
    <div
      id={`library-item-${game.id}`}
      style={{
        contain: 'layout style',
      }}
      className="library-list-card flex items-center gap-4 p-3 rounded-xl bg-hub-surface border border-hub-border/30 hover:border-hub-border/60 hover:bg-hub-elevated transition-colors group cursor-pointer"
      onClick={() => onOpenDetails(game)}
    >
      <div className="library-list-art w-14 h-14 rounded-lg overflow-hidden bg-hub-elevated flex-shrink-0">
        <LibraryCoverArt game={game} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-hub-text truncate" title={displayName}>{displayName}</p>
          {isInstalled && (
            <span className="badge-installed text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0">

              {t('installed')}
            </span>
          )}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
            platform === 'steam' ? 'badge-steam' :
            platform === 'epic'  ? 'badge-epic'  : 'badge-custom'
          }`}>
            {platform === 'steam' ? 'Steam' : platform === 'epic' ? 'Epic' : t('uiCustomGames')}
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
                onLaunchGame(game.launchUrl!, displayName)
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
                    : 'bg-white/10 hover:bg-white/20 text-white group-hover:backdrop-blur-md border border-white/10'
            }`}
          >
            {isKillingThis ? (
              <>
                <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />  {t('uiCancelling')}
              </>
            ) : isPlaying ? (
              <>
                <X size={11} className="text-white" />  {t('cancel')}
              </>
            ) : isInstalled ? (
              platform === 'steam' ? (
                <>
                  <img src={steamLogoImg} className="w-3 h-3 object-contain" alt="Steam" />  {t('playNow')}
                </>
              ) : (
                <>
                  <Play size={11} className="fill-black" />  {t('playNow')}
                </>
              )
            ) : (
              <>
                <Download size={11} className="text-white" />  {t('uiInstall')}
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
          aria-label={t('uiToggleFavorite')}
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
            aria-label={t('uiRemoveLibrary')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
})

export function LibraryView() {
  const { t, locale } = useTranslation()
  const { library, removeFromLibrary, toggleFavorite, favoriteIds, installedGames, setInstalledGames, activeGame, stopPlaySession } = useGameStore(useShallow(({ library, removeFromLibrary, toggleFavorite, favoriteIds, installedGames, setInstalledGames, activeGame, stopPlaySession }) => ({ library, removeFromLibrary, toggleFavorite, favoriteIds, installedGames, setInstalledGames, activeGame, stopPlaySession })))
  const { launchGame, addCustomGame } = useScanner()
  const showNotification = useUIStore(s => s.showNotification)
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [killingGameId, setKillingGameId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Combine library + installed games (memoized with deduplication)
  const allGames = useMemo<Array<LibraryGame | (InstalledGame & { isInstalled: boolean })>>(() => {
    const map = new Map<string, LibraryGame | (InstalledGame & { isInstalled: boolean })>()

    // 1. Installed games take priority
    for (const ig of installedGames) {
      if (!ig || !ig.name) continue
      const numId = ig.steamId || (ig.appId ? Number(ig.appId) : extractAppIdFromPlaceholder(ig.name)) || undefined
      const cleanName = (numId && isPlaceholderAppName(ig.name, numId)) ? (getKnownSteamGameName(numId) || ig.name) : ig.name
      const gameWithCleanName = cleanName !== ig.name ? { ...ig, name: cleanName, steamId: numId || ig.steamId } : ig
      const normName = normalize(cleanName)
      const key = (numId || ig.appId) ? `steam_${numId || ig.appId}` : `name_${normName}`
      const val = { ...gameWithCleanName, isInstalled: isLocallyInstalled(ig) }
      map.set(key, val)
      map.set(`name_${normName}`, val)
    }

    // 2. Library games merged without duplicates
    for (const lg of library) {
      if (!lg || !lg.name) continue
      const numId = lg.steamId || (lg.appId ? Number(lg.appId) : extractAppIdFromPlaceholder(lg.name)) || undefined
      const cleanName = (numId && isPlaceholderAppName(lg.name, numId)) ? (getKnownSteamGameName(numId) || lg.name) : lg.name
      const gameWithCleanName = cleanName !== lg.name ? { ...lg, name: cleanName, steamId: numId || lg.steamId } : lg
      const normName = normalize(cleanName)
      const steamKey = (numId || lg.steamId) ? `steam_${numId || lg.steamId}` : null
      const nameKey = `name_${normName}`

      if ((steamKey && map.has(steamKey)) || map.has(nameKey)) {
        continue
      }

      const local = lg.platform === 'custom' && !!lg.installPath?.trim() && isLocallyInstalled(lg)
      const entry = { ...gameWithCleanName, installed: local }
      map.set(nameKey, entry)
      if (steamKey) map.set(steamKey, entry)
    }

    return Array.from(new Set(map.values()))
  }, [installedGames, library])

  const tabs = useMemo(() => [
    { id: 'all' as TabId,       label: t('uiAll'),       count: allGames.length },
    { id: 'installed' as TabId, label: t('installed'),  count: installedGames.filter(isLocallyInstalled).length },
    { id: 'custom' as TabId,    label: t('uiCustomGames'),     count: library.filter(g => !installedGames.some(ig => ig.name === g.name)).length },
    { id: 'favorites' as TabId, label: t('uiFavorites'),  count: favoriteIds.length },
  ], [allGames.length, installedGames, library, favoriteIds.length, t])

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
      showNotification(t('addedToLibrary', { name }), 'success')
    }
  }, [addCustomGame, showNotification, t])

  const openDetailsForGame = useCallback((game: any) => {
    const isRoblox = game.name?.toLowerCase() === 'roblox' || game.id === 'roblox' || game.steamId === 999001
    const sId = isRoblox
      ? 999001
      : typeof game.steamId === 'number' && game.steamId > 0
        ? game.steamId
        : ('appId' in game && game.appId && !isNaN(Number(game.appId)))
          ? Number(game.appId)
          : typeof game.id === 'number' && game.id > 0
            ? game.id
            : typeof game.id === 'string' && game.id.startsWith('steam-')
              ? Number(game.id.replace('steam-', ''))
              : extractAppIdFromPlaceholder(game.name) || undefined
    const isPlaceholder = isPlaceholderAppName(game.name, sId)
    const knownName = sId ? getKnownSteamGameName(sId) : null
    const finalName = (isPlaceholder && knownName) ? knownName : game.name
    useUIStore.getState().openGameDetails(sId || (isRoblox ? 999001 : 0), finalName)
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
        if (!game.iconUrl) {
          game.iconUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`
        }
        changed = true
      }
    })
    
    Promise.all(promises).then(() => {
      if (changed) setInstalledGames([...installedGames])
    })
  }, [installedGames, setInstalledGames])

  // Auto-resolve any remaining placeholder games in library or installedGames via online Steam lookup
  const placeholderResolvedRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    const toResolve: Array<{ numId: number; item: any }> = []
    for (const g of allGames) {
      const numId = ('steamId' in g && typeof g.steamId === 'number' && g.steamId > 0)
        ? g.steamId
        : ('appId' in g && g.appId && !isNaN(Number(g.appId)) && Number(g.appId) > 0)
          ? Number(g.appId)
          : (typeof g.id === 'string' && g.id.startsWith('steam-'))
            ? Number(g.id.replace('steam-', ''))
            : (!isNaN(Number(g.id)) && Number(g.id) > 0)
              ? Number(g.id)
              : extractAppIdFromPlaceholder(g.name) || undefined
      if (numId && isPlaceholderAppName(g.name, numId) && !placeholderResolvedRef.current.has(numId)) {
        placeholderResolvedRef.current.add(numId)
        toResolve.push({ numId, item: g })
      }
    }

    if (toResolve.length === 0) return

    let isMounted = true
    const runResolution = async () => {
      for (const { numId, item } of toResolve) {
        if (!isMounted) break
        const resolvedName = await resolveSteamAppName(numId)
        if (resolvedName && !isPlaceholderAppName(resolvedName, numId)) {
          const freshInstalled = useGameStore.getState().installedGames
          const freshLibrary = useGameStore.getState().library
          let instChanged = false
          let libChanged = false

          const updatedInstalled = freshInstalled.map(ig => {
            const igNum = ig.steamId || (ig.appId ? Number(ig.appId) : extractAppIdFromPlaceholder(ig.name))
            if (igNum === numId || ig.id === item.id) {
              instChanged = true
              return { ...ig, name: resolvedName, steamId: numId }
            }
            return ig
          })

          const updatedLibrary = freshLibrary.map(lg => {
            const lgNum = lg.steamId || (lg.appId ? Number(lg.appId) : extractAppIdFromPlaceholder(lg.name))
            if (lgNum === numId || lg.id === item.id) {
              libChanged = true
              return { ...lg, name: resolvedName, steamId: numId }
            }
            return lg
          })

          if (instChanged) useGameStore.getState().setInstalledGames(updatedInstalled)
          if (libChanged) useGameStore.getState().setLibrary(updatedLibrary)
        }
      }
    }
    runResolution()

    return () => {
      isMounted = false
    }
  }, [allGames])

  return (
    <div ref={scrollRef} data-windowed-scroll className="view-scroll h-full overflow-y-auto overflow-x-hidden relative custom-scrollbar">
      {/* Shared toolbar surface keeps the ambient background continuous. */}
      <div className="launcher-toolbar sticky top-0 z-20 px-6 pt-5 pb-4 border-b border-white/[0.08] bg-[#07080a]/80 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-hub-text">{t('uiMyLibrary')}</h2>
            <p className="text-sm text-hub-muted mt-0.5">{allGames.length === 1 ? t('uiOneGame') : t('uiGameCount', { count: allGames.length.toLocaleString(locale) })}</p>
          </div>
          <button
            id="library-add-custom"
            onClick={handleAddCustom}
            className="btn-ghost flex items-center gap-2 text-sm py-2"
          >
            <Plus size={14} />

            {t('uiAddGame')}
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
                placeholder={t('uiSearchLibrary')}
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
              id="library-view-grid"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
              title={t('uiGridView')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              id="library-view-list"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
              title={t('uiListView')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Game List / Grid */}
      <SceneTransition sceneKey={`${activeTab}:${viewMode}`} data-library-results className="px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Library size={48} className="text-hub-border mb-4" />
            <p className="text-hub-muted text-lg font-medium">
              {activeTab === 'installed' ? t('uiNoInstalledGames') :
               activeTab === 'favorites' ? t('uiNoFavorites') : t('uiEmptyLibrary')}
            </p>
            <p className="text-hub-border text-sm mt-1">
              {activeTab === 'installed'
                ? t('uiScanInstalled') : t('uiBrowseToAdd')}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View - Clean Minimalist Cover Cards */
          <WindowedGrid items={filtered} scrollRef={scrollRef} resetKey={`${activeTab}:grid:${search}`} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {(game) => {
              const isInstalled = 'isInstalled' in game ? game.isInstalled : (game.installed ?? true)
              const isFav = favoriteIds.includes(game.id)
              const isRoblox = game.name?.toLowerCase() === 'roblox' || game.id === 'roblox' || ('steamId' in game && game.steamId === 999001)
              const isPlaying = !!(activeGame && (
                (isRoblox && (normalize(activeGame.name) === 'roblox' || activeGame.id === 'roblox' || activeGame.id === '999001' || activeGame.id === 'Roblox')) ||
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
            }}
          </WindowedGrid>
        ) : (
          /* List View */
          <WindowedGrid items={filtered} scrollRef={scrollRef} resetKey={`${activeTab}:list:${search}`} className="grid gap-2">
            {(game) => {
              const isInstalled = 'isInstalled' in game ? game.isInstalled : (game.installed ?? true)
              const isFav = favoriteIds.includes(game.id)
              const isRoblox = game.name?.toLowerCase() === 'roblox' || game.id === 'roblox' || ('steamId' in game && game.steamId === 999001)
              const isPlaying = !!(activeGame && (
                (isRoblox && (normalize(activeGame.name) === 'roblox' || activeGame.id === 'roblox' || activeGame.id === '999001' || activeGame.id === 'Roblox')) ||
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
            }}
          </WindowedGrid>
        )}
      </SceneTransition>
    </div>
  )
}
