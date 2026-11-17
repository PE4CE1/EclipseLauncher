import { useState, useEffect, useRef } from 'react'
import { Play, Plus, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { prepareHeroArtwork, getCachedHeroArtwork, type HeroArtwork } from '../../services/heroArtwork'
import { useTranslation } from '../../hooks/useTranslation'
import type { SteamGame } from '../../services/steamService'
import type { LibraryGame } from '../../types/game'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'
import '../layout/scene-motion.css'
import { localizeGameGenres } from '../../i18n/gameContent'

interface HeroSectionProps {
  games: SteamGame[]
  compact?: boolean
}

type Slide = { game: SteamGame; artwork: HeroArtwork }
const appIdOf = (game?: SteamGame) => Number(game?.steamId || (game as any)?.id || (game as any)?.appid || (game as any)?.app_id) || 0

function HeroVisual({ slide }: { slide: Slide }) {
  return <div className="hero-visual absolute inset-0 bg-[#040405] pointer-events-none" data-image-id={appIdOf(slide.game)}>
    <img src={slide.artwork.url} alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-90" decoding="async" />
    {slide.artwork.logo && <div className="absolute top-20 md:top-24 right-8 md:right-12 lg:right-14 max-w-[240px] md:max-w-[320px] flex items-center justify-end">
      <img src={slide.artwork.logo} alt="" className="max-h-24 md:max-h-32 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]" />
    </div>}
  </div>
}

export function HeroSection({ games, compact = false }: HeroSectionProps) {
  const showcase = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(true)
  const [selectedId, setSelectedId] = useState(() => appIdOf(games[0]))
  const requestedId = useRef(selectedId)
  requestedId.current = selectedId
  const [frame, setFrame] = useState<{ current: Slide | null; previous: Slide | null }>(() => {
    const game = games[0]
    const artwork = game && getCachedHeroArtwork(appIdOf(game), game.screenshots?.[0] || game.headerImage,game.heroImage)
    return { current: artwork ? { game, artwork } : null, previous: null }
  })
  const [isHovered, setIsHovered] = useState(false)
  const [keyboardFocus,setKeyboardFocus] = useState(false)
  const [isWindowFocused, setIsWindowFocused] = useState(() => !document.hidden && document.hasFocus())
  
  const openGameDetails = useUIStore(s => s.openGameDetails)
  const showNotification = useUIStore(s => s.showNotification)
  const addToLibrary = useGameStore(s => s.addToLibrary)
  const library = useGameStore(s => s.library)
  const modalOpen = useUIStore(s => s.isGameModalOpen)
  const reducedMotion = useReducedMotionPreference()
  const { t, language, locale } = useTranslation()
  const desired = games.find(game => appIdOf(game) === selectedId) || games[0]
  const desiredId = appIdOf(desired)

  useEffect(() => {
    if (!showcase.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting))
    observer.observe(showcase.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!desired || modalOpen || (frame.current && !isWindowFocused)) return
    if (frame.current && appIdOf(frame.current.game)===desiredId) return
    const controller = new AbortController()
    void prepareHeroArtwork(desiredId, desired.name, desired.screenshots?.[0] || desired.headerImage, controller.signal,desired.heroImage).then(artwork => {
      if (!artwork || controller.signal.aborted) return
      setFrame(previous => {
        const current = {
          game: previous.current && appIdOf(previous.current.game) === desiredId ? previous.current.game : desired,
          artwork,
        }
        // Keep one copy snapshot while visible; late feed enrichment must not
        // rearrange the title and buttons halfway through a slide.
        if (previous.current && appIdOf(previous.current.game) === desiredId && previous.current.artwork.url === artwork.url) return previous
        return { current, previous: reducedMotion ? null : previous.current }
      })
    })
    return () => controller.abort()
  }, [desired, desiredId, frame.current, isWindowFocused, modalOpen, reducedMotion])

  useEffect(() => {
    if (!frame.previous) return
    if (reducedMotion) {
      setFrame(previous => previous.previous ? { ...previous, previous: null } : previous)
      return
    }
    const id = appIdOf(frame.current?.game)
    // Also release the old layer if Chromium defers animation events in a hidden
    // window. Removing the incoming class leaves an opaque, ready image.
    const timer = setTimeout(() => setFrame(previous => appIdOf(previous.current?.game) === id ? { ...previous, previous: null } : previous), 650)
    return () => clearTimeout(timer)
  }, [frame.previous, frame.current, reducedMotion])

  // Track window visibility & focus to halt all background work when on 2nd monitor or tabbed out
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(!document.hidden)
    const handleBlur = () => setIsWindowFocused(false)
    const handleVisibilityChange = () => {
      setIsWindowFocused(!document.hidden && document.hasFocus())
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Rotate only after the previous transition completed and while the showcase
  // is visible and not being used. Rapid manual requests keep only the latest target.
  useEffect(() => {
    if (games.length <= 1 || !isVisible || !isWindowFocused || isHovered || keyboardFocus || modalOpen || reducedMotion || frame.previous || !frame.current || appIdOf(frame.current.game) !== desiredId) return
    const timer = setTimeout(() => {
      const index = games.findIndex(game => appIdOf(game) === desiredId)
      setSelectedId(appIdOf(games[(index + 1) % games.length]))
    }, 6500)
    return () => clearTimeout(timer)
  }, [games, desiredId, isVisible, isWindowFocused, isHovered, keyboardFocus, modalOpen, reducedMotion, frame])

  // Warm adjacent slides first, then the compact set with only two decodes in
  // flight. Dot navigation can reuse the same images without an extra request.
  useEffect(() => {
    if (!isVisible || !isWindowFocused || modalOpen || games.length < 2 || !frame.current || frame.previous) return
    const index = games.findIndex(game => appIdOf(game) === appIdOf(frame.current!.game))
    const controller = new AbortController()
    const steps = compact ? [1,-1,...Array.from({length:Math.min(8,games.length)-1},(_,i) => i+1)] : [1,-1]
    const queue = [...new Map(steps.map(step => {
      const game = games[(index+step+games.length)%games.length]
      return [appIdOf(game),game] as const
    })).values()]
    let next = 0
    const warm = async () => {
      while (next < queue.length && !controller.signal.aborted) {
        const game = queue[next++]
        await prepareHeroArtwork(appIdOf(game),game.name,game.screenshots?.[0]||game.headerImage,controller.signal,game.heroImage)
      }
    }
    void Promise.all(Array.from({length:Math.min(2,queue.length)},warm))
    return () => controller.abort()
  }, [games, frame, isVisible, isWindowFocused, modalOpen, compact])

  const current = frame.current?.game || desired
  const currentAppId = appIdOf(current)
  const currentIndex = Math.max(0, games.findIndex(game => appIdOf(game) === currentAppId))
  if (!current) return null
  const choose = (game:SteamGame) => {
    const id=appIdOf(game)
    requestedId.current=id
    setSelectedId(id)
    const ready=getCachedHeroArtwork(id,game.screenshots?.[0]||game.headerImage,game.heroImage)
    if (ready) setFrame(previous=>appIdOf(previous.current?.game)===id ? previous : {current:{game,artwork:ready},previous:reducedMotion?null:previous.current})
  }
  const move = (direction: number) => {
    const index = Math.max(0,games.findIndex(game=>appIdOf(game)===(requestedId.current||desiredId)))
    choose(games[(index+direction+games.length)%games.length])
  }
  const isInLibrary = library.some(g => g.steamId === currentAppId)

  function handleAddToLibrary() {
    if (!currentAppId || isInLibrary) return
    const game: LibraryGame = {
      id: `steam-${currentAppId}`,
      steamId: currentAppId,
      name: current.name,
      platform: 'custom',
      installed: false,
      addedAt: Date.now(),
      isFavorite: false,
      genres: current.genres,
      metacritic: current.metacritic,
      releaseDate: current.releaseDate,
      developer: current.developers?.[0],
      publisher: current.publishers?.[0],
    }
    addToLibrary(game)
    showNotification(t('addedToLibrary', { name: current.name }), 'success')
  }

  return (
    <div 
      ref={showcase}
      className="store-hero relative w-full h-[520px] md:h-[560px] overflow-hidden flex-shrink-0 bg-[#040405] select-none"
      data-hero-id={currentAppId}
      data-compact={compact || undefined}
      data-hero-paused={!isVisible || !isWindowFocused || isHovered || keyboardFocus || modalOpen || reducedMotion || undefined}
      data-hero-pending={desiredId !== currentAppId || undefined}
      onFocusCapture={event => setKeyboardFocus((event.target as HTMLElement).matches(':focus-visible'))}
      onMouseLeave={() => setIsHovered(false)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false) }}
    >
      {/* Keep the outgoing image fully opaque below the decoded incoming frame.
          Fading both layers out/in at once creates a dark flash halfway through. */}
      <div className="hero-scenery absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0" aria-hidden="true">
          {[reducedMotion ? null : frame.previous, frame.current].filter((slide): slide is Slide => !!slide).map(slide => {
            const incoming = slide === frame.current && !!frame.previous && !reducedMotion
            return <div key={`${appIdOf(slide.game)}:${slide.artwork.url}`}
              className={`hero-frame absolute inset-0 ${incoming ? 'hero-frame--incoming' : ''}`}
              onAnimationEnd={event => {
                if (incoming && event.target === event.currentTarget) setFrame(previous => previous.previous ? { ...previous, previous: null } : previous)
              }}><HeroVisual slide={slide} /></div>
          })}
        </div>

        {/* Gradient overlays (static, GPU rasterized once) */}
        <div className="absolute inset-0 hero-gradient pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-[#040405]/90 via-[#040405]/40 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-gradient-to-t from-[#040405] via-[#040405]/60 to-transparent pointer-events-none" />
      </div>

      {/* Content */}
        <div
          key={`content-${currentAppId}`}
          className="hero-copy absolute bottom-0 left-0 right-0 p-8 z-10"
        >
          {compact && <p className="home-hero-kicker">{t('homeSpotlight')}</p>}
          {/* Genre tags */}
          <div className="hero-genres flex items-center gap-2 mb-4 flex-wrap">
            {localizeGameGenres(current.genres, language)?.slice(0, 3).map(g => (
              <span
                key={g}
                className="text-[11px] font-medium px-3 py-1 rounded-full bg-white/10 text-white/90 border border-white/5"
              >
                {g}
              </span>
            ))}
            {current.metacritic && (
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-white/20 text-white border border-white/10">
                {current.metacritic} MC
              </span>
            )}
            {current.isFree && (
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-white/20 text-white border border-white/10">
                {t('freeToPlay')}
              </span>
            )}
            {compact && typeof current.currentPlayers === 'number' && <span className="home-hero-activity">{t('homeActivePlayers', {count: current.currentPlayers.toLocaleString(locale)})}</span>}
            {compact && typeof current.positivePercent === 'number' && <span>{t('homePositiveReviews', {percent: current.positivePercent})}</span>}
          </div>

          {/* Title */}
          <h2 className="text-4xl md:text-5xl font-black text-white mb-2 max-w-2xl leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
            {current.name}
          </h2>

          {/* Meta */}
          <div className="hero-meta flex items-center gap-4 mb-4 text-sm text-white/60">
            {current.releaseDate && (
              <div className="flex items-center gap-1">
                <Calendar size={13} />
                <span>{current.releaseDate.split(',').pop()?.trim() || current.releaseDate}</span>
              </div>
            )}
            {current.developers?.[0] && (
              <span className="text-white/50">{current.developers[0]}</span>
            )}
            {current.priceFormatted && !current.isFree && (
              <div className="flex items-center gap-1.5">
                {(current.discountPercent ?? 0) > 0 && (
                  <span className="text-[11px] font-bold bg-[#4c6b22] text-[#beee11] border border-[#beee11]/30 px-1.5 py-0.5 rounded">
                    -{current.discountPercent}%
                  </span>
                )}
                <span className="text-white font-semibold">{current.priceFormatted}</span>
              </div>
            )}
          </div>

          {/* Description snippet */}
            <p className="hero-description text-sm text-white/60 mb-5 max-w-xl line-clamp-2 leading-relaxed">
              {current.shortDescription || '\u00a0'}
            </p>

          {/* Buttons */}
          <div className="hero-actions flex items-center gap-3" onMouseEnter={()=>setIsHovered(true)} onMouseLeave={()=>setIsHovered(false)}>
            <button
              id={`hero-view-${currentAppId}`}
              onClick={() => { if (currentAppId) openGameDetails(currentAppId, current.name) }}
              className="btn-primary flex items-center gap-2 text-sm px-6 py-2.5 cursor-pointer"
            >
              <Play size={15} className="fill-black text-black" />
              <span>{t('viewGame')}</span>
            </button>
            <button
              id={`hero-add-${current.steamId}`}
              onClick={handleAddToLibrary}
              disabled={isInLibrary}
              className={`btn-ghost flex items-center gap-2 text-sm px-5 py-2.5 cursor-pointer ${isInLibrary ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus size={15} />
              <span>{isInLibrary ? t('inLibrary') : t('addToLibrary')}</span>
            </button>
          </div>
        </div>

      {/* Navigation */}
      {games.length > 1 && (
        <>
          <button
            id="hero-prev"
            onClick={() => move(-1)}
            onMouseEnter={()=>setIsHovered(true)} onMouseLeave={()=>setIsHovered(false)}
            className="absolute left-4 top-1/2 -mt-[18px] z-20 w-9 h-9 bg-black/50 hover:bg-black/80 border border-white/20 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label={t('uiPrevious')}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            id="hero-next"
            onClick={() => move(1)}
            onMouseEnter={()=>setIsHovered(true)} onMouseLeave={()=>setIsHovered(false)}
            className="absolute right-4 top-1/2 -mt-[18px] z-20 w-9 h-9 bg-black/50 hover:bg-black/80 border border-white/20 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label={t('uiNext')}
          >
            <ChevronRight size={18} />
          </button>

          {/* Dot indicators */}
          <nav className={`hero-pagination absolute bottom-4 right-8 flex items-center gap-1.5 z-20 ${compact ? 'hero-pagination--compact' : ''}`} aria-label={t('homeHighlightsLabel')} onMouseEnter={()=>setIsHovered(true)} onMouseLeave={()=>setIsHovered(false)}>
            {games.slice(0, 15).map((game, i) => (
              <button
                key={appIdOf(game)}
                type="button"
                data-highlight-id={appIdOf(game)}
                onClick={() => choose(game)}
                aria-current={appIdOf(game)===desiredId ? 'true' : undefined}
                className={`rounded-full transition-[width,background-color] duration-200 ease-out cursor-pointer ${
                  i === currentIndex
                    ? 'w-6 h-1.5 bg-white'
                    : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                }`}
                aria-label={t('homeSlide', {number: i + 1})+' · '+game.name}
                title={game.name}
              />
            ))}
          </nav>
        </>
      )}
    </div>
  )
}
