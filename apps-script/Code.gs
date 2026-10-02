/**
 * 钢弹击字 Mecha Strike Typer — Google Apps Script 接收端
 *
 * 把整个文件的内容贴进 Apps Script 编辑器的 Code.gs（取代原本的内容）。
 * 第一次使用：在上方函数选单选「setup」→ 按「Run / 运行」→ 授权。
 * 之后：部署 → 新部署 → 网页应用（执行身份：我；谁可以访问：任何人）。
 *
 * 老师平时只需要改 Google Sheet 里的分页：
 *   Settings   ：Classes 班级列表（用逗号分隔）、TeacherPassword 老师后台密码、GoogleClientId
 *   Admins     ：管理员 email（金币无限、全部机体可用，成绩不上排行榜）
 *   CoinGifts  ：送金币（对象可以是 email、班级例如 2B，或 ALL 全部人）
 *   Events     ：节日活动的日期（中秋 midautumn、新年 cny、校庆 anniversary）
 */

var SHEET_SCORES = 'Scores';
var SHEET_PLAYERS = 'Players';
var SHEET_SETTINGS = 'Settings';
var SHEET_BANNED = 'BannedWords';
var SHEET_ADMINS = 'Admins';
var SHEET_GIFTS = 'CoinGifts';
var SHEET_EVENTS = 'Events';

var SCORE_HEADERS = ['Time', 'Class', 'Seat No', 'Name', 'Nickname', 'Email', 'Difficulty', 'Word Bank',
  'WPM', 'Accuracy (%)', 'Survival (s)', 'Score', 'Stage', 'Mistyped Words', 'Mech', 'Mode', 'Kills', 'Max Combo'];
var PLAYER_HEADERS = ['Email', 'Class', 'Seat No', 'Name', 'Nickname', 'Coins', 'Owned Mechs',
  'Selected Mech', 'Last Updated', 'Gifts Received (auto)', 'Owned Skins', 'Selected Skin', 'XP', 'Badges', 'Title',
  'Stats (auto — do not edit)'];
var ADMIN_HEADERS = ['Email', 'Unlimited coins (YES / NO)', 'Note'];
var GIFT_HEADERS = ['Who: email / class (e.g. 2B) / ALL', 'Coins', 'Note', 'Gift ID (auto — do not edit)'];
// 节日大部分由网页自动计算（js/calendar.js，农历日期已填到 2030 年）。
// 这张表只需要：校庆日期，以及 2031 年以后的农历节日日期。
var EVENT_HEADERS = ['Event ID (see README)', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Note'];
var DEFAULT_EVENTS = [
  ['anniversary', '', '', '校庆：请填上开始和结束日期 School anniversary — fill in the dates'],
];
var EVENT_IDS = ['cny', 'lantern', 'qingming', 'dragonboat', 'qixi', 'midautumn', 'doubleninth', 'solstice',
  'newyear', 'valentine', 'aprilfools', 'easter', 'mothersday', 'fathersday', 'halloween', 'christmas', 'merdeka', 'anniversary'];

var DEFAULT_SETTINGS = [
  ['Classes', '1A, 1B, 1C, 2A, 2B, 2C, 3A, 3B, 3C', '班级列表，用逗号分隔。例如：1A, 1B, 2A'],
  ['TeacherPassword', 'change-me-2026', '老师后台密码（请务必改掉）'],
  ['GoogleClientId', '', 'Google Cloud 的 Client ID（xxx.apps.googleusercontent.com）'],
  ['SchoolDomain', 'foonyew.edu.my', '学校邮箱域名'],
  ['LeaderboardMinAccuracy', '80', '准确率达到多少 % 才能上排行榜'],
  ['DisabledEvents', '', '不想要的节日活动，用逗号分隔。例如：halloween, aprilfools（ID 见 README）'],
];

// 机体价钱（要和网页 index.html 里的 MECHS 一致）
var MECH_PRICES = {
  starter: 0, redcomet: 300, aile: 300, aegis: 400, flag: 400, zenith: 600, sovereign: 600, bladeangel: 800,
  liberty: 900, fate: 900, baron: 1000, monoceros: 1000, nu: 1100, twin: 1100, seraph: 1200,
};
// 涂装价钱（要和网页 js/progress.js 里的 SKINS 一致）
var SKIN_PRICES = { 'default': 0, desert: 300, arctic: 300, sakura: 400, blackops: 400, neon: 600, gold: 800, optical: 1000 };
var ADMIN_COINS = 999999;
var STAFF_CLASS = 'STAFF';

var TOKEN_HOURS = 12;
var TZ = 'Asia/Kuala_Lumpur';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_SCORES, SCORE_HEADERS);
  ensureSheet_(ss, SHEET_PLAYERS, PLAYER_HEADERS);
  var st = ss.getSheetByName(SHEET_SETTINGS);
  if (!st) {
    st = ss.insertSheet(SHEET_SETTINGS);
    st.getRange(1, 1, 1, 3).setValues([['Key', 'Value', '说明']]).setFontWeight('bold');
  }
  var existing = st.getDataRange().getValues().map(function (r) { return String(r[0]); });
  DEFAULT_SETTINGS.forEach(function (row) {
    if (existing.indexOf(row[0]) === -1) st.appendRow(row);
  });
  st.setColumnWidth(1, 200); st.setColumnWidth(2, 380); st.setColumnWidth(3, 380);
  ensureHeaders_(ss.getSheetByName(SHEET_SCORES), SCORE_HEADERS);
  ensureHeaders_(ss.getSheetByName(SHEET_PLAYERS), PLAYER_HEADERS);
  ensureSheet_(ss, SHEET_ADMINS, ADMIN_HEADERS);
  ensureSheet_(ss, SHEET_GIFTS, GIFT_HEADERS);
  if (!ss.getSheetByName(SHEET_EVENTS)) {
    var ev = ensureSheet_(ss, SHEET_EVENTS, EVENT_HEADERS);
    DEFAULT_EVENTS.forEach(function (row) { ev.appendRow(row); });
  } else {
    // 旧版本预设的中秋 / 新年行已经由网页自动计算，删掉以免日期冲突
    var es = ss.getSheetByName(SHEET_EVENTS);
    es.getRange(1, 1, 1, EVENT_HEADERS.length).setValues([EVENT_HEADERS]).setFontWeight('bold');
    var evRows = es.getDataRange().getValues();
    for (var i = evRows.length - 1; i >= 1; i--) {
      var note = String(evRows[i][3] || '');
      if (note === '中秋节 Mid-Autumn Festival' || note === '农历新年 Chinese New Year') es.deleteRow(i + 1);
    }
  }
  var bw = ss.getSheetByName(SHEET_BANNED);
  if (!bw) {
    bw = ss.insertSheet(SHEET_BANNED);
    bw.getRange(1, 1, 1, 2).setValues([['Extra banned word', '说明：在 A 栏每行加一个不准用在花名的字（内建的屏蔽词已经包含英文、马来文、华文、方言）']]).setFontWeight('bold');
  }
  getSecret_();
  // 纯粹为了让授权画面一次过要求「连接外部服务」的权限
  try { UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true }); } catch (e) {}
  Logger.log('Setup done. 设置完成！');
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// 旧版的分页少了新栏位时，补上标题
function ensureHeaders_(sh, headers) {
  if (!sh) return;
  var row = sh.getDataRange().getValues()[0] || [];
  for (var i = 0; i < headers.length; i++) {
    if (!row[i]) sh.getRange(1, i + 1, 1, 1).setValues([[headers[i]]]).setFontWeight('bold');
  }
}

function getSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function getSettings_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var st = ss.getSheetByName(SHEET_SETTINGS);
  if (!st) { setup(); st = ss.getSheetByName(SHEET_SETTINGS); }
  var out = {};
  st.getDataRange().getValues().forEach(function (r) { out[String(r[0]).trim()] = String(r[1]).trim(); });
  out.classList = String(out.Classes || '').split(/[,，、;\s]+/).map(function (s) { return s.trim(); }).filter(String);
  out.minAcc = Number(out.LeaderboardMinAccuracy) || 0;
  out.domain = (out.SchoolDomain || 'foonyew.edu.my').toLowerCase();
  out.disabledEvents = String(out.DisabledEvents || '').toLowerCase().split(/[,，、;\s]+/).filter(String);
  return out;
}

/* ------------------------------------------------------------------ */
/*  HTTP entry points                                                  */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'config') return json_(getPublicConfig_());
    if (p.action === 'leaderboard') return json_(getLeaderboard_());
    return json_({ ok: true, message: 'Mecha Strike Typer backend is running. 接收端运行中。' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    switch (body.action) {
      case 'login': return json_(login_(body));
      case 'me': return json_(withLock_(function () { return me_(body); }));
      case 'saveProfile': return json_(withLock_(function () { return saveProfile_(body); }));
      case 'submitScore': return json_(withLock_(function () { return submitScore_(body); }));
      case 'buyMech': return json_(withLock_(function () { return buyMech_(body); }));
      case 'selectMech': return json_(withLock_(function () { return selectMech_(body); }));
      case 'buySkin': return json_(withLock_(function () { return buySkin_(body); }));
      case 'selectSkin': return json_(withLock_(function () { return selectSkin_(body); }));
      case 'setTitle': return json_(withLock_(function () { return setTitle_(body); }));
      case 'teacher': return json_(teacher_(body));
      case 'config': return json_(getPublicConfig_());
      case 'leaderboard': return json_(getLeaderboard_());
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function getPublicConfig_() {
  var s = getSettings_();
  return { ok: true, classes: s.classList, clientId: s.GoogleClientId || '', domain: s.domain, minAccuracy: s.minAcc,
    eventWindows: eventWindows_(), disabledEvents: s.disabledEvents };
}

/* ------------------------------------------------------------------ */
/*  Events (date ranges in Malaysia time)                              */
/* ------------------------------------------------------------------ */

function ymd_(v) {
  if (v instanceof Date) return new Date(v.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  var m = String(v || '').trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

// Extra event dates typed in the Events sheet (school anniversary, lunar festivals after 2030).
// The web page merges these with its built-in festival calendar.
function eventWindows_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EVENTS);
  if (!sh) return [];
  var out = [];
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    var id = String(r[0] || '').trim().toLowerCase(), a = ymd_(r[1]), b = ymd_(r[2]);
    if (EVENT_IDS.indexOf(id) !== -1 && a && b && a <= b) out.push({ id: id, start: a, end: b });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Login & session tokens                                             */
/* ------------------------------------------------------------------ */

function login_(body) {
  var s = getSettings_();
  if (!s.GoogleClientId) return { ok: false, error: 'no_client_id' };
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' +
    encodeURIComponent(String(body.idToken || '')), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'bad_token' };
  var info = JSON.parse(res.getContentText());
  if (info.aud !== s.GoogleClientId) return { ok: false, error: 'bad_token' };
  if (String(info.email_verified) !== 'true') return { ok: false, error: 'bad_token' };
  var email = String(info.email || '').toLowerCase();
  if (email.split('@')[1] !== s.domain) return { ok: false, error: 'not_school', email: email };
  var result = withLock_(function () { return refreshPlayer_(email); });
  result.token = makeToken_(email);
  result.email = email;
  return result;
}

// 读取玩家资料，顺便发放老师送的金币；回传给网页的玩家资料（管理员会显示无限金币）
function refreshPlayer_(email) {
  var admin = isAdmin_(email);
  var found = findPlayer_(email);
  if (!found) return { ok: true, player: null, admin: admin, gift: 0 };
  var gift = applyGifts_(found);
  return { ok: true, player: publicPlayer_(found.data, admin), admin: admin, gift: gift };
}

function me_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  return refreshPlayer_(email);
}

function makeToken_(email) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ e: email, x: Date.now() + TOKEN_HOURS * 3600 * 1000 }));
  return payload + '.' + sign_(payload);
}

