const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const load = require('./download-loader.cjs')
const ffmpeg = require('ffmpeg-static')
const media = load()('electron/clipMedia.ts')
const { mediaByteRange, serveLocalMedia } = load()('electron/localMediaProtocol.ts')

function directory(t) {
  const target=fs.mkdtempSync(path.join(__dirname,'.clip-media-'))
  t.after(()=>{assert.equal(path.dirname(path.resolve(target)),path.resolve(__dirname));assert.ok(path.basename(target).startsWith('.clip-media-'));fs.rmSync(target,{recursive:true,force:true})})
  return target
}
function run(args) { return execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,maxBuffer:8*1024*1024}) }

test('media ranges stream exact bytes, suffixes and HEAD without allowing access outside the clip directory',async t=>{
  const root=directory(t),file=path.join(root,'clip.mp4');fs.writeFileSync(file,Buffer.from('0123456789'))
  const url=`local-media://file/${encodeURIComponent(file)}`
  for(const [range,text] of [['bytes=2-5','2345'],['bytes=7-','789'],['bytes=-3','789']]) {
    const response=await serveLocalMedia(new Request(url,{headers:{Range:range}}),[root])
    assert.equal(response.status,206);assert.equal(await response.text(),text);assert.equal(response.headers.get('Accept-Ranges'),'bytes')
  }
  const head=await serveLocalMedia(new Request(url,{method:'HEAD'}),[root]);assert.equal(head.headers.get('Content-Length'),'10');assert.equal(await head.text(),'')
  for(const range of ['bytes=10-','bytes=9-2','bytes=0-1,4-5','bytes=-0','bytes=foo']) assert.equal((await serveLocalMedia(new Request(url,{headers:{Range:range}}),[root])).status,416)
  assert.equal((await serveLocalMedia(new Request(url),[path.join(root,'different')])).status,404)
  assert.deepEqual(mediaByteRange('bytes=1-999',10),{start:1,end:9})
})

test('recording output fits the real source and caps requested resolution without upscaling',()=>{
  assert.deepEqual(media.fitClipDimensions(640,360,'4k'),[640,360])
  assert.deepEqual(media.fitClipDimensions(3840,2160,'720p'),[1280,720])
  const ultrawide=media.fitClipDimensions(3440,1440,'1080p');assert.equal(ultrawide[0],1920);assert.ok(ultrawide[1]<1080);assert.equal(ultrawide[1]%2,0)
})

