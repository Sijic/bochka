/* Спрайтовый движок персонажей — «бумажная кукла» на физике без фликера и морфинга.
   1) Для каждого персонажа выбирается канонический опорный кадр в повороте 3/4 вправо,
      где предмет (фонарь у Отца в кадре 6, телефон у Пацана в кадре 0 и у Девушки в кадре 3,
      Библия у Святого отца в кадре 4) уже отрисован в руке художника.
   2) Кадр делится по линии низа куртки/бёдер (hip) и зазору между ногами (split):
      торс с предметом в руке наклоняется и дышит целиком, а две ноги плавно шагают в противофазе.
   3) Фаза шага считается от реальной скорости (setVelocity) и генерирует события шагов (consumeStep)
      для стерео-озвучки шагов по бетонному полу.
   4) Свечение и конус света (beam) выходят ровно из пиксельных координат фонаря/телефона в руке. */
import { sheets } from './assets.js';

export const TORCH = { father: 'lantern', capguy: 'flashlight', girl: 'phone', boy: 'phone', priest: 'book', director: null };

/* Канонический опорный кадр (индекс 0..7 в сетке 4x2) и высота линии бедра (hip) для каждого героя */
const CHAR_SPEC = {
  father:   { base: 6, hip: 0.56, handX: 0.91, handY: 0.48 },  /* кадр 6: Отец держит фонарь в вытянутой руке */
  director: { base: 3, hip: 0.56, handX: 0.90, handY: 0.36 },  /* кадр 3: Режиссёр Алексей Звонцов в чёрной куртке и белой футболке жестикулирует */
  boy:      { base: 1, hip: 0.54, handX: 0.94, handY: 0.275 }, /* кадр 1: Пацан светит вспышкой с верхней части телефона в вытянутой руке */
  girl:   { base: 3, hip: 0.53, handX: 0.95, handY: 0.215 }, /* кадр 3: Девушка — луч строго из верхней LED-вспышки телефона, а не снизу! */
  priest: { base: 4, hip: 0.55, handX: 0.62, handY: 0.42 },  /* кадр 4: Тиль Швайгер в 3/4 с Библией в руке */
  capguy: { base: 3, hip: 0.53, handX: 0.93, handY: 0.325 }, /* кадр 3: Сообщник — пристёгнутый шахтёрский фонарь на груди/в поднятой руке */
  dog:    { base: 0, hip: 0.60, handX: 0.88, handY: 0.28 },  /* кадр 0: Овчарка в стойке боком */
};

const atlases = {};

function scanCell(ctx, cx, cy, cw, ch) {
  const d = ctx.getImageData(cx, cy, cw, ch).data;
  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (d[(y * cw + x) * 4 + 3] > 40) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const sh = maxY - minY + 1, sw = maxX - minX + 1;
  /* центр масс головы и плеч (верхние 38% высоты, без вытянутой руки с фонарём) */
  let sum = 0, cnt = 0, fill = 0;
  const lim = minY + sh * 0.38;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (d[(y * cw + x) * 4 + 3] > 40) {
      fill++;
      if (y < lim) { sum += x; cnt++; }
    }
  }
  const ax = cnt ? sum / cnt - minX : sw / 2;
  /* зазор между ногами: самый «пустой» столбец в нижней трети около оси тела */
  let split = ax, best = Infinity;
  const y0 = Math.floor(minY + sh * 0.68), y1 = maxY;
  const xStart = Math.max(minX + 2, Math.floor(minX + ax - sw * 0.22));
  const xEnd = Math.min(maxX - 2, Math.floor(minX + ax + sw * 0.22));
  for (let x = xStart; x <= xEnd; x++) {
    let c = 0;
    for (let y = y0; y <= y1; y++) if (d[(y * cw + x) * 4 + 3] > 40) c++;
    const score = c + Math.abs(x - minX - ax) * 0.08;
    if (score < best) { best = score; split = x - minX; }
  }
  return { sx: cx + minX, sy: cy + minY, sw, sh, ax, split, fill: fill / (sw * sh) };
}

