import { useGameStore } from '../src/store/gameStore'
export const key = 'ECL-SEC-ABCDEFGH-JKLMNPQR-STUVWXYZ-23456789'
export const accountFixtureCalls = { setup: 0, restored: [] as string[] }
export async function enableSecureRecovery() {
  accountFixtureCalls.setup++
  useGameStore.getState().updateSettings({ accountSecret: key, accountRecoveryReady: true, accountRecoveryError: '', accountRecoveryErrorCode: '' })
  return { success: true }
}
export async function restoreAccountBySecret(value: string) { accountFixtureCalls.restored.push(value); return { success: true } }
