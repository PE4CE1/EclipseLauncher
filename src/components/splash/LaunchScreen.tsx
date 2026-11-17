import { useTranslation } from '../../hooks/useTranslation'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LAUNCH_EXIT_MS } from './launchLifecycle'
import { APP_INTRO_VERSION } from '../../services/appVersion'
import './launch-screen.css'

const launchStyle = { '--launch-exit-duration': `${LAUNCH_EXIT_MS}ms` } as CSSProperties

export interface LaunchScreenProps {
  message?: string
  children?: ReactNode
  className?: string
  showLoader?: boolean
  closing?: boolean
}

function Atmosphere() {
  return (
    <div className="launch-atmosphere" data-renderer="css" aria-hidden="true">
      <div className="launch-atmosphere__scene">
        <div className="launch-atmosphere__flow launch-atmosphere__flow--amber" />
        <div className="launch-atmosphere__flow launch-atmosphere__flow--crimson" />
        <div className="launch-atmosphere__aura" />
        <div className="launch-atmosphere__silk" />
        <div className="launch-atmosphere__version" style={APP_INTRO_VERSION.length > 3 ? { fontSize: 'min(65vh, 38vw)' } : undefined}>
          {Array.from(APP_INTRO_VERSION, (glyph, index) => <span key={index} className={`launch-atmosphere__glyph launch-atmosphere__glyph--${glyph === '.' ? 'dot' : index === 0 ? 'two' : 'zero'}`}>{glyph}</span>)}
        </div>
        <div className="launch-atmosphere__ribbon launch-atmosphere__ribbon--near" />
        <div className="launch-atmosphere__ribbon launch-atmosphere__ribbon--far" />
        <div className="launch-atmosphere__focus" />
      </div>
      <div className="launch-atmosphere__vignette" />
    </div>
  )
}

export function EclipseLoader() {
  return (
    <div className="eclipse-loader" aria-hidden="true">
      <div className="eclipse-loader__halo" />
      <div className="eclipse-loader__orbit"><i /></div>
      <div className="eclipse-loader__corona" />
      <div className="eclipse-loader__moon" />
      <div className="eclipse-loader__diamond" />
    </div>
  )
}

function WindowControls() {
  const { t } = useTranslation()
  if (!window.electronAPI) return null
  return (
    <div className="launch-window-controls">
      <button aria-label={t('uiMinimize')} onClick={() => window.electronAPI?.minimizeWindow()}><svg viewBox="0 0 16 16"><path d="M3 8h10" /></svg></button>
      <button aria-label={t('uiMaximize')} onClick={() => window.electronAPI?.maximizeWindow()}><svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="0.5" /></svg></button>
      <button aria-label={t('close')} className="launch-window-controls__close" onClick={() => window.electronAPI?.closeWindow()}><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
    </div>
  )
}

export function LaunchScreen({ message, children, className = '', showLoader = true, closing = false }: LaunchScreenProps) {
  const { t } = useTranslation()
  const root = useRef<HTMLElement>(null)
  const paused = useRef(new Set<Animation>())
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (hidden) {
      root.current?.getAnimations({ subtree: true }).forEach(animation => {
        if (animation.playState === 'finished' || animation.playState === 'idle') return
        const time = animation.currentTime ?? 0
        animation.pause()
        // Commit the hold time even when Chromium has deferred its pending
        // CSS pause until the next frame of a hidden/software-rendered window.
        animation.currentTime = time
        paused.current.add(animation)
      })
    } else {
      paused.current.forEach(animation => {
        const target = (animation.effect as KeyframeEffect | null)?.target
        if (!target?.isConnected) return
        const style = getComputedStyle(target)
        if (style.animationName !== 'none' && style.animationPlayState === 'running') animation.play()
      })
      paused.current.clear()
    }
  }, [hidden])
  return (
    <section ref={root} className={`launch-screen ${className}`} style={launchStyle} data-closing={closing || undefined} data-paused={hidden || undefined} aria-label={t('uiLauncherLoading')}>
      <Atmosphere />
      <header className="launch-screen__header"><span className="launch-screen__edition">ECLIPSE <span>·</span> {APP_INTRO_VERSION}</span><WindowControls /></header>
      <div className="launch-screen__center launch-screen__center--interactive">
        <div className="launch-wordmark" aria-label="Eclipse Launcher">
          <h1>ECLIPSE</h1>
          <div className="launch-wordmark__sub"><span />LAUNCHER<span /></div>
        </div>
        {showLoader && <EclipseLoader />}
        <p className="launch-screen__status" role="status">{message ?? t('uiLaunchMessage')}</p>
        <div className="launch-screen__actions">{children}</div>
      </div>
      <footer className="launch-screen__footer"><span className="launch-screen__release">{t('uiLaunchOrbit')}<span className="launch-screen__release-line" />{APP_INTRO_VERSION}</span><span className="launch-screen__signature">{t('uiLaunchTagline')}</span></footer>
    </section>
  )
}
