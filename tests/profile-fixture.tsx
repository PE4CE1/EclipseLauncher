import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { ProfileView } from '../src/components/profile/ProfileView'
import { useGameStore } from '../src/store/gameStore'
import { useUIStore } from '../src/store/uiStore'
import { profileSocialFixture } from './profile-social-fixture'
import { fetchSteamUserProfile } from '../src/services/steamService'
import { profileBannerPreset } from '../src/components/profile/ProfileBannerArt'
import { Sidebar } from '../src/components/layout/Sidebar'
import '../src/index.css'

const names = ['Rocket League', 'HELLDIVERS™ 2', 'ELDEN RING', 'Portal 2', 'Counter-Strike 2', 'PEAK', 'Terraria', 'Stardew Valley']
const ids = [252950, 553850, 1245620, 620, 730, 3527290, 105600, 413150]
const games = names.map((name,index)=>({id:`steam-${ids[index]}`,steamId:ids[index],name,platform:'steam' as const,installed:true,addedAt:0,playTimeMinutes:[3912,962,1204,210,150,325,70,0][index],lastPlayed:Date.now()-index*86400000,coverImage:undefined}))
useGameStore.setState({ library:games, installedGames:games.slice(0,3).map(game=>({...game,installPath:'C:/fixture/game',launchUrl:'steam://fixture'})), settings:{language:'de',username:'SERGEANTPEACE(GER)',bio:'keep going\nRocket League, Koop-Abende und ab und zu ein guter Singleplayer.',friendCode:'ECL-TEST1',avatarUrl:'https://fixture.eclipse/avatar.png',bannerUrl:'',steamLevel:44,steamGamesCount:226,steamProfileUrl:'https://steamcommunity.com/id/fixture',steamFavoriteBadge:{name:'Red LED',iconUrl:'https://fixture.eclipse/badge.png'},steamBadges:[{name:'Red LED',iconUrl:'https://fixture.eclipse/badge.png',xp:'100 XP'},{name:'Community',iconUrl:'https://fixture.eclipse/badge.png',xp:'200 XP'}],steamRecentGames:[],profilePinnedGames:['steam:252950','steam:553850','steam:1245620'],showHardwareSpecs:true,hardwareSpecs:{cpu:'AMD Ryzen 7 7800X3D',gpu:'NVIDIA GeForce RTX 4070',ram:'32 GB DDR5',display:'2560 × 1440 · 165 Hz'},socialDiscord:'sergeantpeace',profileShowPlaytime:true,profileShowSteamStats:true,soundEffects:false,desktopNotifications:false} })
;(window as any).__profileFixture={
  settings:(patch:unknown)=>useGameStore.getState().updateSettings(patch as any),
  state:()=>({settings:useGameStore.getState().settings,view:useUIStore.getState().activeView,selectedGame:useUIStore.getState().selectedGameId}),
  friend:(id:string|null)=>useUIStore.getState().setSelectedFriendId(id),
  social:profileSocialFixture,
  fetchSteam:fetchSteamUserProfile,
  bannerPreset:profileBannerPreset,
  game:(name:string|null)=>useGameStore.setState({activeGame:name?{id:'steam-252950',name,startTime:Date.now()-12*60000}:null}),
  seed:(count:number)=>useGameStore.setState({library:[...games,...Array.from({length:count},(_,i)=>({id:`test-${i}`,name:`Game ${i}`,platform:'custom' as const,installed:false,addedAt:0,playTimeMinutes:0}))]}),
}
function Fixture() {
  const [sidebar, setSidebar] = useState(false)
  useEffect(() => { (window as any).__profileFixture.sidebar = setSidebar }, [])
  return <main className="h-screen flex bg-[#0c0c0e] text-white">{sidebar && <Sidebar/>}<div className="h-full flex-1 min-w-0"><ProfileView/></div></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/>)
