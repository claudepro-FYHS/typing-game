/* =====================================================================
 *  TYPING TEST (打字测验) — the same file is used by both typing games.
 *  A plain timed test (no enemies, items or combos) so every student is
 *  measured the same way: the same words in the same order for one test
 *  code, the teacher sets minutes / attempts / scoring in the TestSettings
 *  tab (see apps-script/Code.gs, "Typing test").
 *  Typing: type each word, then SPACE. A wrong key is a mistake and the
 *  cursor does not move. WPM = correct keys (letters + spaces) / 5 / minutes,
 *  Net WPM = WPM × accuracy. The server works out the score.
 *  Uses globals from core.js: $, $$, esc, S, CFG, api, apiRetry, isSchool,
 *  showScreen, goPlayHome, toast, openModal, sfx, WORD_BANKS.
 * ===================================================================== */
(function () {
"use strict";
const PRACTICE_MIN = 1, PENDING_KEY = "typing_test_pending";
const EX = { info: null, run: null, loading: false };

/* ---------- page parts (added by script so both games share this file) ---------- */
const css = `
#scr-exam .exam-card { width: min(920px, 100%); }
#scr-exam h2 { margin: 0 0 4px; }
.exam-sub { margin: 0 0 12px; }
.exam-box { background: rgba(0,0,0,.25); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 10px 0; }
.exam-rules { margin: 6px 0 0; padding-left: 20px; line-height: 1.6; }
.exam-hist { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 14px; }
.exam-hist th, .exam-hist td { padding: 5px 8px; border-bottom: 1px solid var(--line); text-align: left; }
.exam-top { display: flex; gap: 14px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
.exam-timer { font: 800 44px/1 monospace; letter-spacing: 1px; }
.exam-timer.low { color: #ff6b6b; }
.exam-words { position: relative; font: 600 30px/1.75 ui-monospace, Consolas, "Courier New", monospace; height: calc(1.75em * 3); overflow: hidden;
  display: flex; flex-wrap: wrap; align-content: flex-start; column-gap: .6em; padding: 6px 4px; cursor: text; user-select: none; }
.exam-words .w { opacity: .55; white-space: nowrap; }
.exam-words .w.cur { opacity: 1; }
.exam-words .w.cur .ok { color: #6dff9b; }
.exam-words .w.cur .nx { border-bottom: 3px solid currentColor; }
.exam-words .w.cur.space::after { content: "␣"; color: #ffd34d; margin-left: .1em; }
.exam-words.bad { animation: examShake .18s; }
.exam-words.bad .w.cur .nx { color: #ff6b6b; }
@keyframes examShake { 0%,100% { transform: none } 30% { transform: translateX(-5px) } 70% { transform: translateX(5px) } }
.exam-focus { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.65);
  font: 600 18px sans-serif; border-radius: 10px; cursor: pointer; }
.exam-words.nofocus .exam-focus { display: flex; }
.exam-count { font: 800 90px/1 monospace; text-align: center; padding: 30px 0; }
.exam-big { font: 800 46px/1.1 monospace; }
#exam-typer { position: fixed; left: -9999px; top: 0; opacity: 0; width: 10px; }
body.examining #topbar { display: none; }
#btn-exam .live { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #ff4d4d; box-shadow: 0 0 8px #ff4d4d; margin-left: 6px; }
@media (max-width: 600px) { .exam-words { font-size: 22px; } .exam-timer { font-size: 34px; } }
`;
document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
document.body.insertAdjacentHTML("beforeend", `
<section id="scr-exam" class="screen"><div class="center-wrap"><div class="card exam-card" id="exam-card"></div></div></section>
<input id="exam-typer" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Type the words here">`);
const multiBtn = $("#btn-multi");
if (multiBtn) multiBtn.insertAdjacentHTML("afterend", `<button class="btn ghost" id="btn-exam" style="width:100%;margin-top:10px">📝 TYPING TEST</button>`);
const card = $("#exam-card"), typer = $("#exam-typer");

function refreshButton() {
  const b = $("#btn-exam"); if (!b) return;
  b.innerHTML = "📝 TYPING TEST" + (S.remote.test ? ' <span class="live" title="A test is open"></span>' : "");
}
window.examRefreshButton = refreshButton;
refreshButton();
if (multiBtn) $("#btn-exam").onclick = () => openExam();

/* ---------- the word list: same seed = same words in the same order ---------- */
function bankWords(bankId) {
  const b = WORD_BANKS[bankId] || WORD_BANKS.everyday;
  const list = Array.isArray(b.words) ? b.words : String(b.words).split(/\s+/);
  return [...new Set(list.map(w => String(w).trim().toLowerCase()).filter(w => /^[a-z]+$/.test(w)))].sort();
}
function seededWords(seed, bankId, n) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const words = bankWords(bankId), out = [];
  let bag = [];
  while (out.length < n) {
    if (!bag.length) { bag = words.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
    const w = bag.pop();
    if (out.length && out[out.length - 1] === w) continue;
    out.push(w);
  }
  return out;
}
window.examSeededWords = seededWords; // for tests

/* the same rule as testScore_ in Code.gs (only used to show a practice estimate; the server scores real attempts) */
function estimateScore(net, acc, full, passAcc) {
  let sc = net >= full ? 100 : net <= 10 ? net * 4 : 40 + 60 * (net - 10) / (full - 10);
  if (acc < passAcc) sc /= 2;
  return Math.round(Math.max(0, sc));
}

/* ---------- menu ---------- */
async function openExam() {
  showScreen("scr-exam");
  renderMenu();
  if (isSchool()) {
    EX.loading = true; renderMenu();
    try {
      const r = await apiRetry({ action: "testInfo", token: S.session.token }, "POST", 20000, 3);
      EX.info = r && r.ok ? r : null;
      if (r && r.error === "session_expired") EX.info = { error: "session_expired" };
    } catch (e) { EX.info = { error: "network" }; }
    EX.loading = false;
    if (S.currentScreen === "scr-exam" && !EX.run) renderMenu();
  }
  resendPending();
}

function renderMenu() {
  document.body.classList.remove("examining");
  const I = EX.info || {}, full = I.full || 40, passAcc = I.passAcc == null ? 85 : I.passAcc;
  let status = "", canStart = false;
  if (!isSchool()) status = `<p>Sign in with your school Google account to take a test. Anyone can practise.</p>`;
  else if (EX.loading) status = `<p class="muted">Checking for a test…</p>`;
  else if (I.error === "session_expired") status = `<p class="err">Your sign-in has expired. Please sign out and sign in again.</p>`;
  else if (I.error) status = `<p class="err">Could not reach the server. Try again in a moment.</p>`;
  else if (!I.active) status = `<p>There is no test right now. You can practise.</p>`;
  else if (I.reason === "no_profile") status = `<p>Fill in your class and seat number first (EDIT PROFILE).</p>`;
  else if (!I.allowed) status = `<p>Test <b>${esc(I.code)}</b> is not for your class. You can practise.</p>`;
  else {
    const left = I.attempts - (I.used || 0);
    canStart = left > 0;
    status = `<p>Test <b>${esc(I.code)}</b> · ${I.minutes} minute${I.minutes > 1 ? "s" : ""} · ${I.attempts} attempt${I.attempts > 1 ? "s" : ""}, the best one counts.</p>
      <p>Attempts used: <b>${I.used || 0} / ${I.attempts}</b>${I.best != null ? ` · Best score: <b>${I.best}</b> / 100` : ""}</p>
      ${left <= 0 ? `<p class="muted">You have used all your attempts.</p>` : ""}`;
  }
  const hist = (I.history || []).length ? `<table class="exam-hist"><tr><th>Attempt</th><th>Net WPM</th><th>WPM</th><th>Accuracy</th><th>Score</th><th></th></tr>
    ${I.history.map(a => `<tr><td>${a.n}</td><td>${a.score == null ? "—" : a.net}</td><td>${a.score == null ? "—" : a.wpm}</td><td>${a.score == null ? "—" : a.acc + "%"}</td>
    <td><b>${a.score == null ? "—" : a.score}</b></td><td class="muted small">${a.status === "finished" ? "" : esc(a.status === "started" ? "not finished" : a.status)}</td></tr>`).join("")}</table>` : "";
  card.innerHTML = `
    <h2>📝 TYPING TEST</h2>
    <div class="exam-box">${status}${hist}</div>
    <div class="exam-box small">
      <b>How it works</b>
      <ul class="exam-rules">
        <li>Type the words in order. Press <kbd>SPACE</kbd> after each word.</li>
        <li>A wrong key counts as a mistake (the cursor waits for the right key).</li>
        <li>Net WPM = typing speed × accuracy. Full marks at <b>${full}</b> Net WPM${full > 40 ? "" : " or more"}; 10 Net WPM = 40 points.</li>
        <li>Accuracy under ${passAcc}% halves the score of that attempt.</li>
        <li>Don't leave the page: switching tabs or windows ends the attempt. Closing or reloading the page uses up the attempt.</li>
      </ul>
    </div>
    <div class="row" style="justify-content:flex-end;flex-wrap:wrap;gap:8px">
      <button class="btn ghost" id="exam-back" style="flex:0 0 auto">◀ BACK</button>
      <button class="btn" id="exam-practice" style="flex:0 0 auto">PRACTICE (${PRACTICE_MIN} MIN)</button>
      ${canStart ? `<button class="btn primary" id="exam-start" style="flex:0 0 auto">START ATTEMPT ${(I.used || 0) + 1} ▶</button>` : ""}
    </div>`;
  $("#exam-back").onclick = () => goPlayHome();
  $("#exam-practice").onclick = () => begin({ real: false, minutes: PRACTICE_MIN, words: seededWords("practice" + Date.now(), "everyday", 400), full, passAcc });
  if (canStart) $("#exam-start").onclick = confirmStart;
}

function confirmStart() {
  const I = EX.info;
  openModal(`<h2>START ATTEMPT ${(I.used || 0) + 1} OF ${I.attempts}?</h2>
    <p>The test takes <b>${I.minutes} minutes</b>. Once it starts, this attempt counts even if you close the page.</p>
    <p>Switching to another tab or window ends the attempt.</p>`,
    `<button class="btn primary extra" id="exam-go">START ▶</button>`);
  $("#exam-go").onclick = async () => {
    $("#exam-go").disabled = true; $("#exam-go").textContent = "STARTING…";
    let r;
    try { r = await apiRetry({ action: "testStart", token: S.session.token, code: I.code }, "POST", 30000, 4); } catch (e) { r = { ok: false, error: "network" }; }
    $("#btn-modal-close").click();
    if (!r || !r.ok) {
      const why = { no_attempts: "You have used all your attempts.", test_changed: "The test has changed. Open the test page again.", no_test: "The test is closed.",
        not_your_class: "This test is not for your class.", session_expired: "Your sign-in has expired. Sign in again.", busy: "The server is busy. Try again." }[r && r.error];
      toast(why || "Could not start the test. Try again.", 5000);
      return openExam();
    }
    begin({ real: true, attemptId: r.attemptId, attemptNo: r.attemptNo, attempts: r.attempts, minutes: r.minutes,
      words: seededWords(r.code, r.bank, Math.max(600, r.minutes * 160)), full: r.full, passAcc: r.passAcc, code: r.code });
  };
}

/* ---------- running ---------- */
function begin(o) {
  EX.run = Object.assign({ i: 0, typed: 0, keys: 0, correct: 0, errors: 0, words_done: 0, started: false, over: false, t0: 0 }, o);
  document.body.classList.add("examining");
  card.innerHTML = `
    <div class="exam-top"><h2>${o.real ? `TEST ${esc(o.code)} · ATTEMPT ${o.attemptNo}/${o.attempts}` : "PRACTICE"}</h2>
      <div class="exam-timer" id="exam-timer">${o.minutes}:00</div></div>
    <p class="muted small exam-sub">Type the words, SPACE after each word.${o.real ? " Stay on this page until the time is up." : ""}</p>
    <div class="exam-box"><div class="exam-words" id="exam-words"><div class="exam-count" id="exam-count">3</div></div></div>
    <div class="row small muted" style="justify-content:space-between"><span id="exam-progress">Words: 0</span>
      ${o.real ? "" : `<button class="btn ghost" id="exam-stop" style="flex:0 0 auto">STOP PRACTICE</button>`}</div>`;
  if (!o.real) $("#exam-stop").onclick = () => finish(false, true);
  focusTyper();
  let n = 3;
  const tick = () => {
    if (EX.run !== R) return;
    if (--n > 0) { $("#exam-count").textContent = n; setTimeout(tick, 1000); return; }
    R.started = true; R.t0 = performance.now(); render(); loop();
  };
  const R = EX.run;
  setTimeout(tick, 1000);
}
function focusTyper() { typer.value = ".."; typer.focus({ preventScroll: true }); try { typer.setSelectionRange(2, 2); } catch (e) {} }

function render() {
  const R = EX.run, box = $("#exam-words"); if (!R || !box) return;
  const w = R.words[R.i], done = R.typed >= w.length;
  let html = `<span class="w cur${done ? " space" : ""}"><span class="ok">${esc(w.slice(0, R.typed))}</span>${done ? "" : `<span class="nx">${esc(w[R.typed])}</span>${esc(w.slice(R.typed + 1))}`}</span>`;
  for (let k = R.i + 1; k < R.i + 40 && k < R.words.length; k++) html += `<span class="w">${esc(R.words[k])}</span>`;
  box.innerHTML = html + `<div class="exam-focus" id="exam-focus">Click here to keep typing — the clock is still running!</div>`;
  box.classList.toggle("nofocus", document.activeElement !== typer);
  $("#exam-focus").onclick = focusTyper;
  box.onclick = focusTyper;
  $("#exam-progress").textContent = `Words: ${R.words_done}`;
}

function loop() {
  const R = EX.run; if (!R || R.over) return;
  const left = R.minutes * 60000 - (performance.now() - R.t0), el = $("#exam-timer");
  if (el) { const s = Math.max(0, Math.ceil(left / 1000)); el.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); el.classList.toggle("low", s <= 10); }
  if (left <= 0) return finish(false);
  setTimeout(loop, 200);
}

function onChar(ch) {
  const R = EX.run; if (!R || R.over || !R.started) return;
  const w = R.words[R.i];
  if (ch === " ") {
    if (R.typed === 0) return; // an extra space between words is ignored
    R.keys++;
    if (R.typed >= w.length) { R.correct++; R.i++; R.typed = 0; R.words_done++; }
    else bad();
    return render();
  }
  if (!/^[a-zA-Z]$/.test(ch)) return;
  ch = ch.toLowerCase(); R.keys++;
  if (R.typed < w.length && w[R.typed] === ch) { R.correct++; R.typed++; try { sfx("key"); } catch (e) {} }
  else bad();
  render();
}
function bad() {
  const R = EX.run; R.errors++;
  try { sfx("err"); } catch (e) {}
  const box = $("#exam-words"); if (box) { box.classList.remove("bad"); void box.offsetWidth; box.classList.add("bad"); }
}

/* input: one key at a time; pasted or auto-completed text is ignored */
typer.addEventListener("input", (e) => {
  const R = EX.run;
  const v = typer.value;
  if (R && R.started && !R.over && v.startsWith("..")) {
    const add = v.slice(2);
    if (add.length === 1 && !(e && /Paste|Drop/.test(e.inputType || ""))) onChar(add);
  }
  typer.value = ".."; try { typer.setSelectionRange(2, 2); } catch (err) {}
});
typer.addEventListener("paste", e => e.preventDefault());
typer.addEventListener("drop", e => e.preventDefault());
typer.addEventListener("blur", () => { const b = $("#exam-words"); if (b && EX.run && !EX.run.over) b.classList.add("nofocus"); });
typer.addEventListener("focus", () => { const b = $("#exam-words"); if (b) b.classList.remove("nofocus"); });
document.addEventListener("visibilitychange", () => {
  const R = EX.run;
  if (document.hidden && R && !R.over && (R.started || R.real)) finish(true);
});
window.addEventListener("pagehide", () => { const R = EX.run; if (R && R.real && !R.over) finish(true); });

/* ---------- end ---------- */
async function finish(left, stopped) {
  const R = EX.run; if (!R || R.over) return;
  R.over = true; typer.blur();
  const usedMin = R.real ? R.minutes : Math.max(0.1, (R.started ? performance.now() - R.t0 : 0) / 60000);
  const wpm = R.correct / 5 / usedMin, acc = R.keys ? R.correct / R.keys * 100 : 0, net = wpm * acc / 100;
  const local = { wpm: Math.round(wpm * 10) / 10, accuracy: Math.round(acc * 10) / 10, net: Math.round(net * 10) / 10 };
  if (!R.real) {
    showResult(Object.assign(local, { practice: true, score: estimateScore(net, acc, R.full, R.passAcc), stopped }));
    return;
  }
  const payload = { action: "testFinish", token: S.session.token, attemptId: R.attemptId, correct: R.correct, keys: R.keys, words: R.words_done, left: !!left };
  card.innerHTML = `<h2>${left ? "YOU LEFT THE PAGE — ATTEMPT ENDED" : "TIME'S UP!"}</h2><p>Saving your result…</p>`;
  let r;
  try { r = await apiRetry(payload, "POST", 30000, 5); } catch (e) { r = null; }
  if (r && r.ok) { localStorage.removeItem(PENDING_KEY); showResult(Object.assign({ left }, r)); }
  else {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ payload, app: CFG.APPS_SCRIPT_URL, local })); } catch (e) {}
    showResult(Object.assign({ left, unsaved: true }, local));
  }
}

