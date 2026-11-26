import { ENV } from './env.js';

function getWebApp() {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  if (!tg) return null;
  return tg;
}

export function isTelegramMiniApp() {
  const tg = getWebApp();
  return Boolean(tg && tg.initData && tg.initData.length > 0);
}

export function buildTelegramStartAppUrl(param = '') {
  const bot = ENV.tgBotUsername || 'bochka_film_bot';
  const base = `https://t.me/${bot}`;
  return param ? `${base}?startapp=${encodeURIComponent(param)}` : `${base}?startapp=play`;
}

export function isAdminModeRequested() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('mode') === 'admin' || sp.get('admin') === '1';
  } catch {
    return false;
  }
}

export function isTestBogRequested() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('mode') === 'testbog' || sp.get('testbog') === '1';
  } catch {
    return false;
  }
}

export function isTestBogSessionActive() {
  try {
    return (
      sessionStorage.getItem('bochka_testbog_unlocked') === '1' &&
      sessionStorage.getItem('bochka_testbog_mode') === '1'
    );
  } catch {
    return false;
  }
}

export function initTelegram() {
  const tg = getWebApp();
  const rawUrlStart = extractUrlBarrelParam();
  const urlGift = extractUrlPassParam();
  const urlExtras = extractUrlExtraParams();

  const parseStartTokens = (raw) => {
    const res = {
      barrelParam: '',
      autoOpenPack: false,
      passParam: '',
      duelRoomParam: '',
      watchBarrelParam: '',
      trailerAutoOpen: false,
      trailerRefUid: '',
      openGiftFork: false,
      openTilKnock: false,
      trafficSource: '',
      teamSeedRole: '',
      broadcastLinkType: '',
    };
    const clean = String(raw || '').trim();
    if (!clean) return res;
    const low = clean.toLowerCase();
    if (clean === 'giftfork') {
      res.openGiftFork = true;
    } else if (low === 'til_knock' || low === 'ocean_til' || low === 'knock_til' || low === 'knock') {
      res.openTilKnock = true;
      res.trafficSource = 'til_knock';
    } else if (low === 'team_prod' || low === 'seed_admin' || low === 'admin_seed' || /^(?:seed_prod|src_prod)\d*$/.test(low)) {
      res.teamSeedRole = 'prod';
      res.trafficSource = 'team_prod';
    } else if (low === 'team_blog' || low === 'seed_blog') {
      res.teamSeedRole = 'blog';
      res.trafficSource = 'team_blog';
    } else if (low.startsWith('pr_') && clean.length > 3) {
      res.barrelParam = clean.slice(3);
      res.autoOpenPack = true;
      res.broadcastLinkType = 'pr';
      res.trafficSource = `pr_${res.barrelParam}`;
    } else if (low.startsWith('bl_') && clean.length > 3) {
      res.barrelParam = clean.slice(3);
      res.autoOpenPack = true;
      res.broadcastLinkType = 'bl';
      res.trafficSource = `bl_${res.barrelParam}`;
    } else if (low.startsWith('bi_') && clean.length > 3) {
      res.barrelParam = clean.slice(3);
      res.autoOpenPack = true;
      res.teamSeedRole = 'blog';
      res.broadcastLinkType = 'bi';
      res.trafficSource = 'team_blog';
    } else if (clean.startsWith('pack_')) {
      res.barrelParam = clean.slice(5);
      res.autoOpenPack = true;
      res.trafficSource = clean;
    } else if (clean.startsWith('gift_') || clean.startsWith('pass_')) {
      res.passParam = clean.slice(5);
      res.trafficSource = `gift_${res.passParam}`;
    } else if (clean.startsWith('duel_')) {
      res.duelRoomParam = clean.slice(5);
      res.trafficSource = `duel_${res.duelRoomParam}`;
    } else if (clean.startsWith('src_')) {
      res.trafficSource = clean.toLowerCase();
    } else if (clean.startsWith('ref_')) {
      res.trailerRefUid = clean.slice(4);
      res.trafficSource = clean;
    } else if (clean.startsWith('watch_')) {
      res.watchBarrelParam = clean.slice(6);
    } else if (clean.startsWith('trailer_')) {
      res.trailerAutoOpen = true;
      res.trailerRefUid = clean.slice(8);
      res.trafficSource = `ref_${res.trailerRefUid}`;
    } else if (clean !== 'play') {
      res.barrelParam = clean;
    }
    return res;
  };

  const resolveTrafficSource = (parsedSrc, extras) => {
    if (parsedSrc) return parsedSrc;
    if (extras.src) {
      return extras.src.startsWith('src_') ? extras.src.toLowerCase() : `src_${extras.src.toLowerCase()}`;
    }
    if (extras.utm) {
      return extras.utm.startsWith('src_') ? extras.utm.toLowerCase() : `src_${extras.utm.toLowerCase()}`;
    }
    if (extras.ref) {
      return extras.ref.startsWith('ref_') || extras.ref.startsWith('src_')
        ? extras.ref
        : `ref_${extras.ref}`;
    }
    return '';
  };

  if (!tg) {
    const parsed = parseStartTokens(rawUrlStart);
    const trafficSource = resolveTrafficSource(parsed.trafficSource, urlExtras);
    return {
      inTelegram: false,
      user: null,
      rawStartParam: rawUrlStart || '',
      startParam: parsed.barrelParam,
      autoOpenPack: Boolean(parsed.autoOpenPack),
      passParam: urlGift || parsed.passParam,
      duelRoomParam: urlExtras.duel || parsed.duelRoomParam,
      watchBarrelParam: urlExtras.watch || parsed.watchBarrelParam,
      trailerAutoOpen: urlExtras.trailer || parsed.trailerAutoOpen,
      trailerRefUid: urlExtras.ref || parsed.trailerRefUid,
      openGiftFork: urlExtras.giftfork || parsed.openGiftFork,
      openTilKnock: Boolean(urlExtras.tilKnock || parsed.openTilKnock),
      trafficSource,
      teamSeedRole: urlExtras.teamSeedRole || parsed.teamSeedRole || '',
      broadcastLinkType: parsed.broadcastLinkType || '',
    };
  }

  try {
    if (typeof tg.ready === 'function') tg.ready();
    if (typeof tg.expand === 'function') tg.expand();
    const hasVer = (v) => typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast(v);
    if (hasVer('7.7') && typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
    if (hasVer('6.1') && typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#0d0d0d');
    if (hasVer('6.1') && typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#0d0d0d');
    const syncTgSafeAreas = () => {
      try {
        const root = document.documentElement;
        const sa = tg.safeAreaInset || {};
        const csa = tg.contentSafeAreaInset || {};
        const topPx = (Number(sa.top) || 0) + (Number(csa.top) || 0);
        const botPx = (Number(sa.bottom) || 0) + (Number(csa.bottom) || 0);
        if (topPx > 0) root.style.setProperty('--safe-top', `${topPx}px`);
        if (botPx > 0) root.style.setProperty('--safe-bottom', `${botPx}px`);
      } catch {
        /* ignore */
      }
    };
    syncTgSafeAreas();
    if (typeof tg.onEvent === 'function') {
      tg.onEvent('viewportChanged', () => {
        syncTgSafeAreas();
        window.dispatchEvent(new Event('resize'));
      });
      tg.onEvent('safeAreaChanged', syncTgSafeAreas);
      tg.onEvent('contentSafeAreaChanged', syncTgSafeAreas);
    }
  } catch {
    /* ignore older client methods */
  }

  const u = tg.initDataUnsafe?.user || null;
  const rawStart = tg.initDataUnsafe?.start_param || rawUrlStart;
  const parsed = parseStartTokens(rawStart);
  const parsedUrlFallback = rawUrlStart && rawUrlStart !== rawStart ? parseStartTokens(rawUrlStart) : null;
  const effectiveBarrelParam = parsed.barrelParam || parsedUrlFallback?.barrelParam || '';
  const inTg = Boolean((tg.initData && tg.initData.length > 0) || tg.initDataUnsafe?.start_param || u);
  const trafficSource = resolveTrafficSource(parsed.trafficSource, urlExtras);

  return {
    inTelegram: inTg,
    user: u
      ? {
          id: String(u.id),
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '',
          username: u.username || '',
          photoUrl: u.photo_url || '',
          lang: u.language_code || '',
        }
      : null,
    rawStartParam: rawStart || '',
    startParam: effectiveBarrelParam,
    autoOpenPack: Boolean(parsed.autoOpenPack || (inTg && effectiveBarrelParam)),
    passParam: urlGift || parsed.passParam,
    duelRoomParam: urlExtras.duel || parsed.duelRoomParam,
    watchBarrelParam: urlExtras.watch || parsed.watchBarrelParam,
    trailerAutoOpen: urlExtras.trailer || parsed.trailerAutoOpen,
    trailerRefUid: urlExtras.ref || parsed.trailerRefUid,
    openGiftFork: urlExtras.giftfork || parsed.openGiftFork,
    openTilKnock: Boolean(urlExtras.tilKnock || parsed.openTilKnock),
    trafficSource,
    teamSeedRole: urlExtras.teamSeedRole || parsed.teamSeedRole || '',
    broadcastLinkType: parsed.broadcastLinkType || '',
  };
}

function extractUrlExtraParams() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const seedQ = (sp.get('team') || sp.get('seed') || '').trim().toLowerCase();
    return {
      duel: (sp.get('duel') || '').trim(),
      watch: (sp.get('watch') || '').trim(),
      trailer: sp.get('trailer') === '1',
      ref: (sp.get('ref') || '').trim(),
      src: (sp.get('src') || '').trim(),
      utm: (sp.get('utm') || sp.get('utm_source') || sp.get('utm_campaign') || '').trim(),
      giftfork: sp.get('giftfork') === '1',
      teamSeedRole: seedQ === 'prod' || sp.get('seed_admin') === '1' ? 'prod' : seedQ === 'blog' ? 'blog' : '',
    };
  } catch {
    return { duel: '', watch: '', trailer: false, ref: '', src: '', utm: '', giftfork: false, teamSeedRole: '' };
  }
}

export function extractUrlPassParam() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get('gift') || sp.get('pass') || '';
    if (p) return p.trim();
  } catch {
    /* ignore */
  }
  return '';
}

