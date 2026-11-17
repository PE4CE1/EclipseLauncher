const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')

test('demo suffixes are removed without altering ordinary game titles', () => {
  const {getDemoBaseName} = loadTs({'./steamService':{},'./steamArtwork':{}})('src/services/relatedArtwork.ts')
  assert.equal(getDemoBaseName('Invokyr Demo'), 'Invokyr')
  assert.equal(getDemoBaseName('Screen Stocks — Demo'), 'Screen Stocks')
  assert.equal(getDemoBaseName('Game (Demo)'), 'Game')
  assert.equal(getDemoBaseName('Game Playtest'), 'Game')
  assert.equal(getDemoBaseName('Democracy'), null)
  assert.equal(getDemoBaseName('Demo'), null)
})

test('missing demo artwork uses only the exact matching main game; lookups are coalesced', async () => {
  let searches=0, reads=0
  const module=loadTs({
    './steamService':{searchSteamGames:async name=>{searches++;return[{id:2,name:name+' 2'},{id:3883570,name:'Invokyr™'}]}},
    './steamArtwork':{getSteamArtwork:async id=>{reads++;return{poster:`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/hash/library_capsule.jpg`}}},
  })('src/services/relatedArtwork.ts')
  const results=await Promise.all([module.getRelatedArtwork('Invokyr Demo',4704030),module.getRelatedArtwork('Invokyr Demo',4704030)])
  assert.equal(searches,1)
  assert.ok(results.every(result=>result.appId===3883570&&result.artwork.poster.includes('/3883570/')))
  await module.getRelatedArtwork('Invokyr Demo',4704030)
  assert.equal(searches,1)
  assert.equal(await module.getRelatedArtwork('Invokyr',3883570),null)
  assert.equal(reads,3)
})

test('fuzzy search results and the original demo itself cannot supply unrelated art', async () => {
  const module=loadTs({
    './steamService':{searchSteamGames:async()=>[{id:1,name:'Screen Stocks 2'},{id:2,name:'Screen Stock'}]},
    './steamArtwork':{getSteamArtwork:()=>assert.fail('Unrelated artwork must not be requested')},
  })('src/services/relatedArtwork.ts')
  assert.equal(await module.getRelatedArtwork('Screen Stocks Demo',5124200),null)
})
