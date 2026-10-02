"use strict";
/* =====================================================================
 *  PILOT PROGRESSION: level / XP, badges & titles, paint jobs,
 *  battlefields (backgrounds), festival events.
 *  Rules must match apps-script/Code.gs (school accounts are scored there;
 *  guests use the same rules locally).
 * ===================================================================== */
const BADGES = [
  { id: "rookie", icon: "🎖️", name: "Rookie Pilot", desc: "Finish your first mission", test: (s) => s.games >= 1 },
  { id: "ace", icon: "✈️", name: "Ace Pilot", desc: "Destroy 100 enemies", test: (s) => s.kills >= 100 },
  { id: "veteran", icon: "🛡️", name: "Veteran", desc: "Destroy 1,000 enemies", test: (s) => s.kills >= 1000 },
  { id: "legend", icon: "👑", name: "Legend", desc: "Destroy 5,000 enemies", test: (s) => s.kills >= 5000 },
  { id: "boss10", icon: "🐉", name: "Boss Hunter", desc: "Defeat 10 bosses", test: (s) => s.bosses >= 10 },
  { id: "boss50", icon: "⚔️", name: "Giant Slayer", desc: "Defeat 50 bosses", test: (s) => s.bosses >= 50 },
  { id: "combo50", icon: "🔥", name: "Combo Master", desc: "50 words in a row without a mistake", test: (s) => s.bestCombo >= 50 },
  { id: "combo100", icon: "💥", name: "Unstoppable", desc: "100 words in a row without a mistake", test: (s) => s.bestCombo >= 100 },
  { id: "perfect", icon: "🎯", name: "Perfectionist", desc: "Finish a mission with 100% accuracy (30+ keys)", test: (s) => s.perfect >= 1 },
  { id: "speed40", icon: "💨", name: "Speedster", desc: "Reach 40 WPM (80%+ accuracy)", test: (s) => s.bestWpm >= 40 },
  { id: "speed60", icon: "⚡", name: "Lightning Fingers", desc: "Reach 60 WPM (80%+ accuracy)", test: (s) => s.bestWpm >= 60 },
  { id: "speed80", icon: "🌠", name: "Newtype", desc: "Reach 80 WPM (80%+ accuracy)", test: (s) => s.bestWpm >= 80 },
  { id: "week5", icon: "📅", name: "Dedicated", desc: "Play on 5 different days in one week", test: (s) => s.weekDays >= 5 },
  { id: "streak7", icon: "🗓️", name: "Iron Will", desc: "Play 7 days in a row", test: (s) => s.bestStreak >= 7 },
  { id: "avenger", icon: "⭐", name: "Avenger", desc: "Destroy 20 revenge enemies (words you once mistyped)", test: (s) => s.revenge >= 20 },
  { id: "festival", icon: "🏮", name: "Festival Hero", desc: "Play during a festival event", test: (s) => s.eventGames >= 1 },
  { id: "squad", icon: "🤝", name: "Squad Leader", desc: "Win a multiplayer match", test: (s) => s.mpWins >= 1 },
  { id: "level10", icon: "🥈", name: "Elite Pilot", desc: "Reach pilot level 10", test: (s, lv) => lv >= 10 },
  { id: "level20", icon: "🥇", name: "Ace of Aces", desc: "Reach pilot level 20", test: (s, lv) => lv >= 20 },
];
const BADGE_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]));

