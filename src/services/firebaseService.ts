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
import type { EclipseFriend } from '../types/game'

// Firebase Configuration
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
export const auth = getAuth(app)
export const db = getFirestore(app)

let currentUserUnsub: Unsubscribe | null = null
let friendsQueryUnsub: Unsubscribe | null = null
const knownFriendIds = new Set<string>()
let isInitialized = false

/**
 * Generates a clean unique Eclipse friend code (e.g. ECL-7X9K2)
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
 * Returns current authenticated Firebase user UID or null
 */
export function getOrCreateUserUid(): string {
  return auth.currentUser?.uid || useGameStore.getState().settings.userUid || ''
}

/**
 * Returns current friend code from store or generates a fallback
 */
export function getOrCreateFriendCode(): string {
  const current = useGameStore.getState().settings.friendCode
  if (current && current.startsWith('ECL-')) return current
  const newCode = generateEclipseFriendCode()
  useGameStore.getState().updateSettings({ friendCode: newCode })
  return newCode
}

/**
 * Initialize Firebase Social Network:
 * 1. Signs in anonymously (session token persists automatically in browser/IndexedDB)
 * 2. Syncs user profile to Firestore
 * 3. Sets up real-time listener for incoming friend additions
 */
export async function initFirebaseSocial() {
  if (isInitialized) return
  isInitialized = true

  // Clean any invalid ghost friends from local store
  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  const cleanedFriends = currentFriends.filter(f => 
    f && f.username && 
    !f.username.toLowerCase().includes('error') && 
    !f.username.toLowerCase().includes('steam community') &&
    !f.id.startsWith('ecl_')
  )
  if (cleanedFriends.length !== currentFriends.length) {
    useGameStore.getState().updateSettings({ eclipseFriends: cleanedFriends })
  }

  return new Promise<void>((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        useGameStore.getState().updateSettings({ userUid: user.uid })
        if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
          window.electronAPI.setSettings({ userUid: user.uid })
        }
        await setupUserInFirestore(user)
        listenToMyUserDoc(user.uid)
        resolve()
      } else {
        try {
          await signInAnonymously(auth)
        } catch (err) {
          console.warn('[Firebase] Anonymous auth error:', err)
          resolve()
        }
      }
    })
  })
}

// Aliases for compatibility
export const initSocialNetwork = initFirebaseSocial

/**
 * Sets up or syncs the current user document in Firestore on login
 */
async function setupUserInFirestore(user: User) {
  try {
    const userRef = doc(db, 'users', user.uid)
    const snap = await getDoc(userRef)
    const currentSettings = useGameStore.getState().settings

    let friendCode = currentSettings.friendCode
    if (!friendCode || !friendCode.startsWith('ECL-')) {
      friendCode = snap.exists() && snap.data()?.friendCode ? snap.data().friendCode : generateEclipseFriendCode()
    }

    useGameStore.getState().updateSettings({ friendCode, userUid: user.uid })
    if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
      window.electronAPI.setSettings({ friendCode, userUid: user.uid })
    }

    await syncMyProfile()
  } catch (err) {
    console.warn('[Firebase] setupUserInFirestore error:', err)
  }
}

/**
 * Syncs the local user's full profile to Firestore
 */
