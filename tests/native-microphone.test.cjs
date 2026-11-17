const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { EventEmitter } = require('node:events')
const load = require('./download-loader.cjs')

test('Windows microphone enumeration preserves endpoint identities and real friendly names', () => {
  const { parseNativeMicrophones } = load({ electron: {}, './ipcSecurity': {} })('electron/microphoneCapture.ts')
  assert.deepEqual(parseNativeMicrophones('{0.0.1.00000000}.abc\tUSB Microphone\t1\r\ninvalid\n{0.0.1.00000000}.def\tVirtual APO Mic\t0'), [
    { deviceId: 'wasapi:{0.0.1.00000000}.abc', label: 'USB Microphone', default: true },
    { deviceId: 'wasapi:{0.0.1.00000000}.def', label: 'Virtual APO Mic', default: false },
  ])
})

test('native microphone worklet preserves stereo PCM and bounds latency when the UI queues too much audio', () => {
  let Processor
  const context = { AudioWorkletProcessor: class { constructor() { this.port = {} } }, registerProcessor: (_name, value) => { Processor = value }, Int16Array }
  vm.runInNewContext(fs.readFileSync('src/services/nativeMicrophone.worklet.js', 'utf8'), context)
  const processor = new Processor(), pcm = new Int16Array(9600)
  for (let i = 0; i < pcm.length; i += 2) { pcm[i] = 8192; pcm[i + 1] = -16384 }
  processor.port.onmessage({ data: pcm.buffer })
  const output = [new Float32Array(128), new Float32Array(128)]
  processor.process([], [output])
  assert.ok(output[0].every(value => value === .25)); assert.ok(output[1].every(value => value === -.5))
  for (let count = 0; count < 100; count++) processor.port.onmessage({ data: pcm.buffer })
  assert.ok(processor.count <= 24000, 'At most half a second of native PCM may be queued')
})

test('native microphone capture owns its stream, forwards complete packets, and stops on owner destruction', async t => {
  const handlers = new Map(), listeners = new Map(), child = new EventEmitter(), sender = new EventEmitter(), foreign = new EventEmitter(), messages = []
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.exitCode = null
  let ended = 0
  child.stdin.end = () => { ended++; child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)) }
  child.kill = () => { child.exitCode = 0 }
  sender.isDestroyed = () => false; sender.send = (_name, packet) => messages.push(packet)
  const api = load({ electron: { app: { getAppPath: () => '.', once() {} } }, './ipcSecurity': { ipcMain: { handle: (name, handler) => handlers.set(name, handler), on: (name, handler) => listeners.set(name, handler) } },
    'node:child_process': { spawn: (_file, args, options) => { assert.deepEqual(args, ['--microphone', 'auto']); assert.equal(options.windowsHide, true); queueMicrotask(() => child.stderr.emit('data', Buffer.from('READY'))); return child } },
  })('electron/microphoneCapture.ts')
  if (process.platform !== 'win32') { t.skip('Windows native microphone path'); return }
  api.initMicrophoneCapture()
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await handlers.get('microphone:start')({ sender }, id, 'auto')
  const packet = Buffer.alloc(12 + 48 * 4); packet.writeDoubleLE(Date.now(), 0); packet.writeUInt32LE(48, 8); packet.fill(5, 12)
  child.stdout.emit('data', packet.subarray(0, 13)); assert.equal(messages.length, 0)
  child.stdout.emit('data', packet.subarray(13)); assert.equal(messages.length, 1); assert.equal(messages[0].pcm.length, 48 * 4)
  for (let i = 0; i < 40; i++) child.stdout.emit('data', packet)
  assert.equal(messages.length, 24, 'A stalled renderer must not accumulate unbounded IPC audio')
  listeners.get('microphone:ack')({ sender: foreign }, id, messages[0].sequence)
  child.stdout.emit('data', packet); assert.equal(messages.length, 24, 'Other windows cannot acknowledge this stream')
  listeners.get('microphone:ack')({ sender }, id, messages[0].sequence)
  child.stdout.emit('data', packet); assert.equal(messages.length, 25, 'Capture resumes when the owner consumes audio')
  handlers.get('microphone:stop')({ sender: foreign }, id); assert.equal(ended, 0)
  sender.emit('destroyed'); assert.equal(ended, 1)
  await assert.rejects(handlers.get('microphone:start')({ sender }, '../unsafe', 'auto'), /Invalid/)
})

function rendererMicrophone(t, start) {
  let listener, stopped = 0, unsubscribed = 0, closed = 0, disconnected = 0, ended = 0
  const track = { stop() { stopped++ }, dispatchEvent(event) { if (event.type === 'ended') ended++ } }
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] }
  const packets = [], stops = []
  const api = { list: async () => ({ supported: true, inputs: [] }), start, stop: async id => { stops.push(id) }, onData(callback) { listener = callback; return () => { unsubscribed++ } } }
  const replacements = {
    window: Object.assign(new EventTarget(), { electronAPI: { nativeMicrophone: api } }),
    AudioContext: class { state = 'running'; audioWorklet = { addModule: async () => {} }; createMediaStreamDestination() { return { stream } } async resume() {} async close() { closed++; this.state = 'closed' } },
    AudioWorkletNode: class { port = { close() {}, postMessage: data => packets.push(new Int16Array(data)) }; connect() {} disconnect() { disconnected++ } },
  }
  for (const [name, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
    t.after(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name])
  }
  return { api, stream, packets, stops, send: packet => listener(packet), facts: () => ({ stopped, unsubscribed, closed, disconnected, ended }), request: load()('src/services/microphoneStream.ts').requestMicrophoneStream }
}

