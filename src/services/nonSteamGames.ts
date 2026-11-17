// Public publisher artwork and exact executable identities; no Steam ID is invented.
export interface NonSteamGame {
  id: string
  name: string
  aliases: readonly string[]
  processes: readonly string[]
  bootstrap?: readonly string[]
  publisher: string
  storeUrl: string
  poster: string
  hero: string
  description: { en: string; de: string }
}

const riotArt = 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/'
export const NON_STEAM_GAMES: readonly NonSteamGame[] = [
  {
    id: 'fortnite', name: 'Fortnite', aliases: ['fortnite battle royale'],
    processes: ['fortniteclient-win64-shipping.exe'],
    bootstrap: ['fortnitebootstrapper.exe', 'fortnitelauncher.exe', 'fortniteclient-win64-shipping_eac.exe', 'fortniteclient-win64-shipping_eac_eos.exe', 'fortniteclient-win64-shipping_be.exe'],
    publisher: 'Epic Games', storeUrl: 'https://store.epicgames.com/p/fortnite',
    poster: 'https://cdn2.unrealengine.com/fnbr-42-00-c7s4-hacking-egs-launcher-blade-1200x1600-1200x1600-0138e7df7bb0.jpg',
    hero: 'https://cdn2.unrealengine.com/fnbr-42-00-c7s4-hacking-logo-egs-launcher-blade-2560x1440-2560x1440-00f5395fc1e7.jpg',
    description: { en: 'Battle Royale, Zero Build and worlds made by the community. Everything you love, all in Fortnite.', de: 'Battle Royale, Null Bauen und Welten aus der Community. Alles, was du liebst, in Fortnite.' },
  },
  {
    id: 'valorant', name: 'VALORANT', aliases: [],
    processes: ['valorant-win64-shipping.exe'], bootstrap: ['valorant.exe'],
    publisher: 'Riot Games', storeUrl: 'https://playvalorant.com/',
    poster: `${riotArt}1d62a3751be9d7abfce84da8ca89be7d79f07fed-1232x1232.png?w=600&h=900&fit=crop&fm=webp`,
    hero: 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/9167b57d3c081d04e75abe28387d87a27bb83953-3440x1020.jpg?w=1600&fm=webp',
    description: { en: 'A 5v5 tactical shooter from Riot Games. Combine precise gunplay with the unique abilities of your agent.', de: 'Ein taktischer 5-gegen-5-Shooter von Riot Games. Kombiniere präzises Gunplay mit den besonderen Fähigkeiten deines Agenten.' },
  },
  {
    id: 'league-of-legends', name: 'League of Legends', aliases: ['league of legends (tm) client'],
    processes: ['league of legends.exe'],
    publisher: 'Riot Games', storeUrl: 'https://www.leagueoflegends.com/',
    poster: `${riotArt}565197caf987af4e4da307df6e2b235a28714736-837x469.jpg?w=600&h=900&fit=crop&fm=webp`,
    hero: `${riotArt}565197caf987af4e4da307df6e2b235a28714736-837x469.jpg?w=1200&fm=webp`,
    description: { en: 'Team up with friends in a competitive strategy game from Riot Games.', de: 'Spiele mit deinen Freunden im kompetitiven Strategiespiel von Riot Games.' },
  },
]

const nameKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[™®]/g, '').trim()
export function getNonSteamGame(name?: string | null): NonSteamGame | undefined {
  const key = name ? nameKey(name) : ''
  return key ? NON_STEAM_GAMES.find(game => game.id === key || nameKey(game.name) === key || game.aliases.some(alias => nameKey(alias) === key)) : undefined
}

export function nonSteamProcess(executable: string): { game: NonSteamGame; bootstrap: boolean } | undefined {
  const exe = executable.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || ''
  for (const game of NON_STEAM_GAMES) {
    if (game.processes.includes(exe)) return { game, bootstrap: false }
    if (game.bootstrap?.includes(exe)) return { game, bootstrap: true }
  }
  return undefined
}

export function repairNonSteamIdentity<T extends { name: string; steamId?: number; iconUrl?: string }>(game: T): T {
  const known = getNonSteamGame(game.name)
  return known ? { ...game, name: known.name, steamId: undefined, iconUrl: known.hero } : game
}
