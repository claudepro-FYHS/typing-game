// Finds Playwright: a local install (npm install in this folder) or a global one.
// Software WebGL (swiftshader) lets three.js render in headless Chromium.
const path = require('path'), { execSync } = require('child_process');
let pw;
try { pw = require('playwright'); } catch (e) {
  try { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) {
    console.error('Playwright not found. Run: cd tests && npm install playwright && npx playwright install chromium');
    process.exit(1);
  }
}
// Fill the profile form's class: 'J105' -> Form J1, class 5; 'S2AC3' -> Form S2AC, class 3; 'STAFF' for admins
async function pickClass(page, cls) {
  if (cls === 'STAFF') return page.selectOption('#pf-grade', 'STAFF');
  const m = cls.match(/^([JS]\d(?:AC|S)?)(\d+)$/);
  await page.selectOption('#pf-grade', m[1]);
  await page.selectOption('#pf-classno', String(Number(m[2])));
}
module.exports = { pickClass, chromium: pw.chromium, LAUNCH: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } };
