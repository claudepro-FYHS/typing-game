// Typing test (打字测验) backend: teachers open tests on the website (TestTeachers tab), students type
// the code. Runs Code.gs in Node with fake Google services. Run: node unit-test-mode.js
const { makeEnv } = require('./mockgas');
const assert = require('assert');
const A = makeEnv();
A.post = b => JSON.parse(A.ctx.doPost({ postData: { contents: JSON.stringify(b) } }).content);
A.set = (k, v) => { A.sheets.Settings.data.find(r => r[0] === k)[1] = v; };
A.ctx.setup();
A.set('GoogleClientId', 'cid');
A.ctx.setup();
const sh = A.sheets;
for (const t of ['TestSettings', 'Tests', 'TestTeachers', 'TestExtra', 'TestAttempts', 'TestResults']) assert(sh[t], 'setup makes the ' + t + ' tab');
assert(String(sh.TestSettings.data[0][4]).includes('如何'), 'TestSettings has the how-to note in column E');
assert(!sh.TestSettings.data.some(r => r[0] === 'TestCode'), 'no TestCode row any more (tests are opened on the website)');
const clearCfg = () => A.ctx.CacheService.getScriptCache().remove('testcfg2');
const setTest = (k, v) => { sh.TestSettings.data.find(r => r[0] === k)[1] = v; clearCfg(); };

// score formula
const S = (net, acc, full) => A.ctx.testScore_(net, acc, full, 85);
assert.equal(S(40, 100, 40), 100); assert.equal(S(55, 99, 40), 100);
assert.equal(S(10, 100, 40), 40); assert.equal(S(5, 100, 40), 20); assert.equal(S(0, 0, 40), 0);
assert.equal(S(25, 100, 40), 70); assert.equal(S(30, 100, 45), 74);
assert.equal(S(25, 84, 40), 35, 'accuracy under 85% halves the score');
console.log('score: net 10→40, 25→70 (full 40), 30→74 (full 45), 40→100; accuracy 84% halves');
setTest('TestFullWPM', 'J1:30, J2:40, J3:45, S1:45, S2:50, S2S:55');
let cfg = A.ctx.testConfig_();
assert.equal(A.ctx.testFullWpm_('J105', cfg), 40, 'below 40 is raised to 40');
assert.equal(A.ctx.testFullWpm_('J304', cfg), 45); assert.equal(A.ctx.testFullWpm_('S2S5', cfg), 55, 'longest prefix wins');
setTest('TestFullWPM', 'J1:40, J2:40, J3:45, S1:45, S2:45, S3:45');

// sentences (line_…) and code lines (code_…) have their own full-marks speed
assert(sh.TestSettings.data.some(r => r[0] === 'TestFullWPMLine') && sh.TestSettings.data.some(r => r[0] === 'TestFullWPMCode'), 'setup adds TestFullWPMLine + TestFullWPMCode');
cfg = A.ctx.testConfig_();
assert.equal(A.ctx.testKind_('everyday'), 'word'); assert.equal(A.ctx.testKind_('line_j2'), 'line'); assert.equal(A.ctx.testKind_('code_s2'), 'code');
assert.equal(A.ctx.testFullWpm_('J205', cfg, 'line_j2'), 35); assert.equal(A.ctx.testFullWpm_('J304', cfg, 'line_everyday'), 40);
assert.equal(A.ctx.testFullWpm_('S2S3', cfg, 'code_s2'), 30); assert.equal(A.ctx.testFullWpm_('J304', cfg, 'everyday'), 45);
setTest('TestFullWPMLine', ''); cfg = A.ctx.testConfig_();
assert.equal(A.ctx.testFullWpm_('J304', cfg, 'line_everyday'), 35, 'blank setting -> 35 for sentences');
setTest('TestFullWPMLine', 'J1:35, J2:35, J3:40, S1:40, S2:40, S3:40');
console.log('full marks: words 40/45, sentences 35/40, code lines 30');

