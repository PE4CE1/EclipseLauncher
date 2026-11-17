export type DiscordSettings = {
  discordRpc?: boolean
  discordRpcIdle?: boolean
  discordRpcShowDownloads?: boolean
  discordRpcShowVersion?: boolean
  discordRpcPrivacyMode?: boolean
  discordRpcRobloxSubGame?: boolean
  discordRpcAnimatedText?: boolean
  discordActivityStyle?: 'playing' | 'clipping'
  discordRpcActivityStyle?: 'playing' | 'clipping'
  discordEnabled?: boolean
  showIdle?: boolean
  showDownloads?: boolean
  discordPrivacyMode?: boolean
}

export function normalizeDiscordSettings(settings: DiscordSettings) {
  return {
    discordEnabled: settings.discordRpc ?? settings.discordEnabled ?? true,
    showIdle: settings.discordRpcIdle ?? settings.showIdle ?? true,
    showDownloads: settings.discordRpcShowDownloads ?? settings.showDownloads ?? true,
    discordRpcShowVersion: settings.discordRpcShowVersion === true,
    discordPrivacyMode: settings.discordRpcPrivacyMode ?? settings.discordPrivacyMode ?? false,
    discordActivityStyle: settings.discordActivityStyle || settings.discordRpcActivityStyle || 'clipping' as const,
    discordRpcRobloxSubGame: settings.discordRpcRobloxSubGame !== false,
    discordRpcAnimatedText: settings.discordRpcAnimatedText === true,
  }
}

export function discordPresenceMode(settings: ReturnType<typeof normalizeDiscordSettings>, game: { name: string } | null, download?: string | null) {
  if (!settings.discordEnabled) return 'off'
  if (game) return 'game'
  if (settings.showDownloads && download) return 'download'
  return settings.showIdle ? 'idle' : 'off'
}

export function mergeDiscordSettings(previous: DiscordSettings, patch: DiscordSettings) {
  return normalizeDiscordSettings({
    ...previous, ...patch,
    discordRpc: patch.discordRpc ?? patch.discordEnabled ?? previous.discordRpc ?? previous.discordEnabled,
    discordRpcIdle: patch.discordRpcIdle ?? patch.showIdle ?? previous.discordRpcIdle ?? previous.showIdle,
    discordRpcShowDownloads: patch.discordRpcShowDownloads ?? patch.showDownloads ?? previous.discordRpcShowDownloads ?? previous.showDownloads,
    discordRpcPrivacyMode: patch.discordRpcPrivacyMode ?? patch.discordPrivacyMode ?? previous.discordRpcPrivacyMode ?? previous.discordPrivacyMode,
    discordActivityStyle: patch.discordActivityStyle || patch.discordRpcActivityStyle || previous.discordActivityStyle || previous.discordRpcActivityStyle,
  })
}
