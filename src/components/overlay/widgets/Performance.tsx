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

export const Performance = memo(function Performance({ metrics, config }: { metrics: MetricsData; config?: MetricsConfig }) {
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

  const items = [
    (cfg.fps ?? true) && { label: 'FPS', value: String(fps), unit: '' },
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
      minWidth: 84,
      padding: '5px 10px',
      borderRadius: 8,
      backgroundColor: 'rgba(11, 12, 18, 0.94)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: 'none',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      userSelect: 'none',
      pointerEvents: 'none',
      contain: 'layout paint style',
      transform: 'translateZ(0)',
      gap: 3,
    }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            lineHeight: 1,
            padding: '2px 0',
          }}
        >
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255, 255, 255, 0.42)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            {item.label}
          </span>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
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
