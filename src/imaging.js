import { resolveSiteAsset } from './env.js';

export const DEMO_PORTRAITS = [
  resolveSiteAsset('assets/images.jpg'),
  resolveSiteAsset('assets/images_6.jpg'),
  resolveSiteAsset('assets/images_5.jpg'),
  resolveSiteAsset('assets/images_2.jpg'),
];

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!String(src || '').startsWith('blob:') && !String(src || '').startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      if (img.crossOrigin) {
        const retry = new Image();
        retry.onload = () => resolve(retry);
        retry.onerror = () => reject(e);
        retry.src = src;
      } else {
        reject(e);
      }
    };
    img.src = src;
  });
}

export function createDefaultSilhouetteCanvas(seedText = '200L') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  const bg = ctx.createRadialGradient(256, 204, 24, 256, 256, 256);
  bg.addColorStop(0, '#334e63');
  bg.addColorStop(0.58, '#192632');
  bg.addColorStop(1, '#0b1015');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  // Тёплый контровой свет и силуэт героя внутри бочки
  const rimGlow = ctx.createRadialGradient(256, 232, 62, 256, 232, 165);
  rimGlow.addColorStop(0, 'rgba(250, 204, 21, 0.24)');
  rimGlow.addColorStop(0.65, 'rgba(56, 189, 248, 0.12)');
  rimGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rimGlow;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = '#0e141b';
  ctx.beginPath();
  ctx.ellipse(256, 426, 158, 110, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1f2d3b';
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(256, 234, 78, 96, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.beginPath();
  ctx.arc(227, 226, 5.5, 0, Math.PI * 2);
  ctx.arc(285, 226, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.font = '800 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(seedText, 256, 382);

  return c;
}

/**
 * Сжимает, кропает в квадрат 420x420 HD, вытягивает экспозицию и сочность лица,
 * добавляет яркие кино-эффекты по контуру бочки и гарантирует размер WebP <= 44 КБ.
 */
export async function processPortraitToWebP(source, frameStyle = 'flashlight') {
  let drawable = null;
  let sw = 512;
  let sh = 512;
  let mirror = false;

  if (!source) {
    drawable = createDefaultSilhouetteCanvas();
  } else if (source instanceof HTMLVideoElement) {
    drawable = source;
    sw = source.videoWidth || 640;
    sh = source.videoHeight || 480;
    mirror = true;
  } else if (source instanceof HTMLCanvasElement) {
    drawable = source;
    sw = source.width;
    sh = source.height;
  } else if (source instanceof HTMLImageElement) {
    drawable = source;
    sw = source.naturalWidth || source.width;
    sh = source.naturalHeight || source.height;
  } else if (source instanceof Blob || source instanceof File) {
    const objUrl = URL.createObjectURL(source);
    try {
      const img = await loadImageElement(objUrl);
      drawable = img;
      sw = img.naturalWidth || img.width;
      sh = img.naturalHeight || img.height;
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } else if (typeof source === 'string') {
    const img = await loadImageElement(source);
    drawable = img;
    sw = img.naturalWidth || img.width;
    sh = img.naturalHeight || img.height;
  }

  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const side = Math.min(sw, sh);
  const sx = Math.max(0, (sw - side) * 0.5);
  const sy = Math.max(0, (sh - side) * 0.42);

  ctx.save();
  if (mirror) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(drawable, sx, sy, side, side, 0, 0, SIZE, SIZE);
  ctx.restore();

  applyVividCinemaGrade(ctx, SIZE);
  drawBarrelInteriorFX(ctx, SIZE, frameStyle);

  // v8.0: гарантированное авто-сжатие любого фото с телефона до 512x512 JPEG < 80 КБ
  let quality = 0.86;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob && blob.size > 76 * 1024 && quality > 0.34) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  if (!blob || blob.size > 79 * 1024) {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.42);
  }

  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
    width: SIZE,
    height: SIZE,
    ext: 'jpg',
    mime: 'image/jpeg',
  };
}

