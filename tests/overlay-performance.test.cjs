const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

const header = 'Application,ProcessID,SwapChainAddress,MsBetweenPresents\r\n'
const row = (pid, chain, duration) => `"game, example.exe",${pid},${chain},${duration}\r\n`

test('FPS is calculated from target-process presentation intervals and the dominant swap chain', () => {
  const { FpsSamples } = loadTs()('electron/fpsSamples.ts')
  const samples = new FpsSamples(100)
  const source = header + row(100,'main',10).repeat(100) + row(100,'menu',33.333).repeat(30) + row(200,'other-game',1).repeat(200)
  samples.push(source.slice(0,19),10000)
  samples.push(source.slice(19,108),10000)
  samples.push(source.slice(108),10000)
  assert.deepEqual(samples.read(10000),{fps:100,frameTimeMs:10})
  assert.equal(samples.read(13000),undefined,'A stopped game must never retain a stale FPS value')
})

test('invalid timing rows are discarded and frame rates are time-weighted rather than averaged as reciprocal FPS', () => {
  const { FpsSamples } = loadTs()('electron/fpsSamples.ts')
  const samples = new FpsSamples(100)
  samples.push(header+row(100,'main',10)+row(100,'main',30)+row(100,'main',0)+row(100,'main','NA')+row(100,'main',-4),1000)
  assert.deepEqual(samples.read(1000),{fps:50,frameTimeMs:20})
})

function fpsFixture(t, additionalMocks = {}) {
  const platform=Object.getOwnPropertyDescriptor(process,'platform')
  Object.defineProperty(process,'platform',{...platform,value:'win32'})
  t.after(()=>Object.defineProperty(process,'platform',platform))
  const children=[],stops=[]
  const service=loadTs({
    electron:{app:{getAppPath:()=>'/app'}},fs:{existsSync:()=>true},
    child_process:{spawn:(file,args,options)=>{
      const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.killed=false
      child.kill=()=>{child.killed=true;child.exitCode=0;child.emit('exit',0)}
      child.args=args;children.push(child)
      assert.equal(options.windowsHide,true)
      assert.ok(args.includes('--process_id'))
      assert.ok(!args.includes('--restart_as_admin'))
      return child
    },execFile:(file,args,options,callback)=>{
      stops.push(args)
      const session=args[1]
      const child=children.find(candidate=>candidate.args[candidate.args.indexOf('--session_name')+1]===session)
      child?.kill();callback(null,'','');return new EventEmitter()
    }},
    ...additionalMocks,
  })('electron/gameFpsService.ts')
  t.after(service.stopGameFpsMonitor)
  return{...service,children,stops}
}

test('FPS collector follows PID changes, ignores late exits and stops only its owned ETW session',t=>{
  const service=fpsFixture(t)
  service.startGameFpsMonitor(123)
  service.startGameFpsMonitor(123)
  assert.equal(service.children.length,1)
  service.children[0].stdout.emit('data',header+row(123,'main',16.667).repeat(60))
  assert.equal(service.getGameFps(),60)
  service.startGameFpsMonitor(456)
  assert.equal(service.children.length,2)
  service.children[0].emit('exit',6)
  assert.equal(service.getGameFpsSnapshot().gameFpsPid,456)
  assert.equal(service.getGameFps(),0)
  service.children[1].stdout.emit('data',header+row(456,'main',8.333).repeat(120))
  assert.equal(service.getGameFps(),120)
  service.stopGameFpsMonitor()
  assert.equal(service.getGameFpsSnapshot().gameFpsStatus,'idle')
  assert.equal(service.stops.length,2)
  assert.ok(service.stops.every(args=>args[1].startsWith('EclipseFps_')&&args[2]==='--terminate_existing_session'))
})

test('denied FPS permissions produce a visible status without UAC or a collector restart loop',t=>{
  const service=fpsFixture(t)
  service.startGameFpsMonitor(123)
  service.children[0].stderr.emit('data','error: failed to start trace session: access denied. Performance Log Users')
  service.children[0].emit('exit',6)
  assert.equal(service.getGameFpsSnapshot().gameFpsStatus,'permission-required')
  service.startGameFpsMonitor(123)
  assert.equal(service.children.length,1)
  assert.equal(service.getGameFps(),0)
})

