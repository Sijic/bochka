import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';
import { saveLocalPackMedia, loadLocalPackMedia } from './voice.js';
import { isTelegramMiniApp, isTestBogSessionActive } from './telegram.js';

const PACKS_STORAGE_KEY = 'bochka_v2_packs';
const PASSES_STORAGE_KEY = 'bochka_v3_passes';
const QUEST_STORAGE_KEY = 'bochka_v2_quest';
const PROFILE_STORAGE_KEY = 'bochka_v3_profile';
const UID_STORAGE_KEY = 'bochka_v2_uid';

export const supabase =
  ENV.supabaseUrl && ENV.supabaseAnonKey
    ? createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
        auth: { persistSession: false },
      })
    : null;

export function isTestBogActive() {
  return isTestBogSessionActive();
}

/**
 * В режиме ТЕСТ-БОГА (песочница `/testbog/`) жёстко отключает клиент Supabase:
 * ни один тестовый удар, скриншот, фото, голос или билет не попадает в базу и бакеты!
 */
function getCloudDb() {
  if (isTestBogActive()) return null;
  return supabase;
}

export function getActiveRealtimeClient() {
  return getCloudDb();
}

export function isSupabaseActive() {
  return Boolean(getCloudDb());
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
 * Оставлено ТОЛЬКО для обратной совместимости на чтение со старыми ссылками прототипа (.eyJ...)
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
 * Создаёт заваренную бочку:
 * - грузит портрет 320x320 WebP (~18 КБ) и голос Opus 16kbps (~10 КБ) в бакет `barrel-media` с `cacheControl: '31536000'`,
 * - сохраняет запись через `create_barrel_pack_rpc`,
 * - внутри ТГ отдаёт `https://t.me/bochka_film_bot/play?startapp=<short_id>`, а для веба — `https://bochka.quest/?b=<short_id>`.
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
  const senderUsername = tgUser?.username || '';
  const cleanMsg = (message || '').trim().slice(0, 45);
  const cleanSender = (senderName || tgUser?.name || '').trim().slice(0, 28);

  let remotePhotoUrl = '';
  let remoteVoiceUrl = '';
  let storedInCloud = false;
  const db = getCloudDb();

  if (db) {
    try {
      if (processedImage?.blob) {
        const photoPath = `portraits/${id}.webp`;
        const { error: upErr } = await db.storage
          .from(ENV.supabaseBucket)
          .upload(photoPath, processedImage.blob, {
            contentType: processedImage.blob.type || 'image/webp',
            cacheControl: '31536000',
            upsert: false,
          });

        if (!upErr) {
          const { data: pubData } = db.storage.from(ENV.supabaseBucket).getPublicUrl(photoPath);
          remotePhotoUrl = pubData?.publicUrl || '';
        }
      }

      if (recordedVoice?.blob) {
        const ext = recordedVoice.ext || 'webm';
        const voicePath = `voices/${id}.${ext}`;
        const { error: vErr } = await db.storage
          .from(ENV.supabaseBucket)
          .upload(voicePath, recordedVoice.blob, {
            contentType: recordedVoice.mimeType || 'audio/webm',
            cacheControl: '31536000',
            upsert: false,
          });

        if (!vErr) {
          const { data: vPub } = db.storage.from(ENV.supabaseBucket).getPublicUrl(voicePath);
          remoteVoiceUrl = vPub?.publicUrl || '';
        }
      }

      const { data: rpcRes, error: rpcErr } = await db.rpc('create_barrel_pack_rpc', {
        p_short_id: id,
        p_mode: mode,
        p_message: cleanMsg,
        p_frame_style: frameStyle,
        p_sender_uid: senderUid,
        p_sender_tg_id: senderTgId || null,
        p_sender_username: senderUsername || null,
        p_sender_name: cleanSender,
        p_photo_url: remotePhotoUrl,
        p_voice_url: remoteVoiceUrl,
        p_target_index: targetIndex,
      });

      if (!rpcErr && rpcRes?.ok) {
        storedInCloud = true;
      }
    } catch {
      storedInCloud = false;
    }
  }

  await saveLocalPackMedia(id, {
    photoBlob: processedImage?.blob || null,
    voiceBlob: recordedVoice?.blob || null,
  });

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

  const q = getQuestState();
  q.packedCount = (q.packedCount || 0) + 1;
  q.myBarrelIds = Array.from(new Set([...(q.myBarrelIds || []), id])).slice(-25);
  saveQuestState(q);

  const baseOrigin = resolveShareBaseUrl();
  const sep = baseOrigin.includes('?') ? '&' : '?';
  const bogFlag = isTestBogActive() ? 'testbog=1&' : '';
  const webUrl = `${baseOrigin}${sep}${bogFlag}b=${encodeURIComponent(id)}`;
  const tgMiniAppUrl =
    ENV.tgBotUsername && storedInCloud && !isTestBogActive()
      ? `https://t.me/${ENV.tgBotUsername}/${ENV.tgAppName}?startapp=${encodeURIComponent(id)}`
      : webUrl;

  return {
    id,
    targetIndex,
    storedInCloud,
    shareUrl: isTelegramMiniApp() ? tgMiniAppUrl : webUrl,
    tgUrl: tgMiniAppUrl,
    webUrl,
    pack: localPacks[id],
  };
}

export async function loadBarrelPack(rawParam) {
  if (!rawParam) return null;
  let decodedParam = rawParam;
  try {
    decodedParam = decodeURIComponent(rawParam);
  } catch { /* keep as is */ }

  const dotIdx = decodedParam.indexOf('.');
  const id = (dotIdx > 0 ? decodedParam.slice(0, dotIdx) : decodedParam).trim();
  const legacyToken = dotIdx > 0 ? decodedParam.slice(dotIdx + 1) : '';

  const db = getCloudDb();
  if (db && id) {
    try {
      const { data, error } = await db.rpc('get_barrel_pack_rpc', {
        p_short_id: id,
      });

      if (!error && data?.ok) {
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
          openedCount: 0,
        };
      }
    } catch { /* fallback below */ }
  }

  const localPacks = readLocalPacks();
  if (localPacks[id]) {
    const entry = { ...localPacks[id] };
    const media = await loadLocalPackMedia(id);
    if (!entry.photoUrl && media?.photoObjectUrl) entry.photoUrl = media.photoObjectUrl;
    if (!entry.voiceUrl && media?.voiceObjectUrl) entry.voiceUrl = media.voiceObjectUrl;
    return entry;
  }

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
 * Записывает шаг воронки (kp_clicks, trailer_completions, cinema_clicks, ocean_opens, kp_screenshot_verified)
 */
