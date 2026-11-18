// Sentence mode (常用句子) in solo, the typing-test practice and multiplayer, and the multiplayer
// rescue: a downed teammate comes back only when EVERY teammate still standing has typed the 🆘 word.
// The same file is in both typing games. Run: node run.js e2e-rescue-lines
const { chromium, LAUNCH, pickClass } = require('./pw');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:8123/';
const errors = [];
const W = 'window.__MST || window.__DMT';
const ok = (c, msg) => { if (!c) { errors.push('FAIL: ' + msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error' && !/CERT|net::ERR|Failed to load resource|GSI_LOGGER/.test(m.text())) errors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
}
// type the next key of the locked target (or pick one); `want` = 'rescue' types only the rescue word
async function typeSome(page, seconds, want, delay) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const info = await page.evaluate(([w, want]) => {
      const G = eval(w).G; if (!G.running || G.over) return { over: true };
      if ((G.phase !== 'wave' && G.phase !== 'boss') || !G.me.alive) return { wait: true };
      let t = G.lock;
      if (!t) {
        const c = G.targets.filter(x => x.alive && !x.pending && !(x.kind === 'boss' && G.boss && G.boss.enter < 1) &&
          (want === 'rescue' ? x.kind === 'rescue' && !x.sent && !x.done[G.myPid] && x.victim !== G.myPid : x.kind !== 'rescue'));
        if (!c.length) return { wait: true, none: want === 'rescue' };
        t = c.reduce((a, b) => (b.progress > a.progress ? b : a));
      }
      return { rest: t.word.slice(t.typed), kind: t.kind };
    }, [W, want || '']);
    if (info.over) return 'over';
    if (info.none) return 'none';
    if (info.wait) { await sleep(120); continue; }
    if (want === 'rescue' && info.kind !== 'rescue') { await page.keyboard.press('Backspace'); await sleep(60); continue; }
    await page.keyboard.type(info.rest[0]); await sleep(delay || 45);
  }
  return 'time';
}
async function mk(email, cls, seat, name, nick) {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 680 } })).newPage(); watch(page, nick);
  await page.goto(BASE); await sleep(1200);
  await page.evaluate(([w, e]) => eval(w).onGoogleCredential({ credential: 'fake:' + e }), [W, email]); await sleep(900);
  await pickClass(page, cls); await page.fill('#pf-seat', seat); await page.fill('#pf-name', name); await page.fill('#pf-nick', nick);
  await page.click('#btn-profile-save'); await sleep(1500);
  return page;
}
let browser;
(async () => {
  browser = await chromium.launch(LAUNCH);

  console.log('— 1. solo, sentence bank');
  const g = await (await browser.newContext({ viewport: { width: 1000, height: 680 } })).newPage(); watch(g, 'solo');
  await g.goto(BASE); await sleep(1500); await g.click('#btn-guest'); await sleep(1200);
  const groups = await g.$$eval('#bank-select optgroup', a => a.map(x => x.label + ':' + x.children.length));
  ok(groups.length === 2 && /Sentences/.test(groups[1]), 'bank picker has a Sentences group: ' + groups.join(' / '));
  await g.selectOption('#bank-select', 'code_s2');
  ok(/exactly/.test(await g.textContent('#bank-note')), 'a note explains sentence mode');
  await g.click('#btn-launch'); await sleep(3500);
  await typeSome(g, 35);
  const solo = await g.evaluate(w => { const G = eval(w).G; return { lines: G.lines, kills: G.myKills, correct: G.correct, keys: G.keystrokes, tags: [...document.querySelectorAll('#labels .tag.line')].length, words: G.targets.map(t => t.word) }; }, W);
  console.log('  solo:', JSON.stringify(solo));
  ok(solo.lines && solo.kills >= 2, 'code lines are typed exactly and destroy enemies');
  ok(solo.correct > solo.kills * 5, 'capitals / symbols count as 2 presses (correct ' + solo.correct + ')');
  ok(solo.words.every(w => w.length >= 5) && solo.tags > 0, 'enemies carry whole lines');
  await g.screenshot({ path: OUT + 'lines-solo.png' });
  // a space while a line is locked is part of the line, not the special
  const sp = await g.evaluate(w => { const M = eval(w), G = M.G; const t = G.targets.find(x => x.alive && x.kind === 'enemy' && x.word.includes(' ')); if (!t) return null; G.lock = t; t.typed = t.word.indexOf(' '); const c0 = G.charge; handleChar(' '); return { typed: t.typed, at: t.word.indexOf(' ') + 1 }; }, W);
  if (sp) ok(sp.typed === sp.at, 'space goes into the locked line');
  await g.keyboard.press('Escape'); await sleep(300); await g.click('#btn-end'); await sleep(1500);

  console.log('— 2. typing-test practice with sentences');
  await g.goto(BASE); await sleep(1500); await g.click('#btn-guest'); await sleep(1200);
  await g.click('#btn-exam'); await sleep(500);
  await g.selectOption('#exam-pbank', 'line_everyday');
  await g.click('#exam-practice'); await sleep(4200);
  await typeSome(g, 25, '', 40);
  const ex = await g.evaluate(w => { const G = eval(w).G; return { lines: G.lines, done: G.examWords, letters: G.examLetters, max: G.targets.filter(t => t.kind === 'enemy').length, bossOrItems: !!G.boss }; }, W);
  console.log('  practice:', JSON.stringify(ex));
  ok(ex.lines && ex.done >= 1 && ex.max <= 3 && !ex.bossOrItems, 'practice battle uses sentences (3 on screen, no boss)');
  await g.screenshot({ path: OUT + 'lines-practice.png' });
  await g.keyboard.press('Escape'); await sleep(1200);
  const res = await g.textContent('#exam-card');
  ok(/Lines/.test(res) && /Net WPM/.test(res), 'practice result counts lines');

  console.log('— 3. multiplayer rescue (3 players)');
  const h = await mk('cara@foonyew.edu.my', 'J101', '1', 'Cara', 'Cara');
  await h.selectOption('#bank-select', 'everyday');
  await h.click('#btn-multi'); await sleep(300); await h.click('#btn-mp-create'); await sleep(2500);
  const code = (await h.textContent('#mp-room-code')).trim();
  const a = await mk('dan@foonyew.edu.my', 'J101', '2', 'Dan', 'Dan'), b = await mk('eve@foonyew.edu.my', 'J102', '3', 'Eve', 'Eve');
  for (const p of [a, b]) { await p.click('#btn-multi'); await sleep(300); await p.fill('#mp-code', code); await p.click('#btn-mp-join'); await sleep(3500); }
  await h.click('#btn-mp-start'); await sleep(4500);
  const pids = await h.evaluate(w => eval(w).G.players.map(p => [p.nick, p.pid]), W);
  const danPid = pids.find(x => x[0] === 'Dan')[1];
  // Dan goes down (host decides)
  await h.evaluate(([w, pid]) => { const G = eval(w).G; G.phase = 'wave'; const v = G.players.find(p => p.pid === pid); v.hp = 1; v.shield = false; hitPlayer({ id: -1, victim: pid }); }, [W, danPid]);
  await sleep(1200);
  const seen = async (p) => p.evaluate(([w, pid]) => { const G = eval(w).G, r = G.targets.find(t => t.kind === 'rescue'); const v = G.players.find(x => x.pid === pid); return { rescue: r ? r.word : null, danAlive: v.alive, danHp: v.hp, msg: document.querySelector('#hud-msg').textContent, over: G.over }; }, [W, danPid]);
  const s0 = [await seen(h), await seen(a), await seen(b)];
  console.log('  after Dan is down:', JSON.stringify(s0));
  ok(s0.every(x => x.rescue && !x.danAlive && !x.over), 'everyone sees the 🆘 word, the match goes on');
  ok(/teammate/.test(s0[1].msg), 'Dan is told his teammates can save him');
  await a.screenshot({ path: OUT + 'rescue-down.png' });
  // Dan can't type his own rescue word
  await a.keyboard.type(s0[1].rescue); await sleep(500);
  ok(!(await seen(h)).danAlive, 'the downed player cannot rescue himself');
  // host types it: not enough, Eve must too
  ok(await typeSome(h, 15, 'rescue') !== 'over', 'host typed the rescue word');
  await sleep(1000);
  const s1 = await seen(h);
  ok(!s1.danAlive && s1.rescue, 'one teammate is not enough (Eve still has to type it)');
  await h.screenshot({ path: OUT + 'rescue-half.png' });
  await typeSome(b, 15, 'rescue'); await sleep(1500);
  const s2 = [await seen(h), await seen(a), await seen(b)];
  console.log('  after both typed it:', JSON.stringify(s2));
  ok(s2.every(x => x.danAlive && !x.rescue), 'Dan is back on every screen when all teammates typed it');
  ok(s2[0].danHp >= 1, 'back with ' + s2[0].danHp + ' hearts');
  await a.screenshot({ path: OUT + 'rescue-back.png' });
  // Dan down again, Eve types, then the host goes down: Eve was the only one left needed -> Dan comes back
  await h.evaluate(([w, pid]) => { const G = eval(w).G; const v = G.players.find(p => p.pid === pid); v.hp = 1; v.shield = false; hitPlayer({ id: -2, victim: pid }); }, [W, danPid]);
  await sleep(1000);
  await typeSome(b, 15, 'rescue'); await sleep(800);
  ok(!(await seen(h)).danAlive, 'Dan down again: Eve typed it, host has not');
  await h.evaluate(w => { const G = eval(w).G; const me = G.me; me.hp = 1; me.shield = false; hitPlayer({ id: -3, victim: me.pid }); }, W);
  await sleep(1500);
  const s3 = await seen(b);
  console.log('  host down too:', JSON.stringify(s3));
  ok(s3.danAlive && !s3.over, 'when the host goes down, Eve alone was enough: Dan is back');
  ok(s3.rescue, 'and now the host has a 🆘 word');
  // everyone down = game over
  await h.evaluate(w => { const G = eval(w).G; for (const p of G.players.filter(p => p.alive)) { p.hp = 1; p.shield = false; hitPlayer({ id: -9, victim: p.pid }); } }, W);
  await sleep(2500);
  ok(await h.evaluate(w => eval(w).G.over, W), 'all down: the match is over');

  console.log('ERRORS:', errors.length ? errors.slice(0, 15) : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error('CRASH', e); console.log(errors); process.exit(1); });
