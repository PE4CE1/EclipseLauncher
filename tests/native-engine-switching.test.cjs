const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
function fixture(t,nativeResult={success:true,engine:'native',width:640,height:360,fps:30}){
  const originals=Object.fromEntries(['window','navigator','MediaStream','MediaRecorder'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),subscribers=[],events={nativeStarts:0,nativeStops:0,browserStarts:0,recorders:0,saved:[],toasts:[],notifications:[],cleared:[]}
  class Stream{constructor(tracks=[]){this.tracks=tracks}getTracks(){return this.tracks}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video')}getAudioTracks(){return[]}addTrack(track){this.tracks.push(track)}}
  class Recorder{static isTypeSupported(){return true}constructor(){events.recorders++;this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive'}}
  let nativeStatus=()=>{}
  const state={settings:{enabled:true,captureMic:false,quality:'360p',fps:30,replayDurationSeconds:30,selectedMonitorId:'screen:1:0',playSoundOnClip:false},isReplayBufferActive:false,captureStatus:{},clips:[],isTrimmerOpen:false,
    setCaptureStatus(value){this.captureStatus=value},setIsReplayBufferActive(value){this.isReplayBufferActive=value},setIsSavingClip(value){this.isSavingClip=value},setPendingClip(clip){events.pending=clip},updatePendingThumbnail(id,url){events.thumbnail={id,url}},updatePendingPhase(_id,phase){events.phase=phase},clearPendingClip(id){events.cleared.push(id)},addClip(clip){this.clips.push(clip)},setActiveClip(){},setIsTrimmerOpen(){this.isTrimmerOpen=true}}
  const api={clips:{nativeStart:async()=>{events.nativeStarts++;if(nativeResult instanceof Error)throw nativeResult;return typeof nativeResult==='function'?nativeResult():nativeResult},nativeStop:async()=>{events.nativeStops++;return{success:true}},nativeSnapshot:async()=>({success:true,id:'d352db40-b491-4ae3-b396-59078be210bb'}),nativeSetDuration:async seconds=>{events.duration=seconds;return true},saveClip:async payload=>{events.saved.push(payload);return{success:true,clip:{id:'clip_native',title:payload.title}}},onNativeStatus:callback=>{nativeStatus=callback;return()=>{nativeStatus=()=>{}}}},showClipToast:async toast=>{events.toasts.push(toast)}}
  Object.defineProperties(globalThis,{window:{configurable:true,value:Object.assign(new EventTarget(),{electronAPI:api})},navigator:{configurable:true,value:{mediaDevices:Object.assign(new EventTarget(),{getUserMedia:async()=>{events.browserStarts++;return new Stream([{kind:'video',readyState:'live',enabled:true,stop(){this.readyState='ended'},getSettings:()=>({width:640,height:360,frameRate:30})}])}})}},MediaStream:{configurable:true,value:Stream},MediaRecorder:{configurable:true,value:Recorder}})
  const engine=load({'../store/clipStore':{useClipStore:{getState:()=>state,subscribe:callback=>{subscribers.push(callback);return()=>subscribers.splice(subscribers.indexOf(callback),1)}}},'../store/gameStore':{useGameStore:{getState:()=>({settings:{language:'en',soundEffects:false},activeGame:{name:'Fixture',id:'fixture'}})}},'./notificationService':{sendAppNotification:async notification=>{events.notifications.push(notification)}},'./soundService':{playNotificationSound(){}}})('src/services/clipEngine.ts')
  t.after(()=>{engine.disposeClipEngine();for(const[key,value]of Object.entries(originals)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}})
  const apply=patch=>{state.settings={...state.settings,...patch};for(const callback of subscribers)callback(state)}
  engine.initClipEngine();return{engine,state,events,api,apply,status:status=>nativeStatus(status),subscribers}
}
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve()}
test('native recording bypasses browser video and clip requests retain the immediate toast and existing save flow',async t=>{
  const f=fixture(t);assert.equal(await f.engine.startReplayBuffer(),true)
  assert.equal(f.events.browserStarts,0);assert.equal(f.events.recorders,0);assert.equal(f.state.captureStatus.engine,'native')
  assert.equal(await f.engine.triggerInstantClip(),true)
  assert.equal(f.events.toasts[0].status,'saving');assert.equal(f.events.saved[0].nativeSnapshotId,'d352db40-b491-4ae3-b396-59078be210bb');assert.equal(f.state.clips.length,1)
  f.engine.stopReplayBuffer();await flush();assert.equal(f.events.nativeStops,1);assert.equal(f.state.isReplayBufferActive,false)
})

test('pending card and toast receive a preview while the native snapshot is still being prepared',async t=>{
  const f=fixture(t);await f.engine.startReplayBuffer()
  let finishSnapshot
  f.api.clips.nativePreview=async()=>({thumbnailDataUrl:'data:image/jpeg;base64,early'})
  f.api.clips.nativeSnapshot=()=>new Promise(resolve=>{finishSnapshot=resolve})
  const save=f.engine.triggerInstantClip();await flush()
  assert.ok(f.events.pending.id.startsWith('pending-'))
  assert.equal(f.events.saved.length,0)
  assert.equal(f.events.thumbnail.url,'data:image/jpeg;base64,early')
  assert.ok(f.events.toasts.some(toast=>toast.previewOnly&&toast.thumbnailUrl==='data:image/jpeg;base64,early'))
  finishSnapshot({success:true,id:'d352db40-b491-4ae3-b396-59078be210bb'});assert.equal(await save,true);assert.equal(f.events.phase,'saving')
})

test('a late quick preview cannot overwrite the finalized snapshot thumbnail',async t=>{
  const f=fixture(t);await f.engine.startReplayBuffer()
  let finishPreview
  f.api.clips.nativePreview=()=>new Promise(resolve=>{finishPreview=resolve})
  f.api.clips.nativeSnapshot=async()=>({success:true,id:'d352db40-b491-4ae3-b396-59078be210bb',thumbnailDataUrl:'data:image/jpeg;base64,final'})
  assert.equal(await f.engine.triggerInstantClip(),true)
  finishPreview({thumbnailDataUrl:'data:image/jpeg;base64,old'});await flush()
  assert.equal(f.events.thumbnail.url,'data:image/jpeg;base64,final')
  assert.ok(!f.events.toasts.some(toast=>toast.thumbnailUrl==='data:image/jpeg;base64,old'))
})
test('unsupported native capture fails explicitly without starting another recording engine',async t=>{
  const f=fixture(t,new Error('native-helper-missing'));assert.equal(await f.engine.startReplayBuffer(),false)
  assert.equal(f.events.nativeStarts,1);assert.equal(f.events.browserStarts,0);assert.equal(f.events.recorders,0)
  assert.equal(f.state.isReplayBufferActive,false);assert.equal(f.state.captureStatus.engine,'native');assert.match(f.state.captureStatus.error,/Native recording files/)
})
test('interrupted native capture retries natively and stopping cancels recovery',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);await f.engine.startReplayBuffer()
  f.status({active:false,error:'native-capture-stopped'});assert.equal(f.state.isReplayBufferActive,false)
  t.mock.timers.tick(1000);await flush()
  assert.equal(f.events.nativeStarts,2);assert.equal(f.state.captureStatus.engine,'native');assert.equal(f.events.browserStarts,0)
  f.status({active:false,error:'native-capture-stopped'});f.engine.stopReplayBuffer();t.mock.timers.tick(10000);await flush()
  assert.equal(f.events.nativeStarts,2);assert.equal(f.events.recorders,0)
})
test('saved old engine selections cannot re-enable Chromium and quality changes restart only native recording',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);f.apply({captureEngine:'browser'});await f.engine.startReplayBuffer()
  f.apply({replayDurationSeconds:60,micVolume:21,micSensitivity:-35});await flush()
  assert.equal(f.events.duration,60);assert.equal(f.events.nativeStarts,1)
  f.apply({fps:60});t.mock.timers.tick(350);await flush()
  assert.equal(f.events.nativeStarts,2);assert.equal(f.events.browserStarts,0);assert.equal(f.events.recorders,0)
})
test('stopping during pending native startup prevents late success from reviving capture',async t=>{
  let resolve
  const f=fixture(t,()=>new Promise(r=>{resolve=r})),start=f.engine.startReplayBuffer()
  await flush();f.engine.stopReplayBuffer();resolve({success:true,engine:'native'});assert.equal(await start,false);await flush()
  assert.equal(f.state.isReplayBufferActive,false);assert.equal(f.events.nativeStops,1);assert.equal(f.events.browserStarts,0)
})
test('repeated failed native recovery stops after three attempts and keeps a useful error',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  let calls=0
  const f=fixture(t,()=>++calls===1?{success:true,engine:'native'}:{success:false,error:'native-start-failed'})
  await f.engine.startReplayBuffer();f.status({active:false,error:'native-capture-stopped'})
  for(const ms of [1000,2000,4000]){t.mock.timers.tick(ms);await flush()}
  assert.equal(f.events.nativeStarts,4);assert.equal(f.state.isReplayBufferActive,false);assert.equal(f.state.captureStatus.errorCode,'native-recovery-failed')
  t.mock.timers.tick(30000);await flush();assert.equal(f.events.nativeStarts,4)
})
test('clip requests do not automatically restart a paused native recorder',async t=>{
  const f=fixture(t);await f.engine.startReplayBuffer();f.engine.stopReplayBuffer();assert.equal(await f.engine.triggerInstantClip({isAutoClip:true}),false)
  assert.equal(f.events.nativeStarts,1);assert.equal(f.events.saved.length,0)
})
test('disposing removes subscribers, ignores stale status and supports clean initialization',async t=>{
  const f=fixture(t);await f.engine.startReplayBuffer();assert.equal(f.subscribers.length,1)
  f.engine.disposeClipEngine();await flush();assert.equal(f.subscribers.length,0);f.status({active:false,error:'native-capture-stopped'})
  f.engine.initClipEngine();await f.engine.startReplayBuffer();assert.equal(f.subscribers.length,1);assert.equal(f.events.nativeStarts,2)
})
test('missing preload API reports restart instructions without requesting browser permissions',async t=>{
  const f=fixture(t);delete f.api.clips.nativeStart
  assert.equal(await f.engine.startReplayBuffer(),false);assert.match(f.state.captureStatus.error,/restart Eclipse/);assert.equal(f.events.browserStarts,0)
})
test('a stable native session gets a fresh recovery budget for a later interruption',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']})
  const f=fixture(t);await f.engine.startReplayBuffer()
  for(let i=0;i<4;i++){t.mock.timers.tick(31000);f.status({active:false,error:'native-capture-stopped'});t.mock.timers.tick(1000);await flush();assert.equal(f.state.isReplayBufferActive,true)}
  assert.equal(f.events.nativeStarts,5);assert.equal(f.events.browserStarts,0)
})

