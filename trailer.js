/* Трейлер фильма:
   - Если в config.js указан CONFIG.trailer.youtubeId — рендерится YouTube-плеер.
   - Если указан CONFIG.trailer.mp4 — рендерится HTML5 видеоплеер.
   - Если оба поля пустые — рисуется процедурный canvas-тизер без внешних видеофайлов. */
import { CONFIG, safeUrl } from './config.js';

const W = 960, H = 540;
const C = {
  abyss: '#070A0E', concrete: '#0F141C', tile: '#161F29',
  amber: '#D49A45', cyan: '#4A7A8C', rust: '#9E2A2B',
  chalk: '#E6E8EA', steel: '#8C9BAE', iron: '#4A5568', seam: '#1E2936', rustEdge: '#5C4328'
};
const FONT_T = "'Cormorant Garamond', Georgia, serif";
const FONT_M = "'JetBrains Mono', monospace";

/* Сцены: [длительность сек, тип, строки] */
const SCENES = [
  [3.0, 'card', ['СТУЧИТЕ,', 'И ОТВОРЯТ ВАМ…']],
  [4.0, 'barrel', ['ЦЕХ № 04 / СЕКТОР Б']],
  [2.6, 'card', ['ПОПУЛЯРНЫЙ БЛОГЕР', 'ЗАПЕРТ В СТАЛЬНОЙ БОЧКЕ']],
  [4.0, 'hand', ['ЕДИНСТВЕННЫЙ КЛЮЧ — У ЕГО ОТЦА']],
  [2.6, 'card', ['ТИЛЬ ШВАЙГЕР', 'ФИЛИПП РЕЙНХАРДТ']],
  [3.4, 'chains', ['ИГРА НА ВЫЖИВАНИЕ НАЧАЛАСЬ']],
  [3.6, 'title', ['БОЧКА', 'ДОСТУЧАТЬСЯ ДО НЕБЕС']],
  [3.0, 'card', ['В КИНО', '17 ДЕКАБРЯ']],
  [2.4, 'card', ['18+', 'РЕЖИССЁР — АЛЕКСЕЙ ЗВОНЦОВ']]
];
const TOTAL = SCENES.reduce((a, s) => a + s[0], 0);

function injectStyle() {
  if (document.getElementById('trailerStyle')) return;
  const st = document.createElement('style');
  st.id = 'trailerStyle';
  st.textContent = `
    .trailer-wrap{position:relative;width:100%;max-width:960px;aspect-ratio:16/9;background:${C.abyss};border:1px solid ${C.seam};box-shadow:inset 0 0 40px rgba(0,0,0,.7);overflow:hidden;cursor:pointer}
    .trailer-wrap canvas,.trailer-wrap video,.trailer-wrap iframe{display:block;width:100%;height:100%;border:0;object-fit:cover}
    .trailer-wrap::before,.trailer-wrap::after{content:'';position:absolute;width:14px;height:14px;border-color:${C.cyan};border-style:solid;pointer-events:none;z-index:2}
    .trailer-wrap::before{top:8px;left:8px;border-width:2px 0 0 2px}
    .trailer-wrap::after{bottom:8px;right:8px;border-width:0 2px 2px 0}
    .trailer-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:rgba(7,10,14,.55);transition:opacity .25s;z-index:1}
    .trailer-play.is-hidden{opacity:0;pointer-events:none}
    .trailer-play span{font-family:${FONT_M};font-size:12px;letter-spacing:.2em;color:${C.chalk};padding:10px 20px;border:1px solid ${C.amber};background:${C.tile}}
    .trailer-wrap:hover .trailer-play span{background:${C.amber};color:${C.abyss};box-shadow:0 0 16px rgba(212,154,69,.25)}
    .trailer-play small{font-family:${FONT_M};font-size:10px;letter-spacing:.15em;color:${C.steel}}
    .trailer-bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:${C.seam};z-index:2}
    .trailer-bar i{display:block;height:100%;width:0;background:${C.amber}}
  `;
  document.head.appendChild(st);
}

function makeGrain() {
  const g = document.createElement('canvas'); g.width = 240; g.height = 135;
  const x = g.getContext('2d'); const img = x.createImageData(240, 135);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0); return g;
}

