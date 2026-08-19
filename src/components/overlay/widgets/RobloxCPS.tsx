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
      lmbTimerRef.current = setTimeout(() => setLmbActive(false), 75)
    } else if (cpsData?.buttonClicked === 'rmb') {
      setRmbActive(true)
      if (rmbTimerRef.current) clearTimeout(rmbTimerRef.current)
      rmbTimerRef.current = setTimeout(() => setRmbActive(false), 75)
    }
  }, [cpsData?.buttonClicked, lmb, rmb])

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      userSelect: 'none',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      {/* LMB Key Pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        minWidth: 56,
        padding: '4px 9px',
        borderRadius: 8,
        background: lmbActive ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(14px)',
        border: lmbActive ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: lmbActive 
          ? '0 0 12px rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.4)' 
          : '0 2px 8px rgba(0,0,0,0.3)',
        transform: lmbActive ? 'scale(0.96)' : 'scale(1)',
        transition: 'all 0.06s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 800,
          color: lmb > 0 ? '#ffffff' : 'rgba(255,255,255,0.7)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}>
          {lmb}
        </span>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.42)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          LMB
        </span>
      </div>

      {/* RMB Key Pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        minWidth: 56,
        padding: '4px 9px',
        borderRadius: 8,
        background: rmbActive ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(14px)',
        border: rmbActive ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: rmbActive 
          ? '0 0 12px rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.4)' 
          : '0 2px 8px rgba(0,0,0,0.3)',
        transform: rmbActive ? 'scale(0.96)' : 'scale(1)',
        transition: 'all 0.06s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 800,
          color: rmb > 0 ? '#ffffff' : 'rgba(255,255,255,0.7)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}>
          {rmb}
        </span>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.42)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          RMB
        </span>
      </div>
    </div>
  )
}
