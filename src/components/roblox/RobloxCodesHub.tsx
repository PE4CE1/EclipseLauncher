import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Copy,
  Check,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  X
} from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import type { RobloxExperience, RobloxGameCodesResult } from '../../types/game'

const POPULAR_GAMES = [
  'Steal An Egg',
  'Blox Fruits',
  'Blade Ball',
  'Pet Simulator 99',
  'King Legacy',
  'Anime Defenders',
  'Da Hood',
  'Doors',
  'Rivals',
  'Dress to Impress',
  'Toilet Tower Defense'
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
  const { showNotification } = useUIStore()

  const [activeExp, setActiveExp] = useState<RobloxExperience | null>(null)
  const [selectedGame, setSelectedGame] = useState<string>('Steal An Egg')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [codesResult, setCodesResult] = useState<RobloxGameCodesResult | null>(null)
  const [isLoadingCodes, setIsLoadingCodes] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [showExpired, setShowExpired] = useState<boolean>(false)

  // ─── Fetch Codes for a given Game ─────────────────────────────────────────
  const fetchCodesForGame = useCallback(async (gameName: string, placeId?: string, universeId?: string, forceRefresh = false) => {
    const clean = gameName.trim()
    if (!clean) return
    setIsLoadingCodes(true)
    try {
      if (window.electronAPI?.roblox?.getCodes) {
        const res = await window.electronAPI.roblox.getCodes(clean, placeId, universeId, forceRefresh)
        setCodesResult(res)
      } else {
        // Fallback for preview
        setCodesResult({
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
        })
      }
    } catch (err) {
      console.error('Failed to load Roblox codes:', err)
    } finally {
      setIsLoadingCodes(false)
    }
  }, [])

  // ─── Initialize Active Experience & Listeners ─────────────────────────────
  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    const init = async () => {
      try {
        if (window.electronAPI?.roblox?.getActiveExperience) {
          const exp = await window.electronAPI.roblox.getActiveExperience()
          if (exp) {
            setActiveExp(exp)
            setSelectedGame(exp.name)
            fetchCodesForGame(exp.name, exp.placeId, exp.universeId)
            return
          }
        }
      } catch (e) {
        console.warn('Roblox initial experience check failed:', e)
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
      let currentExp = activeExp
      if (window.electronAPI?.roblox?.refreshExperience) {
        currentExp = await window.electronAPI.roblox.refreshExperience()
        setActiveExp(currentExp)
      }
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
      showNotification(`${code} ${t('robloxCodeCopied')}`, 'success')
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
    <div className={`w-full ${className}`}>
      <div className="bg-[#0b0c10]/80 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 md:p-5">
        
        {/* ─── Top Bar: Title & Live Status ─────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 mb-3.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white/40">
              {t('robloxCodesHubTitle')}
            </span>
            <span className="text-white/20">•</span>
            <span className="text-xs font-bold text-white/90 truncate">
              {cleanGameName(selectedGame)}
            </span>
            <span className="text-[11px] font-mono text-white/30">
              ({activeCodes.length})
            </span>
          </div>

          <div className="flex items-center gap-3">
            {activeExp && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/40 text-[11px]">{t('robloxLiveInGame')}:</span>
                <span className="text-emerald-300 font-bold truncate max-w-[150px]">
                  {cleanGameName(activeExp.name)}
                </span>
                {activeExp.placeId && (
                  <button
                    onClick={() => {
                      const url = `https://www.roblox.com/games/${activeExp.placeId}`
                      if (window.electronAPI?.openUrl) {
                        window.electronAPI.openUrl(url)
                      } else {
                        window.open(url, '_blank')
                      }
                    }}
                    title={t('robloxOpenGamePage')}
                    className="text-white/30 hover:text-white transition-colors ml-0.5 cursor-pointer"
                  >
                    <ExternalLink size={11} />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1 rounded-md text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer"
              title={t('robloxRefreshCodes')}
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-white' : ''} />
            </button>
          </div>
        </div>

        {/* ─── Search & Chips Bar ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
          {/* Compact Search */}
          <form onSubmit={handleSearchSubmit} className="relative sm:w-56 flex-shrink-0">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('robloxSearchCodesPlaceholder')}
              className="w-full h-7 pl-7 pr-6 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] focus:bg-black/50 border border-white/[0.06] focus:border-white/20 text-xs text-white placeholder-white/25 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
              >
                <X size={11} />
              </button>
            )}
          </form>

          {/* Deduplicated Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
            {gameChips.map((game) => {
              const isSelected = isSameGame(selectedGame, game)
              const isLive = activeExp && isSameGame(activeExp.name, game)

              return (
                <button
                  key={game}
                  onClick={() => handleSelectGame(game)}
                  className={`h-7 px-2.5 rounded-lg text-xs transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
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

        {/* ─── Codes Grid ───────────────────────────────────────────────── */}
        {isLoadingCodes ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : activeCodes.length === 0 ? (
          <div className="py-6 text-center text-xs text-white/30">
            {t('robloxNoCodesFound')}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {activeCodes.map((item) => {
              const isCopied = copiedCode === item.code

              return (
                <div
                  key={item.code}
                  onClick={() => handleCopyCode(item.code)}
                  className={`group relative px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                    isCopied
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.05] hover:border-white/15'
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono text-xs font-bold text-white group-hover:text-emerald-300 transition-colors tracking-wide truncate">
                      {item.code}
                    </span>
                    <span className="text-[11px] text-white/40 truncate mt-0.5">
                      {item.reward || 'Reward'}
                    </span>
                  </div>

                  <div className="flex-shrink-0">
                    {isCopied ? (
                      <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                        <Check size={12} className="stroke-[2.5]" />
                      </span>
                    ) : (
                      <Copy
                        size={12}
                        className="text-white/20 group-hover:text-white/70 transition-colors"
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

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
