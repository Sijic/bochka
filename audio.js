let ctx = null, master = null, reverbBus = null, started = false, muted = false;
let activePrankAudio = null;
let activePrankIdx = -1;
let prankVoiceCursor = 0;
let activeCharVoiceAudio = null;
let activeScreamAudio = null;

export const PRANK_VOICE_FILES = [
  { id: 0, src: 'assets/sfx/voices/prank_till.mp3', label: '🎙️ Пранк #1: Тиль Швайгер (Бочка)' },
  { id: 1, src: 'assets/sfx/voices/prank_zvontsov.mp3', label: '🎙️ Пранк #2: Режиссёр А. Звонцов' },
  { id: 2, src: 'Пранк.mp3', label: '🎙️ Пранк #3: Звонок из цеха' },
  { id: 3, src: 'Пранкер_2.mp3', label: '🎙️ Пранк #4: Запись пранкера' },
];

/* Preloaded studio foley buffers (assets/sfx/*.mp3) for zero-latency playback */
const SFX_FILES = {
  barrel_low: 'assets/sfx/barrel_hit_low.mp3',
  barrel_mid: 'assets/sfx/barrel_hit_mid.mp3',
  barrel_high: 'assets/sfx/barrel_hit_high.mp3',
  barrel_inside: 'assets/sfx/barrel_knock_inside.mp3',
  chain_clink_1: 'assets/sfx/chain_clink_1.mp3',
  chain_clink_2: 'assets/sfx/chain_clink_2.mp3',
  chain_break: 'assets/sfx/chain_break.mp3',
  water_drop_1: 'assets/sfx/water_drop_1.mp3',
  water_drop_2: 'assets/sfx/water_drop_2.mp3',
  step_1: 'assets/sfx/step_concrete_1.mp3',
  step_2: 'assets/sfx/step_concrete_2.mp3',
  factory_hum: 'assets/sfx/factory_hum.mp3',
  dog_bark_1: 'assets/sfx/dog_bark_1.mp3',
  dog_bark_2: 'assets/sfx/dog_bark_2.mp3',
  scream_1: 'assets/sfx/scream_1.mp3',
  scream_2: 'assets/sfx/scream_2.mp3',
  scream_3: 'assets/sfx/scream_3.mp3',
};

const sfxRawBytes = {};
const sfxBuffers = {};
let sfxFetchStarted = false;
let humBufferStarted = false;
let stepFootIdx = 0;
let chainClinkIdx = 0;
let dripIdx = 0;

function preloadSfxFiles() {
  if (sfxFetchStarted || typeof fetch === 'undefined') return;
  sfxFetchStarted = true;
  Object.entries(SFX_FILES).forEach(([key, url]) => {
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (!buf) return;
        sfxRawBytes[key] = buf;
        if (ctx) decodeSingleSfx(key, buf);
      })
      .catch(() => {});
  });
}

function decodeSingleSfx(key, rawBuf) {
  if (!ctx || sfxBuffers[key] || !rawBuf) return;
  try {
    const copy = rawBuf.slice(0);
    ctx.decodeAudioData(
      copy,
      (decoded) => {
        sfxBuffers[key] = decoded;
        if (key === 'factory_hum' && started && !humBufferStarted) {
          startHumLoopBuffer();
        }
      },
      () => {}
    );
  } catch { /* ignore */ }
}

function decodeAllPendingSfx() {
  if (!ctx) return;
  Object.keys(sfxRawBytes).forEach((key) => {
    if (!sfxBuffers[key]) decodeSingleSfx(key, sfxRawBytes[key]);
  });
}

if (typeof window !== 'undefined') {
  preloadSfxFiles();
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) {
    master.gain.setValueAtTime(m ? 0 : 0.85, ctx.currentTime);
  }
  if (activePrankAudio) {
    activePrankAudio.muted = m;
  }
  if (activeCharVoiceAudio) {
    activeCharVoiceAudio.muted = m;
  }
  if (activeScreamAudio) {
    activeScreamAudio.muted = m;
  }
  if (m && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}
export function isMuted() { return muted; }

