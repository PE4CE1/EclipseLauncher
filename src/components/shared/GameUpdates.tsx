import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, X, ExternalLink, RefreshCw, Search, ChevronRight, Clock3, ImageOff } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { fetchSteamNews, fetchSteamNewsEvents } from '../../services/steamNews'
import { prepareSteamNews, steamNewsImageUrl } from '../../services/steamNewsContent'
import './game-updates.css'

function NewsImage({ src, fallback, hero = false }: { src?: string; fallback?: string; hero?: boolean }) {
  const sources = [...new Set([src, fallback].filter((value): value is string => !!value))]
  const [failed, setFailed] = useState(0)
  return sources[failed] ? <img data-updates-image src={sources[failed]} alt="" loading={hero ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(value => value + 1)} /> : <span className="updates-image-empty" aria-hidden="true"><ImageOff size={hero ? 28 : 18} /></span>
}

export function GameUpdates({ appId, name, artwork, initialId, onClose }: { appId: number; name: string; artwork?: string; initialId?: string; onClose: () => void }) {
  const { t, language, locale } = useTranslation()
  const [selected, setSelected] = useState<string | null>(initialId || null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'patches'>('all')
  const panel = useRef<HTMLDivElement>(null)
  const article = useRef<HTMLDivElement>(null)
  const fallback = steamNewsImageUrl(artwork || '') || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
  const { data = [], isPending, isError, refetch } = useQuery({
    queryKey: ['steam', 'news', appId, language],
    queryFn: ({ signal }) => fetchSteamNews(appId, language, signal), staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false,
  })
  const { data: events = [] } = useQuery({ queryKey: ['steam', 'news-events', appId, language], queryFn: ({ signal }) => fetchSteamNewsEvents(appId, language, signal), staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: false, refetchOnWindowFocus: false })
  const prepared = useMemo(() => data.map(item => ({ ...item, ...prepareSteamNews(item.contents) })), [data])
  const entries = useMemo(() => prepared.map(item => {
    const event = events.find(event => event.id === item.id)
    return { ...item, html: event?.image && event.image !== item.leadImage ? item.fullHtml : item.html, eventType: event?.type, previewImage: event?.capsule || event?.image || item.previewImage, leadImage: event?.image || item.leadImage, patch: [12,13,14].includes(event?.type || 0) || /\b(?:patch(?:\s*notes?)?|hotfix|bug\s*fix(?:es)?|update\s+v?\d)/i.test(item.title) }
  }), [prepared, events])
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale)
    return entries.filter(item => (filter === 'all' || item.patch) && (!term || (item.title.toLocaleLowerCase(locale) + ' ' + item.searchText).includes(term)))
  }, [entries, search, filter, locale])
  const active = visible.find(item => item.id === selected) || visible[0]
  const patches = entries.filter(item => item.patch).length
  useEffect(() => { article.current?.scrollTo(0, 0) }, [active?.id, language])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('[data-updates-close]')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key === 'Tab') {
        const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input') || [])].filter(element => element.getClientRects().length > 0)
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', keydown, true)
    return () => { window.removeEventListener('keydown', keydown, true); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [onClose])
  const date = (seconds: number) => new Date(seconds * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const kind = (patch: boolean, type?: number) => t(type === 14 ? 'uiNewsMajorUpdate' : patch ? 'uiNewsPatchNotes' : 'uiNewsAnnouncement')
  return createPortal(<div className="game-updates-backdrop" onClick={onClose}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="game-updates-title" data-game-updates className="game-updates-panel" onClick={event => event.stopPropagation()}>
      <header className="updates-header">
        <div className="updates-header-game"><div className="updates-game-icon"><NewsImage key={fallback} src={fallback} /></div><div><p>{name}</p><h2 id="game-updates-title">{t('uiGameUpdates')}</h2></div></div>
        <button data-updates-close onClick={onClose} aria-label={t('close')} className="updates-close"><X size={19} /></button>
      </header>
      {isPending ? <div className="updates-loading" aria-busy="true" aria-label={t('uiGameUpdates')}><div className="updates-loading-list">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div><div className="updates-loading-article"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div></div>
        : isError || !data.length ? <div className="updates-empty"><Newspaper size={30} /><p>{t(isError ? 'uiGameUpdatesFailed' : 'uiGameUpdatesEmpty')}</p>{isError && <button onClick={() => void refetch()}><RefreshCw size={14} />{t('uiRetry')}</button>}</div>
          : <div className="updates-layout">
            <aside className="updates-sidebar">
              <div className="updates-tools"><label className="updates-search"><Search size={14} /><input data-updates-search value={search} onChange={event => setSearch(event.target.value)} placeholder={t('uiNewsSearch')} aria-label={t('uiNewsSearch')} />{search && <button onClick={() => setSearch('')} aria-label={t('uiNewsClearSearch')}><X size={13} /></button>}</label>
                <div className="updates-filters"><button data-updates-filter="all" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('uiAll')}<span>{entries.length}</span></button><button data-updates-filter="patches" aria-pressed={filter === 'patches'} onClick={() => setFilter('patches')}>{t('uiNewsPatchNotes')}<span>{patches}</span></button></div>
              </div>
              <nav aria-label={t('uiGameUpdates')} className="updates-list">
                {visible.map(item => <button key={item.id} data-updates-item={item.id} onClick={() => setSelected(item.id)} aria-current={item.id === active?.id ? 'true' : undefined} className="updates-item">
                  <span className="updates-item-image"><NewsImage key={item.previewImage || fallback} src={item.previewImage} fallback={fallback} /></span>
                  <span className="updates-item-copy"><time dateTime={new Date(item.date * 1000).toISOString()}>{date(item.date)}</time><strong>{item.title}</strong><span>{kind(item.patch, item.eventType)}</span></span><ChevronRight className="updates-item-chevron" size={13} />
                </button>)}
                {!visible.length && <p className="updates-no-results">{t('uiNoResults')}</p>}
              </nav>
              <span className="updates-feed-note">Steam · {t('uiNewsOfficialFeed')}</span>
            </aside>
            {active ? <div ref={article} className="updates-article" data-updates-article data-updates-id={active.id} key={active.id}>
              <div className={`updates-article-image ${active.leadImage ? '' : 'updates-article-image-game'}`} data-updates-hero><NewsImage key={active.leadImage || fallback} src={active.leadImage || fallback} fallback={fallback} hero /><span>{kind(active.patch, active.eventType)}</span></div>
              <article className="updates-article-body">
                <div className="updates-article-meta"><time dateTime={new Date(active.date * 1000).toISOString()}>{date(active.date)}</time><span aria-hidden="true">·</span><span><Clock3 size={12} />{t('uiNewsReadTime', { minutes: active.minutes })}</span></div>
                <h3>{active.title}</h3>
                <div className="steam-news-content" onError={event => { if (event.target instanceof HTMLImageElement) event.target.hidden = true }} dangerouslySetInnerHTML={{ __html: active.html }} />
                <footer className="updates-article-footer"><span>Steam · {name}</span><a href={active.url} target="_blank" rel="noopener noreferrer">{t('uiReadOnSteam')}<ExternalLink size={13} /></a></footer>
              </article>
            </div> : <div className="updates-empty"><Search size={27} /><p>{t('uiNewsNoMatches')}</p><button onClick={() => { setSearch(''); setFilter('all') }}>{t('uiNewsResetFilters')}</button></div>}
          </div>}
    </div>
  </div>, document.body)
}
