import { BrowserWindow, screen } from 'electron'
import { ipcMain, secureAppWindow } from './ipcSecurity'
import path from 'node:path'
import { startMetricsService, stopMetricsService, type MetricsOptions } from './metricsService'
import { startInputService, stopInputService } from './inputService'
import { acquireGamepadService, releaseGamepadService } from './gamepadService'
import { updateStreamGameTitle } from './streamManager'
import { hasDesktopWidgets } from './overlayState'
import { disableOverlayWindowTransitions } from './overlayWindowEffects'

let overlayWindow: BrowserWindow|null=null, rendererReady=false, isEditMode=false
let windowEffectsReady=true
let currentOverlayData:any=null, currentEditGameData:any=null, pendingClipToastData:any=null
let lastStateSignature='', lastEditSignature='', appliedEdit=false, toastRevision=0, sentToastRevision=-1
let idleTimer:ReturnType<typeof setTimeout>|undefined, toastTimer:ReturnType<typeof setTimeout>|undefined
let lastToastTimestamp=0
let lastToastId=0
let clipsOnly=false
let mousePolicy: 'passive'|'media'|'edit'|'' = ''

function applyMousePolicy(win:BrowserWindow, policy:'passive'|'media'|'edit') {
  if(mousePolicy===policy)return
  mousePolicy=policy
  // forward:true installs mouse-move forwarding to Chromium on Windows. A
  // passive HUD must not process a 1000–8000 Hz mouse just to display numbers.
  if(policy==='media')win.setIgnoreMouseEvents(true,{forward:true})
  else win.setIgnoreMouseEvents(policy!=='edit')
}

export const getOverlayWindow=()=>overlayWindow
export const isEditModeActive=()=>isEditMode
export function initOverlayManager(_devUrl:string|undefined,mode:'launcher'|'clips'='launcher') { clipsOnly=mode==='clips' }
export const isAnyPermanentDesktopOverlayActive=()=>isEditMode||hasDesktopWidgets(currentOverlayData)

