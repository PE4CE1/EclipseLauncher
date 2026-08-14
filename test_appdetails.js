async function run() {
  const res = await fetch('https://store.steampowered.com/api/appdetails?appids=730,570&cc=US');
  const data = await res.json();
  console.log(Object.keys(data));
  console.log("730 name:", data['730']?.data?.name);
  console.log("570 name:", data['570']?.data?.name);
}
run();
