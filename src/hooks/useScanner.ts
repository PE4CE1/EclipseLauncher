import { useCallback } from 'react'
import { getNonSteamGame, repairNonSteamIdentity } from '../services/nonSteamGames'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { findSteamIdByName, getHardcodedSteamId, isPlaceholderAppName, extractAppIdFromPlaceholder, getKnownSteamGameName, resolveSteamAppName, KNOWN_GAME_PREVIEWS } from '../services/steamService'
import type { InstalledGame } from '../types/game'

import { deduplicateByAliases, normalizeGameName as normalize } from '../services/gameDeduplication'
import { translate } from '../i18n/translate'

function deduplicateInstalledGames(games: InstalledGame[]): InstalledGame[] {
  const prepared = games.filter(game => game && typeof game.name === 'string' && game.name.trim()).map(game => {
    if (getNonSteamGame(game.name)) return repairNonSteamIdentity(game)
    const numId = game.steamId || (game.appId ? Number(game.appId) : extractAppIdFromPlaceholder(game.name))
    const name = numId && isPlaceholderAppName(game.name, numId) ? getKnownSteamGameName(numId) || game.name : game.name
    const steamId = game.steamId || numId || getHardcodedSteamId(name) || undefined
    const knownPreview = (steamId && KNOWN_GAME_PREVIEWS[steamId]) || KNOWN_GAME_PREVIEWS[normalize(name)]
    const iconUrl = knownPreview || (game.iconUrl && !game.iconUrl.includes('capsule_') && !game.iconUrl.includes('tiny_image') ? game.iconUrl : undefined)
      || (steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/header.jpg` : undefined)
    return { ...game, name, steamId, iconUrl }
  })
  return deduplicateByAliases(prepared, game => [
    ...(game.id ? [`id_${game.id}`] : []),
    ...(game.appId ? [`app_${game.appId}`] : []),
    ...(game.steamId ? [`steam_${game.steamId}`] : []),
    ...(normalize(game.name) ? [`name_${normalize(game.name)}`] : []),
  ], (existing, game) => {
    const steamId = existing.steamId || game.steamId
    const name = !isPlaceholderAppName(game.name, steamId) ? game.name
      : !isPlaceholderAppName(existing.name, steamId) ? existing.name
      : (steamId ? getKnownSteamGameName(steamId) : null) || existing.name
    return {
      ...existing,
      ...game,
      name,
      id: existing.id || game.id,
      appId: existing.appId || game.appId,
      steamId,
      iconUrl: (steamId && KNOWN_GAME_PREVIEWS[steamId]) || existing.iconUrl || game.iconUrl,
      installed: existing.installed || game.installed,
      installPath: existing.installPath || game.installPath,
      launchUrl: existing.launchUrl || game.launchUrl,
      playTimeMinutes: Math.max(existing.playTimeMinutes || 0, game.playTimeMinutes || 0),
      lastPlayed: Math.max(existing.lastPlayed || 0, game.lastPlayed || 0),
    }
  })
}

type ScanRun = { initial: Promise<InstalledGame[]>; enrichment?: Promise<InstalledGame[]> }
let activeScan: ScanRun | null = null
let scanGeneration = 0

export function useScanner() {
  const setInstalledGames = useGameStore(state => state.setInstalledGames)
  const setIsScanning = useGameStore(state => state.setIsScanning)
  const setScanMessage = useGameStore(state => state.setScanMessage)
  const showNotification = useUIStore(s => s.showNotification)

  const scan = useCallback(async (options?: { signal?: AbortSignal; awaitEnrichment?: boolean; onInitialGames?: () => void; onProgress?: (msg: string, percent?: number) => void }) => {
    if (options?.signal?.aborted) return useGameStore.getState().installedGames
    if (activeScan) {
      const current = activeScan
      options?.onProgress?.(useGameStore.getState().scanMessage)
      const initial = await current.initial
      if (!options?.signal?.aborted) options?.onInitialGames?.()
      return options?.awaitEnrichment && current.enrichment ? current.enrichment : initial
    }
    const generation = ++scanGeneration
    const run: ScanRun = { initial: Promise.resolve([]) }
    const performScan = async (): Promise<InstalledGame[]> => {
      if (!window.electronAPI) {
        console.warn('[useScanner] electronAPI not available — running in browser mode')
        return useGameStore.getState().installedGames
      }

      const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'

      setIsScanning(true)
      const initialMsg = lang === 'de' ? 'Scanne Spiele-Bibliothek…' : 'Scanning game library…'
      setScanMessage(initialMsg)
      options?.onProgress?.(initialMsg, 30)

      const unsubscribe = window.electronAPI.onScanProgress((progress) => {
        if (options?.signal?.aborted || generation !== scanGeneration) return
        setScanMessage(progress.message)
        options?.onProgress?.(progress.message)
      })
      const stopProgress = () => {
        unsubscribe?.()
        if (generation === scanGeneration) { setIsScanning(false); setScanMessage('') }
      }
      options?.signal?.addEventListener('abort', stopProgress, { once: true })

      try {
        const scanUninstalled = useGameStore.getState().settings.scanUninstalledSteam
        const result = await window.electronAPI.scanGames({ scanUninstalledSteam: scanUninstalled })
        if (options?.signal?.aborted || generation !== scanGeneration) return useGameStore.getState().installedGames
        if (result.success) {
          const existingGames = useGameStore.getState().installedGames
          const libraryGames = useGameStore.getState().library

          // Synchronously enrich scanned games with known steam IDs, names, and icons
          const enrichedScanGames = (result.games || []).map(g => {
            let name = g.name
            const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(name))
            if (numId && isPlaceholderAppName(name, numId)) {
              const known = getKnownSteamGameName(numId)
              if (known) name = known
            }

            const norm = normalize(name)
            const ext = existingGames.find(e => (e.id && e.id === g.id) || (numId && (e.steamId === numId || Number(e.appId) === numId)) || normalize(e.name) === norm)
            const lib = libraryGames.find(e => (e.id && e.id === g.id) || (numId && e.steamId === numId) || normalize(e.name) === norm)

            if (isPlaceholderAppName(name, numId || undefined)) {
              if (ext && !isPlaceholderAppName(ext.name, ext.appId || ext.steamId)) name = ext.name
              else if (lib && !isPlaceholderAppName(lib.name, lib.steamId)) name = lib.name
            }

            const steamId = g.steamId || numId || ext?.steamId || lib?.steamId || (name ? getHardcodedSteamId(name) : undefined) || undefined
            const knownPreview = (steamId && KNOWN_GAME_PREVIEWS[steamId]) || (norm && KNOWN_GAME_PREVIEWS[norm]) || undefined
            const cleanIcon = (g.iconUrl && !g.iconUrl.includes('capsule_') && !g.iconUrl.includes('tiny_image')) ? g.iconUrl : undefined
            const iconUrl = knownPreview || cleanIcon || ext?.iconUrl || lib?.iconUrl || (steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/header.jpg` : undefined)
            return {
              ...g,
              name,
              steamId,
              iconUrl,
            }
          })

          let initialGames = deduplicateInstalledGames(enrichedScanGames)
          const { scanUninstalledSteam } = useGameStore.getState().settings
          if (!scanUninstalledSteam) {
            initialGames = initialGames.filter(g => g.installed !== false)
          }

          const diskPlaytime: Record<string, any> = window.electronAPI?.getPlaytime ? await window.electronAPI.getPlaytime().catch(() => ({})) : {}
          if (options?.signal?.aborted || generation !== scanGeneration) return useGameStore.getState().installedGames
          const mergeGames = (gamesToMerge: InstalledGame[]) => {
            const existingGames = useGameStore.getState().installedGames
            const libraryGames = useGameStore.getState().library
            return gamesToMerge.map(g => {
              let name = g.name
              const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(name))
              if (numId && isPlaceholderAppName(name, numId)) {
                const known = getKnownSteamGameName(numId)
                if (known) name = known
              }

              const norm = normalize(name)
              const ext = existingGames.find(e => (e.id && e.id === g.id) || (numId && (e.steamId === numId || Number(e.appId) === numId)) || normalize(e.name) === norm)
              const lib = libraryGames.find(e => (e.id && e.id === g.id) || (numId && e.steamId === numId) || normalize(e.name) === norm)

              if (isPlaceholderAppName(name, numId || undefined)) {
                if (ext && !isPlaceholderAppName(ext.name, ext.appId || ext.steamId)) name = ext.name
                else if (lib && !isPlaceholderAppName(lib.name, lib.steamId)) name = lib.name
              }

              const disk = diskPlaytime ? (diskPlaytime[norm] || (g.steamId ? diskPlaytime[`steam_${g.steamId}`] : null) || diskPlaytime[g.id]) : null
              const steamId = g.steamId || numId || ext?.steamId || lib?.steamId || (name ? getHardcodedSteamId(name) : undefined) || undefined
              const knownPreview = (steamId && KNOWN_GAME_PREVIEWS[steamId]) || (norm && KNOWN_GAME_PREVIEWS[norm]) || undefined
              const cleanIcon = (g.iconUrl && !g.iconUrl.includes('capsule_') && !g.iconUrl.includes('tiny_image')) ? g.iconUrl : undefined
              const iconUrl = knownPreview || cleanIcon || ext?.iconUrl || lib?.iconUrl || (steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/header.jpg` : undefined)

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

              return {
                ...g,
                name,
                steamId,
                iconUrl,
                playTimeMinutes: maxPlaytime,
                lastPlayed: maxLastPlayed || undefined,
              }
          })

          }
          const mergedInitial = deduplicateInstalledGames(mergeGames(initialGames))
          setInstalledGames(mergedInitial)
          options?.onInitialGames?.()

          // Background name resolution (does not block splash screen)
          run.enrichment = enrichWithSteamIds(enrichedScanGames, (msg) => {
            // Keep internal background log without spamming splash UI
          }, options?.signal)
            .then((enriched) => {
              if (generation !== scanGeneration || options?.signal?.aborted) return useGameStore.getState().installedGames
              let uniqueGames = deduplicateInstalledGames(enriched)
              if (!useGameStore.getState().settings.scanUninstalledSteam) {
                uniqueGames = uniqueGames.filter(g => g.installed !== false)
              }
              const finalGames = deduplicateInstalledGames(mergeGames(uniqueGames))
              setInstalledGames(finalGames)
              setScanMessage('')
              return finalGames
            })
            .catch(err => {
              console.error('[useScanner] Background enrich failed', err)
              return useGameStore.getState().installedGames
            })

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
        if (options?.signal?.aborted || generation !== scanGeneration) return useGameStore.getState().installedGames
        showNotification(lang === 'de' ? 'Fehler beim Scannen der Spiele' : 'Scan encountered an error', 'error')
        console.error('[useScanner]', err)
        setIsScanning(false)
        setScanMessage('')
        return []
      } finally {
        unsubscribe?.()
        options?.signal?.removeEventListener('abort', stopProgress)
      }
    }
    run.initial = performScan()
    activeScan = run
    const releaseAbortedScan = () => { if (activeScan === run) activeScan = null }
    options?.signal?.addEventListener('abort', releaseAbortedScan, { once: true })
    if (options?.signal?.aborted) releaseAbortedScan()
    try {
      const initial = await run.initial
      return options?.awaitEnrichment && run.enrichment ? await run.enrichment : initial
    } finally {
      options?.signal?.removeEventListener('abort', releaseAbortedScan)
      if (activeScan === run) activeScan = null
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
      showNotification(translate(useGameStore.getState().settings.language, 'uiLaunching', { name: gameName }), 'info')
      useGameStore.getState().startPlaySession(launchUrl, gameName)
    } else {
      showNotification(translate(useGameStore.getState().settings.language, 'uiLaunchFailed', { name: gameName }), 'error')
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
  if (signal?.aborted) return games
  const enriched: InstalledGame[] = []
  const existingGames = useGameStore.getState().installedGames
  const libraryGames = useGameStore.getState().library

  // 1. Identify all games with placeholder names (e.g. appid_105600, Steam App 730)
  const placeholderGames = games.filter(g => isPlaceholderAppName(g.name, g.appId || g.steamId))
  const resolvedNames = new Map<number, string>()

  if (placeholderGames.length > 0) {
    onProgress(`Resolving ${placeholderGames.length} missing game names…`)
    try {
      const remainingIds: number[] = []

      // Pass 1: Check existing non-placeholder names in store or known instant map
      for (const g of placeholderGames) {
        const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(g.name))
        if (!numId) continue

        const ext = existingGames.find(eg => eg.steamId === numId || Number(eg.appId) === numId)
        if (ext && !isPlaceholderAppName(ext.name, ext.appId || ext.steamId)) {
          resolvedNames.set(numId, ext.name)
          continue
        }
        const lib = libraryGames.find(lg => lg.steamId === numId)
        if (lib && !isPlaceholderAppName(lib.name, lib.steamId)) {
          resolvedNames.set(numId, lib.name)
          continue
        }

        const known = getKnownSteamGameName(numId)
        if (known) {
          resolvedNames.set(numId, known)
          continue
        }

        remainingIds.push(numId)
      }

      // Pass 2: Bulk SteamSpy lookup for remaining
      if (remainingIds.length > 0) {
        const { getSteamSpyNames, getSteamAppsDetails } = await import('../services/steamService')
        const steamSpyNames = await getSteamSpyNames()
        const stillRemaining: number[] = []

        for (const numId of remainingIds) {
          if (steamSpyNames.has(numId) && !isPlaceholderAppName(steamSpyNames.get(numId)!, numId)) {
            resolvedNames.set(numId, steamSpyNames.get(numId)!)
          } else {
            stillRemaining.push(numId)
          }
        }

        // Pass 3: Steam Store API / SteamSpy batch
        if (stillRemaining.length > 0 && !signal?.aborted) {
          onProgress(`Fetching ${stillRemaining.length} names from Steam…`)
          const steamDetails = await getSteamAppsDetails(stillRemaining, 'english', (done, total) => {
            onProgress(`Fetching names: ${done}/${total} done…`)
          }, signal)

          for (const [id, details] of steamDetails.entries()) {
            if (details?.name && !isPlaceholderAppName(details.name, id)) {
              resolvedNames.set(id, details.name)
            }
          }

          // Pass 4: Single direct fallback
          for (const numId of stillRemaining) {
            if (signal?.aborted) break
            if (!resolvedNames.has(numId)) {
              const single = await resolveSteamAppName(numId)
              if (single && !isPlaceholderAppName(single, numId)) {
                resolvedNames.set(numId, single)
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[useScanner] Failed to resolve some game names', err)
    }
  }

  // Separate steam (already have appId) vs non-steam
  const steamGames   = games.filter(g => g.platform === 'steam')
  const nonSteam     = games.filter(g => g.platform !== 'steam')

  for (const g of steamGames) {
    const numId = g.appId ? Number(g.appId) : (g.steamId || extractAppIdFromPlaceholder(g.name) || undefined)
    const resolved = numId && resolvedNames.has(numId) ? resolvedNames.get(numId)! : g.name
    enriched.push({
      ...g,
      name: resolved,
      steamId: numId,
    })
  }

  // Non-Steam games: try name lookup (rate-limited)
  if (nonSteam.length > 0) {
    onProgress(`Looking up ${nonSteam.length} non-Steam games on Steam Store…`)
    const BATCH = 4
    for (let i = 0; i < nonSteam.length; i += BATCH) {
      const batch = nonSteam.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map(async g => {
          if (getNonSteamGame(g.name)) return { steamId: undefined, name: g.name }
          const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(g.name))
          if (numId && resolvedNames.has(numId)) {
            return { steamId: numId, name: resolvedNames.get(numId)! }
          }
          if (numId && isPlaceholderAppName(g.name, numId)) {
            const resolved = await resolveSteamAppName(numId)
            if (resolved) return { steamId: numId, name: resolved }
          }
          if (g.steamId) return { steamId: g.steamId, name: g.name }
          const hardcoded = getHardcodedSteamId(g.name)
          if (hardcoded) return { steamId: hardcoded, name: g.name }
          const found = await findSteamIdByName(g.name)
          return { steamId: found || undefined, name: g.name }
        })
      )
      results.forEach((r, idx) => {
        const g = batch[idx]
        const val = r.status === 'fulfilled' ? r.value : null
        const steamId = val?.steamId || g.steamId || undefined
        const name = (val?.name && !isPlaceholderAppName(val.name, steamId)) ? val.name : g.name
        const norm = name ? name.toLowerCase().trim() : ''
        const knownPreview = (steamId && KNOWN_GAME_PREVIEWS[steamId]) || (norm && KNOWN_GAME_PREVIEWS[norm]) || undefined
        const cleanIcon = (g.iconUrl && !g.iconUrl.includes('capsule_') && !g.iconUrl.includes('tiny_image')) ? g.iconUrl : undefined
        const iconUrl = knownPreview || cleanIcon || (steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/header.jpg` : undefined)
        enriched.push({ ...g, name, steamId, iconUrl })
      })
      if (i + BATCH < nonSteam.length) {
        if (signal?.aborted) break;
        onProgress(`Steam lookup: ${Math.min(i + BATCH, nonSteam.length)}/${nonSteam.length} done…`)
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    }
  }

  return signal?.aborted ? games : enriched
}
