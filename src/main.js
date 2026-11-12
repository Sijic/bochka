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
import { BarrelVoiceRecorder } from './voice.js';
import { WorkshopScene } from './scene.js';
import {
  DEMO_PORTRAITS,
  processPortraitToWebP,
  verifyKinopoiskScreenshot,
  generateStoriesPosterPNG,
} from './imaging.js';
import {
  createBarrelPack,
  loadBarrelPack,
  recordBarrelResult,
  sendCinemaInviteReply,
  tryWinCinemaTicket,
  markTrailerCompleted,
  markKinopoiskVisited,
  markKpScreenshotVerified,
  isGoldenHuntUnlocked,
  getNightShiftAvailability,
  consumeNightShiftEntry,
  syncFriendsOpenedTokens,
  getQuestState,
} from './backend.js';

const AIR_DURATION_SEC = 30.0;
const KP_MIN_AWAY_SEC = 15.0;
const TRAILER_UNLOCK_SEC = 40.0;

const state = {
  tg: null,
  entered: false,
  activeScreen: 'gate',
  incomingParam: '',
  incomingPack: null,

  // Состояние текущего раунда в цеху ('demo' | 'viral' | 'nightShift')
  round: {
    modeType: 'demo',
    isDemo: true,
    targetIndex: 0,
    attemptsLeft: 3,
    attemptsUsed: 0,
    rescueStage: 0, // 0: базовые 3 удара, 1: ждём Кинопоиск, 2: 4-й удар, 3: ждём Трейлер, 4: 5-й победный удар
    airLeft: AIR_DURATION_SEC,
    running: false,
    strikeBusy: false,
    survived: false,
    portraitDataUrl: '',
    voiceUrl: '',
    message: '',
    senderLabel: '',
    lastUrgentSec: 9,
  },

  // Сверка отметки «Буду смотреть» по отсутствию на вкладке >= 15 сек
  kpSync: {
    waiting: false,
    leftTab: false,
    departedAt: 0,
    verified: false,
  },

  // Кастомный MP4 плеер трейлера без перемотки вперёд
  trailer: {
    forRescue: false,
    maxTime: 0,
    unlocked40: false,
    usingYtFallback: false,
    ytTimer: null,
    ytWatchedSec: 0,
  },

  // Состояние конструктора пранка (Экран 4)
  pack: {
    mode: 'friend',
    frameStyle: 'flashlight',
    rawSource: null,
    processed: null,
    voice: null, // { blob, mimeType, ext, durationSec, sizeKb, objectUrl }
    lastShareUrl: '',
    lastWebUrl: '',
    customEdited: false,
  },

  cameraStream: null,
  ytPlayer: null,
  airInterval: null,
  cooldownTimer: null,
};

let scene = null;
let voiceRecorder = null;

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
    onCeilingDrip: (x, z) => audio.playSpatialCeilingDrip(x, z),
  });

  audio.setBarrelLayout(scene.getBarrelWorldPositions(), 0);
  window.addEventListener('resize', () => {
    audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex);
  });

  updateControlHintText();
  onLangChange(() => {
    updateControlHintText();
    renderPresetChips();
    refreshSoundButtonLabel();
    refreshQuestUI();
  });

  // Предзагрузка входящей вирусной бочки (?b=jakaqgx или startapp=jakaqgx)
  if (state.incomingParam) {
    loadBarrelPack(state.incomingParam).then((pack) => {
      state.incomingPack = pack;
    });
  }

  // Настраиваем чистые ссылки Кинопоиска
  const kpLink = document.getElementById('nav-kinopoisk');
  if (kpLink) kpLink.href = ENV.kinopoiskUrl;
  const kpGoldLink = document.getElementById('link-golden-kp-card');
  if (kpGoldLink) kpGoldLink.href = ENV.kinopoiskUrl;

  const trailerVideo = document.getElementById('trailer-video');
  if (trailerVideo) trailerVideo.src = ENV.trailerMp4;

  if (state.tg.user?.photoUrl) {
    document.getElementById('btn-tg-avatar')?.removeAttribute('hidden');
  }
  if (state.tg.user?.name) {
    const senderInput = document.getElementById('input-sender-name');
    if (senderInput) senderInput.value = state.tg.user.name;
  }

  initVoiceRecorderInstance();
  initVisibilityAndAntiSeekGuards();
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
    audio.stopMuffledVoiceLoop();
    scene?.setInteractive(false);
  }
}

