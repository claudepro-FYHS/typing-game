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
  'Stats (auto — do not edit)', 'Class Year (auto)'];
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
  ['ClassCounts', 'J1:12, J2:12, J3:12, S1AC:4, S1S:6, S2AC:4, S2S:6, S3AC:4, S3S:6', '每个年段有几班（请改成学校真实的班数）。学生先选年段再选班号，班级会存成 J105、S2AC3 这样的格式'],
  ['SchoolYear', '', '学年。留空 = 自动用今年年份：每年 1 月 1 日起，学生登入时要重新选班级和座号（金币、机体、等级都保留）'],
  ['AllowOtherAccounts', 'YES', 'YES = 校外的 Google 账号也可以登入、上排行榜（不列入班级对抗和老师后台的班级统计）；NO = 只限学校账号'],
  ['Classes', '', '（旧设定）只有 ClassCounts 留空时才会用这个班级列表，用逗号分隔'],
  ['TeacherPassword', 'change-me-2026', '老师后台密码（请务必改掉）'],
  ['GoogleClientId', '', 'Google Cloud 的 Client ID（xxx.apps.googleusercontent.com）'],
  ['SchoolDomain', 'foonyew.edu.my', '学校邮箱域名'],
  ['LeaderboardMinAccuracy', '80', '准确率达到多少 % 才能上排行榜'],
  ['TestSheetId', '', '打字测验的试算表 ID（网址 /d/ 和 /edit 中间那串）。两个打字游戏填同一个 ID，就共用测验设定和成绩。留空 = 用这个试算表'],
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
var OTHER_CLASS = 'OTHER'; // 校外 Google 账号

var GAME_TITLE = 'Mecha Strike Typer';
var TOKEN_HOURS = 12;
var TZ = 'Asia/Kuala_Lumpur';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function setup() {
  SETTINGS_MEMO_ = null;
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
  try { setupTest_(); } catch (e) { Logger.log('Typing test sheet: ' + e); }
  CacheService.getScriptCache().remove('config');
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

// Settings are read from the sheet once per request (many functions need them).
var SETTINGS_MEMO_ = null;
function getSettings_() {
  if (SETTINGS_MEMO_) return SETTINGS_MEMO_;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var st = ss.getSheetByName(SHEET_SETTINGS);
  if (!st) { setup(); st = ss.getSheetByName(SHEET_SETTINGS); }
  var out = {};
  st.getDataRange().getValues().forEach(function (r) { out[String(r[0]).trim()] = String(r[1]).trim(); });
  out.grades = parseClassCounts_(out.ClassCounts);
  out.classList = out.grades.length ? classListFromGrades_(out.grades)
    : String(out.Classes || '').split(/[,，、;\s]+/).map(function (s) { return s.trim(); }).filter(String);
  out.schoolYear = /^\d{4}$/.test(String(out.SchoolYear || '')) ? String(out.SchoolYear) : ymd_(new Date()).slice(0, 4);
  out.allowOthers = String(out.AllowOtherAccounts || 'YES').trim().toUpperCase() !== 'NO';
  out.minAcc = Number(out.LeaderboardMinAccuracy) || 0;
  out.domain = (out.SchoolDomain || 'foonyew.edu.my').toLowerCase();
  out.disabledEvents = String(out.DisabledEvents || '').toLowerCase().split(/[,，、;\s]+/).filter(String);
  SETTINGS_MEMO_ = out;
  return out;
}

// "J1:12, S2AC:4" -> [{ grade: 'J1', count: 12 }, { grade: 'S2AC', count: 4 }]
function parseClassCounts_(v) {
  var out = [];
  String(v || '').split(/[,，、;\n]+/).forEach(function (part) {
    var m = part.trim().match(/^([A-Za-z0-9]+)\s*[:：=]\s*(\d{1,2})$/);
    if (m && Number(m[2]) > 0) out.push({ grade: m[1].toUpperCase(), count: Number(m[2]) });
  });
  return out;
}

// 初中班号补 0（J105），高中不补（S2AC3）
function classCode_(grade, n) {
  return grade + (grade.charAt(0) === 'J' && n < 10 ? '0' + n : String(n));
}

function classListFromGrades_(grades) {
  var list = [];
  grades.forEach(function (g) { for (var n = 1; n <= g.count; n++) list.push(classCode_(g.grade, n)); });
  return list;
}

function isSchoolEmail_(email, s) { return String(email).toLowerCase().split('@')[1] === s.domain; }

/* ------------------------------------------------------------------ */
/*  HTTP entry points                                                  */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  SETTINGS_MEMO_ = null;
  try {
    if (p.action === 'config') return json_(cachedConfig_());
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
  SETTINGS_MEMO_ = null;
  try {
    switch (body.action) {
      case 'login': return json_(login_(body));
      case 'me': return json_(me_(body));
      case 'saveProfile': return json_(withLock_(function () { return saveProfile_(body); }));
      case 'submitScore': return json_(withLock_(function () { return submitScore_(body); }));
      case 'buyMech': return json_(withLock_(function () { return buyMech_(body); }));
      case 'selectMech': return json_(withLock_(function () { return selectMech_(body); }));
      case 'buySkin': return json_(withLock_(function () { return buySkin_(body); }));
      case 'selectSkin': return json_(withLock_(function () { return selectSkin_(body); }));
      case 'setTitle': return json_(withLock_(function () { return setTitle_(body); }));
      case 'teacher': return json_(teacher_(body));
      case 'testInfo': return json_(testInfo_(body));
      case 'testStart': return json_(withLock_(function () { return testStart_(body); }));
      case 'testFinish': return json_(withLock_(function () { return testFinish_(body); }));
      case 'testPing': return json_(testPing_(body));
      case 'tTests': return json_(tTests_(body));
      case 'tMonitor': return json_(tMonitor_(body));
      case 'tCreate': return json_(withLock_(function () { return tCreate_(body); }));
      case 'tUpdate': return json_(withLock_(function () { return tUpdate_(body); }));
      case 'tExtra': return json_(withLock_(function () { return tExtra_(body); }));
      case 'tEnd': return json_(withLock_(function () { return tEnd_(body); }));
      case 'config': return json_(cachedConfig_());
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

// When the whole class saves at once, requests queue for the lock. If the queue is too long,
// answer "busy" (the web page waits a moment and tries again) instead of crashing.
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(28000)) return { ok: false, error: 'busy' };
  try { return fn(); } finally { lock.releaseLock(); }
}

// Every page load asks for the config, so keep it in the cache for 60 s.
function cachedConfig_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('config');
  if (hit) return JSON.parse(hit);
  var c = getPublicConfig_();
  cache.put('config', JSON.stringify(c), 60);
  return c;
}

function getPublicConfig_() {
  var s = getSettings_();
  return { ok: true, classes: s.classList, grades: s.grades, schoolYear: s.schoolYear, allowOthers: s.allowOthers,
    clientId: s.GoogleClientId || '', domain: s.domain, minAccuracy: s.minAcc,
    eventWindows: eventWindows_(), disabledEvents: s.disabledEvents, test: testActive_() };
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
  // Google sometimes answers "busy" when a whole class signs in at once: wait and ask again.
  var res = null, code = 0;
  for (var attempt = 0; attempt < 4; attempt++) {
    if (attempt) Utilities.sleep(400 * attempt + Math.floor(Math.random() * 400));
    try {
      res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' +
        encodeURIComponent(String(body.idToken || '')), { muteHttpExceptions: true });
      code = res.getResponseCode();
    } catch (e) { code = 0; }
    if (code === 200 || code === 400 || code === 401) break;
  }
  if (code === 400 || code === 401) return { ok: false, error: 'bad_token' };
  if (code !== 200) return { ok: false, error: 'google_busy' };
  var info = JSON.parse(res.getContentText());
  if (info.aud !== s.GoogleClientId) return { ok: false, error: 'bad_token' };
  if (String(info.email_verified) !== 'true') return { ok: false, error: 'bad_token' };
  var email = String(info.email || '').toLowerCase();
  if (email.split('@')[1] !== s.domain && !s.allowOthers) return { ok: false, error: 'not_school', email: email };
  var result = refreshPlayer_(email);
  if (!result.ok) return result;
  result.token = makeToken_(email);
  result.email = email;
  return result;
}

