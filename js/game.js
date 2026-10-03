"use strict";
/* =====================================================================
 *  GAME ENGINE
 *  role "solo"   : single player, runs everything locally
 *  role "host"   : multiplayer host, runs the simulation and broadcasts events
 *  role "client" : multiplayer guest, shows the host's events and sends claims
 *  Every change to the shared world goes through emit(event) -> applyEvent(event)
 * ===================================================================== */
const G = { players: [], targets: [], running: false };
const typer = $("#typer");

/* ---------- word decks: shuffled bags, so words don't repeat until the bag is empty ---------- */
function makeDeck(list) {
  return { list, bag: [], draw(avoid) {
    for (let tries = 0; tries < 2; tries++) {
      if (!this.bag.length) { this.bag = this.list.slice(); for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; } }
      for (let i = this.bag.length - 1; i >= Math.max(0, this.bag.length - 40); i--) {
        const w = this.bag[i];
        if (!avoid.words.has(w) && !avoid.first.has(w[0])) { this.bag.splice(i, 1); return w; }
      }
      for (let i = this.bag.length - 1; i >= 0; i--) if (!avoid.words.has(this.bag[i])) return this.bag.splice(i, 1)[0];
      this.bag = [];
    }
    return this.list[Math.floor(Math.random() * this.list.length)];
  } };
}
function makeDecks(bankId) {
  const words = (WORD_BANKS[bankId] || WORD_BANKS.everyday).words.slice().sort((a, b) => a.length - b.length);
  const n = words.length, third = Math.ceil(n / 3);
  let missile = words.filter(w => w.length <= 5);
  if (missile.length < 15) missile = WORD_BANKS.everyday.words.filter(w => w.length <= 5);
  return { short: makeDeck(words.slice(0, third)), mid: makeDeck(words.slice(third, 2 * third)), long: makeDeck(words.slice(2 * third)), missile: makeDeck(missile) };
}
function drawWord(kind) {
  const alive = G.targets.filter(t => t.alive);
  return G.decks[kind].draw({ words: new Set(alive.map(t => t.word)), first: new Set(alive.map(t => t.word[0])) });
}

/* ---------- helpers ---------- */
function player(pid) { return G.players.find(p => p.pid === pid); }
function isAuthority() { return G.role !== "client"; }
function nPlayers() { return G.players.length; }
function stageFactor() { return Math.max(0.5, Math.pow(0.92, G.stage - 1)); }
function killsGoal() { return Math.round((G.diff.kills + 2 * G.stage) * (1 + 0.5 * (nPlayers() - 1))); }
function speedFactor(t) { const v = player(t.victim); if (!v) return 1; return v.freezeT > 0 ? 0 : v.slowT > 0 ? 0.5 : 1; }

/* ---------- setup ---------- */
function makePlayer(info, idx, n) {
  const mech = MECH_BY_ID[info.mech] || MECHS[0];
  const mesh = MODELS.buildMech(mech, SKIN_BY_ID[info.skin]);
  mesh.rotation.y = Math.PI; mesh.scale.setScalar(0.85);
  const x = n > 1 ? (idx - (n - 1) / 2) * 7 : 0;
  mesh.position.set(x, 0, 0);
  scene.add(mesh);
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 14), MODELS.GLOW(0x8fe3ff, 0.1));
  shieldMesh.position.set(x, 2, 0); shieldMesh.visible = false; scene.add(shieldMesh);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(2.9, 20, 14), new THREE.MeshBasicMaterial({ color: 0x3ad0ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.position.set(x, 2, 0); aura.visible = false; scene.add(aura);
  const p = { pid: info.pid, nick: info.nick || "Pilot", cls: info.cls || "", mech, mesh, shieldMesh, aura, anim: MODELS.newAnim(), x, color: PCOLORS[idx % 4],
    hp: mech.hp, maxHp: mech.hp, shield: false, freezeT: 0, slowT: 0, items: { bomb: 0, freeze: 0, shield: 0 },
    score: 0, kills: 0, alive: true, left: false, wpm: 0, acc: 100, assigned: 0, aimAt: null, aimT: 0 };
  if (n > 1) {
    p.tagEl = document.createElement("div"); p.tagEl.className = "ptag";
    p.tagEl.style.borderColor = p.color; p.tagEl.style.color = p.color;
    $("#labels").appendChild(p.tagEl);
  }
  return p;
}

function clearWorld() {
  for (const t of (G.targets || [])) { if (t.el) t.el.remove(); if (t.mesh) scene.remove(t.mesh); }
  for (const p of (G.players || [])) { scene.remove(p.mesh); scene.remove(p.shieldMesh); scene.remove(p.aura); if (p.tagEl) p.tagEl.remove(); }
  G.targets = []; G.byId = {}; G.players = []; G.boss = null;
  $("#labels").innerHTML = "";
  $("#bossbar").classList.remove("show");
}

function startGame(opts) {
  clearWorld();
  const n = opts.players.length;
  Object.assign(G, {
    running: true, mode: opts.mode, role: opts.role, myPid: opts.myPid, diffName: opts.diff, diff: DIFF[opts.diff] || DIFF.Normal,
    bank: WORD_BANKS[opts.bank] ? opts.bank : "everyday", stagesLimit: Number(opts.stages) || 0,
    decks: makeDecks(opts.bank), targets: [], byId: {}, nextId: 1, lock: null,
    stage: 1, phase: "intro", phaseT: 0, spawnT: 0, stageKills: 0, boss: null,
    combo: 0, maxCombo: 0, charge: 0, correct: 0, keystrokes: 0, mistakes: {}, time: 0, activeTime: 0,
    paused: false, over: false, myKills: 0, myBosses: 0, coins: 0, shake: 0, perfT: 0, perfN: 0, perfChecked: false,
    snapT: 0, statsT: 0, bossOrder: null, level: Number(opts.level) || 1, event: opts.event || "", eventMult: opts.event && EVENTS[opts.event] ? EVENTS[opts.event].bonus : 1,
    revenge: opts.mode === "solo" ? revengeList() : {}, revengeKills: 0, comboTier: 0, slowmo: 0,
  });
  G.players = opts.players.map((pi, i) => makePlayer(pi, i, n));
  G.me = player(G.myPid);
  document.body.classList.add("playing");
  document.body.classList.toggle("multi", G.mode === "multi");
  $$(".screen").forEach(s => s.classList.remove("show"));
  S.currentScreen = "game";
  const sp = G.me.mech.special;
  $("#special-btn").style.display = sp ? "" : "none";
  setEnvironment(S.prefs.bg && BACKGROUNDS.some(b => b.id === S.prefs.bg && b.level <= myLevel()) ? S.prefs.bg : "deep", G.event);
  render3DMode(); resize(); focusTyper();
  updateHud(); setComboTier(0);
  Music.start();
  if (isAuthority()) beginStage(1);
}

/* =====================================================================
 *  EVENTS (applied on every machine)
 * ===================================================================== */
function emit(ev) {
  applyEvent(ev);
  if (G.role === "host") netBroadcast(ev);
}

function applyEvent(ev) {
  if (!G.running && ev.e !== "over") return;
  switch (ev.e) {
    case "phase": onPhase(ev); break;
    case "spawn": createTarget(ev); break;
    case "kill": onKill(ev); break;
    case "bossHit": onBossHit(ev); break;
    case "bossDown": onBossDown(ev); break;
    case "hit": onHit(ev); break;
    case "pstate": onPState(ev); break;
    case "fx": onFx(ev); break;
    case "prog": onProg(ev); break;
    case "snap": onSnap(ev); break;
    case "over": onOver(ev); break;
  }
}

function onPhase(ev) {
  G.phase = ev.phase; G.stage = ev.stage; G.phaseT = ev.t || 0;
  if (ev.phase === "intro") { G.stageKills = 0; showMsg(`STAGE ${ev.stage}`, ev.msg || ""); }
  else if (ev.phase === "bossIntro") { showMsg("WARNING", "BOSS APPROACHING", true); sfx("boss"); }
  else if (ev.phase === "clear") { showMsg("STAGE CLEAR!", ev.msg || ""); sfx("clear"); for (const p of G.players) if (p.alive) p.anim.victory = 1.6; }
  else hideMsg();
  updateHud();
}

function createTarget(ev) {
  const t = { id: ev.id, kind: ev.kind, type: ev.type, word: ev.word, victim: ev.victim, travel: ev.travel, wob: ev.wob || 0,
    progress: 0, typed: 0, alive: true, others: {}, pos: new V3(), lastX: 0 };
  if (ev.kind === "boss") {
    t.mesh = MODELS.buildBoss(ev.bossIdx);
    t.mesh.position.set(0, 9, -150);
    G.boss = { id: ev.id, hp: ev.hp, maxHp: ev.hp, enter: 0, atkT: ev.atk || 5, attack: 0, name: t.mesh.userData.def.name, kind: t.mesh.userData.def.kind, target: t };
    $("#bossbar").classList.add("show");
    $("#boss-name").textContent = `STAGE ${G.stage} BOSS — ${G.boss.name} (${G.boss.kind})`;
  } else {
    t.mesh = ev.kind === "missile" ? buildMissile() : MODELS.buildEnemy(ev.type);
    if (ev.elite) {
      t.elite = true;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), MODELS.GLOW(0xffd54a, 0.22)); glow.position.y = 2.2; t.mesh.add(glow);
    }
    t.start = new V3().fromArray(ev.s); t.end = new V3().fromArray(ev.en);
    t.mesh.position.copy(t.start);
    t.lastX = t.start.x;
  }
  scene.add(t.mesh);
  makeTag(t);
  G.targets.push(t); G.byId[t.id] = t;
  updateHud();
}

