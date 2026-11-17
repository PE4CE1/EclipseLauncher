import { useRef, useState } from 'react'
import { AlertCircle, ArrowDown, Check, ChevronDown, Download, ExternalLink, FolderOpen, Gamepad2, Loader2, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useDownloadStore, type TorrentPayload } from '../../store/downloadStore'
import { useGameStore } from '../../store/gameStore'
import { useTranslation } from '../../hooks/useTranslation'
import { describeDownloadHost, downloadIssueLabel } from '../../services/downloadPresentation'
import { SmoothCollapse } from '../shared/SmoothCollapse'
import { DownloadGraph } from './DownloadGraph'
import './downloads.css'

const bytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B','KB','MB','GB','TB'], index = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 0 ? 1 : 0)} ${units[index]}`
}
const remaining = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '—'
  const seconds = Math.ceil(milliseconds / 1000)
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`
}

function DownloadTask({ task, cover }: { task: TorrentPayload; cover?: string }) {
  const { language, t } = useTranslation(), de = language === 'de'
  const [details, setDetails] = useState(false), [working, setWorking] = useState(false)
  const busy = useRef(false)
  const [actionError, setActionError] = useState('')
  const error = task.status === 'error', done = task.status === 'done', paused = task.status === 'paused', resolving = !!task.resolution
  const failures = task.mirrorFailures || []
  const localProblem = task.errorCode === 'storage' || task.errorCode === 'permission'
  const groups = [...new Map(failures.map(issue => [`${issue.host}:${issue.code}`, issue])).values()]
  const action = async (kind: 'pause' | 'resume' | 'remove') => {
    if (busy.current) return
    busy.current = true; setWorking(true); setActionError('')
    try {
      if (!window.electronAPI) throw new Error('Native download service unavailable')
      if (kind === 'pause') await window.electronAPI.pauseDownload(task.infoHash)
      else if (kind === 'resume') await window.electronAPI.resumeDownload(task.infoHash)
      else { await window.electronAPI.cancelDownload(task.infoHash); useDownloadStore.getState().removeDownload(task.infoHash) }
    } catch { setActionError(de ? 'Aktion fehlgeschlagen. Bitte erneut versuchen.' : 'Action failed. Please try again.') }
    finally { busy.current = false; setWorking(false) }
  }
  const phase = error ? (de ? 'Aktion erforderlich' : 'Needs attention') : done ? (task.mainExe ? (de ? 'Bereit zum Spielen' : 'Ready to play') : (de ? 'Heruntergeladen' : 'Downloaded')) : paused ? t('paused') : task.status === 'extracting' ? t('extracting') : resolving ? (de ? 'Verbindung wird vorbereitet' : 'Preparing connection') : t('downloading')
  return <article className="download-task" data-status={task.status}>
    <div className="download-task-top">
      <div className="download-task-cover"><Gamepad2 size={23} />{cover && <img src={cover} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} />}</div>
      <div className="download-task-main"><div className="download-task-title"><h3>{task.name}</h3><span className="download-task-state">{error ? <AlertCircle size={11} /> : done ? <Check size={11} /> : null}{phase}</span></div>
        {error ? <p className="download-error-summary">{localProblem ? downloadIssueLabel(task.errorCode!, language) : task.downloaded > 0 ? (de ? `Download unterbrochen · ${bytes(task.downloaded)} empfangen. Versuche es erneut, um fortzufahren.` : `Download interrupted · ${bytes(task.downloaded)} received. Retry to continue.`) : failures.length ? (de ? `${failures.length} Links wurden geprüft. Aktuell liefert keiner eine automatisch nutzbare Datei.` : `${failures.length} links checked. None currently provides an automatic file download.`) : downloadIssueLabel(task.errorCode || 'unknown', language)}</p> : done ? <p className="download-task-summary">{bytes(task.length)}{task.installPath && <span> · {task.installPath}</span>}</p> : <>
          <div className="download-task-progress" role="progressbar" aria-label={phase} aria-valuenow={Math.round(task.progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, task.progress * 100))}%` }} /></div>
          <div className="download-task-telemetry">{resolving ? <><span><Loader2 size={11} className={paused ? '' : 'download-spinner'} />{task.resolution!.host}</span><span>{de ? 'Link' : 'Mirror'} {task.resolution!.attempt} / {task.resolution!.total}</span></> : <><span>{bytes(task.downloaded)} / {task.length ? bytes(task.length) : '—'}</span><span>{`${Math.round(task.progress * 100)}%`}</span>{task.status === 'downloading' && <span>{remaining(task.timeRemaining)}</span>}</>}</div>
        </>}
      </div>
      <div className="download-task-actions" aria-busy={working}>
        {done && task.installPath && <button className="download-secondary" title={t('openFolder')} onClick={() => { void window.electronAPI?.openPath?.(task.installPath!) }}><FolderOpen size={14} /><span>{de ? 'Ordner' : 'Folder'}</span></button>}
        {done && task.mainExe && <button className="download-secondary" onClick={() => { void window.electronAPI?.launchGame(task.mainExe!) }}><Play size={13} />{t('play')}</button>}
        {error && <button className="download-secondary" disabled={working} onClick={() => { void action('resume') }}><RotateCcw size={13} />{de ? 'Erneut versuchen' : 'Try again'}</button>}
        {!done && !error && task.status !== 'extracting' && <button className="download-transfer-button" disabled={working} aria-label={paused ? t('resume') : de ? 'Pausieren' : 'Pause'} title={paused ? t('resume') : de ? 'Pausieren' : 'Pause'} onClick={() => { void action(paused ? 'resume' : 'pause') }}>{working ? <Loader2 size={14} className="download-spinner" /> : paused ? <Play size={14} /> : <Pause size={14} />}<span>{paused ? t('resume') : de ? 'Pausieren' : 'Pause'}</span></button>}
        <button className="download-icon-button" disabled={working} title={done ? t('removeFromList') : t('cancel')} aria-label={done ? t('removeFromList') : t('cancel')} onClick={() => { void action('remove') }}><X size={15} /></button>
      </div>
    </div>
    {!done && !error && task.status !== 'extracting' && <DownloadGraph id={task.infoHash} paused={paused} de={de} />}
    {actionError && <p className="download-control-error" role="alert">{actionError}</p>}
    {error && <div className="download-task-error"><button className="download-detail-toggle" aria-expanded={details} onClick={() => setDetails(value => !value)}><ChevronDown size={13} data-open={details || undefined} />{details ? (de ? 'Details ausblenden' : 'Hide details') : (de ? 'Hoster-Details ansehen' : 'View host details')}<span>{groups.length || 1}</span></button><SmoothCollapse open={details}>
      <div className="download-failure-list">{groups.length ? groups.map(issue => {
        let name = issue.host
        try { name = describeDownloadHost(issue.url || `https://${issue.host}`).name } catch {}
        const count = failures.filter(other => other.host === issue.host && other.code === issue.code).length
        return <div className="download-failure" key={issue.host + issue.code}><span><strong>{name}{count > 1 && <small>{count} Links</small>}</strong><p>{downloadIssueLabel(issue.code, language)}{issue.httpStatus ? ` · HTTP ${issue.httpStatus}` : ''}</p></span>{issue.url && <button className="download-icon-button" title={de ? 'Hoster-Seite öffnen' : 'Open host page'} aria-label={de ? `${name} öffnen` : `Open ${name}`} onClick={() => { void window.electronAPI?.openUrl?.(issue.url!) }}><ExternalLink size={13} /></button>}</div>
      }) : <p>{task.errorCode ? downloadIssueLabel(task.errorCode, language) : task.errorMessage?.replace(/https?:\/\/\S+/g, '[link]').slice(0, 1500) || downloadIssueLabel('unknown', language)}</p>}
        <p className="download-failure-help">{localProblem ? (de ? 'Prüfe den Speicherplatz und die Schreibberechtigung des Zielordners. Danach kannst du den Download erneut versuchen.' : 'Check free space and write permissions on the destination folder, then retry the download.') : (de ? 'Bestätigungen, abgelaufene Dateien und Störungen liegen beim Hoster. Nutze eine andere Version oder Quelle, wenn alle Links betroffen sind.' : 'Host confirmations, expired files and outages depend on the provider. Choose another release or source if every link is affected.')}</p>
      </div>
    </SmoothCollapse></div>}
  </article>
}

