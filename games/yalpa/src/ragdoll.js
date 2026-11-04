import * as CANNON from 'cannon-es';

export const GRAVITY = 15;
const STAND_H = 0.97;
const SPEED = 4.2;
const JUMP = 7;

// Vücut parçaları: ayakta duran pozda, ayak tabanı y=0 kabul edilerek konumlar.
// L parçalar +x tarafında (karakter +z yönüne bakarken sol taraf).
export const PARTS = [
  { n: 'pelvis', h: [0.2, 0.12, 0.13], p: [0, 1.0, 0], m: 5 },
  { n: 'chest', h: [0.24, 0.24, 0.15], p: [0, 1.38, 0], m: 8 },
  { n: 'head', r: 0.2, p: [0, 1.84, 0], m: 2.5 },
  { n: 'uArmL', h: [0.07, 0.15, 0.07], p: [0.34, 1.4, 0], m: 1.5 },
  { n: 'lArmL', h: [0.065, 0.15, 0.065], p: [0.34, 1.09, 0], m: 1.2 },
  { n: 'uArmR', h: [0.07, 0.15, 0.07], p: [-0.34, 1.4, 0], m: 1.5 },
  { n: 'lArmR', h: [0.065, 0.15, 0.065], p: [-0.34, 1.09, 0], m: 1.2 },
  { n: 'uLegL', h: [0.09, 0.19, 0.09], p: [0.11, 0.69, 0], m: 3 },
  { n: 'lLegL', h: [0.08, 0.2, 0.08], p: [0.11, 0.29, 0], m: 2.5 },
  { n: 'uLegR', h: [0.09, 0.19, 0.09], p: [-0.11, 0.69, 0], m: 3 },
  { n: 'lLegR', h: [0.08, 0.2, 0.08], p: [-0.11, 0.29, 0], m: 2.5 },
];
const IDX = Object.fromEntries(PARTS.map((p, i) => [p.n, i]));

// [A, B, eklem noktası, koni açısı, burulma açısı]
const JOINTS = [
  ['pelvis', 'chest', [0, 1.13, 0], 0.35, 0.3],
  ['chest', 'head', [0, 1.63, 0], 0.5, 0.5],
  ['chest', 'uArmL', [0.34, 1.56, 0], 2.6, 0.6],
  ['uArmL', 'lArmL', [0.34, 1.245, 0], 1.4, 0.3],
  ['chest', 'uArmR', [-0.34, 1.56, 0], 2.6, 0.6],
  ['uArmR', 'lArmR', [-0.34, 1.245, 0], 1.4, 0.3],
  ['pelvis', 'uLegL', [0.11, 0.885, 0], 1.1, 0.2],
  ['uLegL', 'lLegL', [0.11, 0.495, 0], 1.2, 0.1],
  ['pelvis', 'uLegR', [-0.11, 0.885, 0], 1.1, 0.2],
  ['uLegR', 'lLegR', [-0.11, 0.495, 0], 1.2, 0.1],
];

const UP = new CANNON.Vec3(0, 1, 0);
const HAND_LOCAL = new CANNON.Vec3(0, -0.15, 0);
const tmpQ = new CANNON.Quaternion();
const tmpQ2 = new CANNON.Quaternion();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function clampVec(v, max) {
  const l = v.length();
  if (l > max) v.scale(max / l, v);
  return v;
}

// Gövdeyi hedef yönelime doğru açısal hızla çeker (stabil, motor benzeri).
function alignBody(body, qDes, gain, blend) {
  const qe = qDes.mult(body.quaternion.conjugate(tmpQ), tmpQ2);
  if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
  const w = Math.min(1, qe.w);
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(1 - w * w);
  const av = body.angularVelocity;
  let tx = 0, ty = 0, tz = 0;
  if (s > 1e-4) {
    const k = (angle * gain) / s;
    tx = qe.x * k; ty = qe.y * k; tz = qe.z * k;
  }
  av.x += (tx - av.x) * blend;
  av.y += (ty - av.y) * blend;
  av.z += (tz - av.z) * blend;
}

