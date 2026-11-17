/** Bound large network/JSON jobs without serializing independent small tasks. */
export function createConcurrentQueue(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Invalid concurrency limit')
  let active = 0
  const waiting: (() => void)[] = []
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          active++
          void Promise.resolve().then(operation).then(resolve, reject).finally(() => {
            active--; waiting.shift()?.()
          })
        }
        if (active < limit) start()
        else waiting.push(start)
      })
    },
  }
}
