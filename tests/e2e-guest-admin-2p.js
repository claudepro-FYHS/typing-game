const { chromium, LAUNCH } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const BASE = 'http://localhost:8123/';
async function autoType(page, seconds, opts = {}) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const info = await page.evaluate((pref) => {
      const G = window.__MST.G; if (!G.running || G.over) return { over: true };
      if (G.phase !== 'wave' && G.phase !== 'boss') return { wait: true };
      if (!G.me.alive) return { wait: true };
      let t = G.lock;
      if (!t) {
        const c = G.targets.filter(x => x.alive && !x.pending && !(x.kind === 'boss' && G.boss && G.boss.enter < 1));
        if (!c.length) return { wait: true };
        const score = x => (x.kind === 'boss' ? .2 : x.progress) + (pref === 'mine' && x.victim === G.myPid ? 1 : 0);
        t = c.reduce((a, b) => score(b) > score(a) ? b : a);
      }
      return { rest: t.word.slice(t.typed) };
    }, opts.pref || '');
    if (info.over) return 'over';
    if (opts.until && await page.evaluate(opts.until)) return 'until';
    if (info.wait) { await sleep(150); continue; }
    if (opts.mistake && Math.random() < 0.1) await page.keyboard.type('q');
    await page.keyboard.type(info.rest[0]);
    await sleep(opts.delay || 70);
  }
  return 'time';
}
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error' && !/CERT|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
}
async function login(page, email) {
  await page.goto(BASE); await sleep(1200);
  await page.evaluate((e) => window.__MST.onGoogleCredential({ credential: 'fake:' + e }), email);
  await sleep(800);
}
async function register(page, cls, seat, name, nick) {
  await page.selectOption('#pf-class', cls); await page.fill('#pf-seat', seat); await page.fill('#pf-name', name); await page.fill('#pf-nick', nick);
  await page.click('#btn-profile-save'); await sleep(900);
}
(async () => {
  const browser = await chromium.launch(LAUNCH);
  // ---------- A: solo guest ----------
  const pa = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(pa, 'A');
  await pa.goto(BASE); await sleep(1200);
  await pa.click('#btn-guest'); await sleep(800);
  await pa.screenshot({ path: OUT + 'n-a1-hangar.png' });
  await pa.click('#diff-seg [data-d="Easy"]');
  await pa.click('#btn-launch'); await sleep(4000);
  await autoType(pa, 8);
  await pa.screenshot({ path: OUT + 'n-a2-solo.png' });
  const r1 = await autoType(pa, 80, { until: () => { const G = window.__MST.G; return G.phase === 'boss' && G.boss && G.boss.enter >= 1 && G.targets.some(t => t.kind === 'missile'); } });
  await pa.screenshot({ path: OUT + 'n-a3-boss.png' });
  console.log('A boss reached:', r1, await pa.evaluate(() => ({ stage: __MST.G.stage, boss: __MST.G.boss && __MST.G.boss.name, kills: __MST.G.myKills })));
  await autoType(pa, 40, { until: () => __MST.G.phase === 'clear' });
  await pa.keyboard.press('Escape'); await sleep(200); await pa.click('#btn-end'); await sleep(900);
  console.log('A result:', (await pa.textContent('#res-stats')).replace(/\s+/g, ' '));
  // ---------- B: admin ----------
  await fetch('http://localhost:8123/__admin?email=boss@foonyew.edu.my');
  const pb = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(pb, 'B');
  await login(pb, 'boss@foonyew.edu.my');
  const opts = await pb.$$eval('#pf-class option', o => o.map(x => x.value));
  console.log('B admin class options include STAFF:', opts.includes('STAFF'));
  await register(pb, 'STAFF', '1', 'Cikgu Lim', 'Sensei');
  console.log('B chip:', (await pb.textContent('#userchip')).replace(/\s+/g, ' '));
  await pb.click('.mech-card[data-id="liberty"] [data-use], .mech-card[data-id="liberty"]'); await sleep(300);
  console.log('B liberty owned/use button:', await pb.$('.mech-card[data-id="liberty"] [data-use]') !== null || (await pb.textContent('.mech-card[data-id="liberty"]')).includes('IN USE'));
  // ---------- C: multiplayer (2 students) ----------
  await fetch('http://localhost:8123/__gift?who=2B&n=400');
  const ph = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(ph, 'HOST');
  const pg = await (await browser.newContext({ viewport: { width: 1000, height: 760 } })).newPage(); watch(pg, 'GUEST');
  await login(ph, 'amy@foonyew.edu.my'); await register(ph, '2B', '3', 'Amy Tan', 'AmyAce');
  console.log('HOST chip after gift:', (await ph.textContent('#userchip')).replace(/\s+/g, ' '));
  await login(pg, 'ben@foonyew.edu.my'); await register(pg, '2A', '7', 'Ben Lee', 'BenBolt');
  // ben buys + uses another mech? keep starter. Amy buys aile with gift coins
  await ph.click('.mech-card[data-id="aile"] [data-buy]'); await sleep(900);
  await ph.click('#btn-multi'); await sleep(500);
  await ph.click('#btn-mp-create'); await sleep(2500);
  const code = (await ph.textContent('#mp-room-code')).trim();
  console.log('room code:', code, '| host msg:', await ph.textContent('#mp-msg'));
  await pg.click('#btn-multi'); await sleep(400);
  await pg.fill('#mp-code', code); await pg.click('#btn-mp-join'); await sleep(4000);
  await ph.screenshot({ path: OUT + 'n-c1-lobby-host.png' });
  console.log('guest lobby:', (await pg.textContent('#mp-players')).replace(/\s+/g, ' '), '|', await pg.textContent('#mp-msg'));
  await ph.click('#btn-mp-start'); await sleep(4500);
  await Promise.all([autoType(ph, 40, { pref: 'mine', delay: 90 }), autoType(pg, 40, { delay: 80 })]);
  await ph.screenshot({ path: OUT + 'n-c2-host-game.png' });
  await pg.screenshot({ path: OUT + 'n-c3-guest-game.png' });
  const st = await Promise.all([ph, pg].map(p => p.evaluate(() => ({ role: __MST.G.role, players: __MST.G.players.map(x => [x.nick, x.score, x.hp, x.kills]), targets: __MST.G.targets.length, phase: __MST.G.phase, stage: __MST.G.stage }))));
  console.log('state host:', JSON.stringify(st[0]), '\nstate guest:', JSON.stringify(st[1]));
  await ph.keyboard.press('Escape'); await sleep(200); await ph.click('#btn-end'); await sleep(3500);
  await ph.screenshot({ path: OUT + 'n-c4-host-result.png' }); await pg.screenshot({ path: OUT + 'n-c5-guest-result.png' });
  console.log('host result:', (await ph.textContent('#res-title')), '|', (await ph.textContent('#res-ranking')).replace(/\s+/g, ' '));
  console.log('guest result:', (await pg.textContent('#res-title')), '|', await pg.textContent('#res-upload'));
  await sleep(2000);
  const rows = await (await fetch('http://localhost:8123/__scores')).json();
  console.log('score rows:', rows.slice(1).map(r => [r[4], r[6], r[8], r[15]].join('/')).join(' ; '));
  // invite link join flow
  console.log('ERRORS:', errors.length ? errors.slice(0, 15) : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); console.log('ERRORS:', errors.slice(0, 15)); if (errors.length) process.exitCode = 1; process.exit(1); });
