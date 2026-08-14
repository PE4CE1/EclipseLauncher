import { useState, useEffect } from 'react'

export function RLSteamAvatarHUD({ 
  steamUrl, 
  scale = 85, 
  controllerKey = 'Button 8',
  isEditMode = false 
}: { 
  steamUrl: string, 
  scale?: number, 
  controllerKey?: string,
  isEditMode?: boolean 
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Toggle from InputService (Keyboard & Controller)
    const handleScoreboardToggle = (open: boolean) => {
      if (!isEditMode) {
        setIsVisible(open)
      }
    }

    const unsubToggle = (window.electronAPI as any)?.on?.('rl:scoreboard-toggle', handleScoreboardToggle)


    // Actually, handling gamepad perfectly alongside keyboard needs a bit of care.
    // Let's implement robust polling:
    let reqId: number
    let lastGpPressed = false
    const robustPoll = () => {
      if (isEditMode) {
        reqId = requestAnimationFrame(robustPoll)
        return
      }
      
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
      let isPressed = false
      for (const gp of gamepads) {
        if (!gp) continue
        let btnIndex = 8
        const keyLower = controllerKey.toLowerCase()
        if (keyLower === 'select') btnIndex = 8
        else if (keyLower === 'start') btnIndex = 9
        else if (keyLower.startsWith('button ')) {
          btnIndex = parseInt(keyLower.replace('button ', ''))
        }
        
        if (gp.buttons[btnIndex]?.pressed) {
          isPressed = true
          break
        }
      }
      
      if (isPressed !== lastGpPressed) {
        lastGpPressed = isPressed
        setIsVisible(isPressed)
      }
      
      reqId = requestAnimationFrame(robustPoll)
    }
    
    reqId = requestAnimationFrame(robustPoll)

    return () => {
      unsubToggle?.()
      cancelAnimationFrame(reqId)
    }
  }, [isEditMode])

  useEffect(() => {
    if (steamUrl) {
      (window.electronAPI as any)?.invoke?.('rl:fetch-steam-avatar', steamUrl).then((url: string | null) => {
        if (url) setAvatarUrl(url)
      })
    }
  }, [steamUrl])

  if (!avatarUrl) return null

  // In Edit Mode, always show
  if (!isVisible && !isEditMode) return null

  // Default Rocket League avatar size is roughly 44x44 or 48x48 depending on resolution
  // We use 56px and scale it based on UI scale setting
  const scaleMult = (scale || 100) / 100

  return (
    <div style={{
      width: 56 * scaleMult,
      height: 56 * scaleMult,
      pointerEvents: 'none',
      userSelect: 'none',
      opacity: isVisible || isEditMode ? 1 : 0,
      transition: 'opacity 0.1s',
      border: `${2 * scaleMult}px solid white`,
      borderRadius: 2 * scaleMult,
      overflow: 'hidden',
      boxShadow: '0 0 10px rgba(0,0,0,0.5)'
    }}>
      <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Steam Avatar" />
    </div>
  )
}
