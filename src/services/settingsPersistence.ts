import type { AppSettings } from '../types/game'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'

type Key = keyof AppSettings
const fields = new Map<Key, { committed: unknown; revision: number; pending: number }>()
let revision = 0
let tail: Promise<unknown> = Promise.resolve()

/** Serialize disk writes; a failed older toggle must never undo a newer one. */
export function persistAppSettings(patch: Partial<AppSettings>): Promise<boolean> {
  const store = useGameStore.getState(), keys = Object.keys(patch) as Key[], version = ++revision
  for (const key of keys) {
    const field = fields.get(key) || { committed: store.settings[key], revision: version, pending: 0 }
    field.revision = version; field.pending++; fields.set(key, field)
  }
  store.updateSettings(patch)
  const work = tail.then(async () => {
    let success = false
    try {
      const save = window.electronAPI?.setSettings
      success = !save || (await save(patch))?.success === true
    } catch { /* Roll back only the still-current failed values below. */ }
    const rollback: Partial<AppSettings> = {}
    for (const key of keys) {
      const field = fields.get(key)!
      if (success) field.committed = patch[key]
      else if (field.revision === version && Object.is(useGameStore.getState().settings[key], patch[key])) Object.assign(rollback, { [key]: field.committed })
      if (--field.pending === 0) fields.delete(key)
    }
    if (Object.keys(rollback).length) useGameStore.getState().updateSettings(rollback)
    if (!success) {
      const de = useGameStore.getState().settings.language !== 'en'
      useUIStore.getState().showNotification(de ? 'Die Einstellungen konnten nicht gespeichert werden. Die Änderung wurde zurückgenommen.' : 'Settings could not be saved. The change was reverted.', 'error')
    }
    return success
  })
  tail = work.catch(() => {})
  return work
}
