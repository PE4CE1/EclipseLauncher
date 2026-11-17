const profiles = new Map<string, unknown>(), waiting = new Map<string, (value: unknown) => void>()
export const profileSocialFixture = {
  profiles, waiting, syncs: 0, requests: [] as string[],
  resolve: (id: string, data: unknown) => { waiting.get(id)?.(data); waiting.delete(id) },
}
export async function syncMyProfile() { profileSocialFixture.syncs++ }
export async function fetchUserProfile(id: string) {
  if (profiles.has(id)) return profiles.get(id)
  return new Promise<unknown>(resolve => waiting.set(id, resolve))
}
export async function sendFriendRequest(id: string) { profileSocialFixture.requests.push(id); return { success: false, error: 'Request failed' } }
