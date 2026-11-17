import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pencil, RefreshCw, Trash, X } from 'lucide-react'
import type { DownloadSource } from '../../types/source'
import { useSourceStore } from '../../store/sourceStore'
import { sourceErrorMessage } from '../../services/sourceErrors'
import { getSourceRepair } from '../../services/sourceRepairs'
import { normalizeSourceUrl } from '../../services/sourceUrls'

export function SourceConnection({ source, language }: { source: DownloadSource; language: string }) {
  const de = language === 'de'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(source.url)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const busy = saving || source.status === 'syncing'
  const remote = /^https?:\/\//i.test(source.url)
  const repair = getSourceRepair(source.url)
  const actionClass = 'shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40'
  useEffect(() => { if (editing) input.current?.focus() }, [editing])

  async function replace(value: string) {
    if (inFlight.current || busy) return
    let url: string
    try { url = normalizeSourceUrl(value) }
    catch { setError(de ? 'Bitte eine gültige HTTP(S)-Quellenadresse ohne Zugangsdaten eingeben.' : 'Enter a valid HTTP(S) source URL without embedded credentials.'); return }
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      await useSourceStore.getState().replaceSource(source.url, url)
      setEditing(false)
    } catch (failure) {
      const detail = sourceErrorMessage(failure instanceof Error ? failure.message : String(failure), language)
      setError(`${de ? 'Die bisherige Quelle bleibt erhalten.' : 'Your previous source has been kept.'} ${detail}`)
    } finally { inFlight.current = false; setSaving(false) }
  }

  return <>
    {source.lastError && <p className="text-xs text-amber-200/60 leading-relaxed" role="status" title={source.lastError}>
      {de ? 'Quellenhinweis: ' : 'Source notice: '}{sourceErrorMessage(source.lastError, language)}
    </p>}
    {source.lastError && repair && <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
      <span>Alternative: {repair.provider}</span>
      <button type="button" disabled={busy} title={repair.url} onClick={() => { void replace(repair.url) }}
        className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-white/85 hover:bg-white/10 disabled:opacity-40">
        {saving ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {de ? 'Alternative Quelle verwenden' : 'Use alternative source'}
      </button>
      <span className="basis-full text-white/40">{de ? 'Die Alternative kann andere Einträge enthalten. Sie wird vor dem Wechsel neu geprüft.' : 'Coverage may differ. The alternative is checked again before switching.'}</span>
    </div>}
    {source.lastError && remote && !repair && <p className="text-xs leading-relaxed text-white/40">
      {de ? 'Kein geprüfter Ersatz hinterlegt. Du kannst die Adresse aktualisieren oder eine JSON-Datei über „Quelle hinzufügen“ importieren.' : 'No verified alternative is listed. Update the address or import a JSON file using “Add source”.'}
    </p>}
    <div className={`settings-source-location${editing ? ' settings-source-editing' : ''}`}>
      <input ref={input} aria-label={`${de ? 'Quellen-URL' : 'Source URL'}: ${source.name}`} type="text" readOnly={!editing} disabled={saving}
        value={editing ? draft : source.url} spellCheck={false} autoComplete="off"
        onChange={event => { setDraft(event.target.value); setError('') }}
        onKeyDown={event => {
          if (!editing || busy) return
          if (event.key === 'Enter') { event.preventDefault(); void replace(draft) }
          if (event.key === 'Escape') { event.preventDefault(); setEditing(false); setError('') }
        }}
        className="min-w-0 flex-1 bg-white/[0.025] border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 font-mono focus:outline-none focus:border-white/30 disabled:opacity-40" />
      {editing ? <>
        <button type="button" disabled={busy || !draft.trim()} aria-label={de ? 'Adresse prüfen und speichern' : 'Check and save address'} title={de ? 'Prüfen und speichern' : 'Check and save'} className={actionClass} onClick={() => { void replace(draft) }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button type="button" disabled={busy} aria-label={de ? 'Abbrechen' : 'Cancel'} title={de ? 'Abbrechen' : 'Cancel'} className={actionClass} onClick={() => { setEditing(false); setError('') }}><X size={14} /></button>
      </> : <>
        {remote && <button type="button" disabled={busy} aria-label={de ? 'Adresse ändern' : 'Change address'} title={de ? 'Adresse ändern' : 'Change address'} className={actionClass} onClick={() => { setDraft(source.url); setError(''); setEditing(true) }}><Pencil size={14} /></button>}
        <button type="button" disabled={busy} aria-label={`${de ? 'Synchronisieren' : 'Sync'}: ${source.name}`} title={de ? 'Synchronisieren' : 'Sync'} className={actionClass} onClick={() => { void useSourceStore.getState().syncSource(source.url) }}>
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        </button>
        <button type="button" disabled={saving} aria-label={`${de ? 'Quelle entfernen' : 'Remove source'}: ${source.name}`} title={de ? 'Quelle entfernen' : 'Remove source'} onClick={() => useSourceStore.getState().removeSource(source.url)} className="shrink-0 p-2 text-red-400 hover:text-red-300 bg-red-500/10 rounded-lg border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40"><Trash size={14} /></button>
      </>}
    </div>
    {error && <p role="alert" className="text-xs text-amber-200/80 leading-relaxed">{error}</p>}
  </>
}
