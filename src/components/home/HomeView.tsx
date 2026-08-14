import { useEffect } from 'react'
import { HeroSection } from './HeroSection'
import { GameCarousel } from './GameCarousel'
import { usePopularGames, useTrendingGames, useNewReleases, useFeaturedGames } from '../../hooks/useGames'
import { useUIStore } from '../../store/uiStore'

export function HomeView() {
  const { setFeaturedGame } = useUIStore()

  const featured     = useFeaturedGames()
  const popular      = usePopularGames()
  const trending     = useTrendingGames()
  const newReleases  = useNewReleases()

  const heroGames = (featured.data && featured.data.length > 0) 
    ? featured.data 
    : (popular.data ?? []).slice(0, 15)

  useEffect(() => {
    if (heroGames.length > 0) setFeaturedGame(heroGames[0])
  }, [featured.data, popular.data])

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero section */}
      {heroGames.length > 0 ? (
        <HeroSection games={heroGames} />
      ) : (
        <div className="w-full h-[420px] skeleton" />
      )}

      {/* Game carousels */}
      <div className="px-6 py-6">
        <GameCarousel
          id="carousel-popular"
          title="🔥 Popular Games"
          games={popular.data ?? []}
          isLoading={popular.isLoading}
        />
        <GameCarousel
          id="carousel-trending"
          title="📈 Trending Now"
          games={trending.data ?? []}
          isLoading={trending.isLoading}
        />
        <GameCarousel
          id="carousel-new"
          title="✨ New Releases"
          games={newReleases.data ?? []}
          isLoading={newReleases.isLoading}
        />
      </div>
    </div>
  )
}
