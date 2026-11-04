import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Ragdoll, GRAVITY, PARTS } from './ragdoll.js';
import { RagdollView, COSMETICS, SLOTS, DEFAULT_LOOK, sanitizeLook } from './view.js';
import { buildLevel, CHECKPOINTS, GOAL, FALL_Y } from './level.js';
import { sfx, unlockAudio, Particles } from './fx.js';
import { showBanner, maybeInterstitial } from './ads.js';

const PEER_PREFIX = 'yalpa-oyun-v2-';
const MAX_PLAYERS = 8;
const STEP = 1 / 60;
const SEND_RATE = 1 / 20;
const INTERP_DELAY = 110;

// ---------------- Sahne ----------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe6ff);
scene.fog = new THREE.Fog(0xbfe6ff, 45, 150);
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa8c0, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------- Fizik ----------------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 14;
world.allowSleep = false;
const groundMat = new CANNON.Material('ground');
const objMat = new CANNON.Material('obj');
const playerMat = new CANNON.Material('player');
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0;
world.addContactMaterial(new CANNON.ContactMaterial(playerMat, groundMat, { friction: 0, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(playerMat, objMat, { friction: 0.05, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(objMat, groundMat, { friction: 0.5, restitution: 0.05 }));

const level = buildLevel(scene, world, groundMat, objMat);
const particles = new Particles(scene);

// Bir oyuncunun olaylarını (zıplama, tutunma, düşme) ses + efekt olarak çal
function playEvents(id, p, events, feet) {
  if (!events || !events.length) return;
  const isMe = id === S.myId;
  const d = isMe ? 0 : camera.position.distanceTo(feet);
  const vol = isMe ? 1 : Math.max(0, 1 - d / 25) * 0.6;
  for (const e of events) {
    if (e === 'jump') { sfx.jump(vol); particles.dust({ x: feet.x, y: feet.y - 0.95, z: feet.z }, 6, 0.7); }
    else if (e === 'land') { sfx.land(vol); particles.dust({ x: feet.x, y: feet.y - 0.95, z: feet.z }, 10, 1.2); }
    else if (e === 'grab') sfx.grab(vol);
    else if (e === 'cp' && isMe) { sfx.checkpoint(); toast('Kontrol noktası! ✔'); }
    else if (e === 'goal') { sfx.goal(); particles.confetti(GOAL, isMe ? 120 : 60); }
    else if (e === 'fall' && isMe) sfx.fall();
  }
}

// ---------------- Durum ----------------
// mode: 'solo' | 'host' | 'client'
const S = {
  mode: null,
  myId: 'host',
  players: new Map(), // id -> {name,color,rag?,view,cp,finished,input}
  peer: null,
  conns: new Map(), // host: peerId -> conn
  hostConn: null, // client
  snaps: [],
  sendTimer: 0,
  code: '',
};

const input = { yaw: 0, pitch: -0.25, keys: new Set(), gl: false, gr: false, jump: false, respawn: false, dist: 5 };

// ---------------- UI ----------------
const $ = (id) => document.getElementById(id);
const menu = $('menu');
const hud = $('hud');
const COLORS = ['#f5f2ec', '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac', '#f1f3f5'];
let myColor = COLORS[0];
let myLook = { ...DEFAULT_LOOK };
try {
  $('name').value = localStorage.getItem('yalpa-name') || '';
  myColor = localStorage.getItem('yalpa-color') || myColor;
  myLook = sanitizeLook(JSON.parse(localStorage.getItem('yalpa-look') || 'null'));
} catch {}
const swatches = $('swatches');
COLORS.forEach((c) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.background = c;
  b.onclick = () => { myColor = c; renderSwatches(); rebuildPreview(); };
  swatches.appendChild(b);
});
function renderSwatches() {
  [...swatches.children].forEach((b, i) => b.classList.toggle('on', COLORS[i] === myColor));
}
// Kozmetik dolabı: sekmeler + öğeler
const tabs = $('cos-tabs');
const grid = $('cos-grid');
let cosTab = 'head';
SLOTS.forEach((sl) => {
  const b = document.createElement('button');
  b.className = 'tab';
  b.textContent = sl.name;
  b.onclick = () => { cosTab = sl.id; renderCosmetics(); };
  tabs.appendChild(b);
});
function renderCosmetics() {
  [...tabs.children].forEach((b, i) => b.classList.toggle('on', SLOTS[i].id === cosTab));
  grid.innerHTML = '';
  const items = [{ id: 'none', icon: '🚫', name: 'Yok' }, ...COSMETICS.filter((c) => c.slot === cosTab)];
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'cos' + (myLook[cosTab] === it.id ? ' on' : '');
    b.title = it.name;
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = it.icon;
    b.lastChild.textContent = it.name;
    b.onclick = () => { myLook[cosTab] = it.id; renderCosmetics(); rebuildPreview(); };
    grid.appendChild(b);
  }
  $('cos-count').textContent = COSMETICS.length + ' kozmetik';
}
$('random').onclick = () => {
  for (const sl of SLOTS) {
    const opts = ['none', ...COSMETICS.filter((c) => c.slot === sl.id).map((c) => c.id)];
    myLook[sl.id] = opts[Math.floor(Math.random() * opts.length)];
  }
  myColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  renderSwatches(); renderCosmetics(); rebuildPreview();
};
renderSwatches();
renderCosmetics();

// Menüde dönen önizleme karakteri
let preview = null;
function rebuildPreview() {
  preview?.destroy();
  preview = new RagdollView(scene, '', myColor, myLook, true);
}
rebuildPreview();
const PREVIEW_POS = new THREE.Vector3(0, 0, -3);
const previewArr = new Array(PARTS.length * 7).fill(0);
const pq = new THREE.Quaternion(), pv = new THREE.Vector3(), yq = new THREE.Quaternion(), aq = new THREE.Quaternion();
function posePreview(t) {
  yq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.6) * 0.6);
  const bob = Math.sin(t * 2.4) * 0.025;
  PARTS.forEach((def, i) => {
    pv.set(def.p[0], def.p[1] + bob, def.p[2]);
    pq.identity();
    // sol kol el sallar
    if (def.n === 'uArmL' || def.n === 'lArmL') {
      const ang = 2.5 + Math.sin(t * 7) * 0.35;
      aq.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
      const lowerBend = def.n === 'lArmL' ? 0.5 : 0;
      const sh = new THREE.Vector3(0.34, 1.56 + bob, 0);
      const elbow = new THREE.Vector3(0, -0.315, 0).applyQuaternion(aq).add(sh);
      if (def.n === 'uArmL') pv.set(0, -0.16, 0).applyQuaternion(aq).add(sh);
      else {
        aq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lowerBend * Math.sin(t * 7)));
        pv.set(0, -0.155, 0).applyQuaternion(aq).add(elbow);
      }
      pq.copy(aq);
    }
    pv.applyQuaternion(yq).add(PREVIEW_POS);
    pq.premultiply(yq);
    const o = i * 7;
    previewArr[o] = pv.x; previewArr[o + 1] = pv.y; previewArr[o + 2] = pv.z;
    previewArr[o + 3] = pq.x; previewArr[o + 4] = pq.y; previewArr[o + 5] = pq.z; previewArr[o + 6] = pq.w;
  });
  preview.apply(previewArr);
}

