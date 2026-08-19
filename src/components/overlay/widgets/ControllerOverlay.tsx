import React, { useEffect, useState, useRef } from 'react'

interface ControllerOverlayProps {
  url?: string
  scale?: number
  isEditMode?: boolean
}

export const ControllerOverlay = React.memo(function ControllerOverlay({
  url = '',
  scale = 80,
  isEditMode = false,
}: ControllerOverlayProps) {
  const finalScale = (scale || 80) / 100
  const isCustomUrl = url && url.startsWith('http') && !url.includes('gamepadviewer.com/?p=1&s=3')

  // Live Gamepad input state
  const [padState, setPadState] = useState({
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    l2: 0,
    r2: 0,
    l1: false,
    r1: false,
    dpadUp: false,
    dpadDown: false,
    dpadLeft: false,
    dpadRight: false,
    cross: false,
    circle: false,
    square: false,
    triangle: false,
    share: false,
    options: false,
    ps: false,
    l3: false,
    r3: false,
  })

  // Smooth direct DOM refs for 120+ FPS zero-overhead updates
  const leftStickRef = useRef<SVGGElement>(null)
  const rightStickRef = useRef<SVGGElement>(null)
  const l2TriggerRef = useRef<SVGGElement>(null)
  const r2TriggerRef = useRef<SVGGElement>(null)

  useEffect(() => {
    let animId: number

    const applyDeadzone = (v: number) => (Math.abs(v) < 0.1 ? 0 : v)

    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
      let gp: Gamepad | null = null

      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          gp = gamepads[i]
          break
        }
      }

      if (gp) {
        const lx = applyDeadzone(gp.axes[0] || 0)
        const ly = applyDeadzone(gp.axes[1] || 0)
        const rx = applyDeadzone(gp.axes[2] || 0)
        const ry = applyDeadzone(gp.axes[3] || 0)

        const b = gp.buttons
        const getVal = (idx: number) => (b[idx]?.value !== undefined ? b[idx].value : b[idx]?.pressed ? 1 : 0)
        const isPressed = (idx: number) => Boolean(b[idx]?.pressed || (b[idx]?.value && b[idx].value > 0.25))

        const l2 = getVal(6)
        const r2 = getVal(7)
        const l1 = isPressed(4)
        const r1 = isPressed(5)

        const cross = isPressed(0)
        const circle = isPressed(1)
        const square = isPressed(2)
        const triangle = isPressed(3)

        const share = isPressed(8)
        const options = isPressed(9)
        const l3 = isPressed(10)
        const r3 = isPressed(11)

        const dpadUp = isPressed(12)
        const dpadDown = isPressed(13)
        const dpadLeft = isPressed(14)
        const dpadRight = isPressed(15)
        const ps = isPressed(16)

        // Fast path direct transform
        if (leftStickRef.current) {
          leftStickRef.current.setAttribute('transform', `translate(${lx * 15}, ${ly * 15})`)
        }
        if (rightStickRef.current) {
          rightStickRef.current.setAttribute('transform', `translate(${rx * 15}, ${ry * 15})`)
        }
        if (l2TriggerRef.current) {
          l2TriggerRef.current.setAttribute('transform', `translate(0, ${l2 * 8})`)
        }
        if (r2TriggerRef.current) {
          r2TriggerRef.current.setAttribute('transform', `translate(0, ${r2 * 8})`)
        }

        setPadState({
          lx, ly, rx, ry,
          l2, r2, l1, r1,
          dpadUp, dpadDown, dpadLeft, dpadRight,
          cross, circle, square, triangle,
          share, options, ps, l3, r3
        })
      }

      animId = requestAnimationFrame(poll)
    }

    animId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(animId)
  }, [])

  // If user explicitly configured an external custom iframe URL
  if (isCustomUrl) {
    return (
      <div
        style={{
          position: 'relative',
          width: 800,
          height: 600,
          transform: `scale(${finalScale * 0.5})`,
          transformOrigin: 'top left',
          pointerEvents: isEditMode ? 'auto' : 'none',
          userSelect: 'none',
          contain: 'paint layout',
        }}
      >
        <iframe
          src={url}
          title="Gamepad Controller Overlay"
          allow="gamepad *"
          scrolling="no"
          style={{
            width: 800,
            height: 600,
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
              top: 10,
              left: 10,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            🎮 Custom Web Gamepad
          </div>
        )}
      </div>
    )
  }

  // Native 100% Vector PS4 Controller (Matching user screenshot pixel-perfect, 0ms lag, no red screen)
  return (
    <div
      style={{
        position: 'relative',
        width: 440,
        height: 320,
        transform: `scale(${finalScale})`,
        transformOrigin: 'top left',
        pointerEvents: isEditMode ? 'auto' : 'none',
        userSelect: 'none',
        contain: 'paint layout style',
        filter: 'drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55))',
      }}
    >
      <svg
        viewBox="0 0 500 360"
        width="100%"
        height="100%"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="ps4BodyGrad" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f3f4f6" />
            <stop offset="100%" stopColor="#e2e4e9" />
          </radialGradient>
          <linearGradient id="ps4RedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e03131" />
            <stop offset="100%" stopColor="#b02525" />
          </linearGradient>
          <linearGradient id="ps4CyanGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38d9a9" />
            <stop offset="100%" stopColor="#12b886" />
          </linearGradient>
          <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ─── L2 Trigger (Left Top) ─── */}
        <g ref={l2TriggerRef}>
          <path
            d="M 125 72 C 120 40, 135 15, 155 15 C 175 15, 190 40, 185 72 Z"
            fill={padState.l2 > 0.1 ? '#ff6b6b' : '#c92a2a'}
            stroke="#a61e1e"
            strokeWidth="1.5"
            filter={padState.l2 > 0.1 ? 'url(#glowEffect)' : undefined}
          />
          <text x="155" y="48" textAnchor="middle" fill="#ffffff" opacity={0.65} fontSize="12" fontWeight="800" fontFamily="sans-serif">
            L2
          </text>
        </g>

        {/* ─── R2 Trigger (Right Top - Teal/Cyan as in user skin) ─── */}
        <g ref={r2TriggerRef}>
          <path
            d="M 315 72 C 310 40, 325 15, 345 15 C 365 15, 380 40, 375 72 Z"
            fill={padState.r2 > 0.1 ? '#63e6be' : '#20c997'}
            stroke="#0ca678"
            strokeWidth="1.5"
            filter={padState.r2 > 0.1 ? 'url(#glowEffect)' : undefined}
          />
          <text x="345" y="48" textAnchor="middle" fill="#ffffff" opacity={0.7} fontSize="12" fontWeight="800" fontFamily="sans-serif">
            R2
          </text>
        </g>

        {/* ─── L1 / R1 Bumpers (Red) ─── */}
        <path
          d="M 120 74 C 125 65, 185 65, 190 74 C 185 82, 125 82, 120 74 Z"
          fill={padState.l1 ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1.5"
        />
        <path
          d="M 310 74 C 315 65, 375 65, 380 74 C 375 82, 315 82, 310 74 Z"
          fill={padState.r1 ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1.5"
        />

        {/* ─── Main Controller Chassis (White DualShock 4 Body) ─── */}
        <path
          d="M 140 76 
             C 175 74, 325 74, 360 76 
             C 400 78, 435 125, 445 200 
             C 455 270, 435 340, 395 340 
             C 365 340, 345 285, 335 240 
             C 320 230, 180 230, 165 240 
             C 155 285, 135 340, 105 340 
             C 65 340, 45 270, 55 200 
             C 65 125, 100 78, 140 76 Z"
          fill="url(#ps4BodyGrad)"
          stroke="#cbd5e1"
          strokeWidth="2.5"
        />

        {/* ─── Red Bottom Handle Grips ─── */}
        <path
          d="M 57 260 C 50 290, 68 340, 105 340 C 135 340, 150 300, 156 270 C 120 280, 80 270, 57 260 Z"
          fill="url(#ps4RedGrad)"
          stroke="#a61e1e"
          strokeWidth="1"
        />
        <path
          d="M 443 260 C 450 290, 432 340, 395 340 C 365 340, 350 300, 344 270 C 380 280, 420 270, 443 260 Z"
          fill="url(#ps4RedGrad)"
          stroke="#a61e1e"
          strokeWidth="1"
        />

        {/* ─── Red Touchpad (Center Top) ─── */}
        <rect
          x="170"
          y="78"
          width="160"
          height="88"
          rx="6"
          fill="url(#ps4RedGrad)"
          stroke="#8f1616"
          strokeWidth="1.5"
        />

        {/* ─── Share Button (Left) ─── */}
        <text x="156" y="90" textAnchor="middle" fill="#000000" opacity={0.6} fontSize="9" fontWeight="800" fontFamily="sans-serif">
          SHARE
        </text>
        <rect
          x="151"
          y="96"
          width="10"
          height="24"
          rx="5"
          fill={padState.share ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1"
        />

        {/* ─── Options Button (Right) ─── */}
        <text x="344" y="90" textAnchor="middle" fill="#000000" opacity={0.6} fontSize="9" fontWeight="800" fontFamily="sans-serif">
          OPTIONS
        </text>
        <rect
          x="339"
          y="96"
          width="10"
          height="24"
          rx="5"
          fill={padState.options ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1"
        />

        {/* ─── D-Pad Circular Black Base (Left) ─── */}
        <circle cx="140" cy="180" r="44" fill="#18181b" stroke="#27272a" strokeWidth="1.5" />

        {/* D-Pad Buttons in Red */}
        {/* Up */}
        <path
          d="M 131 144 C 131 140, 149 140, 149 144 L 149 162 L 131 162 Z"
          fill={padState.dpadUp ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1"
        />
        {/* Down */}
        <path
          d="M 131 216 C 131 220, 149 220, 149 216 L 149 198 L 131 198 Z"
          fill={padState.dpadDown ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1"
        />
        {/* Left */}
        <path
          d="M 104 171 C 100 171, 100 189, 104 189 L 122 189 L 122 171 Z"
          fill={padState.dpadLeft ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1"
        />
        {/* Right */}
        <path
          d="M 176 171 C 180 171, 180 189, 176 189 L 158 189 L 158 171 Z"
          fill={padState.dpadRight ? '#ff6b6b' : '#c92a2a'}
          stroke="#8f1616"
          strokeWidth="1"
        />

        {/* ─── Action Buttons Circular Black Base (Right) ─── */}
        <circle cx="360" cy="180" r="44" fill="#18181b" stroke="#27272a" strokeWidth="1.5" />

        {/* Triangle (Top - Green) */}
        <circle cx="360" cy="152" r="12" fill={padState.triangle ? '#2b8a3e' : '#18181b'} stroke="#27272a" strokeWidth="1" />
        <polygon
          points="360,146 366,156 354,156"
          fill="none"
          stroke={padState.triangle ? '#ffffff' : '#40c057'}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Circle (Right - Red) */}
        <circle cx="388" cy="180" r="12" fill={padState.circle ? '#c92a2a' : '#18181b'} stroke="#27272a" strokeWidth="1" />
        <circle
          cx="388"
          cy="180"
          r="5.5"
          fill="none"
          stroke={padState.circle ? '#ffffff' : '#ff6b6b'}
          strokeWidth="2.5"
        />

        {/* Cross (Bottom - Blue) */}
        <circle cx="360" cy="208" r="12" fill={padState.cross ? '#1971c2' : '#18181b'} stroke="#27272a" strokeWidth="1" />
        <g stroke={padState.cross ? '#ffffff' : '#4dabf7'} strokeWidth="2.5" strokeLinecap="round">
          <line x1="356" y1="204" x2="364" y2="212" />
          <line x1="364" y1="204" x2="356" y2="212" />
        </g>

        {/* Square (Left - Pink) */}
        <circle cx="332" cy="180" r="12" fill={padState.square ? '#a61e4d' : '#18181b'} stroke="#27272a" strokeWidth="1" />
        <rect
          x="327.5"
          y="175.5"
          width="9"
          height="9"
          rx="1"
          fill="none"
          stroke={padState.square ? '#ffffff' : '#f06595'}
          strokeWidth="2.5"
        />

        {/* ─── Speaker Dots ─── */}
        <g fill="#18181b" opacity={0.6}>
          <circle cx="244" cy="192" r="1.5" />
          <circle cx="250" cy="192" r="1.5" />
          <circle cx="256" cy="192" r="1.5" />
          <circle cx="241" cy="197" r="1.5" />
          <circle cx="247" cy="197" r="1.5" />
          <circle cx="253" cy="197" r="1.5" />
          <circle cx="259" cy="197" r="1.5" />
          <circle cx="244" cy="202" r="1.5" />
          <circle cx="250" cy="202" r="1.5" />
          <circle cx="256" cy="202" r="1.5" />
        </g>

        {/* ─── PS Button (Center) ─── */}
        <circle cx="250" cy="226" r="13" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="250" y="230" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900" fontFamily="sans-serif">
          ☲
        </text>

        {/* ─── Left Analog Stick ─── */}
        <g transform="translate(195, 235)">
          {/* Base Rim */}
          <circle cx="0" cy="0" r="30" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
          {/* Moving Red Cap */}
          <g ref={leftStickRef}>
            <circle cx="0" cy="0" r="23" fill="url(#ps4RedGrad)" stroke="#8f1616" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="16" fill="none" stroke="#ff8787" strokeWidth="1.2" opacity={0.7} />
            {padState.l3 && <circle cx="0" cy="0" r="8" fill="#ffffff" opacity={0.4} />}
          </g>
        </g>

        {/* ─── Right Analog Stick ─── */}
        <g transform="translate(305, 235)">
          {/* Base Rim */}
          <circle cx="0" cy="0" r="30" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
          {/* Moving Red Cap */}
          <g ref={rightStickRef}>
            <circle cx="0" cy="0" r="23" fill="url(#ps4RedGrad)" stroke="#8f1616" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="16" fill="none" stroke="#ff8787" strokeWidth="1.2" opacity={0.7} />
            {padState.r3 && <circle cx="0" cy="0" r="8" fill="#ffffff" opacity={0.4} />}
          </g>
        </g>
      </svg>

      {/* Edit mode badge */}
      {isEditMode && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          🎮 PS4 Controller HUD
        </div>
      )}
    </div>
  )
})
