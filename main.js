import { loadAll, sheets, barrelRect, drawFrame, drawBarrelFallback } from './assets.js';
import { S, save, tick, addPoints, loseLife, friendArrived, dailyReward, screenTapBonus, spendSkillEnergy, toggleGodMode, barrelCardLevel, barrelPremiereChances } from './state.js';
import { initNet, queueAction, refreshLeaderboard } from './net.js';
import * as audio from './audio.js';
import { initLanguage, t, number, speak } from './i18n.js';
import { initUI, renderHUD, renderSections, renderUpgrade, renderFriends, renderHudSkillsBar, modal, closeModal, modalOpen, toast, showScreamer, crewVideo, shareFlow } from './ui.js';
import { Tapper, levelConfig, drawToolCursor } from './tapper.js';
import { drawBarrelWrappedLabel, drawShadow, buildAtlas, Actor } from './sprites.js';
import { Night } from './night.js';
import './trailer.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const VW = 960, VH = 540;
let view = { s: 1, ox: 0, oy: 0 };
let mode = 'tap', started = false, startedAt = Date.now();

function tgHaptic(kind = 'impact', val = 'medium') {
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback;
    if (!hf) return;
    if (kind === 'notification') hf.notificationOccurred?.(val);
    else if (kind === 'selection') hf.selectionChanged?.();
    else hf.impactOccurred?.(val);
  } catch { /* ignore */ }
}

function syncTelegramSafeArea() {
  const root = document.documentElement;
  const tg = window.Telegram?.WebApp;
  const ua = navigator.userAgent || '';
  const urlParams = new URLSearchParams(location.search);
  const tgPlatform = tg?.platform || urlParams.get('tgWebAppPlatform') || '';
  const isTma = Boolean(
    tg?.initData ||
    (tgPlatform && tgPlatform !== 'unknown') ||
    /Telegram/i.test(ua) ||
    urlParams.has('tgWebAppPlatform')
  );
  const isIOS = tgPlatform === 'ios' || /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = tgPlatform === 'android' || /Android/i.test(ua);

  root.classList.toggle('is-tma', isTma);
  root.classList.toggle('is-ios', isIOS);
  root.classList.toggle('is-android', isAndroid);

  const safeTop = (tg?.contentSafeAreaInset?.top || 0) + (tg?.safeAreaInset?.top || 0);
  const safeBottom = (tg?.contentSafeAreaInset?.bottom || 0) + (tg?.safeAreaInset?.bottom || 0);
  if (safeTop > 0) root.style.setProperty('--tg-safe-top', `${safeTop}px`);
  if (safeBottom > 0) root.style.setProperty('--tg-safe-bottom', `${safeBottom}px`);
}

window.tgHaptic = tgHaptic;

/* Игрок из Telegram: имя и ID для рейтинга и реферальной ссылки (?ref=user_id) */
function applyTelegramUser(tg) {
  const u = tg?.initDataUnsafe?.user;
  if (!u || !u.id) return;
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || `Игрок ${u.id}`;
  S.tgId = String(u.id);
  S.alias = name.slice(0, 24);
  S.refCode = String(u.id);
  save();
}

function initTelegramMiniApp() {
  syncTelegramSafeArea();
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready?.();
    tg.expand?.();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#0b0b0b');
    tg.setBackgroundColor?.('#08090B');
    tg.setBottomBarColor?.('#08090B');
    applyTelegramUser(tg);
    tg.onEvent?.('viewportChanged', () => { syncTelegramSafeArea(); resize(); });
    tg.onEvent?.('safeAreaChanged', () => { syncTelegramSafeArea(); resize(); });
    tg.onEvent?.('contentSafeAreaChanged', () => { syncTelegramSafeArea(); resize(); });
  } catch { /* ignore */ }
}
window.bochkaInitTelegram = initTelegramMiniApp;

