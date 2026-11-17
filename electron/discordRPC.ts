import { DiscordConnection } from './discordConnection'
import { createDiscordClient } from './discordClient'
import type { DiscordActivity } from './discordActivity'
import { fetchSteamGameIcon, searchSteamArtwork, steamIconUrl } from './discordGameArtwork'
export { searchSteamArtwork } from './discordGameArtwork'
import { APP_VERSION } from '../src/services/appVersion'
import type { DownloadActivity } from './steamDownloadActivity'

// Default Client ID for Eclipse Launcher
export const DEFAULT_CLIENT_ID = '1534714200813863136'

let activeClientId = DEFAULT_CLIENT_ID
let enabled = true
let showVersion = false
const connection = new DiscordConnection(createDiscordClient)

export function initDiscordRPC(targetClientId = DEFAULT_CLIENT_ID) {
  activeClientId = targetClientId
  connection.refresh()
}

export const ECLIPSE_LOGO_URL = 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/logo.png'
export const ECLIPSE_LOGO_GIF_URL = 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/eclipse-logo.gif'

// Official square Steam community icons, verified against IStoreBrowseService.
const STEAM_ICON_HASHES: Record<number, string> = {
  "440": "f568912870a4684f9ec76277a1a404dda6bab213",
  "570": "48eb825bb93787945065b460bdc109e395384ebf",
  "730": "8dbc71957312bbd3baea65848b545be9eae2a355",
  "105600": "858961e95fbf869f136e1770d586e0caefd4cfac",
  "252490": "820be4782639f9c4b64fa3ca7e6c26a95ae4fd1c",
  "252950": "9ad6dd3d173523354385955b5fb2af87639c4163",
  "271590": "1e72f87eb927fa1485e68aefaff23c7fd7178251",
  "292030": "7b52d11edee478d652ef4e7103e00644bed2c74c",
  "359550": "624745d333ac54aedb1ee911013e2edb7722550e",
  "381210": "aa152097a700fd6f4707397ce41794ea30874790",
  "553850": "5236dcc5d02b1f7aa199eef56253d20be87baef3",
  "1086940": "d866cae7ea1e471fdbc206287111f1b642373bd9",
  "1091500": "6897c3848f3e0350d512f59d5bae174a1e3739f9",
  "1097150": "6c027709b9eb1417c993bc7d513b97b232002368",
  "1172470": "8986dd626da56db5f3fe09bc1b8871739de8b00d",
  "1174180": "5106abd9c1187a97f23295a0ba9470c94804ec6c",
  "1245620": "b6e290dd5a92ce98f89089a207733c70c41a1871",
  "1623730": "f5523077a8f4c923c2e8d8c17794b3319035fa73",
  "2195250": "d01e05e0fb8e77c790c699b4fa0a9559cf80d16d",
  "2357570": "da42bd294c941d5947b1bc2c2b2efa1313d36a91",
  "2669320": "f6c4988f3e7b965451a3d9fca34014585d1754e2"
}
const knownSteamIcon = (appId: number) => steamIconUrl(appId, STEAM_ICON_HASHES[appId])

// Public publisher/CDN assets; unavailable artwork falls back to Eclipse.
export const GAME_ARTWORK_MAP: Record<string, { appId?: number; imageUrl?: string }> = {
  'rocket league': {
    appId: 252950,
    imageUrl: 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Rocket-League-Logo.png'
  },
  'grand theft auto v': {
    appId: 271590,
    imageUrl: knownSteamIcon(271590)
  },
  'grand theft auto v enhanced': {
    appId: 271590,
    imageUrl: knownSteamIcon(271590)
  },
  'fivem': {
    appId: 271590,
    imageUrl: 'https://fivem.net/favicon.png'
  },
  'red dead redemption 2': {
    appId: 1174180,
    imageUrl: knownSteamIcon(1174180)
  },
  'roblox': {
    imageUrl: 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Roblox-Logo-Icon.png'
  },
  'fortnite': {
    imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/a9/c4/00/a9c4002f-046a-ee19-68c9-730ee92109fa/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg'
  },
  'valorant': {
    imageUrl: 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/cbf4460132cdfeb2a97fad5f9dd25ba0bc058f76-128x128.png'
  },
  'league of legends': {
    imageUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/20590/e449d66244514c3607ac485936fd59aa4c194c03.jpg'
  },
  'minecraft': {
    imageUrl: 'https://www.minecraft.net/etc.clientlibs/minecraftnet/clientlibs/clientlib-site/resources/android-icon-192x192.png'
  },
  'counter-strike 2': {
    appId: 730,
    imageUrl: knownSteamIcon(730)
  },
  'dota 2': {
    appId: 570,
    imageUrl: knownSteamIcon(570)
  },
  'cyberpunk 2077': {
    appId: 1091500,
    imageUrl: knownSteamIcon(1091500)
  },
  'elden ring': {
    appId: 1245620,
    imageUrl: knownSteamIcon(1245620)
  },
  'apex legends': {
    appId: 1172470,
    imageUrl: knownSteamIcon(1172470)
  },
  'overwatch 2': {
    appId: 2357570,
    imageUrl: knownSteamIcon(2357570)
  },
  'palworld': {
    appId: 1623730,
    imageUrl: knownSteamIcon(1623730)
  },
  'helldivers 2': {
    appId: 553850,
    imageUrl: knownSteamIcon(553850)
  },
  "baldur's gate 3": {
    appId: 1086940,
    imageUrl: knownSteamIcon(1086940)
  },
  'the witcher 3: wild hunt': {
    appId: 292030,
    imageUrl: knownSteamIcon(292030)
  },
  'ea sports fc 24': {
    appId: 2195250,
    imageUrl: knownSteamIcon(2195250)
  },
  'ea sports fc 25': {
    appId: 2669320,
    imageUrl: knownSteamIcon(2669320)
  },
  'rust': {
    appId: 252490,
    imageUrl: knownSteamIcon(252490)
  },
  'rainbow six siege': {
    appId: 359550,
    imageUrl: knownSteamIcon(359550)
  },
  'dead by daylight': {
    appId: 381210,
    imageUrl: knownSteamIcon(381210)
  },
  'team fortress 2': {
    appId: 440,
    imageUrl: knownSteamIcon(440)
  },
  'terraria': {
    appId: 105600,
    imageUrl: knownSteamIcon(105600)
  },
  'fall guys': {
    appId: 1097150,
    imageUrl: knownSteamIcon(1097150)
  },
}

