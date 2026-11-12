// Typing test (js/exam.js + the test battle in js/game.js): guest practice; a teacher opens a test in the
// TEACHER CONSOLE; a student types the code (never shown), the enemies wait, paste is ignored, the
// teacher watches live, gives one more attempt, ends an attempt, downloads the Excel report and closes
// the test; leaving the page ends an attempt; a normal mission afterwards; phone.
// Screenshots: tests/shots/x-*.png
const { chromium, LAUNCH, pickClass } = require('./pw');
const fs = require('fs');
const OUT = __dirname + '/shots/';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:8123/';
const errors = [];
const hook = 'window.__MST || window.__DMT';
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error' && !/CERT|net::ERR|Failed to load resource|GSI_LOGGER/.test(m.text())) errors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  page.on('dialog', d => d.accept());
}
function check(ok, what) { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) errors.push(what); }
const text = async (page, sel) => ((await page.textContent(sel)) || '').replace(/\s+/g, ' ');
// types the enemies' words like a student (a mistake now and then) until the time is up
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
async function signIn(page, email, cls, seat, name, nick) {
  await page.goto(BASE); await sleep(1500);
  await page.evaluate(`(${hook}).onGoogleCredential({ credential: 'fake:${email}' })`); await sleep(900);
  await pickClass(page, cls); await page.fill('#pf-seat', seat); await page.fill('#pf-name', name); await page.fill('#pf-nick', nick);
  await page.click('#btn-profile-save'); await sleep(1500);
}
async function startAttempt(p, code) {
  await p.click('#btn-exam'); await sleep(1500);
  await p.fill('#exam-code', code); await p.click('#exam-start'); await sleep(300); await p.click('#exam-go'); await sleep(5000);
}
(async () => {
  await fetch(BASE + '__testset?k=TestMinutes&v=5');
  await fetch(BASE + '__testteacher?email=wong@foonyew.edu.my&name=Ms%20Wong');
  const browser = await chromium.launch(LAUNCH);
  // ---- guest: practice only
  const g = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(g, 'guest');
  await g.goto(BASE); await sleep(1500); await g.click('#btn-guest'); await sleep(1200);
  await g.click('#btn-exam'); await sleep(500);
  check(!(await g.$('#exam-start')) && !(await g.$('#exam-teach')), 'a guest can only practise');
  await g.click('#exam-practice'); await sleep(4200);
  const gs = await state(g);
  check(gs.running && gs.exam && gs.phase === 'wave' && gs.enemies >= 1, 'practice is a battle in test mode');
  await typeTest(g, 6, 0.05);
  await g.keyboard.press('Escape'); await sleep(600);
  check(await g.evaluate(`!(${hook}).G.running`) && (await text(g, '#exam-card')).includes('PRACTICE RESULT'), 'ESC stops a practice');
  console.log('J2-K7 words:', (await g.evaluate(() => EXAM.seededWords('J2-K7', 'everyday', 12))).join(' '));

  // ---- teacher opens a test on the website
  const tch = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage(); watch(tch, 'teacher');
  await signIn(tch, 'wong@foonyew.edu.my', 'STAFF', '1', 'Wong', 'Wong');
  check(await tch.evaluate(() => S.session.teacher === true), 'the teacher can pick STAFF and is flagged as a teacher');
  await tch.click('#btn-exam'); await sleep(1500);
  check(!!(await tch.$('#exam-teach')), 'the teacher sees the TEACHER CONSOLE button');
  await tch.click('#exam-teach'); await sleep(1500);
  await tch.fill('#tc-classes', 'J210'); await tch.fill('#tc-min', '1'); await tch.fill('#tc-att', '2'); await tch.fill('#tc-code', 'j2-k7');
  await tch.screenshot({ path: OUT + 'x-teacher-new.png' });
  await tch.click('#tc-create'); await sleep(2500);
  check((await text(tch, '#exam-card')).includes('J2-K7') && (await text(tch, '#exam-card')).includes('Nobody has started'), 'test J2-K7 opened, nobody in yet');

  // ---- student
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(p, 'school');
  await signIn(p, 'exam1@foonyew.edu.my', 'J210', '12', 'Exam Student', 'Examiner');
  await p.click('#btn-exam'); await sleep(1500);
  const menu = await text(p, '#exam-card');
  check(menu.includes('A test is open') && !(await p.content()).includes('J2-K7') && !(await p.$('#exam-teach')), 'a test is open, the code is not on the page, no console for students');
  await p.screenshot({ path: OUT + 'x-menu.png' });
  await p.fill('#exam-code', 'J2-K9'); await p.click('#exam-start'); await sleep(300); await p.click('#exam-go'); await sleep(2500);
  check(/Attempts used: 0 \/ 2/.test(await text(p, '#exam-card')) && !(await p.evaluate(`(${hook}).G.running`)), 'a wrong code does not start and uses no attempt');
  await p.click('#exam-start'); await sleep(300);
  check(!(await p.isVisible('#exam-go')), 'an empty code does not open the start box');
  await p.fill('#exam-code', 'j2k7'); await p.click('#exam-start'); await sleep(400); await p.click('#exam-go'); await sleep(5000);
  let st = await state(p);
  check(st.running && st.exam && st.phase === 'wave' && !st.boss, 'the test is a battle, no boss');
  const hp0 = st.hp; await sleep(12000); st = await state(p);
  check(st.hp === hp0 && st.maxP <= 1e-9 && st.enemies === 4, 'enemies stop and wait (no damage), 4 on screen');
  await p.screenshot({ path: OUT + 'x-test-wait.png' });
  await typeTest(p, 12, 0.03);
  await p.screenshot({ path: OUT + 'x-test-typing.png' });
  // the teacher sees the student typing
  await sleep(6000);
  const live = await text(tch, '#exam-card');
  console.log('teacher live:', live.slice(live.indexOf('student'), live.indexOf('student') + 160));
  check(live.includes('Exam Student') && /typing ·/.test(live) && /1 typing now/.test(live), 'the teacher sees the student typing, live');
  await tch.screenshot({ path: OUT + 'x-teacher-live.png' });
  const before = await p.evaluate(`(${hook}).G.keystrokes`);
  await p.keyboard.type('1 2 3');
  await p.evaluate(() => { const t = document.querySelector('#typer'); t.value = '..hello world'; t.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' })); });
  check(before === await p.evaluate(`(${hook}).G.keystrokes`), 'pasted text and item / special keys are ignored');
  await typeTest(p, 70, 0.03);
  await sleep(2500);
  await p.screenshot({ path: OUT + 'x-test-result.png' });
  const res1 = await text(p, '#exam-card');
  const run = await p.evaluate(() => { const R = EXAM.EX.run; return { keys: R.keys, correct: R.correct }; });
  const net = run.correct / 5 * (run.correct / run.keys), expect = Math.round(net >= 40 ? 100 : net <= 10 ? net * 4 : 40 + 60 * (net - 10) / 30);
  check(res1.includes('TEST RESULT') && res1.includes(String(expect)), 'score on the page is ' + expect);

  // attempt 2: leaving the page ends it
  await p.click('#exam-menu'); await sleep(1500); await p.click('#exam-back'); await sleep(500);
  await startAttempt(p, 'J2-K7');
  await typeTest(p, 5, 0);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(2500);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  check((await text(p, '#exam-card')).includes('LEFT THE PAGE') && !(await p.evaluate(`(${hook}).G.running`)), 'leaving the page ends the attempt and the battle');
  await p.click('#exam-menu'); await sleep(1500);
  check(!(await p.$('#exam-start')), 'no start button after 2 attempts');

  // teacher: one more attempt for this student, then ends it
  await sleep(5500);
  await tch.click('[data-extra="exam1@foonyew.edu.my"][data-d="1"]'); await sleep(3000);
  check(/2 \/ 3/.test(await text(tch, '#exam-card')), 'the teacher gave one more attempt (2 / 3)');
  await p.click('#exam-back'); await sleep(500);
  await startAttempt(p, 'J2-K7');
  await typeTest(p, 4, 0);
  await sleep(6000);
  const endBtn = await tch.$('[data-end]');
  check(!!endBtn, 'the teacher sees an END ATTEMPT button for the running attempt');
  if (endBtn) await endBtn.click();
  let ended = false;
  for (let i = 0; i < 30 && !ended; i++) { await sleep(1000); ended = (await text(p, '#exam-card')).includes('ENDED BY YOUR TEACHER'); }
  check(ended && !(await p.evaluate(`(${hook}).G.running`)), 'the student page shows the attempt was ended by the teacher');
  await p.screenshot({ path: OUT + 'x-ended.png' });
  await sleep(5500);
  const fin = await text(tch, '#exam-card');
  check(/3 \/ 3/.test(fin) && fin.includes('ended by teacher'), 'the teacher list shows 3 / 3 and "ended by teacher"');
  await tch.screenshot({ path: OUT + 'x-teacher-done.png', fullPage: true });
  // Excel report
  const [dl] = await Promise.all([tch.waitForEvent('download'), tch.click('#tc-report')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  console.log('report:', dl.suggestedFilename(), '|', csv.split('\r\n')[1]);
  check(csv.charCodeAt(0) === 0xfeff && csv.includes('Exam Student') && csv.includes('Attempt 3 status') && csv.includes('ended by teacher'), 'the Excel (CSV) report has the student, every attempt and the status');
  // close the test
  await tch.click('#tc-toggle'); await sleep(3000);
  check((await text(tch, '#exam-card')).includes('CLOSED'), 'the teacher closed the test');
  const data = await (await fetch(BASE + '__testdata')).json();
  console.log('TestAttempts:', JSON.stringify(data.attempts.slice(1).map(r => [r[1], r[4], r[8], r[9], r[16]])));
  check(data.attempts.length === 4, 'three attempt rows (the wrong code made none)');
  // a normal game after a test is a normal game
  await p.click('#exam-menu'); await sleep(1500); await p.click('#exam-back'); await sleep(800);
  await p.click('#btn-launch'); await sleep(4000);
  st = await state(p);
  check(st.running && !st.exam && /STAGE 1/.test(st.stage), 'a normal mission after the test is a normal mission');
  await p.evaluate(`(${hook}).G.running = false`);

  // phone width
  const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); watch(ph, 'phone');
  await ph.goto(BASE); await sleep(1500); await ph.click('#btn-guest'); await sleep(1200);
  await ph.click('#btn-exam'); await sleep(400); await ph.click('#exam-practice'); await sleep(4200);
  await typeTest(ph, 4, 0);
  await ph.screenshot({ path: OUT + 'x-phone.png' });

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
