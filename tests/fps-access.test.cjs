const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

function fixture(t) {
  let connect, child, server
  const spawned=[],received=[],states=[]
  const {FpsAccessBroker}=loadTs({
    'node:net':{createServer:handler=>{
      connect=handler
      server=new EventEmitter();server.listening=false
      server.listen=(name,ready)=>{assert.match(name,/^\\\\\.\\pipe\\EclipseFps_[a-f0-9]{32}$/);server.listening=true;ready()}
      server.close=()=>{server.listening=false}
      return server
    }},
    'node:child_process':{spawn:(file,args,options)=>{spawned.push({file,args,options});child=new EventEmitter();return child}},
  })('electron/fpsAccessBroker.ts')
  const broker=new FpsAccessBroker((pid,csv)=>received.push({pid,csv}),(pid,status)=>states.push({pid,status}))
  t.after(()=>broker.close())
  const socket=new EventEmitter();socket.writes=[];socket.setEncoding=()=>{}
  socket.write=text=>{socket.writes.push(text);return true}
  socket.end=text=>{socket.writes.push(text);socket.emit('close')}
  socket.destroy=()=>socket.emit('close')
  return{broker,spawned,received,states,socket,connect:()=>connect(socket),child:()=>child,server:()=>server}
}

test('FPS approval is explicit, shared by concurrent requests, and CSV is scoped to the active PID',async t=>{
  const f=fixture(t)
  assert.equal(f.spawned.length,0)
  f.broker.setTarget(123)
  const request=f.broker.activate('FpsBroker.exe')
  assert.equal(f.broker.activate('FpsBroker.exe'),request)
  assert.equal(f.spawned.length,1)
  assert.equal(f.spawned[0].options.windowsHide,true)
  f.connect()
  f.socket.emit('data','!rea');f.socket.emit('data','dy\n')
  assert.deepEqual(await request,{success:true})
  assert.equal(f.broker.ready,true)
  assert.deepEqual(f.socket.writes,['target:123\n'])
  f.socket.emit('data','!csv\t123\tApplication,ProcessID\r\n!csv\t999\tstale\n')
  assert.deepEqual(f.received,[{pid:123,csv:'Application,ProcessID\n'}])
  f.broker.setTarget(456)
  f.socket.emit('data','!status\t123\terror\n!status\t456\tno-frames\n!csv\t123\told game\n')
  assert.deepEqual(f.states,[{pid:456,status:'no-frames'}])
  f.broker.setTarget(0)
  f.socket.emit('data','!csv\t456\tlate frame\n')
  assert.equal(f.received.length,1)
  f.broker.close()
  assert.equal(f.broker.ready,false)
  assert.equal(f.socket.writes.at(-1),'close\n')
  assert.equal(f.server().listening,false)
})

test('cancelling Windows approval closes the server without an automatic retry',async t=>{
  const f=fixture(t)
  const request=f.broker.activate('FpsBroker.exe')
  f.child().emit('exit',1223)
  assert.deepEqual(await request,{success:false,error:'cancelled'})
  assert.equal(f.server().listening,false)
  assert.equal(f.spawned.length,1)
  assert.equal(f.broker.ready,false)
})

test('FPS pipe batches preserve every frame while dispatching once per chunk and filtering stale games',async t=>{
  const f=fixture(t);f.broker.setTarget(123)
  const request=f.broker.activate('FpsBroker.exe');f.connect();f.socket.emit('data','!ready\n');await request
  const csv=Array.from({length:240},(_,i)=>'frame,'+i+',123,6.944\n').join('')
  const protocol=csv.trimEnd().split('\n').map(line=>'!csv\t123\t'+line+'\n').join('')
  f.socket.emit('data',protocol+'!csv\t999\tstale\n')
  assert.deepEqual(f.received,[{pid:123,csv}])
  f.socket.emit('data','!csv\t123\tpart');f.socket.emit('data','ial\n')
  assert.equal(f.received.at(-1).csv,'partial\n')
})

test('losing the privileged connection clears readiness and reports the active game',async t=>{
  const f=fixture(t)
  f.broker.setTarget(55)
  const request=f.broker.activate('FpsBroker.exe');f.connect();f.socket.emit('data','!ready\n');await request
  f.socket.emit('close')
  assert.equal(f.broker.ready,false)
  assert.deepEqual(f.states,[{pid:55,status:'permission-required'}])
})
