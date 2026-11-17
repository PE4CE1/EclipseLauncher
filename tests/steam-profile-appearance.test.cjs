const test=require('node:test'),assert=require('node:assert/strict')
const {steamFrameImage,readSteamAvatarFrame,profileAvatarFrameValue}=require('./download-loader.cjs')()('src/services/steamProfileAppearance.ts')
const animated='https://shared.fastly.steamstatic.com/community_assets/images/items/570/frame.png'
const still='https://shared.fastly.steamstatic.com/community_assets/images/items/570/frame_still.png'
const image=value=>({getAttribute:()=>value})
test('Steam is the default for fresh and legacy profiles while explicit choices remain selected',()=>{
  assert.equal(profileAvatarFrameValue({}),'steam')
  assert.equal(profileAvatarFrameValue({avatarFrame:'none'}),'steam')
  assert.equal(profileAvatarFrameValue({avatarFrame:'none',profileAvatarFrameSelected:true}),'none')
  assert.equal(profileAvatarFrameValue({avatarFrame:'steam',profileAvatarFrameSelected:true}),'steam')
  assert.equal(profileAvatarFrameValue({avatarFrame:'cyberpunk'}),'cyberpunk')
})
function documentWithFrame(frame){return{querySelector:selector=>selector==='.profile_header .playerAvatar'?{querySelector:()=>frame}:null}}
test('equipped frame is extracted from the own profile avatar with its reduced-motion source',()=>{
  const frame={querySelector:selector=>selector==='img'?image(animated):image(still+' 1x')}
  assert.deepEqual(readSteamAvatarFrame(documentWithFrame(frame)),{steamAvatarFrameUrl:animated,steamAvatarFrameStaticUrl:still})
})
test('an unequipped frame clears cached graphics; error pages do not erase known data',()=>{
  assert.deepEqual(readSteamAvatarFrame(documentWithFrame(null)),{steamAvatarFrameUrl:null,steamAvatarFrameStaticUrl:null})
  assert.deepEqual(readSteamAvatarFrame({querySelector:()=>null}),{})
  assert.deepEqual(readSteamAvatarFrame(documentWithFrame({querySelector:()=>image('javascript:alert(1)')})),{})
})
test('frame assets are restricted to Steam item images on known HTTPS CDNs',()=>{
  assert.equal(steamFrameImage(animated),animated)
  assert.equal(steamFrameImage('//shared.fastly.steamstatic.com/community_assets/images/items/570/frame.png'),animated)
  assert.equal(steamFrameImage('https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/items/570/frame.png'),'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/items/570/frame.png')
  for(const url of ['https://evil.invalid/frame.png','https://shared.fastly.steamstatic.com.evil.invalid/community_assets/images/items/570/frame.png','http://shared.fastly.steamstatic.com/community_assets/images/items/570/frame.png','https://a:b@shared.fastly.steamstatic.com/community_assets/images/items/570/frame.png','https://shared.fastly.steamstatic.com/community_assets/images/items/570/script.svg','https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/header.jpg','file:///C:/frame.png',null,{},7])assert.equal(steamFrameImage(url),undefined)
})
