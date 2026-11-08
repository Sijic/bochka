/* Sprite sheets and location backgrounds in assets/ (pre-keyed high-speed WebP + fallback JPGs) */
export const ASSET_MAP = {
  /* Stage 1: Бочки и все персонажи перед киноэкраном — загружаются в первую очередь (< 500 КБ суммарно!) */
  barrels: 'assets/keyed/barrels.webp',
  priest: 'assets/keyed/priest.webp',
  capguy: 'assets/keyed/capguy.webp',
  boy: 'assets/keyed/boy.webp',
  girl: 'assets/keyed/girl.webp',
  father: 'assets/keyed/father.webp',
  /* Stage 2: Локации цеха, овчарка, церковь и море */
  factory: 'assets/keyed/factory.webp',
  dog: 'assets/keyed/dog.webp',
  church: 'assets/keyed/church.webp',
  factorySector: 'assets/keyed/factory_sector.webp',
  ocean: 'assets/keyed/ocean.webp',
  oceanSprites: 'assets/keyed/ocean_sprites.webp',
  /* Stage 3: Постеры актёров и кадры из бочки для скримеров и досье */
  posterPriest: 'assets/images_3.jpg',
  posterPriestHand: 'assets/poster_en.jpg',
  posterFather: 'assets/images_6.jpg',
  posterFatherFull: 'assets/father_photo.jpg',
  posterBoy: 'assets/images_2.jpg',
  posterGirl: 'assets/images_5.jpg',
  posterBarrelEye: 'assets/keyed/barrel_hole.webp',
};

export const LEGACY_ASSET_MAP = {
  barrels: 'assets/barrels.jpg',
  priest: 'assets/priest.jpg',
  capguy: 'assets/capguy.jpg',
  boy: 'assets/boy.jpg',
  girl: 'assets/girl.jpg',
  father: 'assets/father.jpg',
  factory: 'assets/factory.jpg',
  dog: 'assets/dog.jpg',
  church: 'assets/church.jpg',
  factorySector: 'assets/factory_sector.jpg',
  ocean: 'assets/ocean.jpg',
  posterBarrelEye: 'assets/barrel_hole.jpg',
};

/* Спрайты и фон из сцены «Достучаться до небес» (assets/ocean.jpg) */
export const OCEAN_RECTS = {
  bg: [0, 0, 0.702, 1.0],
  sittingMan: [0.765, 0.025, 0.182, 0.295],
  barrelClosed: [0.742, 0.392, 0.228, 0.196],
  barrelHand: [0.718, 0.618, 0.254, 0.194],
  handOnly: [0.790, 0.854, 0.145, 0.104],
};

/* Character sheets: 4 columns x 2 rows */
export const CHAR_FRAMES = { idle: 0, walk1: 1, walk2: 2, action: 3, idle2: 4, flash: 5, point: 6, special: 7 };
/* Dog sheet: stand, sit, sniff, pant / walk1, walk2, run, bark */
export const DOG_FRAMES = { idle: 0, sit: 1, sniff: 2, pant: 3, walk1: 4, walk2: 5, run: 6, bark: 7 };

/* Barrel sheet rects in fractions of image size [x, y, w, h] (measured on 1024x765 sheet) */
export const BARREL_RECTS = {
  igor: [0.0195, 0.021, 0.1515, 0.299],
  anna: [0.1795, 0.035, 0.1505, 0.285],
  daniyar: [0.3395, 0.030, 0.1505, 0.290],
  mark: [0.5000, 0.035, 0.1505, 0.285],
  oleg: [0.6700, 0.035, 0.1505, 0.285],
  artur: [0.8290, 0.021, 0.1515, 0.293],
  /* Row 2 with clean lower rim restored from Row 3 (+220px) */
  hand: [0.0195, 0.332, 0.1515, 0.336],
  phone: [0.1795, 0.332, 0.1505, 0.336],
  handNoName: [0.3395, 0.332, 0.1610, 0.336],
  /* Full width (0.261) so the lying ANNA barrel's right end is never clipped */
  fallen: [0.5195, 0.439, 0.2610, 0.242],
  chained: [0.8190, 0.395, 0.1710, 0.296],
};

