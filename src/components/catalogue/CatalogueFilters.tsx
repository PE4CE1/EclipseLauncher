import { Select } from '../shared/Select'
import { useTranslation } from '../../hooks/useTranslation'
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Monitor, Check } from 'lucide-react'
import { useCatalogueStore } from '../../store/catalogueStore'
import { useSourceStore } from '../../store/sourceStore'
import { useGamesDB } from '../../hooks/useGamesDB'
import { SmoothCollapse } from '../shared/SmoothCollapse'

const SORT_OPTIONS = [
  { id: 'popularity', label: 'uiPopularity' },
  { id: 'ccu', label: 'uiActivePlayers' },
  { id: 'newest', label: 'uiRecentListings' },
  { id: 'oldest', label: 'uiEarlierListings' },
  { id: 'title-asc', label: 'uiTitleAscending' },
  { id: 'title-desc', label: 'uiTitleDescending' },
  { id: 'rating-desc', label: 'uiHighestRating' },
  { id: 'rating-asc', label: 'uiLowestRating' }
] as const

// Custom Range Slider
function DualRangeSlider({ min, max, value, onChange }: { min: number, max: number, value: [number, number], onChange: (val: [number, number]) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState<'min' | 'max' | null>(null)

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(null)
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const newValue = Math.round(min + (max - min) * percent)
      
      if (isDragging === 'min') {
        onChange([Math.min(newValue, value[1] - 1), value[1]])
      } else {
        onChange([value[0], Math.max(newValue, value[0] + 1)])
      }
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, min, max, value, onChange])

  const getPercent = (val: number) => ((val - min) / (max - min)) * 100

  return (
    <div className="pt-2 pb-4">
      <div className="flex justify-between text-xs font-bold text-white mb-3">
        <span>{value[0]}</span>
        <span>{value[1]}</span>
      </div>
      <div className="relative h-1 bg-white/10 rounded-full" ref={trackRef}>
        <div 
          className="absolute h-full bg-white/80 rounded-full"
          style={{ left: `${getPercent(value[0])}%`, right: `${100 - getPercent(value[1])}%` }}
        />
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
          style={{ left: `calc(${getPercent(value[0])}% - 8px)` }}
          onMouseDown={() => setIsDragging('min')}
        />
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
          style={{ left: `calc(${getPercent(value[1])}% - 8px)` }}
          onMouseDown={() => setIsDragging('max')}
        />
      </div>
    </div>
  )
}

