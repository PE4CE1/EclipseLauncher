import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { playNotificationSound } from './soundService'
import type { EclipseFriend } from '../types/game'
import type { ChatThread } from './friendChat'
import { chatIsMuted } from './chatNotifications'

export interface NotificationOptions {
  title?: string
  body: string
  type?: 'success' | 'error' | 'info'
  playSound?: boolean
  duration?: number
}

let lastChatSoundAt = -Infinity
export async function sendChatNotification(friend: EclipseFriend, thread: ChatThread) {
  const settings = useGameStore.getState().settings, uid = settings.userUid || ''
  if (!uid || thread.senderId === uid || chatIsMuted(settings, uid, friend.id)) return
  const popup = settings.desktopNotifications !== false && settings.chatNotificationPopups !== false
  const sound = settings.soundEffects !== false && settings.chatNotificationSound !== false
  const body = [...thread.text].slice(0, 240).join('')
  if (sound && Date.now() - lastChatSoundAt >= 1200) {
    lastChatSoundAt = Date.now()
    playNotificationSound(settings.notificationSound || 'eclipse_calm')
  }
  if (!popup) return
  const display = () => {
    const current = useGameStore.getState().settings
    if (current.userUid === uid && !chatIsMuted(current, uid, friend.id)) useUIStore.getState().showNotification(body, 'info', friend.username, 6000,
      { kind: 'message', peerId: friend.id, ownerUid: uid, avatarUrl: friend.avatarUrl, private: true })
  }
  const native = window.electronAPI?.showNativeNotification
  if ((!document.hasFocus() || document.hidden) && native) {
    try { if ((await native({ title: friend.username, body, peerId: friend.id, silent: true })).success) return } catch {}
  }
  display()
}

/**
 * Dispatch an in-client notification respecting user preferences (Notification + Selected Sound Preset)
 */
export async function sendAppNotification({
  title,
  body,
  type = 'info',
  playSound = true,
  duration = 5000,
}: NotificationOptions) {
  const settings = useGameStore.getState().settings
  const notifEnabled = settings.desktopNotifications ?? true
  const soundEnabled = settings.soundEffects ?? true

  // 1. In-Client Notification (Bottom Right)
  if (notifEnabled) {
    useUIStore.getState().showNotification(body || title || '', type, title, duration)
  }

  // 2. Play Audio Cue with user's chosen preset
  if (playSound && soundEnabled) {
    playNotificationSound(settings.notificationSound || 'eclipse_calm')
  }
}
