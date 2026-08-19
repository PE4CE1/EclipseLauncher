import React from 'react'

interface ControllerOverlayProps {
  url?: string
  scale?: number
  isEditMode?: boolean
}

export const ControllerOverlay = React.memo(function ControllerOverlay({
  url = 'https://gamepadviewer.com/?p=1&s=3',
  scale = 80,
  isEditMode = false,
}: ControllerOverlayProps) {
  const finalScale = (scale || 80) / 100
  const finalUrl = url && url.trim().length > 0 ? url.trim() : 'https://gamepadviewer.com/?p=1&s=3'

  return (
    <div
      style={{
        position: 'relative',
        width: 380,
        height: 270,
        transform: `scale(${finalScale})`,
        transformOrigin: 'top left',
        pointerEvents: isEditMode ? 'auto' : 'none',
        userSelect: 'none',
        contain: 'paint layout',
      }}
    >
      <iframe
        src={finalUrl}
        title="Gamepad Controller Overlay"
        allow="gamepad *"
        scrolling="no"
        style={{
          width: '100%',
          height: '100%',
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
            top: 4,
            left: 4,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(0, 0, 0, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          🎮 Gamepad Overlay
        </div>
      )}
    </div>
  )
})
