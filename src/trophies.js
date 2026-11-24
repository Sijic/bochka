// ============================================================================
// БОЧКА v15.5: Ленивый модуль «Зал славы (Коллекционер)» и «Дуэль на фишки»
// Загружается строго по клику / событию — 0 КБ на холодном старте #screen-gate!
// Весь DOM строится безопасно (createElement + textContent, без innerHTML).
// ============================================================================
import { getCloudDb, getViewerUid } from './backend.js';
import { getCachedMediaSlots, getUnlockedArtifactLevels, openArtifactPlayerModal } from './v16_ux.js';

export const CHIP_DUEL_UNLOCK_INVITES = 1;

export const RARITY_META = Object.freeze({
  common: { label: 'ДРУГ', cls: 'rarity-common' },
  blogger: { label: 'БЛОГЕР', cls: 'rarity-blogger' },
  rare: { label: 'РЕДКАЯ', cls: 'rarity-rare' },
  epic: { label: 'ЭПИК', cls: 'rarity-epic' },
  legendary: { label: 'ЛЕГЕНДА', cls: 'rarity-legendary' },
});

const FIGHTER_PORTRAITS = [
  './public/sprites/fighter_1.webp',
  './public/sprites/fighter_2.webp',
  './public/sprites/fighter_3.webp',
  './public/sprites/fighter_4.webp',
  './public/sprites/fighter_5.webp',
  './public/sprites/fighter_6.webp',
];
const FALLBACK_IMG = FIGHTER_PORTRAITS[0];
const CARD_ART_VERSION = 'v=1553';

function fighterFallbackFor(seed) {
  const s = String(seed || 'bochka');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return FIGHTER_PORTRAITS[h % FIGHTER_PORTRAITS.length];
}

function safeImgUrl(url, fallbackSeed = '') {
  const s = String(url || '').trim();
  if (!s) return fallbackSeed ? fighterFallbackFor(fallbackSeed) : FALLBACK_IMG;
  if (
    s.startsWith('./') ||
    s.startsWith('/') ||
    s.startsWith('https://') ||
    s.startsWith('http://') ||
    s.startsWith('data:image/')
  ) {
    if (s.includes('/public/cards/') && !s.includes('?')) {
      return `${s}?${CARD_ART_VERSION}`;
    }
    return s;
  }
  return FALLBACK_IMG;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function formatSerial(serial, maxSupply) {
  if (!serial) return '';
  const pad = String(serial).padStart(3, '0');
  return maxSupply ? `#${pad}/${maxSupply}` : `#${pad}`;
}

function pluralFriends(n) {
  const abs = Math.abs(Number(n) || 0) % 100;
  const d = abs % 10;
  if (abs >= 11 && abs <= 14) return `${n} друзей`;
  if (d === 1) return `${n} друга`;
  if (d >= 2 && d <= 4) return `${n} друзей`;
  return `${n} друзей`;
}

export function syncHallOfFameBadges(count) {
  const n = Math.max(0, Number(count || 0));
  for (const id of ['hub-trophies-count', 'burger-trophies-count']) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(n);
  }
}

export async function fetchHallOfFame(tgUser = null) {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (db) {
    try {
      const { data, error } = await db.rpc('get_hall_of_fame_rpc', { p_uid: uid });
      if (!error && data?.ok) {
        const res = {
          ok: true,
          ownerUid: data.owner_uid || uid,
          totalCount: Number(data.total_count || 0),
          invitedFriends: Number(data.invited_friends || 0),
          level: Number(data.level || 1),
          levelTitle: String(data.level_title || 'Коллекционер'),
          unlockInvites: Number(data.chip_duel_unlock_invites || CHIP_DUEL_UNLOCK_INVITES),
          invitesRemaining: Number(data.invites_remaining ?? CHIP_DUEL_UNLOCK_INVITES),
          chipDuelUnlocked: Boolean(data.chip_duel_unlocked),
          rareDropBonusPct: Number(data.rare_drop_bonus_pct || 0),
          trophies: Array.isArray(data.trophies) ? data.trophies : [],
        };
        syncHallOfFameBadges(res.totalCount);
        return res;
      }
    } catch { /* fallback below */ }
  }
  return {
    ok: true,
    ownerUid: uid,
    totalCount: 0,
    invitedFriends: 0,
    level: 1,
    levelTitle: 'Коллекционер',
    unlockInvites: CHIP_DUEL_UNLOCK_INVITES,
    invitesRemaining: CHIP_DUEL_UNLOCK_INVITES,
    chipDuelUnlocked: false,
    rareDropBonusPct: 0,
    trophies: [],
  };
}

