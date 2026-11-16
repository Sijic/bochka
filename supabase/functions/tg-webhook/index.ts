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

    if (action === "barrel_search_started" && body.senderTgId && body.barrelId) {
      const { data: bRow } = await adminDb
        .from("barrels")
        .select("short_id, sender_tg_id")
        .eq("short_id", String(body.barrelId))
        .maybeSingle();
      if (!bRow || bRow.sender_tg_id !== String(body.senderTgId)) {
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
          `🍿 <b>ИДЁМ В КИНО 17 ДЕКАБРЯ!</b>\n` +
          `<b>${opener}</b> нашёл тебя в бочке и зовёт в кино на «БОЧКУ» 17 декабря! Берёте билеты?`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎬 «Буду смотреть» на Кинопоиске", url: "https://www.kinopoisk.ru/film/11226275/" }],
            [{ text: "🏆 Ответить в цеху", url: MINI_APP_LINK }],
          ],
        },
      });
      return jsonResp({ ok: true });
    }

    if (action === "reaction_ask_ticket" && body.senderTgId) {
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
          `🎟 <b>ДРУГ ПРОСИТ ЛИШНИЙ БИЛЕТ!</b>\n` +
          `<b>${opener}</b> вытащил тебя из бочки и просит подогнать ему выигранный билет в кино!\n` +
          `<i>За передачу билета другу ты получаешь +4 ❤️ жизней и +3500 ⭐ очков в ТОП-10 Премьеры!</i>`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎁 Подарить / Выбить билет другу", url: `${MINI_APP_LINK}?startapp=giftfork` }],
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
        await tgApi("sendMessage", {
          chat_id: senderTgId,
          parse_mode: "HTML",
          text:
            `🎟 <b>Друг активировал твой подарочный билет!</b>\n` +
            `Тебе начислено <b>+4 ❤️ жизней и +3500 ⭐ очков</b> в ТОП-10 Премьеры — жми в цех!`,
          reply_markup: {
            inline_keyboard: [[{ text: "🔥 ШТУРМОВАТЬ ПРЕМЬЕРУ", url: MINI_APP_LINK }]],
          },
        });
      }

      if (receiverTgId) {
        await tgApi("sendMessage", {
          chat_id: receiverTgId,
          parse_mode: "HTML",
          text:
            `✅ <b>Заявка передана продюсерам триллера «Бочка»!</b>\n\n` +
            `📍 Город / кинотеатр: <b>${escapeHtml(cityCinema)}</b>\n` +
            `📱 Подтверждённый номер: <code>${escapeHtml(normalizePhone(phone))}</code>\n\n` +
            `Электронный билет придёт на твой номер и прямо в этот бот @bochka_film_bot к старту проката 17 декабря.`,
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

  // 3C. Команда /start (в т.ч. /start verify_<gift_id> или обычный вход)
  if (text.startsWith("/start")) {
    const startArg = text.split(/\s+/)[1] || "";

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
            inline_keyboard: [[{ text: "🎟 ОТКРЫТЬ ПОДАРОЧНЫЙ БИЛЕТ", url: `${MINI_APP_LINK}?startapp=gift_${giftId}` }]],
          },
        });
      }
      return jsonResp({ ok: true });
    }

    const launchUrl = startArg ? `${MINI_APP_LINK}?startapp=${encodeURIComponent(startArg)}` : MINI_APP_LINK;
    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        `🛢 <b>БОЧКА: Достучаться до небес</b>\n` +
        `<i>Триллер Алексея Звонцова · В кино с 17 декабря 2026</i>\n\n` +
        `🛢 Друг заперт в одной из ржавых бочек — у тебя есть 30 секунд воздуха и 3 удара ломом.\n` +
        `🎧 Включи звук, прислушайся к стуку и голосу сквозь металл и найди нужную крышку (а в цеху ищи секрет 19·97).\n` +
        `🎬 Спаси друга, закатай ответную бочку со своим фото и голосом — и вызывай своих за стол «На счёт три!» (до 3 игроков, выбывший гремит цепями).\n` +
        `🎟 Добивай шкалу к Премьере или выигрывай живой билет в кино на фильм «БОЧКА» с 17 декабря!`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "▶ ВОЙТИ В ЦЕХ «БОЧКИ»", url: launchUrl }],
          [{ text: "🎬 «Буду смотреть» на Кинопоиске", url: "https://www.kinopoisk.ru/film/11226275/" }],
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
