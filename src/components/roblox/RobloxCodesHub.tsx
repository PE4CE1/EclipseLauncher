import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Copy,
  Check,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  X,
  Bell,
  BellRing,
  KeyRound
} from 'lucide-react'
import { playNotificationSound } from '../../services/soundService'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import type { RobloxExperience, RobloxGameCodesResult } from '../../types/game'

const POPULAR_GAMES = [
  'Steal An Egg',
  'Brookhaven RP',
  'Blox Fruits',
  'Murder Mystery 2',
  'Adopt Me!',
  'Rivals',
  'Fisch',
  'Pet Simulator 99',
  'Dress to Impress',
  'Doors',
  "Sol's RNG",
  'Flee the Facility',
  'The Strongest Battlegrounds',
  'Berry Avenue RP',
  'Tower of Hell',
  'BedWars',
  "Dandy's World",
  'Anime Vanguards',
  'Blade Ball',
  'Tower Defense Simulator',
  'King Legacy',
  'Toilet Tower Defense',
  'Da Hood'
]

function cleanGameName(raw: string): string {
  let s = raw
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}/gu, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\b\d+(\.\d+)+\b/g, ' ')
    .replace(/\b(code|codes|update|release|event)\b/gi, ' ')
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s || raw.trim()
}

function isSameGame(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  if (na === nb) return true
  const ca = cleanGameName(a).toLowerCase().trim()
  const cb = cleanGameName(b).toLowerCase().trim()
  if (ca === cb) return true
  if (ca && cb && (ca.includes(cb) || cb.includes(ca))) return true
  return false
}

interface RobloxCodesHubProps {
  className?: string
}

