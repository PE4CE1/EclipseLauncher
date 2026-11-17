import { collection, doc, onSnapshot, query, where, runTransaction, arrayUnion, serverTimestamp, type Firestore, type Unsubscribe } from 'firebase/firestore'
import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'
import type { EclipseFriend, FriendRequest } from '../types/game'

export type FriendResult = { success: boolean; state?: 'sent' | 'pending' | 'incoming' | 'friends'; friend?: EclipseFriend; message?: string; error?: string }
type Profile = Record<string, any> & { uid: string }
type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'
const key = (from: string, to: string) => `${from}__${to}`
const timestamp = (value: any) => typeof value?.toMillis === 'function' ? value.toMillis() : 0

export function friendFromProfile(data: Record<string, any>, uid: string): EclipseFriend {
  return { id: uid, username: data.username || 'Eclipse Player', avatarUrl: data.avatarUrl || '', friendCode: data.friendCode,
    status: data.status === 'ingame' ? 'ingame' : data.status === 'online' ? 'online' : 'offline', currentGame: data.currentGame || undefined,
    avatarFrame: data.avatarFrame || 'none', steamAvatarFrameUrl: data.steamAvatarFrameUrl, steamAvatarFrameStaticUrl: data.steamAvatarFrameStaticUrl,
    steamProfileUrl: data.steamProfileUrl, lastSeen: timestamp(data.lastSeen) || undefined }
}