export async function syncMyProfile() {
  const user = auth.currentUser
  if (!user) return

  try {
    const { settings, library, installedGames, activeGame } = useGameStore.getState()
    const userRef = doc(db, 'users', user.uid)
    const snap = await getDoc(userRef)

    let friendCode = settings.friendCode
    if (snap.exists() && snap.data()?.friendCode) {
      friendCode = snap.data().friendCode
    } else if (!friendCode || !friendCode.startsWith('ECL-')) {
      friendCode = generateEclipseFriendCode()
      useGameStore.getState().updateSettings({ friendCode })
    }

    const isIngame = !!activeGame
    const activeGameName = activeGame?.name || null

    // Playtime calculations
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
        lastPlayed: Math.max(existing.lastPlayed || 0, g.lastPlayed || 0),
      })
    })

    const totalPlaytimeMins = Math.round(Array.from(allUserGamesMap.values()).reduce((acc, g) => acc + (g.playTimeMinutes || 0), 0))
    const totalPlaytimeHours = totalPlaytimeMins >= 60
      ? (totalPlaytimeMins / 60).toFixed(1) + 'h'
      : `${totalPlaytimeMins}m`

    const topPlayedGames = Array.from(allUserGamesMap.values())
      .sort((a, b) => (b.playTimeMinutes || 0) - (a.playTimeMinutes || 0))
      .filter(g => (g.playTimeMinutes || 0) > 0)
      .slice(0, 5)
      .map(g => ({
        id: g.id || g.name,
        name: g.name,
        steamId: g.steamId || null,
        playTimeMinutes: g.playTimeMinutes || 0,
        lastPlayed: g.lastPlayed || 0,
      }))

    const totalLibraryCount = inst.length + lib.filter(g => !inst.some(ig => ig.name === g.name)).length
    const totalInstalledCount = inst.filter(g => g.installed !== false).length

    const baseData = {
      uid: user.uid,
      friendCode: (friendCode || getOrCreateFriendCode()).toUpperCase().trim(),
      username: settings.username || 'Eclipse Player',
      avatarUrl: settings.avatarUrl || '',
      status: isIngame ? 'ingame' : 'online',
      currentGame: isIngame ? activeGameName : null,
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
      lastSeen: serverTimestamp(),
    }

    if (!snap.exists()) {
      await setDoc(userRef, {
        ...baseData,
        friends: [],
        createdAt: serverTimestamp(),
      })
    } else {
      await updateDoc(userRef, baseData)
    }

    // Auto-enrich Steam profile in background if needed
    const isDefaultUsername = !settings.username || settings.username === 'User' || settings.username === 'Eclipse Player'
    if (isDefaultUsername && settings.steamProfileUrl) {
      import('./steamService').then(async ({ fetchSteamUserProfile }) => {
        try {
          const steamData = await fetchSteamUserProfile(settings.steamProfileUrl!)
          if (steamData && steamData.username && steamData.username !== 'Unknown') {
            const steamUpdate = {
              username: steamData.username,
              avatarUrl: steamData.avatarFull || settings.avatarUrl || '',
              steamLevel: steamData.steamLevel ?? settings.steamLevel ?? 0,
              steamGamesCount: steamData.steamGamesCount ?? settings.steamGamesCount ?? 0,
              steamBadgesCount: steamData.steamBadgesCount ?? settings.steamBadgesCount ?? 0,
              steamRecentGames: steamData.steamRecentGames || settings.steamRecentGames || [],
              steamFavoriteBadge: steamData.steamFavoriteBadge ?? settings.steamFavoriteBadge ?? null,
            }
            useGameStore.getState().updateSettings(steamUpdate)
            if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
              window.electronAPI.setSettings(steamUpdate)
            }
            await updateDoc(userRef, steamUpdate)
          }
        } catch (_) {}
      }).catch(() => {})
    }
  } catch (err) {
    console.warn('[Firebase] syncMyProfile error:', err)
  }
}

/**
 * Listens to the current user's document in Firestore.
 * When friends array changes, dynamically listens to friends' real-time presence.
 */
function listenToMyUserDoc(uid: string) {
  if (currentUserUnsub) currentUserUnsub()

  const userRef = doc(db, 'users', uid)
  currentUserUnsub = onSnapshot(userRef, (docSnap) => {
    if (!docSnap.exists()) return

    const data = docSnap.data()
    const friendUids: string[] = Array.isArray(data?.friends) ? data.friends : []

    // Ensure our local friendCode is synced
    if (data?.friendCode && data.friendCode !== useGameStore.getState().settings.friendCode) {
      useGameStore.getState().updateSettings({ friendCode: data.friendCode })
    }

    listenToFriendsPresence(friendUids)
  }, (err) => {
    console.warn('[Firebase] listenToMyUserDoc error:', err)
  })
}

let presenceDecayInterval: NodeJS.Timeout | null = null

