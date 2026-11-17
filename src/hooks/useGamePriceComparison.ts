import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchGamePriceComparison, type KeyforsteamRegion } from '../services/keyforsteamService'

export function useGamePriceComparison(title:string, steamId:number|null|undefined, currency:'EUR'|'USD', region:KeyforsteamRegion, language:'de'|'en', enabled:boolean, live = false) {
  const [focused,setFocused] = useState(() => !document.hidden && document.hasFocus())
  useEffect(() => {
    const focus = () => setFocused(!document.hidden)
    const blur = () => setFocused(false)
    const visibility = () => setFocused(!document.hidden && document.hasFocus())
    window.addEventListener('focus',focus);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility)
    return () => { window.removeEventListener('focus',focus);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility) }
  },[])
  const query = useQuery({
    queryKey:['keyforsteam','comparison','v2',steamId || title,currency,region,language],
    queryFn:({signal}) => fetchGamePriceComparison(title,steamId,currency,region,language,signal),
    enabled:enabled && !!title, staleTime:2*60_000, gcTime:30*60_000, retry:1,
    refetchOnWindowFocus:true, refetchInterval:live && enabled && focused ? 5*60_000 : false, refetchIntervalInBackground:false,
  })
  useEffect(() => {
    if (focused && enabled && query.dataUpdatedAt && Date.now()-Math.max(query.dataUpdatedAt,query.errorUpdatedAt)>=2*60_000) void query.refetch()
  },[focused,enabled])
  return query
}
