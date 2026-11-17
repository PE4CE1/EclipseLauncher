import { ipcMain } from './ipcSecurity'
import { spawn, ChildProcess, execFileSync } from 'child_process'
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'

let voiceProc: ChildProcess | null = null
let isVoiceRunning = false
let currentPhrase = 'clip that'
let getMainWindowRef: (() => BrowserWindow | null) | null = null
const isArchivePath = (filePath: string) => /(^|[\\/])app\.asar([\\/]|$)/i.test(filePath)
const normalizePhrase = (phrase: unknown) => typeof phrase === 'string' ? phrase.replace(/[\r\n]/g, ' ').trim().slice(0, 200) || 'clip that' : 'clip that'

function getVoiceExecutablePath(): string {
  const targetUserDir = path.join(app.getPath('userData'), 'native')
  const targetUserExe = path.join(targetUserDir, 'VoiceListener.exe')

  // 1. Check unpacked directory from electron-builder (resources/app.asar.unpacked)
  if (process.resourcesPath) {
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'native', 'VoiceListener.exe')
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath
    }
    const unpackedAlt = path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'VoiceListener.exe')
    if (fs.existsSync(unpackedAlt)) {
      return unpackedAlt
    }
  }

  // 2. Check if already extracted in userData
  if (fs.existsSync(targetUserExe)) {
    try {
      const stats = fs.statSync(targetUserExe)
      if (stats.size > 0) return targetUserExe
    } catch {}
  }

  // 3. Check development paths (not inside app.asar)
  const devPaths = [
    path.join(__dirname, '../electron/native/VoiceListener.exe'),
    path.join(__dirname, 'native/VoiceListener.exe'),
    path.join(app.getAppPath(), 'electron/native/VoiceListener.exe'),
  ]

  for (const p of devPaths) {
    if (!isArchivePath(p) && fs.existsSync(p)) {
      return p
    }
  }

  // 4. If running inside app.asar, extract embedded binary to userData/native
  const asarPaths = [
    path.join(__dirname, '../electron/native/VoiceListener.exe'),
    path.join(__dirname, 'native/VoiceListener.exe'),
    path.join(app.getAppPath(), 'electron/native/VoiceListener.exe'),
  ]

  for (const p of asarPaths) {
    if (fs.existsSync(p)) {
      try {
        if (!fs.existsSync(targetUserDir)) {
          fs.mkdirSync(targetUserDir, { recursive: true })
        }
        const buf = fs.readFileSync(p)
        fs.writeFileSync(targetUserExe, buf)
        console.log('[VoiceService] Extracted VoiceListener.exe from asar to:', targetUserExe)
        return targetUserExe
      } catch (err) {
        console.warn('[VoiceService] Failed to extract VoiceListener from asar:', err)
      }
    }
  }

  // 5. Fallback: Compile from C# source if csc.exe is available
  const csSources = [
    path.join(__dirname, '../electron/native/VoiceListener.cs'),
    path.join(__dirname, 'native/VoiceListener.cs'),
    path.join(app.getAppPath(), 'electron/native/VoiceListener.cs'),
  ]

  for (const csSource of csSources) {
    if (fs.existsSync(csSource)) {
      try {
        if (!fs.existsSync(targetUserDir)) {
          fs.mkdirSync(targetUserDir, { recursive: true })
        }
        const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
        const ref = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\WPF\\System.Speech.dll'
        if (fs.existsSync(csc) && fs.existsSync(ref)) {
          let realCs = csSource
          if (isArchivePath(csSource)) {
            const tempCs = path.join(targetUserDir, 'VoiceListener.cs')
            fs.writeFileSync(tempCs, fs.readFileSync(csSource))
            realCs = tempCs
          }
          execFileSync(csc, ['/nologo', '/optimize', '/target:exe', `/reference:${ref}`, `/out:${targetUserExe}`, realCs], { windowsHide: true, timeout: 15000 })
          if (fs.existsSync(targetUserExe)) return targetUserExe
        }
      } catch (err) {
        console.warn('[VoiceService] Failed to auto-compile VoiceListener:', err)
      }
    }
  }

  return targetUserExe
}

export function startVoiceListener(phrase: string = 'clip that', getWin?: () => BrowserWindow | null) {
  phrase = normalizePhrase(phrase)
  if (getWin) getMainWindowRef = getWin
  if (isVoiceRunning && voiceProc) {
    if (phrase && phrase !== currentPhrase) {
      currentPhrase = phrase
      try {
        voiceProc.stdin?.write(`phrase:${phrase}\n`)
      } catch {}
    }
    return
  }

  const exePath = getVoiceExecutablePath()
  // Guard: NEVER attempt to spawn directly inside app.asar (Windows CreateProcess cannot execute inside asar)
  if (!exePath || !fs.existsSync(exePath) || isArchivePath(exePath)) {
    console.warn('[VoiceService] Valid physical VoiceListener.exe not found. Path:', exePath)
    return
  }

  currentPhrase = phrase || 'clip that'
  isVoiceRunning = true

  try {
    voiceProc = spawn(exePath, [currentPhrase], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    })

    // Attach error listener to prevent uncaughtException in main process
    const child = voiceProc
    child.stdin?.on('error', (err) => {
      console.warn('[VoiceService] VoiceListener input closed:', err.message)
    })
    voiceProc.on('error', (err) => {
      console.warn('[VoiceService] VoiceListener process error caught safely:', err)
      if (voiceProc === child) {
        voiceProc = null
        isVoiceRunning = false
      }
    })
  } catch (err) {
    console.warn('[VoiceService] Failed to spawn VoiceListener:', err)
    voiceProc = null
    isVoiceRunning = false
    return
  }

  let lineBuffer = ''
  const child = voiceProc

  voiceProc.stdout?.on('data', (chunk: Buffer) => {
    if (voiceProc !== child) return
    lineBuffer += chunk.toString('utf8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''
    if (lineBuffer.length > 65536) lineBuffer = ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed)
        if (msg.event === 'hotword') {
          console.log(`[VoiceService] Offline Speech Recognized: "${msg.text}" (confidence: ${msg.confidence})`)
          const win = getMainWindowRef?.()
          if (win && !win.isDestroyed()) {
            win.webContents.send('voice:hotword-detected', { text: msg.text, confidence: msg.confidence })
          }
        } else if (msg.event === 'ready') {
          console.log(`[VoiceService] Native Windows Speech Engine Ready (Listening for: "${msg.phrase}")`)
        }
      } catch {}
    }
  })

  voiceProc.on('exit', () => {
    if (voiceProc !== child) return
    voiceProc = null
    isVoiceRunning = false
  })
}

export function stopVoiceListener() {
  if (!isVoiceRunning && !voiceProc) return
  isVoiceRunning = false
  if (voiceProc) {
    try {
      voiceProc.stdin?.write('exit\n')
      voiceProc.kill()
    } catch {}
    voiceProc = null
  }
  console.log('[VoiceService] Native VoiceListener stopped.')
}

export function initVoiceIPC(getWin: () => BrowserWindow | null) {
  getMainWindowRef = getWin

  ipcMain.handle('voice:start', (_e, phrase?: string) => {
    startVoiceListener(phrase, getWin)
    return { success: true }
  })

  ipcMain.handle('voice:stop', () => {
    stopVoiceListener()
    return { success: true }
  })

  ipcMain.on('voice:set-phrase', (_e, phrase: string) => {
    phrase = normalizePhrase(phrase)
    currentPhrase = phrase
    if (isVoiceRunning && voiceProc) {
      try {
        voiceProc.stdin?.write(`phrase:${phrase}\n`)
      } catch {}
    }
  })
}
