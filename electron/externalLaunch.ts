import { spawn } from 'node:child_process'
import { shell } from 'electron'

export interface LaunchedProcess {
  pid?: number
  once(event: string, listener: (...args: any[]) => void): unknown
  unref(): void
}
interface ExternalBroker {
  spawn(executable: string, args: string[], cwd: string): Promise<LaunchedProcess>
  open(url: string): Promise<void>
  relaunch(executable: string, args: string[], cwd: string): Promise<void>
}
let broker: ExternalBroker | null = null
const launches = new Set<Promise<unknown>>()
export async function waitForExternalLaunches(): Promise<void> { await Promise.allSettled([...launches]) }
export function bindExternalLaunchShutdown(application: { on(event: 'before-quit', listener: (event: { preventDefault(): void }) => void): unknown; quit(): void }): void {
  let waiting = false
  application.on('before-quit', event => {
    if (!launches.size) return
    event.preventDefault()
    if (waiting) return
    waiting = true
    void Promise.allSettled([...launches]).finally(() => { waiting = false; application.quit() })
  })
}
export function setExternalBroker(value: ExternalBroker): void { broker = value }
export function hasExternalBroker(): boolean { return broker !== null }
export function openExternalApplication(url: string): Promise<void> {
  return broker ? broker.open(url) : shell.openExternal(url)
}
export async function openExternalPath(target: string): Promise<string> {
  if (!broker) return shell.openPath(target)
  try { await broker.open(target); return '' }
  catch (error) { return error instanceof Error ? error.message : String(error) }
}
export async function spawnExternalApplication(executable: string, args: string[], cwd: string): Promise<LaunchedProcess> {
  if (broker) {
    const work = broker.spawn(executable, args, cwd)
    launches.add(work)
    try { return await work } finally { launches.delete(work) }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => resolve(child))
  })
}
export async function relaunchOutsideMemoryJob(executable: string, args: string[], cwd: string): Promise<boolean> {
  if (!broker) return false
  await broker.relaunch(executable, args, cwd)
  return true
}
