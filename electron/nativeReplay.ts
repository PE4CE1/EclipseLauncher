import fs from 'node:fs'
import path from 'node:path'
import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {randomUUID} from 'node:crypto'

export type NativeVideoOptions={fps:number;width:number;height:number;bitrate:number;adapter:number;duration:number;encoder?:string;monitor?:string;window?:string;hdr?:boolean;white?:number}
export function nativeGpuArguments(o:NativeVideoOptions):string[]{
  if(![o.fps,o.width,o.height,o.bitrate,o.adapter,o.duration].every(Number.isFinite)||![o.fps,o.width,o.height,o.adapter].every(Number.isInteger)||o.fps<24||o.fps>120||o.width<2||o.width>3840||o.height<2||o.height>2160||o.width%2||o.height%2||o.adapter<0||o.adapter>31||o.bitrate<1||o.bitrate>100||o.duration<5||o.duration>600)throw new Error('Invalid native capture options')
  const handle=o.window||o.monitor
  if(!handle||!/^\d{1,20}$/.test(handle)||BigInt(handle)===0n||BigInt(handle)>0xffffffffffffffffn||!!o.window===!!o.monitor)throw new Error('Invalid native capture handle')
  return[o.window?'--window':'--monitor',handle,'--adapter',String(o.adapter),'--width',String(o.width),'--height',String(o.height),'--fps',String(o.fps),'--bitrate',String(Math.round(o.bitrate*1000000)),...(o.hdr?['--hdr','--white',String(Math.round(Math.max(80,Math.min(1000,o.white||80))))]:[]),...(o.encoder==='libx264'?['--software']:[])]
}
export const nativeColorMetadata='h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0'
export const nativeColorArguments=['-bsf:v',nativeColorMetadata,'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv']
export function nativeRemuxArguments():string[]{return['-hide_banner','-loglevel','warning','-y','-analyzeduration','100000','-probesize','32768','-i','pipe:0','-map','0:v:0','-c:v','copy',...nativeColorArguments,'-f','segment','-segment_time','1','-reset_timestamps','1','-segment_format','mp4','-segment_format_options','movflags=+faststart','-segment_list_type','csv','-segment_list','pipe:1','video-%09d.mp4']}
type Segment={name:string;start:number;end:number;pins:number}
export function selectNativeSegments<T extends {start:number;end:number}>(segments:T[],end:number,duration:number):T[]{
  const selected=segments.filter(s=>s.end>end-duration*1000-100&&s.start<end)
  if(!selected.length||selected.at(-1)!.end<end-80)throw new Error('native-replay-buffering')
  for(let i=1;i<selected.length;i++)if(Math.abs(selected[i].start-selected[i-1].end)>100)throw new Error('native-replay-gap')
  return selected
}
export function runNativeTool(file:string,args:string[],timeout=30000,cwd?:string):Promise<string>{
  return new Promise((resolve,reject)=>execFile(file,['-nostdin',...args],{windowsHide:true,timeout,maxBuffer:1024*1024,cwd},(error,stdout,stderr)=>error?reject(new Error(String(stderr||error.message).slice(-1400))):resolve(String(stdout))))
}

