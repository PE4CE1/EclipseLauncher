const path = require('node:path')
const { createRequire } = require('node:module')

const cli = createRequire(path.resolve(__dirname, '../.cache/firebase-security/package.json'))
const services = {
  firestore: { urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' },
  rules: { urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1' },
  auth: { urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'admin/v2' },
  authAccounts: { urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1' },
}
const privateRequest = { skipLog: { body: true, resBody: true, queryParams: true } }

function firebaseAdminClient(service, project) {
  if (!services[service]) throw Error('Unsupported Firebase admin service')
  const { Client } = cli('firebase-tools/lib/apiv2')
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST
  if (emulator) {
    const host = service === 'firestore' ? process.env.FIRESTORE_EMULATOR_HOST : service === 'authAccounts' ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined
    if (!host || !/^demo-[a-z0-9-]+$/.test(project) || !/^127\.0\.0\.1:\d+$/.test(host)) throw Error('Only local demo-project emulation is allowed')
    return new Client({ urlPrefix: `http://${host}${service === 'authAccounts' ? '/identitytoolkit.googleapis.com' : ''}`, apiVersion: 'v1', auth: false })
  }
  const auth = cli('firebase-tools/lib/auth'), account = auth.getGlobalDefaultAccount()
  if (!account) throw Error('Sign in with the local Firebase CLI first')
  auth.setActiveAccount({}, account)
  return new Client({ ...services[service], auth: true })
}

function adminRequest(options = {}) {
  return { ...privateRequest, ...options, skipLog: privateRequest.skipLog,
    ...(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST ? { headers: { Authorization: 'Bearer owner' } } : {}) }
}

module.exports = { firebaseAdminClient, adminRequest }
