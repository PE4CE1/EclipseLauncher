import type { ChatThread } from './friendChat'
import type { AppSettings, EclipseFriend } from '../types/game'

export const chatIsMuted = (settings: Partial<AppSettings>, uid: string, peer: string) =>
  Array.isArray(settings.chatMutedFriends?.[uid]) && settings.chatMutedFriends![uid].includes(peer)

/** The initial inbox is a baseline, not a reason to replay old notifications. */
export function createChatNotificationObserver(options: {
  uid: string
  settings: () => Partial<AppSettings>
  friends: () => EclipseFriend[]
  currentUid: () => string
  readAt: (peer: string) => number
  isActive: (peer: string) => Promise<boolean>
  notify: (friend: EclipseFriend, thread: ChatThread) => void
}) {
  let initialized = false, stopped = false
  const seen = new Map<string, string>()
  return {
    receive(threads: ChatThread[]) {
      const baseline = !initialized; initialized = true
      for (const thread of threads) {
        const token = thread.messageId || `${thread.senderId}:${thread.updatedAt}:${thread.text}`
        const previous = seen.get(thread.id); seen.set(thread.id, token)
        if (baseline || token === previous || thread.senderId === options.uid || thread.updatedAt <= 0) continue
        const allowed = () => !stopped && options.currentUid() === options.uid
          && !chatIsMuted(options.settings(), options.uid, thread.peerId) && thread.updatedAt > options.readAt(thread.peerId)
        if (!allowed()) continue
        void options.isActive(thread.peerId).then(active => {
          if (active || !allowed()) return
          const friend = options.friends().find(friend => friend.id === thread.peerId)
          if (friend) options.notify(friend, thread)
        }).catch(() => {})
      }
      while (seen.size > 1000) seen.delete(seen.keys().next().value!)
    },
    stop() { stopped = true; seen.clear() },
  }
}