function resize() {
  const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight;
  const dpr = Math.min(cw >= 800 ? 1.25 : 1.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const portrait = cw < ch;
  /* На портретных телефонах (iOS / Android / Telegram Mini App) и планшетах задаём увеличенную виртуальную ширину мира,
     чтобы на телефоне всё в игре отображалось компактнее (уменьшенным) и полностью помещалось в экран! */
  const targetPortraitW = cw < 600 ? 580 : 760;
  const s = portrait
    ? (cw / targetPortraitW)
    : Math.min(cw / VW, ch / VH);
  view = { s, ox: (cw - VW * s) / 2, oy: (ch - VH * s) / 2, dpr, cw, ch };
  /* visible part of the world in world units, so the game can lay itself out on any screen */
  const vis = { x: -view.ox / s, y: -view.oy / s, w: cw / s, h: ch / s };
  if (typeof tapper !== 'undefined' && tapper) { tapper.view = vis; tapper.layout(); }
  if (typeof night !== 'undefined' && night) { night.view = vis; }
}
addEventListener('resize', resize);

/* ---------- game objects ---------- */
const tapper = new Tapper({
  toast: (k) => toast(t(k)),
  onWin: (points) => {
    tgHaptic('notification', 'success');
    addPoints(points);
    const lvl = S.level; S.maxLevel = Math.max(S.maxLevel, lvl + 1); S.level = lvl + 1;
    S.cleared = Math.max(S.cleared || 0, lvl);
    S.maxToolLevel = Math.min(10, Math.max(S.maxToolLevel || 3, S.level));
    if ((S.toolLevel || 1) < Math.min(10, S.level)) S.toolLevel = Math.min(10, S.level);
    if (S.maxLevel >= 7 || lvl >= 7) S.nightUnlocked = true;
    save(); renderSections(); audio.coin(2);
    refreshLeaderboard();
    crewVideo(
      lvl,
      () => (lvl === 7 && S.nightUnlocked ? switchMode('night') : levelIntro()),
      { points, onNight: S.nightUnlocked ? () => switchMode('night') : null }
    );
  },
  onTrap: () => { tgHaptic('notification', 'error'); showScreamer(t('trap'), () => lifeLost()); },
  onLose: (reason) => { tgHaptic('notification', 'error'); showScreamer(t(reason), () => lifeLost()); },
});
window.__BOCHKA_TAPPER__ = tapper;
window.__BOCHKA_NIGHT_REF__ = () => night;
const night = new Night({
  onWin: (points) => {
    tgHaptic('notification', 'success');
    const mult = 2 + Math.min(3, Math.floor(S.nightRuns / 3));
    const reward = points * mult + Math.floor(5000 * night.diff);
    addPoints(reward); S.nightRuns++; S.bestNight = Math.max(S.bestNight, points); save(); renderSections();
    refreshLeaderboard();
    const finaleHtml = `
      <div style="margin:0 0 8px;padding:8px 10px;border:1px solid #FF595E;background:rgba(145,24,24,0.22);text-align:left">
        <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#FFD166;margin-bottom:4px">
          ⛓️ ТЕБЯ СХВАТИЛИ У ГЛАВНОЙ БОЧКИ И ЗАПЕРЛИ ВНУТРИ!
        </div>
        <div style="font-size:12px;color:var(--bone);line-height:1.4">
          Ты перекрыл задвижки, собрал все 3 ключа и пробрался в Тайное Помещение с Бочкой. Но на 10-м ударе охрана ворвалась в отсек, скрутила тебя и заварила внутри стальной бочки!..
        </div>
      </div>
      <div style="margin:0 0 8px;border:2px solid var(--gold);background:#000;padding:6px">
        <div style="font-family:var(--font-mono);font-size:10.5px;font-weight:700;color:var(--gold);letter-spacing:0.08em;margin-bottom:6px">
          🎬 ОФИЦИАЛЬНЫЙ ТРЕЙЛЕР «БОЧКА» — СМОТРИ ФИНАЛ В КИНО С 17 ДЕКАБРЯ 2026!
        </div>
        <div style="position:relative;width:100%;aspect-ratio:16/9;max-height:210px;background:#000">
          <iframe src="https://www.youtube.com/embed/EZFDcXeLTzQ?autoplay=1&rel=0&modestbranding=1" title="БОЧКА — Трейлер" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%;height:100%;border:0;display:block"></iframe>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:6px">
          <a class="btn btn--gold" href="https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D" target="_blank" rel="noopener" style="font-size:10px;padding:6px 12px;border-color:#FF6B00;color:#FFD166">🎬 КИНОПОИСК · БУДУ СМОТРЕТЬ ↗</a>
          <a class="btn" href="https://youtu.be/EZFDcXeLTzQ?si=-NIU0mFyayaYjHnf" target="_blank" rel="noopener" style="font-size:10px;padding:6px 12px">▶️ ОТКРЫТЬ В YOUTUBE ↗</a>
        </div>
      </div>
      <p style="margin:4px 0;font-size:12px;color:var(--gold);font-weight:700">
        🏆 Награда за финал: +${number(reward)} очков (×${mult}) · Купонов «БОЧКА» на закрытый показ: ${barrelPremiereChances().tickets} 🎟️
      </p>
    `;
    modal(
      '🎬 СМОТРИ ФИНАЛ В КИНО!',
      finaleHtml,
      [
        {
          label: '🎬 КИНОПОИСК ↗',
          fn: () => {
            window.open('https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D', '_blank');
          },
        },
        {
          label: '📤 ПОДЕЛИТЬСЯ ТРЕЙЛЕРОМ',
          fn: () => shareFlow(() => nightIntro()),
        },
        {
          label: '🔄 СЫГРАТЬ ЕЩЁ РАЗ',
          fn: () => nightIntro(),
        },
      ]
    );
  },
  onFail: (reason) => { tgHaptic('notification', 'error'); showScreamer(t(reason), () => lifeLost(() => { if (S.lives > 0) modal(t(reason), `<p>${t('lostText', { n: S.lives })}</p>`, [{ label: t('next'), fn: () => night.resume() }]); })); },
});
window.__BAREL__ = { S, tapper, night, save, renderHUD, hudInfo };
resize();

function lifeLost(then) {
  loseLife(); renderHUD(hudInfo()); renderSections();
  if (S.lives <= 0) { showChains(); return; }
  if (then) then(); else modal(t('trap'), `<p>${t('lostText', { n: S.lives })}</p>`, [{ label: t('next'), fn: () => (mode === 'tap' ? levelIntro() : nightIntro()) }]);
}
function showChains() {
  tapper.stop(); night.stop(); renderHUD(hudInfo());
  shareFlow(() => (mode === 'tap' ? levelIntro() : nightIntro()));
}

/* ---------- mode flow ---------- */
function levelIntro() {
  if (S.lives <= 0 && !S.godMode) { showChains(); return; }
  const c = levelConfig(S.level);
  const titleStr = c.isOcean
    ? t('oceanTitle')
    : `${t('lvlTitle', { n: S.level })} · ${t(c.titleKey || 'charLvl1')}`;
  const posterSplashHtml = S.level === 1
    ? `<div style="margin:0 0 8px;border:1px solid var(--gold);background:#050608;padding:4px">
         <img src="photo_2026-11-08_00-00-14.jpg" alt="БОЧКА — Заставка игры" style="width:100%;max-height:135px;object-fit:cover;display:block">
       </div>`
    : '';
  const mechHtml = c.mechanicTitle
    ? `<div style="margin:0 0 8px;padding:8px 10px;border:1px solid var(--gold);background:rgba(212,168,67,0.10);text-align:left">
         <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--gold);margin-bottom:4px">⚙️ ${c.mechanicTitle}</div>
         <div style="font-size:12px;color:var(--bone);line-height:1.35">${c.mechanicRule || ''}</div>
       </div>`
    : '';
  const bodyStr = c.isOcean
    ? `${posterSplashHtml}${mechHtml}<p>${t('oceanIntro')}</p>`
    : `${posterSplashHtml}${mechHtml}<p>${t('lvlText', { b: c.n, g: c.goal, s: c.sec })}</p>`;
  modal(titleStr, bodyStr, [{
    label: '▶ ВХОД В ЦЕХ',
    fn: () => {
      tapper.start(S.level);
      queueAction({ type: 'begin' });
    },
  }]);
}
function nightIntro() {
  if (S.lives <= 0 && !S.godMode) { showChains(); return; }
  const dirVideoHtml = `
    <div style="margin:0 0 10px;border:1px solid var(--gold);background:rgba(10,12,16,0.95);padding:8px">
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--gold);letter-spacing:0.12em;margin-bottom:6px">
        🎬 ОБРАЩЕНИЕ РЕЖИССЁРА ПЕРЕД СЕКРЕТНЫМ УРОВНЕМ
      </div>
      <video src="hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4" autoplay playsinline controls style="width:100%;max-height:175px;display:block;background:#000;object-fit:cover"></video>
    </div>
    <div style="margin:0 0 8px;padding:8px 10px;border:1px solid var(--gold);background:rgba(212,168,67,0.10);text-align:left;font-size:11.5px;line-height:1.4;color:var(--bone)">
      <div style="font-family:var(--font-mono);font-weight:700;color:var(--gold);margin-bottom:4px">🗝️ ЛОГИКА ПРОХОЖДЕНИЯ СЕКРЕТНОГО УРОВНЯ:</div>
      1️⃣ <b>КЛЮЧ №1:</b> Возьми у Алтаря в Церкви [E] (или тапни по нему), чтобы открыть ворота Сектора 3.<br>
      2️⃣ <b>В ВОДУ НЕ ВОЙТИ — ПОДНИМИСЬ И ОБОЙДИ ВСЁ:</b> Внизу стоит глубокая вода! Поднимись по левой лестнице наверх.<br>
      3️⃣ <b>ОТКЛЮЧИ СВЕТ ⚡ И СТУЧИ ПО БОЧКЕ 🛢️ НА ЗВУК:</b> Выключи рубильник света [E], чтобы погасить прожекторы, и <b>стукни по бочке [E / Тап]</b> — вся охрана сбежится на звук к бочке! Обойди их по другому ярусу на дальнюю правую сторону и закрой <b>⚙️ Задвижки слива №1 и №2</b>.<br>
      4️⃣ <b>СОБЕРИ КЛЮЧИ №2, №3 И ОТКРОЙ ПОМЕЩЕНИЕ С БОЧКОЙ:</b> Когда вода уйдёт, забери ключи со дна осушенных коллекторов, открой Помещение с Бочкой (Корпус Б, 2-й ярус справа) и стучи по Бочке!
    </div>
  `;
  modal(t('modeNight') + ' · ' + t('shift') + ' ' + (S.nightRuns + 1), dirVideoHtml, [{
    label: '▶ ВХОД В ЦЕХ',
    fn: () => {
      night.start();
      queueAction({ type: 'nightStart' });
    },
  }]);
}
function switchMode(m) {
  if (m === 'night') {
    S.nightUnlocked = true;
    save();
  }
  if (m === 'ocean') {
    S.level = 7;
    S.maxLevel = Math.max(S.maxLevel || 1, 7);
    save();
  } else if (m === 'tap' && S.level === 7) {
    S.level = 1;
    save();
  }
  mode = m === 'ocean' ? 'tap' : m;
  tapper.stop(); night.stop();
  $('btnModeTap').classList.toggle('is-on', mode === 'tap' && S.level !== 7);
  if ($('btnModeOcean')) $('btnModeOcean').classList.toggle('is-on', mode === 'tap' && S.level === 7);
  $('btnModeNight').classList.toggle('is-on', mode === 'night');
  $('hero').classList.toggle('is-night', mode === 'night');
  $('hero').classList.remove('is-menu');
  resize();
  if (!started) {
    audio.startAudio();
    started = true;
    startedAt = Date.now();
    $('hero').classList.add('is-started');
    $('enterBox').classList.add('is-hidden');
    lobbyYtCmd('pauseVideo');
    lobbyYtCmd('mute');
  }
  if (mode === 'tap') levelIntro(); else nightIntro();
}

function hudInfo() {
  const anyModal = modalOpen() || !$('screamer').classList.contains('is-hidden');
  if (mode === 'tap') {
    const timer = tapper.active ? `${String(Math.floor(tapper.time / 60)).padStart(2, '0')}:${String(Math.max(0, Math.floor(tapper.time % 60))).padStart(2, '0')}` : (anyModal && started ? t('paused') : '--:--');
    return { mode, points: tapper.levelPoints, air: tapper.air, progress: tapper.goal ? tapper.progress / tapper.goal : 0, timer };
  }
  const nightProg = Math.min(
    1,
    ((night.keysCollectedCount?.() || 0) * 2 +
      (night.quests?.valve1Closed ? 1 : 0) +
      (night.quests?.valve2Closed ? 1 : 0) +
      ((night.finale?.hits || 0) / 5)) / 10
  );
  return { mode, points: night.points, air: night.boy?.air ?? 100, progress: nightProg, timer: night.clockText() };
}

/* Кинематографическая виньетка и сканлайны уже отрисованы аппаратным CSS-слоем .hero::after (0 нагрузки на Canvas 2D!) */
function drawCinemaPost() {}

/* ---------- ПЕРЕД СТАРТОМ ИГРЫ: НА ЗАДНЕМ ФОНЕ ИГРАЕТ YOUTUBE-ТРЕЙЛЕР И ИДУТ ТИТРЫ С ПРАВИЛАМИ ИГРЫ, А НА ПЕРЕДНЕМ ФОНЕ — РЕАЛИСТИЧНЫЕ БОЧКИ С ОПОЯСЫВАЮЩИМИ ИМЕНАМИ АКТЁРОВ ---------- */
const lobbyPosterImg = new Image();
lobbyPosterImg.src = 'photo_2026-11-08_00-00-14.jpg';

let lobbyYtMuted = false;
let lobbyYtPlayer = null;
let lobbyYtDuckTimer = 0;
let lastYtRectKey = '';

function lobbyYtCmd(func, args = []) {
  if (lobbyYtPlayer && typeof lobbyYtPlayer[func] === 'function') {
    try {
      lobbyYtPlayer[func](...args);
      return;
    } catch { /* fallback to postMessage */ }
  }
  const ifr = $('lobbyYtIframe');
  if (!ifr || !ifr.contentWindow) return;
  try {
    ifr.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'lobbyYtIframe', channel: 'widget' }), '*');
    ifr.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  } catch { /* ignore */ }
}

function updateSplashMuteBtnLabel() {
  const btn = $('btnSplashMute');
  if (btn) {
    btn.textContent = lobbyYtMuted ? '🔇 ЗВУК ТРЕЙЛЕРА: ВЫКЛ' : '🔊 ЗВУК ТРЕЙЛЕРА: ВКЛ';
  }
}

function ensureLobbyTrailerSound() {
  if (started || lobbyYtMuted || preGameLobby.screenMode !== 'trailer') return;
  lobbyYtCmd('unMute');
  lobbyYtCmd('setVolume', [audio.isVoiceOrPrankBusy() ? 10 : 85]);
  lobbyYtCmd('playVideo');
  updateSplashMuteBtnLabel();
}

function duckLobbyTrailerForVoice(ms = 3200) {
  if (started || lobbyYtMuted) return;
  clearTimeout(lobbyYtDuckTimer);
  lobbyYtCmd('setVolume', [10]);
  const restore = () => {
    if (started || lobbyYtMuted) return;
    if (audio.isVoiceOrPrankBusy()) {
      lobbyYtDuckTimer = setTimeout(restore, 400);
      return;
    }
    lobbyYtCmd('unMute');
    lobbyYtCmd('setVolume', [85]);
  };
  lobbyYtDuckTimer = setTimeout(restore, ms);
}

/* Подключаем официальный YouTube IFrame API и рукопожатие listening для гарантированного воспроизведения трейлера со звуком */
(function initLobbyYoutubePlayer() {
  const ifr = $('lobbyYtIframe');
  if (ifr) {
    ifr.addEventListener('load', () => {
      try {
        ifr.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'lobbyYtIframe', channel: 'widget' }), '*');
      } catch { /* ignore */ }
      if (!started && !lobbyYtMuted) {
        setTimeout(() => ensureLobbyTrailerSound(), 250);
      }
    });
  }
  const prevReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof prevReady === 'function') prevReady();
    if (!window.YT || !window.YT.Player || !$('lobbyYtIframe')) return;
    lobbyYtPlayer = new window.YT.Player('lobbyYtIframe', {
      events: {
        onReady: (e) => {
          try {
            if (!started && !lobbyYtMuted && preGameLobby.screenMode === 'trailer') {
              e.target.unMute();
              e.target.setVolume(85);
              e.target.playVideo();
              /* Если браузер заблокировал старт со звуком до первого клика — запускаем видео и включим звук при первом же касании */
              setTimeout(() => {
                try {
                  const st = e.target.getPlayerState?.();
                  if (st !== 1 && st !== 3 && !started) {
                    e.target.mute();
                    e.target.playVideo();
                  }
                } catch { /* ignore */ }
              }, 450);
            }
          } catch { /* ignore */ }
        },
      },
    });
  };
  if (!document.getElementById('ytIframeApiScript')) {
    const tag = document.createElement('script');
    tag.id = 'ytIframeApiScript';
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }
  const onFirstLobbyGesture = () => {
    if (!started && !lobbyYtMuted && preGameLobby.screenMode === 'trailer') {
      ensureLobbyTrailerSound();
    }
  };
  ['pointerdown', 'click', 'touchstart', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, onFirstLobbyGesture, { passive: true });
  });
})();

