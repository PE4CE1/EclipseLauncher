import { useState, useEffect, memo } from 'react'
import robloxLogoImg from '../../../assets/Roblox-Logo-Icon.png'

export const RobloxTimer = memo(function RobloxTimer({ 
  startTime, 
  idleTime = 0,
  antiAfkEnabled = false 
}: { 
  startTime: number
  idleTime?: number
  antiAfkEnabled?: boolean 
}) {
  const [session, setSession] = useState('00:00')

  useEffect(() => {
    const updateSession = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setSession(h > 0
        ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    updateSession()
    const id = setInterval(updateSession, 1000)
    return () => clearInterval(id)
  }, [startTime])

  const afkSeconds = Math.max(0, 20 * 60 - (idleTime || 0))
  const afkM = Math.floor(afkSeconds / 60)
  const afkS = afkSeconds % 60
  const isDanger = afkSeconds < 120
  const afkStr = `${String(afkM).padStart(2, '0')}:${String(afkS).padStart(2, '0')}`

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      height: 28,
      padding: '0 10px 0 8px',
      borderRadius: 7,
      backgroundColor: isDanger ? 'rgba(28, 12, 16, 0.95)' : 'rgba(13, 14, 20, 0.95)',
      border: isDanger ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: isDanger ? '0 0 14px rgba(239, 68, 68, 0.25)' : 'none',
      userSelect: 'none',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      contain: 'layout paint style',
      transform: 'translateZ(0)',
      transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
    }}>
      {/* Roblox Icon */}
      <img 
        src={robloxLogoImg} 
        width="13" 
        height="13" 
        alt="Roblox" 
        style={{ 
          objectFit: 'contain', 
          opacity: 0.9, 
          flexShrink: 0,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' 
        }} 
      />

      {/* Divider */}
      <div style={{ 
        width: 1, 
        height: 12, 
        backgroundColor: 'rgba(255, 255, 255, 0.1)', 
        margin: '0 8px',
        flexShrink: 0 
      }} />

      {/* Session / Playtime */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 800,
          color: '#ffffff',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          {session}
        </span>
        <span style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: 'rgba(255, 255, 255, 0.45)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}>
          PLAY
        </span>
      </div>

      {/* Divider */}
      <div style={{ 
        width: 1, 
        height: 12, 
        backgroundColor: 'rgba(255, 255, 255, 0.1)', 
        margin: '0 8px',
        flexShrink: 0 
      }} />

      {/* AFK Kick Countdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {antiAfkEnabled && (
          <span 
            title="Anti-AFK Protection Active"
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.9)',
              flexShrink: 0,
            }} 
          />
        )}
        <span style={{
          fontSize: 13,
          fontWeight: 800,
          color: isDanger ? '#f87171' : '#ffffff',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          textShadow: isDanger ? '0 0 8px rgba(248, 113, 113, 0.5)' : undefined,
        }}>
          {afkStr}
        </span>
        <span style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: isDanger ? 'rgba(248, 113, 113, 0.75)' : 'rgba(255, 255, 255, 0.45)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}>
          AFK
        </span>
      </div>
    </div>
  )
})