function myName() {
  const n = ($('name').value || '').trim().slice(0, 14) || 'Yalpa' + Math.floor(Math.random() * 90 + 10);
  try {
    localStorage.setItem('yalpa-name', n);
    localStorage.setItem('yalpa-color', myColor);
    localStorage.setItem('yalpa-look', JSON.stringify(myLook));
  } catch {}
  return n;
}

function setStatus(t, err) {
  $('status').textContent = t || '';
  $('status').classList.toggle('err', !!err);
}

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function renderPlayerList() {
  const ul = $('players');
  ul.innerHTML = '';
  for (const [id, p] of S.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = p.color;
    li.appendChild(dot);
    li.appendChild(document.createTextNode(p.name + (id === S.myId ? ' (sen)' : '') + (p.finished ? ' 🏁' : '')));
    ul.appendChild(li);
  }
}

function startGameUI() {
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  $('room').textContent = S.mode === 'solo' ? 'Tek oyunculu' : 'Oda kodu: ' + S.code;
  $('copy').classList.toggle('hidden', S.mode === 'solo');
  renderPlayerList();
  if (preview) { preview.destroy(); preview = null; }
  $('ad-banner').classList.add('hidden');
  camera.clearViewOffset();
  input.yaw = 0; input.pitch = -0.25; input.dist = 5;
  unlockAudio();
  lockPointer();
}

$('copy').onclick = () => {
  navigator.clipboard?.writeText(S.code);
  toast('Oda kodu kopyalandı: ' + S.code);
};

