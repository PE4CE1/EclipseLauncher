import type { RobloxCodeGame } from '../types/robloxCodes'

export const ROBLOX_CODE_GAMES: readonly RobloxCodeGame[] = [
  { name: 'Blox Fruits', placeId: '2753915549', universeId: '994732206' },
  { name: 'Rivals', placeId: '17625359962', universeId: '6035872082' },
  { name: 'Fisch', placeId: '16732694052', universeId: '5750914919' },
  { name: 'Dress to Impress', placeId: '15101393044', universeId: '5203828273' },
  { name: 'Doors', placeId: '6516141723', universeId: '2440500124' },
  { name: 'Blade Ball', placeId: '13772394625', universeId: '4777817887' },
  { name: 'King Legacy', placeId: '4520749081', universeId: '1451439645' },
  { name: 'Tower Defense Simulator', placeId: '3260590327', universeId: '1176784616' },
  { name: 'Murder Mystery 2', placeId: '142823291', universeId: '66654135' },
  { name: 'Adopt Me!', placeId: '920587237', universeId: '383310974' },
  { name: 'Pet Simulator 99', placeId: '8737899170', universeId: '3317771874' },
  { name: 'Brookhaven RP', placeId: '4924922222', universeId: '1686885941' },
]

export function cleanRobloxName(raw: string): string {
  return raw.normalize('NFKC')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, ' ')
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/\((?:update|event|new|beta|alpha|test)[^)]*\)/gi, ' ')
    .replace(/\b(?:update|event)\s*\d*(?:\.\d+)*\b/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 160)
}
export const robloxNameKey = (name: string) => cleanRobloxName(name).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export const sameRobloxGame = (a?: string | null, b?: string | null) => !!a && !!b && !!robloxNameKey(a) && robloxNameKey(a) === robloxNameKey(b)
export const robloxSlug = (name: string) => cleanRobloxName(name).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function robloxPlaceId(input: string): string | undefined {
  if (/^\d{1,18}$/.test(input)) return input
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || !['www.roblox.com', 'roblox.com'].includes(url.hostname) || url.username || url.password) return
    return /^\/games\/(\d{1,18})(?:\/|$)/.exec(url.pathname)?.[1]
  } catch { return }
}
