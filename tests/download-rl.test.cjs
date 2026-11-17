const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const own='Epic|0123456789abcdef0123456789abcdef|0'
test('RL service uses official data, keeps playlist state and drops detached subscriptions',t=>{
  const clients=[],events=[]
  const service=load({electron:{app:{getPath:()=>'/isolated'}},'node:fs':{statSync(){throw Error('No game files')}},'./rocketLeagueClient':{subscribeRocketLeagueStats(data,connection){const client={data,connection,closed:false,close(){client.closed=true}};clients.push(client);return client}}})('electron/rlService.ts')
  t.after(service.stopRLService)
  service.configureRLService({rlPlayerId:own,rlPlaylist:'2v2'});service.startRLService(data=>events.push(data))
  assert.equal(clients.length,1);clients[0].connection(true)
  clients[0].data({Event:'UpdateState',Data:{MatchGuid:'m',Players:[{PrimaryId:own,Name:'Fixture',TeamNum:0}],Game:{bReplay:false,bHasWinner:false,PlaylistId:11}}})
  clients[0].data({Event:'MatchEnded',Data:{MatchGuid:'m',WinnerTeamNum:0}})
  assert.equal(service.getRLState().sessionWins,1);assert.equal(service.getRLState().mmr,null)
  service.setRLPlaylist('1v1');assert.equal(service.getRLState().sessionWins,0);service.setRLPlaylist('2v2');assert.equal(service.getRLState().sessionWins,1)
  service.stopRLService();assert.equal(clients[0].closed,true)
  clients[0].data({Event:'MatchEnded',Data:{MatchGuid:'m',WinnerTeamNum:1}});assert.equal(service.getRLState().sessionLosses,0)
  service.startRLService(data=>events.push(data),'2v2');assert.equal(service.getRLState().sessionWins,1)
  service.resetRLSession();assert.equal(service.getRLState().sessionWins,0)
})
