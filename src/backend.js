import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';
import { saveLocalPackMedia, loadLocalPackMedia } from './voice.js';

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
 * Создаёт упакованную бочку:
 * - грузит портрет 512x512 WebP (<= 60 КБ) и голосовое Opus/WebM (<= 40 КБ) в Supabase Storage,
 * - сохраняет запись в public.barrels с коротким 7-буквенным ID,
 * - ВСЕГДА возвращает чистую короткую ссылку вида https://bochka.quest/?b=jakaqgx (без base64!).
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

export async function loadBarrelPack(rawParam) {
  if (!rawParam) return null;
  let decodedParam = rawParam;
  try {
    decodedParam = decodeURIComponent(rawParam);
  } catch { /* keep as is */ }

  const dotIdx = decodedParam.indexOf('.');
  const id = (dotIdx > 0 ? decodedParam.slice(0, dotIdx) : decodedParam).trim();
  const legacyToken = dotIdx > 0 ? decodedParam.slice(dotIdx + 1) : '';

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
 * Фиксирует финал раунда получателя, начисляет +2 жизни отправителю на сервере
 * и шлёт живой пуш в Telegram-бот.
 */
export async function recordBarrelResult(pack, { survived, attemptsUsed, timeLeft, viewerTgUser = null }) {
  if (!pack || !pack.id) return { notified: false };

  const viewerUid = getViewerUid(viewerTgUser);
  const openedGuardKey = `bochka_v2_opened_${pack.id}`;
  const alreadyOpenedByMe = safeRead(openedGuardKey, '') === '1';
  const isSelfOpen = Boolean(pack.senderUid && pack.senderUid === viewerUid);

  safeWrite(openedGuardKey, '1');

  const nextOpenedCount = !alreadyOpenedByMe && !isSelfOpen ? (pack.openedCount || 0) + 1 : (pack.openedCount || 0);
  let senderBonusCredited = 0;

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

      if (!alreadyOpenedByMe && !isSelfOpen) {
        const { data: cred } = await supabase.rpc('credit_friend_opened_lives', {
          p_barrel_id: pack.id,
          p_viewer_uid: viewerUid,
        });
        senderBonusCredited = cred?.credited || 0;
      }
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
  const bonusTail = !isSelfOpen ? ' Тебе начислено +2 жизни в Гонке за Премьерой!' : '';
  const notifyText = survived
    ? `🛢 БОЧКА: ${readerName} пробил цех и вскрыл твою бочку с ${attemptsUsed}-й попытки!${bonusTail}`
    : `💀 БОЧКА: ${readerName} остался в тёмном цеху Корпуса Б!${bonusTail}`;

  const notified = await sendTelegramPing({
    chatId: pack.senderTgId,
    text: notifyText,
    event: 'barrel_opened',
    barrelId: pack.id,
    survived,
    attemptsUsed,
    timeLeft,
    senderBonusCredited,
  });

  return { notified, senderBonusCredited };
}

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
   ГЛАВНАЯ СУПЕРИГРА v3.0: ГОНКА ЗА ПРЕМЬЕРОЙ (0..100) + ПРАВИЛО «ЧУЖОГО БИЛЕТА»
   На продакшене вся математика и лимиты считаются СТРОГО на сервере в Supabase RPC.
   Если ключи Supabase ещё не подключены, работает безопасное превью с потолком 99.9
   без выдачи реальных кодов кинотеатра.
   ============================================================================ */

function getLocalPreviewProfile() {
  const today = new Date().toISOString().slice(0, 10);
  const def = {
    premiereScore: 0,
    lives: 3,
    rawSharesToday: 0,
    rawSharesDay: today,
    easterEggClaimed: false,
    premiereWon: false,
    premiereCode: '',
    hasPendingTicket: false,
    demoStrikes: 0,
  };
  const saved = safeReadJson(PROFILE_STORAGE_KEY, null);
  const prof = saved ? { ...def, ...saved } : def;
  if (prof.rawSharesDay !== today) {
    prof.rawSharesToday = 0;
    prof.rawSharesDay = today;
    safeWriteJson(PROFILE_STORAGE_KEY, prof);
  }
  return prof;
}

function saveLocalPreviewProfile(prof) {
  safeWriteJson(PROFILE_STORAGE_KEY, prof);
}

export function isPremiereRaceUnlocked(state = getQuestState()) {
  return Boolean((state.packedCount || 0) >= 1);
}

export async function fetchPlayerProfile(tgUser = null) {
  const uid = getViewerUid(tgUser);
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('get_player_profile', {
        p_user_id: uid,
      });
      if (!error && data?.ok) {
        const mapped = {
          premiereScore: Number(data.premiere_score || 0),
          lives: Number(data.lives ?? 3),
          rawSharesToday: Number(data.raw_shares_today || 0),
          easterEggClaimed: Boolean(data.easter_egg_claimed),
          premiereWon: Boolean(data.premiere_won),
          premiereCode: data.premiere_code || '',
          hasPendingTicket: Boolean(data.has_pending_ticket),
        };
        saveLocalPreviewProfile({ ...getLocalPreviewProfile(), ...mapped });
        return mapped;
      }
    } catch { /* fallback below */ }
  }
  return getLocalPreviewProfile();
}

export async function playPremiereStrike(tgUser = null) {
  const uid = getViewerUid(tgUser);

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('play_premiere_strike', {
        p_user_id: uid,
      });
      if (!error && data) {
        return {
          ok: Boolean(data.ok),
          status: data.status || 'ok',
          outcome: data.outcome || 'empty_screamer',
          delta: Number(data.delta || 0),
          premiereScore: Number(data.premiere_score || 0),
          lives: Number(data.lives || 0),
          nearMiss: Boolean(data.near_miss),
          hasPendingTicket: Boolean(data.has_pending_ticket),
          premiereCode: data.premiere_code || '',
          contact: data.contact || '',
        };
      }
      return { ok: false, status: 'rpc_error' };
    } catch {
      return { ok: false, status: 'network_error' };
    }
  }

  // Безопасный оффлайн-превью режим (до подключения .env Supabase): потолок строго 99.9, реальных промокодов нет!
  const prof = getLocalPreviewProfile();
  if (prof.lives <= 0) {
    return {
      ok: false,
      status: 'no_lives',
      premiereScore: prof.premiereScore,
      lives: 0,
    };
  }

  prof.lives = Math.max(0, prof.lives - 1);
  prof.demoStrikes = (prof.demoStrikes || 0) + 1;

  // На 4-м ударе превью показываем механику «Золотой бочки с чужим билетом»
  if (!prof.hasPendingTicket && prof.demoStrikes === 4) {
    prof.hasPendingTicket = true;
    saveLocalPreviewProfile(prof);
    return {
      ok: true,
      outcome: 'golden_ticket',
      delta: 0,
      premiereScore: prof.premiereScore,
      lives: prof.lives,
      hasPendingTicket: true,
    };
  }

  let emptyProb = 0.18;
  let delta = 35.0;
  const s = prof.premiereScore;
  if (s < 35) { emptyProb = 0.14; delta = 45.0; }
  else if (s < 70) { emptyProb = 0.20; delta = 30.0; }
  else if (s < 90) { emptyProb = 0.26; delta = 16.0; }
  else if (s < 95) { emptyProb = 0.66; delta = 3.0; }
  else if (s < 98) { emptyProb = 0.70; delta = 1.5; }
  else if (s < 98.8) { emptyProb = 0.74; delta = 0.4; }
  else { emptyProb = 0.78; delta = 0.1; }

  if (Math.random() < emptyProb) {
    saveLocalPreviewProfile(prof);
    return {
      ok: true,
      outcome: 'empty_screamer',
      delta: 0,
      premiereScore: prof.premiereScore,
      lives: prof.lives,
      nearMiss: prof.premiereScore >= 90 && prof.lives === 0,
    };
  }

  const nextScore = Math.min(99.9, Number((prof.premiereScore + delta).toFixed(1)));
  const realDelta = Number((nextScore - prof.premiereScore).toFixed(1));
  prof.premiereScore = nextScore;
  saveLocalPreviewProfile(prof);

  return {
    ok: true,
    outcome: 'score_hit',
    delta: realDelta,
    premiereScore: prof.premiereScore,
    lives: prof.lives,
    nearMiss: prof.premiereScore >= 90 && prof.lives === 0,
  };
}

/**
 * Начисляет +1 жизнь сразу за отправку ссылки с бочкой другу (максимум 3 раза в сутки)
 */
