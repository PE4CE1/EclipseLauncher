const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const load = require('./download-loader.cjs')
const { listMicrophones, microphoneConstraints, microphoneError } = load()('src/services/microphoneDevices.ts')
const device = (deviceId, label, kind = 'audioinput') => ({ deviceId, label, kind })

test('microphone discovery unlocks real devices and names, then releases its permission stream', async () => {
  let granted = false, stopped = 0
  const media = {
    enumerateDevices: async () => granted ? [device('default','Default - USB Mic'), device('usb','USB Mic'), device('usb','USB Mic'), device('webcam','Webcam mic'), device('camera','Camera','videoinput')] : [device('', '')],
    getUserMedia: async constraints => { assert.deepEqual(constraints,{audio:true,video:false}); granted = true; return {getTracks:()=>[{stop:()=>stopped++}]} },
  }
  const result = await listMicrophones(media, true)
  assert.equal(stopped,1); assert.equal(result.defaultLabel,'USB Mic')
  assert.deepEqual(result.inputs,[{deviceId:'usb',label:'USB Mic'},{deviceId:'webcam',label:'Webcam mic'}])
  assert.equal(result.error,undefined)
})

test('named microphone enumeration does not activate capture; hotplug refresh does not request permission', async () => {
  const media = {enumerateDevices:async()=>[device('default','Default - Headset'),device('headset','Headset')],getUserMedia:()=>{throw Error('Must not capture')}}
  assert.equal((await listMicrophones(media,true)).inputs[0].label,'Headset')
  media.enumerateDevices=async()=>[device('','')]
  assert.equal((await listMicrophones(media,false)).inputs.length,0)
})

test('a generic default-only microphone also triggers device permission discovery', async () => {
  let opened = 0
  await listMicrophones({enumerateDevices:async()=>[device('default','Default microphone')],getUserMedia:async()=>{opened++;return{getTracks:()=>[]}}},true)
  assert.equal(opened,1)
})

test('denied microphone permissions retain available inputs and provide localized actionable errors', async () => {
  const denied = new DOMException('denied','NotAllowedError')
  const result = await listMicrophones({enumerateDevices:async()=>[device('','')],getUserMedia:async()=>{throw denied}},true)
  assert.equal(result.error,denied); assert.deepEqual(result.inputs,[])
  assert.match(microphoneError(denied,false),/Windows microphone privacy/)
  assert.match(microphoneError(denied,true),/Windows-Datenschutz/)
  assert.match(microphoneError(new DOMException('missing','NotFoundError'),false),/unavailable/)
})

test('permission streams are released after cancellation and after second enumeration fails', async () => {
  let resolve, stopped=0, reads=0
  const pending = new Promise(done=>{resolve=done}), abort = new AbortController()
  const media = {enumerateDevices:async()=>{reads++;return[device('','')]},getUserMedia:()=>pending}
  const result=listMicrophones(media,true,abort.signal)
  await new Promise(setImmediate); abort.abort(); resolve({getTracks:()=>[{stop:()=>stopped++}]}); await result
  assert.equal(stopped,1); assert.equal(reads,1)
  reads=0
  media.enumerateDevices=async()=>{if(reads++)throw Error('device unplugged');return[device('','')]}
  const failed=await listMicrophones(media,true)
  assert.equal(stopped,2); assert.match(failed.error.message,/unplugged/)
  assert.deepEqual(microphoneConstraints('usb').deviceId,{exact:'usb'})
  assert.equal(microphoneConstraints('auto').deviceId,undefined)
  assert.equal(microphoneConstraints('default').deviceId,undefined)
  assert.equal(microphoneConstraints('usb').autoGainControl,false)
})

