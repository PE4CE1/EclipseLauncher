import type { InstalledGame, LibraryGame } from '../types/game'

export interface NativeGameRegistration { name: string; executable: string; steamId?: number }
type Games = { installedGames: InstalledGame[]; library: LibraryGame[] }

export function nativeGameRegistrations(state: Games): NativeGameRegistration[] {
  const entries = new Map<string, NativeGameRegistration>()
  for (const game of [...state.library.filter(game => game.installed), ...state.installedGames.filter(game => game.installed !== false)]) {
    const executable = ('executable' in game && typeof game.executable === 'string' ? game.executable : undefined) || game.launchUrl || game.installPath
    if (!executable || !/\.exe$/i.test(executable) || executable.includes('://') || !game.name?.trim()) continue
    const key = executable.replace(/\\/g, '/').toLowerCase()
    entries.set(key, { name: game.name, executable, steamId: game.steamId })
    if (entries.size >= 2048) break
  }
  return [...entries.values()].sort((a, b) => a.executable.localeCompare(b.executable))
}

export function watchNativeGameRegistry(api: { registerInstalledGames?: (games: NativeGameRegistration[]) => Promise<unknown> } | undefined, store: {
  getState(): Games
  subscribe(listener: (state: Games, previous: Games) => void): () => void
}): () => void {
  if (!api?.registerInstalledGames) return () => {}
  let signature = '', disposed = false, timer: ReturnType<typeof setTimeout> | undefined
  const sync = () => {
    timer = undefined
    if (disposed) return
    const games = nativeGameRegistrations(store.getState()), key = JSON.stringify(games)
    if (signature === key) return
    signature = key
    void api.registerInstalledGames!(games).catch(() => { if (!disposed && signature === key) signature = '' })
  }
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.installedGames === previous.installedGames && state.library === previous.library) return
    clearTimeout(timer)
    timer = setTimeout(sync, 500)
  })
  sync()
  return () => { disposed = true; clearTimeout(timer); unsubscribe() }
}
