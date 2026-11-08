/* Сетевой слой синхронизации с Firebase Cloud Functions и Firestore.
   - Если ключи CONFIG.firebase в config.js не заполнены — игра работает полностью локально через localStorage без ошибок в консоли.
   - Если CONFIG.firebase заполнен — инициализирует Firebase, авторизует игрока (Telegram initData -> telegramLogin или анонимно),
     вызывает bootstrap, отправляет батчи действий в gameAction и подтягивает реальный рейтинг из коллекции leaderboard. */
import { CONFIG } from './config.js';
import { S, save, applyServerState, setActionHook } from './state.js';
import { monthKey, weekKey } from './shared/economy.js';

export const net = {
  online: false,
  uid: null,
  profile: null,
  leaders: null,
  period: 'all',
  queue: [],
  flushing: false,
  fns: null,
  db: null,
  firestoreMod: null,
};

export function isFirebaseConfigured() {
  const f = CONFIG?.firebase;
  return Boolean(f && f.apiKey && f.projectId && f.appId);
}

let flushTimer = 0;

export function queueAction(action) {
  if (!net.online || !net.fns) return;
  net.queue.push({ ...action, at: action.at || Date.now() });
  if (net.queue.length >= 8) {
    flushActions();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      flushActions();
    }, 1200);
  }
}

export async function flushActions() {
  if (!net.online || !net.fns || net.flushing || !net.queue.length) return;
  net.flushing = true;
  const batch = net.queue.splice(0, 12);
  try {
    const res = await net.fns.gameAction({ actions: batch });
    if (res?.data?.state) {
      applyServerState(res.data.state, res.data.profile);
      if (res.data.profile) net.profile = res.data.profile;
      document.dispatchEvent(new CustomEvent('net-sync'));
    }
  } catch (e) {
    /* Return failed batch to the front if transient (capped at 24) */
    net.queue = [...batch, ...net.queue].slice(0, 24);
  } finally {
    net.flushing = false;
    if (net.queue.length) {
      flushTimer = setTimeout(() => { flushTimer = 0; flushActions(); }, 1500);
    }
  }
}

export async function refreshLeaderboard(period = net.period || 'all') {
  net.period = period;
  if (!net.online || !net.db || !net.firestoreMod) return null;
  try {
    const { collection, query, orderBy, limit, getDocs } = net.firestoreMod;
    const now = Date.now();
    const path = period === 'month'
      ? `leaderboardPeriods/m_${monthKey(now)}/entries`
      : period === 'week'
        ? `leaderboardPeriods/w_${weekKey(now)}/entries`
        : 'leaderboard';
    const q = query(collection(net.db, path), orderBy('score', 'desc'), limit(10));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        uid: docSnap.id,
        n: d.alias || 'PLAYER',
        s: Number(d.score) || 0,
        level: Number(d.level) || 1,
        me: docSnap.id === net.uid,
      });
    });
    if (list.length) {
      net.leaders = list;
      document.dispatchEvent(new CustomEvent('net-sync'));
    }
    return list;
  } catch {
    return null;
  }
}

export async function refreshFriends() {
  if (!net.online || !net.fns) return null;
  try {
    const res = await net.fns.getFriends({});
    const friends = res?.data?.friends;
    if (Array.isArray(friends)) {
      S.refs = friends.map((f) => ({
        name: f.alias || 'PLAYER',
        commission: f.commission || 0,
        ts: f.qualifiedAt || Date.now(),
      }));
      save();
      document.dispatchEvent(new CustomEvent('net-sync'));
    }
    return friends;
  } catch {
    return null;
  }
}

export async function syncShareInvitation() {
  if (!net.online || !net.fns) return false;
  try {
    const res = await net.fns.shareInvitation({});
    if (res?.data?.state) applyServerState(res.data.state, res.data.profile);
    document.dispatchEvent(new CustomEvent('net-sync'));
    return Boolean(res?.data?.rewarded);
  } catch {
    return false;
  }
}

export async function syncSaveProfile(payload) {
  if (!net.online || !net.fns) return { ok: false, offline: true };
  try {
    const res = await net.fns.saveProfile(payload);
    if (res?.data?.profile) net.profile = res.data.profile;
    return { ok: true, profile: res?.data?.profile };
  } catch (e) {
    return { ok: false, error: e?.message || 'error' };
  }
}

export async function syncGetMedia(key) {
  if (!net.online || !net.fns) return null;
  try {
    const res = await net.fns.getMedia({ key });
    return res?.data || null;
  } catch {
    return null;
  }
}

export async function initNet() {
  setActionHook(queueAction);
  if (!isFirebaseConfigured()) {
    net.online = false;
    return { online: false };
  }
  try {
    const CDN = 'https://www.gstatic.com/firebasejs/11.0.2';
    const [appMod, authMod, fnMod, fsMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-functions.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);

    const app = appMod.initializeApp(CONFIG.firebase);

    if (CONFIG.appCheckSiteKey) {
      try {
        const acMod = await import(`${CDN}/firebase-app-check.js`);
        acMod.initializeAppCheck(app, {
          provider: new acMod.ReCaptchaV3Provider(CONFIG.appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch { /* ignore AppCheck error if not loaded */ }
    }

    const auth = authMod.getAuth(app);
    const functions = fnMod.getFunctions(app, CONFIG.region || 'europe-west1');
    const db = fsMod.getFirestore(app);
    const call = (name) => fnMod.httpsCallable(functions, name);

    net.fns = {
      telegramLogin: call('telegramLogin'),
      bootstrap: call('bootstrap'),
      gameAction: call('gameAction'),
      shareInvitation: call('shareInvitation'),
      getFriends: call('getFriends'),
      saveProfile: call('saveProfile'),
      getMedia: call('getMedia'),
    };
    net.db = db;
    net.firestoreMod = fsMod;

    /* 1. Авторизация: Telegram initData -> telegramLogin или анонимный вход */
    const initData = window.Telegram?.WebApp?.initData;
    if (initData && typeof initData === 'string' && initData.length > 10) {
      try {
        const tgRes = await net.fns.telegramLogin({ initData });
        if (tgRes?.data?.token) {
          await authMod.signInWithCustomToken(auth, tgRes.data.token);
        }
      } catch {
        if (!auth.currentUser) await authMod.signInAnonymously(auth);
      }
    } else if (!auth.currentUser) {
      await authMod.signInAnonymously(auth);
    }

    net.uid = auth.currentUser?.uid || null;
    if (!net.uid) return { online: false };

    /* 2. Bootstrap профиля и состояния */
    const refParam = new URLSearchParams(location.search).get('ref') || S.cameFrom || '';
    const bootRes = await net.fns.bootstrap({ ref: refParam });
    if (bootRes?.data?.state) {
      applyServerState(bootRes.data.state, bootRes.data.profile);
      net.profile = bootRes.data.profile || null;
    }

    net.online = true;
    await Promise.all([refreshLeaderboard(), refreshFriends()]);
    document.dispatchEvent(new CustomEvent('net-sync'));
    return { online: true, uid: net.uid };
  } catch {
    net.online = false;
    return { online: false };
  }
}