export function extractUrlBarrelParam() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const direct = sp.get('b') || sp.get('startapp') || sp.get('tgWebAppStartParam') || '';
    if (direct) return direct.trim();
    if (window.location.hash) {
      const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const fromHash = hp.get('tgWebAppStartParam') || hp.get('startapp') || hp.get('b') || '';
      if (fromHash) return fromHash.trim();
      const rawData = hp.get('tgWebAppData') || '';
      if (rawData) {
        const dp = new URLSearchParams(rawData);
        const fromData = dp.get('start_param') || '';
        if (fromData) return fromData.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return '';
}

let _tgWriteAccessPrompted = false;
let _tgWriteAccessGranted = false;

/**
 * v15.4.1: Запрос нативного разрешения Telegram WebApp.requestWriteAccess() (Bot API 6.9+),
 * чтобы @bochka_film_bot мог слать игроку пуши в дуэль, ответы друзей и бесплатные билеты в ЛС
 * БЕЗ необходимости выходить в чат с ботом и нажимать /start!
 */
export function requestTelegramWriteAccessIfNeeded({ force = false } = {}) {
  return new Promise((resolve) => {
    const tg = getWebApp();
    if (!tg || !isTelegramMiniApp()) {
      resolve({ ok: false, allowed: false, skipped: true });
      return;
    }
    const alreadyPm = Boolean(tg.initDataUnsafe?.user?.allows_write_to_pm) || _tgWriteAccessGranted;
    if (alreadyPm) {
      _tgWriteAccessGranted = true;
      resolve({ ok: true, allowed: true, alreadyAllowed: true });
      return;
    }
    if (_tgWriteAccessPrompted && !force) {
      resolve({ ok: true, allowed: false, skipped: true });
      return;
    }
    if (
      typeof tg.requestWriteAccess !== 'function' ||
      (typeof tg.isVersionAtLeast === 'function' && !tg.isVersionAtLeast('6.9'))
    ) {
      resolve({ ok: false, allowed: false, unsupported: true });
      return;
    }
    _tgWriteAccessPrompted = true;
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safetyTimer);
      resolve(payload);
    };
    const safetyTimer = window.setTimeout(() => {
      finish({ ok: false, allowed: false, timeout: true });
    }, 8000);
    try {
      tg.requestWriteAccess((allowed) => {
        if (allowed) _tgWriteAccessGranted = true;
        finish({ ok: true, allowed: Boolean(allowed) });
      });
    } catch {
      finish({ ok: false, allowed: false });
    }
  });
}

