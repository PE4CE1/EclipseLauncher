import { BrowserWindow } from 'electron'
import { ipcMain } from './ipcSecurity'
import { MediaTransport, mediaFilter, type MediaFilter, type MediaReply } from './mediaTransport'
import type { MediaState } from '../src/types/game'

export type MediaStatus = MediaState
const EMPTY:MediaStatus={isPlaying:false,title:'',artist:'',app:null}
const transport=new MediaTransport()
const states=new Map<MediaFilter,MediaStatus>()
const covers=new Map<string,string>()
const sent=new WeakMap<object,MediaStatus>()
const reads=new Map<MediaFilter,Promise<MediaStatus>>()
const sampledAt=new Map<MediaFilter,number>()
let preferred:MediaFilter='all',stopped=false
let pollTimer:ReturnType<typeof setTimeout>|undefined
let suspendPoll:()=>void=()=>transport.suspend()
export function setPreferredMediaFilter(source:unknown){preferred=mediaFilter(source)}

function stateFrom(reply:MediaReply|null,filter:MediaFilter):MediaStatus {
  if(!reply||reply.Error)return {...(states.get(filter)||EMPTY),isPlaying:false,error:process.platform==='win32'?'unavailable':'unsupported',controls:{playPause:false,next:false,previous:false}}
  if(!reply.SessionId||!reply.App)return {...EMPTY}
  const app=['spotify','youtube','browser','other'].includes(reply.App)?reply.App as NonNullable<MediaStatus['app']>:'other'
  if(filter!=='all'&&app!==filter)return {...EMPTY}
  const title=String(reply.Title||'').slice(0,1000),artist=String(reply.Artist||'').slice(0,1000)
  const key=JSON.stringify([reply.SessionId,artist,reply.Album,title])
  if(typeof reply.Cover==='string'&&reply.Cover.length<=525000&&/^data:image\/(?:jpeg|png|webp|bmp);base64,[A-Za-z\d+/=]+$/.test(reply.Cover)){
    covers.delete(key);covers.set(key,reply.Cover)
    while(covers.size>2)covers.delete(covers.keys().next().value!)
  }
  return {isPlaying:reply.IsPlaying===true,title,artist,app,sessionId:reply.SessionId.slice(0,1000),
    coverUrl:reply.HasCover?covers.get(key):undefined,
    controls:reply.Controls?{playPause:reply.Controls.playPause===true,next:reply.Controls.next===true,previous:reply.Controls.previous===true}:undefined}
}
function apply(reply:MediaReply|null,filter:MediaFilter){
  const next=stateFrom(reply,filter),previous=states.get(filter)
  // Keep artwork out of repeated JSON serialization and unchanged IPC messages.
  if(previous&&previous.isPlaying===next.isPlaying&&previous.title===next.title&&previous.artist===next.artist&&previous.app===next.app&&previous.sessionId===next.sessionId&&previous.coverUrl===next.coverUrl&&previous.error===next.error&&previous.controls?.playPause===next.controls?.playPause&&previous.controls?.next===next.controls?.next&&previous.controls?.previous===next.controls?.previous)return previous
  states.set(filter,next);return next
}
export async function detectActiveMedia(source:MediaFilter=preferred):Promise<MediaStatus> {
  const filter=mediaFilter(source)
  if(stopped)return {...EMPTY}
  const pending=reads.get(filter)
  if(pending)return pending
  const cached=states.get(filter),sampled=sampledAt.get(filter)
  if(cached&&sampled!==undefined&&Date.now()-sampled<250)return cached
  const request=transport.send('GET',filter).then(reply=>{
    const state=apply(reply,filter);sampledAt.set(filter,Date.now());return state
  }).finally(()=>{if(reads.get(filter)===request)reads.delete(filter)})
  reads.set(filter,request);return request
}
function broadcast(state:MediaStatus,getWindows:()=>BrowserWindow[]){
  for(const win of getWindows())if(!win.isDestroyed()&&sent.get(win.webContents)!==state){sent.set(win.webContents,state);win.webContents.send('media:update',state)}
}
async function command(action:'TOGGLE'|'NEXT'|'PREV',getWindows?:()=>BrowserWindow[],source:MediaFilter=preferred,sessionId?:string){
  const filter=mediaFilter(source)
  if(stopped)return {success:false,error:'unavailable'}
  const target=sessionId??states.get(filter)?.sessionId
  const reply=await transport.send(action,filter,target)
  const state=apply(reply,filter)
  sampledAt.delete(filter)
  if(getWindows&&filter===preferred)broadcast(state,getWindows)
  return {success:reply?.Success===true,error:reply?.Success===true?undefined:reply?.Error?'unavailable':'command-failed'}
}
export const mediaToggle=(windows?:()=>BrowserWindow[],filter?:MediaFilter,sessionId?:string)=>command('TOGGLE',windows,filter,sessionId)
export const mediaNext=(windows?:()=>BrowserWindow[],filter?:MediaFilter,sessionId?:string)=>command('NEXT',windows,filter,sessionId)
export const mediaPrev=(windows?:()=>BrowserWindow[],filter?:MediaFilter,sessionId?:string)=>command('PREV',windows,filter,sessionId)
export function stopMediaCoordinator(){stopped=true;clearTimeout(pollTimer);pollTimer=undefined;suspendPoll();transport.stop();covers.clear();states.clear();sampledAt.clear();reads.clear()}

