import { DropdownSurface } from '../shared/DropdownSurface'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, Film, FolderOpen, HardDrive, Loader2, MoreHorizontal, Pencil, Play, Trash2, X } from 'lucide-react'
import type { EclipseClip } from '../../types/game'
import { ClipThumbnail } from './ClipThumbnail'

export const clipBytes = (value: number, locale: string) => {
  const unit = value >= 1_000_000_000 ? 'GB' : 'MB'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 'GB' ? 2 : 1 }).format(value / (unit === 'GB' ? 1_000_000_000 : 1_000_000))} ${unit}`
}

function relativeDate(timestamp: number, de: boolean, locale: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return de ? 'Gerade eben' : 'Just now'
  if (minutes < 60) return de ? `Vor ${minutes} Min.` : `${minutes}m ago`
  if (minutes < 1440) return de ? `Vor ${Math.floor(minutes / 60)} Std.` : `${Math.floor(minutes / 60)}h ago`
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(timestamp)
}

interface Props {
  clip: EclipseClip
  de: boolean
  locale: string
  copied: boolean
  copying: boolean
  copyBusy: boolean
  copyMessage?: string
  copyError: boolean
  optimizing: boolean
  exporting: boolean
  onOpen: (clip: EclipseClip) => void
  onCopy: (clip: EclipseClip) => void
  onCopyDiscord: (clip: EclipseClip) => void
  onExport: (clip: EclipseClip) => void
  onOptimize: (clip: EclipseClip) => void
  onReveal: (clip: EclipseClip) => void
  onDelete: (clip: EclipseClip) => void
  onRename: (clip: EclipseClip, title: string) => Promise<void>
}

export const ClipLibraryCard = memo(function ClipLibraryCard({ clip, de, locale, copied, copying, copyBusy, copyMessage, copyError, optimizing, exporting, onOpen, onCopy, onCopyDiscord, onExport, onOptimize, onReveal, onDelete, onRename }: Props) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const renameInput = useRef<HTMLInputElement>(null)
  const renameBusy = useRef(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [newTitle, setNewTitle] = useState(clip.title)
  const [savingTitle, setSavingTitle] = useState(false)
  const [renameError, setRenameError] = useState('')
  const copyLabel = copying ? (de ? 'Wird vorbereitet…' : 'Preparing…') : copied ? (de ? 'Kopiert · Strg+V' : 'Copied · Ctrl+V') : (de ? 'Für Discord kopieren' : 'Copy for Discord')
  const duration = clip.duration > 0 ? `${Math.floor(clip.duration / 60).toString().padStart(2, '0')}:${Math.floor(clip.duration % 60).toString().padStart(2, '0')}` : '—'
  const properties = [clip.width && clip.height ? `${clip.width} × ${clip.height}` : '', clip.averageFps ? `${clip.averageFps.toLocaleString(locale, { maximumFractionDigits: 1 })} FPS` : '', clipBytes(clip.fileSize || 0, locale)].filter(Boolean).join(' · ')

  useLayoutEffect(() => {
    if (!menuOpen || !trigger.current || !menu.current) return
    const button = trigger.current.getBoundingClientRect(), height = menu.current.offsetHeight
    setAnchor({ left: Math.max(8, Math.min(button.right - 224, window.innerWidth - 232)), top: button.bottom + height + 12 > window.innerHeight ? Math.max(8, button.top - height - 6) : button.bottom + 6 })
    menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setMenuOpen(false) }
    const dismiss = () => { setMenuOpen(false) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    // A portal menu follows its trigger only while the scroll position is fixed.
    window.addEventListener('scroll', dismiss, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true) }
  }, [menuOpen])

  const action = (run: (clip: EclipseClip) => void) => { setMenuOpen(false); trigger.current?.focus({ preventScroll: true }); run(clip) }
  useLayoutEffect(() => {
    if (editingTitle && !savingTitle) { renameInput.current?.focus({ preventScroll: true }); renameInput.current?.select() }
  }, [editingTitle, savingTitle])
  const cancelRename = () => {
    if (renameBusy.current) return
    setEditingTitle(false); setRenameError('')
    requestAnimationFrame(() => renameButton.current?.focus({ preventScroll: true }))
  }
  const saveRename = async () => {
    if (renameBusy.current) return
    const title = newTitle.trim()
    if (!title) { setRenameError(de ? 'Bitte gib einen Namen ein.' : 'Please enter a name.'); renameInput.current?.focus(); return }
    if (title === clip.title) { cancelRename(); return }
    renameBusy.current = true; setSavingTitle(true); setRenameError('')
    try {
      await onRename(clip, title)
      setEditingTitle(false)
      requestAnimationFrame(() => renameButton.current?.focus({ preventScroll: true }))
    } catch (error) { setRenameError(error instanceof Error ? error.message : String(error)) }
    finally { renameBusy.current = false; setSavingTitle(false) }
  }

  return <article className="clip-library-card" data-clip-card={clip.id}>
    <div className="clip-library-art">
      <button className="clip-library-preview" disabled={savingTitle} onClick={() => onOpen(clip)} aria-label={`${de ? 'Clip öffnen' : 'Open clip'}: ${clip.title}`}>
        {clip.thumbnailUrl && failedThumbnail !== clip.thumbnailUrl
          ? <ClipThumbnail src={clip.thumbnailUrl} onError={() => setFailedThumbnail(clip.thumbnailUrl)} />
          : <span className="clip-library-no-image"><Film size={26} strokeWidth={1.2} /><span>{de ? 'Keine Vorschau' : 'No preview'}</span></span>}
        <span className="clip-library-play" aria-hidden="true"><Play size={19} fill="currentColor" strokeWidth={1.5} /></span>
        <span className="clip-library-duration">{duration}</span>
      </button>
      <button className="clip-library-copy" data-clip-quick-discord={clip.id} data-copied={copied || undefined} data-copying={copying || undefined} disabled={copyBusy||optimizing||exporting||savingTitle} onClick={() => onCopyDiscord(clip)} title={copyMessage || (de ? 'Clip bis 20 MB kopieren, einschließlich gespeichertem Schnitt. In Discord Strg+V drücken.' : 'Copy the clip up to 20 MB, including the saved edit. Press Ctrl+V in Discord.')} aria-label={`${copyLabel}: ${clip.title}`}>
        {copying ? <Loader2 size={14} className="animate-spin" /> : copied ? <Check size={14} /> : <Copy size={14} />}<span>{copyLabel}</span>
      </button>
      {optimizing && <span className="clip-library-working" role="status"><Loader2 size={13} className="animate-spin" />{de ? 'Wird optimiert' : 'Optimizing'}</span>}
    </div>
    <div className="clip-library-info">
      <div className="clip-library-title-row">
        {editingTitle ? <>
          <input ref={renameInput} className="clip-library-rename-input" data-clip-rename-input={clip.id} value={newTitle} maxLength={500} disabled={savingTitle} aria-label={de ? 'Clip umbenennen' : 'Rename clip'} aria-invalid={!!renameError} aria-describedby={renameError ? `clip-rename-error-${clip.id}` : undefined} onChange={event => { setNewTitle(event.target.value); setRenameError('') }} onKeyDown={event => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter') { event.preventDefault(); void saveRename() }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
          }} />
          <button className="clip-library-more" disabled={savingTitle} data-clip-rename-save={clip.id} title={de ? 'Speichern (Enter)' : 'Save (Enter)'} aria-label={de ? 'Namen speichern' : 'Save name'} onClick={() => void saveRename()}>{savingTitle ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}</button>
          <button className="clip-library-more" disabled={savingTitle} title={de ? 'Abbrechen (Esc)' : 'Cancel (Esc)'} aria-label={de ? 'Umbenennen abbrechen' : 'Cancel rename'} onClick={cancelRename}><X size={14} /></button>
        </> : <>
          <button className="clip-library-title" onClick={() => onOpen(clip)} title={clip.title}>{clip.title}</button>
          <button ref={renameButton} className="clip-library-more clip-library-rename" data-clip-rename={clip.id} disabled={optimizing} title={de ? 'Umbenennen' : 'Rename'} aria-label={`${de ? 'Umbenennen' : 'Rename'}: ${clip.title}`} onClick={() => { setNewTitle(clip.title); setRenameError(''); setEditingTitle(true) }}><Pencil size={13} /></button>
          <button ref={trigger} className="clip-library-more" data-clip-actions={clip.id} aria-label={`${de ? 'Aktionen für' : 'Actions for'} ${clip.title}`} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? `clip-menu-${clip.id}` : undefined} onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={18} /></button>
        </>}
      </div>
      {renameError&&<p className="clip-library-rename-error" id={`clip-rename-error-${clip.id}`} role="alert">{renameError}</p>}
      <div className="clip-library-game" title={copyMessage || clip.gameTitle} role={copyMessage ? copyError ? 'alert' : 'status' : undefined} data-clip-copy-feedback={copyMessage ? clip.id : undefined}>{copyMessage || clip.gameTitle || (de ? 'Bildschirmaufnahme' : 'Screen recording')}</div>
      <div className="clip-library-meta" title={properties}><time dateTime={new Date(clip.createdAt || 0).toISOString()}>{relativeDate(clip.createdAt || 0, de, locale)}</time><span aria-hidden="true">·</span><span>{clipBytes(clip.fileSize || 0, locale)}</span>{clip.editDraft&&<><span aria-hidden="true">·</span><span className="clip-library-draft-label">{de?'Entwurf':'Draft'}</span></>}</div>
    </div>
    {createPortal(<DropdownSurface open={menuOpen} ref={menu} id={`clip-menu-${clip.id}`} className="clip-library-menu" role="menu" aria-label={de ? 'Clip-Aktionen' : 'Clip actions'} style={anchor} onKeyDown={event => {
      const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); trigger.current?.focus({ preventScroll: true }) }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus() }
    }}>
      <div className="clip-library-menu-facts">{properties}</div>
      <button role="menuitem" disabled={copyBusy} onClick={() => action(onCopy)}><Copy size={14} />{de ? 'Original kopieren' : 'Copy original'}</button>
      <button role="menuitem" disabled={exporting||copyBusy} onClick={() => action(onExport)}><Download size={14} />{de ? 'Exportieren…' : 'Export…'}</button>
      <button role="menuitem" disabled={optimizing||copyBusy} onClick={() => action(onOptimize)}><HardDrive size={14} />{de ? 'Dateigröße optimieren' : 'Optimize file size'}</button>
      <button role="menuitem" onClick={() => action(onReveal)}><FolderOpen size={14} />{de ? 'Im Ordner anzeigen' : 'Show in folder'}</button>
      <div className="clip-library-menu-divider" />
      <button role="menuitem" className="clip-library-delete" disabled={copyBusy} onClick={() => action(onDelete)}><Trash2 size={14} />{de ? 'Löschen…' : 'Delete…'}</button>
    </DropdownSurface>, document.body)}
  </article>
})
