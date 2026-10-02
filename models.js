/* =====================================================================
 *  钢弹击字 Mecha Strike Typer — 3D models & animation
 *  All models are original designs built from simple shapes, inspired by
 *  classic real-robot anime styles. Everything faces +z.
 * ===================================================================== */
(function () {
"use strict";
const T = THREE;
const ADD = T.AdditiveBlending;

/* ---------------- shared helpers ---------------- */
const geoCache = {}, matCache = {};
function G(key, make) { return geoCache[key] || (geoCache[key] = make()); }
function MS(color, extra) {
  const k = "s" + color + JSON.stringify(extra || {});
  return matCache[k] || (matCache[k] = new T.MeshStandardMaterial(Object.assign({ color, metalness: 0.35, roughness: 0.5, flatShading: true }, extra)));
}
function MB(color, extra) {
  const k = "b" + color + JSON.stringify(extra || {});
  return matCache[k] || (matCache[k] = new T.MeshBasicMaterial(Object.assign({ color }, extra)));
}
function GLOW(color, op) { return MB(color, { transparent: true, opacity: op == null ? 0.85 : op, blending: ADD, depthWrite: false }); }
function add(m, x, y, z, parent) { m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m; }
function box(w, h, d, mat, x, y, z, parent) { return add(new T.Mesh(G(`b${w},${h},${d}`, () => new T.BoxGeometry(w, h, d)), mat), x, y, z, parent); }
function cyl(rt, rb, h, mat, x, y, z, parent, seg) { seg = seg || 10; return add(new T.Mesh(G(`c${rt},${rb},${h},${seg}`, () => new T.CylinderGeometry(rt, rb, h, seg)), mat), x, y, z, parent); }
function sph(r, mat, x, y, z, parent, seg) { seg = seg || 10; return add(new T.Mesh(G(`s${r},${seg}`, () => new T.SphereGeometry(r, seg, Math.max(6, seg - 2))), mat), x, y, z, parent); }
function cone(r, h, mat, x, y, z, parent, seg) { seg = seg || 8; return add(new T.Mesh(G(`k${r},${h},${seg}`, () => new T.ConeGeometry(r, h, seg)), mat), x, y, z, parent); }
function tor(r, t, mat, x, y, z, parent) { return add(new T.Mesh(G(`t${r},${t}`, () => new T.TorusGeometry(r, t, 6, 24)), mat), x, y, z, parent); }
function jnt(name, parent, x, y, z) { const g = new T.Group(); g.name = name; g.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(g); return g; }
function rot(o, x, y, z) { o.rotation.set(x || 0, y || 0, z || 0); return o; }
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =====================================================================
 *  PLAYER MECHS (15)
 *  special: { type: blast|freeze|slow|shield, n (targets), secs, charge (words in a row) }
 * ===================================================================== */
const MECHS = [
  { id: "starter", name: "VANGUARD", from: "UC hero style", price: 0, hp: 5, startShield: true,
    plus: "Balanced. Starts every stage with a shield.", minus: "",
    head: "vfin", pack: "basic", weapon: "rifle", shield: "rx",
    colors: { main: 0xeef1f6, accent: 0x1f4fbf, trim: 0xd62a2a, fin: 0xf6c10e, visor: 0x7dffb0, dark: 0x3a4052 } },
  { id: "redcomet", name: "RED COMET", from: "UC rival style", price: 300, hp: 4, coinMult: 1.2,
    plus: "Coins +20%.", minus: "Only 4 ♥",
    head: "mono", horn: true, pack: "zaku", weapon: "mg", shoulder: "zaku",
    colors: { main: 0xe0655a, accent: 0x9b2420, trim: 0x5c1612, fin: 0xe0655a, visor: 0xff3d8b, dark: 0x3b1d1d } },
  { id: "aile", name: "AILE STRIKER", from: "SEED hero style", price: 300, hp: 5, dropMult: 1.6, coinMult: 0.9,
    plus: "Items drop 1.6× more often.", minus: "Coins −10%",
    head: "vfin", pack: "aile", weapon: "rifle", shield: "std",
    colors: { main: 0xf2f4f8, accent: 0x2853c9, trim: 0xd8302b, fin: 0xf3c623, visor: 0x7dffb0, dark: 0x3a3f4c } },
  { id: "aegis", name: "CRIMSON AEGIS", from: "SEED rival style", price: 400, hp: 5, special: { type: "blast", n: 1, charge: 3 },
    plus: "Scylla cannon: every 3 words in a row, SPACE destroys the closest target.", minus: "",
    head: "vfin", finSize: 0.8, pack: "aegis", weapon: "rifle", shield: "std",
    colors: { main: 0xc8282b, accent: 0x7c1517, trim: 0x30333b, fin: 0xf2d24b, visor: 0x7dffb0, dark: 0x2a2c33 } },
  { id: "flag", name: "OVER FLAG", from: "00 rival style", price: 400, hp: 4, missileSlow: 1.33, coinMult: 1.1,
    plus: "Boss missiles 25% slower. Coins +10%.", minus: "Only 4 ♥",
    head: "flag", pack: "flag", weapon: "linear",
    colors: { main: 0xd6dbe2, accent: 0x2d3340, trim: 0x8a929e, fin: 0xd6dbe2, visor: 0xffe066, dark: 0x22262e } },
  { id: "zenith", name: "ZENITH", from: "UC hero style", price: 600, hp: 5, special: { type: "freeze", secs: 4, charge: 5 },
    plus: "Wave rider: every 5 words in a row, SPACE freezes enemies 4 s.", minus: "",
    head: "vfin", finSize: 0.9, pack: "zeta", weapon: "rifle", shield: "std",
    colors: { main: 0xf0f2f7, accent: 0x2e64d8, trim: 0xd9353a, fin: 0xf5c518, visor: 0x7dffb0, dark: 0x343a4a } },
  { id: "sovereign", name: "SOVEREIGN", from: "UC rival style", price: 600, hp: 6, coinMult: 0.8, bulk: 1.2, special: { type: "blast", n: 2, charge: 6 },
    plus: "Heavy armor: 6 ♥. Funnel barrage: 6 in a row, SPACE hits 2 targets.", minus: "Coins −20%",
    head: "sazabi", pack: "sazabi", weapon: "magnum", shield: "round", shoulder: "big",
    colors: { main: 0xc9241f, accent: 0x8e1612, trim: 0x2b2b30, fin: 0xd7a72b, visor: 0xff3d8b, dark: 0x2b2b30 } },
  { id: "bladeangel", name: "BLADE ANGEL", from: "00 hero style", price: 800, hp: 4, special: { type: "slow", secs: 6, charge: 5 },
    plus: "Overdrive: 5 in a row, SPACE slows enemies to half speed for 6 s.", minus: "Only 4 ♥",
    head: "vfin", finSize: 0.75, pack: "exia", weapon: "gnsword", shield: "small",
    colors: { main: 0xf3f5f9, accent: 0x2a58c8, trim: 0xd3343a, fin: 0xf2c32b, visor: 0x7dffb0, dark: 0x3a3e4a, glow: 0x6dffb3 } },
  { id: "liberty", name: "LIBERTY", from: "SEED hero style", price: 900, hp: 5, special: { type: "blast", n: 5, charge: 8 },
    plus: "Full burst: 8 words in a row, SPACE hits 5 targets.", minus: "",
    head: "vfin", pack: "freedom", weapon: "rifle", shield: "std",
    colors: { main: 0xf2f4f8, accent: 0x2b55c5, trim: 0xd7363a, fin: 0xf3c623, visor: 0x7dffb0, dark: 0x40444f } },
  { id: "fate", name: "FATE", from: "SEED hero style", price: 900, hp: 5, special: { type: "shield", charge: 5 },
    plus: "Wings of light: 5 words in a row, SPACE gives you a shield.", minus: "",
    head: "vfin", finSize: 1.1, pack: "destiny", weapon: "rifle", shield: "std",
    colors: { main: 0xe9ebf0, accent: 0x2d3c8f, trim: 0xc8232e, fin: 0xf3c623, visor: 0x7dffb0, dark: 0x3a3d48, glow: 0xff4d8a } },
  { id: "baron", name: "SCARLET BARON", from: "UC rival style", price: 1000, hp: 5, coinMult: 1.1, special: { type: "blast", n: 1, charge: 3 },
    plus: "Coins +10%. 3 in a row, SPACE destroys the closest target.", minus: "",
    head: "sinanju", pack: "sinanju", weapon: "rifle", shield: "std", shoulder: "round",
    colors: { main: 0xa3121c, accent: 0x5e0b12, trim: 0xd8a830, fin: 0xd8a830, visor: 0xff3d8b, dark: 0x23161a } },
  { id: "monoceros", name: "MONOCEROS", from: "UC hero style", price: 1000, hp: 5, special: { type: "slow", secs: 8, charge: 6 }, psycho: true,
    plus: "Destroy mode: 6 in a row, SPACE slows enemies for 8 s (the horn opens!).", minus: "",
    head: "unicorn", pack: "unicorn", weapon: "magnum", shield: "std",
    colors: { main: 0xf6f7fa, accent: 0xe9ebf0, trim: 0x8a8f9c, fin: 0xf6c10e, visor: 0x7dffb0, dark: 0x3d404a, glow: 0xff2d55 } },
  { id: "nu", name: "HALO NU", from: "UC hero style", price: 1100, hp: 5, special: { type: "blast", n: 4, charge: 7 },
    plus: "Fin funnels: 7 in a row, SPACE hits 4 targets.", minus: "",
    head: "vfin", pack: "nu", weapon: "rifle", shield: "std",
    colors: { main: 0xf1f2f5, accent: 0x2b2d36, trim: 0xd8a42a, fin: 0xf6c10e, visor: 0x7dffb0, dark: 0x2b2d36 } },
  { id: "twin", name: "TWIN DRIVE", from: "00 hero style", price: 1100, hp: 5, dropMult: 1.2, special: { type: "freeze", secs: 6, charge: 6 },
    plus: "Twin drive burst: 6 in a row, SPACE freezes enemies 6 s. Items ×1.2.", minus: "",
    head: "vfin", finSize: 0.85, pack: "twin", weapon: "gnsword", shield: "small", shoulder: "twin",
    colors: { main: 0xf1f3f8, accent: 0x2350c0, trim: 0xd2353b, fin: 0xf2c32b, visor: 0x7dffb0, dark: 0x30343f, glow: 0x6dffb3 } },
  { id: "seraph", name: "SERAPH ZERO", from: "winged angel style", price: 1200, hp: 4, special: { type: "blast", n: 3, charge: 5 },
    plus: "Angel wings + Twin Buster: 5 in a row, SPACE blasts the 3 closest targets.", minus: "Only 4 ♥",
    head: "vfin", pack: "seraph", weapon: "twin",
    colors: { main: 0xf7f9fc, accent: 0x2d62d6, trim: 0xd8342f, fin: 0xf4c430, visor: 0x3cff8a, dark: 0x4a5064 } },
];

/* ---------------- heads ---------------- */
const HEADS = {
  vfin(h, M, def) {
    box(0.46, 0.44, 0.48, M.main, 0, 0.22, 0, h);
    box(0.36, 0.09, 0.04, M.visor, 0, 0.24, 0.25, h);
    box(0.16, 0.12, 0.06, M.trim, 0, 0.07, 0.25, h);
    box(0.09, 0.1, 0.06, M.trim, 0, 0.41, 0.26, h);
    const fs = def.finSize || 1;
    for (const s of [-1, 1]) {
      rot(box(0.06, 0.62 * fs, 0.06, M.fin, 0.17 * s * fs, 0.56 + 0.05 * fs, 0.26, h), 0, 0, -s * 0.95);
      box(0.06, 0.22, 0.22, M.main, 0.25 * s, 0.24, 0, h);
    }
  },
  mono(h, M, def) {
    const head = sph(0.34, M.main, 0, 0.24, 0, h, 12); head.scale.set(1, 0.95, 1.08);
    box(0.5, 0.1, 0.12, MB(0x111111), 0, 0.26, 0.28, h);
    const eye = sph(0.07, M.visor, 0.08, 0.26, 0.34, h, 8); eye.name = "monoeye";
    for (const s of [-1, 1]) rot(cyl(0.04, 0.04, 0.45, M.dark, 0.14 * s, 0.05, 0.25, h), 1.2, 0, s * 0.4);
    if (def.horn) rot(cone(0.05, 0.5, M.accent, 0, 0.62, 0.15, h), -0.4, 0, 0);
  },
  sazabi(h, M) {
    box(0.6, 0.5, 0.6, M.main, 0, 0.25, 0, h);
    box(0.62, 0.1, 0.2, MB(0x111111), 0, 0.27, 0.24, h);
    sph(0.08, M.visor, 0, 0.27, 0.33, h, 8).name = "monoeye";
    rot(box(0.1, 0.5, 0.5, M.fin, 0, 0.6, -0.05, h), -0.3, 0, 0);
    for (const s of [-1, 1]) rot(box(0.08, 0.3, 0.35, M.accent, 0.33 * s, 0.35, 0, h), 0, 0, -s * 0.3);
  },
  sinanju(h, M) {
    const head = sph(0.3, M.main, 0, 0.24, 0, h, 12); head.scale.set(1, 1, 1.1);
    box(0.44, 0.08, 0.1, MB(0x111111), 0, 0.26, 0.28, h);
    sph(0.06, M.visor, 0, 0.26, 0.33, h, 8).name = "monoeye";
    for (const s of [-1, 1]) rot(box(0.05, 0.55, 0.05, M.fin, 0.12 * s, 0.6, 0.18, h), 0, 0, -s * 0.6);
    rot(box(0.06, 0.4, 0.06, M.fin, 0, 0.62, 0.2, h), 0.15, 0, 0);
  },
  unicorn(h, M, def) {
    HEADS.vfin(h, M, Object.assign({}, def, { finSize: 0.001 }));
    const horn = rot(cone(0.06, 0.75, M.fin, 0, 0.75, 0.2, h), -0.15, 0, 0); horn.name = "horn";
    const v = jnt("ntdFins", h, 0, 0, 0); v.visible = false;
    for (const s of [-1, 1]) rot(box(0.07, 0.75, 0.07, M.fin, 0.2 * s, 0.62, 0.26, v), 0, 0, -s * 0.85);
  },
  flag(h, M) {
    rot(box(0.3, 0.28, 0.62, M.main, 0, 0.22, 0.06, h), 0.1, 0, 0);
    box(0.32, 0.06, 0.3, M.visor, 0, 0.26, 0.24, h);
    rot(box(0.05, 0.45, 0.05, M.trim, 0, 0.5, -0.15, h), -0.6, 0, 0);
  },
  psycho(h, M) {
    box(0.6, 0.5, 0.5, M.main, 0, 0.25, 0, h);
    box(0.46, 0.1, 0.05, M.visor, 0, 0.28, 0.26, h);
    for (const s of [-1, 1]) rot(box(0.08, 0.55, 0.08, M.fin, 0.2 * s, 0.6, 0.15, h), 0, 0, -s * 0.5);
    box(0.7, 0.12, 0.5, M.accent, 0, 0.48, -0.02, h);
  },
};

/* ---------------- weapons (held in right hand, barrel along -y) ---------------- */
const WEAPONS = {
  rifle(hand, M) { box(0.12, 0.3, 0.14, M.dark, 0, -0.1, 0.06, hand); box(0.2, 1.3, 0.26, M.dark, 0, -0.62, 0.16, hand); box(0.1, 0.3, 0.1, M.metal, 0, -1.4, 0.16, hand); box(0.1, 0.35, 0.12, M.accent, 0, -0.5, 0.33, hand); return [0, -1.6, 0.16]; },
  magnum(hand, M) { box(0.28, 1.6, 0.34, M.dark, 0, -0.75, 0.18, hand); box(0.16, 0.5, 0.16, M.metal, 0, -1.7, 0.18, hand); box(0.14, 0.5, 0.2, M.trim, 0, -0.55, 0.42, hand); return [0, -2.0, 0.18]; },
  mg(hand, M) { box(0.2, 1.2, 0.24, M.dark, 0, -0.58, 0.14, hand); rot(cyl(0.22, 0.22, 0.12, M.dark, 0.18, -0.45, 0.14, hand, 12), 0, 0, Math.PI / 2); box(0.08, 0.3, 0.08, M.metal, 0, -1.3, 0.14, hand); return [0, -1.45, 0.14]; },
  linear(hand, M) { box(0.16, 2.1, 0.22, M.dark, 0, -1.0, 0.14, hand); box(0.24, 0.5, 0.3, M.trim, 0, -0.4, 0.14, hand); return [0, -2.1, 0.14]; },
  twin(hand, M) { for (const x of [-0.13, 0.13]) cyl(0.1, 0.1, 1.9, MS(0xdfe4ee), x, -0.95, 0.15, hand); box(0.4, 0.4, 0.3, M.accent, 0, -0.35, 0.15, hand); return [0, -1.95, 0.15]; },
  gnsword(hand, M) {
    box(0.4, 0.8, 0.34, M.main, 0, -0.3, 0.05, hand);
    box(0.06, 1.9, 0.32, MS(0xc9d2de, { metalness: 0.8, roughness: 0.2 }), 0, -1.6, 0.1, hand);
    box(0.02, 1.8, 0.05, GLOW(M.glowColor || 0x6dffb3, 0.9), 0, -1.6, 0.28, hand);
    return [0, -2.5, 0.1];
  },
};

/* ---------------- shields (left forearm, outer side = +x) ---------------- */
const SHIELDS = {
  rx(el, M) { const s = box(0.1, 1.35, 0.8, M.trim, 0.32, -0.35, 0.1, el); box(0.12, 0.95, 0.14, M.fin, 0.33, -0.35, 0.1, el); box(0.12, 0.14, 0.55, M.fin, 0.33, -0.05, 0.1, el); return s; },
  std(el, M) { box(0.1, 1.2, 0.7, M.main, 0.32, -0.35, 0.1, el); box(0.11, 0.8, 0.3, M.trim, 0.33, -0.4, 0.1, el); },
  small(el, M) { box(0.08, 0.8, 0.5, M.main, 0.3, -0.35, 0.1, el); box(0.09, 0.4, 0.2, M.trim, 0.31, -0.35, 0.1, el); },
  round(el, M) { rot(cyl(0.6, 0.6, 0.1, M.main, 0.36, -0.35, 0.1, el, 14), 0, 0, Math.PI / 2); rot(cyl(0.3, 0.3, 0.12, M.fin, 0.37, -0.35, 0.1, el, 12), 0, 0, Math.PI / 2); },
};

/* ---------------- shoulders ---------------- */
function shoulderArmor(sh, M, s, b, type) {
  if (type === "zaku") {
    if (s > 0) { box(0.6, 0.55, 0.75, M.main, 0.06, 0, 0, sh); for (let i = -1; i <= 1; i++) rot(cone(0.08, 0.3, M.dark, 0.2, 0.32, i * 0.22, sh), 0, 0, -0.3); }
    else { rot(box(0.12, 0.9, 0.85, M.main, -0.36, -0.1, 0, sh), 0, 0, 0.12); box(0.5, 0.45, 0.6, M.main, -0.05, 0, 0, sh); }
    return;
  }
  if (type === "big") { box(0.8 * b, 0.7, 0.95, M.main, 0.12 * s, 0.05, 0, sh); box(0.82 * b, 0.15, 0.97, M.trim, 0.12 * s, 0.38, 0, sh); return; }
  if (type === "round") { const r = sph(0.42, M.main, 0.08 * s, 0, 0, sh, 12); r.scale.set(1, 0.9, 1.1); tor(0.3, 0.04, M.fin, 0.08 * s, 0.22, 0, sh).rotation.x = Math.PI / 2; return; }
  box(0.62 * b, 0.55, 0.8, M.main, 0.05 * s, 0, 0, sh);
  box(0.64 * b, 0.12, 0.82, M.accent, 0.05 * s, 0.29, 0, sh);
  if (type === "twin") { rot(cone(0.22, 0.45, M.dark, 0.3 * s, 0, 0, sh, 10), 0, 0, s * Math.PI / 2); add(new T.Mesh(G("tw", () => new T.CircleGeometry(0.16, 12)), GLOW(M.glowColor || 0x6dffb3, 0.9)), 0.53 * s, 0, 0, sh).rotation.y = s * Math.PI / 2; }
}

/* ---------------- backpacks ---------------- */
function thruster(parent, M, x, y, z, rx, list, scale) {
  scale = scale || 1;
  rot(cyl(0.15 * scale, 0.2 * scale, 0.5 * scale, M.metal, x, y, z, parent), rx || -0.35, 0, 0);
  const f = rot(cone(0.15 * scale, 0.9 * scale, M.glow, x, y - 0.45 * scale, z - 0.18 * scale, parent), Math.PI - (rx || -0.35), 0, 0);
  list.push(f);
}
function featherWing(parent, M, s, pair, feathers, len0, mat, tip) {
  const wing = jnt("wing", parent, 0.3 * s, 0.2 - pair * 0.3, -0.1);
  rot(wing, 0, s * 0.35, s * (pair === 0 ? 0.55 : 1.2));
  for (let f = 0; f < feathers; f++) {
    const len = len0 + f * 0.25 - pair * 0.3;
    const fe = jnt("fe", wing, 0, 0, 0); fe.rotation.z = s * f * 0.13;
    box(0.3, len, 0.06, mat, 0.12 * s, len / 2, -f * 0.03, fe);
    box(0.3, 0.35, 0.07, tip, 0.12 * s, len - 0.1, -f * 0.03, fe);
  }
  return wing;
}
const PACKS = {
  basic(bk, M, rig) {
    box(0.86, 0.86, 0.42, M.dark, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) { rot(cyl(0.05, 0.05, 0.45, MS(0xf2f2f2), 0.25 * s, 0.55, -0.15, bk), 0.3, 0, 0); thruster(bk, M, 0.26 * s, -0.45, -0.3, -0.35, rig.thrusters); }
  },
  zaku(bk, M, rig) {
    box(0.9, 0.8, 0.5, M.main, 0, 0, -0.12, bk);
    for (const x of [-0.3, 0, 0.3]) thruster(bk, M, x, -0.45, -0.35, -0.2, rig.thrusters, 0.8);
  },
  aile(bk, M, rig) {
    box(0.8, 0.7, 0.4, M.main, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) {
      const w = jnt("wing", bk, 0.35 * s, 0.25, -0.2); rot(w, 0, 0, s * -0.9);
      box(0.14, 1.6, 0.5, M.trim, 0, 0.8, 0, w); box(0.15, 0.4, 0.52, M.main, 0, 1.55, 0, w);
      rig.wings.push({ g: w, s, base: w.rotation.z });
      thruster(bk, M, 0.2 * s, -0.4, -0.3, -0.3, rig.thrusters);
    }
  },
  aegis(bk, M, rig) {
    box(0.9, 0.9, 0.45, M.main, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) {
      const w = jnt("wing", bk, 0.45 * s, 0.1, -0.25); rot(w, -0.5, 0, s * -0.4);
      box(0.25, 1.4, 0.3, M.main, 0, 0.6, 0, w); rot(cone(0.14, 0.5, M.dark, 0, 1.45, 0, w), 0, 0, 0);
      rig.wings.push({ g: w, s, base: w.rotation.z });
      thruster(bk, M, 0.22 * s, -0.45, -0.3, -0.35, rig.thrusters);
    }
  },
  flag(bk, M, rig) {
    box(0.6, 0.6, 0.4, M.dark, 0, 0, -0.1, bk);
    const w = jnt("wing", bk, 0, 0.2, -0.45); box(2.6, 0.06, 0.5, M.main, 0, 0, 0, w); box(2.6, 0.08, 0.12, M.accent, 0, 0, -0.24, w);
    rig.wings.push({ g: w, s: 1, base: 0 });
    rot(box(0.08, 0.7, 0.4, M.main, 0, 0.45, -0.55, bk), -0.3, 0, 0);
    thruster(bk, M, 0, -0.4, -0.4, -0.3, rig.thrusters, 1.2);
  },
  zeta(bk, M, rig) {
    box(0.8, 0.8, 0.4, M.main, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) {
      const w = jnt("wing", bk, 0.35 * s, 0.3, -0.25); rot(w, 0.3, 0, s * -0.5);
      box(0.1, 1.5, 0.45, M.accent, 0, 0.75, 0, w); box(0.11, 0.3, 0.46, M.trim, 0, 1.4, 0, w);
      rig.wings.push({ g: w, s, base: w.rotation.z });
      thruster(bk, M, 0.24 * s, -0.42, -0.3, -0.35, rig.thrusters);
    }
    rot(box(0.12, 1.1, 0.3, M.main, 0, -0.6, -0.4, bk), 0.5, 0, 0);
  },
  sazabi(bk, M, rig) {
    box(1.1, 1.0, 0.55, M.main, 0, 0, -0.15, bk);
    for (const s of [-1, 1]) { const pod = box(0.45, 1.2, 0.45, M.accent, 0.62 * s, 0.1, -0.35, bk); pod.rotation.z = s * 0.15; thruster(bk, M, 0.3 * s, -0.55, -0.35, -0.3, rig.thrusters, 1.1); }
  },
  sinanju(bk, M, rig) {
    box(0.8, 0.8, 0.4, M.main, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) {
      const w = jnt("wing", bk, 0.35 * s, 0.35, -0.25); rot(w, 0.2, 0, s * -0.7);
      for (let i = 0; i < 3; i++) { box(0.18, 0.6, 0.4, M.main, 0, 0.3 + i * 0.55, 0, w); box(0.19, 0.08, 0.41, M.fin, 0, 0.6 + i * 0.55, 0, w); }
      rig.wings.push({ g: w, s, base: w.rotation.z });
      thruster(bk, M, 0.22 * s, -0.42, -0.3, -0.3, rig.thrusters);
    }
  },
  exia(bk, M, rig) {
    box(0.7, 0.7, 0.35, M.main, 0, 0, -0.1, bk);
    rot(cone(0.32, 0.6, M.dark, 0, 0, -0.55, bk, 12), -Math.PI / 2, 0, 0);
    const ring = rot(tor(0.25, 0.05, GLOW(M.glowColor || 0x6dffb3, 0.9), 0, 0, -0.85, bk), 0, 0, 0); rig.thrusters.push(ring);
    for (const s of [-1, 1]) thruster(bk, M, 0.25 * s, -0.4, -0.25, -0.3, rig.thrusters, 0.8);
  },
  twin(bk, M, rig) {
    box(0.7, 0.7, 0.35, M.main, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) {
      const w = jnt("wing", bk, 0.4 * s, 0.25, -0.3); rot(w, 0.2, 0, s * -1.0);
      box(0.12, 1.3, 0.4, M.accent, 0, 0.65, 0, w); box(0.13, 0.25, 0.42, M.trim, 0, 1.25, 0, w);
      rig.wings.push({ g: w, s, base: w.rotation.z });
    }
    rot(cone(0.28, 0.55, M.dark, 0, -0.1, -0.5, bk, 12), -Math.PI / 2, 0, 0);
    rig.thrusters.push(rot(tor(0.22, 0.05, GLOW(M.glowColor || 0x6dffb3, 0.9), 0, -0.1, -0.78, bk), 0, 0, 0));
  },
  freedom(bk, M, rig) {
    box(0.8, 0.8, 0.4, M.dark, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) {
      const w = jnt("wing", bk, 0.3 * s, 0.3, -0.3); rot(w, 0.1, s * 0.25, s * -0.35);
      for (let i = 0; i < 5; i++) { const bl = jnt("bl", w, 0, 0, -i * 0.02); bl.rotation.z = s * -i * 0.22; box(0.22, 1.7 - i * 0.12, 0.06, M.accent, 0.12 * s, 0.85 - i * 0.06, 0, bl); box(0.23, 0.25, 0.07, M.trim, 0.12 * s, 1.6 - i * 0.18, 0, bl); }
      rig.wings.push({ g: w, s, base: w.rotation.z });
      thruster(bk, M, 0.22 * s, -0.45, -0.25, -0.3, rig.thrusters, 0.9);
    }
  },
  destiny(bk, M, rig) {
    box(0.85, 0.85, 0.42, M.dark, 0, 0, -0.1, bk);
    const lightMat = GLOW(M.glowColor || 0xff4d8a, 0.35);
    for (const s of [-1, 1]) {
      const w = jnt("wing", bk, 0.35 * s, 0.35, -0.3); rot(w, 0.15, s * 0.3, s * -0.6);
      box(0.16, 1.8, 0.35, M.trim, 0, 0.9, 0, w);
      for (let i = 0; i < 3; i++) rot(box(0.03, 1.6 + i * 0.3, 0.9, lightMat, 0.1 * s, 1.1 + i * 0.15, -0.3 - i * 0.2, w), 0, 0, s * (0.2 + i * 0.18));
      rig.wings.push({ g: w, s, base: w.rotation.z });
      thruster(bk, M, 0.22 * s, -0.45, -0.25, -0.3, rig.thrusters, 0.9);
    }
    rot(box(0.18, 2.4, 0.2, MS(0x9aa3b5), -0.5, -0.1, -0.45, bk), 0, 0, 0.35);
  },
  nu(bk, M, rig) {
    box(0.85, 0.85, 0.42, M.dark, 0, 0, -0.1, bk);
    const w = jnt("wing", bk, 0.5, 0.0, -0.35); rig.wings.push({ g: w, s: 1, base: 0 });
    for (let i = 0; i < 6; i++) { const fin = jnt("fin", w, 0, 0, -i * 0.06); fin.rotation.z = -0.15 - i * 0.05; box(0.18, 1.6, 0.06, M.accent, 0.1 + i * 0.05, 0.6, 0, fin); box(0.5, 0.18, 0.06, M.accent, 0.3 + i * 0.05, 1.35, 0, fin); }
    thruster(bk, M, -0.25, -0.45, -0.3, -0.35, rig.thrusters);
    thruster(bk, M, 0.0, -0.45, -0.3, -0.35, rig.thrusters);
  },
  unicorn(bk, M, rig) {
    box(0.8, 0.85, 0.4, M.main, 0, 0, -0.1, bk);
    for (const s of [-1, 1]) { box(0.06, 0.7, 0.06, M.glow, 0.25 * s, 0.05, -0.31, bk); rot(cyl(0.05, 0.05, 0.45, MS(0xf2f2f2), 0.25 * s, 0.55, -0.15, bk), 0.3, 0, 0); thruster(bk, M, 0.26 * s, -0.45, -0.3, -0.35, rig.thrusters); }
  },
  seraph(bk, M, rig) {
    box(0.86, 0.86, 0.42, M.dark, 0, 0, -0.1, bk);
    const wingMat = MS(0xffffff, { metalness: 0.2, roughness: 0.35 }), tipMat = M.accent;
    for (const s of [-1, 1]) for (let pair = 0; pair < 2; pair++) {
      const w = featherWing(bk, M, s, pair, 5, 1.6, wingMat, tipMat);
      rig.wings.push({ g: w, s, base: w.rotation.z });
    }
    for (const s of [-1, 1]) thruster(bk, M, 0.26 * s, -0.45, -0.3, -0.35, rig.thrusters);
  },
  destroy(bk, M, rig) {
    const disc = jnt("wing", bk, 0, 0.4, -0.6); rig.wings.push({ g: disc, s: 1, base: 0, spin: true });
    rot(cyl(1.6, 1.6, 0.25, M.dark, 0, 0, 0, disc, 20), Math.PI / 2, 0, 0);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; sph(0.16, GLOW(0xff3355, 0.9), Math.cos(a) * 1.35, Math.sin(a) * 1.35, -0.14, disc, 8); }
    for (const s of [-1, 1]) thruster(bk, M, 0.3 * s, -0.4, -0.3, -0.35, rig.thrusters);
  },
  mantis(bk, M, rig) {
    box(1.0, 1.0, 0.5, M.main, 0, 0, -0.15, bk);
    for (const s of [-1, 1]) { const w = jnt("wing", bk, 0.6 * s, 0.4, -0.2); rot(w, 0, 0, s * -0.3); box(0.3, 2.2, 1.2, M.accent, 0, 0.6, 0, w); box(0.31, 0.2, 1.22, M.fin, 0, 1.6, 0, w); rig.wings.push({ g: w, s, base: w.rotation.z }); }
    for (const s of [-1, 1]) thruster(bk, M, 0.3 * s, -0.5, -0.3, -0.35, rig.thrusters);
  },
};

/* ---------------- the mech itself ---------------- */
function buildMech(def) {
  const c = def.colors, b = def.bulk || 1;
  const M = {
    main: MS(c.main), accent: MS(c.accent), trim: MS(c.trim), dark: MS(c.dark), metal: MS(0x9aa3b5),
    fin: MS(c.fin, { metalness: 0.3, roughness: 0.4, emissive: c.fin, emissiveIntensity: 0.25 }),
    visor: MB(c.visor), glow: GLOW(c.glow || 0x7fd8ff, 0.85), glowColor: c.glow,
  };
  const root = new T.Group();
  const rig = { root, thrusters: [], wings: [] };
  const pelvis = rig.pelvis = jnt("pelvis", root, 0, 1.55, 0);
  box(0.85 * b, 0.36, 0.62, M.dark, 0, 0, 0, pelvis);
  box(0.34, 0.3, 0.12, M.trim, 0, -0.05, 0.33, pelvis);
  for (const s of [-1, 1]) {
    rot(box(0.44 * b, 0.5, 0.12, M.main, 0.3 * s * b, -0.2, 0.32, pelvis), -0.15, 0, 0);
    box(0.12, 0.5, 0.45, M.main, 0.5 * s * b, -0.2, 0, pelvis);
  }
  // legs (mech's right side is -x)
  for (const s of [-1, 1]) {
    const side = s < 0 ? "R" : "L";
    const hip = rig["hip" + side] = jnt("hip" + side, pelvis, 0.32 * s * b, -0.15, 0);
    box(0.42 * b, 0.82, 0.46, M.dark, 0, -0.4, 0, hip);
    const knee = rig["knee" + side] = jnt("knee" + side, hip, 0, -0.82, 0);
    box(0.54 * b, 1.0, 0.64, M.main, 0, -0.48, 0.02, knee);
    box(0.34 * b, 0.32, 0.16, M.accent, 0, -0.12, 0.36, knee);
    if (def.psycho) box(0.06, 0.7, 0.02, M.glow, 0, -0.5, 0.35, knee);
    const ankle = rig["ankle" + side] = jnt("ankle" + side, knee, 0, -0.98, 0);
    box(0.54 * b, 0.22, 0.92, M.trim, 0, -0.1, 0.1, ankle);
  }
  if (def.pack === "freedom") for (const s of [-1, 1]) rot(box(0.18, 0.2, 1.6, M.dark, 0.62 * s * b, -0.1, -0.1, pelvis), 0.2, 0, 0); // rail cannons
  // torso
  const torso = rig.torso = jnt("torso", pelvis, 0, 0.18, 0);
  box(0.72 * b, 0.42, 0.66, M.main, 0, 0.22, 0, torso);
  box(1.25 * b, 1.0, 0.78, M.accent, 0, 0.82, 0, torso);
  for (const s of [-1, 1]) box(0.36, 0.26, 0.08, M.fin, 0.3 * s, 0.92, 0.41, torso);
  if (def.psycho) for (const s of [-1, 1]) box(0.05, 0.6, 0.02, M.glow, 0.5 * s, 0.8, 0.4, torso);
  if (def.pack === "seraph") box(0.16, 0.5, 0.16, M.trim, 0, 1.0, 0.42, torso);
  // head
  rig.head = jnt("neck", torso, 0, 1.36, 0.02);
  (HEADS[def.head] || HEADS.vfin)(rig.head, M, def);
  // arms
  for (const s of [-1, 1]) {
    const side = s < 0 ? "R" : "L";
    const sh = rig["sh" + side] = jnt("sh" + side, torso, 0.98 * s * b, 1.05, 0);
    shoulderArmor(sh, M, s, b, def.shoulder);
    box(0.3, 0.55, 0.32, M.dark, 0, -0.38, 0, sh);
    const el = rig["el" + side] = jnt("el" + side, sh, 0, -0.66, 0);
    box(0.42, 0.75, 0.44, M.main, 0, -0.35, 0.03, el);
    if (def.psycho) box(0.04, 0.5, 0.02, M.glow, 0, -0.35, 0.26, el);
    const hand = rig["hand" + side] = jnt("hand" + side, el, 0, -0.8, 0.05);
    box(0.28, 0.26, 0.3, M.dark, 0, -0.05, 0, hand);
  }
  const mz = (WEAPONS[def.weapon] || WEAPONS.rifle)(rig.handR, M);
  rig.muzzle = jnt("muzzle", rig.handR, mz[0], mz[1], mz[2]);
  rig.flash = sph(0.35, GLOW(0xfff2a8, 0.95), 0, 0, 0, rig.muzzle, 8); rig.flash.visible = false;
  if (def.shield) (SHIELDS[def.shield] || SHIELDS.std)(rig.elL, M);
  // backpack
  rig.back = jnt("back", torso, 0, 0.9, -0.42);
  (PACKS[def.pack] || PACKS.basic)(rig.back, M, rig);
  rig.horn = rig.head.getObjectByName("horn");
  rig.ntd = rig.head.getObjectByName("ntdFins");
  root.userData.rig = rig;
  root.userData.def = def;
  if (b !== 1) root.scale.setScalar(1);
  return root;
}

function newAnim() { return { t: Math.random() * 10, yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, aiming: 0, wantAim: 0, recoil: 0, hit: 0, flash: 0, victory: 0, special: 0, idle: true }; }

/* Aim at a world-space point (or null to relax). */
function aimMech(mesh, anim, worldPoint) {
  if (!worldPoint) { anim.wantAim = 0; return; }
  const p = mesh.worldToLocal(worldPoint.clone());
  anim.tyaw = clamp(Math.atan2(p.x, p.z), -1.0, 1.0);
  anim.tpitch = clamp(Math.atan2(p.y - 2.6, Math.hypot(p.x, p.z)), -0.5, 0.7);
  anim.wantAim = 1;
}
function fireMech(anim, big) { anim.recoil = Math.min(1.2, anim.recoil + (big ? 1 : 0.35)); anim.flash = big ? 0.12 : 0.05; anim.wantAim = 1; }

function animateMech(mesh, anim, dt) {
  const r = mesh.userData.rig; if (!r) return;
  anim.t += dt;
  const t = anim.t, k = Math.min(1, dt * 9);
  anim.aiming += (anim.wantAim - anim.aiming) * Math.min(1, dt * 6);
  anim.yaw += (anim.tyaw * anim.wantAim - anim.yaw) * k;
  anim.pitch += (anim.tpitch * anim.wantAim - anim.pitch) * k;
  anim.recoil = Math.max(0, anim.recoil - dt * 5);
  anim.hit = Math.max(0, anim.hit - dt * 2.2);
  anim.flash = Math.max(0, anim.flash - dt);
  anim.victory = Math.max(0, anim.victory - dt * 0.6);
  anim.special = Math.max(0, anim.special - dt);
  const a = anim.aiming, rc = anim.recoil, h = anim.hit, v = Math.min(1, anim.victory * 2);
  const breathe = Math.sin(t * 2.1);
  // whole body
  r.root.position.y = Math.sin(t * 1.8) * 0.12 - h * 0.25;
  r.pelvis.rotation.set(0.14 - h * 0.45 - rc * 0.05, anim.yaw * 0.25, Math.sin(t * 1.1) * 0.04 - h * 0.15);
  r.torso.rotation.set(breathe * 0.025 - rc * 0.12 - anim.pitch * 0.2 * a, anim.yaw * 0.55 * a + Math.sin(t * 0.7) * 0.06 * (1 - a), Math.sin(t * 1.3) * 0.03 + rc * 0.04);
  r.head.rotation.set(-anim.pitch * 0.5 * a + h * 0.3, anim.yaw * 0.35 * a + Math.sin(t * 0.55) * 0.35 * (1 - a), 0);
  // right arm: weapon ready -> aim -> recoil
  r.shR.rotation.set(lerp(-0.45 + breathe * 0.04, -1.38 - anim.pitch, a) + rc * 0.45 - v * 1.4, anim.yaw * 0.25 * a, lerp(0.15, 0.05, a) - v * 0.3);
  r.elR.rotation.set(lerp(-0.95, -0.12, a) - rc * 0.55, 0, 0);
  r.handR.rotation.set(-rc * 0.15, 0, 0);
  // left arm: guard / support
  r.shL.rotation.set(lerp(-0.25, -0.85, a) + Math.sin(t * 1.3) * 0.05 - h * 0.6, -0.2 * a, lerp(-0.18, -0.35, a));
  r.elL.rotation.set(lerp(-0.7, -1.35, a) - h * 0.4, 0, 0);
  // legs: flying pose with gentle kicks
  r.hipR.rotation.set(-0.55 + Math.sin(t * 1.6) * 0.08 + h * 0.3, 0, 0.06);
  r.kneeR.rotation.set(0.95 + Math.sin(t * 1.6 + 1) * 0.1, 0, 0);
  r.ankleR.rotation.set(0.35, 0, 0);
  r.hipL.rotation.set(-0.2 + Math.sin(t * 1.6 + 2) * 0.08 + h * 0.3, 0, -0.06);
  r.kneeL.rotation.set(0.55 + Math.sin(t * 1.6 + 3) * 0.1, 0, 0);
  r.ankleL.rotation.set(0.3, 0, 0);
  // effects
  r.flash.visible = anim.flash > 0;
  if (r.flash.visible) r.flash.scale.setScalar(0.6 + Math.random() * 0.8);
  const boost = 0.8 + Math.random() * 0.35 + rc * 0.6;
  for (const th of r.thrusters) { if (th.geometry && th.geometry.type === "TorusGeometry") th.rotation.z += dt * 4; else th.scale.y = boost; }
  for (const w of r.wings) {
    if (w.spin) { w.g.rotation.z += dt * 0.8; continue; }
    w.g.rotation.z = w.base + (Math.sin(t * 1.6) * 0.06 + rc * 0.05 - v * 0.2) * w.s;
  }
  if (r.horn) { const on = anim.special > 0; r.horn.visible = !on; if (r.ntd) r.ntd.visible = on; }
}

/* =====================================================================
 *  ENEMIES (13 types). Built fresh for each spawn (geometry/material shared).
 *  size: short / mid / long word groups
 * ===================================================================== */
function humanoid(o) {
  const c = o.c, b = o.bulk || 1;
  const main = MS(c.main), dark = MS(c.dark), acc = MS(c.accent || c.dark), eye = MB(c.eye || 0xff2d6f);
  const g = new T.Group(), rig = {};
  const body = rig.body = jnt("body", g, 0, 1.75, 0);
  box(1.1 * b, 0.95, 0.8, main, 0, 0.45, 0, body);
  box(0.75 * b, 0.4, 0.6, dark, 0, -0.1, 0, body);
  if (o.skirt) { const sk = cone(0.95 * b, 1.4, main, 0, -0.65, 0, body, 10); sk.scale.z = 0.8; }
  const head = rig.head = jnt("head", body, 0, 1.15, 0);
  switch (o.head) {
    case "goggle": box(0.5, 0.42, 0.48, main, 0, 0, 0, head); box(0.46, 0.12, 0.06, MB(c.eye || 0x7df9ff), 0, 0.03, 0.25, head); box(0.08, 0.3, 0.08, acc, 0.2, 0.25, -0.1, head); break;
    case "crest": { const hd = sph(0.34, main, 0, 0, 0, head, 10); hd.scale.set(1, 0.9, 1.1); box(0.44, 0.08, 0.1, MB(0x111111), 0, 0, 0.3, head); sph(0.06, eye, 0.1, 0, 0.36, head, 6); rot(box(0.06, 0.5, 0.5, acc, 0, 0.32, -0.05, head), -0.3, 0, 0); break; }
    case "cross": { const hd = sph(0.36, main, 0, 0, 0, head, 10); hd.scale.set(1, 1, 1.15); box(0.5, 0.08, 0.1, MB(0x111111), 0, 0, 0.33, head); box(0.08, 0.36, 0.1, MB(0x111111), 0, 0, 0.33, head); sph(0.07, eye, 0, 0, 0.4, head, 6); break; }
    case "gnx": box(0.45, 0.4, 0.5, main, 0, 0, 0, head); box(0.42, 0.08, 0.05, eye, 0, 0.05, 0.26, head); rot(box(0.05, 0.4, 0.05, acc, 0, 0.3, 0.15, head), -0.5, 0, 0); break;
    case "dome": { const hd = sph(0.3, main, 0, 0.05, 0, head, 10); hd.scale.y = 0.8; sph(0.08, eye, 0, 0.05, 0.28, head, 6); break; }
    default: { const hd = sph(0.4, main, 0, 0, 0, head, 10); hd.scale.set(1, 0.9, 1.05); box(0.6, 0.1, 0.1, MB(0x111111), 0, 0, 0.38, head); sph(0.08, eye, 0.1, 0, 0.42, head, 6); for (const s of [-1, 1]) rot(cyl(0.05, 0.05, 0.4, dark, 0.15 * s, -0.2, 0.3, head), 1.1, 0, s * 0.3); }
  }
  for (const s of [-1, 1]) {
    const side = s < 0 ? "R" : "L";
    const arm = rig["arm" + side] = jnt("arm" + side, body, 0.85 * s * b, 0.75, 0);
    switch (o.shoulder) {
      case "spike": box(0.55, 0.5, 0.7, main, 0.05 * s, 0.05, 0, arm); for (const z of [-0.2, 0.2]) cone(0.1, 0.35, dark, 0.15 * s, 0.4, z, arm); break;
      case "round": { const sp = sph(0.4, main, 0.05 * s, 0.05, 0, arm, 10); sp.scale.y = 0.85; break; }
      case "shield": if (s < 0) rot(box(0.12, 0.95, 0.8, main, -0.35, -0.1, 0, arm), 0, 0, 0.15); else box(0.5, 0.45, 0.6, main, 0.05, 0.05, 0, arm); break;
      default: box(0.55, 0.45, 0.65, main, 0.05 * s, 0.05, 0, arm);
    }
    box(0.28, 1.1, 0.32, dark, 0, -0.55, 0.05, arm);
    if (s < 0) {
      switch (o.weapon) {
        case "bazooka": rot(cyl(0.2, 0.2, 2.2, acc, -0.3, -0.6, 0.2, arm, 10), 0.2, 0, 0); break;
        case "sword": box(0.08, 1.6, 0.2, MS(0xc9d2de, { metalness: 0.8 }), 0, -1.7, 0.1, arm); break;
        case "naginata": box(0.08, 2.4, 0.08, dark, 0, -1.2, 0.2, arm); box(0.05, 0.7, 0.14, GLOW(0xff5aa0, 0.9), 0, -2.6, 0.2, arm); box(0.05, 0.7, 0.14, GLOW(0xff5aa0, 0.9), 0, 0.2, 0.2, arm); break;
        case "rifle": box(0.16, 1.7, 0.22, dark, 0, -1.4, 0.15, arm); break;
        case "lance": rot(cone(0.22, 2.2, acc, 0, -1.9, 0.15, arm, 8), Math.PI, 0, 0); break;
        default: box(0.18, 1.1, 0.24, dark, 0, -1.3, 0.15, arm); rot(cyl(0.18, 0.18, 0.1, dark, 0.15, -1.1, 0.15, arm, 10), 0, 0, Math.PI / 2);
      }
    } else if (o.shield) box(0.1, 1.1, 0.7, acc, 0.3, -0.6, 0.1, arm);
  }
  for (const s of [-1, 1]) {
    const side = s < 0 ? "R" : "L";
    const leg = rig["leg" + side] = jnt("leg" + side, body, 0.3 * s * b, -0.3, 0);
    if (o.skirt) { box(0.5, 0.7, 0.6, dark, 0, -1.0, 0, leg); box(0.55, 0.25, 0.8, main, 0, -1.4, 0.1, leg); }
    else { box(0.42 * b, 1.3, 0.5, main, 0, -0.75, 0, leg); box(0.46 * b, 0.22, 0.8, dark, 0, -1.45, 0.1, leg); }
  }
  if (o.pack !== false) {
    box(0.8, 0.8, 0.4, o.pack === "gn" ? dark : main, 0, 0.5, -0.55, body);
    if (o.pack === "gn") { rot(cone(0.25, 0.5, dark, 0, 0.5, -0.9, body, 10), -Math.PI / 2, 0, 0); sph(0.12, GLOW(0xff4040, 0.9), 0, 0.5, -1.15, body, 8); }
    else for (const s of [-1, 1]) rot(cone(0.12, 0.5, GLOW(0xffaa44, 0.8), 0.25 * s, 0.0, -0.85, body), Math.PI - 0.4, 0, 0);
  }
  g.userData.rig = rig;
  return g;
}

const ENEMY_TYPES = {
  // --- short words ---
  drone: { size: "short", build() {
    const g = new T.Group(), rig = {};
    const body = rig.body = jnt("body", g, 0, 2, 0);
    sph(0.75, MS(0x8a92a8, { metalness: 0.7, roughness: 0.3 }), 0, 0, 0, body, 4).scale.set(1, 0.9, 1);
    sph(0.2, MB(0xff4455), 0, 0, 0.62, body, 8);
    rig.spin = rot(tor(1.05, 0.08, MS(0xffaa33), 0, 0, 0, body), Math.PI / 2, 0, 0);
    g.userData.rig = rig; return g; } },
  ball: { size: "short", build() {
    const g = new T.Group(), rig = {};
    const body = rig.body = jnt("body", g, 0, 2, 0);
    sph(0.85, MS(0x6f7f6a), 0, 0, 0, body, 14);
    box(0.5, 0.3, 0.1, MB(0x8ff5ff), 0, 0.15, 0.82, body);
    const gun = rig.armR = jnt("armR", body, 0, 0.75, 0); rot(cyl(0.12, 0.12, 1.2, MS(0x3a3f45), 0, 0.2, 0.5, gun), Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) { const a = rig[s < 0 ? "armL" : "legL"] = jnt(s < 0 ? "armL" : "legL", body, 0.7 * s, -0.3, 0.3); box(0.1, 0.6, 0.1, MS(0x3a3f45), 0, -0.3, 0, a); }
    g.userData.rig = rig; return g; } },
  jet: { size: "short", build() {
    const g = new T.Group(), rig = {};
    const body = rig.body = jnt("body", g, 0, 2.2, 0);
    rot(cone(0.4, 2.6, MS(0x9aa6b8), 0, 0, 0.2, body, 8), Math.PI / 2, 0, 0);
    box(3.0, 0.08, 0.9, MS(0x3a5f8f), 0, 0, -0.3, body);
    box(0.06, 0.8, 0.6, MS(0x3a5f8f), 0, 0.4, -0.8, body);
    box(0.25, 0.12, 0.4, MB(0x8ff5ff), 0, 0.28, 0.6, body);
    rig.thr = rot(cone(0.25, 0.9, GLOW(0xffaa44), 0, 0, -1.4, body), -Math.PI / 2, 0, 0);
    rig.bank = true;
    g.userData.rig = rig; return g; } },
  bit: { size: "short", build() {
    const g = new T.Group(), rig = {};
    const body = rig.body = jnt("body", g, 0, 2, 0);
    rot(cone(0.5, 1.8, MS(0x6b4fa8, { metalness: 0.6 }), 0, 0, 0, body, 3), Math.PI / 2, 0, 0);
    sph(0.2, GLOW(0xff4dd2), 0, 0, 0.95, body, 8);
    rig.spin = body; rig.spinAxis = "z";
    g.userData.rig = rig; return g; } },
  // --- mid words ---
  grunt: { size: "mid", build() { return humanoid({ c: { main: 0x557d4a, dark: 0x2e3a2b, eye: 0xff2d6f }, head: "mono", shoulder: "shield", weapon: "mg" }); } },
  gouf: { size: "mid", build() { return humanoid({ c: { main: 0x3f69b5, dark: 0x22314f, accent: 0x9aa6b8, eye: 0xff2d6f }, head: "crest", shoulder: "spike", weapon: "sword", shield: true }); } },
  goggle: { size: "mid", build() { return humanoid({ c: { main: 0xd9d4c4, dark: 0x8a2a2a, accent: 0xb33a3a, eye: 0x7df9ff }, head: "goggle", shoulder: "box", weapon: "rifle", shield: true }); } },
  ginn: { size: "mid", build() { return humanoid({ c: { main: 0x6c7a72, dark: 0x3b4440, accent: 0xa9b2ad, eye: 0xff2d6f }, head: "crest", shoulder: "box", weapon: "sword" }); } },
  gnx: { size: "mid", build() { return humanoid({ c: { main: 0x4a4f5c, dark: 0x262932, accent: 0xb8323a, eye: 0xff3030 }, head: "gnx", shoulder: "box", weapon: "lance", pack: "gn" }); } },
  // --- long words ---
  heavy: { size: "long", build() {
    const g = new T.Group(), rig = {};
    const body = rig.body = jnt("body", g, 0, 2.0, 0);
    box(2.0, 1.2, 1.5, MS(0x5a3d7a), 0, 0, 0, body);
    box(1.0, 0.25, 0.1, MB(0xffd23c), 0, 0.2, 0.78, body);
    for (const s of [-1, 1]) rot(cyl(0.2, 0.25, 1.8, MS(0x25192f), 0.8 * s, 0.7, 0.5, body), Math.PI / 2, 0, 0);
    const legs = [];
    for (const s of [-1, 1]) for (const z of [-0.5, 0.5]) { const l = jnt("leg", body, 1.0 * s, -0.2, z); rot(box(0.25, 1.4, 0.25, MS(0x25192f), 0.15 * s, -0.6, 0, l), 0, 0, s * 0.4); legs.push(l); }
    rig.legs = legs;
    g.userData.rig = rig; return g; } },
  dom: { size: "long", build() { return humanoid({ c: { main: 0x4b3a6b, dark: 0x1f1a2b, accent: 0x8a8f9c, eye: 0xff2d6f }, head: "cross", shoulder: "round", weapon: "bazooka", skirt: true, bulk: 1.25, pack: false }); } },
  gelgoog: { size: "long", build() { return humanoid({ c: { main: 0x8a8f5a, dark: 0x3f4228, accent: 0x5a5d3a, eye: 0xff2d6f }, head: "crest", shoulder: "round", weapon: "naginata", shield: true, bulk: 1.1 }); } },
  acguy: { size: "long", build() {
    const g = new T.Group(), rig = {};
    const body = rig.body = jnt("body", g, 0, 2.0, 0);
    const b = sph(1.0, MS(0x8b6a3f), 0, 0.3, 0, body, 14); b.scale.set(1, 1.3, 0.9);
    for (let i = -1; i <= 1; i++) sph(0.1, MB(0xff2d6f), i * 0.25, 0.9, 0.8, body, 6);
    for (const s of [-1, 1]) {
      const side = s < 0 ? "R" : "L";
      const arm = rig["arm" + side] = jnt("arm" + side, body, 1.0 * s, 0.5, 0);
      for (let i = 0; i < 4; i++) sph(0.18, MS(0x5e4628), 0.05 * s, -0.25 - i * 0.28, 0, arm, 8);
      for (const d of [-1, 1]) rot(cone(0.08, 0.5, MS(0xd9d4c4), 0.1 * d, -1.4, 0.1, arm), Math.PI + d * 0.3, 0, 0);
      const leg = rig["leg" + side] = jnt("leg" + side, body, 0.45 * s, -0.8, 0);
      box(0.35, 0.8, 0.4, MS(0x5e4628), 0, -0.4, 0, leg); box(0.5, 0.2, 0.7, MS(0x3a2c18), 0, -0.85, 0.1, leg);
    }
    g.userData.rig = rig; return g; } },
};
const ENEMY_SIZES = { short: [], mid: [], long: [] };
for (const [id, e] of Object.entries(ENEMY_TYPES)) ENEMY_SIZES[e.size].push(id);
const ENEMY_SCALE = { short: 1.35, mid: 1.25, long: 1.45 };
const enemyTopCache = {};

function buildEnemy(type) {
  const def = ENEMY_TYPES[type];
  const g = def.build();
  g.scale.setScalar(ENEMY_SCALE[def.size]);
  if (enemyTopCache[type] == null) { const bb = new T.Box3().setFromObject(g); enemyTopCache[type] = bb.max.y + 0.7; }
  g.userData.top = enemyTopCache[type];
  return g;
}

function animateEnemy(mesh, st, dt, time) {
  const r = mesh.userData.rig; if (!r) return;
  const ph = st.wob || 0, sw = Math.sin(time * 3.2 + ph);
  const aim = clamp((st.progress - 0.35) * 2.5, 0, 1);
  if (r.body) { r.body.rotation.x = 0.22; r.body.rotation.z = clamp(-(st.vx || 0) * 0.12, -0.6, 0.6) * (r.bank ? 2 : 1); }
  if (r.legR && r.legL) { r.legR.rotation.x = -0.35 + sw * 0.4; r.legL.rotation.x = -0.35 - sw * 0.4; }
  if (r.legs) r.legs.forEach((l, i) => { l.rotation.x = Math.sin(time * 5 + ph + i * 1.6) * 0.35; });
  if (r.armL) r.armL.rotation.x = -0.25 - sw * 0.35;
  if (r.armR) r.armR.rotation.x = lerp(-0.25 + sw * 0.35, -1.45, aim);
  if (r.head) r.head.rotation.y = Math.sin(time * 1.4 + ph) * 0.5 * (1 - aim);
  if (r.spin) { if (r.spinAxis === "z") r.spin.rotation.z += dt * 6; else r.spin.rotation.z += dt * 3; }
  if (r.thr) r.thr.scale.y = 0.7 + Math.random() * 0.6;
}

/* =====================================================================
 *  BOSSES (15): battleships and giant mobile armors.
 *  Built fresh each time. anim parts: turrets, spinners, arms, cores, orbit, mech
 * ===================================================================== */
function bossParts() { return { turrets: [], spinners: [], arms: [], cores: [], orbit: null, mech: null, anim: null }; }
function turret(parent, P, mat, x, y, z, s) {
  s = s || 1;
  const t = jnt("turret", parent, x, y, z);
  box(0.9 * s, 0.4 * s, 0.9 * s, mat, 0, 0, 0, t);
  for (const d of [-0.18, 0.18]) rot(cyl(0.07 * s, 0.07 * s, 1.2 * s, MS(0x30333b), d * s, 0.05, 0.6 * s, t), Math.PI / 2, 0, 0);
  P.turrets.push(t); return t;
}
function giantMech(def, P) {
  const m = buildMech(def);
  P.mech = m; P.anim = newAnim(); P.anim.wantAim = 1;
  return m;
}
const BOSSES = [
  { name: "GREEN TALON", kind: "Cruiser", yaw: -0.9, build(P) {
    const g = new T.Group(), hull = MS(0x5f7f4a), dark = MS(0x2f3a28);
    const h = sph(2.4, hull, 0, 0, 0, g, 14); h.scale.set(1.0, 0.8, 3.2);
    box(1.0, 2.0, 1.6, hull, 0, 1.6, -1.8, g); box(1.4, 0.5, 0.8, MB(0xffd23c), 0, 2.4, -1.2, g);
    for (const s of [-1, 1]) { const pod = cyl(0.9, 1.1, 5.5, dark, 3.2 * s, -0.4, -2.5, g, 12); pod.rotation.x = Math.PI / 2; sph(0.7, GLOW(0xff8a3c), 3.2 * s, -0.4, -5.4, g, 10); P.cores.push(g.children[g.children.length - 1]); }
    for (let i = 0; i < 3; i++) turret(g, P, dark, 0, 1.9, 2.5 + i * 1.7 - 1.7);
    return g; } },
  { name: "IRON LOTUS", kind: "Mobile Armor", yaw: 0, build(P) {
    const g = new T.Group(), body = MS(0x4f6b4a), dark = MS(0x24301f), gold = MS(0xc9a227, { metalness: 0.8, roughness: 0.25 });
    const core = sph(2.2, body, 0, 0, 0, g, 14); core.scale.set(1.4, 1.1, 1.0);
    sph(0.5, MB(0xff2d6f), 0, 0.8, 2.0, g, 10);
    box(1.0, 1.0, 0.9, body, 0, 2.3, 0.3, g);
    for (const s of [-1, 1]) {
      const binder = jnt("spin", g, 3.6 * s, 0.6, -0.5); box(1.2, 4.2, 3.0, body, 0, 0, 0, binder); box(1.25, 0.3, 3.05, gold, 0, 1.9, 0, binder);
      P.spinners.push({ o: binder, axis: "z", amp: 0.15 * s, speed: 0.8 });
      const arm = jnt("arm", g, 2.4 * s, -0.8, 1.2); box(0.8, 0.8, 3.0, dark, 0, 0, 1.2, arm);
      for (const d of [-1, 1]) rot(box(0.25, 0.25, 1.4, gold, 0.3 * d, 0, 3.2, arm), 0, -d * 0.4, 0);
      P.arms.push({ o: arm, s });
    }
    return g; } },
  { name: "GIGA DOME", kind: "Mobile Armor", yaw: 0, build(P) {
    const g = new T.Group(), body = MS(0x6a7b4d), dark = MS(0x2b331f);
    const dome = sph(3.0, body, 0, 1.2, 0, g, 18); dome.scale.set(1.3, 1.0, 1.3);
    rot(box(4.2, 0.45, 0.4, MB(0xff2d6f), 0, 1.7, 3.55, g), -0.25, 0, 0);
    tor(3.9, 0.35, dark, 0, 0.2, 0, g).rotation.x = Math.PI / 2;
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const c = sph(0.3, GLOW(0xffd23c, 0.9), Math.cos(a) * 3.9, 0.2, Math.sin(a) * 3.9, g, 8); P.cores.push(c); }
    for (const s of [-1, 1]) { const leg = jnt("arm", g, 1.6 * s, -1.2, 0); box(1.0, 2.6, 1.2, dark, 0, -1.3, 0, leg); box(1.4, 0.5, 2.2, body, 0, -2.6, 0.4, leg); P.arms.push({ o: leg, s, walk: true }); }
    return g; } },
  { name: "NASCENT VECTOR", kind: "Battleship", yaw: -0.8, build(P) {
    const g = new T.Group(), hull = MS(0x3f7a5a), white = MS(0xdfe4ea), dark = MS(0x24382d);
    box(2.6, 1.4, 9.0, hull, 0, 0, 0, g);
    for (const s of [-1, 1]) { rot(box(0.8, 1.0, 5.0, white, 1.4 * s, 0, 5.5, g), 0, s * 0.18, 0); }
    box(1.2, 1.6, 2.0, white, 0, 1.4, -2.0, g); box(1.0, 0.3, 0.4, MB(0x8ff5ff), 0, 1.8, -1.0, g);
    for (const s of [-1, 1]) { box(1.6, 0.4, 3.0, dark, 2.0 * s, -0.4, -3.0, g); sph(0.6, GLOW(0x66ccff), 2.0 * s, -0.4, -4.7, g, 10); }
    turret(g, P, dark, 0, 0.9, 1.5); turret(g, P, dark, 0, 0.9, 3.5);
    return g; } },
  { name: "PSYCHO TITAN", kind: "Giant Mobile Suit", yaw: 0, humanoid: true, build(P) {
    return giantMech({ id: "psy", head: "psycho", pack: "basic", weapon: "magnum", bulk: 1.3, shoulder: "big",
      colors: { main: 0x2c3566, accent: 0x1b2040, trim: 0x9b1e2b, fin: 0xd8a830, visor: 0xff3d5a, dark: 0x14182c } }, P); } },
  { name: "ELM WRAITH", kind: "Mobile Armor", yaw: 0, build(P) {
    const g = new T.Group(), body = MS(0x9fae4a), dark = MS(0x3f4520);
    const disc = sph(3.4, body, 0, 0, 0, g, 16); disc.scale.set(1.3, 0.35, 1.0);
    box(1.6, 0.6, 1.2, dark, 0, 0.9, 0.8, g); box(1.0, 0.25, 0.1, MB(0xff2d6f), 0, 0.95, 1.42, g);
    sph(0.6, GLOW(0x66ff99), 0, -0.3, 3.0, g, 10);
    const orbit = jnt("orbit", g, 0, 0, 0); P.orbit = orbit;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const bit = rot(cone(0.3, 1.0, MS(0x7a8a34), Math.cos(a) * 6, Math.sin(i) * 1.2, Math.sin(a) * 6, orbit, 4), Math.PI / 2, 0, 0); bit.lookAt(0, 0, 0); }
    return g; } },
  { name: "VIOLET DREAD", kind: "Battleship", yaw: 0.85, build(P) {
    const g = new T.Group(), hull = MS(0x6b3f8a), dark = MS(0x2c1a3a), gold = MS(0xc9a227, { metalness: 0.7 });
    box(2.4, 1.6, 12.0, hull, 0, 0, 0, g);
    box(1.8, 1.0, 10.0, dark, 0, -1.2, 0, g);
    rot(cone(1.3, 3.0, hull, 0, 0, 7.4, g, 6), Math.PI / 2, 0, 0);
    box(1.0, 2.4, 1.6, hull, 0, 1.8, -3.5, g); box(1.2, 0.3, 0.5, MB(0xffd23c), 0, 2.7, -2.8, g);
    for (let i = 0; i < 5; i++) turret(g, P, dark, 0, 1.0, 4.5 - i * 2.0, 0.9);
    for (const s of [-1, 1]) { box(0.3, 0.3, 12.0, gold, 1.25 * s, 0.6, 0, g); sph(0.8, GLOW(0xff7a3c), 0.8 * s, -0.4, -6.2, g, 10); }
    return g; } },
  { name: "DESTROYER COLOSSUS", kind: "Giant Mobile Suit", yaw: 0, humanoid: true, build(P) {
    return giantMech({ id: "dst", head: "psycho", pack: "destroy", weapon: "magnum", bulk: 1.35, shoulder: "big",
      colors: { main: 0x2a2b31, accent: 0x15161a, trim: 0x9b1e2b, fin: 0x9b1e2b, visor: 0xff3d5a, dark: 0x101114 } }, P); } },
  { name: "GIGA CRAB", kind: "Mobile Armor", yaw: 0, build(P) {
    const g = new T.Group(), body = MS(0x7a1f2b, { metalness: 0.5 }), dark = MS(0x241018), gold = MS(0xd4a01c, { metalness: 0.8, roughness: 0.25 });
    const hull = sph(2.4, body, 0, 0, 0, g, 16); hull.scale.set(1.6, 0.8, 1.2);
    P.cores.push(sph(0.7, MB(0xff3355), 0, 0, 2.7, g, 14));
    const rng = jnt("spin", g, 0, 0, 0); tor(3.6, 0.22, gold, 0, 0, 0, rng).rotation.x = Math.PI / 2; P.spinners.push({ o: rng, axis: "y", speed: 0.8 });
    for (const s of [-1, 1]) {
      const arm = jnt("arm", g, 3.4 * s, -0.2, 0.5); box(0.8, 0.8, 3.6, dark, 0, 0, 0.8, arm);
      for (const d of [-1, 1]) rot(box(0.25, 0.25, 1.6, gold, 0.3 * d, 0, 3.1, arm), 0, -d * 0.35, 0);
      P.arms.push({ o: arm, s });
    }
    return g; } },
  { name: "BLACK HALO", kind: "Stealth Ship", yaw: -0.7, sizeMul: 1.35, build(P) {
    const g = new T.Group(), hull = MS(0x454a57, { metalness: 0.5, roughness: 0.45 }), red = MS(0xa8222c);
    const h = rot(cone(3.0, 11, hull, 0, 0, 0, g, 4), Math.PI / 2, Math.PI / 4, 0); h.scale.set(1.4, 1, 0.4);
    box(1.2, 1.2, 2.5, hull, 0, 1.0, -2.0, g); box(1.0, 0.2, 0.4, MB(0xff3344), 0, 1.4, -0.8, g);
    for (const s of [-1, 1]) { rot(box(3.5, 0.15, 2.5, hull, 2.5 * s, 0, -3.0, g), 0, 0, -s * 0.2); box(0.4, 0.4, 2.0, red, 3.8 * s, -0.3, -3.0, g); sph(0.6, GLOW(0xff3355), 1.0 * s, 0, -5.6, g, 10); }
    turret(g, P, hull, 0, 0.6, 2.0);
    return g; } },
  { name: "AZURE ARMS", kind: "Mobile Armor", yaw: 0, build(P) {
    const g = new T.Group(), body = MS(0x2b4fa8), dark = MS(0x15203f), gold = MS(0xd4a01c, { metalness: 0.7 });
    box(3.0, 4.0, 2.4, body, 0, 0, 0, g);
    box(2.0, 1.4, 1.6, body, 0, 2.6, 0.2, g); box(1.6, 0.25, 0.1, MB(0xff2d6f), 0, 2.7, 1.02, g);
    rot(box(0.2, 1.8, 0.2, gold, 0, 3.6, 0, g), 0.3, 0, 0);
    rot(cone(2.0, 2.6, dark, 0, -3.0, 0, g, 8), Math.PI, 0, 0);
    for (const s of [-1, 1]) {
      const arm = jnt("arm", g, 2.0 * s, 1.2, 0.5);
      for (let i = 0; i < 5; i++) box(0.6, 0.6, 1.1, i % 2 ? dark : body, 0, 0, 0.6 + i * 1.0, arm);
      for (const d of [-1, 1]) rot(box(0.2, 0.2, 1.3, gold, 0.25 * d, 0, 5.8, arm), 0, -d * 0.4, 0);
      P.arms.push({ o: arm, s, long: true });
    }
    return g; } },
  { name: "GN LOTUS", kind: "Mobile Armor", yaw: 0, build(P) {
    const g = new T.Group(), body = MS(0x8a2a3a), petal = MS(0xd7d2c4), dark = MS(0x2a1a20);
    sph(1.8, body, 0, 0, 0, g, 14);
    P.cores.push(sph(0.8, GLOW(0xff3c5a, 0.95), 0, 0, 1.6, g, 12));
    const orbit = jnt("orbit", g, 0, 0, 0); P.orbit = orbit; P.orbitAxis = "z";
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const p = jnt("pt", orbit, 0, 0, 0); p.rotation.z = a; rot(box(0.9, 3.4, 0.2, petal, 0, 3.0, 0.4, p), 0.4, 0, 0); box(0.3, 0.6, 0.25, dark, 0, 4.6, 0.9, p); }
    return g; } },
  { name: "QUEEN MANTIS", kind: "Giant Mobile Suit", yaw: 0, humanoid: true, build(P) {
    return giantMech({ id: "qm", head: "psycho", pack: "mantis", weapon: "magnum", bulk: 1.3, shoulder: "big",
      colors: { main: 0xe6e2ea, accent: 0x6b3f8a, trim: 0xd8a830, fin: 0xd8a830, visor: 0x7dffb0, dark: 0x3a2c4a } }, P); } },
  { name: "ZANZI CARRIER", kind: "Carrier", yaw: 0.7, build(P) {
    const g = new T.Group(), hull = MS(0x4f6b3f), red = MS(0x9b2a2a), dark = MS(0x26301e);
    const body = sph(3.0, hull, 0, 0, 0, g, 16); body.scale.set(1.0, 0.55, 2.8);
    for (const s of [-1, 1]) { rot(box(5.5, 0.3, 3.2, hull, 3.5 * s, -0.3, -2.0, g), 0, s * 0.25, -s * 0.08); box(0.4, 1.8, 1.4, red, 5.6 * s, 0.4, -3.0, g); }
    box(1.4, 1.6, 2.0, red, 0, 1.6, -1.5, g); box(1.2, 0.3, 0.4, MB(0xffd23c), 0, 2.2, -0.5, g);
    for (const s of [-1, 1]) sph(0.8, GLOW(0xff9a3c), 1.2 * s, 0, -8.2, g, 10);
    turret(g, P, dark, 0, 1.6, 3.0); turret(g, P, dark, 0, 1.4, 5.0);
    return g; } },
  { name: "APEX SAUCER", kind: "Mobile Armor", yaw: 0, build(P) {
    const g = new T.Group(), body = MS(0x5a7a4a), dark = MS(0x2a3522), pink = MB(0xff2d6f);
    const head = sph(3.4, body, 0, 0, 0, g, 18); head.scale.set(1.3, 0.75, 1.1);
    box(4.0, 0.4, 0.4, MB(0x111111), 0, 0.6, 3.5, g); sph(0.45, pink, 1.0, 0.6, 3.7, g, 10);
    P.cores.push(sph(1.0, GLOW(0xfff2a8, 0.9), 0, -0.5, 3.4, g, 14));
    for (const s of [-1, 1]) { const ant = jnt("spin", g, 2.6 * s, 1.6, -1.2); rot(box(0.25, 3.2, 0.25, dark, 0, 1.4, 0, ant), 0, 0, -s * 0.6); P.spinners.push({ o: ant, axis: "z", amp: 0.12 * s, speed: 1.2 }); }
    for (let i = 0; i < 3; i++) { const leg = jnt("arm", g, (i - 1) * 2.4, -2.0, -0.5); box(0.6, 2.4, 0.6, dark, 0, -1.0, 0, leg); P.arms.push({ o: leg, s: i - 1 || 1, walk: true }); }
    return g; } },
];
const BOSS_SIZE = 18;
function buildBoss(idx) {
  const def = BOSSES[idx % BOSSES.length];
  const P = bossParts();
  const inner = def.build(P);
  const holder = new T.Group();
  holder.add(inner);
  inner.rotation.y = def.yaw || 0;
  const bb = new T.Box3().setFromObject(holder), size = new T.Vector3(); bb.getSize(size);
  const sc = BOSS_SIZE * (def.sizeMul || 1) / Math.max(size.x, size.y, size.z * 0.7);
  inner.scale.setScalar(sc * inner.scale.x);
  const bb2 = new T.Box3().setFromObject(holder);
  const center = new T.Vector3(); bb2.getCenter(center);
  inner.position.sub(center);
  holder.userData.top = bb2.max.y - center.y + (def.humanoid ? 3.0 : 1.0);
  holder.userData.front = bb2.max.z - center.z;
  holder.userData.P = P; holder.userData.inner = inner; holder.userData.def = def;
  return holder;
}
function animateBoss(holder, dt, time, attack, target) {
  const P = holder.userData.P, def = holder.userData.def, inner = holder.userData.inner;
  inner.rotation.y = (def.yaw || 0) + Math.sin(time * 0.4) * 0.15;
  inner.rotation.z = Math.sin(time * 0.6) * 0.04;
  for (const t of P.turrets) t.rotation.y = Math.sin(time * 0.8 + t.position.z) * 0.6;
  for (const sp of P.spinners) {
    if (sp.amp) sp.o.rotation[sp.axis] = Math.sin(time * sp.speed) * sp.amp + attack * sp.amp;
    else sp.o.rotation[sp.axis] += dt * sp.speed;
  }
  for (const a of P.arms) {
    if (a.walk) a.o.rotation.x = Math.sin(time * 1.5 + a.s) * 0.3;
    else { a.o.rotation.y = Math.sin(time * 0.9 + a.s) * 0.3 * a.s - attack * 0.4 * a.s; a.o.rotation.x = Math.sin(time * 1.2 + a.s) * (a.long ? 0.35 : 0.2); }
  }
  for (const c of P.cores) c.scale.setScalar(1 + Math.sin(time * 6) * 0.12 + attack * 0.6);
  if (P.orbit) P.orbit.rotation[P.orbitAxis || "y"] += dt * 0.6;
  if (P.mech) {
    if (target) aimMech(P.mech, P.anim, target);
    if (attack > 0.9 && P.anim.recoil < 0.2) fireMech(P.anim, true);
    animateMech(P.mech, P.anim, dt);
  }
}

window.MODELS = { MECHS, buildMech, newAnim, aimMech, fireMech, animateMech, ENEMY_TYPES, ENEMY_SIZES, buildEnemy, animateEnemy, BOSSES, buildBoss, animateBoss, MS, MB, GLOW };
})();
