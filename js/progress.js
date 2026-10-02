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

/* ---------------- festival events (dates come from js/calendar.js + the Events sheet) ---------------- */
// decor: lanterns [colors], fireworks [colors], snow, moon, sprites [emoji], sky [top, mid, bottom]
const EVENTS = {
  cny: { name: "Chinese New Year", icon: "🧧", boss: "GOLDEN DRAGON", decor: { lanterns: [0xff2a2a, 0xff3b1f], fireworks: [0xff3333, 0xffcc33, 0xff8833], sprites: ["🧧", "🍊"] },
    words: "dragon firecracker lantern reunion dumpling orange tangerine prosperity fortune luck red envelope lion dance drum gold coin blessing spring couplet calendar zodiac ancestor feast temple greeting relatives family celebrate festival happy wish new year fireworks noodle longevity peach plum blossom pineapple cookie candy visit uncle aunt cousin grandparents wealth harmony health success abundance tradition ox tiger rabbit snake horse goat monkey rooster dog pig rat" },
  lantern: { name: "Lantern Festival", icon: "🏮", boss: "LANTERN TITAN", decor: { lanterns: [0xff4a3a, 0xffb43a, 0xff6ad5, 0x6ad5ff], fireworks: [0xffcc33, 0xff5533], moon: true },
    words: "lantern riddle moon rice ball sweet soup sesame peanut paste festival night parade light candle paper colorful bright guess answer clue puzzle family reunion orange toss wish full first month celebrate glow dragon lion dance drum gather street happy fifteenth evening sky star crowd bamboo frame red gold fireworks poem friend smile laugh glowing shining moonlight harmony tradition legend celebration sugar stage music joy" },
  qingming: { name: "Qingming Festival", icon: "🌿", boss: "", decor: { sprites: ["🌿", "🍃", "🌸"] },
    words: "ancestor grave respect memory remember honour family incense candle flower willow spring rain green picnic kite outing clean sweep offering prayer tradition gratitude grandparents history heritage peaceful quiet gentle breeze blossom season planting tree hill walk tea rice dumpling story photo gather visit thankful calm chrysanthemum pray bow sunrise mist morning drizzle umbrella sprout seedling meadow stream bridge lotus pond lake journey generation" },
  dragonboat: { name: "Dragon Boat Festival", icon: "🐉", boss: "DRAGON BOAT DREADNOUGHT", decor: { sprites: ["🛶", "🎏", "🌊"] },
    words: "dragon boat race paddle drum team river poet dumpling rice leaf bamboo sachet herb festival summer row splash teamwork rhythm finish line champion legend loyal patriot honour water wave crew steer oar flag cheer crowd sticky salty sweet egg yolk pork bean wrap tie string fifth month noon sun strong speed together victory teammates captain coach medal trophy shore harbor ancient poetry bravery sweat practice muscle" },
  qixi: { name: "Qixi Festival", icon: "💞", boss: "MAGPIE BRIDGE", decor: { sprites: ["💫", "✨", "💞"] },
    words: "star cowherd weaver magpie bridge love heaven river milky way meet seventh night sky romance wish needle thread craft skill sewing cloud goddess legend story loyal faithful separate reunite dream heart moon twinkle constellation galaxy promise forever gift flower letter poem kindness friendship hope wait bright astronomy telescope shooting planet orbit universe sparkle shine glitter patience devotion embroidery fabric silk loom" },
  midautumn: { name: "Mid-Autumn Festival", icon: "🥮", boss: "JADE RABBIT MOON", decor: { lanterns: [0xff7a2a, 0xffb43a, 0xff4a3a], moon: true },
    words: "moon lantern mooncake rabbit festival reunion family harvest autumn osmanthus pomelo tea legend goddess palace jade riddle bright night sky celebrate gather share sweet lotus paste yolk round tradition poem light glow candle star float wish happy archer moonlight dessert tray cassia tree woodcutter elixir full silver cloud chestnut persimmon starlight reunite gratitude peaceful evening rooftop courtyard garden balcony neighbor" },
  doubleninth: { name: "Double Ninth Festival", icon: "🏔️", boss: "MOUNTAIN FORTRESS", decor: { sprites: ["🌼", "🍂", "🏔️"] },
    words: "mountain climb hike elder respect chrysanthemum wine cake height autumn festival ninth longevity health grandparents care visit kite picnic breeze view peak trail summit nature leaves gold yellow tradition family gratitude wisdom walk tea poem scenery strong healthy cliff valley sky cloud maple forest canyon river waterfall sunset sunrise adventure backpack compass map energy fitness elderly respectful grateful patience journey" },
  solstice: { name: "Winter Solstice", icon: "🥣", boss: "TANGYUAN TITAN", decor: { snow: true, sprites: ["🍡", "❄️"] },
    words: "winter solstice dumpling rice ball family reunion warm cold longest night shortest day soup sweet ginger sesame gather dinner home festival season sun ice snow blanket cozy candle light hope spring return balance tradition feast steam noodle round pink white bowl spoon together grandparents frost chilly mittens scarf sweater fireplace kettle cocoa porridge wonton starry darkness lamp quilt laughter story" },
  newyear: { name: "New Year's Day", icon: "🎆", boss: "COUNTDOWN TOWER", decor: { fireworks: [0x3ad0ff, 0xffcc33, 0xff5ef0, 0x7dff8a], sprites: ["🎉", "🎆"] },
    words: "countdown midnight resolution fireworks celebrate calendar january fresh start goal dream hope party cheer clock bell confetti sparkle future plan habit promise wish happy new year beginning chapter journey success improve learn friends family song dance parade balloon gift brave change grow celebration memories gratitude reflect diary schedule kindness healthy exercise reading volunteer adventure explore courage smile cheerful energy tradition" },
  valentine: { name: "Valentine's Day", icon: "💝", boss: "HEART SERAPH", decor: { sprites: ["❤️", "💕", "💝"] },
    words: "love heart friendship kindness chocolate rose card gift hug smile care cupid arrow sweet pink red romance letter poem flower bouquet candy cookie compliment thank appreciate cherish caring gentle share friend family loyal respect message happy cheerful helpful honest classmate teammate neighbor generous thoughtful patient trust laughter support encourage comfort sharing cupcake ribbon sticker greeting together forever bright sunshine" },
  aprilfools: { name: "April Fools' Day", icon: "🤡", boss: "PRANK JESTER", decor: { sprites: ["🤡", "😜", "🎈"] },
    words: "joke prank trick fool surprise laugh funny giggle silly gag riddle tease fake rubber chicken cushion confetti clown juggle mischief playful humor comedy pun wink grin harmless backwards upside down disguise mask spring bounce balloon whistle tickle pretend gotcha hilarious ridiculous wacky goofy prankster jester trickster laughter cartoon comic sticker fooled bizarre topsy turvy whoopee sneaky hidden squeaky" },
  easter: { name: "Easter", icon: "🐣", boss: "EGG MOTHERSHIP", decor: { sprites: ["🥚", "🐰", "🌷"] },
    words: "egg bunny rabbit spring basket hunt chocolate chick lamb flower lily tulip daisy garden hop colorful paint decorate pastel candy jelly bean hide seek treasure picnic sunshine blossom hope parade bonnet ribbon bake bread bun carrot grass nest feather hatch duckling butterfly rainbow sunrise meadow sprinkle cupcake marshmallow brunch gathering springtime wreath chirp tweet cottontail" },
  mothersday: { name: "Mother's Day", icon: "🌷", boss: "GUARDIAN GODDESS", decor: { sprites: ["🌷", "💐", "🌸"] },
    words: "mother mom love care kind gentle hug thank flower carnation card breakfast cook kitchen family smile warm patience sacrifice support teach protect wisdom strong brave beautiful grateful gift poem letter memory home garden help chores rest tea cake surprise cheerful tender nurture devotion admire beloved comfort lullaby bedtime story recipe soup laundry hero champion embrace sunshine bouquet daughter son" },
  fathersday: { name: "Father's Day", icon: "👔", boss: "IRON GUARDIAN", decor: { sprites: ["👔", "🏆", "⭐"] },
    words: "father dad hero strong brave protect support teach wisdom patience hardworking funny joke tie tool fix garden barbecue grill football fishing hike adventure guide proud grateful thank card gift memory family love care advice respect lead shoulder hammer wrench toolbox workshop garage repair build bicycle camping mentor coach champion laughter backyard sunday breakfast newspaper hat sunglasses hug" },
  halloween: { name: "Halloween", icon: "🎃", boss: "PUMPKIN PHANTOM", decor: { sprites: ["🎃", "👻", "🦇"], sky: ["#07020f", "#1c0b2e", "#3a1a08"] },
    words: "pumpkin lantern costume candy treat trick ghost witch broom cauldron spooky moon bat spider web skeleton zombie mummy vampire monster haunted castle owl cat black orange potion spell magic mask candle fog midnight creepy scary scream giggle party cape wizard werewolf goblin skull cobweb shadow howl moonlight eerie lollipop chocolate caramel pirate princess superhero dragon fairy knight treasure" },
  christmas: { name: "Christmas", icon: "🎄", boss: "TANNENBAUM TITAN", decor: { snow: true, sprites: ["🎄", "🎁", "⭐"] },
    words: "christmas tree star snow snowman reindeer sleigh gift present stocking ornament candle carol bell jingle wreath holly cookie gingerbread candy cane santa elf chimney winter cozy fireplace family peace joy hope kindness share giving celebrate december night lights angel ribbon wrap card wish snowflake icicle frosty mitten scarf sweater cocoa pudding chestnut choir celebration presents unwrap ornaments decorations sparkle glitter" },
  merdeka: { name: "Merdeka Day", icon: "🌺", boss: "HORNBILL GUARDIAN", decor: { fireworks: [0xff3333, 0x3366ff, 0xffdd33, 0xffffff], sprites: ["🌺", "⭐"] },
    words: "merdeka independence freedom malaysia nation flag unity harmony patriot proud parade march anthem history heritage culture diversity people citizen hero leader peace progress future celebrate fireworks stadium square hornbill hibiscus tiger courage loyal respect together community village city rainforest mountain island democracy parliament constitution federation peninsula durian satay kite orchid rubber palm tropical monsoon friendship neighbor unite strength" },
  anniversary: { name: "School Anniversary", icon: "🎉", boss: "CENTENNIAL TITAN", decor: { fireworks: [0x3ad0ff, 0xffcc33, 0xff5ef0], sprites: ["🎉", "🎓"] },
    words: "school anniversary celebrate history founder alumni pride tradition legacy century spirit motto honour unity diligence knowledge future growth together memory festival parade banner ceremony speech gratitude teacher student community library classroom campus friendship dream achieve excellence scholar dedication heritage journey milestone graduation diploma certificate trophy award principal orchestra choir assembly anthem concert exhibition sports carnival yearbook photograph celebration lifelong" },
};
for (const ev of Object.values(EVENTS)) ev.bonus = 1.5;
function todayMY() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
function activeEvent() {
  const w = pickEvent(todayMY(), S.remote.eventWindows || [], S.remote.disabledEvents || []);
  return w && EVENTS[w.id] ? Object.assign({ id: w.id, end: w.end, day: w.day }, EVENTS[w.id]) : null;
}
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
