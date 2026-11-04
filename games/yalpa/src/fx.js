import * as THREE from 'three';

// ---------------- Sesler (WebAudio ile sentezlenir, dosya gerekmez) ----------------
let ctx = null;
let master = null;
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

function tone(freq, endFreq, dur, type = 'sine', vol = 0.3, delay = 0) {
  if (!ctx || vol <= 0.01) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol, cutoff) {
  if (!ctx || vol <= 0.01) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  jump: (v = 1) => tone(260, 620, 0.22, 'sine', 0.25 * v),
  grab: (v = 1) => { tone(520, 300, 0.07, 'triangle', 0.22 * v); noise(0.05, 0.15 * v, 2500); },
  land: (v = 1) => { noise(0.18, 0.35 * v, 500); tone(110, 60, 0.15, 'sine', 0.3 * v); },
  checkpoint: () => { tone(660, 660, 0.15, 'triangle', 0.25); tone(990, 990, 0.3, 'triangle', 0.25, 0.12); },
  goal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.35, 'triangle', 0.25, i * 0.11)),
  join: () => { tone(440, 440, 0.1, 'sine', 0.15); tone(660, 660, 0.15, 'sine', 0.15, 0.09); },
  fall: () => tone(500, 120, 0.6, 'sine', 0.2),
};

// ---------------- Parçacıklar ----------------
const dustGeo = new THREE.IcosahedronGeometry(0.12, 0);
const confGeo = new THREE.PlaneGeometry(0.12, 0.08);
const CONF_COLORS = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa, 0xf783ac];

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.dustMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, flatShading: true, transparent: true, opacity: 0.85 });
    this.confMats = CONF_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  }

  dust(pos, n = 8, power = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(dustGeo, this.dustMat.clone());
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      m.position.set(pos.x + Math.cos(a) * 0.15, pos.y + 0.05, pos.z + Math.sin(a) * 0.15);
      m.scale.setScalar(0.6 + Math.random() * 0.6);
      this.scene.add(m);
      this.list.push({
        m, life: 0.5 + Math.random() * 0.3, age: 0, kind: 'dust',
        v: new THREE.Vector3(Math.cos(a) * 1.6 * power, 0.5 + Math.random() * 0.8, Math.sin(a) * 1.6 * power),
      });
    }
  }

  confetti(pos, n = 80) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(confGeo, this.confMats[i % this.confMats.length]);
      m.position.set(pos.x, pos.y + 1.5, pos.z);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      this.list.push({
        m, life: 2.5 + Math.random(), age: 0, kind: 'conf',
        v: new THREE.Vector3(Math.cos(a) * s, 5 + Math.random() * 5, Math.sin(a) * s),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0),
      });
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.m);
        if (p.kind === 'dust') p.m.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      const k = p.age / p.life;
      if (p.kind === 'dust') {
        p.v.multiplyScalar(1 - dt * 4);
        p.m.position.addScaledVector(p.v, dt);
        p.m.scale.multiplyScalar(1 + dt * 1.5);
        p.m.material.opacity = 0.85 * (1 - k);
      } else {
        p.v.y -= 9 * dt;
        p.v.multiplyScalar(1 - dt * 1.8);
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.x += p.spin.x * dt;
        p.m.rotation.y += p.spin.y * dt;
      }
    }
  }
}
