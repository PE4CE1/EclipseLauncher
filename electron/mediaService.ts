import { ipcMain, BrowserWindow, globalShortcut } from 'electron'
import { spawn, exec } from 'child_process'

export interface MediaStatus {
  isPlaying: boolean
  title: string
  artist: string
  app: 'spotify' | 'youtube' | 'browser' | 'other' | null
  coverUrl?: string
}

let lastStatus: MediaStatus = {
  isPlaying: false,
  title: '',
  artist: '',
  app: null,
}

let currentFilter: 'all' | 'spotify' | 'youtube' = 'all'
let pollTimer: NodeJS.Timeout | null = null
let currentCoverUrl: string | undefined = undefined
let lastCoverTrackKey = ''
const coverCache = new Map<string, string>()

/**
 * Fetch HD album art from Apple iTunes Search API (fallback if SMTC thumbnail is empty)
 */
async function fetchCoverArt(artist: string, title: string): Promise<string | undefined> {
  if (!title) return undefined

  const cleanTitle = title
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/- .*?(Official|Music|Video|Audio|Remaster|Live|Edit|Version|Slowed|Reverb|Sped Up)/gi, '')
    .replace(/(Slowed|Sped Up|Reverb|Remix).*$/gi, '')
    .trim()

  const cleanArtist = artist.replace(/feat\..*$/i, '').trim()
  const cacheKey = `${cleanArtist} - ${cleanTitle}`.toLowerCase()

  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey)
  }

  try {
    const searchTerm = encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim())
    const res = await fetch(`https://itunes.apple.com/search?term=${searchTerm}&entity=song&limit=1`, {
      signal: AbortSignal.timeout(2500)
    })
    if (res.ok) {
      const data = (await res.json()) as any
      if (data.results && data.results.length > 0) {
        const rawArt = data.results[0].artworkUrl100
        if (rawArt) {
          const hdArt = rawArt.replace('100x100bb', '600x600bb')
          coverCache.set(cacheKey, hdArt)
          return hdArt
        }
      }
    }
  } catch (_) {}

  // Secondary fallback: Search by title alone if artist had special characters or featuring tags
  try {
    const titleOnlyTerm = encodeURIComponent(cleanTitle)
    const res = await fetch(`https://itunes.apple.com/search?term=${titleOnlyTerm}&entity=song&limit=1`, {
      signal: AbortSignal.timeout(2000)
    })
    if (res.ok) {
      const data = (await res.json()) as any
      if (data.results && data.results.length > 0) {
        const rawArt = data.results[0].artworkUrl100
        if (rawArt) {
          const hdArt = rawArt.replace('100x100bb', '600x600bb')
          coverCache.set(cacheKey, hdArt)
          return hdArt
        }
      }
    }
  } catch (_) {}

  return undefined
}

/**
 * Persistent Windows SMTC (System Media Transport Controls) daemon runner.
 * Native Windows 10/11 API: perfectly detects Playing vs Paused, extracts Spotify's native
 * high-resolution album cover directly from memory, and controls playback with zero glitches.
 */
class SMTCService {
  private process: any = null
  private isReady = false
  private pendingResolvers: ((data: any) => void)[] = []
  private buffer = ''

  constructor() {
    this.startDaemon()
  }

