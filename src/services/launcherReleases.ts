import { desktopFetch } from './httpClient'
import { GITHUB_REPO } from './updateService'

export interface LauncherRelease {id:number;tag_name:string;name:string;body:string;published_at:string;html_url:string;prerelease:boolean}
export const RELEASES_URL=`https://github.com/${GITHUB_REPO}/releases`

export function safeReleaseUrl(value:unknown):string {
  try{const url=new URL(String(value));if(url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&url.pathname.startsWith(`/${GITHUB_REPO}/releases/`))return url.href}catch{}
  return RELEASES_URL
}
export function normalizeLauncherRelease(value:any):LauncherRelease|null {
  if(!value||value.draft===true||value.prerelease===true||typeof value.tag_name!=='string'||!value.tag_name.trim()||value.tag_name.length>160||typeof value.published_at!=='string'||!Number.isFinite(Date.parse(value.published_at)))return null
  return{id:Number.isSafeInteger(value.id)?value.id:0,tag_name:value.tag_name,name:typeof value.name==='string'?value.name.slice(0,500):value.tag_name,body:typeof value.body==='string'?value.body.slice(0,200_000):'',published_at:value.published_at,html_url:safeReleaseUrl(value.html_url),prerelease:false}
}
async function request(path:string,signal?:AbortSignal) {
  const controller=new AbortController(),abort=()=>controller.abort()
  if(signal?.aborted)abort()
  signal?.addEventListener('abort',abort,{once:true})
  const timeout=setTimeout(abort,8000)
  try{
    const response=await desktopFetch(`https://api.github.com/repos/${GITHUB_REPO}/${path}`,{signal:controller.signal,headers:{Accept:'application/vnd.github+json'}})
    if(response.status===404)return null
    if(!response.ok)throw new Error(`GitHub releases unavailable (${response.status})`)
    const body=await response.json()
    if(controller.signal.aborted)throw new DOMException('Release request aborted','AbortError')
    return body
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort)}
}
export async function fetchLatestLauncherRelease(signal?:AbortSignal):Promise<LauncherRelease|null>{
  const value=await request('releases/latest',signal)
  if(value===null)return null
  const release=normalizeLauncherRelease(value)
  if(!release)throw new Error('Invalid GitHub release response')
  return release
}
export async function fetchLauncherReleaseHistory(signal?:AbortSignal):Promise<LauncherRelease[]>{
  const value=await request('releases?per_page=15',signal)
  if(value===null)return[]
  if(!Array.isArray(value))throw new Error('Invalid GitHub release history')
  const seen=new Set<string>()
  return value.slice(0,50).map(normalizeLauncherRelease).filter((release):release is LauncherRelease=>{
    if(!release||seen.has(release.tag_name))return false
    seen.add(release.tag_name);return true
  })
}

export type ReleaseNoteBlock={kind:'item'|'paragraph'|'code';title?:string;text:string;nested?:boolean}
export interface ReleaseNoteSection {title:string;blocks:ReleaseNoteBlock[]}
export function parseReleaseNotes(body:string):ReleaseNoteSection[]{
  const sections:ReleaseNoteSection[]=[]
  let current:ReleaseNoteSection={title:'',blocks:[]},fence=false,code:string[]=[],continuation=false
  const push=()=>{if(current.blocks.length)sections.push(current);current={title:'',blocks:[]}}
  const source=body.slice(0,200_000).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/!\[([^\]]*)\]\([^\n)]*\)/g,'$1')
  for(const raw of source.split(/\r?\n/)){
    const line=raw.trim()
    if(/^```|^~~~/.test(line)){
      if(fence){current.blocks.push({kind:'code',text:code.join('\n')});code=[]}
      fence=!fence;continuation=false;continue
    }
    if(fence){code.push(raw);continue}
    if(!line){continuation=false;continue}
    if(/^[-*_]{3,}$/.test(line)){continuation=false;continue}
    const heading=/^#{1,6}\s+(.+?)\s*#*$/.exec(line)||/^\*\*([^*]+)\*\*$/.exec(line)
    if(heading){push();current.title=heading[1].trim();continuation=false;continue}
    const bullet=/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)(.*)$/.exec(raw)
    if(bullet){
      const text=bullet[2].replace(/^\[[ xX]\]\s*/,''),bold=/^\*\*([^*]+)\*\*\s*:?\s*(.*)$/.exec(text)
      current.blocks.push({kind:'item',title:bold?.[1].replace(/:\s*$/,'').trim(),text:bold?bold[2]:text,nested:bullet[1].length>=2});continuation=true
    }else if(continuation&&current.blocks.length){current.blocks[current.blocks.length-1].text+=' '+line}
    else{current.blocks.push({kind:'paragraph',text:line});continuation=true}
  }
  if(code.length)current.blocks.push({kind:'code',text:code.join('\n')})
  push();return sections
}
