async function run() {
  console.log("Fetching GetAppList...");
  const res = await fetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
  console.log("Status:", res.status);
  if (res.ok) {
    const text = await res.text();
    console.log("Size:", text.length);
    console.log("Snippet:", text.substring(0, 100));
  } else {
    console.log("Failed", res.status, res.statusText);
  }
}
run();
