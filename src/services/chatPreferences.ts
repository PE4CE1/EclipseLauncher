import { useGameStore } from '../store/gameStore'
import { persistAppSettings } from './settingsPersistence'
import { chatIsMuted } from './chatNotifications'

export { chatIsMuted }
export async function setFriendMuted(peerId: string, muted: boolean): Promise<boolean> {
  const { settings } = useGameStore.getState(), uid = settings.userUid
  if (!uid || !peerId || peerId === uid) return false
  const api = window.electronAPI?.chatNotifications
  if (api) {
    try {
      const value = await api.setMuted(uid, peerId, muted)
      if (useGameStore.getState().settings.userUid === uid) useGameStore.getState().updateSettings({ chatMutedFriends: value })
      return true
    } catch { return false }
  }
  const current = settings.chatMutedFriends || {}, ids = new Set(Array.isArray(current[uid]) ? current[uid] : [])
  if (muted) ids.add(peerId); else ids.delete(peerId)
  return persistAppSettings({ chatMutedFriends: { ...current, [uid]: [...ids] } })
}
