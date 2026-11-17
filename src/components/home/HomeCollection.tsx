import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { GameCard } from './GameCard'
import type { SteamGame } from '../../services/steamService'
import { useTranslation } from '../../hooks/useTranslation'

export function HomeCollection({ title, games, onClose }: { title:string; games:SteamGame[]; onClose:()=>void }) {
  const { t, locale } = useTranslation(), panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const keys = (event:KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]') || []].filter(element => element.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown',keys,true)
    return () => { window.removeEventListener('keydown',keys,true); if (previous?.isConnected) previous.focus({preventScroll:true}) }
  },[onClose])
  return createPortal(<div className="home-collection-shade" onClick={onClose}><div ref={panel} className="home-collection" role="dialog" aria-modal="true" aria-labelledby="home-collection-title" onClick={event => event.stopPropagation()}>
    <header><div><span>Steam · {t('homeGameCount', {count:games.length.toLocaleString(locale)})}</span><h2 id="home-collection-title">{title}</h2></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={18} /></button></header>
    <div className="home-collection-grid">{games.map(game => <GameCard key={game.steamId} game={game} onOpen={onClose} />)}</div>
  </div></div>,document.body)
}
