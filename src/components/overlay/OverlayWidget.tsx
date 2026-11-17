import { useLayoutEffect, useRef, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react'

export function OverlayWidget({ id, xPct, yPct, centered = false, style, onMouseDown, children }: {
  id: string; xPct: number; yPct: number; centered?: boolean
  style?: CSSProperties; onMouseDown?: MouseEventHandler<HTMLDivElement>; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || centered) return
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      element.style.setProperty('--overlay-widget-width', `${bounds.width}px`)
      element.style.setProperty('--overlay-widget-height', `${bounds.height}px`)
    }
    // Measure before paint; update only when a widget changes size, never per frame.
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [centered])
  return <div ref={ref} id={id} className="overlay-widget" onMouseDown={onMouseDown} style={{
    position: 'absolute', width: 'max-content',
    left: centered ? '50%' : `clamp(0px, ${xPct * 100}%, calc(100% - var(--overlay-widget-width, 0px)))`,
    top: centered ? '50%' : `clamp(0px, ${yPct * 100}%, calc(100% - var(--overlay-widget-height, 0px)))`,
    ...style,
  }}>{children}</div>
}
