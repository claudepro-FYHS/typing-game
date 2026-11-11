// Awakening (20 in a row) for every mech in the hangar preview and in battle, plus combo rewards.
// Screenshots: tests/shots/aw-<mech>.png (hangar) and aw-game-*.png
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
async function typeWords(page, n) {
  let done = 0;
  for (let guard = 0; guard < 4000 && done < n; guard++) {
    const info = await page.evaluate(() => {
      const G = __MST.G; if (!G.running || G.over) return { over: true };
      if ((G.phase !== 'wave' && G.phase !== 'boss') || !G.me.alive) return { wait: true };
      let t = G.lock;
      if (!t) { const c = G.targets.filter(x => x.alive && !x.pending); if (!c.length) return { wait: true }; t = c[0]; }
      return { rest: t.word.slice(t.typed), combo: G.combo };
    });
    if (info.over) break;
    if (info.wait) { await sleep(100); continue; }
    for (const ch of info.rest) { await page.keyboard.type(ch); await sleep(15); }
    done++;
  }
  return done;
}
(async () => {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); watch(page, 'A');
  await page.addInitScript(() => {
    if (!localStorage.getItem('mst_seeded')) {
      localStorage.setItem('mst_seeded', '1');
      const all = ['starter', 'redcomet', 'aile', 'aegis', 'flag', 'zenith', 'sovereign', 'bladeangel', 'liberty', 'fate', 'baron', 'monoceros', 'nu', 'twin', 'seraph'];
      localStorage.setItem('mst_guest', JSON.stringify({ coins: 50000, owned: all, selected: 'starter', xp: 5600 }));
    }
  });
  await page.goto(BASE); await sleep(1500);
  await page.click('#btn-guest'); await sleep(1500);
  const ids = await page.evaluate(() => __MST.MODELS.MECHS.map(m => m.id));
  for (const id of (process.argv[2] ? process.argv[2].split(',') : ids)) {
    await page.click(`#mech-list .mech-card[data-id="${id}"]`); await sleep(300);
    // wait until the preview is in its awakened part of the cycle (t % 14 > 8), plus 1.5 s
    const wait = await page.evaluate(() => { const t = performance.now() / 1000 % 14; return t > 8 && t < 11 ? 0 : (22 - t) % 14; });
    await sleep(wait * 1000 + 1500);
    await page.screenshot({ path: OUT + `aw-${id}.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } });
    const card = (await page.textContent(`#mech-list .mech-card[data-id="${id}"]`)).replace(/\s+/g, ' ');
    console.log(id, '->', (card.match(/20 in a row: ([^·]+)· combo 25\/50\/100: (\S+)/) || []).slice(1).join('| '));
  }
  // battle: awaken by typing 20 words in a row, then a combo reward at 25
  await page.click('#mech-list [data-use="bladeangel"]').catch(() => {}); await sleep(800);
  await page.click('#diff-seg [data-d="Easy"]');
  await page.click('#btn-launch'); await sleep(3000);
  await page.evaluate(() => { __MST.G.me.hp = 99; __MST.G.me.maxHp = 99; });
  await typeWords(page, 20); await sleep(800);
  const s1 = await page.evaluate(() => ({ combo: __MST.G.combo, awakened: __MST.G.awakened, mech: __MST.G.me.mech.id }));
  console.log('after 20 words:', JSON.stringify(s1));
  await page.screenshot({ path: OUT + 'aw-game-awake.png' });
  const before = await page.evaluate(() => Object.assign({}, __MST.G.me.items));
  await typeWords(page, 5); await sleep(500);
  const after = await page.evaluate(() => ({ items: __MST.G.me.items, combo: __MST.G.combo }));
  console.log('items before', JSON.stringify(before), 'after combo', after.combo, JSON.stringify(after.items));
  // 3 mistakes end the awakening
  const miss = await page.evaluate(() => {
    const G = __MST.G, out = [];
    for (let i = 0; i < 3; i++) {
      const used = new Set(G.targets.map(t => t.word[0])), lock = G.lock;
      const bad = 'abcdefghijklmnopqrstuvwxyz'.split('').find(c => lock ? c !== lock.word[lock.typed] : !used.has(c));
      __MST.handleChar(bad); out.push(G.awakened);
    }
    return { awakenedAfterEach: out, awakeMiss: G.awakeMiss };
  });
  console.log('after mistakes:', JSON.stringify(miss));
  await sleep(1500);
  await page.screenshot({ path: OUT + 'aw-game-after.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
