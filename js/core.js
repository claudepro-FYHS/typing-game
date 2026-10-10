"use strict";
/* =====================================================================
 *  钢弹击字 Mecha Strike Typer — main program
 * ===================================================================== */
const CFG = Object.assign({ APPS_SCRIPT_URL: "", FALLBACK_CLASSES: ["1A", "1B"], SCHOOL_DOMAIN: "foonyew.edu.my", PEER_SERVER: null }, window.GAME_CONFIG || {});

const WORD_BANKS = {};
for (const [k, b] of Object.entries(window.WORD_BANKS || {})) {
  const words = [...new Set(String(b.words).toLowerCase().split(/\s+/).filter(w => /^[a-z]+$/.test(w)))];
  if (words.length >= 20) WORD_BANKS[k] = { name: b.name, words };
}
const MECHS = MODELS.MECHS;
const MECH_BY_ID = Object.fromEntries(MECHS.map(m => [m.id, m]));
const PCOLORS = ["#3ad0ff", "#ffcc33", "#ff5e7a", "#7dff8a"];

const DIFF = {
  Easy:   { travel: 15, spawn: 2.6, minActive: 2, maxActive: 5, bossHp: 4, bossAtk: 6.5, missileTime: 7.5, drone: 0.6, heavy: 0.1, kills: 6, mult: 1 },
  Normal: { travel: 11, spawn: 1.9, minActive: 3, maxActive: 7, bossHp: 6, bossAtk: 5.0, missileTime: 6.0, drone: 0.4, heavy: 0.25, kills: 8, mult: 1.3 },
  Hard:   { travel: 8,  spawn: 1.4, minActive: 3, maxActive: 9, bossHp: 8, bossAtk: 3.8, missileTime: 4.8, drone: 0.25, heavy: 0.4, kills: 10, mult: 1.6 },
};

