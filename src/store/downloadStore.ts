import { sampleDownloadSpeed, type DownloadSpeedSample } from '../services/downloadHistory'
import { create } from 'zustand'
import type { DownloadIssue, DownloadIssueCode } from '../types/downloads'

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
  errorMessage?: string
  resolution?: { attempt: number; total: number; host: string }
  mirrorFailures?: DownloadIssue[]
  errorCode?: DownloadIssueCode
  installPath?: string
}

interface DownloadStore {
  downloads: Record<string, TorrentPayload>
  speedHistory: Record<string, DownloadSpeedSample[]>
  addDownload: (payload: TorrentPayload) => void
  updateDownload: (payload: TorrentPayload) => void
  removeDownload: (infoHash: string) => void
}

import { useGameStore } from './gameStore'
import { translate } from '../i18n/translate'
import { sendAppNotification } from '../services/notificationService'

export const useDownloadStore = create<DownloadStore>((set) => {
  const removed = new Set<string>()
  const historyUpdate = (state: DownloadStore, payload: TorrentPayload) => {
    if (payload.status === 'done') { const next = { ...state.speedHistory }; delete next[payload.infoHash]; return next }
    if (payload.resolution || !['downloading', 'paused'].includes(payload.status)) return state.speedHistory
    return { ...state.speedHistory, [payload.infoHash]: sampleDownloadSpeed(state.speedHistory[payload.infoHash] || [], Date.now(), payload.status === 'paused' ? 0 : payload.downloadSpeed) }
  }

  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onTorrentProgress) {
    window.electronAPI.onTorrentProgress((payload: TorrentPayload) => {
      if (removed.has(payload.infoHash)) return
      set((state) => {
        const currentPayload = state.downloads[payload.infoHash]
        
        // If it just finished downloading and extracting
        if (currentPayload && currentPayload.status !== 'done' && payload.status === 'done') {
          const gameId = `custom-${Date.now()}`
          if (payload.mainExe) useGameStore.getState().addToLibrary({
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
          
          const lang = useGameStore.getState().settings.language === 'en' ? 'en' : 'de'
          const readyText = payload.mainExe ? translate(lang, 'readyToPlay', { name: payload.name }) : lang === 'de' ? `${payload.name} wurde heruntergeladen.` : `${payload.name} has been downloaded.`
          const title = lang === 'de' ? 'Download abgeschlossen' : 'Download Complete'
          
          sendAppNotification({
            title,
            body: readyText,
            type: 'success',
            playSound: true,
          })
        }

        return {
          speedHistory: historyUpdate(state, payload),
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
    downloads: {}, speedHistory: {},
    addDownload: (payload) => {
      removed.delete(payload.infoHash)
      set(state => ({ downloads: { ...state.downloads, [payload.infoHash]: { ...payload, ...state.downloads[payload.infoHash], coverUrl: payload.coverUrl || state.downloads[payload.infoHash]?.coverUrl } } }))
    },
    updateDownload: (payload) => {
      if (removed.has(payload.infoHash)) return
      set(state => ({ speedHistory: historyUpdate(state, payload), downloads: { ...state.downloads, [payload.infoHash]: { ...state.downloads[payload.infoHash], ...payload } } }))
    },
    removeDownload: (infoHash) => {
      removed.add(infoHash)
      // Bound the late-event guard independently of the visible task list.
      if (removed.size > 1024) removed.delete(removed.values().next().value!)
      set(state => {
        const downloads = { ...state.downloads }, speedHistory = { ...state.speedHistory }
        delete downloads[infoHash]; delete speedHistory[infoHash]
        return { downloads, speedHistory }
      })
    },
  }
})
