import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Flame, Play, ChevronLeft, ChevronRight, Star, ExternalLink, KeyRound } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'

export interface PopularRobloxGame {
  placeId: string
  universeId?: string
  name: string
  category: string
  players: string
  rating: number
  desc: string
  codesCount: number
  color: string
}

export const POPULAR_ROBLOX_GAMES: PopularRobloxGame[] = [
  {
    placeId: '107778070777162',
    universeId: '10563114921',
    name: 'Steal An Egg',
    category: 'Simulator & Tycoon',
    players: '1.1M+',
    rating: 93,
    desc: 'Stiehl Eier von Monstern, brüte seltene Pets aus und maximiere dein passives Einkommen!',
    codesCount: 5,
    color: '#f59e0b'
  },
  {
    placeId: '4924922222',
    universeId: '1686885941',
    name: 'Brookhaven RP',
    category: 'Rollenspiel',
    players: '360k+',
    rating: 86,
    desc: 'Erkunde die Stadt, besitze Traumhäuser und lebe dein virtuelles Abenteuer.',
    codesCount: 5,
    color: '#a855f7'
  },
  {
    placeId: '2753915549',
    universeId: '994732206',
    name: 'Blox Fruits',
    category: 'Anime RPG',
    players: '300k+',
    rating: 92,
    desc: 'Segle über die Meere, besiege epische Bosse und meistere mächtige Teufelsfrüchte.',
    codesCount: 14,
    color: '#3b82f6'
  },
  {
    placeId: '142823291',
    universeId: '66654135',
    name: 'Murder Mystery 2',
    category: 'Horror & Escape',
    players: '260k+',
    rating: 92,
    desc: 'Entkomme dem Mörder als Unschuldiger oder decke das Geheimnis als Sheriff auf.',
    codesCount: 6,
    color: '#ef4444'
  },
  {
    placeId: '920587237',
    universeId: '383310974',
    name: 'Adopt Me!',
    category: 'Rollenspiel',
    players: '150k+',
    rating: 85,
    desc: 'Ziehe legendäre Haustiere auf, baue dein Traumhaus und erkunde Adoption Island.',
    codesCount: 4,
    color: '#06b6d4'
  },
  {
    placeId: '17625359962',
    universeId: '6035872082',
    name: 'Rivals',
    category: 'Action & PvP',
    players: '130k+',
    rating: 94,
    desc: 'Extrem schneller 1v1 Shooter mit blitzschnellen Reaktionen und Finishern.',
    codesCount: 4,
    color: '#8b5cf6'
  },
  {
    placeId: '16732694052',
    universeId: '5750914919',
    name: 'Fisch',
    category: 'Abenteuer & Angeln',
    players: '75k+',
    rating: 91,
    desc: 'Fange exotische Fische, entdecke mystische Inseln und rüste deine Angel auf.',
    codesCount: 8,
    color: '#06b6d4'
  },
  {
    placeId: '8737899170',
    universeId: '3317771874',
    name: 'Pet Simulator 99',
    category: 'Simulator & Handel',
    players: '70k+',
    rating: 95,
    desc: 'Sammle Diamanten, schlüpfe riesige Huge-Pets und dominiere das Trading.',
    codesCount: 3,
    color: '#ec4899'
  },
  {
    placeId: '15101393044',
    universeId: '5203828273',
    name: 'Dress to Impress',
    category: 'Fashion & Runway',
    players: '70k+',
    rating: 91,
    desc: 'Wähle Outfits passend zum Modethema und gewinne den glamourösen Laufsteg.',
    codesCount: 4,
    color: '#f43f5e'
  },
  {
    placeId: '6516141723',
    universeId: '2440500124',
    name: 'Doors',
    category: 'Horror & Escape',
    players: '45k+',
    rating: 93,
    desc: 'Überlebe 100 verfluchte Hotelzimmer voller Monster, Dunkelheit und Rätsel.',
    codesCount: 3,
    color: '#eab308'
  },
  {
    placeId: '15532962292',
    universeId: '5361032378',
    name: "Sol's RNG",
    category: 'Simulator & Tycoon',
    players: '43k+',
    rating: 90,
    desc: 'Rolle für hunderte seltene Auren, braue Tränke und crafte legendäres Equipment.',
    codesCount: 4,
    color: '#6366f1'
  },
  {
    placeId: '893973440',
    universeId: '372226183',
    name: 'Flee the Facility',
    category: 'Horror & Escape',
    players: '41k+',
    rating: 91,
    desc: 'Fliehe aus der Einrichtung, hacke Computer und entkomme der Bestie im Team.',
    codesCount: 2,
    color: '#10b981'
  },
  {
    placeId: '10449761463',
    universeId: '3808081382',
    name: 'The Strongest Battlegrounds',
    category: 'Action & PvP',
    players: '40k+',
    rating: 84,
    desc: 'Werde zum ultimativen Kämpfer mit flüssigen Combos und zerstörerischen Fähigkeiten.',
    codesCount: 3,
    color: '#f97316'
  },
  {
    placeId: '8481844229',
    universeId: '3240075297',
    name: 'Berry Avenue RP',
    category: 'Rollenspiel',
    players: '36k+',
    rating: 88,
    desc: 'Wähle schicke Häuser, coole Autos und lebe deinen Traum in einer lebendigen Stadt.',
    codesCount: 2,
    color: '#fb7185'
  },
  {
    placeId: '1962086868',
    universeId: '703124385',
    name: 'Tower of Hell',
    category: 'Action & PvP',
    players: '34k+',
    rating: 83,
    desc: 'Erklimme die Spitze des zufällig generierten Turms ohne einen einzigen Checkpoint.',
    codesCount: 2,
    color: '#e11d48'
  },
  {
    placeId: '6872265039',
    universeId: '2619619496',
    name: 'BedWars',
    category: 'Action & PvP',
    players: '23k+',
    rating: 87,
    desc: 'Beschütze dein Bett, sammle Ressourcen und zerstöre feindliche Betten.',
    codesCount: 3,
    color: '#0284c7'
  },
  {
    placeId: '16116270224',
    universeId: '5569032992',
    name: "Dandy's World",
    category: 'Horror & Escape',
    players: '22k+',
    rating: 92,
    desc: 'Mascot-Horror Koop: Repariere Maschinen und steige tiefer in die Stockwerke hinab.',
    codesCount: 3,
    color: '#84cc16'
  },
  {
    placeId: '16146832113',
    universeId: '5578556129',
    name: 'Anime Vanguards',
    category: 'Anime RPG',
    players: '21k+',
    rating: 91,
    desc: 'Beschwöre ikonische Anime-Helden und verteidige Welten gegen gewaltige Wellen.',
    codesCount: 4,
    color: '#a855f7'
  },
  {
    placeId: '13772394625',
    universeId: '4777817887',
    name: 'Blade Ball',
    category: 'Action & PvP',
    players: '20k+',
    rating: 94,
    desc: 'Pariere den zielsuchenden Ball mit präzisen Schwerthieben und Fähigkeiten.',
    codesCount: 6,
    color: '#ef4444'
  },
  {
    placeId: '3260590327',
    universeId: '1176784616',
    name: 'Tower Defense Simulator',
    category: 'Tower Defense',
    players: '10k+',
    rating: 90,
    desc: 'Platziere Verteidigungseinheiten gegen Horden von Zombies und bezwinge riesige Bosse.',
    codesCount: 4,
    color: '#14b8a6'
  },
  {
    placeId: '4520749081',
    universeId: '1451439645',
    name: 'King Legacy',
    category: 'Anime RPG',
    players: '5k+',
    rating: 91,
    desc: 'Erkunde die Grand Line, sammle legendäre Schwerter und meistere Früchte.',
    codesCount: 6,
    color: '#38bdf8'
  },
  {
    placeId: '13775256536',
    universeId: '4778845442',
    name: 'Toilet Tower Defense',
    category: 'Tower Defense',
    players: '3k+',
    rating: 89,
    desc: 'Verteidige deine Basis mit Cameramen gegen Horden furchtloser Toilets.',
    codesCount: 3,
    color: '#10b981'
  },
  {
    placeId: '2788229376',
    universeId: '1008451066',
    name: 'Da Hood',
    category: 'Action & PvP',
    players: '2k+',
    rating: 71,
    desc: 'Wähle deinen Weg zwischen Gesetzeshüter oder Krimineller in den rauen Straßen.',
    codesCount: 4,
    color: '#a855f7'
  }
]

