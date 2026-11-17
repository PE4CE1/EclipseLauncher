export async function copyText(value: string): Promise<void> {
  if (!value.length) throw new Error('Nothing to copy')
  // Native writes do not depend on Chromium clipboard permissions or focus.
  const native = typeof window !== 'undefined' ? window.electronAPI?.clipboard?.writeText : undefined
  if (native) {
    const result = await native(value)
    if (!result?.success) throw new Error('Clipboard is unavailable')
    return
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
  } catch { /* Older preload versions and browser previews can use the selection fallback. */ }
  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable')
  const focus = document.activeElement as HTMLElement | null
  const selection = document.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : []
  const field = document.createElement('textarea')
  field.value = value
  field.readOnly = true
  field.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none'
  document.body.appendChild(field)
  try {
    field.select()
    if (!document.execCommand('copy')) throw new Error('Clipboard is unavailable')
  } finally {
    field.remove()
    focus?.focus({ preventScroll: true })
    if (selection) { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range) }
  }
}
