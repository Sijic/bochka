const MAX_VOICE_MS = 5000;
const IDB_NAME = 'bochka_v2_media_idb';
const IDB_STORE = 'media';

function pickSupportedAudioMime() {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', ext: 'webm' };
  }
  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    } catch { /* ignore */ }
  }
  return { mimeType: '', ext: 'webm' };
}

/**
 * Диктофон голосового послания на дно бочки (до 5 секунд, сжатие Opus <= 40 КБ).
 */
export class BarrelVoiceRecorder {
  constructor({ onTick, onStop, onError } = {}) {
    this.onTick = onTick || (() => {});
    this.onStop = onStop || (() => {});
    this.onError = onError || (() => {});

    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.recording = false;
    this.startedAt = 0;
    this.rafId = 0;
    this.autoStopTimer = null;

    this.meterCtx = null;
    this.analyser = null;
    this.meterData = null;
  }

  get isRecording() {
    return this.recording;
  }

  async start() {
    if (this.recording) return true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.onError('unsupported');
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch {
      this.onError('denied');
      return false;
    }

    const { mimeType, ext } = pickSupportedAudioMime();
    const opts = { audioBitsPerSecond: 16000 };
    if (mimeType) opts.mimeType = mimeType;

    try {
      this.recorder = new MediaRecorder(this.stream, opts);
    } catch {
      try {
        this.recorder = new MediaRecorder(this.stream);
      } catch {
        this._cleanupStream();
        this.onError('unsupported');
        return false;
      }
    }

    this.chunks = [];
    this.recording = true;
    this.startedAt = performance.now();

    this._setupLevelMeter(this.stream);

    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.chunks.push(ev.data);
      }
    };

    this.recorder.onstop = () => {
      const durationSec = Math.min(5.0, Math.max(0.3, (performance.now() - this.startedAt) / 1000));
      const finalType = this.recorder?.mimeType || mimeType || 'audio/webm';
      const rawBlob = new Blob(this.chunks, { type: finalType });
      this._cleanupAll();

      if (rawBlob.size < 180) {
        this.onError('too_short');
        return;
      }

      const objectUrl = URL.createObjectURL(rawBlob);
      this.onStop({
        blob: rawBlob,
        mimeType: finalType,
        ext,
        durationSec: Number(durationSec.toFixed(1)),
        sizeKb: Math.max(1, Math.round(rawBlob.size / 1024)),
        objectUrl,
      });
    };

    this.recorder.start(150);

    this.autoStopTimer = window.setTimeout(() => {
      if (this.recording) this.stop();
    }, MAX_VOICE_MS);

    const loop = () => {
      if (!this.recording) return;
      const elapsedMs = Math.min(MAX_VOICE_MS, performance.now() - this.startedAt);
      const level = this._readLevel();
      this.onTick({
        elapsedSec: elapsedMs / 1000,
        remainingSec: Math.max(0, (MAX_VOICE_MS - elapsedMs) / 1000),
        progress: Math.min(1, elapsedMs / MAX_VOICE_MS),
        level,
      });
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    return true;
  }

  stop() {
    if (!this.recording) return;
    this.recording = false;
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      } else {
        this._cleanupAll();
      }
    } catch {
      this._cleanupAll();
    }
  }

  _setupLevelMeter(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.meterCtx = new AudioCtx();
      const src = this.meterCtx.createMediaStreamSource(stream);
      this.analyser = this.meterCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.meterData = new Uint8Array(this.analyser.frequencyBinCount);
      src.connect(this.analyser);
    } catch { /* ignore */ }
  }

  _readLevel() {
    if (!this.analyser || !this.meterData) return 0.25;
    this.analyser.getByteTimeDomainData(this.meterData);
    let sum = 0;
    for (let i = 0; i < this.meterData.length; i++) {
      const v = (this.meterData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.meterData.length);
    return Math.min(1, rms * 4.2);
  }

  _cleanupStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((tr) => tr.stop());
      this.stream = null;
    }
    if (this.meterCtx) {
      try { this.meterCtx.close(); } catch { /* ignore */ }
      this.meterCtx = null;
    }
    this.analyser = null;
    this.meterData = null;
  }

  _cleanupAll() {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this._cleanupStream();
    this.recorder = null;
    this.recording = false;
  }
}

/* ============================================================================
   Локальное бинарное хранилище IndexedDB для теста ?b=jakaqgx (фото + голос)
   без переполнения localStorage и без раздувания URL!
   ============================================================================ */
function openMediaDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveLocalPackMedia(id, { photoBlob = null, voiceBlob = null } = {}) {
  if (!id) return false;
  const db = await openMediaDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({
        id,
        photoBlob: photoBlob || null,
        voiceBlob: voiceBlob || null,
        createdAt: Date.now(),
      });
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function loadLocalPackMedia(id) {
  if (!id) return null;
  const db = await openMediaDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result || null;
        db.close();
        if (!rec) {
          resolve(null);
          return;
        }
        resolve({
          photoBlob: rec.photoBlob || null,
          voiceBlob: rec.voiceBlob || null,
          photoObjectUrl: rec.photoBlob ? URL.createObjectURL(rec.photoBlob) : '',
          voiceObjectUrl: rec.voiceBlob ? URL.createObjectURL(rec.voiceBlob) : '',
        });
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}
