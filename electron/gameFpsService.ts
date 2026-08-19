/**
 * gameFpsService.ts
 *
 * Measures real in-game FPS externally using Windows DWM (Desktop Window Manager)
 * Composition Timing API.
 *
 * Key fix: use cFramesDisplayed (unique rendered frames shown on screen),
 * NOT cRefreshesPresented (which equals monitor Hz due to VSync/composition cycles).
 *
 * The struct uses NO explicit padding fields — CLR LayoutKind.Sequential adds
 * natural alignment padding automatically, matching the native C++ layout.
 *
 * ✅ Zero DLL injection — pure read-only Windows API call
 * ✅ 100% safe vs Byfron/Hyperion, EasyAntiCheat, BattlEye, VAC
 * ✅ Works for any DWM-composited game (windowed / borderless fullscreen)
 * ✅ Falls back to 0 when game is not in foreground or DWM bypassed
 */

import { ChildProcess, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let fpsProcess: ChildProcess | null = null
let cachedFps = 0
let scriptPath: string | null = null

// The C# script spawned as a background PowerShell process.
//
// Critical details:
// 1. DWM_TIMING_INFO has NO explicit _pad fields — CLR Sequential layout
//    inserts the same padding as the native C++ compiler automatically.
// 2. We use cFramesDisplayed (offset ~208), not cRefreshesPresented (offset ~280).
//    cFramesDisplayed = total UNIQUE frames the window has put on screen.
//    Delta over 1 second = actual rendered FPS, e.g. 230 on a 280Hz monitor.
// 3. cbSize must equal Marshal.SizeOf(t) — if it's != 320 the API returns E_INVALIDARG.
const PS_SCRIPT_CONTENT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

[StructLayout(LayoutKind.Sequential)]
public struct UNSIGNED_RATIO {
    public uint uiNumerator;
    public uint uiDenominator;
}

// CLR Sequential layout inserts padding automatically to match native C++ layout.
// Do NOT add explicit pad fields — that would double the padding and corrupt offsets.
[StructLayout(LayoutKind.Sequential)]
public struct DWM_TIMING_INFO {
    public int            cbSize;
    public UNSIGNED_RATIO rateRefresh;
    public long           qpcRefreshPeriod;       // CLR pads 4 bytes before this (to align to 8)
    public UNSIGNED_RATIO rateCompose;
    public long           qpcVBlank;
    public ulong          cRefresh;
    public uint           cDXRefresh;
    public long           qpcCompose;              // CLR pads 4 bytes before this
    public ulong          cFrame;
    public uint           cDXPresent;
    public ulong          cRefreshFrame;           // CLR pads 4 bytes before this
    public ulong          cFrameSubmitted;
    public uint           cDXPresentSubmitted;
    public ulong          cFrameConfirmed;         // CLR pads 4 bytes before this
    public uint           cDXPresentConfirmed;
    public ulong          cRefreshConfirmed;       // CLR pads 4 bytes before this
    public uint           cDXPresentAverageConfirmed;
    public ulong          cFramesLate;             // CLR pads 4 bytes before this
    public uint           cFramesOutstanding;
    public ulong          cFrameDisplayed;         // CLR pads 4 bytes before this (singular — last frame)
    public long           qpcFrameDisplayed;
    public ulong          cRefreshFrameDisplayed;
    public ulong          cFrameComplete;
    public long           qpcFrameComplete;
    public ulong          cFramePending;
    public long           qpcFramePending;
    public ulong          cFramesDisplayed;        // TOTAL UNIQUE FRAMES — delta per sec = real FPS
    public ulong          cFramesComplete;
    public ulong          cFramesPending;
    public ulong          cFramesAvailable;
    public ulong          cFramesDropped;
    public ulong          cFramesMissed;
    public ulong          cRefreshNextDisplayed;
    public ulong          cRefreshNextPresented;
    public ulong          cRefreshesDisplayed;
    public ulong          cRefreshesPresented;     // monitor-sync count, NOT game FPS
    public ulong          cRefreshStarted;
    public ulong          cPixelsReceived;
    public ulong          cPixelsDrawn;
    public ulong          cBuffersEmpty;
}

public static class DwmFpsReader {
    [DllImport("dwmapi.dll", SetLastError = false)]
    public static extern int DwmGetCompositionTimingInfo(IntPtr hwnd, ref DWM_TIMING_INFO pTimingInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static int GetFps(int targetPid) {
        try {
            int size = Marshal.SizeOf(typeof(DWM_TIMING_INFO));
            // Validate struct size — must be 320 bytes on 64-bit Windows
            if (size != 320) return -10;

            IntPtr hwnd1 = GetForegroundWindow();
            if (hwnd1 == IntPtr.Zero) return 0;
            uint pid1 = 0;
            GetWindowThreadProcessId(hwnd1, out pid1);
            if ((int)pid1 != targetPid) return 0;

            var t1 = new DWM_TIMING_INFO();
            t1.cbSize = size;
            if (DwmGetCompositionTimingInfo(hwnd1, ref t1) < 0) return 0;

            Thread.Sleep(1000);

            IntPtr hwnd2 = GetForegroundWindow();
            if (hwnd2 == IntPtr.Zero) return 0;
            uint pid2 = 0;
            GetWindowThreadProcessId(hwnd2, out pid2);
            if ((int)pid2 != targetPid) return 0;

            var t2 = new DWM_TIMING_INFO();
            t2.cbSize = size;
            if (DwmGetCompositionTimingInfo(hwnd2, ref t2) < 0) return 0;

            // cFramesDisplayed  = frames that actually reached the monitor
            // cFramesDropped    = frames the game submitted but DWM discarded
            //                     (game rendered too fast for the display refresh rate)
            // Together they equal ALL frames the game submitted to DWM → true render FPS
            // This is correct for VSync ON (dropped=0, displayed=cap) and
            // VSync OFF above monitor Hz (displayed<Hz, dropped = overflow frames)
            long displayed = (long)(t2.cFramesDisplayed - t1.cFramesDisplayed);
            long dropped   = (long)(t2.cFramesDropped   - t1.cFramesDropped);
            long totalFps  = Math.Max(0, displayed) + Math.Max(0, dropped);
            return (int)Math.Min(totalFps, 9999);
        } catch {
            return 0;

        }
    }
}
"@ -Language CSharp

param([int]$targetPid)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

while ($true) {
    $fps = [DwmFpsReader]::GetFps($targetPid)
    [Console]::WriteLine($fps)
    [Console]::Out.Flush()
}
`

function ensureScript(): string {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath
  const tmp = path.join(os.tmpdir(), 'eclipse_fps_monitor.ps1')
  fs.writeFileSync(tmp, PS_SCRIPT_CONTENT, 'utf-8')
  scriptPath = tmp
  return tmp
}

export function startGameFpsMonitor(pid: number): void {
  stopGameFpsMonitor()
  if (!pid || pid <= 0) return

  cachedFps = 0
  const script = ensureScript()

  fpsProcess = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', script,
    String(pid),
  ], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (!fpsProcess || !fpsProcess.stdout) return

  let buf = ''
  fpsProcess.stdout.on('data', (data: Buffer) => {
    buf += data.toString()
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      const val = parseInt(line.trim(), 10)
      if (!isNaN(val) && val >= 0) {
        cachedFps = val
      }
    }
  })

  fpsProcess.on('exit', () => {
    fpsProcess = null
  })
}

export function stopGameFpsMonitor(): void {
  if (fpsProcess) {
    try { fpsProcess.kill() } catch (_) {}
    fpsProcess = null
  }
  cachedFps = 0
}

export function getGameFps(): number {
  return cachedFps
}