/* ============================================================================
   ВХОДНОЙ ШЛЮЗ -> ДЕМО ИЛИ ВИРУСНАЯ 5-ХОДОВАЯ ВОРОНКА ДРУГА (?b=ID)
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

  await audio.setSenderVoiceUrl('');

  state.round = {
    modeType: 'demo',
    isDemo: true,
    targetIndex,
    attemptsLeft: 3,
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: AIR_DURATION_SEC,
    running: true,
    strikeBusy: false,
    survived: false,
    portraitDataUrl: graded.dataUrl,
    voiceUrl: '',
    message: charMeta.quote,
    senderLabel: charMeta.name,
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = t('modeATag');
  document.getElementById('hud-urgent-title').textContent = t('modeATitle');
  document.getElementById('btn-hud-pack')?.removeAttribute('hidden');

  launchWorkshopGameplay(false);
}

async function startViralFriendRound(pack) {
  let portraitDataUrl = pack?.photoUrl || '';
  if (!portraitDataUrl) {
    const fallbackGraded = await processPortraitToWebP(null, pack?.frameStyle || 'flashlight');
    portraitDataUrl = fallbackGraded.dataUrl;
  }

  const voiceUrl = pack?.voiceUrl || '';
  await audio.setSenderVoiceUrl(voiceUrl);

  const initialTarget =
    typeof pack?.targetIndex === 'number' && pack.targetIndex >= 0 && pack.targetIndex < 6
      ? pack.targetIndex
      : Math.floor(Math.random() * 6);

  state.round = {
    modeType: 'viral',
    isDemo: false,
    targetIndex: initialTarget,
    attemptsLeft: 3,
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: AIR_DURATION_SEC,
    running: true,
    strikeBusy: false,
    survived: false,
    portraitDataUrl,
    voiceUrl,
    message: pack?.message || t('presetsSelf')[0],
    senderLabel: pack?.senderName ? `${t('revealFromFriend')} · ${pack.senderName}` : t('revealFromFriend'),
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = t('modeBTag');
  document.getElementById('hud-urgent-title').textContent = t('modeBTitle');
  document.getElementById('btn-hud-pack')?.setAttribute('hidden', '');

  launchWorkshopGameplay(false);
  if (voiceUrl) {
    audio.startMuffledVoiceLoop();
  }
}

async function startNightShiftRound() {
  const avail = getNightShiftAvailability();
  if (!avail.unlocked || !avail.canPlayNow) {
    refreshQuestUI();
    return;
  }

  consumeNightShiftEntry();
  await audio.setSenderVoiceUrl('');

  const goldenEmblem = createGoldenTicketPortraitDataUrl('');
  const targetIndex = Math.floor(Math.random() * 6);

  state.round = {
    modeType: 'nightShift',
    isDemo: false,
    targetIndex,
    attemptsLeft: 3,
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: AIR_DURATION_SEC,
    running: true,
    strikeBusy: false,
    survived: false,
    portraitDataUrl: goldenEmblem,
    voiceUrl: '',
    message: t('nightShiftEmptyMsg'),
    senderLabel: t('nightShiftTag'),
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = t('nightShiftTag');
  document.getElementById('hud-urgent-title').textContent = t('nightShiftTitle');
  document.getElementById('btn-hud-pack')?.setAttribute('hidden', '');

  launchWorkshopGameplay(true);
}

function launchWorkshopGameplay(golden = false) {
  stopAirTimer();
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');
  renderAttemptSquares(state.round.attemptsLeft);
  updateAirHUD(state.round.airLeft);

  scene.resetRound({
    targetIndex: state.round.targetIndex,
    portraitUrl: state.round.portraitDataUrl,
    golden,
  });
  audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex);
  scene.setInteractive(true);

  showScreen('workshop');
  startAirCountdownLoop();
}

function startAirCountdownLoop() {
  stopAirTimer();
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
      handleAirDepleted();
    }
  }, 80);
}

function handleAirDepleted() {
  const r = state.round;
  if (!r.running) return;

  // В вирусной 5-ходовой воронке сгорание кислорода включает Спасение №1 / №2, чтобы игрок прошёл весь путь!
  if (r.modeType === 'viral') {
    if (r.rescueStage === 0) {
      popRemainingEmptyBarrelsDownTo(3);
      openRescueStep1();
      return;
    }
    if (r.rescueStage === 2) {
      popRemainingEmptyBarrelsDownTo(2);
      openRescueStep2();
      return;
    }
    if (r.rescueStage === 4) {
      // Если на 5-м ударе вышел воздух — автоматически вскрываем одну из 2 оставшихся бочек
      const closed = getUnstruckBarrelIndices();
      const winIdx = closed[0] ?? r.targetIndex;
      r.targetIndex = winIdx;
      r.attemptsUsed = 5;
      finishRound(true);
      return;
    }
  }

  if (r.modeType === 'nightShift') {
    finishNightShiftRound(false, null);
    return;
  }

  finishRound(false);
}

function popRemainingEmptyBarrelsDownTo(keepClosedCount) {
  const closed = getUnstruckBarrelIndices();
  while (closed.length > keepClosedCount) {
    const idx = closed.shift();
    scene.triggerEmptyBarrelOpen(idx);
  }
  const stillClosed = getUnstruckBarrelIndices();
  if (stillClosed.length > 0 && !stillClosed.includes(state.round.targetIndex)) {
    state.round.targetIndex = stillClosed[0];
    audio.setTargetIndex(stillClosed[0]);
  }
}

function getUnstruckBarrelIndices() {
  return scene.barrels.filter((b) => !b.struck).map((b) => b.index);
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
   ПРОСЛУШКА МЕТАЛЛА И ДРАМАТУРГИЯ 5 УДАРОВ / НОЧНОЙ СМЕНЫ
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
    const showPulse =
      !alreadyStruck &&
      state.round.modeType !== 'nightShift' &&
      index === state.round.targetIndex;
    reticle.classList.toggle('is-knocking', showPulse);
  }

  if (alreadyStruck) {
    audio.stopListening();
  } else {
    audio.setListeningBarrel(index);
  }
}

async function handleBarrelStrike(index, worldPoint) {
  const r = state.round;
  if (!r.running || r.strikeBusy) return;
  const barrelObj = scene.barrels[index];
  if (!barrelObj || barrelObj.struck) return;

  audio.stopListening();
  document.getElementById('barrel-reticle')?.setAttribute('hidden', '');

  // -------------------------------------------------------------------------
  // РЕЖИМ 1: ЗАКРЫТАЯ «НОЧНАЯ СМЕНА» (АТОМАРНАЯ СЕРВЕРНАЯ ПРОВЕРКА try_win_ticket)
  // -------------------------------------------------------------------------
  if (r.modeType === 'nightShift') {
    r.strikeBusy = true;
    scene.triggerStrikeFX(index, worldPoint);
    audio.playStrike(index);
    r.attemptsUsed += 1;

    const winRes = await tryWinCinemaTicket(state.tg?.user);
    r.strikeBusy = false;
    if (!r.running) return;

    if (winRes.won) {
      r.targetIndex = index;
      r.portraitDataUrl = createGoldenTicketPortraitDataUrl(winRes.ticketCode);
      scene.setTargetPortrait(index, r.portraitDataUrl);
      finishNightShiftRound(true, winRes);
      return;
    }

    scene.triggerEmptyBarrelOpen(index);
    r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
    renderAttemptSquares(r.attemptsLeft);

    if (r.attemptsLeft > 0) {
      triggerMiniScreamer(r.attemptsUsed);
    } else {
      finishNightShiftRound(false, winRes);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // РЕЖИМ 2: 5-ХОДОВАЯ РЕЖИССИРОВАННАЯ ВОРОНКА ДРУГА (?b=jakaqgx)
  // -------------------------------------------------------------------------
  if (r.modeType === 'viral') {
    r.attemptsUsed += 1;

    // 5-й удар (после Кинопоиска и Трейлера) — 100% ГАРАНТИРОВАННОЕ ПОПАДАНИЕ в любую из 2 оставшихся бочек!
    if (r.rescueStage >= 4 || r.attemptsUsed >= 5) {
      r.targetIndex = index;
      scene.assignTargetBarrelNow(index);
      scene.triggerStrikeFX(index, worldPoint);
      audio.playStrike(index);
      finishRound(true);
      return;
    }

    // Удары 1, 2, 3 и 4 — ВСЕГДА ПРОМАХ (срываем крышку пустой бочки с облаком ржавой пыли и лязгом цепей)
    const otherClosed = getUnstruckBarrelIndices().filter((i) => i !== index);
    if (otherClosed.length > 0 && index === r.targetIndex) {
      const nextTarget = otherClosed[Math.floor(Math.random() * otherClosed.length)];
      r.targetIndex = nextTarget;
      audio.setTargetIndex(nextTarget);
    }

    scene.triggerStrikeFX(index, worldPoint);
    scene.triggerEmptyBarrelOpen(index);
    audio.playStrike(index);

    r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
    renderAttemptSquares(r.attemptsLeft);

    if (r.rescueStage === 0) {
      if (r.attemptsLeft > 0) {
        triggerMiniScreamer(r.attemptsUsed);
      } else {
        // 3-й промах: остаётся ровно 3 закрытые бочки -> открываем Спасение №1 (Кинопоиск >= 15 сек)
        triggerMiniScreamer(3);
        window.setTimeout(() => openRescueStep1(), 430);
      }
      return;
    }

    if (r.rescueStage === 2) {
      // 4-й промах: остаётся ровно 2 закрытые бочки -> открываем Спасение №2 (Собственный MP4 Трейлер 40 сек)
      triggerMiniScreamer(4);
      window.setTimeout(() => openRescueStep2(), 430);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // РЕЖИМ 3: ЧЕСТНЫЙ ДЕМО-РАУНД (чистый вход без ?b=)
  // -------------------------------------------------------------------------
  scene.triggerStrikeFX(index, worldPoint);
  audio.playStrike(index);
  r.attemptsUsed += 1;

  if (index === r.targetIndex) {
    finishRound(true);
    return;
  }

  scene.triggerEmptyBarrelOpen(index);
  r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
  renderAttemptSquares(r.attemptsLeft);

  if (r.attemptsLeft > 0) {
    triggerMiniScreamer(r.attemptsUsed);
  } else {
    finishRound(false);
  }
}

function triggerMiniScreamer(variant = 1) {
  audio.playMiniScreamer(variant);
  const el = document.getElementById('screamer-overlay');
  if (!el) return;
  el.removeAttribute('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  window.setTimeout(() => {
    el.setAttribute('hidden', '');
  }, 410);
}

/* ============================================================================
   ШАГ А & ШАГ Б: МОДАЛКА СПАСЕНИЯ (КИНОПОИСК >= 15 СЕК + MP4 ТРЕЙЛЕР 40 СЕК)
   ============================================================================ */
