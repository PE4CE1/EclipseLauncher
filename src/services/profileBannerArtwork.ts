import { getSteamArtwork } from './steamArtwork'
import { resolveLibraryArtwork, type ArtworkGame } from './libraryArtwork'

async function available(url: string): Promise<boolean> {
  try {
    if (window.electronAPI?.prefetchArtwork) return await window.electronAPI.prefetchArtwork({ id: `profile-banner-${crypto.randomUUID()}`, url })
    return await new Promise<boolean>(resolve => {
      const image = new Image(), timeout = setTimeout(() => finish(false), 4500)
      const finish = (value: boolean) => { clearTimeout(timeout); image.onload = null; image.onerror = null; resolve(value) }
      image.onload = () => finish(image.naturalWidth > 0)
      image.onerror = () => finish(false)
      image.src = url
    })
  } catch { return false }
}

export async function resolveProfileBannerArtwork(game: ArtworkGame): Promise<string | undefined> {
  if (game.steamId) {
    const metadata = await getSteamArtwork(game.steamId)
    if (metadata?.hero) return metadata.hero
    // A small store header is appropriate for rows, but a full-width banner needs the hero first.
    const hero = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.steamId}/library_hero.jpg`
    if (await available(hero)) return hero
  }
  const artwork = await resolveLibraryArtwork(game, undefined, 'landscape')
  return artwork && !artwork.fallback ? artwork.url : undefined
}