export function createFriendRequests({ db, requireUid, findProfile, reportError }: {
  db: Firestore; requireUid: () => Promise<string>; findProfile: (value: string) => Promise<Profile | null>; reportError: (context: string, reason: unknown) => void
}) {
  let subscriptions: Unsubscribe[] = [], subscribedUid = '', generation = 0, failed = false
  const errorResult = (reason: unknown): FriendResult => {
    reportError('Friend requests', reason)
    return { success: false, error: reason instanceof Error ? reason.message : 'Friend request failed' }
  }
  const addLocal = (friend: EclipseFriend) => {
    const state = useGameStore.getState(), friends = state.settings.eclipseFriends || []
    if (!friends.some(item => item.id === friend.id)) state.updateSettings({ eclipseFriends: [...friends, friend] })
  }
  const stop = () => { generation++; subscriptions.splice(0).forEach(unsubscribe => unsubscribe()); subscribedUid = '' }
  const start = (uid: string, notify = true, force = false) => {
    if (subscribedUid === uid && !force && !failed) return
    stop(); subscribedUid = uid; failed = false
    const current = generation
    const seen = new Set((useGameStore.getState().settings.incomingFriendRequests || []).map(item => `${item.fromUid}:${item.timestamp}`))
    for (const incoming of [true, false]) {
      const q = query(collection(db, 'friend_requests'), where(incoming ? 'toUid' : 'fromUid', '==', uid), where('status', '==', 'pending'))
      subscriptions.push(onSnapshot(q, snapshot => {
        if (generation !== current) return
        const records = snapshot.docs.map(item => item.data()).filter(item => item.status === 'pending' && item.fromUid !== item.toUid && (incoming ? item.toUid : item.fromUid) === uid)
          .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))
        if (incoming) {
          const requests: FriendRequest[] = records.map(item => ({ fromUid: item.fromUid, fromUsername: item.fromUsername || 'Eclipse Player', fromAvatarUrl: item.fromAvatarUrl || '', fromFriendCode: item.fromFriendCode || '', timestamp: timestamp(item.createdAt) }))
          useGameStore.getState().updateSettings({ incomingFriendRequests: requests })
          const added = requests.filter(item => !seen.has(`${item.fromUid}:${item.timestamp}`))
          for (const item of requests) seen.add(`${item.fromUid}:${item.timestamp}`)
          while (seen.size > 1000) seen.delete(seen.values().next().value!)
          if (notify && added.length && !snapshot.metadata.hasPendingWrites) {
            const de = useGameStore.getState().settings.language === 'de'
            void sendAppNotification({ title: de ? 'Freundschaftsanfrage' : 'Friend request',
              body: added.length === 1 ? (de ? `${added[0].fromUsername} möchte dich hinzufügen. Unter Freunde kannst du die Anfrage annehmen.` : `${added[0].fromUsername} wants to add you. Open Friends to accept the request.`)
                : (de ? `${added.length} neue Freundschaftsanfragen. Öffne Freunde, um sie anzusehen.` : `${added.length} new friend requests. Open Friends to review them.`), duration: 6000 })
          }
        } else useGameStore.getState().updateSettings({ outgoingFriendRequests: records.map(item => ({ toUid: item.toUid, toUsername: item.toUsername || 'Eclipse Player', toAvatarUrl: item.toAvatarUrl || '', toFriendCode: item.toFriendCode || '', timestamp: timestamp(item.createdAt) })) })
      }, reason => { if (generation !== current) return; failed = true; reportError('Listen to friend requests', reason) }))
    }
  }
  const send = async (identifier: string): Promise<FriendResult> => {
    try {
      const uid = await requireUid(), target = await findProfile(identifier)
      if (!target) return { success: false, error: 'Player not found' }
      if (uid === target.uid) return { success: false, error: 'Cannot add yourself' }
      return await runTransaction(db, async tx => {
        const mine = doc(db, 'users', uid), theirs = doc(db, 'users', target.uid)
        const ownRequest = doc(db, 'friend_requests', key(uid, target.uid)), reverse = doc(db, 'friend_requests', key(target.uid, uid))
        const [me, other, pending, incoming] = await Promise.all([tx.get(mine), tx.get(theirs), tx.get(ownRequest), tx.get(reverse)])
        if (!me.exists() || !other.exists() || other.data().schemaVersion !== 2) throw Error('Player not found')
        if ((me.data().friends || []).includes(target.uid)) return { success: true, state: 'friends', friend: friendFromProfile(other.data(), target.uid) }
        if (incoming.exists() && incoming.data().status === 'pending') return { success: true, state: 'incoming' }
        if (pending.exists() && pending.data().status === 'pending') return { success: true, state: 'pending' }
        if (pending.exists()) {
          const previous = pending.data(), delay = previous.status === 'declined' ? 24 * 60 * 60_000 : previous.status === 'cancelled' ? 60_000 : 0
          if (delay && Date.now() - timestamp(previous.updatedAt) < delay) return { success: false, error: 'Please wait before sending this request again' }
        }
        const from = me.data(), to = other.data()
        tx.set(ownRequest, { fromUid: uid, toUid: target.uid, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          fromUsername: from.username || 'Eclipse Player', fromAvatarUrl: typeof from.avatarUrl === 'string' && from.avatarUrl.length <= 2048 ? from.avatarUrl : '', fromFriendCode: from.friendCode || '',
          toUsername: to.username || 'Eclipse Player', toAvatarUrl: typeof to.avatarUrl === 'string' && to.avatarUrl.length <= 2048 ? to.avatarUrl : '', toFriendCode: to.friendCode || '' })
        return { success: true, state: 'sent' }
      })
    } catch (reason) { return errorResult(reason) }
  }
  const respond = async (otherUid: string, status: Exclude<RequestStatus, 'pending'>): Promise<FriendResult> => {
    try {
      const uid = await requireUid()
      if (!otherUid || otherUid.includes('/') || otherUid === uid) return { success: false, error: 'Invalid friend request' }
      const from = status === 'cancelled' ? uid : otherUid, to = status === 'cancelled' ? otherUid : uid
      const requestRef = doc(db, 'friend_requests', key(from, to))
      const friend = await runTransaction(db, async tx => {
        const request = await tx.get(requestRef)
        if (!request.exists() || request.data().status !== 'pending') throw Error('Request no longer available')
        let result: EclipseFriend | undefined
        if (status === 'accepted') {
          const ownRef = doc(db, 'users', uid), otherRef = doc(db, 'users', otherUid)
          const [me, other] = await Promise.all([tx.get(ownRef), tx.get(otherRef)])
          if (!me.exists() || !other.exists()) throw Error('Player not found')
          if ((me.data().friends || []).length >= 500 || (other.data().friends || []).length >= 500) throw Error('Friend limit reached')
          result = friendFromProfile(other.data(), otherUid)
          tx.update(ownRef, { friends: arrayUnion(otherUid) }); tx.update(otherRef, { friends: arrayUnion(uid) })
        }
        tx.update(requestRef, { status, updatedAt: serverTimestamp() })
        return result
      })
      const state = useGameStore.getState()
      if (status === 'cancelled') state.updateSettings({ outgoingFriendRequests: state.settings.outgoingFriendRequests?.filter(item => item.toUid !== otherUid) })
      else state.updateSettings({ incomingFriendRequests: state.settings.incomingFriendRequests?.filter(item => item.fromUid !== otherUid) })
      if (friend) addLocal(friend)
      return { success: true, friend }
    } catch (reason) { return errorResult(reason) }
  }
  return { start, stop, send, accept: (uid: string) => respond(uid, 'accepted'), decline: (uid: string) => respond(uid, 'declined'), cancel: (uid: string) => respond(uid, 'cancelled') }
}
