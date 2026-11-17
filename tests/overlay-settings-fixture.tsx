import { useEffect } from 'react'
import { GameplayOverlayTab } from '../src/components/settings/GameplayOverlayTab'
import { useGameStore } from '../src/store/gameStore'
import { LauncherAtmosphere } from '../src/components/layout/LauncherAtmosphere'
import { QuickAccess } from '../src/components/layout/QuickAccess'
import { QuickAccessSettings } from '../src/components/settings/QuickAccessSettings'
import { TitleBar } from '../src/components/layout/TitleBar'
import { useUIStore } from '../src/store/uiStore'
import { useClipStore } from '../src/store/clipStore'
export function OverlaySettingsFixture(){
  const settings=useGameStore(state=>state.settings)
  const quick=new URLSearchParams(location.search).has('quickAccess')
  useEffect(()=>{
    useGameStore.getState().updateSettings({language:'de',overlayPerformance:false,overlayCrosshair:false,overlayCps:false,overlayController:false,overlayMedia:false,overlayGeneralAlwaysOn:false})
    ;(window as any).__overlaySettings={state:()=>useGameStore.getState().settings,language:(language:'de'|'en')=>useGameStore.getState().updateSettings({language}),quickState:()=>({view:useUIStore.getState().activeView,clipSettings:useClipStore.getState().isSettingsOpen,mic:useClipStore.getState().settings.captureMic}),buffer:(active:boolean)=>useClipStore.getState().setIsReplayBufferActive(active)}
  },[])
  return <main className="launcher-shell settings-view h-screen bg-[#09090b] text-white relative" style={{overflowY:'auto'}} data-atmosphere><LauncherAtmosphere active={false} enabled focused/>{quick&&<aside style={{position:'fixed',top:0,left:0,width:240,height:'100vh',borderRight:'1px solid #ffffff10',zIndex:10,background:'#111011'}}><div data-test-profile style={{padding:24,fontSize:13}}>Eclipse Player</div><QuickAccess/></aside>}<div className="relative" style={{padding:28,marginLeft:quick?240:0}}>{quick&&<><div style={{position:"fixed",top:0,left:240,right:0,zIndex:20}}><TitleBar/></div><div style={{position:"fixed",top:40,right:16,zIndex:20,display:"flex",alignItems:"center",gap:8}}><QuickAccess location="topbar"/><span data-test-bell>●</span></div><QuickAccessSettings/></>}<GameplayOverlayTab settings={settings} updateSettings={patch=>useGameStore.getState().updateSettings(patch)}/></div></main>
}
