import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { LaunchScreen, type LaunchScreenProps } from './LaunchScreen'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'
import { LAUNCH_EXIT_MS, LAUNCH_EXIT_REDUCED_MS } from './launchLifecycle'
import { useTranslation } from '../../hooks/useTranslation'

interface OverlayState { owner: symbol; content: LaunchScreenProps; closing?: boolean }
interface OverlayControls {
  show: (owner: symbol, content: LaunchScreenProps) => void
  hide: (owner: symbol) => void
}
const OverlayContext = createContext<OverlayControls | null>(null)
const CoveredContext = createContext(false)

export function useLaunchOverlayCovered(): boolean {
  return useContext(CoveredContext)
}

// One owner and one DOM surface from bootstrap through library preparation.
// Moving progress between components must never restart the animated background.
export function LaunchOverlayProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotionPreference()
  const [state, setState] = useState<OverlayState | null>(() => ({
    owner: Symbol('bootstrap'), content: { className: 'splash-screen-overlay' },
  }))
  useEffect(() => {
    if (!state?.closing) return
    const timer = setTimeout(() => setState(current => current === state ? null : current), reducedMotion || document.hidden ? LAUNCH_EXIT_REDUCED_MS : LAUNCH_EXIT_MS + 100)
    return () => clearTimeout(timer)
  }, [state, reducedMotion])
  const controls = useMemo<OverlayControls>(() => ({
    show: (owner, content) => setState({ owner, content }),
    hide: owner => setState(current => current?.owner === owner ? { ...current, closing: true } : current),
  }), [])
  return (
    <OverlayContext.Provider value={controls}>
      <CoveredContext.Provider value={Boolean(state && !state.closing)}>{children}</CoveredContext.Provider>
      {createPortal(state ? <LaunchScreen {...state.content} message={state.content.message ?? t('uiStarting')} closing={state.closing} /> : null, document.body)}
    </OverlayContext.Provider>
  )
}

export function useLaunchOverlay(content: LaunchScreenProps): void {
  const controls = useContext(OverlayContext)
  if (!controls) throw new Error('Launch overlay provider missing')
  const owner = useRef(Symbol('launch-screen'))
  const show = useCallback(() => controls.show(owner.current, content), [controls, content])
  useLayoutEffect(show, [show])
  useLayoutEffect(() => () => controls.hide(owner.current), [controls])
}
