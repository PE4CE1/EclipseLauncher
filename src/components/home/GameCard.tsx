import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Check, Star, Trash2 } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import type { SteamGame } from '../../services/steamService'
import type { LibraryGame } from '../../types/game'
import { getPlaceholderCover } from '../../services/assetHelper'

interface GameCardProps {
  game: SteamGame
  index?: number
}

export const GameCard = React.memo(function GameCard({ game, index = 0 }: GameCardProps) {
  const { openGameDetails, showNotification } = useUIStore()
  const { library, addToLibrary, removeFromLibrary, installedGames } = useGameStore()
  const cardRef = React.useRef<HTMLDivElement>(null)
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    // Calculate rotation directly
    const rotateX = ((y - centerY) / centerY) * -7
    const rotateY = ((x - centerX) / centerX) * 7
    const px = (x / rect.width) * 100
    const py = (y / rect.height) * 100
    
    el.style.setProperty('--rx', `${rotateX}deg`)
    el.style.setProperty('--ry', `${rotateY}deg`)
    el.style.setProperty('--mx', `${px}%`)
    el.style.setProperty('--my', `${py}%`)
  }

  const handleMouseLeave = () => {
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
  }
  
  const appId = game.steamId || (game as any).id || (game as any).appid || (game as any).app_id

  const isInLibrary = library.some(g => g.steamId === appId)
  const libGame = library.find(g => g.steamId === appId)
  const installedGame = installedGames.find(g =>
    (g.appId && g.appId === String(appId)) ||
    g.name.toLowerCase().includes(game.name.toLowerCase().slice(0, 8))
  )

  function handleOpenGamePreview(id: number) {
    openGameDetails(id)
  }

  const primaryUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`
  const secondaryUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
  const fallbackUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`

  const [imgSrc, setImgSrc] = useState(primaryUrl)
  const [hasError, setHasError] = useState(!appId)

  // Update image source when appId changes (e.g. from cache bust)
  useEffect(() => {
    if (appId) {
      setImgSrc(primaryUrl)
      setHasError(false)
    } else {
      setHasError(true)
    }
  }, [appId, primaryUrl])

  const handleImageError = () => {
    if (imgSrc === primaryUrl) {
      setImgSrc(secondaryUrl)
    } else if (imgSrc === secondaryUrl) {
      setImgSrc(fallbackUrl)
    } else {
      setHasError(true)
    }
  }

  function handleLibraryToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!appId) return
    
    if (isInLibrary) {
      const existingGame = library.find(g => g.steamId === appId)
      if (existingGame) {
        removeFromLibrary(existingGame.id)
        showNotification(`${game.name} removed from library`, 'info')
      }
    } else {
      const newGame: LibraryGame = {
        id: `steam-${appId}`,
        steamId: appId,
        name: game.name,
        platform: installedGame?.platform ?? 'custom',
        installed: !!installedGame,
        installPath: installedGame?.installPath,
        launchUrl: installedGame?.launchUrl,
        addedAt: Date.now(),
        isFavorite: false,
        genres: game.genres,
        metacritic: game.metacritic,
        releaseDate: game.releaseDate,
        developer: game.developers?.[0],
        publisher: game.publishers?.[0],
      }
      addToLibrary(newGame)
      showNotification(`${game.name} added to library`, 'success')
    }
  }

  return (
    <div
      id={`game-card-${appId}`}
      className="group w-44 flex-shrink-0 cursor-pointer"
      onClick={() => {
        if (appId) handleOpenGamePreview(appId)
      }}
    >
      <div 
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative aspect-[2/3] rounded-xl border border-white/5 bg-transparent transition-all duration-200 ease-out group-hover:shadow-[0_20px_40px_-10px_rgba(255,255,255,0.1)] group-hover:border-white/20 group-hover:scale-[1.02]"
        style={{
          transform: 'perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
          transformStyle: 'preserve-3d',
        }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-hub-elevated [transform:translateZ(0)]">
          {!hasError ? (
            imgSrc === fallbackUrl ? (
              <div className="relative w-full h-full overflow-hidden bg-[#0a0b0f] flex items-center justify-center p-3 select-none">
                <img
                  src={imgSrc}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover filter blur-md scale-125 opacity-40 brightness-75 pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40 pointer-events-none" />
                <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-10">
                  <span className="text-[9px] font-semibold tracking-widest uppercase text-white/50 bg-black/70 px-2 py-0.5 rounded-full border border-white/10 shadow-sm">
                    PREVIEW
                  </span>
                </div>
                <div className="relative z-10 w-full aspect-[16/9] rounded-lg overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.85)] border border-white/15">
                  <img
                    src={imgSrc}
                    onError={handleImageError}
                    alt={game.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            ) : (
              <img
                src={imgSrc}
                onError={handleImageError}
                alt={game.name}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover z-10 relative transition-transform duration-300 ease-out group-hover:scale-[1.03]"
              />
            )
          ) : (
            <img
              src={getPlaceholderCover(game.name)}
              alt={game.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover z-10 relative transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            />
          )}

          {/* Subtle glass overlay */}
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-300 z-20 pointer-events-none opacity-0 group-hover:opacity-100" />
          
          {/* Dynamic Parallax Glare */}
          <div 
            className="absolute inset-0 z-30 pointer-events-none rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{
              background: 'radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.12) 0%, transparent 60%)'
            }}
          />

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-40">
          <button
            id={`card-add-${appId}`}
            onClick={handleLibraryToggle}
            className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all group/btn ${
              isInLibrary
                ? 'bg-white/10 hover:bg-red-500/20 text-white/70 hover:text-red-400 border border-white/10'
                : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {isInLibrary ? (
              <>
                <Check size={12} className="group-hover/btn:hidden" />
                <span className="group-hover/btn:hidden">In Library</span>
                <span className="hidden group-hover/btn:flex items-center gap-1.5"><Trash2 size={12} /> Remove</span>
              </>
            ) : (
              <><Plus size={12} /> Add</>
            )}
          </button>
        </div>

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {installedGame && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/20 text-white backdrop-blur-md border border-white/10 shadow-sm">
              ✓ Installed
            </span>
          )}
          {game.isFree && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-white backdrop-blur-md border border-white/5 shadow-sm">
              Free
            </span>
          )}
        </div>

        {/* Discount badge */}
        {(game.discountPercent ?? 0) > 0 && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            -{game.discountPercent}%
          </div>
        )}

        {/* Metacritic score */}
        {game.metacritic && (
          <div className="absolute bottom-2 right-2 z-50 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] font-bold text-green-400">
            {game.metacritic}
          </div>
        )}
        </div>
      </div>

      {/* Info below card */}
      <div className="mt-3 px-1 transition-all duration-300 group-hover:translate-y-1">
        <p className="text-xs font-semibold text-hub-text truncate leading-tight transition-colors group-hover:text-white">{game.name}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[11px] text-hub-muted truncate">
            {game.releaseDate?.split(',').pop()?.trim() || game.genres?.[0] || '—'}
          </p>
          {game.priceFormatted && !game.isFree && (
            <p className="text-[11px] font-semibold text-hub-text flex-shrink-0">
              {game.priceFormatted}
            </p>
          )}
          {game.isFree && (
            <p className="text-[11px] font-semibold text-indigo-400 flex-shrink-0">Free</p>
          )}
        </div>
      </div>
    </div>
  )
})