function applyVividCinemaGrade(ctx, size) {
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  const half = size * 0.5;
  const radiusSqLimit = (size * 0.36) * (size * 0.36);

  let lumaSum = 0;
  let lumaCount = 0;
  for (let y = 0; y < size; y += 4) {
    const dy = y - half;
    for (let x = 0; x < size; x += 4) {
      const dx = x - half;
      if (dx * dx + dy * dy < radiusSqLimit) {
        const idx = (y * size + x) * 4;
        lumaSum += 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        lumaCount += 1;
      }
    }
  }

  const avgLuma = lumaCount > 0 ? lumaSum / lumaCount : 120;
  const gain = avgLuma < 95 ? 1.28 : avgLuma < 125 ? 1.14 : 1.04;
  const shadowLift = avgLuma < 105 ? 10 : 4;

  for (let i = 0; i < d.length; i += 4) {
    let r = Math.min(255, d[i] * gain + shadowLift);
    let g = Math.min(255, d[i + 1] * gain + shadowLift);
    let b = Math.min(255, d[i + 2] * gain + shadowLift);

    // Плавный кино-контраст без завала теней и пересвета кожи
    r = ((r - 128) * 1.12) + 128;
    g = ((g - 128) * 1.12) + 128;
    b = ((b - 128) * 1.12) + 128;

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const sat = maxCh > 0 ? (maxCh - minCh) / maxCh : 0;
    // Мягкий vibrance (+28% для тусклых тонов, защита яркой кожи от неона)
    const vibBoost = 1 + 0.28 * (1 - sat * 0.72);
    r = luma + (r - luma) * vibBoost;
    g = luma + (g - luma) * vibBoost;
    b = luma + (b - luma) * vibBoost;

    // Лёгкий тёплый акцент в светах
    if (luma > 145) {
      const hiFactor = Math.min(1, (luma - 145) / 110);
      r += 4 * hiFactor;
      g += 2 * hiFactor;
    }

    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(imgData, 0, 0);
}

export function drawBarrelInteriorFX(ctx, size, frameStyle = 'flashlight') {
  const half = size * 0.5;

  // Центр (0..0.74 радиуса) всегда яркий и чистый; стальная кромка только снаружи
  const outerRim = ctx.createRadialGradient(half, half, size * 0.36, half, half, size * 0.505);
  outerRim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  outerRim.addColorStop(0.55, 'rgba(12, 16, 22, 0.22)');
  outerRim.addColorStop(0.84, 'rgba(12, 16, 22, 0.82)');
  outerRim.addColorStop(1, 'rgba(6, 8, 12, 0.96)');
  ctx.fillStyle = outerRim;
  ctx.fillRect(0, 0, size, size);

  if (frameStyle === 'flashlight') {
    const beam = ctx.createRadialGradient(half * 0.72, half * 0.58, size * 0.02, half * 0.9, half * 0.82, size * 0.54);
    beam.addColorStop(0, 'rgba(224, 246, 255, 0.22)');
    beam.addColorStop(0.52, 'rgba(125, 211, 252, 0.05)');
    beam.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(half, half, size * 0.44, -Math.PI * 0.82, -Math.PI * 0.16);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = size * 0.008;
    ctx.beginPath();
    ctx.arc(half, half, size * 0.455, Math.PI * 0.12, Math.PI * 0.65);
    ctx.stroke();
    ctx.restore();

    const drops = [
      [0.16, 0.26, 5.2], [0.84, 0.28, 4.4], [0.13, 0.56, 5.0],
      [0.86, 0.58, 4.6], [0.24, 0.81, 4.2], [0.76, 0.80, 5.4], [0.50, 0.12, 3.8],
    ];
    for (const [nx, ny, r] of drops) {
      const x = nx * size;
      const y = ny * size;
      const dg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0.5, x, y, r);
      dg.addColorStop(0, 'rgba(240, 249, 255, 0.88)');
      dg.addColorStop(0.5, 'rgba(125, 211, 252, 0.34)');
      dg.addColorStop(1, 'rgba(15, 23, 42, 0.38)');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.88, r * 1.15, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (frameStyle === 'weld') {
    ctx.save();
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = size * 0.018;
    ctx.setLineDash([16, 8]);
    ctx.beginPath();
    ctx.arc(half, half, size * 0.445, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
    ctx.lineWidth = size * 0.006;
    ctx.setLineDash([7, 14]);
    ctx.beginPath();
    ctx.arc(half, half, size * 0.445, 0.2, Math.PI * 2 + 0.2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + 0.15;
      const dist = size * (0.405 + (i % 3) * 0.022);
      const sx1 = half + Math.cos(ang) * dist;
      const sy1 = half + Math.sin(ang) * dist;
      const sx2 = half + Math.cos(ang + 0.09) * (dist - size * 0.035);
      const sy2 = half + Math.sin(ang + 0.09) * (dist - size * 0.035);
      ctx.strokeStyle = i % 2 === 0 ? '#fef08a' : '#f97316';
      ctx.lineWidth = i % 2 === 0 ? 2.6 : 2.0;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
    ctx.restore();
  } else if (frameStyle === 'rec') {
    ctx.save();
    // Сканлайны строго по краю, лицо в центре чистое
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.14)';
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 6) {
      if (y < size * 0.14 || y > size * 0.86) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
    ctx.lineWidth = 3;
    const pad = size * 0.16;
    const len = size * 0.055;
    ctx.beginPath();
    ctx.moveTo(pad, pad + len); ctx.lineTo(pad, pad); ctx.lineTo(pad + len, pad);
    ctx.moveTo(size - pad - len, pad); ctx.lineTo(size - pad, pad); ctx.lineTo(size - pad, pad + len);
    ctx.moveTo(pad, size - pad - len); ctx.lineTo(pad, size - pad); ctx.lineTo(pad + len, size - pad);
    ctx.moveTo(size - pad - len, size - pad); ctx.lineTo(size - pad, size - pad); ctx.lineTo(size - pad, size - pad - len);
    ctx.stroke();

    const pillW = size * 0.44;
    const pillH = size * 0.068;
    const pillX = half - pillW * 0.5;
    const pillY = size * 0.075;
    ctx.fillStyle = 'rgba(9, 13, 18, 0.82)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.82)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pillX, pillY, pillW, pillH);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(pillX + size * 0.042, pillY + pillH * 0.5, size * 0.014, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${Math.round(size * 0.03)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('REC // БОЧКА №06', pillX + size * 0.072, pillY + pillH * 0.68);

    const botW = size * 0.40;
    const botX = half - botW * 0.5;
    const botY = size * 0.855;
    ctx.fillStyle = 'rgba(9, 13, 18, 0.78)';
    ctx.fillRect(botX, botY, botW, size * 0.058);
    ctx.fillStyle = '#4ade80';
    ctx.font = `700 ${Math.round(size * 0.026)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ISO 1600 · O2 29S', half, botY + size * 0.04);
    ctx.restore();
  } else if (frameStyle === 'stencil') {
    ctx.save();
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = size * 0.024;
    ctx.setLineDash([14, 14]);
    ctx.beginPath();
    ctx.arc(half, half, size * 0.452, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, size * 0.428, 0, Math.PI * 2);
    ctx.stroke();

    const plateW = size * 0.62;
    const plateH = size * 0.076;
    const plateX = half - plateW * 0.5;
    const plateY = size * 0.805;
    ctx.fillStyle = 'rgba(13, 13, 13, 0.88)';
    ctx.fillRect(plateX, plateY, plateW, plateH);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(plateX, plateY, plateW, plateH);

    ctx.fillStyle = '#facc15';
    ctx.font = `900 ${Math.round(size * 0.032)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ОПАСНЫЙ ГРУЗ · 17.12', half, plateY + plateH * 0.68);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(half, half, size * 0.485, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Клиентский анализатор скриншота страницы Кинопоиска на Canvas (без платных ИИ):
 * Проверяет пропорции реального скриншота, тёмный/светлый интерфейс карточки фильма
 * и наличие плотного кластера фирменного оранжевого цвета активной кнопки «Буду смотреть» (#ff5500 / #ff6600).
 */
export async function verifyKinopoiskScreenshot(file) {
  if (!file || !file.type?.startsWith('image/')) {
    return { ok: false, reason: 'not_image' };
  }

  const objUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objUrl);
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;

    // Слишком мелкая иконка/картинка не является скриншотом экрана
    if (nw < 260 || nh < 320) {
      return { ok: false, reason: 'too_small' };
    }

    const W = 320;
    const H = Math.max(240, Math.min(720, Math.round((nh / nw) * W)));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);

    const data = ctx.getImageData(0, 0, W, H).data;
    let kpOrangePixels = 0;
    let darkOrLightUiPixels = 0;
    let maxRowOrangeRun = 0;

    // Сканируем центральную зону интерфейса карточки фильма (где расположена кнопка «Буду смотреть»)
    const yStart = Math.floor(H * 0.12);
    const yEnd = Math.floor(H * 0.88);

    for (let y = yStart; y < yEnd; y++) {
      let currentRun = 0;
      for (let x = 12; x < W - 12; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Фирменный градиент активной кнопки/галочки Кинопоиска (#ff5500 .. #ff7a00 / #f50)
        const isKpOrange =
          r >= 215 &&
          g >= 62 &&
          g <= 158 &&
          b <= 58 &&
          r - g >= 68 &&
          g - b >= 28;

        if (isKpOrange) {
          kpOrangePixels++;
          currentRun++;
          if (currentRun > maxRowOrangeRun) maxRowOrangeRun = currentRun;
        } else {
          currentRun = 0;
        }

        // Тёмная (#0a..#24) или белая (#f0..#ff) подложка приложения/сайта Кинопоиска
        const isDarkBg = r < 38 && g < 38 && b < 44;
        const isLightBg = r > 236 && g > 236 && b > 238;
        if (isDarkBg || isLightBg) {
          darkOrLightUiPixels++;
        }
      }
    }

    const scannedArea = (yEnd - yStart) * (W - 24);
    const uiRatio = darkOrLightUiPixels / Math.max(1, scannedArea);

    // Активный бейдж/иконка «Буду смотреть» даёт отчётливое пятно оранжевых пикселей на фоне UI,
    // но не заливает весь кадр целиком (отсекаем просто рыжую заливку во весь экран)
    const hasActiveBadge = kpOrangePixels >= 28 && kpOrangePixels <= scannedArea * 0.32 && maxRowOrangeRun >= 5;
    const looksLikeAppUi = uiRatio >= 0.22;

    if (hasActiveBadge && looksLikeAppUi) {
      const kpBlob = await canvasToBlob(c, 'image/webp', 0.72);
      return { ok: true, orangeScore: kpOrangePixels, blob: kpBlob };
    }
    return { ok: false, reason: 'badge_not_found' };
  } catch {
    return { ok: false, reason: 'decode_error' };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/**
 * Генерирует готовую вертикальную карточку для Сторис 1080x1920 (9:16 PNG)
 */
export async function generateStoriesPosterPNG({
  portraitSrc,
  survived,
  attemptNum = 1,
  message = '',
  labels = {},
}) {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  const spot = ctx.createRadialGradient(W * 0.5, H * 0.42, 60, W * 0.5, H * 0.45, 880);
  spot.addColorStop(0, 'rgba(234, 179, 8, 0.13)');
  spot.addColorStop(0.5, 'rgba(90, 52, 24, 0.08)');
  spot.addColorStop(1, 'rgba(8, 8, 9, 0.98)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W * 0.5, 220);
  ctx.rotate(-0.14);
  ctx.fillStyle = 'rgba(165, 200, 235, 0.045)';
  for (let col = -2; col <= 1; col++) {
    for (let row = 0; row < 2; row++) {
      ctx.fillRect(col * 210 + 14, row * 155, 175, 130);
    }
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(234, 179, 8, 0.26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 56, W - 96, H - 112);

  ctx.fillStyle = 'rgba(214, 190, 150, 0.68)';
  ctx.font = '600 24px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ЦЕХ, КОРПУС Б // ПРОТОКОЛ 200L', 82, 108);

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(W - 112, 100, 32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#eab308';
  ctx.font = '700 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('18+', W - 112, 108);

  const logoGrad = ctx.createLinearGradient(0, 175, 0, 310);
  logoGrad.addColorStop(0, '#f3e5c8');
  logoGrad.addColorStop(0.52, '#eab308');
  logoGrad.addColorStop(1, '#854d0e');
  ctx.fillStyle = logoGrad;
  ctx.font = '900 148px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(labels.title || 'БОЧКА', W * 0.5, 295);

  ctx.fillStyle = 'rgba(194, 142, 92, 0.86)';
  ctx.font = '600 25px monospace';
  ctx.fillText(labels.slogan || 'СТУЧИТЕ — И ОТВОРЯТ ВАМ', W * 0.5, 348);

  const cx = W * 0.5;
  const cy = 835;
  const outerR = 378;
  const innerR = 324;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
  ctx.shadowBlur = 55;
  ctx.fillStyle = '#141619';
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const rimGrad = ctx.createRadialGradient(cx - 80, cy - 90, innerR * 0.85, cx, cy, outerR);
  rimGrad.addColorStop(0, '#3a3f45');
  rimGrad.addColorStop(0.45, '#59331d');
  rimGrad.addColorStop(0.82, '#22252a');
  rimGrad.addColorStop(1, '#0e1012');
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR - 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#07090b';
  ctx.fillRect(cx - innerR, cy - innerR, innerR * 2, innerR * 2);

  try {
    const img = portraitSrc ? await loadImageElement(portraitSrc) : null;
    if (img) {
      const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const sx = ((img.naturalWidth || img.width) - side) * 0.5;
      const sy = ((img.naturalHeight || img.height) - side) * 0.45;
      ctx.drawImage(img, sx, sy, side, side, cx - innerR, cy - innerR, innerR * 2, innerR * 2);
    } else {
      const def = createDefaultSilhouetteCanvas();
      ctx.drawImage(def, cx - innerR, cy - innerR, innerR * 2, innerR * 2);
    }
  } catch {
    const def = createDefaultSilhouetteCanvas();
    ctx.drawImage(def, cx - innerR, cy - innerR, innerR * 2, innerR * 2);
  }

  const abyss = ctx.createRadialGradient(cx, cy, innerR * 0.74, cx, cy, innerR);
  abyss.addColorStop(0, 'rgba(0,0,0,0)');
  abyss.addColorStop(1, 'rgba(4,5,7,0.52)');
  ctx.fillStyle = abyss;
  ctx.fillRect(cx - innerR, cy - innerR, innerR * 2, innerR * 2);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.78)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy + 285);
  ctx.rotate(-0.055);
  const stampColor = survived ? '#eab308' : '#ef4444';
  ctx.fillStyle = 'rgba(13, 13, 13, 0.92)';
  ctx.fillRect(-410, -54, 820, 108);
  ctx.strokeStyle = stampColor;
  ctx.lineWidth = 5;
  ctx.strokeRect(-410, -54, 820, 108);

  ctx.fillStyle = stampColor;
  ctx.font = '900 44px Impact, "Arial Black", monospace';
  ctx.textAlign = 'center';
  const stampText = survived
    ? (labels.survivedStamp || `ВЫЖИЛ · С ${attemptNum}-Й ПОПЫТКИ`)
    : (labels.failedStamp || 'ОСТАЛСЯ В ЦЕХУ');
  ctx.fillText(stampText, 0, 16);
  ctx.restore();

  if (message) {
    ctx.fillStyle = 'rgba(245, 240, 228, 0.92)';
    ctx.font = '600 36px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    wrapCenteredText(ctx, `«${message}»`, cx, 1340, 880, 48);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 1600; i++) {
    const gx = (i * 673) % W;
    const gy = (i * 1193) % H;
    ctx.fillRect(gx, gy, 2, 2);
  }

  ctx.fillStyle = '#eab308';
  ctx.fillRect(190, 1565, W - 380, 86);
  ctx.fillStyle = '#0d0d0d';
  ctx.font = '900 42px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(labels.premiere || 'В КИНО С 17 ДЕКАБРЯ', cx, 1623);

  ctx.fillStyle = 'rgba(214, 190, 150, 0.78)';
  ctx.font = '700 30px monospace';
  ctx.fillText('BOCHKA.QUEST', cx, 1745);

  ctx.fillStyle = 'rgba(160, 150, 135, 0.48)';
  ctx.font = '500 22px monospace';
  ctx.fillText('ТИЛЬ ШВАЙГЕР · ФИЛИПП РЕЙНХАРДТ · ИРИНА КОБЗЕВА · РЕЖ. АЛЕКСЕЙ ЗВОНЦОВ', cx, 1805);

  return canvasToBlob(canvas, 'image/png', 0.95);
}

/**
 * Сжимает реальное фото друга для Именного пропуска в кинотеатр (512x512 WebP <= 60 КБ)
 * БЕЗ тёмного фильтра бочки, чтобы контролёр на кассе чётко сверил лицо!
 */
export async function processClearPassPhotoToWebP(source) {
  if (!source) return null;
  let drawable = null;
  let sw = 512;
  let sh = 512;

  if (source instanceof Blob || source instanceof File) {
    const objUrl = URL.createObjectURL(source);
    try {
      const img = await loadImageElement(objUrl);
      drawable = img;
      sw = img.naturalWidth || img.width;
      sh = img.naturalHeight || img.height;
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } else if (typeof source === 'string') {
    const img = await loadImageElement(source);
    drawable = img;
    sw = img.naturalWidth || img.width;
    sh = img.naturalHeight || img.height;
  } else if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
    drawable = source;
    sw = source.naturalWidth || source.width;
    sh = source.naturalHeight || source.height;
  }

  if (!drawable || sw < 64 || sh < 64) return null;

  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const side = Math.min(sw, sh);
  const sx = Math.max(0, (sw - side) * 0.5);
  const sy = Math.max(0, (sh - side) * 0.38);
  ctx.drawImage(drawable, sx, sy, side, side, 0, 0, SIZE, SIZE);

  let quality = 0.80;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  while (blob && blob.size > 58 * 1024 && quality > 0.34) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }
  if (!blob || blob.size > 60 * 1024) {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.62);
  }

  const dataUrl = await blobToDataUrl(blob);
  return {
    blob,
    dataUrl,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
  };
}

/**
 * Генерирует эксклюзивную вертикальную открытку 1080x1920 для Сторис с пасхалкой у моря
 * БЕЗ раскрытия секретной комбинации 19-97!
 */
export async function generateOceanEasterEggStoriesPNG() {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Холодное серое предрассветное небо над морем
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1f2933');
  sky.addColorStop(0.38, '#394854');
  sky.addColorStop(0.72, '#1d262e');
  sky.addColorStop(1, '#0d1014');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  try {
    const seaImg = await loadImageElement(resolveSiteAsset('assets/keyed/ocean_beach_bg.webp'));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(seaImg, 0, 520, W, 940);
  } catch { /* fallback gradient */ }

  // Мягкий морской туман сверху и снизу панорамы
  const topMist = ctx.createLinearGradient(0, 500, 0, 690);
  topMist.addColorStop(0, '#364551');
  topMist.addColorStop(1, 'rgba(54, 69, 81, 0)');
  ctx.fillStyle = topMist;
  ctx.fillRect(0, 500, W, 190);

  const botMist = ctx.createLinearGradient(0, 1300, 0, 1470);
  botMist.addColorStop(0, 'rgba(13, 16, 20, 0)');
  botMist.addColorStop(1, '#0d1014');
  ctx.fillStyle = botMist;
  ctx.fillRect(0, 1300, W, 180);

  try {
    const tillSit = await loadImageElement(resolveSiteAsset('assets/keyed/ocean_till_sitting.webp'));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tillSit, 135, 965, 290, 376);
  } catch { /* ignore */ }

  try {
    const barrelArm = await loadImageElement(resolveSiteAsset('assets/keyed/ocean_barrel_arm.webp'));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(barrelArm, 455, 1085, 495, 255);
  } catch { /* ignore */ }

  // Пена прибоя вокруг ржавой бочки
  ctx.fillStyle = 'rgba(226, 236, 242, 0.28)';
  ctx.beginPath();
  ctx.ellipse(W * 0.5, 1368, 250, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 56, W - 96, H - 112);

  ctx.fillStyle = 'rgba(226, 234, 240, 0.72)';
  ctx.font = '600 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('СЕКРЕТНЫЙ УРОВЕНЬ НАЙДЕН // БЕЗ ПОДСКАЗОК', W * 0.5, 132);

  // Печатная машинка на небе
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 46px "Courier New", monospace';
  wrapCenteredText(ctx, '«На небе только и разговоров, что о... БОЧКЕ.»', W * 0.5, 290, 880, 66);

  ctx.fillStyle = '#eab308';
  ctx.font = '900 132px Impact, "Arial Black", sans-serif';
  ctx.fillText('БОЧКА', W * 0.5, 1555);

  ctx.fillStyle = '#eab308';
  ctx.fillRect(190, 1615, W - 380, 82);
  ctx.fillStyle = '#0d0d0d';
  ctx.font = '900 40px Impact, "Arial Black", sans-serif';
  ctx.fillText('В КИНО С 17 ДЕКАБРЯ', W * 0.5, 1670);

  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  ctx.font = '700 30px monospace';
  ctx.fillText('НАЙДИ ВЫХОД К МОРЮ НА BOCHKA.QUEST', W * 0.5, 1785);

  return canvasToBlob(canvas, 'image/png', 0.95);
}

function wrapCenteredText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, cy);
      line = words[n] + ' ';
      cy += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), x, cy);
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    if (!blob) {
      resolve('');
      return;
    }
    const r = new FileReader();
    r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.readAsDataURL(blob);
  });
}