/* Полная остановка любых активных голосов (персонажей, пранка, скримера и браузерного TTS), чтобы звуки НИКОГДА не накладывались друг на друга! */
export function stopAllVoices() {
  if (activeCharVoiceAudio) {
    try {
      activeCharVoiceAudio.pause();
      activeCharVoiceAudio.currentTime = 0;
    } catch { /* ignore */ }
    activeCharVoiceAudio = null;
  }
  if (activePrankAudio) {
    try {
      activePrankAudio.pause();
      activePrankAudio.currentTime = 0;
    } catch { /* ignore */ }
    activePrankAudio = null;
  }
  activePrankIdx = -1;
  if (activeScreamAudio) {
    try {
      activeScreamAudio.pause();
      activeScreamAudio.currentTime = 0;
    } catch { /* ignore */ }
    activeScreamAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

export function isVoiceOrPrankBusy() {
  if (activePrankAudio && !activePrankAudio.paused) return true;
  if (activeScreamAudio && !activeScreamAudio.paused) return true;
  if (activeCharVoiceAudio && !activeCharVoiceAudio.paused) return true;
  return false;
}

/* Build stereo impulse response of a dark concrete-and-steel factory hall (Sector B) */
function createWarehouseReverb() {
  if (!ctx) return null;
  try {
    const dur = 1.25;
    const len = Math.floor(ctx.sampleRate * dur);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    const L = ir.getChannelData(0);
    const R = ir.getChannelData(1);
    const early = [
      [0.014, 0.52, -0.35],
      [0.026, -0.38, 0.48],
      [0.041, 0.31, 0.25],
      [0.063, -0.24, -0.29],
      [0.092, 0.19, -0.21],
    ];
    early.forEach(([sec, gL, gR]) => {
      const idx = Math.floor(sec * ctx.sampleRate);
      if (idx < len) {
        L[idx] += gL;
        R[idx] += gR;
      }
    });
    for (let i = Math.floor(0.012 * ctx.sampleRate); i < len; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 4.4) * 0.18;
      L[i] += (Math.random() * 2 - 1) * env;
      R[i] += (Math.random() * 2 - 1) * env;
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;
    conv.connect(lp);
    lp.connect(wetGain);
    wetGain.connect(master);
    return conv;
  } catch {
    return null;
  }
}

export function startAudio() {
  preloadSfxFiles();
  if (started) {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
    reverbBus = createWarehouseReverb();
    started = true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    decodeAllPendingSfx();
    hum();
    scheduleDrip();
  } catch (e) {
    started = false;
  }
}

/* Auto-unlock AudioContext on first user gesture anywhere */
if (typeof window !== 'undefined') {
  const unlock = () => {
    startAudio();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

function noiseBuffer(sec = 1) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function makePan(pan = 0, reverbSend = 0.25) {
  if (!ctx) return null;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    p.connect(master);
    if (reverbBus && reverbSend > 0) {
      const send = ctx.createGain();
      send.gain.value = reverbSend;
      p.connect(send);
      send.connect(reverbBus);
    }
    return p;
  }
  return master;
}

/* Play a decoded studio sample buffer with stereo panning and micro-pitch variation */
function playSample(key, { volume = 0.85, pan = 0, rate = 1.0, reverb = 0.22, offset = 0 } = {}) {
  if (!started || !ctx || muted) return false;
  const buf = sfxBuffers[key];
  if (!buf) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.4, Math.min(2.4, rate));
    const g = ctx.createGain();
    g.gain.value = volume;
    const dest = makePan(pan, reverb);
    src.connect(g);
    g.connect(dest);
    src.start(ctx.currentTime + Math.max(0, offset));
    return true;
  } catch {
    return false;
  }
}

function startHumLoopBuffer() {
  if (!ctx || !started || humBufferStarted || !sfxBuffers.factory_hum) return;
  try {
    humBufferStarted = true;
    const src = ctx.createBufferSource();
    src.buffer = sfxBuffers.factory_hum;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    src.connect(lp);
    lp.connect(g);
    g.connect(master);
    src.start();
  } catch {
    humBufferStarted = false;
  }
}

/* Гул тёмного промышленного цеха (реальный гул завода + глубокий бинауральный саб-дрон вентиляции и труб) */
function hum() {
  if (sfxBuffers.factory_hum) {
    startHumLoopBuffer();
  }
  /* Глубокий мягкий саб-бас 42 Гц / 63 Гц (без резкого пилящего зуда) */
  [42.0, 42.4, 63.0].forEach((freq, i) => {
    const o = ctx.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sine';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 110;
    const g = ctx.createGain();
    g.gain.value = i === 2 ? 0.028 : 0.052;
    const p = makePan(i === 0 ? -0.45 : i === 1 ? 0.45 : 0, 0);
    o.connect(f);
    f.connect(g);
    g.connect(p);
    o.start();
  });

  /* Дышащий поток воздуха в шахтах вентиляции */
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(3);
  n.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 210;
  nf.Q.value = 1.8;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.14;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 65;
  lfo.connect(lfoGain);
  lfoGain.connect(nf.frequency);
  lfo.start();

  const ng = ctx.createGain();
  ng.gain.value = 0.024;
  n.connect(nf);
  nf.connect(ng);
  ng.connect(master);
  n.start();
}

function scheduleDrip() {
  if (!started) return;
  setTimeout(() => {
    drip();
    if (Math.random() < 0.38) setTimeout(() => drip(0.62), 180 + Math.random() * 90);
    scheduleDrip();
  }, 1500 + Math.random() * 2800);
}

/* Реалистичные капли воды в гулком бетонном цехе */
export function drip(scale = 1) {
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const pan = Math.random() * 1.5 - 0.75;
  const sampleKey = (dripIdx++ % 2 === 0) ? 'water_drop_1' : 'water_drop_2';
  const rate = 0.92 + Math.random() * 0.22;
  const played = playSample(sampleKey, {
    volume: Math.min(0.95, 0.52 * scale),
    pan,
    rate,
    reverb: 0.48,
  });

  /* Резонанс пузырька воздуха (Minnaert upward chirp) + микро-всплеск воды */
  const dest = makePan(pan, 0.52);
  const o = ctx.createOscillator();
  o.type = 'sine';
  const baseF = (720 + Math.random() * 380) * (scale < 0.8 ? 1.22 : 1.0);
  o.frequency.setValueAtTime(baseF, t);
  o.frequency.setValueAtTime(baseF * 1.04, t + 0.008);
  o.frequency.exponentialRampToValueAtTime(baseF * 2.18, t + 0.056);

  const g = ctx.createGain();
  const synthVol = (played ? 0.085 : 0.22) * scale;
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(synthVol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.072);

  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.08);
}