export async function collectBarrelTrophy(tgUser = null, barrelId = '') {
  const uid = getViewerUid(tgUser);
  const bid = String(barrelId || '').trim();
  if (!uid || !bid) return { ok: false, collected: false, reason: 'invalid_args' };
  const db = getCloudDb();
  if (!db) return { ok: false, collected: false, reason: 'offline' };
  try {
    const { data, error } = await db.rpc('collect_barrel_trophy_rpc', {
      p_uid: uid,
      p_barrel_id: bid,
    });
    if (!error && data?.ok) {
      if (data.collected) {
        const cur = Number(document.getElementById('hub-trophies-count')?.textContent || 0);
        syncHallOfFameBadges(cur + 1);
      }
      return {
        ok: true,
        collected: Boolean(data.collected),
        alreadyCollected: Boolean(data.already_collected),
        trophy: data.trophy || null,
      };
    }
    return { ok: false, collected: false, reason: data?.reason || 'rpc_error' };
  } catch {
    return { ok: false, collected: false, reason: 'network_error' };
  }
}

export async function mintRareMovieCard(tgUser = null, source = 'level3') {
  const uid = getViewerUid(tgUser);
  const db = getCloudDb();
  if (!uid || !db) return { ok: false, dropped: false, reason: 'offline' };
  try {
    const { data, error } = await db.rpc('mint_rare_movie_card_rpc', {
      p_uid: uid,
      p_source: source,
    });
    if (!error && data?.ok) {
      if (data.dropped) {
        const cur = Number(document.getElementById('hub-trophies-count')?.textContent || 0);
        syncHallOfFameBadges(cur + 1);
      }
      return {
        ok: true,
        dropped: Boolean(data.dropped),
        chancePct: Number(data.chance_pct || 0),
        reason: data.reason || 'ok',
        trophy: data.trophy || null,
      };
    }
    return { ok: false, dropped: false, reason: data?.reason || 'rpc_error' };
  } catch {
    return { ok: false, dropped: false, reason: 'network_error' };
  }
}

export async function cancelDuelChips(tgUser = null, roundKey = '') {
  const uid = getViewerUid(tgUser);
  const rk = String(roundKey || '').trim();
  const db = getCloudDb();
  if (!uid || !rk || !db) return { ok: false, unlocked: 0 };
  try {
    const { data, error } = await db.rpc('cancel_duel_chips_rpc', {
      p_uid: uid,
      p_round_key: rk,
    });
    if (!error && data?.ok) {
      return { ok: true, unlocked: Number(data.unlocked || 0) };
    }
  } catch { /* ignore */ }
  return { ok: false, unlocked: 0 };
}

