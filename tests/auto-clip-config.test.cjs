const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {gsiConfiguration,installGsiConfiguration}=require('./download-loader.cjs')()('electron/autoClipConfig.ts')
const token='a'.repeat(64)
function fixture(t){
  const root=fs.mkdtempSync(path.join(__dirname,'autoclip-config-'))
  t.after(()=>{assert.ok(root.startsWith(path.resolve(__dirname)+path.sep));fs.rmSync(root,{recursive:true,force:true})})
  const cfg={}
  for(const [id,dir,game] of [[730,'Counter-Strike Global Offensive','csgo'],[570,'dota 2 beta','dota']]){
    cfg[id]=path.join(root,'steamapps','common',dir,'game',game,'cfg');fs.mkdirSync(cfg[id],{recursive:true})
    fs.writeFileSync(path.join(root,'steamapps',`appmanifest_${id}.acf`),`"installdir" "${dir}"`)
  }
  return{root,cfg}
}
test('GSI configuration uses authenticated loopback and minimal fields only',()=>{
  for(const [game,port] of [['cs2',13371],['dota2',13372]]){
    const config=gsiConfiguration(game,token)
    assert.ok(config.includes(`http://127.0.0.1:${port}`));assert.ok(config.includes(token))
    for(const forbidden of ['allplayers','-insecure','weapons','items','localhost','0.0.0.0'])assert.ok(!config.includes(forbidden))
  }
  assert.throws(()=>gsiConfiguration('cs2','bad token'))
})
test('GSI installs only its own dedicated cfg, is stable across runs, and leaves no temporary files',async t=>{
  const {root,cfg}=fixture(t)
  for(const game of ['cs2','dota2']){
    const directory=game==='cs2'?cfg[730]:path.join(cfg[570],'gamestate_integration')
    assert.deepEqual(await installGsiConfiguration(game,token,[root]),{success:true,changed:true})
    const target=path.join(directory,'gamestate_integration_eclipse.cfg'),mtime=fs.statSync(target).mtimeMs
    assert.equal(fs.readFileSync(target,'utf8'),gsiConfiguration(game,token))
    assert.deepEqual(await installGsiConfiguration(game,token,[root]),{success:true,changed:false})
    assert.equal(fs.statSync(target).mtimeMs,mtime)
    assert.deepEqual(fs.readdirSync(directory),['gamestate_integration_eclipse.cfg'])
    assert.deepEqual(await installGsiConfiguration(game,'b'.repeat(64),[root]),{success:true,changed:true})
  }
})
test('GSI refuses foreign configs, absent installs, cancellation and path traversal',async t=>{
  const {root,cfg}=fixture(t),target=path.join(cfg[730],'gamestate_integration_eclipse.cfg')
  fs.writeFileSync(target,'"Someone Else" {}')
  assert.equal((await installGsiConfiguration('cs2',token,[root])).error,'configuration')
  assert.equal(fs.readFileSync(target,'utf8'),'"Someone Else" {}')
  assert.equal((await installGsiConfiguration('cs2',token,[path.join(root,'absent')])).error,'not-installed')
  assert.equal((await installGsiConfiguration('dota2',token,[root],()=>false)).success,false)
  assert.ok(!fs.existsSync(path.join(cfg[570],'gamestate_integration')))
  fs.writeFileSync(path.join(root,'steamapps','appmanifest_730.acf'),'"installdir" ".."')
  assert.equal((await installGsiConfiguration('cs2',token,[root])).error,'not-installed')
})