function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, getSecret_()));
}

function checkToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) return null;
  var data;
  try { data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { return null; }
  if (!data || !data.e || Date.now() > data.x) return null;
  return data.e;
}

/* ------------------------------------------------------------------ */
/*  Players                                                            */
/* ------------------------------------------------------------------ */

function playersSheet_() {
  return ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_PLAYERS, PLAYER_HEADERS);
}

function rowToPlayer_(r) {
  return {
    email: String(r[0]), cls: String(r[1]), seat: String(r[2]), name: String(r[3]), nickname: String(r[4]),
    coins: Number(r[5]) || 0,
    owned: String(r[6] || 'starter').split(',').map(function (x) { return x.trim(); }).filter(String),
    selected: String(r[7] || 'starter'),
    gifts: String(r[9] || '').split(',').map(function (x) { return x.trim(); }).filter(String),
    skins: String(r[10] || 'default').split(',').map(function (x) { return x.trim(); }).filter(String),
    skin: String(r[11] || 'default'),
    xp: Number(r[12]) || 0,
    badges: String(r[13] || '').split(',').map(function (x) { return x.trim(); }).filter(String),
    title: String(r[14] || ''),
    stats: parseStats_(r[15]),
  };
}

function parseStats_(v) {
  var s = {};
  try { s = JSON.parse(String(v || '{}')) || {}; } catch (e) { s = {}; }
  ['games', 'kills', 'bosses', 'bestCombo', 'bestWpm', 'perfect', 'revenge', 'eventGames', 'mpWins', 'streak', 'bestStreak', 'weekDays']
    .forEach(function (k) { s[k] = Number(s[k]) || 0; });
  s.days = Array.isArray(s.days) ? s.days.slice(-14) : [];
  s.lastDay = String(s.lastDay || '');
  return s;
}

// 送去网页的版本：不含内部栏位；管理员金币无限、全部机体可用
function publicPlayer_(p, admin) {
  var out = { email: p.email, cls: p.cls, seat: p.seat, name: p.name, nickname: p.nickname,
    coins: p.coins, owned: p.owned.slice(), selected: p.selected, admin: !!admin,
    skins: (p.skins || ['default']).slice(), skin: p.skin || 'default', xp: p.xp || 0, level: levelFromXp_(p.xp || 0),
    badges: (p.badges || []).slice(), title: p.title || '', stats: p.stats || parseStats_('') };
  if (admin) { out.coins = ADMIN_COINS; out.owned = Object.keys(MECH_PRICES); out.skins = Object.keys(SKIN_PRICES); }
  if (out.owned.indexOf(out.selected) === -1) out.selected = 'starter';
  if (out.skins.indexOf(out.skin) === -1) out.skin = 'default';
  return out;
}

/* ------------------------------------------------------------------ */
/*  Admins & coin gifts                                                */
/* ------------------------------------------------------------------ */

function adminMap_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADMINS);
  var map = {};
  if (!sh) return map;
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    var e = String(r[0] || '').trim().toLowerCase();
    if (e && String(r[1] || 'YES').trim().toUpperCase() !== 'NO') map[e] = true;
  });
  return map;
}

function isAdmin_(email) { return !!adminMap_()[String(email).toLowerCase()]; }

