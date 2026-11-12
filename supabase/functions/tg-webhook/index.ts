import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const ADMIN_CHAT_ID = Deno.env.get("ADMIN_TG_CHAT_ID") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const MINI_APP_LINK = "https://t.me/bochka_film_bot/play";
const PUBLIC_WEB_URL = "https://bochka.quest";

const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function tgApi(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) return { ok: false, description: "missing_bot_token" };
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json().catch(() => ({ ok: false }));
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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
      const { data: ord, error: ordErr } = await adminDb
        .from("ticket_orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (ordErr || !ord) {
        return jsonResp({ ok: false, error: "order_not_found" }, 404);
      }

      const captionLines = [
        "🎟 <b>ТВОЙ ЭЛЕКТРОННЫЙ БИЛЕТ НА ТРИЛЛЕР «БОЧКА» ГОТОВ!</b>",
        "",
        `📍 Кинотеатр / Город: <b>${escapeHtml(ord.city_cinema || "")}</b>`,
        bookingCode ? `🔢 Код брони / Комментарий: <code>${escapeHtml(bookingCode)}</code>` : "",
        "",
        "Покажи этот билет или код бронирования на кассе/терминале кинотеатра. До встречи в темноте с 17 декабря!",
      ].filter(Boolean).join("\n");

      let tgSent = { ok: false };
      if (ord.receiver_tg_id) {
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
      }

      await adminDb
        .from("ticket_orders")
        .update({
          status: "sent",
          booking_code: bookingCode,
          ticket_file_url: ticketFileUrl || ord.ticket_file_url,
          sent_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (ord.gift_id) {
        await adminDb.from("ticket_passes").update({ status: "sent" }).eq("short_id", ord.gift_id);
      }

      return jsonResp({ ok: true, tgSent: Boolean(tgSent?.ok) });
    }

    if (body.adminAction === "reject_order") {
      const { orderId, reason = "Отклонено модератором" } = body;
      await adminDb
        .from("ticket_orders")
        .update({ status: "rejected", booking_code: reason })
        .eq("id", orderId);
      return jsonResp({ ok: true });
    }

    if (body.adminAction === "notify_premiere_winner") {
      const { tgUserId, premiereCode, displayName = "" } = body;
      if (tgUserId) {
        await tgApi("sendMessage", {
          chat_id: tgUserId,
          parse_mode: "HTML",
          text:
            `🏆 <b>ПОЗДРАВЛЯЕМ${displayName ? `, ${escapeHtml(displayName)}` : ""}!</b>\n\n` +
            `Продюсеры фильма «БОЧКА» подтвердили твой именной пригласительный на <b>Закрытую Премьеру со съёмочной группой (17 декабря)</b>!\n\n` +
            `🔑 Твой VIP-код: <code>${escapeHtml(premiereCode || "")}</code>\n` +
            `Ответь на это сообщение своим ФИО для внесения в списки гостей на входе.`,
        });
      }
      return jsonResp({ ok: true });
    }

    return jsonResp({ ok: false, error: "unknown_admin_action" }, 400);
  }

  // =========================================================================
  // 2. ЛЁГКИЕ СОЦИАЛЬНЫЕ ПУШИ МЕЖДУ ДРУЗЬЯМИ ИЗ ВЕБ-ИГРЫ / MINI APP
  // =========================================================================
  if (body.clientAction || body.event) {
    const action = body.clientAction || body.event;

    if ((action === "barrel_opened" || action === "opened") && body.senderTgId) {
      const opener = body.openerName ? ` (${escapeHtml(body.openerName)})` : "";
      await tgApi("sendMessage", {
        chat_id: body.senderTgId,
        parse_mode: "HTML",
        text:
          `💥 <b>Твой кент${opener} вскрыл заваренную бочку!</b>\n` +
          `Голосовое послание доставлено — тебе начислено <b>+2 ❤️ жизни</b> для штурма Закрытой Премьеры!`,
        reply_markup: {
          inline_keyboard: [[{ text: "🏆 В ЦЕХ: ГОНКА ЗА ПРЕМЬЕРОЙ", url: MINI_APP_LINK }]],
        },
      });
      return jsonResp({ ok: true });
    }

    if ((action === "cinema_accept" || action === "accepted_cinema") && body.senderTgId) {
      const opener = body.openerName ? ` (${escapeHtml(body.openerName)})` : "";
      await tgApi("sendMessage", {
        chat_id: body.senderTgId,
        parse_mode: "HTML",
        text:
          `🍿 <b>ИДЁМ В КИНО 17 ДЕКАБРЯ!</b>\n` +
          `Твой друг${opener} принял вызов из бочки и нажал «Идём на „Бочку“ 17 декабря»!`,
        reply_markup: {
          inline_keyboard: [[{ text: "🎬 КАРТОЧКА НА КИНОПОИСКЕ", url: "https://www.kinopoisk.ru/film/11226275/" }]],
        },
      });
      return jsonResp({ ok: true });
    }

    if (action === "gift_order_created") {
      const { senderTgId, receiverTgId, receiverName = "", receiverUsername = "", phone = "", cityCinema = "" } = body;

      if (senderTgId) {
        await tgApi("sendMessage", {
          chat_id: senderTgId,
          parse_mode: "HTML",
          text:
            `🎟 <b>Друг активировал твой подарочный билет!</b>\n` +
            `Твой запас жизней в Гонке за Премьерой мгновенно <b>удвоен (×2 ❤️)</b> — жми в цех!`,
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
            `📱 Подтверждённый номер: <code>${escapeHtml(phone)}</code>\n\n` +
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
            `📱 Телефон: <code>${escapeHtml(phone)}</code>\n` +
            `📍 Город/зал: <b>${escapeHtml(cityCinema)}</b>\n` +
            `🔗 Кабинет продюсера: ${PUBLIC_WEB_URL}/admin/`,
        });
      }

      return jsonResp({ ok: true });
    }

    return jsonResp({ ok: true });
  }

  // =========================================================================
  // 3. ВХОДЯЩИЕ ОБНОВЛЕНИЯ TELEGRAM BOT API (setWebhook)
  // =========================================================================
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
    if (contactUserId === fromId && msg.contact.phone_number) {
      const rawPhone = String(msg.contact.phone_number);
      const cleanPhone = (rawPhone.startsWith("+") ? "+" : "+") + rawPhone.replace(/[^0-9]/g, "");

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
        `Темнота, шесть заваренных 200-литровых бочек и 15 секунд воздуха. Закатай друга с голосовым посланием изнутри металла, выбей билет в кино для кента и дойди до 100 баллов ради пригласительного на Закрытую Премьеру!`,
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
