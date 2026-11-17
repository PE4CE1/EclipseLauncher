import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useGameStore } from '../src/store/gameStore'
import { useUIStore } from '../src/store/uiStore'
import { LaunchOverlayProvider } from '../src/components/splash/LaunchOverlay'
import { SplashView } from '../src/components/splash/SplashView'
import { NotificationsView } from '../src/components/notifications/NotificationsView'
import '../src/index.css'

const listeners = new Set<(payload: { status: string; data?: any }) => void>()
const calls = { downloads: 0, installs: 0, links: [] as string[] }
const release = {
  version: '2.1.0', releaseDate: '2026-11-08T10:00:00Z',
  releaseNotes: '## Verbesserungen\n- **Clips & Replay:** Schnellere Verarbeitung und zuverlässigere Audio-Spuren.\n- **Eine flüssigere Oberfläche:** Ruhigere Übergänge und weniger Speicherverbrauch.\n- **Downloads & Quellen:** Bessere Rückmeldungen und geprüfte Ersatzquellen.',
}
function emit(status: string, data?: any) {
  useUIStore.getState().setUpdateState(status as any, status === 'downloading' ? data?.percent : undefined, ['available', 'downloaded', 'error'].includes(status) ? data : undefined)
  listeners.forEach(listener => listener({ status, data }))
}
Object.assign(window, { electronAPI: {
  onUpdaterEvent: (listener: (payload: any) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
  downloadUpdate: async () => { calls.downloads++; emit('downloading', { percent: 0 }); return { success: true } },
  installUpdate: async () => { calls.installs++ },
  checkUpdate: async () => {}, openUrl: async (url: string) => { calls.links.push(url) },
  minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
} })
useGameStore.getState().updateSettings({ language: 'de', autoScanSplash: false, autoScan: false, autoCheckUpdates: true })
function Fixture() {
  const [mode, setMode] = useState('startup')
  Object.assign(window, { __updateFixture: { emit, release, calls, ready: () => listeners.size > 0, mode: setMode, language: (language: 'de' | 'en') => useGameStore.getState().updateSettings({ language }) } })
  return <main style={{ height: '100vh', background: '#0b0a09' }}>
    {mode === 'startup' ? <LaunchOverlayProvider><SplashView onComplete={() => {}} /></LaunchOverlayProvider> : <NotificationsView />}
    <div style={{ position: 'fixed', bottom: 12, left: 18, zIndex: 100001, color: '#ac9b8d', fontSize: 10, letterSpacing: '.03em', pointerEvents: 'none' }}>Designvorschau · Version und Änderungen sind Beispieldaten</div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
