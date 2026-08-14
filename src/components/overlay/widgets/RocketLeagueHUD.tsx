import rlLogoImg from '../../../assets/Rocket-League-Logo.png'

type RLData = {
  playerName: string
  platform: 'steam' | 'epic' | 'unknown'
  playerId: string
  rankName: string
  rankIcon: string
  mmr: number
  division: number
  sessionWins: number
  sessionLosses: number
  sessionMMRDelta: number
  playlist?: '1v1' | '2v2' | '3v3'
  isLoading: boolean
  error?: string
}

function getRankColor(rankName: string): string {
  const r = (rankName || '').toLowerCase()
  if (r.includes('supersonic')) return '#ff6535'
  if (r.includes('grand champ')) return '#e74c3c'
  if (r.includes('champion'))   return '#a855f7'
  if (r.includes('diamond'))    return '#38bdf8'
  if (r.includes('platinum'))   return '#2dd4bf'
  if (r.includes('gold'))       return '#f59e0b'
  if (r.includes('silver'))     return '#9ca3af'
  if (r.includes('bronze'))     return '#d97706'
  return '#6b7280'
}

function getRankAbbr(rankName: string): string {
  const r = (rankName || '').toLowerCase()
  if (r.includes('supersonic')) return 'SSL'
  if (r.includes('grand'))      return 'GC'
  if (r.includes('champion'))   return 'C'
  if (r.includes('diamond'))    return 'D'
  if (r.includes('platinum'))   return 'P'
  if (r.includes('gold'))       return 'G'
  if (r.includes('silver'))     return 'S'
  if (r.includes('bronze'))     return 'B'
  return '?'
}

export function RocketLeagueHUD({ data }: { data?: RLData | null }) {
  if (!data) {
    return (
      <div style={{
        background: 'rgba(10, 10, 14, 0.93)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 8,
        width: 192,
        padding: 12,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        pointerEvents: 'none',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
      }}>
        <img src={rlLogoImg} width={24} height={24} style={{ opacity: 0.5 }} alt="" />
        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>Waiting for data...</div>
      </div>
    )
  }

  const rankColor = getRankColor(data.rankName)
  const abbr = getRankAbbr(data.rankName)
  const delta = data.sessionMMRDelta || 0
  const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0'
  const deltaColor = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#6b7280'
  const connected = !data.isLoading && !data.error && data.mmr > 0

  return (
    <div style={{
      background: 'rgba(10, 10, 14, 0.93)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 8,
      width: 192,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      pointerEvents: 'none',
      userSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 9px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* RL icon */}
          <img src={rlLogoImg} width="14" height="14" alt="RL" style={{ objectFit: 'contain' }} />
          {data.playlist && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.02em',
            }}>{data.playlist}</span>
          )}
        </div>
        {/* Status dot */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: connected ? '#22c55e' : data.isLoading ? '#f59e0b' : '#ef4444',
          flexShrink: 0,
        }} />
      </div>

      {/* Rank + MMR row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 9px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Rank circle */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: `2px solid ${rankColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          background: `${rankColor}12`,
        }}>
          <span style={{
            fontSize: abbr.length > 2 ? 8 : 11,
            fontWeight: 800,
            color: rankColor,
            letterSpacing: '-0.5px',
          }}>{abbr}</span>
        </div>

        {/* Rank name + division */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: data.isLoading ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.9)',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {data.isLoading ? 'Loading...' : (data.rankName || 'Unranked')}
          </div>
          {/* Division dots */}
          {data.division > 0 && !data.isLoading && (
            <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
              {[1,2,3,4].map(d => (
                <div key={d} style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: d <= data.division ? rankColor : 'rgba(255,255,255,0.1)',
                }} />
              ))}
            </div>
          )}
        </div>

        {/* MMR */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'white',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.5px',
          }}>
            {data.mmr > 0 ? data.mmr : '—'}
          </div>
          <div style={{
            fontSize: 8,
            color: 'rgba(255,255,255,0.28)',
            fontWeight: 500,
            letterSpacing: '0.05em',
            marginTop: 2,
          }}>MMR</div>
        </div>
      </div>

      {/* W / L / Delta row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        padding: '5px 9px 6px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {data.sessionWins}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 1, fontWeight: 500 }}>W</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {data.sessionLosses}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 1, fontWeight: 500 }}>L</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: deltaColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {deltaStr}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 1, fontWeight: 500 }}>MMR±</div>
        </div>
      </div>

      {/* Player name */}
      {data.playerName && (
        <div style={{
          padding: '3px 9px 5px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          fontSize: 9,
          color: 'rgba(255,255,255,0.28)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {data.platform === 'epic' ? 'Epic · ' : data.platform === 'steam' ? 'Steam · ' : ''}{data.playerName}
        </div>
      )}
    </div>
  )
}
