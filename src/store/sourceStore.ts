import { parseHydraSource } from '../services/sourceValidation'
import { normalizeSourceUrl, parseSourceUrls, sourceKey } from '../services/sourceUrls'
import { createConcurrentQueue } from '../services/concurrentQueue'
import { desktopFetch } from '../services/httpClient'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadSource, FetchSourceResult } from '../types/source'
import kaosSource from '../assets/kaos.json'

export const DEFAULT_SOURCES: string[] = []
interface SourceStore {
  sources: DownloadSource[]
  addSource: (url: string) => Promise<void>
  replaceSource: (oldUrl: string, newUrl: string) => Promise<void>
  addRawSource: (jsonContent: string) => Promise<void>
  removeSource: (url: string) => void
  removeAllSources: () => void
  syncSource: (url: string) => Promise<void>
  syncAll: () => Promise<void>
  loadFromDiskCache: () => Promise<void>
  initializeDefaults: () => void
}
const queue = createConcurrentQueue(3)
const pending = new Map<string, Promise<void>>(), revisions = new Map<string, symbol>()
const keyOf = (url: string) => { try { return sourceKey(url) } catch { return url.trim() } }

export const useSourceStore = create<SourceStore>()(persist((set, get) => ({
  sources: [],
  initializeDefaults: () => { if (!get().sources.length) void get().addRawSource(JSON.stringify(kaosSource)).catch(console.error) },
  loadFromDiskCache: async () => {
    if (!window.electronAPI?.getCachedSources) return
    try {
      const cache = new Map((await window.electronAPI.getCachedSources()).map(source => [keyOf(source.url), source]))
      set(state => ({ sources: state.sources.map(source => {
        const hit = cache.get(keyOf(source.url))
        if (!hit || !Array.isArray(hit.data) || (source.lastSynced || 0) > hit.lastSynced || source.status === 'syncing') return source
        return { ...source, name: hit.name || source.name, data: hit.data, optionsCount: hit.data.length, lastSynced: hit.lastSynced,
          status: source.lastError ? 'cached' : 'up_to_date' }
      }) }))
    } catch (error) { console.warn('[SourceStore] Cache could not be loaded', error) }
  },
  addSource: async input => {
    const urls = parseSourceUrls(input).filter(url => !get().sources.some(source => keyOf(source.url) === url))
    set(state => ({ sources: [...state.sources, ...urls.map(url => ({ url, name: new URL(url).pathname.split('/').pop()?.replace(/\.json$/i, '') || 'Source', status: 'pending' as const, optionsCount: 0, data: [] }))] }))
    await Promise.allSettled(urls.map(url => get().syncSource(url)))
  },
  addRawSource: async content => {
    const source = parseHydraSource(JSON.parse(content.replace(/^\uFEFF/, '')))
    const url = `local://${source.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`
    const saved = await window.electronAPI?.saveRawSourceToCache?.(url, source.name, source.downloads)
    if (saved && !saved.success) throw new Error('Local source could not be saved')
    revisions.set(url, Symbol()); pending.delete(url)
    const next: DownloadSource = { url, name: source.name, data: source.downloads, optionsCount: source.downloads.length, lastSynced: Date.now(), status: 'up_to_date' }
    set(state => ({ sources: state.sources.some(item => item.url === url) ? state.sources.map(item => item.url === url ? next : item) : [...state.sources, next] }))
  },
  replaceSource: async (oldUrl, newUrl) => {
    const key = keyOf(oldUrl), url = normalizeSourceUrl(newUrl)
    const previous = get().sources.find(source => keyOf(source.url) === key)
    if (!previous || key === url) return
    const revision = Symbol(); revisions.set(key, revision)
    const live = () => revisions.get(key) === revision && get().sources.some(source => keyOf(source.url) === key)
    set(state => ({sources:state.sources.map(source => keyOf(source.url) === key ? {...source,status:'syncing'} : source)}))
    try {
      const result = await queue.run(async () => {
        if (window.electronAPI?.fetchAndCacheSource) return window.electronAPI.fetchAndCacheSource(url)
        const response = await desktopFetch(url, {signal:AbortSignal.timeout(60_000)})
        if (!response.ok) throw Error('Source returned HTTP ' + response.status)
        const parsed = parseHydraSource(JSON.parse((await response.text()).replace(/^\uFEFF/,'')))
        return {success:true,name:parsed.name,data:parsed.downloads,lastSynced:Date.now()} as FetchSourceResult
      })
      if (!live()) return
      if (!result.success || result.stale || !Array.isArray(result.data) || !result.data.length) throw Error(result.error || 'The replacement source did not return current entries')
      const parsed = parseHydraSource({name:result.name,downloads:result.data})
      if (!parsed.downloads.length) throw Error('The replacement source contains no usable entries')
      const next: DownloadSource = {url,name:parsed.name,data:parsed.downloads,optionsCount:parsed.downloads.length,status:'up_to_date',lastSynced:result.lastSynced || Date.now()}
      // An older sync of an already imported destination must not overwrite this validated replacement.
      revisions.delete(url); pending.delete(url)
      set(state => ({sources:state.sources.filter(source => keyOf(source.url) !== url).map(source => keyOf(source.url) === key ? next : source)}))
      revisions.delete(key)
    } catch (error) {
      if (live()) set(state => ({sources:state.sources.map(source => keyOf(source.url) === key ? {...previous} : source)}))
      throw error
    }
  },
  removeSource: url => {
    const key = keyOf(url); revisions.delete(key); pending.delete(key)
    void window.electronAPI?.clearSourceCache?.(url).catch(() => {})
    set(state => ({ sources: state.sources.filter(source => keyOf(source.url) !== key) }))
  },
  removeAllSources: () => {
    revisions.clear(); pending.clear()
    void window.electronAPI?.clearSourceCache?.().catch(() => {})
    set({ sources: [] })
  },
  syncSource: rawUrl => {
    const key = keyOf(rawUrl), existing = pending.get(key)
    if (existing) return existing
    if (!get().sources.some(source => keyOf(source.url) === key)) return Promise.resolve()
    const revision = Symbol(); revisions.set(key, revision)
    const live = () => revisions.get(key) === revision && get().sources.some(source => keyOf(source.url) === key)
    const update = (patch: Partial<DownloadSource>) => { if (live()) set(state => ({ sources: state.sources.map(source => keyOf(source.url) === key ? { ...source, ...patch } : source) })) }
    const task = queue.run(async () => {
      if (!live()) return
      update({ status: 'syncing' })
      try {
        if (key.startsWith('local://')) {
          const cache = (await window.electronAPI?.getCachedSources?.())?.find(source => keyOf(source.url) === key)
          if (!cache) throw new Error('Local source cache is missing; import the JSON file again')
          update({ name: cache.name, data: cache.data, optionsCount: cache.data.length, lastSynced: cache.lastSynced, status: 'up_to_date', lastError: undefined }); return
        }
        const url = normalizeSourceUrl(key)
        let result: FetchSourceResult
        if (window.electronAPI?.fetchAndCacheSource) result = await window.electronAPI.fetchAndCacheSource(url)
        else {
          const response = await desktopFetch(url, { headers: { Accept: 'application/json, text/plain;q=0.9' }, signal: AbortSignal.timeout(60_000) })
          if (!response.ok) throw new Error('Source returned HTTP ' + response.status)
          const parsed = parseHydraSource(JSON.parse((await response.text()).replace(/^\uFEFF/, '')))
          result = { success: true, name: parsed.name, data: parsed.downloads, lastSynced: Date.now() }
        }
        if (!result?.success || !Array.isArray(result.data)) throw new Error(result?.error || 'Source could not be loaded')
        update({ name: result.name || 'Source', data: result.data, optionsCount: result.data.length, lastSynced: result.lastSynced || (result.stale ? get().sources.find(source => keyOf(source.url) === key)?.lastSynced : Date.now()), status: result.stale ? 'cached' : 'up_to_date', lastError: result.error })
      } catch (error) {
        const source = get().sources.find(source => keyOf(source.url) === key)
        update({ status: source?.lastSynced !== undefined || source?.data.length ? 'cached' : 'error', lastError: error instanceof Error ? error.message : 'Source could not be loaded' })
      }
    }).finally(() => { if (pending.get(key) === task) pending.delete(key) })
    pending.set(key, task)
    return task
  },
  syncAll: async () => { await Promise.allSettled(get().sources.map(source => get().syncSource(source.url))) },
}), {
  name: 'eclipse-sources',
  partialize: state => ({ sources: state.sources.map(source => ({ url: source.url, name: source.name, status: source.status === 'syncing' ? 'pending' : source.status, lastError: source.lastError, optionsCount: source.optionsCount, lastSynced: source.lastSynced, data: [] })) }),
  onRehydrateStorage: () => state => { if (state) void state.loadFromDiskCache() },
}))
