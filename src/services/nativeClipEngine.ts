import {useClipStore} from '../store/clipStore'
import {useGameStore} from '../store/gameStore'
import {sendAppNotification} from './notificationService'
import {playNotificationSound} from './soundService'
import {clipProfileDuration} from './clipProfiles'
import {setCaptureMemoryActive} from './mediaMemory'
import {captureErrorMessage,describeCaptureError,nativeFailureNeedsRestart} from './captureErrors'
import type {ClipSettings} from '../types/game'

let initialized=false,active=false,claimed=false,wanted=false
let generation=0,startRevision=0,recoveryAttempts=0,lastStartedAt=0
let pendingStart:Promise<boolean>|undefined,pendingStop:Promise<unknown>|undefined
let restartTimer:ReturnType<typeof setTimeout>|undefined
let recordingSettings:ClipSettings|undefined,detectedGameName:string|undefined
const cleanups:(()=>void)[]=[]
const keep=(cleanup:unknown)=>{if(typeof cleanup==='function')cleanups.push(cleanup as ()=>void)}
const de=()=>useGameStore.getState().settings.language!=='en'
const settingsForGame=()=>{
  const settings=useClipStore.getState().settings
  return{...settings,replayDurationSeconds:clipProfileDuration(settings,detectedGameName||useGameStore.getState().activeGame?.name)}
}
function releaseCapture(){
  const stop=claimed;claimed=false;active=false;recordingSettings=undefined
  if(stop){
    // Serialize release before another native owner claims audio and video.
    const previous=pendingStop,api=window.electronAPI?.clips
    pendingStop=(async()=>{await previous?.catch(()=>{});await api?.nativeStop?.().catch(()=>{});await api?.stopAudio?.().catch(()=>{})})()
  }
  setCaptureMemoryActive(false)
  void window.electronAPI?.clips?.setCaptureActive?.(false).catch(()=>{})
}
function showFailure(error:unknown){
  const code=describeCaptureError(error)
  useClipStore.getState().setCaptureStatus({engine:'native',errorCode:code,error:captureErrorMessage(code,de())})
}
export function retryMicrophoneCapture(){return window.electronAPI?.clips?.nativeRetryMicrophone?.()??Promise.resolve(false)}
export function startReplayBuffer(forceRestart=false):Promise<boolean>{
  wanted=true;recoveryAttempts=0;clearTimeout(restartTimer);restartTimer=undefined
  return beginStart(forceRestart)
}
async function beginStart(forceRestart:boolean):Promise<boolean>{
  if(pendingStart){
    const revision=startRevision,started=await pendingStart
    if(revision!==startRevision||!wanted)return false
    return forceRestart?beginStart(true):started
  }
  if(active&&!forceRestart)return true
  const start=startNative();pendingStart=start
  try{return await start}finally{if(pendingStart===start)pendingStart=undefined}
}
async function startNative():Promise<boolean>{
  const revision=++startRevision
  releaseCapture();useClipStore.getState().setIsReplayBufferActive(false)
  try{
    if(pendingStop){await pendingStop;pendingStop=undefined}
    if(revision!==startRevision||!wanted)return false
    const settings=settingsForGame(),api=window.electronAPI?.clips
    if(!settings.enabled)return false
    if(!api?.nativeStart||!api.nativeSnapshot)throw new Error('native-api-unavailable')
    claimed=true
    const isolated=settings.separateApplications&&(settings.audioRecordingOption as string)!=='none'
    const audio=isolated?await api.prepareAudio({game:settings.gameAudioProcess||'auto',discord:settings.captureDiscord===true,historySeconds:Math.min(606,settings.replayDurationSeconds+6)}):undefined
    if(revision!==startRevision||!wanted)return false
    const applicationUnsupported=isolated&&audio?.success===false&&audio.error?.includes('Windows build 20348')
    if(isolated&&!audio?.success&&!applicationUnsupported)throw new Error(audio?.error||'application-audio-unavailable')
    const status=await api.nativeStart(settings.replayDurationSeconds)
    if(revision!==startRevision||!wanted)return false
    if(!status.success)throw new Error(status.error||'native-start-failed')
    active=true;lastStartedAt=Date.now();recordingSettings=settings;setCaptureMemoryActive(true)
    useClipStore.getState().setCaptureStatus({...status,engine:'native',micAvailable:settings.captureMic?status.micAvailable:false,gameAudioAvailable:audio?.game,discordAvailable:audio?.discord,
      ...(applicationUnsupported?{errorCode:'application-audio-unsupported',error:captureErrorMessage('application-audio-unsupported',de())}:{})})
    useClipStore.getState().setIsReplayBufferActive(true)
    void api.setCaptureActive?.(true).catch(()=>{})
    return true
  }catch(error){
    if(revision===startRevision){releaseCapture();useClipStore.getState().setIsReplayBufferActive(false);showFailure(error)}
    console.warn('[ClipEngine] Native recording could not start:',describeCaptureError(error));return false
  }
}
export function stopReplayBuffer(){
  wanted=false;++startRevision;recoveryAttempts=0;clearTimeout(restartTimer);restartTimer=undefined
  releaseCapture();useClipStore.getState().setIsReplayBufferActive(false);useClipStore.getState().setCaptureStatus({})
}
function recoverNative(){
  clearTimeout(restartTimer)
  if(!wanted||!useClipStore.getState().settings.enabled)return
  if(recoveryAttempts>=3){releaseCapture();useClipStore.getState().setIsReplayBufferActive(false);showFailure('native-recovery-failed');return}
  const delay=1000*2**recoveryAttempts++
  restartTimer=setTimeout(()=>{
    restartTimer=undefined
    if(wanted&&useClipStore.getState().settings.enabled)void beginStart(true).then(started=>{if(!started&&wanted)recoverNative()})
  },delay)
}