// 读取玩家资料，顺便发放老师送的金币；回传给网页的玩家资料（管理员会显示无限金币）
// Only reads the sheet, so many students can sign in at the same time. The lock is taken
// only when a teacher's coin gift has to be written to the player's row.
function refreshPlayer_(email) {
  var admin = isAdmin_(email), teacher = admin || isTestTeacher_(email); // teacher: may open typing tests (and pick STAFF)
  var found = findPlayer_(email);
  if (!found) return { ok: true, player: null, admin: admin, teacher: teacher, gift: 0 };
  if (!hasNewGift_(found.data)) return { ok: true, player: publicPlayer_(found.data, admin), admin: admin, teacher: teacher, gift: 0 };
  return withLock_(function () {
    var fresh = findPlayer_(email);
    var gift = applyGifts_(fresh);
    return { ok: true, player: publicPlayer_(fresh.data, admin), admin: admin, teacher: teacher, gift: gift };
  });
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
    classYear: String(r[16] || ''),
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
  var s = getSettings_(), school = isSchoolEmail_(p.email, s);
  // 学校账号：新学年，或班级已经不在班级列表里 → 要重新选班级
  var needsClass = school && p.cls !== STAFF_CLASS && (p.classYear !== s.schoolYear || s.classList.indexOf(p.cls) === -1);
  var out = { email: p.email, cls: p.cls, seat: p.seat, name: p.name, nickname: p.nickname, school: school, needsClass: needsClass,
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
    if (!giftMatches_(who, p) || p.gifts.indexOf(id) !== -1) continue;
    p.gifts.push(id);
    p.coins = Math.max(0, p.coins + amount);
    added += amount; changed = true;
  }
  if (changed) writePlayer_(found.row, p);
  return added;
}

function giftMatches_(who, p) {
  var cls = String(p.cls).toLowerCase();
  return (who === 'all' && cls !== OTHER_CLASS.toLowerCase()) || who === p.email.toLowerCase() || who === cls ||
    (isGradeKey_(who) && cls.indexOf(who) === 0);
}

// Read-only check: is there a gift (or a new gift row without an ID yet) for this player?
function hasNewGift_(p) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_GIFTS);
  if (!sh) return false;
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var who = String(values[i][0] || '').trim().toLowerCase();
    if (!who || !Math.round(Number(values[i][1]) || 0)) continue;
    var id = String(values[i][3] || '').trim();
    if (!id || (giftMatches_(who, p) && p.gifts.indexOf(id) === -1)) return true;
  }
  return false;
}

