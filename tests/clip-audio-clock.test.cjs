const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./download-loader.cjs')
const {createClipAudioClock}=load()('src/services/clipAudioClock.ts')

function track(time=0,paused=false){
  let position=time
  return {paused,seeking:false,readyState:4,playbackRate:1,ended:false,seeks:0,plays:0,pauses:0,
    get currentTime(){return position},set currentTime(value){position=value;this.seeking=true;this.seeks++},
    play(){this.plays++;this.paused=false;return Promise.resolve()},pause(){this.pauses++;this.paused=true},
    advance(time){position=time},
  }
}
const source=(time,extra={})=>({playing:true,seeking:false,currentTime:time,playbackRate:1,...extra})

test('readiness and playing notifications never repeatedly seek correctly aligned audio',()=>{
  const sync=createClipAudioClock(error=>assert.fail(String(error)))
  const audio=track(1)
  for(let i=0;i<1500;i++)sync(source(1.002),audio,false)
  assert.equal(audio.seeks,0);assert.equal(audio.pauses,0);assert.equal(audio.plays,0)
})

test('a delayed canplay after initial alignment starts playback without another seek',async()=>{
  let now=0
  const sync=createClipAudioClock(error=>assert.fail(String(error)),()=>now),audio=track(0,true)
  sync(source(5),audio,false);assert.equal(audio.seeks,1)
  audio.seeking=false;now=80
  sync(source(5.08),audio,false)
  await Promise.resolve()
  assert.equal(audio.seeks,1);assert.equal(audio.plays,1);assert.equal(audio.paused,false)
})

test('small audio drift adjusts speed without cutting samples or restarting playback',()=>{
  const sync=createClipAudioClock(error=>assert.fail(String(error))),audio=track(9.9)
  sync(source(10),audio,false)
  assert.equal(audio.seeks,0);assert.ok(audio.playbackRate>1&&audio.playbackRate<=1.03)
  audio.advance(10.1);sync(source(10),audio,false)
  assert.equal(audio.seeks,0);assert.ok(audio.playbackRate<1&&audio.playbackRate>=.97)
})

test('large drift requires sustained evidence and is limited to one corrective seek per cooldown',()=>{
  let now=0
  const sync=createClipAudioClock(error=>assert.fail(String(error)),()=>now),audio=track(1)
  sync(source(2),audio,false);assert.equal(audio.seeks,0)
  now=300;sync(source(2),audio,false);assert.equal(audio.seeks,1)
  audio.seeking=false
  for(now=400;now<1500;now+=100){audio.advance(1);sync(source(2),audio,false)}
  assert.equal(audio.seeks,1)
})

test('an explicit user seek aligns a paused track once and buffering pauses without seeking',()=>{
  const sync=createClipAudioClock(error=>assert.fail(String(error))),audio=track(1)
  sync(source(5,{playing:false,seeking:true}),audio,false,true)
  assert.equal(audio.seeks,1);assert.equal(audio.paused,true)
  audio.seeking=false
  for(let i=0;i<50;i++)sync(source(5.01,{playing:false}),audio,true)
  assert.equal(audio.seeks,1)
})

test('speed changes preserve rate and an interrupted play request is not reported as failure',async()=>{
  const errors=[],sync=createClipAudioClock(error=>errors.push(error)),audio=track(0,true)
  audio.play=()=>Promise.reject(new DOMException('Interrupted by pause','AbortError'))
  sync(source(0,{playbackRate:1.5}),audio,false)
  await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(errors,[]);assert.equal(audio.playbackRate,1.5)
})
