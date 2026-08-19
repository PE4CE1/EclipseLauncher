import { useEffect, useRef, useState, memo } from 'react'

type MetricsConfig = {
  fps?: boolean
  cpu?: boolean
  gpu?: boolean
  ram?: boolean
  ping?: boolean
  time?: boolean
}

type MetricsData = {
  cpu: number
  gpu: number
  ram: number
  ramMB: number
  totalMB: number
  idleTime: number
  gameFps?: number
}

// Measure display / game frame rate with sub-millisecond precision
function useFPS() {
  const [fps, setFps] = useState(0)
  const frameCount = useRef(0)
  const lastTime = useRef(performance.now())
  const rafId = useRef<number>(0)

  useEffect(() => {
    const tick = (now: number) => {
      frameCount.current++
      const delta = now - lastTime.current
      if (delta >= 1000) {
        setFps(Math.round((frameCount.current * 1000) / delta))
        frameCount.current = 0
        lastTime.current = now
      }
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [])

  return fps
}

export const Performance = memo(function Performance({ metrics, config }: { metrics: MetricsData; config?: MetricsConfig }) {
  const displayFps = useFPS()
  const [time, setTime] = useState('')

  const cfg: MetricsConfig = config ?? { fps: true, cpu: true, gpu: true, ram: true, time: true }

  useEffect(() => {
    if (!cfg.time) return
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [cfg.time])

  const effectiveFps = metrics.gameFps && metrics.gameFps > 0 ? metrics.gameFps : displayFps

  const items = [
    (cfg.fps ?? true) && { label: 'FPS', value: String(effectiveFps), unit: '' },
    (cfg.cpu ?? true) && { label: 'CPU', value: String(metrics.cpu ?? 0), unit: '%' },
    (cfg.gpu ?? true) && { label: 'GPU', value: String(metrics.gpu ?? 0), unit: '%' },
    (cfg.ram ?? true) && { label: 'RAM', value: String(metrics.ram ?? 0), unit: '%' },
    (cfg.time ?? true) && time && { label: 'TIME', value: time, unit: '' },
  ].filter(Boolean) as { label: string; value: string; unit: string }[]

  if (items.length === 0) return null

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      minWidth: 78,
      padding: '4px 8px',
      borderRadius: 7,
      backgroundColor: 'rgba(10, 12, 18, 0.92)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
      userSelect: 'none',
      pointerEvents: 'none',
      contain: 'layout paint style',
      transform: 'translateZ(0)',
    }}>
      {items.map((item, idx) => (
        <div
          key={item.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            height: 18,
            borderBottom: idx < items.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none',
          }}
        >
          <span style={{
            fontSize: 8.5,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.40)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}>
            {item.label}
          </span>
          <span style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: '#ffffff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em',
          }}>
            {item.value}{item.unit}
          </span>
        </div>
      ))}
    </div>
  )
})
