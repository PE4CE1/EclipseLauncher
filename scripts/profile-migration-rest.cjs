const { firebaseAdminClient, adminRequest } = require('./firebase-admin-rest.cjs')
const { planProfileMigration, publicProfileFields } = require('./migrate-profile-security.cjs')
const { saveEncryptedAdminBackup } = require('./encrypted-admin-backup.cjs')
class FirestoreScalar { constructor(value) { this.value = value } }

function decodeValue(value) {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('stringValue' in value) return value.stringValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key,item])=>[key,decodeValue(item)]))
  return new FirestoreScalar(value)
}

function encodeValue(value) {
  if (value instanceof FirestoreScalar) return value.value
  if (value === null) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Invalid numeric profile field')
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encodeValue(item)])) } }
  throw Error('Invalid profile field')
}

async function readMigrationDocuments(client, project) {
  const result = {}
  for (const collection of ['users','device_identities']) {
    const documents = []; let pageToken
    do {
      const response = await client.get(`projects/${project}/databases/(default)/documents/${collection}`,adminRequest({queryParams:{pageSize:200,...(pageToken?{pageToken}:{})}}))
      documents.push(...(response.body.documents || []))
      pageToken = response.body.nextPageToken
    } while (pageToken)
    result[collection] = documents
  }
  return result
}

function prepareProfileDocument(document) {
  const data = Object.fromEntries(Object.entries(document.fields || {}).map(([key,value])=>[key,decodeValue(value)]))
  const uid = document.name.split('/').at(-1), plan = planProfileMigration(data,uid)
  const fields = Object.fromEntries(Object.entries(document.fields || {}).filter(([key])=>publicProfileFields.includes(key)))
  for (const [key,value] of Object.entries(plan.fields)) fields[key] = encodeValue(value)
  return { name: document.name, fields, removed: plan.removed, updateTime: document.updateTime }
}

async function migrateWithFirebaseCli(project, apply = false) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(project)) throw Error('An explicit valid project ID is required')
  const client = firebaseAdminClient('firestore',project), documents = await readMigrationDocuments(client,project)
  // Validate every planned change before taking a backup or performing any write.
  const profiles = documents.users.map(prepareProfileDocument)
  const result = { project, mode: apply ? 'APPLY' : 'DRY RUN', profiles:profiles.length, privateFields:profiles.reduce((sum,profile)=>sum+profile.removed.length,0), deviceDocuments:documents.device_identities.length, conflicts:0 }
  if (!apply) return result
  result.backup = saveEncryptedAdminBackup({ project,createdAt:new Date().toISOString(),collections:documents })
  const writes = [...profiles.map(document=>({ update:{name:document.name,fields:document.fields},currentDocument:{updateTime:document.updateTime} })),
    ...documents.device_identities.map(document=>({delete:document.name,currentDocument:{updateTime:document.updateTime}}))]
  for (const document of [...profiles,...documents.device_identities]) {
    if (!document.name.startsWith(`projects/${project}/databases/(default)/documents/`) || !document.updateTime) throw Error('Unexpected migration document')
  }
  const batches = []; let batch = [], bytes = 0
  for (const write of writes) {
    const size = Buffer.byteLength(JSON.stringify(write))
    if (size > 8 * 1024 * 1024) throw Error('Migration document exceeds the batch limit')
    if (batch.length && (batch.length >= 100 || bytes + size > 8 * 1024 * 1024)) { batches.push(batch); batch = []; bytes = 0 }
    batch.push(write); bytes += size
  }
  if (batch.length) batches.push(batch)
  for (const entries of batches) {
    const response = await client.post(`projects/${project}/databases/(default)/documents:commit`,{writes:entries},adminRequest({resolveOnHTTPError:true}))
    if (response.status >= 400) {
      if (response.body?.error?.status === 'FAILED_PRECONDITION' || response.status === 409) result.conflicts += entries.length
      else throw Error(`Migration request failed with HTTP ${response.status}; encrypted backup retained`)
    }
  }
  return result
}

module.exports = { decodeValue, encodeValue, prepareProfileDocument, readMigrationDocuments, migrateWithFirebaseCli }
