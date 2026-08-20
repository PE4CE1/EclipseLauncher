import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, BookOpen, Library, Download, Settings,
  Bell, Gamepad2, Zap, Search, ChevronDown, User, Users, LogOut,
  Star, Clock, Loader2, ScanLine, Github, Play, Square,
  FolderOpen, Trash2, MoreVertical,
  type LucideIcon,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useDownloadStore } from '../../store/downloadStore'
import { getCoverUrl, getHeaderUrl, getPlaceholderCover } from '../../services/assetHelper'
import { useTranslation } from '../../hooks/useTranslation'
import { APP_VERSION } from '../../services/updateService'
import type { ActiveView, InstalledGame } from '../../types/game'

interface NavItem {
  id: ActiveView
  label: string
  icon: LucideIcon
}



/** Small icon for a game in the sidebar list */
function GameIcon({ name, steamId, iconUrl }: { name: string; steamId?: number; iconUrl?: string }) {
  const initial = name.charAt(0).toUpperCase()

  // Priority: steamId CDN → iconUrl → placeholder
  const sources = [
    ...(steamId ? [getHeaderUrl(steamId)] : []),
    ...(iconUrl  ? [iconUrl]              : []),
  ]

  if (sources.length === 0) {
    return (
      <div
        className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
        style={{ background: `hsl(${initial.charCodeAt(0) * 15}, 60%, 35%)` }}
      >
        {initial}
      </div>
    )
  }

  return (
    <SidebarIcon sources={sources} name={name} initial={initial} />
  )
}

function SidebarIcon({ sources, name, initial }: { sources: string[]; name: string; initial: string }) {
  const [srcIdx, setSrcIdx] = React.useState(0)

  function handleError() {
    if (srcIdx < sources.length - 1) setSrcIdx(i => i + 1)
    else setSrcIdx(sources.length)
  }

  if (srcIdx >= sources.length) {
    return (
      <div
        className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
        style={{ background: `hsl(${initial.charCodeAt(0) * 15}, 60%, 35%)` }}
      >
        {initial}
      </div>
    )
  }

  return (
    <img
      key={sources[srcIdx]}
      src={sources[srcIdx]}
      alt={name}
      className="w-6 h-6 rounded flex-shrink-0 object-cover"
      onError={handleError}
    />
  )
}

import React from 'react'

