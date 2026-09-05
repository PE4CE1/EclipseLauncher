import React from 'react'
import ReactDOM from 'react-dom/client'
import { OverlayApp } from './components/overlay/OverlayApp'
import './index.css'

// This entry point ONLY renders the overlay. It never loads the full launcher.
ReactDOM.createRoot(document.getElementById('overlay-root')!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
)