function ensurePresenceDecayTimer() {
  if (presenceDecayInterval) return
  presenceDecayInterval = setInterval(() => {
    const currentFriends = useGameStore.getState().settings.eclipseFriends || []
    const now = Date.now()
    let changed = false

    const updated = currentFriends.map((friend) => {
      // Only decay cloud friends with lastSeen timestamp
      if (friend.lastSeen && friend.status !== 'offline') {
        if (now - friend.lastSeen >= 60000) {
          changed = true
          return {
            ...friend,
            status: 'offline' as const,
            currentGame: undefined,
          }
        }
      }
      return friend
    })

    if (changed) {
      useGameStore.getState().updateSettings({ eclipseFriends: updated })
    }
  }, 10000)
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

  if (!friendUids || friendUids.length === 0) {
    // Keep local Steam friends
    const currentLocalFriends = useGameStore.getState().settings.eclipseFriends || []
    const steamOnly = currentLocalFriends.filter(f => f.id.startsWith('steam_') || /^\d{17}$/.test(f.id))
    useGameStore.getState().updateSettings({ eclipseFriends: steamOnly })
    return
  }

  // Firestore allows up to 30 items in 'in' queries; chunk if necessary
  const targetUids = friendUids.slice(0, 30)
  const q = query(collection(db, 'users'), where('uid', 'in', targetUids))

  friendsQueryUnsub = onSnapshot(q, (snapshot) => {
    const liveFriendsMap = new Map<string, EclipseFriend>()
    const now = Date.now()

    snapshot.docs.forEach((docItem) => {
      const u = docItem.data()
      let lastSeenMs: number | undefined = undefined
      if (u.lastSeen) {
        if (typeof u.lastSeen === 'number') lastSeenMs = u.lastSeen
        else if (typeof u.lastSeen?.toMillis === 'function') lastSeenMs = u.lastSeen.toMillis()
        else if (typeof u.lastSeen?.seconds === 'number') lastSeenMs = u.lastSeen.seconds * 1000
      }

      // A user is ONLY active if last seen within the last 60 seconds and status is not explicitly offline
      const isRecentlyActive = !!(lastSeenMs && (now - lastSeenMs < 60000))
      let status: 'online' | 'offline' | 'ingame' = 'offline'
      let currentGame: string | undefined = undefined

      if (isRecentlyActive && u.status && u.status !== 'offline') {
        if (u.status === 'ingame' && u.currentGame) {
          status = 'ingame'
          currentGame = u.currentGame
        } else {
          status = 'online'
        }
      }

      const friendObj: EclipseFriend = {
        id: u.uid,
        username: u.username || 'Eclipse Player',
        avatarUrl: u.avatarUrl || '',
        status: status,
        currentGame: currentGame,
        lastSeen: lastSeenMs,
        level: u.level || 1,
        steamLevel: u.steamLevel || 1,
        steamProfileUrl: u.steamProfileUrl || undefined,
        friendCode: u.friendCode || undefined,
        steamRecentGames: u.steamRecentGames || [],
        steamFavoriteBadge: u.steamFavoriteBadge || null,
      }
      liveFriendsMap.set(u.uid, friendObj)

      // Notify if a brand new friend was added by someone else
      if (!knownFriendIds.has(u.uid) && knownFriendIds.size > 0) {
        const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
        sendAppNotification({
          title: lang === 'de' ? 'Neuer Freund hinzugefügt! 👥' : 'New Friend Added! 👥',
          body: lang === 'de' 
            ? `${friendObj.username} ist jetzt in deiner Eclipse-Freundesliste!` 
            : `${friendObj.username} is now in your Eclipse friends list!`,
          type: 'info'
        })
      }
    })

    // Merge live cloud friends with any existing local Steam friends
    const currentLocalFriends = useGameStore.getState().settings.eclipseFriends || []
    const updatedFriends: EclipseFriend[] = []

    // 1. Add all live cloud friends
    liveFriendsMap.forEach((lf) => {
      updatedFriends.push(lf)
      knownFriendIds.add(lf.id)
    })

    // 2. Keep local friends that are purely Steam IDs (starting with steam_ or 17 digits)
    currentLocalFriends.forEach((lf) => {
      const isPureSteam = lf.id.startsWith('steam_') || /^\d{17}$/.test(lf.id)
      if (isPureSteam && !liveFriendsMap.has(lf.id)) {
        updatedFriends.push(lf)
      }
    })

    useGameStore.getState().updateSettings({
      eclipseFriends: updatedFriends
    })

    ensurePresenceDecayTimer()
  }, (err) => {
    console.warn('[Firebase] listenToFriendsPresence error:', err)
  })
}

