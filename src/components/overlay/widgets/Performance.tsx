import { useEffect, useRef, useState, memo } from 'react'

export type MetricsConfig = {
  fps?: boolean
  cpu?: boolean
  gpu?: boolean
  ram?: boolean
  ping?: boolean
  time?: boolean
  layout?: 'vertical' | 'horizontal'
  scale?: number
}

export type MetricsData = {
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

export const Performance = memo(function Performance({ 
  metrics, 
  config,
  editMode = false,
}: { 
  metrics: MetricsData; 
  config?: MetricsConfig;
  editMode?: boolean;
}) {
  const displayFps = useFPS()
  const [time, setTime] = useState('')

  const cfg: MetricsConfig = config ?? { fps: true, cpu: true, gpu: true, ram: true, time: true, layout: 'vertical' }
  const isHorizontal = cfg.layout === 'horizontal'
  const rawScale = cfg.scale ?? 100
  const normalizedScale = typeof rawScale === 'number' ? (rawScale > 3 ? rawScale / 100 : rawScale) : 1
  const finalScale = normalizedScale * 1.15

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

  // Horizontal flat bar layout
  if (isHorizontal) {
    return (
      <div style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '3px 7px',
        borderRadius: 6,
        backgroundColor: 'rgba(10, 12, 18, 0.88)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        outline: editMode ? '1.5px dashed rgba(255, 255, 255, 0.7)' : 'none',
        outlineOffset: '3px',
        boxShadow: editMode ? '0 0 12px rgba(255, 255, 255, 0.15), 0 4px 16px rgba(0, 0, 0, 0.25)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
        userSelect: 'none',
        pointerEvents: 'none',
        contain: 'layout paint style',
        transform: `scale(${finalScale}) translateZ(0)`,
        transformOrigin: 'top left',
        transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease',
      }}>
        {items.map((item, idx) => (
          <div key={item.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {idx > 0 && (
              <div style={{
                width: 1,
                height: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                margin: '0 7px',
              }} />
            )}
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontSize: 8.5,
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.42)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {item.label}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#ffffff',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.01em',
              }}>
                {item.value}
                {item.unit && (
                  <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255, 255, 255, 0.55)', marginLeft: 0.5 }}>
                    {item.unit}
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Vertical compact card layout
  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      minWidth: 76,
      padding: '4px 8px',
      borderRadius: 7,
      backgroundColor: 'rgba(10, 12, 18, 0.88)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      outline: editMode ? '1.5px dashed rgba(255, 255, 255, 0.7)' : 'none',
      outlineOffset: '3px',
      boxShadow: editMode ? '0 0 12px rgba(255, 255, 255, 0.15), 0 4px 16px rgba(0, 0, 0, 0.25)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
      userSelect: 'none',
      pointerEvents: 'none',
      contain: 'layout paint style',
      transform: `scale(${finalScale}) translateZ(0)`,
      transformOrigin: 'top left',
      transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease',
    }}>
      {items.map((item, idx) => (
        <div
          key={item.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            height: 17,
            borderBottom: idx < items.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
          }}
        >
          <span style={{
            fontSize: 8.5,
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.42)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            {item.label}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#ffffff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em',
          }}>
            {item.value}
            {item.unit && (
              <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255, 255, 255, 0.55)', marginLeft: 0.5 }}>
                {item.unit}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
})
