const test = require('node:test'), assert = require('node:assert/strict')
const {createMicrophoneRecovery} = require('./download-loader.cjs')()('src/services/microphoneRecovery.ts')
const flush = async () => { for(let i=0;i<8;i++)await Promise.resolve() }
function input() {
  const track = new EventTarget()
  track.readyState='live';track.stops=0
  track.stop=()=>{track.readyState='ended';track.stops++}
  return {track,getAudioTracks:()=>[track],getTracks:()=>[track]}
}

test('microphone recovers from startup failure without replacing the destination recorder', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  const source=input(),states=[];let attempts=0,attached=0,detached=0
  const recovery=createMicrophoneRecovery({request:async()=>{attempts++;return source},attach:()=>{attached++;return()=>detached++},status:(...state)=>states.push(state),error:new DOMException('Busy','NotReadableError')})
  t.after(()=>recovery.dispose())
  assert.equal(states[0][0],false);assert.equal(states[0][1].name,'NotReadableError')
  t.mock.timers.tick(1499);await flush();assert.equal(attempts,0)
  t.mock.timers.tick(1);await flush();assert.equal(attempts,1);assert.equal(attached,1);assert.equal(states.at(-1)[0],true)
  await recovery.retry();assert.equal(attempts,1,'Healthy microphones are not reopened')
  recovery.dispose();recovery.dispose();assert.equal(detached,1);assert.equal(source.track.stops,1)
})

test('a disconnected microphone detaches and reconnects once, including overlapping manual retries', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  const initial=input(),next=input(),states=[];let requests=0,resolve,detached=0
  const recovery=createMicrophoneRecovery({initial,request:()=>{requests++;return new Promise(done=>resolve=done)},attach:()=>()=>detached++,status:(...state)=>states.push(state)})
  t.after(()=>recovery.dispose())
  initial.track.readyState='ended';initial.track.dispatchEvent(new Event('ended'))
  assert.equal(detached,1);assert.equal(states.at(-1)[1].name,'NotFoundError')
  const first=recovery.retry(),second=recovery.retry();assert.equal(first,second)
  await flush();assert.equal(requests,1);assert.equal(states.at(-1)[2],true)
  resolve(next);await first;assert.equal(states.at(-1)[0],true)
  t.mock.timers.tick(60000);await flush();assert.equal(requests,1)
})

test('repeated microphone failures back off, handle synchronous errors, and cancel on disposal', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  let requests=0
  const recovery=createMicrophoneRecovery({request:()=>{requests++;throw new Error('Unavailable')},attach:()=>()=>{},status(){}})
  t.mock.timers.tick(1500);await flush();assert.equal(requests,1)
  t.mock.timers.tick(2999);await flush();assert.equal(requests,1)
  t.mock.timers.tick(1);await flush();assert.equal(requests,2)
  recovery.dispose();t.mock.timers.tick(60000);await flush();assert.equal(requests,2)
})

test('late microphone permission/capture results are stopped after recording is disposed', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  let resolve,attached=0;const source=input(),states=[]
  const recovery=createMicrophoneRecovery({request:()=>new Promise(done=>resolve=done),attach:()=>{attached++;return()=>{}},status:(...state)=>states.push(state)})
  const pending=recovery.retry();await flush();recovery.dispose();const count=states.length
  resolve(source);await pending
  assert.equal(source.track.stops,1);assert.equal(attached,0);assert.equal(states.length,count)
})

test('empty or ended microphone inputs never report successful capture', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  const source=input();source.track.stop();const states=[];let attached=0
  const recovery=createMicrophoneRecovery({request:async()=>source,attach:()=>{attached++;return()=>{}},status:(...state)=>states.push(state)})
  t.after(()=>recovery.dispose());await recovery.retry()
  assert.equal(attached,0);assert.equal(states.at(-1)[0],false);assert.equal(states.at(-1)[1].name,'NotFoundError')
})
