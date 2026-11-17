import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, ChevronLeft, ChevronRight, Gamepad2, KeyRound, Play, Users } from 'lucide-react'
import { ROBLOX_CODE_GAMES, cleanRobloxName } from '../../services/robloxGames'
import type { RobloxCodeGame } from '../../types/robloxCodes'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import './roblox-preview.css'

export const POPULAR_ROBLOX_GAMES = ROBLOX_CODE_GAMES

export function RobloxPopularGames({ onSelectGame }: { onSelectGame?: (name: string) => void }) {
  const { language } = useTranslation(), de = language === 'de'
  const rail = useRef<HTMLDivElement>(null)
  const games = useQuery({ queryKey: ['roblox-code-games', ''], queryFn: () => window.electronAPI?.roblox?.searchGames?.('') || Promise.resolve([...ROBLOX_CODE_GAMES]), staleTime: 5 * 60_000, retry: false })
  const select = (game: RobloxCodeGame) => {
    onSelectGame?.(game.name)
    window.dispatchEvent(new CustomEvent('roblox:select-game-codes', { detail: { gameName: game.name, placeId: game.placeId, universeId: game.universeId, iconUrl: game.iconUrl } }))
    document.getElementById('roblox-codes-hub')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }
  const play = async (game: RobloxCodeGame) => {
    if (!game.placeId) return
    try {
      const result = await window.electronAPI?.launchGame?.(`roblox://experiences/start?placeId=${game.placeId}`)
      if (!result?.success) await window.electronAPI?.openUrl?.(`https://www.roblox.com/games/${game.placeId}`)
    } catch { useUIStore.getState().showNotification(de ? 'Roblox konnte nicht gestartet werden.' : 'Could not launch Roblox.', 'error') }
  }
  return <section className="rbx-discover" data-roblox-discover><header><div><h2>{de ? 'Erlebnisse entdecken' : 'Explore experiences'}</h2><p>{de ? 'Direkt spielen oder die neuesten Codes ansehen.' : 'Jump into a game or find its latest codes.'}</p></div><div className="rbx-rail-controls">{[-1, 1].map(direction => <button key={direction} type="button" aria-label={direction < 0 ? de ? 'Nach links' : 'Scroll left' : de ? 'Nach rechts' : 'Scroll right'} onClick={() => rail.current?.scrollBy({ left: direction * 560, behavior: 'smooth' })}>{direction < 0 ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</button>)}</div></header>
    <div ref={rail} className="rbx-game-rail">{(games.data || ROBLOX_CODE_GAMES).filter(game => game.placeId).slice(0, 12).map(game => <article className="rbx-experience" key={game.universeId || game.name}><button type="button" className="rbx-experience-art" onClick={() => select(game)} aria-label={`${de ? 'Codes für' : 'Codes for'} ${game.name}`}>{game.iconUrl ? <img src={game.iconUrl} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.style.display = 'none' }} /> : <Gamepad2 size={32} />}<span className="rbx-experience-open"><ArrowUpRight size={16} /></span></button><h3>{cleanRobloxName(game.name)}</h3><p>{typeof game.players === 'number' ? <><Users size={12} />{new Intl.NumberFormat(de ? 'de-DE' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(game.players)} {de ? 'im Spiel' : 'playing'}</> : game.creatorName || 'Roblox'}</p><div className="rbx-experience-actions"><button type="button" onClick={() => select(game)}><KeyRound size={13} />Codes</button><button type="button" onClick={() => void play(game)} aria-label={`${de ? 'Spielen' : 'Play'} ${game.name}`}><Play size={13} fill="currentColor" /></button></div></article>)}</div>
    {games.isError && <p className="rbx-muted">{de ? 'Live-Daten sind gerade nicht erreichbar.' : 'Live data is currently unavailable.'}</p>}
  </section>
}
