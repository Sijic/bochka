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
      trafficSource: '',
    };
    const clean = String(raw || '').trim();
    if (!clean) return res;
    if (clean === 'giftfork') {
      res.openGiftFork = true;
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
      trafficSource,
    };
  }

  try {
    if (typeof tg.ready === 'function') tg.ready();
    if (typeof tg.expand === 'function') tg.expand();
    if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
    const hasVer = (v) => typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast(v);
    if (hasVer('6.1') && typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#0d0d0d');
    if (hasVer('6.1') && typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#0d0d0d');
  } catch {
    /* ignore older client methods */
  }

  const u = tg.initDataUnsafe?.user || null;
  const rawStart = tg.initDataUnsafe?.start_param || rawUrlStart;
  const parsed = parseStartTokens(rawStart);
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
    startParam: parsed.barrelParam,
    autoOpenPack: Boolean(parsed.autoOpenPack || (inTg && parsed.barrelParam)),
    passParam: urlGift || parsed.passParam,
    duelRoomParam: urlExtras.duel || parsed.duelRoomParam,
    watchBarrelParam: urlExtras.watch || parsed.watchBarrelParam,
    trailerAutoOpen: urlExtras.trailer || parsed.trailerAutoOpen,
    trailerRefUid: urlExtras.ref || parsed.trailerRefUid,
    openGiftFork: urlExtras.giftfork || parsed.openGiftFork,
    trafficSource,
  };
}

function extractUrlExtraParams() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return {
      duel: (sp.get('duel') || '').trim(),
      watch: (sp.get('watch') || '').trim(),
      trailer: sp.get('trailer') === '1',
      ref: (sp.get('ref') || '').trim(),
      src: (sp.get('src') || '').trim(),
      utm: (sp.get('utm') || sp.get('utm_source') || sp.get('utm_campaign') || '').trim(),
      giftfork: sp.get('giftfork') === '1',
    };
  } catch {
    return { duel: '', watch: '', trailer: false, ref: '', src: '', utm: '', giftfork: false };
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
    if (window.location.hash && window.location.hash.includes('b=')) {
      const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      return (hp.get('b') || '').trim();
    }
  } catch {
    /* ignore */
  }
  return '';
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

export const Haptics = {
  light() {
    const tg = getWebApp();
    try {
      if (tg?.HapticFeedback && isTelegramMiniApp()) {
        tg.HapticFeedback.impactOccurred('light');
        return;
      }
    } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(10);
  },
  medium() {
    const tg = getWebApp();
    try {
      if (tg?.HapticFeedback && isTelegramMiniApp()) {
        tg.HapticFeedback.impactOccurred('medium');
        return;
      }
    } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(22);
  },
  heavy() {
    const tg = getWebApp();
    try {
      if (tg?.HapticFeedback && isTelegramMiniApp()) {
        tg.HapticFeedback.impactOccurred('heavy');
        return;
      }
    } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate([38, 18, 28]);
  },
  error() {
    const tg = getWebApp();
    try {
      if (tg?.HapticFeedback && isTelegramMiniApp()) {
        tg.HapticFeedback.notificationOccurred('error');
        return;
      }
    } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate([65, 30, 85]);
  },
  success() {
    const tg = getWebApp();
    try {
      if (tg?.HapticFeedback && isTelegramMiniApp()) {
        tg.HapticFeedback.notificationOccurred('success');
        return;
      }
    } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate([25, 35, 45]);
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
  if (tg && typeof tg.openTelegramLink === 'function') {
    tg.openTelegramLink(tgShare);
    return;
  }
  window.open(tgShare, '_blank', 'noopener,noreferrer');
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