/**
 * Запрашивает верифицированный контакт игрока через системное окно Telegram `requestContact`.
 * В Telegram Mini App 6.9+ вызывает системный попап и автоматически доставляет контакт в @bochka_film_bot вебхук.
 * На старых клиентах или вне ТГ открывает @bochka_film_bot?start=verify_<giftId>.
 */
export function requestTelegramContact({ giftId = '' } = {}) {
  return new Promise((resolve) => {
    if (isTestBogSessionActive()) {
      resolve({
        ok: true,
        mode: 'testbog_sandbox',
        phone: '+79990001712',
      });
      return;
    }

    const tg = getWebApp();
    const canNative =
      tg &&
      isTelegramMiniApp() &&
      typeof tg.requestContact === 'function' &&
      (typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('6.9'));

    if (canNative) {
      try {
        tg.requestContact((shared, eventData) => {
          if (!shared) {
            resolve({ ok: false, reason: 'cancelled' });
            return;
          }
          const rawPhone =
            eventData?.responseUnsafe?.contact?.phone_number ||
            eventData?.contact?.phone_number ||
            '';
          resolve({
            ok: true,
            mode: 'webapp_native',
            phone: rawPhone ? (rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`) : '',
          });
        });
        return;
      } catch {
        /* fallback to bot chat below */
      }
    }

    const bot = ENV.tgBotUsername || 'bochka_film_bot';
    const verifyUrl = `https://t.me/${bot}?start=verify_${encodeURIComponent(giftId || 'ticket')}`;
    if (tg && typeof tg.openTelegramLink === 'function') {
      tg.openTelegramLink(verifyUrl);
    } else {
      window.open(verifyUrl, '_blank', 'noopener,noreferrer');
    }
    resolve({ ok: false, reason: 'opened_bot_chat', verifyUrl });
  });
}

let _hapticTimers = [];

function _clearHapticTimers() {
  for (const id of _hapticTimers) {
    try { clearTimeout(id); } catch { /* ignore */ }
  }
  _hapticTimers = [];
}

function _tgHaptic(kind, style) {
  const tg = getWebApp();
  if (!tg?.HapticFeedback) return;
  if (typeof tg.isVersionAtLeast === 'function' && !tg.isVersionAtLeast('6.1')) return;
  try {
    if (kind === 'impact') tg.HapticFeedback.impactOccurred(style);
    else if (kind === 'notification') tg.HapticFeedback.notificationOccurred(style);
    else if (kind === 'selection') tg.HapticFeedback.selectionChanged();
  } catch { /* ignore */ }
}

function _navVibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* ignore */ }
}

function _runTgSequence(steps = []) {
  _clearHapticTimers();
  for (const [delayMs, kind, style] of steps) {
    if (delayMs <= 0) {
      _tgHaptic(kind, style);
    } else {
      _hapticTimers.push(window.setTimeout(() => _tgHaptic(kind, style), delayMs));
    }
  }
}

export const Haptics = {
  light() {
    _tgHaptic('impact', 'light');
    _navVibrate(14);
  },
  medium() {
    _tgHaptic('impact', 'medium');
    _navVibrate(26);
  },
  heavy() {
    _tgHaptic('impact', 'heavy');
    _navVibrate([48, 20, 34]);
  },
  warning() {
    _tgHaptic('notification', 'warning');
    _navVibrate([32, 36, 32]);
  },
  error() {
    _tgHaptic('notification', 'error');
    _navVibrate([80, 30, 110]);
  },
  success() {
    _tgHaptic('notification', 'success');
    _navVibrate([28, 35, 55]);
  },
  // v8.1: Металлический удар ломом (двойная отдача в руку + Taptic iOS + Android rumble)
  crowbarHit() {
    _runTgSequence([
      [0, 'impact', 'rigid'],
      [48, 'impact', 'heavy'],
      [115, 'impact', 'medium'],
    ]);
    _navVibrate([65, 22, 48, 18, 26]);
  },
  // v8.1: Живой пульс при прослушке бочки (сердцебиение у цели / скрежет-тиканье у обманки)
  barrelListenPulse(isTarget = false) {
    if (isTarget) {
      _runTgSequence([
        [0, 'impact', 'soft'],
        [150, 'impact', 'medium'],
      ]);
      _navVibrate([28, 110, 44]);
    } else {
      _runTgSequence([
        [0, 'selection', ''],
        [90, 'impact', 'light'],
      ]);
      _navVibrate([16, 55, 22]);
    }
  },
  // v8.1: Тихая дрожь, когда в темноте сама шевелится / стучит «странная» бочка
  barrelEerie() {
    _runTgSequence([
      [0, 'impact', 'soft'],
      [110, 'impact', 'light'],
    ]);
    _navVibrate([22, 70, 28]);
  },
  // v8.1: Срыв крышки бочки (резкий хлопок)
  lidBlast() {
    _runTgSequence([
      [0, 'impact', 'heavy'],
      [55, 'impact', 'rigid'],
      [130, 'notification', 'error'],
    ]);
    _navVibrate([100, 28, 155, 30, 90]);
  },
  // v8.1: Полноценная хоррор-вибрация скримера (серия жёстких толчков 0.7 сек на iOS + Android)
  screamer(variant = 'saw_scream') {
    const key = String(variant || '');
    if (key === 'tesla_siren' || key === 'siren_cam') {
      _runTgSequence([
        [0, 'notification', 'error'],
        [75, 'impact', 'rigid'],
        [150, 'impact', 'heavy'],
        [240, 'impact', 'rigid'],
        [340, 'notification', 'error'],
        [460, 'impact', 'heavy'],
        [580, 'impact', 'rigid'],
      ]);
      _navVibrate([120, 30, 120, 30, 180, 35, 240, 30, 220]);
      return;
    }
    _runTgSequence([
      [0, 'impact', 'heavy'],
      [60, 'notification', 'error'],
      [140, 'impact', 'rigid'],
      [230, 'impact', 'heavy'],
      [350, 'notification', 'error'],
      [490, 'impact', 'heavy'],
    ]);
    _navVibrate([150, 35, 220, 35, 300, 40, 340]);
  },
};

export function toTelegramBotDeepLink(rawUrl = '') {
  const bot = ENV.tgBotUsername || 'bochka_film_bot';
  const str = String(rawUrl || '').trim();
  if (!str) return `https://t.me/${bot}?startapp=play`;
  if (str.startsWith(`https://t.me/${bot}`)) {
    return str.replace(`https://t.me/${bot}/${ENV.tgAppName || 'play'}?startapp=`, `https://t.me/${bot}?startapp=`);
  }
  try {
    const u = new URL(str, typeof window !== 'undefined' ? window.location.origin : 'https://bochka.quest');
    const b = u.searchParams.get('b');
    if (b) {
      const cleanB = b.startsWith('pack_') ? b : `pack_${b}`;
      return `https://t.me/${bot}?startapp=${encodeURIComponent(cleanB)}`;
    }
    const gift = u.searchParams.get('gift') || u.searchParams.get('pass');
    if (gift) {
      const cleanG = gift.startsWith('gift_') ? gift : `gift_${gift}`;
      return `https://t.me/${bot}?startapp=${encodeURIComponent(cleanG)}`;
    }
    const duel = u.searchParams.get('duel');
    if (duel) {
      const cleanD = duel.startsWith('duel_') ? duel : `duel_${duel}`;
      return `https://t.me/${bot}?startapp=${encodeURIComponent(cleanD)}`;
    }
    const ref = u.searchParams.get('ref');
    if (ref) {
      const cleanR = ref.startsWith('ref_') ? ref : `ref_${ref}`;
      return `https://t.me/${bot}?startapp=${encodeURIComponent(cleanR)}`;
    }
    const startapp = u.searchParams.get('startapp');
    if (startapp) {
      return `https://t.me/${bot}?startapp=${encodeURIComponent(startapp)}`;
    }
  } catch {
    /* ignore */
  }
  if (isTelegramMiniApp()) {
    return `https://t.me/${bot}?startapp=play`;
  }
  return str;
}

export function openTelegramShare(shareUrl, shareText) {
  const finalUrl = isTelegramMiniApp() ? toTelegramBotDeepLink(shareUrl) : shareUrl;
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(finalUrl)}&text=${encodeURIComponent(shareText)}`;
  const tg = getWebApp();
  // Только внутри настоящего Telegram: в обычном браузере openTelegramLink увёл бы всю страницу игры на t.me
  if (tg && isTelegramMiniApp() && typeof tg.openTelegramLink === 'function') {
    tg.openTelegramLink(tgShare);
    return;
  }
  window.open(tgShare, '_blank', 'noopener,noreferrer');
}

/**
 * v15.1: Нативная отправка карточки через Telegram WebApp.shareMessage(preparedId)
 * с автоматическим фоллбэком на Telegram.WebApp.openTelegramLink('https://t.me/share/url?...')
 */
export function openNativeTelegramShareCard({ preparedMessageId = '', shareUrl = '', shareText = '' } = {}) {
  const tg = getWebApp();
  if (preparedMessageId && tg && isTelegramMiniApp() && typeof tg.shareMessage === 'function') {
    try {
      tg.shareMessage(String(preparedMessageId), (sent) => {
        if (sent === false) {
          // Пользователь закрыл окно — никаких наград за отмену не выдаётся!
        }
      });
      return { mode: 'native_share_message', preparedMessageId: String(preparedMessageId) };
    } catch {
      // Фоллбэк на классическую ссылку для старых клиентов Telegram
    }
  }
  openTelegramShare(shareUrl, shareText);
  return { mode: 'share_url_fallback', preparedMessageId: '' };
}

/**
 * Асинхронная обёртка над Telegram shareMessage / t.me/share/url, которая ждёт реального подтверждения
 * (sent === true) или честно ловит нажатие «✕» / быстрый отказ (< minReturnMs), чтобы не выдавать жизни без отправки.
 */
export function openNativeTelegramShareCardWithConfirmation({
  preparedMessageId = '',
  shareUrl = '',
  shareText = '',
  minReturnMs = 2200,
} = {}) {
  const tg = getWebApp();
  if (preparedMessageId && tg && isTelegramMiniApp() && typeof tg.shareMessage === 'function') {
    return new Promise((resolve) => {
      let settled = false;
      const done = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };
      const guardTimer = window.setTimeout(() => {
        done({ ok: false, sent: false, cancelled: true, mode: 'native_share_timeout', preparedMessageId: String(preparedMessageId) });
      }, 20000);
      try {
        tg.shareMessage(String(preparedMessageId), (sent) => {
          window.clearTimeout(guardTimer);
          const confirmed = sent !== false;
          done({
            ok: confirmed,
            sent: confirmed,
            cancelled: !confirmed,
            mode: 'native_share_message',
            preparedMessageId: String(preparedMessageId),
          });
        });
      } catch {
        window.clearTimeout(guardTimer);
        openTelegramShare(shareUrl, shareText);
        done({ ok: true, sent: true, cancelled: false, mode: 'share_url_fallback', preparedMessageId: '' });
      }
    });
  }

  const openedAt = Date.now();
  openTelegramShare(shareUrl, shareText);
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve({ ok: true, sent: true, cancelled: false, mode: 'share_url_fallback', preparedMessageId: '' });
  }

  return new Promise((resolve) => {
    let settled = false;
    let sawLeave = document.visibilityState === 'hidden';
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
    const finish = (confirmed, mode) => {
      if (settled) return;
      settled = true;
      cleanup();
      window.clearTimeout(noLeaveTimer);
      window.clearTimeout(maxWaitTimer);
      resolve({
        ok: confirmed,
        sent: confirmed,
        cancelled: !confirmed,
        mode,
        preparedMessageId: '',
      });
    };
    const evaluateReturn = () => {
      const elapsed = Date.now() - openedAt;
      if (elapsed < minReturnMs) {
        finish(false, 'share_url_fast_cancel');
      } else {
        finish(true, 'share_url_fallback');
      }
    };
    const onBlur = () => {
      sawLeave = true;
    };
    const onFocus = () => {
      if (sawLeave) evaluateReturn();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        sawLeave = true;
      } else if (document.visibilityState === 'visible' && sawLeave) {
        evaluateReturn();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    const noLeaveTimer = window.setTimeout(() => {
      if (!sawLeave) finish(true, 'share_url_fallback');
    }, 1500);
    const maxWaitTimer = window.setTimeout(() => {
      finish(true, 'share_url_fallback');
    }, 15000);
  });
}

export function openWhatsAppShare(shareUrl, shareText) {
  const full = `${shareText}\n${shareUrl}`;
  openExternalLink(`https://api.whatsapp.com/send?text=${encodeURIComponent(full)}`);
}

export function openVkShare(shareUrl, shareText) {
  openExternalLink(
    `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`
  );
}

export async function openInstagramShareFlow({ url, text, posterBlob = null }) {
  await copyToClipboard(`${text} ${url}`);
  if (posterBlob && navigator.canShare) {
    try {
      const file = new File([posterBlob], 'bochka-story-9x16.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'БОЧКА — В кино с 17 декабря',
          text: `${text} ${url}`,
        });
        return 'shared_story';
      }
    } catch { /* fallback below */ }
  }
  if (posterBlob) {
    const objUrl = URL.createObjectURL(posterBlob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = 'bochka-instagram-story-9x16.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  }
  openExternalLink('https://www.instagram.com/');
  return 'copied_and_opened';
}

export async function shareNativeOrFallback({ title, text, url }) {
  if (navigator.share && !isTelegramMiniApp()) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'aborted';
    }
  }
  if (isTelegramMiniApp()) {
    openTelegramShare(url, text);
    return 'telegram';
  }
  const copied = await copyToClipboard(url);
  return copied ? 'copied' : 'failed';
}

export async function copyToClipboard(str) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch { /* fallback below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

export function promptAddToHomeScreenSafe() {
  const tg = getWebApp();
  if (tg && isTelegramMiniApp() && typeof tg.addToHomeScreen === 'function') {
    try {
      tg.addToHomeScreen();
      return { ok: true, mode: 'tg_native' };
    } catch {
      /* fallback below */
    }
  }
  return { ok: true, mode: 'browser_fallback' };
}

export function openExternalLink(url) {
  const tg = getWebApp();
  if (tg && isTelegramMiniApp() && typeof tg.openLink === 'function') {
    try {
      tg.openLink(url);
      return;
    } catch { /* fallback */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