test('explicit FPS approval resumes the current PID and reuses its helper across game switches',async t=>{
  const instances=[]
  class Broker {
    constructor(data,status){this.data=data;this.status=status;this.targets=[];this.ready=false;instances.push(this)}
    activate(){this.ready=true;return Promise.resolve({success:true})}
    setTarget(pid){this.targets.push(pid)}
    close(){this.ready=false;this.closed=true}
  }
  const service=fpsFixture(t,{'./fpsAccessBroker':{FpsAccessBroker:Broker}})
  t.after(service.shutdownGameFpsAccess)
  service.startGameFpsMonitor(123)
  service.children[0].stderr.emit('data','error: failed to start trace session: access denied.')
  service.children[0].emit('exit',6)
  const first=service.enableGameFpsAccess()
  assert.equal(service.enableGameFpsAccess(),first)
  assert.deepEqual(await first,{success:true})
  instances[0].data(123,header+row(123,'main',16.667).repeat(60))
  assert.equal(service.getGameFps(),60)
  assert.equal(service.getGameFpsAccess().ready,true)
  service.startGameFpsMonitor(456)
  instances[0].data(123,header+row(123,'main',1).repeat(100))
  assert.equal(service.getGameFps(),0)
  instances[0].data(456,header+row(456,'main',8.333).repeat(120))
  assert.equal(service.getGameFps(),120)
  assert.equal(service.children.length,1,'Privileged mode must not start another unprivileged collector')
  assert.equal(instances.length,1)
  assert.equal(instances[0].targets.at(-1),456)
  service.stopGameFpsMonitor()
  assert.equal(instances[0].targets.at(-1),0)
  service.shutdownGameFpsAccess()
  assert.equal(instances[0].closed,true)
})

test('metrics acquire FPS only on demand, skip disabled hardware queries and suppress identical IPC snapshots',t=>{
  t.mock.timers.enable({apis:['setInterval','setTimeout']})
  let cpuReads=0,hardwareQueries=0,started=[],stopped=0
  let fps={gameFpsStatus:'idle'}
  const sends=[]
  const win={isDestroyed:()=>false,isVisible:()=>true,webContents:{isLoadingMainFrame:()=>false,send:(name,data)=>sends.push(data)}}
  const service=loadTs({
    electron:{powerMonitor:{getSystemIdleTime:()=>{assert.fail('Idle polling was disabled')}}},
    os:{cpus:()=>{cpuReads++;return[{times:{user:0,nice:0,sys:0,idle:100,irq:0}}]},totalmem:()=>assert.fail('RAM was disabled'),freemem:()=>assert.fail('RAM was disabled')},
    child_process:{execFile:()=>{hardwareQueries++;return new EventEmitter()}},
    './gameFpsService':{getGameFpsSnapshot:()=>fps,startGameFpsMonitor:pid=>started.push(pid),stopGameFpsMonitor:()=>stopped++},
  })('electron/metricsService.ts')
  t.after(service.stopMetricsService)
  service.startMetricsService(()=>win,{pid:12,fps:true})
  service.startMetricsService(()=>win,{pid:12,fps:true})
  t.mock.timers.tick(2000)
  assert.deepEqual(started,[12]);assert.equal(sends.length,1);assert.equal(cpuReads,0);assert.equal(hardwareQueries,0)
  fps={gameFpsStatus:'ready',gameFps:144,gameFpsPid:12}
  t.mock.timers.tick(1000)
  assert.equal(sends.length,2)
  service.startMetricsService(()=>win,{pid:12,fps:false})
  assert.equal(stopped,1)
})

test('overlay waits for native transitions to be disabled before showing its first frame',async t=>{
  let ready
  const overlay=overlayFixture(t,()=>new Promise(resolve=>{ready=resolve}))
  overlay.showOverlay({name:'Desktop',settings:{performance:true,overlayGeneralAlwaysOn:true}})
  const win=overlay.windows[0]
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  assert.equal(win.isVisible(),false)
  ready();for(let tick=0;tick<5;tick++)await Promise.resolve()
  assert.equal(win.isVisible(),true)
})

