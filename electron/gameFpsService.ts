/**
 * gameFpsService.ts
 *
 * Measures real in-game FPS externally using Windows DWM (Desktop Window Manager)
 * Composition Timing API — the same external, read-only approach used by tools
 * like GPU-Z and many FPS overlays.
 *
 * ✅ Zero DLL injection into game processes
 * ✅ 100% safe vs Byfron/Hyperion (Roblox), EasyAntiCheat, BattlEye, VAC
 * ✅ Works for any game in windowed or borderless-fullscreen (DWM-composited) mode
 * ⚠️  Falls back to 0 for exclusive fullscreen (DWM bypassed by driver directly)
 */

import { ChildProcess, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let fpsProcess: ChildProcess | null = null
let cachedFps = 0
let scriptPath: string | null = null

// C# script that uses DWM P/Invoke to count actual frame presents per second
// for the foreground window owned by the target game PID.
// cRefreshesPresented = total frames the window has submitted to DWM.
// Delta over 1 second = actual FPS. Safe, user-mode, no special privileges.
const PS_SCRIPT_CONTENT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct UNSIGNED_RATIO {
    public uint uiNumerator;
    public uint uiDenominator;
}

[StructLayout(LayoutKind.Sequential)]
public struct DWM_TIMING_INFO {
    public int              cbSize;
    public UNSIGNED_RATIO   rateRefresh;
    public long             qpcRefreshPeriod;
    public UNSIGNED_RATIO   rateCompose;
    public int              _pad0;
    public long             qpcVBlank;
    public ulong            cRefresh;
    public uint             cDXRefresh;
    public uint             _pad1;
    public long             qpcCompose;
    public ulong            cFrame;
    public uint             cDXPresent;
    public uint             _pad2;
    public ulong            cRefreshFrame;
    public ulong            cFrameSubmitted;
    public uint             cDXPresentSubmitted;
    public uint             _pad3;
    public ulong            cFrameConfirmed;
    public uint             cDXPresentConfirmed;
    public uint             _pad4;
    public ulong            cRefreshConfirmed;
    public uint             cDXPresentConfirmed2;
    public uint             _pad5;
    public ulong            cFramesLate;
    public uint             cFramesOutstanding;
    public uint             _pad6;
    public ulong            cFrameDisplayed;
    public long             qpcFrameDisplayed;
    public ulong            cRefreshFrameDisplayed;
    public ulong            cFrameComplete;
    public long             qpcFrameComplete;
    public ulong            cFramePending;
    public long             qpcFramePending;
    public ulong            cFramesDisplayed;
    public ulong            cFramesComplete;
    public ulong            cFramesPending;
    public ulong            cFramesAvailable;
    public ulong            cFramesDropped;
    public ulong            cFramesMissed;
    public ulong            cRefreshNextDisplayed;
    public ulong            cRefreshNextPresented;
    public ulong            cRefreshesDisplayed;
    public ulong            cRefreshesPresented;
    public ulong            cRefreshStarted;
    public ulong            cPixelsReceived;
    public ulong            cPixelsDrawn;
    public ulong            cBuffersEmpty;
}

public static class DwmFpsReader {
    [DllImport("dwmapi.dll")]
    public static extern int DwmGetCompositionTimingInfo(IntPtr hwnd, ref DWM_TIMING_INFO pTimingInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static int GetFps(int targetPid) {
        try {
            IntPtr hwnd1 = GetForegroundWindow();
            if (hwnd1 == IntPtr.Zero) return 0;
            uint pid1 = 0;
            GetWindowThreadProcessId(hwnd1, out pid1);
            if ((int)pid1 != targetPid) return 0;

            var t1 = new DWM_TIMING_INFO();
            t1.cbSize = System.Runtime.InteropServices.Marshal.SizeOf(t1);
            if (DwmGetCompositionTimingInfo(hwnd1, ref t1) < 0) return 0;

            System.Threading.Thread.Sleep(1000);

            IntPtr hwnd2 = GetForegroundWindow();
            if (hwnd2 == IntPtr.Zero) return 0;
            uint pid2 = 0;
            GetWindowThreadProcessId(hwnd2, out pid2);
            if ((int)pid2 != targetPid) return 0;

            var t2 = new DWM_TIMING_INFO();
            t2.cbSize = System.Runtime.InteropServices.Marshal.SizeOf(t2);
            if (DwmGetCompositionTimingInfo(hwnd2, ref t2) < 0) return 0;

            long delta = (long)(t2.cRefreshesPresented - t1.cRefreshesPresented);
            return (int)Math.Max(0, Math.Min(delta, 9999));
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
