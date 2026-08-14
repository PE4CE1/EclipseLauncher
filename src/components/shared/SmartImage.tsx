import { useState, useMemo } from 'react'
import { getCoverUrl, getHeaderUrl, getHeroUrl, getPlaceholderCover, getPlaceholderHero } from '../../services/assetHelper'

interface SmartImageProps {
  appId?: number | string
  type: 'poster' | 'hero' | 'header'
  alt?: string
  className?: string
  fallbackScreenshotUrl?: string
}

export function SmartImage({ appId, type, alt, className, fallbackScreenshotUrl }: SmartImageProps) {
  const idNum = appId ? Number(appId) : undefined
  const validId = idNum && !isNaN(idNum) && idNum > 0 ? idNum : undefined

  const sources = useMemo(() => {
    if (!validId) {
      return fallbackScreenshotUrl 
        ? [fallbackScreenshotUrl, type === 'hero' ? getPlaceholderHero(alt || '') : getPlaceholderCover(alt || '')]
        : [type === 'hero' ? getPlaceholderHero(alt || '') : getPlaceholderCover(alt || '')]
    }

    if (type === 'poster') {
      return [
        getCoverUrl(validId),
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/library_600x900.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${validId}/library_600x900.jpg`,
        getHeaderUrl(validId),
        `https://cdn.akamai.steamstatic.com/steam/apps/${validId}/capsule_617x283.jpg`,
        ...(fallbackScreenshotUrl ? [fallbackScreenshotUrl] : []),
        getPlaceholderCover(alt || '')
      ]
    }

    if (type === 'hero') {
      return [
        getHeroUrl(validId),
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/library_hero.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${validId}/library_hero.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${validId}/page_bg_generated_v6.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${validId}/page_bg_generated_v6.jpg`,
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/header.jpg`,
        getHeaderUrl(validId),
        `https://cdn.akamai.steamstatic.com/steam/apps/${validId}/capsule_617x283.jpg`,
        ...(fallbackScreenshotUrl ? [fallbackScreenshotUrl] : []),
        getPlaceholderHero(alt || '')
      ]
    }

    // Default 'header'
    return [
      getHeaderUrl(validId),
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/header.jpg`,
      `https://cdn.akamai.steamstatic.com/steam/apps/${validId}/capsule_617x283.jpg`,
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/library_hero.jpg`,
      ...(fallbackScreenshotUrl ? [fallbackScreenshotUrl] : []),
      getPlaceholderHero(alt || '')
    ]
  }, [validId, type, alt, fallbackScreenshotUrl])

  const [srcIndex, setSrcIndex] = useState(0)

  // If even all sources fail, render safe placeholder SVG
  if (srcIndex >= sources.length) {
    const finalFallback = type === 'hero' ? getPlaceholderHero(alt || '') : getPlaceholderCover(alt || '')
    return (
      <img
        src={finalFallback}
        alt={alt || 'Game'}
        className={className}
      />
    )
  }

  const currentUrl = sources[srcIndex]
  const isHorizontalFallback = type === 'poster' && srcIndex >= 3 && srcIndex < sources.length - 1

  if (isHorizontalFallback) {
    return (
      <div className={`relative w-full h-full overflow-hidden bg-[#0a0b0f] flex items-center justify-center p-3 select-none ${className || ''}`}>
        <img
          src={currentUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover filter blur-xl scale-150 opacity-40 brightness-75 pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40 pointer-events-none" />
        <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-10">
          <span className="text-[9px] font-semibold tracking-widest uppercase text-white/50 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 shadow-sm">
            PREVIEW
          </span>
        </div>
        <div className="relative z-10 w-full aspect-[16/9] rounded-lg overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.85)] border border-white/15">
          <img
            src={currentUrl}
            alt={alt}
            className="w-full h-full object-cover"
            onError={() => {
              setSrcIndex(prev => prev + 1)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <img
      key={sources[srcIndex]}
      src={sources[srcIndex]}
      alt={alt}
      className={className}
      onError={() => {
        setSrcIndex(prev => prev + 1)
      }}
      loading="lazy"
    />
  )
}
