import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Plus, Star, Calendar, ChevronLeft, ChevronRight, Gamepad2 } from 'lucide-react'
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

// Removed useFallbackImg in favor of SmartImage

export function HeroSection({ games }: HeroSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const { openGameDetails, showNotification } = useUIStore()
  const { addToLibrary, library } = useGameStore()
  const { t } = useTranslation()

  const current = games[currentIndex]
  
  const currentAppId = current.steamId || (current as any).id || (current as any).appid || (current as any).app_id

  useEffect(() => {
    if (games.length <= 1) return
    const interval = setInterval(() => {
      setCurrentIndex(i => (i + 1) % games.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [games.length])

  if (!current) return null

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
    <div className="relative w-full h-[480px] overflow-hidden flex-shrink-0 bg-[#040405]">
      {/* Background images with smooth crossfade */}
      <AnimatePresence mode="sync">
        <motion.div
          key={currentAppId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-0 origin-center"
        >
          <SmartImage 
            appId={currentAppId} 
            type="hero" 
            alt={current.name} 
            fallbackScreenshotUrl={current.screenshots?.[0] || current.headerImage}
            className="w-full h-full object-cover opacity-90" 
          />
        </motion.div>
      </AnimatePresence>

      {/* Logo overlay (top right area) */}
      <AnimatePresence>
        <motion.div
          key={`logo-${currentAppId}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute top-8 right-8 w-48 h-24 z-10"
        >
          <img
            src={getLogoUrl(currentAppId)}
            alt=""
            className="h-28 object-contain drop-shadow-2xl"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-[#040405] via-[#040405]/50 to-transparent" />

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.steamId}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="absolute bottom-0 left-0 right-0 p-8 z-10"
        >
          {/* Genre tags */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {current.genres?.slice(0, 3).map(g => (
              <span
                key={g}
                className="text-[11px] font-medium px-3 py-1 rounded-full bg-white/10 text-white/90 backdrop-blur-md border border-white/5"
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
          <h2 className="text-4xl md:text-5xl font-black text-white mb-2 max-w-2xl leading-tight drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]">
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
                  <span className="text-[11px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded">
                    -{current.discountPercent}%
                  </span>
                )}
                <span className="text-white font-semibold">{current.priceFormatted}</span>
              </div>
            )}
          </div>

          {/* Description snippet */}
          {current.shortDescription && (
            <p className="text-sm text-white/60 mb-5 max-w-xl line-clamp-2 leading-relaxed drop-shadow-md">
              {current.shortDescription}
            </p>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <button
              id={`hero-view-${currentAppId}`}
              onClick={() => { if (currentAppId) openGameDetails(currentAppId) }}
              className="btn-primary flex items-center gap-2 text-sm px-6 py-2.5"
            >
              <Play size={15} className="fill-white" />
              {t('viewGame')}
            </button>
            <button
              id={`hero-add-${current.steamId}`}
              onClick={handleAddToLibrary}
              disabled={isInLibrary}
              className={`btn-ghost flex items-center gap-2 text-sm px-5 py-2.5 ${isInLibrary ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus size={15} />
              {isInLibrary ? t('inLibrary') : t('addToLibrary')}
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
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 glass rounded-full flex items-center justify-center text-white/70 hover:text-white hover:scale-110 transition-all cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            id="hero-next"
            onClick={() => setCurrentIndex(i => (i + 1) % games.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 glass rounded-full flex items-center justify-center text-white/70 hover:text-white hover:scale-110 transition-all cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 right-8 flex items-center gap-1.5 z-20">
            {games.slice(0, 15).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`rounded-full transition-all duration-300 cursor-pointer ${
                  i === currentIndex
                    ? 'w-6 h-1.5 bg-white'
                    : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Removed HeroBg component in favor of SmartImage
