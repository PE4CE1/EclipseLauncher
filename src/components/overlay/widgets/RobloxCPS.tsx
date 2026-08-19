import { useState, useEffect, useRef } from 'react'

interface RobloxCPSProps {
  cpsData?: { lmb: number; rmb: number; total: number; buttonClicked?: 'lmb' | 'rmb' }
}

export function RobloxCPS({ cpsData }: RobloxCPSProps) {
  const [lmbActive, setLmbActive] = useState(false)
  const [rmbActive, setRmbActive] = useState(false)
  const lmbTimerRef = useRef<NodeJS.Timeout | null>(null)
  const rmbTimerRef = useRef<NodeJS.Timeout | null>(null)

  const lmb = cpsData?.lmb || 0
  const rmb = cpsData?.rmb || 0

  useEffect(() => {
    if (cpsData?.buttonClicked === 'lmb') {
      setLmbActive(true)
      if (lmbTimerRef.current) clearTimeout(lmbTimerRef.current)
      lmbTimerRef.current = setTimeout(() => setLmbActive(false), 80)
    } else if (cpsData?.buttonClicked === 'rmb') {
      setRmbActive(true)
      if (rmbTimerRef.current) clearTimeout(rmbTimerRef.current)
      rmbTimerRef.current = setTimeout(() => setRmbActive(false), 80)
    }
  }, [cpsData?.buttonClicked, lmb, rmb])

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      userSelect: 'none',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      {/* LMB Key Pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 62,
        height: 30,
        padding: '0 10px',
        borderRadius: 9,
        background: lmbActive 
          ? 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.14) 100%)' 
          : 'linear-gradient(180deg, rgba(16,17,24,0.62) 0%, rgba(8,9,14,0.76) 100%)',
        backdropFilter: 'blur(16px)',
        border: lmbActive 
          ? '1px solid rgba(255,255,255,0.45)' 
          : '1px solid rgba(255,255,255,0.09)',
        boxShadow: lmbActive 
          ? '0 0 16px rgba(255,255,255,0.28), inset 0 1px 0 rgba(255,255,255,0.45), 0 3px 10px rgba(0,0,0,0.5)' 
          : 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.3), 0 3px 10px rgba(0,0,0,0.35)',
        transform: lmbActive ? 'scale(0.95)' : 'scale(1)',
        transition: 'transform 0.08s cubic-bezier(0.16, 1, 0.3, 1), background 0.08s ease, border-color 0.08s ease, box-shadow 0.08s ease',
      }}>
        <span style={{
          fontSize: 13.5,
          fontWeight: 800,
          color: '#ffffff',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          textShadow: lmbActive ? '0 0 8px rgba(255,255,255,0.6)' : 'none',
        }}>
          {lmb}
        </span>
        <span style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: lmbActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.42)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          transition: 'color 0.08s ease',
        }}>
          LMB
        </span>
      </div>

      {/* RMB Key Pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 62,
        height: 30,
        padding: '0 10px',
        borderRadius: 9,
        background: rmbActive 
          ? 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.14) 100%)' 
          : 'linear-gradient(180deg, rgba(16,17,24,0.62) 0%, rgba(8,9,14,0.76) 100%)',
        backdropFilter: 'blur(16px)',
        border: rmbActive 
          ? '1px solid rgba(255,255,255,0.45)' 
          : '1px solid rgba(255,255,255,0.09)',
        boxShadow: rmbActive 
          ? '0 0 16px rgba(255,255,255,0.28), inset 0 1px 0 rgba(255,255,255,0.45), 0 3px 10px rgba(0,0,0,0.5)' 
          : 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.3), 0 3px 10px rgba(0,0,0,0.35)',
        transform: rmbActive ? 'scale(0.95)' : 'scale(1)',
        transition: 'transform 0.08s cubic-bezier(0.16, 1, 0.3, 1), background 0.08s ease, border-color 0.08s ease, box-shadow 0.08s ease',
      }}>
        <span style={{
          fontSize: 13.5,
          fontWeight: 800,
          color: '#ffffff',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          textShadow: rmbActive ? '0 0 8px rgba(255,255,255,0.6)' : 'none',
        }}>
          {rmb}
        </span>
        <span style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: rmbActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.42)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          transition: 'color 0.08s ease',
        }}>
          RMB
        </span>
      </div>
    </div>
  )
}