// 依照 CoinGifts 分页发金币。每一行只会发给同一个人一次（用 Gift ID 记录）。
function applyGifts_(found) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_GIFTS);
  if (!sh) return 0;
  var values = sh.getDataRange().getValues();
  var p = found.data, added = 0, changed = false;
  for (var i = 1; i < values.length; i++) {
    var who = String(values[i][0] || '').trim().toLowerCase();
    var amount = Math.round(Number(values[i][1]) || 0);
    if (!who || !amount) continue;
    var id = String(values[i][3] || '').trim();
    if (!id) {
      id = 'G' + Date.now().toString(36) + i;
      sh.getRange(i + 1, 4, 1, 1).setValues([[id]]);
    }
    var match = who === 'all' || who === p.email.toLowerCase() || who === String(p.cls).toLowerCase();
    if (!match || p.gifts.indexOf(id) !== -1) continue;
    p.gifts.push(id);
    p.coins = Math.max(0, p.coins + amount);
    added += amount; changed = true;
  }
  if (changed) writePlayer_(found.row, p);
  return added;
}

function findPlayer_(email) {
  var sh = playersSheet_();
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) return { row: i + 1, data: rowToPlayer_(values[i]) };
  }
  return null;
}

function writePlayer_(row, p) {
  var sh = playersSheet_();
  var vals = [[p.email, p.cls, p.seat, p.name, p.nickname, p.coins, p.owned.join(','), p.selected, new Date(),
    (p.gifts || []).join(','), (p.skins || ['default']).join(','), p.skin || 'default', p.xp || 0,
    (p.badges || []).join(','), p.title || '', JSON.stringify(p.stats || {})]];
  if (row) sh.getRange(row, 1, 1, vals[0].length).setValues(vals);
  else sh.appendRow(vals[0]);
}

function saveProfile_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var s = getSettings_();
  var cls = String(body.cls || '').trim();
  var seat = String(body.seat || '').trim();
  var name = String(body.name || '').trim().replace(/\s+/g, ' ');
  var nick = String(body.nickname || '').trim();
  var admin = isAdmin_(email);
  if (s.classList.indexOf(cls) === -1 && !(admin && cls === STAFF_CLASS)) return { ok: false, error: 'bad_class', message: 'Please choose your class.' };
  if (!/^\d{1,2}$/.test(seat) || Number(seat) < 1) return { ok: false, error: 'bad_seat', message: 'Seat number must be 1–99.' };
  if (name.length < 1 || name.length > 40) return { ok: false, error: 'bad_name', message: 'Please enter your name (max 40 characters).' };
  var nickErr = checkNickname_(nick);
  if (nickErr) return { ok: false, error: 'bad_nickname', message: nickErr };

  var sh = playersSheet_();
  var values = sh.getDataRange().getValues();
  var lowerNick = nick.toLowerCase();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() !== email && String(values[i][4]).toLowerCase() === lowerNick) {
      return { ok: false, error: 'nick_taken', message: 'That nickname is already taken. Try another one.' };
    }
  }
  var found = findPlayer_(email);
  var p = found ? found.data : { email: email, coins: 0, owned: ['starter'], selected: 'starter', gifts: [],
    skins: ['default'], skin: 'default', xp: 0, badges: [], title: '', stats: parseStats_('') };
  p.cls = cls; p.seat = seat; p.name = name; p.nickname = nick;
  writePlayer_(found ? found.row : null, p);
  var gift = applyGifts_(findPlayer_(email));
  return { ok: true, player: publicPlayer_(findPlayer_(email).data, admin), admin: admin, gift: gift };
}

function buyMech_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var id = String(body.mech || '');
  if (!(id in MECH_PRICES)) return { ok: false, error: 'bad_mech' };
  var p = found.data, admin = isAdmin_(email);
  if (admin || p.owned.indexOf(id) !== -1) {
    p.selected = id; writePlayer_(found.row, p);
    return { ok: true, player: publicPlayer_(p, admin) };
  }
  if (p.coins < MECH_PRICES[id]) return { ok: false, error: 'not_enough_coins', player: publicPlayer_(p, admin) };
  p.coins -= MECH_PRICES[id];
  p.owned.push(id);
  p.selected = id;
  writePlayer_(found.row, p);
  return { ok: true, player: publicPlayer_(p, admin) };
}

function selectMech_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var id = String(body.mech || '');
  var admin = isAdmin_(email);
  if (!(id in MECH_PRICES) || (!admin && found.data.owned.indexOf(id) === -1)) return { ok: false, error: 'not_owned', player: publicPlayer_(found.data, admin) };
  found.data.selected = id;
  writePlayer_(found.row, found.data);
  return { ok: true, player: publicPlayer_(found.data, admin) };
}

function buySkin_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var id = String(body.skin || '');
  if (!(id in SKIN_PRICES)) return { ok: false, error: 'bad_skin' };
  var p = found.data, admin = isAdmin_(email);
  if (admin || p.skins.indexOf(id) !== -1) { p.skin = id; writePlayer_(found.row, p); return { ok: true, player: publicPlayer_(p, admin) }; }
  if (p.coins < SKIN_PRICES[id]) return { ok: false, error: 'not_enough_coins', player: publicPlayer_(p, admin) };
  p.coins -= SKIN_PRICES[id];
  p.skins.push(id);
  p.skin = id;
  writePlayer_(found.row, p);
  return { ok: true, player: publicPlayer_(p, admin) };
}

