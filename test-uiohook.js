const { uIOhook, UiohookKey } = require('uiohook-napi');
uIOhook.on('keydown', (e) => {
  console.log('keydown', Object.keys(UiohookKey).find(k => UiohookKey[k] === e.keycode));
});
uIOhook.start();
setTimeout(() => { uIOhook.stop(); process.exit(0); }, 2000);
