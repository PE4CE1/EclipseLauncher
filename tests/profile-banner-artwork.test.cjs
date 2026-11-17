const test=require('node:test'),assert=require('node:assert/strict'),createLoader=require('./download-loader.cjs')
const game={id:'steam-252950',name:'Rocket League',platform:'steam',steamId:252950}
test('profile banners prefer full-size hero metadata over small store headers',async()=>{
  const url='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/library_hero.jpg'
  const {resolveProfileBannerArtwork}=createLoader({'./steamArtwork':{getSteamArtwork:async()=>({hero:url})},'./libraryArtwork':{resolveLibraryArtwork:()=>{throw Error('Must not use a thumbnail when a hero exists')}}})('src/services/profileBannerArtwork.ts')
  assert.equal(await resolveProfileBannerArtwork(game),url)
})
test('missing metadata probes the legacy full-size hero before falling back to a header',async t=>{
  const previous=global.window; t.after(()=>global.window=previous)
  const probes=[];global.window={electronAPI:{prefetchArtwork:async request=>{probes.push(request.url);return true}}}
  const {resolveProfileBannerArtwork}=createLoader({'./steamArtwork':{getSteamArtwork:async()=>null},'./libraryArtwork':{resolveLibraryArtwork:async()=>({url:'header.jpg'})}})('src/services/profileBannerArtwork.ts')
  assert.match(await resolveProfileBannerArtwork(game),/library_hero\.jpg$/)
  assert.equal(probes.length,1)
})
test('missing heroes fall back to real artwork; generated placeholders cannot become profile banners',async t=>{
  const previous=global.window;t.after(()=>global.window=previous)
  global.window={electronAPI:{prefetchArtwork:async()=>false}}
  let fallback=false
  const {resolveProfileBannerArtwork}=createLoader({'./steamArtwork':{getSteamArtwork:async()=>null},'./libraryArtwork':{resolveLibraryArtwork:async()=>({url:fallback?'placeholder':'header.jpg',fallback})}})('src/services/profileBannerArtwork.ts')
  assert.equal(await resolveProfileBannerArtwork(game),'header.jpg')
  fallback=true;assert.equal(await resolveProfileBannerArtwork(game),undefined)
})
