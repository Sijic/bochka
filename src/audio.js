import { Haptics } from './telegram.js';

const SFX_PATHS = {
  knockInside: './assets/sfx/barrel_knock_inside.mp3',
  hitHigh: './assets/sfx/barrel_hit_high.mp3',
  hitMid: './assets/sfx/barrel_hit_mid.mp3',
  hitLow: './assets/sfx/barrel_hit_low.mp3',
  drop1: './assets/sfx/water_drop_1.mp3',
  drop2: './assets/sfx/water_drop_2.mp3',
  chain1: './assets/sfx/chain_clink_1.mp3',
  chain2: './assets/sfx/chain_clink_2.mp3',
  scream1: './assets/sfx/scream_1.mp3',
  scream2: './assets/sfx/scream_2.mp3',
  hum: './assets/sfx/factory_hum.mp3',
  // v8.0: 3 целевых звука прослушки (L1 человек, L2 пустая бочка, L3+ билет) + глухие подсказки «я тут»
  target_human: './public/sfx/targets/human_knock.mp3',
  target_empty: './public/sfx/targets/empty_echo.mp3',
  target_ticket: './public/sfx/targets/ticket_projector.mp3',
  target_muffled_1: './public/sfx/targets/muffled_clue_1.mp3',
  target_muffled_2: './public/sfx/targets/muffled_clue_2.mp3',
  // v8.0: 10 киношных звуков-обманок внутри бочек (mono <= 12 KB)
  decoy_dog_chain: './public/sfx/decoys/dog_chain.mp3',
  decoy_nail_scrape: './public/sfx/decoys/nail_scrape.mp3',
  decoy_radio_static: './public/sfx/decoys/radio_static.mp3',
  decoy_oil_bubbles: './public/sfx/decoys/oil_bubbles.mp3',
  decoy_alarm_clock: './public/sfx/decoys/alarm_clock.mp3',
  decoy_snore_whistle: './public/sfx/decoys/snore_whistle.mp3',
  decoy_rubber_chicken: './public/sfx/decoys/rubber_chicken.mp3',
  decoy_can_drink: './public/sfx/decoys/can_drink.mp3',
  decoy_cassette_bass: './public/sfx/decoys/cassette_bass.mp3',
  decoy_lighter_sigh: './public/sfx/decoys/lighter_sigh.mp3',
  // v8.0: 4 пробивных скримера (-0.3 dBFS, атака <= 50 мс)
  scream_saw_scream: './public/sfx/screamers/saw_scream.mp3',
  scream_lid_blast: './public/sfx/screamers/lid_blast.mp3',
  scream_basement_shriek: './public/sfx/screamers/basement_shriek.mp3',
  scream_tesla_siren: './public/sfx/screamers/tesla_siren.mp3',
  // v8.2: 7 разных реальных актёрских скримеров (по одному на каждого персонажа!) + жуткие звуки внутри бочек
  horror_char_0: './public/sfx/horror/char_0.mp3',
  horror_char_1: './public/sfx/horror/char_1.mp3',
  horror_char_2: './public/sfx/horror/char_2.mp3',
  horror_char_3: './public/sfx/horror/char_3.mp3',
  horror_char_4: './public/sfx/horror/char_4.mp3',
  horror_char_5: './public/sfx/horror/char_5.mp3',
  horror_char_6: './public/sfx/horror/char_6.mp3',
  horror_jumpscare_shriek: './public/sfx/horror/jumpscare_shriek.mp3',
  horror_jumpscare_lunge: './public/sfx/horror/jumpscare_lunge.mp3',
  horror_jumpscare_klaxon: './public/sfx/horror/jumpscare_klaxon.mp3',
  horror_jumpscare_waterphone: './public/sfx/horror/jumpscare_waterphone.mp3',
  horror_barrel_scratch: './public/sfx/horror/barrel_scratch_nails.mp3',
  horror_barrel_banging: './public/sfx/horror/barrel_banging_panic.mp3',
  horror_barrel_breath: './public/sfx/horror/barrel_whisper_breath.mp3',
  horror_barrel_groan: './public/sfx/horror/barrel_metal_groan.mp3',
  // v8.1: Бесплатные CC0 индустриальные и жуткие SFX из Patch.gg (Kenney)
  patch_metal_heavy: './public/sfx/patch/metal_heavy.mp3',
  patch_metal_clang: './public/sfx/patch/metal_clang.mp3',
  patch_bell_ominous: './public/sfx/patch/bell_ominous.mp3',
  patch_creak_eerie: './public/sfx/patch/creak_eerie.mp3',
  patch_metal_latch: './public/sfx/patch/metal_latch.mp3',
  patch_barrel_ring: './public/sfx/patch/barrel_ring.mp3',
  patch_slime_slosh: './public/sfx/patch/slime_slosh.mp3',
  patch_blast_crunch: './public/sfx/patch/blast_crunch.mp3',
  patch_sub_boom: './public/sfx/patch/sub_boom.mp3',
  patch_tesla_arc: './public/sfx/patch/tesla_arc.mp3',
  patch_hatch_slam: './public/sfx/patch/hatch_slam.mp3',
  // v11.5: Настоящие живые записи петуха (кукареку) и злой собаки (лай ротвейлера) для пранк-скримеров
  prank_real_rooster: './public/sfx/pranks/real_rooster.mp3',
  prank_real_dog: './public/sfx/pranks/real_dog_bark.mp3',
};

export const DECOY_SOUND_KEYS = [
  'decoy_dog_chain',
  'decoy_nail_scrape',
  'decoy_radio_static',
  'decoy_oil_bubbles',
  'decoy_alarm_clock',
  'decoy_snore_whistle',
  'decoy_rubber_chicken',
  'decoy_can_drink',
  'decoy_cassette_bass',
  'decoy_lighter_sigh',
  'horror_barrel_scratch',
  'horror_barrel_banging',
  'horror_barrel_breath',
  'horror_barrel_groan',
  'patch_creak_eerie',
  'patch_metal_latch',
  'patch_slime_slosh',
  'patch_bell_ominous',
];

const SCREAMER_KEY_ALIAS = {
  saw_scream: 'saw_scream',
  weld: 'saw_scream',
  lid_blast: 'lid_blast',
  lunge: 'lid_blast',
  basement_shriek: 'basement_shriek',
  custom_scream: 'basement_shriek',
  tesla_siren: 'tesla_siren',
  siren_cam: 'tesla_siren',
  prank_rooster: 'prank_rooster',
  prank_dog_alarm: 'prank_dog_alarm',
  horror_banging: 'horror_banging',
  horror_scratch: 'horror_scratch',
  horror_groan: 'horror_groan',
  horror_whisper: 'horror_whisper',
  horror_char_0: 'horror_char_0',
  horror_char_1: 'horror_char_1',
  horror_char_2: 'horror_char_2',
  horror_char_3: 'horror_char_3',
  horror_char_4: 'horror_char_4',
  horror_char_5: 'horror_char_5',
  horror_char_6: 'horror_char_6',
};

class WorkshopAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.screamerBus = null;
    this.enabled = false;
    this.modalDucked = false;
    this.buffers = new Map();
    this.loadingStarted = false;

    this.barrelPositions = [];
    this.panners = [];
    this.targetIndex = 0;
    this.targetKind = 'human'; // 'human' | 'empty' | 'ticket'
    this.duelLootMap = null;
    this.barrelDecoys = [];
    this.activeBarrel = -1;
    this.activeListenSource = null;
    this.activeZoneId = 1;
    this.barrelVoiceFilterEnabled = true;

    this.listenTimer = null;
    this.breathTimer = null;
    this.ambientStarted = false;
    this.noiseBuffer = null;
    this._resumeHooksBound = false;

    // Голосовое послание отправителя (глухая петля в бочке + чистое раскрытие в финале)
    this.senderVoiceUrl = '';
    this.senderVoiceBuffer = null;
    this.muffledLoopTimer = null;
    this.muffledActiveSrc = null;
    this.muffledChainGain = null;
    this.muffledLoopRunning = false;
    this.cleanVoiceSrc = null;
    this.cleanFallbackAudio = null;
    this._userMuted = false;
    this._silentHtmlAudio = null;
    this._stateListeners = new Set();
  }

  onStateChange(fn) {
    if (typeof fn === 'function') this._stateListeners.add(fn);
    return () => this._stateListeners.delete(fn);
  }

  _emitState() {
    const audible = this.isActuallyAudible();
    for (const fn of this._stateListeners) {
      try { fn({ enabled: this.enabled, audible, state: this.ctx?.state || 'none' }); } catch { /* ignore */ }
    }
  }

  isActuallyAudible() {
    if (!this.enabled || this._userMuted) return false;
    if (!this.ctx) return false;
    return this.ctx.state === 'running';
  }

  /**
   * v16.0: СИНХРОННАЯ разблокировка аудио прямо в первой строке pointerdown/click
   * (без await/setTimeout/fetch — работает в iOS Safari, Telegram iOS WKWebView и Android WebView!).
   */
  unlockSync(withSound = true) {
    this.enabled = Boolean(withSound);
    this._userMuted = !this.enabled;
    this.modalDucked = false;

    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession) {
        navigator.audioSession.type = 'playback';
      }
    } catch { /* ignore */ }

    const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioCtx) {
      this._emitState();
      return;
    }

    if (!this.ctx) {
      const preCtx = typeof window !== 'undefined' ? window.__bochkaUnlockedCtx : null;
      this.ctx = preCtx && preCtx.state !== 'closed' ? preCtx : new AudioCtx();
      if (typeof window !== 'undefined') window.__bochkaUnlockedCtx = this.ctx;

      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.96 : 0.0;
      this.master.connect(this.ctx.destination);

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -3;
      comp.knee.value = 2;
      comp.ratio.value = 20;
      comp.attack.value = 0.001;
      comp.release.value = 0.1;
      const boost = this.ctx.createGain();
      boost.gain.value = 2.15;
      boost.connect(comp).connect(this.master);
      this.screamerBus = boost;

      this.noiseBuffer = this._createNoiseBuffer(2.5);
      this._setupListener(0, 1.55, 4.6);
      this._rebuildPanners();

      this.ctx.onstatechange = () => this._emitState();
    }

    if (this.enabled) {
      // 1. Синхронный resume() прямо внутри пользовательского жеста
      if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
        try {
          const p = this.ctx.resume();
          if (p && typeof p.then === 'function') p.then(() => this._emitState()).catch(() => {});
        } catch { /* ignore */ }
      }
      // 2. Синхронный 1-семпловый silent buffer — железный триггер iOS Safari / Telegram WebView
      try {
        const silentBuf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = silentBuf;
        src.connect(this.ctx.destination);
        src.start(0);
      } catch { /* ignore */ }

      // 3. Синхронная разблокировка HTML5 <audio> (обход аппаратного silent switch в iOS WebView)
      try {
        if (!this._silentHtmlAudio && typeof Audio !== 'undefined') {
          const a = new Audio(
            'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
          );
          a.setAttribute('playsinline', '');
          a.volume = 0.01;
          this._silentHtmlAudio = a;
        }
        if (this._silentHtmlAudio) {
          this._silentHtmlAudio.currentTime = 0;
          const playP = this._silentHtmlAudio.play();
          if (playP && typeof playP.catch === 'function') playP.catch(() => {});
        }
      } catch { /* ignore */ }
    }

    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(this.enabled ? 0.94 : 0.0, this.ctx.currentTime);
    } catch { /* ignore */ }

    if (!this._resumeHooksBound && typeof document !== 'undefined') {
      this._resumeHooksBound = true;
      const wakeAudio = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (this.enabled && !this._userMuted && this.ctx) {
          try {
            this.master?.gain?.cancelScheduledValues?.(this.ctx.currentTime);
            this.master?.gain?.setValueAtTime?.(0.94, this.ctx.currentTime);
          } catch { /* ignore */ }
          if (this.ctx.state !== 'running') {
            this.ctx.resume().then(() => {
              if (typeof document !== 'undefined' && document.hidden) {
                this.ctx.suspend().catch(() => {});
                return;
              }
              this._emitState();
            }).catch(() => {});
          }
        }
      };
      const pauseAudioForBackground = () => {
        this._pausedByVisibility = true;
        if (this.ctx) {
          try {
            this.master?.gain?.cancelScheduledValues?.(this.ctx.currentTime);
            this.master?.gain?.setValueAtTime?.(0.0, this.ctx.currentTime);
          } catch { /* ignore */ }
          if (this.ctx.state === 'running') {
            this.ctx.suspend().then(() => this._emitState()).catch(() => {});
          }
        }
      };
      document.addEventListener('pointerdown', wakeAudio, { passive: true, capture: true });
      document.addEventListener('touchstart', wakeAudio, { passive: true, capture: true });
      document.addEventListener('click', wakeAudio, { passive: true, capture: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          pauseAudioForBackground();
        } else {
          this._pausedByVisibility = false;
          wakeAudio();
        }
      });
      window.addEventListener('pagehide', pauseAudioForBackground);
    }

    if (this.enabled && !this.loadingStarted) {
      this.loadingStarted = true;
      this._preloadBuffers();
    }
    if (this.enabled && !this.ambientStarted) {
      this._startAmbientBed();
    }
    this._emitState();
  }

  async unlock(withSound = true) {
    this.unlockSync(withSound);
    if (this.ctx && this.ctx.state !== 'running' && this.enabled) {
      try {
        await Promise.race([
          this.ctx.resume(),
          new Promise((resolve) => setTimeout(resolve, 600)),
        ]);
      } catch { /* ignore */ }
    }
    this._emitState();

    if (this.senderVoiceUrl && !this.senderVoiceBuffer) {
      this.setSenderVoiceUrl(this.senderVoiceUrl).catch(() => {});
    }
  }

  async toggleSound() {
    if (!this.ctx) {
      this.unlockSync(true);
      await this.unlock(true);
      this.playSoundReadyClick();
      return this.enabled;
    }
    const nextEnabled = !this.enabled || this.ctx.state !== 'running';
    this.enabled = nextEnabled;
    this._userMuted = !this.enabled;
    this.modalDucked = false;
    if (this.enabled) {
      this.unlockSync(true);
      if (this.ctx.state !== 'running') {
        try { await this.ctx.resume(); } catch { /* ignore */ }
      }
      this.playSoundReadyClick();
    } else {
      try {
        this.master.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.03);
      } catch { /* ignore */ }
      this.stopListening();
      this.stopMuffledVoiceLoop();
      this.stopOceanEasterEggAudio();
    }
    this._emitState();
    return this.enabled;
  }

  playSoundReadyClick() {
    if (!this.ctx || !this.enabled || !this.master) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.075);
      g.gain.setValueAtTime(0.22, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.095);
    } catch { /* ignore */ }
  }

  setModalAudioDuck(ducked = false) {
    this.modalDucked = Boolean(ducked);
    if (!this.ctx || !this.master) return;
    const targetGain = (this.enabled && !this.modalDucked) ? 0.92 : 0.0;
    this.master.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
  }

  setBarrelLayout(positions, targetIdx = 0, { targetKind = 'human' } = {}) {
    this.barrelPositions = positions.slice();
    this.targetIndex = targetIdx;
    this.targetKind = targetKind || 'human';
    this.duelLootMap = null;
    // Перемешиваем 10 обманок для каждого нового раунда так, чтобы каждая бочка звучала по-своему
    const pool = DECOY_SOUND_KEYS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.barrelDecoys = positions.map((_, i) => pool[i % pool.length]);
    this._rebuildPanners();
  }

  setDuelBarrelLayout(positions, barrelLoot = {}) {
    this.barrelPositions = Array.isArray(positions) ? positions.slice() : [];
    this.duelLootMap = barrelLoot && typeof barrelLoot === 'object' ? { ...barrelLoot } : {};
    const entries = Object.entries(this.duelLootMap);
    const ticketEntry = entries.find(([, l]) => l?.kind === 'ticket' || l?.kind === 'golden_shard' || l?.kind === 'friend_barrel')
      || entries.find(([, l]) => l?.kind === 'chip' || l?.kind === 'life');
    this.targetIndex = ticketEntry ? Number(ticketEntry[0]) : -1;
    this.targetKind = 'ticket';
    this._rebuildPanners();
  }

  getBarrelSoundKey(index) {
    if (this.duelLootMap) {
      const kind = String(this.duelLootMap[index]?.kind || 'empty');
      if (kind === 'ticket' || kind === 'golden_shard') return 'target_ticket';
      if (kind === 'friend_barrel') return 'target_human';
      if (kind === 'chip' || kind === 'life') return 'patch_barrel_ring';
      if (kind === 'energy') return 'patch_tesla_arc';
      if (kind === 'points') return 'patch_metal_latch';
      if (kind === 'screamer') {
        const idxAbs = Math.abs(Math.round(Number(index) || 0));
        return ['horror_barrel_scratch', 'horror_barrel_breath', 'horror_barrel_groan'][idxAbs % 3];
      }
      return 'target_empty';
    }
    if (index === this.targetIndex) {
      if (this.targetKind === 'empty') return 'target_empty';
      if (this.targetKind === 'ticket') return 'target_ticket';
      return 'target_human';
    }
    return this.barrelDecoys[index] || DECOY_SOUND_KEYS[Math.abs(index) % DECOY_SOUND_KEYS.length];
  }

  setTargetIndex(targetIdx) {
    this.targetIndex = targetIdx;
  }

  updateListenerCamera(camPos) {
    if (!this.ctx) return;
    const now = performance.now();
    if (this._lastListenerMs && now - this._lastListenerMs < 110) return;
    if (
      this._lastListenerPos &&
      Math.abs(camPos.x - this._lastListenerPos.x) < 0.05 &&
      Math.abs(camPos.y - this._lastListenerPos.y) < 0.05 &&
      Math.abs(camPos.z - this._lastListenerPos.z) < 0.05
    ) {
      return;
    }
    this._lastListenerMs = now;
    this._lastListenerPos = { x: camPos.x, y: camPos.y, z: camPos.z };
    this._setupListener(camPos.x, camPos.y, camPos.z);
  }

  /**
   * Загружает и декодирует записанную голосовуху отправителя (<= 40 КБ Opus/WebM)
   */
  async setSenderVoiceUrl(url) {
    this.stopMuffledVoiceLoop();
    this.stopCleanVoice();
    this.senderVoiceUrl = url || '';
    this.senderVoiceBuffer = null;

    if (!url) return false;
    if (!this.ctx) return false;

    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const arr = await res.arrayBuffer();
      this.senderVoiceBuffer = await this.ctx.decodeAudioData(arr.slice(0));
      return true;
    } catch {
      this.senderVoiceBuffer = null;
      return false;
    }
  }

  hasSenderVoice() {
    return Boolean(this.senderVoiceUrl);
  }

  /**
   * Запускает тихую жуткую петлю голоса друга сквозь заваренную стальную бочку:
   * BiquadFilterNode (bandpass 400 Hz) + искажение стальной трубы + короткий металлический резонанс.
   */
  startMuffledVoiceLoop() {
    this.stopMuffledVoiceLoop();
    if (!this.ctx || !this.enabled || !this.senderVoiceBuffer) return;

    this.muffledLoopRunning = true;

    const triggerOnce = () => {
      if (!this.muffledLoopRunning || !this.ctx || !this.enabled || !this.senderVoiceBuffer) return;

      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.senderVoiceBuffer;
      src.playbackRate.value = 0.97 + Math.random() * 0.04;

      // 1. Узкая голосовая полоса 400 Гц (срезаем все высокие частоты как сквозь 2-мм сталь)
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(400, now);
      bp.Q.setValueAtTime(2.35, now);

      // 2. Лёгкое нелинейное насыщение + гулкая металлическая труба (comb feedback 29 мс)
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this._getTubeSaturationCurve();

      const pipeDelay = this.ctx.createDelay(0.1);
      pipeDelay.delayTime.setValueAtTime(0.028, now);
      const pipeFb = this.ctx.createGain();
      pipeFb.gain.setValueAtTime(0.44, now);
      pipeDelay.connect(pipeFb);
      pipeFb.connect(pipeDelay);

      // 3. Финальный глухой срез верхов заваренной крышки
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(690, now);

      const envGain = this.ctx.createGain();
      // Если игрок сейчас прослушивает бочку — глухой голос чуть отчётливее
      const peakGain = this.activeBarrel >= 0 ? 0.56 : 0.34;
      const dur = this.senderVoiceBuffer.duration;

      envGain.gain.setValueAtTime(0.001, now);
      envGain.gain.linearRampToValueAtTime(peakGain, now + 0.14);
      envGain.gain.setValueAtTime(peakGain, now + Math.max(0.16, dur - 0.18));
      envGain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.12);

      const dest = this.panners[this.targetIndex] || this.master;

      src.connect(bp);
      bp.connect(shaper);
      shaper.connect(lp);
      shaper.connect(pipeDelay);
      pipeDelay.connect(lp);
      lp.connect(envGain);
      envGain.connect(dest);

      this.muffledActiveSrc = src;
      this.muffledChainGain = envGain;
      try {
        src.start(now);
      } catch { /* ignore */ }

      const pauseMs = Math.round((dur + 1.35 + Math.random() * 0.65) * 1000);
      this.muffledLoopTimer = window.setTimeout(triggerOnce, pauseMs);
    };

    this.muffledLoopTimer = window.setTimeout(triggerOnce, 420);
  }

  stopMuffledVoiceLoop() {
    this.muffledLoopRunning = false;
    if (this.muffledLoopTimer) {
      clearTimeout(this.muffledLoopTimer);
      this.muffledLoopTimer = null;
    }
    if (this.muffledActiveSrc) {
      try { this.muffledActiveSrc.stop(); } catch { /* ignore */ }
      this.muffledActiveSrc = null;
    }
    this.muffledChainGain = null;
  }

  /**
   * В финале после срыва крышки воспроизводит голос друга (с акустическим фильтром «Голос из железной бочки» BiquadFilter + реверб)
   */
  async playCleanSenderVoice(overrideUrl = '', { useBarrelFilter = this.barrelVoiceFilterEnabled } = {}) {
    this.stopMuffledVoiceLoop();
    this.stopCleanVoice();

    const urlToPlay = overrideUrl || this.senderVoiceUrl;
    if (!urlToPlay) return false;

    if (this.ctx && this.enabled) {
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch { /* ignore */ }
      }
      let buf = !overrideUrl ? this.senderVoiceBuffer : null;
      if (!buf) {
        try {
          const res = await fetch(urlToPlay);
          const arr = await res.arrayBuffer();
          buf = await this.ctx.decodeAudioData(arr.slice(0));
        } catch {
          buf = null;
        }
      }
      if (buf) {
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.value = 1.18;

        if (useBarrelFilter) {
          const hp = this.ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(175, now);

          const resPeak = this.ctx.createBiquadFilter();
          resPeak.type = 'peaking';
          resPeak.frequency.setValueAtTime(510, now);
          resPeak.Q.setValueAtTime(3.2, now);
          resPeak.gain.setValueAtTime(7.5, now);

          const lp = this.ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(2850, now);

          const tankDelay = this.ctx.createDelay(0.12);
          tankDelay.delayTime.setValueAtTime(0.034, now);
          const tankFb = this.ctx.createGain();
          tankFb.gain.setValueAtTime(0.36, now);
          tankDelay.connect(tankFb);
          tankFb.connect(tankDelay);

          src.connect(hp);
          hp.connect(resPeak);
          resPeak.connect(lp);
          resPeak.connect(tankDelay);
          tankDelay.connect(lp);
          lp.connect(g);
          g.connect(this.master);
        } else {
          src.connect(g).connect(this.master);
        }

        this.cleanVoiceSrc = src;
        src.start(0);
        return true;
      }
    }

    // Fallback через HTMLAudioElement (например в конструкторе до входа в цех)
    try {
      const el = new Audio(urlToPlay);
      el.volume = 1.0;
      this.cleanFallbackAudio = el;
      await el.play();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Однократное предпрослушивание записанной голосовухи с эффектом заваренной бочки (для Конструктора)
   */
  async playOneShotMuffledPreview(url) {
    if (!url) return false;
    await this.unlock(true);
    if (!this.ctx) return false;
    this.stopCleanVoice();

    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr.slice(0));
      const now = this.ctx.currentTime;

      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(400, now);
      bp.Q.setValueAtTime(2.35, now);

      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this._getTubeSaturationCurve();

      const pipeDelay = this.ctx.createDelay(0.1);
      pipeDelay.delayTime.setValueAtTime(0.028, now);
      const pipeFb = this.ctx.createGain();
      pipeFb.gain.setValueAtTime(0.44, now);
      pipeDelay.connect(pipeFb);
      pipeFb.connect(pipeDelay);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(690, now);

      const g = this.ctx.createGain();
      g.gain.value = 0.92;

      src.connect(bp);
      bp.connect(shaper);
      shaper.connect(lp);
      shaper.connect(pipeDelay);
      pipeDelay.connect(lp);
      lp.connect(g);
      g.connect(this.master);

      this.cleanVoiceSrc = src;
      src.start(now);
      return true;
    } catch {
      return false;
    }
  }

  stopCleanVoice() {
    if (this.cleanVoiceSrc) {
      try { this.cleanVoiceSrc.stop(); } catch { /* ignore */ }
      this.cleanVoiceSrc = null;
    }
    if (this.cleanFallbackAudio) {
      try { this.cleanFallbackAudio.pause(); } catch { /* ignore */ }
      this.cleanFallbackAudio = null;
    }
  }

  _getTubeSaturationCurve() {
    if (this._satCurve) return this._satCurve;
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * 2.1);
    }
    this._satCurve = curve;
    return curve;
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
    const maxCount = Math.max(12, this.barrelPositions.length || 12);
    if (index < 0 || index >= maxCount) return;

    if (this.muffledChainGain && this.ctx) {
      this.muffledChainGain.gain.setTargetAtTime(0.58, this.ctx.currentTime, 0.08);
    }

    let listenCycle = 0;
    const playOnce = () => {
      if (this.activeBarrel !== index) return;
      listenCycle += 1;
      const duelLoot = this.duelLootMap ? String(this.duelLootMap[index]?.kind || 'empty') : '';
      const isGood = this.duelLootMap
        ? ['ticket', 'golden_shard', 'friend_barrel', 'chip', 'life', 'energy'].includes(duelLoot)
        : index === this.targetIndex;
      const isTarget = this.duelLootMap ? isGood : index === this.targetIndex;
      Haptics.barrelListenPulse(isGood);
      if (!this.ctx || !this.enabled) return;
      const dest = this.panners[index] || this.master;
      // v11.6 Прослушка: на целевой бочке с человеком (Ур. 1, Ур. 4, Ур. 5+) с 1-го прослушивания слышно глухое «я тут...»!
      const useMuffledVoiceClue =
        !this.duelLootMap &&
        isTarget &&
        this.targetKind === 'human' &&
        !this.senderVoiceBuffer &&
        (listenCycle === 1 || listenCycle % 2 === 0 || Math.random() < 0.55);
      const key = useMuffledVoiceClue
        ? (listenCycle % 4 === 0 ? 'target_muffled_2' : 'target_muffled_1')
        : this.getBarrelSoundKey(index);
      const gainVol = this.duelLootMap
        ? (isGood ? 1.12 : (duelLoot === 'screamer' ? 1.05 : 0.88))
        : (isTarget ? 1.15 : 0.94);
      const played = this._playInsideBarrelSample(key, dest, gainVol);
      if (!played) {
        if (isTarget) this._triggerTargetCycle(index);
        else this._triggerEmptyCycle(index);
      } else if (!isTarget) {
        // v8.1: Лёгкий странный обертон из Patch внутри обманной бочки
        const eerieLayer = ['patch_creak_eerie', 'patch_metal_latch', 'patch_slime_slosh'][index % 3];
        const eBuf = this.buffers.get(eerieLayer);
        if (eBuf && Math.random() < 0.55) {
          const eSrc = this.ctx.createBufferSource();
          eSrc.buffer = eBuf;
          eSrc.playbackRate.value = 0.72 + Math.random() * 0.25;
          const eg = this.ctx.createGain();
          eg.gain.value = 0.28;
          eSrc.connect(eg).connect(dest);
          try { eSrc.start(this.ctx.currentTime + 0.14); } catch { /* ignore */ }
        }
      }
    };

    playOnce();
    this.listenTimer = window.setInterval(playOnce, 1850);
  }

  _playInsideBarrelSample(key, dest, gainVal = 0.95) {
    if (!this.ctx || !this.enabled) return false;
    const buf = this.buffers.get(key);
    if (!buf) {
      // Догружаем сэмпл на лету, если ещё не успел декодироваться
      const url = SFX_PATHS[key];
      if (url && !this._loadingKeys?.has(key)) {
        if (!this._loadingKeys) this._loadingKeys = new Set();
        this._loadingKeys.add(key);
        fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((ab) => (ab && this.ctx ? this.ctx.decodeAudioData(ab.slice(0)) : null))
          .then((decoded) => {
            if (decoded) this.buffers.set(key, decoded);
          })
          .catch(() => {});
      }
      return false;
    }

    if (this.activeListenSource) {
      try { this.activeListenSource.stop(); } catch { /* ignore */ }
      this.activeListenSource = null;
    }

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    // Фильтр железного резонанса 200-литровой бочки (BiquadFilterNode)
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 340;
    bp.Q.value = 2.4;
    bp.gain.value = 5.5;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 1.2;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 75;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(gainVal, now + 0.04);

    src.connect(hp).connect(bp).connect(lp).connect(g).connect(dest);
    src.start(now);
    this.activeListenSource = src;
    src.onended = () => {
      if (this.activeListenSource === src) this.activeListenSource = null;
    };
    return true;
  }

  playRewardImpact(stepIdx = 0) {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const baseHz = 240 + Math.min(8, stepIdx) * 58;
      // Плотный ударный бас + звонкий золотой клик попадания в HUD («БАХ!»)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(baseHz * 0.65, now);
      osc1.frequency.exponentialRampToValueAtTime(92, now + 0.14);
      osc2.frequency.setValueAtTime(baseHz * 2.0, now);
      osc2.frequency.exponentialRampToValueAtTime(baseHz * 2.5, now + 0.11);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.46, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(g);
      osc2.connect(g);
      g.connect(this.master);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.24);
      osc2.stop(now + 0.24);
    } catch { /* ignore */ }
  }

  stopListening() {
    this.activeBarrel = -1;
    if (this.activeListenSource) {
      try { this.activeListenSource.stop(); } catch { /* ignore */ }
      this.activeListenSource = null;
    }
    if (this.muffledChainGain && this.ctx) {
      this.muffledChainGain.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.12);
    }
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
      if (this.activeZoneId === 3) {
        // Глубокое эхо Затопленной котельной при прослушивании
        const echoDelay = this.ctx.createDelay(0.35);
        echoDelay.delayTime.setValueAtTime(0.14, now);
        const echoFb = this.ctx.createGain();
        echoFb.gain.setValueAtTime(0.46, now);
        echoDelay.connect(echoFb);
        echoFb.connect(echoDelay);
        src.connect(lp);
        lp.connect(g);
        lp.connect(echoDelay);
        echoDelay.connect(g);
        g.connect(dest);
      } else {
        src.connect(lp).connect(g).connect(dest);
      }
      src.start(now);
    }

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

  /**
   * Пространственный металлический звон капли с потолка о мокрый бетон / крышку (сбивает со следа)
   */
  playSpatialCeilingDrip(x = 0, z = 0) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    const pan = this.ctx.createPanner();
    pan.panningModel = 'equalpower';
    pan.distanceModel = 'inverse';
    pan.refDistance = 2.5;
    pan.maxDistance = 14;
    if (pan.positionX) {
      pan.positionX.value = x;
      pan.positionY.value = 0.12;
      pan.positionZ.value = z;
    } else {
      pan.setPosition(x, 0.12, z);
    }
    pan.connect(this.master);

    const buf = this.buffers.get(Math.random() > 0.5 ? 'drop1' : 'drop2');
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.82 + Math.random() * 0.38;
      const g = this.ctx.createGain();
      g.gain.value = 0.22 + Math.random() * 0.14;
      src.connect(g).connect(pan);
      src.onended = () => {
        try { pan.disconnect(); } catch { /* ignore */ }
      };
      src.start(now);
      return;
    }

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920 + Math.random() * 280, now);
    osc.frequency.exponentialRampToValueAtTime(1550, now + 0.05);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(g).connect(pan);
    osc.onended = () => {
      try { pan.disconnect(); } catch { /* ignore */ }
    };
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Лязг раскачивающихся ржавых цепей на кафельных колоннах после удара
   */
  playChainRattle(intensity = 1.0) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    const playSingle = (key, delay, rate, vol) => {
      const buf = this.buffers.get(key);
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = Math.min(0.85, vol * intensity);
      src.connect(g).connect(this.master);
      src.start(now + delay);
    };

    if (this.buffers.has('chain1') || this.buffers.has('chain2')) {
      playSingle('chain1', 0.06, 0.94 + Math.random() * 0.14, 0.42);
      playSingle('chain2', 0.24, 0.90 + Math.random() * 0.18, 0.28);
    }
  }

  playStrike(index) {
    Haptics.crowbarHit();
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

    // v8.1: Плотный стальной удар ломом из Patch.gg (CC0) поверх базового удара
    const patchHitBuf = this.buffers.get('patch_metal_heavy') || this.buffers.get('patch_metal_clang');
    if (patchHitBuf) {
      const pSrc = this.ctx.createBufferSource();
      pSrc.buffer = patchHitBuf;
      pSrc.playbackRate.value = 0.88 + Math.random() * 0.22;
      const pg = this.ctx.createGain();
      pg.gain.value = 0.88;
      pSrc.connect(pg).connect(dest);
      pSrc.start(now);
    }
    const ringBuf = this.buffers.get('patch_barrel_ring');
    if (ringBuf) {
      const rSrc = this.ctx.createBufferSource();
      rSrc.buffer = ringBuf;
      rSrc.playbackRate.value = 0.72 + (index % 4) * 0.08;
      const rg = this.ctx.createGain();
      rg.gain.setValueAtTime(0.42, now + 0.015);
      rg.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      rSrc.connect(rg).connect(dest);
      rSrc.start(now + 0.015);
    }

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

    this.playChainRattle(0.95);
  }

  /**
   * v8.1: 4 реальных кино-хоррор скримера (waterphone, визг, ревун, удар в грудь + вибрация, БЕЗ аркадных писков)
   */
  playMiniScreamer(variant = null) {
    const rawIdx = variant == null ? Math.floor(Math.random() * 7) : Math.round(Number(variant) || 0);
    const idx = ((rawIdx % 7) + 7) % 7;
    const hapticMap = ['saw_scream', 'lid_blast', 'lid_blast', 'tesla_siren', 'tesla_siren', 'basement_shriek', 'basement_shriek'];
    const charKey = `horror_char_${idx}`;
    const fallbackFile = `./public/sfx/horror/char_${idx}.mp3`;
    Haptics.screamer(hapticMap[idx]);
    if (this._userMuted) return;

    // Если игрок кликнул до декодирования WebAudio — мгновенно бьём реальным актёрским треком через HTMLAudio!
    if (!this.ctx || !this.enabled || !this.buffers.has(charKey)) {
      try {
        const direct = new Audio(fallbackFile);
        direct.volume = 1.0;
        direct.play().catch(() => {});
      } catch { /* ignore */ }
    }
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended' && (typeof document === 'undefined' || !document.hidden)) {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    const bus = this.screamerBus || this.master;

    const b = this.buffers.get(charKey) || this.buffers.get('horror_jumpscare_shriek');
    if (b) {
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      const g = this.ctx.createGain();
      const dur = Math.min(3.45, b.duration || 3.35);
      // Полный необрезанный реальный крик/голос персонажа до самого конца с плавным хвостом эха!
      g.gain.setValueAtTime(1.85, now);
      g.gain.setValueAtTime(1.85, now + Math.max(0.5, dur - 0.25));
      g.gain.linearRampToValueAtTime(0.001, now + dur);
      s.connect(g).connect(bus);
      s.start(now);
      s.stop(now + dur + 0.08);
    }
  }

  /**
   * v8.1: Странные живые звуки из случайных бочек в темноте (3D-панорама + резонанс 200л стали + микровибрация)
   */
  playBarrelEerieSound(index = 0, kind = 'knock_urgent') {
    if (!this.ctx || !this.enabled || this.modalDucked) return;
    if (this.activeBarrel >= 0) return; // не перебиваем активную прослушку игрока
    const dest = this.panners[index] || this.master;
    const now = this.ctx.currentTime;

    // Резонансная цепь «внутри заваренной 200-литровой бочки» + короткое металлическое эхо
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 72;

    const bodyRes = this.ctx.createBiquadFilter();
    bodyRes.type = 'peaking';
    bodyRes.frequency.value = 320 + (index % 4) * 28;
    bodyRes.Q.value = 3.2;
    bodyRes.gain.value = 7.0;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2150;
    lp.Q.value = 1.4;

    const wetDelay = this.ctx.createDelay(0.25);
    wetDelay.delayTime.value = 0.068;
    const wetGain = this.ctx.createGain();
    wetGain.gain.value = 0.3;

    const outGain = this.ctx.createGain();
    outGain.gain.value = 0.82;

    hp.connect(bodyRes).connect(lp);
    lp.connect(outGain);
    lp.connect(wetDelay).connect(wetGain).connect(outGain);
    outGain.connect(dest);

    Haptics.barrelEerie();

    const playSample = (key, { rate = 1.0, vol = 0.85, delay = 0 } = {}) => {
      const b = this.buffers.get(key);
      if (!b) return false;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(hp);
      src.start(now + delay);
      return true;
    };

    if (kind === 'knock_urgent') {
      if (!playSample('horror_barrel_banging', { rate: 0.96 + Math.random() * 0.1, vol: 0.95 })) {
        [0, 0.17, 0.36].forEach((off, i) => {
          playSample('knockInside', { rate: 0.92 + i * 0.06, vol: 0.72 + i * 0.08, delay: off });
        });
      }
      return;
    }

    if (kind === 'creak_metal') {
      playSample('horror_barrel_groan', { rate: 0.92 + Math.random() * 0.16, vol: 0.92 })
        || playSample('patch_creak_eerie', { rate: 0.64 + Math.random() * 0.22, vol: 0.88 });
      return;
    }

    if (kind === 'nails_scrape') {
      playSample('horror_barrel_scratch', { rate: 0.95 + Math.random() * 0.12, vol: 0.95 })
        || playSample('decoy_nail_scrape', { rate: 0.95, vol: 0.75 });
      return;
    }

    if (kind === 'wet_slosh') {
      playSample('patch_slime_slosh', { rate: 0.66 + Math.random() * 0.18, vol: 0.82 });
      playSample('horror_barrel_breath', { rate: 0.9, vol: 0.65, delay: 0.12 });
      return;
    }

    if (kind === 'latch_rattle') {
      playSample('patch_metal_latch', { rate: 0.84, vol: 0.85 });
      playSample('patch_metal_latch', { rate: 1.06, vol: 0.68, delay: 0.21 });
      playSample('chain1', { rate: 0.92, vol: 0.42, delay: 0.08 });
      return;
    }

    if (kind === 'ominous_bell') {
      playSample('patch_bell_ominous', { rate: 0.56 + Math.random() * 0.16, vol: 0.72 });
      return;
    }

    // whisper_groan: жуткое прерывистое дыхание и шёпот изнутри бочки
    playSample('horror_barrel_breath', { rate: 0.94 + Math.random() * 0.12, vol: 0.98 });
  }

  /**
   * Атмосфера секретного уровня «Достучаться до небес» (прибой, чайки и минорный перебор акустической гитары)
   */
  startOceanEasterEggAudio() {
    this.stopOceanEasterEggAudio();
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended' && (typeof document === 'undefined' || !document.hidden)) {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    this._oceanActive = true;
    this._oceanNodes = [];
    this._oceanTimers = [];

    // 1. Шум морского прибоя (розовый шум через медленный LFO волн)
    if (this.noiseBuffer) {
      const surfSrc = this.ctx.createBufferSource();
      surfSrc.buffer = this.noiseBuffer;
      surfSrc.loop = true;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(380, now);

      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.16; // цикл волны ~6.2 сек
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(lp.frequency);

      const surfGain = this.ctx.createGain();
      surfGain.gain.setValueAtTime(0.001, now);
      surfGain.gain.linearRampToValueAtTime(0.28, now + 1.4);

      surfSrc.connect(lp).connect(surfGain).connect(this.master);
      surfSrc.start(now);
      lfo.start(now);
      this._oceanNodes.push(surfSrc, lfo, surfGain);
    }

    // 2. Далёкие крики чаек
    const playGull = () => {
      if (!this._oceanActive || !this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      [0, 0.34].forEach((offset, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        const peak = idx === 0 ? 2150 : 1880;
        osc.frequency.setValueAtTime(peak * 0.78, t + offset);
        osc.frequency.linearRampToValueAtTime(peak, t + offset + 0.08);
        osc.frequency.exponentialRampToValueAtTime(peak * 0.62, t + offset + 0.28);
        g.gain.setValueAtTime(0.001, t + offset);
        g.gain.linearRampToValueAtTime(0.055, t + offset + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.3);
        osc.connect(g).connect(this.master);
        osc.start(t + offset);
        osc.stop(t + offset + 0.32);
      });
      this._oceanTimers.push(window.setTimeout(playGull, 4600 + Math.random() * 2800));
    };
    this._oceanTimers.push(window.setTimeout(playGull, 1100));

    // 3. Минорный перебор акустической гитары (Am -> Fmaj7 -> Dm7 -> E7)
    const chords = [
      [110.0, 164.81, 220.0, 261.63, 329.63, 261.63, 220.0, 164.81], // Am
      [87.31, 130.81, 174.61, 220.0, 329.63, 220.0, 174.61, 130.81], // Fmaj7
      [146.83, 220.0, 261.63, 349.23, 261.63, 220.0, 174.61, 220.0], // Dm7
      [82.41, 123.47, 164.81, 207.65, 293.66, 207.65, 164.81, 123.47], // E7
    ];
    let step = 0;

    const pluckNote = (freq) => {
      if (!this._oceanActive || !this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, t);
      osc2.frequency.setValueAtTime(freq * 2.0, t);

      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(freq * 5.2, t);
      lp.frequency.exponentialRampToValueAtTime(freq * 1.4, t + 1.35);

      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.65);

      const mix2 = this.ctx.createGain();
      mix2.gain.value = 0.22;

      osc1.connect(lp);
      osc2.connect(mix2).connect(lp);
      lp.connect(g).connect(this.master);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 1.7);
      osc2.stop(t + 1.7);
    };

    const tickArpeggio = () => {
      if (!this._oceanActive) return;
      if (typeof document === 'undefined' || !document.hidden) {
        if (this.ctx && this.ctx.state === 'running' && this.enabled && !this._userMuted) {
          const chordIdx = Math.floor(step / 8) % chords.length;
          const noteIdx = step % 8;
          pluckNote(chords[chordIdx][noteIdx]);
          step += 1;
        }
      }
      this._oceanArpTimer = window.setTimeout(tickArpeggio, 340);
    };
    this._oceanArpTimer = window.setTimeout(tickArpeggio, 550);
  }

  stopOceanEasterEggAudio() {
    this._oceanActive = false;
    if (this._oceanArpTimer) {
      clearTimeout(this._oceanArpTimer);
      this._oceanArpTimer = null;
    }
    if (Array.isArray(this._oceanTimers)) {
      this._oceanTimers.forEach((id) => clearTimeout(id));
      this._oceanTimers = [];
    }
    if (Array.isArray(this._oceanNodes)) {
      this._oceanNodes.forEach((n) => {
        try { if (typeof n.stop === 'function') n.stop(); } catch { /* ignore */ }
        try { n.disconnect(); } catch { /* ignore */ }
      });
      this._oceanNodes = [];
    }
  }

  /**
   * Промах по пустой бочке: громкий гулкий звон пустого железа + резкий пшик пара + вибрация телефона
   */
  playEmptyBarrelClang(index = 0) {
    Haptics.lidBlast();
    if (!this.ctx || !this.enabled) return;
    const dest = this.panners[index] || this.master;
    const now = this.ctx.currentTime;

    const slamBuf = this.buffers.get('patch_hatch_slam') || this.buffers.get('patch_barrel_ring');
    if (slamBuf) {
      const s = this.ctx.createBufferSource();
      s.buffer = slamBuf;
      s.playbackRate.value = 0.84 + Math.random() * 0.18;
      const sg = this.ctx.createGain();
      sg.gain.value = 0.85;
      s.connect(sg).connect(dest);
      s.start(now);
    }

    // Неоднородные обертоны пустой стальной бочки (долгий гул)
    const partials = [[118, 0.55, 1.7], [187, 0.42, 1.45], [293, 0.34, 1.15], [441, 0.24, 0.85], [663, 0.16, 0.6]];
    for (const [f, amp, dur] of partials) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * (0.985 + Math.random() * 0.03), now);
      o.frequency.exponentialRampToValueAtTime(f * 0.93, now + dur);
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g).connect(dest);
      o.start(now);
      o.stop(now + dur + 0.05);
    }

    // Глухой удар по корпусу
    const thump = this.ctx.createOscillator();
    const thumpG = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(88, now);
    thump.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    thumpG.gain.setValueAtTime(0.9, now);
    thumpG.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    thump.connect(thumpG).connect(dest);
    thump.start(now);
    thump.stop(now + 0.24);

    // Резкий пшик пара / ржавой пыли из-под крышки
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2600, now);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.5, now + 0.025);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      src.connect(hp).connect(ng).connect(this.master);
      src.start(now);
      src.stop(now + 0.55);
    }
  }

  playLidBlowOff(survived = true) {
    if (survived) Haptics.success();
    else Haptics.error();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

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

    this.playChainRattle(1.2);
  }

  /**
   * Мощный полноэкранный скример v8.0 на 0 dBFS:
   * реальный нормализованный сэмпл (-0.3 dBFS) + пиковый компрессор + суб-удар + максимальная вибрация
   */
  playFullScreamer(variant = 'saw_scream', { preview = false } = {}) {
    const normKey = SCREAMER_KEY_ALIAS[variant] || 'saw_scream';
    if (preview) {
      Haptics.heavy();
    } else {
      Haptics.screamer(normKey);
    }
    if (!this.ctx || !this.enabled) {
      if (!this._userMuted && normKey !== 'prank_rooster' && normKey !== 'prank_dog_alarm') {
        const earlyHorrorMap = {
          saw_scream: 'horror_jumpscare_shriek',
          lid_blast: 'horror_jumpscare_lunge',
          tesla_siren: 'horror_jumpscare_klaxon',
          basement_shriek: 'horror_jumpscare_waterphone',
          horror_banging: 'horror_barrel_banging',
          horror_scratch: 'horror_barrel_scratch',
          horror_groan: 'horror_barrel_groan',
          horror_whisper: 'horror_barrel_breath',
        };
        const earlyKey = normKey.startsWith('horror_char_') ? normKey : (earlyHorrorMap[normKey] || 'horror_jumpscare_shriek');
        const earlyUrl = SFX_PATHS[earlyKey] || SFX_PATHS.horror_jumpscare_shriek;
        if (earlyUrl) {
          try {
            const direct = new Audio(earlyUrl);
            direct.volume = preview ? 0.85 : 1.0;
            direct.play().catch(() => {});
          } catch { /* ignore */ }
        }
      }
      return;
    }
    const now = this.ctx.currentTime;
    const bus = this.screamerBus || this.master;

    // v11.5: Настоящие живые записи петуха (кукареку) и злого ротвейлера — без синтетики и пищалок!
    if (normKey === 'prank_rooster' || normKey === 'prank_dog_alarm') {
      const realKey = normKey === 'prank_rooster' ? 'prank_real_rooster' : 'prank_real_dog';
      const playRealPrankBuf = (buf) => {
        if (!buf || !this.ctx || !this.enabled) return;
        const t0 = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(preview ? 1.35 : 1.95, t0);
        src.connect(g).connect(bus);
        src.start(t0);
        if (preview) src.stop(t0 + 2.55);
      };
      const cached = this.buffers.get(realKey);
      if (cached) {
        playRealPrankBuf(cached);
      } else {
        const url = SFX_PATHS[realKey];
        if (url) {
          fetch(url)
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .then((ab) => (ab && this.ctx ? this.ctx.decodeAudioData(ab) : null))
            .then((decoded) => {
              if (decoded) {
                this.buffers.set(realKey, decoded);
                playRealPrankBuf(decoded);
              }
            })
            .catch(() => {});
        }
      }
      if (!preview) this.playLidBlowOff?.(false);
      return;
    }

    const horrorMap = {
      saw_scream: 'horror_jumpscare_shriek',
      lid_blast: 'horror_jumpscare_lunge',
      tesla_siren: 'horror_jumpscare_klaxon',
      basement_shriek: 'horror_jumpscare_waterphone',
      horror_banging: 'horror_barrel_banging',
      horror_scratch: 'horror_barrel_scratch',
      horror_groan: 'horror_barrel_groan',
      horror_whisper: 'horror_barrel_breath',
      horror_char_0: 'horror_char_0',
      horror_char_1: 'horror_char_1',
      horror_char_2: 'horror_char_2',
      horror_char_3: 'horror_char_3',
      horror_char_4: 'horror_char_4',
      horror_char_5: 'horror_char_5',
      horror_char_6: 'horror_char_6',
    };
    const targetHorrorKey = horrorMap[normKey] || 'horror_jumpscare_shriek';
    const sampleBuf =
      this.buffers.get(targetHorrorKey) ||
      this.buffers.get(`scream_${normKey}`) ||
      this.buffers.get('horror_jumpscare_shriek') ||
      this.buffers.get('scream1');
    if (sampleBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = sampleBuf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(preview ? 1.15 : 1.75, now);
      src.connect(g).connect(bus);
      src.start(now);
      if (preview) src.stop(now + 1.95);
    } else if (!this._userMuted) {
      const fallbackUrl = SFX_PATHS[targetHorrorKey] || SFX_PATHS.horror_jumpscare_shriek;
      if (fallbackUrl) {
        try {
          const direct = new Audio(fallbackUrl);
          direct.volume = preview ? 0.85 : 1.0;
          direct.play().catch(() => {});
        } catch { /* ignore */ }
      }
    }

    // v8.1: Второй слой Patch CC0 (взрыв / разряд / колокол + глубокий sub_boom)
    const extraPatchKey =
      normKey === 'lid_blast'
        ? 'patch_blast_crunch'
        : normKey === 'tesla_siren'
          ? 'patch_tesla_arc'
          : normKey === 'basement_shriek'
            ? 'patch_bell_ominous'
            : 'patch_sub_boom';
    const extraBuf = this.buffers.get(extraPatchKey);
    if (extraBuf) {
      const ex = this.ctx.createBufferSource();
      ex.buffer = extraBuf;
      ex.playbackRate.value = normKey === 'basement_shriek' ? 0.65 : 1.0;
      const eg = this.ctx.createGain();
      eg.gain.setValueAtTime(preview ? 0.65 : 1.05, now);
      ex.connect(eg).connect(bus);
      ex.start(now);
      if (preview) ex.stop(now + 1.1);
    }
    if (!preview) {
      const subBoom = this.buffers.get('patch_sub_boom');
      if (subBoom && extraPatchKey !== 'patch_sub_boom') {
        const sb = this.ctx.createBufferSource();
        sb.buffer = subBoom;
        const sbg = this.ctx.createGain();
        sbg.gain.value = 0.95;
        sb.connect(sbg).connect(bus);
        sb.start(now);
      }
      const secondHorror = this.buffers.get(normKey === 'saw_scream' ? 'horror_jumpscare_waterphone' : 'horror_jumpscare_shriek');
      if (secondHorror) {
        const sh = this.ctx.createBufferSource();
        sh.buffer = secondHorror;
        sh.playbackRate.value = 0.92;
        const shg = this.ctx.createGain();
        shg.gain.setValueAtTime(0.75, now + 0.05);
        shg.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
        sh.connect(shg).connect(bus);
        sh.start(now + 0.05);
        sh.stop(now + 1.5);
      }
    }

    const boom = this.ctx.createOscillator();
    const boomG = this.ctx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(normKey === 'lid_blast' ? 165 : 112, now);
    boom.frequency.exponentialRampToValueAtTime(26, now + (preview ? 0.7 : 1.5));
    boomG.gain.setValueAtTime(preview ? 0.65 : 1.0, now);
    boomG.gain.exponentialRampToValueAtTime(0.001, now + (preview ? 0.75 : 1.6));
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    boom.connect(lp).connect(boomG).connect(bus);
    boom.start(now);
    boom.stop(now + (preview ? 0.8 : 1.65));

    if (!sampleBuf) {
      const scr = this.ctx.createOscillator();
      const mod = this.ctx.createOscillator();
      const modG = this.ctx.createGain();
      const scrG = this.ctx.createGain();
      scr.type = 'sawtooth';
      scr.frequency.setValueAtTime(normKey === 'tesla_siren' ? 880 : 540, now);
      scr.frequency.exponentialRampToValueAtTime(1620, now + 0.16);
      scr.frequency.exponentialRampToValueAtTime(420, now + 1.2);
      mod.frequency.value = 78;
      modG.gain.value = 340;
      scrG.gain.setValueAtTime(0.001, now);
      scrG.gain.exponentialRampToValueAtTime(0.85, now + 0.025);
      scrG.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      mod.connect(modG).connect(scr.frequency);
      scr.connect(scrG).connect(bus);
      mod.start(now);
      scr.start(now);
      mod.stop(now + 1.35);
      scr.stop(now + 1.35);
    }

    if (normKey === 'tesla_siren') this.playFactorySirenKlaxon?.();
    if (!preview) this.playChainRattle?.(1.4);
  }

  async playScreamerPreview(variant = 'saw_scream') {
    await this.unlock(true);
    this.playFullScreamer(variant, { preview: true });
  }

  /**
   * Победа: глубокий вдох спасённого (нарастающий шум) + вспышка света
   */
  playDeepBreath() {
    try { navigator.vibrate?.([40, 30, 70]); } catch { /* ignore */ }
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    if (this.noiseBuffer) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(320, now);
      bp.frequency.exponentialRampToValueAtTime(1500, now + 0.95);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.5, now + 0.8);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
      n.connect(bp).connect(g).connect(this.master);
      n.start(now);
      n.stop(now + 1.4);
    }
    const ch = this.ctx.createOscillator();
    const chG = this.ctx.createGain();
    ch.type = 'sine';
    ch.frequency.setValueAtTime(660, now + 0.78);
    chG.gain.setValueAtTime(0.0001, now + 0.78);
    chG.gain.exponentialRampToValueAtTime(0.28, now + 0.82);
    chG.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    ch.connect(chG).connect(this.master);
    ch.start(now + 0.78);
    ch.stop(now + 1.65);
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

    const drone = this.ctx.createOscillator();
    const drone2 = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    drone.type = 'sawtooth';
    drone.frequency.value = 46;
    drone2.type = 'triangle';
    drone2.frequency.value = 69.2;

    lp.type = 'lowpass';
    lp.frequency.value = 240;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 1.4);

    drone.connect(lp);
    drone2.connect(lp);
    lp.connect(g).connect(this.master);
    drone.start(now);
    drone2.start(now);
  }

  async _loadBufferKey(key) {
    if (this.buffers.has(key)) return;
    const url = SFX_PATHS[key];
    if (!url || !this.ctx) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arr);
      this.buffers.set(key, decoded);
    } catch { /* ignore */ }
  }

  async _preloadBuffers() {
    const immediateKeys = ['hitMid', 'target_human'];
    // На старте грузим строго 2 базовых звука первого экрана, чтобы не тормозить 3G и RPC
    await Promise.allSettled(immediateKeys.map((k) => this._loadBufferKey(k)));
  }

  schedulePostRoundPreload() {
    if (this._bgPreloadScheduled || !this.enabled || !this.ctx || typeof window === 'undefined') return;
    this._bgPreloadScheduled = true;

    const startHumIfReady = () => {
      const humBuf = this.buffers.get('hum');
      if (humBuf && this.ctx && this.enabled && !this._humLoopStarted) {
        this._humLoopStarted = true;
        const src = this.ctx.createBufferSource();
        src.buffer = humBuf;
        src.loop = true;
        const g = this.ctx.createGain();
        g.gain.value = 0.28;
        src.connect(g).connect(this.master);
        try { src.start(0); } catch { /* ignore */ }
      }
    };

    const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
    const isSlowConn = Boolean(conn?.saveData || /2g|3g/i.test(String(conn?.effectiveType || '')));

    window.setTimeout(async () => {
      for (const k of ['hum', 'knockInside', 'target_ticket', 'target_empty']) {
        if (!this.enabled || !this.ctx) break;
        await this._loadBufferKey(k);
      }
      startHumIfReady();
    }, isSlowConn ? 7500 : 4500);

    if (!isSlowConn) {
      window.setTimeout(async () => {
        for (const k of ['hitHigh', 'crowbar', 'lidBlow', 'target_muffled_1']) {
          if (!this.enabled || !this.ctx) break;
          await this._loadBufferKey(k);
        }
      }, 9500);
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

  playCountdownBeat(isFinalGo = false) {
    if (isFinalGo) Haptics.heavy();
    else Haptics.light();
    if (!this.enabled || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = isFinalGo ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isFinalGo ? 185 : 88, now);
    osc.frequency.exponentialRampToValueAtTime(isFinalGo ? 58 : 42, now + (isFinalGo ? 0.28 : 0.16));
    g.gain.setValueAtTime(isFinalGo ? 0.52 : 0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isFinalGo ? 0.32 : 0.18));
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + (isFinalGo ? 0.34 : 0.2));

    if (isFinalGo) {
      const hit = this.buffers.get('hitHigh');
      if (hit) {
        const s = this.ctx.createBufferSource();
        s.buffer = hit;
        const hg = this.ctx.createGain();
        hg.gain.value = 0.65;
        s.connect(hg).connect(this.master);
        try { s.start(now); } catch { /* ignore */ }
      }
    }
  }

  setFactoryZoneAcoustics(zoneId = 1) {
    this.activeZoneId = Math.max(1, Math.min(4, Number(zoneId) || 1));
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    // Лёгкий акустический импульс при смене цеха
    if (this.activeZoneId === 2) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(62, now);
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.46);
    }
  }

  playFactorySirenKlaxon() {
    Haptics.heavy();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.linearRampToValueAtTime(680, now + 0.24);
    osc1.frequency.linearRampToValueAtTime(410, now + 0.52);
    osc2.frequency.setValueAtTime(446, now);
    osc2.frequency.linearRampToValueAtTime(688, now + 0.24);
    osc2.frequency.linearRampToValueAtTime(415, now + 0.52);
    g.gain.setValueAtTime(0.38, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc1.connect(g);
    osc2.connect(g);
    g.connect(this.master);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.56);
    osc2.stop(now + 0.56);
  }

  playSteamWarningHiss() {
    Haptics.light();
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2400, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    nSrc.connect(hp).connect(g).connect(this.master);
    nSrc.start(now);
    nSrc.stop(now + 0.17);
  }

  playSteamPenaltyBurst() {
    Haptics.heavy();
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1950, now);
    bp.frequency.exponentialRampToValueAtTime(620, now + 0.52);
    bp.Q.value = 2.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.76, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    nSrc.connect(bp).connect(g).connect(this.master);
    nSrc.start(now);
    nSrc.stop(now + 0.56);
  }

  playAirBlowWhoosh() {
    Haptics.success();
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, now);
    bp.frequency.exponentialRampToValueAtTime(1480, now + 0.38);
    bp.Q.value = 1.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.64, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    nSrc.connect(bp).connect(g).connect(this.master);
    nSrc.start(now);
    nSrc.stop(now + 0.44);
  }

  // v16.0: Звуки 3-фазного режима «Играть с Тилем» (0 задержки, чистый WebAudio + буферы)
  playTilBeat(step = 1) {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = step === 1 ? 210 : 275;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.14);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playTilGoSignal() {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.025);
      g.gain.setValueAtTime(0.28, now + i * 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.28 + i * 0.03);
      osc.connect(g).connect(this.master);
      osc.start(now + i * 0.025);
      osc.stop(now + 0.34);
    });
  }

  playTilFreezeAlert() {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(165, now + 0.22);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, now);
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playTilTap(progressPct = 50) {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    const ratio = Math.max(0, Math.min(1, Number(progressPct || 0) / 100));
    // Живой металлический стук бочки + нарастающий тон как в раннем Notcoin
    const hitBuf = this.buffers.get('hitMid') || this.buffers.get('hitHigh');
    if (hitBuf) {
      const s = this.ctx.createBufferSource();
      s.buffer = hitBuf;
      s.playbackRate.value = 0.92 + ratio * 0.42;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.55, now);
      s.connect(g).connect(this.master);
      s.start(now);
    }
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    const f0 = 155 + ratio * 230;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(62 + ratio * 45, now + 0.085);
    g.gain.setValueAtTime(0.34, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playTilCaught() {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    [195, 146.8].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      osc.frequency.linearRampToValueAtTime(freq * 0.72, now + i * 0.08 + 0.16);
      g.gain.setValueAtTime(0.34, now + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.18);
      osc.connect(g).connect(this.master);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  }

  playTilFalseStart() {
    this.playTilCaught();
  }

  playTilCountTick(step = 1) {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running' && (typeof document === 'undefined' || !document.hidden)) {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    const baseFreq = step >= 2 ? 440 : 330;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.52, now + 0.09);
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playTilBonus() {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running' && (typeof document === 'undefined' || !document.hidden)) this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    [523.25, 659.25, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      g.gain.setValueAtTime(0.24, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.24);
      osc.connect(g).connect(this.master);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.26);
    });
  }

  playTilVictory() {
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    [392.0, 493.88, 587.33, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.065);
      g.gain.setValueAtTime(0.26, now + i * 0.065);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.065 + 0.55);
      osc.connect(g).connect(this.master);
      osc.start(now + i * 0.065);
      osc.stop(now + i * 0.065 + 0.58);
    });
  }

  playFalseStartBuzz() {
    Haptics.error();
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    [0, 0.13].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(idx === 0 ? 190 : 142, now + offset);
      osc.frequency.exponentialRampToValueAtTime(92, now + offset + 0.11);
      g.gain.setValueAtTime(0.32, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
      osc.connect(g).connect(this.master);
      osc.start(now + offset);
      osc.stop(now + offset + 0.13);
    });
  }

  playBarrelPullScrape() {
    Haptics.heavy();
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.95);
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(620, now);
    filt.frequency.exponentialRampToValueAtTime(180, now + 0.95);
    filt.Q.value = 3.5;
    g.gain.setValueAtTime(0.38, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.98);
    osc.connect(filt).connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  playLidSlamShut() {
    Haptics.heavy();
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    // Heavy sub thud
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(118, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.55);
    sg.gain.setValueAtTime(0.62, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    sub.connect(sg).connect(this.master);
    sub.start(now);
    sub.stop(now + 0.68);
    // Iron clang ring
    [295, 442, 690].forEach((freq, i) => {
      const m = this.ctx.createOscillator();
      const mg = this.ctx.createGain();
      m.type = i === 0 ? 'square' : 'triangle';
      m.frequency.setValueAtTime(freq, now);
      m.frequency.exponentialRampToValueAtTime(freq * 0.84, now + 0.45);
      mg.gain.setValueAtTime(0.18 / (i + 1), now);
      mg.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      m.connect(mg).connect(this.master);
      m.start(now);
      m.stop(now + 0.55);
    });
  }

  playRewardChime() {
    Haptics.success();
    if (!this.ctx || !this.enabled || !this.master) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    [587.33, 783.99, 987.77, 1318.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      g.gain.setValueAtTime(0.24, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.34);
      osc.connect(g).connect(this.master);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.36);
    });
  }

  // v8.0: микрофон в цеху полностью отключён (запрос ТОЛЬКО на кнопке записи крика в окне упаковки)
  async startMicBlowDetector() {
    return false;
  }

  stopMicBlowDetector() {
    /* noop */
  }
}

export const audio = new WorkshopAudio();
