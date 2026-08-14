import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { FriendsStandaloneApp } from './FriendsStandaloneApp'
import './index.css'

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
    <QueryClientProvider client={queryClient}>
      {isFriendsWindow ? <FriendsStandaloneApp /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>
)
