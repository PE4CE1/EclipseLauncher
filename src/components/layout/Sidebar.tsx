import { DropdownSurface } from '../shared/DropdownSurface'
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import { getNonSteamArtwork } from '../../services/nonSteamArtwork'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { QuickAccess } from './QuickAccess'
import {
  Home, BookOpen, Library, Download, Settings, HardDrive,
  Bell, Gamepad2, Zap, Search, ChevronDown, User, Users, LogOut, Film,
  Star, Clock, Loader2, ScanLine, Github, Play, Square,
  FolderOpen, Trash2, MoreVertical, Gift,
  type LucideIcon,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useDownloadStore } from '../../store/downloadStore'
import { getCoverUrl, getHeaderUrl, getCapsuleSmUrl, getPlaceholderCover, getMiniGamePreview } from '../../services/assetHelper'
import { getHardcodedSteamId, isPlaceholderAppName, extractAppIdFromPlaceholder, getKnownSteamGameName, resolveGamePreviewImage, KNOWN_GAME_PREVIEWS } from '../../services/steamService'
import { useTranslation } from '../../hooks/useTranslation'
import { APP_DISPLAY_VERSION as APP_VERSION } from '../../services/updateService'
import type { ActiveView, InstalledGame } from '../../types/game'
import '../settings/settings-surfaces.css'
import { isLocallyInstalled } from '../../services/gameInstallation'
import { useShallow } from 'zustand/react/shallow'
import { ProfileSummary } from './SidebarProfileSummary'
import { useSteamAvatarFrame } from '../../hooks/useSteamAvatarFrame'
import { buildProfileGames } from '../../services/profileModel'
import { AppModeControl } from '../settings/AppModeControl'

interface NavItem {
  id: ActiveView
  label: string
  icon: LucideIcon
}

/** Small icon for a game in the sidebar list with dynamic preview fallback */
function GameIcon({ name, steamId, iconUrl }: { name: string; steamId?: number; iconUrl?: string }) {
  const norm = name ? name.toLowerCase().trim() : ''
  const knownPreview = getNonSteamArtwork(name)?.poster || (steamId && KNOWN_GAME_PREVIEWS[steamId]) || (norm && KNOWN_GAME_PREVIEWS[norm]) || null

  const normalSources = React.useMemo(() => {
    if (knownPreview) return [knownPreview]
    const list: string[] = []
    if (steamId) {
      list.push(getHeaderUrl(steamId))
    }
    const cleanIcon = (iconUrl && !iconUrl.includes('capsule_') && !iconUrl.includes('tiny_image')) ? iconUrl : undefined
    if (cleanIcon && !list.includes(cleanIcon)) {
      list.push(cleanIcon)
    }
    return list
  }, [steamId, iconUrl, knownPreview])

  const [normalIndex, setNormalIndex] = React.useState(0)
  const [normalFailed, setNormalFailed] = React.useState(false)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = React.useState(false)

  // Reset state when game identity changes
  React.useEffect(() => {
    setNormalIndex(0)
    setNormalFailed(false)
    setPreviewUrl(null)
    setPreviewFailed(false)
  }, [steamId, iconUrl, name])

  // When normal sources fail or are empty, dynamically fetch preview
  React.useEffect(() => {
    if (knownPreview) return
    if (normalSources.length === 0 || normalFailed) {
      let isMounted = true
      resolveGamePreviewImage(name, steamId).then(img => {
        if (isMounted) {
          if (img) setPreviewUrl(img)
          else setPreviewFailed(true)
        }
      }).catch(() => {
        if (isMounted) setPreviewFailed(true)
      })
      return () => { isMounted = false }
    }
  }, [normalSources.length, normalFailed, knownPreview, name, steamId])

  const handleNormalError = () => {
    if (normalIndex < normalSources.length - 1) {
      setNormalIndex(i => i + 1)
    } else {
      setNormalFailed(true)
    }
  }

  const handlePreviewError = () => {
    setPreviewFailed(true)
  }

  // 1. If normal sources have not failed and are available:
  if (!normalFailed && normalIndex < normalSources.length && normalSources[normalIndex]) {
    return (
      <img
        key={normalSources[normalIndex]}
        src={normalSources[normalIndex]}
        alt={name}
        className="w-6 h-6 rounded flex-shrink-0 object-cover border border-white/10 bg-zinc-900 shadow-sm"
        onError={handleNormalError}
      />
    )
  }

  // 2. If normal sources failed (or were empty), but previewUrl resolved and hasn't failed:
  if (previewUrl && !previewFailed) {
    return (
      <img
        key={previewUrl}
        src={previewUrl}
        alt={name}
        className="w-6 h-6 rounded flex-shrink-0 object-cover border border-white/10 bg-zinc-900 shadow-sm"
        onError={handlePreviewError}
      />
    )
  }

  // 3. Fallback: Sleek minimalist controller icon (NEVER the browser broken image icon, and NEVER single-letter badges)
  return (
    <div className="w-6 h-6 rounded flex-shrink-0 bg-gradient-to-br from-zinc-800 to-zinc-950 border border-white/10 flex items-center justify-center shadow-sm">
      <Gamepad2 className="w-3.5 h-3.5 text-zinc-400" />
    </div>
  )
}