export async function recordFunnelEvent(event, tgUser = null, kpScreenshotBlob = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (!db) return true;

  let kpUrl = '';
  try {
    if (kpScreenshotBlob) {
      const path = `kp/${uid}_${Date.now()}.webp`;
      const { error: upErr } = await db.storage
        .from(ENV.supabasePassesBucket)
        .upload(path, kpScreenshotBlob, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        });
      if (!upErr) {
        const { data: pub } = db.storage.from(ENV.supabasePassesBucket).getPublicUrl(path);
        kpUrl = pub?.publicUrl || '';
      }
    }

    await db.rpc('record_funnel_event_rpc', {
      p_event: event,
      p_uid: uid,
      p_kp_screenshot_url: kpUrl || null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function recordBarrelResult(pack, { survived, attemptsUsed, timeLeft, viewerTgUser = null }) {
  if (!pack || !pack.id) return { notified: false };

  const viewerUid = getViewerUid(viewerTgUser);
  const openedGuardKey = `bochka_v2_opened_${pack.id}`;
  const alreadyOpenedByMe = safeRead(openedGuardKey, '') === '1';
  const isSelfOpen = Boolean(pack.senderUid && pack.senderUid === viewerUid);

  safeWrite(openedGuardKey, '1');

  let senderBonusCredited = false;
  let senderTgId = pack.senderTgId || '';
  const db = getCloudDb();

  if (db && !alreadyOpenedByMe) {
    try {
      const { data: cred } = await db.rpc('credit_friend_opened_lives', {
        p_barrel_id: pack.id,
        p_sender_uid: pack.senderUid || '',
        p_opener_uid: viewerUid,
      });
      senderBonusCredited = Boolean(cred?.credited);
      if (cred?.sender_tg_id) senderTgId = cred.sender_tg_id;
    } catch { /* ignore */ }
  }

  const localPacks = readLocalPacks();
  if (localPacks[pack.id]) {
    localPacks[pack.id].openedCount = (localPacks[pack.id].openedCount || 0) + (!alreadyOpenedByMe && !isSelfOpen ? 1 : 0);
    localPacks[pack.id].survived = survived;
    localPacks[pack.id].attemptsUsed = attemptsUsed;
    localPacks[pack.id].timeLeft = Number(timeLeft.toFixed(1));
    safeWriteJson(PACKS_STORAGE_KEY, localPacks);
  }

  const notified = await sendTelegramPing({
    clientAction: 'barrel_opened',
    senderTgId,
    openerName: viewerTgUser?.name || '',
    barrelId: pack.id,
    survived,
  });

  return { notified, senderBonusCredited };
}

export async function sendCinemaInviteReply(pack, viewerTgUser = null) {
  await recordFunnelEvent('cinema_clicks', viewerTgUser);

  return sendTelegramPing({
    clientAction: 'cinema_accept',
    senderTgId: pack?.senderTgId || '',
    openerName: viewerTgUser?.name || '',
    barrelId: pack?.id || '',
  });
}

async function sendTelegramPing(payload) {
  if (isTestBogActive()) return true;
  if (!ENV.tgNotifyWebhook) return false;
  try {
    const res = await fetch(ENV.tgNotifyWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ============================================================================
   СУПЕРИГРА «ГОНКА ЗА ПРЕМЬЕРОЙ (0..100)» И ПОДАРОЧНЫЙ БИЛЕТ ДРУГУ (startapp=gift_ID)
   ============================================================================ */

function getLocalPreviewProfile() {
  const today = new Date().toISOString().slice(0, 10);
  const def = {
    premiereScore: 0,
    premierePoints: 0,
    currentLevel: 1,
    hasPlayedSolo: false,
    ticketsGifted: 0,
    duelsWon: 0,
    duelsPlayed: 0,
    trailerRewarded: false,
    kpClickRewarded: false,
    dailySocialMask: '',
    lives: 3,
    rawSharesToday: 0,
    rawSharesDay: today,
    easterEggClaimed: false,
    easterEggBestTaps: 0,
    easterEggGiftWon: false,
    premiereWon: false,
    premiereConfirmed: false,
    premiereCode: '',
    hasPendingTicket: false,
    kpVerified: false,
    packedCount: 0,
    friendsBrought: 0,
  };
  const saved = safeReadJson(PROFILE_STORAGE_KEY, null);
  const prof = saved ? { ...def, ...saved } : def;
  if (prof.rawSharesDay !== today) {
    prof.rawSharesToday = 0;
    prof.dailySocialMask = '';
    prof.rawSharesDay = today;
    safeWriteJson(PROFILE_STORAGE_KEY, prof);
  }
  return prof;
}

function saveLocalPreviewProfile(prof) {
  safeWriteJson(PROFILE_STORAGE_KEY, prof);
}

/**
 * ШАГ 5: Суперигра «Гонка за Премьерой» открывается после того, как игрок
 * сам упаковал друга И подтвердил скриншот с оранжевой кнопкой «Буду смотреть» на Кинопоиске!
 */
export function isPremiereRaceUnlocked(questState = getQuestState(), profile = null) {
  if (isTestBogActive()) return true;
  const packedOk = (questState?.packedCount || 0) >= 1 || (profile?.packedCount || 0) >= 1;
  const kpOk = Boolean(questState?.kpScreenshotVerified || profile?.kpVerified);
  return Boolean(packedOk && kpOk);
}

export async function fetchPlayerProfile(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('get_or_create_player_profile', {
        p_uid: uid,
        p_tg_id: tgUser?.id || null,
        p_tg_username: tgUser?.username || null,
        p_display_name: tgUser?.name || '',
      });
      if (!error && data?.ok) {
        const mapped = {
          premiereScore: Number(data.premiere_score || 0),
          premierePoints: Number(data.premiere_points || 0),
          currentLevel: Math.max(1, Number(data.current_level || 1)),
          hasPlayedSolo: Boolean(data.has_played_solo),
          ticketsGifted: Number(data.tickets_gifted || 0),
          duelsWon: Number(data.duels_won || 0),
          duelsPlayed: Number(data.duels_played || 0),
          trailerRewarded: Boolean(data.trailer_rewarded),
          kpClickRewarded: Boolean(data.kp_click_rewarded),
          dailySocialMask: String(data.daily_social_mask || ''),
          lives: Number(data.lives ?? 3),
          rawSharesToday: Number(data.daily_shares_count || 0),
          easterEggClaimed: Boolean(data.easter_egg_claimed),
          easterEggBestTaps: Number(data.easter_egg_best_taps || 0),
          easterEggGiftWon: Boolean(data.easter_egg_gift_won),
          premiereWon: Boolean(data.premiere_won),
          premiereConfirmed: Boolean(data.premiere_confirmed),
          premiereCode: data.premiere_code || '',
          hasPendingTicket: Boolean(data.has_pending_ticket),
          kpVerified: Boolean(data.kp_verified),
          packedCount: Number(data.packed_count || 0),
          friendsBrought: Number(data.friends_brought || 0),
        };
        if (mapped.kpVerified) markKpScreenshotVerified();
        if (mapped.packedCount > 0) {
          const q = getQuestState();
          q.packedCount = Math.max(q.packedCount || 0, mapped.packedCount);
          q.friendsOpened = Math.max(q.friendsOpened || 0, mapped.friendsBrought);
          saveQuestState(q);
        }
        saveLocalPreviewProfile({ ...getLocalPreviewProfile(), ...mapped });
        return mapped;
      }
    } catch { /* fallback below */ }
  }
  return getLocalPreviewProfile();
}

export async function playPremiereStrike(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();

  if (db) {
    try {
      const { data, error } = await db.rpc('play_premiere_strike', {
        p_uid: uid,
      });
      if (!error && data) {
        return {
          ok: Boolean(data.ok),
          status: data.reason || 'ok',
          outcome: data.outcome || 'empty_screamer',
          delta: Number(data.delta || 0),
          pointsGain: Number(data.points_gain || 0),
          premiereScore: Number(data.premiere_score || 0),
          premierePoints: Number(data.premiere_points || 0),
          lives: Number(data.lives || 0),
          nearMiss: Boolean(data.near_miss),
          hasPendingTicket: Boolean(data.has_pending_ticket),
          premiereCode: data.premiere_code || '',
          contact: 'Напиши @bochka_film_bot и отправь свой VIP-код для подтверждения в списках гостей Закрытой Премьеры.',
        };
      }
      return { ok: false, status: 'rpc_error' };
    } catch {
      return { ok: false, status: 'network_error' };
    }
  }

  // Полная офлайн-песочница для режима ТЕСТ-БОГ (0 запросов к Supabase!)
  if (isTestBogActive()) {
    const prof = getLocalPreviewProfile();
    if (prof.lives <= 0) {
      return {
        ok: false,
        status: 'no_lives',
        premiereScore: prof.premiereScore,
        lives: 0,
        nearMiss: prof.premiereScore >= 90,
      };
    }

    prof.lives = Math.max(0, prof.lives - 1);
    let forced = '';
    try {
      forced = sessionStorage.getItem('bochka_testbog_force_hit') || '';
      if (forced) sessionStorage.removeItem('bochka_testbog_force_hit');
    } catch { /* ignore */ }

    if (forced === 'premiere_win') {
      const delta = Math.max(0.1, Number((100 - prof.premiereScore).toFixed(1)));
      prof.premiereScore = 100;
      prof.premierePoints = (prof.premierePoints || 0) + 500;
      prof.premiereWon = true;
      prof.premiereCode = 'TESTBOG-VIP-17DEC';
      saveLocalPreviewProfile(prof);
      return {
        ok: true,
        status: 'ok',
        outcome: 'premiere_win',
        delta,
        pointsGain: 500,
        premiereScore: 100,
        premierePoints: prof.premierePoints,
        lives: prof.lives,
        nearMiss: false,
        hasPendingTicket: prof.hasPendingTicket,
        premiereCode: prof.premiereCode,
      };
    }

    if (forced === 'golden_ticket' || (!forced && !prof.hasPendingTicket && Math.random() < 0.18)) {
      prof.hasPendingTicket = true;
      prof.premierePoints = (prof.premierePoints || 0) + 180;
      saveLocalPreviewProfile(prof);
      return {
        ok: true,
        status: 'ok',
        outcome: 'golden_ticket',
        delta: 0,
        pointsGain: 180,
        premiereScore: prof.premiereScore,
        premierePoints: prof.premierePoints,
        lives: prof.lives,
        nearMiss: false,
        hasPendingTicket: true,
        premiereCode: '',
      };
    }

    if (forced === 'empty_screamer' || (!forced && Math.random() < 0.34)) {
      prof.premierePoints = (prof.premierePoints || 0) + 20;
      saveLocalPreviewProfile(prof);
      return {
        ok: true,
        status: 'ok',
        outcome: 'empty_screamer',
        delta: 0,
        pointsGain: 20,
        premiereScore: prof.premiereScore,
        premierePoints: prof.premierePoints,
        lives: prof.lives,
        nearMiss: prof.lives <= 0 && prof.premiereScore >= 90,
        hasPendingTicket: prof.hasPendingTicket,
        premiereCode: '',
      };
    }

    let delta = 0.2;
    if (prof.premiereScore < 60) delta = 18 + Math.round(Math.random() * 8);
    else if (prof.premiereScore < 85) delta = 7 + Math.round(Math.random() * 5);
    else if (prof.premiereScore < 95) delta = Number((2.2 + Math.random() * 2.0).toFixed(1));
    else if (prof.premiereScore < 98.8) delta = Number((0.2 + Math.random() * 0.4).toFixed(1));
    else delta = Number((0.05 + Math.random() * 0.08).toFixed(2));

    // Асимптота Near-Miss: удерживаем шкалу на 98.5..99.5, пока игрок набирает Рейтинговые Очки ТОП-10!
    prof.premiereScore = Number(Math.min(99.5, prof.premiereScore + delta).toFixed(1));
    const ptsGain = 55 + Math.round(delta * 3);
    prof.premierePoints = (prof.premierePoints || 0) + ptsGain;

    saveLocalPreviewProfile(prof);
    return {
      ok: true,
      status: 'ok',
      outcome: 'score_hit',
      delta,
      pointsGain: ptsGain,
      premiereScore: prof.premiereScore,
      premierePoints: prof.premierePoints,
      lives: prof.lives,
      nearMiss: prof.lives <= 0 && prof.premiereScore >= 90,
      hasPendingTicket: prof.hasPendingTicket,
      premiereCode: '',
    };
  }

  return { ok: false, status: 'offline' };
}

export async function claimShareBonusLife(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('claim_share_life', {
        p_uid: uid,
      });
      if (!error && data) {
        return {
          granted: data.ok ? 1 : 0,
          lives: Number(data.lives || 0),
          rawSharesToday: Number(data.daily_shares_count || 0),
          capped: data.reason === 'daily_limit',
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  if (prof.rawSharesToday >= 3 && !isTestBogActive()) {
    return { granted: 0, lives: prof.lives, rawSharesToday: prof.rawSharesToday, capped: true };
  }
  prof.rawSharesToday += 1;
  prof.lives += 1;
  saveLocalPreviewProfile(prof);
  return { granted: 1, lives: prof.lives, rawSharesToday: prof.rawSharesToday, capped: false };
}

/**
 * ПУТЬ А: Сжечь выпавший билет в обмен на множитель ×2 жизней!
 */
export async function burnRegularTicketForX2Lives(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('burn_ticket_for_x2_lives', {
        p_uid: uid,
      });
      if (!error && data?.ok) {
        return { ok: true, lives: Number(data.lives || 2) };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }
  if (isTestBogActive()) {
    const prof = getLocalPreviewProfile();
    prof.hasPendingTicket = false;
    prof.lives = Math.max(2, (prof.lives || 1) * 2);
    saveLocalPreviewProfile(prof);
    return { ok: true, lives: prof.lives };
  }
  return { ok: false };
}

/**
 * ПУТЬ Б: Сформировать специальную подарочную ссылку `https://t.me/bochka_film_bot/play?startapp=gift_<id>`
 * Промокод отправителю НЕ показывается — билет оформляется на верифицированный телефон друга через кабинет продюсера!
 */
export async function createGiftTicketPass({
  tgUser = null,
  senderName = '',
  recipientName = '',
  processedPassPhoto = null,
}) {
  const giftId = randomShortId(8);
  const uid = getViewerUid(tgUser);
  const cleanRecipient = (recipientName || '').trim().slice(0, 45);
  const cleanSender = (senderName || tgUser?.name || '').trim().slice(0, 32);

  let remotePhotoUrl = '';
  const db = getCloudDb();
  if (db) {
    try {
      if (processedPassPhoto?.blob) {
        const photoPath = `passes/${giftId}.webp`;
        const { error: upErr } = await db.storage
          .from(ENV.supabasePassesBucket)
          .upload(photoPath, processedPassPhoto.blob, {
            contentType: processedPassPhoto.blob.type || 'image/webp',
            cacheControl: '31536000',
            upsert: false,
          });
        if (!upErr) {
          const { data: pubData } = db.storage.from(ENV.supabasePassesBucket).getPublicUrl(photoPath);
          remotePhotoUrl = pubData?.publicUrl || '';
        }
      }

      const { data, error } = await db.rpc('issue_gift_ticket_link', {
        p_short_id: giftId,
        p_sender_uid: uid,
        p_sender_tg_id: tgUser?.id || null,
        p_sender_username: tgUser?.username || null,
        p_sender_name: cleanSender,
        p_recipient_name: cleanRecipient,
        p_recipient_photo_url: remotePhotoUrl || null,
      });

      if (error || !data?.ok) {
        return { ok: false, error: data?.reason || 'rpc_error' };
      }
    } catch {
      return { ok: false, error: 'network_error' };
    }
  } else if (isTestBogActive()) {
    const passes = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
    passes[giftId] = {
      id: giftId,
      status: 'issued',
      orderStatus: '',
      recipientName: cleanRecipient || 'Тестовый Друг',
      recipientPhotoUrl: processedPassPhoto?.dataUrl || '',
      senderName: cleanSender || 'Тест-Бог',
      senderUid: 'sandbox_friend_sender',
      senderTgId: '',
      hasVerifiedPhone: false,
      verifiedPhone: '',
      cityCinema: '',
      bookingCode: '',
      ticketFileUrl: '',
    };
    safeWriteJson(PASSES_STORAGE_KEY, passes);
    const prof = getLocalPreviewProfile();
    prof.hasPendingTicket = false;
    saveLocalPreviewProfile(prof);
  }

  const baseOrigin = resolveShareBaseUrl();
  const sep = baseOrigin.includes('?') ? '&' : '?';
  const bogFlag = isTestBogActive() ? 'testbog=1&' : '';
  const webUrl = `${baseOrigin}${sep}${bogFlag}gift=${encodeURIComponent(giftId)}`;
  const tgUrl = isTestBogActive()
    ? webUrl
    : `https://t.me/${ENV.tgBotUsername || 'bochka_film_bot'}/${ENV.tgAppName || 'play'}?startapp=${encodeURIComponent('gift_' + giftId)}`;

  return {
    ok: true,
    passId: giftId,
    shareUrl: tgUrl,
    tgUrl,
    webUrl,
  };
}

/**
 * Загружает данные подарочной ссылки `startapp=gift_<id>` / `?gift=<id>`
 */
export async function loadGiftTicketPass(giftId, viewerTgUser = null) {
  if (!giftId) return null;
  const cleanId = giftId.trim();
  const db = getCloudDb();

  if (db) {
    try {
      const { data, error } = await db.rpc('get_gift_pass_public', {
        p_short_id: cleanId,
        p_viewer_tg_id: viewerTgUser?.id || null,
      });
      if (!error && data?.ok) {
        const serverNowMs = Number(data.server_now_ms || Date.now());
        return {
          id: data.gift_id,
          status: data.status || 'issued',
          orderStatus: data.order_status || '',
          recipientName: data.recipient_name || '',
          recipientPhotoUrl: data.recipient_photo_url || '',
          senderName: data.sender_name || '',
          senderUid: data.sender_uid || '',
          senderTgId: data.sender_tg_id || '',
          hasVerifiedPhone: Boolean(data.has_verified_phone),
          verifiedPhone: data.verified_phone || '',
          cityCinema: data.city_cinema || '',
          bookingCode: data.booking_code || '',
          ticketFileUrl: data.ticket_file_url || '',
          serverOffsetMs: serverNowMs - Date.now(),
        };
      }
    } catch { /* ignore */ }
  }

  if (isTestBogActive()) {
    const passes = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
    if (passes[cleanId]) {
      return { ...passes[cleanId], serverOffsetMs: 0 };
    }
    return {
      id: cleanId,
      status: 'issued',
      orderStatus: '',
      recipientName: 'АЛЕКСЕЙ (ТЕСТ ПОЛУЧАТЕЛЯ)',
      recipientPhotoUrl: '',
      senderName: 'Друг из Цеха (Sandbox)',
      senderUid: 'sandbox_other_sender',
      senderTgId: '',
      hasVerifiedPhone: false,
      verifiedPhone: '',
      cityCinema: '',
      bookingCode: '',
      ticketFileUrl: '',
      serverOffsetMs: 0,
    };
  }
  return null;
}

/**
 * ШАГ 7: Получатель подтверждает телефон через Telegram `request_contact` и вводит Город/кинотеатр.
 * Заявка уходит в `ticket_orders` (`pending`), отправителю мгновенно начисляется ×2 жизней,
 * а бот уведомляет обоих игроков и чат продюсеров!
 */
export async function submitGiftTicketOrder({
  giftId,
  tgUser,
  cityCinema,
  fallbackPhone = '',
}) {
  const viewerUid = getViewerUid(tgUser);
  const db = getCloudDb();

  if (!db) {
    if (isTestBogActive()) {
      const phone = fallbackPhone || '+79990001712';
      const passes = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
      passes[giftId] = {
        ...(passes[giftId] || { id: giftId, recipientName: 'ТЕСТ ПОЛУЧАТЕЛЯ' }),
        status: 'claimed',
        orderStatus: 'pending',
        hasVerifiedPhone: true,
        verifiedPhone: phone,
        cityCinema,
      };
      safeWriteJson(PASSES_STORAGE_KEY, passes);

      const prof = getLocalPreviewProfile();
      prof.lives = Math.max(2, (prof.lives || 1) * 2);
      saveLocalPreviewProfile(prof);
      return {
        ok: true,
        orderId: 777,
        verifiedPhone: phone,
        cityCinema,
      };
    }
    return { ok: false, reason: 'offline' };
  }

  try {
    const { data, error } = await db.rpc('submit_gift_ticket_order', {
      p_gift_id: giftId,
      p_receiver_uid: viewerUid,
      p_receiver_tg_id: tgUser?.id || '',
      p_receiver_username: tgUser?.username || '',
      p_receiver_name: tgUser?.name || '',
      p_city_cinema: cityCinema,
      p_fallback_phone: fallbackPhone || null,
    });

    if (error || !data?.ok) {
      return { ok: false, reason: data?.reason || 'rpc_error' };
    }

    await sendTelegramPing({
      clientAction: 'gift_order_created',
      senderTgId: data.sender_tg_id || '',
      receiverTgId: tgUser?.id || '',
      receiverName: tgUser?.name || '',
      receiverUsername: tgUser?.username || '',
      phone: data.verified_phone || fallbackPhone,
      cityCinema: data.city_cinema || cityCinema,
    });

    return {
      ok: true,
      orderId: data.order_id,
      verifiedPhone: data.verified_phone,
      cityCinema: data.city_cinema,
    };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

/**
 * ШАГ 6 + Таппер с Тилем на берегу моря (10 сек стука по бочке):
 * Начисляет +3..+5 жизней, а за 40+ ударов за 10 сек открывает Подарочный билет для друга!
 */
export async function claimOceanTapperReward(tgUser = null, taps = 1) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('claim_ocean_tapper_reward', {
        p_uid: uid,
        p_taps: Math.max(0, Math.round(taps)),
      });
      if (!error && data?.ok) {
        const prof = getLocalPreviewProfile();
        prof.easterEggClaimed = true;
        prof.lives = Number(data.lives ?? prof.lives);
        prof.hasPendingTicket = Boolean(data.has_pending_ticket);
        prof.easterEggBestTaps = Number(data.best_taps || taps);
        saveLocalPreviewProfile(prof);
        return {
          ok: true,
          livesAwarded: Number(data.lives_awarded || 0),
          giftAwarded: Boolean(data.gift_awarded),
          alreadyClaimed: Boolean(data.already_claimed),
          lives: Number(data.lives || 0),
          bestTaps: Number(data.best_taps || taps),
          hasPendingTicket: Boolean(data.has_pending_ticket),
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  const giftAwarded = taps >= 40 && !prof.easterEggGiftWon;
  const livesAwarded = prof.easterEggClaimed ? 0 : (taps >= 40 ? 5 : taps >= 20 ? 4 : 3);
  prof.easterEggClaimed = true;
  prof.easterEggGiftWon = prof.easterEggGiftWon || giftAwarded;
  prof.hasPendingTicket = prof.hasPendingTicket || giftAwarded;
  prof.lives += livesAwarded;
  saveLocalPreviewProfile(prof);
  return {
    ok: true,
    livesAwarded,
    giftAwarded,
    alreadyClaimed: livesAwarded === 0 && !giftAwarded,
    lives: prof.lives,
    bestTaps: taps,
    hasPendingTicket: prof.hasPendingTicket,
  };
}

// Совместимость со старым вызовом
export async function claimEasterEgg1997Bonus(tgUser = null) {
  return claimOceanTapperReward(tgUser, 1);
}

/* ============================================================================
   УПРАВЛЕНИЕ КВЕСТ-СОСТОЯНИЕМ И ЖЕТОНАМИ
   ============================================================================ */
export function getQuestState() {
  const def = {
    trailerDone: false,
    kinopoiskDone: false,
    kpScreenshotVerified: false,
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

export function markKpScreenshotVerified() {
  const s = getQuestState();
  s.kpScreenshotVerified = true;
  s.kinopoiskDone = true;
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
  const prof = await fetchPlayerProfile(tgUser);
  const s = getQuestState();
  s.friendsOpened = Math.max(s.friendsOpened || 0, prof.friendsBrought || 0);
  s.packedCount = Math.max(s.packedCount || 0, prof.packedCount || 0);
  if (prof.kpVerified) s.kpScreenshotVerified = true;
  saveQuestState(s);

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

/* ============================================================================
   ШАГ 8: СОЦГРАФ («ТВОИ ЛЮДИ В ЦЕХУ»), ЖИВЫЕ ПУШИ, ДУЭЛИ «НА СЧЁТ ТРИ!»,
   УРОВНИ 1..8 (3..10 БОЧЕК + БЛИЦ), МУЛЬТИ-ШЕРИНГ И РЕЙТИНГ ТОП-10 НА ПРЕМЬЕРУ
   ============================================================================ */

export function buildDuelShareLinks(roomId) {
  const clean = encodeURIComponent(String(roomId || 'room'));
  const base = resolveShareBaseUrl();
  const bot = ENV.tgBotUsername || 'bochka_film_bot';
  const app = ENV.tgAppName || 'play';
  return {
    webUrl: `${base}/?duel=${clean}`,
    tgMiniAppUrl: `https://t.me/${bot}/${app}?startapp=duel_${clean}`,
  };
}

export function buildTrailerReferralLinks(tgUser = null) {
  const uid = encodeURIComponent(getViewerUid(tgUser));
  const base = resolveShareBaseUrl();
  const bot = ENV.tgBotUsername || 'bochka_film_bot';
  const app = ENV.tgAppName || 'play';
  return {
    webUrl: `${base}/?trailer=1&ref=${uid}`,
    tgMiniAppUrl: `https://t.me/${bot}/${app}?startapp=trailer_${uid}`,
  };
}

export async function checkBarrelEntryRouting(barrelId, viewerTgUser = null) {
  if (!barrelId) return { ok: false, shouldRouteToDuel: false };
  const viewerUid = getViewerUid(viewerTgUser);
  const db = getCloudDb();

  if (db) {
    try {
      const { data, error } = await db.rpc('check_barrel_entry_routing', {
        p_barrel_id: barrelId,
        p_viewer_uid: viewerUid,
        p_viewer_tg_id: viewerTgUser?.id || null,
      });
      if (!error && data?.ok) {
        return {
          ok: true,
          isSelf: Boolean(data.is_self),
          alreadyConnected: Boolean(data.already_connected),
          viewerHasPlayedSolo: Boolean(data.viewer_has_played_solo),
          shouldRouteToDuel: Boolean(data.should_route_to_duel),
          senderUid: data.sender_uid || '',
          senderTgId: data.sender_tg_id || '',
          senderName: data.sender_name || '',
          suggestedRoomId: data.suggested_room_id || barrelId,
        };
      }
    } catch { /* ignore */ }
  }

  return { ok: true, shouldRouteToDuel: false, suggestedRoomId: barrelId };
}

export async function notifyBarrelSearchStarted(pack, viewerTgUser = null) {
  if (!pack?.id) return { creditedLives: 0 };
  const openerUid = getViewerUid(viewerTgUser);
  const db = getCloudDb();
  let creditedLives = 0;
  let senderTgId = pack.senderTgId || '';
  const roomId = `r_${pack.id}`;

  if (db) {
    try {
      const { data } = await db.rpc('mark_barrel_search_started', {
        p_barrel_id: pack.id,
        p_opener_uid: openerUid,
        p_opener_tg_id: viewerTgUser?.id || null,
        p_opener_username: viewerTgUser?.username || null,
        p_opener_name: viewerTgUser?.name || '',
      });
      if (data?.ok) {
        creditedLives = Number(data.credited_lives || 0);
        if (data.sender_tg_id) senderTgId = data.sender_tg_id;
      }
    } catch { /* ignore */ }
  }

  if (senderTgId) {
    await sendTelegramPing({
      clientAction: 'barrel_search_started',
      senderTgId,
      openerName: viewerTgUser?.name || 'Кент из чата',
      barrelId: pack.id,
      roomId,
      creditedLives,
    });
  }

  return { creditedLives, roomId };
}

export async function sendPostRescueReaction(pack, reactionType, viewerTgUser = null, extra = {}) {
  const mapAction = {
    cinema: 'reaction_cinema',
    ask_ticket: 'reaction_ask_ticket',
    duel_3p: 'reaction_duel_3p',
  };
  const clientAction = mapAction[reactionType] || 'reaction_cinema';

  if (reactionType === 'cinema') {
    await recordFunnelEvent('cinema_clicks', viewerTgUser);
  }

  const notified = await sendTelegramPing({
    clientAction,
    senderTgId: pack?.senderTgId || '',
    openerName: viewerTgUser?.name || 'Твой друг',
    barrelId: pack?.id || '',
    roomId: extra.roomId || `d_${randomShortId(6)}`,
  });

  return { ok: true, notified };
}

export async function sendDuelChallengePush({ targetTgId, challengerName = '', roomId }) {
  if (!targetTgId) return false;
  return sendTelegramPing({
    clientAction: 'duel_challenge',
    targetTgId,
    challengerName: challengerName || 'Друг из Цеха',
    roomId,
  });
}

export async function fetchMyWorkshopFriends(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('get_my_workshop_friends', { p_uid: uid });
      if (!error && data?.ok && Array.isArray(data.friends)) {
        return data.friends;
      }
    } catch { /* ignore */ }
  }

  if (isTestBogActive()) {
    return [
      {
        friend_uid: 'tbog_f1',
        friend_tg_id: '10001',
        friend_name: 'Макс (Уже в цеху)',
        friend_username: 'max_bochka',
        opened_barrel: true,
        duels_together: 2,
      },
      {
        friend_uid: 'tbog_f2',
        friend_tg_id: '10002',
        friend_name: 'Алина (Кент)',
        friend_username: 'alina_cinema',
        opened_barrel: false,
        duels_together: 0,
      },
    ];
  }
  return [];
}

export async function startDuelAnte(tgUser = null, roomId = '', roundKey = '') {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('start_duel_ante_rpc', {
        p_uid: uid,
        p_room_id: roomId,
        p_round_key: roundKey,
      });
      if (!error && data) {
        const prof = getLocalPreviewProfile();
        if (typeof data.lives === 'number') prof.lives = data.lives;
        if (typeof data.premiere_points === 'number') prof.premierePoints = data.premiere_points;
        saveLocalPreviewProfile(prof);
        return {
          ok: Boolean(data.ok),
          reason: data.reason || 'ok',
          lives: Number(data.lives ?? prof.lives),
          premierePoints: Number(data.premiere_points ?? prof.premierePoints),
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  if (prof.lives <= 0) {
    return { ok: false, reason: 'no_lives', lives: 0, premierePoints: prof.premierePoints || 0 };
  }
  prof.lives = Math.max(0, prof.lives - 1);
  prof.duelsPlayed = (prof.duelsPlayed || 0) + 1;
  prof.premierePoints = (prof.premierePoints || 0) + 80;
  saveLocalPreviewProfile(prof);
  return { ok: true, lives: prof.lives, premierePoints: prof.premierePoints };
}

export async function settleDuelRound({ roomId, roundKey, winnerUid, playerUids = [], tgUser = null }) {
  const myUid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('settle_duel_round', {
        p_room_id: roomId,
        p_round_key: roundKey,
        p_winner_uid: winnerUid,
        p_player_uids: playerUids,
      });
      if (!error && data?.ok) {
        if (winnerUid === myUid) {
          const prof = getLocalPreviewProfile();
          prof.lives = Number(data.winner_lives ?? prof.lives);
          prof.premiereScore = Number(data.winner_score ?? prof.premiereScore);
          prof.premierePoints = Number(data.winner_points ?? prof.premierePoints);
          prof.hasPendingTicket = Boolean(data.has_pending_ticket);
          saveLocalPreviewProfile(prof);
        }
        return {
          ok: true,
          potLives: Number(data.pot_lives || playerUids.length || 2),
          scoreBonus: Number(data.score_bonus || 0),
          pointsBonus: Number(data.points_bonus || 200),
          goldenTicketDropped: Boolean(data.golden_ticket_dropped),
          winnerLives: Number(data.winner_lives || 0),
          winnerScore: Number(data.winner_score || 0),
          winnerPoints: Number(data.winner_points || 0),
          hasPendingTicket: Boolean(data.has_pending_ticket),
        };
      }
    } catch { /* fallback below */ }
  }

  const n = Math.max(2, Math.min(3, playerUids.length || 2));
  const scoreBonus = n >= 3 ? 0.25 : 0;
  const pointsBonus = n >= 3 ? 450 : 200;
  const prof = getLocalPreviewProfile();

  if (winnerUid === myUid) {
    prof.lives = (prof.lives || 0) + n;
    prof.duelsWon = (prof.duelsWon || 0) + 1;
    prof.premierePoints = (prof.premierePoints || 0) + pointsBonus;
    prof.premiereScore = Number(Math.min(99.5, (prof.premiereScore || 0) + scoreBonus).toFixed(2));
    saveLocalPreviewProfile(prof);
  }

  return {
    ok: true,
    potLives: n,
    scoreBonus,
    pointsBonus,
    goldenTicketDropped: false,
    winnerLives: prof.lives,
    winnerScore: prof.premiereScore,
    winnerPoints: prof.premierePoints,
    hasPendingTicket: prof.hasPendingTicket,
  };
}

export async function completeWorkshopLevel(tgUser = null, level = 1, timeLeftSec = 0, bonusPoints = 0) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('complete_workshop_level_rpc', {
        p_uid: uid,
        p_level: Math.max(1, Math.round(level)),
        p_time_left_sec: Math.max(0, Number(timeLeftSec || 0)),
        p_bonus_points: Math.max(0, Math.round(bonusPoints || 0)),
      });
      if (!error && data?.ok) {
        const prof = getLocalPreviewProfile();
        prof.currentLevel = Number(data.current_level || level + 1);
        prof.premierePoints = Number(data.premiere_points || prof.premierePoints);
        prof.hasPlayedSolo = true;
        saveLocalPreviewProfile(prof);
        return {
          ok: true,
          earnedPoints: Number(data.earned_points || 120),
          currentLevel: prof.currentLevel,
          premierePoints: prof.premierePoints,
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  const earned = Math.min(750, 80 + Math.min(10, level) * 25 + Math.round(Math.max(0, timeLeftSec) * 6) + Math.max(0, bonusPoints));
  prof.currentLevel = Math.max(prof.currentLevel || 1, level + 1);
  prof.premierePoints = (prof.premierePoints || 0) + earned;
  prof.hasPlayedSolo = true;
  saveLocalPreviewProfile(prof);
  return {
    ok: true,
    earnedPoints: earned,
    currentLevel: prof.currentLevel,
    premierePoints: prof.premierePoints,
  };
}

export async function claimSocialOrPromoBonus(tgUser = null, action = 'share_barrel', platform = 'tg', refUid = '') {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('claim_social_or_promo_bonus_rpc', {
        p_uid: uid,
        p_action: action,
        p_platform: platform,
        p_ref_uid: refUid || null,
      });
      if (!error && data?.ok) {
        const prof = getLocalPreviewProfile();
        prof.lives = Number(data.lives ?? prof.lives);
        prof.premierePoints = Number(data.premiere_points ?? prof.premierePoints);
        if (action === 'trailer_watched') prof.trailerRewarded = true;
        if (action === 'kp_clicked') prof.kpClickRewarded = true;
        saveLocalPreviewProfile(prof);
        return {
          ok: true,
          pointsAdded: Number(data.points_added || 0),
          livesAdded: Number(data.lives_added || 0),
          premierePoints: prof.premierePoints,
          lives: prof.lives,
          alreadyClaimed: Boolean(data.already_claimed),
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  const token = `[${action}:${platform}]`;
  let ptsAdded = 0;
  let livesAdded = 0;

  if (action === 'trailer_watched' && !prof.trailerRewarded) {
    prof.trailerRewarded = true;
    ptsAdded = 250;
    livesAdded = 1;
  } else if (action === 'kp_clicked' && !prof.kpClickRewarded) {
    prof.kpClickRewarded = true;
    ptsAdded = 300;
  } else if ((action === 'share_barrel' || action === 'share_trailer') && !(prof.dailySocialMask || '').includes(token)) {
    prof.dailySocialMask = (prof.dailySocialMask || '') + token;
    ptsAdded = action === 'share_trailer' ? 150 : 120;
    if ((prof.rawSharesToday || 0) < 5) {
      livesAdded = 1;
      prof.rawSharesToday = (prof.rawSharesToday || 0) + 1;
    }
  }

  prof.lives = (prof.lives || 0) + livesAdded;
  prof.premierePoints = (prof.premierePoints || 0) + ptsAdded;
  saveLocalPreviewProfile(prof);

  return {
    ok: true,
    pointsAdded: ptsAdded,
    livesAdded,
    premierePoints: prof.premierePoints,
    lives: prof.lives,
    alreadyClaimed: ptsAdded === 0 && livesAdded === 0,
  };
}

export async function fetchPremiereLeaderboard(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('get_premiere_leaderboard_rpc', {
        p_uid: uid,
      });
      if (!error && data?.ok) {
        return {
          ok: true,
          leaders: Array.isArray(data.leaders) ? data.leaders : [],
          tenthPoints: Number(data.tenth_points || 0),
          me: data.me || null,
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  const mockLeaders = [
    { rank: 1, uid: 'm1', name: 'Артём К.', premiere_points: 6850, premiere_score: 99.4, current_level: 11, friends_brought: 7, tickets_gifted: 2, duels_won: 5 },
    { rank: 2, uid: 'm2', name: 'Данияр М.', premiere_points: 5420, premiere_score: 99.2, current_level: 10, friends_brought: 5, tickets_gifted: 2, duels_won: 4 },
    { rank: 3, uid: 'm3', name: 'Ника С.', premiere_points: 4790, premiere_score: 98.9, current_level: 9, friends_brought: 6, tickets_gifted: 1, duels_won: 3 },
    { rank: 4, uid: 'm4', name: 'Руслан Т.', premiere_points: 3910, premiere_score: 98.5, current_level: 9, friends_brought: 4, tickets_gifted: 1, duels_won: 3 },
    { rank: 5, uid: 'm5', name: 'Кирилл В.', premiere_points: 3400, premiere_score: 97.8, current_level: 8, friends_brought: 4, tickets_gifted: 1, duels_won: 2 },
    { rank: 6, uid: 'm6', name: 'Алия Н.', premiere_points: 2950, premiere_score: 96.4, current_level: 7, friends_brought: 3, tickets_gifted: 1, duels_won: 1 },
    { rank: 7, uid: 'm7', name: 'Егор П.', premiere_points: 2480, premiere_score: 95.1, current_level: 6, friends_brought: 3, tickets_gifted: 0, duels_won: 2 },
    { rank: 8, uid: 'm8', name: 'Тимур Б.', premiere_points: 2120, premiere_score: 93.5, current_level: 6, friends_brought: 2, tickets_gifted: 0, duels_won: 2 },
    { rank: 9, uid: 'm9', name: 'София Л.', premiere_points: 1840, premiere_score: 91.0, current_level: 5, friends_brought: 2, tickets_gifted: 0, duels_won: 1 },
    { rank: 10, uid: 'm10', name: 'Илья З.', premiere_points: 1550, premiere_score: 88.5, current_level: 4, friends_brought: 1, tickets_gifted: 0, duels_won: 1 },
  ];
  const myPts = prof.premierePoints || 0;
  mockLeaders.push({
    rank: 11,
    uid,
    name: tgUser?.name || 'Ты (Sandbox)',
    premiere_points: myPts,
    premiere_score: prof.premiereScore || 0,
    current_level: prof.currentLevel || 1,
    friends_brought: prof.friendsBrought || 0,
    tickets_gifted: prof.ticketsGifted || 0,
    duels_won: prof.duelsWon || 0,
  });
  mockLeaders.sort((a, b) => b.premiere_points - a.premiere_points);
  mockLeaders.forEach((r, idx) => { r.rank = idx + 1; });
  const meEntry = mockLeaders.find((r) => r.uid === uid);
  const tenth = mockLeaders[9]?.premiere_points || 0;

  return {
    ok: true,
    leaders: mockLeaders,
    tenthPoints: tenth,
    me: {
      uid,
      rank: meEntry?.rank || 11,
      in_top10: (meEntry?.rank || 11) <= 10,
      premiere_points: myPts,
      premiere_score: prof.premiereScore || 0,
      current_level: prof.currentLevel || 1,
      friends_brought: prof.friendsBrought || 0,
      tickets_gifted: prof.ticketsGifted || 0,
      duels_won: prof.duelsWon || 0,
      points_to_top10: Math.max(0, tenth - myPts + ((meEntry?.rank || 11) > 10 ? 10 : 0)),
    },
  };
}

export function patchTestBogProfile(patch = {}) {
  const prof = { ...getLocalPreviewProfile(), ...patch };
  saveLocalPreviewProfile(prof);
  return prof;
}

export function resetTestBogSandbox() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('tbog_')) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
    sessionStorage.removeItem('bochka_testbog_force_hit');
  } catch { /* ignore */ }
}

function getActiveStorage() {
  try {
    return isTestBogActive() ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
}

function resolveKey(k) {
  return isTestBogActive() ? `tbog_${k}` : k;
}

function safeRead(k, fallback = '') {
  try {
    return getActiveStorage().getItem(resolveKey(k)) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(k, v) {
  try {
    getActiveStorage().setItem(resolveKey(k), v);
  } catch { /* ignore */ }
}

function safeReadJson(k, fallback = null) {
  try {
    const raw = getActiveStorage().getItem(resolveKey(k));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(k, obj) {
  try {
    getActiveStorage().setItem(resolveKey(k), JSON.stringify(obj));
  } catch { /* ignore */ }
}