function drawFloor(x, t) {
  x.fillStyle = C.abyss; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.concrete); g.addColorStop(0.62, '#0a0f15'); g.addColorStop(1, '#05070a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const bx = 160 + i * 300 + Math.sin(t * 0.3 + i) * 10;
    const lg = x.createLinearGradient(bx, 0, bx - 180, H);
    lg.addColorStop(0, 'rgba(212,154,69,0.10)'); lg.addColorStop(1, 'rgba(212,154,69,0)');
    x.fillStyle = lg; x.beginPath(); x.moveTo(bx - 40, 0); x.lineTo(bx + 40, 0); x.lineTo(bx - 140, H); x.lineTo(bx - 260, H); x.closePath(); x.fill();
  }
  x.restore();
  x.fillStyle = 'rgba(30,41,54,.6)'; x.fillRect(0, H * 0.68, W, 1);
}

function drawBarrel(x, cx, cy, s, t, opts = {}) {
  x.save(); x.globalCompositeOperation = 'lighter';
  const cone = x.createRadialGradient(cx, cy - 170 * s, 10, cx, cy, 190 * s);
  cone.addColorStop(0, 'rgba(74,122,140,0.35)'); cone.addColorStop(1, 'rgba(74,122,140,0)');
  x.fillStyle = cone; x.beginPath(); x.moveTo(cx - 12 * s, cy - 200 * s); x.lineTo(cx + 12 * s, cy - 200 * s); x.lineTo(cx + 150 * s, cy + 30 * s); x.lineTo(cx - 150 * s, cy + 30 * s); x.closePath(); x.fill();
  x.restore();
  const shake = opts.knock ? Math.sin(t * 40) * (Math.sin(t * 3) > 0.6 ? 3 : 0) : 0;
  x.save(); x.translate(cx + shake, cy);
  const bw = 90 * s, bh = 130 * s;
  const bg = x.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  bg.addColorStop(0, '#1a1410'); bg.addColorStop(0.45, C.rustEdge); bg.addColorStop(0.6, '#3a2a1a'); bg.addColorStop(1, '#0d0a08');
  x.fillStyle = bg; x.fillRect(-bw / 2, -bh, bw, bh);
  x.fillStyle = '#2a2017'; x.beginPath(); x.ellipse(0, -bh, bw / 2, 12 * s, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(230,232,234,.12)'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(0, -bh, bw / 2, 12 * s, 0, 0, Math.PI * 2); x.stroke();
  for (const r of [0.25, 0.5, 0.75]) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(-bw / 2, -bh * r - 3, bw, 4); }
  x.font = `700 ${13 * s}px ${FONT_M}`; x.fillStyle = 'rgba(230,232,234,.55)'; x.textAlign = 'center';
  if (opts.name) x.fillText(opts.name, 0, -bh * 0.42);
  if (opts.hand) {
    const hy = -bh - 10 * s - Math.sin(t * 2) * 4;
    x.fillStyle = '#c9b8a6'; x.fillRect(-7 * s, hy - 70 * s, 14 * s, 70 * s);
    for (let f = 0; f < 4; f++) { x.save(); x.translate(-10 * s + f * 7 * s, hy - 70 * s); x.rotate((f - 1.5) * 0.18); x.fillRect(-2.5 * s, -26 * s, 5 * s, 28 * s); x.restore(); }
  }
  if (opts.chains) {
    x.strokeStyle = '#6b7280'; x.lineWidth = 3 * s; x.setLineDash([8 * s, 5 * s]);
    x.beginPath(); x.moveTo(-bw / 2 - 10, -bh * 0.35); x.lineTo(bw / 2 + 10, -bh * 0.2); x.stroke();
    x.beginPath(); x.moveTo(-bw / 2 - 10, -bh * 0.15); x.lineTo(bw / 2 + 10, -bh * 0.3); x.stroke(); x.setLineDash([]);
  }
  x.restore();
  x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.ellipse(cx, cy + 4, bw * 0.6, 10 * s, 0, 0, Math.PI * 2); x.fill();
}

function text(x, lines, y, font, size, color, spacing, glow) {
  x.save(); x.textAlign = 'center'; x.textBaseline = 'middle';
  if (glow) { x.shadowColor = 'rgba(230,232,234,.25)'; x.shadowBlur = 20; }
  lines.forEach((ln, i) => {
    x.font = `${font === FONT_T ? 600 : 500} ${size}px ${font}`; x.fillStyle = color; x.letterSpacing = spacing;
    x.fillText(ln, W / 2, y + i * size * 1.4);
  });
  x.restore();
}