/**
 * Adds a friend using their Eclipse Friend Code (e.g. "ECL-7X9K2" or raw UID).
 * Performs an instant bilateral mutual connection in Firestore!
 */
export async function addFriendByCode(code: string): Promise<{ success: boolean; friend?: EclipseFriend; message?: string; error?: string }> {
  const currentUid = auth.currentUser?.uid
  if (!currentUid) {
    return { success: false, error: 'Firebase ist noch nicht verbunden. Bitte kurz warten.' }
  }

  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) {
    return { success: false, error: 'Bitte gib einen gültigen Freundes-Code ein.' }
  }

  // Prevent adding self
  const myCode = useGameStore.getState().settings.friendCode?.toUpperCase().trim()
  if (cleanCode === myCode || cleanCode === currentUid || cleanCode.replace(/^ECL-/, '') === myCode?.replace(/^ECL-/, '')) {
    return { success: false, error: 'Du kannst dich nicht selbst als Freund hinzufügen.' }
  }

  try {
    // 1. Search for user with this friendCode in Firestore (handles with or without ECL-)
    const searchCode = cleanCode.startsWith('ECL-') ? cleanCode : `ECL-${cleanCode}`
    let q = query(collection(db, 'users'), where('friendCode', '==', searchCode))
    let snap = await getDocs(q)

    if (snap.empty) {
      // Try without ECL-
      q = query(collection(db, 'users'), where('friendCode', '==', cleanCode.replace(/^ECL-/, '')))
      snap = await getDocs(q)
    }

    if (snap.empty) {
      // Not found by Eclipse code; check if searching by UID directly
      const directDoc = await getDoc(doc(db, 'users', code.trim()))
      if (!directDoc.exists()) {
        return { success: false, error: 'Kein Spieler mit diesem Code gefunden.' }
      }
      return await performBilateralAdd(currentUid, directDoc.data().uid, directDoc.data())
    }

    const targetDoc = snap.docs[0]
    const targetData = targetDoc.data()

    if (targetData.uid === currentUid) {
      return { success: false, error: 'Du kannst dich nicht selbst als Freund hinzufügen.' }
    }

    return await performBilateralAdd(currentUid, targetData.uid, targetData)
  } catch (err: any) {
    console.error('[Firebase] addFriendByCode error:', err)
    return { success: false, error: err.message || 'Fehler beim Hinzufügen des Freundes.' }
  }
}

/**
 * Links two users in Firestore symmetrically (instant bilateral friendship)
 */
