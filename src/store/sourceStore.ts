import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadSource, HydraSourceData } from '../types/source'

export const DEFAULT_SOURCES = [
  'https://hydralinks.cloud/sources/fitgirl.json',
  'https://hydralinks.cloud/sources/steamrip.json',
  'https://hydralinks.cloud/sources/xatab.json',
  'https://hydralinks.cloud/sources/onlinefix.json',
  'https://hydralinks.cloud/sources/dodi.json',
  'https://wkeynhk.online/steamgg.json',
  'https://hydralinks.pages.dev/sources/gog.json',
  'https://hydralinks.pages.dev/sources/kaoskrew.json',
  'https://hydralinks.pages.dev/sources/empress.json',
  'https://hydralinks.pages.dev/sources/atop-games.json',
  'https://hydralinks.pages.dev/sources/rexagames.json',
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

async function fetchSourceContent(url: string): Promise<string | null> {
  const isCloudflareDomain = url.includes('hydralinks.cloud')

  // 1. If Cloudflare protected domain, use Electron Turnstile solver directly
  if (isCloudflareDomain && typeof window !== 'undefined' && window.electronAPI?.fetchSourceCF) {
    try {
      const text = await window.electronAPI.fetchSourceCF(url)
      if (text && text.includes('downloads') && text.length > 50) {
        return text
      }
    } catch {}
  }

  // 2. Direct native fetch
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    })
    if (res.ok) {
      const text = await res.text()
      if (text && text.includes('downloads') && text.length > 50) {
        return text
      }
    }
  } catch {}

  // 3. Electron util:fetch (Native Chromium Stack)
  if (typeof window !== 'undefined' && window.electronAPI?.utilFetch) {
    try {
      const text = await window.electronAPI.utilFetch(url)
      if (text && text.includes('downloads') && text.length > 50) {
        return text
      }
    } catch {}
  }

  // 4. Electron fetchSourceCF fallback
  if (typeof window !== 'undefined' && window.electronAPI?.fetchSourceCF) {
    try {
      const text = await window.electronAPI.fetchSourceCF(url)
      if (text && text.includes('downloads') && text.length > 50) {
        return text
      }
    } catch {}
  }

  return null
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
            name: new URL(url).pathname.split('/').pop()?.replace('.json', '') || 'Source',
            status: 'pending',
            optionsCount: 0,
            data: []
          }))
          set({ sources: defaults })
          get().syncAll()
        }
      },
      addSource: (url) => {
        const trimmed = url.trim()
        if (!trimmed || get().sources.some(s => s.url === trimmed)) return
        const name = new URL(trimmed).pathname.split('/').pop()?.replace('.json', '') || 'Source'
        set(state => ({
          sources: [...state.sources, { url: trimmed, name, status: 'pending', optionsCount: 0, data: [] }]
        }))
        get().syncSource(trimmed)
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
          const jsonText = await fetchSourceContent(url)
          if (!jsonText) throw new Error('Could not fetch source JSON')

          const json = JSON.parse(jsonText) as HydraSourceData
          const downloads = Array.isArray(json.downloads) ? json.downloads : []
          
          set(state => ({
            sources: state.sources.map(s => s.url === url ? {
              ...s,
              name: json.name || s.name,
              status: 'up_to_date',
              optionsCount: downloads.length,
              lastSynced: Date.now(),
              data: downloads
            } : s)
          }))
        } catch (error) {
          console.error(`[SourceStore] Failed to sync ${url}:`, error)
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
        // Store metadata without holding huge arrays permanently in localStorage
        sources: state.sources.map(s => ({ ...s, data: [], status: 'pending' }))
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Auto migrate any old un-synced or blocked URLs
          if (state.sources.length > 0) {
            const migrated = state.sources.map(s => {
              if (s.url.includes('hydralinks.cloud/sources/')) {
                return { ...s, url: s.url.replace('hydralinks.cloud/sources/', 'hydralinks.pages.dev/sources/') }
              }
              return s
            })
            // Remove completely defunct 404 dead links
            const valid = migrated.filter(s => 
              !s.url.includes('davidkazumisource.com') && 
              !s.url.includes('fitgirl.json') && 
              !s.url.includes('dodi.json') && 
              !s.url.includes('steamrip.json') && 
              !s.url.includes('onlinefix.json') && 
              !s.url.includes('xatab.json')
            )
            // Ensure all working defaults are present
            DEFAULT_SOURCES.forEach(defUrl => {
              if (!valid.some(s => s.url === defUrl)) {
                valid.push({
                  url: defUrl,
                  name: new URL(defUrl).pathname.split('/').pop()?.replace('.json', '') || 'Source',
                  status: 'pending',
                  optionsCount: 0,
                  data: []
                })
              }
            })

            state.sources = valid
            setTimeout(() => state.syncAll(), 200)
          } else {
            state.initializeDefaults()
          }
        }
      }
    }
  )
)
