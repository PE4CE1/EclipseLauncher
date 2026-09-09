import { useState, useMemo, useEffect, useRef } from 'react'
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
    const isRoblox = validId === 999001 || alt?.toLowerCase() === 'roblox'
    if (isRoblox) {
      return [
        type === 'poster' ? getCoverUrl(999001) : getHeroUrl(999001),
        getCoverUrl(999001),
        getHeaderUrl(999001)
      ]
    }

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
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/library_hero.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${validId}/library_hero.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${validId}/page_bg_generated_v6.jpg`,
        ...(fallbackScreenshotUrl ? [fallbackScreenshotUrl] : []),
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/header.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${validId}/header.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${validId}/header.jpg`,
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${validId}/capsule_616x353.jpg`,
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
  const [isLoaded, setIsLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const fallbackImgRef = useRef<HTMLImageElement>(null)

  // Only reset loading state and index if the primary source URL actually changes
  const primarySrc = sources[0]
  const prevPrimarySrcRef = useRef(primarySrc)

  useEffect(() => {
    if (prevPrimarySrcRef.current !== primarySrc) {
      prevPrimarySrcRef.current = primarySrc
      setSrcIndex(0)
      setIsLoaded(false)
    }
  }, [primarySrc])

  // Instant DOM check: if browser already completed loading the image (from cache or fast decode), set isLoaded immediately
  useEffect(() => {
    const el = imgRef.current || fallbackImgRef.current
    if (el && el.complete && el.naturalWidth > 0) {
      setIsLoaded(true)
    }
  })

  // If all sources fail, render safe, clean minimalist placeholder card without any controller icon
  if (srcIndex >= sources.length) {
    return (
      <div className={`relative w-full h-full flex flex-col items-center justify-center bg-[#08090d] border border-white/[0.06] p-4 text-center select-none overflow-hidden ${className || ''}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.02),transparent_70%)]" />
        <span className="text-[11px] font-medium text-white/40 line-clamp-2 px-2 max-w-full z-10">
          {alt || 'Game'}
        </span>
      </div>
    )
  }

  const currentUrl = sources[srcIndex]
  const isHorizontalFallback = type === 'poster' && srcIndex >= 3 && srcIndex < sources.length - 1

  if (isHorizontalFallback) {
    return (
      <div className={`relative w-full h-full overflow-hidden bg-[#08090d] flex items-center justify-center p-3 select-none ${className || ''}`}>
        {!isLoaded && (
          <div className="cover-shimmer-container">
            <div className="cover-shimmer-wave" />
          </div>
        )}
        <img
          src={currentUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover filter blur-xl scale-150 opacity-40 brightness-75 pointer-events-none"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40 pointer-events-none" />
        <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-10">
          <span className="text-[9px] font-semibold tracking-widest uppercase text-white/50 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 shadow-sm">
            PREVIEW
          </span>
        </div>
        <div className="relative z-10 w-full aspect-[16/9] rounded-lg overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.85)] border border-white/15">
          <img
            ref={fallbackImgRef}
            src={currentUrl}
            alt={alt}
            className={`w-full h-full object-cover transition-opacity duration-300 ease-out ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setIsLoaded(false)
              setSrcIndex(prev => prev + 1)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#08090d]">
      {/* ─── Ultra Clean, Pure Minimalist Loading Shimmer (Zero Controller Icon, Zero CPU Load) ─── */}
      {!isLoaded && (
        <div className="cover-shimmer-container">
          <div className="cover-shimmer-wave" />
        </div>
      )}

      {/* Actual Cover / Image */}
      <img
        ref={imgRef}
        key={sources[srcIndex]}
        src={sources[srcIndex]}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ease-out ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className || ''}`}
        referrerPolicy="no-referrer"
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setIsLoaded(false)
          setSrcIndex(prev => prev + 1)
        }}
        loading={type === 'hero' ? 'eager' : 'lazy'}
        decoding={type === 'hero' ? 'sync' : 'async'}
      />
    </div>
  )
}
