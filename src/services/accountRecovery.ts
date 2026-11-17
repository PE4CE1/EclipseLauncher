import { EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, updateCurrentUser, type Auth } from 'firebase/auth'
import { translate } from '../i18n/translate'
import { validRecoveryKey } from './recoveryKey'
export { validRecoveryKey, newRecoveryKey } from './recoveryKey'

const messages = {
  'invalid-key': 'uiRecoveryInvalidKey',
  'session-mismatch': 'uiRecoverySessionMismatch',
  'different-key': 'uiRecoveryDifferentKey',
  'provider-disabled': 'uiRecoveryProviderDisabled',
  'invalid-credential': 'uiRecoveryInvalidCredential',
  'rate-limited': 'uiRecoveryRateLimited',
  'persistence-failed': 'uiRecoveryPersistenceFailed',
  'rollback-failed': 'uiRecoveryRollbackFailed',
  'profile-missing': 'uiRecoveryProfileMissing',
  'profile-incomplete': 'uiRecoveryProfileIncomplete',
  unavailable: 'uiRecoveryUnavailable',
} as const
export type RecoveryIssue = keyof typeof messages

export class RecoveryFailure extends Error {
  readonly code: string
  constructor(issue: RecoveryIssue) { super(`recovery/${issue}`); this.code = this.message }
}

// Older settings contain a translated sentence rather than a stable error code.
const legacyErrors: Record<string, RecoveryIssue> = {
  'Die bestehende Anmeldung muss zuerst der gespeicherten Konto-ID zugeordnet werden. Dein lokales Profil bleibt erhalten.': 'session-mismatch',
  'Die bestehende Anmeldung gehört nicht zur gespeicherten Konto-ID. Bitte verwende die sichere Wiederherstellung oder eine geprüfte Kontomigration.': 'session-mismatch',
  'Für diese Anmeldung ist bereits ein sicherer Recovery Key eingerichtet. Ohne den passenden Schlüssel wird er nicht ersetzt.': 'different-key',
  'Für dieses Konto ist bereits ein anderer Recovery Key eingerichtet.': 'different-key',
  'Der neue Recovery Key konnte lokal nicht gespeichert werden.': 'persistence-failed',
  'Die Kontodaten konnten lokal nicht gespeichert werden.': 'persistence-failed',
  'Das wiederhergestellte Profil konnte lokal nicht gespeichert werden.': 'persistence-failed',
  'Für die Anmeldung wurde kein Profil gefunden.': 'profile-missing',
  'Das wiederhergestellte Profil ist unvollständig.': 'profile-incomplete',
  'Der Recovery Key ist ungültig oder wurde für dieses Konto noch nicht eingerichtet.': 'invalid-credential',
  'Die sichere Wiederherstellung ist im Firebase-Projekt noch nicht aktiviert (Anmeldemethode E-Mail/Passwort). Dein lokales Profil bleibt gespeichert.': 'provider-disabled',
  'Zu viele Wiederherstellungsversuche. Bitte später erneut versuchen.': 'rate-limited',
  'Bitte verwende einen neuen Recovery Key aus Eclipse 2.0. Ältere, möglicherweise veröffentlichte Schlüssel werden nicht mehr akzeptiert.': 'invalid-key',
  'Die Kontodaten konnten nicht vollständig zurückgesetzt werden. Bitte Eclipse geöffnet lassen und den lokalen Kontospeicher prüfen.': 'rollback-failed',
  'Die sichere Wiederherstellung ist gerade nicht erreichbar.': 'unavailable',
}

export function recoveryErrorCode(error: unknown): string {
  const code = String((error as { code?: string })?.code || '')
  const issue = code.replace(/^recovery\//, '')
  if (code.startsWith('recovery/') && Object.prototype.hasOwnProperty.call(messages, issue)) return code
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  if (Object.prototype.hasOwnProperty.call(legacyErrors, message)) return `recovery/${legacyErrors[message]}`
  if (code.includes('operation-not-allowed')) return 'recovery/provider-disabled'
  if (/invalid-credential|user-not-found|wrong-password|invalid-login-credentials/.test(code)) return 'recovery/invalid-credential'
  if (code.includes('too-many-requests')) return 'recovery/rate-limited'
  if (/email-already-in-use|credential-already-in-use|provider-already-linked/.test(code)) return 'recovery/different-key'
  return 'recovery/unavailable'
}

export function recoveryError(error: unknown, language = 'en'): string {
  const issue = recoveryErrorCode(error).replace('recovery/', '') as RecoveryIssue
  return translate(language, messages[issue])
}

export async function recoveryCredentials(key: string) {
  const normalized = key.trim().toUpperCase()
  if (!validRecoveryKey(normalized)) throw new RecoveryFailure('invalid-key')
  const digest = async (purpose: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${purpose}:${normalized}`)))].map(value => value.toString(16).padStart(2, '0')).join('')
  const [email, password] = await Promise.all([digest('eclipse-recovery-email-v2'), digest('eclipse-recovery-password-v2')])
  return { email: `recovery.${email.slice(0, 48)}@eclipse.invalid`, password: `${password.slice(0, 40)}aA1!` }
}

export async function protectRecovery(auth: Auth, uid: string, key: string): Promise<void> {
  const user = auth.currentUser
  if (!user || user.uid !== uid) throw new RecoveryFailure('session-mismatch')
  await user.reload()
  if (auth.currentUser?.uid !== uid) throw new RecoveryFailure('session-mismatch')
  const credential = await recoveryCredentials(key)
  if (user.providerData.some(provider => provider.providerId === 'password')) {
    if (user.email !== credential.email) throw new RecoveryFailure('different-key')
    return
  }
  await linkWithCredential(user, EmailAuthProvider.credential(credential.email, credential.password))
}

export async function authenticateRecovery(auth: Auth, key: string): Promise<{ uid: string; rollback: () => Promise<void> }> {
  const credential = await recoveryCredentials(key), previous = auth.currentUser
  const result = await signInWithEmailAndPassword(auth, credential.email, credential.password)
  return { uid: result.user.uid, rollback: () => updateCurrentUser(auth, previous) }
}

/** A local UID or friend code cannot authorize a session; only a valid credential can. */
export async function resumeSavedRecovery(auth: Auth, uid: string, key: string): Promise<void> {
  const previous = auth.currentUser
  if (previous?.uid === uid && !previous.isAnonymous) return
  if (!validRecoveryKey(key)) {
    if (previous?.uid !== uid) throw new RecoveryFailure('session-mismatch')
    return
  }
  let recovered: Awaited<ReturnType<typeof authenticateRecovery>>
  try { recovered = await authenticateRecovery(auth, key) }
  catch (error) {
    // A new anonymous owner may have saved a generated key before linking it.
    if (previous?.uid === uid && auth.currentUser?.uid === uid && recoveryErrorCode(error) === 'recovery/invalid-credential') return
    throw error
  }
  if (recovered.uid !== uid) {
    await recovered.rollback()
    throw new RecoveryFailure('session-mismatch')
  }
}
