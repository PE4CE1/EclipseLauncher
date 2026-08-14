const fs = require('fs');
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('Fetching all games from SteamSpy (up to 75 pages)...');
  const allGames = [];
  
  for (let i = 0; i < 75; i++) {
    console.log(`Fetching page ${i}...`);
    try {
      const data = await fetchJson(`https://steamspy.com/api.php?request=all&page=${i}`);
      for (const key of Object.keys(data)) {
        const game = data[key];
        if (game.name) {
          allGames.push({
            id: game.appid,
            name: game.name,
            developer: game.developer,
            publisher: game.publisher,
            positive: game.positive,
            negative: game.negative,
            price: game.price,
            initialprice: game.initialprice,
            discount: game.discount,
            ccu: game.ccu
          });
        }
      }
    } catch (e) {
      console.error(`Error on page ${i}:`, e);
    }
    await delay(1000); // Respect rate limits
  }

  // Sort by popularity (positive reviews roughly corresponds to popularity)
  allGames.sort((a, b) => b.positive - a.positive);

  fs.writeFileSync('public/games_db.json', JSON.stringify(allGames));
  console.log(`Saved ${allGames.length} games to public/games_db.json`);
}

main().catch(console.error);