function openRescueStep1() {
  state.round.running = false;
  state.round.rescueStage = 1;
  state.round.airLeft = 0;
  state.round.attemptsLeft = 0;
  stopAirTimer();
  audio.stopListening();
  scene.setInteractive(false);
  updateAirHUD(0);
  renderAttemptSquares(0);

  state.kpSync = {
    waiting: false,
    leftTab: false,
    departedAt: 0,
    verified: false,
  };

  document.getElementById('rescue-step-1')?.removeAttribute('hidden');
  document.getElementById('rescue-step-2')?.setAttribute('hidden', '');
  document.getElementById('rescue-kp-sync')?.setAttribute('hidden', '');
  document.getElementById('rescue-kp-error')?.setAttribute('hidden', '');
  document.getElementById('btn-rescue-kp-claim')?.setAttribute('hidden', '');
  document.getElementById('modal-rescue')?.removeAttribute('hidden');
  Haptics.error();
}

function handleRescueKpOpenClick() {
  state.kpSync.waiting = true;
  state.kpSync.leftTab = false;
  state.kpSync.departedAt = Date.now();

  document.getElementById('rescue-kp-error')?.setAttribute('hidden', '');
  document.getElementById('btn-rescue-kp-claim')?.setAttribute('hidden', '');
  document.getElementById('rescue-kp-sync')?.removeAttribute('hidden');

  openExternalLink(ENV.kinopoiskUrl);
}

