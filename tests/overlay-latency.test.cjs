const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),loadTs=require('./download-loader.cjs')

function gpuFixture(t){
  let now=1000;const originalNow=Date.now;Date.now=()=>now;t.after(()=>Date.now=originalNow)
  const children=[]
  const {GpuMetricsReader}=loadTs({'node:child_process':{spawn:(file,args,options)=>{
    assert.equal(file,'nvidia-smi');assert.ok(args.includes('--loop-ms=2000'));assert.equal(options.windowsHide,true)
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.kills=0
    child.kill=()=>{child.kills++;child.emit('exit',0)};children.push(child);return child
  }}})('electron/gpuMetricsReader.ts')
  const reader=new GpuMetricsReader();t.after(()=>reader.stop())
  return{reader,children,clock:time=>now=time}
}
test('GPU metrics reuse one driver process, handle partial lines and stop immediately on disable',t=>{
  const f=gpuFixture(t)
  assert.equal(f.reader.read(),undefined)
  f.children[0].stdout.emit('data','4');f.children[0].stdout.emit('data','2\r\n')
  assert.equal(f.reader.read(),42)
  for(let i=0;i<100;i++)assert.equal(f.reader.read(),42)
  assert.equal(f.children.length,1,'Polling must not launch a new GPU process every few seconds')
  f.clock(5000);f.children[0].stdout.emit('data','N/A\n200\n17\n');assert.equal(f.reader.read(),17)
  f.reader.stop();assert.equal(f.children[0].kills,1)
  f.children[0].stdout.emit('data','99\n')
  assert.equal(f.reader.read(),undefined,'A restarted sensor must not reuse stale GPU readings')
  assert.equal(f.children.length,2)
  f.children[0].emit('exit',1)
  f.children[1].stdout.emit('data','31\n');assert.equal(f.reader.read(),31)
})
test('GPU metrics expire stale values, bound stalled helpers and back off after failure',t=>{
  const f=gpuFixture(t);f.reader.read();f.children[0].stdout.emit('data','22\n')
  f.clock(8000);assert.equal(f.reader.read(),undefined)
  f.clock(12000);assert.equal(f.reader.read(),undefined);assert.equal(f.children[0].kills,1)
  f.clock(70000);f.reader.read();assert.equal(f.children.length,1)
  f.clock(73000);f.reader.read();assert.equal(f.children.length,2)
})
test('missing GPU tools are not respawned in a retry loop',t=>{
  const f=gpuFixture(t);f.reader.read()
  const error=new Error('Missing');error.code='ENOENT';f.children[0].emit('error',error)
  f.clock(1_000_000);assert.equal(f.reader.read(),undefined);assert.equal(f.children.length,1)
  f.reader.stop();f.reader.read();assert.equal(f.children.length,2,'An explicit re-enable may retry after a driver installation')
})
test('unchanged overlay selections do not take extra CPU samples or restart hardware services',t=>{
  t.mock.timers.enable({apis:['setInterval','setTimeout']})
  let cpuReads=0,gpuReads=0,gpuStops=0,fpsStarts=0;const sends=[]
  const window={isDestroyed:()=>false,isVisible:()=>true,webContents:{isLoadingMainFrame:()=>false,send:(_,payload)=>sends.push(payload)}}
  const service=loadTs({electron:{powerMonitor:{getSystemIdleTime:()=>0}},
    os:{cpus:()=>{cpuReads++;return[{times:{idle:cpuReads*100,user:0,nice:0,sys:0,irq:0}}]},totalmem:()=>1000,freemem:()=>500},
    './gpuMetricsReader':{GpuMetricsReader:class{read(){gpuReads++;return 24}stop(){gpuStops++}}},
    './gameFpsService':{startGameFpsMonitor(){fpsStarts++},stopGameFpsMonitor(){},getGameFpsSnapshot:()=>({gameFpsStatus:'idle'})},
  })('electron/metricsService.ts')
  t.after(service.stopMetricsService)
  const config={cpu:true,gpu:true,ram:false,fps:false,idle:false}
  service.startMetricsService(()=>window,config)
  assert.equal(cpuReads,2);assert.equal(gpuReads,1)
  for(let i=0;i<50;i++)service.startMetricsService(()=>window,{...config})
  assert.equal(cpuReads,2);assert.equal(gpuReads,1);assert.equal(fpsStarts,0)
  t.mock.timers.tick(1000);assert.equal(cpuReads,3);assert.equal(gpuReads,2)
  service.startMetricsService(()=>window,{...config,cpu:false,gpu:false})
  assert.equal(gpuStops,1)
  t.mock.timers.tick(5000);assert.equal(cpuReads,3);assert.equal(gpuReads,2)
})
test('performance widget repaints only for visible rounded values and never carries FPS across games',()=>{
  const {createPerformanceMetricsSelector}=loadTs()('src/services/performanceMetrics.ts')
  const select=createPerformanceMetricsSelector({cpu:true,gpu:false,ram:true,fps:true},42)
  const first=select({cpu:22.1,gpu:30,ram:50.1,gameFps:143.8,gameFpsPid:42,gameFpsStatus:'ready',frameTimeMs:6.9,idleTime:0})
  const repeated=select({cpu:22.3,gpu:80,ram:50.2,gameFps:144.1,gameFpsPid:42,gameFpsStatus:'ready',frameTimeMs:6.8,idleTime:99})
  assert.equal(first,repeated,'Invisible sensor changes must retain the same external-store snapshot')
  assert.equal(first.gpu,undefined);assert.equal(first.gameFps,144)
  assert.notEqual(select({...first,cpu:23,gameFpsPid:42}),first)
  const other=select({gameFps:240,gameFpsPid:55,gameFpsStatus:'ready',idleTime:0})
  assert.equal(other.gameFps,undefined);assert.equal(other.gameFpsStatus,'idle')
  assert.equal(createPerformanceMetricsSelector({fps:false},42)({gameFps:200,gameFpsPid:42,idleTime:0}).gameFps,undefined)
})