function buildChipLidNode(trophy, { compact = false, selected = false, onClick = null } = {}) {
  const isFriendJoined = trophy.trophy_type === 'friend_joined';
  const meta = RARITY_META[trophy.rarity] || RARITY_META.common;
  const pillLabel = isFriendJoined ? 'ФИШКА ДРУГА' : meta.label;
  const btn = el(
    'button',
    `hof-chip-item ${meta.cls}${isFriendJoined ? ' is-friend-joined' : ''}${compact ? ' is-compact' : ''}${selected ? ' is-selected' : ''}${trophy.locked_in_duel_id ? ' is-locked-chip' : ''}`
  );
  btn.type = 'button';
  btn.dataset.trophyId = String(trophy.id || '');
  btn.dataset.trophyType = String(trophy.trophy_type || 'friend_barrel');
  btn.dataset.rarity = String(trophy.rarity || 'common');
  if (trophy.label) btn.dataset.friendName = String(trophy.label);

  const ring = el('div', 'hof-chip-lid');
  const img = document.createElement('img');
  const fbSrc = fighterFallbackFor(trophy.barrel_id || trophy.label || trophy.id);
  img.src = safeImgUrl(trophy.image_url, trophy.barrel_id || trophy.label || trophy.id);
  img.alt = String(trophy.label || 'Фишка');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.onerror = () => {
    if (img.src !== fbSrc) img.src = fbSrc;
  };
  ring.appendChild(img);

  const serialTxt = formatSerial(trophy.serial_number, trophy.max_supply);
  if (serialTxt) {
    ring.appendChild(el('span', 'hof-chip-serial', serialTxt));
  }
  if (!isFriendJoined && trophy.won_from_name) {
    ring.appendChild(el('span', 'hof-chip-stolen-badge', '⚔️'));
  }
  if (trophy.locked_in_duel_id) {
    ring.appendChild(el('span', 'hof-chip-in-duel-badge', '🔒'));
  }

  btn.appendChild(ring);
  btn.appendChild(el('span', 'hof-chip-rarity-pill', pillLabel));
  btn.appendChild(el('span', 'hof-chip-label', trophy.label || 'Друг'));

  if (!isFriendJoined && trophy.won_from_name && !compact) {
    btn.appendChild(el('span', 'hof-chip-won-mini', `от ${trophy.won_from_name}`));
  }

  if (typeof onClick === 'function') {
    btn.addEventListener('click', () => onClick(trophy));
  }
  return btn;
}

function showTrophyDetailOverlay(modalHost, trophy) {
  let ov = modalHost.querySelector('#hof-detail-overlay');
  if (ov) ov.remove();

  const isFriendJoined = trophy.trophy_type === 'friend_joined';
  const meta = RARITY_META[trophy.rarity] || RARITY_META.common;
  const pillLabel = isFriendJoined ? 'ФИШКА ДРУГА' : meta.label;
  ov = el('div', 'hof-detail-overlay');
  ov.id = 'hof-detail-overlay';

  const card = el('div', `hof-detail-card ${meta.cls}${isFriendJoined ? ' is-friend-joined' : ''}`);
  const closeBtn = el('button', 'icon-close hof-detail-close', '✕');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Закрыть просмотр фишки');
  closeBtn.addEventListener('click', () => ov.remove());
  card.appendChild(closeBtn);

  const artWrap = el('div', 'hof-detail-art');
  const img = document.createElement('img');
  img.src = safeImgUrl(trophy.image_url, trophy.barrel_id || trophy.label || trophy.id);
  img.alt = String(trophy.label || 'Фишка');
  artWrap.appendChild(img);

  if (!isFriendJoined && trophy.won_from_name) {
    artWrap.appendChild(el('div', 'hof-stolen-stamp', `ОТОБРАЛ У ${String(trophy.won_from_name).toUpperCase()}`));
  }
  card.appendChild(artWrap);

  const tags = el('div', 'hof-detail-tags');
  tags.appendChild(el('span', `hof-detail-pill ${meta.cls}`, pillLabel));
  const serialTxt = formatSerial(trophy.serial_number, trophy.max_supply);
  if (serialTxt) {
    tags.appendChild(el('span', 'hof-detail-pill hof-detail-serial', serialTxt));
  }
  card.appendChild(tags);

  card.appendChild(el('h3', 'hof-detail-title', trophy.label || 'Трофей цеха'));

  const historyLines = [];
  if (trophy.trophy_type === 'movie_card') {
    historyLines.push(
      serialTxt
        ? `Официальная номерная карточка фильма «БОЧКА» (${serialTxt}).`
        : 'Официальная коллекционная карточка фильма «БОЧКА».'
    );
  } else if (isFriendJoined) {
    historyLines.push('Именная «Фишка друга» — выдана за первое подключение друга к твоей бочке. Доступна в коллекции и в дуэлях 1×1!');
  } else if (trophy.rarity === 'blogger') {
    historyLines.push('Редкая блогерская фишка цеха — собрана при вскрытии бочки автора.');
  } else {
    historyLines.push('Личная фото-фишка из твоей ветки — собрана при вскрытии бочки друга.');
  }
  if (!isFriendJoined && trophy.won_from_name) {
    historyLines.push(`Трофей добыт в «Дуэли на фишки»: отобрал у ${trophy.won_from_name}.`);
  }
  if (trophy.locked_in_duel_id) {
    historyLines.push('Сейчас на кону в активной «Дуэли на фишки».');
  }
  card.appendChild(el('p', 'hof-detail-history', historyLines.join(' ')));

  const okBtn = el('button', 'btn-secondary btn-full btn-compact', 'НАЗАД НА ПОЛКУ');
  okBtn.type = 'button';
  okBtn.addEventListener('click', () => ov.remove());
  card.appendChild(okBtn);

  ov.appendChild(card);
  ov.addEventListener('click', (e) => {
    if (e.target === ov) ov.remove();
  });
  modalHost.appendChild(ov);
}

