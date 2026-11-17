const test=require('node:test')
const assert=require('node:assert/strict')
const load=require('./download-loader.cjs')()
const {createCS2Detector,createDota2Detector,createLoLDetector,autoClipGame}=load('electron/autoClipEvents.ts')
const own='76561198000000001',other='76561198000000002'
const cs=(kills=0,round=0)=>({provider:{appid:730,steamid:own,timestamp:100},player:{steamid:own,activity:'playing',team:'CT',match_stats:{kills},state:{round_kills:1}},map:{name:'de_dust2',mode:'competitive',phase:'live',round},round:{phase:'live'}})
const dota=(kills=0,deaths=0)=>({provider:{appid:570,timestamp:100},player:{steamid:own,activity:'playing',team_name:'radiant',kills,deaths},map:{matchid:'123456789',game_state:'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',win_team:'none'}})
const lol=(events=[],gameTime=100,name='Eclipse#EUW')=>({name,gameTime,events})
const event=(id,type='ChampionKill',fields={})=>({EventID:id,EventName:type,EventTime:100,KillerName:'Eclipse#EUW',VictimName:'Enemy#EUW',...fields})

test('CS2 uses the local playing identity, live map and initial baseline',()=>{
  const detect=createCS2Detector()
  assert.deepEqual(detect(cs(5),{}).events,[])
  assert.equal(detect(cs(6),{}).events[0].eventType,'kill')
  const spectate=cs(99);spectate.player.steamid=other
  assert.equal(detect(spectate,{}).valid,false)
  assert.deepEqual(detect(cs(8),{}).events,[])
  assert.deepEqual(detect(cs(9),{autoClipCS2Kills:false}).events,[])
  assert.deepEqual(detect(cs(9),{}).events,[],'Enabling must not replay an ignored kill')
  for(const invalid of [p=>p.provider.appid=570,p=>p.provider.steamid='',p=>p.player.activity='menu',p=>p.map.phase='warmup',p=>p.player.match_stats.kills=-1]){
    const value=cs(100);invalid(value);assert.equal(createCS2Detector()(value,{}).valid,false)
  }
})
test('CS2 detects aces, round wins once, losses never, and skips old round results',()=>{
  const detect=createCS2Detector(),rules={autoClipCS2Wins:true}
  detect(cs(),rules)
  const ace=cs(5);ace.player.state.round_kills=5
  assert.equal(detect(ace,rules).events[0].eventType,'ace')
  ace.round={phase:'over',win_team:'CT'}
  assert.equal(detect(ace,rules).events[0].eventType,'win')
  assert.deepEqual(detect(ace,rules).events,[])
  const loss=cs(5,1);loss.round={phase:'over',win_team:'T'}
  assert.deepEqual(detect(loss,rules).events,[])
  assert.deepEqual(createCS2Detector()(ace,rules).events,[])
})
test('CS2 ignores stale payloads and resets on counters, maps and match restart',()=>{
  const detect=createCS2Detector();detect(cs(3,3),{})
  const stale=cs(20,3);stale.provider.timestamp=99
  assert.deepEqual(detect(stale,{}).events,[])
  assert.deepEqual(detect(cs(0,0),{}).events,[])
  assert.equal(detect(cs(1,1),{}).events.length,1)
  const map=cs(9,2);map.map.name='de_mirage'
  assert.deepEqual(detect(map,{}).events,[])
})
test('a winning-team field arriving after the end phase is still detected once',()=>{
  const csDetect=createCS2Detector(),csRules={autoClipCS2Wins:true};csDetect(cs(),csRules)
  const round=cs();round.round={phase:'over'}
  assert.deepEqual(csDetect(round,csRules).events,[])
  round.round.win_team='CT';assert.equal(csDetect(round,csRules).events[0].eventType,'win')
  assert.deepEqual(csDetect(round,csRules).events,[])
  const dotaDetect=createDota2Detector();dotaDetect(dota(),{})
  const end=dota();end.map.game_state='DOTA_GAMERULES_STATE_POST_GAME'
  assert.deepEqual(dotaDetect(end,{}).events,[])
  end.map.win_team='radiant';assert.equal(dotaDetect(end,{}).events[0].eventType,'win')
  assert.deepEqual(dotaDetect(end,{}).events,[])
})
test('Dota own kills/deaths require a real local playing state and match',()=>{
  const detect=createDota2Detector();assert.deepEqual(detect(dota(4,2),{}).events,[])
  assert.equal(detect(dota(5,2),{}).events[0].eventType,'kill')
  assert.deepEqual(detect(dota(5,3),{}).events,[])
  assert.equal(detect(dota(5,4),{autoClipDota2Deaths:true}).events[0].eventType,'death')
  for(const invalid of [p=>p.provider.appid=730,p=>p.player.activity='menu',p=>p.player={team2:{player0:p.player}},p=>p.map.matchid='0',p=>p.provider.steamid=other,p=>p.player.deaths=NaN]){
    const value=dota(50);invalid(value);assert.equal(createDota2Detector()(value,{}).valid,false)
  }
})
test('Dota wins require an explicit winning side, never mere match end',()=>{
  for(const winner of ['none','dire','radiant']){
    const detect=createDota2Detector();detect(dota(),{})
    const end=dota();end.map.game_state='DOTA_GAMERULES_STATE_POST_GAME';end.map.win_team=winner
    assert.deepEqual(detect(end,{}).events.map(e=>e.eventType),winner==='radiant'?['win']:[])
    assert.deepEqual(detect(end,{}).events,[])
    assert.deepEqual(createDota2Detector()(end,{}).events,[])
  }
})
test('Dota resets between matches and filters old packets',()=>{
  const detect=createDota2Detector();detect(dota(3),{})
  const stale=dota(8);stale.provider.timestamp=99
  assert.deepEqual(detect(stale,{}).events,[])
  const next=dota(8);next.map.matchid='123456790'
  assert.deepEqual(detect(next,{}).events,[])
  next.player.kills=9;assert.equal(detect(next,{}).events.length,1)
})
test('League skips historical events and matches full Riot IDs without confusing opponents',()=>{
  const detect=createLoLDetector()
  const history=[event(0),event(1)]
  assert.deepEqual(detect(lol(history),{}).events,[])
  const enemy=event(2,'ChampionKill',{KillerName:'Eclipse#NA'})
  assert.deepEqual(detect(lol([...history,enemy]),{}).events,[])
  const ownEvent=event(3)
  assert.equal(detect(lol([...history,enemy,ownEvent],101),{}).events[0].eventType,'kill')
  assert.deepEqual(detect(lol([...history,enemy,ownEvent],102),{}).events,[])
})
test('League multi-kills, deaths and reported wins respect individual settings',()=>{
  const detect=createLoLDetector();detect(lol(),{})
  assert.equal(detect(lol([event(1,'Multikill',{KillStreak:5})]),{}).events[0].title,'Pentakill')
  assert.deepEqual(detect(lol([event(2,'ChampionKill',{KillerName:'Enemy#EUW',VictimName:'Eclipse#EUW'})]),{}).events,[])
  assert.equal(detect(lol([event(3,'ChampionKill',{KillerName:'Enemy#EUW',VictimName:'Eclipse#EUW'})]),{autoClipLoLDeaths:true}).events[0].eventType,'death')
  assert.deepEqual(detect(lol([event(4,'GameEnd',{Result:'Lose'})]),{}).events,[])
  assert.deepEqual(detect(lol([event(5,'GameEnd')]),{}).events,[])
  assert.equal(detect(lol([event(6,'GameEnd',{Result:'Win'})]),{}).events[0].eventType,'win')
  assert.deepEqual(detect(lol([event(7)]),{autoClipLoLKills:false}).events,[])
})
test('League reconnects discard old events, handles resets and bounded malformed data',()=>{
  const detect=createLoLDetector();detect(lol([event(50)]),{})
  assert.deepEqual(detect(lol([event(51,'ChampionKill',{EventTime:80})],100),{}).events,[])
  assert.deepEqual(detect(lol([event(52,'ChampionKill',{EventTime:120})],100),{}).events,[])
  assert.deepEqual(detect(lol([event(0,'GameStart',{EventTime:0})],0),{}).events,[])
  assert.equal(detect(lol([event(1,'ChampionKill',{EventTime:5})],5),{}).events.length,1)
  for(const bad of [{name:null,gameTime:2,events:[]},lol([],NaN),lol(new Array(5001)),lol(null)])assert.equal(detect(bad,{}).valid,false)
})
test('game aliases distinguish automatic adapters and manual-only games',()=>{
  assert.equal(autoClipGame('Rocket League®'),'rocket-league')
  assert.equal(autoClipGame('Overwatch 2'),'overwatch')
  assert.equal(autoClipGame('CS2'),'cs2')
  assert.equal(autoClipGame('Counter-Strike: Global Offensive'),'cs2')
  assert.equal(autoClipGame('League of Legends'),'lol')
  assert.equal(autoClipGame('Dota 2'),'dota2')
  assert.equal(autoClipGame('Not Counter-Strike 2'),null)
})