function backToMenu(msg) {
  for (const p of S.players.values()) { p.rag?.destroy(); p.view.destroy(); }
  S.players.clear();
  S.conns.clear();
  S.snaps = [];
  if (S.peer) { try { S.peer.destroy(); } catch {} }
  S.peer = null;
  S.hostConn = null;
  S.mode = null;
  level.dynamics.forEach((d) => {
    d.body.position.set(d.home.x, d.home.y, d.home.z);
    d.body.quaternion.set(0, 0, 0, 1);
    d.body.velocity.setZero();
    d.body.angularVelocity.setZero();
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
  });
  menu.classList.remove('hidden');
  hud.classList.add('hidden');
  $('ad-banner').classList.remove('hidden');
  rebuildPreview();
  setStatus(msg || '', !!msg);
  document.exitPointerLock?.();
}
$('leave').onclick = () => maybeInterstitial($('ad-full'), () => backToMenu());
showBanner($('ad-banner'));

// ---------------- Oyuncular (yerel fizik) ----------------
function freeSlot() {
  const used = new Set([...S.players.values()].map((p) => p.rag?.slot));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

function addSimPlayer(id, name, color, look) {
  const slot = freeSlot();
  if (slot < 0) return null;
  const cp = CHECKPOINTS[0];
  const spawn = { x: cp.x + (slot % 4 - 1.5) * 1.2, y: cp.y + 0.1, z: cp.z - 2 + Math.floor(slot / 4) * 1.4 };
  const rag = new Ragdoll(world, slot, spawn, playerMat);
  const view = new RagdollView(scene, name, color, look, id === S.myId);
  const p = { name, color, look, rag, view, cp: 0, finished: false, netEvents: [] };
  S.players.set(id, p);
  renderPlayerList();
  return p;
}

function removePlayer(id) {
  const p = S.players.get(id);
  if (!p) return;
  if (p.rag) {
    for (const o of S.players.values()) o.rag?.releaseFrom(p.rag);
    p.rag.destroy();
  }
  p.view.destroy();
  S.players.delete(id);
  renderPlayerList();
}

function checkProgress(id, p) {
  const pos = p.rag.pelvis.position;
  if (pos.y < FALL_Y) {
    p.rag.respawn(CHECKPOINTS[p.cp]);
    p.rag.events.push('fall');
    return;
  }
  for (let i = p.cp + 1; i < CHECKPOINTS.length; i++) {
    const c = CHECKPOINTS[i];
    if (Math.abs(pos.x - c.x) < 5 && Math.abs(pos.z - c.z) < 2.5 && pos.y > c.y && pos.y < c.y + 3) {
      p.cp = i;
      p.rag.events.push('cp');
    }
  }
  if (!p.finished && Math.hypot(pos.x - GOAL.x, pos.z - GOAL.z) < GOAL.r && pos.y > GOAL.y && pos.y < GOAL.y + 2.5) {
    p.finished = true;
    p.rag.events.push('goal');
    if (id === S.myId) setTimeout(() => maybeInterstitial($('ad-full')), 3500);
    announce(`${p.name} bitişe ulaştı! 🏁`);
    renderPlayerList();
  }
}

function announce(text) {
  toast(text);
  if (S.mode === 'host') broadcast({ t: 'msg', text });
}

// ---------------- Ağ: PeerJS ----------------
function randCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function broadcast(msg) {
  for (const c of S.conns.values()) if (c.open) c.send(msg);
}

function startSolo() {
  S.mode = 'solo';
  S.myId = 'host';
  addSimPlayer(S.myId, myName(), myColor, myLook);
  startGameUI();
}

function startHost(tries = 0) {
  if (!window.Peer) return setStatus('Ağ kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.', true);
  const name = myName();
  S.code = randCode();
  setStatus('Oda kuruluyor...');
  const peer = new window.Peer(PEER_PREFIX + S.code, { debug: 0 });
  S.peer = peer;
  peer.on('open', () => {
    S.mode = 'host';
    S.myId = 'host';
    addSimPlayer(S.myId, name, myColor, myLook);
    startGameUI();
    toast('Oda kuruldu! Kodu arkadaşlarına gönder: ' + S.code);
  });
  peer.on('error', (e) => {
    if (e.type === 'unavailable-id' && tries < 3) { peer.destroy(); startHost(tries + 1); return; }
    if (S.mode === 'host') { toast('Ağ hatası: ' + e.type); return; }
    setStatus('Oda kurulamadı: ' + (e.type || e.message), true);
  });
  peer.on('disconnected', () => { if (S.mode === 'host') peer.reconnect(); });
  peer.on('connection', (conn) => {
    conn.on('data', (d) => onHostData(conn, d));
    conn.on('close', () => onHostLeave(conn));
    conn.on('error', () => onHostLeave(conn));
  });
}

function onHostData(conn, d) {
  if (!d || typeof d !== 'object') return;
  const id = conn.peer;
  if (d.t === 'hello') {
    if (S.players.has(id)) return;
    const name = String(d.name || 'Oyuncu').slice(0, 14);
    const color = /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#f1f3f5';
    const p = addSimPlayer(id, name, color, sanitizeLook(d.look));
    if (!p) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
    S.conns.set(id, conn);
    conn.send({ t: 'welcome', id });
    sfx.join();
    announce(`${name} oyuna katıldı`);
  } else if (d.t === 'in') {
    const p = S.players.get(id);
    if (!p) return;
    const i = p.rag.input;
    i.mx = clampNum(d.mx, -1, 1); i.mz = clampNum(d.mz, -1, 1);
    i.yaw = clampNum(d.yaw, -1e6, 1e6); i.pitch = clampNum(d.pitch, -1.5, 1.5);
    i.gl = !!d.gl; i.gr = !!d.gr;
    if (d.jump) i.jump = true;
    if (d.respawn) p.rag.respawn(CHECKPOINTS[p.cp]);
  }
}

function clampNum(v, a, b) {
  v = Number(v);
  return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : 0;
}

function onHostLeave(conn) {
  const id = conn.peer;
  if (!S.conns.has(id)) return;
  S.conns.delete(id);
  const p = S.players.get(id);
  if (p) announce(`${p.name} ayrıldı`);
  removePlayer(id);
}

function startJoin() {
  if (!window.Peer) return setStatus('Ağ kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.', true);
  const code = ($('code').value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return setStatus('5 haneli oda kodunu gir.', true);
  const name = myName();
  setStatus('Bağlanılıyor...');
  const peer = new window.Peer({ debug: 0 });
  S.peer = peer;
  let timeout = setTimeout(() => {
    if (S.mode !== 'client') { backToMenu('Odaya bağlanılamadı. Kodu kontrol et.'); }
  }, 15000);
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { serialization: 'json', reliable: true });
    S.hostConn = conn;
    conn.on('open', () => conn.send({ t: 'hello', name, color: myColor, look: myLook }));
    conn.on('data', (d) => {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'welcome') {
        clearTimeout(timeout);
        S.mode = 'client';
        S.myId = d.id;
        S.code = code;
        startGameUI();
        toast('Odaya katıldın!');
      } else if (d.t === 'full') {
        clearTimeout(timeout);
        backToMenu('Oda dolu (en fazla ' + MAX_PLAYERS + ' kişi).');
      } else if (d.t === 's') {
        if (!Array.isArray(d.p) || !Array.isArray(d.o)) return;
        S.snaps.push({ time: performance.now(), d });
        if (S.snaps.length > 30) S.snaps.shift();
        for (const e of d.p) {
          if (Array.isArray(e[7]) && e[7].length) {
            const a = e[3];
            playEvents(e[0], S.players.get(e[0]), e[7].filter((x) => typeof x === 'string'), new THREE.Vector3(a[0], a[1], a[2]));
          }
        }
      } else if (d.t === 'msg') {
        toast(String(d.text).slice(0, 80));
      }
    });
    conn.on('close', () => { if (S.mode === 'client') backToMenu('Kurucu ile bağlantı koptu.'); });
  });
  peer.on('error', (e) => {
    clearTimeout(timeout);
    if (e.type === 'peer-unavailable') backToMenu('Böyle bir oda yok: ' + code);
    else backToMenu('Bağlantı hatası: ' + (e.type || e.message));
  });
}

