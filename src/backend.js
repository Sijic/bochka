import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';
import { saveLocalPackMedia, loadLocalPackMedia } from './voice.js';

const PACKS_STORAGE_KEY = 'bochka_v2_packs';
const QUEST_STORAGE_KEY = 'bochka_v2_quest';
const UID_STORAGE_KEY = 'bochka_v2_uid';
const NIGHT_SHIFT_COOLDOWN_MS = 10 * 60 * 1000; // 10 минут между бесплатными сменами (либо мгновенно за друга)

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

/**
 * Оставлено ТОЛЬКО для обратной совместимости со старыми ссылками прототипа (.eyJ...)
 */
function decodeLegacyBase64Url(b64) {
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
 * Создаёт упакованную бочку:
 * - грузит портрет 512x512 WebP (<= 60 КБ) и голосовое Opus/WebM (<= 40 КБ) в Supabase Storage,
 * - сохраняет запись в public.barrels с коротким 7-буквенным ID,
 * - дублирует медиа в IndexedDB для мгновенного локального теста,
 * - ВСЕГДА возвращает чистую короткую ссылку вида https://bochka.quest/?b=jakaqgx (без base64-хвостов!).
 */
export async function createBarrelPack({
  mode = 'friend',
  message = '',
  frameStyle = 'flashlight',
  senderName = '',
  tgUser = null,
  processedImage,
  recordedVoice = null,
}) {
  const id = randomShortId(7);
  const targetIndex = Math.floor(Math.random() * 6);
  const senderUid = getViewerUid(tgUser);
  const senderTgId = tgUser?.id || '';
  const cleanMsg = (message || '').trim().slice(0, 45);
  const cleanSender = (senderName || tgUser?.name || '').trim().slice(0, 28);

  let remotePhotoUrl = '';
  let remoteVoiceUrl = '';
  let storedInCloud = false;

  if (supabase) {
    try {
      if (processedImage?.blob) {
        const photoPath = `portraits/${id}.webp`;
        const { error: upErr } = await supabase.storage
          .from(ENV.supabaseBucket)
          .upload(photoPath, processedImage.blob, {
            contentType: processedImage.blob.type || 'image/webp',
            cacheControl: '604800',
            upsert: true,
          });

        if (!upErr) {
          const { data: pubData } = supabase.storage.from(ENV.supabaseBucket).getPublicUrl(photoPath);
          remotePhotoUrl = pubData?.publicUrl || '';
        }
      }

      if (recordedVoice?.blob) {
        const ext = recordedVoice.ext || 'webm';
        const voicePath = `voices/${id}.${ext}`;
        const { error: vErr } = await supabase.storage
          .from(ENV.supabaseBucket)
          .upload(voicePath, recordedVoice.blob, {
            contentType: recordedVoice.mimeType || 'audio/webm',
            cacheControl: '604800',
            upsert: true,
          });

        if (!vErr) {
          const { data: vPub } = supabase.storage.from(ENV.supabaseBucket).getPublicUrl(voicePath);
          remoteVoiceUrl = vPub?.publicUrl || '';
        }
      }

      const { error: insErr } = await supabase.from('barrels').insert({
        id,
        mode,
        message: cleanMsg,
        photo_url: remotePhotoUrl,
        voice_url: remoteVoiceUrl,
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

  // Бинарные блобы фото и голоса кладём в IndexedDB (для локальной проверки без раздутия localStorage)
  await saveLocalPackMedia(id, {
    photoBlob: processedImage?.blob || null,
    voiceBlob: recordedVoice?.blob || null,
  });

  // Компактные метаданные в localStorage
  const localPacks = readLocalPacks();
  localPacks[id] = {
    id,
    mode,
    message: cleanMsg,
    photoUrl: remotePhotoUrl || '',
    voiceUrl: remoteVoiceUrl || '',
    hasLocalMedia: true,
    frameStyle,
    targetIndex,
    senderUid,
    senderTgId,
    senderName: cleanSender,
    openedCount: 0,
    createdAt: Date.now(),
  };

  const keys = Object.keys(localPacks);
  if (keys.length > 20) {
    keys
      .sort((a, b) => (localPacks[a].createdAt || 0) - (localPacks[b].createdAt || 0))
      .slice(0, keys.length - 20)
      .forEach((oldKey) => delete localPacks[oldKey]);
  }
  safeWriteJson(PACKS_STORAGE_KEY, localPacks);

  // Фиксируем упаковку друга (шаг 1 для разблокировки Золотой бочки + видеокружка со съёмок + доп. смена)
  const q = getQuestState();
  q.packedCount = (q.packedCount || 0) + 1;
  q.bonusShifts = (q.bonusShifts || 0) + 1;
  q.myBarrelIds = Array.from(new Set([...(q.myBarrelIds || []), id])).slice(-25);
  saveQuestState(q);

  // СТРОГО чистая короткая ссылка вида https://bochka.quest/?b=jakaqgx (никакого base64 в URL!)
  const baseOrigin = resolveShareBaseUrl();
  const sep = baseOrigin.includes('?') ? '&' : '?';
  const webUrl = `${baseOrigin}${sep}b=${encodeURIComponent(id)}`;
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
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `${loc.origin}${loc.pathname}`;
    }
    if (loc.protocol.startsWith('http') && loc.hostname) {
      return `${loc.origin}${loc.pathname}`;
    }
  }
  return `${ENV.publicUrl.replace(/\/+$/, '')}/`;
}

/**
 * Загружает данные загаданной бочки по параметру ?b=jakaqgx или startapp=jakaqgx
 * (поддерживает и старые ссылки с точкой для обратной совместимости)
 */
export async function loadBarrelPack(rawParam) {
  if (!rawParam) return null;
  let decodedParam = rawParam;
  try {
    decodedParam = decodeURIComponent(rawParam);
  } catch { /* keep as is */ }

  const dotIdx = decodedParam.indexOf('.');
  const id = (dotIdx > 0 ? decodedParam.slice(0, dotIdx) : decodedParam).trim();
  const legacyToken = dotIdx > 0 ? decodedParam.slice(dotIdx + 1) : '';

  // 1. Запрос в Supabase `public.barrels` по short_id
  if (supabase && id) {
    try {
      const { data, error } = await supabase
        .from('barrels')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        let photoUrl = data.photo_url || '';
        let voiceUrl = data.voice_url || '';
        if (!photoUrl || !voiceUrl) {
          const localMedia = await loadLocalPackMedia(id);
          if (!photoUrl && localMedia?.photoObjectUrl) photoUrl = localMedia.photoObjectUrl;
          if (!voiceUrl && localMedia?.voiceObjectUrl) voiceUrl = localMedia.voiceObjectUrl;
        }
        return {
          id: data.id,
          mode: data.mode || 'friend',
          message: data.message || '',
          photoUrl,
          voiceUrl,
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

  // 2. Локальное хранилище + IndexedDB (полноразмерный 512x512 WebP + записанный голос при локальном тесте)
  const localPacks = readLocalPacks();
  if (localPacks[id]) {
    const entry = { ...localPacks[id] };
    const media = await loadLocalPackMedia(id);
    if (!entry.photoUrl && media?.photoObjectUrl) entry.photoUrl = media.photoObjectUrl;
    if (!entry.voiceUrl && media?.voiceObjectUrl) entry.voiceUrl = media.voiceObjectUrl;
    return entry;
  }

  // 3. Обратная совместимость со старыми длинными ссылками v2.0 (.eyJ...)
  if (legacyToken) {
    const payload = decodeLegacyBase64Url(legacyToken);
    if (payload) {
      return {
        id,
        mode: payload.m === 's' ? 's' : 'friend',
        message: payload.msg || '',
        photoUrl: payload.img || '',
        voiceUrl: '',
        frameStyle: payload.f || 'flashlight',
        targetIndex: typeof payload.t === 'number' && payload.t >= 0 && payload.t < 6 ? payload.t : 2,
        senderUid: payload.su || '',
        senderTgId: payload.stg || '',
        senderName: payload.sn || '',
        openedCount: 0,
      };
    }
  }

  // 4. Гостевая демо-капсула по произвольному короткому коду (?b=jakaqgx без записи в БД)
  const fallbackTarget = Math.abs(hashCode(id)) % 6;
  return {
    id,
    mode: 'friend',
    message: 'Вытащишь меня — идём на «Бочку» 17 декабря',
    photoUrl: '',
    voiceUrl: '',
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
    ? `🛢 БОЧКА: ${readerName} пробил все преграды и вскрыл твою бочку с ${attemptsUsed}-й попытки!`
    : `💀 БОЧКА: ${readerName} остался в тёмном цеху Корпуса Б!`;

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

/* ============================================================================
   ЗАКРЫТАЯ ОХОТА ЗА НАСТОЯЩИМ БИЛЕТОМ В КИНО («НОЧНАЯ СМЕНА»)
   Вся проверка выигрыша выполняется ИСКЛЮЧИТЕЛЬНО на сервере через RPC `try_win_ticket`.
   В клиентском коде НЕТ ни формул выигрыша, ни промокодов!
   ============================================================================ */
export async function tryWinCinemaTicket(tgUser = null) {
  if (!supabase) {
    return {
      won: false,
      status: 'backend_not_configured',
    };
  }

  const uid = getViewerUid(tgUser);
  try {
    const { data, error } = await supabase.rpc('try_win_ticket', {
      user_id: uid,
    });

    if (error || !data) {
      return { won: false, status: 'rpc_error' };
    }

    if (data.won === true && data.ticket_code) {
      const q = getQuestState();
      q.wonTicketCode = data.ticket_code;
      q.wonTicketContact = data.contact || '';
      saveQuestState(q);
      return {
        won: true,
        ticketCode: data.ticket_code,
        contact: data.contact || '',
      };
    }

    return {
      won: false,
      status: data.status || 'empty',
    };
  } catch {
    return { won: false, status: 'network_error' };
  }
}

/**
 * Управление прогрессом квеста, верификацией скриншота Кинопоиска и доступом к «Ночной смене»
 */
export function getQuestState() {
  const def = {
    trailerDone: false,
    kinopoiskDone: false,
    kpScreenshotVerified: false,
    friendsOpened: 0,
    packedCount: 0,
    bonusShifts: 0,
    lastNightShiftAt: 0,
    wonTicketCode: '',
    wonTicketContact: '',
    myBarrelIds: [],
  };
  const saved = safeReadJson(QUEST_STORAGE_KEY, null);
  return saved ? { ...def, ...saved } : def;
}

function saveQuestState(state) {
  safeWriteJson(QUEST_STORAGE_KEY, state);
}

export function isGoldenHuntUnlocked(state = getQuestState()) {
  return Boolean((state.packedCount || 0) >= 1 && state.kpScreenshotVerified);
}

export function markKpScreenshotVerified() {
  const s = getQuestState();
  s.kpScreenshotVerified = true;
  s.kinopoiskDone = true;
  saveQuestState(s);
  return s;
}

export function getNightShiftAvailability() {
  const s = getQuestState();
  if (!isGoldenHuntUnlocked(s)) {
    return { unlocked: false, canPlayNow: false, waitSec: 0, bonusShifts: 0 };
  }
  if ((s.bonusShifts || 0) > 0) {
    return { unlocked: true, canPlayNow: true, waitSec: 0, bonusShifts: s.bonusShifts };
  }
  const elapsed = Date.now() - (s.lastNightShiftAt || 0);
  if (elapsed >= NIGHT_SHIFT_COOLDOWN_MS) {
    return { unlocked: true, canPlayNow: true, waitSec: 0, bonusShifts: 0 };
  }
  return {
    unlocked: true,
    canPlayNow: false,
    waitSec: Math.ceil((NIGHT_SHIFT_COOLDOWN_MS - elapsed) / 1000),
    bonusShifts: 0,
  };
}

export function consumeNightShiftEntry() {
  const s = getQuestState();
  if ((s.bonusShifts || 0) > 0) {
    s.bonusShifts -= 1;
  } else {
    s.lastNightShiftAt = Date.now();
  }
  saveQuestState(s);
  return s;
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
  const prevFriends = s.friendsOpened || 0;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('barrels')
        .select('opened_count')
        .eq('sender_uid', uid);

      if (!error && Array.isArray(data)) {
        const openedBarrels = data.reduce((acc, row) => acc + Math.min(5, row.opened_count || 0), 0);
        if (openedBarrels > prevFriends) {
          s.bonusShifts = (s.bonusShifts || 0) + (openedBarrels - prevFriends);
        }
        s.friendsOpened = Math.max(prevFriends, openedBarrels);
        saveQuestState(s);
      }
    } catch { /* ignore */ }
  } else {
    const localPacks = readLocalPacks();
    let localOpened = 0;
    for (const id of s.myBarrelIds || []) {
      if (localPacks[id]?.openedCount > 0) localOpened += localPacks[id].openedCount;
    }
    if (localOpened > prevFriends) {
      s.bonusShifts = (s.bonusShifts || 0) + (localOpened - prevFriends);
    }
    s.friendsOpened = Math.max(prevFriends, localOpened);
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
  if (state.kpScreenshotVerified) total += 1;
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
