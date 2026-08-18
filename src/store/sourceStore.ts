import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadSource, HydraSourceData } from '../types/source'

export const DEFAULT_SOURCES: string[] = []

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

  // 5. Smart fallback mirror for hydralinks.cloud / hydralinks.pages.dev
  if (url.includes('hydralinks.cloud') || url.includes('hydralinks.pages.dev')) {
    try {
      const mirrorUrl = url.includes('hydralinks.cloud')
        ? url.replace('hydralinks.cloud', 'hydralinks.pages.dev')
        : url.replace('hydralinks.pages.dev', 'hydralinks.cloud')
      const res = await fetch(mirrorUrl)
      if (res.ok) {
        const text = await res.text()
        if (text && text.includes('downloads') && text.length > 50) {
          return text
        }
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
        // No default sources preloaded - user adds custom sources from Eclipse Web Store
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
        if (urls.length > 0) {
          await Promise.allSettled(urls.map(url => get().syncSource(url)))
        }
      }
    }),
    {
      name: 'eclipse-sources',
      partialize: (state) => ({
        // Store metadata without holding huge arrays permanently in localStorage
        sources: state.sources.map(s => ({ ...s, data: [], status: 'pending' }))
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.sources.length > 0) {
          setTimeout(() => state.syncAll(), 300)
        }
      }
    }
  )
)