export function renderHallOfFameModal(bodyEl, data, { onInviteFriend, onOpenChipDuel, onPlayTil, initialTab = 'auto' } = {}) {
  if (!bodyEl) return;
  bodyEl.textContent = '';

  const level = Number(data?.level || 1);
  const levelTitle = String(data?.levelTitle || 'Коллекционер');
  const invited = Number(data?.invitedFriends || 0);
  const unlockTarget = Number(data?.unlockInvites || CHIP_DUEL_UNLOCK_INVITES);
  const remaining = Math.max(0, Number(data?.invitesRemaining ?? Math.max(0, unlockTarget - invited)));
  const unlocked = Boolean(data?.chipDuelUnlocked);
  const bonusPct = Number(data?.rareDropBonusPct || 0);
  const trophies = Array.isArray(data?.trophies) ? data.trophies : [];

  const slots = getCachedMediaSlots().level_artifacts || [];
  const unlockedLevels = new Set(getUnlockedArtifactLevels());
  const unlockedArtCount = slots.filter((s) => unlockedLevels.has(Number(s.level))).length;

  // v16.0: 2 понятные полки коллекции — «Артефакты фильма» (видео-кружки) и «Друзья из ветки»
  const tabBar = el('div', 'hof-tabs-v16');
  const tabArt = el('button', 'hof-tab-btn', `🎬 Артефакты фильма (${unlockedArtCount}/${slots.length})`);
  tabArt.type = 'button';
  tabArt.id = 'btn-hof-tab-artifacts';
  const tabFriends = el('button', 'hof-tab-btn', `👥 Друзья из ветки (${trophies.length})`);
  tabFriends.type = 'button';
  tabFriends.id = 'btn-hof-tab-friends';
  tabBar.appendChild(tabArt);
  tabBar.appendChild(tabFriends);
  bodyEl.appendChild(tabBar);

  // --- ПОЛКА 1: АРТЕФАКТЫ ФИЛЬМА (ВИДЕО-КРУЖКИ ПО УРОВНЯМ) ---
  const paneArt = el('div', 'hof-pane-v16');
  paneArt.id = 'hof-pane-artifacts';

  const artIntro = el(
    'p',
    'hof-art-intro',
    'Проходи уровни с Тилем и собирай короткие видео-кружки со съёмок фильма «БОЧКА». Нажми на открытый кружок, чтобы пересмотреть.'
  );
  paneArt.appendChild(artIntro);

  const artGrid = el('div', 'hof-chips-grid hof-artifacts-grid');
  artGrid.id = 'hof-artifacts-grid';
  for (const slot of slots) {
    const isOpen = unlockedLevels.has(Number(slot.level));
    const btn = el('button', `hof-chip-item hof-art-item${isOpen ? ' is-open' : ' is-locked-art'}`);
    btn.type = 'button';
    btn.dataset.artifactLevel = String(slot.level);

    const ring = el('div', 'hof-chip-lid hof-art-lid');
    const img = document.createElement('img');
    img.src = safeImgUrl(slot.poster_url);
    img.alt = String(slot.title || `Артефакт ${slot.level}`);
    img.loading = 'lazy';
    ring.appendChild(img);

    ring.appendChild(el('span', 'hof-art-play-pill', isOpen ? '▶' : '🔒'));
    ring.appendChild(el('span', 'hof-chip-serial', `УР. ${slot.level}`));
    btn.appendChild(ring);

    btn.appendChild(el('span', 'hof-chip-rarity-pill', isOpen ? slot.duration_label || 'ВИДЕО' : 'ЗАКРЫТО'));
    btn.appendChild(el('span', 'hof-chip-label', isOpen ? slot.title : `Уровень ${slot.level} с Тилем`));

    btn.addEventListener('click', () => {
      if (isOpen) {
        openArtifactPlayerModal(slot);
      } else if (typeof onPlayTil === 'function') {
        onPlayTil(Number(slot.level));
      }
    });
    artGrid.appendChild(btn);
  }
  paneArt.appendChild(artGrid);

  if (typeof onPlayTil === 'function') {
    const playTilBtn = el('button', 'btn-primary btn-full btn-compact hof-play-til-btn', '▶ ИГРАТЬ С ТИЛЕМ ЗА НОВЫЙ АРТЕФАКТ');
    playTilBtn.type = 'button';
    playTilBtn.id = 'btn-hof-play-til';
    playTilBtn.addEventListener('click', () => onPlayTil());
    paneArt.appendChild(playTilBtn);
  }
  bodyEl.appendChild(paneArt);

  // --- ПОЛКА 2: ДРУЗЬЯ ИЗ ВЕТКИ (+ ФИШКИ И ДУЭЛЬ НА ФИШКИ) ---
  const paneFriends = el('div', 'hof-pane-v16');
  paneFriends.id = 'hof-pane-friends';

  const statusCard = el('div', `hof-status-card${unlocked ? ' is-unlocked' : ''}`);
  const statusHead = el('div', 'hof-status-head');
  statusHead.appendChild(el('span', 'hof-level-badge', `УРОВЕНЬ ${level} · ${levelTitle.toUpperCase()}`));
  statusHead.appendChild(el('span', 'hof-count-pill', `🪙 ${trophies.length}`));
  statusCard.appendChild(statusHead);

  if (unlocked) {
    const unlockedMsg =
      bonusPct > 0
        ? `Дуэль на фишки открыта! Бонус Хранителя Зала: +${bonusPct}% к шансу редкой фишки.`
        : `Дуэль на фишки открыта! Приглашено друзей: ${invited}.`;
    statusCard.appendChild(el('p', 'hof-status-sub', unlockedMsg));
  } else {
    statusCard.appendChild(
      el(
        'p',
        'hof-status-sub',
        `Пригласи ${unlockTarget} друзей, чтобы открыть Дуэль на фишки: ${Math.min(invited, unlockTarget)} / ${unlockTarget}`
      )
    );
  }

  const progTrack = el('div', 'hof-progress-track');
  const pct = Math.min(100, Math.round((Math.min(invited, unlockTarget) / Math.max(1, unlockTarget)) * 100));
  const progFill = el('div', 'hof-progress-fill');
  progFill.style.width = `${pct}%`;
  progTrack.appendChild(progFill);
  statusCard.appendChild(progTrack);

  const invBtn = el('button', 'btn-secondary btn-full btn-compact hof-invite-btn', '🛢 СПРЯТАТЬ ДРУГА В БОЧКЕ');
  invBtn.type = 'button';
  invBtn.id = 'btn-hof-invite-friend';
  invBtn.addEventListener('click', () => {
    if (typeof onInviteFriend === 'function') onInviteFriend();
  });
  statusCard.appendChild(invBtn);
  paneFriends.appendChild(statusCard);

  const gridTitle = el(
    'div',
    'hof-section-title',
    trophies.length ? `ФИШКИ ДРУЗЕЙ ИЗ ВЕТКИ (${trophies.length})` : 'ФИШКИ ДРУЗЕЙ ИЗ ВЕТКИ'
  );
  paneFriends.appendChild(gridTitle);

  if (trophies.length === 0) {
    const empty = el('div', 'hof-empty-box');
    empty.appendChild(el('strong', '', 'Здесь появятся фото-фишки и аватарки друзей!'));
    empty.appendChild(
      el(
        'p',
        '',
        'Вскрывай бочки друзей из своей ветки или отправляй свои — их фото-фишки сохранятся здесь и пригодятся в Дуэли на фишки.'
      )
    );
    paneFriends.appendChild(empty);
  } else {
    const grid = el('div', 'hof-chips-grid');
    grid.id = 'hof-chips-grid';
    const modalHost = bodyEl.closest('.modal-card') || bodyEl;
    for (const tr of trophies) {
      grid.appendChild(
        buildChipLidNode(tr, {
          compact: false,
          onClick: (item) => showTrophyDetailOverlay(modalHost, item),
        })
      );
    }
    paneFriends.appendChild(grid);
  }

  const ctaWrap = el('div', 'hof-footer-cta');
  const duelBtn = el(
    'button',
    unlocked ? 'btn-primary btn-full hof-chip-duel-btn is-active' : 'btn-ghost btn-full hof-chip-duel-btn is-locked'
  );
  duelBtn.type = 'button';
  duelBtn.id = 'btn-hof-chip-duel';
  duelBtn.dataset.locked = unlocked ? '0' : '1';

  const mainLine = el('span', 'hof-cta-main', unlocked ? '🪙 ДУЭЛЬ НА ФИШКИ' : '🔒 ДУЭЛЬ НА ФИШКИ');
  const subLine = el(
    'span',
    'hof-cta-sub',
    unlocked
      ? 'Выбери фишку на кон и забери фишку соперника'
      : `Откроется на 3 уровне (ещё ${pluralFriends(remaining)})`
  );
  duelBtn.appendChild(mainLine);
  duelBtn.appendChild(subLine);

  duelBtn.addEventListener('click', () => {
    if (!unlocked) {
      invBtn.focus();
      invBtn.classList.add('is-pulse');
      window.setTimeout(() => invBtn.classList.remove('is-pulse'), 700);
      return;
    }
    if (typeof onOpenChipDuel === 'function') onOpenChipDuel(data);
  });

  ctaWrap.appendChild(duelBtn);
  paneFriends.appendChild(ctaWrap);
  bodyEl.appendChild(paneFriends);

  const setActiveTab = (name) => {
    const isArt = name === 'artifacts';
    tabArt.classList.toggle('is-active', isArt);
    tabFriends.classList.toggle('is-active', !isArt);
    paneArt.hidden = !isArt;
    paneFriends.hidden = isArt;
  };
  tabArt.addEventListener('click', () => setActiveTab('artifacts'));
  tabFriends.addEventListener('click', () => setActiveTab('friends'));
  const defaultTab = initialTab === 'friends' || (trophies.length > 0 && initialTab !== 'artifacts') ? 'friends' : 'artifacts';
  setActiveTab(defaultTab);
}

