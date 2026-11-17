import type { WebContents } from 'electron'
import type { SocialSnapshot, SocialRefreshResult } from '../src/types/socialState'
import { socialSettingKeys } from '../src/types/socialState'

interface IPC {
  on(channel: string, listener: (event: { sender: WebContents }, data: any) => void): unknown
  handle(channel: string, listener: (event: { sender: WebContents }, ...args: any[]) => unknown): unknown
}

/** Only the launcher publishes state; only its Friends window may request a refresh. */
export function registerSocialStateRelay(ipc: IPC, owner: () => WebContents | undefined, friends: () => WebContents | undefined) {
  let latest: SocialSnapshot | null = null, observed: WebContents | undefined, serial = 0
  let pending: { id: number; force: boolean; dispatched: boolean; promise: Promise<SocialSnapshot | null>; resolve: (snapshot: SocialSnapshot | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined
  const deliver = () => { const target = friends(); if (target && !target.isDestroyed()) target.send('social:snapshot', latest) }
  const dispatchRefresh = () => {
    const source = owner()
    if (!latest || !pending || pending.dispatched || !source || source.isDestroyed()) return
    pending.dispatched = true
    source.send('social:refresh', { id: pending.id, force: pending.force })
  }
  const reset = (notify = true) => {
    latest = null
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Social connection is restarting')); pending = undefined }
    if (notify) deliver()
  }
  const observe = (source: WebContents) => {
    if (observed === source) return
    if (observed) reset()
    observed = source; latest = null
    source.on('did-start-loading', () => { if (observed === source) reset() })
    source.on('render-process-gone', () => { if (observed === source) reset() })
    // Chromium teardown must not enqueue IPC into other windows being destroyed.
    source.once('destroyed', () => { if (observed === source) { reset(false); observed = undefined } })
  }
  const isReader = (sender: WebContents) => sender === owner() || sender === friends()
  ipc.on('social:publish', ({ sender }, value: SocialSnapshot) => {
    if (sender !== owner() || !value || typeof value.uid !== 'string' || !value.settings || value.settings.userUid !== value.uid) return
    observe(sender)
    latest = { uid: value.uid, settings: Object.fromEntries(socialSettingKeys.filter(key => Object.prototype.hasOwnProperty.call(value.settings, key)).map(key => [key, value.settings[key]])),
      activeGame: value.activeGame ? { id: value.activeGame.id, name: value.activeGame.name, startTime: value.activeGame.startTime } : null,
      permissionDenied: value.permissionDenied === true,
      chatInbox: Array.isArray(value.chatInbox) ? value.chatInbox.slice(0, 100) : undefined }
    deliver()
    dispatchRefresh()
  })
  ipc.handle('social:get', ({ sender }) => {
    if (!isReader(sender)) throw Error('Social state is unavailable in this window')
    const source = owner(); if (source) observe(source)
    return latest
  })
  ipc.handle('social:refresh', ({ sender }, force: boolean) => {
    if (sender !== friends()) throw Error('Social refresh is unavailable in this window')
    const source = owner()
    if (!source || source.isDestroyed()) throw Error('Social connection is restarting')
    observe(source)
    if (pending) return pending.promise
    const id = ++serial
    let resolve!: (snapshot: SocialSnapshot | null) => void, reject!: (error: Error) => void
    const promise = new Promise<SocialSnapshot | null>((yes, no) => { resolve = yes; reject = no })
    const timer = setTimeout(() => {
      if (pending?.id === id) { pending = undefined; reject(Error('Social refresh timed out. Please try again.')) }
    }, 25_000)
    timer.unref?.()
    pending = { id, force: force === true, dispatched: false, promise, resolve, reject, timer }
    dispatchRefresh()
    return promise
  })
  ipc.on('social:refreshed', ({ sender }, result: SocialRefreshResult) => {
    if (sender !== owner() || !pending || result?.id !== pending.id) return
    const request = pending; pending = undefined; clearTimeout(request.timer)
    if (result.success) request.resolve(latest)
    else request.reject(Error(result.error || 'Could not refresh friends'))
  })
}
