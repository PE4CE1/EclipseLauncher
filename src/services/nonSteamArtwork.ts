import { getNonSteamGame } from './nonSteamGames'
import fortnitePoster from '../assets/nonsteam/fortnite-poster.jpg'
import fortniteHero from '../assets/nonsteam/fortnite-hero.jpg'
import valorantPoster from '../assets/nonsteam/valorant-poster.webp'
import valorantHero from '../assets/nonsteam/valorant-hero.webp'
import leaguePoster from '../assets/nonsteam/league-of-legends-poster.webp'
import leagueHero from '../assets/nonsteam/league-of-legends-hero.webp'

const bundled: Record<string, { poster: string; hero: string }> = {
  fortnite: { poster: fortnitePoster, hero: fortniteHero },
  valorant: { poster: valorantPoster, hero: valorantHero },
  'league-of-legends': { poster: leaguePoster, hero: leagueHero },
}

export function getNonSteamArtwork(name?: string | null) {
  const game = getNonSteamGame(name)
  return game ? bundled[game.id] : undefined
}
