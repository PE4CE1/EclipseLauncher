import { useEffect, useState } from 'react'
import { TitleBar } from '../src/components/layout/TitleBar'
import { EclipseCinemaModal } from '../src/components/eclipse/EclipseCinemaModal'
import { ClipApplicationAudio } from '../src/components/clips/ClipApplicationAudio'
import { useGameStore } from '../src/store/gameStore'
import type { ClipSettings } from '../src/types/game'

export function ClipExperienceFixture() {
  const [settings, setSettings] = useState<ClipSettings>({ separateApplications: true, gameAudioProcess: 'RocketLeague.exe' } as ClipSettings)
  useEffect(() => {
    useGameStore.getState().updateSettings({ language: 'en' })
    ;(window as any).__clipExperience = { settings: () => settings, configure: setSettings }
  }, [settings])
  return <main className="h-screen bg-[#09090b] text-white" style={{ background: 'radial-gradient(ellipse at 20% 80%,#29150b,#09090b 65%)' }}>
    <TitleBar />
    <div className="clip-settings" style={{ maxWidth: 1000, margin: '60px auto', padding: 24 }}><h2 style={{ fontSize: 22, marginBottom: 28 }}>Audio & microphone</h2><ClipApplicationAudio settings={settings} onChange={patch => setSettings(previous => ({ ...previous, ...patch }))} de={false} /></div>
    <EclipseCinemaModal />
  </main>
}