function removeTarget(t) {
  if (!t || !t.alive) return;
  t.alive = false;
  if (t.el) t.el.remove();
  if (t.kind !== "boss") scene.remove(t.mesh);
  const i = G.targets.indexOf(t); if (i >= 0) G.targets.splice(i, 1);
  delete G.byId[t.id];
  if (G.lock === t) G.lock = null;
}

function targetPoint(t) {
  if (t.kind === "boss") return t.mesh.position.clone().add(new V3(0, 0, (t.mesh.userData.front || 4) * 0.6));
  return t.mesh.position.clone().add(new V3(0, t.kind === "missile" ? 0 : 2.6, 0));
}
function muzzlePos(p) { const v = new V3(); if (p && p.mesh) p.mesh.userData.rig.muzzle.getWorldPosition(v); return v; }
function shootFx(p, t, big) {
  if (!p || !t) return;
  MODELS.aimMech(p.mesh, p.anim, targetPoint(t));
  MODELS.fireMech(p.anim, big);
  p.aimAt = t; p.aimT = 1.2;
  beam(muzzlePos(p), targetPoint(t), big ? (p.pid === G.myPid ? 0xffe066 : 0xff9ad5) : 0x6fe8ff, big ? 0.18 : 0.05, big ? 0.22 : 0.08);
}

function explodeTarget(t) {
  const col = t.kind === "missile" ? 0xffaa44 : ({ short: 0xffcc66, mid: 0x7dff9a, long: 0xc58bff })[(MODELS.ENEMY_TYPES[t.type] || {}).size] || 0xff8844;
  explode(targetPoint(t), col, t.kind === "enemy" && MODELS.ENEMY_TYPES[t.type].size === "long" ? 70 : 45, 0.3, 9);
  sfx("kill");
}

function onKill(ev) {
  const t = G.byId[ev.id]; if (!t) return;
  const p = player(ev.by);
  if (p) { p.score += ev.pts || 0; if (t.kind === "enemy") p.kills++; }
  if (p && ev.how === "type" && !(ev.by === G.myPid && t.myShot)) shootFx(p, t, true);
  const screen = project(t.pos);
  explodeTarget(t);
  if (screen && t.kind !== "boss") showMeaning(t.word, screen.x, screen.y + 26);
  if (t.kind === "enemy") G.stageKills++;
  if (ev.by === G.myPid) {
    G.coins += ev.coins || 0;
    if (t.kind === "enemy") G.myKills++;
    if (screen && ev.coins) floater(screen.x, screen.y, `+${ev.coins} 🪙`);
    if (t.elite && ev.how === "type") { G.revengeKills++; delete G.revenge[t.word]; if (screen) floater(screen.x, screen.y - 46, "⭐ REVENGE!", "#ffd54a"); }
    if (ev.drop) { sfx("item"); if (screen) floater(screen.x, screen.y - 26, `+${ITEM_ICON[ev.drop]} ${ev.drop.toUpperCase()}`, "#8fe3ff"); }
  } else if (p && G.mode === "multi" && (t.myShot || t.typed > 0)) {
    if (screen) floater(screen.x, screen.y - 20, `STOLEN by ${p.nick}!`, p.color);
    sfx("steal");
  }
  removeTarget(t);
  updateHud();
}

function onBossHit(ev) {
  const b = G.boss; if (!b || b.id !== ev.id) return;
  const p = player(ev.by), t = b.target;
  if (p) { p.score += ev.pts || 0; if (!(ev.by === G.myPid && t.myShot)) shootFx(p, t, true); }
  if (p && G.mode === "multi" && ev.by !== G.myPid && t.typed > 0) { const sc = project(t.pos); if (sc) floater(sc.x, sc.y - 20, `${p.nick} hit the boss first!`, p.color); }
  b.hp = ev.hp;
  { const sc = project(t.pos); if (sc) showMeaning(t.word, sc.x, sc.y + 30); }
  explode(targetPoint(t).add(new V3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2, 0)), 0xff8844, 50, 0.45, 10);
  sfx("kill");
  t.word = ev.word; t.typed = 0; t.myShot = false; t.pending = false; t.others = {};
  if (G.lock === t) G.lock = null;
  t.el.classList.remove("locked", "pending");
  renderTag(t, true);
  updateHud();
}

function onBossDown(ev) {
  const b = G.boss; if (!b) return;
  const p = player(ev.by);
  if (p) { p.score += ev.pts || 0; shootFx(p, b.target, true); }
  const mesh = b.target.mesh;
  // FINAL BLOW: slow motion, camera rushes in, then the boss explodes
  G.slowmo = 1.5; G.slowFocus = mesh.position.clone();
  $("#slowmo-text").classList.add("show"); setTimeout(() => $("#slowmo-text").classList.remove("show"), 1500);
  { const sc = project(b.target.pos); if (sc) showMeaning(b.target.word, sc.x, sc.y + 30); }
  sfx("boss");
  for (let i = 0; i < 9; i++) setTimeout(() => explode(mesh.position.clone().add(new V3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6, 2)), i % 2 ? 0xffcc44 : 0xff5533, 110, 0.8, 16), 1500 + i * 130);
  setTimeout(() => { sfx("buster"); scene.remove(mesh); }, 2300);
  for (const t of G.targets.slice()) if (t.kind === "missile") { explodeTarget(t); removeTarget(t); }
  removeTarget(b.target);
  G.boss = null;
  $("#bossbar").classList.remove("show");
  if (G.me.alive) { G.myBosses++; G.coins += Math.round((ev.bonus || 0) * (G.me.mech.coinMult || 1) * G.eventMult); }
  updateHud();
}

function onHit(ev) {
  const t = G.byId[ev.id], v = player(ev.victim);
  if (t) { explode(t.mesh.position.clone().add(new V3(0, t.kind === "missile" ? 0 : 2, 0)), t.kind === "missile" ? 0xff7744 : 0xff5555, 40, 0.35, 8); removeTarget(t); }
  if (!v) return;
  v.hp = ev.hp; v.shield = ev.shield;
  if (ev.blocked || ev.dead) { if (v.pid === G.myPid && ev.blocked && !ev.dead) floater(window.innerWidth / 2, window.innerHeight * 0.6, "SHIELD BLOCKED!", "#8fe3ff"); return; }
  v.anim.hit = 1;
  if (v.pid === G.myPid) {
    G.combo = 0; if (G.comboTier) setComboTier(0); if (G.me.mech.special && G.charge < G.me.mech.special.charge) G.charge = 0;
    G.shake = 0.45; sfx("hit");
    const f = $("#flash"); f.classList.add("on"); setTimeout(() => f.classList.remove("on"), 60);
  }
  if (v.hp <= 0) killPlayer(v);
  updateHud();
}

