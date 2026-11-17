// Mech parça kataloğu: her parça kendi geometrisini kurar, istatistik ve yeteneklerini tanımlar.
import * as THREE from 'three';
import { tmesh } from './toon.js';

export const PALETTE = [
  '#ffb5c2', '#ffcfd8', '#ffd6a5', '#fdffb6', '#caffbf', '#b5ead7',
  '#9bf6ff', '#a0c4ff', '#bdb2ff', '#e0bbe4', '#ffc6ff', '#fffaf3',
  '#d6d0dc', '#8e7f99',
];

export const SLOTS = ['legs', 'torso', 'head', 'armL', 'armR', 'back'];
export const SLOT_NAMES = {
  legs: 'Bacaklar', torso: 'Gövde', head: 'Kafa', armL: 'Sol Kol', armR: 'Sağ Kol', back: 'Sırt',
};
export const ANCHORS = {
  legs: [0, 0, 0], torso: [0, 1.75, 0], head: [0, 2.3, 0],
  armL: [0.95, 2.05, 0], armR: [-0.95, 2.05, 0], back: [0, 1.85, -0.5],
};

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const S = (r, s = 20) => new THREE.SphereGeometry(r, s, Math.round(s * 0.7));
const C = (rt, rb, h, s = 18) => new THREE.CylinderGeometry(rt, rb, h, s);
const Cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
const T = (r, t) => new THREE.TorusGeometry(r, t, 10, 24);

function put(parent, mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

// ---------- BACAKLAR ----------
function walkerLegs(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(0.95, 0.28, 0.55), c[1]), 0, 1.15, 0);
  for (const s of [1, -1]) {
    const leg = new THREE.Group();
    leg.name = s > 0 ? 'legL' : 'legR';
    leg.position.set(0.33 * s, 1.1, 0);
    put(leg, tmesh(B(0.34, 0.55, 0.4), c[0]), 0, -0.3, 0);
    put(leg, tmesh(S(0.17, 14), c[1]), 0, -0.6, 0.02);
    put(leg, tmesh(B(0.4, 0.5, 0.46), c[0]), 0, -0.82, 0);
    put(leg, tmesh(B(0.5, 0.18, 0.78), c[1]), 0, -1.01, 0.1);
    g.add(leg);
  }
  return g;
}
function tankLegs(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(1.05, 0.5, 0.95), c[0]), 0, 0.9, 0);
  for (const s of [1, -1]) {
    const tr = new THREE.Group();
    tr.name = s > 0 ? 'trackL' : 'trackR';
    tr.position.set(0.5 * s, 0.32, 0);
    put(tr, tmesh(Cap(0.3, 1.1), c[1]), 0, 0, 0, Math.PI / 2, 0, 0);
    for (const z of [-0.5, 0, 0.5]) put(tr, tmesh(C(0.2, 0.2, 0.62, 14), c[0], { thick: 0.02 }), 0, 0, z, 0, 0, Math.PI / 2);
    g.add(tr);
  }
  return g;
}
function springLegs(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(0.9, 0.26, 0.5), c[0]), 0, 1.15, 0);
  for (const s of [1, -1]) {
    const leg = new THREE.Group();
    leg.name = s > 0 ? 'springL' : 'springR';
    leg.position.set(0.32 * s, 1.05, 0);
    for (let i = 0; i < 4; i++) put(leg, tmesh(T(0.16, 0.05), c[1], { thick: 0.02 }), 0, -0.15 - i * 0.2, 0, Math.PI / 2, 0, 0);
    put(leg, tmesh(C(0.32, 0.36, 0.16), c[0]), 0, -0.98, 0.05);
    g.add(leg);
  }
  return g;
}

// ---------- GÖVDE ----------
function boxTorso(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(1.3, 1.0, 0.9), c[0]), 0, 0, 0);
  put(g, tmesh(B(0.8, 0.45, 0.12), c[1]), 0, 0.12, 0.48);
  put(g, tmesh(S(0.12, 12), c[2] || c[1], { thick: 0.02 }), 0, 0.12, 0.56);
  put(g, tmesh(B(0.9, 0.18, 0.7), c[1]), 0, -0.55, 0);
  return g;
}
function roundTorso(c) {
  const g = new THREE.Group();
  const body = tmesh(S(0.66, 24), c[0]);
  body.scale.set(1, 0.85, 0.85);
  put(g, body, 0, 0, 0);
  put(g, tmesh(T(0.58, 0.08), c[1]), 0, -0.12, 0, Math.PI / 2, 0, 0);
  put(g, tmesh(C(0.2, 0.2, 0.1, 16), c[2] || c[1], { thick: 0.02 }), 0, 0.15, 0.55, Math.PI / 2, 0, 0);
  return g;
}
function heavyTorso(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(1.45, 1.1, 1.0), c[0]), 0, 0, 0);
  for (const s of [1, -1]) put(g, tmesh(B(0.55, 0.32, 0.9), c[1]), 0.72 * s, 0.48, 0, 0, 0, -0.18 * s);
  put(g, tmesh(B(1.0, 0.3, 0.14), c[1]), 0, 0.2, 0.53);
  put(g, tmesh(B(0.6, 0.12, 0.08), c[2] || c[0], { thick: 0.015 }), 0, -0.15, 0.56);
  return g;
}

