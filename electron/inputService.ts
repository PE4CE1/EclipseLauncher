import {app,utilityProcess,type BrowserWindow,type UtilityProcess} from 'electron'
import path from 'node:path'

let overlayWin:BrowserWindow|null=null,worker:UtilityProcess|null=null,retry:ReturnType<typeof setTimeout>|undefined
let kbBind='Tab',ctrlBind='Select',restarts=0,exhausted=false
function send(channel:string,value:unknown){if(overlayWin&&!overlayWin.isDestroyed())try{overlayWin.webContents.send(channel,value)}catch{}}
function launch(){
  if(worker||retry||exhausted||!overlayWin||overlayWin.isDestroyed())return
  try{
    const child=worker=utilityProcess.fork(path.join(app.getAppPath(),'electron/inputWorker.cjs'),[],{stdio:'pipe',serviceName:'Eclipse input'})
    const started=Date.now()
    child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{})
    child.on('message',message=>{
      if(worker!==child||!message||typeof message!=='object')return
      if(message.type==='ready')child.postMessage({type:'bind',key:kbBind})
      else if(message.type==='scoreboard'&&typeof message.open==='boolean')send('rl:scoreboard-toggle',message.open)
      else if(message.type==='cps'&&[message.lmb,message.rmb].every(value=>Number.isInteger(value)&&value>=0&&value<=128))send('overlay:cps-update',{lmb:message.lmb,rmb:message.rmb,total:message.lmb+message.rmb,...(['lmb','rmb'].includes(message.buttonClicked)?{buttonClicked:message.buttonClicked}:{})})
    })
    child.once('exit',()=>{
      if(worker!==child)return
      worker=null;send('rl:scoreboard-toggle',false);send('overlay:cps-update',{lmb:0,rmb:0,total:0})
      if(Date.now()-started>=30000)restarts=0
      if(overlayWin&&!overlayWin.isDestroyed()&&restarts<3){retry=setTimeout(()=>{retry=undefined;launch()},1000*2**restarts++);retry.unref()}
      else exhausted=true
    })
  }catch(error){worker=null;exhausted=true;console.warn('[InputService] Isolated input unavailable:',error)}
}
export function startInputService(window:BrowserWindow){overlayWin=window;launch()}
export function stopInputService(){
  clearTimeout(retry);retry=undefined;restarts=0;exhausted=false
  const child=worker;worker=null;overlayWin=null
  if(child){try{child.postMessage({type:'stop'})}catch{};child.kill()}
}
export function setInputKeybinds(keyboardKey:string,controllerKey:string){
  if(keyboardKey)kbBind=keyboardKey
  if(controllerKey)ctrlBind=controllerKey
  try{worker?.postMessage({type:'bind',key:kbBind})}catch{}
  send('rl:controller-bind-update',ctrlBind)
}
