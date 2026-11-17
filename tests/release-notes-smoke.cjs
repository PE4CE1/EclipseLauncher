const {app,BrowserWindow,session,ipcMain}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),output=path.join(root,'.cache/release-notes'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
const release={id:132,tag_name:'v1.3.2',name:'Clip Engine Rework, Toast Overlays & Bug Fixes',published_at:'2026-09-28T22:00:00Z',html_url:'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.3.2',body:'## Capture & playback\n- **Engine rework:** Refined replay buffering and session rotation.\n- **Precise settings:** Record with `60 FPS` and an explicit target bitrate.\n- **A deliberately long feature title that must wrap without being truncated in narrow windows:** '+('The original release description stays readable. '.repeat(9))+'\n\n## Clip editor\n- **Audio tracks:** Separate game and microphone audio.\n- **Drafts:** Save edits and continue later.\n  - Nested details stay attached to their section.\n\n## Fixes & polish\n- **Overlay lifecycle:** Cleaner transitions between desktop and games.\n- **Release history:** See the [complete release](https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.3.2).'}
let window,mode='hold';const pending=new Map(),requests=[],cancelled=[],links=[],errors=[]
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true})
  const response=request=>{
    const latest=request.url.endsWith('/latest'),status=mode==='error'?503:mode==='empty'?404:200
    return{status,headers:{'content-type':'application/json'},body:status===200?JSON.stringify(latest?release:[release,{...release,id:131,tag_name:'v1.3.1',name:'Previous update',body:'## Changes\n- **Earlier fix:** Previous release notes.'}]):'',url:request.url}
  }
  ipcMain.on('account:get-identity-sync',event=>event.returnValue=null)
  ipcMain.handle('sources:get-all-cached',()=>[]);ipcMain.handle('settings:set',()=>({success:true}))
  ipcMain.handle('system:open-url',(_event,url)=>{links.push(url);return{success:true}})
  ipcMain.handle('network:request',(_event,request)=>{requests.push(request.url);return mode==='hold'?new Promise(resolve=>pending.set(request.id,{request,resolve})):response(request)})
  ipcMain.on('network:cancel',(_event,id)=>{cancelled.push(id);const item=pending.get(id);if(item){item.resolve({...response(item.request),status:499,body:''});pending.delete(id)}})
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)}))
  window=new BrowserWindow({show:false,frame:false,width:1150,height:930,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  window.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|Failed to load resource|404/.test(event.message))errors.push(event.message)})
  const evaluate=code=>window.webContents.executeJavaScript(code,true)
  const until=async(expression,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await wait(35)}throw Error('Release fixture timeout: '+expression)}
  const load=async(modalOnly=false)=>{await window.loadFile(path.join(root,'.cache/clip-studio/fixture/tests/clip-studio-fixture.html'),{query:{releaseNotes:'1',...(modalOnly?{modalOnly:'1'}:{})}});await until('!!window.__releaseFixture')}
  const frame=async()=>{
    for(let attempt=0;attempt<15;attempt++){try{window.webContents.invalidate();return await window.webContents.capturePage()}catch(error){if(!/UnknownVizError/.test(String(error))||attempt===14)throw error;await wait(100)}}
  }
  const capture=async name=>{
    for(let i=0;i<3;i++){await frame();await wait(70)}
    fs.writeFileSync(path.join(output,name),(await frame()).toPNG())
  }
  window.webContents.debugger.attach('1.3')
  const click=async selector=>{
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'});true`)
    const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    for(const type of ['mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1})
    await wait(70)
  }
  const key=async(key,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type,key,code:key,modifiers});await wait(70)}
  await load()
  await until('!!document.querySelector("[data-latest-release] [data-release-loading]")')
  await evaluate('window.__fakeLatest=[];new MutationObserver(()=>window.__fakeLatest.push(document.querySelector("[data-latest-release]")?.textContent)).observe(document.querySelector("[data-latest-release]"),{childList:true,subtree:true,characterData:true});true')
  assert.equal(await evaluate('!!document.querySelector("[data-latest-release] [data-release-version]")'),false)
  await capture('history-loading.png')
  await click('#open-release-notes');await until('!!document.querySelector("[data-release-dialog] [data-release-loading]")')
  assert.equal(await evaluate('!!document.querySelector("[data-release-dialog] [data-release-version]")'),false)
  await capture('modal-loading.png')
  mode='success';for(const item of pending.values())item.resolve(response(item.request));pending.clear()
  await until('document.querySelector("[data-release-dialog] [data-release-version]")?.textContent==="v1.3.2"')
  assert.equal(requests.filter(url=>url.endsWith('/latest')).length,1,'Modal and history share the same actual GitHub latest request')
  assert.equal(await evaluate('window.__fakeLatest.some(text=>/v2\\.0/.test(text))'),false,'The latest card must never flash the installed 2.0 version')
  assert.equal(await evaluate('document.querySelectorAll("[data-release-dialog] .release-note-section").length'),3)
  assert.equal(await evaluate('document.querySelector("[data-release-dialog] code").textContent'),'60 FPS')
  assert.match(await evaluate('document.querySelector("[data-release-dialog]").textContent'),/A deliberately long feature title/)
  await capture('modal-de.png')
  await key('Tab',8);assert.equal(await evaluate('document.activeElement.classList.contains("release-button-primary")'),true)
  await key('Tab');assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Schließen')
  await click('[data-release-dialog] .release-modal-footer>div .release-text-button')
  assert.equal(links.at(-1),release.html_url)
  for(const width of [800,540,400]){
    window.setSize(width,930);await wait(180)
    assert.ok(await evaluate('(()=>{const dialog=document.querySelector("[data-release-dialog]"),r=dialog.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&dialog.scrollWidth<=dialog.clientWidth+1})()'))
    await capture('modal-'+width+'.png')
  }
  await evaluate(`window.__releaseExitFrames=[];requestAnimationFrame(function sample(){const node=document.querySelector('[data-release-backdrop]');if(!node){window.__releaseExitFrames.push(null);return}const style=getComputedStyle(node),panel=getComputedStyle(node.querySelector('[data-release-dialog]'));window.__releaseExitFrames.push({opacity:Number(style.opacity),blur:Number(/blur\\(([\\d.]+)px\\)/.exec(style.backdropFilter)?.[1]||0),panelOpacity:Number(panel.opacity)});requestAnimationFrame(sample)});true`)
  await key('Escape');await until('!document.querySelector("[data-release-dialog]")')
  await until('window.__releaseExitFrames.at(-1)===null')
  const exitFrames=(await evaluate('window.__releaseExitFrames')).filter(Boolean)
  fs.writeFileSync(path.join(output,'exit-frames.json'),JSON.stringify(exitFrames,null,2))
  assert.ok(exitFrames.length>=2,'The real exit transition must be sampled across frames')
  assert.ok(exitFrames.every(frame=>frame.opacity===1),'The blur layer must never fade as a composited opacity group')
  assert.ok(exitFrames.some(frame=>frame.blur<exitFrames[0].blur-.1),'Blur must begin receding before the layer is removed')
  for(let i=1;i<exitFrames.length;i++){
    assert.ok(exitFrames[i].blur<=exitFrames[i-1].blur+.01,'Blur must not flash back during exit')
    assert.ok(exitFrames[i].panelOpacity<=exitFrames[i-1].panelOpacity+.01,'The panel must not reappear during exit')
  }
  assert.equal(await evaluate('document.activeElement.id'),'open-release-notes')
  assert.equal(await evaluate(`localStorage.getItem("eclipse_changelog_seen_${require('../package.json').version}")`),'true')
  window.setSize(1150,930)
  await click('.release-history-item-heading');await wait(350);await capture('history-de.png')
  await evaluate('window.__releaseFixture.language("en");window.__releaseFixture.open();true')
  await until('document.querySelector("#launcher-release-title")?.textContent==="Release notes"');await capture('modal-en.png')
  await key('Escape');await until('!document.querySelector("[data-release-dialog]")')
  mode='error';await load();await until('!!document.querySelector("[data-latest-release] .release-unavailable")')
  assert.equal(await evaluate('!!document.querySelector("[data-latest-release] [data-release-version]")'),false)
  await click('#open-release-notes');await until('!!document.querySelector("[data-release-dialog] .release-unavailable")');await capture('modal-error.png')
  mode='success';await click('[data-release-dialog] .release-unavailable button');await until('document.querySelector("[data-release-dialog] [data-release-version]")?.textContent==="v1.3.2"')
  await key('Escape');mode='empty';await load();await until('!!document.querySelector("[data-latest-release] .release-empty")')
  assert.equal(await evaluate('document.querySelectorAll("[data-release-version]").length'),0)
  mode='hold';await load(true);await until('!!document.querySelector("[data-release-dialog] [data-release-loading]")')
  const previous=cancelled.length;await key('Escape');await until('!document.querySelector("[data-release-dialog]")')
  for(let attempt=0;attempt<30&&cancelled.length===previous;attempt++)await wait(25)
  assert.ok(cancelled.length>previous,'Closing the last release observer aborts its pending request')
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({githubOnly:true,noLocalVersionFlash:true,sharedRequest:true,originalSections:true,codeFormatting:true,untruncatedTitles:true,keyboardTrap:true,escapeAndFocusRestore:true,stableBackdropExit:true,exitFrames,externalLink:true,responsive:true,localized:true,errorRetry:true,emptyState:true,requestCancelled:true,rendererErrors:errors},null,2))
  window.destroy();app.exit(0)
}).catch(async error=>{console.error(error);try{if(window&&!window.isDestroyed()){fs.writeFileSync(path.join(output,'failure.png'),(await window.webContents.capturePage()).toPNG());console.error(await window.webContents.executeJavaScript('document.body.innerText'))}}catch{}finally{app.exit(1)}})
setTimeout(()=>{console.error('Release notes fixture timeout');app.exit(1)},90000).unref()