export class Ragdoll {
  constructor(world, slot, spawn, material) {
    this.world = world;
    this.group = 1 << (slot + 1);
    this.slot = slot;
    this.bodies = PARTS.map((def) => {
      const shape = def.r
        ? new CANNON.Sphere(def.r)
        : new CANNON.Box(new CANNON.Vec3(...def.h));
      const b = new CANNON.Body({
        mass: def.m,
        shape,
        material,
        linearDamping: 0.05,
        angularDamping: 0.5,
        collisionFilterGroup: this.group,
        collisionFilterMask: 0xffff & ~this.group,
      });
      b.position.set(spawn.x + def.p[0], spawn.y + def.p[1], spawn.z + def.p[2]);
      b.ragdoll = this;
      world.addBody(b);
      return b;
    });
    this.constraints = JOINTS.map(([a, b, piv, ang, tw]) => {
      const pa = PARTS[IDX[a]].p, pb = PARTS[IDX[b]].p;
      const c = new CANNON.ConeTwistConstraint(this.bodies[IDX[a]], this.bodies[IDX[b]], {
        pivotA: new CANNON.Vec3(piv[0] - pa[0], piv[1] - pa[1], piv[2] - pa[2]),
        pivotB: new CANNON.Vec3(piv[0] - pb[0], piv[1] - pb[1], piv[2] - pb[2]),
        axisA: new CANNON.Vec3(0, 1, 0),
        axisB: new CANNON.Vec3(0, 1, 0),
        angle: ang,
        twistAngle: tw,
        collideConnected: false,
      });
      world.addConstraint(c);
      return c;
    });
    const m = (n) => PARTS[IDX[n]].m;
    this.mLower = m('pelvis') + 2 * (m('uLegL') + m('lLegL'));
    this.mUpper = m('chest') + m('head');
    this.input = { mx: 0, mz: 0, yaw: 0, pitch: -0.2, jump: false, gl: false, gr: false };
    this.grab = [null, null];
    this.grabBody = [null, null];
    this.phase = 0;
    this.grounded = false;
    this.jumpCd = 0;
    this.grabCd = 0;
    this.events = []; // ses/efekt için: 'jump', 'grab', 'land'
    this.wasGrounded = true;
    this.ray = new CANNON.RaycastResult();
  }

  get pelvis() { return this.bodies[0]; }
  get chest() { return this.bodies[1]; }

