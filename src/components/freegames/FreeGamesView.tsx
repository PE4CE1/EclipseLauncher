import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, Check, RefreshCw, ExternalLink, ArrowUpRight, AlertCircle } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import { useFreeGamesStore } from '../../store/freeGamesStore'
import { freeGameClaimKey, sortFreeGameOffers } from '../../services/freeGameOffers'
import { getPlaceholderHero } from '../../services/assetHelper'
import type { FreeGameItem } from '../../types/freeGames'

const queryKey = ['free-games-radar']

export function FreeGamesView() {
  const { t, language } = useTranslation()
  const de = language === 'de'
  const client = useQueryClient()
  const [checking, setChecking] = useState(false)
  const checkingNow = useRef(false)
  const [checkFailed, setCheckFailed] = useState(false)
  const [openFailed, setOpenFailed] = useState(false)
  const claimed = useFreeGamesStore(state => state.claimed)
  const markClaimed = useFreeGamesStore(state => state.markClaimed)
  const { data: games = [], isLoading, isError } = useQuery({
    queryKey,
    queryFn: async (): Promise<FreeGameItem[]> => {
      const cached = await window.electronAPI?.getFreeGames?.()
      return Array.isArray(cached) ? cached : []
    },
    staleTime: 60_000, refetchOnMount: 'always', refetchOnWindowFocus: false,
  })
  const sortedGames = useMemo(() => sortFreeGameOffers(games), [games])
  useEffect(() => window.electronAPI?.onFreeGamesUpdated?.(() => { void client.invalidateQueries({ queryKey }) }), [client])

  async function refresh() {
    if (checkingNow.current || !window.electronAPI?.checkFreeGamesNow) return
    checkingNow.current = true
    setChecking(true)
    setCheckFailed(false)
    try {
      const result = await window.electronAPI.checkFreeGamesNow()
      if (!result.success || !Array.isArray(result.games)) throw new Error('Radar check failed')
      client.setQueryData(queryKey, result.games)
    } catch { setCheckFailed(true) }
    finally { checkingNow.current = false; setChecking(false) }
  }

  async function open(game: FreeGameItem, browser = false) {
    setOpenFailed(false)
    try {
      if (window.electronAPI?.openUrl) {
        const result = await window.electronAPI.openUrl(browser ? game.url : game.clientUrl || game.url, game.url)
        if (!result?.success) throw new Error('Unable to open offer')
      } else if (/^https:\/\//i.test(game.url)) {
        window.open(game.url, '_blank', 'noopener,noreferrer')
      } else { throw new Error('Invalid offer URL') }
      markClaimed(game)
    } catch {
      setOpenFailed(true)
    }
  }

  return <div className="free-games-view view-scroll h-full overflow-y-auto p-6 lg:p-10 text-hub-text" data-free-games>
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl border border-white/[.08] bg-white/[.025]"><Gift size={22} className="text-orange-300/90" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t('freeGamesRadar')}</h1>
            <p className="text-xs text-white/45 mt-1">{de ? 'Aktuelle Gratis-Aktionen für Steam, Epic Games und GOG.' : 'Current giveaways for Steam, Epic Games and GOG.'}</p>
          </div>
        </div>
        <button id="free-games-refresh" disabled={checking} onClick={refresh} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/[.08] transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          {checking ? (de ? 'Wird geprüft…' : 'Checking…') : t('checkFreeGamesNow')}
        </button>
      </header>

      <div className="flex items-center justify-between gap-3 text-xs text-white/45 border-b border-white/[.06] pb-4">
        <span>{de ? `${games.length} ${games.length === 1 ? 'verfügbare Aktion' : 'verfügbare Aktionen'}` : `${games.length} available ${games.length === 1 ? 'offer' : 'offers'}`}</span>
        <button onClick={() => { useUIStore.getState().setActiveSettingsTab('notifications'); useUIStore.getState().setActiveView('settings') }} className="flex items-center gap-1.5 hover:text-white/80 transition-colors">
          {de ? 'Benachrichtigungen' : 'Notifications'}<ArrowUpRight size={13} />
        </button>
      </div>

      {(isError || checkFailed) && <div role="alert" className="flex items-center gap-2 p-3 rounded-lg border border-orange-300/15 bg-orange-300/[.04] text-xs text-orange-200/80">
        <AlertCircle size={15} />{de ? 'Die Prüfung ist gerade nicht möglich. Bereits geladene Aktionen bleiben sichtbar.' : 'Unable to check right now. Previously loaded offers remain available.'}
      </div>}
      {openFailed && <div role="alert" className="flex items-center gap-2 p-3 rounded-lg border border-orange-300/15 bg-orange-300/[.04] text-xs text-orange-200/80">
        <AlertCircle size={15} />{de ? 'Der Angebotslink konnte nicht geöffnet werden. Bitte versuche es erneut.' : 'Unable to open the offer. Please try again.'}
      </div>}

      {isLoading ? <div aria-busy="true" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{[0, 1, 2].map(index => <div key={index} className="skeleton rounded-xl aspect-[4/3]" />)}</div>
        : games.length === 0 ? <div className="free-games-card rounded-xl border border-white/[.06] bg-white/[.02] py-16 text-center">
          <Gift size={30} className="mx-auto text-white/25 mb-4" />
          <h2 className="font-semibold text-sm">{de ? 'Noch keine Gratis-Aktionen geladen' : 'No giveaways loaded yet'}</h2>
          <p className="text-xs text-white/40 mt-2">{de ? 'Prüfe jetzt die aktuellen Angebote. Das Radar sucht außerdem automatisch im Hintergrund.' : 'Check the latest offers now. The radar also searches automatically in the background.'}</p>
        </div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sortedGames.map(game => {
            const isClaimed = claimed[freeGameClaimKey(game)] === true
            const openLabel = isClaimed
              ? (de ? 'Bereits geöffnet – Angebot erneut öffnen' : 'Already opened – open offer again')
              : (de ? `${game.title} kostenlos sichern` : `Get ${game.title} free`)
            return <article key={game.id} data-free-game-platform={game.platform} data-claimed={isClaimed} className="free-games-card rounded-xl border border-white/[.06] bg-white/[.02] overflow-hidden flex flex-col">
              <button type="button" onClick={() => open(game)} aria-label={openLabel} className="relative block w-full aspect-video overflow-hidden bg-white/[.025]">
                <img src={game.imageUrl || getPlaceholderHero(game.title)} alt={game.title} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={event => { const image = event.currentTarget; const fallback = getPlaceholderHero(game.title); if (image.src !== fallback) image.src = fallback }} />
                <span className="absolute top-3 left-3 px-2 py-1 rounded-md border border-white/10 bg-black/65 text-white/90 text-[10px] font-semibold">{game.platform}</span>
              </button>
              <div className="p-4 flex flex-col flex-1 gap-4">
                <div className="flex-1">
                  <h2 className="font-semibold text-sm leading-5">{game.title}</h2>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    {game.originalPrice && <span className="text-white/35 line-through">{game.originalPrice}</span>}
                    <span className="font-semibold text-emerald-300">{de ? 'Kostenlos' : 'Free'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => open(game)} title={openLabel} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-white/90 hover:bg-white px-3 py-2 text-xs font-semibold text-black transition-colors">{isClaimed ? <Check size={13} /> : <Gift size={13} />}{isClaimed ? 'Claimed' : de ? 'Kostenlos sichern' : 'Get it free'}</button>
                  <button onClick={() => open(game, true)} title={t('viewInBrowser')} aria-label={t('viewInBrowser')} className="p-2 rounded-lg border border-white/10 bg-white/[.025] text-white/60 hover:text-white hover:bg-white/[.06] transition-colors"><ExternalLink size={14} /></button>
                </div>
              </div>
            </article>
          })}
        </div>}
    </div>
  </div>
}
