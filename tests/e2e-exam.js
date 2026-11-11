// Typing test page (js/exam.js): practice as a guest, then a real test as a school student
// (1-minute test so the run is short), an attempt that ends when the student leaves the page,
// and the attempt limit. Screenshots: tests/shots/x-*.png
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
// types the test words like a student: about 45 WPM, a mistake now and then
async function typeTest(page, seconds, mistakeRate) {
  const end = Date.now() + seconds * 1000;
  let typed = 0;
  while (Date.now() < end) {
    const s = await page.evaluate(() => { const R = EXAM.EX.run; return R && R.started && !R.over ? R.words[R.i].slice(R.typed) : null; });
    if (s === null) { if (await page.evaluate(() => !EXAM.EX.run || EXAM.EX.run.over)) break; await sleep(100); continue; }
    for (const ch of s) {
      if (Math.random() < mistakeRate) await page.keyboard.type('q' === ch ? 'z' : 'q');
      await page.keyboard.type(ch); await sleep(110);
    }
    await page.keyboard.type(' '); typed++;
  }
  return typed;
}
(async () => {
  await fetch(BASE + '__testset?k=TestCode&v=');
  const browser = await chromium.launch(LAUNCH);
  // ---- guest: practice only
  const g = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(g, 'guest');
  await g.goto(BASE); await sleep(1500); await g.click('#btn-guest'); await sleep(1200);
  await g.click('#btn-exam'); await sleep(500);
  console.log('guest menu:', (await g.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 120));
  console.log('guest can start a test:', !!(await g.$('#exam-start')));
  await g.click('#exam-practice'); await sleep(3600);
  await typeTest(g, 8, 0.05);
  await g.screenshot({ path: OUT + 'x-practice-typing.png' });
  await g.click('#exam-stop'); await sleep(400);
  console.log('practice result:', (await g.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 200));
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
  await p.screenshot({ path: OUT + 'x-menu.png' });
  console.log('menu:', (await p.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 260));
  await p.click('#exam-start'); await sleep(400);
  await p.screenshot({ path: OUT + 'x-confirm.png' });
  await p.click('#exam-go'); await sleep(4500);
  const t0 = Date.now();
  await typeTest(p, 25, 0.03);
  await p.screenshot({ path: OUT + 'x-test-typing.png' });
  // paste is ignored
  const before = await p.evaluate(() => EXAM.EX.run.keys);
  await p.evaluate(() => { const t = document.querySelector('#exam-typer'); t.value = '..hello world'; t.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' })); });
  console.log('paste ignored:', before === await p.evaluate(() => EXAM.EX.run.keys));
  await typeTest(p, 70, 0.03);
  console.log('test took', Math.round((Date.now() - t0) / 1000), 's');
  await sleep(2500);
  await p.screenshot({ path: OUT + 'x-test-result.png' });
  const res1 = (await p.textContent('#exam-card')).replace(/\s+/g, ' ');
  console.log('result 1:', res1.slice(0, 260));
  const run = await p.evaluate(() => { const R = EXAM.EX.run; return { keys: R.keys, correct: R.correct, words: R.words_done }; });
  const wpm = run.correct / 5, acc = run.correct / run.keys * 100, net = wpm * acc / 100;
  const expect = Math.round(net >= 40 ? 100 : net <= 10 ? net * 4 : 40 + 60 * (net - 10) / 30);
  console.log('client counts:', JSON.stringify(run), 'expected score', expect);
  if (!res1.includes(String(expect))) errors.push('score on the page is not ' + expect);

  // attempt 2: leaving the page ends it
  await p.click('#exam-menu'); await sleep(1500);
  await p.click('#exam-start'); await sleep(300); await p.click('#exam-go'); await sleep(4500);
  await typeTest(p, 6, 0);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(2500);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  console.log('left page:', (await p.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 200));
  await p.screenshot({ path: OUT + 'x-left.png' });
  await p.click('#exam-menu'); await sleep(1500);
  console.log('menu after 2 attempts:', (await p.textContent('#exam-card')).replace(/\s+/g, ' ').slice(0, 300));
  console.log('start button still there:', !!(await p.$('#exam-start')));
  await p.screenshot({ path: OUT + 'x-menu-done.png', fullPage: true });
  const data = await (await fetch(BASE + '__testdata')).json();
  console.log('TestAttempts:', JSON.stringify(data.attempts.slice(1).map(r => [r[1], r[4], r[8], r[9], r[13], r[14], r[15], r[16]])));
  console.log('TestResults:', JSON.stringify(data.results.slice(1).map(r => r.slice(0, 11))));

  // phone width
  const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); watch(ph, 'phone');
  await ph.goto(BASE); await sleep(1500); await ph.click('#btn-guest'); await sleep(1200);
  await ph.click('#btn-exam'); await sleep(400); await ph.click('#exam-practice'); await sleep(3600);
  await typeTest(ph, 4, 0);
  await ph.screenshot({ path: OUT + 'x-phone.png' });

  await fetch(BASE + '__testset?k=TestCode&v=');
  await fetch(BASE + '__testset?k=TestMinutes&v=5');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