interface SidebarGameCardProps {
  game: InstalledGame
  isPlaying: boolean
  isSelected: boolean
  isMenuOpen: boolean
  onContextMenu: (e: React.MouseEvent, game: InstalledGame) => void
  onOpenDetails: (steamId: number, name: string) => void
  onThreeDotsClick: (e: React.MouseEvent, game: InstalledGame) => void
  manageTitle: string
}

const SidebarGameCard = React.memo(function SidebarGameCard({
  game,
  isPlaying,
  isSelected,
  isMenuOpen,
  onContextMenu,
  onOpenDetails,
  onThreeDotsClick,
  manageTitle
}: SidebarGameCardProps) {
  const isRoblox = game.name?.toLowerCase() === 'roblox' || game.id === 'roblox' || game.steamId === 999001
  const steamId = game.steamId ?? (game.platform === 'steam' && game.appId ? Number(game.appId) : (isRoblox ? 999001 : (extractAppIdFromPlaceholder(game.name, game.appId) || (game.name ? getHardcodedSteamId(game.name) : undefined) || undefined)))
  const displayName = (isPlaceholderAppName(game.name, game.appId || steamId) && steamId)
    ? (getKnownSteamGameName(steamId) || game.name)
    : game.name
  const cleanGameIcon = (game.iconUrl && !game.iconUrl.includes('capsule_') && !game.iconUrl.includes('tiny_image')) ? game.iconUrl : undefined
  const iconUrl = cleanGameIcon || (steamId ? getHeaderUrl(steamId) : undefined)

  return (
    <div
      id={`sidebar-game-${game.id}`}
      onContextMenu={(e) => onContextMenu(e, game)}
      onMouseDown={(e) => {
        if (e.button === 0) {
          onOpenDetails(steamId || (isRoblox ? 999001 : 0), displayName)
        }
      }}
      onClick={(e) => {
        e.preventDefault()
      }}
      className={`sidebar-game-item w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all group text-left cursor-pointer relative ${
        isSelected ? 'active' : ''
      } ${
        isPlaying
          ? 'bg-white/10 shadow-lg border border-white/10'
          : isSelected
            ? ''
            : 'hover:bg-white/[0.04]'
      } ${isMenuOpen ? 'bg-white/[0.08] ring-1 ring-white/10' : ''}`}
    >
      <GameIcon name={displayName} steamId={steamId} iconUrl={iconUrl} />
      <span className={`text-xs transition-colors truncate flex-1 ${
        isPlaying
          ? 'text-white font-bold'
          : isSelected
            ? 'text-white font-semibold'
            : 'text-hub-text-secondary group-hover:text-hub-text'
      }`}>
        {displayName}
      </span>

      {isPlaying && (
        <div className="flex gap-0.5 items-end h-3 flex-shrink-0 mr-0.5 equalizer-icon">
          <div className="w-1 bg-green-400 rounded-sm opacity-90 bar-1" />
          <div className="w-1 bg-green-400 rounded-sm opacity-90 bar-2" />
          <div className="w-1 bg-green-400 rounded-sm opacity-90 bar-3" />
        </div>
      )}

      {/* 3-dots button (visible on hover or when context menu is open) */}
      <button
        type="button"
        onClick={(e) => onThreeDotsClick(e, game)}
        className={`p-1 rounded-md hover:bg-white/15 text-white/40 hover:text-white transition-all flex-shrink-0 ${
          isMenuOpen ? 'opacity-100 bg-white/15 text-white' : 'opacity-0 group-hover:opacity-100'
        }`}
        title={manageTitle}
      >
        <MoreVertical size={13} />
      </button>
    </div>
  )
})

