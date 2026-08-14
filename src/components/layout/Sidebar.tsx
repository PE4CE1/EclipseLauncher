import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, BookOpen, Library, Download, Settings,
  Bell, Gamepad2, Zap, Search, ChevronDown, User, Users, LogOut,
  Star, Clock, Loader2, ScanLine, Github, type LucideIcon,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { useScanner } from '../../hooks/useScanner'
import { useDownloadStore } from '../../store/downloadStore'
import { getCoverUrl, getHeaderUrl, getPlaceholderCover } from '../../services/assetHelper'
import { useTranslation } from '../../hooks/useTranslation'
import type { ActiveView } from '../../types/game'

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
  const { activeView, setActiveView, setIsSearchOpen, updateStatus, updateProgress, updateInfo, isFriendsOpen, setIsFriendsOpen } = useUIStore()
  const { installedGames, library, isScanning, scanMessage, settings, activeGame } = useGameStore()
  
  // Calculate total library size (installed + custom uninstalled games)
  const totalLibraryCount = installedGames.length + library.filter(g => !installedGames.some(ig => ig.name === g.name)).length
  const { scan } = useScanner()
  const downloads = useDownloadStore(state => state.downloads)
  const activeDownloadCount = Object.values(downloads).filter(d => d.status !== 'done').length
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

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
                  <span>{t('notificationsTab')}</span>
                </div>
                {(updateStatus === 'available' || updateStatus === 'downloaded') && (
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
              
              <button 
                onClick={() => {
                  if (window.electronAPI) {
                    window.electronAPI.openFriendsWindow()
                  } else {
                    setIsFriendsOpen(!isFriendsOpen)
                  }
                  setIsProfileDropdownOpen(false)
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors text-left"
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
              <span className="ml-auto text-[10px] bg-indigo-500 text-white rounded-full px-1.5 py-0.5">
                {activeDownloadCount}
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
              const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
              
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

                return (
                  <motion.button
                    key={game.id}
                    id={`sidebar-game-${game.id}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all group text-left ${isPlaying ? 'bg-white/10 shadow-lg border border-white/10' : 'hover:bg-white/[0.03]'}`}
                    onClick={() => {
                      if (steamId) {
                        useUIStore.getState().openGameDetails(steamId)
                      } else {
                        useUIStore.getState().setActiveView('library')
                      }
                    }}
                  >
                    <GameIcon name={game.name} steamId={steamId} iconUrl={game.iconUrl} />
                    <span className={`text-xs transition-colors truncate flex-1 ${isPlaying ? 'text-white font-bold' : 'text-hub-text-secondary group-hover:text-hub-text'}`}>
                      {game.name}
                    </span>
                    
                    {isPlaying ? (
                      <div className="flex gap-0.5 items-end h-3 flex-shrink-0">
                        <motion.div animate={{ height: ["4px", "12px"] }} transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.0 }} className="w-1 bg-green-400 rounded-sm opacity-90" />
                        <motion.div animate={{ height: ["3px", "10px"] }} transition={{ duration: 0.7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.2 }} className="w-1 bg-green-400 rounded-sm opacity-90" />
                        <motion.div animate={{ height: ["5px", "11px"] }} transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.4 }} className="w-1 bg-green-400 rounded-sm opacity-90" />
                      </div>
                    ) : (
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          game.platform === 'steam'  ? 'bg-blue-400' :
                          game.platform === 'epic'   ? 'bg-cyan-400' : 'bg-purple-400'
                        }`}
                      />
                    )}
                  </motion.button>
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
              v1.1.2
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
    </aside>
  )
}
