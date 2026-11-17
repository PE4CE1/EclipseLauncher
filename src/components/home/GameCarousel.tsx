import { useTranslation } from '../../hooks/useTranslation'
import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { GameCard } from './GameCard'
import type { SteamGame } from '../../services/steamService'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'
import { CoverLoading } from '../shared/CoverLoading'

interface GameCarouselProps {
  title: string
  games: SteamGame[]
  isLoading?: boolean
  id?: string
  description?: string
  moreLabel?: string
  onMore?: () => void
  emptyMessage?: string
}

function SkeletonCard() {
  return (
    <div className="w-44 flex-shrink-0">
      <div className="relative overflow-hidden aspect-[2/3] rounded-xl"><CoverLoading/></div>
      <div className="mt-2 space-y-1.5">
        <div className="cover-loading-line h-3 w-3/4 rounded" />
        <div className="cover-loading-line h-2.5 w-1/2 rounded" />
      </div>
    </div>
  )
}

export function GameCarousel({ title, games, isLoading, id, description, moreLabel, onMore, emptyMessage }: GameCarouselProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotionPreference()

  function scroll(direction: 'left' | 'right') {
    if (!scrollRef.current) return
    const row = scrollRef.current
    const cardWidth = row.firstElementChild?.getBoundingClientRect().width || 176
    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
    const stride = cardWidth + gap
    const amount = Math.max(1, Math.floor(row.clientWidth / stride)) * stride
    row.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <section className="mb-8" id={id}>
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="home-row-heading"><h3 className="text-base font-bold text-hub-text">{title}</h3>{description && <p>{description}</p>}</div>
        <div className="flex items-center gap-1">
          {onMore && <button type="button" className="home-row-more" onClick={onMore}>{moreLabel}</button>}
          <button
            id={`${id}-prev`}
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-hub-muted hover:text-white hover:bg-white/5 transition-all"
            aria-label={t('uiScrollLeft')}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            id={`${id}-next`}
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-hub-muted hover:text-white hover:bg-white/5 transition-all"
            aria-label={t('uiScrollRight')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {!isLoading && !games.length && emptyMessage && <p className="home-releases-empty" role="status">{emptyMessage}</p>}
      <div ref={scrollRef} className="carousel-container" role="list">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="carousel-item"><SkeletonCard /></div>
            ))
          : games.map((game, i) => (
              <div key={game.steamId} className="carousel-item" role="listitem">
                <GameCard game={game} index={i} />
              </div>
            ))
        }
      </div>
    </section>
  )
}
