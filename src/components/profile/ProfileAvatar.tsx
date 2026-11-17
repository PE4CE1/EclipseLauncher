import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'
import { safeProfileMedia } from '../../services/profileModel'
import { steamFrameImage } from '../../services/steamProfileAppearance'
import './profile-avatar.css'

export function ProfileAvatar({ avatar, name, frameClass = '', steamFrame, steamFrameStatic, online, playing, small = false, variant }: {
  avatar?: string; name: string; frameClass?: string; steamFrame?: string | null; steamFrameStatic?: string | null; online?: boolean; playing?: boolean; small?: boolean; variant?: 'sidebar'
}) {
  const reduced = useReducedMotionPreference()
  const [focused, setFocused] = useState(() => !document.hidden && document.hasFocus())
  const [failedFrame, setFailedFrame] = useState<string>(), [failedAvatar, setFailedAvatar] = useState<string>()
  useEffect(() => {
    const update = () => setFocused(!document.hidden && document.hasFocus())
    window.addEventListener('focus', update); window.addEventListener('blur', update); document.addEventListener('visibilitychange', update)
    return () => { window.removeEventListener('focus', update); window.removeEventListener('blur', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  const frame = steamFrameImage(steamFrame), still = steamFrameImage(steamFrameStatic)
  const source = !focused || reduced ? still || frame : frame
  const avatarUrl = safeProfileMedia(avatar)
  const visibleFrame = source && source !== failedFrame
  return <div className={`profile-avatar ${frameClass}${small ? ' profile-avatar-small' : ''}`} data-steam-frame={visibleFrame ? true : undefined} data-size={variant}>
    <div><User className="profile-avatar-fallback" size={variant === 'sidebar' ? 20 : small ? 22 : 36} aria-hidden="true"/>{avatarUrl && avatarUrl !== failedAvatar && <img className="profile-avatar-image" src={avatarUrl} alt={name} onError={() => setFailedAvatar(avatarUrl)}/>}</div>
    {visibleFrame && <img className="profile-steam-frame" src={source} alt="" aria-hidden="true" onError={() => setFailedFrame(source)}/>}
    {!small && <i data-online={online || undefined} data-playing={playing || undefined}/>}
  </div>
}
