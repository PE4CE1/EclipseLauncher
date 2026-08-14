const https = require('https');
async function run() {
  const url = `https://store.steampowered.com/api/appdetails?appids=730&l=english&cc=US`;
  const res = await fetch(url);
  const data = await res.json();
  const entry = data['730'];
  console.log("Success:", entry?.success);
  console.log("Genres:", entry?.data?.genres);
  console.log("Name:", entry?.data?.name);
}
run();