/* =====================================================================
 *  STORAGE & API
 * ===================================================================== */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  sget(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  sset(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

async function api(payload, method = "POST", timeoutMs = 15000) {
  if (!CFG.APPS_SCRIPT_URL) throw new Error("not_configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res;
    if (method === "GET") res = await fetch(CFG.APPS_SCRIPT_URL + "?" + new URLSearchParams(payload), { signal: ctrl.signal });
    else res = await fetch(CFG.APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain;charset=utf-8" }, signal: ctrl.signal });
    if (!res.ok) throw new Error("http_" + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// When the whole class signs in or saves at the same time, Apps Script or Google can be briefly busy.
// Try again a few times, waiting a little longer (and a random extra bit, so 40 students don't
// all retry at the same moment).
const RETRY_ERRORS = ["busy", "google_busy", "server"];
async function apiRetry(payload, method = "POST", timeoutMs = 30000, tries = 4, onRetry) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) {
      if (onRetry) onRetry(i + 1, tries);
      await new Promise(r => setTimeout(r, 1500 * i + Math.random() * 1500));
    }
    try {
      const r = await api(payload, method, timeoutMs);
      if (r && !r.ok && RETRY_ERRORS.includes(r.error) && i < tries - 1) { last = r; continue; }
      return r;
    } catch (e) { last = e; }
  }
  if (last instanceof Error) throw last;
  return last;
}

const S = {
  remote: { classes: store.get("mst_classes", CFG.FALLBACK_CLASSES), clientId: "", minAccuracy: 80, loaded: false, grades: store.get("mst_grades", []), allowOthers: true },
  session: store.sget("mst_session", null), // {token, email, exp, player, admin}
  guest: store.get("mst_guest", { coins: 0, owned: ["starter"], selected: "starter" }),
  prefs: Object.assign({ diff: "Normal", bank: "everyday", quality: "high", sound: true, music: true, meanings: true, bg: "deep", shopTab: "mechs" }, store.get("mst_prefs", {})),
  lastMe: 0,
};
if (S.session && Date.now() > S.session.exp) { S.session = null; store.sset("mst_session", null); }
S.guest.owned = (S.guest.owned || []).filter(id => MECH_BY_ID[id]);
if (!S.guest.owned.includes("starter")) S.guest.owned.unshift("starter");
if (!MECH_BY_ID[S.guest.selected]) S.guest.selected = "starter";
if (!WORD_BANKS[S.prefs.bank]) S.prefs.bank = "everyday";

function isSchool() { return !!(S.session && S.session.token); }
function isAdmin() { return !!(isSchool() && S.session.player && S.session.player.admin); }
function wallet() { return isSchool() && S.session.player ? S.session.player : S.guest; }
function saveWallet() { if (isSchool()) store.sset("mst_session", S.session); else store.set("mst_guest", S.guest); }
function savePrefs() { store.set("mst_prefs", S.prefs); }
function setPlayer(p) {
  if (!isSchool() || !p) return;
  p.owned = (p.owned || []).filter(id => MECH_BY_ID[id]);
  if (!p.owned.includes("starter")) p.owned.unshift("starter");
  if (!MECH_BY_ID[p.selected]) p.selected = "starter";
  S.session.player = p; saveWallet();
}
function giftToast(r) { if (r && r.gift > 0) toast(`🎁 Your teacher sent you ${r.gift} coins!`); }

/* =====================================================================
 *  UI HELPERS
 * ===================================================================== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function showScreen(id) {
  $$(".screen").forEach(s => s.classList.toggle("show", s.id === id));
  S.currentScreen = id;
  render3DMode();
}
function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
function fmtDate(ms) { if (!ms) return "—"; return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
function toast(msg, ms) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), ms || 3500);
}
function coinText(n) { return isAdmin() ? "∞" : n; }

let currentView = "play";
function setView(v) {
  if (NET.role && !G.running) netLeave();
  currentView = v;
  $$("#topbar nav button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  if (v === "leaderboard") { showScreen("scr-leaderboard"); loadLeaderboard(); }
  else if (v === "teacher") { showScreen("scr-teacher"); teacherInit(); }
  else goPlayHome();
}
$$("#topbar nav button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

function renderUserChip() {
  const el = $("#userchip");
  if (isSchool()) {
    const p = S.session.player;
    const who = p ? `${esc(p.nickname)} <span class="small">(${p.cls === "OTHER" ? "🌐" : esc(p.cls) + "-" + esc(p.seat)})</span>${p.admin ? ' <span class="small" style="color:var(--gold)">ADMIN</span>' : ""}` : esc(S.session.email);
    el.innerHTML = `<span>👤 ${who}</span>${p ? `<span class="lv">LV ${myLevel()}</span>` : ""}<span class="coins">🪙 ${p ? coinText(p.coins) : 0}</span><button id="btn-signout">Sign out</button>`;
    $("#btn-signout").onclick = signOut;
  } else if (S.guestMode) {
    el.innerHTML = `<span>Guest</span><span class="lv">LV ${myLevel()}</span><span class="coins">🪙 ${S.guest.coins}</span><button id="btn-signin">Sign in</button>`;
    $("#btn-signin").onclick = () => { S.guestMode = false; showLogin(); };
  } else el.innerHTML = "";
}

function goPlayHome() {
  currentView = "play";
  $$("#topbar nav button").forEach(b => b.classList.toggle("active", b.dataset.view === "play"));
  if (isSchool()) {
    if (!S.session.player || S.session.player.needsClass) return showProfile();
    if (S.pendingJoin) { const c = S.pendingJoin; S.pendingJoin = null; showMulti(); $("#mp-code").value = c; netJoin(c); return; }
    showHangar();
  } else if (S.guestMode) showHangar();
  else showLogin();
}

/* =====================================================================
 *  CONFIG + GOOGLE SIGN-IN
 * ===================================================================== */
async function loadRemoteConfig() {
  if (!CFG.APPS_SCRIPT_URL) return;
  try {
    const c = await apiRetry({ action: "config" }, "GET", 15000, 3);
    if (c && c.ok) {
      if (c.classes && c.classes.length) { S.remote.classes = c.classes; store.set("mst_classes", c.classes); }
      S.remote.grades = Array.isArray(c.grades) ? c.grades : [];
      store.set("mst_grades", S.remote.grades);
      S.remote.allowOthers = c.allowOthers !== false;
      if (c.domain) S.remote.domain = c.domain;
      S.remote.clientId = c.clientId || "";
      S.remote.minAccuracy = c.minAccuracy;
      S.remote.loaded = true;
      S.remote.eventWindows = Array.isArray(c.eventWindows) ? c.eventWindows : [];
      S.remote.disabledEvents = Array.isArray(c.disabledEvents) ? c.disabledEvents : [];
      addEventBank();
      renderEventBanners();
      if (S.currentScreen === "scr-hangar") { renderBankSelect(); renderPilot(); }
      if (S.currentScreen === "scr-profile") renderGradeOptions($("#pf-grade").value, $("#pf-classno").value);
    }
  } catch (e) { console.warn("config load failed", e); }
}

let gsiLoaded = null;
function loadGsi() {
  if (gsiLoaded) return gsiLoaded;
  gsiLoaded = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { gsiLoaded = null; reject(new Error("gsi")); };
    document.head.appendChild(s);
  });
  return gsiLoaded;
}

async function showLogin() {
  showScreen("scr-login");
  renderUserChip();
  const warn = $("#setup-warn"), msg = $("#login-msg");
  warn.style.display = "none";
  renderLoginHint();
  if (!CFG.APPS_SCRIPT_URL) {
    warn.style.display = "block";
    warn.textContent = "Setup not finished: school sign-in and score saving are off. (Teacher: paste the Apps Script URL into config.js — see README.)";
    $("#gsi-btn").innerHTML = "";
    return;
  }
  if (!S.remote.loaded) { msg.textContent = ""; $("#gsi-btn").innerHTML = '<span class="muted small">Connecting…</span>'; await loadRemoteConfig(); }
  if (!S.remote.loaded) { $("#gsi-btn").innerHTML = ""; msg.textContent = "Can't reach the school server right now. You can still play as a guest."; return; }
  if (!S.remote.clientId) { $("#gsi-btn").innerHTML = ""; warn.style.display = "block"; warn.textContent = "Setup not finished: GoogleClientId is empty in the Settings sheet."; return; }
  try {
    await loadGsi();
    const opts = { client_id: S.remote.clientId, callback: onGoogleCredential, auto_select: false, cancel_on_tap_outside: true };
    if (!S.remote.allowOthers) opts.hd = schoolDomain(); // only offer school accounts
    google.accounts.id.initialize(opts);
    $("#gsi-btn").innerHTML = "";
    google.accounts.id.renderButton($("#gsi-btn"), { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with" });
  } catch (e) {
    $("#gsi-btn").innerHTML = "";
    msg.textContent = "Google sign-in could not load on this network. You can still play as a guest.";
  }
}

async function onGoogleCredential(resp) {
  const msg = $("#login-msg");
  msg.className = "muted"; msg.textContent = "Signing in…";
  try {
    const r = await apiRetry({ action: "login", idToken: resp.credential }, "POST", 30000, 4,
      (n, max) => { msg.className = "muted"; msg.textContent = `The school server is busy — trying again (${n}/${max})…`; });
    if (r.ok) {
      S.session = { token: r.token, email: r.email, exp: Date.now() + 11.5 * 3600 * 1000, player: null, admin: !!r.admin };
      setPlayer(r.player);
      store.sset("mst_session", S.session);
      S.guestMode = false; S.lastMe = Date.now();
      msg.textContent = "";
      giftToast(r);
      flushPending();
      goPlayHome();
    } else if (r.error === "not_school") {
      S.remote.allowOthers = false; renderLoginHint();
      msg.className = "err";
      msg.textContent = `${r.email || "This account"} is not a @${CFG.SCHOOL_DOMAIN} account. You can still play as a guest (scores are not recorded).`;
    } else if (RETRY_ERRORS.includes(r.error)) {
      msg.className = "err"; msg.textContent = "The school server is very busy right now. Wait half a minute and click Sign in again, or play as a guest.";
    } else { msg.className = "err"; msg.textContent = "Sign-in failed (" + r.error + "). Please click Sign in again."; }
  } catch (e) {
    msg.className = "err";
    msg.textContent = e && e.name === "AbortError"
      ? "The school server is taking too long. Wait half a minute and click Sign in again, or play as a guest."
      : "Can't reach the school server (" + ((e && e.message) || "network") + "). Please click Sign in again, or play as a guest.";
  }
}

function signOut() {
  try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
  netLeave();
  S.session = null; store.sset("mst_session", null);
  S.guestMode = false;
  showLogin();
}
$("#btn-guest").onclick = () => { S.guestMode = true; showHangar(); };

// refresh coins / teacher gifts now and then
async function refreshMe(force) {
  if (!isSchool() || !S.session.player) return;
  if (!force && Date.now() - S.lastMe < 30000) return;
  S.lastMe = Date.now();
  try {
    const r = await api({ action: "me", token: S.session.token }, "POST", 12000);
    if (r.ok && r.player) {
      setPlayer(r.player); giftToast(r); renderUserChip();
      if (r.player.needsClass && S.currentScreen === "scr-hangar") return showProfile(); // new school year
      if (S.currentScreen === "scr-hangar") { renderMechList(); renderSkinList(); renderPilot(); } }
  } catch (e) {}
}

/* =====================================================================
 *  PROFILE
 * ===================================================================== */
function schoolDomain() { return (S.remote.domain || CFG.SCHOOL_DOMAIN).toLowerCase(); }
function isOutsider() { return isSchool() && !String(S.session.email || "").toLowerCase().endsWith("@" + schoolDomain()); }
function clsLabel(c) { return c === "OTHER" ? "🌐" : c; }
function renderLoginHint() {
  $("#login-hint").innerHTML = S.remote.allowOthers
    ? `Sign in with Google to save your scores, coins and mechs. Foon Yew students: please use your <b>@${esc(schoolDomain())}</b> account.`
    : `Sign in with your <b>@${esc(schoolDomain())}</b> account to save your scores, coins and mechs.`;
}
// junior classes get a 2-digit number (J105), senior classes don't (S2AC3) — same rule as Code.gs classCode_
function classCode(grade, n) { return grade + (grade[0] === "J" && n < 10 ? "0" + n : String(n)); }
function profileClass() {
  const g = $("#pf-grade").value;
  if (!g) return "";
  if (g === "STAFF" || !S.remote.grades.length) return g;
  const n = Number($("#pf-classno").value);
  return n ? classCode(g, n) : "";
}
function renderClassNumbers(keep) {
  const g = $("#pf-grade").value, grade = S.remote.grades.find(x => x.grade === g);
  const sel = $("#pf-classno");
  $("#pf-classno-field").style.display = grade ? "" : "none";
  sel.innerHTML = '<option value="">—</option>' + (grade ? Array.from({ length: grade.count }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("") : "");
  if (keep) sel.value = keep;
  const c = profileClass();
  $("#pf-class-preview").textContent = c && c !== "STAFF" ? "Your class: " + c : "";
}
// Form first (J1, J2 … S3S), then the class number. Falls back to a plain class list if ClassCounts is not set.
function renderGradeOptions(g0, n0) {
  const p = (S.session && S.session.player) || {};
  const grades = S.remote.grades.length ? S.remote.grades.map(g => g.grade) : S.remote.classes.slice();
  if (S.session.admin || p.admin) grades.push("STAFF");
  $("#pf-grade").innerHTML = '<option value="">— choose —</option>' + grades.map(g => `<option>${esc(g)}</option>`).join("");
  $("#pf-grade").value = grades.includes(g0) ? g0 : "";
  renderClassNumbers(n0);
}
function showProfile() {
  showScreen("scr-profile");
  renderUserChip();
  const p = S.session.player || {};
  const outsider = isOutsider();
  $("#pf-school-row").style.display = outsider ? "none" : "";
  $("#pf-name-label").textContent = outsider ? "Name (optional — only your teacher can see it)" : "Full name";
  $("#profile-newyear").style.display = !outsider && p.needsClass && p.cls ? "" : "none";
  let g0 = "", n0 = "";
  if (p.cls && !p.needsClass) {
    g0 = p.cls;
    for (const g of S.remote.grades) for (let n = 1; n <= g.count; n++) if (classCode(g.grade, n) === p.cls) { g0 = g.grade; n0 = String(n); }
  }
  renderGradeOptions(g0, n0);
  $("#pf-seat").value = p.needsClass ? "" : (p.seat || "");
  $("#pf-name").value = p.name || "";
  $("#pf-nick").value = p.nickname || "";
  $("#profile-email").textContent = "Signed in as " + S.session.email + (S.session.admin ? " (admin)" : "") + (outsider ? " — not a school account, so no class is needed." : "");
  $("#profile-msg").textContent = "";
  $("#btn-profile-cancel").style.display = S.session.player && !p.needsClass ? "" : "none";
}
$("#pf-grade").onchange = () => { $("#profile-msg").textContent = ""; renderClassNumbers(); };
$("#pf-classno").onchange = () => { $("#profile-msg").textContent = ""; renderClassNumbers($("#pf-classno").value); };
$("#btn-profile-cancel").onclick = () => showHangar();
$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#profile-msg"), btn = $("#btn-profile-save");
  const nick = $("#pf-nick").value.trim();
  const outsider = isOutsider(), cls = profileClass();
  msg.className = "err";
  if (!outsider) {
    if (!cls) { msg.textContent = "Please choose your form and class."; return; }
    if (!(Number($("#pf-seat").value) >= 1)) { msg.textContent = "Please enter your seat number."; return; }
    if (!$("#pf-name").value.trim()) { msg.textContent = "Please enter your full name."; return; }
  }
  if (!/^[A-Za-z0-9_\-㐀-鿿]{2,12}$/.test(nick)) { msg.textContent = "Nickname: 2–12 letters, numbers or Chinese characters, no spaces."; return; }
  btn.disabled = true; msg.className = "muted"; msg.textContent = "Saving…";
  try {
    const r = await apiRetry({ action: "saveProfile", token: S.session.token, cls: outsider ? "" : cls, seat: $("#pf-seat").value, name: $("#pf-name").value, nickname: nick });
    if (r.ok) { S.session.admin = !!r.admin; setPlayer(r.player); giftToast(r); goPlayHome(); }
    else if (r.error === "session_expired") { msg.className = "err"; msg.textContent = "Your sign-in expired. Please sign in again."; setTimeout(signOut, 1500); }
    else { msg.className = "err"; msg.textContent = r.message || ("Could not save (" + r.error + ")."); }
  } catch (err) { msg.className = "err"; msg.textContent = "Can't reach the school server. Please try again."; }
  btn.disabled = false;
});

/* =====================================================================
 *  HANGAR / SHOP
 * ===================================================================== */
let previewId = null;
function showHangar() {
  netLeave();
  showScreen("scr-hangar");
  renderUserChip();
  const w = wallet();
  if (!previewId || !MECH_BY_ID[previewId]) previewId = w.selected || "starter";
  renderMechList();
  renderSkinList();
  setShopTab(S.prefs.shopTab);
  $$("#diff-seg button").forEach(b => b.classList.toggle("active", b.dataset.d === S.prefs.diff));
  renderBankSelect();
  renderPilot();
  $("#btn-edit-profile").style.display = isSchool() ? "" : "none";
  $("#btn-quality").textContent = "GRAPHICS: " + S.prefs.quality.toUpperCase();
  renderToggles();
  $("#shop-msg").textContent = "";
  renderEventBanners();
  refreshMe();
}
function renderToggles() {
  $("#btn-sound").textContent = "SOUND: " + (S.prefs.sound ? "ON" : "OFF");
  $("#btn-music").textContent = "MUSIC: " + (S.prefs.music ? "ON" : "OFF");
  $("#btn-meaning").textContent = "中文: " + (S.prefs.meanings ? "ON" : "OFF");
}
function renderBankSelect() {
  const bs = $("#bank-select");
  const entries = Object.entries(WORD_BANKS).sort((a, b) => (b[1].event ? 1 : 0) - (a[1].event ? 1 : 0));
  bs.innerHTML = entries.map(([k, b]) => `<option value="${k}">${esc(b.name)} (${b.words.length})</option>`).join("");
  if (!WORD_BANKS[S.prefs.bank]) S.prefs.bank = "everyday";
  bs.value = S.prefs.bank;
}
function renderEventBanners() {
  const ev = activeEvent();
  if (typeof setEnvironment === "function" && !G.running) setEnvironment(envId || "deep", ev && ev.id);
  for (const id of ["#login-event", "#hangar-event"]) {
    const el = $(id); if (!el) continue;
    el.classList.toggle("show", !!ev);
    if (ev) el.innerHTML = `${ev.icon} <b>${esc(ev.name)} event!</b> ${ev.boss ? `Special boss <b>${esc(ev.boss)}</b>, ` : ""}festival word bank and <b>coins ×${ev.bonus}</b> until ${esc(ev.end)}.`;
  }
}
function renderPilot() {
  const pr = profile(), lv = myLevel(), xp = pr.xp || 0;
  const cur = xpToReach(lv), next = xpToReach(lv + 1);
  $("#pilot-lv").textContent = `LV ${lv}`;
  $("#pilot-xpbar").style.width = lv >= 50 ? "100%" : `${Math.min(100, (xp - cur) / (next - cur) * 100).toFixed(1)}%`;
  $("#pilot-xptext").textContent = isAdmin() ? "Admin: everything unlocked" : lv >= 50 ? `${xp} XP — max level!` : `${xp} / ${next} XP to LV ${lv + 1}`;
  const earned = isAdmin() ? BADGES.map(b => b.id) : (pr.badges || []);
  const ts = $("#title-select");
  ts.innerHTML = `<option value="">— no title —</option>` + BADGES.filter(b => earned.includes(b.id)).map(b => `<option value="${b.id}">${b.icon} ${esc(b.name)}</option>`).join("");
  ts.value = earned.includes(pr.title) ? pr.title : "";
  $("#btn-badges").textContent = `🏅 BADGES ${earned.length}/${BADGES.length}`;
  const nextBg = BACKGROUNDS.find(b => b.level > lv);
  $("#pilot-unlocks").innerHTML = `Bosses unlocked: <b>${bossPoolSize(lv)}/${MODELS.BOSSES.filter(b => !b.event).length}</b>` +
    (lv < 11 ? ` · next boss at LV ${lv + 1}` : "") + (nextBg ? ` · ${esc(nextBg.name)} battlefield at LV ${nextBg.level}` : "");
  const bg = $("#bg-select");
  bg.innerHTML = BACKGROUNDS.map(b => `<option value="${b.id}" ${b.level > lv ? "disabled" : ""}>${b.level > lv ? "🔒 " : ""}${esc(b.name)}${b.level > lv ? ` (LV ${b.level})` : ""}</option>`).join("");
  if (!BACKGROUNDS.some(b => b.id === S.prefs.bg && b.level <= lv)) S.prefs.bg = "deep";
  bg.value = S.prefs.bg;
  setEnvironment(S.prefs.bg, activeEvent() && activeEvent().id);
}
function showBadges() {
  const pr = profile(), earned = isAdmin() ? BADGES.map(b => b.id) : (pr.badges || []), st = pr.stats || emptyStats();
  openModal(`<h2>BADGES ${earned.length}/${BADGES.length}</h2>
    <p class="small muted">Earned badges can be used as your title on the leaderboard. Kills ${st.kills} · Bosses ${st.bosses} · Best combo ${st.bestCombo} · Best WPM ${st.bestWpm} · Day streak ${st.streak}</p>
    <div class="badge-grid">${BADGES.map(b => `<div class="badge ${earned.includes(b.id) ? "" : "locked"}"><span class="bi">${b.icon}</span><b>${esc(b.name)}</b>${esc(b.desc)}</div>`).join("")}</div>`);
}
function openModal(html, actionsHtml) {
  $("#modal-body").innerHTML = html;
  $$("#modal-actions .extra").forEach(e => e.remove());
  if (actionsHtml) $("#btn-modal-close").insertAdjacentHTML("beforebegin", actionsHtml);
  $("#modal").classList.add("show");
}
function closeModal() { $("#modal").classList.remove("show"); }
$("#btn-modal-close").onclick = closeModal;
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
$("#btn-badges").onclick = showBadges;
$("#title-select").onchange = (e) => {
  const id = e.target.value, pr = profile();
  pr.title = id; saveWallet();
  if (isSchool()) api({ action: "setTitle", token: S.session.token, title: id }).then(r => { if (r.player) setPlayer(r.player); }).catch(() => {});
};
$("#bg-select").onchange = (e) => { S.prefs.bg = e.target.value; savePrefs(); setEnvironment(S.prefs.bg, activeEvent() && activeEvent().id); };
$("#btn-music").onclick = () => { S.prefs.music = !S.prefs.music; savePrefs(); renderToggles(); };
$("#btn-meaning").onclick = () => { S.prefs.meanings = !S.prefs.meanings; savePrefs(); renderToggles(); };
$$("#shop-seg button").forEach(b => b.onclick = () => setShopTab(b.dataset.tab));
function setShopTab(tab) {
  S.prefs.shopTab = tab === "paint" ? "paint" : "mechs"; savePrefs();
  $$("#shop-seg button").forEach(b => b.classList.toggle("active", b.dataset.tab === S.prefs.shopTab));
  $("#mech-list").style.display = S.prefs.shopTab === "mechs" ? "" : "none";
  $("#skin-list").style.display = S.prefs.shopTab === "paint" ? "" : "none";
}
function renderSkinList() {
  const pr = profile(), w = wallet();
  $("#skin-list").innerHTML = `<p class="small muted" style="margin:0 0 4px">Paint jobs work on every mech you own.</p>` + SKINS.map(k => {
    const owned = isAdmin() || pr.skins.includes(k.id), sel = pr.skin === k.id;
    const action = sel ? '<span class="ok small">✔ IN USE</span>' : owned ? `<button class="btn" data-skin-use="${k.id}" style="padding:5px 10px">USE</button>`
      : `<button class="btn gold" data-skin-buy="${k.id}" style="padding:5px 10px" ${w.coins < k.price ? "disabled" : ""}>BUY 🪙${k.price}</button>`;
    return `<div class="mech-card ${sel ? "sel" : ""}"><div class="top"><span class="name"><span class="swatch">${k.swatch.map(c => `<i style="background:${c}"></i>`).join("")}</span>${esc(k.name)}</span>${action}</div></div>`;
  }).join("");
  $$("#skin-list [data-skin-use]").forEach(b => b.onclick = () => selectSkin(b.dataset.skinUse));
  $$("#skin-list [data-skin-buy]").forEach(b => b.onclick = () => buySkin(b.dataset.skinBuy, b));
}
function selectSkin(id) {
  const pr = profile(); pr.skin = id; saveWallet(); renderSkinList(); renderMechList();
  if (isSchool()) api({ action: "selectSkin", token: S.session.token, skin: id }).catch(() => {});
}
async function buySkin(id, btn) {
  const k = SKIN_BY_ID[id], msg = $("#shop-msg"), pr = profile();
  msg.textContent = "";
  if (isSchool()) {
    btn.disabled = true; btn.textContent = "…";
    try {
      const r = await api({ action: "buySkin", token: S.session.token, skin: id });
      if (r.player) setPlayer(r.player);
      if (!r.ok) msg.textContent = r.error === "not_enough_coins" ? "Not enough coins yet — keep typing!" : "Purchase failed (" + r.error + ").";
      else sfx("item");
    } catch (e) { msg.textContent = "Can't reach the school server. Try again later."; }
  } else {
    if (S.guest.coins < k.price) { msg.textContent = "Not enough coins yet — keep typing!"; return; }
    S.guest.coins -= k.price; pr.skins.push(id); pr.skin = id; saveWallet(); sfx("item");
  }
  renderSkinList(); renderMechList();
}
function specialText(m) { return m.special ? `⚡ needs ${m.special.charge} in a row` : ""; }
function renderMechList() {
  const w = wallet();
  $("#mech-list").innerHTML = MECHS.map(m => {
    const owned = w.owned.includes(m.id);
    const selected = w.selected === m.id;
    let action;
    if (selected) action = '<span class="ok small">✔ IN USE</span>';
    else if (owned) action = `<button class="btn" data-use="${m.id}" style="padding:5px 10px">USE</button>`;
    else action = `<button class="btn gold" data-buy="${m.id}" style="padding:5px 10px" ${w.coins < m.price ? "disabled" : ""}>BUY 🪙${m.price}</button>`;
    return `<div class="mech-card ${previewId === m.id ? "sel" : ""}" data-id="${m.id}">
      <div class="top"><span class="name">${m.name}</span>${action}</div>
      <div class="from">${esc(m.from)}</div>
      <div class="hp">${"♥".repeat(m.hp)} <span class="muted small">${owned ? "" : "🪙 " + m.price}</span></div>
      <div class="desc">${esc(m.plus)} ${m.minus ? `<span class="minus">(${esc(m.minus)})</span>` : ""}</div></div>`;
  }).join("");
  $$("#mech-list .mech-card").forEach(c => c.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    previewId = c.dataset.id; renderMechList();
  }));
  $$("#mech-list [data-use]").forEach(b => b.onclick = () => selectMech(b.dataset.use));
  $$("#mech-list [data-buy]").forEach(b => b.onclick = () => buyMech(b.dataset.buy, b));
  $("#mech-title").textContent = MECH_BY_ID[previewId].name;
  setPreviewMech(previewId, profile().skin);
  renderUserChip();
}
function selectMech(id) {
  const w = wallet(); w.selected = id; previewId = id; saveWallet(); renderMechList();
  if (isSchool()) api({ action: "selectMech", token: S.session.token, mech: id }).catch(() => {});
}
async function buyMech(id, btn) {
  const m = MECH_BY_ID[id], msg = $("#shop-msg");
  msg.textContent = "";
  if (isSchool()) {
    btn.disabled = true; btn.textContent = "…";
    try {
      const r = await api({ action: "buyMech", token: S.session.token, mech: id });
      if (r.player) setPlayer(r.player);
      if (!r.ok) msg.textContent = r.error === "not_enough_coins" ? "Not enough coins yet — keep typing!" : r.error === "session_expired" ? "Sign-in expired. Please sign in again." : "Purchase failed (" + r.error + ").";
      else { previewId = id; sfx("item"); }
    } catch (e) { msg.textContent = "Can't reach the school server. Try again later."; }
    renderMechList();
  } else {
    const w = S.guest;
    if (w.coins < m.price) { msg.textContent = "Not enough coins yet — keep typing!"; return; }
    w.coins -= m.price; w.owned.push(id); w.selected = id; previewId = id; saveWallet(); sfx("item"); renderMechList();
  }
}
$$("#diff-seg button").forEach(b => b.onclick = () => { S.prefs.diff = b.dataset.d; savePrefs(); $$("#diff-seg button").forEach(x => x.classList.toggle("active", x === b)); });
$("#bank-select").onchange = (e) => { S.prefs.bank = e.target.value; savePrefs(); };
$("#btn-edit-profile").onclick = () => showProfile();
$("#btn-quality").onclick = () => {
  S.prefs.quality = S.prefs.quality === "high" ? "low" : "high"; savePrefs(); applyQuality();
  $("#btn-quality").textContent = "GRAPHICS: " + S.prefs.quality.toUpperCase();
};
$("#btn-sound").onclick = () => { S.prefs.sound = !S.prefs.sound; savePrefs(); $("#btn-sound").textContent = "SOUND: " + (S.prefs.sound ? "ON" : "OFF"); };
function ensureOwnedSelection() {
  const w = wallet();
  if (!w.owned.includes(previewId)) { $("#shop-msg").textContent = "Buy this mech first, or pick one you own."; return false; }
  if (w.selected !== previewId) selectMech(previewId);
  return true;
}
function soloOptions() {
  const ev = activeEvent();
  return { mode: "solo", role: "solo", myPid: "me", diff: S.prefs.diff, bank: S.prefs.bank, stages: 0, bg: S.prefs.bg, level: myLevel(), event: ev ? ev.id : "",
    players: [{ pid: "me", nick: isSchool() && S.session.player ? S.session.player.nickname : "You", mech: wallet().selected, skin: profile().skin }] };
}
$("#btn-launch").addEventListener("click", () => {
  if (!ensureOwnedSelection()) return;
  typer.focus(); // must happen inside the click so phone keyboards open
  startGame(soloOptions());
});
$("#btn-multi").addEventListener("click", () => { if (ensureOwnedSelection()) showMulti(); });

