export type DownloadIssueCode = 'verification' | 'forbidden' | 'unavailable' | 'network' | 'timeout' | 'rate-limit' | 'no-file' | 'multipart' | 'storage' | 'permission' | 'unknown'
export interface DownloadIssue { host: string; code: DownloadIssueCode; url?: string; httpStatus?: number }
export interface DownloadLinkStatus { state: 'reachable' | 'unavailable' | 'verification' | 'unknown'; reason?: DownloadIssueCode }
