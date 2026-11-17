import { memo, useEffect, useState } from 'react'
import { translate } from '../../../i18n/translate'
import robloxLogoImg from '../../../assets/Roblox-Logo-Icon.png'
import '../overlay-widgets.css'

function duration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  return [ ...(hours ? [hours] : []), Math.floor(whole % 3600 / 60), whole % 60 ]
    .map(value => String(value).padStart(2, '0')).join(':')
}

export const RobloxTimer = memo(function RobloxTimer({ startTime, idleTime = 0, antiAfkEnabled = false, language = 'de' }: {
  startTime: number; idleTime?: number; antiAfkEnabled?: boolean; language?: string
}) {
  const [session, setSession] = useState(() => duration((Date.now() - startTime) / 1000))
  useEffect(() => {
    const tick = () => setSession(duration((Date.now() - startTime) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [startTime])
  const remaining = Math.max(0, 20 * 60 - idleTime)
  return <div className="overlay-panel session-hud" data-warning={remaining < 120 || undefined}>
    <img src={robloxLogoImg} width={15} height={15} alt="Roblox" />
    <div className="session-hud__stat"><span className="session-hud__value">{session}</span><span className="session-hud__label">{translate(language, 'uiPlaySession')}</span></div>
    <div className="session-hud__stat"><span className="session-hud__value session-hud__afk">{duration(remaining)}</span><span className="session-hud__label">AFK{antiAfkEnabled && <span className="session-hud__active" title={translate(language, 'uiAfkActive')} />}</span></div>
  </div>
})
