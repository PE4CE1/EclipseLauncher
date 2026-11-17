const {app,utilityProcess}=require('electron'),path=require('node:path'),assert=require('node:assert/strict')
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
app.on('window-all-closed',()=>{})
let child
app.whenReady().then(async()=>{
  const errors=[],pulses=[]
  child=utilityProcess.fork(path.resolve(__dirname,'input-worker-fixture.cjs'),[],{stdio:'pipe',serviceName:'Eclipse input test'})
  child.stdout?.on('data',()=>{});child.stderr?.on('data',data=>errors.push(String(data)))
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native input worker did not become ready: '+errors.join(''))),8000);child.on('message',message=>{if(message.type==='pulse')pulses.push(message.time);if(message.type==='ready'){clearTimeout(timer);resolve()}if(message.type==='failed'){clearTimeout(timer);reject(Error(message.message))}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Input worker exited '+code+': '+errors.join('')))})})
  await ready
  await new Promise(resolve=>setTimeout(resolve,100))
  const before=pulses.at(-1)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250)
  await new Promise(resolve=>setTimeout(resolve,80))
  const during=pulses.filter(time=>time>before&&time<before+250)
  assert.ok(during.length>=6,'Input worker must continue while the parent event loop is blocked')
  assert.ok(Math.max(...during.slice(1).map((time,index)=>time-during[index]))<100)
  child.postMessage({type:'stop'})
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Input worker did not stop')),3000);child.once('exit',()=>{clearTimeout(timer);resolve()})})
  child=undefined;console.log(JSON.stringify({nativeHookLoaded:true,isolatedFromMainStall:true,pulsesDuring250msStall:during.length,cleanStop:true}));app.exit(0)
}).catch(error=>{console.error(error);child?.kill();app.exit(1)})
setTimeout(()=>{child?.kill();app.exit(2)},15000).unref()