/* Реалистичные тяжёлые шаги ботинок по бетону/металлу или цокот лап овчарки */
export function step(pan = 0, dog = false, strength = 1) {
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;

  const sampleKey = (stepFootIdx++ % 2 === 0) ? 'step_1' : 'step_2';
  const rate = dog ? (1.48 + Math.random() * 0.18) : (0.92 + Math.random() * 0.14);
  const sampleVol = Math.min(1.0, (dog ? 0.36 : 0.68) * strength);
  const played = playSample(sampleKey, {
    volume: sampleVol,
    pan,
    rate,
    reverb: 0.24,
  });

  const dest = makePan(pan, 0.20);
  /* 1. Удар каблука о бетон */
  const o = ctx.createOscillator();
  o.type = 'sine';
  const startF = dog ? 175 : (92 + Math.random() * 14);
  o.frequency.setValueAtTime(startF, t);
  o.frequency.exponentialRampToValueAtTime(dog ? 58 : 34, t + (dog ? 0.048 : 0.085));

  const g = ctx.createGain();
  const thudVol = (played ? (dog ? 0.09 : 0.22) : (dog ? 0.20 : 0.38)) * strength;
  g.gain.setValueAtTime(thudVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (dog ? 0.055 : 0.095));
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.10);

  /* 2. Перекат подошвы / цокот когтей овчарки через 32 мс */
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.065);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = dog ? 2900 : (1050 + Math.random() * 260);
  nf.Q.value = dog ? 3.2 : 1.6;
  const ng = ctx.createGain();
  const toeOff = dog ? 0.018 : 0.034;
  ng.gain.setValueAtTime(0.001, t);
  ng.gain.setValueAtTime((dog ? 0.11 : 0.14) * strength, t + toeOff);
  ng.gain.exponentialRampToValueAtTime(0.001, t + toeOff + 0.05);
  n.connect(nf);
  nf.connect(ng);
  ng.connect(dest);
  n.start(t);
}

