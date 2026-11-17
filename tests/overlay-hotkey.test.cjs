const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {PerformanceOverlayHotkey}=load()('electron/performanceHotkey.ts')
test('performance hotkey toggles independently of renderer focus and preserves the old key on conflicts',async t=>{
  t.mock.timers.enable({apis:['Date']});const keys=new Map();let enabled=false,toggles=0
  const hotkey=new PerformanceOverlayHotkey({register:(key,handler)=>{if(key==='Alt+Shift+P')return false;keys.set(key,handler);return true},unregister:key=>keys.delete(key)},async()=>{enabled=!enabled;toggles++})
  hotkey.apply(undefined);assert.equal(hotkey.binding,'Ctrl+Shift+F10')
  keys.get(hotkey.binding)();keys.get(hotkey.binding)();await new Promise(setImmediate)
  assert.equal(enabled,true);assert.equal(toggles,1)
  t.mock.timers.tick(400);keys.get(hotkey.binding)();await new Promise(setImmediate);assert.equal(enabled,false)
  assert.throws(()=>hotkey.apply('Alt+Shift+P'),/in use/);assert.equal(hotkey.binding,'Ctrl+Shift+F10')
  hotkey.apply('Ctrl+Shift+F11');assert.deepEqual([...keys.keys()],['Ctrl+Shift+F11'])
  hotkey.apply('');assert.equal(keys.size,0);hotkey.stop()
  assert.throws(()=>hotkey.apply({}),/Invalid/)
})
