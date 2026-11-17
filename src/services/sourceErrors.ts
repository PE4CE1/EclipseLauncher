export function isSourceTlsError(message: string): boolean {
  return /ERR_SSL_|ERR_CERT_|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|\bEPROTO\b/i.test(message)
}

export function sourceErrorMessage(message: string, language: string): string {
  if (isSourceTlsError(message)) return language === 'de'
    ? 'Die sichere HTTPS-Verbindung zur Quelle ist fehlgeschlagen. Versuche es später erneut oder verwende eine aktuelle Adresse des Quellenanbieters.'
    : 'The secure HTTPS connection to this source failed. Try again later or use a current address from the source provider.'
  return message
}
