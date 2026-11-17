import { newRecoveryKey, validRecoveryKey, protectRecovery, authenticateRecovery, resumeSavedRecovery, recoveryError, recoveryErrorCode, RecoveryFailure } from './accountRecovery'
import { translate } from '../i18n/translate'
import { secureToken } from './identityTokens'
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
  deleteField,
  documentId,
  runTransaction,
  type Unsubscribe 
} from 'firebase/firestore'
import { buildProfileGames, publicProfileStats, publicSteamProfileStats, publicProfileData } from './profileModel'
import { profileAvatarFrameValue } from './steamProfileAppearance'
import { createFriendRequests, friendFromProfile } from './friendRequests'
import { createFriendChat, type ChatThread } from './friendChat'
import { createChatNotificationObserver } from './chatNotifications'
import { findPublicSocialProfile } from './publicSocialProfile'
import { useGameStore } from '../store/gameStore'
import { firestoreData } from './firestoreData'
import { runtimeMode } from './runtimeMode'
import { changedProfileFields, coalesceProfileSync } from './profileSync'
import { receiveSocialState, startSocialStatePublisher } from './socialStateSync'
import type { SocialSnapshot } from '../types/socialState'
import { sendAppNotification, sendChatNotification } from './notificationService'
import type { AppSettings, EclipseFriend } from '../types/game'

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
const directFriendChat = createFriendChat({db,requireUid:requireSocialUid})
let sharedInbox: ChatThread[] | undefined
let sharedInboxUid = ''
const sharedInboxListeners = new Set<{ uid: string; receive: (threads: ChatThread[]) => void }>()
export const friendChat = { ...directFriendChat, watchInbox(uid: string, receive: (threads: ChatThread[]) => void, fail: (error: unknown) => void) {
  if (!usesSharedSocialState()) return directFriendChat.watchInbox(uid, receive, fail)
  const listener = { uid, receive }; sharedInboxListeners.add(listener)
  if (sharedInbox && sharedInboxUid === uid && auth.currentUser?.uid === uid) receive(sharedInbox)
  return () => { sharedInboxListeners.delete(listener) }
} }

async function requireSocialUid(): Promise<string> {
  await auth.authStateReady()
  if ((!getCanonicalUid() || auth.currentUser?.uid !== getCanonicalUid()) && !usesSharedSocialState()) await initFirebaseSocial()
  const uid = getCanonicalUid()
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Social connection is not ready. Please try again.')
  return uid
}
const friendRequests = createFriendRequests({ db, requireUid: requireSocialUid,
  findProfile: async value => await fetchUserProfile(value) as ({uid:string} & Record<string,any>) | null,
  reportError: handleFirestoreError })

// The secondary window reads social state without republishing the main window's profile or presence.
export function initFriendsWindowSocial(): () => void {
  const api = typeof window !== 'undefined' ? window.electronAPI?.socialState : undefined
  if (api) {
    let latest: SocialSnapshot | null = null
    const apply = () => {
      if (!latest || auth.currentUser?.uid !== latest.uid) return
      canonicalUid = latest.uid
      canonicalFriendCode = latest.settings.friendCode || ''
      isFirestorePermissionDenied = latest.permissionDenied
      sharedInbox = latest.chatInbox
      sharedInboxUid = latest.uid
      useGameStore.getState().updateSettings(latest.settings)
      useGameStore.setState({ activeGame: latest.activeGame })
      if (sharedInbox) for (const listener of sharedInboxListeners) if (listener.uid === latest.uid) listener.receive(sharedInbox)
    }
    const receive = (snapshot: SocialSnapshot | null) => { latest = snapshot; apply() }
    applySharedSnapshot = receive
    const stop = receiveSocialState(api, receive)
    const stopAuth = onAuthStateChanged(auth, () => {
      if (latest && auth.currentUser?.uid !== latest.uid) useGameStore.getState().updateSettings({ eclipseFriends: [], incomingFriendRequests: [], outgoingFriendRequests: [] })
      apply()
    })
    return () => { stop(); stopAuth(); if (applySharedSnapshot === receive) applySharedSnapshot = undefined }
  }
  const stop = () => { currentUserUnsub?.(); currentUserUnsub = null; friendsQueryUnsub?.(); friendsQueryUnsub = null; friendRequests.stop(); if (presenceDecayInterval) clearInterval(presenceDecayInterval); presenceDecayInterval = null }
  const unsubscribe = onAuthStateChanged(auth, user => {
    stop()
    const uid = getCanonicalUid()
    if (uid && user?.uid === uid) { listenToMyUserDoc(uid); friendRequests.start(uid, false) }
  })
  return () => { unsubscribe(); stop() }
}

let currentUserUnsub: Unsubscribe | null = null
let friendsQueryUnsub: Unsubscribe | null = null
const knownFriendIds = new Set<string>()
let isInitialized = false
let initializationPromise: Promise<void> | null = null
let friendsSubscriptionKey = ''
let hasLoggedPermissionDeniedNotice = false
export let isFirestorePermissionDenied = false
let accountOperationTail: Promise<unknown> = Promise.resolve()
let socialPublisher: ReturnType<typeof startSocialStatePublisher> | undefined
let applySharedSnapshot: ((snapshot: SocialSnapshot | null) => void) | undefined
function usesSharedSocialState() {
  return typeof window !== 'undefined' && window.location?.hash === '#friends' && !!window.electronAPI?.socialState
}
function ensureSocialPublisher() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.socialState : undefined
  if (!api || usesSharedSocialState() || socialPublisher) return
  socialPublisher = startSocialStatePublisher(api, useGameStore, getCanonicalUid, () => isFirestorePermissionDenied,
    async force => { await initFirebaseSocial(); await refreshFriendsPresence(force) }, () => sharedInboxUid === getCanonicalUid() ? sharedInbox : undefined)
  window.electronAPI?.chatNotifications?.onMuted(value => useGameStore.getState().updateSettings({ chatMutedFriends: value }))
}
let chatNotificationUid = '', stopChatNotifications: (() => void) | undefined
function ensureChatNotifications(uid: string) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.chatNotifications : undefined
  if (!api || usesSharedSocialState() || chatNotificationUid === uid) return
  stopChatNotifications?.(); chatNotificationUid = uid; sharedInbox = undefined; sharedInboxUid = uid
  const observer = createChatNotificationObserver({
    uid, settings: () => useGameStore.getState().settings, friends: () => useGameStore.getState().settings.eclipseFriends || [],
    currentUid: () => auth.currentUser?.uid === getCanonicalUid() ? getCanonicalUid() : '',
    readAt: peer => { try { const value = JSON.parse(localStorage.getItem('eclipse-chat-reads:' + uid) || '{}')[peer]; return typeof value === 'number' ? value : 0 } catch { return 0 } },
    isActive: peer => api.isActive(uid, peer),
    notify: (friend, thread) => { void sendChatNotification(friend, thread) },
  })
  const stop = directFriendChat.watchInbox(uid, threads => {
    sharedInbox = threads; socialPublisher?.publish(); observer.receive(threads)
  }, error => { chatNotificationUid = ''; handleFirestoreError('Chat notifications', error) })
  stopChatNotifications = () => { observer.stop(); stop() }
}
type OwnProfile = { uid: string; exists: boolean; data: Record<string, any> }
let ownProfile: OwnProfile | undefined
let ownListenerUid = '', ownListenerGeneration = 0, ownProfileLive = false, ownListenerFailed = false
let failedFriendsSubscriptionKey = ''
const readyFriendBatches = new Set<string>()
const expectedFriendBatches = new Set<string>()
let lastIdentitySaved = ''

