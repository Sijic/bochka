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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const MINI_APP_LINK = "https://t.me/bochka_film_bot/play";
const PUBLIC_WEB_URL = "https://bochka.quest";

const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const encoder = new TextEncoder();

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

    return jsonResp({ ok: false, error: "unknown_admin_action" }, 400);
  }

  // =========================================================================
  // 2. ЛЁГКИЕ СОЦИАЛЬНЫЕ ПУШИ МЕЖДУ ДРУЗЬЯМИ ИЗ ВЕБ-ИГРЫ / MINI APP
  // =========================================================================
  if (body.clientAction || body.event) {
    if (body.initData) {
      const check = await verifyTelegramInitData(String(body.initData), BOT_TOKEN);
      if (!check.valid) {
        return jsonResp({ ok: false, error: "invalid_telegram_init_data" }, 401);
      }
    }

    const action = body.clientAction || body.event;

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

    if ((action === "reaction_cinema" || action === "cinema_accept" || action === "accepted_cinema") && body.senderTgId) {
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
          `🍿 <b>Твой друг ${opener} открыл твою бочку и согласен идти с тобой в кино 17 декабря!</b>\n` +
          `Зови остальных в цех и занимайте соседние места на премьеру «БОЧКИ»!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎬 «Буду смотреть» на Кинопоиске", url: "https://www.kinopoisk.ru/film/11226275/" }],
            [{ text: "🛢 Войти в цех", web_app: { url: `${PUBLIC_WEB_URL}/` } }],
          ],
        },
      });
      return jsonResp({ ok: true });
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
      await tgApi("sendMessage", {
        chat_id: body.recipientTgId,
        parse_mode: "HTML",
        text:
          `🎟 <b>${sender} выиграл в «БОЧКЕ» бесплатный виртуальный билет в кино и отправил его ТЕБЕ!</b>\n` +
          `Нажми кнопку ниже, чтобы забрать билет на премьеру 17 декабря:`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎟 ЗАБРАТЬ ВИРТУАЛЬНЫЙ БИЛЕТ", url: `${MINI_APP_LINK}?startapp=gift_${encodeURIComponent(giftId)}` }],
          ],
        },
      });
      return jsonResp({ ok: true });
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
            [{ text: "⚔️ ПРИНЯТЬ ВЫЗОВ «НА СЧЁТ ТРИ!»", url: `${MINI_APP_LINK}?startapp=duel_${encodeURIComponent(roomId)}` }],
          ],
        },
      });
      return jsonResp({ ok: true });
    }

    if (action === "gift_order_created") {
      const { senderTgId, receiverTgId, receiverName = "", receiverUsername = "", phone = "", cityCinema = "" } = body;
      const { data: ordRow } = await adminDb
        .from("ticket_orders")
        .select("id")
        .eq("receiver_tg_id", String(receiverTgId || ""))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ordRow) {
        return jsonResp({ ok: true, skipped: true });
      }

      if (senderTgId) {
        const sessionLabel = cityCinema ? escapeHtml(cityCinema) : "выбранный кинотеатр и время";
        await tgApi("sendMessage", {
          chat_id: senderTgId,
          parse_mode: "HTML",
          text:
            `🎟 <b>Друг забрал бесплатное место на «БОЧКУ»!</b>\n` +
            `📍 Сеанс: <b>${sessionLabel}</b>\n\n` +
            `Возьми себе соседнее кресло рядом в 1 клик, чтобы пойти вместе — на триллеры поодиночке не ходят!\n` +
            `+ Тебе начислено <b>+3 ❤️ жизней и +300 ⭐</b> в рейтинг Закрытого показа в Москве 17 декабря!`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🎬 ВЗЯТЬ СОСЕДНЕЕ КРЕСЛО (КИНОПОИСК)", url: "https://www.kinopoisk.ru/afisha/new/" },
              ],
              [
                { text: "🎟 АФИША / БИЛЕТЫ РЯДОМ", url: "https://www.afisha.ru/schedule_cinema/" },
                { text: "🏆 В ТОП-20 МОСКВЫ", url: MINI_APP_LINK },
              ],
            ],
          },
        });

        // Перекрёстное уведомление рефереру отправителя
        const { data: sRow } = await adminDb
          .from("users")
          .select("display_name, referred_by_uid")
          .eq("tg_user_id", String(senderTgId))
          .limit(1)
          .maybeSingle();
        if (sRow?.referred_by_uid) {
          const { data: refRow } = await adminDb
            .from("users")
            .select("tg_user_id")
            .eq("uid", sRow.referred_by_uid)
            .limit(1)
            .maybeSingle();
          if (refRow?.tg_user_id && String(refRow.tg_user_id) !== String(senderTgId)) {
            await tgApi("sendMessage", {
              chat_id: refRow.tg_user_id,
              parse_mode: "HTML",
              text:
                `🎟 <b>Твой друг ${escapeHtml(sRow.display_name || "Игрок")} только что выиграл билет в кино в БОЧКЕ!</b>\n` +
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
            `🎟 <b>Твой бесплатный билет на триллер «БОЧКА» (17 декабря) принят!</b>\n\n` +
            `📍 Сеанс: <b>${escapeHtml(cityCinema || "уточняется")}</b>\n` +
            `📱 Подтверждённый номер: <code>${escapeHtml(normalizePhone(phone))}</code>\n\n` +
            `Продюсер выпишет билет и пришлёт его прямо сюда в @bochka_film_bot! Перешли дарителю номер места, чтобы сесть рядом.`,
        });
      }

      if (ADMIN_CHAT_ID) {
        await tgApi("sendMessage", {
          chat_id: ADMIN_CHAT_ID,
          parse_mode: "HTML",
          text:
            `🆕 <b>НОВАЯ ЗАЯВКА НА БИЛЕТ В «БОЧКУ»</b>\n` +
            `👤 Получатель: ${escapeHtml(receiverName)} ${receiverUsername ? `(@${escapeHtml(receiverUsername)})` : ""}\n` +
            `📱 Телефон: <code>${escapeHtml(normalizePhone(phone))}</code>\n` +
            `📍 Город/зал: <b>${escapeHtml(cityCinema)}</b>\n` +
            `🔗 Кабинет продюсера: ${PUBLIC_WEB_URL}/admin/`,
        });
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
          `Вернись в открытое окно игры и отправь свой город/кинотеатр для получения электронного билета.`,
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

  // 3B. Вспомогательная команда /admin_id для привязки закрытого чата продюсеров
  if (text === "/admin_id") {
    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `ID этого чата для <code>ADMIN_TG_CHAT_ID</code>: <code>${chatId}</code>`,
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
          [{ text: "🎬 «Буду смотреть» на Кинопоиске", url: "https://www.kinopoisk.ru/film/11226275/" }],
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
