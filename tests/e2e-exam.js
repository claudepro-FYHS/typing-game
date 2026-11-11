// Typing test (js/exam.js + the test battle in js/game.js): practice as a guest, then a real test
// as a school student (1-minute test so the run is short): the code is not shown and must be typed,
// a wrong code uses no attempt, enemies wait instead of attacking, paste is ignored, leaving the
// page ends the attempt, attempt limit, phone. Screenshots: tests/shots/x-*.png
const { chromium, LAUNCH, pickClass } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:8123/';
const errors = [];
const hook = 'window.__MST || window.__DMT';
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error' && !/CERT|net::ERR|Failed to load resource|GSI_LOGGER/.test(m.text())) errors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
}
function check(ok, what) { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) errors.push(what); }
// types the enemies' words like a student (about 45 WPM, a mistake now and then) until the time is up
async function typeTest(page, seconds, mistakeRate) {
  const end = Date.now() + seconds * 1000;
  let typed = 0;
  while (Date.now() < end) {
    const s = await page.evaluate(`(() => { const G = (${hook}).G, R = EXAM.EX.run;
      if (!R || R.over) return { over: true };
      if (!G.running || G.phase !== 'wave') return { wait: true };
      let t = G.lock; if (!t) { const c = G.targets.filter(x => x.alive); if (!c.length) return { wait: true }; t = c[0]; }
      return { rest: t.word.slice(t.typed) }; })()`);
    if (s.over) break;
    if (s.wait) { await sleep(100); continue; }
    for (const ch of s.rest) {
      if (Math.random() < mistakeRate) await page.keyboard.type('q' === ch ? 'z' : 'q');
      await page.keyboard.type(ch); await sleep(110);
    }
    typed++;
  }
  return typed;
}
const state = (page) => page.evaluate(`(() => { const G = (${hook}).G; return { running: G.running, exam: !!G.exam, phase: G.phase,
  enemies: G.targets.filter(t => t.kind === 'enemy').length, boss: !!G.boss, hp: G.me && G.me.hp, maxP: Math.max(0, ...G.targets.map(t => t.progress - t.hold)),
  items: G.me && G.me.items, stage: document.querySelector('#hud-stage').textContent }; })()`);
