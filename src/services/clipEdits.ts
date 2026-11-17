export interface ClipEditState {
  title: string
  start: number
  end: number
  gameVolume: number
  micVolume: number
  discordVolume?: number
  desktopVolume?: number
  cuts?: ClipRange[]
  output?: 'source' | 'portrait' | 'square'
  cropX?: number
}

export interface ClipRange { start: number; end: number }

export interface ClipExportRequest {
  filePath: string; suggestedName: string; trimStart?: number; trimEnd?: number
  gameVolume?: number; micVolume?: number; discordVolume?: number; desktopVolume?: number; cuts?: ClipRange[]
  output?: 'source' | 'portrait' | 'square'; cropX?: number; maxBytes?: number
}

export function clipKeptRanges(state: Pick<ClipEditState, 'start' | 'end' | 'cuts'>): ClipRange[] {
  const ranges: ClipRange[] = []; let start = state.start
  for (const cut of state.cuts || []) {
    if (cut.start > start + .00001) ranges.push({ start, end: cut.start })
    start = Math.max(start, cut.end)
  }
  if (state.end > start + .00001) ranges.push({ start, end: state.end })
  return ranges
}
export const clipOutputDuration = (state: Pick<ClipEditState, 'start' | 'end' | 'cuts'>) => clipKeptRanges(state).reduce((sum, range) => sum + range.end - range.start, 0)
export const clipOutputTime = (value: number, state: Pick<ClipEditState, 'start' | 'end' | 'cuts'>) => clipKeptRanges(state).reduce((sum, range) => sum + Math.max(0, Math.min(value, range.end) - range.start), 0)
export function clipSourceTime(value: number, state: Pick<ClipEditState, 'start' | 'end' | 'cuts'>): number {
  let remaining = Math.max(0, Number.isFinite(value) ? value : 0)
  for (const range of clipKeptRanges(state)) { const length = range.end-range.start; if (remaining < length) return range.start+remaining; remaining-=length }
  return state.end
}

export function normalizeClipCuts(cuts: ClipRange[] | undefined, start: number, end: number): ClipRange[] {
  const result: ClipRange[] = []
  for (const cut of (cuts || []).filter(cut => cut && Number.isFinite(cut.start) && Number.isFinite(cut.end)).map(cut => ({ start: Math.max(start, cut.start), end: Math.min(end, cut.end) })).filter(cut => cut.end - cut.start >= .02).sort((a, b) => a.start - b.start).slice(0, 100)) {
    const previous = result[result.length - 1]
    if (previous && cut.start <= previous.end + .001) previous.end = Math.max(previous.end, cut.end)
    else result.push(cut)
  }
  return result
}

export interface ClipEditDraft {
  version: 1
  baseTitle: string
  sourceDuration: number
  savedAt: number
  state: ClipEditState
}

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback
export const minimumClipSelection = (duration: number) => Math.min(.1, Math.max(0, duration))

export function normalizeClipEdit(state: ClipEditState, duration: number): ClipEditState {
  const length = Math.max(0, finite(duration, 0)), minimum = minimumClipSelection(length)
  const start = Math.max(0, Math.min(length - minimum, finite(state.start, 0)))
  const end = Math.max(start + minimum, Math.min(length, finite(state.end, length)))
  const cuts = normalizeClipCuts(state.cuts, start, end)
  return { title: typeof state.title === 'string' ? state.title.slice(0, 500) : '', start, end,
    ...(cuts.length && clipOutputDuration({ start, end, cuts }) >= minimum ? { cuts } : {}),
    ...(state.discordVolume !== undefined ? { discordVolume: Math.max(0, Math.min(1, finite(state.discordVolume, 1))) } : {}),
    ...(state.desktopVolume !== undefined ? { desktopVolume: Math.max(0, Math.min(1, finite(state.desktopVolume, 1))) } : {}),
    ...(state.output && state.output !== 'source' ? { output: state.output } : {}),
    ...(state.cropX !== undefined && state.cropX !== .5 ? { cropX: Math.max(0, Math.min(1, finite(state.cropX, .5))) } : {}),
    gameVolume: Math.max(0, Math.min(1, finite(state.gameVolume, 1))),
    micVolume: Math.max(0, Math.min(1, finite(state.micVolume, 1))) }
}

export function sameClipEdit(a: ClipEditState, b: ClipEditState): boolean {
  return a.title === b.title && a.start === b.start && a.end === b.end && a.gameVolume === b.gameVolume && a.micVolume === b.micVolume && (a.discordVolume ?? 1) === (b.discordVolume ?? 1) && (a.desktopVolume ?? 1) === (b.desktopVolume ?? 1) && (a.output || 'source') === (b.output || 'source') && (a.cropX ?? .5) === (b.cropX ?? .5) && JSON.stringify(a.cuts || []) === JSON.stringify(b.cuts || [])
}

export function clampClipPosition(value: number, state: Pick<ClipEditState, 'start' | 'end'>): number {
  const target = Math.max(state.start, Math.min(state.end, finite(value, state.start)))
  const cut = (state as ClipEditState).cuts?.find(cut => target >= cut.start && target < cut.end)
  return cut ? cut.end : target
}

