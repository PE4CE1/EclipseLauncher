import { Select } from '../shared/Select'
import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { persistAppSettings } from '../../services/settingsPersistence'
import { ClipSettingsPanel } from './ClipSettingsPanel'
import { SettingsRow, SettingsToggle } from './ClipSettingsControls'
import { AppModeControl } from '../settings/AppModeControl'
import { AccountProtection } from '../settings/AccountProtection'
import { StartupStatus } from '../settings/StartupStatus'
import { QuickAccessSettings } from '../settings/QuickAccessSettings'
import { ChatNotificationSettings } from '../settings/ChatNotificationSettings'
import type { AppSettings } from '../../types/game'

export function ClipsModeSettings() {
  const settings = useGameStore(state => state.settings), de = settings.language === 'de'
  const [tab, setTab] = useState('general')
  const tabs = [['general', de ? 'Allgemein' : 'General'], ['capture', de ? 'Aufnahme & Audio' : 'Capture & audio'], ['overlay', de ? 'Clip-Benachrichtigung' : 'Clip notification'], ['discord', 'Discord'], ['account', de ? 'Konto' : 'Account'], ['system', de ? 'System & Anzeige' : 'System & display']]
  const save = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => { void persistAppSettings({ [key]: value } as Pick<AppSettings, K>) }
  const row = (key: keyof AppSettings, label: string, fallback = false) => <SettingsToggle key={key} title={label} checked={typeof settings[key] === 'boolean' ? settings[key] as boolean : fallback} onChange={() => save(key, !(settings[key] ?? fallback))}/>
  return <div className="clips-mode-settings h-full flex min-h-0" data-clips-mode-settings>
    <nav aria-label={de ? 'Einstellungen' : 'Settings'} className="w-52 shrink-0 p-4 border-r border-white/[0.06] space-y-1 overflow-y-auto">{tabs.map(([id, label]) => <button type="button" key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`w-full text-left px-3 py-2.5 rounded-lg text-xs ${tab === id ? 'bg-white/[0.07] text-white' : 'text-white/45 hover:text-white hover:bg-white/[0.03]'}`}>{label}</button>)}</nav>
    <div className="flex-1 min-w-0 overflow-y-auto p-6 lg:p-8"><div className="max-w-4xl mx-auto space-y-6 text-white"><h2 className="text-xl font-semibold mb-5">{tabs.find(([id]) => id === tab)?.[1]}</h2>
      {tab === 'general' && <><AppModeControl/><section className="settings-glass-card p-5 rounded-xl border border-white/10"><SettingsRow title={de ? 'Sprache' : 'Language'}><Select aria-label={de ? 'Sprache' : 'Language'} value={settings.language} onChange={event => save('language', event.target.value)} className="bg-[#181819] border border-white/10 px-3 py-2 rounded-md text-xs"><option value="de">Deutsch</option><option value="en">English</option></Select></SettingsRow>{row('startOnBoot', de ? 'Eclipse beim Systemstart starten' : 'Launch Eclipse on system startup', true)}{row('startMinimized', de ? 'Eclipse minimiert starten' : 'Launch Eclipse minimized')}{row('exitInsteadOfMinimize', de ? 'Beim Schließen beenden statt minimieren' : 'Exit instead of minimizing on close')}{row('autoCheckUpdates', de ? 'Automatisch nach Updates suchen' : 'Automatically check for updates', true)}</section><StartupStatus enabled={settings.startOnBoot !== false} minimized={settings.startMinimized === true} language={settings.language || 'en'}/></>}
      {tab === 'general' && <QuickAccessSettings/>}
      {tab === 'general' && <ChatNotificationSettings/>}
      {tab === 'capture' && <ClipSettingsPanel/>}
      {tab === 'overlay' && <section className="settings-glass-card p-5 rounded-xl border border-white/10">{row('overlayClipNotification', de ? 'Clip-Overlay anzeigen' : 'Show clip overlay', true)}<SettingsRow title={de ? 'Akzentfarbe' : 'Accent color'}><input type="color" aria-label={de ? 'Akzentfarbe' : 'Accent color'} value={settings.overlayClipToastColor || '#ff6600'} onChange={event => save('overlayClipToastColor', event.target.value)}/></SettingsRow><button type="button" onClick={() => void window.electronAPI?.showClipToast?.({ title: 'Eclipse Clips', duration: 30, game: 'Gameplay' })} className="px-3 py-2 rounded-lg border border-white/10 text-xs hover:bg-white/5">{de ? 'Benachrichtigung testen' : 'Test notification'}</button></section>}
      {tab === 'discord' && <section className="settings-glass-card p-5 rounded-xl border border-white/10">{row('discordRpc', 'Discord Rich Presence', true)}{row('discordRpcIdle', de ? 'Eclipse anzeigen, wenn kein Spiel läuft' : 'Show Eclipse when no game is running', true)}{row('discordRpcRobloxSubGame', de ? 'Roblox-Spiel anzeigen' : 'Show Roblox experience', true)}{row('discordRpcShowVersion', de ? 'Eclipse-Version anzeigen' : 'Show Eclipse version')}{row('discordRpcPrivacyMode', de ? 'Privatsphäre-Modus' : 'Privacy mode')}<p className="text-xs text-white/40 mt-4">{de ? 'Eclipse erkennt laufende Spiele weiterhin automatisch.' : 'Eclipse continues to detect running games automatically.'}</p></section>}
      {tab === 'account' && <AccountProtection settings={settings}/>}
      {tab === 'system' && <section className="settings-glass-card p-5 rounded-xl border border-white/10">{row('hardwareAcceleration', de ? 'GPU-Beschleunigung' : 'GPU acceleration', true)}<p className="text-xs text-white/40 mt-3">{de ? 'Änderungen der GPU-Beschleunigung benötigen einen Neustart.' : 'GPU acceleration changes require a restart.'}</p></section>}
    </div></div>
  </div>
}
