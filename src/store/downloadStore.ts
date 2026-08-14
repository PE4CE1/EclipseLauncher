import { create } from 'zustand'

export type TorrentPayload = {
  infoHash: string
  name: string
  progress: number
  downloadSpeed: number
  timeRemaining: number
  downloaded: number
  length: number
  status: 'downloading' | 'paused' | 'extracting' | 'done' | 'error'
  coverUrl?: string
  peers?: number
  mainExe?: string | null
  installPath?: string
}

interface DownloadStore {
  downloads: Record<string, TorrentPayload>
  addDownload: (payload: TorrentPayload) => void
  updateDownload: (payload: TorrentPayload) => void
  removeDownload: (infoHash: string) => void
}

import { useGameStore } from './gameStore'
import { translations, Language } from '../i18n/translations'
import { sendAppNotification } from '../services/notificationService'

export const useDownloadStore = create<DownloadStore>((set) => {
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onTorrentProgress) {
    window.electronAPI.onTorrentProgress((payload: TorrentPayload) => {
      set((state) => {
        const currentPayload = state.downloads[payload.infoHash]
        
        // If it just finished downloading and extracting
        if (currentPayload && currentPayload.status !== 'done' && payload.status === 'done') {
          const gameId = `custom-${Date.now()}`
          useGameStore.getState().addToLibrary({
            id: gameId,
            name: payload.name,
            platform: 'custom',
            installed: true,
            installPath: payload.installPath || currentPayload.installPath,
            launchUrl: payload.mainExe || payload.installPath || currentPayload.installPath,
            coverImage: currentPayload.coverUrl,
            addedAt: Date.now(),
            isFavorite: false
          })
          
          const lang = (useGameStore.getState().settings.language === 'de' ? 'de' : 'en') as Language
          const readyText = (translations[lang].readyToPlay || translations.en.readyToPlay).replace('{name}', payload.name)
          const title = lang === 'de' ? 'Download abgeschlossen' : 'Download Complete'
          
          sendAppNotification({
            title,
            body: readyText,
            type: 'success',
            playSound: true,
          })
        }

        return {
          downloads: {
            ...state.downloads,
            [payload.infoHash]: {
              ...(currentPayload || {}),
              ...payload,
            }
          }
        }
      })
    })
  }

  return {
    downloads: {},
    addDownload: (payload) => set(state => ({
      downloads: { ...state.downloads, [payload.infoHash]: payload }
    })),
    updateDownload: (payload) => set(state => ({
      downloads: {
        ...state.downloads,
        [payload.infoHash]: { ...(state.downloads[payload.infoHash] || {}), ...payload }
      }
    })),
    removeDownload: (infoHash) => set(state => {
      const newDownloads = { ...state.downloads }
      delete newDownloads[infoHash]
      return { downloads: newDownloads }
    })
  }
})
