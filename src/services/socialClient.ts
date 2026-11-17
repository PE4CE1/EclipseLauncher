type SocialService = typeof import('./socialService')
type Presence = Parameters<SocialService['updateSocialPresence']>

let client: Promise<SocialService> | undefined
let latestPresence: Presence | undefined

export async function initSocialNetwork() {
  client ??= import('./socialService')
  const social = await client
  await social.initSocialNetwork()
  if (latestPresence) await social.updateSocialPresence(...latestPresence)
}

// Presence changes before startup completes are coalesced instead of pulling
// the Firebase SDK into the first frame or authenticating several times.
export function updateSocialPresence(...presence: Presence): Promise<void> {
  latestPresence = presence
  if (!client) return Promise.resolve()
  return client.then(social => social.updateSocialPresence(...presence))
}
