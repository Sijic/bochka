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
      showAuthGate('У этого аккаунта нет прав администратора в таблице public.admins.');
      return;
    }

    showAdminDashboard();
    showAdmToast('✓ Вход выполнен. Данные загружены из Supabase.');
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
  const totalHits = Number(s.total_hits || 0);
  const won = Number(s.tickets_won || 0);
  const burned = Number(s.tickets_burned || 0);
  const dailyIssued = Number(s.daily_tickets_issued || 0);
  const maxDaily = Number(s.max_daily_tickets || 5);

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
  setText('kpi-tickets-summary', `${won} выпало (сегодня ${dailyIssued}/${maxDaily})`);
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
      if (o.kp_screenshot_url) {
        links.push(`<a href="${escapeAttr(o.kp_screenshot_url)}" target="_blank" rel="noopener noreferrer">Скриншот Кинопоиска ↗</a>`);
      }
      if (o.recipient_photo_url) {
        links.push(`<a href="${escapeAttr(o.recipient_photo_url)}" target="_blank" rel="noopener noreferrer">Фото получателя ↗</a>`);
      }
      if (o.ticket_file_url) {
        links.push(`<a href="${escapeAttr(o.ticket_file_url)}" target="_blank" rel="noopener noreferrer">Загруженный билет ↗</a>`);
      }

      return `
        <article class="order-card" data-order-id="${o.id}">
          <div class="order-meta">
            <div class="order-head-line">
              <span class="status-badge ${badge.cls}">${badge.txt}</span>
              <span class="mono-muted">#${o.id} · ${escapeHtml(dt)}</span>
            </div>
            <div><strong>Получатель:</strong> ${escapeHtml(o.receiver_name || 'Гость')} (<code>${escapeHtml(recvUser)}</code>)</div>
            <div><strong>Телефон (Telegram Verified):</strong> <code>${escapeHtml(o.verified_phone || '—')}</code></div>
            <div><strong>Город и кинотеатр:</strong> ${escapeHtml(o.city_cinema || '—')}</div>
            <div><strong>Кто подарил (×2 ❤️):</strong> ${escapeHtml(sendUser)}</div>
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
              <button type="button" class="adm-btn adm-btn-gold js-send-ticket" data-id="${o.id}">
                📨 Отправить билет в @bochka_film_bot
              </button>
              <button type="button" class="adm-btn adm-btn-danger js-reject-order" data-id="${o.id}">
                ✕ Отклонить
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  listEl.querySelectorAll('.js-send-ticket').forEach((btn) => {
    btn.addEventListener('click', () => handleSendTicketToBot(Number(btn.getAttribute('data-id')), btn));
  });
  listEl.querySelectorAll('.js-reject-order').forEach((btn) => {
    btn.addEventListener('click', () => handleRejectOrder(Number(btn.getAttribute('data-id')), btn));
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
      orderId,
      bookingCode,
      ticketFileUrl,
    });

    if (!res.ok) {
      showAdmToast(`Ошибка отправки: ${res.error || 'проверьте сессию'}`);
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
      orderId,
      reason: 'Отклонено модератором',
    });
    if (res.ok) {
      showAdmToast('Заявка переведена в отклонённые.');
      await refreshDashboardData();
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

  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
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
    `Выдано мест на Премьеру: ${Number(s.premiere_winners || 0)} / ${Number(s.max_premiere_winners || 20)}`
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
      const kpHtml = u.kp_screenshot_url
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
  const premIn = document.getElementById('cfg-max-premiere');
  const pauseIn = document.getElementById('cfg-is-paused');

  if (winIn) winIn.value = String(s.win_every_n_hits ?? 100);
  if (dailyIn) dailyIn.value = String(s.max_daily_tickets ?? 5);
  if (premIn) premIn.value = String(s.max_premiere_winners ?? 20);
  if (pauseIn) pauseIn.checked = Boolean(s.is_paused);
}

async function handleSaveLimitsSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-limits');
  if (btn) btn.disabled = true;

  try {
    const p_win_every_n_hits = Math.max(1, Number(document.getElementById('cfg-win-every')?.value || 100));
    const p_max_daily_tickets = Math.max(0, Number(document.getElementById('cfg-max-daily')?.value || 5));
    const p_max_premiere_winners = Math.max(0, Number(document.getElementById('cfg-max-premiere')?.value || 20));
    const p_is_paused = Boolean(document.getElementById('cfg-is-paused')?.checked);

    const { data, error } = await adminSupabase.rpc('admin_update_config', {
      p_win_every_n_hits,
      p_max_daily_tickets,
      p_max_premiere_winners,
      p_is_paused,
    });

    if (error || !data?.ok) {
      showAdmToast('Не удалось сохранить лимиты.');
      return;
    }

    admState.stats = data.stats || admState.stats;
    renderAnalyticsPane();
    renderLeadersPane();
    showAdmToast('✓ Новые лимиты экономики мгновенно вступили в силу!');
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

  document.querySelectorAll('[data-adm-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const target = tabBtn.getAttribute('data-adm-tab');
      document.querySelectorAll('[data-adm-tab]').forEach((b) => b.classList.toggle('is-active', b === tabBtn));
      const map = {
        analytics: 'pane-analytics',
        orders: 'pane-orders',
        premiere: 'pane-premiere',
        limits: 'pane-limits',
      };
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
