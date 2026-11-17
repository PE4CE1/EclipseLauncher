import { ipcMain as nativeIpcMain, shell, type WebContents, type BrowserWindow } from 'electron'
import path from 'node:path'
import { isAllowedExternalUrl, isTrustedRendererUrl } from './securityPolicy'
import { openExternalApplication } from './externalLaunch'
import { runProtectedOperation } from './operationBarrier'

const distDirectory = path.join(__dirname, '../dist')
const trustedContents = new WeakSet<WebContents>()

export function isTrustedWebContents(contents: WebContents | null): boolean {
  return !!contents && !contents.isDestroyed()
    && trustedContents.has(contents)
    && isTrustedRendererUrl(contents.getURL(), distDirectory, process.env.VITE_DEV_SERVER_URL)
}

export function isTrustedIpcSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return isTrustedWebContents(event.sender) && !!event.senderFrame
    && event.senderFrame === event.sender.mainFrame
    && isTrustedRendererUrl(event.senderFrame.url, distDirectory, process.env.VITE_DEV_SERVER_URL)
}

// Every privileged handler shares the same boundary, including handlers in optional services.
export const ipcMain: Electron.IpcMain = new Proxy(nativeIpcMain, {
  get(target, property) {
    if (property === 'handle' || property === 'handleOnce') {
      return (channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => {
        target[property](channel, (event, ...args) => {
          if (!isTrustedIpcSender(event)) throw new Error('Untrusted IPC sender')
          return runProtectedOperation(channel, () => listener(event, ...args))
        })
      }
    }
    if (property === 'on' || property === 'once') {
      return (channel: string, listener: (event: Electron.IpcMainEvent, ...args: any[]) => void) => {
        target[property](channel, (event, ...args) => {
          if (isTrustedIpcSender(event)) listener(event, ...args)
          else event.returnValue = null
        })
        return ipcMain
      }
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
})

export function secureAppWindow(window: BrowserWindow): void {
  const contents = window.webContents
  trustedContents.add(contents)
  contents.on('will-attach-webview', event => event.preventDefault())
  const guardNavigation = (event: Electron.Event, url: string) => {
    if (!isTrustedRendererUrl(url, distDirectory, process.env.VITE_DEV_SERVER_URL)) event.preventDefault()
  }
  contents.on('will-navigate', guardNavigation)
  contents.on('will-redirect', guardNavigation)
  contents.setWindowOpenHandler(({ url }) => {
    // Remote pages always open in the system browser, without the launcher preload.
    if (/^https?:/i.test(url) && isAllowedExternalUrl(url)) void openExternalApplication(url).catch(() => {})
    return { action: 'deny' }
  })
}
