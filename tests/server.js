const http = require('http'), fs = require('fs'), path = require('path');
const { makeEnv } = require('./mockgas');
const { ctx, sheets } = makeEnv();
ctx.setup();
sheets.Settings.data.forEach(r => { if (r[0] === 'GoogleClientId') r[1] = 'cid'; if (r[0] === 'TeacherPassword') r[1] = 'pw123'; });
const ROOT = path.join(__dirname, '..');
const FAIL = process.env.FAIL_SUBMIT === '1';
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(o.content); };
    if (req.method === 'GET') return send(ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }));
    let body = ''; req.on('data', d => body += d); req.on('end', () => {
      if (global.failSubmit && body.includes('submitScore')) { res.writeHead(500); return res.end(); }
      send(ctx.doPost({ postData: { contents: body } }));
    });
    return;
  }
  if (u.pathname === '/__admin') { sheets.Admins.data.push([u.searchParams.get('email'), 'YES', '']); res.end('ok'); return; }
  if (u.pathname === '/__gift') { sheets.CoinGifts.data.push([u.searchParams.get('who'), Number(u.searchParams.get('n')), '']); res.end('ok'); return; }
  if (u.pathname === '/__scores') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(sheets.Scores.data)); return; }
  if (u.pathname === '/__fail') { global.failSubmit = u.searchParams.get('on') === '1'; res.end('ok'); return; }
  let p = u.pathname.startsWith('/__t/') ? path.join(__dirname, u.pathname.slice(5)) : path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  let data = fs.readFileSync(p);
  if (p.endsWith('config.js')) data = data.toString().replace(/APPS_SCRIPT_URL: "[^"]*"/, 'APPS_SCRIPT_URL: "http://localhost:8123/api"').replace('PEER_SERVER: null', 'PEER_SERVER: { host: "127.0.0.1", port: 9000, path: "/peer", secure: false }');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  res.end(data);
}).listen(8123, () => console.log('mock on 8123'));
