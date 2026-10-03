const { makeEnv } = require('./mockgas');
const assert = require('assert');
const { ctx, sheets } = makeEnv();
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).content);
const get = p => JSON.parse(ctx.doGet({ parameter: p }).content);
ctx.setup();
// set client id + password
sheets.Settings.data.forEach(r => { if (r[0] === 'GoogleClientId') r[1] = 'cid'; if (r[0] === 'TeacherPassword') r[1] = 'pw123'; });
let c = get({ action: 'config' }); assert(c.ok && c.classes.length === 66 && c.grades.length === 9 && c.allowOthers === true && c.clientId === 'cid', JSON.stringify(c).slice(0, 300));
assert.deepEqual([c.classes[0], c.classes[11], c.classes[36], c.classes[65]], ['J101', 'J112', 'S1AC1', 'S3S6']);
const setSetting = (k, v) => { sheets.Settings.data.find(r => r[0] === k)[1] = v; };
setSetting('AllowOtherAccounts', 'NO');
// login
let r = post({ action: 'login', idToken: 'fake:someone@gmail.com' }); assert.equal(r.error, 'not_school');
setSetting('AllowOtherAccounts', 'YES');
r = post({ action: 'login', idToken: 'bad' }); assert.equal(r.error, 'bad_token');
r = post({ action: 'login', idToken: 'fake:Stu1@foonyew.edu.my' }); assert(r.ok && r.player === null, JSON.stringify(r));
const tok = r.token;
// tampered token
r = post({ action: 'saveProfile', token: tok.slice(0, -2) + 'xx', cls: 'J101', seat: '3', name: 'A', nickname: 'Hero' }); assert.equal(r.error, 'session_expired');
// nickname filter
const bad = ['fuck', 'FvCk99', 'sh1t', 'Cibai', 'knn', 'lanjiao', 'bodoh', '傻逼', '他媽的', 'ass', 'puki', 'kanina', '操你', 'babi', 'b4b1', 'Diulei'];
for (const n of bad) { r = post({ action: 'saveProfile', token: tok, cls: 'J101', seat: '3', name: 'Tan', nickname: n }); assert.equal(r.error, 'bad_nickname', n + ' ' + JSON.stringify(r)); }
const good = ['Classy', 'StarPilot7', 'Passion', 'Assassin', '小明', 'Fu_Hao', 'Hello', 'Babies', 'Scunthorpe'.slice(0, 10)];
for (const n of good) { const e = ctx.checkNickname_(n); console.log('nick', n, '->', e || 'OK'); }
r = post({ action: 'saveProfile', token: tok, cls: '9Z', seat: '3', name: 'Tan', nickname: 'Hero' }); assert.equal(r.error, 'bad_class');
r = post({ action: 'saveProfile', token: tok, cls: 'J101', seat: '3', name: 'Tan Ah Kow', nickname: 'Hero' }); assert(r.ok, JSON.stringify(r));
// second student can't take same nickname
const tok2 = post({ action: 'login', idToken: 'fake:stu2@foonyew.edu.my' }).token;
r = post({ action: 'saveProfile', token: tok2, cls: 'J102', seat: '5', name: 'Lee', nickname: 'hero' }); assert.equal(r.error, 'nick_taken');
r = post({ action: 'saveProfile', token: tok2, cls: 'J102', seat: '5', name: 'Lee', nickname: 'Zoomer' }); assert(r.ok);
// scores
const res = (wpm, acc, diff, mis, coins) => ({ difficulty: diff, wordBank: 'Everyday Words', wpm, accuracy: acc, survival: 95, score: 1234, stage: 2, kills: 20, bosses: 1, coins, mistyped: mis, mech: 'starter' });
r = post({ action: 'submitScore', token: tok, result: res(20, 90, 'Normal', [{ word: 'because', count: 2 }, { word: 'friend', count: 1 }], 100) }); assert(r.ok && r.player.coins === 100, JSON.stringify(r));
r = post({ action: 'submitScore', token: tok, result: res(25, 95, 'Normal', [{ word: 'because', count: 1 }], 99999) }); assert(r.ok && r.coinsAdded === 900, JSON.stringify(r)); // capped 20*25+400
r = post({ action: 'submitScore', token: tok, result: res(31, 70, 'Normal', [], 10) }); assert(r.ok);
r = post({ action: 'submitScore', token: tok2, result: res(40, 97, 'Hard', [{ word: 'river', count: 3 }], 10) }); assert(r.ok);
// buy
r = post({ action: 'buyMech', token: tok, mech: 'seraph' }); assert.equal(r.error, 'not_enough_coins');
r = post({ action: 'buyMech', token: tok, mech: 'aile' }); assert(r.ok && r.player.owned.includes('aile') && r.player.coins === 710, JSON.stringify(r));
r = post({ action: 'selectMech', token: tok, mech: 'seraph' }); assert.equal(r.error, 'not_owned');
r = post({ action: 'selectMech', token: tok, mech: 'starter' }); assert(r.ok && r.player.selected === 'starter');
// re-login returns player
r = post({ action: 'login', idToken: 'fake:stu1@foonyew.edu.my' }); assert(r.player && r.player.nickname === 'Hero' && r.player.coins === 710);
// leaderboard
const lb = get({ action: 'leaderboard' });
assert(lb.ok); assert.equal(lb.boards.Normal.all.length, 1); assert.equal(lb.boards.Normal.all[0].wpm, 25); // 31 wpm has 70% acc -> excluded
assert.equal(lb.boards.Hard.week[0].nickname, 'Zoomer');
assert(!JSON.stringify(lb).includes('Tan') && !JSON.stringify(lb).includes('foonyew'), 'leaks personal info');
// teacher
r = post({ action: 'teacher', password: 'nope' }); assert.equal(r.error, 'wrong_password');
r = post({ action: 'teacher', password: 'pw123' }); assert(r.ok);
const s1 = r.students.find(s => s.nickname === 'Hero');
assert.equal(s1.games, 3); assert.equal(s1.bestWpm, 31); assert.equal(s1.improvement, 0);
const c1a = r.classes.find(c => c.cls === 'J101'); assert.equal(c1a.games, 3); assert.equal(c1a.topMistakes[0].word, 'because'); assert.equal(c1a.topMistakes[0].count, 3);
assert.equal(r.allMistakes[0].word, 'because');
console.log('Scores sheet:', sheets.Scores.data.slice(0, 2));
console.log('Players sheet:', sheets.Players.data);

