import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference'
import { ECLIPSE_CALENDAR_SOURCE, upcomingSolarEclipses } from '../../services/solarEclipses'
import './eclipse-cinema.css'

export function EclipseCinemaModal() {
  const { language } = useTranslation(), de = language === 'de'
  const active = useUIStore(state => state.isEclipseCinemaActive)
  const close = useUIStore(state => state.closeEclipseCinema)
  const reduced = useReducedMotionPreference()
  const panel = useRef<HTMLElement>(null), closeButton = useRef<HTMLButtonElement>(null)
  const [now, setNow] = useState(() => new Date())
  const { next, total } = upcomingSolarEclipses(now)
  const locale = de ? 'de-DE' : 'en-GB'
  const date = (value: string) => new Date(value + 'T12:00:00Z').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const years = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)
  const types = de ? { total: 'Totale Sonnenfinsternis', annular: 'Ringförmige Sonnenfinsternis', partial: 'Partielle Sonnenfinsternis', hybrid: 'Hybride Sonnenfinsternis' } : { total: 'Total solar eclipse', annular: 'Annular solar eclipse', partial: 'Partial solar eclipse', hybrid: 'Hybrid solar eclipse' }
  useEffect(() => {
    if (!active) return
    setNow(new Date())
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus({ preventScroll: true })
    const timer = setInterval(() => setNow(new Date()), 60_000)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const controls = [...panel.current?.querySelectorAll<HTMLElement>('button,a[href]') || []]
        const index = controls.indexOf(document.activeElement as HTMLElement)
        event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
      }
    }
    const focus = () => setNow(new Date())
    window.addEventListener('keydown', key); window.addEventListener('focus', focus)
    return () => { clearInterval(timer); window.removeEventListener('keydown', key); window.removeEventListener('focus', focus); previous?.focus?.({ preventScroll: true }) }
  }, [active, close])
  const openSource = () => {
    if (window.electronAPI?.openUrl) void window.electronAPI.openUrl(ECLIPSE_CALENDAR_SOURCE).catch(() => {})
    else window.open(ECLIPSE_CALENDAR_SOURCE, '_blank', 'noopener,noreferrer')
  }
  return createPortal(<AnimatePresence>
    {active && <motion.div key="eclipse-countdown" className="eclipse-countdown-layer" data-eclipse-cinema data-motion={reduced ? 'reduced' : 'full'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.15 : 0.24 }} onPointerDown={event => { if (event.target === event.currentTarget) close() }}>
      <motion.section ref={panel} className="eclipse-countdown" role="dialog" aria-modal="true" aria-labelledby="eclipse-countdown-title" initial={{ opacity: 0, y: reduced ? 0 : -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -3 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
        <header><div className="eclipse-countdown-emblem" aria-hidden="true" /><div><h2 id="eclipse-countdown-title">{de ? 'Die nächste Eclipse' : 'The next eclipse'}</h2><p>{de ? 'Sonnenfinsternisse weltweit' : 'Solar eclipses worldwide'}</p></div><button ref={closeButton} type="button" className="eclipse-countdown-close" onClick={close} aria-label={de ? 'Schließen' : 'Close'}><X size={15} /></button></header>
        {next ? <>
          <div className="eclipse-countdown-event"><span>{types[next.type]}</span><time dateTime={next.date}>{date(next.date)}</time></div>
          <div className="eclipse-countdown-number"><strong>{next.days.toLocaleString(locale)}</strong><div><span>{next.days === 0 ? (de ? 'heute' : 'today') : de ? 'Tage bis zur Eclipse' : 'days until the eclipse'}</span><small>≈ {years(next.years)} {de ? 'Jahre' : 'years'}</small></div></div>
          {total && total.date !== next.date && <div className="eclipse-countdown-total"><span>{de ? 'Nächste totale Sonnenfinsternis' : 'Next total solar eclipse'}</span><strong>{date(total.date)}</strong><small>≈ {years(total.years)} {de ? 'Jahre' : 'years'}</small></div>}
        </> : <p className="eclipse-countdown-empty">{de ? 'Der gespeicherte Kalender endet 2040. Aktuelle Termine findest du bei NASA.' : 'The saved calendar ends in 2040. Visit NASA for current dates.'}</p>}
        <footer><span>{de ? 'Die Sichtbarkeit hängt vom Standort ab.' : 'Visibility depends on your location.'}</span><button type="button" onClick={openSource}>NASA / GSFC <ArrowUpRight size={12} /></button></footer>
      </motion.section>
    </motion.div>}
  </AnimatePresence>, document.body)
}
