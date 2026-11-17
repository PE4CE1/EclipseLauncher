import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, AlertTriangle, Bell, BellOff, MessageCircle, ArrowUpRight, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useUIStore } from '../../store/uiStore'
import { useGameStore } from '../../store/gameStore'
import { useTranslation } from '../../hooks/useTranslation'
import { safeProfileMedia } from '../../services/profileModel'
import { setFriendMuted } from '../../services/chatPreferences'
import './notification.css'

export function Notification() {
  const stored = useUIStore(state => state.notification), clear = useUIStore(state => state.clearNotification)
  const uid = useGameStore(state => state.settings.userUid)
  const notification = stored?.ownerUid && stored.ownerUid !== uid ? null : stored
  const de = useGameStore(state => state.settings.language === 'de'), { t } = useTranslation(), reduced = useReducedMotion()
  const [failedImage, setFailedImage] = useState(''), [muting, setMuting] = useState(false)
  const [muteError, setMuteError] = useState(false)
  useEffect(() => { setMuteError(false) }, [notification?.id])
  useEffect(() => { if (stored?.ownerUid && stored.ownerUid !== uid) clear() }, [stored?.ownerUid, uid, clear])
  if (typeof document === 'undefined') return null
  const message = notification?.kind === 'message', avatar = safeProfileMedia(notification?.avatarUrl)
  const open = () => {
    if (!notification?.peerId) return
    const api = window.electronAPI?.chatNotifications, id = notification.id
    if (api) void api.open(notification.peerId).then(() => { if (useUIStore.getState().notification?.id === id) clear() }).catch(() => {})
  }
  const mute = async () => {
    if (!notification?.peerId || muting) return
    setMuting(true); setMuteError(false)
    const id = notification.id
    try { if (await setFriendMuted(notification.peerId, true)) { if (useUIStore.getState().notification?.id === id) clear() } else if (useUIStore.getState().notification?.id === id) setMuteError(true) }
    finally { setMuting(false) }
  }
  const icon = message ? <MessageCircle size={19}/> : notification?.type === 'success' ? <Check size={19}/> : notification?.type === 'error' ? <AlertTriangle size={19}/> : <Bell size={18}/>
  return createPortal(<div className="eclipse-toast-position">
    <AnimatePresence initial={false}>
      {notification && <motion.aside key={notification.id} id="toast-notification" className="eclipse-toast" data-type={notification.type} data-message={message || undefined}
        role="status" aria-live="polite" aria-atomic="true"
        initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 6 }}
        transition={{ duration: reduced ? 0 : 0.16, ease: 'easeOut' }}
        drag={reduced ? false : 'x'} dragConstraints={{ left: 0, right: 100 }} dragElastic={0.15}
        onDragEnd={(_, info) => { if (info.offset.x > 55 || info.velocity.x > 300) clear() }}>
        <div className="eclipse-toast-icon">{message && avatar && avatar !== failedImage ? <img src={avatar} alt="" onError={() => setFailedImage(avatar)} decoding="async"/> : icon}{message && avatar && avatar !== failedImage && <span><MessageCircle size={10}/></span>}</div>
        <div className="eclipse-toast-content">
          <div className="eclipse-toast-meta"><span>{message ? (de ? 'Neue Nachricht' : 'New message') : 'Eclipse'}</span><span>{t('justNow')}</span></div>
          <strong>{notification.title || (de ? 'Benachrichtigung' : 'Notification')}</strong>
          <p>{notification.message}</p>
          {message && <div className="eclipse-toast-actions"><button type="button" data-toast-reply onClick={open}>{de ? 'Antworten' : 'Reply'}<ArrowUpRight size={13}/></button><button type="button" data-toast-mute onClick={() => void mute()} disabled={muting} title={de ? 'Diesen Freund stummschalten' : 'Mute this friend'} aria-label={de ? 'Diesen Freund stummschalten' : 'Mute this friend'}><BellOff size={13}/>{de ? 'Stumm' : 'Mute'}</button></div>}
          {muteError && <p role="alert" className="eclipse-toast-error">{de ? 'Speichern fehlgeschlagen. Bitte erneut versuchen.' : 'Could not save. Please try again.'}</p>}
        </div>
        <button type="button" className="eclipse-toast-close" onClick={clear} aria-label={t('close')}><X size={14}/></button>
        <motion.div className="eclipse-toast-progress" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: (notification.duration || 5000) / 1000, ease: 'linear' }}/>
      </motion.aside>}
    </AnimatePresence>
  </div>, document.body)
}
