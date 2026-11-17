const pending = new Set<HTMLElement>()
let observer: IntersectionObserver | undefined

function visibilityChanged() {
  document.documentElement.toggleAttribute('data-cover-loading-paused', document.hidden)
}

/** One observer for pending covers; no scroll handlers, timers or animation-frame work. */
export function observeCoverLoading(element: HTMLElement): () => void {
  if (!pending.size) {
    document.addEventListener('visibilitychange', visibilityChanged)
    visibilityChanged()
    if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement
        if (pending.has(target)) target.toggleAttribute('data-cover-visible', entry.isIntersecting)
      }
    })
  }
  pending.add(element)
  if (observer) observer.observe(element)
  else element.toggleAttribute('data-cover-visible', true)
  return () => {
    pending.delete(element); observer?.unobserve(element)
    if (!pending.size) {
      observer?.disconnect(); observer = undefined
      document.removeEventListener('visibilitychange', visibilityChanged)
      document.documentElement.removeAttribute('data-cover-loading-paused')
    }
  }
}
