import { useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { findSteamIdByName } from '../services/steamService'
import type { InstalledGame } from '../types/game'

const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

function deduplicateInstalledGames(games: InstalledGame[]): InstalledGame[] {
  const map = new Map<string, InstalledGame>()
  for (const game of games) {
    if (!game || !game.name) continue
    const normName = normalize(game.name)
    const key = game.appId ? `app_${game.appId}` : `name_${normName}`
    
    if (map.has(key) || map.has(`name_${normName}`)) {
      const existing = map.get(key) || map.get(`name_${normName}`)!
      const merged: InstalledGame = {
        ...existing,
        ...game,
        appId: existing.appId || game.appId,
        installed: existing.installed || game.installed,
        installPath: existing.installPath || game.installPath,
        launchUrl: existing.launchUrl || game.launchUrl,
        playTimeMinutes: Math.max(existing.playTimeMinutes || 0, game.playTimeMinutes || 0),
        lastPlayed: Math.max(existing.lastPlayed || 0, game.lastPlayed || 0),
      }
      map.set(key, merged)
      map.set(`name_${normName}`, merged)
    } else {
      map.set(key, game)
      map.set(`name_${normName}`, game)
    }
  }
  return Array.from(new Set(map.values()))
}

export function preloadLibraryCovers(games: InstalledGame[], maxCount = 50) {
  const top = games.slice(0, maxCount)
  for (const g of top) {
    const id = g.steamId || (g.appId ? Number(g.appId) : null)
    if (id && !isNaN(id)) {
      const img = new Image()
      img.src = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`
    }
  }
}

export function useScanner() {
  const { setInstalledGames, setIsScanning, setScanMessage } = useGameStore()
  const { showNotification } = useUIStore()

  const scan = useCallback(async (options?: { signal?: AbortSignal; awaitEnrichment?: boolean; onProgress?: (msg: string, percent?: number) => void }) => {
    if (!window.electronAPI) {
      console.warn('[useScanner] electronAPI not available — running in browser mode')
      setInstalledGames([])
      return []
    }

    const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'

    setIsScanning(true)
    const initialMsg = lang === 'de' ? 'Scanne Spiele-Bibliothek…' : 'Scanning game library…'
    setScanMessage(initialMsg)
    options?.onProgress?.(initialMsg, 30)

    const unsubscribe = window.electronAPI.onScanProgress((progress) => {
      setScanMessage(progress.message)
      options?.onProgress?.(progress.message)
    })

    try {
      const result = await window.electronAPI.scanGames()
      if (result.success) {
        let initialGames = deduplicateInstalledGames(result.games)
        const { scanUninstalledSteam } = useGameStore.getState().settings
        if (!scanUninstalledSteam) {
          initialGames = initialGames.filter(g => g.installed !== false)
        }
        
        const diskPlaytime: Record<string, any> = window.electronAPI?.getPlaytime ? await window.electronAPI.getPlaytime().catch(() => ({})) : {}
        const existingGames = useGameStore.getState().installedGames
        const mergeGames = (gamesToMerge: any[]) => gamesToMerge.map(g => {
          const norm = normalize(g.name)
          const disk = diskPlaytime ? (diskPlaytime[norm] || (g.steamId ? diskPlaytime[`steam_${g.steamId}`] : null) || diskPlaytime[g.id]) : null
          const ext = existingGames.find(e => (e.id && e.id === g.id) || normalize(e.name) === norm)
          
          const maxPlaytime = Math.max(
            g.playTimeMinutes || 0,
            ext?.playTimeMinutes || 0,
            disk?.playTimeMinutes || 0
          )
          const maxLastPlayed = Math.max(
            g.lastPlayed || 0,
            ext?.lastPlayed || 0,
            disk?.lastPlayed || 0
          )

          return { ...g, playTimeMinutes: maxPlaytime, lastPlayed: maxLastPlayed || undefined }
        })
        
        const mergedInitial = deduplicateInstalledGames(mergeGames(initialGames))
        setInstalledGames(mergedInitial)
        
        // Immediately preload library covers into memory cache
        preloadLibraryCovers(mergedInitial, 80)

        // Background name resolution (does not block splash screen)
        enrichWithSteamIds(result.games, (msg) => {
          // Keep internal background log without spamming splash UI
        }, options?.signal)
          .then((enriched) => {
            let uniqueGames = deduplicateInstalledGames(enriched)
            if (!useGameStore.getState().settings.scanUninstalledSteam) {
              uniqueGames = uniqueGames.filter(g => g.installed !== false)
            }
            const finalGames = deduplicateInstalledGames(mergeGames(uniqueGames))
            setInstalledGames(finalGames)
            preloadLibraryCovers(finalGames, 80)
            setScanMessage('')
          })
          .catch(err => console.error('[useScanner] Background enrich failed', err))

        setIsScanning(false)
        setScanMessage('')
        return mergedInitial
      } else {
        setIsScanning(false)
        setScanMessage('')
        showNotification(result.error || (lang === 'de' ? 'Scan fehlgeschlagen' : 'Scan failed'), 'error')
        return []
      }
    } catch (err) {
      showNotification(lang === 'de' ? 'Fehler beim Scannen der Spiele' : 'Scan encountered an error', 'error')
      console.error('[useScanner]', err)
      setIsScanning(false)
      setScanMessage('')
      return []
    } finally {
      unsubscribe?.()
    }
  }, [setInstalledGames, setIsScanning, setScanMessage, showNotification])

  const launchGame = useCallback(async (launchUrl: string, gameName: string) => {
    if (!window.electronAPI) return
    const { autoMinimizeOnGame } = useGameStore.getState().settings
    if (autoMinimizeOnGame && window.electronAPI.minimizeWindow) {
      window.electronAPI.minimizeWindow()
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
        const steamId = (r.status === 'fulfilled' && r.value) ? r.value : g.steamId
        enriched.push({ ...g, steamId: g.steamId || steamId })
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