export function buildAtlas(key, dog = false, cols = 4, rows = 2) {
  if (atlases[key]) return atlases[key];
  const sheet = sheets[key];
  if (!sheet) return null;
  const fw = sheet.width / cols, fh = sheet.height / rows;
  let ctx = null;
  try {
    ctx = sheet.getContext ? sheet.getContext('2d', { willReadFrequently: true }) : null;
    ctx && ctx.getImageData(0, 0, 1, 1);
  } catch (e) { ctx = null; }
  const frames = [];
  for (let i = 0; i < cols * rows; i++) {
    const cx = (i % cols) * fw, cy = Math.floor(i / cols) * fh;
    const cellW = (key === 'father' && i === 6) ? Math.floor(fw * 0.78) : Math.floor(fw);
    let f = null;
    if (ctx) {
      try { f = scanCell(ctx, Math.floor(cx), Math.floor(cy), cellW, Math.floor(fh)); } catch (e) { f = null; }
    }
    frames.push(f || { sx: cx + fw * 0.1, sy: cy + fh * 0.05, sw: fw * 0.8, sh: fh * 0.9, ax: fw * 0.4, split: fw * 0.4, fill: 0.3 });
  }
  const hs = frames.map((f) => f.sh).sort((a, b) => a - b);
  const refH = hs[Math.floor(hs.length / 2)] || fh;
  const spec = CHAR_SPEC[key] || { base: 0, hip: dog ? 0.6 : 0.54, handX: 0.75, handY: 0.5 };
  const base = frames[spec.base] ? spec.base : 0;
  const bf = frames[base];
  if (dog) bf.split = bf.ax;
  const atlas = { sheet, frames, refH, base, hip: spec.hip, spec };
  atlases[key] = atlas;
  return atlas;
}

const ZERO = { bob: 0, lean: 0, swing: 0, breathe: 1, arm: 0.5, armSwing: 0, pitch: 0 };

export class Actor {
  constructor(key, opts = {}) {
    this.key = key;
    this.dog = !!opts.dog;
    this.torch = opts.torch !== undefined ? opts.torch : (TORCH[key] || null);
    this.state = 'idle';
    this.time = 0;
    this.face = 1;
    this.faceV = 1;
    this.phase = Math.random();
    this.breath = Math.random() * 6;
    this.vx = 0;
    this.velSet = false;
    this.strideLen = this.dog ? 42 : 60;
    this.jit = 0;
    this.stepped = false;
    this.fallback = opts.fallback || '#4A5568';
    this.alpha = opts.alpha ?? 1;
    this.p = { ...ZERO };
  }
  play(state) { if (this.state === state) return; this.state = state; this.time = 0; }
  look(dir) { if (dir) this.face = dir < 0 ? -1 : 1; }
  setVelocity(vx) { this.vx = vx || 0; this.velSet = true; }
  consumeStep() { const s = this.stepped; this.stepped = false; return s; }

  update(dt) {
    this.time += dt;
    this.breath += dt;
    this.faceV += (this.face - this.faceV) * Math.min(1, dt * 10);
    const st = this.state, loco = st === 'walk' || st === 'run';
    if (loco) {
      const v = this.velSet ? Math.abs(this.vx) : (st === 'run' ? 2.2 : 1.4) * this.strideLen;
      const prev = this.phase;
      this.phase = (this.phase + v * dt / this.strideLen) % 1;
      if (v > 8 && ((prev < 0.25 && this.phase >= 0.25) || (prev < 0.75 && this.phase >= 0.75))) {
        this.stepped = true;
      }
    } else {
      /* ноги плавно сходятся в стойку */
      const d = this.phase > 0.5 ? 1 - this.phase : -this.phase;
      this.phase = (this.phase + d * Math.min(1, dt * 8) + 1) % 1;
    }
    this.velSet = false;
    this.jit = st === 'panic' ? (Math.random() - 0.5) * 2.5 : 0;
    const tg = this.target();
    const k = Math.min(1, dt * 14);
    for (const key in tg) this.p[key] += (tg[key] - this.p[key]) * k;
  }

  target() {
    const st = this.state, p = this.phase, tp = this.time, two = Math.PI * 2, o = { ...ZERO };
    const sway = Math.sin(this.breath * 1.2) * 0.01;
    switch (st) {
      case 'walk':
        o.swing = Math.sin(p * two) * 0.16;
        o.bob = Math.abs(Math.sin(p * two)) * 0.024;
        o.lean = 0.025 + Math.sin(p * two * 2) * 0.008;
        o.armSwing = Math.cos(p * two) * 0.025;
        break;
      case 'run':
        o.swing = Math.sin(p * two) * 0.25;
        o.bob = Math.abs(Math.sin(p * two)) * 0.042;
        o.lean = 0.08;
        o.armSwing = Math.cos(p * two) * 0.04;
        o.arm = 0.55;
        break;
      case 'flash':
        o.lean = 0.02 + sway;
        o.arm = 0.58;
        o.breathe = 1 + Math.sin(this.breath * 2) * 0.01;
        break;
      case 'point':
        o.lean = 0.05;
        o.arm = 0.62;
        break;
      case 'action':
      case 'special': {
        const k = tp < 1.2 ? Math.max(0, Math.sin(tp * 14)) : 0;
        o.lean = 0.03 + k * 0.10;
        o.arm = 0.56 + k * 0.06;
        o.bob = k * 0.01;
        break;
      }
      case 'panic':
        o.lean = Math.sin(tp * 20) * 0.035 - 0.02;
        o.bob = Math.abs(Math.sin(tp * 9)) * 0.012;
        o.arm = 0.60;
        o.breathe = 1 + Math.sin(tp * 9) * 0.014;
        break;
      default:
        o.lean = sway;
        o.breathe = 1 + Math.sin(this.breath * 2.2) * 0.012;
        o.arm = 0.5 - Math.sin(this.breath * 2.2) * 0.005;
    }
    if (this.dog) {
      o.lean = 0;
      switch (st) {
        case 'sniff': o.pitch = 0.14 + Math.sin(tp * 3) * 0.03; break;
        case 'bark': o.pitch = -0.10 + Math.sin(tp * 18) * 0.05; o.bob = Math.abs(Math.sin(tp * 9)) * 0.02; break;
        case 'sit': o.pitch = -0.22; break;
        case 'run': o.swing = Math.sin(p * two) * 0.32; o.bob = Math.abs(Math.sin(p * two)) * 0.05; o.pitch = 0.02; break;
        case 'walk': o.swing = Math.sin(p * two) * 0.20; o.bob = Math.abs(Math.sin(p * two)) * 0.022; break;
        default: o.pitch = Math.sin(this.breath * 0.9) * 0.02;
      }
    }
    return o;
  }