// sentences.js (shared by both games): plain keyboard characters, at most 46 per line, one space between words
{
  const win = {}; require('vm').runInNewContext(require('fs').readFileSync(__dirname + '/../sentences.js', 'utf8'), { window: win, String });
  const banks = Object.entries(win.SENTENCE_BANKS);
  assert(banks.length >= 5, 'sentence banks');
  for (const [k, b] of banks) {
    assert(/^(line|code)_/.test(k), 'bank ids start with line_ or code_: ' + k);
    const lines = String(b.lines).split('\n').map(s => s.trim()).filter(Boolean);
    assert(lines.length >= 25, k + ' has at least 25 lines');
    for (const l of lines) assert(/^[\x20-\x7e]{1,46}$/.test(l) && !/  /.test(l), k + ': bad line ' + JSON.stringify(l));
  }
  console.log('sentences.js:', banks.map(([k, b]) => k + ' ' + String(b.lines).split('\n').filter(s => s.trim()).length).join(', '));
}

// people
const login = (email, cls, seat, name, nick) => {
  const t = A.post({ action: 'login', idToken: 'fake:' + email }).token;
  if (cls) { const r = A.post({ action: 'saveProfile', token: t, cls, seat, name, nickname: nick }); assert(r.ok, JSON.stringify(r)); }
  return t;
};
const s1 = login('stu1@foonyew.edu.my', 'J210', '3', 'Tan Ah Kow', 'Kow');
const s2 = login('stu2@foonyew.edu.my', 'J304', '8', 'Lee Mei', 'Mei');
const s3 = login('stu3@foonyew.edu.my');                            // no profile yet
const s4 = login('stu4@foonyew.edu.my', 'J210', '9', 'Ali', 'Ali');
sh.TestTeachers.data.push(['wong@foonyew.edu.my', 'Ms Wong', '']);
sh.TestTeachers.data.push(['lim@foonyew.edu.my', 'Mr Lim', '']);
sh.Admins.data.push(['boss@foonyew.edu.my', 'YES', '']);
let tw = A.post({ action: 'login', idToken: 'fake:wong@foonyew.edu.my' });
assert(tw.teacher === true && tw.admin === false, 'login says the teacher may open tests: ' + JSON.stringify(tw));
tw = tw.token;
assert(A.post({ action: 'saveProfile', token: tw, cls: 'STAFF', seat: '1', name: 'Wong', nickname: 'Wong' }).ok, 'a test teacher may pick STAFF');
assert.equal(A.post({ action: 'saveProfile', token: s1, cls: 'STAFF', seat: '1', name: 'x', nickname: 'Kow' }).error, 'bad_class', 'a student may not');
const tl = login('lim@foonyew.edu.my'), tb = login('boss@foonyew.edu.my');

// not a teacher
let r = A.post({ action: 'tTests', token: s1 }); assert.equal(r.error, 'not_teacher');
r = A.post({ action: 'tCreate', token: s1, classes: 'J2' }); assert.equal(r.error, 'not_teacher');
r = A.post({ action: 'testInfo', token: s1 }); assert(r.ok && r.active === false && r.allowed === false && r.teacher === false, JSON.stringify(r));
r = A.post({ action: 'testInfo', token: tw }); assert(r.teacher === true, 'testInfo tells the page this is a teacher');

// a teacher opens a test
r = A.post({ action: 'tTests', token: tw });
assert(r.ok && r.tests.length === 0 && r.defaults.minutes === 5 && r.defaults.attempts === 2 && /^[A-Z0-9]{2}-[A-Z0-9]{3}$/.test(r.suggest), JSON.stringify(r));
assert.equal(A.post({ action: 'tCreate', token: tw, classes: '' }).error, 'need_classes');
assert.equal(A.post({ action: 'tCreate', token: tw, classes: 'hello' }).error, 'bad_classes');
assert.equal(A.post({ action: 'tCreate', token: tw, classes: 'J210', code: '123' }).error, 'bad_code', 'a code needs a letter');
r = A.post({ action: 'tCreate', token: tw, classes: 'j210, J207', code: 'k7-w2', minutes: 5, attempts: 2, bank: 'everyday' });
assert(r.ok && r.test.code === 'K7-W2' && r.test.classes === 'J210, J207' && r.test.status === 'open' && r.test.teacherName === 'Ms Wong', JSON.stringify(r));
assert.equal(A.post({ action: 'tCreate', token: tl, classes: 'J3', code: 'K7W2' }).error, 'code_used', 'codes are unique (also across teachers)');
r = A.post({ action: 'tCreate', token: tl, classes: 'J3' }); assert(r.ok && r.test.code !== 'K7-W2', 'blank code = a new random one');
const limCode = r.test.code;
r = A.post({ action: 'tTests', token: tw }); assert(r.tests.length === 1 && r.tests[0].code === 'K7-W2', 'a teacher sees only her own tests');
r = A.post({ action: 'tTests', token: tb }); assert(r.admin && r.tests.length === 2, 'an admin sees every test');
assert.equal(A.post({ action: 'tMonitor', token: tl, code: 'K7-W2' }).error, 'not_your_test');
r = A.post({ action: 'tMonitor', token: tb, code: 'K7-W2' }); assert(r.ok, 'an admin can open any test');
console.log('teachers: TestTeachers only, own tests only (admins all), unique codes, random code suggested');

