import type { ChatThread } from './friendChat'

type Receive = (threads: ChatThread[]) => void
type Fail = (error: unknown) => void
export function createSharedChatInbox(source: (uid: string, receive: Receive, fail: Fail) => () => void) {
  const accounts = new Map<string, { consumers: Set<{ receive: Receive; fail: Fail }>; value?: ChatThread[]; stop: () => void; failed: boolean }>()
  return (uid: string, receive: Receive, fail: Fail) => {
    let account = accounts.get(uid)
    const consumer = { receive, fail }
    if (!account) {
      account = { consumers: new Set(), stop: () => {}, failed: false }; accounts.set(uid, account)
      const current = account
      current.consumers.add(consumer)
      current.stop = source(uid, value => {
        current.value = value
        for (const listener of current.consumers) listener.receive(value)
      }, error => { current.failed = true; for (const listener of current.consumers) listener.fail(error) })
    } else {
      account.consumers.add(consumer)
      if (account.value) receive(account.value)
      if (account.failed) {
        account.stop(); account.failed = false
        const current = account
        current.stop = source(uid, value => { current.value = value; for (const listener of current.consumers) listener.receive(value) },
          error => { current.failed = true; for (const listener of current.consumers) listener.fail(error) })
      }
    }
    return () => {
      account!.consumers.delete(consumer)
      if (!account!.consumers.size) { account!.stop(); accounts.delete(uid) }
    }
  }
}
