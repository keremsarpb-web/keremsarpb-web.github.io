// Oda kodu ile eşler arası (WebRTC / PeerJS) çok oyunculu.
// Odayı kuran oyuncu "ev sahibi"dir: can, skor ve yeniden doğmayı o yönetir.
const PREFIX = 'pastelmech-v1-';
const HOST_ID = 1;

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

class Room {
  constructor() {
    this.players = new Map(); // id -> { send, name, mech, maxHp, hp, score, dead, state }
    this.nextId = HOST_ID;
  }
  add(send) {
    const id = this.nextId++;
    this.players.set(id, { send, name: 'Pilot', mech: null, maxHp: 100, hp: 100, score: 0, dead: false, state: null });
    return id;
  }
  remove(id) {
    if (!this.players.delete(id)) return;
    this.broadcast({ t: 'left', id });
    this.broadcast({ t: 'scores', scores: this.scores() });
  }
  broadcast(msg, except) {
    for (const [id, p] of this.players) if (id !== except) p.send(msg);
  }
  scores() {
    return [...this.players].filter(([, p]) => p.mech).map(([id, p]) => ({ id, name: p.name, score: p.score }));
  }
  handle(id, m) {
    const p = this.players.get(id);
    if (!p || !m || typeof m !== 'object') return;
    if (m.t === 'join') {
      p.name = String(m.name || 'Pilot').slice(0, 16);
      p.mech = m.mech;
      p.maxHp = Math.max(50, Math.min(400, Number(m.maxHp) || 100));
      p.hp = p.maxHp;
      p.send({
        t: 'welcome', id,
        players: [...this.players].filter(([oid, o]) => oid !== id && o.mech)
          .map(([oid, o]) => ({ id: oid, name: o.name, mech: o.mech, hp: o.hp, maxHp: o.maxHp, state: o.state, dead: o.dead })),
      });
      this.broadcast({ t: 'joined', id, name: p.name, mech: p.mech, hp: p.hp, maxHp: p.maxHp }, id);
      this.broadcast({ t: 'scores', scores: this.scores() });
    } else if (m.t === 'state') {
      p.state = m.s;
      this.broadcast({ t: 'state', id, s: m.s }, id);
    } else if (m.t === 'shot') {
      this.broadcast({ t: 'shot', id, o: m.o, d: m.d, w: m.w }, id);
    } else if (m.t === 'hit') {
      const target = this.players.get(m.target);
      if (!target || target.dead || p.dead || m.target === id) return;
      const dmg = Math.max(0, Math.min(60, Number(m.dmg) || 0));
      target.hp = Math.max(0, target.hp - dmg);
      this.broadcast({ t: 'hp', id: m.target, hp: target.hp, by: id });
      if (target.hp <= 0) {
        target.dead = true;
        p.score += 1;
        this.broadcast({ t: 'kill', killer: id, victim: m.target, kname: p.name, vname: target.name });
        this.broadcast({ t: 'scores', scores: this.scores() });
        const vid = m.target;
        setTimeout(() => {
          const v = this.players.get(vid);
          if (!v) return;
          v.dead = false;
          v.hp = v.maxHp;
          this.broadcast({ t: 'respawn', id: vid, hp: v.hp });
        }, 4000);
      }
    } else if (m.t === 'heal') {
      if (p.dead) return;
      p.hp = Math.min(p.maxHp, p.hp + Math.max(0, Math.min(10, Number(m.amount) || 0)));
      this.broadcast({ t: 'hp', id, hp: p.hp });
    } else if (m.t === 'chat') {
      this.broadcast({ t: 'chat', id, name: p.name, text: String(m.text || '').slice(0, 120) });
    }
  }
}

export class Net {
  constructor() {
    this.listeners = new Set();
    this.peer = null;
    this.conn = null;
    this.room = null;
    this.isHost = false;
    this.code = null;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(msg) { for (const fn of this.listeners) fn(msg); }

  _newPeer(id) {
    if (typeof window.Peer !== 'function') throw new Error('Ağ kütüphanesi yüklenemedi.');
    return id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
  }

  host() {
    return new Promise((resolve, reject) => {
      const tryOnce = (attempt) => {
        const code = randomCode();
        const peer = this._newPeer(PREFIX + code);
        let opened = false;
        peer.on('open', () => {
          opened = true;
          this.peer = peer;
          this.isHost = true;
          this.code = code;
          this.room = new Room();
          this.localId = this.room.add((msg) => queueMicrotask(() => this.emit(msg)));
          peer.on('connection', (conn) => {
            let id = null;
            conn.on('open', () => { id = this.room.add((msg) => { if (conn.open) conn.send(msg); }); });
            conn.on('data', (m) => { if (id) this.room.handle(id, m); });
            const drop = () => { if (id) { this.room.remove(id); id = null; } };
            conn.on('close', drop);
            conn.on('error', drop);
          });
          resolve(code);
        });
        peer.on('error', (err) => {
          if (!opened && err.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOnce(attempt + 1); return; }
          if (!opened) { peer.destroy(); reject(new Error(errText(err))); return; }
          this.emit({ t: 'neterror', text: errText(err) });
        });
        peer.on('disconnected', () => { if (opened && !peer.destroyed) peer.reconnect(); });
      };
      tryOnce(0);
    });
  }

  join(code) {
    code = String(code || '').trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = this._newPeer();
      let done = false;
      const fail = (e) => { if (!done) { done = true; peer.destroy(); reject(e); } };
      const timer = setTimeout(() => fail(new Error('Bağlantı zaman aşımına uğradı. Kodu kontrol et.')), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        conn.on('open', () => {
          clearTimeout(timer);
          done = true;
          this.peer = peer;
          this.conn = conn;
          this.code = code;
          this.isHost = false;
          conn.on('data', (m) => this.emit(m));
          conn.on('close', () => this.emit({ t: 'disconnected' }));
          resolve(code);
        });
        conn.on('error', (e) => fail(new Error(errText(e))));
      });
      peer.on('error', (err) => {
        clearTimeout(timer);
        if (!done) fail(new Error(errText(err)));
        else this.emit({ t: 'neterror', text: errText(err) });
      });
    });
  }

  send(msg) {
    if (this.isHost && this.room) this.room.handle(this.localId, msg);
    else if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    try { if (this.conn) this.conn.close(); } catch {}
    try { if (this.peer) this.peer.destroy(); } catch {}
    this.peer = this.conn = this.room = null;
    this.isHost = false;
    this.listeners.clear();
  }
}

function errText(err) {
  const map = {
    'peer-unavailable': 'Bu kodla bir oda bulunamadı.',
    'network': 'İnternet bağlantısı yok gibi görünüyor.',
    'server-error': 'Eşleştirme sunucusuna ulaşılamadı.',
    'browser-incompatible': 'Bu tarayıcı online oyunu desteklemiyor.',
    'unavailable-id': 'Oda kodu kullanımda, tekrar dene.',
  };
  return map[err && err.type] || (err && err.message) || 'Bilinmeyen ağ hatası';
}
