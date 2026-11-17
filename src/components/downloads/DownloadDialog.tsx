import { Select } from '../shared/Select'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Download, FolderOpen, Globe, Loader2, Search, X } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useGameStore } from '../../store/gameStore'
import { describeDownloadHost, downloadIssueLabel, releaseLabel } from '../../services/downloadPresentation'
import { createConcurrentQueue } from '../../services/concurrentQueue'
import type { DownloadLinkStatus } from '../../types/downloads'
import './downloads.css'

export interface DownloadOption { title: string; sourceName: string; fileSize?: string; uploadDate?: string; uris: string[] }
export interface DownloadOptionsModalProps {
  isOpen: boolean; onClose: () => void; gameName: string; downloads: DownloadOption[]; coverUrl?: string
  onDownload: (uri: string, title: string, path: string, isHttp: boolean, autoExtract: boolean, autoDelete?: boolean, mirrors?: string[]) => Promise<boolean | void> | void
}
const checks = createConcurrentQueue(4)
const copy = {
  en: { title: 'Download game', release: 'Release', setup: 'Setup', available: 'available', search: 'Search releases…', all: 'All sources', empty: 'No matching releases', sources: 'Manage sources', next: 'Continue', back: 'Back to releases', server: 'Download server', auto: 'Automatic', autoHint: 'Try the available mirrors in order. Switch if a host is unavailable.', folder: 'Save to', browse: 'Browse', extract: 'Extract after download', extractHint: 'Unpack the archive with 7-Zip.', remove: 'Delete archive after extraction', removeHint: 'Only after extraction completes successfully.', start: 'Start download', starting: 'Preparing download…', note: 'Files are verified on start. Eclipse tries other mirrors if needed. Some hosts require confirmation.', reachable: 'Reachable', unavailable: 'Unavailable', verification: 'Confirmation needed', unknown: 'Not verified', checking: 'Checking', p2p: 'Checked on start', releaseCount: 'releases', selected: 'Selected release', failed: 'Could not start the download. Check the folder and try again.', close: 'Close', path: 'Download folder' },
  de: { title: 'Spiel herunterladen', release: 'Version', setup: 'Einrichten', available: 'verfügbar', search: 'Versionen durchsuchen…', all: 'Alle Quellen', empty: 'Keine passende Version', sources: 'Quellen verwalten', next: 'Weiter', back: 'Zurück zu Versionen', server: 'Downloadserver', auto: 'Automatisch', autoHint: 'Verfügbare Mirrors nacheinander prüfen. Bei Problemen automatisch wechseln.', folder: 'Speichern unter', browse: 'Durchsuchen', extract: 'Nach dem Download entpacken', extractHint: 'Archiv mit 7-Zip entpacken.', remove: 'Archiv nach dem Entpacken löschen', removeHint: 'Erst wenn das Entpacken erfolgreich abgeschlossen ist.', start: 'Download starten', starting: 'Download wird vorbereitet…', note: 'Die Datei wird beim Start geprüft. Bei Problemen versucht Eclipse weitere Mirrors. Manche Hoster verlangen eine Bestätigung.', reachable: 'Erreichbar', unavailable: 'Nicht verfügbar', verification: 'Bestätigung nötig', unknown: 'Nicht geprüft', checking: 'Wird geprüft', p2p: 'Prüfung beim Start', releaseCount: 'Versionen', selected: 'Ausgewählte Version', failed: 'Download konnte nicht gestartet werden. Prüfe den Ordner und versuche es erneut.', close: 'Schließen', path: 'Downloadordner' },
}

