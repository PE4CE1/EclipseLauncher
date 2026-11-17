import { Fragment, useMemo } from 'react'
import { RefreshCw, CloudOff } from 'lucide-react'
import { parseReleaseNotes } from '../../services/launcherReleases'
import './release-notes.css'

export function openReleaseLink(value:string){
  try{
    const url=new URL(value)
    if(url.protocol!=='https:'||url.username||url.password)return
    if(window.electronAPI?.openUrl)void window.electronAPI.openUrl(url.href).catch(()=>{})
    else window.open(url.href,'_blank','noopener,noreferrer')
  }catch{}
}
function Inline({text}:{text:string}){
  const parts=text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g)
  return <>{parts.map((part,index)=>{
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={index}>{part.slice(1,-1)}</code>
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>
    const link=/^\[([^\]]+)\]\((https:\/\/[^)]+)\)$/.exec(part)
    if(link)return <button type="button" className="release-inline-link" key={index} onClick={()=>openReleaseLink(link[2])}>{link[1]}</button>
    return <Fragment key={index}>{part}</Fragment>
  })}</>
}
export function ReleaseNotes({body,emptyLabel}:{body:string;emptyLabel:string}){
  const sections=useMemo(()=>parseReleaseNotes(body),[body])
  if(!sections.length)return <p className="release-empty">{emptyLabel}</p>
  return <div className="release-notes-content">{sections.map((section,index)=><section className="release-note-section" key={index}>
    {section.title&&<h3><Inline text={section.title}/></h3>}
    <div>{section.blocks.map((block,key)=>block.kind==='code'?<pre key={key}><code>{block.text}</code></pre>:block.kind==='paragraph'?<p className="release-note-paragraph" key={key}><Inline text={block.text}/></p>:<div className="release-note-item" data-nested={block.nested||undefined} key={key}>
      <span className="release-note-bullet" aria-hidden="true"/><div>{block.title&&<h4><Inline text={block.title}/></h4>}{block.text&&<p><Inline text={block.text}/></p>}</div>
    </div>)}</div>
  </section>)}</div>
}
export function ReleaseLoading({label}:{label:string}){
  return <div className="release-loading" data-release-loading role="status" aria-label={label}><span className="release-loading-label">{label}</span>{[0,1,2].map(value=><div className="release-skeleton" key={value}><i/><i/><i/></div>)}</div>
}
export function ReleaseUnavailable({title,description,retry,retryLabel}:{title:string;description:string;retry:()=>void;retryLabel:string}){
  return <div className="release-unavailable" role="status"><CloudOff size={24}/><h3>{title}</h3><p>{description}</p><button type="button" className="release-button" onClick={retry}><RefreshCw size={13}/>{retryLabel}</button></div>
}
