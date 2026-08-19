import { initializeApp, getApps, getApp } from 'firebase/app'
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth'
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  getDocs, 
  arrayUnion, 
  arrayRemove, 
  serverTimestamp,
  type Unsubscribe 
} from 'firebase/firestore'
import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'
import type { EclipseFriend, FriendRequest } from '../types/game'

// Firebase Configuration provided by project owner
const firebaseConfig = {
  apiKey: "AIzaSyAOR-CFcO8odv7tCnAwjgyymAw8Rkq-mw4",
  authDomain: "eclipse-launcher-d4cd3.firebaseapp.com",
  projectId: "eclipse-launcher-d4cd3",
  storageBucket: "eclipse-launcher-d4cd3.firebasestorage.app",
  messagingSenderId: "891659838094",
  appId: "1:891659838094:web:538b30ab03343c77cb5fdf",
  measurementId: "G-WB8W6P9T45"
}

// Initialize Firebase App singleton
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

let currentUserUnsub: Unsubscribe | null = null
let friendsQueryUnsub: Unsubscribe | null = null
let presenceHeartbeatInterval: any = null
let friendStalenessInterval: any = null
let cachedFriendDocs: any[] = []

const knownFriendIds = new Set<string>()
const knownRequestUids = new Set<string>()
let isInitialized = false

/**
 * Starts active heartbeat keeping user presence alive every 25 seconds
 */
export function startPresenceHeartbeat() {
  if (presenceHeartbeatInterval) clearInterval(presenceHeartbeatInterval)
  
  presenceHeartbeatInterval = setInterval(() => {
    const currentUid = auth.currentUser?.uid
    if (!currentUid) return
    const activeGame = useGameStore.getState().activeGame
    updateFirebasePresence(activeGame ? 'ingame' : 'online', activeGame?.name || null)
  }, 25000)
}

export function stopPresenceHeartbeat() {
  if (presenceHeartbeatInterval) {
    clearInterval(presenceHeartbeatInterval)
    presenceHeartbeatInterval = null
  }
  if (friendStalenessInterval) {
    clearInterval(friendStalenessInterval)
    friendStalenessInterval = null
  }
}

/**
 * Generates a clean unique Eclipse friend code (e.g. ECL-7X9K)
 */
export function generateEclipseFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'ECL-'
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Initialize Firebase Social Network:
 * 1. Anonymously authenticate user
 * 2. Sync local user profile & friend code to Firestore
 * 3. Subscribe in real time to current user doc, incoming friend requests & friends list
 * 4. Handle presence & live status changes
 */
export async function initFirebaseSocial() {
  if (isInitialized) return
  isInitialized = true

  try {
    onAuthStateChanged(auth, async (user: User | null) => {
      if (!user) {
        stopPresenceHeartbeat()
        try {
          await signInAnonymously(auth)
        } catch (authErr) {
          console.warn('[Firebase] Anonymous sign-in error:', authErr)
        }
        return
      }

      await syncMyProfile(user)
      listenToMyUserDoc(user.uid)
      startPresenceHeartbeat()
    })
  } catch (err) {
    console.warn('[Firebase] Init error:', err)
  }
}

/**
 * Syncs the local user's full profile (stats, playtime, steam level, badges, top games) to Firestore
 */
