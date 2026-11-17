const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ffmpeg = require('ffmpeg-static')
const { exportEditedClip, inspectMedia, fitUploadDimensions } = require('./download-loader.cjs')()('electron/clipMedia.ts')

function directory(t) {
  const root = fs.mkdtempSync(path.join(__dirname, '.discord-export-'))
  t.after(() => {
    assert.equal(path.dirname(root), __dirname)
    assert.ok(path.basename(root).startsWith('.discord-export-'))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}
function generate(args) {
  execFileSync(ffmpeg, ['-nostdin','-hide_banner','-loglevel','error','-y',...args], { windowsHide: true, timeout: 120_000 })
}

test('upload resolution follows the actual video budget, FPS and aspect ratio without upscaling',()=>{
  assert.deepEqual(fitUploadDimensions(1920,1080,5_100_000,60),[1920,1080])
  assert.deepEqual(fitUploadDimensions(1920,1080,2_450_000,60),[1280,720])
  assert.deepEqual(fitUploadDimensions(1920,1080,2_450_000,30),[1280,720])
  assert.deepEqual(fitUploadDimensions(1920,1080,1_100_000,60),[960,540])
  assert.deepEqual(fitUploadDimensions(640,360,8_000_000,60),[640,360])
  assert.deepEqual(fitUploadDimensions(608,1080,2_450_000,60),[608,1080])
  const wide=fitUploadDimensions(3440,1440,2_450_000,60)
  assert.equal(wide[0],1280);assert.ok(Math.abs(wide[0]/wide[1]-3440/1440)<.02)
})

test('Discord compression uses almost 20 MB, retains 1080p and preserves trimmed separate audio', async t => {
  const root = directory(t), source = path.join(root, 'source.mp4'), mic = path.join(root, 'mic.wav'), output = path.join(root, 'discord.mp4')
  generate(['-f','lavfi','-i','testsrc2=size=1920x1080:rate=30,noise=alls=25:allf=t+u:all_seed=42',
    '-t','10','-c:v','libx264','-preset','ultrafast','-threads','4','-crf','10',source])
  generate(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','10',mic])
  assert.ok(fs.statSync(source).size > 20_000_000, 'Fixture must require compression')
  await exportEditedClip(ffmpeg, source, output, { start: 1, end: 10, cuts: [{ start: 3, end: 4 }],
    maxBytes: 20_000_000, separate: true, micFile: mic, gameVolume: 0, micVolume: .5 })
  const facts = await inspectMedia(ffmpeg, output)
  t.diagnostic(JSON.stringify(facts))
  assert.ok(facts.fileSize <= 20_000_000, 'Actual encoded bytes must respect the cap')
  assert.ok(facts.fileSize >= 19_000_000, 'Complex video should use at least 95% of the budget')
  assert.equal(facts.width, 1920)
  assert.equal(facts.height, 1080)
  assert.ok(Math.abs(facts.duration - 8) < .05)
  assert.equal(facts.averageFps, 30)
  assert.equal(facts.hasAudio, true)
  const pcm = execFileSync(ffmpeg, ['-v','error','-i',output,'-map','0:a:0','-ac','1','-ar','8000','-f','f32le','pipe:1'], { windowsHide: true })
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4)
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
  assert.ok(rms > .04 && rms < .05, 'Separate microphone audio must retain its selected volume')
})

test('small Discord clips retain 60 FPS without being padded to fill the upload limit', async t => {
  const root = directory(t), source = path.join(root, 'source.mp4'), output = path.join(root, 'discord.mp4')
  generate(['-f','lavfi','-i','testsrc2=size=320x180:rate=60','-t','1','-c:v','libx264','-preset','ultrafast',source])
  await exportEditedClip(ffmpeg, source, output, { start: 0, maxBytes: 20_000_000, separate: false, gameVolume: 1, micVolume: 1,
    encoder:()=>{throw Error('Direct copy must not probe or initialize an encoder')} })
  const facts = await inspectMedia(ffmpeg, output)
  assert.equal(facts.averageFps, 60)
  assert.equal(facts.width, 320)
  assert.equal(facts.height, 180)
  assert.ok(facts.fileSize < 500_000)
  assert.deepEqual(fs.readFileSync(output),fs.readFileSync(source),'A compatible original below 20 MB must copy byte-for-byte')
  const packets = file => execFileSync(ffmpeg, ['-v','error','-i',file,'-map','0:v:0','-c','copy','-f','framecrc','-'], { windowsHide: true }).toString().split('\n').filter(line => /^0,/.test(line)).map(line => line.split(',').slice(-2).join(','))
  assert.deepEqual(packets(output), packets(source), 'An already-small H264 clip must retain its exact encoded video packets')
})

test('small clips with edited microphone volume keep video packets but apply the audio change',async t=>{
  const root=directory(t),source=path.join(root,'source.mp4'),mic=path.join(root,'mic.wav'),output=path.join(root,'discord.mp4')
  generate(['-f','lavfi','-i','color=c=black:size=128x72:rate=30','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','1','-c:v','libx264','-c:a','aac',source])
  generate(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','1',mic])
  await exportEditedClip(ffmpeg,source,output,{start:0,maxBytes:20_000_000,separate:true,micFile:mic,gameVolume:1,micVolume:0})
  const pcm=execFileSync(ffmpeg,['-v','error','-i',output,'-map','0:a:0','-f','f32le','pipe:1'],{windowsHide:true})
  const samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.byteLength/4)
  assert.ok(samples.every(value=>Math.abs(value)<.001),'The direct-copy path must not bypass muting the microphone')
})

test('unchanged small WebM clips also copy without re-encoding or changing their container',async t=>{
  const root=directory(t),source=path.join(root,'source.webm'),output=path.join(root,'discord.webm')
  generate(['-f','lavfi','-i','testsrc2=size=128x72:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','5','-c:a','libopus',source])
  await exportEditedClip(ffmpeg,source,output,{start:0,maxBytes:20_000_000,separate:false,gameVolume:1,micVolume:1,encoder:()=>{throw Error('No encoder is needed')}})
  assert.deepEqual(fs.readFileSync(output),fs.readFileSync(source))
})

test('an unchanged MP4 just below 20 MB bypasses the former safety-reserve re-encode',async t=>{
  const root=directory(t),source=path.join(root,'source.mp4'),output=path.join(root,'discord.mp4')
  generate(['-f','lavfi','-i','color=c=black:size=128x72:rate=30','-t','1','-c:v','libx264',source])
  const bytes=19_990_000,padding=bytes-fs.statSync(source).size,box=Buffer.alloc(padding)
  box.writeUInt32BE(padding,0);box.write('free',4,'ascii');fs.appendFileSync(source,box)
  await exportEditedClip(ffmpeg,source,output,{start:0,maxBytes:20_000_000,separate:false,gameVolume:1,micVolume:1,
    encoder:()=>{throw Error('A file below the actual limit must not be re-encoded')}})
  assert.equal(fs.statSync(output).size,bytes)
  const hash=file=>require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  assert.equal(hash(output),hash(source))
})

test('a failed GPU export falls back to CPU without losing the selected cut or the file-size cap',async t=>{
  const root=directory(t),source=path.join(root,'source.mp4'),output=path.join(root,'discord.mp4')
  generate(['-f','lavfi','-i','testsrc2=size=1280x720:rate=30,noise=alls=25:allf=t+u:all_seed=42','-t','2','-c:v','libx264','-preset','ultrafast','-crf','10',source])
  const childProcess=require('node:child_process'),calls=[]
  const fallback=require('./download-loader.cjs')({'node:child_process':{...childProcess,execFile:(file,args,options,done)=>{
    calls.push(args)
    if(args.includes('h264_nvenc')){queueMicrotask(()=>done(new Error('NVENC is busy'),'','NVENC is busy'));return}
    return childProcess.execFile(file,args,options,done)
  }}})('electron/clipMedia.ts')
  await fallback.exportEditedClip(ffmpeg,source,output,{start:.2,end:1.7,maxBytes:1_000_000,separate:false,gameVolume:1,micVolume:1,encoder:'h264_nvenc'})
  const facts=await inspectMedia(ffmpeg,output)
  assert.ok(calls.some(args=>args.includes('h264_nvenc')))
  assert.ok(calls.some(args=>args.includes('-pass')&&args.includes('2')))
  assert.ok(Math.abs(facts.duration-1.5)<.05);assert.ok(facts.fileSize<=1_000_000)
  assert.equal(facts.width,1280);assert.equal(facts.height,720)
})

test('a small 30-second 1080p60 recording retains its resolution even when edited', async t => {
  const root = directory(t), source = path.join(root, 'source.mp4'), output = path.join(root, 'discord.mp4')
  generate(['-f','lavfi','-i','color=c=darkblue:size=1920x1080:rate=60',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
    '-t','30','-c:v','libx264','-preset','ultrafast','-threads','4','-c:a','aac',source])
  await exportEditedClip(ffmpeg, source, output, { start: .1, end: 30, maxBytes: 20_000_000,
    separate: false, gameVolume: 1, micVolume: 1 })
  const facts = await inspectMedia(ffmpeg, output)
  assert.equal(facts.width, 1920)
  assert.equal(facts.height, 1080)
  assert.equal(facts.averageFps, 60)
  assert.ok(Math.abs(facts.duration - 29.9) < .05)
  assert.equal(facts.hasAudio, true)
  assert.ok(facts.fileSize <= 20_000_000)
})
