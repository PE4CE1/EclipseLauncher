import { Select } from '../shared/Select'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import type { RLPlaylist } from '../../types/rocketLeague'

export function RocketLeagueStatsPanel({ enabled, playlist, onPlaylistChange, playerId, onPlayerChange, language }: {
  enabled: boolean; playlist: RLPlaylist; onPlaylistChange: (playlist: RLPlaylist) => void
  playerId: string; onPlayerChange: (id: string) => void; language: string
}) {
  const de = language === 'de', [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const { data, refetch } = useQuery({ queryKey: ['rl-live-state'], queryFn: async () => await window.electronAPI?.getRLState?.() || null,
    refetchInterval: 2000, refetchOnWindowFocus: false, retry: false })
  const selected = playerId || data?.primaryId || ''
  const players = data?.players || []
  const state = !enabled ? (de ? 'Anzeige deaktiviert' : 'HUD disabled')
    : data?.connection === 'live' ? (de ? 'Live-Spieldaten verbunden' : 'Live game data connected')
    : data?.connection === 'select-player' ? (de ? 'Daten empfangen · Spieler auswählen' : 'Receiving data · select your player')
    : (de ? 'Warte auf ein Match und die lokale StatsAPI' : 'Waiting for a match and the local StatsAPI')
  return <div className="rl-stats-settings space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><strong className="text-[11px] text-white/85">{state}</strong><p className="text-[10px] text-white/40 mt-1">{de ? 'Offizielle Rocket League StatsAPI · nur lesend' : 'Official Rocket League StatsAPI · read only'}</p></div>
      <button type="button" disabled={resetting} className="overlay-layout-button" onClick={async () => {
        setResetting(true)
        setError('')
        try { await window.electronAPI?.resetRLSession?.(); await refetch() }
        catch { setError(de ? 'Die Sitzung konnte nicht zurückgesetzt werden.' : 'Unable to reset the session.') }
        finally { setResetting(false) }
      }}><RotateCcw size={11} />{de ? 'Sitzung zurücksetzen' : 'Reset session'}</button>
    </div>
    {error && <p className="text-[10px] text-red-300" role="status">{error}</p>}
    <label className="block text-[10px] text-white/55">{de ? 'Dein Spieler' : 'Your player'}
      <Select aria-label={de ? 'Dein Rocket-League-Spieler' : 'Your Rocket League player'} className="mt-1 w-full rounded-md bg-white/[.04] border border-white/10 p-2 text-[11px] text-white" value={playerId} onChange={event => onPlayerChange(event.target.value)}>
        <option value="">{de ? 'Automatisch über das eigene Spielkonto' : 'Automatically from your game account'}</option>
        {playerId && !players.some(player => player.id === playerId) && <option value={playerId}>{de ? 'Gespeicherter Spieler (offline)' : 'Saved player (offline)'}</option>}
        {players.map(player => <option key={player.id} value={player.id}>{player.name} · {player.id.startsWith('Steam|') ? 'Steam' : 'Epic'}</option>)}
      </Select>
      <span className="block mt-1 text-white/35">{selected ? (de ? 'Zuordnung über die Plattform-ID. Zuschauerziele werden nicht als eigener Spieler verwendet.' : 'Matched by platform ID. Spectator targets never select your player.') : (de ? 'Im laufenden Match deinen eigenen Namen auswählen.' : 'Select your own name during a match.')}</span>
    </label>
    <div className="flex gap-2" role="group" aria-label={de ? 'Angezeigte Ranglisten-Playlist' : 'Displayed ranked playlist'}>
      {(['1v1', '2v2', '3v3'] as const).map(mode => <button key={mode} type="button" aria-pressed={playlist === mode} onClick={() => onPlaylistChange(mode)} className={`flex-1 py-1.5 rounded-md text-[11px] border ${playlist === mode ? 'bg-white text-black border-white' : 'bg-white/[.03] text-white/50 border-white/10'}`}>{mode}</button>)}
    </div>
    <p className="text-[10px] text-white/45 leading-relaxed">{de ? 'Siege, Niederlagen und Serien werden je Playlist ab Verbindung erfasst. Doppelte Ergebnisereignisse und Replays zählen nicht. Vorzeitig verlassene Matches ohne empfangenes Ergebnis können nicht gezählt werden.' : 'Wins, losses and streaks are tracked separately per playlist from connection onward. Duplicate results and replays do not count. Matches left before receiving a result cannot be counted.'}</p>
    <div className="rounded-md border border-amber-200/10 bg-amber-200/[.025] px-3 py-2 text-[10px] text-white/55 leading-relaxed"><strong className="text-white/75">MMR</strong> — {de ? 'Die offizielle Schnittstelle liefert keine MMR oder Rangpunkte. Eclipse zeigt deshalb keine geschätzten oder veralteten Werte als live an.' : 'The official interface does not provide MMR or rank points. Eclipse therefore does not display estimated or stale values as live.'}</div>
    <details className="text-[10px] text-white/50 leading-relaxed"><summary className="cursor-pointer text-white/70">{de ? 'Lokale Verbindung einrichten' : 'Set up local connection'}</summary>
      <p className="mt-2">{de ? 'Rocket League schließen. Im Spielordner TAGame\\Config\\TAStatsAPI.ini öffnen; wenn die Datei fehlt, DefaultStatsAPI.ini verwenden. In dieser Sektion die folgenden Werte setzen und das Spiel neu starten. Einen bereits höheren PacketSendRate-Wert beibehalten.' : 'Close Rocket League. Open TAGame\\Config\\TAStatsAPI.ini in the game folder; use DefaultStatsAPI.ini if absent. Set these values in this section and restart the game. Keep an existing higher PacketSendRate.'}</p>
      <pre className="mt-2 p-2 bg-black/20 rounded text-[10px] select-text">{'[TAGame.MatchStatsExporter_TA]\nPacketSendRate=2\nWebPort=49124'}</pre>
      <button type="button" className="mt-2 underline" onClick={() => void window.electronAPI?.openUrl?.('https://www.rocketleague.com/developer/stats-api')}>{de ? 'Offizielle Anleitung öffnen' : 'Open official instructions'} ↗</button>
    </details>
  </div>
}
