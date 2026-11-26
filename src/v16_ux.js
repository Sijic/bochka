// ============================================================================
// БОЧКА v16.0: Чистый UX по референсам Duolingo + «5 букв» + видео-артефакты
// Без мелькающих тостов, без innerHTML (строго createElement + textContent).
// ============================================================================
import { Haptics } from './telegram.js';

const MEDIA_SLOTS_URL = './assets/config/media_slots.json?v=2021';
const ARTIFACTS_STORAGE_KEY = 'bochka_v16_unlocked_artifacts';
const TIL_LEVEL_STORAGE_KEY = 'bochka_v16_til_level';

const DEFAULT_MEDIA_SLOTS = {
  version: '16.0',
  til_victory_video: {
    id: 'til_victory_invite',
    title: 'Приглашение в кино от Тиля Швайгера',
    placeholder_caption: 'Тут будет видео со съёмок',
    placeholder_hint: '',
    video_url: '',
    poster_url: './public/cards/card_til_north_sea.webp?v=1553',
    duration_label: '0:18',
    director_badge: 'СНЯТО В РОССИИ · НАША КОМАНДА',
    director_title: 'Фильм снят русским режиссёром Алексеем Звонцовым',
    director_text:
      'Триллер «БОЧКА» сняла наша команда («Киноцех» и ООО «БИГСКРИНПРОДАКШН») под руководством русского режиссёра Алексея Звонцова вместе с Тилем Швайгером. В кинотеатрах с 17 декабря!',
  },
  level_artifacts: [
    {
      id: 'artifact_lvl_1',
      level: 1,
      title: 'Секрет цеха «Корпус Б»',
      subtitle: 'Видео-кружок со съёмок · Уровень 1',
      placeholder_caption: 'Тут будет видео со съёмок',
      video_url: '',
      poster_url: './public/cards/card_workshop_hall.webp?v=1553',
      duration_label: '0:15',
    },
    {
      id: 'artifact_lvl_2',
      level: 2,
      title: 'Внутри 200-литровой бочки',
      subtitle: 'Видео-кружок со съёмок · Уровень 2',
      placeholder_caption: 'Тут будет видео со съёмок',
      video_url: '',
      poster_url: './public/cards/card_boy_escape.webp?v=1553',
      duration_label: '0:14',
    },
    {
      id: 'artifact_lvl_3',
      level: 3,
      title: 'Взгляд сквозь крышку',
      subtitle: 'Видео-кружок со съёмок · Уровень 3',
      placeholder_caption: 'Тут будет видео со съёмок',
      video_url: '',
      poster_url: './public/cards/card_barrel_eye.webp?v=1553',
      duration_label: '0:16',
    },
    {
      id: 'artifact_lvl_4',
      level: 4,
      title: 'Пастор · Крупный план',
      subtitle: 'Видео-кружок со съёмок · Уровень 4',
      placeholder_caption: 'Тут будет видео со съёмок',
      video_url: '',
      poster_url: './public/cards/card_pastor_vigil.webp?v=1553',
      duration_label: '0:19',
    },
    {
      id: 'artifact_lvl_5',
      level: 5,
      title: 'Огонь и овчарка в кадре',
      subtitle: 'Видео-кружок со съёмок · Уровень 5',
      placeholder_caption: 'Тут будет видео со съёмок',
      video_url: '',
      poster_url: './public/cards/card_fire_dog.webp?v=1553',
      duration_label: '0:17',
    },
    {
      id: 'artifact_lvl_6',
      level: 6,
      title: 'Режиссёр Алексей Звонцов и Тиль',
      subtitle: 'Финальный видео-кружок · Уровень 6',
      placeholder_caption: 'Тут будет видео со съёмок',
      video_url: '',
      poster_url: './public/cards/card_til_north_sea.webp?v=1553',
      duration_label: '0:22',
    },
  ],
};

let cachedSlots = null;
let slotsPromise = null;

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function safeMediaUrl(url, fallback = '') {
  const s = String(url || '').trim();
  if (!s) return fallback;
  if (s.startsWith('./') || s.startsWith('/') || s.startsWith('https://') || s.startsWith('http://')) {
    return s;
  }
  return fallback;
}

