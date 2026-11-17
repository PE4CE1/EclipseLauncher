import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, ArrowLeft, ChevronLeft, ChevronRight, Bell, Trash2, CheckCircle2, AlertTriangle, Users, Gamepad2, Zap } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { useSearchGames } from '../../hooks/useGames'
import { getHeaderUrl } from '../../services/assetHelper'
import { searchItemToGame } from '../../services/steamService'
import { useTranslation } from '../../hooks/useTranslation'
import { useClipStore } from '../../store/clipStore'
import { ControllerPopover, ControllerState } from './ControllerPopover'
import { QuickAccess } from './QuickAccess'
import { useShallow } from 'zustand/react/shallow'
import './topbar-actions.css'

function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return deb
}

function useControllerBattery(): ControllerState {
  const [info, setInfo] = useState<ControllerState>({
    connected: false,
    model: '',
    vendor: 'unknown',
    connectionType: 'none',
    level: 100,
    charging: false,
    hasExactLevel: false,
    slot: 0,
  })

  useEffect(() => {
    let isMounted = true
    let wasConnected = false
    let inFlight = false

    const updateGamepads = async () => {
      if (document.hidden || inFlight) return
      inFlight = true
      try {
        let gp: Gamepad | null = null
        let foundIndex = 0

        if (typeof navigator.getGamepads === 'function') {
          const gamepads = navigator.getGamepads()
          for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i] && gamepads[i]!.connected) {
              foundIndex = i
              gp = gamepads[i]!
              break
            }
          }
        }

        // Query native hardware telemetry via Electron IPC only when gamepad is detected or was previously connected
        let hw: any = null
        if (gp || wasConnected) {
          try {
            if (window.electronAPI?.getControllerBattery) {
              hw = await window.electronAPI.getControllerBattery()
            }
          } catch (err) {
            console.warn('[TopBar] Hardware controller query error:', err)
          }
        }

        const isConnected = Boolean((hw && hw.connected) || gp)
        wasConnected = isConnected

        if (!isConnected) {
          if (isMounted) {
            setInfo(prev => prev.connected ? { ...prev, connected: false } : prev)
          }
          return
        }

        let vendor: 'sony' | 'xbox' | 'nintendo' | 'unknown' = 'unknown'
        let model = 'Game Controller'
        let connectionType: 'bluetooth' | 'usb' | 'wireless' | 'none' = 'bluetooth'
        let level = 100
        let charging = false
        let hasExactLevel = false

        if (hw && hw.connected) {
          if (hw.model) model = hw.model
          if (hw.vendor && hw.vendor !== 'unknown') vendor = hw.vendor
          if (hw.connectionType && hw.connectionType !== 'none') connectionType = hw.connectionType
          if (hw.level !== undefined && hw.level >= 0) {
            level = hw.level
            hasExactLevel = Boolean(hw.hasExactLevel)
          }
          if (hw.charging !== undefined) charging = hw.charging
        } else if (gp) {
          const idLower = (gp.id || '').toLowerCase()
          if (idLower.includes('054c') || idLower.includes('dualsense') || idLower.includes('playstation') || idLower.includes('sony')) {
            vendor = 'sony'
            if (idLower.includes('0df2') || idLower.includes('edge')) {
              model = 'Sony DualSense Edge™'
            } else if (idLower.includes('05c4') || idLower.includes('09cc') || idLower.includes('dualshock')) {
              model = 'Sony DualShock® 4'
            } else {
              model = 'Sony PlayStation 5 DualSense™'
            }
          } else if (idLower.includes('xbox') || idLower.includes('xinput') || idLower.includes('045e')) {
            vendor = 'xbox'
            model = 'Xbox Wireless Controller'
          } else if (idLower.includes('switch') || idLower.includes('nintendo') || idLower.includes('057e')) {
            vendor = 'nintendo'
            model = 'Nintendo Switch Pro Controller'
          }

          if (idLower.includes('usb') || (!idLower.includes('wireless') && !idLower.includes('bluetooth') && !idLower.includes('bt'))) {
            connectionType = 'usb'
            charging = true
          }
        }

        if (isMounted) {
          const next: ControllerState = {
            connected: true,
            model,
            vendor,
            connectionType,
            level,
            charging,
            hasExactLevel,
            slot: foundIndex,
            rawId: gp?.id,
          }
          setInfo(prev => (Object.keys(next) as (keyof ControllerState)[]).every(key => Object.is(prev[key], next[key])) ? prev : next)
        }
      } finally { inFlight = false }
    }

    updateGamepads()
    window.addEventListener('gamepadconnected', updateGamepads)
    window.addEventListener('gamepaddisconnected', updateGamepads)
    document.addEventListener('visibilitychange', updateGamepads)
    const interval = setInterval(updateGamepads, 3000)

    return () => {
      isMounted = false
      window.removeEventListener('gamepadconnected', updateGamepads)
      window.removeEventListener('gamepaddisconnected', updateGamepads)
      document.removeEventListener('visibilitychange', updateGamepads)
      clearInterval(interval)
    }
  }, [])

  return info
}

