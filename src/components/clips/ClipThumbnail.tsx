import { useEffect, useRef, useState } from 'react'

const subscribers = new Map<Element, (visible: boolean) => void>()
let observer: IntersectionObserver | undefined

/** Only mounted pictures near the viewport keep decoded thumbnail resources. */
export function ClipThumbnail({ src, onError }: { src: string; onError: () => void }) {
  const root = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const element = root.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) subscribers.get(entry.target)?.(entry.isIntersecting)
    }, { rootMargin: '600px 0px' })
    subscribers.set(element, setVisible)
    observer.observe(element)
    return () => {
      observer?.unobserve(element); subscribers.delete(element)
      if (!subscribers.size) { observer?.disconnect(); observer = undefined }
    }
  }, [])
  return <span ref={root} className="clip-library-thumbnail" style={{ position: 'absolute', inset: 0 }}>
    {visible && <img src={src} alt="" decoding="async" onError={onError}/>}
  </span>
}
