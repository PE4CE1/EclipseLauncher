import type { WebContents } from 'electron'
import { isTrustedWebContents } from './ipcSecurity'

export function attachRendererLogging(contents: WebContents): void {
  contents.on('console-message', details => {
    // DevTools has its own WebContents. Its protocol diagnostics are not app errors.
    if (!isTrustedWebContents(contents)) return
    if (details.level === 'error') console.error('[Renderer]', details.message)
    else if (details.level === 'warning') console.warn('[Renderer]', details.message)
  })
}