export async function syncMyProfile(user?: User | null) {
  const activeUser = user || auth.currentUser
  if (!activeUser) return

  try {
    const { settings, library, installedGames, activeGame } = useGameStore.getState()
    let friendCode = settings.friendCode

    if (!friendCode) {
      friendCode = generateEclipseFriendCode()
      useGameStore.getState().updateSettings({ friendCode })
    }

    const userRef = doc(db, 'users', activeUser.uid)
    const snap = await getDoc(userRef)

    const isIngame = !!activeGame
    const activeGameName = activeGame?.name || null

    // Combine unique games for playtime calculations
    const allUserGamesMap = new Map<string, any>()
    const lib = library || []
    const inst = installedGames || []

    lib.forEach(g => allUserGamesMap.set(g.id || g.name, { ...g }))
    inst.forEach(g => {
      const key = g.id || g.name
      let base = allUserGamesMap.get(key)
      if (!base) {
        const found = Array.from(allUserGamesMap.entries()).find(([_, lg]) => lg.name.toLowerCase() === g.name.toLowerCase())
        if (found) {
          base = found[1]
          allUserGamesMap.delete(found[0])
        }
      }
      const existing = base || {}
      allUserGamesMap.set(key, {
        ...existing,
        ...g,
        playTimeMinutes: Math.max(existing.playTimeMinutes || 0, g.playTimeMinutes || 0),
        lastPlayed: Math.max(existing.lastPlayed || 0, g.lastPlayed || 0)
      })
    })

    const allUserGames = Array.from(allUserGamesMap.values())
    const totalPlaytimeMins = Math.round(allUserGames.reduce((acc, g) => acc + (g.playTimeMinutes || 0), 0))
    const totalPlaytimeHours = totalPlaytimeMins >= 60 
      ? (totalPlaytimeMins / 60).toFixed(1) + 'h' 
      : `${totalPlaytimeMins}m`

    const topPlayedGames = [...allUserGames]
      .sort((a, b) => (b.playTimeMinutes || 0) - (a.playTimeMinutes || 0))
      .filter(g => (g.playTimeMinutes || 0) > 0)
      .slice(0, 5)
      .map(g => ({
        id: g.id || g.name,
        name: g.name,
        steamId: g.steamId || null,
        playTimeMinutes: g.playTimeMinutes || 0,
        lastPlayed: g.lastPlayed || 0
      }))

    const totalLibraryCount = inst.length + lib.filter(g => !inst.some(ig => ig.name === g.name)).length
    const totalInstalledCount = inst.filter(g => g.installed !== false).length

    const baseData = {
      uid: activeUser.uid,
      friendCode: friendCode.toUpperCase().trim(),
      username: settings.username || 'Eclipse Player',
      avatarUrl: settings.avatarUrl || '',
      status: isIngame ? 'ingame' : 'online',
      currentGame: isIngame ? activeGameName : null,
      lastSeen: serverTimestamp(),
      level: settings.steamLevel || 1,
      steamLevel: settings.steamLevel || 1,
      steamProfileUrl: settings.steamProfileUrl || '',
      steamGamesCount: settings.steamGamesCount || 0,
      steamBadgesCount: settings.steamBadgesCount || 0,
      steamFavoriteBadge: settings.steamFavoriteBadge || null,
      steamRecentGames: settings.steamRecentGames || [],
      totalPlaytimeMins,
      totalPlaytimeHours,
      totalLibraryCount,
      totalInstalledCount,
      topPlayedGames,
    }

    if (!snap.exists()) {
      await setDoc(userRef, {
        ...baseData,
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
        createdAt: serverTimestamp(),
      })
    } else {
      await updateDoc(userRef, baseData)
    }
  } catch (err) {
    console.warn('[Firebase] syncMyProfile error:', err)
  }
}

/**
 * Fetches a user's full public profile from Firestore by either their UID or their Eclipse Friend Code.
 */
export async function fetchUserProfile(uidOrCode: string): Promise<any | null> {
  if (!uidOrCode || typeof uidOrCode !== 'string') return null
  const clean = uidOrCode.trim()

  try {
    // 1. Try direct UID lookup
    const directDoc = await getDoc(doc(db, 'users', clean))
    if (directDoc.exists()) {
      return directDoc.data()
    }

    // 2. Try Friend Code lookup
    const q = query(collection(db, 'users'), where('friendCode', '==', clean.toUpperCase()))
    const snap = await getDocs(q)
    if (!snap.empty) {
      return snap.docs[0].data()
    }

    return null
  } catch (err) {
    console.warn('[Firebase] fetchUserProfile error:', err)
    return null
  }
}

/**
 * Listens to the current user's document in Firestore.
 * Handles incoming friend requests, active friends list, and presence syncing.
 */
