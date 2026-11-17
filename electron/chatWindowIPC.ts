import type { WebContents } from 'electron'
import type { MutedChats } from '../src/types/notifications'

type Contents = Pick<WebContents, 'isDestroyed' | 'isFocused' | 'send' | 'once'>
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/')
export function registerChatWindowIPC(ipc: {
  on(channel: string, listener: (event: { sender: Contents }, value: any) => void): unknown
  handle(channel: string, listener: (event: { sender: Contents }, ...args: any[]) => unknown): unknown
}, options: {
  owner: () => Contents | undefined; friends: () => Contents | undefined
  open: (peer: string) => void
  uid: () => string
  loadMuted: () => MutedChats
  saveMuted: (muted: MutedChats) => Promise<boolean>
}) {
  const contexts = new WeakMap<Contents, { uid: string; peerId: string | null; visible: boolean }>()
  let pending: string | null = null, tail: Promise<unknown> = Promise.resolve()
  const trusted = (sender: Contents) => sender === options.owner() || sender === options.friends()
  const open = (peer: unknown) => {
    if (!validId(peer)) throw Error('Invalid chat')
    pending = peer; options.open(peer)
    const target = options.friends(); if (target && !target.isDestroyed()) target.send('chat:open', peer)
  }
  ipc.on('chat:context', ({ sender }, context) => {
    if (!trusted(sender) || !context || !validId(context.uid) || (context.peerId !== null && !validId(context.peerId))) return
    contexts.set(sender, { uid: context.uid, peerId: context.peerId, visible: context.visible === true })
  })
  ipc.handle('chat:active', ({ sender }, uid: string, peer: string) => {
    if (sender !== options.owner() || !validId(uid) || !validId(peer)) return false
    return [options.owner(), options.friends()].some(target => {
      if (!target || target.isDestroyed() || !target.isFocused()) return false
      const context = contexts.get(target)
      return context?.visible === true && context.uid === uid && context.peerId === peer
    })
  })
  ipc.handle('chat:mute', ({ sender }, uid: string, peer: string, muted: boolean) => {
    if (!trusted(sender) || !validId(uid) || !validId(peer) || uid === peer || uid !== options.uid() || typeof muted !== 'boolean') throw Error('Invalid chat preference')
    const work = tail.then(async () => {
      if (uid !== options.uid()) throw Error('Account changed')
      const current = options.loadMuted(), ids = new Set(Array.isArray(current[uid]) ? current[uid] : [])
      if (muted) ids.add(peer); else ids.delete(peer)
      const next = { ...current, [uid]: [...ids].slice(-500) }
      if (!await options.saveMuted(next)) throw Error('Could not save chat preference')
      for (const target of [options.owner(), options.friends()]) if (target && !target.isDestroyed()) target.send('chat:muted', next)
      return next
    })
    tail = work.catch(() => {}); return work
  })
  ipc.handle('chat:open', ({ sender }, peer) => { if (!trusted(sender)) throw Error('Invalid chat window'); open(peer) })
  ipc.handle('chat:pending', ({ sender }) => { if (sender !== options.friends()) return null; const peer = pending; pending = null; return peer })
  return { open }
}
