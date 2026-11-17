import { useRef, useState } from 'react'
import { Bell, BellOff, AlertTriangle } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { chatIsMuted, setFriendMuted } from '../../services/chatPreferences'

export function FriendMuteControl({ peer, label = false, menu = false, done }: { peer: string; label?: boolean; menu?: boolean; done?: () => void }) {
  const settings = useGameStore(state => state.settings), de = settings.language === 'de'
  const muted = chatIsMuted(settings, settings.userUid || '', peer), lock = useRef(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const text = error ? (de ? 'Speichern fehlgeschlagen. Erneut versuchen.' : 'Could not save. Try again.') : muted ? (de ? 'Stummschaltung aufheben' : 'Unmute notifications') : (de ? 'Benachrichtigungen stummschalten' : 'Mute notifications')
  const toggle = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(false)
    try {
      if (await setFriendMuted(peer, !muted)) done?.()
      else setError(true)
    } finally { lock.current = false; setBusy(false) }
  }
  return <button type="button" role={menu ? 'menuitem' : undefined} data-friend-mute={peer} data-muted={muted || undefined} data-error={error || undefined} aria-pressed={menu ? undefined : muted} title={text} aria-label={text} disabled={busy} onClick={() => void toggle()}>{error ? <AlertTriangle size={14}/> : muted ? <BellOff size={14}/> : <Bell size={14}/>} {label && text}</button>
}
