import { createJSONStorage, type StateStorage, type PersistStorage } from 'zustand/middleware'

// Zustand calls storage even for transient scan/progress state. Compare the
// partialized references before serializing a potentially large game library.
export function createReferenceStorage<S extends object>(getStorage: () => StateStorage, settingsOnly = false): PersistStorage<S> | undefined {
  const storage = createJSONStorage<S>(getStorage)
  if (!storage) return undefined
  const previous = new Map<string, { state: S; version?: number }>()
  return {
    getItem: name => {
      const select = (value: any) => value && settingsOnly ? { ...value, state: { settings: value.state.settings } } : value
      const value = storage.getItem(name)
      return value instanceof Promise ? value.then(select) : select(value)
    },
    removeItem: name => { previous.delete(name); return storage.removeItem(name) },
    setItem: (name, value) => {
      const old = previous.get(name)
      const keys = Object.keys(value.state) as (keyof S)[]
      if (old && old.version === value.version && Object.keys(old.state).length === keys.length &&
          keys.every(key => Object.is(old.state[key], value.state[key]))) return
      const write = (saved: any) => storage.setItem(name, settingsOnly && saved ? { ...value, state: { ...saved.state, ...value.state } } : value)
      const saved = settingsOnly ? storage.getItem(name) : null
      const result = saved instanceof Promise ? saved.then(write) : write(saved)
      previous.set(name, value)
      return result
    },
  }
}