$('solo').onclick = startSolo;
$('host').onclick = () => startHost();
$('join').onclick = startJoin;
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') startJoin(); });

// ---------------- Girdi ----------------
canvas.addEventListener('click', () => { if (S.mode && document.pointerLockElement !== canvas) lockPointer(); });
function lockPointer() {
  try {
    const r = canvas.requestPointerLock?.();
    if (r && r.catch) r.catch(() => {});
  } catch {}
}
document.addEventListener('mousemove', (e) => {
  // Fare kilitlenemiyorsa (ör. bazı tarayıcı panelleri) serbest fare ile de bakılabilsin
  if (!S.mode || (document.pointerLockElement !== canvas && e.target !== canvas)) return;
  input.yaw -= e.movementX * 0.0025;
  input.pitch = Math.max(-1.3, Math.min(1.2, input.pitch - e.movementY * 0.0025));
});
canvas.addEventListener('mousedown', (e) => {
  if (!S.mode) return;
  unlockAudio();
  if (e.button === 0) input.gl = true;
  if (e.button === 2) input.gr = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.gl = false;
  if (e.button === 2) input.gr = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { input.dist = Math.max(2.5, Math.min(10, input.dist + e.deltaY * 0.004)); }, { passive: true });
window.addEventListener('keydown', (e) => {
  if (!S.mode || e.target.tagName === 'INPUT') return;
  input.keys.add(e.code);
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyR') input.respawn = true;
  // Pointer lock olmadan da tutunabilmek için Q / E
  if (e.code === 'KeyQ') input.gl = true;
  if (e.code === 'KeyE') input.gr = true;
});
window.addEventListener('keyup', (e) => {
  input.keys.delete(e.code);
  if (e.code === 'KeyQ') input.gl = false;
  if (e.code === 'KeyE') input.gr = false;
});
window.addEventListener('blur', () => { input.keys.clear(); input.gl = input.gr = false; });

function moveVector() {
  let f = 0, r = 0;
  const k = input.keys;
  if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) r += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) r -= 1;
  const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
  let mx = sy * f - cy * r, mz = cy * f + sy * r;
  const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  return { mx, mz };
}

