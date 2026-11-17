import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type MediaFilter = 'all' | 'spotify' | 'youtube'
export type MediaReply = { Id:number; Success:boolean; Error?:string; App?:string|null; SessionId?:string; Title?:string; Artist?:string; Album?:string; IsPlaying?:boolean; Cover?:string; HasCover?:boolean; Controls?:{playPause:boolean;next:boolean;previous:boolean} }
export const mediaFilter = (value:unknown):MediaFilter => value==='spotify'||value==='youtube'?value:'all'

export class MediaTransport {
  private child:ChildProcessWithoutNullStreams|null=null
  private ready:Promise<boolean>|null=null
  private readyFinish:((value:boolean)=>void)|undefined
  private startup:ReturnType<typeof setTimeout>|undefined
  private idle:ReturnType<typeof setTimeout>|undefined
  private pending:{id:number;finish:(reply:MediaReply|null)=>void}|undefined
  private sequence=0
  private epoch=0
  private count=0
  private stopped=false
  private queue:Promise<unknown>=Promise.resolve()

  private start():Promise<boolean> {
    if(this.ready)return this.ready
    if(this.stopped||process.platform!=='win32')return Promise.resolve(false)
    this.ready=new Promise(resolve=>{this.readyFinish=resolve})
    const ready=this.ready
    try{
      const root=app?.getAppPath?.()??process.cwd()
      const candidates=[path.join(root,'electron/native/MediaSessionHost.exe').replace(/([\\/])app\.asar([\\/])/i,'$1app.asar.unpacked$2'),path.join(__dirname,'../electron/native/MediaSessionHost.exe')]
      const helper=candidates.find(file=>fs.existsSync(file))
      if(!helper)throw new Error('Native Windows media helper is missing')
      const child=this.child=spawn(helper,[],{windowsHide:true,stdio:['pipe','pipe','pipe']})
      const decoder=new StringDecoder('utf8');let buffer=''
      const failed=()=>{if(this.child===child)this.suspend()}
      child.once('error',failed);child.once('close',failed);child.stdin.on('error',failed)
      child.stderr.on('data',()=>{})
      this.startup=setTimeout(failed,7000);this.startup.unref()
      child.stdout.on('data',(data:Buffer)=>{
        if(this.child!==child)return
        buffer+=decoder.write(data)
        if(buffer.length>1024*1024){failed();return}
        let end:number
        while((end=buffer.indexOf('\n'))!==-1){
          const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1)
          if(line==='READY'){clearTimeout(this.startup);this.readyFinish?.(true);this.readyFinish=undefined}
          else if(line.startsWith('JSON:'))try{
            const reply=JSON.parse(line.slice(5)) as MediaReply
            if(reply.Id===this.pending?.id)this.pending.finish(reply)
          }catch{}
        }
      })
    }catch{this.suspend()}
    return ready
  }

  send(command:'GET'|'TOGGLE'|'NEXT'|'PREV',filter:MediaFilter='all',sessionId?:string):Promise<MediaReply|null> {
    if(this.stopped||this.count>=8||sessionId!==undefined&&(typeof sessionId!=='string'||sessionId.length>1000))return Promise.resolve(null)
    const epoch=this.epoch
    this.count++
    const request=this.queue.then(async()=>{
      if(this.stopped||epoch!==this.epoch)return null
      clearTimeout(this.idle);this.idle=setTimeout(()=>this.suspend(),30000);this.idle.unref()
      if(!await this.start()||epoch!==this.epoch||!this.child)return null
      const child=this.child,id=++this.sequence
      return new Promise<MediaReply|null>(resolve=>{
        const timer=setTimeout(()=>{if(this.pending?.id===id)this.suspend()},5500)
        const finish=(reply:MediaReply|null)=>{clearTimeout(timer);if(this.pending?.id===id)this.pending=undefined;resolve(reply)}
        this.pending={id,finish}
        try{child.stdin.write(`${id} ${command} ${mediaFilter(filter)} ${sessionId?Buffer.from(sessionId,'utf8').toString('base64'):'-'}\n`)}catch{this.suspend()}
      })
    }).finally(()=>{this.count--})
    this.queue=request.catch(()=>null)
    return request
  }

  suspend():void {
    this.epoch++;clearTimeout(this.startup);clearTimeout(this.idle)
    this.readyFinish?.(false);this.readyFinish=undefined;this.ready=null
    const pending=this.pending;this.pending=undefined;pending?.finish(null)
    const child=this.child;this.child=null;child?.kill()
  }
  stop():void {this.stopped=true;this.suspend()}
}
