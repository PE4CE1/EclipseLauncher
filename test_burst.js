async function run() {
  const ids = [730, 570, 440, 1086940, 1145360, 1245620, 1091500, 814380, 739630, 1517290, 2379780, 2420510, 1716740, 1426210, 1888160, 1840454, 1850570, 2413570, 1922900, 2050650];
  
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const promises = batch.map(async id => {
      const url = `https://store.steampowered.com/api/appdetails?appids=${id}&l=english&cc=US`;
      const res = await fetch(url);
      if (!res.ok) return `${id}: ${res.status}`;
      const data = await res.json();
      return `${id}: success=${data[id]?.success}`;
    });
    
    const results = await Promise.all(promises);
    console.log("Batch result:", results);
    
    if (i + 5 < ids.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}
run();