// ---------------- Döngü ----------------
const camTarget = new THREE.Vector3(0, 1.5, 0);
let acc = 0;
let last = performance.now();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

function simulate(dt) {
  const me = S.players.get(S.myId);
  if (me) {
    const { mx, mz } = moveVector();
    const i = me.rag.input;
    i.mx = mx; i.mz = mz; i.yaw = input.yaw; i.pitch = input.pitch; i.gl = input.gl; i.gr = input.gr;
    if (input.jump) i.jump = true;
    if (input.respawn) me.rag.respawn(CHECKPOINTS[me.cp]);
  }
  input.jump = false;
  input.respawn = false;

  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 4) {
    for (const p of S.players.values()) p.rag.update(STEP);
    world.step(STEP);
    for (const p of S.players.values()) p.rag.tryGrab(world.contacts);
    acc -= STEP;
    n++;
  }
  if (n === 4) acc = 0;

  for (const [id, p] of S.players) {
    checkProgress(id, p);
    p.view.applyBodies(p.rag.bodies);
    p.view.setGrab(!!p.rag.grab[0], !!p.rag.grab[1]);
    p.view.tick(dt);
    const ev = p.rag.events.splice(0);
    if (ev.length) {
      playEvents(id, p, ev, p.rag.pelvis.position);
      if (S.mode === 'host') p.netEvents.push(...ev.slice(0, 8));
    }
  }
  for (const d of level.dynamics) {
    if (d.body.position.y < FALL_Y - 10) {
      d.body.position.set(d.home.x, d.home.y + 1, d.home.z);
      d.body.velocity.setZero();
      d.body.angularVelocity.setZero();
      d.body.quaternion.set(0, 0, 0, 1);
    }
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
  }

  if (S.mode === 'host') {
    S.sendTimer += dt;
    if (S.sendTimer >= SEND_RATE && S.conns.size) {
      S.sendTimer = 0;
      const p = [];
      for (const [id, pl] of S.players) {
        const g = (pl.rag.grab[0] ? 1 : 0) | (pl.rag.grab[1] ? 2 : 0);
        p.push([id, pl.name, pl.color, pl.rag.serialize(), pl.finished ? 1 : 0, pl.look, g, pl.netEvents.splice(0)]);
      }
      broadcast({ t: 's', p, o: level.serialize() });
    }
  }
}

