/**
 * assetHelper.ts
 * Zero-config Steam CDN asset URL generators.
 * No API keys required — all URLs are publicly accessible static assets.
 */

const STEAM_CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps'
const STEAM_HEADER_CDN = 'https://cdn.akamai.steamstatic.com/steam/apps'

/**
 * Vertical grid cover (600×900 poster) — best for GameCards
 */
export function getCoverUrl(steamId: string | number): string {
  return `${STEAM_CDN}/${steamId}/library_600x900.jpg`
}

/**
 * Hero banner (wide horizontal background) — best for HeroSection
 */
export function getHeroUrl(steamId: string | number): string {
  return `${STEAM_CDN}/${steamId}/library_hero.jpg`
}

/**
 * Transparent PNG logo — overlaid on hero banners
 */
export function getLogoUrl(steamId: string | number): string {
  return `${STEAM_CDN}/${steamId}/logo.png`
}

/**
 * Standard header (460×215) — universal fallback
 */
export function getHeaderUrl(steamId: string | number): string {
  return `${STEAM_HEADER_CDN}/${steamId}/header.jpg`
}

/**
 * Small capsule (231×87) — sidebar icons
 */
export function getCapsuleSmUrl(steamId: string | number): string {
  return `${STEAM_HEADER_CDN}/${steamId}/capsule_231x87.jpg`
}

/**
 * Mini icon (tiny_image from search results, or fallback)
 */
export function getMiniIconUrl(steamId: string | number): string {
  return `${STEAM_HEADER_CDN}/${steamId}/capsule_sm_120.jpg`
}

/**
 * Returns an image URL with ordered fallback options for <img> onError chains.
 * Use the returned array sequentially in onError handlers.
 */
export function getFallbackChain(steamId: string | number): string[] {
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
 * Premium deluxe game cover placeholder SVG for custom or unlisted games.
 */
export function getPlaceholderCover(name: string): string {
  const safeName = escapeXml(name.length > 28 ? name.slice(0, 26) + '...' : name)
  const initial = escapeXml(name.charAt(0).toUpperCase() || 'G')
  
  // Deterministic subtle accent color derived from game name
  const hues = [
    { from: '#4f46e5', to: '#06b6d4', glow: 'rgba(79,70,229,0.3)' },
    { from: '#6366f1', to: '#a855f7', glow: 'rgba(99,102,241,0.3)' },
    { from: '#2563eb', to: '#38bdf8', glow: 'rgba(37,99,235,0.3)' },
    { from: '#059669', to: '#10b981', glow: 'rgba(16,185,129,0.3)' },
    { from: '#d97706', to: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
    { from: '#e11d48', to: '#fb7185', glow: 'rgba(225,29,72,0.3)' },
  ]
  const theme = hues[Math.abs(name.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % hues.length]

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0c0d12"/>
          <stop offset="50%" stop-color="#14161f"/>
          <stop offset="100%" stop-color="#08090c"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="${theme.glow}" stop-opacity="1"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${theme.from}"/>
          <stop offset="100%" stop-color="${theme.to}"/>
        </linearGradient>
        <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.15)"/>
          <stop offset="50%" stop-color="rgba(255,255,255,0.03)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0.1)"/>
        </linearGradient>
      </defs>

      <!-- Background card -->
      <rect width="600" height="900" fill="url(#bg)" rx="16"/>
      <rect width="600" height="900" fill="url(#glow)" rx="16"/>

      <!-- Ambient geometric grid / cosmic dots -->
      <g opacity="0.12" fill="#ffffff">
        <circle cx="80" cy="120" r="2"/>
        <circle cx="520" cy="140" r="1.5"/>
        <circle cx="120" cy="780" r="1.5"/>
        <circle cx="480" cy="760" r="2"/>
        <circle cx="150" cy="420" r="1"/>
        <circle cx="450" cy="380" r="1.5"/>
      </g>

      <!-- Subtle inner border -->
      <rect x="16" y="16" width="568" height="868" rx="12" fill="none" stroke="url(#borderGrad)" stroke-width="1.5"/>

      <!-- Top Badge -->
      <g transform="translate(300, 70)">
        <rect x="-65" y="-14" width="130" height="28" rx="14" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
        <text x="0" y="4" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="700" letter-spacing="2" fill="rgba(255,255,255,0.6)">GAME</text>
      </g>

      <!-- Center Hero Emblem -->
      <g transform="translate(300, 390)">
        <!-- Outer glowing ring -->
        <circle cx="0" cy="0" r="120" fill="none" stroke="url(#accent)" stroke-width="2" opacity="0.3" stroke-dasharray="6 6"/>
        <circle cx="0" cy="0" r="100" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        
        <!-- Center Glyph -->
        <path d="M-36,-12 C-36,-24 -24,-36 -12,-36 L12,-36 C24,-36 36,-24 36,-12 L36,12 C36,24 24,36 12,36 L-12,36 C-24,36 -36,24 -36,12 Z" fill="url(#accent)" opacity="0.15"/>
        
        <!-- Large stylish letter -->
        <text x="0" y="22" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="76" font-weight="900" fill="url(#accent)">${initial}</text>
      </g>

      <!-- Bottom Title Area -->
      <g transform="translate(300, 680)">
        <!-- Title Text -->
        <text x="0" y="0" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="28" font-weight="800" fill="#ffffff" letter-spacing="-0.5">${safeName}</text>
        
        <!-- Subtitle -->
        <text x="0" y="32" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="13" font-weight="600" letter-spacing="3" fill="rgba(255,255,255,0.4)">ECLIPSE LAUNCHER</text>
        
        <!-- Bottom accent bar -->
        <rect x="-30" y="55" width="60" height="3" rx="1.5" fill="url(#accent)"/>
      </g>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * Placeholder hero banner SVG for games without a known Steam ID.
 */
export function getPlaceholderHero(name: string): string {
  const safeName = escapeXml(name)
  const initial = escapeXml(name.charAt(0).toUpperCase() || 'G')
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="620" viewBox="0 0 1920 620">
      <defs>
        <linearGradient id="h" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0b0e"/>
          <stop offset="50%" stop-color="#14161f"/>
          <stop offset="100%" stop-color="#07080a"/>
        </linearGradient>
        <radialGradient id="hglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(99,102,241,0.2)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
      </defs>
      <rect width="1920" height="620" fill="url(#h)"/>
      <rect width="1920" height="620" fill="url(#hglow)"/>
      
      <!-- Big subtle watermark -->
      <text x="960" y="360" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter,system-ui,sans-serif" font-size="280" font-weight="900"
        fill="rgba(255,255,255,0.03)">${initial}</text>
        
      <!-- Centered title -->
      <text x="960" y="320" text-anchor="middle"
        font-family="Inter,system-ui,sans-serif" font-size="44" font-weight="800"
        fill="rgba(255,255,255,0.7)" letter-spacing="1">${safeName}</text>
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
