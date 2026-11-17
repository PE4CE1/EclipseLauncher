export class QueueCapacityError extends Error {}

/** Reservation includes the running task so queued snapshots have a fixed memory budget. */
export function createBoundedWorkQueue(maxTasks: number, maxBytes: number) {
  let count = 0, bytes = 0, tail: Promise<unknown> = Promise.resolve()
  return {
    get count() { return count },
    run<T>(size: number, operation: () => Promise<T>): Promise<T> {
      if (!Number.isFinite(size) || size < 0 || count >= maxTasks || bytes + size > maxBytes) return Promise.reject(new QueueCapacityError('Clip queue capacity reached'))
      count++; bytes += size
      const result = tail.then(operation)
      tail = result.catch(() => {})
      return result.finally(() => { count--; bytes -= size })
    },
  }
}
