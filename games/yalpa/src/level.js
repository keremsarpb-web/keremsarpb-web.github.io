import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { r3 } from './ragdoll.js';

// Her bölüm dünyada x ekseninde LEVEL_GAP kadar uzağa kurulur; hepsi baştan inşa edilir.
export const LEVEL_GAP = 300;
export const FALL_Y = -15;

const COLORS = {
  grass: 0x8fd16a,
  grass2: 0x7cc35a,
  dirt: 0xb98557,
  rock: 0x9a8f86,
  wood: 0xd99a4e,
  wood2: 0xc4813a,
  leaf: 0x5fb85a,
  leaf2: 0x9ad65a,
  trunk: 0x8a5a3b,
  ball: 0xf2665e,
  water: 0x5fc4e0,
  stone: 0xc9c2b6,
  stone2: 0xb3ab9f,
  red: 0xe8574a,
  blue: 0x4dabf7,
  metal: 0x6b7280,
  yellow: 0xffd43b,
};

// Bölüm tanımları (yerel koordinatlar; x'e bölüm ofseti eklenir)
const DEFS = [
  {
    name: 'Adalar', icon: '🏝️',
    cps: [[0, 0, 0], [0, 1.2, 24], [0, 3.6, 37], [0, 3.0, 51.5]],
    goal: [0, 3.0, 57, 2.2],
    build(h) {
      // Ada A (başlangıç)
      h.island(0, 0, 0, 7, 7, 3, 1.1);
      h.tree(-5, 0, -5, 1.1); h.tree(5, 0, -4.5, 0.9); h.tree(-5.5, 0, 4.5, 0.8);
      h.rocks(5, 0, 3, 0.6);
      h.dynBox(2.5, 0.4, 2, 0.35, 0.35, 0.35, 3, COLORS.wood);
      h.dynBox(3.2, 0.4, 1.2, 0.35, 0.35, 0.35, 3, COLORS.wood);
      h.dynBall(-2.5, 0.8, 2.5, 0.6, 4, COLORS.ball);
      // Basamak platformlar
      h.island(0, 0, 10.5, 1.5, 1.5, 1, 2.2);
      h.island(1.8, 0.6, 14.5, 1.5, 1.5, 1, 3.3);
      h.island(-0.5, 1.2, 18.5, 1.5, 1.5, 1, 4.4);
      // Ada B (duvarın önü)
      h.island(0, 1.2, 28, 6, 6, 3, 5.5);
      h.tree(-4.5, 1.2, 31, 0.9);
      h.rocks(4.6, 1.2, 23.4, 0.5);
      h.dynBox(-3, 1.75, 27, 0.5, 0.5, 0.5, 6, COLORS.wood);
      h.dynBox(3, 1.75, 26, 0.5, 0.5, 0.5, 6, COLORS.wood);
      h.dynBox(0.5, 1.75, 30, 0.5, 0.5, 0.5, 6, COLORS.wood);
      // Ada C (yüksek plato) + köprü tahtası
      h.island(0, 3.6, 40, 6, 6, 5.4, 6.6);
      h.tree(-4, 3.6, 44, 1);
      h.dynBox(3.5, 3.75, 40, 0.5, 0.1, 3.75, 14, COLORS.wood);
      // Ada D (bitiş)
      h.island(0, 3.0, 54.5, 5, 5, 4, 7.7);
      h.tree(3.8, 3.0, 58.5, 0.9); h.tree(-3.8, 3.0, 57.5, 0.7);
    },
  },
  {
    name: 'Tahterevalli', icon: '⚖️',
    cps: [[0, 0, 0], [0, 0, 17], [0, 0, 32]],
    goal: [0, 2.2, 43, 2],
    build(h) {
      h.island(0, 0, 0, 6, 6, 3, 2.1);
      h.tree(-4.5, 0, -4, 1); h.tree(4.2, 0, -3.5, 0.8);
      h.dynBall(3, 0.8, 2, 0.5, 3, COLORS.blue);
      // Denge kirişi
      h.block(0, 0, 10, 0.5, 0.4, 4, COLORS.wood, 0.01);
      h.island(0, 0, 18, 4, 4, 2, 2.4);
      h.rocks(-3, 0, 20, 0.5);
      // Tahterevalli: yürüyüp ortayı geçince öbür adaya yatar
      h.seesaw(25.6, 0.9, 4.2, 0.8);
      h.island(0, 0, 32, 5, 3.5, 3, 2.7);
      h.dynBox(2.5, 0.5, 33, 0.5, 0.5, 0.5, 6, COLORS.wood);
      // 2.2 m duvar: tutunup tırman ya da sandığı basamak yap
      h.island(0, 2.2, 41.5, 5, 6, 5, 2.9);
      h.tree(-3.6, 2.2, 45.5, 0.9); h.tree(3.6, 2.2, 46, 0.7);
    },
  },
  {
    name: 'Kale Kapısı', icon: '🏰',
    cps: [[0, 0, 0], [0, 0, 11], [0, 3.0, 24]],
    goal: [0, 3.0, 50.5, 2],
    build(h) {
      h.island(0, 0, 3, 8, 10, 3, 3.1);
      h.tree(-6.5, 0, -5, 1); h.tree(6, 0, -5.5, 0.9);
      h.dynBox(3, 0.45, 2, 0.45, 0.45, 0.45, 5, COLORS.wood);
      h.dynBox(1.5, 0.35, -2, 0.35, 0.35, 0.35, 3, COLORS.wood);
      // Sur duvarı ve kapı
      h.block(-4.65, 4, 8, 3.35, 6, 0.5, COLORS.stone, 0.02);
      h.block(4.65, 4, 8, 3.35, 6, 0.5, COLORS.stone, 0.02);
      h.block(0, 4, 8, 1.3, 0.8, 0.5, COLORS.stone2, 0.02);
      for (const x of [-7.4, -5.4, -3.4, 3.4, 5.4, 7.4]) h.block(x, 4.6, 8, 0.45, 0.6, 0.5, COLORS.stone2, 0.02);
      let gateOpen = 0;
      h.kin([{ hx: 1.3, hy: 1.6, hz: 0.25, off: [0, 0, 0] }], COLORS.wood2, () => ({ x: 0, y: 1.6 - gateOpen * 3.3, z: 8 }));
      // Basınç plakası: üstünde sandık ya da oyuncu varken kapı açılır
      const plate = h.deco(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 10), COLORS.red, -4, 0.04, 3);
      const px = h.X(-4), pz = 3;
      h.onTick((t, dt, positions) => {
        let pressed = false;
        for (const p of positions) {
          if (Math.hypot(p.x - px, p.z - pz) < 1.05 && p.y > -0.2 && p.y < 1.7) { pressed = true; break; }
        }
        gateOpen = pressed ? Math.min(1, gateOpen + dt * 1.6) : Math.max(0, gateOpen - dt * 0.22);
        plate.position.y = pressed ? 0.0 : 0.04;
        plate.material.color.setHex(pressed ? 0x69db7c : COLORS.red);
      });
      h.onReset(() => { gateOpen = 0; });
      // Basamaklar
      [0.6, 1.2, 1.8, 2.4].forEach((top, i) => h.block(0, top, 14 + i * 2, 2, top + 3, 1, COLORS.stone, 0.03));
      h.island(0, 3.0, 28, 5, 7, 4, 3.4);
      h.tree(-3.5, 3.0, 32, 0.9);
      // Gidip gelen sal
      h.kin([{ hx: 1.6, hy: 0.25, hz: 1.6, off: [0, 0, 0] }], COLORS.blue, (t) => ({ x: 0, y: 2.75, z: 40 + 3.4 * pingpong(t, 11, 2.5) }));
      h.island(0, 3.0, 50, 5, 5, 4, 3.6);
      h.tree(3.6, 3.0, 53.5, 0.8); h.tree(-3.8, 3.0, 54, 0.9);
    },
  },
  {
    name: 'Değirmen', icon: '🌀',
    cps: [[0, 0, 0], [0, 0.5, 22], [0, 0.5, 42]],
    goal: [0, 1.4, 62, 2],
    build(h) {
      h.island(0, 0, 0, 6, 6, 3, 4.1);
      h.tree(-4.5, 0, -4, 1); h.tree(4.5, 0, -4.5, 0.8);
      // Dönen alçak kol: üstünden zıpla
      h.island(0, 0, 13, 5, 5, 3, 4.2);
      h.block(0, 1.2, 13, 0.4, 3, 0.4, COLORS.metal, 0);
      h.kin([{ hx: 4.6, hy: 0.22, hz: 0.22, off: [0, 0, 0] }], COLORS.red, (t) => ({ x: 0, y: 0.55, z: 13, ax: 1, a: t * 1.1 }));
      h.island(0, 0.5, 23, 3, 3, 2, 4.3);
      // Sallanan çekiçler köprüsü
      h.block(0, 0.5, 33, 1.1, 0.4, 7, COLORS.wood, 0.01);
      for (const [z, ph] of [[29.5, 0], [36, Math.PI / 2]]) {
        h.block(-3.2, 6.9, z, 0.2, 7.5, 0.2, COLORS.metal, 0);
        h.block(3.2, 6.9, z, 0.2, 7.5, 0.2, COLORS.metal, 0);
        h.block(0, 7.1, z, 3.4, 0.2, 0.2, COLORS.metal, 0);
        h.kin([
          { hx: 0.1, hy: 2.4, hz: 0.1, off: [0, -2.4, 0], color: COLORS.metal },
          { hx: 0.75, hy: 0.55, hz: 0.45, off: [0, -5.0, 0], color: COLORS.red },
        ], COLORS.red, (t) => ({ x: 0, y: 6.6, z, ax: 2, a: 1.05 * Math.sin(t * 1.5 + ph) }));
      }
      h.island(0, 0.5, 44, 4, 4, 3, 4.4);
      // İnip kalkan sütunlar
      [50.5, 53, 55.5].forEach((z, i) => {
        h.kin([{ hx: 0.9, hy: 2, hz: 0.9, off: [0, 0, 0] }], COLORS.yellow, (t) => ({ x: 0, y: -0.6 + 0.9 * Math.sin(t * 1.2 - i * 1.3), z }));
      });
      h.island(0, 1.4, 61.5, 4.5, 4.5, 4, 4.5);
      h.tree(3.2, 1.4, 64.5, 0.8);
    },
  },
  {
    name: 'Kule', icon: '🗼',
    cps: [[0, 0, 2], [-1, 4.5, 17], [3, 7.5, 13]],
    goal: [0, 9.5, 14, 1.6],
    build(h) {
      h.island(0, 0, 10, 9, 11, 3, 5.1);
      h.tree(-6.5, 0, 2, 1); h.tree(6.5, 0, 3, 0.9); h.tree(-6, 0, 19, 0.8); h.tree(6.5, 0, 18, 1);
      h.dynBox(4, 0.45, 4, 0.45, 0.45, 0.45, 5, COLORS.wood);
      h.block(0, 9.5, 14, 2, 9.5, 2, COLORS.stone, 0.03);
      // Kulenin etrafında dolanan merdiven
      const ring = [[-3, 11], [-1, 11], [1, 11], [3, 11], [3, 13], [3, 15], [3, 17], [1, 17], [-1, 17], [-3, 17], [-3, 15], [-3, 13]];
      for (let k = 0; k < 18; k++) {
        const [x, z] = ring[k % 12];
        h.block(x, 0.5 * (k + 1), z, 1, 0.5, 1, k % 2 ? COLORS.stone2 : COLORS.wood, 0.02);
      }
    },
  },
  {
    name: 'Gökyüzü', icon: '☁️',
    cps: [[0, 0, 0], [0, 0, 18], [0, 0.6, 36]],
    goal: [0, 3.0, 48, 2],
    build(h) {
      h.island(0, 0, 0, 5, 5, 3, 6.1);
      h.tree(-3.5, 0, -3, 0.9);
      h.kin([{ hx: 1.5, hy: 0.25, hz: 1.5, off: [0, 0, 0] }], COLORS.blue, (t) => ({ x: 0, y: -0.25, z: 10 + 3.5 * pingpong(t, 10, 2.2) }));
      h.island(0, 0, 18, 3, 3, 2, 6.2);
      // Ters dönen iki kol: alttakinden zıpla, üsttekinden kaç
      h.island(0, 0, 27, 5, 5, 3, 6.3);
      h.block(0, 2.6, 27, 0.4, 3, 0.4, COLORS.metal, 0);
      h.kin([{ hx: 4.6, hy: 0.22, hz: 0.22, off: [0, 0, 0] }], COLORS.red, (t) => ({ x: 0, y: 0.55, z: 27, ax: 1, a: t * 1.2 }));
      h.kin([{ hx: 4.6, hy: 0.22, hz: 0.22, off: [0, 0, 0] }], COLORS.yellow, (t) => ({ x: 0, y: 2.1, z: 27, ax: 1, a: -t * 0.75 + 1.3 }));
      h.island(0, 0.6, 37.5, 4, 3.5, 2, 6.4);
      h.dynBox(2, 1.1, 38, 0.5, 0.5, 0.5, 6, COLORS.wood);
      h.island(0, 3.0, 47, 5, 6, 5, 6.5);
      h.tree(3.5, 3.0, 50, 0.9); h.tree(-3.6, 3.0, 51, 0.8);
    },
  },
];

