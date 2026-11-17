import { useEffect, useRef, useState } from 'react'

/** Do not start secondary Home feeds until their section is near the viewport. */
export function useHomeVisible() {
  const ref = useRef<HTMLElement>(null), [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current || visible) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } }, { rootMargin: '240px 0px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [visible])
  return { ref, visible }
}
