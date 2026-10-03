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
module.exports = { chromium: pw.chromium, LAUNCH: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } };
