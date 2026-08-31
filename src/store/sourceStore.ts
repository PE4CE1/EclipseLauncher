import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadSource, HydraSourceData, HydraDownload } from '../types/source'

import kaosSource from '../assets/kaos.json'

export const DEFAULT_SOURCES: string[] = []

interface SourceStore {
  sources: DownloadSource[]
  addSource: (url: string) => Promise<void>
  addRawSource: (jsonContent: string) => Promise<void>
  removeSource: (url: string) => void
  removeAllSources: () => void
  syncSource: (url: string) => Promise<void>
  syncAll: () => Promise<void>
  loadFromDiskCache: () => Promise<void>
  initializeDefaults: () => void
}

export const useSourceStore = create<SourceStore>()(
  persist(
    (set, get) => ({
      sources: [],
      initializeDefaults: () => {
        if (get().sources.length === 0) {
          get().addRawSource(JSON.stringify(kaosSource)).catch(console.error)
        }
      },

      loadFromDiskCache: async () => {
        if (typeof window === 'undefined' || !window.electronAPI?.getCachedSources) return
        try {
          const cachedList = await window.electronAPI.getCachedSources()
          if (!Array.isArray(cachedList) || cachedList.length === 0) return

          const cacheMap = new Map(cachedList.map(c => [c.url.trim().toLowerCase(), c]))

          set(state => ({
            sources: state.sources.map(s => {
              const hit = cacheMap.get(s.url.trim().toLowerCase())
              if (hit && Array.isArray(hit.data) && hit.data.length > 0) {
                return {
                  ...s,
                  name: hit.name || s.name,
                  status: 'up_to_date',
                  optionsCount: hit.data.length,
                  lastSynced: hit.lastSynced || s.lastSynced || Date.now(),
                  data: hit.data as HydraDownload[]
                }
              }
              return s
            })
          }))
        } catch (e) {
          console.warn('[SourceStore] Failed to load disk cache:', e)
        }
      },

      addSource: async (url) => {
        const trimmed = url.trim()
        if (!trimmed || get().sources.some(s => s.url === trimmed)) return
        const name = new URL(trimmed).pathname.split('/').pop()?.replace('.json', '') || 'Source'
        
        set(state => ({
          sources: [...state.sources, { url: trimmed, name, status: 'syncing', optionsCount: 0, data: [] }]
        }))

        await get().syncSource(trimmed)
      },

      addRawSource: async (jsonContent: string) => {
        try {
          const json = JSON.parse(jsonContent) as HydraSourceData
          if (!json.name || !Array.isArray(json.downloads)) {
            throw new Error('Invalid JSON format. Expected "name" and "downloads" array.')
          }
          const fakeUrl = `local://${json.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`
          const currentSources = get().sources
          
          if (typeof window !== 'undefined' && window.electronAPI?.saveRawSourceToCache) {
            await window.electronAPI.saveRawSourceToCache(fakeUrl, json.name, json.downloads)
          }

          if (currentSources.some(s => s.url === fakeUrl)) {
            set(state => ({
              sources: state.sources.map(s => s.url === fakeUrl ? {
                ...s,
                name: json.name,
                status: 'up_to_date',
                optionsCount: json.downloads.length,
                lastSynced: Date.now(),
                data: json.downloads
              } : s)
            }))
          } else {
            set(state => ({
              sources: [...state.sources, { 
                url: fakeUrl, 
                name: json.name, 
                status: 'up_to_date', 
                optionsCount: json.downloads.length, 
                data: json.downloads,
                lastSynced: Date.now()
              }]
            }))
          }
        } catch (err) {
          console.error('[SourceStore] Failed to parse and add raw source:', err)
          throw err
        }
      },

      removeSource: (url) => {
        if (typeof window !== 'undefined' && window.electronAPI?.clearSourceCache) {
          window.electronAPI.clearSourceCache(url).catch(() => {})
        }
        set(state => ({ sources: state.sources.filter(s => s.url !== url) }))
      },

      removeAllSources: () => {
        if (typeof window !== 'undefined' && window.electronAPI?.clearSourceCache) {
          window.electronAPI.clearSourceCache().catch(() => {})
        }
        set({ sources: [] })
      },

      syncSource: async (url) => {
        const trimmed = url.trim()
        const currentSource = get().sources.find(s => s.url === trimmed)

        set(state => ({
          sources: state.sources.map(s => s.url === trimmed ? { ...s, status: 'syncing' } : s)
        }))

        try {
          // 1. Electron fetch & cache pipeline
          if (typeof window !== 'undefined' && window.electronAPI?.fetchAndCacheSource) {
            const res = await window.electronAPI.fetchAndCacheSource(trimmed)
            if (res && res.success && Array.isArray(res.data)) {
              set(state => ({
                sources: state.sources.map(s => s.url === trimmed ? {
                  ...s,
                  name: res.name || s.name,
                  status: 'up_to_date',
                  optionsCount: res.data!.length,
                  lastSynced: Date.now(),
                  data: res.data as HydraDownload[]
                } : s)
              }))
              return
            }
          }

          // 2. Direct fetch fallback (for browser/preview mode)
          const resp = await fetch(trimmed, {
            headers: { 'Accept': 'application/json, text/plain, */*' }
          })
          if (resp.ok) {
            const json = await resp.json() as HydraSourceData
            const downloads = Array.isArray(json.downloads) ? json.downloads : []
            set(state => ({
              sources: state.sources.map(s => s.url === trimmed ? {
                ...s,
                name: json.name || s.name,
                status: 'up_to_date',
                optionsCount: downloads.length,
                lastSynced: Date.now(),
                data: downloads
              } : s)
            }))
            return
          }

          throw new Error('Fetch failed')
        } catch (error) {
          console.warn(`[SourceStore] Sync error for ${trimmed}:`, error)
          
          // If we already have valid data in memory or disk cache, keep it active and marked up_to_date!
          if (currentSource && currentSource.data && currentSource.data.length > 0) {
            set(state => ({
              sources: state.sources.map(s => s.url === trimmed ? {
                ...s,
                status: 'up_to_date',
                optionsCount: s.data.length
              } : s)
            }))
          } else {
            set(state => ({
              sources: state.sources.map(s => s.url === trimmed ? { ...s, status: 'error' } : s)
            }))
          }
        }
      },

      syncAll: async () => {
        const urls = get().sources.map(s => s.url)
        if (urls.length > 0) {
          await Promise.allSettled(urls.map(url => get().syncSource(url)))
        }
      }
    }),
    {
      name: 'eclipse-sources',
      partialize: (state) => ({
        // Keep metadata in localStorage, actual large payloads live in fast disk cache
        sources: state.sources.map(s => ({
          url: s.url,
          name: s.name,
          status: s.status === 'up_to_date' ? 'up_to_date' : 'pending',
          optionsCount: s.optionsCount || 0,
          lastSynced: s.lastSynced,
          data: []
        }))
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Immediately load cached games from disk on startup without blocking UI
          state.loadFromDiskCache()
        }
      }
    }
  )
)
