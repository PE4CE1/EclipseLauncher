/** Omit optional map fields without destroying Firestore sentinels or timestamps. */
export function firestoreData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : firestoreData(item)) as T
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype === Object.prototype || prototype === null) {
      return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, firestoreData(child)])) as T
    }
  }
  return value
}
