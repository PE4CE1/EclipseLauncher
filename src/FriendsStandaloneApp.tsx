import React, { useEffect } from 'react'
import { FriendsWindow } from './components/friends/FriendsWindow'
import { useUIStore } from './store/uiStore'

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

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent relative">
      <FriendsWindow isStandalone={true} />
    </div>
  )
}
