import type { SteamGame } from '../services/steamService'

const genres: Record<string, string> = {
  'Action': 'Action', 'RPG': 'Rollenspiel', 'Adventure': 'Abenteuer', 'Open World': 'Offene Welt',
  'Dark Fantasy': 'Düstere Fantasy', 'Strategy': 'Strategie', 'Turn-Based': 'Rundenbasiert',
  'Shooter': 'Shooter', 'Co-op': 'Koop', 'Multiplayer': 'Mehrspieler', 'Singleplayer': 'Einzelspieler',
  'Superhero': 'Superhelden', 'Fantasy': 'Fantasy', 'Competitive': 'Wettbewerb', 'Hunting': 'Jagd',
  'Third-Person': 'Dritte Person', 'Mythology': 'Mythologie', 'Free to Play': 'Kostenlos spielbar',
  'Survival': 'Überleben', 'Crafting': 'Herstellung', 'Automation': 'Automatisierung', 'Building': 'Bauen',
  'First-Person': 'Ich-Perspektive', 'Sci-Fi': 'Science-Fiction', 'Medieval': 'Mittelalter',
  'Creature Collector': 'Kreaturen sammeln', 'Historical': 'Historisch', 'City Builder': 'Städtebau',
  'Horror': 'Horror', 'Atmospheric': 'Atmosphärisch', 'Fighting': 'Kampf', 'Post-apocalyptic': 'Postapokalyptisch',
}
const descriptions: Record<number, string> = {
  1091500: 'Cyberpunk 2077 ist ein Open-World-Action-Rollenspiel in der gefährlichen Metropole Night City.',
  1245620: 'Erhebe dich, Befleckter. Folge der Gnade und stelle dich den Gefahren des Zwischenlands, um die Macht des Eldenrings zu erlangen.',
  2358720: 'Black Myth: Wukong ist ein Action-Rollenspiel, das auf der chinesischen Mythologie basiert.',
  1086940: 'Versammle deine Gruppe und kehre in die Vergessenen Reiche zurück – in einer Geschichte über Gemeinschaft und Verrat.',
  1174180: 'Amerika, 1899. Arthur Morgan und die Van-der-Linde-Gang sind Gesetzlose auf der Flucht.',
  553850: 'Die letzte Verteidigungslinie der Galaxie. Schließe dich den Helldivers an und kämpfe für die Freiheit.',
  271590: 'Ein junger Straßengauner, ein ehemaliger Bankräuber und ein unberechenbarer Verbrecher geraten in Los Santos aneinander.',
  1593500: 'Seine Rache an den Göttern des Olymp liegt hinter ihm. Kratos lebt nun als Mensch im Reich der nordischen Götter.',
  1817070: 'In Marvel’s Spider-Man Remastered treffen die Welten von Peter Parker und Spider-Man aufeinander.',
  292030: 'Du bist Geralt von Riva, ein Söldner und Monsterjäger. Vor dir liegt ein vom Krieg zerrütteter Kontinent.',
}

export function localizeGameGenres(values: string[] | undefined, language: string): string[] | undefined {
  return language === 'de' ? values?.map(value => genres[value] || value) : values
}

/** Localized editorial copy is only for our fixed offline fallback. Live
 * descriptions come directly from Steam in the requested language. */
export function localizeCuratedGame(game: SteamGame, language: string): SteamGame {
  if (language !== 'de') return game
  return { ...game, genres: localizeGameGenres(game.genres, language), shortDescription: descriptions[game.steamId] || game.shortDescription }
}
