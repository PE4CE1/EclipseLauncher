const { GlobalKeyboardListener } = require('node-global-key-listener');
const v = new GlobalKeyboardListener();
v.addListener((e) => { console.log(e.name, e.state) });
setTimeout(() => process.exit(0), 2000);