export function DownloadDialog({ isOpen, onClose, gameName, downloads, onDownload, coverUrl }: DownloadOptionsModalProps) {
  const { language, locale } = useTranslation(), c = copy[language]
  const settings = useGameStore(state => state.settings)
  const [selected, setSelected] = useState<DownloadOption | null>(null), [host, setHost] = useState('auto')
  const [query, setQuery] = useState(''), [source, setSource] = useState('all'), deferred = useDeferredValue(query)
  const [path, setPath] = useState(settings.downloadPath || ''), [extract, setExtract] = useState(true), [remove, setRemove] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [statuses, setStatuses] = useState<Record<string, DownloadLinkStatus | 'loading'>>({})
  const panel = useRef<HTMLDivElement>(null), close = useRef(onClose)
  close.current = onClose
  const rows = useMemo(() => (Array.isArray(downloads) ? downloads : []).filter(row => row?.title && Array.isArray(row.uris)), [downloads])
  const sources = useMemo(() => [...new Set(rows.map(row => row.sourceName))], [rows])
  const filtered = useMemo(() => rows.filter(row => (!deferred.trim() || row.title.toLowerCase().includes(deferred.trim().toLowerCase())) && (source === 'all' || row.sourceName === source)).sort((a,b) => (b.uploadDate || '').localeCompare(a.uploadDate || '')), [rows, deferred, source])
  const hosts = useMemo(() => [...new Set(selected?.uris || [])].flatMap(url => { try { return [{ url, ...describeDownloadHost(url) }] } catch { return [] } }).sort((a,b) => a.priority - b.priority), [selected])

  useEffect(() => {
    if (!isOpen) return
    let live = true
    setSelected(null); setHost('auto'); setQuery(''); setSource('all'); setStatuses({}); setBusy(false); setError('')
    setExtract(settings.autoExtractArchive !== false); setRemove(settings.autoDeleteArchive === true)
    setPath(settings.downloadPath || '')
    if (!settings.downloadPath) void window.electronAPI?.getDefaultDownloadPath?.().then(value => { if (live && value) setPath(value) }).catch(() => {})
    return () => { live = false }
  }, [isOpen, gameName])

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = [...panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]') || []].filter(el => el.getClientRects().length && el.tabIndex >= 0)
      const first = elements[0], last = elements.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    panel.current?.querySelector<HTMLElement>('button,input')?.focus({ preventScroll: true })
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [isOpen, gameName])

  useEffect(() => {
    let live = true
    if (isOpen && selected) for (const row of hosts.filter(row => !row.p2p)) {
      setStatuses(previous => ({ ...previous, [row.url]: 'loading' }))
      void checks.run(async () => {
        if (!live) return
        try {
          const api = window.electronAPI
          const result: DownloadLinkStatus = api?.inspectDownloadLink ? await api.inspectDownloadLink(row.url) : { state: 'unknown' }
          if (live) setStatuses(previous => ({ ...previous, [row.url]: result }))
        } catch { if (live) setStatuses(previous => ({ ...previous, [row.url]: { state: 'unknown' } })) }
      })
    }
    return () => { live = false }
  }, [isOpen, selected, hosts])

  if (!isOpen) return null
  const choose = (row: DownloadOption) => { setSelected(row); setHost('auto'); setError('') }
  const grouped = hosts.filter((row, index) => hosts.findIndex(other => other.host === row.host) === index)
  const http = hosts.filter(row => !row.p2p)
  const availability = (url: string) => { const value = statuses[url]; return typeof value !== 'object' ? 1 : value.state === 'reachable' ? 0 : value.state === 'verification' ? 2 : value.state === 'unavailable' ? 3 : 1 }
  const automatic = [...http].sort((a,b) => availability(a.url) - availability(b.url) || a.priority - b.priority)[0] || hosts[0]
  const start = async () => {
    const url = host === 'auto' ? automatic?.url : host
    if (!url || !selected || busy) return
    setBusy(true); setError('')
    try { if (await onDownload(url, selected.title, path, !url.startsWith('magnet:'), extract, extract && remove, hosts.map(row => row.url)) === false) { setError(c.failed); setBusy(false) } }
    catch { setError(c.failed); setBusy(false) }
  }
  const status = (url: string) => {
    const value = statuses[url]
    if (value === 'loading') return <span className="download-host-status" data-state="loading"><Loader2 size={11} className="download-spinner" />{c.checking}</span>
    const state = value?.state || 'unknown'
    return <span className="download-host-status" data-state={state} title={value?.reason ? downloadIssueLabel(value.reason, language) : undefined}>{c[state]}</span>
  }
  return createPortal(<div className="download-dialog-shade" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="download-dialog-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="download-dialog-title" data-step={selected ? '2' : '1'}>
      <header className="download-dialog-header">
        <div className="download-game-art">{coverUrl ? <img src={coverUrl} alt="" /> : <Download size={25} />}</div>
        <div className="download-heading"><p>{c.title}</p><h2 id="download-dialog-title">{gameName}</h2></div>
        <button className="download-icon-button" onClick={onClose} aria-label={c.close}><X size={18} /></button>
      </header>
      <div className="download-dialog-steps"><span data-current={!selected || undefined}><i>{selected ? <Check size={11} /> : '1'}</i>{c.release}</span><span className="download-step-line" /><span data-current={!!selected || undefined}><i>2</i>{c.setup}</span></div>
      {!selected ? <>
        <div className="download-dialog-filters"><label><Search size={15} /><input autoComplete="off" placeholder={c.search} aria-label={c.search} value={query} onChange={event => setQuery(event.target.value)} /></label><div className="download-source-select"><Select aria-label={c.all} value={source} onChange={event => setSource(event.target.value)}><option value="all">{c.all}</option>{sources.map(name => <option key={name}>{name}</option>)}</Select><ChevronDown size={13} /></div></div>
        <div className="download-release-list">
          {filtered.length ? filtered.map((row,index) => <button className="download-release" key={row.title + row.sourceName + index} onClick={() => choose(row)}><span className="download-release-symbol"><Download size={17} /></span><span className="download-release-content"><strong>{releaseLabel(row.title, gameName)}</strong><span><b>{row.sourceName}</b>{row.fileSize && <span>{row.fileSize}</span>}{row.uploadDate && Number.isFinite(Date.parse(row.uploadDate)) && <time>{new Date(row.uploadDate).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</time>}<span>{new Set(row.uris).size} {language === 'de' ? 'Links' : 'links'}</span></span></span><ArrowRight size={17} /></button>) : <div className="download-empty"><Search size={23} /><strong>{c.empty}</strong><button className="download-secondary" onClick={() => { void window.electronAPI?.openUrl?.('https://eclipselauncher.pages.dev/#/downloads') }}><Globe size={14} />{c.sources}</button></div>}
        </div><footer className="download-dialog-footer"><span>{filtered.length} {language === 'de' ? filtered.length === 1 ? 'Version' : 'Versionen' : filtered.length === 1 ? 'release' : 'releases'} · {sources.length} {language === 'de' ? sources.length === 1 ? 'Quelle' : 'Quellen' : sources.length === 1 ? 'source' : 'sources'}</span><span>{language === 'de' ? 'Version auswählen, um fortzufahren' : 'Choose a release to continue'}</span></footer>
      </> : <>
        <div className="download-setup-body">
          <button className="download-back" onClick={() => { setSelected(null); setError('') }}><ArrowLeft size={13} />{c.back}</button>
          <div className="download-selected-release"><span>{c.selected}</span><strong>{releaseLabel(selected.title, gameName)}</strong><p>{selected.sourceName}{selected.fileSize ? ` · ${selected.fileSize}` : ''}</p></div>
          <div className="download-field-heading"><h3>{c.server}</h3><span>{grouped.length} {language === 'de' ? 'Hoster' : 'hosts'}</span></div>
          <div className="download-host-list" role="radiogroup" aria-label={c.server}>
            {http.length > 1 && <label className="download-host-row download-host-auto" data-selected={host === 'auto' || undefined}><input type="radio" name="download-host" checked={host === 'auto'} onChange={() => setHost('auto')} /><span className="download-radio" /><span className="download-host-copy"><strong>{c.auto}<span className="download-recommended">{language === 'de' ? 'Empfohlen' : 'Recommended'}</span></strong><small>{c.autoHint}</small></span></label>}
            {grouped.map(row => { const links = hosts.filter(item => item.host === row.host); return <label key={row.host} className="download-host-row" data-selected={host === row.url || host === 'auto' && http.length < 2 && automatic?.url === row.url || undefined}><input type="radio" name="download-host" checked={host === row.url || host === 'auto' && http.length < 2 && automatic?.url === row.url} onChange={() => setHost(row.url)} /><span className="download-radio" /><span className="download-host-copy"><strong>{row.name}</strong><small>{row.p2p ? 'Peer-to-peer' : links.length > 1 ? `${links.length} ${language === 'de' ? 'Links · automatisch geprüft' : 'links · checked automatically'}` : row.host}</small></span>{row.p2p ? <span className="download-host-status">{c.p2p}</span> : status(row.url)}</label> })}
          </div>
          <label className="download-field-heading" htmlFor="download-directory"><h3>{c.folder}</h3></label><div className="download-folder"><FolderOpen size={15} /><input id="download-directory" aria-label={c.path} value={path} onChange={event => setPath(event.target.value)} /><button onClick={() => { void window.electronAPI?.selectDirectory?.().then(value => { if (value) setPath(value) }) }}>{c.browse}</button></div>
          <div className="download-preferences"><label><span><strong>{c.extract}</strong><small>{c.extractHint}</small></span><input type="checkbox" checked={extract} onChange={event => setExtract(event.target.checked)} /></label><label data-disabled={!extract || undefined}><span><strong>{c.remove}</strong><small>{c.removeHint}</small></span><input type="checkbox" checked={remove} disabled={!extract} onChange={event => setRemove(event.target.checked)} /></label></div>
          {error && <p className="download-form-error" role="alert">{error}</p>}
        </div>
        <footer className="download-start-footer"><p>{c.note}</p><button className="download-primary" onClick={() => { void start() }} disabled={busy || !path.trim() || !hosts.length}>{busy ? <Loader2 size={16} className="download-spinner" /> : <Download size={16} />}{busy ? c.starting : c.start}</button></footer>
      </>}
    </div>
  </div>, document.body)
}
