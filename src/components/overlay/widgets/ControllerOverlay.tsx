import { translate } from '../../../i18n/translate'
import React, { useMemo } from 'react'

export type ControllerSkinId = 'ps5_white' | 'ps5_black' | 'ps4_white' | 'ps4_black' | 'xbox_one'

interface ControllerOverlayProps {
  url?: string
  skin?: ControllerSkinId
  scale?: number
  isEditMode?: boolean
  language?: string
}

export const ControllerOverlay = React.memo(function ControllerOverlay({
  url,
  skin,
  scale = 80,
  isEditMode = false,
  language = 'de',
}: ControllerOverlayProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const latestState = React.useRef<{ buttons: any[]; axes: number[] }>({ buttons: [], axes: [0, 0, 0, 0] })
  const finalScale = Number.isFinite(scale) ? Math.max(.3, Math.min(2, scale / 100)) : .8

  // Determine active skin
  const resolvedSkin: ControllerSkinId = useMemo(() => {
    if (skin) return skin
    if (url?.includes('ps5_black') || url?.includes('philipbry')) return 'ps5_black'
    if (url?.includes('FPS5') || url?.includes('PS5') || url?.includes('ps5_white')) return 'ps5_white'
    if (url?.includes('s=8') || url?.includes('ps4_white')) return 'ps4_white'
    if (url?.includes('s=5') || url?.includes('ps4_black')) return 'ps4_black'
    if (url?.includes('s=1') || url?.includes('xbox')) return 'xbox_one'
    return 'ps5_white'
  }, [skin, url])

  // Dimensions
  const BASE_WIDTH = 820
  const BASE_HEIGHT = 680
  const containerWidth = Math.round(BASE_WIDTH * (finalScale * 0.52))
  const containerHeight = Math.round(BASE_HEIGHT * (finalScale * 0.52))

  const assetRoot = typeof window !== 'undefined' && window.electronAPI ? 'eclipse-asset://bundle/' : './'
  const controllerUrl = `${assetRoot}controller-skins/controller.html?skin=${encodeURIComponent(resolvedSkin)}`

  // Dual pipeline: Listen to native XInput background service (IPC) AND HTML5 Gamepad API fallback
  React.useEffect(() => {
    let animId = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const api = (window as any).electronAPI
    let lastNativeTime = 0
    let lastSignature = ''
    let browserActive = false
    const send = (buttons: any[], axes: number[]) => {
      const signature = JSON.stringify([buttons, axes])
      if (signature === lastSignature) return
      lastSignature = signature
      latestState.current = { buttons, axes }
      iframeRef.current?.contentWindow?.postMessage({ type: 'gamepad-state', buttons, axes }, '*')
    }

    const cleanupNative = api?.onGamepadState?.((state: any) => {
      if (!state) return
      browserActive = false
      lastNativeTime = Date.now()
      send(state.connected ? state.buttons || [] : [], state.connected ? state.axes || [0, 0, 0, 0] : [0, 0, 0, 0])
    })

    const pollHtml5 = () => {
      // If native XInput is not providing active controller state, poll HTML5 Gamepad API
      // Native input has a heartbeat. Allow brief scheduling delays rather than
      // alternating with a stale browser snapshot while a button is held.
      if (Date.now() - lastNativeTime < 1500) {
        timer = setTimeout(pollHtml5, 250)
        return
      }
      if (iframeRef.current?.contentWindow && navigator.getGamepads) {
        const gamepads = navigator.getGamepads()
        let bestGp: Gamepad | null = null
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i]
          if (gp?.connected) {
            bestGp = gp
            break
          }
        }

        if (bestGp) {
          browserActive = true
          send(bestGp.buttons.map(b => ({ pressed: b.pressed, value: b.value })), Array.from(bestGp.axes))
          animId = requestAnimationFrame(pollHtml5)
          return
        }
      }
      if (browserActive) { browserActive = false; send([], [0, 0, 0, 0]) }
      // Disconnected controllers do not need a frame-by-frame fallback poll.
      timer = setTimeout(pollHtml5, 500)
    }
    const wake = () => { clearTimeout(timer); cancelAnimationFrame(animId); pollHtml5() }
    pollHtml5()
    window.addEventListener('gamepadconnected', wake)
    window.addEventListener('gamepaddisconnected', wake)

    return () => {
      if (typeof cleanupNative === 'function') cleanupNative()
      cancelAnimationFrame(animId)
      clearTimeout(timer)
      window.removeEventListener('gamepadconnected', wake)
      window.removeEventListener('gamepaddisconnected', wake)
    }
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: containerWidth,
        height: containerHeight,
        pointerEvents: isEditMode ? 'auto' : 'none',
        userSelect: 'none',
        contain: 'paint layout',
        overflow: 'visible',
      }}
    >
      <iframe
        ref={iframeRef}
        key={resolvedSkin}
        src={controllerUrl}
        onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: 'gamepad-state', ...latestState.current }, '*')}
        sandbox="allow-scripts"
        title={translate(language, 'uiControllerOverlay')}
        allow="gamepad *; autoplay *"
        scrolling="no"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${finalScale * 0.52})`,
          transformOrigin: 'top left',
          border: 'none',
          backgroundColor: 'transparent',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      />
      {isEditMode && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 6,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          🎮 {language === 'de' ? 'Controller-Anzeige' : 'Controller overlay'} ({resolvedSkin})
        </div>
      )}
    </div>
  )
})