// "J1", "S2", "S2AC" … in CoinGifts → every class of that grade
function isGradeKey_(who) {
  if (/^[js][1-3]$/.test(who)) return true;
  return getSettings_().grades.some(function (g) { return g.grade.toLowerCase() === who; });
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
    (p.badges || []).join(','), p.title || '', JSON.stringify(p.stats || {}), p.classYear || '']];
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
  var school = isSchoolEmail_(email, s);
  if (!school) {
    // 校外账号：不用班级和座号，名字可以不填
    if (!s.allowOthers) return { ok: false, error: 'not_school', message: 'Only school accounts can play right now.' };
    cls = OTHER_CLASS; seat = '';
    if (name.length > 40) return { ok: false, error: 'bad_name', message: 'Name: max 40 characters.' };
  } else {
    if (s.classList.indexOf(cls) === -1 && !((admin || isTestTeacher_(email)) && cls === STAFF_CLASS)) return { ok: false, error: 'bad_class', message: 'Please choose your class.' };
    if (!/^\d{1,2}$/.test(seat) || Number(seat) < 1) return { ok: false, error: 'bad_seat', message: 'Seat number must be 1–99.' };
    if (name.length < 1 || name.length > 40) return { ok: false, error: 'bad_name', message: 'Please enter your name (max 40 characters).' };
  }
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
  if (school) p.classYear = s.schoolYear;
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
  // 校外账号：AllowOtherAccounts = NO 时也不显示
  var visible = function (r) { return !admins[r.email] && (s.allowOthers || isSchoolEmail_(r.email, s)); };
  var all = readScores_();
  var scores = all.filter(function (r) { return r.acc >= s.minAcc && r.mode !== 'Multi' && visible(r); });
  var weekStart = weekStartMs_();
  var out = { ok: true, minAccuracy: s.minAcc, weekStart: weekStart, boards: {},
    classBattle: classBattle_(all.filter(function (r) {
      return !admins[r.email] && isSchoolEmail_(r.email, s) && r.cls !== STAFF_CLASS && r.cls !== OTHER_CLASS;
    }), weekStart, s.classList) };
  ['Easy', 'Normal', 'Hard'].forEach(function (d) {
    var rows = scores.filter(function (r) { return r.difficulty === d; });
    out.boards[d] = {
      week: topTen_(rows.filter(function (r) { return r.time >= weekStart; }), players, s),
      all: topTen_(rows, players, s),
    };
  });
  cache.put('leaderboard', JSON.stringify(out), 60);
  return out;
}

function topTen_(rows, players, s) {
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
        wpm: r.wpm, acc: r.acc, time: r.time, ext: !isSchoolEmail_(r.email, s) };
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
  // 上周冠军：初中（J…）、高中（S…）、全校各一个
  function champ(prefix) {
    var c = last.filter(function (r) { return !prefix || r.cls.charAt(0) === prefix; })[0];
    return c && c.kills > 0 ? c : null;
  }
  return { week: week, lastChampion: champ(''), champions: { junior: champ('J'), senior: champ('S'), all: champ('') } };
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

  // 只列出有人玩过的班级（全校六十多班，没玩过的不显示），顺序照班级列表；校外账号归在 OTHER
  var played = {};
  scores.forEach(function (r) { played[r.cls] = true; });
  var classNames = s.classList.filter(function (c) { return played[c]; });
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

/* ------------------------------------------------------------------ */
/*  Typing test 打字测验 (the same code is in both typing games)       */
/* ------------------------------------------------------------------ */
// Teachers open tests on the website (📝 TYPING TEST → TEACHER CONSOLE). Who may: the emails in the
// TestTeachers tab, plus the Admins (who see every teacher's tests). Tabs (in this spreadsheet, or in
// Settings → TestSheetId): TestSettings (defaults + scoring), Tests (one row per test the teachers
// opened), TestTeachers, TestExtra (extra attempts per student), TestAttempts, TestResults.
// Scoring: Net WPM = WPM × accuracy. Net 10 = 40 points, rising in a straight line to 100 at the
// full-marks speed of the student's form (TestFullWPM, never below 40). Accuracy under
// TestPassAccuracy halves that attempt. The best attempt counts.
var SHEET_TEST_SETTINGS = 'TestSettings', SHEET_TEST_ATTEMPTS = 'TestAttempts', SHEET_TEST_RESULTS = 'TestResults';
var SHEET_TESTS = 'Tests', SHEET_TEST_TEACHERS = 'TestTeachers', SHEET_TEST_EXTRA = 'TestExtra';
var TEST_ATTEMPT_HEADERS = ['Time', 'Test Code', 'Attempt ID', 'Email', 'Class', 'Seat No', 'Name', 'Game', 'Attempt No', 'Status',
  'Start (ms)', 'Minutes', 'Seconds', 'WPM', 'Accuracy (%)', 'Net WPM', 'Score', 'Keys', 'Errors', 'Words'];
var TEST_RESULT_HEADERS = ['Test Code', 'Class', 'Seat No', 'Name', 'Email', 'Attempts Used', 'Score (best)', 'Net WPM', 'WPM',
  'Accuracy (%)', 'Game', 'Updated'];
