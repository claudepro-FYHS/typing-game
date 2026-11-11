// Typing test (打字测验) backend: two games share one test spreadsheet (TestSheetId).
// Runs Code.gs twice in Node with fake Google services. Run: node unit-test-mode.js
const { makeEnv, BOOKS } = require('./mockgas');
const assert = require('assert');
const A = makeEnv(), B = makeEnv(); // "this game" and "the other game" (same Code.gs is fine for the backend)
const games = [A, B];
for (const g of games) {
  g.post = b => JSON.parse(g.ctx.doPost({ postData: { contents: JSON.stringify(b) } }).content);
  g.set = (k, v) => { g.sheets.Settings.data.find(r => r[0] === k)[1] = v; };
  g.ctx.setup();
  g.set('GoogleClientId', 'cid');
  g.set('TestSheetId', 'TESTBOOK');
  g.ctx.setup(); // creates the test tabs in the shared book
}
const book = BOOKS.TESTBOOK;
assert(book && book.sheets.TestSettings && book.sheets.TestAttempts && book.sheets.TestResults, 'test tabs made in the shared spreadsheet');
const setTest = (k, v) => { book.sheets.TestSettings.data.find(r => r[0] === k)[1] = v; for (const g of games) g.ctx.CacheService.getScriptCache().remove('testcfg'); };
const cfgOf = g => { g.ctx.CacheService.getScriptCache().remove('config'); return JSON.parse(g.ctx.doGet({ parameter: { action: 'config' } }).content); };

// score formula
const S = (net, acc, full) => A.ctx.testScore_(net, acc, full, 85);
assert.equal(S(40, 100, 40), 100); assert.equal(S(55, 99, 40), 100);
assert.equal(S(10, 100, 40), 40); assert.equal(S(5, 100, 40), 20); assert.equal(S(0, 0, 40), 0);
assert.equal(S(25, 100, 40), 70); assert.equal(S(30, 100, 45), 74);
assert.equal(S(25, 84, 40), 35, 'accuracy under 85% halves the score');
console.log('score: net 10→40, 25→70 (full 40), 30→74 (full 45), 40→100; accuracy 84% halves');
// full-marks speed per form, never below 40
setTest('TestFullWPM', 'J1:30, J2:40, J3:45, S1:45, S2:50, S2S:55');
let cfg = A.ctx.testConfig_();
assert.equal(A.ctx.testFullWpm_('J105', cfg), 40, 'below 40 is raised to 40');
assert.equal(A.ctx.testFullWpm_('J210', cfg), 40); assert.equal(A.ctx.testFullWpm_('J304', cfg), 45);
assert.equal(A.ctx.testFullWpm_('S2AC3', cfg), 50); assert.equal(A.ctx.testFullWpm_('S2S5', cfg), 55, 'longest prefix wins');
assert.equal(A.ctx.testFullWpm_('STAFF', cfg), 40);
setTest('TestFullWPM', 'J1:40, J2:40, J3:45, S1:45, S2:45, S3:45');

// students
const login = (g, email, cls, seat, name, nick) => {
  const t = g.post({ action: 'login', idToken: 'fake:' + email }).token;
  if (cls) assert(g.post({ action: 'saveProfile', token: t, cls, seat, name, nickname: nick }).ok);
  return t;
};
const s1 = login(A, 'stu1@foonyew.edu.my', 'J210', '3', 'Tan Ah Kow', 'Kow');
const s1b = login(B, 'stu1@foonyew.edu.my', 'J210', '3', 'Tan Ah Kow', 'Kow'); // the same student in the other game
const s2 = login(A, 'stu2@foonyew.edu.my', 'J304', '8', 'Lee Mei', 'Mei');
const s3 = login(A, 'stu3@foonyew.edu.my');                                   // no profile yet

// no test running
let r = A.post({ action: 'testInfo', token: s1 }); assert(r.ok && r.active === false && r.allowed === true, JSON.stringify(r));
assert.equal(cfgOf(A).test, false);
r = A.post({ action: 'testStart', token: s1, code: '' }); assert.equal(r.error, 'no_test');

// a test starts
setTest('TestCode', 'J2-T2');
assert.equal(cfgOf(A).test, true);
r = A.post({ action: 'testInfo', token: s1 });
assert(r.active && r.code === 'J2-T2' && r.minutes === 5 && r.attempts === 2 && r.used === 0 && r.full === 40 && r.bank === 'everyday', JSON.stringify(r));
r = A.post({ action: 'testInfo', token: s3 }); assert(r.allowed === false && r.reason === 'no_profile');
r = A.post({ action: 'testStart', token: s1, code: 'OLD' }); assert.equal(r.error, 'test_changed');
r = A.post({ action: 'testStart', token: 'bad.token', code: 'J2-T2' }); assert.equal(r.error, 'session_expired');

