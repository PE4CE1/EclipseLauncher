const test=require('node:test')
const assert=require('node:assert/strict')
const loadTs=require('./download-loader.cjs')
const wait=()=>new Promise(setImmediate)
const assets=id=>({asset_url_format:`steam/apps/${id}/\${FILENAME}?t=123`,library_capsule:'abcd/library_capsule.jpg',hero_capsule:'efgh/hero_capsule.jpg',library_hero:'ijkl/library_hero.jpg',header:'mnop/header.jpg'})

function fixture(t, fetcher) {
  const previous=global.localStorage
  const storage=new Map()
  global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}
  t.after(()=>{global.localStorage=previous})
  return {load:()=>loadTs({'./httpClient':{desktopFetch:fetcher}})('src/services/steamArtwork.ts'),storage}
}

test('Steam asset metadata resolves hash-based portraits without guessing filenames or cropping headers',t=>{
  const {load}=fixture(t,()=>assert.fail('Parsing must not make requests'))
  const {parseSteamArtwork}=load()
  const result=parseSteamArtwork(5335510,assets(5335510))
  assert.match(result.poster,/\/5335510\/abcd\/library_capsule.jpg\?t=123$/)
  assert.match(result.hero,/\/5335510\/ijkl\/library_hero.jpg/)
  assert.equal(parseSteamArtwork(5335510,assets(730)),null)
  assert.equal(parseSteamArtwork(730,{...assets(730),library_capsule:'../../evil.jpg',hero_capsule:'https://evil.test/a.jpg',library_hero:null,header:null}),null)
})

test('visible artwork requests are deduplicated and batched with no more than two Store requests at once',async t=>{
  let active=0,maximum=0,calls=0
  const releases=[]
  const {load}=fixture(t,async url=>{
    calls++;active++;maximum=Math.max(maximum,active)
    const ids=JSON.parse(new URL(url).searchParams.get('input_json')).ids.map(item=>item.appid)
    await new Promise(resolve=>releases.push(resolve))
    active--
    return {ok:true,json:async()=>({response:{store_items:ids.map(appid=>({appid,assets:assets(appid)}))}})}
  })
  const artwork=load()
  const tasks=Array.from({length:70},(_,index)=>artwork.getSteamArtwork(index+1))
  assert.equal(tasks[0],artwork.getSteamArtwork(1))
  await new Promise(resolve=>setTimeout(resolve,30))
  assert.equal(calls,2)
  while(releases.length){releases.shift()();await wait()}
  const results=await Promise.all(tasks)
  assert.equal(calls,3)
  assert.equal(maximum,2)
  assert.equal(results.filter(result=>result.poster).length,70)
})

test('successful metadata survives a renderer restart; invalid and failed lookups stay retryable',async t=>{
  let calls=0,working=true
  const {load}=fixture(t,async url=>{
    calls++
    if(!working)throw new Error('Offline')
    const ids=JSON.parse(new URL(url).searchParams.get('input_json')).ids.map(item=>item.appid)
    return {ok:true,json:async()=>({response:{store_items:ids.map(appid=>({appid,assets:assets(appid)}))}})}
  })
  let module=load()
  await module.getSteamArtwork(730)
  await new Promise(resolve=>setTimeout(resolve,550))
  module=load();working=false
  assert.ok((await module.getSteamArtwork(730)).poster)
  assert.equal(calls,1)
  assert.equal(await module.getSteamArtwork(620),null)
  assert.equal(await module.getSteamArtwork(620),null)
  assert.equal(calls,2)
  assert.equal(await module.getSteamArtwork(NaN),null)
})

test('hero preparation does not report readiness before asynchronous image decoding completes',async t=>{
  const previous=global.Image
  let finishDecode,source
  global.Image=class{
    naturalWidth=1920
    set src(value){source=value;if(value)queueMicrotask(()=>this.onload?.())}
    decode(){return new Promise(resolve=>{finishDecode=resolve})}
  }
  t.after(()=>{global.Image=previous})
  const {loadDecodedImage}=loadTs({'./assetHelper':{},'./steamArtwork':{}})('src/services/heroArtwork.ts')
  const controller=new AbortController()
  let ready=false
  const preparation=loadDecodedImage('https://cdn.test/hero.jpg',controller.signal).then(value=>{ready=value;return value})
  await wait();assert.equal(ready,false)
  finishDecode();assert.equal(await preparation,true)
  const aborted=new AbortController()
  const cancelled=loadDecodedImage('https://cdn.test/next.jpg',aborted.signal)
  await wait();aborted.abort()
  assert.equal(await cancelled,false)
  assert.equal(source,'')
})
