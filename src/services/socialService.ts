import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'
import type { EclipseFriend, FriendRequest } from '../types/game'

// Default fallback API URL (can be customized in settings)
export const DEFAULT_SOCIAL_API_URL = 'https://eclipse-social-api.eclipse-launcher.workers.dev'

let pollingInterval: any = null
let presenceHeartbeatInterval: any = null
const knownRequestUids = new Set<string>()
let isInitialized = false

function getApiUrl(): string {
  const custom = useGameStore.getState().settings.socialApiUrl
  if (custom && custom.trim().startsWith('http')) {
    return custom.trim().replace(/\/+$/, '')
  }
  return DEFAULT_SOCIAL_API_URL
}

// Dedicated localStorage keys — independent of Zustand store resets or HMR
const ECLIPSE_UID_KEY = 'eclipse-uid'
const ECLIPSE_CODE_KEY = 'eclipse-friend-code'

/**
 * Generates or retrieves a persistent local user UID.
 * Uses a dedicated localStorage key as the single source of truth.
 * This is stable across HMR, StrictMode double-calls, and store resets.
 */
export function getOrCreateUserUid(): string {
  // 1. Check dedicated localStorage key first (most reliable)
  try {
    const fromLS = localStorage.getItem(ECLIPSE_UID_KEY)
    if (fromLS && fromLS.trim() && fromLS.startsWith('uid_')) {
      const inStore = useGameStore.getState().settings.userUid
      if (inStore !== fromLS.trim()) {
        useGameStore.getState().updateSettings({ userUid: fromLS.trim() })
      }
      return fromLS.trim()
    }
  } catch (_) {}

  // 2. Check Zustand store
  const fromStore = useGameStore.getState().settings.userUid
  if (fromStore && fromStore.trim() && fromStore.startsWith('uid_')) {
    try { localStorage.setItem(ECLIPSE_UID_KEY, fromStore.trim()) } catch (_) {}
    return fromStore.trim()
  }

  // 3. Generate new UID and persist to ALL layers
  const newUid = `uid_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`
  try { localStorage.setItem(ECLIPSE_UID_KEY, newUid) } catch (_) {}
  useGameStore.getState().updateSettings({ userUid: newUid })
  if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
    window.electronAPI.setSettings({ userUid: newUid })
  }
  return newUid
}

/**
 * Generates or retrieves a permanent local Friend Code.
 * Stored in localStorage and permanently tied to the user UID. Never changes.
 */
export function getOrCreateFriendCode(): string {
  const uid = getOrCreateUserUid()

  // 1. Check dedicated localStorage key
  try {
    const fromLS = localStorage.getItem(ECLIPSE_CODE_KEY)
    if (fromLS && fromLS.trim() && fromLS.startsWith('ECL-')) {
      const inStore = useGameStore.getState().settings.friendCode
      if (inStore !== fromLS.trim()) {
        useGameStore.getState().updateSettings({ friendCode: fromLS.trim() })
      }
      return fromLS.trim()
    }
  } catch (_) {}

  // 2. Check store
  const fromStore = useGameStore.getState().settings.friendCode
  if (fromStore && fromStore.trim() && fromStore.startsWith('ECL-')) {
    try { localStorage.setItem(ECLIPSE_CODE_KEY, fromStore.trim()) } catch (_) {}
    return fromStore.trim()
  }

  // 3. Derive permanent code from UID
  const code = deriveFriendCodeFromUid(uid)
  try { localStorage.setItem(ECLIPSE_CODE_KEY, code) } catch (_) {}
  useGameStore.getState().updateSettings({ friendCode: code })
  if (typeof window !== 'undefined' && window.electronAPI?.setSettings) {
    window.electronAPI.setSettings({ friendCode: code })
  }
  return code
}

/**
 * Generates a deterministic Eclipse friend code from a UID.
 * Same UID always produces the exact same code — stable and permanent forever.
 */
export function deriveFriendCodeFromUid(uid: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash + uid.charCodeAt(i)) >>> 0
  }
  let code = 'ECL-'
  let h = hash
  for (let i = 0; i < 5; i++) {
    code += chars[h % chars.length]
    h = Math.floor(h / chars.length) || ((hash >>> (i * 3 + 1)) ^ 0x5a5a)
  }
  return code
}

/**
 * Generates a random Eclipse friend code (fallback only)
 */
