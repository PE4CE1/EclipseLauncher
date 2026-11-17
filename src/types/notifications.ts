export interface ToastDetails {
  kind?: 'message'
  avatarUrl?: string
  peerId?: string
  ownerUid?: string
  private?: boolean
}
export type MutedChats = Record<string, string[]>
export interface ChatNotificationAPI {
  setContext: (context: { uid: string; peerId: string | null; visible: boolean }) => void
  isActive: (uid: string, peerId: string) => Promise<boolean>
  setMuted: (uid: string, peerId: string, muted: boolean) => Promise<MutedChats>
  onMuted: (callback: (muted: MutedChats) => void) => () => void
  open: (peerId: string) => Promise<void>
  pending: () => Promise<string | null>
  onOpen: (callback: (peerId: string) => void) => () => void
}
