import { ipcMain } from './ipcSecurity'
import { getGameFpsAccess, enableGameFpsAccess } from './gameFpsService'

export function initGameFpsIPC(): void {
  ipcMain.handle('fps:get-access', getGameFpsAccess)
  ipcMain.handle('fps:enable-access', enableGameFpsAccess)
}