function killPlayer(v) {
  if (!v.alive && !v.mesh.visible) return;
  v.alive = false;
  if (v.left) { v.mesh.visible = false; v.shieldMesh.visible = false; return; }
  explode(v.mesh.position.clone().add(new V3(0, 2, 0)), 0xff6633, 120, 0.6, 12);
  setTimeout(() => { v.mesh.visible = false; v.shieldMesh.visible = false; }, 250);
  if (v.pid === G.myPid) { releaseLock(); if (G.mode === "multi") showMsg("MECH DESTROYED", "Spectating — your teammates fight on!", true); }
}

function onPState(ev) {
  const p = player(ev.pid); if (!p) return;
  for (const k of ["hp", "maxHp", "shield", "freezeT", "slowT", "score", "kills", "left"]) if (k in ev) p[k] = ev[k];
  if (ev.items) p.items = ev.items;
  if ("alive" in ev && !ev.alive && p.mesh.visible) killPlayer(p);
  updateHud();
}

const ITEM_ICON = { bomb: "💣", freeze: "❄️", shield: "🛡️" };
function onFx(ev) {
  const p = player(ev.pid); if (!p) return;
  if (ev.kind === "special") {
    MODELS.fireMech(p.anim, true); p.anim.special = Math.max(4, ev.secs || 0);
    for (const id of ev.ids || []) { const t = G.byId[id]; if (t) beam(muzzlePos(p), targetPoint(t), 0xfff2a8, 0.5, 0.5); }
    if (ev.boss && G.boss) beam(muzzlePos(p), targetPoint(G.boss.target), 0xfff2a8, 0.9, 0.6);
    G.shake = Math.max(G.shake, 0.3); sfx("buster");
    if (p.pid !== G.myPid && G.mode === "multi") floater(window.innerWidth / 2, 150, `${p.nick}: ${p.mech.name} SPECIAL!`, p.color);
  } else if (ev.kind === "bomb") {
    if (p.pid === G.myPid) { const f = $("#flash"); f.style.background = "rgba(255,255,255,.7)"; f.classList.add("on"); setTimeout(() => { f.classList.remove("on"); setTimeout(() => f.style.background = "", 400); }, 80); }
    sfx("buster");
  } else if (ev.kind === "fool") {
    floater(window.innerWidth / 2, window.innerHeight * 0.3, "🤡 APRIL FOOL! That one is coming back!", "#ffcc33");
    sfx("steal");
  } else sfx("item");
}

function onProg(ev) {
  if (ev.pid === G.myPid) return;
  const t = G.byId[ev.id], p = player(ev.pid);
  if (!t || !p) return;
  if (ev.n > 0) t.others[ev.pid] = ev.n; else delete t.others[ev.pid];
  renderTag(t);
  if (ev.n > 0) { MODELS.aimMech(p.mesh, p.anim, targetPoint(t)); MODELS.fireMech(p.anim, false); p.aimAt = t; p.aimT = 1.2; beam(muzzlePos(p), targetPoint(t), 0x6fe8ff, 0.04, 0.07); }
}

function onSnap(ev) {
  for (const [id, prog] of ev.p) { const t = G.byId[id]; if (t) { t.netP = prog; t.netAt = G.time; } }
  if (ev.b && G.boss) G.boss.enter = Math.max(G.boss.enter, ev.b);
}

/* =====================================================================
 *  AUTHORITY (solo + host): spawning, hits, scoring, phases
 * ===================================================================== */
function setPhase(phase, t, msg) { emit({ e: "phase", phase, stage: G.stage, t: t || 0, msg: msg || "" }); }

function beginStage(n) {
  G.stage = n; G.stageKills = 0;
  for (const p of G.players) if (p.alive && p.mech.startShield && !p.shield) { p.shield = true; emitPState(p); }
  const rv = Object.keys(G.revenge || {}).length;
  setPhase("intro", 2.2, `Destroy ${killsGoal()} enemies` + (nPlayers() === 1 && rv ? ` · ⭐ ${rv} revenge words are waiting!` : ""));
}

function emitPState(p) {
  emit({ e: "pstate", pid: p.pid, hp: p.hp, maxHp: p.maxHp, shield: p.shield, freezeT: p.freezeT, slowT: p.slowT, items: Object.assign({}, p.items), alive: p.alive, score: p.score, kills: p.kills, left: p.left });
}

function pickVictim() {
  const alive = G.players.filter(p => p.alive);
  if (!alive.length) return null;
  const min = Math.min(...alive.map(p => p.assigned));
  const c = alive.filter(p => p.assigned === min);
  const v = c[Math.floor(Math.random() * c.length)];
  v.assigned++;
  return v;
}

function spawnEnemy(forceWord, forceType) {
  const v = pickVictim(); if (!v) return;
  const d = G.diff, r = Math.random();
  const size = forceType ? MODELS.ENEMY_TYPES[forceType].size : r < d.drone ? "short" : r < d.drone + d.heavy ? "long" : "mid";
  const types = MODELS.ENEMY_SIZES[size];
  const type = forceType || types[Math.floor(Math.random() * types.length)];
  let word = forceWord || drawWord(size), elite = false;
  const rv = Object.keys(G.revenge || {}).filter(w => !G.targets.some(t => t.word === w || t.word[0] === w[0]));
  if (!forceWord && G.mode === "solo" && rv.length && Math.random() < 0.3) { word = rv[Math.floor(Math.random() * rv.length)]; elite = true; }
  const n = nPlayers();
  const range = Math.min(40, Math.max(13, camera.aspect * 24)) * (n > 1 ? 1.3 : 1);
  let x = 0;
  for (let i = 0; i < 8; i++) {
    x = (n > 1 ? v.x * 2.2 : 0) + (Math.random() * 2 - 1) * range;
    if (!G.targets.some(t => t.kind === "enemy" && t.progress < 0.3 && Math.abs(t.start.x - x) < range * 0.25)) break;
  }
  const y = 2 + Math.random() * (camera.aspect < 0.8 ? 18 : 6);
  const travel = d.travel * stageFactor() * (size === "long" ? 1.3 : size === "short" ? 0.85 : 1) * (0.9 + Math.random() * 0.2);
  emit({ e: "spawn", id: G.nextId++, kind: "enemy", type, word, elite, victim: v.pid, travel, wob: Math.random() * 6,
    s: [x, y, -95], en: [v.x + (x - v.x) * 0.1, 2.2, 1.5] });
}

function spawnBoss() {
  const n = nPlayers();
  const hp = Math.round((G.diff.bossHp + 2 * (G.stage - 1)) * (1 + 0.5 * (n - 1)));
  if (!G.bossOrder) {
    // bosses unlocked by pilot level (host's level in multiplayer), shuffled
    const normal = MODELS.BOSSES.map((b, i) => b.event ? -1 : i).filter(i => i >= 0).slice(0, bossPoolSize(G.level));
    G.bossOrder = normal; for (let i = normal.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [normal[i], normal[j]] = [normal[j], normal[i]]; }
  }
  const evBoss = G.event ? MODELS.BOSSES.findIndex(b => b.event === G.event) : -1;
  const idx = evBoss >= 0 && G.stage % 2 === 1 ? evBoss : G.bossOrder[Math.floor((G.stage - 1) / (evBoss >= 0 ? 2 : 1)) % G.bossOrder.length];
  emit({ e: "spawn", id: G.nextId++, kind: "boss", bossIdx: idx, word: drawWord("long"), hp, atk: G.diff.bossAtk });
}

function spawnMissile() {
  const b = G.boss; if (!b) return;
  const v = pickVictim(); if (!v) return;
  const start = b.target.mesh.position.clone().add(new V3((Math.random() - 0.5) * 8, -1, 3));
  const travel = G.diff.missileTime * Math.sqrt(stageFactor()) * (v.mech.missileSlow || 1);
  b.attack = 1;
  emit({ e: "spawn", id: G.nextId++, kind: "missile", word: drawWord("missile"), victim: v.pid, travel, wob: Math.random() * 6,
    s: start.toArray(), en: [v.x + (Math.random() - 0.5) * 1.5, 2.4, 1.2] });
}

