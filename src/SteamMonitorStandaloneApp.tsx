import React, { useEffect } from 'react'
import { SteamTrafficOverlay } from './components/shared/SteamTrafficOverlay'
import { useUIStore } from './store/uiStore'

export const SteamMonitorStandaloneApp: React.FC = () => {
  const { setIsSteamMonitorOpen } = useUIStore()

  useEffect(() => {
    setIsSteamMonitorOpen(true)
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'
  }, [setIsSteamMonitorOpen])

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent relative p-2 select-none">
      <SteamTrafficOverlay isStandalone={true} />
    </div>
  )
}
