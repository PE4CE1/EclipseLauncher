import { DEFAULT_PERFORMANCE_HOTKEY } from '../src/services/performanceHotkey'

interface Shortcuts { register(key:string,callback:()=>void):boolean; unregister(key:string):void }
export class PerformanceOverlayHotkey {
  private key=''
  private pending=false
  private lastActivated=-Infinity
  constructor(private shortcuts:Shortcuts,private toggle:()=>Promise<unknown>){}
  get binding(){return this.key}
  apply(value:unknown){
    const key=value===undefined?DEFAULT_PERFORMANCE_HOTKEY:typeof value==='string'?value.trim():null
    if(key===null||key.length>80||key!==''&&!/^[A-Za-z0-9]+(?:\+[A-Za-z0-9]+)+$/.test(key))throw new Error('Invalid performance overlay shortcut')
    if(key===this.key)return
    if(key){
      let registered=false
      try{registered=this.shortcuts.register(key,()=>{
        const now=Date.now()
        if(this.pending||now-this.lastActivated<300)return
        this.lastActivated=now;this.pending=true
        void Promise.resolve().then(this.toggle).catch(error=>console.warn('[Performance hotkey]',error)).finally(()=>{this.pending=false})
      })}catch{}
      if(!registered)throw new Error('Performance overlay shortcut is unavailable or already in use')
    }
    const previous=this.key;this.key=key
    if(previous)this.shortcuts.unregister(previous)
  }
  stop(){if(this.key)this.shortcuts.unregister(this.key);this.key=''}
}