test('native raw desktop and microphone tracks are processed in the final mix with their own sidecars',async t=>{
  const root=directory(t),video=path.join(root,'native.mp4'),desktop=path.join(root,'desktop.wav'),mic=path.join(root,'mic.wav')
  run(['-f','lavfi','-i','testsrc2=size=128x72:rate=24','-t','1','-c:v','libx264','-preset','ultrafast',video])
  run(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-af','pan=stereo|c0=c0|c1=c0','-t','1',desktop])
  run(['-f','lavfi','-i','aevalsrc=0.2*sin(2*PI*880*t)|0:s=48000','-t','1',mic])
  const output=path.join(root,'mixed.mp4'),desktopOut=path.join(root,'desktop.m4a'),micOut=path.join(root,'mic.m4a')
  const options={duration:1,fps:24,quality:'360p',bitrate:'6M',format:'mp4',encoder:()=>{throw new Error('The already encoded native video should be copied')},audio:{desktop:true,desktopPath:desktop,desktopGain:.5,desktopOutputPath:desktopOut,micPath:mic,micOutputPath:micOut,microphoneProcessing:{gain:.5,gateDb:-60,mono:true}}}
  const facts=await media.encodeReplay(ffmpeg,video,output,options)
  assert.equal(facts.videoCopied,true);assert.equal(facts.hasAudio,true)
  function channels(file){const pcm=run(['-i',file,'-ac','2','-ar','48000','-f','f32le','pipe:1']);return new Float32Array(pcm.buffer,pcm.byteOffset,pcm.byteLength/4)}
  const voice=channels(micOut),system=channels(desktopOut)
  let difference=0,voiceEnergy=0,desktopEnergy=0
  for(let i=0;i<voice.length;i+=2){difference+=Math.abs(voice[i]-voice[i+1]);voiceEnergy+=voice[i]**2}
  for(let i=0;i<system.length;i+=2)desktopEnergy+=system[i]**2
  assert.ok(difference/(voice.length/2)<.001,'Mono microphone processing must reach both output channels')
  assert.ok(Math.sqrt(voiceEnergy/(voice.length/2))>.03&&Math.sqrt(voiceEnergy/(voice.length/2))<.04,'Microphone gain must be applied exactly once')
  assert.ok(Math.sqrt(desktopEnergy/(system.length/2))>.04&&Math.sqrt(desktopEnergy/(system.length/2))<.05,'Desktop gain must be applied exactly once')
  const gated=path.join(root,'gated.m4a')
  await media.encodeReplay(ffmpeg,video,path.join(root,'gated.mp4'),{...options,audio:{micPath:mic,micOutputPath:gated,microphoneProcessing:{gain:.5,gateDb:-10,mono:true}}})
  const quiet=channels(gated);assert.ok(Math.max(...quiet.map(Math.abs))<.001,'The saved microphone sidecar must use the configured gate')
})

test('desktop audio survives its own sidecar, avoids doubled application audio and can be excluded from an export', async t => {
  const root = directory(t), source = path.join(root, 'desktop.mp4'), game = path.join(root, 'game.wav'), voice = path.join(root, 'voice.wav'), discord = path.join(root, 'discord.wav')
  run(['-f','lavfi','-i','testsrc2=size=128x72:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-preset','ultrafast','-c:a','aac',source])
  for (const [file, frequency] of [[game,880],[voice,1320],[discord,1760]]) run(['-f','lavfi','-i',`sine=frequency=${frequency}:sample_rate=48000`,'-t','1',file])
  const output = path.join(root, 'clip.mp4'), desktopFile = path.join(root, 'desktop.m4a'), gameFile = path.join(root, 'game.m4a'), micFile = path.join(root, 'mic.m4a'), discordFile = path.join(root, 'discord.m4a')
  await media.encodeReplay(ffmpeg,source,output,{duration:1,fps:24,quality:'360p',bitrate:'6M',format:'mp4',encoder:'libx264',audio:{desktop:true,desktopOutputPath:desktopFile,gamePath:game,gameOutputPath:gameFile,micPath:voice,micOutputPath:micFile,discordPath:discord,discordOutputPath:discordFile}})
  function tone(file, frequency) {
    const pcm=run(['-i',file,'-map','0:a:0','-ac','1','-ar','8000','-f','f32le','pipe:1']),samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.byteLength/4)
    let re=0,im=0;for(let i=0;i<samples.length;i++){const phase=2*Math.PI*frequency*i/8000;re+=samples[i]*Math.cos(phase);im+=samples[i]*Math.sin(phase)}return Math.hypot(re,im)*2/samples.length
  }
  assert.ok(tone(desktopFile,440)>.02); assert.ok(tone(gameFile,880)>.02); assert.ok(tone(discordFile,1760)>.02)
  assert.ok(tone(output,440)>.02); assert.ok(tone(output,1320)>.02)
  assert.ok(tone(output,880)<.001,'The game track must not be mixed over the full desktop mix')
  assert.ok(tone(output,1760)<.001,'Discord must not be mixed over the full desktop mix either')
  const edited=path.join(root,'edited.mp4')
  await media.exportEditedClip(ffmpeg,output,edited,{start:0,end:1,separate:true,gameFile,micFile,desktopFile,discordFile,desktopVolume:0,gameVolume:1,micVolume:0,discordVolume:1})
  assert.ok(tone(edited,880)>.02); assert.ok(tone(edited,440)<.001); assert.ok(tone(edited,1320)<.001)
  assert.ok(tone(edited,1760)>.02)
  const interruptedGame = path.join(root, 'interrupted-game.m4a')
  await media.encodeReplay(ffmpeg,source,path.join(root,'game-ended.mp4'),{duration:2,fps:24,quality:'360p',bitrate:'6M',format:'mp4',encoder:'libx264',audio:{desktop:true,gameOutputPath:interruptedGame,history:[{path:source,game}]}})
  assert.ok(tone(interruptedGame,880)>.01)
  assert.ok(tone(interruptedGame,440)<.001,'A missing game segment must become silence, never unrelated desktop audio')
})