test('native microphone sessions survive same-document navigation but release on reload and renderer crash', async t => {
  if(process.platform!=='win32'){t.skip('Windows native microphone path');return}
  const handlers=new Map(),children=[],sender=new EventEmitter(),foreign=new EventEmitter()
  sender.isDestroyed=foreign.isDestroyed=()=>false;sender.send=foreign.send=()=>{}
  const service=load({electron:{app:{getAppPath:()=>'.',once(){}}},'./ipcSecurity':{ipcMain:{handle:(name,handler)=>handlers.set(name,handler),on(){}}},
    'node:child_process':{spawn:()=>{
      const child=new EventEmitter();children.push(child)
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.exitCode=null
      child.stdin.end=()=>{child.exitCode=0;queueMicrotask(()=>child.emit('exit',0))}
      child.kill=()=>{child.exitCode=0};queueMicrotask(()=>child.stderr.emit('data',Buffer.from('READY')))
      return child
    }},
  })('electron/microphoneCapture.ts')
  service.initMicrophoneCapture()
  const start=(owner,id)=>handlers.get('microphone:start')({sender:owner},id,'auto')
  const ids=Array.from({length:6},(_,i)=>`${i}aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)
  await start(sender,ids[0]);await start(sender,ids[1]);await start(foreign,ids[2])
  await assert.rejects(start(sender,ids[3]),/MICROPHONE_BUSY/)
  sender.emit('did-start-navigation',{isMainFrame:false,isSameDocument:false})
  sender.emit('did-start-navigation',{isMainFrame:true,isSameDocument:true})
  assert.equal(children[0].exitCode,null);assert.equal(children[1].exitCode,null)
  sender.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false})
  assert.equal(children[0].exitCode,0);assert.equal(children[1].exitCode,0)
  assert.equal(children[2].exitCode,null,'Unrelated windows must retain their microphone')
  await start(sender,ids[3]);sender.emit('render-process-gone',{}, {reason:'crashed'})
  assert.equal(children[3].exitCode,0)
  await start(sender,ids[4]);assert.equal(sender.listenerCount('did-start-navigation'),1)
  sender.emit('destroyed');foreign.emit('destroyed')
  assert.ok(children.every(child=>child.exitCode===0))
})

test('leaving the capture document releases its native microphone before the window is destroyed', async t=>{
  const fixture=rendererMicrophone(t,async()=>{})
  await fixture.request('wasapi:USB');window.dispatchEvent(new Event('pagehide'))
  assert.equal(fixture.stops.length,1);assert.equal(fixture.facts().closed,1)
  fixture.stream.getTracks()[0].stop();assert.equal(fixture.stops.length,1)
})

test('microphone capacity errors retain an actionable error category across Electron IPC', async t=>{
  const fixture=rendererMicrophone(t,async()=>{throw new Error("Error invoking remote method 'microphone:start': Error: [MICROPHONE_BUSY] Microphone capture slots are already in use")})
  await assert.rejects(fixture.request('wasapi:USB'),{name:'QuotaExceededError'})
  const {microphoneError}=load()('src/services/microphoneDevices.ts')
  assert.match(microphoneError({name:'QuotaExceededError'},false),/capture in Eclipse/)
  assert.match(microphoneError({name:'QuotaExceededError'},true),/Mikrofonaufnahme in Eclipse/)
  assert.equal(fixture.stops.length,1)
})

test('processed microphone bridge uses the selected Windows endpoint and releases audio resources once', async t => {
  let id
  const fixture = rendererMicrophone(t, async (value, device) => { id = value; assert.equal(device, 'wasapi:USB') })
  const stream = await fixture.request('wasapi:USB')
  fixture.send({ id: 'another-stream', pcm: new Uint8Array([0, 32, 0, 192]) }); assert.equal(fixture.packets.length, 0)
  fixture.send({ id, pcm: new Uint8Array([0, 32, 0, 192]) }); assert.deepEqual([...fixture.packets[0]], [8192, -16384])
  fixture.send({ id, ended: true })
  assert.deepEqual(fixture.facts(), { stopped: 1, unsubscribed: 1, closed: 1, disconnected: 1, ended: 1 })
  assert.deepEqual(fixture.stops, [id]); assert.equal(stream, fixture.stream)
})

test('processed microphone startup failure releases resources instead of silently falling back to RAW browser capture', async t => {
  const fixture = rendererMicrophone(t, async () => { throw new Error('Device denied access') })
  await assert.rejects(fixture.request(), /Device denied access/)
  assert.deepEqual(fixture.facts(), { stopped: 1, unsubscribed: 1, closed: 1, disconnected: 1, ended: 0 })
  assert.equal(fixture.stops.length, 1)
})
