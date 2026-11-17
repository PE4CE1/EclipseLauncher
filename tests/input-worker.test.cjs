const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),load=require('./download-loader.cjs')
const {createInputCollector}=require('../electron/inputWorker.cjs')
test('isolated input drops high-rate mouse motion and coalesces clicks before IPC',t=>{
  t.mock.timers.enable({apis:['setInterval']});const messages=[];let now=1000,starts=0,stops=0
  const hook={start(){starts++},stop(){stops++},removeAllListeners(){}}
  const collector=createInputCollector(hook,{Tab:15,Space:57},value=>messages.push(value),()=>now)
  t.after(collector.stop);collector.start();collector.start();assert.equal(starts,1)
  for(let i=0;i<8000;i++)hook.handler({type:9,x:i,y:i});assert.equal(messages.length,0)
  for(let i=0;i<4;i++){hook.handler({type:7,button:1});now+=10}
  assert.equal(messages.length,0);t.mock.timers.tick(40);assert.equal(messages[0].lmb,4)
  hook.handler({type:4,keycode:15});hook.handler({type:4,keycode:15});assert.equal(messages.filter(message=>message.type==='scoreboard').length,1)
  collector.bind('Space');assert.equal(messages.at(-1).open,false)
  hook.handler({type:4,keycode:57});hook.handler({type:5,keycode:57});assert.equal(messages.at(-1).open,false)
  now+=1100;t.mock.timers.tick(40);assert.equal(messages.at(-1).total,0)
})
test('main input service only forwards bounded messages, isolates crashes and stops on disable',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const children=[],messages=[]
  const service=load({electron:{app:{getAppPath:()=>process.cwd()},utilityProcess:{fork:(file,_args,options)=>{
    assert.ok(file.endsWith('inputWorker.cjs'));assert.equal(options.serviceName,'Eclipse input')
    const child=new EventEmitter();child.postMessage=value=>{child.sent=value};child.kill=()=>{child.killed=true;child.emit('exit',0)};children.push(child);return child
  }}},'uiohook-napi':new Proxy({},{get(){throw Error('Global hooks must not load in main')}})})('electron/inputService.ts')
  t.after(service.stopInputService)
  const window={isDestroyed:()=>false,webContents:{send:(channel,value)=>messages.push({channel,value})}}
  service.startInputService(window);service.startInputService(window);assert.equal(children.length,1)
  children[0].emit('message',{type:'ready'});assert.equal(children[0].sent.key,'Tab')
  children[0].emit('message',{type:'cps',lmb:5,rmb:2});assert.equal(messages.at(-1).value.total,7)
  const length=messages.length;children[0].emit('message',{type:'cps',lmb:1e9,rmb:0});assert.equal(messages.length,length)
  children[0].emit('exit',1);service.startInputService(window);assert.equal(children.length,1)
  t.mock.timers.tick(1000);assert.equal(children.length,2)
  service.setInputKeybinds('Space','Select');assert.equal(children[1].sent.key,'Space')
  service.stopInputService();assert.equal(children[1].killed,true);t.mock.timers.tick(10000);assert.equal(children.length,2)
})

test('a worker launch failure cannot repeatedly spawn on overlay reconciliation',t=>{
  let launches=0
  const service=load({electron:{app:{getAppPath:()=>process.cwd()},utilityProcess:{fork(){launches++;throw Error('Worker unavailable')}}}})('electron/inputService.ts')
  t.after(service.stopInputService)
  t.mock.method(console,'warn',()=>{})
  const window={isDestroyed:()=>false,webContents:{send(){}}}
  service.startInputService(window);service.startInputService(window)
  assert.equal(launches,1)
  service.stopInputService();service.startInputService(window)
  assert.equal(launches,2,'Explicitly re-enabling input allows another attempt')
})