export function DownloadWorkspace() {
  const { language, t } = useTranslation(), de = language === 'de'
  const downloads = useDownloadStore(state => state.downloads), library = useGameStore(state => state.library)
  const all = Object.values(downloads), active = all.filter(task => task.status !== 'done' && task.status !== 'error'), failed = all.filter(task => task.status === 'error'), done = all.filter(task => task.status === 'done')
  const speed = active.reduce((total, task) => total + (task.downloadSpeed || 0), 0)
  const cover = (task: TorrentPayload) => task.coverUrl || library.find(game => game.name.toLowerCase() === task.name.toLowerCase())?.coverImage
  return <div className="download-workspace launcher-page-surface view-scroll">
    <header className="download-workspace-header"><span className="download-workspace-symbol"><Download size={21} /></span><div><h1>{t('downloads')}</h1><p>{de ? 'Deine Downloads und Dateien an einem Ort.' : 'Your downloads and files in one place.'}</p></div><div className="download-workspace-stats">{speed > 0 && <span><ArrowDown size={12} />{bytes(speed)}/s</span>}<span>{active.length} {de ? 'aktiv' : 'active'}</span>{failed.length > 0 && <span data-attention>{failed.length} {de ? 'zu prüfen' : failed.length === 1 ? 'needs attention' : 'need attention'}</span>}<span>{done.length} {de ? 'abgeschlossen' : 'completed'}</span></div></header>
    <section className="download-section"><div className="download-section-heading"><h2>{de ? 'In Bearbeitung' : 'In progress'}</h2><span>{active.length}</span></div>{active.length ? active.map(task => <DownloadTask key={task.infoHash} task={task} cover={cover(task)} />) : <div className="download-workspace-empty"><Download size={21} /><div><strong>{t('noActiveDownloads')}</strong><p>{de ? 'Neue Downloads erscheinen hier mit Fortschritt und verbleibender Zeit.' : 'New downloads appear here with progress and remaining time.'}</p></div></div>}</section>
    {failed.length > 0 && <section className="download-section"><div className="download-section-heading"><h2>{de ? 'Benötigt deine Aufmerksamkeit' : 'Needs your attention'}</h2><span>{failed.length}</span></div>{failed.map(task => <DownloadTask key={task.infoHash} task={task} cover={cover(task)} />)}</section>}
    <section className="download-section"><div className="download-section-heading"><h2>{de ? 'Abgeschlossen' : 'Completed'}</h2><span>{done.length}</span></div>{done.length ? done.map(task => <DownloadTask key={task.infoHash} task={task} cover={cover(task)} />) : <div className="download-workspace-empty download-workspace-empty-small"><Check size={18} /><p>{de ? 'Noch keine abgeschlossenen Downloads in dieser Sitzung.' : 'No completed downloads in this session yet.'}</p></div>}</section>
  </div>
}
