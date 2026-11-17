import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { ArrowUpRight, ChevronDown, Newspaper, RefreshCw } from 'lucide-react'
import { fetchSteamNews, fetchSteamNewsEvents } from '../../services/steamNews'
import { prepareSteamNews } from '../../services/steamNewsContent'
import { createConcurrentQueue } from '../../services/concurrentQueue'
import { useTranslation } from '../../hooks/useTranslation'
import { useHomeVisible } from './useHomeVisible'
import { pickHomeNews } from '../../services/homeDiscovery'
import type { SteamGame } from '../../services/steamService'
import { isHomeGameCandidate } from '../../services/homeGameFilter'

const GameUpdates = lazy(() => import('../shared/GameUpdates').then(module => ({ default: module.GameUpdates })))
const queue = createConcurrentQueue(2)

function UpdateArtwork({ image, fallback, label }: { image?: string; fallback?: string; label: string }) {
  const [failed, setFailed] = useState<string[]>([])
  const source = [image, fallback].find(url => url && !failed.includes(url))
  return <span className="home-update-image">
    {source ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(previous => [...previous, source])} /> : <Newspaper size={28} />}
    <span>{label}</span>
  </span>
}

export function HomeUpdates({ games }: { games: SteamGame[] }) {
  const { language, locale, t } = useTranslation()
  const { ref, visible } = useHomeVisible()
  const [selected, setSelected] = useState<{ game: SteamGame; id: string } | null>(null)
  const [limit,setLimit] = useState(6)
  const close = useCallback(() => setSelected(null),[])
  const sources = useMemo(() => [...new Map(games.filter(game => isHomeGameCandidate(game.steamId,game.name)).map(game => [game.steamId, game])).values()].slice(0,limit), [games,limit])
  const news = useQueries({ queries: sources.map(game => ({ queryKey: ['steam','news',game.steamId,language], enabled: visible,
    queryFn: ({ signal }: { signal: AbortSignal }) => queue.run(() => { signal.throwIfAborted(); return fetchSteamNews(game.steamId, language, signal) }), staleTime: 5*60_000, gcTime:30*60_000, retry:false, refetchOnWindowFocus:false })) })
  const events = useQueries({ queries: sources.map(game => ({ queryKey: ['steam','news-events',game.steamId,language], enabled: visible,
    queryFn: ({ signal }: { signal: AbortSignal }) => queue.run(() => { signal.throwIfAborted(); return fetchSteamNewsEvents(game.steamId, language, signal) }), staleTime:5*60_000, gcTime:30*60_000, retry:false, refetchOnWindowFocus:false })) })
  const cards = sources.flatMap((game,index) => {
    if (news[index].isPending || events[index].isPending) return []
    const art = events[index].data || []
    const item = pickHomeNews(news[index].data || [], art)
    if (!item) return []
    const event = art.find(event => event.id === item.id), content = prepareSteamNews(item.contents)
    return [{ ...item, game, excerpt:content.excerpt, image:event?.capsule || event?.image || content.previewImage || game.headerImage, major:event?.type === 14 }]
  }).sort((a,b) => b.date-a.date)
  const pending = !visible || news.some(query => query.isPending) || events.some(query => query.isPending)
  return <section className="home-updates" id="home-updates" ref={ref}>
    <div className="home-section-heading"><div><span>{t('homeNewsEyebrow')}</span><h3>{t('homeNewsTitle')}</h3><p>{t('homeNewsDescription')}</p></div><Newspaper size={19} aria-hidden="true" /></div>
    <div className="home-update-grid">
      {pending && !cards.length ? Array.from({length:limit},(_,index) => <div key={index} className="home-update-skeleton skeleton" />) : cards.map(card => <button type="button" key={card.game.steamId+':'+card.id} className="home-update-card" onClick={() => setSelected({ game:card.game, id:card.id })}>
        <UpdateArtwork image={card.image} fallback={card.game.headerImage} label={t(card.major ? 'uiNewsMajorUpdate' : 'uiNewsAnnouncement')} />
        <span className="home-update-copy"><span className="home-update-meta"><span>{card.game.name}</span><time dateTime={new Date(card.date*1000).toISOString()}>{new Date(card.date*1000).toLocaleDateString(locale,{day:'numeric',month:'short'})}</time></span><strong>{card.title}</strong><span className="home-update-excerpt">{card.excerpt}</span><span className="home-update-read">{t('homeReadArticle')}<ArrowUpRight size={12} /></span></span>
      </button>)}
      {pending && cards.length > 0 && Array.from({length:Math.max(0,limit-cards.length)},(_,index) => <div key={'loading-'+index} className="home-update-skeleton skeleton" />)}
    </div>
    {!pending && !cards.length && <div className="home-feed-empty"><span>{t('homeNewsEmpty')}</span><button type="button" onClick={() => { for (const query of [...news,...events]) void query.refetch() }}><RefreshCw size={12} />{t('homeRetry')}</button></div>}
    {!pending && limit<12 && games.filter(game => isHomeGameCandidate(game.steamId,game.name)).length>limit && <button type="button" className="home-updates-more" onClick={() => setLimit(value => Math.min(12,value+3))}>{t('homeMoreUpdates')}<ChevronDown size={12} /></button>}
    {selected && <Suspense fallback={<div className="home-news-opening" role="status">{t('homeNewsOpening')}</div>}><GameUpdates key={selected.game.steamId+':'+selected.id} appId={selected.game.steamId} name={selected.game.name} artwork={selected.game.headerImage} initialId={selected.id} onClose={close} /></Suspense>}
  </section>
}
