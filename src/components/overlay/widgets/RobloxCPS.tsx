import { useState, useEffect, useRef } from 'react'
import robloxLogoImg from '../../../assets/Roblox-Logo-Icon.png'

const RobloxIcon = () => (
  <img src={robloxLogoImg} width="13" height="13" alt="Roblox" style={{ objectFit: 'contain' }} />
)

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
  const total = cpsData?.total || (lmb + rmb)

  // Trigger brief visual flash on click
  useEffect(() => {
    if (cpsData?.buttonClicked === 'lmb') {
      setLmbActive(true)
      if (lmbTimerRef.current) clearTimeout(lmbTimerRef.current)
      lmbTimerRef.current = setTimeout(() => setLmbActive(false), 90)
    } else if (cpsData?.buttonClicked === 'rmb') {
      setRmbActive(true)
      if (rmbTimerRef.current) clearTimeout(rmbTimerRef.current)
      rmbTimerRef.current = setTimeout(() => setRmbActive(false), 90)
    }
  }, [cpsData?.buttonClicked, lmb, rmb])

  return (
    <div style={{
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 13,
      overflow: 'hidden',
      minWidth: 160,
      pointerEvents: 'none',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      fontFamily: 'Inter, system-ui, sans-serif',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 11px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <RobloxIcon />
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>CPS Counter</span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 600,
          color: total > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)',
          letterSpacing: '0.04em',
          transition: 'color 0.15s ease',
        }}>
          {total > 0 ? `${total} Total` : 'LIVE'}
        </span>
      </div>

      {/* CPS Split Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
        background: 'rgba(255,255,255,0.04)',
      }}>
        {/* LMB (Left Click) */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '8px 10px',
          background: lmbActive 
            ? 'rgba(255,255,255,0.14)' 
            : lmb > 0 
              ? 'rgba(255,255,255,0.03)' 
              : 'rgba(0,0,0,0.4)',
          transition: 'background 0.08s ease',
        }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: 800,
            color: lmb > 0 ? '#ffffff' : 'rgba(255,255,255,0.7)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
            transform: lmbActive ? 'scale(1.06)' : 'scale(1)',
            transition: 'transform 0.08s ease',
          }}>
            {lmb}
          </div>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.38)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginTop: 1,
          }}>
            LMB
          </div>
        </div>

        {/* RMB (Right Click) */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '8px 10px',
          background: rmbActive 
            ? 'rgba(255,255,255,0.14)' 
            : rmb > 0 
              ? 'rgba(255,255,255,0.03)' 
              : 'rgba(0,0,0,0.4)',
          transition: 'background 0.08s ease',
        }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: 800,
            color: rmb > 0 ? '#ffffff' : 'rgba(255,255,255,0.7)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
            transform: rmbActive ? 'scale(1.06)' : 'scale(1)',
            transition: 'transform 0.08s ease',
          }}>
            {rmb}
          </div>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.38)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginTop: 1,
          }}>
            RMB
          </div>
        </div>
      </div>
    </div>
  )
}