var TESTS_HEADERS = ['Code', 'Teacher', 'Classes', 'Minutes', 'Attempts', 'Word Bank', 'Status', 'Created', 'Closed'];
var TEST_TEACHER_HEADERS = ['Email', 'Name', 'Note'];
var TEST_EXTRA_HEADERS = ['Test Code', 'Email', 'Extra Attempts', 'Updated', 'By'];
var TEST_DEFAULTS = [
  ['TestMinutes', '5', '新测验的预设时间（分钟）。老师在网站开考时可以改'],
  ['TestAttempts', '2', '新测验的预设次数（取最高分）。老师在网站开考时可以改'],
  ['TestWordBank', 'everyday', '新测验的预设词库 ID'],
  ['TestFullWPM', 'J1:40, J2:40, J3:45, S1:45, S2:45, S3:45', '各年段 Net WPM 达到多少拿满分（最低 40）'],
  ['TestPassAccuracy', '85', '准确率低于这个 %，该次分数减半'],
];
// how-to note written next to the settings (column E of TestSettings)
var TEST_HELP = [
  ['📝 如何让老师开测验'],
  ['1. 在 TestTeachers 分页加一行：老师的学校 email（A 栏）、名字（B 栏）。'],
  ['2. 老师用这个 email 登入游戏网站 → 📝 TYPING TEST → 👩‍🏫 TEACHER CONSOLE。'],
  ['3. 老师在网站开考：选班级、时间、次数、词库、代号；可看到谁在考、结束某人的作答、加次数、关闭测验、下载 Excel 成绩。'],
  ['Admins 分页的人可以看到所有老师的测验。'],
  ['这一页只放预设值和评分规则；测验记录在 Tests / TestAttempts / TestResults 分页，请不要手动修改。'],
];

function testBook_() {
  var id = String(getSettings_().TestSheetId || '').trim();
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function setupTest_() {
  var ss = testBook_();
  var st = ss.getSheetByName(SHEET_TEST_SETTINGS);
  if (!st) {
    st = ss.insertSheet(SHEET_TEST_SETTINGS);
    st.getRange(1, 1, 1, 3).setValues([['Key', 'Value', '说明']]).setFontWeight('bold');
  }
  var have = st.getDataRange().getValues().map(function (r) { return String(r[0]); });
  TEST_DEFAULTS.forEach(function (row) { if (have.indexOf(row[0]) === -1) st.appendRow(row); });
  if (!String(st.getRange(1, 5).getValue())) st.getRange(1, 5, TEST_HELP.length, 1).setValues(TEST_HELP);
  ensureSheet_(ss, SHEET_TESTS, TESTS_HEADERS);
  ensureSheet_(ss, SHEET_TEST_TEACHERS, TEST_TEACHER_HEADERS);
  ensureSheet_(ss, SHEET_TEST_EXTRA, TEST_EXTRA_HEADERS);
  ensureSheet_(ss, SHEET_TEST_ATTEMPTS, TEST_ATTEMPT_HEADERS);
  ensureSheet_(ss, SHEET_TEST_RESULTS, TEST_RESULT_HEADERS);
  testCfgClear_();
}

function testCfgClear_() { CacheService.getScriptCache().remove('testcfg2'); }

// settings + the open tests (cached 30 s; every teacher change clears it)
function testConfig_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('testcfg2');
  if (hit) return JSON.parse(hit);
  var ss = testBook_(), st = ss.getSheetByName(SHEET_TEST_SETTINGS);
  if (!st) { setupTest_(); st = ss.getSheetByName(SHEET_TEST_SETTINGS); }
  var raw = {};
  st.getDataRange().getValues().forEach(function (r) { raw[String(r[0]).trim()] = String(r[1] == null ? '' : r[1]).trim(); });
  var full = {};
  String(raw.TestFullWPM || '').split(/[,，、;\n]+/).forEach(function (part) {
    var m = part.trim().match(/^([A-Za-z0-9]+)\s*[:：=]\s*(\d+(?:\.\d+)?)$/);
    if (m) full[m[1].toUpperCase()] = Math.max(40, Number(m[2]));
  });
  var cfg = {
    minutes: clamp_(Number(raw.TestMinutes) || 5, 1, 15),
    attempts: clamp_(Math.round(Number(raw.TestAttempts) || 2), 1, 10),
    bank: String(raw.TestWordBank || '').trim() || 'everyday',
    full: full,
    passAcc: clamp_(raw.TestPassAccuracy === '' || raw.TestPassAccuracy == null ? 85 : Number(raw.TestPassAccuracy) || 0, 0, 100),
  };
  cfg.tests = testRows_(ss).filter(function (t) { return t.status === 'open'; });
  cache.put('testcfg2', JSON.stringify(cfg), 30);
  return cfg;
}

// every test in the Tests tab (oldest first)
function testRows_(ss) {
  var sh = ensureSheet_(ss, SHEET_TESTS, TESTS_HEADERS), v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (!String(r[0] || '').trim()) continue;
    out.push({ row: i + 1, code: String(r[0]).trim(), teacher: String(r[1] || '').toLowerCase(), classes: splitClasses_(r[2]),
      minutes: clamp_(Number(r[3]) || 5, 1, 15), attempts: clamp_(Math.round(Number(r[4]) || 2), 1, 10),
      bank: String(r[5] || '').trim() || 'everyday', status: String(r[6] || '').trim().toLowerCase() === 'open' ? 'open' : 'closed',
      created: r[7] instanceof Date ? r[7].getTime() : Number(r[7]) || 0 });
  }
  return out;
}

