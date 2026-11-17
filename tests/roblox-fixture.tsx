import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RobloxCodesHub } from '../src/components/roblox/RobloxCodesHub'
import { RobloxPopularGames } from '../src/components/roblox/RobloxPopularGames'
import { ROBLOX_CODE_GAMES } from '../src/services/robloxGames'
import { useGameStore } from '../src/store/gameStore'
import { useUIStore } from '../src/store/uiStore'
import type { RobloxCodeGame, RobloxGameCodesResult } from '../src/types/robloxCodes'
import '../src/index.css'

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const listeners = new Set<(value: any) => void>(), updates = new Set<(value: any) => void>()
const copied: string[] = [], calls: string[] = []
let finishRivals: (() => void) | undefined
const result = (game: RobloxCodeGame): RobloxGameCodesResult => ({ ...game, gameName: game.name, status: 'ready', lastUpdated: Date.now(),
  activeCodes: game.name === 'Blox Fruits' ? [
    { code: 'EASTEREXP', reward: '20 minutes of double XP', sourceName: 'Roblox Den', sourceUrl: 'https://robloxden.com/game-codes/blox-fruits', verification: 'community' },
    { code: 'KITT_RESET', reward: 'Stat reset', sourceName: 'Roblox Den', verification: 'community' },
    { code: 'SUB2GAMERROBOT_EXP1', reward: '30 minutes of double XP', sourceName: 'Roblox Den', verification: 'community' },
    { code: 'Chandler', reward: 'A joke reward', sourceName: 'Roblox Den', verification: 'community', alternatives: ['CHANDLER'] },
    { code: 'SUB2CAPTAINMAUi', reward: '20 minutes of double XP', sourceName: 'Roblox Den', verification: 'community' },
    { code: 'THEGREATACE', reward: '20 minutes of double XP', sourceName: 'Roblox Den', verification: 'community' },
    ...Array.from({ length: 18 }, (_, i) => ({ code: `TEST_PAGE_${i + 1}`, reward: 'Pagination fixture', sourceName: 'Test fixture', verification: 'community' as const })),
  ] : [{ code: game.name === 'Fisch' ? 'FISCH_FIXTURE' : 'OTHER_FIXTURE', reward: 'Test reward', sourceName: 'Test source', verification: 'community' }],
  expiredCodes: Array.from({ length: 21 }, (_, i) => ({ code: `OLD_FIXTURE_${i}`, reward: 'Test reward', isExpired: true })), sources: [{ name: 'Roblox Den', url: 'https://robloxden.com/game-codes/blox-fruits' }] })

const suggestions = [...ROBLOX_CODE_GAMES.slice(0, 6).map(game => ({ ...game, iconUrl: `https://tr.rbxcdn.com/fixture/${game.universeId}.png`, players: 12345, creatorName: 'Roblox creator' })), { name: 'Crystal Forest 2', universeId: '987654', placeId: '654321', sources: [{ name: 'Test source', url: 'https://www.pockettactics.com/crystal-forest-2/codes' }] }]
;(window as any).electronAPI = { openUrl: async () => {}, clipboard: { writeText: async (value: string) => { copied.push(value); return { success: true } } }, roblox: {
  getActiveExperience: async () => null,
  searchGames: async (query: string) => suggestions.filter(game => !query || game.name.toLowerCase().includes(query.toLowerCase())),
  getCodes: async (name: string) => {
    calls.push(name)
    const game = suggestions.find(game => game.name === name) || { name }
    if (name === 'Rivals') await new Promise<void>(resolve => { finishRivals = resolve })
    return result(game)
  },
  onExperienceChange: (callback: (value: unknown) => void) => { listeners.add(callback); return () => listeners.delete(callback) },
  onCodesUpdated: (callback: (value: unknown) => void) => { updates.add(callback); return () => updates.delete(callback) },
} }
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Clipboard permission denied', 'NotAllowedError') } } })

function Fixture() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    useGameStore.getState().updateSettings({ language: 'en' })
    localStorage.removeItem('roblox_sound_notify')
    ;(window as any).__robloxFixture = { copied, calls, finishRivals: () => finishRivals?.(), select: (name: string) => window.dispatchEvent(new CustomEvent('roblox:select-game-codes', { detail: { gameName: name, ...suggestions.find(game => game.name === name) } })), live: () => listeners.forEach(callback => callback({ ...ROBLOX_CODE_GAMES[0] })), publishRivals: () => updates.forEach(callback => callback(result(ROBLOX_CODE_GAMES[1]))), language: (language: 'de' | 'en') => useGameStore.getState().updateSettings({ language }), notifications: () => useUIStore.getState().notificationHistory }
    setReady(true)
  }, [])
  return <QueryClientProvider client={client}><main style={{ padding: '28px', minHeight: '100vh', background: 'radial-gradient(ellipse at 5% 5%,#45251455,transparent 65%),#0b0b0d', color: '#fff' }}>{ready && <><RobloxCodesHub /><RobloxPopularGames /></>}</main></QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
