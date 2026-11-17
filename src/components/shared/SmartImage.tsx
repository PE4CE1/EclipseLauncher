import { useState, useMemo, useEffect, useRef } from 'react'
import { getHeaderUrl, getHeroUrl, getPlaceholderHero } from '../../services/assetHelper'
import { PosterArt } from './PosterArt'
import { CoverLoading } from './CoverLoading'
import { getNonSteamGame } from '../../services/nonSteamGames'
import { getNonSteamArtwork } from '../../services/nonSteamArtwork'

interface SmartImageProps {
  appId?: number | string
  type: 'poster' | 'hero' | 'header'
  alt?: string
  className?: string
  fallbackScreenshotUrl?: string
}

export function SmartImage(props: SmartImageProps) {
  if (props.type === 'poster') return <PosterArt className={props.className} game={{ id: String(props.appId || props.alt || ''), steamId: Number(props.appId) || undefined, name: props.alt || '', platform: 'steam', iconUrl: props.fallbackScreenshotUrl }} />
  return <LandscapeImage key={`${props.appId}:${props.type}:${props.alt}`} {...props} />
}

function LandscapeImage({ appId, type, alt = '', className = '', fallbackScreenshotUrl }: SmartImageProps) {
  const steamId = getNonSteamGame(alt) ? undefined : appId
  const sources = useMemo(() => [...new Set([
    getNonSteamArtwork(alt)?.hero,
    getNonSteamGame(alt)?.hero,
    ...(steamId ? [type === 'hero' ? getHeroUrl(steamId) : getHeaderUrl(steamId)] : []),
    fallbackScreenshotUrl,
    ...(steamId ? [getHeaderUrl(steamId)] : []),
    getPlaceholderHero(alt),
  ].filter((source): source is string => !!source))], [steamId, type, alt, fallbackScreenshotUrl])
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => { if (image.current?.complete && image.current.naturalWidth > 0) setLoaded(true) }, [index, sources])
  return <div className="relative w-full h-full overflow-hidden bg-[#08090d]">
    {!loaded && <CoverLoading/>}
    {index < sources.length && <img ref={image} key={sources[index]} src={sources[index]} alt={alt}
      className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      decoding="async" loading={type === 'hero' ? 'eager' : 'lazy'}
      onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setIndex(previous => previous + 1) }} />}
  </div>
}
