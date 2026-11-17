import {createRoot} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {GameDetailModal} from '../src/components/shared/GameDetailModal'
import {TopBar} from '../src/components/layout/TopBar'
import {useGameStore} from '../src/store/gameStore'
import {useUIStore} from '../src/store/uiStore'
import '../src/index.css'
const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
for(const lang of ['german','english'])client.setQueryData(['steam','detail',1091500,lang,'DE'],{steam_appid:1091500,name:'Cyberpunk 2077',type:'game',is_free:false,short_description:'An isolated price comparison fixture.',price_overview:{currency:'EUR',initial:4000,final:4000,discount_percent:0,final_formatted:'40,00 €'},screenshots:[{id:1,path_thumbnail:'https://shared.fastly.steamstatic.com/steam/apps/1091500/header.jpg',path_full:'https://shared.fastly.steamstatic.com/steam/apps/1091500/full.jpg'}],movies:[],genres:[],categories:[],developers:['CD Projekt RED'],publishers:['CD Projekt RED'],pc_requirements:{},release_date:{date:'2020'},platforms:{windows:true}})
useGameStore.getState().updateSettings({language:'en',keyforsteamEnabled:true,welcomeCompleted:true})
useUIStore.getState().openGameDetails(1091500,'Cyberpunk 2077')
Object.assign(window,{__dealsFixture:{
  language:(language:'de'|'en')=>useGameStore.getState().updateSettings({language}),selection:()=>useUIStore.getState().isGameModalOpen,lightbox:()=>useUIStore.getState().isLightboxOpen,
  owned:(installed:boolean)=>{
    const game={id:'steam_1091500',steamId:1091500,name:'Cyberpunk 2077',platform:'steam' as const,installed,addedAt:1,installPath:installed?'C:/fixture/cyberpunk':undefined}
    useGameStore.getState().setLibrary([game]);useGameStore.getState().setInstalledGames(installed?[{...game,installPath:'C:/fixture/cyberpunk',launchUrl:'steam://rungameid/1091500'}]:[])
  },
  freeMetadata:(free:boolean)=>{for(const lang of ['german','english'])client.setQueryData(['steam','detail',1091500,lang,'DE'],(prior:object)=>({...prior,is_free:free}))},
}})
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><main style={{height:'100vh',background:'#09090b'}}><TopBar/><GameDetailModal/></main></QueryClientProvider>)
