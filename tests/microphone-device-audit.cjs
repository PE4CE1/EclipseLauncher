// Local device discovery only: audio samples are neither recorded nor sent anywhere.
const {app,BrowserWindow,session}=require('electron')
const fs=require('node:fs'),path=require('node:path'),load=require('./download-loader.cjs')
const directory=path.resolve(process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('userData',directory);app.setPath('sessionData',directory)
app.whenReady().then(async()=>{
  const permissions=[]
  const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  const target={
    setPermissionCheckHandler:handler=>session.defaultSession.setPermissionCheckHandler((contents,permission,origin,details)=>{const allowed=handler(contents,permission,origin,details);permissions.push({kind:'check',permission,origin,hasContents:!!contents,mediaType:details.mediaType,allowed});return allowed}),
    setPermissionRequestHandler:handler=>session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>handler(contents,permission,allowed=>{permissions.push({kind:'request',permission,allowed});callback(allowed)},details)),
  }
  load({'./ipcSecurity':{isTrustedWebContents:contents=>contents===window.webContents}})('electron/rendererPermissions.ts').initRendererPermissions(target)
  const file=path.join(directory,'microphone-audit.html');fs.writeFileSync(file,'<!doctype html><title>Microphone discovery test</title><body>Microphone discovery test</body>')
  await window.loadFile(file)
  const result=await window.webContents.executeJavaScript(`(async()=>{const list=async()=> (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput').map(d=>({label:d.label,hasId:!!d.deviceId,alias:['default','communications'].includes(d.deviceId)}));const before=await list();let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});return{before,during:await list(),tracks:stream.getAudioTracks().map(t=>({label:t.label,hasId:!!t.getSettings().deviceId}))}}catch(e){return{before,error:{name:e.name,message:e.message}}}finally{stream?.getTracks().forEach(t=>t.stop())}})()`,true)
  const output=path.resolve('.cache/microphone-device-audit.json');fs.writeFileSync(output,JSON.stringify({result,permissions},null,2));console.log(JSON.stringify({result,permissions},null,2))
  window.destroy();app.exit(result.error?1:0)
}).catch(error=>{console.error(error);app.exit(1)})
setTimeout(()=>app.exit(2),20000).unref()
