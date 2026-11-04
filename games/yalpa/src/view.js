import * as THREE from 'three';
import { PARTS } from './ragdoll.js';

// ---------------- Kozmetikler (20 adet) ----------------
// slot: head = şapka, face = yüz, back = sırt/gövde
export const COSMETICS = [
  { id: 'cap', slot: 'head', icon: '🧢', name: 'Kep' },
  { id: 'beanie', slot: 'head', icon: '🧶', name: 'Bere' },
  { id: 'crown', slot: 'head', icon: '👑', name: 'Taç' },
  { id: 'party', slot: 'head', icon: '🥳', name: 'Parti' },
  { id: 'tophat', slot: 'head', icon: '🎩', name: 'Silindir' },
  { id: 'chef', slot: 'head', icon: '👨‍🍳', name: 'Aşçı' },
  { id: 'horns', slot: 'head', icon: '😈', name: 'Boynuz' },
  { id: 'cowboy', slot: 'head', icon: '🤠', name: 'Kovboy' },
  { id: 'hardhat', slot: 'head', icon: '👷', name: 'Baret' },
  { id: 'viking', slot: 'head', icon: '🛡️', name: 'Viking' },
  { id: 'bunny', slot: 'head', icon: '🐰', name: 'Tavşan' },
  { id: 'halo', slot: 'head', icon: '😇', name: 'Hale' },
  { id: 'sunglasses', slot: 'face', icon: '😎', name: 'Güneş gözlüğü' },
  { id: 'nerd', slot: 'face', icon: '🤓', name: 'Gözlük' },
  { id: 'mustache', slot: 'face', icon: '🥸', name: 'Bıyık' },
  { id: 'clown', slot: 'face', icon: '🤡', name: 'Palyaço burnu' },
  { id: 'cape', slot: 'back', icon: '🦸', name: 'Pelerin' },
  { id: 'backpack', slot: 'back', icon: '🎒', name: 'Sırt çantası' },
  { id: 'wings', slot: 'back', icon: '🪽', name: 'Kanatlar' },
  { id: 'tie', slot: 'back', icon: '👔', name: 'Kravat' },
];
export const SLOTS = [
  { id: 'head', name: 'Şapka' },
  { id: 'face', name: 'Yüz' },
  { id: 'back', name: 'Sırt' },
];
export const DEFAULT_LOOK = { head: 'none', face: 'none', back: 'none' };

export function sanitizeLook(l) {
  const out = { ...DEFAULT_LOOK };
  if (l && typeof l === 'object') {
    for (const s of SLOTS) {
      if (COSMETICS.some((c) => c.slot === s.id && c.id === l[s.id])) out[s.id] = l[s.id];
    }
  }
  return out;
}

// HFF tarzı: pürüzsüz, yumuşak, hafif mat
const soft = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...extra });

const G = {
  sphere: new THREE.SphereGeometry(1, 28, 20),
  sphereLo: new THREE.SphereGeometry(1, 16, 12),
};

