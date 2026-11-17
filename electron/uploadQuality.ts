import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ClipRange } from '../src/services/clipEdits'

export function uploadHardwareEncoding(encoder:string,rate:number):string[]{
  return ['-c:v',encoder,...(encoder==='h264_nvenc'?['-preset','p4','-rc','vbr','-multipass','qres','-cq','18']
    :encoder==='h264_amf'?['-usage','transcoding','-quality','balanced','-rc','vbr_peak']:['-preset','fast']),
    '-b:v',String(rate),'-maxrate',String(Math.floor(rate*(encoder==='h264_nvenc'?1.05:1.1))),'-bufsize',String(rate*2)]
}

type Dimensions=[number,number]
type Run=(args:string[],timeout:number)=>Promise<{stderr:string}>

/** Compare a few real frames, rather than assuming fewer pixels always look better. */
export async function chooseUploadDimensions(options:{source:string;cropWidth:number;cropHeight:number;cropX:number;fps:number;rate:number;encoder:string;ranges:ClipRange[];full:Dimensions;suggested:Dimensions},run:Run):Promise<Dimensions>{
  const {full,suggested}=options
  if(full[0]===suggested[0]&&full[1]===suggested[1])return full
  let directory:string|undefined
  const deadline=Date.now()+6500
  const budget=()=>{const remaining=deadline-Date.now();if(remaining<200)throw new Error('Quality probe budget exhausted');return Math.min(2500,remaining)}
  try{
    directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'eclipse-upload-quality-'))
    const duration=options.ranges.reduce((sum,range)=>sum+range.end-range.start,0)
    const scores:number[]=[]
    for(const [index,dimensions] of [full,suggested].entries()){
      let total=0
      for(const fraction of [.3,.7]){
        let offset=duration*fraction,position=options.ranges[0].start,length=2
        for(const range of options.ranges){if(offset<range.end-range.start){position=range.start+offset;length=Math.min(length,range.end-position);break}offset-=range.end-range.start}
        if(length<.15)throw new Error('Quality sample is too short')
        const file=path.join(directory,`${index}-${fraction}.mp4`)
        const crop=`crop=${options.cropWidth}:${options.cropHeight}:${options.cropX}:(ih-oh)/2`
        await run(['-loglevel','error','-y','-ss',String(position),'-i',options.source,'-t',String(length),'-an',
          '-vf',`${crop},scale=${dimensions[0]}:${dimensions[1]},setsar=1`,...uploadHardwareEncoding(options.encoder,options.rate),'-pix_fmt','yuv420p','-fps_mode','vfr',file],budget())
        // Skip the preview's first GOP/initial bitrate ramp when scoring it.
        const warmup=Math.min(1,length/2)
        const reference=`${crop},scale=${full[0]}:${full[1]},setsar=1,setpts=PTS-STARTPTS`
        const comparison=`[0:v]scale=${full[0]}:${full[1]}:flags=lanczos,setpts=PTS-STARTPTS[d];[1:v]${reference}[r];[d][r]libvmaf=n_threads=2:n_subsample=${Math.max(1,Math.round(options.fps/10))}:shortest=1`
        const result=await run(['-ss',String(warmup),'-i',file,'-ss',String(position+warmup),'-i',options.source,'-filter_complex',comparison,'-t',String(length-warmup),'-an','-f','null','-'],budget())
        const score=Number(/VMAF score: ([\d.]+)/.exec(result.stderr)?.[1])
        if(!Number.isFinite(score))throw new Error('Quality metric unavailable')
        total+=score
      }
      scores.push(total/2)
    }
    const selected=scores[1]>scores[0]+1.5?suggested:full
    if(process.env.ECLIPSE_CLIP_QUALITY_DIAGNOSTICS==='1')console.log('[Upload quality]',JSON.stringify({scores,full,suggested,selected}))
    return selected
  }catch(error){
    if(process.env.ECLIPSE_CLIP_QUALITY_DIAGNOSTICS==='1')console.log('[Upload quality fallback]',String(error).slice(-500))
    return suggested
  }
  finally{
    if(directory&&path.dirname(directory)===path.resolve(os.tmpdir())&&path.basename(directory).startsWith('eclipse-upload-quality-'))await fs.promises.rm(directory,{recursive:true,force:true}).catch(()=>{})
  }
}
