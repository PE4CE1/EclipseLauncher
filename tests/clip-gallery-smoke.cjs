const {app,BrowserWindow,session,ipcMain}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
const root=path.resolve(__dirname,'..'),output=path.join(root,'.cache/clip-gallery'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
const games=['Gameplay','Roblox','Rocket League'],titles=['Gameplay Highlight','Letzte Runde · Overtime','Ein guter Run','Ranked mit Freunden','30 Sekunden Chaos','Abendrunde']
const now=Date.now(),clips=Array.from({length:151},(_,i)=>({id:'gallery-'+i,title:titles[i%titles.length],gameTitle:games[i%3],duration:8+(i*7)%63,thumbnailUrl:i===150?'file:///missing-clip-thumbnail.png':pathToFileURL(path.join(root,'src/assets/roblox/screen'+(i%4+1)+'.png')).href,videoUrl:'',filePath:path.join(process.env.ECLIPSE_SMOKE_TEMP,'fixture-'+i+'.mp4'),fileSize:3_700_000+i*170_000,createdAt:i<9?now-i*60_000:now-(Math.floor((i-9)/12)+1)*86400000-i*1000,width:1280,height:720,averageFps:29.8,tags:['fixture',i===3?'tag-needle':'highlight']}))
const errors=[],calls=[];let window,finishCopy
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true})
  ipcMain.on('account:get-identity-sync',event=>{event.returnValue=null})
  ipcMain.handle('microphone:list',()=>({supported:false,inputs:[]}))
  ipcMain.handle('settings:set',(_event,payload)=>{calls.push({name:'launcher-settings',payload});return{success:true}});ipcMain.handle('sources:get-all-cached',()=>[])
  ipcMain.handle('clips:save-settings',(_event,payload)=>{calls.push({name:'save-settings',payload});return payload})
  ipcMain.handle('clips:autoclip-status',()=>({activeGame:'cs2',games:{cs2:{state:'connected'},dota2:{state:'listening',detail:'restart'},lol:{state:'waiting'},'rocket-league':{state:'connected',detail:'select-player'},overwatch:{state:'manual',detail:'no-api'}},rocketLeaguePlayers:[{id:'Steam|76561198000000001|0',name:'Eclipse Fixture'}]}))
  ipcMain.handle('clips:autoclip-setup',(_event,id)=>{calls.push({name:'auto-setup',id});return{success:true,changed:true}})
  ipcMain.handle('clips:audio-processes',()=>({supported:true,processes:[]}))
  ipcMain.handle('clips:get-sources',()=>{calls.push({name:'get-sources'});return[...[1,2].map(index=>({id:'screen:'+index+':0',name:'Bildschirm '+index,thumbnail:pathToFileURL(path.join(root,'src/assets/roblox/screen'+index+'.png')).href})),{id:'window:6543:0',name:'Window capture fixture'}]})
  ipcMain.handle('overlay:show-clip-toast',(_event,payload)=>{calls.push({name:'toast',payload});return true})
  ipcMain.handle('clips:pick-folder',()=>path.join(process.env.ECLIPSE_SMOKE_TEMP,'chosen-clips'))
  ipcMain.handle('clips:list',()=>clips)
  ipcMain.handle('clips:update-meta',async(_event,payload)=>{
    calls.push({name:'rename',payload});await wait(180)
    if(payload.title==='Save failure')return{success:false,error:'Could not save name'}
    const clip=clips.find(clip=>clip.id===payload.clipId);if(!clip)return{success:false,error:'Clip not found'}
    clip.title=payload.title;return{success:true,meta:clip}
  })
  for(const name of ['copy-file','export','open-folder','delete'])ipcMain.handle('clips:'+name,(_event,payload)=>{calls.push({name,payload});return{success:true}})
  ipcMain.handle('clips:analyze',()=>({success:false,error:'Fixture has no recording'}))
  ipcMain.handle('clips:share-config',()=>({configured:false}))
  ipcMain.handle('clips:share-links',()=>[])
  ipcMain.handle('clips:save-draft',(_event,payload)=>{
    calls.push({name:'save-draft',payload})
    const clip=clips.find(clip=>clip.id===payload.clipId)
    if(clip)clip.editDraft=payload.draft
    return{success:true,draft:payload.draft,title:payload.draft?.state.title||clip?.title}
  })
  ipcMain.handle('clips:copy-edited',async(_event,payload)=>{calls.push({name:'copy-discord',payload});if(process.env.ECLIPSE_CLIP_COPY_LIFECYCLE==='1')return new Promise(resolve=>{finishCopy=resolve});await wait(process.env.ECLIPSE_CLIP_COPY_UI==='1'?1200:350);return{success:true,bytes:19_100_000}})
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)}))
  window=new BrowserWindow({show:false,frame:false,width:1120,height:840,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}})
  window.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|Failed to load resource|404/.test(event.message))errors.push(event.message)})
  window.webContents.on('render-process-gone',(_event,details)=>errors.push(details.reason))
  await window.loadFile(path.join(root,'.cache/clip-studio/fixture/tests/clip-studio-fixture.html'),{query:{gallery:'1'}})
  const evaluate=code=>window.webContents.executeJavaScript(code,true)
  const until=async(code,timeout=12000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await evaluate(code))return;await wait(40)}throw Error('Gallery timeout: '+code)}
  const capture=async name=>{for(let i=0;i<3;i++){window.webContents.invalidate();await window.webContents.capturePage();await wait(60)}fs.writeFileSync(path.join(output,name),(await window.webContents.capturePage()).toPNG())}
  window.webContents.debugger.attach('1.3')
  const pointer=async(selector,type='mouseMoved')=>{const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})})}
  const click=async selector=>{await pointer(selector);await pointer(selector,'mousePressed');await pointer(selector,'mouseReleased');await wait(80)}
  const change=async(selector,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  const key=async value=>{for(const type of ['keyDown','keyUp'])await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type,key:value,code:value});await wait(60)}
  await until('!!window.__clipFixture&&document.querySelectorAll("[data-clip-card]").length===151')
  await until('document.querySelectorAll(".clip-library-thumbnail img").length>0')
  if(process.env.ECLIPSE_DROPDOWN_EDITOR_UI==='1'){
    await evaluate('window.__clipFixture.open("gallery-0");true')
    await until('!!document.querySelector("[data-clip-editor] .clip-transport [role=combobox]")')
    await click('.clip-transport [role=combobox]')
    await until('document.querySelectorAll("[data-app-select-menu] [role=option]").length===6')
    await key('Escape');await until('!document.querySelector("[data-app-select-menu]")')
    assert.equal(await evaluate('!!document.querySelector("[data-clip-editor]")'),true,'Escape closes only the dropdown')
    await click('.clip-transport [role=combobox]')
    await until(`!!document.querySelector('[data-select-value="1.5"]')`)
    await click('[data-select-value="1.5"]')
    await until('document.querySelector(".clip-transport [role=combobox]").textContent.includes("1.5")')
    await click('[data-clip-open-editor]')
    await until('!!document.querySelector("select[data-clip-output]")')
    await evaluate('document.querySelector("select[data-clip-output]+[role=combobox]").scrollIntoView({block:"center"});true')
    await wait(80)
    await click('select[data-clip-output]+[role=combobox]')
    await until('!!document.querySelector("[data-select-value=portrait]")')
    await click('[data-select-value=portrait]')
    await until('!!document.querySelector("[data-clip-crop]")')
    await capture('editor-dropdowns.png')
    await key('Escape');await until('!document.querySelector("[data-clip-editor]")')
    assert.deepEqual(errors,[])
    console.log('PASS editor dropdowns: speed, aspect ratio, modal focus and Escape without recording')
    app.exit(0);return
  }
  const initialThumbnails=await evaluate('document.querySelectorAll(".clip-library-thumbnail img").length')
  assert.ok(initialThumbnails<60, 'Only nearby thumbnails should be mounted, not the complete 151-clip library')
  await evaluate('document.querySelector("[data-clip-library]").scrollTop=5000;true')
  await until('!document.querySelector(\'[data-clip-card="gallery-0"] img\')')
  await evaluate('document.querySelector("[data-clip-library]").scrollTop=0;true')
  await until('!!document.querySelector(\'[data-clip-card="gallery-0"] img\')')
  if(process.env.ECLIPSE_CLIP_COPY_LIFECYCLE==='1'){
    const result=await require('./clip-copy-lifecycle-smoke.cjs')({evaluate,until,click,calls,finish:result=>finishCopy(result)})
    assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(output,'copy-lifecycle-verification.json'),JSON.stringify({...result,rendererErrors:errors},null,2))
    console.log(JSON.stringify(result));window.destroy();app.exit(0);return
  }
  if(process.env.ECLIPSE_CLIP_BACKDROP==='1'){
    const result=await require('./clip-backdrop-smoke.cjs')({window,evaluate,until,click,change,calls})
    assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(output,'backdrop-verification.json'),JSON.stringify({...result,rendererErrors:errors},null,2))
    console.log(JSON.stringify(result));window.destroy();app.exit(0);return
  }
  if(process.env.ECLIPSE_MIC_SETTINGS==='1'){
    const microphone=await require('./clip-microphone-smoke.cjs')({window,evaluate,capture,click,change,key,until,calls})
    assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(output,'microphone-verification.json'),JSON.stringify({microphone,rendererErrors:errors},null,2))
    window.destroy();app.exit(0);return
  }
  if(process.env.ECLIPSE_CLIP_RENAME_ONLY==='1'){
    const rename=await require('./clip-rename-smoke.cjs')({evaluate,until,click,change,key,capture,calls})
    assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(output,'rename-verification.json'),JSON.stringify({rename,rendererErrors:errors},null,2))
    window.destroy();app.exit(0);return
  }
  await evaluate('window.__clipFixture.replay(true);true');await wait(850)
  assert.equal(await evaluate('document.querySelector(".clip-library-section h2").textContent'),'Heute')
  await until('[...document.querySelectorAll(".clip-library-art img")].slice(0,6).every(image=>image.complete&&image.naturalWidth>0)')
  await capture('gallery-de.png')
  const titleRect=await evaluate('JSON.stringify(document.querySelector(".clip-library-title").getBoundingClientRect().toJSON())')
  await pointer('.clip-library-preview');await wait(200)
  assert.equal(await evaluate('JSON.stringify(document.querySelector(".clip-library-title").getBoundingClientRect().toJSON())'),titleRect,'Hover must not move text or card geometry')
  assert.equal(await evaluate('[...document.querySelectorAll(".clip-library-card")].some(card=>card.getAnimations({subtree:true}).length>0)'),false,'Cards must not retain layout animation loops')
  await click('[data-clip-quick-discord="gallery-0"]')
  assert.equal(await evaluate('document.querySelector("[data-clip-quick-discord=gallery-1]").disabled'),true)
  if(process.env.ECLIPSE_CLIP_COPY_UI==='1'){
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0})
    await wait(180)
    assert.equal(await evaluate('document.querySelector("[data-clip-quick-discord=gallery-0]").dataset.copying'),'true')
    assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-clip-quick-discord=gallery-0]")).opacity'),'1')
    assert.ok(await evaluate('[...document.querySelectorAll("[data-clip-quick-discord]:not([data-copying])")].every(button=>getComputedStyle(button).opacity==="0")'),'Disabling other copy buttons must not reveal them')
    await evaluate('document.querySelector("[data-clip-quick-discord=gallery-1]").click();true')
    assert.equal(calls.filter(call=>call.name==='copy-discord').length,1,'Disabled buttons must not start another export')
  }
  await until('!!document.querySelector("[data-clip-quick-discord=gallery-0][data-copied]")')
  assert.equal(calls.filter(call=>call.name==='copy-discord').length,1)
  assert.deepEqual(calls.find(call=>call.name==='copy-discord').payload,{filePath:clips[0].filePath,suggestedName:clips[0].title})
  assert.equal(await evaluate('!!document.querySelector("[data-clip-editor]")'),false,'Discord copying must not require opening the editor')
  assert.match(await evaluate('document.querySelector("[data-clip-copy-feedback=gallery-0]").textContent'),/19\.1 MB.*Strg\+V/)
  await capture('gallery-discord-copy.png')
  if(process.env.ECLIPSE_CLIP_COPY_UI==='1'){
    assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-clip-quick-discord=gallery-0]")).opacity'),'1')
    assert.ok(await evaluate('[...document.querySelectorAll("[data-clip-quick-discord]:not([data-copied])")].every(button=>getComputedStyle(button).opacity==="0")'))
    assert.deepEqual(errors,[])
    const result={onlyActiveCopyVisible:true,otherButtonsRemainHidden:true,concurrentCopiesBlocked:true,copyFeedbackPreserved:true,rendererErrors:errors}
    fs.writeFileSync(path.join(output,'copy-visibility-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));window.destroy();app.exit(0);return
  }
  await click('[data-clip-actions="gallery-0"]');await until('!!document.querySelector("[role=menu]")');await capture('gallery-menu.png')
  const firstFocus=await evaluate('document.activeElement.textContent');await key('ArrowDown');assert.notEqual(await evaluate('document.activeElement.textContent'),firstFocus)
  await key('Escape');await until('!document.querySelector("[role=menu]")');assert.equal(await evaluate('document.activeElement.dataset.clipActions'),'gallery-0')
  await click('[data-clip-actions="gallery-0"]');await click('[role=menu] button');assert.equal(calls.at(-1).name,'copy-file')
  await click('[data-clip-actions="gallery-0"]');await click('[role=menu] button:nth-of-type(2)');assert.equal(calls.at(-1).name,'export')
  await click('[data-clip-actions="gallery-0"]');await click('[role=menu] button:nth-of-type(4)');assert.equal(calls.at(-1).name,'open-folder')
  await change('[data-clip-game-filter]','Rocket League');await until('document.querySelectorAll("[data-clip-card]").length===50')
  assert.ok(await evaluate('[...document.querySelectorAll(".clip-library-game")].every(node=>node.textContent==="Rocket League")'))
  await change('[data-clip-game-filter]','all');await change('.clip-library-search input','tag-needle');await until('document.querySelectorAll("[data-clip-card]").length===1');assert.equal(await evaluate('document.querySelector("[data-clip-card]").dataset.clipCard'),'gallery-3')
  await change('.clip-library-search input','not-a-clip');await until('!!document.querySelector("[data-clip-empty]")');assert.match(await evaluate('document.querySelector("[data-clip-empty] h2").textContent'),/passenden/)
  await click('[data-clip-empty] button');await until('document.querySelectorAll("[data-clip-card]").length===151')
  for(const [sort,expected]of [['duration',[...clips].sort((a,b)=>b.duration-a.duration)[0].id],['size','gallery-150']]){await change('[data-clip-sort]',sort);await until(`document.querySelector('[data-clip-card]').dataset.clipCard===${JSON.stringify(expected)}`)}
  await change('[data-clip-sort]','newest')
  const toolbar=await require('./clip-settings-smoke.cjs').toolbar({window,evaluate,capture,click,until})
  const sizes=[]
  for(const width of [1560,1120,800,540,400]){
    window.setSize(width,840);await wait(180)
    const metrics=await evaluate('(()=>{const root=document.querySelector("[data-clip-library]"),grid=document.querySelector(".clip-library-grid");return{width:root.clientWidth,scrollWidth:root.scrollWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(" ").length}})()')
    assert.ok(metrics.scrollWidth<=metrics.width+1,JSON.stringify(metrics));sizes.push({width,...metrics})
    await click('[data-clip-actions="gallery-0"]')
    assert.ok(await evaluate('(()=>{const r=document.querySelector("[role=menu]").getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight})()'))
    await key('Escape')
    if(width===800||width===540||width===400)await capture('gallery-'+width+'.png')
  }
  window.setSize(1120,840);await wait(100)
  const settings=await require('./clip-settings-smoke.cjs')({window,evaluate,capture,click,change,key,until,calls})
  if(process.env.ECLIPSE_CLIP_SETTINGS_ONLY==='1'){assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'settings-verification.json'),JSON.stringify({settings,rendererErrors:errors},null,2));console.log(JSON.stringify({settings,rendererErrors:errors}));window.destroy();app.exit(0);return}
  const toast=await require('./clip-toast-smoke.cjs')({window,evaluate,capture,until})
  const rename=await require('./clip-rename-smoke.cjs')({evaluate,until,click,change,key,capture,calls})
  await evaluate('window.__clipFixture.language("en");true');await until('document.querySelector(".clip-library-section h2").textContent==="Today"');await capture('gallery-en.png')
  await evaluate('window.__clipFixture.seed([]);true');await until('!!document.querySelector("[data-clip-empty]")');assert.match(await evaluate('document.querySelector("[data-clip-empty] h2").textContent'),/No clips yet/)
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({clips:151,sizes,toolbar,settings,toast,rename,quickDiscordCopy:true,hoverStable:true,keyboardMenu:true,copy:true,export:true,folder:true,searchTags:true,filter:true,sort:true,emptyState:true,localized:true,rendererErrors:errors},null,2))
  window.destroy();app.exit(0)
}).catch(async error=>{console.error(error);if(window&&!window.isDestroyed()){fs.writeFileSync(path.join(output,'failure.png'),(await window.webContents.capturePage()).toPNG());console.error(await window.webContents.executeJavaScript('document.body.innerText'))}app.exit(1)})
setTimeout(()=>{console.error('Gallery test timeout');app.exit(1)},90000).unref()
