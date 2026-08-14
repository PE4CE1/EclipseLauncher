async function run() {
  const res = await fetch('https://steamspy.com/api.php?request=all&page=1');
  if (res.ok) {
    const data = await res.json();
    console.log("Page 1 keys count:", Object.keys(data).length);
    const keys = Object.keys(data);
    console.log("First item on page 1:", data[keys[0]].name);
  } else {
    console.log("Failed", res.status);
  }
}
run();
