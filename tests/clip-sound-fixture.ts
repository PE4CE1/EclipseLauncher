declare global { interface Window { __clipConfirmationSounds?: { at: number; preset: string }[] } }
export function playNotificationSound(preset = 'eclipse_calm') {
  (window.__clipConfirmationSounds ??= []).push({ at: performance.now(), preset })
}
