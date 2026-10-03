"use strict";
/* =====================================================================
 *  THREE.JS SCENE, EFFECTS, CAMERA MODES
 * ===================================================================== */
const V3 = THREE.Vector3;
const canvas = $("#scene");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: S.prefs.quality === "high", powerPreference: "high-performance" });
} catch (e) {
  document.body.insertAdjacentHTML("beforeend", '<div class="note" style="position:fixed;bottom:10px;left:10px;right:10px;z-index:99">This browser cannot show 3D graphics (WebGL is off). Please try Chrome or Edge.</div>');
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1400);
scene.fog = new THREE.Fog(0x0a0b1e, 80, 220);
function setSky(top, mid, bottom) {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const x = c.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, bottom);
  x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
  if (scene.background) scene.background.dispose();
  scene.background = new THREE.CanvasTexture(c);
}
setSky("#03040c", "#0b0d26", "#1e0f3a");
scene.add(new THREE.HemisphereLight(0x9cc4ff, 0x20123a, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 1.15); sun.position.set(6, 12, 8); scene.add(sun);
const rim = new THREE.DirectionalLight(0x66aaff, 0.6); rim.position.set(-8, 4, -10); scene.add(rim);

const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 24), new THREE.MeshStandardMaterial({ color: 0x2c5fb8, roughness: 0.9, fog: false }));
planet.position.set(-150, -60, -420); scene.add(planet);
const ring = new THREE.Mesh(new THREE.RingGeometry(90, 120, 64), new THREE.MeshBasicMaterial({ color: 0x8fb7ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, fog: false }));
ring.position.copy(planet.position); ring.rotation.set(1.2, 0.2, 0.3); scene.add(ring);

let stars;
function buildStars(count) {
  if (stars) { scene.remove(stars); stars.geometry.dispose(); }
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * 360; pos[i * 3 + 1] = (Math.random() - 0.3) * 200; pos[i * 3 + 2] = -Math.random() * 440 + 20; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9 }));
  scene.add(stars);
}
function applyQuality() {
  if (!renderer) return;
  const high = S.prefs.quality === "high";
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(1, (window.devicePixelRatio || 1) * 0.75));
  buildStars(high ? 1600 : 600);
  resize();
}

/* ---------- missiles ---------- */
function buildMissile() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(missileGeo.body, MODELS.MS(0xdddddd)); b.rotation.x = Math.PI / 2; g.add(b);
  const tip = new THREE.Mesh(missileGeo.tip, MODELS.MS(0xff3344)); tip.rotation.x = Math.PI / 2; tip.position.z = 0.7; g.add(tip);
  const fl = new THREE.Mesh(missileGeo.flame, MODELS.GLOW(0xffaa33, 0.85)); fl.rotation.x = -Math.PI / 2; fl.position.z = -0.85; g.add(fl);
  g.scale.setScalar(2);
  g.userData.top = 1.4;
  return g;
}
const missileGeo = { body: new THREE.CylinderGeometry(0.14, 0.14, 1.0, 8), tip: new THREE.ConeGeometry(0.14, 0.4, 8), flame: new THREE.ConeGeometry(0.16, 0.7, 8) };

/* ---------- effects ---------- */
const effects = [];
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const flashGeo = new THREE.SphereGeometry(1, 10, 8);
function beam(from, to, color, width, life) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(beamGeo, mat);
  const dir = new V3().subVectors(to, from); const len = dir.length();
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
  m.scale.set(width, len, width);
  scene.add(m);
  effects.push({ obj: m, life, max: life, kind: "beam", w: width });
}
function explode(pos, color, count, size, speed) {
  count = S.prefs.quality === "high" ? count : Math.ceil(count / 2);
  const posArr = new Float32Array(count * 3), vel = [];
  for (let i = 0; i < count; i++) {
    posArr.set([pos.x, pos.y, pos.z], i * 3);
    vel.push(new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random())));
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const p = new THREE.Points(geo, mat); scene.add(p);
  effects.push({ obj: p, life: 0.9, max: 0.9, kind: "burst", vel });
  const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.setScalar(size * 3);
  flash.position.copy(pos); scene.add(flash);
  effects.push({ obj: flash, life: 0.25, max: 0.25, kind: "flash", s: size * 3 });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.life -= dt;
    const k = Math.max(0, e.life / e.max);
    if (e.kind === "beam") { e.obj.material.opacity = k; e.obj.scale.x = e.obj.scale.z = e.w * (0.4 + k * 0.6); }
    else if (e.kind === "burst") {
      const a = e.obj.geometry.attributes.position;
      for (let j = 0; j < e.vel.length; j++) { a.array[j * 3] += e.vel[j].x * dt; a.array[j * 3 + 1] += e.vel[j].y * dt; a.array[j * 3 + 2] += e.vel[j].z * dt; }
      a.needsUpdate = true; e.obj.material.opacity = k;
    } else if (e.kind === "flash") { e.obj.material.opacity = k; e.obj.scale.setScalar(e.s * (1 + (1 - k) * 1.5)); }
    if (e.life <= 0) {
      scene.remove(e.obj);
      if (e.obj.geometry !== beamGeo && e.obj.geometry !== flashGeo) e.obj.geometry.dispose();
      e.obj.material.dispose(); effects.splice(i, 1);
    }
  }
}

