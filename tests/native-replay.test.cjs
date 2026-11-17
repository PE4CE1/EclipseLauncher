const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),load=require('./download-loader.cjs')()
const {nativeGpuArguments,nativeRemuxArguments,selectNativeSegments}=load('electron/nativeReplay.ts'),{NativePcmSpool}=load('electron/nativeReplayAudio.ts')

test('GPU capture validates source handles and remuxes only compressed video',()=>{
  const options={fps:60,width:1280,height:720,bitrate:6,adapter:1,output:2,duration:30,monitor:'65537',hdr:true,white:200}
  const args=nativeGpuArguments(options);assert.equal(args[0],'--monitor');assert.ok(args.includes('--hdr'));assert.equal(args[args.indexOf('--white')+1],'200');assert.equal(args[args.indexOf('--bitrate')+1],'6000000')
  assert.ok(!args.some(arg=>/hwdownload|scale=/.test(arg)))
  for(const patch of [{monitor:'0'},{monitor:'1;evil'},{monitor:'18446744073709551616'},{window:'125'},{width:0}])assert.throws(()=>nativeGpuArguments({...options,...patch}))
  const window=nativeGpuArguments({...options,monitor:undefined,window:'4315',encoder:'libx264'});assert.equal(window[0],'--window');assert.ok(window.includes('--software'))
  const remux=nativeRemuxArguments();assert.equal(remux[remux.indexOf('-c:v')+1],'copy');assert.ok(!remux.includes('-vf'));assert.equal(remux[remux.indexOf('-i')+1],'pipe:0')
})

test('native GPU quality values and bounded segment arguments are validated',()=>{
  const options={fps:60,width:1280,height:720,bitrate:6,adapter:1,duration:30,monitor:'65537'}
  const args=nativeGpuArguments(options);assert.equal(args[args.indexOf('--adapter')+1],'1');assert.equal(args[args.indexOf('--fps')+1],'60')
  const segments=nativeRemuxArguments();assert.equal(segments[segments.indexOf('-segment_time')+1],'1');assert.equal(segments[segments.indexOf('-reset_timestamps')+1],'1');assert.ok(segments.includes('pipe:1'))
  for(const patch of [{duration:0},{width:0},{width:1279},{fps:1000},{fps:30.5},{bitrate:Infinity},{adapter:-1},{adapter:32}])assert.throws(()=>nativeGpuArguments({...options,...patch}))
})
test('native replay selects seconds of millisecond-timestamped history and refuses missing frames',()=>{
  const base=Date.now(),segments=Array.from({length:10},(_,i)=>({start:base+i*1000,end:base+(i+1)*1000}))
  assert.equal(selectNativeSegments(segments,base+9500,5).length,6)
  assert.equal(selectNativeSegments(segments,base+9500,5)[0],segments[4])
  assert.throws(()=>selectNativeSegments(segments,base+11000,5),/buffering/)
  assert.throws(()=>selectNativeSegments(segments.filter((_,i)=>i!==6),base+9500,5),/gap/)
})
test('native PCM disk history preserves channel samples and missing intervals without RAM-sized snapshots',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eclipse-native-audio-')),spool=new NativePcmSpool(path.join(directory,'audio'),5)
  t.after(async()=>{await spool.stop();fs.rmSync(directory,{recursive:true,force:true})})
  const start=Math.floor(Date.now()/2000)*2000,data=Buffer.alloc(19200)
  for(let i=0;i<data.length;i+=4){data.writeInt16LE(1234,i);data.writeInt16LE(-4321,i+2)}
  await Promise.all([spool.append(start,data),spool.append(start+200,data),spool.append(start+1950,data)])
  const file=path.join(directory,'snapshot.wav');assert.equal(await spool.snapshot(file,start,.3),true)
  const wav=fs.readFileSync(file);assert.equal(wav.readUInt32LE(40),.3*192000)
  assert.equal(wav.readInt16LE(44),1234);assert.equal(wav.readInt16LE(46),-4321)
  assert.equal(wav.readInt16LE(44+.15*192000),0)
  assert.equal(wav.readInt16LE(44+.25*192000),1234)
  const cross=path.join(directory,'cross.wav');await spool.snapshot(cross,start+1900,.2)
  const value=fs.readFileSync(cross);assert.equal(value.readInt16LE(44+.075*192000),1234);assert.equal(value.readInt16LE(44+.125*192000),1234)
  assert.equal(await spool.snapshot(path.join(directory,'missing.wav'),start+6000,.2),false)
})

test('native PCM packets remain sample-exact across disk buckets at fractional clock offsets',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eclipse-native-continuity-')),spool=new NativePcmSpool(path.join(directory,'audio'),5)
  t.after(async()=>{await spool.stop();fs.rmSync(directory,{recursive:true,force:true})})
  const start=Math.floor(Date.now()/2000)*2000-2000+1833.347,frames=14400,pcm=Buffer.alloc(frames*4)
  for(let i=0;i<frames;i++){const value=Math.round(Math.sin(i*2*Math.PI*997/48000)*12000);pcm.writeInt16LE(value,i*4);pcm.writeInt16LE(-value,i*4+2)}
  const writes=[];for(let i=0;i<frames;i+=480)writes.push(spool.append(start+i/48,pcm.subarray(i*4,(i+480)*4)))
  await Promise.all(writes)
  const file=path.join(directory,'continuous.wav');await spool.snapshot(file,start,frames/48000)
  assert.deepEqual(fs.readFileSync(file).subarray(44),pcm,'Packet/bucket boundaries must not insert, repeat, drop or replace samples')
  const boundaryDuration=(Math.floor(start/2000)*2000+2000-start)/1000,boundary=path.join(directory,'boundary.wav')
  await spool.snapshot(boundary,start,boundaryDuration)
  assert.deepEqual(fs.readFileSync(boundary).subarray(44),pcm.subarray(0,Math.ceil(boundaryDuration*48000)*4),'The rounded final frame must be read even when it falls in the next bucket')
})