// 0 → 1 → 0 arasında, uçlarda bekleyerek gidip gelir (-1..1 döner)
function pingpong(t, period, wait) {
  const move = period / 2 - wait;
  let u = ((t % period) + period) % period;
  const ease = (x) => x * x * (3 - 2 * x);
  if (u < wait) return -1;
  u -= wait;
  if (u < move) return -1 + 2 * ease(u / move);
  u -= move;
  if (u < wait) return 1;
  u -= wait;
  return 1 - 2 * ease(u / move);
}

export const LEVELS = DEFS.map((d, i) => {
  const ox = i * LEVEL_GAP;
  return {
    name: d.name,
    icon: d.icon,
    ox,
    cps: d.cps.map(([x, y, z]) => ({ x: x + ox, y, z })),
    goal: { x: d.goal[0] + ox, y: d.goal[1], z: d.goal[2], r: d.goal[3] },
  };
});

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

// Low poly titreklik: aynı köşe her yüzde aynı kaydırılsın diye konuma göre hash
function jitter(geo, amt, seed = 1) {
  if (!amt) return geo;
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = (k) => {
      const s = Math.sin((v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + k * 11.13) * seed) * 43758.5453;
      return (s - Math.floor(s)) * 2 - 1;
    };
    pos.setXYZ(i, v.x + h(1) * amt, v.y + h(2) * amt, v.z + h(3) * amt);
  }
  geo.computeVertexNormals();
  return geo;
}

