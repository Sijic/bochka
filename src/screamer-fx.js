/**
 * v8.2: 60fps Live-Animated Cinema-Horror Screamer Engine (<canvas>, 2.05s 3-Beat Choreography)
 * Beat 1 (0..45ms):   Чёрный срез (зрачок расширяется).
 * Beat 2 (45..540ms): «ВЗГЛЯД» (Кадр A) — чётко заметное живое движение ДО броска:
 *                     • Пастор: глаза реально косятся в сторону и резко фиксируются на игроке
 *                     • Мужик: широкий луч фонаря реально скользит по темноте и бьёт в глаза
 *                     • Девушка: рука медленно поднимается к стеклу
 * Beat 3 (540..1900ms): «БРОСОК И КРИК» (жёсткий снэп в Кадр B + 1.35 сек живого экшена!):
 *                     • Пастор: оскал, расширенные безумные глаза дёргаются влево-вправо, зум в лицо
 *                     • Мужик: слепящая вспышка фонаря в объектив с лучами + рык
 *                     • Девушка: широко раскрытый кричащий рот с вокальным тремором челюсти + удар руки в стекло (трещины!)
 *                     • Монстр/Противогаз/Когти/CCTV: бросок, искры сварки, трещины, VHS-разрывы
 * Beat 4 (1900..2050ms): Резкий срез в чёрноту.
 */

const _imgCache = new Map();

function getCachedImg(src) {
  if (!src) return null;
  let rec = _imgCache.get(src);
  if (!rec) {
    const img = new Image();
    img.decoding = 'async';
    rec = { img, loaded: false };
    img.onload = () => { rec.loaded = true; };
    img.src = src;
    _imgCache.set(src, rec);
  }
  return rec;
}

export function preloadScreamerFrames(entries = []) {
  for (const item of entries) {
    if (item?.img) getCachedImg(item.img);
    if (item?.imgB) getCachedImg(item.imgB);
  }
}

function drawCover(ctx, img, w, h, scale = 1, dx = 0, dy = 0, rot = 0, alpha = 1) {
  if (!img || !img.naturalWidth) return;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const baseScale = Math.max(w / iw, h / ih) * scale;
  const dw = iw * baseScale;
  const dh = ih * baseScale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w * 0.5 + dx, h * 0.48 + dy);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -dw * 0.5, -dh * 0.5, dw, dh);
  ctx.restore();
}

function drawGlassCrack(ctx, cx, cy, radius, progress) {
  if (progress <= 0) return;
  ctx.save();
  const alpha = Math.min(0.92, progress * 0.95);
  ctx.strokeStyle = `rgba(240, 248, 255, ${alpha})`;
  ctx.lineWidth = Math.max(2, radius * 0.008);
  ctx.shadowColor = 'rgba(255,255,255,0.75)';
  ctx.shadowBlur = 5;
  const rays = 13;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + (i % 2 ? 0.16 : -0.11);
    const len = radius * (0.48 + ((i * 37) % 10) * 0.065) * Math.min(1, progress * 1.45);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const mx = cx + Math.cos(a + 0.09) * len * 0.52;
    const my = cy + Math.sin(a + 0.09) * len * 0.52;
    const ex = cx + Math.cos(a - 0.06) * len;
    const ey = cy + Math.sin(a - 0.06) * len;
    ctx.lineTo(mx, my);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  for (const rFrac of [0.16, 0.32, 0.52, 0.72]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * rFrac * Math.min(1, progress * 1.25), 0.15, Math.PI * 1.88);
    ctx.stroke();
  }
  ctx.restore();
}

