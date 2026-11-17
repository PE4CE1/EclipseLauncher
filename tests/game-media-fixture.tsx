import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomVideoPlayer } from '../src/components/shared/CustomVideoPlayer'
import { GameDetailModal } from '../src/components/shared/GameDetailModal'
import { TopBar } from '../src/components/layout/TopBar'
import { StorageManagerView } from '../src/components/storage/StorageManagerView'
import { useGameStore } from '../src/store/gameStore'
import { useUIStore } from '../src/store/uiStore'
import { formatSteamNews, prepareSteamNews, steamNewsImageUrl } from '../src/services/steamNewsContent'
import '../src/index.css'

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const demos = [
  { id: 'steam_4704030', steamId: 4704030, name: 'Invokyr Demo', platform: 'steam' as const, installed: true, installPath: 'C:/fixture/invokyr', launchUrl: '' },
  { id: 'steam_5124200', steamId: 5124200, name: 'Screen Stocks Demo', platform: 'steam' as const, installed: true, installPath: 'C:/fixture/screen-stocks', launchUrl: '' },
]

async function testVideo() {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
  const context = canvas.getContext('2d')!
  const stream = canvas.captureStream(24)
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
  const chunks: Blob[] = []
  const finished = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
  recorder.ondataavailable = event => chunks.push(event.data)
  let frame = 0
  const paint = () => { context.fillStyle = '#24140c'; context.fillRect(0, 0, 640, 360); context.fillStyle = '#e07a35'; context.fillRect((frame++ * 8) % 580, 130, 60, 60); context.fillStyle = '#eee5d7'; context.font = '28px sans-serif'; context.fillText('ECLIPSE · PLAYER TEST', 36, 65) }
  paint(); recorder.start()
  const timer = setInterval(paint, 1000 / 24)
  await new Promise(resolve => setTimeout(resolve, 1400))
  recorder.stop(); clearInterval(timer)
  const blob = await finished; stream.getTracks().forEach(track => track.stop())
  return URL.createObjectURL(blob)
}

function Fixture() {
  const [mode, setMode] = useState('player')
  const [source, setSource] = useState('')
  useEffect(() => {
    useGameStore.getState().updateSettings({ language: 'de', welcomeCompleted: true, keyforsteamEnabled: false })
    useGameStore.getState().setInstalledGames(demos)
    testVideo().then(url => {
      setSource(url)
      for (const language of ['german', 'english']) client.setQueryData(['steam', 'detail', 730, language, 'DE'], {
        name: 'Counter-Strike 2', steam_appid: 730, type: 'game', short_description: 'An isolated media fixture.',
        about_the_game: '<p>Fixture description.</p>', developers: ['Valve'], publishers: ['Valve'], genres: [], categories: [],
        screenshots: [{ id: 1, path_thumbnail: 'https://shared.fastly.steamstatic.com/steam/apps/730/fixture/picture-one.jpg', path_full: 'https://shared.fastly.steamstatic.com/steam/apps/730/fixture/picture-one.jpg' }, { id: 2, path_thumbnail: 'https://shared.fastly.steamstatic.com/steam/apps/730/fixture/picture-two.jpg', path_full: 'https://shared.fastly.steamstatic.com/steam/apps/730/fixture/picture-two-full.jpg' }], movies: [{ id: 1, name: 'Test trailer', thumbnail: '', webm: { max: url } }],
        pc_requirements: { minimum: '<p>Fixture</p>' }, release_date: { date: '2023' }, platforms: { windows: true },
      })
      ;(window as any).__gameMediaFixture = {
        formatNews: formatSteamNews,
        prepareNews: prepareSteamNews,
        newsImageUrl: steamNewsImageUrl,
        detail: () => { setMode('detail'); useUIStore.getState().openGameDetails(730, 'Counter-Strike 2') },
        storage: () => { useUIStore.getState().setIsGameModalOpen(false); setMode('storage') },
        player: () => { useUIStore.getState().setIsGameModalOpen(false); setMode('player') },
        language: (language: 'de' | 'en') => useGameStore.getState().updateSettings({ language }),
        lightboxStates: [] as boolean[],
      }
      useUIStore.subscribe((next, prior) => { if (next.isLightboxOpen !== prior.isLightboxOpen) (window as any).__gameMediaFixture.lightboxStates.push(next.isLightboxOpen) })
    })
  }, [])
  return <QueryClientProvider client={client}><main className="h-screen bg-[#09090b] text-white overflow-auto">
    {mode === 'player' && source && <div className="w-[800px] h-[450px] mx-auto my-10"><CustomVideoPlayer src={source} /></div>}
    {mode === 'detail' && <><TopBar /><GameDetailModal /></>}
    {mode === 'storage' && <StorageManagerView />}
  </main></QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