export async function claimShareBonusLife(tgUser = null) {
  const uid = getViewerUid(tgUser);
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('claim_share_life', {
        p_user_id: uid,
      });
      if (!error && data?.ok) {
        return {
          granted: Number(data.granted || 0),
          lives: Number(data.lives || 0),
          rawSharesToday: Number(data.raw_shares_today || 0),
          capped: data.reason === 'daily_share_cap',
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  if (prof.rawSharesToday >= 3) {
    return {
      granted: 0,
      lives: prof.lives,
      rawSharesToday: prof.rawSharesToday,
      capped: true,
    };
  }
  prof.rawSharesToday += 1;
  prof.lives += 1;
  saveLocalPreviewProfile(prof);
  return {
    granted: 1,
    lives: prof.lives,
    rawSharesToday: prof.rawSharesToday,
    capped: false,
  };
}

/**
 * ПУТЬ А (Азарт): Сжечь выпавший обычный билет в топке цеха в обмен на множитель ×2 жизней!
 */
export async function burnRegularTicketForX2Lives(tgUser = null) {
  const uid = getViewerUid(tgUser);
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('burn_regular_ticket', {
        p_user_id: uid,
      });
      if (!error && data?.ok) {
        return { ok: true, lives: Number(data.lives || 4) };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  const prof = getLocalPreviewProfile();
  if (!prof.hasPendingTicket) return { ok: false };
  prof.hasPendingTicket = false;
  prof.lives = Math.max(4, prof.lives * 2);
  saveLocalPreviewProfile(prof);
  return { ok: true, lives: prof.lives };
}

/**
 * ПУТЬ Б (Подарок с фейс-контролем): Создать именной веб-пропуск для друга (?pass=ID).
 * Самому игроку промокод НЕ показывается — только получателю при активации пропуска!
 */
export async function createGiftTicketPass({
  tgUser = null,
  senderName = '',
  recipientName = '',
  processedPassPhoto,
}) {
  const passId = randomShortId(8);
  const uid = getViewerUid(tgUser);
  const cleanRecipient = (recipientName || '').trim().slice(0, 40);
  const cleanSender = (senderName || tgUser?.name || '').trim().slice(0, 32);

  if (cleanRecipient.length < 2 || !processedPassPhoto?.blob) {
    return { ok: false, error: 'missing_fields' };
  }

  let remotePhotoUrl = '';
  let storedInCloud = false;

  if (supabase) {
    try {
      const photoPath = `passes/${passId}.webp`;
      const { error: upErr } = await supabase.storage
        .from(ENV.supabaseBucket)
        .upload(photoPath, processedPassPhoto.blob, {
          contentType: processedPassPhoto.blob.type || 'image/webp',
          cacheControl: '604800',
          upsert: true,
        });

      if (!upErr) {
        const { data: pubData } = supabase.storage.from(ENV.supabaseBucket).getPublicUrl(photoPath);
        remotePhotoUrl = pubData?.publicUrl || '';
      }

      const { data, error } = await supabase.rpc('create_gift_ticket_pass', {
        p_user_id: uid,
        p_pass_id: passId,
        p_recipient_name: cleanRecipient,
        p_recipient_photo_url: remotePhotoUrl || 'local://pass',
        p_sender_name: cleanSender,
        p_sender_tg_id: tgUser?.id || null,
      });

      if (!error && data?.ok) {
        storedInCloud = true;
      } else {
        return { ok: false, error: data?.error || 'rpc_error' };
      }
    } catch {
      return { ok: false, error: 'network_error' };
    }
  } else {
    const prof = getLocalPreviewProfile();
    prof.hasPendingTicket = false;
    saveLocalPreviewProfile(prof);
  }

  await saveLocalPackMedia(`pass_${passId}`, {
    photoBlob: processedPassPhoto.blob,
    voiceBlob: null,
  });

  const localPasses = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
  localPasses[passId] = {
    id: passId,
    recipientName: cleanRecipient,
    recipientPhotoUrl: remotePhotoUrl || '',
    senderName: cleanSender,
    senderUid: uid,
    senderTgId: tgUser?.id || '',
    accepted: false,
    createdAt: Date.now(),
  };
  safeWriteJson(PASSES_STORAGE_KEY, localPasses);

  const baseOrigin = resolveShareBaseUrl();
  const sep = baseOrigin.includes('?') ? '&' : '?';
  const webUrl = `${baseOrigin}${sep}pass=${encodeURIComponent(passId)}`;
  const tgUrl =
    ENV.tgBotUsername && storedInCloud
      ? `https://t.me/${ENV.tgBotUsername}/${ENV.tgAppName}?startapp=${encodeURIComponent('pass_' + passId)}`
      : webUrl;

  return {
    ok: true,
    passId,
    shareUrl: tgUrl,
    webUrl,
  };
}

/**
 * Загружает данные Именного пропуска кинотеатра по ?pass=ID + смещение живых серверных часов
 */
export async function loadGiftTicketPass(passId) {
  if (!passId) return null;
  const cleanId = passId.trim();

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('get_gift_ticket_pass', {
        p_pass_id: cleanId,
      });
      if (!error && data?.ok) {
        let photoUrl = data.recipient_photo_url || '';
        if (!photoUrl || photoUrl.startsWith('local://')) {
          const media = await loadLocalPackMedia(`pass_${cleanId}`);
          if (media?.photoObjectUrl) photoUrl = media.photoObjectUrl;
        }
        const serverNowMs = Number(data.server_now_ms || Date.now());
        return {
          id: data.id,
          recipientName: data.recipient_name,
          recipientPhotoUrl: photoUrl,
          senderName: data.sender_name || '',
          senderUid: data.sender_uid || '',
          senderTgId: data.sender_tg_id || '',
          accepted: Boolean(data.accepted),
          ticketCode: data.ticket_code || '',
          contact: data.contact || '',
          serverOffsetMs: serverNowMs - Date.now(),
        };
      }
    } catch { /* fallback below */ }
  }

  const localPasses = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
  const entry = localPasses[cleanId];
  if (!entry) return null;

  let photoUrl = entry.recipientPhotoUrl || '';
  if (!photoUrl) {
    const media = await loadLocalPackMedia(`pass_${cleanId}`);
    if (media?.photoObjectUrl) photoUrl = media.photoObjectUrl;
  }

  return {
    ...entry,
    recipientPhotoUrl: photoUrl,
    ticketCode: entry.accepted ? 'DEMO-PASS-CONNECT-SUPABASE' : '',
    contact: 'Предъяви этот живой именной пропуск с часами контролёру или в боте фильма.',
    serverOffsetMs: 0,
  };
}

/**
 * Получатель активирует свой Именной билет -> отправителю начисляется множитель ×2 жизней!
 */
export async function acceptGiftTicketPass(passId, tgUser = null) {
  const viewerUid = getViewerUid(tgUser);

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('accept_gift_ticket_pass', {
        p_pass_id: passId,
        p_recipient_uid: viewerUid,
      });
      if (!error && data?.ok) {
        if (data.sender_tg_id) {
          await sendTelegramPing({
            chatId: data.sender_tg_id,
            text: `🎟 БОЧКА: Друг активировал твой именной билет в кино! Твои жизни умножены ×2 (сейчас: ${data.sender_lives})!`,
            event: 'gift_pass_accepted',
            passId,
          });
        }
        return {
          ok: true,
          ticketCode: data.ticket_code || '',
          contact: data.contact || '',
          serverOffsetMs: Number(data.server_now_ms || Date.now()) - Date.now(),
        };
      }
      return { ok: false, error: data?.error || 'rpc_error' };
    } catch {
      return { ok: false, error: 'network_error' };
    }
  }

  const localPasses = safeReadJson(PASSES_STORAGE_KEY, {}) || {};
  const entry = localPasses[passId];
  if (!entry) return { ok: false, error: 'not_found' };
  if (entry.senderUid === viewerUid) {
    return { ok: false, error: 'cannot_claim_own_ticket' };
  }
  entry.accepted = true;
  safeWriteJson(PASSES_STORAGE_KEY, localPasses);

  return {
    ok: true,
    ticketCode: 'DEMO-PASS-CONNECT-SUPABASE',
    contact: 'Демо-пропуск активирован (подключите Supabase для выдачи реальных кодов киносети).',
    serverOffsetMs: 0,
  };
}

