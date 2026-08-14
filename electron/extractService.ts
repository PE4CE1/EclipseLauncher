import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
// @ts-ignore
import _7z from '7zip-bin'

export async function extractArchive(
  archivePath: string, 
  targetDir: string, 
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Determine the path to 7za.exe based on 7zip-bin
    const sevenZipPath = _7z.path7za

    if (!fs.existsSync(archivePath)) {
      return reject(new Error('Archive not found: ' + archivePath))
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // 7z extraction command: x (extract with full paths), -y (assume yes), -o (output dir)
    const args = ['x', archivePath, '-y', `-o${targetDir}`]

    const child = execFile(sevenZipPath, args, { maxBuffer: 1024 * 1024 * 100 })

    let lastProgress = 0

    child.stdout?.on('data', (data: string) => {
      // 7zip outputs progress like " 15%" or " 23%"
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
      console.warn('7z stderr:', data)
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('exit', (code) => {
      if (code === 0) {
        if (onProgress) onProgress(100)
        resolve(targetDir)
      } else {
        reject(new Error(`7z process exited with code ${code}`))
      }
    })
  })
}