function overlayFixture(t, windowEffects = () => undefined) {
  const windows=[],sends=[],metrics=[],handlers={},inputs=[],controllers=[]
  class FakeWindow extends EventEmitter {
    constructor(options){super();this.options=options;this.visible=false;this.destroyed=false;this.bounds={x:0,y:0,width:1920,height:1079};this.loading=true;this.webContents=new EventEmitter();this.webContents.isLoading=()=>this.loading;this.webContents.send=(name,payload)=>sends.push({window:this,name,payload});windows.push(this)}
    loadFile(){} loadURL(){} setIgnoreMouseEvents(ignore,options){(this.mouseCalls??=[]).push({ignore,forward:options?.forward===true})} setAlwaysOnTop(){} setFocusable(){} focus(){} moveTop(){}
    setBounds(bounds){this.bounds=bounds}getBounds(){return this.bounds}isDestroyed(){return this.destroyed}isVisible(){return this.visible}showInactive(){this.visible=true}show(){this.visible=true}
    hide(){this.visible=false}destroy(){this.destroyed=true;this.emit('closed')}close(){this.destroy()}
  }
  const service=loadTs({
    electron:{BrowserWindow:FakeWindow,screen:{getPrimaryDisplay:()=>({bounds:{x:0,y:0,width:1920,height:1080}})}},
    './overlayWindowEffects': { disableOverlayWindowTransitions: windowEffects },
    './ipcSecurity':{ipcMain:{handle:(name,handler)=>handlers[name]=handler,on(){}},secureAppWindow(){}},
    './metricsService':{startMetricsService:(get,selection)=>metrics.push(selection),stopMetricsService(){}},
    './inputService':{startInputService(){inputs.push('start')},stopInputService(){inputs.push('stop')}},
    './gamepadService':{acquireGamepadService(){controllers.push('start')},releaseGamepadService(){controllers.push('stop')}},
    './streamManager':{updateStreamGameTitle(){}},
  })('electron/overlayManager.ts')
  t.after(()=>service.hideOverlay(true))
  return{...service,windows,sends,metrics,handlers,inputs,controllers}
}

test('clip notifications update immediately in place, accept rapid clips and ignore stale completions',t=>{
  const overlay=overlayFixture(t),requestId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',nextId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  overlay.showClipSavedToast({requestId,status:'saving',gameTitle:'First game',duration:30})
  const win=overlay.windows[0]
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  const first=overlay.sends.find(event=>event.name==='overlay:clip-saved').payload
  assert.equal(first.status,'saving')
  overlay.showClipSavedToast({requestId,status:'saving',previewOnly:true,thumbnailUrl:'data:image/jpeg;base64,preview'})
  assert.equal(overlay.sends.at(-1).payload.id,first.id)
  assert.equal(overlay.sends.at(-1).payload.thumbnailUrl,'data:image/jpeg;base64,preview')
  overlay.showClipSavedToast({requestId,status:'saved',duration:28})
  const saved=overlay.sends.at(-1).payload
  assert.equal(saved.id,first.id);assert.equal(saved.gameTitle,'First game');assert.equal(saved.status,'saved')
  const completedSends=overlay.sends.length
  overlay.showClipSavedToast({requestId,status:'saving',previewOnly:true,thumbnailUrl:'late'})
  assert.equal(overlay.sends.length,completedSends,'Late previews must not regress the saved status')
  overlay.showClipSavedToast({requestId:nextId,status:'saving',gameTitle:'Next game'})
  const next=overlay.sends.at(-1).payload
  assert.notEqual(next.id,first.id,'A rapid next clip must get its own notification identity')
  const sent=overlay.sends.length
  overlay.showClipSavedToast({requestId,status:'saved'})
  assert.equal(overlay.sends.length,sent,'Older encodes must not overwrite the latest clip')
  overlay.showClipSavedToast({requestId:nextId,status:'error'})
  assert.equal(overlay.sends.at(-1).payload.status,'error')
  assert.equal(overlay.sends.at(-1).payload.gameTitle,'Next game')
  overlay.handlers['overlay:dismiss-clip-toast']()
  overlay.showClipSavedToast({requestId:nextId,status:'saved'})
  overlay.showClipSavedToast({requestId:nextId,status:'saving',previewOnly:true,thumbnailUrl:'late'})
  assert.equal(win.isVisible(),false,'A dismissed popup must not be replayed on late completion')
})

