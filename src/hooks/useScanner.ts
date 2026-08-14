import { useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { findSteamIdByName } from '../services/steamService'
import type { InstalledGame } from '../types/game'

export function useScanner() {
  const { setInstalledGames, setIsScanning, setScanMessage } = useGameStore()
  const { showNotification } = useUIStore()

  const scan = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!window.electronAPI) {
      console.warn('[useScanner] electronAPI not available — running in browser mode')
      setInstalledGames([])
      return
    }

    setIsScanning(true)
    setScanMessage('Starting game scan…')

    const unsubscribe = window.electronAPI.onScanProgress((progress) => {
      setScanMessage(progress.message)
    })

    try {
      const result = await window.electronAPI.scanGames()
      if (result.success) {
        // First, set games immediately so the UI can load and Splash screen can close!
        let initialGames = Array.from(
          new Map(result.games.map(game => [game.id || game.name, game])).values()
        )
        const { scanUninstalledSteam } = useGameStore.getState().settings
        if (!scanUninstalledSteam) {
          initialGames = initialGames.filter(g => g.installed !== false)
        }
        
        const existingGames = useGameStore.getState().installedGames
        const mergeGames = (gamesToMerge: any[]) => gamesToMerge.map(g => {
          const ext = existingGames.find(e => (e.id && e.id === g.id) || e.name === g.name)
          if (ext) {
            return { ...g, playTimeMinutes: ext.playTimeMinutes, lastPlayed: ext.lastPlayed }
          }
          return g
        })
        
        setInstalledGames(mergeGames(initialGames))
        
        // Hide scanning UI for the background fetch
        setIsScanning(false)
        setScanMessage('Resolving Steam metadata…')

        // Fetch names in the background WITHOUT blocking the function return
        enrichWithSteamIds(result.games, (msg) => setScanMessage(msg), options?.signal)
          .then((enriched) => {
            let uniqueGames = Array.from(
              new Map(enriched.map(game => [game.id || game.name, game])).values()
            )
            if (!useGameStore.getState().settings.scanUninstalledSteam) {
              uniqueGames = uniqueGames.filter(g => g.installed !== false)
            }
            setInstalledGames(mergeGames(uniqueGames))
            showNotification(`Found ${uniqueGames.length} games`, 'success')
            setScanMessage('')
          })
          .catch(err => console.error('[useScanner] Background enrich failed', err))
      } else {
        setIsScanning(false)
        setScanMessage('')
        showNotification(result.error || 'Scan failed', 'error')
      }
    } catch (err) {
      showNotification('Scan encountered an error', 'error')
      console.error('[useScanner]', err)
      setIsScanning(false)
      setScanMessage('')
    } finally {
      unsubscribe()
    }
  }, [setInstalledGames, setIsScanning, setScanMessage, showNotification])

  const launchGame = useCallback(async (launchUrl: string, gameName: string) => {
    if (!window.electronAPI) return
    const { hideToTray } = useGameStore.getState().settings
    if (hideToTray && window.electronAPI.hideWindow) {
      window.electronAPI.hideWindow()
    }
    const result = await window.electronAPI.launchGame(launchUrl)
    if (result.success) {
      showNotification(`Launching ${gameName}…`, 'info')
      useGameStore.getState().startPlaySession(launchUrl, gameName)
    } else {
      showNotification(`Failed to launch ${gameName}`, 'error')
    }
  }, [showNotification])

  const addCustomGame = useCallback(async () => {
    if (!window.electronAPI) return null
    return window.electronAPI.openExeDialog()
  }, [])

  return { scan, launchGame, addCustomGame }
}

/**
 * Enriches InstalledGame list with Steam IDs.
 * - Steam games: extract steamId from appId
 * - Epic / custom games: attempt name-based lookup via Steam Store Search API
 */
async function enrichWithSteamIds(
  games: InstalledGame[],
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<InstalledGame[]> {
  const enriched: InstalledGame[] = []

  // Separate steam (already have appId) vs non-steam
  const steamGames   = games.filter(g => g.platform === 'steam')
  const nonSteam     = games.filter(g => g.platform !== 'steam')

  // Steam games: parse appId → steamId, and attempt to resolve fallback names
  const existingGames = useGameStore.getState().installedGames
  const fallbackSteamGames = steamGames.filter(g => {
    if (!g.name.startsWith('Steam App ')) return false
    
    // Check if we already resolved this game's name in a previous scan
    const numId = Number(g.appId)
    const existing = existingGames.find(eg => eg.steamId === numId)
    if (existing && !existing.name.startsWith('Steam App ')) {
      // We already have the real name saved in the store!
      g.name = existing.name
      return false // Skip fetching
    }
    
    return true
  })
  
  const resolvedNames = new Map<number, string>()
  
  if (fallbackSteamGames.length > 0) {
    onProgress(`Resolving ${fallbackSteamGames.length} missing Steam names…`)
    try {
      const { getSteamSpyNames, getSteamAppsDetails } = await import('../services/steamService')
      
      // 1. Try SteamSpy first (fast, covers top 1000)
      const steamSpyNames = await getSteamSpyNames()
      const remainingIds: number[] = []
      
      for (const g of fallbackSteamGames) {
        if (!g.appId) continue
        const numId = Number(g.appId)
        if (steamSpyNames.has(numId)) {
          resolvedNames.set(numId, steamSpyNames.get(numId)!)
        } else {
          remainingIds.push(numId)
        }
      }
      
      // 2. Fetch the rest from Steam AppDetails API in batches
      if (remainingIds.length > 0) {
        onProgress(`Fetching ${remainingIds.length} names from SteamDB directly…`)
        
        // Pass a wrapper to check signal inside getSteamAppsDetails, or just check signal between batches.
        // Actually, getSteamAppsDetails is an external function, so we'll just let it run or we could modify it. 
        // For now, if skipFetchingNames is true initially, we skip.
        // If aborted mid-way, we just break early.
        let isAborted = false
        if (signal) {
          signal.addEventListener('abort', () => { isAborted = true })
        }
        
        const steamDetails = await getSteamAppsDetails(remainingIds, 'english', (done, total) => {
          onProgress(`Fetching names: ${done}/${total} done…`)
        }, signal)
        
        for (const [id, details] of steamDetails.entries()) {
          if (details?.name) {
            resolvedNames.set(id, details.name)
          }
        }
      }
    } catch (err) {
      console.warn('[useScanner] Failed to resolve some Steam names', err)
    }
  }

  for (const g of steamGames) {
    const numId = g.appId ? Number(g.appId) : undefined
    enriched.push({
      ...g,
      name: numId && resolvedNames.has(numId) ? resolvedNames.get(numId)! : g.name,
      steamId: numId,
    })
  }

  // Non-Steam games: try name lookup (rate-limited)
  if (nonSteam.length > 0) {
    onProgress(`Looking up ${nonSteam.length} non-Steam games on Steam Store…`)
    const BATCH = 3
    for (let i = 0; i < nonSteam.length; i += BATCH) {
      const batch = nonSteam.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map(g => findSteamIdByName(g.name))
      )
      results.forEach((r, idx) => {
        const g = batch[idx]
        const steamId = r.status === 'fulfilled' ? (r.value ?? undefined) : undefined
        enriched.push({ ...g, steamId })
      })
  if (i + BATCH < nonSteam.length) {
        if (signal?.aborted) break;
        onProgress(`Steam lookup: ${Math.min(i + BATCH, nonSteam.length)}/${nonSteam.length} done…`)
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }
  }

  return enriched
}
