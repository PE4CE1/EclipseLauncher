const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events')
const loadTs=require('./download-loader.cjs')
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(t,options={}){
  const directory=fs.mkdtempSync(path.join(__dirname,'autoclip-life-')),events=[],installs=[],servers=[],clients=[],rocketClients=[]
  let rules={enabled:true,autoClipEnabled:false,autoClipDota2Enabled:true,autoClipLoLEnabled:true,...options.rules}
  const mocks={electron:{app:{getPath:()=>directory,once(){}}},
    './rocketLeagueClient':{subscribeRocketLeagueStats(onData,onConnection){const client={onData,onConnection,closed:false,close(){client.closed=true}};rocketClients.push(client);return client}},
    './autoClipConfig':{installGsiConfiguration:async(game,token,libraries,active)=>{installs.push({game,token,active});return options.install?options.install():{success:true,changed:false}}},
    'node:http':{createServer(handler){const server=new EventEmitter();Object.assign(server,{handler,closed:false,closeAllConnections(){},close(){server.closed=true},listen(port,host,callback){server.port=port;server.host=host;callback()}});servers.push(server);return server}},
    './leagueLiveClient':{createLeagueLiveClient(){const client={closed:false,read:endpoint=>options.read?options.read(endpoint):Promise.resolve(endpoint==='activeplayername'?'Eclipse#EUW':endpoint==='gamestats'?{gameTime:100}:{Events:[]}),close(){client.closed=true}};clients.push(client);return client}}
  }
  const service=loadTs(mocks)('electron/autoClipService.ts')
  const stats=[]
  service.initAutoClipService(()=>({isDestroyed:()=>false,webContents:{send:(channel,payload)=>events.push({channel,payload})}}),()=>rules,()=>options.stats===true,()=>stats.push(true))
  t.after(()=>{service.onGameStoppedAutoClip();assert.ok(directory.startsWith(path.resolve(__dirname)+path.sep));fs.rmSync(directory,{recursive:true,force:true})})
  const request=(server,kills)=>{
    const req=new EventEmitter();req.method='POST';req.url='/';req.headers={}
    const res={writableEnded:false,writeHead(status){this.status=status},end(){this.writableEnded=true}}
    server.handler(req,res)
    req.emit('data',Buffer.from(JSON.stringify({auth:{token:installs.at(-1).token},provider:{appid:730,steamid:'76561198000000001'},player:{steamid:'76561198000000001',activity:'playing',match_stats:{kills,deaths:0,assists:0}},map:{name:'de_test',round:0,phase:'live'}})));req.emit('end')
    return res
  }
  return{service,events,installs,servers,clients,rocketClients,directory,request,stats,setRules:value=>rules={...rules,...value}}
}