// ---------- KAFA ----------
function bunnyHead(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(0.62, 0.5, 0.58), c[0]), 0, 0.3, 0);
  put(g, tmesh(B(0.5, 0.16, 0.06), 0x5b4b66, { paint: false, thick: 0.015 }), 0, 0.34, 0.31);
  for (const s of [1, -1]) put(g, tmesh(Cap(0.08, 0.4), c[1]), 0.17 * s, 0.8, -0.05, 0, 0, -0.15 * s);
  put(g, tmesh(C(0.18, 0.22, 0.12), c[1]), 0, 0.02, 0);
  return g;
}
function cyclopsHead(c) {
  const g = new THREE.Group();
  put(g, tmesh(S(0.36, 22), c[0]), 0, 0.36, 0);
  put(g, tmesh(C(0.15, 0.17, 0.16, 18), 0xfffbd6, { paint: false, emissive: 0x9bf6ff, thick: 0.02 }), 0, 0.38, 0.3, Math.PI / 2, 0, 0);
  put(g, tmesh(C(0.025, 0.025, 0.4, 6), c[1], { thick: 0.01 }), 0.15, 0.85, 0);
  put(g, tmesh(S(0.07, 10), c[1], { thick: 0.015 }), 0.15, 1.06, 0);
  put(g, tmesh(C(0.2, 0.24, 0.1), c[1]), 0, 0.02, 0);
  return g;
}
function helmetHead(c) {
  const g = new THREE.Group();
  put(g, tmesh(C(0.34, 0.36, 0.42, 22), c[0]), 0, 0.28, 0);
  put(g, tmesh(new THREE.SphereGeometry(0.34, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), c[0]), 0, 0.49, 0);
  put(g, tmesh(B(0.5, 0.12, 0.2), 0x5b4b66, { paint: false, thick: 0.015 }), 0, 0.35, 0.27);
  put(g, tmesh(B(0.08, 0.3, 0.6), c[1], { thick: 0.015 }), 0, 0.78, -0.02);
  return g;
}

// ---------- KOLLAR ----------
function armBase(c, s) {
  const arm = new THREE.Group();
  arm.name = 'arm';
  put(arm, tmesh(S(0.28, 16), c[1]), 0.08 * s, 0, 0);
  put(arm, tmesh(B(0.3, 0.55, 0.3), c[0]), 0.12 * s, -0.35, 0);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  arm.add(muzzle);
  return arm;
}
function blasterArm(c, s) {
  const arm = armBase(c, s);
  put(arm, tmesh(B(0.36, 0.36, 0.9), c[0]), 0.12 * s, -0.62, 0.28);
  put(arm, tmesh(C(0.09, 0.11, 0.55, 12), c[1], { thick: 0.02 }), 0.12 * s, -0.62, 0.95, Math.PI / 2, 0, 0);
  put(arm, tmesh(T(0.12, 0.035), c[2] || c[1], { thick: 0.015 }), 0.12 * s, -0.62, 1.2);
  arm.getObjectByName('muzzle').position.set(0.12 * s, -0.62, 1.3);
  return arm;
}
function bubbleArm(c, s) {
  const arm = armBase(c, s);
  put(arm, tmesh(B(0.36, 0.36, 0.5), c[0]), 0.12 * s, -0.62, 0.1);
  put(arm, tmesh(S(0.34, 20), c[1]), 0.12 * s, -0.62, 0.55);
  put(arm, tmesh(C(0.2, 0.26, 0.35, 18), c[0]), 0.12 * s, -0.62, 0.9, Math.PI / 2, 0, 0);
  arm.getObjectByName('muzzle').position.set(0.12 * s, -0.62, 1.15);
  return arm;
}
function shieldArm(c, s) {
  const arm = armBase(c, s);
  put(arm, tmesh(B(0.32, 0.32, 0.75), c[0]), 0.12 * s, -0.62, 0.22);
  put(arm, tmesh(B(0.12, 1.1, 0.9), c[1]), 0.36 * s, -0.55, 0.3);
  put(arm, tmesh(S(0.12, 10), c[2] || c[0], { thick: 0.015 }), 0.44 * s, -0.55, 0.3);
  put(arm, tmesh(C(0.06, 0.07, 0.3, 10), c[1], { thick: 0.015 }), 0.12 * s, -0.62, 0.72, Math.PI / 2, 0, 0);
  arm.getObjectByName('muzzle').position.set(0.12 * s, -0.62, 0.9);
  return arm;
}

