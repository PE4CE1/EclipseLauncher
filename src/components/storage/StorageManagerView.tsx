import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { HardDrive, FolderOpen, RefreshCw, Search, Gamepad2, ChevronRight, Trash2 } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { getHeaderUrl } from '../../services/assetHelper'
import type { DriveInfo, GameStorageItem } from '../../types/game'

/**
 * Strict 16:9 Thumbnail Component to guarantee 100% uniform size for every game
 * (Prevents square images like Roblox from expanding taller than other games)
 */
function StorageGameThumb({ game }: { game: GameStorageItem }) {
  const [imgFailed, setImgFailed] = useState(false)

  const isRoblox = game.name.toLowerCase().includes('roblox')
  const steamId = game.steamId || (isRoblox ? 999001 : undefined)
  const imageUrl = !imgFailed && steamId 
    ? getHeaderUrl(steamId) 
    : (!imgFailed && game.iconUrl ? game.iconUrl : null)

  return (
    <div
      style={{
        width: '104px',
        height: '58px',
        minWidth: '104px',
        minHeight: '58px',
        maxWidth: '104px',
        maxHeight: '58px'
      }}
      className="rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden flex-shrink-0 relative shadow-sm group-hover:border-white/20 transition-all flex items-center justify-center select-none"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={game.name}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-white/[0.02] text-white/30">
          <Gamepad2 size={18} />
          <span className="text-[9px] font-mono text-white/40 truncate max-w-[85px] px-1 mt-0.5">
            {game.name}
          </span>
        </div>
      )}
    </div>
  )
}

