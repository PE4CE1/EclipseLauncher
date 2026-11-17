import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './smooth-collapse.css'

export function SmoothCollapse({ open, children, className = '' }: { open: boolean; children: ReactNode | (() => ReactNode); className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const [retained, setRetained] = useState(open)
  useLayoutEffect(() => {
    if (root.current) root.current.inert = !open
    if (open) { setRetained(true); return }
    // Also release the content if a hidden window defers transitionend.
    const timer = setTimeout(() => setRetained(false), 310)
    return () => clearTimeout(timer)
  }, [open])
  return <div
    ref={root}
    className="smooth-collapse"
    data-open={open || undefined}
    aria-hidden={!open}
    onTransitionEnd={event => {
      if (!open && event.target === event.currentTarget && event.propertyName === 'grid-template-rows') setRetained(false)
    }}
  >
    <div className="smooth-collapse__clip">
      {(open || retained) && <div className={className}>{typeof children === 'function' ? children() : children}</div>}
    </div>
  </div>
}
