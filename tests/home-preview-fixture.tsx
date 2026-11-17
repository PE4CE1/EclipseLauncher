import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomeView } from '../src/components/home/HomeView'
import { CURATED_HERO_GAMES } from '../src/hooks/useGames'
import { useGameStore } from '../src/store/gameStore'
import { useUIStore } from '../src/store/uiStore'
import { parseHomeStoreFeed } from '../src/services/homeDiscovery'
import storeFixture from './fixtures/home-store.json'
import { TopBar } from '../src/components/layout/TopBar'
import '../src/components/layout/launcher-atmosphere.css'
import '../src/components/settings/settings-surfaces.css'
import '../src/index.css'

const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
const feed = parseHomeStoreFeed(storeFixture,'de-DE')
for (const [key,games] of [[['steam','featured','v6'],CURATED_HERO_GAMES],[['steam','popular','v5'],feed.sellers],[['steam','trending','v5'],feed.sellers],[['steam','newReleases','v5'],feed.releases],[['steam','specials','v3'],feed.specials]] as const) client.setQueryData(key,games)
useGameStore.getState().updateSettings({language:'de',welcomeCompleted:true,keyforsteamEnabled:false})
Object.assign(window,{__homeFixture:{
  settings:()=>useGameStore.getState().settings,
  language:(language:'de'|'en')=>useGameStore.getState().updateSettings({language}),
  selection:()=>useUIStore.getState().selectedGameId,
  closeGame:()=>useUIStore.getState().goBack(),
  expireFeed:()=>client.resetQueries({queryKey:['steam','home-discovery']}),
  expireRecommendations:()=>client.resetQueries({queryKey:['steam','home-recommendations']}),
  expireCalendar:()=>client.resetQueries({queryKey:['steam','release-calendar']}),
  ageDiscovery:()=>{for (const query of client.getQueryCache().findAll()) if (query.queryKey[0]==='steam' && ['home-discovery','home-recommendations','release-calendar'].includes(String(query.queryKey[1])) && query.state.data) client.setQueryData(query.queryKey,query.state.data,{updatedAt:Date.now()-20*60_000})},
}})
function Fixture() {
  const [focused,setFocused] = useState(true)
  Object.assign((window as any).__homeFixture,{
    focus:(value:boolean)=>{setFocused(value);document.documentElement.classList.toggle('performance-mode',!value);window.dispatchEvent(new Event(value?'focus':'blur'))},
  })
  return <main className="launcher-shell" data-atmosphere data-unfocused={!focused || undefined} style={{height:'100vh',position:'relative',background:'#09090b'}}>
    <HomeView /><TopBar />
  </main>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>)