const BOB = 0xf5f2ec; // Bob beyazı
const EYE = soft(0x1c1c22, { roughness: 0.3 });

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 16), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function blob(mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(G.sphere, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---- Kozmetik modelleri (kafa merkezine / göğüs merkezine göre) ----
function buildCosmetic(id, tint) {
  const g = new THREE.Group();
  const c = new THREE.Color(tint);
  const accent = soft(c.clone().offsetHSL(0.45, 0.1, 0));
  const dark = soft(0x2a2a31);
  const white = soft(0xffffff);
  const gold = soft(0xffc935, { metalness: 0.6, roughness: 0.3, emissive: 0x3a2a00 });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const dome = (r, mat, y) => add(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, y, 0);

  switch (id) {
    // --- Şapkalar ---
    case 'cap':
      dome(0.27, accent, 0.08);
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), accent, 0, 0.09, 0.15);
      add(new THREE.SphereGeometry(0.03, 8, 6), accent, 0, 0.35, 0);
      break;
    case 'beanie':
      dome(0.275, accent, 0.06);
      add(new THREE.TorusGeometry(0.265, 0.045, 10, 28), white, 0, 0.07, 0, Math.PI / 2);
      add(new THREE.SphereGeometry(0.075, 12, 10), white, 0, 0.35, 0);
      break;
    case 'crown':
      add(new THREE.CylinderGeometry(0.17, 0.16, 0.11, 20, 1, true), gold, 0, 0.29, 0).material.side = THREE.DoubleSide;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.04, 0.11, 8), gold, Math.sin(a) * 0.16, 0.39, Math.cos(a) * 0.16);
        add(new THREE.SphereGeometry(0.018, 8, 6), gold, Math.sin(a) * 0.16, 0.45, Math.cos(a) * 0.16);
      }
      add(new THREE.SphereGeometry(0.03, 10, 8), soft(0xe03c5a, { roughness: 0.2 }), 0, 0.29, 0.17);
      break;
    case 'party': {
      const cone = add(new THREE.ConeGeometry(0.15, 0.42, 20), accent, 0, 0.45, 0);
      cone.rotation.z = 0.15;
      add(new THREE.SphereGeometry(0.055, 12, 10), soft(0xffe066), -0.03, 0.67, 0);
      add(new THREE.TorusGeometry(0.15, 0.02, 6, 20), soft(0xffe066), 0, 0.26, 0, Math.PI / 2);
      break;
    }
    case 'tophat':
      add(new THREE.CylinderGeometry(0.32, 0.32, 0.025, 28), dark, 0, 0.22, 0);
      add(new THREE.CylinderGeometry(0.18, 0.17, 0.34, 28), dark, 0, 0.39, 0);
      add(new THREE.CylinderGeometry(0.172, 0.172, 0.06, 28), accent, 0, 0.26, 0);
      break;
    case 'chef':
      add(new THREE.CylinderGeometry(0.2, 0.21, 0.18, 24), white, 0, 0.3, 0);
      for (const [x, z] of [[0, 0], [0.1, 0.06], [-0.1, 0.06], [0.06, -0.1], [-0.06, -0.1]]) {
        add(new THREE.SphereGeometry(0.15, 16, 12), white, x, 0.48, z);
      }
      break;
    case 'horns': {
      const red = soft(0xd8343a, { roughness: 0.4 });
      for (const sx of [-1, 1]) {
        const h = add(new THREE.ConeGeometry(0.055, 0.2, 12), red, sx * 0.15, 0.27, 0.02);
        h.rotation.z = -sx * 0.45;
      }
      break;
    }
    case 'cowboy': {
      const brown = soft(0x9b6a3e);
      const brim = add(new THREE.CylinderGeometry(0.42, 0.42, 0.025, 28), brown, 0, 0.2, 0);
      brim.scale.set(1, 1, 0.85);
      add(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 24), brown, 0, 0.32, 0);
      add(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 24), dark, 0, 0.24, 0);
      break;
    }
    case 'hardhat': {
      const yel = soft(0xffc61a, { roughness: 0.35 });
      dome(0.29, yel, 0.07);
      add(new THREE.CylinderGeometry(0.33, 0.33, 0.025, 28, 1, false, -Math.PI / 2, Math.PI), yel, 0, 0.08, 0.04);
      add(new THREE.BoxGeometry(0.06, 0.04, 0.5), yel, 0, 0.34, 0);
      break;
    }
    case 'viking': {
      const metal = soft(0xa8adb5, { metalness: 0.7, roughness: 0.35 });
      dome(0.28, metal, 0.07);
      add(new THREE.BoxGeometry(0.04, 0.24, 0.04), metal, 0, 0.0, 0.27);
      const horn = soft(0xf2e6c9);
      for (const sx of [-1, 1]) {
        const h = add(new THREE.ConeGeometry(0.06, 0.26, 12), horn, sx * 0.3, 0.27, 0);
        h.rotation.z = -sx * 1.0;
      }
      break;
    }
    case 'bunny': {
      const pink = soft(0xffb3c6);
      for (const sx of [-1, 1]) {
        const e = add(new THREE.SphereGeometry(1, 16, 12), white, sx * 0.1, 0.42, -0.02, 0, 0, sx * -0.15);
        e.scale.set(0.06, 0.2, 0.035);
        const i = add(new THREE.SphereGeometry(1, 12, 10), pink, sx * 0.1, 0.42, 0.01, 0, 0, sx * -0.15);
        i.scale.set(0.035, 0.15, 0.02);
      }
      break;
    }
    case 'halo':
      add(new THREE.TorusGeometry(0.2, 0.03, 10, 32), soft(0xfff1a0, { emissive: 0xffd84a, emissiveIntensity: 0.9 }), 0, 0.46, 0, Math.PI / 2);
      break;

    // --- Yüz ---
    case 'sunglasses': {
      const glass = soft(0x101015, { roughness: 0.1, metalness: 0.5 });
      for (const sx of [-1, 1]) {
        const l = add(new THREE.SphereGeometry(1, 16, 12), glass, sx * 0.085, 0.04, 0.245);
        l.scale.set(0.075, 0.055, 0.02);
      }
      add(new THREE.BoxGeometry(0.06, 0.015, 0.015), glass, 0, 0.06, 0.255);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.015, 0.015, 0.2), glass, sx * 0.17, 0.05, 0.15, 0, sx * 0.25, 0);
      break;
    }
    case 'nerd':
      for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.06, 0.012, 8, 20), dark, sx * 0.085, 0.04, 0.25);
      add(new THREE.BoxGeometry(0.05, 0.012, 0.012), dark, 0, 0.05, 0.255);
      break;
    case 'mustache':
      for (const sx of [-1, 1]) {
        const m = add(new THREE.SphereGeometry(1, 14, 10), soft(0x3b2a1e), sx * 0.055, -0.06, 0.245, 0, 0, sx * 0.35);
        m.scale.set(0.065, 0.025, 0.025);
      }
      break;
    case 'clown':
      add(new THREE.SphereGeometry(0.05, 16, 12), soft(0xff2e3a, { roughness: 0.25 }), 0, -0.02, 0.265);
      break;

    // --- Sırt / gövde (göğüs merkezine göre) ---
    case 'cape': {
      const capeCol = c.getHSL({}).s < 0.15 ? new THREE.Color(0xe03131) : c.clone().offsetHSL(0.5, 0.2, -0.05);
      const red = soft(capeCol, { side: THREE.DoubleSide });
      // silindir diliminin ortası θ=π, yani -z (sırt) tarafı
      const geo = new THREE.CylinderGeometry(0.25, 0.36, 0.8, 20, 4, true, Math.PI * 0.62, Math.PI * 0.76);
      add(geo, red, 0, -0.16, -0.02);
      for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.035, 10, 8), soft(0xffd43b, { metalness: 0.5, roughness: 0.3 }), sx * 0.17, 0.22, 0.12);
      break;
    }
    case 'backpack': {
      const bag = blob(accent, 0.2, 0.24, 0.1, 0, -0.02, -0.25);
      g.add(bag);
      g.add(blob(soft(c.clone().offsetHSL(0.45, 0.1, -0.15)), 0.14, 0.08, 0.06, 0, -0.14, -0.32));
      for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.17, 0.018, 6, 16, Math.PI), dark, sx * 0.13, 0.05, -0.02, 0, Math.PI / 2, 0);
      break;
    }
    case 'wings': {
      const feather = soft(0xffffff, { side: THREE.DoubleSide });
      for (const sx of [-1, 1]) {
        const w = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const f = blob(feather, 0.07, 0.24 - i * 0.04, 0.02, sx * (0.06 + i * 0.07), 0.05 - i * 0.05, 0);
          f.rotation.z = sx * (0.9 + i * 0.15);
          w.add(f);
        }
        w.position.set(sx * 0.08, 0.08, -0.22);
        w.rotation.y = sx * -0.35;
        g.add(w);
      }
      break;
    }
    case 'tie': {
      const tieMat = soft(c.clone().offsetHSL(0.5, 0.2, -0.1));
      add(new THREE.SphereGeometry(0.035, 10, 8), tieMat, 0, 0.24, 0.2);
      const t = add(new THREE.ConeGeometry(0.055, 0.32, 4), tieMat, 0, 0.07, 0.215, 0, Math.PI / 4, Math.PI);
      t.scale.z = 0.4;
      const collarMat = soft(0xffffff);
      for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.05, 0.1, 3), collarMat, sx * 0.05, 0.26, 0.19, 0, 0, sx * 2.0);
      break;
    }
  }
  return g;
}

function nameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px Fredoka, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(30,32,48,0.55)';
  g.beginPath();
  g.roundRect(128 - w / 2, 8, w, 48, 24);
  g.fill();
  g.fillStyle = color === '#f5f2ec' ? '#ffffff' : color;
  g.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.4, 0.35, 1);
  s.renderOrder = 10;
  return s;
}

export class RagdollView {
  // color: kıyafet rengi (beyaz = klasik Bob), look: {head, face, back}
  constructor(scene, name, color, look, isMe) {
    this.scene = scene;
    look = sanitizeLook(look);
    const skin = soft(BOB);
    const cloth = new THREE.Color(color);
    const isBob = cloth.getHex() === new THREE.Color(BOB).getHex();
    const shirt = isBob ? skin : soft(cloth);
    const pants = isBob ? skin : soft(cloth.clone().offsetHSL(0, -0.05, -0.18));
    this.handMats = [skin.clone(), skin.clone()];

    const parts = {};
    this.meshes = PARTS.map((def) => {
      const g = new THREE.Group();
      parts[def.n] = g;
      scene.add(g);
      return g;
    });

    // Gövde: tombul yumurta. Göğüs ve kalça topları birbirine karışır.
    parts.chest.add(blob(shirt, 0.32, 0.36, 0.24, 0, 0.0, 0));
    parts.pelvis.add(blob(pants, 0.29, 0.24, 0.23, 0, 0.03, 0));

    // Kafa: büyük, boyunsuz, gövdeye gömülü
    const head = blob(skin, 0.27, 0.285, 0.26, 0, -0.03, 0);
    parts.head.add(head);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = blob(EYE, 0.032, 0.045, 0.02, sx * 0.085, 0.03, 0.235);
      e.castShadow = false;
      e.rotation.y = sx * 0.3;
      parts.head.add(e);
      this.eyes.push(e);
    }

