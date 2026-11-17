const {app,BrowserWindow,session,ipcMain,net}=require('electron')
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const fixture=require('./keyforsteam-fixture.cjs'),root=path.join(__dirname,'..'),output=path.join(root,'.cache/key-deals-refresh')
const wait=ms=>new Promise(r=>setTimeout(r,ms)),requests=[],errors=[],opened=[],copied=[]
let version=0,fail=false
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
app.whenReady().then(async()=>{
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#302b25"/><path d="M0 600L800 20L1280 720" fill="#5b4b35"/><text x="620" y="500" fill="#ac9474" font-family="Arial" font-size="32">ECLIPSE · PRICE PREVIEW</text></svg>')})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port
  session.defaultSession.webRequest.onBeforeRequest((d,done)=>{if(d.url.startsWith('https:'))done({redirectURL:`http://127.0.0.1:${port}/image`});else done({})})
  ipcMain.on('account:get-identity-sync',event=>{event.returnValue=null})
  ipcMain.handle('settings:set',()=>({success:true}));ipcMain.handle('sources:get-all-cached',()=>[])
  ipcMain.handle('system:open-url',(_e,url)=>{opened.push(url);return true})
  ipcMain.handle('clipboard:write-text',(_e,text)=>{copied.push(text);return{success:true}})
  ipcMain.handle('artwork:prefetch',async(_e,{url})=>{const r=await net.fetch(url);await r.arrayBuffer();return r.ok})
  ipcMain.handle('network:cancel',()=>true)
  ipcMain.handle('network:request',async(_e,payload)=>{
    requests.push(payload.url);const u=new URL(payload.url);let body={}
    if(u.pathname.includes('/api/appdetails'))body={'1091500':{success:true,data:{steam_appid:1091500,name:'Cyberpunk 2077',is_free:false,price_overview:{currency:u.searchParams.get('cc')==='US'?'USD':'EUR',final:4000}}}}
    if(u.pathname.includes('admin-ajax'))body=fixture.search
    if(u.pathname.includes('cyberpunk-2077-')){
      const current=version
      if(current)await wait(550)
      if(fail)return{status:503,body:'Unavailable',headers:[],url:payload.url}
      const data={...fixture.data,prices:fixture.data.prices.map(offer=>({...offer,priceCard:offer.id===101?(u.hostname==='www.allkeyshop.com'?35:current?26:22):offer.priceCard}))}
      return{status:200,body:fixture.page(u.hostname==='www.allkeyshop.com'?'usd':'eur','Cyberpunk 2077',data),headers:[],url:payload.url}
    }
    return{status:200,body:JSON.stringify(body),headers:[],url:payload.url}
  })
  const window=new BrowserWindow({show:false,width:1320,height:970,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  window.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|Failed to load resource|404/.test(event.message))errors.push(event.message)})
  const evaluate=async code=>{try{return await window.webContents.executeJavaScript(code,true)}catch(error){console.error('Failed renderer expression:',code);console.error('Renderer errors:',errors);fs.writeFileSync(path.join(output,'ui-failure.png'),(await window.webContents.capturePage()).toPNG());throw error}}
  const until=async(code,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(code))return;await wait(35)}throw Error('Deals condition timed out: '+code)}
  const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click();true`);await wait(35)}
  const capture=async name=>{window.webContents.invalidate();for(let i=0;i<4;i++){await window.webContents.capturePage();await wait(45)}fs.writeFileSync(path.join(output,name+'.png'),(await window.webContents.capturePage()).toPNG())}
  await window.loadFile(path.join(output,'fixture/tests/deals-fixture.html'))
  await until('document.querySelector("[data-deals-trigger]")?.textContent.includes("22.00")')
  for(const installed of [false,true]){
    await evaluate(`window.__dealsFixture.owned(${installed});true`)
    await until('!!document.querySelector("[data-deals-trigger]")')
    assert.ok(await evaluate('(()=>{const button=document.querySelector("[data-deals-trigger]"),rect=button.getBoundingClientRect();return getComputedStyle(button).display!=="none"&&rect.width>0&&rect.height>0})()'),'Comparison stays visible for owned and installed library games')
  }
  await evaluate('window.__dealsFixture.freeMetadata(true);true')
  await until('!!document.querySelector("[data-deals-trigger]")')
  await click('[data-deals-trigger]')
  await until('!!document.querySelector("[data-game-deals]")')
  await click('[data-deals-close]')
  await until('!document.querySelector("[data-game-deals]")')
  await evaluate('window.__dealsFixture.freeMetadata(false);true')
  const toolbarSizes=[]
  const checkToolbar=async(language,width)=>{
    const result=await evaluate(`(()=>{const root=document.querySelector('.game-badges'),bounds=root.getBoundingClientRect(),nodes=[...root.children],news=document.querySelector('#game-updates-open span'),prefix=document.querySelector('.game-key-price>span'),price=document.querySelector('.game-key-price>strong'),range=document.createRange();range.selectNodeContents(news);const a=prefix.getBoundingClientRect(),b=price.getBoundingClientRect(),tops=nodes.map(node=>node.getBoundingClientRect().top);return{height:bounds.height,singleRow:Math.max(...tops)-Math.min(...tops)<1,updatesLabel:news.textContent,childrenInside:nodes.every(node=>{const r=node.getBoundingClientRect();return r.left>=bounds.left-.5&&r.right<=bounds.right+.5&&r.top>=bounds.top-.5&&r.bottom<=bounds.bottom+.5}),noControlOverflow:nodes.every(node=>node.scrollWidth<=node.clientWidth+1),newsLines:range.getClientRects().length,priceInline:a.right<=b.left+1&&Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<1}})()`)
    assert.equal(result.singleRow,true,'All quick actions stay on one row: '+language+' / '+width)
    assert.equal(result.updatesLabel,'Updates')
    assert.equal(result.childrenInside,true,'Whole toolbar buttons must remain visible: '+language+' / '+width)
    assert.equal(result.noControlOverflow,true,'No text may overflow a compact button: '+language+' / '+width)
    assert.equal(result.newsLines,1,'News label stays on one line: '+language+' / '+width)
    assert.equal(result.priceInline,true,'Price prefix and amount stay side by side: '+language+' / '+width)
    toolbarSizes.push({language,width,...result})
  }
  for(const language of ['en','de']){
    await evaluate(`window.__dealsFixture.language(${JSON.stringify(language)});true`)
    await until('!!document.querySelector(".game-key-price>strong")')
    for(const width of [1320,1100,1000,850,740,620,480]){window.setSize(width,970);await wait(80);await checkToolbar(language,width);if([740,480].includes(width))await capture('toolbar-'+language+'-'+width)}
  }
  await evaluate('window.__dealsFixture.language("en");true');window.setSize(1320,970);await wait(80)
  const initialRequests=requests.filter(url=>url.includes('admin-ajax')).length
  await evaluate('window.__detail=document.querySelector(".game-detail-modal-overlay");true')
  await click('[data-deals-trigger]')
  await until('document.querySelectorAll(".deals-offer").length===3')
  assert.equal(requests.filter(url=>url.includes('admin-ajax')).length,initialRequests,'Badge and dialog share a cached exact comparison')
  assert.equal(await evaluate('window.__detail===document.querySelector(".game-detail-modal-overlay")'),true)
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-deals-backdrop]")).opacity'),'1')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-deals-backdrop]")).backdropFilter'),'none')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-game-deals]")).transform'),'none')
  assert.ok(await evaluate(`document.querySelector('[data-deal-id="101"]').textContent.includes('22.00')`))
  assert.equal(await evaluate(`!!document.querySelector('[data-deal-id="102"],[data-deal-id="103"],[data-deal-id="104"],[data-deal-id="105"],[data-deal-id="107"]')`),false)
  await click('[data-deal-id="101"] .deal-kind button');assert.deepEqual(copied,['LIVE10'])
  await click('[data-deal-id="101"] [data-deal-open]')
  assert.equal(new URL(opened[0]).pathname,'/redirection/offer/eur/101');assert.equal(new URL(opened[0]).searchParams.get('coupon'),'LIVE10')
  version=1
  await click('[data-deals-refresh]')
  assert.equal(await evaluate('document.querySelectorAll(".deals-offer").length'),3,'A refresh retains existing rows')
  await until(`document.querySelector('[data-deal-id="101"]')?.textContent.includes('26.00')`)
  await evaluate('document.querySelector("[data-deals-fees]").value="base";document.querySelector("[data-deals-fees]").dispatchEvent(new Event("change",{bubbles:true}));true')
  await until(`document.querySelector('[data-deal-id="101"]')?.textContent.includes('20.00')`)
  await evaluate('document.querySelector("[data-deals-fees]").value="paypal";document.querySelector("[data-deals-fees]").dispatchEvent(new Event("change",{bubbles:true}));true')
  await until(`document.querySelector('[data-deal-id="101"]')?.textContent.includes('23.00')`)
  await capture('deals-en')
  await click('.deals-currency button:nth-child(2)')
  await until('document.querySelectorAll(".deals-offer").length===3')
  await click('[data-deal-id="101"] [data-deal-open]')
  assert.equal(new URL(opened.at(-1)).pathname,'/redirection/offer/usd/101')
  assert.ok(await evaluate('[...document.querySelectorAll("[data-deal-price]")].every(node=>node.textContent.includes("$"))'))
  await click('.deals-currency button:first-child')
  await until('[...document.querySelectorAll("[data-deal-price]")].every(node=>node.textContent.includes("€"))')
  fail=true;await click('[data-deals-refresh]')
  await until('!!document.querySelector(".deals-inline-error")')
  assert.equal(await evaluate('document.querySelectorAll(".deals-offer").length'),3,'Failed refresh retains last checked offers and a visible warning')
  fail=false
  await click('[data-deals-refresh]')
  await until('!document.querySelector(".deals-inline-error")')
  for(const width of [900,620,480]){window.setSize(width,970);await wait(100);assert.ok(await evaluate('document.querySelector("[data-game-deals]").scrollWidth<=document.querySelector("[data-game-deals]").clientWidth+1'),'Dialog must not overflow at '+width);await capture('deals-'+width)}
  window.setSize(1320,970)
  await evaluate('window.__dealsFixture.language("de");true')
  await until('document.querySelector("[data-game-deals]").textContent.includes("Mit Kartengebühren")')
  await capture('deals-de')
  await window.webContents.executeJavaScript('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true')
  await until('!document.querySelector("[data-game-deals]")')
  assert.equal(await evaluate('window.__dealsFixture.selection()'),true,'Escape closes comparison, retaining game preview')
  await evaluate('document.querySelector("[data-media-expand]").scrollIntoView({block:"center"});true');await click('[data-media-expand]')
  await until('!!document.querySelector("[data-game-lightbox]")')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-game-lightbox]")).opacity'),'1')
  assert.equal(await evaluate('document.querySelector("[data-game-lightbox]").getAnimations().length'),0)
  await click('[data-lightbox-close]')
  assert.equal(await evaluate('!!document.querySelector("[data-game-lightbox]")'),false)
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'ui-verification.json'),JSON.stringify({toolbarSizes,toolbarNeverSplitsLabels:true,sharedBadgeQuery:true,correctOfferLinks:true,verifiedFilters:true,couponCopy:true,liveRefreshWithoutRowFlash:true,currencyIsolation:true,paymentFees:true,failedRefreshKeepsData:true,noDialogScaleOrBackdropBlur:true,fullscreenOpaqueImmediately:true,responsive:[1320,900,620,480],localized:true,escapeRetainsGame:true,rendererErrors:errors},null,2))
  window.destroy();server.closeAllConnections();server.close();app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})
setTimeout(()=>{console.error('Deals UI test timed out');app.exit(1)},75000).unref()