export function TopBar() {
  const {
    searchQuery, setSearchQuery,
    isSearchOpen, setIsSearchOpen,
    activeView,
    openGameDetails, setActiveView,
    isGameModalOpen, setIsGameModalOpen, selectedGameName,
    goBack, goForward, canGoBack, canGoForward,
    isEclipseCinemaActive,
    notificationHistory,
    isNotificationDropdownOpen,
    setIsNotificationDropdownOpen,
    toggleNotificationDropdown,
    markAllNotificationsRead,
    clearNotificationHistory,
    setIsFriendsOpen
  } = useUIStore(useShallow(s => ({
    searchQuery: s.searchQuery, setSearchQuery: s.setSearchQuery,
    isSearchOpen: s.isSearchOpen, setIsSearchOpen: s.setIsSearchOpen,
    activeView: s.activeView, openGameDetails: s.openGameDetails, setActiveView: s.setActiveView,
    isGameModalOpen: s.isGameModalOpen, setIsGameModalOpen: s.setIsGameModalOpen, selectedGameName: s.selectedGameName,
    goBack: s.goBack, goForward: s.goForward, canGoBack: s.canGoBack, canGoForward: s.canGoForward,
    isEclipseCinemaActive: s.isEclipseCinemaActive,
    notificationHistory: s.notificationHistory, isNotificationDropdownOpen: s.isNotificationDropdownOpen,
    setIsNotificationDropdownOpen: s.setIsNotificationDropdownOpen, toggleNotificationDropdown: s.toggleNotificationDropdown,
    markAllNotificationsRead: s.markAllNotificationsRead, clearNotificationHistory: s.clearNotificationHistory,
    setIsFriendsOpen: s.setIsFriendsOpen,
  })))

  const { t, language } = useTranslation()
  const isTrimmerOpen = useClipStore(s => s.isTrimmerOpen)
  const { settings, activeGame } = useGameStore(useShallow(s => ({ settings: s.settings, activeGame: s.activeGame })))
  const isPerformanceMode = document.hidden || !document.hasFocus()
  const unreadCount = notificationHistory.filter(n => !n.read).length
  const notifDropdownRef = useRef<HTMLDivElement>(null)
  const controllerBattery = useControllerBattery()
  const [isControllerPopoverOpen, setIsControllerPopoverOpen] = useState(false)

  const [localQuery, setLocalQuery] = useState('')
  const debouncedQuery = useDebounce(localQuery, 350)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: searchPages, isFetching } = useSearchGames(debouncedQuery)
  const results = searchPages?.pages?.flatMap(p => p) ?? []

  useEffect(() => {
    if (isSearchOpen) inputRef.current?.focus()
  }, [isSearchOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setIsNotificationDropdownOpen(false)
      }
    }
    if (isNotificationDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isNotificationDropdownOpen, setIsNotificationDropdownOpen])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsSearchOpen(false)
      setLocalQuery('')
    }
  }

  function handleSelectGame(item: typeof results[0]) {
    openGameDetails(item.id, item.name)
    setIsSearchOpen(false)
    setLocalQuery('')
  }

  const isHeaderHidden = isEclipseCinemaActive || (activeView === 'clips' && !isGameModalOpen && isTrimmerOpen)
  const viewTitle: Record<string, string> = {
    home:      t('home'),
    catalogue: t('catalogue'),
    library:   t('uiMyLibrary'),
    downloads: t('downloads'),
    settings:  t('settings'),
    clips: t('clipsTab'),
    profile: language === 'de' ? 'Profil' : 'Profile',
    notifications: t('notificationsTab'),
    storage: t('storage'),
    'eclipse-info': 'Eclipse Launcher',
    'free-games': t('freeGamesRadar'),
  }

  return (
    <header data-view={activeView} data-game-open={isGameModalOpen || undefined} className={`topbar absolute top-0 left-0 right-0 h-16 z-50 flex items-center justify-between px-6 bg-[#07080a]/75 backdrop-blur-md border-b border-white/[0.06] transition-[opacity,background-color,border-color] duration-300 pointer-events-auto ${
      isHeaderHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
    }`}>
      {/* View title or Back button & Navigation History */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            id="topbar-history-back"
            onClick={() => goBack()}
            disabled={!canGoBack && !isGameModalOpen}
            className={`p-1.5 rounded-lg transition-colors ${
              canGoBack || isGameModalOpen
                ? 'text-hub-text hover:text-white hover:bg-white/10 cursor-pointer'
                : 'text-hub-muted/20 cursor-not-allowed'
            }`}
            title={t('uiBackMouse')}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            id="topbar-history-forward"
            onClick={() => goForward()}
            disabled={!canGoForward}
            className={`p-1.5 rounded-lg transition-colors ${
              canGoForward
                ? 'text-hub-text hover:text-white hover:bg-white/10 cursor-pointer'
                : 'text-hub-muted/20 cursor-not-allowed'
            }`}
            title={t('uiForwardMouse')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {isGameModalOpen ? (
          <button 
            id="topbar-game-back"
            onClick={() => setIsGameModalOpen(false)}
            className="text-lg font-bold text-hub-text hover:text-white transition-colors cursor-pointer"
          >

            {t('uiBack')}
          </button>
        ) : (
          <h1 className="text-lg font-bold text-hub-text">
            {viewTitle[activeView] || ''}
          </h1>
        )}
      </div>

      {/* Right controls: Search + Notifications */}
      <div className="flex items-center gap-2">
        {/* Global Steam Search */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative overflow-visible"
            >
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  id="topbar-search-input"
                  type="text"
                  placeholder={t('uiSearchSteam')}
                  value={localQuery}
                  onChange={e => setLocalQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full h-9 pl-3 pr-8 rounded-lg bg-hub-surface border border-hub-border/60 text-sm text-hub-text placeholder-hub-muted/50 focus:outline-none focus:border-white/40 transition-colors"
                />
                {isFetching && (
                  <Loader2 size={13} className="absolute right-3 text-hub-muted animate-spin" />
                )}
                {!isFetching && localQuery && (
                  <button
                    onClick={() => setLocalQuery('')}
                    className="absolute right-2.5 text-hub-muted hover:text-hub-text"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Dropdown */}
              {localQuery.length >= 2 && (
                <motion.div
                  initial={isPerformanceMode ? false : { opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{duration:isPerformanceMode?0:.16,ease:[.2,.7,.2,1]}}
                  className="app-dropdown-surface absolute top-full left-0 right-0 mt-2 bg-[#08080b] rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.98)] max-h-80 overflow-y-auto z-50 border border-white/[0.08]"
                  style={{ backgroundColor: '#08080b' }}
                >
                  {results.length === 0 && !isFetching && (
                    <div className="p-4 text-center text-sm text-hub-muted">

                      {t('uiNoSteamResults')}
                    </div>
                  )}

                  {results.slice(0, 8).map(item => (
                    <button
                      key={item.id}
                      id={`search-result-${item.id}`}
                      onClick={() => handleSelectGame(item)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-hub-elevated transition-colors text-left border-b border-hub-border/20 last:border-0"
                    >
                      <div className="w-14 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-hub-elevated">
                        <img
                          src={item.tiny_image || getHeaderUrl(item.id)}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            e.currentTarget.src = getHeaderUrl(item.id)
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-hub-text truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.price?.discount_percent ? (
                            <>
                              <span className="text-[10px] bg-green-500 text-white font-bold px-1 rounded">
                                -{item.price.discount_percent}%
                              </span>
                              <span className="text-xs text-hub-muted">{item.price.final_formatted}</span>
                            </>
                          ) : item.price?.final === 0 ? (
                            <span className="text-xs text-indigo-400 font-medium">{t('freeToPlay')}</span>
                          ) : item.price ? (
                            <span className="text-xs text-hub-muted">{item.price.final_formatted}</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}

                  {results.length > 0 && (
                    <button
                      onClick={() => {
                        setActiveView('catalogue')
                        setSearchQuery(localQuery)
                        setIsSearchOpen(false)
                      }}
                      className="w-full p-3 text-center text-xs text-indigo-400 hover:bg-hub-elevated transition-colors"
                    >

                      {t('uiCatalogueResults')}
                    </button>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>


        {/* Controller Battery Indicator & Popover Trigger */}
        {controllerBattery.connected && (
          <div className="relative">
            <button
              id="topbar-controller-btn"
              onClick={() => setIsControllerPopoverOpen(!isControllerPopoverOpen)}
              type="button"
              aria-expanded={isControllerPopoverOpen}
              className="topbar-action topbar-controller"
              data-open={isControllerPopoverOpen || undefined}
              title={`${controllerBattery.model} • ${t('controllerStatusAndTest')}`}
            >
              <Gamepad2 size={16} className="topbar-controller-icon" />
              <div className="topbar-controller-status">
                {controllerBattery.charging ? (
                  <div className="flex items-center gap-0.5 text-amber-400">
                    <Zap size={12} fill="currentColor" />
                    <span>{controllerBattery.hasExactLevel ? `${controllerBattery.level}%` : 'USB'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      controllerBattery.level > 50
                        ? 'bg-emerald-400'
                        : controllerBattery.level > 20
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`} />
                    <span className="text-white/80">
                      {controllerBattery.hasExactLevel ? `${controllerBattery.level}%` : t('controllerActive')}
                    </span>
                  </div>
                )}
              </div>
            </button>

            <ControllerPopover
              controller={controllerBattery}
              isOpen={isControllerPopoverOpen}
              onClose={() => setIsControllerPopoverOpen(false)}
            />
          </div>
        )}

        <button
          id="topbar-search-btn"
          onClick={() => {
            if (isSearchOpen) { setIsSearchOpen(false); setLocalQuery('') }
            else setIsSearchOpen(true)
          }}
          type="button"
          aria-expanded={isSearchOpen}
          data-open={isSearchOpen || undefined}
          className="topbar-action topbar-icon-action"
          aria-label={t('uiToggleSearch')}
        >
          {isSearchOpen ? <X size={15} /> : <Search size={15} />}
        </button>

        {/* Notification Bell with Dropdown Menu */}
        <QuickAccess location="topbar"/>
        <div className="relative" ref={notifDropdownRef}>
          <button
            onClick={() => {
              toggleNotificationDropdown()
              if (!isNotificationDropdownOpen && unreadCount > 0) {
                markAllNotificationsRead()
              }
            }}
            id="topbar-notifications-btn"
            type="button"
            aria-expanded={isNotificationDropdownOpen}
            aria-label={t('notificationsTab')}
            data-open={isNotificationDropdownOpen || undefined}
            className="topbar-action topbar-icon-action"
            title={language === 'de' ? 'Benachrichtigungen' : 'Notifications'}
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="topbar-unread-dot" />
            )}
          </button>

          <AnimatePresence>
            {isNotificationDropdownOpen && (
              <motion.div
                initial={isPerformanceMode ? false : { opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isPerformanceMode ? { opacity: 0 } : { opacity: 0, y: -5 }}
                transition={{ duration: isPerformanceMode ? 0 : 0.16, ease: [.2,.7,.2,1] }}
                className="app-dropdown-surface absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#08080b] border border-white/[0.08] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.98)] overflow-hidden z-50 select-none"
                style={{ backgroundColor: '#08080b' }}
              >
                {/* Header */}
                <div className="p-3.5 px-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      {language === 'de' ? 'Benachrichtigungen' : 'Notifications'}
                    </h4>
                    {notificationHistory.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-white/70">
                        {notificationHistory.length}
                      </span>
                    )}
                  </div>
                  {notificationHistory.length > 0 && (
                    <button
                      onClick={clearNotificationHistory}
                      className="text-[11px] text-white/40 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      <span>{language === 'de' ? 'Löschen' : 'Clear'}</span>
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                  {notificationHistory.length === 0 ? (
                    <div className="py-8 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-2">
                      <Bell size={20} className="text-white/20" />
                      <span>{language === 'de' ? 'Keine neuen Benachrichtigungen' : 'No notifications'}</span>
                    </div>
                  ) : (
                    notificationHistory.map((item) => {
                      const isFriendReq = item.title?.toLowerCase().includes('freund') || item.title?.toLowerCase().includes('friend')
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (isFriendReq) {
                              if ((window as any).electronAPI?.openFriendsWindow) {
                                (window as any).electronAPI.openFriendsWindow()
                              } else {
                                setIsFriendsOpen(true)
                              }
                              setIsNotificationDropdownOpen(false)
                            }
                          }}
                          className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                            isFriendReq ? 'cursor-pointer hover:bg-white/[0.06] hover:border-white/20' : 'bg-white/[0.02]'
                          } ${!item.read ? 'border-white/20 bg-white/[0.04]' : 'border-white/5'}`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-white">
                            {item.type === 'success' ? (
                              <CheckCircle2 size={14} className="text-emerald-400" />
                            ) : item.type === 'error' ? (
                              <AlertTriangle size={14} className="text-red-400" />
                            ) : isFriendReq ? (
                              <Users size={14} className="text-white" />
                            ) : (
                              <Bell size={14} className="text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <h5 className="text-xs font-bold text-white truncate">{item.title}</h5>
                              <span className="text-[10px] text-white/40 flex-shrink-0">
                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-white/70 leading-relaxed break-words">{item.message}</p>
                            {isFriendReq && (
                              <span className="inline-block mt-1.5 text-[10px] font-semibold text-white/90 bg-white/10 px-2 py-0.5 rounded-md">
                                {language === 'de' ? 'Freunde öffnen →' : 'Open Friends →'}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