(async () => {
  await fetch(BASE + '__testset?k=TestCode&v=');
  const browser = await chromium.launch(LAUNCH);
  // ---- guest: practice only
  const g = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(g, 'guest');
  await g.goto(BASE); await sleep(1500); await g.click('#btn-guest'); await sleep(1200);
  await g.click('#btn-exam'); await sleep(500);
  console.log('guest menu:', (await g.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 120));
  check(!(await g.$('#exam-start')), 'guest cannot start a real test');
  await g.click('#exam-practice'); await sleep(4200);
  const gs = await state(g);
  console.log('practice battle:', JSON.stringify(gs));
  check(gs.running && gs.exam && gs.phase === 'wave' && gs.enemies >= 1, 'practice is a battle in test mode');
  await typeTest(g, 8, 0.05);
  await g.screenshot({ path: OUT + 'x-practice-typing.png' });
  await g.keyboard.press('Escape'); await sleep(600);
  console.log('practice result:', (await g.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 200));
  check(await g.evaluate(`!(${hook}).G.running`), 'ESC stops a practice');
  await g.screenshot({ path: OUT + 'x-practice-result.png' });

  // the same test code gives the same words (also in the other game: compare this line in both repos)
  console.log('J2-T2 words:', (await g.evaluate(() => EXAM.seededWords('J2-T2', 'everyday', 12))).join(' '));

  // ---- school student: real test
  await fetch(BASE + '__testset?k=TestCode&v=J2-T2');
  await fetch(BASE + '__testset?k=TestMinutes&v=1');
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(p, 'school');
  await p.goto(BASE); await sleep(1500);
  await p.evaluate(`(${hook}).onGoogleCredential({ credential: 'fake:exam1@foonyew.edu.my' })`); await sleep(900);
  await pickClass(p, 'J210'); await p.fill('#pf-seat', '12'); await p.fill('#pf-name', 'Exam Student'); await p.fill('#pf-nick', 'Examiner');
  await p.click('#btn-profile-save'); await sleep(1500);
  console.log('test button:', await p.innerHTML('#btn-exam'));
  await p.click('#btn-exam'); await sleep(1500);
  const menu = (await p.textContent('#exam-card')).replace(/\s+/g, ' ');
  console.log('menu:', menu.slice(0, 220));
  check(!menu.includes('J2-T2') && !(await p.content()).includes('J2-T2'), 'the test code is not shown anywhere on the page');
  await p.screenshot({ path: OUT + 'x-menu.png' });
  // wrong code
  await p.fill('#exam-code', 'J2-T9'); await p.click('#exam-start'); await sleep(300); await p.click('#exam-go'); await sleep(2500);
  const afterWrong = (await p.textContent('#exam-card')).replace(/\s+/g, ' ');
  check(/Attempts used: 0 \/ 2/.test(afterWrong) && !(await p.evaluate(`(${hook}).G.running`)), 'a wrong code does not start and uses no attempt');
  // empty code
  await p.click('#exam-start'); await sleep(300);
  check(!(await p.isVisible('#exam-go')), 'an empty code does not open the start box');
  // right code, typed in small letters
  await p.fill('#exam-code', 'j2-t2'); await p.click('#exam-start'); await sleep(400);
  await p.screenshot({ path: OUT + 'x-confirm.png' });
  await p.click('#exam-go'); await sleep(5000);
  let st = await state(p);
  console.log('test battle:', JSON.stringify(st));
  check(st.running && st.exam && st.phase === 'wave' && !st.boss, 'the test is a battle, no boss');
  // nobody types for 12 s: the enemies wait, the mech is not hurt, there are always enemies
  const hp0 = st.hp; await sleep(12000); st = await state(p);
  console.log('after 12 s idle:', JSON.stringify(st));
  check(st.hp === hp0 && st.maxP <= 1e-9 && st.enemies === 4, 'enemies stop and wait (no damage), 4 on screen');
  await p.screenshot({ path: OUT + 'x-test-wait.png' });
  const t0 = Date.now();
  await typeTest(p, 12, 0.03);
  await p.screenshot({ path: OUT + 'x-test-typing.png' });
  // items / special keys do nothing, paste is ignored
  const before = await p.evaluate(`(${hook}).G.keystrokes`);
  await p.keyboard.type('1 2 3');
  await p.evaluate(() => { const t = document.querySelector('#typer'); t.value = '..hello world'; t.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' })); });
  const after = await p.evaluate(`(${hook}).G.keystrokes`);
  check(before === after, 'pasted text and item / special keys are ignored');
  st = await state(p); check(JSON.stringify(st.items) === '{"bomb":0,"freeze":0,"shield":0}', 'no items in a test: ' + JSON.stringify(st.items));
  await typeTest(p, 70, 0.03);
  console.log('test took', Math.round((Date.now() - t0) / 1000), 's of typing');
  await sleep(2500);
  await p.screenshot({ path: OUT + 'x-test-result.png' });
  const res1 = (await p.textContent('#exam-card')).replace(/\s+/g, ' ');
  console.log('result 1:', res1.slice(0, 260));
  const run = await p.evaluate(() => { const R = EXAM.EX.run; return { keys: R.keys, correct: R.correct, words: R.words_done }; });
  const wpm = run.correct / 5, acc = run.correct / run.keys * 100, net = wpm * acc / 100;
  const expect = Math.round(net >= 40 ? 100 : net <= 10 ? net * 4 : 40 + 60 * (net - 10) / 30);
  console.log('client counts:', JSON.stringify(run), 'expected score', expect);
  check(res1.includes(String(expect)) && res1.includes('TEST RESULT'), 'score on the page is ' + expect);

  // attempt 2: leaving the page ends it
  await p.click('#exam-menu'); await sleep(1500);
  await p.fill('#exam-code', 'J2-T2'); await p.click('#exam-start'); await sleep(300); await p.click('#exam-go'); await sleep(5000);
  await typeTest(p, 6, 0);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(2500);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  const leftTxt = (await p.textContent('#exam-card')).replace(/\s+/g, ' ');
  console.log('left page:', leftTxt.slice(0, 200));
  check(leftTxt.includes('LEFT THE PAGE') && !(await p.evaluate(`(${hook}).G.running`)), 'leaving the page ends the attempt and the battle');
  await p.screenshot({ path: OUT + 'x-left.png' });
  await p.click('#exam-menu'); await sleep(1500);
  console.log('menu after 2 attempts:', (await p.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 300));
  check(!(await p.$('#exam-start')), 'no start button after 2 attempts');
  await p.screenshot({ path: OUT + 'x-menu-done.png', fullPage: true });
  const data = await (await fetch(BASE + '__testdata')).json();
  console.log('TestAttempts:', JSON.stringify(data.attempts.slice(1).map(r => [r[1], r[4], r[8], r[9], r[13], r[14], r[15], r[16]])));
  console.log('TestResults:', JSON.stringify(data.results.slice(1).map(r => r.slice(0, 11))));
  check(data.attempts.length === 3, 'two attempt rows (the wrong code made none)');

  // a normal game after a test still works (no test leftovers)
  await p.click('#exam-back'); await sleep(800);
  await p.click('#btn-launch'); await sleep(4000);
  st = await state(p);
  check(st.running && !st.exam && /STAGE 1/.test(st.stage), 'a normal mission after the test is a normal mission');
  await p.evaluate(`(${hook}).G.running = false`);

  // phone width
  const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); watch(ph, 'phone');
  await ph.goto(BASE); await sleep(1500); await ph.click('#btn-guest'); await sleep(1200);
  await ph.click('#btn-exam'); await sleep(400); await ph.click('#exam-practice'); await sleep(4200);
  await typeTest(ph, 5, 0);
  await ph.screenshot({ path: OUT + 'x-phone.png' });

  await fetch(BASE + '__testset?k=TestCode&v=');
  await fetch(BASE + '__testset?k=TestMinutes&v=5');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
