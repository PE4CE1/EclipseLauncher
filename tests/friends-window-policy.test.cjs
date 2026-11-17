const test=require('node:test'),assert=require('node:assert/strict'),loadTs=require('./download-loader.cjs')
const policy=()=>loadTs()('electron/friendsWindowPolicy.ts')
function fakeHost(){
  const events=[]
  const host={isDestroyed:()=>false,isMinimized:()=>true,restore:()=>events.push('restore'),show:()=>events.push('show'),focus:()=>events.push('focus'),webContents:{send:name=>events.push(name),setBackgroundThrottling:value=>events.push('throttle:'+value),invalidate:()=>events.push('paint')}}
  return{host,events}
}
test('Friends keeps its existing 340×540 size and remains movable without resize, maximize or fullscreen',()=>{
  const options=policy().friendsWindowOptions('preload.js')
  assert.deepEqual([options.width,options.height,options.minWidth,options.maxWidth,options.minHeight,options.maxHeight],[340,540,340,340,540,540])
  assert.equal(options.resizable,false);assert.equal(options.maximizable,false);assert.equal(options.fullscreenable,false);assert.equal(options.movable,true)
  assert.equal(options.webPreferences.contextIsolation,true);assert.equal(options.webPreferences.sandbox,true);assert.equal(options.webPreferences.nodeIntegration,false)
})
test('native Add Friend waits for the prepared main-renderer dialog before showing and focusing',()=>{
  const {host,events}=fakeHost(),gate=policy().createAddFriendReveal(()=>host)
  gate.open();assert.deepEqual(events,['throttle:false','show-add-friend-modal'])
  gate.ready({});assert.equal(events.includes('show'),false,'Another window cannot reveal the main window')
  gate.ready(host.webContents);assert.deepEqual(events,['throttle:false','show-add-friend-modal','throttle:true','restore','paint','show','focus'])
  gate.ready(host.webContents);assert.equal(events.filter(v=>v==='focus').length,1)
})
test('rapid requests replace the pending reveal; closing the host cannot focus a stale window',()=>{
  const first=fakeHost(),second=fakeHost();let current=first.host
  const gate=policy().createAddFriendReveal(()=>current)
  gate.open();current=second.host;gate.open();gate.ready(first.host.webContents)
  assert.equal(first.events.includes('show'),false);assert.equal(first.events.at(-1),'throttle:true')
  second.host.isDestroyed=()=>true;gate.ready(second.host.webContents);assert.equal(second.events.includes('focus'),false)
})
test('a missing renderer acknowledgment has one bounded fallback and restores normal throttling',async()=>{
  const {host,events}=fakeHost(),gate=policy().createAddFriendReveal(()=>host,10)
  gate.open();await new Promise(resolve=>setTimeout(resolve,35));assert.equal(events.filter(v=>v==='focus').length,1);assert.ok(events.includes('throttle:true'));gate.cancel()
})

test('closing Add Friend cancels a pending reveal and its fallback without focusing later',async()=>{
  const {host,events}=fakeHost(),gate=policy().createAddFriendReveal(()=>host,10)
  gate.open();gate.dismiss({});assert.equal(events.at(-1),'show-add-friend-modal')
  gate.dismiss(host.webContents);gate.ready(host.webContents)
  await new Promise(resolve=>setTimeout(resolve,35))
  assert.equal(events.at(-1),'throttle:true');assert.equal(events.includes('focus'),false)
})