// full-marks Net WPM for a class: the longest matching prefix in TestFullWPM (J2 matches J205), at least 40
function testFullWpm_(cls, cfg) {
  cls = String(cls || '').toUpperCase();
  var best = 0, len = -1;
  for (var k in cfg.full) if (cls.indexOf(k) === 0 && k.length > len) { best = cfg.full[k]; len = k.length; }
  return Math.max(40, best || 40);
}

function testScore_(net, acc, full, passAcc) {
  var sc = net >= full ? 100 : net <= 10 ? net * 4 : 40 + 60 * (net - 10) / (full - 10);
  if (acc < passAcc) sc /= 2;
  return Math.round(Math.max(0, sc));
}

// the test code a student types: case, spaces and the kind of dash don't matter
var TEST_CODE_TRIES = 5; // wrong codes in a row before a 10-minute wait
function normCode_(c) { return String(c == null ? '' : c).toUpperCase().replace(/[\s\-_－—–]+/g, ''); }
function splitClasses_(s) { return String(s || '').toUpperCase().split(/[,，、;；\s]+/).filter(String); }
function classOk_(p, classes) {
  if (!classes.length) return true;
  var c = String(p.cls || '').toUpperCase();
  return classes.some(function (x) { return c === x || c.indexOf(x) === 0; });
}
// the open tests this student may take now (newest first)
function testsFor_(p, cfg) { return cfg.tests.filter(function (t) { return classOk_(p, t.classes); }).reverse(); }

function testAttempts_(ss) {
  var sh = ensureSheet_(ss, SHEET_TEST_ATTEMPTS, TEST_ATTEMPT_HEADERS);
  return { sh: sh, values: sh.getDataRange().getValues() };
}

// this student's attempts at this test, oldest first
function testMine_(values, code, email) {
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[1]) !== code || String(r[3]).toLowerCase() !== email) continue;
    out.push(testAttemptOf_(r, i, out.length));
  }
  return out;
}
function testAttemptOf_(r, i, k) {
  return { row: i + 1, id: String(r[2]), n: Number(r[8]) || k + 1, status: String(r[9]), start: Number(r[10]) || 0,
    minutes: Number(r[11]) || 0, wpm: Number(r[13]) || 0, acc: Number(r[14]) || 0, net: Number(r[15]) || 0,
    score: r[16] === '' || r[16] == null ? null : Number(r[16]), game: String(r[7]) };
}

function testBestOf_(mine) {
  var best = null;
  mine.forEach(function (a) { if (a.score != null && (!best || a.score > best.score || (a.score === best.score && a.net > best.net))) best = a; });
  return best;
}

// extra attempts a teacher gave (code -> email -> n)
function testExtraMap_(ss, code) {
  var sh = ensureSheet_(ss, SHEET_TEST_EXTRA, TEST_EXTRA_HEADERS), v = sh.getDataRange().getValues(), map = {};
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === code) map[String(v[i][1]).toLowerCase()] = { n: Number(v[i][2]) || 0, row: i + 1 };
  return map;
}
function testAllowed_(test, extraMap, email) { var e = extraMap[email]; return Math.max(0, test.attempts + (e ? e.n : 0)); }

// one row per student and test in TestResults (written whenever an attempt starts or ends)
function testUpsertResult_(ss, code, email, p, mine) {
  var sh = ensureSheet_(ss, SHEET_TEST_RESULTS, TEST_RESULT_HEADERS);
  var values = sh.getDataRange().getValues(), row = 0;
  for (var i = 1; i < values.length; i++) if (String(values[i][0]) === code && String(values[i][4]).toLowerCase() === email) { row = i + 1; break; }
  var b = testBestOf_(mine);
  var vals = [code, p.cls, p.seat, p.name, email, mine.length, b ? b.score : 0, b ? b.net : '', b ? b.wpm : '', b ? b.acc : '',
    b ? b.game : GAME_TITLE, new Date()];
  if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
}

function testPublic_(mine) {
  return mine.map(function (a) { return { n: a.n, status: a.status, score: a.score, net: a.net, wpm: a.wpm, acc: a.acc }; });
}

/* ---------- students ---------- */
function testInfo_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var cfg = testConfig_();
  // the code itself is never sent: students must type it (from the teacher) to start
  var out = { ok: true, active: cfg.tests.length > 0, passAcc: cfg.passAcc, teacher: isTestTeacher_(email) };
  var found = findPlayer_(email);
  if (!found) { out.allowed = false; out.reason = 'no_profile'; return out; }
  var mineTests = testsFor_(found.data, cfg);
  out.allowed = mineTests.length > 0;
  out.full = testFullWpm_(found.data.cls, cfg);
  out.history = [];
  if (mineTests.length) {
    var test = mineTests[0], ss = testBook_();
    var mine = testMine_(testAttempts_(ss).values, test.code, email);
    out.minutes = test.minutes; out.attempts = testAllowed_(test, testExtraMap_(ss, test.code), email);
    out.used = mine.length; out.history = testPublic_(mine);
    var b = testBestOf_(mine); out.best = b ? b.score : null;
  }
  return out;
}

