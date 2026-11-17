export type DealCurrency = 'EUR' | 'USD'
export type OfferType = 'key' | 'account' | 'gift'
export type StoreCategory = 'keyseller' | 'marketplace' | 'store'

export interface KeyStoreDeal {
  offerId: number
  storeId: string
  storeName: string
  category: StoreCategory
  offerType: OfferType
  platform: string
  platformLabel: string
  regionLabel: string
  compatibleRegion: boolean
  edition: string
  editionId: string
  defaultEdition: boolean
  price: number
  basePrice: number
  cardPrice?: number
  paypalPrice?: number
  priceFormatted: string
  retailPrice: number
  retailPriceFormatted: string
  savingsPercent: number
  voucherCode?: string
  voucherDiscount?: string
  dealUrl: string
  isOfficial: boolean
  hasConfirmedPrice: boolean
  isVerifiedLive: boolean
  stockStatus: 'in_stock'
}
export interface GamePriceComparison {
  deals: KeyStoreDeal[]
  comparisonUrl?: string
  checkedAt: number
  currency: DealCurrency
  gameName: string
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const plainText = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity: string) => {
  if (entity[0] === '#') {
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
  }
  return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' } as Record<string, string>)[entity.toLowerCase()] || ''
}).replace(/\s+/g, ' ').trim()
export const cleanGameTitleForKeyforsteam = (title: string) => title.replace(/[®™©]/g, '').replace(/\s*[([](?:PC|Steam|Windows|Global|EU|US)[)\]]/gi, '').replace(/\s+/g, ' ').trim()
export const normalizeDealTitle = (title: string) => cleanGameTitleForKeyforsteam(plainText(title)).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\bstandard edition\b/g, '').replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '')
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100_000
export const formatDealPrice = (value: number, currency: DealCurrency, language = 'de') => new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-US', { style: 'currency', currency }).format(value)
const attr = (tag: string, name: string) => plainText(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] || '')

export function comparisonUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && ['www.keyforsteam.de', 'www.allkeyshop.com', 'www.goclecd.fr', 'www.clavecd.es', 'www.cdkeyit.it'].includes(url.hostname)) return url.href
  } catch {}
}

