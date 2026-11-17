import { memo, useEffect, useState, type CSSProperties } from 'react'
import '../overlay-widgets.css'

export type MetricsConfig = {
  fps?: boolean; cpu?: boolean; gpu?: boolean; ram?: boolean; ping?: boolean; time?: boolean
  layout?: 'vertical' | 'horizontal'; scale?: number
  background?: 'glass' | 'clear' | 'solid'
  mirrored?: boolean
}
export type MetricsData = {
  cpu?: number; gpu?: number; ram?: number; ramMB?: number; totalMB?: number; idleTime: number
  gameFps?: number; frameTimeMs?: number; gameFpsStatus?: string; gameFpsPid?: number; gameFpsSource?: string
}

export const Performance = memo(function Performance({ metrics, config, editMode = false, language = 'de' }: {
  metrics: MetricsData; config?: MetricsConfig; editMode?: boolean; language?: string
}) {
  const cfg = config ?? {}
  const de = language === 'de'
  const formatTime = () => new Date().toLocaleTimeString(de ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const [time, setTime] = useState(formatTime)
  useEffect(() => {
    if (cfg.time === false) return
    const tick = () => setTime(formatTime())
    tick()
    let interval: ReturnType<typeof setInterval> | undefined
    const align = setTimeout(() => { tick(); interval = setInterval(tick, 60000) }, 60000 - Date.now() % 60000)
    return () => { clearTimeout(align); if (interval) clearInterval(interval) }
  }, [cfg.time, de])

  const horizontal = cfg.layout === 'horizontal'
  const surface = cfg.background === 'clear' || cfg.background === 'solid' ? cfg.background : 'glass'
  const rawScale = cfg.scale ?? 100
  const normalized = Number.isFinite(rawScale) ? (rawScale > 3 ? rawScale / 100 : rawScale) : 1
  const scale = Math.max(.5, Math.min(2, normalized))
  const hasFps = Number.isFinite(metrics.gameFps) && metrics.gameFps! > 0
  const denied = metrics.gameFpsStatus === 'permission-required'
  const hint = denied
    ? (de ? 'FPS-Zugriff in Einstellungen → Gameplay-Overlay aktivieren.' : 'Enable FPS access in Settings → Gameplay Overlay.')
    : metrics.gameFpsStatus === 'unavailable'
      ? (de ? 'FPS-Helfer nicht verfügbar.' : 'FPS helper unavailable.')
      : metrics.gameFpsStatus === 'no-frames'
        ? (de ? 'Das Spiel liefert momentan keine Bilddaten.' : 'The game is not currently presenting frames.') : ''
  const percentage = (label: string, value?: number) => ({ label,
    value: Number.isFinite(value) ? String(Math.round(Math.max(0, Math.min(100, value!)))) : '—',
    unit: Number.isFinite(value) ? '%' : '', hint: '', accent: false })
  const rows = [
    cfg.fps !== false && { label: 'FPS', value: hasFps ? String(Math.round(metrics.gameFps!)) : denied ? (de ? 'Zugriff' : 'Access') : '—',
      unit: '', hint, accent: hasFps },
    cfg.cpu !== false && percentage('CPU', metrics.cpu),
    cfg.gpu !== false && percentage('GPU', metrics.gpu),
    cfg.ram !== false && percentage('RAM', metrics.ram),
    cfg.time !== false && { label: de ? 'UHR' : 'TIME', value: time, unit: '', hint: '', accent: false },
  ].filter((row): row is { label: string; value: string; unit: string; hint: string; accent: boolean } => !!row)
  if (!rows.length) return null

  return <div className={`overlay-panel performance-hud${horizontal ? ' performance-hud--horizontal' : ''}`}
    style={{ '--performance-scale': scale, outline: editMode ? '1px dashed rgba(255,255,255,.55)' : undefined, outlineOffset: 3 } as CSSProperties}
    data-surface={surface} data-mirrored={cfg.mirrored||undefined} data-fps-status={cfg.fps !== false ? metrics.gameFpsStatus : undefined} aria-label={de ? 'Leistungsanzeige' : 'Performance monitor'}>
    <div className="performance-hud__heading" aria-hidden="true"><span />ECLIPSE</div>
    <div className="performance-hud__stats">
      {rows.map(row => <div key={row.label} title={row.hint || undefined}
        className={`performance-hud__stat${row.label === 'FPS' ? ' performance-hud__stat--fps' : ''}`}
        data-metric={row.label === 'UHR' ? 'TIME' : row.label}>
        <span className="performance-hud__label">{row.label}</span>
        <span className="performance-hud__value" data-accent={row.accent || undefined} data-unavailable={row.label === 'FPS' && denied && !hasFps || undefined}>
          {row.value}{row.unit && <span className="performance-hud__unit">{row.unit}</span>}
        </span>
      </div>)}
    </div>
  </div>
})
