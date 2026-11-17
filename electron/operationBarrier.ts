let active = 0, switching = false
const protectedChannels = new Set(['clips:save', 'clips:export', 'clips:optimize', 'clips:save-draft', 'clips:update-meta', 'clips:delete', 'clips:copy-file', 'clips:save-settings', 'settings:set'])

export function runProtectedOperation(channel: string, operation: () => unknown): unknown {
  if (!protectedChannels.has(channel)) return operation()
  if (switching) throw new Error('Eclipse is restarting. Please wait.')
  active++
  try { return Promise.resolve(operation()).finally(() => { active-- }) }
  catch (error) { active--; throw error }
}
export function beginModeSwitch(): boolean {
  if (switching || active) return false
  switching = true
  return true
}
export function cancelModeSwitch(): void { switching = false }
