import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';

const adminSupabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'bochka_producer_admin_session',
  },
});

const admState = {
  session: null,
  stats: null,
  traffic: null,
  daily: [],
  orders: [],
  leaders: [],
  orderFilter: 'all',
};

async function initAdminApp() {
  bindAdminEvents();

  const { data } = await adminSupabase.auth.getSession();
  if (data?.session) {
    admState.session = data.session;
    const ok = await refreshDashboardData();
    if (ok) {
      showAdminDashboard();
      return;
    }
    await adminSupabase.auth.signOut();
  }

  showAuthGate();
}

function showAuthGate(errorText = '') {
  document.getElementById('admin-dashboard')?.setAttribute('hidden', '');
  document.getElementById('admin-auth-gate')?.removeAttribute('hidden');
  const errEl = document.getElementById('admin-auth-error');
  if (errEl) {
    if (errorText) {
      errEl.textContent = errorText;
      errEl.removeAttribute('hidden');
    } else {
      errEl.setAttribute('hidden', '');
    }
  }
}

function showAdminDashboard() {
  document.getElementById('admin-auth-gate')?.setAttribute('hidden', '');
  document.getElementById('admin-dashboard')?.removeAttribute('hidden');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = (document.getElementById('admin-email')?.value || '').trim();
  const password = document.getElementById('admin-password')?.value || '';
  const btn = document.getElementById('btn-admin-login');
  const errEl = document.getElementById('admin-auth-error');

  errEl?.setAttribute('hidden', '');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Проверка ключа продюсера...';
  }

  try {
    const { data, error } = await adminSupabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      showAuthGate('Неверный логин или секретный пароль продюсера.');
      return;
    }

    admState.session = data.session;
    const allowed = await refreshDashboardData();
    if (!allowed) {
      await adminSupabase.auth.signOut();
      showAuthGate('Недостаточно прав доступа для входа в кабинет продюсера.');
      return;
    }

    showAdminDashboard();
    showAdmToast('✓ Вход выполнен. Панель управления синхронизирована.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'ВОЙТИ В КАБИНЕТ ПРОДЮСЕРА →';
    }
  }
}

async function refreshDashboardData() {
  const { data: sessionRes } = await adminSupabase.auth.getSession();
  admState.session = sessionRes?.session || admState.session;

  const { data, error } = await adminSupabase.rpc('admin_get_dashboard');
  if (error || !data?.ok) {
    return false;
  }

  admState.stats = data.stats || {};
  admState.traffic = data.traffic || null;
  admState.daily = Array.isArray(data.daily) ? data.daily : [];
  admState.orders = Array.isArray(data.orders) ? data.orders : [];
  admState.leaders = Array.isArray(data.leaders) ? data.leaders : [];

  const syncEl = document.getElementById('adm-last-sync');
  if (syncEl) {
    syncEl.textContent = `Обновлено: ${new Date().toLocaleTimeString('ru-RU')} · База Франкфурт (eu-central-1)`;
  }

  renderAnalyticsPane();
  renderOrdersPane();
  renderLeadersPane();
  renderLimitsForm();
  return true;
}

/* ============================================================================
   ВКЛАДКА 1: АНАЛИТИКА, ВОРОНКА И ГРАФИК ПО ДНЯМ
   ============================================================================ */
