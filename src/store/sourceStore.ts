import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadSource, HydraSourceData } from '../types/source'

const DEFAULT_SOURCES = [
  'https://hydralinks.cloud/sources/rexagames.json',
  'https://wkeynhk.online/steamgg.json',
  'https://davidkazumisource.com/fontekazumi.json',
  'https://hydralinks.cloud/sources/kaoskrew.json',
  'https://hydralinks.cloud/sources/empress.json',
  'https://hydralinks.cloud/sources/xatab.json',
  'https://hydralinks.cloud/sources/atop-games.json',
  'https://hydralinks.cloud/sources/dodi.json',
  'https://hydralinks.cloud/sources/onlinefix.json',
  'https://hydralinks.cloud/sources/gog.json',
  'https://hydralinks.cloud/sources/fitgirl.json',
  'https://hydralinks.cloud/sources/steamrip.json',
]

interface SourceStore {
  sources: DownloadSource[]
  addSource: (url: string) => void
  removeSource: (url: string) => void
  removeAllSources: () => void
  syncSource: (url: string) => Promise<void>
  syncAll: () => Promise<void>
  initializeDefaults: () => void
}

export const useSourceStore = create<SourceStore>()(
  persist(
    (set, get) => ({
      sources: [],
      initializeDefaults: () => {
        const current = get().sources;
        if (current.length === 0) {
          const defaults: DownloadSource[] = DEFAULT_SOURCES.map(url => ({
            url,
            name: new URL(url).pathname.split('/').pop()?.replace('.json', '') || 'Unknown',
            status: 'pending',
            optionsCount: 0,
            data: []
          }))
          set({ sources: defaults })
          get().syncAll()
        }
      },
      addSource: (url) => {
        if (get().sources.some(s => s.url === url)) return
        set(state => ({
          sources: [...state.sources, { url, name: 'Unknown', status: 'pending', optionsCount: 0, data: [] }]
        }))
        get().syncSource(url)
      },
      removeSource: (url) => {
        set(state => ({ sources: state.sources.filter(s => s.url !== url) }))
      },
      removeAllSources: () => {
        set({ sources: [] })
      },
      syncSource: async (url) => {
        set(state => ({
          sources: state.sources.map(s => s.url === url ? { ...s, status: 'syncing' } : s)
        }))
        try {
          let jsonText: string | null = null;

          // Attempt normal fetch first
          try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
            if (res.ok) {
              jsonText = await res.text()
            } else {
              throw new Error(`HTTP ${res.status}`)
            }
          } catch (e) {
            // Fallback to Cloudflare bypass via Electron main process
            if (window.electronAPI && window.electronAPI.fetchSourceCF) {
              jsonText = await window.electronAPI.fetchSourceCF(url);
            } else {
              throw e;
            }
          }

          if (!jsonText) throw new Error('Empty response');

          const json = JSON.parse(jsonText) as HydraSourceData
          set(state => ({
            sources: state.sources.map(s => s.url === url ? {
              ...s,
              name: json.name || s.name,
              status: 'up_to_date',
              optionsCount: json.downloads?.length || 0,
              lastSynced: Date.now(),
              data: json.downloads || []
            } : s)
          }))
        } catch (error) {
          console.error(`Failed to sync ${url}:`, error)
          set(state => ({
            sources: state.sources.map(s => s.url === url ? { ...s, status: 'error' } : s)
          }))
        }
      },
      syncAll: async () => {
        const urls = get().sources.map(s => s.url)
        await Promise.allSettled(urls.map(url => get().syncSource(url)))
      }
    }),
    {
      name: 'eclipse-sources',
      partialize: (state) => ({
        // Prevent storing large JSON arrays in localStorage
        sources: state.sources.map(s => ({ ...s, data: [], status: 'pending' }))
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.sources.length > 0) {
          setTimeout(() => state.syncAll(), 500)
        } else if (state) {
          state.initializeDefaults()
        }
      }
    }
  )
)
