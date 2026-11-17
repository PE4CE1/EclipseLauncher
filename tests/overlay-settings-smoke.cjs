const {app,BrowserWindow,session,ipcMain}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const root=path.resolve(__dirname,'..'),output=path.join(root,'.cache/overlay-settings'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
const errors=[],calls=[],handlers={};let window,manager,settings={language:'de',overlayGeneralAlwaysOn:false,overlayPerformance:false},metricsActive=false,failNextWrite=false,simulatedGame=null
const build=load()('electron/overlayState.ts').buildOverlayData
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true})
  manager=load({
    './ipcSecurity':{ipcMain:{handle:(name,fn)=>{handlers[name]=fn;ipcMain.handle(name,fn)},on:(name,fn)=>ipcMain.on(name,fn)},secureAppWindow(){}},
    './metricsService':{startMetricsService(get){metricsActive=true;get()?.webContents.send('metrics:update',{cpu:24,gpu:31,ram:50,gameFpsStatus:'idle',gameFpsPid:0})},stopMetricsService(){metricsActive=false}},
    './inputService':{startInputService(){},stopInputService(){}},'./gamepadService':{acquireGamepadService(){},releaseGamepadService(){}},'./streamManager':{updateStreamGameTitle(){}},
  },{dirname:path.join(root,'dist-electron')})('electron/overlayManager.ts')
  ipcMain.on('account:get-identity-sync',event=>event.returnValue=null)
  ipcMain.handle('settings:get',()=>settings)
  ipcMain.handle('settings:set',(_event,patch)=>{if(failNextWrite){failNextWrite=false;return{success:false,error:'Fixture disk full'}}settings={...settings,...patch};calls.push(patch);if(process.env.ECLIPSE_GAME_CROSSHAIRS_UI)manager.getOverlayWindow()?.webContents.send('settings:update',settings);manager.showOverlay(build(settings,simulatedGame));return{success:true}})
  ipcMain.handle('sources:get-all-cached',()=>[]);ipcMain.handle('fps:get-access',()=>({supported:false,ready:false,pending:false,status:'idle'}))
  ipcMain.handle('rl:get-detected-player',()=>null)
  ipcMain.handle('rl:get-state',()=>({primaryId:settings.rlPlayerId||'',players:[{id:'Epic|fixture|0',name:'Fixture player'}],playlist:settings.rlPlaylist||'2v2',connection:'live',mmr:null,mmrStatus:'unavailable'}))
  let rlResets=0
  ipcMain.handle('rl:reset-session',()=>{rlResets++;return{success:true}})
  ipcMain.handle('media:get-status',()=>({isPlaying:false,title:'',artist:'',app:null}))
  ipcMain.handle('media:subscribe',()=>true);ipcMain.handle('media:unsubscribe',()=>true)
  ipcMain.handle('cs2:stats-get',()=>({kills:0,deaths:0,assists:0,headshots:0,headshotKills:0,ct:0,t:0,round:0,map:'',lastSeenAt:0}))
  ipcMain.handle('cs2:stats-reset',()=>({kills:0,deaths:0,assists:0,headshots:0,headshotKills:0,ct:0,t:0,round:0,map:'',lastSeenAt:0}))
  ipcMain.handle('overlay:open-edit',(_event,id)=>{const names={valorant:'VALORANT',fortnite:'Fortnite',cs2:'Counter-Strike 2'};manager.openOverlayEditMode(build(settings,{name:names[id]||'Preview'}))})
  ipcMain.handle('overlay:exit-edit',()=>manager.exitEditMode())
  ipcMain.handle('clips:save-settings',(_event,patch)=>patch)
  if(process.env.ECLIPSE_CROSSHAIR_LIBRARY_UI)require('./crosshair-library-smoke.cjs').setup(ipcMain)
  if(process.env.ECLIPSE_GAME_CROSSHAIRS_UI)require('./game-crosshairs-smoke.cjs').setup(ipcMain)
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)&&!(process.env.ECLIPSE_CROSSHAIR_LIBRARY_UI&&details.url.startsWith('https://centerpointgaming.com/assets/crosshairs/'))}))
  window=new BrowserWindow({show:false,frame:false,width:1120,height:920,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),additionalArguments:process.env.ECLIPSE_QUICK_ACCESS_MODE==='clips'?['--eclipse-clips-mode']:[],sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  window.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|Failed to load resource|404/.test(event.message))errors.push(event.message)})
  await window.loadFile(path.join(root,'.cache/clip-studio/fixture/tests/clip-studio-fixture.html'),{query:{overlaySettings:'1',...(process.env.ECLIPSE_QUICK_ACCESS_UI?{quickAccess:'1'}:{})}})
  const evaluate=code=>window.webContents.executeJavaScript(code,true)
  const until=async(fn,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await wait(35)}throw Error('Overlay settings condition timed out: '+fn)}
  const frame=async(win)=>{
    for(let attempt=0;attempt<15;attempt++){
      try{win.webContents.invalidate();return await win.webContents.capturePage()}
      catch(error){if(!/UnknownVizError/.test(String(error))||attempt===14)throw error;await wait(100)}
    }
  }
  const capture=async(name,win=window)=>{for(let i=0;i<3;i++){await frame(win);await wait(60)}fs.writeFileSync(path.join(output,name),(await frame(win)).toPNG())}
  window.webContents.debugger.attach('1.3')
  const click=async selector=>{
    // Scroll the actual viewport, not nested overflow:hidden accordion clips.
    let point,hit=false
    for(let pass=0;pass<15;pass++){
      await evaluate(`(()=>{const main=document.querySelector('main'),r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();main.scrollTo({top:main.scrollTop+r.y-main.clientHeight/2,behavior:'instant'});return true})()`)
      await wait(20)
      point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
      hit=await evaluate(`document.querySelector(${JSON.stringify(selector)}).contains(document.elementFromPoint(${point.x},${point.y}))`)
      if(hit)break
      // Hidden windows advance compositor transitions when a frame is requested.
      await frame(window);await wait(35)
    }
    if(!hit)console.error('Hit diagnostics',await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});return{point:${JSON.stringify(point)},viewport:[innerWidth,innerHeight],hit:document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,200),parents:[el,...function*(e){while(e=e.parentElement)yield e}(el)].map(e=>({tag:e.tagName,cls:e.className,scroll:e.scrollTop,height:e.clientHeight,total:e.scrollHeight,overflow:getComputedStyle(e).overflowY,inert:e.inert}))}})()`))
    assert.equal(hit,true,'Test target must be visible and receive pointer events: '+selector)
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
    for(const type of ['mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1})
    await wait(70)
  }
  const performanceSwitch='#overlay-performance-toggle [role=switch]'
  if(process.env.ECLIPSE_QUICK_ACCESS_UI){
    await require('./quick-access-smoke.cjs')({window,manager,evaluate,until,click,capture,settings:()=>settings,failSave(){failNextWrite=true},errors})
    manager.hideOverlay(true);window.destroy();app.exit(0);return
  }
  if(process.env.ECLIPSE_GAME_CROSSHAIRS_UI){
    await require('./game-crosshairs-smoke.cjs').run({window,manager,evaluate,until,click,capture,settings:()=>settings,errors,setGame(game){simulatedGame=game;manager.showOverlay(build(settings,game))}})
    manager.hideOverlay(true);window.destroy();app.exit(0);return
  }
  if(process.env.ECLIPSE_CROSSHAIR_UI){
    await require('./crosshair-settings-smoke.cjs')({window,manager,evaluate,until,click,capture,settings:()=>settings,errors})
    manager.hideOverlay(true);window.destroy();app.exit(0);return
  }
  await until(()=>evaluate('!!window.__overlaySettings&&!!document.querySelector("#overlay-scope-always")'))
  await capture('settings-off.png')
  failNextWrite=true
  await click(performanceSwitch)
  await until(()=>evaluate('document.querySelector("#overlay-performance-toggle [role=switch]").getAttribute("aria-checked")==="false"'))
  assert.equal(settings.overlayPerformance,false,'A failed write leaves the native overlay disabled')
  await click('#overlay-scope-always');assert.equal(settings.overlayGeneralAlwaysOn,true)
  await evaluate(`(()=>{const track=document.querySelector(${JSON.stringify('#overlay-performance-toggle [role=switch]')});window.__switchAudit={track,changes:[],frames:[],running:true};const observer=new MutationObserver(records=>records.forEach(record=>window.__switchAudit.changes.push(record.oldValue)));observer.observe(track,{attributes:true,attributeFilter:['aria-checked'],attributeOldValue:true});window.__switchAudit.stop=()=>{window.__switchAudit.running=false;observer.disconnect()};const sample=()=>{if(!window.__switchAudit.running)return;const thumb=track.firstElementChild,t=track.getBoundingClientRect(),k=thumb.getBoundingClientRect(),s=getComputedStyle(thumb);window.__switchAudit.frames.push({inside:k.left>=t.left&&k.right<=t.right,visible:s.visibility==='visible'&&Number(s.opacity)===1,background:s.backgroundColor});requestAnimationFrame(sample)};requestAnimationFrame(sample);return true})()`)
  for(let index=0;index<6;index++)await click(performanceSwitch)
  await wait(180)
  const switchAudit=await evaluate(`(()=>{window.__switchAudit.stop();const audit=window.__switchAudit;return{changes:audit.changes,frames:audit.frames,sameNode:document.querySelector(${JSON.stringify('#overlay-performance-toggle [role=switch]')})===audit.track}})()`)
  assert.deepEqual(switchAudit.changes,['false','true','false','true','false','true'],'Each click must change state exactly once')
  assert.equal(switchAudit.sameNode,true);assert.ok(switchAudit.frames.length>5)
  assert.ok(switchAudit.frames.every(frame=>frame.inside&&frame.visible&&!['transparent','rgba(0, 0, 0, 0)'].includes(frame.background)))
  await click(performanceSwitch)
  await until(()=>manager.getOverlayWindow()?.isVisible())
  let hud=manager.getOverlayWindow()
  hud.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|Failed to load resource|404/.test(event.message))errors.push(event.message)})
  await until(()=>hud.webContents.executeJavaScript('!!document.getElementById("widget-performance")'))
  assert.equal(hud.isFocusable(),false);assert.equal(metricsActive,true)
  await capture('desktop-performance.png',hud)
  await click(performanceSwitch);assert.equal(hud.isVisible(),false);assert.equal(metricsActive,false)
  await click(performanceSwitch);await until(()=>manager.getOverlayWindow()?.isVisible());hud=manager.getOverlayWindow()
  await click('#overlay-scope-game');assert.equal(manager.getOverlayWindow()?.isVisible()||false,false,'Only in game hides the HUD without a running game')
  manager.showOverlay(build(settings,{name:'Fixture Game',startTime:123},42));await until(()=>manager.getOverlayWindow()?.isVisible());hud=manager.getOverlayWindow()
  manager.showOverlay(build(settings,null));assert.equal(manager.getOverlayWindow()?.isVisible()||false,false)
  await click('#overlay-scope-always');await until(()=>manager.getOverlayWindow()?.isVisible())
  await click('#overlay-performance-toggle');await wait(350);await capture('settings-performance.png')
  hud=manager.getOverlayWindow()
  await click('#performance-mirror [role=switch]')
  await until(()=>hud.webContents.executeJavaScript('document.querySelector(".performance-hud")?.dataset.mirrored==="true"'))
  assert.ok(await hud.webContents.executeJavaScript('(()=>{const row=document.querySelector("[data-metric=CPU]"),label=row.querySelector(".performance-hud__label").getBoundingClientRect(),value=row.querySelector(".performance-hud__value").getBoundingClientRect();return value.left<label.left})()'))
  await capture('performance-mirrored.png',hud)
  await evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent.trim()==="Horizontal").click();true')
  await until(()=>hud.webContents.executeJavaScript('!!document.querySelector(".performance-hud--horizontal[data-mirrored]")'))
  assert.ok(await hud.webContents.executeJavaScript('(()=>{const row=document.querySelector("[data-metric=CPU]"),label=row.querySelector(".performance-hud__label").getBoundingClientRect(),value=row.querySelector(".performance-hud__value").getBoundingClientRect(),gpu=document.querySelector("[data-metric=GPU]").getBoundingClientRect();return label.top<value.top&&Math.abs(label.right-value.right)<1&&row.getBoundingClientRect().left>gpu.left})()'),'Horizontal mirroring preserves vertical label order and reverses metric placement')
  await evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent.trim()==="Vertikal").click();true')
  await until(()=>hud.webContents.executeJavaScript('!document.querySelector(".performance-hud--horizontal")'))
  await evaluate('(()=>{const field=document.getElementById("performance-hotkey-native");field.value="Alt+Shift+P";field.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
  await until(()=>settings.overlayPerformanceHotkey==='Alt+Shift+P')
  manager.openOverlayEditMode(build(settings,{name:'Preview'}))
  await until(()=>hud.webContents.executeJavaScript('!!document.getElementById("dot-grid")'))
  assert.equal(await hud.webContents.executeJavaScript('!!document.getElementById("widget-media")'),false,'Disabled Spotify must not appear in edit layout')
  manager.exitEditMode()
  await click('#performance-mirror [role=switch]')
  for (const surface of ['clear','solid','glass']) {
    await click('#performance-surface-'+surface)
    await until(()=>hud.webContents.executeJavaScript(`document.querySelector('.performance-hud')?.dataset.surface==='${surface}'`))
    assert.equal(settings.overlayMetrics.background,surface)
    assert.equal(await hud.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.performance-hud')).backdropFilter`),'none')
    if(surface==='clear')assert.equal(await hud.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.performance-hud')).backgroundColor`),'rgba(0, 0, 0, 0)')
  }
  const knob=await evaluate('(()=>{const track=document.querySelector("#overlay-performance-toggle [role=switch]").getBoundingClientRect(),knob=document.querySelector("#overlay-performance-toggle [role=switch]>span").getBoundingClientRect();return{right:track.right-knob.right,left:knob.left-track.left}})()')
  assert.deepEqual(knob,{right:3,left:19})
  await click(performanceSwitch);await wait(650);assert.equal(manager.getOverlayWindow(),null)
  manager.showClipSavedToast({title:'Fixture clip',duration:30,language:'de'})
  await until(()=>manager.getOverlayWindow()?.isVisible());const toastWindow=manager.getOverlayWindow()
  await until(()=>toastWindow.webContents.executeJavaScript('!!document.querySelector("[role=status]")'))
  assert.equal(await toastWindow.webContents.executeJavaScript('!!document.getElementById("widget-performance")'),false)
  handlers['overlay:dismiss-clip-toast']();assert.equal(toastWindow.isVisible(),false)
  await click('.overlay-layout-button');await until(()=>manager.getOverlayWindow()?.isVisible())
  assert.equal(manager.isEditModeActive(),true)
  await evaluate('window.electronAPI.exitOverlayEdit()');assert.equal(manager.isEditModeActive(),false)
  assert.equal(manager.getOverlayWindow().isVisible(),false)
  await click('#overlay-rocket-league-toggle')
  await until(()=>evaluate('!!document.querySelector(".rl-stats-settings select")'))
  await until(()=>evaluate('document.querySelector(".rl-stats-settings select").options.length>1'))
  await wait(500)
  assert.equal(await evaluate('document.querySelector(".rl-stats-settings").textContent.includes("Die offizielle Schnittstelle liefert keine MMR")'),true)
  await evaluate('(()=>{const select=document.querySelector(".rl-stats-settings select");select.value="Epic|fixture|0";select.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
  await until(()=>settings.rlPlayerId==='Epic|fixture|0')
  await click('.rl-stats-settings [role=group] button:first-child');await until(()=>settings.rlPlaylist==='1v1')
  await click('.rl-stats-settings .overlay-layout-button');assert.equal(rlResets,1)
  await capture('rocket-league-settings.png')
  for(const width of [800,540,400]){window.setSize(width,920);await wait(200);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await capture('settings-'+width+'.png')}
  window.setSize(1120,920);await evaluate('window.__overlaySettings.language("en");true');await capture('settings-en.png')
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({performanceSurfacesPersist:true,clearSurfaceTransparent:true,noBackdropBlur:true,alwaysPerformance:true,realNativeOverlay:true,reactReadyHandshake:true,toggleVisibility:true,failedSaveRolledBack:true,gameOnly:true,gameSwitch:true,metricsStopped:true,toastIsolation:true,editExit:true,switchSingleChangePerClick:true,switchFrameSamples:switchAudit.frames.length,switchNodeStable:switchAudit.sameNode,knob,autosaveCalls:calls.length,rlPlayerSelection:true,rlPlaylistSelection:true,rlReset:rlResets,mmrUnavailableMessage:true,responsive:true,rendererErrors:errors},null,2))
  manager.hideOverlay(true);window.destroy();app.exit(0)
}).catch(async error=>{console.error(error);try{if(window&&!window.isDestroyed()){fs.writeFileSync(path.join(output,'failure.png'),(await window.webContents.capturePage()).toPNG());console.error(await window.webContents.executeJavaScript('document.body.innerText'))}}catch{}finally{manager?.hideOverlay(true);app.exit(1)}})
setTimeout(()=>{console.error('Overlay fixture timeout');app.exit(1)},90000).unref()
