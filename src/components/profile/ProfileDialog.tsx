import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ProfileDialog({ children, close }: { children: ReactNode; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null), closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('button,input')?.focus({ preventScroll: true })
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[data-app-select-menu][data-state="open"]')) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const nodes = [...panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]') || []].filter(node => node.getClientRects().length > 0)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (!first) return
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<div className="profile-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close() }}><div className="profile-dialog" ref={panel} role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">{children}</div></div>, document.body)
}