/* Prefer the inlined data URL of an uploaded asset: it never taints the canvas,
   so getImageData (needed for background removal) always works. */
function resolveSrc(src, key = '') {
  const legacy = LEGACY_ASSET_MAP[key];
  const legacyName = legacy ? legacy.split('/').pop() : src.split('/').pop();
  const up = (window.UPLOADED_IMAGES || []).find((a) => a.name === legacyName || a.name === src.split('/').pop());
  return up?.dataUrl || src;
}

function loadImage(src, retries = 2) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      const img = new Image();
      if (/^https?:/i.test(src) && !src.startsWith(location.origin)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (left > 0) {
          setTimeout(() => attempt(left - 1), 150);
        } else {
          resolve(null);
        }
      };
      img.src = src;
    };
    attempt(retries);
  });
}

function imgToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return c;
}

/* Removes the grey checkerboard "transparency" background baked into the JPG sheets.
   1) flood-fills neutral-grey pixels from the image borders (so grey details inside the
      characters and barrels stay intact inside their dark outlines),
   2) erodes the 1px JPEG halo around every cut-out. */
export function keyOutChecker(img, cleanPockets = false, sheetKey = '') {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  if (!cleanPockets) {
    /* Restore clean bottom rims of Row 2's hand/phone barrels from Row 3 (offset +0.2876*H) */
    const sy = Math.round(c.height * 0.878);
    const dy = Math.round(c.height * 0.590);
    const sh = Math.round(c.height * 0.082);
    const sw = Math.round(c.width * 0.51);
    ctx.drawImage(img, 0, sy, sw, sh, 0, dy, sw, sh);

    /* Очищаем запечённые статичные имена с бочек чистой текстурой ржавого металла из бочки handNoName,
       чтобы поверх бочек рисовались постоянно разные российские имена */
    const patchX = Math.round(c.width * 0.366);
    const patchY = Math.round(c.height * 0.504);
    const patchW = Math.round(c.width * 0.108);
    const patchH = Math.round(c.height * 0.074);
    const destW = Math.round(c.width * 0.124);
    const destH = Math.round(c.height * 0.092);
    const row1Keys = ['igor', 'anna', 'daniyar', 'mark', 'oleg', 'artur'];
    row1Keys.forEach((k) => {
      const r = BARREL_RECTS[k];
      const cx = (r[0] + r[2] * 0.5) * c.width;
      ctx.drawImage(img, patchX, patchY, patchW, patchH, Math.round(cx - destW * 0.5), Math.round(c.height * 0.136), destW, destH);
    });
    ['hand', 'phone', 'chained'].forEach((k) => {
      const r = BARREL_RECTS[k];
      const cx = (r[0] + r[2] * 0.5) * c.width;
      ctx.drawImage(img, patchX, patchY, patchW, patchH, Math.round(cx - destW * 0.5), Math.round(c.height * 0.496), destW, destH);
    });
    /* Для лежащей бочки (fallen) закрываем вертикальную надпись чистой полосой металла рядом */
    ctx.drawImage(
      img,
      Math.round(c.width * 0.610), Math.round(c.height * 0.482),
      Math.round(c.width * 0.044), Math.round(c.height * 0.138),
      Math.round(c.width * 0.654), Math.round(c.height * 0.482),
      Math.round(c.width * 0.056), Math.round(c.height * 0.138)
    );
  }
  let data;
  try { data = ctx.getImageData(0, 0, c.width, c.height); } catch (e) { return c; }
  const d = data.data, W = c.width, H = c.height;
  const keys = [];
  const addKey = (i) => {
    const k = [d[i], d[i + 1], d[i + 2]];
    if (Math.max(...k) - Math.min(...k) > 22) return;
    if (!keys.some((q) => Math.abs(q[0] - k[0]) + Math.abs(q[1] - k[1]) + Math.abs(q[2] - k[2]) < 24)) keys.push(k);
  };
  const samples = [];
  for (let x = 4; x < W - 4; x += 28) {
    samples.push([x, 2], [x, H - 3]);
  }
  for (let y = 4; y < H - 4; y += 28) {
    samples.push([2, y], [W - 3, y]);
  }
  samples.forEach(([x, y]) => addKey((y * W + x) * 4));
  if (!keys.length) return c;

  /* Строгие пороги только для нейтрально-серых клеток фона (luma 44..88, sat <= 8),
     чтобы заливка никогда не пробивала тёмный контур персонажей (luma < 42) и их одежду! */
  const tol = cleanPockets ? 11 : 9;
  const maxSat = cleanPockets ? 8 : 8;
  const minLuma = cleanPockets ? 44 : 43;
  const maxLuma = cleanPockets ? 88 : 92;
  const isBg = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > maxSat) return false;
    const avg = (r + g + b) / 3;
    if (avg < minLuma || avg > maxLuma) return false;
    return keys.some((k) => Math.abs(r - k[0]) <= tol && Math.abs(g - k[1]) <= tol && Math.abs(b - k[2]) <= tol);
  };

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  if (cleanPockets) {
    /* Also seed along 4x2 cell dividers */
    for (const fx of [0.25, 0.5, 0.75]) {
      const gx = Math.floor(W * fx);
      for (let y = 0; y < H; y += 2) stack.push(y * W + gx);
    }
    const gy = Math.floor(H * 0.5);
    for (let x = 0; x < W; x += 2) stack.push(gy * W + x);
  }

  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * 4)) continue;
    d[p * 4 + 3] = 0;
    const x = p % W, y = (p - x) / W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }

  /* На листах персонажей удаляем ТОЛЬКО настоящие замкнутые карманы шахматного фона
     (между ног или под вытянутой рукой с фонарём), где присутствуют ОБА тона клетки (темно-серый ~54 и светло-серый ~76),
     не трогая серую одежду, свитера и куртки внутри контура персонажа! */
  if (cleanPockets) {
    const visited = new Uint8Array(W * H);
    const comp = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const start = y * W + x;
        if (visited[start] || d[start * 4 + 3] === 0 || !isBg(start * 4)) continue;
        comp.length = 0;
        let darkCount = 0, lightCount = 0;
        stack.push(start);
        visited[start] = 1;
        while (stack.length) {
          const p = stack.pop();
          comp.push(p);
          const idx = p * 4;
          const luma = (d[idx] + d[idx + 1] + d[idx + 2]) / 3;
          if (luma >= 45 && luma <= 60) darkCount++;
          else if (luma >= 70 && luma <= 86) lightCount++;
          const px = p % W, py = (p - px) / W;
          const nbs = [px > 0 ? p - 1 : -1, px < W - 1 ? p + 1 : -1, py > 0 ? p - W : -1, py < H - 1 ? p + W : -1];
          for (let k = 0; k < 4; k++) {
            const nb = nbs[k];
            if (nb >= 0 && !visited[nb] && d[nb * 4 + 3] > 0 && isBg(nb * 4)) {
              visited[nb] = 1;
              stack.push(nb);
            }
          }
        }
        /* Удаляем только если в области одновременно есть обе клетки шахматного фона */
        if (comp.length >= 220 && darkCount >= 55 && lightCount >= 55) {
          for (let i = 0; i < comp.length; i++) d[comp[i] * 4 + 3] = 0;
        }
      }
    }
  }

  /* Erode: neutral pixels touching transparency are JPEG halo */
  const cleared = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x, i = p * 4;
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const luma = (r + g + b) / 3;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 9 || luma < 44 || luma > 88) continue;
      if (d[(p - 1) * 4 + 3] === 0 || d[(p + 1) * 4 + 3] === 0 || d[(p - W) * 4 + 3] === 0 || d[(p + W) * 4 + 3] === 0) {
        cleared[p] = 1;
      }
    }
  }
  for (let p = 0; p < W * H; p++) if (cleared[p]) d[p * 4 + 3] = 0;

  /* Для листов персонажей (cleanPockets): гарантируем 100% непрозрачность всех пикселей одежды, кожи и контура
     (любой пиксель с luma < 44 или цветной sat > 8 внутри ячейки никогда не может быть прозрачным!) */
  if (cleanPockets) {
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      if (d[i + 3] === 255) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const luma = (r + g + b) / 3;
      if (luma < 43 || sat > 9) {
        d[i + 3] = 255;
      }
    }
  }

  /* В priest.jpg в кадре 7 (нижний правый угол) слева от святого отца нарисована деревянная бочка (x: 0.695..0.845, y: 0.7215..0.985),
     которая разрезается границей ячейки 0.75*W. Полностью убираем эту деревянную бочку, оставляя только руку и сутану святого отца! */
  if (sheetKey === 'priest') {
    const x0 = Math.floor(W * 0.695), x1 = Math.floor(W * 0.848);
    const y0 = Math.floor(H * 0.7215), y1 = H - 1;
    const isHandSkin = (x, y) => {
      if (x < W * 0.776 || x > W * 0.816 || y < H * 0.720 || y > H * 0.758) return false;
      const idx = (y * W + x) * 4;
      const r = d[idx], g = d[idx + 1], b = d[idx + 2];
      return r > 96 && r - b >= 22 && r > g + 6;
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        /* 1. Оставляем правую сутану и обувь святого отца */
        if (
          (y <= H * 0.868 && x >= W * 0.844) ||
          (y > H * 0.868 && y <= H * 0.936 && x >= W * 0.841) ||
          (y > H * 0.936 && x >= W * 0.837)
        ) {
          continue;
        }
        /* 2. Оставляем кисть руки святого отца и её тёмный контур/рукав сверху */
        if (y <= H * 0.758 && x >= W * 0.776 && x <= W * 0.818) {
          if (isHandSkin(x, y)) continue;
          const idx = (y * W + x) * 4;
          const luma = (d[idx] + d[idx + 1] + d[idx + 2]) / 3;
          if (y <= H * 0.731 && x >= W * 0.788 && luma < 45) continue;
          if (luma < 38) {
            let nearSkin = false;
            for (let dy = -5; dy <= 5 && !nearSkin; dy++) {
              for (let dx = -5; dx <= 5; dx++) {
                if (isHandSkin(x + dx, y + dy)) { nearSkin = true; break; }
              }
            }
            if (nearSkin) continue;
          }
        }
        d[(y * W + x) * 4 + 3] = 0;
      }
    }
  }

  /* For barrels.jpg (!cleanPockets), guarantee 100% solid interior inside each barrel body */
  if (!cleanPockets) {
    for (const [bKey, rect] of Object.entries(BARREL_RECTS)) {
      const x0 = Math.max(0, Math.floor(rect[0] * W));
      const y0 = Math.max(0, Math.floor(rect[1] * H));
      const rw = Math.floor(rect[2] * W);
      const rh = Math.floor(rect[3] * H);
      const x1 = Math.min(W - 1, x0 + rw);
      const y1 = Math.min(H - 1, y0 + rh);
      /* For barrels with hand/phone sticking out the top, cylinder body starts at 24% of rect height */
      const bodyStartY = (bKey === 'hand' || bKey === 'phone' || bKey === 'handNoName')
        ? y0 + Math.floor(rh * 0.24)
        : y0 + 2;
      for (let y = bodyStartY; y <= y1 - 2; y++) {
        let xL = -1, xR = -1;
        for (let x = x0; x <= x1; x++) {
          if (d[(y * W + x) * 4 + 3] > 200) { xL = x; break; }
        }
        for (let x = x1; x >= x0; x--) {
          if (d[(y * W + x) * 4 + 3] > 200) { xR = x; break; }
        }
        if (xL >= 0 && xR > xL + rw * 0.35) {
          for (let x = xL; x <= xR; x++) {
            d[(y * W + x) * 4 + 3] = 255;
          }
        }
      }
    }
  }

  ctx.putImageData(data, 0, 0);
  return c;
}