/* Мягкий выдох/шорох перед репликой (без прежнего 8-битного пилящего жужжания!) */
export function voiceMumble(pan = 0, pitch = 1) {
  if (!started || !ctx || muted) return;
  /* Голос персонажей теперь воспроизводится чистыми студийными голосовыми файлами и натуральной речью */
}

/* Воспроизведение студийного голосового файла персонажа из assets/sfx/voices/ */
export function stopCharacterVoice() {
  if (activeCharVoiceAudio) {
    try {
      activeCharVoiceAudio.pause();
      activeCharVoiceAudio.currentTime = 0;
    } catch { /* ignore */ }
    activeCharVoiceAudio = null;
  }
}

export function playCharacterVoice(clipKey, onEnded = null) {
  startAudio();
  if (muted || !clipKey) return false;
  /* Если сейчас играет голосовой пранк или скример — фоновые реплики не перебивают их и не накладываются */
  if (activeScreamAudio && !activeScreamAudio.paused) return true;
  stopAllVoices();
  try {
    const a = new Audio(`assets/sfx/voices/${clipKey}.mp3`);
    a.volume = 0.96;
    a.muted = muted;
    activeCharVoiceAudio = a;
    a.onended = () => {
      if (activeCharVoiceAudio === a) activeCharVoiceAudio = null;
      if (onEnded) onEnded();
    };
    a.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/* Физическая модель + студийный сэмпл удара по 200-литровой стальной бочке */
function triggerSteelBarrelImpact(pan = 0, strength = 1, toneIdx = 1, fromInside = false) {
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;

  const sampleKeys = ['barrel_low', 'barrel_mid', 'barrel_high'];
  const key = fromInside ? 'barrel_inside' : (sampleKeys[Math.max(0, Math.min(2, toneIdx))] || 'barrel_mid');
  const rate = (0.95 + Math.random() * 0.10) * (toneIdx === 0 ? 0.92 : toneIdx === 2 ? 1.08 : 1.0);
  const played = playSample(key, {
    volume: Math.min(1.0, (fromInside ? 0.78 : 0.88) * strength),
    pan,
    rate,
    reverb: fromInside ? 0.35 : 0.30,
  });

  const dest = makePan(pan, 0.32);
  const f0Base = toneIdx === 0 ? 68 : toneIdx === 2 ? 104 : 84;
  const f0 = f0Base * (0.97 + Math.random() * 0.06);
  const synScale = (played ? 0.38 : 0.85) * strength;

  /* 1. Глубокий воздушный резонанс 200-литровой стальной бочки (BOOM) */
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(f0 * 1.42, t);
  sub.frequency.exponentialRampToValueAtTime(f0, t + 0.032);
  sub.frequency.exponentialRampToValueAtTime(f0 * 0.84, t + 0.32);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.55 * synScale, t);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  sub.connect(subG);
  subG.connect(dest);
  sub.start(t);
  sub.stop(t + 0.36);

  /* 2. Негармонические цилиндрические обертоны листовой стали бочки */
  const modes = fromInside
    ? [[1.47, 0.22, 0.18], [2.09, 0.12, 0.14]]
    : [[1.47, 0.28, 0.24], [2.09, 0.20, 0.20], [2.56, 0.14, 0.16], [3.18, 0.09, 0.12]];
  modes.forEach(([ratio, amp, dur]) => {
    const m = ctx.createOscillator();
    m.type = 'sine';
    const mf = f0 * ratio;
    m.frequency.setValueAtTime(mf * 1.03, t);
    m.frequency.exponentialRampToValueAtTime(mf * 0.99, t + dur);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(amp * synScale, t);
    mg.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    m.connect(mg);
    mg.connect(dest);
    m.start(t);
    m.stop(t + dur + 0.02);
  });

  /* 3. Контактный металлический щелчок по стенке бочки */
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.06);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = fromInside ? 620 : (1450 + toneIdx * 380);
  nf.Q.value = 2.4;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.28 * synScale, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  n.connect(nf);
  nf.connect(ng);
  ng.connect(dest);
  n.start(t);
}

export function knock(pan = 0, strength = 1) {
  startAudio();
  if (!started || !ctx || muted) return;
  const fromInside = strength <= 0.58;
  const toneIdx = pan < -0.25 ? 0 : pan > 0.25 ? 2 : 1;
  triggerSteelBarrelImpact(pan, strength, toneIdx, fromInside);
}