async function readOwnProfile(uid: string): Promise<OwnProfile> {
  if (ownProfile?.uid === uid) return ownProfile
  const snap = await getDoc(doc(db, 'users', uid))
  const profile = { uid, exists: snap.exists(), data: snap.exists() ? snap.data() : {} }
  if (getCanonicalUid() === uid && auth.currentUser?.uid === uid) ownProfile = profile
  return profile
}

function accountOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = accountOperationTail.then(operation)
  accountOperationTail = result.catch(() => {})
  return result
}

async function persistAccountLocally(patch: Partial<AppSettings>, identity: { canonicalUid: string; friendCode: string; accountSecret: string; username?: string }) {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  const previous = useGameStore.getState().settings
  const previousPatch = Object.fromEntries(Object.keys(patch).map(key => [key, previous[key as keyof AppSettings]])) as Partial<AppSettings>
  const previousIdentity = await api?.account?.getIdentity?.() || (getCanonicalUid() ? {
    canonicalUid: getCanonicalUid(), friendCode: getOrCreateFriendCode(), accountSecret: getAccountSecret(), username: previous.username,
  } : null)
  let settingsWritten = false
  try {
    if (api?.setSettings) {
      if ((await api.setSettings(patch))?.success !== true) throw new RecoveryFailure('persistence-failed')
      settingsWritten = true
    }
    await api?.account?.saveIdentity?.(identity)
  } catch (error) {
    const rollback = await Promise.allSettled([
      settingsWritten ? api?.setSettings?.(previousPatch).then(result => { if (!result?.success) throw new Error('Settings rollback failed') }) : undefined,
      previousIdentity ? api?.account?.saveIdentity?.(previousIdentity) : undefined,
    ])
    if (rollback.some(result => result.status === 'rejected')) throw new RecoveryFailure('rollback-failed')
    throw new RecoveryFailure('persistence-failed')
  }
}

export function markFirestoreSuccess() {
  if (isFirestorePermissionDenied) {
    isFirestorePermissionDenied = false
    console.info('[Firebase] Firestore connected and active.')
    socialPublisher?.publish()
  }
}

function handleFirestoreError(context: string, err: any) {
  const errMsg = String(err?.message || err || '')
  const errCode = String(err?.code || '')
  const isPermDenied =
    errCode.includes('permission-denied') ||
    errMsg.includes('permission-denied') ||
    errMsg.includes('Missing or insufficient permissions') ||
    errMsg.includes('PERMISSION_DENIED')

  if (isPermDenied) {
    isFirestorePermissionDenied = true
    socialPublisher?.publish()
    if (!hasLoggedPermissionDeniedNotice) {
      hasLoggedPermissionDeniedNotice = true
      console.warn(
        `[Firebase] Security rules expired or denied for project '${firebaseConfig.projectId}'. ` +
        `Review the deployed Firestore rules and account ownership checks in the Firebase console.`
      )
    }
    return
  }

  console.warn(`[Firebase] ${context} error:`, err)
}

// Persistent Multi-Layer Account Identity State
const syncInitialIdentity = typeof window !== 'undefined' ? (window as any).electronAPI?.account?.initialIdentity : null
let canonicalUid: string = syncInitialIdentity?.canonicalUid || ''
let canonicalFriendCode: string = (syncInitialIdentity?.friendCode && syncInitialIdentity.friendCode.startsWith('ECL-')) ? syncInitialIdentity.friendCode : ''
let canonicalAccountSecret: string = syncInitialIdentity?.accountSecret || ''
let currentDeviceAnchorId: string = syncInitialIdentity?.deviceAnchorId || ''

/**
 * Generates a clean unique Eclipse friend code (e.g. ECL-7X9K2)
 */
export function generateEclipseFriendCode(): string {
  return `ECL-${secureToken(5)}`
}

/**
 * Generates a high-entropy recovery credential; it must never enter a public document.
 */
export function generateSecureAccountSecret(): string {
  return newRecoveryKey()
}

/**
 * Returns canonical user UID that survives full application uninstallation
 */
export function getCanonicalUid(): string {
  if (canonicalUid) return canonicalUid
  const storeUid = useGameStore.getState().settings.userUid
  if (storeUid) {
    canonicalUid = storeUid
    return storeUid
  }
  if (syncInitialIdentity?.canonicalUid) {
    canonicalUid = syncInitialIdentity.canonicalUid
    return canonicalUid
  }
  return auth.currentUser?.uid || ''
}

/**
 * Returns current authenticated Firebase user UID or canonical UID
 */
export function getOrCreateUserUid(): string {
  return getCanonicalUid()
}

/**
 * Returns current account recovery secret key
 */
export function getAccountSecret(): string {
  return canonicalAccountSecret || useGameStore.getState().settings.accountSecret || syncInitialIdentity?.accountSecret || ''
}

