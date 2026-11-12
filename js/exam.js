/* =====================================================================
 *  TYPING TEST (打字测验) — the same file is used by both typing games.
 *  The test is a battle (startExamGame in js/game.js): the words come in the
 *  test's fixed order, enemies stop at a distance and wait until they are
 *  typed, nobody gets hurt, no boss / items / specials / combo rewards, so
 *  every student is measured the same way. The teacher sets the code,
 *  minutes, attempts and scoring in the TestSettings tab (apps-script/Code.gs,
 *  "Typing test"); students must type the test code to start an attempt.
 *  WPM = correct keys / 5 / minutes, where correct keys = letters of finished
 *  words + one per finished word (the "space"); accuracy = correct keys /
 *  all keys; Net WPM = WPM × accuracy. The server works out the score.
 *  Uses globals from core.js: $, $$, esc, S, CFG, api, apiRetry, isSchool,
 *  showScreen, goPlayHome, toast, openModal, sfx, WORD_BANKS, and GAME_EXAM from game.js.
 * ===================================================================== */
(function () {
"use strict";
const PRACTICE_MIN = 1, PENDING_KEY = "typing_test_pending";
const EX = { info: null, run: null, loading: false };

/* ---------- page parts (added by script so both games share this file) ---------- */
const css = `
#scr-exam .exam-card { width: min(920px, 100%); }
#scr-exam h2 { margin: 0 0 4px; }
.exam-box { background: rgba(0,0,0,.25); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 10px 0; }
.exam-rules { margin: 6px 0 0; padding-left: 20px; line-height: 1.6; }
.exam-hist { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 14px; }
.exam-hist th, .exam-hist td { padding: 5px 8px; border-bottom: 1px solid var(--line); text-align: left; }
.exam-code { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.exam-code input { font: 700 20px monospace; text-transform: uppercase; letter-spacing: 1px; width: 12ch; padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: rgba(0,0,0,.35); color: inherit; }
.exam-big { font: 800 46px/1.1 monospace; }
#btn-exam .live { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #ff4d4d; box-shadow: 0 0 8px #ff4d4d; margin-left: 6px; }
body.exam-game #hud-hearts, body.exam-game .item-btn, body.exam-game #special-btn, body.exam-game #btn-pause { display: none !important; }
body.exam-game #hud-stage { font-size: 1.15em; color: #ffd34d; }
body.exam-game.exam-low #hud-stage { color: #ff6b6b; }
`;
document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
document.body.insertAdjacentHTML("beforeend", `
<section id="scr-exam" class="screen"><div class="center-wrap"><div class="card exam-card" id="exam-card"></div></div></section>`);
const multiBtn = $("#btn-multi");
if (multiBtn) multiBtn.insertAdjacentHTML("afterend", `<button class="btn ghost" id="btn-exam" style="width:100%;margin-top:10px">📝 TYPING TEST</button>`);
const card = $("#exam-card");

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
  const I = EX.info || {}, full = I.full || 40, passAcc = I.passAcc == null ? 85 : I.passAcc;
  let status = "", canStart = false;
  if (!isSchool()) status = `<p>Sign in with your school Google account to take a test. Anyone can practise.</p>`;
  else if (EX.loading) status = `<p class="muted">Checking for a test…</p>`;
  else if (I.error === "session_expired") status = `<p class="err">Your sign-in has expired. Please sign out and sign in again.</p>`;
  else if (I.error) status = `<p class="err">Could not reach the server. Try again in a moment.</p>`;
  else if (!I.active) status = `<p>There is no test right now. You can practise.</p>`;
  else if (I.reason === "no_profile") status = `<p>Fill in your class and seat number first (EDIT PROFILE).</p>`;
  else if (!I.allowed) status = `<p>The test that is open now is not for your class. You can practise.</p>`;
  else {
    const left = I.attempts - (I.used || 0);
    canStart = left > 0;
    status = `<p>A test is open · ${I.minutes} minute${I.minutes > 1 ? "s" : ""} · ${I.attempts} attempt${I.attempts > 1 ? "s" : ""}, the best one counts.</p>
      <p>Attempts used: <b>${I.used || 0} / ${I.attempts}</b>${I.best != null ? ` · Best score: <b>${I.best}</b> / 100` : ""}</p>
      ${left <= 0 ? `<p class="muted">You have used all your attempts.</p>` : `<div class="exam-code"><label for="exam-code"><b>Test code from your teacher:</b></label>
        <input id="exam-code" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE">
        <button class="btn primary" id="exam-start" style="flex:0 0 auto">START ATTEMPT ${(I.used || 0) + 1} ▶</button></div>`}`;
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
        <li>It is a battle with your own mech, but nobody gets hurt: the enemies <b>stop and wait</b> until you type their word. Type as fast and as accurately as you can until the time is up.</li>
        <li>Everybody gets the same words in the same order. No boss, items or specials in a test.</li>
        <li>A wrong key counts as a mistake. Net WPM = typing speed × accuracy. Full marks at <b>${full}</b> Net WPM${full > 40 ? "" : " or more"}; 10 Net WPM = 40 points.</li>
        <li>Accuracy under ${passAcc}% halves the score of that attempt.</li>
        <li>Don't leave the page: switching tabs or windows ends the attempt. Closing or reloading the page uses up the attempt.</li>
      </ul>
    </div>
    <div class="row" style="justify-content:flex-end;flex-wrap:wrap;gap:8px">
      <button class="btn ghost" id="exam-back" style="flex:0 0 auto">◀ BACK</button>
      <button class="btn" id="exam-practice" style="flex:0 0 auto">PRACTICE (${PRACTICE_MIN} MIN)</button>
    </div>`;
  $("#exam-back").onclick = () => goPlayHome();
  $("#exam-practice").onclick = () => { focusGameTyper(); begin({ real: false, minutes: PRACTICE_MIN, words: seededWords("practice" + Date.now(), "everyday", 400), full, passAcc }); };
  if (canStart) {
    $("#exam-start").onclick = confirmStart;
    $("#exam-code").addEventListener("keydown", e => { if (e.key === "Enter") confirmStart(); });
  }
}
function focusGameTyper() { const t = $("#typer"); if (t) t.focus({ preventScroll: true }); } // inside a click, so phone keyboards open

function confirmStart() {
  const I = EX.info, code = String(($("#exam-code") || {}).value || "").trim();
  if (!code) { toast("Type the test code your teacher gives you.", 4000); $("#exam-code").focus(); return; }
  openModal(`<h2>START ATTEMPT ${(I.used || 0) + 1} OF ${I.attempts}?</h2>
    <p>The test takes <b>${I.minutes} minutes</b>. Once it starts, this attempt counts even if you close the page.</p>
    <p>Switching to another tab or window ends the attempt.</p>`,
    `<button class="btn primary extra" id="exam-go">START ▶</button>`);
  $("#exam-go").onclick = async () => {
    focusGameTyper();
    $("#exam-go").disabled = true; $("#exam-go").textContent = "STARTING…";
    let r;
    try { r = await apiRetry({ action: "testStart", token: S.session.token, code }, "POST", 30000, 4); } catch (e) { r = { ok: false, error: "network" }; }
    $("#btn-modal-close").click();
    if (!r || !r.ok) {
      const why = { wrong_code: "That is not the right test code. Check with your teacher.", too_many_codes: "Too many wrong codes. Wait a few minutes and ask your teacher.",
        no_attempts: "You have used all your attempts.", no_test: "The test is closed.",
        not_your_class: "That code is for another class. Check the code for your class.", session_expired: "Your sign-in has expired. Sign in again.", busy: "The server is busy. Try again." }[r && r.error];
      toast(why || "Could not start the test. Try again.", 5000);
      return openExam();
    }
    begin({ real: true, attemptId: r.attemptId, attemptNo: r.attemptNo, attempts: r.attempts, minutes: r.minutes,
      words: seededWords(r.code, r.bank, Math.max(600, r.minutes * 160)), full: r.full, passAcc: r.passAcc, code: r.code });
  };
}

/* ---------- running: the battle in js/game.js ---------- */
function timeLeft(R) { return R.started ? R.minutes * 60000 - (performance.now() - R.t0) : R.minutes * 60000; }
function clock(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function begin(o) {
  EX.run = Object.assign({ correct: 0, keys: 0, errors: 0, words_done: 0, started: false, over: false, t0: 0 }, o);
  const R = EX.run;
  const label = o.real ? `TEST · ATTEMPT ${o.attemptNo}/${o.attempts}` : "PRACTICE";
  GAME_EXAM.startExamGame({
    words: o.words,
    title: o.real ? `TYPING TEST · ATTEMPT ${o.attemptNo}/${o.attempts}` : "PRACTICE",
    hud: () => `${label} · ⏱ ${clock(timeLeft(R))}${o.real ? "" : " · ESC = stop"}`,
    onStart: () => { if (EX.run !== R || R.over) return; R.started = true; R.t0 = performance.now(); loop(); },
  });
}

function loop() {
  const R = EX.run; if (!R || R.over) return;
  const left = timeLeft(R);
  document.body.classList.toggle("exam-low", left <= 10000);
  try { updateHud(); } catch (e) {}
  if (left <= 0) return finish(false);
  setTimeout(loop, 200);
}

document.addEventListener("keydown", (e) => { const R = EX.run; if (e.key === "Escape" && R && !R.real && !R.over) finish(false, true); });
document.addEventListener("visibilitychange", () => {
  const R = EX.run;
  if (document.hidden && R && !R.over && (R.started || R.real)) finish(true);
});
window.addEventListener("pagehide", () => { const R = EX.run; if (R && R.real && !R.over) finish(true); });

/* ---------- end ---------- */
async function finish(left, stopped) {
  const R = EX.run; if (!R || R.over) return;
  R.over = true;
  const st = GAME_EXAM.stopExamGame();
  R.correct = st.correct; R.keys = st.keys; R.words_done = st.words; R.errors = st.mistakes || 0;
  document.body.classList.remove("exam-low");
  showScreen("scr-exam"); try { resize(); } catch (e) {}
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

window.EXAM = { EX, openExam, seededWords, estimateScore, finish };
})();
