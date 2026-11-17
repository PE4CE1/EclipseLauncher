import { useEffect } from 'react'
import { EclipseInfoView } from '../src/components/eclipse/EclipseInfoView'
import { ChangelogModal } from '../src/components/eclipse/ChangelogModal'
import { useUIStore } from '../src/store/uiStore'
import { useGameStore } from '../src/store/gameStore'
import { LauncherAtmosphere } from '../src/components/layout/LauncherAtmosphere'
export function ReleaseNotesFixture(){
  const modalOnly=new URLSearchParams(location.search).has('modalOnly')
  useEffect(()=>{
    useGameStore.getState().updateSettings({language:'de'})
    ;(window as any).__releaseFixture={open:()=>useUIStore.getState().setIsChangelogOpen(true),language:(language:'en'|'de')=>useGameStore.getState().updateSettings({language}),view:()=>useUIStore.getState().activeView}
    if(modalOnly)useUIStore.getState().setIsChangelogOpen(true)
  },[modalOnly])
  return <main className="launcher-shell h-screen overflow-hidden bg-[#09090b] text-white relative" data-atmosphere><LauncherAtmosphere active={false} enabled focused/>{!modalOnly&&<div className="relative h-full"><button type="button" id="open-release-notes" style={{position:'absolute',right:40,bottom:20,zIndex:20}} onClick={()=>useUIStore.getState().setIsChangelogOpen(true)}>Versionshinweise öffnen</button><EclipseInfoView/></div>}<ChangelogModal/></main>
}
