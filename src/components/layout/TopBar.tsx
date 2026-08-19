import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, ArrowLeft, ChevronLeft, ChevronRight, Bell, Trash2, CheckCircle2, AlertTriangle, Users } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useSearchGames } from '../../hooks/useGames'
import { getHeaderUrl } from '../../services/assetHelper'
import { searchItemToGame } from '../../services/steamService'
import { useTranslation } from '../../hooks/useTranslation'

function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return deb
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
    isLightboxOpen,
    notificationHistory,
    isNotificationDropdownOpen,
    setIsNotificationDropdownOpen,
    toggleNotificationDropdown,
    markAllNotificationsRead,
    clearNotificationHistory,
    setIsFriendsOpen
  } = useUIStore()

  const { language } = useTranslation()
  const unreadCount = notificationHistory.filter(n => !n.read).length
  const notifDropdownRef = useRef<HTMLDivElement>(null)

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
    openGameDetails(item.id)
    setIsSearchOpen(false)
    setLocalQuery('')
  }

  const viewTitle: Record<string, string> = {
    home:      'Home',
    catalogue: 'Catalogue',
    library:   'My Library',
    downloads: 'Downloads',
    settings:  'Settings',
  }

  return (
    <header className={`absolute top-0 left-0 right-0 h-16 z-50 flex items-center justify-between px-6 bg-[#07080a]/75 backdrop-blur-md border-b border-white/[0.06] transition-all duration-300 pointer-events-auto ${
      isEclipseCinemaActive || isLightboxOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
    }`}>
      {/* View title or Back button & Navigation History */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => goBack()}
            disabled={!canGoBack && !isGameModalOpen}
            className={`p-1.5 rounded-lg transition-colors ${
              canGoBack || isGameModalOpen
                ? 'text-hub-text hover:text-white hover:bg-white/10 cursor-pointer'
                : 'text-hub-muted/20 cursor-not-allowed'
            }`}
            title="Back (Mouse Button 4)"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => goForward()}
            disabled={!canGoForward}
            className={`p-1.5 rounded-lg transition-colors ${
              canGoForward
                ? 'text-hub-text hover:text-white hover:bg-white/10 cursor-pointer'
                : 'text-hub-muted/20 cursor-not-allowed'
            }`}
            title="Forward (Mouse Button 5)"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {isGameModalOpen ? (
          <button 
            onClick={() => setIsGameModalOpen(false)}
            className="text-lg font-bold text-hub-text hover:text-white transition-colors cursor-pointer"
          >
            Back
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
                  placeholder="Search Steam..."
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
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-hub-surface/95 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl max-h-80 overflow-y-auto z-50 border border-white/10"
                >
                  {results.length === 0 && !isFetching && (
                    <div className="p-4 text-center text-sm text-hub-muted">
                      No results on Steam
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
                            <span className="text-xs text-indigo-400 font-medium">Free to Play</span>
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
                      See all results in Catalogue →
                    </button>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          id="topbar-search-btn"
          onClick={() => {
            if (isSearchOpen) { setIsSearchOpen(false); setLocalQuery('') }
            else setIsSearchOpen(true)
          }}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-hub-surface border border-hub-border/40 text-hub-muted hover:text-hub-text hover:bg-hub-elevated transition-all cursor-pointer"
          aria-label="Toggle search"
        >
          {isSearchOpen ? <X size={15} /> : <Search size={15} />}
        </button>

        {/* Notification Bell with Dropdown Menu */}
        <div className="relative" ref={notifDropdownRef}>
          <button
            onClick={() => {
              toggleNotificationDropdown()
              if (!isNotificationDropdownOpen && unreadCount > 0) {
                markAllNotificationsRead()
              }
            }}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg bg-hub-surface border border-hub-border/40 text-hub-muted hover:text-white hover:bg-hub-elevated transition-all cursor-pointer"
            title={language === 'de' ? 'Benachrichtigungen' : 'Notifications'}
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white animate-pulse" />
            )}
          </button>

          <AnimatePresence>
            {isNotificationDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#0e0f13]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 select-none"
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
