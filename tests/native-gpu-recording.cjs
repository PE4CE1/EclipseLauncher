// Explicit local hardware test: no display, microphone or system settings are changed.
const {spawn,execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const ffmpeg=require('ffmpeg-static'),load=require('./download-loader.cjs')(),{inspectMedia}=load('electron/clipMedia.ts'),{nativeColorArguments}=load('electron/nativeReplay.ts')
async function record(hdr,software=false){
  const directory=fs.mkdtempSync(path.resolve('.cache/native-gpu-test-')),file=path.join(directory,'test.mp4')
  const producer=spawn(path.resolve('electron/native/NativeCaptureHost.exe'),[path.resolve('electron/native/NativeVideoCapture.wgc.exe'),'--self-test','--width','640','--height','360','--fps','30',...(hdr?['--hdr']:[]),...(software?['--software']:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']})
  const mux=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-i','pipe:0','-c:v','copy',...nativeColorArguments,'-movflags','+faststart',file],{windowsHide:true,stdio:['pipe','ignore','pipe']})
  let diagnostics='',muxError='';producer.stderr.on('data',b=>diagnostics+=b);mux.stderr.on('data',b=>muxError+=b);mux.stdin.on('error',()=>{});producer.stdout.pipe(mux.stdin)
  const timeout=setTimeout(()=>{producer.kill();mux.kill()},15000)
  try{
    const codes=await Promise.all([new Promise(resolve=>producer.once('close',resolve)),new Promise(resolve=>mux.once('close',resolve))])
    assert.deepEqual(codes,[0,0],diagnostics+'\n'+muxError)
    assert.match(diagnostics,/"gpuScaling":true/);assert.match(diagnostics,RegExp('"hdrTonemapped":'+hdr));assert.match(diagnostics,RegExp('media-foundation-'+(software?'software':'hardware')))
    const facts=await inspectMedia(ffmpeg,file);assert.equal(facts.width,640);assert.equal(facts.height,360);assert.ok(facts.averageFps>28&&facts.averageFps<32,JSON.stringify(facts));assert.ok(facts.duration>2.8&&facts.duration<3.3)
    const pixel=execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-i',file,'-frames:v','1','-vf','crop=2:2','-pix_fmt','rgb24','-f','rawvideo','pipe:1']).subarray(0,3)
    assert.ok(pixel[0]>pixel[1]&&pixel[1]>pixel[2],`Wrong color order: ${pixel.toString('hex')}`)
    assert.ok(pixel[0]>170&&pixel[0]<255,`Clipped or dark ${hdr?'HDR':'SDR'} output: ${pixel.toString('hex')}`)
    if(!hdr)for(const [i,target]of [204,77,26].entries())assert.ok(Math.abs(pixel[i]-target)<6,`Incorrect BT.709 color metadata: ${pixel.toString('hex')}`)
    console.log(JSON.stringify({hdr,facts,pixel:[...pixel],diagnostics:diagnostics.trim()}))
  }finally{clearTimeout(timeout);producer.kill();mux.kill();fs.rmSync(directory,{recursive:true,force:true})}
}
;(async()=>{await record(false);await record(true);await record(false,true)})().catch(error=>{console.error(error);process.exitCode=1})
