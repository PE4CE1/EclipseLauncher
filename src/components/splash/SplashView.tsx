import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Play } from 'lucide-react'
import { UpdateCard } from '../updates/UpdateCard'
import { updateNotes, updatePercent } from '../../services/updatePresentation'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useTranslation } from '../../hooks/useTranslation'
import { checkStartupUpdates, isNewerVersion, type AppReleaseInfo } from '../../services/updateService'
import { useLaunchOverlay } from './LaunchOverlay'
import { prepareStartupLibrary, waitForStartupMinimum } from '../../services/startupLibrary'

interface SplashViewProps {
  onComplete: () => void
}

function getInitialAutoScan(): boolean {
  return useGameStore.getState().settings.autoScanSplash !== false
}

function getInitialScanSteam(): boolean {
  return useGameStore.getState().settings.scanUninstalledSteam !== false
}

export function SplashView({ onComplete }: SplashViewProps) {
  const updateSettings = useGameStore(state => state.updateSettings)
  const scanMessage = useGameStore(state => state.scanMessage)
  const { scan } = useScanner()
  const { language } = useTranslation()

  const [autoScanEnabled] = useState(getInitialAutoScan)
  const [userClickedStart, setUserClickedStart] = useState(false)
  const [progress, setProgress] = useState(10)
  const [statusText, setStatusText] = useState(
    language === 'de' ? 'Prüfe auf Updates...' : 'Checking for updates...'
  )
  const [isDone, setIsDone] = useState(false)
  const isFinishedRef = useRef(false)
  const sequenceRunningRef = useRef(false)
  const foundUpdateRef = useRef<AppReleaseInfo | null>(null)
  const skipStartupUpdateRef = useRef(false)
  const preparationRef = useRef<AbortController | null>(null)
  const preparingArtworkRef = useRef(false)

  // Update check states
  const [foundUpdate, setFoundUpdate] = useState<AppReleaseInfo | null>(null)
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0)

  // Local settings toggles for manual start mode
  const [loadSteam, setLoadSteam] = useState(getInitialScanSteam)
  const [autoScanSplash, setAutoScanSplash] = useState(getInitialAutoScan)

  const finish = () => {
    if (!isFinishedRef.current) {
      isFinishedRef.current = true
      onComplete()
    }
  }

  // Listen for native electron-updater events
  useEffect(() => {
    if (window.electronAPI?.onUpdaterEvent) {
      const unsub = window.electronAPI.onUpdaterEvent(({ status, data }) => {
        if (status === 'available' && data && isNewerVersion(data.version) && !skipStartupUpdateRef.current && useGameStore.getState().settings.autoCheckUpdates !== false) {
          const release = {
            version: data.version || 'New',
            name: data.releaseName || `Version ${data.version}`,
            notes: updateNotes(data.releaseNotes),
            publishedAt: data.releaseDate || '',
            downloadUrl: '',
            isNewer: true
          }
          foundUpdateRef.current = release
          setFoundUpdate(release)
        } else if (status === 'error' && foundUpdateRef.current) {
          setIsDownloadingUpdate(false)
          setUpdateError(typeof data === 'string' ? data : 'Update download failed')
        } else if (status === 'downloading' && typeof data?.percent === 'number') {
          setIsDownloadingUpdate(true)
          setUpdateDownloadProgress(updatePercent(data.percent))
        } else if (status === 'downloaded') {
          setIsDownloadingUpdate(false)
          setUpdateDownloaded(true)
        }
      })
      return unsub
    }
  }, [])

  // Sync external scanner messages if provided
  useEffect(() => {
    if (scanMessage && !isDone && !foundUpdate && !preparingArtworkRef.current) {
      setStatusText(scanMessage)
    }
  }, [scanMessage, isDone, foundUpdate])

  const runProgressSequence = async (skipUpdate = false, forceScan = false) => {
    if (sequenceRunningRef.current || isFinishedRef.current) return
    sequenceRunningRef.current = true
    const startedAt = Date.now()
    const abortController = new AbortController()
    preparationRef.current?.abort()
    preparationRef.current = abortController
    preparingArtworkRef.current = false
    try {
      setProgress(10)
      setStatusText(language === 'de' ? 'Prüfe auf Updates...' : 'Checking for updates...')

      try {
        const updateCheck = skipUpdate ? null : await checkStartupUpdates(useGameStore.getState().settings.autoCheckUpdates !== false)
        if (updateCheck && updateCheck.isNewer) {
          foundUpdateRef.current = updateCheck
          setFoundUpdate(updateCheck)
          setStatusText(language === 'de' ? `Update v${updateCheck.version} verfügbar!` : `Update v${updateCheck.version} available!`)
          // STOP sequence here! The mandatory update modal is now shown.
          return
        }
      } catch (e) {
        console.warn('[SplashView] Update check error:', e)
      }

      if (foundUpdateRef.current || abortController.signal.aborted) return

      // 2. Scan manifests & build library
      setProgress(20)
      setStatusText(language === 'de' ? 'Scanne installierte Spiele & erstelle Bibliothek...' : 'Scanning installed games & library...')

      const libraryViewReady = import('../library/LibraryView').catch(error => {
        console.warn('[SplashView] Library view will load when opened:', error)
      })
      const [result] = await Promise.all([prepareStartupLibrary({
        scan: forceScan || useGameStore.getState().settings.autoScan !== false ? scan : undefined,
        signal: abortController.signal,
        getGames: () => {
          const state = useGameStore.getState()
          return [
            ...(Array.isArray(state.installedGames) ? state.installedGames : []),
            ...(Array.isArray(state.library) ? state.library : []),
          ].filter(game => game && typeof game.name === 'string')
            .map(game => ({ ...game, isFavorite: state.favoriteIds.includes(game.id) || ('isFavorite' in game && game.isFavorite === true) }))
        },
        onProgress: update => {
          if (update.stage === 'covers') {
            preparingArtworkRef.current = true
            setProgress(previous => Math.max(previous, update.total ? 35 + Math.round(update.completed / update.total * 62) : 97))
            setStatusText(language === 'de'
              ? `Bereite Cover vor · ${update.completed} / ${update.total}`
              : `Preparing artwork · ${update.completed} / ${update.total}`)
          }
        },
      }), libraryViewReady])
      if (abortController.signal.aborted) return

      // 4. Ready Stage
      setProgress(100)
      setIsDone(true)
      setStatusText(result.timedOut || result.failed > 0
        ? (language === 'de' ? 'Bibliothek bereit · Weitere Cover laden bei Bedarf' : 'Library ready · Remaining artwork loads on demand')
        : (language === 'de' ? `Bibliothek bereit · ${result.loaded} Cover geladen` : `Library ready · ${result.loaded} covers loaded`))
      await waitForStartupMinimum(startedAt, abortController.signal)
      if (!foundUpdateRef.current && !abortController.signal.aborted) finish()
    } catch (error) {
      console.error('[SplashView] Library preparation failed:', error)
      if (!abortController.signal.aborted && !foundUpdateRef.current) {
        setStatusText(language === 'de' ? 'Starte mit deiner gespeicherten Bibliothek…' : 'Starting with your saved library…')
        await waitForStartupMinimum(startedAt, abortController.signal)
        if (!abortController.signal.aborted) finish()
      }
    } finally { sequenceRunningRef.current = false }
  }

  // Scheduling avoids starting an orphaned scan during React StrictMode's probe mount.
  useEffect(() => {
    const timer = autoScanEnabled ? setTimeout(() => { void runProgressSequence() }, 0) : undefined
    return () => {
      clearTimeout(timer)
      preparationRef.current?.abort()
    }
  }, [])

  const handleManualStart = async () => {
    setUserClickedStart(true)
    updateSettings({
      scanUninstalledSteam: loadSteam,
      autoScanSplash: autoScanSplash,
    })
    await runProgressSequence(false, true)
  }

  const handleStartUpdate = async () => {
    if (!foundUpdate) return
    setUpdateError('')
    setIsDownloadingUpdate(true)
    setUpdateDownloadProgress(0)

    if (window.electronAPI?.downloadUpdate) {
      try {
        const res = await window.electronAPI.downloadUpdate(foundUpdate.downloadUrl || undefined)
        if (res && res.success === false) {
          throw new Error(res.error || 'Download failed')
        }
      } catch (e) {
        console.warn('[SplashView] downloadUpdate failed, opening download URL:', e)
        setIsDownloadingUpdate(false)
        setUpdateError(e instanceof Error ? e.message : 'Update download failed')
        if (foundUpdate.downloadUrl && window.electronAPI?.openUrl) {
          window.electronAPI.openUrl(foundUpdate.downloadUrl)
        } else if (foundUpdate.downloadUrl) {
          window.open(foundUpdate.downloadUrl, '_blank')
        }
      }
    } else {
      setIsDownloadingUpdate(false)
      setUpdateError('Automatic installation is unavailable')
      if (window.electronAPI?.openUrl) {
        window.electronAPI.openUrl(foundUpdate.downloadUrl)
      } else {
        window.open(foundUpdate.downloadUrl, '_blank')
      }
    }
  }

  const handleInstallUpdate = async () => {
    if (window.electronAPI?.installUpdate) {
      return window.electronAPI.installUpdate()
    } else if (window.electronAPI?.relaunchApp) {
      window.electronAPI.relaunchApp()
    } else {
      window.location.reload()
    }
  }

  const isScanningActive = autoScanEnabled || userClickedStart

  const actions = (
        <AnimatePresence mode="wait">
          {foundUpdate ? (
            <UpdateCard
              key="startup-update"
              language={language}
              status={updateError ? 'error' : updateDownloaded ? 'downloaded' : isDownloadingUpdate ? 'downloading' : 'available'}
              version={foundUpdate.version}
              notes={foundUpdate.notes}
              publishedAt={foundUpdate.publishedAt}
              progress={updateDownloadProgress}
              error={updateError}
              onDownload={handleStartUpdate}
              onInstall={handleInstallUpdate}
              onContinue={() => {
                skipStartupUpdateRef.current = true
                foundUpdateRef.current = null
                setFoundUpdate(null)
                setUpdateError('')
                void runProgressSequence(true, userClickedStart)
              }}
            />
          ) : isScanningActive ? (
            /* ─── State 1: Active Progress & Loading Animation ─── */
            <motion.div 
              key="scanning"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full space-y-3.5"
            >
              {/* Progress Track */}
              <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden relative">
                <motion.div 
                  className="absolute left-0 top-0 bottom-0 bg-[#ff9a56] rounded-full shadow-[0_0_12px_rgba(255,255,255,0.7)]"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              {/* Status Row */}
              <div className="flex items-center justify-between text-xs px-0.5 min-h-[20px]">
                <div className="flex items-center gap-2 max-w-[280px]">
                  {isDone ? (
                    <Check size={13} className="text-white flex-shrink-0" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                  )}
                  <span className="text-white/60 font-medium tracking-wide truncate">
                    {isDone ? (language === 'de' ? 'Abgeschlossen' : 'Complete') : (language === 'de' ? 'Deine Bibliothek' : 'Your library')}
                  </span>
                </div>
                <span className="text-white/40 font-mono text-[11px] font-semibold flex-shrink-0">
                  {progress}%
                </span>
              </div>
            </motion.div>
          ) : (
            /* ─── State 2: Interactive Configuration Screen ─── */
            <motion.div 
              key="manual-options"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full space-y-3"
            >
              {/* Option 1: Load Steam Library */}
              <label className="flex items-start p-3 rounded-xl bg-[#170d08] hover:bg-[#21120b] border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-150 group">
                <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center mr-3 transition-colors flex-shrink-0 ${
                  loadSteam ? 'bg-white text-black' : 'bg-transparent border border-white/30 group-hover:border-white/50'
                }`}>
                  {loadSteam && <Check size={11} className="stroke-[3]" />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={loadSteam} 
                  onChange={(e) => setLoadSteam(e.target.checked)} 
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 group-hover:text-white transition-colors">
                    {language === 'de' ? 'Steam-Bibliothek laden' : 'Load Steam Library'}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {language === 'de' ? 'Nicht installierte Spiele einschließen' : 'Include uninstalled games'}
                  </p>
                </div>
              </label>

              {/* Option 2: Always Scan Automatically */}
              <label className="flex items-start p-3 rounded-xl bg-[#170d08] hover:bg-[#21120b] border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-150 group">
                <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center mr-3 transition-colors flex-shrink-0 ${
                  autoScanSplash ? 'bg-white text-black' : 'bg-transparent border border-white/30 group-hover:border-white/50'
                }`}>
                  {autoScanSplash && <Check size={11} className="stroke-[3]" />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={autoScanSplash} 
                  onChange={(e) => setAutoScanSplash(e.target.checked)} 
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 group-hover:text-white transition-colors">
                    {language === 'de' ? 'Zukünftig automatisch starten' : 'Always scan automatically'}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {language === 'de' ? 'Bibliothek beim nächsten Start automatisch vorbereiten' : 'Prepare the library automatically on next launch'}
                  </p>
                </div>
              </label>

              {/* Launch Button */}
              <button
                onClick={handleManualStart}
                className="w-full mt-2 py-3 bg-[#ff934f] hover:bg-[#ffa569] active:scale-[0.99] text-black rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(255,113,38,0.15)] cursor-pointer"
              >
                <Play size={13} className="fill-black text-black" />
                <span>{language === 'de' ? 'Eclipse starten' : 'Launch Eclipse'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
  )
  useLaunchOverlay({
    className: `splash-screen-overlay${foundUpdate ? ' launch-screen--update' : ''}`,
    message: foundUpdate
      ? (language === 'de' ? 'Ein neues Kapitel steht bereit.' : 'A new chapter is ready.')
      : isScanningActive ? statusText : (language === 'de' ? 'Bereit für dein nächstes Spiel.' : 'Ready for your next game.'),
    showLoader: !foundUpdate && isScanningActive,
    children: actions,
  })
  return null
}
