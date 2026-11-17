import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2, RefreshCw, Search, Star } from 'lucide-react'
import { getLibraryHtml, parseLibraryCategories, parseLibraryPage, selectLibraryCrosshair, LibraryImageError, type LibraryCategory, type LibraryCrosshair, type LibraryPage } from '../../services/crosshairLibrary'
import { CrosshairCategoryMenu } from './CrosshairCategoryMenu'
import type { CrosshairConfig } from '../../services/crosshairConfig'
import { MAX_CROSSHAIR_FAVORITES, normalizeCrosshairFavorites, toggleCrosshairFavorite, type CrosshairFavorite } from '../../services/crosshairFavorites'
import './crosshair-library.css'

export function CrosshairLibrary({ de, source, select, favorites:storedFavorites, saveFavorites }: { de: boolean; source?: string; select: (patch: Partial<CrosshairConfig>) => void; favorites?:CrosshairFavorite[]; saveFavorites:(favorites:CrosshairFavorite[])=>void }) {
  const [categories,setCategories]=useState<LibraryCategory[]>([]),[category,setCategory]=useState('/crosshairs/all/'),[path,setPath]=useState('/crosshairs/all/')
  const [page,setPage]=useState<LibraryPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[query,setQuery]=useState(''),[retry,setRetry]=useState(0)
  const [picking,setPicking]=useState(''),[selectionError,setSelectionError]=useState(''),selection=useRef<AbortController|null>(null)
  const [showFavorites,setShowFavorites]=useState(false)
  const favorites=useMemo(()=>normalizeCrosshairFavorites(storedFavorites),[storedFavorites]),favoritePages=useMemo(()=>new Set(favorites.map(item=>item.page)),[favorites])
  const latestFavorites=useRef(favorites);latestFavorites.current=favorites
  useEffect(()=>{const controller=new AbortController();void getLibraryHtml('/crosshairs/',controller.signal).then(html=>{if(!controller.signal.aborted)setCategories(parseLibraryCategories(html))}).catch(()=>{});return()=>controller.abort()},[retry])
  useEffect(()=>{
    if(showFavorites){setLoading(false);setError(false);return}
    const controller=new AbortController();setLoading(true);setError(false);setPage(null);setQuery('')
    void getLibraryHtml(path,controller.signal).then(html=>{if(!controller.signal.aborted){const result=parseLibraryPage(html);if(!result.items.length)throw new Error('Empty library');setPage(result)}}).catch(()=>{if(!controller.signal.aborted)setError(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[path,retry,showFavorites])
  useEffect(()=>()=>selection.current?.abort(),[])
  async function choose(item:LibraryCrosshair) {
    selection.current?.abort();const controller=new AbortController();selection.current=controller;setPicking(item.page);setSelectionError('')
    try {const image=await selectLibraryCrosshair(item,controller.signal);if(!controller.signal.aborted)select({...image,mode:'image',rotation:0,opacity:1})}
    catch (error) {if(!controller.signal.aborted)setSelectionError(error instanceof LibraryImageError?error.code:'unavailable')}
    finally {if(!controller.signal.aborted)setPicking('')}
  }
  function navigate(next:string) {selection.current?.abort();setPicking('');setSelectionError('');setPath(next)}
  function favorite(item:LibraryCrosshair) {const next=toggleCrosshairFavorite(latestFavorites.current,item);latestFavorites.current=next;saveFavorites(next)}
  function view(favoritesOnly:boolean) {selection.current?.abort();setPicking('');setSelectionError('');setQuery('');setShowFavorites(favoritesOnly)}
  const filtered=(showFavorites?favorites:page?.items||[]).filter(item=>item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <section className="crosshair-library" aria-label={de?'Community-Bibliothek':'Community library'}>
    <div className="crosshair-library-views" role="group" aria-label={de?'Bibliotheksansicht':'Library view'}><button type="button" data-crosshair-view="all" aria-pressed={!showFavorites} onClick={()=>view(false)}>{de?'Entdecken':'Discover'}</button><button type="button" data-crosshair-view="favorites" aria-pressed={showFavorites} onClick={()=>view(true)}><Star size={12}/>{de?'Favoriten':'Favorites'}<span>{favorites.length}</span></button></div>
    <div className="crosshair-library-toolbar">{showFavorites?<span className="crosshair-library-saved-label">{de?'Gespeicherte Fadenkreuze':'Saved crosshairs'}</span>:<CrosshairCategoryMenu categories={categories} value={category} de={de} change={next=>{setCategory(next);navigate(next)}}/>}<label><Search size={13}/><input aria-label={showFavorites?(de?'Favoriten durchsuchen':'Search favorites'):(de?'Auf dieser Seite suchen':'Search this page')} placeholder={showFavorites?(de?'Favoriten durchsuchen':'Search favorites'):(de?'Diese Seite durchsuchen':'Search this page')} value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
    {loading?<div className="crosshair-library-status" role="status"><Loader2 size={17} className="animate-spin"/>{de?'Bibliothek wird geladen…':'Loading library…'}</div>:error?<div className="crosshair-library-status" role="alert"><span>{de?'Die Bibliothek ist gerade nicht erreichbar.':'The library is currently unavailable.'}</span><button type="button" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={13}/>{de?'Erneut versuchen':'Try again'}</button></div>:<>
      <div className="crosshair-library-grid" key={showFavorites?'favorites':path}>{filtered.map(item=>{
        const saved=favoritePages.has(item.page),full=!saved&&favorites.length>=MAX_CROSSHAIR_FAVORITES
        const label=full?(de?'Maximal 200 Favoriten':'Maximum 200 favorites'):`${saved?(de?'Aus Favoriten entfernen':'Remove favorite'):(de?'Zu Favoriten hinzufügen':'Add favorite')}: ${item.name}`
        return <div className="crosshair-library-card" key={item.page}><button type="button" className="crosshair-library-select" data-library-crosshair={item.page} aria-pressed={source===item.page} disabled={picking===item.page} onClick={()=>void choose(item)}><span className="crosshair-library-art"><img src={item.thumbnail} loading="lazy" decoding="async" referrerPolicy="no-referrer" alt="" onError={event=>{event.currentTarget.style.visibility='hidden'}}/>{picking===item.page?<Loader2 size={16} className="crosshair-library-mark animate-spin"/>:source===item.page?<Check size={14} className="crosshair-library-mark"/>:null}</span><span className="crosshair-library-name" title={item.name}>{item.name}</span></button><button type="button" className="crosshair-library-favorite" data-favorite-page={item.page} aria-label={label} title={label} aria-pressed={saved} disabled={full} onClick={()=>favorite(item)}><Star size={13} fill={saved?'currentColor':'none'}/></button></div>
      })}</div>
      {!filtered.length&&<p className="crosshair-library-empty">{showFavorites&&!query?(de?'Markiere Fadenkreuze mit dem Stern, um sie hier zu speichern.':'Star crosshairs to save them here.'):(de?'Keine Treffer.':'No matches.')}</p>}
      {!showFavorites&&<div className="crosshair-library-pages"><button type="button" aria-label={de?'Vorherige Seite':'Previous page'} disabled={!page?.previous} onClick={()=>page?.previous&&navigate(page.previous)}><ArrowLeft size={14}/></button><span>{de?'Seite':'Page'} {path.match(/\/page\/(\d+)\//)?.[1]||'1'}</span><button type="button" aria-label={de?'Nächste Seite':'Next page'} disabled={!page?.next} onClick={()=>page?.next&&navigate(page.next)}><ArrowRight size={14}/></button></div>}
    </>}
    {selectionError&&<p className="crosshair-error" role="alert">{selectionError==='limits'?(de?'Dieses Bild ist zu aufwendig für das Overlay. Dein bisheriges Fadenkreuz bleibt erhalten.':'This image exceeds the overlay’s resource limits. Your current crosshair has been preserved.'):(de?'Dieses Originalbild konnte nicht geladen werden. Dein bisheriges Fadenkreuz bleibt erhalten.':'Unable to load this original image. Your current crosshair has been preserved.')}</p>}
    <p className="crosshair-library-credit">{de?'Designs der Crosshair-X-Community. Originalanimationen bleiben erhalten.':'Designs by the Crosshair X community. Original animations are preserved.'}<a href="https://centerpointgaming.com/crosshairs/" target="_blank" rel="noreferrer">CenterPoint Gaming <ExternalLink size={10}/></a></p>
  </section>
}
