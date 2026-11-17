import { secureToken } from './identityTokens'

export const validRecoveryKey = (value: string) => /^ECL-SEC-(?:[A-HJ-NP-Z2-9]{8}-){3}[A-HJ-NP-Z2-9]{8}$/.test(value)
export const newRecoveryKey = () => `ECL-SEC-${Array.from({ length: 4 }, () => secureToken(8)).join('-')}`
