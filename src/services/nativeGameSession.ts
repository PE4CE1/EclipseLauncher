type DetectedSession = { name: string; startTime: number }
type NativeSessionAPI = {
  getCurrentGame?: () => Promise<DetectedSession | null>
  onGameStarted?: (callback: (game: DetectedSession) => void) => (() => void)
  onGameStopped?: (callback: () => void) => (() => void)
}

export function watchNativeGameSession(api: NativeSessionAPI | undefined, started: (game: DetectedSession) => void, stopped: (reconcileOnly: boolean) => void) {
  let revision = 0, disposed = false
  let pending: Promise<void> | undefined
  const stopStart = api?.onGameStarted?.(game => { revision++; if (!disposed && game?.name) started(game) })
  const stopEnd = api?.onGameStopped?.(() => { revision++; if (!disposed) stopped(false) })
  const refresh = () => {
    if (disposed || !api?.getCurrentGame) return Promise.resolve()
    if (pending) return pending
    const observed = revision
    pending = api.getCurrentGame().then(game => {
      // A late startup/focus snapshot cannot overwrite a newer start/stop event.
      if (disposed || observed !== revision) return
      if (game?.name) started(game)
      else stopped(true)
    }).catch(() => {}).finally(() => { pending = undefined })
    return pending
  }
  void refresh()
  return { refresh, dispose: () => { disposed = true; revision++; stopStart?.(); stopEnd?.() } }
}