test('real FFmpeg clips preserve frame rates, independent audio and correct exports',async t=>{
  const root=directory(t),source=path.join(root,'source.webm'),mic=path.join(root,'microphone.webm')
  run(['-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libvpx','-b:v','1M','-c:a','libopus',source])
  run(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-af',"volume='if(lt(t,1),0,0.8)':eval=frame",'-t','2','-c:a','libopus',mic])
  const gameFile=path.join(root,'game.m4a'),micFile=path.join(root,'mic.m4a'),output=path.join(root,'clip.mp4')
  const facts=await media.encodeReplay(ffmpeg,source,output,{previous:source,duration:3,fps:60,quality:'4k',bitrate:'6M',format:'mp4',encoder:'libx264',audio:{micPath:mic,gameOutputPath:gameFile,micOutputPath:micFile}})
  assert.equal(facts.width,640);assert.equal(facts.height,360);assert.equal(facts.averageFps,24);assert.equal(facts.frames,48)
  assert.ok(Math.abs(facts.duration-2)<.02,'A two-second source must not be labelled as a three-second clip')
  assert.equal(facts.fileSize,fs.statSync(output).size);assert.equal(facts.bitrate,facts.fileSize*8/facts.duration)
  const gamePeaks=await media.extractWaveform(ffmpeg,gameFile,facts.duration),micPeaks=await media.extractWaveform(ffmpeg,micFile,facts.duration)
  assert.equal(gamePeaks.length,240);assert.notDeepEqual(gamePeaks,micPeaks);assert.ok(Math.max(...micPeaks.slice(0,100))<.001);assert.ok(Math.max(...micPeaks.slice(150))>.05)
  const exported=path.join(root,'export.mp4')
  await media.exportEditedClip(ffmpeg,output,exported,{start:.5,end:1.5,separate:true,gameFile,micFile,gameVolume:.5,micVolume:0})
  const exportedFacts=await media.inspectMedia(ffmpeg,exported)
  assert.ok(Math.abs(exportedFacts.duration-1)<.05);assert.equal(exportedFacts.width,640);assert.ok(Math.abs(exportedFacts.averageFps-24)<.1)
  const pcm=run(['-i',exported,'-map','0:a:0','-ac','1','-ar','8000','-f','f32le','pipe:1'])
  const samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.byteLength/4)
  function tone(frequency){let re=0,im=0;for(let i=0;i<samples.length;i++){const angle=2*Math.PI*frequency*i/8000;re+=samples[i]*Math.cos(angle);im+=samples[i]*Math.sin(angle)}return Math.hypot(re,im)*2/samples.length}
  assert.ok(tone(440)>.01);assert.ok(tone(880)<tone(440)*.03,'Muted microphone must be absent from the exported audio')
  const silent=path.join(root,'silent.mp4')
  await media.exportEditedClip(ffmpeg,output,silent,{start:0,end:2,separate:true,gameFile,micFile,gameVolume:0,micVolume:0})
  assert.ok(Math.max(...await media.extractWaveform(ffmpeg,silent,2))<.0001,'Muting both tracks must export actual silence')

  for(const format of ['mkv','webm']) await t.test(`valid ${format} container`,async()=>{
    const file=path.join(root,`clip.${format}`)
    const result=await media.encodeReplay(ffmpeg,source,file,{duration:1,fps:60,quality:'720p',bitrate:'2.5M',format,encoder:'libx264'})
    assert.equal(result.width,640);assert.ok(Math.abs(result.averageFps-24)<.2);assert.equal(result.videoCodec,format==='webm'?'vp9':'h264')
  })
  await t.test('hardware failure retries the same complete replay with CPU',async()=>{
    const previous=path.join(root,'previous.webm');fs.copyFileSync(source,previous)
    const result=await media.encodeReplay(ffmpeg,source,path.join(root,'fallback.mp4'),{previous,duration:3,fps:60,quality:'720p',bitrate:'2M',format:'mp4',encoder:'intentionally-unavailable',audio:{micPath:mic,previousMicPath:mic,micOutputPath:path.join(root,'fallback.m4a')}})
    assert.ok(Math.abs(result.duration-3)<.05);assert.equal(result.frames,72)
  })
  await t.test('120 FPS input drops frames to the configured cap',async()=>{
    const fast=path.join(root,'fast.webm');run(['-f','lavfi','-i','testsrc2=size=128x72:rate=120','-t','1','-c:v','libvpx','-b:v','1M',fast])
    for(const fps of [24,30,60,120]){
      const result=await media.encodeReplay(ffmpeg,fast,path.join(root,`capped-${fps}.mp4`),{duration:1,fps,quality:'720p',bitrate:'1M',format:'mp4',encoder:'libx264'})
      assert.ok(Math.abs(result.averageFps-fps)<=1,`${fps} FPS: ${JSON.stringify(result)}`);assert.ok(result.frames<=fps+1)
    }
  })
})

