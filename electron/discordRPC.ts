import { Client } from 'discord-rpc'

// Default Client ID for Eclipse Launcher
export const DEFAULT_CLIENT_ID = '1534714200813863136'

// Optional map for game-specific Discord Application IDs (e.g. "Rocket League with Eclipse")
export const GAME_CLIENT_IDS: Record<string, string> = {
  'rocket league': '', // When you create an app named "Rocket League with Eclipse", put its Client ID here!
  'roblox': '',
  'fortnite': '',
  'valorant': '',
  'grand theft auto v': '',
  'counter-strike 2': '',
  'minecraft': '',
  'league of legends': ''
}

let activeClientId = DEFAULT_CLIENT_ID
let rpc: Client | null = null
let startTimestamp: Date | undefined = undefined
let isReady = false
let isConnecting = false
let lastLoginAttemptTime = 0
const LOGIN_RETRY_COOLDOWN_MS = 5000
let pendingActivity: any = null

let lastActivityTime = 0
let lastActivityKey = ''
let throttleTimeout: NodeJS.Timeout | null = null

function updateActivityThrottled(activity: any, force: boolean = false) {
  if (!rpc && !isConnecting) {
    initDiscordRPC(activeClientId)
  }

  const key = JSON.stringify(activity)
  const now = Date.now()

  if (!isReady || !rpc) {
    pendingActivity = activity
    return
  }

  // If payload didn't change and not forced, return
  if (key === lastActivityKey && !force) return

  const elapsed = now - lastActivityTime

  // Discord rate limit: max 1 update every ~3.5 seconds
  if (elapsed < 3500 && !force) {
    pendingActivity = activity
    if (!throttleTimeout) {
      throttleTimeout = setTimeout(() => {
        throttleTimeout = null
        if (pendingActivity) {
          updateActivityThrottled(pendingActivity, true)
        }
      }, Math.max(100, 3500 - elapsed))
    }
    return
  }

  if (throttleTimeout) {
    clearTimeout(throttleTimeout)
    throttleTimeout = null
  }

  lastActivityTime = Date.now()
  lastActivityKey = key
  pendingActivity = null

  rpc.setActivity(activity).catch((err: any) => {
    if (err?.message?.includes('closed') || err?.message?.includes('connection')) {
      isReady = false
      isConnecting = false
      rpc = null
    }
  })
}

export function initDiscordRPC(targetClientId: string = DEFAULT_CLIENT_ID) {
  if (rpc && activeClientId === targetClientId && (isReady || isConnecting)) return

  const now = Date.now()
  if (now - lastLoginAttemptTime < LOGIN_RETRY_COOLDOWN_MS && activeClientId === targetClientId) {
    return
  }

  lastLoginAttemptTime = now

  // If switching client IDs or reconnecting, cleanly destroy previous RPC connection
  if (rpc) {
    try {
      rpc.removeAllListeners()
      rpc.destroy().catch(() => {})
    } catch (_) {}
    rpc = null
    isReady = false
    isConnecting = false
  }

  activeClientId = targetClientId
  isConnecting = true

  try {
    const client = new Client({ transport: 'ipc' })
    rpc = client

    client.on('ready', () => {
      if (rpc !== client) return
      console.log(`Discord RPC ready (Client ID: ${activeClientId})`)
      isReady = true
      isConnecting = false
      if (pendingActivity) {
        updateActivityThrottled(pendingActivity, true)
      }
    })

    client.on('close', () => {
      if (rpc === client) {
        isReady = false
        isConnecting = false
        rpc = null
      }
    })

    client.on('error', (_err: any) => {
      if (rpc === client) {
        isReady = false
        isConnecting = false
      }
    })

    client.login({ clientId: activeClientId }).catch((err: any) => {
      if (rpc === client) {
        rpc = null 
        isReady = false
        isConnecting = false
      }
    })
  } catch (_) {
    rpc = null
    isReady = false
    isConnecting = false
  }
}

