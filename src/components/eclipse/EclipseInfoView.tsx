import { useState } from 'react'
import { ArrowUpRight, ChevronDown, Github, RefreshCw } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import { useLatestLauncherRelease, useLauncherReleaseHistory } from '../../hooks/useLauncherReleases'
import { APP_DISPLAY_VERSION, GITHUB_REPO } from '../../services/updateService'
import { RELEASES_URL } from '../../services/launcherReleases'
import { SmoothCollapse } from '../shared/SmoothCollapse'
import { ReleaseNotes, ReleaseLoading, ReleaseUnavailable, openReleaseLink } from './ReleaseNotes'

export function EclipseInfoView(){
  const {language}=useTranslation(),de=language==='de'
  const latest=useLatestLauncherRelease(),history=useLauncherReleaseHistory(),[expanded,setExpanded]=useState<Record<string,boolean>>({})
  const refresh=()=>{void latest.refetch();void history.refetch()}
  const checkUpdates=()=>{
    refresh()
    if(window.electronAPI?.checkUpdate){
      void window.electronAPI.checkUpdate().catch(()=>useUIStore.getState().showNotification(de?'Update-Prüfung fehlgeschlagen.':'Update check failed.','error'))
      useUIStore.getState().showNotification(de?'Suche nach Updates …':'Checking for updates …','info')
    }
  }
  const older=history.data?.filter(release=>release.tag_name!==latest.data?.tag_name)||[]
  const date=(value:string)=>new Date(value).toLocaleDateString(de?'de-DE':'en-US',{day:'numeric',month:'long',year:'numeric'})
  const empty=de?'Für diese Version wurden keine weiteren Hinweise veröffentlicht.':'No additional notes were published for this release.'
  const retryLabel=de?'Erneut versuchen':'Try again'
  return <div className="view-scroll launcher-page-surface release-history-page" data-release-history>
    <div className="release-history-container">
      <header className="release-history-header">
        <div><p className="release-eyebrow">ECLIPSE LAUNCHER</p><h1>{de?'Versionen & Änderungen':'Releases & changes'}</h1><p>{de?'Installierte Version':'Installed version'} <strong>v{APP_DISPLAY_VERSION}</strong><span>·</span>{de?'Versionshinweise von GitHub':'Release notes from GitHub'}</p></div>
        <div><button type="button" className="release-button" onClick={refresh} disabled={latest.isFetching||history.isFetching}><RefreshCw size={13} className={latest.isFetching||history.isFetching?'animate-spin':''}/>{de?'Aktualisieren':'Refresh'}</button><button type="button" className="release-button" onClick={()=>openReleaseLink(`https://github.com/${GITHUB_REPO}`)}><Github size={14}/>GitHub<ArrowUpRight size={12}/></button></div>
      </header>
      <section aria-labelledby="release-latest-heading" className="release-latest-section" data-latest-release>
        <div className="release-section-heading"><h2 id="release-latest-heading">{de?'Aktuellste Veröffentlichung':'Latest release'}</h2><span>GitHub</span></div>
        <div className="release-history-latest" aria-busy={latest.isPending}>
          {latest.isPending?<ReleaseLoading label={de?'Neueste Veröffentlichung wird geladen …':'Loading the latest release …'}/>:latest.isError?<ReleaseUnavailable title={de?'Veröffentlichung nicht verfügbar':'Release unavailable'} description={de?'Die Versionshinweise konnten nicht von GitHub geladen werden. Prüfe deine Verbindung oder versuche es erneut.':'The release notes could not be loaded from GitHub. Check your connection or try again.'} retry={()=>void latest.refetch()} retryLabel={retryLabel}/>:latest.data?<>
            <div className="release-summary"><div className="release-metadata"><span className="release-version" data-release-version>{latest.data.tag_name}</span><time dateTime={latest.data.published_at}>{date(latest.data.published_at)}</time></div><h3>{latest.data.name||latest.data.tag_name}</h3></div>
            <ReleaseNotes body={latest.data.body} emptyLabel={empty}/>
            <button type="button" className="release-text-button release-source-link" onClick={()=>openReleaseLink(latest.data!.html_url)}>{de?'Veröffentlichung auf GitHub':'Release on GitHub'}<ArrowUpRight size={12}/></button>
          </>:<p className="release-empty">{de?'Auf GitHub wurde noch keine Version veröffentlicht.':'No release has been published on GitHub yet.'}</p>}
        </div>
      </section>
      <section aria-labelledby="release-history-heading"><div className="release-section-heading"><h2 id="release-history-heading">{de?'Frühere Versionen':'Previous releases'}</h2><span>{older.length||''}</span></div>
        {history.isPending?<ReleaseLoading label={de?'Versionsverlauf wird geladen …':'Loading release history …'}/>:history.isError?<ReleaseUnavailable title={de?'Versionsverlauf nicht verfügbar':'Release history unavailable'} description={de?'Versuche es später erneut oder öffne die Veröffentlichungen auf GitHub.':'Try again later or open the releases on GitHub.'} retry={()=>void history.refetch()} retryLabel={retryLabel}/>:older.length?<div className="release-history-list">{older.map(release=>{
          const open=expanded[release.tag_name]===true
          return <article key={release.tag_name} className="release-history-item"><button type="button" aria-expanded={open} className="release-history-item-heading" onClick={()=>setExpanded(previous=>({...previous,[release.tag_name]:!open}))}><span><strong>{release.name||release.tag_name}</strong><small>{release.tag_name}<span>·</span>{date(release.published_at)}</small></span><ChevronDown size={15} className={open?'is-open':''}/></button>
            <SmoothCollapse open={open}><div className="release-history-item-content"><ReleaseNotes body={release.body} emptyLabel={empty}/><button type="button" className="release-text-button release-source-link" onClick={()=>openReleaseLink(release.html_url)}>{de?'Auf GitHub ansehen':'View on GitHub'}<ArrowUpRight size={12}/></button></div></SmoothCollapse>
          </article>
        })}</div>:<p className="release-empty">{de?'Keine früheren Veröffentlichungen verfügbar.':'No earlier releases available.'}</p>}
      </section>
      <div className="release-history-bottom"><button type="button" className="release-text-button" onClick={()=>useUIStore.getState().setIsChangelogOpen(true)}>{de?'Versionshinweise öffnen':'Open release notes'}</button><button type="button" className="release-text-button" onClick={checkUpdates}>{de?'Nach Updates suchen':'Check for updates'}</button><button type="button" className="release-text-button" onClick={()=>openReleaseLink(RELEASES_URL)}>{de?'Alle Veröffentlichungen auf GitHub':'All releases on GitHub'}<ArrowUpRight size={12}/></button></div>
    </div>
  </div>
}
