// Atölye: kit seç → parçaları kopar → birleştir → boya → bitir. Ayrıca menü vitrini.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { tmesh, skyDome, addLights } from './toon.js';
import {
  PARTS, SLOTS, SLOT_NAMES, ANCHORS, PALETTE, DEFAULT_KIT,
  partsForSlot, buildPart, buildMech, computeStats, readColors, paintableMeshes, sanitizeDef,
} from './parts.js';
import { sfx } from './audio.js';

const STEPS = [
  ['kit', 'Kit Seç'], ['snip', 'Kopar'], ['build', 'Birleştir'], ['paint', 'Boya'], ['finish', 'Bitir'],
];
const NEEDS = { legs: null, torso: 'legs', head: 'torso', armL: 'torso', armR: 'torso', back: 'torso' };
const PED_Y = 0.3;
const RZ = -2.2; // çerçevenin derinliği
const TRAY_Z = 2.6;
const TRAY_FIT = 1.05;
const CAMS = {
  show:   { pos: [0.6, 3.4, 9.5],  tgt: [-2.3, 1.9, 0] },
  kit:    { pos: [-0.2, 3.6, 9.5], tgt: [-1.3, 1.9, 0] },
  snip:   { pos: [0, 4.4, 13.2],   tgt: [0, 2.3, 0] },
  build:  { pos: [0, 5.4, 11.6],   tgt: [0, 1.5, 0.9] },
  paint:  { pos: [-0.4, 3.2, 7.6], tgt: [-1.1, 1.7, 0] },
  finish: { pos: [-0.4, 3.2, 7.6], tgt: [-1.1, 1.7, 0] },
};
const ease = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const $ = (id) => document.getElementById(id);

export class Workshop {
  constructor(renderer, hooks) {
    this.renderer = renderer;
    this.hooks = hooks; // { save(def), play(def, mode), menu() }
    this.scene = new THREE.Scene();
    this.scene.add(skyDome(0xd7cbff, 0xffe6dc));
    addLights(this.scene, 14);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 18;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enabled = false;

    this.buildEnvironment();
    this.mechRoot = new THREE.Group();
    this.mechRoot.position.y = PED_Y;
    this.scene.add(this.mechRoot);
    this.temp = new THREE.Group(); // adıma özel nesneler
    this.scene.add(this.temp);

    this.tweens = [];
    this.confetti = [];
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hovered = null;
    this.mode = 'show';
    this.time = 0;
    this.paintColor = PALETTE[0];
    this.setCam('show', true);

    $('ws-back').onclick = () => { sfx.click(); this.hooks.menu(); };
    $('ws-next').onclick = () => { sfx.click(); this.next(); };
  }