test('a stalled snapshot resets the native session and the next clip saves without a renderer refresh',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);await f.engine.startReplayBuffer()
  const snapshot=f.api.clips.nativeSnapshot
  f.api.clips.nativeSnapshot=async()=>({success:false,error:'native-replay-timeout'})
  assert.equal(await f.engine.triggerInstantClip(),false)
  assert.equal(f.state.isReplayBufferActive,false);assert.equal(f.state.isSavingClip,false)
  assert.equal(f.events.cleared.length,1);assert.equal(f.events.saved.length,0)
  assert.match(f.events.notifications[0].body,/stopped providing new video frames.*restarting automatically/)
  t.mock.timers.tick(1000);await flush()
  assert.equal(f.events.nativeStarts,2);assert.equal(f.state.isReplayBufferActive,true)
  f.api.clips.nativeSnapshot=snapshot
  assert.equal(await f.engine.triggerInstantClip(),true);assert.equal(f.state.clips.length,1)
})

test('a failed snapshot releases all queued cards without saving a later game moment',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);await f.engine.startReplayBuffer();let finish,calls=0
  f.api.clips.nativeSnapshot=()=>{calls++;return new Promise(resolve=>{finish=resolve})}
  const requests=Array.from({length:3},()=>f.engine.triggerInstantClip());await flush()
  finish({success:false,error:'native-replay-gap'})
  assert.deepEqual(await Promise.all(requests),[false,false,false])
  assert.equal(calls,1);assert.equal(f.events.saved.length,0);assert.equal(f.events.cleared.length,3);assert.equal(f.state.isSavingClip,false)
  t.mock.timers.tick(1000);await flush();assert.equal(f.events.nativeStarts,2)
})