export function Sidebar() {
  useSteamAvatarFrame()
  const { 
    activeView, 
    setActiveView, 
    setIsSearchOpen, 
    updateStatus, 
    updateProgress, 
    updateInfo, 
    isFriendsOpen, 
    setIsFriendsOpen, 
    openGameDetails, 
    showNotification,
    isGameModalOpen,
    selectedGameId,
    selectedGameName
  } = useUIStore(useShallow(({ activeView, setActiveView, setIsSearchOpen, updateStatus, updateProgress, updateInfo, isFriendsOpen, setIsFriendsOpen, openGameDetails, showNotification, isGameModalOpen, selectedGameId, selectedGameName }) => ({ activeView, setActiveView, setIsSearchOpen, updateStatus, updateProgress, updateInfo, isFriendsOpen, setIsFriendsOpen, openGameDetails, showNotification, isGameModalOpen, selectedGameId, selectedGameName })))
  const { installedGames, library, isScanning, scanMessage, settings, activeGame, toggleFavorite, favoriteIds, removeFromLibrary, stopPlaySession } = useGameStore(useShallow(({ installedGames, library, isScanning, scanMessage, settings, activeGame, toggleFavorite, favoriteIds, removeFromLibrary, stopPlaySession }) => ({ installedGames, library, isScanning, scanMessage, settings, activeGame, toggleFavorite, favoriteIds, removeFromLibrary, stopPlaySession })))
  
  // Calculate total library size (installed + custom uninstalled games)
  const totalLibraryCount = useMemo(() => {
    return buildProfileGames(library, installedGames).length
  }, [installedGames, library])

  const { scan, launchGame } = useScanner()
  const downloads = useDownloadStore(state => state.downloads)
  const { activeDownloadCount, avgDownloadProgress, hasExtracting } = useMemo(() => {
    const active = Object.values(downloads).filter(d => d.status !== 'done')
    const count = active.length
    const avg = count > 0
      ? Math.round((active.reduce((acc, d) => acc + (d.progress || 0), 0) / count) * 100)
      : 0
    const extracting = active.some(d => d.status === 'extracting')
    return { activeDownloadCount: count, avgDownloadProgress: avg, hasExtracting: extracting }
  }, [downloads])

  const { t, language } = useTranslation()

  const NAV_ITEMS: NavItem[] = useMemo(() => [
    { id: 'home',      label: t('home'),      icon: Home },
    { id: 'catalogue', label: t('catalogue'), icon: BookOpen },
    { id: 'library',   label: t('library'),   icon: Library },
    { id: 'downloads', label: t('downloads'), icon: Download },
    { id: 'settings',  label: t('settings'),  icon: Settings },
  ], [t])

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!isProfileDropdownOpen) return
    const position = () => {
      const anchor = document.getElementById('sidebar-profile-menu')?.getBoundingClientRect()
      const menu = profileMenuRef.current
      if (!anchor || !menu) return
      const material = getComputedStyle(menu)
      const insetX = parseFloat(material.borderLeftWidth) + parseFloat(material.paddingLeft)
      const insetY = parseFloat(material.borderTopWidth) + parseFloat(material.paddingTop)
      const width = Math.min(anchor.width + insetX * 2, window.innerWidth - 4)
      // Keep the copied profile content at its exact anchor position, including
      // the popup border. Clamping to 4px previously shifted it by one pixel.
      const left = Math.max(2, Math.min(anchor.left - insetX, window.innerWidth - width - 2))
      const top = Math.max(2, Math.min(anchor.top - insetY, window.innerHeight - 60))
      Object.assign(menu.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${window.innerHeight - top - 4}px` })
      menu.setAttribute('data-positioned', '')
    }
    const focus = () => {
      profileMenuRef.current?.toggleAttribute('data-unfocused', document.hidden || !document.hasFocus())
    }
    position()
    profileMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    focus()
    const observer = new ResizeObserver(position)
    if (dropdownRef.current) observer.observe(dropdownRef.current)
    window.addEventListener('resize', position)
    window.addEventListener('focus', focus)
    window.addEventListener('blur', focus)
    document.addEventListener('visibilitychange', focus)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [isProfileDropdownOpen])

  // Context Menu State
  const [contextMenu, setContextMenu] = React.useState<{ game: InstalledGame; x: number; y: number } | null>(null)
  const contextMenuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if ((event.target as Element)?.closest?.('[data-app-mode-dialog]')) return
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && !profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false)
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (profileMenuRef.current) {
          event.preventDefault()
          event.stopPropagation()
        }
        setIsProfileDropdownOpen(false)
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

  const handleContextMenu = useCallback((e: React.MouseEvent, game: InstalledGame) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 195
    const menuHeight = 160
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10)
    setContextMenu({ game, x, y })
  }, [])

  const handleThreeDotsClick = useCallback((e: React.MouseEvent, game: InstalledGame) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const menuWidth = 195
    const menuHeight = 160
    const x = Math.min(rect.right + 6, window.innerWidth - menuWidth - 10)
    const y = Math.min(rect.top, window.innerHeight - menuHeight - 10)
    setContextMenu({ game, x, y })
  }, [])

  const handleOpenDetails = useCallback((steamId: number, name: string) => {
    openGameDetails(steamId, name)
  }, [openGameDetails])

  const normalize = useCallback((str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || '', [])

  const isGamePlaying = useCallback((g: any) => {
    if (!activeGame) return false
    const isRbx = g.name?.toLowerCase() === 'roblox' || g.id === 'roblox' || g.steamId === 999001
    return !!(
      (isRbx && (normalize(activeGame.name) === 'roblox' || activeGame.id === 'roblox' || activeGame.id === '999001' || activeGame.id === 'Roblox')) ||
      normalize(activeGame.name) === normalize(g.name) ||
      activeGame.id === String(g.steamId) ||
      activeGame.id === g.launchUrl ||
      activeGame.id === g.id
    )
  }, [activeGame, normalize])

  const sortedGames = useMemo(() => {
    return [...installedGames.filter(isLocallyInstalled)].sort((a, b) => {
      const aPlaying = isGamePlaying(a)
      const bPlaying = isGamePlaying(b)

      if (aPlaying && !bPlaying) return -1
      if (!aPlaying && bPlaying) return 1

      // 1. Most recently played games first
      const aLast = a.lastPlayed || 0
      const bLast = b.lastPlayed || 0
      if (aLast !== bLast) return bLast - aLast

      // 2. Highest playtime descending
      const aTime = a.playTimeMinutes || 0
      const bTime = b.playTimeMinutes || 0
      if (aTime !== bTime) return bTime - aTime

      // 3. Alphabetical fallback
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [installedGames, isGamePlaying])

  const isPlayingSelected = contextMenu ? !!(activeGame && (normalize(activeGame.name) === normalize(contextMenu.game.name) || activeGame.id === String(contextMenu.game.steamId) || activeGame.id === contextMenu.game.launchUrl || activeGame.id === contextMenu.game.id)) : false
  const isFavoriteSelected = contextMenu ? favoriteIds.includes(contextMenu.game.id) : false

  return (
    <aside className="w-64 flex-shrink-0 bg-transparent flex flex-col h-full overflow-hidden border-r border-white/[0.02]">

      {/* ─── User Profile ─────────────────────────────────────────────── */}
      <div className="p-4 relative z-40" ref={dropdownRef}>
        <button id="sidebar-profile-menu"
          type="button"
          aria-expanded={isProfileDropdownOpen}
          aria-controls="sidebar-profile-dropdown"
          data-open={isProfileDropdownOpen || undefined}

          tabIndex={isProfileDropdownOpen ? -1 : 0}
          onClick={(e) => {
            e.stopPropagation()
            setIsProfileDropdownOpen(prev => !prev)
          }}
          className="profile-menu-trigger w-full flex items-center gap-3 p-1.5 -m-1.5 rounded-lg hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
        >
          <ProfileSummary settings={settings} playing={!!activeGame} expanded={false} updateAvailable={updateStatus === 'available' || updateStatus === 'downloaded'} />
        </button>

        <>
          {createPortal(
            <DropdownSurface open={isProfileDropdownOpen}
              ref={profileMenuRef}
              id="sidebar-profile-dropdown"
              onMouseDown={event => event.stopPropagation()}
              className="profile-glass-menu fixed border border-white/[0.1] rounded-xl p-1.5 overflow-y-auto"
            >
              <button id="sidebar-profile-collapse" type="button" aria-expanded="true" aria-label={language === 'de' ? 'Profilmenü schließen' : 'Close profile menu'} onClick={event => { event.stopPropagation(); setIsProfileDropdownOpen(false) }} className="profile-menu-heading w-full flex items-center gap-3 p-1.5 rounded-lg text-left cursor-pointer">
                <ProfileSummary settings={settings} playing={!!activeGame} expanded={true} updateAvailable={updateStatus === 'available' || updateStatus === 'downloaded'} />
              </button>
              <div className="h-px bg-white/[0.08] my-1.5 mx-2" />
              <div className="profile-menu-links">
              <button id="sidebar-open-profile"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveView('profile')
                  useUIStore.getState().setSelectedFriendId(null)
                  setIsProfileDropdownOpen(false)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer text-left group"
              >
                <User size={15} className="text-white/60 group-hover:text-white transition-colors" />
                <span>{t('viewProfile')}</span>
              </button>
              
              <button id="sidebar-open-notifications"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveView('notifications')
                  setIsProfileDropdownOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2.5">
                  <Bell size={15} className="text-white/60 group-hover:text-white transition-colors" />
                  <span>{t('notificationsTab')}</span>
                </div>
                {(updateStatus === 'available' || updateStatus === 'downloaded') && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-500/15 text-rose-300 border border-rose-500/20 rounded-full">
                    UPDATE
                  </span>
                )}
              </button>
              
              <button id="sidebar-open-friends"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if ((window as any).electronAPI?.openFriendsWindow) {
                    (window as any).electronAPI.openFriendsWindow()
                  } else {
                    setIsFriendsOpen(!isFriendsOpen)
                  }
                  setIsProfileDropdownOpen(false)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors text-left cursor-pointer group"
              >
                <Users size={15} className="text-white/60 group-hover:text-white transition-colors" />
                <span className="flex-1">{t('friends')}</span>
                {!!settings.incomingFriendRequests?.length && <span data-friends-menu-requests className="rounded px-1.5 py-0.5 bg-orange-300/10 text-orange-200 text-[10px] font-semibold">{settings.incomingFriendRequests.length} {t(settings.incomingFriendRequests.length===1?'friendsRequestSingle':'friendsRequests')}</span>}
              </button>
              
              <button id="sidebar-open-free-games"
                type="button"
                onClick={event => { event.stopPropagation(); setActiveView('free-games'); setIsProfileDropdownOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors text-left cursor-pointer group"
              >
                <Gift size={15} className="text-orange-300/80 group-hover:text-orange-200 transition-colors" />
                <span>{t('freeGamesRadar')}</span>
              </button>

              <div className="h-px bg-white/[0.06] my-1 mx-2" />
              
              <button id="sidebar-open-clips"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveView('clips')
                  setIsProfileDropdownOpen(false)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors text-left cursor-pointer group"
              >
                <Film size={15} className="text-white/60 group-hover:text-white transition-colors" />
                <span className="flex-1">{t('clips')}</span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/[0.08] text-white/70 border border-white/[0.06]">
                  STUDIO
                </span>
              </button>
              <div className="h-px bg-white/[0.06] my-1 mx-2" />
              <AppModeControl menu />
              </div>
            </DropdownSurface>, document.body
          )}
        </>
      </div>


      <QuickAccess/>
      <nav className="px-2 pt-1 pb-3 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isNavActive = !isGameModalOpen && activeView === id
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onMouseDown={(e) => { if (e.button === 0) setActiveView(id) }}
              onClick={(e) => { if (e.detail === 0) setActiveView(id) }}
              className={`sidebar-item w-full ${isNavActive ? 'active' : ''}`}
            >
              <Icon size={17} className={`flex-shrink-0 transition-colors ${isNavActive ? 'text-white' : 'text-hub-muted group-hover:text-white'}`} />
              <span className="truncate">{label}</span>
              {id === 'library' && totalLibraryCount > 0 && (
                <span className={`ml-auto text-[10px] rounded-full px-1.5 py-0.5 font-medium transition-colors ${
                  isNavActive
                    ? 'bg-white/20 text-white font-semibold'
                    : 'bg-white/[0.06] text-hub-muted'
                }`}>
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
          )
        })}
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
              {sortedGames.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-0.5">
          {sortedGames.length === 0 ? (
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
            sortedGames.slice(0, 50).map((game) => {
              const isRoblox = game.name?.toLowerCase() === 'roblox' || game.id === 'roblox' || game.steamId === 999001
              const steamId = game.steamId ?? (game.platform === 'steam' && game.appId ? Number(game.appId) : (isRoblox ? 999001 : (extractAppIdFromPlaceholder(game.name, game.appId) || (game.name ? getHardcodedSteamId(game.name) : undefined) || undefined)))
              const displayName = (isPlaceholderAppName(game.name, game.appId || steamId) && steamId)
                ? (getKnownSteamGameName(steamId) || game.name)
                : game.name

              const isPlaying = isGamePlaying(game)
              const isMenuOpen = contextMenu?.game.id === game.id

              const isSelected = Boolean(
                isGameModalOpen && (
                  (steamId && selectedGameId === steamId) ||
                  (selectedGameName && (normalize(selectedGameName) === normalize(game.name) || normalize(selectedGameName) === normalize(displayName))) ||
                  (selectedGameId && (selectedGameId === game.steamId || String(selectedGameId) === String(game.id)))
                )
              )

              return (
                <SidebarGameCard
                  key={game.id}
                  game={game}
                  isPlaying={isPlaying}
                  isSelected={isSelected}
                  isMenuOpen={isMenuOpen}
                  onContextMenu={handleContextMenu}
                  onOpenDetails={handleOpenDetails}
                  onThreeDotsClick={handleThreeDotsClick}
                  manageTitle={t('manage')}
                />
              )
            })
          )}
        </div>
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="flex flex-shrink-0 items-center gap-2 px-5 pt-1 pb-2" data-sidebar-footer>
        <button id="sidebar-open-info" type="button" onClick={() => setActiveView('eclipse-info')}
          className="text-[11px] font-medium text-white/50 hover:text-white/90 transition-colors cursor-pointer tabular-nums">
          v{APP_VERSION}
        </button>
        <span className="h-2.5 w-px bg-white/10" aria-hidden="true" />
        <button type="button" aria-label="GitHub" title="GitHub"
          onClick={() => window.electronAPI?.openUrl?.('https://github.com/PE4CE1/EclipseLauncher')}
          className="flex h-6 w-6 items-center justify-center rounded text-white/40 hover:text-white/90 hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-white/40">
          <Github size={14} aria-hidden="true" />
        </button>
      </footer>

      {/* ─── Steam-Style Game Context Menu & Submenus ─────────────────── */}
      {typeof document !== 'undefined' && createPortal(
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
        </AnimatePresence>,
        document.body
      )}
    </aside>
  )
}
