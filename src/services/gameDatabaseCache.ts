import { registerMemoryResource } from './memoryResources'

export interface GameDBEntry {
  id: number
  name: string
  developer: string
  publisher: string
  positive: number
  negative: number
  price: string
  initialprice: string
  discount: string
  ccu: number
  year?: number
}
export interface GameDatabase { db: GameDBEntry[]; devs: string[]; pubs: string[] }

let cached: GameDatabase | null = null
let pending: Promise<GameDatabase> | null = null
let readers = 0, releaseRequested = false

export function peekGameDatabase(): GameDatabase | null { return cached }
export function retainGameDatabase(): () => void {
  readers++
  let released = false
  return () => {
    if (released) return
    released = true; readers--
    if (!readers && releaseRequested) cached = null
  }
}
export function releaseInactiveGameDatabase(): boolean {
  releaseRequested = true
  if (readers) return false
  const retained = cached !== null
  cached = null
  return retained
}
export function loadGameDatabase(factory: () => Promise<GameDatabase>): Promise<GameDatabase> {
  if (cached) return Promise.resolve(cached)
  if (pending) return pending
  const work = Promise.resolve().then(factory).then(value => { cached = value; return value }).finally(() => {
    // A resolved module-level promise retains its result as strongly as the
    // cache itself. Clear both references when the catalogue is unused.
    if (pending === work) pending = null
    if (!readers && releaseRequested) cached = null
  })
  pending = work
  return work
}
registerMemoryResource('catalogue-database', () => { releaseInactiveGameDatabase() })