// attempt 1 (game A)
r = A.post({ action: 'testStart', token: s1, code: 'J2-T2' }); assert(r.ok && r.attemptNo === 1 && r.minutes === 5 && r.full === 40, JSON.stringify(r));
const id1 = r.attemptId;
const att = () => book.sheets.TestAttempts.data;
const rowOf = id => att().find(x => x[2] === id);
assert.equal(rowOf(id1)[9], 'started');
// finishing before 5 minutes is refused (unless the student left the page)
r = A.post({ action: 'testFinish', token: s1, attemptId: id1, correct: 900, keys: 950, words: 150 }); assert.equal(r.error, 'too_early');
rowOf(id1)[10] -= 5 * 60 * 1000; // pretend 5 minutes have passed
r = A.post({ action: 'testFinish', token: s2, attemptId: id1, correct: 900, keys: 950, words: 150 }); assert.equal(r.error, 'no_attempt', 'someone else cannot finish it');
// 750 correct keystrokes in 5 minutes = 30 WPM; 750/800 = 93.75% → net 28.1 → 40 + 60 × 18.1/30 = 76
r = A.post({ action: 'testFinish', token: s1, attemptId: id1, correct: 750, keys: 800, words: 125 });
assert(r.ok && r.wpm === 30 && r.accuracy === 93.8 && r.net === 28.1 && r.score === 76 && r.best === 76 && r.attemptNo === 1, JSON.stringify(r));
console.log('attempt 1:', JSON.stringify({ wpm: r.wpm, acc: r.accuracy, net: r.net, score: r.score }));
r = A.post({ action: 'testFinish', token: s1, attemptId: id1, correct: 2000, keys: 2000, words: 400 });
assert(r.ok && r.already && r.score === 76, 'a resend does not change the saved result');

// attempt 2 in the OTHER game: same test, shared attempts
r = B.post({ action: 'testInfo', token: s1b }); assert(r.used === 1 && r.best === 76 && r.history.length === 1, JSON.stringify(r));
r = B.post({ action: 'testStart', token: s1b, code: 'J2-T2' }); assert(r.ok && r.attemptNo === 2, JSON.stringify(r));
const id2 = r.attemptId;
rowOf(id2)[10] -= 2 * 60 * 1000;
// left the page after 2 minutes: accepted, but counted over the full 5 minutes
r = B.post({ action: 'testFinish', token: s1b, attemptId: id2, correct: 400, keys: 410, words: 70, left: true });
assert(r.ok && r.status === 'left page' && r.wpm === 16 && r.best === 76, JSON.stringify(r));
assert.equal(rowOf(id2)[7], 'Digi Monster Typer' === B.ctx.GAME_TITLE ? 'Digi Monster Typer' : B.ctx.GAME_TITLE);
// no attempts left, in either game
r = A.post({ action: 'testStart', token: s1, code: 'J2-T2' }); assert.equal(r.error, 'no_attempts');
r = B.post({ action: 'testStart', token: s1b, code: 'J2-T2' }); assert.equal(r.error, 'no_attempts');
// results: one row per student, best attempt
let res = book.sheets.TestResults.data.filter(x => x[0] === 'J2-T2');
assert.equal(res.length, 1); assert.deepEqual(res[0].slice(0, 10), ['J2-T2', 'J210', '3', 'Tan Ah Kow', 'stu1@foonyew.edu.my', 2, 76, 28.1, 30, 93.8]);

// low accuracy halves; too fast is rejected; class limit
r = A.post({ action: 'testStart', token: s2, code: 'J2-T2' }); const id3 = r.attemptId; rowOf(id3)[10] -= 301 * 1000;
r = A.post({ action: 'testFinish', token: s2, attemptId: id3, correct: 1000, keys: 1250, words: 170 }); // 40 WPM, 80% → net 32
assert(r.ok && r.net === 32 && r.score === Math.round((40 + 60 * 22 / 35) / 2), JSON.stringify(r)); // J3 full = 45
r = A.post({ action: 'testStart', token: s2, code: 'J2-T2' }); const id4 = r.attemptId; rowOf(id4)[10] -= 301 * 1000;
r = A.post({ action: 'testFinish', token: s2, attemptId: id4, correct: 6000, keys: 6000, words: 1000 }); // 240 WPM
assert(r.ok && r.status === 'rejected (too fast)' && r.score === 0, JSON.stringify(r));
setTest('TestClasses', 'J2, S1S2');
r = A.post({ action: 'testInfo', token: s2 }); assert.equal(r.allowed, false);
setTest('TestCode', 'J2-T3'); // a new test: new attempts
r = A.post({ action: 'testStart', token: s2, code: 'J2-T3' }); assert.equal(r.error, 'not_your_class');
r = A.post({ action: 'testStart', token: s1, code: 'J2-T3' }); assert(r.ok && r.attemptNo === 1, 'new test code = new attempts');
// an attempt that was never finished still counts as used
r = A.post({ action: 'testInfo', token: s1 }); assert(r.used === 1 && r.best === null && r.history[0].status === 'started', JSON.stringify(r));

// a broken TestSheetId never breaks the game config
const C = makeEnv(); C.ctx.setup(); C.sheets.Settings.data.find(x => x[0] === 'TestSheetId')[1] = 'X';
C.ctx.SpreadsheetApp.openById = () => { throw new Error('no access'); };
C.ctx.CacheService.getScriptCache().remove('config'); C.ctx.CacheService.getScriptCache().remove('testcfg');
const cc = JSON.parse(C.ctx.doGet({ parameter: { action: 'config' } }).content); assert(cc.ok && cc.test === false, JSON.stringify(cc).slice(0, 200));

console.log('attempt rows:', att().length - 1, '· result rows:', book.sheets.TestResults.data.length - 1);
console.log('TEST MODE UNIT TESTS PASSED');
