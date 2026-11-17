import { MAX_CROSSHAIR_IMAGE_LENGTH, validCrosshairImage } from './crosshairConfig'
import { inspectCrosshairWebp } from './crosshairWebp'

export type CrosshairImageErrorCode='format'|'size'|'dimensions'|'decode'|'empty'
export class CrosshairImageError extends Error { constructor(public code:CrosshairImageErrorCode){super(code)} }
export function crosshairPngDimensions(bytes:ArrayBuffer):{width:number;height:number} {
  if(bytes.byteLength>2*1024*1024)throw new CrosshairImageError('size')
  const view=new DataView(bytes)
  if(bytes.byteLength<33||view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a||view.getUint32(8)!==13||view.getUint32(12)!==0x49484452)throw new CrosshairImageError('format')
  const width=view.getUint32(16),height=view.getUint32(20)
  if(!width||!height||width>1024||height>1024)throw new CrosshairImageError('dimensions')
  return{width,height}
}
export async function importCrosshairPng(file:File):Promise<{imageData:string;imageName:string}> {
  if(file.size>2*1024*1024)throw new CrosshairImageError('size')
  const bytes=await file.arrayBuffer(),{width,height}=crosshairPngDimensions(bytes)
  return {imageData:await rasterizeCrosshair(bytes,width,height,'image/png'),imageName:file.name.replace(/[\x00-\x1f]/g,'').slice(0,80)}
}
export async function compactStaticCrosshairWebp(data:string):Promise<string> {
  if(data.length>Math.ceil(2*1024*1024/3)*4+23||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw new CrosshairImageError('format')
  const bytes=Uint8Array.from(atob(data.slice(23)),char=>char.charCodeAt(0)),details=inspectCrosshairWebp(bytes)
  if(details.animated)throw new CrosshairImageError('format')
  return rasterizeCrosshair(bytes.buffer,details.width,details.height,'image/webp')
}
async function rasterizeCrosshair(bytes:ArrayBuffer,width:number,height:number,type:string):Promise<string> {
  const scale=Math.min(1,256/Math.max(width,height))
  let bitmap:ImageBitmap|undefined
  const canvas=document.createElement('canvas')
  try {
    bitmap=await createImageBitmap(new Blob([bytes],{type}),{resizeWidth:Math.max(1,Math.round(width*scale)),resizeHeight:Math.max(1,Math.round(height*scale))})
    canvas.width=bitmap.width;canvas.height=bitmap.height
    const context=canvas.getContext('2d');if(!context)throw new CrosshairImageError('decode')
    context.drawImage(bitmap,0,0)
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data
    if(!pixels.some((alpha,index)=>index%4===3&&alpha>0))throw new CrosshairImageError('empty')
    let imageData=canvas.toDataURL('image/png')
    if(imageData.length>MAX_CROSSHAIR_IMAGE_LENGTH){canvas.width=Math.max(1,Math.round(bitmap.width/2));canvas.height=Math.max(1,Math.round(bitmap.height/2));context.drawImage(bitmap,0,0,canvas.width,canvas.height);imageData=canvas.toDataURL('image/png')}
    if(!validCrosshairImage(imageData))throw new CrosshairImageError('size')
    return imageData
  }catch(error){if(error instanceof CrosshairImageError)throw error;throw new CrosshairImageError('decode')}
  finally{bitmap?.close();canvas.width=1;canvas.height=1}
}
