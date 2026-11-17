import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipEditHistory, createClipDraftWriter, sameClipEdit, validateClipDraftInput, type ClipEditDraft, type ClipEditState } from '../../services/clipEdits'
import type { EclipseClip } from '../../types/game'
import { useClipStore } from '../../store/clipStore'

type Status = 'clean' | 'pending' | 'saving' | 'saved' | 'error'
const pendingDrafts = new Map<string, { revision: number; draft: ClipEditDraft | null; baseTitle: string; error?: string }>()
let revision = 0
const write = createClipDraftWriter(async (clipId, draft) => {
  const api = window.electronAPI?.clips?.saveDraft
  if (!api) return { success: false, error: 'Draft saving is unavailable. Restart Eclipse.' }
  return api({ clipId, draft })
})

function storedDraft(value: ClipEditDraft | undefined | null): ClipEditDraft | undefined {
  try {
    if (!value || value.version !== 1 || typeof value.baseTitle !== 'string' || value.baseTitle.length > 500) return
    const valid = validateClipDraftInput(value)
    return { version: 1, baseTitle: value.baseTitle, savedAt: Number.isFinite(value.savedAt) ? value.savedAt : 0, ...valid }
  } catch { return }
}

async function persist(clipId: string, draft: ClipEditDraft | null, baseTitle: string) {
  const token = ++revision
  pendingDrafts.set(clipId, { revision: token, draft, baseTitle })
  useClipStore.getState().updateClipDraft(clipId, draft, draft?.state.title || baseTitle)
  const result = await write(clipId, draft)
  if (pendingDrafts.get(clipId)?.revision === token) {
    if (result.success) {
      useClipStore.getState().updateClipDraft(clipId, result.draft || null, result.title || draft?.state.title || baseTitle)
      pendingDrafts.delete(clipId)
    } else {
      pendingDrafts.set(clipId, { revision: token, draft, baseTitle, error: result.error || 'Unable to save draft' })
      useClipStore.getState().updateClipDraft(clipId, draft, draft?.state.title || baseTitle)
    }
  }
  return result
}