async function performBilateralAdd(myUid: string, targetUid: string, targetData: any): Promise<{ success: boolean; friend?: EclipseFriend; message?: string; error?: string }> {
  try {
    // Add target to my friends array
    const myRef = doc(db, 'users', myUid)
    await updateDoc(myRef, {
      friends: arrayUnion(targetUid)
    })

    // Add myself to target's friends array (instant bilateral mutual friendship)
    const targetRef = doc(db, 'users', targetUid)
    await updateDoc(targetRef, {
      friends: arrayUnion(myUid)
    })

    const friendObj: EclipseFriend = {
      id: targetData.uid,
      username: targetData.username || 'Eclipse Player',
      avatarUrl: targetData.avatarUrl || '',
      status: (targetData.status as any) || 'online',
      currentGame: targetData.currentGame || undefined,
      level: targetData.level || 1,
      steamLevel: targetData.steamLevel || 1,
      steamProfileUrl: targetData.steamProfileUrl || undefined,
      friendCode: targetData.friendCode || undefined,
      steamRecentGames: targetData.steamRecentGames || [],
      steamFavoriteBadge: targetData.steamFavoriteBadge || null,
    }

    knownFriendIds.add(friendObj.id)

    // Update local store immediately for instant UI feedback
    const currentFriends = useGameStore.getState().settings.eclipseFriends || []
    if (!currentFriends.some(f => f.id === friendObj.id)) {
      useGameStore.getState().updateSettings({
        eclipseFriends: [...currentFriends, friendObj]
      })
    }

    return { 
      success: true, 
      friend: friendObj,
      message: `Freund ${friendObj.username} hinzugefügt!` 
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Konnte Freundschaft in der Cloud nicht verknüpfen.' }
  }
}

/**
 * Removes a friend from Firestore and local store
 */
export async function removeFirebaseFriend(friendId: string) {
  knownFriendIds.delete(friendId)
  const currentUid = auth.currentUser?.uid
  if (currentUid) {
    try {
      const myRef = doc(db, 'users', currentUid)
      await updateDoc(myRef, {
        friends: arrayRemove(friendId)
      })

      const targetRef = doc(db, 'users', friendId)
      await updateDoc(targetRef, {
        friends: arrayRemove(currentUid)
      }).catch(() => {})
    } catch (err) {
      console.warn('[Firebase] removeFirebaseFriend error:', err)
    }
  }

  // Update local store
  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  useGameStore.getState().updateSettings({
    eclipseFriends: currentFriends.filter(f => f.id !== friendId)
  })
}

/**
 * Updates current user's live presence (online, ingame, or offline)
 */
export async function updateFirebasePresence(status: 'online' | 'ingame' | 'offline', gameName?: string | null) {
  const currentUid = auth.currentUser?.uid
  if (!currentUid) return

  try {
    const userRef = doc(db, 'users', currentUid)
    await updateDoc(userRef, {
      status,
      currentGame: gameName || null,
      lastSeen: serverTimestamp()
    })
  } catch (err) {
    console.warn('[Firebase] updateFirebasePresence error:', err)
  }
}

// Presence alias for compatibility
export const updateSocialPresence = updateFirebasePresence

/**
 * Fetches a user's full public profile from Firestore by UID or Friend Code
 */
export async function fetchUserProfile(uidOrCode: string): Promise<any | null> {
  if (!uidOrCode || typeof uidOrCode !== 'string') return null
  const raw = uidOrCode.trim()
  if (!raw) return null

  try {
    // 1. Search by direct doc ID (UID)
    const directDoc = await getDoc(doc(db, 'users', raw))
    if (directDoc.exists()) {
      return directDoc.data()
    }

    // 2. Search by friendCode
    const cleanUpper = raw.toUpperCase()
    const searchCode = cleanUpper.startsWith('ECL-') ? cleanUpper : `ECL-${cleanUpper}`
    let q = query(collection(db, 'users'), where('friendCode', '==', searchCode))
    let snap = await getDocs(q)
    if (!snap.empty) {
      return snap.docs[0].data()
    }

    // Try without ECL-
    q = query(collection(db, 'users'), where('friendCode', '==', cleanUpper.replace(/^ECL-/, '')))
    snap = await getDocs(q)
    if (!snap.empty) {
      return snap.docs[0].data()
    }
  } catch (err) {
    console.warn('[Firebase] fetchUserProfile error:', err)
  }

  return null
}

/**
 * Compatibility alias for sendFriendRequest (Firebase performs instant bilateral add)
 */
export async function sendFriendRequest(codeOrUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await addFriendByCode(codeOrUid)
  return {
    success: res.success,
    message: res.message || 'Freundschaft erfolgreich verknüpft!',
    error: res.error,
  }
}

/**
 * Restores a removed friend bilaterally (for Undo actions)
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
      console.warn('[Firebase] restoreFriend error:', err)
    }
  }

  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  if (!currentFriends.some(f => f.id === friend.id)) {
    useGameStore.getState().updateSettings({
      eclipseFriends: [...currentFriends, friend]
    })
  }
}

export const restoreSocialFriend = restoreFirebaseFriend
export const removeSocialFriend = removeFirebaseFriend

/**
 * Accepts an incoming friend request
 */
export async function acceptFriendRequest(fromUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return await sendFriendRequest(fromUid)
}

/**
 * Declines an incoming friend request
 */
export async function declineFriendRequest(fromUid: string): Promise<{ success: boolean; error?: string }> {
  return { success: true }
}