import * as https from 'https'

export const ECLIPSE_LOGO_URL = 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/logo.png'
export const ECLIPSE_LOGO_GIF_URL = 'https://i.imgur.com/Q5Hueya.gif'

// Cache for dynamic Steam artwork lookups so every game gets its best working artwork instantly
const steamArtworkCache = new Map<string, { appId?: number; imageUrl: string }>()

function checkUrlValid(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = https.request(url, { method: 'HEAD', timeout: 2000 }, (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
      req.end()
    } catch (_) {
      resolve(false)
    }
  })
}

export async function searchSteamArtwork(gameName: string): Promise<{ appId?: number; imageUrl: string } | null> {
  const clean = gameName.toLowerCase().trim()
  if (steamArtworkCache.has(clean)) {
    return steamArtworkCache.get(clean)!
  }

  return new Promise((resolve) => {
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameName)}&l=english&cc=US`
    const req = https.get(url, { timeout: 3500 }, async (res) => {
      if (res.statusCode !== 200) {
        resolve(null)
        return
      }
      let raw = ''
      res.on('data', chunk => raw += chunk)
      res.on('end', async () => {
        try {
          const json = JSON.parse(raw)
          if (json.items && json.items.length > 0 && json.items[0].id) {
            const appId = Number(json.items[0].id)
            const tinyImage = json.items[0].tiny_image || ''

            // 1. Try official transparent logo.png
            const logoUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/logo.png`
            if (await checkUrlValid(logoUrl)) {
              const resObj = { appId, imageUrl: logoUrl }
              steamArtworkCache.set(clean, resObj)
              resolve(resObj)
              return
            }

            // 2. Try official header.jpg
            const headerUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
            if (await checkUrlValid(headerUrl)) {
              const resObj = { appId, imageUrl: headerUrl }
              steamArtworkCache.set(clean, resObj)
              resolve(resObj)
              return
            }

            // 3. Guaranteed fallback to tiny_image capsule
            if (tinyImage) {
              const resObj = { appId, imageUrl: tinyImage }
              steamArtworkCache.set(clean, resObj)
              resolve(resObj)
              return
            }
          }
        } catch (_) {}
        resolve(null)
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

// Guaranteed 100% working Discord-friendly CDN URLs (Steam CDN & GitHub Raw - never blocked by Discord)
export const GAME_ARTWORK_MAP: Record<string, { appId?: number; imageUrl?: string }> = {
  'rocket league': {
    appId: 252950,
    imageUrl: 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Rocket-League-Logo.png'
  },
  'grand theft auto v': {
    appId: 271590,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/271590/logo.png'
  },
  'grand theft auto v enhanced': {
    appId: 271590,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/271590/logo.png'
  },
  'fivem': {
    appId: 271590,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/271590/logo.png'
  },
  'red dead redemption 2': {
    appId: 1174180,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1174180/logo.png'
  },
  'roblox': {
    imageUrl: 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Roblox-Logo-Icon.png'
  },
  'fortnite': {
    imageUrl: 'https://cdn2.unrealengine.com/14br-consoles-1920x1080-wlogo-1920x1080-ecd45d947e4f.jpg'
  },
  'valorant': {
    imageUrl: 'https://images.contentstack.io/v3/assets/blt731acb42bb3d1659/blt77995166da9d1078/5ef232bf0f9d986b2457aa68/VALORANT_JETT_1920x1080.jpg'
  },
  'league of legends': {
    imageUrl: 'https://brand.riotgames.com/static/a994aa7387ab0c315f4e4f2179b6bf5c/36e63/lol-logo.png'
  },
  'minecraft': {
    imageUrl: 'https://launchercontent.mojang.com/vanilla/icon.png'
  },
  'counter-strike 2': {
    appId: 730,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/logo.png'
  },
  'dota 2': {
    appId: 570,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/logo.png'
  },
  'cyberpunk 2077': {
    appId: 1091500,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/logo.png'
  },
  'elden ring': {
    appId: 1245620,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1245620/logo.png'
  },
  'apex legends': {
    appId: 1172470,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1172470/logo.png'
  },
  'overwatch 2': {
    appId: 2357570,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2357570/logo.png'
  },
  'palworld': {
    appId: 1623730,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1623730/logo.png'
  },
  'helldivers 2': {
    appId: 553850,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/553850/logo.png'
  },
  "baldur's gate 3": {
    appId: 1086940,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/logo.png'
  },
  'the witcher 3: wild hunt': {
    appId: 292030,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/292030/logo.png'
  },
  'ea sports fc 24': {
    appId: 2195250,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2195250/logo.png'
  },
  'ea sports fc 25': {
    appId: 2669320,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2669320/logo.png'
  },
  'rust': {
    appId: 252490,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252490/logo.png'
  },
  'rainbow six siege': {
    appId: 359550,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/359550/logo.png'
  },
  'dead by daylight': {
    appId: 381210,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/381210/logo.png'
  },
  'team fortress 2': {
    appId: 440,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/440/logo.png'
  },
  'terraria': {
    appId: 105600,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/105600/logo.png'
  },
  'fall guys': {
    appId: 1097150,
    imageUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1097150/logo.png'
  },
}