// ---------- admins & gifts ----------
sheets.Admins.data.push(['Teacher@foonyew.edu.my', 'YES', 'me']);
let ta = post({ action: 'login', idToken: 'fake:teacher@foonyew.edu.my' });
assert(ta.ok && ta.admin === true && ta.player === null, JSON.stringify(ta));
r = post({ action: 'saveProfile', token: ta.token, cls: 'STAFF', seat: '1', name: 'Cikgu', nickname: 'Sensei' });
assert(r.ok && r.player.admin && r.player.coins === 999999 && r.player.owned.length === 15, JSON.stringify(r));
r = post({ action: 'saveProfile', token: tok, cls: 'STAFF', seat: '3', name: 'Tan Ah Kow', nickname: 'Hero' }); assert.equal(r.error, 'bad_class'); // students can't pick STAFF
r = post({ action: 'buyMech', token: ta.token, mech: 'seraph' }); assert(r.ok && r.player.selected === 'seraph' && r.player.coins === 999999);
r = post({ action: 'submitScore', token: ta.token, result: res(99, 99, 'Normal', [], 50) }); assert(r.ok);
let lb2 = JSON.parse(ctx.doGet({ parameter: { action: 'leaderboard' } }).content);
assert(!JSON.stringify(lb2).includes('Sensei'), 'admin on leaderboard');
let td = post({ action: 'teacher', password: 'pw123' });
assert(!td.students.some(s => s.nickname === 'Sensei'), 'admin in dashboard');
// multi mode not on leaderboard
r = post({ action: 'submitScore', token: tok2, result: Object.assign(res(77, 99, 'Hard', [], 5), { mode: 'Multi' }) }); assert(r.ok);
lb2 = JSON.parse(ctx.doGet({ parameter: { action: 'leaderboard' } }).content);
assert.equal(lb2.boards.Hard.all[0].wpm, 40, 'multi counted');
assert.equal(sheets.Scores.data[sheets.Scores.data.length - 1][15], 'Multi');
// gifts: by email, by class, ALL — each only once
const before1 = post({ action: 'me', token: tok }).player.coins;
sheets.CoinGifts.data.push(['stu1@foonyew.edu.my', 100, 'prize'], ['j102', 50, 'class J102'], ['ALL', 7, 'everyone']);
r = post({ action: 'me', token: tok }); assert.equal(r.player.coins, before1 + 107); assert.equal(r.gift, 107);
r = post({ action: 'me', token: tok }); assert.equal(r.player.coins, before1 + 107); assert.equal(r.gift, 0);
const s2 = post({ action: 'me', token: tok2 }); assert.equal(s2.gift, 57);
assert(sheets.CoinGifts.data.slice(1).every(row => /^G/.test(row[3])), 'gift ids');
r = post({ action: 'me', token: 'bad.token' }); assert.equal(r.error, 'session_expired');

