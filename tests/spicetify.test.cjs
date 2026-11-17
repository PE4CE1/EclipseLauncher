const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path'),load=require('./download-loader.cjs')

function fixture(outcomes=[]) {
  const handlers=new Map(),calls=[],statuses=[],children=[],checkedPaths=[]
  const service=load({
    electron:{},'./ipcSecurity':{ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}},'./externalLaunch':{},
    fs:{existsSync:file=>{checkedPaths.push(file);return true},readdirSync:()=>[]},
    child_process:{
      execFile:(_exe,args,_options,done)=>done(null,'',args[0]==='-v'?'2.46.7\n':path.join(process.env.APPDATA||'/config','spicetify','config-xpui.ini')),
      spawn:(exe,args,options)=>{
        calls.push({exe,args,options});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{child.killed=true;child.emit('close',0)};children.push(child)
        const next=outcomes.shift();if(next)queueMicrotask(()=>{if(next.text)child.stderr.emit('data',Buffer.from(next.text));child.emit('close',next.code??0)})
        return child
      },
    },
  })('electron/spicetifyService.ts')
  service.initSpicetifyIPC(()=>[{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(channel,value)=>{if(channel==='spicetify:status')statuses.push(value)}}}])
  return{...service,handlers,calls,statuses,children,checkedPaths}
}

test('Spicetify status reads the real version from stderr and Marketplace from the configuration directory',async()=>{
  const f=fixture(),status=await f.getSpicetifyStatus()
  assert.equal(status.version,'2.46.7');assert.equal(status.hasMarketplace,true);assert.equal(status.isSpicetifyInstalled,true)
  assert.ok(f.checkedPaths.includes(path.join(process.env.APPDATA||'/config','spicetify','CustomApps','marketplace')))
})
test('Spicetify update upgrades first and repairs only a diagnosed outdated preprocessing backup',async()=>{
  const f=fixture([{code:0},{code:1,text:'\u001b[31mPreprocessed Spotify data is outdated. Please run "spicetify restore backup apply"\u001b[0m'},{code:0}])
  assert.equal((await f.handlers.get('spicetify:upgrade')()).success,true)
  assert.deepEqual(f.calls.map(call=>call.args),[['upgrade','--no-restart'],['apply','--no-restart'],['restore','backup','apply','--no-restart']])
  assert.ok(f.statuses.includes('repairing'));assert.equal(f.statuses.at(-1),'done')
  for(const call of f.calls){assert.equal(call.options.windowsHide,true);assert.deepEqual(call.options.stdio,['ignore','pipe','pipe']);assert.equal(call.options.shell,undefined)}
})
test('Spicetify missing backups are created before applying without an unnecessary restore',async()=>{
  const f=fixture([{code:1,text:'You haven\'t backed up. Run "spicetify backup apply"'},{code:0}])
  assert.equal((await f.handlers.get('spicetify:apply')()).success,true)
  assert.deepEqual(f.calls.map(call=>call.args),[['apply','--no-restart'],['backup','apply','--no-restart']])
})
test('Spicetify update stops on download failures and preserves the real error diagnostics',async()=>{
  const f=fixture([{code:1,text:'Failed to fetch latest release: connection refused'}]),result=await f.handlers.get('spicetify:upgrade')()
  assert.equal(result.success,false);assert.equal(result.errorCode,'network');assert.equal(result.exitCode,1);assert.match(result.details,/connection refused/);assert.equal(f.calls.length,1)
})
test('Spicetify does not reset customizations for permissions errors and releases its operation lock',async()=>{
  const f=fixture([{code:1,text:'Access is denied'},{code:0}])
  assert.equal((await f.handlers.get('spicetify:apply')()).errorCode,'permissions');assert.equal(f.calls.length,1)
  assert.equal((await f.handlers.get('spicetify:restore')()).success,true)
})
test('Spicetify rejects concurrent actions and a timed-out process cannot later report success',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(),pending=f.handlers.get('spicetify:upgrade')()
  assert.equal((await f.handlers.get('spicetify:restore')()).errorCode,'busy');assert.equal(f.calls.length,1)
  t.mock.timers.tick(300000)
  const result=await pending;assert.equal(result.success,false);assert.equal(result.errorCode,'timeout');assert.equal(f.children[0].killed,true);assert.equal(f.statuses.at(-1),'error')
})
test('Spicetify errors follow the UI language and translate old German exit-code messages too',()=>{
  const {spicetifyErrorMessage, classifySpicetifyError}=load()('src/services/spicetifyMessages.ts')
  const old={success:false,error:'Beendet mit Code 1'}
  assert.match(spicetifyErrorMessage(old,false),/Exit code 1/);assert.doesNotMatch(spicetifyErrorMessage(old,false),/Beendet|Fehler/)
  assert.match(spicetifyErrorMessage(old,true),/Fehlercode 1/)
  assert.match(spicetifyErrorMessage({success:false,errorCode:'permissions'},false),/Close Spotify/)
  assert.match(spicetifyErrorMessage({success:false,errorCode:'permissions'},true),/Beende Spotify/)
  assert.equal(classifySpicetifyError('Spotify version and backup version are mismatched.'),'backup_required')
  assert.equal(classifySpicetifyError('Spicetify should NOT be run with administrator or root privileges'),'administrator')
})
