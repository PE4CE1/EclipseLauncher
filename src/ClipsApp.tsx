import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from './store/gameStore'
import { useUIStore } from './store/uiStore'
import { initClipEngine } from './services/clipEngineLifecycle'
import { initVoiceEngine } from './services/voiceEngine'
import { watchNativeGameSession } from './services/nativeGameSession'
import { nativeGameRegistrations } from './services/nativeGameRegistry'
import { initSocialNetwork, updateSocialPresence } from './services/socialClient'
import { checkStartupUpdates } from './services/updateService'
import { useWindowActivity } from './hooks/useWindowActivity'
import { TitleBar } from './components/layout/TitleBar'
import { QuickAccess } from './components/layout/QuickAccess'
import { ClipsModeSidebar } from './components/clips/ClipsModeSidebar'
import { Notification } from './components/shared/Notification'
import './components/layout/scene-motion.css'
import './components/settings/settings-surfaces.css'

const Clips = lazy(() => import('./components/clips/ClipsView').then(module => ({ default: module.ClipsView })))
const Settings = lazy(() => import('./components/clips/ClipsModeSettings').then(module => ({ default: module.ClipsModeSettings })))
const Friends = lazy(() => import('./components/friends/FriendsWindow').then(module => ({ default: module.FriendsWindow })))
const AddFriend = lazy(() => import('./components/friends/AddFriendModal').then(module => ({ default: module.AddFriendModal })))
const Profile = lazy(() => import('./components/profile/ProfileView').then(module => ({ default: module.ProfileView })))
const Notifications = lazy(() => import('./components/notifications/NotificationsView').then(module => ({ default: module.NotificationsView })))

export default function ClipsApp() {
  const { view, friends, addFriend } = useUIStore(useShallow(state => ({ view: state.activeView, friends: state.isFriendsOpen, addFriend: state.isAddFriendOpen })))
  const de = useGameStore(state => state.settings.language === 'de'), focused = useWindowActivity()
  const active = ['settings', 'profile', 'notifications'].includes(view) ? view : 'clips'
  useLayoutEffect(() => { useUIStore.getState().setActiveView('clips') }, [])
  useEffect(() => {
    let disposed = false
    void window.electronAPI?.getSettings?.().then(saved => { if (!disposed && saved) useGameStore.getState().updateSettings(saved) }).catch(() => {})
    const disposeClips = initClipEngine()
    initVoiceEngine()
    // Keep custom executable recognition without hydrating or rendering the
    // full library in the clips-only store.
    try {
      const saved = JSON.parse(localStorage.getItem('gamehub-store') || '{}').state || {}
      const records = nativeGameRegistrations({ installedGames: Array.isArray(saved.installedGames) ? saved.installedGames : [], library: Array.isArray(saved.library) ? saved.library : [] })
      void window.electronAPI?.registerInstalledGames?.(records).catch(() => {})
    } catch {}
    const game = watchNativeGameSession(window.electronAPI, session => {
      const current = useGameStore.getState().activeGame
      if (current?.authoritative && current.name === session.name && current.startTime === session.startTime) return
      useGameStore.getState().startPlaySession(session.name, session.name, true, session.startTime)
      void updateSocialPresence('ingame', session.name).catch(() => {})
    }, () => { useGameStore.getState().stopPlaySession(); void updateSocialPresence('online', null).catch(() => {}) })
    const pushPresence = () => { const current = useGameStore.getState().activeGame; void updateSocialPresence(current ? 'ingame' : 'online', current?.name || null).catch(() => {}) }
    void initSocialNetwork().then(pushPresence).catch(() => {})
    const heartbeat = setInterval(pushPresence, 60000)
    const refresh = () => { void game.refresh() }
    const unload = () => { void updateSocialPresence('offline', null).catch(() => {}) }
    window.addEventListener('focus', refresh); window.addEventListener('pagehide', unload)
    const offAdd = window.electronAPI?.onShowAddFriendModal?.(() => {
      if (useUIStore.getState().isAddFriendOpen) requestAnimationFrame(() => { void window.electronAPI?.addFriendModalReady?.() })
      else useUIStore.getState().setIsAddFriendOpen(true)
    })
    const offProfile = window.electronAPI?.onShowFriendProfileModal?.((id: string) => useUIStore.getState().openFriendProfile(id))
    const offUpdater = window.electronAPI?.onUpdaterEvent?.(({ status, data }) => {
      if (['idle', 'checking', 'available', 'not-available', 'downloading', 'downloaded', 'error'].includes(status)) useUIStore.getState().setUpdateState(status as any, typeof data?.percent === 'number' ? data.percent : undefined, data)
    })
    const updater = setTimeout(() => { void checkStartupUpdates(useGameStore.getState().settings.autoCheckUpdates !== false) }, 1500)
    return () => { disposed = true; clearTimeout(updater); clearInterval(heartbeat); disposeClips(); game.dispose(); offAdd?.(); offProfile?.(); offUpdater?.(); window.removeEventListener('focus', refresh); window.removeEventListener('pagehide', unload) }
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('performance-mode', !focused)
    document.body.classList.toggle('performance-mode', !focused)
    return () => { document.documentElement.classList.remove('performance-mode'); document.body.classList.remove('performance-mode') }
  }, [focused])
  return <div className="launcher-shell h-screen bg-hub-base select-none overflow-hidden flex flex-col" data-app-mode="clips" data-unfocused={!focused || undefined}>
    <TitleBar minimal/>
    <div className="flex flex-1 min-h-0"><ClipsModeSidebar/><div className="flex-1 min-w-0 min-h-0 flex flex-col"><header className="h-14 shrink-0 border-b border-white/[0.06] flex items-center px-7 text-sm font-semibold">{active === 'settings' ? (de ? 'Einstellungen' : 'Settings') : active === 'profile' ? (de ? 'Profil' : 'Profile') : active === 'notifications' ? (de ? 'Benachrichtigungen' : 'Notifications') : 'Clips Studio'}<div className="ml-auto flex items-center gap-3"><QuickAccess location="topbar"/><span className="text-[10px] text-white/30 font-normal tracking-wide">ECLIPSE CLIPS</span></div></header><main className="flex-1 min-h-0 overflow-hidden" data-view-scene={active}><Suspense fallback={<div aria-busy="true" className="h-full"/>}>{active === 'settings' ? <Settings/> : active === 'profile' ? <Profile/> : active === 'notifications' ? <Notifications/> : <Clips/>}</Suspense></main></div></div>
    <Suspense fallback={null}>{friends && <Friends/>}{addFriend && <AddFriend/>}</Suspense><Notification/>
  </div>
}