// ---------- SIRT ----------
function jetBack(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(0.9, 0.7, 0.3), c[0]), 0, 0, -0.05);
  for (const s of [1, -1]) {
    put(g, tmesh(C(0.17, 0.17, 0.8, 16), c[1]), 0.3 * s, -0.05, -0.32);
    put(g, tmesh(C(0.12, 0.2, 0.2, 16), c[0], { thick: 0.02 }), 0.3 * s, -0.53, -0.32);
  }
  const flame = new THREE.Group();
  flame.name = 'flame';
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 12), new THREE.MeshBasicMaterial({ color: 0xffd6a5, transparent: true, opacity: 0.85 }));
    f.position.set(0.3 * s, -0.9, -0.32);
    f.rotation.x = Math.PI;
    flame.add(f);
  }
  flame.visible = false;
  g.add(flame);
  return g;
}
function antennaBack(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(0.7, 0.6, 0.3), c[0]), 0, 0, -0.05);
  put(g, tmesh(C(0.04, 0.04, 1.3, 8), c[1], { thick: 0.012 }), 0.22, 0.8, -0.1);
  put(g, tmesh(S(0.11, 12), c[2] || c[1], { thick: 0.015, emissive: 0x553344 }), 0.22, 1.48, -0.1);
  put(g, tmesh(new THREE.ConeGeometry(0.28, 0.2, 18, 1, true), c[1], { thick: 0.015 }), -0.2, 0.45, -0.15, -0.5, 0, 0);
  return g;
}
function wingBack(c) {
  const g = new THREE.Group();
  put(g, tmesh(B(0.6, 0.6, 0.28), c[0]), 0, 0, -0.05);
  for (const s of [1, -1]) {
    put(g, tmesh(B(1.3, 0.1, 0.55), c[1]), 0.85 * s, 0.25, -0.2, 0, 0.25 * s, 0.35 * s);
    put(g, tmesh(B(0.9, 0.08, 0.4), c[0]), 0.7 * s, -0.08, -0.22, 0, 0.2 * s, 0.15 * s);
  }
  return g;
}

export const PARTS = {
  walker:  { slot: 'legs',  name: 'Yürüyen Bacak', desc: 'Dengeli ve çevik.', colors: ['#a0c4ff', '#fffaf3'], build: walkerLegs, mods: { speed: 1 } },
  tank:    { slot: 'legs',  name: 'Pamuk Palet', desc: 'Sağlam ama yavaş.', colors: ['#b5ead7', '#8e7f99'], build: tankLegs, mods: { hp: 40, speed: -1.5, jump: -3 } },
  spring:  { slot: 'legs',  name: 'Zıp Zıp Yay', desc: 'Çok yükseğe zıplar.', colors: ['#ffc6ff', '#fdffb6'], build: springLegs, mods: { jump: 6, speed: 0.5 } },

  boxT:    { slot: 'torso', name: 'Kutu Gövde', desc: 'Klasik ve dayanıklı.', colors: ['#ffb5c2', '#fffaf3', '#9bf6ff'], build: boxTorso, mods: { hp: 40 } },
  roundT:  { slot: 'torso', name: 'Mochi Gövde', desc: 'Hafif ve hızlı.', colors: ['#fdffb6', '#ffd6a5', '#ffb5c2'], build: roundTorso, mods: { hp: 20, speed: 1 } },
  heavyT:  { slot: 'torso', name: 'Kale Gövde', desc: 'Çok can, az hız.', colors: ['#bdb2ff', '#fffaf3', '#ffd6a5'], build: heavyTorso, mods: { hp: 80, speed: -1.5 } },

  bunny:   { slot: 'head',  name: 'Tavşan Kafa', desc: 'Kulaklar zıplamayı artırır.', colors: ['#fffaf3', '#ffcfd8'], build: bunnyHead, mods: { jump: 2 } },
  cyclops: { slot: 'head',  name: 'Tek Göz', desc: 'Hasar +%15.', colors: ['#e0bbe4', '#a0c4ff'], build: cyclopsHead, mods: { dmg: 0.15 } },
  helmet:  { slot: 'head',  name: 'Şövalye Kask', desc: 'Ek zırh.', colors: ['#caffbf', '#ffb5c2'], build: helmetHead, mods: { hp: 25 } },

  blaster: { slot: 'arm',   name: 'Şeker Blaster', desc: 'Hızlı, küçük atışlar.', colors: ['#fffaf3', '#a0c4ff', '#ffb5c2'], build: blasterArm, weapon: { dmg: 8, cd: 0.17, speed: 70, size: 0.14, color: '#9bf6ff' } },
  bubble:  { slot: 'arm',   name: 'Baloncuk Topu', desc: 'Yavaş, iri ve acıtır.', colors: ['#ffd6a5', '#ffc6ff'], build: bubbleArm, weapon: { dmg: 26, cd: 0.85, speed: 38, size: 0.38, color: '#ffc6ff' } },
  shield:  { slot: 'arm',   name: 'Kalkan Kol', desc: 'Can +35, zayıf silah.', colors: ['#caffbf', '#fffaf3', '#fdffb6'], build: shieldArm, weapon: { dmg: 5, cd: 0.28, speed: 60, size: 0.12, color: '#caffbf' }, mods: { hp: 35 } },

  jet:     { slot: 'back',  name: 'Jet Çanta', desc: 'Boşluk basılı: uç!', colors: ['#fffaf3', '#ffb5c2'], build: jetBack, ability: 'fly' },
  antenna: { slot: 'back',  name: 'Tamir Anteni', desc: 'Canı yavaşça yeniler.', colors: ['#a0c4ff', '#fdffb6', '#ffb5c2'], build: antennaBack, ability: 'regen' },
  wings:   { slot: 'back',  name: 'Bulut Kanat', desc: 'Süzülür, biraz hızlı.', colors: ['#fffaf3', '#9bf6ff'], build: wingBack, ability: 'glide', mods: { speed: 1 } },
};