test('disk errors do not restart healthy recording and a subsequent save is not wedged',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);await f.engine.startReplayBuffer();const save=f.api.clips.saveClip
  f.api.clips.saveClip=async()=>({success:false,error:'ENOSPC: no space left on device'})
  assert.equal(await f.engine.triggerInstantClip(),false)
  t.mock.timers.tick(10000);await flush()
  assert.equal(f.events.nativeStarts,1);assert.equal(f.state.isReplayBufferActive,true);assert.equal(f.state.isSavingClip,false)
  assert.match(f.events.notifications[0].body,/Not enough disk space/)
  f.api.clips.saveClip=save;assert.equal(await f.engine.triggerInstantClip(),true)
})

test('a stale failed snapshot cannot restart a newer recording session',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);await f.engine.startReplayBuffer();let finish
  f.api.clips.nativeSnapshot=()=>new Promise(resolve=>{finish=resolve})
  const clip=f.engine.triggerInstantClip();await flush()
  await f.engine.startReplayBuffer(true);finish({success:false,error:'native-replay-timeout'})
  assert.equal(await clip,false);t.mock.timers.tick(10000);await flush()
  assert.equal(f.events.nativeStarts,2);assert.equal(f.state.isReplayBufferActive,true)
})

test('editing stored application preferences with separation off does not restart native capture',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);await f.engine.startReplayBuffer()
  f.apply({captureDiscord:true,gameAudioProcess:'Fixture.exe'});t.mock.timers.tick(350);await flush()
  assert.equal(f.events.nativeStarts,1)
  f.apply({captureDesktop:false});t.mock.timers.tick(350);await flush();assert.equal(f.events.nativeStarts,2)
})

test('new application defaults do not prevent native video and selected desktop/microphone on older Windows',async t=>{
  const f=fixture(t);f.apply({separateApplications:true,captureDesktop:true,captureDiscord:false})
  f.api.clips.prepareAudio=async selection=>{assert.equal(selection.discord,false);return{success:false,error:'Application audio requires Windows build 20348 or newer'}}
  assert.equal(await f.engine.startReplayBuffer(),true)
  assert.equal(f.state.isReplayBufferActive,true);assert.equal(f.events.nativeStarts,1)
  assert.equal(f.state.captureStatus.errorCode,'application-audio-unsupported')
  assert.match(f.state.captureStatus.error,/desktop and microphone tracks remain available/)
})
