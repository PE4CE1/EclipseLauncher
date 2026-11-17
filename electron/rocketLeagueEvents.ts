import type { AutoClipEvent, AutoClipOptions } from '../src/types/autoClips'

export const rocketPlayerId = (id: unknown): id is string => typeof id === 'string' && /^(?:Steam|Epic)\|[a-zA-Z0-9_-]{1,128}\|[0-3]$/.test(id)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const team = (value: unknown) => value === 0 || value === 1

export function createRocketLeagueDetector() {
  let match = '', identity = '', goals = 0, saves = 0, demos = 0, ended = false, historyReplay = false
  const reset = () => { match = ''; identity = ''; ended = false }
  return (message: any, rules: AutoClipOptions) => {
    const events: AutoClipEvent[] = []
    const ignored = () => ({valid:false,events,players:undefined})
    if (message?.Event === 'ReplayCreated') { historyReplay = true; reset(); return ignored() }
    if (message?.Event === 'MatchDestroyed' || message?.Event === 'MatchCreated') { historyReplay = false; reset(); return ignored() }
    const data = message?.Data
    if (message?.Event !== 'UpdateState' || historyReplay || !data || !Array.isArray(data.Players) || data.Players.length > 16 || typeof data.MatchGuid !== 'string' || !data.MatchGuid || data.MatchGuid.length > 128 || typeof data.Game?.bReplay !== 'boolean') return ignored()
    const players = data.Players.filter((player: any) => rocketPlayerId(player?.PrimaryId) && typeof player.Name === 'string' && player.Name.length <= 128).map((player: any) => ({id:player.PrimaryId as string,name:player.Name as string}))
    const selected = data.Players.filter((player: any) => player?.PrimaryId === rules.autoClipRocketLeaguePlayerId)
    // The camera target is not a local-player identity. The user selects their
    // exact platform ID; names and spectator targets never select someone implicitly.
    if (!rocketPlayerId(rules.autoClipRocketLeaguePlayerId) || selected.length !== 1) { reset(); return {valid:true,events,players} }
    const player = selected[0]
    if (!team(player.TeamNum) || !count(player.Goals) || !count(player.Saves) || !count(player.Demos)) return ignored()
    if (data.Game.bReplay) return {valid:true,events,players}
    if (match !== data.MatchGuid || identity !== player.PrimaryId || player.Goals < goals || player.Saves < saves || player.Demos < demos) {
      match = data.MatchGuid; identity = player.PrimaryId; ended = data.Game.bHasWinner === true
    } else {
      if (player.Goals > goals && rules.autoClipRocketLeagueGoals !== false) events.push({game:'Rocket League',eventType:'goal',title:'Goal'})
      if (player.Saves > saves && rules.autoClipRocketLeagueSaves !== false) events.push({game:'Rocket League',eventType:'save',title:'Save'})
      if (player.Demos > demos && rules.autoClipRocketLeagueDemos === true) events.push({game:'Rocket League',eventType:'demo',title:'Demolition'})
      if (data.Game.bHasWinner === true && !ended && Array.isArray(data.Game.Teams)) {
        const winners = data.Game.Teams.filter((entry: any) => typeof entry?.Name === 'string' && entry.Name && entry.Name === data.Game.Winner && team(entry.TeamNum))
        if (winners.length === 1) {
          ended = true
          if (winners[0].TeamNum === player.TeamNum && rules.autoClipRocketLeagueWins !== false) events.push({game:'Rocket League',eventType:'win',title:'Match win'})
        }
      }
    }
    goals = player.Goals; saves = player.Saves; demos = player.Demos
    return {valid:true,events,players}
  }
}
