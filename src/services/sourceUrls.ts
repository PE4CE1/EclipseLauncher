export function normalizeSourceUrl(value: string): string {
  const input = value.trim()
  if (!input || input.length > 4096) throw new Error('Enter a valid source URL.')
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Source URLs must use HTTP(S) without embedded credentials.')
  if (['github.com', 'www.github.com'].includes(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length > 3 && ['blob', 'raw'].includes(parts[2])) {
      url.hostname = 'raw.githubusercontent.com'
      url.pathname = '/' + [parts[0], parts[1], ...parts.slice(3)].join('/')
      url.search = ''
    }
  }
  url.hash = ''
  return url.toString()
}

export function sourceKey(value: string): string { return value.startsWith('local://') ? value.trim() : normalizeSourceUrl(value) }

export function parseSourceUrls(input: string): string[] {
  const values = input.trim().split(/\s+/).filter(Boolean)
  if (!values.length || values.length > 100) throw new Error('Add between 1 and 100 source URLs, one per line.')
  return [...new Set(values.map(normalizeSourceUrl))]
}