function stopServices(){stopMetricsService();stopInputService();releaseGamepadService('overlay')}
function destroyWindow(){
  const win=overlayWindow;overlayWindow=null;rendererReady=false
  clearTimeout(idleTimer);idleTimer=undefined
  lastStateSignature='';lastEditSignature='';appliedEdit=false;sentToastRevision=-1;mousePolicy=''
  if(win&&!win.isDestroyed())win.destroy()
}
function bounds(){const b=screen.getPrimaryDisplay().bounds;return{x:b.x,y:b.y,width:b.width,height:b.height-1}}
function createOverlayWindow(){
  // Windows adds its own show/hide animation to frameless WS_THICKFRAME windows.
  // The HUD is never resized by dragging, so remove that frame entirely.
  const win=new BrowserWindow({...bounds(),transparent:true,frame:false,thickFrame:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,hasShadow:false,resizable:false,enableLargerThanScreen:true,show:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),additionalArguments:clipsOnly?['--eclipse-clips-mode']:[],nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}})
  overlayWindow=win;rendererReady=false;lastStateSignature='';lastEditSignature='';appliedEdit=false;sentToastRevision=-1;mousePolicy=''
  windowEffectsReady=true
  const effects=disableOverlayWindowTransitions(win)
  if(effects){
    windowEffectsReady=false
    void effects.catch(error=>console.warn('[Overlay] Could not disable native window transitions:',error.message)).finally(()=>{
      if(overlayWindow===win&&!win.isDestroyed()){windowEffectsReady=true;reconcile()}
    })
  }
  secureAppWindow(win);applyMousePolicy(win,'passive');win.setAlwaysOnTop(true,'screen-saver',1)
  win.on('closed',()=>{
    if(overlayWindow!==win)return
    overlayWindow=null;rendererReady=false;isEditMode=false;currentEditGameData=null
    clearTimeout(idleTimer);idleTimer=undefined;stopServices()
  })
  win.webContents.on('did-start-navigation',details=>{
    // Loading a controller skin also emits did-start-loading. Only replacing
    // the main document invalidates React's readiness acknowledgement.
    if(overlayWindow!==win||!details.isMainFrame||details.isSameDocument)return
    rendererReady=false;lastStateSignature='';lastEditSignature='';appliedEdit=false;sentToastRevision=-1
    win.hide();stopServices()
  })
  // React acknowledges readiness through get-current-state after subscribing.
  // BrowserWindow ready-to-show alone does not guarantee IPC listeners exist.
  const dev=process.env.VITE_DEV_SERVER_URL
  const loading=dev?win.loadURL(`${dev.replace(/\/$/,'')}/overlay.html`):win.loadFile(path.join(__dirname,'../dist/overlay.html'))
  void Promise.resolve(loading).catch(error=>{console.warn('[OverlayManager] Loading failed:',error);if(overlayWindow===win){stopServices();destroyWindow()}})
  return win
}
function metricsSelection(data:any):MetricsOptions{
  const s=data?.settings||{},m=s.metrics||s.overlayMetrics||{},performance=Boolean(s.performance||s.overlayPerformance)
  return{pid:Number(data?.pid)||0,fps:performance&&m.fps!==false,cpu:performance&&m.cpu!==false,gpu:performance&&m.gpu!==false,ram:performance&&m.ram!==false,idle:Boolean(s.robloxTimer||s.overlayRobloxTimer)}
}
function sendLatestState(win:BrowserWindow){
  if(!rendererReady||win.isDestroyed()||win!==overlayWindow)return
  const signature=JSON.stringify(currentOverlayData)
  if(signature!==lastStateSignature){lastStateSignature=signature;win.webContents.send('overlay:update',currentOverlayData)}
}
function reconcile(){
  const permanent=hasDesktopWidgets(currentOverlayData),wanted=permanent||isEditMode||Boolean(pendingClipToastData)
  if(!wanted){
    stopMetricsService();stopInputService()
    // Stream Studio owns its own gamepad subscription; hidden desktop widgets
    // do not need an additional input reader.
    releaseGamepadService('overlay')
    if(overlayWindow&&!overlayWindow.isDestroyed()){
      sendLatestState(overlayWindow);overlayWindow.hide()
      // Turn off immediately, but reuse the renderer during rapid switch changes.
      if(!idleTimer){idleTimer=setTimeout(()=>{idleTimer=undefined;destroyWindow()},500);idleTimer.unref()}
    }
    return
  }
  clearTimeout(idleTimer);idleTimer=undefined
  const win=overlayWindow&&!overlayWindow.isDestroyed()?overlayWindow:createOverlayWindow()
  if(!rendererReady||!windowEffectsReady)return
  const data=isEditMode?currentEditGameData||currentOverlayData:permanent?currentOverlayData:null,s=data?.settings||{}
  if(s.performance||s.overlayPerformance||s.robloxTimer||s.overlayRobloxTimer)startMetricsService(getOverlayWindow,metricsSelection(data))
  else stopMetricsService()
  if(s.cps||s.overlayCps||s.robloxCps||s.overlayRobloxCps||s.rlHud||s.overlayRLHud||s.overlayRLSteam)startInputService(win)
  else stopInputService()
  if(s.overlayRLSteam||((s.overlayController||s.overlayRLController)&&(!s.overlayControllerStreamOnly||isEditMode)))acquireGamepadService('overlay',getOverlayWindow)
  else releaseGamepadService('overlay')
  const target=bounds(),actual=win.getBounds()
  if(Object.keys(target).some(key=>actual[key as keyof typeof target]!==target[key as keyof typeof target]))win.setBounds(target)
  sendLatestState(win)
  if(isEditMode){
    const signature=JSON.stringify(currentEditGameData)
    if(!appliedEdit||signature!==lastEditSignature){
      appliedEdit=true;lastEditSignature=signature;applyMousePolicy(win,'edit');win.setFocusable(true)
      win.webContents.send('overlay:edit-start',currentEditGameData)
      win.show();win.focus()
    }
  }else if(appliedEdit){
    appliedEdit=false;lastEditSignature='';win.setFocusable(false);win.webContents.send('overlay:edit-end')
  }
  if(!isEditMode)applyMousePolicy(win,s.overlayMedia?'media':'passive')
  if(!win.isVisible()){win.showInactive();win.setAlwaysOnTop(true,'screen-saver',1);win.moveTop()}
  if(pendingClipToastData&&sentToastRevision!==toastRevision){
    sentToastRevision=toastRevision;win.webContents.send('overlay:clip-saved',pendingClipToastData)
    clearTimeout(toastTimer);toastTimer=setTimeout(dismissToast,10000);toastTimer.unref()
  }
}

