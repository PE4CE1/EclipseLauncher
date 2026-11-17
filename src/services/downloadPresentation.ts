import type { DownloadIssueCode } from '../types/downloads'

export function describeDownloadHost(raw: string): { name: string; host: string; priority: number; p2p: boolean } {
  if (raw.startsWith('magnet:')) return { name: 'BitTorrent', host: 'P2P', priority: 30, p2p: true }
  const host = new URL(raw).hostname.replace(/^www\./, '')
  const known: Array<[string, string, number]> = [['filekeeper.net', 'Filekeeper', 1], ['pixeldrain.com', 'PixelDrain', 2], ['mediafire.com', 'MediaFire', 3], ['gofile.io', 'Gofile', 4], ['buzzheavier.com', 'Buzzheavier', 5], ['datanodes.to', 'DataNodes', 6], ['vikingfile.com', 'VikingFile', 8], ['vik1ngfile.site', 'VikingFile', 8], ['akirabox.to', 'Akirabox', 9], ['akirabox.com', 'Akirabox', 9], ['1fichier.com', '1Fichier', 10]]
  const match = known.find(([domain]) => host === domain || host.endsWith('.' + domain))
  return { name: match?.[1] || host, host, priority: match?.[2] || 7, p2p: false }
}

export function releaseLabel(title: string, gameName: string): string {
  const start = title.toLowerCase().startsWith(gameName.toLowerCase()) ? title.slice(gameName.length) : title
  const label = start.replace(/^\s*(?:free\s+download|download)\s*/i, '').trim().replace(/^\[|\]$/g, '')
  return label || title
}

const issues: Record<DownloadIssueCode, [string, string]> = {
  verification: ['Needs confirmation on the host', 'Bestätigung beim Hoster erforderlich'],
  forbidden: ['Host denied the download request', 'Hoster hat die Download-Anfrage abgelehnt'],
  unavailable: ['File no longer available', 'Datei nicht mehr verfügbar'],
  network: ['Connection to host failed', 'Verbindung zum Hoster fehlgeschlagen'],
  timeout: ['Host did not respond in time', 'Hoster antwortet nicht rechtzeitig'],
  'rate-limit': ['Host is limiting requests; try later', 'Hoster begrenzt Anfragen; später versuchen'],
  'no-file': ['Host returned a page instead of a file', 'Hoster liefert eine Webseite statt einer Datei'],
  multipart: ['Split archive; another complete mirror is needed', 'Geteiltes Archiv; vollständiger Mirror benötigt'],
  storage: ['Not enough free space on the destination drive', 'Nicht genügend Speicher auf dem Ziellaufwerk'],
  permission: ['No permission to write to this folder', 'Keine Schreibberechtigung für diesen Ordner'],
  unknown: ['Download could not be started', 'Download konnte nicht gestartet werden'],
}
export function downloadIssueLabel(code: DownloadIssueCode, language: string): string { return (issues[code] || issues.unknown)[language === 'de' ? 1 : 0] }