function resolveKill(id, pid, combo, how) {
  const t = G.byId[id], p = player(pid);
  if (!t || !t.alive || t.kind === "boss" || !p) return false;
  const comboMult = Math.min(2, 1 + (combo || 0) * 0.05);
  const eliteMult = t.elite ? 2 : 1;
  const pts = Math.round(t.word.length * 10 * (how === "type" ? comboMult : 0.5) * G.diff.mult * eliteMult);
  let coins = 0, drop = null;
  if (t.kind === "enemy") {
    coins = Math.max(1, Math.round(Math.ceil(t.word.length / 2) * G.diff.mult * (p.mech.coinMult || 1) * G.eventMult * eliteMult));
    if (how !== "bomb" && Math.random() < 0.08 * (p.mech.dropMult || 1)) {
      const kinds = ["bomb", "freeze", "shield"].filter(k => p.items[k] < 3);
      if (kinds.length) { drop = kinds[Math.floor(Math.random() * kinds.length)]; p.items[drop]++; }
    }
  } else coins = 1;
  emit({ e: "kill", id, by: pid, pts, coins, drop, how });
  if (drop) emitPState(p);
  // April Fools: sometimes a destroyed enemy "comes back to life" (points already counted)
  if (G.event === "aprilfools" && how === "type" && t.kind === "enemy" && !t.elite && Math.random() < 0.15 &&
      !G.targets.some(o => o.alive && o !== t && o.word[0] === t.word[0])) {
    emit({ e: "fx", pid, kind: "fool" });
    spawnEnemy(t.word, t.type);
  }
  return true;
}

function resolveBossHit(pid, combo, word, dmg) {
  const b = G.boss, p = player(pid);
  if (!b || !p || b.enter < 1) return;
  if (word && b.target.word !== word) return; // someone else already finished this word
  b.hp = Math.max(0, b.hp - dmg);
  const comboMult = Math.min(2, 1 + (combo || 0) * 0.05);
  const pts = Math.round(b.target.word.length * 15 * comboMult * G.diff.mult * dmg);
  if (b.hp > 0) { emit({ e: "bossHit", id: b.id, by: pid, pts, hp: b.hp, word: drawWord("long") }); return; }
  emit({ e: "bossDown", id: b.id, by: pid, pts: pts + 500 * G.stage, bonus: Math.round((20 + 10 * G.stage) * G.diff.mult) });
  for (const q of G.players) if (q.alive) { q.hp = Math.min(q.maxHp, q.hp + 1); emitPState(q); }
  const last = G.stagesLimit && G.stage >= G.stagesLimit;
  setPhase("clear", 3.2, last ? "MISSION COMPLETE!" : "+1 ♥ for every pilot");
}

function hitPlayer(t) {
  const v = player(t.victim);
  if (!v || !v.alive) { emit({ e: "hit", id: t.id, victim: t.victim, hp: v ? v.hp : 0, shield: false, dead: true }); return; }
  if (v.shield) { v.shield = false; emit({ e: "hit", id: t.id, victim: v.pid, hp: v.hp, shield: false, blocked: true }); return; }
  v.hp -= 1;
  if (v.hp <= 0) v.alive = false;
  emit({ e: "hit", id: t.id, victim: v.pid, hp: v.hp, shield: false });
  if (!G.players.some(p => p.alive)) gameOver("destroyed");
}

function doItem(pid, k) {
  const p = player(pid);
  if (!p || !p.alive || !(p.items[k] > 0)) return;
  if (G.phase !== "wave" && G.phase !== "boss") return;
  if (k === "shield" && p.shield) return;
  p.items[k]--;
  if (k === "bomb") { emit({ e: "fx", pid, kind: "bomb" }); for (const t of G.targets.slice()) if (t.kind !== "boss" && (G.mode === "solo" || t.victim === pid)) resolveKill(t.id, pid, 0, "bomb"); }
  else if (k === "freeze") { p.freezeT = 5; emit({ e: "fx", pid, kind: "freeze" }); }
  else if (k === "shield") { p.shield = true; emit({ e: "fx", pid, kind: "shield" }); }
  emitPState(p);
}

function doSpecial(pid) {
  const p = player(pid);
  if (!p || !p.alive || !p.mech.special) return;
  if (G.phase !== "wave" && G.phase !== "boss") return;
  const sp = p.mech.special;
  if (sp.type === "blast") {
    const list = G.targets.filter(t => t.kind !== "boss" && (G.mode === "solo" || t.victim === pid)).sort((a, b) => b.progress - a.progress).slice(0, sp.n);
    const ids = list.map(t => t.id);
    const bossDmg = G.boss && G.boss.enter >= 1 && list.length < sp.n ? Math.min(2, sp.n - list.length) : 0;
    emit({ e: "fx", pid, kind: "special", ids, boss: bossDmg > 0, secs: 0 });
    for (const id of ids) resolveKill(id, pid, 0, "special");
    if (bossDmg) resolveBossHit(pid, 0, null, bossDmg);
  } else {
    if (sp.type === "freeze") p.freezeT = sp.secs;
    if (sp.type === "slow") p.slowT = sp.secs;
    if (sp.type === "shield") p.shield = true;
    emit({ e: "fx", pid, kind: "special", ids: [], secs: sp.secs || 0 });
    emitPState(p);
  }
}

function gameOver(reason) {
  if (G.over) return;
  if (G.me) { G.me.wpm = Math.round(currentWpm() * 10) / 10; G.me.acc = currentAcc(); }
  const ranking = G.players.map(p => ({ pid: p.pid, nick: p.nick, cls: p.cls, color: p.color, score: p.score, kills: p.kills, wpm: p.wpm, acc: p.acc, alive: p.alive, left: p.left }))
    .sort((a, b) => b.score - a.score);
  emit({ e: "over", ranking, reason });
}

function tickAuthority(dt) {
  if (G.phase === "intro") { G.phaseT -= dt; if (G.phaseT <= 0) setPhase("wave"); }
  else if (G.phase === "wave") {
    const enemies = G.targets.filter(t => t.kind === "enemy").length;
    if (G.stageKills >= killsGoal()) { if (enemies === 0) setPhase("bossIntro", 2.6); }
    else {
      G.spawnT -= dt;
      const d = G.diff, n = nPlayers(), interval = d.spawn * stageFactor() / Math.pow(n, 0.6);
      const minA = d.minActive + (n - 1), maxA = Math.round(d.maxActive * (1 + 0.6 * (n - 1)));
      const need = G.stageKills + enemies < killsGoal();
      const due = G.spawnT <= 0 || (enemies < minA && G.spawnT <= interval - 0.6);
      if (need && due && enemies < maxA) { spawnEnemy(); G.spawnT = interval; }
    }
  } else if (G.phase === "bossIntro") { G.phaseT -= dt; if (G.phaseT <= 0) { spawnBoss(); setPhase("boss"); } }
  else if (G.phase === "boss") {
    const b = G.boss;
    if (b && b.enter >= 1) {
      b.atkT -= dt;
      if (b.atkT <= 0) {
        spawnMissile();
        const slow = G.players.some(p => p.alive && p.mech.missileSlow) && nPlayers() === 1 ? 1.15 : 1;
        b.atkT = G.diff.bossAtk * Math.sqrt(stageFactor()) * slow / (1 + 0.3 * (nPlayers() - 1));
      }
    }
  } else if (G.phase === "clear") {
    G.phaseT -= dt;
    if (G.phaseT <= 0) { if (G.stagesLimit && G.stage >= G.stagesLimit) gameOver("victory"); else beginStage(G.stage + 1); }
  }
  if (G.role === "host") {
    G.snapT -= dt;
    if (G.snapT <= 0) {
      G.snapT = 0.1;
      netBroadcast({ e: "snap", p: G.targets.filter(t => t.kind !== "boss").map(t => [t.id, Math.round(t.progress * 1000) / 1000]), b: G.boss ? G.boss.enter : 0 });
    }
  }
}

/* =====================================================================
 *  PER-FRAME UPDATE (all roles)
 * ===================================================================== */