  /* геометрия кисти и предмета в локальных координатах (персонаж смотрит вправо, ступни в (0,0)) */
  rig(h) {
    const atlas = buildAtlas(this.key, this.dog), p = this.p;
    const f = atlas ? atlas.frames[atlas.base] : null;
    const spec = atlas ? atlas.spec : (CHAR_SPEC[this.key] || CHAR_SPEC.father);
    const dh = h, dw = f ? h * (f.sw / f.sh) : h * 0.38, ax = f ? (f.ax / f.sw) * dw : dw / 2;
    const hip = atlas ? atlas.hip : 0.54, hipY = -dh * (1 - hip);
    const hx = (spec.handX * dw - ax) + p.armSwing * dw;
    const hy = -dh * (1 - spec.handY);
    /* точка предмета поворачивается вместе с торсом вокруг бедра */
    const rel = hy - hipY, ang = p.lean + p.pitch, c = Math.cos(ang), s = Math.sin(ang);
    const rx = hx * c - rel * s, ry = hx * s + rel * c + hipY;
    return { atlas, f, dh, dw, ax, hip, hipY, hx: rx, hy: ry, ang: ang + 0.06 };
  }

  /* мировые координаты источника света (линза шахтёрского фонаря / верхняя LED-вспышка телефона / колба фонаря) */
  hand(x, y, h) {
    const r = this.rig(h), len = this.torch === 'flashlight' ? h * 0.105 : 0;
    const lx = r.hx + Math.cos(r.ang) * len * 0.68, ly = r.hy + Math.sin(r.ang) * len * 0.68;
    const fv = this.faceV || 0.001;
    return { x: x + this.jit + fv * lx, y: y - this.p.bob * h + ly, dx: fv * Math.cos(r.ang), dy: Math.sin(r.ang) };
  }

  /* луч из фонаря вперёд */
  beam(ctx, x, y, h, len = 240, color = '236,228,210', strength = 0.16, spread = 60) {
    if (!this.dog && (!this.torch || this.torch === 'book')) return;
    const hp = this.hand(x, y, h);
    drawCone(ctx, hp.x, hp.y, hp.x + hp.dx * len, hp.y + hp.dy * len * 0.32, color, strength, spread);
  }

