// Offline quality comparison; VMAF never runs in the interactive export path.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict')
const ffmpeg=require('ffmpeg-static'),{exportEditedClip,inspectMedia}=require('./download-loader.cjs')()('electron/clipMedia.ts')
const run=args=>new Promise((resolve,reject)=>cp.execFile(ffmpeg,['-nostdin','-hide_banner','-y',...args],{windowsHide:true,timeout:120000,maxBuffer:200000},(error,_out,stderr)=>error?reject(new Error(stderr||error.message)):resolve(stderr)))
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eclipse-discord-quality-'))
  try{
    const source=path.join(root,'reference.mp4'),previous=path.join(root,'1080p.mp4'),adaptive=path.join(root,'adaptive.mp4'),maxBytes=3_333_333
    await run(['-loglevel','error','-f','lavfi','-i','testsrc2=size=1920x1080:rate=60','-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
      '-t','10','-c:v','libx264','-preset','ultrafast','-threads','8','-b:v','10M','-c:a','aac','-b:a','192k',source])
    let rate=Math.floor((Math.floor(maxBytes*.992)-Math.ceil(maxBytes*.001)-8192)*8/10-192000)
    for(let attempt=0;attempt<3;attempt++){
      await run(['-loglevel','error','-i',source,'-map','0:v:0','-map','0:a:0','-c:v','h264_nvenc','-preset','p4','-rc','vbr','-multipass','qres','-cq','18',
        '-b:v',String(rate),'-maxrate',String(Math.floor(rate*1.05)),'-bufsize',String(rate*2),'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',previous])
      const bytes=fs.statSync(previous).size;if(bytes<=maxBytes)break
      rate=Math.floor(rate*(maxBytes*.987-240000)/(bytes-240000))
    }
    const start=performance.now()
    await exportEditedClip(ffmpeg,source,adaptive,{start:0,maxBytes,separate:false,gameVolume:1,micVolume:1,encoder:'h264_nvenc'})
    const exportMs=Math.round(performance.now()-start)
    const measure=async file=>{
      const facts=await inspectMedia(ffmpeg,file)
      assert.ok(facts.fileSize<=maxBytes);assert.equal(facts.averageFps,60)
      const log=await run(['-i',file,'-i',source,'-lavfi','[0:v]scale=1920:1080:flags=lanczos,setpts=PTS-STARTPTS[dist];[1:v]setpts=PTS-STARTPTS[ref];[dist][ref]libvmaf=n_threads=4:n_subsample=6','-an','-f','null','-'])
      const score=Number(/VMAF score: ([\d.]+)/.exec(log)?.[1]);assert.ok(Number.isFinite(score))
      return{width:facts.width,height:facts.height,bytes:facts.fileSize,vmaf:score}
    }
    const result={scenario:'1080p60 at the bitrate available for a one-minute 20 MB clip',previous:await measure(previous),adaptive:await measure(adaptive),adaptiveExportMs:exportMs}
    fs.mkdirSync(path.resolve(__dirname,'../.cache'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../.cache/discord-adaptive-quality.json'),JSON.stringify(result,null,2))
    console.log(JSON.stringify(result))
  }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('eclipse-discord-quality-'));fs.rmSync(root,{recursive:true,force:true})}
}
main().catch(error=>{console.error(error);process.exitCode=1})
