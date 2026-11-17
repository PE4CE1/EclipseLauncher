import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Crosshair as Aim, ImagePlus, Upload, X } from 'lucide-react'
import { SmoothCollapse } from '../shared/SmoothCollapse'
import { CrosshairSVG } from '../overlay/widgets/Crosshair'
import { CROSSHAIR_PRESETS, DEFAULT_CROSSHAIR, MIN_CROSSHAIR_IMAGE_SIZE, MAX_CROSSHAIR_IMAGE_SIZE, normalizeCrosshair, type CrosshairConfig, type CrosshairStyle } from '../../services/crosshairConfig'
import { CrosshairImageError, importCrosshairPng } from '../../services/crosshairImage'
import type { AppSettings } from '../../types/game'
import { crosshairProfileKey, normalizeCrosshairProfiles, rememberCrosshair, restoreCrosshair, type CrosshairProfiles } from '../../services/crosshairProfiles'
import { CrosshairPosition } from './CrosshairPosition'
import './crosshair-settings.css'

const CrosshairLibrary = lazy(() => import('./CrosshairLibrary').then(module => ({ default: module.CrosshairLibrary })))
const COLORS=['#00ff88','#bfff00','#ffffff','#00dcff','#ffb347','#ff4d6d','#d58aff','#141414']
type CrosshairNumber = 'size' | 'thickness' | 'gap' | 'dotSize' | 'outlineThickness' | 'rotation' | 'imageSize' | 'opacity'
function Slider({label,param,value,min,max,step=1,suffix='',change}:{label:string;param:CrosshairNumber;value:number;min:number;max:number;step?:number;suffix?:string;change:(patch:Partial<CrosshairConfig>)=>void}) {
  return <label className="crosshair-slider"><span>{label}<output>{param==='opacity'?Math.round(value*100)+'%':Number(value.toFixed(2))+suffix}</output></span><input type="range" data-crosshair-param={param} aria-label={label} min={min} max={max} step={step} value={value} onChange={event=>change({[param]:Number(event.target.value)})}/></label>
}
export function CrosshairSettings({settings,save,commit,language,embedded=false,id='overlay-crosshair'}:{settings:Partial<AppSettings>;save:<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>void;commit:(patch:Partial<AppSettings>)=>unknown;language:string;embedded?:boolean;id?:string}) {
  const de=language==='de',cfg=normalizeCrosshair(settings.crosshairConfig)
  const [open,setOpen]=useState(false),[tab,setTab]=useState<'presets'|'library'|'designer'|'image'>('library'),[scene,setScene]=useState('range'),[zoom,setZoom]=useState(1),[importing,setImporting]=useState(false),[error,setError]=useState('')
  const input=useRef<HTMLInputElement>(null),current=useRef(cfg),generation=useRef(0)
  const normalizedProfiles=useMemo(()=>normalizeCrosshairProfiles(settings.crosshairProfiles),[settings.crosshairProfiles]),profiles=useRef(normalizedProfiles)
  current.current=cfg;profiles.current=normalizedProfiles
  useEffect(()=>()=>{generation.current++},[])
  const publish=(next:CrosshairConfig,nextProfiles:CrosshairProfiles)=>{current.current=next;profiles.current=nextProfiles;void commit({crosshairConfig:next,crosshairProfiles:nextProfiles})}
  const selectCrosshair=(defaults:CrosshairConfig)=>{
    const saved=rememberCrosshair(profiles.current,current.current),next=restoreCrosshair(saved,defaults)
    publish(next,rememberCrosshair(saved,next))
  }
  const update=(patch:Partial<CrosshairConfig>)=>{
    const previous=current.current
    const changedImage=patch.imageData!==undefined&&patch.imageData!==previous.imageData
    const changedMode=patch.mode!==undefined&&patch.mode!==previous.mode
    if(changedImage||changedMode){
      selectCrosshair(normalizeCrosshair({...DEFAULT_CROSSHAIR,imageData:previous.imageData,imageName:previous.imageName,imageSource:previous.imageSource,...patch,preset:'custom',profileId:undefined}));return
    }
    const designChanged=['style','size','thickness','gap','dot','dotSize','outline','outlineColor','tStyle','rounded','outlineThickness'].some(key=>key in patch)
    const next=normalizeCrosshair({...previous,...patch,preset:designChanged?'custom':previous.preset})
    if(crosshairProfileKey(previous)!==crosshairProfileKey(next)){selectCrosshair(next);return}
    publish(next,rememberCrosshair(profiles.current,next))
  }
  const selectLibraryImage=(patch:Partial<CrosshairConfig>)=>selectCrosshair(normalizeCrosshair({...DEFAULT_CROSSHAIR,...patch,preset:'custom',profileId:undefined}))
  const updateShape=(patch:Partial<CrosshairConfig>)=>update({...patch,mode:'shape'})
  const updateImage=(patch:Partial<CrosshairConfig>)=>update({...patch,mode:'image'})
  const selectPreset=(key:string)=>{
    const next=normalizeCrosshair({...DEFAULT_CROSSHAIR,...CROSSHAIR_PRESETS[key],preset:key,profileId:`preset:${key}`,imageData:current.current.imageData,imageName:current.current.imageName,imageSource:current.current.imageSource})
    selectCrosshair(next)
  }
  async function importImage(file:File) {
    const request=++generation.current;setImporting(true);setError('')
    try {const image=await importCrosshairPng(file);if(request===generation.current)update({...image,mode:'image',imageSize:40,imageSource:undefined})}
    catch(reason){if(request===generation.current){const code=reason instanceof CrosshairImageError?reason.code:'decode';const messages={format:de?'Bitte wähle eine PNG-Datei.':'Choose a PNG image.',size:de?'Die PNG-Datei darf höchstens 2 MB groß sein.':'The PNG image must be 2 MB or smaller.',dimensions:de?'Maximal 1024 × 1024 Pixel sind erlaubt.':'Images must be 1024 × 1024 pixels or smaller.',empty:de?'Das Bild ist vollständig transparent.':'The image is completely transparent.',decode:de?'Die PNG-Datei konnte nicht gelesen werden.':'Unable to read this PNG image.'};setError(messages[code])}}
    finally{if(request===generation.current)setImporting(false)}
  }
  const shapes:{value:CrosshairStyle;label:string}[]=[{value:'cross',label:de?'Kreuz':'Cross'},{value:'x',label:'X'},{value:'circle',label:de?'Ring':'Ring'},{value:'square',label:de?'Quadrat':'Box'},{value:'diamond',label:de?'Raute':'Diamond'},{value:'chevron',label:de?'Winkel':'Chevron'}]
  const preset=CROSSHAIR_PRESETS[cfg.preset],name=cfg.mode==='image'?(cfg.imageName||'PNG'):(preset?(de?preset.labelDe:preset.label):(de?'Eigener Entwurf':'Custom design'))
  return <div className={`settings-glass-card crosshair-settings${embedded?' crosshair-settings--embedded':''}`} id={id}>
    {!embedded && <>
    <div className="crosshair-section-header"><button type="button" className="crosshair-section-trigger" data-crosshair-expand aria-expanded={open} onClick={()=>setOpen(value=>!value)}><span className="crosshair-section-icon" data-active={!!settings.overlayCrosshair}><Aim size={15}/></span><span><strong>{de?'Fadenkreuz':'Custom Crosshair'}</strong><small>{settings.overlayCrosshair?name:(de?'Deaktiviert':'Disabled')}</small></span></button><div><button type="button" className="gameplay-overlay-switch" role="switch" aria-checked={!!settings.overlayCrosshair} aria-label={de?'Fadenkreuz aktivieren':'Enable custom crosshair'} onClick={()=>save('overlayCrosshair',!settings.overlayCrosshair)}><span/></button><button type="button" className="crosshair-expand-icon" aria-label={de?'Fadenkreuz-Einstellungen':'Crosshair settings'} aria-expanded={open} onClick={()=>setOpen(value=>!value)}><ChevronDown size={14} style={{transform:open?'rotate(180deg)':undefined}}/></button></div></div>
    </>}
    <SmoothCollapse open={embedded||open}>{()=> <div className="crosshair-designer">
      <div className="crosshair-controls"><div className="crosshair-tabs" role="tablist" aria-label={de?'Fadenkreuz erstellen':'Create crosshair'}>{(['library','presets','designer','image'] as const).map(value=><button key={value} type="button" role="tab" aria-selected={tab===value} data-crosshair-tab={value} onClick={()=>setTab(value)}>{value==='presets'?(de?'Vorlagen':'Presets'):value==='library'?(de?'Bibliothek':'Library'):value==='designer'?(de?'Designer':'Designer'):(de?'Eigenes Bild':'Custom image')}</button>)}</div>
        {tab==='library'&&<Suspense fallback={<p className="crosshair-settings-note">{de?'Bibliothek wird geladen…':'Loading library…'}</p>}><CrosshairLibrary de={de} source={cfg.mode==='image'?cfg.imageSource:undefined} favorites={settings.crosshairFavorites} saveFavorites={favorites=>save('crosshairFavorites',favorites)} select={selectLibraryImage}/></Suspense>}
        {tab==='presets'&&<div className="crosshair-preset-grid">{Object.entries(CROSSHAIR_PRESETS).map(([key,preset])=><button key={key} type="button" data-crosshair-preset={key} aria-pressed={cfg.mode==='shape'&&cfg.preset===key} onClick={()=>selectPreset(key)}><CrosshairSVG cfg={normalizeCrosshair({...DEFAULT_CROSSHAIR,...preset,preset:key,color:cfg.color})} size={58}/><span>{de?preset.labelDe:preset.label}</span></button>)}</div>}
        {tab==='designer'&&<><div className="crosshair-shapes">{shapes.map(shape=><button key={shape.value} type="button" data-crosshair-shape={shape.value} aria-pressed={cfg.mode==='shape'&&cfg.style===shape.value} onClick={()=>update({mode:'shape',style:shape.value})}>{shape.label}</button>)}</div><div className="crosshair-control-grid">
          <Slider label={de?'Linienlänge':'Line length'} param="size" value={cfg.size} min={0} max={40} suffix=" px" change={updateShape}/><Slider label={de?'Linienbreite':'Thickness'} param="thickness" value={cfg.thickness} min={.5} max={8} step={.5} suffix=" px" change={updateShape}/>
          <Slider label={de?'Abstand':'Gap'} param="gap" value={cfg.gap} min={0} max={24} step={.5} suffix=" px" change={updateShape}/><Slider label={de?'Punktgröße':'Dot size'} param="dotSize" value={cfg.dotSize} min={1} max={16} suffix=" px" change={updateShape}/>
          <Slider label={de?'Konturbreite':'Outline width'} param="outlineThickness" value={cfg.outlineThickness||1} min={.5} max={4} step={.5} suffix=" px" change={updateShape}/><Slider label={de?'Drehung':'Rotation'} param="rotation" value={cfg.rotation||0} min={0} max={360} suffix="°" change={updateShape}/>
        </div><div className="crosshair-options">{[{key:'dot',label:de?'Mittelpunkt':'Center dot'},{key:'outline',label:de?'Kontur':'Outline'},{key:'rounded',label:de?'Runde Enden':'Round ends'},{key:'tStyle',label:de?'T-Form':'T-shape'}].map(({key,label})=><label key={key}><input type="checkbox" checked={!!cfg[key as 'dot']} onChange={event=>update({mode:'shape',[key]:event.target.checked})}/>{label}</label>)}<label className="crosshair-outline-color"><input type="color" aria-label={de?'Konturfarbe':'Outline color'} value={cfg.outlineColor} onChange={event=>update({outlineColor:event.target.value})}/>{de?'Konturfarbe':'Outline color'}</label></div></>}
        {tab==='image'&&<div className="crosshair-image-import"><div className="crosshair-import-description"><ImagePlus size={23}/><div><strong>{de?'Dein eigenes Fadenkreuz':'Your own crosshair'}</strong><p>{de?'PNG mit Transparenz · bis 2 MB und 1024 × 1024 px':'Transparent PNG · up to 2 MB and 1024 × 1024 px'}</p></div></div><input ref={input} type="file" accept="image/png,.png" hidden data-crosshair-file onChange={event=>{const file=event.target.files?.[0];event.currentTarget.value='';if(file)void importImage(file)}}/><button type="button" className="crosshair-action" data-crosshair-import disabled={importing} onClick={()=>input.current?.click()}><Upload size={14}/>{importing?(de?'Bild wird geladen…':'Loading image…'):(de?'PNG auswählen':'Choose PNG')}</button>
          {cfg.imageData&&<><div className="crosshair-imported"><img src={cfg.imageData} alt=""/><span>{cfg.imageName||'PNG'}</span><button type="button" aria-label={de?'Bild entfernen':'Remove image'} onClick={()=>update({mode:'shape',imageData:undefined,imageName:undefined,imageSource:undefined})}><X size={14}/></button></div>{cfg.mode!=='image'&&<button type="button" className="crosshair-action" onClick={()=>update({mode:'image'})}>{de?'Dieses Bild verwenden':'Use this image'}</button>}<div className="crosshair-control-grid"><Slider label={de?'Drehung':'Rotation'} param="rotation" value={cfg.rotation||0} min={0} max={360} suffix="°" change={updateImage}/></div></>}
          {error&&<p className="crosshair-error" role="alert">{error}</p>}</div>}
        <div className="crosshair-colors" aria-label={de?'Farbe':'Color'}>{COLORS.map(color=><button key={color} type="button" aria-label={color} aria-pressed={cfg.color===color} disabled={cfg.mode==='image'} style={{background:color}} onClick={()=>update({color})}/>)}<input type="color" aria-label={de?'Eigene Farbe':'Custom color'} disabled={cfg.mode==='image'} value={cfg.color} onChange={event=>update({color:event.target.value})}/><span>{cfg.mode==='image'?(de?'Originalfarben':'Original colors'):cfg.color}</span></div>
        <Slider label={de?'Deckkraft':'Opacity'} param="opacity" value={cfg.opacity} min={.05} max={1} step={.05} change={update}/>
      </div>
      <div className="crosshair-preview-panel"><div className="crosshair-preview-heading"><strong>{de?'Live-Vorschau':'Live preview'}</strong><span>{de?'Gleiche Darstellung wie im Overlay':'Same rendering as the overlay'}</span></div><div className={`crosshair-preview-scene crosshair-preview--${scene}`} data-crosshair-preview><div className="crosshair-preview-guides"/><div className="crosshair-preview-position" style={{transform:`translate(-50%,-50%) scale(${zoom})`}}><div style={{transform:`translate(${cfg.offsetX||0}px,${cfg.offsetY||0}px)`}}><CrosshairSVG cfg={cfg}/></div></div><span className="crosshair-preview-scale">{zoom}× {zoom===1?'· 1:1':''}</span></div>
        <div className="crosshair-preview-toolbar"><div>{[{id:'range',label:de?'Szene':'Scene'},{id:'dark',label:de?'Dunkel':'Dark'},{id:'light',label:de?'Hell':'Light'}].map(item=><button key={item.id} type="button" aria-pressed={scene===item.id} onClick={()=>setScene(item.id)}>{item.label}</button>)}</div><div>{[.5,1,2].map(value=><button key={value} type="button" aria-label={`${value}x`} aria-pressed={zoom===value} onClick={()=>setZoom(value)}>{value}×</button>)}</div></div>
        {cfg.mode==='image'&&<div className="crosshair-image-scale"><Slider label={de?'Fadenkreuzgröße':'Crosshair size'} param="imageSize" value={cfg.imageSize||40} min={MIN_CROSSHAIR_IMAGE_SIZE} max={MAX_CROSSHAIR_IMAGE_SIZE} suffix=" px" change={updateImage}/></div>}
        <CrosshairPosition x={cfg.offsetX||0} y={cfg.offsetY||0} de={de} change={update}/>
        <p className="crosshair-settings-note">{de?'Größe und Position werden für dieses Fadenkreuz gespeichert.':'Size and position save for this crosshair.'}</p>
      </div>
    </div>}</SmoothCollapse>
  </div>
}
