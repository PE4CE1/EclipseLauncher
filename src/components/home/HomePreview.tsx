import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUpRight, Compass, RefreshCw } from 'lucide-react'
import { HeroSection } from './HeroSection'
import { GameCarousel } from './GameCarousel'
import { HomeUpdates } from './HomeUpdates'
import { HomeUpcoming } from './HomeUpcoming'
import { HomeCollection } from './HomeCollection'
import { CURATED_HERO_GAMES } from '../../hooks/useGames'
import { fetchHomeStoreFeed } from '../../services/homeDiscovery'
import { fetchHomeRecommendations } from '../../services/homeRecommendations'
import { localizeCuratedGame } from '../../i18n/gameContent'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'

export function HomePreview() {
  const { language, t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const [collection, setCollection] = useState<'releases'|'specials'|'sellers'|null>(null)
  const closeCollection = useCallback(() => setCollection(null), [])
  const reducedMotion = useReducedMotionPreference()
  const catalogue = useUIStore(state => state.setActiveView)
  const setFeaturedGame = useUIStore(state => state.setFeaturedGame)
  const { data, isPending, isError, refetch, isFetching } = useQuery({ queryKey: ['steam','home-discovery','v2',language],
    queryFn: ({signal}) => fetchHomeStoreFeed(language, signal), staleTime: 15*60_000, gcTime: 60*60_000, retry: 1, refetchOnWindowFocus: false })
  const recommendations = useQuery({ queryKey: ['steam','home-recommendations','v2',language],
    queryFn: ({signal}) => fetchHomeRecommendations(language, data, signal), enabled: !isPending,
    staleTime: 15*60_000, gcTime: 60*60_000, retry: false, refetchOnWindowFocus: false })
  const highlights = useMemo(() => recommendations.data?.highlights.length ? recommendations.data.highlights : CURATED_HERO_GAMES.slice(0,8).map(game => localizeCuratedGame(game, language)), [recommendations.data, language])
  const releases = recommendations.data?.releases || []
  const newsGames = useMemo(() => [...new Map([...highlights,...(recommendations.data?.releases || []),...(data?.sellers || [])].map(game => [game.steamId,game])).values()],[highlights,recommendations.data?.releases,data?.sellers])
  const calendarSeeds = useMemo(() => [...(data?.upcoming || []),...(data?.releases || []),...(recommendations.data?.releases || [])],[data?.upcoming,data?.releases,recommendations.data?.releases])
  useEffect(() => { if (highlights[0]) setFeaturedGame(highlights[0]) }, [highlights, setFeaturedGame])
  const jump = (id: string) => {
    const target = root.current?.querySelector<HTMLElement>('#'+id), scroll = root.current
    if (target && scroll) scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top-scroll.getBoundingClientRect().top - 24, behavior: reducedMotion ? 'auto' : 'smooth' })
  }
  const collectionTitle = collection === 'releases' ? t('homeNewReleases') : collection === 'specials' ? t('homeDealsTitle') : t('homeBestsellers')
  return <div ref={root} className="home-view home-discovery h-full overflow-y-auto overflow-x-hidden">
    <HeroSection key={language} games={highlights} compact />
    <div className="home-discovery-content">
      <nav className="home-discovery-nav" aria-label={t('homeDiscoverNav')}><span><Compass size={14} />{t('homeDiscover')}</span><div>
        {([['home-new','homeNewReleases'],['home-deals','homeDeals'],['home-updates','homeUpdates'],['home-upcoming','calendarNav']] as const).map(([id,key]) => <button key={id} type="button" onClick={() => jump(id)}>{t(key)}<ArrowDown size={11} /></button>)}
      </div><button type="button" className="home-catalogue-link" onClick={() => catalogue('catalogue')}>{t('homeCatalogue')}<ArrowUpRight size={12} /></button></nav>
      {isError && <div className="home-feed-empty" role="status"><span>{t('homeFeedFailed')}</span><button disabled={isFetching} type="button" onClick={() => { void refetch() }}><RefreshCw size={12} />{t('homeRetry')}</button></div>}
      <GameCarousel id="home-new" title={t('homeNewReleases')} description={t('homeReleasesDescription')} games={releases} isLoading={recommendations.isPending} moreLabel={t('homeViewAll')} onMore={releases.length ? () => setCollection('releases') : undefined} emptyMessage={recommendations.isError ? t('homeRecommendationsFailed') : t('homeReleasesEmpty')} />
      {recommendations.isError && <button className="home-recommendations-retry" type="button" disabled={recommendations.isFetching} onClick={() => { void recommendations.refetch() }}><RefreshCw size={12} />{t('homeRetry')}</button>}
      <GameCarousel id="home-deals" title={t('homeDealsTitle')} description={t('homeDealsDescription')} games={data?.specials || []} isLoading={isPending} moreLabel={t('homeViewAll')} onMore={data?.specials.length ? () => setCollection('specials') : undefined} />
      <HomeUpcoming games={calendarSeeds} pending={isPending} />
      <HomeUpdates games={newsGames} />
      <GameCarousel id="home-bestsellers" title={t('homeBestsellers')} description={t('homeBestsellersDescription')} games={data?.sellers || []} isLoading={isPending} moreLabel={t('homeViewAll')} onMore={data?.sellers.length ? () => setCollection('sellers') : undefined} />
      <footer className="home-discovery-footer"><span>Steam · {t('homeFooter')}</span><button type="button" onClick={() => root.current?.scrollTo({top:0,behavior: reducedMotion ? 'auto' : 'smooth'})}>{t('homeBackToTop')} ↑</button></footer>
    </div>
    {collection && <HomeCollection title={collectionTitle} games={collection === 'releases' ? releases : data?.[collection] || []} onClose={closeCollection} />}
  </div>
}
