import { ENV } from './env.js';
import { initI18n, setLang, t, applyDomTranslations, onLangChange } from './i18n.js';
import {
  initTelegram,
  openTelegramShare,
  shareNativeOrFallback,
  copyToClipboard,
  openExternalLink,
  Haptics,
} from './telegram.js';
import { audio } from './audio.js';
import { WorkshopScene } from './scene.js';
import {
  DEMO_PORTRAITS,
  processPortraitToWebP,
  generateStoriesPosterPNG,
} from './imaging.js';
import {
  createBarrelPack,
  loadBarrelPack,
  recordBarrelResult,
  sendCinemaInviteReply,
  markTrailerCompleted,
  markKinopoiskVisited,
  syncFriendsOpenedTokens,
  getQuestState,
} from './backend.js';

const AIR_DURATION_SEC = 30.0;

const state = {
  tg: null,
  entered: false,
  activeScreen: 'gate',
  incomingParam: '',
  incomingPack: null,

  // Состояние текущего раунда в цеху
  round: {
    isDemo: true,
    targetIndex: 0,
    attemptsLeft: 3,
    attemptsUsed: 0,
    airLeft: AIR_DURATION_SEC,
    running: false,
    survived: false,
    portraitDataUrl: '',
    message: '',
    senderLabel: '',
    lastUrgentSec: 9,
  },

  // Состояние конструктора пранка (Экран 4)
  pack: {
    mode: 'friend',
    frameStyle: 'flashlight',
    rawSource: null,
    processed: null,
    lastShareUrl: '',
    lastWebUrl: '',
    customEdited: false,
  },

  cameraStream: null,
  ytPlayer: null,
  ytApiReady: false,
  airInterval: null,
};

let scene = null;

async function bootstrap() {
  state.tg = initTelegram();
  state.incomingParam = state.tg.startParam || '';

  await initI18n(state.tg.user?.lang || '');
  applyDomTranslations();

  const canvas = document.getElementById('workshop-canvas');
  scene = new WorkshopScene(canvas, {
    onHoverBarrel: handleBarrelHover,
    onStrikeBarrel: handleBarrelStrike,
    onCameraMove: (camPos) => audio.updateListenerCamera(camPos),
  });

  audio.setBarrelLayout(scene.getBarrelWorldPositions(), 0);
  window.addEventListener('resize', () => {
    audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex);
  });

  // Адаптивная подсказка управления (тач vs десктоп)
  updateControlHintText();
  onLangChange(() => {
    updateControlHintText();
    renderPresetChips();
    refreshSoundButtonLabel();
    refreshQuestUI();
  });

  // Предзагрузка входящей вирусной бочки (если открыто по ?b=ID или startapp=ID)
  if (state.incomingParam) {
    loadBarrelPack(state.incomingParam).then((pack) => {
      state.incomingPack = pack;
    });
  }

  // Настраиваем ссылку Кинопоиска в шапке
  const kpLink = document.getElementById('nav-kinopoisk');
  if (kpLink) kpLink.href = ENV.kinopoiskUrl;

  if (state.tg.user?.photoUrl) {
    document.getElementById('btn-tg-avatar')?.removeAttribute('hidden');
  }
  if (state.tg.user?.name) {
    const senderInput = document.getElementById('input-sender-name');
    if (senderInput) senderInput.value = state.tg.user.name;
  }

  bindUIEvents();
  await initPackConstructorDefaults();
  await refreshQuestUI();
}

function updateControlHintText() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const el = document.getElementById('hud-hint-text');
  if (el) {
    el.setAttribute('data-i18n', isTouch ? 'hudHintMobile' : 'hudHintDesktop');
    el.textContent = t(isTouch ? 'hudHintMobile' : 'hudHintDesktop');
  }
}