/* Вырезает спрайты из правой колонки ocean.jpg (сидящий герой, бочка с рукой Тиля, рука),
   удаляя серый шахматный фон справа от x = 0.715 */
export function keyOutOceanSprites(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  let data;
  try { data = ctx.getImageData(0, 0, c.width, c.height); } catch { return c; }
  const d = data.data, W = c.width, H = c.height;
  const xStart = Math.floor(W * 0.716);
  const keys = [];
  const addKey = (x, y) => {
    const i = (y * W + x) * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 18) return;
    if (!keys.some((q) => Math.abs(q[0] - r) + Math.abs(q[1] - g) + Math.abs(q[2] - b) < 22)) {
      keys.push([r, g, b]);
    }
  };
  for (let x = xStart + 4; x < W - 2; x += 6) {
    addKey(x, 2);
    addKey(x, H - 3);
  }
  for (let y = 2; y < H - 2; y += 8) {
    addKey(xStart + 3, y);
    addKey(W - 3, y);
  }
  const isBg = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 18) return false;
    const avg = (r + g + b) / 3;
    if (avg < 36 || avg > 140) return false;
    return keys.some((k) => Math.abs(r - k[0]) <= 22 && Math.abs(g - k[1]) <= 22 && Math.abs(b - k[2]) <= 22);
  };
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = xStart; x < W; x++) {
    stack.push(x, (H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    stack.push(y * W + xStart, y * W + W - 1);
  }
  /* Дополнительно сеем между 4 спрайтами в правой колонке */
  for (const fy of [0.35, 0.60, 0.83]) {
    const gy = Math.floor(H * fy);
    for (let x = xStart; x < W; x += 2) stack.push(gy * W + x);
  }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const x = p % W, y = (p - x) / W;
    if (x < xStart) continue;
    if (!isBg(p * 4)) continue;
    d[p * 4 + 3] = 0;
    if (x > xStart) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  /* Гарантируем 100% непрозрачность внутри контура сидящего героя и бочки с рукой Тиля */
  for (const k of ['sittingMan', 'barrelClosed', 'barrelHand', 'handOnly']) {
    const r = OCEAN_RECTS[k];
    const x0 = Math.max(xStart, Math.floor(r[0] * W));
    const y0 = Math.max(0, Math.floor(r[1] * H));
    const rw = Math.floor(r[2] * W);
    const rh = Math.floor(r[3] * H);
    const x1 = Math.min(W - 1, x0 + rw);
    const y1 = Math.min(H - 1, y0 + rh);
    for (let y = y0 + 2; y <= y1 - 2; y++) {
      let xL = -1, xR = -1;
      for (let x = x0; x <= x1; x++) {
        if (d[(y * W + x) * 4 + 3] > 200) { xL = x; break; }
      }
      for (let x = x1; x >= x0; x--) {
        if (d[(y * W + x) * 4 + 3] > 200) { xR = x; break; }
      }
      if (xL >= 0 && xR > xL + 8) {
        for (let x = xL; x <= xR; x++) {
          d[(y * W + x) * 4 + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/* Удаляет серый шахматный фон («фон в клетку») вокруг зданий и в проёмах
   на листах factory.jpg, factory_sector.jpg и church.jpg */
export function keyOutBuildingChecker(img, key) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  let data;
  try { data = ctx.getImageData(0, 0, c.width, c.height); } catch { return c; }
  const d = data.data, W = c.width, H = c.height;

  const isCheckerGrey = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 12) return false;
    const avg = (r + g + b) / 3;
    return avg >= 42 && avg <= 88;
  };

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) {
    stack.push(x, (H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    stack.push(y * W, y * W + W - 1);
  }
  if (key === 'church') {
    for (const fy of [0.455, 0.692]) {
      const gy = Math.floor(H * fy);
      for (let x = 0; x < W; x += 2) stack.push(gy * W + x);
    }
  }

  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isCheckerGrey(p * 4)) continue;
    d[p * 4 + 3] = 0;
    const x = p % W, y = (p - x) / W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }

  /* В church.jpg убираем замкнутые карманы шахматного фона вокруг колокольни и крыши (y < 0.44),
     а также тёмно-синее небо над деревьями и забором в полосе Ночной улицы (y: 0.73..0.88),
     чтобы улица бесшовно сливалась с процедурным звёздным небом и Луной */
  if (key === 'church') {
    const yMax = Math.floor(H * 0.44);
    for (let y = 0; y < yMax; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] > 0 && isCheckerGrey(i) && (x < W * 0.145 || x > W * 0.945 || y < H * 0.085)) {
          d[i + 3] = 0;
        }
      }
    }
    const sy0 = Math.floor(H * 0.735), sy1 = Math.floor(H * 0.885);
    const skyQ = [];
    for (let x = 0; x < W; x++) {
      skyQ.push(sy0 * W + x, (sy0 + 2) * W + x, (sy0 + 5) * W + x);
    }
    const skySeen = new Uint8Array(W * H);
    while (skyQ.length) {
      const p = skyQ.pop();
      if (skySeen[p]) continue;
      skySeen[p] = 1;
      const x = p % W, y = (p - x) / W;
      if (y < sy0 || y > sy1) continue;
      const i = p * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const isNightSky = (b >= r - 4 && (r + g + b) < 170) || isCheckerGrey(i);
      if (!isNightSky) continue;
      d[i + 3] = 0;
      if (x > 0) skyQ.push(p - 1);
      if (x < W - 1) skyQ.push(p + 1);
      if (y > sy0) skyQ.push(p - W);
      if (y < sy1) skyQ.push(p + W);
    }
  }

  /* В factory_sector.jpg убираем шахматные клетки:
     1) на улице слева (между ветками деревьев и в луче фонаря),
     2) в галерее 3-го этажа (x: 0.295..0.646, y: 0.172..0.332) */
  if (key === 'factorySector') {
    const skyX = Math.floor(W * 0.288);
    const skyY = Math.floor(H * 0.735);
    for (let y = 0; y < skyY; y++) {
      for (let x = 0; x < skyX; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] === 0) continue;
        if (isCheckerGrey(i)) {
          d[i + 3] = 0;
          continue;
        }
        /* Сглаживаем шахматную клетку внутри жёлтого конуса уличного фонаря */
        if (x >= W * 0.080 && x <= W * 0.162 && y >= H * 0.470 && y <= H * 0.705) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (r - b >= 18 && r >= 88 && r <= 168 && g >= 68 && g <= 138) {
            d[i] = 216;
            d[i + 1] = 160;
            d[i + 2] = 84;
            d[i + 3] = 58;
          }
        }
      }
    }
    /* Галерея 3-го этажа слева: убираем тёмную клетку, открывая ночное небо за балками */
    const gx0 = Math.floor(W * 0.296), gx1 = Math.floor(W * 0.645);
    const gy0 = Math.floor(H * 0.172), gy1 = Math.floor(H * 0.332);
    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0; x <= gx1; x++) {
        const i = (y * W + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const avg = (r + g + b) / 3;
        if (Math.max(r, g, b) - Math.min(r, g, b) <= 11 && avg >= 22 && avg <= 45) {
          d[i + 3] = 0;
        }
      }
    }
  }

  ctx.putImageData(data, 0, 0);
  return c;
}

