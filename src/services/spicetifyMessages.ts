import type { SpicetifyErrorCode, SpicetifyResult } from '../types/spicetify'

export function classifySpicetifyError(text: string): SpicetifyErrorCode {
  if (/should not be run with administrator|run as administrator|administrator or root/i.test(text)) return 'administrator'
  if (/preprocessed.*outdated|restore backup apply.*(?:features|fixes)/i.test(text)) return 'preprocess_outdated'
  if (/haven.t backed up|backup.*(?:mismatched|outdated)|version.*backup.*mismatch|please (?:restore first then )?backup|run ["']?spicetify backup/i.test(text)) return 'backup_required'
  if (/cannot (?:detect|find).*prefs|prefs_path.*(?:not|invalid)|prefs.*does not exist/i.test(text)) return 'prefs_missing'
  if (/cannot detect spotify|spotify.*not installed|not a valid path.*spotify|spotify installation path not found/i.test(text)) return 'spotify_missing'
  if (/(?:theme|custom app|extension).*not found|custom app.*does not have index/i.test(text)) return 'customization_missing'
  if (/access.*denied|permission denied|being used by another process|sharing violation|write access/i.test(text)) return 'permissions'
  if (/timed? out|timeout/i.test(text)) return 'timeout'
  if (/failed to (?:fetch|download)|cannot fetch|network|connection|resolve.*host|tls|certificate|http.*(?:403|429|50\d)/i.test(text)) return 'network'
  return 'failed'
}

const messages: Record<SpicetifyErrorCode, [string, string]> = {
  busy: ['Eine Spicetify-Aktion läuft bereits. Bitte kurz warten.', 'A Spicetify operation is already running. Please wait.'],
  not_installed: ['Spicetify ist nicht installiert. Installiere es zuerst.', 'Spicetify is not installed. Install it first.'],
  spotify_missing: ['Spotify wurde nicht gefunden. Installiere den Desktop-Client oder prüfe den Spotify-Pfad in Spicetify.', 'Spotify was not found. Install the desktop client or check the Spotify path in Spicetify.'],
  prefs_missing: ['Die Spotify-Einstellungen fehlen. Öffne Spotify, melde dich an und versuche es erneut.', 'Spotify preferences are missing. Open Spotify, sign in, and try again.'],
  backup_required: ['Das Spotify-Backup fehlt oder passt nicht zur aktuellen Installation. Details findest du im Protokoll.', 'The Spotify backup is missing or does not match the current installation. See the log for details.'],
  preprocess_outdated: ['Die vorbereiteten Spotify-Dateien sind veraltet. Die automatische Reparatur konnte sie nicht erneuern. Öffne das Protokoll.', 'Prepared Spotify files are outdated and automatic repair could not refresh them. Open the log.'],
  customization_missing: ['Ein konfiguriertes Theme oder eine Erweiterung fehlt. Prüfe die genannten Dateien im Protokoll.', 'A configured theme or extension is missing. Check the files listed in the log.'],
  permissions: ['Spotify-Dateien sind gesperrt oder nicht beschreibbar. Beende Spotify und versuche es erneut.', 'Spotify files are locked or not writable. Close Spotify and try again.'],
  administrator: ['Spicetify muss ohne Administratorrechte laufen. Starte Eclipse als normaler Benutzer.', 'Spicetify must run without administrator privileges. Start Eclipse as a normal user.'],
  network: ['Spicetify konnte die Update-Dateien nicht laden. Prüfe deine Verbindung und versuche es erneut.', 'Spicetify could not download the update files. Check your connection and try again.'],
  timeout: ['Die Spicetify-Aktion hat zu lange gedauert und wurde beendet. Versuche es erneut.', 'The Spicetify operation timed out and was stopped. Try again.'],
  start_failed: ['Spicetify konnte nicht gestartet werden. Prüfe die Installation und das Protokoll.', 'Spicetify could not be started. Check the installation and log.'],
  folder_missing: ['Der Spicetify-Ordner wurde nicht gefunden.', 'The Spicetify folder was not found.'],
  failed: ['Spicetify konnte die Aktion nicht abschließen. Öffne das Protokoll für die Ursache.', 'Spicetify could not finish the operation. Open the log for the cause.'],
}

export function spicetifyErrorMessage(result: SpicetifyResult | undefined, de: boolean): string {
  const code = result?.errorCode && Object.prototype.hasOwnProperty.call(messages, result.errorCode) ? result.errorCode : classifySpicetifyError(result?.error || '')
  const exitCode = result?.exitCode ?? Number(/(?:code|Code)\s+(-?\d+)/.exec(result?.error || '')?.[1])
  return messages[code][de ? 0 : 1] + (code === 'failed' && Number.isInteger(exitCode) ? ` (${de ? 'Fehlercode' : 'Exit code'} ${exitCode})` : '')
}
