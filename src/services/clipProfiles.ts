import type { AutoClipOptions } from '../types/autoClips'

export function clipProfileDuration(settings: AutoClipOptions & {replayDurationSeconds?:number}, game: string | undefined): number {
  const name = (game || '').normalize('NFKC').replace(/[®™]/g,'').trim().toLowerCase()
  const override = name === 'rocket league' ? settings.rocketLeagueClipDurationSeconds : ['overwatch','overwatch 2'].includes(name) ? settings.overwatchClipDurationSeconds : undefined
  const requested = override || settings.replayDurationSeconds || 30
  return Math.max(5,Math.min(600,Number.isFinite(requested)?requested:30))
}
