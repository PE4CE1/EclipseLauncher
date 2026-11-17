import { useEffect, useRef, useState } from 'react'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'
import { safeProfileMedia } from '../../services/profileModel'
import { ProfileBannerArt, profileBannerPreset } from './ProfileBannerArt'

export function ProfileMedia({ src, className = '', position = 44 }: { src?: string | null; className?: string; position?: number }) {
  const url = safeProfileMedia(src), video = useRef<HTMLVideoElement>(null), reduced = useReducedMotionPreference()
  const [failed, setFailed] = useState<string>()
  const isVideo = !!url && /\.(mp4|webm)(?:[?#]|$)/i.test(url)
  useEffect(() => {
    const element = video.current
    if (!element) return
    const update = () => {
      if (reduced || document.hidden || !document.hasFocus()) element.pause()
      else void element.play().catch(() => {})
    }
    update()
    for (const event of ['focus', 'blur', 'visibilitychange']) window.addEventListener(event, update)
    return () => { element.pause(); for (const event of ['focus', 'blur', 'visibilitychange']) window.removeEventListener(event, update) }
  }, [url, reduced, isVideo])
  if (!url || failed === url) return <ProfileBannerArt preset={profileBannerPreset(src)} className={className}/>
  const style = { objectPosition: `center ${Math.max(0, Math.min(100, position))}%` }
  return isVideo ? <video ref={video} key={url} className={className} style={style} src={url} muted loop playsInline preload="metadata" onError={() => setFailed(url)} aria-hidden="true" />
    : <img src={url} className={className} style={style} alt="" decoding="async" onError={() => setFailed(url)} />
}
