const test = require('node:test'), assert = require('node:assert/strict'), loadTs = require('./download-loader.cjs')
test('home discovery accepts app categories, validates prices and never labels unknown upcoming prices free', () => {
  const { parseHomeStoreFeed } = loadTs()('src/services/homeDiscovery.ts')
  const item = { id:42,type:0,name:'Example',currency:'EUR',original_price:1999,final_price:999,discount_percent:50,header_image:'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/42/header.jpg' }
  const result = parseHomeStoreFeed({new_releases:{items:[item,item,{...item,id:43,type:1},{...item,id:0},{...item,id:44,name:''},{...item,id:45,header_image:'javascript:evil()',final_price:NaN}]},coming_soon:{items:[{...item,id:50,final_price:0,original_price:0}]}},'de-DE')
  assert.deepEqual(result.releases.map(game=>game.steamId),[42,45])
  assert.match(result.releases[0].priceFormatted,/9,99/)
  assert.equal(result.releases[1].headerImage,undefined)
  assert.equal(result.releases[1].priceFormatted,undefined)
  assert.equal(result.upcoming[0].isFree,false)
  assert.deepEqual(parseHomeStoreFeed(null,'en-US'),{releases:[],specials:[],upcoming:[],sellers:[]})
})
test('home discovery limits rows and never fabricates discounts or prices for missing fields', () => {
  const { parseHomeStoreFeed } = loadTs()('src/services/homeDiscovery.ts')
  const items=Array.from({length:100},(_,i)=>({id:i+1,type:0,name:'Game '+i,discount_percent:200,header_image:'https://steamstatic.com.evil.example/image'}))
  const result=parseHomeStoreFeed({new_releases:{items},specials:{items}},'en-US')
  assert.equal(result.releases.length,30);assert.equal(result.specials.length,40)
  assert.equal(result.releases[0].discountPercent,100)
  assert.equal(result.releases[0].priceFormatted,undefined)
  assert.equal(result.releases[0].headerImage,undefined)
})
test('home news prioritizes a recent official major update and excludes old or future articles', () => {
  const { pickHomeNews }=loadTs()('src/services/homeDiscovery.ts'),now=1_800_000_000
  const item=(id,date)=>({id,date,title:id,contents:'',url:'https://store.steampowered.com/'})
  const news=[item('future',now+86400),item('old',now-100*86400),item('new',now-100),item('major',now-86400)]
  assert.equal(pickHomeNews(news,[{id:'major',type:14}],now).id,'major')
  assert.equal(pickHomeNews(news,[],now).id,'new')
  assert.equal(pickHomeNews(news.slice(0,2),[],now),undefined)
})

test('home language changes retain the detail-page store region and pass cancellation to the request', async () => {
  const calls=[]
  const {fetchHomeStoreFeed}=loadTs({'./httpClient':{desktopFetch:async(url,options)=>{calls.push({url:new URL(url),signal:options.signal});return Response.json({new_releases:{items:[{id:1,type:0,name:'Fixture'}]}})}}})('src/services/homeDiscovery.ts')
  const controller=new AbortController()
  await fetchHomeStoreFeed('en',controller.signal)
  assert.equal(calls[0].url.searchParams.get('cc'),'DE')
  assert.equal(calls[0].url.searchParams.get('l'),'english')
  controller.abort()
  assert.equal(calls[0].signal.aborted,true)
})