  private startDaemon() {
    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

$asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$manager = Await $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$global:asStreamMethod = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStream' -and $_.GetParameters().Count -eq 1 })[0]
$global:lastTrackKey = ""
$global:cachedCover = ""

Function Get-TargetSession($filter) {
    $sessions = $manager.GetSessions()
    if ($filter -eq "spotify") {
        foreach ($s in $sessions) {
            if ($s.SourceAppUserModelId -like "*spotify*") {
                return $s
            }
        }
        return $null
    }
    # For 'all' or other: prefer active or playing session
    $cur = $manager.GetCurrentSession()
    if ($cur) { return $cur }
    foreach ($s in $sessions) {
        $info = $s.GetPlaybackInfo()
        if ($info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
            return $s
        }
    }
    if ($sessions.Count -gt 0) { return $sessions[0] }
    return $null
}

Function Emit-SessionState($session, $forceCover) {
    if ($session) {
        $info = $session.GetPlaybackInfo()
        $mediaOp = $session.TryGetMediaPropertiesAsync()
        $media = Await $mediaOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        
        $app = "other"
        $src = $session.SourceAppUserModelId.ToLower()
        if ($src -like "*spotify*") { $app = "spotify" }
        elseif ($src -like "*chrome*" -or $src -like "*msedge*" -or $src -like "*brave*" -or $src -like "*firefox*") {
            if ($media.Title -like "*YouTube*" -or $media.Artist -like "*YouTube*") { $app = "youtube" }
            else { $app = "browser" }
        }

        $trackKey = "$($media.Artist) - $($media.Title)"
        $newCoverData = $null

        if ($trackKey -ne $global:lastTrackKey -or $forceCover) {
            $global:lastTrackKey = $trackKey
            if ($media.Thumbnail) {
                try {
                    $streamOp = $media.Thumbnail.OpenReadAsync()
                    $stream = Await $streamOp ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                    $netStream = $global:asStreamMethod.Invoke($null, @($stream))
                    $ms = New-Object System.IO.MemoryStream
                    $netStream.CopyTo($ms)
                    $bytes = $ms.ToArray()
                    $contentType = if ($stream.ContentType) { $stream.ContentType } else { "image/jpeg" }
                    $global:cachedCover = "data:$contentType;base64," + [Convert]::ToBase64String($bytes)
                    $newCoverData = $global:cachedCover
                } catch {
                    $global:cachedCover = ""
                    $newCoverData = $null
                }
            } else {
                $global:cachedCover = ""
                $newCoverData = $null
            }
        }

        $obj = [PSCustomObject]@{
            Type = "MEDIA_STATE"
            App = $app
            IsPlaying = ($info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
            Status = [string]$info.PlaybackStatus
            Title = $media.Title
            Artist = $media.Artist
            Cover = $newCoverData
            HasCover = ($global:cachedCover -ne "")
        }
        Write-Output ("JSON:" + ($obj | ConvertTo-Json -Compress))
    } else {
        Write-Output 'JSON:{"Type":"MEDIA_STATE","App":null,"IsPlaying":false,"Status":"Closed","Title":"","Artist":"","Cover":null,"HasCover":false}'
    }
}

Write-Output "READY"

while ($line = [Console]::ReadLine()) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split(" ")
    $cmd = $parts[0].ToUpper()
    $flt = if ($parts.Length -gt 1) { $parts[1].ToLower() } else { "all" }

    $session = Get-TargetSession $flt

    if ($cmd -eq "GET") {
        Emit-SessionState $session $false
    } elseif ($cmd -eq "TOGGLE") {
        if ($session) {
            $t = $session.TryTogglePlayPauseAsync()
            Await $t ([bool]) | Out-Null
            Start-Sleep -Milliseconds 120
        }
        Emit-SessionState (Get-TargetSession $flt) $false
    } elseif ($cmd -eq "NEXT") {
        if ($session) {
            $t = $session.TrySkipNextAsync()
            Await $t ([bool]) | Out-Null
            Start-Sleep -Milliseconds 150
        }
        Emit-SessionState (Get-TargetSession $flt) $true
    } elseif ($cmd -eq "PREV") {
        if ($session) {
            $t = $session.TrySkipPreviousAsync()
            Await $t ([bool]) | Out-Null
            Start-Sleep -Milliseconds 150
        }
        Emit-SessionState (Get-TargetSession $flt) $true
    }
}
`

    try {
      this.process = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        windowsHide: true,
      })

      this.process.stdout.on('data', (data: Buffer) => {
        this.buffer += data.toString('utf8')
        const lines = this.buffer.split('\r\n')
        this.buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed === 'READY') {
            this.isReady = true
          } else if (trimmed.startsWith('JSON:')) {
            try {
              const parsed = JSON.parse(trimmed.substring(5))
              const resolver = this.pendingResolvers.shift()
              if (resolver) resolver(parsed)
            } catch (_) {}
          }
        }
      })

      this.process.on('close', () => {
        this.isReady = false
        this.process = null
        setTimeout(() => this.startDaemon(), 2000)
      })

      this.process.on('error', () => {
        this.isReady = false
      })
    } catch (_) {
      this.isReady = false
    }
  }

  public sendCommand(cmd: string, filter: string = 'all'): Promise<any> {
    return new Promise((resolve) => {
      if (!this.process || !this.isReady) {
        this.fallbackKey(cmd).then(() => resolve(null))
        return
      }

      this.pendingResolvers.push(resolve)
      try {
        this.process.stdin.write(`${cmd} ${filter}\n`)
      } catch (_) {
        resolve(null)
      }

      setTimeout(() => {
        const idx = this.pendingResolvers.indexOf(resolve)
        if (idx !== -1) {
          this.pendingResolvers.splice(idx, 1)
          resolve(null)
        }
      }, 1500)
    })
  }

  private fallbackKey(action: string): Promise<boolean> {
    return new Promise((resolve) => {
      let vk = 0xB3 // Play/Pause
      if (action === 'NEXT') vk = 0xB0
      if (action === 'PREV') vk = 0xB1

      const script = `
$c = @"
using System;
using System.Runtime.InteropServices;
public class MediaCtrl {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void Send() {
        keybd_event(${vk}, 0, 0, UIntPtr.Zero);
        keybd_event(${vk}, 0, 2, UIntPtr.Zero);
    }
}
"@
Add-Type -TypeDefinition $c -ErrorAction SilentlyContinue
[MediaCtrl]::Send()
`
      const b64 = Buffer.from(script, 'utf16le').toString('base64')
      exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { windowsHide: true }, () => {
        resolve(true)
      })
    })
  }
}

const smtc = new SMTCService()

export async function detectActiveMedia(sourceFilter: 'all' | 'spotify' | 'youtube' = currentFilter): Promise<MediaStatus> {
  const raw = await smtc.sendCommand('GET', sourceFilter)

  if (raw && (raw.Title || raw.Artist || raw.App)) {
    const isPlaying = Boolean(raw.IsPlaying)
    const title = raw.Title ? raw.Title.trim() : ''
    const artist = raw.Artist ? raw.Artist.trim() : ''
    const app = raw.App || 'other'
    const trackKey = `${artist} - ${title}`

    // 1. Resolve Album Cover Art (Priority: Native Spotify SMTC Thumbnail > Cache > iTunes Fallback)
    if (raw.Cover) {
      currentCoverUrl = raw.Cover
      lastCoverTrackKey = trackKey
      coverCache.set(trackKey, raw.Cover)
    } else if (raw.HasCover && currentCoverUrl && lastCoverTrackKey === trackKey) {
      // Retain current in-memory cover for same track
    } else if (coverCache.has(trackKey)) {
      currentCoverUrl = coverCache.get(trackKey)
      lastCoverTrackKey = trackKey
    } else if (title && title !== 'Spotify' && title !== 'Pausiert') {
      // Fallback: iTunes HD search
      const itunesCover = await fetchCoverArt(artist, title)
      if (itunesCover) {
        currentCoverUrl = itunesCover
        lastCoverTrackKey = trackKey
        coverCache.set(trackKey, itunesCover)
      }
    }

    const result: MediaStatus = {
      isPlaying,
      title,
      artist,
      app,
      coverUrl: currentCoverUrl,
    }

    lastStatus = result
    return result
  }

  // If paused / idle, retain previous song & cover info
  if (lastStatus.title && !lastStatus.isPlaying) {
    return {
      ...lastStatus,
      coverUrl: currentCoverUrl || lastStatus.coverUrl,
    }
  }

  return {
    isPlaying: false,
    title: '',
    artist: '',
    app: null,
  }
}

export function initMediaIPC(getWindows: () => BrowserWindow[]) {
  ipcMain.handle('media:get-status', async (_event, filter?: 'all' | 'spotify' | 'youtube') => {
    if (filter) currentFilter = filter
    return await detectActiveMedia(currentFilter)
  })

  ipcMain.handle('media:set-filter', async (_event, filter: 'all' | 'spotify' | 'youtube') => {
    currentFilter = filter
    const state = await detectActiveMedia(currentFilter)
    broadcastUpdate(state, getWindows)
    return { success: true }
  })

  ipcMain.handle('media:play-pause', async () => {
    return await mediaToggle(getWindows)
  })

  ipcMain.handle('media:next', async () => {
    return await mediaNext(getWindows)
  })

  ipcMain.handle('media:previous', async () => {
    return await mediaPrev(getWindows)
  })

  ipcMain.handle('media:register-hotkeys', (_event, keybinds: { playPause?: string; next?: string; prev?: string }) => {
    registerMediaGlobalHotkeys(keybinds, getWindows)
    return { success: true }
  })

  let mediaPollInterval = 1000

  ipcMain.handle('media:set-performance-mode', (_event, isPerf: boolean) => {
    mediaPollInterval = isPerf ? 2500 : 1000
    return { success: true }
  })

  // Real-time polling loop: queries lightweight in-memory daemon (throttled in performance mode)
  const schedulePoll = () => {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = setTimeout(async () => {
      const state = await detectActiveMedia(currentFilter)
      broadcastUpdate(state, getWindows)
      schedulePoll()
    }, mediaPollInterval)
  }

  schedulePoll()
}

export async function mediaToggle(getWindows?: () => BrowserWindow[]) {
  const raw = await smtc.sendCommand('TOGGLE', currentFilter)
  if (raw && (raw.Title || raw.Artist || raw.App)) {
    const state: MediaStatus = {
      isPlaying: Boolean(raw.IsPlaying),
      title: raw.Title ? raw.Title.trim() : lastStatus.title,
      artist: raw.Artist ? raw.Artist.trim() : lastStatus.artist,
      app: raw.App || lastStatus.app,
      coverUrl: currentCoverUrl || lastStatus.coverUrl,
    }
    lastStatus = state
    if (getWindows) broadcastUpdate(state, getWindows)
    return { success: true }
  }

  const state = await detectActiveMedia(currentFilter)
  if (getWindows) broadcastUpdate(state, getWindows)
  return { success: true }
}

export async function mediaNext(getWindows?: () => BrowserWindow[]) {
  await smtc.sendCommand('NEXT', currentFilter)
  const state = await detectActiveMedia(currentFilter)
  if (getWindows) broadcastUpdate(state, getWindows)
  return { success: true }
}

export async function mediaPrev(getWindows?: () => BrowserWindow[]) {
  await smtc.sendCommand('PREV', currentFilter)
  const state = await detectActiveMedia(currentFilter)
  if (getWindows) broadcastUpdate(state, getWindows)
  return { success: true }
}

let activeMediaHotkeys = {
  playPause: null as string | null,
  next: null as string | null,
  prev: null as string | null,
}

export function registerMediaGlobalHotkeys(
  keybinds: { playPause?: string; next?: string; prev?: string } | undefined,
  getWindows?: () => BrowserWindow[]
) {
  // 1. Unregister existing hotkeys safely
  if (activeMediaHotkeys.playPause) {
    try { globalShortcut.unregister(activeMediaHotkeys.playPause) } catch {}
    activeMediaHotkeys.playPause = null
  }
  if (activeMediaHotkeys.next) {
    try { globalShortcut.unregister(activeMediaHotkeys.next) } catch {}
    activeMediaHotkeys.next = null
  }
  if (activeMediaHotkeys.prev) {
    try { globalShortcut.unregister(activeMediaHotkeys.prev) } catch {}
    activeMediaHotkeys.prev = null
  }

  if (!keybinds) return

  const normalizeAccelerator = (str: string) => {
    return str
      .replace(/Control/gi, 'Ctrl')
      .replace(/Ctrl/gi, 'CommandOrControl')
      .trim()
  }

  // Register playPause
  if (keybinds.playPause && keybinds.playPause.trim()) {
    const raw = keybinds.playPause.trim()
    const hk = normalizeAccelerator(raw)
    try {
      const ok = globalShortcut.register(hk, () => {
        mediaToggle(getWindows).catch(() => {})
      })
      if (ok) activeMediaHotkeys.playPause = hk
    } catch (e) {
      console.warn('[MediaHotkeys] Failed to register playPause hotkey:', raw, e)
    }
  }

  // Register next
  if (keybinds.next && keybinds.next.trim()) {
    const raw = keybinds.next.trim()
    const hk = normalizeAccelerator(raw)
    try {
      const ok = globalShortcut.register(hk, () => {
        mediaNext(getWindows).catch(() => {})
      })
      if (ok) activeMediaHotkeys.next = hk
    } catch (e) {
      console.warn('[MediaHotkeys] Failed to register next hotkey:', raw, e)
    }
  }

  // Register prev
  if (keybinds.prev && keybinds.prev.trim()) {
    const raw = keybinds.prev.trim()
    const hk = normalizeAccelerator(raw)
    try {
      const ok = globalShortcut.register(hk, () => {
        mediaPrev(getWindows).catch(() => {})
      })
      if (ok) activeMediaHotkeys.prev = hk
    } catch (e) {
      console.warn('[MediaHotkeys] Failed to register prev hotkey:', raw, e)
    }
  }
}

export function unregisterAllMediaHotkeys() {
  if (activeMediaHotkeys.playPause) {
    try { globalShortcut.unregister(activeMediaHotkeys.playPause) } catch {}
    activeMediaHotkeys.playPause = null
  }
  if (activeMediaHotkeys.next) {
    try { globalShortcut.unregister(activeMediaHotkeys.next) } catch {}
    activeMediaHotkeys.next = null
  }
  if (activeMediaHotkeys.prev) {
    try { globalShortcut.unregister(activeMediaHotkeys.prev) } catch {}
    activeMediaHotkeys.prev = null
  }
}

let lastBroadcastState: MediaStatus | null = null

function broadcastUpdate(state: MediaStatus, getWindows: () => BrowserWindow[]) {
  if (
    lastBroadcastState &&
    lastBroadcastState.isPlaying === state.isPlaying &&
    lastBroadcastState.title === state.title &&
    lastBroadcastState.artist === state.artist &&
    lastBroadcastState.app === state.app &&
    lastBroadcastState.coverUrl === state.coverUrl
  ) {
    return // Skip duplicate IPC broadcast completely - saves 100% idle IPC/CPU overhead
  }
  lastBroadcastState = { ...state }

  const wins = getWindows()
  for (const win of wins) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('media:update', state)
    }
  }
}
