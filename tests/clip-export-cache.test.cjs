const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {ClipExportCache}=require('./download-loader.cjs')()('electron/clipExportCache.ts')
function fixture(t){
  const directory=fs.mkdtempSync(path.join(__dirname,'.export-cache-'))
  t.after(()=>{assert.equal(path.dirname(directory),__dirname);assert.ok(path.basename(directory).startsWith('.export-cache-'));fs.rmSync(directory,{recursive:true,force:true})})
  const source=path.join(directory,'source.mp4'),audio=path.join(directory,'voice.m4a'),render=path.join(directory,'render.mp4'),output=path.join(directory,'copy.mp4')
  for(const file of [source,audio,render])fs.writeFileSync(file,'original')
  return{directory,source,audio,render,output,cache:new ClipExportCache(2)}
}
test('prepared Discord files are reused exactly and source, sidecar and edit changes invalidate the key',async t=>{
  const f=fixture(t),edit={start:0,micVolume:1},key=await f.cache.key([f.source,f.audio],edit)
  await f.cache.remember(key,f.render)
  assert.equal(await f.cache.reuse(key,f.output,20_000_000),true)
  assert.deepEqual(fs.readFileSync(f.output),fs.readFileSync(f.render))
  assert.notEqual(await f.cache.key([f.source,f.audio],{...edit,micVolume:0}),key)
  fs.writeFileSync(f.audio,'new audio');assert.notEqual(await f.cache.key([f.source,f.audio],edit),key)
  fs.writeFileSync(f.source,'new video');assert.notEqual(await f.cache.key([f.source,f.audio],edit),key)
})
test('missing, modified and oversized cached files are rejected without deleting files used by the clipboard',async t=>{
  const f=fixture(t)
  await f.cache.remember('a',f.render);fs.writeFileSync(f.render,'changed content')
  assert.equal(await f.cache.reuse('a',f.output,20_000_000),false)
  await f.cache.remember('b',f.render);assert.equal(await f.cache.reuse('b',f.output,2),false)
  await f.cache.remember('c',f.render);fs.unlinkSync(f.render);assert.equal(await f.cache.reuse('c',f.output,20_000_000),false)
  fs.writeFileSync(f.render,'valid');await f.cache.remember('a',f.render);await f.cache.remember('b',f.render);await f.cache.remember('c',f.render)
  assert.equal(await f.cache.reuse('a',f.output,20_000_000),false)
  assert.equal(fs.readFileSync(f.render,'utf8'),'valid')
})
