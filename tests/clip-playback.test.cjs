const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {createClipPlayback}=load()('src/services/clipPlayback.ts')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(prepare=()=>true){
  const states=[],errors=[];let calls=0,action=()=>Promise.resolve()
  const player={paused:true,seeking:false,readyState:2,error:null,play(){calls++;const result=action();this.paused=false;return result},pause(){this.paused=true}}
  const playback=createClipPlayback(()=>player,prepare,value=>states.push(value),error=>errors.push(error))
  return{player,playback,states,errors,calls:()=>calls,action:value=>action=value}
}
test('play requested during initial loading or a seek waits and starts once the frame is ready',async()=>{
  let prepared=false;const f=fixture(player=>{if(!prepared){prepared=true;player.seeking=true;return false}return true})
  f.player.readyState=0;f.playback.play();assert.equal(f.playback.wanted(),true);assert.equal(f.calls(),0)
  f.player.readyState=2;f.playback.ready();assert.equal(f.player.seeking,true);assert.equal(f.calls(),0)
  f.playback.ready();assert.equal(f.calls(),0)
  f.player.seeking=false;f.playback.ready();await tick();assert.equal(f.calls(),1);assert.equal(f.player.paused,false)
  f.playback.pause();assert.equal(f.playback.wanted(),false);assert.equal(f.player.paused,true)
})
test('repeated readiness events do not duplicate play and cancelling a pending start stays paused',async()=>{
  const f=fixture();let reject;f.action(()=>new Promise((_resolve,fail)=>reject=fail))
  f.playback.play();f.playback.ready();f.playback.ready();assert.equal(f.calls(),1)
  f.playback.toggle();reject(Object.assign(new Error('interrupted'),{name:'AbortError'}));await tick()
  assert.equal(f.playback.wanted(),false);assert.equal(f.player.paused,true);assert.equal(f.calls(),1);assert.deepEqual(f.errors,[])
})
test('a newer play request survives an interrupted older start',async()=>{
  const f=fixture();let reject;f.action(()=>new Promise((_resolve,fail)=>reject=fail))
  f.playback.play();f.playback.pause();f.playback.play();f.action(()=>Promise.resolve())
  reject(Object.assign(new Error('old request'),{name:'AbortError'}));await tick()
  assert.equal(f.calls(),2);assert.equal(f.playback.wanted(),true);assert.equal(f.player.paused,false)
})
test('transient abort retries once, but unsupported media fails visibly without a retry loop',async()=>{
  const f=fixture();let once=true;f.action(async()=>{if(once){once=false;await Promise.resolve();f.player.paused=true;throw Object.assign(new Error('seek'),{name:'AbortError'})}})
  f.playback.play();await tick();assert.equal(f.calls(),2);assert.deepEqual(f.errors,[])
  const bad=fixture();bad.action(()=>Promise.reject(Object.assign(new Error('codec'),{name:'NotSupportedError'})))
  bad.playback.play();await tick();assert.equal(bad.playback.wanted(),false);assert.equal(bad.errors.length,1);assert.equal(bad.calls(),1)
})
test('intro hides the patch number without changing the real update version',()=>{
  const {APP_VERSION,APP_DISPLAY_VERSION,APP_INTRO_VERSION}=load()('src/services/appVersion.ts')
  assert.equal(APP_INTRO_VERSION,APP_VERSION.split('.').slice(0,2).join('.'))
  assert.match(APP_INTRO_VERSION,/^\d+\.\d+$/);assert.equal(APP_DISPLAY_VERSION,APP_VERSION)
})
test('an external media pause updates intent, but a late owned pause cannot cancel a newer seek/play request',async()=>{
  const f=fixture();f.playback.play();await tick();f.player.pause();f.player.seeking=true;f.playback.observedPause()
  assert.equal(f.playback.wanted(),false,'A genuine external pause must leave the play button ready to resume')
  f.player.seeking=false;f.playback.play();await tick();f.playback.pause();f.player.seeking=true;f.playback.play();f.playback.observedPause()
  assert.equal(f.playback.wanted(),true,'A queued pause event from our previous action must not revoke new play intent')
})