export function generateEclipseFriendCode(): string {
  return deriveFriendCodeFromUid(getOrCreateUserUid())
}

/**
 * Initialize Cloudflare D1 Social Network:
 * 1. Ensure user UID & friend code exist and are permanent
 * 2. Sync local user profile to Cloudflare D1
 * 3. Start presence heartbeat & polling for live friend updates
 */
export async function initSocialNetwork() {
  if (isInitialized) return
  isInitialized = true

  try {
    const uid = getOrCreateUserUid()
    const friendCode = getOrCreateFriendCode()

    // Clean any invalid ghost friends (e.g. Steam error pages or test ghosts)
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

    // 1. Initial sync
    await syncMyProfile()

    // 2. Initial poll
    await pollFriendsAndRequests()

    // 3. Start Heartbeat (every 25 seconds)
    startPresenceHeartbeat()

    // 4. Start Live Polling for friend updates & incoming requests (every 10 seconds)
    startPolling()
  } catch (err) {
    console.warn('[SocialService] Init error:', err)
  }
}

// Backward compatibility alias for existing imports
export const initFirebaseSocial = initSocialNetwork

/**
 * Starts active heartbeat keeping user presence alive in Cloudflare D1 every 25 seconds
 */
export function startPresenceHeartbeat() {
  if (presenceHeartbeatInterval) clearInterval(presenceHeartbeatInterval)

  presenceHeartbeatInterval = setInterval(async () => {
    const uid = getOrCreateUserUid()
    const activeGame = useGameStore.getState().activeGame
    const status = activeGame ? 'ingame' : 'online'
    const currentGame = activeGame?.name || null

    try {
      await fetch(`${getApiUrl()}/api/user/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, status, currentGame }),
      })
    } catch {}
  }, 25000)
}

/**
 * Starts live polling for friends & requests every 10 seconds
 */
export function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval)

  pollingInterval = setInterval(async () => {
    await pollFriendsAndRequests()
  }, 10000)
}

/**
 * Stops live polling and heartbeat
 */
export function stopSocialNetwork() {
  if (pollingInterval) clearInterval(pollingInterval)
  if (presenceHeartbeatInterval) clearInterval(presenceHeartbeatInterval)
  isInitialized = false
}

/**
 * Polls the Cloudflare Worker API for confirmed friends and pending requests
 */
export async function pollFriendsAndRequests() {
  const uid = getOrCreateUserUid()
  if (!uid) return

  try {
    const res = await fetch(`${getApiUrl()}/api/friends/poll?uid=${encodeURIComponent(uid)}`)
    if (!res.ok) return

    const data = await res.json()
    if (!data.success) return

    const friends: EclipseFriend[] = data.friends || []
    const incomingRequests: FriendRequest[] = data.incomingRequests || []
    const outgoingRequests = data.outgoingRequests || []

    // Detect newly received incoming friend requests and trigger notification
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
          duration: 7000,
        })
      }
    })

    // Merge live cloud friends with existing local friends without wiping local/offline friends
    const currentLocalFriends = useGameStore.getState().settings.eclipseFriends || []
    const mergedMap = new Map<string, EclipseFriend>()

    // 1. Keep existing local friends first
    currentLocalFriends.forEach((f) => {
      if (f && f.id) mergedMap.set(f.id, f)
    })

    // 2. Overlay live cloud friends (updates online/ingame status, live game, avatar, levels)
    friends.forEach((f) => {
      if (f && f.id) {
        const existing = mergedMap.get(f.id) || {}
        mergedMap.set(f.id, {
          ...existing,
          ...f,
          status: f.status || (existing as any).status || 'offline',
        })
      }
    })

    // Update Zustand store
    useGameStore.getState().updateSettings({
      eclipseFriends: Array.from(mergedMap.values()),
      incomingFriendRequests: incomingRequests,
      outgoingFriendRequests: outgoingRequests,
    })
  } catch (err) {
    // Silently ignore network/offline errors during background polling
  }
}

/**
 * Syncs the local user's full profile (stats, playtime, steam level, badges, top games) to Cloudflare D1
 */
export async function syncMyProfile() {
  const uid = getOrCreateUserUid()
  const friendCode = getOrCreateFriendCode()
  if (!uid || !friendCode) return

  try {
    const { settings, library, installedGames, activeGame } = useGameStore.getState()
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

    const payload = {
      uid,
      friendCode: friendCode.toUpperCase().trim(),
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
    }

    // Direct, fast sync to Cloudflare D1
    await fetch(`${getApiUrl()}/api/user/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    // Background Steam enrich if needed
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
            await fetch(`${getApiUrl()}/api/user/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payload, ...steamUpdate }),
            })
          }
        } catch (_) {}
      }).catch(() => {})
    }
  } catch (err) {
    console.warn('[SocialService] syncMyProfile error:', err)
  }
}

/**
 * Fetches a user's full public profile from Cloudflare D1 by UID or Eclipse Friend Code
 */
export async function fetchUserProfile(uidOrCode: string): Promise<any | null> {
  if (!uidOrCode || typeof uidOrCode !== 'string') return null
  const raw = uidOrCode.trim()
  if (!raw) return null

  try {
    const res = await fetch(`${getApiUrl()}/api/user/${encodeURIComponent(raw)}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success && data.user) {
        return data.user
      }
    }
  } catch (e) {
    console.warn('[SocialService] fetchUserProfile error:', e)
  }

  return null
}

/**
 * Sends a friend request to another user by their Eclipse Friend Code (or raw UID)
 */
export async function sendFriendRequest(codeOrUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) {
    return { success: false, error: 'Keine Benutzer-ID gefunden.' }
  }

  const raw = codeOrUid.trim()
  if (!raw) {
    return { success: false, error: 'Bitte gib einen gültigen Freundes-Code ein.' }
  }

  try {
    const res = await fetch(`${getApiUrl()}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUid: myUid, toCodeOrUid: raw }),
    })

    const data = await res.json()
    if (res.ok && data.success) {
      pollFriendsAndRequests()
      return {
        success: true,
        message: data.message || 'Freundschaftsanfrage gesendet!',
      }
    }

    return { success: false, error: data?.error || 'Kein Spieler mit diesem Code gefunden.' }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Server nicht erreichbar.' }
  }
}

/**
 * Adds a friend instantly using their Eclipse Friend Code or UID (Firebase-like instant bilateral connection)
 */
export async function addFriendByCode(codeOrUid: string): Promise<{ success: boolean; friend?: EclipseFriend; message?: string; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) {
    return { success: false, error: 'Keine Benutzer-ID gefunden.' }
  }

  const raw = codeOrUid.trim()
  const cleanCode = raw.toUpperCase().replace(/\s+/g, '')
  if (!cleanCode) {
    return { success: false, error: 'Bitte gib einen gültigen Freundes-Code ein.' }
  }

  // Prevent adding self
  const mySettings = useGameStore.getState().settings
  const myCode = (mySettings.friendCode || getOrCreateFriendCode()).toUpperCase().replace(/\s+/g, '')
  if (cleanCode === myCode || cleanCode === myUid || cleanCode.replace(/^ECL-/, '') === myCode.replace(/^ECL-/, '')) {
    return { success: false, error: 'Du kannst dich nicht selbst als Freund hinzufügen.' }
  }

  // 1. Look up user profile in Cloudflare D1
  const cloudUser = await fetchUserProfile(raw)
  if (cloudUser && cloudUser.uid) {
    if (cloudUser.uid === myUid) {
      return { success: false, error: 'Du kannst dich nicht selbst als Freund hinzufügen.' }
    }

    const friendObj: EclipseFriend = {
      id: cloudUser.uid,
      username: cloudUser.username || 'Eclipse Player',
      avatarUrl: cloudUser.avatarUrl || '',
      status: (cloudUser.status as any) || 'online',
      currentGame: cloudUser.currentGame || undefined,
      level: cloudUser.level || 1,
      steamLevel: cloudUser.steamLevel || 1,
      steamProfileUrl: cloudUser.steamProfileUrl || undefined,
      friendCode: cloudUser.friendCode || cleanCode,
      steamRecentGames: cloudUser.steamRecentGames || [],
      steamFavoriteBadge: cloudUser.steamFavoriteBadge || null,
    }

    // Instantly add to local store
    const currentFriends = useGameStore.getState().settings.eclipseFriends || []
    if (!currentFriends.some(f => f.id === friendObj.id)) {
      useGameStore.getState().updateSettings({
        eclipseFriends: [...currentFriends, friendObj]
      })
    }

    // Send bilateral request on Cloudflare D1 in background
    fetch(`${getApiUrl()}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUid: myUid, toCodeOrUid: cloudUser.uid }),
    }).then(() => pollFriendsAndRequests()).catch(() => {})

    return {
      success: true,
      friend: friendObj,
      message: `Freund ${friendObj.username} hinzugefügt!`,
    }
  }

  // 2. Try sendFriendRequest endpoint directly
  const reqRes = await sendFriendRequest(raw)
  if (reqRes.success) {
    return { success: true, message: reqRes.message }
  }

  return { success: false, error: reqRes.error || 'Kein Spieler mit diesem Code gefunden.' }
}