/* ---------- hangar preview & modes ---------- */
let mode = "hangar"; // hangar | game | idle
let previewMech = null, previewMechId = null, previewAnim = MODELS.newAnim();
function setPreviewMech(id, skinId) {
  const key = id + "|" + (skinId || "default");
  if (previewMechId === key && previewMech) return;
  if (previewMech) scene.remove(previewMech);
  previewMech = MODELS.buildMech(MECH_BY_ID[id], SKIN_BY_ID[skinId]); previewMechId = key;
  scene.add(previewMech);
  previewMech.visible = mode === "hangar";
  previewAnim = MODELS.newAnim();
}
function render3DMode() {
  const scr = S.currentScreen;
  if (document.body.classList.contains("playing")) mode = "game";
  else if (["scr-hangar", "scr-login", "scr-profile", "scr-result"].includes(scr)) mode = "hangar";
  else mode = "idle";
  if (previewMech) previewMech.visible = mode === "hangar";
  if (G.players) for (const p of G.players) if (p.mesh) p.mesh.visible = mode === "game" && p.alive !== false;
  canvas.style.visibility = mode === "idle" ? "hidden" : "visible";
}

function viewSize() {
  const vv = window.visualViewport;
  return { w: window.innerWidth, h: document.body.classList.contains("playing") && vv ? Math.round(vv.height) : window.innerHeight };
}
function resize() {
  if (!renderer) return;
  const { w, h } = viewSize();
  renderer.setSize(w, h, false);
  canvas.style.height = h + "px";
  $("#labels").style.height = h + "px";
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 72 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

function project(v) {
  const p = v.clone().project(camera);
  if (p.z > 1) return null;
  const { w, h } = viewSize();
  return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h };
}
function floater(x, y, text, color) {
  const el = document.createElement("div");
  el.className = "floater"; el.textContent = text;
  el.style.left = x + "px"; el.style.top = y + "px"; el.style.transform = "translate(-50%,0)";
  if (color) el.style.color = color;
  $("#labels").appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/* =====================================================================
 *  BATTLEFIELDS (unlocked by level) + FESTIVAL DECORATIONS
 * ===================================================================== */
let envGroup = null, envId = null, envEvent = null, envRocks = [], envLanterns = [], envSnow = null, envDecor = {}, fireworkT = 0;
function radialTexture(inner, outer) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function setEnvironment(id, eventId) {
  if (envId === id && envEvent === (eventId || null)) return;
  envId = id; envEvent = eventId || null;
  if (envGroup) scene.remove(envGroup);
  envGroup = new THREE.Group(); envRocks = []; envLanterns = []; envSnow = null; envDecor = {};
  scene.add(envGroup);
  planet.visible = ring.visible = id === "deep" || id === "asteroid";
  scene.fog.color.set(0x0a0b1e);
  setSky("#03040c", "#0b0d26", "#1e0f3a");
  const M = (c, e) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, fog: false }, e || {}));
  if (id === "earth") {
    const earth = new THREE.Mesh(new THREE.SphereGeometry(160, 48, 32), M(0x2a6fd6));
    earth.position.set(0, -205, -170); envGroup.add(earth);
    for (let i = 0; i < 14; i++) { const land = new THREE.Mesh(new THREE.SphereGeometry(18 + Math.random() * 22, 12, 8), M(0x3f8f4a)); land.scale.y = 0.15; const a = Math.random() * Math.PI, b = Math.random() * Math.PI * 2; land.position.set(Math.cos(b) * Math.sin(a) * 158, Math.cos(a) * 158, Math.sin(b) * Math.sin(a) * 158); land.lookAt(0, 0, 0); earth.add(land); }
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(172, 48, 32), new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0.18, side: THREE.BackSide, fog: false }));
    atmo.position.copy(earth.position); envGroup.add(atmo);
    envGroup.userData.spin = earth;
  } else if (id === "moon") {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 500, 40, 30), M(0x8d8f99, { flatShading: true }));
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, (Math.random() - 0.5) * 3);
    ground.geometry.computeVertexNormals();
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -14, -150); envGroup.add(ground);
    for (let i = 0; i < 30; i++) { const cr = new THREE.Mesh(new THREE.TorusGeometry(4 + Math.random() * 10, 1 + Math.random() * 1.5, 6, 18), M(0x6f717b)); cr.rotation.x = -Math.PI / 2; cr.position.set((Math.random() - 0.5) * 500, -13.5, -30 - Math.random() * 350); envGroup.add(cr); }
    const earth = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 24), M(0x2a6fd6, { emissive: 0x0a2a66, emissiveIntensity: 0.5 }));
    earth.position.set(-90, 75, -380); envGroup.add(earth);
  } else if (id === "asteroid") {
    for (let i = 0; i < 70; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 4, 0), M(0x6b5d52, { flatShading: true }));
      r.position.set((Math.random() - 0.5) * 220, (Math.random() - 0.4) * 90, -Math.random() * 420);
      r.userData.rs = new V3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.6);
      envGroup.add(r); envRocks.push(r);
    }
  } else if (id === "colony") {
    setSky("#0a1424", "#16304a", "#2a4a3a");
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 900, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x4b6b5a, side: THREE.BackSide, flatShading: true, roughness: 1 }));
    tube.rotation.x = Math.PI / 2; tube.position.z = -300; envGroup.add(tube);
    for (let k = 0; k < 3; k++) { const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 900), new THREE.MeshBasicMaterial({ color: 0xbfe6ff })); const a = k * Math.PI * 2 / 3 + Math.PI / 2; strip.position.set(Math.cos(a) * 68, Math.sin(a) * 68, -300); strip.rotation.z = a + Math.PI / 2; envGroup.add(strip); }
    for (let i = 0; i < 60; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 6, 4 + Math.random() * 14, 4 + Math.random() * 6), M(0x8a9aa8)); const a = Math.PI * 1.5 + (Math.random() - 0.5) * 1.2; b.position.set(Math.cos(a) * 64, Math.sin(a) * 64, -Math.random() * 700); b.lookAt(0, 0, b.position.z); envGroup.add(b); }
    planet.visible = ring.visible = false;
    scene.fog.color.set(0x1b2f3a);
  } else if (id === "nebula") {
    setSky("#12020c", "#3a0a2a", "#5a1030");
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(i % 2 ? "rgba(255,80,140,.55)" : "rgba(140,80,255,.5)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.position.set((Math.random() - 0.5) * 500, (Math.random() - 0.2) * 220, -250 - Math.random() * 200); sp.scale.setScalar(140 + Math.random() * 160);
      envGroup.add(sp);
    }
  }
  // festival decorations (see EVENTS[...].decor in js/progress.js)
  const decor = eventId && typeof EVENTS !== "undefined" && EVENTS[eventId] ? EVENTS[eventId].decor || {} : {};
  envDecor = decor;
  if (decor.sky) setSky(decor.sky[0], decor.sky[1], decor.sky[2]);
  if (decor.lanterns) {
    const colors = decor.lanterns;
    for (let i = 0; i < 18; i++) {
      const l = new THREE.Group();
      l.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), MODELS.GLOW(colors[i % colors.length], 0.85)));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 10), MODELS.MS(0xc9a227)); cap.position.y = 1.4; l.add(cap);
      const tas = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), MODELS.MS(0xc9a227)); tas.position.y = -2; l.add(tas);
      l.scale.y = 1.15;
      l.position.set((Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 40), 6 + Math.random() * 26, -20 - Math.random() * 160);
      l.userData.ph = Math.random() * 6;
      envGroup.add(l); envLanterns.push(l);
    }
  }
  if (decor.moon) {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 24), new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false }));
    moon.position.set(110, 90, -400); envGroup.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture("rgba(255,240,180,.6)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false, fog: false }));
    halo.position.copy(moon.position); halo.scale.setScalar(160); envGroup.add(halo);
  }
  if (decor.sprites) {
    for (let i = 0; i < 22; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(decor.sprites[i % decor.sprites.length]), transparent: true, depthWrite: false, fog: false }));
      sp.position.set((Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 45), 4 + Math.random() * 30, -15 - Math.random() * 170);
      sp.scale.setScalar(3 + Math.random() * 3);
      sp.userData.ph = Math.random() * 6;
      envGroup.add(sp); envLanterns.push(sp);
    }
  }
  if (decor.snow) {
    const n = S.prefs.quality === "high" ? 900 : 350, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 160; pos[i * 3 + 1] = Math.random() * 70 - 10; pos[i * 3 + 2] = -Math.random() * 160 + 15; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    envSnow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, map: dotTexture(), transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    envGroup.add(envSnow);
  }
}
const emojiCache = {};
let dotTex = null;
function dotTexture() { // soft round dot (snowflakes)
  if (dotTex) return dotTex;
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,0.8)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return (dotTex = new THREE.CanvasTexture(c));
}
function emojiTexture(ch) {
  if (emojiCache[ch]) return emojiCache[ch];
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"); x.textAlign = "center"; x.textBaseline = "middle";
  x.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; x.fillText(ch, 64, 70);
  return (emojiCache[ch] = new THREE.CanvasTexture(c));
}
function updateEnvironment(dt, speed) {
  if (!envGroup) return;
  if (envGroup.userData.spin) envGroup.userData.spin.rotation.y += dt * 0.01;
  for (const r of envRocks) {
    r.position.z += speed * 0.6 * dt; if (r.position.z > 30) r.position.z -= 450;
    r.rotation.x += r.userData.rs.x * dt; r.rotation.y += r.userData.rs.y * dt;
  }
  const t = performance.now() / 1000;
  for (const l of envLanterns) { l.position.y += Math.sin(t + l.userData.ph) * 0.01; if (!l.isSprite) l.rotation.y += dt * 0.3; }
  if (envSnow) {
    const a = envSnow.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { a.array[i * 3 + 1] -= dt * (3 + (i % 5)); a.array[i * 3] += Math.sin(t + i) * dt * 0.6; if (a.array[i * 3 + 1] < -12) a.array[i * 3 + 1] += 72; }
    a.needsUpdate = true;
  }
  if (envDecor.fireworks) {
    fireworkT -= dt;
    if (fireworkT <= 0) {
      fireworkT = 0.6 + Math.random() * 1.2;
      const cols = envDecor.fireworks;
      explode(new V3((Math.random() - 0.5) * 160, 25 + Math.random() * 40, -120 - Math.random() * 120), cols[Math.floor(Math.random() * cols.length)], 90, 1.6, 22);
    }
  }
}

