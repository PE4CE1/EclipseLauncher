const test=require('node:test'),assert=require('node:assert/strict'),loadTs=require('./download-loader.cjs')
const now=1_800_000_000
const game=(id,extra={})=>({steamId:id,name:'Game '+id,releasedAt:now-7*86400,reviewCount:500,positivePercent:90,currentPlayers:0,priceFormatted:'19,99 €',...extra})
const item=(id,extra={})=>({appid:id,id,type:0,item_type:0,success:1,visible:true,name:'Game '+id,release:{steam_release_date:now-86400},reviews:{summary_filtered:{review_count:500,percent_positive:90}},assets:{asset_url_format:`steam/apps/${id}/\${FILENAME}`,header:'header.jpg'},basic_info:{short_description:'Ein deutsches Spiel.',developers:[{name:'Studio'}]},best_purchase_option:{final_price_in_cents:'1999',original_price_in_cents:'2999',discount_pct:33},...extra})

test('home recommendations exclude zero, unknown and very low player counts, poor reviews, old and future releases',()=>{
  const {selectHomeRecommendations}=loadTs()('src/services/homeRecommendations.ts')
  const games=[game(1),game(2),game(3),game(4,{positivePercent:69}),game(5,{reviewCount:99}),game(6,{releasedAt:now-181*86400}),game(7,{releasedAt:now+86400}),game(8)]
  const result=selectHomeRecommendations(games,new Map([[1,0],[2,99],[4,5000],[5,8000],[6,3000],[7,2000],[8,450]]),[],now)
  assert.deepEqual(result.releases.map(g=>g.steamId),[8])
  assert.deepEqual(result.highlights.map(g=>g.steamId),[8,6])
  assert.equal(result.releases[0].currentPlayers,450)
})
test('home highlights contain eight unique active games, prioritize current releases and retain current bestsellers',()=>{
  const {selectHomeRecommendations}=loadTs()('src/services/homeRecommendations.ts')
  const games=Array.from({length:30},(_,i)=>game(i+1,{releasedAt:i<6?now-86400:now-400*86400}))
  const counts=new Map(games.map((g,i)=>[g.steamId,20000-i*100]))
  const result=selectHomeRecommendations(games,counts,[20,21],now)
  assert.equal(result.highlights.length,8)
  assert.deepEqual(result.highlights.map(g=>g.steamId),[1,2,3,4,5,6,20,21])
  assert.equal(new Set(result.highlights.map(g=>g.steamId)).size,8)
  assert.equal(result.releases.length,6)
})
test('home chart validation bounds input and does not accept fabricated or duplicate counts',()=>{
  const {parseHomePlayerCharts}=loadTs()('src/services/homeRecommendations.ts')
  assert.deepEqual([...parseHomePlayerCharts({response:{ranks:[{appid:42,concurrent_in_game:0},{appid:42,concurrent_in_game:900},{appid:43,concurrent_in_game:-1},{appid:44,concurrent_in_game:'300'},{appid:45,concurrent_in_game:300}]}})],[[42,0],[45,300]])
  assert.equal(parseHomePlayerCharts({}).size,0)
})
test('home metadata validates app visibility, assets, reviews and real EUR prices in each language',()=>{
  const {parseHomeStoreItems}=loadTs()('src/services/homeRecommendations.ts')
  const raw={response:{store_items:[item(42),item(42),item(43,{type:1}),item(44,{visible:false}),item(45,{success:2}),item(46),item(47,{reviews:{summary_filtered:{review_count:-1,percent_positive:500}},assets:{asset_url_format:'steam/apps/47/\${FILENAME}',header:'../evil.jpg'},best_purchase_option:{final_price_in_cents:'not-a-price'}})]}}
  const games=parseHomeStoreItems(raw,new Set([42,43,44,45,47]),'de-DE')
  assert.deepEqual(games.map(g=>g.steamId),[42,47])
  assert.match(games[0].priceFormatted,/19,99/);assert.equal(games[0].shortDescription,'Ein deutsches Spiel.')
  assert.equal(games[1].priceFormatted,undefined);assert.equal(games[1].headerImage,undefined);assert.equal(games[1].positivePercent,0)
  assert.equal(parseHomeStoreItems({response:{store_items:[item(48,{is_free:true,best_purchase_option:undefined})]}},new Set([48]),'en-US')[0].isFree,true)
})
test('home live selection batches metadata and verifies smaller releases with a bounded pool; zero and failed counts stay excluded',async()=>{
  let active=0,peak=0;const calls=[]
  const {fetchHomeRecommendations}=loadTs({'./httpClient':{desktopFetch:async(url,options)=>{
    const u=new URL(url);calls.push(u)
    if(u.pathname.includes('GetGamesByConcurrentPlayers'))return Response.json({response:{ranks:[{appid:1,concurrent_in_game:3000}]}})
    if(u.pathname.includes('/search/'))return Response.json({success:1,results_html:''})
    if(u.pathname.includes('GetItems')){const input=JSON.parse(u.searchParams.get('input_json'));assert.equal(input.context.language,'german');assert.equal(input.context.country_code,'DE');return Response.json({response:{store_items:input.ids.map(({appid})=>item(appid,{release:{steam_release_date:Math.floor(Date.now()/1000)-86400}}))}})}
    assert.ok(options.signal);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,8));active--
    if(u.searchParams.get('appid')==='3')throw Error('Unavailable')
    return Response.json({response:{result:1,player_count:u.searchParams.get('appid')==='2'?0:450}})
  }}})('src/services/homeRecommendations.ts')
  const feed={releases:Array.from({length:18},(_,i)=>({steamId:i+2,name:'Candidate'})),sellers:[],specials:[],upcoming:[]}
  const result=await fetchHomeRecommendations('de',feed)
  assert.ok(result.releases.every(g=>g.currentPlayers>=100));assert.ok(!result.releases.some(g=>[2,3].includes(g.steamId)))
  assert.equal(calls.filter(u=>u.pathname.includes('GetItems')).length,1)
  assert.equal(calls.filter(u=>u.pathname.includes('GetNumberOfCurrentPlayers')).length,18)
  assert.equal(peak,3)
})
test('home recommendations propagate cancellation rather than publishing a partial unverified selection',async()=>{
  const controller=new AbortController()
  const {fetchHomeRecommendations}=loadTs({'./httpClient':{desktopFetch:async()=>{controller.abort();return Response.json({response:{ranks:[]}})}}})('src/services/homeRecommendations.ts')
  await assert.rejects(fetchHomeRecommendations('en',undefined,controller.signal))
})
test('home translations cover both languages and localized fallback descriptions and genres',()=>{
  const load=loadTs(),{interfaceMessages}=load('src/i18n/interfaceTranslations.ts'),{localizeCuratedGame}=load('src/i18n/gameContent.ts')
  for(const [key,pair]of Object.entries(interfaceMessages).filter(([key])=>key.startsWith('home'))){assert.equal(pair.length,2,key);assert.ok(pair.every(text=>text.trim()),key);assert.deepEqual([...pair[0].matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),[...pair[1].matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),key)}
  const source={steamId:1091500,name:'Cyberpunk 2077',shortDescription:'An open-world game',genres:['RPG','Open World']}
  const german=localizeCuratedGame(source,'de')
  assert.match(german.shortDescription,/Rollenspiel/);assert.deepEqual(german.genres,['Rollenspiel','Offene Welt']);assert.equal(localizeCuratedGame(source,'en'),source)
})
