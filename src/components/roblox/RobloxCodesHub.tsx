import { DropdownSurface } from '../shared/DropdownSurface'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Bell, Check, CheckCheck, ChevronDown, Copy, Gamepad2, KeyRound, Loader2, Radio, RefreshCw, Search, X } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import { playNotificationSound } from '../../services/soundService'
import { copyText } from '../../services/clipboard'
import { ROBLOX_CODE_GAMES, cleanRobloxName, robloxNameKey } from '../../services/robloxGames'
import type { RobloxCodeGame, RobloxCodeItem, RobloxGameCodesResult } from '../../types/robloxCodes'
import type { RobloxExperience } from '../../types/game'
import './roblox-preview.css'

const identity = (game: RobloxCodeGame) => game.universeId ? `u:${game.universeId}` : game.placeId ? `p:${game.placeId}` : `n:${robloxNameKey(game.name)}`
const same = (a: RobloxCodeGame, b: RobloxCodeGame) => a.universeId && b.universeId ? a.universeId === b.universeId : a.placeId && b.placeId ? a.placeId === b.placeId : robloxNameKey(a.name) === robloxNameKey(b.name)
const codesKey = (game: RobloxCodeGame) => ['roblox-codes-v3', identity(game)]
const CODE_PAGE_SIZE = 8
const readUsed = (key: string): string[] => { try { const value = JSON.parse(localStorage.getItem(`eclipse-used-codes:${key}`) || '[]'); return Array.isArray(value) ? value.filter(value => typeof value === 'string').slice(0, 500) : [] } catch { return [] } }

