import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClipsView } from '../src/components/clips/ClipsView'
import { initClipEngine, startReplayBuffer, stopReplayBuffer, triggerInstantClip } from '../src/services/clipEngine'
import { useClipStore } from '../src/store/clipStore'
import { useGameStore } from '../src/store/gameStore'
import { liveFixtureTracks, fixtureMicrophone, fixtureMicrophoneLevel, fixtureMicrophoneFailures, fixtureDisconnectMicrophone, fixtureCaptureStarts } from './clip-capture-fixture'
import { LauncherAtmosphere } from '../src/components/layout/LauncherAtmosphere'
import { ClipToastOverlay, type ClipToastData } from '../src/components/overlay/widgets/ClipToastOverlay'
import { OverlaySettingsFixture } from './overlay-settings-fixture'
import { ReleaseNotesFixture } from './release-notes-fixture'
import { ClipExperienceFixture } from './clip-experience-fixture'
import '../src/index.css'

const client=new QueryClient()
const gallery = new URLSearchParams(window.location.search).has('gallery')
const deviceRequests = { microphone: 0, enumerate: 0 }
let microphoneDevices = [{kind:'audioinput',deviceId:'default',label:'Default microphone'},{kind:'audioinput',deviceId:'fixture-mic',label:'Fixture microphone'}]
let hiddenInputs = false, denyMicrophone = false
function Fixture(){
  const [toast,setToast]=useState<ClipToastData|null>(null)
  const toastDismisses=useRef(0)
  useEffect(()=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>{deviceRequests.microphone++;if(denyMicrophone)return Promise.reject(new DOMException('Denied','NotAllowedError'));hiddenInputs=false;return fixtureMicrophone()}})
    if(gallery)Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{configurable:true,value:async()=>{deviceRequests.enumerate++;return hiddenInputs?[{kind:'audioinput',deviceId:'',label:''}]:microphoneDevices}})
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:()=>{throw new Error('Real screen capture is forbidden in this test')}})
    useGameStore.getState().updateSettings({language:'de',welcomeCompleted:true,soundEffects:false})
    if (!gallery) initClipEngine()
    ;(window as any).__clipFixture={
      start:startReplayBuffer,stop:stopReplayBuffer,save:triggerInstantClip,
      state:()=>({clips:useClipStore.getState().clips,active:useClipStore.getState().activeClip,pending:useClipStore.getState().pendingClips,saving:useClipStore.getState().isSavingClip,buffer:useClipStore.getState().isReplayBufferActive,status:useClipStore.getState().captureStatus,settings:useClipStore.getState().settings,liveTracks:liveFixtureTracks(),deviceRequests}),
      configure:(settings:unknown)=>useClipStore.getState().setSettings(settings as any),
      game:(id:string,name:string)=>useGameStore.getState().startPlaySession(id,name,true),
      close:()=>useClipStore.getState().setIsTrimmerOpen(false),
      open:async(id:string)=>{await useClipStore.getState().refreshClips();const clip=useClipStore.getState().clips.find(item=>item.id===id);if(clip){useClipStore.getState().setActiveClip(clip);useClipStore.getState().setIsTrimmerOpen(true)}},
      language:(language:'de'|'en')=>useGameStore.getState().updateSettings({language}),
      seed:(clips:any[])=>useClipStore.getState().setClips(clips),
      replay:(active:boolean)=>useClipStore.getState().setIsReplayBufferActive(active),
      toast:(value:ClipToastData|null)=>setToast(value),
      toastDismisses:()=>toastDismisses.current,
      microphoneLevel:fixtureMicrophoneLevel,
      microphoneFailures:fixtureMicrophoneFailures,disconnectMicrophone:fixtureDisconnectMicrophone,captureStarts:fixtureCaptureStarts,
      confirmationSound:(enabled:boolean)=>{useGameStore.getState().updateSettings({soundEffects:enabled});useClipStore.getState().setSettings({playSoundOnClip:enabled})},
      devices:(values:typeof microphoneDevices)=>{microphoneDevices=values;navigator.mediaDevices.dispatchEvent(new Event('devicechange'))},
      microphonePermission:(hidden:boolean,denied=false)=>{hiddenInputs=hidden;denyMicrophone=denied},
    }
    return stopReplayBuffer
  },[])
  return <QueryClientProvider client={client}><MotionConfig reducedMotion="user"><main className={'h-screen bg-[#09090b] overflow-hidden text-white relative'+(gallery?' launcher-shell':'')} data-atmosphere={gallery||undefined}>{gallery&&<LauncherAtmosphere active={false} enabled focused/>}<div className="relative h-full"><ClipsView/></div></main>{toast&&<ClipToastOverlay key={toast.id} toast={toast} onDismiss={()=>{toastDismisses.current++;setToast(null)}}/>}</MotionConfig></QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('experience')?<ClipExperienceFixture/>:new URLSearchParams(location.search).has('releaseNotes')?<QueryClientProvider client={client}><ReleaseNotesFixture/></QueryClientProvider>:new URLSearchParams(location.search).has('overlaySettings')?<QueryClientProvider client={client}><OverlaySettingsFixture/></QueryClientProvider>:<Fixture/>)