function Accordion({ 
  id,
  title, 
  count, 
  dotColor, 
  children, 
  defaultExpanded = false 
}: { 
  id?: string,
  title: string, 
  count?: number, 
  dotColor?: string, 
  children: React.ReactNode, 
  defaultExpanded?: boolean 
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div id={id} className="bg-hub-surface/60 border border-white/5 rounded-xl overflow-hidden">
      <button 
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ChevronDown size={16} className={`text-white/50 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          {dotColor && <div className={`w-2 h-2 rounded-full ${dotColor}`} />}
          <span className="text-sm font-bold text-white">{title}</span>
        </div>
        {count !== undefined && (
          <span className="text-xs text-white/40">{count}</span>
        )}
      </button>

      <SmoothCollapse open={expanded} className="border-t border-white/5 px-4 pb-4">
        {children}
      </SmoothCollapse>
    </div>
  )
}

function FilterCheckboxList({ 
  items, 
  totalCount, 
  searchPlaceholder,
  searchId,
  selected,
  toggle
}: { 
  items: string[], 
  totalCount: number, 
  searchPlaceholder: string,
  searchId: string,
  selected: string[],
  toggle: (item: string) => void
}) {
  const { t, locale } = useTranslation()
  const [search, setSearch] = useState('')
  
  const filtered = items.filter(i => i.toLowerCase().includes(search.toLowerCase())).slice(0, 50) // limit to 50 for performance

  return (
    <div className="pt-3">
      <p className="text-xs text-white/50 mb-3">{t('uiAvailableCount', { count: totalCount.toLocaleString(locale) })}</p>
      
      <div className="relative mb-3">
        <input 
          id={searchId}
          aria-label={searchPlaceholder}
          type="text" 
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full bg-black/20 border border-white/5 rounded-lg pl-3 pr-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
        />
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-2">
        {filtered.map(item => {
          const isSelected = selected.includes(item)
          return (
            <button 
              key={item}
              onClick={() => toggle(item)}
              className="w-full flex items-center gap-3 py-1.5 group text-left"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                isSelected ? 'bg-white border-white' : 'border-white/10 group-hover:border-white/30 bg-black/20'
              }`}>
                {isSelected && <Check size={12} className="text-black" />}
              </div>
              <span className={`text-sm transition-colors ${isSelected ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>
                {item}
              </span>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-white/30 text-center py-4">{t('uiNoResults')}</p>
        )}
      </div>
    </div>
  )
}


export function CatalogueFilters() {
  const { t } = useTranslation()
  const store = useCatalogueStore()
  
  const { db, devs: availableDevs, pubs: availablePubs } = useGamesDB()
  const sources = useSourceStore(state => state.sources)

  const availableSources = useMemo(() => 
    sources.filter(s => s.data && s.data.length > 0).map(s => s.name), 
  [sources])

  return (
    <div className="catalogue-filters view-scroll launcher-panel w-[320px] flex-shrink-0 border-l border-white/5 bg-transparent overflow-y-auto flex flex-col p-6 gap-6 custom-scrollbar">
      
      {/* Sort By Header */}
      <div className="flex items-center justify-end gap-3 relative z-10">
        <span className="text-xs font-semibold text-white/50 whitespace-nowrap flex-shrink-0">{t('uiSortBy')}</span>
        <div className="relative flex-1 min-w-0">
          <Select id="catalogue-sort-toggle" aria-label={t('uiSortBy')} value={store.sortBy} className="w-full" onChange={event=>store.setSortBy(event.target.value as typeof store.sortBy)}>
            {SORT_OPTIONS.map(option=><option key={option.id} value={option.id}>{t(option.label)}</option>)}
          </Select>
        </div>
      </div>

      {db.some(game => Number.isInteger(game.year)) && <button
        onClick={() => store.setIsModern(!store.isModern)}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-all duration-300 font-bold text-sm ${
          store.isModern 
            ? 'bg-white/10 border-white/20 text-white shadow-inner' 
            : 'bg-transparent border-white/10 text-white/70 hover:text-white hover:border-white/30'
        }`}
      >
        <Monitor size={16} className={store.isModern ? 'text-white' : 'text-white/50'} />

        {t('uiModernGames')}
      </button>}

      <div className="space-y-4">
        {/* Release Year Filter */}
        {db.some(game => Number.isInteger(game.year)) && <Accordion title={t('uiReleaseYear')} defaultExpanded>
          <div className="pt-2">
            <p className="text-xs font-semibold text-white/50 mb-4">{t('uiFilterYear')}</p>
            <DualRangeSlider 
              min={2000} 
              max={2026} 
              value={store.yearRange} 
              onChange={store.setYearRange}
            />
          </div>
        </Accordion>}

        {/* Download Sources */}
        <Accordion id="catalogue-sources-filter" title={t('uiDownloadSources')} count={availableSources.length} dotColor="bg-white/70" defaultExpanded>
          <FilterCheckboxList 
            items={availableSources} 
            totalCount={availableSources.length} 
            searchPlaceholder={t('uiSearchSources')}
            searchId="catalogue-sources-search"
            selected={store.selectedSources}
            toggle={store.toggleSource}
          />
        </Accordion>

        {/* Developer */}
        <Accordion id="catalogue-developers-filter" title={t('developer')} count={availableDevs.length} dotColor="bg-white/70">
          <FilterCheckboxList 
            items={availableDevs} 
            totalCount={availableDevs.length} 
            searchPlaceholder={t('uiSearchDevelopers')}
            searchId="catalogue-developers-search"
            selected={store.selectedDevs}
            toggle={store.toggleDev}
          />
        </Accordion>

        {/* Publisher */}
        <Accordion id="catalogue-publishers-filter" title={t('publisher')} count={availablePubs.length} dotColor="bg-white/70">
          <FilterCheckboxList 
            items={availablePubs} 
            totalCount={availablePubs.length} 
            searchPlaceholder={t('uiSearchPublishers')}
            searchId="catalogue-publishers-search"
            selected={store.selectedPubs}
            toggle={store.togglePub}
          />
        </Accordion>
      </div>

    </div>
  )
}
