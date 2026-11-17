function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (!Array.isArray(a) && (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype)) return false
  const left = Object.keys(a), right = Object.keys(b)
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key)
    && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

export function changedProfileFields(previous: Record<string, unknown>, next: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => !equal(previous[key], value)))
}

/** Serialize writes and read the latest local state again if an edit arrives during a sync. */
export function coalesceProfileSync(sync: () => Promise<void>) {
  let pending: Promise<void> | undefined, requested = false
  return () => {
    requested = true
    if (!pending) pending = Promise.resolve().then(async () => {
      try { while (requested) { requested = false; await sync() } }
      finally { pending = undefined }
    })
    return pending
  }
}