// students
r = A.post({ action: 'testInfo', token: s1 });
assert(r.active && r.allowed && r.code === undefined && r.minutes === 5 && r.attempts === 2 && r.used === 0 && r.full === 40, 'J210 sees an open test (no code): ' + JSON.stringify(r));
r = A.post({ action: 'testInfo', token: s3 }); assert(r.allowed === false && r.reason === 'no_profile');
r = A.post({ action: 'testStart', token: s1, code: 'OLD' }); assert.equal(r.error, 'wrong_code');
r = A.post({ action: 'testStart', token: s1, code: limCode }); assert.equal(r.error, 'not_your_class', "another class's test is refused");
r = A.post({ action: 'testStart', token: s2, code: 'K7-W2' }); assert.equal(r.error, 'not_your_class');
for (let i = 0; i < 5; i++) A.post({ action: 'testStart', token: s3, code: 'X' + i });
assert.equal(A.post({ action: 'testStart', token: s3, code: 'K7-W2' }).error, 'too_many_codes', '5 wrong codes -> wait');
r = A.post({ action: 'testStart', token: s1, code: ' k7w2 ' });
assert(r.ok && r.attemptNo === 1 && r.attempts === 2 && r.minutes === 5 && r.code === 'K7-W2', 'code in any case / spacing: ' + JSON.stringify(r));
const id1 = r.attemptId;
const att = () => sh.TestAttempts.data.slice(1), rowOf = id => att().find(x => x[2] === id);
// live progress -> teacher monitor
assert.deepEqual(A.post({ action: 'testPing', token: s1, attemptId: id1, correct: 300, keys: 320, words: 50 }), { ok: true, kicked: false });
rowOf(id1)[10] -= 120 * 1000; // two minutes ago
r = A.post({ action: 'tMonitor', token: tw, code: 'K7-W2' });
let st = r.students.find(x => x.email === 'stu1@foonyew.edu.my');
assert(st && st.name === 'Tan Ah Kow' && st.allowed === 2 && st.attempts[0].status === 'started' && st.attempts[0].words === 50 && st.attempts[0].liveWpm === 30 && st.attempts[0].secsLeft === 180, JSON.stringify(r));
// finish attempt 1 (5 minutes later)
rowOf(id1)[10] -= 181 * 1000;
r = A.post({ action: 'testFinish', token: s1, attemptId: id1, correct: 750, keys: 800, words: 125 });
assert(r.ok && r.score === 76 && r.attempts === 2 && r.best === 76, JSON.stringify(r));
// teacher: +1 attempt for one student, and attempts for everyone
r = A.post({ action: 'tExtra', token: tw, code: 'K7-W2', email: 'stu1@foonyew.edu.my', delta: 1 }); assert(r.ok && r.extra === 1 && r.allowed === 3, JSON.stringify(r));
assert.equal(A.post({ action: 'tExtra', token: tl, code: 'K7-W2', email: 'stu1@foonyew.edu.my', delta: 1 }).error, 'not_your_test');
r = A.post({ action: 'testInfo', token: s1 }); assert(r.attempts === 3 && r.used === 1, 'the student sees the extra attempt: ' + JSON.stringify(r));
r = A.post({ action: 'tUpdate', token: tw, code: 'K7-W2', attempts: 3 }); assert(r.ok && r.test.attempts === 3, 'attempts for everyone');
r = A.post({ action: 'testInfo', token: s4 }); assert.equal(r.attempts, 3, 'everyone gets the new number');
r = A.post({ action: 'testInfo', token: s1 }); assert.equal(r.attempts, 4, 'extra comes on top');
// attempt 2: the teacher ends it
r = A.post({ action: 'testStart', token: s1, code: 'K7-W2' }); assert(r.ok && r.attemptNo === 2 && r.attempts === 4, JSON.stringify(r));
const id2 = r.attemptId;
A.post({ action: 'testPing', token: s1, attemptId: id2, correct: 100, keys: 100, words: 20 });
rowOf(id2)[10] -= 60 * 1000; // one minute in
r = A.post({ action: 'tEnd', token: tw, code: 'K7-W2', attemptId: id2 }); assert(r.ok && r.net === 20 && r.score === 60, 'ended attempt is scored over the time used: ' + JSON.stringify(r));
assert.equal(rowOf(id2)[9], 'ended by teacher');
assert.equal(A.post({ action: 'tEnd', token: tw, code: 'K7-W2', attemptId: id2 }).error, 'not_running');
assert.equal(A.post({ action: 'testPing', token: s1, attemptId: id2, correct: 120, keys: 120, words: 22 }).kicked, true, 'the student page learns it was ended');
r = A.post({ action: 'testFinish', token: s1, attemptId: id2, correct: 500, keys: 500, words: 90, left: true });
assert(r.ok && r.already && r.status === 'ended by teacher' && r.score === 60 && r.best === 76, 'finishing an ended attempt returns the saved result: ' + JSON.stringify(r));
r = A.post({ action: 'testInfo', token: s1 }); assert(r.used === 2 && r.attempts === 4, 'an ended attempt counts as used, the rest can still be used');
// too early / too fast / someone else's attempt
r = A.post({ action: 'testStart', token: s4, code: 'K7-W2' }); const id3 = r.attemptId;
assert.equal(A.post({ action: 'testFinish', token: s4, attemptId: id3, correct: 10, keys: 10, words: 2 }).error, 'too_early');
assert.equal(A.post({ action: 'testFinish', token: s2, attemptId: id3, correct: 10, keys: 10, words: 2 }).error, 'no_attempt');
rowOf(id3)[10] -= 301 * 1000;
r = A.post({ action: 'testFinish', token: s4, attemptId: id3, correct: 6000, keys: 6000, words: 1000 }); assert(r.status === 'rejected (too fast)' && r.score === 0);
// monitor + results
r = A.post({ action: 'tMonitor', token: tw, code: 'K7-W2' });
st = r.students.find(x => x.email === 'stu1@foonyew.edu.my');
assert(r.students.length === 2 && st.attempts.length === 2 && st.best.score === 76 && st.extra === 1 && st.allowed === 4, JSON.stringify(st));
const res = sh.TestResults.data.slice(1).find(x => x[0] === 'K7-W2' && x[4] === 'stu1@foonyew.edu.my');
assert(res && res[5] === 2 && res[6] === 76, 'TestResults keeps the best score: ' + JSON.stringify(res));
// close the test
r = A.post({ action: 'tUpdate', token: tw, code: 'K7-W2', status: 'closed' }); assert(r.ok && r.test.status === 'closed');
assert.equal(A.post({ action: 'testStart', token: s1, code: 'K7-W2' }).error, 'wrong_code', 'a closed test cannot be started');
r = A.post({ action: 'testInfo', token: s1 }); assert(r.allowed === false, 'no open test for J210 now');
r = A.post({ action: 'tUpdate', token: tw, code: 'K7-W2', status: 'open', classes: 'J210, J304' }); assert(r.ok && r.test.status === 'open' && r.test.classes === 'J210, J304', 'reopen + change classes');
r = A.post({ action: 'testStart', token: s2, code: 'K7-W2' }); assert(r.ok, 'the added class can start now');
assert.equal(A.post({ action: 'tUpdate', token: tw, code: 'K7-W2', classes: 'nope' }).error, 'bad_classes');
console.log('students: code checked, extra attempts (one / everyone), teacher ends an attempt (counts, scored so far), monitor, close / reopen');

