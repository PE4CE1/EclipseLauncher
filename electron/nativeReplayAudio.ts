import fs from 'node:fs'
import path from 'node:path'
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process'

function wavHeader(frames:number){const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+frames*4,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(192000,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(frames*4,40);return header}
type Bucket={file:string;start:number;tail:Promise<unknown>;handle:Promise<fs.promises.FileHandle>;pins:number}
/** Sparse two-second PCM files preserve wall-clock gaps without a large in-memory replay buffer. */
export class NativePcmSpool{
  private buckets=new Map<number,Bucket>()
  private pending=0
  private stopped=false
  private jobs=new Set<Promise<unknown>>()
  constructor(readonly directory:string,private seconds:number){}
  setDuration(seconds:number){this.seconds=seconds}
  append(time:number,data:Buffer){
    if(this.stopped)return
    if(!Number.isFinite(time)||Math.abs(time-Date.now())>15000||!data.length||data.length%4||data.length>192000||this.pending+data.length>2*1024*1024)throw new Error('Invalid native audio packet or stalled disk')
    this.pending+=data.length
    const firstFrame=Math.round(time*48)
    const work=(async()=>{
      let offset=0
      while(offset<data.length){
        const absoluteFrame=firstFrame+offset/4,bucketFrame=Math.floor(absoluteFrame/96000)*96000,bucketStart=bucketFrame/48
        const frame=absoluteFrame-bucketFrame
        const count=Math.min(data.length-offset,(96000-frame)*4)
        let bucket=this.buckets.get(bucketStart)
        if(!bucket){const file=path.join(this.directory,`${bucketStart}.pcm`),handle=fs.promises.mkdir(this.directory,{recursive:true}).then(()=>fs.promises.open(file,'wx+'));bucket={file,start:bucketStart,tail:handle,handle,pins:0};this.buckets.set(bucketStart,bucket)}
        const target=bucket,part=data.subarray(offset,offset+count)
        const write=target.tail.then(async()=>{const output=await target.handle;let at=0;while(at<part.length){const result=await output.write(part,at,part.length-at,frame*4+at);if(!result.bytesWritten)throw new Error('Native audio disk write stalled');at+=result.bytesWritten}})
        target.tail=write;await write;offset+=count
      }
      const cutoff=time-(this.seconds+6)*1000
      for(const [key,bucket]of this.buckets)if(key+2000<cutoff&&!bucket.pins){this.buckets.delete(key);await bucket.tail.catch(()=>{});await bucket.handle.then(handle=>handle.close()).catch(()=>{});await fs.promises.unlink(bucket.file).catch(()=>{})}
    })().finally(()=>{this.pending-=data.length;this.jobs.delete(work)})
    this.jobs.add(work);return work
  }
  async snapshot(file:string,start:number,duration:number):Promise<boolean>{
    if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0||duration>610)throw new Error('Invalid native audio interval')
    const frames=Math.ceil(duration*48000),startFrame=Math.round(start*48)
    const buckets=[...this.buckets.values()].filter(b=>b.start*48<startFrame+frames&&b.start*48+96000>startFrame)
    if(!buckets.length)return false
    buckets.forEach(b=>b.pins++)
    try{
      await Promise.all(buckets.map(b=>b.tail))
      const out=await fs.promises.open(file,'wx')
      try{
        await out.truncate(44+frames*4);await out.write(wavHeader(frames),0,44,0)
        for(const bucket of buckets){
          const bucketFrame=bucket.start*48,from=Math.max(0,startFrame-bucketFrame)*4,to=Math.min(96000,startFrame+frames-bucketFrame)*4
          const input=await fs.promises.open(bucket.file,'r'),buffer=Buffer.alloc(65536)
          try{for(let at=from;at<to;){const result=await input.read(buffer,0,Math.min(buffer.length,to-at),at);if(!result.bytesRead)break;const destination=44+(bucketFrame-startFrame)*4+at;let written=0;while(written<result.bytesRead){const value=await out.write(buffer,written,result.bytesRead-written,destination+written);if(!value.bytesWritten)throw new Error('Native audio snapshot stalled');written+=value.bytesWritten}at+=result.bytesRead}}
          finally{await input.close()}
        }
      }finally{await out.close()}
      return true
    }finally{buckets.forEach(b=>b.pins--)}
  }
  async stop(){this.stopped=true;await Promise.allSettled(this.jobs);for(const bucket of this.buckets.values()){await bucket.handle.then(handle=>handle.close()).catch(()=>{});await fs.promises.unlink(bucket.file).catch(()=>{})}this.buckets.clear();await fs.promises.rmdir(this.directory).catch(()=>{})}
}

