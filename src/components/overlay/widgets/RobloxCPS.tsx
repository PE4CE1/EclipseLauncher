import { memo, useEffect, useRef } from 'react'
import { translate } from '../../../i18n/translate'
import '../overlay-widgets.css'

export const RobloxCPS = memo(function RobloxCPS({ language = 'de' }: { language?: string }) {
  const left = useRef<HTMLSpanElement>(null)
  const right = useRef<HTMLSpanElement>(null)
  useEffect(() => window.electronAPI?.onCPSUpdate?.((data: { lmb: number; rmb: number }) => {
    for (const [element, value] of [[left.current, data.lmb], [right.current, data.rmb]] as const) {
      if (element && element.textContent !== String(value)) element.textContent = String(value)
    }
  }), [])
  return <div className="overlay-panel cps-hud">
    <div className="cps-hud__key"><span ref={left} className="cps-hud__value">0</span><span className="cps-hud__label">{translate(language, 'uiLeftMouse')}</span></div>
    <div className="cps-hud__key"><span ref={right} className="cps-hud__value">0</span><span className="cps-hud__label">{translate(language, 'uiRightMouse')}</span></div>
  </div>
})
