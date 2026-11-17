const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')()
const {NativeVideoReplay}=load('electron/nativeReplay.ts'),{inspectMedia,encodeReplay}=load('electron/clipMedia.ts')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
;(async()=>{
  const root=fs.mkdtempSync(path.resolve('.cache/native-replay-')),ffmpeg=require('ffmpeg-static')
  const large=process.env.ECLIPSE_NATIVE_PROBE_720==='1',fps=large?60:30,width=large?1280:640,height=large?720:360,bitrate=large?'6M':'1.5M'
  const display=JSON.parse(require('node:child_process').execFileSync(path.resolve('electron/native/NativeDisplayInfo.exe'),[],{encoding:'utf8'}))[0]
  const failures=[],video=new NativeVideoReplay(ffmpeg,path.join(root,'record'),{fps,width,height,bitrate:large?6:1.5,adapter:display.adapter,output:display.index,monitor:display.monitor,hdr:display.hdr,white:display.white,duration:5},error=>failures.push(error))
  try{
    const start=Date.now(),ready=await video.start()
    await wait(3500)
    const end=Date.now(),raw=path.join(root,'snapshot.mp4'),snapshot=await video.snapshot(end,5,raw)
    snapshot.release()
    const rawFacts=await inspectMedia(ffmpeg,raw)
    console.log(JSON.stringify({segments:video.segments,interval:{start:snapshot.start,end:snapshot.end},rawFacts}))
    assert.ok(rawFacts.duration>3&&rawFacts.duration<8,JSON.stringify(rawFacts))
    assert.equal(rawFacts.width,width);assert.equal(rawFacts.height,height)
    const output=path.join(root,'clip.mp4'),facts=await encodeReplay(ffmpeg,raw,output,{duration:5,fps,quality:large?'720p':'360p',bitrate,format:'mp4',encoder:'h264_nvenc'})
    assert.ok(facts.duration>=3&&facts.duration<=5.1,JSON.stringify(facts))
    assert.ok(facts.averageFps>=fps*.94&&facts.averageFps<=fps+1,JSON.stringify(facts))
    assert.deepEqual(failures,[])
    console.log(JSON.stringify({success:true,startupMs:Date.now()-start-(Date.now()-end)-3500,encoder:ready.encoder,width:facts.width,height:facts.height,fps:facts.averageFps,duration:facts.duration,rawDuration:rawFacts.duration,wallErrorMs:Math.round((snapshot.end-snapshot.start)-rawFacts.duration*1000),directory:root}))
  }finally{await video.stop();fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error.stack);process.exitCode=1})
