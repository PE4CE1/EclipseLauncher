import {createRoot} from 'react-dom/client'
import {useClipStore} from '../src/store/clipStore'
import {useGameStore} from '../src/store/gameStore'
import {initClipEngine,startReplayBuffer,stopReplayBuffer,triggerInstantClip} from '../src/services/clipEngine'
import {ClipEditor} from '../src/components/clips/ClipEditor'
import {useDiscordClipCopy} from '../src/components/clips/useDiscordClipCopy'
import '../src/index.css'

useGameStore.getState().updateSettings({language:'en',soundEffects:false})
useClipStore.getState().setSettings({enabled:true,replayDurationSeconds:60,quality:'720p',fps:60,bitrate:'20M',captureMic:false,audioRecordingOption:'none',screenRecordingOnAppStart:false,autoStartOnGame:false,playSoundOnClip:false} as any)
initClipEngine()
function Fixture(){
  const discordCopy=useDiscordClipCopy(false)
  const clip=useClipStore(state=>state.activeClip),open=useClipStore(state=>state.isTrimmerOpen)
  return <main style={{padding:30,color:'#ccc'}}>Eclipse · isolated replay memory test<br/>Synthetic video only{open&&clip&&<ClipEditor clip={clip} discordCopy={discordCopy} onClose={()=>useClipStore.getState().setIsTrimmerOpen(false)} onDelete={()=>{}} onCopy={()=>{}} onOptimize={async()=>{}}/>}</main>
}
Object.assign(window,{__ramReplay:{start:startReplayBuffer,stop:stopReplayBuffer,save:triggerInstantClip,close:()=>{useClipStore.getState().setIsTrimmerOpen(false);useClipStore.getState().setActiveClip(null)},state:()=>({active:useClipStore.getState().isReplayBufferActive,capture:useClipStore.getState().captureStatus,clips:useClipStore.getState().clips.length,lastClip:useClipStore.getState().clips[0],settings:useClipStore.getState().settings})}})
createRoot(document.getElementById('root')!).render(<Fixture/> )
