import { memo } from 'react'
import type { RLRankData } from '../../../types/rocketLeague'
import rlLogoImg from '../../../assets/Rocket-League-Logo.png'
import '../overlay-widgets.css'

export const RocketLeagueHUD = memo(function RocketLeagueHUD({ data, language = 'de' }: { data?: RLRankData | null; language?: string }) {
  const de = language === 'de', live = data?.connection === 'live'
  const streak = data?.streak || 0
  const status = live ? (de ? 'Verbunden' : 'Connected')
    : data?.connection === 'select-player' ? (de ? 'Spieler auswählen' : 'Select player')
    : data?.connection === 'disabled' ? (de ? 'Anzeige deaktiviert' : 'HUD disabled')
    : data?.connection === 'disconnected' ? (de ? 'Verbindung unterbrochen' : 'Disconnected')
    : (de ? 'Warte auf Matchdaten' : 'Waiting for match data')
  const mmr = data?.mmrStatus === 'ready' && data.mmr !== null && Number.isFinite(data.mmr) ? data.mmr : null
  return <div className="overlay-panel rl-session-hud" data-connection={data?.connection || 'waiting'} aria-label={de ? 'Rocket League Ranked-Sitzung' : 'Rocket League ranked session'}>
    <header className="rl-session-hud__header"><img src={rlLogoImg} width={14} height={14} alt="" /><span>RANKED</span><strong>{data?.playlist || '2v2'}</strong><i data-live={live || undefined} /></header>
    <div className="rl-session-hud__stats">
      <div><strong data-rl-stat="wins">{data?.sessionWins ?? '—'}</strong><span>{de ? 'Siege' : 'Wins'}</span></div>
      <div><strong data-rl-stat="losses">{data?.sessionLosses ?? '—'}</strong><span>{de ? 'Niederlagen' : 'Losses'}</span></div>
      <div><strong data-rl-stat="streak" data-result={streak > 0 ? 'win' : streak < 0 ? 'loss' : 'none'}>{streak ? Math.abs(streak) + (streak > 0 ? ' W' : ' L') : '—'}</strong><span>{de ? 'Serie' : 'Streak'}</span></div>
    </div>
    <div className="rl-session-hud__summary"><span>{de ? 'Beste Siegesserie' : 'Best win streak'}</span><strong data-rl-stat="best">{data?.bestWinStreak ?? 0}</strong></div>
    <div className="rl-session-hud__mmr"><span>MMR</span><strong>{mmr ?? '—'}</strong><span>{mmr === null ? (de ? 'API liefert keine MMR' : 'Not provided by API') : ''}</span></div>
    <footer className="rl-session-hud__footer"><span>{data?.playerName || status}</span>{data?.playerName && <span>{status}</span>}</footer>
  </div>
})