export const sheets = {};
export async function loadAll(onProgress) {
  const keys = Object.keys(ASSET_MAP);
  let n = 0;
  const loadKey = async (k) => {
    const primarySrc = resolveSrc(ASSET_MAP[k], k);
    const isPreKeyed = primarySrc.includes('/keyed/') && !primarySrc.startsWith('data:');
    let img = await loadImage(primarySrc);
    let usedLegacy = !isPreKeyed;
    if (!img && LEGACY_ASSET_MAP[k]) {
      img = await loadImage(LEGACY_ASSET_MAP[k]);
      usedLegacy = true;
    }
    if (!img) {
      sheets[k] = null;
    } else if (!usedLegacy) {
      /* Pre-keyed WebP: already has 100% clean alpha transparency — instant GPU drawImage! */
      if (k === 'ocean' || k.startsWith('poster')) {
        sheets[k] = img;
      } else {
        sheets[k] = imgToCanvas(img);
      }
    } else if (k === 'ocean') {
      sheets.ocean = img;
      if (!sheets.oceanSprites) sheets.oceanSprites = keyOutOceanSprites(img);
    } else if (k === 'oceanSprites') {
      sheets.oceanSprites = imgToCanvas(img);
    } else if (k.startsWith('poster')) {
      sheets[k] = img;
    } else if (k === 'factory' || k === 'factorySector' || k === 'church') {
      sheets[k] = keyOutBuildingChecker(img, k);
    } else {
      sheets[k] = keyOutChecker(img, k !== 'barrels', k);
    }
    n++;
    if (onProgress) onProgress(n / keys.length);
  };

  /* Stage 1: Мгновенная загрузка бочек и всех 5 спрайт-персонажей на главном экране (< 500 КБ) */
  const stage1 = ['barrels', 'priest', 'capguy', 'boy', 'girl', 'father'];
  await Promise.all(stage1.map(loadKey));

  /* Stage 2: Фоны цеха, овчарка, церковь и море */
  const stage2 = ['factory', 'dog', 'church', 'factorySector', 'ocean', 'oceanSprites'];
  await Promise.all(stage2.map(loadKey));

  /* Stage 3: Постеры актёров и скримеры */
  const rest = keys.filter((k) => !stage1.includes(k) && !stage2.includes(k));
  await Promise.all(rest.map(loadKey));
  return sheets;
}

