// Local diagnostic: reads packet timing only; no audio files are retained or played.
const {spawn}=require('node:child_process'),path=require('node:path')
async function inspect(kind){
  const child=spawn(path.resolve('electron/native',require('../electron/native/audio-capture.json').file),['--'+kind,'auto'],{windowsHide:true,stdio:['pipe','pipe','pipe']})
  let pending=Buffer.alloc(0),last,diagnostics='',count=0,frames=0,jumps=[]
  child.stderr.on('data',b=>diagnostics+=b);child.stdin.on('error',()=>{})
  child.stdout.on('data',bytes=>{pending=Buffer.concat([pending,bytes]);while(pending.length>=12){const time=pending.readDoubleLE(0),size=pending.readUInt32LE(8),length=12+size*4;if(size>48000){child.kill();return}if(pending.length<length)break;if(last)jumps.push((time-last.time)*48-last.frames);last={time,frames:size};frames+=size;count++;pending=pending.subarray(length)}})
  const stop=setTimeout(()=>child.stdin.end(),6000),kill=setTimeout(()=>child.kill(),8500)
  await new Promise(resolve=>child.once('close',resolve));clearTimeout(stop);clearTimeout(kill)
  const sorted=jumps.toSorted((a,b)=>a-b),pct=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]
  return{kind,count,frames,gapSamples:{min:pct(0),p50:pct(.5),p95:pct(.95),max:pct(1),sum:jumps.reduce((a,b)=>a+b,0),overHalfSample:jumps.filter(x=>Math.abs(x)>.5).length},diagnostics:diagnostics.trim()}
}
Promise.all(['microphone','desktop'].map(inspect)).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1})