function showScreen(name) {
  state.activeScreen = name;
  const ids = {
    gate: 'screen-gate',
    modeA: 'screen-mode-a',
    workshop: 'screen-workshop',
    pack: 'screen-pack',
    finale: 'screen-finale',
  };

  for (const [key, domId] of Object.entries(ids)) {
    const el = document.getElementById(domId);
    if (!el) continue;
    if (key === name) {
      el.removeAttribute('hidden');
      el.classList.add('is-visible');
    } else {
      el.setAttribute('hidden', '');
      el.classList.remove('is-visible');
    }
  }

  if (name !== 'workshop') {
    document.getElementById('barrel-reticle')?.setAttribute('hidden', '');
    audio.stopListening();
    scene?.setInteractive(false);
  }
}

/* ============================================================================
   ВХОДНОЙ ШЛЮЗ -> РЕЖИМ А ИЛИ РЕЖИМ Б
   ============================================================================ */
async function enterWorkshopGate(withSound) {
  state.entered = true;
  await audio.unlock(withSound);
  refreshSoundButtonLabel();

  if (state.incomingParam) {
    if (!state.incomingPack) {
      state.incomingPack = await loadBarrelPack(state.incomingParam);
    }
    await startViralFriendRound(state.incomingPack);
  } else {
    // Чистый вход без ID -> Режим А (быстрый демо-раунд ИЛИ сразу упаковать друга)
    showScreen('modeA');
  }
}