function renderAnalyticsPane() {
  const s = admState.stats || {};
  const players = Number(s.total_players || 0);
  const created = Number(s.barrels_created || 0);
  const opened = Number(s.barrels_opened || 0);
  const kpClicks = Number(s.kp_clicks || 0);
  const trailers = Number(s.trailer_completions || 0);
  const cinema = Number(s.cinema_intent_clicks || 0);
  const ocean = Number(s.ocean_secret_opens || 0);
  const totalHits = Number(s.total_strikes ?? s.total_hits ?? 0);
  const won = Number(s.tickets_won ?? s.premiere_winners_count ?? s.premiere_winners ?? 0);
  const burned = Number(s.tickets_burned ?? 0);
  const dailyIssued = Number(s.daily_tickets_issued ?? 0);
  const maxDaily = Number(s.max_daily_tickets ?? 8);
  const maxTotal = Number(s.max_total_tickets ?? 100);

  const kFactor = players > 0 ? (opened / players).toFixed(2) : '0.00';

  setText('kpi-players', fmtInt(players));
  setText('kpi-hits-note', `Ударов в Суперигре: ${fmtInt(totalHits)}`);
  setText('kpi-barrels-created', fmtInt(created));
  setText('kpi-barrels-opened', fmtInt(opened));
  setText('kpi-kfactor', `K-factor виральности: ${kFactor}`);
  setText('kpi-kp-clicks', fmtInt(kpClicks));
  setText('kpi-trailers', fmtInt(trailers));
  setText('kpi-cinema-clicks', fmtInt(cinema));
  setText('kpi-ocean-opens', fmtInt(ocean));
  setText('kpi-tickets-summary', `${won}/${maxTotal} пул (сегодня ${dailyIssued}/${maxDaily})`);
  setText('kpi-burned-note', `Сожжено ради ×2 жизней: ${burned}`);

  const base = Math.max(1, players, created, opened, kpClicks, trailers);
  const steps = [
    { label: '1. Уникальные игроки в цеху', val: players },
    { label: '2. Заварили и отправили бочку другу', val: created },
    { label: '3. Открыто бочек по ссылкам друзей', val: opened },
    { label: '4. Нажали «Буду смотреть» / КП', val: kpClicks },
    { label: '5. Честно досмотрели трейлер (40+ сек)', val: trailers },
    { label: '6. Ответили другу «Идём в кино 17 декабря»', val: cinema },
  ];

  const funnelEl = document.getElementById('funnel-bars');
  if (funnelEl) {
    funnelEl.innerHTML = steps
      .map((st) => {
        const pct = Math.min(100, Math.round((st.val / base) * 100));
        return `
          <div class="funnel-row">
            <div class="funnel-row-top">
              <span>${escapeHtml(st.label)}</span>
              <strong>${fmtInt(st.val)} (${pct}%)</strong>
            </div>
            <div class="funnel-track">
              <div class="funnel-fill" style="width:${Math.max(2, pct)}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const chartEl = document.getElementById('daily-chart-box');
  if (chartEl) {
    if (!admState.daily.length) {
      chartEl.innerHTML = '<div class="empty-note">Посуточная статистика появится после первых игровых сессий сегодня.</div>';
    } else {
      const maxDayVal = Math.max(
        1,
        ...admState.daily.map((d) => Number(d.players || 0) + Number(d.barrels_created || 0) + Number(d.barrels_opened || 0))
      );
      const barsHtml = admState.daily
        .map((d) => {
          const sum = Number(d.players || 0) + Number(d.barrels_created || 0) + Number(d.barrels_opened || 0);
          const h = Math.max(6, Math.round((sum / maxDayVal) * 118));
          const shortDay = String(d.day || '').slice(5);
          const tip = `${d.day}: Игроков ${d.players || 0}, Закатано ${d.barrels_created || 0}, Открыто ${d.barrels_opened || 0}, Заявок ${d.tickets_ordered || 0}`;
          return `
            <div class="day-col" title="${escapeHtml(tip)}">
              <div class="day-bar" style="height:${h}px"></div>
              <span class="day-lbl">${escapeHtml(shortDay)}</span>
            </div>
          `;
        })
        .join('');

      const lastRow = admState.daily[admState.daily.length - 1] || {};
      chartEl.innerHTML = `
        <div class="daily-bars-strip">${barsHtml}</div>
        <div class="mono-muted">
          Сегодня (${escapeHtml(String(lastRow.day || '—'))}): игроков ${lastRow.players || 0} · закатано ${lastRow.barrels_created || 0} · открыто ${lastRow.barrels_opened || 0} · заявок на билеты ${lastRow.tickets_ordered || 0}
        </div>
      `;
    }
  }

  renderTrafficSourcesSummary(players);
}

function renderTrafficSourcesSummary(totalPlayers = 0) {
  const tr = admState.traffic || {};
  const leaders = Array.isArray(admState.leaders) ? admState.leaders : [];

  let friendsSeed = Number(tr.friends_seed || 0);
  let bloggersTil = Number(tr.bloggers_til || 0);
  let socialAds = Number(tr.social_ads || 0);
  let referralsViral = Number(tr.referrals_viral || 0);
  let byTag = Array.isArray(tr.by_tag) ? tr.by_tag : [];

  if (!admState.traffic && leaders.length > 0) {
    const counts = {};
    leaders.forEach((u) => {
      const src = String(u.traffic_source || 'organic').toLowerCase();
      counts[src] = (counts[src] || 0) + 1;
      if (src.includes('friend')) friendsSeed += 1;
      else if (src.includes('til') || src.includes('blogger')) bloggersTil += 1;
      else if (src.includes('insta') || src.includes('whatsapp')) socialAds += 1;
      else referralsViral += 1;
    });
    byTag = Object.entries(counts).map(([tag, players]) => ({
      tag,
      players,
      barrels_packed: 0,
      friends_brought: 0,
    }));
  } else if (!admState.traffic && totalPlayers > 0 && referralsViral === 0) {
    referralsViral = totalPlayers;
  }

  setText('traffic-friends-seed', fmtInt(friendsSeed));
  setText('traffic-bloggers-til', fmtInt(bloggersTil));
  setText('traffic-referrals-viral', fmtInt(referralsViral));
  setText('traffic-social-ads', fmtInt(socialAds));

  const tagsEl = document.getElementById('traffic-tags-bars');
  if (!tagsEl) return;

  const tagLabels = {
    src_friends: '🤝 Друзья продюсеров (src_friends)',
    src_til: '🎬 Видео-приглашение Тиля (src_til)',
    src_blogger1: '📹 Блогер #1 (src_blogger1)',
    src_blogger2: '📹 Блогер #2 (src_blogger2)',
    src_blogger3: '📹 Блогер #3 (src_blogger3)',
    src_blogger4: '📹 Блогер #4 (src_blogger4)',
    src_blogger5: '📹 Блогер #5 (src_blogger5)',
    src_insta: '📸 Instagram Stories / Reels (src_insta)',
    src_whatsapp: '💬 WhatsApp посев (src_whatsapp)',
    organic: '🌱 Органика и вирусные пересылки (organic / ref_*)',
  };

  const rows = byTag.length
    ? byTag
    : [
        { tag: 'src_friends', players: friendsSeed, barrels_packed: 0, friends_brought: 0 },
        { tag: 'src_til', players: bloggersTil, barrels_packed: 0, friends_brought: 0 },
        { tag: 'src_insta', players: socialAds, barrels_packed: 0, friends_brought: 0 },
        { tag: 'organic', players: referralsViral, barrels_packed: 0, friends_brought: 0 },
      ];

  const maxTagPlayers = Math.max(1, totalPlayers, ...rows.map((r) => Number(r.players || 0)));
  tagsEl.replaceChildren(
    ...rows.map((r) => {
      const pCount = Number(r.players || 0);
      const pct = Math.min(100, Math.round((pCount / maxTagPlayers) * 100));
      const rawTag = String(r.tag || 'organic');
      const label =
        tagLabels[rawTag] ||
        (rawTag.startsWith('pr_')
          ? `🎬 Продюсер (${rawTag}) и его ветка`
          : rawTag.startsWith('bl_')
            ? `🔥 Блогер (${rawTag}) и его аудитория`
            : rawTag === 'src_test' || rawTag.startsWith('src_test')
              ? `🧪 Тестовые (${rawTag}) и их цепочка`
              : rawTag.startsWith('src_friend')
                ? `🤝 Друзья продюсеров (${rawTag})`
                : rawTag.startsWith('src_')
                  ? `🎤 Блогер / канал: ${rawTag.slice(4)} (${rawTag})`
                  : `🔗 Метка: ${rawTag}`);
      const packed = Number(r.barrels_packed || 0);
      const invited = Number(r.friends_brought || 0);

      const rowEl = document.createElement('div');
      rowEl.className = 'funnel-row';

      const topEl = document.createElement('div');
      topEl.className = 'funnel-row-top';

      const spanEl = document.createElement('span');
      spanEl.textContent = label;

      const strongEl = document.createElement('strong');
      strongEl.textContent = `${fmtInt(pCount)} игр. · Закатано бочек: ${fmtInt(packed)} · Привели друзей: ${fmtInt(invited)}`;

      topEl.append(spanEl, strongEl);

      const trackEl = document.createElement('div');
      trackEl.className = 'funnel-track';

      const fillEl = document.createElement('div');
      fillEl.className = 'funnel-fill';
      fillEl.style.width = `${Math.max(2, pct)}%`;

      trackEl.appendChild(fillEl);
      rowEl.append(topEl, trackEl);
      return rowEl;
    })
  );

  // v14.3: Сводка по многоразовым бочкам продюсеров (pr_*) и блогеров (bl_*)
  const bcastBox = document.getElementById('broadcast-summary-box');
  if (bcastBox) {
    const bList = Array.isArray(tr.broadcast_summary) ? tr.broadcast_summary : [];
    if (!bList.length) {
      const emptyEl = document.createElement('p');
      emptyEl.className = 'mono-muted';
      emptyEl.textContent = 'Пока нет активных многоразовых бочек (pr_* / bl_*). Скопируйте ссылку team_prod или team_blog сверху.';
      bcastBox.replaceChildren(emptyEl);
    } else {
      const maxSeqTop = Math.max(1, ...bList.map((b) => Number(b.max_seq || 0)));
      bcastBox.replaceChildren(
        ...bList.map((b) => {
          const pref = String(b.prefix || '');
          const maxSeq = Number(b.max_seq || 0);
          const chainP = Number(b.chain_players || 0);
          const further = Number(b.barrels_further || 0);
          const orders = Number(b.ticket_orders || 0);
          const ico = pref.startsWith('bl_') ? '🔥' : '🎬';
          const rangeStr = maxSeq > 0 ? `1..${maxSeq}` : '0';

          const rowEl = document.createElement('div');
          rowEl.className = 'funnel-row';
          const topEl = document.createElement('div');
          topEl.className = 'funnel-row-top';
          const left = document.createElement('span');
          left.textContent = `${ico} ${pref} (${b.creator_name || pref}) — номера ${rangeStr}`;
          const right = document.createElement('strong');
          right.textContent = `В ветке: ${fmtInt(chainP)} · Бочек дальше: ${fmtInt(further)} · Заявок 1+1: ${fmtInt(orders)}`;
          topEl.append(left, right);

          const track = document.createElement('div');
          track.className = 'funnel-track';
          const fill = document.createElement('div');
          fill.className = 'funnel-fill';
          fill.style.width = `${Math.max(4, Math.min(100, Math.round((maxSeq / maxSeqTop) * 100)))}%`;
          track.appendChild(fill);
          rowEl.append(topEl, track);
          return rowEl;
        })
      );
    }
  }
}

/* ============================================================================
   ВКЛАДКА 2: ВЫПИСКА БИЛЕТОВ, CSV ЭКСПОРТ И ОТПРАВКА QR/PDF В БОТ
   ============================================================================ */
function renderOrdersPane() {
  const pendingCount = admState.orders.filter((o) => o.status === 'pending').length;
  setText('tab-pending-count', String(pendingCount));

  const listEl = document.getElementById('orders-list');
  if (!listEl) return;

  const filtered = admState.orders.filter((o) => {
    if (admState.orderFilter === 'all') return true;
    return o.status === admState.orderFilter;
  });

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty-note">По выбранному фильтру заявок пока нет.</div>';
    return;
  }

  listEl.innerHTML = filtered
    .map((o) => {
      const dt = o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : '—';
      const statusMap = {
        pending: { cls: 'status-pending', txt: 'ОЖИДАЕТ ВЫПИСКИ' },
        sent: { cls: 'status-sent', txt: 'БИЛЕТ ОТПРАВЛЕН' },
        rejected: { cls: 'status-rejected', txt: 'ОТКЛОНЕНА' },
      };
      const badge = statusMap[o.status] || statusMap.pending;
      const recvUser = o.receiver_username ? `@${o.receiver_username}` : `tg:${o.receiver_tg_id || '—'}`;
      const sendUser = o.sender_username ? `@${o.sender_username}` : o.sender_name || o.sender_uid || '—';

      const links = [];
      if (isSafeHttpsUrl(o.pair_receipt_url)) {
        links.push(`<a href="${escapeAttr(o.pair_receipt_url)}" target="_blank" rel="noopener noreferrer" style="color:#fbbf24;font-weight:700;">🧾 Скриншот 1-го купленного билета (1+1) ↗</a>`);
      }
      if (isSafeHttpsUrl(o.kp_screenshot_url)) {
        links.push(`<a href="${escapeAttr(o.kp_screenshot_url)}" target="_blank" rel="noopener noreferrer">Скриншот Кинопоиска ↗</a>`);
      }
      if (isSafeHttpsUrl(o.recipient_photo_url)) {
        links.push(`<a href="${escapeAttr(o.recipient_photo_url)}" target="_blank" rel="noopener noreferrer">Фото получателя ↗</a>`);
      }
      if (isSafeHttpsUrl(o.ticket_file_url)) {
        links.push(`<a href="${escapeAttr(o.ticket_file_url)}" target="_blank" rel="noopener noreferrer">Загруженный 2-й QR-билет ↗</a>`);
      }

      const safeOrderId = escapeAttr(String(o.id || ''));
      const pairSeatRow = o.pair_seat_pref
        ? `<div><strong>Соседнее кресло (1+1):</strong> <span style="color:#fbbf24;font-weight:700;">${escapeHtml(o.pair_seat_pref)}</span></div>`
        : '';
      const receiptThumb = isSafeHttpsUrl(o.pair_receipt_url)
        ? `<div style="margin:6px 0;"><a href="${escapeAttr(o.pair_receipt_url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeAttr(o.pair_receipt_url)}" alt="Скрин 1-го билета" style="max-height:110px;border-radius:6px;border:1px solid #eab308;" /></a></div>`
        : '';

      return `
        <article class="order-card" data-order-id="${safeOrderId}">
          <div class="order-meta">
            <div class="order-head-line">
              <span class="status-badge ${badge.cls}">${badge.txt}</span>
              <span class="mono-muted">#${escapeHtml(String(o.id || ''))} · ${escapeHtml(dt)}</span>
            </div>
            <div><strong>Получатель:</strong> ${escapeHtml(o.receiver_name || 'Гость')} (<code>${escapeHtml(recvUser)}</code>)</div>
            <div><strong>Телефон (Telegram Verified):</strong> <code>${escapeHtml(o.verified_phone || '—')}</code></div>
            <div><strong>Город, кинотеатр и сеанс:</strong> ${escapeHtml(o.city_cinema || '—')}</div>
            ${pairSeatRow}
            <div><strong>Кто подарил (×2 ❤️):</strong> ${escapeHtml(sendUser)}</div>
            ${receiptThumb}
            ${links.length ? `<div class="thumb-links">${links.join('')}</div>` : ''}
          </div>

          <div class="order-Fulfill">
            <label class="mono-muted">КОД БРОНИ / СЕАНС / КОММЕНТАРИЙ В БОТ:</label>
            <input
              type="text"
              class="adm-input js-order-code"
              placeholder="Например: КАРО Октябрь, 17 дек 20:10, бронь 849201"
              value="${escapeAttr(o.booking_code || '')}"
            />

            <label class="mono-muted">ПРИКРЕПИТЬ QR / PDF / СКРИНШОТ БИЛЕТА (ОПЦИОНАЛЬНО):</label>
            <input type="file" class="adm-input js-order-file" accept="image/png,image/jpeg,image/webp,application/pdf" />

            <div class="order-actions-row">
              <button type="button" class="adm-btn adm-btn-gold js-send-ticket" data-id="${safeOrderId}">
                📨 Отправить билет в @bochka_film_bot
              </button>
              <button type="button" class="adm-btn adm-btn-danger js-reject-order" data-id="${safeOrderId}">
                ✕ Отклонить
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  listEl.querySelectorAll('.js-send-ticket').forEach((btn) => {
    btn.addEventListener('click', () => handleSendTicketToBot(String(btn.getAttribute('data-id') || '').trim(), btn));
  });
  listEl.querySelectorAll('.js-reject-order').forEach((btn) => {
    btn.addEventListener('click', () => handleRejectOrder(String(btn.getAttribute('data-id') || '').trim(), btn));
  });
}

async function handleSendTicketToBot(orderId, btn) {
  const card = btn.closest('.order-card');
  if (!card || !orderId) return;

  const bookingCode = (card.querySelector('.js-order-code')?.value || '').trim();
  const fileInput = card.querySelector('.js-order-file');
  const file = fileInput?.files?.[0] || null;

  if (!bookingCode && !file) {
    showAdmToast('Введите код бронирования или прикрепите файл билета (QR/PDF)!');
    return;
  }

  btn.disabled = true;
  const origTxt = btn.textContent;
  btn.textContent = 'Отправка в Telegram...';

  try {
    let ticketFileUrl = '';
    if (file) {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      const storagePath = `tickets/order_${orderId}_${Date.now()}.${ext || 'png'}`;
      const { error: upErr } = await adminSupabase.storage
        .from(ENV.supabasePassesBucket)
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          cacheControl: '31536000',
          upsert: false,
        });
      if (upErr) {
        showAdmToast(`Ошибка загрузки файла: ${upErr.message}`);
        return;
      }
      const { data: pub } = adminSupabase.storage.from(ENV.supabasePassesBucket).getPublicUrl(storagePath);
      ticketFileUrl = pub?.publicUrl || '';
    }

    const res = await callAdminWebhook({
      adminAction: 'send_ticket',
      orderId: String(orderId),
      bookingCode,
      ticketFileUrl,
    });

    if (!res.ok || res.tgSent === false) {
      const msg = res.error === 'telegram_delivery_failed' || res.tgSent === false
        ? 'Бот Telegram не доставил файл игроку (возможно, @bochka_film_bot заблокирован). Заказ оставлен в очереди.'
        : (res.error || 'проверьте сессию');
      showAdmToast(`Ошибка отправки: ${msg}`);
      return;
    }

    showAdmToast('✓ Билет отправлен зрителю в @bochka_film_bot!');
    await refreshDashboardData();
  } finally {
    btn.disabled = false;
    btn.textContent = origTxt;
  }
}

async function handleRejectOrder(orderId, btn) {
  if (!orderId) return;
  btn.disabled = true;
  try {
    const res = await callAdminWebhook({
      adminAction: 'reject_order',
      orderId: String(orderId),
      reason: 'Отклонено модератором',
    });
    if (res.ok) {
      showAdmToast('Заявка переведена в отклонённые.');
      await refreshDashboardData();
    } else {
      showAdmToast(`Не удалось отклонить заявку: ${res.error || 'ошибка сервера'}`);
    }
  } finally {
    btn.disabled = false;
  }
}

function handleExportOrdersCsv() {
  const headers = [
    'ID',
    'Дата',
    'Статус',
    'Имя получателя',
    'Telegram получателя',
    'TG ID',
    'Подтвержденный телефон',
    'Город и кинотеатр',
    'Кто подарил',
    'Код брони / Комментарий',
    'Ссылка на билет',
  ];

  const rows = admState.orders.map((o) => [
    o.id,
    o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : '',
    o.status || '',
    o.receiver_name || '',
    o.receiver_username ? `@${o.receiver_username}` : '',
    o.receiver_tg_id || '',
    o.verified_phone || '',
    o.city_cinema || '',
    o.sender_username ? `@${o.sender_username}` : o.sender_name || '',
    o.booking_code || '',
    o.ticket_file_url || '',
  ]);

  const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csvBody = [headers.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bochka-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ============================================================================
   ВКЛАДКА 3: ЛИДЕРБОРД «ГОНКИ ЗА ПРЕМЬЕРОЙ» (ТОП-50)
   ============================================================================ */
function renderLeadersPane() {
  const s = admState.stats || {};
  setText(
    'premiere-quota-badge',
    `Выдано мест на Премьеру: ${Number(s.premiere_winners_count ?? s.premiere_winners ?? 0)} / ${Number(s.max_premiere_winners ?? 20)}`
  );

  const tbody = document.getElementById('leaders-tbody');
  if (!tbody) return;

  if (!admState.leaders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-note">Игроков в лидерборде пока нет.</td></tr>';
    return;
  }

  tbody.innerHTML = admState.leaders
    .map((u, idx) => {
      const score = Number(u.premiere_score || 0).toFixed(1);
      const pts = Number(u.premiere_points || 0);
      const lvl = Number(u.current_level || 1);
      const duelsWon = Number(u.duels_won || 0);
      const tgLabel = u.tg_username ? `@${u.tg_username}` : u.tg_user_id ? `tg:${u.tg_user_id}` : u.uid;
      const kpHtml = isSafeHttpsUrl(u.kp_screenshot_url)
        ? `<a href="${escapeAttr(u.kp_screenshot_url)}" target="_blank" rel="noopener noreferrer" style="color:#fde047">✓ Скриншот ↗</a>`
        : u.kp_verified
          ? '✓ Да'
          : '—';

      const statusHtml = u.premiere_confirmed
        ? `<span class="status-badge status-sent">ПОДТВЕРЖДЁН · ${escapeHtml(u.premiere_code || '')}</span>`
        : u.premiere_won
          ? `<span class="status-badge status-pending">100/100 · ${escapeHtml(u.premiere_code || '')}</span>`
          : idx < 10
            ? `<span class="status-badge status-pending">🏆 ТОП-10 · УР.${lvl}</span>`
            : `<span class="mono-muted">В гонке (❤️ ${u.lives ?? 0} · Ур.${lvl})</span>`;

      const actionHtml = u.premiere_confirmed
        ? '<span class="mono-muted">Приглашён</span>'
        : `<button type="button" class="adm-btn adm-btn-secondary js-confirm-premiere" data-uid="${escapeAttr(u.uid)}">🏆 Подтвердить Премьеру</button>`;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(u.display_name || 'Узник цеха')}</strong><br/><span class="mono-muted">${escapeHtml(tgLabel)}</span></td>
          <td><strong style="color:#fde047">⭐ ${pts}</strong><br/><span class="mono-muted">${score} / 100</span></td>
          <td>👥 ${u.friends_brought || 0} · ⚔️ ${duelsWon}</td>
          <td>${u.packed_count || 0}</td>
          <td>${kpHtml}</td>
          <td>${statusHtml}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.js-confirm-premiere').forEach((btn) => {
    btn.addEventListener('click', () => handleConfirmPremiereWinner(btn.getAttribute('data-uid'), btn));
  });
}

async function handleConfirmPremiereWinner(uid, btn) {
  if (!uid) return;
  btn.disabled = true;
  try {
    const { data, error } = await adminSupabase.rpc('admin_confirm_premiere_winner', { p_uid: uid });
    if (error || !data?.ok) {
      showAdmToast('Ошибка подтверждения победителя Премьеры.');
      return;
    }

    if (data.tg_user_id) {
      await callAdminWebhook({
        adminAction: 'notify_premiere_winner',
        tgUserId: data.tg_user_id,
        premiereCode: data.premiere_code,
        displayName: data.display_name || '',
      });
    }

    showAdmToast(`✓ VIP-приглашение ${data.premiere_code} подтверждено и отправлено в бот!`);
    await refreshDashboardData();
  } finally {
    btn.disabled = false;
  }
}

/* ============================================================================
   ВКЛАДКА 4: УПРАВЛЕНИЕ ЛИМИТАМИ ЭКОНОМИКИ
   ============================================================================ */
function renderLimitsForm() {
  const s = admState.stats || {};
  const winIn = document.getElementById('cfg-win-every');
  const dailyIn = document.getElementById('cfg-max-daily');
  const totalIn = document.getElementById('cfg-max-total');
  const premIn = document.getElementById('cfg-max-premiere');
  const pairIn = document.getElementById('cfg-require-pair-receipt');
  const pauseIn = document.getElementById('cfg-is-paused');
  const notifyIn = document.getElementById('cfg-admin-notify-chats');
  const apEnabledIn = document.getElementById('cfg-autopilot-enabled');
  const apCapIn = document.getElementById('cfg-autopilot-hard-cap');
  const apBadge = document.getElementById('adm-autopilot-mode-badge');
  const apTel = document.getElementById('adm-autopilot-telemetry');

  if (winIn) winIn.value = String(s.win_every_n_hits ?? 100);
  if (dailyIn) dailyIn.value = String(s.max_daily_tickets ?? 6);
  if (totalIn) totalIn.value = String(s.max_total_tickets ?? 100);
  if (premIn) premIn.value = String(s.max_premiere_winners ?? 20);
  if (pairIn) pairIn.checked = Boolean(s.require_pair_receipt);
  if (pauseIn) pauseIn.checked = Boolean(s.is_paused);
  if (notifyIn) notifyIn.value = String(s.admin_notify_chat_ids || '');
  if (apEnabledIn) apEnabledIn.checked = s.auto_pilot_enabled !== false;
  if (apCapIn) apCapIn.value = String(s.auto_pool_hard_cap ?? 150);

  const mode = String(s.current_pacing_mode || 'normal').toLowerCase();
  if (apBadge) {
    if (mode === 'viral') {
      apBadge.textContent = '🚀 ВИРУСНЫЙ';
      apBadge.style.color = '#4ade80';
      apBadge.style.borderColor = 'rgba(74,222,128,0.55)';
    } else if (mode === 'quiet') {
      apBadge.textContent = '🌙 ТИХИЙ';
      apBadge.style.color = '#7dd3fc';
      apBadge.style.borderColor = 'rgba(125,211,252,0.55)';
    } else {
      apBadge.textContent = '⚖️ НОРМА';
      apBadge.style.color = '#fde047';
      apBadge.style.borderColor = 'rgba(253,224,71,0.45)';
    }
  }
  if (apTel) {
    const bonus = Number(s.rare_drop_bonus_pct ?? 0);
    const cd = Number(s.duel_cooldown_sec ?? 15);
    apTel.textContent = `Бонус редких карт: +${bonus}% · Кулдаун дуэлей: ${cd}с · Автопилот: ${s.auto_pilot_enabled === false ? 'ВЫКЛ' : 'ВКЛ'} · До 14 декабря`;
  }
}

async function handleSaveLimitsSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-limits');
  if (btn) btn.disabled = true;

  try {
    const rawWin = document.getElementById('cfg-win-every')?.value;
    const rawDaily = document.getElementById('cfg-max-daily')?.value;
    const rawTotal = document.getElementById('cfg-max-total')?.value;
    const rawPrem = document.getElementById('cfg-max-premiere')?.value;
    const rawApCap = document.getElementById('cfg-autopilot-hard-cap')?.value;
    const p_win_every_n_hits = Math.max(1, Number(rawWin !== '' && rawWin != null ? rawWin : 100));
    const p_max_daily_tickets = Math.max(0, Number(rawDaily !== '' && rawDaily != null ? rawDaily : 6));
    const p_max_total_tickets = Math.max(0, Number(rawTotal !== '' && rawTotal != null ? rawTotal : 100));
    const p_max_premiere_winners = Math.max(0, Number(rawPrem !== '' && rawPrem != null ? rawPrem : 20));
    const p_require_pair_receipt = Boolean(document.getElementById('cfg-require-pair-receipt')?.checked);
    const p_is_paused = Boolean(document.getElementById('cfg-is-paused')?.checked);
    const p_admin_notify_chat_ids = String(document.getElementById('cfg-admin-notify-chats')?.value || '').trim();
    const p_auto_pilot_enabled = Boolean(document.getElementById('cfg-autopilot-enabled')?.checked);
    const p_auto_pool_hard_cap = Math.min(500, Math.max(100, Number(rawApCap !== '' && rawApCap != null ? rawApCap : 150)));

    const { data, error } = await adminSupabase.rpc('admin_update_config', {
      p_win_every_n_hits,
      p_max_daily_tickets,
      p_max_premiere_winners,
      p_is_paused,
      p_max_total_tickets,
      p_require_pair_receipt,
      p_admin_notify_chat_ids,
      p_auto_pilot_enabled,
      p_auto_pool_hard_cap,
    });

    if (error || !data?.ok) {
      showAdmToast('Не удалось сохранить лимиты.');
      return;
    }

    admState.stats = data.stats || admState.stats;
    renderLimitsForm();
    renderAnalyticsPane();
    renderLeadersPane();
    showAdmToast('✓ Новые лимиты экономики и чаты уведомлений сохранены!');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleTestAdminNotify() {
  const btn = document.getElementById('btn-test-admin-notify');
  if (btn) btn.disabled = true;
  try {
    const chatIds = String(document.getElementById('cfg-admin-notify-chats')?.value || '').trim();
    const res = await callAdminWebhook({
      adminAction: 'test_admin_notify',
      chatIds,
    });
    if (res?.ok && Number(res.sentCount || 0) > 0) {
      showAdmToast(`✓ Тестовый пуш отправлен (${res.sentCount}/${res.totalTargets || res.sentCount} чат.)!`);
    } else if (res?.error === 'no_chat_ids_configured') {
      showAdmToast('Список чатов пуст — отправьте боту /bind_notify <код> или впишите ID чата.');
    } else {
      showAdmToast(`Не удалось отправить пуш (${res?.error || 'проверьте ID и права бота в чате'}).`);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function callAdminWebhook(payload) {
  const { data: sessionRes } = await adminSupabase.auth.getSession();
  const token = sessionRes?.session?.access_token || admState.session?.access_token || '';
  try {
    const res = await fetch(ENV.tgNotifyWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/* ============================================================================
   СОБЫТИЯ И ХЕЛПЕРЫ
   ============================================================================ */
function bindAdminEvents() {
  document.getElementById('admin-login-form')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('limits-form')?.addEventListener('submit', handleSaveLimitsSubmit);
  document.getElementById('btn-test-admin-notify')?.addEventListener('click', handleTestAdminNotify);

  document.getElementById('btn-adm-refresh')?.addEventListener('click', async () => {
    const ok = await refreshDashboardData();
    if (ok) showAdmToast('✓ Данные обновлены');
  });

  document.getElementById('btn-adm-logout')?.addEventListener('click', async () => {
    await adminSupabase.auth.signOut();
    admState.session = null;
    showAuthGate();
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', handleExportOrdersCsv);
  bindTop100Events();

  // v14.3: Две готовые стартовые кнопки копирования (team_prod и team_blog)
  const copyQuickStartLink = async (tag, label) => {
    const url = `https://t.me/bochka_film_bot?startapp=${tag}`;
    try {
      await navigator.clipboard.writeText(url);
      showAdmToast(`✓ Скопировано (${label}): ${url}`);
    } catch {
      window.prompt(`Скопируй ссылку (${label}):`, url);
    }
  };
  document.getElementById('btn-copy-team-prod')?.addEventListener('click', () =>
    copyQuickStartLink('team_prod', 'Чат продюсеров')
  );
  document.getElementById('btn-copy-team-blog')?.addEventListener('click', () =>
    copyQuickStartLink('team_blog', 'Вход для блогеров')
  );

  document.querySelectorAll('[data-adm-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const target = tabBtn.getAttribute('data-adm-tab');
      document.querySelectorAll('[data-adm-tab]').forEach((b) => b.classList.toggle('is-active', b === tabBtn));
      const map = {
        analytics: 'pane-analytics',
        orders: 'pane-orders',
        premiere: 'pane-premiere',
        limits: 'pane-limits',
        top100: 'pane-top100',
      };
      if (target === 'top100') loadTop100();
      for (const [k, paneId] of Object.entries(map)) {
        const el = document.getElementById(paneId);
        if (!el) continue;
        if (k === target) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      }
    });
  });

  document.querySelectorAll('[data-order-filter]').forEach((fBtn) => {
    fBtn.addEventListener('click', () => {
      admState.orderFilter = fBtn.getAttribute('data-order-filter') || 'all';
      document.querySelectorAll('[data-order-filter]').forEach((b) => b.classList.toggle('is-active', b === fBtn));
      renderOrdersPane();
    });
  });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ============================================================================
   ВКЛАДКА 5: ТОП-100 (блоки по 10), фильтр типа, карточка игрока, CSV
   ============================================================================ */
const topState = { rows: [], type: 'all', block: 0, mode: 'all' };

function trafficType(src) {
  const s = String(src || 'organic');
  if (s.startsWith('src_friend')) return 'friends';
  if (s.startsWith('src_test')) return 'test';
  if (s.startsWith('src_')) return 'blogger';
  return 'organic';
}

const TYPE_LABEL = { blogger: '🎤 Блогер', test: '🧪 Тест', friends: '🤝 Френдс', organic: '🌱 Органика' };

function genLabel(r) {
  return r.chain_depth > 0 ? `${r.chain_depth}-е колено` : 'прямая ссылка';
}

async function loadTop100() {
  const { data, error } = await adminSupabase.rpc('admin_get_top100', { p_mode: topState.mode });
  if (error || !data?.ok) {
    showAdmToast('Не удалось загрузить Топ-100');
    return;
  }
  topState.rows = (Array.isArray(data.rows) ? data.rows : []).map((r) => ({ ...r, type: trafficType(r.traffic_source) }));
  renderTop100();
}

function topFiltered() {
  return topState.rows.filter((r) => topState.type === 'all' || r.type === topState.type);
}

function td(text, cls) {
  const c = document.createElement('td');
  c.textContent = text == null || text === '' ? '—' : String(text);
  if (cls) c.className = cls;
  return c;
}

function avatarEl(url, size = 28) {
  const holder = document.createElement('span');
  holder.style.cssText = `display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:#222;overflow:hidden;vertical-align:middle;margin-right:6px;`;
  if (url && /^https:\/\//.test(url)) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.addEventListener('error', () => img.remove());
    holder.appendChild(img);
  }
  return holder;
}

function renderTop100() {
  const rows = topFiltered();
  const blocks = Math.max(1, Math.ceil(rows.length / 10));
  if (topState.block >= blocks) topState.block = 0;

  const pills = document.getElementById('top100-block-pills');
  if (pills) {
    pills.replaceChildren(
      ...Array.from({ length: blocks }, (_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `pill-btn${i === topState.block ? ' is-active' : ''}`;
        b.textContent = `Топ ${i * 10 + 1}–${i * 10 + 10}`;
        b.addEventListener('click', () => {
          topState.block = i;
          renderTop100();
        });
        return b;
      })
    );
  }

  const tbody = document.getElementById('top100-tbody');
  if (!tbody) return;
  const slice = rows.slice(topState.block * 10, topState.block * 10 + 10);
  if (!slice.length) {
    const tr = document.createElement('tr');
    const c = td('Пока нет игроков в этом списке');
    c.colSpan = 13;
    tr.appendChild(c);
    tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren(
    ...slice.map((r) => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      const who = r.display_name || r.tg_username || r.uid;
      const nameCell = document.createElement('td');
      nameCell.append(
        avatarEl(r.avatar_url),
        document.createTextNode(`${who}${r.tg_username ? ' @' + r.tg_username : ''}${r.tg_user_id ? ' · ' + r.tg_user_id : ''}`)
      );
      tr.append(
        td(r.rank),
        nameCell,
        td(`${TYPE_LABEL[r.type]} · ${r.traffic_source}`),
        td(genLabel(r)),
        td(fmtInt(r.premiere_points)),
        td(r.current_level),
        td(r.lives),
        td(`${r.direct_cnt} / ${r.branch_total}`),
        td(r.packed_count),
        td(`${r.passes_sent} (принято ${r.passes_claimed})`),
        td(r.phone),
        td(r.can_notify ? '✓' : '✗'),
        td(r.eligible ? '🎟 да' : '⛔ нет')
      );
      tr.addEventListener('click', () => showTop100Detail(r));
      return tr;
    })
  );
}

function chainSection(r, box) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '16px';
  const title = document.createElement('h3');
  title.textContent = 'Цепочка приглашений';
  wrap.appendChild(title);
  const status = document.createElement('p');
  status.className = 'mono-muted';
  status.textContent = 'Загрузка цепочки…';
  wrap.appendChild(status);

  adminSupabase.rpc('admin_get_chain', { p_uid: r.uid }).then(({ data, error }) => {
    if (error || !data?.ok) {
      status.textContent = 'Не удалось загрузить цепочку';
      return;
    }
    const parts = [];
    const up = Array.isArray(data.upline) ? data.upline : [];
    const path = document.createElement('p');
    path.style.cssText = 'font-size:13px;';
    path.textContent =
      'Путь: ' +
      up.map((u) => `${u.name}${u.source ? ' [' + u.source + ']' : ''}`).join('  →  ') +
      (up.length <= 1 ? '  (пришёл по прямой ссылке — выше никого нет)' : '');
    parts.push(path);

    const gens = Array.isArray(data.per_gen) ? data.per_gen : [];
    const total = gens.reduce((s, g) => s + g.players, 0);
    const sum = document.createElement('p');
    sum.style.cssText = 'font-size:13px;';
    sum.textContent = `Лично привёл: ${(data.direct || []).length} · всего после него в ветке: ${total} · колен: ${gens.length}`;
    parts.push(sum);

    if (gens.length) {
      const maxP = Math.max(...gens.map((g) => g.players), 1);
      const bars = document.createElement('div');
      gens.forEach((g, i) => {
        const prev = i === 0 ? null : gens[i - 1].players;
        const k = prev ? ` · K=${(g.players / prev).toFixed(2)}` : '';
        const row = document.createElement('div');
        row.style.cssText = 'margin:4px 0;font-size:12.5px;';
        const lbl = document.createElement('div');
        lbl.textContent = `${g.gen}-е колено${g.gen === 1 ? ' (лично)' : ''}: ${g.players} игр. · ⭐ ${fmtInt(g.points)} · закатали бочек: ${g.packed} (отправителей ${g.senders})${k}`;
        const track = document.createElement('div');
        track.className = 'funnel-track';
        const fill = document.createElement('div');
        fill.className = 'funnel-fill';
        fill.style.width = `${Math.max(3, Math.round((g.players / maxP) * 100))}%`;
        track.appendChild(fill);
        row.append(lbl, track);
        bars.appendChild(row);
      });
      parts.push(bars);
    }

    const kids = Array.isArray(data.direct) ? data.direct : [];
    if (kids.length) {
      const h = document.createElement('h4');
      h.textContent = 'Личные приглашённые (кто сколько привёл дальше)';
      h.style.marginTop = '10px';
      parts.push(h);
      const list = document.createElement('div');
      kids.forEach((k) => {
        const line = document.createElement('div');
        line.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px;';
        const t = document.createElement('span');
        t.textContent = `${k.name}${k.username ? ' @' + k.username : ''} · ⭐ ${fmtInt(k.points)} · бочек ${k.packed} · привёл дальше ${Math.max(0, (k.branch_size || 1) - 1)} · ${k.eligible ? '🎟 в розыгрыше' : '⛔ вне розыгрыша'}`;
        line.append(avatarEl(k.avatar, 24), t);
        list.appendChild(line);
      });
      parts.push(list);
    }
    status.replaceWith(...parts);
  });
  return wrap;
}

function showTop100Detail(r) {
  const box = document.getElementById('top100-detail');
  if (!box) return;
  const lines = [
    ['Место', `#${r.rank}`],
    ['Имя', r.display_name],
    ['Telegram', r.tg_username ? '@' + r.tg_username : ''],
    ['Telegram ID', r.tg_user_id],
    ['Язык Telegram', r.tg_lang],
    ['Телефон (подтверждён через бота)', r.phone],
    ['Тип / источник', `${TYPE_LABEL[r.type]} · ${r.traffic_source}`],
    ['Колено', genLabel(r)],
    ['Участвует в розыгрыше', r.eligible ? 'да' : 'нет'],
    ['Пришёл от (uid)', r.referred_by_uid],
    ['Очки ⭐ / шкала', `${fmtInt(r.premiere_points)} / ${Number(r.premiere_score || 0).toFixed(1)}`],
    ['Уровень / жизни', `${r.current_level} / ${r.lives}`],
    ['Привёл лично / в ветке', `${r.direct_cnt} / ${r.branch_total}`],
    ['Закатал бочек', r.packed_count],
    ['Подарил билетов (счётчик / записи)', `${r.tickets_gifted} / ${r.passes_sent}, приняли: ${r.passes_claimed}`],
    ['Дуэли сыграно / выиграно', `${r.duels_played} / ${r.duels_won}`],
    ['Кинопоиск подтверждён', r.kp_verified ? 'да' : 'нет'],
    ['Выиграл премьеру / код', r.premiere_won ? `да · ${r.premiere_code || ''}` : 'нет'],
    ['Можно написать в Telegram', r.can_notify ? 'да' : 'нет'],
    ['Первый заход', r.created_at ? new Date(r.created_at).toLocaleString('ru-RU') : ''],
    ['Последняя активность', r.updated_at ? new Date(r.updated_at).toLocaleString('ru-RU') : ''],
  ];
  const head = document.createElement('div');
  head.className = 'panel-head';
  const h2 = document.createElement('h2');
  h2.append(avatarEl(r.avatar_url, 40), document.createTextNode(`Карточка игрока #${r.rank}`));
  const actions = document.createElement('div');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'adm-btn adm-btn-secondary';
  toggle.textContent = r.eligible ? '⛔ Исключить из розыгрыша' : '🎟 Вернуть в розыгрыш';
  toggle.addEventListener('click', async () => {
    const { error } = await adminSupabase.rpc('admin_set_prize_excluded', { p_uid: r.uid, p_excluded: r.eligible });
    if (error) {
      showAdmToast('Не удалось изменить допуск');
      return;
    }
    showAdmToast('✓ Допуск изменён');
    box.setAttribute('hidden', '');
    loadTop100();
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'adm-btn adm-btn-ghost';
  close.textContent = '✕ Закрыть';
  close.addEventListener('click', () => box.setAttribute('hidden', ''));
  actions.append(toggle, close);
  head.append(h2, actions);

  const dl = document.createElement('div');
  dl.style.cssText = 'display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:6px 14px;font-size:13px;';
  lines.forEach(([k, v]) => {
    const a = document.createElement('span');
    a.className = 'mono-muted';
    a.textContent = k;
    const b = document.createElement('strong');
    b.textContent = v == null || v === '' ? '—' : String(v);
    dl.append(a, b);
  });

  const parts = [head, dl, chainSection(r, box)];
  if (Array.isArray(r.passes) && r.passes.length) {
    const t = document.createElement('h3');
    t.textContent = 'Последние подаренные билеты (кому / фото / статус)';
    t.style.marginTop = '14px';
    const ul = document.createElement('div');
    ul.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
    r.passes.forEach((p) => {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;gap:8px;align-items:center;border:1px solid rgba(255,255,255,.14);padding:6px 8px;';
      card.appendChild(avatarEl(p.photo, 44));
      const txt = document.createElement('span');
      txt.textContent = `${p.recipient_name || '—'} · ${p.status || ''}${p.receiver_username ? ' · @' + p.receiver_username : ''}${p.receiver_tg_id ? ' · ' + p.receiver_tg_id : ''}`;
      card.appendChild(txt);
      ul.appendChild(card);
    });
    parts.push(t, ul);
  }
  box.replaceChildren(...parts);
  box.removeAttribute('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // защита от формул Excel
  return `"${s.replace(/"/g, '""')}"`;
}

function exportTop100Csv() {
  const rows = topFiltered();
  if (!rows.length) {
    showAdmToast('Нет данных для выгрузки');
    return;
  }
  const cols = [
    ['rank', 'Место'], ['type', 'Тип'], ['traffic_source', 'Источник'], ['chain_depth', 'Колено (0=прямая ссылка)'],
    ['eligible', 'Участвует в розыгрыше'], ['display_name', 'Имя'], ['tg_username', 'Ник Telegram'],
    ['tg_user_id', 'Telegram ID'], ['avatar_url', 'Аватар (URL)'], ['tg_lang', 'Язык'], ['phone', 'Телефон'],
    ['premiere_points', 'Очки'], ['premiere_score', 'Шкала'], ['current_level', 'Уровень'], ['lives', 'Жизни'],
    ['direct_cnt', 'Привёл лично'], ['branch_total', 'Всего в ветке'], ['friends_brought', 'Друзей (счётчик игры)'],
    ['packed_count', 'Закатал бочек'], ['tickets_gifted', 'Билетов подарил (счётчик)'], ['passes_sent', 'Билетов подарил (записи)'],
    ['passes_claimed', 'Принято'], ['duels_played', 'Дуэлей'], ['duels_won', 'Побед'], ['kp_verified', 'Кинопоиск'],
    ['premiere_won', 'Выиграл премьеру'], ['premiere_code', 'VIP-код'], ['can_notify', 'Можно писать в TG'],
    ['referred_by_uid', 'Пригласил (uid)'], ['created_at', 'Первый заход'], ['updated_at', 'Активность'],
  ];
  const lines = [cols.map((c) => csvCell(c[1])).join(',')];
  rows.forEach((r) => lines.push(cols.map((c) => csvCell(r[c[0]])).join(',')));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bochka_top100_${topState.mode}_${topState.type}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function bindTop100Events() {
  document.querySelectorAll('[data-top-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      topState.type = btn.getAttribute('data-top-type') || 'all';
      topState.block = 0;
      document.querySelectorAll('[data-top-type]').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderTop100();
    });
  });
  document.getElementById('btn-top-mode-eligible')?.addEventListener('click', (e) => {
    topState.mode = topState.mode === 'eligible' ? 'all' : 'eligible';
    topState.block = 0;
    e.currentTarget.classList.toggle('is-active', topState.mode === 'eligible');
    loadTop100();
  });
  document.getElementById('btn-top100-csv')?.addEventListener('click', exportTop100Csv);

  // v14.3: Поиск игрока и дерева его рефералов по полному коду с номером (bl_timur_17 / pr_sergey_4)
  const runCodeLookup = async () => {
    const inp = document.getElementById('top100-code-search');
    const out = document.getElementById('top100-code-result');
    const code = (inp?.value || '').trim().toLowerCase();
    if (!out) return;
    if (!code) {
      out.setAttribute('hidden', '');
      return;
    }
    out.removeAttribute('hidden');
    const loading = document.createElement('div');
    loading.className = 'mono-muted';
    loading.textContent = `⏳ Ищем код ${code}...`;
    out.replaceChildren(loading);

    const { data, error } = await adminSupabase.rpc('admin_lookup_tracking_code_rpc', { p_code: code });
    if (error || !data?.ok) {
      const errNode = document.createElement('div');
      errNode.style.color = '#fca5a5';
      errNode.textContent = `Ошибка поиска: ${error?.message || 'rpc_error'}`;
      out.replaceChildren(errNode);
      return;
    }
    if (!data.found || !data.player) {
      const nf = document.createElement('div');
      nf.className = 'mono-muted';
      nf.textContent = `Игрок с кодом «${code}» пока не найден.`;
      out.replaceChildren(nf);
      return;
    }
    const pl = data.player;
    const tree = Array.isArray(data.tree) ? data.tree : [];

    const head = document.createElement('div');
    head.style.fontWeight = '700';
    head.style.color = '#fde68a';
    head.style.marginBottom = '6px';
    const handle = pl.tg_username ? `@${pl.tg_username}` : pl.uid;
    head.textContent = `🎯 ${pl.seed_tracking_code} · ${pl.display_name || 'Без имени'} (${handle})`;

    const meta = document.createElement('div');
    meta.className = 'mono-muted';
    meta.style.marginBottom = '8px';
    meta.textContent = `Источник: ${pl.seed_prefix || '—'} · Ур.${pl.current_level || 1} · ⭐ ${fmtInt(pl.premiere_points)} · Бочек отправил: ${pl.packed_count || 0} · Привёл в ветку: ${tree.length}`;

    const listWrap = document.createElement('div');
    if (!tree.length) {
      const empty = document.createElement('div');
      empty.className = 'mono-muted';
      empty.textContent = 'Пока никого не привёл дальше по цепочке.';
      listWrap.appendChild(empty);
    } else {
      const title = document.createElement('div');
      title.style.fontSize = '12px';
      title.style.color = '#bbf7d0';
      title.style.marginBottom = '4px';
      title.textContent = `🌳 Дерево приведённых от ${pl.seed_tracking_code} (${tree.length} чел.):`;
      listWrap.appendChild(title);
      tree.forEach((ch, idx) => {
        const line = document.createElement('div');
        line.className = 'mono-muted';
        line.style.padding = '3px 0';
        const chHandle = ch.tg_username ? `@${ch.tg_username}` : ch.uid;
        line.textContent = `${idx + 1}. ${ch.display_name || 'Игрок'} (${chHandle}) · root=${ch.root_tracking_code || '—'} · Ур.${ch.current_level || 1} · бочек: ${ch.packed_count || 0}`;
        listWrap.appendChild(line);
      });
    }
    out.replaceChildren(head, meta, listWrap);
  };

  document.getElementById('btn-top100-code-find')?.addEventListener('click', runCodeLookup);
  document.getElementById('top100-code-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCodeLookup();
    }
  });
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function isSafeHttpsUrl(u) {
  const s = String(u || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s);
}

let admToastTimer = null;
function showAdmToast(msg) {
  const el = document.getElementById('adm-toast');
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
  if (admToastTimer) clearTimeout(admToastTimer);
  admToastTimer = window.setTimeout(() => el.setAttribute('hidden', ''), 3200);
}

initAdminApp();