export function renderDuelChipPicker(
  panelEl,
  data,
  { selectedTrophyId = null, onSelect, onInviteFriend, onSwitchClassic } = {}
) {
  if (!panelEl) return;
  panelEl.textContent = '';

  const unlocked = Boolean(data?.chipDuelUnlocked);
  const invited = Number(data?.invitedFriends || 0);
  const unlockTarget = Number(data?.unlockInvites || CHIP_DUEL_UNLOCK_INVITES);
  const remaining = Math.max(0, Number(data?.invitesRemaining ?? Math.max(0, unlockTarget - invited)));
  const trophies = (Array.isArray(data?.trophies) ? data.trophies : []).filter((t) => !t.locked_in_duel_id);

  if (!unlocked) {
    const lockBox = el('div', 'duel-chips-lock-box');
    lockBox.id = 'duel-chips-lock-box';
    lockBox.appendChild(el('strong', 'duel-lock-title', '🔒 ДУЭЛЬ НА ФИШКИ ОТКРОЕТСЯ НА 3 УРОВНЕ'));
    lockBox.appendChild(
      el(
        'p',
        'duel-lock-desc',
        `Пригласи ещё ${pluralFriends(remaining)} (сейчас ${invited} / ${unlockTarget}), чтобы ставить фишки на кон и отбирать карточки соперников. Обычная дуэль доступна уже сейчас!`
      )
    );
    const acts = el('div', 'duel-lock-actions');
    const inv = el('button', 'btn-primary btn-compact', '📲 ПРИГЛАСИТЬ ДРУГА');
    inv.type = 'button';
    inv.addEventListener('click', () => onInviteFriend?.());
    const back = el('button', 'btn-ghost btn-compact', '⚔️ В ОБЫЧНУЮ ДУЭЛЬ');
    back.type = 'button';
    back.addEventListener('click', () => onSwitchClassic?.());
    acts.appendChild(inv);
    acts.appendChild(back);
    lockBox.appendChild(acts);
    panelEl.appendChild(lockBox);
    return;
  }

  const head = el('div', 'duel-chips-head');
  head.appendChild(el('strong', '', '🪙 ВЫБЕРИ СВОЮ ФИШКУ НА КОН'));
  head.appendChild(el('span', 'duel-chips-sub', 'Победитель забирает фишку проигравшего в свой Зал славы'));
  panelEl.appendChild(head);

  if (trophies.length === 0) {
    const empty = el('div', 'duel-chips-empty');
    empty.textContent =
      'Нет свободных фишек для ставки. Вскрой бочку друга или пройди Ур. 3/5/Тиля, чтобы получить первую фишку!';
    panelEl.appendChild(empty);
    return;
  }

  const grid = el('div', 'hof-chips-grid is-picker');
  grid.id = 'duel-chips-grid';
  for (const tr of trophies) {
    const isSel = Boolean(selectedTrophyId && String(tr.id) === String(selectedTrophyId));
    grid.appendChild(
      buildChipLidNode(tr, {
        compact: true,
        selected: isSel,
        onClick: (item) => onSelect?.(item),
      })
    );
  }
  panelEl.appendChild(grid);
}

