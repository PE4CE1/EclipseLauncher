const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./download-loader.cjs')()
const {virtualRows} = load('src/services/virtualRows.ts')
const {LruCache} = load('src/services/lruCache.ts')

test('windowed rows retain exactly the full grid height at the top, middle, bottom and fractional widths', () => {
  for (const count of [1, 6, 7, 49, 590, 10000]) for (const cols of [1, 2, 3, 6]) for (const height of [82, 309.5, 304.984375]) {
    const gap = cols === 1 ? 8 : 16, rows = Math.ceil(count / cols), full = rows * height + Math.max(0, rows - 1) * gap
    for (const top of [0, 30, 1000, full / 2, full - 100, full + 1000]) {
      const range = virtualRows(count, cols, height, gap, top, 720)
      const visibleRows = Math.ceil((range.end-range.start)/cols), spacers = Number(range.before>0) + Number(range.after>0)
      const actual = range.before + range.after + visibleRows*height + Math.max(0,visibleRows+spacers-1)*gap
      assert.ok(Math.abs(actual-full)<.001, JSON.stringify({count,cols,height,top,range,actual,full}))
      assert.equal(range.start%cols,0)
      assert.ok(range.end<=count&&range.end>range.start)
      assert.ok(range.end-range.start <= (Math.ceil(720/(height+gap))+7)*cols)
    }
  }
})

test('windowed rows handle an empty library and measurement before the first card exists', () => {
  assert.deepEqual(virtualRows(0,6,300,16,0,720),{start:0,end:0,before:0,after:0})
  assert.deepEqual(virtualRows(590,6,0,16,0,720),{start:0,end:48,before:0,after:0})
  assert.equal(virtualRows(590,6,300,16,1e9,720).end,590)
})

test('bounded browsing caches evict the least recently read result and preserve Map iteration', () => {
  const cache = new LruCache(3)
  cache.set('first',1).set('second',2).set('third',3)
  assert.equal(cache.get('first'),1)
  cache.set('fourth',4)
  assert.equal(cache.has('second'),false)
  cache.set('third',30).set('fifth',5)
  assert.equal(cache.has('first'),false)
  assert.deepEqual([...cache.entries()],[['fourth',4],['third',30],['fifth',5]])
  cache.clear(); assert.equal(cache.size,0)
  assert.throws(()=>new LruCache(0),RangeError)
})

test('evicted Steam details reload from the existing disk cache without a network request', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  const values = new Map(), reads = new Map()
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:key=>{reads.set(key,(reads.get(key)||0)+1);return values.get(key)||null},
    setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),
  }})
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage})
  const service = require('./download-loader.cjs')({'./httpClient':{desktopFetch:()=>assert.fail('Valid evicted details must not be downloaded again')}})('src/services/steamService.ts')
  for(let id=700001;id<=700071;id++)service.persistAppDetails(id,'english','DE',{steam_appid:id,appid:id,name:'Cached '+id,type:'game'})
  const first = await service.getSteamAppDetails(700001)
  for(let id=700002;id<=700071;id++)await service.getSteamAppDetails(id)
  const latestReads = reads.get('eclipse_steam_app_v3_700071_english_DE')
  await service.getSteamAppDetails(700071)
  assert.equal(reads.get('eclipse_steam_app_v3_700071_english_DE'),latestReads,'Recently viewed details stay in memory')
  const restored = await service.getSteamAppDetails(700001)
  assert.deepEqual(restored,first)
  assert.notEqual(restored,first,'The oldest object was released from the in-memory cache')
  assert.equal(reads.get('eclipse_steam_app_v3_700001_english_DE'),2)
  assert.equal(values.size,71,'Eviction must not delete the persistent cache')
})
