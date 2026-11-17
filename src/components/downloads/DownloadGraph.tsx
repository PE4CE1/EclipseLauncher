import { useId } from 'react'
import { useDownloadStore } from '../../store/downloadStore'
import { DOWNLOAD_HISTORY_MS, type DownloadSpeedSample } from '../../services/downloadHistory'

const empty: DownloadSpeedSample[] = []
export function DownloadGraph({ id, paused, de }: { id: string; paused: boolean; de: boolean }) {
  const history = useDownloadStore(state => state.speedHistory[id] || empty)
  const gradient = 'download-' + useId().replace(/:/g, '')
  const peak = Math.max(0, ...history.map(sample => sample.speed))
  const latest = history.at(-1), maximum = Math.max(1024, peak * 1.15)
  const span = Math.min(DOWNLOAD_HISTORY_MS, Math.max(10_000, Math.ceil(((latest?.at || 0) - (history[0]?.at || 0)) / 10_000) * 10_000))
  const points = history.map(sample => ({ x: 1000 * (1 - ((latest?.at || 0) - sample.at) / span), y: 144 - sample.speed / maximum * 124 }))
  const line = points.map((point,index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const area = points.length > 1 ? `${line} L${points.at(-1)!.x},144 L${points[0].x},144 Z` : ''
  const speed = paused ? 0 : latest?.speed || 0
  const format = (value: number) => value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB/s` : `${(value / 1024).toFixed(0)} KB/s`
  return <div className="download-graph" data-paused={paused || undefined}>
    <div className="download-graph-heading"><span><i />{de ? 'Netzwerk' : 'Network'}</span><strong>{format(speed)}</strong><span>{de ? 'Spitze' : 'Peak'} <b>{format(peak)}</b></span></div>
    <div className="download-graph-plot" role="img" aria-label={de ? `Downloadgeschwindigkeit: ${format(speed)}, Spitze ${format(peak)}. Geschwindigkeitsverlauf.` : `Download speed: ${format(speed)}, peak ${format(peak)}. Speed history.`}>
      <svg viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d7a27d" stopOpacity=".18" /><stop offset="1" stopColor="#d7a27d" stopOpacity="0" /></linearGradient></defs>
        {[20,61,102,144].map(y => <path key={y} d={`M0,${y} H1000`} className="download-graph-grid" />)}
        {area && <path d={area} fill={`url(#${gradient})`} />}
        {points.length > 1 && <path d={line} className="download-graph-line" />}
      </svg>
      {!points.length && <p>{de ? 'Der Verlauf erscheint, sobald Daten übertragen werden.' : 'The graph appears when data starts transferring.'}</p>}
    </div>
    <div className="download-graph-axis"><span>−{span / 1000} s</span><span>−{span / 2000} s</span><span>{de ? 'Jetzt' : 'Now'}</span></div>
  </div>
}