/**
 * Returns current friend code from store or persistent identity.
 * Strictly avoids generating random codes if a canonical identity exists in any tier.
 */
export function getOrCreateFriendCode(): string {
  if (canonicalFriendCode && canonicalFriendCode.startsWith('ECL-')) return canonicalFriendCode

  const current = useGameStore.getState().settings.friendCode
  if (current && current.startsWith('ECL-')) {
    canonicalFriendCode = current
    return current
  }

  // Check syncInitialIdentity from preload
  const syncId = typeof window !== 'undefined' ? (window as any).electronAPI?.account?.initialIdentity : null
  if (syncId?.friendCode && syncId.friendCode.startsWith('ECL-')) {
    canonicalFriendCode = syncId.friendCode
    useGameStore.getState().updateSettings({ friendCode: syncId.friendCode })
    return syncId.friendCode
  }

  // Check synchronous live identity if available
  if (typeof window !== 'undefined' && (window as any).electronAPI?.account?.getIdentitySync) {
    try {
      const live = (window as any).electronAPI.account.getIdentitySync()
      if (live?.friendCode && live.friendCode.startsWith('ECL-')) {
        canonicalFriendCode = live.friendCode
        useGameStore.getState().updateSettings({ friendCode: live.friendCode })
        return live.friendCode
      }
    } catch {}
  }

  // Fallback: ONLY generate a new code if all persistent tiers are genuinely empty
  const newCode = generateEclipseFriendCode()
  canonicalFriendCode = newCode
  useGameStore.getState().updateSettings({ friendCode: newCode })
  return newCode
}

/**
 * Resolves the locally backed-up identity:
 * Tier 1: %USERPROFILE%\.eclipse_launcher_identity.json (survives app wipe)
 * Tier 2: Windows Registry HKCU\Software\EclipseLauncher\Identity (survives uninstalls)
 * Cross-device recovery is authenticated by Firebase Auth; hardware IDs are not credentials.
 */
async function resolveAndRestoreAccountIdentity(user: User): Promise<string> {
  // Step 1: Get Hardware Device Anchor (Windows MachineGuid hash)
  let deviceAnchor = currentDeviceAnchorId
  if (!deviceAnchor && typeof window !== 'undefined' && window.electronAPI?.account?.getDeviceAnchor) {
    try {
      deviceAnchor = await window.electronAPI.account.getDeviceAnchor()
      currentDeviceAnchorId = deviceAnchor
    } catch (_) {}
  }

  // Step 2: Try Tier 1 & Tier 2 from local OS
  let savedLocal: any = null
  if (typeof window !== 'undefined' && window.electronAPI?.account?.getIdentity) {
    try {
      savedLocal = await window.electronAPI.account.getIdentity()
    } catch (_) {}
  }

  let resolvedUid = ''
  let resolvedFriendCode = ''
  let resolvedSecret = ''

  if (savedLocal?.canonicalUid && savedLocal?.friendCode) {
    // Found in local Tier 1 (UserProfile) or Tier 2 (Registry)
    resolvedUid = savedLocal.canonicalUid
    resolvedFriendCode = savedLocal.friendCode
    resolvedSecret = savedLocal.accountSecret || ''
  }

  // If still not resolved, check local store
  const storeSettings = useGameStore.getState().settings
  if (!resolvedUid && storeSettings.userUid) {
    resolvedUid = storeSettings.userUid
  }
  if (!resolvedFriendCode && storeSettings.friendCode && storeSettings.friendCode.startsWith('ECL-')) {
    resolvedFriendCode = storeSettings.friendCode
  }
  if (!resolvedSecret && storeSettings.accountSecret) {
    resolvedSecret = storeSettings.accountSecret
  }

  // If brand new account on this PC
  if (!resolvedUid) {
    resolvedUid = user.uid
  }
  if (!resolvedFriendCode || !resolvedFriendCode.startsWith('ECL-')) {
    resolvedFriendCode = generateEclipseFriendCode()
  }
  if (!resolvedSecret) {
    resolvedSecret = generateSecureAccountSecret()
  }

  canonicalUid = resolvedUid
  canonicalFriendCode = resolvedFriendCode
  canonicalAccountSecret = resolvedSecret

  const username = (storeSettings.username && storeSettings.username !== 'User' && storeSettings.username !== 'Eclipse Player')
    ? storeSettings.username
    : (savedLocal?.username && savedLocal.username !== 'User' && savedLocal.username !== 'Eclipse Player' ? savedLocal.username : (storeSettings.username || 'User'))

  // Update Zustand Store
  const settingsPatch: any = {
    userUid: resolvedUid,
    friendCode: resolvedFriendCode,
    accountSecret: resolvedSecret,
  }
  if (username && username !== 'User' && storeSettings.username !== username) {
    settingsPatch.username = username
  }
  useGameStore.getState().updateSettings(settingsPatch)

  // Persist locally in Electron Settings (userData/settings.json)
  if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
    window.electronAPI.setSettings({
      userUid: resolvedUid,
      friendCode: resolvedFriendCode,
      accountSecret: resolvedSecret,
      ...(username && username !== 'User' ? { username } : {}),
    })
  }

  // Persist redundantly across Tier 1 (UserProfile file) and Tier 2 (Windows Registry)
  if (typeof window !== 'undefined' && window.electronAPI?.account?.saveIdentity) {
    try {
      await window.electronAPI.account.saveIdentity({
        canonicalUid: resolvedUid,
        friendCode: resolvedFriendCode,
        accountSecret: resolvedSecret,
        deviceAnchorId: deviceAnchor,
        username,
      })
    } catch (_) {}
  }

  await enableSecureRecovery()
  if (auth.currentUser?.uid !== resolvedUid) return resolvedUid

  await setupUserInFirestore(resolvedUid)
  return resolvedUid
}

/**
 * Initialize Firebase Social Network:
 * 1. Signs in anonymously (session token persists automatically)
 * 2. Resolves locally backed-up identity and checks authenticated ownership
 * 3. Syncs user profile to Firestore using canonicalUid
 * 4. Sets up real-time listener for incoming friend additions
 */
// Maximum duration (in ms) without a heartbeat after which a friend is considered offline (2.5 minutes buffer)
const PRESENCE_TTL_MS = 150000 // 150 seconds (2.5 minutes)

