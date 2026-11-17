const {app,BrowserWindow,protocol,ipcMain}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const http=require('node:http')
const root=path.resolve(__dirname,'..'),variant=process.env.ECLIPSE_REPLAY_CONTROL==='1'?'control':'disk',output=path.join(root,'.cache/ram-replay-20261108',process.env.ECLIPSE_RAM_LABEL||variant)
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('temp',process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('videos',process.env.ECLIPSE_SMOKE_TEMP)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
protocol.registerSchemesAsPrivileged([{scheme:'local-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
const load=require('./download-loader.cjs')({'./overlayManager':{showClipSavedToast(){}}})
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true})
  const fixture=path.join(root,`.cache/ram-replay-20261108/${variant==='control'?'control':'disk'}-fixture`)
  const server=http.createServer((request,response)=>{
    const route=new URL(request.url,'http://127.0.0.1').pathname
    const file=route==='/index.html'?path.join(fixture,'tests/ram-replay-fixture.html'):path.resolve(fixture,'.'+decodeURIComponent(route))
    if(!file.startsWith(fixture+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return}
    response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'))
    fs.createReadStream(file).pipe(response)
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  process.env.VITE_DEV_SERVER_URL=`http://127.0.0.1:${server.address().port}`
  const security=load('electron/ipcSecurity.ts'),clips=load('electron/clipService.ts'),{serveLocalMedia}=load('electron/localMediaProtocol.ts')
  clips.initClipsIPC()
  const directory=path.join(app.getPath('userData'),'Eclipse Clips')
  protocol.handle('local-media',request=>serveLocalMedia(request,[directory]))
  fs.writeFileSync(path.join(app.getPath('userData'),'clip_settings.json'),JSON.stringify({enabled:true,screenRecordingOnAppStart:false,autoStartOnGame:false,quality:'720p',fps:60,bitrate:'20M',replayDurationSeconds:60,captureMic:false,audioRecordingOption:'none',notifyOnClip:false,playSoundOnClip:false,videoEncoder:'cpu',savePath:directory}))
  ipcMain.on('account:get-identity-sync',event=>{event.returnValue=null})
  ipcMain.handle('settings:set',()=>({success:true}));ipcMain.handle('sources:get-all-cached',()=>[])
  const window=new BrowserWindow({show:false,width:1000,height:760,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  security.secureAppWindow(window)
  const errors=[]
  window.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|404|Failed to load resource/.test(event.message))errors.push(event.message)})
  const evaluate=code=>window.webContents.executeJavaScript(code,true)
  await window.loadURL(process.env.VITE_DEV_SERVER_URL+'/index.html')
  window.showInactive()
  for(let i=0;i<80&&!await evaluate('!!window.__ramReplay');i++)await wait(50)
  const report={variant,scope:'Private and working-set MiB across every process of this isolated Electron app; synthetic 720p60/20Mbps recording; production post-media cache release; no benchmark-only GC or working-set trimming',samples:[],errors}
  const sample=async phase=>{
    const processes=app.getAppMetrics().map(item=>({type:item.type,pid:item.pid,privateMiB:(item.memory?.privateBytes||0)/1024,workingMiB:(item.memory?.workingSetSize||0)/1024}))
    const entry={phase,privateMiB:processes.reduce((sum,item)=>sum+item.privateMiB,0),workingMiB:processes.reduce((sum,item)=>sum+item.workingMiB,0),processes,replay:await evaluate('window.electronAPI.clips.replayStats()'),state:await evaluate('window.__ramReplay.state()')}
    report.samples.push(entry);fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({phase,privateMiB:Math.round(entry.privateMiB),workingMiB:Math.round(entry.workingMiB),diskMiB:Math.round(entry.replay.bytes/1048576)}))
  }
  await wait(1000);await sample('idle')
  assert.equal(await evaluate('window.__ramReplay.start()'),true)
  await wait(1000);await sample('recording-start')
  const seconds=Number(process.env.ECLIPSE_RAM_SECONDS)||60
  for(let second=0;second<seconds;second++){await wait(1000);if([19,39,seconds-1].includes(second))await sample(`recording-${second+1}s`)}
  await evaluate('window.__saving=window.__ramReplay.save().then(value=>window.__saved=value);true')
  for(let tick=0;tick<90;tick++){
    await sample('saving-'+tick)
    if(await evaluate('typeof window.__saved==="boolean"'))break
    await wait(1000)
  }
  assert.equal(await evaluate('window.__saved'),true)
  await wait(1000);await sample('editor-open')
  await evaluate('window.__closedVideo=document.querySelector("video");window.__ramReplay.close();true')
  await wait(300)
  assert.equal(await evaluate('!window.__closedVideo||(!window.__closedVideo.isConnected&&window.__closedVideo.getAttribute("src")===null)'),true)
  await evaluate('delete window.__closedVideo;true')
  for(let cycle=1;cycle<=(Number(process.env.ECLIPSE_RAM_CYCLES)||0);cycle++){
    await wait(2500)
    await evaluate('window.__saved=undefined;window.__ramReplay.save().then(value=>window.__saved=value);true')
    for(let tick=0;tick<60&&!await evaluate('typeof window.__saved==="boolean"');tick++)await wait(500)
    assert.equal(await evaluate('window.__saved'),true)
    await wait(1000);await sample('cycle-'+cycle+'-editor')
    await evaluate('window.__ramReplay.close();true')
    await wait(2200);await sample('cycle-'+cycle+'-closed')
    assert.equal(await evaluate('window.__ramReplay.state().active'),true,'Closing a clip must not stop background recording')
  }
  await evaluate('window.__ramReplay.stop();true')
  await wait(2000);await sample('stopped')
  await wait(8000);await sample('stopped-idle')
  assert.deepEqual((await evaluate('window.electronAPI.clips.replayStats()')),{parts:0,bytes:0,leases:0})
  assert.equal(await evaluate('(()=>{if(typeof window.electronAPI.releaseUnusedMediaMemory!=="function")return false;window.electronAPI.releaseUnusedMediaMemory();return true})()'),true)
  assert.deepEqual(errors,[])
  window.destroy();server.closeAllConnections();server.close();app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})
setTimeout(()=>{console.error('Replay memory test timed out');app.exit(1)},180000).unref()