test('suitable H264 replay segments copy identical frames and skip GPU probing while edits still encode', async t => {
  const root = directory(t), source = path.join(root,'source.mp4'), mic = path.join(root,'mic.wav')
  run(['-f','lavfi','-i','testsrc2=size=640x360:rate=60','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-preset','ultrafast','-b:v','2M','-c:a','aac',source])
  run(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','2',mic])
  let probes = 0
  const options = { duration:30, fps:60, quality:'720p', bitrate:'6M', format:'mp4', encoder:async()=>{ probes++;return 'libx264' } }
  const output = path.join(root,'copied.mp4'), game = path.join(root,'game.m4a'), voice = path.join(root,'voice.m4a')
  const copied = await media.encodeReplay(ffmpeg,source,output,{...options,audio:{micPath:mic,gameOutputPath:game,micOutputPath:voice}})
  assert.equal(copied.videoCopied,true);assert.equal(probes,0);assert.equal(copied.frames,120);assert.equal(copied.duration,2)
  const pixels = file => run(['-i',file,'-map','0:v:0','-f','framemd5','-']).toString().split(/\r?\n/).filter(line=>/^0,/.test(line)).map(line=>line.split(',').at(-1).trim())
  assert.deepEqual(pixels(output),pixels(source),'The fast path must preserve every original video frame')
  const gamePeaks = await media.extractWaveform(ffmpeg,game,2), micPeaks = await media.extractWaveform(ffmpeg,voice,2)
  assert.ok(Math.max(...gamePeaks)>.05);assert.ok(Math.max(...micPeaks)>.05)
  const trimmed = await media.encodeReplay(ffmpeg,source,path.join(root,'trimmed.mp4'),{...options,duration:1})
  assert.equal(trimmed.videoCopied,false);assert.equal(trimmed.frames,60)
  const capped = await media.encodeReplay(ffmpeg,source,path.join(root,'capped.mp4'),{...options,fps:30})
  assert.equal(capped.videoCopied,false);assert.equal(capped.frames,60);assert.equal(probes,2)
})

test('trimming a variable-frame-rate recording across a capture stall retains the selected audio/video duration', async t => {
  const root=directory(t),source=path.join(root,'vfr.mp4'),output=path.join(root,'trim.mp4')
  run(['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-vf',"select='not(between(t,0.5,1))'",'-fps_mode','vfr','-t','4','-c:v','libx264','-preset','ultrafast','-c:a','aac',source])
  await media.exportEditedClip(ffmpeg,source,output,{start:.6,end:3.1,separate:false,gameVolume:1,micVolume:1})
  const facts=await media.inspectMedia(ffmpeg,output)
  assert.ok(Math.abs(facts.duration-2.5)<.06,'A capture stall at the start must not shorten the edit: '+facts.duration)
})
