export type MicrophoneInput = { deviceId: string; label: string }
export type MicrophoneDevices = { inputs: MicrophoneInput[]; defaultLabel: string; error?: unknown }

export function microphoneConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    ...(deviceId && !['auto', 'default'].includes(deviceId) ? { deviceId: { exact: deviceId } } : {}),
  }
}

export async function listMicrophones(media: MediaDevices, requestAccess: boolean, signal?: AbortSignal): Promise<MicrophoneDevices> {
  let devices = await media.enumerateDevices(), error: unknown
  const inputs = () => devices.filter(device => device.kind === 'audioinput')
  // Chromium hides non-default inputs and their names until microphone access is granted.
  if (requestAccess && !signal?.aborted && (!inputs().length || inputs().every(device => ['default', 'communications'].includes(device.deviceId)) || inputs().some(device => !device.label || !device.deviceId))) {
    let stream: MediaStream | undefined
    try {
      stream = await media.getUserMedia({ audio: true, video: false })
      if (!signal?.aborted) devices = await media.enumerateDevices()
    } catch (reason) { error = reason }
    finally { stream?.getTracks().forEach(track => track.stop()) }
  }
  const seen = new Set<string>()
  return {
    defaultLabel: inputs().find(device => device.deviceId === 'default')?.label.replace(/^(?:default|standard)\s*[-–:]\s*/i, '') || '',
    inputs: inputs().filter(device => device.deviceId && device.deviceId !== 'default' && !seen.has(device.deviceId) && !!seen.add(device.deviceId))
      .map(device => ({ deviceId: device.deviceId, label: device.label })),
    error,
  }
}

export function microphoneError(reason: unknown, de: boolean): string {
  const name = reason instanceof Error || (reason && typeof reason === 'object' && 'name' in reason) ? String(reason.name) : ''
  if (name === 'QuotaExceededError') return de
    ? 'Die Mikrofonaufnahme in Eclipse ist bereits belegt. Beende den Mikrofontest und verbinde das Mikrofon erneut.'
    : 'Microphone capture in Eclipse is already in use. Stop the microphone test and reconnect.'
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) return de
    ? 'Mikrofonzugriff blockiert. Erlaube den Zugriff für Desktop-Apps in den Windows-Datenschutzeinstellungen und aktualisiere die Geräte.'
    : 'Microphone access is blocked. Allow desktop apps in Windows microphone privacy settings, then refresh devices.'
  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(name)) return de
    ? 'Das Mikrofon ist nicht verfügbar. Prüfe die Verbindung und wähle ein angeschlossenes Gerät.'
    : 'The microphone is unavailable. Check the connection and select a connected device.'
  if (['NotReadableError', 'TrackStartError'].includes(name)) return de
    ? 'Das Mikrofon konnte nicht geöffnet werden. Prüfe, ob eine andere App es exklusiv verwendet.'
    : 'The microphone could not be opened. Check whether another app is using it exclusively.'
  return de ? 'Das Mikrofon konnte nicht geladen werden. Prüfe die Verbindung und aktualisiere die Geräte.' : 'Could not load the microphone. Check its connection and refresh devices.'
}
