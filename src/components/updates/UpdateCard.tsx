import { useId, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, Loader2, RotateCw, TriangleAlert } from 'lucide-react'
import { APP_VERSION, GITHUB_REPO } from '../../services/updateService'
import { updateNotes, updatePercent } from '../../services/updatePresentation'
import { ReleaseNotes, openReleaseLink } from '../eclipse/ReleaseNotes'
import './update-card.css'

interface UpdateCardProps {
  language: string
  status: 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  notes?: unknown
  publishedAt?: string
  progress?: number
  error?: string
  onDownload: () => Promise<unknown>
  onInstall: () => Promise<unknown>
  onContinue?: () => void
}

export function UpdateCard({ language, status, version, notes, publishedAt, progress = 0, error, onDownload, onInstall, onContinue }: UpdateCardProps) {
  const de = language === 'de'
  const notesId = useId(), titleId = useId()
  const [expanded, setExpanded] = useState(true)
  const [working, setWorking] = useState<'download' | 'install' | null>(null)
  const [actionError, setActionError] = useState('')
  const actionLock = useRef(false)
  const body = updateNotes(notes)
  const percent = updatePercent(progress)
  const busy = working !== null || status === 'downloading'
  const failed = !working && (status === 'error' || !!actionError)
  const ready = status === 'downloaded' && !failed
  const releaseDate = publishedAt && Number.isFinite(Date.parse(publishedAt))
    ? new Intl.DateTimeFormat(de ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(publishedAt)) : ''
  const target = typeof version === 'string' && version.trim() ? version.trim().replace(/^v/i, '') : ''

  async function act(kind: 'download' | 'install') {
    if (busy || actionLock.current) return
    actionLock.current = true
    setActionError('')
    setWorking(kind)
    try {
      const result = await (kind === 'install' ? onInstall() : onDownload())
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error('error' in result ? String(result.error) : 'Update failed')
      }
    } catch (failure) { setActionError(failure instanceof Error ? failure.message : String(failure)) }
    finally { actionLock.current = false; setWorking(null) }
  }

  return <section className="eclipse-update" data-update-state={failed ? 'error' : status} aria-labelledby={titleId}>
    <div className="eclipse-update__heading">
      <span className="eclipse-update__eyebrow">ECLIPSE <span>/</span> UPDATE</span>
      <span className="eclipse-update__state" role="status"><i />{failed ? (de ? 'Erneut versuchen' : 'Try again') : ready ? (de ? 'Bereit zur Installation' : 'Ready to install') : busy ? (de ? 'Wird vorbereitet' : 'Preparing update') : (de ? 'Neue Version' : 'New version')}</span>
    </div>
    <div className="eclipse-update__hero">
      <div className="eclipse-update__intro">
        <h2 id={titleId}>{failed ? (de ? 'Update fehlgeschlagen.' : 'Update failed.') : ready ? (de ? 'Update heruntergeladen.' : 'Update downloaded.') : (de ? 'Eine neue Version ist da.' : 'A new version is available.')}</h2>
        <div className="eclipse-update__version">{target || (de ? 'Update' : 'Update')}</div>
        <p>{ready ? (de ? 'Ein Neustart installiert die neue Version.' : 'Restart Eclipse to install the new version.') : failed ? (de ? 'Du kannst den Download erneut starten.' : 'You can try downloading the update again.') : (de ? 'Die nächste Version steht für dich bereit.' : 'The next version is ready for you.')}</p>
      </div>
      <div className="eclipse-update__art" aria-hidden="true"><i /><b /></div>
    </div>
    <div className="eclipse-update__metadata"><span>v{APP_VERSION}<ArrowRight size={12} /><strong>{target ? `v${target}` : (de ? 'Neue Version' : 'New version')}</strong></span>{releaseDate && <time dateTime={publishedAt}>{releaseDate}</time>}</div>
    {body && <div className="eclipse-update__notes">
      <button type="button" aria-expanded={expanded} aria-controls={notesId} onClick={() => setExpanded(value => !value)}><span>{de ? 'Das ist neu' : 'What’s new'}</span><ChevronDown size={14} /></button>
      <div id={notesId} hidden={!expanded} className="eclipse-update__notes-content" tabIndex={expanded ? 0 : -1} role="region" aria-label={de ? 'Änderungen dieser Version' : 'Changes in this release'}><ReleaseNotes body={body} emptyLabel="" /></div>
    </div>}
    <div className="eclipse-update__actions">
      <div className="eclipse-update__download" aria-live="polite">
        <span>{ready ? <><Check size={13} />{de ? 'Download abgeschlossen' : 'Download complete'}</> : busy ? <>{de ? 'Update wird heruntergeladen' : 'Downloading update'}</> : <>{de ? 'Windows · Stabile Version' : 'Windows · Stable release'}</>}</span>
        {(busy || ready) && <span>{ready ? '100' : Math.floor(percent)}%</span>}
      </div>
      <div className="eclipse-update__track" style={{ visibility: busy || ready ? 'visible' : 'hidden' }} role={busy || ready ? 'progressbar' : undefined} aria-hidden={!busy && !ready} aria-label={de ? 'Update-Download' : 'Update download'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready ? 100 : Math.floor(percent)}><i style={{ transform: `scaleX(${ready ? 1 : percent / 100})` }} /></div>
      {failed && <div className="eclipse-update__error" role="alert"><TriangleAlert size={15} /><div><p>{de ? 'Das Update konnte nicht abgeschlossen werden. Deine aktuelle Version bleibt erhalten.' : 'The update could not be completed. Your current version is still available.'}</p>{(actionError || error) && <details><summary>{de ? 'Technische Details' : 'Technical details'}</summary><pre>{actionError || error}</pre></details>}</div></div>}
      <button type="button" className="eclipse-update__primary" disabled={busy} onClick={() => { void act(ready ? 'install' : 'download') }}>
        {busy ? <Loader2 size={16} className="eclipse-update__spin" /> : ready || failed ? <RotateCw size={16} /> : <ArrowDownToLine size={16} />}
        {working === 'install' ? (de ? 'Eclipse wird neu gestartet…' : 'Restarting Eclipse…') : busy ? (de ? 'Update wird geladen…' : 'Downloading update…') : ready ? (de ? 'Neu starten und installieren' : 'Restart and install') : failed ? (de ? 'Download erneut versuchen' : 'Retry download') : (de ? 'Update herunterladen' : 'Download update')}
      </button>
      {failed && onContinue && <button type="button" className="eclipse-update__continue" onClick={onContinue}>{de ? 'Vorerst ohne Update fortfahren' : 'Continue without updating for now'}</button>}
      <button type="button" className="eclipse-update__release-link" onClick={() => openReleaseLink(`https://github.com/${GITHUB_REPO}/releases/latest`)}>{de ? 'Release auf GitHub ansehen' : 'View release on GitHub'}<ArrowUpRight size={12} /></button>
    </div>
  </section>
}