export interface DiscordBaseContext {
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
  largeImageKey?: string
  largeImageText?: string
}

let activeContext: DiscordBaseContext | null = null
let animationTicker: NodeJS.Timeout | null = null
let isAnimationEnabled = false
let animFrame = 0

function getAnimatedLines(context: DiscordBaseContext, frame: number) {
  let rawDetails = ''
  let rawState = ''

  if (context.type === 'idle') {
    rawDetails = 'In Launcher'
    rawState = 'Browsing Library'
  } else if (context.type === 'download') {
    const dlName = context.downloadName || 'Game'
    rawDetails = `📥 Downloading ${dlName}`
    rawState = 'with Eclipse'
  } else {
    // Gaming
    const style = context.style || 'clipping'
    const isPrivacy = !!context.isPrivacyMode
    const displayName = isPrivacy ? 'a Game' : (context.gameName || 'a Game')
    rawDetails = style === 'playing' ? `Playing ${displayName}` : `Clipping ${displayName}`
    rawState = context.customState || 'with Eclipse'
  }

  const isEven = (Math.abs(frame) % 2) === 0

  return {
    details: isEven ? `✦ ${rawDetails} ✦` : `✧ ${rawDetails} ✧`,
    state: isEven ? `✧ ${rawState} ✧` : `✦ ${rawState} ✦`
  }
}

