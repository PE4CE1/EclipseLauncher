export type AutoClipGameId = 'cs2' | 'dota2' | 'lol' | 'rocket-league' | 'overwatch'
export type GsiGameId = 'cs2' | 'dota2'
export interface AutoClipOptions {
  enabled?: boolean
  autoClipEnabled?: boolean
  autoClipCS2Enabled?: boolean
  autoClipCS2Kills?: boolean
  autoClipCS2Wins?: boolean
  autoClipDota2Enabled?: boolean
  autoClipDota2Kills?: boolean
  autoClipDota2Deaths?: boolean
  autoClipDota2Wins?: boolean
  autoClipLoLEnabled?: boolean
  autoClipLoLKills?: boolean
  autoClipLoLDeaths?: boolean
  autoClipLoLWins?: boolean
  autoClipRocketLeagueEnabled?: boolean
  autoClipRocketLeaguePlayerId?: string
  autoClipRocketLeagueGoals?: boolean
  autoClipRocketLeagueSaves?: boolean
  autoClipRocketLeagueDemos?: boolean
  autoClipRocketLeagueWins?: boolean
  rocketLeagueClipDurationSeconds?: number
  overwatchClipDurationSeconds?: number
  autoClipCooldownSeconds?: number
}
export interface AutoClipEvent {
  game: string
  eventType: 'goal' | 'save' | 'demo' | 'win' | 'kill' | 'ace' | 'death'
  title: string
  count?: number
}
export interface AutoClipConnection {
  state: 'disabled' | 'waiting' | 'listening' | 'connected' | 'error' | 'manual'
  detail?: 'restart' | 'not-installed' | 'port-busy' | 'connection' | 'certificate' | 'select-player' | 'no-api'
  lastSeenAt?: number
  lastEventAt?: number
}
export interface AutoClipStatus {
  activeGame: AutoClipGameId | null
  games: Record<AutoClipGameId, AutoClipConnection>
  rocketLeaguePlayers?: {id:string;name:string}[]
}
export interface AutoClipSetupResult { success: boolean; changed?: boolean; error?: 'not-installed' | 'configuration' }
