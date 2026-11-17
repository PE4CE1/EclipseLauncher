import { normalizeCrosshair, type CrosshairConfig } from './crosshairConfig'

const FIELDS = ['size','thickness','gap','dot','dotSize','outline','outlineColor','opacity','tStyle','style','offsetX','offsetY','rotation','outlineThickness','rounded','color','imageSize'] as const
export type CrosshairPreferences = Pick<CrosshairConfig, typeof FIELDS[number]>
export type CrosshairProfiles = Record<string, CrosshairPreferences>
const MAX_PROFILES = 256
let lastImage: string | undefined, lastKey = ''

/** Local image names can collide; a bounded content fingerprint identifies the design. */
export function crosshairProfileKey(config: CrosshairConfig): string {
  if (config.mode === 'image' && config.imageData) {
    if (config.imageSource) return `library:${config.imageSource.split('/').filter(Boolean).pop()}`
    if (lastImage !== config.imageData) {
      let a = 2166136261, b = 5381
      for (let i=0;i<config.imageData.length;i++) { const char=config.imageData.charCodeAt(i); a=Math.imul(a^char,16777619); b=Math.imul(b,33)^char }
      lastImage=config.imageData;lastKey=`image:${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`
    }
    return lastKey
  }
  return config.profileId || (config.preset !== 'custom' ? `preset:${config.preset}` : 'shape:custom')
}
function preferences(input: Partial<CrosshairConfig>): CrosshairPreferences {
  const config=normalizeCrosshair(input)
  return Object.fromEntries(FIELDS.map(key=>[key,config[key]])) as unknown as CrosshairPreferences
}
export function normalizeCrosshairProfiles(value: unknown): CrosshairProfiles {
  if (!value || typeof value!=='object' || Array.isArray(value)) return {}
  const entries=Object.entries(value).filter(([key,item])=> /^(?:library:[a-z0-9-]{1,160}|preset:[a-zA-Z0-9]+|image:[a-f0-9]{16}|shape:custom)$/.test(key)&&item&&typeof item==='object'&&!Array.isArray(item)).slice(-MAX_PROFILES)
  return Object.fromEntries(entries.map(([key,item])=>[key,preferences(item as Partial<CrosshairConfig>)]))
}
export function rememberCrosshair(profiles: CrosshairProfiles, config: CrosshairConfig): CrosshairProfiles {
  const key=crosshairProfileKey(config),entries=Object.entries(profiles).filter(([id])=>id!==key)
  return Object.fromEntries([...entries,[key,preferences(config)]].slice(-MAX_PROFILES))
}
export function restoreCrosshair(profiles: CrosshairProfiles, defaults: CrosshairConfig): CrosshairConfig {
  const key=crosshairProfileKey(defaults)
  return normalizeCrosshair({...defaults,...(Object.prototype.hasOwnProperty.call(profiles,key)?profiles[key]:{})})
}
