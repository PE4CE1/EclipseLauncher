const test=require('node:test'),assert=require('node:assert/strict'),loader=require('./download-loader.cjs')

test('media caches release only after capture and the last player end; restarting cancels release',t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const previous=global.window;let releases=0
  global.window={electronAPI:{releaseUnusedMediaMemory:()=>{releases++}}}
  const memory=loader()('src/services/mediaMemory.ts')
  t.after(()=>{memory.setCaptureMemoryActive(true);global.window=previous})
  memory.setCaptureMemoryActive(true)
  const close=memory.retainMediaMemory()
  memory.setCaptureMemoryActive(false);t.mock.timers.tick(3000);assert.equal(releases,0)
  close();t.mock.timers.tick(1499);assert.equal(releases,0)
  memory.setCaptureMemoryActive(true);t.mock.timers.tick(3000);assert.equal(releases,0)
  memory.setCaptureMemoryActive(false);t.mock.timers.tick(1500);assert.equal(releases,1)
  close();assert.equal(releases,1)
})

test('detached media sources are released while StrictMode effect replay preserves live sources',async t=>{
  const effects=[],load=loader({react:{useEffect:effect=>effects.push(effect)},'../services/mediaMemory':{retainMediaMemory:()=>()=>{}}})
  const {useMediaCleanup}=load('src/hooks/useMediaCleanup.ts')
  let pauses=0,loads=0,removed=0
  const media={srcObject:{},pause:()=>pauses++,load:()=>loads++,removeAttribute:name=>{assert.equal(name,'src');removed++},querySelectorAll:()=>[]}
  const root={isConnected:true,querySelectorAll:()=>[media]}
  useMediaCleanup({current:root})
  const cleanup=effects[0]()
  cleanup();await Promise.resolve();assert.equal(loads,0)
  const actual=effects[0]();root.isConnected=false;actual();await Promise.resolve()
  assert.equal(pauses,1);assert.equal(loads,1);assert.equal(removed,1);assert.equal(media.srcObject,null)
})
