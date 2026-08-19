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
}

// Measure real display refresh rate via requestAnimationFrame
function useFPS() {
  const [fps, setFps] = useState(0)
  const frameCount = useRef(0)
  const lastTime = useRef(performance.now())
  const rafId = useRef<number>(0)

  useEffect(() => {
    const tick = () => {
      frameCount.current++
      const now = performance.now()
      if (now - lastTime.current >= 1000) {
        setFps(Math.round(frameCount.current * 1000 / (now - lastTime.current)))
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

const MetricPill = memo(function MetricPill({ label, value, unit = '' }: {
  label: string
  value: string | number
  unit?: string
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      minWidth: 64,
      height: 28,
      padding: '0 8px',
      borderRadius: 7,
      backgroundColor: 'rgba(13, 14, 20, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: 'none',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      contain: 'layout paint style',
      transform: 'translateZ(0)',
    }}>
      <span style={{
        fontSize: 8.5,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.45)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13,
        fontWeight: 800,
        color: '#ffffff',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}>
        {value}{unit}
      </span>
    </div>
  )
})

export function Performance({ metrics, config }: { metrics: MetricsData; config?: MetricsConfig }) {
  const fps = useFPS()
  const [time, setTime] = useState('')

  const cfg: MetricsConfig = config ?? { fps: true, cpu: true, gpu: true, ram: true, time: true }

  useEffect(() => {
    if (!cfg.time) return
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [cfg.time])

  const pills = [
    (cfg.fps ?? true) && <MetricPill key="fps" label="FPS" value={fps} />,
    (cfg.cpu ?? true) && <MetricPill key="cpu" label="CPU" value={metrics.cpu ?? 0} unit="%" />,
    (cfg.gpu ?? true) && <MetricPill key="gpu" label="GPU" value={metrics.gpu ?? 0} unit="%" />,
    (cfg.ram ?? true) && <MetricPill key="ram" label="RAM" value={metrics.ram ?? 0} unit="%" />,
    (cfg.time ?? true) && time && <MetricPill key="time" label="TIME" value={time} />,
  ].filter(Boolean)

  if (pills.length === 0) return null

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 4,
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      {pills}
    </div>
  )
}