export function RobloxCodesHub({ className = '' }: { className?: string }) {
  const { language } = useTranslation(), de = language === 'de', client = useQueryClient()
  const tr = (german: string, english: string) => de ? german : english
  const [game, setGame] = useState<RobloxCodeGame>(ROBLOX_CODE_GAMES[0])
  const [live, setLive] = useState<RobloxExperience | null>(null)
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [searchOpen, setSearchOpen] = useState(false), [highlight, setHighlight] = useState(0)
  const [expired, setExpired] = useState(false), [copied, setCopied] = useState<string | null>(null), [refreshing, setRefreshing] = useState(false)
  const [notify, setNotify] = useState(() => { try { return localStorage.getItem('roblox_sound_notify') === 'true' } catch { return false } })
  const [used, setUsed] = useState<string[]>(() => readUsed(identity(game))), [hideUsed, setHideUsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(CODE_PAGE_SIZE), [expiredCount, setExpiredCount] = useState(CODE_PAGE_SIZE)
  const selected = useRef(game), followRef = useRef(follow), selectionVersion = useRef(0), copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const root = useRef<HTMLElement>(null)
  selected.current = game; followRef.current = follow
  const choose = (next: RobloxCodeGame, manual = true) => {
    selectionVersion.current++
    setGame(next); setQuery(''); setSearch(''); setSearchOpen(false); setExpired(false); setCopied(null)
    setVisibleCount(CODE_PAGE_SIZE); setExpiredCount(CODE_PAGE_SIZE)
    setUsed(readUsed(identity(next)))
    if (manual) setFollow(false)
  }
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setHighlight(0) }, 250); return () => clearTimeout(timer) }, [query])
  const recommended = useQuery({ queryKey: ['roblox-code-games', ''], queryFn: () => window.electronAPI?.roblox?.searchGames?.('') || Promise.resolve([...ROBLOX_CODE_GAMES]), staleTime: 5 * 60_000, retry: false })
  const suggestions = useQuery({ queryKey: ['roblox-code-games', search], queryFn: () => window.electronAPI?.roblox?.searchGames?.(search) || Promise.resolve(ROBLOX_CODE_GAMES.filter(item => !search || robloxNameKey(item.name).includes(robloxNameKey(search)))), staleTime: 5 * 60_000, retry: false, enabled: searchOpen })
  const codes = useQuery({ queryKey: codesKey(game), queryFn: async (): Promise<RobloxGameCodesResult> => {
    if (!window.electronAPI?.roblox?.getCodes) return { ...game, gameName: game.name, activeCodes: [], expiredCodes: [], lastUpdated: 0, status: 'unavailable' }
    return window.electronAPI.roblox.getCodes(game.name, game.placeId, game.universeId)
  }, staleTime: 60_000, retry: false, refetchOnWindowFocus: false })

  useEffect(() => {
    let active = true
    const version = selectionVersion.current
    void window.electronAPI?.roblox?.getActiveExperience?.().then(experience => {
      if (!active) return
      setLive(experience)
      if (experience?.name && followRef.current && selectionVersion.current === version) choose(experience, false)
    }).catch(() => {})
    const stopLive = window.electronAPI?.roblox?.onExperienceChange?.(experience => {
      setLive(experience)
      if (experience?.name && followRef.current) {
        if (!same(selected.current, experience)) choose(experience, false)
        else if (experience.iconUrl && selected.current.iconUrl !== experience.iconUrl) setGame(previous => ({ ...previous, iconUrl: experience.iconUrl }))
      }
    })
    const stopCodes = window.electronAPI?.roblox?.onCodesUpdated?.(result => {
      if (same(selected.current, { name: result.gameName, placeId: result.placeId, universeId: result.universeId })) client.setQueryData(codesKey(selected.current), result)
    })
    const selectEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (typeof detail?.gameName === 'string') choose({ name: detail.gameName, placeId: detail.placeId, universeId: detail.universeId, iconUrl: detail.iconUrl })
    }
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setSearchOpen(false) }
    window.addEventListener('roblox:select-game-codes', selectEvent)
    document.addEventListener('pointerdown', outside)
    return () => { active = false; stopLive?.(); stopCodes?.(); clearTimeout(copyTimer.current); window.removeEventListener('roblox:select-game-codes', selectEvent); document.removeEventListener('pointerdown', outside) }
  }, [client])
  const data = codes.data, available = data?.activeCodes || [], visible = hideUsed ? available.filter(item => !used.includes(item.code)) : available
  const displayed = visible.slice(0, visibleCount)
  const displayedExpired = data?.expiredCodes.slice(0, expiredCount) || []
  const icon = game.iconUrl || data?.iconUrl || recommended.data?.find(item => same(item, game))?.iconUrl
  const usedKey = data ? identity({ name: data.gameName, placeId: data.placeId, universeId: data.universeId }) : identity(game)
  useEffect(() => setUsed(readUsed(usedKey)), [usedKey])
  useEffect(() => {
    if (!data || data.stale || !data.activeCodes.length) return
    const key = `eclipse-code-history:${usedKey}`
    try {
      const previous = JSON.parse(localStorage.getItem(key) || '[]')
      const found = data.activeCodes.filter(item => !Array.isArray(previous) || !previous.includes(item.code))
      localStorage.setItem(key, JSON.stringify(data.activeCodes.map(item => item.code)))
      if (notify && found.length) {
        playNotificationSound('cosmic_shimmer')
        useUIStore.getState().showNotification(de ? `${found.length} neue Codes für ${data.gameName}` : `${found.length} new codes for ${data.gameName}`, 'success', 'Roblox Codes')
      }
    } catch {}
  }, [data, notify, usedKey, de])
  const refresh = async () => {
    if (refreshing || !window.electronAPI?.roblox?.getCodes) return
    const target = selected.current
    setRefreshing(true)
    try { const result = await window.electronAPI.roblox.getCodes(target.name, target.placeId, target.universeId, true); client.setQueryData(codesKey(target), result) }
    catch { useUIStore.getState().showNotification(tr('Codes konnten nicht aktualisiert werden.', 'Could not refresh codes.'), 'error') }
    finally { setRefreshing(false) }
  }
  const copy = async (value: string, marker = value) => {
    try { await copyText(value); setCopied(marker); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(null), 1800) }
    catch { useUIStore.getState().showNotification(tr('Kopieren fehlgeschlagen.', 'Could not copy to clipboard.'), 'error') }
  }
  const markUsed = (code: string) => {
    const next = used.includes(code) ? used.filter(item => item !== code) : [...used, code].slice(-500)
    setUsed(next)
    try { localStorage.setItem(`eclipse-used-codes:${usedKey}`, JSON.stringify(next)) } catch {}
  }
  const openSource = (url: string) => { void window.electronAPI?.openUrl?.(url) }
  const card = (item: RobloxCodeItem, old = false) => <article key={item.code} className="rbx-code" data-used={used.includes(item.code) || undefined} data-expired={old || undefined}>
    <div className="rbx-code-top"><code>{item.code}</code><button type="button" data-code-copy={item.code} onClick={() => void copy(item.code)} title={tr('Code kopieren', 'Copy code')} aria-label={`${tr('Kopieren', 'Copy')} ${item.code}`}>{copied === item.code ? <Check size={15} /> : <Copy size={15} />}</button></div>
    <p>{item.reward || tr('Belohnung im Spiel', 'In-game reward')}</p>
    {!!item.alternatives?.length && <details className="rbx-spelling"><summary>{tr('Andere Schreibweise', 'Other spelling')}</summary>{item.alternatives.map(code => <button type="button" key={code} onClick={() => void copy(code)}><code>{code}</code><Copy size={11} /></button>)}</details>}
    <div className="rbx-code-bottom"><span className="rbx-code-origin" title={item.sourceName}>{item.conflicting ? tr('Quellen widersprechen sich', 'Sources disagree') : item.verification === 'developer' ? tr('Vom Entwickler', 'From the developer') : item.sourceName || tr('Community-Quelle', 'Community source')}</span>
      {!old && <button type="button" className="rbx-code-used" data-code-used={item.code} aria-pressed={used.includes(item.code)} onClick={() => markUsed(item.code)} title={tr('Als verwendet markieren', 'Mark as used')}><CheckCheck size={13} />{used.includes(item.code) ? tr('Verwendet', 'Used') : tr('Merken', 'Mark used')}</button>}</div>
  </article>
  return <section ref={root} id="roblox-codes-hub" data-roblox-codes className={`rbx-codes ${className}`}>
    <header className="rbx-codes-header"><div className="rbx-codes-title"><span className="rbx-section-icon"><KeyRound size={19} /></span><div><h2>{tr('Spielcodes', 'Game codes')}</h2><p>{tr('Dein Spiel finden. Code kopieren. Im Spiel einlösen.', 'Find your game. Copy a code. Redeem it in-game.')}</p></div></div><div className="rbx-header-actions"><button type="button" className="rbx-action" aria-pressed={notify} title={tr('Bei neuen Codes benachrichtigen', 'Notify me about new codes')} onClick={() => { const next = !notify; setNotify(next); try { localStorage.setItem('roblox_sound_notify', String(next)) } catch {} }}><Bell size={14} /></button><button type="button" className="rbx-action" onClick={() => void refresh()} disabled={refreshing || codes.isFetching} title={tr('Quellen neu prüfen', 'Check sources again')}><RefreshCw size={14} className={refreshing ? 'rbx-spin' : ''} /><span>{tr('Aktualisieren', 'Refresh')}</span></button></div></header>
    <div className="rbx-codes-toolbar"><div className="rbx-code-search"><Search size={16} /><input data-code-search role="combobox" aria-expanded={searchOpen} aria-controls="rbx-code-results" aria-autocomplete="list" aria-activedescendant={searchOpen ? `rbx-search-${highlight}` : undefined} value={query} placeholder={tr('Spielname oder Roblox-Link suchen', 'Search a game name or Roblox link')} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} onKeyDown={event => {
      if (event.key === 'Escape') { setSearchOpen(false); event.stopPropagation() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setHighlight(value => Math.max(0, Math.min((suggestions.data?.length || 1) - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))) }
      if (event.key === 'Enter') { event.preventDefault(); const next = suggestions.data?.[highlight]; if (next && search === query.trim()) choose(next); else if (query.trim()) choose({ name: query.trim() }) }
    }} />{query && <button type="button" onClick={() => setQuery('')} aria-label={tr('Suche leeren', 'Clear search')}><X size={14} /></button>}
      {<DropdownSurface open={searchOpen} id="rbx-code-results" role="listbox" className="rbx-search-results">{suggestions.isFetching && <div className="rbx-search-note"><Loader2 size={14} className="rbx-spin" />{tr('Spiele werden gesucht…', 'Finding games…')}</div>}{suggestions.data?.map((item, i) => <button type="button" role="option" id={`rbx-search-${i}`} aria-selected={highlight === i} key={identity(item)} onClick={() => choose(item)}>{item.iconUrl ? <img src={item.iconUrl} alt="" /> : <span className="rbx-game-icon"><Gamepad2 size={18} /></span>}<span><strong>{cleanRobloxName(item.name)}</strong><small>{item.creatorName || (item.sources?.length ? tr('Im Codes-Verzeichnis', 'In the codes directory') : 'Roblox')}</small></span>{!!item.sources?.length && <KeyRound size={13} />}</button>)}{query.trim() && <button type="button" className="rbx-direct-search" onClick={() => choose({ name: query.trim() })}>{tr('Direkt nach Codes suchen für', 'Search codes directly for')} “{query.trim()}”<ArrowUpRight size={14} /></button>}{suggestions.isError && <p className="rbx-search-note">{tr('Suche nicht erreichbar. Du kannst den Spielnamen direkt eingeben.', 'Search is unavailable. You can still enter the game name directly.')}</p>}</DropdownSurface>}
    </div>{live && <button type="button" className="rbx-live" data-active={follow || undefined} onClick={() => { setFollow(true); choose(live, false) }}><Radio size={14} /><span>{tr('Gerade gespielt', 'Playing now')}: {cleanRobloxName(live.name)}</span></button>}</div>
    <nav className="rbx-game-tabs" aria-label={tr('Spiele mit Codes', 'Games with codes')}>{ROBLOX_CODE_GAMES.slice(0, 7).map(item => <button type="button" key={item.name} aria-pressed={same(game, item)} onClick={() => choose(item)}>{item.name}</button>)}</nav>
    <div className="rbx-selected-game"><div className="rbx-selected-title">{icon ? <img src={icon} alt="" /> : <Gamepad2 size={22} />}<div><h3 data-code-game-title>{data?.gameName || cleanRobloxName(game.name)}</h3><p>{data?.stale ? tr('Gespeicherte Codes · Quellen werden erneut geprüft', 'Saved codes · checking sources again') : data?.lastUpdated ? `${tr('Geprüft um', 'Checked at')} ${new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(data.lastUpdated)}` : tr('Entwickler- und Community-Quellen', 'Developer and community sources')}</p></div></div><div className="rbx-code-count">{codes.isFetching || refreshing ? <Loader2 size={13} className="rbx-spin" /> : <span />}{available.length} {tr('verfügbar', 'available')}</div></div>
    {codes.isPending ? <div className="rbx-codes-skeleton" aria-label={tr('Codes werden geladen', 'Loading codes')}>{[1, 2, 3, 4].map(i => <div key={i}><span /><span /></div>)}</div> : codes.isError || data?.status === 'unavailable' ? <div className="rbx-codes-empty"><KeyRound size={24} /><h4>{tr('Quellen gerade nicht erreichbar', 'Sources are currently unavailable')}</h4><p>{tr('Bitte erneut versuchen. Es werden keine Beispielcodes angezeigt.', 'Please try again shortly. No sample codes are substituted.')}</p><button className="rbx-action" onClick={() => void refresh()}>{tr('Erneut prüfen', 'Try again')}</button></div> : available.length === 0 ? <div className="rbx-codes-empty"><KeyRound size={24} /><h4>{tr('Momentan keine Codes gefunden', 'No codes found right now')}</h4><p>{tr('Nicht jedes Spiel veröffentlicht Codes. Neue Codes erscheinen hier nach der nächsten Quellenprüfung.', 'Some games do not publish codes. New codes appear here when the sources are checked again.')}</p></div> : <><div className="rbx-code-tools"><span>{tr('Verfügbare Codes', 'Available codes')}</span><div>{used.length > 0 && <button type="button" aria-pressed={hideUsed} onClick={() => { setHideUsed(value => !value); setVisibleCount(CODE_PAGE_SIZE) }}>{hideUsed ? tr('Verwendete zeigen', 'Show used') : tr('Verwendete ausblenden', 'Hide used')}</button>}<button data-code-copy-all type="button" disabled={visible.length === 0} onClick={() => void copy(visible.map(item => item.code).join('\n'), 'all')}><Copy size={12} />{copied === 'all' ? tr('Kopiert', 'Copied') : tr('Alle kopieren', 'Copy all')}</button></div></div><div id="rbx-active-codes" className="rbx-codes-grid">{displayed.map(item => card(item))}</div>
      {visible.length > visibleCount && <div className="rbx-code-pagination"><button type="button" data-code-load-more aria-controls="rbx-active-codes" className="rbx-load-more" onClick={() => setVisibleCount(count => count + CODE_PAGE_SIZE)}>{tr('Mehr anzeigen', 'Load more')}<ChevronDown size={13} /></button><span>{displayed.length} / {visible.length}</span></div>}</>}
    {!!data?.expiredCodes.length && <details className="rbx-expired" open={expired} onToggle={event => setExpired(event.currentTarget.open)}><summary>{tr('Abgelaufene Codes', 'Expired codes')}<span>{data.expiredCodes.length}</span><ChevronDown size={14} /></summary><div id="rbx-expired-codes" className="rbx-codes-grid">{displayedExpired.map(item => card(item, true))}</div>
      {data.expiredCodes.length > expiredCount && <div className="rbx-code-pagination"><button type="button" data-expired-load-more aria-controls="rbx-expired-codes" className="rbx-load-more" onClick={() => setExpiredCount(count => count + CODE_PAGE_SIZE)}>{tr('Mehr anzeigen', 'Load more')}<ChevronDown size={13} /></button><span>{displayedExpired.length} / {data.expiredCodes.length}</span></div>}</details>}
    <footer className="rbx-codes-footer"><span>{tr('Von Quellen als verfügbar gelistet. Die Gültigkeit prüft das jeweilige Spiel.', 'Listed as available by the sources. The game confirms whether a code is valid.')}</span><div>{data?.sources?.map(source => <button type="button" key={source.url} onClick={() => openSource(source.url)}>{source.name}<ArrowUpRight size={12} /></button>)}</div></footer>
    <span className="sr-only" aria-live="polite">{copied ? tr('Code kopiert', 'Code copied') : ''}</span>
  </section>
}
