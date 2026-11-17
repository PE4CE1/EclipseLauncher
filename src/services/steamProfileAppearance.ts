const FRAME_HOSTS = new Set(['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com', 'cdn.akamai.steamstatic.com', 'community.fastly.steamstatic.com', 'community.akamai.steamstatic.com'])

export function profileAvatarFrameValue(settings: { avatarFrame?: string; profileAvatarFrameSelected?: boolean }): string {
  // Legacy profiles saved "none" even when the user had never selected a frame.
  if (!settings.avatarFrame || (settings.avatarFrame === 'none' && !settings.profileAvatarFrameSelected)) return 'steam'
  return settings.avatarFrame
}

export function steamFrameImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (url.protocol === 'https:' && FRAME_HOSTS.has(url.hostname) && !url.port && !url.username && !url.password
      && /^\/(?:community_assets|steamcommunity\/public)\/images\/items\/\d+\/[\w/-]+\.(?:png|apng|webp|gif)$/i.test(url.pathname)) return url.href
  } catch {}
}

/** An incomplete/error page must not erase the last successfully synced frame. */
export function readSteamAvatarFrame(document: Pick<Document, 'querySelector'>): { steamAvatarFrameUrl?: string | null; steamAvatarFrameStaticUrl?: string | null } {
  const avatar = document.querySelector('.profile_header .playerAvatar')
  if (!avatar) return {}
  const frame = avatar.querySelector('.profile_avatar_frame')
  if (!frame) return { steamAvatarFrameUrl: null, steamAvatarFrameStaticUrl: null }
  const animated = steamFrameImage(frame.querySelector('img')?.getAttribute('src'))
  if (!animated) return {}
  const still = frame.querySelector('source[media*="prefers-reduced-motion"]')?.getAttribute('srcset')?.trim().split(/\s+/)[0]
  return { steamAvatarFrameUrl: animated, steamAvatarFrameStaticUrl: steamFrameImage(still) || null }
}
