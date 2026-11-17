import { desktopFetch } from './httpClient'
import { cleanGameTitleForKeyforsteam, comparisonUrl, currencyComparisonPage, findComparisonPage, formatDealPrice, parseComparisonPage, type GamePriceComparison, type KeyStoreDeal } from './keyforsteamData'
export { cleanGameTitleForKeyforsteam } from './keyforsteamData'
export type { KeyStoreDeal, StoreCategory, GamePriceComparison } from './keyforsteamData'
export type KeyforsteamRegion = 'de' | 'com' | 'fr' | 'es' | 'it'
export const KEYFORSTEAM_DOMAINS = {
  de: { name:'Keyforsteam', domain:'https://www.keyforsteam.de' },
  com: { name:'Allkeyshop', domain:'https://www.allkeyshop.com/blog' },
  fr: { name:'Goclecd', domain:'https://www.goclecd.fr' },
  es: { name:'Clavecd', domain:'https://www.clavecd.es' },
  it: { name:'Cdkeyit', domain:'https://www.cdkeyit.it' },
} as const

export function isGameFreeToPlay(title?: string, steamId?: number|null, isFree?: boolean, genres?: Array<{description?:string}>): boolean {
  if (isFree === true || genres?.some(genre => /^(free[ -]to[ -]play|kostenlos)$/i.test(genre.description || ''))) return true
  if (steamId && [252950,999001,730,570,1172470,1085660,1097150,578080,2356550,291550,230410,238960,1222670,588430,1407200,236390,1449850,1240440,1997040,386360,444090,440,1599340,1203220,2074920,2139460,1818750,2225070,1677740].includes(steamId)) return true
  return ['rocketleague','roblox','robloxplayer','fortnite','counterstrike2','dota2','apexlegends','valorant','leagueoflegends','overwatch2','warframe'].includes((title || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
}
export function getKeyforsteamSearchUrl(gameTitle: string, region: KeyforsteamRegion = 'de'): string {
  return `${KEYFORSTEAM_DOMAINS[region].domain}/?search=${encodeURIComponent(cleanGameTitleForKeyforsteam(gameTitle))}`
}
export function openExternalUrl(url: string): void {
  try {
    const target = new URL(url)
    if (target.protocol !== 'https:' || target.username || target.password) return
    if (window.electronAPI?.openUrl) void window.electronAPI.openUrl(target.href)
    else window.open(target.href, '_blank', 'noopener,noreferrer')
  } catch {}
}
export function openKeyforsteamGameSearch(title: string, region: KeyforsteamRegion = 'de') { openExternalUrl(getKeyforsteamSearchUrl(title, region)) }
export function openKeyforsteamHome(region: KeyforsteamRegion = 'de') { openExternalUrl(KEYFORSTEAM_DOMAINS[region].domain) }

/** Every displayed offer comes from this game's comparison page, in its actual currency. */
export async function fetchGamePriceComparison(gameTitle: string, steamId?: number|null, currency:'EUR'|'USD' = 'EUR', region:KeyforsteamRegion = 'de', language:'de'|'en' = 'de', signal?:AbortSignal): Promise<GamePriceComparison> {
  const deadline = AbortSignal.any([...(signal ? [signal] : []),AbortSignal.timeout(18_000)])
  const request = async (url:string) => {
    deadline.throwIfAborted()
    const response = await desktopFetch(url, {signal:deadline})
    if (!response.ok) throw new Error('Price source unavailable')
    return response
  }
  let title = cleanGameTitleForKeyforsteam(gameTitle), steamPrice:number|undefined
  if (steamId) {
    if (!Number.isSafeInteger(steamId) || steamId <= 0 || steamId > 0xffffffff) throw new Error('Invalid Steam game')
    // Detailed Steam metadata has a long-lived cache. Prices need a fresh request.
    const params = new URLSearchParams({appids:String(steamId),cc:currency === 'EUR' ? 'DE' : 'US',l:language === 'de' ? 'german' : 'english'})
    const raw = await (await request('https://store.steampowered.com/api/appdetails/?'+params)).json()
    const item = raw?.[String(steamId)]
    if (item?.success !== true || item.data?.steam_appid !== steamId || typeof item.data?.name !== 'string') throw new Error('Steam game could not be verified')
    title = cleanGameTitleForKeyforsteam(item.data.name)
    if (item.data.is_free === true) return {deals:[],checkedAt:Date.now(),gameName:title,currency}
    const price = item.data.price_overview
    if (price?.currency === currency && Number.isSafeInteger(price.final) && price.final > 0) steamPrice = price.final/100
  }
  if (!title) throw new Error('Game title missing')
  const config = KEYFORSTEAM_DOMAINS[region]
  const params = new URLSearchParams({action:'quicksearch',search_name:title,currency:'eur',locale:({de:'de_DE',com:'en_US',fr:'fr_FR',es:'es_ES',it:'it_IT'} as const)[region],platform:'pc',activation_country:'DE'})
  const results = await (await request(config.domain+'/wp-admin/admin-ajax.php?'+params)).json()
  let page = findComparisonPage(results, title)
  if (!page) return {deals:[],checkedAt:Date.now(),gameName:title,currency}
  let response = await request(page)
  if (response.url && !comparisonUrl(response.url)) throw new Error('Unexpected price source redirect')
  let html = await response.text()
  if (currency === 'USD') {
    const alternate = currencyComparisonPage(html, currency)
    if (!alternate) throw new Error('Requested currency unavailable')
    page = alternate
    response = await request(page)
    if (response.url && !comparisonUrl(response.url)) throw new Error('Unexpected currency source redirect')
    html = await response.text()
  }
  deadline.throwIfAborted()
  const deals = parseComparisonPage(html,title,currency,steamPrice,language).filter(deal => !steamPrice || deal.platform !== 'steam' || !deal.defaultEdition || !/^steam$/i.test(deal.storeName))
  if (steamPrice) deals.push({offerId:steamId!,storeId:'steam',storeName:'Steam',category:'store',offerType:'key',platform:'steam',platformLabel:'Steam',regionLabel:'DE',compatibleRegion:true,
    edition:'Standard',editionId:'steam',defaultEdition:true,price:steamPrice,basePrice:steamPrice,cardPrice:steamPrice,paypalPrice:steamPrice,priceFormatted:formatDealPrice(steamPrice,currency,language),
    retailPrice:steamPrice,retailPriceFormatted:formatDealPrice(steamPrice,currency,language),savingsPercent:0,dealUrl:`https://store.steampowered.com/app/${steamId}/`,isOfficial:true,hasConfirmedPrice:true,isVerifiedLive:true,stockStatus:'in_stock'})
  return {deals:deals.sort((a,b) => a.price-b.price || a.offerId-b.offerId),comparisonUrl:page,checkedAt:Date.now(),gameName:title,currency}
}
export async function fetchLiveGameDeals(title:string, steamId?:number|null, currency:'EUR'|'USD'='EUR', region:KeyforsteamRegion='de', language:'de'|'en'='de', signal?:AbortSignal):Promise<KeyStoreDeal[]> {
  return (await fetchGamePriceComparison(title,steamId,currency,region,language,signal)).deals
}
export function getCheapestKeyDeal(deals:KeyStoreDeal[], _officialPrice?:number):KeyStoreDeal|null {
  return deals.filter(deal => deal.storeId !== 'steam' && !/^steam$/i.test(deal.storeName) && deal.offerType === 'key' && deal.platform === 'steam' && deal.defaultEdition && deal.compatibleRegion && deal.hasConfirmedPrice && deal.isVerifiedLive && deal.stockStatus === 'in_stock' && deal.price>0)
    .sort((a,b) => a.price-b.price)[0] || null
}
export type CheapestKeySummary = KeyStoreDeal