export function initFirebaseSocial(): Promise<void> {
  if (usesSharedSocialState()) return auth.authStateReady()
  ensureSocialPublisher()
  if (initializationPromise) return initializationPromise
  if (isInitialized) return Promise.resolve()

  initializationPromise = (async () => {
    const currentFriends = useGameStore.getState().settings.eclipseFriends || []
    const cleanedFriends = currentFriends.filter(friend =>
      friend && typeof friend.id === 'string' && typeof friend.username === 'string' && friend.username &&
      !friend.username.toLowerCase().includes('error') &&
      !friend.username.toLowerCase().includes('steam community') && !friend.id.startsWith('ecl_')
    ).map(friend => friend.status === 'offline' && friend.currentGame ? { ...friend, currentGame: undefined } : friend)
    useGameStore.getState().updateSettings({ eclipseFriends: cleanedFriends })

    await auth.authStateReady()
    const user = auth.currentUser || (await signInAnonymously(auth)).user
    const activeUid = await resolveAndRestoreAccountIdentity(user)
    if (auth.currentUser?.uid !== activeUid) throw new RecoveryFailure('session-mismatch')
    listenToMyUserDoc(activeUid)
    friendRequests.start(activeUid)
    isInitialized = true
  })().catch(error => {
    handleFirestoreError('Social initialization', error)
    isInitialized = false
  }).finally(() => { initializationPromise = null })

  return initializationPromise
}

// Aliases for compatibility
export const initSocialNetwork = initFirebaseSocial

/**
 * Sets up or syncs the current user document in Firestore on login
 */
async function setupUserInFirestore(uid: string) {
  try {
    const profile = await readOwnProfile(uid)
    const snap = { exists: () => profile.exists, data: () => profile.data }
    markFirestoreSuccess()
    const currentSettings = useGameStore.getState().settings

    let friendCode: string = canonicalFriendCode || currentSettings.friendCode || ''
    if (snap.exists() && snap.data()?.friendCode) {
      friendCode = snap.data().friendCode || ''
      canonicalFriendCode = friendCode
    } else if (!friendCode || !friendCode.startsWith('ECL-')) {
      friendCode = generateEclipseFriendCode()
      canonicalFriendCode = friendCode
    }

    // Restore profile details from cloud if local was wiped by uninstall
    if (snap.exists()) {
      const remote = snap.data()
      const patch: Record<string, any> = { friendCode, userUid: uid }
      if (remote.username && (!currentSettings.username || currentSettings.username === 'User' || currentSettings.username === 'Eclipse Player')) {
        patch.username = remote.username
      }
      if (remote.avatarUrl && !currentSettings.avatarUrl) {
        patch.avatarUrl = remote.avatarUrl
      }
      if (remote.bio && !currentSettings.bio) {
        patch.bio = remote.bio
      }
      useGameStore.getState().updateSettings(patch)
      if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
        window.electronAPI.setSettings(patch)
      }
    } else {
      useGameStore.getState().updateSettings({ friendCode, userUid: uid })
      if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
        window.electronAPI.setSettings({ friendCode, userUid: uid })
      }
    }

    // Auto-detect Hardware Specs from Windows in background
    if (currentSettings.showHardwareSpecs && !currentSettings.hardwareSpecs && typeof window !== 'undefined' && window.electronAPI?.getHardwareSpecs) {
      window.electronAPI.getHardwareSpecs().then((specs: any) => {
        if (specs && (specs.cpu || specs.gpu)) {
          useGameStore.getState().updateSettings({ hardwareSpecs: specs })
          syncMyProfile().catch(() => {})
        }
      }).catch(() => {})
    }

    await syncMyProfile()
  } catch (err) {
    handleFirestoreError('setupUserInFirestore', err)
  }
}

/**
 * Syncs the local user's full profile to Firestore
 */
