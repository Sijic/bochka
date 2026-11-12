import { Haptics } from './telegram.js';

const SFX_PATHS = {
  knockInside: './assets/sfx/barrel_knock_inside.mp3',
  hitHigh: './assets/sfx/barrel_hit_high.mp3',
  hitMid: './assets/sfx/barrel_hit_mid.mp3',
  hitLow: './assets/sfx/barrel_hit_low.mp3',
  drop1: './assets/sfx/water_drop_1.mp3',
  drop2: './assets/sfx/water_drop_2.mp3',
  bark: './assets/sfx/dog_bark_1.mp3',
  scream: './assets/sfx/scream_1.mp3',
  whisper: './assets/sfx/voices/screamer_0.mp3',
  hum: './assets/sfx/factory_hum.mp3',
};

class WorkshopAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.buffers = new Map();
    this.loadingStarted = false;

    this.barrelPositions = [];
    this.panners = [];
    this.targetIndex = 0;
    this.activeBarrel = -1;

    this.listenTimer = null;
    this.breathTimer = null;
    this.ambientStarted = false;
    this.noiseBuffer = null;
  }

  async unlock(withSound = true) {
    this.enabled = Boolean(withSound);
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.92 : 0.0;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this._createNoiseBuffer(2.5);
      this._setupListener(0, 1.55, 4.6);
      this._rebuildPanners();
    }

    if (this.ctx.state === 'suspended' && this.enabled) {
      try {
        await this.ctx.resume();
      } catch { /* ignore */ }
    }

    this.master.gain.setTargetAtTime(this.enabled ? 0.92 : 0.0, this.ctx.currentTime, 0.04);

    if (!this.loadingStarted) {
      this.loadingStarted = true;
      this._preloadBuffers();
    }

    if (this.enabled && !this.ambientStarted) {
      this._startAmbientBed();
    }
  }

  async toggleSound() {
    if (!this.ctx) {
      await this.unlock(true);
      return this.enabled;
    }
    this.enabled = !this.enabled;
    if (this.enabled && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch { /* ignore */ }
    }
    if (this.enabled && !this.ambientStarted) {
      this._startAmbientBed();
    }
    this.master.gain.setTargetAtTime(this.enabled ? 0.92 : 0.0, this.ctx.currentTime, 0.05);
    if (!this.enabled) {
      this.stopListening();
    }
    return this.enabled;
  }

  setBarrelLayout(positions, targetIdx = 0) {
    this.barrelPositions = positions.slice();
    this.targetIndex = targetIdx;
    this._rebuildPanners();
  }

  setTargetIndex(targetIdx) {
    this.targetIndex = targetIdx;
  }

  updateListenerCamera(camPos) {
    if (!this.ctx) return;
    this._setupListener(camPos.x, camPos.y, camPos.z);
  }

  _setupListener(x, y, z) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(x, t, 0.05);
      L.positionY.setTargetAtTime(y, t, 0.05);
      L.positionZ.setTargetAtTime(z, t, 0.05);
      L.forwardX.setValueAtTime(0, t);
      L.forwardY.setValueAtTime(-0.12, t);
      L.forwardZ.setValueAtTime(-1, t);
      L.upX.setValueAtTime(0, t);
      L.upY.setValueAtTime(1, t);
      L.upZ.setValueAtTime(0, t);
    } else if (typeof L.setPosition === 'function') {
      L.setPosition(x, y, z);
      L.setOrientation(0, -0.12, -1, 0, 1, 0);
    }
  }

  _rebuildPanners() {
    if (!this.ctx || !this.barrelPositions.length) return;
    this.panners.forEach((p) => {
      try { p.disconnect(); } catch { /* ignore */ }
    });
    this.panners = this.barrelPositions.map((pos) => {
      const p = this.ctx.createPanner();
      try {
        p.panningModel = 'HRTF';
      } catch {
        p.panningModel = 'equalpower';
      }
      p.distanceModel = 'inverse';
      p.refDistance = 2.2;
      p.maxDistance = 16;
      p.rolloffFactor = 1.35;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y + 0.9;
        p.positionZ.value = pos.z;
      } else {
        p.setPosition(pos.x, pos.y + 0.9, pos.z);
      }
      p.connect(this.master);
      return p;
    });
  }

  setListeningBarrel(index) {
    if (index === this.activeBarrel) return;
    this.stopListening();
    this.activeBarrel = index;
    if (index < 0 || index >= 6) return;

    const isTarget = index === this.targetIndex;
    if (isTarget) {
      this._triggerTargetCycle(index);
      this.listenTimer = window.setInterval(() => {
        if (this.activeBarrel !== index) return;
        this._triggerTargetCycle(index);
      }, 1050);
    } else {
      this._triggerEmptyCycle(index);
      this.listenTimer = window.setInterval(() => {
        if (this.activeBarrel !== index) return;
        this._triggerEmptyCycle(index);
      }, 1350);
    }
  }

  stopListening() {
    this.activeBarrel = -1;
    if (this.listenTimer) {
      clearInterval(this.listenTimer);
      this.listenTimer = null;
    }
    if (this.breathTimer) {
      clearTimeout(this.breathTimer);
      this.breathTimer = null;
    }
  }

  _triggerTargetCycle(index) {
    Haptics.light();
    if (!this.ctx || !this.enabled) return;
    const dest = this.panners[index] || this.master;

    // Глухой двойной/тройной стук ладонями по стали изнутри
    this._playMuffledPalmKnock(dest, 0);
    this._playMuffledPalmKnock(dest, 0.19);
    if (Math.random() > 0.42) {
      this._playMuffledPalmKnock(dest, 0.41);
    }

    // Приглушённое тяжёлое дыхание внутри заваренной бочки
    this.breathTimer = window.setTimeout(() => {
      if (this.activeBarrel === index) {
        this._playMuffledBreath(dest);
      }
    }, 480);
  }

  _triggerEmptyCycle(index) {
    if (!this.ctx || !this.enabled) return;
    const dest = this.panners[index] || this.master;
    this._playHollowDraft(dest, index);
    if (Math.random() > 0.32) {
      this._playInteriorDrip(dest, 0.25 + Math.random() * 0.35);
    }
  }

  _playMuffledPalmKnock(dest, delay = 0) {
    const now = this.ctx.currentTime + delay;

    const buf = this.buffers.get('knockInside');
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.92 + Math.random() * 0.14;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const g = this.ctx.createGain();
      g.gain.value = 0.68;
      src.connect(lp).connect(g).connect(dest);
      src.start(now);
    }

    // Резонанс стальной стенки 200-литровой бочки от удара ладонью изнутри
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const bp = this.ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(148 + Math.random() * 18, now);
    osc.frequency.exponentialRampToValueAtTime(54, now + 0.14);

    bp.type = 'lowpass';
    bp.frequency.value = 340;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.55, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(bp).connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  _playMuffledBreath(dest) {
    if (!this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, now);
    bp.frequency.linearRampToValueAtTime(290, now + 0.44);
    bp.Q.value = 2.6;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 680;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    src.connect(bp).connect(lp).connect(g).connect(dest);
    src.start(now);
    src.stop(now + 0.5);
  }

  _playHollowDraft(dest, index) {
    if (!this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const baseFreq = 165 + index * 24;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(baseFreq, now);
    bp.frequency.linearRampToValueAtTime(baseFreq * 1.12, now + 0.85);
    bp.Q.value = 7.5;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    src.connect(bp).connect(g).connect(dest);
    src.start(now);
    src.stop(now + 1.0);
  }

  _playInteriorDrip(dest, delay = 0) {
    const now = this.ctx.currentTime + delay;
    const buf = this.buffers.get(Math.random() > 0.5 ? 'drop1' : 'drop2');
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.88 + Math.random() * 0.25;
      const g = this.ctx.createGain();
      g.gain.value = 0.35;
      src.connect(g).connect(dest);
      src.start(now);
      return;
    }

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.055);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playStrike(index) {
    Haptics.heavy();
    if (!this.ctx || !this.enabled) return;
    const dest = this.panners[index] || this.master;
    const now = this.ctx.currentTime;

    const hitKeys = ['hitHigh', 'hitMid', 'hitLow'];
    const buf = this.buffers.get(hitKeys[index % hitKeys.length]);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = this.ctx.createGain();
      g.gain.value = 0.95;
      src.connect(g).connect(dest);
      src.start(now);
    }

    // Хлёсткий металлический лязг с вмятиной (FM + sub impact)
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.22);
    subG.gain.setValueAtTime(0.85, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    sub.connect(subG).connect(dest);
    sub.start(now);
    sub.stop(now + 0.26);

    const clang = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modG = this.ctx.createGain();
    const clangG = this.ctx.createGain();
    clang.type = 'square';
    clang.frequency.setValueAtTime(410 + index * 22, now);
    mod.frequency.setValueAtTime(637, now);
    modG.gain.setValueAtTime(290, now);
    modG.gain.exponentialRampToValueAtTime(8, now + 0.32);

    clangG.gain.setValueAtTime(0.24, now);
    clangG.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    mod.connect(modG).connect(clang.frequency);
    clang.connect(clangG).connect(dest);
    mod.start(now);
    clang.start(now);
    mod.stop(now + 0.37);
    clang.stop(now + 0.37);
  }

  playMiniScreamer(variant = 0) {
    Haptics.error();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    const keys = ['bark', 'whisper', 'scream'];
    const buf = this.buffers.get(keys[variant % keys.length]) || this.buffers.get('bark');
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.92, now);
      g.gain.setValueAtTime(0.88, now + 0.32);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      src.connect(g).connect(this.master);
      src.start(now);
      src.stop(now + 0.46);
    }

    // Резкий 0.4-секундный хоррор-стрингер
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.38);
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.41);
  }

  playLidBlowOff(survived = true) {
    if (survived) Haptics.success();
    else Haptics.error();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Срыв стальной крышки + глубокий кинематографический браам
    const boom = this.ctx.createOscillator();
    const boomG = this.ctx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(survived ? 92 : 68, now);
    boom.frequency.exponentialRampToValueAtTime(31, now + 1.25);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(580, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + 1.2);

    boomG.gain.setValueAtTime(0.65, now);
    boomG.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

    boom.connect(lp).connect(boomG).connect(this.master);
    boom.start(now);
    boom.stop(now + 1.4);
  }

  playWeldSeal() {
    Haptics.medium();
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2900, now);
    hp.Q.value = 3.2;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

    src.connect(hp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.55);
  }

  playUrgentTick() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(62, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  _startAmbientBed() {
    if (!this.ctx || this.ambientStarted) return;
    this.ambientStarted = true;
    const now = this.ctx.currentTime;

    // Низкий индустриальный гул цеха Корпуса Б
    const drone = this.ctx.createOscillator();
    const drone2 = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    drone.type = 'sawtooth';
    drone.frequency.value = 46;
    drone2.type = 'triangle';
    drone2.frequency.value = 69.2;

    lp.type = 'lowpass';
    lp.frequency.value = 125;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 1.8);

    drone.connect(lp);
    drone2.connect(lp);
    lp.connect(g).connect(this.master);
    drone.start(now);
    drone2.start(now);
  }

  async _preloadBuffers() {
    const entries = Object.entries(SFX_PATHS);
    await Promise.allSettled(
      entries.map(async ([key, url]) => {
        const res = await fetch(url);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arr);
        this.buffers.set(key, decoded);
      })
    );

    const humBuf = this.buffers.get('hum');
    if (humBuf && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = humBuf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0.16;
      src.connect(g).connect(this.master);
      try { src.start(0); } catch { /* ignore */ }
    }
  }

  _createNoiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 2.6;
    }
    return buf;
  }
}

export const audio = new WorkshopAudio();
