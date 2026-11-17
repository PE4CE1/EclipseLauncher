// Brief live diagnostic: PCM and encoded audio remain in memory and are discarded.
const {app,BrowserWindow,ipcMain}=require('electron'),path=require('node:path'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const root=path.resolve(__dirname,'..');app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
app.whenReady().then(async()=>{
  const appApi={...app,getAppPath:()=>root}
  const service=load({electron:{...require('electron'),app:appApi},'./ipcSecurity':{ipcMain}})('electron/microphoneCapture.ts');service.initMicrophoneCapture()
  ipcMain.on('account:get-identity-sync',event=>event.returnValue=null)
  const window=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  window.webContents.setAudioMuted(true)
  window.webContents.on('console-message',event=>{if(event.level==='error')console.log(event.message)})
  const open=()=>process.env.ECLIPSE_MIC_DEV_URL?window.loadURL(process.env.ECLIPSE_MIC_DEV_URL):window.loadFile(path.join(root,'.cache/native-microphone/fixture/tests/native-microphone-fixture.html'))
  await open()
  if(process.env.ECLIPSE_MIC_RELOAD==='1'){
    // Deliberately skip renderer cleanup to reproduce the old document leak.
    const capacity=await window.webContents.executeJavaScript(`(async()=>{const api=window.electronAPI.nativeMicrophone,device=${JSON.stringify(process.env.ECLIPSE_MIC_DEVICE||'auto')};await api.start(crypto.randomUUID(),device);await api.start(crypto.randomUUID(),device);try{await api.start(crypto.randomUUID(),device);return false}catch(error){return error.message.includes('[MICROPHONE_BUSY]')}})()`,true)
    assert.equal(capacity,true,'Two live consumers fill the owner capacity')
    await open()
  }
  const result=await window.webContents.executeJavaScript(`window.nativeMicrophoneProbe(${JSON.stringify(process.env.ECLIPSE_MIC_DEVICE||'')})`,true)
  console.log(JSON.stringify({...result,reloadRecovery:process.env.ECLIPSE_MIC_RELOAD==='1'}));assert.equal(result.success,true);assert.equal(result.state,'live');assert.ok(result.bytes>100)
  window.destroy();app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})
setTimeout(()=>app.exit(2),20000).unref()