export function hit(strength = 1, pan = 0) {
  startAudio();
  if (!started || !ctx || muted) return;
  triggerSteelBarrelImpact(pan, strength, 1, false);
}

/* Distinct resonant metallic barrel tones (0 = low bass, 1 = mid hollow, 2 = high ring) */
export function knockTone(idx = 0, strength = 1) {
  startAudio();
  if (!started || !ctx || muted) return;
  const pans = [-0.5, 0.0, 0.5];
  const toneIdx = Math.max(0, Math.min(2, idx));
  triggerSteelBarrelImpact(pans[toneIdx] || 0, strength, toneIdx, false);
}

/* Металлический звенящий удар по цепям на бочке или на стене алтаря */
export function chainClink(pan = 0, strength = 1) {
  startAudio();
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;

  const sampleKey = (chainClinkIdx++ % 2 === 0) ? 'chain_clink_1' : 'chain_clink_2';
  const rate = 0.94 + Math.random() * 0.16;
  playSample(sampleKey, {
    volume: Math.min(1.0, 0.88 * strength),
    pan,
    rate,
    reverb: 0.28,
  });
  /* Одновременно глухой удар по самой стальной бочке под цепью */
  triggerSteelBarrelImpact(pan, 0.55 * strength, 1, false);

  /* Высокочастотный металлический звон стальных звеньев цепи (без лазерного спуска частоты!) */
  const dest = makePan(pan, 0.30);
  const ringFreqs = [2380, 3190, 4280, 5640, 6820];
  [0, 0.026, 0.058].forEach((linkDelay, hitIdx) => {
    const atten = (1 - hitIdx * 0.28) * strength;
    ringFreqs.forEach((f, fIdx) => {
      if (hitIdx > 0 && fIdx % 2 === 1) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const detuneF = f * (0.985 + Math.random() * 0.03);
      o.frequency.setValueAtTime(detuneF, t + linkDelay);
      const dur = 0.14 + (4 - fIdx) * 0.035;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.045 * atten, t + linkDelay);
      g.gain.exponentialRampToValueAtTime(0.0005, t + linkDelay + dur);
      o.connect(g);
      g.connect(dest);
      o.start(t + linkDelay);
      o.stop(t + linkDelay + dur + 0.01);
    });
  });
}

/* Металлический звенящий лязг сбиваемых цепей (разрыв замка и осыпание звеньев на бетон) */
export function chainBreak(pan = 0) {
  startAudio();
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;

  playSample('chain_break', {
    volume: 0.95,
    pan,
    rate: 0.95 + Math.random() * 0.10,
    reverb: 0.34,
  });
  playSample('chain_clink_1', {
    volume: 0.72,
    pan: Math.max(-1, Math.min(1, pan + 0.18)),
    rate: 1.08,
    reverb: 0.30,
    offset: 0.075,
  });

  /* Каскад звенящих стальных звеньев, падающих на бетонный пол */
  const dest = makePan(pan, 0.34);
  const cascadeOffsets = [0, 0.032, 0.074, 0.125, 0.185, 0.260];
  const metallicPartials = [2140, 2860, 3740, 4890, 6120];
  cascadeOffsets.forEach((off, idx) => {
    const amp = 0.055 * Math.pow(0.78, idx);
    metallicPartials.forEach((freq, fIdx) => {
      if (idx > 2 && fIdx % 2 === 0) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * (0.98 + Math.random() * 0.04), t + off);
      const dur = 0.18 + (4 - fIdx) * 0.03;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, t + off);
      g.gain.exponentialRampToValueAtTime(0.0005, t + off + dur);
      o.connect(g);
      g.connect(dest);
      o.start(t + off);
      o.stop(t + off + dur + 0.01);
    });
  });
}

export function creak() {
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const dest = makePan(0, 0.28);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(88, t + 0.42);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 540;
  f.Q.value = 5.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.11, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(f);
  f.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.48);
}

let screamCounter = 0;