interface LiveGameStat {
  players: number
  playersStr: string
  rating: number
}

interface RobloxPopularGamesProps {
  onSelectGame?: (gameName: string) => void
}

let globalRobloxThumbnails: Record<string, string> = {}
let globalRobloxLiveData: Record<string, LiveGameStat> = {}

function formatPlayerCount(count: number): string {
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1) + 'M'
  }
  if (count >= 10_000) {
    return Math.round(count / 1_000) + 'k'
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1) + 'k'
  }
  return count.toLocaleString()
}

function parsePlayerCount(str: string): number {
  if (!str) return 0
  const clean = str.toLowerCase().replace(/[^0-9.km+]/g, '')
  if (clean.includes('m')) {
    return (parseFloat(clean) || 0) * 1_000_000
  }
  if (clean.includes('k')) {
    return (parseFloat(clean) || 0) * 1_000
  }
  return parseFloat(clean) || 0
}

export const RobloxPopularGames: React.FC<RobloxPopularGamesProps> = ({ onSelectGame }) => {
  const { t } = useTranslation()
  const [thumbnails, setThumbnails] = useState<Record<string, string>>(globalRobloxThumbnails)
  const [liveStats, setLiveStats] = useState<Record<string, LiveGameStat>>(globalRobloxLiveData)
  // Carousel ref and mouse grab-to-scroll state
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeftPos, setScrollLeftPos] = useState(0)
  const [hasMoved, setHasMoved] = useState(false)

  // Fetch official high-res thumbnails and live stats for all popular games
  useEffect(() => {
    // 1. Thumbnails
    if (Object.keys(globalRobloxThumbnails).length === 0) {
      const placeIds = POPULAR_ROBLOX_GAMES.map(g => g.placeId).filter(Boolean)
      if (placeIds.length > 0) {
        const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeIds.join(',')}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`
        fetch(url)
          .then(res => res.json())
          .then(data => {
            if (data?.data && Array.isArray(data.data)) {
              const map: Record<string, string> = {}
              for (const item of data.data) {
                if (item.targetId && item.imageUrl) {
                  map[String(item.targetId)] = item.imageUrl
                }
              }
              globalRobloxThumbnails = map
              setThumbnails(map)
            }
          })
          .catch(() => {})
      }
    }

    // 2. Official Live Players & Rating Data from Roblox public API
    if (Object.keys(globalRobloxLiveData).length === 0) {
      const universeIds = POPULAR_ROBLOX_GAMES.map(g => g.universeId).filter(Boolean)
      if (universeIds.length > 0) {
        const uidsParam = universeIds.join(',')
        const gamesUrl = `https://games.roblox.com/v1/games?universeIds=${uidsParam}`
        const votesUrl = `https://games.roblox.com/v1/games/votes?universeIds=${uidsParam}`

        Promise.all([
          fetch(gamesUrl).then(r => r.json()).catch(() => null),
          fetch(votesUrl).then(r => r.json()).catch(() => null)
        ]).then(([gamesRes, votesRes]) => {
          const gamesData: any[] = gamesRes?.data || []
          const votesData: any[] = votesRes?.data || []

          const statsMap: Record<string, LiveGameStat> = {}

          for (const game of POPULAR_ROBLOX_GAMES) {
            if (!game.universeId) continue
            const gInfo = gamesData.find(g => String(g.id) === String(game.universeId))
            const vInfo = votesData.find(v => String(v.id) === String(game.universeId))

            const playing = typeof gInfo?.playing === 'number' ? gInfo.playing : null
            let rating = game.rating

            if (vInfo && typeof vInfo.upVotes === 'number' && typeof vInfo.downVotes === 'number') {
              const total = vInfo.upVotes + vInfo.downVotes
              if (total > 0) {
                rating = Math.round((vInfo.upVotes / total) * 100)
              }
            }

            if (playing !== null) {
              statsMap[game.placeId] = {
                players: playing,
                playersStr: formatPlayerCount(playing),
                rating
              }
            }
          }

          if (Object.keys(statsMap).length > 0) {
            globalRobloxLiveData = statsMap
            setLiveStats(statsMap)
          }
        }).catch(() => {})
      }
    }
  }, [])

  // Truly sort games by highest active player count descending
  const sortedGames = useMemo(() => {
    return [...POPULAR_ROBLOX_GAMES].sort((a, b) => {
      const playersA = liveStats[a.placeId]?.players ?? parsePlayerCount(a.players)
      const playersB = liveStats[b.placeId]?.players ?? parsePlayerCount(b.players)
      return playersB - playersA
    })
  }, [liveStats])

  // Scroll horizontally with arrows
  const handleScroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 520
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth'
    })
  }

  // Mouse Grab & Drag to scroll horizontally
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return
    setIsDragging(true)
    setHasMoved(false)
    setStartX(e.pageX - scrollRef.current.offsetLeft)
    setScrollLeftPos(scrollRef.current.scrollLeft)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    if (Math.abs(walk) > 4) {
      setHasMoved(true)
    }
    scrollRef.current.scrollLeft = scrollLeftPos - walk
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  const handleOpenWebsite = (placeId: string) => {
    const webUrl = `https://www.roblox.com/games/${placeId}`
    if (window.electronAPI?.openUrl) {
      window.electronAPI.openUrl(webUrl)
    } else {
      window.open(webUrl, '_blank')
    }
  }

  // Direct Roblox Game Launch into native Windows client
  const handleLaunchGame = async (placeId: string, gameName: string) => {
    const robloxUri = `roblox://placeId=${placeId}`
    const webFallback = `https://www.roblox.com/games/${placeId}`

    useUIStore.getState().showNotification(
      t('robloxLaunchingGame', { name: gameName }) || `Starte ${gameName} auf Roblox…`,
      'info',
      'Roblox'
    )

    try {
      useGameStore.getState().startPlaySession(robloxUri, `Roblox - ${gameName}`)
    } catch (_) {}

    try {
      if (window.electronAPI?.launchGame) {
        const res = await window.electronAPI.launchGame(robloxUri)
        if (!res?.success && window.electronAPI.openUrl) {
          await window.electronAPI.openUrl(robloxUri)
        }
      } else if (window.electronAPI?.openUrl) {
        await window.electronAPI.openUrl(robloxUri)
      } else {
        window.location.href = robloxUri
      }
    } catch {
      if (window.electronAPI?.openUrl) {
        window.electronAPI.openUrl(webFallback)
      } else {
        window.open(webFallback, '_blank')
      }
    }
  }

  const handleViewCodes = (gameName: string) => {
    if (onSelectGame) {
      onSelectGame(gameName)
    }
    window.dispatchEvent(new CustomEvent('roblox:select-game-codes', { detail: { gameName } }))

    const hubEl = document.getElementById('roblox-codes-hub')
    if (hubEl) {
      hubEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="w-full px-6 md:px-10 xl:px-14 py-3 select-none">
      {/* ─── Minimalist Header with Title & Arrow Navigation ──────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Flame size={13} />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              {t('robloxPopularGamesShowcase') || 'Beliebte Erlebnisse'}
            </h3>
            <span className="text-[11px] text-white/30 hidden sm:inline-block font-medium">
              • Von links nach rechts ziehen oder Pfeile nutzen
            </span>
          </div>
        </div>

        {/* Navigation Arrows */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleScroll('left')}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Nach links"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => handleScroll('right')}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Nach rechts"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ─── Single Horizontal Row (Draggable & Scrollable) ──────────────────── */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className={`flex items-stretch gap-3 overflow-x-auto hide-scrollbar select-none py-1 px-1 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {sortedGames.map((game) => {
          const imgUrl = thumbnails[game.placeId]
          const live = liveStats[game.placeId]
          const displayPlayers = live?.playersStr || game.players
          const displayRating = live?.rating !== undefined ? live.rating : game.rating

          return (
            <div
              key={game.placeId}
              onClick={() => {
                if (hasMoved) return
                handleViewCodes(game.name)
              }}
              className="group relative w-[210px] sm:w-[225px] flex-shrink-0 rounded-2xl bg-[#0b0c10]/90 border border-white/[0.07] hover:border-white/20 transition-all duration-200 overflow-hidden flex flex-col justify-between hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)] cursor-pointer"
            >
              {/* Thumbnail Cover */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#10121a]">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={game.name}
                    loading="lazy"
                    draggable={false}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
                  />
                ) : (
                  <div className="cover-shimmer-container">
                    <div className="cover-shimmer-wave" />
                  </div>
                )}

                {/* Subtle Vignette Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-transparent to-black/30 pointer-events-none" />

                {/* Top Live Players Pill */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span>{displayPlayers}</span>
                </div>

                {/* Hover Quick-Action Overlay */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-2 z-20">
                  {/* Direct Launch Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleLaunchGame(game.placeId, game.name)
                    }}
                    className="h-8 px-3 rounded-xl bg-white hover:bg-gray-100 text-black text-xs font-bold transition-transform hover:scale-105 flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
                    title={`${game.name} jetzt spielen`}
                  >
                    <Play size={11} className="fill-current" />
                    <span>{t('robloxPlayNow') || 'Spielen'}</span>
                  </button>

                  {/* Open Website Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenWebsite(game.placeId)
                    }}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-transform hover:scale-105 cursor-pointer active:scale-95"
                    title="Auf Roblox.com öffnen"
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>

              {/* Minimalist Card Details */}
              <div className="p-3 flex items-center justify-between gap-2 border-t border-white/[0.04]">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                    {game.name}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-0.5">
                    <span className="text-amber-400/90 font-medium flex items-center gap-0.5">
                      <Star size={10} className="fill-amber-400 inline" />
                      <span>{displayRating}%</span>
                    </span>
                    <span>•</span>
                    <span className="truncate">{game.category}</span>
                  </div>
                </div>

                {/* Codes Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewCodes(game.name)
                  }}
                  className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] hover:border-white/20 text-amber-300 text-[11px] font-semibold transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer"
                  title="Codes ansehen"
                >
                  <KeyRound size={10} className="text-amber-400" />
                  <span>Codes</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
