import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { HeroSection } from '../src/components/home/HeroSection'
import { GameCarousel } from '../src/components/home/GameCarousel'
import { GameDetailModal } from '../src/components/shared/GameDetailModal'
import { useGameStore } from '../src/store/gameStore'
import { useUIStore } from '../src/store/uiStore'
import type { SteamGame } from '../src/services/steamService'
import '../src/index.css'

const examples: SteamGame[] = [
  { steamId: 1091500, name: 'Cyberpunk 2077', genres: ['Action', 'RPG', 'Open World'], releaseDate: '10 Dec, 2020', shortDescription: 'Cyberpunk 2077 is an open-world, action-adventure RPG set in the megalopolis of Night City.' },
  { steamId: 1245620, name: 'ELDEN RING', genres: ['Action', 'RPG', 'Dark Fantasy'], releaseDate: '25 Feb, 2022', shortDescription: 'Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring.' },
  { steamId: 5335510, name: 'Moon Sweepers', genres: ['Co-op', 'Simulation'], releaseDate: '23 Oct, 2026', discountPercent: 15 },
]
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const detailGames = [...examples, { steamId: 934999, name: 'Layout Stability Game', shortDescription: '', releaseDate: '2026' }]
for (const game of detailGames) queryClient.setQueryData(['steam', 'detail', game.steamId, 'german', 'DE'], {
  name: game.name, steam_appid: game.steamId, type: 'game', short_description: game.shortDescription,
  about_the_game: '<p>A stable game detail page with scrolling content.</p>'.repeat(80),
  developers: ['Fixture Studio'], publishers: ['Fixture Studio'], genres: [], categories: [], screenshots: [], movies: [],
  pc_requirements: { minimum: '<p>Fixture requirements</p>' }, release_date: { date: game.releaseDate }, platforms: { windows: true },
})

function Fixture() {
  const [games, setGames] = useState(location.hash === '#cover-loading' ? [...examples,...Array.from({length:30},(_,index)=>({steamId:800000+index,name:'Cover '+index}))] : examples)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    useGameStore.getState().updateSettings({ language: 'de', welcomeCompleted: true, keyforsteamEnabled: false })
    ;(window as any).__storeFixture = {
      setLoading,
      reverse: () => setGames(current => [...current].reverse()),
      modal: (open: boolean) => useUIStore.setState({ isGameModalOpen: open }),
      openDetails: (index = 0) => useUIStore.getState().openGameDetails(detailGames[index].steamId, detailGames[index].name),
      refreshFeed: () => setGames(current => current.map(game => game.steamId === examples[0].steamId ? { ...game, genres: [], shortDescription: undefined, releaseDate: undefined } : game)),
      enrichDetails: (index = 3) => queryClient.setQueryData(['steam', 'detail', detailGames[index].steamId, 'german', 'DE'], (data: any) => ({ ...data, developers: ['Late Developer'], publishers: ['Late Publisher'], release_date: {date:'30 Oct, 2026'} })),
      closeDetails: () => flushSync(() => useUIStore.getState().goBack()),
      installationScenario: () => useGameStore.getState().setInstalledGames([
        {id:'steam_1091500',steamId:1091500,name:'Cyberpunk 2077',platform:'steam',installed:false,installPath:'',launchUrl:'steam://install/1091500'},
        {id:'steam_111111',steamId:111111,name:'ELDEN RING Demo',platform:'steam',installed:true,installPath:'C:/Fixture/EldenDemo',launchUrl:'steam://run/111111'},
        {id:'steam_5335510',steamId:5335510,name:'Moon Sweepers',platform:'steam',installed:true,installPath:'C:/Fixture/Moon',launchUrl:'steam://run/5335510'},
      ]),
      lateDetail: () => flushSync(() => queryClient.setQueryData(['steam', 'detail', examples[0].steamId, 'german', 'DE'], (data: any) => ({...data,name:'LATE_RESPONSE'}))),
    }
  }, [])
  return <QueryClientProvider client={queryClient}><MotionConfig reducedMotion="user"><main className="bg-[#040405]"><HeroSection games={games} /><div className="px-6 py-6"><GameCarousel id="store-fixture-deals" title="Sonderangebote & Deals" games={games} isLoading={loading}/></div><GameDetailModal /></main></MotionConfig></QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
