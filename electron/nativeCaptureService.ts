import {app,desktopCapturer,screen,type WebContents} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {ipcMain} from './ipcSecurity'
import {NativeVideoReplay,runNativeTool} from './nativeReplay'
import {NativePcmSpool,NativeAudioReader} from './nativeReplayAudio'
import {fitClipDimensions,type ReplayAudioFiles,type ReplayLease} from './clipMedia'
import {freezeProcessAudio,snapshotProcessAudio} from './processAudioCapture'
import type {ClipSettings} from '../src/types/game'
import audioHelperBuild from './native/audio-capture.json'

type Output={adapter:number;index:number;monitor:string;white?:number;x:number;y:number;width:number;height:number;hdr?:boolean}
type Capture={owner:WebContents;video:NativeVideoReplay;mic?:NativeAudioReader;desktop?:NativeAudioReader;directory:string;status:Record<string,unknown>;settings:ClipSettings;jobs:Set<Promise<unknown>>}
type Snapshot={owner:number;directory:string;video:string;mic?:string;audio:ReplayAudioFiles;start:number;desktop:boolean;width:number;height:number;fps:number;timer:ReturnType<typeof setTimeout>}
const snapshots=new Map<string,Snapshot>()
let active:Capture|undefined,generation=0
const tracked=new WeakSet<WebContents>()
const base=()=>path.join(app.getPath('temp'),'eclipse_native_replay')
const helper=(name:string)=>path.join(app.getAppPath(),'electron/native',name).replace(/([\\/])app\.asar([\\/])/i,'$1app.asar.unpacked$2')
async function removeOwnedDirectory(directory:string){const root=path.resolve(base()),target=path.resolve(directory);if(path.dirname(target)!==root||!/^\d+_[a-f0-9-]{36}$/.test(path.basename(target)))return;await fs.promises.rm(target,{recursive:true,force:true}).catch(()=>{})}
async function sweepStale(){for(const item of await fs.promises.readdir(base(),{withFileTypes:true}).catch(()=>[])){if(!item.isDirectory()||!/^\d+_[a-f0-9-]{36}$/.test(item.name))continue;const pid=Number(item.name.split('_')[0]);try{process.kill(pid,0)}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')await removeOwnedDirectory(path.join(base(),item.name))}}}
function report(capture:Capture,patch:Record<string,unknown>){Object.assign(capture.status,patch);if(active===capture&&!capture.owner.isDestroyed())capture.owner.send('clips:native-status',capture.status)}
async function stopCapture(owner?:WebContents){
  if(!active||owner&&active.owner!==owner)return
  generation++;const old=active;active=undefined
  await old.video.stop();await Promise.allSettled(old.jobs)
  await Promise.allSettled([old.mic?.stop(),old.desktop?.stop()]);await removeOwnedDirectory(old.directory)
}
function releaseSnapshot(id:string){const snapshot=snapshots.get(id);if(!snapshot)return;snapshots.delete(id);clearTimeout(snapshot.timer);void removeOwnedDirectory(snapshot.directory)}
export function takeNativeSnapshot(owner:WebContents,id:unknown):{lease:ReplayLease;mic:boolean;audio:ReplayAudioFiles;start:number;desktop:boolean;width:number;height:number;fps:number}{
  if(typeof id!=='string'||id.length!==36)throw new Error('Invalid native replay snapshot')
  const snapshot=snapshots.get(id)
  if(!snapshot||snapshot.owner!==owner.id)throw new Error('Native replay snapshot unavailable')
  snapshots.delete(id);clearTimeout(snapshot.timer)
  let released=false
  return{...snapshot,mic:!!snapshot.mic,lease:{get:part=>{if(!part)return undefined;if(released)throw new Error('Native replay snapshot released');const file=part==='video'?snapshot.video:part==='mic'?snapshot.mic:undefined;if(!file)throw new Error('Native replay file unavailable');return{path:file,size:fs.statSync(file).size}},release:()=>{if(released)return;released=true;void removeOwnedDirectory(snapshot.directory)}}}
}
export function initNativeCapture(getFFmpeg:()=>string|null,getSettings:()=>ClipSettings){
  void sweepStale()
  ipcMain.handle('clips:native-start',async(event,duration:unknown)=>{
    if(process.platform!=='win32')return{success:false,error:'unsupported-platform'}
    if(typeof duration!=='number'||!Number.isFinite(duration)||duration<5||duration>600)return{success:false,error:'invalid-duration'}
    if(active&&active.owner!==event.sender)return{success:false,error:'capture-owned-by-another-window'}
    await stopCapture(event.sender)
    const token=++generation,settings=getSettings(),ffmpeg=getFFmpeg()
    if(!tracked.has(event.sender)){
      tracked.add(event.sender)
      const release=()=>{generation++;void stopCapture(event.sender);for(const[id,s]of snapshots)if(s.owner===event.sender.id)releaseSnapshot(id)}
      event.sender.once('destroyed',release);event.sender.on('render-process-gone',release);event.sender.on('did-start-navigation',details=>{if(details.isMainFrame&&!details.isSameDocument)release()})
    }
    let capture:Capture|undefined
    try{
      if(!/^ProcessAudioCapture\.pcm\.[a-f0-9]{12}\.exe$/.test(audioHelperBuild.file)||!ffmpeg||!fs.existsSync(helper('NativeVideoCapture.wgc.exe'))||!fs.existsSync(helper('NativeDisplayInfo.exe'))||!fs.existsSync(helper('NativeCaptureHost.exe'))||!fs.existsSync(helper(audioHelperBuild.file)))throw new Error('native-helper-missing')
      const requested=settings.selectedMonitorId
      const isWindow=requested?.startsWith('window:')===true
      const sources=await desktopCapturer.getSources({types:isWindow?['window']:['screen'],thumbnailSize:{width:0,height:0}})
      const source=sources.find(s=>s.id===requested)||(!requested||requested==='screen:0:0'?sources.find(s=>s.display_id===String(screen.getPrimaryDisplay().id)):undefined)
      if(!source)throw new Error(isWindow?'selected-window-unavailable':'selected-display-unavailable')
      const windowHandle=isWindow?/^window:(\d+):/.exec(source.id)?.[1]:undefined
      if(isWindow&&!windowHandle)throw new Error('selected-window-unavailable')
      const display=isWindow?undefined:screen.getAllDisplays().find(d=>String(d.id)===source.display_id)
      if(!isWindow&&!display)throw new Error('display-mapping-unavailable')
      const outputs=await new Promise<Output[]>((resolve,reject)=>execFile(helper('NativeDisplayInfo.exe'),windowHandle?['--window',windowHandle]:[],{windowsHide:true,timeout:5000,maxBuffer:16384},(error,data)=>{try{if(error)throw error;resolve(JSON.parse(data))}catch{reject(new Error('display-mapping-unavailable'))}}))
      const output=isWindow?outputs[0]:outputs.find(o=>{const rect=screen.screenToDipRect(null,{x:o.x,y:o.y,width:o.width,height:o.height});return Math.abs(rect.x-display!.bounds.x)<=2&&Math.abs(rect.y-display!.bounds.y)<=2&&Math.abs(rect.width-display!.bounds.width)<=2&&Math.abs(rect.height-display!.bounds.height)<=2})
      if(!output)throw new Error('display-mapping-unavailable')
      if(generation!==token||event.sender.isDestroyed())throw new Error('capture-cancelled')
      const {clipBitrateMbps}=await import('../src/services/clipQuality')
      const [width,height]=fitClipDimensions(output.width,output.height,settings.quality),fps=Math.min(120,Math.max(24,settings.fps||60))
      const directory=path.join(base(),`${process.pid}_${randomUUID()}`)
      const video=new NativeVideoReplay(ffmpeg,path.join(directory,'video'),{adapter:output.adapter,...(windowHandle?{window:windowHandle}:{monitor:output.monitor}),hdr:!!output.hdr,white:output.white,fps,width,height,duration,bitrate:clipBitrateMbps(settings.bitrate,settings.quality),...(settings.videoEncoder==='cpu'?{encoder:'libx264'}:{})},()=>{if(capture)report(capture,{error:'native-capture-stopped',active:false})},helper('NativeCaptureHost.exe'))
      capture={owner:event.sender,video,directory,settings,status:{engine:'native',active:false,width,height,fps,historyLimitSeconds:duration},jobs:new Set()};active=capture
      const current=capture
      const audioHelper=helper(audioHelperBuild.file)
      const input=settings.micDeviceId||'auto'
      if(settings.captureMic&&input!=='auto'&&input!=='default'&&!input.startsWith('wasapi:'))throw new Error('microphone-selection-unavailable')
      if(settings.captureMic){current.mic=new NativeAudioReader(audioHelper,['--microphone',input.startsWith('wasapi:')?input.slice(7):'auto'],new NativePcmSpool(path.join(directory,'mic'),duration),available=>report(current,{micAvailable:available,micRecovering:!available}));await current.mic.start()}
      const desktop=(settings.audioRecordingOption as string)!=='none'&&settings.captureDesktop!==false
      if(desktop){const device=settings.audioOutputDeviceId||'auto';if(!['auto','default'].includes(device))throw new Error('output-selection-unavailable');current.desktop=new NativeAudioReader(audioHelper,['--desktop','auto'],new NativePcmSpool(path.join(directory,'desktop'),duration),available=>report(current,{desktopAudioAvailable:available}));await current.desktop.start()}
      const ready=await video.start()
      if(generation!==token||active!==current||event.sender.isDestroyed())throw new Error('capture-cancelled')
      report(current,{...ready,active:true,micAvailable:!!current.mic?.available,desktopAudioAvailable:!!current.desktop?.available})
      return{success:true,...current.status}
    }catch(error){if(active===capture)await stopCapture(event.sender);return{success:false,error:error instanceof Error?error.message:'native-start-failed'}}
  })
  ipcMain.handle('clips:native-stop',async event=>{await stopCapture(event.sender);return{success:true}})
  ipcMain.handle('clips:native-retry-mic',async event=>active?.owner===event.sender?await active.mic?.retryNow()||false:false)
  ipcMain.handle('clips:native-duration',(event,seconds:number)=>{if(active?.owner!==event.sender)return false;active.video.setDuration(seconds);active.status.historyLimitSeconds=seconds;active.mic?.spool.setDuration(seconds);active.desktop?.spool.setDuration(seconds);return true})
  ipcMain.handle('clips:native-preview',async event=>{
    const capture=active
    if(!capture||capture.owner!==event.sender||!capture.status.active)return{}
    const thumbnailDataUrl=await capture.video.preview()
    return active===capture&&!event.sender.isDestroyed()?{thumbnailDataUrl}:{}
  })
  ipcMain.handle('clips:native-snapshot',async event=>{
    const capture=active
    if(!capture||capture.owner!==event.sender||!capture.status.active)return{success:false,error:'native-replay-unavailable'}
    if(snapshots.size>=3||capture.jobs.size>=3)return{success:false,error:'clip-queue-full'}
    const end=Date.now(),settings=getSettings(),duration=Number(capture.status.historyLimitSeconds),frozen=freezeProcessAudio(event.sender)
    const preview=capture.video.preview(end)
    const job=(async()=>{
      const directory=path.join(base(),`${process.pid}_${randomUUID()}`)
      let release:(()=>void)|undefined
      try{
        await fs.promises.mkdir(directory,{recursive:true})
        let video=path.join(directory,'video.mp4')
        const interval=await capture.video.snapshot(end,duration,video);release=interval.release
        const seconds=(interval.end-interval.start)/1000,audio:ReplayAudioFiles={}
        let mic:string|undefined,desktop=false
        // Keep raw tracks separate until the final mix/export. Pre-encoding the
        // desktop mix and microphone here added two processes and AAC generations.
        const tracks=await Promise.allSettled([
          (async()=>{if(capture.mic){const raw=path.join(directory,'mic.wav');if(await capture.mic.spool.snapshot(raw,interval.start,seconds)){
            mic=raw;audio.microphoneProcessing={gain:Math.max(0,Math.min(1,(settings.micVolume??80)/100)),gateDb:Math.max(-60,Math.min(-10,settings.micSensitivity??-40)),mono:!!settings.monoAudioInput}
          }}})(),
          (async()=>{if(capture.desktop){const raw=path.join(directory,'desktop.wav');if(await capture.desktop.spool.snapshot(raw,interval.start,seconds)){
            desktop=true;audio.desktopPath=raw;audio.desktopGain=Math.max(0,Math.min(1,(settings.audioOutputVolume??100)/100))
          }}})(),
        ])
        for(const track of tracks)if(track.status==='rejected')throw track.reason
        if(settings.separateApplications)for(const kind of ['game','discord']as const){const file=path.join(directory,kind+'.wav');if(snapshotProcessAudio(kind,file,interval.start,Math.min(606,seconds),frozen)){if(kind==='game')audio.gamePath=file;else audio.discordPath=file}}
        const thumbnailDataUrl=await preview
        const id=randomUUID(),timer=setTimeout(()=>releaseSnapshot(id),30000);timer.unref()
        snapshots.set(id,{owner:event.sender.id,directory,video,mic,audio,start:interval.start,desktop,width:Number(capture.status.width),height:Number(capture.status.height),fps:Number(capture.status.fps),timer})
        if(event.sender.isDestroyed()){releaseSnapshot(id);throw new Error('capture-page-closed')}
        return{success:true,id,thumbnailDataUrl}
      }catch(error){await removeOwnedDirectory(directory);return{success:false,error:error instanceof Error?error.message:'native-snapshot-failed'}}finally{release?.()}
    })().finally(()=>capture.jobs.delete(job))
    capture.jobs.add(job);return job
  })
  app.once?.('before-quit',()=>{void stopCapture();for(const id of snapshots.keys())releaseSnapshot(id)})
}