function showResult(r) {
  document.body.classList.remove("examining");
  const R = EX.run;
  const title = r.practice ? "PRACTICE RESULT" : r.left ? "ATTEMPT ENDED (YOU LEFT THE PAGE)" : "TEST RESULT";
  card.innerHTML = `
    <h2>${title}</h2>
    ${r.unsaved ? `<p class="err">Your result could not be saved yet. Stay online and press SEND AGAIN, or tell your teacher.</p>` : ""}
    ${r.left && !r.practice ? `<p class="muted small">The attempt was counted over the full ${R.minutes} minute${R.minutes > 1 ? "s" : ""}.</p>` : ""}
    <div class="stats">
      <div class="stat"><div class="exam-big">${r.net}</div><div class="muted small">Net WPM</div></div>
      <div class="stat"><div class="exam-big">${r.unsaved ? "…" : r.score}</div><div class="muted small">${r.practice ? "Score if this were the test" : "Score / 100"}</div></div>
      <div class="stat"><b>${r.wpm}</b><div class="muted small">WPM</div></div>
      <div class="stat"><b>${r.accuracy}%</b><div class="muted small">Accuracy</div></div>
      <div class="stat"><b>${R.words_done}</b><div class="muted small">Words</div></div>
      <div class="stat"><b>${R.errors}</b><div class="muted small">Mistakes</div></div>
    </div>
    ${!r.practice && !r.unsaved ? `<p>Attempt ${r.attemptNo} of ${r.attempts}. Your best score: <b>${r.best}</b> / 100 (the best attempt counts).</p>` : ""}
    ${r.practice && r.stopped ? `<p class="muted small">Stopped early: the speed is for the time you typed.</p>` : ""}
    <div class="row" style="justify-content:flex-end;gap:8px">
      ${r.unsaved ? `<button class="btn gold" id="exam-resend" style="flex:0 0 auto">SEND AGAIN</button>` : ""}
      <button class="btn primary" id="exam-menu" style="flex:0 0 auto">OK</button>
    </div>`;
  $("#exam-menu").onclick = () => { EX.run = null; openExam(); };
  if (r.unsaved) $("#exam-resend").onclick = async () => { const ok = await resendPending(true); if (ok) { EX.run = null; openExam(); } };
  try { sfx(r.practice || r.unsaved ? "item" : "clear"); } catch (e) {}
}

/* a result that could not be sent (no network) is kept and sent again later */
async function resendPending(loud) {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch (e) {}
  if (!p || p.app !== CFG.APPS_SCRIPT_URL || !isSchool()) return false;
  p.payload.token = S.session.token;
  try {
    const r = await apiRetry(p.payload, "POST", 30000, 3);
    if (r && (r.ok || r.error === "no_attempt")) { localStorage.removeItem(PENDING_KEY); if (r.ok) toast(`Test result saved: ${r.score} / 100`, 5000); return true; }
  } catch (e) {}
  if (loud) toast("Still could not save. Check the internet and try again.", 5000);
  return false;
}

window.EXAM = { EX, openExam, seededWords, estimateScore, onChar };
})();
