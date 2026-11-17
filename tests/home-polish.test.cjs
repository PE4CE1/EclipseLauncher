const test=require('node:test'),assert=require('node:assert/strict'),loadTs=require('./download-loader.cjs')
const metadata=(id,name,type=0)=>({appid:id,item_type:0,type,success:1,visible:true,name,release:{steam_release_date:1_700_000_000},assets:{asset_url_format:`steam/apps/${id}/\${FILENAME}`,header:'header.jpg',library_hero:'new/hero.jpg'},best_purchase_option:{final_price_in_cents:'999',original_price_in_cents:'1999',discount_pct:50}})
test('Home consistently excludes placeholders and Steam hardware without excluding actual similarly named games',()=>{
  const {isHomeGameCandidate}=loadTs()('src/services/homeGameFilter.ts')
  for(const name of ['Uninitialized',' uninitialised ','Unknown app','Steam Frame','Steam Deck OLED','Steam Controller','Steam Link'])assert.equal(isHomeGameCandidate(42,name),false,name)
  for(const name of ['SteamWorld Heist II','Controller Companion Adventure','Moon Sweepers'])assert.equal(isHomeGameCandidate(42,name),true,name)
  assert.equal(isHomeGameCandidate(0,'Game'),false)
})
test('raw Home categories discard Uninitialized and hardware before any cards or news sources are built',()=>{
  const {parseHomeStoreFeed}=loadTs()('src/services/homeDiscovery.ts')
  const data={top_sellers:{items:['Game','Uninitialized','Steam Frame','Steam Controller'].map((name,i)=>({id:i+1,type:0,name}))}}
  assert.deepEqual(parseHomeStoreFeed(data,'en-US').sellers.map(g=>g.name),['Game'])
})
test('expanded Home sale feed validates real app types, includes additional offers and never invents a zero player count',async()=>{
  const ids=[1,2,3,4,5],calls=[]
  const {fetchHomeStoreFeed}=loadTs({'./httpClient':{desktopFetch:async(url)=>{
    const u=new URL(url);calls.push(u)
    if(u.pathname.includes('featuredcategories'))return Response.json({top_sellers:{items:ids.map(id=>({id,type:0,name:id===4?'Uninitialized':'Game '+id}))},specials:{items:[{id:1,type:0,name:'Game 1'}]}})
    if(u.pathname.includes('/search/'))return Response.json({success:1,results_html:(u.searchParams.get('filter')==='topsellers'?[1,2,3,4,5,60,61]:Array.from({length:30},(_,i)=>i+10)).map(id=>`<a data-ds-appid="${id}" data-ds-itemkey="App_${id}">`).join('')})
    const input=JSON.parse(u.searchParams.get('input_json'));assert.equal(input.context.country_code,'DE')
    return Response.json({response:{store_items:input.ids.map(({appid})=>metadata(appid,appid===4?'Uninitialized':'Game '+appid,appid===2?10:appid===3?6:0))}})
  }}})('src/services/homeDiscovery.ts')
  const result=await fetchHomeStoreFeed('en')
  assert.deepEqual(result.sellers.map(g=>g.steamId),[1,5,60,61]);assert.equal(result.specials.length,31)
  assert.ok(result.specials.every(g=>g.currentPlayers===undefined));assert.equal(calls.length,4)
  assert.equal(result.specials[0].heroImage,'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1/new/hero.jpg')
})

test('Home search expansion batches at 100 and retains only verified results if one metadata batch fails',async()=>{
  const batches=[]
  const {fetchHomeStoreFeed}=loadTs({'./httpClient':{desktopFetch:async url=>{
    const u=new URL(url)
    if(u.pathname.includes('featuredcategories'))return Response.json({specials:{items:Array.from({length:30},(_,i)=>({id:i+201,type:0,name:'Featured '+i}))}})
    if(u.pathname.includes('/search/')){
      const ids=u.searchParams.get('filter')==='topsellers'?Array.from({length:40},(_,i)=>i+1):Array.from({length:60},(_,i)=>i+101)
      return Response.json({success:1,results_html:ids.map(id=>`<a data-ds-appid="${id}" data-ds-itemkey="App_${id}">`).join('')})
    }
    const ids=JSON.parse(u.searchParams.get('input_json')).ids.map(item=>item.appid);batches.push(ids)
    if(ids.includes(201))throw Error('Second batch unavailable')
    return Response.json({response:{store_items:ids.map(id=>metadata(id,'Game '+id))}})
  }}})('src/services/homeDiscovery.ts')
  const result=await fetchHomeStoreFeed('en')
  assert.deepEqual(batches.map(batch=>batch.length),[100,30])
  assert.equal(result.sellers.length,40)
  assert.equal(result.specials.length,60)
  assert.ok(result.specials.every(game=>game.steamId<201),'Unverified featured offers must not leak through after a failed metadata batch')
})