// ---------- progression, skins, titles, events, class battle ----------
assert.equal(ctx.levelFromXp_(0), 1); assert.equal(ctx.levelFromXp_(99), 1); assert.equal(ctx.levelFromXp_(100), 2); assert.equal(ctx.levelFromXp_(300), 3); assert.equal(ctx.levelFromXp_(1e9), 50);
const tok3 = post({ action: 'login', idToken: 'fake:zed@foonyew.edu.my' }).token;
r = post({ action: 'saveProfile', token: tok3, cls: 'S3S2', seat: '9', name: 'Zed', nickname: 'ZedZ' }); assert(r.ok);
assert.equal(r.player.level, 1); assert.deepEqual(r.player.skins, ['default']);
const big = Object.assign(res(65, 100, 'Hard', [], 200), { kills: 120, bosses: 3, maxCombo: 55, keys: 400, revengeKills: 4, stage: 4 });
r = post({ action: 'submitScore', token: tok3, result: big });
assert(r.ok && r.progress, JSON.stringify(r));
console.log('progress:', JSON.stringify(r.progress), 'level', r.player.level, 'xp', r.player.xp);
['rookie', 'ace', 'boss10' /*no*/].forEach(() => {});
assert(r.player.badges.includes('rookie') && r.player.badges.includes('ace') && r.player.badges.includes('combo50') && r.player.badges.includes('perfect') && r.player.badges.includes('speed60'));
assert(!r.player.badges.includes('boss10'));
assert.equal(r.player.stats.kills, 120); assert.equal(r.player.stats.streak, 1);
// scores row has kills + combo
const lastRow = sheets.Scores.data[sheets.Scores.data.length - 1]; assert.equal(lastRow[16], 120); assert.equal(lastRow[17], 55);
// title
r = post({ action: 'setTitle', token: tok3, title: 'legend' }); assert.equal(r.error, 'not_earned');
r = post({ action: 'setTitle', token: tok3, title: 'ace' }); assert(r.ok && r.player.title === 'ace');
// skins
sheets.CoinGifts.data.push(['zed@foonyew.edu.my', 500, 'test']); post({ action: 'me', token: tok3 });
r = post({ action: 'buySkin', token: tok3, skin: 'optical' }); assert.equal(r.error, 'not_enough_coins');
r = post({ action: 'buySkin', token: tok3, skin: 'desert' }); assert(r.ok && r.player.skin === 'desert' && r.player.skins.includes('desert'), JSON.stringify(r));
r = post({ action: 'selectSkin', token: tok3, skin: 'gold' }); assert.equal(r.error, 'not_owned');
r = post({ action: 'selectSkin', token: tok3, skin: 'default' }); assert(r.ok && r.player.skin === 'default');
const adm = post({ action: 'me', token: ta.token }); assert(adm.player.skins.length === 8);
// leaderboard has title + class battle
const lb3 = JSON.parse(ctx.doGet({ parameter: { action: 'leaderboard' } }).content);
assert.equal(lb3.boards.Hard.all.find(x => x.nickname === 'ZedZ').title, 'ace');
assert(lb3.classBattle.week[0].cls === 'S3S2' && lb3.classBattle.week[0].kills === 120, JSON.stringify(lb3.classBattle));
assert(lb3.classBattle.week.some(c => c.cls === 'J103' && c.kills === 0));
assert(!lb3.classBattle.week.some(c => c.cls === 'STAFF'));
// streak logic
const fakeP = { xp: 0, badges: [], stats: ctx.parseStats_('') };
const day = 86400000, t0 = Date.UTC(2026, 9, 5, 2); // Mon 5 Oct 2026 10:00 MYT
for (let i = 0; i < 7; i++) ctx.applyProgress_(fakeP, { kills: 1, accuracy: 90, wpm: 20 }, t0 + i * day);
assert.equal(fakeP.stats.streak, 7); assert(fakeP.badges.includes('streak7')); assert(fakeP.badges.includes('week5'));
ctx.applyProgress_(fakeP, { kills: 1 }, t0 + 9 * day); assert.equal(fakeP.stats.streak, 1); assert.equal(fakeP.stats.bestStreak, 7);
// events
assert.equal(ctx.ymd_('2026-9-8'), '2026-09-08');
assert.deepEqual(JSON.parse(JSON.stringify(ctx.eventWindows_())), []); // anniversary row is blank by default
sheets.Events.data.push(['anniversary', new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 10, 3)), '']);
sheets.Events.data.push(['bogus', '2026-11-01', '2026-11-03', '']);
sheets.Events.data.push(['midautumn', '2026-09-18', '2026-10-04', '中秋节 Mid-Autumn Festival']); // old default row
assert.deepEqual(JSON.parse(JSON.stringify(ctx.eventWindows_())).map(w => w.id), ['anniversary', 'midautumn']);
ctx.setup(); // migration deletes the old default row
assert.deepEqual(JSON.parse(JSON.stringify(ctx.eventWindows_())), [{ id: 'anniversary', start: '2026-11-01', end: '2026-11-03' }]);
let cfg = JSON.parse(ctx.doGet({ parameter: { action: 'config' } }).content);
assert.equal(cfg.eventWindows.length, 1); assert.deepEqual(cfg.disabledEvents, []);
sheets.Settings.data.find(r => r[0] === 'DisabledEvents')[1] = 'Halloween， aprilfools';
cfg = JSON.parse(ctx.doGet({ parameter: { action: 'config' } }).content);
assert.deepEqual(cfg.disabledEvents, ['halloween', 'aprilfools']);
// shared calendar logic (js/calendar.js)
const cal = require('../js/calendar.js');
assert.equal(cal.pickEvent('2026-09-25').id, 'midautumn');
assert.equal(cal.pickEvent('2027-02-14').id, 'valentine');
assert.equal(cal.pickEvent('2027-02-06').id, 'cny');
assert.equal(cal.pickEvent('2027-01-20').id, 'cny');
assert.equal(cal.pickEvent('2026-12-29').id, 'newyear');
assert.equal(cal.pickEvent('2026-08-31').id, 'merdeka');
assert.equal(cal.pickEvent('2026-07-15'), null);
assert.equal(cal.pickEvent('2026-10-31', [], ['halloween']), null);
assert.equal(cal.pickEvent('2026-11-02', cfg.eventWindows).id, 'anniversary');
assert.equal(cal.festivalDay('easter', 2027), '2027-03-28');
assert.equal(cal.festivalDay('mothersday', 2026), '2026-05-10');
assert.equal(cal.festivalDay('fathersday', 2026), '2026-06-21');
for (const [ev, ok] of [['christmas', 1], ['bogus', 0], ['halloween', 0]]) {
  const before = sheets.Players.data.find(r => r[0] === 'stu2@foonyew.edu.my') ? JSON.parse(sheets.Players.data.find(r => r[0] === 'stu2@foonyew.edu.my')[15]).eventGames : 0;
  const rr = res(30, 95, 'Normal', [], 10); rr.event = ev;
  assert(post({ action: 'submitScore', token: tok2, result: rr }).ok);
  const after = JSON.parse(sheets.Players.data.find(r => r[0] === 'stu2@foonyew.edu.my')[15]).eventGames;
  assert.equal(after - before, ok, ev);
}