/* =====================================================================
 *  BACKGROUND MUSIC (tiny synth loop; speeds up with your combo)
 * ===================================================================== */
const Music = {
  on: false, timer: null, step: 0, nextT: 0, tempo: 1, gain: null,
  start() {
    this.stop();
    if (!S.prefs.music || !S.prefs.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      actx = actx || new AC(); if (actx.state === "suspended") actx.resume();
      if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      this.gain = actx.createGain(); this.gain.gain.value = 0.05; this.gain.connect(actx.destination);
      this.on = true; this.step = 0; this.tempo = 1; this.nextT = actx.currentTime + 0.15;
      this.timer = setInterval(() => this.tick(), 60);
    } catch (e) {}
  },
  stop() {
    this.on = false; if (this.timer) clearInterval(this.timer); this.timer = null;
    if (this.gain) { try { this.gain.gain.setTargetAtTime(0, actx.currentTime, 0.2); } catch (e) {} this.gain = null; }
  },
  setTier(tier) { this.tempo = [1, 1.08, 1.16, 1.25, 1.36][tier] || 1; },
  tick() {
    if (!this.on || !actx) return;
    const eighth = 60 / (116 * this.tempo) / 2;
    while (this.nextT < actx.currentTime + 0.25) { this.note(this.step, this.nextT, eighth); this.nextT += eighth; this.step++; }
  },
  note(step, t, len) {
    const roots = [57, 53, 48, 55], quality = [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 11]];
    const bar = Math.floor(step / 8) % 4, root = roots[bar], q = quality[bar];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const play = (freq, dur, vol, type) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + dur + 0.02);
    };
    if (step % 2 === 0) play(hz(root - 12), len * 1.8, 0.9, "square");
    play(hz(root + 12 + q[[0, 1, 2, 3, 2, 1, 2, 3][step % 8]]), len * 0.9, 0.35, "triangle");
    if (step % 4 === 0) { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(1.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.2); }
    if (step % 2 === 1 && noiseBuf) { const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 7000; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(this.gain); s.start(t); s.stop(t + 0.06); }
  },
};
