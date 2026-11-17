const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { prepareProfileDocument, encodeValue, decodeValue } = require('../scripts/profile-migration-rest.cjs')

test('REST migration strips literal private keys while preserving public Firestore types and missing friend lists', () => {
  const date={timestampValue:'2026-11-03T20:00:00.123456789Z'}
  const result=prepareProfileDocument({name:'projects/demo-security/databases/(default)/documents/player',updateTime:'now',fields:{uid:{stringValue:'forged'},username:{stringValue:'Player'},accountSecret:{stringValue:'private'},'private.key':{stringValue:'secret'},lastSeen:date}})
  assert.equal(result.fields.accountSecret,undefined);assert.equal(result.fields['private.key'],undefined)
  assert.deepEqual(result.fields.uid,{stringValue:'player'});assert.deepEqual(result.fields.lastSeen,date)
  assert.deepEqual(result.fields.friends,{arrayValue:{values:[]}})
})

test('REST value handling preserves nested timestamps, references and binary data without numeric coercion',()=>{
  const values={mapValue:{fields:{date:{timestampValue:'2026-11-03T20:00:00.123456789Z'},ref:{referenceValue:'projects/demo/databases/(default)/documents/x/y'},bytes:{bytesValue:'AQID'},score:{integerValue:'123'},enabled:{booleanValue:true}}}}
  assert.deepEqual(encodeValue(decodeValue(values)),values)
  assert.throws(()=>encodeValue(NaN))
})

test('administrator backups are encrypted, bound to the Windows user and authenticated against tampering',{skip:process.platform!=='win32'},t=>{
  const {saveEncryptedAdminBackup,readEncryptedAdminBackup}=require('../scripts/encrypted-admin-backup.cjs')
  const original={project:'demo-security',collections:{users:[{accountSecret:'MUST-NOT-BE-PLAINTEXT'}]}}
  const file=saveEncryptedAdminBackup(original)
  t.after(()=>{assert.equal(path.dirname(file),path.resolve('.cache/firebase-security/backups'));fs.unlinkSync(file)})
  assert.deepEqual(readEncryptedAdminBackup(file),original)
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/MUST-NOT-BE-PLAINTEXT/)
  const backup=JSON.parse(fs.readFileSync(file,'utf8')),bytes=Buffer.from(backup.ciphertext,'base64');bytes[0]^=1;backup.ciphertext=bytes.toString('base64')
  fs.writeFileSync(file,JSON.stringify(backup));assert.throws(()=>readEncryptedAdminBackup(file))
})
