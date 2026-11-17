import {app,clipboard,ClipboardItem,type WebContents} from 'electron'
import {ipcMain} from './ipcSecurity'
import {writeJsonAtomicSync} from './jsonStorage'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import {execFile} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import type {ClipExportRequest} from '../src/services/clipEdits'
import {DISCORD_FILE_LIMIT_BYTES} from '../src/services/clipSharing'
interface SharedClip {id:string;url:string;expires:number;source:string;title:string}
function endpoint(){
  const value=process.env.ECLIPSE_CLIP_SHARE_URL;if(!value)return undefined
  const url=new URL(value)
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&!app.isPackaged))throw new Error('Invalid clip sharing service URL')
  return url.origin
}
const historyFile=()=>path.join(app.getPath('userData'),'clip_share_links.json')
function loadLinks():SharedClip[]{try{const value=JSON.parse(fs.readFileSync(historyFile(),'utf8'));return Array.isArray(value)?value.filter(item=>item&&typeof item.id==='string'&&typeof item.url==='string'&&typeof item.source==='string'&&Number.isFinite(item.expires)).slice(-200):[]}catch{return[]}}
function saveLinks(links:SharedClip[]){writeJsonAtomicSync(historyFile(),links.slice(-200))}
function api(url:string,method:string,token:string,body?:unknown,file?:string,progress?:(bytes:number,total:number)=>void):Promise<Record<string,unknown>>{
  return new Promise((resolve,reject)=>{
    const data=body===undefined?undefined:Buffer.from(JSON.stringify(body)),total=file?fs.statSync(file).size:data?.length||0
    const request=(url.startsWith('https:')?https:http).request(url,{method,headers:{Authorization:'Bearer '+token,...(method==='PUT'?{'Content-Type':'video/mp4'}:data?{'Content-Type':'application/json'}:{}),...(file||data?{'Content-Length':String(total)}:{})}},response=>{
      const chunks:Buffer[]=[];let size=0;response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536){request.destroy(new Error('Share response too large'));return}chunks.push(chunk)})
      response.on('error',reject);response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!response.statusCode||response.statusCode<200||response.statusCode>=300)throw new Error(typeof value.error==='string'?value.error.slice(0,250):'Clip service request failed');resolve(value)}catch(error){reject(error)}})
    })
    const deadline=setTimeout(()=>request.destroy(new Error('Clip upload timed out')),file?300000:20000);deadline.unref();request.on('close',()=>clearTimeout(deadline))
    request.setTimeout(file?300000:20000,()=>request.destroy(new Error('Clip upload timed out')));request.on('error',reject)
    if(file){const stream=fs.createReadStream(file);let sent=0,last=0;stream.on('data',(chunk:Buffer|string)=>{sent+=typeof chunk==='string'?Buffer.byteLength(chunk):chunk.length;if(Date.now()-last>250){progress?.(sent,total);last=Date.now()}});stream.on('error',error=>request.destroy(error));request.on('close',()=>stream.destroy());stream.pipe(request)}else request.end(data)
  })
}
function validToken(token:unknown):token is string {return typeof token==='string'&&/^[\w.-]{10,8192}$/.test(token)}
export function initClipSharing(render:(payload:ClipExportRequest,file:string)=>Promise<void>,validate:(payload:ClipExportRequest)=>ClipExportRequest){
  let busy=false
  const temporary=(kind:string,extension='.mp4')=>{const directory=path.join(app.getPath('userData'),'clip_exports');fs.mkdirSync(directory,{recursive:true});for(const name of fs.readdirSync(directory)){if(!/^eclipse-(share|discord)-[a-f\d-]+\.(mp4|webm)$/.test(name))continue;const file=path.join(directory,name);try{if(fs.statSync(file).mtimeMs<Date.now()-86400000)fs.unlinkSync(file)}catch{}}return path.join(directory,'eclipse-'+kind+'-'+randomUUID()+extension)}
  const send=(sender:WebContents,phase:string,percent:number)=>{if(!sender.isDestroyed())sender.send('clips:share-progress',{phase,percent})}
  ipcMain.handle('clips:share-config',()=>({configured:!!endpoint(),maxBytes:100000000}))
  ipcMain.handle('clips:share-links',(_event,file:string)=>{const request=validate({filePath:file,suggestedName:'clip'});return loadLinks().filter(item=>item.source===request.filePath).map(({source,...item})=>item)})
  ipcMain.handle('clips:share-copy',async(_event,id:string)=>{const link=loadLinks().find(item=>item.id===id);if(!link||link.expires<=Date.now())return{success:false};await clipboard.writeText(link.url);return{success:true}})
  ipcMain.handle('clips:share-delete',async(_event,payload:{id:string;token:string})=>{
    try{const base=endpoint();if(!base||!payload||!validToken(payload.token)||!loadLinks().some(item=>item.id===payload.id)||!/^[a-f\d-]{36}$/.test(payload.id))throw new Error('Invalid share deletion');await api(base+'/v1/shares/'+payload.id,'DELETE',payload.token);saveLinks(loadLinks().filter(item=>item.id!==payload.id));return{success:true}}catch(error){return{success:false,error:String(error)}}
  })
  ipcMain.handle('clips:share',async(event,payload:{clip:ClipExportRequest;token:string;days:number})=>{
    if(busy)return{success:false,error:'Another clip is being prepared'}
    busy=true;let file:string|undefined,id:string|undefined,base:string|undefined,committed=false
    try{
      base=endpoint();if(!base)throw new Error('Clip link hosting is not configured yet')
      if(!payload||!validToken(payload.token)||![1,7,30].includes(payload.days))throw new Error('Invalid clip share request')
      const request=validate(payload.clip);file=temporary('share');send(event.sender,'render',0)
      await render({...request,maxBytes:Math.min(request.maxBytes||100000000,100000000)},file)
      const bytes=fs.statSync(file).size
      const reservation=await api(base+'/v1/shares','POST',payload.token,{title:request.suggestedName,bytes,days:payload.days})
      if(typeof reservation.id!=='string'||!/^[a-f\d-]{36}$/.test(reservation.id)||typeof reservation.url!=='string'||!reservation.url.startsWith(base+'/s/')||!/^[\w-]{43}$/.test(reservation.url.slice((base+'/s/').length))||typeof reservation.expires!=='number'||!Number.isFinite(reservation.expires))throw new Error('Invalid share service response')
      id=reservation.id;send(event.sender,'upload',0)
      await api(base+'/v1/shares/'+id,'PUT',payload.token,undefined,file,(sent,total)=>send(event.sender,'upload',Math.min(99,Math.round(sent/total*100))))
      const link={id,url:reservation.url,expires:reservation.expires,source:request.filePath,title:request.suggestedName}
      saveLinks([...loadLinks(),link]);committed=true;await clipboard.writeText(link.url);send(event.sender,'ready',100)
      return{success:true,...link,bytes}
    }catch(error){if(id&&base&&!committed)try{await api(base+'/v1/shares/'+id,'DELETE',payload.token)}catch{}return{success:false,error:String(error)}}finally{if(file)try{fs.unlinkSync(file)}catch{}busy=false}
  })
  ipcMain.handle('clips:copy-edited',async(_event,payload:ClipExportRequest)=>{
    if(busy)return{success:false,error:'Another clip is being prepared'}
    busy=true;let file:string|undefined
    try{
      const request=validate(payload)
      const extension=path.extname(request.filePath).toLowerCase()==='.webm'&&fs.statSync(request.filePath).size<=DISCORD_FILE_LIMIT_BYTES?'.webm':'.mp4'
      file=temporary('discord',extension);await render({...request,maxBytes:DISCORD_FILE_LIMIT_BYTES},file)
      const bytes=fs.statSync(file).size
      if(bytes<=0||bytes>DISCORD_FILE_LIMIT_BYTES)throw new Error('The Discord file exceeds the 20 MB limit')
      if(process.platform==='win32')await new Promise<void>((resolve,reject)=>execFile('powershell',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',"Set-Clipboard -LiteralPath '"+file!.replace(/'/g,"''")+"'"],{windowsHide:true,timeout:5000},error=>error?reject(error):resolve()))
      else await clipboard.write([new ClipboardItem({'text/uri-list':new Blob([pathToFileURL(file).href],{type:'text/uri-list'}),'text/plain':file})])
      file=undefined;return{success:true,bytes}
    }catch(error){return{success:false,error:String(error)}}finally{if(file)try{fs.unlinkSync(file)}catch{}busy=false}
  })
}
