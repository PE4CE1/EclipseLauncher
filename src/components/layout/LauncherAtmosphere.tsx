import { memo, useLayoutEffect, useRef } from 'react'
import { useLaunchOverlayCovered } from '../splash/LaunchOverlay'
import './launcher-atmosphere.css'

export const LauncherAtmosphere = memo(function LauncherAtmosphere({ active, enabled, focused }: { active: boolean; enabled: boolean; focused: boolean }) {
  const covered = useLaunchOverlayCovered()
  const root = useRef<HTMLDivElement>(null)
  const running = active && enabled && !covered
  useLayoutEffect(() => {
    root.current?.querySelectorAll('div').forEach(layer => layer.getAnimations().forEach(animation => {
      if (running) animation.play()
      else {
        // Chromium can defer a CSS pause in hidden windows until the next frame.
        // Commit the hold time immediately without scheduling animation frames.
        const time = animation.currentTime ?? 0
        animation.pause()
        animation.currentTime = time
      }
    }))
  }, [running])
  return (
    <div
      ref={root}
      className="launcher-atmosphere"
      aria-hidden="true"
      hidden={!enabled}
      data-visible={enabled && !covered || undefined}
      data-paused={!running || undefined}
      data-dimmed={!focused || undefined}
    >
      <div className="launcher-atmosphere__ember" />
      <div className="launcher-atmosphere__copper" />
    </div>
  )
})