  update(dt) {
    const inp = this.input;
    const B = this.bodies;
    const pelvis = B[0], chest = B[1], head = B[2];

    // Zemin kontrolü
    const from = pelvis.position;
    const to = new CANNON.Vec3(from.x, from.y - (STAND_H + 0.45), from.z);
    this.ray.reset();
    this.world.raycastClosest(from, to, {
      collisionFilterMask: 0xffff & ~this.group,
      skipBackfaces: true,
    }, this.ray);
    this.grounded = this.ray.hasHit;
    if (this.grounded && !this.wasGrounded && pelvis.velocity.y < -4) this.events.push('land');
    this.wasGrounded = this.grounded;
    const staticGrab = this.grabBody.some((b) => b && b.mass === 0);

    // Dik durma
    const qDes = new CANNON.Quaternion();
    qDes.setFromAxisAngle(UP, inp.yaw);
    alignBody(chest, qDes, 12, 0.4);
    alignBody(pelvis, qDes, 12, 0.4);
    alignBody(head, qDes, 8, 0.2);

    // Zıpladıktan hemen sonra ayakta durma yayı zıplamayı yemesin
    if (this.grounded && this.jumpCd < 0.35) {
      const dist = from.y - this.ray.hitPointWorld.y;
      const acc = clamp(140 * (STAND_H - dist), -25, 50);
      pelvis.force.y += this.mLower * (GRAVITY + acc - 16 * pelvis.velocity.y);
      chest.force.y += this.mUpper * (GRAVITY - 6 * (chest.velocity.y - pelvis.velocity.y));
    }

    // Yürüme
    const ctl = this.grounded ? 9 : 1.5;
    const tvx = inp.mx * SPEED, tvz = inp.mz * SPEED;
    for (const [b, m] of [[pelvis, this.mLower], [chest, this.mUpper]]) {
      b.force.x += m * ctl * (tvx - b.velocity.x);
      b.force.z += m * ctl * (tvz - b.velocity.z);
    }

    // Zıplama
    this.jumpCd -= dt;
    this.grabCd -= dt;
    if (inp.jump && this.jumpCd <= 0 && (this.grounded || staticGrab)) {
      if (staticGrab && !this.grounded) {
        // Kenardan kendini yukarı fırlat (tırmanma)
        this.release(0); this.release(1);
        this.grabCd = 0.45;
        for (const b of B) {
          b.velocity.y = JUMP * 0.95;
          b.velocity.x = Math.sin(inp.yaw) * 2.6;
          b.velocity.z = Math.cos(inp.yaw) * 2.6;
        }
      } else {
        for (const b of B) b.velocity.y = JUMP;
      }
      this.jumpCd = 0.7;
      this.events.push('jump');
    }
    inp.jump = false;

    // Bacak animasyonu
    const fx = Math.sin(inp.yaw), fz = Math.cos(inp.yaw);
    const hv = Math.hypot(pelvis.velocity.x, pelvis.velocity.z);
    const moving = this.grounded && hv > 0.4;
    this.phase += dt * (moving ? 3 + hv * 2.2 : 0);
    if (this.grounded) {
      const dx = moving ? pelvis.velocity.x / hv : fx;
      const dz = moving ? pelvis.velocity.z / hv : fz;
      const lx = dz, lz = -dx; // sol
      const stride = moving ? Math.min(0.35, 0.12 + hv * 0.06) : 0;
      for (let s = 0; s < 2; s++) {
        const sign = s === 0 ? 1 : -1;
        const ph = this.phase + s * Math.PI;
        const sw = Math.sin(ph) * stride;
        const lift = moving ? Math.max(0, Math.cos(ph)) * 0.18 : 0;
        const lower = B[s === 0 ? 8 : 10], upper = B[s === 0 ? 7 : 9];
        const bx = from.x + lx * 0.11 * sign, bz = from.z + lz * 0.11 * sign;
        this.pullTo(lower, bx + dx * sw, from.y - 0.71 + lift, bz + dz * sw, 11, pelvis.velocity);
        this.pullTo(upper, bx + dx * (sw * 0.5 + 0.03), from.y - 0.31 + lift * 0.5, bz + dz * (sw * 0.5 + 0.03), 8, pelvis.velocity);
      }
    }

    // Kollar
    const aimP = clamp(inp.pitch * 1.6, -1.3, 1.45);
    const ax = Math.sin(inp.yaw) * Math.cos(aimP), ay = Math.sin(aimP), az = Math.cos(inp.yaw) * Math.cos(aimP);
    for (let side = 0; side < 2; side++) {
      const held = side === 0 ? inp.gl : inp.gr;
      if (!held) { this.release(side); continue; }
      const sign = side === 0 ? 1 : -1;
      const upper = B[side === 0 ? 3 : 5], lower = B[side === 0 ? 4 : 6];
      const sh = chest.pointToWorldFrame(new CANNON.Vec3(0.3 * sign, 0.18, 0));
      const tx = sh.x + ax * 0.62, ty = sh.y + ay * 0.62, tz = sh.z + az * 0.62;
      const hand = lower.pointToWorldFrame(HAND_LOCAL);
      const gb = this.grabBody[side];
      if (gb && gb.mass === 0) {
        // Sabit bir şeye tutunuyorsa: göğsü ele göre çek (tırmanma)
        const F = new CANNON.Vec3(
          1600 * (hand.x - tx) - 120 * chest.velocity.x,
          1600 * (hand.y - ty) - 120 * chest.velocity.y,
          1600 * (hand.z - tz) - 120 * chest.velocity.z,
        );
        chest.force.vadd(clampVec(F, 560), chest.force);
      } else {
        const w = 14, mh = lower.mass * (gb ? 3 : 1);
        const hvx = lower.velocity.x - chest.velocity.x;
        const hvy = lower.velocity.y - chest.velocity.y;
        const hvz = lower.velocity.z - chest.velocity.z;
        const F = new CANNON.Vec3(
          mh * (w * w * (tx - hand.x) - 2 * w * hvx),
          mh * (w * w * (ty - hand.y) - 2 * w * hvy),
          mh * (w * w * (tz - hand.z) - 2 * w * hvz),
        );
        clampVec(F, gb ? 320 : 200);
        lower.applyForce(F, hand.vsub(lower.position));
        if (gb) chest.force.vsub(F.scale(0.6), chest.force);
        this.pullTo(upper, sh.x + ax * 0.16, sh.y + ay * 0.16, sh.z + az * 0.16, 10, chest.velocity);
      }
    }
  }

