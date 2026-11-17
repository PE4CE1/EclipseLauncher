import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { path7z } from '7zip-bin-full'
import { containedDownloadPath } from './downloadPaths'

/**
 * Searches an extracted game folder to find the main game executable (.exe).
 * Ignores setup files, redistributables, unins, crash reporters, etc.
 */
export function findMainGameExecutable(dir: string, gameName?: string): string | null {
  const ignoredExePatterns = [
    /unins.*\.exe$/i,
    /setup.*\.exe$/i,
    /dxsetup.*\.exe$/i,
    /vcredist.*\.exe$/i,
    /crashreport.*\.exe$/i,
    /unitycrashhandler.*\.exe$/i,
    /ue4prereq.*\.exe$/i,
    /dotnet.*\.exe$/i,
    /easyanticheat.*\.exe$/i,
    /battleye.*\.exe$/i,
    /update.*\.exe$/i,
  ]

  let bestExe: { path: string; size: number; score: number } | null = null

  function scan(currentDir: string, depth = 0) {
    if (depth > 3) return // Don't scan too deep
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          // Skip redist / common redist folders
          if (!/(_redist|redist|support|directx|vcredist)/i.test(entry.name)) {
            scan(fullPath, depth + 1)
          }
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
          // Check if ignored
          const isIgnored = ignoredExePatterns.some(pattern => pattern.test(entry.name))
          if (isIgnored) continue

          const stats = fs.statSync(fullPath)
          let score = 1

          // Higher score if name matches game name
          if (gameName && entry.name.toLowerCase().includes(gameName.toLowerCase().slice(0, 5))) {
            score += 10
          }
          // Higher score if it's in the root folder rather than subfolders
          if (depth === 0) score += 3

          // Factor in file size (main game exes are typically several megabytes)
          const sizeMB = stats.size / (1024 * 1024)
          if (sizeMB > 5) score += 5
          if (sizeMB > 20) score += 5

          if (!bestExe || score > bestExe.score || (score === bestExe.score && stats.size > bestExe.size)) {
            bestExe = { path: fullPath, size: stats.size, score }
          }
        }
      }
    } catch (e) {
      console.warn('[ExtractService] Error scanning directory for exes:', e)
    }
  }

  scan(dir)
  return bestExe ? (bestExe as any).path : null
}

export function get7zPath(): string {
  const platformDirectory = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const binaryName = process.platform === 'win32' ? '7z.exe' : '7zz'
  const candidatePaths = [
    path7z.replace('app.asar', 'app.asar.unpacked'),
    path7z,
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', '7zip-bin-full', platformDirectory, process.arch, binaryName),
  ]

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p) && (process.platform !== 'win32' || fs.existsSync(path.join(path.dirname(p), '7z.dll')))) return p
    } catch {}
  }
  throw new Error('The bundled 7-Zip executable or codec library is missing. Reinstall Eclipse Launcher.')
}

export function validateArchiveListing(listing: string, targetDir: string): string[] {
  const entries: string[] = []
  for (const line of listing.split(/\r?\n/)) {
    if (/^(Symbolic Link|Hard Link) = \S/.test(line) || /^Attributes = .*\bl[rwxs-]{9}/i.test(line)) {
      throw new Error('Archives containing links are not supported')
    }
    if (!line.startsWith('Path = ')) continue
    const archiveEntry = line.slice(7)
    const parts = archiveEntry.replace(/\\/g, '/').split('/')
    if (!archiveEntry || /^[\\/]/.test(archiveEntry) || archiveEntry.includes(':') || /[\x00-\x1f]/.test(archiveEntry) ||
        parts.some(part => part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new Error('Archive contains an unsafe file path')
    }
    entries.push(containedDownloadPath(targetDir, parts.join(path.sep)))
  }
  return entries
}

async function ensureNoLinks(destination: string, entries: string[]) {
  // Existing junctions/symlinks would allow even a relative archive entry to
  // escape the selected folder. Check ancestors and every existing output path.
  const candidates = new Set<string>()
  for (const entry of [path.resolve(destination), ...entries]) {
    let current = entry
    while (!candidates.has(current)) {
      candidates.add(current)
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  const paths = [...candidates]
  for (let index = 0; index < paths.length; index += 32) {
    await Promise.all(paths.slice(index, index + 32).map(async candidate => {
      const stat = await fs.promises.lstat(candidate).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (stat?.isSymbolicLink()) throw new Error('Extraction destination contains a symbolic link or junction')
    }))
  }
}

function run7zip(binary: string, args: string[], signal?: AbortSignal, onOutput?: (chunk: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    let errors = ''
    const child = spawn(binary, args, { windowsHide: true, signal })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (onOutput) onOutput(chunk)
      else {
        output += chunk
        if (output.length > 32 * 1024 * 1024) {
          child.kill()
          reject(new Error('Archive file listing exceeds the supported size'))
        }
      }
    })
    child.stderr.on('data', (chunk: string) => { errors = (errors + chunk).slice(-8192) })
    child.once('error', reject)
    child.once('close', code => {
      if (code === 0) resolve(output)
      else reject(new Error(`7-Zip exited with code ${code}: ${errors.trim()}`))
    })
  })
}

export async function extractArchive(
  archivePath: string,
  targetDir: string,
  onProgress?: (percent: number) => void,
  autoDelete?: boolean,
  signal?: AbortSignal
): Promise<{ targetDir: string; mainExe: string | null }> {
  const archive = path.resolve(archivePath)
  const destination = path.resolve(targetDir)
  const sevenZipPath = get7zPath()
  if (!(await fs.promises.stat(archive)).isFile()) throw new Error('Archive not found: ' + archive)
  signal?.throwIfAborted()
  const listing = await run7zip(sevenZipPath, ['l', '-slt', '-ba', '--', archive], signal)
  const entries = validateArchiveListing(listing, destination)
  if (entries.length === 0) throw new Error('Archive contains no extractable files')
  await ensureNoLinks(destination, entries)
  await fs.promises.mkdir(destination, { recursive: true })

  let lastProgress = 0
  await run7zip(sevenZipPath, ['x', '-y', '-bsp1', '-bb0', `-o${destination}`, '--', archive], signal, chunk => {
    for (const match of chunk.matchAll(/(\d+)%/g)) {
      const percent = Math.min(100, Number(match[1]))
      if (percent > lastProgress) {
        lastProgress = percent
        onProgress?.(percent)
      }
    }
  })
  signal?.throwIfAborted()
  const mainExe = findMainGameExecutable(destination)
  if (autoDelete) await fs.promises.unlink(archive).catch(error => {
    console.warn('[ExtractService] Failed to auto-delete archive:', error)
  })
  onProgress?.(100)
  return { targetDir: destination, mainExe }
}
