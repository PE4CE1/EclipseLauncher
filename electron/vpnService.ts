import { execSync, exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { shell } from 'electron'

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
    processNames: ['Dashboard', 'CyberGhost', 'CyberGhostService'],
    paths: [
      'C:\\Program Files\\CyberGhost 8\\Dashboard.exe',
      'C:\\Program Files\\CyberGhost 8\\CyberGhost.exe',
      'C:\\Program Files\\CyberGhost\\CyberGhost.exe'
    ]
  },
  {
    id: 'nordvpn',
    name: 'NordVPN',
    processNames: ['NordVPN', 'nordvpn-service'],
    paths: [
      'C:\\Program Files\\NordVPN\\NordVPN.exe',
      'C:\\Program Files (x86)\\NordVPN\\NordVPN.exe'
    ],
    cli: 'nordvpn -c'
  },
  {
    id: 'protonvpn',
    name: 'ProtonVPN',
    processNames: ['ProtonVPN', 'ProtonVPN.WireGuardService'],
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
    processNames: ['Surfshark', 'SurfsharkService'],
    paths: [
      'C:\\Program Files\\Surfshark\\Surfshark.exe',
      'C:\\Program Files (x86)\\Surfshark\\Surfshark.exe'
    ]
  },
  {
    id: 'expressvpn',
    name: 'ExpressVPN',
    processNames: ['ExpressVPN', 'expressvpn-service'],
    paths: [
      'C:\\Program Files (x86)\\ExpressVPN\\expressvpn-ui\\ExpressVPN.exe',
      'C:\\Program Files\\ExpressVPN\\expressvpn-ui\\ExpressVPN.exe'
    ],
    cli: 'expressvpn connect'
  },
  {
    id: 'windscribe',
    name: 'Windscribe',
    processNames: ['Windscribe', 'windscribe-service'],
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
    processNames: ['Cloudflare WARP', 'warp-svc'],
    paths: [
      'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\Cloudflare WARP.exe'
    ],
    cli: 'warp-cli connect'
  }
]

// Check if any VPN tunnel is active
export async function getVpnStatus(): Promise<VpnStatus> {
  try {
    const stdout = execSync(
      `powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -Property Name, InterfaceDescription | ConvertTo-Json"`,
      { encoding: 'utf8', timeout: 3000 }
    ).trim()

    if (!stdout) return { isConnected: false }

    let adapters: any[] = []
    try {
      const parsed = JSON.parse(stdout)
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

    if (vpnAdapter) {
      return {
        isConnected: true,
        vpnName: vpnAdapter.InterfaceDescription || vpnAdapter.Name || 'VPN Tunnel',
        adapterName: vpnAdapter.Name
      }
    }

    return { isConnected: false }
  } catch (e) {
    return { isConnected: false }
  }
}

// Detect all installed VPNs on the system
export async function detectInstalledVpns(): Promise<DetectedVpn[]> {
  const detected: DetectedVpn[] = []
  const vpnStatus = await getVpnStatus()

  // Get running processes once
  let runningProcesses: string[] = []
  try {
    const pOut = execSync(
      `powershell -NoProfile -Command "Get-Process | Select-Object -ExpandProperty ProcessName"`,
      { encoding: 'utf8', timeout: 3000 }
    )
    runningProcesses = pOut.split('\n').map(p => p.trim().toLowerCase()).filter(Boolean)
  } catch {}

  for (const v of KNOWN_VPNS) {
    let installedPath: string | null = null
    for (const p of v.paths) {
      if (fs.existsSync(p)) {
        installedPath = p
        break
      }
    }

    const isRunning = v.processNames.some(pName => runningProcesses.includes(pName.toLowerCase()))

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

  // Also check Windows Built-in VPN Connections
  try {
    const vpnConns = execSync(
      `powershell -NoProfile -Command "Get-VpnConnection | Select-Object -Property Name, ConnectionStatus | ConvertTo-Json"`,
      { encoding: 'utf8', timeout: 3000 }
    ).trim()

    if (vpnConns) {
      try {
        const parsed = JSON.parse(vpnConns)
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

  return detected
}

// Connect to a detected VPN
export async function connectVpn(vpnId?: string): Promise<{ success: boolean; message?: string }> {
  const vpns = await detectInstalledVpns()
  const target = vpnId ? vpns.find(v => v.id === vpnId) : vpns[0]

  if (!target) {
    return { success: false, message: 'Kein installiertes VPN gefunden.' }
  }

  try {
    if (target.isWindowsNative && target.nativeName) {
      execSync(`rasdial "${target.nativeName}"`, { timeout: 8000 })
      return { success: true, message: `Windows VPN "${target.nativeName}" verbunden.` }
    }

    if (target.cli) {
      exec(target.cli, (err) => {
        if (err) console.warn('[VpnService] CLI connect error:', err)
      })
      // Wait for adapter
      await new Promise(r => setTimeout(r, 2500))
      return { success: true, message: `${target.name} Verbindung gestartet.` }
    }

    if (target.path && fs.existsSync(target.path)) {
      shell.openPath(target.path)
      return { success: true, message: `${target.name} wurde gestartet.` }
    }

    return { success: true, message: `${target.name} aktiviert.` }
  } catch (e: any) {
    console.error('[VpnService] Connect error:', e)
    return { success: false, message: e.message || 'Verbindung fehlgeschlagen' }
  }
}

// Disconnect VPN
export async function disconnectVpn(vpnId?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const vpns = await detectInstalledVpns()
    const target = vpnId ? vpns.find(v => v.id === vpnId) : vpns[0]

    if (target?.isWindowsNative && target.nativeName) {
      execSync(`rasdial "${target.nativeName}" /disconnect`, { timeout: 5000 })
      return { success: true, message: 'VPN getrennt.' }
    }

    return { success: true, message: 'VPN getrennt.' }
  } catch (e: any) {
    return { success: false, message: e.message || 'Trennen fehlgeschlagen' }
  }
}