function testStart_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var cfg = testConfig_();
  if (!cfg.tests.length) return { ok: false, error: 'no_test' };
  var cache = CacheService.getScriptCache(), triesKey = 'codetries:' + email, tries = Number(cache.get(triesKey)) || 0;
  if (tries >= TEST_CODE_TRIES) return { ok: false, error: 'too_many_codes' };
  var typed = normCode_(body.code), test = cfg.tests.filter(function (x) { return normCode_(x.code) === typed; })[0];
  if (!typed || !test) { cache.put(triesKey, String(tries + 1), 600); return { ok: false, error: 'wrong_code' }; }
  var code = test.code;
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var p = found.data;
  if (!classOk_(p, test.classes)) return { ok: false, error: 'not_your_class' };
  var ss = testBook_(), t = testAttempts_(ss), mine = testMine_(t.values, code, email);
  var allowed = testAllowed_(test, testExtraMap_(ss, code), email);
  if (mine.length >= allowed) return { ok: false, error: 'no_attempts', used: mine.length };
  var id = Utilities.getUuid(), n = mine.length + 1, now = Date.now();
  t.sh.appendRow([new Date(now), code, id, email, p.cls, p.seat, p.name, GAME_TITLE, n, 'started', now, test.minutes,
    '', '', '', '', '', '', '', '']);
  mine.push({ id: id, n: n, status: 'started', start: now, minutes: test.minutes, score: null, net: 0, wpm: 0, acc: 0, game: GAME_TITLE });
  testUpsertResult_(ss, code, email, p, mine);
  return { ok: true, attemptId: id, attemptNo: n, attempts: allowed, minutes: test.minutes, bank: test.bank, code: code,
    full: testFullWpm_(p.cls, cfg), passAcc: cfg.passAcc };
}

// every ~10 s during a test: live progress for the teacher's screen (cache only, no lock, no sheet write)
function testPing_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var id = String(body.attemptId || ''); if (!id) return { ok: false, error: 'no_attempt' };
  var cache = CacheService.getScriptCache();
  cache.put('live:' + id, JSON.stringify({ c: Math.max(0, Number(body.correct) || 0), k: Math.max(0, Number(body.keys) || 0),
    w: Math.max(0, Number(body.words) || 0), t: Date.now() }), 1800);
  return { ok: true, kicked: !!cache.get('kick:' + id) };
}

// scores an attempt over `minutes` and writes it (used by testFinish_ and by the teacher ending an attempt)
function testScoreRow_(ss, t, ri, r, cfg, minutes, secs, correct, keys, words, status) {
  var email = String(r[3]).toLowerCase(), full = testFullWpm_(r[4], cfg);
  var wpm = correct / 5 / minutes, acc = keys ? correct / keys * 100 : 0;
  if (wpm > 220) { status = 'rejected (too fast)'; wpm = 0; acc = 0; }
  var net = wpm * acc / 100, score = testScore_(net, acc, full, cfg.passAcc);
  wpm = round1_(wpm); acc = round1_(acc); net = round1_(net);
  t.sh.getRange(ri + 1, 10, 1, 11).setValues([[status, Number(r[10]), round1_(minutes), secs, wpm, acc, net, score, keys, keys - correct, words]]);
  var mine = testMine_(t.values, String(r[1]), email), id = String(r[2]);
  mine.forEach(function (a) { if (a.id === id) { a.status = status; a.wpm = wpm; a.acc = acc; a.net = net; a.score = score; } });
  var found = findPlayer_(email), p = found ? found.data : { cls: r[4], seat: r[5], name: r[6] };
  testUpsertResult_(ss, String(r[1]), email, p, mine);
  return { wpm: wpm, acc: acc, net: net, score: score, status: status, full: full, mine: mine };
}

function testFinish_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var ss = testBook_(), t = testAttempts_(ss), id = String(body.attemptId || ''), r = null, ri = 0;
  for (var i = 1; i < t.values.length; i++) if (String(t.values[i][2]) === id && String(t.values[i][3]).toLowerCase() === email) { r = t.values[i]; ri = i; break; }
  if (!r) return { ok: false, error: 'no_attempt' };
  var code = String(r[1]), cfg = testConfig_(), minutes = Number(r[11]) || cfg.minutes;
  var test = testRows_(ss).filter(function (x) { return x.code === code; })[0];
  var allowed = test ? testAllowed_(test, testExtraMap_(ss, code), email) : Number(r[8]) || 1;
  if (String(r[9]) !== 'started') { // sent twice (network retry) or ended by the teacher: answer with what is saved
    var mine0 = testMine_(t.values, code, email), b0 = testBestOf_(mine0);
    return { ok: true, already: true, status: String(r[9]), attemptNo: Number(r[8]), attempts: allowed, wpm: Number(r[13]) || 0, accuracy: Number(r[14]) || 0,
      net: Number(r[15]) || 0, score: Number(r[16]) || 0, best: b0 ? b0.score : null, full: testFullWpm_(r[4], cfg), history: testPublic_(mine0) };
  }
  var secs = Math.round((Date.now() - Number(r[10])) / 1000), left = !!body.left;
  if (!left && secs < minutes * 60 - 20) return { ok: false, error: 'too_early' };
  var keys = clamp_(Math.round(Number(body.keys) || 0), 0, 200000);
  var correct = clamp_(Math.round(Number(body.correct) || 0), 0, keys);
  var words = clamp_(Math.round(Number(body.words) || 0), 0, 20000);
  var s = testScoreRow_(ss, t, ri, r, cfg, minutes, secs, correct, keys, words, left ? 'left page' : 'finished');
  var b = testBestOf_(s.mine);
  return { ok: true, attemptNo: Number(r[8]), attempts: allowed, wpm: s.wpm, accuracy: s.acc, net: s.net, score: s.score, status: s.status,
    best: b ? b.score : null, full: s.full, passAcc: cfg.passAcc, history: testPublic_(s.mine) };
}

