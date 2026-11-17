import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

async function fingerprint(file:string){
  const stat=await fs.promises.stat(file)
  return [path.resolve(file),stat.size,stat.mtimeMs,stat.ctimeMs,stat.ino] as const
}

/** Retain only file references; exports on the clipboard keep their existing lifetime. */
export class ClipExportCache {
  private entries=new Map<string,{file:string;stamp:string}>()
  constructor(private capacity=8){if(!Number.isInteger(capacity)||capacity<1||capacity>64)throw new Error('Invalid clip export cache capacity')}
  async key(files:(string|undefined)[],edit:unknown):Promise<string>{
    const stamps=await Promise.all(files.filter((file):file is string=>!!file).map(fingerprint))
    return createHash('sha256').update(JSON.stringify([stamps,edit])).digest('hex')
  }
  async reuse(key:string,output:string,maxBytes:number):Promise<boolean>{
    const item=this.entries.get(key)
    if(!item)return false
    try{
      const stamp=await fingerprint(item.file)
      if(stamp[1]<=0||stamp[1]>maxBytes||JSON.stringify(stamp)!==item.stamp){this.entries.delete(key);return false}
      if(path.resolve(item.file)!==path.resolve(output))await fs.promises.copyFile(item.file,output)
      this.entries.delete(key);this.entries.set(key,item)
      return true
    }catch{this.entries.delete(key);return false}
  }
  async remember(key:string,file:string){
    const stamp=JSON.stringify(await fingerprint(file))
    this.entries.delete(key);this.entries.set(key,{file,stamp})
    while(this.entries.size>this.capacity)this.entries.delete(this.entries.keys().next().value!)
  }
}