const LOBBY_CREDITS_LINES = [
  { kind: 'head', txt: '🎬 БОЧКА (BARREL) · В КИНО С 17 ДЕКАБРЯ 2026' },
  { kind: 'sub', txt: 'В ГЛАВНЫХ РОЛЯХ: ТИЛЬ ШВАЙГЕР · ФИЛИПП РЕЙНХАРДТ · НАТАН ПОЛ-КОЛЛИС · ОЛА КЕЙРУ · ИРИНА КОБЗЕВА' },
  { kind: 'sub', txt: 'РЕЖИССЁР-ПОСТАНОВЩИК: АЛЕКСЕЙ ЗВОНЦОВ · КИНОКОМПАНИЯ «АРТЕЛЬ» · УЧАСТНИК ФЕСТИВАЛЯ CINEQUEST (США)' },
  { kind: 'gap' },
  { kind: 'head', txt: '📜 ТИТРЫ · ПРАВИЛА ИГРЫ «БОЧКА: ДОСТУЧАТЬСЯ ДО НЕБЕС»' },
  { kind: 'rule', num: '01 // СТУК ИЗНУТРИ', txt: 'Прислушайся к гулу цеха и стучи по бочкам с именами. Замри, когда охранник, овчарка Рекс или Пастор смотрят на тебя!' },
  { kind: 'rule', num: '02 // ОШИБКА УРОНИТ БОЧКУ', txt: 'Если бочка даёт минус или её ресурс исчерпан — она падает набок до конца уровня. Меньше бочек — меньше воздуха O₂ и плюшек!' },
  { kind: 'rule', num: '03 // ЦЕПИ И ИНСТРУМЕНТЫ', txt: 'Руби цепи инструментами (от отвёртки до отбойного молотка), чтобы забрать Энергию ⚡ и Куш ×4. Когда цепь сбита — больше не стучи!' },
  { kind: 'rule', num: '04 // КАРТОЧКИ НАВЫКОВ В РУКЕ', txt: 'Выбирай навык за ⚡ Энергию (❄️ Заморозка, 🛢️ Одеть бочку, 🔦 Сломать фонарь, 🔥 Огонь, 🧲 Магнит) и наводи прямо на врага или бочку!' },
  { kind: 'rule', num: '05 // СПАСИ ОТЦА И МОРЕ', txt: 'На Алтаре (Ур. 06) сбивай цепи Отца очками или ценой своих ❤️ жизней! На крыше у Моря (Ур. 07) стучи только когда Тиль смотрит на волны.' },
  { kind: 'rule', num: '06 // СЕКРЕТНЫЙ УРОВЕНЬ 08', txt: 'В «Ночной смене» выключи свет, постучи по бочке для приманки охраны, перекрой задвижки воды, собери 3 ключа и открой Тайную Бочку!' },
  { kind: 'rule', num: '07 // ЗАКРЫТЫЙ ПОКАЗ С АКТЁРАМИ', txt: 'Качай карточку «БОЧКА» друзьями с 7 до 200 уровня: лучшие по скорости и прокачке получат приглашения на закрытый показ фильма!' },
  { kind: 'gap' },
];

const preGameLobby = {
  t: 0,
  screenMode: 'trailer', /* 'trailer' -> когда закончится трейлер -> 'credits' (титры с правилами) */
  creditsT: 0,
  screenRect: null,
  knockCycleT: 1.8,
  activeKnockIdx: 2,
  toolSwing: 0,
  light: null,
  sparks: [],
  floats: [],
  barrels: [
    {
      rx: 0.35, ry: 0.63, scale: 0.92, spriteKey: 'igor',
      charKey: 'priest', frameIdx: 4, voiceRole: 'priest',
      name: 'ТИЛЬ ШВАЙГЕР', firstName: 'ТИЛЬ', lastName: 'ШВАЙГЕР', shortRole: 'ПАСТОР',
      role: 'ПАСТОР · НАСТАВНИК',
      quote: '«Бочка: стучите, и отворят вам…»',
      quotes: [
        '«Бочка: стучите, и отворят вам…»',
        '«Тук-тук! Это я, Тиль Швайгер! Принёс бочку для вашего мальчика!»',
        '«На небесах только и говорят, что о море… и о твоём последнем пранке!»',
        '«Прислушайся к тишине цеха: одна из бочек стучит изнутри. Жми Старт игры!»',
      ],
      voiceKeys: ['priest_lobby_1', 'priest_lobby_2', 'priest_lobby_3', 'priest_lobby_4'],
      shake: 0, glow: 0, handT: 0, popT: 0, popAnim: 0, rubCd: 0, hits: 0,
    },
    {
      rx: 0.56, ry: 0.63, scale: 0.92, spriteKey: 'oleg',
      charKey: 'capguy', frameIdx: 3, voiceRole: 'capguy',
      name: 'ОЛА КЕЙРУ', firstName: 'ОЛА', lastName: 'КЕЙРУ', shortRole: 'СООБЩНИК',
      role: 'СООБЩНИК',
      quote: '«В Секторе Б никто не услышит твой крик…»',
      quotes: [
        '«В Секторе Б никто не услышит твой крик…»',
        '«Все лучшие ништяки закованы в цепь! Голой рукой не пробить — бери инструмент!»',
        '«Когда луч фонаря светит на бочку — замри и не стучи, иначе схвачу!»',
        '«Как собьёшь цепь с бочки — забирай куш и больше по ней не стучи!»',
      ],
      voiceKeys: ['capguy_lobby_1', 'capguy_lobby_2', 'capguy_lobby_3', 'capguy_lobby_4'],
      shake: 0, glow: 0, handT: 0, popT: 0, popAnim: 0, rubCd: 0, hits: 0,
    },
    {
      rx: 0.45, ry: 0.72, scale: 1.00, spriteKey: 'mark',
      charKey: 'boy', frameIdx: 1, voiceRole: 'boy',
      name: 'НАТАН ПОЛ-КОЛЛИС', firstName: 'НАТАН', lastName: 'ПОЛ-КОЛЛИС', shortRole: 'В БОЧКЕ',
      role: 'ПАЦАН В БОЧКЕ',
      quote: '«ЭТО НЕ ПРАНК! ВЫПУСТИТЕ МЕНЯ!»',
      quotes: [
        '«ЭТО НЕ ПРАНК! ВЫПУСТИТЕ МЕНЯ ИЗ БОЧКИ!»',
        '«Эй, кто-нибудь! Меня заперли в стальной бочке посреди тёмного завода!»',
        '«Воздух внутри кончается! Стучи по правильной бочке, чтобы спасти меня!»',
        '«Единственный ключ — у моего отца, прикованного цепями в пяти метрах!»',
      ],
      voiceKeys: ['boy_lobby_1', 'boy_lobby_2', 'boy_lobby_3', 'boy_lobby_4'],
      shake: 0, glow: 0, handT: 0, popT: 0, popAnim: 0, rubCd: 0, hits: 0, hasHand: true,
    },
    {
      rx: 0.64, ry: 0.72, scale: 1.00, spriteKey: 'anna',
      charKey: 'girl', frameIdx: 3, voiceRole: 'girl',
      name: 'ИРИНА КОБЗЕВА', firstName: 'ИРИНА', lastName: 'КОБЗЕВА', shortRole: 'ДЕВУШКА',
      role: 'ДЕВУШКА',
      quote: '«Камера включена… запись пранка идёт!»',
      quotes: [
        '«Камера включена… запись пранка идёт!»',
        '«Прислушайся: из этой бочки доносится глухой стук! Скорее помоги ему!»',
        '«Используй карточки навыков за энергию — заморозь охрану или выключи им фонари!»',
        '«Лови бочки со значком кислорода, чтобы узник внутри не задохнулся!»',
      ],
      voiceKeys: ['girl_lobby_1', 'girl_lobby_2', 'girl_lobby_3', 'girl_lobby_4'],
      shake: 0, glow: 0, handT: 0, popT: 0, popAnim: 0, rubCd: 0, hits: 0,
    },
    {
      rx: 0.77, ry: 0.68, scale: 0.96, spriteKey: 'artur',
      charKey: 'director', frameIdx: 3, voiceRole: 'director', isDirector: true,
      name: 'АЛЕКСЕЙ ЗВОНЦОВ', firstName: 'АЛЕКСЕЙ', lastName: 'ЗВОНЦОВ', shortRole: 'РЕЖИССЁР',
      role: 'РЕЖИССЁР ФИЛЬМА',
      quote: '«Камера, мотор! В кино с 17 декабря 2026!»',
      quotes: [
        '«Камера, мотор! Триллер Бочка — в кино с 17 декабря 2026!»',
        '«Я режиссёр Алексей Звонцов! Пройди все 8 уровней цеха и попади в топ рейтинга!»',
        '«Качай карточку Бочка друзьями до 200 уровня и выиграй приглашение на закрытый показ!»',
        '«Снято! Жми большую золотую кнопку Старт игры — испытание начинается!»',
      ],
      voiceKeys: ['director_lobby_1', 'director_lobby_2', 'director_lobby_3', 'director_lobby_4'],
      shake: 0, glow: 0, handT: 0, popT: 0, popAnim: 0, rubCd: 0, hits: 0,
    },
    {
      rx: 0.24, ry: 0.72, scale: 1.02, spriteKey: 'daniyar',
      charKey: 'father', frameIdx: 6, voiceRole: 'father',
      name: 'ФИЛИПП РЕЙНХАРДТ', firstName: 'ФИЛИПП', lastName: 'РЕЙНХАРДТ', shortRole: 'ОТЕЦ',
      role: 'ОТЕЦ МАЛЬЧИКА',
      quote: '«Сынок! Стучи по бочке — я найду тебя!»',
      quotes: [
        '«Сынок! Стучи по бочке — я найду тебя по звуку!»',
        '«Держись, родной! Я разорву эти цепи и вытащу тебя отсюда!»',
        '«Видишь руку из горловины бочки — стучи быстрее, это двойные очки!»',
        '«Осторожно, опрокинутая бочка — это ловушка! Бей только по стоящим бочкам!»',
      ],
      voiceKeys: ['father_lobby_1', 'father_lobby_2', 'father_lobby_3', 'father_lobby_4'],
      shake: 0, glow: 0, handT: 0, popT: 0, popAnim: 0, rubCd: 0, hits: 0,
    },
  ],
};

