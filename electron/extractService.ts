import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
// @ts-ignore
import _7z from '7zip-bin'

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

export async function extractArchive(
  archivePath: string, 
  targetDir: string, 
  onProgress?: (percent: number) => void,
  autoDelete?: boolean
): Promise<{ targetDir: string; mainExe: string | null }> {
  return new Promise((resolve, reject) => {
    const sevenZipPath = _7z.path7za

    if (!fs.existsSync(archivePath)) {
      return reject(new Error('Archive not found: ' + archivePath))
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // 7z extraction command: x (extract with full paths), -y (assume yes), -o (output dir)
    const args = ['x', archivePath, '-y', `-o${targetDir}`]

    console.log(`[ExtractService] Extracting ${archivePath} to ${targetDir}`)
    const child = execFile(sevenZipPath, args, { maxBuffer: 1024 * 1024 * 100 })

    let lastProgress = 0

    child.stdout?.on('data', (data: string) => {
      const progressMatch = data.match(/(\d+)%/g)
      if (progressMatch && progressMatch.length > 0) {
        const lastMatch = progressMatch[progressMatch.length - 1]
        const percent = parseInt(lastMatch.replace('%', ''), 10)
        if (!isNaN(percent) && percent > lastProgress) {
          lastProgress = percent
          if (onProgress) onProgress(percent)
        }
      }
    })

    child.stderr?.on('data', (data: string) => {
      console.warn('[ExtractService] 7z stderr:', data)
    })

    child.on('error', (err) => {
      console.error('[ExtractService] 7z process error:', err)
      reject(err)
    })

    child.on('exit', (code) => {
      if (code === 0) {
        if (onProgress) onProgress(100)

        // Find main game executable
        const mainExe = findMainGameExecutable(targetDir)

        // Delete archive if requested
        if (autoDelete) {
          try {
            fs.unlinkSync(archivePath)
            console.log(`[ExtractService] Deleted original archive: ${archivePath}`)
          } catch (e) {
            console.warn('[ExtractService] Failed to auto-delete archive:', e)
          }
        }

        resolve({ targetDir, mainExe })
      } else {
        reject(new Error(`7z process exited with code ${code}`))
      }
    })
  })
}
