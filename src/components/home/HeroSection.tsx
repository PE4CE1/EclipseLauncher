import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Plus, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { getLogoUrl } from '../../services/assetHelper'
import { SmartImage } from '../shared/SmartImage'
import { useTranslation } from '../../hooks/useTranslation'
import type { SteamGame } from '../../services/steamService'
import type { LibraryGame } from '../../types/game'

interface HeroSectionProps {
  games: SteamGame[]
}

export function HeroSection({ games }: HeroSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [isWindowFocused, setIsWindowFocused] = useState(true)
  
  const { openGameDetails, showNotification } = useUIStore()
  const { addToLibrary, library, activeGame } = useGameStore()
  const { t } = useTranslation()

  // Track window visibility & focus to halt all background work when on 2nd monitor or tabbed out
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true)
    const handleBlur = () => setIsWindowFocused(false)
    const handleVisibilityChange = () => {
      setIsWindowFocused(document.visibilityState === 'visible')
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

  // Auto-rotation timer: Auto-advances every 8s reliably even in performance mode
  useEffect(() => {
    if (games.length <= 1 || !isWindowFocused) {
      return
    }

    const interval = setInterval(() => {
      setCurrentIndex(i => (i + 1) % games.length)
    }, 8000)

    return () => clearInterval(interval)
  }, [games.length, isWindowFocused])

  // Preload next upcoming hero image & logo into browser cache for instantaneous, zero-spike slide changes
  useEffect(() => {
    if (!games || games.length === 0) return
    const nextIndex = (currentIndex + 1) % games.length
    const nextGame = games[nextIndex]
    if (nextGame) {
      const nextAppId = nextGame.steamId || (nextGame as any).id || (nextGame as any).appid
      if (nextAppId) {
        const heroImg = new Image()
        heroImg.src = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${nextAppId}/library_hero.jpg`
        const logoImg = new Image()
        logoImg.src = getLogoUrl(nextAppId)
      }
    }
  }, [currentIndex, games])

  const current = games[currentIndex]
  if (!current) return null

  const currentAppId = current.steamId || (current as any).id || (current as any).appid || (current as any).app_id
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
      className="relative w-full h-[520px] md:h-[560px] overflow-hidden flex-shrink-0 bg-[#040405] select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background images with hardware-accelerated crossfade */}
      <AnimatePresence>
        <motion.div
          key={currentAppId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="absolute inset-0 will-change-[opacity] [transform:translateZ(0)]"
        >
          <SmartImage 
            appId={currentAppId} 
            type="hero" 
            alt={current.name} 
            fallbackScreenshotUrl={current.screenshots?.[0] || current.headerImage}
            className="w-full h-full object-cover opacity-90 pointer-events-none" 
          />
        </motion.div>
      </AnimatePresence>

      {/* Logo overlay - zero-overhead radial backdrop instead of heavy Gaussian blur-2xl filter */}
      <AnimatePresence>
        <motion.div
          key={`logo-${currentAppId}`}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute top-20 md:top-24 right-8 md:right-12 lg:right-14 max-w-[240px] md:max-w-[320px] z-10 pointer-events-none flex items-center justify-end will-change-[opacity,transform] [transform:translateZ(0)]"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.6)_0%,transparent_70%)] scale-150 -z-10 pointer-events-none" />
            <img
              src={getLogoUrl(currentAppId)}
              alt=""
              className="max-h-24 md:max-h-32 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
              onError={e => { e.currentTarget.style.display = 'none' }}
              loading="eager"
            />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays (static, GPU rasterized once) */}
      <div className="absolute inset-0 hero-gradient pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-[#040405]/90 via-[#040405]/40 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-gradient-to-t from-[#040405] via-[#040405]/60 to-transparent pointer-events-none" />

      {/* Content */}
      <AnimatePresence>
        <motion.div
          key={current.steamId}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute bottom-0 left-0 right-0 p-8 z-10 will-change-[opacity,transform] [transform:translateZ(0)]"
        >
          {/* Genre tags */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {current.genres?.slice(0, 3).map(g => (
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
          </div>

          {/* Title */}
          <h2 className="text-4xl md:text-5xl font-black text-white mb-2 max-w-2xl leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
            {current.name}
          </h2>

          {/* Meta */}
          <div className="flex items-center gap-4 mb-4 text-sm text-white/60">
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
          {current.shortDescription && (
            <p className="text-sm text-white/60 mb-5 max-w-xl line-clamp-2 leading-relaxed">
              {current.shortDescription}
            </p>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3">
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
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {games.length > 1 && (
        <>
          <button
            id="hero-prev"
            onClick={() => setCurrentIndex(i => (i - 1 + games.length) % games.length)}
            className="absolute left-4 top-1/2 -mt-[18px] z-20 w-9 h-9 bg-black/50 hover:bg-black/80 border border-white/20 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            id="hero-next"
            onClick={() => setCurrentIndex(i => (i + 1) % games.length)}
            className="absolute right-4 top-1/2 -mt-[18px] z-20 w-9 h-9 bg-black/50 hover:bg-black/80 border border-white/20 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 right-8 flex items-center gap-1.5 z-20">
            {games.slice(0, 15).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`rounded-full transition-all duration-200 cursor-pointer ${
                  i === currentIndex
                    ? 'w-6 h-1.5 bg-white'
                    : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
