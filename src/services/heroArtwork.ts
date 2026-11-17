import { getHeroUrl, getLogoUrl, getPlaceholderHero } from './assetHelper'
import { getSteamArtwork } from './steamArtwork'

export interface HeroArtwork { url: string; logo?: string }
const cache = new Map<string, HeroArtwork>()
type Preparation = { controller:AbortController; promise:Promise<HeroArtwork|null>; readers:number; done:boolean }
const pending = new Map<string,Preparation>()
const keyOf = (appId:number,fallback?:string,preferred?:string) => `${appId}:${preferred||''}:${fallback||''}`

export function getCachedHeroArtwork(appId: number, fallback?: string, preferred?: string): HeroArtwork | undefined {
  return cache.get(keyOf(appId,fallback,preferred))
}

export function loadDecodedImage(url: string, signal: AbortSignal, timeoutMs = 7000): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    const image = new Image()
    image.decoding = 'async'
    let finished = false
    const finish = (ready: boolean) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
      if (!ready) image.src = ''
      resolve(ready)
    }
    const abort = () => finish(false)
    const timer = setTimeout(abort, timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    image.onerror = () => finish(false)
    image.onload = async () => {
      try { await image.decode() } catch { /* onload may still provide a valid decoded image. */ }
      finish(image.naturalWidth > 0 && !signal.aborted)
    }
    try { image.src = url } catch { finish(false) }
  })
}

async function prepare(appId:number,name:string,fallback:string|undefined,preferred:string|undefined,key:string,signal:AbortSignal):Promise<HeroArtwork|null> {
  let logo:string|undefined
  // Optional logos load in parallel. A missing logo must never delay a ready
  // background; late logos are used only on a later visit, never mid-fade.
  void loadDecodedImage(getLogoUrl(appId),signal,800).then(ready => {
    if (!ready || signal.aborted) return
    logo = getLogoUrl(appId)
    const saved = cache.get(key)
    if (saved) cache.set(key,{...saved,logo})
  })
  let url = preferred || getHeroUrl(appId)
  if (!await loadDecodedImage(url,signal)) {
    if (signal.aborted) return null
    const assets = await getSteamArtwork(appId)
    const candidates = [...new Set([assets?.hero,getHeroUrl(appId),fallback,assets?.header,`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,getPlaceholderHero(name)].filter((value):value is string => !!value && value!==url))]
    let ready=false
    for (const candidate of candidates) {
      if (signal.aborted) return null
      if (await loadDecodedImage(candidate,signal)) { url=candidate;ready=true;break }
    }
    if (!ready) return null
  }
  if (signal.aborted) return null
  const artwork:HeroArtwork = {url,...(logo?{logo}:{})}
  cache.set(key,artwork)
  while (cache.size>16) cache.delete(cache.keys().next().value!)
  return artwork
}

export function prepareHeroArtwork(appId:number,name:string,fallback:string|undefined,signal:AbortSignal,preferred?:string):Promise<HeroArtwork|null> {
  if (signal.aborted) return Promise.resolve(null)
  const key=keyOf(appId,fallback,preferred),cached=cache.get(key)
  if (cached) return Promise.resolve(cached)
  let task=pending.get(key)
  if (!task) {
    const controller=new AbortController()
    task={controller,readers:0,done:false,promise:Promise.resolve(null)}
    const own=task
    own.promise=prepare(appId,name,fallback,preferred,key,AbortSignal.any([controller.signal,AbortSignal.timeout(10_000)])).catch(()=>null).finally(()=>{
      own.done=true
      if (pending.get(key)===own) pending.delete(key)
    })
    pending.set(key,own)
  }
  const own=task
  own.readers++
  return new Promise(resolve=>{
    let done=false
    const finish=(value:HeroArtwork|null)=>{
      if (done) return
      done=true;signal.removeEventListener('abort',abort);own.readers--
      if (!own.readers&&!own.done) { if(pending.get(key)===own)pending.delete(key);own.controller.abort() }
      resolve(value)
    }
    const abort=()=>finish(null)
    signal.addEventListener('abort',abort,{once:true})
    own.promise.then(value=>finish(signal.aborted?null:value))
  })
}
