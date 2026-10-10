// Signing in while the school server is busy: the page retries by itself.
const { chromium, LAUNCH } = require('./pw');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:8123/';
const errors = [];
const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) errors.push(what); };
(async () => {
  const browser = await chromium.launch(LAUNCH);
  async function signIn(email, busy, waitMs) {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', e => errors.push(email + ': ' + e.message));
    await page.goto(BASE); await sleep(1500);
    await fetch(BASE + '__busy?' + busy);
    const seen = [];
    await page.exposeFunction('__seen', t => seen.push(t));
    await page.evaluate(() => new MutationObserver(() => window.__seen(document.querySelector('#login-msg').textContent))
      .observe(document.querySelector('#login-msg'), { childList: true, characterData: true, subtree: true }));
    const t0 = Date.now();
    await page.evaluate(e => __MST.onGoogleCredential({ credential: 'fake:' + e }), email);
    await sleep(waitMs);
    const out = { screen: await page.evaluate(() => __MST.S.currentScreen), msg: await page.textContent('#login-msg'), seen, secs: (Date.now() - t0) / 1000 };
    await fetch(BASE + '__busy');
    return out;
  }
  let r = await signIn('a1@foonyew.edu.my', 'google=3', 500);
  check(r.screen === 'scr-profile', 'Google busy 3 times: the server retries and sign-in works');
  r = await signIn('a2@foonyew.edu.my', 'login=2', 9000);
  check(r.screen === 'scr-profile', 'server HTTP 500 twice: the page retries and sign-in works');
  check(r.seen.some(t => t.includes('trying again')), 'shows "trying again" while retrying');
  r = await signIn('a3@foonyew.edu.my', 'lock=1', 500);
  check(r.screen === 'scr-profile', 'lock queue full: sign-in still works (it does not need the lock)');
  r = await signIn('a4@foonyew.edu.my', 'login=10', 14000);
  check(r.screen === 'scr-login' && r.msg.includes('Sign in again'), 'gives up after 4 tries with a clear message: ' + r.msg);
  console.log('ERRORS:', errors.length ? errors : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
