import { clipboard } from 'electron'
import { ipcMain } from './ipcSecurity'

export async function writeClipboardText(value: unknown): Promise<{ success: boolean }> {
  if (typeof value !== 'string' || !value.length || value.length > 65_536 || value.includes('\0')) return { success: false }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await clipboard.writeText(value)
      return { success: true }
    } catch {
      // Windows can briefly lock the clipboard while another application reads it.
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 30 * (attempt + 1)))
    }
  }
  return { success: false }
}

export function initClipboardIPC(): void {
  ipcMain.handle('clipboard:write-text', (_event, value: unknown) => writeClipboardText(value))
}
