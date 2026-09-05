import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { FriendsStandaloneApp } from './FriendsStandaloneApp'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import './index.css'

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
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
})

const isFriendsWindow = window.location.hash.includes('friends')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {isFriendsWindow ? <FriendsStandaloneApp /> : <App />}
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
