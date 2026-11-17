const {app,BrowserWindow,session,ipcMain,net}=require('electron')
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const root=path.join(__dirname,'..'),output=path.join(root,'.cache/home-preview'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const store=require('./fixtures/home-store.json'),live=process.env.ECLIPSE_HOME_LIVE==='1',requests=[],errors=[],writes=[]
const relevance=require('./fixtures/home-recommendations.json'),{selectHomeRecommendations}=require('./download-loader.cjs')()('src/services/homeRecommendations.ts')
const calendarFixture=require('./fixtures/release-calendar.json')
const calendarModel=require('./download-loader.cjs')()('src/services/releaseCalendar.ts')
const calendarShift=(calendarModel.calendarWeek(new Date())[0].getTime()-calendarModel.calendarWeek(new Date(calendarFixture.capturedAt))[0].getTime())/1000
const expectedReleases=selectHomeRecommendations(relevance.items.map(item=>({steamId:item.appid,name:item.name,releasedAt:item.release?.steam_release_date||0,reviewCount:item.reviews?.summary_filtered?.review_count||0,positivePercent:item.reviews?.summary_filtered?.percent_positive||0})),new Map(relevance.ranks.map(row=>[row.appid,row.concurrent_in_game])),store.top_sellers.items.map(item=>item.id),relevance.capturedAt).releases.length
let failFeed=false,failRecommendations=false,failCalendar=false,saved={},refreshVersion=false
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
app.on('window-all-closed',()=>{})
const deadline=setTimeout(()=>{console.error('Home preview timeout');app.exit(1)},90000)
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true})
  const server=http.createServer((req,res)=>{
    const src=new URL(req.url,'http://127.0.0.1').searchParams.get('url')||'',id=Number(/\/apps\/(\d+)\//.exec(src)?.[1]),poster=/library_capsule|library_600x900/.test(src),logo=/logo\.png/.test(src)
    const width=logo?400:poster?600:1280,height=logo?110:poster?900:640
    const colors=['#705241','#586141','#3e5c66','#6d4945','#544a72'],color=colors[id%colors.length]||'#5e554d'
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','image/svg+xml')
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="a"><stop stop-color="${color}"/><stop offset="1" stop-color="#101b25"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#a)"/><circle cx="${width*.72}" cy="${height*.4}" r="${height*.29}" stroke="#dac09c" fill="none" opacity=".25"/><path d="M0 ${height}L${width*.6} ${height*.1}L${width} ${height}" fill="#ffffff09"/><text x="${width*.07}" y="${height*.77}" fill="#ddc9b4" font-family="Arial" font-size="${logo?33:28}">${logo?'ECLIPSE TEST ART':id||'UPDATE'}</text></svg>`)
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port
  session.defaultSession.webRequest.onBeforeRequest((details,done)=>{
    if(!/^https?:/.test(details.url)||details.url.startsWith(`http://127.0.0.1:${port}`))return done({})
    if(live&&/\.steam(?:static|usercontent)\.com\//.test(details.url))return done({})
    if(/\.steam(?:static|usercontent)\.com\//.test(details.url))return done({redirectURL:`http://127.0.0.1:${port}/image?url=${encodeURIComponent(details.url)}`})
    done({cancel:true})
  })
  ipcMain.on('account:get-identity-sync',event=>{event.returnValue=null})
  ipcMain.handle('settings:set',(_event,patch)=>{writes.push(patch);saved={...saved,...patch};return{success:true}})
  ipcMain.handle('sources:get-all-cached',()=>[])
  ipcMain.handle('network:cancel',()=>true)
  ipcMain.handle('network:request',async(_event,payload)=>{
    requests.push(payload.url);const url=new URL(payload.url),id=Number(url.searchParams.get('appid')||url.searchParams.get('appids'))
    let data={}
    if(url.pathname.includes('featuredcategories')){
      if(failFeed)return{status:503,body:'unavailable',headers:[],url:payload.url}
      data=refreshVersion ? {...store,top_sellers:{...store.top_sellers,items:[{id:1086940,type:0,name:"Baldur's Gate 3"},...store.top_sellers.items]}} : store
    }else if(url.pathname.includes('/search/results/')){
      if(failCalendar)return{status:503,body:'unavailable',headers:[],url:payload.url}
      const ids=calendarFixture.searches.find(row=>row.filter===url.searchParams.get('filter'))?.ids||[]
      data={success:1,results_html:[...(refreshVersion&&url.searchParams.get('count')==='100'?[4242424]:[]),...ids].map(id=>`<a data-ds-appid="${id}" data-ds-itemkey="App_${id}"></a>`).join('')}
    }else if(url.pathname.includes('GetGamesByConcurrentPlayers')){
      if(failRecommendations)return{status:503,body:'unavailable',headers:[],url:payload.url}
      data={response:{ranks:relevance.ranks}}
    }else if(url.pathname.includes('GetNumberOfCurrentPlayers')){
      data={response:{result:1,player_count:0}}
    }else if(url.pathname.includes('GetNewsForApp')){
      const now=Math.floor(Date.now()/1000),gid=String(id)+'01'
      data={appnews:{appid:id,newsitems:[{gid,title:'A new chapter begins',contents:`[img]https://clan.fastly.steamstatic.com/images/1/${'a'.repeat(40)}.jpg[/img][p]Discover new locations, updated gameplay and the latest improvements from the developers.[/p]`,date:now-86400,url:'',feedname:'steam_community_announcements'},{gid:String(id)+'02',title:'Small patch notes',contents:'[p]Maintenance and fixes.[/p]',date:now-3600,feedname:'steam_community_announcements'}]}}
    }else if(url.pathname.includes('ajaxgetpartnerevents')){
      data={events:[{appid:id,published:1,hidden:false,unlisted:false,event_type:14,announcement_body:{gid:String(id)+'01',clanid:1},jsondata:JSON.stringify({localized_title_image:['a'.repeat(40)+'.jpg'],localized_capsule_image:['b'.repeat(40)+'.jpg']})}]}
    }else if(url.pathname.includes('appdetails')){
      data={[id]:{success:true,data:{steam_appid:id,name:'Upcoming game',type:'game',release_date:{coming_soon:true,date:'2027'},screenshots:[],categories:[],genres:[],developers:[],publishers:[]}}}
    }else if(url.pathname.includes('GetItems')){
      const input=JSON.parse(url.searchParams.get('input_json')||'{}')
      if(input.data_request?.include_release&&!input.data_request?.include_reviews){
        if(failCalendar)return{status:503,body:'unavailable',headers:[],url:payload.url}
        data={response:{store_items:(input.ids||[]).flatMap(({appid})=>{
          if(appid===4242424&&refreshVersion){const noon=new Date();noon.setHours(12,0,0,0);return[{appid,item_type:0,type:0,success:1,visible:true,name:'New automatic calendar release',release:{is_coming_soon:true,coming_soon_display:'date_full',steam_release_date:Math.floor(noon.getTime()/1000)},assets:{asset_url_format:'steam/apps/4242424/${FILENAME}',header:'header.jpg'}}]}
          const item=calendarFixture.items.find(item=>item.appid===appid)
          return item?[{...item,release:{...item.release,steam_release_date:(item.release?.steam_release_date||0)+calendarShift}}]:[]
        })}}
      }else if(input.data_request?.include_reviews){
        const offset=Math.floor(Date.now()/1000)-relevance.capturedAt
        data={response:{store_items:(input.ids||[]).flatMap(({appid})=>{const item=relevance.items.find(item=>item.appid===appid);return item?[{...item,basic_info:{...item.basic_info,short_description:input.context.language==='german'?(live?item.basic_info?.short_description:'Deutsche Spielbeschreibung für die Oberflächenprüfung.'):'English game description for the interface check.'},release:{...item.release,steam_release_date:(item.release?.steam_release_date||0)+offset}}]:[]})}}
      }else if(live){
        try{const result=await fetch(payload.url,{signal:AbortSignal.timeout(10000)});if(result.ok)return{status:200,body:await result.text(),headers:[['content-type','application/json']],url:payload.url}}catch{}
      }
      if(!input.data_request?.include_reviews&&!input.data_request?.include_release)data={response:{store_items:(input.ids||[]).map(({appid})=>({appid,assets:{asset_url_format:`steam/apps/${appid}/\${FILENAME}`,library_capsule:'library_600x900.jpg',library_hero:'library_hero.jpg',header:'header.jpg'}}))}}
    }
    return{status:200,body:JSON.stringify(data),headers:[['content-type','application/json']],url:payload.url}
  })
  ipcMain.handle('artwork:prefetch',async(_event,{url})=>{const result=await net.fetch(url);await result.arrayBuffer();return result.ok})
  const window=new BrowserWindow({show:false,width:1380,height:1050,webPreferences:{preload:path.join(root,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  window.webContents.on('console-message',event=>{if(event.level==='error'&&!/ERR_|Failed to load resource/.test(event.message))errors.push(event.message)})
  const evaluate=code=>window.webContents.executeJavaScript(code,true)
  const until=async(code,timeout=10000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(code))return;await wait(50)}throw Error('Home condition timed out: '+code)}
  const capture=async(name,selector)=>{let image;const rect=selector?await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),x=Math.max(0,Math.floor(r.x)),y=Math.max(0,Math.floor(r.y));return{x,y,width:Math.min(innerWidth-x,Math.ceil(r.width)),height:Math.min(innerHeight-y,Math.ceil(r.bottom-y))}})()`):undefined;for(let frame=0;frame<8;frame++){try{window.webContents.invalidate();image=await window.webContents.capturePage(rect)}catch(error){if(!/UnknownVizError/.test(String(error))||frame===7)throw error}await wait(50)}fs.writeFileSync(path.join(output,name+'.png'),image.toPNG())}
  await window.loadFile(path.join(output,'fixture/tests/home-preview-fixture.html'))
  await until('!!document.querySelector(".hero-pagination--compact")&&document.querySelectorAll("#home-new .store-game-card").length==='+expectedReleases)
  await evaluate('window.dispatchEvent(new Event("focus"));true')
  await evaluate('document.fonts.ready.then(()=>true)')
  await until('!!document.querySelector(".hero-visual img")&&document.querySelector(".hero-visual img").naturalWidth>0')
  assert.equal(await evaluate('document.querySelectorAll(".hero-pagination--compact button").length'),8)
  await until(live ? 'document.querySelector(".store-hero").dataset.heroId===document.querySelector(".hero-pagination--compact button").dataset.highlightId&&document.querySelector(".hero-description").textContent.trim().length>0' : 'document.querySelector(".hero-description").textContent.includes("Deutsche")',live?20000:10000)
  assert.ok(await evaluate('document.querySelector("#home-new").textContent.includes("Neu & beliebt")'))
  assert.ok(await evaluate('[...document.querySelectorAll("#home-new .home-card-activity")].every(node=>node.textContent.includes("spielen"))'))
  const order=await evaluate('[...document.querySelectorAll(".home-discovery-content>section")].map(section=>section.id)')
  assert.deepEqual(order,['home-new','home-deals','home-upcoming','home-updates','home-bestsellers'])
  const newsDistance=await evaluate('document.querySelector("#home-updates").getBoundingClientRect().top-innerHeight')
  if(newsDistance>240)assert.equal(requests.some(url=>url.includes('GetNewsForApp')),false,'News outside the prefetch margin must stay lazy')
  assert.equal(await evaluate('!!document.querySelector(".home-preview-toolbar,.home-highlights,.home-hero-picks")'),false,'No test banner or thumbnail strip on Home')
  assert.equal(requests.some(url=>url.includes('/search/results/')&&new URL(url).searchParams.get('count')==='100'),false,'Calendar discovery must stay lazy until its section approaches the viewport')
  assert.equal(await evaluate('[...document.querySelectorAll(".store-game-card")].some(card=>/Uninitialized|Steam (?:Frame|Controller|Deck)/i.test(card.textContent))'),false,'Home must exclude placeholders and hardware')
  assert.ok(await evaluate('document.querySelector(".store-hero").getBoundingClientRect().height>=470'),'The feature artwork should be larger')
  await until('!document.querySelector(".store-hero").dataset.heroPaused&&document.querySelectorAll(".hero-frame").length===1')
  const initialHero=await evaluate('document.querySelector(".store-hero").dataset.heroId')
  await until('document.querySelector(".store-hero").dataset.heroId!=='+JSON.stringify(initialHero),8500)
  await until('document.querySelectorAll(".hero-frame").length===1')
  const cachedSwitchMs=await evaluate(`new Promise((resolve,reject)=>{const root=document.querySelector('.store-hero'),start=performance.now(),timer=setTimeout(()=>{observer.disconnect();reject(Error('Cached slide did not appear'))},2000);const observer=new MutationObserver(()=>{if(root.dataset.heroId===${JSON.stringify(initialHero)}){clearTimeout(timer);observer.disconnect();resolve(performance.now()-start)}});observer.observe(root,{attributes:true,attributeFilter:['data-hero-id']});document.querySelector('.hero-pagination--compact button[data-highlight-id="${initialHero}"]').click()})`)
  assert.ok(cachedSwitchMs<300,'A decoded adjacent slide must switch immediately, without waiting for the old fade or optional logo: '+cachedSwitchMs)
  await evaluate('window.__homeFixture.focus(false);true')
  await until('!!document.querySelector(".launcher-shell[data-unfocused]")')
  await wait(6800)
  assert.equal(await evaluate('document.querySelector(".store-hero").dataset.heroId'),initialHero,'Automatic rotation must stop while the launcher is unfocused')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".topbar")).backgroundColor'),'rgb(10, 11, 13)')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".topbar")).backdropFilter'),'none')
  assert.equal(await evaluate('document.querySelector(".topbar h1").textContent'),'Start')
  await capture('home-unfocused')
  await evaluate('window.__homeFixture.focus(true);true')
  await until('!document.querySelector(".launcher-shell[data-unfocused]")')
  if(live){
    const end=Date.now()+12000
    while(Date.now()<end&&!await evaluate('[...document.querySelectorAll("#home-new .poster-art")].slice(0,6).every(art=>!art.querySelector(".cover-loading"))')){window.webContents.invalidate();await window.webContents.capturePage().catch(()=>{});await wait(150)}
    await wait(300)
  }
  await capture(live?'preview-live-top':'preview-top')
  await evaluate('document.querySelector("#home-new .home-row-more").click();true')
  await until('!!document.querySelector(".home-collection")')
  assert.equal(await evaluate('document.querySelectorAll(".home-collection-grid .store-game-card").length'),expectedReleases)
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true')
  await until('!document.querySelector(".home-collection")')
  const secondId=await evaluate('Number(document.querySelector(".hero-pagination--compact button:nth-child(2)").dataset.highlightId)')
  await evaluate('document.querySelector(".hero-pagination--compact button:nth-child(2)").click();true')
  // The first decoded frame is allowed in an unfocused window; later choices
  // resume only on focus, as the actual launcher does.
  await evaluate('window.dispatchEvent(new Event("focus"));true')
  await until('document.querySelector(".store-hero").dataset.heroId==="'+secondId+'"')
  await evaluate('(()=>{const saved=JSON.parse(localStorage.getItem("gamehub-store"));saved.state.settings.homeLayout="classic";localStorage.setItem("gamehub-store",JSON.stringify(saved));return true})()')
  await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.reload()})
  await until('!!document.querySelector("[data-home-layout=preview]")')
  assert.equal(await evaluate('Object.hasOwn(window.__homeFixture.settings(),"homeLayout")'),false,'A retired Classic preference must not restore the old Home')
  assert.equal(await evaluate('!!document.getElementById("settings-home-classic")'),false)
  await evaluate('document.querySelector(".home-view").scrollTop=document.querySelector("#home-updates").offsetTop;true')
  await until('document.querySelectorAll(".home-update-card").length===6')
  await until('[...document.querySelectorAll(".home-update-card .home-update-image img")].slice(0,3).every(image=>image.complete&&image.naturalWidth>0)')
  await capture(live?'preview-live-updates':'preview-updates')
  await evaluate('document.querySelector(".home-updates-more").click();true')
  await until('document.querySelectorAll(".home-update-card").length===9')
  assert.equal(await evaluate('[...document.querySelectorAll(".home-update-card")].some(card=>/Uninitialized|Steam (?:Frame|Controller|Deck)/i.test(card.textContent))'),false)
  await evaluate('document.querySelector(".home-update-card").click();true')
  await until('!!document.querySelector("[data-game-updates]")')
  assert.match(await evaluate('document.querySelector(".updates-article h3").textContent'),/new chapter/)
  await evaluate('document.querySelector("[data-updates-close]").click();true')
  await until('!document.querySelector("[data-game-updates]")')
  await evaluate('document.querySelector(".home-view").scrollTop=5000;true')
  await until('document.querySelectorAll(".release-calendar-day").length===7&&document.querySelectorAll(".release-calendar-game").length>0')
  assert.equal(await evaluate('document.querySelectorAll(".release-calendar-day[data-today]").length'),1)
  assert.equal(await evaluate('document.querySelectorAll(".home-upcoming-grid,.home-upcoming-card").length'),0)
  await capture(live?'calendar-live':'calendar')
  await capture(live?'calendar-detail-live':'calendar-detail','.release-calendar')
  const week=await evaluate('document.querySelector("[data-calendar-range]").textContent')
  await evaluate('document.getElementById("release-calendar-next").click();true')
  await until('document.querySelector("[data-calendar-range]").textContent!=='+JSON.stringify(week))
  assert.ok(await evaluate('document.querySelectorAll(".release-calendar-game[data-release-state=upcoming]").length>0'))
  await capture(live?'calendar-next-live':'calendar-next')
  await capture(live?'calendar-next-detail-live':'calendar-next-detail','.release-calendar')
  await evaluate('document.getElementById("release-calendar-today").click();true')
  await until('document.querySelector("[data-calendar-range]").textContent==='+JSON.stringify(week))
  const day=await evaluate('document.querySelector("[data-calendar-more]").dataset.calendarMore')
  const expectedDayCount=calendarFixture.items.filter(item=>{const stamp=item.release?.steam_release_date;return stamp&&calendarModel.calendarDayKey(new Date((stamp+calendarShift)*1000))===day&&item.item_type===0&&item.type===0&&item.success===1&&item.visible===true}).length
  await evaluate('document.querySelector("[data-calendar-more]").click();true')
  await until('!!document.querySelector(".home-collection")')
  assert.equal(await evaluate('document.querySelectorAll(".home-collection-grid .store-game-card").length'),expectedDayCount)
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true')
  await until('!document.querySelector(".home-collection")')
  await evaluate('document.querySelector(".release-calendar-undated-toggle").click();true')
  await until('!!document.getElementById("release-calendar-undated-list")')
  assert.ok(await evaluate('document.querySelectorAll("#release-calendar-undated-list .release-calendar-game").length>0'))
  await evaluate('document.querySelector(".release-calendar-undated-toggle").click();true')
  const selectedCalendarName=await evaluate('document.querySelector(".release-calendar-game strong").textContent')
  await evaluate('document.querySelector(".release-calendar-game").click();true')
  assert.ok(await evaluate('window.__homeFixture.selection()>0'))
  await evaluate('window.__homeFixture.closeGame();true')
  const calendarScroll=await evaluate('document.querySelector(".release-calendar-scroll").scrollLeft')
  assert.equal(calendarScroll,0)
  refreshVersion=true
  await evaluate('window.__homeFixture.focus(false);window.__homeFixture.ageDiscovery();true')
  const beforeRefresh=requests.filter(url=>url.includes('featuredcategories')).length
  await wait(150)
  assert.equal(requests.filter(url=>url.includes('featuredcategories')).length,beforeRefresh,'No discovery refresh may start while unfocused')
  await evaluate('window.__calendarRoot=document.querySelector(".release-calendar");window.__homeFixture.focus(true);true')
  await until('document.querySelector("#home-bestsellers #game-card-1086940")&&document.querySelector(".release-calendar").textContent.includes("New automatic calendar release")')
  assert.equal(await evaluate('window.__calendarRoot===document.querySelector(".release-calendar")'),true,'Automatic refresh must update in place')
  for(const width of [1000,760,540]){
    window.setSize(width,1000);await evaluate('document.querySelector(".home-view").scrollTop=0;true');await wait(80)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No page overflow at '+width)
    assert.ok(await evaluate('document.querySelector(".home-view").scrollWidth<=document.querySelector(".home-view").clientWidth+1'),'No home overflow at '+width)
    await evaluate('document.querySelector(".home-view").scrollTop=document.querySelector("#home-upcoming").offsetTop;true')
    assert.ok(await evaluate('document.querySelector(".release-calendar-scroll").scrollWidth>=document.querySelector(".release-calendar-scroll").clientWidth'))
    await capture('calendar-'+width)
    await evaluate('document.querySelector(".home-view").scrollTop=0;true')
    await capture('preview-'+width)
  }
  window.setSize(1380,1050);await evaluate('window.__homeFixture.language("en");true')
  await until('document.querySelector("#home-new h3").textContent==="New & popular"')
  await evaluate('window.dispatchEvent(new Event("focus"));true')
  await until('document.querySelector(".hero-description").textContent.includes("English")')
  assert.equal(await evaluate('document.querySelector(".home-discovery-nav").textContent.includes("Entdecken")'),false)
  await evaluate('document.querySelector(".home-view").scrollTop=document.querySelector("#home-upcoming").offsetTop;true')
  await until('document.getElementById("release-calendar-title").textContent==="Release calendar"&&document.querySelectorAll(".release-calendar-game").length>0')
  await capture('calendar-en')
  failCalendar=true
  await evaluate('void window.__homeFixture.expireCalendar();true')
  await until('!!document.querySelector(".release-calendar-notice")')
  assert.equal(await evaluate('document.querySelectorAll(".release-calendar-game").length'),0)
  failCalendar=false
  await evaluate('document.querySelector(".release-calendar-notice button").click();true')
  await until('!document.querySelector(".release-calendar-notice")&&document.querySelectorAll(".release-calendar-game").length>0')
  await evaluate('document.querySelector(".home-view").scrollTop=0;true')
  await capture('preview-en')
  failRecommendations=true
  await evaluate('void window.__homeFixture.expireRecommendations();true')
  await until('!!document.querySelector(".home-recommendations-retry")')
  assert.ok(await evaluate('document.querySelector("#home-new").textContent.includes("could not be checked")'))
  assert.equal(await evaluate('document.querySelectorAll("#home-new .store-game-card").length'),0,'Unavailable activity must not fall back to random new releases')
  failRecommendations=false
  await evaluate('document.querySelector(".home-recommendations-retry").click();true')
  await until('!document.querySelector(".home-recommendations-retry")&&document.querySelectorAll("#home-new .store-game-card").length>0')
  failFeed=true
  await evaluate('void window.__homeFixture.expireFeed();true')
  await until('!!document.querySelector(".home-discovery>.home-discovery-content>.home-feed-empty")')
  assert.ok(await evaluate('!!document.querySelector(".hero-pagination--compact")'),'Highlights remain usable if the store feed fails')
  await capture('feed-unavailable')
  assert.equal(await evaluate('!!document.querySelector("[data-home-layout=preview]")'),true,'Home remains available on feed failure')
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({automaticDiscoveryRefresh:true,newCalendarReleaseAdded:true,hero:{largerArtwork:true,automaticRotation:true,stopsWhenUnfocused:true,cachedSwitchMs},excludedPlaceholdersAndHardware:true,moreUpdateCards:true,releaseCalendar:{sevenDays:true,today:true,weekNavigation:true,pastAndUpcoming:true,dayCollection:true,unknownDatesSeparate:true,openGame:selectedCalendarName,failureRecovery:true,localized:true,responsive:true},verifiedPlayerActivity:true,eightHighlights:true,noThumbnailStrip:true,noPreviewBanner:true,opaqueUnfocusedHeader:true,localizedDescriptions:true,recommendationFailureRecoverable:true,lazyNews:true,newsArticleSelection:true,onlyNewHome:true,legacyClassicPreferenceRetired:true,feedFailureRecoverable:true,viewAll:true,sections:order,responsive:[1380,1000,760,540],liveArtwork:live,requestCount:requests.length,writes,rendererErrors:errors},null,2))
  clearTimeout(deadline);window.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})