// for the config: is a test running right now? (never breaks the config if the test sheet can't be opened)
function testActive_() { try { return testConfig_().tests.length > 0; } catch (e) { return false; } }

/* ---------- teachers (TEACHER CONSOLE on the website) ---------- */
function isTestTeacher_(email) {
  email = String(email || '').toLowerCase(); if (!email) return false;
  if (isAdmin_(email)) return true;
  try {
    var sh = testBook_().getSheetByName(SHEET_TEST_TEACHERS); if (!sh) return false;
    return sh.getDataRange().getValues().slice(1).some(function (r) { return String(r[0] || '').trim().toLowerCase() === email; });
  } catch (e) { return false; }
}
// the signed-in teacher, or an error
function testTeacher_(body) {
  var email = checkToken_(body.token);
  if (!email) return { error: 'session_expired' };
  if (!isTestTeacher_(email)) return { error: 'not_teacher' };
  return { email: email, admin: isAdmin_(email) };
}
function testTeacherNames_(ss) {
  var sh = ensureSheet_(ss, SHEET_TEST_TEACHERS, TEST_TEACHER_HEADERS), map = {};
  sh.getDataRange().getValues().slice(1).forEach(function (r) { var e = String(r[0] || '').trim().toLowerCase(); if (e) map[e] = String(r[1] || '').trim(); });
  return map;
}
function testPublicTest_(t, names) {
  return { code: t.code, teacher: t.teacher, teacherName: (names && names[t.teacher]) || t.teacher, classes: t.classes.join(', '),
    minutes: t.minutes, attempts: t.attempts, bank: t.bank, status: t.status, created: t.created };
}
// a test this teacher may manage (own tests; admins: all)
function testOwned_(ss, T, code) {
  var test = testRows_(ss).filter(function (x) { return x.code === String(code || ''); })[0];
  if (!test) return { error: 'no_such_test' };
  if (!T.admin && test.teacher !== T.email) return { error: 'not_your_test' };
  return { test: test };
}
var TEST_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
function testNewCode_(ss) {
  var used = {}; testRows_(ss).forEach(function (t) { used[normCode_(t.code)] = true; });
  for (var k = 0; k < 50; k++) {
    var c = ''; for (var i = 0; i < 5; i++) c += TEST_CODE_CHARS.charAt(Math.floor(Math.random() * TEST_CODE_CHARS.length));
    c = c.slice(0, 2) + '-' + c.slice(2);
    if (!used[normCode_(c)] && /[A-Z]/.test(c)) return c;
  }
  return 'T-' + Date.now().toString(36).toUpperCase();
}

function tTests_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = testBook_(), cfg = testConfig_(), names = testTeacherNames_(ss);
  var list = testRows_(ss).filter(function (t) { return T.admin || t.teacher === T.email; }).reverse().map(function (t) { return testPublicTest_(t, names); });
  return { ok: true, admin: T.admin, email: T.email, tests: list, suggest: testNewCode_(ss),
    defaults: { minutes: cfg.minutes, attempts: cfg.attempts, bank: cfg.bank }, full: cfg.full, passAcc: cfg.passAcc };
}

function tCreate_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = testBook_(), cfg = testConfig_();
  var classes = splitClasses_(body.classes);
  if (!classes.length) return { ok: false, error: 'need_classes' };
  if (classes.some(function (c) { return !/^[JS][1-6][A-Z0-9]*$/.test(c); })) return { ok: false, error: 'bad_classes' };
  var code = String(body.code || '').trim().toUpperCase().slice(0, 20) || testNewCode_(ss);
  if (!/[A-Z]/.test(code) || normCode_(code).length < 3) return { ok: false, error: 'bad_code' };
  if (testRows_(ss).some(function (t) { return normCode_(t.code) === normCode_(code); })) return { ok: false, error: 'code_used' };
  var minutes = clamp_(Math.round(Number(body.minutes) || cfg.minutes), 1, 15), attempts = clamp_(Math.round(Number(body.attempts) || cfg.attempts), 1, 10);
  var bank = String(body.bank || cfg.bank).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'everyday';
  ensureSheet_(ss, SHEET_TESTS, TESTS_HEADERS).appendRow([code, T.email, classes.join(', '), minutes, attempts, bank, 'open', new Date(), '']);
  testCfgClear_();
  var test = testRows_(ss).filter(function (x) { return x.code === code; })[0];
  return { ok: true, test: testPublicTest_(test, testTeacherNames_(ss)) };
}

