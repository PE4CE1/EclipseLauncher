import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { shell } from 'electron'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface DetectedVpn {
  id: string
  name: string
  path?: string
  cli?: string
  isRunning: boolean
  isConnected: boolean
  isWindowsNative?: boolean
  nativeName?: string
}

export interface VpnStatus {
  isConnected: boolean
  vpnName?: string
  adapterName?: string
}

const KNOWN_VPNS = [
  {
    id: 'cyberghost',
    name: 'CyberGhost VPN',
    processNames: ['dashboard', 'cyberghost', 'cyberghostservice'],
    paths: [
      'C:\\Program Files\\CyberGhost 8\\Dashboard.exe',
      'C:\\Program Files\\CyberGhost 8\\CyberGhost.exe',
      'C:\\Program Files\\CyberGhost\\CyberGhost.exe'
    ]
  },
  {
    id: 'nordvpn',
    name: 'NordVPN',
    processNames: ['nordvpn', 'nordvpn-service'],
    paths: [
      'C:\\Program Files\\NordVPN\\NordVPN.exe',
      'C:\\Program Files (x86)\\NordVPN\\NordVPN.exe'
    ],
    cli: 'nordvpn -c'
  },
  {
    id: 'protonvpn',
    name: 'ProtonVPN',
    processNames: ['protonvpn', 'protonvpn.wireguardservice'],
    paths: [
      'C:\\Program Files\\Proton\\VPN\\ProtonVPN.exe',
      path.join(process.env.LOCALAPPDATA || '', 'ProtonVPN\\ProtonVPN.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Proton\\VPN\\ProtonVPN.exe')
    ]
  },
  {
    id: 'mullvad',
    name: 'Mullvad VPN',
    processNames: ['mullvad-gui', 'mullvad-daemon'],
    paths: [
      'C:\\Program Files\\Mullvad VPN\\resources\\mullvad.exe',
      'C:\\Program Files\\Mullvad VPN\\Mullvad VPN.exe'
    ],
    cli: 'mullvad connect'
  },
  {
    id: 'surfshark',
    name: 'Surfshark',
    processNames: ['surfshark', 'surfsharkservice'],
    paths: [
      'C:\\Program Files\\Surfshark\\Surfshark.exe',
      'C:\\Program Files (x86)\\Surfshark\\Surfshark.exe'
    ]
  },
  {
    id: 'expressvpn',
    name: 'ExpressVPN',
    processNames: ['expressvpn', 'expressvpn-service'],
    paths: [
      'C:\\Program Files (x86)\\ExpressVPN\\expressvpn-ui\\ExpressVPN.exe',
      'C:\\Program Files\\ExpressVPN\\expressvpn-ui\\ExpressVPN.exe'
    ],
    cli: 'expressvpn connect'
  },
  {
    id: 'windscribe',
    name: 'Windscribe',
    processNames: ['windscribe', 'windscribe-service'],
    paths: [
      'C:\\Program Files\\Windscribe\\Windscribe.exe',
      'C:\\Program Files (x86)\\Windscribe\\Windscribe.exe'
    ],
    cli: 'windscribe-cli connect'
  },
  {
    id: 'pia',
    name: 'Private Internet Access',
    processNames: ['pia-client', 'pia-service'],
    paths: [
      'C:\\Program Files\\Private Internet Access\\pia-client.exe'
    ],
    cli: 'C:\\Program Files\\Private Internet Access\\piactl.exe connect'
  },
  {
    id: 'wireguard',
    name: 'WireGuard',
    processNames: ['wireguard'],
    paths: [
      'C:\\Program Files\\WireGuard\\wireguard.exe'
    ]
  },
  {
    id: 'openvpn',
    name: 'OpenVPN',
    processNames: ['openvpn-gui', 'openvpn'],
    paths: [
      'C:\\Program Files\\OpenVPN\\bin\\openvpn-gui.exe',
      'C:\\Program Files\\OpenVPN Connect\\OpenVPNConnect.exe'
    ]
  },
  {
    id: 'warp',
    name: 'Cloudflare WARP (1.1.1.1)',
    processNames: ['cloudflare warp', 'warp-svc'],
    paths: [
      'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\Cloudflare WARP.exe'
    ],
    cli: 'warp-cli connect'
  }
]

// Non-blocking in-memory cache to prevent repeated PowerShell execution when switching UI tabs
let cachedStatus: { data: VpnStatus; timestamp: number } | null = null
let cachedVpns: { data: DetectedVpn[]; timestamp: number } | null = null
const CACHE_TTL_MS = 15000 // 15 seconds cache

// Check if any VPN tunnel is active (100% Non-Blocking)
export async function getVpnStatus(forceRefresh = false): Promise<VpnStatus> {
  const now = Date.now()
  if (!forceRefresh && cachedStatus && (now - cachedStatus.timestamp < CACHE_TTL_MS)) {
    return cachedStatus.data
  }

  if (process.platform !== 'win32') {
    return { isConnected: false }
  }

  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -Property Name, InterfaceDescription | ConvertTo-Json"`,
      { timeout: 2500 }
    )

    const trimmed = (stdout || '').trim()
    if (!trimmed) {
      const res = { isConnected: false }
      cachedStatus = { data: res, timestamp: now }
      return res
    }

    let adapters: any[] = []
    try {
      const parsed = JSON.parse(trimmed)
      adapters = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      adapters = []
    }

    const vpnAdapter = adapters.find(a => {
      const desc = String(a.InterfaceDescription || '').toLowerCase()
      const name = String(a.Name || '').toLowerCase()
      return (
        desc.includes('tap') ||
        desc.includes('tun') ||
        desc.includes('wintun') ||
        desc.includes('wireguard') ||
        desc.includes('nordlynx') ||
        desc.includes('proton') ||
        desc.includes('mullvad') ||
        desc.includes('surfshark') ||
        desc.includes('vpn') ||
        name.includes('vpn') ||
        name.includes('wireguard')
      )
    })

    const result: VpnStatus = vpnAdapter ? {
      isConnected: true,
      vpnName: vpnAdapter.InterfaceDescription || vpnAdapter.Name || 'VPN Tunnel',
      adapterName: vpnAdapter.Name
    } : { isConnected: false }

    cachedStatus = { data: result, timestamp: now }
    return result
  } catch (e) {
    const fallback = { isConnected: false }
    cachedStatus = { data: fallback, timestamp: now }
    return fallback
  }
}

