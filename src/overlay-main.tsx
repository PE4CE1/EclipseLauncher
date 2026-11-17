import React from 'react'
import ReactDOM from 'react-dom/client'
import { runtimeMode } from './services/runtimeMode'
import './index.css'

const OverlayApp = React.lazy(() => import('./components/overlay/OverlayApp').then(module => ({ default: module.OverlayApp })))
const ClipsToastApp = React.lazy(() => import('./components/overlay/ClipsToastApp'))

// This entry point ONLY renders the overlay. It never loads the full launcher.
ReactDOM.createRoot(document.getElementById('overlay-root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={null}>{runtimeMode === 'clips' ? <ClipsToastApp/> : <OverlayApp/>}</React.Suspense>
  </React.StrictMode>
)
