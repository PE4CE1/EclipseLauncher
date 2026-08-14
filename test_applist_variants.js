const https = require('https');
async function run() {
  const urls = [
    'https://api.steampowered.com/ISteamApps/GetAppList/v0002/',
    'https://api.steampowered.com/ISteamApps/GetAppList/v2/',
    'http://api.steampowered.com/ISteamApps/GetAppList/v2/',
    'https://api.steampowered.com/ISteamApps/GetAppList/v1/',
    'https://api.steampowered.com/ISteamApps/GetAppList/v0001/'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      console.log(url, "=>", res.status);
    } catch (e) {
      console.log(url, "=>", e.message);
    }
  }
}
run();
