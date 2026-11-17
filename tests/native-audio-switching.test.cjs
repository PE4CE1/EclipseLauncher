const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),load=require('./download-loader.cjs')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function fixture(){
  const children=[],reports=[],packets=[]
  const {NativeAudioReader}=load({'node:child_process':{spawn(_file,args){
    const child=new EventEmitter();child.args=args;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null
    child.end=(message='')=>{child.stderr.end(message);child.stdout.end();child.exitCode=0;child.emit('close',0)};child.kill=()=>{child.end();return true};child.stdin.on('finish',()=>child.end());children.push(child);return child
  }}})('electron/nativeReplayAudio.ts')
  const reader=new NativeAudioReader('fixture',['--desktop','auto'],{append:(time,bytes)=>{packets.push({time,bytes})},stop:async()=>{}},value=>reports.push(value))
  return{reader,children,reports,packets}
}
test('concurrent audio starts share one helper and split PCM packets retain their timestamps',async t=>{
  const f=fixture();t.after(()=>f.reader.stop())
  const first=f.reader.start();assert.equal(f.reader.start(),first,'Concurrent starts share one helper')
  f.children[0].stderr.write('REA');f.children[0].stderr.write('DY\n');assert.equal(await first,true)
  const packet=Buffer.alloc(20);packet.writeDoubleLE(Date.now(),0);packet.writeUInt32LE(2,8);packet.writeInt16LE(1234,12)
  f.children[0].stdout.write(packet.subarray(0,10));f.children[0].stdout.write(packet.subarray(10));assert.equal(f.packets.length,1)
  assert.equal(f.packets[0].time,packet.readDoubleLE(0));assert.equal(f.packets[0].bytes.readInt16LE(0),1234)
})
test('split device-change notification is drained before close and triggers a single fast restart',async t=>{
  const f=fixture();t.after(()=>f.reader.stop());const first=f.reader.start();f.children[0].stderr.write('READY\r\n');await first
  f.children[0].stderr.write('DEVICE_');f.children[0].stderr.write('CHANGED\r\n');f.children[0].end()
  await wait(220);assert.equal(f.children.length,2);assert.deepEqual(f.children[1].args,['--desktop','auto'])
  f.children[1].stderr.write('READY\n');await wait(0);assert.equal(f.reader.available,true)
  f.children[1].end('DEVICE_CHANGED\n');await f.reader.stop();await wait(200);assert.equal(f.children.length,2,'Stop cancels a pending device reconnect')
})
test('ordinary audio failures use backoff instead of spinning',async t=>{
  const f=fixture();t.after(()=>f.reader.stop());const first=f.reader.start();f.children[0].end('Activation failed\n');assert.equal(await first,false)
  await wait(220);assert.equal(f.children.length,1);assert.equal(f.reader.available,false)
})
