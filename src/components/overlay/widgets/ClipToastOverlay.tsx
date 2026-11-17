import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Film } from 'lucide-react'
import { translations, type Language } from '../../../i18n/translations'
import './clip-toast.css'

export interface ClipToastData {
  id: number
  title: string
  gameTitle: string
  duration: number
  status?: 'saving' | 'saved' | 'error'
  thumbnailUrl?: string
  language?: string
  color?: string
}

interface ClipToastOverlayProps { toast: ClipToastData; onDismiss: () => void; language?: string; color?: string }
const DISPLAY_MS = 4500
const EXIT_MS = 560

function savedPreferences(): { language?: string; color?: string } {
  try {
    const settings = JSON.parse(localStorage.getItem('gamehub-store') || '{}')?.state?.settings
    return { language: settings?.language || localStorage.getItem('i18nextLng') || undefined, color: settings?.overlayClipToastColor }
  } catch { return {} }
}
function accent(value: unknown): string {
  if (typeof value !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value.trim())) return '#ff6600'
  const hex = value.trim().toLowerCase()
  return hex.length === 4 ? '#' + [...hex.slice(1)].map(char => char + char).join('') : hex
}

export function ClipToastOverlay({ toast, onDismiss, language, color }: ClipToastOverlayProps) {
  const [exiting, setExiting] = useState(false)
  const [failedImage, setFailedImage] = useState<string>()
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss
  const preferences = useMemo(() => (toast.language || language) && (toast.color || color) ? {} : savedPreferences(), [toast.id, toast.language, toast.color, language, color])
  const requestedLanguage = toast.language || language || preferences.language || navigator.language
  const lang: Language = typeof requestedLanguage === 'string' && requestedLanguage.toLowerCase().startsWith('de') ? 'de' : 'en'
  const activeColor = accent(toast.color || color || preferences.color)
  const image = toast.thumbnailUrl && toast.thumbnailUrl !== failedImage ? toast.thumbnailUrl : undefined
  const duration = Number.isFinite(toast.duration) && toast.duration > 0 ? Math.round(toast.duration) : 0

  useEffect(() => {
    setExiting(false)
    let finish: ReturnType<typeof setTimeout> | undefined
    const exit = setTimeout(() => {
      setExiting(true)
      finish = setTimeout(() => dismiss.current(), EXIT_MS)
    }, DISPLAY_MS)
    return () => { clearTimeout(exit); clearTimeout(finish) }
  }, [toast.id, toast.status])

  return <div id="eclipse-clip-toast" role="status" aria-live="polite" aria-atomic="true"
    className={`eclipse-clip-toast ${exiting ? 'is-exiting' : ''}`} data-clip-toast-id={toast.id}
    style={{ '--clip-toast-accent': activeColor, '--clip-toast-tint': activeColor + '14', '--clip-toast-duration': DISPLAY_MS + 'ms', '--clip-toast-exit': EXIT_MS + 'ms' } as CSSProperties}>
    <div className="clip-toast-sweep" aria-hidden="true" />
    <div className="clip-toast-art" aria-hidden="true">
      {image ? <img src={image} alt="" decoding="async" onError={() => setFailedImage(image)} /> : <Film size={23} strokeWidth={1.8} />}
    </div>
    <div className="clip-toast-copy"><div className="clip-toast-heading"><strong>{toast.status === 'saving' ? translations[lang].clipToastSaving : toast.status === 'error' ? translations[lang].clipToastFailed : translations[lang].clipToastSaved}</strong>
      {duration > 0 && <span className="clip-toast-duration">{duration < 60 ? duration + ' s' : Math.floor(duration / 60) + ':' + String(duration % 60).padStart(2, '0')}</span>}
    </div><p>{toast.gameTitle || toast.title || translations[lang].clipToastDefaultGame}</p></div>
    <div className="clip-toast-meter" aria-hidden="true"><span key={toast.id + ':' + (toast.status || 'saved')} /></div>
  </div>
}
