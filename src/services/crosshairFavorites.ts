export interface CrosshairFavorite { name: string; page: string; thumbnail: string }
export const MAX_CROSSHAIR_FAVORITES = 200

/** Store links and labels only, never another copy of the image/animation. */
export function normalizeCrosshairFavorites(value: unknown): CrosshairFavorite[] {
  if (!Array.isArray(value)) return []
  const result = new Map<string, CrosshairFavorite>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || typeof item.page !== 'string' || typeof item.thumbnail !== 'string') continue
    if (!/^https:\/\/centerpointgaming\.com\/crosshairs\/[a-z0-9-]+\/$/.test(item.page) || !/^https:\/\/centerpointgaming\.com\/assets\/crosshairs\/[a-z0-9_-]+\.webp$/i.test(item.thumbnail)) continue
    const name = item.name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80)
    if (name) result.set(item.page, { name, page: item.page, thumbnail: item.thumbnail })
    if (result.size >= MAX_CROSSHAIR_FAVORITES) break
  }
  return [...result.values()]
}
export function toggleCrosshairFavorite(value: unknown, item: CrosshairFavorite): CrosshairFavorite[] {
  const favorites = normalizeCrosshairFavorites(value), candidate = normalizeCrosshairFavorites([item])[0]
  if (!candidate) return favorites
  return favorites.some(favorite => favorite.page === candidate.page)
    ? favorites.filter(favorite => favorite.page !== candidate.page)
    : favorites.length < MAX_CROSSHAIR_FAVORITES ? [...favorites, candidate] : favorites
}