export class HorrorScreamerPlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d', { alpha: false }) || null;
    this.rafId = 0;
    this.running = false;
    this.sparks = [];
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  play({ imgA, imgB = '', motion = 'barrel_face', durationMs = 3200 } = {}) {
    this.stop();
    if (!this.canvas || !this.ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.15);
    const w = Math.max(160, Math.round(window.innerWidth * dpr));
    const h = Math.max(160, Math.round(window.innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const recA = getCachedImg(imgA);
    const recB = imgB ? getCachedImg(imgB) : null;

    // Искры сварки для противогаза / механика
    this.sparks = Array.from({ length: 44 }, () => ({
      x: w * (0.25 + Math.random() * 0.5),
      y: h * (0.35 + Math.random() * 0.4),
      vx: (Math.random() - 0.5) * w * 1.8,
      vy: (Math.random() - 0.72) * h * 1.6,
      size: (2.4 + Math.random() * 4.0) * dpr,
    }));

    const startMs = performance.now();
    this.running = true;
    const snapMs = 600; // Точно синхронизировано с моментом ядерного удара в char_0..6.mp3 (0.58-0.60s)!

    const render = (now) => {
      if (!this.running) return;
      const elapsed = now - startMs;
      const total = Math.max(600, durationMs);
      const ctx = this.ctx;

      // Beat 1 (0..45ms): Абсолютно чёрный срез перед появлением
      if (elapsed < 45) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        this.rafId = requestAnimationFrame(render);
        return;
      }

      // Beat 4 (последние 180ms): плавный уход в черноту без обрыва
      if (elapsed >= total) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        this.stop();
        return;
      }
      const fadeOutAlpha = elapsed > total - 200 ? Math.max(0, (total - elapsed) / 200) : 1;

      const isClimax = elapsed >= snapMs;
      const stareT = Math.min(1, Math.max(0, (elapsed - 45) / (snapMs - 45)));
      const climaxT = isClimax ? Math.min(1, (elapsed - snapMs) / Math.max(400, total - 180 - snapMs)) : 0;

      const hasB = Boolean(recB?.loaded && recB.img.naturalWidth);
      const hasA = Boolean(recA?.loaded && recA.img.naturalWidth);

      // Чёткая 2-актная смена кадров:
      // Beat 2 (45..530ms): Кадр A (чтобы глаз успел разглядеть лицо и движение глаз/фонаря/руки)
      // Beat 3 (530..1900ms): Кадр B (бросок, оскал, кричащий рот, слепящий фонарь) с 1 нервным спазмом
      let useB = false;
      if (hasB && isClimax) {
        const twitchFrame = (climaxT > 0.42 && climaxT < 0.47);
        useB = !twitchFrame;
      }
      const curImg = (useB && hasB) ? recB.img : (hasA ? recA.img : (hasB ? recB.img : null));

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // Плавное зловещее приближение в Beat 2 -> резкий бросок и дрожь в Beat 3
      const zoom = isClimax
        ? 1.16 + climaxT * 0.28 + Math.sin(climaxT * 42) * 0.018
        : 1.0 + stareT * 0.09;
      const shakeAmp = isClimax
        ? (0.014 + Math.max(0, 1 - climaxT * 1.4) * 0.022) * Math.min(w, h)
        : 0.0022 * Math.min(w, h);
      const dx = (Math.sin(elapsed * 0.085) + Math.cos(elapsed * 0.17)) * shakeAmp * 0.55;
      const dy = (Math.cos(elapsed * 0.095) - Math.sin(elapsed * 0.14)) * shakeAmp * 0.45;
      const rot = isClimax ? Math.sin(elapsed * 0.055) * 0.042 : Math.sin(elapsed * 0.012) * 0.008;

      // Отрисовка основного кадра
      if (curImg) {
        ctx.save();
        if (motion === 'mechanic_flashlight' && !isClimax) {
          // В Beat 2 мужик в полумраке — луч фонаря сам освещает его лицо!
          ctx.filter = 'brightness(0.55) contrast(1.4)';
        } else if (isClimax && climaxT < 0.07) {
          ctx.filter = 'brightness(2.2) contrast(1.9)';
        } else {
          ctx.filter = 'contrast(1.22) saturate(0.88)';
        }
        drawCover(ctx, curImg, w, h, zoom, dx, dy, rot, 1);
        ctx.restore();

        // Усиленный живой тремор челюсти/рта на кричащих персонажах (Девушка + Лицо из бочки + Пастор)
        if (isClimax && (motion === 'captive_hand_mouth' || motion === 'barrel_face' || motion === 'warden_eyes')) {
          const mouthStretch = 1.0 + Math.abs(Math.sin(elapsed * 0.048)) * 0.14;
          const mouthTop = h * 0.52;
          const mouthH = h * 0.34;
          ctx.save();
          ctx.beginPath();
          ctx.rect(w * 0.16, mouthTop, w * 0.68, mouthH);
          ctx.clip();
          ctx.translate(w * 0.5, mouthTop);
          ctx.scale(1.0 + (mouthStretch - 1) * 0.25, mouthStretch);
          ctx.translate(-w * 0.5, -mouthTop);
          drawCover(ctx, curImg, w, h, zoom, dx * 1.15, dy + 4 * dpr, rot, 0.78);
          ctx.restore();
        }
      }

      // =========================================================================
      // УЗНАВАЕМЫЕ ЖИВЫЕ ДВИЖЕНИЯ ДЛЯ КАЖДОГО ХОРРОР-ПЕРСОНАЖА
      // =========================================================================

      // 1. ПАСТОР / НАДЗИРАТЕЛЬ: ГЛАЗА ВИДИМО КОСЯТСЯ -> РЕЗКО ФИКСИРУЮТСЯ -> ДЁРГАЮТСЯ В БЕЗУМИИ
      if (motion === 'warden_eyes') {
        // В Beat 2 глаза заметно едут слева направо -> на тебя; в Beat 3 нервно дёргаются!
        const eyeShiftX = isClimax
          ? Math.sin(elapsed * 0.062) * (w * 0.022)
          : (-0.032 + stareT * 0.036) * w;
        const eyeShiftY = isClimax
          ? Math.cos(elapsed * 0.048) * (h * 0.012)
          : (0.008 - stareT * 0.010) * h;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const exFrac of [0.415, 0.585]) {
          const ex = w * exFrac + dx + eyeShiftX;
          const ey = h * 0.375 + dy + eyeShiftY;
          const rEye = Math.min(w, h) * (isClimax ? 0.048 : 0.032);
          const gEye = ctx.createRadialGradient(ex, ey, 0, ex, ey, rEye);
          gEye.addColorStop(0, isClimax ? 'rgba(255, 250, 230, 0.98)' : 'rgba(220, 240, 255, 0.85)');
          gEye.addColorStop(0.32, isClimax ? 'rgba(255, 70, 50, 0.55)' : 'rgba(180, 220, 240, 0.32)');
          gEye.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gEye;
          ctx.beginPath();
          ctx.arc(ex, ey, rEye, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Тёмный «зрачок» внутри блика в Beat 2 -> делает движение взгляда абсолютно очевидным!
        if (!isClimax) {
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
          for (const exFrac of [0.415, 0.585]) {
            const px = w * exFrac + dx + eyeShiftX * 1.35;
            const py = h * 0.375 + dy + eyeShiftY * 1.2;
            ctx.beginPath();
            ctx.arc(px, py, Math.min(w, h) * 0.009, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // 2. МУЖИК / МЕХАНИК: ЗАМЕТНЫЙ СКОЛЬЗЯЩИЙ ЛУЧ ФОНАРЯ СЛЕВА НАПРАВО -> СЛЕПИТ ПРЯМО В ГЛАЗА
      if (motion === 'mechanic_flashlight') {
        const beamX = isClimax
          ? w * (0.50 + Math.sin(climaxT * 18) * 0.08)
          : w * (0.10 + stareT * 0.42);
        const beamY = isClimax
          ? h * (0.46 + Math.cos(climaxT * 14) * 0.06)
          : h * (0.64 - stareT * 0.18);
        const beamR = Math.max(w, h) * (isClimax ? (0.48 + Math.sin(climaxT * 28) * 0.08) : 0.34);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const gBeam = ctx.createRadialGradient(beamX, beamY, 0, beamX, beamY, beamR);
        gBeam.addColorStop(0, isClimax ? 'rgba(255, 254, 240, 1.0)' : 'rgba(255, 248, 215, 0.92)');
        gBeam.addColorStop(0.24, isClimax ? 'rgba(255, 232, 160, 0.68)' : 'rgba(235, 224, 165, 0.42)');
        gBeam.addColorStop(0.6, 'rgba(180, 160, 100, 0.12)');
        gBeam.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gBeam;
        ctx.fillRect(0, 0, w, h);

        // Анаморфотная горизонтальная полоса блика от фонарика прямо в объектив
        if (isClimax) {
          const flareH = Math.max(8, h * 0.032);
          const gStreak = ctx.createLinearGradient(0, beamY, w, beamY);
          gStreak.addColorStop(0, 'rgba(255,245,200,0)');
          gStreak.addColorStop(0.5, 'rgba(255,252,230,0.88)');
          gStreak.addColorStop(1, 'rgba(255,245,200,0)');
          ctx.fillStyle = gStreak;
          ctx.fillRect(0, beamY - flareH * 0.5, w, flareH);
        }
        ctx.restore();
      }

      // 3. ДЕВУШКА-ПЛЕННИЦА: УДАР РУКИ В СТЕКЛО + ТРЕЩИНЫ + БЕШЕНЫЙ КРИК
      if (motion === 'captive_hand_mouth') {
        if (isClimax) {
          const impact = Math.min(1, climaxT * 2.8);
          drawGlassCrack(ctx, w * 0.54 + dx, h * 0.56 + dy, Math.min(w, h) * 0.54, impact);
          if (climaxT < 0.14) {
            ctx.fillStyle = `rgba(255, 235, 235, ${(1 - climaxT / 0.14) * 0.55})`;
            ctx.fillRect(0, 0, w, h);
          }
        }
      }

      // 4. КОГТИ / РУКИ ИЗ ТЕМНОТЫ: ДВОЙНОЙ УДАР ПО СТЕКЛУ
      if (motion === 'claw_hands' && isClimax) {
        drawGlassCrack(ctx, w * 0.5 + dx, h * 0.5 + dy, Math.min(w, h) * 0.60, Math.min(1, climaxT * 2.4));
      }

      // 5. ПРОТИВОГАЗ / СВАРКА: ШКВАЛ ИСКР И АВАРИЙНАЯ СИРЕНА
      if (motion === 'gasmask_weld' && isClimax) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const sp of this.sparks) {
          const age = climaxT * 1.15;
          const sx = sp.x + sp.vx * age;
          const sy = sp.y + sp.vy * age + 0.5 * h * 1.7 * age * age;
          ctx.strokeStyle = 'rgba(255, 224, 130, 0.96)';
          ctx.lineWidth = sp.size * 0.72;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - sp.vx * 0.036, sy - sp.vy * 0.036);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. НОЧНАЯ КАМЕРА CCTV: ЗЕЛЁНЫЙ ФОСФОР И РАЗРЫВЫ VHS
      if (motion === 'cctv_glitch') {
        ctx.save();
        ctx.fillStyle = isClimax ? 'rgba(18, 95, 42, 0.24)' : 'rgba(14, 70, 32, 0.18)';
        ctx.fillRect(0, 0, w, h);
        if (isClimax && curImg && Math.floor(elapsed / 70) % 2 === 0) {
          const tearY = h * (0.2 + ((elapsed * 0.0017) % 0.6));
          const tearH = h * 0.11;
          ctx.beginPath();
          ctx.rect(0, tearY, w, tearH);
          ctx.clip();
          drawCover(ctx, curImg, w, h, zoom, dx + 26 * dpr, dy, rot, 0.92);
        }
        ctx.restore();
      }

      // 7. ЛИЦО ИЗ БОЧКИ: Чёрное стальное кольцо горловины по краям + красный ужас в Beat 3
      if (motion === 'barrel_face') {
        ctx.save();
        const rInner = Math.min(w, h) * (isClimax ? 0.36 + climaxT * 0.18 : 0.30);
        const gRim = ctx.createRadialGradient(w * 0.5, h * 0.48, rInner, w * 0.5, h * 0.48, Math.max(w, h) * 0.72);
        gRim.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gRim.addColorStop(0.75, isClimax ? 'rgba(95, 10, 10, 0.52)' : 'rgba(0, 0, 0, 0.78)');
        gRim.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
        ctx.fillStyle = gRim;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // Кино-виньетка и жёсткие вспышки только в момент удара Beat 3 (чтобы не прятать движение лица!)
      const strobeRed = isClimax && (climaxT < 0.06 || (climaxT > 0.38 && climaxT < 0.42));
      if (strobeRed) {
        ctx.fillStyle = climaxT < 0.06 ? 'rgba(255, 255, 255, 0.48)' : 'rgba(185, 18, 18, 0.36)';
        ctx.fillRect(0, 0, w, h);
      }

      const vig = ctx.createRadialGradient(
        w * 0.5, h * 0.46, Math.min(w, h) * 0.28,
        w * 0.5, h * 0.46, Math.max(w, h) * 0.72
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(0.76, isClimax ? 'rgba(70, 6, 6, 0.42)' : 'rgba(0, 0, 0, 0.48)');
      vig.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      if (fadeOutAlpha < 1) {
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - fadeOutAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      this.rafId = requestAnimationFrame(render);
    };

    this.rafId = requestAnimationFrame(render);
  }
}