function getLobbyBarrelPos(b) {
  const v = tapper.view || { x: 0, y: 0, w: VW, h: VH };
  const narrow = v.w < 640;
  /* Размещаем 6 бочек полукругом перед нижней кромкой киноэкрана так, чтобы они полностью
     помещались в кадр над нижней панелью «СТАРТ ИГРЫ» и ничего не уходило за края экрана! */
  const rx = narrow ? (0.5 + (b.rx - 0.5) * 1.12) : b.rx;
  const ry = narrow ? (b.ry + 0.015) : b.ry;
  const x = v.x + v.w * rx;
  const y = v.y + v.h * ry;
  const s = b.scale * (narrow ? 0.80 : 0.84);
  const bh = 146 * s;
  const bw = bh * 0.56;
  return { x, y, s, bw, bh };
}

function triggerLobbyBarrelKnock(idx, isRub = false) {
  const b = preGameLobby.barrels[idx];
  if (!b) return;
  const pos = getLobbyBarrelPos(b);
  preGameLobby.toolSwing = 1.0;
  b.shake = isRub ? Math.max(b.shake, 0.55) : 1.0;
  b.glow = isRub ? Math.max(b.glow, 0.78) : 1.0;
  b.hits = (b.hits || 0) + 1;
  /* После удара по бочке из неё появляется наш спрайт-персонаж и остаётся на виду, подпрыгивая от новых ударов! */
  b.popT = 60.0;
  b.popBounce = isRub ? Math.max(b.popBounce || 0, 0.55) : 1.0;
  if (!b.actor) {
    b.actor = new Actor(b.charKey || 'father');
  }
  b.actor.look(b.rx > 0.52 ? -1 : 1);
  b.actor.time = 0;
  b.actor.play('action');
  if (b.hasHand || b.hits % 2 === 0) {
    b.handT = 1.85;
  }
  lobbyYtCmd('playVideo');
  audio.startAudio();
  if (isRub) {
    audio.knockTone(idx % 3, 0.55);
  } else {
    const qIdx = Array.isArray(b.quotes) && b.quotes.length
      ? (b.hits - 1) % b.quotes.length
      : 0;
    const activeQuote = (Array.isArray(b.quotes) && b.quotes[qIdx]) ? b.quotes[qIdx] : b.quote;
    b.quote = activeQuote;
    const activeVoiceKey = (Array.isArray(b.voiceKeys) && b.voiceKeys[qIdx]) ? b.voiceKeys[qIdx] : null;
    audio.barrelMelodyBeat(idx % 3, b.hits);
    audio.hit(1.0);
    if (!audio.isMuted() && activeQuote) {
      duckLobbyTrailerForVoice(3400);
      if (activeVoiceKey) {
        audio.playCharacterVoice(activeVoiceKey);
      } else {
        speak(activeQuote.replace(/[«»]/g, ''), b.voiceRole || 'father');
      }
    }
  }
  const spCount = isRub ? 5 : 14;
  for (let i = 0; i < spCount; i++) {
    preGameLobby.sparks.push({
      x: pos.x + (Math.random() - 0.5) * pos.bw * 0.7,
      y: pos.y - pos.bh * (0.45 + Math.random() * 0.45),
      vx: (Math.random() - 0.5) * 240,
      vy: -60 - Math.random() * 190,
      life: 0.35 + Math.random() * 0.3,
    });
  }
  if (!isRub) {
    const pts = 25;
    addPoints(pts);
    preGameLobby.floats.push({
      x: pos.x,
      y: Math.max((tapper.view ? tapper.view.y + 82 : 82), pos.y - pos.bh * 1.32),
      txt: b.quote,
      sub: `+${pts} ОЧКОВ`,
      life: 1.85,
    });
    tgHaptic('impact', 'heavy');
  }
}

/* Отрисовка нашего игрового спрайт-персонажа (Actor), вылезающего из бочки после ударов по ней */
function drawBarrelPopCharacter(c, b, idx, sx, sy, bw, bh, posS, dt = 1 / 60) {
  const pop = b.popAnim || 0;
  if (pop <= 0.02) return;
  const charKey = b.charKey || 'father';
  if (!sheets[charKey] && !sheets.father) return;

  if (!b.actor || b.actor.key !== charKey) {
    b.actor = new Actor(charKey);
  }
  const faceDir = b.rx > 0.52 ? -1 : 1;
  b.actor.look(faceDir);
  b.actor.update(dt);

  /* Реальная верхняя кромка стальной бочки в спрайте sheets.barrels находится на уровне sy - bh * 0.77 */
  const rimY = sy - bh * 0.77;
  const rimRx = bw * 0.45;
  const rimRy = bh * 0.048;

  /* Эластичная кривая выпрыгивания спрайт-персонажа из бочки + подпрыгивание при повторных ударах */
  const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const bounceLift = Math.sin((b.popBounce || 0) * Math.PI) * 0.14;
  const lift = Math.min(1.18, easeOutBack(Math.min(1, pop)) + bounceLift);

  c.save();

  /* Световое сияние за спиной вылезающего из бочки спрайт-персонажа */
  const auraR = bw * 0.85 * Math.min(1, pop * 1.2);
  const auraG = c.createRadialGradient(sx, rimY - bh * 0.34 * lift, 4, sx, rimY - bh * 0.30 * lift, auraR);
  auraG.addColorStop(0, 'rgba(255, 214, 118, 0.38)');
  auraG.addColorStop(0.55, 'rgba(212, 168, 67, 0.12)');
  auraG.addColorStop(1, 'rgba(212, 168, 67, 0)');
  c.fillStyle = auraG;
  c.beginPath();
  c.arc(sx, rimY - bh * 0.30 * lift, auraR, 0, Math.PI * 2);
  c.fill();

  /* Область отсечения по верхней крышке бочки, чтобы спрайт-персонаж вылезал прямо из бочки без лишних колец и шариков */
  c.save();
  c.beginPath();
  c.moveTo(sx - bw * 1.15, rimY - bh * 1.85);
  c.lineTo(sx + bw * 1.15, rimY - bh * 1.85);
  c.lineTo(sx + rimRx * 1.12, rimY);
  c.quadraticCurveTo(sx, rimY + rimRy * 1.15, sx - rimRx * 1.12, rimY);
  c.closePath();
  c.clip();

  /* Отрисовка нашего игрового спрайт-персонажа по пояс из бочки */
  const charFullH = bh * 1.26;
  const footY = rimY + rimRy * 0.45 + charFullH * (1 - 0.66 * lift);
  b.actor.beam(c, sx, footY, charFullH, 90 * posS, '255, 226, 155', 0.12 * Math.min(1, pop), 28 * posS);
  b.actor.draw(c, sx, footY, charFullH);
  c.restore();

  c.restore();
}

function hitPreGameLobby(x, y, isRub = false) {
  /* 1. Проверяем от ближних бочек переднего плана к дальним */
  const order = [5, 3, 2, 4, 0, 1];
  for (const idx of order) {
    const b = preGameLobby.barrels[idx];
    const pos = getLobbyBarrelPos(b);
    if (
      Math.abs(x - pos.x) <= pos.bw * 0.65 &&
      y >= pos.y - pos.bh - 20 &&
      y <= pos.y + 18
    ) {
      if (isRub) {
        if (b.rubCd > 0) return false;
        b.rubCd = 0.28;
      }
      triggerLobbyBarrelKnock(idx, isRub);
      return true;
    }
  }
  /* 2. Клик по верхней плашке киноэкрана справа переключает: ТРЕЙЛЕР <-> ТИТРЫ С ПРАВИЛАМИ, а клик по самому экрану включает звук трейлера! */
  if (!isRub && preGameLobby.screenRect) {
    const sr = preGameLobby.screenRect;
    if (x >= sr.x && x <= sr.x + sr.w && y >= sr.y && y <= sr.y + 26 && x >= sr.x + sr.w * 0.52) {
      if (preGameLobby.screenMode === 'trailer') {
        preGameLobby.screenMode = 'credits';
        preGameLobby.creditsT = 0;
        lobbyYtCmd('pauseVideo');
      } else {
        preGameLobby.screenMode = 'trailer';
        preGameLobby.trailerT = 0;
        lobbyYtCmd('seekTo', [0, true]);
        ensureLobbyTrailerSound();
      }
      audio.coin(1.4);
      return true;
    }
    if (x >= sr.x && x <= sr.x + sr.w && y >= sr.y && y <= sr.y + sr.h) {
      if (preGameLobby.screenMode !== 'trailer') {
        preGameLobby.screenMode = 'trailer';
        preGameLobby.trailerT = 0;
      }
      lobbyYtMuted = false;
      ensureLobbyTrailerSound();
      toast('🔊 Звук официального трейлера включён!');
      return true;
    }
  }
  return false;
}

