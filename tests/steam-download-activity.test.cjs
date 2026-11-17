const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {parseSteamDownload,steamDownloadActivity,SteamDownloadMonitor}=require('./download-loader.cjs')()('electron/steamDownloadActivity.ts')
const acf=(flags,done=42,total=100,extra='')=>`"AppState" { "appid" "730" "name" "Counter-Strike 2" "StateFlags" "${flags}" "BytesDownloaded" "${done}" "BytesToDownload" "${total}" ${extra} }`
test('Steam activity distinguishes actual downloads from paused, queued, locked and completed installs',()=>{
  for(const flags of [4,16,1024,6,512|1048576,8388608|1048576,2048])assert.equal(steamDownloadActivity(parseSteamDownload(acf(flags))),null,String(flags))
  assert.deepEqual(steamDownloadActivity(parseSteamDownload(acf(1048576))),{name:'Counter-Strike 2',source:'Steam',appId:730,phase:'download',progress:42})
  assert.equal(steamDownloadActivity(parseSteamDownload(acf(1024)),true).phase,'download')
})
test('installing, verifying and allocating have distinct phases and do not invent percentages',()=>{
  assert.equal(steamDownloadActivity(parseSteamDownload(acf(2097152,100,100,'"BytesStaged" "25" "BytesToStage" "100"'))).progress,25)
  assert.equal(steamDownloadActivity(parseSteamDownload(acf(4194304))).phase,'install')
  assert.equal(steamDownloadActivity(parseSteamDownload(acf(131072))).phase,'verify')
  assert.equal(steamDownloadActivity(parseSteamDownload(acf(524288))).phase,'prepare')
  assert.equal(steamDownloadActivity(parseSteamDownload(acf(1048576,0,0))).progress,undefined)
  assert.equal(parseSteamDownload('"AppState" {'),null)
})
function fixture(t){
  const root=fs.mkdtempSync(path.join(__dirname,'.steam-activity-')),apps=path.join(root,'steamapps'),monitor=new SteamDownloadMonitor()
  fs.mkdirSync(apps)
  t.after(()=>{monitor.reset();const target=path.resolve(root);assert.equal(path.dirname(target),path.resolve(__dirname));assert.ok(path.basename(target).startsWith('.steam-activity-'));fs.rmSync(target,{recursive:true,force:true})})
  return{root,apps,monitor,write:(content,name='appmanifest_730.acf')=>fs.writeFileSync(path.join(apps,name),content)}
}
test('existing download folders never create false activity and unchanged manifests are not reread',async t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.apps,'downloading','730'),{recursive:true});f.write(acf(4))
  const original=fs.promises.readFile,reads=[]
  t.mock.method(fs.promises,'readFile',async(...args)=>{reads.push(String(args[0]));return original(...args)})
  assert.equal(await f.monitor.scan(f.root,100000),null)
  const count=reads.length;assert.equal(await f.monitor.scan(f.root,108000),null);assert.equal(reads.length,count)
})
test('Steam states update correctly through start, progress, pause, install and completion',async t=>{
  const f=fixture(t);f.write(acf(1048576))
  assert.equal((await f.monitor.scan(f.root,100000,true)).progress,42)
  f.write(acf(1048576,72));assert.equal((await f.monitor.scan(f.root,108000,true)).progress,72)
  f.write(acf(512|1048576,72));assert.equal(await f.monitor.scan(f.root,116000,true),null)
  f.write(acf(2097152,100,100));assert.equal((await f.monitor.scan(f.root,124000,true)).phase,'install')
  f.write(acf(4,100,100));assert.equal(await f.monitor.scan(f.root,132000,true),null)
})
test('native manifest change events request a refresh without recursive file or process scans',async t=>{
  const f=fixture(t);f.monitor.reset();let changed=0
  const monitor=new SteamDownloadMonitor(()=>{changed++});t.after(()=>monitor.reset());f.write(acf(4));await monitor.scan(f.root)
  f.write(acf(1048576));const end=Date.now()+3000;while(!changed&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20))
  assert.ok(changed>0);assert.equal((await monitor.scan(f.root)).phase,'download')
  fs.unlinkSync(path.join(f.apps,'appmanifest_730.acf'));assert.equal(await monitor.scan(f.root,Date.now(),true),null)
})
test('reset invalidates in-flight scans and releases filesystem watchers',async t=>{
  const f=fixture(t);f.write(acf(1048576));const pending=f.monitor.scan(f.root);f.monitor.reset();assert.equal(await pending,null)
})