function listenToMyUserDoc(uid: string) {
  if (currentUserUnsub) currentUserUnsub()

  const userRef = doc(db, 'users', uid)
  currentUserUnsub = onSnapshot(userRef, (docSnap) => {
    if (!docSnap.exists()) return

    const data = docSnap.data()
    const friendUids: string[] = Array.isArray(data?.friends) ? data.friends : []
    const incomingRequests: FriendRequest[] = Array.isArray(data?.incomingRequests) ? data.incomingRequests : []
    const outgoingRequests = Array.isArray(data?.outgoingRequests) ? data.outgoingRequests : []

    // Ensure our local friendCode is synced
    if (data?.friendCode && data.friendCode !== useGameStore.getState().settings.friendCode) {
      useGameStore.getState().updateSettings({ friendCode: data.friendCode })
    }

    // 1. Detect any newly received incoming friend requests and notify user!
    incomingRequests.forEach((req) => {
      if (!knownRequestUids.has(req.fromUid)) {
        knownRequestUids.add(req.fromUid)
        const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
        sendAppNotification({
          title: lang === 'de' ? 'Freundschaftsanfrage erhalten! 👥' : 'Friend Request Received! 👥',
          body: lang === 'de' 
            ? `${req.fromUsername} (${req.fromFriendCode || 'Eclipse'}) möchte dein Freund sein!` 
            : `${req.fromUsername} (${req.fromFriendCode || 'Eclipse'}) wants to be your friend!`,
          type: 'info',
          playSound: true,
          duration: 7000
        })
      }
    })

    // Update Zustand settings with requests
    useGameStore.getState().updateSettings({
      incomingFriendRequests: incomingRequests,
      outgoingFriendRequests: outgoingRequests
    })

    // 2. Listen to active confirmed friends presence
    listenToFriendsPresence(friendUids)
  }, (err) => {
    console.warn('[Firebase] listenToMyUserDoc error:', err)
  })
}

/**
 * Evaluates friend documents and determines live online/ingame/offline status based on heartbeat
 */
function evaluateFriendsPresence(docs: any[]) {
  const now = Date.now()
  const updatedFriends: EclipseFriend[] = []

  docs.forEach((docItem) => {
    const u = typeof docItem.data === 'function' ? docItem.data() : docItem
    if (!u || !u.uid) return

    let lastSeenMs = 0
    if (u.lastSeen) {
      if (typeof u.lastSeen.toMillis === 'function') {
        lastSeenMs = u.lastSeen.toMillis()
      } else if (typeof u.lastSeen.toDate === 'function') {
        lastSeenMs = u.lastSeen.toDate().getTime()
      } else if (typeof u.lastSeen === 'number') {
        lastSeenMs = u.lastSeen
      } else if (u.lastSeen.seconds) {
        lastSeenMs = u.lastSeen.seconds * 1000
      }
    }

    // Heartbeat Timeout: If lastSeen is older than 60s or missing, mark as OFFLINE
    const isTimedOut = !lastSeenMs || (now - lastSeenMs > 60 * 1000)

    let status: 'online' | 'offline' | 'ingame' = 'offline'
    if (!isTimedOut) {
      status = (u.status as 'online' | 'offline' | 'ingame') || 'offline'
    }

    // Ingame check: currentGame is only valid if status is active 'ingame'
    const currentGame = (status === 'ingame' && u.currentGame) ? u.currentGame : undefined

    const friendObj: EclipseFriend = {
      id: u.uid,
      username: u.username || 'Eclipse Player',
      avatarUrl: u.avatarUrl || '',
      status,
      currentGame,
      level: u.steamLevel || u.level || 1,
      steamLevel: u.steamLevel || u.level || 1,
      steamProfileUrl: u.steamProfileUrl || undefined,
      steamGamesCount: u.steamGamesCount || 0,
      steamBadgesCount: u.steamBadgesCount || 0,
      steamRecentGames: u.steamRecentGames || [],
      steamFavoriteBadge: u.steamFavoriteBadge || undefined,
      lastSeen: lastSeenMs || undefined,
      totalPlaytimeHours: u.totalPlaytimeHours || undefined,
      totalPlaytimeMins: u.totalPlaytimeMins || 0,
      totalLibraryCount: u.totalLibraryCount || 0,
      totalInstalledCount: u.totalInstalledCount || 0,
      topPlayedGames: u.topPlayedGames || [],
      friendCode: u.friendCode || undefined,
    }

    updatedFriends.push(friendObj)
    knownFriendIds.add(friendObj.id)
  })

  useGameStore.getState().updateSettings({
    eclipseFriends: updatedFriends
  })
}

/**
 * Sets up a real-time Firestore query for all friend user documents.
 * Updates Zustand store whenever any friend comes online, goes offline, or starts playing a game!
 */