async function startDemoRound() {
  const demoChars = t('demoChars');
  const pickIdx = Math.floor(Math.random() * DEMO_PORTRAITS.length);
  const charMeta = Array.isArray(demoChars) && demoChars[pickIdx]
    ? demoChars[pickIdx]
    : { name: 'УЗНИК ЦЕХА', quote: 'Смотри «Бочку» в кино с 17 декабря.' };

  const graded = await processPortraitToWebP(DEMO_PORTRAITS[pickIdx], 'flashlight');
  const targetIndex = Math.floor(Math.random() * 6);

  state.round = {
    isDemo: true,
    targetIndex,
    attemptsLeft: 3,
    attemptsUsed: 0,
    airLeft: AIR_DURATION_SEC,
    running: true,
    survived: false,
    portraitDataUrl: graded.dataUrl,
    message: charMeta.quote,
    senderLabel: charMeta.name,
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = t('modeATag');
  document.getElementById('hud-urgent-title').textContent = t('modeATitle');
  document.getElementById('btn-hud-pack')?.removeAttribute('hidden');

  launchWorkshopGameplay();
}

async function startViralFriendRound(pack) {
  let portraitDataUrl = pack?.photoUrl || '';
  if (!portraitDataUrl) {
    const fallbackGraded = await processPortraitToWebP(null, pack?.frameStyle || 'flashlight');
    portraitDataUrl = fallbackGraded.dataUrl;
  }

  const targetIndex =
    typeof pack?.targetIndex === 'number' && pack.targetIndex >= 0 && pack.targetIndex < 6
      ? pack.targetIndex
      : Math.floor(Math.random() * 6);

  state.round = {
    isDemo: false,
    targetIndex,
    attemptsLeft: 3,
    attemptsUsed: 0,
    airLeft: AIR_DURATION_SEC,
    running: true,
    survived: false,
    portraitDataUrl,
    message: pack?.message || t('presetsSelf')[0],
    senderLabel: pack?.senderName ? `${t('revealFromFriend')} · ${pack.senderName}` : t('revealFromFriend'),
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = t('modeBTag');
  document.getElementById('hud-urgent-title').textContent = t('modeBTitle');
  document.getElementById('btn-hud-pack')?.setAttribute('hidden', '');

  launchWorkshopGameplay();
}

function launchWorkshopGameplay() {
  stopAirTimer();
  renderAttemptSquares(3);
  updateAirHUD(AIR_DURATION_SEC);

  scene.resetRound({
    targetIndex: state.round.targetIndex,
    portraitUrl: state.round.portraitDataUrl,
  });
  audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex);
  scene.setInteractive(true);

  showScreen('workshop');

  let lastTs = performance.now();
  state.airInterval = window.setInterval(() => {
    if (!state.round.running) return;
    const now = performance.now();
    const dt = (now - lastTs) / 1000;
    lastTs = now;

    state.round.airLeft = Math.max(0, state.round.airLeft - dt);
    updateAirHUD(state.round.airLeft);

    const wholeSec = Math.ceil(state.round.airLeft);
    if (wholeSec <= 8 && wholeSec > 0 && wholeSec < state.round.lastUrgentSec) {
      state.round.lastUrgentSec = wholeSec;
      audio.playUrgentTick();
      Haptics.light();
    }

    if (state.round.airLeft <= 0) {
      finishRound(false);
    }
  }, 80);
}

function stopAirTimer() {
  if (state.airInterval) {
    clearInterval(state.airInterval);
    state.airInterval = null;
  }
}

function updateAirHUD(sec) {
  const valEl = document.getElementById('air-seconds');
  const fillEl = document.getElementById('air-bar-fill');
  const modEl = document.getElementById('hud-air-module');
  if (valEl) valEl.textContent = sec.toFixed(1);
  if (fillEl) fillEl.style.width = `${Math.max(0, Math.min(100, (sec / AIR_DURATION_SEC) * 100))}%`;
  if (modEl) modEl.classList.toggle('is-danger', sec < 10.0);
}

function renderAttemptSquares(attemptsLeft) {
  const wrap = document.getElementById('attempts-squares');
  if (!wrap) return;
  const squares = wrap.querySelectorAll('.attempt-sq');
  squares.forEach((sq, idx) => {
    const alive = idx < attemptsLeft;
    sq.classList.toggle('is-live', alive);
    sq.classList.toggle('is-spent', !alive);
  });
}

/* ============================================================================
   ПРОСЛУШКА МЕТАЛЛА И УДАР ВСКРЫТИЯ БОЧКИ
   ============================================================================ */
function handleBarrelHover(index, sx, sy, alreadyStruck) {
  const reticle = document.getElementById('barrel-reticle');
  const retId = document.getElementById('reticle-id');

  if (!state.round.running || index < 0) {
    reticle?.setAttribute('hidden', '');
    audio.stopListening();
    return;
  }

  if (reticle && retId) {
    reticle.removeAttribute('hidden');
    reticle.style.left = `${Math.max(70, Math.min(window.innerWidth - 70, sx))}px`;
    reticle.style.top = `${Math.max(92, Math.min(window.innerHeight - 90, sy))}px`;
    const labelBase = `${t('reticleBarrel')}${index + 1}`;
    retId.textContent = alreadyStruck ? `${labelBase} // ${t('reticleEmpty')}` : `${labelBase} // ${t('reticleListening')}`;
    reticle.classList.toggle('is-knocking', !alreadyStruck && index === state.round.targetIndex);
  }

  if (alreadyStruck) {
    audio.stopListening();
  } else {
    audio.setListeningBarrel(index);
  }
}

function handleBarrelStrike(index, worldPoint) {
  if (!state.round.running) return;
  const barrelObj = scene.barrels[index];
  if (!barrelObj || barrelObj.struck) return;

  audio.stopListening();
  document.getElementById('barrel-reticle')?.setAttribute('hidden', '');

  scene.triggerStrikeFX(index, worldPoint);
  audio.playStrike(index);

  state.round.attemptsUsed += 1;

  if (index === state.round.targetIndex) {
    // Попадание с 1–3 попытки!
    finishRound(true);
    return;
  }

  // Промах: сгорает 1 попытка
  state.round.attemptsLeft = Math.max(0, state.round.attemptsLeft - 1);
  renderAttemptSquares(state.round.attemptsLeft);

  if (state.round.attemptsLeft > 0) {
    triggerMiniScreamer(state.round.attemptsUsed);
  } else {
    // Слил все 3 попытки -> срываем крышку нужной бочки и ныряем внутрь
    finishRound(false);
  }
}

function triggerMiniScreamer(variant = 1) {
  audio.playMiniScreamer(variant);
  const el = document.getElementById('screamer-overlay');
  if (!el) return;
  el.removeAttribute('hidden');
  // Перезапуск CSS-анимации на 0.4 сек
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  window.setTimeout(() => {
    el.setAttribute('hidden', '');
  }, 410);
}

async function finishRound(survived) {
  if (!state.round.running) return;
  state.round.running = false;
  state.round.survived = survived;
  stopAirTimer();
  audio.stopListening();

  // Крышка загаданной бочки слетает, камера ныряет внутрь
  audio.playLidBlowOff(survived);
  scene.triggerRevealDive(state.round.targetIndex);

  // Параллельно пишем результат в Supabase и шлём сигнал отправителю через Telegram Bot API
  if (!state.round.isDemo && state.incomingPack) {
    recordBarrelResult(state.incomingPack, {
      survived,
      attemptsUsed: state.round.attemptsUsed || 3,
      timeLeft: state.round.airLeft,
      viewerTgUser: state.tg.user,
    }).catch(() => {});
  }

  window.setTimeout(async () => {
    await populateFinaleScreen();
    showScreen('finale');
  }, 1250);
}

/* ============================================================================
   ЭКРАН 4: КОНСТРУКТОР ПРАНКА «УПАКОВАТЬ В БОЧКУ»
   ============================================================================ */
async function initPackConstructorDefaults() {
  renderPresetChips();
  // По умолчанию берём атмосферный портрет персонажа для живого превью горловины
  await rebuildPackPortraitPreview(DEMO_PORTRAITS[1]);
}

function renderPresetChips() {
  const listEl = document.getElementById('preset-list');
  const inputEl = document.getElementById('input-custom-phrase');
  const counterEl = document.getElementById('phrase-counter');
  if (!listEl || !inputEl) return;

  const presets = t(state.pack.mode === 'self' ? 'presetsSelf' : 'presetsFriend');
  const arr = Array.isArray(presets) ? presets : [];
  listEl.innerHTML = '';

  arr.forEach((phrase, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn' + (idx === 0 && !state.pack.customEdited ? ' is-active' : '');
    btn.textContent = phrase;
    btn.addEventListener('click', () => {
      state.pack.customEdited = false;
      listEl.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      inputEl.value = phrase.slice(0, 45);
      if (counterEl) counterEl.textContent = `${inputEl.value.length}/45`;
      Haptics.light();
    });
    listEl.appendChild(btn);
  });

  if (!state.pack.customEdited && arr[0]) {
    inputEl.value = arr[0].slice(0, 45);
    if (counterEl) counterEl.textContent = `${inputEl.value.length}/45`;
  }
}

async function rebuildPackPortraitPreview(newSource = undefined) {
  if (newSource !== undefined) {
    state.pack.rawSource = newSource;
  }
  try {
    const processed = await processPortraitToWebP(state.pack.rawSource, state.pack.frameStyle);
    state.pack.processed = processed;

    const previewImg = document.getElementById('pack-preview-img');
    const sizeTag = document.getElementById('pack-size-tag');
    if (previewImg) previewImg.src = processed.dataUrl;
    if (sizeTag) sizeTag.textContent = `600×600 WEBP · ${processed.sizeKb} КБ`;
  } catch {
    const fallback = await processPortraitToWebP(null, state.pack.frameStyle);
    state.pack.processed = fallback;
    const previewImg = document.getElementById('pack-preview-img');
    if (previewImg) previewImg.src = fallback.dataUrl;
  }
}

async function handleSealBarrelClick() {
  const sealBtn = document.getElementById('btn-seal-barrel');
  const sealTxt = document.getElementById('btn-seal-text');
  if (!sealBtn || !sealTxt) return;

  sealBtn.disabled = true;
  sealTxt.textContent = t('sealingProgress');
  audio.playWeldSeal();

  try {
    if (!state.pack.processed) {
      await rebuildPackPortraitPreview();
    }
    const phrase = document.getElementById('input-custom-phrase')?.value || '';
    const senderName = document.getElementById('input-sender-name')?.value || '';

    const created = await createBarrelPack({
      mode: state.pack.mode,
      message: phrase,
      frameStyle: state.pack.frameStyle,
      senderName,
      tgUser: state.tg.user,
      processedImage: state.pack.processed,
    });

    state.pack.lastShareUrl = created.shareUrl;
    state.pack.lastWebUrl = created.webUrl;

    const outInput = document.getElementById('output-share-url');
    if (outInput) outInput.value = created.shareUrl;

    document.getElementById('share-result-box')?.removeAttribute('hidden');
    await refreshQuestUI();
    Haptics.success();
  } finally {
    sealBtn.disabled = false;
    sealTxt.textContent = t('btnSealBarrel');
  }
}

/* ============================================================================
   КАМЕРА БРАУЗЕРА (getUserMedia) ДЛЯ БЫСТРОГО СЕЛФИ
   ============================================================================ */
async function openSelfieCamera() {
  const modal = document.getElementById('modal-camera');
  const video = document.getElementById('camera-video');
  if (!modal || !video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    document.getElementById('input-photo-file')?.click();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      audio: false,
    });
    state.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    modal.removeAttribute('hidden');
  } catch {
    // Если пользователь запретил камеру — открываем системный выбор файла/камеры
    document.getElementById('input-photo-file')?.click();
  }
}

function closeSelfieCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((tr) => tr.stop());
    state.cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
  document.getElementById('modal-camera')?.setAttribute('hidden', '');
}

async function captureSelfieFrame() {
  const video = document.getElementById('camera-video');
  if (video && video.videoWidth > 0) {
    // Сохраняем стоп-кадр в отдельный canvas, чтобы смена рамки работала и после закрытия камеры
    const snap = document.createElement('canvas');
    const s = Math.min(video.videoWidth, video.videoHeight);
    snap.width = s;
    snap.height = s;
    const sctx = snap.getContext('2d');
    sctx.translate(s, 0);
    sctx.scale(-1, 1);
    sctx.drawImage(
      video,
      (video.videoWidth - s) * 0.5,
      (video.videoHeight - s) * 0.5,
      s,
      s,
      0,
      0,
      s,
      s
    );
    await rebuildPackPortraitPreview(snap);
    Haptics.medium();
  }
  closeSelfieCamera();
}

/* ============================================================================
   ЭКРАН 5: ФИНАЛ РАУНДА, ОТВЕТ В КИНО, ЖЕТОНЫ ЦЕХА И СТОРИС 1080x1920
   ============================================================================ */
async function populateFinaleScreen() {
  const r = state.round;
  const subtag = document.getElementById('finale-subtag');
  const portraitImg = document.getElementById('finale-portrait-img');
  const stampEl = document.getElementById('finale-stamp');
  const msgEl = document.getElementById('finale-message');
  const notifyEl = document.getElementById('finale-notify-line');

  if (subtag) subtag.textContent = r.isDemo ? t('revealDemoFrom') : r.senderLabel || t('revealFromFriend');
  if (portraitImg) portraitImg.src = r.portraitDataUrl;

  if (stampEl) {
    stampEl.classList.toggle('is-failed', !r.survived);
    stampEl.textContent = r.survived
      ? t('finaleSurvivedTitle', { n: Math.max(1, r.attemptsUsed) })
      : t('finaleFailedTitle');
  }

  if (msgEl) msgEl.textContent = `«${r.message}»`;
  if (notifyEl) {
    notifyEl.style.display = r.isDemo ? 'none' : 'block';
    notifyEl.textContent = t('finaleNotified');
  }

  await refreshQuestUI();
}

