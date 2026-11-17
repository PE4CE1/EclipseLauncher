interface SourceRepair {
  url: string
  provider: string
}

const communityRoot = 'https://raw.githubusercontent.com/ArnamentGames/HydraLinks/refs/heads/main/'
const repairs: Readonly<Record<string, SourceRepair>> = {
  dodi: { url: communityRoot + 'dodi.json', provider: 'DODI · ArnamentGames (Community)' },
  fitgirl: {
    url: 'https://raw.githubusercontent.com/vinikjkkj/game-links-collection/refs/heads/master/jsons/fitgirl.json',
    provider: 'FitGirl · vinikjkkj (Community)',
  },
  kaoskrew: { url: 'https://hydralinks.pages.dev/sources/kaoskrew.json', provider: 'KaOsKrew · HydraLinks Pages' },
  onlinefix: { url: communityRoot + 'onlinefix.json', provider: 'OnlineFix · ArnamentGames (Community)' },
  gog: { url: 'https://hydralinks.pages.dev/sources/gog.json', provider: 'GOG · HydraLinks Pages' },
  empress: { url: 'https://hydralinks.pages.dev/sources/empress.json', provider: 'EMPRESS · HydraLinks Pages' },
  xatab: { url: communityRoot + 'xatab.json', provider: 'Xatab · ArnamentGames (Community)' },
}

// Alternatives can have different coverage. The caller must explicitly confirm and
// validate the new feed before replacing anything; never rewrite arbitrary hosts.
export function getSourceRepair(value: string): SourceRepair | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return
    const name = /^\/sources\/([a-z]+)\.json$/.exec(url.pathname)?.[1]
    if (!name || !Object.prototype.hasOwnProperty.call(repairs, name)) return
    if (url.hostname === 'hydralinks.cloud') return { ...repairs[name] }
    if (url.hostname === 'hydralinks.pages.dev' && ['kaoskrew', 'gog', 'empress'].includes(name)) {
      return { url: communityRoot + name + '.json', provider: `${name === 'kaoskrew' ? 'KaOsKrew' : name.toUpperCase()} · ArnamentGames (Community)` }
    }
  } catch {}
}
