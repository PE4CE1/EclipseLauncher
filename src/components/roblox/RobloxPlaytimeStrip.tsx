import { desktopFetch as fetch } from '../../services/httpClient'
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Clock, Play, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, KeyRound } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { POPULAR_ROBLOX_GAMES } from './RobloxPopularGames'
import type { RobloxTrackedExperience } from '../../types/game'

interface RobloxPlaytimeStripProps {
  onSelectGame?: (gameName: string) => void
}

export const RobloxPlaytimeStrip: React.FC<RobloxPlaytimeStripProps> = ({ onSelectGame }) => {
  const { t } = useTranslation()
  const installedGames = useGameStore(state => state.installedGames)
  const library = useGameStore(state => state.library)

  const [experiences, setExperiences] = useState<RobloxTrackedExperience[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [isSyncing, setIsSyncing] = useState(false)

  // Carousel ref and mouse grab-to-scroll state
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeftPos, setScrollLeftPos] = useState(0)
  const [hasMoved, setHasMoved] = useState(false)

  // Find total Roblox playtime from installed games or library
  const totalRobloxMinutes = useMemo(() => {
    const robloxGame = installedGames.find(g =>
      g.id === 'roblox' ||
      g.steamId === 999001 ||
      g.name.toLowerCase() === 'roblox'
    ) || library.find(g =>
      g.id === 'roblox' ||
      g.steamId === 999001 ||
      g.name.toLowerCase() === 'roblox'
    )
    return robloxGame?.playTimeMinutes || 0
  }, [installedGames, library])

  // Load experience playtime records from IPC & disk
  const loadPlaytime = useCallback(async (autoSyncIfEmpty = false) => {
    let list: RobloxTrackedExperience[] = []

    if (window.electronAPI?.roblox?.getExperiencePlaytime) {
      try {
        const res = await window.electronAPI.roblox.getExperiencePlaytime()
        if (Array.isArray(res)) {
          list = res
        }
      } catch (_) {}
    }

    // Fallback to playtime db if IPC method not available or returned empty
    if (list.length === 0 && window.electronAPI?.getPlaytime) {
      try {
        const diskDb = await window.electronAPI.getPlaytime()
        if (diskDb) {
          const tempMap: Record<string, { placeId: string; name: string; minutes: number; lastPlayed: number }> = {}
          for (const [key, val] of Object.entries(diskDb)) {
            if (key.startsWith('roblox_exp_') || key.startsWith('roblox_')) {
              const cleanKey = key.replace(/^roblox_exp_|^roblox_/, '')
              if (cleanKey && Number(val.playTimeMinutes) > 0) {
                tempMap[cleanKey] = {
                  placeId: cleanKey,
                  name: val.name || 'Roblox Experience',
                  minutes: val.playTimeMinutes || 0,
                  lastPlayed: val.lastPlayed || 0
                }
              }
            }
          }
          list = Object.values(tempMap)
        }
      } catch (_) {}
    }

    // If still empty and autoSync requested, trigger a background log backfill
    if (list.length === 0 && autoSyncIfEmpty && window.electronAPI?.roblox?.syncPlaytime) {
      try {
        setIsSyncing(true)
        const synced = await window.electronAPI.roblox.syncPlaytime()
        if (Array.isArray(synced) && synced.length > 0) {
          list = synced
        }
      } catch (_) {} finally {
        setIsSyncing(false)
      }
    }

    // Match with popular games for nice titles and thumbnails
    const thumbMap: Record<string, string> = {}
    for (const exp of list) {
      const pop = POPULAR_ROBLOX_GAMES.find(g => g.placeId === exp.placeId || (exp.universeId && g.universeId === exp.universeId))
      if (pop) {
        if (!exp.name || exp.name === 'Roblox Experience') {
          exp.name = pop.name
        }
      }
      if (exp.iconUrl) {
        thumbMap[exp.placeId] = exp.iconUrl
      }
    }

    setThumbnails(prev => ({ ...prev, ...thumbMap }))
    setExperiences(list.sort((a, b) => b.minutes - a.minutes))
  }, [])

  useEffect(() => {
    loadPlaytime(true)

    // Listen for custom playtime updates from IPC and window events
    const handleUpdate = () => loadPlaytime(false)
    window.addEventListener('roblox:playtime-updated', handleUpdate)
    const unsubIpc = window.electronAPI?.roblox?.onPlaytimeUpdated?.(handleUpdate)
    return () => {
      window.removeEventListener('roblox:playtime-updated', handleUpdate)
      unsubIpc?.()
    }
  }, [loadPlaytime])

  // Batch fetch thumbnails for any missing icons (high-res 512x512)
  useEffect(() => {
    const missingPlaceIds = experiences
      .map(e => e.placeId)
      .filter(id => id && !thumbnails[id])

    if (missingPlaceIds.length === 0) return

    const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${missingPlaceIds.slice(0, 40).join(',')}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data?.data && Array.isArray(data.data)) {
          const map: Record<string, string> = {}
          for (const item of data.data) {
            if (item.targetId && item.imageUrl) {
              map[String(item.targetId)] = item.imageUrl
            }
          }
          setThumbnails(prev => ({ ...prev, ...map }))
        }
      })
      .catch(() => {})
  }, [experiences, thumbnails])

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      if (window.electronAPI?.roblox?.syncPlaytime) {
        const synced = await window.electronAPI.roblox.syncPlaytime()
        if (Array.isArray(synced)) {
          setExperiences(synced)
        }
      } else {
        await loadPlaytime(false)
      }
    } catch (_) {} finally {
      setIsSyncing(false)
    }
  }

  const formatMinutes = (minutes: number) => {
    if (!minutes || minutes <= 0) return null
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }
    return `${mins}m`
  }

  const formatTotalTime = (minutes: number) => {
    if (!minutes || minutes <= 0) return '0h'
    const hours = (minutes / 60).toFixed(1).replace(/\.0$/, '')
    return `${hours} Std.`
  }

  // Horizontal scroll with navigation buttons
  const handleScroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 500
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth'
    })
  }

  // Mouse Grab & Drag to scroll horizontally
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return
    setIsDragging(true)
    setHasMoved(false)
    setStartX(e.pageX - scrollRef.current.offsetLeft)
    setScrollLeftPos(scrollRef.current.scrollLeft)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    if (Math.abs(walk) > 4) {
      setHasMoved(true)
    }
    scrollRef.current.scrollLeft = scrollLeftPos - walk
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  const handleOpenWebsite = (e: React.MouseEvent, placeId: string) => {
    e.stopPropagation()
    const webUrl = `https://www.roblox.com/games/${placeId}`
    if (window.electronAPI?.openUrl) {
      window.electronAPI.openUrl(webUrl)
    } else {
      window.open(webUrl, '_blank')
    }
  }

  const handleLaunchGame = async (e: React.MouseEvent, placeId: string, gameName: string) => {
    e.stopPropagation()
    const robloxUri = `roblox://placeId=${placeId}`
    const webFallback = `https://www.roblox.com/games/${placeId}`

    useUIStore.getState().showNotification(
      t('robloxLaunchingGame', { name: gameName }) || `Starte ${gameName} auf Roblox…`,
      'info',
      'Roblox'
    )

    try {
      useGameStore.getState().startPlaySession(robloxUri, `Roblox - ${gameName}`)
    } catch (_) {}

    try {
      if (window.electronAPI?.launchGame) {
        const res = await window.electronAPI.launchGame(robloxUri)
        if (!res?.success && window.electronAPI.openUrl) {
          await window.electronAPI.openUrl(robloxUri)
        }
      } else if (window.electronAPI?.openUrl) {
        await window.electronAPI.openUrl(robloxUri)
      } else {
        window.location.href = robloxUri
      }
    } catch {
      if (window.electronAPI?.openUrl) {
        window.electronAPI.openUrl(webFallback)
      } else {
        window.open(webFallback, '_blank')
      }
    }
  }

  const handleCardClick = (gameName: string) => {
    if (hasMoved) return
    if (onSelectGame) {
      onSelectGame(gameName)
    }
    window.dispatchEvent(new CustomEvent('roblox:select-game-codes', { detail: { gameName } }))

    const hubEl = document.getElementById('roblox-codes-hub')
    if (hubEl) {
      hubEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="w-full px-6 md:px-10 xl:px-14 py-3 select-none">
      {/* ─── Minimalist Header matching Popular Experiences ─────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <Clock size={13} />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              {t('robloxPlaytimeByGame') || 'Spielzeit pro Erlebnis'}
            </h3>
            <span className="text-[11px] text-white/30 hidden sm:inline-block font-medium">
              • {formatTotalTime(totalRobloxMinutes)}  {t('uiTotal')}
            </span>
          </div>
        </div>

        {/* Action Controls & Navigation Arrows */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 active:scale-95 shadow-sm"
            title={t('uiScanRoblox')}
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
          </button>

          <div className="h-4 w-[1px] bg-white/10 mx-0.5 hidden sm:block" />

          <button
            onClick={() => handleScroll('left')}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm"
            title={t('uiSwipeLeft')}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => handleScroll('right')}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm"
            title={t('uiSwipeRight')}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ─── Horizontal Experience Cards (Draggable & Swipeable) ─────────────── */}
      {experiences.length > 0 ? (
        <div
          ref={scrollRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className={`flex items-stretch gap-3 overflow-x-auto hide-scrollbar select-none py-1 px-1 ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {experiences.map((game) => {
            const timeFormatted = formatMinutes(game.minutes)
            const thumbUrl = thumbnails[game.placeId] || game.iconUrl

            return (
              <div
                key={game.placeId}
                onClick={() => handleCardClick(game.name)}
                className="group relative w-[210px] sm:w-[225px] flex-shrink-0 rounded-2xl bg-[#0b0c10]/90 border border-white/[0.07] hover:border-emerald-500/30 transition-all duration-200 overflow-hidden flex flex-col justify-between hover:shadow-[0_8px_24px_rgba(16,185,129,0.15)] cursor-pointer"
              >
                {/* 16:10 Thumbnail Cover */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#10121a]">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={game.name}
                      loading="lazy"
                      draggable={false}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/[0.03] flex items-center justify-center text-xs font-bold text-white/20">
                      ROBLOX
                    </div>
                  )}

                  {/* Subtle Vignette Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-transparent to-black/30 pointer-events-none" />

                  {/* Top Playtime Badge (Glowing Emerald) */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-emerald-500/30 text-[10px] font-bold text-emerald-400 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <span>{timeFormatted || '1m'}</span>
                  </div>

                  {/* Hover Quick-Action Overlay */}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-2 z-20">
                    {/* Direct Launch Play Button */}
                    <button
                      onClick={(e) => handleLaunchGame(e, game.placeId, game.name)}
                      className="h-8 px-3 rounded-xl bg-white hover:bg-gray-100 text-black text-xs font-bold transition-transform hover:scale-105 flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
                      title={`${game.name} jetzt spielen`}
                    >
                      <Play size={11} className="fill-current" />
                      <span>{t('robloxPlayNow') || t('uiPlaying')}</span>
                    </button>

                    {/* Open Website Button */}
                    <button
                      onClick={(e) => handleOpenWebsite(e, game.placeId)}
                      className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-transform hover:scale-105 cursor-pointer active:scale-95"
                      title={t('uiOpenRoblox')}
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>

                {/* Minimalist Card Details */}
                <div className="p-3 flex items-center justify-between gap-2 border-t border-white/[0.04]">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors truncate">
                      {game.name}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-0.5">
                      <span className="text-emerald-400/90 font-medium">
                        {timeFormatted ? `${timeFormatted} gespielt` : 'Gerade entdeckt'}
                      </span>
                    </div>
                  </div>

                  {/* Codes Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCardClick(game.name)
                    }}
                    className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] hover:border-white/20 text-amber-300 text-[11px] font-semibold transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer"
                    title={t('uiViewCodes')}
                  >
                    <KeyRound size={10} className="text-amber-400" />
                    <span>Codes</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 py-3 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-white/40 text-xs">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-white/30" />
            <span className="text-xs text-white/60">

              {t('uiRobloxTracking')}
            </span>
          </div>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold uppercase tracking-wider px-3 py-1 rounded-lg bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSyncing ? 'Scanne Logs…' : 'Logs prüfen'}
          </button>
        </div>
      )}
    </div>
  )
}
