/**
 * 钢弹击字 Mecha Strike Typer — Google Apps Script 接收端
 *
 * 把整个文件的内容贴进 Apps Script 编辑器的 Code.gs（取代原本的内容）。
 * 第一次使用：在上方函数选单选「setup」→ 按「Run / 运行」→ 授权。
 * 之后：部署 → 新部署 → 网页应用（执行身份：我；谁可以访问：任何人）。
 *
 * 老师平时只需要改 Google Sheet 里的「Settings」分页：
 *   Classes          班级列表（用逗号分隔）
 *   TeacherPassword  老师后台密码
 *   GoogleClientId   Google Cloud 的 Client ID
 */

var SHEET_SCORES = 'Scores';
var SHEET_PLAYERS = 'Players';
var SHEET_SETTINGS = 'Settings';
var SHEET_BANNED = 'BannedWords';

var SCORE_HEADERS = ['Time', 'Class', 'Seat No', 'Name', 'Nickname', 'Email', 'Difficulty', 'Word Bank',
  'WPM', 'Accuracy (%)', 'Survival (s)', 'Score', 'Stage', 'Mistyped Words', 'Mech'];
var PLAYER_HEADERS = ['Email', 'Class', 'Seat No', 'Name', 'Nickname', 'Coins', 'Owned Mechs',
  'Selected Mech', 'Last Updated'];

var DEFAULT_SETTINGS = [
  ['Classes', '1A, 1B, 1C, 2A, 2B, 2C, 3A, 3B, 3C', '班级列表，用逗号分隔。例如：1A, 1B, 2A'],
  ['TeacherPassword', 'change-me-2026', '老师后台密码（请务必改掉）'],
  ['GoogleClientId', '', 'Google Cloud 的 Client ID（xxx.apps.googleusercontent.com）'],
  ['SchoolDomain', 'foonyew.edu.my', '学校邮箱域名'],
  ['LeaderboardMinAccuracy', '80', '准确率达到多少 % 才能上排行榜'],
];

// 机体价钱（要和网页 index.html 里的 MECHS 一致）
var MECH_PRICES = { starter: 0, guardian: 300, striker: 300, phantom: 500, seraph: 1200 };

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
      case 'saveProfile': return json_(withLock_(function () { return saveProfile_(body); }));
      case 'submitScore': return json_(withLock_(function () { return submitScore_(body); }));
      case 'buyMech': return json_(withLock_(function () { return buyMech_(body); }));
      case 'selectMech': return json_(withLock_(function () { return selectMech_(body); }));
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
  return { ok: true, classes: s.classList, clientId: s.GoogleClientId || '', domain: s.domain, minAccuracy: s.minAcc };
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
  var player = findPlayer_(email);
  return { ok: true, token: makeToken_(email), email: email, player: player ? player.data : null };
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
  };
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
  var vals = [[p.email, p.cls, p.seat, p.name, p.nickname, p.coins, p.owned.join(','), p.selected, new Date()]];
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
  if (s.classList.indexOf(cls) === -1) return { ok: false, error: 'bad_class', message: 'Please choose your class.' };
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
  var p = found ? found.data : { email: email, coins: 0, owned: ['starter'], selected: 'starter' };
  p.cls = cls; p.seat = seat; p.name = name; p.nickname = nick;
  writePlayer_(found ? found.row : null, p);
  return { ok: true, player: p };
}

function buyMech_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var id = String(body.mech || '');
  if (!(id in MECH_PRICES)) return { ok: false, error: 'bad_mech' };
  var p = found.data;
  if (p.owned.indexOf(id) !== -1) return { ok: true, player: p };
  if (p.coins < MECH_PRICES[id]) return { ok: false, error: 'not_enough_coins', player: p };
  p.coins -= MECH_PRICES[id];
  p.owned.push(id);
  p.selected = id;
  writePlayer_(found.row, p);
  return { ok: true, player: p };
}

function selectMech_(body) {
  var email = checkToken_(body.token);
  if (!email) return { ok: false, error: 'session_expired' };
  var found = findPlayer_(email);
  if (!found) return { ok: false, error: 'no_profile' };
  var id = String(body.mech || '');
  if (found.data.owned.indexOf(id) === -1) return { ok: false, error: 'not_owned', player: found.data };
  found.data.selected = id;
  writePlayer_(found.row, found.data);
  return { ok: true, player: found.data };
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
    mistakes, String(r.mech || '').slice(0, 20)]);

  // 金币：设上限，防止有人改网页乱加钱
  var maxCoins = (Number(r.kills) || 0) * 12 + (Number(r.bosses) || 0) * 250;
  var earned = clamp_(Math.round(Number(r.coins) || 0), 0, Math.min(maxCoins, 5000));
  p.coins += earned;
  writePlayer_(found.row, p);
  CacheService.getScriptCache().remove('leaderboard');
  return { ok: true, player: p, coinsAdded: earned };
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

function weekStartMs_() {
  var offset = 8 * 3600 * 1000; // Malaysia UTC+8
  var local = new Date(Date.now() + offset);
  var dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - offset;
}

function getLeaderboard_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('leaderboard');
  if (hit) return JSON.parse(hit);
  var s = getSettings_();
  var players = playerMap_();
  var scores = readScores_().filter(function (r) { return r.acc >= s.minAcc; });
  var weekStart = weekStartMs_();
  var out = { ok: true, minAccuracy: s.minAcc, weekStart: weekStart, boards: {} };
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
      return { nickname: (p && p.nickname) || r.nickname || 'Pilot', wpm: r.wpm, acc: r.acc, time: r.time };
    });
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
  var scores = readScores_().sort(function (a, b) { return a.time - b.time; });

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
