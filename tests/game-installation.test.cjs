const test=require('node:test')
const assert=require('node:assert/strict')
const loadTs=require('./download-loader.cjs')
const {isLocallyInstalled,matchesGame,findInstalledGame}=loadTs()('src/services/gameInstallation.ts')

test('ownership and install links cannot mark an uninstalled game as local',()=>{
  const owned={id:'steam_730',steamId:730,name:'Counter-Strike 2',installed:false,installPath:'',launchUrl:'steam://install/730'}
  assert.equal(isLocallyInstalled(owned),false)
  assert.equal(findInstalledGame([owned],{steamId:730,name:'Counter-Strike 2'}),undefined)
  assert.equal(isLocallyInstalled({...owned,installPath:'C:/Stale'}),false)
})
test('explicit installations and legacy local paths remain valid',()=>{
  assert.equal(isLocallyInstalled({installed:true}),true)
  assert.equal(isLocallyInstalled({installPath:'C:/Games/Local'}),true)
  assert.equal(isLocallyInstalled({launchUrl:'steam://run/730'}),false)
})
test('different Steam IDs cannot match through a shared title',()=>{
  assert.equal(matchesGame({steamId:1,name:'Game'},{steamId:2,name:'Game'}),false)
  assert.equal(matchesGame({id:'steam_730',name:'Old title'},{steamId:730,name:'Counter-Strike 2'}),true)
})
test('prefixes and demos cannot mark another title as installed',()=>{
  assert.equal(matchesGame({name:'ELDEN RING Demo'},{name:'ELDEN RING'}),false)
  assert.equal(matchesGame({name:'Counter-Strike Source'},{name:'Counter-Strike 2'}),false)
  assert.equal(matchesGame({name:''},{name:''}),false)
})
test('exact normalized legacy names work without numeric identity',()=>{
  assert.equal(matchesGame({name:'  Rocket League® '},{name:'Rocket League'}),true)
  assert.equal(matchesGame({name:'東京'},{name:'大阪'}),false)
})
