import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';
import { saveLocalPackMedia, loadLocalPackMedia } from './voice.js';
import { isTelegramMiniApp, isTestBogSessionActive } from './telegram.js';

const PACKS_STORAGE_KEY = 'bochka_v2_packs';
const PASSES_STORAGE_KEY = 'bochka_v3_passes';
const QUEST_STORAGE_KEY = 'bochka_v2_quest';
const PROFILE_STORAGE_KEY = 'bochka_v3_profile';
const UID_STORAGE_KEY = 'bochka_v2_uid';
const UI_STAGE_STORAGE_KEY = 'bochka_v6_ui_stage';

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

export function getPlayerRecoveryCode(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const core = uid.replace(/^u_/, '').toUpperCase();
  return `BCK-${core}`;
}

export async function restoreProfileByRecoveryCode(rawCode, tgUser = null) {
  const clean = String(rawCode || '').trim();
  if (!clean || clean.length < 4) {
    return { ok: false, error: 'Введи код восстановления (например, BCK-...)' };
  }
  const stripped = clean.replace(/^BCK-/i, '').trim().toLowerCase();
  const nextUid = stripped.startsWith('tg_') || stripped.startsWith('u_') ? stripped : `u_${stripped}`;
  safeWrite(UID_STORAGE_KEY, nextUid);
  const profile = await fetchPlayerProfile(tgUser || { id: nextUid.startsWith('tg_') ? nextUid.slice(3) : '' });
  return { ok: true, uid: nextUid, code: `BCK-${nextUid.replace(/^u_/, '').toUpperCase()}`, profile };
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
  zoneId = 1,
  targetBarrelIndex = -1,
  screamerType = 'weld',
  senderName = '',
  tgUser = null,
  processedImage,
  recordedVoice = null,
  seedTrafficSource = '',
  seedTargetHandle = '',
}) {
  const id = randomShortId(7);
  const cleanZone = Math.max(1, Math.min(4, Number(zoneId) || 1));
  const zoneBarrels = cleanZone === 1 ? 4 : cleanZone === 2 ? 6 : cleanZone === 3 ? 9 : 12;
  const maxIdx = Math.min(6, zoneBarrels);
  const targetIndex =
    Number.isInteger(targetBarrelIndex) && targetBarrelIndex >= 0 && targetBarrelIndex < maxIdx
      ? targetBarrelIndex
      : Math.floor(Math.random() * maxIdx);
  const validScreamers = new Set(['weld', 'lunge', 'siren_cam', 'custom_scream']);
  const cleanScreamer = validScreamers.has(screamerType) ? screamerType : 'weld';
  const encodedFrame = `${String(frameStyle || 'flashlight').split(':z')[0]}:z${cleanZone}:s_${cleanScreamer}`;
  const senderUid = getViewerUid(tgUser);
  const senderTgId = tgUser?.id || '';
  const senderUsername = tgUser?.username || '';
  const cleanMsg = (message || '').trim().slice(0, 45);
  const cleanSender = (senderName || tgUser?.name || '').trim().slice(0, 28);

  let remotePhotoUrl = '';
  let remoteVoiceUrl = '';
  let storedInCloud = false;
  let createPackRpcData = null;
  const db = getCloudDb();

  if (db) {
    try {
      if (processedImage?.blob) {
        const imgExt = processedImage.ext || (processedImage.blob.type === 'image/jpeg' ? 'jpg' : 'webp');
        const photoPath = `portraits/${id}.${imgExt}`;
        const { error: upErr } = await db.storage
          .from(ENV.supabaseBucket)
          .upload(photoPath, processedImage.blob, {
            contentType: processedImage.mime || processedImage.blob.type || 'image/jpeg',
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
        p_frame_style: encodedFrame,
        p_sender_uid: senderUid,
        p_sender_tg_id: senderTgId || null,
        p_sender_username: senderUsername || null,
        p_sender_name: cleanSender,
        p_photo_url: remotePhotoUrl,
        p_voice_url: remoteVoiceUrl,
        p_target_index: targetIndex,
        p_seed_traffic_source: String(seedTrafficSource || '').trim() || null,
        p_seed_target_handle: String(seedTargetHandle || '').trim() || null,
      });

      if (!rpcErr && rpcRes?.ok) {
        storedInCloud = true;
        createPackRpcData = rpcRes;
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
    frameStyle: String(frameStyle || 'flashlight').split(':z')[0],
    zoneId: cleanZone,
    screamerType: cleanScreamer,
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

  const prevProf = getLocalPreviewProfile();
  let surgeTriggered = !prevProf.temuSurgeClaimed && Number(prevProf.premiereScore || 0) < 72;
  let nextScore = Math.max(Number(prevProf.premiereScore || 0), 72);
  let nextUiStage = Math.max(
    Number(prevProf.uiStage || 1),
    getStoredUiStage(),
    surgeTriggered
      ? 3
      : (prevProf.hasSocialConnection || Number(prevProf.duelsPlayed || 0) > 0 || Number(prevProf.friendsBrought || 0) > 0 ? 4 : 3)
  );
  if (typeof createPackRpcData === 'object' && createPackRpcData?.ok) {
    surgeTriggered = Boolean(createPackRpcData.surge_triggered);
    nextScore = Math.max(nextScore, Number(createPackRpcData.premiere_score || 0));
    if (createPackRpcData.ui_stage) {
      nextUiStage = Math.max(nextUiStage, Number(createPackRpcData.ui_stage));
    }
  }
  const updatedProf = {
    ...prevProf,
    packedCount: Math.max(Number(prevProf.packedCount || 0) + 1, Number(q.packedCount || 1)),
    premiereScore: nextScore,
    temuSurgeClaimed: true,
    uiStage: Math.min(4, Math.max(3, nextUiStage)),
  };
  saveLocalPreviewProfile(updatedProf);
  safeWrite(UI_STAGE_STORAGE_KEY, String(updatedProf.uiStage));

  const baseOrigin = resolveShareBaseUrl();
  const sep = baseOrigin.includes('?') ? '&' : '?';
  const bogFlag = isTestBogActive() ? 'testbog=1&' : '';
  const webUrl = `${baseOrigin}${sep}${bogFlag}b=${encodeURIComponent(id)}`;
  const tgMiniAppUrl =
    !isTestBogActive()
      ? `https://t.me/${ENV.tgBotUsername || 'bochka_film_bot'}?startapp=pack_${encodeURIComponent(id)}`
      : webUrl;

  return {
    id,
    targetIndex,
    storedInCloud,
    surgeTriggered,
    premiereScore: updatedProf.premiereScore,
    uiStage: updatedProf.uiStage,
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

  const strippedParam = decodedParam.startsWith('pack_') ? decodedParam.slice(5) : decodedParam;
  const dotIdx = strippedParam.indexOf('.');
  const id = (dotIdx > 0 ? strippedParam.slice(0, dotIdx) : strippedParam).trim();
  const legacyToken = dotIdx > 0 ? strippedParam.slice(dotIdx + 1) : '';

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
        const rawFs = String(data.frame_style || 'flashlight');
        const [cleanFs, restPart = ''] = rawFs.split(':z');
        const [zStr = '1', scrStr = 'weld'] = restPart.split(':s_');
        return {
          id: data.id,
          mode: data.mode || 'friend',
          message: data.message || '',
          photoUrl,
          voiceUrl,
          frameStyle: cleanFs || 'flashlight',
          zoneId: Math.max(1, Math.min(4, Number(zStr) || 1)),
          screamerType: scrStr || 'weld',
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

export async function recordBarrelResult(
  pack,
  { survived, attemptsUsed, timeLeft, elapsedSec = 12, screamerLabel = '', viewerTgUser = null }
) {
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

  // Антиспам-троттлинг уведомлений отправителю (не чаще 1 раза в 15с на бочку и исход)
  const throttleKey = `bochka_ping_ts_${pack.id}_${survived ? 'win' : 'lose'}`;
  const lastPingTs = Number(safeRead(throttleKey, '0') || 0);
  if (Date.now() - lastPingTs < 15000) {
    return { notified: false, throttled: true, senderBonusCredited };
  }
  safeWrite(throttleKey, String(Date.now()));

  const notified = await sendTelegramPing({
    clientAction: 'barrel_opened',
    senderTgId,
    openerName: viewerTgUser?.name || '',
    barrelId: pack.id,
    survived,
    elapsedSec: Math.max(1, Math.round(Number(elapsedSec || 12))),
    screamerLabel,
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
  const initData = typeof window !== 'undefined' ? String(window.Telegram?.WebApp?.initData || '') : '';
  try {
    const res = await fetch(ENV.tgNotifyWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, initData }),
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
    lives: 1,
    rawSharesToday: 0,
    rawSharesDay: today,
    dailyBlitzPoints: 0,
    dailyBlitzDate: today,
    lastBlitzAtMs: 0,
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
    uiStage: 1,
    temuSurgeClaimed: false,
    hasSocialConnection: false,
    repeatLinkEntered: false,
  };
  const saved = safeReadJson(PROFILE_STORAGE_KEY, null);
  const prof = saved ? { ...def, ...saved } : def;
  if (prof.rawSharesDay !== today || prof.dailyBlitzDate !== today) {
    if (prof.rawSharesDay !== today) {
      prof.rawSharesToday = 0;
      prof.dailySocialMask = '';
      prof.rawSharesDay = today;
    }
    if (prof.dailyBlitzDate !== today) {
      prof.dailyBlitzPoints = 0;
      prof.dailyBlitzDate = today;
    }
    saveLocalPreviewProfile(prof);
  }
  return prof;
}

function saveLocalPreviewProfile(prof) {
  safeWriteJson(PROFILE_STORAGE_KEY, prof);
}

export function getStoredUiStage() {
  const raw = Number.parseInt(safeRead(UI_STAGE_STORAGE_KEY, ''), 10);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 4) {
    return raw;
  }
  const profStage = Number.parseInt(String(getLocalPreviewProfile()?.uiStage || 1), 10);
  return Number.isFinite(profStage) ? Math.min(4, Math.max(1, profStage)) : 1;
}

export function computeEffectiveUiStage(profile = null, questState = getQuestState(), opts = {}) {
  const prof = profile || getLocalPreviewProfile();
  const stored = getStoredUiStage();
  const profStage = Math.min(4, Math.max(1, Number(prof?.uiStage || 1)));
  let stage = Math.max(stored, profStage);

  const packedCount = Math.max(Number(questState?.packedCount || 0), Number(prof?.packedCount || 0));
  const surged = Boolean(prof?.temuSurgeClaimed) || Number(prof?.premiereScore || 0) >= 88;
  const duelsCount = Math.max(Number(prof?.duelsPlayed || 0), Number(prof?.duelsWon || 0));
  const friendsBrought = Math.max(Number(prof?.friendsBrought || 0), Number(questState?.friendsOpened || 0));
  const hasSocial = Boolean(prof?.hasSocialConnection);
  const directDuel = Boolean(opts?.hasDuelParam || opts?.routing?.shouldRouteToDuel || prof?.repeatLinkEntered);

  if (directDuel || duelsCount > 0 || friendsBrought > 0) {
    stage = Math.max(stage, 4);
  } else if ((packedCount >= 1 || surged) && hasSocial && stage >= 3) {
    stage = Math.max(stage, 4);
  } else if (packedCount >= 1 || surged) {
    stage = Math.max(stage, 3);
  }

  return Math.min(4, Math.max(1, stage));
}

export async function syncUiStage(tgUser = null, targetStage = 1, { force = false } = {}) {
  const clamped = Math.min(4, Math.max(1, Math.round(Number(targetStage) || 1)));
  const current = getStoredUiStage();
  const next = force ? clamped : Math.max(current, clamped);

  safeWrite(UI_STAGE_STORAGE_KEY, String(next));
  const prevProf = getLocalPreviewProfile();
  if (force || next > Number(prevProf?.uiStage || 1)) {
    saveLocalPreviewProfile({ ...prevProf, uiStage: next });
  }

  const db = getCloudDb();
  if (db && !force && next > 1) {
    try {
      const uid = getViewerUid(tgUser);
      await db.rpc('sync_user_ui_stage_rpc', { p_uid: uid, p_stage: next });
    } catch { /* fallback stored locally */ }
  }
  return next;
}

/**
 * v11.5: Гонка за Премьерой закрыта, пока игрок не наберёт шкалу Супер-приза (100% / 1500+ ⭐ и друзей)!
 */
export function isPremiereRaceUnlocked(questState = getQuestState(), profile = null) {
  const pts = Math.max(0, Number(profile?.premierePoints || 0));
  const friends = Math.max(0, Number(profile?.friendsBrought || 0));
  const score = Math.max(0, Number(profile?.premiereScore || 0));
  return score >= 100 || (pts >= 1500 && friends >= 1);
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
        const localBefore = getLocalPreviewProfile();
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
          pendingTicketsCount: Math.max(
            Number(data.pending_tickets_count || 0),
            data.has_pending_ticket ? 1 : 0
          ),
          kpVerified: Boolean(data.kp_verified),
          packedCount: Number(data.packed_count || 0),
          friendsBrought: Number(data.friends_brought || 0),
          temuSurgeClaimed: Boolean(data.temu_surge_claimed),
          hasSocialConnection: Boolean(data.has_social_connection),
          repeatLinkEntered: Boolean(localBefore?.repeatLinkEntered),
          uiStage: Math.max(getStoredUiStage(), Number(data.ui_stage || 1)),
        };
        mapped.uiStage = computeEffectiveUiStage(mapped);
        safeWrite(UI_STAGE_STORAGE_KEY, String(mapped.uiStage));
        if (mapped.kpVerified) markKpScreenshotVerified();
        if (mapped.packedCount > 0) {
          const q = getQuestState();
          q.packedCount = Math.max(q.packedCount || 0, mapped.packedCount);
          q.friendsOpened = Math.max(q.friendsOpened || 0, mapped.friendsBrought);
          saveQuestState(q);
        }
        saveLocalPreviewProfile({ ...localBefore, ...mapped });
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
  let cloudIssued = false;
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

      if (!error && data?.ok) {
        cloudIssued = true;
      } else if (!isTestBogActive()) {
        // v13.0: Жёсткий серверный стоп-кран! Если Supabase активен и отклонил выпуск билета
        // (no_pending_ticket / campaign_ended_dec16 / sandbox_uid_blocked), локальный обход ЗАПРЕЩЁН!
        return {
          ok: false,
          reason: data?.reason || error?.message || 'no_pending_ticket',
        };
      }
    } catch (err) {
      if (!isTestBogActive()) {
        return { ok: false, reason: err?.message || 'server_ticket_error' };
      }
    }
  }

  // Локальный фоллбэк разрешён ТОЛЬКО в оффлайн-разработке (!db) или в изолированном ?testbog=1
  if (!cloudIssued) {
    const passes = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
    passes[giftId] = {
      id: giftId,
      status: 'issued',
      orderStatus: '',
      recipientName: cleanRecipient || 'Друг',
      recipientPhotoUrl: remotePhotoUrl || processedPassPhoto?.dataUrl || '',
      senderName: cleanSender || 'Друг',
      senderUid: uid,
      senderTgId: tgUser?.id ? String(tgUser.id) : '',
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
    : `https://t.me/${ENV.tgBotUsername || 'bochka_film_bot'}?startapp=${encodeURIComponent('gift_' + giftId)}`;

  return {
    ok: true,
    passId: giftId,
    giftId,
    shareUrl: tgUrl,
    tgUrl,
    webUrl,
    localFallback: !cloudIssued,
  };
}

/**
 * Загружает данные подарочной ссылки `startapp=gift_<id>` / `?gift=<id>`
 */
export async function loadGiftTicketPass(giftId, viewerTgUser = null) {
  if (!giftId) return null;
  const cleanId = giftId.trim();
  const viewerUid = getViewerUid(viewerTgUser);
  const localProf = getLocalPreviewProfile();
  const localQuest = getQuestState();
  const localIsExistingPlayer = Boolean(
    safeRead('bochka_existing_fighter', '') === '1' ||
      Number(localProf.premierePoints || 0) > 0 ||
      Number(localProf.packedCount || 0) > 0 ||
      Number(localQuest.packedCount || 0) > 0 ||
      Number(localProf.currentLevel || 1) > 1
  );

  const db = getCloudDb();

  if (db) {
    try {
      const { data, error } = await db.rpc('get_gift_pass_public', {
        p_short_id: cleanId,
        p_viewer_tg_id: viewerTgUser?.id || null,
      });
      if (!error && data?.ok) {
        const serverNowMs = Number(data.server_now_ms || Date.now());
        const isNotSender = data.sender_uid !== viewerUid;
        return {
          id: data.gift_id,
          status: data.status || 'issued',
          expiredReturned: Boolean(data.expired_returned || data.status === 'expired_returned'),
          isExistingPlayer: Boolean(isNotSender && (data.is_existing_player || localIsExistingPlayer)),
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

  const passes = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
  const entry = passes[cleanId] || {
    id: cleanId,
    status: 'issued',
    orderStatus: '',
    recipientName: 'АЛЕКСЕЙ (ПОЛУЧАТЕЛЬ БИЛЕТА)',
    recipientPhotoUrl: '',
    senderName: 'Друг из Цеха',
    senderUid: 'sandbox_other_sender',
    senderTgId: '',
    hasVerifiedPhone: false,
    verifiedPhone: '',
    cityCinema: '',
    bookingCode: '',
    ticketFileUrl: '',
    createdAtMs: Date.now(),
  };

  let expiredReturned = Boolean(entry.status === 'expired_returned');
  if (entry.status === 'issued' && entry.createdAtMs && Date.now() - entry.createdAtMs > 86400000) {
    entry.status = 'expired_returned';
    expiredReturned = true;
    passes[cleanId] = entry;
    safeWriteJson(PASSES_STORAGE_KEY, passes);
    localProf.hasPendingTicket = true;
    saveLocalPreviewProfile(localProf);
  }

  return {
    ...entry,
    expiredReturned,
    isExistingPlayer: Boolean(entry.senderUid !== viewerUid && localIsExistingPlayer),
    serverOffsetMs: 0,
  };
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
  pairReceiptUrl = '',
  pairSeatPref = '',
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
        pairReceiptUrl,
        pairSeatPref,
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
        pairReceiptUrl,
        pairSeatPref,
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
      p_pair_receipt_url: pairReceiptUrl || null,
      p_pair_seat_pref: pairSeatPref || '',
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
      pairSeatPref: data.pair_seat_pref || pairSeatPref,
      pairReceiptUrl: data.pair_receipt_url || pairReceiptUrl,
    });

    return {
      ok: true,
      orderId: data.order_id,
      verifiedPhone: data.verified_phone,
      cityCinema: data.city_cinema,
      pairReceiptUrl: data.pair_receipt_url || pairReceiptUrl,
      pairSeatPref: data.pair_seat_pref || pairSeatPref,
    };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export async function fetchTicketPoolStatus() {
  const db = getCloudDb();
  if (!db || isTestBogActive()) {
    return {
      ok: true,
      dailyIssued: 0,
      maxDaily: 8,
      dailyRemaining: 8,
      totalIssued: 0,
      maxTotal: 100,
      totalRemaining: 100,
      isPaused: false,
      requirePairReceipt: true,
    };
  }
  try {
    const { data, error } = await db.rpc('get_ticket_pool_status_rpc');
    if (!error && data?.ok) {
      return {
        ok: true,
        dailyIssued: Number(data.daily_issued || 0),
        maxDaily: Number(data.max_daily ?? 8),
        dailyRemaining: Number(data.daily_remaining ?? 0),
        totalIssued: Number(data.total_issued || 0),
        maxTotal: Number(data.max_total ?? 100),
        totalRemaining: Number(data.total_remaining ?? 0),
        isPaused: Boolean(data.is_paused),
        requirePairReceipt: data.require_pair_receipt !== false,
      };
    }
  } catch { /* ignore */ }
  return { ok: false, dailyRemaining: 8, maxDaily: 8, maxTotal: 100, requirePairReceipt: true };
}

export async function uploadPairTicketReceipt(giftId, blob) {
  if (!blob) return { ok: false, reason: 'no_file' };
  const db = getCloudDb();
  if (!db) {
    return { ok: true, url: 'local_receipt_preview', local: true };
  }
  const cleanId = String(giftId || 'pair').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'pair';
  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
  const path = `receipts/${cleanId}_${Date.now()}.${ext}`;
  try {
    const { error } = await db.storage
      .from(ENV.supabasePassesBucket)
      .upload(path, blob, {
        contentType: blob.type || 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
    if (error) return { ok: false, reason: error.message || 'upload_failed' };
    const { data: pub } = db.storage.from(ENV.supabasePassesBucket).getPublicUrl(path);
    return { ok: true, url: pub?.publicUrl || '' };
  } catch (err) {
    return { ok: false, reason: err?.message || 'upload_error' };
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
  const webUrl = `${base}/?duel=${clean}`;
  const tgMiniAppUrl = `https://t.me/${bot}?startapp=duel_${clean}`;
  const shareText = '⚔️ Залетай за стол «НА СЧЁТ ТРИ!» в цеху «БОЧКИ»!';
  return {
    webUrl,
    tgMiniAppUrl,
    tgUrl: `https://t.me/share/url?url=${encodeURIComponent(tgMiniAppUrl)}&text=${encodeURIComponent(shareText)}`,
  };
}

export function buildTrailerReferralLinks(tgUser = null) {
  const uid = encodeURIComponent(getViewerUid(tgUser));
  const base = resolveShareBaseUrl();
  const bot = ENV.tgBotUsername || 'bochka_film_bot';
  const webUrl = `${base}/?trailer=1&ref=${uid}`;
  const tgMiniAppUrl = `https://t.me/${bot}?startapp=ref_${uid}`;
  const shareText = '🎬 Смотри трейлер триллера «БОЧКА» и проверь интуицию в 3D-цеху:';
  return {
    webUrl,
    tgMiniAppUrl,
    tgUrl: `https://t.me/share/url?url=${encodeURIComponent(tgMiniAppUrl)}&text=${encodeURIComponent(shareText)}`,
  };
}

export async function recordPlayerMeta(tgUser = null) {
  if (!tgUser?.id) return { ok: false, skipped: true };
  const db = getCloudDb();
  if (!db) return { ok: false, skipped: true };
  try {
    await db.rpc('record_player_meta_rpc', {
      p_uid: getViewerUid(tgUser),
      p_avatar: tgUser.photoUrl || null,
      p_lang: tgUser.lang || null,
      p_username: tgUser.username || null,
      p_name: tgUser.name || null,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function recordTrafficSource(tgUser = null, sourceTag = '') {
  const cleanSrc = String(sourceTag || '').trim().toLowerCase();
  if (!cleanSrc) return { ok: false, skipped: true };
  const uid = getViewerUid(tgUser);
  const prof = getLocalPreviewProfile();
  if (!prof.trafficSource || prof.trafficSource === 'organic') {
    prof.trafficSource = cleanSrc;
    saveLocalPreviewProfile(prof);
  }
  const db = getCloudDb();
  if (db) {
    try {
      await db.rpc('record_traffic_source_rpc', {
        p_uid: uid,
        p_source: cleanSrc,
        p_tg_id: tgUser?.id || null,
        p_tg_username: tgUser?.username || null,
        p_display_name: tgUser?.name || '',
      });
    } catch { /* ignore */ }
  }
  return { ok: true, uid, trafficSource: prof.trafficSource || cleanSrc };
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
    const throttleKey = `bochka_ping_start_${pack.id}`;
    const lastTs = Number(safeRead(throttleKey, '0') || 0);
    if (Date.now() - lastTs > 15000) {
      safeWrite(throttleKey, String(Date.now()));
      await sendTelegramPing({
        clientAction: 'barrel_search_started',
        senderTgId,
        openerName: viewerTgUser?.name || 'Кент из чата',
        barrelId: pack.id,
        roomId,
        creditedLives,
      });
    }
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
    const prof = getLocalPreviewProfile();
    if (getStoredUiStage() < 4 && !prof?.hasSocialConnection) {
      return [];
    }
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
        prof.dailyBlitzPoints = Number(data.daily_blitz_points ?? prof.dailyBlitzPoints ?? 0);
        prof.hasPlayedSolo = true;
        saveLocalPreviewProfile(prof);
        return {
          ok: true,
          earnedPoints: Number(data.earned_points || 0),
          cooldownBlocked: Boolean(data.cooldown_blocked),
          cooldownRemainingSec: Number(data.cooldown_remaining_sec || 0),
          dailyBlitzPoints: Number(data.daily_blitz_points || 0),
          dailyBlitzCap: Number(data.daily_blitz_cap || 2000),
          dailyEventCode: String(data.daily_event_code || ''),
          currentLevel: prof.currentLevel,
          premierePoints: prof.premierePoints,
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  const isBlitz = level >= 8;
  const nowMs = Date.now();
  const elapsedSec = (nowMs - Number(prof.lastBlitzAtMs || 0)) / 1000;
  let cooldownBlocked = false;
  let cooldownRemainingSec = 0;
  let earned = 0;

  if (isBlitz && prof.lastBlitzAtMs && elapsedSec < 12) {
    cooldownBlocked = true;
    cooldownRemainingSec = Math.max(1, Math.min(12, Math.ceil(12 - elapsedSec)));
  } else {
    earned = Math.min(
      280,
      50 + Math.min(10, level) * 10 + Math.round(Math.max(0, Math.min(20, timeLeftSec)) * 2) + Math.max(0, Math.min(60, bonusPoints))
    );
    if (isBlitz) {
      const blitzToday = Number(prof.dailyBlitzPoints || 0);
      earned = Math.max(0, Math.min(earned, 2000 - blitzToday));
      prof.dailyBlitzPoints = blitzToday + earned;
      prof.lastBlitzAtMs = nowMs;
    }
  }

  prof.currentLevel = Math.max(prof.currentLevel || 1, level + 1);
  prof.premierePoints = (prof.premierePoints || 0) + earned;
  prof.hasPlayedSolo = true;
  saveLocalPreviewProfile(prof);
  return {
    ok: true,
    earnedPoints: earned,
    cooldownBlocked,
    cooldownRemainingSec,
    dailyBlitzPoints: Number(prof.dailyBlitzPoints || 0),
    dailyBlitzCap: 2000,
    dailyEventCode: 'DOUBLE_BLITZ',
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

/**
 * Уровень 3: аварийное восстановление +1 жизни за ОДНО целевое действие (kp | sub | like), раз в сутки на действие.
 */
export async function claimLifeRecovery(tgUser = null, kind = 'kp') {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('claim_life_recovery_rpc', { p_uid: uid, p_kind: kind });
      if (!error && data?.ok) {
        const prof = getLocalPreviewProfile();
        prof.lives = Number(data.lives ?? prof.lives);
        saveLocalPreviewProfile(prof);
        return { ok: true, granted: Boolean(data.granted), lives: Number(data.lives || 0), reason: data.reason || '' };
      }
    } catch { /* fallback below */ }
    return { ok: false, granted: false, lives: 0, reason: 'rpc_error' };
  }
  const prof = getLocalPreviewProfile();
  const key = `[life_${kind}]`;
  if (prof.lives > 0) return { ok: true, granted: false, lives: prof.lives, reason: 'has_lives' };
  if (String(prof.dailySocialMask || '').includes(key)) return { ok: true, granted: false, lives: prof.lives, reason: 'already_today' };
  prof.dailySocialMask = `${prof.dailySocialMask || ''}${key}`;
  prof.lives += 1;
  saveLocalPreviewProfile(prof);
  return { ok: true, granted: true, lives: prof.lives, reason: '' };
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
  mockLeaders.forEach((r) => {
    const friends = Number(r.friends_brought || 0);
    const bonusPct = Math.min(5, friends) * 10;
    const tier1Pts = friends >= 1 ? 150 : 0;
    r.friend_bonus_pct = bonusPct;
    r.referral_tier = friends >= 2 ? 2 : friends === 1 ? 1 : 0;
    r.qualified_top10 = friends >= 2 && Number(r.premiere_points || 0) > 0;
    r.effective_points = tier1Pts + Math.round(Number(r.premiere_points || 0) * (1 + bonusPct / 100));
  });
  mockLeaders.sort((a, b) => (Number(b.qualified_top10) - Number(a.qualified_top10)) || (b.effective_points - a.effective_points));
  mockLeaders.forEach((r, idx) => { r.rank = idx + 1; });
  const meEntry = mockLeaders.find((r) => r.uid === uid);
  const tenth = mockLeaders[9]?.effective_points || 0;

  return {
    ok: true,
    leaders: mockLeaders,
    tenthPoints: tenth,
    me: {
      uid,
      rank: meEntry?.rank || 11,
      qualified_top10: Boolean(meEntry?.qualified_top10),
      referral_tier: meEntry?.referral_tier || 0,
      in_top10: (meEntry?.rank || 11) <= 10 && Boolean(meEntry?.qualified_top10),
      premiere_points: myPts,
      effective_points: meEntry?.effective_points || myPts,
      friend_bonus_pct: meEntry?.friend_bonus_pct || 0,
      premiere_score: prof.premiereScore || 0,
      current_level: prof.currentLevel || 1,
      friends_brought: prof.friendsBrought || 0,
      tickets_gifted: prof.ticketsGifted || 0,
      duels_won: prof.duelsWon || 0,
      points_to_top10: Math.max(0, tenth - (meEntry?.effective_points || myPts) + ((meEntry?.rank || 11) > 10 ? 10 : 0)),
    },
  };
}

export async function fetchPublicRaffleTransparency() {
  const db = getCloudDb();
  if (!db) {
    return {
      ok: true,
      total_players: 16,
      total_strikes: 0,
      daily_tickets_issued: 0,
      max_daily_tickets: 5,
      premiere_winners_count: 0,
      max_premiere_winners: 20,
      is_paused: false,
    };
  }
  try {
    const { data, error } = await db.rpc('get_public_raffle_transparency');
    if (error || !data?.ok) throw error || new Error('raffle_transparency_failed');
    return data;
  } catch {
    return { ok: false };
  }
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

export async function awardV8LevelProgress(tgUser = null, { level = 1, pointsDelta = 0, livesDelta = 0 } = {}) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  const prof = getLocalPreviewProfile();
  prof.premierePoints = Math.max(0, Number(prof.premierePoints || 0) + Number(pointsDelta || 0));
  prof.lives = Math.max(0, Math.min(30, Number(prof.lives ?? 1) + Number(livesDelta || 0)));
  prof.currentLevel = Math.max(Number(prof.currentLevel || 1), Number(level || 1));

  if (db) {
    try {
      const { data, error } = await db.rpc('record_v8_level_reward_rpc', {
        p_uid: uid,
        p_level: Math.max(1, Math.round(level)),
        p_points_delta: Math.max(0, Math.round(pointsDelta)),
        p_lives_delta: Math.round(livesDelta),
      });
      if (!error && data?.ok) {
        prof.currentLevel = Number(data.current_level || prof.currentLevel);
        prof.premierePoints = Number(data.premiere_points ?? prof.premierePoints);
        prof.lives = Number(data.lives ?? prof.lives);
        saveLocalPreviewProfile(prof);
        return {
          ok: true,
          currentLevel: prof.currentLevel,
          premierePoints: prof.premierePoints,
          lives: prof.lives,
          referrerUid: data.referrer_uid || '',
          referrerTgId: data.referrer_tg_id || '',
        };
      }
    } catch { /* local fallback below */ }
  }

  saveLocalPreviewProfile(prof);
  return {
    ok: true,
    currentLevel: prof.currentLevel,
    premierePoints: prof.premierePoints,
    lives: prof.lives,
    referrerUid: '',
    referrerTgId: '',
  };
}

export async function checkFriendDuplicateConnection(senderUid, receiverTgUser = null, { senderTgId = '' } = {}) {
  const receiverUid = getViewerUid(receiverTgUser);
  const db = getCloudDb();
  if (db && senderUid && receiverUid && senderUid !== receiverUid) {
    try {
      const { data, error } = await db.rpc('check_and_record_friend_barrel_rpc', {
        p_sender_uid: String(senderUid),
        p_receiver_uid: String(receiverUid),
        p_sender_tg_id: senderTgId ? String(senderTgId) : null,
        p_receiver_tg_id: receiverTgUser?.id ? String(receiverTgUser.id) : null,
        p_receiver_name: receiverTgUser?.name || '',
      });
      if (!error && data) {
        return {
          ok: Boolean(data.ok),
          duplicate: Boolean(data.duplicate),
          message: data.message || '',
        };
      }
    } catch { /* fallback below */ }
  }

  const key = 'bochka_v8_friend_pairs';
  const pairs = safeReadJson(key, {}) || {};
  const pairId = `${senderUid}::${receiverUid}`;
  if (senderUid && receiverUid && senderUid !== receiverUid && pairs[pairId]) {
    return {
      ok: false,
      duplicate: true,
      message: 'Этот друг уже в деле! Ему теперь можно отправить только выигранный билет, а скример кинь новому другу.',
    };
  }
  if (senderUid && receiverUid && senderUid !== receiverUid) {
    pairs[pairId] = Date.now();
    safeWriteJson(key, pairs);
  }
  return { ok: true, duplicate: false, message: '' };
}

export async function fetchMyGameFriends(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('list_my_game_friends_rpc', { p_sender_uid: uid });
      if (!error && data?.ok && Array.isArray(data.friends)) {
        return data.friends;
      }
    } catch { /* fallback below */ }
  }
  return safeReadJson('bochka_v8_local_friends', []) || [];
}

export async function sendDirectGiftTicketToFriend({ tgUser, friend, giftId }) {
  return sendTelegramPing({
    clientAction: 'send_friend_ticket_dm',
    recipientTgId: friend?.receiver_tg_id || '',
    senderName: tgUser?.name || 'Твой друг',
    giftId,
  });
}

export async function notifyReferrerTicketWon({ tgUser, referrerTgId }) {
  if (!referrerTgId) return false;
  return sendTelegramPing({
    clientAction: 'notify_referrer_ticket_won',
    referrerTgId: String(referrerTgId),
    winnerName: tgUser?.name || 'Твой друг',
  });
}

export async function sendLevel1FriendReply({ pack, replyType, viewerTgUser }) {
  const action = replyType === 'wait_ticket' ? 'wait_ticket' : 'cinema_accept';
  const senderTgId = pack?.senderTgId || '';
  if (!senderTgId) return false;
  return sendTelegramPing({
    clientAction: action,
    senderTgId: String(senderTgId),
    openerName: viewerTgUser?.name || 'Твой друг',
    barrelId: pack?.id || '',
  });
}

export async function claimDuelPremiereBankReward(tgUser = null, { pointsBonus = 450, solo = false } = {}) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  const prof = getLocalPreviewProfile();
  prof.premierePoints = Math.max(0, Number(prof.premierePoints || 0) + Number(pointsBonus || 450));
  prof.duelsWon = Number(prof.duelsWon || 0) + 1;

  if (db) {
    try {
      const { data, error } = await db.rpc('award_duel_premiere_bank_rpc', {
        p_uid: uid,
        p_points_bonus: Math.max(0, Math.round(pointsBonus || 450)),
        p_solo: Boolean(solo),
      });
      if (!error && data?.ok) {
        prof.premierePoints = Number(data.premiere_points ?? prof.premierePoints);
        prof.lives = Number(data.lives ?? prof.lives);
        prof.duelsWon = Number(data.duels_won ?? prof.duelsWon);
        saveLocalPreviewProfile(prof);
        return {
          ok: true,
          premierePoints: prof.premierePoints,
          lives: prof.lives,
          ticketDropped: Boolean(data.ticket_dropped),
        };
      }
    } catch { /* fallback below */ }
  }
  saveLocalPreviewProfile(prof);
  return { ok: true, premierePoints: prof.premierePoints, lives: prof.lives, ticketDropped: false };
}

/**
 * v13.0: Атомарный запрос бесплатного билета в кино через жёсткий серверный пул Supabase
 * (проверяет is_paused, дату 16.12.2026, max_total_tickets, max_daily_tickets, hourly_cap).
 */
export async function registerSeedAdmin(tgUser = null, seedTag = 'seed_admin') {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (!db || isTestBogActive()) {
    return { ok: true, isSeedAdmin: true, local: true };
  }
  try {
    const { data, error } = await db.rpc('register_seed_admin_rpc', {
      p_uid: uid,
      p_tg_id: tgUser?.id || null,
      p_tg_username: tgUser?.username || null,
      p_display_name: tgUser?.name || '',
      p_seed_tag: String(seedTag || 'seed_admin').trim() || 'seed_admin',
    });
    if (!error && data?.ok) {
      return { ok: true, isSeedAdmin: Boolean(data.is_seed_admin) };
    }
    return { ok: false, isSeedAdmin: false };
  } catch {
    return { ok: false, isSeedAdmin: false };
  }
}

export async function requestServerCinemaTicket(tgUser = null, source = 'level3') {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db && !isTestBogActive()) {
    try {
      const { data, error } = await db.rpc('try_award_cinema_ticket_rpc', {
        p_uid: uid,
        p_source: source,
      });
      if (!error && data?.ok) {
        return {
          ok: true,
          granted: Boolean(data.granted),
          reason: data.reason || '',
          fallbackPoints: Number(data.fallback_points || 0),
          premierePoints: data.premiere_points != null ? Number(data.premiere_points) : null,
          pendingTicketsCount: Number(data.pending_tickets_count || 0),
          dailyIssued: Number(data.daily_tickets_issued || 0),
          maxDaily: Number(data.max_daily_tickets || 5),
          ticketsWon: Number(data.tickets_won || 0),
          maxTotal: Number(data.max_total_tickets || 150),
        };
      }
      return {
        ok: false,
        granted: false,
        reason: data?.reason || error?.message || 'rpc_error',
        fallbackPoints: 250,
      };
    } catch (err) {
      return { ok: false, granted: false, reason: err?.message || 'network_error', fallbackPoints: 250 };
    }
  }
  // Оффлайн-режим (!db) или ?testbog=1
  return { ok: true, granted: true, reason: 'local_preview', fallbackPoints: 0, pendingTicketsCount: 1 };
}

/**
 * v13.0: Серверная сверка жизненного цикла билетов в ticket_passes (24ч автовозврат + сгорание 16.12).
 */
export async function reconcileServerTicketPasses(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (!db || isTestBogActive()) return { ok: false, offline: true };
  try {
    const { data, error } = await db.rpc('reconcile_user_ticket_passes_rpc', { p_uid: uid });
    if (!error && data?.ok) {
      return {
        ok: true,
        returnedCount: Number(data.returned_count || 0),
        burnedCount: Number(data.burned_count || 0),
        pendingTicketsCount: Number(data.pending_tickets_count || 0),
        passes: Array.isArray(data.passes) ? data.passes : [],
      };
    }
  } catch { /* ignore */ }
  return { ok: false };
}

/**
 * v13.0: Серверный возврат неактивированного билета отправителем (с 10.12 или после 24ч).
 */
export async function reclaimServerTicketPass(tgUser = null, passId = '') {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (!db || isTestBogActive()) return { ok: true, offline: true };
  try {
    const { data, error } = await db.rpc('reclaim_gift_ticket_pass_rpc', {
      p_uid: uid,
      p_short_id: String(passId || '').trim(),
    });
    if (!error && data?.ok) {
      return { ok: true, pendingTicketsCount: Number(data.pending_tickets_count || 1) };
    }
    return { ok: false, reason: data?.reason || error?.message || 'reclaim_denied' };
  } catch (err) {
    return { ok: false, reason: err?.message || 'network_error' };
  }
}

function safeWriteJson(k, obj) {
  try {
    getActiveStorage().setItem(resolveKey(k), JSON.stringify(obj));
  } catch { /* ignore */ }
}
