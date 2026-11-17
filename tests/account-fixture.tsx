import { createRoot } from 'react-dom/client'
import { AccountProtection } from '../src/components/settings/AccountProtection'
import { useGameStore } from '../src/store/gameStore'
import { useUIStore } from '../src/store/uiStore'
import { accountFixtureCalls, key } from './account-social-fixture'
import '../src/index.css'

const notifications: string[] = []
useUIStore.setState({ showNotification: message => { notifications.push(message) } })
useGameStore.getState().updateSettings({language:'en',friendCode:'ECL-TEST1',accountRecoveryReady:false,accountSecret:'OLD-KEY',accountRecoveryError:'Die bestehende Anmeldung muss zuerst der gespeicherten Konto-ID zugeordnet werden. Dein lokales Profil bleibt erhalten.',accountRecoveryErrorCode:''})
const copied: string[] = []
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{copied.push(value)}}})
;(window as any).__accountFixture={
  calls:accountFixtureCalls,notifications,copied,key,
  settings:(patch:unknown)=>useGameStore.getState().updateSettings(patch as any),
  input:(value:string)=>{const input=document.querySelector<HTMLInputElement>('[data-recovery-input]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))},
}
function Fixture(){const settings=useGameStore(state=>state.settings);return <main style={{height:'100vh',overflowY:'auto',padding:24,background:'radial-gradient(ellipse at 38% 20%,#3b251c 0, #0a0b0c 65%)',color:'#fff'}}><div style={{maxWidth:870,margin:'0 auto'}}><AccountProtection settings={settings}/></div></main>}
createRoot(document.getElementById('root')!).render(<Fixture/> )
