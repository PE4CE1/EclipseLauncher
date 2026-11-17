import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

export async function storeClipThumbnail(directory:string,id:string,value:string):Promise<{url:string;file?:string}> {
  if(!/^clip_[\w-]+$/.test(id)||typeof value!=='string')return{url:typeof value==='string'?value:''}
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if(!match||value.length>5*1024**2)return{url:value}
  const extension=match[1]==='jpeg'?'jpg':match[1]
  const file=path.join(directory,`${id}.thumb.${extension}`),temporary=file+'.'+randomUUID()+'.tmp'
  try {
    await fs.promises.writeFile(temporary,Buffer.from(match[2],'base64'),{flag:'wx'})
    await fs.promises.rename(temporary,file)
    return{url:'local-media://file/'+encodeURIComponent(file.replace(/\\/g,'/')),file}
  }finally{await fs.promises.unlink(temporary).catch(()=>{})}
}
export function removeClipThumbnail(directory:string,id:string) {
  if(!/^clip_[\w-]+$/.test(id))return
  for(const extension of ['jpg','png','webp']) {
    const file=path.join(directory,`${id}.thumb.${extension}`)
    try{fs.unlinkSync(file)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  }
}
