/** Bound retained data while keeping recently viewed results immediately available. */
export class LruCache<K, V> extends Map<K, V> {
  constructor(private readonly limit: number) {
    super()
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Cache limit must be a positive integer')
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined
    const value = super.get(key)!
    super.delete(key)
    super.set(key, value)
    return value
  }

  override set(key: K, value: V): this {
    super.delete(key)
    super.set(key, value)
    while (this.size > this.limit) super.delete(this.keys().next().value!)
    return this
  }
}
