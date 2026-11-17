import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import './index.css'
import './components/shared/select.css'
import { LaunchOverlayProvider } from './components/splash/LaunchOverlay'
import { useGameStore } from './store/gameStore'
import { observeMemoryPressure } from './services/rendererMemoryBudget'
import { runtimeMode } from './services/runtimeMode'

const updateDocumentLanguage = () => { document.documentElement.lang = useGameStore.getState().settings.language === 'en' ? 'en' : 'de' }
updateDocumentLanguage()
const stopLanguageSync = useGameStore.subscribe((state, previous) => {
  if (state.settings.language !== previous.settings.language) updateDocumentLanguage()
})
if (import.meta.hot) import.meta.hot.dispose(stopLanguageSync)

const App = React.lazy(() => import('./App'))
const ClipsApp = React.lazy(() => import('./ClipsApp'))
const FriendsStandaloneApp = React.lazy(() => import('./FriendsStandaloneApp').then(module => ({ default: module.FriendsStandaloneApp })))
const SteamMonitorStandaloneApp = React.lazy(() => import('./SteamMonitorStandaloneApp').then(module => ({ default: module.SteamMonitorStandaloneApp })))
const LaunchPreview = React.lazy(() => import('./LaunchPreview'))

const CACHE_VERSION = 'v9'
// Clear all old game-list caches so we always get fresh live data
try {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('eclipse_cached_') && !key.endsWith(CACHE_VERSION)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
} catch { /* ignore */ }

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 60,
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
})

const stopMemoryPressure = observeMemoryPressure(queryClient)
if (import.meta.hot) import.meta.hot.dispose(stopMemoryPressure)

// Listen for system memory trim events to flush inactive query caches and trigger renderer GC
if (typeof window !== 'undefined' && window.electronAPI?.onMemoryTrim) {
  window.electronAPI.onMemoryTrim(() => {
    try {
      // Protect Steam and Deals queries from being wiped so switching tabs generates ZERO network calls!
      queryClient.removeQueries({
        type: 'inactive',
        predicate: (query) => {
          const firstKey = query.queryKey[0]
          return firstKey !== 'steam' && firstKey !== 'deals'
        }
      })
    } catch {}
    try {
      if (typeof window !== 'undefined' && (window as any).gc) {
        (window as any).gc()
      }
    } catch {}
  })
}

const isFriendsWindow = window.location.hash.includes('friends')
const isSteamMonitorWindow = window.location.hash.includes('steam-monitor')
const isLaunchPreview = window.location.hash === '#launch-preview'

const standalone = isFriendsWindow || isSteamMonitorWindow
const content = <React.Suspense fallback={standalone ? <div className="h-screen bg-[#07080a]" /> : null}>
  {isLaunchPreview ? <LaunchPreview /> : isFriendsWindow ? <FriendsStandaloneApp /> : isSteamMonitorWindow ? <SteamMonitorStandaloneApp /> : runtimeMode === 'clips' ? <ClipsApp /> : <App />}
</React.Suspense>

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {standalone || runtimeMode === 'clips' ? content : <LaunchOverlayProvider>{content}</LaunchOverlayProvider>}
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
