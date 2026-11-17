import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { X, ExternalLink, History, Github } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { useLatestLauncherRelease } from '../../hooks/useLauncherReleases'
import { APP_VERSION } from '../../services/updateService'
import { RELEASES_URL } from '../../services/launcherReleases'
import { ReleaseNotes, ReleaseLoading, ReleaseUnavailable, openReleaseLink } from './ReleaseNotes'

function ReleaseDialog({close,history}:{close:()=>void;history:()=>void}){
  const {language}=useTranslation(),de=language==='de'
  const present=useIsPresent()
  const release=useLatestLauncherRelease(),panel=useRef<HTMLDivElement>(null),closeButton=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
    document.body.style.overflow='hidden';closeButton.current?.focus({preventScroll:true})
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
      if(event.key!=='Tab')return
      const focusable=[...panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')||[]].filter(node=>node.getClientRects().length>0)
      const first=focusable[0],last=focusable[focusable.length-1]
      if(!first)return
      if(event.shiftKey&&(document.activeElement===first||!panel.current?.contains(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!panel.current?.contains(document.activeElement))){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',key,true)
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus({preventScroll:true})}
  },[close])
  const data=release.data
  const date=data?new Date(data.published_at).toLocaleDateString(de?'de-DE':'en-US',{day:'numeric',month:'long',year:'numeric'}):''
  // Keep the blur layer at full opacity to avoid Chromium compositing flashes;
  // animate its blur/background and the panel's opacity independently.
  return <motion.div className="release-modal-backdrop" data-release-backdrop data-closing={!present||undefined}
    initial={{backgroundColor:'rgba(0,0,0,0)',backdropFilter:'blur(0px)'}}
    animate={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(10px)'}}
    exit={{backgroundColor:'rgba(0,0,0,0)',backdropFilter:'blur(0px)'}}
    transition={{duration:.16,ease:[.22,.61,.36,1]}} onClick={event=>{if(event.target===event.currentTarget)close()}}>
    <div ref={panel} className="release-modal" role="dialog" aria-modal="true" aria-labelledby="launcher-release-title" data-release-dialog>
      <header className="release-modal-header">
        <div><p className="release-eyebrow">ECLIPSE LAUNCHER</p><h2 id="launcher-release-title">{de?'Versionshinweise':'Release notes'}</h2><p className="release-header-subtitle">{de?'Änderungen und Verbesserungen direkt von GitHub.':'Changes and improvements directly from GitHub.'}</p></div>
        <button type="button" ref={closeButton} className="release-icon-button" aria-label={de?'Schließen':'Close'} onClick={close}><X size={18}/></button>
      </header>
      <div className="release-modal-scroll" aria-busy={release.isPending}>
        {release.isPending?<ReleaseLoading label={de?'Versionshinweise werden geladen …':'Loading release notes …'}/>:release.isError?<ReleaseUnavailable title={de?'GitHub ist gerade nicht erreichbar':'GitHub is currently unavailable'} description={de?'Die Versionshinweise konnten nicht geladen werden. Du kannst es erneut versuchen oder GitHub öffnen.':'The release notes could not be loaded. Try again or open GitHub.'} retry={()=>void release.refetch()} retryLabel={de?'Erneut versuchen':'Try again'}/>:data?<>
          <div className="release-summary"><div className="release-metadata"><span className="release-version" data-release-version>{data.tag_name}</span><time dateTime={data.published_at}>{date}</time></div><h3>{data.name||data.tag_name}</h3></div>
          <ReleaseNotes body={data.body} emptyLabel={de?'Für diese Version wurden keine weiteren Hinweise veröffentlicht.':'No additional notes were published for this release.'}/>
        </>:<div className="release-empty">{de?'Auf GitHub ist noch keine veröffentlichte Version verfügbar.':'There is no published release on GitHub yet.'}</div>}
      </div>
      <footer className="release-modal-footer">
        <button type="button" className="release-text-button" onClick={history}><History size={14}/>{de?'Versionsverlauf':'Release history'}</button>
        <div><button type="button" className="release-text-button" onClick={()=>openReleaseLink(data?.html_url||RELEASES_URL)}><Github size={14}/><span>GitHub</span><ExternalLink size={11}/></button><button type="button" className="release-button release-button-primary" onClick={close}>{de?'Schließen':'Close'}</button></div>
      </footer>
    </div>
  </motion.div>
}

export function ChangelogModal(){
  const isOpen=useUIStore(state=>state.isChangelogOpen)
  // Stable callbacks preserve keyboard focus and the background scroll lock while data loads.
  const close=useRef(()=>{localStorage.setItem(`eclipse_changelog_seen_${APP_VERSION}`,'true');useUIStore.getState().setIsChangelogOpen(false)}).current
  const history=useRef(()=>{close();useUIStore.getState().setActiveView('eclipse-info')}).current
  return createPortal(<AnimatePresence>{isOpen&&<ReleaseDialog key="release-notes" close={close} history={history}/>}</AnimatePresence>,document.body)
}
