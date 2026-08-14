const https = require('https');
https.get('https://steamcommunity.com/id/Haarglatzfall/', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const match = data.match(/<link rel="image_src" href="([^"]+)">/i);
    console.log("Avatar:", match ? match[1] : "Not found");
  });
});
