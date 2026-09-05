/**
 * assetHelper.ts
 * Zero-config Steam CDN asset URL generators.
 * No API keys required — all URLs are publicly accessible static assets.
 */

import robloxHeroImg from '../assets/roblox/hero.png'
import robloxLogoImg from '../assets/Roblox-Logo-Icon.png'

const STEAM_CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps'
const STEAM_HEADER_CDN = 'https://cdn.akamai.steamstatic.com/steam/apps'

export const ROBLOX_POSTER = robloxHeroImg
export const ROBLOX_LOGO = robloxLogoImg

/**
 * Vertical grid cover (600×900 poster) — best for GameCards
 */
export function getCoverUrl(steamId: string | number): string {
  if (String(steamId) === '999001') return ROBLOX_POSTER
  return `${STEAM_CDN}/${steamId}/library_600x900.jpg`
}

/**
 * Hero banner (wide horizontal background) — best for HeroSection
 */
export function getHeroUrl(steamId: string | number): string {
  if (String(steamId) === '999001') return ROBLOX_POSTER
  return `${STEAM_CDN}/${steamId}/library_hero.jpg`
}

/**
 * Transparent PNG logo — overlaid on hero banners
 */
export function getLogoUrl(steamId: string | number): string {
  if (String(steamId) === '999001') return ROBLOX_LOGO
  return `${STEAM_CDN}/${steamId}/logo.png`
}

/**
 * Standard header (460×215) — universal fallback
 */
export function getHeaderUrl(steamId: string | number): string {
  if (String(steamId) === '999001') return ROBLOX_POSTER
  return `${STEAM_HEADER_CDN}/${steamId}/header.jpg`
}

/**
 * Small capsule (231×87) — sidebar icons
 */
export function getCapsuleSmUrl(steamId: string | number): string {
  if (String(steamId) === '999001') return ROBLOX_LOGO
  return `${STEAM_HEADER_CDN}/${steamId}/capsule_231x87.jpg`
}

/**
 * Mini icon (tiny_image from search results, or fallback)
 */
export function getMiniIconUrl(steamId: string | number): string {
  if (String(steamId) === '999001') return ROBLOX_LOGO
  return `${STEAM_HEADER_CDN}/${steamId}/capsule_sm_120.jpg`
}

/**
 * Returns an image URL with ordered fallback options for <img> onError chains.
 * Use the returned array sequentially in onError handlers.
 */