export function oceanRect(sheet, key) {
  const f = OCEAN_RECTS[key] || OCEAN_RECTS.barrelHand;
  return [f[0] * sheet.width, f[1] * sheet.height, f[2] * sheet.width, f[3] * sheet.height];
}

export function gridRect(sheet, index, cols = 4, rows = 2) {
  const fw = sheet.width / cols, fh = sheet.height / rows;
  return [(index % cols) * fw, Math.floor(index / cols) * fh, fw, fh];
}

export function drawFrame(ctx, sheet, rect, x, y, h, flip = false, fallbackColor = '#5C4328') {
  if (!sheet) {
    ctx.fillStyle = fallbackColor; ctx.fillRect(x - h * 0.2, y - h, h * 0.4, h);
    return;
  }
  const [sx, sy, sw, sh] = rect;
  const w = h * (sw / sh);
  x = Math.round(x); y = Math.round(y);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
  ctx.drawImage(sheet, sx, sy, sw, sh, Math.round(x - w / 2), y - h, w, h);
  ctx.restore();
}

export function barrelRect(sheet, key) {
  const f = BARREL_RECTS[key] || BARREL_RECTS.igor;
  return [f[0] * sheet.width, f[1] * sheet.height, f[2] * sheet.width, f[3] * sheet.height];
}

export function drawBarrelFallback(ctx, x, y, w, h, type) {
  ctx.save();
  ctx.translate(x, y);
  if (type === 'fallen') ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#5c2c16'; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#8B4513'; ctx.fillRect(-w / 2, -h / 2 + h * 0.25, w, h * 0.06); ctx.fillRect(-w / 2, h / 2 - h * 0.31, w, h * 0.06);
  ctx.fillStyle = '#1E2936'; ctx.fillRect(-w / 2, -h / 2, w, h * 0.08);
  ctx.restore();
}