export function Sidebar() {
  const { activeView, setActiveView, setIsSearchOpen, updateStatus, updateProgress, updateInfo, isFriendsOpen, setIsFriendsOpen, openGameDetails, showNotification } = useUIStore()
  const { installedGames, library, isScanning, scanMessage, settings, activeGame, toggleFavorite, favoriteIds, removeFromLibrary, stopPlaySession } = useGameStore()
  
  // Calculate total library size (installed + custom uninstalled games)
  const totalLibraryCount = installedGames.length + library.filter(g => !installedGames.some(ig => ig.name === g.name)).length
  const { scan, launchGame } = useScanner()
  const downloads = useDownloadStore(state => state.downloads)
  const activeDownloads = Object.values(downloads).filter(d => d.status !== 'done')
  const activeDownloadCount = activeDownloads.length
  
  // Calculate average download percentage
  const avgDownloadProgress = activeDownloadCount > 0
    ? Math.round(
        (activeDownloads.reduce((acc, d) => acc + (d.progress || 0), 0) / activeDownloadCount) * 100
      )
    : 0
  const hasExtracting = activeDownloads.some(d => d.status === 'extracting')
  const { t } = useTranslation()

  const NAV_ITEMS: NavItem[] = [
    { id: 'home',      label: t('home'),      icon: Home },
    { id: 'catalogue', label: t('catalogue'), icon: BookOpen },
    { id: 'library',   label: t('library'),   icon: Library },
    { id: 'downloads', label: t('downloads'), icon: Download },
    { id: 'settings',  label: t('settings'),  icon: Settings },
  ]

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  // Context Menu State
  const [contextMenu, setContextMenu] = React.useState<{ game: InstalledGame; x: number; y: number } | null>(null)
  const contextMenuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false)
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleContextMenu = (e: React.MouseEvent, game: InstalledGame) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 195
    const menuHeight = 160
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10)
    setContextMenu({ game, x, y })
  }

  const handleThreeDotsClick = (e: React.MouseEvent, game: InstalledGame) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const menuWidth = 195
    const menuHeight = 160
    const x = Math.min(rect.right + 6, window.innerWidth - menuWidth - 10)
    const y = Math.min(rect.top, window.innerHeight - menuHeight - 10)
    setContextMenu({ game, x, y })
  }

  const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
  const isPlayingSelected = contextMenu ? !!(activeGame && (normalize(activeGame.name) === normalize(contextMenu.game.name) || activeGame.id === String(contextMenu.game.steamId) || activeGame.id === contextMenu.game.launchUrl || activeGame.id === contextMenu.game.id)) : false
  const isFavoriteSelected = contextMenu ? favoriteIds.includes(contextMenu.game.id) : false

  return (
    <aside className="w-64 flex-shrink-0 bg-transparent flex flex-col h-full overflow-hidden border-r border-white/[0.02]">

      {/* ─── User Profile ─────────────────────────────────────────────── */}
      <div className="p-4 relative" ref={dropdownRef}>
        <button 
          onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
          className="w-full flex items-center gap-3 p-1.5 -m-1.5 rounded-lg hover:bg-white/5 transition-colors text-left"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-black overflow-hidden flex-shrink-0 ring-1 ring-white/10">
              {settings.avatarUrl ? (
                <img src={settings.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="text-white/70" size={20} />
              )}
            </div>
            {/* Online Status */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-hub-surface" />
            {/* Update Notification Dot */}
            {(updateStatus === 'available' || updateStatus === 'downloaded') && (
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-hub-surface z-10" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white uppercase tracking-wide truncate">{settings.username || 'User'}</p>
          </div>
          <ChevronDown size={16} className={`text-hub-muted transition-transform ${isProfileDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isProfileDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute top-full left-4 right-4 mt-2 bg-hub-surface/90 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-card py-2 z-50 overflow-hidden"
            >
              <button 
                onClick={() => { setActiveView('profile'); useUIStore.getState().setSelectedFriendId(null); setIsProfileDropdownOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
              >
                <User size={16} className="text-white/70" />
                {t('viewProfile')}
              </button>
              
              <button 
                onClick={() => { setActiveView('notifications'); setIsProfileDropdownOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Bell size={16} className="text-white/70" />
                  {t('notificationsTab')}
                </div>
                {(updateStatus === 'available' || updateStatus === 'downloaded') && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full">
                    UPDATE
                  </span>
                )}
              </button>
              
              <button 
                onClick={() => {
                  if ((window as any).electronAPI?.openFriendsWindow) {
                    (window as any).electronAPI.openFriendsWindow()
                  } else {
                    setIsFriendsOpen(!isFriendsOpen)
                  }
                  setIsProfileDropdownOpen(false)
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                <Users size={16} className="text-white/70" />
                <span className="flex-1">{t('friends')}</span>
              </button>
              
              <div className="h-px bg-white/10 my-1 mx-4" />
              
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors text-left">
                <LogOut size={16} className="text-white/70" />
                <span className="flex-1">{t('logOut')}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      <nav className="px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`nav-${id}`}
            onClick={() => setActiveView(id)}
            className={`sidebar-item w-full ${activeView === id ? 'active' : ''}`}
          >
            <Icon size={17} className="flex-shrink-0" />
            <span>{label}</span>
            {id === 'library' && totalLibraryCount > 0 && (
              <span className="ml-auto text-[10px] bg-hub-elevated text-hub-muted rounded-full px-1.5 py-0.5">
                {totalLibraryCount}
              </span>
            )}
            {id === 'downloads' && activeDownloadCount > 0 && (
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#0b0c10] border border-white/20 text-white shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {hasExtracting 
                  ? (activeDownloadCount > 1 ? `${activeDownloadCount} • Extr.` : 'Extr.')
                  : (activeDownloadCount > 1 ? `${activeDownloadCount} • ${avgDownloadProgress}%` : `${avgDownloadProgress}%`)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ─── Scan Progress (Minimalist White Design) ─── */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mx-3 mb-2.5 overflow-hidden"
          >
            <div className="bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-sm">
              <div className="w-5 h-5 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center flex-shrink-0">
                <Loader2 size={11} className="text-white animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-white/90 truncate block tracking-tight">
                  {scanMessage || t('scanning')}
                </span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse flex-shrink-0" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Installed Games List ─────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-hub-muted">
            {t('installed')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scan()}
              className="text-hub-muted hover:text-white transition-colors"
              title={t('scanNow')}
            >
              <ScanLine size={13} />
            </button>
            <span className="text-[11px] text-hub-muted bg-white/5 px-1.5 rounded-sm">
              {installedGames.filter(g => g.installed !== false).length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {installedGames.filter(g => g.installed !== false).length === 0 ? (
            <div className="px-3 py-6 text-center">
              <Gamepad2 size={24} className="text-hub-border mx-auto mb-2" />
              <p className="text-xs text-hub-muted">{t('noGamesFound')}</p>
              <button
                onClick={() => scan()}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {t('scanNow')}
              </button>
            </div>
          ) : (
            (() => {
              const sortedGames = [...installedGames.filter(g => g.installed !== false)].sort((a, b) => {
                const aPlaying = activeGame && (normalize(activeGame.name) === normalize(a.name) || activeGame.id === String(a.steamId) || activeGame.id === a.launchUrl || activeGame.id === a.id)
                const bPlaying = activeGame && (normalize(activeGame.name) === normalize(b.name) || activeGame.id === String(b.steamId) || activeGame.id === b.launchUrl || activeGame.id === b.id)
                
                if (aPlaying && !bPlaying) return -1
                if (!aPlaying && bPlaying) return 1
                return 0
              })

              return sortedGames.slice(0, 50).map((game, i) => {
                const steamId = game.steamId ?? (game.platform === 'steam' && game.appId ? Number(game.appId) : undefined)
                const isPlaying = !!(activeGame && (normalize(activeGame.name) === normalize(game.name) || activeGame.id === String(game.steamId) || activeGame.id === game.launchUrl || activeGame.id === game.id))
                const isMenuOpen = contextMenu?.game.id === game.id

                return (
                  <motion.div
                    key={game.id}
                    id={`sidebar-game-${game.id}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                    onContextMenu={(e) => handleContextMenu(e, game)}
                    onClick={() => {
                      if (steamId) {
                        openGameDetails(steamId)
                      } else {
                        setActiveView('library')
                      }
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all group text-left cursor-pointer relative ${
                      isPlaying ? 'bg-white/10 shadow-lg border border-white/10' : 'hover:bg-white/[0.04]'
                    } ${isMenuOpen ? 'bg-white/[0.08] ring-1 ring-white/10' : ''}`}
                  >
                    <GameIcon name={game.name} steamId={steamId} iconUrl={game.iconUrl} />
                    <span className={`text-xs transition-colors truncate flex-1 ${isPlaying ? 'text-white font-bold' : 'text-hub-text-secondary group-hover:text-hub-text'}`}>
                      {game.name}
                    </span>
                    
                    {isPlaying && (
                      <div className="flex gap-0.5 items-end h-3 flex-shrink-0 mr-0.5">
                        <motion.div animate={{ height: ["4px", "12px"] }} transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.0 }} className="w-1 bg-green-400 rounded-sm opacity-90" />
                        <motion.div animate={{ height: ["3px", "10px"] }} transition={{ duration: 0.7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.2 }} className="w-1 bg-green-400 rounded-sm opacity-90" />
                        <motion.div animate={{ height: ["5px", "11px"] }} transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.4 }} className="w-1 bg-green-400 rounded-sm opacity-90" />
                      </div>
                    )}

                    {/* 3-dots button (visible on hover or when context menu is open) */}
                    <button
                      type="button"
                      onClick={(e) => handleThreeDotsClick(e, game)}
                      className={`p-1 rounded-md hover:bg-white/15 text-white/40 hover:text-white transition-all flex-shrink-0 ${
                        isMenuOpen ? 'opacity-100 bg-white/15 text-white' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title={t('manage')}
                    >
                      <MoreVertical size={13} />
                    </button>
                  </motion.div>
                )
              })
            })()
          )}
        </div>
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <div className="px-6 py-6 mt-auto">
        <div className="flex flex-col gap-1">
          <button 
            onClick={() => setActiveView('eclipse-info')}
            className="text-left text-[10px] font-bold text-white/40 tracking-widest uppercase hover:text-white transition-colors cursor-pointer w-fit"
          >
            Eclipse Launcher
          </button>
          <div className="flex items-center gap-3 mt-1">
            <button 
              onClick={() => setActiveView('eclipse-info')}
              className="text-[10px] font-semibold text-white/70 hover:text-white hover:underline transition-colors tracking-wider cursor-pointer"
            >
              v{APP_VERSION}
            </button>
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <button 
              onClick={() => (window as any).electronAPI?.openUrl?.('https://github.com/PE4CE1/EclipseLauncher')}
              className="text-[10px] font-semibold text-white/40 hover:text-white transition-colors cursor-pointer uppercase tracking-wider"
            >
              GitHub
            </button>
          </div>
        </div>
      </div>

      {/* ─── Steam-Style Game Context Menu & Submenus ─────────────────── */}
      <AnimatePresence>
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-[999999] select-none"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              className="bg-[#0b0c10]/95 backdrop-blur-2xl border border-white/[0.08] rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.85),0_0_1px_rgba(255,255,255,0.12)] p-1.5 w-48 text-[11.5px] font-sans"
            >
              {/* ─── Minimalist Clean Play / Stop Button ─── */}
              <button
                onClick={() => {
                  if (isPlayingSelected) {
                    window.electronAPI?.stopGame?.()
                    stopPlaySession()
                  } else {
                    launchGame(contextMenu.game.launchUrl || contextMenu.game.installPath, contextMenu.game.name)
                  }
                  setContextMenu(null)
                }}
                className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[11.5px] font-semibold transition-all mb-1.5 cursor-pointer active:scale-[0.98] ${
                  isPlayingSelected
                    ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20'
                    : 'bg-white text-black hover:bg-white/90 shadow-sm'
                }`}
              >
                {isPlayingSelected ? (
                  <Square size={11} fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play size={11} fill="currentColor" strokeWidth={0} />
                )}
                <span className="tracking-wide">
                  {isPlayingSelected ? t('stopGame') : t('playGame')}
                </span>
              </button>

              {/* ─── Add / Remove Favorite ─── */}
              <button
                onClick={() => {
                  toggleFavorite(contextMenu.game.id)
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/[0.05] transition-colors text-left cursor-pointer font-medium"
              >
                <Star 
                  size={13} 
                  className={isFavoriteSelected ? 'text-amber-400 fill-amber-400' : 'text-white/40'} 
                />
                <span>{isFavoriteSelected ? t('removeFromFavorites') : t('addToFavorites')}</span>
              </button>

              {/* ─── Browse Local Files ─── */}
              <button
                onClick={async () => {
                  if (contextMenu.game.installPath) {
                    await window.electronAPI?.openPath(contextMenu.game.installPath)
                  } else {
                    showNotification(t('pathNotFound'), 'error')
                  }
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/[0.05] transition-colors text-left cursor-pointer font-medium"
              >
                <FolderOpen size={13} className="text-white/40" />
                <span>{t('browseLocalFiles')}</span>
              </button>

              <div className="h-px bg-white/[0.06] my-1 mx-1" />

              {/* ─── Fully Functional Uninstall ─── */}
              <button
                onClick={async () => {
                  const targetGame = contextMenu.game
                  setContextMenu(null)

                  if (window.electronAPI?.uninstallGame) {
                    const res = await window.electronAPI.uninstallGame({
                      id: targetGame.id,
                      name: targetGame.name,
                      installPath: targetGame.installPath,
                      launchUrl: targetGame.launchUrl,
                      steamId: targetGame.steamId,
                      appId: targetGame.appId,
                      platform: targetGame.platform,
                    })

                    if (!res?.success && res?.error) {
                      showNotification(res.error, 'error')
                      return
                    }
                  }

                  // Remove from installed games and library in launcher
                  const state = useGameStore.getState()
                  state.setInstalledGames(state.installedGames.filter(g => g.id !== targetGame.id && g.name !== targetGame.name))
                  state.removeFromLibrary(targetGame.id)
                  showNotification(t('gameRemoved'), 'info')
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-red-400/90 hover:text-red-300 hover:bg-red-500/[0.08] transition-colors text-left cursor-pointer font-medium"
              >
                <Trash2 size={13} className="text-red-400/70" />
                <span>{t('uninstallGame')}</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </aside>
  )
}