export function partsForSlot(slot) {
  const key = slot === 'armL' || slot === 'armR' ? 'arm' : slot;
  return Object.entries(PARTS).filter(([, p]) => p.slot === key).map(([id]) => id);
}

export const DEFAULT_KIT = { legs: 'walker', torso: 'boxT', head: 'bunny', armL: 'blaster', armR: 'bubble', back: 'jet' };

/** Tek bir parçayı oluşturur (kendi anchor'ı olmadan). */
export function buildPart(slot, id, colors) {
  const p = PARTS[id];
  const side = slot === 'armR' ? -1 : 1;
  const g = p.build(p.colors, side);
  g.userData.slot = slot;
  g.userData.partId = id;
  let i = 0;
  g.traverse((o) => {
    if (o.isMesh && o.userData.paintable) {
      o.userData.slot = slot;
      o.userData.idx = i;
      if (colors && colors[i]) o.material.color.set(colors[i]);
      i++;
    }
  });
  return g;
}

export function paintableMeshes(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh && o.userData.paintable) out.push(o); });
  return out;
}

export function readColors(partGroup) {
  return paintableMeshes(partGroup).map((m) => '#' + m.material.color.getHexString());
}

export function computeStats(kit) {
  const st = { hp: 100, speed: 9, jump: 9, dmg: 1, ability: null, weapons: {} };
  for (const slot of SLOTS) {
    const p = PARTS[kit[slot]];
    if (!p) continue;
    const m = p.mods || {};
    st.hp += m.hp || 0;
    st.speed += m.speed || 0;
    st.jump += m.jump || 0;
    st.dmg += m.dmg || 0;
    if (p.ability) st.ability = p.ability;
    if (p.weapon) st.weapons[slot] = p.weapon;
  }
  return st;
}

/** Bir mech tanımını ({kit, colors, name}) doğrular; geçersizse varsayılan döner. */
export function sanitizeDef(def) {
  const out = { name: 'Mech', kit: { ...DEFAULT_KIT }, colors: {} };
  if (!def || typeof def !== 'object') return out;
  if (typeof def.name === 'string') out.name = def.name.slice(0, 18);
  for (const slot of SLOTS) {
    const id = def.kit && def.kit[slot];
    if (typeof id === 'string' && partsForSlot(slot).includes(id)) out.kit[slot] = id;
    const cols = def.colors && def.colors[slot];
    if (Array.isArray(cols)) out.colors[slot] = cols.slice(0, 20).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  }
  return out;
}

/** Tam mech: parçaları anchor noktalarına yerleştirir. */
export function buildMech(def) {
  const d = sanitizeDef(def);
  const root = new THREE.Group();
  const parts = {};
  for (const slot of SLOTS) {
    const g = buildPart(slot, d.kit[slot], d.colors[slot]);
    g.position.fromArray(ANCHORS[slot]);
    root.add(g);
    parts[slot] = g;
  }
  root.userData.parts = parts;
  root.userData.def = d;
  return { root, parts, stats: computeStats(d.kit), def: d };
}

export function randomDef(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const kit = {};
  const colors = {};
  for (const slot of SLOTS) {
    kit[slot] = pick(partsForSlot(slot));
    const n = paintableMeshes(buildPart(slot, kit[slot])).length;
    const a = pick(PALETTE.slice(0, 12));
    const b = pick(PALETTE.slice(0, 12));
    colors[slot] = Array.from({ length: n }, (_, i) => (i % 2 ? b : a));
  }
  return { name: 'Bot', kit, colors };
}
