import { DropdownSurface } from '../shared/DropdownSurface'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Film, Settings, Users, User, Bell } from 'lucide-react'
import { ProfileSummary } from '../layout/SidebarProfileSummary'
import { useSteamAvatarFrame } from '../../hooks/useSteamAvatarFrame'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { AppModeControl } from '../settings/AppModeControl'
import { APP_DISPLAY_VERSION } from '../../services/appVersion'
import { QuickAccess } from '../layout/QuickAccess'

export function ClipsModeSidebar() {
  useSteamAvatarFrame()
  const settings = useGameStore(state => state.settings), playing = useGameStore(state => !!state.activeGame)
  const view = useUIStore(state => state.activeView), de = settings.language === 'de'
  const [open, setOpen] = useState(false), [focused, setFocused] = useState(document.hasFocus())
  const anchor = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null)
  const navigate = (next: 'clips' | 'settings' | 'profile' | 'notifications') => { useUIStore.getState().setActiveView(next); setOpen(false) }
  const friends = () => { if (window.electronAPI?.openFriendsWindow) void window.electronAPI.openFriendsWindow(); else useUIStore.getState().setIsFriendsOpen(true); setOpen(false) }
  useLayoutEffect(() => {
    if (open) popup.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => { const target = event.target as Element; if (!target.closest('[data-app-mode-dialog]') && !anchor.current?.contains(target) && !popup.current?.contains(target)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const focus = () => setFocused(document.hasFocus() && !document.hidden)
    focus()
    document.addEventListener('mousedown', dismiss); document.addEventListener('keydown', key); window.addEventListener('focus', focus); window.addEventListener('blur', focus)
    document.addEventListener('visibilitychange', focus)
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', key); window.removeEventListener('focus', focus); window.removeEventListener('blur', focus); document.removeEventListener('visibilitychange', focus) }
  }, [open])
  const requests = settings.incomingFriendRequests?.length || 0, rect = anchor.current?.getBoundingClientRect()
  const item = 'w-full flex items-center gap-3 px-3 py-2.5 text-xs text-white/65 hover:text-white hover:bg-white/[0.05] rounded-lg text-left'
  return <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col p-3 bg-black/10" data-clips-sidebar>
    <button ref={anchor} type="button" id="sidebar-profile-menu" aria-expanded={open} aria-haspopup="menu" tabIndex={open ? -1 : 0} data-open={open || undefined} onClick={() => setOpen(value => !value)} className="profile-menu-trigger flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/[0.04]"><ProfileSummary settings={settings} playing={playing} expanded={false} updateAvailable={false}/></button>
    <QuickAccess/>
    <span className="text-[10px] text-white/30 uppercase tracking-[0.18em] px-3 mt-5 mb-3">Eclipse Clips</span>
    <nav className="space-y-1" aria-label={de ? 'Navigation' : 'Navigation'}><button type="button" id="nav-clips" aria-current={view === 'clips' ? 'page' : undefined} onClick={() => navigate('clips')} className={item + (view === 'clips' ? ' bg-white/[0.07] text-white' : '')}><Film size={16}/>Clips</button><button type="button" id="sidebar-open-friends" onClick={friends} className={item}><Users size={16}/>{de ? 'Freunde' : 'Friends'}{requests > 0 && <span className="ml-auto text-orange-200 text-[10px]">{requests}</span>}</button><button type="button" id="nav-settings" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')} className={item + (view === 'settings' ? ' bg-white/[0.07] text-white' : '')}><Settings size={16}/>{de ? 'Einstellungen' : 'Settings'}</button></nav>
    <div className="mt-auto pt-5 border-t border-white/[0.06] text-[11px] text-white/30 px-3">v{APP_DISPLAY_VERSION} <span className="ml-2 text-white/20">Clips mode</span></div>
    {createPortal(<DropdownSurface open={open} ref={popup} id="sidebar-profile-dropdown" data-positioned data-unfocused={!focused || undefined} role="menu" className="profile-glass-menu fixed border border-white/10 rounded-xl p-1.5" style={{ left: (rect?.left ?? 12) - 7, top: (rect?.top ?? 44) - 7, width: (rect?.width ?? 216) + 14, maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}><button type="button" className="flex items-center gap-3 p-2 w-full text-left" onClick={() => setOpen(false)}><ProfileSummary settings={settings} playing={playing} expanded updateAvailable={false}/></button><div className="h-px bg-white/[0.06] my-1.5"/><button type="button" className={item} onClick={() => navigate('profile')}><User size={15}/>{de ? 'Profil anzeigen' : 'View profile'}</button><button type="button" className={item} onClick={friends}><Users size={15}/>{de ? 'Freunde' : 'Friends'}</button><button type="button" className={item} onClick={() => navigate('notifications')}><Bell size={15}/>{de ? 'Benachrichtigungen' : 'Notifications'}</button><div className="h-px bg-white/[0.06] my-1.5"/><AppModeControl menu/></DropdownSurface>, document.body)}
  </aside>
}
