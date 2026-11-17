const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),load=require('./download-loader.cjs')
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function fixture(t){
  const children=[]
  const {MediaTransport}=load({electron:{app:{getAppPath:()=> 'C:/eclipse/resources/app.asar'}},'node:fs':{existsSync:file=>file.includes('app.asar.unpacked')},'node:child_process':{spawn:(file,args,options)=>{
    assert.match(file,/MediaSessionHost\.exe$/);assert.equal(options.windowsHide,true)
    assert.ok(file.includes('app.asar.unpacked'),'Packaged builds must launch the unpacked native helper')
    assert.deepEqual(args,[],'Media sessions must not start a PowerShell runtime')
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.commands=[]
    child.stdin.on('data',bytes=>child.commands.push(String(bytes).trim().split(' ')))
    child.kill=()=>{child.killed=true;child.emit('close',0)};children.push(child);return child
  }}})('electron/mediaTransport.ts')
  const client=new MediaTransport();t.after(()=>client.stop())
  return{client,children,reply:(child,value)=>child.stdout.write('JSON:'+JSON.stringify(value)+'\n')}
}
test('media commands wait for cold startup and serialize against the selected session',async t=>{
  const f=fixture(t),first=f.client.send('GET','spotify'),second=f.client.send('TOGGLE','spotify','Spotify.Session')
  await flush();assert.equal(f.children.length,1);const child=f.children[0]
  assert.equal(child.commands.length,0)
  child.stdout.write('READY\n');await flush()
  assert.equal(child.commands.length,1);assert.deepEqual(child.commands[0].slice(1),['GET','spotify','-'])
  f.reply(child,{Id:999,Success:true});await flush();assert.equal(child.commands.length,1,'Unrelated response IDs must not satisfy a request')
  f.reply(child,{Id:Number(child.commands[0][0]),Success:true,App:'spotify'});assert.equal((await first).App,'spotify');await flush()
  assert.equal(child.commands.length,2);assert.equal(Buffer.from(child.commands[1][3],'base64').toString(),'Spotify.Session')
  f.reply(child,{Id:Number(child.commands[1][0]),Success:false});assert.equal((await second).Success,false)
})

test('a missing native media helper fails without starting PowerShell or emitting media keys',async()=>{
  const {MediaTransport}=load({electron:{app:{getAppPath:()=>'/missing/app.asar'}},'node:fs':{existsSync:()=>false},'node:child_process':{spawn:()=>assert.fail('Missing helpers must not start another runtime')}})('electron/mediaTransport.ts')
  const client=new MediaTransport()
  try{assert.equal(await client.send('GET','spotify'),null)}finally{client.stop()}
})
test('media protocol preserves split UTF-8 metadata and rejects late replies after timeout',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t),first=f.client.send('GET');await flush();const child=f.children[0]
  child.stdout.write('READY\n');await flush()
  const data=Buffer.from('JSON:'+JSON.stringify({Id:Number(child.commands[0][0]),Success:true,Title:'Grüße 🎵'})+'\n'),split=data.indexOf(Buffer.from('ü'))+1
  child.stdout.write(data.subarray(0,split));child.stdout.write(data.subarray(split))
  assert.equal((await first).Title,'Grüße 🎵')
  const timed=f.client.send('GET');await flush();t.mock.timers.tick(5500);await flush()
  assert.equal(await timed,null);assert.equal(child.killed,true)
  const next=f.client.send('GET');await flush();const fresh=f.children[1]
  fresh.stdout.write('READY\n');await flush();f.reply(child,{Id:Number(fresh.commands[0][0]),Success:true,Title:'Stale'})
  f.reply(fresh,{Id:Number(fresh.commands[0][0]),Success:true,Title:'Current'})
  assert.equal((await next).Title,'Current')
})
test('suspending media cancels startup and queued controls without restarting an unused helper',async t=>{
  const f=fixture(t),get=f.client.send('GET'),toggle=f.client.send('TOGGLE','spotify')
  await flush();f.client.suspend();assert.equal(await get,null);assert.equal(await toggle,null)
  assert.equal(f.children.length,1);assert.equal(f.children[0].commands.length,0);assert.equal(f.children[0].killed,true)
})