  pullTo(body, x, y, z, w, refVel) {
    const m = body.mass;
    body.force.x += m * (w * w * (x - body.position.x) - 2 * w * (body.velocity.x - refVel.x));
    body.force.y += m * (w * w * (y - body.position.y) - 2 * w * (body.velocity.y - refVel.y));
    body.force.z += m * (w * w * (z - body.position.z) - 2 * w * (body.velocity.z - refVel.z));
  }

  // world.step sonrası: elin değdiği şeye yapış
  tryGrab(contacts) {
    if (this.grabCd > 0) return;
    for (let side = 0; side < 2; side++) {
      const held = side === 0 ? this.input.gl : this.input.gr;
      if (!held || this.grab[side]) continue;
      const hand = this.bodies[side === 0 ? 4 : 6];
      for (const c of contacts) {
        let other, r;
        if (c.bi === hand) { other = c.bj; r = c.ri; }
        else if (c.bj === hand) { other = c.bi; r = c.rj; }
        else continue;
        if (other.ragdoll === this || other.noGrab) continue;
        const wp = hand.position.vadd(r);
        const pA = hand.pointToLocalFrame(wp);
        if (pA.y > -0.02) continue; // sadece el ucuyla tut
        const pB = other.pointToLocalFrame(wp);
        const con = new CANNON.PointToPointConstraint(hand, pA, other, pB, 3000);
        this.world.addConstraint(con);
        this.grab[side] = con;
        this.grabBody[side] = other;
        this.events.push('grab');
        break;
      }
    }
  }

  release(side) {
    if (this.grab[side]) {
      this.world.removeConstraint(this.grab[side]);
      this.grab[side] = null;
      this.grabBody[side] = null;
    }
  }

  // Başka bir ragdoll bu ragdoll'a tutunuyorsa bırak
  releaseFrom(ragdoll) {
    for (let s = 0; s < 2; s++) {
      if (this.grabBody[s] && this.grabBody[s].ragdoll === ragdoll) this.release(s);
    }
  }

  respawn(pos) {
    this.release(0); this.release(1);
    this.bodies.forEach((b, i) => {
      const p = PARTS[i].p;
      b.position.set(pos.x + p[0], pos.y + p[1] + 0.1, pos.z + p[2]);
      b.quaternion.set(0, 0, 0, 1);
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
    });
  }

  destroy() {
    this.release(0); this.release(1);
    this.constraints.forEach((c) => this.world.removeConstraint(c));
    this.bodies.forEach((b) => this.world.removeBody(b));
  }

  serialize() {
    const out = [];
    for (const b of this.bodies) {
      out.push(r3(b.position.x), r3(b.position.y), r3(b.position.z),
        r3(b.quaternion.x), r3(b.quaternion.y), r3(b.quaternion.z), r3(b.quaternion.w));
    }
    return out;
  }
}

export const r3 = (v) => Math.round(v * 1000) / 1000;

