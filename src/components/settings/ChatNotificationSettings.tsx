import { useGameStore } from '../../store/gameStore'
import { persistAppSettings } from '../../services/settingsPersistence'
import { SettingsToggle } from '../clips/ClipSettingsControls'

export function ChatNotificationSettings() {
  const settings = useGameStore(state => state.settings), de = settings.language === 'de'
  return <section className="settings-glass-card rounded-xl border border-white/10 p-5" data-chat-notification-settings>
    <h3 className="text-sm font-semibold text-white mb-1">{de ? 'Nachrichten von Freunden' : 'Friend messages'}</h3>
    <p className="text-xs text-white/40 mb-4">{de ? 'Einzelne Freunde kannst du direkt im Chat oder über die drei Punkte stummschalten.' : 'Mute individual friends in the chat or through their three-dot menu.'}</p>
    <SettingsToggle title={de ? 'Nachrichten-Popups' : 'Message popups'} checked={settings.chatNotificationPopups !== false} onChange={() => { void persistAppSettings({ chatNotificationPopups: settings.chatNotificationPopups === false }) }}/>
    <SettingsToggle title={de ? 'Nachrichtenton' : 'Message sound'} checked={settings.chatNotificationSound !== false} onChange={() => { void persistAppSettings({ chatNotificationSound: settings.chatNotificationSound === false }) }}/>
  </section>
}
