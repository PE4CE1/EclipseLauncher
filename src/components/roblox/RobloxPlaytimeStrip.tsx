import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Clock, Play, ExternalLink, RefreshCw } from 'lucide-react'
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

  // Batch fetch thumbnails for any missing icons
  useEffect(() => {
    const missingPlaceIds = experiences
      .map(e => e.placeId)
      .filter(id => id && !thumbnails[id])

    if (missingPlaceIds.length === 0) return

    const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${missingPlaceIds.slice(0, 40).join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`

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
    <div className="w-full px-6 md:px-10 xl:px-14 py-2 select-none">
      <div className="bg-[#0b0c10]/80 border border-white/[0.06] rounded-2xl p-3.5 backdrop-blur-md">
        {/* Header Strip */}
        <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Clock size={13} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {t('robloxPlaytimeByGame') || 'Spielzeit pro Erlebnis'}
              </span>
              <span className="hidden sm:inline-block text-[11px] text-white/30 font-medium">
                • {formatTotalTime(totalRobloxMinutes)} gesamt
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="w-6 h-6 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-white/50 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-40"
              title="Roblox-Logs scannen & aktualisieren"
            >
              <RefreshCw size={11} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
            </button>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-medium text-white/60">
              <span>{t('robloxTotalTime') || 'Gesamt'}:</span>
              <span className="font-bold text-white tracking-wide">
                {formatTotalTime(totalRobloxMinutes)}
              </span>
            </div>
          </div>
        </div>

        {/* Horizontal Experience Track or Minimalist Fallback */}
        {experiences.length > 0 ? (
          <div className="flex items-center gap-2.5 overflow-x-auto hide-scrollbar py-1">
            {experiences.map((game) => {
              const timeFormatted = formatMinutes(game.minutes)
              const thumbUrl = thumbnails[game.placeId] || game.iconUrl

              return (
                <div
                  key={game.placeId}
                  onClick={() => handleCardClick(game.name)}
                  className="group relative flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-all duration-150 cursor-pointer min-w-[230px] max-w-[270px] flex-shrink-0 bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] hover:border-white/20 shadow-sm"
                >
                  {/* Thumbnail Avatar & Info */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 relative">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={game.name}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/[0.04] flex items-center justify-center text-[9px] font-bold text-white/30">
                          RBX
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white/90 truncate group-hover:text-white transition-colors">
                        {game.name}
                      </p>
                      <p className="text-[11px] font-medium text-emerald-400">
                        {timeFormatted || '1m'}
                      </p>
                    </div>
                  </div>

                  {/* Clean Direct Action Buttons (Always accessible) */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Open Website Button */}
                    <button
                      onClick={(e) => handleOpenWebsite(e, game.placeId)}
                      className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.12] border border-white/[0.08] text-white/60 hover:text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                      title={`${game.name} auf Roblox.com öffnen`}
                    >
                      <ExternalLink size={11} />
                    </button>

                    {/* Direct Launch Play Button */}
                    <button
                      onClick={(e) => handleLaunchGame(e, game.placeId, game.name)}
                      className="h-7 px-2.5 rounded-lg bg-white hover:bg-gray-100 text-black text-[11px] font-bold flex items-center gap-1 transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                      title={`${game.name} direkt in Roblox starten`}
                    >
                      <Play size={10} className="fill-current" />
                      <span>{t('robloxPlayNow') || 'Spielen'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-white/40 text-xs">
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-white/30" />
              <span className="text-[11px] text-white/50">
                Roblox-Erlebnisse werden automatisch erfasst, sobald du spielst.
              </span>
            </div>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? 'Scanne Logs…' : 'Logs prüfen'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
