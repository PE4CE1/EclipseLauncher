const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function secureToken(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, byte => TOKEN_ALPHABET[byte & 31]).join('')
}

export function generateRecoverySecret(): string {
  return `ECL-SEC-${Array.from({ length: 4 }, () => secureToken(4)).join('-')}`
}
