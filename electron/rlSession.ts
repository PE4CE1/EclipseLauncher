import { rocketPlayerId } from './rocketLeagueEvents'
import type { RLPlaylist, RLRankData, RLConnection } from '../src/types/rocketLeague'

const playlists: Record<number, RLPlaylist | undefined> = { 10: '1v1', 11: '2v2', 13: '3v3' }
const validTeam = (value: unknown): value is number => value === 0 || value === 1
const validMatch = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128
const freshSession = () => ({ wins: 0, losses: 0, streak: 0, best: 0, last: null as number | null, started: Date.now() })

export function createRLSession() {
  let playerId = '', name = '', playlist: RLPlaylist = '2v2', connection: RLConnection = 'disabled', historyReplay = false
  let players: RLRankData['players'] = []
  let sessions = { '1v1': freshSession(), '2v2': freshSession(), '3v3': freshSession() }
  const completed = new Set<string>()
  const remember = (guid: string) => { completed.add(guid); if (completed.size > 512) completed.delete(completed.values().next().value!) }
  const active = new Map<string, { team: number; playlist: RLPlaylist }>()
  const select = (id: string, selectedPlaylist: RLPlaylist) => {
    if (playerId !== id) {
      playerId = rocketPlayerId(id) ? id : ''; name = ''; players = []
      sessions = { '1v1': freshSession(), '2v2': freshSession(), '3v3': freshSession() }
      completed.clear(); active.clear(); historyReplay = false
    }
    playlist = selectedPlaylist
  }
  const finish = (guid: string, winner: number) => {
    const match = active.get(guid)
    if (!match || completed.has(guid) || !validTeam(winner)) return
    remember(guid); active.delete(guid)
    const session = sessions[match.playlist], won = match.team === winner
    if (won) { session.wins++; session.streak = Math.max(0, session.streak) + 1; session.best = Math.max(session.best, session.streak) }
    else { session.losses++; session.streak = Math.min(0, session.streak) - 1 }
    session.last = Date.now()
  }
  return {
    select,
    connection(value: RLConnection) { connection = value; if (value === 'disabled') active.clear() },
    reset() { sessions = { '1v1': freshSession(), '2v2': freshSession(), '3v3': freshSession() } },
    accept(message: any): boolean {
      const event = message?.Event, data = message?.Data
      if (event === 'ReplayCreated') { historyReplay = true; active.clear(); return false }
      if (event === 'MatchCreated') { historyReplay = false; return false }
      if (event === 'MatchDestroyed') { historyReplay = false; if (validMatch(data?.MatchGuid)) active.delete(data.MatchGuid); return false }
      if (historyReplay || !data || !validMatch(data.MatchGuid)) return false
      if (event === 'MatchEnded') { finish(data.MatchGuid, data.WinnerTeamNum); return true }
      if (event !== 'UpdateState' || !Array.isArray(data.Players) || data.Players.length > 16 || typeof data.Game?.bReplay !== 'boolean') return false
      if (data.Game.bReplay) return false
      players = data.Players.filter((player: any) => rocketPlayerId(player?.PrimaryId) && typeof player.Name === 'string' && player.Name.length <= 128)
        .map((player: any) => ({ id: player.PrimaryId, name: player.Name }))
      const own = data.Players.filter((player: any) => player?.PrimaryId === playerId)
      if (!playerId || own.length !== 1) { connection = 'select-player'; return true }
      const player = own[0], mode = playlists[data.Game.PlaylistId]
      connection = 'live'; name = typeof player.Name === 'string' ? player.Name.slice(0, 128) : ''
      if (!mode || !validTeam(player.TeamNum)) return true
      // Observe participation before the final score. Joining a completed match,
      // watching a replay or choosing a spectator target cannot create a result.
      if (data.Game.bHasWinner === false && !completed.has(data.MatchGuid)) {
        const previous = active.get(data.MatchGuid)
        if (previous && (previous.team !== player.TeamNum || previous.playlist !== mode)) { active.delete(data.MatchGuid); remember(data.MatchGuid); return true }
        active.set(data.MatchGuid, { team: player.TeamNum, playlist: mode })
        if (active.size > 8) active.delete(active.keys().next().value!)
      } else if (data.Game.bHasWinner === true && Array.isArray(data.Game.Teams)) {
        const winners = data.Game.Teams.filter((team: any) => typeof team?.Name === 'string' && team.Name && team.Name === data.Game.Winner && validTeam(team.TeamNum))
        if (winners.length === 1) finish(data.MatchGuid, winners[0].TeamNum)
      }
      return true
    },
    snapshot(): RLRankData {
      const session = sessions[playlist], platform = playerId.startsWith('Steam|') ? 'steam' : playerId.startsWith('Epic|') ? 'epic' : 'unknown'
      return { playerName: name, platform, playerId: playerId.split('|')[1] || '', primaryId: playerId, players: [...players], playlist,
        rankName: '', rankIcon: '', mmr: null, division: 0, mmrStatus: 'unavailable',
        sessionWins: session.wins, sessionLosses: session.losses, sessionMMRDelta: null, streak: session.streak,
        bestWinStreak: session.best, sessionStartedAt: session.started, lastMatchAt: session.last, connection, isLoading: false }
    },
  }
}
