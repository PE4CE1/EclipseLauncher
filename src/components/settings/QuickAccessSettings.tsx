import { PanelLeft, Bell, PanelTop } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { persistAppSettings } from '../../services/settingsPersistence'
import { quickAccessVisible, type QuickAccessLocation } from '../../services/quickAccess'
import '../layout/quick-access.css'
import { SettingsToggle } from '../clips/ClipSettingsControls'

export function QuickAccessSettings(){
  const settings=useGameStore(state=>state.settings),de=settings.language==='de'
  const locations:[QuickAccessLocation,typeof PanelLeft,string,string][]=[
    ['sidebar',PanelLeft,de?'Unter dem Profil':'Below profile',de?'In der Seitenleiste':'In the sidebar'],
    ['topbar',Bell,de?'Oben rechts':'Top right',de?'In der oberen Navigationsleiste':'In the top navigation bar'],
    ['titlebar',PanelTop,de?'Neben Eclipse':'Next to Eclipse',de?'Direkt in der Titelleiste':'In the window title bar'],
  ]
  return <section className="quick-access-settings" aria-label={de?'Schnellzugriffe':'Quick actions'}><h3>{de?'Schnellzugriffe':'Quick actions'}</h3><p>{de?'Wähle, wo deine drei Plätze erscheinen. Du kannst mehrere Positionen aktivieren. Ein Plus belegt einen freien Platz.':'Choose where your three slots appear. You can enable multiple locations. Use a plus to assign an empty slot.'}</p><div>{locations.map(([id,Icon,label,description])=><div key={id} className="quick-access-location" data-quick-location-setting={id}><Icon size={17}/><SettingsToggle title={label} description={description} checked={quickAccessVisible(settings.quickAccessLocations,id)} onChange={()=>void persistAppSettings({quickAccessLocations:{...useGameStore.getState().settings.quickAccessLocations,[id]:!quickAccessVisible(useGameStore.getState().settings.quickAccessLocations,id)}})}/></div>)}</div></section>
}
