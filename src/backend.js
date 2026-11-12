import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';

const PACKS_STORAGE_KEY = 'bochka_v2_packs';
const QUEST_STORAGE_KEY = 'bochka_v2_quest';
const UID_STORAGE_KEY = 'bochka_v2_uid';

export const supabase =
  ENV.supabaseUrl && ENV.supabaseAnonKey
    ? createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
        auth: { persistSession: false },
      })
    : null;

export function isSupabaseActive() {
  return Boolean(supabase);
}

export function getViewerUid(tgUser = null) {
  if (tgUser?.id) return `tg_${tgUser.id}`;
  let uid = safeRead(UID_STORAGE_KEY, '');
  if (!uid) {
    uid = 'u_' + randomShortId(10);
    safeWrite(UID_STORAGE_KEY, uid);
  }
  return uid;
}

export function randomShortId(len = 7) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[arr[i] % chars.length];
  }
  return out;
}

function encodeBase64Url(obj) {
  try {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function decodeBase64Url(b64) {
  try {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Создаёт упакованную бочку: загружает сжатый 600x600 WebP (< 80 КБ) в Supabase Storage
 * и пишет метаданные в таблицу `barrels`, либо прозрачно работает через localStorage + base64url.
 */
export async function createBarrelPack({
  mode = 'friend',
  message = '',
  frameStyle = 'flashlight',
  senderName = '',
  tgUser = null,
  processedImage,
}) {
  const id = randomShortId(7);
  const targetIndex = Math.floor(Math.random() * 6);
  const senderUid = getViewerUid(tgUser);
  const senderTgId = tgUser?.id || '';
  const cleanMsg = (message || '').trim().slice(0, 45);
  const cleanSender = (senderName || tgUser?.name || '').trim().slice(0, 28);

  let remotePhotoUrl = '';
  let storedInCloud = false;

  if (supabase && processedImage?.blob) {
    try {
      const filePath = `${id}.webp`;
      const { error: upErr } = await supabase.storage
        .from(ENV.supabaseBucket)
        .upload(filePath, processedImage.blob, {
          contentType: processedImage.blob.type || 'image/webp',
          cacheControl: '604800',
          upsert: true,
        });

      if (!upErr) {
        const { data: pubData } = supabase.storage.from(ENV.supabaseBucket).getPublicUrl(filePath);
        remotePhotoUrl = pubData?.publicUrl || '';
      }

      const { error: insErr } = await supabase.from('barrels').insert({
        id,
        mode,
        message: cleanMsg,
        photo_url: remotePhotoUrl || processedImage.microDataUrl || '',
        frame_style: frameStyle,
        target_index: targetIndex,
        sender_uid: senderUid,
        sender_tg_id: senderTgId || null,
        sender_name: cleanSender,
      });

      if (!insErr) {
        storedInCloud = true;
      }
    } catch {
      storedInCloud = false;
    }
  }

  // Всегда сохраняем локальную копию в localStorage (для мгновенного локального теста и учёта своих бочек)
  const localPacks = readLocalPacks();
  localPacks[id] = {
    id,
    mode,
    message: cleanMsg,
    photoUrl: remotePhotoUrl || processedImage?.dataUrl || '',
    frameStyle,
    targetIndex,
    senderUid,
    senderTgId,
    senderName: cleanSender,
    openedCount: 0,
    createdAt: Date.now(),
  };
  // Храним последние 12 бочек, чтобы не переполнять квоту localStorage
  const keys = Object.keys(localPacks);
  if (keys.length > 12) {
    keys
      .sort((a, b) => (localPacks[a].createdAt || 0) - (localPacks[b].createdAt || 0))
      .slice(0, keys.length - 12)
      .forEach((oldKey) => delete localPacks[oldKey]);
  }
  safeWriteJson(PACKS_STORAGE_KEY, localPacks);

  // Отмечаем в прогрессе квеста, что игрок закатал друга (разблокирует эксклюзивный видеокружок!)
  const q = getQuestState();
  q.packedCount = (q.packedCount || 0) + 1;
  q.myBarrelIds = Array.from(new Set([...(q.myBarrelIds || []), id])).slice(-25);
  saveQuestState(q);

  // Формируем короткую или самодостаточную fallback-ссылку
  const baseOrigin = resolveShareBaseUrl();
  let shareParam = id;
  if (!storedInCloud) {
    const compactPayload = encodeBase64Url({
      m: mode === 'self' ? 's' : 'f',
      msg: cleanMsg,
      t: targetIndex,
      f: frameStyle,
      sn: cleanSender,
      stg: senderTgId,
      su: senderUid,
      img: processedImage?.microDataUrl || '',
    });
    if (compactPayload) {
      shareParam = `${id}.${compactPayload}`;
    }
  }

  const webUrl = `${baseOrigin}${baseOrigin.includes('?') ? '&' : '?'}b=${encodeURIComponent(shareParam)}`;
  const tgMiniAppUrl =
    ENV.tgBotUsername && storedInCloud
      ? `https://t.me/${ENV.tgBotUsername}/${ENV.tgAppName}?startapp=${encodeURIComponent(id)}`
      : webUrl;

  return {
    id,
    targetIndex,
    storedInCloud,
    shareUrl: tgMiniAppUrl,
    webUrl,
    pack: localPacks[id],
  };
}

function resolveShareBaseUrl() {
  if (typeof window !== 'undefined') {
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.protocol.startsWith('http')) {
      return `${loc.origin}${loc.pathname}`;
    }
  }
  return `${ENV.publicUrl.replace(/\/+$/, '')}/`;
}

/**
 * Загружает данные загаданной бочки по параметру ?b=ID или startapp=ID
 */
export async function loadBarrelPack(rawParam) {
  if (!rawParam) return null;
  let decodedParam = rawParam;
  try {
    decodedParam = decodeURIComponent(rawParam);
  } catch { /* keep as is */ }

  const dotIdx = decodedParam.indexOf('.');
  const id = dotIdx > 0 ? decodedParam.slice(0, dotIdx) : decodedParam;
  const inlineToken = dotIdx > 0 ? decodedParam.slice(dotIdx + 1) : '';

  // 1. Пробуем получить из Supabase таблицы `barrels`
  if (supabase && id) {
    try {
      const { data, error } = await supabase
        .from('barrels')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          mode: data.mode || 'friend',
          message: data.message || '',
          photoUrl: data.photo_url || '',
          frameStyle: data.frame_style || 'flashlight',
          targetIndex: Number.isInteger(data.target_index) ? data.target_index : 0,
          senderUid: data.sender_uid || '',
          senderTgId: data.sender_tg_id || '',
          senderName: data.sender_name || '',
          openedCount: data.opened_count || 0,
        };
      }
    } catch { /* fallback below */ }
  }

  // 2. Проверяем локальное хранилище (даёт полное качество 600x600 WebP при локальном тесте)
  const localPacks = readLocalPacks();
  if (localPacks[id]) {
    return { ...localPacks[id] };
  }

  // 3. Декодируем base64url-параметр из ссылки (работает между разными устройствами даже без ключей БД!)
  if (inlineToken) {
    const payload = decodeBase64Url(inlineToken);
    if (payload) {
      return {
        id,
        mode: payload.m === 's' ? 'self' : 'friend',
        message: payload.msg || '',
        photoUrl: payload.img || '',
        frameStyle: payload.f || 'flashlight',
        targetIndex: typeof payload.t === 'number' && payload.t >= 0 && payload.t < 6 ? payload.t : 2,
        senderUid: payload.su || '',
        senderTgId: payload.stg || '',
        senderName: payload.sn || '',
        openedCount: 0,
      };
    }
  }

  // 4. Если передан произвольный короткий демо-ID (например ?b=test), создаём тестовую капсулу
  const fallbackTarget = Math.abs(hashCode(id)) % 6;
  return {
    id,
    mode: 'friend',
    message: 'Вытащишь меня — идём на «Бочку» 17 декабря',
    photoUrl: '',
    frameStyle: 'flashlight',
    targetIndex: fallbackTarget,
    senderUid: 'demo_sender',
    senderTgId: '',
    senderName: '',
    openedCount: 0,
  };
}

/**
 * Фиксирует финал раунда получателя в Supabase + шлёт уведомление отправителю через Telegram Bot API
 */
export async function recordBarrelResult(pack, { survived, attemptsUsed, timeLeft, viewerTgUser = null }) {
  if (!pack || !pack.id) return { notified: false };

  const viewerUid = getViewerUid(viewerTgUser);
  const openedGuardKey = `bochka_v2_opened_${pack.id}`;
  const alreadyOpenedByMe = safeRead(openedGuardKey, '') === '1';
  const isSelfOpen = Boolean(pack.senderUid && pack.senderUid === viewerUid);

  safeWrite(openedGuardKey, '1');

  const nextOpenedCount = !alreadyOpenedByMe && !isSelfOpen ? (pack.openedCount || 0) + 1 : (pack.openedCount || 0);

  if (supabase) {
    try {
      await supabase
        .from('barrels')
        .update({
          opened_count: nextOpenedCount,
          survived,
          attempts_used: attemptsUsed,
          time_left: Number(timeLeft.toFixed(1)),
          last_opened_at: new Date().toISOString(),
        })
        .eq('id', pack.id);
    } catch { /* ignore */ }
  }

  // Обновляем локальный кеш
  const localPacks = readLocalPacks();
  if (localPacks[pack.id]) {
    localPacks[pack.id].openedCount = nextOpenedCount;
    localPacks[pack.id].survived = survived;
    localPacks[pack.id].attemptsUsed = attemptsUsed;
    localPacks[pack.id].timeLeft = Number(timeLeft.toFixed(1));
    safeWriteJson(PACKS_STORAGE_KEY, localPacks);
  }

  const readerName = viewerTgUser?.name || 'Твой друг';
  const notifyText = survived
    ? `🛢 БОЧКА: ${readerName} открыл бочку с ${attemptsUsed}-й попытки! (Воздуха оставалось: ${Math.ceil(timeLeft)} сек.)`
    : `💀 БОЧКА: ${readerName} вскрыл 3 пустые бочки и остался в цеху Корпуса Б!`;

  const notified = await sendTelegramPing({
    chatId: pack.senderTgId,
    text: notifyText,
    event: 'barrel_opened',
    barrelId: pack.id,
    survived,
    attemptsUsed,
    timeLeft,
  });

  return { notified };
}

/**
 * Отправляет ответ в 1 клик «ИДЁМ В КИНО 17 ДЕКАБРЯ!» первому игроку
 */
export async function sendCinemaInviteReply(pack, viewerTgUser = null) {
  if (pack?.id && supabase) {
    try {
      await supabase.from('barrels').update({ replied_cinema: true }).eq('id', pack.id);
    } catch { /* ignore */ }
  }

  const readerName = viewerTgUser?.name || 'Друг';
  const text = `🎬 БОЧКА (17 декабря): ${readerName} ответил из цеха — «Идём в кино 17 декабря! Бери билеты!»`;

  return sendTelegramPing({
    chatId: pack?.senderTgId || '',
    text,
    event: 'cinema_reply',
    barrelId: pack?.id || '',
  });
}

async function sendTelegramPing(payload) {
  // 1. Предпочтительный продакшн-путь: серверный webhook / Supabase Edge Function
  if (ENV.tgNotifyWebhook) {
    try {
      const res = await fetch(ENV.tgNotifyWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch { /* fallback below */ }
  }

  // 2. Прямой вызов Telegram Bot API (если передан sender chat_id и токен бота в .env)
  if (ENV.tgBotToken && payload.chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${ENV.tgBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: payload.chatId,
          text: payload.text,
          disable_web_page_preview: true,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Управление жетонами цеха («Крышки») с защитой от накруток
 */
export function getQuestState() {
  const def = {
    trailerDone: false,
    kinopoiskDone: false,
    friendsOpened: 0,
    packedCount: 0,
    myBarrelIds: [],
  };
  const saved = safeReadJson(QUEST_STORAGE_KEY, null);
  return saved ? { ...def, ...saved } : def;
}

function saveQuestState(state) {
  safeWriteJson(QUEST_STORAGE_KEY, state);
}

export function markTrailerCompleted() {
  const s = getQuestState();
  if (!s.trailerDone) {
    s.trailerDone = true;
    saveQuestState(s);
  }
  return computeTotalTokens(s);
}

export function markKinopoiskVisited() {
  const s = getQuestState();
  if (!s.kinopoiskDone) {
    s.kinopoiskDone = true;
    saveQuestState(s);
  }
  return computeTotalTokens(s);
}

export async function syncFriendsOpenedTokens(tgUser = null) {
  const s = getQuestState();
  const uid = getViewerUid(tgUser);

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('barrels')
        .select('opened_count')
        .eq('sender_uid', uid);

      if (!error && Array.isArray(data)) {
        const openedBarrels = data.reduce((acc, row) => acc + Math.min(5, row.opened_count || 0), 0);
        s.friendsOpened = Math.max(s.friendsOpened || 0, openedBarrels);
        saveQuestState(s);
      }
    } catch { /* ignore */ }
  } else {
    const localPacks = readLocalPacks();
    let localOpened = 0;
    for (const id of s.myBarrelIds || []) {
      if (localPacks[id]?.openedCount > 0) localOpened += localPacks[id].openedCount;
    }
    s.friendsOpened = Math.max(s.friendsOpened || 0, localOpened);
    saveQuestState(s);
  }

  return {
    ...s,
    totalTokens: computeTotalTokens(s),
  };
}

export function computeTotalTokens(state = getQuestState()) {
  let total = 0;
  if (state.trailerDone) total += 1;
  if (state.kinopoiskDone) total += 1;
  total += (state.friendsOpened || 0) * 2;
  return total;
}

function readLocalPacks() {
  return safeReadJson(PACKS_STORAGE_KEY, {}) || {};
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

function safeRead(k, fallback = '') {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch { /* ignore */ }
}

function safeReadJson(k, fallback = null) {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(k, obj) {
  try {
    localStorage.setItem(k, JSON.stringify(obj));
  } catch { /* ignore */ }
}