function evaluateKinopoiskReturn() {
  if (!state.kpSync.waiting) return;
  const awaySec = (Date.now() - state.kpSync.departedAt) / 1000;
  state.kpSync.waiting = false;
  document.getElementById('rescue-kp-sync')?.setAttribute('hidden', '');

  if (awaySec < KP_MIN_AWAY_SEC) {
    document.getElementById('rescue-kp-error')?.removeAttribute('hidden');
    Haptics.error();
    return;
  }

  state.kpSync.verified = true;
  markKinopoiskVisited();
  refreshQuestUI();
  document.getElementById('rescue-kp-error')?.setAttribute('hidden', '');
  document.getElementById('btn-rescue-kp-claim')?.removeAttribute('hidden');
  Haptics.success();
}

function claimKinopoiskFourthLife() {
  if (!state.kpSync.verified) return;
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');

  state.round.rescueStage = 2;
  state.round.attemptsLeft = 1;
  state.round.airLeft = 18.0;
  state.round.lastUrgentSec = 9;
  state.round.running = true;

  renderAttemptSquares(1);
  updateAirHUD(state.round.airLeft);
  scene.setInteractive(true);
  startAirCountdownLoop();
  Haptics.medium();
}

function openRescueStep2() {
  state.round.running = false;
  state.round.rescueStage = 3;
  state.round.airLeft = 0;
  state.round.attemptsLeft = 0;
  stopAirTimer();
  audio.stopListening();
  scene.setInteractive(false);
  updateAirHUD(0);
  renderAttemptSquares(0);

  document.getElementById('rescue-step-1')?.setAttribute('hidden', '');
  document.getElementById('rescue-step-2')?.removeAttribute('hidden');
  document.getElementById('modal-rescue')?.removeAttribute('hidden');
}

function claimTrailerFifthLife() {
  if (!state.trailer.unlocked40) return;
  closeTrailerModal();
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');

  state.round.rescueStage = 4;
  state.round.attemptsLeft = 1;
  state.round.airLeft = 22.0;
  state.round.lastUrgentSec = 9;
  state.round.running = true;

  renderAttemptSquares(1);
  updateAirHUD(state.round.airLeft);
  scene.setInteractive(true);
  if (state.round.voiceUrl) {
    audio.startMuffledVoiceLoop();
  }
  startAirCountdownLoop();
  Haptics.success();
}

/* ============================================================================
   ФИНАЛ РАУНДА: СРЫВ КРЫШКИ, ЧИСТЫЙ ГОЛОС ДРУГА И ПИНГ В TELEGRAM
   ============================================================================ */
async function finishRound(survived) {
  if (!state.round.running && state.round.rescueStage !== 4) return;
  state.round.running = false;
  state.round.survived = survived;
  stopAirTimer();
  audio.stopListening();
  audio.stopMuffledVoiceLoop();

  audio.playLidBlowOff(survived);
  scene.triggerRevealDive(state.round.targetIndex);

  // Как только крышка сорвана — включаем ЧИСТЫЙ голос друга без фильтра стальной бочки!
  if (state.round.voiceUrl) {
    window.setTimeout(() => {
      audio.playCleanSenderVoice(state.round.voiceUrl);
    }, 360);
  }

  if (!state.round.isDemo && state.incomingPack) {
    recordBarrelResult(state.incomingPack, {
      survived,
      attemptsUsed: state.round.attemptsUsed || 5,
      timeLeft: state.round.airLeft,
      viewerTgUser: state.tg.user,
    }).catch(() => {});
  }

  window.setTimeout(async () => {
    await populateFinaleScreen({ nightShiftResult: null });
    showScreen('finale');
  }, 1250);
}

async function finishNightShiftRound(won, winRes) {
  state.round.running = false;
  state.round.survived = Boolean(won);
  stopAirTimer();
  audio.stopListening();

  if (won) {
    audio.playLidBlowOff(true);
    scene.triggerRevealDive(state.round.targetIndex);
  } else {
    Haptics.error();
  }

  window.setTimeout(async () => {
    scene.setGoldenMode(false);
    await populateFinaleScreen({ nightShiftResult: { won, ...(winRes || {}) } });
    showScreen('finale');
  }, won ? 1200 : 450);
}

/* ============================================================================
   ЭКРАН 4: КОНСТРУКТОР ПРАНКА (ФОТО 512x512 <= 60 КБ + ГОЛОС <= 40 КБ)
   ============================================================================ */
function initVoiceRecorderInstance() {
  const btn = document.getElementById('btn-record-voice');
  const txt = document.getElementById('btn-record-voice-text');
  const bar = document.getElementById('voice-rec-bar');
  const timerEl = document.getElementById('voice-rec-timer');
  const fillEl = document.getElementById('voice-meter-fill');
  const readyRow = document.getElementById('voice-ready-row');
  const metaTag = document.getElementById('voice-meta-tag');

  voiceRecorder = new BarrelVoiceRecorder({
    onTick: ({ remainingSec, level }) => {
      if (timerEl) timerEl.textContent = `${remainingSec.toFixed(1)}s`;
      if (fillEl) fillEl.style.width = `${Math.max(8, Math.round(level * 100))}%`;
    },
    onStop: (result) => {
      if (state.pack.voice?.objectUrl) {
        URL.revokeObjectURL(state.pack.voice.objectUrl);
      }
      state.pack.voice = result;
      btn?.classList.remove('is-recording');
      if (txt) txt.textContent = t('btnRecordVoice');
      bar?.setAttribute('hidden', '');
      readyRow?.removeAttribute('hidden');
      if (metaTag) {
        metaTag.textContent = `✓ ${t('voiceReadyLabel')} · ${result.durationSec} СЕК · ${result.sizeKb} КБ`;
      }
      Haptics.success();
    },
    onError: (reason) => {
      btn?.classList.remove('is-recording');
      if (txt) txt.textContent = t('btnRecordVoice');
      bar?.setAttribute('hidden', '');
      if (reason === 'denied' || reason === 'unsupported') {
        showToast(t('voiceDeniedToast'));
      }
    },
  });
}

