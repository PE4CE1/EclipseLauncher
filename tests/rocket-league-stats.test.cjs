const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const loadTs=require('./download-loader.cjs')
const {createRocketLeagueDetector}=loadTs()('electron/rocketLeagueEvents.ts')
const {clipProfileDuration}=loadTs()('src/services/clipProfiles.ts')
const own='Steam|76561198000000001|0',other='Epic|abcdef1234567890abcdef1234567890|0'
const rules={autoClipRocketLeaguePlayerId:own,autoClipRocketLeagueDemos:true}
const packet=(goals=0,saves=0,demos=0)=>({Event:'UpdateState',Data:{MatchGuid:'match-1',Players:[{Name:'Eclipse',PrimaryId:own,TeamNum:0,Goals:goals,Saves:saves,Demos:demos},{Name:'Opponent',PrimaryId:other,TeamNum:1,Goals:9,Saves:9,Demos:9}],Game:{bReplay:false,bHasWinner:false,Winner:'',Teams:[{Name:'Blue',TeamNum:0},{Name:'Orange',TeamNum:1}],Target:{Name:'Opponent',TeamNum:1}}}})
test('official RL snapshots establish a baseline and detect selected player goals/saves/demos',()=>{
  const detect=createRocketLeagueDetector()
  assert.deepEqual(detect(packet(2,3,1),rules).events,[])
  assert.deepEqual(detect(packet(3,3,1),rules).events.map(e=>e.eventType),['goal'])
  assert.deepEqual(detect(packet(3,4,1),rules).events.map(e=>e.eventType),['save'])
  assert.deepEqual(detect(packet(3,4,2),rules).events.map(e=>e.eventType),['demo'])
  assert.deepEqual(detect(packet(3,4,2),rules).events,[])
  const enemy=packet(3,4,2);enemy.Data.Players[1].Goals=40
  assert.deepEqual(detect(enemy,rules).events,[],'Neither enemy counters nor camera target select the local player')
})
test('RL returns bounded player choices and requires exact platform identity',()=>{
  const detect=createRocketLeagueDetector(),snapshot=packet()
  const result=detect(snapshot,{})
  assert.equal(result.valid,true);assert.deepEqual(result.players,[{id:own,name:'Eclipse'},{id:other,name:'Opponent'}]);assert.deepEqual(result.events,[])
  assert.deepEqual(detect(packet(8),{autoClipRocketLeaguePlayerId:'Eclipse'}).events,[])
  assert.deepEqual(detect(packet(8),rules).events,[],'Selecting a player skips their old counters')
  snapshot.Data.Players.push({...snapshot.Data.Players[0]});assert.deepEqual(detect(snapshot,rules).events,[],'Ambiguous IDs cannot trigger events')
})
test('RL uses explicit winner team, never the camera, a draw or mere match end',()=>{
  for(const winner of ['','Orange','Blue']){
    const detect=createRocketLeagueDetector();detect(packet(),rules)
    const end=packet();end.Data.Game.bHasWinner=true;end.Data.Game.Winner=winner
    assert.deepEqual(detect(end,rules).events.map(e=>e.eventType),winner==='Blue'?['win']:[])
    assert.deepEqual(detect(end,rules).events,[])
    assert.deepEqual(createRocketLeagueDetector()(end,rules).events,[])
  }
})
test('RL ignores replay playback, avoids duplicate goal replays and resets between matches',()=>{
  const detect=createRocketLeagueDetector();detect(packet(),rules)
  const replay=packet(1);replay.Data.Game.bReplay=true
  assert.deepEqual(detect(replay,rules).events,[])
  assert.equal(detect(packet(1),rules).events[0].eventType,'goal')
  detect({Event:'ReplayCreated',Data:{MatchGuid:'match-1'}},rules)
  assert.deepEqual(detect(packet(5),rules).events,[])
  detect({Event:'MatchCreated'},rules)
  assert.deepEqual(detect(packet(5),rules).events,[])
  assert.deepEqual(detect(packet(),rules).events,[])
  const next=packet(9);next.Data.MatchGuid='match-2'
  assert.deepEqual(detect(next,rules).events,[])
  detect({Event:'MatchDestroyed'},rules);assert.deepEqual(detect(packet(10),rules).events,[])
})
test('RL respects event switches and handles malformed source data',()=>{
  const detect=createRocketLeagueDetector();detect(packet(),rules)
  assert.deepEqual(detect(packet(1,1,1),{...rules,autoClipRocketLeagueGoals:false,autoClipRocketLeagueSaves:false,autoClipRocketLeagueDemos:false}).events,[])
  assert.deepEqual(detect(packet(1,1,1),rules).events,[])
  for(const change of [p=>p.Data.Players=new Array(17),p=>p.Data.MatchGuid='',p=>p.Data.Players[0].Saves=-1,p=>p.Data.Players[0].TeamNum=255,p=>p.Data.Game.bReplay=undefined]){
    const value=packet();change(value);assert.equal(detect(value,rules).valid,false)
  }
})
test('per-game duration selects Rocket League and Overwatch without changing other games',()=>{
  const options={replayDurationSeconds:30,rocketLeagueClipDurationSeconds:45,overwatchClipDurationSeconds:60}
  assert.equal(clipProfileDuration(options,'Rocket League®'),45)
  assert.equal(clipProfileDuration(options,'OVERWATCH 2'),60)
  assert.equal(clipProfileDuration(options,'Overwatch'),60)
  assert.equal(clipProfileDuration(options,'Counter-Strike 2'),30)
  assert.equal(clipProfileDuration({...options,overwatchClipDurationSeconds:0},'Overwatch 2'),30)
  assert.equal(clipProfileDuration({replayDurationSeconds:NaN},''),30)
})
test('RL client is fixed to loopback, sends no commands, bounds packets and stops reconnecting',async t=>{
  const previous=global.WebSocket,sockets=[],messages=[],states=[]
  class Socket extends EventEmitter{
    constructor(url){super();this.url=url;sockets.push(this)}
    addEventListener(...args){return this.on(...args)}
    close(){if(!this.closed){this.closed=true;this.emit('close')}}
    send(){throw new Error('Commands must never be sent')}
  }
  global.WebSocket=Socket;t.after(()=>global.WebSocket=previous)
  const {connectRocketLeagueStats}=loadTs()('electron/rocketLeagueClient.ts')
  const connection=connectRocketLeagueStats(data=>messages.push(data),state=>states.push(state))
  assert.equal(sockets[0].url,'ws://127.0.0.1:49124')
  sockets[0].emit('open');sockets[0].emit('message',{data:JSON.stringify(packet())})
  sockets[0].emit('message',{data:'bad JSON'});assert.equal(messages.length,1)
  sockets[0].emit('message',{data:'x'.repeat(256*1024+1)});assert.equal(sockets[0].closed,true)
  assert.deepEqual(states,[false]);connection.close()
  sockets[0].emit('message',{data:'{}'});assert.equal(messages.length,1)
})
test('RL transport receives actual WebSocket JSON frames without sending application commands',async t=>{
  const {WebSocketServer}=require('ws'),server=new WebSocketServer({port:0,host:'127.0.0.1'}),original=global.WebSocket
  await new Promise(resolve=>server.once('listening',resolve))
  let commands=0,release
  const received=new Promise(resolve=>release=resolve)
  global.WebSocket=class extends original{constructor(url){assert.equal(url,'ws://127.0.0.1:49124');super(`ws://127.0.0.1:${server.address().port}`)}}
  const client=loadTs()('electron/rocketLeagueClient.ts').connectRocketLeagueStats(release,()=>{})
  t.after(async()=>{client.close();global.WebSocket=original;for(const peer of server.clients)peer.terminate();await new Promise(resolve=>server.close(resolve))})
  server.on('connection',peer=>{peer.on('message',()=>commands++);peer.send(JSON.stringify(packet(1)))})
  const data=await Promise.race([received,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Local fixture connection timed out')),3000);timer.unref()})])
  assert.equal(data.Event,'UpdateState');assert.equal(data.Data.Players[0].Goals,1);assert.equal(commands,0)
})

test('clip detector and HUD share a socket and do not replay an ended match to a new consumer',async t=>{
  const previous=global.WebSocket,sockets=[]
  class Socket extends EventEmitter{constructor(){super();sockets.push(this)}addEventListener(...args){return this.on(...args)}close(){if(!this.closed){this.closed=true;this.emit('close')}}send(){throw Error('No commands allowed')}}
  global.WebSocket=Socket;t.after(()=>global.WebSocket=previous)
  const {subscribeRocketLeagueStats}=loadTs()('electron/rocketLeagueClient.ts'),a=[],b=[],late=[]
  const clip=subscribeRocketLeagueStats(data=>a.push(data),()=>{}),hud=subscribeRocketLeagueStats(data=>b.push(data),()=>{})
  t.after(()=>{clip.close();hud.close()})
  assert.equal(sockets.length,1)
  sockets[0].emit('message',{data:JSON.stringify(packet())})
  assert.equal(a.length,1);assert.equal(b.length,1)
  sockets[0].emit('message',{data:JSON.stringify({Event:'MatchEnded',Data:{MatchGuid:'match-1',WinnerTeamNum:0}})})
  const next=subscribeRocketLeagueStats(data=>late.push(data),()=>{});t.after(next.close)
  await new Promise(resolve=>queueMicrotask(resolve));assert.equal(late.length,0)
  hud.close();assert.equal(sockets[0].closed,undefined,'A clip subscription keeps the transport alive')
  clip.close();assert.equal(sockets[0].closed,undefined)
  next.close();assert.equal(sockets[0].closed,true)
})
