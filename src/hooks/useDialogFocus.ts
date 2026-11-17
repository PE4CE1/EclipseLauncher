import { useLayoutEffect, useRef, type RefObject } from 'react'

export function useDialogFocus(root:RefObject<HTMLElement>, close:()=>void, enabled = true) {
  const callback = useRef(close)
  callback.current = close
  useLayoutEffect(() => {
    if (!enabled) return
    const previous = document.activeElement as HTMLElement|null
    root.current?.querySelector<HTMLElement>('[data-dialog-close]')?.focus({preventScroll:true})
    const keydown = (event:KeyboardEvent) => {
      if (document.querySelector('[data-app-select-menu][data-state="open"]')) return
      if (document.fullscreenElement) return
      if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();callback.current() }
      if (event.key !== 'Tab') return
      const nodes = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]') || [])].filter(node => node.getClientRects().length > 0)
      const first = nodes[0], last = nodes[nodes.length-1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus() }
    }
    window.addEventListener('keydown',keydown,true)
    return () => { window.removeEventListener('keydown',keydown,true);if (previous?.isConnected) previous.focus({preventScroll:true}) }
  },[enabled,root])
}