function dsp(threshold=-40,meter=true) {
  let Processor
  const reports=[]
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/micNoiseGate.worklet.js'),'utf8'),{
    sampleRate:48000,
    AudioWorkletProcessor:class {constructor(){this.port={postMessage:value=>reports.push(value)}}},
    registerProcessor:(name,constructor)=>{assert.equal(name,'eclipse-mic-gate');Processor=constructor},
  })
  const gate=new Processor({processorOptions:{threshold,meter}})
  const block=(amplitude,second=amplitude)=>{
    const output=[new Float32Array(128),new Float32Array(128)]
    const result=gate.process([[new Float32Array(128).fill(amplitude),new Float32Array(128).fill(second)]],[output])
    return {output,result}
  }
  const run=(db,seconds)=>{let output;for(let n=0;n<Math.ceil(seconds*48000/128);n++)output=block(10**(db/20));return output}
  return{gate,block,run,reports,set:value=>gate.port.onmessage({data:{threshold:value}})}
}

test('audio gate suppresses noise, opens smoothly for speech and closes after its hold/release', () => {
  const f=dsp(-35)
  assert.equal(f.run(-50,.1).output[0][127],0)
  const speech=f.run(-20,.04).output[0][127];assert.ok(speech>.099&&speech<=.1)
  f.run(-55,.2);assert.equal(f.gate.open,true,'Short gaps between syllables remain open')
  f.run(-55,.3);assert.equal(f.gate.open,false)
  assert.ok(f.run(-55,.4).output[0][127]<1e-7)
  assert.ok(f.reports.length>0);assert.equal(f.reports.at(-1).open,false)
  assert.ok(Math.abs(f.reports.at(-1).db+55)<.01)
})

test('gate hysteresis avoids chattering and slider updates do not reset an open voice', () => {
  const f=dsp(-35)
  f.run(-30,.05);f.run(-37,.7);assert.equal(f.gate.open,true)
  f.set(-36);f.run(-37,.05);assert.equal(f.gate.open,true)
  f.run(-41,.6);assert.equal(f.gate.open,false)
  f.set(-60);assert.equal(f.block(.00001).output[0][0],new Float32Array([.00001])[0])
})

test('gate bypass preserves stereo samples and does not emit capture telemetry by default', () => {
  const f=dsp(-60,false),{output}=f.block(.2,-.3)
  assert.equal(output[0][0],new Float32Array([.2])[0]);assert.equal(output[1][0],new Float32Array([-.3])[0])
  f.run(-30,1);assert.equal(f.reports.length,0)
  f.gate.port.onmessage({data:{dispose:true}});assert.equal(f.block(.2).result,false)
})

test('a one-sided microphone uses the live channel level rather than halving its energy', () => {
  const f=dsp(-22)
  for(let i=0;i<40;i++)f.block(.1,0)
  assert.equal(f.gate.open,true);assert.ok(Math.abs(f.reports.at(-1).db+20)<.01)
})

test('worklet modules are registered once per context and gate ports are detached on disposal', async t => {
  let modules=0,closed=0,disconnected=0
  const messages=[]
  const previous=Object.getOwnPropertyDescriptor(globalThis,'AudioWorkletNode')
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'AudioWorkletNode',previous);else delete globalThis.AudioWorkletNode})
  Object.defineProperty(globalThis,'AudioWorkletNode',{configurable:true,value:class {
    constructor(){this.port={postMessage:value=>messages.push(value),close:()=>closed++}}
    disconnect(){disconnected++}
  }})
  const {createMicrophoneGate}=load()('src/services/micNoiseGate.ts')
  const context={audioWorklet:{addModule:async()=>{modules++}}}
  let level
  const first=await createMicrophoneGate(context,-40,value=>level=value),second=await createMicrophoneGate(context,-30)
  assert.equal(modules,1)
  first.node.port.onmessage({data:{db:-20,open:true}});assert.deepEqual(level,{db:-20,open:true})
  first.setThreshold(-35);assert.deepEqual(messages[0],{threshold:-35})
  first.dispose();first.dispose();first.setThreshold(-25)
  assert.equal(first.node.port.onmessage,null);assert.equal(messages.length,2)
  second.dispose();assert.equal(closed,2);assert.equal(disconnected,2)
})
