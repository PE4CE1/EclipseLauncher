import { useEffect, useRef, useState } from 'react'

type MetricsConfig = {
  fps?: boolean; cpu?: boolean; ram?: boolean; gpu?: boolean; ping?: boolean; time?: boolean
}
type MetricsData = { cpu: number; gpu: number; ram: number; ramMB: number; totalMB: number; idleTime: number }

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

function MetricPill({ label, value, color, unit = '' }: {
  label: string; value: string | number; color: string; unit?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'rgba(0,0,0,0.58)',
      backdropFilter: 'blur(14px)',
      border: `1px solid ${color}40`,
      borderRadius: 999,
      padding: '4px 10px',
      whiteSpace: 'nowrap',
      boxShadow: `0 0 8px ${color}15`,
    }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: `${color}aa`, letterSpacing: '0.07em', fontFamily: 'Inter, sans-serif' }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace', letterSpacing: '0.03em' }}>
        {value}{unit}
      </span>
    </div>
  )
}

export function Performance({ metrics, config }: { metrics: MetricsData; config?: MetricsConfig }) {
  const fps = useFPS()
  const [time, setTime] = useState('')

  const cfg: MetricsConfig = config ?? { fps: true, cpu: true, ram: true, time: true }

  useEffect(() => {
    if (!cfg.time) return
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [cfg.time])

  const fpsColor = fps >= 100 ? '#4ade80' : fps >= 60 ? '#facc15' : '#f87171'
  const cpuColor = metrics.cpu > 80 ? '#f87171' : metrics.cpu > 50 ? '#facc15' : '#60a5fa'
  const ramColor = metrics.ram > 80 ? '#f87171' : metrics.ram > 60 ? '#facc15' : '#a78bfa'

  const pills = [
    cfg.fps && <MetricPill key="fps" label="FPS" value={fps} color={fpsColor} />,
    cfg.cpu && <MetricPill key="cpu" label="CPU" value={metrics.cpu} color={cpuColor} unit="%" />,
    cfg.ram && <MetricPill key="ram" label="RAM" value={metrics.ram} color={ramColor} unit="%" />,
    cfg.time && time && <MetricPill key="time" label="TIME" value={time} color="#ffffff" />,
  ].filter(Boolean)

  if (pills.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none' }}>
      {pills}
    </div>
  )
}