/* =====================================================================
 *  SOUND (tiny synth, no files)
 * ===================================================================== */
let actx = null, noiseBuf = null, sfxBus = null;
function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  actx = actx || new AC();
  if (actx.state === "suspended" && !(window.OfflineAudioContext && actx instanceof OfflineAudioContext)) actx.resume().catch(() => {});
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return actx;
}
// all sound effects go through a compressor (no harsh peaks) plus a short "space" echo
function fxBus() {
  if (sfxBus) return sfxBus;
  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  const makeup = actx.createGain(); makeup.gain.value = 1.8;
  comp.connect(makeup); makeup.connect(actx.destination);
  const dry = actx.createGain(), delay = actx.createDelay(0.5), fb = actx.createGain(), wet = actx.createGain(), tone = actx.createBiquadFilter();
  delay.delayTime.value = 0.11; fb.gain.value = 0.28; wet.gain.value = 0.22; tone.type = "lowpass"; tone.frequency.value = 2200;
  dry.connect(comp); dry.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(comp);
  return (sfxBus = dry);
}
function sfx(type) {
  if (!S.prefs.sound) return;
  try {
    if (!audioCtx()) return;
    const t = actx.currentTime, out = fxBus();
    // one voice: oscillator → filter → envelope
    const voice = (o) => {
      const osc = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
      osc.type = o.wave || "sine"; osc.detune.value = o.detune || 0;
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || o.dur));
      f.type = "lowpass"; f.Q.value = o.q || 0.7;
      f.frequency.setValueAtTime(o.cut0 || 8000, t);
      if (o.cut1) f.frequency.exponentialRampToValueAtTime(o.cut1, t + o.dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol, t + (o.att || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      osc.connect(f); f.connect(g); g.connect(out); osc.start(t); osc.stop(t + o.dur + 0.03);
    };
    const noise = (o) => {
      const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      src.buffer = noiseBuf;
      f.type = o.type || "lowpass"; f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + (o.att || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + o.dur + 0.02);
    };
    const jitter = 1 + (Math.random() - 0.5) * 0.08; // small pitch change so rapid shots don't sound identical
    switch (type) {
      case "key": // small beam shot: a soft, quick downward "pew"
        voice({ wave: "sawtooth", f0: 880 * jitter, f1: 260 * jitter, dur: 0.11, vol: 0.05, cut0: 2600, cut1: 500, q: 4 });
        voice({ wave: "sine", f0: 440 * jitter, f1: 140, dur: 0.09, vol: 0.06 });
        noise({ type: "bandpass", f0: 3000, f1: 900, dur: 0.05, vol: 0.025, q: 1.5 });
        break;
      case "beam": // big beam rifle when a word is finished: "bvvshuuu"
        voice({ wave: "sawtooth", f0: 1100 * jitter, f1: 120, glide: 0.32, dur: 0.42, vol: 0.09, cut0: 3500, cut1: 300, q: 6 });
        voice({ wave: "sawtooth", f0: 1110 * jitter, f1: 118, detune: 12, glide: 0.32, dur: 0.42, vol: 0.07, cut0: 3500, cut1: 300, q: 6 });
        voice({ wave: "sine", f0: 160, f1: 45, dur: 0.3, vol: 0.18 });
        noise({ type: "bandpass", f0: 4000, f1: 600, dur: 0.35, vol: 0.06, q: 1.2 });
        break;
      case "err": voice({ wave: "square", f0: 180, f1: 140, dur: 0.14, vol: 0.05, cut0: 900 }); break;
      case "kill": // explosion: deep, not hissy
        noise({ f0: 1400, f1: 90, dur: 0.5, vol: 0.22 });
        voice({ wave: "sine", f0: 110, f1: 35, dur: 0.4, vol: 0.2 });
        break;
      case "hit":
        noise({ f0: 1200, f1: 80, dur: 0.6, vol: 0.3 });
        voice({ wave: "sawtooth", f0: 95, f1: 45, dur: 0.45, vol: 0.1, cut0: 600 });
        break;
      case "item": voice({ wave: "triangle", f0: 700, f1: 1400, dur: 0.2, vol: 0.07 }); voice({ wave: "sine", f0: 1050, f1: 2100, dur: 0.2, vol: 0.03 }); break;
      case "boss": voice({ wave: "sawtooth", f0: 110, f1: 165, dur: 1.2, vol: 0.08, cut0: 900, att: 0.08 }); voice({ wave: "sawtooth", f0: 111, f1: 166, detune: 10, dur: 1.2, vol: 0.06, cut0: 900, att: 0.08 }); break;
      case "buster":
        noise({ f0: 2000, f1: 100, dur: 0.9, vol: 0.25 });
        voice({ wave: "sawtooth", f0: 220, f1: 900, dur: 0.8, vol: 0.07, cut0: 1500, cut1: 4000 });
        voice({ wave: "sine", f0: 90, f1: 30, dur: 0.7, vol: 0.2 });
        break;
      case "clear": voice({ wave: "triangle", f0: 523, f1: 1046, dur: 0.5, vol: 0.08 }); voice({ wave: "triangle", f0: 659, f1: 1318, dur: 0.5, vol: 0.05 }); break;
      case "steal": voice({ wave: "square", f0: 320, f1: 160, dur: 0.25, vol: 0.04, cut0: 1500 }); break;
    }
  } catch (e) {}
}
