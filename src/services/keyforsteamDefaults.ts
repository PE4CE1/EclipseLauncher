/** Enable the integration once for existing installs; later opt-outs remain intact. */
export function withKeyforsteamDefaults<T extends object>(settings: T): T & { keyforsteamEnabled: boolean; keyforsteamDefaultsVersion: number } {
  const saved = settings as { keyforsteamEnabled?: boolean; keyforsteamDefaultsVersion?: number }
  const migrated = saved.keyforsteamDefaultsVersion === 1
  if (migrated && typeof saved.keyforsteamEnabled === 'boolean') return settings as T & { keyforsteamEnabled: boolean; keyforsteamDefaultsVersion: number }
  return { ...settings, keyforsteamEnabled: true, keyforsteamDefaultsVersion: 1 }
}
