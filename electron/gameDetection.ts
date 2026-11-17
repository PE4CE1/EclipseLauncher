import { nonSteamProcess } from '../src/services/nonSteamGames'

export interface GameCandidate { name: string; exe: string; pid: number; bootstrap?: boolean }

export function executableName(value: string): string {
  return value.replace(/\\/g, '/').split('/').pop()?.trim().toLowerCase() || ''
}

export function parseProcessSnapshot(csv: string): Map<string, number[]> {
  const processes = new Map<string, number[]>()
  for (const line of csv.split(/\r?\n/)) {
    const match = /^"((?:[^"]|"")+)","(\d+)"(?:,|$)/.exec(line.trim())
    if (!match) continue
    const exe = executableName(match[1].replace(/""/g, '"'))
    const pid = Number(match[2])
    if (!exe.endsWith('.exe') || !Number.isSafeInteger(pid) || pid <= 0) continue
    const pids = processes.get(exe) || []
    pids.push(pid)
    processes.set(exe, pids)
  }
  return processes
}

export function identifyGameProcess(exe: string, fallback?: string): { name: string; bootstrap: boolean } | undefined {
  // SteamVR services outlive VR games; their compositor alone is not gameplay.
  if (['vrcompositor.exe', 'vrserver.exe', 'vrmonitor.exe', 'vrdashboard.exe', 'vrwebhelper.exe', 'vrstartup.exe'].includes(executableName(exe))) return
  const known = nonSteamProcess(exe)
  if (known) return { name: known.game.name, bootstrap: known.bootstrap }
  // These are launchers, never proof that a League match is running.
  if (['leagueclient.exe', 'leagueclientux.exe', 'riotclientservices.exe'].includes(exe)) return
  return fallback ? { name: fallback, bootstrap: false } : undefined
}

export function selectGameProcess(candidates: GameCandidate[], previousExes: Set<string>, current: { name: string; exeName: string; startTime: number } | null, currentPid: number, now: number): GameCandidate | undefined {
  const eligible = candidates.filter(candidate => {
    if (!candidate.bootstrap) return true
    // Launchers and anti-cheat wrappers can outlive the game. They may start a
    // short loading session, but cannot keep an already closed game alive.
    if (current?.name === candidate.name) return !!nonSteamProcess(current.exeName)?.bootstrap && now - current.startTime < 90_000
    return !current && !previousExes.has(candidate.exe)
  })
  const score = (game: GameCandidate) =>
    (game.bootstrap ? -10 : 0) +
    (previousExes.size > 0 && !previousExes.has(game.exe) ? 4 : 0) +
    (game.name === current?.name ? 2 : 0) +
    (game.exe === current?.exeName && game.pid === currentPid ? 1 : 0)
  return eligible.sort((a, b) => score(b) - score(a))[0]
}