function selectSkin_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var id = String(body.skin || ''), admin = isAdmin_(email);
  if (!(id in SKIN_PRICES) || (!admin && found.data.skins.indexOf(id) === -1)) return { ok: false, error: 'not_owned', player: publicPlayer_(found.data, admin) };
  found.data.skin = id;
  writePlayer_(found.row, found.data);
  return { ok: true, player: publicPlayer_(found.data, admin) };
}

function setTitle_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var id = String(body.title || ''), admin = isAdmin_(email);
  var allowed = id === '' || (badgeById_(id) && (admin || found.data.badges.indexOf(id) !== -1));
  if (!allowed) return { ok: false, error: 'not_earned', player: publicPlayer_(found.data, admin) };
  found.data.title = id;
  writePlayer_(found.row, found.data);
  CacheService.getScriptCache().remove('leaderboard');
  return { ok: true, player: publicPlayer_(found.data, admin) };
}

/* ------------------------------------------------------------------ */
/*  Pilot level, badges & titles (same rules as js/progress.js)        */
/* ------------------------------------------------------------------ */

var BADGES = [
  { id: 'rookie', test: function (s) { return s.games >= 1; } },
  { id: 'ace', test: function (s) { return s.kills >= 100; } },
  { id: 'veteran', test: function (s) { return s.kills >= 1000; } },
  { id: 'legend', test: function (s) { return s.kills >= 5000; } },
  { id: 'boss10', test: function (s) { return s.bosses >= 10; } },
  { id: 'boss50', test: function (s) { return s.bosses >= 50; } },
  { id: 'combo50', test: function (s) { return s.bestCombo >= 50; } },
  { id: 'combo100', test: function (s) { return s.bestCombo >= 100; } },
  { id: 'perfect', test: function (s) { return s.perfect >= 1; } },
  { id: 'speed40', test: function (s) { return s.bestWpm >= 40; } },
  { id: 'speed60', test: function (s) { return s.bestWpm >= 60; } },
  { id: 'speed80', test: function (s) { return s.bestWpm >= 80; } },
  { id: 'week5', test: function (s) { return s.weekDays >= 5; } },
  { id: 'streak7', test: function (s) { return s.bestStreak >= 7; } },
  { id: 'avenger', test: function (s) { return s.revenge >= 20; } },
  { id: 'festival', test: function (s) { return s.eventGames >= 1; } },
  { id: 'squad', test: function (s) { return s.mpWins >= 1; } },
  { id: 'level10', test: function (s, lv) { return lv >= 10; } },
  { id: 'level20', test: function (s, lv) { return lv >= 20; } },
];
function badgeById_(id) { for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) return BADGES[i]; return null; }

// 升到 L+1 级需要累计 50 × L × (L+1) XP：Lv2=100, Lv3=300, Lv4=600, Lv5=1000 …（最高 50 级）
function levelFromXp_(xp) { var L = 1; while (L < 50 && xp >= 50 * L * (L + 1)) L++; return L; }

function xpForGame_(r) {
  var kills = clamp_(Number(r.kills) || 0, 0, 2000), bosses = clamp_(Number(r.bosses) || 0, 0, 50);
  var stage = clamp_(Number(r.stage) || 1, 1, 100), wpm = clamp_(Number(r.wpm) || 0, 0, 150), acc = clamp_(Number(r.accuracy) || 0, 0, 100);
  return Math.min(3000, Math.round(kills * 5 + bosses * 50 + stage * 20 + wpm * acc / 100));
}

function applyProgress_(p, r, nowMs) {
  var s = p.stats = p.stats || parseStats_('');
  var before = levelFromXp_(p.xp || 0);
  var acc = clamp_(Number(r.accuracy) || 0, 0, 100), wpm = clamp_(Number(r.wpm) || 0, 0, 250);
  s.games += 1;
  s.kills += clamp_(Number(r.kills) || 0, 0, 2000);
  s.bosses += clamp_(Number(r.bosses) || 0, 0, 50);
  s.bestCombo = Math.max(s.bestCombo, clamp_(Number(r.maxCombo) || 0, 0, 2000));
  if (acc >= 80) s.bestWpm = Math.max(s.bestWpm, Math.round(wpm * 10) / 10);
  if (acc >= 100 && (Number(r.keys) || 0) >= 30) s.perfect += 1;
  s.revenge += clamp_(Number(r.revengeKills) || 0, 0, 100);
  if (r.event) s.eventGames += 1;
  if (r.mode === 'Multi' && Number(r.mpRank) === 1 && Number(r.mpPlayers) >= 2) s.mpWins += 1;
  var now = nowMs || Date.now(), today = ymd_(new Date(now)), yesterday = ymd_(new Date(now - 86400000));
  if (s.days.indexOf(today) === -1) {
    s.streak = s.lastDay === yesterday ? s.streak + 1 : 1;
    s.days.push(today); s.days = s.days.slice(-14);
  }
  s.lastDay = today;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  var weekStart = ymd_(new Date(weekStartMs_(now)));
  s.weekDays = s.days.filter(function (d) { return d >= weekStart; }).length;
  var gain = xpForGame_(r);
  p.xp = (p.xp || 0) + gain;
  var level = levelFromXp_(p.xp);
  var fresh = [];
  p.badges = p.badges || [];
  BADGES.forEach(function (b) { if (p.badges.indexOf(b.id) === -1 && b.test(s, level)) { p.badges.push(b.id); fresh.push(b.id); } });
  return { xpGain: gain, levelBefore: before, level: level, newBadges: fresh };
}

