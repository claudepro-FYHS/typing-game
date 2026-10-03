const { chromium, LAUNCH } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const DATES = process.env.D ? JSON.parse(process.env.D) : [['2026-10-31', 'halloween'], ['2026-12-25', 'christmas'], ['2027-02-06', 'cny'], ['2026-04-05', 'qingming'], ['2026-04-02', 'aprilfools'], ['2026-08-31', 'merdeka'], ['2027-02-15', 'valentine'], ['2026-07-15', null]];
async function autoType(page, seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const info = await page.evaluate(() => { const G = __MST.G; if (!G.running || G.over) return { over: true }; if ((G.phase !== 'wave' && G.phase !== 'boss') || !G.me.alive) return { wait: true };
      let t = G.lock; if (!t) { const c = G.targets.filter(x => x.alive && !(x.kind === 'boss' && G.boss && G.boss.enter < 1)); if (!c.length) return { wait: true }; t = c[0]; } return { rest: t.word.slice(t.typed) }; });
    if (info.over) return; if (info.wait) { await sleep(120); continue; }
    await page.keyboard.type(info.rest[0]); await sleep(55);
  }
}
(async () => {
  const browser = await chromium.launch(LAUNCH);
  for (const [date, want] of DATES) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const fake = Date.parse(date + 'T02:00:00Z');
    await ctx.addInitScript(`{ const off = ${fake} - Date.now(); const N = Date.now; Date.now = () => N() + off; }`);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(date + ' ' + e.message));
    await p.goto('http://localhost:8123/'); await sleep(1500); await p.click('#btn-guest'); await sleep(1500);
    const banner = (await p.textContent('#hangar-event')).trim();
    const banks = await p.$$eval('#bank-select option', o => o.map(x => x.value));
    const evBank = banks.find(b => b.startsWith('event_')) || null;
    console.log(date, 'want', want, '| bank', evBank, '|', banner.slice(0, 110));
    if ((evBank || null) !== (want ? 'event_' + want : null)) errors.push(date + ' wrong event ' + evBank);
    if (!want) { await ctx.close(); continue; }
    await p.screenshot({ path: OUT + `f-${want}-hangar.png` });
    await p.selectOption('#bank-select', evBank);
    await p.click('#btn-launch'); await sleep(2500);
    const words = await p.evaluate(() => __MST.G.targets.map(t => t.word));
    if (want === 'aprilfools') {
      await p.evaluate(() => { window.__fools = 0; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if ((n.textContent || '').includes('APRIL FOOL')) window.__fools++; }))).observe(document.body, { childList: true, subtree: true }); });
      await autoType(p, 40);
      console.log('   april fools pranks seen:', await p.evaluate(() => window.__fools), 'kills', await p.evaluate(() => __MST.G.me.kills));
    }
    // skip to the boss
    await p.evaluate(() => { const G = __MST.G; G.stageKills = 999; G.targets.forEach(t => { t.alive = false; if (t.mesh) t.mesh.visible = false; }); G.targets = G.targets.filter(t => t.kind === 'boss'); });
    await sleep(9000);
    const boss = await p.evaluate(() => __MST.G.boss ? __MST.G.boss.name : null);
    const bossName = await p.evaluate(() => { const el = document.querySelector('#boss-name'); return el ? el.textContent : ''; });
    console.log('   words', words.join(','), '| boss', boss, bossName);
    await p.screenshot({ path: OUT + `f-${want}-boss.png` });
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})();