function drawLobbyBackgroundTrailerAndCredits(c, v, dt = 0.016) {
  const narrow = v.w < 640;
  /* Большой киноэкран прямо за бочками: аккуратно помещается между верхней шапкой и бочками! */
  const scrW = Math.min(v.w * (narrow ? 0.92 : 0.56), 580);
  const scrH = narrow ? Math.round(v.h * 0.36) : Math.round(v.h * 0.40);
  const scrX = Math.round(v.x + (v.w - scrW) * 0.5);
  const scrY = Math.round(v.y + v.h * (narrow ? 0.19 : 0.095));
  preGameLobby.screenRect = { x: scrX, y: scrY, w: scrW, h: scrH };

  /* Позиционируем встроенный YouTube-плеер ровно в окно киноэкрана за бочками (16:9 cover без чёрных полос по бокам!) */
  const ytWrap = $('lobbyYtWrap');
  if (ytWrap) {
    const cssL = Math.round(view.ox + scrX * view.s);
    const cssT = Math.round(view.oy + (scrY + 20) * view.s);
    const cssW = Math.round(scrW * view.s);
    const cssH = Math.round((scrH - 20) * view.s);
    const rk = `${cssL},${cssT},${cssW},${cssH},${preGameLobby.screenMode}`;
    if (rk !== lastYtRectKey) {
      lastYtRectKey = rk;
      ytWrap.style.left = `${cssL}px`;
      ytWrap.style.top = `${cssT}px`;
      ytWrap.style.width = `${cssW}px`;
      ytWrap.style.height = `${cssH}px`;
      ytWrap.classList.toggle('is-credits', preGameLobby.screenMode !== 'trailer');
      const ytIfr = $('lobbyYtIframe');
      if (ytIfr) {
        const ifrW = Math.ceil(Math.max(cssW, cssH * (16 / 9)) * 1.08);
        const ifrH = Math.ceil(Math.max(cssH, cssW * (9 / 16)) * 1.08);
        ytIfr.style.width = `${ifrW}px`;
        ytIfr.style.height = `${ifrH}px`;
      }
    }
  }

  /* Когда заканчивается 90-секундный трейлер — автоматически включаются бегущие титры с правилами игры! */
  if (preGameLobby.screenMode === 'trailer') {
    preGameLobby.trailerT = (preGameLobby.trailerT || 0) + dt;
    if (preGameLobby.trailerT >= 91) {
      preGameLobby.screenMode = 'credits';
      preGameLobby.creditsT = 0;
      preGameLobby.trailerT = 0;
      lobbyYtCmd('pauseVideo');
    }
  }

  c.save();

  /* 1. Лучи кинопроектора из-под потолка цеха на экран */
  const projX = scrX + scrW * 0.5;
  const projY = v.y + 4;
  const beamG = c.createLinearGradient(projX, projY, projX, scrY + scrH);
  beamG.addColorStop(0, 'rgba(255, 224, 155, 0.24)');
  beamG.addColorStop(0.45, 'rgba(212, 168, 67, 0.09)');
  beamG.addColorStop(1, 'rgba(212, 168, 67, 0)');
  c.fillStyle = beamG;
  c.beginPath();
  c.moveTo(projX - 20, projY);
  c.lineTo(projX + 20, projY);
  c.lineTo(scrX + scrW + 22, scrY + scrH);
  c.lineTo(scrX - 22, scrY + scrH);
  c.closePath();
  c.fill();

  /* Свет от большого экрана на полу прямо под бочками (чтобы бочки визуально стояли прямо перед экраном) */
  const reflG = c.createRadialGradient(
    scrX + scrW * 0.5,
    scrY + scrH,
    18,
    scrX + scrW * 0.5,
    scrY + scrH + v.h * 0.16,
    scrW * 0.62
  );
  reflG.addColorStop(0, 'rgba(255, 214, 130, 0.22)');
  reflG.addColorStop(0.55, 'rgba(212, 168, 67, 0.08)');
  reflG.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = reflG;
  c.fillRect(v.x, scrY + scrH - 10, v.w, v.h - (scrY + scrH) + 10);

  /* Стальная рама заводского проекционного экрана */
  c.fillStyle = '#05070A';
  c.fillRect(scrX - 5, scrY - 5, scrW + 10, scrH + 10);
  c.strokeStyle = 'rgba(212, 168, 67, 0.72)';
  c.lineWidth = 1.8;
  c.strokeRect(scrX - 5, scrY - 5, scrW + 10, scrH + 10);

  c.save();
  c.beginPath();
  c.rect(scrX, scrY, scrW, scrH);
  c.clip();

  if (preGameLobby.screenMode === 'trailer') {
    /* ФАЗА 1: Прозрачное окно в холсте — сквозь него играет настоящий YouTube-трейлер (#lobbyYtIframe на z-index: 1),
       а поверх этого окна на холсте (z-index: 2) рисуются 6 бочек и вылезающие из них спрайт-персонажи! */
    c.clearRect(scrX, scrY + 20, scrW, scrH - 20);
  } else {
    /* ФАЗА 2: КОГДА ЗАКОНЧИЛСЯ ТРЕЙЛЕР — ПО ЭКРАНУ ЗА БОЧКАМИ ИДУТ КИНОТИТРЫ С ПРАВИЛАМИ ИГРЫ! */
    preGameLobby.creditsT += dt;
    if (lobbyPosterImg.complete && lobbyPosterImg.naturalWidth > 0) {
      const iw = lobbyPosterImg.naturalWidth;
      const ih = lobbyPosterImg.naturalHeight;
      const scale = Math.max(scrW / iw, scrH / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      c.save();
      c.globalAlpha = 0.18;
      c.drawImage(lobbyPosterImg, scrX + (scrW - dw) * 0.5, scrY + (scrH - dh) * 0.5, dw, dh);
      c.restore();
    }
    c.fillStyle = 'rgba(4, 6, 10, 0.88)';
    c.fillRect(scrX, scrY, scrW, scrH);

    const lineStep = narrow ? 26 : 30;
    const totalBlockH = LOBBY_CREDITS_LINES.length * lineStep + scrH * 0.85;
    const scrollSpeed = narrow ? 20 : 24;
    const scrollOffset = preGameLobby.creditsT * scrollSpeed;
    const startY = scrY + scrH - scrollOffset;

    c.textAlign = 'center';
    LOBBY_CREDITS_LINES.forEach((item, i) => {
      const ly = startY + i * lineStep;
      if (ly < scrY - 24 || ly > scrY + scrH + 24) return;
      const distTop = ly - (scrY + 22);
      const distBot = (scrY + scrH) - ly;
      const edgeAlpha = Math.max(0, Math.min(1, Math.min(distTop / 24, distBot / 24)));
      c.save();
      c.globalAlpha = edgeAlpha;

      if (item.kind === 'head') {
        c.font = `900 ${narrow ? 9.5 : 11.5}px "JetBrains Mono", monospace`;
        c.fillStyle = '#FFD166';
        c.fillText(item.txt, scrX + scrW * 0.5, ly, scrW - 18);
      } else if (item.kind === 'sub') {
        c.font = `700 ${narrow ? 7.5 : 9}px "JetBrains Mono", monospace`;
        c.fillStyle = '#ECE4D2';
        c.fillText(item.txt, scrX + scrW * 0.5, ly, scrW - 18);
      } else if (item.kind === 'rule') {
        c.font = `800 ${narrow ? 7.5 : 9}px "JetBrains Mono", monospace`;
        c.fillStyle = '#64DFDF';
        c.fillText(`${item.num}`, scrX + scrW * 0.5, ly - (narrow ? 5.5 : 6.5), scrW - 20);
        c.font = `600 ${narrow ? 8 : 9.5}px "Inter", sans-serif`;
        c.fillStyle = '#FFF5DC';
        c.fillText(item.txt, scrX + scrW * 0.5, ly + (narrow ? 4.5 : 5.5), scrW - 20);
      }
      c.restore();
    });

    /* Когда титры с правилами дошли до конца — снова запускаем YouTube-трейлер */
    if (scrollOffset >= totalBlockH) {
      preGameLobby.screenMode = 'trailer';
      preGameLobby.creditsT = 0;
      preGameLobby.trailerT = 0;
      lobbyYtCmd('seekTo', [0, true]);
      lobbyYtCmd('playVideo');
    }
  }

  /* Верхняя статусная плашка киноэкрана (по клику переключает Трейлер <-> Титры с правилами) */
  c.fillStyle = 'rgba(6, 8, 12, 0.88)';
  c.fillRect(scrX, scrY, scrW, 20);
  c.strokeStyle = 'rgba(212, 168, 67, 0.42)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(scrX, scrY + 20);
  c.lineTo(scrX + scrW, scrY + 20);
  c.stroke();

  const recBlink = Math.sin(preGameLobby.t * 5) > 0;
  c.fillStyle = recBlink ? '#FF4D4D' : '#8A2424';
  c.beginPath();
  c.arc(scrX + 12, scrY + 10, 3.5, 0, Math.PI * 2);
  c.fill();

  c.textAlign = 'left';
  c.font = `700 ${narrow ? 7.5 : 8.5}px "JetBrains Mono", monospace`;
  c.fillStyle = '#FFD166';
  c.fillText(
    preGameLobby.screenMode === 'trailer'
      ? '🎬 ИДЁТ ТРЕЙЛЕР (ПОСЛЕ ТРЕЙЛЕРА — ТИТРЫ С ПРАВИЛАМИ)'
      : '📜 ТИТРЫ ПОСЛЕ ТРЕЙЛЕРА · ПРАВИЛА ИГРЫ «БОЧКА»',
    scrX + 22,
    scrY + 13
  );

  c.textAlign = 'right';
  c.fillStyle = '#64DFDF';
  c.fillText(
    preGameLobby.screenMode === 'trailer' ? '[📜 ТИТРЫ-ПРАВИЛА ▸]' : '[🎬 К ТРЕЙЛЕРУ ▸]',
    scrX + scrW - 8,
    scrY + 13
  );

  c.restore();
  c.restore();
}

function updateAndDrawPreGameLobby(c, dt) {
  preGameLobby.t += dt;
  preGameLobby.toolSwing = Math.max(0, preGameLobby.toolSwing - dt * 4.5);
  const v = tapper.view || { x: 0, y: 0, w: VW, h: VH };
  const lx = preGameLobby.light ? preGameLobby.light.x : (v.x + v.w * 0.5 + Math.sin(preGameLobby.t * 0.8) * 90);
  const ly = preGameLobby.light ? preGameLobby.light.y : (v.y + v.h * 0.64 + Math.cos(preGameLobby.t * 0.6) * 35);

  preGameLobby.knockCycleT -= dt;
  if (preGameLobby.knockCycleT <= 0) {
    preGameLobby.knockCycleT = 2.2 + Math.random() * 1.1;
    preGameLobby.activeKnockIdx = (preGameLobby.activeKnockIdx + 1 + Math.floor(Math.random() * 3)) % preGameLobby.barrels.length;
    const kb = preGameLobby.barrels[preGameLobby.activeKnockIdx];
    if (kb) {
      kb.shake = Math.max(kb.shake, 0.78);
      kb.glow = Math.max(kb.glow, 0.62);
    }
  }

  c.save();
  /* 1. Глубокий индустриальный фон заводского цеха */
  const skyGrad = c.createLinearGradient(0, v.y, 0, v.y + v.h);
  skyGrad.addColorStop(0, '#040507');
  skyGrad.addColorStop(0.42, '#0A0D12');
  skyGrad.addColorStop(0.50, '#12161D');
  skyGrad.addColorStop(0.82, '#161B22');
  skyGrad.addColorStop(1, '#060709');
  c.fillStyle = skyGrad;
  c.fillRect(v.x, v.y, v.w, v.h);

  const bgSheet = sheets.factorySector || sheets.factory;
  if (bgSheet) {
    c.save();
    c.globalAlpha = 0.24;
    c.drawImage(bgSheet, v.x, v.y, v.w, v.h);
    c.restore();
  }

  /* 2. Стальные диагональные фермы крыши цеха */
  c.strokeStyle = 'rgba(24, 30, 38, 0.72)';
  c.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const bx = v.x + v.w * (0.10 + i * 0.24);
    c.beginPath();
    c.moveTo(bx, v.y);
    c.lineTo(bx + v.w * 0.18, v.y + v.h * 0.44);
    c.moveTo(bx + v.w * 0.18, v.y);
    c.lineTo(bx, v.y + v.h * 0.44);
    c.stroke();
  }

  /* 3. Бетонный пол цеха (рисуется ДО киноэкрана, чтобы экран стоял прямо за бочками и не перекрывался полом!) */
  const floorY = v.y + v.h * 0.54;
  const floorLight = c.createRadialGradient(lx, Math.max(floorY + 30, ly), 20, v.x + v.w * 0.5, v.y + v.h * 0.72, v.w * 0.54);
  floorLight.addColorStop(0, 'rgba(218, 224, 232, 0.22)');
  floorLight.addColorStop(0.45, 'rgba(90, 98, 110, 0.12)');
  floorLight.addColorStop(1, 'rgba(5, 6, 9, 0.92)');
  c.fillStyle = floorLight;
  c.fillRect(v.x, floorY, v.w, v.h - floorY);

  /* 4. БОЛЬШОЙ КИНОЭКРАН ПРЯМО ЗА БОЧКАМИ: сначала идёт Трейлер, а когда он закончится — Титры с правилами игры! */
  drawLobbyBackgroundTrailerAndCredits(c, v, dt);

  /* 5. ПЕРЕД КИНОЭКРАНОМ СТОЯТ 6 ФОТОРЕАЛИСТИЧНЫХ БОЧЕК ИЗ sheets.barrels, И ТОЛЬКО ПОСЛЕ УДАРОВ ИЗ НИХ ПОЯВЛЯЮТСЯ НАШИ СПРАЙТ-ПЕРСОНАЖИ! */
  const sh = sheets.barrels;
  const drawOrder = [0, 1, 4, 2, 3, 5];
  drawOrder.forEach((idx) => {
    const b = preGameLobby.barrels[idx];
    b.shake = Math.max(0, b.shake - dt * 2.6);
    b.glow = Math.max(0, b.glow - dt * 1.8);
    b.handT = Math.max(0, b.handT - dt);
    b.popT = Math.max(0, (b.popT || 0) - dt);
    b.popBounce = Math.max(0, (b.popBounce || 0) - dt * 3.0);
    b.rubCd = Math.max(0, b.rubCd - dt);

    const pos = getLobbyBarrelPos(b);
    const isKnockingNow = preGameLobby.activeKnockIdx === idx;
    /* Спрайт-персонаж появляется из бочки ТОЛЬКО ПОСЛЕ УДАРА по ней (b.hits > 0 или b.popT > 0)! */
    const targetPop = (b.hits > 0 || b.popT > 0.35)
      ? 1.0
      : b.popT > 0
        ? (b.popT / 0.35)
        : 0;
    const popSpeed = targetPop > (b.popAnim || 0) ? 10.5 : 5.5;
    b.popAnim = (b.popAnim || 0) + (targetPop - (b.popAnim || 0)) * Math.min(1, dt * popSpeed);

    const knockPulse = isKnockingNow ? Math.sin(preGameLobby.t * 26) * (Math.sin(preGameLobby.t * 3.5) > 0.35 ? 2.6 : 0) : 0;
    const sx = pos.x + Math.sin(preGameLobby.t * 44) * 5.5 * b.shake + knockPulse;
    const sy = pos.y - b.glow * 3;
    const bw = pos.bw;
    const bh = pos.bh;

    /* Контактная и перспективная тень на бетонном полу */
    const shDx = Math.max(-65, Math.min(65, (pos.x - lx) * 0.20));
    drawShadow(c, sx + shDx * 0.35, sy + 2, bh * 0.40, 0.72);

    /* Акустическое золотое кольцо под стучащей изнутри бочкой */
    if (isKnockingNow || b.glow > 0.08) {
      const ringAlpha = Math.max(b.glow * 0.65, isKnockingNow ? (0.24 + Math.sin(preGameLobby.t * 6) * 0.12) : 0);
      c.save();
      c.strokeStyle = `rgba(212, 168, 67, ${ringAlpha.toFixed(3)})`;
      c.lineWidth = 2.2;
      c.beginPath();
      c.ellipse(sx, sy + 2, bw * 0.64 + Math.sin(preGameLobby.t * 5) * 4, 11 * pos.s, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    const showHand = b.popAnim <= 0.15 && b.hasHand && isKnockingNow;
    const spriteKey = showHand ? 'hand' : (b.spriteKey || 'igor');
    const drawBh = showHand ? bh * 1.18 : bh;

    /* Отрисовка реальной текстурной стальной бочки из спрайт-листа assets/barrels.jpg */
    if (sh) {
      const rect = barrelRect(sh, spriteKey);
      drawFrame(c, sh, rect, sx, sy, drawBh);
    } else {
      drawBarrelFallback(c, sx, sy - bh * 0.5, bw, bh, showHand ? 'hand' : 'closed');
    }

    /* Отрисовка персонажа, вылезающего из бочки при стуке по ней */
    drawBarrelPopCharacter(c, b, idx, sx, sy, bw, bh, pos.s, dt);

    /* ОПОЯСЫВАЮЩАЯ 3D-НАКЛЕЙКА С ИМЕНЕМ АКТЁРА И РОЛЬЮ ПО ДУГЕ ЦИЛИНДРА БОЧКИ */
    const distToLight = Math.hypot(pos.x - lx, (pos.y - bh * 0.5) - ly);
    const lightBoost = Math.max(0, 1 - distToLight / 250);
    drawBarrelWrappedLabel(c, sx, sy, bh, b.firstName, {
      subName: b.lastName,
      role: b.shortRole,
      glow: Math.max(b.glow, lightBoost * 0.75),
    });

    /* Индикатор стука изнутри ТОЛЬКО над закрытой стучащей бочкой (без имён над головами высунувшихся персонажей!) */
    if (isKnockingNow && !b.hits && !(b.popT > 0)) {
      c.save();
      const tagY = sy - (showHand ? bh * 1.02 : bh * 0.86) - 10 * pos.s;
      const tagTxt = '🔊 ТУК-ТУК!';
      c.font = `800 ${Math.max(7.5, Math.round(9 * pos.s))}px "JetBrains Mono", monospace`;
      const tw = c.measureText(tagTxt).width + 12;
      c.fillStyle = 'rgba(10, 12, 16, 0.92)';
      c.strokeStyle = '#FFD166';
      c.lineWidth = 1.2;
      c.fillRect(sx - tw * 0.5, tagY - 11, tw, 15);
      c.strokeRect(sx - tw * 0.5, tagY - 11, tw, 15);
      c.textAlign = 'center';
      c.fillStyle = '#FFD166';
      c.fillText(tagTxt, sx, tagY);
      c.restore();
    }
  });

  /* 6. Луч фонаря и инструмент в руке, следующие за пальцем / мышью по тёмному цеху */
  const spotG = c.createRadialGradient(lx, ly, 10, lx, ly, 240);
  spotG.addColorStop(0, 'rgba(255, 232, 185, 0.18)');
  spotG.addColorStop(0.55, 'rgba(212, 168, 67, 0.06)');
  spotG.addColorStop(1, 'rgba(8, 9, 11, 0)');
  c.fillStyle = spotG;
  c.beginPath();
  c.arc(lx, ly, 240, 0, Math.PI * 2);
  c.fill();

  /* Искры от ударов по бочкам */
  for (let i = preGameLobby.sparks.length - 1; i >= 0; i--) {
    const sp = preGameLobby.sparks[i];
    sp.life -= dt;
    if (sp.life <= 0) { preGameLobby.sparks.splice(i, 1); continue; }
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 460 * dt;
    c.fillStyle = '#FFD166';
    c.fillRect(sp.x, sp.y, 3, 3);
  }

  /* Всплывающие реплики и очки над бочками актёров */
  for (let i = preGameLobby.floats.length - 1; i >= 0; i--) {
    const fl = preGameLobby.floats[i];
    fl.life -= dt;
    if (fl.life <= 0) { preGameLobby.floats.splice(i, 1); continue; }
    fl.y -= 18 * dt;
    c.save();
    c.globalAlpha = Math.min(1, fl.life * 1.8);
    c.font = 'bold 11px "JetBrains Mono", monospace';
    const tw = Math.max(c.measureText(fl.txt).width, c.measureText(fl.sub || '').width) + 20;
    const fx = Math.max(v.x + tw / 2 + 8, Math.min(v.x + v.w - tw / 2 - 8, fl.x));
    c.fillStyle = 'rgba(8, 10, 14, 0.92)';
    c.strokeStyle = '#D4A843';
    c.lineWidth = 1.2;
    c.fillRect(fx - tw / 2, fl.y - 26, tw, 34);
    c.strokeRect(fx - tw / 2, fl.y - 26, tw, 34);
    c.textAlign = 'center';
    c.fillStyle = '#FFD166';
    c.fillText(fl.txt, fx, fl.y - 12);
    if (fl.sub) {
      c.fillStyle = '#ECE4D2';
      c.font = '10px "Inter", sans-serif';
      c.fillText(fl.sub, fx, fl.y + 2);
    }
    c.restore();
  }

  if (preGameLobby.light) {
    drawToolCursor(c, lx + 10, ly + 6, S.toolLevel || 2, preGameLobby.toolSwing, 0.95, false);
  }

  c.restore();
}

/* ---------- loop ---------- */
let last = performance.now(), acc = 0, saveAcc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const anyModal = modalOpen() || !$('screamer').classList.contains('is-hidden');
  tapper.paused = anyModal; night.paused = anyModal;
  const dpr = view.dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#06080B'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr, view.ox * dpr, view.oy * dpr);
  ctx.imageSmoothingEnabled = true;
  if (!started) {
    updateAndDrawPreGameLobby(ctx, dt);
  } else if (mode === 'tap') {
    tapper.update(dt); tapper.draw(ctx);
  } else {
    night.update(dt); night.draw(ctx);
  }
  acc += dt;
  saveAcc += dt;
  if (acc > 0.35) {
    acc = 0; tick(); renderHUD(hudInfo());
    const goalEl = $('goalTxt');
    if (goalEl) {
      const showGoal = started && mode === 'night' && night.active && !anyModal;
      goalEl.classList.toggle('is-hidden', !showGoal);
      if (showGoal) {
        const gt = night.goalBanner();
        if (goalEl.textContent !== gt) goalEl.textContent = gt;
      }
    }
    $('hero').classList.toggle('is-playing', started && (tapper.active || night.active));
    if (S.lives > 0 && started && !tapper.active && !night.active && !anyModal && $('hero').classList.contains('is-dead')) { $('hero').classList.remove('is-dead'); (mode === 'tap' ? levelIntro() : nightIntro()); }
    if (S.lives > 0) $('hero').classList.remove('is-dead');
    if (S.lives <= 0 && !tapper.fatherChained?.cutscene) $('hero').classList.add('is-dead');
    if (started) {
      const idleBetween = !tapper.active && !night.active && !anyModal;
      $('enterBox').classList.toggle('is-hidden', !idleBetween);
      if (idleBetween) {
        $('btnEnter').textContent = mode === 'night'
          ? `🌙 ${t('modeNight')} ▶`
          : t('continueLvl', { n: String(S.level).padStart(2, '0') });
      }
    }
    const el = Date.now() - startedAt, f = Math.floor((el / 40) % 25);
    $('timecode').textContent = `${String(Math.floor(el / 3600000)).padStart(2, '0')}:${String(Math.floor(el / 60000) % 60).padStart(2, '0')}:${String(Math.floor(el / 1000) % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    if (saveAcc > 4.0) {
      saveAcc = 0;
      save();
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- input ---------- */
function canvasPoint(e) { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) - view.ox) / view.s, ((e.clientY - r.top) - view.oy) / view.s]; }
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = canvasPoint(e);
  tapper.light = { x, y };
  preGameLobby.light = { x, y };
  /* Лёгкая вибрация, когда палец проходит над бочкой, которая стучит изнутри */
  if (!started) {
    const kb = preGameLobby.barrels[preGameLobby.activeKnockIdx];
    if (kb) {
      const p = getLobbyBarrelPos(kb);
      const nowMs = performance.now();
      if (Math.abs(x - p.x) < p.bw * 0.6 && y < p.y && y > p.y - p.bh && nowMs - (preGameLobby.lastHapticT || 0) > 350) {
        preGameLobby.lastHapticT = nowMs;
        tgHaptic('impact', 'light');
      }
    }
  }
  if (!started && (e.buttons > 0 || e.pointerType === 'touch')) {
    hitPreGameLobby(x, y, true);
  }
});
/* Канал проверки того, что приглашённый друг реально зашёл и начал тапать по бочке */
let refChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    refChannel = new BroadcastChannel('bochka_ref');
  }
} catch { /* ignore */ }

function notifyReferrerTapped() {
  if (!S.cameFrom || S.refTapSent) return;
  S.refTapSent = true;
  save();
  audio.coin(2.2);
  toast(t('friendSaved', { c: S.cameFrom }));
  const payload = {
    type: 'friend_tapped',
    refCode: S.cameFrom,
    friendName: S.alias || ('Друг #' + (S.refCode || '0000').slice(0, 4)),
    ts: Date.now(),
  };
  try { refChannel?.postMessage(payload); } catch { /* ignore */ }
  try { localStorage.setItem('bochka_ref_event', JSON.stringify(payload)); } catch { /* ignore */ }
}

canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = canvasPoint(e);
  tapper.light = { x, y };
  preGameLobby.light = { x, y };
  if (!started) {
    hitPreGameLobby(x, y, false);
    return;
  }
  if (mode === 'tap') {
    const prevTaps = S.taps;
    tapper.hit(x, y);
    if (S.taps > prevTaps) {
      tgHaptic('impact', 'light');
      queueAction({ type: 'tap', index: 0 });
      if (S.cameFrom && !S.refTapSent && S.taps >= 3) {
        notifyReferrerTapped();
      }
    }
  } else if (mode === 'night') {
    tgHaptic('selection');
    night.pointer(x, y);
  }
});
const KEYMAP = {
  ArrowLeft: 'left', a: 'left', A: 'left', ф: 'left', Ф: 'left',
  ArrowRight: 'right', d: 'right', D: 'right', в: 'right', В: 'right',
  ArrowUp: 'up', w: 'up', W: 'up', ц: 'up', Ц: 'up',
  ArrowDown: 'down', s: 'down', S: 'down', ы: 'down', Ы: 'down',
  e: 'act', E: 'act', у: 'act', У: 'act', Enter: 'act',
  h: 'hide', H: 'hide', р: 'hide', Р: 'hide', ' ': 'hide',
  Shift: 'run',
  f: 'lure', F: 'lure', а: 'lure', А: 'lure',
  q: 'door', Q: 'door', й: 'door', Й: 'door',
  z: 'zoom', Z: 'zoom', я: 'zoom', Я: 'zoom',
};
const setTouchBtnVisual = (k, on) => {
  const btn = document.querySelector(`.touch__btn[data-k="${k}"]`);
  if (btn) btn.classList.toggle('is-pressed', !!on);
};
document.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.key];
  if (k && mode === 'night' && !modalOpen()) {
    e.preventDefault();
    setTouchBtnVisual(k, true);
    if (!e.repeat) night.key(k, true);
  }
});
document.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.key];
  if (k) {
    setTouchBtnVisual(k, false);
    night.key(k, false);
  }
});
document.querySelectorAll('.touch__btn').forEach((b) => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setTouchBtnVisual(k, true);
    night.key(k, true);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    b.addEventListener(ev, () => {
      setTouchBtnVisual(k, false);
      night.key(k, false);
    })
  );
});

/* ---------- boot ---------- */
function boot() {
  initLanguage();
  initUI();
  const urlRef = new URLSearchParams(location.search).get('ref');
  const tgStart = window.Telegram?.WebApp?.initDataUnsafe?.start_param || '';
  const tgRef = tgStart.startsWith('ref_') ? tgStart.slice(4) : '';
  const ref = (urlRef || tgRef || '').trim();
  if (ref && ref !== S.refCode && !S.cameFrom) {
    S.cameFrom = ref;
    S.refTapSent = false;
    addPoints(500);
    save();
    toast(t('welcome', { c: ref }));
  }
  initTelegramMiniApp();
  const handleFriendVerified = (name) => {
    const res = friendArrived(name || `Друг #${S.refs.length + 1}`);
    audio.coin(2.4);
    toast(`🤝 Пришёл друг! ❤️ Все жизни восстановлены, +25 000 очков и КАРТОЧКА «БОЧКА» → УР. ${res.barrelLevel}/200 (🎟️ ${res.chances} купонов · выше 7 ур. до 200 ур. качается только друзьями)!`);
    renderHUD(hudInfo());
    renderSections();
  };
  window.bochkaFriendArrived = handleFriendVerified;

  /* ---------- РЕЖИМ БОГА: скрыт от обычных игроков (?god=1 или 5 кликов подряд по логотипу «БОЧКА») ---------- */
  const unlockGod = () => {
    document.body.classList.add('god-unlocked');
    try { sessionStorage.setItem('bochka_god_ok', '1'); } catch { /* ignore */ }
  };
  let godOk = new URLSearchParams(location.search).get('god') === '1';
  try { if (sessionStorage.getItem('bochka_god_ok') === '1') godOk = true; } catch { /* ignore */ }
  if (godOk) unlockGod();
  else if (S.godMode) { S.godMode = false; save(); }
  let logoClicks = 0, logoLastT = 0;
  document.querySelector('.top__logo')?.addEventListener('click', () => {
    const now = Date.now();
    logoClicks = now - logoLastT < 1500 ? logoClicks + 1 : 1;
    logoLastT = now;
    if (logoClicks >= 5) {
      logoClicks = 0;
      unlockGod();
      syncGodModeUI();
      toast('🔓 Тестовая панель разработчика открыта');
    }
  });

  /* ---------- РЕЖИМ БОГА (ВРЕМЕННАЯ КНОПКА И ТЕСТ-ПАНЕЛЬ УРОВНЕЙ) ---------- */
  const syncGodModeUI = () => {
    const btn = $('btnGodMode');
    const bar = $('godModeBar');
    if (btn) {
      btn.classList.toggle('is-on', !!S.godMode);
      btn.textContent = S.godMode ? '⚡ БОГ: ВКЛ' : '⚡ РЕЖИМ БОГА';
    }
    if (bar) {
      bar.classList.toggle('is-hidden', !S.godMode);
    }
    document.body.classList.toggle('is-god-mode', !!S.godMode);
  };
  syncGodModeUI();

  if ($('btnGodMode')) {
    $('btnGodMode').onclick = () => {
      const on = toggleGodMode();
      syncGodModeUI();
      if (on) {
        tapper.air = 100;
        if (night.boy) { night.boy.air = 100; night.boy.seen = 0; }
        audio.barrelMelodyBeat(0, 4);
        audio.coin(2.4);
        toast('⚡ РЕЖИМ БОГА ВКЛЮЧЁН! Открыты все 8 уровней, 10 орудий, 9999 ⚡ энергии, бессмертие и +25 000 000 очков для теста!');
      } else {
        toast('⚡ Режим Бога выключен.');
      }
      renderHUD(hudInfo());
      renderSections();
    };
  }

  document.querySelectorAll('#godModeBar [data-god-lvl]').forEach((btn) => {
    btn.onclick = () => {
      const lvl = Number(btn.dataset.godLvl) || 1;
      lobbyYtCmd('pauseVideo');
      lobbyYtCmd('mute');
      closeModal();
      audio.startAudio();
      started = true;
      startedAt = Date.now();
      $('hero').classList.add('is-started');
      $('hero').classList.remove('is-dead');
      $('enterBox').classList.add('is-hidden');
      S.lives = Math.max(S.lives || 3, S.livesMax || 5);
      if (lvl === 8) {
        S.nightUnlocked = true;
        mode = 'night';
        tapper.stop();
        night.start();
        toast('⚡ Переход на Секретный Ур. 08 «Ночная смена» (Стелс Пацана)!');
      } else {
        mode = 'tap';
        night.stop();
        S.level = lvl;
        S.maxLevel = Math.max(S.maxLevel || 1, lvl);
        tapper.start(lvl);
        const cfg = levelConfig(lvl);
        toast(`⚡ Запущен ${cfg.mechanicTitle || ('Уровень 0' + lvl)}!`);
      }
      $('btnModeTap').classList.toggle('is-on', mode === 'tap' && S.level !== 7);
      if ($('btnModeOcean')) $('btnModeOcean').classList.toggle('is-on', mode === 'tap' && S.level === 7);
      $('btnModeNight').classList.toggle('is-on', mode === 'night');
      $('hero').classList.toggle('is-night', mode === 'night');
      resize();
      renderHUD(hudInfo());
      renderSections();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  if ($('btnGodWin')) {
    $('btnGodWin').onclick = () => {
      started = true;
      $('hero').classList.add('is-started');
      $('enterBox').classList.add('is-hidden');
      if (mode === 'night' && night.active) {
        night.active = false;
        night.ev.onWin(Math.max(15000, Math.floor(night.points || 15000)));
      } else {
        tapper.active = false;
        winLevel(Math.max(12000, Math.floor(tapper.levelPoints || 12000)));
      }
    };
  }

  if ($('btnGodDirector')) {
    $('btnGodDirector').onclick = () => {
      crewVideo(S.level || 1, () => levelIntro(), { points: 12000 });
    };
  }

  if ($('btnGodFriend')) {
    $('btnGodFriend').onclick = () => {
      handleFriendVerified(`Друг #${S.refs.length + 1}`);
    };
  }
  if (refChannel) {
    refChannel.onmessage = (ev) => {
      if (ev.data?.type === 'friend_tapped' && ev.data.refCode === S.refCode) {
        handleFriendVerified(ev.data.friendName);
      }
    };
  }
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'bochka_ref_event' && ev.newValue) {
      try {
        const data = JSON.parse(ev.newValue);
        if (data?.type === 'friend_tapped' && data.refCode === S.refCode) {
          handleFriendVerified(data.friendName);
        }
      } catch { /* ignore */ }
    }
  });
  tick(); renderHUD(hudInfo()); renderSections();
  const d = dailyReward(); if (d) { toast(`${t('dailyGot')}: +${number(d.reward)} · ${d.streak}/30`); renderSections(); }
  $('btnRules').onclick = () => modal(t('rules'), `<p style="white-space:pre-line;text-align:left">${t('rulesText')}</p>`, [], { backdropClose: true });
  $('btnModeTap').onclick = () => switchMode('tap');
  if ($('btnModeOcean')) $('btnModeOcean').onclick = () => switchMode('ocean');
  $('btnModeNight').onclick = () => switchMode('night');
  $('btnHud').onclick = () => $('hero').classList.toggle('is-menu');
  document.querySelectorAll('.plate--br .btn').forEach((b) => b.addEventListener('click', () => { $('hero').classList.remove('is-menu'); }));
  const triggerPrankQuick = () => {
    duckLobbyTrailerForVoice(6500);
    const res = audio.playPrankVoice();
    if (res && res.track) {
      toast(`${res.track.label} (${res.index + 1}/${res.total}) — нажми ещё для следующей записи!`);
    }
  };
  if ($('btnPrankVoice')) $('btnPrankVoice').onclick = triggerPrankQuick;
  if ($('btnSplashPrank')) $('btnSplashPrank').onclick = triggerPrankQuick;
  $('btnSound').onclick = () => { audio.startAudio(); const m = !audio.isMuted(); audio.setMuted(m); $('soundState').textContent = t(m ? 'off' : 'on'); };
  if ($('btnLobbyPoster')) {
    $('btnLobbyPoster').onclick = () => {
      modal(
        '🎬 БОЧКА (BARREL) · В КИНО С 17 ДЕКАБРЯ 2026',
        `
          <div style="display:grid;grid-template-columns:130px 1fr;gap:10px;align-items:center;text-align:left;margin-bottom:8px">
            <img src="photo_2026-11-08_00-00-26.jpg" alt="Постер БОЧКА" style="width:100%;border:1px solid var(--gold);display:block">
            <div style="font-size:11.5px;line-height:1.45;color:var(--chalk)">
              <div style="color:var(--gold);font-family:var(--font-mono);font-weight:700;margin-bottom:4px">ТИЛЬ ШВАЙГЕР · ФИЛИПП РЕЙНХАРДТ</div>
              <p style="margin:0 0 6px">Юный пранкер приходит в себя в запертой бочке на заброшенном заводе. Рядом — прикованный к столбу отец. Чтобы выбраться, им придётся научиться доверять друг другу.</p>
              <div style="font-family:var(--font-mono);font-size:10px;color:#FFD166">🏆 Участник фестиваля Cinequest (США) · Права у Apple TV и Amazon</div>
            </div>
          </div>
          <img src="photo_2026-11-08_00-00-14.jpg" alt="Баннер БОЧКА" style="width:100%;max-height:145px;object-fit:cover;border:1px solid var(--seam);display:block;margin-bottom:6px">
        `,
        [
          {
            label: '🛢️ НАЧАТЬ ИГРУ ▶',
            fn: () => $('btnEnter')?.click(),
          },
          {
            label: '🎬 КИНОПОИСК ↗',
            ghost: true,
            fn: () => window.open('https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D', '_blank'),
          },
          {
            label: '▶️ YOUTUBE ТРЕЙЛЕР ↗',
            ghost: true,
            fn: () => window.open('https://youtu.be/EZFDcXeLTzQ?si=-NIU0mFyayaYjHnf', '_blank'),
          },
        ],
        { backdropClose: true }
      );
    };
  }
  if ($('btnSplashMute')) {
    updateSplashMuteBtnLabel();
    $('btnSplashMute').onclick = () => {
      lobbyYtMuted = !lobbyYtMuted;
      if (!lobbyYtMuted) {
        audio.stopAllVoices();
        ensureLobbyTrailerSound();
      } else {
        lobbyYtCmd('mute');
        updateSplashMuteBtnLabel();
      }
    };
  }
  if ($('btnExitLobby')) {
    $('btnExitLobby').onclick = () => {
      tapper.stop();
      night.stop();
      started = false;
      $('hero').classList.remove('is-started', 'is-playing');
      $('enterBox').classList.remove('is-hidden');
      $('btnEnter').textContent = t('enter');
      ensureLobbyTrailerSound();
    };
  }
  $('btnEnter').onclick = () => {
    lobbyYtCmd('pauseVideo');
    lobbyYtCmd('mute');
    audio.startAudio(); started = true; startedAt = Date.now();
    $('hero').classList.add('is-started');
    $('enterBox').classList.add('is-hidden');
    if (S.lives <= 0) showChains(); else if (mode === 'night') nightIntro(); else levelIntro();
  };
  document.addEventListener('clear-hand-skill', () => {
    tapper.clearHandSkill(true);
    renderHUD(hudInfo());
    renderHudSkillsBar(true);
  });
  document.addEventListener('hand-skill-triggered', () => {
    renderHUD(hudInfo());
    renderUpgrade();
    renderHudSkillsBar(true);
  });
  document.addEventListener('arm-skill', (ev) => {
    const d = ev.detail;
    if (!d) return;
    if (mode === 'tap') {
      const res = tapper.armSkill(d.card || d.cardId);
      if (!res.ok) {
        if (res.reason === 'ocean_no_skills') {
          toast('🚫 На уровне «Достучаться до небес» карточки усиления не работают! Стучи только когда он смотрит на море!');
        } else if (res.reason === 'no_energy') {
          toast(`⚡ Недостаточно энергии для навыка! Нужно ${res.cost} ⚡ (сейчас ${res.energy} ⚡)`);
        }
        return;
      }
      if (res.triggeredNow) {
        toast(`⚡ АКТИВИРОВАН: ${res.card.icon} «${res.card.ru}» (${res.dur}с)!`);
      } else if (res.armed) {
        toast(`🎯 В РУКЕ: ${res.card.icon} «${res.card.ru}»! Наведи и нажми на персонажа или бочку (-${res.cost} ⚡ на ${res.dur}с)!`);
      } else if (res.unarmed) {
        toast(`🔨 Навык убран — в руке снова инструмент!`);
      }
    } else if (mode === 'night' && night.boy) {
      const res = spendSkillEnergy(d.cardId || d.card?.id);
      if (!res.ok) {
        if (res.reason === 'no_energy') {
          toast(`⚡ Недостаточно энергии для навыка! Нужно ${res.cost} ⚡ (сейчас ${res.energy} ⚡)`);
        }
        return;
      }
      if (res.skillKey === 'oxygen') night.boy.air = 100;
      else if (res.skillKey === 'stealth' || res.skillKey === 'freeze') {
        night.boy.seen = 0;
        night.quests.blackoutUntil = night.t + res.dur;
      } else if (res.skillKey === 'distract') {
        night.dropPhoneLure();
      }
      night.note(`${res.card?.icon || '⚡'} Навык «${res.card?.ru || res.skillKey}» активирован (${res.dur}с)!`, 3.0);
    }
    renderHUD(hudInfo());
    renderHudSkillsBar(true);
  });
  document.addEventListener('langchange', () => { renderHUD(hudInfo()); $('soundState').textContent = t(audio.isMuted() ? 'off' : 'on'); });
  document.addEventListener('trailer-tap', () => {
    const bonus = screenTapBonus();
    if (bonus > 0) {
      audio.coin(1.3);
      toast(`${t('bonusTap')}: +${bonus}`);
      renderHUD(hudInfo());
      renderSections();
    }
  });
  loadAll().then(() => renderSections());
  initNet().then(() => { renderHUD(hudInfo()); renderSections(); });
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