// a network retry of the same START press gets the same attempt back (no double attempts)
const s5 = login('stu5@foonyew.edu.my', 'J210', '20', 'Retry Kid', 'Retry');
r = A.post({ action: 'testStart', token: s5, code: 'K7-W2', req: 'abc123' });
const r2 = A.post({ action: 'testStart', token: s5, code: 'K7-W2', req: 'abc123' });
assert(r.ok && r2.ok && r2.attemptId === r.attemptId && att().filter(x => x[3] === 'stu5@foonyew.edu.my').length === 1, 'same req = same attempt: ' + JSON.stringify([r, r2]));
// an attempt whose page never pinged (the answer was lost) stops counting after 2.5 minutes
const idLost = r.attemptId;
rowOf(idLost)[10] -= 100 * 1000;
r = A.post({ action: 'testInfo', token: s5 }); assert.equal(r.used, 1, 'still counts while it may be starting');
rowOf(idLost)[10] -= 60 * 1000;
r = A.post({ action: 'testInfo', token: s5 }); assert(r.used === 0 && rowOf(idLost)[9] === 'not started', 'a never-pinged attempt is not counted: ' + JSON.stringify(r));
r = A.post({ action: 'testStart', token: s5, code: 'K7-W2', req: 'def456' }); const idReal = r.attemptId;
assert(r.ok && r.attemptNo === 1, 'the next attempt is attempt 1 again: ' + JSON.stringify(r));
A.post({ action: 'testPing', token: s5, attemptId: idReal, correct: 0, keys: 0, words: 0 });
rowOf(idReal)[10] -= 200 * 1000;
r = A.post({ action: 'testInfo', token: s5 }); assert(r.used === 1 && rowOf(idReal)[9] === 'started', 'a pinged attempt keeps counting (crash = teacher gives +1)');
r = A.post({ action: 'tMonitor', token: tw, code: 'K7-W2' }); st = r.students.find(x => x.email === 'stu5@foonyew.edu.my');
assert(st.used === 1 && st.attempts.length === 2 && st.attempts[0].status === 'not started', 'the monitor shows used = 1: ' + JSON.stringify(st));
// a late finish for a 'not started' attempt (pings all failed) is still scored
rowOf(idLost)[10] -= 300 * 1000;
r = A.post({ action: 'testFinish', token: s5, attemptId: idLost, correct: 500, keys: 500, words: 90 }); assert(r.ok && !r.already && r.score > 0, 'late finish still scored: ' + JSON.stringify(r));
console.log('START retries give the same attempt; never-started attempts do not count; late finish still scored');