export const RobloxCodesHub: React.FC<RobloxCodesHubProps> = ({ className = '' }) => {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t

  const [activeExp, setActiveExp] = useState<RobloxExperience | null>(null)
  const [selectedGame, setSelectedGame] = useState<string>('Steal An Egg')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [codesResult, setCodesResult] = useState<RobloxGameCodesResult | null>(null)
  const [isLoadingCodes, setIsLoadingCodes] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [showExpired, setShowExpired] = useState<boolean>(false)

  // ─── Sound Notification Settings & History ────────────────────────────────
  const [isSoundNotifyActive, setIsSoundNotifyActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('roblox_sound_notify') === 'true'
    } catch {
      return false
    }
  })
  const lastNotifiedGameRef = useRef<string>('')

  const toggleSoundNotify = () => {
    const next = !isSoundNotifyActive
    setIsSoundNotifyActive(next)
    try {
      localStorage.setItem('roblox_sound_notify', String(next))
    } catch {}

    if (next) {
      playNotificationSound('cosmic_shimmer')
      useUIStore.getState().showNotification(tRef.current('robloxCodesNotificationEnabled'), 'success', tRef.current('robloxCodesHubTitle'))
    } else {
      useUIStore.getState().showNotification(tRef.current('robloxCodesNotificationDisabled'), 'info', tRef.current('robloxCodesHubTitle'))
    }
  }

  // ─── Fetch Codes for a given Game (100% Stable Reference) ─────────────────
  const fetchCodesForGame = useCallback(async (gameName: string, placeId?: string, universeId?: string, forceRefresh = false) => {
    const clean = gameName.trim()
    if (!clean) return
    setIsLoadingCodes(true)
    try {
      let res: RobloxGameCodesResult | null = null
      if (window.electronAPI?.roblox?.getCodes) {
        res = await window.electronAPI.roblox.getCodes(clean, placeId, universeId, forceRefresh)
      } else {
        // Fallback for preview
        res = {
          gameName: clean,
          activeCodes: [
            { code: 'RELEASE', reward: 'Free Starter Pack & Coins' },
            { code: 'EASTER', reward: 'Free Boost & Speed' },
            { code: 'FREEGEMS', reward: '500 Free Gems' },
          ],
          expiredCodes: [
            { code: 'BETA', reward: '100 Gems', isExpired: true }
          ],
          lastUpdated: Date.now()
        }
      }
      setCodesResult(res)

      // ─── Sound & Notification Trigger when Codes are Discovered ───────────
      if (res && res.activeCodes && res.activeCodes.length > 0) {
        const notifyKey = `${clean.toLowerCase()}-${res.activeCodes.length}`
        let isSoundOn = false
        try {
          isSoundOn = localStorage.getItem('roblox_sound_notify') === 'true'
        } catch {}

        if (isSoundOn && lastNotifiedGameRef.current !== notifyKey) {
          lastNotifiedGameRef.current = notifyKey
          playNotificationSound('cosmic_shimmer')
          const gameTitle = cleanGameName(clean)
          const msg = tRef.current('robloxCodesFoundMessage', { count: res.activeCodes.length, game: gameTitle })
            || `🎉 ${res.activeCodes.length} aktive Codes für ${gameTitle} gefunden!`
          useUIStore.getState().showNotification(msg, 'success', tRef.current('robloxCodesFoundTitle') || 'Roblox Codes')

          // Native Windows Notification if available
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(tRef.current('robloxCodesFoundTitle') || 'Roblox Codes', {
                body: msg,
                icon: res.iconUrl || undefined
              })
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error('Failed to load Roblox codes:', err)
    } finally {
      setIsLoadingCodes(false)
    }
  }, [])

  // ─── Listen to Popular Game Select Events (Mounts Once) ───────────────────
  useEffect(() => {
    const handleCustomSelect = (e: any) => {
      const gName = e?.detail?.gameName
      if (gName) {
        setSelectedGame(gName)
        setSearchQuery('')
        fetchCodesForGame(gName)
      }
    }
    window.addEventListener('roblox:select-game-codes', handleCustomSelect)
    return () => window.removeEventListener('roblox:select-game-codes', handleCustomSelect)
  }, [fetchCodesForGame])

  // ─── Initialize Active Experience & Listeners (Mounts Once) ───────────────
  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    const init = async () => {
      try {
        if (window.electronAPI?.roblox?.getActiveExperience) {
          const exp = await window.electronAPI.roblox.getActiveExperience()
          if (exp?.name) {
            setActiveExp(exp)
            setSelectedGame(exp.name)
            fetchCodesForGame(exp.name, exp.placeId, exp.universeId)
            return
          } else {
            setActiveExp(null)
          }
        }
      } catch (e) {
        console.warn('Roblox initial experience check failed:', e)
        setActiveExp(null)
      }

      fetchCodesForGame('Steal An Egg')
    }

    init()

    if (window.electronAPI?.roblox?.onExperienceChange) {
      unsubscribe = window.electronAPI.roblox.onExperienceChange((exp) => {
        setActiveExp(exp)
        if (exp?.name) {
          setSelectedGame(exp.name)
          fetchCodesForGame(exp.name, exp.placeId, exp.universeId)
        }
      })
    }

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [fetchCodesForGame])

  // ─── Refresh Handler ──────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      let currentExp: any = null
      if (window.electronAPI?.roblox?.refreshExperience) {
        currentExp = await window.electronAPI.roblox.refreshExperience()
      }
      setActiveExp(currentExp)
      const isLive = currentExp && isSameGame(selectedGame, currentExp.name)
      await fetchCodesForGame(
        selectedGame,
        isLive ? currentExp?.placeId : undefined,
        isLive ? currentExp?.universeId : undefined,
        true
      )
    } catch (e) {
      console.error('Error refreshing Roblox experience:', e)
    } finally {
      setTimeout(() => setIsRefreshing(false), 400)
    }
  }

  // ─── Deduplicated Game List ───────────────────────────────────────────────
  const gameChips = useMemo(() => {
    const list: string[] = []
    const seen = new Set<string>()

    if (activeExp?.name) {
      list.push(activeExp.name)
      seen.add(cleanGameName(activeExp.name).toLowerCase().trim())
    }

    for (const g of POPULAR_GAMES) {
      const norm = cleanGameName(g).toLowerCase().trim()
      if (!seen.has(norm)) {
        list.push(g)
        seen.add(norm)
      }
    }

    return list
  }, [activeExp?.name])

  // ─── Selection ────────────────────────────────────────────────────────────
  const handleSelectGame = (game: string) => {
    setSelectedGame(game)
    setSearchQuery('')
    const isLive = activeExp && isSameGame(game, activeExp.name)
    fetchCodesForGame(game, isLive ? activeExp?.placeId : undefined, isLive ? activeExp?.universeId : undefined)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    const q = searchQuery.trim()
    setSelectedGame(q)
    const isLive = activeExp && isSameGame(q, activeExp.name)
    fetchCodesForGame(q, isLive ? activeExp?.placeId : undefined, isLive ? activeExp?.universeId : undefined)
  }

  // ─── Copy Code ────────────────────────────────────────────────────────────
  const handleCopyCode = async (code: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = code
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopiedCode(code)
      useUIStore.getState().showNotification(`${code} ${t('robloxCodeCopied')}`, 'success')
      setTimeout(() => {
        setCopiedCode(prev => (prev === code ? null : prev))
      }, 1800)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const activeCodes = codesResult?.activeCodes || []
  const expiredCodes = codesResult?.expiredCodes || []

  return (
    <div id="roblox-codes-hub" className={`w-full ${className} scroll-mt-24`}>
      <div className="bg-[#0b0c10]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 md:p-5">
        
        {/* ─── Minimalist Header: Title, Selected Game & Actions ────────── */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <KeyRound size={12} />
            </div>
            <span className="text-xs font-bold text-white tracking-wide">Codes</span>
            <span className="text-white/20">•</span>
            <span className="text-xs font-semibold text-white/80 truncate max-w-[160px] sm:max-w-[220px]">
              {cleanGameName(selectedGame)}
            </span>
            {activeCodes.length > 0 && (
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-md">
                {activeCodes.length} aktiv
              </span>
            )}
            {activeExp && isSameGame(activeExp.name, selectedGame) && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-400 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/40 text-[10px]">Live</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Sound Notification Icon Toggle */}
            <button
              onClick={toggleSoundNotify}
              className={`w-7 h-7 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
                isSoundNotifyActive
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white hover:bg-white/[0.08]'
              }`}
              title={isSoundNotifyActive ? t('robloxCodesFoundSoundOn') : t('robloxCodesFoundSoundOff')}
            >
              {isSoundNotifyActive ? <BellRing size={13} className="animate-pulse" /> : <Bell size={13} />}
            </button>

            {/* Refresh Icon */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoadingCodes}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-white/50 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
              title={t('robloxRefreshCodes')}
            >
              <RefreshCw size={12} className={isRefreshing || isLoadingCodes ? 'animate-spin text-amber-400' : ''} />
            </button>
          </div>
        </div>

        {/* ─── Minimal Search & Chips Row ───────────────────────────────── */}
        <div className="flex items-center gap-2 mb-3.5">
          {/* Subtle Compact Search */}
          <form onSubmit={handleSearchSubmit} className="relative w-32 sm:w-44 flex-shrink-0">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen…"
              className="w-full h-6 pl-6 pr-5 rounded-full bg-white/[0.03] hover:bg-white/[0.06] focus:bg-black/50 border border-white/[0.07] focus:border-white/20 text-[11px] text-white placeholder-white/30 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white cursor-pointer"
              >
                <X size={10} />
              </button>
            )}
          </form>

          {/* Minimalist Game Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5 flex-1">
            {gameChips.map((game) => {
              const isSelected = isSameGame(selectedGame, game)
              const isLive = activeExp && isSameGame(activeExp.name, game)

              return (
                <button
                  key={game}
                  onClick={() => handleSelectGame(game)}
                  className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'bg-white/[0.03] text-white/50 hover:text-white hover:bg-white/[0.07] border border-transparent'
                  }`}
                >
                  {isLive && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-emerald-600' : 'bg-emerald-400 animate-pulse'
                      }`}
                    />
                  )}
                  <span>{cleanGameName(game)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── Codes Grid (Minimalist Voucher Cards) ────────────────────── */}
        <div className="min-h-[75px]">
          {isLoadingCodes ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="relative h-12 rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden px-3 py-2 flex items-center justify-between gap-2 select-none"
                >
                  <div className="cover-shimmer-container">
                    <div className="cover-shimmer-wave" />
                  </div>
                  <div className="flex-1 space-y-1 z-10">
                    <div className="w-20 h-3 rounded bg-white/[0.08]" />
                    <div className="w-28 h-2 rounded bg-white/[0.04]" />
                  </div>
                  <div className="w-5 h-5 rounded bg-white/[0.04] z-10" />
                </div>
              ))}
            </div>
          ) : activeCodes.length === 0 ? (
            <div className="py-6 text-center text-xs text-white/30">
              {t('robloxNoCodesFound')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
              {activeCodes.map((item) => {
                const isCopied = copiedCode === item.code

                return (
                  <div
                    key={item.code}
                    onClick={() => handleCopyCode(item.code)}
                    className={`group relative px-3.5 py-2.5 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between gap-2.5 select-none ${
                      isCopied
                        ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                        : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] hover:border-white/15'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-xs font-bold text-white group-hover:text-amber-300 transition-colors tracking-wider">
                        {item.code}
                      </span>
                      <p className="text-[11px] text-white/40 truncate mt-0.5">
                        {item.reward || 'Belohnung'}
                      </p>
                    </div>

                    <div className="flex-shrink-0 flex items-center">
                      {isCopied ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                          <Check size={11} className="stroke-[2.5]" />
                          <span>Kopiert</span>
                        </span>
                      ) : (
                        <div className="w-6 h-6 rounded-lg bg-white/[0.04] group-hover:bg-white/10 text-white/30 group-hover:text-white flex items-center justify-center transition-colors">
                          <Copy size={11} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Expired Codes ────────────────────────────────────────────── */}
        {expiredCodes.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-white/[0.04]">
            <button
              onClick={() => setShowExpired(!showExpired)}
              className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>
                {showExpired ? t('robloxHideExpired') : t('robloxShowExpired')} ({expiredCodes.length})
              </span>
              <ChevronDown
                size={11}
                className={`transition-transform duration-150 ${showExpired ? 'rotate-180' : ''}`}
              />
            </button>

            {showExpired && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-2">
                {expiredCodes.map((item) => (
                  <div
                    key={item.code}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.015] border border-white/[0.03] text-[11px] flex items-center justify-between text-white/25"
                  >
                    <span className="font-mono line-through truncate">{item.code}</span>
                    <span className="text-[10px] text-white/20 truncate ml-1">{item.reward}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
