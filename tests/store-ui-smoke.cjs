const { app, BrowserWindow, session, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.join(root, '.cache/store-polish')
const temporary = process.env.ECLIPSE_SMOKE_TEMP
app.setPath('userData', temporary)
app.setPath('sessionData', temporary)
app.commandLine.appendSwitch('disable-gpu')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const live = process.env.ECLIPSE_STORE_LIVE === '1'
const covers = process.env.ECLIPSE_COVER_LOADING === '1'
const heroIds = [1091500,1245620,5335510]
const imageRequests = []
const metadataRequests = []
const errors = []
let server

async function waitFor(contents, expression, timeout = 16000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { if (await contents.executeJavaScript(expression)) return; await wait(40) }
  throw new Error('Store UI timeout: ' + expression)
}

app.whenReady().then(async () => {
  ipcMain.on('account:get-identity-sync', event => { event.returnValue = null })
  ipcMain.handle('settings:set', () => ({ success: true }))
  ipcMain.handle('sources:get-all-cached', () => [])
  server = http.createServer((req,res) => {
    const parsed = new URL(req.url, 'http://127.0.0.1')
    const source = parsed.searchParams.get('url') || ''
    const id = Number(/\/apps\/(\d+)\//.exec(source)?.[1])
    imageRequests.push(source)
    res.setHeader('Access-Control-Allow-Origin','*')
    res.setHeader('Cache-Control','public, max-age=86400')
    if (source.includes('library_600x900') && id === 5335510) { res.statusCode=404;res.end();return }
    const colors={1091500:'#657248',1245620:'#917449',5335510:'#4f7d8b'}
    const poster=/library_capsule|library_600x900/.test(source)
    const logo=source.includes('logo.png')
    const width=logo?400:poster?600:1920,height=logo?100:poster?900:620
    const delay=covers&&poster?2500:/library_hero/.test(source)&&id===1245620?1200:logo&&id===934999?900:20
    setTimeout(()=>{if(res.destroyed)return;res.setHeader('Content-Type','image/svg+xml');res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="a"><stop stop-color="${colors[id]||'#38434b'}"/><stop offset="1" stop-color="#17252e"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#a)"/><circle cx="${width*.72}" cy="${height*.38}" r="${height*.24}" fill="none" stroke="#cbb589" opacity=".4"/><text x="${width*.5}" y="${height*.72}" text-anchor="middle" fill="#eee5d7" font-family="Arial" font-size="${logo?40:poster?40:56}">${id}</text></svg>`)},delay)
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const port=server.address().port
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
    if(!/^https?:/.test(details.url)||details.url.startsWith(`http://127.0.0.1:${port}`)){callback({});return}
    if(live && /^https:\/\/(?:shared\.(?:akamai|fastly)\.steamstatic\.com|fonts\.(?:googleapis|gstatic)\.com)\//.test(details.url)){callback({});return}
    if(/steamstatic\.com/.test(details.url)){callback({redirectURL:`http://127.0.0.1:${port}/image?url=${encodeURIComponent(details.url)}`});return}
    callback({cancel:true})
  })
  ipcMain.handle('network:request',async (_event,payload)=>{
    if(live){const response=await fetch(payload.url,{signal:AbortSignal.timeout(10000)});return{status:response.status,body:await response.text(),headers:[...response.headers],url:payload.url}}
    const input=JSON.parse(new URL(payload.url).searchParams.get('input_json')||'{}')
    metadataRequests.push(input.ids?.map(item=>item.appid)||[])
    const body={response:{store_items:(input.ids||[]).map(({appid})=>({appid,assets:{asset_url_format:`steam/apps/${appid}/\${FILENAME}?t=1`,library_capsule:`hash-${appid}/library_capsule.jpg`,hero_capsule:`hash-${appid}/hero_capsule.jpg`,library_hero:`hash-${appid}/library_hero.jpg`,header:`hash-${appid}/header.jpg`}}))}}
    return{status:200,body:JSON.stringify(body),headers:[['content-type','application/json']],url:payload.url}
  })
  ipcMain.handle('artwork:prefetch',async(_event,{url})=>{
    const response=await require('electron').net.fetch(live?url:`http://127.0.0.1:${port}/image?url=${encodeURIComponent(url)}`,{credentials:'omit'})
    await response.arrayBuffer()
    return response.ok&&/^image\//.test(response.headers.get('content-type')||'')
  })
  const window=new BrowserWindow({show:false,frame:false,width:1180,height:990,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}})
  window.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|Failed to load resource|404/.test(event.message))errors.push(event.message)})
  window.webContents.on('render-process-gone',(_event,details)=>errors.push(details.reason))
  await window.loadFile(path.join(output,'fixture/tests/store-fixture.html'),covers?{hash:'cover-loading'}:undefined)
  const evaluate=code=>window.webContents.executeJavaScript(code)
  const capture=async name=>{for(let i=0;i<4;i++){window.webContents.invalidate();await window.webContents.capturePage();await wait(80)}fs.writeFileSync(path.join(output,name),(await window.webContents.capturePage()).toPNG())}
  await waitFor(window.webContents,`!!document.querySelector('.hero-visual[data-image-id="1091500"] img')`)
  if(covers){
    await evaluate(`document.getElementById('store-fixture-deals').scrollIntoView();true`)
    await waitFor(window.webContents,`document.querySelectorAll('.cover-loading[data-cover-visible]').length>0&&document.querySelectorAll('.cover-loading:not([data-cover-visible])').length>0`)
    const states=await evaluate(`Array.from(document.querySelectorAll('.cover-loading')).map(node=>({visible:node.hasAttribute('data-cover-visible'),animation:getComputedStyle(node,'::after').animationName,filter:getComputedStyle(node,'::after').filter,delay:parseFloat(getComputedStyle(node,'::after').animationDelay),duration:parseFloat(getComputedStyle(node,'::after').animationDuration)}))`)
    assert.ok(states.some(state=>state.visible&&state.animation==='cover-loading-sweep'))
    assert.ok(states.filter(state=>!state.visible).every(state=>state.animation==='none'))
    assert.ok(states.every(state=>state.filter==='none'))
    assert.ok(states.filter(state=>state.visible).every(state=>state.delay<0&&state.duration<=1.6),'The sweep must start in view immediately without a dead lead-in')
    await capture('cover-loading.png')
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.cover-loading')).every(node=>getComputedStyle(node,'::after').animationName==='none')`),true)
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]})
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));true`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.cover-loading')).every(node=>getComputedStyle(node,'::after').animationName==='none')`),true)
    await evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));true`)
    await waitFor(window.webContents,`Array.from(document.querySelectorAll('.poster-art')).slice(0,5).every(node=>!node.querySelector('.cover-loading')&&node.querySelector('img')?.naturalWidth>0)`)
    await evaluate(`window.__storeFixture.setLoading(true);true`)
    await waitFor(window.webContents,`!document.querySelector('.poster-art')&&!!document.querySelector('.cover-loading')`)
    await evaluate(`window.__storeFixture.setLoading(false);true`)
    await waitFor(window.webContents,`!!document.querySelector('.poster-art')`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.poster-art')).slice(0,5).every(node=>!node.querySelector('.cover-loading'))`),true,'Cached remounts must not flash a loading placeholder')
    await capture('cover-loading-complete.png')
    assert.deepEqual(errors,[])
    console.log(JSON.stringify({visibleOnly:true,reducedMotion:true,hiddenPaused:true,cachedNoFlash:true,transformOnly:true,errors}))
    window.destroy();server.closeAllConnections();server.close();app.exit(0);return
  }
  await waitFor(window.webContents,`document.querySelector('#game-card-5335510 .poster-art img')?.complete && document.querySelector('#game-card-5335510 .poster-art img')?.naturalWidth>0`)
  await wait(250)
  await capture(live?'store-live.png':'store-fixture.png')
  const portrait=await evaluate(`({url:document.querySelector('#game-card-5335510 .poster-art img').src,fit:getComputedStyle(document.querySelector('#game-card-5335510 .poster-art img')).objectFit,opacity:getComputedStyle(document.querySelector('#game-card-5335510 .poster-art img')).opacity,type:document.querySelector('#game-card-5335510 .poster-art').dataset.artwork})`)
  assert.equal(portrait.type,'poster')
  assert.equal(portrait.fit,'cover')
  assert.match(portrait.url,/library_capsule/)
  assert.equal(portrait.opacity,'1')
  if(live){
    const rect=await evaluate(`(()=>{const r=document.getElementById('store-fixture-deals').getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:600,height:Math.ceil(r.height)}})()`)
    fs.writeFileSync(path.join(output,'store-covers-live.png'),(await window.webContents.capturePage(rect)).toPNG())
  }
  if(!live){
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('DOM.enable')
    await window.webContents.debugger.sendCommand('CSS.enable')
    const document=await window.webContents.debugger.sendCommand('DOM.getDocument')
    const card=await window.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:document.root.nodeId,selector:'#game-card-1091500'})
    await window.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:card.nodeId,forcedPseudoClasses:['hover']})
    await wait(220)
    assert.equal(await evaluate(`(()=>{const card=document.getElementById('game-card-1091500');return card.querySelector('.store-card-art').getBoundingClientRect().top>=card.getBoundingClientRect().top-.1})()`),true,'Hover must not move the art outside its paint-contained card')
    await capture('store-hover-fixed.png')
    await window.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:card.nodeId,forcedPseudoClasses:[]})
    await evaluate(`window.__storeFixture.openDetails();true`)
    await waitFor(window.webContents,`!!document.querySelector('.game-detail-modal-overlay')`)
    await wait(180)
    const close=await evaluate(`(()=>{const page=document.querySelector('.game-detail-modal-overlay > div');page.scrollTop=400;const before=page.scrollTop;const hero=document.querySelector('.hero-visual');window.__storeFixture.closeDetails();return{before,after:page.scrollTop,samePage:page===document.querySelector('.game-detail-modal-overlay > div'),sameHero:hero===document.querySelector('.hero-visual')}})()`)
    assert.ok(close.before>100)
    assert.equal(close.samePage,false,'Back must remove the game page immediately, including a scrolled preview')
    assert.equal(close.sameHero,true)
    await evaluate(`window.__storeFixture.lateDetail();true`)
    assert.equal(await evaluate(`document.querySelector('.game-detail-modal-overlay')?.textContent.includes('LATE_RESPONSE')??false`),false,'Late query results must not replace the exiting page')
    await waitFor(window.webContents,`!document.querySelector('.game-detail-modal-overlay')`)
    await require('./store-motion-checks.cjs')(window,output)
    // Inject focus without initiating the prefetch before the manual request.
    await evaluate(`window.__outgoingHero=document.querySelector('.hero-visual > img');Object.defineProperty(document,'hidden',{configurable:true,value:false});document.getElementById('hero-next').click();Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'));true`)
    await wait(300)
    assert.equal(await evaluate(`document.querySelector('.store-hero').dataset.heroId`),'1091500','Slow incoming art must not replace the displayed slide prematurely')
    assert.equal(await evaluate(`document.querySelector('.hero-visual img').complete`),true)
    await waitFor(window.webContents,`document.querySelector('.store-hero').dataset.heroId==='1245620'`)
    const fade=await evaluate(`({layers:document.querySelectorAll('.hero-visual').length,oldOpacity:getComputedStyle(document.querySelector('.hero-visual')).opacity,loaded:[...document.querySelectorAll('.hero-visual > img')].every(img=>img.complete&&img.naturalWidth>0)})`)
    assert.equal(fade.layers,2)
    assert.equal(fade.oldOpacity,'1')
    assert.equal(fade.loaded,true)
    assert.equal(await evaluate(`window.__outgoingHero===document.querySelector('.hero-visual > img')`),true,'Keep the actual outgoing image mounted throughout the fade')
    await wait(750)
    assert.equal(await evaluate(`document.querySelectorAll('.hero-visual').length`),1)
    await evaluate(`window.__storeFixture.reverse();true`)
    await wait(150)
    assert.equal(await evaluate(`document.querySelector('.store-hero').dataset.heroId`),'1245620','A reordered feed must retain the selected game')
    await evaluate(`document.getElementById('hero-next').click();document.getElementById('hero-next').click();true`)
    await waitFor(window.webContents,`document.querySelector('.store-hero').dataset.heroId==='5335510'`)
    await wait(750)
    assert.equal(await evaluate(`document.querySelectorAll('.hero-visual').length`),1)
    await evaluate(`window.__firstCard=document.querySelector('#game-card-1091500');window.__storeFixture.modal(true);true`)
    await wait(100)
    assert.equal(await evaluate(`window.__firstCard===document.querySelector('#game-card-1091500')`),true,'Opening details must not remount every store card')
    await evaluate(`window.__storeFixture.modal(false);true`)
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
    await wait(100)
    await evaluate(`document.getElementById('hero-next').click();true`)
    await waitFor(window.webContents,`document.querySelector('.store-hero').dataset.heroId==='1245620'`)
    assert.equal(await evaluate(`document.querySelectorAll('.hero-visual').length`),1)
    await capture('store-transition-complete.png')
  }
  assert.deepEqual(errors,[])
  if(!live){
    await evaluate(`window.__storeFixture.installationScenario();true`)
    await wait(80)
    assert.equal(await evaluate(`!!document.querySelector('#game-card-1091500 [data-installed]')`),false,'Owned but uninstalled games must not receive an Installed badge')
    assert.equal(await evaluate(`!!document.querySelector('#game-card-1245620 [data-installed]')`),false,'An installed demo must not mark its main game as installed')
    assert.equal(await evaluate(`!!document.querySelector('#game-card-5335510 [data-installed]')`),true,'Verified installed titles must retain the badge')
    fs.writeFileSync(path.join(output,'installation-verification.json'),JSON.stringify({ownedUninstalled:false,similarDemo:false,verifiedInstalled:true},null,2))
  }
    const report={mode:live?'official Steam artwork':'isolated delayed network fixture',portrait,metadataRequests,hoverTopNotClipped:!live,detailRemovedImmediatelyOnBack:!live,heroKeepsOutgoingImage:!live,rapidNavigation:!live,feedReorderStable:!live,cardsRemainMounted:!live,reducedMotion:!live,errors}
  fs.writeFileSync(path.join(output,live?'live-verification.json':'verification.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
  window.destroy();server.closeAllConnections();server.close();app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})
setTimeout(()=>{console.error('Store verification timed out');app.exit(1)},60000).unref()
