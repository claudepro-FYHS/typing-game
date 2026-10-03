// Runs apps-script/Code.gs inside Node with fake Google services.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
function makeEnv(opts = {}) {
  const sheets = {};
  function makeSheet(name) {
    const data = [];
    const sh = {
      name, data,
      getRange(r, c, nr = 1, nc = 1) {
        return {
          setValues(vals) { for (let i = 0; i < nr; i++) { while (data.length < r + i) data.push([]); for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
          setFontWeight() { return this; },
        };
      },
      appendRow(row) { data.push(row.slice()); },
      getDataRange() { return { getValues: () => data.length ? data.map(r => r.slice()) : [[]] }; },
      deleteRow(i) { data.splice(i - 1, 1); },
      setFrozenRows() {}, setColumnWidth() {},
    };
    return sh;
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)) };
  const props = {}, cache = {};
  const toBytes = v => typeof v === 'string' ? [...Buffer.from(v, 'utf8')].map(b => b > 127 ? b - 256 : b) : v;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64EncodeWebSafe: v => Buffer.from(toBytes(v).map(b => b & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: s => [...Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')].map(b => b > 127 ? b - 256 : b),
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()].map(b => b > 127 ? b - 256 : b),
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }),
      sleep: () => {},
    },
    UrlFetchApp: {
      fetch(url) {
        const tok = decodeURIComponent(url.split('id_token=')[1] || '');
        if (!tok.startsWith('fake:')) return { getResponseCode: () => 400, getContentText: () => '{}' };
        const email = tok.slice(5);
        const settings = {}; sheets.Settings.data.forEach(r => settings[r[0]] = r[1]);
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: settings.GoogleClientId, email, email_verified: 'true', hd: email.split('@')[1] }) };
      },
    },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
    Logger: { log: (...a) => opts.verbose && console.log(...a) },
    Date, JSON, Math, Object, Array, String, Number,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  return { ctx, sheets, ss };
}
module.exports = { makeEnv };
