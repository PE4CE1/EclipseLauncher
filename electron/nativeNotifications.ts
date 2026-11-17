import { Notification, type NotificationConstructorOptions } from 'electron'

const active = new Set<Notification>()

/** Retain native notifications until Windows closes them, including Action Center clicks. */
export function showDesktopNotification(options: NotificationConstructorOptions, onClick?: () => void): Promise<boolean> {
  if (!Notification.isSupported()) return Promise.resolve(false)
  return new Promise(resolve => {
    let notification: Notification | undefined
    let settled = false
    const finish = (shown: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(shown)
    }
    const timer = setTimeout(() => finish(false), 5000)
    timer.unref()
    try {
      notification = new Notification(options)
      active.add(notification)
      const current = notification
      current.once('show', () => finish(true))
      current.once('failed', (_event, error) => {
        active.delete(current)
        console.warn('[Notification] Windows notification failed:', error)
        finish(false)
      })
      current.once('close', () => { active.delete(current); finish(false) })
      current.once('click', () => {
        finish(true)
        active.delete(current)
        try { onClick?.() } catch (error) { console.warn('[Notification] Click failed:', error) }
      })
      while (active.size > 32) { const oldest = active.values().next().value!; active.delete(oldest); oldest.close() }
      current.show()
    } catch (error) {
      if (notification) active.delete(notification)
      console.warn('[Notification] Could not show native notification:', error)
      finish(false)
    }
  })
}
