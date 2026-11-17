import { Select } from './Select'
import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Key, ExternalLink, RefreshCw, Search, Copy, Check, ChevronDown } from 'lucide-react'
import { useGamePriceComparison } from '../../hooks/useGamePriceComparison'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { openExternalUrl, KEYFORSTEAM_DOMAINS, type KeyforsteamRegion, type KeyStoreDeal } from '../../services/keyforsteamService'
import { formatDealPrice } from '../../services/keyforsteamData'
import { copyText } from '../../services/clipboard'
import { useTranslation } from '../../hooks/useTranslation'
import './game-deals.css'

interface GameDealsModalProps { isOpen:boolean; onClose:()=>void; gameName:string; steamId?:number|null; currency?:'EUR'|'USD'; region?:KeyforsteamRegion }
type FeeMode = 'card'|'paypal'|'base'
const offerPrice = (deal:KeyStoreDeal, mode:FeeMode) => (mode === 'card' ? deal.cardPrice : mode === 'paypal' ? deal.paypalPrice : deal.basePrice) || deal.basePrice

export function GameDealsModal(props:GameDealsModalProps) {
  return props.isOpen ? <GameDealsDialog key={`${props.steamId || props.gameName}:${props.currency}`} {...props} /> : null
}
function GameDealsDialog({onClose,gameName,steamId,currency='EUR',region='de'}:GameDealsModalProps) {
  const {t,language,locale} = useTranslation()
  const [activeCurrency,setCurrency] = useState(currency)
  const [search,setSearch] = useState('')
  const [type,setType] = useState<'key'|'account'|'all'>('key')
  const [platform,setPlatform] = useState(steamId ? 'steam' : 'all')
  const [edition,setEdition] = useState('default')
  const [fees,setFees] = useState<FeeMode>('card')
  const [compatible,setCompatible] = useState(true)
  const [limit,setLimit] = useState(40)
  const [copied,setCopied] = useState<string|null>(null)
  const [copyError,setCopyError] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel,onClose)
  useEffect(() => () => clearTimeout(copyTimer.current),[])
  const query = useGamePriceComparison(gameName,steamId,activeCurrency,region,language,true,true)
  const deals = query.data?.deals || []
  const platforms = [...new Map(deals.map(deal => [deal.platform,deal.platformLabel])).entries()]
  const editions = [...new Set(deals.filter(deal => deal.storeId !== 'steam').map(deal => deal.edition))]
  const filtered = useMemo(() => deals.filter(deal => (type === 'all' || deal.offerType === type)
    && (platform === 'all' || deal.platform === platform)
    && (edition === 'all' || (edition === 'default' ? deal.defaultEdition : deal.edition === edition))
    && (!compatible || deal.compatibleRegion)
    && (!search.trim() || `${deal.storeName} ${deal.voucherCode || ''}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))))
    .sort((a,b) => offerPrice(a,fees)-offerPrice(b,fees) || a.storeName.localeCompare(b.storeName)),[deals,type,platform,edition,compatible,search,fees,locale])
  const lowest = filtered[0]
  const reset = () => {setType('key');setPlatform('all');setEdition('all');setCompatible(true);setSearch('');setLimit(40)}
  const copy = async (code:string) => {
    try { await copyText(code);setCopied(code);setCopyError(false);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(null),1800) }
    catch {setCopyError(true)}
  }
  return createPortal(<div className="game-deals-shade" data-deals-backdrop onClick={onClose}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="game-deals-title" data-game-deals className="game-deals-dialog" onClick={event => event.stopPropagation()}>
      <header className="deals-header">
        <div className="deals-brand"><span><Key size={19}/></span><div><p>Keyforsteam <i> / </i>{t('dealsTitle')}</p><h2 id="game-deals-title">{query.data?.gameName || gameName}</h2></div></div>
        <div className="deals-header-actions"><div className="deals-currency" aria-label={t('dealsCurrency')}>{(['EUR','USD'] as const).map(value => <button key={value} aria-pressed={activeCurrency === value} onClick={()=>setCurrency(value)}>{value === 'EUR' ? '€' : '$'}</button>)}</div>
          <button data-dialog-close data-deals-close className="deals-close" onClick={onClose} aria-label={t('close')}><X size={19}/></button></div>
      </header>
      <div className="deals-summary"><div><span>{t('dealsLowest')}</span><strong>{lowest ? formatDealPrice(offerPrice(lowest,fees),activeCurrency,language) : '—'}</strong>{lowest && <small>{lowest.storeName} · {lowest.platformLabel}</small>}</div>
        <div className="deals-status"><span>{query.isFetching && !query.isPending ? t('dealsRefreshing') : query.data ? t('dealsChecked',{time:new Date(query.data.checkedAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}) : t('dealsLoading')}</span><button data-deals-refresh onClick={()=>void query.refetch()} disabled={query.isFetching} aria-label={t('homeRetry')}><RefreshCw size={14}/></button></div></div>
      <div className="deals-tools"><label className="deals-search"><Search size={14}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder={t('dealsSearch')} aria-label={t('dealsSearch')}/></label>
        <label><span>{t('dealsPlatform')}</span><Select data-deals-platform value={platform} onChange={event=>setPlatform(event.target.value)}><option value="all">{t('dealsPlatforms')}</option>{platforms.map(([id,label])=><option key={id} value={id}>{label}</option>)}{!platforms.some(([id])=>id==='steam')&&platform==='steam'&&<option value="steam">Steam</option>}</Select></label>
        <label><span>{t('dealsEdition')}</span><Select data-deals-edition value={edition} onChange={event=>setEdition(event.target.value)}><option value="default">{t('dealsDefaultEdition')}</option><option value="all">{t('dealsEditions')}</option>{editions.map(name=><option key={name} value={name}>{name}</option>)}</Select></label>
        <label><span>{t('dealsFees')}</span><Select data-deals-fees value={fees} onChange={event=>setFees(event.target.value as FeeMode)}><option value="card">{t('dealsCard')}</option><option value="paypal">{t('dealsPaypal')}</option><option value="base">{t('dealsBeforeFees')}</option></Select></label>
      </div>
      <div className="deals-filter-row"><nav aria-label={t('dealsAll')}>{(['key','all','account'] as const).map(value=><button key={value} data-deals-type={value} aria-pressed={type===value} onClick={()=>{setType(value);setLimit(40)}}>{t(value==='key'?'dealsKeys':value==='account'?'dealsAccounts':'dealsAll')}<span>{deals.filter(deal=>(value==='all'||deal.offerType===value)&&(platform==='all'||deal.platform===platform)&&(edition==='all'||(edition==='default'?deal.defaultEdition:deal.edition===edition))&&(!compatible||deal.compatibleRegion)).length}</span></button>)}</nav>
        <label><input type="checkbox" checked={compatible} onChange={event=>setCompatible(event.target.checked)}/>{t('dealsRegion')}</label></div>
      <div className="deals-list" data-deals-list aria-busy={query.isFetching}>
        <div className="deals-list-heading" aria-hidden="true"><span>{t('dealsStore')}</span><span>{t('dealsActivation')}</span><span>{t('dealsPrice')}</span><span /></div>
        {query.isPending ? <div className="deals-empty" role="status"><RefreshCw className="deals-loading" size={22}/><p>{t('dealsLoading')}</p></div>
          : query.isError && !query.data ? <div className="deals-empty" role="alert"><p>{t('dealsFailed')}</p><button onClick={()=>void query.refetch()}>{t('homeRetry')}</button></div>
          : !filtered.length ? <div className="deals-empty"><Key size={25}/><p>{t('dealsEmpty')}</p><button onClick={reset}>{t('dealsReset')}</button></div>
          : <>{filtered.slice(0,limit).map((deal,index)=>{
            const price=offerPrice(deal,fees),unknownFees=fees!=='base'&&(fees==='card'?!deal.cardPrice:!deal.paypalPrice)
            const savings=deal.retailPrice>price?Math.round((deal.retailPrice-price)/deal.retailPrice*100):0
            return <article key={deal.dealUrl} data-deal-id={deal.offerId} data-deal-store={deal.storeId} className="deals-offer" data-lowest={index===0&&deal.offerType==='key'||undefined}>
              <div className="deal-store"><span className="deal-store-mark">{deal.storeName.slice(0,1)}</span><div><strong>{deal.storeName}{deal.isOfficial&&<small>{t('dealsOfficial')}</small>}</strong><span>{deal.edition} · {deal.regionLabel}</span></div></div>
              <div className="deal-kind"><span data-offer-kind={deal.offerType}>{deal.platformLabel} · {t(deal.offerType==='account'?'dealsAccounts':deal.offerType==='gift'?'dealsGift':'dealsKeys')}</span>{deal.voucherCode&&<button title={t('dealsCouponIncluded')} aria-label={t('dealsCoupon',{code:deal.voucherCode})} onClick={()=>void copy(deal.voucherCode!)}>{copied===deal.voucherCode?<Check size={11}/>:<Copy size={11}/>}<code>{deal.voucherCode}</code>{deal.voucherDiscount&&<span>{deal.voucherDiscount}</span>}</button>}</div>
              <div className="deal-price"><strong data-deal-price>{formatDealPrice(price,activeCurrency,language)}</strong>{savings>0&&<span>−{savings}% {t('dealsVsSteam')}</span>}{unknownFees&&<small>{t('dealsUnknownFees')}</small>}</div>
              <button className="deal-open" data-deal-open onClick={()=>openExternalUrl(deal.dealUrl)}>{t('dealsOffer')}<ExternalLink size={12}/></button>
            </article>
          })}{filtered.length>limit&&<button className="deals-more" onClick={()=>setLimit(value=>value+40)}>{t('dealsMore')}<ChevronDown size={13}/></button>}</>}
      </div>
      {query.isError&&query.data&&<p className="deals-inline-error" role="status">{t('dealsFailed')}</p>}
      {copied&&<span className="sr-only" role="status">{t('dealsCopied')}</span>}{copyError&&<span className="deals-inline-error" role="alert">{t('dealsCopyFailed')}</span>}
      <footer className="deals-footer"><div><span>{t('dealsCount',{count:filtered.length})}</span><p>{t('dealsNote')}</p></div><button onClick={()=>openExternalUrl(query.data?.comparisonUrl || KEYFORSTEAM_DOMAINS[region].domain)}>{t('dealsSource')}<ExternalLink size={12}/></button></footer>
    </div>
  </div>,document.body)
}
