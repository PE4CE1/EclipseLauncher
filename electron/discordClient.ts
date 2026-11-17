import { DiscordIpcClient } from './discordIpcClient'
import type { DiscordClient } from './discordConnection'
import { discordActivityPayload } from './discordActivity'

export function createDiscordClient(): DiscordClient {
  const client = new DiscordIpcClient()
  let activityPid: number | undefined
  const rejectedArtwork = new Set<string>()
  return {
    on: (event, listener) => client.on(event, listener),
    removeAllListeners: () => client.removeAllListeners(),
    login: options => client.login(options),
    setActivity: async activity => {
      const pid = Number.isSafeInteger(activity.processId) && activity.processId! > 0 ? activity.processId! : process.pid
      if (activityPid !== undefined && pid !== activityPid) await client.request('SET_ACTIVITY', { pid: activityPid })
      activityPid = pid
      const payload = discordActivityPayload(activity)
      const artworkKey = JSON.stringify([payload.assets, payload.buttons])
      const minimal = () => { const { assets: _assets, buttons: _buttons, ...base } = payload; return base }
      try {
        await client.request('SET_ACTIVITY', { pid, activity: rejectedArtwork.has(artworkKey) ? minimal() : payload })
      } catch (error) {
        // Optional images/buttons must not hide the game on a validation error.
        // Transport failures stay in the connection controller's retry path.
        if (![4000, 4002, 50035].includes(Number((error as { code?: number }).code))) throw error
        await client.request('SET_ACTIVITY', { pid, activity: minimal() })
        rejectedArtwork.add(artworkKey)
        if (rejectedArtwork.size > 32) rejectedArtwork.delete(rejectedArtwork.values().next().value!)
      }
    },
    clearActivity: () => client.request('SET_ACTIVITY', { pid: activityPid ?? process.pid }),
    destroy: () => client.destroy(),
  }
}