  drawTorch(ctx, r) {
    const t = this.torch; if (!t || t === 'book') return;
    const h = r.dh;
    ctx.save();
    if (t === 'flashlight') {
      /* У сообщника в кепке (capguy):
         1) На лямке рюкзака на груди пристёгнут аккумуляторный блок шахтёрского фонаря с витым проводом,
         2) В поднятой перед грудью руке — крупный шахтёрский фонарь «Коногонка» с латунным ободком,
            верхней скобой-креплением и яркой линзой-отражателем, чтобы было чётко видно, откуда бьёт луч! */
      const chestX = r.hx - h * 0.14;
      const chestY = r.hy + h * 0.05;
      /* Пристёгнутый к лямке нагрудный блок и витой шнур питания к фонарю */
      ctx.fillStyle = '#1E242D';
      ctx.strokeStyle = '#8C6D32';
      ctx.lineWidth = Math.max(1, h * 0.01);
      ctx.fillRect(chestX - h * 0.035, chestY - h * 0.025, h * 0.05, h * 0.055);
      ctx.strokeRect(chestX - h * 0.035, chestY - h * 0.025, h * 0.05, h * 0.055);
      ctx.beginPath();
      ctx.strokeStyle = '#14181F';
      ctx.lineWidth = Math.max(1.5, h * 0.014);
      ctx.moveTo(chestX + h * 0.01, chestY);
      ctx.quadraticCurveTo((chestX + r.hx) * 0.5, chestY + h * 0.04, r.hx - h * 0.02, r.hy + h * 0.01);
      ctx.stroke();

      /* Сам шахтёрский фонарь в вытянутой руке (выступает перед силуэтом героя) */
      ctx.translate(r.hx, r.hy);
      ctx.rotate(r.ang);
      const len = h * 0.105, th = h * 0.052;
      /* Верхняя металлическая скоба-прищепка шахтёрского фонаря */
      ctx.strokeStyle = '#B89B5E';
      ctx.lineWidth = Math.max(1.3, h * 0.012);
      ctx.strokeRect(-len * 0.25, -th * 0.82, len * 0.55, th * 0.35);
      /* Цилиндрический стальной корпус с жёлто-латунными поясками */
      ctx.fillStyle = '#1E2631';
      ctx.fillRect(-len * 0.38, -th * 0.48, len * 0.78, th * 0.96);
      ctx.fillStyle = '#D4A843';
      ctx.fillRect(-len * 0.18, -th * 0.48, len * 0.12, th * 0.96);
      /* Широкий раструб-рефлектор шахтёрской фары спереди */
      ctx.fillStyle = '#2E3948';
      ctx.beginPath();
      ctx.moveTo(len * 0.36, -th * 0.50);
      ctx.lineTo(len * 0.68, -th * 0.72);
      ctx.lineTo(len * 0.68, th * 0.72);
      ctx.lineTo(len * 0.36, th * 0.50);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#D4A843';
      ctx.lineWidth = Math.max(1.2, h * 0.011);
      ctx.stroke();
      /* Яркая светящаяся линза на срезе раструба (откуда ровно выходит луч drawCone) */
      ctx.fillStyle = '#FFF8DC';
      ctx.beginPath();
      ctx.ellipse(len * 0.68, 0, Math.max(2, h * 0.014), th * 0.64, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(len * 0.68, 0, 1, len * 0.68, 0, h * 0.12);
      g.addColorStop(0, 'rgba(255,244,200,0.85)');
      g.addColorStop(0.45, 'rgba(236,205,130,0.35)');
      g.addColorStop(1, 'rgba(236,205,130,0)');
      ctx.fillStyle = g;
      ctx.fillRect(len * 0.68 - h * 0.12, -h * 0.12, h * 0.24, h * 0.24);
    } else if (t === 'lantern') {
      /* У Отца в кадре 6 настоящий пиксельный фонарь уже зажат в руке — подсвечиваем его колбу тёплым огнём */
      ctx.translate(r.hx, r.hy);
      const pulse = 0.88 + Math.sin(this.breath * 5) * 0.12;
      const rad = h * 0.15 * pulse;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, rad);
      g.addColorStop(0, 'rgba(255,220,130,0.72)');
      g.addColorStop(0.35, 'rgba(212,154,69,0.38)');
      g.addColorStop(1, 'rgba(212,154,69,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
    } else if (t === 'phone') {
      /* У Девушки (кадр 3) и Пацана (кадр 1) луч выходит строго из ВЕРХНЕЙ LED-вспышки камеры смартфона! */
      ctx.translate(r.hx, r.hy);
      const rad = h * 0.085;
      const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, rad);
      g.addColorStop(0, 'rgba(240,252,255,0.95)');
      g.addColorStop(0.35, 'rgba(150,220,250,0.55)');
      g.addColorStop(1, 'rgba(74,122,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      /* Яркая точка самого светодиода вспышки в верхней части смартфона */
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.8, h * 0.016), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx, x, y, h) {
    const r = this.rig(h), p = this.p, fv = this.faceV || 0.001;
    ctx.save();
    ctx.translate(Math.round(x + this.jit), Math.round(y - p.bob * h));
    ctx.scale(fv, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha *= this.alpha;
    if (!r.atlas) {
      ctx.fillStyle = this.fallback; ctx.fillRect(-h * 0.17, -h, h * 0.34, h);
      this.drawTorch(ctx, r); ctx.restore(); return;
    }
    const { sheet } = r.atlas, f = r.f, { dh, dw, ax, hip, hipY } = r;
    const legSy = f.sy + f.sh * hip, legSh = f.sh * (1 - hip), legDh = dh * (1 - hip);
    const splS = Math.max(1, Math.min(f.sw - 1, f.split)), splD = (splS / f.sw) * dw;
    /* ноги: плавный шаг вокруг линии бёдер в противофазе */
    const leg = (sx0, sw0, dx0, dw0, shear) => {
      ctx.save();
      ctx.translate(0, hipY);
      ctx.transform(1, 0, shear, 1, 0, -Math.abs(shear) * legDh * 0.12);
      ctx.drawImage(sheet, sx0, legSy, sw0, legSh, dx0, 0, dw0, legDh);
      ctx.restore();
    };
    leg(f.sx, Math.min(f.sw, splS + 2), -ax, splD + 1.5, p.swing);
    leg(Math.max(f.sx, f.sx + splS - 2), f.sw - splS + 2, -ax + splD - 1.5, dw - splD + 1.5, -p.swing);
    /* торс с головой и предметом в руке: наклон вокруг бедра + дыхание */
    const ov = f.sh * 0.08, ovD = dh * 0.08;
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(p.lean + p.pitch);
    ctx.scale(1, p.breathe);
    ctx.drawImage(sheet, f.sx, f.sy, f.sw, f.sh * hip + ov, -ax, -dh * hip, dw, dh * hip + ovD);
    ctx.restore();
    this.drawTorch(ctx, r);
    ctx.restore();
  }
}

/* Простейшая физика движения по оси X: разгон/торможение с ограничением ускорения */
export function moveX(body, targetVx, dt, accel = 420) {
  body.vx = (body.vx || 0) + Math.max(-accel * dt, Math.min(accel * dt, targetVx - (body.vx || 0)));
  body.x += body.vx * dt;
  return body.vx;
}

/* Мягкая многослойная контактная тень под персонажем */
export function drawShadow(ctx, x, y, w, alpha = 0.52) {
  ctx.save();
  ctx.translate(x, y + 2);
  ctx.scale(1, 0.24);
  const g = ctx.createRadialGradient(0, 0, w * 0.1, 0, 0, w * 1.15);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.55})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Объёмный кинематографический конус света фонаря с мягкой полутенью, ярким ядром и пылинками в луче */
export function drawCone(ctx, fx, fy, tx, ty, color = '236,228,210', strength = 0.16, spread = 60) {
  const dx = tx - fx, dy = ty - fy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  ctx.save();

  /* 1. Широкий внешний ореол рассеянного света (полутень) */
  const gOuter = ctx.createLinearGradient(fx, fy, tx, ty);
  gOuter.addColorStop(0, `rgba(${color},${Math.min(1, strength * 0.62)})`);
  gOuter.addColorStop(0.55, `rgba(${color},${strength * 0.24})`);
  gOuter.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gOuter;
  ctx.beginPath();
  ctx.moveTo(fx - nx * 3, fy - ny * 3);
  ctx.lineTo(tx + nx * spread * 1.28, ty + ny * spread * 1.28);
  ctx.lineTo(tx - nx * spread * 1.28, ty - ny * spread * 1.28);
  ctx.lineTo(fx + nx * 3, fy + ny * 3);
  ctx.closePath();
  ctx.fill();

  /* 2. Яркое сфокусированное ядро луча */
  const gCore = ctx.createLinearGradient(fx, fy, tx, ty);
  gCore.addColorStop(0, `rgba(255,252,240,${Math.min(1, strength * 1.15)})`);
  gCore.addColorStop(0.35, `rgba(${color},${Math.min(1, strength * 0.72)})`);
  gCore.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gCore;
  ctx.beginPath();
  ctx.moveTo(fx - nx * 1.5, fy - ny * 1.5);
  ctx.lineTo(tx + nx * spread * 0.56, ty + ny * spread * 0.56);
  ctx.lineTo(tx - nx * spread * 0.56, ty - ny * spread * 0.56);
  ctx.lineTo(fx + nx * 1.5, fy + ny * 1.5);
  ctx.closePath();
  ctx.fill();

  /* 3. Световой блик на самой линзе источника света */
  const gLens = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, 16);
  gLens.addColorStop(0, `rgba(255,255,245,${Math.min(1, strength * 2.1)})`);
  gLens.addColorStop(0.45, `rgba(${color},${Math.min(1, strength * 0.85)})`);
  gLens.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gLens;
  ctx.beginPath();
  ctx.arc(fx, fy, 16, 0, Math.PI * 2);
  ctx.fill();

