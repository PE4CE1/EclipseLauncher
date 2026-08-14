import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { GameCard } from './GameCard'
import type { SteamGame } from '../../services/steamService'

interface GameCarouselProps {
  title: string
  games: SteamGame[]
  isLoading?: boolean
  id?: string
}

function SkeletonCard() {
  return (
    <div className="w-44 flex-shrink-0">
      <div className="skeleton aspect-[2/3] rounded-xl" />
      <div className="mt-2 space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
    </div>
  )
}

export function GameCarousel({ title, games, isLoading, id }: GameCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  function scroll(direction: 'left' | 'right') {
    if (!scrollRef.current) return
    const amount = direction === 'left' ? -620 : 620
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' })
  }

  return (
    <section className="mb-8" id={id}>
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-base font-bold text-hub-text">{title}</h3>
        <div className="flex items-center gap-1">
          <button
            id={`${id}-prev`}
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-hub-muted hover:text-white hover:bg-white/5 transition-all"
            aria-label="Scroll left"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            id={`${id}-next`}
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-hub-muted hover:text-white hover:bg-white/5 transition-all"
            aria-label="Scroll right"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

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