let pendingClips=0,snapshotTail:Promise<void>=Promise.resolve()
export async function triggerInstantClip(options?:{customTitle?:string;customTags?:string[];isAutoClip?:boolean}):Promise<boolean>{
  const store=useClipStore.getState()
  if(!active||!store.isReplayBufferActive){
    if(!options?.isAutoClip)void sendAppNotification({title:de()?'Aufnahme nicht bereit':'Recording is not ready',body:store.captureStatus.error||captureErrorMessage('native-replay-unavailable',de()),type:'info'})
    return false
  }
  if(pendingClips>=3){void sendAppNotification({title:de()?'Clip-Warteschlange voll':'Clip queue full',body:de()?'Drei Clips werden bereits gesichert. Bitte kurz warten.':'Three clips are already being saved. Please wait a moment.',type:'info'});return false}
  pendingClips++
  const previous=snapshotTail
  let unlock!:()=>void
  snapshotTail=new Promise(resolve=>{unlock=resolve})
  const captureRevision=startRevision
  let phase:'snapshot'|'save'='snapshot'
  let pendingId:string|undefined,toastId:string|undefined,saved=false,thumbnailFinal=false
  store.setIsSavingClip?.(true)
  try{
    const settings=recordingSettings||store.settings,appSettings=useGameStore.getState().settings,game=useGameStore.getState().activeGame
    const title=options?.customTitle||`${game?.name||'Gameplay'} Highlight`
    if(settings.playSoundOnClip!==false&&(appSettings.soundEffects??true))try{playNotificationSound(appSettings.notificationSound||'eclipse_calm')}catch{}
    if(settings.notifyOnClip!==false&&appSettings.overlayClipNotification!==false&&window.electronAPI?.showClipToast){
      toastId=crypto.randomUUID()
      void window.electronAPI.showClipToast({requestId:toastId,status:'saving',title:options?.customTitle,gameTitle:game?.name||'Gameplay',duration:settings.replayDurationSeconds,language:appSettings.language,color:appSettings.overlayClipToastColor}).catch(()=>{})
    }
    pendingId='pending-'+crypto.randomUUID()
    store.setPendingClip({id:pendingId,title,gameTitle:game?.name||'Gameplay',createdAt:Date.now()})
    const applyPreview=(thumbnail:string)=>{
      if(pendingId)store.updatePendingThumbnail(pendingId,thumbnail)
      if(toastId)void window.electronAPI?.showClipToast?.({requestId:toastId,previewOnly:true,status:'saving',thumbnailUrl:thumbnail}).catch(()=>{})
    }
    void window.electronAPI?.clips?.nativePreview?.().then(preview=>{if(!thumbnailFinal&&preview.thumbnailDataUrl)applyPreview(preview.thumbnailDataUrl)}).catch(()=>{})
    await previous
    if(!active||captureRevision!==startRevision)throw new Error('capture-cancelled')
    const snapshot=await window.electronAPI!.clips!.nativeSnapshot!()
    if(!snapshot.success||!snapshot.id)throw new Error(snapshot.error||'native-replay-buffering')
    store.updatePendingPhase(pendingId,'saving')
    if(snapshot.thumbnailDataUrl){thumbnailFinal=true;applyPreview(snapshot.thumbnailDataUrl)}
    unlock()
    phase='save'
    const result=await window.electronAPI!.clips!.saveClip({nativeSnapshotId:snapshot.id,thumbnailDataUrl:snapshot.thumbnailDataUrl,toastRequestId:toastId,title,gameTitle:game?.name||'Gameplay',gameId:game?.id,duration:settings.replayDurationSeconds,resolution:settings.quality,fps:settings.fps,bitrate:settings.bitrate,format:settings.format||'mp4',tags:options?.customTags||[(game?.name||'Gameplay').toLowerCase(),'replay']})
    if(!result.success)throw new Error(result.error||'native-save-failed')
    saved=true
    if(result.clip)store.addClip(result.clip,pendingId);else await store.refreshClips()
    const current=useClipStore.getState()
    if(result.clip&&!options?.isAutoClip&&!current.isTrimmerOpen){current.setActiveClip(result.clip);current.setIsTrimmerOpen(true)}
    return true
  }catch(error){
    const code=describeCaptureError(error)
    console.warn('[ClipEngine] Clip could not be saved during '+phase+':',code)
    if(code!=='capture-cancelled'){
      const recovering=active&&wanted&&captureRevision===startRevision&&nativeFailureNeedsRestart(code,phase)
      if(recovering){
        if(Date.now()-lastStartedAt>=30000)recoveryAttempts=0
        releaseCapture();store.setIsReplayBufferActive(false);showFailure('native-capture-stopped');recoverNative()
      }
      const recovery=recovering?(de()?' Der Replay-Buffer wird automatisch neu gestartet.':' The replay buffer is restarting automatically.'):''
      void sendAppNotification({title:de()?'Clip konnte nicht erstellt werden':'Could not create clip',body:captureErrorMessage(code,de())+recovery,type:'error',duration:5000})
    }
    return false
  }finally{
    thumbnailFinal=true
    if(toastId&&!saved)void window.electronAPI?.showClipToast?.({requestId:toastId,status:'error'}).catch(()=>{})
    unlock();pendingClips--;if(pendingId)store.clearPendingClip(pendingId);store.setIsSavingClip?.(pendingClips>0)
  }
}

