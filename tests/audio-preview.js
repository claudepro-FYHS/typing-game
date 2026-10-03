// Renders the background music and sound effects to WAV files (tests/shots/*.wav) with an
// OfflineAudioContext, so they can be listened to and checked for clipping without playing the game.
//   node audio-preview.js        (needs server.js running on port 8123, or use: node run.js audio-preview)
const { chromium, LAUNCH } = require('./pw');
const fs = require('fs');
const OUT = __dirname + '/shots/';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8123/'); await page.waitForTimeout(1500);
  const files = await page.evaluate(async () => {
    const SR = 32000;
    // render one piece of audio: fn() schedules sounds on the global actx
    async function render(secs, fn) {
      actx = new OfflineAudioContext(1, SR * secs, SR); noiseBuf = null; sfxBus = null;
      audioCtx();
      fn();
      return (await actx.startRendering()).getChannelData(0);
    }
    function music(secs) {
      return render(secs, () => {
        const comp = actx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.connect(actx.destination);
        Music.gain = actx.createGain(); Music.gain.gain.value = 0.1; Music.gain.connect(comp); Music.tempo = 1;
        const eighth = 60 / 148 / 2;
        for (let st = 0, t = 0.05; t < secs - 0.3; st++, t += eighth) Music.note(st, t, eighth);
      });
    }
    const one = (type, secs = 1.2) => render(secs, () => sfx(type));
    function mix(dst, src, at, vol = 1) { const o = Math.floor(at * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * vol; }
    function wav(data) {
      const buf = new ArrayBuffer(44 + data.length * 2), v = new DataView(buf);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, data.length * 2, true);
      let peak = 0;
      for (let i = 0; i < data.length; i++) { const x = Math.max(-1, Math.min(1, data[i])); peak = Math.max(peak, Math.abs(data[i])); v.setInt16(44 + i * 2, x * 32767, true); }
      let b = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      return { b64: btoa(b), peak: Math.round(peak * 100) / 100 };
    }
    S.prefs.sound = true;
    const out = {};
    // 1) the whole song once: intro + verse + chorus (~33 s) plus the start of the loop
    out['music-preview.wav'] = wav(await music(38));
    // 2) each sound effect, one after another
    const names = ['key', 'key', 'key', 'beam', 'kill', 'err', 'item', 'hit', 'boss', 'clear', 'buster'];
    const fx = new Float32Array(SR * 16); let at = 0.2;
    for (const n of names) { mix(fx, await one(n, 1.6), at); at += n === 'key' ? 0.35 : 1.4; }
    out['sfx-preview.wav'] = wav(fx);
    // 3) what playing sounds like: music + typing (5 keys / s) + a beam and explosion after each word
    const game = await music(20);
    const key = await one('key', 0.4), beamS = await one('beam', 1), kill = await one('kill', 1);
    for (let t = 1, k = 0; t < 19; t += 0.2, k++) {
      mix(game, key, t);
      if (k % 6 === 5) { mix(game, beamS, t + 0.02); mix(game, kill, t + 0.12); }
    }
    out['gameplay-preview.wav'] = wav(game);
    return out;
  });
  for (const [name, f] of Object.entries(files)) {
    fs.writeFileSync(OUT + name, Buffer.from(f.b64, 'base64'));
    console.log(`${name}: peak ${f.peak}${f.peak > 1 ? '  (CLIPPING!)' : ''}`);
    if (f.peak > 1) errors.push(name + ' clips');
  }
  console.log('ERRORS:', errors.length ? errors : 'none'); if (errors.length) process.exitCode = 1;
  await browser.close();
})();
