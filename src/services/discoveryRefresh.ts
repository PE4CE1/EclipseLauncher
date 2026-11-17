const minute = 60_000
export function discoveryRefreshInterval(key: readonly unknown[]): number|undefined {
  if (key[0] !== 'steam') return
  if (['home-discovery','home-recommendations'].includes(String(key[1]))) return 10*minute
  if (['release-calendar','news','news-events','featured','popular','trending','newReleases','specials'].includes(String(key[1]))) return 15*minute
}

export function isDiscoveryRefreshDue(key:readonly unknown[], dataAt:number, errorAt:number, fetching:boolean, now = Date.now()): boolean {
  const interval = discoveryRefreshInterval(key)
  // A failed refresh waits for the next interval and retains the last good data.
  return !!interval && !fetching && Math.max(dataAt,errorAt)>0 && now-Math.max(dataAt,errorAt)>=interval
}
