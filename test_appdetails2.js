async function run() {
  const ids = [730, 570];
  console.log("Fetching 2 ids:", ids.join(','));
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&filters=basic`);
  console.log("Status:", res.status);
  
  const ids2 = [730];
  console.log("Fetching 1 id:", ids2.join(','));
  const res2 = await fetch(`https://store.steampowered.com/api/appdetails?appids=${ids2.join(',')}&filters=basic`);
  console.log("Status2:", res2.status);
}
run();
