import type { AutoClipEvent, AutoClipOptions } from '../src/types/autoClips'

const counter = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const steamId = (value: unknown): value is string => typeof value === 'string' && /^\d{17}$/.test(value)
type Result = { valid: boolean; events: AutoClipEvent[] }
const ignored = (): Result => ({ valid: false, events: [] })

export function createCS2Detector() {
  let key = '', kills = -1, wonRound = -1, round = -1, time = 0
  return (data: any, rules: AutoClipOptions): Result => {
    const player = data?.player, map = data?.map, provider = data?.provider
    if (provider?.appid !== 730 || !steamId(provider.steamid) || player?.steamid !== provider.steamid || player.activity !== 'playing' || map?.phase !== 'live') {
      key = ''; return ignored()
    }
    if (!counter(player.match_stats?.kills) || !counter(map.round)) return ignored()
    const nextKey = `${provider.steamid}:${map.name}:${map.mode || ''}`
    const timestamp = Number(provider.timestamp) || 0
    if (nextKey === key && timestamp && timestamp < time) return ignored()
    const current = player.match_stats.kills, currentRound = map.round
    const events: AutoClipEvent[] = []
    if (nextKey !== key || current < kills || currentRound < round) {
      key = nextKey; kills = current; wonRound = data.round?.phase === 'over' ? currentRound : -1
    } else {
      if (current > kills && rules.autoClipCS2Kills !== false) {
        const count = counter(player.state?.round_kills) ? player.state.round_kills : 1
        events.push({ game: 'Counter-Strike 2', eventType: count >= 5 ? 'ace' : 'kill', count, title: count >= 5 ? 'ACE' : count > 1 ? `Multi-kill (${count})` : 'Kill' })
      }
      if (data.round?.phase === 'over' && ['CT','T'].includes(data.round.win_team) && currentRound !== wonRound) {
        wonRound = currentRound
        if (rules.autoClipCS2Wins === true && ['CT','T'].includes(player.team) && data.round.win_team === player.team) events.push({ game: 'Counter-Strike 2', eventType: 'win', title: 'Round win' })
      }
    }
    kills = current; round = currentRound; time = timestamp
    return { valid: true, events }
  }
}

export function createDota2Detector() {
  let key = '', kills = -1, deaths = -1, ended = false, time = 0
  return (data: any, rules: AutoClipOptions): Result => {
    const player = data?.player, map = data?.map, provider = data?.provider
    if (provider?.appid !== 570 || !steamId(player?.steamid) || player.activity !== 'playing' ||
      (provider.steamid && provider.steamid !== player.steamid) || !['DOTA_GAMERULES_STATE_GAME_IN_PROGRESS','DOTA_GAMERULES_STATE_POST_GAME'].includes(map?.game_state)) {
      key = ''; return ignored()
    }
    if (!counter(player.kills) || !counter(player.deaths) || !map.matchid || String(map.matchid) === '0') return ignored()
    const nextKey = `${player.steamid}:${map.matchid}`, timestamp = Number(provider.timestamp) || 0
    if (key === nextKey && timestamp && timestamp < time) return ignored()
    const events: AutoClipEvent[] = [], post = map.game_state === 'DOTA_GAMERULES_STATE_POST_GAME'
    if (key !== nextKey || player.kills < kills || player.deaths < deaths) { key = nextKey; ended = post }
    else {
      if (player.kills > kills && rules.autoClipDota2Kills !== false) events.push({ game: 'Dota 2', eventType: 'kill', title: 'Kill' })
      if (player.deaths > deaths && rules.autoClipDota2Deaths === true) events.push({ game: 'Dota 2', eventType: 'death', title: 'Death' })
      if (post && !ended && rules.autoClipDota2Wins !== false && ['radiant','dire'].includes(player.team_name) && map.win_team === player.team_name) events.push({ game: 'Dota 2', eventType: 'win', title: 'Match win' })
      if (post && ['radiant','dire'].includes(map.win_team)) ended = true
    }
    kills = player.kills; deaths = player.deaths; time = timestamp
    return { valid: true, events }
  }
}

export function createLoLDetector() {
  let name = '', time = -1, lastId = -1
  return (input: { name: unknown; gameTime: unknown; events: unknown }, rules: AutoClipOptions): Result => {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || !Number.isFinite(input.gameTime) || (input.gameTime as number) < 0 || !Array.isArray(input.events) || input.events.length > 5000) return ignored()
    const currentName = input.name.normalize('NFC').toLowerCase(), gameTime = input.gameTime as number
    const events = input.events.filter(event => counter(event?.EventID) && Number.isFinite(event.EventTime)).sort((a,b) => a.EventID-b.EventID)
    const maxId = events.at(-1)?.EventID ?? -1
    if (name !== currentName || gameTime < time || maxId < lastId) {
      name = currentName; time = gameTime; lastId = maxId; return { valid: true, events: [] }
    }
    const same = (value: unknown) => typeof value === 'string' && value.normalize('NFC').toLowerCase() === currentName
    const result: AutoClipEvent[] = []
    for (const event of events) {
      if (event.EventID <= lastId || event.EventTime < gameTime-10 || event.EventTime > gameTime+2) continue
      if (rules.autoClipLoLKills !== false && same(event.KillerName) && ['ChampionKill','Multikill'].includes(event.EventName)) {
        const count = counter(event.KillStreak) ? event.KillStreak : 1
        result.push({ game:'League of Legends', eventType:count >= 5 ? 'ace' : 'kill', count, title:count >= 5 ? 'Pentakill' : count > 1 ? `Multi-kill (${count})` : 'Kill' })
      }
      if (rules.autoClipLoLDeaths === true && event.EventName === 'ChampionKill' && same(event.VictimName)) result.push({ game:'League of Legends', eventType:'death', title:'Death' })
      if (rules.autoClipLoLWins !== false && event.EventName === 'GameEnd' && event.Result === 'Win') result.push({ game:'League of Legends', eventType:'win', title:'Match win' })
    }
    lastId = maxId; time = gameTime
    return { valid:true, events:result }
  }
}

export function autoClipGame(name: string) {
  const game = name.normalize('NFKC').replace(/[®™]/g,'').trim().toLowerCase()
  if (game === 'cs2' || game === 'counter-strike 2' || game === 'counter-strike: global offensive') return 'cs2' as const
  if (game === 'dota 2') return 'dota2' as const
  if (game === 'league of legends') return 'lol' as const
  if (game === 'rocket league') return 'rocket-league' as const
  if (game === 'overwatch' || game === 'overwatch 2') return 'overwatch' as const
  return null
}
