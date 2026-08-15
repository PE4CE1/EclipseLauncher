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
const knownFriendIds = new Set<string>()
let isInitialized = false

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
 * 3. Subscribe in real time to current user doc & friends list
 * 4. Handle presence & live status changes
 */
export async function initFirebaseSocial() {
  if (isInitialized) return
  isInitialized = true

  try {
    onAuthStateChanged(auth, async (user: User | null) => {
      if (!user) {
        try {
          await signInAnonymously(auth)
        } catch (authErr) {
          console.warn('[Firebase] Anonymous sign-in error:', authErr)
        }
        return
      }

      await syncMyProfile(user)
      listenToMyUserDoc(user.uid)
    })
  } catch (err) {
    console.warn('[Firebase] Init error:', err)
  }
}

/**
 * Syncs the local user's current settings (username, avatar, friend code) to Firestore
 */
export async function syncMyProfile(user?: User | null) {
  const activeUser = user || auth.currentUser
  if (!activeUser) return

  try {
    const settings = useGameStore.getState().settings
    let friendCode = settings.friendCode

    if (!friendCode) {
      friendCode = generateEclipseFriendCode()
      useGameStore.getState().updateSettings({ friendCode })
    }

    const userRef = doc(db, 'users', activeUser.uid)
    const snap = await getDoc(userRef)

    const baseData = {
      uid: activeUser.uid,
      friendCode: friendCode.toUpperCase().trim(),
      username: settings.username || 'Eclipse Player',
      avatarUrl: settings.avatarUrl || '',
      status: useGameStore.getState().activeGame ? 'ingame' : 'online',
      currentGame: useGameStore.getState().activeGame?.name || null,
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
    return
  }

  // Firestore allows up to 30 items in 'in' queries; chunk if necessary
  const targetUids = friendUids.slice(0, 30)
  const q = query(collection(db, 'users'), where('uid', 'in', targetUids))

  friendsQueryUnsub = onSnapshot(q, (snapshot) => {
    const liveFriendsMap = new Map<string, EclipseFriend>()

    snapshot.docs.forEach((docItem) => {
      const u = docItem.data()
      const friendObj: EclipseFriend = {
        id: u.uid,
        username: u.username || 'Eclipse Player',
        avatarUrl: u.avatarUrl || '',
        status: (u.status as 'online' | 'offline' | 'ingame') || 'offline',
        currentGame: u.currentGame || undefined,
        level: u.level || 1,
        steamProfileUrl: u.steamProfileUrl || undefined,
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

    // Merge live cloud friends with any existing local-only friends
    const currentLocalFriends = useGameStore.getState().settings.eclipseFriends || []
    const updatedFriends: EclipseFriend[] = []

    // 1. Add all live cloud friends
    liveFriendsMap.forEach((lf) => {
      updatedFriends.push(lf)
      knownFriendIds.add(lf.id)
    })

    // 2. Keep local friends that are not cloud UIDs (e.g. legacy Steam-only IDs)
    currentLocalFriends.forEach((lf) => {
      if (!liveFriendsMap.has(lf.id)) {
        updatedFriends.push(lf)
      }
    })

    useGameStore.getState().updateSettings({
      eclipseFriends: updatedFriends
    })
  }, (err) => {
    console.warn('[Firebase] listenToFriendsPresence error:', err)
  })
}

/**
 * Adds a friend using their Eclipse Friend Code (e.g. "ECL-7X9K" or raw code).
 * Performs a bilateral mutual connection in Firestore!
 */
export async function addFriendByCode(code: string): Promise<{ success: boolean; friend?: EclipseFriend; error?: string }> {
  const currentUid = auth.currentUser?.uid
  if (!currentUid) {
    return { success: false, error: 'Firebase is not connected yet. Please try again.' }
  }

  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) {
    return { success: false, error: 'Please enter a valid friend code.' }
  }

  try {
    // 1. Search for user with this friendCode in Firestore
    const q = query(collection(db, 'users'), where('friendCode', '==', cleanCode))
    const snap = await getDocs(q)

    if (snap.empty) {
      // Not found by Eclipse code; check if searching by UID directly
      const directDoc = await getDoc(doc(db, 'users', code.trim()))
      if (!directDoc.exists()) {
        return { success: false, error: 'User not found. Check the code and try again.' }
      }
      return await performBilateralAdd(currentUid, directDoc.data().uid, directDoc.data())
    }

    const targetDoc = snap.docs[0]
    const targetData = targetDoc.data()

    if (targetData.uid === currentUid) {
      return { success: false, error: 'You cannot add yourself as a friend.' }
    }

    return await performBilateralAdd(currentUid, targetData.uid, targetData)
  } catch (err: any) {
    console.error('[Firebase] addFriendByCode error:', err)
    return { success: false, error: err.message || 'An error occurred while adding friend.' }
  }
}

/**
 * Links two users in Firestore symmetrically
 */
async function performBilateralAdd(myUid: string, targetUid: string, targetData: any): Promise<{ success: boolean; friend?: EclipseFriend; error?: string }> {
  try {
    // Add target to my friends array
    const myRef = doc(db, 'users', myUid)
    await updateDoc(myRef, {
      friends: arrayUnion(targetUid)
    })

    // Add myself to target's friends array (instant mutual friendship)
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
    }

    knownFriendIds.add(friendObj.id)

    // Update local store immediately for instant UI feedback
    const currentFriends = useGameStore.getState().settings.eclipseFriends || []
    if (!currentFriends.some(f => f.id === friendObj.id)) {
      useGameStore.getState().updateSettings({
        eclipseFriends: [...currentFriends, friendObj]
      })
    }

    return { success: true, friend: friendObj }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to link friendship in cloud.' }
  }
}

/**
 * Removes a friend from Firestore and local store
 */
export async function removeFirebaseFriend(friendId: string) {
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