ipcMain.handle('overlay:get-current-state',event=>{
  if(overlayWindow&&!overlayWindow.isDestroyed()&&event.sender===overlayWindow.webContents){rendererReady=true;reconcile()}
  return{gameData:currentOverlayData,isEditMode,editGameData:currentEditGameData,pendingClipToast:pendingClipToastData,visible:!!overlayWindow&&!overlayWindow.isDestroyed()&&overlayWindow.isVisible(),rendererReady}
})
export function showOverlay(gameData:any){currentOverlayData=gameData;updateStreamGameTitle(gameData?.name==='Desktop'?null:gameData?.name||null);reconcile()}
export function hideOverlay(force=false){
  if(isEditMode&&!force)return
  currentOverlayData=null
  if(force){isEditMode=false;currentEditGameData=null;pendingClipToastData=null;clearTimeout(toastTimer);toastTimer=undefined;stopServices();destroyWindow();return}
  reconcile()
}
export function openOverlayEditMode(gameData?:any){isEditMode=true;currentEditGameData=gameData||null;reconcile()}
export function exitEditMode(){
  isEditMode=false;currentEditGameData=null
  if(overlayWindow&&!overlayWindow.isDestroyed()&&appliedEdit){
    appliedEdit=false;lastEditSignature='';applyMousePolicy(overlayWindow,'passive');overlayWindow.setFocusable(false);overlayWindow.webContents.send('overlay:edit-end')
  }
  reconcile()
}
ipcMain.on('overlay:set-ignore-mouse',(_event,ignore:boolean)=>{if(overlayWindow&&!overlayWindow.isDestroyed()&&!isEditMode&&mousePolicy==='media'&&typeof ignore==='boolean')overlayWindow.setIgnoreMouseEvents(ignore,ignore?{forward:true}:undefined)})
function dismissToast(){pendingClipToastData=null;clearTimeout(toastTimer);toastTimer=undefined;reconcile()}
export function showClipSavedToast(clipData:{id?:number;requestId?:string;previewOnly?:boolean;status?:'saving'|'saved'|'error';title?:string;gameTitle?:string;duration?:number;thumbnailUrl?:string;timestamp?:number;language?:string;color?:string}){
  if(!clipData||typeof clipData!=='object')return
  if(clipData.requestId!==undefined&&(typeof clipData.requestId!=='string'||!/^[a-f\d-]{36}$/i.test(clipData.requestId)))return
  const updating=Boolean(clipData.requestId&&pendingClipToastData?.requestId===clipData.requestId)
  if(clipData.previewOnly&&(!updating||pendingClipToastData.status!=='saving'))return
  // A finished older clip must not replace a newer notification or reappear
  // after the user has already seen and dismissed its initial confirmation.
  if(clipData.requestId&&clipData.status!=='saving'&&!updating)return
  const now=Date.now();if(!updating&&!clipData.requestId&&now-lastToastTimestamp<1200)return
  lastToastTimestamp=now
  try{
    const{app}=require('electron'),fs=require('node:fs'),file=path.join(app.getPath('userData'),'settings.json')
    if(fs.existsSync(file)){const saved=JSON.parse(fs.readFileSync(file,'utf8'));clipData={...clipData,language:clipData.language||saved.language,color:clipData.color||saved.overlayClipToastColor}}
  }catch{}
  const id=updating?pendingClipToastData.id:clipData.id||Math.max(now,lastToastId+1)
  lastToastId=id
  pendingClipToastData={...(updating?pendingClipToastData:{}),...clipData,id};toastRevision++;reconcile()
}
ipcMain.handle('overlay:dismiss-clip-toast',()=>{dismissToast();return{success:true}})
ipcMain.handle('overlay:show-clip-toast',(_event,data)=>{showClipSavedToast(data);return{success:true}})
