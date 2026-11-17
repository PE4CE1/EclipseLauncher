import * as fs from 'node:fs'
import path from 'node:path'

export interface DownloadActivity {
  name: string
  source: 'Steam' | 'Epic Games' | 'Eclipse'
  phase: 'download' | 'install' | 'verify' | 'prepare'
  appId?: number
  progress?: number
}
interface Manifest { name: string; appId: number; flags: number; downloaded: number; total: number; staged: number; stageTotal: number }
const field = (content: string, key: string) => new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(content)?.[1]
const count = (value?: string) => value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0

export function parseSteamDownload(content: string): Manifest | null {
  const appId = count(field(content, 'appid')), name = field(content, 'name')?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!appId || !name || !content.trimEnd().endsWith('}')) return null
  return { appId, name, flags: count(field(content, 'StateFlags')), downloaded: count(field(content, 'BytesDownloaded')), total: count(field(content, 'BytesToDownload')),
    staged: count(field(content, 'BytesStaged')), stageTotal: count(field(content, 'BytesToStage')) }
}

/** App-state bit offsets follow steamlocate's ACF model; folder existence is never activity. */
export function steamDownloadActivity(manifest: Manifest, recentlyMoving = false): DownloadActivity | null {
  const { flags, name, appId } = manifest
  if (flags & ((1 << 9) | (1 << 23) | (1 << 11))) return null
  let phase: DownloadActivity['phase']
  if (flags & (1 << 20)) phase = 'download'
  else if (flags & ((1 << 21) | (1 << 22) | (1 << 18))) phase = 'install'
  else if (flags & (1 << 17)) phase = 'verify'
  else if (flags & (1 << 19)) phase = 'prepare'
  else if (recentlyMoving && flags & ((1 << 8) | (1 << 10))) phase = 'download'
  else return null
  const total = phase === 'install' ? manifest.stageTotal : manifest.total, done = phase === 'install' ? manifest.staged : manifest.downloaded
  const progress = total > 0 && done <= total && (phase === 'download' || phase === 'install') ? Math.min(100, Math.floor(done / total * 100)) : undefined
  return { name, source: 'Steam', appId, phase, progress }
}

type Entry = { stamp: string; data: Manifest; movedAt: number }
type Library = { entries: Map<string, Entry>; dirty: Set<string>; watcher?: fs.FSWatcher; scannedAt: number }
const manifestName = /^appmanifest_\d+\.acf$/i

/** Native change events avoid repeatedly reading every installed game on the UI process. */
export class SteamDownloadMonitor {
  constructor(private changed?: () => void) {}
  private libraries = new Map<string, Library>()
  private roots: { root: string; folders: string[]; expires: number } | undefined
  private generation = 0
  async scan(root: string, now = Date.now(), force = false): Promise<DownloadActivity | null> {
    const generation = this.generation
    if (!this.roots || this.roots.root !== root || this.roots.expires < now || force) {
      const folders = new Set([root])
      try {
        const filename = path.join(root, 'steamapps', 'libraryfolders.vdf')
        if ((await fs.promises.stat(filename)).size <= 256 * 1024) {
          const content = await fs.promises.readFile(filename, 'utf8')
          for (const item of content.matchAll(/"path"\s+"([^"]+)"/gi)) { const folder = item[1].replace(/\\\\/g, '\\'); if (path.isAbsolute(folder)) folders.add(folder) }
        }
      } catch { /* A single-library installation may not have libraryfolders.vdf yet. */ }
      if (generation !== this.generation) return null
      this.roots = { root, folders: [...folders].slice(0, 64), expires: now + 30_000 }
    }
    const activeFolders = new Set(this.roots.folders.map(folder => path.join(folder, 'steamapps')))
    for (const [folder, library] of this.libraries) if (!activeFolders.has(folder)) { library.watcher?.close(); this.libraries.delete(folder) }
    for (const folder of activeFolders) {
      if (generation !== this.generation) return null
      let library = this.libraries.get(folder)
      if (!library) {
        library = { entries: new Map(), dirty: new Set(), scannedAt: -Infinity }; this.libraries.set(folder, library)
        const current = library
        try {
          current.watcher = fs.watch(folder, { persistent: false }, (_event, filename) => {
            if (filename && manifestName.test(String(filename)) && current.dirty.size < 4096) { current.dirty.add(String(filename)); this.changed?.() }
            else if (String(filename) === 'libraryfolders.vdf') { if (this.roots) this.roots.expires = 0; this.changed?.() }
            else if (!filename) current.scannedAt = -Infinity
          })
          current.watcher.on('error', () => { current.watcher?.close(); current.watcher = undefined; current.scannedAt = -Infinity })
        } catch { /* Network/removable libraries fall back to infrequent directory scans. */ }
      }
      if (force || now - library.scannedAt > (library.watcher ? 60_000 : 8000)) {
        try {
          const names = (await fs.promises.readdir(folder)).filter(name => manifestName.test(name)).slice(0, 4096)
          for (const name of names) library.dirty.add(name)
          for (const name of library.entries.keys()) if (!names.includes(name)) library.entries.delete(name)
          library.scannedAt = now
        } catch { library.entries.clear(); continue }
      }
      const files = [...library.dirty]; library.dirty.clear()
      let index = 0
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
        while (index < files.length && generation === this.generation) {
          const name = files[index++], filename = path.join(folder, name), previous = library!.entries.get(name)
          try {
            const info = await fs.promises.stat(filename), stamp = `${info.mtimeMs}:${info.size}`
            if (info.size > 256 * 1024) { library!.entries.delete(name); continue }
            if (previous?.stamp === stamp && !force) continue
            const data = parseSteamDownload(await fs.promises.readFile(filename, 'utf8'))
            if (!data) { library!.entries.delete(name); library!.dirty.add(name); continue }
            const moving = previous && (data.downloaded > previous.data.downloaded || data.staged > previous.data.staged)
            library!.entries.set(name, { data, stamp, movedAt: moving ? now : previous?.movedAt ?? -Infinity })
            while (library!.entries.size > 4096) library!.entries.delete(library!.entries.keys().next().value!)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') library!.entries.delete(name)
            else library!.dirty.add(name)
          }
        }
      }))
    }
    if (generation !== this.generation) return null
    const choices = [...this.libraries.values()].flatMap(library => [...library.entries.values()].map(entry => steamDownloadActivity(entry.data, now - entry.movedAt < 24_000))).filter((entry): entry is DownloadActivity => !!entry)
    const priority = { download: 4, install: 3, verify: 2, prepare: 1 }
    return choices.sort((a, b) => priority[b.phase] - priority[a.phase])[0] || null
  }
  reset() { this.generation++; for (const library of this.libraries.values()) library.watcher?.close(); this.libraries.clear(); this.roots = undefined }
}
