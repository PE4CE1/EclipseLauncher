const electron=require('electron'),{app}=electron,fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),load=require('./download-loader.cjs')
const workspace=path.resolve(__dirname,'..'),temporary=process.env.ECLIPSE_SMOKE_TEMP
app.setPath('userData',temporary);app.setPath('sessionData',temporary)
app.on('window-all-closed',()=>{})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.whenReady().then(async()=>{
  const handlers=new Map(),output=path.join(temporary,'clips');fs.mkdirSync(output,{recursive:true})
  const appApi={...app,once:app.once.bind(app),getPath:()=>temporary,getAppPath:()=>workspace}
  const loader=load({electron:{...electron,app:appApi,globalShortcut:{register:()=>true,unregister(){}}},'./ipcSecurity':{ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}},'./overlayManager':{showClipSavedToast(){}},'./autoClipService':{getAutoClipStatus:()=>({}),refreshAutoClipSettings(){},setupAutoClipGame(){}},'./microphoneCapture':{initMicrophoneCapture(){}},'./processAudioCapture':{initProcessAudioCapture(){},freezeProcessAudio:()=>({}),snapshotProcessAudio:()=>false},'./clipShareService':{initClipSharing(){}}})
  loader('electron/clipService.ts').initClipsIPC()
  const owner=new EventEmitter();owner.id=934;owner.isDestroyed=()=>false;const updates=[];owner.send=(_channel,status)=>updates.push(status)
  const event={sender:owner},call=(name,...args)=>handlers.get('clips:'+name)(event,...args)
  let silentOutput
  try{
    await call('save-settings',{savePath:output,captureEngine:'native',qualityPreset:'custom',quality:'360p',fps:30,bitrate:'1.5M',captureMic:false,audioRecordingOption:'all',captureDesktop:false,notifyOnClip:false,separateApplications:false})
    const first=await call('native-start',5);assert.equal(first.success,true,first.error);assert.equal(first.engine,'native')
    assert.equal(first.desktopAudioAvailable,false,'Disabling desktop audio must work even with application separation off')
    const previewAt=Date.now(),quickPreview=await call('native-preview'),previewMs=Date.now()-previewAt
    assert.match(quickPreview.thumbnailDataUrl,/^data:image\/jpeg;base64,/)
    assert.deepEqual(electron.nativeImage.createFromDataURL(quickPreview.thumbnailDataUrl).getSize(),{width:480,height:270})
    await wait(3500)
    const frozen=await call('native-snapshot');assert.equal(frozen.success,true,frozen.error)
    const foreign=new EventEmitter();foreign.id=935;foreign.isDestroyed=()=>false;foreign.send=()=>{}
    assert.deepEqual(await handlers.get('clips:native-preview')({sender:foreign}),{},'A different renderer cannot read the capture preview')
    const rejected=await handlers.get('clips:save')({sender:foreign},{nativeSnapshotId:frozen.id,title:'Forbidden',gameTitle:'Fixture',duration:5})
    assert.equal(rejected.success,false,'A different renderer cannot consume this snapshot')
    const saved=await call('save',{nativeSnapshotId:frozen.id,title:'Native video test',gameTitle:'Fixture',duration:5,resolution:'360p',fps:30,bitrate:'1.5M',thumbnailDataUrl:frozen.thumbnailDataUrl})
    assert.equal(saved.success,true,saved.error);assert.equal(saved.clip.width,640);assert.equal(saved.clip.height,360);assert.ok(saved.clip.averageFps>28,JSON.stringify(saved.clip));assert.ok(saved.clip.duration>3&&saved.clip.duration<=5.1);assert.match(saved.clip.thumbnailUrl,/^local-media:/)
    await call('native-stop')
    assert.equal((await call('native-snapshot')).success,false)
    const fixture=new electron.BrowserWindow({width:800,height:600,show:false,focusable:false,skipTaskbar:true,webPreferences:{sandbox:true}})
    try{
      await fixture.loadURL('data:text/html,<title>Eclipse native capture fixture</title><body style="margin:0;background:linear-gradient(45deg,%23084,%23f80);color:white;font:30px sans-serif">Native window capture test</body>')
      fixture.showInactive();await wait(400)
      const source=(await electron.desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}})).find(s=>s.name==='Eclipse native capture fixture')
      assert.ok(source,'The native window must be enumerated')
      await call('save-settings',{selectedMonitorId:source.id})
      const windowReady=await call('native-start',5);assert.equal(windowReady.success,true,windowReady.error);assert.equal(windowReady.gpuScaling,true)
      fixture.setSize(1000,500);await wait(2200)
      const windowSnapshot=await call('native-snapshot');assert.equal(windowSnapshot.success,true,windowSnapshot.error)
      const windowSaved=await call('save',{nativeSnapshotId:windowSnapshot.id,title:'Native resized window',gameTitle:'Fixture',duration:5,resolution:'360p',fps:30,bitrate:'1.5M'})
      assert.equal(windowSaved.success,true,windowSaved.error);assert.equal(windowSaved.clip.width,windowReady.width);assert.equal(windowSaved.clip.height,windowReady.height);assert.ok(windowSaved.clip.averageFps>28,JSON.stringify(windowSaved.clip))
      fixture.destroy();await wait(600);assert.equal(updates.at(-1).active,false,'Closing a selected window must stop capture instead of switching sources')
    }finally{if(!fixture.isDestroyed())fixture.destroy();await call('native-stop');await call('save-settings',{selectedMonitorId:''})}
    // An active zero-gain stream makes desktop loopback measurable even on a
    // silent PC. No sound is played and no Windows audio settings are changed.
    silentOutput=new electron.BrowserWindow({show:false,webPreferences:{sandbox:true,autoplayPolicy:'no-user-gesture-required'}})
    await silentOutput.loadURL('data:text/html,<title>Silent audio fixture</title>')
    assert.equal(await silentOutput.webContents.executeJavaScript(`(async()=>{const context=window.testAudio=new AudioContext();const oscillator=context.createOscillator(),gain=context.createGain();gain.gain.value=0;oscillator.connect(gain).connect(context.destination);oscillator.start();await context.resume();return context.state})()`,true),'running')
    const audioTiming=await new Promise((resolve,reject)=>require('node:child_process').execFile(process.execPath,[path.join(__dirname,'native-audio-timing.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,timeout:12000,maxBuffer:65536},(error,stdout,stderr)=>{try{if(error)throw new Error(stderr||error.message);resolve(JSON.parse(stdout))}catch(failure){reject(failure)}}))
    for(const channel of audioTiming){assert.ok(channel.count>200,JSON.stringify(channel));assert.ok(Math.abs(channel.gapSamples.p50)<.05&&Math.abs(channel.gapSamples.p95)<.05,JSON.stringify(channel))}
    await call('save-settings',{captureMic:true,micDeviceId:'auto',micSensitivity:-60,micVolume:100,audioRecordingOption:'all',captureDesktop:true})
    const second=await call('native-start',5);assert.equal(second.success,true,second.error);assert.equal(second.micAvailable,true,'Native Windows microphone must start');assert.equal(second.desktopAudioAvailable,true,'Native desktop loopback must start')
    await wait(3000)
    const snapshotAt=Date.now(),audioSnapshot=await call('native-snapshot');assert.equal(audioSnapshot.success,true,audioSnapshot.error)
    const nativeSnapshotMs=Date.now()-snapshotAt,saveAt=Date.now()
    const audioClip=await call('save',{nativeSnapshotId:audioSnapshot.id,title:'Native separate audio test',gameTitle:'Fixture',duration:5,resolution:'360p',fps:30,bitrate:'1.5M',thumbnailDataUrl:audioSnapshot.thumbnailDataUrl})
    assert.equal(audioClip.success,true,audioClip.error);assert.ok(audioClip.clip.micFileName);assert.ok(audioClip.clip.desktopAudioFileName)
    const saveMs=Date.now()-saveAt
    owner.emit('did-start-navigation',{isMainFrame:true,isSameDocument:true})
    assert.ok((await call('native-snapshot')).success,'Same-document navigation must not stop capture')
    owner.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false})
    await wait(1800)
    assert.equal((await call('native-snapshot')).success,false)
    await call('save-settings',{captureEngine:'browser'})
    assert.equal((await call('get-settings')).captureEngine,undefined,'The retired engine preference must be discarded')
    assert.equal((await call('list')).length,3,'Removing the previous engine must preserve existing clips')
    console.log(JSON.stringify({success:true,encoder:first.encoder,gpuScaling:first.gpuScaling,previewMs,nativeSnapshotMs,saveMs,audioTiming,windowCapture:true,windowResize:true,windowClose:true,width:saved.clip.width,height:saved.clip.height,fps:saved.clip.averageFps,duration:saved.clip.duration,nativeMicrophone:true,nativeDesktopAudio:true,separateTracks:true,thumbnail:true,ownerIsolation:true,rendererReloadStopsCapture:true,nativeOnly:true,clipsPreserved:true}))
  }finally{await call('native-stop');if(silentOutput&&!silentOutput.isDestroyed())silentOutput.destroy()}
  app.exit(0)
}).catch(error=>{console.error(error.stack);app.exit(1)})
setTimeout(()=>app.exit(2),60000).unref()
