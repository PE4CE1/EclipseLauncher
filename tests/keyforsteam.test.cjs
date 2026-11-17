const test=require('node:test'),assert=require('node:assert/strict'),loadTs=require('./download-loader.cjs'),fixture=require('./keyforsteam-fixture.cjs')
test('comparison identity is exact and PC-only; editions and sequels never collapse into a base game',()=>{
  const {findComparisonPage,normalizeDealTitle,cleanGameTitleForKeyforsteam,comparisonUrl}=loadTs()('src/services/keyforsteamData.ts')
  assert.match(findComparisonPage(fixture.search,'Cyberpunk™ 2077'),/key-kaufen/)
  assert.equal(findComparisonPage(fixture.search,'Cyberpunk 2077 Phantom Liberty'),undefined)
  assert.notEqual(normalizeDealTitle('Game 2'),normalizeDealTitle('Game'))
  assert.notEqual(normalizeDealTitle('Game Remastered'),normalizeDealTitle('Game'))
  assert.match(cleanGameTitleForKeyforsteam('Game - Deluxe Edition (Steam)'),/Deluxe/)
  for(const url of ['javascript:alert(1)','https://www.keyforsteam.de.evil.test/game','https://user:pass@www.keyforsteam.de/game'])assert.equal(comparisonUrl(url),undefined)
})
test('offers retain actual coupon-inclusive prices, fees, platform, edition, type and exact redirect ID',()=>{
  const data=loadTs()('src/services/keyforsteamData.ts'),deals=data.parseComparisonPage(fixture.page(),'Cyberpunk 2077','EUR',40,'en')
  const first=deals.find(d=>d.offerId===101)
  assert.equal(first.price,22,'Card fees are included; the already included 10% coupon is not subtracted again')
  assert.equal(first.basePrice,20);assert.equal(first.paypalPrice,23);assert.equal(first.savingsPercent,45)
  const url=new URL(first.dealUrl);assert.equal(url.pathname,'/redirection/offer/eur/101');assert.equal(url.searchParams.get('merchant'),'61');assert.equal(url.searchParams.get('coupon'),'LIVE10')
  assert.equal(deals.find(d=>d.offerId===102).offerType,'account')
  assert.equal(deals.find(d=>d.offerId===103).platform,'gog')
  assert.equal(deals.find(d=>d.offerId===103).retailPrice,0,'GOG must not use a Steam baseline')
  assert.equal(deals.find(d=>d.offerId===104).defaultEdition,false)
  assert.equal(deals.find(d=>d.offerId===105).compatibleRegion,false)
  assert.equal(deals.find(d=>d.offerId===107).offerType,'gift')
})
test('malformed, out-of-stock and unverified offers are excluded; wrong currency and wrong game fail closed',()=>{
  const {parseComparisonPage,assignedJson}=loadTs()('src/services/keyforsteamData.ts')
  const value={...fixture.data,prices:[fixture.product(1),fixture.product(1),fixture.product(2,{price:-1}),fixture.product(3,{dispo:0}),fixture.product(4,{account:undefined}),fixture.product(5,{merchant:999}),fixture.product(6,{activationPlatform:'ps5'})]}
  assert.deepEqual(parseComparisonPage(fixture.page('eur','Cyberpunk 2077',value),'Cyberpunk 2077','EUR',40,'en').map(d=>d.offerId),[1])
  assert.throws(()=>parseComparisonPage(fixture.page(),'Cyberpunk 2','EUR',40,'en'),/match/)
  assert.throws(()=>parseComparisonPage(fixture.page(),'Cyberpunk 2077','USD',40,'en'),/currency/)
  assert.deepEqual(assignedJson('var x={"text":"} \\\" nested", "nested":{"a":2}};evil()','x'),{text:'} " nested',nested:{a:2}})
  assert.throws(()=>assignedJson('var x = { price: 1 };','x'))
})
test('cheapest Steam-key badge excludes accounts, gifts, wrong platforms, restricted regions, other editions and unconfirmed prices',()=>{
  const load=loadTs(),{parseComparisonPage}=load('src/services/keyforsteamData.ts'),{getCheapestKeyDeal}=load('src/services/keyforsteamService.ts')
  const deals=parseComparisonPage(fixture.page(),'Cyberpunk 2077','EUR',40,'en')
  assert.equal(getCheapestKeyDeal(deals).offerId,101)
  assert.equal(getCheapestKeyDeal(deals.map(d=>({...d,hasConfirmedPrice:false}))),null)
})
test('live retrieval uses fresh Steam identity, exact product search and the provider USD page without currency conversion',async()=>{
  const calls=[]
  const {fetchGamePriceComparison}=loadTs({'./httpClient':{desktopFetch:async(url,options)=>{
    options.signal.throwIfAborted();const u=new URL(url);calls.push(u)
    if(u.pathname.includes('appdetails')){assert.equal(u.searchParams.get('cc'),'US');return Response.json({'1091500':{success:true,data:{steam_appid:1091500,name:'Cyberpunk 2077',price_overview:{currency:'USD',final:3999}}}})}
    if(u.pathname.includes('admin-ajax')){assert.equal(u.searchParams.get('search_name'),'Cyberpunk 2077');return Response.json(fixture.search)}
    return new Response(fixture.page(u.hostname==='www.allkeyshop.com'?'usd':'eur'))
  }}})('src/services/keyforsteamService.ts')
  const result=await fetchGamePriceComparison('Wrong selected name',1091500,'USD','de','en')
  assert.equal(calls.length,4);assert.equal(result.gameName,'Cyberpunk 2077');assert.equal(result.deals.find(d=>d.offerId===101).price,22);assert.match(result.deals[0].dealUrl,/\/usd\//)
  assert.equal(result.deals.find(d=>d.storeId==='steam').price,39.99)
})
test('failed sources, cancellation and unrelated results never fabricate shop prices',async()=>{
  const controller=new AbortController();controller.abort()
  const {fetchGamePriceComparison}=loadTs({'./httpClient':{desktopFetch:()=>assert.fail('No aborted request')}})('src/services/keyforsteamService.ts')
  await assert.rejects(fetchGamePriceComparison('Game',undefined,'EUR','de','en',controller.signal),{name:'AbortError'})
  const empty=loadTs({'./httpClient':{desktopFetch:async()=>Response.json({results:''})}})('src/services/keyforsteamService.ts')
  assert.deepEqual((await empty.fetchGamePriceComparison('Unknown title')).deals,[])
  const bad=loadTs({'./httpClient':{desktopFetch:async()=>new Response('',{status:503})}})('src/services/keyforsteamService.ts')
  await assert.rejects(bad.fetchGamePriceComparison('Game'),/unavailable/)
})
