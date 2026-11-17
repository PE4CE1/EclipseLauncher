/** Route desktop HTTP through the main process while retaining browser CORS in previews. */
export async function desktopFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const bridge = typeof window !== 'undefined' ? window.electronAPI : undefined
  const request = input instanceof Request ? input : null
  const url = request?.url ?? String(input)
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
  if (!bridge?.requestText || !/^https?:\/\//i.test(url) || (method !== 'GET' && method !== 'HEAD')) {
    return globalThis.fetch(input, init)
  }

  const signal = init?.signal ?? request?.signal
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  const id = crypto.randomUUID()
  const headers = Object.fromEntries(new Headers(init?.headers ?? request?.headers).entries())

  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => {
      signal?.removeEventListener('abort', onAbort)
      bridge.cancelRequest?.(id)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    bridge.requestText({ id, url, method, headers }).then(result => {
      if (signal?.aborted) return
      const response = new Response(method === 'HEAD' || [204, 205, 304].includes(result.status) ? null : result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      })
      Object.defineProperty(response, 'url', { value: result.url || url })
      resolve(response)
    }).catch(reject).finally(() => signal?.removeEventListener('abort', onAbort))
  })
}
