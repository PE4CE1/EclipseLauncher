import { socialSettingKeys, type SocialSnapshot, type SocialStateAPI } from '../types/socialState'
import type { useGameStore } from '../store/gameStore'

type State = ReturnType<typeof useGameStore.getState>
type Store = Pick<typeof useGameStore, 'getState' | 'subscribe'>

export function startSocialStatePublisher(api: SocialStateAPI, store: Store, uid: () => string,
  denied: () => boolean, refresh: (force: boolean) => Promise<void>, inbox: () => SocialSnapshot['chatInbox'] = () => undefined) {
  let previous: State | undefined, previousUid: string | undefined, previousDenied: boolean | undefined
  let previousInbox: SocialSnapshot['chatInbox']
  const publish = () => {
    const state = store.getState(), userUid = uid(), permissionDenied = denied(), chatInbox = inbox()
    const game = state.activeGame, lastGame = previous?.activeGame
    if (previous && previousUid === userUid && previousDenied === permissionDenied && previousInbox === chatInbox
      && game?.id === lastGame?.id && game?.name === lastGame?.name && game?.startTime === lastGame?.startTime
      && socialSettingKeys.every(key => state.settings[key] === previous!.settings[key])) return
    previous = state; previousUid = userUid; previousDenied = permissionDenied; previousInbox = chatInbox
    api.publish({ uid: userUid, settings: { ...Object.fromEntries(socialSettingKeys.map(key => [key, state.settings[key]])), userUid },
      activeGame: game ? { id: game.id, name: game.name, startTime: game.startTime } : null, permissionDenied, chatInbox })
  }
  const unsubscribe = store.subscribe(publish)
  const stopRefresh = api.onRefresh(request => {
    void refresh(request.force).then(() => {
      publish(); api.completeRefresh({ id: request.id, success: true })
    }).catch(error => api.completeRefresh({ id: request.id, success: false, error: error instanceof Error ? error.message : 'Could not refresh friends' }))
  })
  publish()
  return { publish, stop: () => { unsubscribe(); stopRefresh() } }
}

/** Subscribe before fetching so a delayed initial response cannot replace a newer live update. */
export function receiveSocialState(api: SocialStateAPI, apply: (snapshot: SocialSnapshot | null) => void) {
  let disposed = false, revision = 0
  const stop = api.onSnapshot(snapshot => { revision++; if (!disposed) apply(snapshot) })
  const initialRevision = revision
  void api.getSnapshot().then(snapshot => { if (!disposed && revision === initialRevision) apply(snapshot) }).catch(() => {})
  return () => { disposed = true; stop() }
}
