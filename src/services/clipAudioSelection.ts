export interface AudioApplication { name: string; pid: number }
export interface AudioGame extends AudioApplication { exeName?: string }

/** A vanished manual target must never pin recording to a previous game. */
export function resolveClipAudioSelection(selection: string | undefined, applications: AudioApplication[] | null, game: AudioGame | null) {
  if (selection === 'none') return { mode: 'none' as const, pid: undefined, name: undefined, fallback: false }
  const automatic = () => ({ mode: 'auto' as const, pid: game?.pid && game.pid > 0 ? game.pid : undefined, name: game?.name, fallback: !!selection && selection !== 'auto' })
  if (!selection || selection === 'auto') return automatic()
  if (!applications) return { mode: 'unknown' as const, pid: undefined, name: undefined, fallback: false }
  const matches = applications.filter(item => item.name.toLowerCase() === selection.toLowerCase() && !/^discord(?:ptb|canary)?\.exe$/i.test(item.name))
  const match = matches.find(item => item.pid === game?.pid) || matches[0]
  return match ? { mode: 'manual' as const, ...match, fallback: false } : automatic()
}
