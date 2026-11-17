import * as THREE from 'three';
import { Workshop } from './workshop.js';
import { Arena } from './arena.js';
import { Net } from './net.js';
import { DEFAULT_KIT, PARTS, SLOTS, sanitizeDef } from './parts.js';
import { sfx, setMuted, muted } from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------- KAYIT ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function mechs() { return store.get('pm.mechs', []); }
function activeMech() {
  const list = mechs();
  const id = store.get('pm.active', null);
  return list.find((m) => m.id === id) || list[0] || { name: 'Çaylak', kit: { ...DEFAULT_KIT }, colors: {} };
}
function saveMech(def) {
  const list = mechs();
  const d = { ...sanitizeDef(def), id: def.id || 'm' + Date.now().toString(36) };
  const i = list.findIndex((m) => m.id === d.id);
  if (i >= 0) list[i] = d; else list.push(d);
  store.set('pm.mechs', list);
  store.set('pm.active', d.id);
  toast('Hangara kaydedildi: ' + d.name);
  return d;
}

// ---------- RENDER ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const workshop = new Workshop(renderer, {
  save: saveMech,
  play: (def, mode) => startArena(def, mode),
  menu: () => show('menu'),
  online: () => show('online'),
});
const arena = new Arena(renderer, { menu: () => show('menu') });
let active = workshop;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  workshop.resize(w, h);
  arena.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

canvas.addEventListener('pointerdown', (e) => { if (active === workshop) workshop.onPointerDown(e); });
canvas.addEventListener('pointermove', (e) => { if (active === workshop) workshop.onPointerMove(e); });

// ---------- EKRANLAR ----------
const screens = ['menu', 'workshop-ui', 'hangar', 'online'];
function show(name) {
  if (active === arena) { arena.stop(); active = workshop; }
  for (const s of screens) $(s).classList.add('hidden');
  workshop.controls.enabled = false;
  canvas.style.cursor = 'default';
  if (name === 'menu') {
    $('menu').classList.remove('hidden');
    $('active-name').textContent = 'Aktif mech: ' + activeMech().name;
    workshop.showcase(activeMech());
  } else if (name === 'workshop') {
    $('workshop-ui').classList.remove('hidden');
    workshop.startNew();
  } else if (name === 'edit') {
    $('workshop-ui').classList.remove('hidden');
    workshop.startEdit(activeMech());
  } else if (name === 'hangar') {
    $('hangar').classList.remove('hidden');
    renderHangar();
    workshop.showcase(activeMech());
  } else if (name === 'online') {
    $('online').classList.remove('hidden');
    $('online-status').textContent = '';
    $('online-status').className = 'status';
    workshop.showcase(activeMech());
  } else if (name === 'training') {
    startArena(activeMech(), 'training');
  }
}

document.querySelectorAll('[data-go]').forEach((b) => {
  b.addEventListener('click', () => { sfx.click(); show(b.dataset.go); });
});

function startArena(def, mode, net, name) {
  for (const s of screens) $(s).classList.add('hidden');
  workshop.controls.enabled = false;
  active = arena;
  arena.start({ def, mode, net, name });
}

// ---------- HANGAR ----------
function renderHangar() {
  const el = $('hangar-list');
  el.innerHTML = '';
  const list = mechs();
  const act = activeMech();
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Henüz mech yok. Atölyede ilkini yap!';
    el.appendChild(p);
    return;
  }
  for (const m of list) {
    const c = document.createElement('div');
    c.className = 'hcard' + (m.id === act.id ? ' active' : '');
    const h = document.createElement('h4'); h.textContent = m.name;
    const s = document.createElement('small');
    s.textContent = SLOTS.map((sl) => PARTS[m.kit[sl]].name).slice(0, 3).join(' · ');
    const row = document.createElement('div'); row.className = 'row';
    const use = document.createElement('button'); use.textContent = m.id === act.id ? '✓ Aktif' : 'Seç';
    use.onclick = () => { sfx.click(); store.set('pm.active', m.id); renderHangar(); workshop.showcase(m); };
    const edit = document.createElement('button'); edit.className = 'ghost'; edit.textContent = '🎨';
    edit.title = 'Yeniden boya';
    edit.onclick = () => { sfx.click(); store.set('pm.active', m.id); show('edit'); };
    const del = document.createElement('button'); del.className = 'ghost'; del.textContent = '🗑';
    del.title = 'Sil';
    del.onclick = () => {
      if (!confirm(`"${m.name}" silinsin mi?`)) return;
      store.set('pm.mechs', mechs().filter((x) => x.id !== m.id));
      renderHangar();
      workshop.showcase(activeMech());
    };
    row.append(use, edit, del);
    c.append(h, s, row);
    el.appendChild(c);
  }
}

// ---------- ONLINE ----------
$('pilot-name').value = store.get('pm.pilot', '');
$('pilot-name').addEventListener('input', (e) => store.set('pm.pilot', e.target.value.trim()));
function pilotName() { return ($('pilot-name').value.trim() || 'Pilot').slice(0, 16); }
function status(text, err) {
  const el = $('online-status');
  el.textContent = text;
  el.className = 'status' + (err ? ' err' : '');
}
let busy = false;
$('host-btn').onclick = async () => {
  if (busy) return;
  busy = true;
  sfx.click();
  status('Oda kuruluyor...');
  const net = new Net();
  try {
    const code = await net.host();
    status('Oda kodu: ' + code);
    startArena(activeMech(), 'online', net, pilotName());
  } catch (e) {
    net.close();
    status(e.message, true);
  }
  busy = false;
};
$('join-btn').onclick = async () => {
  if (busy) return;
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length !== 5) { status('5 harfli oda kodunu yaz.', true); return; }
  busy = true;
  sfx.click();
  status('Bağlanılıyor...');
  const net = new Net();
  try {
    await net.join(code);
    startArena(activeMech(), 'online', net, pilotName());
  } catch (e) {
    net.close();
    status(e.message, true);
  }
  busy = false;
};
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-btn').click(); });

// ---------- SES ----------
setMuted(store.get('pm.muted', false));
$('mute-btn').textContent = muted ? '🔇' : '🔊';
$('mute-btn').onclick = () => {
  setMuted(!muted);
  store.set('pm.muted', muted);
  $('mute-btn').textContent = muted ? '🔇' : '🔊';
  sfx.click();
};

// ---------- TOAST ----------
let toastT;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2200);
}

// ---------- DÖNGÜ ----------
let last = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  active.update(dt);
  renderer.render(active.scene, active.camera);
  requestAnimationFrame(loop);
}
show('menu');
loop();
window.__pm = { workshop, arena, show };
