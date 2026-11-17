import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '../../store/uiStore'
import { isDiscoveryRefreshDue } from '../../services/discoveryRefresh'

/** Refresh in place while Home is in use, with no requests while tabbed out. */
export function useHomeAutoRefresh() {
  const client = useQueryClient()
  const home = useUIStore(state => state.activeView === 'home')
  const covered = useUIStore(state => state.isGameModalOpen)
  useEffect(() => {
    if (!home || covered) return
    let focused = document.hasFocus(), timer:ReturnType<typeof setInterval>|undefined
    const refresh = () => {
      if (!focused || document.hidden || navigator.onLine === false) return
      void client.refetchQueries({type:'active',predicate:query => isDiscoveryRefreshDue(query.queryKey,query.state.dataUpdatedAt,query.state.errorUpdatedAt,query.state.fetchStatus!=='idle')},{cancelRefetch:false})
    }
    const resume = () => {
      clearInterval(timer)
      if (!focused || document.hidden || navigator.onLine === false) return
      refresh()
      timer=setInterval(refresh,60_000)
    }
    const focus = () => { focused=true;resume() }
    const blur = () => { focused=false;clearInterval(timer) }
    const visibility = () => { if (document.hidden) clearInterval(timer);else {focused=document.hasFocus();resume()} }
    resume()
    window.addEventListener('focus',focus);window.addEventListener('blur',blur)
    window.addEventListener('online',resume);window.addEventListener('offline',resume)
    document.addEventListener('visibilitychange',visibility)
    return () => {clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('blur',blur);window.removeEventListener('online',resume);window.removeEventListener('offline',resume);document.removeEventListener('visibilitychange',visibility)}
  },[client,home,covered])
}
