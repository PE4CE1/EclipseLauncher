const fs = require('fs');

async function fetchPage(page) {
  const url = `https://steamspy.com/api.php?request=all&page=${page}`;
  console.log('Fetching', url);
  const res = await fetch(url);
  return res.json();
}

async function main() {
  const data = await fetchPage(0);
  fs.writeFileSync('test_db.json', JSON.stringify(data, null, 2));
  console.log('Keys:', Object.keys(data).length);
}
main().catch(console.error);
