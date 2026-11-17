// Opt-in real-encoder benchmark; all recordings are synthetic and removed.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict')
const {execFile}=require('node:child_process'),ffmpeg=require('ffmpeg-static'),load=require('./download-loader.cjs')
const {exportEditedClip,inspectMedia}=load()('electron/clipMedia.ts')
const baseline=load({'node:os':{...os,availableParallelism:()=>6}})('electron/clipMedia.ts')
const {ClipExportCache}=load()('electron/clipExportCache.ts')
const run=args=>new Promise((resolve,reject)=>execFile(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,timeout:180000,maxBuffer:65536},(error,stdout,stderr)=>error?reject(new Error(stderr||error.message)):resolve(stdout)))
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eclipse-discord-benchmark-'))
  try{
    let encoder='libx264'
    for(const candidate of ['h264_nvenc','h264_amf','h264_qsv']){
      try{await run(['-f','lavfi','-i','color=black:s=640x360','-frames:v','1','-c:v',candidate,'-f','null','-']);encoder=candidate;break}catch{}
    }
    const source=path.join(root,'one-minute.mp4'),cpu=path.join(root,'cpu.mp4'),fast=path.join(root,'fast.mp4'),direct=path.join(root,'direct.mp4'),repeated=path.join(root,'repeated.mp4')
    await run(['-f','lavfi','-i','testsrc2=size=1920x1080:rate=60','-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
      '-t','60','-c:v','libx264','-preset','ultrafast','-threads','8','-b:v','10M','-maxrate','10M','-bufsize','20M','-c:a','aac','-b:a','192k',source])
    const options={start:0,maxBytes:20_000_000,separate:false,gameVolume:1,micVolume:1}
    let start=performance.now(),cpuMs
    if(!process.argv.includes('--gpu-only')){await baseline.exportEditedClip(ffmpeg,source,cpu,{...options,encoder:'libx264'});cpuMs=performance.now()-start}
    start=performance.now();await exportEditedClip(ffmpeg,source,fast,{...options,encoder});const fastMs=performance.now()-start
    const facts=await inspectMedia(ffmpeg,fast)
    assert.ok(facts.width===1280||facts.width===1920);assert.equal(facts.height,facts.width===1280?720:1080);assert.equal(facts.averageFps,60);assert.ok(facts.fileSize<=20_000_000)
    start=performance.now();await exportEditedClip(ffmpeg,fast,direct,{...options,encoder:()=>{throw Error('A direct copy must not encode')}});const directMs=performance.now()-start
    assert.deepEqual(fs.readFileSync(direct),fs.readFileSync(fast))
    const cache=new ClipExportCache(),key=await cache.key([source],options);await cache.remember(key,fast)
    start=performance.now();assert.equal(await cache.reuse(key,repeated,20_000_000),true);const repeatedMs=performance.now()-start
    const report={encoder,sourceBytes:fs.statSync(source).size,duration:60,resolution:facts.width+'x'+facts.height,fps:60,outputBytes:facts.fileSize,
      ...(cpuMs?{previousCpuExportMs:Math.round(cpuMs),speedup:Number((cpuMs/fastMs).toFixed(2))}:{}),newExportMs:Math.round(fastMs),directCopyMs:Math.round(directMs),cachedCopyMs:Math.round(repeatedMs)}
    const reportFile=path.resolve(__dirname,'../.cache/discord-copy-performance.json')
    fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify(report))
  }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('eclipse-discord-benchmark-'));fs.rmSync(root,{recursive:true,force:true})}
}
main().catch(error=>{console.error(error);process.exitCode=1})