export class NativeAudioReader{
  private child:ChildProcessWithoutNullStreams|undefined
  private stopped=false
  private retry:ReturnType<typeof setTimeout>|undefined
  private starting:Promise<boolean>|undefined
  available=false
  constructor(private helper:string,private args:string[],readonly spool:NativePcmSpool,private report:(available:boolean)=>void){}
  start():Promise<boolean>{
    if(this.stopped)return Promise.resolve(false)
    if(this.starting)return this.starting
    if(this.available)return Promise.resolve(true)
    const job=this.launch().finally(()=>{if(this.starting===job)this.starting=undefined});this.starting=job;return job
  }
  private launch():Promise<boolean>{
    return new Promise(resolve=>{
      if(this.stopped)return resolve(false)
      const child=this.child=spawn(this.helper,this.args,{windowsHide:true,stdio:['pipe','pipe','pipe']})
      let pending=Buffer.alloc(0),diagnostic='',ready=false,settled=false,ended=false
      const timer=setTimeout(()=>{child.kill();finish()},6500)
      const finish=()=>{
        if(ended)return;ended=true;clearTimeout(timer)
        this.available=false;this.report(false)
        if(!settled){settled=true;resolve(false)}
        if(!this.stopped&&this.child===child){this.retry=setTimeout(()=>void this.start(),/^DEVICE_CHANGED\r?$/m.test(diagnostic)?150:3000);this.retry.unref()}
      }
      child.once('error',finish);child.once('close',finish);child.stdin.on('error',()=>{})
      child.stderr.on('data',(data:Buffer)=>{diagnostic=(diagnostic+data.toString()).slice(-1024);if(!ready&&/^READY\r?$/m.test(diagnostic)){ready=true;clearTimeout(timer);this.available=true;this.report(true);if(!settled){settled=true;resolve(true)}}})
      child.stdout.on('data',(data:Buffer)=>{
        if(this.stopped||ended)return
        pending=Buffer.concat([pending,data]);if(pending.length>1024*1024){child.kill();finish();return}
        while(pending.length>=12){
          const time=pending.readDoubleLE(0),frames=pending.readUInt32LE(8),size=12+frames*4
          if(!Number.isFinite(time)||Math.abs(time-Date.now())>15000||!frames||frames>48000){child.kill();finish();return}
          if(pending.length<size)break
          try{void this.spool.append(time,Buffer.from(pending.subarray(12,size)))?.catch(()=>{child.kill();finish()})}catch{child.kill();finish();return}
          pending=pending.subarray(size)
        }
      })
    })
  }
  async retryNow(){clearTimeout(this.retry);if(this.available)return true;const old=this.child;this.child=undefined;if(old?.exitCode===null)await new Promise<void>(resolve=>{const timeout=setTimeout(resolve,1500);old.once('close',()=>{clearTimeout(timeout);resolve()});old.kill()});return this.start()}
  async stop(){this.stopped=true;clearTimeout(this.retry);const child=this.child;this.child=undefined;if(child&&child.exitCode===null){try{child.stdin.end()}catch{}await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve()},1500);child.once('close',()=>{clearTimeout(timer);resolve()})})}await this.spool.stop()}
}