async function initPackConstructorDefaults() {
  renderPresetChips();
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
    if (sizeTag) sizeTag.textContent = `512×512 WEBP · ${processed.sizeKb} КБ`;
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

  if (voiceRecorder?.isRecording) {
    voiceRecorder.stop();
  }

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
      recordedVoice: state.pack.voice,
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
   ЭКРАН 5: ФИНАЛ РАУНДА, ЗОЛОТАЯ БОЧКА (СКРИНШОТ КП + RPC) И СТОРИС 9:16
   ============================================================================ */
async function populateFinaleScreen({ nightShiftResult = null } = {}) {
  const r = state.round;
  const subtag = document.getElementById('finale-subtag');
  const portraitImg = document.getElementById('finale-portrait-img');
  const stampEl = document.getElementById('finale-stamp');
  const msgEl = document.getElementById('finale-message');
  const voiceRow = document.getElementById('finale-voice-row');
  const notifyEl = document.getElementById('finale-notify-line');

  if (nightShiftResult) {
    if (subtag) subtag.textContent = t('nightShiftTag');
    if (portraitImg) portraitImg.src = r.portraitDataUrl;
    if (stampEl) {
      stampEl.classList.toggle('is-failed', !nightShiftResult.won);
      stampEl.textContent = nightShiftResult.won ? t('nightShiftWonTitle') : t('nightShiftEmptyTitle');
    }
    if (msgEl) {
      msgEl.textContent = nightShiftResult.won
        ? `ПРОМОКОД ВЫДАН СЕРВЕРОМ: ${nightShiftResult.ticketCode}`
        : t('nightShiftEmptyMsg');
    }
    voiceRow?.setAttribute('hidden', '');
    if (notifyEl) notifyEl.style.display = 'none';
  } else {
    if (subtag) subtag.textContent = r.isDemo ? t('revealDemoFrom') : r.senderLabel || t('revealFromFriend');
    if (portraitImg) portraitImg.src = r.portraitDataUrl;
    if (stampEl) {
      stampEl.classList.toggle('is-failed', !r.survived);
      stampEl.textContent = r.survived
        ? t('finaleSurvivedTitle', { n: Math.max(1, r.attemptsUsed) })
        : t('finaleFailedTitle');
    }
    if (msgEl) msgEl.textContent = `«${r.message}»`;
    if (voiceRow) {
      if (r.voiceUrl) voiceRow.removeAttribute('hidden');
      else voiceRow.setAttribute('hidden', '');
    }
    if (notifyEl) {
      notifyEl.style.display = r.isDemo ? 'none' : 'block';
      notifyEl.textContent = t('finaleNotified');
    }
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

  // Статус выигранного билета (если выбит на сервере)
  const winnerBox = document.getElementById('golden-winner-box');
  const codeOut = document.getElementById('output-ticket-code');
  const contactOut = document.getElementById('golden-winner-contact');
  if (synced.wonTicketCode && winnerBox) {
    winnerBox.removeAttribute('hidden');
    if (codeOut) codeOut.value = synced.wonTicketCode;
    if (contactOut) contactOut.textContent = synced.wonTicketContact || '';
  }

  // Чек-лист допуска к Золотой бочке («Ночная смена»)
  const packDone = (synced.packedCount || 0) >= 1;
  const kpScreenDone = Boolean(synced.kpScreenshotVerified);

  document.getElementById('golden-dot-pack')?.classList.toggle('is-done', packDone);
  const goldPackBtn = document.getElementById('btn-golden-go-pack');
  if (goldPackBtn) {
    goldPackBtn.classList.toggle('is-done', packDone);
    goldPackBtn.textContent = packDone ? `✓ ${t('questDone')}` : t('questOpen');
  }

  document.getElementById('golden-dot-kp')?.classList.toggle('is-done', kpScreenDone);
  const uploadLbl = document.getElementById('label-upload-kp-screen');
  const uploadTxt = document.getElementById('label-upload-kp-text');
  if (uploadLbl && uploadTxt) {
    uploadLbl.classList.toggle('is-done', kpScreenDone);
    uploadTxt.textContent = kpScreenDone ? `✓ ${t('questDone')}` : t('btnUploadKpScreen');
  }

  updateNightShiftButtonState();
}

function updateNightShiftButtonState() {
  const enterBtn = document.getElementById('btn-enter-night-shift');
  const cdText = document.getElementById('night-shift-cooldown-text');
  if (!enterBtn) return;

  const avail = getNightShiftAvailability();
  if (!avail.unlocked) {
    enterBtn.disabled = true;
    cdText?.setAttribute('hidden', '');
    return;
  }

  if (avail.canPlayNow) {
    enterBtn.disabled = false;
    cdText?.setAttribute('hidden', '');
    if (state.cooldownTimer) {
      clearInterval(state.cooldownTimer);
      state.cooldownTimer = null;
    }
    return;
  }

  enterBtn.disabled = true;
  if (cdText) {
    cdText.removeAttribute('hidden');
    const mm = String(Math.floor(avail.waitSec / 60)).padStart(2, '0');
    const ss = String(avail.waitSec % 60).padStart(2, '0');
    cdText.textContent = t('nightShiftCooldown', { min: mm, sec: ss });
  }

  if (!state.cooldownTimer) {
    state.cooldownTimer = window.setInterval(() => {
      const next = getNightShiftAvailability();
      if (next.canPlayNow) {
        clearInterval(state.cooldownTimer);
        state.cooldownTimer = null;
      }
      updateNightShiftButtonState();
    }, 1000);
  }
}

async function handleKinopoiskScreenshotUpload(file) {
  const fb = document.getElementById('kp-screen-feedback');
  if (!file || !fb) return;

  const result = await verifyKinopoiskScreenshot(file);
  fb.removeAttribute('hidden');

  if (result.ok) {
    markKpScreenshotVerified();
    fb.className = 'kp-screen-feedback is-ok';
    fb.textContent = t('kpScreenSuccess');
    Haptics.success();
    await refreshQuestUI();
  } else {
    fb.className = 'kp-screen-feedback is-err';
    fb.textContent = t('kpScreenFail');
    Haptics.error();
  }
}

function createGoldenTicketPortraitDataUrl(ticketCode = '') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
  g.addColorStop(0, '#4a3208');
  g.addColorStop(0.65, '#1c1304');
  g.addColorStop(1, '#070708');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 6;
  ctx.strokeRect(76, 176, 360, 160);

  ctx.fillStyle = '#fde047';
  ctx.font = '900 44px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ЗОЛОТАЯ БОЧКА', 256, 244);

  ctx.fillStyle = '#f5efe2';
  ctx.font = '700 22px monospace';
  ctx.fillText(ticketCode || 'БИЛЕТ В КИНО · 17.12', 256, 294);

  return c.toDataURL('image/webp', 0.85);
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

    if (navigator.canShare && navigator.canShare({ files: [file] }) && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({
          files: [file],
          title: 'БОЧКА — В кино с 17 декабря',
        });
        return;
      } catch { /* fallback */ }
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
   КАСТОМНЫЙ SELF-HOSTED MP4 ПЛЕЕР ТРЕЙЛЕРА (БЕЗ ПЕРЕМОТКИ ВПЕРЁД + 40 СЕК UNLOCK)
   ============================================================================ */
function initVisibilityAndAntiSeekGuards() {
  // 1. Контроль ухода/возврата на вкладку для:
  //    - сверки 15 секунд на Кинопоиске (Шаг А)
  //    - авто-паузы собственного MP4 трейлера при сворачивании вкладки (Шаг Б)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.kpSync.waiting) {
        state.kpSync.leftTab = true;
        state.kpSync.departedAt = Date.now();
      }
      const vid = document.getElementById('trailer-video');
      if (vid && !vid.paused) {
        vid.pause();
        syncTrailerPlayButton();
      }
    } else if (state.kpSync.waiting && state.kpSync.leftTab) {
      evaluateKinopoiskReturn();
    }
  });

  window.addEventListener('blur', () => {
    if (state.kpSync.waiting && !state.kpSync.leftTab) {
      state.kpSync.leftTab = true;
      state.kpSync.departedAt = Date.now();
    }
  });

  window.addEventListener('focus', () => {
    if (state.kpSync.waiting && state.kpSync.leftTab) {
      evaluateKinopoiskReturn();
    }
  });

  // 2. Жёсткая блокировка перемотки вперёд и ускорения на <video id="trailer-video">
  const vid = document.getElementById('trailer-video');
  if (!vid) return;

  vid.addEventListener('ratechange', () => {
    if (vid.playbackRate > 1.02) {
      vid.playbackRate = 1.0;
    }
  });

  vid.addEventListener('seeking', () => {
    if (!state.trailer.unlocked40 && vid.currentTime > state.trailer.maxTime + 0.65) {
      vid.currentTime = state.trailer.maxTime;
    }
  });

  vid.addEventListener('timeupdate', () => {
    if (!vid.seeking && vid.currentTime > state.trailer.maxTime) {
      // Защита от скачка currentTime через консоль
      if (vid.currentTime - state.trailer.maxTime < 1.8) {
        state.trailer.maxTime = vid.currentTime;
      } else if (!state.trailer.unlocked40) {
        vid.currentTime = state.trailer.maxTime;
      }
    }
    updateTrailerProgressUI(vid.currentTime, vid.duration || 91.6);
    if (state.trailer.maxTime >= TRAILER_UNLOCK_SEC) {
      unlockTrailerReward();
    }
  });

  vid.addEventListener('ended', () => {
    unlockTrailerReward();
    syncTrailerPlayButton();
  });

  vid.addEventListener('play', syncTrailerPlayButton);
  vid.addEventListener('pause', syncTrailerPlayButton);

  // Резервный YouTube fallback ТОЛЬКО если MP4 вдруг не загрузился
  vid.addEventListener('error', () => {
    activateYouTubeFallback();
  });
}

