import { Client } from 'discord-rpc'

// Client ID for Eclipse Launcher provided by the user
const clientId = '1534714200813863136' 

let rpc: Client | null = null
let startTimestamp: Date | undefined = undefined
let isReady = false
let pendingActivity: any = null

let lastActivityTime = 0
let lastActivityKey = ''
let throttleTimeout: NodeJS.Timeout | null = null

function updateActivityThrottled(activity: any, force: boolean = false) {
  if (!rpc) {
    initDiscordRPC()
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

  rpc.setActivity(activity).catch(err => console.log('Failed to set Discord activity:', err.message))
}

export function initDiscordRPC() {
  if (rpc) return

  rpc = new Client({ transport: 'ipc' })

  rpc.on('ready', () => {
    console.log('Discord RPC ready')
    isReady = true
    if (pendingActivity) {
      updateActivityThrottled(pendingActivity, true)
    }
  })

  rpc.login({ clientId }).catch(err => {
    console.log('Discord RPC login failed:', err.message)
    rpc = null 
    isReady = false
  })
}

export function setDiscordActivity(gameName: string, startTime: number, isPrivacyMode: boolean = false) {
  startTimestamp = new Date(startTime)
  const displayName = isPrivacyMode ? 'a Game' : gameName

  const activity = {
    details: `🎮 Playing ${displayName}`,
    state: 'In-Game',
    startTimestamp,
    largeImageKey: 'eclipselauncher', 
    largeImageText: isPrivacyMode ? 'Playing on Eclipse Launcher' : `Playing ${gameName} on Eclipse Launcher`,
    smallImageKey: 'eclipselauncher',
    smallImageText: 'Eclipse Launcher',
    instance: false,
    buttons: [
      { label: 'Download Eclipse Launcher', url: 'https://eclipse-launcher.netlify.app/' },
      { label: 'GitHub Releases', url: 'https://github.com/PE4CE1/EclipseLauncher/releases' }
    ]
  }

  updateActivityThrottled(activity, true)
}

export function setDiscordDownloadActivity(downloadName: string) {
  const activity = {
    details: `📥 Downloading ${downloadName}`,
    state: `Downloading...`,
    largeImageKey: 'eclipselauncher',
    largeImageText: 'Eclipse Launcher Download Manager',
    instance: false,
    buttons: [
      { label: 'Download Eclipse Launcher', url: 'https://eclipse-launcher.netlify.app/' }
    ]
  }

  updateActivityThrottled(activity)
}

export function setDiscordIdleActivity() {
  const activity = {
    details: 'In Launcher',
    state: 'Browsing Library',
    largeImageKey: 'eclipselauncher',
    largeImageText: 'Eclipse Launcher',
    instance: false,
    buttons: [
      { label: 'Download Eclipse Launcher', url: 'https://eclipse-launcher.netlify.app/' }
    ]
  }

  updateActivityThrottled(activity)
}

export function clearDiscordActivity() {
  pendingActivity = null
  lastActivityKey = ''
  if (throttleTimeout) {
    clearTimeout(throttleTimeout)
    throttleTimeout = null
  }
  if (isReady && rpc) {
    rpc.clearActivity().catch(err => console.log('Failed to clear Discord activity:', err.message))
    startTimestamp = undefined
  }
}
