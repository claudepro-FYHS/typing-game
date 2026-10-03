// Form + class pickers, new school year, outside Google accounts, class battle groups.
const { chromium, LAUNCH, pickClass } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:8123/';
const errors = [];
const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) errors.push(what); };
function watch(page, tag) {
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/CERT|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ': ' + m.text()); });
}
async function login(page, email) {
  await page.goto(BASE); await sleep(1500);
  await page.evaluate(e => __MST.onGoogleCredential({ credential: 'fake:' + e }), email); await sleep(1200);
}
async function playSome(page, seconds) {
  await page.click('#btn-launch'); await sleep(2500);
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const rest = await page.evaluate(() => { const G = __MST.G; if (!G.running || G.over || (G.phase !== 'wave' && G.phase !== 'boss')) return null;
      const t = G.lock || G.targets.find(x => x.alive && !(x.kind === 'boss' && G.boss && G.boss.enter < 1)); return t ? t.word.slice(t.typed) : null; });
    if (rest) await page.keyboard.type(rest[0]); await sleep(rest ? 60 : 150);
  }
  await page.keyboard.press('Escape'); await sleep(200); await page.click('#btn-end'); await sleep(3500);
  return (await page.textContent('#res-upload')).trim();
}
(async () => {
  const browser = await chromium.launch(LAUNCH);
  // ---------- school student: form + class ----------
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); watch(p, 'S');
  await p.goto(BASE); await sleep(1500);
  check((await p.textContent('#login-hint')).includes('Foon Yew students'), 'login hint mentions other accounts');
  await login(p, 'joe@foonyew.edu.my');
  check(await p.isVisible('#pf-school-row'), 'school row shown for school account');
  const forms = await p.$$eval('#pf-grade option', o => o.map(x => x.value).filter(Boolean));
  check(forms.join(',') === 'J1,J2,J3,S1AC,S1S,S2AC,S2S,S3AC,S3S', 'forms: ' + forms.join(','));
  await p.click('#btn-profile-save'); await sleep(300);
  check((await p.textContent('#profile-msg')).includes('form and class'), 'asks for form and class');
  await pickClass(p, 'J105');
  check((await p.textContent('#pf-class-preview')).includes('J105'), 'preview shows J105');
  await pickClass(p, 'S2AC3');
  check((await p.textContent('#pf-class-preview')).includes('S2AC3'), 'preview shows S2AC3');
  await pickClass(p, 'J105');
  await p.fill('#pf-seat', '12'); await p.fill('#pf-name', 'Joe Tan'); await p.fill('#pf-nick', 'JoeJet');
  await p.screenshot({ path: OUT + 'c-profile-phone.png', fullPage: true });
  await p.click('#btn-profile-save'); await sleep(1500);
  check(await p.evaluate(() => __MST.S.currentScreen) === 'scr-hangar', 'saved -> hangar');
  check((await p.textContent('#userchip')).includes('J105-12'), 'user chip shows J105-12');
  console.log('  upload:', await playSome(p, 30));
  // edit profile keeps the class
  await p.click('#btn-to-hangar').catch(() => {}); await sleep(800);
  await p.click('#btn-edit-profile'); await sleep(500);
  check(await p.inputValue('#pf-grade') === 'J1' && await p.inputValue('#pf-classno') === '5', 'edit form prefilled J1 / 5');
  await p.click('#btn-profile-cancel'); await sleep(500);

  // ---------- new school year ----------
  const next = String(new Date().getFullYear() + 1);
  await fetch(BASE + '__set?k=SchoolYear&v=' + next);
  await p.reload(); await sleep(3000);
  check(await p.evaluate(() => __MST.S.currentScreen) === 'scr-profile', 'new year -> profile form');
  check(await p.isVisible('#profile-newyear'), 'new-year note shown');
  check(await p.inputValue('#pf-grade') === '' && await p.inputValue('#pf-seat') === '', 'class and seat cleared');
  check(await p.inputValue('#pf-nick') === 'JoeJet', 'nickname kept');
  check(!(await p.isVisible('#btn-profile-cancel')), 'cannot skip choosing a class');
  await p.screenshot({ path: OUT + 'c-newyear.png', fullPage: true });
  await pickClass(p, 'J205'); await p.fill('#pf-seat', '3'); await p.click('#btn-profile-save'); await sleep(1500);
  check((await p.textContent('#userchip')).includes('J205-3'), 'moved up to J205');
  await fetch(BASE + '__set?k=SchoolYear&v=');

  // ---------- outside Google account ----------
  const o = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage(); watch(o, 'O');
  await login(o, 'pal@gmail.com');
  check(await o.evaluate(() => __MST.S.currentScreen) === 'scr-profile', 'outsider -> profile form');
  check(!(await o.isVisible('#pf-school-row')), 'no class / seat for outsiders');
  await o.fill('#pf-nick', 'PalPilot');
  await o.screenshot({ path: OUT + 'c-outsider-profile.png' });
  await o.click('#btn-profile-save'); await sleep(1500);
  check(await o.evaluate(() => __MST.S.currentScreen) === 'scr-hangar', 'outsider saved -> hangar');
  check((await o.textContent('#userchip')).includes('🌐'), 'outsider chip shows 🌐');
  console.log('  upload:', await playSome(o, 30));
  const coins = await o.evaluate(() => __MST.S.session.player.coins);
  await login(o, 'pal@gmail.com');
  check(await o.evaluate(() => __MST.S.session.player.coins) === coins && coins > 0, 'outsider coins kept after signing in again: ' + coins);

  // ---------- leaderboard ----------
  await o.click('#btn-to-hangar').catch(() => {});
  await o.click('#topbar nav [data-view="leaderboard"]'); await sleep(1800);
  const boards = await o.textContent('#lb-body');
  check(boards.includes('PalPilot') && boards.includes('🌐'), 'outsider on leaderboard with 🌐');
  await o.click('#lb-seg [data-d="Classes"]'); await sleep(300);
  check((await o.textContent('#lb-body')).includes('J205'), 'junior class battle lists J205');
  await o.screenshot({ path: OUT + 'c-classbattle-junior.png' });
  await o.click('#cb-seg [data-g="S"]'); await sleep(200);
  check((await o.textContent('#lb-body')).includes('S1AC1') && !(await o.textContent('#lb-body')).includes('J205'), 'senior group');
  await o.click('#cb-seg [data-g=""]'); await sleep(200);
  const all = await o.textContent('#lb-body');
  check(all.includes('J105') && !all.includes('J205') && !all.includes('S1AC1') && !all.includes('OTHER'), 'whole school: only classes that played, no OTHER');
  await o.screenshot({ path: OUT + 'c-classbattle-all.png' });

  // ---------- outside accounts switched off ----------
  await fetch(BASE + '__set?k=AllowOtherAccounts&v=NO');
  const q = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage(); watch(q, 'Q');
  await q.goto(BASE); await sleep(1500);
  check((await q.textContent('#login-hint')).startsWith('Sign in with your'), 'hint for school accounts only');
  await q.evaluate(() => __MST.onGoogleCredential({ credential: 'fake:pal@gmail.com' })); await sleep(1200);
  check((await q.textContent('#login-msg')).includes('not a @foonyew.edu.my account'), 'outsider refused when off');
  await fetch(BASE + '__set?k=AllowOtherAccounts&v=YES');

  console.log('ERRORS:', errors.length ? errors : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error('CRASH', e); console.log(errors); process.exit(1); });