function listenToFriendsPresence(friendUids: string[]) {
  if (friendsQueryUnsub) {
    friendsQueryUnsub()
    friendsQueryUnsub = null
  }
  if (friendStalenessInterval) {
    clearInterval(friendStalenessInterval)
    friendStalenessInterval = null
  }

  if (!friendUids || friendUids.length === 0) {
    cachedFriendDocs = []
    useGameStore.getState().updateSettings({ eclipseFriends: [] })
    return
  }

  // Firestore allows up to 30 items in 'in' queries; chunk if necessary
  const targetUids = friendUids.slice(0, 30)
  const q = query(collection(db, 'users'), where('uid', 'in', targetUids))

  // Watchdog timer: re-evaluates heartbeat every 10 seconds locally
  friendStalenessInterval = setInterval(() => {
    if (cachedFriendDocs.length > 0) {
      evaluateFriendsPresence(cachedFriendDocs)
    }
  }, 10000)

  friendsQueryUnsub = onSnapshot(q, (snapshot) => {
    cachedFriendDocs = snapshot.docs.map(d => d.data())

    snapshot.docs.forEach((docItem) => {
      const u = docItem.data()
      if (!knownFriendIds.has(u.uid) && knownFriendIds.size > 0) {
        const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
        sendAppNotification({
          title: lang === 'de' ? 'Freundschaftsanfrage angenommen! 🎉' : 'Friend Request Accepted! 🎉',
          body: lang === 'de' 
            ? `${u.username || 'Ein Spieler'} ist jetzt in deiner Eclipse-Freundesliste!` 
            : `${u.username || 'A player'} is now in your Eclipse friends list!`,
          type: 'success',
          playSound: true,
          duration: 6000
        })
      }
    })

    evaluateFriendsPresence(cachedFriendDocs)
  }, (err) => {
    console.warn('[Firebase] listenToFriendsPresence error:', err)
  })
}

/**
 * Sends a Friend Request to another user using their Eclipse Friend Code (or raw UID).
 * Does NOT auto-befriend; instead puts a pending request into the target's incomingRequests queue!
 */
export async function sendFriendRequest(codeOrUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const currentUid = auth.currentUser?.uid
  if (!currentUid) {
    return { success: false, error: 'Firebase ist noch nicht verbunden. Bitte kurz warten.' }
  }

  const cleanCode = codeOrUid.trim().toUpperCase()
  if (!cleanCode) {
    return { success: false, error: 'Bitte gib einen gültigen Freundes-Code ein.' }
  }

  try {
    // 1. Search for target user in Firestore
    let targetDocSnap = null
    let targetData: any = null

    const q = query(collection(db, 'users'), where('friendCode', '==', cleanCode))
    const snap = await getDocs(q)

    if (!snap.empty) {
      targetDocSnap = snap.docs[0]
      targetData = targetDocSnap.data()
    } else {
      // Check if raw UID was provided
      const directDoc = await getDoc(doc(db, 'users', codeOrUid.trim()))
      if (directDoc.exists()) {
        targetDocSnap = directDoc
        targetData = directDoc.data()
      }
    }

    if (!targetData || !targetData.uid) {
      return { success: false, error: 'Kein Spieler mit diesem Code gefunden. Überprüfe den Code.' }
    }

    const targetUid = targetData.uid

    // Check if adding self
    if (targetUid === currentUid) {
      return { success: false, error: 'Du kannst dir nicht selbst eine Freundschaftsanfrage senden.' }
    }

    // Check my current doc data
    const myRef = doc(db, 'users', currentUid)
    const mySnap = await getDoc(myRef)
    const myData = mySnap.data() || {}
    const myFriends: string[] = Array.isArray(myData.friends) ? myData.friends : []
    const myIncoming: FriendRequest[] = Array.isArray(myData.incomingRequests) ? myData.incomingRequests : []
    const myOutgoing = Array.isArray(myData.outgoingRequests) ? myData.outgoingRequests : []

    // 2. Check if already confirmed friends
    if (myFriends.includes(targetUid)) {
      return { success: false, error: `${targetData.username || 'Dieser Spieler'} ist bereits in deiner Freundesliste!` }
    }

    // 3. If target user already sent ME a request -> instantly accept it!
    const existingIncoming = myIncoming.find(req => req.fromUid === targetUid)
    if (existingIncoming) {
      return await acceptFriendRequest(targetUid)
    }

    // 4. Check if we already sent a request
    if (myOutgoing.some((req: any) => req.toUid === targetUid)) {
      return { success: false, error: 'Freundschaftsanfrage wurde bereits gesendet. Bitte warten.' }
    }

    const mySettings = useGameStore.getState().settings
    const now = Date.now()

    // 5. Construct request objects
    const requestForTarget: FriendRequest = {
      fromUid: currentUid,
      fromUsername: mySettings.username || myData.username || 'Eclipse Player',
      fromAvatarUrl: mySettings.avatarUrl || myData.avatarUrl || '',
      fromFriendCode: mySettings.friendCode || myData.friendCode || '',
      timestamp: now
    }

    const requestForMe = {
      toUid: targetUid,
      toUsername: targetData.username || 'Eclipse Player',
      toAvatarUrl: targetData.avatarUrl || '',
      toFriendCode: targetData.friendCode || '',
      timestamp: now
    }

    // 6. Write request to target user's incomingRequests
    const targetRef = doc(db, 'users', targetUid)
    await updateDoc(targetRef, {
      incomingRequests: arrayUnion(requestForTarget)
    })

    // 7. Write to my outgoingRequests
    await updateDoc(myRef, {
      outgoingRequests: arrayUnion(requestForMe)
    })

    const lang = mySettings.language === 'de' ? 'de' : 'en'
    return {
      success: true,
      message: lang === 'de' 
        ? `Freundschaftsanfrage an ${targetData.username || 'Spieler'} gesendet!` 
        : `Friend request sent to ${targetData.username || 'player'}!`
    }
  } catch (err: any) {
    console.error('[Firebase] sendFriendRequest error:', err)
    return { success: false, error: err.message || 'Fehler beim Senden der Anfrage.' }
  }
}