function startAnimationTicker() {
  if (animationTicker) {
    clearInterval(animationTicker)
    animationTicker = null
  }

  if (!isAnimationEnabled || !activeContext) return

  animationTicker = setInterval(() => {
    if (!isAnimationEnabled || !activeContext) {
      stopAnimationTicker()
      return
    }

    animFrame = (animFrame + 1) % 4
    const lines = getAnimatedLines(activeContext, animFrame)

    if (activeContext.type === 'idle') {
      const activity = {
        details: lines.details,
        state: lines.state,
        largeImageKey: ECLIPSE_LOGO_GIF_URL,
        largeImageText: 'Eclipse Launcher',
        instance: false,
        buttons: [
          { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' }
        ]
      }
      updateActivityThrottled(activity, true)
    } else if (activeContext.type === 'download') {
      const activity = {
        details: lines.details,
        state: lines.state,
        largeImageKey: ECLIPSE_LOGO_URL,
        largeImageText: 'Eclipse Launcher Download Manager',
        smallImageKey: ECLIPSE_LOGO_URL,
        smallImageText: 'Eclipse',
        instance: false,
        buttons: [
          { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' }
        ]
      }
      updateActivityThrottled(activity, true)
    } else if (activeContext.type === 'game') {
      const activity = {
        details: lines.details,
        state: lines.state,
        startTimestamp: activeContext.startTime ? new Date(activeContext.startTime) : startTimestamp,
        largeImageKey: activeContext.largeImageKey || ECLIPSE_LOGO_URL,
        largeImageText: activeContext.largeImageText || 'Eclipse Launcher',
        smallImageKey: activeContext.customSmallIconUrl || ECLIPSE_LOGO_URL,
        smallImageText: activeContext.customSmallText || 'Eclipse',
        instance: false,
        buttons: [
          { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' },
          { label: 'GitHub Releases', url: 'https://github.com/PE4CE1/EclipseLauncher/releases' }
        ]
      }
      updateActivityThrottled(activity, true)
    }
  }, 2800)
}

function stopAnimationTicker() {
  if (animationTicker) {
    clearInterval(animationTicker)
    animationTicker = null
  }
}

export function setDiscordTextAnimationEnabled(enabled: boolean) {
  isAnimationEnabled = enabled
  if (isAnimationEnabled) {
    if (activeContext) {
      animFrame = 0
      startAnimationTicker()
    }
  } else {
    stopAnimationTicker()
    if (activeContext) {
      if (activeContext.type === 'game') {
        setDiscordActivity(
          activeContext.gameName || 'a Game',
          activeContext.startTime || Date.now(),
          activeContext.isPrivacyMode,
          activeContext.style,
          activeContext.appId,
          activeContext.customIconUrl,
          activeContext.customState,
          activeContext.customSmallIconUrl,
          activeContext.customSmallText,
          false
        )
      } else if (activeContext.type === 'idle') {
        setDiscordIdleActivity(false)
      } else if (activeContext.type === 'download') {
        setDiscordDownloadActivity(activeContext.downloadName || 'Game', false)
      }
    }
  }
}

export function setDiscordActivity(
  gameName: string, 
  startTime: number, 
  isPrivacyMode: boolean = false,
  style: 'clipping' | 'playing' = 'clipping',
  appId?: string | number,
  customIconUrl?: string,
  customState?: string,
  customSmallIconUrl?: string,
  customSmallText?: string,
  isAnimated: boolean = false
) {
  startTimestamp = new Date(startTime)
  isAnimationEnabled = isAnimated
  const displayName = isPrivacyMode ? (style === 'playing' ? 'a Game' : 'a Game') : gameName

  // Resolve Clean Game Icon / Artwork
  let largeImageKey = ECLIPSE_LOGO_URL
  let largeImageText = isPrivacyMode ? 'Eclipse Launcher' : gameName
  const cleanName = (gameName || '').toLowerCase().trim()

  // Switch to game-specific client ID if registered (for "Rocket League with Eclipse" title)
  const targetClientId = (!isPrivacyMode && GAME_CLIENT_IDS[cleanName]) ? GAME_CLIENT_IDS[cleanName] : DEFAULT_CLIENT_ID
  if (targetClientId !== activeClientId) {
    initDiscordRPC(targetClientId)
  }

  let hasFoundArtwork = false

  if (!isPrivacyMode) {
    const mapped = GAME_ARTWORK_MAP[cleanName]

    if (customIconUrl && customIconUrl.startsWith('http')) {
      largeImageKey = customIconUrl
      hasFoundArtwork = true
    } else if (mapped?.imageUrl) {
      largeImageKey = mapped.imageUrl
      hasFoundArtwork = true
    } else if (mapped?.appId) {
      largeImageKey = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${mapped.appId}/logo.png`
      hasFoundArtwork = true
    } else if (appId) {
      largeImageKey = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/logo.png`
      hasFoundArtwork = true
    }
  }

  // If no artwork mapped yet, dynamically search Steam Store in background and update RPC!
  if (!isPrivacyMode && !hasFoundArtwork && gameName && !customIconUrl) {
    searchSteamArtwork(gameName).then(artwork => {
      if (artwork?.imageUrl) {
        setDiscordActivity(gameName, startTime, isPrivacyMode, style, artwork.appId, artwork.imageUrl, customState, customSmallIconUrl, customSmallText, isAnimated)
      }
    }).catch(() => {})
  }

  activeContext = {
    type: 'game',
    gameName,
    startTime,
    isPrivacyMode,
    style,
    appId,
    customIconUrl,
    customState,
    customSmallIconUrl,
    customSmallText,
    largeImageKey,
    largeImageText
  }

  let details = isPrivacyMode
    ? (style === 'playing' ? 'Playing a Game' : 'Clipping a Game')
    : (style === 'playing' ? `Playing ${displayName}` : `Clipping ${displayName}`)

  let state = customState || 'with Eclipse'

  if (isAnimationEnabled) {
    const lines = getAnimatedLines(activeContext, animFrame)
    details = lines.details
    state = lines.state
  }

  const activity = {
    details,
    state,
    startTimestamp,
    largeImageKey, 
    largeImageText,
    smallImageKey: customSmallIconUrl || ECLIPSE_LOGO_URL,
    smallImageText: customSmallText || 'Eclipse',
    instance: false,
    buttons: [
      { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' },
      { label: 'GitHub Releases', url: 'https://github.com/PE4CE1/EclipseLauncher/releases' }
    ]
  }

  updateActivityThrottled(activity, true)

  if (isAnimationEnabled) {
    startAnimationTicker()
  } else {
    stopAnimationTicker()
  }
}

export function setDiscordDownloadActivity(downloadName: string, isAnimated: boolean = false) {
  if (activeClientId !== DEFAULT_CLIENT_ID) {
    initDiscordRPC(DEFAULT_CLIENT_ID)
  }

  isAnimationEnabled = isAnimated
  activeContext = {
    type: 'download',
    downloadName
  }

  let details = `📥 Downloading ${downloadName}`
  let state = `with Eclipse`

  if (isAnimationEnabled) {
    const lines = getAnimatedLines(activeContext, animFrame)
    details = lines.details
    state = lines.state
  }

  const activity = {
    details,
    state,
    largeImageKey: ECLIPSE_LOGO_URL,
    largeImageText: 'Eclipse Launcher Download Manager',
    smallImageKey: ECLIPSE_LOGO_URL,
    smallImageText: 'Eclipse',
    instance: false,
    buttons: [
      { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' }
    ]
  }

  updateActivityThrottled(activity)

  if (isAnimationEnabled) {
    startAnimationTicker()
  } else {
    stopAnimationTicker()
  }
}

export function setDiscordIdleActivity(isAnimated: boolean = false) {
  if (activeClientId !== DEFAULT_CLIENT_ID) {
    initDiscordRPC(DEFAULT_CLIENT_ID)
  }

  isAnimationEnabled = isAnimated
  activeContext = {
    type: 'idle'
  }

  let details = 'In Launcher'
  let state = 'Browsing Library'

  if (isAnimationEnabled) {
    const lines = getAnimatedLines(activeContext, animFrame)
    details = lines.details
    state = lines.state
  }

  const activity = {
    details,
    state,
    largeImageKey: ECLIPSE_LOGO_GIF_URL,
    largeImageText: 'Eclipse Launcher',
    instance: false,
    buttons: [
      { label: 'Download Eclipse', url: 'https://eclipselauncher.pages.dev/' }
    ]
  }

  updateActivityThrottled(activity)

  if (isAnimationEnabled) {
    startAnimationTicker()
  } else {
    stopAnimationTicker()
  }
}

export function clearDiscordActivity() {
  activeContext = null
  stopAnimationTicker()
  pendingActivity = null
  lastActivityKey = ''
  if (throttleTimeout) {
    clearTimeout(throttleTimeout)
    throttleTimeout = null
  }
  if (isReady && rpc) {
    rpc.clearActivity().catch((err: any) => console.log('Failed to clear Discord activity:', err?.message || err))
    startTimestamp = undefined
  }
}
