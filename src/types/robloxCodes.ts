export interface RobloxCodeSource { name: string; url: string }
export interface RobloxCodeGame {
  name: string
  placeId?: string
  universeId?: string
  iconUrl?: string
  creatorName?: string
  players?: number
  rating?: number
  sources?: RobloxCodeSource[]
}
export interface RobloxCodeItem {
  code: string
  reward: string
  isExpired?: boolean
  sourceUrl?: string
  sourceName?: string
  verification?: 'developer' | 'community'
  conflicting?: boolean
  alternatives?: string[]
}
export interface RobloxGameCodesResult extends RobloxCodeGame {
  gameName: string
  activeCodes: RobloxCodeItem[]
  expiredCodes: RobloxCodeItem[]
  source?: string
  lastUpdated: number
  status?: 'ready' | 'empty' | 'unavailable'
  stale?: boolean
}
