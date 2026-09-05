import React from 'react'
import ReactDOM from 'react-dom/client'
import { StreamStudioApp } from './components/stream/StreamStudioApp'
import './index.css'

ReactDOM.createRoot(document.getElementById('stream-root')!).render(
  <React.StrictMode>
    <StreamStudioApp />
  </React.StrictMode>
)