export function disposeClipEngine(){
  initialized=false;generation++
  for(const cleanup of cleanups.splice(0))try{cleanup()}catch{}
  stopReplayBuffer();detectedGameName=undefined
}
export function initClipEngine(){
  if(initialized)return disposeClipEngine
  initialized=true;const token=++generation
  const reconnect=()=>{const state=useClipStore.getState();if(active&&state.settings.captureMic&&state.captureStatus.micAvailable===false)void retryMicrophoneCapture()}
  navigator.mediaDevices?.addEventListener?.('devicechange',reconnect);window.addEventListener('focus',reconnect)
  keep(()=>{navigator.mediaDevices?.removeEventListener?.('devicechange',reconnect);window.removeEventListener('focus',reconnect)})
  keep(window.electronAPI?.clips?.onNativeStatus?.(status=>{
    if(!active)return
    const state=useClipStore.getState()
    state.setCaptureStatus({...state.captureStatus,...status,...(status.error?{errorCode:status.error,error:captureErrorMessage(status.error,de())}:{})})
    if(status.active===false&&status.error){if(Date.now()-lastStartedAt>=30000)recoveryAttempts=0;active=false;state.setIsReplayBufferActive(false);recoverNative()}
  }))
  keep(window.electronAPI?.clips?.onAudioStatus?.(status=>{
    const state=useClipStore.getState()
    if(active&&state.settings.separateApplications)state.setCaptureStatus({...state.captureStatus,...(status.channel==='game'?{gameAudioAvailable:status.available}:{discordAvailable:status.available})})
  }))
  void window.electronAPI?.clips?.getSettings?.().then(saved=>{
    if(!initialized||token!==generation)return
    if(saved){useClipStore.getState().setSettings(saved);if(saved.enabled&&saved.screenRecordingOnAppStart)void startReplayBuffer()}
  }).catch(()=>{})
  let previous=useClipStore.getState().settings
  keep(useClipStore.subscribe(state=>{
    const settings=state.settings
    if(settings===previous)return
    const before=previous;previous=settings
    const critical=(['separateApplications','captureDesktop','audioRecordingOption','captureMic','selectedMonitorId','fps','quality','micDeviceId','audioOutputDeviceId','bitrate','videoEncoder']as const).some(key=>settings[key]!==before[key])
      ||!!settings.separateApplications&&(settings.gameAudioProcess!==before.gameAudioProcess||settings.captureDiscord!==before.captureDiscord)
    const game=detectedGameName||useGameStore.getState().activeGame?.name
    if(active&&recordingSettings){
      recordingSettings={...settings,replayDurationSeconds:clipProfileDuration(settings,game)}
      if(clipProfileDuration(settings,game)!==clipProfileDuration(before,game)){
        const seconds=recordingSettings.replayDurationSeconds
        void window.electronAPI?.clips?.nativeSetDuration?.(seconds).catch(()=>{})
        if(settings.separateApplications)void window.electronAPI?.clips?.setAudioHistory?.(Math.min(606,seconds+6)).catch(()=>{})
        state.setCaptureStatus({...state.captureStatus,historyLimitSeconds:seconds})
      }
    }
    if(!settings.enabled){if(wanted)stopReplayBuffer()}
    else if(critical&&wanted){clearTimeout(restartTimer);restartTimer=setTimeout(()=>{restartTimer=undefined;if(wanted)void beginStart(true)},350)}
  }))
  keep(window.electronAPI?.clips?.onHotkeyTriggered?.(event=>{const action=(event as {action?:string}).action;if(action===undefined||action==='replay')void triggerInstantClip()}))
  keep(window.electronAPI?.clips?.onAutoClipTriggered?.(event=>{const state=useClipStore.getState();if(state.settings.enabled&&state.settings.autoClipEnabled&&active)void triggerInstantClip({customTitle:`${event.title} (${event.game})`,customTags:['autoclip',event.game.toLowerCase(),event.eventType],isAutoClip:true})}))
  keep(window.electronAPI?.onGameStarted?.(game=>{detectedGameName=game.name;const settings=useClipStore.getState().settings;if(settings.enabled&&(settings.autoStartOnGame!==false||wanted))void startReplayBuffer(true)}))
  keep(window.electronAPI?.onGameStopped?.(()=>{detectedGameName=undefined;if(!useClipStore.getState().settings.screenRecordingOnAppStart)stopReplayBuffer()}))
  return disposeClipEngine
}