function makeDistortionCurve(amount = 220) {
  const n = 8192;
  const curve = new Float32Array(n);
  const k = typeof amount === 'number' ? amount : 220;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/* Кинематографический скример: мгновенно останавливает любые другие голоса, даёт один чёткий удар по металлу и включает чистую драматичную голосовую реплику персонажа! */
export function scream(variantOverride = null) {
  startAudio();
  if (muted) return;
  stopAllVoices();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});

  const vIdx = ((variantOverride !== null ? variantOverride : screamCounter++) % 6 + 6) % 6;

  /* 1. Один чистый кинематографический хоррор-удар (без наложения нескольких криков и без пилящего синтезатора!) */
  const stingerKey = `scream_${(vIdx % 3) + 1}`;
  playSample(stingerKey, { volume: 0.45, pan: 0, rate: 1.0, reverb: 0.18, offset: 0 });
  playSample('barrel_low', { volume: 0.52, pan: 0, rate: 0.90, reverb: 0.20, offset: 0 });

  /* 2. Чистый студийный голос персонажа скримера (screamer_0..5.mp3) */
  try {
    const a = new Audio(`assets/sfx/voices/screamer_${vIdx}.mp3`);
    a.volume = 0.98;
    a.muted = muted;
    activeScreamAudio = a;
    a.onended = () => {
      if (activeScreamAudio === a) activeScreamAudio = null;
    };
    a.play().catch(() => {});
  } catch { /* ignore */ }

  if (navigator.vibrate) navigator.vibrate([220, 50, 260]);
  try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error'); } catch (e) { /* ignore */ }
}

/* Мягкий кинематографический обертон награды (вместо резкого 8-битного квадратного писка) */
export function coin(pitch = 1) {
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const base = 528 * Math.max(0.7, Math.min(1.8, pitch));
  const dest = makePan(0, 0.22);
  [base, base * 1.5].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t + i * 0.025);
    const g = ctx.createGain();
    g.gain.setValueAtTime(i === 0 ? 0.048 : 0.032, t + i * 0.025);
    g.gain.exponentialRampToValueAtTime(0.0008, t + i * 0.025 + 0.16);
    o.connect(g);
    g.connect(dest);
    o.start(t + i * 0.025);
    o.stop(t + i * 0.025 + 0.17);
  });
  try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (e) { /* ignore */ }
}

/* Реальный грозный лай и рык немецкой овчарки Рекса */
export function bark(pan = 0) {
  startAudio();
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const rate = 0.94 + Math.random() * 0.12;
  const played = playSample('dog_bark_1', {
    volume: 0.92,
    pan,
    rate,
    reverb: 0.28,
  });
  if (played) return;

  /* Формантный синтез лая овчарки на случай, если буфер ещё декодируется */
  const t = ctx.currentTime;
  const dest = makePan(pan, 0.30);
  [0, 0.22].forEach((off, idx) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(195 - idx * 12, t + off);
    o.frequency.linearRampToValueAtTime(255, t + off + 0.035);
    o.frequency.exponentialRampToValueAtTime(98, t + off + 0.17);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 620;
    f1.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t + off);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.19);
    o.connect(f1);
    f1.connect(g);
    g.connect(dest);
    o.start(t + off);
    o.stop(t + off + 0.20);
  });
}

/* Одиночный чёткий лай овчарки в ритм вместе с ударом лапой по бочке */
export function barkRhythm(pan = -0.55) {
  startAudio();
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  playSample('dog_bark_2', {
    volume: 0.88,
    pan,
    rate: 0.96 + Math.random() * 0.08,
    reverb: 0.24,
  });
  knockTone(0, 0.85);
}

/* Тревожный аккорд триллера, когда луч фонарика ловит игрока на бочке */
export function alarmLock(pan = 0) {
  startAudio();
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const dest = makePan(pan, 0.35);
  [146.8, 155.6, 220.0].forEach((freq, idx) => {
    const o = ctx.createOscillator();
    o.type = idx === 2 ? 'triangle' : 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.76, t + 0.44);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 920;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.46);
    o.connect(lp);
    lp.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.48);
  });
}

