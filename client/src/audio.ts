/**
 * 声音：全部用浏览器自带的 WebAudio 现场合成（没有任何音频文件，不占流量，也没有版权问题）。
 * 背景音乐和音效有各自的音量，也可以一键静音；设置保存在这个浏览器里。
 * 浏览器规定必须先有用户点击才能发声，所以第一次点击时才会真正开始。
 */
export interface SoundSettings {
  muted: boolean;
  music: number; // 0~1
  sfx: number; // 0~1
}

const KEY = 'trio-sound';
let settings: SoundSettings = { muted: false, music: 0.35, sfx: 0.7 };
try {
  const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (raw && typeof raw === 'object') settings = { ...settings, ...raw };
} catch {
  /* 隐私模式下可能不可用，用默认值 */
}

let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setTimeout> | null = null;
let musicOn = false;
const listeners = new Set<() => void>();

export const getSound = () => settings;
export function subscribeSound(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
      applyGains();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function applyGains() {
  if (musicGain) musicGain.gain.value = settings.muted ? 0 : settings.music * 0.5;
  if (sfxGain) sfxGain.gain.value = settings.muted ? 0 : settings.sfx;
}

export function setSound(patch: Partial<SoundSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  applyGains();
  if (musicOn) {
    if (settings.muted || settings.music === 0) stopMusic(false);
  } else if (!settings.muted && settings.music > 0 && ctx) startMusic();
  listeners.forEach((f) => f());
}

// ───── 音效 ─────
function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.25, delay = 0, slideTo?: number) {
  const c = ac();
  if (!c || !sfxGain || settings.muted || settings.sfx === 0) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(sfxGain);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.2, delay = 0, hp = 800) {
  const c = ac();
  if (!c || !sfxGain || settings.muted || settings.sfx === 0) return;
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(sfxGain);
  src.start(t0);
}

export const sfx = {
  click: () => tone(660, 0.05, 'square', 0.12),
  correct: () => {
    tone(523, 0.1, 'triangle', 0.3);
    tone(659, 0.1, 'triangle', 0.3, 0.1);
    tone(784, 0.2, 'triangle', 0.3, 0.2);
  },
  wrong: () => {
    tone(220, 0.18, 'sawtooth', 0.22, 0, 150);
    tone(165, 0.25, 'sawtooth', 0.22, 0.15, 110);
  },
  start: () => {
    tone(392, 0.1, 'square', 0.2);
    tone(523, 0.1, 'square', 0.2, 0.1);
    tone(784, 0.3, 'square', 0.2, 0.2);
  },
  tick: () => tone(880, 0.07, 'square', 0.18),
  go: () => tone(1175, 0.35, 'sine', 0.3),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.3, i * 0.13));
    tone(1047, 0.5, 'triangle', 0.3, 0.55);
  },
  lose: () => {
    [392, 349, 311, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.17));
  },
  dice: () => {
    for (let i = 0; i < 6; i++) noise(0.04, 0.25, i * 0.06, 1500 + i * 400);
  },
  flip: () => {
    noise(0.05, 0.2, 0, 2500);
    tone(900, 0.05, 'triangle', 0.1, 0.02, 500);
  },
  pop: () => tone(520, 0.08, 'sine', 0.3, 0, 260),
  coin: () => {
    tone(988, 0.07, 'square', 0.2);
    tone(1319, 0.25, 'square', 0.2, 0.07);
  },
  boom: () => {
    noise(0.35, 0.35, 0, 200);
    tone(120, 0.3, 'sawtooth', 0.25, 0, 40);
  },
  roll: () => {
    for (let i = 0; i < 10; i++) noise(0.08, 0.18, i * 0.07, 300);
  },
};

// ───── 背景音乐：轻快的五声音阶循环，和弦 + 琶音 ─────
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const BARS = [
  [0, 2, 4, 2, 3, 2, 1, 2],
  [2, 4, 5, 4, 3, 2, 1, 0],
  [0, 3, 4, 5, 4, 3, 2, 3],
  [4, 3, 2, 1, 0, 1, 2, 0],
];
const BASS = [130.81, 146.83, 196.0, 130.81];
let bar = 0;

function musicNote(freq: number, t: number, dur: number, type: OscillatorType, vol: number) {
  if (!ctx || !musicGain) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function scheduleBar() {
  if (!musicOn || !ctx) return;
  const step = 0.28;
  const t0 = ctx.currentTime + 0.05;
  const notes = BARS[bar % BARS.length];
  notes.forEach((n, i) => musicNote(SCALE[n], t0 + i * step, step * 0.9, 'triangle', 0.5));
  musicNote(BASS[bar % BASS.length], t0, step * 4, 'sine', 0.6);
  musicNote(BASS[bar % BASS.length], t0 + step * 4, step * 4, 'sine', 0.6);
  bar++;
  musicTimer = setTimeout(scheduleBar, step * 8 * 1000 - 60);
}

export function startMusic() {
  if (musicOn || settings.muted || settings.music === 0) return;
  if (!ac()) return;
  musicOn = true;
  scheduleBar();
}

export function stopMusic(_fade = true) {
  musicOn = false;
  if (musicTimer) clearTimeout(musicTimer);
  musicTimer = null;
}

/** 第一次点击页面时调用：解锁音频并开始背景音乐 */
export function unlockAudio() {
  ac();
  if (!musicOn && !settings.muted && settings.music > 0) startMusic();
}
