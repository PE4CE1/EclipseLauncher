import { useTranslation } from '../../hooks/useTranslation'
import React, { useState, useEffect, useMemo } from 'react'
import { SceneTransition } from '../shared/SceneTransition'
import { Search, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useCatalogueStore } from '../../store/catalogueStore'
import { useGamesDB, GameDBEntry } from '../../hooks/useGamesDB'
import { hasGameInSource } from '../../services/downloadEngine'
import { useSourceStore } from '../../store/sourceStore'
import { SmartImage } from '../shared/SmartImage'
import { CatalogueFilters } from './CatalogueFilters'
import { CoverLoading } from '../shared/CoverLoading'

function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return deb
}

/** Minimal card for local DB entries */
const DbGameCard = React.memo(function DbGameCard({ game }: { game: GameDBEntry }) {
  const { t } = useTranslation()
  const openGameDetails = useUIStore(s => s.openGameDetails)
  const appId = game.id

  function handleOpenGamePreview(id: number) {
    if (id) openGameDetails(id, game.name)
  }

  return (
    <div
      id={`cat-db-${appId}`}
      className="game-card store-game-card group cursor-pointer"
      onClick={() => { if (appId) handleOpenGamePreview(appId) }}
    >
      <div 
        className="store-card-art relative aspect-[2/3] rounded-xl border border-white/5 bg-[#090a0f]"
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-[#090a0f]">
          <SmartImage
            appId={appId}
            type="poster"
            alt={game.name}
            className="w-full h-full"
          />
          
          {game.ccu !== undefined && game.ccu > 0 && (
            <div className="absolute bottom-2 left-2 z-50 flex items-center gap-1.5 bg-black/80 border border-white/10 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              {game.ccu > 1000 ? (game.ccu / 1000).toFixed(1) + 'k' : game.ccu}
            </div>
          )}

          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-40">
            <div className="bg-black/70 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-lg">

              {t('uiViewDetails')}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 px-1">
        <p className="h-4 leading-4 text-xs font-semibold text-hub-text truncate transition-colors group-hover:text-white">{game.name}</p>
        <p className="h-4 leading-4 text-[11px] text-hub-muted mt-0.5 truncate">{game.developer || '—'}</p>
      </div>
    </div>
  )
})

export function CatalogueView() {
  const { t, locale } = useTranslation()
  const searchQuery = useUIStore(s => s.searchQuery)
  const setSearchQuery = useUIStore(s => s.setSearchQuery)
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const debouncedQuery = useDebounce(localQuery, 450)

  const { db, isLoading } = useGamesDB()
  const store = useCatalogueStore()
  const sources = useSourceStore(state => state.sources)

  // Apply filters
  const filteredDB = useMemo(() => {
    let result = db.filter(g => g.id !== 999001 && !g.name?.toLowerCase().includes('roblox'))

    if (store.isModern && db.some(game => Number.isInteger(game.year))) {
      result = result.filter(game => game.year !== undefined && game.year >= 2015)
    }

    // Year Filter
    if (db.some(game => Number.isInteger(game.year)) && (store.yearRange[0] > 2000 || store.yearRange[1] < 2026)) {
      result = result.filter(g => g.year && g.year >= store.yearRange[0] && g.year <= store.yearRange[1])
    }

    // 1. Text Search
    if (debouncedQuery.length >= 2) {
      const q = debouncedQuery.toLowerCase()
      result = result.filter(g => g.name.toLowerCase().includes(q))
    }

    // 2. Developer Filter
    if (store.selectedDevs.length > 0) {
      result = result.filter(g => {
        if (!g.developer) return false
        const devs = g.developer.split(',').map(d => d.trim())
        return store.selectedDevs.some(sd => devs.includes(sd))
      })
    }

    // 3. Publisher Filter
    if (store.selectedPubs.length > 0) {
      result = result.filter(g => {
        if (!g.publisher) return false
        const pubs = g.publisher.split(',').map(p => p.trim())
        return store.selectedPubs.some(sp => pubs.includes(sp))
      })
    }

    // 4. Download Sources Filter
    if (store.selectedSources.length > 0) {
      result = result.filter(g => {
        return store.selectedSources.some(ss => hasGameInSource(g.name, ss))
      })
    }

    // 5. Sorting
    result.sort((a, b) => {
      let diff = 0
      const posA = a.positive || 0
      const posB = b.positive || 0
      const negA = a.negative || 0
      const negB = b.negative || 0
      const idA = a.id || 0
      const idB = b.id || 0
      
      if (store.sortBy === 'popularity') {
        diff = posB - posA
      } else if (store.sortBy === 'ccu') {
        const ccuA = a.ccu || 0
        const ccuB = b.ccu || 0
        diff = ccuB - ccuA
      } else if (store.sortBy === 'newest') {
        diff = idB - idA
      } else if (store.sortBy === 'oldest') {
        diff = idA - idB
      } else if (store.sortBy === 'title-asc') {
        diff = (a.name || '').localeCompare(b.name || '')
      } else if (store.sortBy === 'title-desc') {
        diff = (b.name || '').localeCompare(a.name || '')
      } else if (store.sortBy === 'rating-desc') {
        const ratingA = posA / (posA + negA + 1)
        const ratingB = posB / (posB + negB + 1)
        diff = ratingB - ratingA
      } else if (store.sortBy === 'rating-asc') {
        const ratingA = posA / (posA + negA + 1)
        const ratingB = posB / (posB + negB + 1)
        diff = ratingA - ratingB
      }
      
      // Tie-breaker: if items have the exact same score or computation failed, sort by newest (ID)
      if (diff === 0 || Number.isNaN(diff)) {
        return idB - idA
      }
      return diff
    })

    return result
  }, [db, debouncedQuery, store.selectedDevs, store.selectedPubs, store.selectedSources, store.sortBy, store.yearRange, store.isModern, sources])

  const ITEMS_PER_PAGE = 30
  const totalPages = Math.ceil(filteredDB.length / ITEMS_PER_PAGE)
  const currentPageData = filteredDB.slice((store.currentPage - 1) * ITEMS_PER_PAGE, store.currentPage * ITEMS_PER_PAGE)

  return (
    <div className="h-full flex overflow-hidden">
      
      {/* Left Main Content */}
      <div className="catalogue-scroll view-scroll flex-1 flex flex-col min-w-0 overflow-y-auto relative custom-scrollbar bg-transparent">
        
        {/* Search header */}
        <div className="launcher-toolbar sticky top-0 z-20 bg-[#07080a]/80 backdrop-blur-xl border-b border-white/[0.08] px-6 py-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-2xl">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                id="catalogue-search"
                type="text"
                value={localQuery}
                onChange={e => { setLocalQuery(e.target.value); setSearchQuery(e.target.value) }}
                placeholder={t('uiSearchCatalogue')}
                className="w-full bg-black/90 border border-white/10 hover:border-white/20 focus:border-white/30 rounded-full pl-10 pr-10 py-2 text-sm h-10 text-white placeholder-white/40 focus:outline-none focus:bg-black transition-all shadow-inner"
                autoComplete="off"
              />
              {localQuery && localQuery === debouncedQuery && (
                <button
                  onClick={() => { setLocalQuery(''); setSearchQuery('') }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-hub-muted hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              )}
              {localQuery !== debouncedQuery && (
                <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
              )}
            </div>

            <div className="text-sm text-hub-muted tabular-nums whitespace-nowrap min-w-[10rem] text-right">
              {filteredDB.length === 1 ? t('uiOneGameFound') : t('uiGamesFound', { count: filteredDB.length.toLocaleString(locale) })}
            </div>
          </div>
        </div>

      {/* Grid */}
      <SceneTransition sceneKey={`${store.currentPage}:${isLoading}:${currentPageData.map(game => game.id).join(',')}`} data-catalogue-results className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
              <div key={i}>
                <div className="relative overflow-hidden aspect-[2/3] rounded-xl"><CoverLoading/></div>
                <div className="mt-3 px-1">
                  <div className="cover-loading-line h-4 w-3/4 rounded" />
                  <div className="cover-loading-line h-4 mt-0.5 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredDB.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Search size={40} className="text-hub-border mb-4" />
            <p className="text-hub-muted text-lg font-medium">{t('uiNoFilterMatches')}</p>
            <p className="text-hub-border text-sm mt-1">{t('uiAdjustFilters')}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {currentPageData.map((game: GameDBEntry) => (
                <DbGameCard key={game.id} game={game} />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-12 mb-8">
                <button
                  aria-label={t('uiPreviousPage')}
                  onClick={() => store.setCurrentPage(Math.max(1, store.currentPage - 1))}
                  disabled={store.currentPage === 1}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex items-center gap-1.5">
                  {/* Simple pagination logic for showing a few page numbers around the current page */}
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum = store.currentPage
                    if (totalPages <= 5) pageNum = i + 1
                    else if (store.currentPage <= 3) pageNum = i + 1
                    else if (store.currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = store.currentPage - 2 + i

                    return (
                      <button
                        key={pageNum}
                        onClick={() => store.setCurrentPage(pageNum)}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                          store.currentPage === pageNum 
                            ? 'bg-white text-black font-bold shadow-lg' 
                            : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}

                  {totalPages > 5 && store.currentPage < totalPages - 2 && (
                    <div className="flex items-center gap-1.5">
                      <input 
                        aria-label={t('uiPageNumber')}
                        type="number"
                        min={1} max={totalPages}
                        placeholder="..."
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = parseInt(e.currentTarget.value);
                            if (val >= 1 && val <= totalPages) store.setCurrentPage(val);
                            e.currentTarget.value = '';
                          }
                        }}
                        className="w-10 h-10 rounded-lg border bg-transparent border-transparent text-white/50 text-center text-sm focus:outline-none focus:border-white/20 focus:bg-white/5 hover:text-white transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => store.setCurrentPage(totalPages)}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                          store.currentPage === totalPages 
                            ? 'bg-white text-black font-bold shadow-lg' 
                            : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {totalPages}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  aria-label={t('uiNextPage')}
                  onClick={() => store.setCurrentPage(Math.min(totalPages, store.currentPage + 1))}
                  disabled={store.currentPage === totalPages}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </SceneTransition>
      </div>

      {/* Right Sidebar Filters */}
      <CatalogueFilters />
    </div>
  )
}
