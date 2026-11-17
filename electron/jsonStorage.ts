import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/** Keep the last complete document intact if writing is interrupted. */
export function writeJsonAtomicSync(filePath: string, value: unknown): void {
  const data = JSON.stringify(value, null, 2)
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  try {
    fs.writeFileSync(temporaryPath, data, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(temporaryPath, filePath)
        break
      } catch (error: any) {
        // Windows virus scanners briefly hold newly written files without sharing delete access.
        if (attempt >= 3 || !['EPERM', 'EACCES', 'EBUSY'].includes(error?.code)) throw error
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1))
      }
    }
  } finally {
    try { fs.unlinkSync(temporaryPath) } catch {}
  }
}
