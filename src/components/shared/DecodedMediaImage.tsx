import { useEffect, useRef, useState } from 'react'

/** Keep the decoded picture visible until the replacement is ready to paint. */
export function DecodedMediaImage({ src, preview, alt, className = '' }: { src?: string; preview?: string; alt: string; className?: string }) {
  const [visible, setVisible] = useState<string | undefined>(preview)
  const current = useRef(src)
  current.current = src
  useEffect(() => {
    let active = true
    if (!src) { setVisible(preview); return }
    const image = new Image()
    image.decoding = 'async'
    image.referrerPolicy = 'no-referrer'
    image.onload = () => {
      void image.decode().catch(() => {}).then(() => { if (active && current.current === src) setVisible(src) })
    }
    image.onerror = () => { if (active) setVisible(preview) }
    image.src = src
    return () => { active = false; image.onload = null; image.onerror = null }
  }, [src, preview])
  return visible ? <img data-lightbox-image src={visible} alt={alt} className={className} decoding="sync" referrerPolicy="no-referrer" onClick={event => event.stopPropagation()} /> : <div role="status" className="text-white/50 text-sm">{alt}</div>
}