export function initMediaCoordinator(getWindows:()=>BrowserWindow[],registerHotkeys:(keys:{playPause?:string;next?:string;prev?:string},windows:()=>BrowserWindow[])=>void){
  const subscribers=new Set<number>(),tracked=new WeakSet<Electron.WebContents>()
  let generation=0,inFlight=false,refresh=false,performanceMode=false,failures=0
  const visible=()=>getWindows().filter(win=>!win.isDestroyed()&&win.isVisible()&&!win.isMinimized()&&subscribers.has(win.webContents.id))
  const suspend=()=>{
    if(visible().length)return
    generation++;clearTimeout(pollTimer);pollTimer=undefined;refresh=false;sampledAt.clear();transport.suspend()
  }
  suspendPoll=suspend
  function schedule(delay?:number){
    if(stopped)return
    clearTimeout(pollTimer);pollTimer=undefined
    if(!visible().length){suspend();return}
    if(inFlight){refresh=true;return}
    const state=states.get(preferred)
    const interval=state?.error?Math.min(30000,3000*2**Math.min(failures,4)):state?.isPlaying?(performanceMode?3000:2000):state?.sessionId?(performanceMode?6000:4000):(performanceMode?10000:6000)
    pollTimer=setTimeout(async()=>{
      pollTimer=undefined
      if(!visible().length){suspend();return}
      const revision=generation,source=preferred
      inFlight=true
      try{
        const state=await detectActiveMedia(source)
        if(revision===generation&&source===preferred&&!stopped){failures=state.error?failures+1:0;broadcast(state,visible)}
      }finally{
        inFlight=false;const immediate=refresh;refresh=false
        if(!stopped)schedule(immediate?0:undefined)
      }
    },delay??interval)
    pollTimer.unref()
  }
  ipcMain.handle('media:subscribe',event=>{
    const owner=event.sender,id=owner.id
    subscribers.add(id);sent.delete(owner)
    if(!tracked.has(owner)){
      tracked.add(owner)
      const release=()=>{subscribers.delete(id);sent.delete(owner);suspend()}
      owner.once('destroyed',release);owner.on('render-process-gone',release)
      owner.on('did-start-navigation',details=>{if(details.isMainFrame&&!details.isSameDocument)release()})
      const win=BrowserWindow.fromWebContents(owner)
      win?.on('show',()=>{if(subscribers.has(id))schedule(0)})
      win?.on('restore',()=>{if(subscribers.has(id))schedule(0)})
      win?.on('hide',suspend);win?.on('minimize',suspend)
    }
    schedule(0);return {success:true}
  })
  ipcMain.handle('media:unsubscribe',event=>{subscribers.delete(event.sender.id);sent.delete(event.sender);suspend();return {success:true}})
  ipcMain.handle('media:get-status',(_event,filter?:MediaFilter)=>detectActiveMedia(filter===undefined?preferred:mediaFilter(filter)))
  ipcMain.handle('media:set-filter',async(_event,filter:MediaFilter)=>{
    if(!['all','spotify','youtube'].includes(filter))return {success:false}
    preferred=filter;generation++;failures=0
    const revision=generation,state=await detectActiveMedia(filter)
    if(revision===generation)broadcast(state,visible)
    schedule(0);return {success:true}
  })
  for(const [channel,action] of [['media:play-pause','TOGGLE'],['media:next','NEXT'],['media:previous','PREV']] as const)
    ipcMain.handle(channel,async(_event,filter?:MediaFilter,sessionId?:string)=>{
      if(sessionId!==undefined&&(typeof sessionId!=='string'||sessionId.length>1000))return {success:false,error:'invalid-request'}
      const result=await command(action,getWindows,filter,sessionId);schedule(120);return result
    })
  ipcMain.handle('media:register-hotkeys',(_event,keys)=>{registerHotkeys(keys,getWindows);return {success:true}})
  ipcMain.handle('media:set-performance-mode',(_event,value)=>{performanceMode=value===true;schedule(0);return {success:true}})
}
