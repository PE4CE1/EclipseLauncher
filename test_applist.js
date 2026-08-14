async function run() {
  console.log("Fetching v0002...");
  const res = await fetch('https://api.steampowered.com/ISteamApps/GetAppList/v0002/');
  console.log("Status:", res.status);
  if (res.ok) {
    const data = await res.json();
    console.log("Apps count:", data.applist?.apps?.length);
    console.log("Sample:", data.applist?.apps?.slice(0, 5));
  } else {
    console.log("Failed", await res.text());
  }
}
run();
