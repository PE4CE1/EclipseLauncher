import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useSearchGames } from '../../hooks/useGames'
import { getHeaderUrl } from '../../services/assetHelper'
import { searchItemToGame } from '../../services/steamService'

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
    isEclipseCinemaActive
  } = useUIStore()

  const [localQuery, setLocalQuery] = useState('')
  const debouncedQuery = useDebounce(localQuery, 350)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: searchPages, isFetching } = useSearchGames(debouncedQuery)
  const results = searchPages?.pages?.flatMap(p => p) ?? []

  useEffect(() => {
    if (isSearchOpen) inputRef.current?.focus()
  }, [isSearchOpen])

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
    <header className={`h-16 flex-shrink-0 flex items-center justify-between px-6 sticky top-0 z-30 transition-all duration-300 ${
      isGameModalOpen 
        ? 'bg-[#07080a]/50 backdrop-blur-xl border-b border-white/[0.08]' 
        : 'bg-transparent backdrop-blur-md'
    } ${
      isEclipseCinemaActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
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
            {viewTitle[activeView] ?? 'Eclipse Launcher'}
          </h1>
        )}
      </div>

      {/* Search area */}
      <div className="relative flex items-center gap-3">
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              <div className="relative">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-hub-muted" />
                <input
                  ref={inputRef}
                  id="topbar-search-input"
                  type="text"
                  value={localQuery}
                  onChange={e => setLocalQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search Steam games…"
                  className="w-full bg-hub-elevated/50 border border-white/10 rounded-full pl-10 pr-10 py-1.5 text-sm h-9 text-white placeholder-hub-muted/70 focus:outline-none focus:border-white/20 focus:bg-hub-elevated transition-all"
                />
                {isFetching && (
                  <Loader2 size={13} className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
                )}
                {!isFetching && localQuery && (
                  <button
                    onClick={() => setLocalQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-hub-muted hover:text-white transition-colors"
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
                      {/* Thumbnail */}
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

                      {/* Info */}
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
                          <span className="text-[10px] text-hub-border">#{item.id}</span>
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
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-hub-surface border border-hub-border/40 text-hub-muted hover:text-hub-text hover:bg-hub-elevated transition-all"
          aria-label="Toggle search"
        >
          {isSearchOpen ? <X size={15} /> : <Search size={15} />}
        </button>
      </div>
    </header>
  )
}
