import { useLayoutEffect, useRef, type HTMLAttributes } from 'react'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'

type SceneTransitionProps = HTMLAttributes<HTMLDivElement> & {
  sceneKey: string
  animateOnMount?: boolean
  enabled?: boolean
}

export function SceneTransition({ sceneKey, animateOnMount = false, enabled = true, ...props }: SceneTransitionProps) {
  const root = useRef<HTMLDivElement>(null)
  const previous = useRef<string>()
  const reducedMotion = useReducedMotionPreference()

  useLayoutEffect(() => {
    const changed = previous.current !== sceneKey
    const reveal = changed && (previous.current !== undefined || animateOnMount)
    previous.current = sceneKey
    if (!reveal || !enabled || reducedMotion || document.hidden || !document.hasFocus()) return

    // Commit the destination first; never retain or animate an outgoing page.
    const animation = root.current?.animate([{ opacity: .78 }, { opacity: 1 }], {
      duration: 220, easing: 'cubic-bezier(.22,.61,.36,1)',
    })
    const cancel = () => animation?.cancel()
    const visibility = () => { if (document.hidden) cancel() }
    window.addEventListener('blur', cancel, { once: true })
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', visibility)
      cancel()
    }
  }, [sceneKey, animateOnMount, enabled, reducedMotion])

  return <div {...props} ref={root} />
}