function clientUpdate(dt) {
  // Girdiyi gönder
  S.sendTimer += dt;
  if (S.sendTimer >= 1 / 30 && S.hostConn?.open) {
    S.sendTimer = 0;
    const { mx, mz } = moveVector();
    S.hostConn.send({
      t: 'in', mx: +mx.toFixed(3), mz: +mz.toFixed(3), yaw: +input.yaw.toFixed(4), pitch: +input.pitch.toFixed(4),
      gl: input.gl, gr: input.gr, jump: input.jump, respawn: input.respawn,
    });
    input.jump = false;
    input.respawn = false;
  }

  if (!S.snaps.length) return;
  const rt = performance.now() - INTERP_DELAY;
  let a = S.snaps[S.snaps.length - 1], b = a, t = 0;
  for (let i = S.snaps.length - 2; i >= 0; i--) {
    if (S.snaps[i].time <= rt) {
      a = S.snaps[i];
      b = S.snaps[i + 1];
      t = Math.min(1, Math.max(0, (rt - a.time) / Math.max(1, b.time - a.time)));
      break;
    }
  }

  // Oyuncu listesini eşitle
  const seen = new Set();
  let listChanged = false;
  for (const [id, name, color, , fin, look, g] of b.d.p) {
    seen.add(id);
    let p = S.players.get(id);
    if (!p) {
      const nm = String(name).slice(0, 14);
      const col = /^#[0-9a-f]{6}$/i.test(color) ? color : '#f1f3f5';
      p = { name: nm, color: col, view: new RagdollView(scene, nm, col, sanitizeLook(look), id === S.myId), finished: false };
      S.players.set(id, p);
      listChanged = true;
    }
    if (!!fin !== p.finished) { p.finished = !!fin; listChanged = true; }
    p.view.setGrab(!!(g & 1), !!(g & 2));
    p.view.tick(dt);
  }
  for (const id of [...S.players.keys()]) {
    if (!seen.has(id)) { S.players.get(id).view.destroy(); S.players.delete(id); listChanged = true; }
  }
  if (listChanged) renderPlayerList();

  const aMap = new Map(a.d.p.map((e) => [e[0], e[3]]));
  const out = [];
  for (const [id, , , arrB] of b.d.p) {
    const arrA = aMap.get(id) || arrB;
    lerpTransforms(arrA, arrB, t, out);
    S.players.get(id).view.apply(out);
  }
  lerpTransforms(a.d.o, b.d.o, t, out);
  level.dynamics.forEach((d, i) => {
    const o = i * 7;
    if (out.length <= o) return;
    d.mesh.position.set(out[o], out[o + 1], out[o + 2]);
    d.mesh.quaternion.set(out[o + 3], out[o + 4], out[o + 5], out[o + 6]);
  });
}

function lerpTransforms(A, B, t, out) {
  out.length = B.length;
  for (let o = 0; o < B.length; o += 7) {
    out[o] = A[o] + (B[o] - A[o]) * t;
    out[o + 1] = A[o + 1] + (B[o + 1] - A[o + 1]) * t;
    out[o + 2] = A[o + 2] + (B[o + 2] - A[o + 2]) * t;
    qa.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]);
    qb.set(B[o + 3], B[o + 4], B[o + 5], B[o + 6]);
    qa.slerp(qb, t).normalize();
    out[o + 3] = qa.x; out[o + 4] = qa.y; out[o + 5] = qa.z; out[o + 6] = qa.w;
  }
  return out;
}

function updateCamera(dt) {
  const me = S.players.get(S.myId);
  if (me) camTarget.lerp(me.view.chestPos.clone().add(new THREE.Vector3(0, 0.35, 0)), 1 - Math.exp(-dt * 10));
  const cp = Math.cos(input.pitch);
  const d = new THREE.Vector3(Math.sin(input.yaw) * cp, Math.sin(input.pitch), Math.cos(input.yaw) * cp);
  camera.position.copy(camTarget).addScaledVector(d, -input.dist);
  camera.lookAt(camTarget);
  sun.position.set(camTarget.x + 15, camTarget.y + 30, camTarget.z + 8);
  sun.target.position.copy(camTarget);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.mode === 'solo' || S.mode === 'host') simulate(dt);
  else if (S.mode === 'client') clientUpdate(dt);
  else {
    // menü: önizleme karakteri, kamera onun önünde
    posePreview(now / 1000);
    preview.tick(dt);
    input.yaw = Math.PI + Math.sin(now / 4000) * 0.25;
    input.pitch = -0.08;
    input.dist = 3.6;
    camTarget.set(PREVIEW_POS.x, PREVIEW_POS.y + 1.15, PREVIEW_POS.z);
    const w = window.innerWidth, h = window.innerHeight;
    if (w > 760) camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
    else camera.clearViewOffset();
  }
  if (S.mode && input.dist > 10) input.dist = 5;
  level.update(now / 1000, dt);
  particles.update(dt);
  updateCamera(S.mode ? dt : 1);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test/debug için
window.__yalpa = { S, input, world, simulate, scene, camera, THREE, renderOnce: () => { updateCamera(1); renderer.render(scene, camera); } };
