import { useEffect } from 'react'
import { HeroSection } from './HeroSection'
import { GameCarousel } from './GameCarousel'
import {
  usePopularGames,
  useTrendingGames,
  useNewReleases,
  useFeaturedGames,
  useSpecialOffers,
} from '../../hooks/useGames'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'

export function HomeView() {
  const { setFeaturedGame } = useUIStore()
  const { language } = useTranslation()

  const featured = useFeaturedGames()
  const popular = usePopularGames()
  const trending = useTrendingGames()
  const newReleases = useNewReleases()
  const specials = useSpecialOffers()

  const heroGames = (featured.data && featured.data.length > 0)
    ? featured.data
    : (popular.data ?? []).slice(0, 15)

  useEffect(() => {
    if (heroGames.length > 0) setFeaturedGame(heroGames[0])
  }, [featured.data, popular.data])

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-[#040405]">
      {/* 1. Hero Showcase Section */}
      {heroGames.length > 0 ? (
        <HeroSection games={heroGames} />
      ) : (
        <div className="w-full h-[520px] skeleton" />
      )}

      <div className="py-6 space-y-8">
        {/* 2. Special Offers & Deals */}
        {specials.data && specials.data.length > 0 && (
          <div className="px-6">
            <GameCarousel
              id="carousel-specials"
              title={language === 'de' ? '🏷️ Sonderangebote & Deals' : '🏷️ Special Offers & Deals'}
              games={specials.data}
              isLoading={specials.isLoading}
            />
          </div>
        )}

        {/* 3. Most Played Games */}
        <div className="px-6">
          <GameCarousel
            id="carousel-popular"
            title={language === 'de' ? '⭐ Meistgespielte Hits' : '⭐ Most Played Games'}
            games={popular.data ?? []}
            isLoading={popular.isLoading}
          />
        </div>

        {/* 4. Trending Games */}
        <div className="px-6">
          <GameCarousel
            id="carousel-trending"
            title={language === 'de' ? '📈 Trending Now' : '📈 Trending Now'}
            games={trending.data ?? []}
            isLoading={trending.isLoading}
          />
        </div>

        {/* 5. Hot Releases */}
        <div className="px-6 pb-8">
          <GameCarousel
            id="carousel-new"
            title={language === 'de' ? '🔥 Hot Releases' : '🔥 Hot Releases'}
            games={newReleases.data ?? []}
            isLoading={newReleases.isLoading}
          />
        </div>
      </div>
    </div>
  )
}