/* Музыкальный стук по стальной бочке (мотив «Knockin' on Heaven's Door»: G – D – Am7 – C + реальный удар бочки) */
let melodyStep = 0;
export function barrelMelodyBeat(idx = 1, stepOverride = null) {
  startAudio();
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const st = stepOverride !== null ? stepOverride : melodyStep++;
  const chords = [
    [196.00, 293.66, 392.00], /* G */
    [146.83, 293.66, 369.99], /* D */
    [220.00, 261.63, 329.63], /* Am */
    [130.81, 261.63, 329.63], /* C */
  ];
  const chord = chords[st % chords.length];
  const noteFreq = chord[Math.max(0, Math.min(2, idx))];
  const t = ctx.currentTime;
  const dest = makePan(idx === 0 ? -0.45 : idx === 2 ? 0.45 : 0, 0.34);

  /* Тёплый певучий резонанс стали бочки на частоте аккорда */
  [noteFreq, noteFreq * 1.5].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.994, t + 0.44);
    const g = ctx.createGain();
    g.gain.setValueAtTime(i === 0 ? 0.16 : 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.46);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.48);
  });

  /* Реальный перкуссионный удар по стальной бочке */
  knockTone(idx, 0.95);
}

/* Шум морского прибоя для предфинального уровня «Достучаться до небес» */
export function oceanWave(pan = 0) {
  if (!started || !ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const dest = makePan(pan, 0.38);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(1.6);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(220, t);
  f.frequency.linearRampToValueAtTime(480, t + 0.62);
  f.frequency.linearRampToValueAtTime(170, t + 1.52);
  f.Q.value = 0.85;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.50);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.55);
  n.connect(f);
  f.connect(g);
  g.connect(dest);
  n.start(t);
}

/* Воспроизведение реальных голосовых записей пранка из папки проекта */
export function stopPrankVoice() {
  if (activePrankAudio) {
    try {
      activePrankAudio.pause();
      activePrankAudio.currentTime = 0;
    } catch { /* ignore */ }
    activePrankAudio = null;
  }
  activePrankIdx = -1;
}

export function getActivePrankVoice() {
  return activePrankAudio && !activePrankAudio.paused ? activePrankIdx : -1;
}

export function playPrankVoice(idx = null, onEnded = null) {
  startAudio();
  const targetIdx = idx !== null && idx !== undefined
    ? ((idx % PRANK_VOICE_FILES.length) + PRANK_VOICE_FILES.length) % PRANK_VOICE_FILES.length
    : (prankVoiceCursor++ % PRANK_VOICE_FILES.length);

  if (idx !== null && activePrankAudio && !activePrankAudio.paused && activePrankIdx === targetIdx) {
    stopAllVoices();
    return { stopped: true, track: PRANK_VOICE_FILES[targetIdx] };
  }

  stopAllVoices();
  const track = PRANK_VOICE_FILES[targetIdx];
  try {
    const a = new Audio(encodeURI(track.src));
    a.volume = 0.95;
    a.muted = muted;
    activePrankAudio = a;
    activePrankIdx = targetIdx;
    a.onended = () => {
      if (activePrankAudio === a) {
        activePrankAudio = null;
        activePrankIdx = -1;
      }
      if (onEnded) onEnded(track);
    };
    a.play().catch(() => {});
  } catch { /* ignore */ }
  return { stopped: false, track, index: targetIdx, total: PRANK_VOICE_FILES.length };
}

/* Воспроизведение аудио-пранка в цеху: чистое и разборчивое звучание голоса без искажений и без эха! */
export function playPrankLoudspeaker(idx = null, onEnded = null) {
  startAudio();
  if (muted) return { stopped: true, track: null };
  const targetIdx = idx !== null && idx !== undefined
    ? ((idx % PRANK_VOICE_FILES.length) + PRANK_VOICE_FILES.length) % PRANK_VOICE_FILES.length
    : (prankVoiceCursor++ % PRANK_VOICE_FILES.length);

  stopAllVoices();
  const track = PRANK_VOICE_FILES[targetIdx];

  try {
    const a = new Audio(encodeURI(track.src));
    a.volume = 0.95;
    a.muted = muted;
    activePrankAudio = a;
    activePrankIdx = targetIdx;
    a.onended = () => {
      if (activePrankAudio === a) {
        activePrankAudio = null;
        activePrankIdx = -1;
      }
      if (onEnded) onEnded(track);
    };
    a.play().catch(() => {});
  } catch { /* ignore */ }

  return { stopped: false, track, index: targetIdx, total: PRANK_VOICE_FILES.length, loudspeaker: true };
}
