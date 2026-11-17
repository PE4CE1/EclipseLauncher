import type { DownloadIssue, DownloadIssueCode } from '../src/types/downloads'

export class DownloadResolverError extends Error {
  constructor(public code: DownloadIssueCode, message: string, public httpStatus?: number) { super(message) }
}
export function downloadIssue(error: unknown, sourceUrl?: string): DownloadIssue {
  let host = ''
  try { host = new URL(sourceUrl || '').hostname } catch {}
  if (error instanceof DownloadResolverError) return { host, url: sourceUrl, code: error.code, httpStatus: error.httpStatus }
  const value = error as { code?: string; name?: string; message?: string; cause?: { code?: string } }
  const code = value?.code || value?.cause?.code || '', message = value?.message || ''
  const kind: DownloadIssueCode = /ENOSPC|EDQUOT/.test(code) ? 'storage' : /EACCES|EPERM|EISDIR|ENOENT|ENOTDIR|EROFS/.test(code) ? 'permission'
    : /timeout|timed[ _]out/i.test(message) || value?.name === 'TimeoutError' ? 'timeout'
    : /webpage|web page|HTML|identify.*file/i.test(message) ? 'no-file'
    : /verification|captcha|password|premium/i.test(message) ? 'verification'
    : /HTTP.?404|HTTP.?410/.test(message) ? 'unavailable'
    : /HTTP.?429/.test(message) ? 'rate-limit'
    : /HTTP.?40[13]/.test(message) ? 'forbidden'
    : /fetch|network|SSL|TLS|connect|ECONN|ENOTFOUND|EAI_AGAIN|net::ERR_/i.test(message + code) ? 'network' : 'unknown'
  return { host, url: sourceUrl, code: kind }
}