function openTrailerModal({ forRescue = false } = {}) {
  state.trailer.forRescue = Boolean(forRescue);
  audio.stopListening();
  audio.stopMuffledVoiceLoop();

  const modal = document.getElementById('modal-trailer');
  const rescueBox = document.getElementById('trailer-rescue-box');
  const closeBtn = document.getElementById('btn-close-trailer');
  const vid = document.getElementById('trailer-video');

  modal?.removeAttribute('hidden');

  if (forRescue) {
    state.trailer.maxTime = 0;
    state.trailer.unlocked40 = false;
    rescueBox?.removeAttribute('hidden');
    // Во время спасения №2 крестик закрытия возвращает на карточку спасения, не давая обойти капкан
    if (closeBtn) closeBtn.style.visibility = 'visible';
    updateTrailerRescueBanner(0);
  } else {
    rescueBox?.setAttribute('hidden', '');
  }

  if (vid && !state.trailer.usingYtFallback) {
    if (forRescue) vid.currentTime = 0;
    vid.muted = false;
    vid.play().catch(() => {
      // Если мобильный браузер потребовал автостарт без звука — запускаем и даём кнопку ЗВУК
      vid.muted = true;
      vid.play().catch(() => {});
    });
    syncTrailerPlayButton();
    syncTrailerMuteButton();
  }
}

