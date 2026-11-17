/// <reference types="vite/client" />

declare module '*.png' {
  const value: string
  export default value
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: any
    }
  }

  interface Window {
    electronAPI?: {
      [key: string]: any
      openUrl?: (url: string, fallbackUrl?: string) => Promise<{ success: boolean; error?: string; fallback?: boolean }>
    }
  }
}