/** WGC/D3D11 encodes GPU textures; FFmpeg remuxes only compressed fragments into a disk ring. */
export class NativeVideoReplay{
  private child:ChildProcessWithoutNullStreams|undefined
  private producer:ChildProcessWithoutNullStreams|undefined
  private segments:Segment[]=[]
  private stopped=false
  private waiters=new Set<()=>void>()
  private tail:Promise<unknown>=Promise.resolve()
  private failure:string|undefined
  private startupCancel:(()=>void)|undefined
  private snapshots=new Set<Promise<unknown>>()
  private previewCache:{name:string;job:Promise<string|undefined>}|undefined
  constructor(readonly ffmpeg:string,readonly directory:string,private options:NativeVideoOptions,private onFailure:(message:string)=>void,private host=path.join(__dirname,'native/NativeCaptureHost.exe')){}
  setDuration(seconds:number){if(!Number.isFinite(seconds)||seconds<5||seconds>600)throw new Error('Invalid replay duration');this.options.duration=seconds;void this.prune()}
  async start():Promise<{encoder:string;width:number;height:number;fps:number;gpuScaling?:boolean;hdrTonemapped?:boolean}>{
    await fs.promises.mkdir(this.directory,{recursive:true})
    if(this.stopped)throw new Error('Capture cancelled')
    try{const ready=await this.launchGpu();return{...ready,width:this.options.width,height:this.options.height,fps:this.options.fps}}
    catch(error){await this.kill();await this.tail;await this.cleanSegments();throw error}
  }
  private launchGpu():Promise<{encoder:string;gpuScaling:boolean;hdrTonemapped:boolean}>{
    const args=nativeGpuArguments(this.options)
    return new Promise((resolve,reject)=>{
      const mux=this.child=spawn(this.host,[this.ffmpeg,...nativeRemuxArguments()],{windowsHide:true,cwd:this.directory,stdio:['pipe','pipe','pipe']})
      const producer=this.producer=spawn(this.host,[path.join(path.dirname(this.host),'NativeVideoCapture.wgc.exe'),...args],{windowsHide:true,cwd:this.directory,stdio:['pipe','pipe','pipe']})
      let output='',diagnostics='',metadata='',settled=false,clock=0,encoder=''
      const timer=setTimeout(()=>fail('Native GPU capture did not produce frames'),12000)
      const fail=(message:string)=>{clearTimeout(timer);if(!settled){settled=true;reject(new Error(message))}else if(!this.stopped&&this.child===mux){this.failure=message;this.onFailure(message)}for(const wake of this.waiters)wake()}
      this.startupCancel=()=>fail('Capture cancelled')
      mux.stdin.on('error',()=>{});producer.stdin.on('error',()=>{});producer.stdout.pipe(mux.stdin)
      mux.once('error',error=>fail(error.message));producer.once('error',error=>fail(error.message))
      mux.once('close',()=>fail(diagnostics||'Native segment writer stopped'));producer.once('close',()=>fail(metadata||'Native GPU capture stopped'))
      mux.stderr.on('data',(data:Buffer)=>{diagnostics=(diagnostics+data).slice(-1800)})
      producer.stderr.on('data',(data:Buffer)=>{
        metadata=(metadata+data).slice(-4096)
        const ready=/ECLIPSE_READY (\{[^\r\n]+\})/.exec(metadata)
        if(ready&&!clock){try{const value=JSON.parse(ready[1]);if(!Number.isFinite(value.startWall)||Math.abs(value.startWall-Date.now())>15000||value.gpuScaling!==true||typeof value.encoder!=='string')throw new Error();clock=value.startWall;encoder=value.encoder}catch{fail('Invalid native GPU clock')}}
      })
      mux.stdout.on('data',(data:Buffer)=>{
        output+=data.toString();if(output.length>65536){fail('Invalid native segment response');void this.kill();return}
        let newline:number
        while((newline=output.indexOf('\n'))>=0){
          const line=output.slice(0,newline).trim();output=output.slice(newline+1)
          const match=/^video-(\d{9})\.mp4,([\d.]+),([\d.]+)$/.exec(line);if(!match)continue
          this.tail=this.tail.then(async()=>{
            if(this.stopped||this.child!==mux)return
            const start=clock+Number(match[2])*1000,end=clock+Number(match[3])*1000
            if(!clock||!Number.isFinite(end)||end<=start||Math.abs(end-Date.now())>15000)throw new Error('Native capture timestamps unavailable')
            this.segments.push({name:`video-${match[1]}.mp4`,start,end,pins:0})
            if(!settled){settled=true;clearTimeout(timer);this.startupCancel=undefined;resolve({encoder,gpuScaling:true,hdrTonemapped:!!this.options.hdr})}
            for(const wake of this.waiters)wake();await this.prune()
          }).catch(error=>fail(error.message))
        }
      })
    })
  }
  snapshot(end:number,duration:number,target:string):Promise<{start:number;end:number;release:()=>void}>{
    const job=this.snapshotInternal(end,duration,target).finally(()=>this.snapshots.delete(job));this.snapshots.add(job);return job
  }
  async preview(end=Date.now()):Promise<string|undefined>{
    if(this.stopped||this.failure)return
    await this.tail
    if(this.stopped||this.failure)return
    const segment=[...this.segments].reverse().find(part=>part.start<end)
    if(!segment)return
    if(this.previewCache?.name===segment.name)return this.previewCache.job
    segment.pins++
    const job=new Promise<string|undefined>(resolve=>execFile(this.ffmpeg,[
      '-nostdin','-hide_banner','-loglevel','error','-threads','1','-sseof','-0.12','-i',path.join(this.directory,segment.name),
      '-frames:v','1','-filter_threads','1','-vf','scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2',
      '-threads','1','-q:v','5','-f','image2pipe','-c:v','mjpeg','pipe:1',
    ],{windowsHide:true,timeout:1800,maxBuffer:256*1024,encoding:'buffer'},(error,image)=>resolve(!error&&image.length>100?'data:image/jpeg;base64,'+image.toString('base64'):undefined)))
      .finally(()=>{segment.pins--;this.snapshots.delete(job);void this.prune()})
    this.snapshots.add(job);this.previewCache={name:segment.name,job}
    return job
  }
  private async snapshotInternal(end:number,duration:number,target:string):Promise<{start:number;end:number;release:()=>void}>{
    if(this.stopped||this.failure)throw new Error('native-capture-stopped'+(this.failure?': '+this.failure:''))
    await this.tail
    const cutoff=end-duration*1000-3000
    const pinned=this.segments.filter(s=>s.end>=cutoff)
    pinned.forEach(s=>s.pins++)
    let released=false
    const release=()=>{if(released)return;released=true;pinned.forEach(s=>s.pins--);void this.prune()}
    try{
      if((this.segments.at(-1)?.end||0)<end-80)await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>{this.waiters.delete(check);reject(new Error('native-replay-timeout'))},3500)
        const check=()=>{if(this.stopped||this.failure){clearTimeout(timer);this.waiters.delete(check);reject(new Error('native-capture-stopped'))}else if((this.segments.at(-1)?.end||0)>=end-80){clearTimeout(timer);this.waiters.delete(check);resolve()}}
        this.waiters.add(check);check()
      })
      const selected=selectNativeSegments(this.segments,end,duration)
      for(const segment of selected)if(!pinned.includes(segment)){segment.pins++;pinned.push(segment)}
      const start=selected[0].start,take=(end-start)/1000
      const manifest=path.join(this.directory,randomUUID()+'.ffconcat')
      await fs.promises.writeFile(manifest,selected.map(s=>`file '${s.name}'`).join('\n'))
      try{await runNativeTool(this.ffmpeg,['-hide_banner','-loglevel','error','-y','-f','concat','-safe','1','-i',manifest,'-t',String(take),'-map','0:v:0','-c:v','copy','-avoid_negative_ts','make_zero','-movflags','+faststart',target],30000,this.directory)}
      finally{await fs.promises.unlink(manifest).catch(()=>{})}
      return{start,end,release}
    }catch(error){release();throw error}
  }
  private async prune(){
    const cutoff=Date.now()-(this.options.duration+5)*1000
    const retired=this.segments.filter(s=>s.end<cutoff&&!s.pins)
    this.segments=this.segments.filter(s=>!retired.includes(s))
    await Promise.all(retired.map(s=>fs.promises.unlink(path.join(this.directory,s.name)).catch(()=>{})))
  }
  private async kill(){
    const children=[this.producer,this.child];this.child=undefined;this.producer=undefined
    await Promise.all(children.map(async child=>{if(!child||child.exitCode!==null)return;await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve()},1500);child.once('close',()=>{clearTimeout(timer);resolve()});try{child.stdin.end()}catch{child.kill()}})}))
  }
  private async cleanSegments(){this.segments=[];for(const name of await fs.promises.readdir(this.directory).catch(()=>[]))if(/^video-\d{9}\.mp4$/.test(name))await fs.promises.unlink(path.join(this.directory,name)).catch(()=>{})}
  async stop(){if(this.stopped)return;this.stopped=true;this.startupCancel?.();for(const wake of this.waiters)wake();await this.kill();await this.tail;await Promise.allSettled(this.snapshots);await this.cleanSegments();await fs.promises.rmdir(this.directory).catch(()=>{})}
}