function update(dt) {
  G.time += dt;
  const auth = isAuthority();
  for (const p of G.players) { if (p.freezeT > 0) p.freezeT = Math.max(0, p.freezeT - dt); if (p.slowT > 0) p.slowT = Math.max(0, p.slowT - dt); }
  document.body.classList.toggle("frozen", G.me.freezeT > 0);
  document.body.classList.toggle("slowed", G.me.slowT > 0 && !(G.me.freezeT > 0));
  if ((G.phase === "wave" || G.phase === "boss") && G.me.alive) G.activeTime += dt;
  if (auth) tickAuthority(dt);

  const chest = new V3(0, 2.4, 0);
  for (const t of G.targets.slice()) {
    if (t.kind === "boss") {
      const b = G.boss; if (!b) continue;
      b.enter = Math.min(1, b.enter + dt / 2.5);
      b.attack = Math.max(0, b.attack - dt * 1.5);
      const e = b.enter, m = t.mesh;
      m.position.set(Math.sin(G.time * 0.5) * 6 * e, 9 + Math.sin(G.time * 1.3) * 0.8, -150 + (150 - 58) * (1 - Math.pow(1 - e, 3)));
      MODELS.animateBoss(m, dt, G.time, b.attack, chest);
      t.pos.copy(m.position).add(new V3(0, m.userData.top, 0));
      continue;
    }
    const f = speedFactor(t);
    if (auth) t.progress += dt / t.travel * f;
    else if (t.netP != null) {
      const pred = t.netP + (G.time - t.netAt) / t.travel * f;
      t.progress += (pred - t.progress) * Math.min(1, dt * 8);
    } else t.progress += dt / t.travel * f;
    const k = Math.min(1, t.progress);
    t.mesh.position.lerpVectors(t.start, t.end, k);
    if (t.kind === "enemy") {
      t.mesh.position.x += Math.sin(G.time * 1.4 + t.wob) * 1.2 * (1 - k);
      t.mesh.position.y += Math.sin(G.time * 2 + t.wob) * 0.35;
      const v = player(t.victim);
      t.mesh.lookAt(v ? v.x : 0, 2, 6);
      const vx = (t.mesh.position.x - t.lastX) / Math.max(dt, 1e-3); t.lastX = t.mesh.position.x;
      MODELS.animateEnemy(t.mesh, { progress: k, wob: t.wob, vx }, dt, G.time);
    } else {
      t.mesh.position.x += Math.sin(G.time * 3 + t.wob) * 0.6 * (1 - k);
      t.mesh.lookAt(t.end);
    }
    t.pos.copy(t.mesh.position).add(new V3(0, t.mesh.userData.top || 3, 0));
    t.el.classList.toggle("iced", f < 1);
    if (auth && t.progress >= 1) hitPlayer(t);
  }

  // pilots: aim, fire, breathe
  for (const p of G.players) {
    if (!p.mesh.visible) continue;
    let aim = null;
    if (p.pid === G.myPid && G.lock && G.lock.alive) aim = targetPoint(G.lock);
    else if (p.aimAt && p.aimAt.alive && p.aimT > 0) aim = targetPoint(p.aimAt);
    p.aimT = Math.max(0, p.aimT - dt);
    MODELS.aimMech(p.mesh, p.anim, aim);
    MODELS.animateMech(p.mesh, p.anim, dt);
    p.shieldMesh.visible = p.shield && p.alive;
    if (p.aura.visible) { const k = 0.5 + 0.5 * Math.sin(G.time * 6); p.aura.material.opacity = 0.08 + 0.1 * k + G.comboTier * 0.02; p.aura.scale.setScalar(1 + 0.08 * k); p.aura.position.y = 2 + p.mesh.position.y; if (!p.alive) p.aura.visible = false; }
    if (p.shield) p.shieldMesh.rotation.y += dt;
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);

  // pending claims that never got an answer (network hiccup): unlock after 2 s
  for (const t of G.targets) if (t.pending && G.time - t.pendingAt > 2) { t.pending = false; t.typed = 0; t.myShot = false; t.el.classList.remove("pending"); renderTag(t); }

  if (G.role === "client") { G.statsT -= dt; if (G.statsT <= 0) { G.statsT = 2; netSend({ r: "stats", wpm: Math.round(currentWpm() * 10) / 10, acc: currentAcc() }); } }
  if (G.role === "host") { G.me.wpm = Math.round(currentWpm() * 10) / 10; G.me.acc = currentAcc(); }

  if (!G.perfChecked && G.time > 1) {
    G.perfT += dt; G.perfN++;
    if (G.perfT > 4) {
      G.perfChecked = true;
      if (G.perfT / G.perfN > 1 / 32 && S.prefs.quality === "high") { S.prefs.quality = "low"; savePrefs(); applyQuality(); floater(window.innerWidth / 2, 120, "Graphics set to LOW for smoother play", "#8fe3ff"); }
    }
  }
  $("#hud-wpm").textContent = Math.round(currentWpm());
}

/* =====================================================================
 *  TYPING (local player)
 * ===================================================================== */
function threat(t) { return t.kind === "boss" ? 0.2 : t.progress + (t.victim === G.myPid ? 0.3 : 0); }
function handleChar(ch) {
  if (!G.running || G.over || G.paused) return;
  if (ch === " ") return requestSpecial();
  if (ch === "1") return requestItem("bomb");
  if (ch === "2") return requestItem("freeze");
  if (ch === "3") return requestItem("shield");
  if (!/^[a-zA-Z]$/.test(ch)) return;
  if (G.phase !== "wave" && G.phase !== "boss") return;
  if (!G.me.alive) return;
  ch = ch.toLowerCase();
  G.keystrokes++;
  let t = G.lock;
  if (!t) {
    const cands = G.targets.filter(x => x.alive && !x.pending && x.word[0] === ch && !(x.kind === "boss" && G.boss && G.boss.enter < 1));
    if (!cands.length) { miss(null); return; }
    t = cands.reduce((a, b) => threat(b) > threat(a) ? b : a);
    G.lock = t; t.el.classList.add("locked");
  }
  if (t.word[t.typed] === ch) {
    t.typed++; G.correct++; renderTag(t); sfx("key");
    shootFx(G.me, t, false);
    sendProg(t);
    if (t.typed >= t.word.length) completeWord(t);
  } else miss(t);
}

function sendProg(t) {
  if (G.mode !== "multi") return;
  if (G.role === "host") netBroadcast({ e: "prog", pid: G.myPid, id: t.id, n: t.typed });
  else netSend({ r: "prog", id: t.id, n: t.typed });
}

