export type RLPlaylist = '1v1' | '2v2' | '3v3'
export type RLConnection = 'disabled' | 'waiting' | 'select-player' | 'live' | 'disconnected'
export interface RLRankData {
  playerName: string
  platform: 'steam' | 'epic' | 'unknown'
  playerId: string
  primaryId: string
  players: { id: string; name: string }[]
  playlist: RLPlaylist
  rankName: string
  rankIcon: string
  mmr: number | null
  division: number
  mmrStatus: 'unavailable' | 'ready' | 'stale'
  sessionWins: number
  sessionLosses: number
  sessionMMRDelta: number | null
  streak: number
  bestWinStreak: number
  sessionStartedAt: number
  lastMatchAt: number | null
  connection: RLConnection
  isLoading: boolean
}