test('overlay readiness sends the latest game state once and drops duplicate process-poll updates',t=>{
  const overlay=overlayFixture(t)
  const first={name:'First',pid:1,settings:{performance:true,metrics:{cpu:false,gpu:false,ram:false,fps:true}}}
  const latest={...first,name:'Latest',pid:2}
  overlay.showOverlay(first)
  overlay.showOverlay(latest)
  const window=overlay.windows[0];window.loading=false;window.emit('ready-to-show');window.webContents.emit('did-finish-load')
  assert.equal(window.isVisible(),false,'Native readiness alone must not reveal a renderer without IPC listeners')
  overlay.handlers['overlay:get-current-state']({sender:{}})
  assert.equal(window.isVisible(),false,'Settings-page status polling must not acknowledge the overlay renderer')
  overlay.handlers['overlay:get-current-state']({sender:window.webContents})
  assert.equal(overlay.sends.length,1)
  assert.equal(overlay.sends[0].payload.pid,2)
  assert.equal(overlay.metrics.at(-1).pid,2)
  overlay.showOverlay({...latest,settings:{...latest.settings}})
  assert.equal(overlay.sends.length,1)
  overlay.showOverlay({...latest,positions:{performance:{xPct:.5,yPct:.2}}})
  assert.equal(overlay.sends.length,2)
  assert.equal(window.options.webPreferences.sandbox,true)
  assert.equal(window.options.thickFrame,false,'The native Windows frame must not animate the HUD on show/hide')
})

test('a stale closed event cannot clear a newer overlay or stop its services',t=>{
  const overlay=overlayFixture(t)
  overlay.showOverlay({name:'Game',settings:{crosshair:true}})
  const old=overlay.windows[0]
  overlay.hideOverlay(true)
  overlay.showOverlay({name:'New Game',settings:{crosshair:true}})
  const current=overlay.windows[1]
  old.emit('closed')
  assert.equal(overlay.getOverlayWindow(),current)
})

test('passive performance and controller HUDs never forward high-frequency mouse movement to Chromium',t=>{
  const overlay=overlayFixture(t)
  const data={name:'Game',pid:42,settings:{performance:true}}
  overlay.showOverlay(data)
  const win=overlay.windows[0]
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  for(let i=0;i<20;i++)overlay.showOverlay({...data})
  assert.deepEqual(win.mouseCalls,[{ignore:true,forward:false}])
  overlay.showOverlay({...data,settings:{...data.settings,overlayMedia:true}})
  assert.deepEqual(win.mouseCalls.at(-1),{ignore:true,forward:true})
  const calls=win.mouseCalls.length
  overlay.showOverlay({...data,settings:{...data.settings,overlayMedia:true}})
  assert.equal(win.mouseCalls.length,calls,'Process polling must not reset media hover click-through')
  overlay.showOverlay({...data,settings:{...data.settings,overlayController:true}})
  assert.deepEqual(win.mouseCalls.at(-1),{ignore:true,forward:false})
  overlay.openOverlayEditMode(data)
  assert.deepEqual(win.mouseCalls.at(-1),{ignore:false,forward:false})
  overlay.exitEditMode()
  assert.deepEqual(win.mouseCalls.at(-1),{ignore:true,forward:false})
})

test('child-frame loads and same-document navigation cannot invalidate a visible overlay',t=>{
  const overlay=overlayFixture(t)
  overlay.showOverlay({name:'Game',settings:{performance:true,overlayController:true}})
  const win=overlay.windows[0]
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  assert.equal(win.isVisible(),true)
  win.webContents.emit('did-start-navigation',{isMainFrame:false,isSameDocument:false})
  win.webContents.emit('did-start-loading')
  assert.equal(win.isVisible(),true,'A controller skin must not hide every HUD widget')
  win.webContents.emit('did-start-navigation',{isMainFrame:true,isSameDocument:true})
  assert.equal(win.isVisible(),true)
  win.webContents.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false})
  assert.equal(win.isVisible(),false,'Replacing the main document must wait for fresh React listeners')
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  assert.equal(win.isVisible(),true)
})