/**
 * Accepts an incoming friend request.
 * Adds both users to each other's friends array and clears the pending requests!
 */
export async function acceptFriendRequest(fromUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const currentUid = auth.currentUser?.uid
  if (!currentUid) return { success: false, error: 'Nicht angemeldet.' }

  // 1. Optimistically update local Zustand store immediately so the UI responds in 0ms
  const curSettings = useGameStore.getState().settings
  const curIncoming = curSettings.incomingFriendRequests || []
  const matchingLocalReq = curIncoming.find(r => r.fromUid === fromUid)
  const updatedIncoming = curIncoming.filter(r => r.fromUid !== fromUid)
  const curFriends = curSettings.eclipseFriends || []
  const newFriendObj: EclipseFriend = {
    id: fromUid,
    username: matchingLocalReq?.fromUsername || 'Eclipse Player',
    avatarUrl: matchingLocalReq?.fromAvatarUrl || '',
    status: 'online',
  }
  const updatedFriends = curFriends.some(f => f.id === fromUid) ? curFriends : [...curFriends, newFriendObj]
  useGameStore.getState().updateSettings({
    incomingFriendRequests: updatedIncoming,
    eclipseFriends: updatedFriends
  })

  try {
    const myRef = doc(db, 'users', currentUid)
    const mySnap = await getDoc(myRef)
    const myData = mySnap.data() || {}
    const incoming: FriendRequest[] = Array.isArray(myData.incomingRequests) ? myData.incomingRequests : []
    const matchingReq = incoming.find(r => r.fromUid === fromUid)

    const targetRef = doc(db, 'users', fromUid)
    const targetSnap = await getDoc(targetRef)
    const targetData = targetSnap.data() || {}

    // 2. Add target to my friends, remove from my incomingRequests in Firestore
    await updateDoc(myRef, {
      friends: arrayUnion(fromUid),
      incomingRequests: incoming.filter(r => r.fromUid !== fromUid)
    })

    // 3. Add me to target's friends, remove from target's outgoingRequests in Firestore
    const targetOutgoing = Array.isArray(targetData.outgoingRequests) ? targetData.outgoingRequests : []
    await updateDoc(targetRef, {
      friends: arrayUnion(currentUid),
      outgoingRequests: targetOutgoing.filter((r: any) => r.toUid !== currentUid)
    })

    // 4. Mark as known friend so we don't trigger self-notification
    knownFriendIds.add(fromUid)

    const lang = curSettings.language === 'de' ? 'de' : 'en'
    sendAppNotification({
      title: lang === 'de' ? 'Freundschaftsanfrage angenommen! 🎉' : 'Friend Request Accepted! 🎉',
      body: lang === 'de' 
        ? `Du bist jetzt mit ${matchingReq?.fromUsername || targetData.username || 'dem Spieler'} befreundet!` 
        : `You are now friends with ${matchingReq?.fromUsername || targetData.username || 'the player'}!`,
      type: 'success',
      playSound: true
    })

    return { success: true }
  } catch (err: any) {
    console.error('[Firebase] acceptFriendRequest error:', err)
    return { success: false, error: err.message || 'Fehler beim Annehmen der Anfrage.' }
  }
}

