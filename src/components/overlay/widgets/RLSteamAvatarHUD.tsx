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
    if (isEditMode) return
    let keyboardPressed = false, controllerPressed = false, nativeConnected = false
    let timer: ReturnType<typeof setTimeout>
    const key = controllerKey.toLowerCase()
    const index = key === 'start' ? 9 : /^button \d+$/.test(key) ? Math.min(31, Number(key.slice(7))) : 8
    const publish = () => setIsVisible(keyboardPressed || controllerPressed)
    const pressed = (buttons: any[] = []) => Boolean(buttons[index]?.pressed || buttons[index]?.value > .5)
    const unsubToggle = window.electronAPI?.onRLScoreboardToggle?.((open: boolean) => {
      keyboardPressed = open === true
      publish()
    })
    const unsubController = window.electronAPI?.onGamepadState?.((state: any) => {
      nativeConnected = state?.connected === true
      controllerPressed = nativeConnected && pressed(state.buttons)
      publish()
    })
    const pollFallback = () => {
      if (!nativeConnected) {
        const gamepad = Array.from(navigator.getGamepads?.() || []).find(pad => pad?.connected)
        controllerPressed = Boolean(gamepad && pressed(gamepad.buttons as any[]))
        publish()
        timer = setTimeout(pollFallback, gamepad ? 50 : 500)
      } else timer = setTimeout(pollFallback, 500)
    }
    pollFallback()
    return () => {
      unsubToggle?.()
      unsubController?.()
      clearTimeout(timer)
    }
  }, [isEditMode, controllerKey])

  useEffect(() => {
    let disposed = false
    setAvatarUrl(null)
    if (steamUrl) {
      (window.electronAPI as any)?.invoke?.('rl:fetch-steam-avatar', steamUrl).then((url: string | null) => {
        if (!disposed && url) setAvatarUrl(url)
      }).catch(() => {})
    }
    return () => { disposed = true }
  }, [steamUrl])

  if (!avatarUrl) return null

  // In Edit Mode, always show
  if (!isVisible && !isEditMode) return null

  // Default Rocket League avatar size is roughly 44x44 or 48x48 depending on resolution
  // We use 56px and scale it based on UI scale setting
  const scaleMult = Number.isFinite(scale) ? Math.max(.3, Math.min(2, scale / 100)) : .85

  return (
    <div style={{
      width: 56 * scaleMult,
      height: 56 * scaleMult,
      pointerEvents: 'none',
      userSelect: 'none',
      border: `${2 * scaleMult}px solid white`,
      borderRadius: 2 * scaleMult,
      overflow: 'hidden',
      boxShadow: '0 0 10px rgba(0,0,0,0.5)'
    }}>
      <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Steam Avatar" />
    </div>
  )
}
