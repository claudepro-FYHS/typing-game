const { chromium, LAUNCH } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:8123/';
const errors = [];
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error' && !/CERT|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
}
async function autoType(page, seconds, opts = {}) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const info = await page.evaluate(() => {
      const G = __MST.G; if (!G.running || G.over) return { over: true };
      if ((G.phase !== 'wave' && G.phase !== 'boss') || !G.me.alive) return { wait: true };
      let t = G.lock;
      if (!t) { const c = G.targets.filter(x => x.alive && !x.pending && !(x.kind === 'boss' && G.boss && G.boss.enter < 1)); if (!c.length) return { wait: true }; t = c.reduce((a, b) => ((b.kind === 'boss' ? .2 : b.progress) > (a.kind === 'boss' ? .2 : a.progress) ? b : a)); }
      return { rest: t.word.slice(t.typed) };
    });
    if (info.over) return 'over';
    if (opts.until && await page.evaluate(opts.until)) return 'until';
    if (info.wait) { await sleep(120); continue; }
    if (opts.mistake && Math.random() < opts.mistake) await page.keyboard.type('q');
    await page.keyboard.type(info.rest[0]); await sleep(opts.delay || 60);
  }
  return 'time';
}
(async () => {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // pretend it is Mid-Autumn (25 Sep 2026, 10:00 Malaysia time) so the festival bank and boss appear
  await ctx.addInitScript(`{ const off = ${Date.parse('2026-09-25T02:00:00Z')} - Date.now(); const N = Date.now; Date.now = () => N() + off; }`);
  const page = await ctx.newPage(); watch(page, 'G');
  await page.addInitScript(() => {
    if (!localStorage.getItem('mst_seeded')) {
      localStorage.setItem('mst_seeded', '1');
      localStorage.setItem('mst_guest', JSON.stringify({ coins: 5000, owned: ['starter', 'seraph'], selected: 'seraph', xp: 5600 }));
      localStorage.setItem('mst_revenge_guest', JSON.stringify({ apple: 2, river: 1, because: 3, friend: 1, garden: 1, window: 2 }));
    }
  });
  await page.goto(BASE); await sleep(1500);
  await page.screenshot({ path: OUT + 'v-login.png' });
  await page.click('#btn-guest'); await sleep(1200);
  await page.screenshot({ path: OUT + 'v-hangar.png' });
  console.log('pilot:', (await page.textContent('#pilot-card')).replace(/\s+/g, ' '));
  console.log('banks:', await page.$$eval('#bank-select option', o => o.map(x => x.textContent).slice(0, 3)));
  console.log('bg options:', await page.$$eval('#bg-select option', o => o.map(x => x.textContent + (x.disabled ? '(x)' : ''))));
  await page.click('#shop-seg [data-tab="paint"]'); await sleep(300);
  await page.click('[data-skin-buy="gold"]'); await sleep(1200);
  await page.screenshot({ path: OUT + 'v-paint-gold.png' });
  await page.selectOption('#bg-select', 'asteroid'); await sleep(800);
  await page.screenshot({ path: OUT + 'v-hangar-asteroid.png' });
  await page.click('#btn-badges'); await sleep(400);
  await page.screenshot({ path: OUT + 'v-badges.png' }); await page.click('#btn-modal-close');
  await page.selectOption('#bank-select', 'event_midautumn');
  await page.click('#diff-seg [data-d="Easy"]');
  await page.click('#btn-launch'); await sleep(3000);
  const intro = await page.textContent('#hud-msg'); console.log('intro:', intro);
  await autoType(page, 14);
  await page.screenshot({ path: OUT + 'v-game-combo.png' });
  const st1 = await page.evaluate(() => ({ combo: __MST.G.combo, tier: __MST.G.comboTier, elites: __MST.G.targets.filter(t => t.elite).map(t => t.word), revKills: __MST.G.revengeKills, env: envId }));
  console.log('state:', JSON.stringify(st1));
  // jump to boss
  await page.evaluate(() => { const G = __MST.G; G.stageKills = 99; for (const t of G.targets.slice()) if (t.kind === 'enemy') t.progress = 2; G.me.hp = 5; G.me.shield = true; });
  await sleep(7000);
  await page.screenshot({ path: OUT + 'v-event-boss.png' });
  console.log('boss:', await page.evaluate(() => __MST.G.boss && __MST.G.boss.name));
  await page.evaluate(() => { __MST.G.boss.hp = 1; });
  const r = await autoType(page, 20, { until: () => __MST.G.slowmo > 0 });
  await sleep(400);
  await page.screenshot({ path: OUT + 'v-finalblow.png' });
  console.log('slowmo hit:', r, await page.evaluate(() => __MST.G.slowmo));
  await sleep(4000);
  await autoType(page, 15, { mistake: 0.08 });
  await page.keyboard.press('Escape'); await sleep(200); await page.click('#btn-end'); await sleep(1500);
  await page.screenshot({ path: OUT + 'v-result.png', fullPage: true });
  console.log('progress:', (await page.textContent('#res-progress')).replace(/\s+/g, ' '));
  await page.click('#btn-share'); await sleep(2500);
  await page.screenshot({ path: OUT + 'v-share.png' });
  const img = await page.$eval('.share-img', i => i.src.length);
  console.log('share img data length:', img);
  // ---- school + leaderboard class battle ----
  const sp = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(sp, 'S');
  await sp.goto(BASE); await sleep(1200);
  await sp.evaluate(() => __MST.onGoogleCredential({ credential: 'fake:kim@foonyew.edu.my' })); await sleep(900);
  await sp.selectOption('#pf-class', '2C'); await sp.fill('#pf-seat', '5'); await sp.fill('#pf-name', 'Kim'); await sp.fill('#pf-nick', 'KimKong');
  await sp.click('#btn-profile-save'); await sleep(1200);
  await sp.click('#btn-launch'); await sleep(3000);
  await autoType(sp, 40, { delay: 60 });
  await sp.keyboard.press('Escape'); await sleep(200); await sp.click('#btn-end'); await sleep(3500);
  console.log('school progress:', (await sp.textContent('#res-progress')).replace(/\s+/g, ' '), '|', await sp.textContent('#res-upload'));
  await sp.click('#btn-to-hangar'); await sleep(800);
  const titles = await sp.$$eval('#title-select option', o => o.map(x => x.value));
  console.log('titles available:', titles);
  if (titles.includes('rookie')) { await sp.selectOption('#title-select', 'rookie'); await sleep(1200); }
  await sp.click('#topbar nav [data-view="leaderboard"]'); await sleep(1500);
  await sp.click('#lb-seg [data-d="Easy"]'); await sleep(300);
  await sp.screenshot({ path: OUT + 'v-lb.png' });
  await sp.click('#lb-seg [data-d="Classes"]'); await sleep(300);
  await sp.screenshot({ path: OUT + 'v-classbattle.png' });
  console.log('ERRORS:', errors.length ? errors.slice(0, 20) : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error('CRASH', e); console.log(errors.slice(0, 20)); process.exit(1); });
