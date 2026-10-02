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
{
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const x = c.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#03040c"); gr.addColorStop(0.55, "#0b0d26"); gr.addColorStop(1, "#1e0f3a");
  x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
  scene.background = new THREE.CanvasTexture(c);
}
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
function setPreviewMech(id) {
  if (previewMechId === id && previewMech) return;
  if (previewMech) scene.remove(previewMech);
  previewMech = MODELS.buildMech(MECH_BY_ID[id]); previewMechId = id;
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
