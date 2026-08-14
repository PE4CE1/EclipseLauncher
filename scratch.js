const { Client } = require('discord-rpc');

const clientId = '1270390161491755018';

const rpc = new Client({ transport: 'ipc' });

rpc.on('ready', () => {
  console.log('Discord RPC ready');
  rpc.setActivity({
    details: 'Testing Discord RPC',
    state: 'It works!',
    instance: false,
  }).then(() => {
    console.log('Activity set');
    process.exit(0);
  }).catch(console.error);
});

rpc.login({ clientId }).catch(err => {
  console.error('Login failed:', err.message);
  process.exit(1);
});
