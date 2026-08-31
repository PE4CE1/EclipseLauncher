import { spawn, ChildProcess, execSync } from 'child_process'
import { BrowserWindow, app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

let voiceProc: ChildProcess | null = null
let isVoiceRunning = false
let currentPhrase = 'clip that'
let getMainWindowRef: (() => BrowserWindow | null) | null = null

function getVoiceExecutablePath(): string {
  const possiblePaths = [
    path.join(__dirname, 'native/VoiceListener.exe'),
    path.join(__dirname, '../electron/native/VoiceListener.exe'),
    path.join(app.getAppPath(), 'electron/native/VoiceListener.exe'),
    path.join(app.getPath('userData'), 'VoiceListener.exe'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }

  // Compile if not found
  const csSource = path.join(__dirname, '../electron/native/VoiceListener.cs')
  const targetExe = path.join(app.getPath('userData'), 'VoiceListener.exe')
  if (fs.existsSync(csSource)) {
    try {
      const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
      const ref = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\WPF\\System.Speech.dll'
      execSync(`"${csc}" /nologo /optimize /target:exe /reference:"${ref}" /out:"${targetExe}" "${csSource}"`)
      if (fs.existsSync(targetExe)) return targetExe
    } catch (err) {
      console.warn('[VoiceService] Failed to auto-compile VoiceListener:', err)
    }
  }

  return possiblePaths[0]
}

export function startVoiceListener(phrase: string = 'clip that', getWin?: () => BrowserWindow | null) {
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
  if (!fs.existsSync(exePath)) {
    console.warn('[VoiceService] VoiceListener.exe not found at:', exePath)
    return
  }

  currentPhrase = phrase || 'clip that'
  isVoiceRunning = true

  try {
    voiceProc = spawn(exePath, [currentPhrase], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
  } catch (err) {
    console.error('[VoiceService] Failed to spawn VoiceListener:', err)
    isVoiceRunning = false
    return
  }

  let lineBuffer = ''

  voiceProc.stdout?.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString('utf8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''

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
    if (isVoiceRunning && voiceProc) {
      try {
        voiceProc.stdin?.write(`phrase:${phrase}\n`)
      } catch {}
    }
  })
}
