// Runs the browser tests. Each test gets a fresh mock backend (server.js, port 8123),
// because the tests sign up the same pilots. The PeerJS server (peer.js, port 9000) is shared.
//   node run.js                       -> all browser tests
//   node run.js e2e-festivals gallery -> only these
const { spawn } = require('child_process');
const ALL = ['e2e-gameplay', 'e2e-phone-school', 'e2e-guest-admin-2p', 'e2e-multiplayer-3p', 'e2e-festivals', 'gallery'];
const names = process.argv.slice(2).length ? process.argv.slice(2).map(n => n.replace(/\.js$/, '')) : ALL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const start = (file) => { const p = spawn('node', [file], { cwd: __dirname, stdio: 'ignore' }); return p; };
function run(file) {
  return new Promise(res => {
    const p = spawn('node', [file], { cwd: __dirname, stdio: 'inherit' });
    p.on('exit', code => res(code));
  });
}
(async () => {
  const peer = start('peer.js');
  const failed = [];
  for (const n of names) {
    const srv = start('server.js');
    await sleep(1500);
    console.log(`\n===== ${n} =====`);
    const code = await run(n + '.js');
    if (code) failed.push(n);
    srv.kill(); await sleep(500);
  }
  peer.kill();
  console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nALL BROWSER TESTS PASSED (screenshots in tests/shots/)');
  process.exit(failed.length ? 1 : 0);
})();
