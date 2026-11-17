import type { AppSettings } from './game'

export const socialSettingKeys = ['userUid', 'friendCode', 'username', 'avatarUrl', 'avatarFrame',
  'steamAvatarFrameUrl', 'steamAvatarFrameStaticUrl', 'language', 'eclipseFriends',
  'incomingFriendRequests', 'outgoingFriendRequests', 'chatMutedFriends', 'chatNotificationPopups', 'chatNotificationSound'] as const

export type SocialSettings = Pick<AppSettings, typeof socialSettingKeys[number]>
export interface SocialSnapshot {
  uid: string
  settings: Partial<SocialSettings>
  activeGame: { id: string; name: string; startTime: number } | null
  permissionDenied: boolean
  chatInbox?: import('../services/friendChat').ChatThread[]
}
export type SocialRefreshRequest = { id: number; force: boolean }
export type SocialRefreshResult = { id: number; success: boolean; error?: string }
export interface SocialStateAPI {
  publish: (snapshot: SocialSnapshot) => void
  getSnapshot: () => Promise<SocialSnapshot | null>
  onSnapshot: (callback: (snapshot: SocialSnapshot | null) => void) => () => void
  refresh: (force: boolean) => Promise<SocialSnapshot | null>
  onRefresh: (callback: (request: SocialRefreshRequest) => void) => () => void
  completeRefresh: (result: SocialRefreshResult) => void
}
