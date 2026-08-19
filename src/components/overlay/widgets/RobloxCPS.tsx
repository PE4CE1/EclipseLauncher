import React, { useEffect, useRef } from 'react'

export const RobloxCPS = React.memo(function RobloxCPS() {
  const lmbValRef = useRef<HTMLSpanElement>(null)
  const rmbValRef = useRef<HTMLSpanElement>(null)
  const lmbPillRef = useRef<HTMLDivElement>(null)
  const rmbPillRef = useRef<HTMLDivElement>(null)
  const lmbLabelRef = useRef<HTMLSpanElement>(null)
  const rmbLabelRef = useRef<HTMLSpanElement>(null)

  const lmbTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const rmbTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!(window.electronAPI as any)?.onCPSUpdate) return

    const cleanup = (window.electronAPI as any).onCPSUpdate((data: { lmb: number; rmb: number; total: number; buttonClicked?: 'lmb' | 'rmb' }) => {
      if (lmbValRef.current) lmbValRef.current.textContent = String(data.lmb)
      if (rmbValRef.current) rmbValRef.current.textContent = String(data.rmb)

      if (data.buttonClicked === 'lmb' && lmbPillRef.current) {
        lmbPillRef.current.style.background = 'linear-gradient(180deg, rgba(38,42,56,0.92) 0%, rgba(20,22,32,0.96) 100%)'
        lmbPillRef.current.style.borderColor = 'rgba(255,255,255,0.48)'
        lmbPillRef.current.style.boxShadow = '0 0 14px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 14px rgba(0,0,0,0.6)'
        lmbPillRef.current.style.transform = 'scale(0.95)'
        if (lmbLabelRef.current) lmbLabelRef.current.style.color = 'rgba(255,255,255,0.9)'

        if (lmbTimeoutRef.current) clearTimeout(lmbTimeoutRef.current)
        lmbTimeoutRef.current = setTimeout(() => {
          if (lmbPillRef.current) {
            lmbPillRef.current.style.background = 'linear-gradient(180deg, rgba(14,15,22,0.85) 0%, rgba(8,9,14,0.92) 100%)'
            lmbPillRef.current.style.borderColor = 'rgba(255,255,255,0.12)'
            lmbPillRef.current.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.5)'
            lmbPillRef.current.style.transform = 'scale(1)'
          }
          if (lmbLabelRef.current) lmbLabelRef.current.style.color = 'rgba(255,255,255,0.45)'
        }, 85)
      } else if (data.buttonClicked === 'rmb' && rmbPillRef.current) {
        rmbPillRef.current.style.background = 'linear-gradient(180deg, rgba(38,42,56,0.92) 0%, rgba(20,22,32,0.96) 100%)'
        rmbPillRef.current.style.borderColor = 'rgba(255,255,255,0.48)'
        rmbPillRef.current.style.boxShadow = '0 0 14px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 14px rgba(0,0,0,0.6)'
        rmbPillRef.current.style.transform = 'scale(0.95)'
        if (rmbLabelRef.current) rmbLabelRef.current.style.color = 'rgba(255,255,255,0.9)'

        if (rmbTimeoutRef.current) clearTimeout(rmbTimeoutRef.current)
        rmbTimeoutRef.current = setTimeout(() => {
          if (rmbPillRef.current) {
            rmbPillRef.current.style.background = 'linear-gradient(180deg, rgba(14,15,22,0.85) 0%, rgba(8,9,14,0.92) 100%)'
            rmbPillRef.current.style.borderColor = 'rgba(255,255,255,0.12)'
            rmbPillRef.current.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.5)'
            rmbPillRef.current.style.transform = 'scale(1)'
          }
          if (rmbLabelRef.current) rmbLabelRef.current.style.color = 'rgba(255,255,255,0.45)'
        }, 85)
      }
    })

    return () => {
      cleanup()
      if (lmbTimeoutRef.current) clearTimeout(lmbTimeoutRef.current)
      if (rmbTimeoutRef.current) clearTimeout(rmbTimeoutRef.current)
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
      willChange: 'transform',
    }}>
      {/* LMB Key Pill */}
      <div 
        ref={lmbPillRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minWidth: 62,
          height: 30,
          padding: '0 10px',
          borderRadius: 9,
          background: 'linear-gradient(180deg, rgba(14,15,22,0.85) 0%, rgba(8,9,14,0.92) 100%)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.5)',
          transform: 'scale(1)',
          transition: 'transform 0.08s cubic-bezier(0.16, 1, 0.3, 1), background 0.08s ease, border-color 0.08s ease, box-shadow 0.08s ease',
          contain: 'layout paint style',
          willChange: 'transform, background, border-color',
        }}
      >
        <span 
          ref={lmbValRef}
          style={{
            fontSize: 13.5,
            fontWeight: 800,
            color: '#ffffff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          0
        </span>
        <span 
          ref={lmbLabelRef}
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            transition: 'color 0.08s ease',
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
          minWidth: 62,
          height: 30,
          padding: '0 10px',
          borderRadius: 9,
          background: 'linear-gradient(180deg, rgba(14,15,22,0.85) 0%, rgba(8,9,14,0.92) 100%)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.5)',
          transform: 'scale(1)',
          transition: 'transform 0.08s cubic-bezier(0.16, 1, 0.3, 1), background 0.08s ease, border-color 0.08s ease, box-shadow 0.08s ease',
          contain: 'layout paint style',
          willChange: 'transform, background, border-color',
        }}
      >
        <span 
          ref={rmbValRef}
          style={{
            fontSize: 13.5,
            fontWeight: 800,
            color: '#ffffff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          0
        </span>
        <span 
          ref={rmbLabelRef}
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            transition: 'color 0.08s ease',
          }}
        >
          RMB
        </span>
      </div>
    </div>
  )
})