export function renderCapturedTrophyBanner(containerEl, transferredTrophies = [], { onOpenHallOfFame } = {}) {
  if (!containerEl) return;
  containerEl.textContent = '';
  if (!Array.isArray(transferredTrophies) || transferredTrophies.length === 0) {
    containerEl.setAttribute('hidden', '');
    return;
  }

  containerEl.removeAttribute('hidden');
  containerEl.appendChild(el('div', 'duel-captured-head', '🏆 ТРОФЕЙ ОТОБРАН В ЗАЛ СЛАВЫ!'));

  const list = el('div', 'duel-captured-list');
  for (const tr of transferredTrophies) {
    const meta = RARITY_META[tr.rarity] || RARITY_META.common;
    const row = el('div', `duel-captured-card ${meta.cls}`);
    const thumb = el('div', 'duel-captured-thumb');
    const img = document.createElement('img');
    img.src = safeImgUrl(tr.image_url);
    img.alt = String(tr.label || 'Трофей');
    thumb.appendChild(img);
    row.appendChild(thumb);

    const info = el('div', 'duel-captured-info');
    info.appendChild(el('strong', '', tr.label || 'Трофей соперника'));
    const serialTxt = formatSerial(tr.serial_number, tr.max_supply);
    info.appendChild(el('span', 'duel-captured-meta', `${meta.label}${serialTxt ? ` · ${serialTxt}` : ''}`));
    if (tr.won_from_name) {
      info.appendChild(el('span', 'duel-captured-stamp', `ОТОБРАЛ У ${String(tr.won_from_name).toUpperCase()}`));
    }
    row.appendChild(info);
    list.appendChild(row);
  }
  containerEl.appendChild(list);

  if (typeof onOpenHallOfFame === 'function') {
    const btn = el('button', 'btn-secondary btn-full btn-compact duel-open-hof-btn', '🏆 ОТКРЫТЬ ЗАЛ СЛАВЫ');
    btn.type = 'button';
    btn.id = 'btn-duel-result-open-hof';
    btn.addEventListener('click', () => onOpenHallOfFame());
    containerEl.appendChild(btn);
  }
}