test('a standalone Rocket League Steam avatar acquires its keyboard and controller inputs',t=>{
  const overlay=overlayFixture(t)
  overlay.showOverlay({name:'Rocket League',settings:{overlayRLSteam:true,overlayControllerStreamOnly:true}})
  const win=overlay.windows[0]
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  assert.equal(win.isVisible(),true)
  assert.equal(overlay.inputs.at(-1),'start')
  assert.equal(overlay.controllers.at(-1),'start')
  overlay.hideOverlay()
  assert.equal(overlay.inputs.at(-1),'stop')
  assert.equal(overlay.controllers.at(-1),'stop')
})

test('overlay positions recover from malformed persisted values without overwriting valid widgets',()=>{
  const {normalizeOverlayPositions,sameOverlayPositions}=loadTs()('src/components/overlay/overlayGeometry.ts')
  const defaults={performance:{xPct:.02,yPct:.03},crosshair:{xPct:.5,yPct:.5}}
  const positions=normalizeOverlayPositions(defaults,{performance:{xPct:NaN,yPct:3},crosshair:{xPct:.4,yPct:.6},unknown:{xPct:.2,yPct:.2}})
  assert.deepEqual(positions,{performance:{xPct:.02,yPct:1},crosshair:{xPct:.4,yPct:.6}})
  assert.equal(sameOverlayPositions(positions,{...positions}),true)
  assert.equal(sameOverlayPositions(positions,defaults),false)
})

test('Always and stream-only policies are identical for settings changes, process polling and desktop startup',()=>{
  const {buildOverlayData,hasDesktopWidgets}=loadTs()('electron/overlayState.ts')
  const settings={overlayGeneralAlwaysOn:true,overlayPerformance:true,overlayControllerStreamOnly:true,overlayController:true,overlayRobloxTimer:true,overlayRLHud:true}
  const desktop=buildOverlayData(settings,null)
  assert.equal(desktop.settings.overlayGeneralAlwaysOn,true)
  assert.equal(desktop.settings.overlayControllerStreamOnly,true)
  assert.equal(desktop.settings.robloxTimer,false);assert.equal(desktop.settings.rlHud,false)
  assert.equal(hasDesktopWidgets(desktop),true)
  assert.equal(hasDesktopWidgets(buildOverlayData({...settings,overlayGeneralAlwaysOn:false},null)),false)
  assert.equal(hasDesktopWidgets(buildOverlayData({...settings,overlayPerformance:false},null)),false,'Stream-only controller does not create a desktop widget')
  assert.equal(hasDesktopWidgets(buildOverlayData({...settings,overlayGeneralAlwaysOn:false},{name:'Game',startTime:123},99)),true)
})
test('rapid off/on changes hide immediately, reuse the renderer and only reveal the final state',t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const overlay=overlayFixture(t),data={name:'Desktop',settings:{performance:true,overlayGeneralAlwaysOn:true}}
  overlay.showOverlay(data);const win=overlay.windows[0]
  overlay.showOverlay({...data,settings:{...data.settings,performance:false}})
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  assert.equal(win.isVisible(),false)
  assert.equal(overlay.sends.at(-1).payload.settings.performance,false)
  t.mock.timers.tick(200);overlay.showOverlay(data)
  assert.equal(overlay.windows.length,1);assert.equal(win.isVisible(),true)
  assert.equal(overlay.sends.at(-1).payload.settings.performance,true)
  t.mock.timers.tick(500);assert.equal(win.isDestroyed(),false)
  overlay.hideOverlay();assert.equal(win.isVisible(),false)
  assert.equal(overlay.sends.at(-1).payload,null)
  t.mock.timers.tick(500);assert.equal(win.isDestroyed(),true)
})
test('a clip toast cannot retain disabled HUD widgets, and edit-only windows close after exiting',t=>{
  const overlay=overlayFixture(t),data={name:'Game',settings:{performance:true}}
  overlay.showOverlay(data);const win=overlay.windows[0]
  overlay.handlers['overlay:get-current-state']({sender:win.webContents})
  overlay.showClipSavedToast({title:'Test',duration:30});overlay.hideOverlay()
  assert.equal(win.isVisible(),true)
  assert.equal(overlay.sends.at(-1).payload,null,'The HUD clears while a toast finishes')
  overlay.handlers['overlay:dismiss-clip-toast']();assert.equal(win.isVisible(),false)
  overlay.openOverlayEditMode(data);assert.equal(win.isVisible(),true)
  overlay.exitEditMode();assert.equal(win.isVisible(),false)
})
