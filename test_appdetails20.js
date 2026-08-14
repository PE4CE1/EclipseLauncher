async function run() {
  const ids = [730, 570, 440, 4000, 10, 20, 30, 40, 50, 60, 70, 80, 130, 220, 240, 320, 340, 380, 420, 1086940];
  console.log("Fetching valid ids:", ids.join(','));
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&filters=basic`);
  console.log("Status:", res.status);
  if (res.ok) {
    const data = await res.json();
    console.log("Keys returned:", Object.keys(data).length);
  } else {
    console.log("Failed", await res.text());
  }
}
run();
