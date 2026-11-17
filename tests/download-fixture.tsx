import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DownloadOptionsModal } from '../src/components/downloads/DownloadOptionsModal'
import { DownloadsView } from '../src/components/downloads/DownloadsView'
import { useGameStore } from '../src/store/gameStore'
import { useDownloadStore } from '../src/store/downloadStore'
import '../src/index.css'

useGameStore.getState().updateSettings({ language: 'en', downloadPath: 'C:\\Users\\Player\\Downloads' })
const cover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#d5c837"/><path d="M170 20L265 50L300 180H100Z" fill="#191c21"/><text x="15" y="75" fill="#101318" font-size="30" font-family="Arial" font-style="italic" font-weight="bold">CYBERPUNK</text><text x="22" y="101" fill="#101318" font-size="20" font-family="Arial">2077</text></svg>')
const urls = ['https://datanodes.to/first', 'https://gofile.io/d/example', 'https://datanodes.to/second', 'https://vikingfile.com/f/example', 'https://filekeeper.net/example/game.zip', 'https://akirabox.to/example/file']
const release = { title: 'Cyberpunk 2077 Free Download [v.2.5/Build-26161058+DLCs]', sourceName: 'SteamGG', fileSize: '74.83 GB', uploadDate: '2026-10-26T00:31:22Z', uris: urls }
const task = { infoHash: 'fixture-download', name: 'Cyberpunk 2077', progress: 0, downloadSpeed: 0, downloaded: 0, length: 0, timeRemaining: Infinity, coverUrl: cover, status: 'error' as const, errorCode: 'no-file' as const, errorMessage: 'No automatic mirror was available.', mirrorFailures: urls.map((url,index) => ({ url, host: new URL(url).hostname, code: index === 1 || index === 4 ? 'no-file' as const : index === 0 || index === 2 ? 'verification' as const : 'network' as const })) }
function Fixture() {
  const [open, setOpen] = useState(true), [many, setMany] = useState(false)
  ;(window as any).__downloadsFixture = {
    native: async (url: string, directory: string) => { setOpen(false); useDownloadStore.setState({ downloads: {}, speedHistory: {} }); return window.electronAPI.startHttpDownload(url, 'Local transfer test', directory, false, false) },
    open: () => setOpen(true), many: () => setMany(true), error: () => { setOpen(false); useDownloadStore.getState().updateDownload(task) },
    language: (language: 'en' | 'de') => useGameStore.getState().updateSettings({ language }),
    active: () => useDownloadStore.getState().updateDownload({ ...task, status: 'downloading', mirrorFailures: [], errorCode: undefined, progress: .42, downloaded: 19_000_000_000, length: 45_000_000_000, downloadSpeed: 45_000_000, timeRemaining: 578_000 }),
  }
  return <main style={{ height: '100vh', background: 'radial-gradient(ellipse at 13% 0%,#34201966,transparent 60%),#090a0c' }}><DownloadsView /><DownloadOptionsModal isOpen={open} onClose={() => setOpen(false)} gameName="Cyberpunk 2077" coverUrl={cover} downloads={many ? Array.from({length:12}, (_,i) => ({ ...release, title: `Cyberpunk 2077 Free Download [v.2.${i} / Build ${26161058-i}]`, sourceName: i % 2 ? 'Source B' : 'SteamGG' })) : [release]} onDownload={async (...args) => { (window as any).__downloadRequest = args; setOpen(false); useDownloadStore.getState().addDownload({ ...task, status: 'downloading', mirrorFailures: [], resolution: { host: 'filekeeper.net', attempt: 1, total: 6 } }); return true }} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
