// Arena: kokpitten mech kontrolü, antrenman botları ve online savaş.
import * as THREE from 'three';
import { tmesh, skyDome, addLights } from './toon.js';
import { PARTS, PALETTE, SLOTS, buildMech, randomDef, sanitizeDef, paintableMeshes } from './parts.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const GRAV = 26;
const BOUND = 58;
const RADIUS = 1.0;
const HEIGHT = 3.0;
const TMP = new THREE.Vector3();

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPAWNS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a) * 40, 0, Math.sin(a) * 40);
});

export class Arena {
  constructor(renderer, hooks) {
    this.renderer = renderer;
    this.hooks = hooks; // { menu() }
    this.scene = new THREE.Scene();
    this.scene.add(skyDome(0xbfd7ff, 0xffe0ec));
    this.scene.fog = new THREE.Fog(0xf3e6f5, 60, 170);
    this.sun = addLights(this.scene, 40);
    this.sun.shadow.normalBias = 0.06;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1000);
    this.obstacles = [];
    this.buildMap();
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);
    this.keys = new Set();
    this.firing = { armL: false, armR: false };
    this.running = false;
    this.bindInput();
  }

  // ---------- HARİTA ----------
  buildMap() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff4f7'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffe6ee'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(30, 30);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshToonMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    const rng = mulberry32(20261117);
    const addBox = (x, z, w, d, h, col, y0 = 0) => {
      const m = tmesh(new THREE.BoxGeometry(w, h, d), col, { paint: false, thick: 0.08 });
      m.position.set(x, y0 + h / 2, z);
      this.scene.add(m);
      const icing = tmesh(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), '#fffaf3', { paint: false, thick: 0.05 });
      icing.position.set(x, y0 + h + 0.1, z);
      this.scene.add(icing);
      this.obstacles.push({ min: new THREE.Vector3(x - w / 2, y0, z - d / 2), max: new THREE.Vector3(x + w / 2, y0 + h + 0.27, z + d / 2), mesh: m });
    };
    // Duvarlar
    const wallCol = '#d9ccf7';
    addBox(0, -BOUND - 1.5, BOUND * 2 + 6, 3, 4, wallCol);
    addBox(0, BOUND + 1.5, BOUND * 2 + 6, 3, 4, wallCol);
    addBox(-BOUND - 1.5, 0, 3, BOUND * 2, 4, wallCol);
    addBox(BOUND + 1.5, 0, 3, BOUND * 2, 4, wallCol);
    // Ortadaki kule
    addBox(0, 0, 7, 7, 5, '#ffb5c2');
    addBox(0, 0, 3.5, 3.5, 3, '#fdffb6', 5.27);
    // Rastgele bloklar (herkeste aynı tohum = aynı harita)
    let placed = 0;
    while (placed < 30) {
      const x = (rng() - 0.5) * 100;
      const z = (rng() - 0.5) * 100;
      const w = 3 + rng() * 6;
      const d = 3 + rng() * 6;
      const h = 1.5 + rng() * 5.5;
      if (Math.hypot(x, z) < 10) continue;
      if (SPAWNS.some((s) => Math.hypot(s.x - x, s.z - z) < 7 + Math.max(w, d) / 2)) continue;
      if (this.obstacles.some((o) => x + w / 2 + 2 > o.min.x && x - w / 2 - 2 < o.max.x && z + d / 2 + 2 > o.min.z && z - d / 2 - 2 < o.max.z)) continue;
      addBox(x, z, w, d, h, PALETTE[placed % 11]);
      placed++;
    }
    // Lolipop ağaçları
    for (let i = 0; i < 26; i++) {
      const x = (rng() - 0.5) * 108;
      const z = (rng() - 0.5) * 108;
      if (Math.hypot(x, z) < 8 || SPAWNS.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
      if (this.obstacles.some((o) => x + 2 > o.min.x && x - 2 < o.max.x && z + 2 > o.min.z && z - 2 < o.max.z)) continue;
      const trunk = tmesh(new THREE.CylinderGeometry(0.25, 0.3, 4, 10), '#fffaf3', { paint: false });
      trunk.position.set(x, 2, z);
      const top = tmesh(new THREE.SphereGeometry(1.4, 18, 12), PALETTE[(i * 3) % 11], { paint: false, thick: 0.06 });
      top.position.set(x, 4.6, z);
      this.scene.add(trunk, top);
      this.obstacles.push({ min: new THREE.Vector3(x - 0.35, 0, z - 0.35), max: new THREE.Vector3(x + 0.35, 6, z + 0.35), mesh: trunk });
    }
    // Bulutlar
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const s = tmesh(new THREE.SphereGeometry(2 + rng() * 1.5, 14, 10), '#ffffff', { paint: false, thick: 0.1 });
        s.position.set(j * 2.2, rng(), rng() * 1.5);
        s.castShadow = false;
        c.add(s);
      }
      c.position.set((rng() - 0.5) * 220, 28 + rng() * 15, (rng() - 0.5) * 220);
      this.scene.add(c);
    }
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // ---------- GİRDİ ----------
  bindInput() {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'KeyV' && !e.repeat) this.toggleView();
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.firing.armL = this.firing.armR = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.running || document.pointerLockElement !== canvas) return;
      this.me.yaw -= e.movementX * 0.0022;
      this.me.pitch = Math.max(-1.1, Math.min(1.1, this.me.pitch - e.movementY * 0.0022));
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.running) return;
      if (document.pointerLockElement !== canvas) { this.lock(); return; }
      if (e.button === 0) this.firing.armL = true;
      if (e.button === 2) this.firing.armR = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing.armL = false;
      if (e.button === 2) this.firing.armR = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (!this.running) return;
      const locked = document.pointerLockElement === canvas;
      $('pause').classList.toggle('hidden', locked);
      this.paused = !locked;
      if (!locked) { this.firing.armL = this.firing.armR = false; this.keys.clear(); }
    });
    $('resume-btn').onclick = () => { sfx.click(); this.lock(); };
    $('view-btn').onclick = () => { sfx.click(); this.toggleView(); };
    $('quit-btn').onclick = () => { sfx.click(); this.hooks.menu(); };
  }

  lock() {
    const c = this.renderer.domElement;
    try {
      const p = c.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {}
  }

  toggleView() {
    this.view = this.view === 'fp' ? 'tp' : 'fp';
    $('view-btn').textContent = 'Kamera: ' + (this.view === 'fp' ? 'Kokpit' : '3. Şahıs');
    $('cockpit').classList.toggle('off', this.view !== 'fp');
    if (this.me) this.me.parts.head.visible = this.view !== 'fp';
  }

  // ---------- BAŞLAT / BİTİR ----------
  start({ def, mode, net, name }) {
    this.mode = mode;
    this.net = net || null;
    this.running = true;
    this.paused = false;
    this.time = 0;
    this.view = 'tp';
    this.projectiles = [];
    this.particles = [];
    this.bots = [];
    this.remotes = new Map();
    this.kills = 0;
    this.myId = null;
    this.healAcc = 0;
    this.sendAcc = 0;

    const m = buildMech(def);
    this.dyn.add(m.root);
    const spawn = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    this.me = {
      root: m.root, parts: m.parts, stats: m.stats, def: m.def,
      pos: spawn.clone(), velY: 0, yaw: Math.atan2(-spawn.x, -spawn.z), pitch: 0,
      hp: m.stats.hp, maxHp: m.stats.hp, dead: false, fuel: 100, onGround: true,
      cd: { armL: 0, armR: 0 }, anim: 0, moving: 0, flying: false,
    };
    this.toggleView(); // kokpit görünümüyle başla

    $('hud').classList.remove('hidden');
    $('pause').classList.add('hidden');
    $('fuel-bar').classList.toggle('hidden', m.stats.ability !== 'fly');
    $('feed').innerHTML = '';
    $('center-msg').textContent = '';
    $('room-code').textContent = '';
    $('scoreboard').innerHTML = '';

    if (mode === 'training') {
      for (let i = 0; i < 3; i++) this.spawnBot(i);
      this.renderTrainingScore();
      this.flash('Antrenman! Botları vur 🎯', 2.5);
    } else {
      $('room-code').textContent = 'Oda: ' + net.code;
      this.unsub = net.on((msg) => this.onNet(msg));
      net.send({ t: 'join', name, mech: m.def, maxHp: m.stats.hp });
      this.flash(net.isHost ? 'Oda kuruldu! Kodu arkadaşına ver: ' + net.code : 'Savaşa hoş geldin!', 3);
    }
    this.lock();
    this.updateHud();
  }

  stop() {
    this.running = false;
    if (this.unsub) { this.unsub(); this.unsub = null; }
    if (this.net) { this.net.close(); this.net = null; }
    if (document.pointerLockElement) document.exitPointerLock();
    while (this.dyn.children.length) this.dyn.remove(this.dyn.children[0]);
    this.me = null;
    $('hud').classList.add('hidden');
  }

  // ---------- BOTLAR ----------
  spawnBot(i) {
    const def = randomDef();
    const names = ['Pamuk', 'Mochi', 'Bonbon', 'Lokum', 'Şeker', 'Puf'];
    def.name = 'Bot ' + names[Math.floor(Math.random() * names.length)];
    const m = buildMech(def);
    const sp = SPAWNS[(i * 3 + 2 + Math.floor(Math.random() * 3)) % SPAWNS.length].clone();
    const tag = makeTag(def.name);
    tag.position.y = 4.2;
    m.root.add(tag);
    this.dyn.add(m.root);
    const bot = {
      name: def.name, root: m.root, parts: m.parts, stats: m.stats, tag,
      pos: sp, velY: 0, yaw: 0, pitch: 0, hp: 90, maxHp: 90, dead: false, onGround: true,
      cd: 1 + Math.random(), wander: null, strafe: Math.random() < 0.5 ? 1 : -1, anim: Math.random() * 10, moving: 0, respawnT: 0,
    };
    updateTag(tag, bot.name, 1);
    this.bots.push(bot);
    return bot;
  }

  updateBot(b, dt) {
    if (b.dead) {
      b.respawnT -= dt;
      if (b.respawnT <= 0) {
        b.dead = false;
        b.hp = b.maxHp;
        b.pos.copy(SPAWNS[Math.floor(Math.random() * SPAWNS.length)]);
        b.root.visible = true;
        updateTag(b.tag, b.name, 1);
      }
      return;
    }
    const me = this.me;
    const dx = me.pos.x - b.pos.x;
    const dz = me.pos.z - b.pos.z;
    const dist = Math.hypot(dx, dz);
    let mx = 0, mz = 0;
    const speed = Math.min(7, b.stats.speed * 0.75);
    if (!me.dead && dist < 45) {
      b.yaw = Math.atan2(dx, dz);
      const fx = dx / dist, fz = dz / dist;
      const toward = dist > 18 ? 1 : dist < 10 ? -1 : 0;
      mx = fx * toward + -fz * b.strafe * 0.7;
      mz = fz * toward + fx * b.strafe * 0.7;
      if (Math.random() < dt * 0.4) b.strafe *= -1;
      b.cd -= dt;
      if (b.cd <= 0) {
        b.cd = 1.1 + Math.random() * 1.1;
        const slot = Math.random() < 0.5 ? 'armL' : 'armR';
        const w = b.stats.weapons[slot];
        b.root.updateMatrixWorld(true);
        const o = b.parts[slot].getObjectByName('muzzle').getWorldPosition(new THREE.Vector3());
        const target = me.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random(), (Math.random() - 0.5) * 3));
        const d = target.sub(o).normalize();
        b.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
        this.spawnProjectile(o, d, w, 'bot', w.dmg * 0.55);
      }
    } else {
      if (!b.wander || Math.hypot(b.wander.x - b.pos.x, b.wander.z - b.pos.z) < 3) {
        b.wander = new THREE.Vector3((Math.random() - 0.5) * 100, 0, (Math.random() - 0.5) * 100);
      }
      const wx = b.wander.x - b.pos.x, wz = b.wander.z - b.pos.z;
      const wl = Math.hypot(wx, wz) || 1;
      mx = wx / wl; mz = wz / wl;
      b.yaw = Math.atan2(wx, wz);
      b.pitch *= 0.95;
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) { mx /= ml; mz /= ml; }
    const ox = b.pos.x, oz = b.pos.z;
    this.moveBody(b, mx * speed * dt, mz * speed * dt, dt);
    if (Math.hypot(b.pos.x - ox, b.pos.z - oz) < speed * dt * 0.3 && ml > 0.01) {
      // takıldı: zıpla ya da yön değiştir
      if (b.onGround) b.velY = b.stats.jump;
      b.wander = null;
      b.strafe *= -1;
    }
    b.moving = ml > 0.01 ? 1 : 0;
  }

  // ---------- FİZİK ----------
  groundAt(pos, prevY) {
    let gh = 0;
    for (const o of this.obstacles) {
      if (pos.x + RADIUS * 0.6 > o.min.x && pos.x - RADIUS * 0.6 < o.max.x && pos.z + RADIUS * 0.6 > o.min.z && pos.z - RADIUS * 0.6 < o.max.z) {
        if (prevY >= o.max.y - 0.35 && o.max.y > gh) gh = o.max.y;
      }
    }
    return gh;
  }

  moveBody(b, dx, dz, dt) {
    b.pos.x += dx;
    b.pos.z += dz;
    for (const o of this.obstacles) {
      if (b.pos.y >= o.max.y - 0.3 || b.pos.y + HEIGHT <= o.min.y) continue;
      const cx = Math.max(o.min.x, Math.min(b.pos.x, o.max.x));
      const cz = Math.max(o.min.z, Math.min(b.pos.z, o.max.z));
      let ddx = b.pos.x - cx, ddz = b.pos.z - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          b.pos.x = cx + (ddx / d) * RADIUS;
          b.pos.z = cz + (ddz / d) * RADIUS;
        } else {
          // merkez kutunun içinde: en yakın kenara it
          const pens = [b.pos.x - o.min.x, o.max.x - b.pos.x, b.pos.z - o.min.z, o.max.z - b.pos.z];
          const i = pens.indexOf(Math.min(...pens));
          if (i === 0) b.pos.x = o.min.x - RADIUS; else if (i === 1) b.pos.x = o.max.x + RADIUS;
          else if (i === 2) b.pos.z = o.min.z - RADIUS; else b.pos.z = o.max.z + RADIUS;
        }
      }
    }
    b.pos.x = Math.max(-BOUND, Math.min(BOUND, b.pos.x));
    b.pos.z = Math.max(-BOUND, Math.min(BOUND, b.pos.z));
    const prevY = b.pos.y;
    b.velY -= GRAV * dt;
    b.pos.y += b.velY * dt;
    const gh = this.groundAt(b.pos, prevY);
    if (b.pos.y <= gh) {
      b.pos.y = gh;
      if (b.velY < -14 && b === this.me) sfx.jump();
      b.velY = 0;
      b.onGround = true;
    } else b.onGround = false;
  }

  // ---------- SİLAHLAR ----------
  aimPoint() {
    const origin = this.camera.position.clone();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    let best = 150;
    for (const o of this.obstacles) {
      const t = rayBox(origin, dir, o.min, o.max);
      if (t !== null && t > 0.5 && t < best) best = t;
    }
    if (dir.y < -0.001) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < best) best = t;
    }
    for (const t of this.targets()) {
      const c = t.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
      const tt = raySphere(origin, dir, c, 1.4);
      if (tt !== null && tt > 0.5 && tt < best) best = tt;
    }
    return origin.addScaledVector(dir, best);
  }

  targets() {
    if (this.mode === 'training') return this.bots.filter((b) => !b.dead);
    return [...this.remotes.values()].filter((r) => !r.dead);
  }

  fire(slot) {
    const me = this.me;
    const w = me.stats.weapons[slot];
    if (!w) return;
    me.cd[slot] = w.cd;
    me.root.updateMatrixWorld(true);
    const o = me.parts[slot].getObjectByName('muzzle').getWorldPosition(new THREE.Vector3());
    const d = this.aimPoint().sub(o).normalize();
    this.spawnProjectile(o, d, w, 'me', w.dmg * me.stats.dmg);
    sfx.shoot(w.size > 0.3);
    if (this.net) this.net.send({ t: 'shot', o: o.toArray().map(r2), d: d.toArray().map(r3), w: me.def.kit[slot] });
    // geri tepme
    const arm = me.parts[slot].getObjectByName('arm');
    if (arm) arm.position.z = -0.12;
  }

  spawnProjectile(origin, dir, w, owner, dmg) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(w.size, 12, 8),
      new THREE.MeshBasicMaterial({ color: w.color }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(w.size * 1.7, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    mesh.add(halo);
    mesh.position.copy(origin);
    this.dyn.add(mesh);
    this.projectiles.push({ mesh, vel: dir.clone().multiplyScalar(w.speed), life: 2.6, owner, dmg, color: w.color, size: w.size });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const steps = 2;
      let hit = false;
      for (let s = 0; s < steps && !hit; s++) {
        p.mesh.position.addScaledVector(p.vel, dt / steps);
        const pos = p.mesh.position;
        if (pos.y < 0) hit = true;
        for (const o of this.obstacles) {
          if (pos.x > o.min.x && pos.x < o.max.x && pos.y > o.min.y && pos.y < o.max.y && pos.z > o.min.z && pos.z < o.max.z) { hit = true; break; }
        }
        if (hit) break;
        if (p.owner === 'me') {
          for (const t of this.targets()) {
            if (inBody(pos, t.pos, p.size)) {
              hit = true;
              this.onMyHit(t, p.dmg);
              break;
            }
          }
        } else if (!this.me.dead && inBody(pos, this.me.pos, p.size)) {
          hit = true;
          if (p.owner === 'bot') this.damageMe(p.dmg);
        }
      }
      p.life -= dt;
      if (hit || p.life <= 0) {
        if (hit) this.burst(p.mesh.position, p.color, 8, 0.6);
        this.dyn.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  onMyHit(t, dmg) {
    sfx.hit();
    const hm = $('hitmark');
    hm.classList.add('on');
    clearTimeout(this.hmT);
    this.hmT = setTimeout(() => hm.classList.remove('on'), 90);
    if (this.mode === 'training') {
      t.hp -= dmg;
      updateTag(t.tag, t.name, Math.max(0, t.hp / t.maxHp));
      if (t.hp <= 0) {
        t.dead = true;
        t.respawnT = 4;
        t.root.visible = false;
        this.explode(t);
        this.kills++;
        this.feed(`💥 ${t.name} yok edildi!`);
        this.renderTrainingScore();
      }
    } else if (this.net) {
      this.net.send({ t: 'hit', target: t.id, dmg: Math.round(dmg) });
    }
  }

  damageMe(dmg) {
    const me = this.me;
    if (me.dead) return;
    me.hp = Math.max(0, me.hp - dmg);
    this.hurtFx();
    if (me.hp <= 0) {
      this.die();
      setTimeout(() => { if (this.running) this.respawn(); }, 3500);
    }
  }

  hurtFx() {
    sfx.hurt();
    const f = $('dmg-flash');
    f.classList.add('on');
    clearTimeout(this.dfT);
    this.dfT = setTimeout(() => f.classList.remove('on'), 120);
  }

  die() {
    const me = this.me;
    me.dead = true;
    me.root.visible = false;
    this.explode(me);
    this.flash('Yok edildin! 💫 Yeniden doğuyorsun...', 3.5);
  }

  respawn() {
    const me = this.me;
    if (!me) return;
    me.dead = false;
    me.hp = me.maxHp;
    me.fuel = 100;
    me.velY = 0;
    me.pos.copy(SPAWNS[Math.floor(Math.random() * SPAWNS.length)]);
    me.yaw = Math.atan2(-me.pos.x, -me.pos.z);
    me.root.visible = true;
    this.flash('', 0);
  }

  // ---------- EFEKTLER ----------
  burst(pos, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? color : '#ffffff', transparent: true }));
      m.position.copy(pos);
      this.dyn.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (4 + Math.random() * 4));
      this.particles.push({ mesh: m, vel: v, life: 0.5, max: 0.5, grav: 6 });
    }
  }

  explode(ent) {
    sfx.boom();
    const cols = [];
    for (const slot of SLOTS) for (const m of paintableMeshes(ent.parts[slot])) cols.push('#' + m.material.color.getHexString());
    for (let i = 0; i < 26; i++) {
      const s = 0.2 + Math.random() * 0.35;
      const m = tmesh(new THREE.BoxGeometry(s, s, s), cols[i % cols.length] || PALETTE[i % 11], { paint: false, thick: 0.03 });
      m.position.copy(ent.pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5));
      this.dyn.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 8, (Math.random() - 0.5) * 12);
      this.particles.push({ mesh: m, vel: v, life: 1.6, max: 1.6, grav: GRAV, spin: true });
    }
    this.burst(ent.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), '#ffd6a5', 18, 1.4);
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.15) { p.mesh.position.y = 0.15; p.vel.multiplyScalar(0.5); p.vel.y = Math.abs(p.vel.y) * 0.4; }
      if (p.spin) { p.mesh.rotation.x += dt * 8; p.mesh.rotation.z += dt * 6; }
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      if (p.mesh.material.transparent) p.mesh.material.opacity = k;
      else if (k < 0.3) p.mesh.scale.setScalar(k / 0.3);
      if (p.life <= 0) { this.dyn.remove(p.mesh); this.particles.splice(i, 1); }
    }
  }

  // ---------- AĞ ----------
  addRemote(info) {
    if (this.remotes.has(info.id) || info.id === this.myId) return;
    const def = sanitizeDef(info.mech);
    const m = buildMech(def);
    const name = String(info.name || 'Pilot').slice(0, 16);
    const tag = makeTag(name);
    tag.position.y = 4.2;
    m.root.add(tag);
    this.dyn.add(m.root);
    const r = {
      id: info.id, name, root: m.root, parts: m.parts, def, tag,
      pos: new THREE.Vector3(0, -50, 0), target: null, yaw: 0, tyaw: 0, pitch: 0,
      hp: info.hp || 100, maxHp: info.maxHp || 100, dead: !!info.dead, anim: 0, moving: 0, flying: false,
    };
    updateTag(tag, name, r.hp / r.maxHp);
    r.root.visible = !r.dead;
    this.remotes.set(info.id, r);
    if (info.state) this.applyState(r, info.state, true);
  }

  applyState(r, s, snap) {
    if (!s || !Array.isArray(s.p)) return;
    r.target = new THREE.Vector3(+s.p[0] || 0, +s.p[1] || 0, +s.p[2] || 0);
    r.tyaw = +s.y || 0;
    r.pitch = +s.pi || 0;
    r.moving = s.mv ? 1 : 0;
    r.flying = !!s.f;
    if (snap || r.pos.y < -10) { r.pos.copy(r.target); r.yaw = r.tyaw; }
  }

  onNet(m) {
    if (!this.running || !m) return;
    switch (m.t) {
      case 'welcome':
        this.myId = m.id;
        for (const p of m.players || []) this.addRemote(p);
        break;
      case 'joined':
        this.addRemote(m);
        this.feed(`👋 ${String(m.name).slice(0, 16)} katıldı`);
        break;
      case 'left': {
        const r = this.remotes.get(m.id);
        if (r) { this.dyn.remove(r.root); this.remotes.delete(m.id); this.feed(`🚪 ${r.name} ayrıldı`); }
        break;
      }
      case 'state': {
        const r = this.remotes.get(m.id);
        if (r) this.applyState(r, m.s);
        break;
      }
      case 'shot': {
        const part = PARTS[m.w];
        if (!part || !part.weapon || !Array.isArray(m.o) || !Array.isArray(m.d)) break;
        const d = new THREE.Vector3().fromArray(m.d.map(Number));
        if (d.lengthSq() < 0.01) break;
        this.spawnProjectile(new THREE.Vector3().fromArray(m.o.map(Number)), d.normalize(), part.weapon, 'remote', 0);
        const r = this.remotes.get(m.id);
        if (r && r.pos.distanceTo(this.me.pos) < 40) sfx.shoot(part.weapon.size > 0.3);
        break;
      }
      case 'hp':
        if (m.id === this.myId) {
          if (m.hp < this.me.hp) this.hurtFx();
          this.me.hp = m.hp;
        } else {
          const r = this.remotes.get(m.id);
          if (r) { r.hp = m.hp; updateTag(r.tag, r.name, r.hp / r.maxHp); }
        }
        break;
      case 'kill': {
        const kn = String(m.kname).slice(0, 16), vn = String(m.vname).slice(0, 16);
        this.feed(`💥 ${kn} ➜ ${vn}`);
        if (m.victim === this.myId) this.die();
        else {
          const r = this.remotes.get(m.victim);
          if (r) { r.dead = true; r.root.visible = false; this.explode(r); }
        }
        if (m.killer === this.myId) { sfx.win(); this.flash(`${vn} yok edildi! ⭐`, 1.6); }
        break;
      }
      case 'respawn':
        if (m.id === this.myId) this.respawn();
        else {
          const r = this.remotes.get(m.id);
          if (r) { r.dead = false; r.hp = m.hp; r.root.visible = true; updateTag(r.tag, r.name, 1); r.pos.y = -50; }
        }
        break;
      case 'scores':
        this.renderScores(m.scores || []);
        break;
      case 'disconnected':
        this.flash('Ev sahibiyle bağlantı koptu 😢', 3);
        setTimeout(() => { if (this.running) this.hooks.menu(); }, 2500);
        break;
      case 'neterror':
        this.feed('⚠️ ' + m.text);
        break;
    }
  }

  renderScores(list) {
    const el = $('scoreboard');
    el.innerHTML = '';
    const h = document.createElement('div');
    h.innerHTML = '<b>Pilot</b><b>Skor</b>';
    el.appendChild(h);
    for (const s of [...list].sort((a, b) => b.score - a.score)) {
      const row = document.createElement('div');
      if (s.id === this.myId) row.className = 'me';
      const a = document.createElement('span'); a.textContent = String(s.name).slice(0, 16);
      const b = document.createElement('span'); b.textContent = s.score;
      row.append(a, b);
      el.appendChild(row);
    }
  }

  renderTrainingScore() {
    const el = $('scoreboard');
    el.innerHTML = '';
    const row = document.createElement('div');
    const a = document.createElement('span'); a.textContent = '🎯 Vurulan bot';
    const b = document.createElement('b'); b.textContent = this.kills;
    row.append(a, b);
    el.appendChild(row);
  }

  feed(text) {
    const el = $('feed');
    const d = document.createElement('div');
    d.textContent = text;
    el.appendChild(d);
    while (el.children.length > 5) el.removeChild(el.firstChild);
    setTimeout(() => d.remove(), 5000);
  }

  flash(text, secs) {
    const el = $('center-msg');
    el.textContent = text;
    clearTimeout(this.flT);
    if (secs > 0) this.flT = setTimeout(() => { el.textContent = ''; }, secs * 1000);
  }

  updateHud() {
    const me = this.me;
    $('hp-fill').style.width = (100 * me.hp / me.maxHp).toFixed(1) + '%';
    $('hp-text').textContent = Math.ceil(me.hp) + '/' + me.maxHp;
    $('fuel-fill').style.width = me.fuel.toFixed(0) + '%';
  }

  // ---------- GÜNCELLEME ----------
  update(dt) {
    if (!this.running) return;
    this.time += dt;
    const me = this.me;
    const frozen = this.paused && this.mode === 'training';
    if (!frozen) {
      if (!me.dead) this.updateMe(dt);
      if (this.mode === 'training') for (const b of this.bots) this.updateBot(b, dt);
      for (const r of this.remotes.values()) {
        if (!r.target) continue;
        const k = 1 - Math.exp(-14 * dt);
        r.pos.lerp(r.target, k);
        let dy = r.tyaw - r.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        r.yaw += dy * k;
      }
      this.updateProjectiles(dt);
      this.updateParticles(dt);
    }
    // görsel eşitleme
    this.pose(me, dt);
    for (const b of this.bots) this.pose(b, dt);
    for (const r of this.remotes.values()) this.pose(r, dt);
    this.updateCamera();
    this.sun.position.set(me.pos.x + 15, 30, me.pos.z + 12);
    this.sun.target.position.set(me.pos.x, 0, me.pos.z);

    // ağ
    if (this.net) {
      this.sendAcc += dt;
      if (this.sendAcc > 0.05) {
        this.sendAcc = 0;
        this.net.send({ t: 'state', s: { p: me.pos.toArray().map(r2), y: r3(me.yaw), pi: r3(me.pitch), mv: me.moving, f: me.flying ? 1 : 0 } });
      }
    }
    this.updateHud();
  }

  updateMe(dt) {
    const me = this.me;
    const st = me.stats;
    let ix = 0, iz = 0;
    if (!this.paused) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz -= 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    }
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
    const rx = -fz, rz = fx;
    let mx = fx * iz + rx * ix;
    let mz = fz * iz + rz * ix;
    const l = Math.hypot(mx, mz);
    if (l > 0) { mx /= l; mz /= l; }
    const speed = st.speed * (this.keys.has('ShiftLeft') ? 1.35 : 1);
    me.moving = l > 0 ? 1 : 0;

    const space = this.keys.has('Space') && !this.paused;
    me.flying = false;
    if (space && me.onGround && !me.jumpHeld) {
      me.velY = st.jump;
      me.onGround = false;
      sfx.jump();
    } else if (space && !me.onGround) {
      if (st.ability === 'fly' && me.fuel > 0 && me.velY < 8) {
        me.velY = Math.min(8, me.velY + 42 * dt);
        me.fuel = Math.max(0, me.fuel - 32 * dt);
        me.flying = true;
      } else if (st.ability === 'glide' && me.velY < -2.5) {
        me.velY = -2.5;
      }
    }
    me.jumpHeld = space;
    if (me.onGround) me.fuel = Math.min(100, me.fuel + 28 * dt);
    this.moveBody(me, mx * speed * dt, mz * speed * dt, dt);

    if (st.ability === 'regen' && me.hp < me.maxHp) {
      if (this.mode === 'training') me.hp = Math.min(me.maxHp, me.hp + 3 * dt);
      else {
        this.healAcc += 3 * dt;
        if (this.healAcc >= 3) { this.net.send({ t: 'heal', amount: Math.floor(this.healAcc) }); this.healAcc = 0; }
      }
    }

    for (const slot of ['armL', 'armR']) {
      me.cd[slot] -= dt;
      if (this.firing[slot] && me.cd[slot] <= 0 && !this.paused) this.fire(slot);
    }
  }

  pose(e, dt) {
    e.root.position.copy(e.pos);
    e.root.rotation.y = e.yaw;
    e.anim += dt * (e.moving ? 9 : 0);
    const sw = Math.sin(e.anim) * 0.6 * e.moving;
    const p = e.parts;
    const lL = p.legs.getObjectByName('legL'), lR = p.legs.getObjectByName('legR');
    if (lL) { lL.rotation.x = sw; lR.rotation.x = -sw; }
    const sL = p.legs.getObjectByName('springL'), sR = p.legs.getObjectByName('springR');
    if (sL) { const k = 1 + Math.sin(e.anim * 1.3) * 0.15 * e.moving; sL.scale.y = k; sR.scale.y = 2 - k; }
    p.torso.position.y = 1.75 + Math.abs(Math.sin(e.anim)) * 0.06 * e.moving;
    for (const slot of ['armL', 'armR']) {
      const arm = p[slot].getObjectByName('arm');
      if (!arm) continue;
      arm.rotation.x = -e.pitch;
      arm.position.z += (0 - arm.position.z) * Math.min(1, dt * 12);
    }
    const flame = p.back.getObjectByName('flame');
    if (flame) {
      flame.visible = !!e.flying;
      if (e.flying) flame.scale.y = 0.8 + Math.random() * 0.5;
    }
    if (e.tag) e.tag.visible = !e.dead;
  }

  updateCamera() {
    const me = this.me;
    const cam = this.camera;
    const dir = new THREE.Vector3(Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), Math.cos(me.yaw) * Math.cos(me.pitch));
    if (this.view === 'fp' && !me.dead) {
      const off = new THREE.Vector3(0, 2.62, 0.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), me.yaw);
      cam.position.copy(me.pos).add(off);
      cam.lookAt(TMP.copy(cam.position).add(dir));
    } else {
      const head = me.pos.clone().add(new THREE.Vector3(0, 2.6, 0));
      cam.position.copy(head).addScaledVector(dir, -7.5).add(new THREE.Vector3(0, 1.2, 0));
      cam.position.y = Math.max(0.6, cam.position.y);
      cam.lookAt(TMP.copy(head).addScaledVector(dir, 10));
    }
  }
}