// Reaching level L needs 50 × (L−1) × L XP in total: Lv2 = 100, Lv3 = 300, Lv4 = 600, Lv5 = 1000 … (max 50)
function levelFromXp(xp) { let L = 1; while (L < 50 && xp >= 50 * L * (L + 1)) L++; return L; }
function xpToReach(L) { return 50 * (L - 1) * L; }
const clampN = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
function xpForGame(r) {
  return Math.min(3000, Math.round(clampN(r.kills, 0, 2000) * 5 + clampN(r.bosses, 0, 50) * 50 + clampN(r.stage || 1, 1, 100) * 20 + clampN(r.wpm, 0, 150) * clampN(r.accuracy, 0, 100) / 100));
}
function emptyStats() { return { games: 0, kills: 0, bosses: 0, bestCombo: 0, bestWpm: 0, perfect: 0, revenge: 0, eventGames: 0, mpWins: 0, streak: 0, bestStreak: 0, weekDays: 0, days: [], lastDay: "" }; }
function ymdMY(ms) { return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10); }
function weekStartMY(ms) {
  const off = 8 * 3600 * 1000, local = new Date(ms + off), dow = (local.getUTCDay() + 6) % 7;
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - off;
}
// Same rules as applyProgress_ in Code.gs. Mutates p (xp, badges, stats).
function applyProgress(p, r, nowMs) {
  const s = p.stats = Object.assign(emptyStats(), p.stats || {});
  const before = levelFromXp(p.xp || 0), acc = clampN(r.accuracy, 0, 100), wpm = clampN(r.wpm, 0, 250);
  s.games += 1; s.kills += clampN(r.kills, 0, 2000); s.bosses += clampN(r.bosses, 0, 50);
  s.bestCombo = Math.max(s.bestCombo, clampN(r.maxCombo, 0, 2000));
  if (acc >= 80) s.bestWpm = Math.max(s.bestWpm, Math.round(wpm * 10) / 10);
  if (acc >= 100 && (Number(r.keys) || 0) >= 30) s.perfect += 1;
  s.revenge += clampN(r.revengeKills, 0, 100);
  if (r.event) s.eventGames += 1;
  if (r.mode === "Multi" && Number(r.mpRank) === 1 && Number(r.mpPlayers) >= 2) s.mpWins += 1;
  const now = nowMs || Date.now(), today = ymdMY(now), yesterday = ymdMY(now - 86400000);
  if (!s.days.includes(today)) { s.streak = s.lastDay === yesterday ? s.streak + 1 : 1; s.days.push(today); s.days = s.days.slice(-14); }
  s.lastDay = today;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  const ws = ymdMY(weekStartMY(now));
  s.weekDays = s.days.filter(d => d >= ws).length;
  const gain = xpForGame(r);
  p.xp = (p.xp || 0) + gain;
  const level = levelFromXp(p.xp);
  p.badges = p.badges || [];
  const fresh = [];
  for (const b of BADGES) if (!p.badges.includes(b.id) && b.test(s, level)) { p.badges.push(b.id); fresh.push(b.id); }
  return { xpGain: gain, levelBefore: before, level, newBadges: fresh };
}

/* ---------------- paint jobs (prices must match SKIN_PRICES in Code.gs) ---------------- */
const SKINS = [
  { id: "default", name: "Factory Colors", price: 0, swatch: ["#eef1f6", "#1f4fbf", "#d62a2a"] },
  { id: "desert", name: "Desert Camo", price: 300, colors: { main: 0xc8b38a, accent: 0x8a7350, trim: 0x5e4e33, dark: 0x3b3224 }, swatch: ["#c8b38a", "#8a7350", "#5e4e33"] },
  { id: "arctic", name: "Arctic", price: 300, colors: { main: 0xf4f8fb, accent: 0x9fc4dd, trim: 0x5f8fb0, dark: 0x2f4a5c }, swatch: ["#f4f8fb", "#9fc4dd", "#5f8fb0"] },
  { id: "sakura", name: "Sakura", price: 400, colors: { main: 0xffd1e3, accent: 0xff7aa8, trim: 0xc2185b, dark: 0x5a2a3d }, swatch: ["#ffd1e3", "#ff7aa8", "#c2185b"] },
  { id: "blackops", name: "Black Ops", price: 400, colors: { main: 0x2b2e35, accent: 0x16181c, trim: 0xc62828, dark: 0x0c0d10 }, swatch: ["#2b2e35", "#16181c", "#c62828"] },
  { id: "neon", name: "Neon Cyber", price: 600, colors: { main: 0x1a1a2a, accent: 0x00e5ff, trim: 0xff2bd6, dark: 0x0b0b14 }, accentGlow: true, swatch: ["#1a1a2a", "#00e5ff", "#ff2bd6"] },
  { id: "gold", name: "Royal Gold", price: 800, colors: { main: 0xe0b94e, accent: 0xb8902c, trim: 0x8a6a1c, dark: 0x4a3a12 }, mat: { metalness: 0.45, roughness: 0.3, emissive: 0x3a2a00, emissiveIntensity: 0.6 }, swatch: ["#e0b94e", "#b8902c", "#8a6a1c"] },
  { id: "optical", name: "Optical Camo", price: 1000, mat: { transparent: true, opacity: 0.3, depthWrite: false }, swatch: ["rgba(200,230,255,.35)", "rgba(120,180,255,.35)", "rgba(255,255,255,.2)"] },
];
const SKIN_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));

