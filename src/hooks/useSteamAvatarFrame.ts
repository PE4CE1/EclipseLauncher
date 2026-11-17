import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { profileAvatarFrameValue, readSteamAvatarFrame } from '../services/steamProfileAppearance'
import { profileSocialUrl } from '../services/profileModel'
import { scheduleBackgroundTask } from '../services/startupScheduler'

/** Fill a missing frame once without opening the profile or delaying the first frame. */
export function useSteamAvatarFrame() {
  const profile = useGameStore(state => state.settings.steamProfileUrl)
  const knownFrame = useGameStore(state => state.settings.steamAvatarFrameUrl)
  const mode = useGameStore(state => profileAvatarFrameValue(state.settings))
  useEffect(() => {
    const url = profile ? profileSocialUrl(profile, 'steam') : undefined
    if (mode !== 'steam' || knownFrame !== undefined || !url || !window.electronAPI?.utilFetch) return
    let disposed = false
    const cancel = scheduleBackgroundTask(async () => {
      try {
        const html = await window.electronAPI!.utilFetch(url.endsWith('/') ? url : `${url}/`)
        if (disposed || typeof html !== 'string' || html.length > 4_000_000 || useGameStore.getState().settings.steamProfileUrl !== profile) return
        const patch = readSteamAvatarFrame(new DOMParser().parseFromString(html, 'text/html'))
        // The full profile sync may have completed while this smaller request was pending.
        if (patch.steamAvatarFrameUrl === undefined || useGameStore.getState().settings.steamAvatarFrameUrl !== undefined) return
        const result = await window.electronAPI?.setSettings?.(patch)
        if (!disposed && result?.success !== false) useGameStore.getState().updateSettings(patch)
      } catch { /* The cached avatar remains usable when Steam is unavailable. */ }
    })
    return () => { disposed = true; cancel() }
  }, [profile, knownFrame, mode])
}
