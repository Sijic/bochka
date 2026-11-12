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
  const app = ENV.tgAppName || 'play';
  const base = `https://t.me/${bot}/${app}`;
  return param ? `${base}?startapp=${encodeURIComponent(param)}` : base;
}

export function isAdminModeRequested() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('mode') === 'admin' || sp.get('admin') === '1';
  } catch {
    return false;
  }
}

export function initTelegram() {
  const tg = getWebApp();
  const rawUrlStart = extractUrlBarrelParam();
  const urlGift = extractUrlPassParam();

  const parseStartTokens = (raw) => {
    if (!raw) return { barrelParam: '', passParam: '' };
    if (raw.startsWith('gift_')) return { barrelParam: '', passParam: raw.slice(5) };
    if (raw.startsWith('pass_')) return { barrelParam: '', passParam: raw.slice(5) };
    return { barrelParam: raw, passParam: '' };
  };

  if (!tg) {
    const parsed = parseStartTokens(rawUrlStart);
    return {
      inTelegram: false,
      user: null,
      startParam: parsed.barrelParam,
      passParam: urlGift || parsed.passParam,
    };
  }

  try {
    tg.ready();
    tg.expand();
    const hasVer = (v) => typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast(v);
    if (hasVer('6.1') && typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#0d0d0d');
    if (hasVer('6.1') && typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#0d0d0d');
    if (hasVer('7.7') && typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
  } catch {
    /* ignore older client methods */
  }

  const u = tg.initDataUnsafe?.user || null;
  const rawStart = tg.initDataUnsafe?.start_param || rawUrlStart;
  const parsed = parseStartTokens(rawStart);

  return {
    inTelegram: Boolean(tg.initData && tg.initData.length > 0),
    user: u
      ? {
          id: String(u.id),
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '',
          username: u.username || '',
          photoUrl: u.photo_url || '',
          lang: u.language_code || '',
        }
      : null,
    startParam: parsed.barrelParam,
    passParam: urlGift || parsed.passParam,
  };
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

export function openTelegramShare(shareUrl, shareText) {
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
  const tg = getWebApp();
  if (tg && isTelegramMiniApp() && typeof tg.openTelegramLink === 'function') {
    tg.openTelegramLink(tgShare);
    return;
  }
  window.open(tgShare, '_blank', 'noopener,noreferrer');
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
