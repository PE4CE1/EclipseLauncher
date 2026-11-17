import { MAX_CROSSHAIR_WEBP_DATA_LENGTH } from './crosshairWebp'
export type CrosshairStyle = 'cross' | 'x' | 'circle' | 'square' | 'diamond' | 'chevron'
export interface CrosshairConfig {
  preset: string; color: string; size: number; thickness: number; gap: number
  dot: boolean; dotSize: number; outline: boolean; outlineColor: string; opacity: number
  tStyle: boolean; style: CrosshairStyle; offsetX?: number; offsetY?: number
  rotation?: number; outlineThickness?: number; rounded?: boolean
  mode?: 'shape' | 'image'; imageData?: string; imageName?: string; imageSize?: number; imageSource?: string; profileId?: string
}
export const DEFAULT_CROSSHAIR: CrosshairConfig = {
  preset:'cs2',color:'#00ff88',size:7,thickness:1,gap:3,dot:true,dotSize:2,
  outline:false,outlineColor:'#000000',opacity:.95,tStyle:false,style:'cross',
  offsetX:0,offsetY:0,rotation:0,outlineThickness:1,rounded:false,mode:'shape',imageSize:40,
}
type Preset = Partial<CrosshairConfig> & { label:string; labelDe:string }
export const CROSSHAIR_PRESETS: Record<string, Preset> = {
  classic:{label:'Classic',labelDe:'Klassisch',size:8,thickness:1,gap:3,dot:false,style:'cross'},
  classicDot:{label:'Cross + dot',labelDe:'Kreuz + Punkt',size:7,thickness:1,gap:3,dot:true,dotSize:2,style:'cross'},
  small:{label:'Micro',labelDe:'Mikro',size:3,thickness:1,gap:2,dot:false,style:'cross'},
  dot:{label:'Precision dot',labelDe:'Präzisionspunkt',size:0,thickness:0,gap:0,dot:true,dotSize:3,outline:true,style:'cross'},
  cs2:{label:'Tactical',labelDe:'Taktisch',size:6,thickness:1,gap:3,dot:false,style:'cross'},
  valorant:{label:'Compact',labelDe:'Kompakt',size:4,thickness:2,gap:2,dot:false,style:'cross'},
  tStyle:{label:'T-shape',labelDe:'T-Form',size:7,thickness:1.5,gap:3,tStyle:true,dot:false,style:'cross'},
  circle:{label:'Fine ring',labelDe:'Feiner Ring',size:9,thickness:1,gap:0,dot:false,style:'circle'},
  circleDot:{label:'Ring + dot',labelDe:'Ring + Punkt',size:9,thickness:1,gap:0,dot:true,dotSize:2,style:'circle'},
  x:{label:'Diagonal',labelDe:'Diagonal',size:6,thickness:1.5,gap:3,dot:false,style:'x'},
  large:{label:'Bold cross',labelDe:'Breites Kreuz',size:10,thickness:3,gap:5,dot:false,style:'cross'},
  sniper:{label:'Long range',labelDe:'Fernvisier',size:17,thickness:1,gap:7,dot:true,dotSize:2,style:'cross'},
  square:{label:'Open box',labelDe:'Offenes Quadrat',size:8,thickness:1.5,gap:0,dot:false,style:'square'},
  diamond:{label:'Diamond',labelDe:'Raute',size:9,thickness:1,gap:0,dot:true,dotSize:2,style:'diamond'},
  chevron:{label:'Chevron',labelDe:'Winkel',size:7,thickness:2,gap:3,dot:false,style:'chevron'},
  halo:{label:'Halo',labelDe:'Halo',size:6,thickness:2,gap:0,dot:true,dotSize:2,outline:true,style:'circle'},
}
const bounded = (value:unknown, fallback:number, min:number, max:number) => typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback
const color = (value:unknown,fallback:string) => typeof value==='string'&&/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)?value:fallback
export const MAX_CROSSHAIR_IMAGE_LENGTH = 180000
export const MIN_CROSSHAIR_IMAGE_SIZE = 1
export const MAX_CROSSHAIR_IMAGE_SIZE = 256
export function validCrosshairImage(value: unknown): value is string {
  if(typeof value==='string'&&value.length<=MAX_CROSSHAIR_WEBP_DATA_LENGTH&&/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    try {
      const bytes=Uint8Array.from(atob(value.slice(23,87)),char=>char.charCodeAt(0)),view=new DataView(bytes.buffer)
      if(bytes.length<30||view.getUint32(0)!==0x52494646||view.getUint32(8)!==0x57454250)return false
      const kind=view.getUint32(12)
      if(kind===0x56503858)return 1+bytes[24]+bytes[25]*256+bytes[26]*65536<=1024&&1+bytes[27]+bytes[28]*256+bytes[29]*65536<=1024
      if(kind===0x56503820)return (view.getUint16(26,true)&0x3fff)>0&&(view.getUint16(26,true)&0x3fff)<=1024&&(view.getUint16(28,true)&0x3fff)>0&&(view.getUint16(28,true)&0x3fff)<=1024
      if(kind===0x5650384c&&bytes[20]===0x2f){const packed=view.getUint32(21,true);return (packed&0x3fff)+1<=1024&&((packed>>>14)&0x3fff)+1<=1024}
    }catch{}
    return false
  }
  if(typeof value!=='string'||value.length>MAX_CROSSHAIR_IMAGE_LENGTH||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false
  try {
    const bytes=Uint8Array.from(atob(value.slice(22,66)),char=>char.charCodeAt(0)),view=new DataView(bytes.buffer)
    return bytes.length>=24&&view.getUint32(0)===0x89504e47&&view.getUint32(4)===0x0d0a1a0a&&view.getUint32(8)===13&&view.getUint32(12)===0x49484452&&view.getUint32(16)>0&&view.getUint32(20)>0&&view.getUint32(16)<=256&&view.getUint32(20)<=256
  }catch{return false}
}
export function normalizeCrosshair(config?:Partial<CrosshairConfig>):CrosshairConfig {
  const input=config&&typeof config==='object'?config:{},preset=typeof input.preset==='string'?input.preset:'cs2'
  const known=Object.prototype.hasOwnProperty.call(CROSSHAIR_PRESETS,preset)
  const base={...DEFAULT_CROSSHAIR,...(known?CROSSHAIR_PRESETS[preset]:{}),...input}
  const imageData=validCrosshairImage(base.imageData)?base.imageData:undefined
  return {
    preset:known?preset:'custom',color:color(base.color,DEFAULT_CROSSHAIR.color),
    size:bounded(base.size,7,0,40),thickness:bounded(base.thickness,1,0,8),gap:bounded(base.gap,3,0,24),
    dot:base.dot===true,dotSize:bounded(base.dotSize,2,0,16),outline:base.outline===true,outlineColor:color(base.outlineColor,'#000000'),
    opacity:bounded(base.opacity,.95,.05,1),tStyle:base.tStyle===true,
    style:['cross','x','circle','square','diamond','chevron'].includes(base.style)?base.style:'cross',
    offsetX:bounded(base.offsetX,0,-200,200),offsetY:bounded(base.offsetY,0,-200,200),rotation:bounded(base.rotation,0,0,360),
    outlineThickness:bounded(base.outlineThickness,1,.5,4),rounded:base.rounded===true,
    mode:base.mode==='image'&&imageData?'image':'shape',imageData,imageName:typeof base.imageName==='string'?base.imageName.slice(0,80):undefined,imageSize:bounded(base.imageSize,40,MIN_CROSSHAIR_IMAGE_SIZE,MAX_CROSSHAIR_IMAGE_SIZE),
    imageSource:typeof base.imageSource==='string'&&/^https:\/\/centerpointgaming\.com\/crosshairs\/[a-z0-9-]+\/$/.test(base.imageSource)?base.imageSource:undefined,
    profileId:typeof base.profileId==='string'&&base.profileId.startsWith('preset:')&&Object.prototype.hasOwnProperty.call(CROSSHAIR_PRESETS,base.profileId.slice(7))?base.profileId:known?`preset:${preset}`:undefined,
  }
}
export function crosshairExtent(cfg:CrosshairConfig):number {
  const radius=cfg.mode==='image'?(cfg.imageSize||40)/2:cfg.size+cfg.gap+cfg.thickness/2+(cfg.outline?cfg.outlineThickness||1:0)
  return Math.ceil(Math.max(80,(radius*2+8)*(cfg.rotation?Math.SQRT2:1)))
}
export function crosshairSegments(cfg:CrosshairConfig):{x1:number;y1:number;x2:number;y2:number}[] {
  const directions=cfg.style==='x'?[[-1,-1],[1,-1],[-1,1],[1,1]]:cfg.style==='chevron'?[[-1,1],[1,1]]:[[0,-1],[0,1],[-1,0],[1,0]]
  return directions.filter(([,y],index)=>!(cfg.tStyle&&cfg.style==='cross'&&y===-1&&index===0)).map(([x,y])=>{
    const divisor=Math.hypot(x,y),dx=x/divisor,dy=y/divisor
    return{x1:dx*cfg.gap,y1:dy*cfg.gap,x2:dx*(cfg.gap+cfg.size),y2:dy*(cfg.gap+cfg.size)}
  })
}