export function validateClipDraftInput(input: unknown): { state: ClipEditState; sourceDuration: number } {
  const draft = input as { state?: ClipEditState; sourceDuration?: number } | null
  const state = draft?.state, duration = draft?.sourceDuration
  if (!state || typeof state.title !== 'string' || !state.title.trim() || state.title.length > 500 ||
      typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86400 ||
      ![state.start, state.end, state.gameVolume, state.micVolume].every(value => typeof value === 'number' && Number.isFinite(value)) ||
      state.start < 0 || state.end > duration || state.end - state.start < minimumClipSelection(duration) - .000001 ||
      state.gameVolume < 0 || state.gameVolume > 1 || state.micVolume < 0 || state.micVolume > 1) throw new Error('Invalid clip draft')
  if (state.desktopVolume !== undefined && (!Number.isFinite(state.desktopVolume) || state.desktopVolume < 0 || state.desktopVolume > 1) || state.discordVolume !== undefined && (!Number.isFinite(state.discordVolume) || state.discordVolume < 0 || state.discordVolume > 1) || state.output !== undefined && !['source','portrait','square'].includes(state.output) || state.cropX !== undefined && (!Number.isFinite(state.cropX) || state.cropX < 0 || state.cropX > 1)) throw new Error('Invalid clip output options')
  if (state.cuts !== undefined && (!Array.isArray(state.cuts) || state.cuts.length > 100 || state.cuts.some(cut => !cut || !Number.isFinite(cut.start) || !Number.isFinite(cut.end) || cut.start < state.start || cut.end > state.end || cut.end - cut.start < .02))) throw new Error('Invalid clip cuts')
  const normalized = normalizeClipEdit({ ...state, title: state.title.trim() }, duration)
  if (state.cuts?.length && clipOutputDuration({ ...state, cuts: normalizeClipCuts(state.cuts, state.start, state.end) }) < minimumClipSelection(duration)) throw new Error('Clip cuts remove the entire selection')
  return { sourceDuration: duration, state: normalized }
}

/** One pointer gesture or focused field is one undo step, irrespective of event frequency. */
export class ClipEditHistory {
  present: ClipEditState
  private past: ClipEditState[] = []
  private future: ClipEditState[] = []
  private transaction: { key: string; before: ClipEditState } | null = null
  constructor(initial: ClipEditState, private duration: number, private limit = 100) { this.present = normalizeClipEdit(initial, duration) }
  get canUndo() { return this.past.length > 0 || !!this.transaction && !sameClipEdit(this.transaction.before, this.present) }
  get canRedo() { return this.future.length > 0 && (!this.transaction || sameClipEdit(this.transaction.before, this.present)) }
  begin(key: string) { if (this.transaction?.key === key) return; this.commit(); this.transaction = { key, before: this.present } }
  update(patch: Partial<ClipEditState>): boolean {
    const next = normalizeClipEdit({ ...this.present, ...patch }, this.duration)
    if (sameClipEdit(next, this.present)) return false
    if (!this.transaction) { this.push(this.present); this.future = [] }
    this.present = next; return true
  }
  commit(key?: string) {
    if (!this.transaction || key && this.transaction.key !== key) return
    if (!sameClipEdit(this.transaction.before, this.present)) { this.push(this.transaction.before); this.future = [] }
    this.transaction = null
  }
  cancel(key: string) { if (this.transaction?.key === key) { this.present = this.transaction.before; this.transaction = null } }
  undo(): boolean {
    this.commit()
    const previous = this.past.pop()
    if (!previous) return false
    this.future.push(this.present); this.present = previous; return true
  }
  redo(): boolean {
    if (this.transaction && !sameClipEdit(this.transaction.before, this.present)) this.commit()
    const next = this.future.pop()
    if (!next) return false
    this.transaction = null; this.push(this.present); this.present = next; return true
  }
  rebaseDuration(duration: number): boolean {
    if (!Number.isFinite(duration) || duration <= 0 || duration === this.duration) return false
    const previous = this.present, oldDuration = this.duration
    const adjust = (state: ClipEditState) => normalizeClipEdit({ ...state, end: !oldDuration || Math.abs(state.end - oldDuration) < .001 ? duration : state.end }, duration)
    this.duration = duration; this.present = adjust(this.present); this.past = this.past.map(adjust); this.future = this.future.map(adjust)
    if (this.transaction) this.transaction.before = adjust(this.transaction.before)
    return !sameClipEdit(previous, this.present)
  }
  clear(initial: ClipEditState) { this.present = normalizeClipEdit(initial, this.duration); this.past = []; this.future = []; this.transaction = null }
  private push(state: ClipEditState) { this.past.push(state); if (this.past.length > this.limit) this.past.shift() }
}

export interface ClipDraftSaveResult { success: boolean; draft?: ClipEditDraft | null; title?: string; error?: string }

/** Keep writes from closing/reopening editors in order, including draft deletion. */
export function createClipDraftWriter(write: (clipId: string, draft: { state: ClipEditState; sourceDuration: number } | null) => Promise<ClipDraftSaveResult>) {
  const pending = new Map<string, Promise<unknown>>()
  return (clipId: string, draft: { state: ClipEditState; sourceDuration: number } | null): Promise<ClipDraftSaveResult> => {
    const task = (pending.get(clipId) || Promise.resolve()).then(() => write(clipId, draft)).catch(error => ({ success: false, error: error instanceof Error ? error.message : String(error) }))
    pending.set(clipId, task)
    void task.finally(() => { if (pending.get(clipId) === task) pending.delete(clipId) })
    return task
  }
}