/**
 * Accepts an incoming friend request
 */
export async function acceptFriendRequest(fromUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) return { success: false, error: 'Nicht angemeldet.' }

  // Optimistically update local Zustand store immediately for 0ms latency
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
    eclipseFriends: updatedFriends,
  })

  try {
    const res = await fetch(`${getApiUrl()}/api/friends/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myUid, fromUid }),
    })

    const data = await res.json()
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Fehler beim Annehmen der Anfrage.' }
    }

    const lang = curSettings.language === 'de' ? 'de' : 'en'
    sendAppNotification({
      title: lang === 'de' ? 'Freundschaftsanfrage angenommen! 🎉' : 'Friend Request Accepted! 🎉',
      body: lang === 'de'
        ? `Du bist jetzt mit ${matchingLocalReq?.fromUsername || 'dem Spieler'} befreundet!`
        : `You are now friends with ${matchingLocalReq?.fromUsername || 'the player'}!`,
      type: 'success',
      playSound: true,
    })

    // Poll to sync full metadata
    pollFriendsAndRequests()

    return { success: true }
  } catch (err: any) {
    console.error('[SocialService] acceptFriendRequest error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Declines an incoming friend request
 */
export async function declineFriendRequest(fromUid: string): Promise<{ success: boolean; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) return { success: false, error: 'Nicht angemeldet.' }

  // Optimistic local removal
  const curSettings = useGameStore.getState().settings
  const curIncoming = curSettings.incomingFriendRequests || []
  useGameStore.getState().updateSettings({
    incomingFriendRequests: curIncoming.filter(r => r.fromUid !== fromUid),
  })

  try {
    const res = await fetch(`${getApiUrl()}/api/friends/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myUid, fromUid }),
    })

    const data = await res.json()
    return { success: data.success }
  } catch (err: any) {
    console.error('[SocialService] declineFriendRequest error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Truly removes a friend bilaterally on BOTH sides and local Zustand store
 */
export async function removeFirebaseFriend(friendId: string) {
  const myUid = getOrCreateUserUid()

  // 1. Update local Zustand store immediately
  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  useGameStore.getState().updateSettings({
    eclipseFriends: currentFriends.filter(f => f.id !== friendId),
  })

  if (myUid && friendId) {
    try {
      await fetch(`${getApiUrl()}/api/friends/${encodeURIComponent(friendId)}?uid=${encodeURIComponent(myUid)}`, {
        method: 'DELETE',
      })
    } catch (err) {
      console.warn('[SocialService] removeFriend error:', err)
    }
  }
}

export const removeSocialFriend = removeFirebaseFriend

/**
 * Restores a removed friend bilaterally (used by the minimalist Undo action)
 */
export async function restoreFirebaseFriend(friend: EclipseFriend) {
  const myUid = getOrCreateUserUid()

  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  if (!currentFriends.some(f => f.id === friend.id)) {
    useGameStore.getState().updateSettings({
      eclipseFriends: [...currentFriends, friend],
    })
  }

  if (myUid && friend?.id) {
    try {
      await fetch(`${getApiUrl()}/api/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myUid, fromUid: friend.id }),
      })
    } catch (err) {
      console.warn('[SocialService] restoreFriend error:', err)
    }
  }
}

export const restoreSocialFriend = restoreFirebaseFriend

/**
 * Updates current user's live presence (online, ingame, or offline)
 */
export async function updateFirebasePresence(status: 'online' | 'ingame' | 'offline', gameName?: string | null) {
  const myUid = getOrCreateUserUid()
  if (!myUid) return

  try {
    const activeGameName = status === 'ingame' && gameName ? gameName : null
    await fetch(`${getApiUrl()}/api/user/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: myUid, status, currentGame: activeGameName }),
    })
  } catch (err) {
    console.warn('[SocialService] updatePresence error:', err)
  }
}

export const updateSocialPresence = updateFirebasePresence
