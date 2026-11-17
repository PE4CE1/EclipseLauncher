import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crosshair, Activity, Clapperboard, Mic, Film, SlidersHorizontal, Users, Settings, Layers, Music, MousePointerClick, Download, Pencil, X, Search, Check, RotateCcw, Loader2, Plus } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useClipStore } from '../../store/clipStore'
import { useUIStore } from '../../store/uiStore'
import { persistAppSettings } from '../../services/settingsPersistence'
import { runtimeMode } from '../../services/runtimeMode'
import { QUICK_ACTIONS, quickAccessSlots, quickActionAvailable, assignQuickAction, quickAccessVisible, type QuickActionId, type QuickAccessSlot, type QuickAccessLocation } from '../../services/quickAccess'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import type { AppSettings } from '../../types/game'
import './quick-access.css'

const icons={crosshair:Crosshair,performance:Activity,'save-clip':Clapperboard,microphone:Mic,clips:Film,'clip-settings':SlidersHorizontal,friends:Users,settings:Settings,overlays:Layers,media:Music,cps:MousePointerClick,downloads:Download}
const toggles:Partial<Record<QuickActionId,keyof AppSettings>>={crosshair:'overlayCrosshair',performance:'overlayPerformance',media:'overlayMedia',cps:'overlayCps'}
export function QuickAccess({location='sidebar'}:{location?:QuickAccessLocation}){
  const visible=useGameStore(state=>quickAccessVisible(state.settings.quickAccessLocations,location))
  return visible?<QuickAccessBar location={location}/>:null
}
function QuickAccessBar({location}:{location:QuickAccessLocation}){
  const settings=useGameStore(state=>state.settings),mic=useClipStore(state=>state.settings.captureMic),buffer=useClipStore(state=>state.isReplayBufferActive),saving=useClipStore(state=>state.isSavingClip)
  const slots=quickAccessSlots(settings.quickAccess?.[runtimeMode],runtimeMode),de=settings.language==='de'
  const [editing,setEditing]=useState<number|null>(null),[busy,setBusy]=useState<QuickActionId|null>(null),[writing,setWriting]=useState(false),[query,setQuery]=useState(''),[saved,setSaved]=useState(false)
  const lock=useRef(false),row=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDivElement>(null),titleId=useId()
  const [,setViewport]=useState(0)
  useEffect(()=>{if(editing===null)return;const resize=()=>setViewport(value=>value+1);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[editing!==null])
  const label=(id:QuickAccessSlot)=>{if(!id)return de?'Unbelegt':'Unassigned';const action=QUICK_ACTIONS.find(item=>item.id===id)!;return de?action.de:action.en}
  const close=()=>{setEditing(null);setQuery('');setSaved(false)}
  useDialogFocus(dialog,close,editing!==null)
  const open=(index:number)=>{setEditing(index);setQuery('');setSaved(false)}
  async function write(next:QuickAccessSlot[]){
    if(lock.current)return
    lock.current=true;setWriting(true);setSaved(false)
    try{const current=useGameStore.getState().settings.quickAccess;setSaved(await persistAppSettings({quickAccess:{...current,[runtimeMode]:next}}))}finally{lock.current=false;setWriting(false)}
  }
  async function run(id:QuickActionId){
    if(lock.current)return
    lock.current=true;setBusy(id)
    try{
      const key=toggles[id]
      if(key){await persistAppSettings({[key]:useGameStore.getState().settings[key]!==true});return}
      if(id==='microphone'){
        const api=window.electronAPI?.clips
        if(!api)throw Error('unavailable')
        const next=await api.saveSettings({captureMic:!useClipStore.getState().settings.captureMic})
        useClipStore.setState(state=>({settings:{...state.settings,...next}}));return
      }
      if(id==='save-clip'){await (await import('../../services/nativeClipEngine')).triggerInstantClip();return}
      const ui=useUIStore.getState()
      if(id==='friends'){if(window.electronAPI?.openFriendsWindow)await window.electronAPI.openFriendsWindow();else ui.setIsFriendsOpen(true);return}
      if(id==='clip-settings'){ui.setActiveView('clips');useClipStore.getState().setIsSettingsOpen(true);return}
      if(id==='overlays'){ui.setActiveSettingsTab('gameplay');ui.setActiveView('settings');return}
      ui.setActiveView(id==='downloads'?'downloads':id==='settings'?'settings':'clips')
    }catch{useUIStore.getState().showNotification(de?'Der Schnellzugriff konnte nicht ausgeführt werden.':'Unable to run this shortcut.','error')}finally{lock.current=false;setBusy(null)}
  }
  const bounds=row.current?.getBoundingClientRect(),left=Math.max(12,Math.min(bounds?.left??16,window.innerWidth-332)),top=Math.max(12,Math.min((bounds?.bottom??100)+8,window.innerHeight-490))
  return <><div ref={row} className="quick-access no-drag" data-quick-location={location} role="group" aria-label={de?'Schnellzugriff':'Quick access'}>
    {slots.map((id,index)=>{const Icon=id?icons[id]:Plus,key=id?toggles[id]:undefined,active=key?settings[key]===true:id==='microphone'?mic:false,disabled=busy!==null||(id==='save-clip'&&(!buffer||saving)),name=id?label(id):(de?`Funktion hinzufügen · Platz ${index+1}`:`Add feature · Slot ${index+1}`),hint=id==='save-clip'&&!buffer?(de?'Aufnahme ist nicht bereit':'Recording is not ready'):name
      return <button key={index} type="button" data-quick-action={id??'empty'} data-quick-slot={index} data-empty={!id||undefined} data-active={active||undefined} aria-label={name} aria-pressed={key||id==='microphone'?active:undefined} disabled={disabled} title={hint} onClick={()=>id?void run(id):open(index)} onContextMenu={event=>{event.preventDefault();open(index)}}>{busy!==null&&busy===id?<Loader2 size={14} className="quick-access-spinner"/>:<Icon size={14}/>}<span className="quick-access-label">{name}</span>{active&&<i aria-hidden="true"/>}</button>
    })}
    <button type="button" className="quick-access-edit" data-quick-edit aria-label={de?'Schnellzugriffe ändern':'Edit quick access'} title={de?'Schnellzugriffe ändern':'Edit quick access'} aria-haspopup="dialog" aria-expanded={editing!==null} onClick={()=>open(0)}><Pencil size={12}/></button>
  </div>{editing!==null&&createPortal(<div className="quick-access-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close()}}><div ref={dialog} className="quick-access-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{left,top,maxHeight:'calc(100vh - 24px)'}}>
    <header><div><strong id={titleId}>{de?'Deine Schnellzugriffe':'Your quick access'}</strong><p>{de?'Drei Plätze. Deine Funktionen.':'Three slots. Your features.'}</p></div><button type="button" data-dialog-close onClick={close} aria-label={de?'Schließen':'Close'}><X size={16}/></button></header>
    <div className="quick-access-slots" role="group" aria-label={de?'Platz auswählen':'Choose a slot'}>{slots.map((id,index)=>{const Icon=id?icons[id]:Plus;return <button type="button" key={index} aria-pressed={editing===index} onClick={()=>{setEditing(index);setSaved(false)}}><small>{index+1}</small><Icon size={15}/><span>{label(id)}</span></button>})}</div>
    <label className="quick-access-search"><Search size={14}/><input aria-label={de?'Funktion suchen':'Search features'} placeholder={de?'Funktion suchen…':'Search features…'} value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="quick-access-options">{QUICK_ACTIONS.filter(item=>quickActionAvailable(item.id,runtimeMode)&&label(item.id).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=>{const Icon=icons[item.id],selected=slots[editing]===item.id,other=slots.indexOf(item.id);return <button type="button" key={item.id} data-quick-choice={item.id} disabled={writing} aria-pressed={selected} onClick={()=>void write(assignQuickAction(quickAccessSlots(useGameStore.getState().settings.quickAccess?.[runtimeMode],runtimeMode),editing,item.id))}><Icon size={15}/><span>{label(item.id)}</span>{selected?<Check size={14}/>:other>=0?<small>{de?'Platz':'Slot'} {other+1}</small>:null}</button>})}</div>
    <footer><button type="button" data-quick-clear disabled={writing} onClick={()=>void write(assignQuickAction(slots,editing,null))}>{de?'Platz leeren':'Clear slot'}</button><button type="button" disabled={writing} onClick={()=>void write(quickAccessSlots(undefined,runtimeMode))}><RotateCcw size={12}/>{de?'Alle leeren':'Clear all'}</button><span role="status">{writing?(de?'Speichert…':'Saving…'):saved?(de?'Gespeichert':'Saved'):''}</span></footer>
  </div></div>,document.body)}</>
}