test('Home abort during metadata validation never publishes an unverified fallback feed',async()=>{
  const controller=new AbortController()
  const {fetchHomeStoreFeed}=loadTs({'./httpClient':{desktopFetch:async url=>{
    const u=new URL(url)
    if(u.pathname.includes('featuredcategories'))return Response.json({top_sellers:{items:[{id:1,type:0,name:'Game'}]}})
    if(u.pathname.includes('/search/'))return Response.json({success:1,results_html:''})
    controller.abort()
    return Response.json({response:{store_items:[metadata(1,'Game')]}})
  }}})('src/services/homeDiscovery.ts')
  await assert.rejects(fetchHomeStoreFeed('en',controller.signal),{name:'AbortError'})
})

function images(t,delayLogo=false){
  const previous=global.Image,requests=[],decodes=[]
  global.Image=class{
    naturalWidth=1920
    set src(value){this.value=value;if(!value)return;requests.push(value);if(delayLogo&&value.includes('logo'))return;queueMicrotask(()=>this.onload?.())}
    decode(){decodes.push(this.value);return Promise.resolve()}
  }
  t.after(()=>{global.Image=previous})
  return{requests,decodes}
}
test('known hashed HD hero art is decoded directly and does not wait for an optional missing logo',async t=>{
  const f=images(t,true)
  const {prepareHeroArtwork,getCachedHeroArtwork}=loadTs({'./assetHelper':{getHeroUrl:()=>'/old.jpg',getLogoUrl:()=>'/logo.png',getPlaceholderHero:()=>'/fallback'},'./steamArtwork':{getSteamArtwork:()=>assert.fail('Known art should not need another metadata lookup')}})('src/services/heroArtwork.ts')
  const controller=new AbortController(),start=Date.now()
  const result=await prepareHeroArtwork(42,'Game','/header.jpg',controller.signal,'/hashed/hero.jpg')
  assert.ok(Date.now()-start<400,'The optional 800 ms logo timeout must not gate the image')
  assert.equal(result.url,'/hashed/hero.jpg');assert.equal(result.logo,undefined);assert.ok(f.decodes.includes('/hashed/hero.jpg'));assert.ok(!f.requests.includes('/old.jpg'))
  assert.equal(getCachedHeroArtwork(42,'/header.jpg','/hashed/hero.jpg'),result)
  controller.abort()
})
test('foreground and adjacent-slide preloads share one decode without letting an aborted preload cancel a live consumer',async t=>{
  const previous=global.Image,instances=[]
  global.Image=class{naturalWidth=1920;set src(value){this.value=value;if(value)instances.push(this)}decode(){return Promise.resolve()}}
  t.after(()=>{global.Image=previous})
  const {prepareHeroArtwork}=loadTs({'./assetHelper':{getHeroUrl:()=>'/hero',getLogoUrl:()=>'/logo',getPlaceholderHero:()=>'/fallback'},'./steamArtwork':{}})('src/services/heroArtwork.ts')
  const background=new AbortController(),foreground=new AbortController()
  const first=prepareHeroArtwork(42,'Game',undefined,background.signal,'/known.jpg')
  const second=prepareHeroArtwork(42,'Game',undefined,foreground.signal,'/known.jpg')
  assert.equal(instances.filter(i=>i.value==='/known.jpg').length,1)
  background.abort();assert.equal(await first,null)
  instances.find(i=>i.value==='/known.jpg').onload()
  assert.equal((await second).url,'/known.jpg')
  foreground.abort()
})
