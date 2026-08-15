const fs = require('fs');
const path = require('path');

function search(dir, term) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist' && f !== 'dist-electron' && f !== 'release') {
        search(full, term);
      }
    } else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes(term)) {
        console.log('Match in ' + full);
        content.split('\n').forEach((l, i) => {
          if (l.includes(term)) {
            console.log(`  L${i+1}: ${l.trim()}`);
          }
        });
      }
    }
  }
}

search('src', 'onGameStarted');
search('src', 'onGameStopped');
search('src', 'games:stopped');
search('src', 'games:started');
