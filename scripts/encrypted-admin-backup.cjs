const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

function dpapi(operation, data) {
  if (!['Protect', 'Unprotect'].includes(operation) || process.platform !== 'win32') throw Error('Windows user-bound backup encryption is required')
  const command = `Add-Type -AssemblyName System.Security; $eclipseBackupBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $eclipseBackupResult=[Security.Cryptography.ProtectedData]::${operation}($eclipseBackupBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($eclipseBackupResult))`
  return Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{input:data.toString('base64'),encoding:'utf8',windowsHide:true,maxBuffer:1024*1024}).trim(),'base64')
}

function saveEncryptedAdminBackup(value) {
  const data = Buffer.from(JSON.stringify(value)), key = crypto.randomBytes(32), iv = crypto.randomBytes(12)
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm',key,iv), ciphertext = Buffer.concat([cipher.update(data),cipher.final()])
    const backup = { version: 1, algorithm:'aes-256-gcm', keyProtection:'DPAPI.CurrentUser', wrappedKey:dpapi('Protect',key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64') }
    const directory = path.resolve(__dirname,'../.cache/firebase-security/backups')
    fs.mkdirSync(directory,{recursive:true})
    const file = path.join(directory,`${Date.now()}-${crypto.randomUUID()}.encrypted.json`)
    fs.writeFileSync(file,JSON.stringify(backup),{flag:'wx',mode:0o600})
    const restored = readEncryptedAdminBackup(file)
    if (JSON.stringify(restored) !== data.toString()) throw Error('Encrypted backup verification failed; migration aborted')
    return file
  } finally { key.fill(0); data.fill(0) }
}

function readEncryptedAdminBackup(file) {
  const backup = JSON.parse(fs.readFileSync(file,'utf8'))
  if (backup.version !== 1 || backup.algorithm !== 'aes-256-gcm' || backup.keyProtection !== 'DPAPI.CurrentUser') throw Error('Unsupported admin backup')
  const key = dpapi('Unprotect',Buffer.from(backup.wrappedKey,'base64'))
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(backup.iv,'base64'))
    decipher.setAuthTag(Buffer.from(backup.tag,'base64'))
    const plain = Buffer.concat([decipher.update(Buffer.from(backup.ciphertext,'base64')),decipher.final()])
    try { return JSON.parse(plain.toString()) } finally { plain.fill(0) }
  } finally { key.fill(0) }
}

module.exports = { saveEncryptedAdminBackup, readEncryptedAdminBackup }