export function getFallbackChain(steamId: string | number): string[] {
  if (String(steamId) === '999001') {
    return [ROBLOX_POSTER, ROBLOX_LOGO]
  }
  return [
    getCoverUrl(steamId),
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${steamId}/library_600x900.jpg`,
    getHeroUrl(steamId),
    getHeaderUrl(steamId),
  ]
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}

/**
 * Minimalist game cover placeholder — sleek obsidian gaming card with frosted emblem,
 * subtle depth texture, and modern typography.
 */
export function getPlaceholderCover(name: string): string {
  const safeName = escapeXml(name.length > 24 ? name.slice(0, 22).trim() + '…' : name)

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="cbg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0c12"/>
          <stop offset="50%" stop-color="#121522"/>
          <stop offset="100%" stop-color="#07080c"/>
        </linearGradient>
        <radialGradient id="cglow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="rgba(129, 140, 248, 0.08)"/>
          <stop offset="100%" stop-color="rgba(0, 0, 0, 0)"/>
        </radialGradient>
        <pattern id="cgrid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.015)" stroke-width="1"/>
        </pattern>
      </defs>

      <!-- Background Base with smooth gradient and micro-grid -->
      <rect width="600" height="900" fill="url(#cbg)"/>
      <rect width="600" height="900" fill="url(#cgrid)"/>
      <rect width="600" height="900" fill="url(#cglow)"/>

      <!-- Subtle Ambient Glow Rings behind badge -->
      <circle cx="300" cy="360" r="130" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/>
      <circle cx="300" cy="360" r="95" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>

      <!-- Outer Card Border -->
      <rect x="1" y="1" width="598" height="898" rx="16" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1.5"/>

      <!-- Central Frosted Squircle Badge -->
      <rect x="215" y="275" width="170" height="170" rx="44" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
      <rect x="217" y="277" width="166" height="85" rx="42" fill="rgba(255,255,255,0.015)"/>

      <!-- Modern Gamepad Vector Icon -->
      <g transform="translate(259, 320) scale(3.4)" stroke="rgba(255,255,255,0.85)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <rect width="20" height="12" x="2" y="6" rx="2.5" fill="rgba(255,255,255,0.03)"/>
        <line x1="6" x2="10" y1="12" y2="12"/>
        <line x1="8" x2="8" y1="10" y2="14"/>
        <line x1="15" x2="15.01" y1="13" y2="13" stroke-width="2.2"/>
        <line x1="18" x2="18.01" y1="11" y2="11" stroke-width="2.2"/>
      </g>

      <!-- Game Title in clean modern typography -->
      <text x="300" y="495" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="28" font-weight="700" fill="#ffffff" letter-spacing="0.5">${safeName}</text>

      <!-- Subtle accent divider -->
      <rect x="270" y="518" width="60" height="2" rx="1" fill="rgba(255,255,255,0.12)"/>

      <!-- Bottom Brand Watermark -->
      <text x="300" y="835" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,0.12)" letter-spacing="3.5">ECLIPSE</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * Placeholder hero banner SVG for games without a known Steam ID.
 */
export function getPlaceholderHero(name: string): string {
  const safeName = escapeXml(name.length > 32 ? name.slice(0, 30).trim() + '…' : name)
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="620" viewBox="0 0 1920 620">
      <defs>
        <linearGradient id="h" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0b0e"/>
          <stop offset="50%" stop-color="#141624"/>
          <stop offset="100%" stop-color="#07080a"/>
        </linearGradient>
        <radialGradient id="hglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(120,130,255,0.12)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
        <pattern id="hgrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="1920" height="620" fill="url(#h)"/>
      <rect width="1920" height="620" fill="url(#hgrid)"/>
      <rect width="1920" height="620" fill="url(#hglow)"/>
        
      <!-- Centered title -->
      <text x="960" y="315" text-anchor="middle"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="44" font-weight="800"
        fill="rgba(255,255,255,0.9)" letter-spacing="1">${safeName}</text>

      <!-- Minimalist accent line -->
      <rect x="910" y="340" width="100" height="2" rx="1" fill="rgba(255,255,255,0.15)"/>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * Formats timestamps into natural, localized, and well-written relative time strings.
 * e.g., "Zuletzt online vor 12 Min." or "Last seen 12 mins ago"
 */
export function formatLastSeen(timestamp: any, language: string = 'de'): string {
  let timeNum: number = 0
  if (!timestamp) return 'Offline'
  if (typeof timestamp === 'number') {
    timeNum = timestamp
  } else if (typeof timestamp?.toMillis === 'function') {
    timeNum = timestamp.toMillis()
  } else if (typeof timestamp?.seconds === 'number') {
    timeNum = timestamp.seconds * 1000
  } else if (typeof timestamp === 'string') {
    timeNum = new Date(timestamp).getTime()
  }

  if (!timeNum || isNaN(timeNum) || timeNum <= 0) {
    return 'Offline'
  }

  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000))
  const isDe = language === 'de'

  if (diffSec < 60) {
    return isDe ? 'Zuletzt online gerade eben' : 'Last seen just now'
  }

  const minutes = Math.floor(diffSec / 60)
  if (minutes < 60) {
    if (isDe) {
      return minutes === 1 ? 'Zuletzt online vor 1 Min.' : `Zuletzt online vor ${minutes} Min.`
    }
    return minutes === 1 ? 'Last seen 1 min ago' : `Last seen ${minutes} mins ago`
  }

  const hours = Math.floor(diffSec / 3600)
  if (hours < 24) {
    if (isDe) {
      return hours === 1 ? 'Zuletzt online vor 1 Std.' : `Zuletzt online vor ${hours} Std.`
    }
    return hours === 1 ? 'Last seen 1 hr ago' : `Last seen ${hours} hrs ago`
  }

  const days = Math.floor(diffSec / 86400)
  if (days === 1) {
    return isDe ? 'Zuletzt online gestern' : 'Last seen yesterday'
  }

  if (days < 7) {
    if (isDe) {
      return `Zuletzt online vor ${days} Tagen`
    }
    return `Last seen ${days} days ago`
  }

  const date = new Date(timestamp)
  if (isDe) {
    const formatted = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    return `Zuletzt online am ${formatted}`
  } else {
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `Last seen on ${formatted}`
  }
}