// ---------- YARDIMCILAR ----------
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }

function inBody(pos, base, size) {
  const dx = pos.x - base.x, dz = pos.z - base.z;
  const r = RADIUS + size;
  return dx * dx + dz * dz < r * r && pos.y > base.y && pos.y < base.y + HEIGHT + 0.6;
}

function rayBox(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      let t1 = (min[a] - o[a]) / d[a];
      let t2 = (max[a] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin >= 0 ? tmin : null;
}

function raySphere(o, d, c, r) {
  const oc = o.clone().sub(c);
  const b = oc.dot(d);
  const cc = oc.lengthSq() - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}

function makeTag(name) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 72;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sp.scale.set(2.6, 0.73, 1);
  sp.userData.cv = cv;
  sp.userData.tex = tex;
  sp.raycast = () => {};
  return sp;
}

function updateTag(sp, name, frac) {
  const cv = sp.userData.cv;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.font = 'bold 28px Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 6;
  g.strokeStyle = '#6b5672';
  g.fillStyle = '#ffffff';
  g.strokeText(name, 128, 32);
  g.fillText(name, 128, 32);
  g.fillStyle = '#6b5672';
  roundRect(g, 38, 44, 180, 20, 9); g.fill();
  g.fillStyle = '#ffffff';
  roundRect(g, 42, 48, 172, 12, 6); g.fill();
  g.fillStyle = frac > 0.5 ? '#9be8a8' : frac > 0.25 ? '#ffd6a5' : '#ff8fa6';
  if (frac > 0) { roundRect(g, 42, 48, Math.max(12, 172 * frac), 12, 6); g.fill(); }
  sp.userData.tex.needsUpdate = true;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
