import type { Presence } from 'discord-rpc'

export type DiscordActivity = Pick<Presence,
  'state' | 'details' | 'startTimestamp' | 'endTimestamp' |
  'largeImageKey' | 'largeImageText' | 'smallImageKey' | 'smallImageText' |
  'instance' | 'buttons'
> & {
  name?: string
  statusDisplayType?: 0 | 1 | 2
  processId?: number
}

function timestamp(value: number | Date | undefined) {
  if (value === undefined) return undefined
  const time = value instanceof Date ? value.getTime() : value
  if (!Number.isFinite(time) || time < 0 || time > 2147483647000) throw new RangeError('Invalid Discord activity timestamp')
  return Math.round(time)
}

/** The old setActivity() helper drops name/status_display_type. Keep the documented IPC fields. */
export function discordActivityPayload(activity: DiscordActivity) {
  const hasImage = activity.largeImageKey || activity.largeImageText || activity.smallImageKey || activity.smallImageText
  return {
    type: 0,
    name: activity.name,
    status_display_type: activity.statusDisplayType ?? 0,
    details: activity.details,
    state: activity.state,
    ...(activity.startTimestamp !== undefined || activity.endTimestamp !== undefined ? {
      timestamps: { start: timestamp(activity.startTimestamp), end: timestamp(activity.endTimestamp) },
    } : {}),
    ...(hasImage ? { assets: {
      large_image: activity.largeImageKey, large_text: activity.largeImageText,
      small_image: activity.smallImageKey, small_text: activity.smallImageText,
    } } : {}),
    instance: !!activity.instance,
    buttons: activity.buttons,
  }
}