async function refreshQuestUI() {
  const synced = await syncFriendsOpenedTokens(state.tg?.user);
  const total = synced.totalTokens;

  const topBadge = document.getElementById('top-caps-count');
  const finBadge = document.getElementById('finale-caps-total');
  const modBadge = document.getElementById('modal-caps-count');
  const friendsPill = document.getElementById('quest-friends-pill');

  if (topBadge) topBadge.textContent = String(total);
  if (finBadge) finBadge.textContent = String(total);
  if (modBadge) modBadge.textContent = String(total);
  if (friendsPill) friendsPill.textContent = `${synced.friendsOpened || 0} × 2`;

  const trBtn = document.getElementById('quest-btn-trailer');
  if (trBtn) {
    trBtn.classList.toggle('is-done', synced.trailerDone);
    trBtn.textContent = synced.trailerDone ? `✓ ${t('questDone')}` : t('questOpen');
  }

  const kpBtn = document.getElementById('quest-btn-kp');
  if (kpBtn) {
    kpBtn.classList.toggle('is-done', synced.kinopoiskDone);
    kpBtn.textContent = synced.kinopoiskDone ? `✓ ${t('questDone')}` : t('questOpen');
  }
}

async function handleDownloadStories() {
  const btn = document.getElementById('btn-download-stories');
  if (btn) btn.disabled = true;
  Haptics.medium();

  try {
    const r = state.round;
    const pngBlob = await generateStoriesPosterPNG({
      portraitSrc: r.portraitDataUrl,
      survived: r.survived,
      attemptNum: Math.max(1, r.attemptsUsed || 1),
      message: r.message,
      labels: {
        title: t('gateTitle'),
        slogan: t('storiesSlogan'),
        premiere: t('storiesPremiere'),
        survivedStamp: t('storiesSurvived', { n: Math.max(1, r.attemptsUsed || 1) }),
        failedStamp: t('storiesFailed'),
      },
    });

    if (!pngBlob) return;

    const fileName = `bochka-story-${Date.now()}.png`;
    const file = new File([pngBlob], fileName, { type: 'image/png' });

    // На смартфонах предлагаем нативный шеринг файла в Сторис, если поддерживается, + скачивание
    if (navigator.canShare && navigator.canShare({ files: [file] }) && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({
          files: [file],
          title: 'БОЧКА — В кино с 17 декабря',
        });
        return;
      } catch { /* fallback to direct download */ }
    }

    const url = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================================
   ТРЕЙЛЕР (YOUTUBE IFRAME API ДЛЯ ЧЕСТНОГО ЗАЧЁТА ПРОСМОТРА ДО КОНЦА) + КАЛЕНДАРЬ
   ============================================================================ */
function openTrailerModal() {
  document.getElementById('modal-trailer')?.removeAttribute('hidden');
  ensureYouTubePlayer();
}

function closeTrailerModal() {
  document.getElementById('modal-trailer')?.setAttribute('hidden', '');
  if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
    try { state.ytPlayer.pauseVideo(); } catch { /* ignore */ }
  }
}

