import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getLibraryArtworkKey, getCachedLibraryArtwork, resolveLibraryArtwork, invalidateLibraryArtwork, type LibraryArtwork, type ArtworkGame, type ArtworkShape } from '../../services/libraryArtwork'
import { getPlaceholderCover, getPlaceholderHero } from '../../services/assetHelper'
import { CoverLoading } from './CoverLoading'

export const PosterArt = memo(function PosterArt({ game, className = '', shape = 'poster' }: { game: ArtworkGame; className?: string; shape?: ArtworkShape }) {
  const key = getLibraryArtworkKey(game, shape)
  const makeFallback = () => ({ url: shape === 'landscape' ? getPlaceholderHero(game.name) : getPlaceholderCover(game.name), isWide: shape === 'landscape', fallback: true })
  const container = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const currentKey = useRef(key)
  const previousSource = useRef({ name: game.name, icon: game.iconUrl })
  currentKey.current = key
  const [state, setState] = useState<{ key: string; artwork?: LibraryArtwork; loaded: boolean }>(() => ({ key, artwork: getCachedLibraryArtwork(game, shape), loaded: false }))
  const artwork = state.key === key ? state.artwork : getCachedLibraryArtwork(game, shape)
  const loaded = state.key === key && state.loaded
  useLayoutEffect(() => {
    // Cached covers must be visible before paint instead of flashing the placeholder on back-scroll.
    if (artwork && image.current?.complete && image.current.naturalWidth > 0) {
      setState(previous => previous.key === key && previous.loaded ? previous : {key, artwork, loaded: true})
    }
  }, [key, artwork])
  useEffect(() => {
    let active = true
    let cached = getCachedLibraryArtwork(game, shape)
    if (cached?.fallback && (previousSource.current.name !== game.name || previousSource.current.icon !== game.iconUrl)) {
      invalidateLibraryArtwork(game, undefined, shape)
      cached = undefined
    }
    previousSource.current = { name: game.name, icon: game.iconUrl }
    setState(previous => {
      const ready = previous.key === key && previous.artwork?.url === cached?.url && previous.loaded
      return previous.key === key && previous.artwork === cached && previous.loaded === ready
        ? previous : {key, artwork: cached, loaded: ready}
    })
    if (cached && !cached.fallback) return
    let observer: IntersectionObserver | undefined
    let visible = false
    const start = () => {
      visible = true
      observer?.disconnect()
      void resolveLibraryArtwork(game, undefined, shape).then(result => {
        if (active) setState({ key, artwork: result || makeFallback(), loaded: false })
      }).catch(() => {
        if (active) setState({ key, artwork: makeFallback(), loaded: false })
      })
    }
    if (typeof IntersectionObserver === 'undefined') start()
    else {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) start() }, { rootMargin: '180px' })
      if (container.current) observer.observe(container.current)
    }
    const retry = () => {
      if (visible && !document.hidden && getCachedLibraryArtwork(game, shape)?.fallback) { invalidateLibraryArtwork(game, undefined, shape); start() }
    }
    window.addEventListener('online', retry)
    return () => { active = false; observer?.disconnect(); window.removeEventListener('online', retry) }
  }, [key, game.name, game.iconUrl, shape])

  return (
    <div ref={container} className={`poster-art relative w-full h-full overflow-hidden bg-[#0c0d13] select-none ${className}`} data-artwork={artwork?.fallback ? 'placeholder' : artwork?.isWide ? 'wide' : 'poster'}>
      {!loaded && <CoverLoading/>}
      {artwork?.isWide && <div className="absolute inset-0 bg-gradient-to-b from-white/[0.025] via-transparent to-black/40" />}
      {artwork && <img ref={image} key={`${key}:${artwork.url}`} crossOrigin={artwork.crossOrigin} src={artwork.url} alt={game.name}
        loading="lazy" decoding="async" onLoad={() => setState({ key, artwork, loaded: true })}
        onError={() => {
          if (artwork.fallback) return
          invalidateLibraryArtwork(game, artwork.url, shape)
          setState({ key, artwork: undefined, loaded: false })
          void resolveLibraryArtwork(game, undefined, shape).then(result => {
            if (container.current && currentKey.current === key) setState({ key, artwork: result || makeFallback(), loaded: false })
          }).catch(() => {
            if (container.current && currentKey.current === key) setState({ key, artwork: makeFallback(), loaded: false })
          })
        }}
        className={`relative w-full h-full ${shape === 'landscape' ? (artwork.isWide ? 'object-cover' : 'object-contain') : artwork.isWide ? 'object-contain p-2' : 'object-cover'} transition-opacity duration-200 ease-out ${loaded ? 'opacity-100' : 'opacity-0'}`} />}
    </div>
  )
})