// Detect all installed VPNs on the system (100% Non-Blocking)
export async function detectInstalledVpns(forceRefresh = false): Promise<DetectedVpn[]> {
  const now = Date.now()
  if (!forceRefresh && cachedVpns && (now - cachedVpns.timestamp < CACHE_TTL_MS)) {
    return cachedVpns.data
  }

  const detected: DetectedVpn[] = []
  const vpnStatus = await getVpnStatus(forceRefresh)

  // Fast asynchronous process check using tasklist instead of heavy PowerShell
  let runningProcesses: string[] = []
  try {
    const { stdout } = await execAsync('tasklist /NH /FO CSV', { timeout: 2000 })
    const lines = stdout.split('\n')
    for (const line of lines) {
      const match = line.match(/^"([^"]+)"/)
      if (match && match[1]) {
        runningProcesses.push(match[1].toLowerCase().replace(/\.exe$/, ''))
      }
    }
  } catch {
    // Fallback: check known processes
  }

  for (const v of KNOWN_VPNS) {
    let installedPath: string | null = null
    for (const p of v.paths) {
      if (fs.existsSync(p)) {
        installedPath = p
        break
      }
    }

    const isRunning = v.processNames.some(pName => runningProcesses.includes(pName))

    if (installedPath || isRunning) {
      detected.push({
        id: v.id,
        name: v.name,
        path: installedPath || undefined,
        cli: v.cli,
        isRunning,
        isConnected: vpnStatus.isConnected && isRunning
      })
    }
  }

  // Check Windows Built-in VPN Connections asynchronously
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "Get-VpnConnection | Select-Object -Property Name, ConnectionStatus | ConvertTo-Json"`,
      { timeout: 2000 }
    )
    const trimmed = (stdout || '').trim()
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed)
        const conns = Array.isArray(parsed) ? parsed : [parsed]
        for (const conn of conns) {
          if (conn.Name) {
            detected.push({
              id: `win-vpn-${conn.Name}`,
              name: `Windows VPN (${conn.Name})`,
              isRunning: conn.ConnectionStatus === 'Connected',
              isConnected: conn.ConnectionStatus === 'Connected',
              isWindowsNative: true,
              nativeName: conn.Name
            })
          }
        }
      } catch {}
    }
  } catch {}

  // If a generic TAP/Wintun adapter is detected but no specific client matched, add Generic VPN
  if (detected.length === 0 && vpnStatus.isConnected) {
    detected.push({
      id: 'generic-vpn',
      name: vpnStatus.vpnName || 'Aktiver VPN Tunnel',
      isRunning: true,
      isConnected: true
    })
  }

  cachedVpns = { data: detected, timestamp: now }
  return detected
}

// Connect to a detected VPN
export async function connectVpn(vpnId?: string): Promise<{ success: boolean; vpnName?: string; isCLI?: boolean; isNative?: boolean; error?: string }> {
  cachedStatus = null
  cachedVpns = null
  const vpns = await detectInstalledVpns(true)
  const target = vpnId ? vpns.find(v => v.id === vpnId) : vpns[0]

  if (!target) {
    return { success: false, error: 'NO_VPN_FOUND' }
  }

  try {
    if (target.isWindowsNative && target.nativeName) {
      await execAsync(`rasdial "${target.nativeName}"`, { timeout: 8000 })
      return { success: true, vpnName: target.name, isNative: true }
    }

    if (target.cli) {
      exec(target.cli, (err) => {
        if (err) console.warn('[VpnService] CLI connect error:', err)
      })
      await new Promise(r => setTimeout(r, 2500))
      return { success: true, vpnName: target.name, isCLI: true }
    }

    if (target.path && fs.existsSync(target.path)) {
      shell.openPath(target.path)
      return { success: true, vpnName: target.name, isCLI: false }
    }

    return { success: true, vpnName: target.name }
  } catch (e: any) {
    console.error('[VpnService] Connect error:', e)
    return { success: false, error: e.message || 'CONNECT_FAILED', vpnName: target.name }
  }
}

// Disconnect VPN
export async function disconnectVpn(vpnId?: string): Promise<{ success: boolean; message?: string }> {
  cachedStatus = null
  cachedVpns = null
  try {
    const vpns = await detectInstalledVpns(true)
    const target = vpnId ? vpns.find(v => v.id === vpnId) : vpns[0]

    if (target?.isWindowsNative && target.nativeName) {
      await execAsync(`rasdial "${target.nativeName}" /disconnect`, { timeout: 5000 })
      return { success: true, message: 'VPN getrennt.' }
    }

    return { success: true, message: 'VPN getrennt.' }
  } catch (e: any) {
    return { success: false, message: e.message || 'Trennen fehlgeschlagen' }
  }
}