function closeTrailerModal() {
  document.getElementById('modal-trailer')?.setAttribute('hidden', '');
  const vid = document.getElementById('trailer-video');
  if (vid) vid.pause();
  if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
    try { state.ytPlayer.pauseVideo(); } catch { /* ignore */ }
  }
  if (state.trailer.ytTimer) {
    clearInterval(state.trailer.ytTimer);
    state.trailer.ytTimer = null;
  }

  // Если игрок закрыл модалку трейлера во время Шага Б, не досмотрев 40 сек — возвращаем окно Спасения №2
  if (state.trailer.forRescue && state.round.rescueStage === 3 && !state.trailer.unlocked40) {
    document.getElementById('modal-rescue')?.removeAttribute('hidden');
  }
}

function updateTrailerProgressUI(cur, dur) {
  const fill = document.getElementById('trailer-progress-fill');
  const readout = document.getElementById('trailer-time-readout');
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  if (fill) fill.style.width = `${pct.toFixed(1)}%`;
  if (readout) readout.textContent = `${formatTimeMMSS(cur)} / ${formatTimeMMSS(dur)}`;

  if (state.trailer.forRescue && !state.trailer.unlocked40) {
    updateTrailerRescueBanner(state.trailer.maxTime);
  }
}

function updateTrailerRescueBanner(watchedSec) {
  const statusEl = document.getElementById('trailer-rescue-status');
  const claimBtn = document.getElementById('btn-claim-trailer-life');
  const rem = Math.max(0, Math.ceil(TRAILER_UNLOCK_SEC - watchedSec));
  if (statusEl) {
    statusEl.textContent = rem > 0
      ? t('trailerRescueCounter', { sec: rem })
      : t('trailerRescueUnlocked');
  }
  if (claimBtn) {
    claimBtn.disabled = rem > 0;
  }
}

async function unlockTrailerReward() {
  if (state.trailer.unlocked40) return;
  state.trailer.unlocked40 = true;

  const statusEl = document.getElementById('trailer-rescue-status');
  const claimBtn = document.getElementById('btn-claim-trailer-life');
  if (statusEl) statusEl.textContent = t('trailerRescueUnlocked');
  if (claimBtn) claimBtn.disabled = false;

  markTrailerCompleted();
  await refreshQuestUI();
  Haptics.success();

  if (!state.trailer.forRescue) {
    showToast('+1 ЖЕТОН ЦЕХА («КРЫШКА») НАЧИСЛЕН!');
  }
}

function syncTrailerPlayButton() {
  const vid = document.getElementById('trailer-video');
  const btn = document.getElementById('btn-trailer-play');
  if (!vid || !btn) return;
  btn.textContent = vid.paused ? '▶ ПУСК' : '❚❚ ПАУЗА';
}

function syncTrailerMuteButton() {
  const vid = document.getElementById('trailer-video');
  const btn = document.getElementById('btn-trailer-mute');
  if (!vid || !btn) return;
  btn.textContent = vid.muted ? '🔇 ВКЛ ЗВУК' : '🔊 ЗВУК';
}

function activateYouTubeFallback() {
  if (state.trailer.usingYtFallback) return;
  state.trailer.usingYtFallback = true;

  document.getElementById('trailer-video')?.setAttribute('hidden', '');
  document.getElementById('trailer-custom-bar')?.setAttribute('hidden', '');
  const slot = document.getElementById('yt-fallback-slot');
  slot?.removeAttribute('hidden');

  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  const mount = () => {
    if (state.ytPlayer || !window.YT?.Player) return;
    state.ytPlayer = new window.YT.Player('yt-fallback-slot', {
      videoId: ENV.youtubeFallbackId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, playsinline: 1 },
      events: {
        onStateChange: (ev) => {
          if (ev.data === 1) {
            if (!state.trailer.ytTimer) {
              state.trailer.ytTimer = window.setInterval(() => {
                if (document.hidden) return;
                state.trailer.ytWatchedSec += 1;
                updateTrailerRescueBanner(state.trailer.ytWatchedSec);
                if (state.trailer.ytWatchedSec >= TRAILER_UNLOCK_SEC) {
                  unlockTrailerReward();
                }
              }, 1000);
            }
          } else {
            if (state.trailer.ytTimer) {
              clearInterval(state.trailer.ytTimer);
              state.trailer.ytTimer = null;
            }
            if (ev.data === 0) unlockTrailerReward();
          }
        },
      },
    });
  };

  if (window.YT?.Player) mount();
  else window.onYouTubeIframeAPIReady = mount;
}

