import { execFile, exec, execSync } from 'child_process'
import { app, powerMonitor, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

let antiAfkInterval: NodeJS.Timeout | null = null
let isAntiAfkActive = false
let lastNudgeTimestamp = 0

function getMouseNudgeExecutablePath(): string | null {
  const possiblePaths = [
    path.join(__dirname, 'native/MouseNudge.exe'),
    path.join(__dirname, '../electron/native/MouseNudge.exe'),
    path.join(app.getAppPath(), 'electron/native/MouseNudge.exe'),
    path.join(app.getAppPath(), 'dist-electron/native/MouseNudge.exe'),
    path.join(app.getPath('userData'), 'MouseNudge.exe'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }

  // Compile if not found
  const csSource = path.join(__dirname, '../electron/native/MouseNudge.cs')
  const targetExe = path.join(app.getPath('userData'), 'MouseNudge.exe')
  if (fs.existsSync(csSource)) {
    try {
      const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
      execSync(`"${csc}" /nologo /optimize /target:winexe /out:"${targetExe}" "${csSource}"`)
      if (fs.existsSync(targetExe)) return targetExe
    } catch (err) {
      console.warn('[RobloxAntiAfk] Failed to auto-compile MouseNudge:', err)
    }
  }

  return null
}

export function triggerMouseNudge(): boolean {
  try {
    const exePath = getMouseNudgeExecutablePath()
    if (exePath && fs.existsSync(exePath)) {
      execFile(exePath, [], { windowsHide: true }, (err) => {
        if (!err) {
          console.log('[RobloxAntiAfk] ⚡ Sent 1-pixel micro-nudge via Native Exe. AFK timer reset!')
        }
      })
      lastNudgeTimestamp = Date.now()
      return true
    }

    // Direct PowerShell / Win32 Fallback
    const psCmd = `powershell -NoProfile -NonInteractive -Command "[System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new([System.Windows.Forms.Cursor]::Position.X + 1, [System.Windows.Forms.Cursor]::Position.Y); Start-Sleep -Milliseconds 5; [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new([System.Windows.Forms.Cursor]::Position.X - 1, [System.Windows.Forms.Cursor]::Position.Y)"`
    exec(psCmd, { windowsHide: true }, (err) => {
      if (!err) {
        console.log('[RobloxAntiAfk] ⚡ Sent 1-pixel micro-nudge via PowerShell fallback. AFK timer reset!')
      }
    })
    lastNudgeTimestamp = Date.now()
    return true
  } catch (err) {
    console.warn('[RobloxAntiAfk] Failed to trigger mouse nudge:', err)
  }
  return false
}

export function startRobloxAntiAfk() {
  if (isAntiAfkActive) return
  isAntiAfkActive = true
  lastNudgeTimestamp = Date.now()
  console.log('[RobloxAntiAfk] 🛡️ Roblox Anti-AFK protection activated (5-min 1-pixel heartbeat).')

  if (antiAfkInterval) clearInterval(antiAfkInterval)

  antiAfkInterval = setInterval(() => {
    if (!isAntiAfkActive) return
    const now = Date.now()
    const idleSeconds = powerMonitor.getSystemIdleTime()

    // Trigger whenever the player has been idle for >= 5 minutes (300s)
    // or every 5 minutes while idle to ensure Roblox never reaches the 20-min kick
    if (idleSeconds >= 300 || (idleSeconds >= 30 && now - lastNudgeTimestamp >= 5 * 60 * 1000)) {
      console.log(`[RobloxAntiAfk] Idle detected (${idleSeconds}s). Executing 1-pixel micro-nudge...`)
      triggerMouseNudge()
    }
  }, 5000)
}

export function stopRobloxAntiAfk() {
  if (!isAntiAfkActive && !antiAfkInterval) return
  isAntiAfkActive = false
  if (antiAfkInterval) {
    clearInterval(antiAfkInterval)
    antiAfkInterval = null
  }
  console.log('[RobloxAntiAfk] Roblox Anti-AFK protection stopped.')
}

// IPC handler for manual nudge test
ipcMain.handle('roblox:trigger-nudge', () => {
  return triggerMouseNudge()
})
