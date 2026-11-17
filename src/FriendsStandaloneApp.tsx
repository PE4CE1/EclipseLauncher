import React, { useEffect } from 'react'
import { FriendsWindow } from './components/friends/FriendsWindow'
import { useUIStore } from './store/uiStore'
import { initFriendsWindowSocial } from './services/socialService'
import { useGameStore } from './store/gameStore'

export const FriendsStandaloneApp: React.FC = () => {
  const { setIsFriendsOpen } = useUIStore()

  // Always keep it open in the standalone window
  useEffect(() => {
    setIsFriendsOpen(true)
    
    // Add global transparent background so window shows correctly
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'
  }, [setIsFriendsOpen])

  useEffect(() => {
    const previous = useGameStore.persist.getOptions().storage
    // A secondary renderer must not overwrite newer launcher settings with its cached snapshot.
    useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
    const stop = initFriendsWindowSocial()
    return () => { stop(); useGameStore.persist.setOptions({ storage: previous }) }
  }, [])

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent relative">
      <FriendsWindow isStandalone={true} />
    </div>
  )
}