const AXES = [new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(0, 0, 1)];

export function buildLevel(scene, world, groundMat, objMat) {
  const solids = []; // kamera çarpışması için sabit görseller
  let cur = null;
  const X = (x) => x + cur.ox;

  const addStatic = (shape, x, y, z) => {
    const b = new CANNON.Body({ mass: 0, material: groundMat, collisionFilterGroup: 1, collisionFilterMask: 0xffff });
    b.addShape(shape);
    b.position.set(X(x), y, z);
    world.addBody(b);
    return b;
  };

  const h = {
    X: (x) => X(x),
    island(cx, top, cz, hx, hz, depth, seed) {
      addStatic(new CANNON.Box(new CANNON.Vec3(hx, depth / 2, hz)), cx, top - depth / 2, cz);
      const grass = new THREE.Mesh(jitter(new THREE.BoxGeometry(hx * 2 + 0.1, 0.4, hz * 2 + 0.1, 4, 1, 4), 0.04, seed), mat(COLORS.grass));
      grass.position.set(X(cx), top - 0.2, cz);
      grass.receiveShadow = true;
      const dirt = new THREE.Mesh(jitter(new THREE.BoxGeometry(hx * 2 - 0.1, depth - 0.4, hz * 2 - 0.1, 3, 2, 3), 0.12, seed), mat(COLORS.dirt));
      dirt.position.set(X(cx), top - 0.4 - (depth - 0.4) / 2, cz);
      dirt.receiveShadow = true;
      const rh = Math.max(hx, hz) * 1.2;
      const rock = new THREE.Mesh(jitter(new THREE.ConeGeometry(Math.max(hx, hz) * 1.05, rh, 7, 3), 0.35, seed), mat(COLORS.rock));
      rock.rotation.x = Math.PI;
      rock.position.set(X(cx), top - depth - rh / 2 + 0.05, cz);
      scene.add(grass, dirt, rock);
      solids.push(grass, dirt);
    },
    // Üst yüzü `top` yüksekliğinde, `height` boyunda sabit kutu
    block(cx, top, cz, hx, height, hz, color, jit = 0.03) {
      addStatic(new CANNON.Box(new CANNON.Vec3(hx, height / 2, hz)), cx, top - height / 2, cz);
      const m = new THREE.Mesh(jitter(new THREE.BoxGeometry(hx * 2, height, hz * 2, 2, 2, 2), jit, cx + cz + top), mat(color));
      m.position.set(X(cx), top - height / 2, cz);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      solids.push(m);
      return m;
    },
    deco(geo, color, x, y, z) {
      const m = new THREE.Mesh(geo, mat(color, { emissive: color, emissiveIntensity: 0.15 }));
      m.position.set(X(x), y, z);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    },
    tree(x, y, z, s = 1) {
      addStatic(new CANNON.Cylinder(0.18 * s, 0.22 * s, 1.4 * s, 6), x, y + 0.7 * s, z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.4 * s, 5), mat(COLORS.trunk));
      trunk.position.set(X(x), y + 0.7 * s, z);
      trunk.castShadow = true;
      scene.add(trunk);
      const leafMat = mat(Math.random() > 0.5 ? COLORS.leaf : COLORS.leaf2);
      for (const [dx, dy, dz, r] of [[0, 1.9, 0, 0.95], [0.4, 2.5, 0.1, 0.6], [-0.3, 2.3, -0.3, 0.6]]) {
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), leafMat);
        l.position.set(X(x) + dx * s, y + dy * s, z + dz * s);
        l.castShadow = true;
        scene.add(l);
      }
      addStatic(new CANNON.Sphere(0.95 * s), x, y + 1.9 * s, z);
    },
    rocks(x, y, z, s) {
      const r = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.15, x + z), mat(COLORS.rock));
      r.position.set(X(x), y + s * 0.4, z);
      r.castShadow = true;
      r.receiveShadow = true;
      scene.add(r);
      addStatic(new CANNON.Sphere(s * 0.9), x, y + s * 0.4, z);
    },
    dynBox(x, y, z, hx, hy, hz, mass, color) {
      const b = new CANNON.Body({ mass, material: objMat, collisionFilterGroup: 1, collisionFilterMask: 0xffff, angularDamping: 0.2 });
      b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
      b.position.set(X(x), y, z);
      world.addBody(b);
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat(color));
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      // tahta çıtaları
      if (hx > 0.3 && hy > 0.3) {
        const plank = mat(COLORS.wood2);
        for (const sy of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 0.02, 0.1, hz * 2 + 0.02), plank);
          p.position.y = sy * (hy - 0.08);
          g.add(p);
        }
      }
      scene.add(g);
      const d = { body: b, mesh: g, home: { x: X(x), y, z } };
      cur.dynamics.push(d);
      return d;
    },
    dynBall(x, y, z, r, mass, color) {
      const b = new CANNON.Body({ mass, material: objMat, collisionFilterGroup: 1, collisionFilterMask: 0xffff, angularDamping: 0.3, linearDamping: 0.1 });
      b.addShape(new CANNON.Sphere(r));
      b.position.set(X(x), y, z);
      world.addBody(b);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(color));
      m.castShadow = true;
      scene.add(m);
      cur.dynamics.push({ body: b, mesh: m, home: { x: X(x), y, z } });
    },
    // Ortasından menteşeli tahta; menteşe biraz ileride olduğu için boşken arkaya yatar
    seesaw(cz, pivotY, halfLen, hx) {
      const back = 0.35;
      const d = h.dynBox(0, pivotY, cz - back, hx, 0.1, halfLen, 25, COLORS.wood);
      d.body.angularDamping = 0.3;
      const pin = new CANNON.Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
      pin.addShape(new CANNON.Sphere(0.05));
      pin.position.set(X(0), pivotY, cz);
      world.addBody(pin);
      world.addConstraint(new CANNON.HingeConstraint(pin, d.body, {
        pivotA: new CANNON.Vec3(0, 0, 0), axisA: new CANNON.Vec3(1, 0, 0),
        pivotB: new CANNON.Vec3(0, 0, back), axisB: new CANNON.Vec3(1, 0, 0),
        collideConnected: false,
      }));
      h.block(0, pivotY - 0.25, cz, 0.22, 10, 0.22, COLORS.rock, 0);
    },
    // Hareketli (kinematik) engel: pose(t) → {x,y,z, ax (0/1/2 = x/y/z ekseni), a (açı)}
    kin(parts, color, pose) {
      const b = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, material: groundMat, collisionFilterGroup: 1, collisionFilterMask: 0xffff });
      const g = new THREE.Group();
      for (const p of parts) {
        b.addShape(new CANNON.Box(new CANNON.Vec3(p.hx, p.hy, p.hz)), new CANNON.Vec3(...p.off));
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.hx * 2, p.hy * 2, p.hz * 2), mat(p.color ?? color));
        m.position.set(...p.off);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
      world.addBody(b);
      scene.add(g);
      const k = { body: b, mesh: g, kin: true, pose, last: null };
      setKin(k, 0, 0);
      cur.dynamics.push(k);
      return k;
    },
    onTick(fn) { cur.ticks.push(fn); },
    onReset(fn) { cur.resets.push(fn); },
  };

  function setKin(k, t, dt) {
    const p = k.pose(t);
    const b = k.body;
    const a = p.a || 0;
    const axis = AXES[p.ax ?? 1];
    b.position.set(X(p.x), p.y, p.z);
    b.quaternion.setFromAxisAngle(axis, a);
    if (dt > 0 && k.last) {
      b.velocity.set((p.x - k.last.x) / dt, (p.y - k.last.y) / dt, (p.z - k.last.z) / dt);
      b.angularVelocity.copy(axis).scale((a - (k.last.a || 0)) / dt, b.angularVelocity);
    } else {
      b.velocity.setZero();
      b.angularVelocity.setZero();
    }
    k.last = { x: p.x, y: p.y, z: p.z, a };
    k.mesh.position.copy(b.position);
    k.mesh.quaternion.copy(b.quaternion);
  }

  const levels = DEFS.map((def, i) => {
    cur = { ox: LEVELS[i].ox, dynamics: [], ticks: [], resets: [] };
    def.build(h);
    const lv = cur;
    const L = LEVELS[i];
    // Bayrak
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), mat(0xeeeeee));
    pole.position.set(L.goal.x, L.goal.y + 1.5, L.goal.z);
    pole.castShadow = true;
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0); flagShape.lineTo(1.1, -0.35); flagShape.lineTo(0, -0.7);
    lv.flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), mat(0xffcc33, { side: THREE.DoubleSide }));
    lv.flag.position.set(L.goal.x + 0.05, L.goal.y + 2.95, L.goal.z);
    lv.flag.castShadow = true;
    const goalPad = new THREE.Mesh(new THREE.CylinderGeometry(L.goal.r, L.goal.r, 0.06, 8), mat(0xffe680, { emissive: 0x806010, emissiveIntensity: 0.4 }));
    goalPad.position.set(L.goal.x, L.goal.y + 0.03, L.goal.z);
    goalPad.receiveShadow = true;
    scene.add(pole, lv.flag, goalPad);
    // Kontrol noktaları
    L.cps.slice(1).forEach((c) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 6), mat(0x9be7ff, { emissive: 0x2a6f8a, emissiveIntensity: 0.4 }));
      pad.position.set(c.x, c.y + 0.03, c.z);
      pad.receiveShadow = true;
      scene.add(pad);
    });
    for (const d of lv.dynamics) {
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);
    }
    return lv;
  });

  // Deniz ve bulutlar etkin bölümle birlikte taşınır
  const ambient = new THREE.Group();
  const sea = new THREE.Mesh(
    jitter(new THREE.PlaneGeometry(600, 600, 40, 40).rotateX(-Math.PI / 2), 0.8, 9),
    mat(COLORS.water, { roughness: 0.4 }),
  );
  sea.position.y = -40;
  ambient.add(sea);
  const clouds = [];
  const cloudMat = mat(0xffffff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.45 });
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + Math.random() * 1.2, 0), cloudMat);
      p.position.set(k * 1.4 - n * 0.7, Math.random() * 0.6, Math.random() * 1.2);
      g.add(p);
    }
    const below = Math.random() < 0.4;
    g.position.set((Math.random() - 0.5) * 140, below ? -12 - Math.random() * 15 : 8 + Math.random() * 18, (Math.random() - 0.3) * 140);
    g.scale.setScalar(1 + Math.random() * 1.5);
    ambient.add(g);
    clouds.push(g);
  }
  scene.add(ambient);
  // Kamera ışını ilk karede de doğru yere çarpsın
  for (const m of solids) m.updateMatrixWorld(true);

  let active = 0;
  let simT = 0;

  return {
    levels,
    solids,
    get dynamics() { return levels[active].dynamics; },
    get active() { return active; },
    setActive(i) {
      // eski bölümün hareketli parçaları kendi kendine kaymasın
      for (const d of levels[active].dynamics) if (d.kin) { d.body.velocity.setZero(); d.body.angularVelocity.setZero(); }
      active = i;
      ambient.position.x = LEVELS[i].ox;
    },
    // Bölümü baştan kur: sandıklar evine, kapılar kapalı
    reset(i) {
      simT = 0;
      const lv = levels[i];
      cur = lv;
      lv.resets.forEach((fn) => fn());
      for (const d of lv.dynamics) {
        if (d.kin) { d.last = null; setKin(d, 0, 0); continue; }
        d.body.position.set(d.home.x, d.home.y, d.home.z);
        d.body.quaternion.set(0, 0, 0, 1);
        d.body.velocity.setZero();
        d.body.angularVelocity.setZero();
        d.mesh.position.copy(d.body.position);
        d.mesh.quaternion.copy(d.body.quaternion);
      }
    },
    // Sabit fizik adımından önce: hareketli engeller ve bölüm mantığı (yalnızca kurucu/tek oyunculu)
    step(dt, positions) {
      simT += dt;
      const lv = levels[active];
      cur = lv;
      for (const fn of lv.ticks) fn(simT, dt, positions);
      for (const d of lv.dynamics) if (d.kin) setKin(d, simT, dt);
    },
    update(t, dt) {
      levels[active].flag.rotation.y = Math.sin(t * 2) * 0.15;
      for (const c of clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > 80) c.position.x = -80;
      }
    },
    serialize() {
      const out = [];
      for (const d of levels[active].dynamics) {
        const b = d.body;
        out.push(r3(b.position.x), r3(b.position.y), r3(b.position.z),
          r3(b.quaternion.x), r3(b.quaternion.y), r3(b.quaternion.z), r3(b.quaternion.w));
      }
      return out;
    },
  };
}