test('CS2 overlay shares the GSI listener independently of disabled recording and cannot trigger clips',async t=>{
  const options={stats:true,rules:{enabled:false,autoClipEnabled:false}},f=fixture(t,options)
  f.service.onGameStartedAutoClip('Counter-Strike 2');await flush()
  assert.equal(f.servers.length,1);assert.equal(f.servers[0].host,'127.0.0.1')
  f.request(f.servers[0],0);f.request(f.servers[0],2);assert.equal(f.events.length,0)
  assert.equal(f.stats.length,2,'Authenticated own-player data reaches the overlay while recording is disabled')
  f.setRules({enabled:true,autoClipEnabled:true});f.service.refreshAutoClipSettings();await flush()
  assert.equal(f.servers.length,1,'Enabling auto-clips must reuse the same authenticated GSI listener')
  options.stats=false;f.setRules({autoClipEnabled:false});f.service.refreshAutoClipSettings()
  assert.equal(f.servers[0].closed,true)
})
test('auto-clips stay idle until opted in, read current clip settings, and stop immediately',async t=>{
  const f=fixture(t)
  f.service.onGameStartedAutoClip('Counter-Strike 2');await flush()
  assert.equal(f.installs.length,0);assert.equal(f.servers.length,0)
  assert.deepEqual(fs.readdirSync(f.directory),[],'Initialization must not create configs or tokens')
  f.setRules({autoClipEnabled:true});f.service.refreshAutoClipSettings();await flush()
  assert.equal(f.installs.length,1);assert.equal(f.servers.length,1)
  const server=f.servers[0]
  assert.equal(server.host,'127.0.0.1');assert.equal(server.port,13371)
  assert.equal(f.service.getAutoClipStatus().games.cs2.state,'listening')
  assert.equal(f.request(server,0).status,200);assert.equal(f.service.getAutoClipStatus().games.cs2.state,'connected')
  f.request(server,1);assert.equal(f.events.length,1)
  f.setRules({autoClipCS2Kills:false,autoClipCooldownSeconds:30});f.service.refreshAutoClipSettings();await flush()
  assert.equal(f.servers.length,1,'Event switches must preserve the running connection and baseline')
  assert.equal(server.closed,false);f.request(server,2);assert.equal(f.events.length,1)
  const status=JSON.stringify(f.service.getAutoClipStatus());assert.ok(!status.includes(f.installs[0].token));assert.ok(!status.includes('76561198000000001'))
  f.setRules({autoClipEnabled:false});f.service.refreshAutoClipSettings()
  assert.equal(server.closed,true);assert.equal(f.service.getAutoClipStatus().games.cs2.state,'disabled')
  f.request(server,2);assert.equal(f.events.length,1,'A late request from the old generation cannot trigger')
  f.service.onGameStartedAutoClip('Overwatch 2');await flush()
  assert.equal(f.installs.length,1);assert.equal(f.service.getAutoClipStatus().games.overwatch.state,'manual')
})
test('disabling during asynchronous setup prevents a late listener and install continuation',async t=>{
  let release
  const f=fixture(t,{rules:{autoClipEnabled:true},install:()=>new Promise(resolve=>release=resolve)})
  f.service.onGameStartedAutoClip('Dota 2');assert.equal(f.installs.length,1)
  f.setRules({autoClipEnabled:false});f.service.refreshAutoClipSettings()
  assert.equal(f.installs[0].active(),false)
  release({success:true,changed:true});await flush()
  assert.equal(f.servers.length,0)
})
test('the private GSI token survives service restarts and setup rejects arbitrary games',async t=>{
  const f=fixture(t)
  assert.equal((await f.service.setupAutoClipGame('overwatch')).success,false)
  assert.equal((await f.service.setupAutoClipGame('../game')).success,false)
  assert.equal(f.installs.length,0)
  await f.service.setupAutoClipGame('cs2');const first=f.installs[0].token
  await f.service.setupAutoClipGame('dota2');assert.equal(f.installs[1].token,first)
  const second=loadTs({electron:{app:{getPath:()=>f.directory,once(){}}},'./autoClipConfig':{installGsiConfiguration:async(_game,token)=>{assert.equal(token,first);return{success:true}}}})('electron/autoClipService.ts')
  second.initAutoClipService(()=>null);await second.setupAutoClipGame('cs2')
  assert.match(first,/^[a-f\d]{64}$/)
})
test('League polls only during opt-in play and releases pending reads on game switch',async t=>{
  const releases=[]
  const f=fixture(t,{rules:{autoClipEnabled:true},read:()=>new Promise(resolve=>releases.push(resolve))})
  f.service.onGameStartedAutoClip('League of Legends')
  assert.equal(f.clients.length,1);assert.equal(releases.length,3)
  f.service.onGameStartedAutoClip('Rocket League')
  assert.equal(f.clients[0].closed,true)
  releases[0]('Eclipse#EUW');releases[1]({gameTime:100});releases[2]({Events:[{EventID:1,EventName:'ChampionKill',EventTime:100,KillerName:'Eclipse#EUW'}]});await flush()
  assert.equal(f.events.length,0)
  assert.equal(f.service.getAutoClipStatus().activeGame,'rocket-league')
  assert.equal(f.service.getAutoClipStatus().games['rocket-league'].state,'disabled')
})
test('League reports a real response separately from recording or anti-cheat approval',async t=>{
  const f=fixture(t,{rules:{autoClipEnabled:true}})
  f.service.onGameStartedAutoClip('League of Legends');await flush()
  assert.equal(f.service.getAutoClipStatus().games.lol.state,'connected');assert.equal(f.events.length,0)
  f.setRules({enabled:false});f.service.refreshAutoClipSettings()
  assert.equal(f.clients[0].closed,true);assert.equal(f.service.getAutoClipStatus().games.lol.state,'disabled')
})
test('Rocket League stays opt-in, reads official snapshots, resets after disconnection and stops on game exit',async t=>{
  const f=fixture(t,{rules:{autoClipEnabled:true}}),id='Steam|76561198000000001|0'
  const data=goals=>({Event:'UpdateState',Data:{MatchGuid:'match-1',Players:[{PrimaryId:id,Name:'Eclipse',TeamNum:0,Goals:goals,Saves:0,Demos:0}],Game:{bReplay:false,bHasWinner:false}}})
  f.service.onGameStartedAutoClip('Rocket League');assert.equal(f.rocketClients.length,0)
  f.setRules({autoClipRocketLeagueEnabled:true});f.service.refreshAutoClipSettings()
  assert.equal(f.installs.length,0,'Rocket League must never install mods, config files or GSI')
  const client=f.rocketClients[0];client.onData(data(4))
  assert.equal(f.service.getAutoClipStatus().games['rocket-league'].detail,'select-player')
  assert.equal(f.service.getAutoClipStatus().rocketLeaguePlayers[0].id,id)
  f.setRules({autoClipRocketLeaguePlayerId:id});f.service.refreshAutoClipSettings()
  assert.equal(f.rocketClients.length,1)
  client.onData(data(4));assert.equal(f.events.length,0)
  client.onData(data(5));assert.equal(f.events[0].payload.eventType,'goal')
  client.onConnection(false);assert.equal(f.service.getAutoClipStatus().games['rocket-league'].state,'waiting')
  assert.deepEqual(f.service.getAutoClipStatus().rocketLeaguePlayers,[])
  client.onData(data(10));assert.equal(f.events.length,1,'Reconnect must not replay events missed while disconnected')
  f.service.onGameStoppedAutoClip();assert.equal(client.closed,true)
  client.onData(data(11));assert.equal(f.events.length,1)
})
