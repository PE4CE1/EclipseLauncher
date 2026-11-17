// Keep optional startup work out of the first interactive frame. The timeout
// also guarantees progress when a hidden window cannot receive animation frames.
export function scheduleBackgroundTask(task: () => void | Promise<unknown>, delay = 1500): () => void {
  let cancelled = false
  let idle: number | undefined
  const run = () => {
    if (!cancelled) Promise.resolve().then(task).catch(error => console.warn('[Startup]', error))
  }
  const timer = setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run, { timeout: 2000 })
    else run()
  }, delay)
  return () => {
    cancelled = true
    clearTimeout(timer)
    if (idle !== undefined) window.cancelIdleCallback(idle)
  }
}