/* ---------------- battlefields unlocked by level ---------------- */
const BACKGROUNDS = [
  { id: "deep", name: "Deep Space", level: 1 },
  { id: "earth", name: "Earth Orbit", level: 3 },
  { id: "moon", name: "Lunar Surface", level: 6 },
  { id: "asteroid", name: "Asteroid Belt", level: 10 },
  { id: "colony", name: "Space Colony", level: 15 },
  { id: "nebula", name: "Crimson Nebula", level: 20 },
];
// Bosses unlocked by level: 5 at Lv1, one more per level, all 15 at Lv11
function bossPoolSize(level) { return Math.min(MODELS.BOSSES.filter(b => !b.event).length, 4 + (level || 1)); }

/* ---------------- festival events (dates are set in the Events sheet) ---------------- */
const EVENTS = {
  midautumn: { name: "Mid-Autumn Festival", icon: "🏮", bonus: 1.5, boss: "JADE RABBIT MOON",
    words: "moon lantern mooncake rabbit festival reunion family harvest autumn osmanthus pomelo tea legend goddess palace jade riddle bright night sky celebrate gather share sweet lotus paste yolk round tradition poem light glow candle star float wish happy" },
  cny: { name: "Chinese New Year", icon: "🧧", bonus: 1.5, boss: "GOLDEN DRAGON",
    words: "dragon firecracker lantern reunion dumpling orange tangerine prosperity fortune luck red envelope lion dance drum gold coin blessing spring couplet calendar zodiac ancestor feast temple greeting relatives family celebrate festival happy wish new year" },
  anniversary: { name: "School Anniversary", icon: "🎉", bonus: 1.5, boss: "CENTENNIAL TITAN",
    words: "school anniversary celebrate history founder alumni pride tradition legacy century spirit motto honour unity diligence knowledge future growth together memory festival parade banner ceremony speech gratitude teacher student community" },
};
function activeEvent() { return S.remote.event && EVENTS[S.remote.event.id] ? Object.assign({ id: S.remote.event.id, end: S.remote.event.end }, EVENTS[S.remote.event.id]) : null; }
function eventBankId() { const ev = activeEvent(); return ev ? "event_" + ev.id : null; }
function addEventBank() {
  const ev = activeEvent();
  for (const k of Object.keys(WORD_BANKS)) if (k.startsWith("event_")) delete WORD_BANKS[k];
  if (!ev) return;
  const words = [...new Set(ev.words.split(/\s+/).filter(Boolean))];
  WORD_BANKS["event_" + ev.id] = { name: `${ev.icon} ${ev.name} Words`, words, event: true };
}

/* ---------------- guest profile defaults ---------------- */
function profile() {
  const w = wallet();
  if (!w.skins) w.skins = ["default"];
  if (!w.skin || !SKIN_BY_ID[w.skin]) w.skin = "default";
  if (w.xp == null) w.xp = 0;
  if (!w.badges) w.badges = [];
  if (w.title == null) w.title = "";
  if (!w.stats) w.stats = emptyStats();
  return w;
}
function myLevel() { return isAdmin() ? 50 : levelFromXp(profile().xp || 0); }
function titleText(id) { const b = BADGE_BY_ID[id]; return b ? `${b.icon} ${b.name}` : ""; }

/* ---------------- revenge words (mistyped last time) ---------------- */
function revengeKey() { return "mst_revenge_" + (isSchool() ? S.session.email : "guest"); }
function revengeList() { return store.get(revengeKey(), {}); }
function saveRevenge(map) {
  const entries = Object.entries(map).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 40);
  store.set(revengeKey(), Object.fromEntries(entries));
}
