import type { InstalledGame } from '../types/game'

type GameIdentity = { id?: string | number; steamId?: number; appId?: string | number; name?: string }
type Installation = GameIdentity & { installed?: boolean; installPath?: string }

function steamId(game: GameIdentity): number | undefined {
  const value = game.steamId || game.appId || (typeof game.id === 'string' ? /^steam[-_](\d+)$/.exec(game.id)?.[1] : undefined)
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

const nameKey = (name?: string) => name?.replace(/[™®]/g, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || ''

export function isLocallyInstalled(game: Installation): boolean {
  if (game.installed === false) return false
  return game.installed === true || !!game.installPath?.trim()
}

export function matchesGame(a: GameIdentity, b: GameIdentity): boolean {
  const first = steamId(a), second = steamId(b)
  if (first && second) return first === second
  const name = nameKey(a.name)
  return !!name && name === nameKey(b.name)
}

export function findInstalledGame(games: readonly InstalledGame[], game: GameIdentity): InstalledGame | undefined {
  return games.find(candidate => isLocallyInstalled(candidate) && matchesGame(candidate, game))
}