// change a test: status (open / closed), attempts, minutes (new attempts only), classes
function tUpdate_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = testBook_(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var test = o.test, sh = ss.getSheetByName(SHEET_TESTS);
  if (body.status === 'open' || body.status === 'closed') {
    if (body.status === 'open' && testConfig_().tests.some(function (x) { return x.code !== test.code && normCode_(x.code) === normCode_(test.code); })) return { ok: false, error: 'code_used' };
    sh.getRange(test.row, 7, 1, 3).setValues([[body.status, new Date(test.created || Date.now()), body.status === 'closed' ? new Date() : '']]);
  }
  if (body.attempts != null) sh.getRange(test.row, 5).setValues([[clamp_(Math.round(Number(body.attempts) || 1), 1, 10)]]);
  if (body.minutes != null) sh.getRange(test.row, 4).setValues([[clamp_(Math.round(Number(body.minutes) || 5), 1, 15)]]);
  if (body.classes != null) {
    var classes = splitClasses_(body.classes);
    if (!classes.length) return { ok: false, error: 'need_classes' };
    if (classes.some(function (c) { return !/^[JS][1-6][A-Z0-9]*$/.test(c); })) return { ok: false, error: 'bad_classes' };
    sh.getRange(test.row, 3).setValues([[classes.join(', ')]]);
  }
  testCfgClear_();
  var fresh = testRows_(ss).filter(function (x) { return x.code === test.code; })[0];
  return { ok: true, test: testPublicTest_(fresh, testTeacherNames_(ss)) };
}

// give one student more (or fewer) attempts than the test's number
function tExtra_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = testBook_(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var email = String(body.email || '').trim().toLowerCase(); if (!email) return { ok: false, error: 'no_student' };
  var delta = clamp_(Math.round(Number(body.delta) || 0), -5, 5);
  var map = testExtraMap_(ss, o.test.code), cur = map[email] ? map[email].n : 0;
  var n = clamp_(cur + delta, -o.test.attempts, 10), sh = ss.getSheetByName(SHEET_TEST_EXTRA);
  if (map[email]) sh.getRange(map[email].row, 3, 1, 3).setValues([[n, new Date(), T.email]]);
  else sh.appendRow([o.test.code, email, n, new Date(), T.email]);
  return { ok: true, extra: n, allowed: Math.max(0, o.test.attempts + n) };
}

// the teacher ends a student's attempt: scored with what was typed so far, over the time used; it counts as used
function tEnd_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = testBook_(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var t = testAttempts_(ss), id = String(body.attemptId || ''), r = null, ri = 0;
  for (var i = 1; i < t.values.length; i++) if (String(t.values[i][2]) === id && String(t.values[i][1]) === o.test.code) { r = t.values[i]; ri = i; break; }
  if (!r) return { ok: false, error: 'no_attempt' };
  if (String(r[9]) !== 'started') return { ok: false, error: 'not_running' };
  var cache = CacheService.getScriptCache(), live = JSON.parse(cache.get('live:' + id) || '{}');
  var minutesSet = Number(r[11]) || o.test.minutes, secs = Math.round((Date.now() - Number(r[10])) / 1000);
  var used = Math.max(0.1, Math.min(minutesSet, secs / 60));
  var keys = Math.max(0, Math.round(live.k || 0)), correct = Math.min(keys, Math.max(0, Math.round(live.c || 0)));
  var s = testScoreRow_(ss, t, ri, r, testConfig_(), used, secs, correct, keys, Math.round(live.w || 0), 'ended by teacher');
  cache.put('kick:' + id, '1', 3600);
  return { ok: true, score: s.score, net: s.net };
}

// everyone who joined this test, with their attempts and live progress
function tMonitor_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = testBook_(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var test = o.test, v = testAttempts_(ss).values, extra = testExtraMap_(ss, test.code), byEmail = {}, order = [], liveKeys = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (String(r[1]) !== test.code) continue;
    var email = String(r[3]).toLowerCase();
    if (!byEmail[email]) { byEmail[email] = { email: email, cls: String(r[4]), seat: String(r[5]), name: String(r[6]), attempts: [] }; order.push(email); }
    var a = testAttemptOf_(r, i, byEmail[email].attempts.length);
    byEmail[email].cls = String(r[4]); byEmail[email].seat = String(r[5]); byEmail[email].name = String(r[6]);
    byEmail[email].attempts.push(a);
    if (a.status === 'started') liveKeys.push('live:' + a.id);
  }
  var live = liveKeys.length ? CacheService.getScriptCache().getAll(liveKeys) : {}, now = Date.now();
  var students = order.map(function (e) {
    var s = byEmail[e], b = testBestOf_(s.attempts);
    s.allowed = testAllowed_(test, extra, e); s.extra = extra[e] ? extra[e].n : 0;
    s.best = b ? { score: b.score, net: b.net, wpm: b.wpm, acc: b.acc } : null;
    s.attempts = s.attempts.map(function (a) {
      var out = { id: a.id, n: a.n, status: a.status, score: a.score, net: a.net, wpm: a.wpm, acc: a.acc, game: a.game };
      if (a.status === 'started') {
        var L = live['live:' + a.id] ? JSON.parse(live['live:' + a.id]) : null, secs = (now - a.start) / 1000;
        out.secsLeft = Math.max(0, Math.round(a.minutes * 60 - secs));
        out.lost = secs > a.minutes * 60 + 60; // never finished (page closed / crashed)
        if (L) { out.words = L.w; out.liveWpm = round1_(L.c / 5 / Math.max(0.1, secs / 60)); out.liveAcc = L.k ? round1_(L.c / L.k * 100) : 0; }
      }
      return out;
    });
    return s;
  });
  return { ok: true, test: testPublicTest_(test, testTeacherNames_(ss)), students: students, now: now };
}