function renderFrame(x, grain, time) {
  let acc = 0, idx = 0, local = 0;
  for (let i = 0; i < SCENES.length; i++) { if (time < acc + SCENES[i][0]) { idx = i; local = time - acc; break; } acc += SCENES[i][0]; idx = i; local = time - acc; }
  const [dur, type, lines] = SCENES[idx];
  const fade = Math.min(1, local / 0.5, (dur - local) / 0.5);
  drawFloor(x, time);
  if (type === 'card') {
    x.fillStyle = 'rgba(7,10,14,.72)'; x.fillRect(0, 0, W, H);
    text(x, lines, H / 2 - (lines.length - 1) * 20, FONT_T, 34, C.chalk, '0.25em', true);
  } else if (type === 'barrel') {
    drawBarrel(x, W / 2, H * 0.68, 1.3, time, { name: 'ИГОРЬ', knock: true });
    text(x, lines, 50, FONT_M, 12, C.steel, '0.3em');
  } else if (type === 'hand') {
    drawBarrel(x, W * 0.34, H * 0.7, 1.1, time, { name: 'ДАНИЯР' });
    drawBarrel(x, W * 0.62, H * 0.7, 1.3, time, { name: 'ИГОРЬ', hand: true });
    text(x, lines, H - 40, FONT_M, 13, C.steel, '0.2em');
  } else if (type === 'chains') {
    drawBarrel(x, W * 0.25, H * 0.7, 1, time, { name: 'ОЛЕГ' });
    drawBarrel(x, W * 0.5, H * 0.7, 1.25, time, { name: 'АРТУР', chains: true, knock: true });
    drawBarrel(x, W * 0.75, H * 0.7, 1, time, { name: 'МАРК' });
    text(x, lines, H - 40, FONT_M, 13, C.rust, '0.2em');
  } else if (type === 'title') {
    x.fillStyle = 'rgba(7,10,14,.6)'; x.fillRect(0, 0, W, H);
    drawBarrel(x, W / 2, H * 0.92, 1.1, time, { hand: true });
    text(x, [lines[0]], H / 2 - 30, FONT_T, 92, C.chalk, '0.3em', true);
    text(x, [lines[1]], H / 2 + 50, FONT_M, 14, C.steel, '0.35em');
  }
  if (Math.sin(time * 17) > 0.97) { x.fillStyle = 'rgba(230,232,234,.05)'; x.fillRect(0, 0, W, H); }
  x.fillStyle = `rgba(7,10,14,${1 - fade})`; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,.14)'; for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 1);
  x.save(); x.globalAlpha = 0.07; x.globalCompositeOperation = 'overlay';
  x.drawImage(grain, Math.random() * -40, Math.random() * -40, W + 80, H + 80); x.restore();
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.75)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
  x.font = `500 11px ${FONT_M}`; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.letterSpacing = '0.15em';
  x.fillStyle = C.steel; x.fillText('CAM_04 / СЕКТОР Б', 24, 32);
  const tc = (s) => { const m = Math.floor(s / 60), ss = Math.floor(s % 60), f = Math.floor((s % 1) * 24); return `01:${String(14 + m).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };
  x.fillText(tc(time), 24, H - 20);
  x.fillStyle = C.rust; x.beginPath(); x.arc(W - 90, 27, 4 + Math.sin(time * 6) * 1, 0, Math.PI * 2); x.fill();
  x.fillStyle = C.chalk; x.fillText('REC', W - 78, 31);
}

export function initTrailer(el) {
  if (!el || el.dataset.ready) return;
  injectStyle();
  const outer = document.createElement('div');
  outer.className = 'trailer-container';
  const wrap = document.createElement('div');
  wrap.className = 'trailer-wrap';

  const ytId = typeof CONFIG?.trailer?.youtubeId === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(CONFIG.trailer.youtubeId.trim())
    ? CONFIG.trailer.youtubeId.trim()
    : 'EZFDcXeLTzQ';
  const ytUrl = CONFIG?.trailer?.youtubeUrl || `https://youtu.be/${ytId}`;
  const kpUrl = CONFIG?.kinopoiskUrl || CONFIG?.ticketUrl || 'https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D';
  const posterWide = CONFIG?.trailer?.posterWide || 'photo_2026-11-08_00-00-14.jpg';

  const mountYoutubeFacade = (autoPlay = false) => {
    wrap.innerHTML = '';
    if (autoPlay) {
      const lobbyIfr = document.getElementById('lobbyYtIframe');
      if (lobbyIfr && lobbyIfr.contentWindow) {
        try {
          lobbyIfr.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
        } catch { /* ignore */ }
      }
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&playsinline=1`;
      iframe.title = 'БОЧКА — Официальный трейлер (YouTube)';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
      return;
    }
    const img = document.createElement('img');
    img.src = posterWide;
    img.alt = 'БОЧКА (BARREL) — Официальный постер и трейлер';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;filter:brightness(0.88) contrast(1.06)';
    const play = document.createElement('div');
    play.className = 'trailer-play';
    play.innerHTML = `
      <span>► СМОТРЕТЬ ОФИЦИАЛЬНЫЙ ТРЕЙЛЕР (YOUTUBE HD)</span>
      <small>ТИЛЬ ШВАЙГЕР · РЕЖИССЁР АЛЕКСЕЙ ЗВОНЦОВ · В КИНО С 17 ДЕКАБРЯ 2026</small>
    `;
    play.addEventListener('click', (e) => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('trailer-tap'));
      mountYoutubeFacade(true);
    });
    wrap.append(img, play);
  };

  /* По умолчанию рендерим лёгкую обложку с официальным постером и запуском YouTube-плеера по клику (0 МБ локального видеофайла!) */
  mountYoutubeFacade(false);

  const switchBar = document.createElement('div');
  switchBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center;justify-content:space-between';
  switchBar.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      <button type="button" class="btn btn--gold" data-tr-mode="yt">▶️ ЗАПУСТИТЬ YOUTUBE ТРЕЙЛЕР НА САЙТЕ</button>
      <a class="btn" href="${ytUrl}" target="_blank" rel="noopener">↗️ ОТКРЫТЬ В YOUTUBE</a>
    </div>
    <a class="btn btn--gold" href="${kpUrl}" target="_blank" rel="noopener" style="border-color:#FF6B00;color:#FFD166">🎬 КИНОПОИСК · О ФИЛЬМЕ И БИЛЕТЫ ↗</a>
  `;
  switchBar.querySelector('[data-tr-mode="yt"]')?.addEventListener('click', () => mountYoutubeFacade(true));

  outer.append(wrap, switchBar);
  el.replaceWith(outer);
  outer.dataset.ready = '1';
  return outer;
}

function mountCanvasTeaser(wrap) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const play = document.createElement('div'); play.className = 'trailer-play';
  play.innerHTML = `<span>► СМОТРЕТЬ ТРЕЙЛЕР</span><small>ПРОЦЕДУРНЫЙ ТИЗЕР · ${Math.round(TOTAL)} СЕК</small>`;
  const bar = document.createElement('div'); bar.className = 'trailer-bar'; bar.innerHTML = '<i></i>';
  wrap.append(canvas, play, bar);
  const x = canvas.getContext('2d'); const grain = makeGrain();
  let playing = false, start = 0, raf = 0, elapsed = 0;
  renderFrame(x, grain, 0);
  const loop = (now) => {
    if (!playing) return;
    elapsed = (now - start) / 1000;
    if (elapsed >= TOTAL) { playing = false; elapsed = 0; play.classList.remove('is-hidden'); renderFrame(x, grain, TOTAL - 0.01); bar.firstChild.style.width = '0'; return; }
    renderFrame(x, grain, elapsed); bar.firstChild.style.width = (elapsed / TOTAL * 100) + '%';
    raf = requestAnimationFrame(loop);
  };
  wrap.addEventListener('click', () => {
    if (playing) {
      document.dispatchEvent(new CustomEvent('trailer-tap'));
      return;
    }
    playing = true; start = performance.now() - elapsed * 1000; play.classList.add('is-hidden'); raf = requestAnimationFrame(loop);
  });
}

/* самоинициализация */
const mount = () => initTrailer(document.querySelector('.trailer'));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
