export const DEMO_PORTRAITS = [
  './assets/images.jpg',
  './assets/images_6.jpg',
  './assets/images_5.jpg',
  './assets/images_2.jpg',
];

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export function createDefaultSilhouetteCanvas(seedText = '200L') {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 600;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#0d1318';
  ctx.fillRect(0, 0, 600, 600);

  const bg = ctx.createRadialGradient(300, 250, 30, 300, 300, 300);
  bg.addColorStop(0, '#243442');
  bg.addColorStop(0.6, '#121a21');
  bg.addColorStop(1, '#07090b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 600, 600);

  // Силуэт узника на дне бочки, смотрящего вверх на фонарь
  ctx.fillStyle = '#090c0f';
  ctx.beginPath();
  ctx.ellipse(300, 500, 185, 130, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#18222b';
  ctx.beginPath();
  ctx.ellipse(300, 275, 92, 112, 0, 0, Math.PI * 2);
  ctx.fill();

  // Блики глаз в луче фонаря
  ctx.fillStyle = 'rgba(226, 238, 248, 0.55)';
  ctx.beginPath();
  ctx.arc(266, 265, 6, 0, Math.PI * 2);
  ctx.arc(334, 265, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
  ctx.font = '700 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(seedText, 300, 445);

  return c;
}

/**
 * Сжимает, кропает в квадрат 600x600, красит в холодный сине-ржавый тон
 * под свет фонарика с каплями воды и гарантирует размер WebP < 80 КБ.
 */
export async function processPortraitToWebP(source, frameStyle = 'flashlight') {
  let drawable = null;
  let sw = 600;
  let sh = 600;
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

  const SIZE = 600;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#090b0e';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Центральный квадратный кроп
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

  // Холодный сине-ржавый цветокор триллера «Бочка»
  applyColdRustGrade(ctx, SIZE);

  // Луч фонаря сверху, ржавая горловина и капли конденсата
  drawBarrelInteriorFX(ctx, SIZE, frameStyle);

  // Сжатие в WebP строго < 80 КБ
  let quality = 0.78;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  while (blob && blob.size > 78 * 1024 && quality > 0.34) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }
  if (!blob || blob.size > 80 * 1024) {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.62);
  }

  const dataUrl = await blobToDataUrl(blob);

  // Микро-превью (44x44 JPEG без ICC-профиля ~550 байт) для короткого URL fallback без ключей Supabase
  const microCanvas = document.createElement('canvas');
  microCanvas.width = 44;
  microCanvas.height = 44;
  const mctx = microCanvas.getContext('2d');
  mctx.drawImage(canvas, 0, 0, 44, 44);
  const microDataUrl = microCanvas.toDataURL('image/jpeg', 0.48);

  return {
    blob,
    dataUrl,
    microDataUrl,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
    width: SIZE,
    height: SIZE,
  };
}

function applyColdRustGrade(ctx, size) {
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    // Контрастный S-образный профиль + холодные тени + ржавый оттенок полутонов
    const contrast = Math.max(0, Math.min(255, (luma - 118) * 1.24 + 108));
    const mix = 0.62;
    const nr = r * (1 - mix) + (contrast * 0.82 + 10) * mix;
    const ng = g * (1 - mix) + (contrast * 0.94 + 8) * mix;
    const nb = b * (1 - mix) + (contrast * 1.12 + 22) * mix;
    d[i] = Math.max(0, Math.min(255, nr));
    d[i + 1] = Math.max(0, Math.min(255, ng));
    d[i + 2] = Math.max(0, Math.min(255, nb));
  }
  ctx.putImageData(imgData, 0, 0);
}

