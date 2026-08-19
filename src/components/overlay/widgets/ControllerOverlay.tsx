import React from 'react'

interface ControllerOverlayProps {
  url?: string
  scale?: number
  isEditMode?: boolean
}

export const ControllerOverlay = React.memo(function ControllerOverlay({
  url,
  scale = 80,
  isEditMode = false,
}: ControllerOverlayProps) {
  const finalScale = (scale || 80) / 100
  const targetUrl = url && url.trim().length > 0 ? url.trim() : 'https://gamepadviewer.com/?p=1&s=8'

  // Standard GamepadViewer base dimensions are 800x600
  const BASE_WIDTH = 800
  const BASE_HEIGHT = 560
  const containerWidth = Math.round(BASE_WIDTH * (finalScale * 0.55))
  const containerHeight = Math.round(BASE_HEIGHT * (finalScale * 0.55))

  return (
    <div
      style={{
        position: 'relative',
        width: containerWidth,
        height: containerHeight,
        pointerEvents: isEditMode ? 'auto' : 'none',
        userSelect: 'none',
        contain: 'paint layout',
        overflow: 'hidden',
      }}
    >
      <iframe
        src={targetUrl}
        title="Gamepad Controller Website Overlay"
        allow="gamepad *; autoplay *"
        scrolling="no"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${finalScale * 0.55})`,
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
          🎮 Controller Overlay
        </div>
      )}
    </div>
  )
})
