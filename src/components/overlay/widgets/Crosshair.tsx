import { normalizeCrosshair, crosshairExtent, crosshairSegments, type CrosshairConfig } from '../../../services/crosshairConfig'
export { CROSSHAIR_PRESETS, DEFAULT_CROSSHAIR } from '../../../services/crosshairConfig'
export type { CrosshairConfig } from '../../../services/crosshairConfig'

export function CrosshairSVG({cfg:input,size}:{cfg:CrosshairConfig;size?:number}) {
  const cfg=normalizeCrosshair(input),extent=crosshairExtent(cfg),center=extent/2
  const stroke={fill:'none',strokeLinecap:cfg.rounded?'round' as const:'butt' as const,strokeLinejoin:cfg.rounded?'round' as const:'miter' as const}
  const shape=(paint:string,width:number)=>{
    if(cfg.style==='circle')return <circle cx={0} cy={0} r={cfg.size} stroke={paint} strokeWidth={width}/>
    if(cfg.style==='square')return <rect x={-cfg.size} y={-cfg.size} width={cfg.size*2} height={cfg.size*2} stroke={paint} strokeWidth={width}/>
    if(cfg.style==='diamond')return <path d={`M 0 ${-cfg.size} L ${cfg.size} 0 L 0 ${cfg.size} L ${-cfg.size} 0 Z`} stroke={paint} strokeWidth={width}/>
    return crosshairSegments(cfg).map((line,index)=><line key={index} {...line} stroke={paint} strokeWidth={width}/> )
  }
  const outline=cfg.outlineThickness||1
  return <svg width={size??extent} height={size??extent} viewBox={`0 0 ${extent} ${extent}`} style={{display:'block',flexShrink:0,opacity:cfg.opacity}} aria-hidden="true" data-crosshair-style={cfg.mode==='image'?'image':cfg.style}>
    <g transform={`translate(${center} ${center}) rotate(${cfg.rotation||0})`} {...stroke}>
      {cfg.mode==='image'&&cfg.imageData?<image href={cfg.imageData} x={-(cfg.imageSize||40)/2} y={-(cfg.imageSize||40)/2} width={cfg.imageSize||40} height={cfg.imageSize||40} preserveAspectRatio="xMidYMid meet"/>:<>
        {cfg.size>0&&cfg.thickness>0&&<>{cfg.outline&&shape(cfg.outlineColor,cfg.thickness+outline*2)}{shape(cfg.color,cfg.thickness)}</>}
        {cfg.dot&&cfg.dotSize>0&&<>{cfg.outline&&<circle r={cfg.dotSize/2+outline} fill={cfg.outlineColor}/>}<circle r={cfg.dotSize/2} fill={cfg.color}/></>}
      </>}
    </g>
  </svg>
}
export function Crosshair({config}:{config?:Partial<CrosshairConfig>}) {
  const cfg=normalizeCrosshair(config),extent=crosshairExtent(cfg)
  return <div style={{transform:`translate(calc(-50% + ${cfg.offsetX||0}px), calc(-50% + ${cfg.offsetY||0}px))`,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center',width:extent,height:extent,lineHeight:0,fontSize:0}}><CrosshairSVG cfg={cfg}/></div>
}