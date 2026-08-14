import { useState, useEffect } from 'react'
import robloxLogoImg from '../../../assets/Roblox-Logo-Icon.png'

const RobloxIcon = () => (
  <img src={robloxLogoImg} width="13" height="13" alt="Roblox" style={{ objectFit: 'contain' }} />
)

export function RobloxTimer({ startTime, idleTime = 0 }: { startTime: number; idleTime?: number }) {
  const [session, setSession] = useState('00:00')

  useEffect(() => {
    const id = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000)
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setSession(h > 0
        ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  const afk = Math.max(0, 20 * 60 - idleTime)

  const afkM = Math.floor(afk / 60)
  const afkS = afk % 60
  const isWarn = afk < 120
  const afkStr = `${String(afkM).padStart(2,'0')}:${String(afkS).padStart(2,'0')}`

  return (
    <div style={{
      background: 'rgba(0,0,0,0.62)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 13,
      overflow: 'hidden',
      minWidth: 158,
      pointerEvents: 'none',
      boxShadow: isWarn ? '0 0 20px rgba(248,113,113,0.15)' : '0 4px 24px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 11px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <RobloxIcon />
        <span style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 10, fontWeight: 700,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>Roblox HUD</span>
      </div>

      {/* Session */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 11px', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>Session</span>
        <span style={{
          fontFamily: 'monospace', fontSize: 13, fontWeight: 600,
          color: 'rgba(255,255,255,0.9)', letterSpacing: '0.06em',
        }}>{session}</span>
      </div>

      {/* AFK */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 11px',
      }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>AFK Kick</span>
        <span style={{
          fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
          color: isWarn ? '#f87171' : '#fb923c',
          letterSpacing: '0.06em',
          textShadow: isWarn ? '0 0 8px #f87171aa' : undefined,
        }}>{afkStr}</span>
      </div>
    </div>
  )
}