  /* 4. Световое пятно в точке падения луча */
  const gSpot = ctx.createRadialGradient(tx, ty, 2, tx, ty, spread * 0.75);
  gSpot.addColorStop(0, `rgba(${color},${Math.min(1, strength * 0.42)})`);
  gSpot.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gSpot;
  ctx.beginPath();
  ctx.arc(tx, ty, spread * 0.75, 0, Math.PI * 2);
  ctx.fill();

  /* 5. Мерцающие пылинки в воздухе внутри конуса света */
  const tNow = performance.now() * 0.0012;
  for (let i = 1; i <= 5; i++) {
    const f = ((i * 0.19 + tNow * 0.14) % 0.86) + 0.08;
    const lat = Math.sin(tNow * 1.7 + i * 2.3) * spread * f * 0.55;
    const mx = fx + dx * f + nx * lat;
    const my = fy + dy * f + ny * lat;
    const ma = (1 - f) * strength * 1.6;
    ctx.fillStyle = `rgba(255,250,235,${Math.min(0.75, ma)})`;
    ctx.beginPath();
    ctx.arc(mx, my, 1.3 + (i % 2) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* Обтягивающая цилиндрическая наклейка с именем на бочке:
   изогнута по эллиптической дуге цилиндра, имеет 3D-затенение к краям бочки,
   складки натяжения, потертости, слегка отклеившийся уголок и посимвольную
   укладку букв по дуге с перспективным сжатием (cos θ) к краям цилиндра */
/* Кэш готовых 3D-наклеек на бочки (убирает ~260 вызовов fillText и ~500 тригонометрических точек каждый кадр -> прирост FPS в 5–8 раз!) */
const labelStampCache = new Map();

export function drawBarrelWrappedLabel(ctx, sx, sy, bh, ruName, opts = {}) {
  if (!ruName) return;
  const text = String(ruName).trim().toUpperCase();
  if (!text) return;
  const subText = opts.subName ? String(opts.subName).trim().toUpperCase() : '';
  const roleText = opts.role ? String(opts.role).trim().toUpperCase() : '';
  const glow = Math.max(0, Math.min(1, opts.glow || 0));

  ctx.save();
  if (opts.fallen) {
    const hh = bh * 0.65;
    ctx.translate(sx + bh * 0.14, sy - hh * 0.50);
    ctx.rotate(-1.38);
    sx = 0;
    sy = bh * 0.36;
    bh = bh * 0.78;
  }

  const qBh = Math.max(24, Math.round(bh));
  const qGlow = glow > 0.14 ? 1 : 0;
  const cacheKey = `${qBh}|${text}|${subText}|${roleText}|${qGlow}|${opts.wFrac ?? ''}|${opts.yFrac ?? ''}|${opts.hFrac ?? ''}`;
  let stamp = labelStampCache.get(cacheKey);
  if (!stamp) {
    if (labelStampCache.size > 160) labelStampCache.clear();
    const scale = 1.5;
    const wLog = Math.ceil(qBh * 0.76);
    const hLog = Math.ceil(qBh * 0.78);
    const ox = wLog * 0.5;
    const oy = qBh * 0.72;
    const c = document.createElement('canvas');
    c.width = Math.ceil(wLog * scale);
    c.height = Math.ceil(hLog * scale);
    const sctx = c.getContext('2d');
    sctx.scale(scale, scale);
    renderBarrelWrappedLabelRaw(sctx, ox, oy, qBh, text, subText, roleText, qGlow ? 0.65 : 0, opts);
    stamp = { c, ox, oy, wLog, hLog };
    labelStampCache.set(cacheKey, stamp);
  }
  ctx.drawImage(stamp.c, sx - stamp.ox, sy - stamp.oy, stamp.wLog, stamp.hLog);
  ctx.restore();
}

function renderBarrelWrappedLabelRaw(ctx, sx, sy, bh, text, subText, roleText, glow, opts = {}) {
  const hasTwoLines = Boolean(subText);
  ctx.save();

  const bw = bh * (opts.wFrac ?? 0.54);
  const R = bw * 0.50;
  const cy = sy - bh * (opts.yFrac ?? (hasTwoLines ? 0.485 : 0.455));
  const bandH = Math.max(hasTwoLines ? 18 : 10, bh * (opts.hFrac ?? (hasTwoLines ? 0.255 : 0.168)));
  const sag = bh * (opts.sagFrac ?? 0.038);
  const thetaMax = opts.thetaMax ?? 1.20;
  const steps = 18;

  const pt = (theta, yOff = 0) => ({
    x: sx + R * Math.sin(theta),
    y: cy + yOff + sag * (Math.cos(theta) - 0.5),
  });

  const traceStickerPath = (yShift = 0, insetTheta = 0, customHalfH = bandH * 0.5, baseCy = cy) => {
    const tMax = Math.max(0.4, thetaMax - insetTheta);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const th = -tMax + (i / steps) * (tMax * 2);
      const x = sx + R * Math.sin(th);
      const y = baseCy - customHalfH + yShift + sag * (Math.cos(th) - 0.5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const th = -tMax + (i / steps) * (tMax * 2);
      const x = sx + R * Math.sin(th);
      const y = baseCy + customHalfH + yShift + sag * (Math.cos(th) - 0.5);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  /* 1. Тонкая контактная тень под нижним краем наклейки на металле бочки */
  traceStickerPath(1.8, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.fill();

  /* 2. Основа обтягивающей наклейки с цилиндрическим 3D-градиентом (от глубокой тени на ребрах к блику) */
  traceStickerPath(0, 0);
  const xLeft = sx - R * Math.sin(thetaMax);
  const xRight = sx + R * Math.sin(thetaMax);
  const g = ctx.createLinearGradient(xLeft, cy, xRight, cy);
  if (glow > 0.05) {
    g.addColorStop(0.00, 'rgba(38, 26, 14, 0.97)');
    g.addColorStop(0.12, 'rgba(158, 126, 76, 0.96)');
    g.addColorStop(0.30, 'rgba(248, 228, 182, 0.98)');
    g.addColorStop(0.52, 'rgba(222, 196, 148, 0.97)');
    g.addColorStop(0.84, 'rgba(138, 108, 66, 0.95)');
    g.addColorStop(1.00, 'rgba(32, 20, 11, 0.97)');
  } else {
    g.addColorStop(0.00, 'rgba(32, 23, 15, 0.96)');
    g.addColorStop(0.11, 'rgba(132, 110, 78, 0.94)');
    g.addColorStop(0.28, 'rgba(228, 210, 174, 0.97)');
    g.addColorStop(0.52, 'rgba(198, 176, 140, 0.95)');
    g.addColorStop(0.84, 'rgba(116, 94, 66, 0.94)');
    g.addColorStop(1.00, 'rgba(26, 18, 12, 0.96)');
  }
  ctx.fillStyle = g;
  ctx.fill();

  /* Внешняя потёртая кромка наклейки */
  ctx.strokeStyle = glow > 0.15 ? `rgba(212, 168, 67, ${0.55 + glow * 0.4})` : 'rgba(24, 17, 11, 0.82)';
  ctx.lineWidth = glow > 0.15 ? 1.3 : 1;
  ctx.stroke();

  /* 3. Внутренняя трафаретная рамка, повторяющая изгиб цилиндра */
  if (bh >= 68) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 38, 22, 0.46)';
    ctx.lineWidth = Math.max(0.8, bh * 0.007);
    [-bandH * 0.41, bandH * 0.41].forEach((yo) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const th = -thetaMax * 0.92 + (i / steps) * (thetaMax * 1.84);
        const p = pt(th, yo);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    });

    /* Тонкий пунктирный разделитель между именем и фамилией при 2-строчной укладке */
    if (hasTwoLines) {
      ctx.strokeStyle = 'rgba(68, 46, 26, 0.32)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const th = -thetaMax * 0.78 + (i / steps) * (thetaMax * 1.56);
        const p = pt(th, 0);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    /* Складки натяжения и микро-пузырьки воздуха под наклейкой */
    ctx.strokeStyle = 'rgba(255, 248, 230, 0.28)';
    ctx.lineWidth = 0.9;
    const c1a = pt(-0.68, -bandH * 0.32), c1b = pt(-0.36, bandH * 0.24);
    const c2a = pt(0.42, -bandH * 0.22), c2b = pt(0.74, bandH * 0.34);
    ctx.beginPath();
    ctx.moveTo(c1a.x, c1a.y);
    ctx.lineTo(c1b.x, c1b.y);
    ctx.moveTo(c2a.x, c2a.y);
    ctx.lineTo(c2b.x, c2b.y);
    ctx.stroke();

    /* Боковые штрих-риски на краях наклейки (эффект заводской маркировки) */
    ctx.fillStyle = 'rgba(42, 28, 18, 0.55)';
    [-thetaMax * 0.88, thetaMax * 0.88].forEach((thEdge) => {
      const pe = pt(thEdge, 0);
      ctx.fillRect(pe.x - 1, pe.y - bandH * 0.30, 1.6, bandH * 0.60);
    });

    /* Слегка отклеившийся правый верхний уголок наклейки (dog-ear peel) */
    const pCorner = pt(thetaMax * 0.88, -bandH * 0.48);
    const peelSz = Math.max(3.5, bh * 0.032);
    ctx.fillStyle = 'rgba(12, 9, 6, 0.68)';
    ctx.beginPath();
    ctx.moveTo(pCorner.x - peelSz, pCorner.y);
    ctx.lineTo(pCorner.x + 1, pCorner.y);
    ctx.lineTo(pCorner.x + 1, pCorner.y + peelSz);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(242, 228, 198, 0.92)';
    ctx.beginPath();
    ctx.moveTo(pCorner.x - peelSz, pCorner.y);
    ctx.lineTo(pCorner.x - peelSz * 0.18, pCorner.y + peelSz * 0.88);
    ctx.lineTo(pCorner.x + 1, pCorner.y + peelSz);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* Вспомогательная функция посимвольной укладки строки по дуге цилиндра с cos(θ) сжатием */
  const drawCurvedChars = (str, yOffset, maxFontH, charScale = 1, isLightInk = false) => {
    const chars = [...str];
    const n = chars.length;
    if (!n) return;
    const stepPerChar = n > 8 ? 0.138 : n > 6 ? 0.162 : 0.195;
    const span = Math.min(thetaMax * 1.36, Math.max(0.44, (n - 1) * stepPerChar));
    const fs = Math.max(
      6.5,
      Math.min(
        Math.round(maxFontH),
        Math.round((bh * 0.114 * charScale) * Math.min(1, 6.6 / Math.max(4.4, n)))
      )
    );
    ctx.font = `900 ${fs}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      const theta = n === 1 ? 0 : -span * 0.5 + (i / (n - 1)) * span;
      const p = pt(theta, yOffset);
      const slope = Math.atan2(-sag * Math.sin(theta), R * Math.cos(theta)) * 0.88;
      const foreshorten = Math.max(0.54, Math.cos(theta));

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(slope);
      ctx.scale(foreshorten, 1);

      if (isLightInk) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
        ctx.fillText(chars[i], 0, 0.8);
        ctx.fillStyle = glow > 0.1 ? '#FFD166' : '#E8D2A6';
        ctx.fillText(chars[i], 0, 0);
      } else {
        ctx.fillStyle = 'rgba(255, 248, 228, 0.48)';
        ctx.fillText(chars[i], 0, -0.7);
        const inkShade = Math.round(12 + (1 - foreshorten) * 14);
        ctx.fillStyle = `rgb(${inkShade + 8}, ${inkShade + 3}, ${inkShade})`;
        ctx.fillText(chars[i], 0, 0.4);
      }
      ctx.restore();
    }
  };

  /* 4. Посимвольная отрисовка имени по цилиндрической дуге */
  if (hasTwoLines) {
    drawCurvedChars(text, -bandH * 0.20, bandH * 0.43, 0.88, false);
    drawCurvedChars(subText, bandH * 0.21, bandH * 0.43, 0.88, false);
  } else {
    drawCurvedChars(text, bandH * 0.03, bandH * 0.76, 1.0, false);
  }

  /* 5. Если передана роль (opts.role) — рисуем нижний опоясывающий трафаретный пояс роли вокруг цилиндра бочки */
  if (roleText && bh >= 74) {
    const roleCy = sy - bh * 0.215;
    const roleHalfH = Math.max(5.5, bh * 0.056);
    traceStickerPath(1.2, 0.08, roleHalfH, roleCy);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();

    traceStickerPath(0, 0.08, roleHalfH, roleCy);
    const rg = ctx.createLinearGradient(xLeft, roleCy, xRight, roleCy);
    rg.addColorStop(0.00, 'rgba(6, 8, 11, 0.95)');
    rg.addColorStop(0.25, 'rgba(24, 28, 36, 0.92)');
    rg.addColorStop(0.50, 'rgba(34, 40, 50, 0.94)');
    rg.addColorStop(0.75, 'rgba(20, 24, 32, 0.92)');
    rg.addColorStop(1.00, 'rgba(5, 7, 10, 0.95)');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = glow > 0.1 ? 'rgba(255, 209, 102, 0.78)' : 'rgba(212, 168, 67, 0.52)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    const roleOffsetFromMain = roleCy - cy;
    drawCurvedChars(roleText, roleOffsetFromMain + 0.5, roleHalfH * 1.45, 0.58, true);
  }

  ctx.restore();
}

/* Обтягивающая верхняя наклейка-индикатор бонусного ресурса бочки (⚡ ЭНЕРГИЯ, 💨 ВОЗДУХ, ❤️ ЖИЗНЬ) */
export function drawBarrelWrappedBadge(ctx, sx, sy, bh, rewardBadge) {
  if (!rewardBadge) return;
  const badgeColor = rewardBadge === 'life'
    ? '#FF5A5F'
    : rewardBadge === 'energy'
      ? '#5BC0EB'
      : '#64DFDF';
  const badgeIcon = rewardBadge === 'life'
    ? '❤️ ЖИЗНЬ'
    : rewardBadge === 'energy'
      ? '⚡ ЭНЕРГИЯ'
      : '💨 ВОЗДУХ';

  const bw = bh * 0.52;
  const R = bw * 0.49;
  const cy = sy - bh * 0.675;
  const bandH = Math.max(12, bh * 0.115);
  const sag = bh * 0.028;
  const thetaMax = 1.05;
  const steps = 12;

  const pt = (theta, yOff = 0) => ({
    x: sx + R * Math.sin(theta),
    y: cy + yOff + sag * (Math.cos(theta) - 0.5),
  });

  ctx.save();
  /* Мягкое свечение вокруг бонусной наклейки */
  const glow = ctx.createRadialGradient(sx, cy, 2, sx, cy, R * 1.25);
  glow.addColorStop(0, rewardBadge === 'life' ? 'rgba(255,90,95,0.28)' : 'rgba(91,192,235,0.24)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - R * 1.3, cy - bandH * 1.4, R * 2.6, bandH * 2.8);

  /* Изогнутая форма бонусной ленты по цилиндру */
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const th = -thetaMax + (i / steps) * (thetaMax * 2);
    const p = pt(th, -bandH * 0.5);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  for (let i = steps; i >= 0; i--) {
    const th = -thetaMax + (i / steps) * (thetaMax * 2);
    const p = pt(th, bandH * 0.5);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();

  const bg = ctx.createLinearGradient(sx - R, cy, sx + R, cy);
  bg.addColorStop(0, 'rgba(6, 10, 15, 0.95)');
  bg.addColorStop(0.35, 'rgba(18, 28, 38, 0.94)');
  bg.addColorStop(1, 'rgba(6, 10, 15, 0.95)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  const fs = Math.max(8, Math.round(bandH * 0.64));
  ctx.font = `bold ${fs}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = badgeColor;
  ctx.fillText(badgeIcon, sx, cy + sag * 0.45 + 0.5);
  ctx.restore();
}
