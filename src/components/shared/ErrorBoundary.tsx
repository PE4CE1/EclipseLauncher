import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Eclipse ErrorBoundary] Uncaught React error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#040405] text-white p-8 select-none">
          <div className="bg-[#111317] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5 shadow-lg">
              <AlertTriangle size={28} />
            </div>
            
            <h2 className="text-lg font-bold text-white mb-2">Oberfläche neu laden</h2>
            <p className="text-xs text-white/50 mb-6 leading-relaxed">
              Ein unerwarteter Fehler ist aufgetreten. Klicke unten, um Eclipse Launcher neu zu laden.
            </p>

            <button
              onClick={this.handleReload}
              className="w-full py-3 bg-white text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] transition-all shadow-md cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Eclipse neu laden</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
