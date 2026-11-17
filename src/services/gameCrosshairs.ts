import type { AppSettings } from '../types/game'
import { normalizeCrosshair, type CrosshairConfig } from './crosshairConfig'
import { normalizeCrosshairProfiles, type CrosshairProfiles } from './crosshairProfiles'

export const CROSSHAIR_GAMES = [
  { id: 'valorant', name: 'VALORANT' },
  { id: 'fortnite', name: 'Fortnite' },
  { id: 'cs2', name: 'Counter-Strike 2' },
] as const
export type CrosshairGameId = typeof CROSSHAIR_GAMES[number]['id']
export interface GameCrosshairProfile {
  enabled: boolean
  config: CrosshairConfig
  designs: CrosshairProfiles
}
export type GameCrosshairs = Partial<Record<CrosshairGameId, GameCrosshairProfile>>
export type CrosshairGame = { name?: string; exeName?: string } | null | undefined

export function isCrosshairGameId(value: unknown): value is CrosshairGameId {
  return CROSSHAIR_GAMES.some(game => game.id === value)
}

export function identifyCrosshairGame(game: CrosshairGame): CrosshairGameId | undefined {
  if (!game) return
  const executable = (game.exeName || '').split(/[\\/]/).pop()?.toLowerCase()
  if (executable === 'valorant-win64-shipping.exe') return 'valorant'
  if (executable === 'fortniteclient-win64-shipping.exe') return 'fortnite'
  if (executable === 'cs2.exe') return 'cs2'
  const name = (game.name || '').replace(/[®™]/g, '').trim().toLowerCase()
  if (name === 'valorant' || name === 'fortnite' || name === 'cs2') return name
  if (/^counter[ -]?strike\s*2$/.test(name)) return 'cs2'
}

export function getGameCrosshairProfile(settings: Partial<AppSettings>, id: CrosshairGameId): GameCrosshairProfile {
  const saved = settings.overlayGameCrosshairs?.[id]
  return {
    enabled: saved?.enabled === true,
    config: normalizeCrosshair(saved?.config ?? settings.crosshairConfig),
    designs: normalizeCrosshairProfiles(saved?.designs ?? settings.crosshairProfiles),
  }
}

/** An enabled game profile replaces the general design; it never adds a second crosshair. */
export function resolveGameCrosshair(settings: Partial<AppSettings>, game: CrosshairGame) {
  const id = identifyCrosshairGame(game)
  if (id && settings.overlayGameCrosshairs?.[id]?.enabled === true) {
    return { enabled: true, config: normalizeCrosshair(settings.overlayGameCrosshairs[id]?.config ?? settings.crosshairConfig), gameId: id }
  }
  return { enabled: settings.overlayCrosshair === true, config: normalizeCrosshair(settings.crosshairConfig), gameId: undefined }
}

/** Reuse the general editor while keeping its selected design and per-design adjustments local to this game. */
export function patchGameCrosshair(settings: Partial<AppSettings>, id: CrosshairGameId, patch: Partial<AppSettings>): Partial<AppSettings> {
  const result: Partial<AppSettings> = {}
  if ('crosshairFavorites' in patch) result.crosshairFavorites = patch.crosshairFavorites
  if ('overlayCrosshair' in patch || 'crosshairConfig' in patch || 'crosshairProfiles' in patch) {
    const previous = getGameCrosshairProfile(settings, id)
    result.overlayGameCrosshairs = {
      ...settings.overlayGameCrosshairs,
      [id]: {
        enabled: patch.overlayCrosshair ?? previous.enabled,
        config: 'crosshairConfig' in patch ? normalizeCrosshair(patch.crosshairConfig) : previous.config,
        designs: 'crosshairProfiles' in patch ? normalizeCrosshairProfiles(patch.crosshairProfiles) : previous.designs,
      },
    }
  }
  return result
}