  buildEnvironment() {
    const table = tmesh(new THREE.CylinderGeometry(10, 10.3, 0.5, 64), '#ffe8ef', { paint: false, thick: 0.06 });
    table.position.y = -0.25;
    this.scene.add(table);
    const ring = tmesh(new THREE.TorusGeometry(10.1, 0.12, 10, 80), '#bdb2ff', { paint: false, thick: 0.03 });
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    const ped = tmesh(new THREE.CylinderGeometry(1.7, 1.85, PED_Y, 40), '#fffaf3', { paint: false });
    ped.position.y = PED_Y / 2;
    this.scene.add(ped);
    const pedRing = tmesh(new THREE.TorusGeometry(1.78, 0.06, 8, 48), '#ffb5c2', { paint: false, thick: 0.02 });
    pedRing.rotation.x = Math.PI / 2;
    pedRing.position.y = PED_Y;
    this.scene.add(pedRing);
    // Dekor: arka planda yüzen pastel şekiller
    this.floaters = [];
    const shapes = [new THREE.IcosahedronGeometry(0.6, 0), new THREE.TorusGeometry(0.5, 0.18, 8, 20), new THREE.OctahedronGeometry(0.6)];
    for (let i = 0; i < 9; i++) {
      const m = tmesh(shapes[i % 3], PALETTE[(i * 2) % 11], { paint: false });
      const a = (i / 9) * Math.PI * 1.2 + Math.PI * 0.9;
      m.position.set(Math.cos(a) * 14, 3 + (i % 3) * 2, Math.sin(a) * 14 - 4);
      m.userData.phase = i;
      this.scene.add(m);
      this.floaters.push(m);
    }
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  setCam(name, instant = false) {
    const c = CAMS[name];
    const p1 = new THREE.Vector3(...c.pos);
    const t1 = new THREE.Vector3(...c.tgt);
    if (instant) {
      this.camera.position.copy(p1);
      this.controls.target.copy(t1);
      this.camera.lookAt(t1);
      return;
    }
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    this.tween(0.8, (t) => {
      const e = ease(t);
      this.camera.position.lerpVectors(p0, p1, e);
      this.controls.target.lerpVectors(t0, t1, e);
    });
  }

  tween(dur, fn, done) { this.tweens.push({ t: 0, dur, fn, done }); }

  clearMech() {
    while (this.mechRoot.children.length) this.mechRoot.remove(this.mechRoot.children[0]);
    this.mechParts = {};
  }
  clearTemp() {
    while (this.temp.children.length) this.temp.remove(this.temp.children[0]);
  }
  placeMech(def) {
    this.clearMech();
    const { root, parts } = buildMech(def);
    for (const slot of SLOTS) {
      this.mechRoot.add(parts[slot]);
      this.mechParts[slot] = parts[slot];
    }
    root.clear();
  }

  // ---------- MODLAR ----------
  showcase(def) {
    this.mode = 'show';
    this.clearTemp();
    this.placeMech(def);
    this.mechRoot.rotation.y = 0.5;
    this.controls.enabled = false;
    this.setCam('show');
  }

  startNew() {
    this.kit = { ...DEFAULT_KIT };
    this.colors = {};
    this.name = '';
    this.editingId = null;
    this.mechRoot.rotation.y = 0;
    this.controls.enabled = true;
    this.goStep('kit');
  }

  startEdit(def) {
    const d = sanitizeDef(def);
    this.kit = { ...d.kit };
    this.colors = d.colors;
    this.name = d.name;
    this.editingId = def.id || null;
    this.mechRoot.rotation.y = 0;
    this.controls.enabled = true;
    this.placeMech(d);
    this.done = new Set(['kit', 'snip', 'build']);
    this.goStep('paint', true);
  }

  goStep(step, keepMech = false) {
    this.step = step;
    this.mode = step;
    this.selected = null;
    this.clearTemp();
    if (step === 'kit') this.done = new Set();
    this.renderSteps();
    $('ws-panel').innerHTML = '';
    $('ws-hint').textContent = '';
    const next = $('ws-next');
    next.disabled = false;
    next.textContent = 'İleri →';
    next.onclick = () => { sfx.click(); this.next(); };
    this.setCam(step);
    if (step === 'kit') this.enterKit();
    else if (step === 'snip') this.enterSnip();
    else if (step === 'build') this.enterBuild();
    else if (step === 'paint') this.enterPaint(keepMech);
    else if (step === 'finish') this.enterFinish();
  }

  next() {
    const idx = STEPS.findIndex(([k]) => k === this.step);
    this.done.add(this.step);
    if (idx < STEPS.length - 1) this.goStep(STEPS[idx + 1][0]);
  }

  renderSteps() {
    const el = $('steps');
    el.innerHTML = '';
    for (const [k, label] of STEPS) {
      const d = document.createElement('div');
      d.textContent = label;
      if (k === this.step) d.className = 'on';
      else if (this.done && this.done.has(k)) d.className = 'done';
      el.appendChild(d);
    }
  }

  // ---------- 1) KİT SEÇ ----------
  enterKit() {
    this.placeMech({ kit: this.kit, colors: {} });
    $('ws-hint').textContent = 'Her bölüm için bir parça seç. Kutudaki kit buna göre hazırlanacak!';
    const panel = $('ws-panel');
    const h = document.createElement('h3');
    h.textContent = 'Kit Seçimi';
    panel.appendChild(h);
    for (const slot of SLOTS) {
      const grp = document.createElement('div');
      grp.className = 'slot-group';
      const t = document.createElement('h4');
      t.textContent = SLOT_NAMES[slot];
      grp.appendChild(t);
      const ch = document.createElement('div');
      ch.className = 'choices';
      for (const id of partsForSlot(slot)) {
        const b = document.createElement('button');
        b.className = 'choice' + (this.kit[slot] === id ? ' sel' : '');
        b.innerHTML = '';
        b.append(PARTS[id].name);
        const sm = document.createElement('small');
        sm.textContent = PARTS[id].desc;
        b.appendChild(sm);
        b.onclick = () => {
          sfx.click();
          this.kit[slot] = id;
          [...ch.children].forEach((c) => c.classList.remove('sel'));
          b.classList.add('sel');
          this.placeMech({ kit: this.kit, colors: {} });
          const p = this.mechParts[slot];
          p.scale.setScalar(0.6);
          this.tween(0.35, (tt) => p.scale.setScalar(0.6 + 0.4 * easeBack(tt)));
          this.renderStatsInto(statsBox);
        };
        ch.appendChild(b);
      }
      grp.appendChild(ch);
      panel.appendChild(grp);
    }
    const statsBox = document.createElement('div');
    panel.appendChild(statsBox);
    this.renderStatsInto(statsBox);
  }

  renderStatsInto(el) {
    const st = computeStats(this.kit);
    const ab = { fly: 'Uçuş', regen: 'Tamir', glide: 'Süzülme' }[st.ability] || '-';
    el.className = 'stats';
    el.innerHTML = '';
    const rows = [['Can', st.hp], ['Hız', st.speed.toFixed(1)], ['Zıplama', st.jump], ['Hasar', '×' + st.dmg.toFixed(2)], ['Yetenek', ab]];
    for (const [k, v] of rows) {
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      el.append(a, b);
    }
  }

  // ---------- 2) KOPAR ----------
  enterSnip() {
    this.clearMech();
    this.done.add('kit');
    $('ws-next').disabled = true;
    $('ws-hint').textContent = 'Parçalara tıklayarak plastik çerçeveden kopar! ✂️';
    const frameCol = '#d6d0dc';
    const bar = (len, x, y, vertical) => {
      const m = tmesh(new THREE.CylinderGeometry(0.075, 0.075, len, 10), frameCol, { paint: false, thick: 0.02 });
      m.position.set(x, y, RZ);
      if (!vertical) m.rotation.z = Math.PI / 2;
      this.temp.add(m);
    };
    const Y = 2.9;
    bar(7.3, 0, Y + 2.3, false); bar(7.3, 0, Y - 2.3, false); bar(7.3, 0, Y, false);
    bar(4.6, -3.6, Y, true); bar(4.6, 3.6, Y, true); bar(4.6, -1.2, Y, true); bar(4.6, 1.2, Y, true);
    // Kit etiketi
    const tag = tmesh(new THREE.BoxGeometry(1.4, 0.5, 0.1), '#ffb5c2', { paint: false, thick: 0.02 });
    tag.position.set(-3.6, Y + 2.65, RZ);
    this.temp.add(tag);

    // Tepsi
    const shelf = tmesh(new THREE.BoxGeometry(9.6, 0.16, 1.3), '#caffbf', { paint: false });
    shelf.position.set(0, 0.42, TRAY_Z);
    this.temp.add(shelf);

    this.runner = {};
    this.trayPos = {};
    SLOTS.forEach((slot, i) => {
      const cx = [-2.4, 0, 2.4][i % 3];
      const cy = Y + (i < 3 ? 1.15 : -1.15);
      const part = buildPart(slot, this.kit[slot]);
      const inner = new THREE.Group();
      inner.add(part);
      if (slot === 'armL' || slot === 'armR') inner.rotation.y = slot === 'armL' ? -Math.PI / 2 : Math.PI / 2;
      inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const holderInner = new THREE.Group();
      holderInner.add(inner);
      inner.position.sub(center);
      const outer = new THREE.Group();
      outer.add(holderInner);
      const k = Math.min(1.75 / size.x, 1.75 / size.y, 1.75 / size.z);
      outer.scale.setScalar(k);
      outer.position.set(cx, cy, RZ);
      outer.traverse((o) => { if (o.isMesh) o.userData.runnerSlot = slot; });
      this.temp.add(outer);
      const gates = [];
      const halfW = (size.x * k) / 2;
      for (const s of [1, -1]) {
        const len = Math.max(0.08, 1.2 - halfW);
        const gm = tmesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), frameCol, { paint: false, thick: 0.015 });
        gm.rotation.z = Math.PI / 2;
        gm.position.set(cx + s * (halfW + len / 2), cy, RZ);
        gm.userData.runnerSlot = slot;
        this.temp.add(gm);
        gates.push(gm);
      }
      this.runner[slot] = { outer, gates, k, size, snipped: false };
      const tx = -3.9 + i * 1.56;
      this.trayPos[slot] = new THREE.Vector3(tx, 1.05, TRAY_Z);
    });
    this.snippedCount = 0;
  }

  snip(slot) {
    const r = this.runner[slot];
    if (!r || r.snipped) return;
    r.snipped = true;
    sfx.snip();
    for (const g of r.gates) {
      const y0 = g.position.y;
      this.tween(0.5, (t) => { g.position.y = y0 - t * t * 3; g.rotation.x = t * 4; g.scale.setScalar(1 - t); }, () => this.temp.remove(g));
    }
    const o = r.outer;
    const p0 = o.position.clone();
    const mid = p0.clone().add(new THREE.Vector3(0, 0.6, 1.5));
    const p1 = this.trayPos[slot];
    const k0 = r.k;
    const k1 = Math.min(TRAY_FIT / r.size.x, TRAY_FIT / r.size.y, TRAY_FIT / r.size.z);
    this.tween(0.7, (t) => {
      const e = ease(t);
      const a = p0.clone().lerp(mid, e);
      const b = mid.clone().lerp(p1, e);
      o.position.lerpVectors(a, b, e);
      o.rotation.y = Math.sin(t * Math.PI) * 0.8;
      o.scale.setScalar(k0 + (k1 - k0) * e);
    }, () => { o.rotation.y = 0; });
    this.snippedCount++;
    if (this.snippedCount === SLOTS.length) {
      $('ws-hint').textContent = 'Hepsi koptu! Şimdi birleştirme zamanı.';
      $('ws-next').disabled = false;
      setTimeout(() => { if (this.step === 'snip') { sfx.win(); this.next(); } }, 900);
    }
  }

  // ---------- 3) BİRLEŞTİR ----------
  enterBuild() {
    this.clearMech();
    $('ws-next').disabled = true;
    const shelf = tmesh(new THREE.BoxGeometry(9.6, 0.16, 1.3), '#caffbf', { paint: false });
    shelf.position.set(0, 0.42, TRAY_Z);
    this.temp.add(shelf);
    if (!this.trayPos) {
      this.trayPos = {};
      SLOTS.forEach((s, i) => { this.trayPos[s] = new THREE.Vector3(-3.9 + i * 1.56, 1.05, TRAY_Z); });
    }
    this.tray = {};
    this.ghosts = {};
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    for (const slot of SLOTS) {
      // tepsideki parça
      const part = buildPart(slot, this.kit[slot]);
      const inner = new THREE.Group();
      inner.add(part);
      if (slot === 'armL' || slot === 'armR') inner.rotation.y = slot === 'armL' ? -Math.PI / 2 : Math.PI / 2;
      inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      inner.position.sub(box.getCenter(new THREE.Vector3()));
      const outer = new THREE.Group();
      outer.add(inner);
      outer.scale.setScalar(Math.min(TRAY_FIT / size.x, TRAY_FIT / size.y, TRAY_FIT / size.z));
      outer.position.copy(this.trayPos[slot]);
      outer.traverse((o) => { if (o.isMesh) o.userData.traySlot = slot; });
      this.temp.add(outer);
      this.tray[slot] = outer;

      // hayalet
      const ghost = buildPart(slot, this.kit[slot]);
      const outlines = [];
      ghost.traverse((o) => {
        if (o.isMesh) {
          if (o.userData.outline) outlines.push(o);
          else { o.material = ghostMat.clone(); o.userData.ghostSlot = slot; o.castShadow = false; }
        }
      });
      outlines.forEach((o) => o.parent.remove(o));
      ghost.position.fromArray(ANCHORS[slot]);
      ghost.position.y += PED_Y;
      ghost.visible = NEEDS[slot] === null;
      this.temp.add(ghost);
      this.ghosts[slot] = ghost;
    }
    this.placed = new Set();
    $('ws-hint').textContent = 'Tepsiden bir parça seç, sonra parlayan hayalet yerine tıkla. Önce bacaklar!';
  }

  selectTray(slot) {
    if (this.placed.has(slot)) return;
    sfx.click();
    this.selected = slot;
    const need = NEEDS[slot];
    if (need && !this.placed.has(need)) $('ws-hint').textContent = `Önce ${SLOT_NAMES[need].toLowerCase()} takılmalı!`;
    else $('ws-hint').textContent = `${PARTS[this.kit[slot]].name} seçildi → parlayan yerine tıkla.`;
  }

  tryAttach(slot) {
    if (this.placed.has(slot)) return;
    if (this.selected && this.selected !== slot) {
      sfx.wrong();
      $('ws-hint').textContent = 'Bu parça oraya uymuyor! 🙅';
      const o = this.tray[this.selected];
      const x0 = this.trayPos[this.selected].x;
      this.tween(0.35, (t) => { o.position.x = x0 + Math.sin(t * 30) * 0.12 * (1 - t); });
      return;
    }
    const need = NEEDS[slot];
    if (need && !this.placed.has(need)) { sfx.wrong(); return; }
    const trayObj = this.tray[slot];
    const start = trayObj.position.clone().sub(this.mechRoot.position);
    this.temp.remove(trayObj);
    const ghost = this.ghosts[slot];
    ghost.visible = false;
    const part = buildPart(slot, this.kit[slot]);
    const end = new THREE.Vector3().fromArray(ANCHORS[slot]);
    part.position.copy(start);
    part.scale.setScalar(0.4);
    this.mechRoot.add(part);
    this.mechParts[slot] = part;
    this.placed.add(slot);
    this.selected = null;
    const top = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 1.5, 0));
    this.tween(0.5, (t) => {
      const e = ease(t);
      const a = start.clone().lerp(top, e);
      const b = top.clone().lerp(end, e);
      part.position.lerpVectors(a, b, e);
      part.scale.setScalar(0.4 + 0.6 * easeBack(t));
    }, () => {
      part.position.copy(end);
      part.scale.setScalar(1);
      sfx.snap();
      this.puff(end.clone().add(this.mechRoot.position));
    });
    for (const s of SLOTS) if (!this.placed.has(s) && NEEDS[s] && this.placed.has(NEEDS[s])) this.ghosts[s].visible = true;
    if (this.placed.size === SLOTS.length) {
      $('ws-hint').textContent = 'Tık! Mech\'in tamamlandı. Boyamaya geçelim 🎨';
      $('ws-next').disabled = false;
      setTimeout(() => { if (this.step === 'build') { sfx.win(); this.next(); } }, 1100);
    } else {
      $('ws-hint').textContent = 'Harika! Sıradaki parçayı seç.';
    }
  }

  puff(pos) {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE[i % 11], transparent: true }));
      m.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(1.5);
      this.temp.add(m);
      this.tween(0.5, (t) => { m.position.addScaledVector(v, 0.03); m.material.opacity = 1 - t; }, () => this.temp.remove(m));
    }
  }

  // ---------- 4) BOYA ----------
  enterPaint(keepMech) {
    if (!keepMech && !this.mechParts.legs) this.placeMech({ kit: this.kit, colors: this.colors });
    const panel = $('ws-panel');
    const h = document.createElement('h3');
    h.textContent = 'Boya Atölyesi';
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Bir renk seç, sonra mech\'in herhangi bir parçasına tıkla.';
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const col of PALETTE) {
      const b = document.createElement('button');
      b.className = 'sw' + (col === this.paintColor ? ' sel' : '');
      b.style.background = col;
      b.title = col;
      b.onclick = () => {
        sfx.click();
        this.paintColor = col;
        [...sw.children].forEach((c) => c.classList.remove('sel'));
        b.classList.add('sel');
      };
      sw.appendChild(b);
    }
    const rnd = document.createElement('button');
    rnd.textContent = '🎲 Rastgele Pastel';
    rnd.onclick = () => {
      const a = PALETTE[Math.floor(Math.random() * 11)];
      const b2 = PALETTE[Math.floor(Math.random() * 12)];
      for (const slot of SLOTS) paintableMeshes(this.mechParts[slot]).forEach((m, i) => m.material.color.set(i % 2 ? b2 : a));
      sfx.paint();
    };
    const reset = document.createElement('button');
    reset.className = 'ghost';
    reset.textContent = '↺ Fabrika renkleri';
    reset.onclick = () => { sfx.click(); this.placeMech({ kit: this.kit, colors: {} }); };
    const row = document.createElement('div');
    row.className = 'row';
    row.append(rnd, reset);
    panel.append(h, p, sw, row);
    $('ws-hint').textContent = 'Boyamaya başla! Sağ tıkla sürükleyerek döndürebilirsin.';
    $('ws-next').textContent = 'Bitir →';
  }

  paint(mesh) {
    mesh.material.color.set(this.paintColor);
    sfx.paint();
    const s0 = mesh.scale.clone();
    this.tween(0.25, (t) => mesh.scale.copy(s0).multiplyScalar(1 + Math.sin(t * Math.PI) * 0.08), () => mesh.scale.copy(s0));
    this.puff(mesh.getWorldPosition(new THREE.Vector3()));
  }

  currentDef() {
    const colors = {};
    for (const slot of SLOTS) colors[slot] = readColors(this.mechParts[slot]);
    return { id: this.editingId || undefined, name: this.name || 'Mech', kit: { ...this.kit }, colors };
  }

  // ---------- 5) BİTİR ----------
  enterFinish() {
    this.colors = this.currentDef().colors;
    this.launchConfetti();
    sfx.win();
    const panel = $('ws-panel');
    const h = document.createElement('h3');
    h.textContent = 'Mech Hazır! 🎉';
    const lab = document.createElement('label');
    lab.textContent = 'Adı';
    const inp = document.createElement('input');
    inp.maxLength = 18;
    inp.placeholder = 'Örn. Pamuk Şimşek';
    inp.value = this.name || '';
    inp.oninput = () => { this.name = inp.value.trim(); };
    lab.appendChild(inp);
    const stats = document.createElement('div');
    this.renderStatsInto(stats);
    const save = document.createElement('button');
    save.textContent = '💾 Hangara Kaydet';
    const fly = document.createElement('button');
    fly.textContent = '🕹️ Kokpite Gir';
    fly.style.background = 'var(--blue)';
    const online = document.createElement('button');
    online.textContent = '🌐 Online Savaş';
    online.style.background = 'var(--lav)';
    const doSave = () => {
      const def = this.currentDef();
      def.name = this.name || 'Mech';
      const saved = this.hooks.save(def);
      this.editingId = saved.id;
      return saved;
    };
    save.onclick = () => { sfx.snap(); doSave(); save.textContent = '✓ Kaydedildi'; };
    fly.onclick = () => { sfx.click(); this.hooks.play(doSave(), 'training'); };
    online.onclick = () => { sfx.click(); doSave(); this.hooks.online(); };
    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:10px';
    col.append(save, fly, online);
    panel.append(h, lab, stats, col);
    $('ws-hint').textContent = 'Adını koy, kaydet ve kokpite atla!';
    const next = $('ws-next');
    next.textContent = 'Kokpite Gir →';
    next.onclick = () => { sfx.click(); this.hooks.play(doSave(), 'training'); next.onclick = () => { sfx.click(); this.next(); }; };
  }

  launchConfetti() {
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.2), new THREE.MeshBasicMaterial({ color: PALETTE[i % 11], side: THREE.DoubleSide }));
      m.position.set((Math.random() - 0.5) * 8, 6 + Math.random() * 4, (Math.random() - 0.5) * 6);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.6, -1.5 - Math.random() * 1.5, 0);
      m.userData.spin = new THREE.Vector3(Math.random() * 5, Math.random() * 5, 0);
      m.userData.life = 5;
      this.temp.add(m);
      this.confetti.push(m);
    }
  }

  // ---------- GİRDİ ----------
  pick(e, filter) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hits = this.ray.intersectObjects([this.temp, this.mechRoot], true);
    for (const h of hits) if (h.object.visible && filter(h.object)) return h.object;
    return null;
  }

  onPointerDown(e) {
    if (e.button !== 0) return;
    if (this.mode === 'snip') {
      const o = this.pick(e, (o) => o.userData.runnerSlot);
      if (o) this.snip(o.userData.runnerSlot);
    } else if (this.mode === 'build') {
      const o = this.pick(e, (o) => o.userData.traySlot || (o.userData.ghostSlot && o.parent && isVisible(o)));
      if (!o) return;
      if (o.userData.traySlot) this.selectTray(o.userData.traySlot);
      else this.tryAttach(o.userData.ghostSlot);
    } else if (this.mode === 'paint') {
      const o = this.pick(e, (o) => o.userData.paintable && o.userData.slot);
      if (o) this.paint(o);
    }
  }

  onPointerMove(e) {
    let o = null;
    if (this.mode === 'snip') o = this.pick(e, (o) => o.userData.runnerSlot);
    else if (this.mode === 'build') o = this.pick(e, (o) => o.userData.traySlot || (o.userData.ghostSlot && isVisible(o)));
    else if (this.mode === 'paint') o = this.pick(e, (o) => o.userData.paintable && o.userData.slot);
    this.renderer.domElement.style.cursor = o ? 'pointer' : 'default';
    this.hoverSlot = o ? (o.userData.runnerSlot || o.userData.traySlot || o.userData.ghostSlot) : null;
    if (this.hovered && this.hovered !== o && this.hovered.material.emissive) this.hovered.material.emissive.setHex(0);
    this.hovered = o;
    if (o && this.mode === 'paint' && o.material.emissive) o.material.emissive.setHex(0x2a1f2a);
  }

  update(dt) {
    this.time += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      tw.fn(tw.t);
      if (tw.t >= 1) { this.tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    if (this.mode === 'show') this.mechRoot.rotation.y += dt * 0.4;
    for (const f of this.floaters) {
      f.position.y += Math.sin(this.time + f.userData.phase) * dt * 0.3;
      f.rotation.x += dt * 0.3;
      f.rotation.y += dt * 0.2;
    }
    if (this.mode === 'build') {
      const pulse = 0.18 + Math.sin(this.time * 5) * 0.12;
      for (const [slot, g] of Object.entries(this.ghosts || {})) {
        const strong = this.selected === slot || this.hoverSlot === slot;
        g.traverse((o) => { if (o.isMesh) { o.material.opacity = strong ? 0.5 + pulse : pulse; o.material.color.set(strong ? '#fdffb6' : '#ffffff'); } });
      }
      for (const [slot, o] of Object.entries(this.tray || {})) {
        const base = this.trayPos[slot];
        const lift = this.selected === slot ? 0.35 + Math.sin(this.time * 6) * 0.08 : this.hoverSlot === slot ? 0.12 : 0;
        o.position.y += (base.y + lift - o.position.y) * Math.min(1, dt * 12);
        if (this.selected === slot) o.rotation.y += dt * 1.5;
        else o.rotation.y *= 0.9;
      }
    }
    if (this.mode === 'snip' && this.runner) {
      for (const [slot, r] of Object.entries(this.runner)) {
        if (r.snipped) continue;
        const target = RZ + (this.hoverSlot === slot ? 0.3 : 0);
        r.outer.position.z += (target - r.outer.position.z) * Math.min(1, dt * 12);
      }
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const m = this.confetti[i];
      m.position.addScaledVector(m.userData.v, dt);
      m.position.x += Math.sin(this.time * 3 + i) * dt * 0.5;
      m.rotation.x += m.userData.spin.x * dt;
      m.rotation.y += m.userData.spin.y * dt;
      m.userData.life -= dt;
      if (m.userData.life <= 0 || m.position.y < 0) { this.temp.remove(m); this.confetti.splice(i, 1); }
    }
    if (this.controls.enabled) this.controls.update();
    else this.camera.lookAt(this.controls.target);
  }
}

function isVisible(o) {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}