/* ------------------------------------------------------------------ */
/*  Scores                                                             */
/* ------------------------------------------------------------------ */

function submitScore_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var p = found.data;
  var r = body.result || {};
  var wpm = clamp_(Number(r.wpm) || 0, 0, 250);
  var acc = clamp_(Number(r.accuracy) || 0, 0, 100);
  var survival = clamp_(Math.round(Number(r.survival) || 0), 0, 36000);
  var diff = ['Easy', 'Normal', 'Hard'].indexOf(r.difficulty) >= 0 ? r.difficulty : 'Normal';
  var mistakes = (Array.isArray(r.mistyped) ? r.mistyped : []).slice(0, 60).map(function (m) {
    var w = String(m.word || '').replace(/[^A-Za-z'\-]/g, '').slice(0, 30);
    var n = Math.max(1, Math.min(99, Number(m.count) || 1));
    return w ? (n > 1 ? w + '(' + n + ')' : w) : '';
  }).filter(String).join(', ');

  var sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_SCORES, SCORE_HEADERS);
  sh.appendRow([new Date(), p.cls, p.seat, p.name, p.nickname, email, diff,
    String(r.wordBank || '').slice(0, 40), Math.round(wpm * 10) / 10, Math.round(acc * 10) / 10, survival,
    Math.max(0, Math.round(Number(r.score) || 0)), Math.max(1, Math.round(Number(r.stage) || 1)),
    mistakes, String(r.mech || '').slice(0, 20), r.mode === 'Multi' ? 'Multi' : 'Solo',
    clamp_(Math.round(Number(r.kills) || 0), 0, 2000), clamp_(Math.round(Number(r.maxCombo) || 0), 0, 2000)]);

  // 金币：设上限，防止有人改网页乱加钱
  var maxCoins = (Number(r.kills) || 0) * 25 + (Number(r.bosses) || 0) * 400;
  var earned = clamp_(Math.round(Number(r.coins) || 0), 0, Math.min(maxCoins, 8000));
  p.coins += earned;
  var evId = String(r.event || '').toLowerCase();
  r.event = EVENT_IDS.indexOf(evId) !== -1 && getSettings_().disabledEvents.indexOf(evId) === -1 ? evId : '';
  var progress = applyProgress_(p, r);
  writePlayer_(found.row, p);
  var gift = applyGifts_(found);
  CacheService.getScriptCache().remove('leaderboard');
  var admin = isAdmin_(email);
  return { ok: true, player: publicPlayer_(p, admin), admin: admin, coinsAdded: earned, gift: gift, progress: progress };
}

function clamp_(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function readScores_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCORES);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[5]) continue;
    out.push({
      time: r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime(),
      cls: String(r[1]), seat: String(r[2]), name: String(r[3]), nickname: String(r[4]),
      email: String(r[5]).toLowerCase(), difficulty: String(r[6]), wordBank: String(r[7]),
      wpm: Number(r[8]) || 0, acc: Number(r[9]) || 0, survival: Number(r[10]) || 0,
      score: Number(r[11]) || 0, stage: Number(r[12]) || 0, mistyped: String(r[13] || ''),
      mode: String(r[15] || 'Solo'), kills: Number(r[16]) || 0, maxCombo: Number(r[17]) || 0,
    });
  }
  return out;
}

function playerMap_() {
  var map = {};
  playersSheet_().getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0]) map[String(r[0]).toLowerCase()] = rowToPlayer_(r);
  });
  return map;
}

/* ------------------------------------------------------------------ */
/*  Leaderboard (only nicknames are sent out)                          */
/* ------------------------------------------------------------------ */

function weekStartMs_(nowMs) {
  var offset = 8 * 3600 * 1000; // Malaysia UTC+8
  var local = new Date((nowMs || Date.now()) + offset);
  var dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - offset;
}

function getLeaderboard_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('leaderboard');
  if (hit) return JSON.parse(hit);
  var s = getSettings_();
  var players = playerMap_();
  var admins = adminMap_();
  // 排行榜只算单人模式、不算管理员
  var scores = readScores_().filter(function (r) { return r.acc >= s.minAcc && r.mode !== 'Multi' && !admins[r.email]; });
  var weekStart = weekStartMs_();
  var out = { ok: true, minAccuracy: s.minAcc, weekStart: weekStart, boards: {},
    classBattle: classBattle_(readScores_().filter(function (r) { return !admins[r.email] && r.cls !== STAFF_CLASS; }), weekStart, s.classList) };
  ['Easy', 'Normal', 'Hard'].forEach(function (d) {
    var rows = scores.filter(function (r) { return r.difficulty === d; });
    out.boards[d] = {
      week: topTen_(rows.filter(function (r) { return r.time >= weekStart; }), players),
      all: topTen_(rows, players),
    };
  });
  cache.put('leaderboard', JSON.stringify(out), 60);
  return out;
}

