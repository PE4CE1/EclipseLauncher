import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  sendGamepadState: (state: any) => ipcRenderer.send('gamepad:state', state),
})