    // Kollar: kalın, uçlara doğru incelen, eldiven gibi eller
    for (const s of ['L', 'R']) {
      parts['uArm' + s].add(capsule(0.1, 0.16, shirt));
      parts['lArm' + s].add(capsule(0.09, 0.16, skin));
      const hand = blob(this.handMats[s === 'L' ? 0 : 1], 0.105, 0.115, 0.1, 0, -0.19, 0);
      parts['lArm' + s].add(hand);
      // Bacaklar: kısa ve tombul, yuvarlak ayaklar
      parts['uLeg' + s].add(capsule(0.12, 0.14, pants));
      parts['lLeg' + s].add(capsule(0.105, 0.17, pants));
      parts['lLeg' + s].add(blob(isBob ? skin : soft(0x2f2f38), 0.115, 0.08, 0.16, 0, -0.21, 0.04));
    }

    // Kozmetikler
    if (look.head !== 'none') parts.head.add(buildCosmetic(look.head, color));
    if (look.face !== 'none') parts.head.add(buildCosmetic(look.face, color));
    if (look.back !== 'none') parts.chest.add(buildCosmetic(look.back, color));

    this.label = isMe ? null : nameSprite(name, color);
    if (this.label) scene.add(this.label);
    this.blinkT = Math.random() * 4;
    this.grab = [false, false];
  }

  setGrab(l, r) {
    for (const [i, on] of [[0, l], [1, r]]) {
      if (this.grab[i] === on) continue;
      this.grab[i] = on;
      this.handMats[i].emissive.set(on ? 0xffa940 : 0x000000);
      this.handMats[i].emissiveIntensity = on ? 0.5 : 0;
    }
  }

  tick(dt) {
    this.blinkT -= dt;
    const closed = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = closed ? 0.008 : 0.045;
  }

  // arr: [px,py,pz,qx,qy,qz,qw] * parça
  apply(arr) {
    for (let i = 0; i < this.meshes.length; i++) {
      const o = i * 7;
      this.meshes[i].position.set(arr[o], arr[o + 1], arr[o + 2]);
      this.meshes[i].quaternion.set(arr[o + 3], arr[o + 4], arr[o + 5], arr[o + 6]);
    }
    if (this.label) this.label.position.set(arr[14], arr[15] + 0.7, arr[16]);
  }

  applyBodies(bodies) {
    for (let i = 0; i < bodies.length; i++) {
      this.meshes[i].position.copy(bodies[i].position);
      this.meshes[i].quaternion.copy(bodies[i].quaternion);
    }
    if (this.label) this.label.position.set(bodies[2].position.x, bodies[2].position.y + 0.7, bodies[2].position.z);
  }

  get chestPos() { return this.meshes[1].position; }

  destroy() {
    this.meshes.forEach((m) => this.scene.remove(m));
    if (this.label) this.scene.remove(this.label);
  }
}