function coordinator(){
  const requests=[],replies=[]
  const service=load({electron:{BrowserWindow:{}},'./ipcSecurity':{ipcMain:{}},'./mediaTransport':{mediaFilter:v=>v==='spotify'||v==='youtube'?v:'all',MediaTransport:class{send(...args){requests.push(args);return Promise.resolve(replies.shift())}stop(){}suspend(){}}}})('electron/mediaCoordinator.ts')
  return{service,requests,replies}
}
test('closed or mismatched Spotify sessions clear metadata and never reuse another track cover',async t=>{
  t.mock.timers.enable({apis:['Date']})
  const f=coordinator(),cover='data:image/png;base64,aGVsbG8='
  f.replies.push({Success:true,App:'spotify',SessionId:'spotify',Title:'One',Artist:'Artist',HasCover:true,Cover:cover})
  assert.equal((await f.service.detectActiveMedia('spotify')).coverUrl,cover)
  t.mock.timers.tick(251)
  f.replies.push({Success:true,App:'spotify',SessionId:'spotify',Title:'Two',HasCover:false})
  assert.equal((await f.service.detectActiveMedia('spotify')).coverUrl,undefined)
  t.mock.timers.tick(251)
  f.replies.push({Success:true,App:null,SessionId:''})
  assert.deepEqual(await f.service.detectActiveMedia('spotify'),{isPlaying:false,title:'',artist:'',app:null})
  t.mock.timers.tick(251)
  f.replies.push({Success:true,App:'browser',SessionId:'browser',Title:'Unrelated video'})
  assert.equal((await f.service.detectActiveMedia('spotify')).app,null)
})

test('simultaneous media reads share one request and unchanged snapshots retain identity',async t=>{
  t.mock.timers.enable({apis:['Date']})
  const f=coordinator(),reply={Success:true,App:'spotify',SessionId:'spotify',Title:'Track',IsPlaying:true,Controls:{playPause:true,next:true,previous:true}}
  f.replies.push(reply)
  const first=f.service.detectActiveMedia('spotify'),second=f.service.detectActiveMedia('spotify')
  assert.equal(f.requests.length,1)
  const state=await first
  assert.equal(await second,state)
  assert.equal(await f.service.detectActiveMedia('spotify'),state)
  assert.equal(f.requests.length,1,'Startup subscribe/filter/status must share the recent sample')
  t.mock.timers.tick(251);f.replies.push({...reply,Controls:{...reply.Controls}})
  assert.equal(await f.service.detectActiveMedia('spotify'),state)
  assert.equal(f.requests.length,2)
  f.replies.push({...reply,Success:true,IsPlaying:false})
  await f.service.mediaToggle(undefined,'spotify')
  f.replies.push({...reply,IsPlaying:false})
  assert.equal((await f.service.detectActiveMedia('spotify')).isPlaying,false)
  assert.equal(f.requests.length,4,'Controls invalidate the short status cache immediately')
})
test('status queries do not redirect controls away from the displayed Spotify session',async()=>{
  const f=coordinator();f.service.setPreferredMediaFilter('spotify')
  f.replies.push({Success:true,App:'spotify',SessionId:'spotify-session',Title:'Track'})
  await f.service.detectActiveMedia('spotify')
  f.replies.push({Success:true,App:'browser',SessionId:'browser-session',Title:'Video'})
  await f.service.detectActiveMedia('all')
  f.replies.push({Success:false,App:null,SessionId:''})
  assert.equal((await f.service.mediaToggle()).success,false)
  assert.deepEqual(f.requests.at(-1),['TOGGLE','spotify','spotify-session'])
})

test('media hotkeys preserve CommandOrControl and apply the saved player preference',()=>{
  const registered=[],sources=[]
  const service=load({electron:{app:new EventEmitter(),globalShortcut:{register:key=>{registered.push(key);return true},unregister(){}}},'./mediaCoordinator':{setPreferredMediaFilter:source=>sources.push(source)}})('electron/mediaService.ts')
  service.registerMediaGlobalHotkeys({playPause:'CommandOrControl+Shift+P',next:'Ctrl+Right',prev:'Control+Left'},undefined,'spotify')
  assert.deepEqual(registered,['CommandOrControl+Shift+P','CommandOrControl+Right','CommandOrControl+Left'])
  assert.deepEqual(sources,['spotify']);service.unregisterAllMediaHotkeys()
})
