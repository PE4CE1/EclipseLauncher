const test = require('node:test'), assert = require('node:assert/strict')
const load = require('./download-loader.cjs')()
const { buildProfileGames, publicProfileStats, resolvePinnedGames, profileGameKey, formatProfileTime, safeProfileMedia, profileSocialUrl } = load('src/services/profileModel.ts')
const library = [
  { id:'old-portal', steamId:620, name:'Portal 2', platform:'steam', installed:true, addedAt:0, playTimeMinutes:120, lastPlayed:100 },
  { id:'cs2', steamId:730, name:'Counter-Strike 2', platform:'steam', installed:true, addedAt:0, playTimeMinutes:180, lastPlayed:200 },
  { id:'bad', name:'Broken data', platform:'custom', installed:false, addedAt:0, playTimeMinutes:NaN, lastPlayed:-1 },
]
const installed = [{ id:'steam-620', appId:'620', name:'Portal 2', platform:'steam', installPath:'C:/private/Portal', launchUrl:'steam://620', playTimeMinutes:90, lastPlayed:300 }]
test('profile merges Steam aliases once, preserves maximum playtime and trusts scanned installations', () => {
  const games=buildProfileGames(library,installed)
  assert.equal(games.length,3)
  const portal=games.find(game=>game.steamId===620)
  assert.equal(portal.playTimeMinutes,120);assert.equal(portal.lastPlayed,300);assert.equal(portal.installed,true)
  assert.equal(games.find(game=>game.steamId===730).installed,false,'stale library installed flags do not create phantom installations')
  assert.equal(games.find(game=>game.id==='bad').playTimeMinutes,0)
  assert.equal(games.find(game=>game.id==='bad').lastPlayed,0)
  assert.equal(games.reduce((sum,game)=>sum+game.playTimeMinutes,0),300)
})
test('pins are stable across scanner IDs, deduplicated and limited to three valid selections', () => {
  const games=buildProfileGames(library,installed),key=profileGameKey(games[0])
  assert.equal(key,'steam:620')
  assert.deepEqual(resolvePinnedGames(games,[key,key,'steam:730']).map(game=>game.steamId),[620,730])
  assert.deepEqual(resolvePinnedGames(games,['missing']),[])
})
test('published profile respects playtime privacy and excludes local installation paths and URLs', () => {
  const games=buildProfileGames(library,installed),data=publicProfileStats({profilePinnedGames:['steam:620'],profileShowPlaytime:false,profileShowSteamStats:false},games)
  assert.equal(data.showPlaytime,false);assert.equal(data.showSteamStats,false)
  assert.equal(data.totalPlaytimeMins,null);assert.equal(data.totalPlaytimeHours,null)
  assert.deepEqual(data.topPlayedGames,[])
  assert.equal(data.pinnedGames[0].playTimeMinutes,0);assert.equal(data.pinnedGames[0].lastPlayed,0)
  assert.equal(data.totalLibraryCount,3);assert.equal(data.totalInstalledCount,1)
  assert.doesNotMatch(JSON.stringify(data),/private|installPath|launchUrl/)
})
test('public profile and local profile use the same true playtime totals', () => {
  const data=publicProfileStats({},buildProfileGames(library,installed))
  assert.equal(data.totalPlaytimeMins,300);assert.equal(data.totalPlaytimeHours,'5.0h')
  assert.equal(data.topPlayedGames[0].steamId,730)
  assert.equal(formatProfileTime(90,'de'),'1,5 Std.');assert.equal(formatProfileTime(90,'en'),'1.5 hrs')
  assert.equal(formatProfileTime(Infinity,'de'),'0 Min.')
})
test('profile media and social links do not accept executable URLs or off-service links', () => {
  for(const url of ['javascript:alert(1)','file:///C:/secret','https://user:pass@evil.com/a','data:text/html,<script>'])assert.equal(safeProfileMedia(url),undefined)
  assert.equal(safeProfileMedia('https://example.com/photo.png'),'https://example.com/photo.png')
  assert.equal(profileSocialUrl('https://evil.com/player','twitch'),undefined)
  assert.equal(profileSocialUrl('https://twitch.tv.evil.com/player','twitch'),undefined)
  assert.equal(profileSocialUrl('https://a:b@twitch.tv/player','twitch'),undefined)
  assert.equal(profileSocialUrl('@player','twitch'),'https://twitch.tv/player')
  assert.equal(profileSocialUrl('https://www.youtube.com/@player','youtube'),'https://www.youtube.com/@player')
  assert.equal(profileSocialUrl('76561198000000000','steam'),'https://steamcommunity.com/profiles/76561198000000000')
})