// a sentence test for S2 code lines: the student's start gets the code-line full-marks speed
{
  const sc = login('stu9@foonyew.edu.my', 'S2S1', '4', 'Chan', 'Chan');
  const rc = A.post({ action: 'tCreate', token: tl, classes: 'S2S1', code: 'CODE-C', bank: 'code_s2' }); assert(rc.ok && rc.test.bank === 'code_s2', JSON.stringify(rc));
  const ri = A.post({ action: 'testInfo', token: sc }); assert(ri.ok && ri.full === 30 && ri.kind === 'code', 'testInfo: code test full 30 ' + JSON.stringify(ri));
  const rs = A.post({ action: 'testStart', token: sc, code: 'code-c' }); assert(rs.ok && rs.full === 30 && rs.bank === 'code_s2', JSON.stringify(rs));
  A.post({ action: 'tUpdate', token: tl, code: 'CODE-C', status: 'closed' });
  console.log('code-line test: full marks 30 for S2');
}

// config: is any test open?
A.ctx.CacheService.getScriptCache().remove('config');
assert.equal(JSON.parse(A.ctx.doGet({ parameter: { action: 'config' } }).content).test, true, 'config shows that a test is open');
assert(!JSON.stringify(JSON.parse(A.ctx.doGet({ parameter: { action: 'config' } }).content)).includes('K7'), 'the config never contains a code');
console.log('attempt rows:', att().length, '· result rows:', sh.TestResults.data.length - 1);
console.log('TEST MODE UNIT TESTS PASSED');