function formatTimeMMSS(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
    `DESCRIPTION:Идём в кино на триллер «Бочка». Карточка фильма: ${ENV.kinopoiskUrl}`,
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
  document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLang(btn.getAttribute('data-lang-btn'));
      Haptics.light();
    });
  });

  document.getElementById('nav-brand')?.addEventListener('click', () => {
    if (!state.entered) return;
    showScreen('modeA');
  });

  document.getElementById('nav-workshop')?.addEventListener('click', () => {
    if (!state.entered) return;
    if (state.round.running) showScreen('workshop');
    else showScreen('modeA');
  });

  document.getElementById('nav-trailer')?.addEventListener('click', () => openTrailerModal({ forRescue: false }));

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
  document.getElementById('btn-prize-golden')?.addEventListener('click', async () => {
    document.getElementById('modal-prize')?.setAttribute('hidden', '');
    state.entered = true;
    await populateFinaleScreen();
    showScreen('finale');
    document.getElementById('golden-hunt-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    if (audio.enabled && state.round.running && state.round.voiceUrl) {
      audio.startMuffledVoiceLoop();
    }
    refreshSoundButtonLabel();
  });

  document.getElementById('btn-hud-pack')?.addEventListener('click', () => {
    stopAirTimer();
    state.round.running = false;
    showScreen('pack');
  });

  // 5-ходовая модалка Спасения
  document.getElementById('btn-rescue-kp-open')?.addEventListener('click', () => handleRescueKpOpenClick());
  document.getElementById('btn-rescue-kp-claim')?.addEventListener('click', () => claimKinopoiskFourthLife());
  document.getElementById('btn-rescue-watch-trailer')?.addEventListener('click', () => {
    document.getElementById('modal-rescue')?.setAttribute('hidden', '');
    openTrailerModal({ forRescue: true });
  });

  // Кастомный MP4 плеер трейлера
  document.getElementById('btn-trailer-play')?.addEventListener('click', () => {
    const vid = document.getElementById('trailer-video');
    if (!vid) return;
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
    syncTrailerPlayButton();
  });

  document.getElementById('btn-trailer-mute')?.addEventListener('click', () => {
    const vid = document.getElementById('trailer-video');
    if (!vid) return;
    vid.muted = !vid.muted;
    syncTrailerMuteButton();
  });

  document.getElementById('btn-claim-trailer-life')?.addEventListener('click', () => claimTrailerFifthLife());

  document.getElementById('btn-open-kp-trailer')?.addEventListener('click', () => {
    openExternalLink(ENV.kinopoiskTrailerUrl);
  });

  // Экран 4: Конструктор пранка (Фото + Голосовуха)
  document.getElementById('btn-close-pack')?.addEventListener('click', () => {
    if (voiceRecorder?.isRecording) voiceRecorder.stop();
    if (state.incomingPack && !state.round.isDemo) showScreen('finale');
    else showScreen('modeA');
  });

  // Запись голоса (поддерживает и удержание кнопки, и клик старт/стоп)
  let recPressAt = 0;
  const recBtn = document.getElementById('btn-record-voice');
  recBtn?.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    if (voiceRecorder.isRecording) {
      voiceRecorder.stop();
      return;
    }
    recPressAt = performance.now();
    const ok = await voiceRecorder.start();
    if (ok) {
      recBtn.classList.add('is-recording');
      const txt = document.getElementById('btn-record-voice-text');
      if (txt) txt.textContent = t('btnStopVoice');
      document.getElementById('voice-rec-bar')?.removeAttribute('hidden');
      Haptics.medium();
    }
  });

  window.addEventListener('pointerup', () => {
    if (!voiceRecorder?.isRecording || !recPressAt) return;
    const heldMs = performance.now() - recPressAt;
    recPressAt = 0;
    // Если пользователь именно зажимал кнопку дольше 420 мс — завершаем запись при отпускании пальца
    if (heldMs >= 420) {
      voiceRecorder.stop();
    }
  });

  document.getElementById('btn-play-voice-muffled')?.addEventListener('click', () => {
    if (state.pack.voice?.objectUrl) {
      audio.playOneShotMuffledPreview(state.pack.voice.objectUrl);
    }
  });

  document.getElementById('btn-play-voice-clean')?.addEventListener('click', () => {
    if (state.pack.voice?.objectUrl) {
      audio.playCleanSenderVoice(state.pack.voice.objectUrl);
    }
  });

  document.getElementById('btn-clear-voice')?.addEventListener('click', () => {
    audio.stopCleanVoice();
    if (state.pack.voice?.objectUrl) {
      URL.revokeObjectURL(state.pack.voice.objectUrl);
    }
    state.pack.voice = null;
    document.getElementById('voice-ready-row')?.setAttribute('hidden', '');
    Haptics.light();
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
      `🛢 Кто-то заварил тебя в цеху «БОЧКИ»! Надень наушники — 3 попытки и 30 сек воздуха: «${msg}»`
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

  // Экран 5: Финал раунда и Золотая бочка
  document.getElementById('btn-finale-replay-voice')?.addEventListener('click', () => {
    if (state.round.voiceUrl) {
      audio.playCleanSenderVoice(state.round.voiceUrl);
    }
  });

  document.getElementById('btn-copy-ticket-code')?.addEventListener('click', async () => {
    const code = document.getElementById('output-ticket-code')?.value || '';
    if (!code) return;
    await copyToClipboard(code);
    showToast(t('copiedToast'));
    Haptics.success();
  });

  document.getElementById('btn-golden-go-pack')?.addEventListener('click', () => {
    showScreen('pack');
  });

  document.getElementById('input-kp-screenshot')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleKinopoiskScreenshotUpload(file);
      e.target.value = '';
    }
  });

  document.getElementById('btn-enter-night-shift')?.addEventListener('click', () => {
    if (isGoldenHuntUnlocked()) {
      startNightShiftRound();
    }
  });

  document.getElementById('btn-cinema-reply')?.addEventListener('click', async () => {
    await sendCinemaInviteReply(state.incomingPack, state.tg?.user);
    showToast(t('cinemaReplySent'));
    openTrailerModal({ forRescue: false });
  });

  document.getElementById('btn-pack-revenge')?.addEventListener('click', () => {
    showScreen('pack');
  });

  document.getElementById('btn-download-stories')?.addEventListener('click', () => handleDownloadStories());

  document.getElementById('btn-replay-round')?.addEventListener('click', () => {
    if (state.incomingPack) {
      startViralFriendRound(state.incomingPack);
    } else {
      startDemoRound();
    }
  });

  document.getElementById('quest-btn-trailer')?.addEventListener('click', () => openTrailerModal({ forRescue: false }));

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
