// Küçük sentez sesleri (dosya gerekmez).
let ctx = null;
let master = null;
export let muted = false;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m) { muted = m; }

export function blip(freq = 600, dur = 0.08, type = 'sine', vol = 0.5, slideTo = null) {
  if (muted) return;
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

export function noise(dur = 0.2, vol = 0.4, freq = 1200) {
  if (muted) return;
  const a = ac();
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  click: () => blip(880, 0.05, 'triangle', 0.3),
  snip: () => { noise(0.06, 0.5, 3000); blip(1400, 0.05, 'square', 0.15, 700); },
  snap: () => { blip(500, 0.06, 'square', 0.25, 900); setTimeout(() => blip(1200, 0.08, 'triangle', 0.3), 60); },
  wrong: () => blip(220, 0.18, 'sawtooth', 0.2, 140),
  paint: () => blip(700 + Math.random() * 300, 0.07, 'sine', 0.3, 1100),
  shoot: (big) => big ? blip(260, 0.25, 'sine', 0.5, 90) : blip(1300, 0.07, 'square', 0.12, 500),
  hit: () => noise(0.12, 0.5, 2000),
  hurt: () => blip(180, 0.2, 'sawtooth', 0.3, 80),
  boom: () => { noise(0.6, 0.8, 600); blip(120, 0.5, 'sine', 0.6, 40); },
  jump: () => blip(400, 0.15, 'sine', 0.3, 800),
  win: () => [660, 880, 1100].forEach((f, i) => setTimeout(() => blip(f, 0.15, 'triangle', 0.3), i * 110)),
};