function topTen_(rows, players) {
  var best = {};
  rows.forEach(function (r) {
    var b = best[r.email];
    if (!b || r.wpm > b.wpm || (r.wpm === b.wpm && r.acc > b.acc)) best[r.email] = r;
  });
  return Object.keys(best).map(function (k) { return best[k]; })
    .sort(function (a, b) { return b.wpm - a.wpm || b.acc - a.acc; })
    .slice(0, 10)
    .map(function (r) {
      var p = players[r.email];
      return { nickname: (p && p.nickname) || r.nickname || 'Pilot', title: (p && p.title) || '', level: p ? levelFromXp_(p.xp) : 1,
        wpm: r.wpm, acc: r.acc, time: r.time };
    });
}

// 班级对抗赛：本周每班击坠总数（单人+多人都算）；也回传上周冠军
function classBattle_(rows, weekStart, classList) {
  function tally(from, to) {
    var t = {};
    rows.forEach(function (r) {
      if (r.time < from || r.time >= to) return;
      var c = t[r.cls] = t[r.cls] || { cls: r.cls, kills: 0, games: 0, pilots: {} };
      c.kills += r.kills; c.games += 1; c.pilots[r.email] = 1;
    });
    return Object.keys(t).map(function (k) { var c = t[k]; return { cls: c.cls, kills: c.kills, games: c.games, pilots: Object.keys(c.pilots).length }; })
      .sort(function (a, b) { return b.kills - a.kills || b.pilots - a.pilots; });
  }
  var week = tally(weekStart, Infinity);
  classList.forEach(function (c) { if (!week.some(function (w) { return w.cls === c; })) week.push({ cls: c, kills: 0, games: 0, pilots: 0 }); });
  var last = tally(weekStart - 7 * 86400000, weekStart);
  return { week: week, lastChampion: last.length && last[0].kills > 0 ? last[0] : null };
}

/* ------------------------------------------------------------------ */
/*  Teacher dashboard (password checked here, never in the web page)  */
/* ------------------------------------------------------------------ */

function teacher_(body) {
  var s = getSettings_();
  if (!s.TeacherPassword || String(body.password || '') !== s.TeacherPassword) {
    Utilities.sleep(800);
    return { ok: false, error: 'wrong_password' };
  }
  var players = playerMap_();
  var admins = adminMap_();
  var scores = readScores_().filter(function (r) { return !admins[r.email]; }).sort(function (a, b) { return a.time - b.time; });

  var byStudent = {};
  scores.forEach(function (r) { (byStudent[r.email] = byStudent[r.email] || []).push(r); });

  var students = Object.keys(byStudent).map(function (email) {
    var games = byStudent[email];
    var p = players[email] || {};
    var last = games[games.length - 1];
    var firstN = games.slice(0, 3), lastN = games.slice(-3);
    var firstAvg = avg_(firstN.map(function (g) { return g.wpm; }));
    var recentAvg = avg_(lastN.map(function (g) { return g.wpm; }));
    var bestGame = games.reduce(function (a, b) { return b.wpm > a.wpm ? b : a; });
    return {
      email: email, cls: p.cls || last.cls, seat: p.seat || last.seat, name: p.name || last.name,
      nickname: p.nickname || last.nickname, games: games.length,
      bestWpm: bestGame.wpm, bestAcc: bestGame.acc, bestDifficulty: bestGame.difficulty,
      firstAvg: round1_(firstAvg), recentAvg: round1_(recentAvg),
      improvement: games.length >= 2 ? round1_(recentAvg - firstAvg) : null,
      avgAcc: round1_(avg_(games.map(function (g) { return g.acc; }))),
      lastPlayed: last.time,
    };
  }).sort(function (a, b) {
    return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : (Number(a.seat) || 0) - (Number(b.seat) || 0);
  });

  var classNames = s.classList.slice();
  scores.forEach(function (r) { if (classNames.indexOf(r.cls) === -1) classNames.push(r.cls); });

  var classes = classNames.map(function (c) {
    var rows = scores.filter(function (r) { return r.cls === c; });
    var studs = students.filter(function (st) { return st.cls === c; });
    return {
      cls: c, games: rows.length, students: studs.length,
      avgWpm: round1_(avg_(rows.map(function (r) { return r.wpm; }))),
      avgBestWpm: round1_(avg_(studs.map(function (st) { return st.bestWpm; }))),
      avgAcc: round1_(avg_(rows.map(function (r) { return r.acc; }))),
      topMistakes: topMistakes_(rows, 20),
    };
  });

  return {
    ok: true, classes: classes, students: students,
    allMistakes: topMistakes_(scores, 20), totalGames: scores.length,
  };
}