export const syncMyProfile = coalesceProfileSync(syncMyProfileNow)
async function syncMyProfileNow() {
  if (usesSharedSocialState()) return
  const myUid = getCanonicalUid()
  if (!myUid || auth.currentUser?.uid !== myUid) return

  try {
    const userRef = doc(db, 'users', myUid)
    const profile = await readOwnProfile(myUid)
    const snap = { exists: () => profile.exists, data: () => profile.data }
    if (getCanonicalUid() !== myUid || auth.currentUser?.uid !== myUid) return
    const { settings, library, installedGames, activeGame } = useGameStore.getState()

    let friendCode: string = canonicalFriendCode || settings.friendCode || ''
    if (snap.exists() && snap.data()?.friendCode) {
      friendCode = snap.data().friendCode || ''
      canonicalFriendCode = friendCode
    } else if (!friendCode || !friendCode.startsWith('ECL-')) {
      friendCode = generateEclipseFriendCode()
      canonicalFriendCode = friendCode
      useGameStore.getState().updateSettings({ friendCode })
    }

    const isIngame = !!activeGame
    const activeGameName = activeGame?.name || null

    // The clips-only store deliberately does not hydrate the library. It must
    // not overwrite existing cloud statistics with an artificial empty library.
    const profileStats = runtimeMode === 'clips' ? {
      showPlaytime: settings.profileShowPlaytime !== false,
      showSteamStats: settings.profileShowSteamStats !== false,
      ...(settings.profileShowPlaytime === false ? { totalPlaytimeMins: null, totalPlaytimeHours: null, topPlayedGames: [], pinnedGames: [] } : {}),
    } : publicProfileStats(settings, buildProfileGames(library || [], installedGames || []))

    const baseData = firestoreData({
      uid: myUid,
      friendCode: (friendCode || getOrCreateFriendCode()).toUpperCase().trim(),
      schemaVersion: 2,
      username: settings.username || 'Eclipse Player',
      avatarUrl: settings.avatarUrl || '',
      bannerUrl: settings.bannerUrl || null,
      avatarFrame: profileAvatarFrameValue(settings),
      steamAvatarFrameUrl: settings.steamAvatarFrameUrl || null,
      steamAvatarFrameStaticUrl: settings.steamAvatarFrameStaticUrl || null,
      bannerPosition: settings.profileBannerPosition ?? 44,
      bio: settings.bio || '',
      profileAccentColor: settings.profileAccentColor || '#a855f7',
      socialDiscord: settings.socialDiscord || '',
      socialTwitch: settings.socialTwitch || '',
      socialYoutube: settings.socialYoutube || '',
      showHardwareSpecs: Boolean(settings.showHardwareSpecs),
      hardwareSpecs: settings.showHardwareSpecs ? settings.hardwareSpecs || null : null,
      status: isIngame ? 'ingame' : 'online',
      currentGame: isIngame ? activeGameName : null,
      steamProfileUrl: settings.steamProfileUrl || '',
      ...publicSteamProfileStats(settings),
      steamBackgroundUrl: settings.steamBackgroundUrl || null,
      steamBackgroundMovie: settings.steamBackgroundMovie || null,
      showSteamBackground: settings.profileShowSteamBackground !== false,
      ...profileStats,
    })

    if (!snap.exists()) {
      await setDoc(userRef, {
        ...baseData,
        friends: [],
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      })
      if (getCanonicalUid() === myUid && auth.currentUser?.uid === myUid) ownProfile = { uid: myUid, exists: true, data: { ...baseData, friends: [] } }
    } else {
      const changes = changedProfileFields(profile.data, baseData)
      for (const key of ['accountSecret', 'deviceAnchorId', 'activeDeviceAnchorId']) {
        if (Object.prototype.hasOwnProperty.call(profile.data, key)) changes[key] = deleteField()
      }
      if (Object.keys(changes).length) {
        await updateDoc(userRef, changes)
        if (getCanonicalUid() === myUid && auth.currentUser?.uid === myUid) {
          const data: Record<string, any> = { ...(ownProfile?.uid === myUid ? ownProfile.data : profile.data), ...changes }
          for (const key of ['accountSecret', 'deviceAnchorId', 'activeDeviceAnchorId']) delete data[key]
          ownProfile = { uid: myUid, exists: true, data }
        }
      }
    }
    markFirestoreSuccess()

    // Keep local persistent identity (Registry & UserProfile) in lockstep
    if (typeof window !== 'undefined' && (window as any).electronAPI?.account?.saveIdentity) {
      const activeName = (settings.username && settings.username !== 'User' && settings.username !== 'Eclipse Player') ? settings.username : undefined
      const identity = {
        canonicalUid: myUid,
        friendCode: (friendCode || canonicalFriendCode || undefined),
        accountSecret: getAccountSecret() || undefined,
        username: activeName,
      }
      const identityKey = JSON.stringify(identity)
      if (lastIdentitySaved !== identityKey) {
        await (window as any).electronAPI.account.saveIdentity(identity)
        lastIdentitySaved = identityKey
      }
    }

    // Auto-enrich Steam profile in background if needed
    const isDefaultUsername = !settings.username || settings.username === 'User' || settings.username === 'Eclipse Player'
    if (isDefaultUsername && settings.steamProfileUrl) {
      import('./steamService').then(async ({ fetchSteamUserProfile }) => {
        try {
          const steamData = await fetchSteamUserProfile(settings.steamProfileUrl!)
          if (steamData && steamData.username && steamData.username !== 'Unknown') {
            const fresh = useGameStore.getState().settings
            if (getCanonicalUid() !== myUid || auth.currentUser?.uid !== myUid || fresh.steamProfileUrl !== settings.steamProfileUrl) return
            const steamUpdate = {
              username: fresh.username && !['User','Eclipse Player'].includes(fresh.username) ? fresh.username : steamData.username,
              avatarUrl: fresh.avatarUrl !== settings.avatarUrl ? fresh.avatarUrl || '' : steamData.avatarFull || fresh.avatarUrl || '',
              steamAvatarFrameUrl: steamData.steamAvatarFrameUrl ?? null,
              steamAvatarFrameStaticUrl: steamData.steamAvatarFrameStaticUrl ?? null,
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
            await syncMyProfile()
          }
        } catch (_) {}
      }).catch(() => {})
    }
  } catch (err) {
    handleFirestoreError('syncMyProfile', err)
  }
}

/**
 * Listens to the current user's document in Firestore.
 * When friends array changes, dynamically listens to friends' real-time presence.
 */
function listenToMyUserDoc(uid: string) {
  ensureChatNotifications(uid)
  if (currentUserUnsub && ownListenerUid === uid && !ownListenerFailed) return
  if (currentUserUnsub) currentUserUnsub()
  const generation = ++ownListenerGeneration
  ownListenerUid = uid; ownProfileLive = false; ownListenerFailed = false
  if (ownProfile?.uid !== uid) ownProfile = undefined

  const userRef = doc(db, 'users', uid)
  currentUserUnsub = onSnapshot(userRef, { includeMetadataChanges: true }, (docSnap) => {
    if (generation !== ownListenerGeneration || auth.currentUser?.uid !== uid) return
    ownProfile = { uid, exists: docSnap.exists(), data: docSnap.exists() ? docSnap.data() : {} }
    ownProfileLive = docSnap.metadata?.fromCache !== true && !docSnap.metadata?.hasPendingWrites
    if (!docSnap.exists()) return
    markFirestoreSuccess()

    const data = docSnap.data()
    const friendUids: string[] = Array.isArray(data?.friends) ? data.friends : []

    // Ensure our local friendCode is synced
    if (data?.friendCode && data.friendCode !== useGameStore.getState().settings.friendCode) {
      useGameStore.getState().updateSettings({ friendCode: data.friendCode })
    }

    // Cloud membership is authoritative; stale local entries must not recreate a removed friendship.
    const localFriends = useGameStore.getState().settings.eclipseFriends || []
    const remaining = localFriends.filter(friend => friend.id.startsWith('steam_') || /^\d{17}$/.test(friend.id) || friendUids.includes(friend.id))
    if (remaining.length !== localFriends.length) useGameStore.getState().updateSettings({ eclipseFriends: remaining })
    listenToFriendsPresence(friendUids)
  }, (err) => {
    if (generation !== ownListenerGeneration) return
    ownProfileLive = false; ownListenerFailed = true
    handleFirestoreError('listenToMyUserDoc', err)
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
      // If a friend has no lastSeen or lastSeen is older than PRESENCE_TTL_MS, mark offline
      const diff = friend.lastSeen ? Math.abs(now - friend.lastSeen) : Infinity
      const isStale = !friend.lastSeen || (diff >= PRESENCE_TTL_MS)
      if (isStale && friend.status !== 'offline') {
        changed = true
        return {
          ...friend,
          status: 'offline' as const,
          currentGame: undefined,
        }
      }
      // Invariant: An offline friend must NEVER show a currentGame
      if (friend.status === 'offline' && friend.currentGame) {
        changed = true
        return {
          ...friend,
          currentGame: undefined,
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
  const allTargetUids = Array.from(new Set(friendUids)).filter(uid => typeof uid === 'string' && uid).sort()
  const subscriptionKey = `${getCanonicalUid()}:${JSON.stringify(allTargetUids)}`
  if (friendsSubscriptionKey === subscriptionKey && failedFriendsSubscriptionKey !== subscriptionKey) return
  friendsQueryUnsub?.()
  friendsQueryUnsub = null
  friendsSubscriptionKey = subscriptionKey
  failedFriendsSubscriptionKey = ''
  readyFriendBatches.clear(); expectedFriendBatches.clear()
  if (allTargetUids.length === 0) {
    return
  }

  // Firestore allows up to 30 items in 'in' queries
  const subscriptions: Unsubscribe[] = []
  for (let offset = 0; offset < allTargetUids.length; offset += 30) {
    const targetUids = allTargetUids.slice(offset, offset + 30)
    const batchKey = JSON.stringify(targetUids)
    expectedFriendBatches.add(batchKey)
    const q = query(collection(db, 'users'), where('schemaVersion', '==', 2), where(documentId(), 'in', targetUids))
    subscriptions.push(onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      if (friendsSubscriptionKey !== subscriptionKey) return
      if (snapshot.metadata?.fromCache !== true && !snapshot.metadata?.hasPendingWrites) readyFriendBatches.add(batchKey)
      markFirestoreSuccess()
      const liveFriendsMap = new Map<string, EclipseFriend>()
      const now = Date.now()

      snapshot.docs.forEach((docItem) => {
        const u = docItem.data({ serverTimestamps: 'estimate' })
        const docUid = docItem.id || u.uid
        let lastSeenMs: number | undefined = undefined
        if (u.lastSeen) {
          if (typeof u.lastSeen === 'number') lastSeenMs = u.lastSeen
          else if (typeof u.lastSeen?.toMillis === 'function') lastSeenMs = u.lastSeen.toMillis()
          else if (typeof u.lastSeen?.toDate === 'function') lastSeenMs = u.lastSeen.toDate().getTime()
          else if (typeof u.lastSeen?.seconds === 'number') lastSeenMs = u.lastSeen.seconds * 1000
        }

        // Active IF AND ONLY IF lastSeen timestamp exists and diff is younger than PRESENCE_TTL_MS
        const diff = Math.abs(now - (lastSeenMs || 0))
        const isRecentlyActive = Boolean(lastSeenMs && diff < PRESENCE_TTL_MS)
        let status: 'online' | 'offline' | 'ingame' = 'offline'
        let currentGame: string | undefined = undefined

        if (isRecentlyActive && u.status && u.status !== 'offline') {
          if (u.status === 'ingame' && u.currentGame && typeof u.currentGame === 'string' && u.currentGame.trim().length > 0) {
            status = 'ingame'
            currentGame = u.currentGame.trim()
          } else {
            status = 'online'
            currentGame = undefined
          }
        } else {
          // Guaranteed offline: explicitly purge any game string
          status = 'offline'
          currentGame = undefined
        }

        const existing = useGameStore.getState().settings.eclipseFriends?.find(f => f.id === docUid)
        const friendObj: EclipseFriend = {
          id: docUid,
          username: u.username || existing?.username || 'Eclipse Player',
          avatarUrl: u.avatarUrl || existing?.avatarUrl || '',
          bannerUrl: u.bannerUrl || existing?.bannerUrl || undefined,
          avatarFrame: u.avatarFrame || existing?.avatarFrame || 'none',
          steamAvatarFrameUrl: u.steamAvatarFrameUrl ?? null,
          steamAvatarFrameStaticUrl: u.steamAvatarFrameStaticUrl ?? null,
          bannerPosition: u.bannerPosition ?? 44,
          bio: u.bio !== undefined ? u.bio : (existing?.bio || ''),
          profileAccentColor: u.profileAccentColor || existing?.profileAccentColor || undefined,
          socialDiscord: u.socialDiscord || existing?.socialDiscord || undefined,
          socialTwitch: u.socialTwitch || existing?.socialTwitch || undefined,
          socialYoutube: u.socialYoutube || existing?.socialYoutube || undefined,
          showHardwareSpecs: u.showHardwareSpecs !== undefined ? Boolean(u.showHardwareSpecs) : Boolean(existing?.showHardwareSpecs),
          hardwareSpecs: u.hardwareSpecs || existing?.hardwareSpecs || undefined,
          status: status,
          currentGame: currentGame,
          lastSeen: lastSeenMs || existing?.lastSeen,
          level: u.level || existing?.level || 1,
          steamLevel: u.steamLevel || existing?.steamLevel || 1,
          steamProfileUrl: u.steamProfileUrl || existing?.steamProfileUrl || undefined,
          friendCode: u.friendCode || existing?.friendCode || undefined,
          steamRecentGames: u.steamRecentGames || existing?.steamRecentGames || [],
          steamFavoriteBadge: u.steamFavoriteBadge || existing?.steamFavoriteBadge || null,
          steamBadges: u.steamBadges || existing?.steamBadges || [],
          steamGames: u.steamGames || existing?.steamGames || [],
          steamBackgroundUrl: u.steamBackgroundUrl || existing?.steamBackgroundUrl || undefined,
          steamBackgroundMovie: u.steamBackgroundMovie || existing?.steamBackgroundMovie || undefined,
          showSteamBackground: u.showSteamBackground !== false,
          showPlaytime: u.showPlaytime !== false,
          showSteamStats: u.showSteamStats !== false,
          pinnedGames: Array.isArray(u.pinnedGames) ? u.pinnedGames.slice(0, 3) : [],
          totalPlaytimeMins: u.totalPlaytimeMins, totalPlaytimeHours: u.totalPlaytimeHours,
          totalLibraryCount: u.totalLibraryCount, totalInstalledCount: u.totalInstalledCount,
          topPlayedGames: Array.isArray(u.topPlayedGames) ? u.topPlayedGames : [],
        }
        liveFriendsMap.set(docUid, friendObj)

        // Notify if a brand new friend was added by someone else
        if (!knownFriendIds.has(docUid) && knownFriendIds.size > 0) {
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

      // Merge live cloud friends with all existing local friends
      const currentFriends = useGameStore.getState().settings.eclipseFriends || []
      const updatedFriends = currentFriends.map((localFriend) => {
        const live = liveFriendsMap.get(localFriend.id)
        if (live) {
          knownFriendIds.add(live.id)
          return live
        }
        return localFriend
      })

      // Add any newly discovered cloud friends
      liveFriendsMap.forEach((live, id) => {
        if (!updatedFriends.some(f => f.id === id)) {
          updatedFriends.push(live)
          knownFriendIds.add(id)
        }
      })

      useGameStore.getState().updateSettings({
        eclipseFriends: updatedFriends
      })

      ensurePresenceDecayTimer()
    }, (err) => {
      if (friendsSubscriptionKey !== subscriptionKey) return
      failedFriendsSubscriptionKey = subscriptionKey
      readyFriendBatches.delete(batchKey)
      handleFirestoreError('listenToFriendsPresence', err)
    }))
  }
  friendsQueryUnsub = () => subscriptions.forEach(unsubscribe => unsubscribe())
}

/** Sends an invitation; a friendship exists only after the recipient accepts. */
export const addFriendByCode = (code: string) => friendRequests.send(code)
export const sendFriendRequest = addFriendByCode
export const acceptFriendRequest = (uid: string) => friendRequests.accept(uid)
export const declineFriendRequest = (uid: string) => friendRequests.decline(uid)
export const cancelFriendRequest = (uid: string) => friendRequests.cancel(uid)

/**
 * Removes a friend from Firestore and local store
 */
export async function removeFirebaseFriend(friendId: string) {
  if (!friendId || friendId.includes('/')) throw Error('Invalid friend')
  if (!/^\d{17}$/.test(friendId) && !friendId.startsWith('steam_')) {
    const currentUid = await requireSocialUid()
    await runTransaction(db, async tx => {
      const mine = doc(db,'users',currentUid), theirs = doc(db,'users',friendId)
      const [me,other] = await Promise.all([tx.get(mine),tx.get(theirs)])
      if (me.exists()) tx.update(mine,{friends:arrayRemove(friendId)})
      if (other.exists() && other.data().schemaVersion === 2) tx.update(theirs,{friends:arrayRemove(currentUid)})
    })
  }
  knownFriendIds.delete(friendId)

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
  const currentUid = getCanonicalUid()
  if (!currentUid || auth.currentUser?.uid !== currentUid) return

  try {
    const userRef = doc(db, 'users', currentUid)
    await setDoc(userRef, {
      status,
      currentGame: status === 'ingame' ? (gameName || null) : null,
      lastSeen: serverTimestamp()
    }, { merge: true })
    markFirestoreSuccess()
  } catch (err) {
    handleFirestoreError('updateFirebasePresence', err)
  }
}

// Presence alias for compatibility
export const updateSocialPresence = updateFirebasePresence

/**
 * Forces a manual or proactive refresh of all friends' cloud presence
 */
let friendsRefresh: Promise<void> | undefined
let friendsRefreshUid = '', friendsRefreshedAt = 0
export function refreshFriendsPresence(force = false): Promise<void> {
  if (friendsRefresh) return friendsRefresh
  friendsRefresh = (async () => {
    if (usesSharedSocialState()) {
      const snapshot = await window.electronAPI!.socialState!.refresh(force)
      await auth.authStateReady()
      applySharedSnapshot?.(snapshot)
      return
    }
    const uid = await requireSocialUid()
    if (!force && ownProfileLive && ownListenerUid === uid && readyFriendBatches.size === expectedFriendBatches.size) return
    if (!force && friendsRefreshUid === uid && Date.now() - friendsRefreshedAt < 1500) return
    try {
      const own = await getDoc(doc(db,'users',uid))
      if (getCanonicalUid() !== uid || auth.currentUser?.uid !== uid) return
      if (!own.exists()) throw Error('Profile unavailable')
      ownProfile = { uid, exists: true, data: own.data() }
      const ids = [...new Set<string>((own.data().friends || []).filter((id: unknown) => typeof id === 'string' && id && !id.includes('/')))]
      const batches = []
      for (let offset = 0; offset < ids.length; offset += 30) batches.push(getDocs(query(collection(db,'users'),where('schemaVersion','==',2),where(documentId(),'in',ids.slice(offset,offset+30)))))
      const snapshots = await Promise.all(batches)
      if (getCanonicalUid() !== uid || auth.currentUser?.uid !== uid) return
      const fresh = useGameStore.getState().settings.eclipseFriends || []
      const byId = new Map(fresh.map(friend => [friend.id,friend]))
      const online = snapshots.flatMap(snapshot => snapshot.docs.map(item => {
        const data = item.data(), seen = data.lastSeen?.toMillis?.() || 0
        return {...byId.get(item.id), ...friendFromProfile(data,item.id), ...(Date.now()-seen >= PRESENCE_TTL_MS ? {status:'offline' as const,currentGame:undefined} : {})}
      }))
      useGameStore.getState().updateSettings({eclipseFriends:[...fresh.filter(friend => friend.id.startsWith('steam_') || /^\d{17}$/.test(friend.id)), ...online]})
      friendRequests.start(uid, typeof location === 'undefined' || location.hash !== '#friends')
      listenToMyUserDoc(uid)
      listenToFriendsPresence(ids)
      markFirestoreSuccess(); friendsRefreshUid = uid; friendsRefreshedAt = Date.now()
    } catch (error) { handleFirestoreError('refreshFriendsPresence',error); throw error }
  })().finally(() => {friendsRefresh = undefined})
  return friendsRefresh
}

/**
 * Fetches a user's full public profile from Firestore by UID or Friend Code
 */
export async function fetchUserProfile(uidOrCode: string): Promise<any | null> {
  try {
    await requireSocialUid()
    const profile = await findPublicSocialProfile(db, uidOrCode)
    markFirestoreSuccess()
    return profile
  } catch (err) {
    handleFirestoreError('fetchUserProfile', err)
    return null
  }
}

/** Steam follows are local. Eclipse contacts must consent again after removal. */
export async function restoreFirebaseFriend(friend: EclipseFriend) {
  if (!/^\d{17}$/.test(friend.id) && !friend.id.startsWith('steam_')) {
    const result = await friendRequests.send(friend.id)
    if (!result.success) throw Error(result.error || 'Friend request failed')
    return
  }
  const friends = useGameStore.getState().settings.eclipseFriends || []
  if (!friends.some(item => item.id === friend.id)) useGameStore.getState().updateSettings({ eclipseFriends: [...friends, friend] })
}
export const restoreSocialFriend = restoreFirebaseFriend
export const removeSocialFriend = removeFirebaseFriend

/**
 * Restores an account on any machine strictly using its secret Recovery Key.
 * Friend codes are strictly rejected to prevent unauthorized account takeover.
 */
export function enableSecureRecovery(): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  return accountOperation(enableSecureRecoveryNow)
}

async function enableSecureRecoveryNow(): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  const uid = getCanonicalUid()
  try {
    await auth.authStateReady?.()
    const identity = await window.electronAPI?.account?.getIdentity?.()
    if (identity?.canonicalUid === uid && validRecoveryKey(identity.accountSecret || '')) {
      canonicalAccountSecret = identity.accountSecret
      useGameStore.getState().updateSettings({ accountSecret: identity.accountSecret })
    }
    await resumeSavedRecovery(auth, uid, getAccountSecret())
    if (!auth.currentUser || auth.currentUser.uid !== uid) throw new RecoveryFailure('session-mismatch')
    if (auth.currentUser.providerData.some(provider => provider.providerId === 'password') && !validRecoveryKey(getAccountSecret())) throw new RecoveryFailure('different-key')
    const key = validRecoveryKey(getAccountSecret()) ? getAccountSecret() : newRecoveryKey()
    // Keep the new key in local OS storage before binding its authentication credential.
    const patch = { accountSecret: key, accountRecoveryReady: false, accountRecoveryError: '', accountRecoveryErrorCode: '' }
    await persistAccountLocally(patch, { canonicalUid: uid, friendCode: getOrCreateFriendCode(), accountSecret: key })
    canonicalAccountSecret = key
    useGameStore.getState().updateSettings(patch)
    await protectRecovery(auth, uid, key)
    const ready = { accountRecoveryReady: true, accountRecoveryError: '', accountRecoveryErrorCode: '' }
    if (window.electronAPI?.setSettings && (await window.electronAPI.setSettings(ready))?.success !== true) throw new RecoveryFailure('persistence-failed')
    useGameStore.getState().updateSettings(ready)
    return { success: true }
  } catch (error) {
    const code = recoveryErrorCode(error), message = recoveryError(error, useGameStore.getState().settings.language)
    const patch = { accountRecoveryReady: false, accountRecoveryError: message, accountRecoveryErrorCode: code }
    useGameStore.getState().updateSettings(patch)
    void window.electronAPI?.setSettings?.(patch).catch(() => {})
    return { success: false, error: message, errorCode: code }
  }
}

export function restoreAccountBySecret(recoveryKey: string): Promise<{ success: boolean; message?: string; error?: string; errorCode?: string }> {
  return accountOperation(() => restoreAccountBySecretNow(recoveryKey))
}

async function restoreAccountBySecretNow(recoveryKey: string): Promise<{ success: boolean; message?: string; error?: string; errorCode?: string }> {
  let rollback: (() => Promise<void>) | undefined
  try {
    const key = recoveryKey.trim().toUpperCase()
    if (!validRecoveryKey(key)) throw new RecoveryFailure('invalid-key')
    const recovered = await authenticateRecovery(auth, key)
    rollback = recovered.rollback
    const profile = await getDoc(doc(db, 'users', recovered.uid))
    if (!profile.exists()) throw new RecoveryFailure('profile-missing')
    const data = publicProfileData(profile.data())
    if (typeof data.friendCode !== 'string' || !data.friendCode.startsWith('ECL-')) throw new RecoveryFailure('profile-incomplete')
    const patch = { userUid: recovered.uid, friendCode: data.friendCode, accountSecret: key, accountRecoveryReady: true, accountRecoveryError: '', accountRecoveryErrorCode: '',
      username: typeof data.username === 'string' ? data.username : 'Eclipse Player', avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '', bio: typeof data.bio === 'string' ? data.bio : '' }
    await persistAccountLocally(patch, { canonicalUid: recovered.uid, friendCode: patch.friendCode, accountSecret: key, username: patch.username })
    canonicalUid = recovered.uid; canonicalFriendCode = patch.friendCode; canonicalAccountSecret = key
    useGameStore.getState().updateSettings(patch)
    rollback = undefined
    listenToMyUserDoc(recovered.uid)
    friendRequests.start(recovered.uid)
    await syncMyProfile()
    return { success: true, message: translate(useGameStore.getState().settings.language, 'uiRecoveryRestored') }
  } catch (error) {
    await rollback?.().catch(() => {})
    return { success: false, error: recoveryError(error, useGameStore.getState().settings.language), errorCode: recoveryErrorCode(error) }
  }
}

/**
 * Returns account recovery and backup metadata
 */
export async function getAccountBackupInfo(): Promise<{
  canonicalUid: string
  friendCode: string
  accountSecret: string
  deviceAnchorId: string
  isProtected: boolean
}> {
  const uid = getCanonicalUid()
  const code = canonicalFriendCode || useGameStore.getState().settings.friendCode || ''
  const secret = getAccountSecret()
  let anchor = currentDeviceAnchorId
  if (!anchor && typeof window !== 'undefined' && window.electronAPI?.account?.getDeviceAnchor) {
    try {
      anchor = await window.electronAPI.account.getDeviceAnchor()
      currentDeviceAnchorId = anchor
    } catch (_) {}
  }

  return {
    canonicalUid: uid,
    friendCode: code,
    accountSecret: secret,
    deviceAnchorId: anchor,
    isProtected: Boolean(useGameStore.getState().settings.accountRecoveryReady && auth.currentUser?.uid === uid && auth.currentUser.providerData.some(provider => provider.providerId === 'password')),
  }
}


