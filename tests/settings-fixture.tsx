import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsView } from '../src/components/settings/SettingsView'
import { useGameStore } from '../src/store/gameStore'
import { useSourceStore } from '../src/store/sourceStore'
import { useClipStore } from '../src/store/clipStore'
import { initClipEngine, startReplayBuffer, stopReplayBuffer } from '../src/services/clipEngine'
import { fixtureCaptureStarts, liveFixtureTracks } from './clip-capture-fixture'
import { useUIStore } from '../src/store/uiStore'
import type { DownloadSource, FetchSourceResult } from '../src/types/source'
import type { SpicetifyResult } from '../src/types/spicetify'
import '../src/index.css'

const driveFixture = [
  { deviceId:'C:',volumeName:'Windows',totalBytes:1024**4,freeBytes:36*1024**3,usedBytes:988*1024**3,usedPercentage:96.5 },
  { deviceId:'D:',volumeName:'Games',totalBytes:512*1024**3,freeBytes:92*1024**3,usedBytes:420*1024**3,usedPercentage:82 },
  { deviceId:'F:',volumeName:'Library',totalBytes:2*1024**4,freeBytes:1.3*1024**4,usedBytes:.7*1024**4,usedPercentage:35 },
]
const gameFixture = ['DCS World Steam Edition','War Thunder','Overwatch','Pavlov VR','Rocket League'].map((name,i) => ({ id:'fixture-'+i,name,platform:'steam' as const,drive:i===0?'F:':'D:',installPath:`D:\\SteamLibrary\\${name}`,sizeBytes:[241.8,86.8,77.3,71.5,28.6][i]*1024**3,sizeFormatted:[241.8,86.8,77.3,71.5,28.6][i]+' GB',iconUrl:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${['#3d4b55','#564738','#56504f','#354c4d','#40576b'][i]}"/><path d="M0 180L150 30L320 180" fill="#ffffff20"/><text x="20" y="130" fill="#fff" font-family="Arial" font-size="26">${name.split(' ').slice(0,2).join(' ')}</text></svg>`) }))
useGameStore.setState({ installedGames: gameFixture })
useSourceStore.setState({ sources:['SteamGG','No-Intro',"Shisui’s source",'Kazumi','RuTracker & Rutor','freetp by hydrasources.su'].map((name,i) => ({ name,url:`https://example.com/catalogs/${['steamgg','no-intro','shisui','kazumi','rutor','freetp'][i]}.json`,status:'up_to_date' as const,optionsCount:[6732,20051,25627,2060,67782,3146][i],data:[],lastUpdated:Date.now() })) })
const writes: unknown[] = []
const pluginCalls: string[] = []
let pluginResult: SpicetifyResult = { success: false, errorCode: 'permissions', exitCode: 1, details: 'Access is denied' }
let finishPlugin: ((result: SpicetifyResult) => void) | undefined
const clipWrites: unknown[] = []
const sourceFetches: string[] = []
let sourceResult: FetchSourceResult = { success: false, error: 'HTTP 403' }
let failNext = false
Object.assign(window, { electronAPI: {
  spicetify: {
    getStatus: async () => ({isSpotifyInstalled:true,isSpicetifyInstalled:true,version:'2.46.7',hasMarketplace:true,isInstalling:false}),
    upgrade: () => { pluginCalls.push('upgrade'); return new Promise<SpicetifyResult>(resolve => { finishPlugin=resolve }) },
    restore: async () => ({success:true}),install: async () => ({success:true}),openFolder: async () => ({success:true}),
    onLog: () => () => {},onStatus: () => () => {},
  },
  getAutoLaunchStatus: async () => ({ supported: true, registered: useGameStore.getState().settings.startOnBoot !== false, enabled: useGameStore.getState().settings.startOnBoot !== false, blocked: false, minimized: useGameStore.getState().settings.startMinimized === true }),
  openStartupSettings: async () => {},
  fetchAndCacheSource: async (url: string) => { sourceFetches.push(url); return sourceResult },
  setSettings: async (patch: unknown) => { writes.push(patch); if (failNext) { failNext = false; return { success: false } } return { success: true } },
  setAutoLaunch: async () => true,
  getDefaultDownloadPath: async () => 'D:\\Eclipse\\Downloads',
  detectInstalledVpns: async () => [], getVpnStatus: async () => ({ isConnected: false }),
  getFpsAccess: async () => ({ supported: false, ready: false, status: 'idle' }),
  getOverlayState: async () => ({ visible: false, activeWidgets: [] }),
  nativeMicrophone: { list: async () => ({ supported: true, inputs: [{deviceId:'fixture-mic-a',label:'Microphone (Fixture USB)',default:true},{deviceId:'fixture-mic-b',label:'Stream Mix (Fixture Virtual Audio)',default:false}] }) },
  storage: { getDrives: async () => driveFixture, getGameSizes: async () => gameFixture },
  clips: { getAll: async () => [], saveSettings: async (patch: unknown) => { clipWrites.push(patch); return patch }, getActiveGame: async () => null },
} })
useGameStore.getState().updateSettings({ language: 'en', welcomeCompleted: true, downloadPath: 'D:\\Eclipse\\Downloads', steamProfileUrl: 'https://steamcommunity.com/id/player', friendCode: 'ECL-DEMO', accountRecoveryReady: false })
useUIStore.getState().setActiveSettingsTab('general')
Object.assign(window, { __settingsFixture: {
  pluginCalls, completePlugin: () => { finishPlugin?.(pluginResult); finishPlugin=undefined }, pluginResult: (result: SpicetifyResult) => {pluginResult=result},
  tab: (tab: string) => useUIStore.getState().setActiveSettingsTab(tab),
  language: (language: string) => useGameStore.getState().updateSettings({ language }),
  settings: () => useGameStore.getState().settings, writes,
  failNext: () => { failNext = true },
  sources: (sources: DownloadSource[]) => useSourceStore.setState({ sources }),
  sourceResult: (result: FetchSourceResult) => { sourceResult = result },
  sourceFetches,
  clipWrites,
  captureStarts: fixtureCaptureStarts, tracks: liveFixtureTracks,
  startCapture: async () => { initClipEngine(); useClipStore.getState().setSettings({ enabled:true,captureMic:false,separateApplications:false,fps:30,replayDurationSeconds:30 }); return startReplayBuffer() },
  stopCapture: stopReplayBuffer,
} })
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><main style={{ height: '100vh', background: 'radial-gradient(ellipse at 6% 10%,#66331e24,transparent 57%),radial-gradient(ellipse at 100% 95%,#6d30151c,transparent 50%),#0b0b0e' }}><SettingsView /></main></QueryClientProvider>)
