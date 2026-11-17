import type { AppMode } from './appMode'
export const QUICK_ACTIONS = [
  {id:'crosshair',de:'Fadenkreuz',en:'Crosshair',launcher:true},
  {id:'performance',de:'Leistungs-Overlay',en:'Performance overlay',launcher:true},
  {id:'save-clip',de:'Clip speichern',en:'Save clip'},
  {id:'microphone',de:'Mikrofon aufnehmen',en:'Record microphone'},
  {id:'clips',de:'Clips öffnen',en:'Open clips'},
  {id:'clip-settings',de:'Clip-Einstellungen',en:'Clip settings'},
  {id:'friends',de:'Freunde',en:'Friends'},
  {id:'settings',de:'Einstellungen',en:'Settings'},
  {id:'overlays',de:'Overlay-Einstellungen',en:'Overlay settings',launcher:true},
  {id:'media',de:'Spotify-Overlay',en:'Spotify overlay',launcher:true},
  {id:'cps',de:'Klickzähler',en:'Click counter',launcher:true},
  {id:'downloads',de:'Downloads',en:'Downloads',launcher:true},
] as const
export type QuickActionId = typeof QUICK_ACTIONS[number]['id']
export type QuickAccessSlot = QuickActionId | null
export type QuickAccessSettings = Partial<Record<AppMode, QuickAccessSlot[]>>
export type QuickAccessLocation = 'sidebar' | 'topbar' | 'titlebar'
export type QuickAccessLocations = Partial<Record<QuickAccessLocation,boolean>>
export const quickAccessVisible=(value:QuickAccessLocations|undefined,location:QuickAccessLocation)=>value?.[location]??(location==='sidebar')
export const quickActionAvailable=(id:QuickActionId,mode:AppMode)=>QUICK_ACTIONS.some(item=>item.id===id&&(mode==='launcher'||!('launcher'in item)))
export function quickAccessSlots(value:unknown,mode:AppMode):QuickAccessSlot[]{
  const saved=Array.isArray(value)?value:[]
  const used=new Set<string>()
  return [0,1,2].map(index=>{const id=saved[index];if(typeof id!=='string'||!quickActionAvailable(id as QuickActionId,mode)||used.has(id))return null;used.add(id);return id as QuickActionId})
}
export function assignQuickAction(slots:QuickAccessSlot[],index:number,id:QuickAccessSlot):QuickAccessSlot[]{
  const next=[...slots],previous=next[index],other=next.indexOf(id)
  if(index<0||index>=3)return next
  next[index]=id
  if(id!==null&&other>=0&&other!==index)next[other]=previous
  return next
}
