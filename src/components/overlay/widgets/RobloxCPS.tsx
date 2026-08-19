import React, { useEffect, useRef } from 'react'

export const RobloxCPS = React.memo(function RobloxCPS() {
  const lmbValRef = useRef<HTMLSpanElement>(null)
  const rmbValRef = useRef<HTMLSpanElement>(null)
  const lmbPillRef = useRef<HTMLDivElement>(null)
  const rmbPillRef = useRef<HTMLDivElement>(null)

  const lmbTimerRef = useRef<NodeJS.Timeout | null>(null)
  const rmbTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!(window.electronAPI as any)?.onCPSUpdate) return

    const cleanup = (window.electronAPI as any).onCPSUpdate((data: { lmb: number; rmb: number; total: number; buttonClicked?: 'lmb' | 'rmb' }) => {
      if (lmbValRef.current && lmbValRef.current.textContent !== String(data.lmb)) {
        lmbValRef.current.textContent = String(data.lmb)
      }
      if (rmbValRef.current && rmbValRef.current.textContent !== String(data.rmb)) {
        rmbValRef.current.textContent = String(data.rmb)
      }

      if (data.buttonClicked === 'lmb' && lmbPillRef.current) {
        lmbPillRef.current.style.transform = 'scale(0.95)'
        lmbPillRef.current.style.borderColor = 'rgba(255, 255, 255, 0.4)'
        lmbPillRef.current.style.backgroundColor = 'rgba(35, 38, 52, 0.98)'

        if (lmbTimerRef.current) clearTimeout(lmbTimerRef.current)
        lmbTimerRef.current = setTimeout(() => {
          if (lmbPillRef.current) {
            lmbPillRef.current.style.transform = 'scale(1)'
            lmbPillRef.current.style.borderColor = 'rgba(255, 255, 255, 0.12)'
            lmbPillRef.current.style.backgroundColor = 'rgba(13, 14, 20, 0.95)'
          }
        }, 65)
      } else if (data.buttonClicked === 'rmb' && rmbPillRef.current) {
        rmbPillRef.current.style.transform = 'scale(0.95)'
        rmbPillRef.current.style.borderColor = 'rgba(255, 255, 255, 0.4)'
        rmbPillRef.current.style.backgroundColor = 'rgba(35, 38, 52, 0.98)'

        if (rmbTimerRef.current) clearTimeout(rmbTimerRef.current)
        rmbTimerRef.current = setTimeout(() => {
          if (rmbPillRef.current) {
            rmbPillRef.current.style.transform = 'scale(1)'
            rmbPillRef.current.style.borderColor = 'rgba(255, 255, 255, 0.12)'
            rmbPillRef.current.style.backgroundColor = 'rgba(13, 14, 20, 0.95)'
          }
        }, 65)
      }
    })

    return () => {
      cleanup()
      if (lmbTimerRef.current) clearTimeout(lmbTimerRef.current)
      if (rmbTimerRef.current) clearTimeout(rmbTimerRef.current)
    }
  }, [])

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      userSelect: 'none',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      contain: 'layout paint style',
      transform: 'translateZ(0)',
    }}>
      {/* LMB Key Pill */}
      <div 
        ref={lmbPillRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minWidth: 60,
          height: 28,
          padding: '0 9px',
          borderRadius: 7,
          backgroundColor: 'rgba(13, 14, 20, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: 'none',
          transform: 'scale(1)',
          transition: 'transform 0.05s ease, border-color 0.05s ease, background-color 0.05s ease',
          contain: 'layout paint style',
          willChange: 'transform',
        }}
      >
        <span 
          ref={lmbValRef}
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: '#ffffff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          0
        </span>
        <span 
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: 'rgba(255, 255, 255, 0.45)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          LMB
        </span>
      </div>

      {/* RMB Key Pill */}
      <div 
        ref={rmbPillRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minWidth: 60,
          height: 28,
          padding: '0 9px',
          borderRadius: 7,
          backgroundColor: 'rgba(13, 14, 20, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: 'none',
          transform: 'scale(1)',
          transition: 'transform 0.05s ease, border-color 0.05s ease, background-color 0.05s ease',
          contain: 'layout paint style',
          willChange: 'transform',
        }}
      >
        <span 
          ref={rmbValRef}
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: '#ffffff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          0
        </span>
        <span 
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: 'rgba(255, 255, 255, 0.45)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          RMB
        </span>
      </div>
    </div>
  )
})
