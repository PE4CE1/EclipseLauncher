import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react'
import './select.css'

export const DropdownSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { open: boolean }>(function DropdownSurface({ open, children, className = '', style, ...props }, forwarded) {
  const [present, setPresent] = useState(open), element = useRef<HTMLDivElement | null>(null), lastStyle = useRef(style)
  if (open && style) lastStyle.current = style
  useLayoutEffect(() => {
    if (open) setPresent(true)
    if (element.current) {
      if (!open && element.current.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      element.current.inert = !open
    }
  }, [open, present])
  useEffect(() => { if (open || !present) return; const timer = setTimeout(() => setPresent(false), 140); return () => clearTimeout(timer) }, [open, present])
  if (!present) return null
  return <div {...props} ref={node => { element.current = node; if (typeof forwarded === 'function') forwarded(node); else if (forwarded) forwarded.current = node }}
    data-state={open ? 'open' : 'closing'} className={`${className} app-dropdown-surface app-dropdown-animated`} style={open ? style : lastStyle.current}>{children}</div>
})