/** Parse JSON assigned by the provider, never execute downloaded JavaScript. */
export function assignedJson(html: string, variable: string): Record<string, unknown> {
  const start = new RegExp(`\\b${variable}\\s*=\\s*\\{`).exec(html)
  if (!start) throw new Error('Price data unavailable')
  const first = html.indexOf('{', start.index)
  let depth = 0, quoted = false, escaped = false
  for (let index = first; index < Math.min(html.length, first + 2_000_000); index++) {
    const char = html[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return record(JSON.parse(html.slice(first, index + 1)))
  }
  throw new Error('Incomplete price data')
}

export function findComparisonPage(raw: unknown, gameTitle: string): string | undefined {
  const data = record(raw), html = data.resultsGames || data.results
  if (typeof html !== 'string' || html.length > 2_000_000) return
  const title = normalizeDealTitle(gameTitle)
  if (!title) return
  for (const match of html.matchAll(/<li\b[^>]*data-platforms\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    if (!match[1].split(/[\s,]+/).includes('pc')) continue
    const name = /<h2\b[^>]*class=["'][^"']*ls-results-row-game-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i.exec(match[2])?.[1]
    const link = /<a\b[^>]*>/i.exec(match[2])?.[0]
    if (name && link && normalizeDealTitle(name) === title) {
      const url = comparisonUrl(attr(link, 'href'))
      if (url) return url
    }
  }
}

export function currencyComparisonPage(html: string, currency: DealCurrency): string | undefined {
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) if (attr(match[0], 'data-currency') === currency.toLowerCase()) return comparisonUrl(attr(match[0], 'href'))
}

export function parseComparisonPage(html: string, gameTitle: string, currency: DealCurrency, steamPrice: number | undefined, language: string): KeyStoreDeal[] {
  if (html.length > 4_000_000) throw new Error('Price response too large')
  const title = /<[^>]+data-itemprop=["']name["'][^>]*>([\s\S]*?)<\//i.exec(html)?.[1]
  if (!title || normalizeDealTitle(title) !== normalizeDealTitle(gameTitle)) throw new Error('Price page does not match this game')
  const site = assignedJson(html, '__site')
  if (site.currency !== currency.toLowerCase()) throw new Error('Price page currency mismatch')
  const script = /<script\b[^>]*id=["']aks-offers-js-extra["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1]
  if (!script) throw new Error('Offer data unavailable')
  const data = assignedJson(script, 'gamePageTrans'), merchants = record(data.merchants), editions = record(data.editions), regions = record(data.regions)
  if (!Array.isArray(data.prices)) throw new Error('Price offers unavailable')
  const seen = new Set<number>()
  const standard = Object.entries(editions).find(([, value]) => /^(standard|standard edition|regular|base game)$/i.test(String(record(value).name)))?.[0]
  return data.prices.slice(0, 2000).flatMap(value => {
    const item = record(value), id = item.id, merchant = item.merchant
    if (!positiveId(id) || !positiveId(merchant) || seen.has(id) || item.dispo !== 1 || !amount(item.price) || typeof item.account !== 'boolean') return []
    const store = record(merchants[String(merchant)]), region = record(regions[String(item.region)]), edition = record(editions[String(item.edition)])
    if (typeof store.name !== 'string' || typeof region.filter_name !== 'string' || typeof edition.name !== 'string' || typeof item.activationPlatform !== 'string') return []
    const platform = item.activationPlatform.toLowerCase()
    if (!['steam', 'gog', 'epic', 'epic-games', 'epic-store', 'uplay', 'ubisoft', 'origin', 'ea', 'battle-net', 'battlenet', 'rockstar', 'xbox-play-anywhere', 'microsoft'].includes(platform)) return []
    seen.add(id)
    const regionLabel = plainText(region.filter_name).slice(0, 100)
    const compatibleRegion = /\b(?:GLOBAL|EUROPA|EUROPE|EU|EMEA|DE|GERMANY|DACH)\b/i.test(regionLabel)
    const offerType: OfferType = item.account || /\b(?:KONTO|ACCOUNT)\b/i.test(regionLabel) ? 'account' : /\bGIFT\b/i.test(regionLabel) ? 'gift' : 'key'
    const platformLabel = ({ steam: 'Steam', gog: 'GOG', 'epic': 'Epic Games', 'epic-games': 'Epic Games', 'epic-store': 'Epic Games', 'xbox-play-anywhere': 'Xbox / PC' } as Record<string, string>)[platform] || platform
    const cardPrice = item.allowCard === true && amount(item.priceCard) ? item.priceCard : undefined
    const paypalPrice = item.allowPaypal === true && amount(item.pricePaypal) ? item.pricePaypal : undefined
    // Provider prices already include its coupon. Never subtract the coupon twice.
    const price = cardPrice || item.price
    const defaultEdition = standard ? String(item.edition) === standard : /edition/i.test(gameTitle) && normalizeDealTitle(gameTitle).includes(normalizeDealTitle(edition.name))
    const retailPrice = defaultEdition && offerType === 'key' && platform === 'steam' && steamPrice && amount(steamPrice) ? steamPrice : 0
    const voucherCode = typeof item.voucher_code === 'string' && /^[\w-]{1,64}$/.test(item.voucher_code) ? item.voucher_code : undefined
    const link = new URL(`https://www.allkeyshop.com/redirection/offer/${currency.toLowerCase()}/${id}`)
    link.searchParams.set('locale', language === 'de' ? 'de_DE' : 'en_US')
    link.searchParams.set('merchant', String(merchant))
    if (voucherCode) link.searchParams.set('coupon', voucherCode)
    return [{ offerId: id, storeId: String(merchant), storeName: plainText(store.name).slice(0, 100),
      category: store.official === true || item.isOfficial === true ? 'store' as const : /eneba|gamivo|g2a|kinguin|difmark/i.test(store.name) ? 'marketplace' as const : 'keyseller' as const,
      offerType, platform, platformLabel, regionLabel, compatibleRegion, edition: plainText(edition.name).slice(0, 100), editionId: String(item.edition), defaultEdition,
      price, basePrice: item.price, cardPrice, paypalPrice, priceFormatted: formatDealPrice(price, currency, language), retailPrice,
      retailPriceFormatted: retailPrice ? formatDealPrice(retailPrice, currency, language) : '', savingsPercent: retailPrice > price ? Math.round((retailPrice-price)/retailPrice*100) : 0,
      voucherCode, voucherDiscount: voucherCode && amount(item.voucher_discount_value) && item.voucher_discount_value <= 100 && item.voucher_discount_type === '%' ? `−${item.voucher_discount_value}%` : undefined,
      dealUrl: link.href, isOfficial: store.official === true || item.isOfficial === true, hasConfirmedPrice: true, isVerifiedLive: true, stockStatus: 'in_stock' as const,
    } satisfies KeyStoreDeal]
  })
}