export async function loadMediaSlots() {
  if (cachedSlots) return cachedSlots;
  if (!slotsPromise) {
    slotsPromise = fetch(MEDIA_SLOTS_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data === 'object' && Array.isArray(data.level_artifacts)) {
          cachedSlots = {
            ...DEFAULT_MEDIA_SLOTS,
            ...data,
            til_victory_video: {
              ...DEFAULT_MEDIA_SLOTS.til_victory_video,
              ...(data.til_victory_video || {}),
            },
            level_artifacts: data.level_artifacts.length ? data.level_artifacts : DEFAULT_MEDIA_SLOTS.level_artifacts,
          };
        } else {
          cachedSlots = DEFAULT_MEDIA_SLOTS;
        }
        return cachedSlots;
      })
      .catch(() => {
        cachedSlots = DEFAULT_MEDIA_SLOTS;
        return cachedSlots;
      });
  }
  return slotsPromise;
}

export function getCachedMediaSlots() {
  return cachedSlots || DEFAULT_MEDIA_SLOTS;
}

export function getUnlockedArtifactLevels() {
  try {
    const raw = localStorage.getItem(ARTIFACTS_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return Array.from(new Set(arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1))).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function unlockArtifactLevel(level = 1) {
  const cleanLvl = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  const current = getUnlockedArtifactLevels();
  const isNew = !current.includes(cleanLvl);
  const next = Array.from(new Set([...current, cleanLvl])).sort((a, b) => a - b);
  try {
    localStorage.setItem(ARTIFACTS_STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return { level: cleanLvl, isNew, unlocked: next };
}

export function syncUnlockedArtifactsForLevel(currentLevel = 1) {
  const slots = getCachedMediaSlots().level_artifacts || DEFAULT_MEDIA_SLOTS.level_artifacts;
  const completedCap = Math.min(slots.length, Math.max(0, Math.round(Number(currentLevel) || 1) - 1));
  if (completedCap <= 0) return getUnlockedArtifactLevels();
  const merged = new Set(getUnlockedArtifactLevels());
  for (let i = 1; i <= completedCap; i += 1) {
    merged.add(i);
  }
  const next = Array.from(merged).sort((a, b) => a - b);
  try {
    localStorage.setItem(ARTIFACTS_STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return next;
}

export function unlockNextArtifactLevel() {
  const slots = getCachedMediaSlots().level_artifacts || DEFAULT_MEDIA_SLOTS.level_artifacts;
  const current = new Set(getUnlockedArtifactLevels());
  const nextSlot = slots.find((s) => !current.has(Number(s.level)));
  if (!nextSlot) return null;
  const res = unlockArtifactLevel(Number(nextSlot.level));
  return {
    level: Number(nextSlot.level),
    isNew: res.isNew,
    slot: nextSlot,
    unlockedCount: res.unlocked.length,
    totalSlots: slots.length,
  };
}

export function getTilCurrentLevel() {
  try {
    const n = Number(localStorage.getItem(TIL_LEVEL_STORAGE_KEY) || 1);
    return Number.isFinite(n) && n >= 1 ? Math.min(20, Math.round(n)) : 1;
  } catch {
    return 1;
  }
}

export function setTilCurrentLevel(lvl = 1) {
  const clean = Math.max(1, Math.min(20, Math.round(Number(lvl) || 1)));
  try {
    localStorage.setItem(TIL_LEVEL_STORAGE_KEY, String(clean));
  } catch { /* ignore */ }
  return clean;
}

export function getArtifactSlotForLevel(level = 1) {
  const slots = getCachedMediaSlots().level_artifacts || DEFAULT_MEDIA_SLOTS.level_artifacts;
  const clean = Math.max(1, Math.round(Number(level) || 1));
  const exact = slots.find((s) => Number(s.level) === clean);
  if (exact) return exact;
  return slots[(clean - 1) % slots.length] || slots[0];
}

// ============================================================================
// СПОКОЙНАЯ КАРТОЧКА DUOLINGO (замена мелькающих тостов — 0 автоисчезновения!)
// ============================================================================
const cardQueue = [];
let activeCardBackdrop = null;

function flushNextDuolingoCard() {
  if (activeCardBackdrop || cardQueue.length === 0) return;
  const item = cardQueue.shift();
  const {
    icon = '🛢',
    badge = '',
    title = '',
    body = '',
    buttonText = 'ДАЛЬШЕ',
    secondaryText = '',
    tone = 'gold',
    customNode = null,
    onConfirm = null,
    onSecondary = null,
  } = item;

  const backdrop = el('div', `duo-card-backdrop is-tone-${tone}`);
  backdrop.id = 'duo-card-backdrop';
  backdrop.dataset.sig = `${title || ''}|${body || ''}`;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const card = el('div', 'duo-card-sheet');

  if (badge) {
    card.appendChild(el('span', 'duo-card-badge', badge));
  } else if (icon) {
    card.appendChild(el('div', 'duo-card-ico', icon));
  }

  if (title) {
    card.appendChild(el('h3', 'duo-card-title', title));
  }

  if (customNode instanceof Node) {
    card.appendChild(customNode);
  }

  if (body) {
    card.appendChild(el('p', 'duo-card-body', body));
  }

  const actions = el('div', 'duo-card-actions');
  const okBtn = el('button', 'btn-primary btn-full duo-card-btn', buttonText);
  okBtn.type = 'button';
  okBtn.id = 'btn-duo-card-next';

  const closeCard = (cb) => {
    Haptics.light();
    // Останавливаем возможные видео/таймеры внутри customNode
    try {
      backdrop.querySelectorAll('video').forEach((v) => v.pause());
      if (typeof backdrop.__cleanup === 'function') backdrop.__cleanup();
    } catch { /* ignore */ }
    backdrop.remove();
    activeCardBackdrop = null;
    if (typeof cb === 'function') {
      try { cb(); } catch { /* ignore */ }
    }
    flushNextDuolingoCard();
  };

  okBtn.addEventListener('click', () => closeCard(onConfirm));
  actions.appendChild(okBtn);

  if (secondaryText) {
    const secBtn = el('button', 'btn-ghost btn-full duo-card-sec-btn', secondaryText);
    secBtn.id = 'btn-duo-card-secondary';
    secBtn.type = 'button';
    secBtn.addEventListener('click', () => closeCard(onSecondary));
    actions.appendChild(secBtn);
  }

  card.appendChild(actions);
  backdrop.appendChild(card);

  if (customNode && typeof customNode.__cleanup === 'function') {
    backdrop.__cleanup = customNode.__cleanup;
  }

  activeCardBackdrop = backdrop;
  document.body.appendChild(backdrop);
  window.requestAnimationFrame(() => backdrop.classList.add('is-shown'));
}

export function showDuolingoCard(opts = {}) {
  // Не плодим одинаковые карточки подряд
  const sig = `${opts.title || ''}|${opts.body || ''}`;
  if (activeCardBackdrop && activeCardBackdrop.dataset.sig === sig) return;
  if (cardQueue.some((q) => `${q.title || ''}|${q.body || ''}` === sig)) return;
  cardQueue.push(opts);
  flushNextDuolingoCard();
}

export function isDuolingoCardOpen() {
  return Boolean(activeCardBackdrop);
}

// ============================================================================
// КРУГЛЫЙ ВИДЕО-ПЛЕЕР АРТЕФАКТА (реальный <video playsinline> или стильная заглушка)
// ============================================================================
export function createCircleVideoWidget(slot, { autoplay = true, compact = false } = {}) {
  const wrap = el('div', `v16-circle-player${compact ? ' is-compact' : ''}`);
  const ring = el('div', 'v16-circle-ring');
  const videoUrl = safeMediaUrl(slot?.video_url, '');
  const posterUrl = safeMediaUrl(slot?.poster_url, './public/cards/card_workshop_hall.webp?v=1553');
  let demoTimer = null;

  if (videoUrl) {
    const vid = document.createElement('video');
    vid.className = 'v16-circle-video';
    vid.src = videoUrl;
    vid.poster = posterUrl;
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    vid.loop = true;
    vid.muted = false;
    vid.autoplay = Boolean(autoplay);
    ring.appendChild(vid);

    const playOverlay = el('button', 'v16-circle-play-overlay', '▶');
    playOverlay.type = 'button';
    playOverlay.setAttribute('aria-label', 'Воспроизвести видео-кружок');
    playOverlay.hidden = Boolean(autoplay);

    const togglePlay = () => {
      if (vid.paused) {
        vid.play().then(() => { playOverlay.hidden = true; }).catch(() => {
          vid.muted = true;
          vid.play().then(() => { playOverlay.hidden = true; }).catch(() => {});
        });
      } else {
        vid.pause();
        playOverlay.hidden = false;
      }
    };
    ring.addEventListener('click', togglePlay);
    ring.appendChild(playOverlay);

    if (autoplay) {
      window.setTimeout(() => {
        vid.play().catch(() => {
          vid.muted = true;
          vid.play().catch(() => { playOverlay.hidden = false; });
        });
      }, 60);
    }
    wrap.__cleanup = () => {
      try { vid.pause(); } catch { /* ignore */ }
    };
  } else {
    // Честная стильная заглушка видео-кружка до подключения реального MP4
    const poster = document.createElement('img');
    poster.className = 'v16-circle-poster';
    poster.src = posterUrl;
    poster.alt = String(slot?.title || 'Видео-артефакт фильма');
    ring.appendChild(poster);

    const pillTop = el('span', 'v16-circle-lvl-pill', `🎬 ВИДЕО · ${slot?.duration_label || '0:15'}`);
    ring.appendChild(pillTop);

    const stubBadge = el(
      'div',
      'v16-circle-stub-badge',
      slot?.placeholder_caption || 'Тут будет видео со съёмок'
    );
    ring.appendChild(stubBadge);

    const statusLine = el(
      'div',
      'v16-circle-stub-caption',
      slot?.subtitle || 'Тут будет видео со съёмок'
    );

    wrap.appendChild(ring);
    wrap.appendChild(statusLine);
    wrap.__cleanup = () => {};
    return wrap;
  }

  wrap.appendChild(ring);
  return wrap;
}

export function showArtifactUnlockedCard(level = 1, { onNext, buttonText = 'ДАЛЬШЕ', bodyExtra = '', secondaryText = '', onSecondary = null } = {}) {
  const slot = getArtifactSlotForLevel(level);
  const circleWidget = createCircleVideoWidget(slot, { autoplay: true });
  const baseBody = `${slot.title} — сохранён в «Зал славы → Артефакты фильма». Можешь пересмотреть в любой момент.`;
  showDuolingoCard({
    badge: `🎬 АРТЕФАКТ УРОВНЯ ${slot.level}`,
    title: 'Собран артефакт!',
    body: bodyExtra ? `${bodyExtra} ${baseBody}` : baseBody,
    buttonText: buttonText || 'ДАЛЬШЕ',
    secondaryText,
    tone: 'gold',
    customNode: circleWidget,
    onConfirm: onNext,
    onSecondary,
  });
}

export function openArtifactPlayerModal(slot, { onClose } = {}) {
  const circleWidget = createCircleVideoWidget(slot, { autoplay: true });
  showDuolingoCard({
    badge: `🎬 УРОВЕНЬ ${slot?.level || 1} · АРТЕФАКТ ФИЛЬМА`,
    title: slot?.title || 'Видео-кружок о фильме',
    body:
      slot?.video_url
        ? slot?.subtitle || 'Закадровый видео-кружок фильма «БОЧКА»'
        : slot?.placeholder_caption || 'Тут будет видео со съёмок',
    buttonText: 'ЗАКРЫТЬ',
    tone: 'gold',
    customNode: circleWidget,
    onConfirm: onClose,
  });
}

// ============================================================================
// ПОБЕДНЫЙ ВИДЕО-ПЛЕЕР / ЗАГЛУШКА ТИЛЯ ШВАЙГЕРА (управляется через media_slots.json)
// ============================================================================
export function renderTilVictoryPlayer(hostEl, slot) {
  if (!hostEl) return () => {};
  hostEl.textContent = '';
  const data = slot || getCachedMediaSlots().til_victory_video;
  const videoUrl = safeMediaUrl(data?.video_url, '');
  const posterUrl = safeMediaUrl(data?.poster_url, './assets/keyed/ocean_till_sitting.webp');

  const frame = el('div', 'til-victory-video-frame');
  if (videoUrl) {
    const vid = document.createElement('video');
    vid.className = 'til-victory-video-el';
    vid.src = videoUrl;
    vid.poster = posterUrl;
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    vid.controls = true;
    vid.autoplay = true;
    frame.appendChild(vid);
    hostEl.appendChild(frame);
    return () => {
      try { vid.pause(); } catch { /* ignore */ }
    };
  }

  // Интерактивная видео-заглушка с постером, пульсом проигрывания и подписью
  const poster = document.createElement('img');
  poster.className = 'til-victory-poster';
  poster.src = posterUrl;
  poster.alt = 'Тиль Швайгер приглашает в кино на фильм «БОЧКА»';
  frame.appendChild(poster);

  const grad = el('div', 'til-victory-grad');
  frame.appendChild(grad);

  const topPill = el('span', 'til-victory-pill', `🎬 ВИДЕО-ПРИГЛАШЕНИЕ · ${data?.duration_label || '0:18'}`);
  frame.appendChild(topPill);

  const playCenter = el('button', 'til-victory-play-btn', '▶');
  playCenter.type = 'button';
  playCenter.setAttribute('aria-label', 'Включить превью видео-приглашения от Тиля Швайгера');
  frame.appendChild(playCenter);

  const captionBox = el('div', 'til-victory-caption');
  captionBox.appendChild(
    el('strong', 'til-victory-cap-main', data?.placeholder_caption || 'Тут будет видео со съёмок')
  );
  captionBox.appendChild(el('span', 'til-victory-cap-sub', '«Встретимся в кино 17 декабря!»'));
  frame.appendChild(captionBox);

  const bar = el('div', 'til-victory-bar');
  const barFill = el('div', 'til-victory-bar-fill');
  bar.appendChild(barFill);
  frame.appendChild(bar);

  let playing = true;
  let pct = 12;
  frame.classList.add('is-playing');
  playCenter.textContent = '⏸';
  const timer = window.setInterval(() => {
    if (!playing) return;
    pct = (pct + 2.2) % 102;
    barFill.style.width = `${Math.min(100, pct)}%`;
  }, 200);

  frame.addEventListener('click', () => {
    playing = !playing;
    Haptics.light();
    frame.classList.toggle('is-playing', playing);
    playCenter.textContent = playing ? '⏸' : '▶';
  });

  hostEl.appendChild(frame);
  return () => clearInterval(timer);
}

// ============================================================================
// ШКАЛА-ПАЗЛ БИЛЕТА ПО РЕФЕРЕНСУ «5 БУКВ» Т-БАНКА (1/4 -> 2/4 -> 3/4 -> 4/4)
// ============================================================================
export function renderTicketPuzzleWidget(containerEl, { shards = 0, pendingTickets = 0, nextStepHint = '', onClaim } = {}) {
  if (!containerEl) return;
  containerEl.textContent = '';

  const hasReady = Number(pendingTickets || 0) > 0;
  const filled = hasReady ? 4 : Math.max(0, Math.min(4, Math.round(Number(shards || 0))));

  const box = el('div', `v16-ticket-puzzle${hasReady ? ' is-ready' : ''}`);

  const head = el('div', 'v16-tp-head');
  head.appendChild(el('span', 'v16-tp-title', '🎁 БИЛЕТ В КИНО — ТОЛЬКО ДРУГУ'));
  head.appendChild(el('strong', 'v16-tp-counter', hasReady ? '4/4 ГОТОВ!' : `${filled}/4`));
  box.appendChild(head);

  const stepLabels = ['Друг', '8 бочек', '12 бочек', '16 бочек'];
  const grid = el('div', 'v16-tp-grid');
  for (let i = 1; i <= 4; i += 1) {
    const isFilled = i <= filled;
    const cell = el('div', `v16-tp-cell${isFilled ? ' is-filled' : ''}`);
    cell.appendChild(el('span', 'v16-tp-num', `${i}/4`));
    cell.appendChild(el('span', 'v16-tp-mark', isFilled ? '✓' : stepLabels[i - 1]));
    grid.appendChild(cell);
  }
  box.appendChild(grid);

  // Предельно простое правило: билет можно подарить ТОЛЬКО другу (себе оставить нельзя — идёте вместе!)
  box.appendChild(
    el('p', 'v16-tp-rule', 'Собери 4 части — подари бесплатный билет другу на 17 декабря (себе оставить нельзя, пойдёте вместе!)')
  );

  const stepHints = [
    '1/4: обыграй Тиля на 6 бочках и закатай друга',
    '2/4: обыграй Тиля на 8 бочках (Ур. 3)',
    '3/4: обыграй Тиля на 12 бочках (или когда друг откроет твою бочку)',
    '4/4: финальная схватка с Тилем на 16 бочках!',
  ];
  const hintText = hasReady
    ? '🎉 4/4 собрано! Нажми, чтобы подарить бесплатный билет другу.'
    : nextStepHint || stepHints[Math.min(3, filled)];
  const hintLine = el('div', 'v16-tp-next', hintText);
  box.appendChild(hintLine);

  if (hasReady && typeof onClaim === 'function') {
    const claimBtn = el('button', 'btn-primary btn-full btn-compact v16-tp-claim-btn', '🎁 ПОДАРИТЬ БИЛЕТ ДРУГУ');
    claimBtn.type = 'button';
    claimBtn.addEventListener('click', () => onClaim());
    box.appendChild(claimBtn);
  }

  containerEl.appendChild(box);
}

// ============================================================================
// МОДАЛКА «О ФИЛЬМЕ» — ГЛАВНЫЙ АКЦЕНТ НА РУССКОМ РЕЖИССЁРЕ И НАШЕЙ КОМАНДЕ
// ============================================================================
export function openAboutFilmModal({ onWatchTrailer, onOpenKinopoisk, onShareFriends } = {}) {
  const existing = document.getElementById('modal-about-film-v16');
  if (existing) existing.remove();

  const slots = getCachedMediaSlots();
  const til = slots.til_victory_video || DEFAULT_MEDIA_SLOTS.til_victory_video;

  const backdrop = el('div', 'modal-backdrop v16-about-backdrop');
  backdrop.id = 'modal-about-film-v16';

  const card = el('div', 'modal-card v16-about-card');
  const closeBtn = el('button', 'icon-close v16-about-close', '✕');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Закрыть окно о фильме');
  closeBtn.addEventListener('click', () => backdrop.remove());
  card.appendChild(closeBtn);

  card.appendChild(el('span', 'v16-director-badge', til.director_badge || 'СНЯТО В РОССИИ · НАША КОМАНДА'));
  card.appendChild(el('h2', 'v16-about-title', 'БОЧКА · В КИНО С 17 ДЕКАБРЯ'));

  const heroBox = el('div', 'v16-director-highlight');
  heroBox.appendChild(
    el('strong', 'v16-director-h', '🎬 Снято русским режиссёром Алексеем Звонцовым и нашей командой')
  );
  heroBox.appendChild(
    el(
      'p',
      'v16-director-p',
      'Остросюжетный триллер «БОЧКА» создан российским режиссёром Алексеем Звонцовым и нашей студией («Киноцех» и ООО «БИГСКРИНПРОДАКШН») в международном союзе с Тилем Швайгером («Достучаться до небес», «Бесславные ублюдки»).'
    )
  );
  card.appendChild(heroBox);

  const facts = el('div', 'v16-about-facts');
  const factItems = [
    ['Режиссёр', 'Алексей Звонцов (Россия)'],
    ['В главных ролях', 'Тиль Швайгер, Филипп Рейнхардт, Ирина Кобзева'],
    ['Производство', '«Киноцех» · ООО «БИГСКРИНПРОДАКШН»'],
    ['Премьера', '17 декабря 2026 года в кинотеатрах'],
  ];
  factItems.forEach(([k, v]) => {
    const row = el('div', 'v16-about-fact-row');
    row.appendChild(el('span', 'v16-af-k', k));
    row.appendChild(el('strong', 'v16-af-v', v));
    facts.appendChild(row);
  });
  card.appendChild(facts);

  const actions = el('div', 'v16-about-actions');
  const btnTrl = el('button', 'btn-primary btn-full', '🎬 СМОТРЕТЬ ТРЕЙЛЕР');
  btnTrl.type = 'button';
  btnTrl.addEventListener('click', () => {
    backdrop.remove();
    onWatchTrailer?.();
  });
  actions.appendChild(btnTrl);

  const btnKp = el('button', 'btn-secondary btn-full', '⭐ БУДУ СМОТРЕТЬ (КИНОПОИСК) ↗');
  btnKp.type = 'button';
  btnKp.addEventListener('click', () => onOpenKinopoisk?.());
  actions.appendChild(btnKp);

  const btnShare = el('button', 'btn-ghost btn-full', '📢 РАССКАЗАТЬ ДРУЗЬЯМ');
  btnShare.type = 'button';
  btnShare.addEventListener('click', () => {
    backdrop.remove();
    onShareFriends?.();
  });
  actions.appendChild(btnShare);

  card.appendChild(actions);
  backdrop.appendChild(card);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}
