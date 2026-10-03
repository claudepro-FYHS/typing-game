const { chromium, LAUNCH } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:8123/';
const errors = [];
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error' && !/CERT|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
}
async function autoType(page, seconds, delay) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const info = await page.evaluate(() => {
      const G = __MST.G; if (!G.running || G.over) return { over: true };
      if ((G.phase !== 'wave' && G.phase !== 'boss') || !G.me.alive) return { wait: true };
      let t = G.lock;
      if (!t) { const c = G.targets.filter(x => x.alive && !x.pending && !(x.kind === 'boss' && G.boss && G.boss.enter < 1)); if (!c.length) return { wait: true }; t = c[Math.floor(Math.random() * c.length)]; }
      return { rest: t.word.slice(t.typed) };
    });
    if (info.over) return 'over';
    if (info.wait) { await sleep(150); continue; }
    await page.keyboard.type(info.rest[0]); await sleep(delay);
  }
  return 'time';
}
async function mk(email, cls, seat, name, nick, hash) {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 640 } })).newPage(); watch(page, nick);
  await page.goto(BASE + (hash || '')); await sleep(1200);
  await page.evaluate((e) => __MST.onGoogleCredential({ credential: 'fake:' + e }), email); await sleep(900);
  await page.selectOption('#pf-class', cls); await page.fill('#pf-seat', seat); await page.fill('#pf-name', name); await page.fill('#pf-nick', nick);
  await page.click('#btn-profile-save'); await sleep(1500);
  return page;
}
let browser;
(async () => {
  browser = await chromium.launch(LAUNCH);
  const h = await mk('cara@foonyew.edu.my', '1A', '1', 'Cara', 'CaraX');
  await h.click('#btn-multi'); await sleep(300); await h.selectOption('#mp-stages', '5'); await h.click('#btn-mp-create'); await sleep(2500);
  const code = (await h.textContent('#mp-room-code')).trim();
  // guest 1 joins with invite link before signing in -> should auto join after sign in
  const g1 = await mk('dan@foonyew.edu.my', '1A', '2', 'Dan', 'DanDash', '#join=' + code);
  await sleep(4000);
  console.log('g1 screen after invite link:', await g1.evaluate(() => __MST.S.currentScreen), '| lobby:', (await g1.textContent('#mp-players')).replace(/\s+/g, ' '));
  const g2 = await mk('eve@foonyew.edu.my', '1B', '3', 'Eve', 'EveStar');
  await g2.click('#btn-multi'); await sleep(300); await g2.fill('#mp-code', 'ZZZZZ'); await g2.click('#btn-mp-join'); await sleep(6000);
  console.log('bad code msg:', await g2.textContent('#mp-msg'));
  await g2.fill('#mp-code', code.toLowerCase()); await g2.click('#btn-mp-join'); await sleep(4000);
  console.log('host lobby:', (await h.textContent('#mp-players')).replace(/\s+/g, ' '));
  await h.click('#btn-mp-start'); await sleep(4000);
  // play; eve leaves after 25 s
  const p1 = autoType(h, 80, 110), p2 = autoType(g1, 80, 100);
  await autoType(g2, 25, 120);
  await g2.keyboard.press('Escape'); await sleep(200); await g2.click('#btn-end'); await sleep(1500);
  console.log('eve left ->', await g2.textContent('#res-title'));
  await h.screenshot({ path: OUT + 'mp3-host.png' });
  await Promise.all([p1, p2]);
  await h.screenshot({ path: OUT + 'mp3-host-late.png' });
  const st = await h.evaluate(() => ({ stage: __MST.G.stage, phase: __MST.G.phase, players: __MST.G.players.map(p => [p.nick, p.score, p.kills, p.alive, p.left, p.wpm]) }));
  console.log('host state:', JSON.stringify(st));
  const assigned = await h.evaluate(() => __MST.G.players.map(p => [p.nick, p.assigned]));
  console.log('targets assigned per player (balance):', JSON.stringify(assigned));
  await h.keyboard.press('Escape'); await sleep(200); await h.click('#btn-end'); await sleep(4000);
  console.log('host:', await h.textContent('#res-title'), '|', await h.textContent('#res-upload'));
  console.log('dan:', await g1.textContent('#res-title'), '|', await g1.textContent('#res-upload'));
  await g1.screenshot({ path: OUT + 'mp3-dan-result.png' });
  await sleep(2500);
  const rows = await (await fetch('http://localhost:8123/__scores')).json();
  console.log('score rows:', rows.slice(1).map(r => [r[4], r[8], r[15]].join('/')).join(' ; '));
  console.log('ERRORS:', errors.length ? errors.slice(0, 15) : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error('CRASH', e); console.log(errors); process.exit(1); });
