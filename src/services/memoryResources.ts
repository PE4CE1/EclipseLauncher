export interface MemoryPressureContext { catalogueActive: boolean }
const resources = new Map<string, (context: MemoryPressureContext) => void>()

export function registerMemoryResource(key: string, release: (context: MemoryPressureContext) => void): () => void {
  resources.set(key, release)
  return () => { if (resources.get(key) === release) resources.delete(key) }
}

/** Only release already-loaded resources; importing caches to clear them allocates new data. */
export function releaseMemoryResources(context: MemoryPressureContext): void {
  for (const release of resources.values()) {
    try { release(context) } catch (error) { console.warn('[Memory] Could not release an unused resource:', error) }
  }
}