export function StorageManagerView() {
  const { language } = useTranslation()
  const isDe = language === 'de'
  const { openGameDetails, showNotification } = useUIStore()
  const { installedGames, removeFromLibrary } = useGameStore()

  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [rawGameSizes, setRawGameSizes] = useState<GameStorageItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDrive, setSelectedDrive] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'size-desc' | 'size-asc' | 'name-asc'>('size-desc')

  // Deletion Modal State
  const [gameToUninstall, setGameToUninstall] = useState<GameStorageItem | null>(null)
  const [isUninstalling, setIsUninstalling] = useState(false)

  const loadStorageData = async () => {
    if (drives.length === 0) setIsLoading(true)
    try {
      const drivePromise = window.electronAPI?.storage?.getDrives
        ? window.electronAPI.storage.getDrives()
        : Promise.resolve([])

      const sizesPromise = window.electronAPI?.storage?.getGameSizes
        ? window.electronAPI.storage.getGameSizes(installedGames)
        : Promise.resolve([])

      const [driveData, sizes] = await Promise.all([drivePromise, sizesPromise])
      if (driveData && driveData.length > 0) setDrives(driveData)
      if (sizes && sizes.length > 0) setRawGameSizes(sizes)
    } catch (e) {
      console.error('[StorageView] Error loading storage data:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStorageData()
  }, [installedGames.length])

  // Filter out any games that are 0B (uninstalled or 0 bytes)
  const validGames = useMemo(() => {
    return rawGameSizes.filter(g => (g.sizeBytes || 0) > 0)
  }, [rawGameSizes])

  // Aggregate stats
  const totalGamesBytes = useMemo(() => {
    return validGames.reduce((acc, g) => acc + (g.sizeBytes || 0), 0)
  }, [validGames])

  const totalFreeBytes = useMemo(() => {
    return drives.reduce((acc, d) => acc + d.freeBytes, 0)
  }, [drives])

  const formatGB = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1000) {
      return `${(gb / 1024).toFixed(1)} TB`
    }
    return `${gb.toFixed(1)} GB`
  }

  const handleOpenFolder = (e: React.MouseEvent, folderPath: string) => {
    e.stopPropagation()
    if (window.electronAPI?.storage?.openFolder) {
      window.electronAPI.storage.openFolder(folderPath)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, game: GameStorageItem) => {
    e.stopPropagation()
    setGameToUninstall(game)
  }

  const handleConfirmUninstall = async () => {
    if (!gameToUninstall) return
    setIsUninstalling(true)

    try {
      if (window.electronAPI?.uninstallGame) {
        await window.electronAPI.uninstallGame({
          id: gameToUninstall.id,
          name: gameToUninstall.name,
          steamId: gameToUninstall.steamId,
          installPath: gameToUninstall.installPath,
          platform: gameToUninstall.platform,
        })
      }

      // Remove from store
      removeFromLibrary(gameToUninstall.id)

      // Remove immediately from storage view
      setRawGameSizes(prev => prev.filter(g => g.id !== gameToUninstall.id))

      showNotification(
        isDe 
          ? `"${gameToUninstall.name}" wird deinstalliert` 
          : `"${gameToUninstall.name}" is being uninstalled`,
        'info'
      )
    } catch (err: any) {
      console.error('Uninstall error:', err)
      showNotification(isDe ? 'Fehler beim Deinstallieren' : 'Failed to uninstall', 'error')
    } finally {
      setIsUninstalling(false)
      setGameToUninstall(null)
      setTimeout(() => loadStorageData(), 600)
    }
  }

  // Filtered & Sorted games
  const filteredGames = useMemo(() => {
    let list = [...validGames]

    if (selectedDrive !== 'all') {
      list = list.filter(g => g.drive.toLowerCase() === selectedDrive.toLowerCase())
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(g => g.name.toLowerCase().includes(q) || (g.installPath && g.installPath.toLowerCase().includes(q)))
    }

    list.sort((a, b) => {
      if (sortBy === 'size-desc') return (b.sizeBytes || 0) - (a.sizeBytes || 0)
      if (sortBy === 'size-asc') return (a.sizeBytes || 0) - (b.sizeBytes || 0)
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      return 0
    })

    return list
  }, [validGames, selectedDrive, searchQuery, sortBy])

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 lg:p-8 space-y-6 select-none max-w-6xl mx-auto relative">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white flex-shrink-0">
            <HardDrive size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              {isDe ? 'Speicherplatz' : 'Storage'}
            </h1>
            <p className="text-xs text-white/40 mt-0.5">
              {drives.length} {isDe ? 'Laufwerke' : 'Drives'} • {formatGB(totalGamesBytes)} {isDe ? 'Spiele' : 'Games'} • {formatGB(totalFreeBytes)} {isDe ? 'Frei' : 'Free'}
            </p>
          </div>
        </div>

        <button
          onClick={loadStorageData}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white/80 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          <span>{isDe ? 'Aktualisieren' : 'Refresh'}</span>
        </button>
      </div>

      {/* ─── Minimalist Drive Cards (Monochrome, Clean) ─────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {drives.map((drive) => {
          const driveGamesBytes = validGames
            .filter(g => g.drive.toLowerCase() === drive.deviceId.toLowerCase())
            .reduce((sum, g) => sum + (g.sizeBytes || 0), 0)

          const isSelected = selectedDrive === drive.deviceId

          return (
            <div
              key={drive.deviceId}
              onClick={() => setSelectedDrive(isSelected ? 'all' : drive.deviceId)}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-white/[0.08] border-white/30 shadow-lg'
                  : 'bg-white/[0.02] border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              {/* Top row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/15">
                    {drive.deviceId}
                  </span>
                  <span className="text-xs font-medium text-white truncate">
                    {drive.volumeName || (isDe ? 'Lokales Laufwerk' : 'Local Drive')}
                  </span>
                </div>

                <span className="text-xs font-mono text-white/60">
                  {drive.usedPercentage}%
                </span>
              </div>

              {/* Clean Single Monochrome Progress Bar */}
              <div className="mt-3.5 h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, Math.max(0, drive.usedPercentage))}%` }}
                  className="h-full bg-white/85 rounded-full transition-all duration-300"
                />
              </div>

              {/* Bottom details */}
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/40 font-mono">
                <span>{formatGB(drive.freeBytes)} {isDe ? 'frei' : 'free'}</span>
                <span>{formatGB(driveGamesBytes)} {isDe ? 'Spiele' : 'games'}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Control Bar: Segmented Drive Filter & Search ─────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Minimalist Segmented Control */}
        <div className="flex items-center p-0.5 bg-black/40 rounded-lg border border-white/[0.08] overflow-x-auto">
          <button
            onClick={() => setSelectedDrive('all')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedDrive === 'all'
                ? 'bg-white text-black shadow-sm'
                : 'text-white/50 hover:text-white'
            }`}
          >
            {isDe ? 'Alle' : 'All'} ({validGames.length})
          </button>

          {drives.map(d => {
            const count = validGames.filter(g => g.drive.toLowerCase() === d.deviceId.toLowerCase()).length
            const active = selectedDrive === d.deviceId
            return (
              <button
                key={d.deviceId}
                onClick={() => setSelectedDrive(d.deviceId)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold font-mono transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-white text-black shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {d.deviceId} ({count})
              </button>
            )
          })}
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          <div className="relative w-44 sm:w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isDe ? 'Spiel filtern...' : 'Filter game...'}
              className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-white/25 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-white/30 focus:outline-none transition-all"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.08] text-white/70 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none cursor-pointer"
          >
            <option value="size-desc" className="bg-[#0b0c10] text-white">{isDe ? 'Größte zuerst' : 'Largest'}</option>
            <option value="size-asc" className="bg-[#0b0c10] text-white">{isDe ? 'Kleinste zuerst' : 'Smallest'}</option>
            <option value="name-asc" className="bg-[#0b0c10] text-white">A-Z</option>
          </select>
        </div>
      </div>

      {/* ─── Completely Uniform, Clean Games List ─────────────────── */}
      <div className="bg-[#0b0c10] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
        {filteredGames.length === 0 ? (
          <div className="p-16 text-center text-xs text-white/30 flex flex-col items-center justify-center gap-2">
            <Gamepad2 size={24} className="text-white/20" />
            <span>{isDe ? 'Keine installierten Spiele gefunden.' : 'No installed games found.'}</span>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filteredGames.map((game, index) => {
              return (
                <div
                  key={game.id || index}
                  onClick={() => game.steamId && openGameDetails(game.steamId, game.name)}
                  className="p-3.5 px-4 flex items-center justify-between gap-4 hover:bg-white/[0.025] transition-colors cursor-pointer group min-h-[72px]"
                >
                  {/* Left: Strict Uniform 104x58 Thumbnail Artwork & Game Title */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <StorageGameThumb game={game} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white tracking-tight truncate group-hover:text-white transition-colors">
                          {game.name}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-white/[0.04] text-white/60 border border-white/[0.08]">
                          {game.platform}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 font-mono truncate mt-0.5" title={game.installPath}>
                        {game.drive} • {game.installPath || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Right: Crisp Size, Folder & Delete Button */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    <span className="text-sm sm:text-base font-bold font-mono text-white">
                      {game.sizeFormatted}
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Open Folder in Explorer */}
                      {game.installPath && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenFolder(e, game.installPath)}
                          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title={isDe ? 'Ordner im Explorer öffnen' : 'Open folder in Explorer'}
                        >
                          <FolderOpen size={15} />
                        </button>
                      )}

                      {/* Delete / Uninstall Button with confirmation */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, game)}
                        className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title={isDe ? 'Spiel deinstallieren' : 'Uninstall game'}
                      >
                        <Trash2 size={15} />
                      </button>

                      <ChevronRight size={15} className="text-white/20 group-hover:text-white/60 transition-colors ml-0.5" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Ultra-Clean Minimalist Confirmation Modal (Portal to body for viewport centering) ─── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {gameToUninstall && (
            <div 
              onClick={() => !isUninstalling && setGameToUninstall(null)}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#0c0d12] border border-white/[0.12] rounded-2xl p-5 max-w-[370px] w-full shadow-2xl space-y-4 select-none pointer-events-auto"
              >
                {/* Optional Steam Header Banner Artwork */}
                {gameToUninstall.steamId ? (
                  <div className="w-full h-24 rounded-xl overflow-hidden border border-white/[0.08] relative shadow-inner">
                    <img
                      src={getHeaderUrl(gameToUninstall.steamId)}
                      alt={gameToUninstall.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d12] via-transparent to-transparent" />
                    <span className="absolute bottom-2.5 right-2.5 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-white border border-white/15 shadow">
                      {gameToUninstall.sizeFormatted}
                    </span>
                  </div>
                ) : null}

                {/* Title & Concise Subtitle */}
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white tracking-tight truncate">
                    {isDe ? 'Spiel deinstallieren?' : 'Uninstall game?'}
                  </h3>
                  <p className="text-xs text-white/50 leading-relaxed">
                    {isDe ? (
                      <>
                        <span className="text-white font-medium">{gameToUninstall.name}</span> wirklich deinstallieren? <span className="text-white font-mono font-semibold">{gameToUninstall.sizeFormatted}</span> auf Laufwerk <span className="font-mono text-white font-semibold">{gameToUninstall.drive}</span> werden freigegeben.
                      </>
                    ) : (
                      <>
                        Uninstall <span className="text-white font-medium">{gameToUninstall.name}</span>? This will free up <span className="text-white font-mono font-semibold">{gameToUninstall.sizeFormatted}</span> on drive <span className="font-mono text-white font-semibold">{gameToUninstall.drive}</span>.
                      </>
                    )}
                  </p>
                </div>

                {/* Two Balanced Buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setGameToUninstall(null)}
                    disabled={isUninstalling}
                    className="w-full py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer border border-white/[0.06]"
                  >
                    {isDe ? 'Abbrechen' : 'Cancel'}
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmUninstall}
                    disabled={isUninstalling}
                    className="w-full py-2 rounded-xl bg-white text-black hover:bg-white/90 text-xs font-semibold transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isUninstalling ? (
                      <RefreshCw size={13} className="animate-spin text-black" />
                    ) : (
                      <span>{isDe ? 'Deinstallieren' : 'Uninstall'}</span>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
