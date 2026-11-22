import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const ADMIN_CHAT_ID = Deno.env.get("ADMIN_TG_CHAT_ID") || "";
const ADMIN_NOTIFY_BIND_CODE = (Deno.env.get("ADMIN_NOTIFY_BIND_CODE") || "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const MINI_APP_LINK = "https://t.me/bochka_film_bot/play";
const PUBLIC_WEB_URL = "https://bochka.quest";
const KINOPOISK_URL = "https://www.kinopoisk.ru/film/11226275/";
const AFISHA_URL = "https://www.afisha.ru/movie/bochka-1005119/";

const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const encoder = new TextEncoder();
const duelPushThrottle = new Map<string, number>();

async function tgApi(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) return { ok: false, description: "missing_bot_token" };
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json().catch(() => ({ ok: false, description: "invalid_tg_json" }));
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function timingSafeEq(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Raw(keyBytes: Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyTelegramInitData(
  initDataRaw: string,
  botToken: string
): Promise<{ valid: boolean; userId: string | null }> {
  if (!initDataRaw || !botToken) return { valid: false, userId: null };
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get("hash") || "";
    const authDate = Number(params.get("auth_date") || "0");
    if (!hash || !Number.isFinite(authDate)) {
      return { valid: false, userId: null };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > 86400 * 7) {
      return { valid: false, userId: null };
    }

    const pairs: string[] = [];
    for (const [k, v] of params.entries()) {
      if (k !== "hash") pairs.push(`${k}=${v}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    const secretKeyBuf = await hmacSha256Raw(encoder.encode("WebAppData"), botToken);
    const computedBuf = await hmacSha256Raw(new Uint8Array(secretKeyBuf), dataCheckString);
    const computedHex = bufToHex(computedBuf);
    if (!timingSafeEq(computedHex, hash.toLowerCase())) {
      return { valid: false, userId: null };
    }

    let userId: string | null = null;
    const userJson = params.get("user");
    if (userJson) {
      const parsed = JSON.parse(userJson);
      if (parsed?.id) userId = String(parsed.id);
    }
    return { valid: true, userId };
  } catch {
    return { valid: false, userId: null };
  }
}

async function verifyAdminCaller(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || !SUPABASE_ANON_KEY) return false;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData?.user?.id) return false;

  const { data: adminRow } = await adminDb
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return Boolean(adminRow?.user_id);
}

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/[^0-9]/g, "");
  return digits ? `+${digits}` : "";
}

function parseNotifyChatIds(raw: string): string[] {
  const parts = String(raw || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^-?\d{5,20}$/.test(s));
  return Array.from(new Set(parts));
}

async function getConfiguredAdminNotifyChatIds(extraRaw = ""): Promise<string[]> {
  const { data: gs } = await adminDb
    .from("global_stats")
    .select("admin_notify_chat_ids")
    .eq("id", 1)
    .maybeSingle();
  const fromDb = parseNotifyChatIds(String(gs?.admin_notify_chat_ids || ""));
  const fromExtra = parseNotifyChatIds(extraRaw);
  const fromEnv = parseNotifyChatIds(ADMIN_CHAT_ID);
  return Array.from(new Set([...fromExtra, ...fromDb, ...fromEnv]));
}

async function notifyAdminsAutopilotViral(ap: Record<string, any>): Promise<number> {
  if (!ap?.viral_boosted) return 0;
  const targets = await getConfiguredAdminNotifyChatIds();
  if (!targets.length) return 0;
  const text =
    `🚀 <b>Автопилот «БОЧКА»: включён ВИРУСНЫЙ режим!</b>\n\n` +
    `📈 Игроков сегодня: <b>${Number(ap.today_players || 0)}</b>\n` +
    `🎟 Суточный лимит поднят до <b>${Number(ap.max_daily_tickets || 8)}</b> шт.\n` +
    `🛡 Общий пул расширен на <b>+${Number(ap.pool_added || 10)}</b> → <b>${Number(ap.max_total_tickets || 110)} / ${Number(ap.auto_pool_hard_cap || 150)}</b> (потолок защищён).`;
  let sent = 0;
  for (const cid of targets) {
    const res = await tgApi("sendMessage", {
      chat_id: cid,
      parse_mode: "HTML",
      text,
      reply_markup: {
        inline_keyboard: [[{ text: "🤖 Открыть пульт автопилота", url: `${PUBLIC_WEB_URL}/admin/` }]],
      },
    });
    if (res?.ok) sent += 1;
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResp({ ok: true, service: "bochka-tg-webhook" });
  }

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return jsonResp({ ok: false, error: "invalid_json" }, 400);
  }

  // =========================================================================
  // 1. ЗАЩИЩЁННЫЕ ДЕЙСТВИЯ ПРОДЮСЕРА ИЗ /admin (проверка Supabase Auth JWT)
  // =========================================================================
  if (body.adminAction) {
    const isAdmin = await verifyAdminCaller(req);
    if (!isAdmin) {
      return jsonResp({ ok: false, error: "unauthorized_admin" }, 403);
    }

    if (body.adminAction === "send_ticket") {
      const { orderId, bookingCode = "", ticketFileUrl = "" } = body;
      const cleanOrderId = String(orderId || "").trim();
      if (!cleanOrderId) {
        return jsonResp({ ok: false, tgSent: false, error: "invalid_order_id" }, 400);
      }

      const { data: ord, error: ordErr } = await adminDb
        .from("ticket_orders")
        .select("*")
        .eq("id", cleanOrderId)
        .maybeSingle();

      if (ordErr || !ord) {
        return jsonResp({ ok: false, tgSent: false, error: "order_not_found" }, 404);
      }

      if (!ord.receiver_tg_id) {
        return jsonResp({ ok: false, tgSent: false, error: "missing_receiver_tg_id" });
      }

      const captionLines = [
        "🎟 <b>ТВОЙ ЭЛЕКТРОННЫЙ БИЛЕТ НА ТРИЛЛЕР «БОЧКА» ГОТОВ!</b>",
        "",
        `📍 Кинотеатр / Город: <b>${escapeHtml(ord.city_cinema || "")}</b>`,
        bookingCode ? `🔢 Код брони / Комментарий: <code>${escapeHtml(bookingCode)}</code>` : "",
        "",
        "Покажи этот билет или код бронирования на кассе/терминале кинотеатра. До встречи в темноте с 17 декабря!",
      ].filter(Boolean).join("\n");

      let tgSent: Record<string, any> = { ok: false, description: "send_not_attempted" };
      if (ticketFileUrl && /\.(png|jpe?g|webp)(\?|$)/i.test(ticketFileUrl)) {
        tgSent = await tgApi("sendPhoto", {
          chat_id: ord.receiver_tg_id,
          photo: ticketFileUrl,
          caption: captionLines,
          parse_mode: "HTML",
        });
      } else if (ticketFileUrl) {
        tgSent = await tgApi("sendDocument", {
          chat_id: ord.receiver_tg_id,
          document: ticketFileUrl,
          caption: captionLines,
          parse_mode: "HTML",
        });
      } else {
        tgSent = await tgApi("sendMessage", {
          chat_id: ord.receiver_tg_id,
          text: captionLines,
          parse_mode: "HTML",
        });
      }

      // BUG-ADM3: НЕ переводим заявку в 'sent', если Telegram не доставил сообщение!
      if (!tgSent?.ok) {
        return jsonResp({
          ok: false,
          tgSent: false,
          error: tgSent?.description || "telegram_delivery_failed",
        });
      }

      await adminDb
        .from("ticket_orders")
        .update({
          status: "sent",
          booking_code: bookingCode,
          ticket_file_url: ticketFileUrl || ord.ticket_file_url,
          sent_at: new Date().toISOString(),
        })
        .eq("id", cleanOrderId);

      if (ord.gift_id) {
        await adminDb.from("ticket_passes").update({ status: "sent" }).eq("short_id", ord.gift_id);
      }

      return jsonResp({ ok: true, tgSent: true });
    }

    if (body.adminAction === "reject_order") {
      const { orderId, reason = "Отклонено модератором" } = body;
      await adminDb
        .from("ticket_orders")
        .update({ status: "rejected", booking_code: reason })
        .eq("id", String(orderId || "").trim());
      return jsonResp({ ok: true });
    }

    if (body.adminAction === "notify_premiere_winner") {
      const { tgUserId, premiereCode, displayName = "" } = body;
      let tgRes: Record<string, any> = { ok: false };
      if (tgUserId) {
        tgRes = await tgApi("sendMessage", {
          chat_id: tgUserId,
          parse_mode: "HTML",
          text:
            `🏆 <b>ПОЗДРАВЛЯЕМ${displayName ? `, ${escapeHtml(displayName)}` : ""}!</b>\n\n` +
            `Продюсеры фильма «БОЧКА» подтвердили твой именной пригласительный на <b>Закрытую Премьеру со съёмочной группой (17 декабря)</b>!\n\n` +
            `🔑 Твой VIP-код: <code>${escapeHtml(premiereCode || "")}</code>\n` +
            `Ответь на это сообщение своим ФИО для внесения в списки гостей на входе.`,
        });
      }
      return jsonResp({ ok: Boolean(tgRes?.ok), tgSent: Boolean(tgRes?.ok) });
    }

    if (body.adminAction === "test_admin_notify") {
      const rawOverride = typeof body.chatIds === "string" ? body.chatIds.trim() : "";
      const targets = rawOverride
        ? parseNotifyChatIds(rawOverride)
        : await getConfiguredAdminNotifyChatIds();
      if (!targets.length) {
        return jsonResp({ ok: false, error: "no_chat_ids_configured", sentCount: 0, totalTargets: 0 });
      }
      let sentCount = 0;
      const errors: string[] = [];
      for (const cid of targets) {
        const res = await tgApi("sendMessage", {
          chat_id: cid,
          parse_mode: "HTML",
          text:
            `🔔 <b>Тест уведомлений «БОЧКА» — связь работает!</b>\n\n` +
            `Сюда мгновенно будут приходить все новые брони бесплатных билетов с контактами зрителей и остатком пула.`,
          reply_markup: {
            inline_keyboard: [[{ text: "🖥 Открыть пульт выписки", url: `${PUBLIC_WEB_URL}/admin/` }]],
          },
        });
        if (res?.ok) sentCount += 1;
        else errors.push(`${cid}: ${res?.description || "send_failed"}`);
      }
      return jsonResp({
        ok: sentCount > 0,
        sentCount,
        totalTargets: targets.length,
        error: sentCount === 0 ? (errors[0] || "send_failed") : "",
      });
    }

    if (body.adminAction === "evaluate_autopilot") {
      const { data: apRes, error: apErr } = await adminDb.rpc("evaluate_campaign_autopilot_rpc", {
        p_now_msk: body.nowMsk || null,
        p_today_players_override: typeof body.todayPlayers === "number" ? body.todayPlayers : null,
        p_viral_threshold: typeof body.viralThreshold === "number" ? body.viralThreshold : null,
        p_force_recheck: Boolean(body.forceRecheck),
      });
      if (apErr || !apRes) {
        return jsonResp({ ok: false, error: apErr?.message || "autopilot_eval_failed" }, 500);
      }
      const adminNotified = await notifyAdminsAutopilotViral(apRes);
      return jsonResp({ ok: true, autopilot: apRes, adminNotified });
    }

    return jsonResp({ ok: false, error: "unknown_admin_action" }, 400);
  }

  // =========================================================================
  // 2. ЛЁГКИЕ СОЦИАЛЬНЫЕ ПУШИ МЕЖДУ ДРУЗЬЯМИ ИЗ ВЕБ-ИГРЫ / MINI APP
  // =========================================================================
  if (body.clientAction || body.event || body.action === "get_tg_avatar") {
    let verifiedCallerTgId: string | null = null;
    if (body.initData) {
      const check = await verifyTelegramInitData(String(body.initData), BOT_TOKEN);
      if (!check.valid) {
        return jsonResp({ ok: false, error: "invalid_telegram_init_data" }, 401);
      }
      verifiedCallerTgId = check.userId;
    }

    const action = body.clientAction || body.event || body.action;

    // v15.1 + v15.2: Нативная отправка карточки через Telegram WebApp.shareMessage (Bot API savePreparedInlineMessage)
    if (action === "prepare_share_message") {
      const tgUserId = Number(verifiedCallerTgId || body.tgUserId || 0);
      const rawBarrelId = String(body.barrelId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
      const linkType = String(body.linkType || "pack").toLowerCase();
      const senderName = escapeHtml(String(body.senderName || "Твой друг").slice(0, 48));
      const phrase = escapeHtml(String(body.phrase || "").slice(0, 140));
      const startParam =
        linkType === "duel"
          ? `duel_${rawBarrelId}`
          : linkType === "pr"
            ? `pr_${rawBarrelId}`
            : linkType === "bl"
              ? `bl_${rawBarrelId}`
              : `pack_${rawBarrelId}`;
      const botName = (Deno.env.get("TG_BOT_USERNAME") || "bochka_film_bot").replace(/^@/, "");
      const targetMiniAppUrl = rawBarrelId
        ? `https://t.me/${botName}?startapp=${startParam}`
        : MINI_APP_LINK;

      if (!tgUserId || !rawBarrelId) {
        return jsonResp({ ok: false, fallback: true, reason: "missing_params", shareUrl: targetMiniAppUrl, startParam });
      }

      const cardTitle =
        linkType === "duel"
          ? "⚔️ Залетай в Дуэль «НА СЧЁТ ТРИ!» в цеху «БОЧКИ»!"
          : linkType === "bl"
            ? "🛢 Вытащи меня из бочки — и собери билет в кино!"
            : "🛢 Кто-то заварил тебя в 3D-цеху «БОЧКИ»!";
      const cardText =
        linkType === "duel"
          ? `⚔️ <b>${senderName}</b> вызывает тебя за стол «НА СЧЁТ ТРИ!» в цеху триллера «БОЧКА»!\n\n` +
            `Залетай прямо в эту комнату — хватаем живые бочки синхронно за бесплатный билет и очки ТОП-20 на Закрытый показ в Москве 17 декабря!${phrase ? `\n\n💬 «${phrase}»` : ""}`
          : linkType === "bl"
            ? `🛢 <b>${senderName}</b> заварил себя в 3D-цеху триллера «БОЧКА»!\n\n` +
              `Надень наушники, найди нужную крышку за 3 удара и собери 4 обрывка бесплатного билета другу + шанс попасть в ТОП-20 на Закрытый показ в Москве 17 декабря!${phrase ? `\n\n💬 «${phrase}»` : ""}`
            : `🛢 <b>${senderName}</b> заварил тебя в цеху триллера «БОЧКА»!\n\n` +
              `У тебя 30 секунд воздуха и 3 удара ломом — прислушайся, откуда идёт стук, и забери билет в кино!${phrase ? `\n\n💬 «${phrase}»` : ""}`;
      const btnText = linkType === "duel" ? "⚔️ ЗАЛЕТЕТЬ В ДУЭЛЬ" : "🛢 ВСКРЫТЬ БОЧКУ";

      const preparedRes = await tgApi("savePreparedInlineMessage", {
        user_id: tgUserId,
        allow_user_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true,
        result: {
          type: "article",
          id: `bochka_${startParam}_${Date.now()}`,
          title: cardTitle,
          description: "Вскрой бочку за 3 удара и собери 4 части бесплатного билета на триллер «БОЧКА» (17 декабря)",
          thumbnail_url: `${PUBLIC_WEB_URL}/bochka_og_1280x720.jpg`,
          input_message_content: {
            message_text: cardText,
            parse_mode: "HTML",
            disable_web_page_preview: false,
          },
          reply_markup: {
            inline_keyboard: [[{ text: btnText, url: targetMiniAppUrl }]],
          },
        },
      });

      if (preparedRes?.ok && preparedRes?.result?.id) {
        return jsonResp({
          ok: true,
          preparedMessageId: String(preparedRes.result.id),
          shareUrl: targetMiniAppUrl,
          startParam,
        });
      }
      return jsonResp({
        ok: false,
        fallback: true,
        reason: preparedRes?.description || "bot_api_fallback",
        shareUrl: targetMiniAppUrl,
        startParam,
      });
    }

    // v14.3: Сводный пуш создателю многоразовой бочки ТОЛЬКО на круглых отметках (1, 10, 50, 100, 500, 1000, 5000)
    if (action === "broadcast_milestone" && body.senderTgId && body.barrelId) {
      const { data: bRow } = await adminDb
        .from("barrels")
        .select("short_id, sender_tg_id, is_broadcast, broadcast_prefix, visitor_seq")
        .eq("short_id", String(body.barrelId))
        .maybeSingle();
      if (!bRow || !bRow.is_broadcast || bRow.sender_tg_id !== String(body.senderTgId)) {
        return jsonResp({ ok: true, skipped: true });
      }
      const seq = Number(body.visitorSeq || bRow.visitor_seq || 0);
      const allowedMilestones = new Set([1, 10, 50, 100, 500, 1000, 5000]);
      if (!allowedMilestones.has(seq)) {
        return jsonResp({ ok: true, skipped: true, reason: "not_milestone" });
      }
      const prefix = escapeHtml(bRow.broadcast_prefix || "твоя бочка");
      await tgApi("sendMessage", {
        chat_id: body.senderTgId,
        parse_mode: "HTML",
        text:
          `🔥 <b>Твою бочку (${prefix}) открыли уже ${seq} чел.!</b>\n` +
          `Подписчики и друзья разносят волну по цепочке — статистика обновляется в реальном времени.`,
        reply_markup: {
          inline_keyboard: [[{ text: "🏆 ОТКРЫТЬ ЦЕХ «БОЧКИ»", url: MINI_APP_LINK }]],
        },
      });
      return jsonResp({ ok: true, milestone: seq });
    }

    if (action === "barrel_search_started" && body.senderTgId && body.barrelId) {
      const { data: bRow } = await adminDb
        .from("barrels")
        .select("short_id, sender_tg_id, is_broadcast")
        .eq("short_id", String(body.barrelId))
        .maybeSingle();
      if (!bRow || bRow.sender_tg_id !== String(body.senderTgId) || bRow.is_broadcast) {
        return jsonResp({ ok: true, skipped: true });
      }

      const opener = escapeHtml(body.openerName || "Твой друг");
      const credited = Number(body.creditedLives || 0);
      const barrelId = String(body.barrelId || "");
      const watchUrl = barrelId
        ? `${MINI_APP_LINK}?startapp=watch_${encodeURIComponent(barrelId)}`
        : MINI_APP_LINK;
      const duelUrl = barrelId
        ? `${MINI_APP_LINK}?startapp=duel_${encodeURIComponent(String(body.roomId || barrelId))}`
        : MINI_APP_LINK;

      const bonusLine = credited > 0
        ? `Лови <b>+${credited} ❤️ жизни</b> и <b>+2500 ⭐ очков</b> в рейтинг ТОП-10 Премьеры! Заходи подглядывать в реальном времени, по каким бочкам он лупит:`
        : `Заходи подглядывать в реальном времени за его ударами или перехвати его на стол дуэли:`;

      await tgApi("sendMessage", {
        chat_id: body.senderTgId,
        parse_mode: "HTML",
        text: `👀 <b>${opener} зашёл в цех и стучит по твоей бочке...</b>\n${bonusLine}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "👀 Подглядывать за игрой", url: watchUrl }],
            [{ text: "⚔️ Вызвать «На счёт три!»", url: duelUrl }],
          ],
        },
      });
      return jsonResp({ ok: true });
    }

    if (action === "record_write_access") {
      if (!verifiedCallerTgId) {
        return jsonResp({ ok: false, error: "telegram_auth_required" }, 401);
      }
      const callerTgId = String(verifiedCallerTgId);
      const callerUid = `tg_${callerTgId}`;
      const allowed = Boolean(body.allowed);
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = {
        tg_write_access: allowed,
        tg_write_access_at: nowIso,
        updated_at: nowIso,
      };
      if (allowed) {
        patch.tg_chat_id = callerTgId;
      }
      const { data: updatedRows } = await adminDb
        .from("users")
        .update(patch)
        .eq("uid", callerUid)
        .select("uid");
      if (!updatedRows || updatedRows.length === 0) {
        await adminDb.from("users").upsert(
          {
            uid: callerUid,
            tg_user_id: callerTgId,
            tg_chat_id: allowed ? callerTgId : null,
            tg_write_access: allowed,
            tg_write_access_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "uid" }
        );
      }
      return jsonResp({ ok: true, uid: callerUid, tgWriteAccess: allowed, allowed });
    }

    if (action === "get_tg_avatar") {
      if (!verifiedCallerTgId) {
        return jsonResp({ ok: false, error: "telegram_auth_required" }, 401);
      }
      const userIdNum = Number(verifiedCallerTgId);
      if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
        return jsonResp({ ok: false, error: "invalid_tg_id" }, 400);
      }
      try {
        const photosRes = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userIdNum, limit: 1 }),
          }
        );
        const photosJson = await photosRes.json();
        const sizes = photosJson?.result?.photos?.[0];
        if (!Array.isArray(sizes) || sizes.length === 0) {
          return jsonResp({ ok: true, hasAvatar: false, dataUrl: "" });
        }
        // Pick medium-high size (~320-640px) for sharp barrel reveal without bloat
        const picked = sizes.length >= 2 ? sizes[Math.min(sizes.length - 1, 1)] : sizes[0];
        const fileId = picked?.file_id;
        if (!fileId) {
          return jsonResp({ ok: true, hasAvatar: false, dataUrl: "" });
        }
        const fileRes = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_id: fileId }),
          }
        );
        const fileJson = await fileRes.json();
        const filePath = String(fileJson?.result?.file_path || "");
        if (!filePath || filePath.includes("..")) {
          return jsonResp({ ok: true, hasAvatar: false, dataUrl: "" });
        }
        const imgRes = await fetch(
          `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
        );
        if (!imgRes.ok) {
          return jsonResp({ ok: true, hasAvatar: false, dataUrl: "" });
        }
        const ab = await imgRes.arrayBuffer();
        if (ab.byteLength === 0 || ab.byteLength > 450_000) {
          return jsonResp({ ok: true, hasAvatar: false, dataUrl: "" });
        }
        const bytes = new Uint8Array(ab);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        const mime = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        const dataUrl = `data:${mime};base64,${btoa(bin)}`;
        return jsonResp({ ok: true, hasAvatar: true, dataUrl });
      } catch {
        return jsonResp({ ok: true, hasAvatar: false, dataUrl: "" });
      }
    }

    if ((action === "barrel_opened" || action === "opened") && body.senderTgId) {
      if (body.barrelId) {
        const { data: bCheck } = await adminDb
          .from("barrels")
          .select("is_broadcast")
          .eq("short_id", String(body.barrelId))
          .maybeSingle();
        if (bCheck?.is_broadcast) {
          return jsonResp({ ok: true, skipped: true, reason: "broadcast_no_spam" });
        }
      }
      const { data: sUser } = await adminDb
        .from("users")
        .select("tg_user_id")
        .eq("tg_user_id", String(body.senderTgId))
        .limit(1)
        .maybeSingle();
      if (!sUser) return jsonResp({ ok: true, skipped: true });

      const openerName = escapeHtml(body.openerName || "Твой друг");
      const survived = body.survived !== false;
      const elapsedSec = Math.max(1, Math.round(Number(body.elapsedSec || 12)));
      const screamerLabel = body.screamerLabel ? ` (${escapeHtml(String(body.screamerLabel))})` : "";
      await tgApi("sendMessage", {
        chat_id: body.senderTgId,
        parse_mode: "HTML",
        text: survived
          ? `🔓 <b>${openerName} выбрался за ${elapsedSec} сек и уже закатывает ответную бочку!</b>\nГолосовое послание прозвучало — готовься встречать ответный вызов!`
          : `💥 <b>${openerName} спустил весь воздух на ${elapsedSec}-й секунде и словил твой скример${screamerLabel}!</b>\nСобери карточку для чата или закатай его снова.`,
        reply_markup: {
          inline_keyboard: [[{ text: "🏆 В ЦЕХ: РЕЙТИНГ И ПРЕМЬЕРА", url: MINI_APP_LINK }]],
        },
      });
      return jsonResp({ ok: true });
    }

    if ((action === "reaction_cinema" || action === "cinema_accept" || action === "accepted_cinema") && (body.senderTgId || body.barrelId)) {
      let targetSenderTgId = String(body.senderTgId || "").trim();
      if (!targetSenderTgId && body.barrelId) {
        const { data: bRow } = await adminDb
          .from("barrels")
          .select("sender_tg_id")
          .eq("short_id", String(body.barrelId))
          .maybeSingle();
        if (bRow?.sender_tg_id) targetSenderTgId = String(bRow.sender_tg_id);
      }
      if (!targetSenderTgId) return jsonResp({ ok: true, skipped: true, tgSent: false });

      const { data: sUser } = await adminDb
        .from("users")
        .select("tg_user_id")
        .eq("tg_user_id", targetSenderTgId)
        .limit(1)
        .maybeSingle();
      if (!sUser) return jsonResp({ ok: true, skipped: true, tgSent: false });

      const opener = escapeHtml(body.openerName || "Твой друг");
      const sendRes = await tgApi("sendMessage", {
        chat_id: targetSenderTgId,
        parse_mode: "HTML",
        text:
          `🍿 <b>Твой друг ${opener} нашёл тебя в бочке и согласен идти с тобой в кино 17 декабря!</b>\n` +
          `Зови остальных в цех и занимайте соседние места на премьеру «БОЧКИ»!`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🎬 Буду смотреть (Кинопоиск)", url: KINOPOISK_URL },
              { text: "🎟 Афиша.ру", url: AFISHA_URL },
            ],
            [{ text: "🛢 Войти в цех", web_app: { url: `${PUBLIC_WEB_URL}/` } }],
          ],
        },
      });
      return jsonResp({ ok: true, tgSent: Boolean(sendRes?.ok), tgError: sendRes?.description || "" });
    }

    if ((action === "reaction_ask_ticket" || action === "wait_ticket") && body.senderTgId) {
      const { data: sUser } = await adminDb
        .from("users")
        .select("tg_user_id")
        .eq("tg_user_id", String(body.senderTgId))
        .limit(1)
        .maybeSingle();
      if (!sUser) return jsonResp({ ok: true, skipped: true });

      const opener = escapeHtml(body.openerName || "Твой друг");
      await tgApi("sendMessage", {
        chat_id: body.senderTgId,
        parse_mode: "HTML",
        text:
          `🎟 <b>Твой друг ${opener} открыл бочку и ждёт от тебя билет!</b>\n` +
          `Играй дальше, чтобы выиграть бесплатный билет для него!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎁 Подарить / Выбить билет другу", url: `${MINI_APP_LINK}?startapp=giftfork` }],
          ],
        },
      });
      return jsonResp({ ok: true });
    }

    if (action === "send_friend_ticket_dm" && body.recipientTgId && body.giftId) {
      const sender = escapeHtml(body.senderName || "Твой друг");
      const giftId = String(body.giftId);
      const sendRes = await tgApi("sendMessage", {
        chat_id: body.recipientTgId,
        parse_mode: "HTML",
        text:
          `🎟 <b>${sender} собрал в «БОЧКЕ» бесплатный билет в кино (из 4 частей) и подарил его ТЕБЕ!</b>\n` +
          `Нажми кнопку ниже, оставь бронь на удобный город и кинотеатр (без чеков и доплат) — как только откроются продажи на 17 декабря, пришлём готовый QR-код прямо сюда!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎟 ЗАБРОНИРОВАТЬ БЕСПЛАТНЫЙ БИЛЕТ", web_app: { url: `${PUBLIC_WEB_URL}/?gift=${encodeURIComponent(giftId)}` } }],
          ],
        },
      });
      return jsonResp({ ok: true, tgSent: Boolean(sendRes?.ok), tgError: sendRes?.description || "" });
    }

    if (action === "notify_referrer_ticket_won" && body.referrerTgId) {
      const { data: rUser } = await adminDb
        .from("users")
        .select("tg_user_id")
        .eq("tg_user_id", String(body.referrerTgId))
        .limit(1)
        .maybeSingle();
      if (!rUser) return jsonResp({ ok: true, skipped: true });

      const winner = escapeHtml(body.winnerName || "Твой друг");
      await tgApi("sendMessage", {
        chat_id: body.referrerTgId,
        parse_mode: "HTML",
        text:
          `🎟 <b>Твой друг ${winner} только что выиграл билет в кино в БОЧКЕ!</b>\n` +
          `Заходи в цех — там ещё остались билеты!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🛢 ЗАЙТИ В ЦЕХ ЗА БИЛЕТОМ", url: MINI_APP_LINK }],
          ],
        },
      });
      return jsonResp({ ok: true });
    }

    if (action === "reaction_duel_3p" && body.senderTgId) {
      const { data: sUser } = await adminDb
        .from("users")
        .select("tg_user_id")
        .eq("tg_user_id", String(body.senderTgId))
        .limit(1)
        .maybeSingle();
      if (!sUser) return jsonResp({ ok: true, skipped: true });

      const opener = escapeHtml(body.openerName || "Твой друг");
      const roomId = String(body.roomId || "room3");
      await tgApi("sendMessage", {
        chat_id: body.senderTgId,
        parse_mode: "HTML",
        text:
          `🔥 <b>СТОЛ НА ТРОИХ ОТКРЫТ!</b>\n` +
          `<b>${opener}</b> открыл синхронную комнату «НА СЧЁТ ТРИ!» — заходи разыграть ещё одного кента за банк из 3 ❤️ жизней и бонус Цеха к Премьере!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚔️ ЗАХОДИ В КОМНАТУ НА ТРОИХ!", url: `${MINI_APP_LINK}?startapp=duel_${encodeURIComponent(roomId)}` }],
          ],
        },
      });
      return jsonResp({ ok: true });
    }

    if (action === "duel_challenge" && body.targetTgId) {
      const { data: tUser } = await adminDb
        .from("users")
        .select("tg_user_id")
        .eq("tg_user_id", String(body.targetTgId))
        .limit(1)
        .maybeSingle();
      if (!tUser) return jsonResp({ ok: true, skipped: true });

      const challenger = escapeHtml(body.challengerName || "Кент из Цеха");
      const roomId = String(body.roomId || "duel");
      await tgApi("sendMessage", {
        chat_id: body.targetTgId,
        parse_mode: "HTML",
        text:
          `⚡ <b>ОБА УЖЕ ТЁРТЫЕ В ЦЕХУ! ВЫЗОВ НА ВЫБЫВАНИЕ!</b>\n` +
          `<b>${challenger}</b> ждёт тебя за столом «НА СЧЁТ ТРИ!» (2–3 игрока). Кто быстрее займёт безопасную бочку — забирает весь банк жизней и очки ТОП-10 Премьеры!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚔️ ПРИНЯТЬ ВЫЗОВ «НА СЧЁТ ТРИ!»", web_app: { url: `${PUBLIC_WEB_URL}/?duel=${encodeURIComponent(roomId)}` } }],
          ],
        },
      });
      return jsonResp({ ok: true });
    }

    // v15.2: Массовый пуш от бота ВСЕМ друзьям, кто играл в «БОЧКУ», с прямым входом за стол дуэли
    if (action === "duel_push_all_friends") {
      if (!verifiedCallerTgId) {
        return jsonResp({ ok: false, error: "telegram_auth_required" }, 401);
      }
      const callerTgId = String(verifiedCallerTgId);
      const callerUid = `tg_${callerTgId}`;
      const roomId = String(body.roomId || "duel").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "duel";
      const challenger = escapeHtml(String(body.challengerName || "Друг из цеха").slice(0, 48));
      const needCount = Math.max(1, Math.min(2, Number(body.needCount || 2)));

      const candidateTgIds = new Set<string>();
      const candidateUids = new Set<string>();

      // 1. Все прямые связи из social_connections
      const { data: scRows } = await adminDb
        .from("social_connections")
        .select("sender_uid, receiver_uid, sender_tg_id, receiver_tg_id")
        .or(`sender_uid.eq.${callerUid},receiver_uid.eq.${callerUid},sender_tg_id.eq.${callerTgId},receiver_tg_id.eq.${callerTgId}`)
        .limit(60);
      for (const r of scRows || []) {
        if (r.sender_tg_id && String(r.sender_tg_id) !== callerTgId) candidateTgIds.add(String(r.sender_tg_id));
        if (r.receiver_tg_id && String(r.receiver_tg_id) !== callerTgId) candidateTgIds.add(String(r.receiver_tg_id));
        if (r.sender_uid && r.sender_uid !== callerUid) candidateUids.add(String(r.sender_uid));
        if (r.receiver_uid && r.receiver_uid !== callerUid) candidateUids.add(String(r.receiver_uid));
      }

      // 2. Кто открывал мои бочки (barrel_opens_ledger + barrels)
      const { data: myBarrels } = await adminDb
        .from("barrels")
        .select("short_id")
        .eq("sender_uid", callerUid)
        .limit(30);
      const myBarrelIds = (myBarrels || []).map((b: { short_id: string }) => b.short_id).filter(Boolean);
      if (myBarrelIds.length > 0) {
        const { data: opens } = await adminDb
          .from("barrel_opens_ledger")
          .select("opener_uid")
          .in("barrel_id", myBarrelIds)
          .limit(60);
        for (const o of opens || []) {
          if (o.opener_uid && o.opener_uid !== callerUid) candidateUids.add(String(o.opener_uid));
        }
      }

      // 3. Чьи бочки открывал я
      const { data: openedByMe } = await adminDb
        .from("barrel_opens_ledger")
        .select("barrel_id")
        .eq("opener_uid", callerUid)
        .limit(40);
      const openedIds = (openedByMe || []).map((o: { barrel_id: string }) => o.barrel_id).filter(Boolean);
      if (openedIds.length > 0) {
        const { data: srcBarrels } = await adminDb
          .from("barrels")
          .select("sender_uid, sender_tg_id")
          .in("short_id", openedIds)
          .limit(40);
        for (const sb of srcBarrels || []) {
          if (sb.sender_tg_id && String(sb.sender_tg_id) !== callerTgId) candidateTgIds.add(String(sb.sender_tg_id));
          if (sb.sender_uid && sb.sender_uid !== callerUid) candidateUids.add(String(sb.sender_uid));
        }
      }

      // 4. Резолвим tg_user_id для собранных uid
      if (candidateUids.size > 0) {
        const { data: uRows } = await adminDb
          .from("users")
          .select("uid, tg_user_id")
          .in("uid", Array.from(candidateUids).slice(0, 60));
        for (const u of uRows || []) {
          if (u.tg_user_id && String(u.tg_user_id) !== callerTgId) candidateTgIds.add(String(u.tg_user_id));
        }
      }

      // 5. Игроки из той же ветки/компании + недавно активные игроки «БОЧКИ» (если прямых друзей < 15)
      if (candidateTgIds.size < 15) {
        const { data: recentUsers } = await adminDb
          .from("users")
          .select("tg_user_id, display_name")
          .not("tg_user_id", "is", null)
          .neq("tg_user_id", callerTgId)
          .order("updated_at", { ascending: false })
          .limit(25);
        for (const ru of recentUsers || []) {
          const tid = String(ru.tg_user_id || "").trim();
          const dname = String(ru.display_name || "");
          if (tid && /^\d+$/.test(tid) && tid !== callerTgId && !dname.startsWith("QA_TEST_")) {
            candidateTgIds.add(tid);
          }
          if (candidateTgIds.size >= 20) break;
        }
      }

      const nowMs = Date.now();
      const targets = Array.from(candidateTgIds)
        .filter((tid) => /^\d+$/.test(tid) && tid !== callerTgId)
        .slice(0, 20);

      let sentCount = 0;
      let throttledCount = 0;
      const duelWebUrl = `${PUBLIC_WEB_URL}/?duel=${encodeURIComponent(roomId)}`;

      await Promise.allSettled(
        targets.map(async (targetTgId) => {
          const key = `${roomId}:${targetTgId}`;
          const lastAt = duelPushThrottle.get(key) || 0;
          if (nowMs - lastAt < 45000) {
            throttledCount += 1;
            return;
          }
          const res = await tgApi("sendMessage", {
            chat_id: targetTgId,
            parse_mode: "HTML",
            text:
              `⚔️ <b>ВЫЗОВ В ДУЭЛЬ «НА СЧЁТ ТРИ!»</b>\n\n` +
              `<b>${challenger}</b> уже ждёт за столом в цеху «БОЧКИ» (нужно ещё ${needCount})!\n` +
              `Залетай прямо сейчас — хватаем живые бочки синхронно за бесплатный билет и очки ТОП-20 на Закрытый показ в Москве 17 декабря!`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "⚔️ ЗАЛЕТЕТЬ В ДУЭЛЬ", web_app: { url: duelWebUrl } }],
              ],
            },
          });
          if (res?.ok) {
            duelPushThrottle.set(key, nowMs);
            sentCount += 1;
          }
        })
      );

      return jsonResp({
        ok: true,
        sentCount,
        throttledCount,
        totalCandidates: targets.length,
        roomId,
      });
    }

    if (action === "gift_order_created") {
      const { senderTgId, receiverTgId, receiverName = "", receiverUsername = "", phone = "", cityCinema = "" } = body;
      const { data: ordRow } = await adminDb
        .from("ticket_orders")
        .select("id, sender_uid, receiver_name, receiver_username, verified_phone, city_cinema")
        .eq("receiver_tg_id", String(receiverTgId || ""))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ordRow) {
        return jsonResp({ ok: true, skipped: true });
      }

      const finalCity = String(cityCinema || ordRow.city_cinema || "любой удобный").trim();
      const finalPhone = normalizePhone(String(phone || ordRow.verified_phone || ""));
      const finalReceiverName = String(receiverName || ordRow.receiver_name || "Игрок").trim();
      const finalReceiverUser = String(receiverUsername || ordRow.receiver_username || "").replace(/^@/, "").trim();

      // Получаем данные отправителя и статистику пула
      let senderRow: Record<string, any> | null = null;
      if (senderTgId) {
        const { data } = await adminDb
          .from("users")
          .select("display_name, tg_username, referred_by_uid")
          .eq("tg_user_id", String(senderTgId))
          .limit(1)
          .maybeSingle();
        senderRow = data || null;
      } else if (ordRow.sender_uid) {
        const { data } = await adminDb
          .from("users")
          .select("display_name, tg_username, referred_by_uid")
          .eq("uid", String(ordRow.sender_uid))
          .limit(1)
          .maybeSingle();
        senderRow = data || null;
      }

      const { data: gsRow } = await adminDb
        .from("global_stats")
        .select("tickets_won, max_total_tickets, daily_tickets_issued, max_daily_tickets, admin_notify_chat_ids")
        .eq("id", 1)
        .maybeSingle();

      if (senderTgId) {
        const sessionLabel = escapeHtml(finalCity);
        await tgApi("sendMessage", {
          chat_id: senderTgId,
          parse_mode: "HTML",
          text:
            `🎟 <b>Твой друг забронировал бесплатный билет в ${sessionLabel}!</b>\n\n` +
            `Как только откроются продажи на 17 декабря, бери соседнее место рядом — жми «Буду смотреть» на Кинопоиске или подпишись на старт продаж на Афише!\n\n` +
            `+ Тебе начислено <b>+3 ❤️ жизней и +300 ⭐</b> в рейтинг Закрытого показа в Москве 17 декабря!`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎬 Буду смотреть (Кинопоиск)", url: KINOPOISK_URL }],
              [{ text: "🎟 Купить билет / Афиша.ру", url: AFISHA_URL }],
            ],
          },
        });

        // Перекрёстное уведомление рефереру отправителя
        if (senderRow?.referred_by_uid) {
          const { data: refRow } = await adminDb
            .from("users")
            .select("tg_user_id")
            .eq("uid", senderRow.referred_by_uid)
            .limit(1)
            .maybeSingle();
          if (refRow?.tg_user_id && String(refRow.tg_user_id) !== String(senderTgId)) {
            await tgApi("sendMessage", {
              chat_id: refRow.tg_user_id,
              parse_mode: "HTML",
              text:
                `🎟 <b>Твой друг ${escapeHtml(senderRow.display_name || "Игрок")} только что подарил билет в кино в БОЧКЕ!</b>\n` +
                `Заходи в цех — там ещё остались билеты!`,
              reply_markup: {
                inline_keyboard: [[{ text: "🛢 ЗАЙТИ В ЦЕХ ЗА БИЛЕТОМ", url: MINI_APP_LINK }]],
              },
            });
          }
        }
      }

      if (receiverTgId) {
        await tgApi("sendMessage", {
          chat_id: receiverTgId,
          parse_mode: "HTML",
          text:
            `🎟 <b>Бронь закреплена за твоим номером!</b>\n\n` +
            `📍 Пожелание: <b>${escapeHtml(finalCity)}</b>\n` +
            `📱 Номер: <code>${escapeHtml(finalPhone)}</code>\n\n` +
            `Как только кинотеатры откроют продажи на 17 декабря (обычно за 4–7 дней до премьеры), мы выкупим билет и пришлём готовый QR-код прямо сюда в бот @bochka_film_bot.`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎬 Буду смотреть (Кинопоиск)", url: KINOPOISK_URL }],
              [{ text: "🎟 Купить билет / Афиша.ру", url: AFISHA_URL }],
            ],
          },
        });
      }

      const notifyChats = Array.from(
        new Set([
          ...parseNotifyChatIds(String(gsRow?.admin_notify_chat_ids || "")),
          ...parseNotifyChatIds(ADMIN_CHAT_ID),
        ])
      );

      if (notifyChats.length > 0) {
        const whoLabel = finalReceiverUser
          ? `${escapeHtml(finalReceiverName)} (@${escapeHtml(finalReceiverUser)})`
          : escapeHtml(finalReceiverName);
        const senderUsername = String(senderRow?.tg_username || "").replace(/^@/, "").trim();
        const senderLabel = senderUsername
          ? `@${escapeHtml(senderUsername)}`
          : escapeHtml(senderRow?.display_name || (senderTgId ? `tg_${senderTgId}` : "игрок"));
        const poolUsed = Number(gsRow?.tickets_won || 0);
        const poolMax = Number(gsRow?.max_total_tickets ?? 100);
        const dailyUsed = Number(gsRow?.daily_tickets_issued || 0);
        const dailyMax = Number(gsRow?.max_daily_tickets ?? 6);

        const adminCardText =
          `🎟 <b>Новая бронь билета «БОЧКА»</b>\n\n` +
          `👤 <b>Кому:</b> ${whoLabel}${finalPhone ? `, <code>${escapeHtml(finalPhone)}</code>` : ""}\n` +
          `📍 <b>Куда хочет:</b> <b>${escapeHtml(finalCity)}</b>\n` +
          `🎁 <b>Подарил:</b> ${senderLabel}\n` +
          `📊 <b>Пул:</b> ${poolUsed}/${poolMax} (сегодня ${dailyUsed}/${dailyMax})`;

        for (const cid of notifyChats) {
          await tgApi("sendMessage", {
            chat_id: cid,
            parse_mode: "HTML",
            text: adminCardText,
            reply_markup: {
              inline_keyboard: [[{ text: "🖥 Открыть пульт выписки", url: `${PUBLIC_WEB_URL}/admin/` }]],
            },
          });
        }
      }

      // v15.5: Оценка Умного автопилота при выдаче билета (если вирусный всплеск — пуш админу!)
      try {
        const { data: apRes } = await adminDb.rpc("evaluate_campaign_autopilot_rpc");
        if (apRes?.viral_boosted) {
          await notifyAdminsAutopilotViral(apRes);
        }
      } catch {
        // non-blocking
      }

      return jsonResp({ ok: true });
    }

    return jsonResp({ ok: true });
  }

  // =========================================================================
  // 3. ВХОДЯЩИЕ ОБНОВЛЕНИЯ TELEGRAM BOT API (setWebhook + Secret Token)
  // =========================================================================
  if (!WEBHOOK_SECRET) {
    return jsonResp({ ok: false, error: "webhook_secret_not_configured" }, 500);
  }
  const incomingSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!timingSafeEq(incomingSecret, WEBHOOK_SECRET)) {
    return jsonResp({ ok: false, error: "unauthorized_webhook" }, 401);
  }

  const msg = body.message;
  if (!msg || !msg.chat) {
    return jsonResp({ ok: true });
  }

  const chatId = msg.chat.id;
  const fromId = msg.from?.id ? String(msg.from.id) : "";
  const text: string = (msg.text || "").trim();

  // 3A. Обработка системного контакта request_contact (защита от мультиаккаунтов!)
  if (msg.contact && fromId) {
    const contactUserId = msg.contact.user_id ? String(msg.contact.user_id) : "";
    const cleanPhone = normalizePhone(String(msg.contact.phone_number || ""));
    if (contactUserId === fromId && cleanPhone.length >= 10) {
      await adminDb.from("verified_contacts").upsert(
        {
          tg_user_id: fromId,
          phone: cleanPhone,
          first_name: msg.from?.first_name || "",
          verified_at: new Date().toISOString(),
        },
        { onConflict: "tg_user_id" }
      );

      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          `✅ <b>Номер ${escapeHtml(cleanPhone)} успешно подтверждён!</b>\n` +
          `Вернись в открытое окно игры и укажи город, удобный кинотеатр и желаемый день для брони билета на «БОЧКУ» (17 декабря).`,
        reply_markup: { remove_keyboard: true },
      });
    } else {
      await tgApi("sendMessage", {
        chat_id: chatId,
        text: "⛔ Нельзя переслать чужой контакт — нажми системную кнопку «Подтвердить мой номер телефона».",
      });
    }
    return jsonResp({ ok: true });
  }

  // 3B. Простая привязка/отвязка админ-пушей о новых заявках (/bind_notify <код>, /unbind_notify <код>)
  const bindMatch = text.match(/^\/bind_notify(?:@\w+)?(?:\s+(.*))?$/i);
  if (bindMatch) {
    const suppliedCode = String(bindMatch[1] || "").trim();
    if (!ADMIN_NOTIFY_BIND_CODE || !suppliedCode || !timingSafeEq(suppliedCode, ADMIN_NOTIFY_BIND_CODE)) {
      await tgApi("sendMessage", {
        chat_id: chatId,
        text: "⛔ Неверный секретный код. Формат: /bind_notify <секретный_код>",
      });
      return jsonResp({ ok: true });
    }
    const { data: gs } = await adminDb
      .from("global_stats")
      .select("admin_notify_chat_ids")
      .eq("id", 1)
      .maybeSingle();
    const list = parseNotifyChatIds(String(gs?.admin_notify_chat_ids || ""));
    const cidStr = String(chatId);
    if (!list.includes(cidStr)) list.push(cidStr);
    await adminDb
      .from("global_stats")
      .update({ admin_notify_chat_ids: list.join(", "), updated_at: new Date().toISOString() })
      .eq("id", 1);

    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `✅ <b>Готово, заявки на билеты теперь приходят сюда.</b>\nID чата: <code>${escapeHtml(cidStr)}</code>`,
    });
    return jsonResp({ ok: true });
  }

  const unbindMatch = text.match(/^\/unbind_notify(?:@\w+)?(?:\s+(.*))?$/i);
  if (unbindMatch) {
    const suppliedCode = String(unbindMatch[1] || "").trim();
    if (!ADMIN_NOTIFY_BIND_CODE || !suppliedCode || !timingSafeEq(suppliedCode, ADMIN_NOTIFY_BIND_CODE)) {
      await tgApi("sendMessage", {
        chat_id: chatId,
        text: "⛔ Неверный секретный код. Формат: /unbind_notify <секретный_код>",
      });
      return jsonResp({ ok: true });
    }
    const { data: gs } = await adminDb
      .from("global_stats")
      .select("admin_notify_chat_ids")
      .eq("id", 1)
      .maybeSingle();
    const cidStr = String(chatId);
    const nextList = parseNotifyChatIds(String(gs?.admin_notify_chat_ids || "")).filter((id) => id !== cidStr);
    await adminDb
      .from("global_stats")
      .update({ admin_notify_chat_ids: nextList.join(", "), updated_at: new Date().toISOString() })
      .eq("id", 1);

    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `🔕 Готово, этот чат (<code>${escapeHtml(cidStr)}</code>) убран из рассылки заявок на билеты.`,
    });
    return jsonResp({ ok: true });
  }

  // 3B-2. Вспомогательная команда /admin_id (показать ID текущего чата)
  if (text === "/admin_id" || text.startsWith("/admin_id@")) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `ID этого чата: <code>${chatId}</code>`,
    });
    return jsonResp({ ok: true });
  }

  // 3C. Команда /start (в т.ч. /start verify_<gift_id>, /start pack_<id>, /start src_<tag>)
  if (text.startsWith("/start")) {
    const startArg = text.split(/\s+/)[1] || "";
    const playerUid = fromId ? `tg_${fromId}` : `chat_${chatId}`;
    const firstName = msg.from?.first_name || "";
    const lastName = msg.from?.last_name || "";
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || msg.from?.username || "Боец цеха";
    const username = msg.from?.username || "";

    // Регистрируем / обновляем tg_user_id, chat_id и источник трафика в Supabase
    try {
      await adminDb.rpc("get_or_create_player_profile", {
        p_uid: playerUid,
        p_tg_id: fromId || String(chatId),
        p_tg_username: username || null,
        p_display_name: displayName,
      });
      if (startArg && !startArg.startsWith("verify_")) {
        await adminDb.rpc("record_traffic_source_rpc", {
          p_uid: playerUid,
          p_source: startArg,
          p_tg_id: fromId || String(chatId),
          p_tg_username: username || null,
          p_display_name: displayName,
        });
      }
      await adminDb
        .from("users")
        .update({ tg_chat_id: String(chatId), updated_at: new Date().toISOString() })
        .eq("uid", playerUid);
    } catch (_e) {
      /* fallback */
    }

    // Устанавливаем постоянную кнопку меню «🛢 Играть» в чате с ботом
    await tgApi("setChatMenuButton", {
      chat_id: chatId,
      menu_button: {
        type: "web_app",
        text: "🛢 Играть",
        web_app: { url: `${PUBLIC_WEB_URL}/` },
      },
    });

    if (startArg.startsWith("verify_")) {
      const giftId = startArg.slice(7);
      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          `🎟 <b>Подтверждение номера для получения билета на «Бочку»</b>\n\n` +
          `Нажми системную кнопку внизу экрана, чтобы подтвердить свой номер телефона (1 номер = 1 билет), а затем вернись к подарку:`,
        reply_markup: {
          keyboard: [[{ text: "📱 Подтвердить мой номер телефона", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      if (giftId) {
        await tgApi("sendMessage", {
          chat_id: chatId,
          text: "После отправки контакта открой подарочный пропуск по кнопке:",
          reply_markup: {
            inline_keyboard: [[{ text: "🎟 ОТКРЫТЬ ПОДАРОЧНЫЙ БИЛЕТ", web_app: { url: `${PUBLIC_WEB_URL}/?gift=${encodeURIComponent(giftId)}` } }]],
          },
        });
      }
      return jsonResp({ ok: true });
    }

    const isFriendBarrel = startArg.startsWith("pack_");
    const webAppUrl = startArg
      ? `${PUBLIC_WEB_URL}/?startapp=${encodeURIComponent(startArg)}`
      : `${PUBLIC_WEB_URL}/`;
    const primaryBtnText = isFriendBarrel ? "💥 Открыть бочку друга" : "🛢 Войти в цех";

    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        `🛢 <b>БОЧКА: Достучаться до небес</b> (в кино с 17 декабря)\n` +
        `В одной из заваренных бочек заперт человек — у тебя 30 секунд воздуха и 3 удара ломом, чтобы сорвать нужную крышку по звуку.\n` +
        `Спаси друга, закатай ответную бочку со скримером и забери живые билеты на премьеру!`,
      reply_markup: {
        inline_keyboard: [
          [{ text: primaryBtnText, web_app: { url: webAppUrl } }],
          [
            { text: "🎬 Буду смотреть (Кинопоиск)", url: KINOPOISK_URL },
            { text: "🎟 Афиша.ру", url: AFISHA_URL },
          ],
        ],
      },
    });
    return jsonResp({ ok: true });
  }

  // 3D. Команда /my_ticket — показать выигранный билет или код восстановления BCK-...
  if (text.startsWith("/my_ticket")) {
    const playerUid = fromId ? `tg_${fromId}` : `chat_${chatId}`;
    const recoveryCode = `BCK-TG_${fromId || chatId}`;
    const { data: uRow } = await adminDb
      .from("users")
      .select("premiere_code, premiere_won, has_pending_ticket, premiere_points")
      .eq("uid", playerUid)
      .maybeSingle();

    const { data: ordRow } = await adminDb
      .from("ticket_orders")
      .select("status, booking_code, city_cinema")
      .eq("receiver_tg_id", fromId || String(chatId))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const statusLine = ordRow?.booking_code
      ? `🎟 <b>Твой билет в кино (${escapeHtml(ordRow.city_cinema || "")}):</b> <code>${escapeHtml(ordRow.booking_code)}</code>`
      : uRow?.premiere_code
        ? `🏆 <b>VIP-пропуск на Премьеру 17 декабря:</b> <code>${escapeHtml(uRow.premiere_code)}</code>`
        : uRow?.has_pending_ticket
          ? `🎁 <b>У тебя есть нераспакованный Подарочный билет для друга!</b> Открой цех и подари его новичку.`
          : `🛢 <b>Статус:</b> В гонке за билетами (${Number(uRow?.premiere_points || 0)} ⭐ очков). Сорви крышку в цеху!`;

    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        `${statusLine}\n` +
        `🔑 <b>Код восстановления профиля:</b> <code>${escapeHtml(recoveryCode)}</code>\n` +
        `Сохрани этот код — по нему можно восстановить жизни и билеты на любом устройстве.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛢 Войти в цех", web_app: { url: `${PUBLIC_WEB_URL}/` } }],
        ],
      },
    });
    return jsonResp({ ok: true });
  }

  // 3E. Команда /invite — персональная реферальная ссылка t.me/bochka_film_bot?startapp=ref_<uid>
  if (text.startsWith("/invite")) {
    const playerUid = fromId ? `tg_${fromId}` : `chat_${chatId}`;
    const refLink = `https://t.me/bochka_film_bot?startapp=ref_${encodeURIComponent(playerUid)}`;
    const shareText = "🛢 Тебя заварили в 3D-цеху триллера «БОЧКА»! 30 секунд воздуха и 3 удара ломом — попробуй выбраться:";
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;

    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        `🔗 <b>Твоя личная ссылка для приглашения друзей в цех:</b>\n` +
        `<code>${escapeHtml(refLink)}</code>\n` +
        `За каждого нового друга ты получаешь <b>+2 ❤️ жизни, +2500 ⭐ очков и +10%</b> к рейтингу ТОП-10 Премьеры!`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📲 Переслать ссылку другу в Telegram", url: shareUrl }],
          [{ text: "🛢 Заварить именную бочку со скримером", web_app: { url: `${PUBLIC_WEB_URL}/` } }],
        ],
      },
    });
    return jsonResp({ ok: true });
  }

  return jsonResp({ ok: true });
});

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