function topMistakes_(rows, n) {
  var counts = {};
  rows.forEach(function (r) {
    r.mistyped.split(',').forEach(function (part) {
      var m = part.trim().match(/^([A-Za-z'\-]+)(?:\((\d+)\))?$/);
      if (!m) return;
      var w = m[1].toLowerCase();
      counts[w] = (counts[w] || 0) + (Number(m[2]) || 1);
    });
  });
  return Object.keys(counts).map(function (w) { return { word: w, count: counts[w] }; })
    .sort(function (a, b) { return b.count - a.count || (a.word < b.word ? -1 : 1); })
    .slice(0, n);
}

function avg_(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }
function round1_(v) { return Math.round(v * 10) / 10; }

/* ------------------------------------------------------------------ */
/*  Nickname filter (English, Malay, Chinese, dialects, Tamil)         */
/* ------------------------------------------------------------------ */

// 只要花名「包含」这些字就不接受
var BANNED_CONTAINS = [
  // English
  'fuck', 'fck', 'fuk', 'fvck', 'shit', 'bitch', 'bastard', 'cunt', 'pussy', 'whore', 'slut', 'nigger', 'nigga',
  'faggot', 'retard', 'asshole', 'arsehole', 'dickhead', 'motherf', 'penis', 'vagina', 'dildo', 'porn', 'horny',
  'wanker', 'bollock', 'boob', 'nazi', 'hitler', 'killyourself', 'suicide', 'jackass', 'dumbass', 'bullshit',
  'sexy', 'blowjob', 'handjob', 'orgasm', 'masturbat', 'testicle', 'scrotum', 'nipple', 'hentai', 'milf',
  // Malay
  'bodoh', 'bangang', 'puki', 'pukimak', 'kimak', 'pantat', 'lancau', 'butoh', 'burit', 'pepek', 'sundal',
  'jalang', 'celaka', 'keparat', 'bangsat', 'pundek', 'lahanat', 'haramjadah', 'mampus', 'bahlul', 'goblok',
  'kepalabapak', 'anakharam', 'tetek', 'konek', 'pelacur', 'sial',
  // Hokkien / Cantonese / Singlish (romanised)
  'kanina', 'kannina', 'cibai', 'chibai', 'cheebye', 'cheebai', 'lanjiao', 'lanjiu', 'kaninabu', 'nabeh',
  'diulei', 'diuneilomo', 'dllm', 'pukai', 'pokgai', 'hamkachan', 'hamgachan', 'kaisai', 'sohai', 'sorhai',
  'lampa', 'kukujiao',
  // Tamil (romanised)
  'punda', 'thevidiya', 'koothi', 'oombu',
  // 华文（简体 / 繁体 / 粤语）
  '操你', '肏', '屌', '屄', '傻逼', '傻b', '煞笔', '沙比', '他妈', '他媽', '你妈', '你媽', '妈的', '媽的', '草泥马',
  '草泥馬', '尼玛', '尼瑪', '卧槽', '臥槽', '我操', '干你', '幹你', '鸡巴', '雞巴', '鸡掰', '雞掰', '机掰', '機掰', '靠北',
  '靠杯', '贱人', '賤人', '婊', '妓女', '白痴', '白癡', '智障', '脑残', '腦殘', '废物', '廢物', '滚蛋', '滾蛋', '去死',
  '王八蛋', '混蛋', '狗娘', '杂种', '雜種', '屁眼', '阴道', '陰道', '阴茎', '陰莖', '色情', '做爱', '做愛', '性交',
  '淫', '撚', '閪', '仆街', '扑街', '冚家', '戇鳩', '戆鸠', '賤', '贱', '死全家', '操', '妈逼', '媽逼',
];
// 花名「整个等于」这些字才不接受（因为它们常出现在正常英文字里，例如 class 里有 ass）
var BANNED_EXACT = [
  'ass', 'arse', 'dick', 'cock', 'cum', 'tit', 'tits', 'fag', 'sex', 'rape', 'kys', 'wtf', 'stfu', 'piss',
  'twat', 'babi', 'bodo', 'kote', 'knn', 'diu', 'otha', 'hell', 'damn', 'crap', 'gay', 'homo', 'anal', 'anus',
  'pimp', 'lj', 'cb', 'mf', 'bj', 'sb', '幹', '干', '逼', '死',
];

function normalizeNick_(s) {
  var leet = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i' };
  s = String(s).toLowerCase().replace(/[01345789@$!]/g, function (c) { return leet[c] || c; });
  s = s.replace(/[^a-z㐀-鿿]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

function extraBanned_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BANNED);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1).map(function (r) { return String(r[0]).trim(); }).filter(String);
}

function checkNickname_(nick) {
  if (nick.length < 2 || nick.length > 12) return 'Nickname must be 2–12 characters.';
  if (!/^[A-Za-z0-9_\-㐀-鿿]+$/.test(nick)) return 'Use only letters, numbers, Chinese characters, _ or - (no spaces).';
  var n = normalizeNick_(nick);
  // 也检查「只去掉符号、不做数字转换」的版本，避免误判
  var plain = String(nick).toLowerCase().replace(/[^a-z㐀-鿿]/g, '');
  var candidates = [n, plain, plain.replace(/(.)\1+/g, '$1')];
  var contains = BANNED_CONTAINS.concat(extraBanned_());
  for (var i = 0; i < contains.length; i++) {
    var w = normalizeNick_(contains[i]);
    if (!w) continue;
    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j].indexOf(w) !== -1) return 'That nickname is not allowed. Please choose a friendly one.';
    }
  }
  for (var k = 0; k < BANNED_EXACT.length; k++) {
    var x = normalizeNick_(BANNED_EXACT[k]);
    if (candidates.indexOf(x) !== -1) return 'That nickname is not allowed. Please choose a friendly one.';
  }
  return '';
}
