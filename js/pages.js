"use strict";
/* =====================================================================
 *  LEADERBOARD
 * ===================================================================== */
let lbData = null, lbDiff = "Normal";
async function loadLeaderboard(force) {
  const body = $("#lb-body");
  if (!CFG.APPS_SCRIPT_URL) { body.innerHTML = '<p class="muted">The leaderboard is not set up yet.</p>'; return; }
  if (!lbData || force) {
    body.innerHTML = '<p class="muted">Loading…</p>';
    try { lbData = await api({ action: "leaderboard" }, "GET", 15000); if (!lbData.ok) throw new Error(lbData.error); }
    catch (e) { lbData = null; body.innerHTML = '<p class="err">Can\'t load the leaderboard right now. Please try again later.</p>'; return; }
  }
  $("#lb-note").textContent = `Only nicknames are shown. Ranked by typing speed (WPM); accuracy must be at least ${lbData.minAccuracy}%. The week starts on Monday.`;
  renderLeaderboard();
}
function renderLeaderboard() {
  $$("#lb-seg button").forEach(b => b.classList.toggle("active", b.dataset.d === lbDiff));
  if (lbDiff === "Classes") return renderClassBattle();
  $("#lb-note").textContent = `Only nicknames are shown. Ranked by typing speed (WPM); accuracy must be at least ${lbData.minAccuracy}%. The week starts on Monday.`;
  const board = (lbData.boards || {})[lbDiff] || { week: [], all: [] };
  const table = (title, rows) => `<div class="card"><h3>${title}</h3>${rows.length ? `<table><thead><tr><th>#</th><th>Nickname</th><th class="num">WPM</th><th class="num">Accuracy</th><th class="num">Date</th></tr></thead><tbody>` +
    rows.map((r, i) => `<tr><td class="rank r${i + 1}">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td><td class="nick">${esc(r.nickname)}${r.level ? ` <span class="lv small">LV${r.level}</span>` : ""}${r.title && BADGE_BY_ID[r.title] ? `<span class="title-chip">${BADGE_BY_ID[r.title].icon} ${esc(BADGE_BY_ID[r.title].name)}</span>` : ""}</td><td class="num"><b>${r.wpm}</b></td><td class="num">${r.acc}%</td><td class="num muted">${fmtDate(r.time)}</td></tr>`).join("") +
    `</tbody></table>` : '<p class="muted">No scores yet — be the first!</p>'}</div>`;
  $("#lb-body").innerHTML = table("THIS WEEK", board.week) + table("ALL TIME", board.all);
}
function renderClassBattle() {
  const cb = lbData.classBattle || { week: [] };
  const rows = cb.week || [];
  const max = Math.max(1, ...rows.map(r => r.kills));
  $("#lb-note").textContent = "Class Battle: every enemy destroyed this week (solo and multiplayer) counts for your class. The week starts on Monday.";
  $("#lb-body").innerHTML = `<div class="card" style="grid-column:1/-1"><h3>⚔️ CLASS BATTLE — THIS WEEK</h3>
    ${cb.lastChampion ? `<p class="small">👑 Last week's champion: <b class="lv">${esc(cb.lastChampion.cls)}</b> with ${cb.lastChampion.kills} enemies destroyed</p>` : ""}
    ${rows.length ? rows.map((r, i) => `<div class="cb-row" title="${esc(r.cls)}: ${r.kills} enemies destroyed by ${r.pilots} pilots in ${r.games} games">
      <span class="rank ${r.kills > 0 ? "r" + (i + 1) : ""}">${r.kills > 0 && i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span><span class="cls">${esc(r.cls)}</span>
      <div class="track"><div class="fill" style="width:${(100 * r.kills / max).toFixed(1)}%"></div></div>
      <span class="num small"><b>${r.kills}</b> kills · ${r.pilots} 👤</span></div>`).join("") : '<p class="muted">No battles yet this week — be the first!</p>'}
  </div>`;
}
$$("#lb-seg button").forEach(b => b.onclick = () => { lbDiff = b.dataset.d; if (lbData) renderLeaderboard(); });
$("#btn-lb-refresh").onclick = () => loadLeaderboard(true);

/* =====================================================================
 *  TEACHER DASHBOARD  (password is checked by Apps Script)
 * ===================================================================== */
let tData = null, tSort = { key: "cls", dir: 1 };
function teacherInit() {
  const pw = store.sget("mst_tpw", null);
  if (tData) return renderTeacher();
  $("#t-login").style.display = ""; $("#t-dash").style.display = "none";
  if (pw) teacherLoad(pw);
}
$("#t-form").addEventListener("submit", (e) => { e.preventDefault(); teacherLoad($("#t-pass").value); });
async function teacherLoad(pw) {
  const msg = $("#t-msg");
  if (!CFG.APPS_SCRIPT_URL) { msg.textContent = "Not set up yet: paste the Apps Script URL into config.js."; return; }
  msg.className = "muted"; msg.textContent = "Checking…";
  try {
    const r = await api({ action: "teacher", password: pw }, "POST", 30000);
    if (!r.ok) { msg.className = "err"; msg.textContent = r.error === "wrong_password" ? "Wrong password." : "Error: " + r.error; store.sset("mst_tpw", null); return; }
    store.sset("mst_tpw", pw); msg.textContent = ""; $("#t-pass").value = "";
    tData = r; renderTeacher();
  } catch (e) { msg.className = "err"; msg.textContent = "Can't reach the server. Please try again."; }
}
$("#btn-t-refresh").onclick = () => { const pw = store.sget("mst_tpw", null); if (pw) { $("#btn-t-refresh").textContent = "LOADING…"; teacherLoad(pw).finally(() => $("#btn-t-refresh").textContent = "REFRESH"); } };
$("#btn-t-logout").onclick = () => { store.sset("mst_tpw", null); tData = null; teacherInit(); };
$("#t-class").onchange = () => renderTeacher();

function renderTeacher() {
  $("#t-login").style.display = "none"; $("#t-dash").style.display = "";
  const d = tData, sel = $("#t-class"), prev = sel.value;
  sel.innerHTML = '<option value="">All classes</option>' + d.classes.map(c => `<option value="${esc(c.cls)}">${esc(c.cls)}</option>`).join("");
  sel.value = d.classes.some(c => c.cls === prev) ? prev : "";
  const cls = sel.value;
  const students = d.students.filter(s => !cls || s.cls === cls);
  const games = students.reduce((a, s) => a + s.games, 0);
  const played = d.classes.filter(c => c.games > 0);
  const scope = cls ? d.classes.find(c => c.cls === cls) : null;
  const avgWpm = scope ? scope.avgWpm : (played.length ? Math.round(played.reduce((a, c) => a + c.avgWpm * c.games, 0) / Math.max(1, played.reduce((a, c) => a + c.games, 0)) * 10) / 10 : 0);
  $("#t-kpis").innerHTML = [
    [games, "Games played"], [students.length, "Students"], [avgWpm, "Average WPM"],
    [students.length ? Math.max(...students.map(s => s.bestWpm)) : 0, "Best WPM"],
  ].map(([v, l]) => `<div class="stat"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");

  const maxW = Math.max(1, ...d.classes.map(c => c.avgWpm));
  $("#t-class-bars").innerHTML = d.classes.map(c => `<div class="bar-row" title="${esc(c.cls)}: ${c.avgWpm} WPM average over ${c.games} games">
      <span class="name">${esc(c.cls)}</span><div class="track"><div class="fill" style="width:${(100 * c.avgWpm / maxW).toFixed(1)}%;${cls && c.cls !== cls ? "opacity:.35" : ""}"></div></div><span class="val">${c.games ? c.avgWpm + " WPM" : "—"}</span></div>`).join("");
  $("#t-class-table").innerHTML = `<thead><tr><th>Class</th><th class="num">Students</th><th class="num">Games</th><th class="num">Avg WPM</th><th class="num">Avg best WPM</th><th class="num">Avg accuracy</th></tr></thead><tbody>` +
    d.classes.map(c => `<tr><td>${esc(c.cls)}</td><td class="num">${c.students}</td><td class="num">${c.games}</td><td class="num">${c.avgWpm}</td><td class="num">${c.avgBestWpm}</td><td class="num">${c.games ? c.avgAcc + "%" : "—"}</td></tr>`).join("") + "</tbody>";

  const mist = cls ? (scope ? scope.topMistakes : []) : d.allMistakes;
  $("#t-mist-title").textContent = `TOP 20 MISTYPED WORDS — ${cls || "ALL CLASSES"}`;
  const maxM = Math.max(1, ...mist.map(m => m.count));
  $("#t-mistakes").innerHTML = mist.length ? mist.map(m => `<div class="bar-row" title="${esc(m.word)}: mistyped ${m.count} times"><span class="name">${esc(m.word)}</span><div class="track"><div class="fill" style="width:${(100 * m.count / maxM).toFixed(1)}%;background:#b08cff"></div></div><span class="val">${m.count}×</span></div>`).join("") : '<p class="muted">No data yet.</p>';

  $("#t-stu-title").textContent = `STUDENTS — ${cls || "ALL CLASSES"} (best result & improvement)`;
  const cols = [
    ["cls", "Class"], ["seat", "Seat", 1], ["name", "Name"], ["nickname", "Nickname"], ["games", "Games", 1], ["bestWpm", "Best WPM", 1],
    ["bestAcc", "Acc. (best)", 1], ["firstAvg", "First 3 avg", 1], ["recentAvg", "Latest 3 avg", 1], ["improvement", "Improvement", 1], ["avgAcc", "Avg acc.", 1], ["lastPlayed", "Last played", 1],
  ];
  const sorted = students.slice().sort((a, b) => {
    const k = tSort.key;
    let x = a[k], y = b[k];
    if (k === "seat") { x = Number(x) || 0; y = Number(y) || 0; }
    if (x == null) x = -Infinity; if (y == null) y = -Infinity;
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return (r || (Number(a.seat) - Number(b.seat)) || String(a.cls).localeCompare(String(b.cls))) * tSort.dir;
  });
  $("#t-students").innerHTML = `<thead><tr>${cols.map(([k, l, n]) => `<th class="sortable ${n ? "num" : ""}" data-k="${k}">${l}${tSort.key === k ? (tSort.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead><tbody>` +
    (sorted.length ? sorted.map(s => `<tr><td>${esc(s.cls)}</td><td class="num">${esc(s.seat)}</td><td>${esc(s.name)}</td><td class="muted">${esc(s.nickname)}</td><td class="num">${s.games}</td>
      <td class="num"><b>${s.bestWpm}</b> <span class="muted small">${esc((s.bestDifficulty || "")[0] || "")}</span></td><td class="num">${s.bestAcc}%</td><td class="num">${s.firstAvg}</td><td class="num">${s.recentAvg}</td>
      <td class="num">${s.improvement == null ? '<span class="muted">—</span>' : s.improvement > 0 ? `<span class="up">▲ +${s.improvement}</span>` : s.improvement < 0 ? `<span class="down">▼ ${s.improvement}</span>` : "0"}</td>
      <td class="num">${s.avgAcc}%</td><td class="num muted">${fmtDate(s.lastPlayed)}</td></tr>`).join("") : `<tr><td colspan="${cols.length}" class="muted">No games yet.</td></tr>`) + "</tbody>";
  $$("#t-students th.sortable").forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    tSort = { key: k, dir: tSort.key === k ? -tSort.dir : (["cls", "name", "nickname", "seat"].includes(k) ? 1 : -1) };
    renderTeacher();
  });
}


/* =====================================================================
 *  MAIN LOOP
 * ===================================================================== */
let last = performance.now();
const camTarget = new V3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!renderer || mode === "idle" || document.hidden) return;
  const t = now / 1000;
  const speed = mode === "game" && !G.paused ? (G.me && G.me.freezeT > 0 ? 8 : 40) : 4;
  const a = stars.geometry.attributes.position;
  for (let i = 2; i < a.array.length; i += 3) { a.array[i] += speed * dt; if (a.array[i] > 25) a.array[i] -= 460; }
  a.needsUpdate = true;
  planet.rotation.y += dt * 0.01;

  updateEnvironment(dt, speed);
  if (mode === "game" && G.running) {
    // FINAL BLOW slow motion when a boss goes down
    const slow = G.slowmo > 0 ? 0.18 : 1;
    if (G.slowmo > 0) G.slowmo = Math.max(0, G.slowmo - dt);
    if (!G.paused && !G.over) update(dt * slow);
    updateEffects(G.paused ? 0 : dt * slow);
    // camera sits high behind the mechs so enemies stay visible above their heads
    const portrait = camera.aspect < 0.8, n = G.players.length;
    camera.position.set(0, (portrait ? 7.6 : 6.3) + (n - 1) * 1.0, (portrait ? 17 : 12.5) + (n - 1) * (portrait ? 6 : 3.5));
    if (G.shake > 0) camera.position.add(new V3((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake, 0));
    camTarget.set(0, portrait ? 5.2 : 4.4, -40);
    if (G.slowmo > 0 && G.slowFocus) {
      const k = Math.sin(Math.min(1, (1.5 - G.slowmo) / 1.5) * Math.PI) * 0.55; // rush in and back out
      camera.position.lerp(G.slowFocus.clone().add(new V3(0, 3, 32)), k);
      camTarget.lerp(G.slowFocus, k);
    }
    camera.lookAt(camTarget);
    positionTags();
  } else {
    updateEffects(dt);
    const narrow = window.innerWidth <= 900;
    camera.position.set(0, 2.3, narrow ? 13 : 8.6);
    camTarget.set(0, narrow ? -1.6 : 1.9, 0);
    camera.lookAt(camTarget);
    if (previewMech) {
      previewMech.rotation.y = Math.sin(t * 0.4) * 0.9 + 0.35;
      previewMech.position.y = narrow ? 0.9 : 0;
      // show off: aim and fire now and then
      const cyc = t % 6;
      if (cyc > 3 && cyc < 5) MODELS.aimMech(previewMech, previewAnim, new V3(Math.sin(t) * 3, 3, 12).applyMatrix4(previewMech.matrixWorld));
      else MODELS.aimMech(previewMech, previewAnim, null);
      if (cyc > 3.4 && cyc < 5 && Math.random() < 0.08) MODELS.fireMech(previewAnim, Math.random() < 0.3);
      MODELS.animateMech(previewMech, previewAnim, dt);
    }
  }
  renderer.render(scene, camera);
}

/* =====================================================================
 *  BOOT
 * ===================================================================== */
applyQuality();
addEventBank();
setEnvironment("deep", activeEvent() ? activeEvent().id : null);
setPreviewMech((wallet() && wallet().selected) || "starter", profile().skin);
goPlayHome();
requestAnimationFrame(frame);
loadRemoteConfig().then(() => { if (S.currentScreen === "scr-login") showLogin(); });
if (isSchool()) flushPending();
window.addEventListener("online", flushPending);
// test hook (used by automated tests only)
window.__MST = { G, S, get NET() { return NET; }, startGame, handleChar, onGoogleCredential, requestItem, requestSpecial, MODELS };
