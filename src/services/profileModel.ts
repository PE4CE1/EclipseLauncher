import type { AppSettings, InstalledGame, LibraryGame } from '../types/game'
import { deduplicateByAliases, normalizeGameName } from './gameDeduplication'
import { isLocallyInstalled } from './gameInstallation'

export interface ProfileGame {
  id: string
  name: string
  platform: InstalledGame['platform']
  steamId?: number
  appId?: string
  iconUrl?: string
  coverImage?: string
  installed: boolean
  playTimeMinutes: number
  lastPlayed: number
}

const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
const steamIdOf = (game: { steamId?: number | null; appId?: string; id?: string }) => {
  const value = Number(game.steamId || game.appId || /^steam[-_](\d+)$/.exec(game.id || '')?.[1])
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}
export const profileGameKey = (game: Pick<ProfileGame, 'id' | 'platform' | 'steamId'>) => game.steamId ? `steam:${game.steamId}` : `${game.platform}:${game.id}`

export function buildProfileGames(library: readonly LibraryGame[], installed: readonly InstalledGame[]): ProfileGame[] {
  const records: ProfileGame[] = [...library.map(game => ({ ...game, installed: false, installPath: undefined })), ...installed].filter(game => game.name?.trim()).map(game => ({
    id: game.id, name: game.name.trim(), platform: game.platform, steamId: steamIdOf(game), appId: game.appId,
    iconUrl: game.iconUrl, coverImage: 'coverImage' in game ? game.coverImage : undefined,
    installed: isLocallyInstalled(game), playTimeMinutes: positive(game.playTimeMinutes), lastPlayed: positive(game.lastPlayed),
  }))
  return deduplicateByAliases(records, game => [
    `id:${game.platform}:${game.id}`, ...(game.steamId ? [`steam:${game.steamId}`] : []), `name:${normalizeGameName(game.name)}`,
  ], (old, game) => ({ ...old, ...game, steamId: old.steamId || game.steamId, coverImage: old.coverImage || game.coverImage,
    iconUrl: game.iconUrl || old.iconUrl, installed: old.installed || game.installed,
    playTimeMinutes: Math.max(old.playTimeMinutes, game.playTimeMinutes), lastPlayed: Math.max(old.lastPlayed, game.lastPlayed),
  }))
}

export function resolvePinnedGames(games: readonly ProfileGame[], keys: readonly string[] = []): ProfileGame[] {
  const lookup = new Map(games.map(game => [profileGameKey(game), game]))
  return [...new Set(keys)].slice(0, 3).map(key => lookup.get(key)).filter((game): game is ProfileGame => !!game)
}

export function publicProfileStats(settings: Partial<AppSettings>, games: readonly ProfileGame[]) {
  const showPlaytime = settings.profileShowPlaytime !== false
  const showSteamStats = settings.profileShowSteamStats !== false
  const minutes = Math.round(games.reduce((sum, game) => sum + positive(game.playTimeMinutes), 0))
  const publicGame = (game: ProfileGame) => ({ id: game.id, name: game.name, platform: game.platform, steamId: game.steamId || null,
    playTimeMinutes: showPlaytime ? game.playTimeMinutes : 0, lastPlayed: showPlaytime ? game.lastPlayed : 0 })
  return {
    showPlaytime, showSteamStats,
    totalPlaytimeMins: showPlaytime ? minutes : null,
    totalPlaytimeHours: showPlaytime ? (minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`) : null,
    totalLibraryCount: games.length, totalInstalledCount: games.filter(game => game.installed).length,
    topPlayedGames: showPlaytime ? [...games].filter(game => game.playTimeMinutes > 0).sort((a, b) => b.playTimeMinutes - a.playTimeMinutes).slice(0, 5).map(publicGame) : [],
    pinnedGames: resolvePinnedGames(games, settings.profilePinnedGames).map(publicGame),
  }
}

export function publicSteamProfileStats(settings: Partial<AppSettings>) {
  const visible = settings.profileShowSteamStats !== false, playtime = settings.profileShowPlaytime !== false
  return {
    level: visible ? settings.steamLevel ?? null : null,
    steamLevel: visible ? settings.steamLevel ?? null : null,
    steamGamesCount: visible ? settings.steamGamesCount ?? null : null,
    steamBadgesCount: visible ? settings.steamBadgesCount ?? null : null,
    steamFavoriteBadge: visible ? settings.steamFavoriteBadge || null : null,
    steamBadges: visible ? settings.steamBadges || [] : [],
    steamRecentGames: visible ? (settings.steamRecentGames || []).map(game => ({ ...game, playtime: playtime ? game.playtime : '' })) : [],
    steamGames: visible ? (settings.steamGames || []).map(game => ({ ...game, playtime: playtime ? game.playtime || '' : '' })) : [],
  }
}

const PUBLIC_PROFILE_FIELDS = ['uid','username','friendCode','avatarUrl','avatarFrame','steamAvatarFrameUrl','steamAvatarFrameStaticUrl','bannerUrl','bannerPosition','bio','profileAccentColor','socialDiscord','socialTwitch','socialYoutube','showHardwareSpecs','hardwareSpecs','status','currentGame','level','steamLevel','steamProfileUrl','steamGamesCount','steamBadgesCount','steamFavoriteBadge','steamRecentGames','steamBadges','steamGames','steamBackgroundUrl','steamBackgroundMovie','showSteamBackground','showPlaytime','showSteamStats','totalPlaytimeMins','totalPlaytimeHours','totalLibraryCount','totalInstalledCount','topPlayedGames','pinnedGames','lastSeen'] as const
export function publicProfileData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(PUBLIC_PROFILE_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(data, key)).map(key => [key, data[key]]))
}

export function formatProfileTime(minutes: number, language: string): string {
  const value = positive(minutes), hours = value / 60
  return value >= 60 ? `${new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 }).format(hours)} ${language === 'de' ? 'Std.' : 'hrs'}`
    : `${Math.floor(value)} ${language === 'de' ? 'Min.' : 'mins'}`
}

export function safeProfileMedia(value?: string | null): string | undefined {
  if (!value || value.length > 6_000_000) return
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(value)) return value
  try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href } catch {}
}

export function profileSocialUrl(value: string, service: 'steam' | 'twitch' | 'youtube'): string | undefined {
  const host = { steam: 'steamcommunity.com', twitch: 'twitch.tv', youtube: 'youtube.com' }[service]
  try {
    const source = value.trim()
    const url = new URL(/^https?:\/\//i.test(source) ? source : service === 'steam' ? `https://${host}/${/^\d{17}$/.test(source) ? 'profiles/' : 'id/'}${encodeURIComponent(source)}` : `https://${host}/${service === 'youtube' && !source.startsWith('@') ? '@' : ''}${encodeURIComponent(source.replace(/^@/, service === 'youtube' ? '@' : ''))}`)
    if (url.protocol === 'https:' && !url.username && !url.password && [host, `www.${host}`].includes(url.hostname)) return url.href
  } catch {}
}