function ensureYouTubePlayer() {
  if (state.ytPlayer) return;

  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  const mountPlayer = () => {
    if (state.ytPlayer || !window.YT?.Player) return;
    state.ytPlayer = new window.YT.Player('yt-player-slot', {
      videoId: ENV.youtubeId,
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onStateChange: async (ev) => {
          // YT.PlayerState.ENDED === 0 -> игрок реально досмотрел трейлер до конца!
          if (ev.data === 0) {
            markTrailerCompleted();
            await refreshQuestUI();
            showToast('+1 ЖЕТОН ЦЕХА («КРЫШКА») НАЧИСЛЕН!');
            Haptics.success();
          }
        },
      },
    });
  };

  if (window.YT?.Player) {
    mountPlayer();
  } else {
    window.onYouTubeIframeAPIReady = mountPlayer;
  }
}

function downloadPremiereCalendarICS() {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bochka Quest//Premiere//RU',
    'BEGIN:VEVENT',
    'UID:bochka-premiere-20261217@bochka.quest',
    'DTSTAMP:20261112T120000Z',
    'DTSTART;VALUE=DATE:20261217',
    'DTEND;VALUE=DATE:20261218',
    'SUMMARY:Премьера триллера «БОЧКА» в кино!',
    `DESCRIPTION:Идём в кино на триллер «Бочка». Билеты и расписание: ${ENV.kinopoiskUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bochka-17-december.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ============================================================================
   ПРИВЯЗКА ВСЕХ СОБЫТИЙ ИНТЕРФЕЙСА
   ============================================================================ */
function bindUIEvents() {
  // Переключатель 3 языков (RU / KZ / EN)
  document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLang(btn.getAttribute('data-lang-btn'));
      Haptics.light();
    });
  });

  // Верхняя навигация в одну строку: ЦЕХ, ТРЕЙЛЕР, КИНОПОИСК, РОЗЫГРЫШ
  document.getElementById('nav-brand')?.addEventListener('click', () => {
    if (!state.entered) return;
    showScreen('modeA');
  });

  document.getElementById('nav-workshop')?.addEventListener('click', () => {
    if (!state.entered) return;
    if (state.round.running) showScreen('workshop');
    else showScreen('modeA');
  });

  document.getElementById('nav-trailer')?.addEventListener('click', () => openTrailerModal());

  document.getElementById('nav-kinopoisk')?.addEventListener('click', async () => {
    markKinopoiskVisited();
    await refreshQuestUI();
  });

  document.getElementById('nav-prize')?.addEventListener('click', async () => {
    await refreshQuestUI();
    document.getElementById('modal-prize')?.removeAttribute('hidden');
  });

  document.getElementById('btn-close-prize')?.addEventListener('click', () => {
    document.getElementById('modal-prize')?.setAttribute('hidden', '');
  });
  document.getElementById('btn-prize-pack')?.addEventListener('click', () => {
    document.getElementById('modal-prize')?.setAttribute('hidden', '');
    state.entered = true;
    showScreen('pack');
  });
  document.getElementById('btn-prize-trailer')?.addEventListener('click', () => {
    document.getElementById('modal-prize')?.setAttribute('hidden', '');
    openTrailerModal();
  });

  // Экран 1: Входной шлюз
  document.getElementById('btn-enter-sound')?.addEventListener('click', () => enterWorkshopGate(true));
  document.getElementById('btn-enter-mute')?.addEventListener('click', () => enterWorkshopGate(false));

  // Экран 2 (Режим А)
  document.getElementById('btn-start-demo')?.addEventListener('click', () => startDemoRound());
  document.getElementById('btn-go-pack')?.addEventListener('click', () => showScreen('pack'));

  // Экран 3 (HUD Цеха)
  document.getElementById('btn-hud-sound')?.addEventListener('click', async () => {
    await audio.toggleSound();
    refreshSoundButtonLabel();
  });

  document.getElementById('btn-hud-pack')?.addEventListener('click', () => {
    stopAirTimer();
    state.round.running = false;
    showScreen('pack');
  });

  // Экран 4 (Конструктор пранка)
  document.getElementById('btn-close-pack')?.addEventListener('click', () => {
    if (state.incomingPack && !state.round.isDemo) showScreen('finale');
    else showScreen('modeA');
  });

  document.getElementById('tab-mode-friend')?.addEventListener('click', () => {
    state.pack.mode = 'friend';
    state.pack.customEdited = false;
    document.getElementById('tab-mode-friend')?.classList.add('is-active');
    document.getElementById('tab-mode-self')?.classList.remove('is-active');
    renderPresetChips();
  });

  document.getElementById('tab-mode-self')?.addEventListener('click', () => {
    state.pack.mode = 'self';
    state.pack.customEdited = false;
    document.getElementById('tab-mode-self')?.classList.add('is-active');
    document.getElementById('tab-mode-friend')?.classList.remove('is-active');
    renderPresetChips();
  });

  document.getElementById('input-photo-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await rebuildPackPortraitPreview(file);
      Haptics.light();
    }
  });

  document.getElementById('btn-open-camera')?.addEventListener('click', () => openSelfieCamera());
  document.getElementById('btn-close-camera')?.addEventListener('click', () => closeSelfieCamera());
  document.getElementById('btn-cancel-camera')?.addEventListener('click', () => closeSelfieCamera());
  document.getElementById('btn-snap-photo')?.addEventListener('click', () => captureSelfieFrame());

  document.getElementById('btn-tg-avatar')?.addEventListener('click', async () => {
    if (state.tg?.user?.photoUrl) {
      await rebuildPackPortraitPreview(state.tg.user.photoUrl);
    }
  });

  document.querySelectorAll('[data-frame]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      document.querySelectorAll('[data-frame]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.pack.frameStyle = chip.getAttribute('data-frame') || 'flashlight';
      await rebuildPackPortraitPreview();
      Haptics.light();
    });
  });

  const phraseInput = document.getElementById('input-custom-phrase');
  const phraseCounter = document.getElementById('phrase-counter');
  phraseInput?.addEventListener('input', () => {
    state.pack.customEdited = true;
    document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('is-active'));
    if (phraseCounter) phraseCounter.textContent = `${phraseInput.value.length}/45`;
  });

  document.getElementById('btn-seal-barrel')?.addEventListener('click', () => handleSealBarrelClick());

  document.getElementById('btn-copy-url')?.addEventListener('click', async () => {
    if (!state.pack.lastShareUrl) return;
    await copyToClipboard(state.pack.lastShareUrl);
    showToast(t('copiedToast'));
    Haptics.light();
  });

  document.getElementById('btn-share-native')?.addEventListener('click', async () => {
    if (!state.pack.lastShareUrl) return;
    const msg = document.getElementById('input-custom-phrase')?.value || '';
    const res = await shareNativeOrFallback({
      title: 'БОЧКА — Найди себя за 3 попытки',
      text: `🛢 Тебя заварили в цеху (воздуха на 30 сек): «${msg}»`,
      url: state.pack.lastShareUrl,
    });
    if (res === 'copied') showToast(t('copiedToast'));
  });

  document.getElementById('btn-share-tg')?.addEventListener('click', () => {
    if (!state.pack.lastShareUrl) return;
    const msg = document.getElementById('input-custom-phrase')?.value || '';
    openTelegramShare(
      state.pack.lastShareUrl,
      `🛢 Кто-то заварил тебя в цеху «БОЧКИ»! Воздуха на 30 сек, 3 попытки: «${msg}»`
    );
  });

  // Секретный видеокружок со съёмок
  document.getElementById('btn-open-circle')?.addEventListener('click', () => {
    if (getQuestState().packedCount < 1) return;
    const modal = document.getElementById('modal-circle');
    const vid = document.getElementById('circle-video');
    modal?.removeAttribute('hidden');
    vid?.play().catch(() => {});
  });
  document.getElementById('btn-close-circle')?.addEventListener('click', () => {
    const vid = document.getElementById('circle-video');
    vid?.pause();
    document.getElementById('modal-circle')?.setAttribute('hidden', '');
  });

  // Экран 5: Финал раунда
  document.getElementById('btn-cinema-reply')?.addEventListener('click', async () => {
    await sendCinemaInviteReply(state.incomingPack, state.tg?.user);
    showToast(t('cinemaReplySent'));
    openTrailerModal();
  });

  document.getElementById('btn-pack-revenge')?.addEventListener('click', () => {
    showScreen('pack');
  });

  document.getElementById('btn-download-stories')?.addEventListener('click', () => handleDownloadStories());

  document.getElementById('btn-replay-round')?.addEventListener('click', () => {
    if (!state.round.isDemo && state.incomingPack) {
      startViralFriendRound(state.incomingPack);
    } else {
      startDemoRound();
    }
  });

  // Кнопки квеста «Жетоны цеха» и модалки трейлера
  document.getElementById('quest-btn-trailer')?.addEventListener('click', () => openTrailerModal());

  const goKinopoiskAction = async () => {
    markKinopoiskVisited();
    await refreshQuestUI();
    openExternalLink(ENV.kinopoiskUrl);
  };
  document.getElementById('quest-btn-kp')?.addEventListener('click', goKinopoiskAction);
  document.getElementById('btn-modal-kinopoisk')?.addEventListener('click', goKinopoiskAction);

  document.getElementById('btn-close-trailer')?.addEventListener('click', () => closeTrailerModal());
  document.getElementById('btn-modal-calendar')?.addEventListener('click', () => downloadPremiereCalendarICS());
}

function refreshSoundButtonLabel() {
  const btn = document.getElementById('btn-hud-sound');
  if (btn) {
    btn.textContent = audio.enabled ? t('hudSoundOn') : t('hudSoundOff');
  }
}

let toastTimer = null;
function showToast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.removeAttribute('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.setAttribute('hidden', '');
  }, 2800);
}

bootstrap();