const COMBO_TIERS = [0, 10, 25, 50, 100], COMBO_COLORS = ["#3ad0ff", "#3ad0ff", "#7dff8a", "#ffcc33", "#ff5ef0"];
function setComboTier(tier) {
  G.comboTier = tier;
  Music.setTier(tier);
  const v = $("#combo-veil");
  v.classList.toggle("on", tier > 0);
  v.style.boxShadow = tier > 0 ? `inset 0 0 ${60 + tier * 30}px ${COMBO_COLORS[tier]}` : "none";
  if (G.me && G.me.aura) { G.me.aura.visible = tier > 0; G.me.aura.material.color.set(COMBO_COLORS[tier]); }
}
function comboCheck() {
  let tier = 0; for (let i = 1; i < COMBO_TIERS.length; i++) if (G.combo >= COMBO_TIERS[i]) tier = i;
  if (COMBO_TIERS.includes(G.combo) && G.combo > 0) {
    const el = $("#combo-pop");
    el.textContent = G.combo >= 100 ? `COMBO ×${G.combo}!! LEGENDARY` : `COMBO ×${G.combo}!`;
    el.style.color = COMBO_COLORS[tier]; el.style.textShadow = `0 0 24px ${COMBO_COLORS[tier]}`;
    el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
    sfx("clear"); G.me.anim.victory = 0.6;
  }
  if (tier !== G.comboTier) setComboTier(tier);
}
function showMeaning(word, x, y) {
  if (!S.prefs.meanings || !window.MEANINGS) return;
  const zh = MEANINGS[word]; if (!zh) return;
  const el = document.createElement("div");
  el.className = "floater meaning"; el.textContent = `${word} ${zh}`;
  el.style.left = x + "px"; el.style.top = y + "px"; el.style.transform = "translate(-50%,0)";
  $("#labels").appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function miss(t) {
  G.combo = 0;
  if (G.comboTier) setComboTier(0);
  const sp = G.me.mech.special;
  if (sp && G.charge < sp.charge) G.charge = 0;
  sfx("err");
  if (t) {
    G.mistakes[t.word] = (G.mistakes[t.word] || 0) + 1;
    t.el.classList.remove("shake"); void t.el.offsetWidth; t.el.classList.add("shake");
  }
  updateHud();
}

function releaseLock() {
  const t = G.lock; if (!t) return;
  t.typed = 0; renderTag(t); t.el.classList.remove("locked"); G.lock = null;
  sendProg(t);
}

function completeWord(t) {
  G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
  comboCheck();
  const sp = G.me.mech.special;
  if (sp) G.charge = Math.min(sp.charge, G.charge + 1);
  shootFx(G.me, t, true); t.myShot = true;
  G.lock = null; t.el.classList.remove("locked");
  if (isAuthority()) {
    if (t.kind === "boss") resolveBossHit(G.myPid, G.combo, t.word, 1);
    else resolveKill(t.id, G.myPid, G.combo, "type");
  } else {
    t.pending = true; t.pendingAt = G.time; t.el.classList.add("pending");
    netSend({ r: "claim", id: t.id, combo: G.combo, word: t.word });
  }
  updateHud();
}

function requestItem(k) {
  if (!G.me.alive || !(G.me.items[k] > 0)) return;
  if (isAuthority()) doItem(G.myPid, k); else netSend({ r: "item", k });
}
function requestSpecial() {
  const sp = G.me.mech.special;
  if (!sp || G.charge < sp.charge || !G.me.alive) return;
  if (G.phase !== "wave" && G.phase !== "boss") return;
  G.charge = 0;
  if (isAuthority()) doSpecial(G.myPid); else netSend({ r: "special" });
  updateHud();
}

/* =====================================================================
 *  LABELS & HUD
 * ===================================================================== */
function makeTag(t) {
  const el = document.createElement("div");
  el.className = "tag" + (t.kind === "missile" ? " missile" : t.kind === "boss" ? " boss" : "") + (t.elite ? " elite" : "");
  if (G.mode === "multi" && t.kind !== "boss") { const v = player(t.victim); if (v) el.style.borderLeft = `4px solid ${v.color}`; if (t.victim === G.myPid) el.classList.add("mine"); }
  $("#labels").appendChild(el);
  t.el = el; renderTag(t, true);
}
function renderTag(t, remeasure) {
  let html = `${t.elite ? "⭐ " : ""}<span class="done">${esc(t.word.slice(0, t.typed))}</span>${esc(t.word.slice(t.typed))}`;
  const others = Object.entries(t.others || {});
  if (others.length) html += `<div class="ob">${others.map(([pid, n]) => { const p = player(pid); return `<i style="background:${p ? p.color : "#fff"};width:${Math.round(100 * n / t.word.length)}%"></i>`; }).join("")}</div>`;
  t.el.innerHTML = html;
  if (remeasure || !t.w) { t.w = t.el.offsetWidth; t.h = t.el.offsetHeight; }
}

function positionTags() {
  const { w, h } = viewSize();
  const v = new V3();
  const items = [];
  for (const t of G.targets) {
    v.copy(t.pos).project(camera);
    if (v.z > 1) { t.el.style.display = "none"; continue; }
    t.el.style.display = "";
    const dist = camera.position.distanceTo(t.pos);
    const s = t.kind === "boss" ? 1 : Math.max(0.7, Math.min(1.25, 1.35 - dist / 120));
    items.push({ t, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, s, w: (t.w || 60) * s, h: (t.h || 26) * s });
  }
  items.sort((a, b) => (b.t === G.lock) - (a.t === G.lock) || threat(b.t) - threat(a.t));
  const placed = [];
  for (const it of items) {
    for (let k = 0; k < 10; k++) {
      const hit = placed.find(p => Math.abs(p.x - it.x) < (p.w + it.w) / 2 + 4 && Math.abs(p.y - it.y) < Math.max(p.h, it.h) + 2);
      if (!hit) break;
      it.y = hit.y - hit.h - 3;
    }
    placed.push(it);
    it.t.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, -100%) scale(${it.s.toFixed(3)})`;
    it.t.el.style.zIndex = it.t === G.lock ? 999 : Math.round(threat(it.t) * 100);
  }
  for (const p of G.players) {
    if (!p.tagEl) continue;
    const sc = p.mesh.visible ? project(p.mesh.position.clone().add(new V3(0, 4.6, 0))) : null;
    if (!sc) { p.tagEl.style.display = "none"; continue; }
    p.tagEl.style.display = "";
    p.tagEl.textContent = `${p.pid === G.myPid ? "YOU · " : ""}${p.nick} ${"♥".repeat(Math.max(0, p.hp))}${p.shield ? " 🛡️" : ""}`;
    p.tagEl.style.transform = `translate(${sc.x.toFixed(1)}px, ${sc.y.toFixed(1)}px) translate(-50%, -100%)`;
  }
}

function showMsg(text, sub, warn) {
  const el = $("#hud-msg");
  el.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : "");
  el.classList.toggle("warn", !!warn);
  el.classList.add("show");
}
function hideMsg() { $("#hud-msg").classList.remove("show", "warn"); }

function currentWpm() { return G.activeTime > 3 ? (G.correct / 5) / (G.activeTime / 60) : 0; }
function currentAcc() { return G.keystrokes ? Math.round(G.correct / G.keystrokes * 1000) / 10 : 0; }

function updateHud() {
  if (!G.me) return;
  const me = G.me, hearts = [];
  if (me.maxHp > 8) hearts.push(`♥ ${me.hp}/${me.maxHp}`);
  else for (let i = 0; i < me.maxHp; i++) hearts.push(i < me.hp ? "♥" : '<span class="empty">♥</span>');
  $("#hud-hearts").innerHTML = hearts.join("") + (me.shield ? ' <span class="shield">🛡️</span>' : "");
  $("#hud-stage").textContent = `STAGE ${G.stage}${G.stagesLimit ? "/" + G.stagesLimit : ""} · ${G.diffName.toUpperCase()}`;
  $("#hud-score").textContent = me.score;
  $("#hud-combo").textContent = G.combo;
  for (const b of $$(".item-btn[data-item]")) {
    const k = b.dataset.item;
    if (k === "special") {
      const sp = me.mech.special; if (!sp) continue;
      b.querySelector(".n").textContent = `${G.charge}/${sp.charge}`;
      b.classList.toggle("ready", G.charge >= sp.charge); b.classList.toggle("empty", G.charge < sp.charge); continue;
    }
    b.querySelector(".n").textContent = me.items[k];
    b.classList.toggle("empty", me.items[k] <= 0);
  }
  if (G.boss) $("#boss-fill").style.width = (100 * G.boss.hp / G.boss.maxHp) + "%";
  if (G.mode === "multi") {
    $("#mp-board").innerHTML = G.players.slice().sort((a, b) => b.score - a.score).map(p =>
      `<span class="mpb ${p.alive ? "" : "dead"} ${p.pid === G.myPid ? "me" : ""}" style="color:${p.color}">${esc(p.nick)} · ${p.score} ${p.alive ? "♥".repeat(Math.max(0, p.hp)) : (p.left ? "(left)" : "✖")}</span>`).join("");
  }
}

/* =====================================================================
 *  INPUT
 * ===================================================================== */
const SENT = "..";
typer.value = SENT;
function processTyper(e) {
  if (e && e.isComposing) return;
  const v = typer.value;
  if (v.length < SENT.length || !v.startsWith(SENT)) { if (document.body.classList.contains("playing")) releaseLock(); }
  else for (const ch of v.slice(SENT.length)) handleChar(ch);
  typer.value = SENT;
  try { typer.setSelectionRange(SENT.length, SENT.length); } catch (err) {}
}
typer.addEventListener("input", processTyper);
typer.addEventListener("compositionend", () => setTimeout(processTyper, 0));
typer.addEventListener("blur", () => { if (document.body.classList.contains("playing")) document.body.classList.add("nofocus"); });
typer.addEventListener("focus", () => document.body.classList.remove("nofocus"));
function focusTyper() { typer.value = SENT; typer.focus({ preventScroll: true }); try { typer.setSelectionRange(SENT.length, SENT.length); } catch (e) {} }
$("#focus-hint").addEventListener("click", focusTyper);
document.addEventListener("pointerdown", (e) => {
  if (document.body.classList.contains("playing") && !$("#scr-pause").classList.contains("show") && !e.target.closest("button")) setTimeout(focusTyper, 0);
});
document.addEventListener("keydown", (e) => {
  if (!document.body.classList.contains("playing")) return;
  if (e.key === "Escape") { e.preventDefault(); $("#scr-pause").classList.contains("show") ? resume() : pause(); }
  else if (e.key === "Tab") e.preventDefault();
});
$$(".item-btn[data-item]").forEach(b => b.addEventListener("click", (e) => {
  e.preventDefault();
  if (b.dataset.item === "special") requestSpecial(); else requestItem(b.dataset.item);
  focusTyper();
}));
$("#btn-pause").onclick = () => pause();
$("#btn-resume").onclick = () => resume();
$("#btn-end").onclick = () => {
  $("#scr-pause").classList.remove("show"); G.paused = false;
  if (G.mode === "multi") { if (G.role === "host") gameOver("ended"); else { netLeave(); finishGame(localRanking(), "left"); } }
  else gameOver("ended");
};
document.addEventListener("visibilitychange", () => { if (document.hidden && G.running && !G.over && G.mode === "solo") pause(); });

function pause() {
  if (G.over || !G.running) return;
  const multi = G.mode === "multi";
  G.paused = !multi;
  $("#pause-title").textContent = multi ? "MENU" : "PAUSED";
  $("#pause-note").style.display = multi ? "" : "none";
  $("#btn-end").textContent = multi ? (G.role === "host" ? "END MATCH FOR EVERYONE" : "LEAVE MATCH") : "END MISSION";
  $("#btn-resume").textContent = multi ? "BACK TO BATTLE" : "RESUME";
  $("#scr-pause").classList.add("show");
  typer.blur();
}
function resume() { G.paused = false; $("#scr-pause").classList.remove("show"); focusTyper(); }

/* =====================================================================
 *  END OF GAME / RESULTS
 * ===================================================================== */
function localRanking() {
  return G.players.map(p => ({ pid: p.pid, nick: p.nick, color: p.color, score: p.score, kills: p.kills, wpm: p.pid === G.myPid ? Math.round(currentWpm() * 10) / 10 : p.wpm, acc: p.pid === G.myPid ? currentAcc() : p.acc, alive: p.alive, left: p.left }))
    .sort((a, b) => b.score - a.score);
}
function onOver(ev) { if (!G.over) finishGame(ev.ranking, ev.reason); }

function finishGame(ranking, reason) {
  if (G.over) return;
  G.over = true;
  const result = {
    mode: G.mode === "multi" ? "Multi" : "Solo",
    difficulty: G.diffName, wordBank: WORD_BANKS[G.bank].name, wpm: Math.round(currentWpm() * 10) / 10, accuracy: currentAcc(),
    survival: Math.round(G.time), score: G.me.score, stage: G.stage, kills: G.myKills, bosses: G.myBosses, coins: G.coins,
    mistyped: Object.entries(G.mistakes).sort((a, b) => b[1] - a[1]).map(([word, count]) => ({ word, count })), mech: G.me.mech.id,
    maxCombo: G.maxCombo, keys: G.keystrokes, revengeKills: G.revengeKills, event: G.event || "",
  };
  if (G.mode === "multi") { result.mpPlayers = ranking.length; result.mpRank = ranking.findIndex(p => p.pid === G.myPid) + 1; }
  // revenge list: words killed in revenge leave, new mistakes join
  const rv = G.mode === "solo" ? G.revenge : revengeList();
  for (const m of result.mistyped) rv[m.word] = (rv[m.word] || 0) + m.count;
  saveRevenge(rv);
  Music.stop(); setComboTier(0); G.slowmo = 0;
  S.lastResult = result;
  const keystrokes = G.keystrokes;
  if (G.mode === "multi") setTimeout(netLeave, 1500);
  setTimeout(() => showResult(result, ranking, reason, keystrokes), reason === "destroyed" ? 1400 : 300);
}

function showResult(r, ranking, reason, keystrokes) {
  document.body.classList.remove("playing", "frozen", "slowed", "nofocus", "multi");
  G.running = false;
  typer.blur();
  clearWorld();
  hideMsg();
  showScreen("scr-result");
  resize();
  const titles = { destroyed: "MECH DESTROYED — MISSION REPORT", victory: "MISSION COMPLETE!", ended: "MISSION REPORT", left: "YOU LEFT THE MATCH", hostLeft: "HOST DISCONNECTED — MATCH ENDED" };
  $("#res-title").textContent = r.mode === "Multi" && reason !== "left" && reason !== "hostLeft" ? `MATCH RESULT — ${ranking[0] ? ranking[0].nick + " WINS!" : ""}` : (titles[reason] || "MISSION REPORT");
  if (r.mode === "Multi") {
    $("#res-ranking").innerHTML = `<div class="table-wrap"><table class="rank-table"><thead><tr><th>#</th><th>Pilot</th><th class="num">Score</th><th class="num">Kills</th><th class="num">WPM</th><th class="num">Accuracy</th></tr></thead><tbody>` +
      ranking.map((p, i) => `<tr style="${p.pid === G.myPid ? "background:rgba(255,204,51,.1)" : ""}"><td class="rank r${i + 1}">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td><td><b style="color:${p.color}">${esc(p.nick)}</b>${p.left ? ' <span class="muted small">(left)</span>' : ""}</td><td class="num"><b>${p.score}</b></td><td class="num">${p.kills}</td><td class="num">${p.wpm}</td><td class="num">${p.acc}%</td></tr>`).join("") +
      `</tbody></table></div>`;
  } else $("#res-ranking").innerHTML = "";
  const tiles = [
    ["hero", r.wpm, "Typing speed (WPM)"], ["hero", r.accuracy + "%", "Accuracy"], ["", fmtTime(r.survival), "Time survived"],
    ["", r.score, "Score"], ["", r.stage, "Stage reached"], ["", r.kills, "Enemies destroyed"], ["", "+" + r.coins + " 🪙", "Coins earned"],
  ];
  $("#res-stats").innerHTML = tiles.map(([c, v, l]) => `<div class="stat ${c}"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");
  $("#res-mistakes").innerHTML = r.mistyped.length ? r.mistyped.map(m => `<span class="chip">${esc(m.word)}${S.prefs.meanings && window.MEANINGS && MEANINGS[m.word] ? ` <i>${esc(MEANINGS[m.word])}</i>` : ""}${m.count > 1 ? `<i>×${m.count}</i>` : ""}</span>`).join("") + '<div class="small muted" style="width:100%;margin-top:4px">⭐ These words will come back as golden revenge enemies — destroy them for double coins!</div>' : '<span class="ok">None — perfect typing! 🎯</span>';
  $("#res-progress").innerHTML = "";
  $("#btn-again").textContent = r.mode === "Multi" ? "MULTIPLAYER ▶" : "PLAY AGAIN ▶";
  S.lastMode = r.mode;

  const up = $("#res-upload");
  const tooShort = r.survival < 20 || keystrokes < 20;
  if (!isSchool()) {
    S.guest.coins += r.coins;
    if (!tooShort) showProgress(applyProgress(profile(), r), false);
    saveWallet();
    up.innerHTML = "Guest mode — results are not recorded. <b>Sign in with your school account</b> to save scores and join the leaderboard.";
  } else if (tooShort) {
    up.innerHTML = "This mission was too short to record (play at least 20 seconds). No coins or XP were saved.";
  } else {
    up.innerHTML = "⏳ Saving your result to the class record…";
    if (!isAdmin()) { S.session.player.coins += r.coins; saveWallet(); }
    showProgress(applyProgress(JSON.parse(JSON.stringify(profile())), r), true);
    submitResult(r).then(({ state, res }) => {
      if (state === "ok" && res && res.progress) showProgress(res.progress, false);
      if (state === "ok") up.innerHTML = '<span class="ok">✔ Saved to your class record.</span>' + (r.mode === "Multi" ? ' <span class="muted small">(Multiplayer games count for your teacher, not for the leaderboard.)</span>' : "");
      else if (state === "expired") up.innerHTML = '<span class="err">Your sign-in expired, so this result could not be saved. Please sign out and sign in again.</span>';
      else up.innerHTML = "⚠ Couldn't reach the school server. Your result is kept on this device and will be sent automatically next time.";
      renderUserChip();
    });
  }
  renderUserChip();
}

async function submitResult(r) {
  const item = { token: S.session.token, result: r, at: Date.now() };
  try {
    const res = await api({ action: "submitScore", token: item.token, result: r }, "POST", 20000);
    if (res.ok) { if (res.player && isSchool()) setPlayer(res.player); giftToast(res); return { state: "ok", res }; }
    if (res.error === "session_expired" || res.error === "no_profile") return { state: "expired" };
    throw new Error(res.error);
  } catch (e) {
    const q = store.get("mst_pending", []); q.push(item); store.set("mst_pending", q.slice(-20));
    return { state: "queued" };
  }
}

let flushing = false;
async function flushPending() {
  if (flushing || !CFG.APPS_SCRIPT_URL) return;
  const q = store.get("mst_pending", []);
  if (!q.length) return;
  flushing = true;
  const keep = [];
  for (const item of q) {
    if (Date.now() - item.at > 12 * 3600 * 1000) continue;
    try {
      const res = await api({ action: "submitScore", token: item.token, result: item.result }, "POST", 20000);
      if (res.ok) { if (isSchool() && res.player && S.session.token === item.token) setPlayer(res.player); }
      else if (res.error !== "session_expired" && res.error !== "no_profile") keep.push(item);
    } catch (e) { keep.push(item); }
  }
  store.set("mst_pending", keep);
  flushing = false;
  renderUserChip();
}

$("#btn-again").onclick = () => {
  if (S.lastMode === "Multi") return showMulti();
  typer.focus();
  startGame(soloOptions());
};

/* ---------- XP / level / badges on the result screen ---------- */
function showProgress(pg, predicted) {
  if (!pg) return;
  const lvUp = pg.level > pg.levelBefore;
  const unlockedBg = BACKGROUNDS.filter(b => b.level > pg.levelBefore && b.level <= pg.level);
  $("#res-progress").innerHTML = `<div class="upload" style="margin:0">
    <b class="lv">+${pg.xpGain} XP</b> · Pilot <span class="lv">LV ${pg.level}</span>${predicted ? ' <span class="muted small">(saving…)</span>' : ""}
    ${lvUp ? `<div style="margin-top:6px;font-family:var(--head);color:var(--good)">🎉 LEVEL UP! LV ${pg.levelBefore} → LV ${pg.level}${pg.level <= 11 ? " · new boss unlocked" : ""}${unlockedBg.length ? " · new battlefield: " + unlockedBg.map(b => esc(b.name)).join(", ") : ""}</div>` : ""}
    ${pg.newBadges && pg.newBadges.length ? `<div style="margin-top:6px">${pg.newBadges.map(id => BADGE_BY_ID[id] ? `<span class="newbadge">${BADGE_BY_ID[id].icon} NEW BADGE: <b>${esc(BADGE_BY_ID[id].name)}</b></span>` : "").join("")}</div>` : ""}
  </div>`;
  if (!predicted && (lvUp || (pg.newBadges && pg.newBadges.length))) sfx("clear");
  renderUserChip();
}

/* ---------- share card ---------- */
let cardRenderer = null;
function mechSnapshot(mechId, skinId) {
  try {
    if (!cardRenderer) cardRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    cardRenderer.setSize(600, 600, false);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0x9cc4ff, 0x20123a, 1.0)); const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(5, 10, 8); sc.add(d);
    const m = MODELS.buildMech(MECH_BY_ID[mechId] || MECHS[0], SKIN_BY_ID[skinId]);
    const an = MODELS.newAnim(); MODELS.aimMech(m, an, new V3(-3, 3, 14)); an.aiming = 1; an.wantAim = 1;
    for (let i = 0; i < 30; i++) MODELS.animateMech(m, an, 0.05);
    m.rotation.y = 0.5; sc.add(m);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100); cam.position.set(2.2, 2.6, 8.5); cam.lookAt(0, 1.9, 0);
    cardRenderer.render(sc, cam);
    return cardRenderer.domElement.toDataURL("image/png");
  } catch (e) { return null; }
}
function buildShareCard(r) {
  return new Promise((resolve) => {
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, "#050816"); g.addColorStop(0.6, "#121a44"); g.addColorStop(1, "#2a1046");
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; x.fillRect(Math.random() * 1080, Math.random() * 1350, 2, 2); }
    x.strokeStyle = "#3ad0ff"; x.lineWidth = 6; x.strokeRect(24, 24, 1032, 1302);
    x.textAlign = "center"; x.fillStyle = "#ffcc33"; x.font = "900 64px Orbitron, Arial, sans-serif"; x.fillText("MECHA STRIKE TYPER", 540, 120);
    const pr = profile(), nick = isSchool() && S.session.player ? S.session.player.nickname : "Guest Pilot";
    x.fillStyle = "#e8f1ff"; x.font = "700 54px 'Exo 2', Arial, sans-serif"; x.fillText(nick, 540, 200);
    x.fillStyle = "#93a4c8"; x.font = "600 34px 'Exo 2', Arial, sans-serif";
    x.fillText(`Pilot LV ${myLevel()}${pr.title && BADGE_BY_ID[pr.title] ? "  ·  " + BADGE_BY_ID[pr.title].icon + " " + BADGE_BY_ID[pr.title].name : ""}`, 540, 250);
    const finish = () => {
      x.fillStyle = "#ffcc33"; x.font = "900 150px Orbitron, Arial, sans-serif"; x.fillText(String(r.wpm), 540, 1010);
      x.fillStyle = "#93a4c8"; x.font = "700 36px Orbitron, Arial, sans-serif"; x.fillText("WPM", 540, 1060);
      const stats = [[r.accuracy + "%", "ACCURACY"], [String(r.kills), "KILLS"], [String(r.maxCombo || 0), "MAX COMBO"], [String(r.stage), "STAGE"]];
      stats.forEach(([v, l], i) => { const cx = 175 + i * 243; x.fillStyle = "#e8f1ff"; x.font = "800 52px Orbitron, Arial, sans-serif"; x.fillText(v, cx, 1170); x.fillStyle = "#93a4c8"; x.font = "600 24px Orbitron, Arial, sans-serif"; x.fillText(l, cx, 1208); });
      x.fillStyle = "#93a4c8"; x.font = "500 26px 'Exo 2', Arial, sans-serif";
      x.fillText(`${(MECH_BY_ID[r.mech] || MECHS[0]).name} · ${r.difficulty} · ${r.mode === "Multi" ? "Multiplayer" : "Solo"} · ${new Date().toLocaleDateString("en-GB")}`, 540, 1270);
      x.fillText(location.host + location.pathname, 540, 1305);
      resolve(c.toDataURL("image/png"));
    };
    const shot = mechSnapshot(r.mech, profile().skin);
    if (!shot) return finish();
    const img = new Image(); img.onload = () => { x.drawImage(img, 190, 270, 700, 700); finish(); }; img.onerror = finish; img.src = shot;
  });
}
$("#btn-share").onclick = async () => {
  if (!S.lastResult) return;
  openModal('<h2>SHARE CARD</h2><p class="muted">Making your card…</p>');
  const url = await buildShareCard(S.lastResult);
  openModal(`<h2>SHARE CARD</h2><img class="share-img" src="${url}" alt="Your mission card"><p class="small muted" style="text-align:center">Save the picture and share it with your class!</p>`,
    `<a class="btn gold extra" style="flex:0 0 auto" download="mecha-strike-typer.png" href="${url}">⬇ SAVE IMAGE</a>` + (navigator.canShare ? `<button class="btn primary extra" id="btn-native-share" style="flex:0 0 auto">SHARE…</button>` : ""));
  const ns = $("#btn-native-share");
  if (ns) ns.onclick = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "mecha-strike-typer.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "Mecha Strike Typer", text: `I typed ${S.lastResult.wpm} WPM in Mecha Strike Typer!` });
    } catch (e) {}
  };
};
$("#btn-to-hangar").onclick = () => showHangar();