export function drawBarrelInteriorFX(ctx, size, frameStyle = 'flashlight') {
  const half = size * 0.5;

  // 1. Луч фонаря сверху под углом
  const beam = ctx.createRadialGradient(half * 0.92, half * 0.68, size * 0.04, half, half, size * 0.56);
  beam.addColorStop(0, 'rgba(225, 242, 255, 0.24)');
  beam.addColorStop(0.42, 'rgba(130, 175, 205, 0.06)');
  beam.addColorStop(0.75, 'rgba(25, 16, 10, 0.58)');
  beam.addColorStop(1, 'rgba(5, 6, 8, 0.96)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, size, size);

  // 2. Ржавый ореол стенок 200-литровой бочки по кругу
  ctx.save();
  const rust = ctx.createRadialGradient(half, half, size * 0.34, half, half, size * 0.5);
  rust.addColorStop(0, 'rgba(0,0,0,0)');
  rust.addColorStop(0.68, 'rgba(120, 53, 18, 0.28)');
  rust.addColorStop(0.92, 'rgba(24, 14, 10, 0.88)');
  rust.addColorStop(1, '#070809');
  ctx.fillStyle = rust;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // 3. Капли холодной воды / конденсата
  const drops = [
    [0.26, 0.24, 5.5], [0.71, 0.21, 4.2], [0.64, 0.34, 7.0],
    [0.22, 0.58, 6.2], [0.78, 0.54, 5.0], [0.35, 0.74, 4.4],
    [0.68, 0.72, 6.4], [0.48, 0.19, 3.6], [0.31, 0.41, 3.2],
  ];
  for (const [nx, ny, r] of drops) {
    const x = nx * size;
    const y = ny * size;
    const dg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0.5, x, y, r);
    dg.addColorStop(0, 'rgba(235, 246, 255, 0.65)');
    dg.addColorStop(0.45, 'rgba(125, 165, 190, 0.22)');
    dg.addColorStop(1, 'rgba(8, 12, 16, 0.35)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.85, r * 1.18, 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Выбранный криповый пресет горловины
  ctx.save();
  if (frameStyle === 'weld') {
    ctx.strokeStyle = 'rgba(168, 92, 38, 0.7)';
    ctx.lineWidth = size * 0.022;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.arc(half, half, size * 0.455, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const bx = half + Math.cos(ang) * size * 0.455;
      const by = half + Math.sin(ang) * size * 0.455;
      ctx.fillStyle = '#3b2416';
      ctx.beginPath();
      ctx.arc(bx, by, size * 0.015, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (frameStyle === 'rec') {
    ctx.fillStyle = 'rgba(18, 255, 140, 0.04)';
    for (let y = 0; y < size; y += 4) {
      ctx.fillRect(0, y, size, 1);
    }
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
    ctx.lineWidth = 2;
    const pad = size * 0.15;
    const len = size * 0.05;
    // Уголки визора
    ctx.beginPath();
    ctx.moveTo(pad, pad + len); ctx.lineTo(pad, pad); ctx.lineTo(pad + len, pad);
    ctx.moveTo(size - pad - len, pad); ctx.lineTo(size - pad, pad); ctx.lineTo(size - pad, pad + len);
    ctx.moveTo(pad, size - pad - len); ctx.lineTo(pad, size - pad); ctx.lineTo(pad + len, size - pad);
    ctx.moveTo(size - pad - len, size - pad); ctx.lineTo(size - pad, size - pad); ctx.lineTo(size - pad, size - pad - len);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(size * 0.36, size * 0.17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(234, 179, 8, 0.82)';
    ctx.font = `700 ${Math.round(size * 0.028)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('REC // BLOCK-B 200L', size * 0.39, size * 0.179);
  } else if (frameStyle === 'stencil') {
    ctx.save();
    ctx.translate(half, size * 0.83);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.82)';
    ctx.font = `700 ${Math.round(size * 0.042)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ГРУЗ №06 // 200L', 0, 0);
    ctx.restore();
  }

  // Жёсткая круглая маска горловины бочки по внешнему краю
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(half, half, size * 0.485, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

  // 1. Почти чёрный индустриальный фон #0d0d0d + пятно верхнего прожектора
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  const spot = ctx.createRadialGradient(W * 0.5, H * 0.42, 60, W * 0.5, H * 0.45, 880);
  spot.addColorStop(0, 'rgba(234, 179, 8, 0.13)');
  spot.addColorStop(0.5, 'rgba(90, 52, 24, 0.08)');
  spot.addColorStop(1, 'rgba(8, 8, 9, 0.98)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);

  // 2. Геометрические тени от заводских окон на задней стене
  ctx.save();
  ctx.translate(W * 0.5, 220);
  ctx.rotate(-0.14);
  ctx.fillStyle = 'rgba(255, 232, 185, 0.032)';
  for (let col = -2; col <= 1; col++) {
    for (let row = 0; row < 2; row++) {
      ctx.fillRect(col * 210 + 14, row * 155, 175, 130);
    }
  }
  ctx.restore();

  // 3. Тонкая техническая рамка цеха
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 56, W - 96, H - 112);

  ctx.fillStyle = 'rgba(214, 190, 150, 0.68)';
  ctx.font = '600 24px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ЦЕХ, КОРПУС Б // ПРОТОКОЛ 200L', 82, 108);

  // Круглая метка 18+
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(W - 112, 100, 32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#eab308';
  ctx.font = '700 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('18+', W - 112, 108);

  // 4. Крупный металлический логотип БОЧКА сверху
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

  // 5. Круглая ржавая горловина 200-литровой бочки в центре
  const cx = W * 0.5;
  const cy = 835;
  const outerR = 378;
  const innerR = 324;

  // Тень под ободом
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
  ctx.shadowBlur = 55;
  ctx.fillStyle = '#141619';
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Стальной ржавый обод горловины
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

  // Портрет внутри круглой горловины
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

  // Дополнительная глубокая тень от стенок бочки
  const abyss = ctx.createRadialGradient(cx, cy, innerR * 0.52, cx, cy, innerR);
  abyss.addColorStop(0, 'rgba(0,0,0,0)');
  abyss.addColorStop(1, 'rgba(4,5,7,0.88)');
  ctx.fillStyle = abyss;
  ctx.fillRect(cx - innerR, cy - innerR, innerR * 2, innerR * 2);
  ctx.restore();

  // 6. Индустриальный штамп результата поверх горловины
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
  ctx.font = '900 46px Impact, "Arial Black", monospace';
  ctx.textAlign = 'center';
  const stampText = survived
    ? (labels.survivedStamp || `ВЫЖИЛ · С ${attemptNum}-Й ПОПЫТКИ`)
    : (labels.failedStamp || 'ОСТАЛСЯ В ЦЕХУ');
  ctx.fillText(stampText, 0, 17);
  ctx.restore();

  // 7. Послание отправителя
  if (message) {
    ctx.fillStyle = 'rgba(245, 240, 228, 0.92)';
    ctx.font = '600 36px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    wrapCenteredText(ctx, `«${message}»`, cx, 1340, 880, 48);
  }

  // 8. Зернистость плёнки (лёгкий индустриальный шум)
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 1600; i++) {
    const gx = (i * 673) % W;
    const gy = (i * 1193) % H;
    ctx.fillRect(gx, gy, 2, 2);
  }

  // 9. Нижний блок с датой проката и доменом
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
