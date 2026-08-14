import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { playNotificationSound } from './soundService'

export interface NotificationOptions {
  title?: string
  body: string
  type?: 'success' | 'error' | 'info'
  playSound?: boolean
  duration?: number
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
