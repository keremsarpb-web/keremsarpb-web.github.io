import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { r3 } from './ragdoll.js';

export const CHECKPOINTS = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 1.2, z: 24 },
  { x: 0, y: 3.6, z: 37 },
  { x: 0, y: 3.0, z: 51.5 },
];
export const GOAL = { x: 0, y: 3.0, z: 57, r: 2.2 };
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
};

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

// Low poly titreklik: aynı köşe her yüzde aynı kaydırılsın diye konuma göre hash
function jitter(geo, amt, seed = 1) {
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

export function buildLevel(scene, world, groundMat, objMat) {
  const dynamics = [];

  const addStatic = (shape, x, y, z, quat) => {
    const b = new CANNON.Body({ mass: 0, material: groundMat, collisionFilterGroup: 1, collisionFilterMask: 0xffff });
    b.addShape(shape);
    b.position.set(x, y, z);
    if (quat) b.quaternion.copy(quat);
    world.addBody(b);
    return b;
  };

  function island(cx, top, cz, hx, hz, depth, seed) {
    addStatic(new CANNON.Box(new CANNON.Vec3(hx, depth / 2, hz)), cx, top - depth / 2, cz);
    const grass = new THREE.Mesh(jitter(new THREE.BoxGeometry(hx * 2 + 0.1, 0.4, hz * 2 + 0.1, 4, 1, 4), 0.04, seed), mat(COLORS.grass));
    grass.position.set(cx, top - 0.2, cz);
    grass.receiveShadow = true;
    scene.add(grass);
    const dirt = new THREE.Mesh(jitter(new THREE.BoxGeometry(hx * 2 - 0.1, depth - 0.4, hz * 2 - 0.1, 3, 2, 3), 0.12, seed), mat(COLORS.dirt));
    dirt.position.set(cx, top - 0.4 - (depth - 0.4) / 2, cz);
    dirt.receiveShadow = true;
    scene.add(dirt);
    const rh = Math.max(hx, hz) * 1.2;
    const rock = new THREE.Mesh(jitter(new THREE.ConeGeometry(Math.max(hx, hz) * 1.05, rh, 7, 3), 0.35, seed), mat(COLORS.rock));
    rock.rotation.x = Math.PI;
    rock.position.set(cx, top - depth - rh / 2 + 0.05, cz);
    scene.add(rock);
  }

  function tree(x, y, z, s = 1) {
    addStatic(new CANNON.Cylinder(0.18 * s, 0.22 * s, 1.4 * s, 6), x, y + 0.7 * s, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.4 * s, 5), mat(COLORS.trunk));
    trunk.position.set(x, y + 0.7 * s, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const leafMat = mat(Math.random() > 0.5 ? COLORS.leaf : COLORS.leaf2);
    for (const [dx, dy, dz, r] of [[0, 1.9, 0, 0.95], [0.4, 2.5, 0.1, 0.6], [-0.3, 2.3, -0.3, 0.6]]) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), leafMat);
      l.position.set(x + dx * s, y + dy * s, z + dz * s);
      l.castShadow = true;
      scene.add(l);
    }
    addStatic(new CANNON.Sphere(0.95 * s), x, y + 1.9 * s, z);
  }

  function rocks(x, y, z, s) {
    const r = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.15, x + z), mat(COLORS.rock));
    r.position.set(x, y + s * 0.4, z);
    r.castShadow = true;
    r.receiveShadow = true;
    scene.add(r);
    addStatic(new CANNON.Sphere(s * 0.9), x, y + s * 0.4, z);
  }

  function dynBox(x, y, z, hx, hy, hz, mass, color) {
    const b = new CANNON.Body({ mass, material: objMat, collisionFilterGroup: 1, collisionFilterMask: 0xffff, angularDamping: 0.2 });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    b.position.set(x, y, z);
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
    dynamics.push({ body: b, mesh: g, home: { x, y, z } });
  }

  function dynBall(x, y, z, r, mass, color) {
    const b = new CANNON.Body({ mass, material: objMat, collisionFilterGroup: 1, collisionFilterMask: 0xffff, angularDamping: 0.3, linearDamping: 0.1 });
    b.addShape(new CANNON.Sphere(r));
    b.position.set(x, y, z);
    world.addBody(b);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(color));
    m.castShadow = true;
    scene.add(m);
    dynamics.push({ body: b, mesh: m, home: { x, y, z } });
  }

  // --- Ada A (başlangıç) ---
  island(0, 0, 0, 7, 7, 3, 1.1);
  tree(-5, 0, -5, 1.1);
  tree(5, 0, -4.5, 0.9);
  tree(-5.5, 0, 4.5, 0.8);
  rocks(5, 0, 3, 0.6);
  dynBox(2.5, 0.4, 2, 0.35, 0.35, 0.35, 3, COLORS.wood);
  dynBox(3.2, 0.4, 1.2, 0.35, 0.35, 0.35, 3, COLORS.wood);
  dynBall(-2.5, 0.8, 2.5, 0.6, 4, COLORS.ball);

  // --- Basamak platformlar ---
  island(0, 0, 10.5, 1.5, 1.5, 1, 2.2);
  island(1.8, 0.6, 14.5, 1.5, 1.5, 1, 3.3);
  island(-0.5, 1.2, 18.5, 1.5, 1.5, 1, 4.4);

  // --- Ada B (duvarın önü) ---
  island(0, 1.2, 28, 6, 6, 3, 5.5);
  tree(-4.5, 1.2, 31, 0.9);
  rocks(4.6, 1.2, 23.4, 0.5);
  dynBox(-3, 1.75, 27, 0.5, 0.5, 0.5, 6, COLORS.wood);
  dynBox(3, 1.75, 26, 0.5, 0.5, 0.5, 6, COLORS.wood);
  dynBox(0.5, 1.75, 30, 0.5, 0.5, 0.5, 6, COLORS.wood);

  // --- Ada C (yüksek plato, duvar) ---
  island(0, 3.6, 40, 6, 6, 5.4, 6.6);
  tree(-4, 3.6, 44, 1);
  dynBox(3.5, 3.75, 40, 0.5, 0.1, 3.75, 14, COLORS.wood);

  // --- Ada D (bitiş) ---
  island(0, 3.0, 54.5, 5, 5, 4, 7.7);
  tree(3.8, 3.0, 58.5, 0.9);
  tree(-3.8, 3.0, 57.5, 0.7);

  // Bayrak
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), mat(0xeeeeee));
  pole.position.set(GOAL.x, GOAL.y + 1.5, GOAL.z);
  pole.castShadow = true;
  scene.add(pole);
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0); flagShape.lineTo(1.1, -0.35); flagShape.lineTo(0, -0.7);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), mat(0xffcc33, { side: THREE.DoubleSide }));
  flag.position.set(GOAL.x + 0.05, GOAL.y + 2.95, GOAL.z);
  flag.castShadow = true;
  scene.add(flag);
  const goalPad = new THREE.Mesh(new THREE.CylinderGeometry(GOAL.r, GOAL.r, 0.06, 8), mat(0xffe680, { emissive: 0x806010, emissiveIntensity: 0.4 }));
  goalPad.position.set(GOAL.x, GOAL.y + 0.03, GOAL.z);
  goalPad.receiveShadow = true;
  scene.add(goalPad);

  // Kontrol noktaları
  CHECKPOINTS.slice(1).forEach((c) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 6), mat(0x9be7ff, { emissive: 0x2a6f8a, emissiveIntensity: 0.4 }));
    pad.position.set(c.x, c.y + 0.03, c.z);
    pad.receiveShadow = true;
    scene.add(pad);
  });

  // Aşağıdaki deniz
  const sea = new THREE.Mesh(
    jitter(new THREE.PlaneGeometry(600, 600, 40, 40).rotateX(-Math.PI / 2), 0.8, 9),
    mat(COLORS.water, { roughness: 0.4 }),
  );
  sea.position.y = -40;
  scene.add(sea);

  // Bulutlar
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
    scene.add(g);
    clouds.push(g);
  }

  for (const d of dynamics) {
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
  }

  return {
    dynamics,
    flag,
    update(t, dt) {
      flag.rotation.y = Math.sin(t * 2) * 0.15;
      for (const c of clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > 80) c.position.x = -80;
      }
    },
    serialize() {
      const out = [];
      for (const d of dynamics) {
        const b = d.body;
        out.push(r3(b.position.x), r3(b.position.y), r3(b.position.z),
          r3(b.quaternion.x), r3(b.quaternion.y), r3(b.quaternion.z), r3(b.quaternion.w));
      }
      return out;
    },
  };
}