/**
 * Секретная пасхалка «Достучаться до небес» (19 -> 97 -> 3 быстрых удара): разовый бонус +3 жизни!
 */
export async function claimEasterEgg1997Bonus(tgUser = null) {
  const uid = getViewerUid(tgUser);

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('claim_easter_egg_1997', {
        p_user_id: uid,
      });
      if (!error && data?.ok) {
        const prof = getLocalPreviewProfile();
        prof.easterEggClaimed = true;
        prof.lives = Number(data.lives ?? prof.lives);
        saveLocalPreviewProfile(prof);
        return {
          granted: Number(data.granted || 0),
          alreadyClaimed: Boolean(data.already_claimed),
          lives: Number(data.lives || 0),
        };
      }
    } catch { /* fallback below */ }
  }

  const prof = getLocalPreviewProfile();
  if (prof.easterEggClaimed) {
    return { granted: 0, alreadyClaimed: true, lives: prof.lives };
  }
  prof.easterEggClaimed = true;
  prof.lives += 3;
  saveLocalPreviewProfile(prof);
  return { granted: 3, alreadyClaimed: false, lives: prof.lives };
}

/* ============================================================================
   УПРАВЛЕНИЕ КВЕСТ-СОСТОЯНИЕМ И ЖЕТОНАМИ «КРЫШКИ»
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