export interface DiscordBaseContext {
  clipsMode?: boolean
  type: 'game' | 'idle' | 'download'
  gameName?: string
  startTime?: number
  isPrivacyMode?: boolean
  style?: 'clipping' | 'playing'
  appId?: string | number
  customIconUrl?: string
  customState?: string
  customSmallIconUrl?: string
  customSmallText?: string
  downloadName?: string
  download?: DownloadActivity
  largeImageKey?: string
  largeImageText?: string
  processId?: number
}

let activeContext: DiscordBaseContext | null = null
let animationTicker: NodeJS.Timeout | null = null
let isAnimationEnabled = false
let animFrame = 0
let contextRevision = 0
let contextKey = ''
const cleanText = (value: string, size = 128) => Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, size).join('')
const imageUrl = (value?: string) => {
  if (!value) return undefined
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && value.length <= 2048 ? value : undefined } catch { return undefined }
}

function activityFor(context: DiscordBaseContext): DiscordActivity {
  const privacy = !!context.isPrivacyMode
  const action = context.download?.phase === 'install' ? 'Installing' : context.download?.phase === 'verify' ? 'Verifying' : context.download?.phase === 'prepare' ? 'Preparing' : 'Downloading'
  let details = context.type === 'idle' ? (context.clipsMode ? 'In Eclipse Clips' : 'In Launcher') : context.type === 'download' ? `${action} ${privacy ? 'a game' : context.downloadName || 'Game'}` : `${context.style === 'playing' ? 'Playing' : 'Clipping'} ${privacy ? 'a Game' : context.gameName || 'a Game'}`
  let state = context.type === 'idle' ? (context.clipsMode ? 'Clips Studio' : 'Browsing Library') : privacy ? 'with Eclipse' : context.customState || 'with Eclipse'
  if (context.type === 'download' && context.download && !privacy) state = `${context.download.source}${context.download.progress === undefined ? '' : ` · ${context.download.progress}%`} · with Eclipse`
  if (showVersion) {
    const suffix = ` · v${APP_VERSION}`
    state = cleanText(state, 128 - suffix.length - (isAnimationEnabled ? 4 : 0)) + suffix
  }
  if (isAnimationEnabled) {
    const even = animFrame % 2 === 0
    details = `${even ? '✦' : '✧'} ${details} ${even ? '✦' : '✧'}`
    state = `${even ? '✧' : '✦'} ${state} ${even ? '✧' : '✦'}`
  }
  return {
    name: context.type === 'game' && !privacy ? `${cleanText(context.gameName || 'a Game', 115)} with Eclipse` : 'Eclipse',
    statusDisplayType: 0,
    processId: context.type === 'game' && !privacy ? context.processId : undefined,
    details: cleanText(details), state: cleanText(state),
    ...(context.type === 'game' && context.startTime ? { startTimestamp: new Date(context.startTime) } : {}),
    largeImageKey: privacy ? ECLIPSE_LOGO_GIF_URL : context.largeImageKey || ECLIPSE_LOGO_GIF_URL,
    largeImageText: privacy ? 'Eclipse' : cleanText(context.largeImageText || 'Eclipse'),
    ...(context.type !== 'idle' ? { smallImageKey: privacy ? ECLIPSE_LOGO_GIF_URL : imageUrl(context.customSmallIconUrl) || ECLIPSE_LOGO_GIF_URL, smallImageText: privacy ? 'Eclipse' : cleanText(context.customSmallText || 'Eclipse') } : {}),
    instance: false,
    buttons: [
      { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' },
      { label: 'GitHub', url: 'https://github.com/PE4CE1/EclipseLauncher' },
    ],
  }
}

function publish() {
  connection.publish(enabled && activeContext ? activityFor(activeContext) : null, activeClientId)
}
function stopAnimationTicker() {
  if (animationTicker) clearInterval(animationTicker)
  animationTicker = null
}
function syncAnimationTicker() {
  if (!enabled || !isAnimationEnabled || !activeContext) { stopAnimationTicker(); return }
  if (animationTicker) return
  animationTicker = setInterval(() => {
    if (!enabled || !isAnimationEnabled || !activeContext) { stopAnimationTicker(); return }
    animFrame = (animFrame + 1) % 2
    publish()
  }, 5000)
  animationTicker.unref?.()
}

export function setDiscordEnabled(value: boolean) {
  if (enabled === value) return
  enabled = value
  if (!enabled) clearDiscordActivity()
}

export function setDiscordActivity(gameName: string, startTime: number, isPrivacyMode = false, style: 'clipping' | 'playing' = 'clipping', appId?: string | number, customIconUrl?: string, customState?: string, customSmallIconUrl?: string, customSmallText?: string, isAnimated = false, processId?: number) {
  if (!enabled || typeof gameName !== 'string' || !gameName.trim()) return
  const time = Number.isFinite(startTime) && startTime > 0 ? Math.min(startTime, Date.now()) : Date.now()
  const key = JSON.stringify(['game', gameName, time, isPrivacyMode, style, appId, customIconUrl, customState, customSmallIconUrl, customSmallText, isAnimated, processId])
  if (key === contextKey) { connection.refresh(); return }
  contextKey = key
  const revision = ++contextRevision
  const name = gameName.toLowerCase().replace(/[™®©]/g, '').trim(), mapped = GAME_ARTWORK_MAP[name]
  const steamAppId = Number(appId || mapped?.appId)
  const artwork = isPrivacyMode ? undefined : imageUrl(customIconUrl) ||
    (Number.isSafeInteger(steamAppId) && steamAppId > 0 && steamAppId !== mapped?.appId ? knownSteamIcon(steamAppId) : imageUrl(mapped?.imageUrl))
  const lookup = () => Number.isSafeInteger(steamAppId) && steamAppId > 0 ? fetchSteamGameIcon(steamAppId) : searchSteamArtwork(gameName)
  activeContext = { type: 'game', gameName, startTime: time, isPrivacyMode, style, appId, customIconUrl, customState, customSmallIconUrl, customSmallText, processId, largeImageKey: artwork || ECLIPSE_LOGO_GIF_URL, largeImageText: gameName }
  isAnimationEnabled = isAnimated
  publish(); syncAnimationTicker()
  if (!isPrivacyMode && !artwork) void lookup().then(found => {
    if (!found || !enabled || revision !== contextRevision || activeContext?.type !== 'game') return
    activeContext = { ...activeContext, largeImageKey: found.imageUrl }
    publish()
  }).catch(() => {})
}

function setSimpleActivity(type: 'idle' | 'download', name: string | undefined, animated: boolean, clipsMode = false, download?: DownloadActivity, privacy = false) {
  if (!enabled) return
  const key = JSON.stringify([type, name, animated, clipsMode, download, privacy])
  if (key === contextKey) { connection.refresh(); return }
  contextKey = key
  const revision = ++contextRevision
  const artwork = !privacy && download?.appId ? knownSteamIcon(download.appId) : undefined
  activeContext = { type, clipsMode, downloadName: name, download, isPrivacyMode: privacy,
    largeImageKey: artwork || ECLIPSE_LOGO_GIF_URL,
    largeImageText: type === 'download' ? name || 'Eclipse Downloads' : 'Eclipse' }
  isAnimationEnabled = animated
  publish(); syncAnimationTicker()
  if (!privacy && download?.appId && !artwork) void fetchSteamGameIcon(download.appId).then(found => {
    if (!found || !enabled || revision !== contextRevision || activeContext?.type !== 'download') return
    activeContext = { ...activeContext, largeImageKey: found.imageUrl }
    publish()
  }).catch(() => {})
}
export function setDiscordDownloadActivity(name: string, animated = false, download?: DownloadActivity, privacy = false) { setSimpleActivity('download', cleanText(name), animated, false, download, privacy) }
export function setDiscordIdleActivity(animated = false, clipsMode = false) { setSimpleActivity('idle', undefined, animated, clipsMode) }
export function setDiscordVersionVisible(value: boolean) { if (showVersion !== value) { showVersion = value; publish() } }
export function setDiscordTextAnimationEnabled(value: boolean) {
  if (isAnimationEnabled === value) return
  isAnimationEnabled = value; contextRevision++; contextKey = ''; animFrame = 0
  publish(); syncAnimationTicker()
}
export function clearDiscordActivity() {
  contextRevision++; contextKey = ''; activeContext = null
  stopAnimationTicker()
  connection.publish(null, activeClientId)
}
export function stopDiscordRPC() {
  contextRevision++; contextKey = ''; activeContext = null
  stopAnimationTicker(); connection.stop()
}
export function refreshDiscordActivity() { connection.refresh() }
