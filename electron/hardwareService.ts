import * as os from 'os'
import { exec } from 'child_process'
import { screen } from 'electron'

export interface HardwareSpecs {
  cpu: string
  gpu: string
  ram: string
  display: string
  os: string
}

let cachedHardware: HardwareSpecs | null = null

function cleanCpuName(raw: string): string {
  if (!raw) return 'Unknown CPU'
  return raw
    .replace(/\(R\)/gi, '')
    .replace(/\(TM\)/gi, '')
    .replace(/CPU\s*/gi, '')
    .replace(/Processor/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanGpuName(raw: string): string {
  if (!raw) return 'Integrated Graphics'
  const items = raw.split(/,\s*|\r?\n/).map(s => s.trim()).filter(Boolean)
  // Filter out virtual/software adapters
  const filtered = items.filter(name => {
    const lower = name.toLowerCase()
    return !lower.includes('virtual') &&
           !lower.includes('parsec') &&
           !lower.includes('meta') &&
           !lower.includes('vnc') &&
           !lower.includes('rdp') &&
           !lower.includes('citrix') &&
           !lower.includes('basic display')
  })

  // Prefer dedicated GPUs (NVIDIA, AMD Radeon, Intel Arc)
  const dedicated = (filtered.length > 0 ? filtered : items).find(name => {
    const lower = name.toLowerCase()
    return lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx') || lower.includes('gtx') ||
           lower.includes('radeon') || lower.includes('rx ') || lower.includes('arc')
  })

  return dedicated || filtered[0] || items[0] || 'Unknown GPU'
}

export function detectHardwareSpecs(): Promise<HardwareSpecs> {
  if (cachedHardware) {
    return Promise.resolve(cachedHardware)
  }

  return new Promise((resolve) => {
    const rawCpu = os.cpus()?.[0]?.model || 'Unknown CPU'
    const cpu = cleanCpuName(rawCpu)

    const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024))
    const ram = `${totalRamGB} GB RAM`

    let osName = 'Windows'
    const release = os.release()
    if (release.startsWith('10.0.')) {
      const build = parseInt(release.split('.')[2] || '0', 10)
      osName = build >= 22000 ? 'Windows 11' : 'Windows 10'
    }

    let displayStr = '1080p'
    try {
      const primary = screen.getPrimaryDisplay()
      if (primary) {
        const { width, height } = primary.size
        displayStr = `${width}x${height}`
      }
    } catch (_) {}

    // Query Windows Management Instrumentation for GPU Name
    if (process.platform === 'win32') {
      exec('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join \', \'"', { timeout: 4000 }, (err, stdout) => {
        const gpu = (!err && stdout) ? cleanGpuName(stdout) : 'NVIDIA / AMD Graphics'
        cachedHardware = {
          cpu,
          gpu,
          ram,
          display: displayStr,
          os: osName
        }
        resolve(cachedHardware)
      })
    } else {
      cachedHardware = {
        cpu,
        gpu: 'Graphics Controller',
        ram,
        display: displayStr,
        os: osName
      }
      resolve(cachedHardware)
    }
  })
}