/**
 * Declines an incoming friend request.
 */
export async function declineFriendRequest(fromUid: string): Promise<{ success: boolean; error?: string }> {
  const currentUid = auth.currentUser?.uid
  if (!currentUid) return { success: false, error: 'Nicht angemeldet.' }

  // Optimistic local removal
  const curSettings = useGameStore.getState().settings
  const curIncoming = curSettings.incomingFriendRequests || []
  useGameStore.getState().updateSettings({
    incomingFriendRequests: curIncoming.filter(r => r.fromUid !== fromUid)
  })

  try {
    const myRef = doc(db, 'users', currentUid)
    const mySnap = await getDoc(myRef)
    const myData = mySnap.data() || {}
    const incoming: FriendRequest[] = Array.isArray(myData.incomingRequests) ? myData.incomingRequests : []

    await updateDoc(myRef, {
      incomingRequests: incoming.filter(r => r.fromUid !== fromUid)
    })

    // Clean from target's outgoingRequests
    const targetRef = doc(db, 'users', fromUid)
    const targetSnap = await getDoc(targetRef)
    if (targetSnap.exists()) {
      const targetData = targetSnap.data() || {}
      const targetOutgoing = Array.isArray(targetData.outgoingRequests) ? targetData.outgoingRequests : []
      await updateDoc(targetRef, {
        outgoingRequests: targetOutgoing.filter((r: any) => r.toUid !== currentUid)
      }).catch(() => {})
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Firebase] declineFriendRequest error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Truly removes a friend bilaterally from Firestore on BOTH sides and local Zustand store!
 */
export async function removeFirebaseFriend(friendId: string) {
  const currentUid = auth.currentUser?.uid
  if (currentUid) {
    try {
      // 1. Remove from my friends list in Firestore
      const myRef = doc(db, 'users', currentUid)
      await updateDoc(myRef, {
        friends: arrayRemove(friendId)
      })

      // 2. Remove me from target's friends list in Firestore
      const targetRef = doc(db, 'users', friendId)
      await updateDoc(targetRef, {
        friends: arrayRemove(currentUid)
      }).catch(() => {})
    } catch (err) {
      console.warn('[Firebase] removeFirebaseFriend error:', err)
    }
  }

  // 3. Update local Zustand store immediately
  knownFriendIds.delete(friendId)
  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  useGameStore.getState().updateSettings({
    eclipseFriends: currentFriends.filter(f => f.id !== friendId)
  })
}

/**
 * Restores a removed friend bilaterally (used by the minimalist Undo action)
 */
export async function restoreFirebaseFriend(friend: EclipseFriend) {
  const currentUid = auth.currentUser?.uid
  if (currentUid && friend?.id) {
    try {
      const myRef = doc(db, 'users', currentUid)
      await updateDoc(myRef, {
        friends: arrayUnion(friend.id)
      })

      const targetRef = doc(db, 'users', friend.id)
      await updateDoc(targetRef, {
        friends: arrayUnion(currentUid)
      }).catch(() => {})
    } catch (err) {
      console.warn('[Firebase] restoreFirebaseFriend error:', err)
    }
  }

  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  if (!currentFriends.some(f => f.id === friend.id)) {
    useGameStore.getState().updateSettings({
      eclipseFriends: [...currentFriends, friend]
    })
  }
}

/**
 * Updates current user's live presence (online, ingame, or offline)
 */
export async function updateFirebasePresence(status: 'online' | 'ingame' | 'offline', gameName?: string | null) {
  const currentUid = auth.currentUser?.uid
  if (!currentUid) return

  try {
    const userRef = doc(db, 'users', currentUid)
    const activeGameName = status === 'ingame' && gameName ? gameName : null
    await updateDoc(userRef, {
      status,
      currentGame: activeGameName,
      lastSeen: serverTimestamp()
    })
  } catch (err) {
    console.warn('[Firebase] updateFirebasePresence error:', err)
  }
}

// Backward-compatibility alias
export const addFriendByCode = sendFriendRequest