// ---------- classes by form, yearly reset, outside accounts ----------
assert.equal(ctx.classCode_('J1', 5), 'J105'); assert.equal(ctx.classCode_('J3', 11), 'J311'); assert.equal(ctx.classCode_('S2AC', 3), 'S2AC3');
assert.deepEqual(JSON.parse(JSON.stringify(ctx.parseClassCounts_('J1:2, s2s = 3，bad, X:0'))), [{ grade: 'J1', count: 2 }, { grade: 'S2S', count: 3 }]);
// outside Google account (AllowOtherAccounts = YES)
let ox = post({ action: 'login', idToken: 'fake:friend@gmail.com' }); assert(ox.ok && ox.player === null, JSON.stringify(ox));
r = post({ action: 'saveProfile', token: ox.token, cls: 'J101', seat: '', name: '', nickname: 'Outsider1' });
assert(r.ok && r.player.cls === 'OTHER' && r.player.seat === '' && r.player.school === false && !r.player.needsClass, JSON.stringify(r));
r = post({ action: 'submitScore', token: ox.token, result: res(60, 99, 'Easy', [], 30) }); assert(r.ok && r.player.coins === 30);
r = post({ action: 'login', idToken: 'fake:friend@gmail.com' }); assert(r.player.nickname === 'Outsider1' && r.player.coins === 30, 'outsider data kept');
let lbx = get({ action: 'leaderboard' });
assert(lbx.boards.Easy.all.some(x => x.nickname === 'Outsider1' && x.ext === true), 'outsider on leaderboard');
assert(lbx.boards.Hard.all.every(x => x.ext === false));
assert(!lbx.classBattle.week.some(w => w.cls === 'OTHER'), 'outsider in class battle');
assert(lbx.classBattle.week.find(w => w.cls === 'J101').kills > 0 && "junior" in lbx.classBattle.champions);
td = post({ action: 'teacher', password: 'pw123' });
assert(td.classes.some(x => x.cls === 'OTHER') && !td.classes.some(x => x.cls === 'S3S6'), 'teacher shows played classes only');
// gifts: ALL skips outsiders; a form (J1) reaches all its classes
const o1 = post({ action: 'me', token: ox.token }).player.coins, j1 = post({ action: 'me', token: tok2 }).player.coins;
sheets.CoinGifts.data.push(['ALL', 5, ''], ['J1', 20, 'form J1'], ['S1', 1000, 'form S1']);
assert.equal(post({ action: 'me', token: ox.token }).player.coins, o1, 'ALL gift reached outsider');
assert.equal(post({ action: 'me', token: tok2 }).player.coins, j1 + 25, 'J1 gift');
// switching outside accounts off: no login, hidden from the leaderboard
setSetting('AllowOtherAccounts', 'NO');
assert.equal(post({ action: 'login', idToken: 'fake:friend@gmail.com' }).error, 'not_school');
ctx.CacheService.getScriptCache().remove('leaderboard'); // the real cache lasts 60 s
assert(!JSON.stringify(get({ action: 'leaderboard' })).includes('Outsider1'), 'hidden when off');
setSetting('AllowOtherAccounts', 'YES');
// new school year: students must pick a class again, everything else is kept
const nextYear = String(Number(ctx.ymd_(new Date()).slice(0, 4)) + 1);
setSetting('SchoolYear', nextYear);
let me1 = post({ action: 'me', token: tok2 }).player;
assert(me1.needsClass && me1.cls === 'J102', 'needs class after new year');
assert(!post({ action: 'me', token: ox.token }).player.needsClass, 'outsiders never need a class');
r = post({ action: 'saveProfile', token: tok2, cls: 'J203', seat: '9', name: 'Lee', nickname: 'Zoomer' });
assert(r.ok && !r.player.needsClass && r.player.cls === 'J203' && r.player.coins === me1.coins && r.player.xp === me1.xp, JSON.stringify(r));
assert.equal(sheets.Players.data.find(x => x[0] === 'stu2@foonyew.edu.my')[16], nextYear);
// a class removed from ClassCounts also asks for a new class
setSetting('ClassCounts', 'J1:12, J2:2, J3:12, S1AC:4, S1S:6, S2AC:4, S2S:6, S3AC:4, S3S:6');
assert(post({ action: 'me', token: tok2 }).player.needsClass, 'class no longer exists');
setSetting('ClassCounts', 'J1:12, J2:12, J3:12, S1AC:4, S1S:6, S2AC:4, S2S:6, S3AC:4, S3S:6');
setSetting('SchoolYear', '');
console.log('ALL UNIT TESTS PASSED');
