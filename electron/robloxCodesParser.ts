import type { RobloxCodeItem, RobloxCodeSource } from '../src/types/robloxCodes'
import { robloxNameKey, cleanRobloxName } from '../src/services/robloxGames'

export function decodeHtml(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
    const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
  }).replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|ndash|mdash);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ndash: '–', mdash: '—' }[entity] || ''))
}
export const stripUnwantedHtml = (html: string) => html.replace(/<(script|style|noscript|svg|header|footer|nav|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
const text = (html: string) => decodeHtml(html.replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const stop = new Set('codes code reward rewards active expired working copy redeem click here free roblox new update game games title status true false null undefined loading'.split(' '))
export function isValidCode(value: string): boolean {
  return typeof value === 'string' && value.length >= 2 && value.length <= 64 && /^[\p{L}\p{N}][\p{L}\p{N}_!.'’+?\- ]*$/u.test(value) && !stop.has(value.toLowerCase()) && !/^\d+x\d+$/i.test(value)
}
export function isValidReward(value: string): boolean {
  return !!value && value.length <= 180 && !/[{}<>]|https?:|\b(?:function|return|document|window)\b/.test(value)
}
const rewardText = (value: string) => text(value).replace(/^\s*[:=–—-]+\s*/, '').replace(/\s*\((?:new|expired|working)!?\)\s*/gi, '').trim().slice(0, 180)

export function parseCodesFromTitle(title: string): RobloxCodeItem[] {
  const codes: RobloxCodeItem[] = []
  for (const match of title.matchAll(/\bcodes?\s*[:=(\[]\s*([\w!.'+?\-]{2,64})/gi)) {
    if (isValidCode(match[1])) codes.push({ code: match[1], reward: 'In-game reward', verification: 'developer' })
  }
  return codes
}

export function articleMatchesGame(html: string, name: string): boolean {
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  if (!heading) return false
  const title = text(heading).split(/\bcodes?\b/i)[0].replace(/^(?:all\s+|new\s+|roblox\s+)+/i, '').trim()
  return robloxNameKey(title) === robloxNameKey(name)
}

export function parseCodesFromHtmlOrText(raw: string): { active: RobloxCodeItem[]; expired: RobloxCodeItem[] } {
  const active = new Map<string, RobloxCodeItem>(), expired = new Map<string, RobloxCodeItem>()
  const add = (code: string, reward: string, isExpired: boolean) => {
    code = decodeHtml(code).trim()
    reward = rewardText(reward) || 'In-game reward'
    if (!isValidCode(code) || !isValidReward(reward)) return
    ;(isExpired ? expired : active).set(code, { code, reward, isExpired })
  }
  if (!/<[a-z][^>]*>/i.test(raw)) {
    let section = false
    for (const line of raw.split(/\r?\n/)) {
      if (/^\s*(?:expired|inactive|old)\s+codes?\b/i.test(line)) { section = true; continue }
      if (/^\s*(?:active|new|working)\s+codes?\b/i.test(line)) { section = false; continue }
      const explicit = /\b(?:use\s+|new\s+)?codes?\s*[:=]\s*(.+)/i.exec(line)
      if (explicit) {
        for (const candidate of explicit[1].split(/[,|]|\s+and\s+/i)) {
          const match = /^\s*["'`]?([\w!.'+?\-]{2,64})["'`]?\s*(?:[–—:-]\s*(.+))?$/.exec(candidate.trim())
          if (match) add(match[1], match[2] || '', section)
        }
      } else {
        const match = /^\s*[-*•]?\s*([\w!.'+?\-]{2,64})\s+[–—:-]\s+(.+)$/.exec(line)
        if (match) add(match[1], match[2], section)
      }
    }
  } else {
    const html = stripUnwantedHtml(raw)
    const articleName = text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '').split(/\bcodes?\b/i)[0].replace(/^roblox\s+/i, '').trim()
    let inCodes = false, inExpired = false
    const blocks = /<(h[1-6]|tr|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi
    for (const match of html.matchAll(blocks)) {
      const [, tag, attributes, inner] = match
      if (/^h/.test(tag)) {
        const heading = text(inner)
        if (/\bcodes?\b/i.test(heading) && !/\bhow\b|where|redeem|find|more|why|what|other|related|about|faq/i.test(heading)) {
          inCodes = true; inExpired = /expired|inactive|old|no longer/i.test(heading)
        } else if (tag !== 'h1') inCodes = false
        continue
      }
      const structured = /data-expired\s*=\s*["'](true|false)["']/i.exec(attributes)
      if (tag === 'tr') {
        const parentName = /data-parent-name\s*=\s*["']([^"']+)["']/i.exec(inner)?.[1]
        if (parentName && articleName && robloxNameKey(decodeHtml(parentName)) !== robloxNameKey(articleName)) continue
        if (/data-code-status\s*=\s*["']check["']/i.test(inner)) continue
        const cells = [...inner.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cell[1])
        const copy = /data-copy\s*=\s*["']([^"']+)["']/i.exec(inner)?.[1]
        if (cells.length >= 2 && (inCodes || structured)) add(copy || text(cells[0]), cells[1], structured ? structured[1] === 'true' : inExpired)
      } else if (inCodes && tag === 'li') {
        const strong = /<(?:strong|b|code)\b[^>]*>([^<]+)<\/(?:strong|b|code)>/i.exec(inner)
        if (strong) add(text(strong[1]), inner.slice(inner.indexOf(strong[0]) + strong[0].length), inExpired)
        else if (inExpired) { const value = text(inner); if (isValidCode(value)) add(value, '', true) }
      }
    }
  }
  // Explicit expiry takes precedence over an example repeated elsewhere on the page.
  const expiredKeys = new Set([...expired.keys()].map(code => code.toLowerCase()))
  return { active: [...active.values()].filter(item => !expiredKeys.has(item.code.toLowerCase())).slice(0, 300), expired: [...expired.values()].slice(0, 500) }
}

export function parseCodesIndex(html: string, source: RobloxCodeSource): Array<{ name: string; source: RobloxCodeSource }> {
  const entries = new Map<string, { name: string; source: RobloxCodeSource }>()
  for (const match of stripUnwantedHtml(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), source.url)
      if (url.hostname !== new URL(source.url).hostname || url.protocol !== 'https:' || url.username || url.password) continue
      let name: string
      if (url.hostname === 'robloxden.com') {
        const slug = /^\/game-codes\/([a-z][a-z0-9-]+)\/?$/.exec(url.pathname)?.[1]
        if (!slug) continue
        name = slug.replace(/-/g, ' ')
      } else {
        const label = text(match[2])
        if (!/\bcodes?\s*$/i.test(label) || !/(?:-codes|\/codes)\/?$/.test(url.pathname)) continue
        name = label.replace(/\s+codes?\s*$/i, '')
      }
      name = cleanRobloxName(name)
      if (name.length < 2 || name.length > 100 || /promo|star codes|gift card/i.test(name)) continue
      entries.set(url.href, { name, source: { name: source.name, url: url.href } })
    } catch {}
  }
  return [...entries.values()].slice(0, 4000)
}
