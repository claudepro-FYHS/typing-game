const { chromium, LAUNCH } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
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
  // phone hangar
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  m.on('pageerror', e => errors.push('M ' + e.message));
  await m.goto('http://localhost:8123/'); await sleep(1500); await m.click('#btn-guest'); await sleep(1500);
  await m.screenshot({ path: OUT + 'w-phone-hangar.png', fullPage: true });
  // school full game
  const sp = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
  sp.on('pageerror', e => errors.push('S ' + e.message));
  await sp.goto('http://localhost:8123/'); await sleep(1200);
  await sp.evaluate(() => __MST.onGoogleCredential({ credential: 'fake:lee@foonyew.edu.my' })); await sleep(900);
  await sp.selectOption('#pf-class', '1B'); await sp.fill('#pf-seat', '8'); await sp.fill('#pf-name', 'Lee'); await sp.fill('#pf-nick', 'LeeLaser');
  await sp.click('#btn-profile-save'); await sleep(1200);
  await sp.click('#shop-seg [data-tab="paint"]'); await sleep(200);
  await sp.click('#btn-launch'); await sleep(3000);
  await autoType(sp, 75);
  await sp.keyboard.press('Escape'); await sleep(200); await sp.click('#btn-end'); await sleep(4000);
  console.log('school progress:', (await sp.textContent('#res-progress')).replace(/\s+/g, ' '), '|', await sp.textContent('#res-upload'));
  await sp.click('#btn-to-hangar'); await sleep(1000);
  const titles = await sp.$$eval('#title-select option', o => o.map(x => x.value));
  console.log('titles:', titles);
  await sp.selectOption('#title-select', titles[1]); await sleep(1500);
  await sp.click('#topbar nav [data-view="leaderboard"]'); await sleep(1500);
  await sp.click('#lb-seg [data-d="Normal"]'); await sleep(300);
  await sp.screenshot({ path: OUT + 'w-lb.png' });
  await sp.click('#lb-seg [data-d="Classes"]'); await sleep(300);
  await sp.screenshot({ path: OUT + 'w-classbattle.png' });
  console.log('ERRORS:', errors.length ? errors : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})();