export function useClipEdits(clip: EclipseClip) {
  const [initial] = useState(() => {
    const pending = pendingDrafts.get(clip.id)
    const draft = storedDraft(pending ? pending.draft : clip.editDraft)
    const duration = clip.width && clip.duration > 0 ? clip.duration : draft?.sourceDuration || 0
    const baseTitle = (pending?.baseTitle || draft?.baseTitle || clip.title || 'Clip').slice(0, 500)
    return { draft, pending, duration, baseTitle, state: draft?.state || { title: baseTitle, start: 0, end: duration, gameVolume: clip.desktopAudioFileName ? 0 : 1, micVolume: 1, ...(clip.desktopAudioFileName ? { desktopVolume: 1, discordVolume: 0 } : {}) } }
  })
  const [history] = useState(() => new ClipEditHistory(initial.state, initial.duration))
  const [state, setState] = useState(history.present)
  const [duration, setDurationState] = useState(initial.duration)
  const [status, setStatus] = useState<Status>(initial.pending?.error ? 'error' : initial.pending ? 'pending' : initial.draft ? 'saved' : 'clean')
  const [saveError, setSaveError] = useState(initial.pending?.error || '')
  const [hasDraft, setHasDraft] = useState(!!initial.draft)
  const [savedAt, setSavedAt] = useState(initial.draft?.savedAt || 0)
  const durationRef = useRef(initial.duration)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const dirty = useRef(!!initial.pending?.error)
  const lastSent = useRef('')
  const acknowledged = useRef('')
  const operation = useRef(0)
  const alive = useRef(true)
  const hasDraftRef = useRef(!!initial.draft)
  const discardPending = useRef(!!initial.pending && initial.pending.draft === null)
  const inFlight = useRef<Promise<unknown>>(Promise.resolve())

  const flush = useCallback((retry = false) => {
    clearTimeout(timer.current)
    if (retry) { dirty.current = true; lastSent.current = '' }
    if (!dirty.current || durationRef.current <= 0) return inFlight.current
    const state = { ...history.present, title: history.present.title.trim() || initial.baseTitle }
    const signature = JSON.stringify({ state, sourceDuration: durationRef.current })
    const baseline = { title: initial.baseTitle, start: 0, end: durationRef.current, gameVolume: clip.desktopAudioFileName ? 0 : 1, micVolume: 1, ...(clip.desktopAudioFileName ? { desktopVolume: 1, discordVolume: 0 } : {}) }
    const isBaseline = sameClipEdit(state, baseline)
    if (signature === lastSent.current && !retry) {
      dirty.current = false
      hasDraftRef.current = !isBaseline
      if (alive.current) { setHasDraft(!isBaseline); setStatus(acknowledged.current === signature ? (isBaseline ? 'clean' : 'saved') : 'saving') }
      return inFlight.current
    }
    lastSent.current = signature; dirty.current = false
    const token = ++operation.current
    const draft: ClipEditDraft | null = isBaseline ? null : { version: 1, baseTitle: initial.baseTitle, state, sourceDuration: durationRef.current, savedAt: Date.now() }
    discardPending.current = !draft; hasDraftRef.current = !!draft
    if (alive.current) setHasDraft(!!draft)
    if (alive.current) { setStatus('saving'); setSaveError('') }
    const task = persist(clip.id, draft, initial.baseTitle).then(result => {
      if (!alive.current || operation.current !== token) return
      if (result.success) { acknowledged.current = signature; discardPending.current = false; setStatus(dirty.current ? 'pending' : draft ? 'saved' : 'clean'); setSavedAt(result.draft?.savedAt || 0) }
      else { setStatus('error'); setSaveError(result.error || 'Unable to save draft'); lastSent.current = ''; dirty.current = true }
    })
    inFlight.current = task
    return task
  }, [clip.id, history, initial.baseTitle])

  const changed = useCallback(() => {
    discardPending.current = false
    setState(history.present); hasDraftRef.current = true; setHasDraft(true)
    dirty.current = true; setStatus('pending'); setSaveError('')
    clearTimeout(timer.current); timer.current = setTimeout(() => { void flush() }, 500)
  }, [history, flush])
  const change = useCallback((patch: Partial<ClipEditState>) => { if (history.update(patch)) changed(); return history.present }, [history, changed])
  const begin = useCallback((key: string) => history.begin(key), [history])
  const commit = useCallback((key?: string) => history.commit(key), [history])
  const cancel = useCallback((key: string) => { history.cancel(key); changed() }, [history, changed])
  const undo = useCallback(() => { if (history.undo()) changed() }, [history, changed])
  const redo = useCallback(() => { if (history.redo()) changed() }, [history, changed])
  const read = useCallback(() => history.present, [history])
  const readDuration = useCallback(() => durationRef.current, [])
  const setDuration = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return
    durationRef.current = value; setDurationState(value)
    if (history.rebaseDuration(value)) { if (hasDraftRef.current) changed(); else setState(history.present) }
  }, [history, changed])

  const discard = useCallback(() => {
    discardPending.current = true
    clearTimeout(timer.current); history.commit()
    // Discard is itself undoable; the original media is never rewritten.
    history.update({ title: initial.baseTitle, start: 0, end: durationRef.current, gameVolume: clip.desktopAudioFileName ? 0 : 1, micVolume: 1, discordVolume: clip.desktopAudioFileName ? 0 : 1, desktopVolume: clip.desktopAudioFileName ? 1 : undefined, cuts: undefined, output: 'source', cropX: .5 })
    setState(history.present); hasDraftRef.current = false; setHasDraft(false); dirty.current = false; lastSent.current = ''
    const token = ++operation.current
    setStatus('saving'); setSaveError('')
    const task = persist(clip.id, null, initial.baseTitle).then(result => {
      if (!alive.current || operation.current !== token) return
      if (result.success) { discardPending.current = false; setStatus(dirty.current ? 'pending' : 'clean') }
      else { setStatus('error'); setSaveError(result.error || 'Unable to discard draft'); hasDraftRef.current = true; setHasDraft(true) }
    })
    inFlight.current = task
    return task
  }, [clip.id, history, initial.baseTitle])

  useEffect(() => {
    if (operation.current || dirty.current) return
    const pending = pendingDrafts.get(clip.id)
    if (pending?.error) { setStatus('error'); setSaveError(pending.error); dirty.current = true }
    else if (!pending) { setStatus(clip.editDraft ? 'saved' : 'clean'); setSavedAt(clip.editDraft?.savedAt || 0) }
  }, [clip, initial.pending])

  useEffect(() => {
    alive.current = true
    const hide = () => { if (document.hidden) void flush() }
    const leave = () => { void flush() }
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave)
    return () => {
      clearTimeout(timer.current); history.commit(); void flush(); alive.current = false
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave)
    }
  }, [history, flush])

  return { state, duration, setDuration, read, readDuration, change, begin, commit, cancel, undo, redo, baseTitle: initial.baseTitle,
    retry: () => discardPending.current ? discard() : flush(true),
    canUndo: history.canUndo, canRedo: history.canRedo, hasDraft, status, saveError, savedAt, flush, discard }
}
