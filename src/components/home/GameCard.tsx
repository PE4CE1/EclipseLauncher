import { useTranslation } from '../../hooks/useTranslation'
import React from 'react'
import { Plus, Check, Trash2 } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import type { SteamGame } from '../../services/steamService'
import type { LibraryGame } from '../../types/game'
import { PosterArt } from '../shared/PosterArt'
import { findInstalledGame } from '../../services/gameInstallation'
import { localizeGameGenres } from '../../i18n/gameContent'

interface GameCardProps {
  game: SteamGame
  index?: number
  onOpen?: () => void
}

export const GameCard = React.memo(function GameCard({ game, onOpen }: GameCardProps) {
  const { t, language, locale } = useTranslation()
  const openGameDetails = useUIStore(s => s.openGameDetails)
  const showNotification = useUIStore(s => s.showNotification)
  const library = useGameStore(s => s.library)
  const addToLibrary = useGameStore(s => s.addToLibrary)
  const removeFromLibrary = useGameStore(s => s.removeFromLibrary)
  const installedGames = useGameStore(s => s.installedGames)
  const appId = game.steamId || (game as any).id || (game as any).appid || (game as any).app_id

  const isInLibrary = library.some(g => g.steamId === appId)
  const installedGame = findInstalledGame(installedGames, { steamId: Number(appId), name: game.name })

  function handleOpenGamePreview(id: number) {
    onOpen?.()
    openGameDetails(id, game.name)
  }

  function handleLibraryToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!appId) return
    
    if (isInLibrary) {
      const existingGame = library.find(g => g.steamId === appId)
      if (existingGame) {
        removeFromLibrary(existingGame.id)
        showNotification(t('wasRemoved', { name: game.name }), 'info')
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
      showNotification(t('addedToLibrary', { name: game.name }), 'success')
    }
  }

  return (
    <div
      id={`game-card-${appId}`}
      className="game-card store-game-card group w-44 flex-shrink-0 cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={game.name}
      onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); if (appId) handleOpenGamePreview(appId) } }}
      onClick={() => {
        if (appId) handleOpenGamePreview(appId)
      }}
    >
      <div 
        className="store-card-art relative aspect-[2/3] rounded-xl border border-white/5 bg-[#08090d]"
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-[#08090d] select-none">
          <PosterArt game={{ id: String(appId || game.name), name: game.name, platform: 'steam', steamId: appId, iconUrl: game.headerImage }} />

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-40">
          <button
            id={`card-add-${appId}`}
            onClick={handleLibraryToggle}
            className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-[background-color,color,border-color] duration-150 group/btn ${
              isInLibrary
                ? 'bg-white/10 hover:bg-red-500/20 text-white/70 hover:text-red-400 border border-white/10'
                : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {isInLibrary ? (
              <>
                <Check size={12} className="group-hover/btn:hidden" />
                <span className="group-hover/btn:hidden">{t('inLibrary')}</span>
                <span className="hidden group-hover/btn:flex items-center gap-1.5"><Trash2 size={12} />  {t('uiRemove')}</span>
              </>
            ) : (
              <><Plus size={12} />  {t('add')}</>
            )}
          </button>
        </div>

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {installedGame && (
            <span data-installed className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/20 text-white backdrop-blur-md border border-white/10 shadow-sm">

              {t('uiInstalledBadge')}
            </span>
          )}
          {game.isFree && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-white backdrop-blur-md border border-white/5 shadow-sm">

              {t('uiFree')}
            </span>
          )}
        </div>

        {/* Discount badge */}
        {(game.discountPercent ?? 0) > 0 && (
          <div className="absolute top-2 right-2 z-30 flex items-center justify-center bg-[#4c6b22] text-[#beee11] border border-[#beee11]/40 text-xs font-black px-2 py-0.5 rounded-md shadow-xl tracking-tight">
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
      <div className="mt-3 px-1">
        <p className="text-xs font-semibold text-hub-text truncate leading-tight transition-colors group-hover:text-white">{game.name}</p>
        <div className="flex items-center justify-between mt-1.5 gap-1.5">
          <p className="text-[11px] text-hub-muted truncate">
            {game.releaseDate?.split(',').pop()?.trim() || localizeGameGenres(game.genres, language)?.[0] || '—'}
          </p>
          {(game.discountPercent ?? 0) > 0 && game.priceFormatted ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {game.initialPriceFormatted && (
                <span className="text-[10px] text-white/40 line-through decoration-white/40 font-medium">
                  {game.initialPriceFormatted}
                </span>
              )}
              <span className="text-xs font-bold text-[#beee11] bg-[#4c6b22]/50 border border-[#beee11]/30 px-1.5 py-0.5 rounded">
                {game.priceFormatted}
              </span>
            </div>
          ) : game.priceFormatted && !game.isFree ? (
            <p className="text-[11px] font-semibold text-hub-text flex-shrink-0">
              {game.priceFormatted}
            </p>
          ) : game.isFree ? (
            <p className="text-[11px] font-semibold text-white/90 flex-shrink-0">{t('uiFree')}</p>
          ) : null}
        </div>
        {typeof game.currentPlayers === 'number' && <p className="home-card-activity">{t('homeActivePlayers', {count:game.currentPlayers.toLocaleString(locale)})}</p>}
      </div>
    </div>
  )
})
