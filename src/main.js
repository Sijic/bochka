import { ENV } from './env.js';
import { initI18n, setLang, t, applyDomTranslations, onLangChange } from './i18n.js';
import {
  initTelegram,
  isAdminModeRequested,
  isTestBogRequested,
  isTestBogSessionActive,
  requestTelegramContact,
  openTelegramShare,
  openWhatsAppShare,
  openVkShare,
  openInstagramShareFlow,
  shareNativeOrFallback,
  copyToClipboard,
  openExternalLink,
  Haptics,
} from './telegram.js';
import { audio } from './audio.js';
import { BarrelVoiceRecorder } from './voice.js';
import { WorkshopScene, BARREL_BATCH_CODES } from './scene.js';
import {
  DEMO_PORTRAITS,
  processPortraitToWebP,
  processClearPassPhotoToWebP,
  verifyKinopoiskScreenshot,
  generateStoriesPosterPNG,
  generateOceanEasterEggStoriesPNG,
} from './imaging.js';
import {
  getViewerUid,
  createBarrelPack,
  loadBarrelPack,
  recordFunnelEvent,
  recordBarrelResult,
  sendCinemaInviteReply,
  isPremiereRaceUnlocked,
  fetchPlayerProfile,
  playPremiereStrike,
  claimShareBonusLife,
  burnRegularTicketForX2Lives,
  createGiftTicketPass,
  loadGiftTicketPass,
  submitGiftTicketOrder,
  claimOceanTapperReward,
  markTrailerCompleted,
  markKinopoiskVisited,
  markKpScreenshotVerified,
  syncFriendsOpenedTokens,
  getQuestState,
  patchTestBogProfile,
  buildDuelShareLinks,
  buildTrailerReferralLinks,
  checkBarrelEntryRouting,
  notifyBarrelSearchStarted,
  sendPostRescueReaction,
  sendDuelChallengePush,
  fetchMyWorkshopFriends,
  completeWorkshopLevel,
  claimSocialOrPromoBonus,
  fetchPremiereLeaderboard,
} from './backend.js';
import { WorkshopDuelController, createBarrelWatchChannel } from './duel.js';
import { mountTestBogHUD } from './testbog.js';

const AIR_DURATION_SEC = 30.0;
const KP_MIN_AWAY_SEC = 15.0;
const TRAILER_UNLOCK_SEC = 40.0;

const SCREAMER_META = [
  { key: 'hand', img: './assets/keyed/screamer_hand.webp', i18n: 'screamerHand' },
  { key: 'pastor', img: './assets/keyed/screamer_pastor.webp', i18n: 'screamerPastor' },
  { key: 'father', img: './assets/keyed/screamer_father.webp', i18n: 'screamerFather' },
  { key: 'blogger', img: './assets/keyed/screamer_blogger.webp', i18n: 'screamerBlogger' },
];

const state = {
  tg: null,
  entered: false,
  activeScreen: 'gate',
  incomingParam: '',
  incomingPack: null,
  incomingPassId: '',
  activePassData: null,

  // Профиль главной Суперигры «Гонка за Премьерой (0..100)» и Лиги ТОП-10
  profile: {
    premiereScore: 0,
    premierePoints: 0,
    currentLevel: 1,
    hasPlayedSolo: false,
    lives: 3,
    rawSharesToday: 0,
    easterEggClaimed: false,
    premiereWon: false,
    premiereCode: '',
    hasPendingTicket: false,
  },

  // Состояние текущего раунда в цеху ('demo' | 'viral' | 'premiere')
  round: {
    modeType: 'demo',
    isDemo: true,
    barrelCount: 6,
    workshopLevel: 1,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex: 0,
    attemptsLeft: 3,
    attemptsUsed: 0,
    rescueStage: 0, // 0: базовые 3 удара, 1: ждём Кинопоиск, 2: 4-й удар, 3: ждём Трейлер, 4: 5-й победный удар
    airLeft: AIR_DURATION_SEC,
    running: false,
    pausedForModal: false,
    pausedForOcean: false,
    strikeBusy: false,
    survived: false,
    reactionLocked: false,
    portraitDataUrl: '',
    voiceUrl: '',
    message: '',
    senderLabel: '',
    lastUrgentSec: 9,
  },

  shareHubKind: 'trailer',
  repeatRoutePending: null,
  watchChannel: null,
  watchingBarrelId: '',

  // Детектор секретной комбинации «Достучаться до небес»: бочка №19 -> №97 -> 3 быстрых удара
  easterCombo: {
    stage: 0,
    lastAt: 0,
    knocks: 0,
  },

  screamerCursor: 0,

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
    voice: null,
    lastShareUrl: '',
    lastWebUrl: '',
    shareLifeClaimedForUrl: '',
    customEdited: false,
  },

  // Состояние оформления подарочного билета в Telegram (Путь Б)
  giftPass: {
    processedPhoto: null,
    lastPassUrl: '',
    recipientName: '',
  },

  verifiedContactPhone: '',

  // Состояние 10-секундного таппера по бочке на берегу моря (Секрет 19·97)
  oceanTapper: {
    running: false,
    finished: false,
    taps: 0,
    timeLeft: 10.0,
    timer: null,
    lastTapAt: 0,
  },

  cameraStream: null,
  ytPlayer: null,
  airInterval: null,
  passClockTimer: null,
  oceanTypeTimer: null,
};

let scene = null;
let voiceRecorder = null;
let duelCtrl = null;

function getWorkshopLevelSpec(rawLevel = 1) {
  const level = Math.max(1, Math.round(Number(rawLevel || 1)));
  if (level <= 8) {
    const barrelCount = Math.min(10, level + 2); // Ур.1 = 3 бочки ... Ур.8 = 10 бочек!
    return {
      level,
      barrelCount,
      isBlitz: false,
      airSec: Math.max(22.0, 32.0 - level),
    };
  }
  return {
    level,
    barrelCount: 10,
    isBlitz: true, // Ур. 9+: Чистая игра на время и комбо-очки на 10 бочках!
    airSec: 25.0,
  };
}

function formatBarrelWord(n) {
  if (n >= 5) return 'БОЧЕК';
  if (n >= 2) return 'БОЧКИ';
  return 'БОЧКА';
}

async function bootstrap() {
  if (isAdminModeRequested()) {
    window.location.replace('./admin/');
    return;
  }

  if (isTestBogRequested() && !isTestBogSessionActive()) {
    window.location.replace('./testbog/');
    return;
  }

  state.tg = initTelegram();
  state.incomingParam = state.tg.startParam || '';
  state.incomingPassId = state.tg.passParam || '';

  await initI18n(state.tg.user?.lang || '');
  applyDomTranslations();

  const canvas = document.getElementById('workshop-canvas');
  scene = new WorkshopScene(canvas, {
    onHoverBarrel: handleBarrelHover,
    onStrikeBarrel: handleBarrelStrike,
    onCameraMove: (camPos) => audio.updateListenerCamera(camPos),
    onCeilingDrip: (x, z) => audio.playSpatialCeilingDrip(x, z),
  });

  duelCtrl = new WorkshopDuelController({
    scene,
    audio,
    getTgUser: () => state.tg?.user || null,
    onProfileSync: (patch) => {
      state.profile = { ...state.profile, ...patch };
      updatePremiereBarsUI();
    },
    onToast: (msg) => showToast(msg),
    onOpenInviteShare: () => shareCurrentDuelRoom(),
    onOpenGoldenFork: () => openGoldenTicketForkModal(),
    onExitToHub: () => showScreen('modeA'),
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

  state.profile = await fetchPlayerProfile(state.tg?.user);
  updatePremiereBarsUI();
  await refreshQuestUI();

  // Реферальный визит по прямой ссылке на трейлер (?trailer=1&ref=...)
  if (state.tg.trailerAutoOpen) {
    if (state.tg.trailerRefUid) {
      claimSocialOrPromoBonus(state.tg?.user, 'trailer_ref_visit', 'tg', state.tg.trailerRefUid).catch(() => {});
    }
    openTrailerModal({ forRescue: false });
  }

  // Если открыта ссылка защищённого Именного пропуска (?gift=ID) — сразу показываем экран кассового контроля!
  if (state.incomingPassId) {
    await openIncomingPassScreen(state.incomingPassId);
  }

  // Если активирована сессия «ТЕСТ-БОГА» (/testbog/) — монтируем плавающий пульт песочницы (0 запросов в БД)
  if (isTestBogSessionActive()) {
    mountTestBogHUD({
      getState: () => state,
      toast: (msg) => showToast(msg),
      syncProfile: (nextProf) => {
        state.profile = { ...state.profile, ...nextProf };
        if (state.round.modeType === 'premiere') {
          state.round.attemptsLeft = state.profile.lives;
        }
        updatePremiereBarsUI();
      },
      setAir: (sec) => {
        state.round.airLeft = sec;
        updateAirHUD(sec);
        showToast(`⚡ Кислород установлен: ${sec.toFixed(1)} сек`);
      },
      crackTargetBarrel: async () => {
        if (state.activeScreen !== 'workshop' || !state.round.running) {
          state.entered = true;
          await audio.unlock(true);
          refreshSoundButtonLabel();
          await startDemoRound();
        }
        const idx = state.round.targetIndex;
        const b = scene?.barrels?.[idx];
        if (b) handleBarrelStrike(idx, b.group.position.clone());
      },
      jumpTo: async (target) => {
        document.querySelectorAll('.modal-backdrop').forEach((m) => m.setAttribute('hidden', ''));
        state.round.pausedForModal = false;
        if (duelCtrl?.isActive && target !== 'duel') {
          duelCtrl.leaveRoom(false);
        }

        if (target === 'gate') {
          stopAirTimer();
          state.round.running = false;
          showScreen('gate');
          return;
        }

        state.entered = true;
        await audio.unlock(true);
        refreshSoundButtonLabel();

        if (target === 'demo') {
          await startDemoRound();
        } else if (target === 'level8') {
          state.profile = patchTestBogProfile({ currentLevel: 8 });
          updatePremiereBarsUI();
          await startDemoRound();
        } else if (target === 'blitz') {
          state.profile = patchTestBogProfile({ currentLevel: 9 });
          updatePremiereBarsUI();
          await startDemoRound();
        } else if (target === 'duel') {
          await openDuelTable(`tbog_${Date.now().toString(36).slice(-4)}`, { autoAddTestBots: true });
        } else if (target === 'leaders') {
          if (state.activeScreen === 'gate') showScreen('modeA');
          await openLeaderboardModal();
        } else if (target === 'sharehub') {
          if (state.activeScreen === 'gate') showScreen('modeA');
          openShareHubModal('trailer');
        } else if (target === 'viral') {
          const mockPack = {
            id: 'tbog_viral',
            mode: 'friend',
            message: 'Тестовая бочка друга (проверка 5-ходовки КП + Трейлер)',
            photoUrl: DEMO_PORTRAITS[0],
            voiceUrl: '',
            frameStyle: 'flashlight',
            targetIndex: 2,
            senderUid: 'sandbox_friend',
            senderName: 'Кент (Sandbox)',
          };
          state.incomingPack = mockPack;
          await startViralFriendRound(mockPack);
        } else if (target === 'pack') {
          stopAirTimer();
          state.round.running = false;
          showScreen('pack');
        } else if (target === 'premiere') {
          if ((state.profile.lives || 0) <= 0) {
            state.profile = patchTestBogProfile({ lives: 5 });
            updatePremiereBarsUI();
          }
          await startPremiereRaceRound();
        } else if (target === 'ocean') {
          await triggerOceanEasterEggScene();
        } else if (target === 'fork') {
          state.profile = patchTestBogProfile({ hasPendingTicket: true });
          updatePremiereBarsUI();
          if (state.activeScreen === 'gate') showScreen('modeA');
          openGoldenTicketForkModal();
        } else if (target === 'pass') {
          stopAirTimer();
          state.round.running = false;
          await openIncomingPassScreen(`testbog_demo_${Date.now().toString(36)}`);
        } else if (target === 'nearmiss') {
          state.profile = patchTestBogProfile({ premiereScore: 98.9, lives: 0 });
          updatePremiereBarsUI();
          if (state.activeScreen === 'gate') showScreen('modeA');
          openNearMissModal(98.9);
        } else if (target === 'win100') {
          const vipCode = 'TESTBOG-VIP-17DEC';
          state.profile = patchTestBogProfile({
            premiereScore: 100,
            premiereWon: true,
            premiereCode: vipCode,
          });
          updatePremiereBarsUI();
          state.round.portraitDataUrl = createGoldenTicketPortraitDataUrl(vipCode);
          await finishPremiereRound(true, { premiereCode: vipCode });
        }
      },
    });
  }
}

function updateControlHintText() {
  const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const el = document.getElementById('hud-hint-text');
  if (el) {
    el.setAttribute('data-i18n', coarse ? 'hudHintMobile' : 'hudHintDesktop');
    el.textContent = t(coarse ? 'hudHintMobile' : 'hudHintDesktop');
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
    pass: 'screen-pass',
    ocean: 'screen-ocean',
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

  if (name === 'modeA') {
    updatePremiereBarsUI();
    const shortcut = document.getElementById('btn-mode-a-premiere');
    if (shortcut) {
      if (isPremiereRaceUnlocked(getQuestState(), state.profile)) shortcut.removeAttribute('hidden');
      else shortcut.setAttribute('hidden', '');
    }
  }

  if (name === 'pack') {
    refreshPackFriendsStrip();
  }

  if (name !== 'pass' && state.passClockTimer) {
    clearInterval(state.passClockTimer);
    state.passClockTimer = null;
  }

  if (name !== 'ocean') {
    audio.stopOceanEasterEggAudio();
    if (state.oceanTypeTimer) {
      clearInterval(state.oceanTypeTimer);
      state.oceanTypeTimer = null;
    }
    if (state.oceanTapper.timer) {
      clearInterval(state.oceanTapper.timer);
      state.oceanTapper.timer = null;
      state.oceanTapper.running = false;
    }
  }

  if (name !== 'workshop') {
    document.getElementById('barrel-reticle')?.setAttribute('hidden', '');
    document.getElementById('hud-watch-banner')?.setAttribute('hidden', '');
    closeActiveWatchChannel();
    audio.stopListening();
    audio.stopMuffledVoiceLoop();
    if (!duelCtrl?.isActive) {
      scene?.setInteractive(false);
    }
  }
}

/* ============================================================================
   ВХОДНОЙ ШЛЮЗ -> МАРШРУТИЗАТОР (ПРОПУСК / ДУЭЛЬ / ПОДГЛЯДЫВАНИЕ / БОЧКА / ХАБ)
   ============================================================================ */
async function enterWorkshopGate(withSound) {
  state.entered = true;
  await audio.unlock(withSound);
  refreshSoundButtonLabel();

  if (state.incomingPassId) {
    await openIncomingPassScreen(state.incomingPassId);
    return;
  }

  if (state.tg?.duelRoomParam) {
    await openDuelTable(state.tg.duelRoomParam);
    return;
  }

  if (state.tg?.watchBarrelParam) {
    await startLiveWatchSpectatorMode(state.tg.watchBarrelParam);
    return;
  }

  if (state.tg?.openGiftFork) {
    if (state.profile.hasPendingTicket) {
      showScreen('modeA');
      openGoldenTicketForkModal();
    } else {
      await populateFinaleScreen();
      showScreen('finale');
      showToast('Выбей Золотую бочку в Суперигре или 40+ ударов у моря (19·97), чтобы подарить билет другу!');
    }
    return;
  }

  if (state.incomingParam) {
    if (!state.incomingPack) {
      state.incomingPack = await loadBarrelPack(state.incomingParam);
    }
    // ШАГ 8.1: Проверяем по соцграфу Supabase — играли ли оба в цеху раньше?
    const routing = await checkBarrelEntryRouting(state.incomingParam, state.tg?.user);
    if (routing.shouldRouteToDuel && !routing.isSelf) {
      state.repeatRoutePending = { pack: state.incomingPack, routing };
      showScreen('modeA');
      const descEl = document.getElementById('repeat-duel-desc');
      if (descEl && routing.senderName) {
        descEl.textContent = `Ты и ${routing.senderName} уже проходили цех! За повторные одиночные ссылки жизни не начисляются — залетайте за синхронный стол «На счёт три!» на живой кон и зовите 3-го друга ради бонуса цеха!`;
      }
      document.getElementById('modal-repeat-duel')?.removeAttribute('hidden');
      return;
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

  const spec = getWorkshopLevelSpec(state.profile.currentLevel || 1);
  const graded = await processPortraitToWebP(DEMO_PORTRAITS[pickIdx], 'flashlight');

  // Избегаем бочки '19' (idx 1) как цели, чтобы пасхалка 19 -> 97 не завершала уровень досрочно
  const candidates = [];
  for (let i = 0; i < spec.barrelCount; i++) {
    if (BARREL_BATCH_CODES[i] !== '19') candidates.push(i);
  }
  const pool = candidates.length ? candidates : [0];
  const targetIndex = pool[Math.floor(Math.random() * pool.length)];

  await audio.setSenderVoiceUrl('');

  state.round = {
    modeType: 'demo',
    isDemo: true,
    barrelCount: spec.barrelCount,
    workshopLevel: spec.level,
    isBlitz: spec.isBlitz,
    blitzTargetsCleared: 0,
    targetIndex,
    attemptsLeft: spec.isBlitz ? 5 : 3,
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: spec.airSec,
    running: true,
    pausedForModal: false,
    pausedForOcean: false,
    strikeBusy: false,
    survived: false,
    reactionLocked: false,
    portraitDataUrl: graded.dataUrl,
    voiceUrl: '',
    message: charMeta.quote,
    senderLabel: charMeta.name,
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = spec.isBlitz
    ? `УРОВЕНЬ ${spec.level} // ⚡ БЛИЦ 10 БОЧЕК НА ВРЕМЯ`
    : `УРОВЕНЬ ${spec.level} // ${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)} В ЦЕХУ`;
  document.getElementById('hud-urgent-title').textContent = spec.isBlitz
    ? 'БЛИЦ НА ВРЕМЯ И ОЧКИ: НАХОДИ ЖИВЫЕ БОЧКИ ПОДРЯД (+3.5 СЕК И КОМБО ⭐)!'
    : `НАЙДИ ЖИВУЮ БОЧКУ ИЗ ${spec.barrelCount} ПО СТУКУ ЗА 3 ПОПЫТКИ (+⭐ В ТОП-10)`;
  document.getElementById('btn-hud-pack')?.removeAttribute('hidden');
  document.getElementById('hud-premiere-strip')?.setAttribute('hidden', '');
  configureBottomAttemptsMode('squares');

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
    barrelCount: 6,
    workshopLevel: 1,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex: initialTarget,
    attemptsLeft: 3,
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: AIR_DURATION_SEC,
    running: true,
    pausedForModal: false,
    pausedForOcean: false,
    strikeBusy: false,
    survived: false,
    reactionLocked: false,
    portraitDataUrl,
    voiceUrl,
    message: pack?.message || t('presetsSelf')[0],
    senderLabel: pack?.senderName ? `${t('revealFromFriend')} · ${pack.senderName}` : t('revealFromFriend'),
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = t('modeBTag');
  document.getElementById('hud-urgent-title').textContent = t('modeBTitle');
  document.getElementById('btn-hud-pack')?.setAttribute('hidden', '');
  document.getElementById('hud-premiere-strip')?.setAttribute('hidden', '');
  configureBottomAttemptsMode('squares');

  launchWorkshopGameplay(false);
  if (voiceUrl) {
    audio.startMuffledVoiceLoop();
  }

  // ШАГ 8.2 (ТРИГГЕР А): Отправляем живой пуш автору бочки + включаем WebSocket-трансляцию ударов!
  closeActiveWatchChannel();
  if (pack?.id) {
    state.watchChannel = createBarrelWatchChannel(pack.id, {
      onRemoteEvent: (ev) => {
        if (ev.type === 'rattle' && state.round.running) {
          audio.playChainRattle(1.0);
          scene.triggerScreamerShake(0.38);
          Haptics.heavy();
          showToast(`⛓ ${ev.senderName || 'Автор бочки'} подглядывает и гремит цепями!`);
        }
      },
    });
    notifyBarrelSearchStarted(pack, state.tg?.user).catch(() => {});
  }
}

/* ============================================================================
   ГЛАВНАЯ СУПЕРИГРА v3.0: «ГОНКА ЗА ПРЕМЬЕРОЙ (0..100)» + ЗОЛОТЫЕ БОЧКИ
   ============================================================================ */
async function startPremiereRaceRound() {
  const q = getQuestState();
  if (!isPremiereRaceUnlocked(q, state.profile)) {
    showToast(t('premiereLockedHint'));
    const hasPacked = (q.packedCount || 0) >= 1 || (state.profile.packedCount || 0) >= 1;
    if (!hasPacked) {
      showScreen('pack');
    } else {
      await populateFinaleScreen();
      showScreen('finale');
      document.getElementById('golden-hunt-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  state.profile = await fetchPlayerProfile(state.tg?.user);
  updatePremiereBarsUI();

  if (state.profile.hasPendingTicket) {
    openGoldenTicketForkModal();
    return;
  }

  if (state.profile.lives <= 0) {
    if (state.profile.premiereScore >= 90) {
      openNearMissModal(state.profile.premiereScore);
    } else {
      showToast(t('nightShiftCooldown'));
      showScreen('pack');
    }
    return;
  }

  await audio.setSenderVoiceUrl('');
  const goldenEmblem = createGoldenTicketPortraitDataUrl('ДОПУСК НА ПРЕМЬЕРУ');

  state.round = {
    modeType: 'premiere',
    isDemo: false,
    barrelCount: 6,
    workshopLevel: state.profile.currentLevel || 1,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex: Math.floor(Math.random() * 6),
    attemptsLeft: state.profile.lives,
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: AIR_DURATION_SEC,
    running: true,
    pausedForModal: false,
    pausedForOcean: false,
    strikeBusy: false,
    survived: false,
    reactionLocked: false,
    portraitDataUrl: goldenEmblem,
    voiceUrl: '',
    message: t('nightShiftEmptyMsg'),
    senderLabel: t('premiereRaceTag'),
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = t('premiereRaceTag');
  document.getElementById('hud-urgent-title').textContent = t('premiereHudTitle');
  document.getElementById('btn-hud-pack')?.removeAttribute('hidden');
  document.getElementById('hud-premiere-strip')?.removeAttribute('hidden');
  configureBottomAttemptsMode('lives');
  updatePremiereBarsUI();

  launchWorkshopGameplay(true);
}

function configureBottomAttemptsMode(mode) {
  const sqWrap = document.getElementById('attempts-squares');
  const livesWrap = document.getElementById('hud-premiere-lives-big');
  const lbl = document.getElementById('hud-attempts-label');
  if (mode === 'lives') {
    sqWrap?.setAttribute('hidden', '');
    livesWrap?.removeAttribute('hidden');
    if (lbl) lbl.textContent = t('premiereLivesLabel');
  } else {
    sqWrap?.removeAttribute('hidden');
    livesWrap?.setAttribute('hidden', '');
    if (lbl) lbl.textContent = t('hudAttempts');
  }
}

function updatePremiereBarsUI() {
  const scoreStr = Number(state.profile.premiereScore || 0).toFixed(1);
  const pct = Math.max(0, Math.min(100, Number(state.profile.premiereScore || 0)));
  const lives = Math.max(0, Number(state.profile.lives ?? 0));
  const points = Math.max(0, Math.round(Number(state.profile.premierePoints || 0)));
  const spec = getWorkshopLevelSpec(state.profile.currentLevel || 1);

  for (const id of ['hud-premiere-score', 'finale-premiere-score', 'modal-premiere-score']) {
    const el = document.getElementById(id);
    if (el) el.textContent = scoreStr;
  }
  for (const id of ['hud-premiere-fill', 'finale-premiere-fill', 'modal-premiere-fill']) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${pct}%`;
  }
  for (const id of ['hud-premiere-lives', 'finale-premiere-lives', 'modal-premiere-lives', 'hud-lives-big-num']) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(lives);
  }
  for (const id of ['top-points-count', 'hud-premiere-points', 'finale-premiere-points', 'modal-premiere-points']) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(points);
  }

  const hudChip = document.getElementById('hud-level-points-text');
  if (hudChip) {
    hudChip.textContent = spec.isBlitz
      ? `БЛИЦ УР.${spec.level} · ⭐ ${points}`
      : `УР.${spec.level} (${spec.barrelCount}Б) · ⭐ ${points}`;
  }

  const startLbl = document.getElementById('btn-start-level-label');
  if (startLbl) {
    startLbl.textContent = spec.isBlitz
      ? `⚡ УРОВЕНЬ ${spec.level} · БЛИЦ 10 БОЧЕК НА ВРЕМЯ (+⭐)`
      : `▶ УРОВЕНЬ ${spec.level} · ${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)} (+⭐ В ТОП-10)`;
  }

  const finLeaderBtn = document.getElementById('btn-finale-leaderboard');
  if (finLeaderBtn) {
    finLeaderBtn.textContent = `🏆 ОТКРЫТЬ РЕЙТИНГ ТОП-10 НА ПРЕМЬЕРУ (ТВОИ ОЧКИ: ⭐ ${points}) →`;
  }

  const pendingBanner = document.getElementById('btn-reopen-golden-fork');
  if (pendingBanner) {
    if (state.profile.hasPendingTicket) pendingBanner.removeAttribute('hidden');
    else pendingBanner.setAttribute('hidden', '');
  }
}

function spawnFloatingScorePopup(delta, barrelIndex = -1, customLabel = '') {
  const layer = document.getElementById('floating-score-layer');
  if (!layer) return;

  let x = window.innerWidth * 0.5;
  let y = window.innerHeight * 0.44;
  if (barrelIndex >= 0 && scene?.barrels?.[barrelIndex]) {
    const wp = scene.barrels[barrelIndex].group.position.clone();
    wp.y += 1.25;
    wp.project(scene.camera);
    x = (wp.x * 0.5 + 0.5) * window.innerWidth;
    y = (-wp.y * 0.5 + 0.5) * window.innerHeight;
  }

  const pop = document.createElement('div');
  pop.className = 'floating-score-pop';
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  pop.textContent = customLabel || `+${Number(delta).toFixed(delta < 1 ? 1 : delta % 1 === 0 ? 0 : 1)}`;
  layer.appendChild(pop);
  window.setTimeout(() => pop.remove(), 980);
}

function launchWorkshopGameplay(golden = false) {
  stopAirTimer();
  state.easterCombo = { stage: 0, lastAt: 0, knocks: 0 };
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');
  renderAttemptSquares(state.round.attemptsLeft, state.round.isBlitz ? 5 : 3);
  updateAirHUD(state.round.airLeft);

  scene.resetRound({
    barrelCount: state.round.barrelCount || 6,
    targetIndex: state.round.targetIndex,
    portraitUrl: state.round.portraitDataUrl,
    golden,
  });
  audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex);
  scene.setInteractive(true);

  showScreen('workshop');
  startAirCountdownLoop();
}

function reloadPremiereBarrelsWave() {
  if (!state.round.running || state.round.modeType !== 'premiere') return;
  state.round.airLeft = AIR_DURATION_SEC;
  state.round.lastUrgentSec = 9;
  state.round.targetIndex = Math.floor(Math.random() * 6);
  scene.resetRound({
    barrelCount: 6,
    targetIndex: state.round.targetIndex,
    portraitUrl: state.round.portraitDataUrl,
    golden: true,
  });
  audio.playChainRattle(0.7);
  updateAirHUD(state.round.airLeft);
}

function startAirCountdownLoop() {
  stopAirTimer();
  let lastTs = performance.now();
  state.airInterval = window.setInterval(() => {
    if (!state.round.running || state.round.pausedForModal) {
      lastTs = performance.now();
      return;
    }
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
      const closed = getUnstruckBarrelIndices();
      const winIdx = closed[0] ?? r.targetIndex;
      r.targetIndex = winIdx;
      r.attemptsUsed = 5;
      finishRound(true);
      return;
    }
  }

  if (r.modeType === 'premiere') {
    finishPremiereRound(false, null);
    return;
  }

  // В режиме Блиц (Уровень 9+), если за время нашли хотя бы 1 живую бочку — уровень засчитывается как успешный с комбо-очками!
  if (r.isBlitz && r.blitzTargetsCleared > 0) {
    finishRound(true);
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
  const activeMax = scene?.activeBarrelCount || state.round.barrelCount || 6;
  return scene.barrels.filter((b) => b.index < activeMax && !b.struck).map((b) => b.index);
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

function renderAttemptSquares(attemptsLeft, totalCount = null) {
  const wrap = document.getElementById('attempts-squares');
  if (!wrap) return;
  const targetTotal = totalCount || (state.round.isBlitz ? 5 : 3);
  while (wrap.children.length < targetTotal) {
    const sp = document.createElement('span');
    sp.className = 'attempt-sq';
    wrap.appendChild(sp);
  }
  while (wrap.children.length > targetTotal) {
    wrap.lastElementChild?.remove();
  }
  const squares = wrap.querySelectorAll('.attempt-sq');
  squares.forEach((sq, idx) => {
    const alive = idx < attemptsLeft;
    sq.classList.toggle('is-live', alive);
    sq.classList.toggle('is-spent', !alive);
  });
}

/* ============================================================================
   СЕКРЕТНАЯ ПАСХАЛКА «ДОСТУЧАТЬСЯ ДО НЕБЕС»: №19 -> №97 -> 3 УДАРА (НА 3..10 БОЧКАХ!)
   ============================================================================ */
function checkSecret1997Combo(index, worldPoint, alreadyStruck) {
  if (duelCtrl?.isActive || state.watchingBarrelId) return false;
  const now = performance.now();
  const c = state.easterCombo;
  const batchCode = BARREL_BATCH_CODES[index] || '';

  // Фаза 2: после 19 -> 97 ждём 3 быстрых удара по любой бочке
  if (c.stage === 2 && now - c.lastAt <= 3200) {
    c.knocks += 1;
    c.lastAt = now;
    scene.triggerStrikeFX(index, worldPoint);
    audio.playStrike(index);
    Haptics.light();

    if (c.knocks >= 3) {
      state.easterCombo = { stage: 0, lastAt: 0, knocks: 0 };
      triggerOceanEasterEggScene();
    }
    return true;
  }

  // Фаза 1 -> 2: удар по бочке №97 сразу после бочки №19
  if (c.stage === 1 && now - c.lastAt <= 5500 && batchCode === '97') {
    state.easterCombo = { stage: 2, lastAt: now, knocks: 0 };
    scene.triggerStrikeFX(index, worldPoint);
    audio.playStrike(index);
    Haptics.medium();
    return true;
  }

  // Старт комбинации: клик по бочке №19
  if (batchCode === '19') {
    state.easterCombo = { stage: 1, lastAt: now, knocks: 0 };
    const lowLives =
      state.round.modeType === 'premiere'
        ? state.profile.lives <= 1
        : state.round.attemptsLeft <= 1;

    if (alreadyStruck || lowLives) {
      scene.triggerStrikeFX(index, worldPoint);
      audio.playStrike(index);
      return true;
    }
    return false;
  }

  state.easterCombo = { stage: 0, lastAt: 0, knocks: 0 };
  return false;
}

async function triggerOceanEasterEggScene() {
  stopAirTimer();
  state.round.pausedForOcean = state.round.running;
  state.round.running = false;
  audio.stopListening();
  audio.stopMuffledVoiceLoop();
  scene.setInteractive(false);
  Haptics.success();

  recordFunnelEvent('ocean_opens', state.tg?.user).catch(() => {});
  resetOceanTapperUI();

  const mist = document.getElementById('mist-dissolve-overlay');
  if (mist) {
    mist.removeAttribute('hidden');
    void mist.offsetWidth;
    mist.classList.add('is-active');
  }

  window.setTimeout(() => {
    showScreen('ocean');
    audio.startOceanEasterEggAudio();
    startOceanTypewriter(t('oceanQuote'));

    if (mist) {
      mist.classList.remove('is-active');
      window.setTimeout(() => mist.setAttribute('hidden', ''), 950);
    }
  }, 860);
}

function resetOceanTapperUI() {
  if (state.oceanTapper.timer) {
    clearInterval(state.oceanTapper.timer);
  }
  state.oceanTapper = {
    running: false,
    finished: false,
    taps: 0,
    timeLeft: 10.0,
    timer: null,
    lastTapAt: 0,
  };

  const barrelImg = document.getElementById('ocean-barrel-img');
  const timerEl = document.getElementById('ocean-tap-timer');
  const countEl = document.getElementById('ocean-tap-count');
  const fillEl = document.getElementById('ocean-tap-fill');
  const promptEl = document.getElementById('ocean-tap-prompt');
  const startBtn = document.getElementById('btn-ocean-start-tap');
  const giftBtn = document.getElementById('btn-ocean-claim-gift');
  const pill = document.getElementById('ocean-bonus-pill');

  if (barrelImg) barrelImg.src = './assets/keyed/ocean_barrel_closed.webp';
  if (timerEl) timerEl.textContent = '10.0';
  if (countEl) countEl.textContent = '0';
  if (fillEl) fillEl.style.width = '0%';
  if (promptEl) {
    promptEl.removeAttribute('hidden');
    promptEl.textContent = '👊 СТУЧИ НА ВРЕМЯ!';
  }
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '👊 СТУЧАТЬ ПО БОЧКЕ (СТАРТ 10 СЕК)';
  }
  if (giftBtn) {
    if (state.profile.hasPendingTicket) giftBtn.removeAttribute('hidden');
    else giftBtn.setAttribute('hidden', '');
  }
  if (pill) {
    pill.textContent = state.profile.easterEggClaimed ? t('oceanBonusAlready') : t('oceanBonusBadge');
  }
}

function startOceanTapperCountdown() {
  if (state.oceanTapper.running) return;
  if (state.oceanTapper.timer) clearInterval(state.oceanTapper.timer);

  state.oceanTapper.running = true;
  state.oceanTapper.finished = false;
  state.oceanTapper.taps = 0;
  state.oceanTapper.timeLeft = 10.0;
  state.oceanTapper.lastTapAt = 0;

  const barrelImg = document.getElementById('ocean-barrel-img');
  const timerEl = document.getElementById('ocean-tap-timer');
  const countEl = document.getElementById('ocean-tap-count');
  const fillEl = document.getElementById('ocean-tap-fill');
  const promptEl = document.getElementById('ocean-tap-prompt');
  const startBtn = document.getElementById('btn-ocean-start-tap');

  if (barrelImg) barrelImg.src = './assets/keyed/ocean_barrel_closed.webp';
  if (timerEl) timerEl.textContent = '10.0';
  if (countEl) countEl.textContent = '0';
  if (fillEl) fillEl.style.width = '0%';
  if (promptEl) promptEl.textContent = '👊 ЖМИ БЫСТРЕЕ! 40+ = БИЛЕТ!';
  if (startBtn) startBtn.textContent = '👊 СТУЧИ! УДАРИТЬ ЕЩЁ РАЗ!';

  let lastTs = performance.now();
  state.oceanTapper.timer = window.setInterval(() => {
    const now = performance.now();
    const dt = (now - lastTs) / 1000;
    lastTs = now;
    state.oceanTapper.timeLeft = Math.max(0, state.oceanTapper.timeLeft - dt);
    if (timerEl) timerEl.textContent = state.oceanTapper.timeLeft.toFixed(1);

    if (state.oceanTapper.timeLeft <= 0) {
      finishOceanTapperGame();
    }
  }, 80);
}

function handleOceanBarrelTap() {
  const now = performance.now();
  if (now - state.oceanTapper.lastTapAt < 25) return;
  state.oceanTapper.lastTapAt = now;

  if (!state.oceanTapper.running) {
    if (state.oceanTapper.finished) return;
    startOceanTapperCountdown();
  }

  state.oceanTapper.taps += 1;
  const taps = state.oceanTapper.taps;

  audio.playStrike((taps % 3) + 1);
  if (taps === 20 || taps === 40) Haptics.heavy();
  else Haptics.light();

  const targetBtn = document.getElementById('btn-ocean-tap-barrel');
  if (targetBtn) {
    targetBtn.classList.remove('is-knock-hit');
    void targetBtn.offsetWidth;
    targetBtn.classList.add('is-knock-hit');
  }

  const countEl = document.getElementById('ocean-tap-count');
  const fillEl = document.getElementById('ocean-tap-fill');
  const barrelImg = document.getElementById('ocean-barrel-img');
  const promptEl = document.getElementById('ocean-tap-prompt');

  if (countEl) countEl.textContent = String(taps);
  if (fillEl) fillEl.style.width = `${Math.min(100, (taps / 40) * 100)}%`;

  if (taps === 20 && barrelImg) {
    barrelImg.src = './assets/keyed/ocean_barrel_arm.webp';
    audio.playLidBlowOff(true);
  }
  if (promptEl) {
    if (taps >= 40) promptEl.textContent = '🎟 40+ УДАРОВ! БИЛЕТ ВЫБИТ!';
    else if (taps >= 20) promptEl.textContent = '🖐 РУКА ПОКАЗАЛАСЬ! ЖМИ ДО 40!';
  }
}

async function finishOceanTapperGame() {
  if (state.oceanTapper.timer) {
    clearInterval(state.oceanTapper.timer);
    state.oceanTapper.timer = null;
  }
  if (!state.oceanTapper.running && state.oceanTapper.finished) return;
  state.oceanTapper.running = false;
  state.oceanTapper.finished = true;

  const taps = state.oceanTapper.taps;
  const startBtn = document.getElementById('btn-ocean-start-tap');
  const pill = document.getElementById('ocean-bonus-pill');
  const giftBtn = document.getElementById('btn-ocean-claim-gift');
  const promptEl = document.getElementById('ocean-tap-prompt');

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'СВЕРКА УДАРОВ С СЕРВЕРОМ...';
  }

  const reward = await claimOceanTapperReward(state.tg?.user, Math.max(1, taps));
  state.profile.easterEggClaimed = true;
  if (typeof reward.lives === 'number') state.profile.lives = reward.lives;
  if (reward.hasPendingTicket || reward.giftAwarded) state.profile.hasPendingTicket = true;
  updatePremiereBarsUI();

  if (pill) {
    if (reward.giftAwarded) {
      pill.textContent = `🎉 РЕКОРД ${taps} УДАРОВ! +${reward.livesAwarded} ❤️ И ВЫБИТ ПОДАРОЧНЫЙ БИЛЕТ ДРУГУ!`;
      Haptics.success();
    } else if (reward.livesAwarded > 0) {
      pill.textContent = `🌊 НАСТУЧАЛ ${taps} УДАРОВ: +${reward.livesAwarded} ❤️ ЖИЗНЕЙ НАЧИСЛЕНО! (40+ = билет другу)`;
      Haptics.success();
    } else {
      pill.textContent = `🌊 РЕЗУЛЬТАТ: ${taps} УДАРОВ (выбей 40+ ударов за 10 сек, чтобы забрать билет для друга!)`;
    }
  }

  if (promptEl) {
    promptEl.textContent = taps >= 40 ? '🎟 БИЛЕТ ДРУГУ РАЗБЛОКИРОВАН!' : `ИТОГ: ${taps} УДАРОВ`;
  }

  if (giftBtn && (reward.giftAwarded || state.profile.hasPendingTicket)) {
    giftBtn.removeAttribute('hidden');
  }

  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '↻ СТУЧАТЬ ЕЩЁ РАЗ НА РЕКОРД (10 СЕК)';
    state.oceanTapper.finished = false;
  }
}

function startOceanTypewriter(fullText) {
  const out = document.getElementById('ocean-typewriter');
  if (!out) return;
  if (state.oceanTypeTimer) {
    clearInterval(state.oceanTypeTimer);
    state.oceanTypeTimer = null;
  }
  out.textContent = '';
  let idx = 0;
  state.oceanTypeTimer = window.setInterval(() => {
    idx += 1;
    out.textContent = fullText.slice(0, idx);
    if (idx >= fullText.length) {
      clearInterval(state.oceanTypeTimer);
      state.oceanTypeTimer = null;
    }
  }, 58);
}

async function handleReturnFromOcean(openGiftModalAfter = false) {
  if (state.oceanTapper.timer) {
    clearInterval(state.oceanTapper.timer);
    state.oceanTapper.timer = null;
  }
  if (state.oceanTapper.running || (!state.profile.easterEggClaimed && state.oceanTapper.taps === 0)) {
    state.oceanTapper.running = false;
    const reward = await claimOceanTapperReward(state.tg?.user, Math.max(1, state.oceanTapper.taps));
    state.profile.easterEggClaimed = true;
    if (typeof reward.lives === 'number') state.profile.lives = reward.lives;
    if (reward.hasPendingTicket || reward.giftAwarded) state.profile.hasPendingTicket = true;
    updatePremiereBarsUI();
  }

  audio.stopOceanEasterEggAudio();

  if (openGiftModalAfter && state.profile.hasPendingTicket) {
    await populateFinaleScreen();
    showScreen('finale');
    openGoldenTicketForkModal();
    return;
  }

  if (state.round.modeType === 'premiere') {
    startPremiereRaceRound();
    return;
  }
  if (state.round.pausedForOcean) {
    state.round.pausedForOcean = false;
    state.round.running = true;
    state.round.airLeft = Math.max(15.0, state.round.airLeft);
    state.round.attemptsLeft = Math.max(2, state.round.attemptsLeft);
    renderAttemptSquares(state.round.attemptsLeft);
    updateAirHUD(state.round.airLeft);
    showScreen('workshop');
    scene.setInteractive(true);
    if (state.round.voiceUrl) audio.startMuffledVoiceLoop();
    startAirCountdownLoop();
    return;
  }
  showScreen('modeA');
}

async function handleDownloadOceanPostcard() {
  const btn = document.getElementById('btn-ocean-story');
  if (btn) btn.disabled = true;
  Haptics.medium();
  try {
    const blob = await generateOceanEasterEggStoriesPNG();
    if (!blob) return;
    await shareOrDownloadPngBlob(blob, `bochka-sea-secret-${Date.now()}.png`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================================
   ПРОСЛУШКА МЕТАЛЛА И ДРАМАТУРГИЯ УДАРОВ / 4 ФИЛЬМОВЫХ СКРИМЕРА
   ============================================================================ */
function handleBarrelHover(index, sx, sy, alreadyStruck) {
  const reticle = document.getElementById('barrel-reticle');
  const retId = document.getElementById('reticle-id');

  if (duelCtrl?.isActive || state.watchingBarrelId || !state.round.running || state.round.pausedForModal || index < 0) {
    reticle?.setAttribute('hidden', '');
    audio.stopListening();
    return;
  }

  if (reticle && retId) {
    reticle.removeAttribute('hidden');
    reticle.style.left = `${Math.max(78, Math.min(window.innerWidth - 78, sx))}px`;
    reticle.style.top = `${Math.max(96, Math.min(window.innerHeight - 90, sy))}px`;
    const batchNum = BARREL_BATCH_CODES[index] || `0${index + 1}`;
    const labelBase = `${t('reticleBatch')}${batchNum}`;
    retId.textContent = alreadyStruck
      ? `${labelBase} // ${t('reticleEmpty')}`
      : `${labelBase} // ${t('reticleListening')}`;

    const showPulse =
      !alreadyStruck &&
      state.round.modeType !== 'premiere' &&
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
  // Если открыт синхронный стол «На счёт три!» — все клики обрабатывает мультиплеер-контроллер
  if (duelCtrl?.isActive) {
    duelCtrl.handleBarrelClick(index, worldPoint);
    return;
  }
  if (state.watchingBarrelId) return;

  const r = state.round;
  if (!r.running || r.pausedForModal || r.strikeBusy) return;
  const barrelObj = scene.barrels[index];
  if (!barrelObj) return;

  audio.stopListening();
  document.getElementById('barrel-reticle')?.setAttribute('hidden', '');

  // Проверяем секретный код «19 -> 97 -> 3 быстрых удара»
  if (checkSecret1997Combo(index, worldPoint, barrelObj.struck)) {
    return;
  }

  if (barrelObj.struck) return;

  // -------------------------------------------------------------------------
  // РЕЖИМ 1: ГЛАВНАЯ СУПЕРИГРА «ГОНКА ЗА ПРЕМЬЕРОЙ (0..100)» (Supabase RPC)
  // -------------------------------------------------------------------------
  if (r.modeType === 'premiere') {
    r.strikeBusy = true;
    scene.triggerStrikeFX(index, worldPoint);
    audio.playStrike(index);
    r.attemptsUsed += 1;

    const res = await playPremiereStrike(state.tg?.user);
    r.strikeBusy = false;
    if (!r.running) return;

    if (!res.ok) {
      if (state.profile.premiereScore >= 90) openNearMissModal(state.profile.premiereScore);
      else finishPremiereRound(false, res);
      return;
    }

    state.profile.premiereScore = res.premiereScore;
    if (typeof res.premierePoints === 'number') state.profile.premierePoints = res.premierePoints;
    state.profile.lives = res.lives;
    state.profile.hasPendingTicket = Boolean(res.hasPendingTicket);
    updatePremiereBarsUI();

    // Исход А: Достигнуты заветные 100.0 баллов и взят Пригласительный на Премьеру!
    if (res.outcome === 'premiere_win') {
      state.profile.premiereWon = true;
      state.profile.premiereCode = res.premiereCode || '';
      if (res.delta > 0) spawnFloatingScorePopup(res.delta, index);
      r.targetIndex = index;
      r.portraitDataUrl = createGoldenTicketPortraitDataUrl(res.premiereCode || 'ПРЕМЬЕРА 17.12');
      scene.setTargetPortrait(index, r.portraitDataUrl);
      finishPremiereRound(true, res);
      return;
    }

    // Исход Б: Выпала «Золотая бочка с чужим билетом» -> жёсткая вилка (Топка ×2 или Подарок с фейс-контролем)!
    if (res.outcome === 'golden_ticket') {
      scene.triggerEmptyBarrelOpen(index);
      audio.playLidBlowOff(true);
      r.pausedForModal = true;
      window.setTimeout(() => {
        openGoldenTicketForkModal();
      }, 420);
      return;
    }

    // Исход В: Удачная бочка -> быстрый дофаминовый прыжок (или десятые доли у финиша + ⭐ очки ТОП-10)
    if (res.outcome === 'score_hit') {
      scene.triggerEmptyBarrelOpen(index);
      const ptsLabel = res.pointsGain ? `+${res.delta} · +${res.pointsGain}⭐` : '';
      spawnFloatingScorePopup(res.delta, index, ptsLabel);
      Haptics.success();
    } else {
      // Исход Г: Пустая бочка -> 0.4 сек фильмовый скример (Рука / Пастор / Отец / Блогер)
      scene.triggerEmptyBarrelOpen(index);
      triggerMiniScreamer();
    }

    if (res.lives <= 0) {
      r.pausedForModal = true;
      window.setTimeout(() => {
        if (res.nearMiss || res.premiereScore >= 90) {
          openNearMissModal(res.premiereScore);
        } else {
          finishPremiereRound(false, res);
        }
      }, 480);
      return;
    }

    if (getUnstruckBarrelIndices().length === 0) {
      window.setTimeout(() => reloadPremiereBarrelsWave(), 520);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // РЕЖИМ 2: 5-ХОДОВАЯ РЕЖИССИРОВАННАЯ ВОРОНКА ДРУГА (?b=jakaqgx)
  // -------------------------------------------------------------------------
  if (r.modeType === 'viral') {
    r.attemptsUsed += 1;

    if (r.rescueStage >= 4 || r.attemptsUsed >= 5) {
      r.targetIndex = index;
      scene.assignTargetBarrelNow(index);
      scene.triggerStrikeFX(index, worldPoint);
      audio.playStrike(index);
      state.watchChannel?.send('strike', { barrelIndex: index, rescued: true });
      finishRound(true);
      return;
    }

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
    renderAttemptSquares(r.attemptsLeft, 3);
    state.watchChannel?.send('strike', { barrelIndex: index, attemptsLeft: r.attemptsLeft });

    if (r.rescueStage === 0) {
      if (r.attemptsLeft > 0) {
        triggerMiniScreamer(r.attemptsUsed - 1);
      } else {
        triggerMiniScreamer(2);
        window.setTimeout(() => openRescueStep1(), 430);
      }
      return;
    }

    if (r.rescueStage === 2) {
      triggerMiniScreamer(3);
      window.setTimeout(() => openRescueStep2(), 430);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // РЕЖИМ 3: ПРОГРЕССИЯ УРОВНЕЙ ЦЕХА (3..10 БОЧЕК + УР. 9+ БЛИЦ НА ВРЕМЯ И ОЧКИ)
  // -------------------------------------------------------------------------
  scene.triggerStrikeFX(index, worldPoint);
  audio.playStrike(index);
  r.attemptsUsed += 1;

  if (index === r.targetIndex) {
    if (r.isBlitz) {
      r.blitzTargetsCleared += 1;
      r.airLeft = Math.min(30.0, r.airLeft + 3.5);
      updateAirHUD(r.airLeft);
      audio.playLidBlowOff(true);
      spawnFloatingScorePopup(0, index, `КОМБО ×${r.blitzTargetsCleared} · +3.5с!`);
      Haptics.success();

      // Мгновенно перезаряжаем 10 бочек для следующей волны Блица!
      const nextPool = [];
      for (let i = 0; i < 10; i++) {
        if (BARREL_BATCH_CODES[i] !== '19') nextPool.push(i);
      }
      r.targetIndex = nextPool[Math.floor(Math.random() * nextPool.length)];
      scene.resetRound({
        barrelCount: 10,
        targetIndex: r.targetIndex,
        portraitUrl: r.portraitDataUrl,
        golden: false,
      });
      audio.setBarrelLayout(scene.getBarrelWorldPositions(), r.targetIndex);
      return;
    }

    finishRound(true);
    return;
  }

  scene.triggerEmptyBarrelOpen(index);
  r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
  renderAttemptSquares(r.attemptsLeft, r.isBlitz ? 5 : 3);

  if (r.attemptsLeft > 0) {
    triggerMiniScreamer();
  } else {
    finishRound(r.isBlitz && r.blitzTargetsCleared > 0);
  }
}

function triggerMiniScreamer(explicitVariant = null) {
  const v =
    typeof explicitVariant === 'number'
      ? Math.abs(explicitVariant) % 4
      : (state.screamerCursor++) % 4;

  const meta = SCREAMER_META[v] || SCREAMER_META[0];
  audio.playMiniScreamer(v);
  scene?.triggerScreamerShake(0.38);

  const el = document.getElementById('screamer-overlay');
  const img = document.getElementById('screamer-img');
  const cap = document.getElementById('screamer-caption');
  if (!el) return;

  el.setAttribute('data-variant', meta.key);
  if (img) img.src = meta.img;
  if (cap) cap.textContent = t(meta.i18n);

  el.removeAttribute('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  window.setTimeout(() => {
    el.setAttribute('hidden', '');
  }, 420);
}

/* ============================================================================
   ВИЛКА «ЗОЛОТАЯ БОЧКА: ЧУЖОЙ БИЛЕТ» & NEAR-MISS & ИМЕННОЙ ПРОПУСК (?pass=ID)
   ============================================================================ */
function openGoldenTicketForkModal() {
  state.round.pausedForModal = true;
  state.giftPass.processedPhoto = null;
  state.giftPass.lastPassUrl = '';

  document.getElementById('fork-choices-stack')?.removeAttribute('hidden');
  document.getElementById('gift-pass-form')?.setAttribute('hidden', '');
  document.getElementById('gift-pass-share-box')?.setAttribute('hidden', '');
  document.getElementById('gift-form-error')?.setAttribute('hidden', '');

  const prev = document.getElementById('gift-friend-photo-preview');
  const ph = document.getElementById('gift-photo-placeholder');
  if (prev) {
    prev.removeAttribute('src');
    prev.setAttribute('hidden', '');
  }
  ph?.removeAttribute('hidden');

  const nameIn = document.getElementById('input-gift-friend-name');
  if (nameIn) nameIn.value = '';

  document.getElementById('modal-golden-fork')?.removeAttribute('hidden');
  Haptics.heavy();
}

function closeGoldenTicketForkModal() {
  document.getElementById('modal-golden-fork')?.setAttribute('hidden', '');
  if (state.activeScreen === 'workshop' && state.round.modeType === 'premiere') {
    if (state.profile.lives > 0) {
      state.round.pausedForModal = false;
      if (getUnstruckBarrelIndices().length === 0) reloadPremiereBarrelsWave();
    } else {
      finishPremiereRound(false, null);
    }
  }
}

async function handleBurnTicketChoice() {
  const btn = document.getElementById('btn-burn-ticket-x2');
  if (btn) btn.disabled = true;
  audio.playWeldSeal();

  try {
    const res = await burnRegularTicketForX2Lives(state.tg?.user);
    if (res.ok) {
      state.profile.hasPendingTicket = false;
      state.profile.lives = res.lives;
      updatePremiereBarsUI();
      showToast(t('burnSuccessToast'));
      Haptics.success();
      document.getElementById('modal-golden-fork')?.setAttribute('hidden', '');

      if (state.activeScreen === 'workshop' && state.round.modeType === 'premiere') {
        state.round.pausedForModal = false;
        if (getUnstruckBarrelIndices().length === 0) reloadPremiereBarrelsWave();
      } else {
        startPremiereRaceRound();
      }
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleGiftFriendPhotoChange(file) {
  if (!file) return;
  const processed = await processClearPassPhotoToWebP(file);
  if (!processed) {
    document.getElementById('gift-form-error')?.removeAttribute('hidden');
    return;
  }
  state.giftPass.processedPhoto = processed;
  document.getElementById('gift-form-error')?.setAttribute('hidden', '');

  const prev = document.getElementById('gift-friend-photo-preview');
  const ph = document.getElementById('gift-photo-placeholder');
  if (prev) {
    prev.src = processed.dataUrl;
    prev.removeAttribute('hidden');
  }
  ph?.setAttribute('hidden', '');
  Haptics.light();
}

async function handleIssueGiftPassClick() {
  const recipientName = (document.getElementById('input-gift-friend-name')?.value || '').trim();
  const errEl = document.getElementById('gift-form-error');
  if (recipientName.length < 2) {
    errEl?.removeAttribute('hidden');
    Haptics.error();
    return;
  }

  errEl?.setAttribute('hidden', '');
  const issueBtn = document.getElementById('btn-issue-gift-pass');
  if (issueBtn) issueBtn.disabled = true;

  try {
    const created = await createGiftTicketPass({
      tgUser: state.tg?.user,
      senderName: document.getElementById('input-sender-name')?.value || state.tg?.user?.name || '',
      recipientName,
      processedPassPhoto: state.giftPass.processedPhoto,
    });

    if (!created.ok) {
      errEl?.removeAttribute('hidden');
      return;
    }

    state.profile.hasPendingTicket = false;
    state.giftPass.lastPassUrl = created.shareUrl;
    state.giftPass.recipientName = recipientName;
    updatePremiereBarsUI();

    const out = document.getElementById('output-gift-pass-url');
    if (out) out.value = created.shareUrl;

    document.getElementById('fork-choices-stack')?.setAttribute('hidden', '');
    document.getElementById('gift-pass-form')?.setAttribute('hidden', '');
    document.getElementById('gift-pass-share-box')?.removeAttribute('hidden');
    Haptics.success();
  } finally {
    if (issueBtn) issueBtn.disabled = false;
  }
}

function openNearMissModal(score) {
  state.round.pausedForModal = true;
  stopAirTimer();
  const formatted = Number(score || 0).toFixed(1);
  const numEl = document.getElementById('near-miss-score-num');
  const fillEl = document.getElementById('near-miss-score-fill');
  const descEl = document.getElementById('near-miss-desc');
  if (numEl) numEl.textContent = formatted;
  if (fillEl) fillEl.style.width = `${Math.min(100, Number(score || 0))}%`;
  if (descEl) descEl.textContent = t('nearMissDesc', { score: formatted });

  document.getElementById('modal-near-miss')?.removeAttribute('hidden');
  Haptics.error();
}

async function openIncomingPassScreen(passId) {
  state.entered = true;
  const passData = await loadGiftTicketPass(passId, state.tg?.user);
  if (!passData) {
    showScreen('modeA');
    return;
  }
  state.activePassData = passData;

  const photoEl = document.getElementById('pass-holder-photo');
  const nameEl = document.getElementById('pass-holder-name');
  const senderEl = document.getElementById('pass-sender-line');
  const selfWarn = document.getElementById('pass-self-warning');
  const claimForm = document.getElementById('pass-claim-form');
  const claimErr = document.getElementById('pass-claim-error');
  const phoneBadge = document.getElementById('pass-verified-phone-badge');
  const refreshContactBtn = document.getElementById('btn-refresh-tg-contact');
  const codeBox = document.getElementById('pass-ticket-code-box');

  if (photoEl) photoEl.src = passData.recipientPhotoUrl || DEMO_PORTRAITS[0];
  if (nameEl) nameEl.textContent = passData.recipientName || 'ГОСТЬ ПРЕМЬЕРЫ';
  if (senderEl) {
    senderEl.textContent = passData.senderName
      ? `Отправил(а): ${passData.senderName} · Триллер «Бочка» (17 декабря)`
      : 'Именной подарочный билет · Триллер «Бочка» (17 декабря)';
  }

  claimErr?.setAttribute('hidden', '');

  const viewerUid = getViewerUid(state.tg?.user);
  const isOwnPass = Boolean(
    (passData.senderUid && passData.senderUid === viewerUid) ||
      (passData.senderTgId && state.tg?.user?.id && String(passData.senderTgId) === String(state.tg.user.id))
  );

  if (isOwnPass) {
    selfWarn?.removeAttribute('hidden');
    claimForm?.setAttribute('hidden', '');
    codeBox?.setAttribute('hidden', '');
  } else if (
    passData.status === 'claimed' ||
    passData.status === 'sent' ||
    passData.orderStatus === 'pending' ||
    passData.orderStatus === 'sent'
  ) {
    selfWarn?.setAttribute('hidden', '');
    claimForm?.setAttribute('hidden', '');
    renderPassOrderStatusBox(passData);
  } else {
    selfWarn?.setAttribute('hidden', '');
    codeBox?.setAttribute('hidden', '');
    claimForm?.removeAttribute('hidden');

    if (passData.hasVerifiedPhone && passData.verifiedPhone) {
      state.verifiedContactPhone = passData.verifiedPhone;
      if (phoneBadge) {
        phoneBadge.textContent = `✓ Номер подтверждён в Telegram: ${passData.verifiedPhone}`;
        phoneBadge.removeAttribute('hidden');
      }
      refreshContactBtn?.setAttribute('hidden', '');
    } else {
      phoneBadge?.setAttribute('hidden', '');
    }
  }

  startLivePassClock(passData.serverOffsetMs || 0);
  showScreen('pass');
}

function renderPassOrderStatusBox(passData) {
  const codeBox = document.getElementById('pass-ticket-code-box');
  const statusTag = document.getElementById('pass-order-status-tag');
  const contactEl = document.getElementById('pass-ticket-contact');
  const bookingRow = document.getElementById('pass-booking-row');
  const codeIn = document.getElementById('pass-ticket-code');
  const fileBtn = document.getElementById('btn-download-ticket-file');
  const botBtn = document.getElementById('btn-pass-verify-bot');

  codeBox?.removeAttribute('hidden');

  const isSent = passData.orderStatus === 'sent' || Boolean(passData.bookingCode || passData.ticketFileUrl);
  if (statusTag) {
    statusTag.textContent = isSent
      ? 'ЭЛЕКТРОННЫЙ БИЛЕТ ВЫПИСАН // ПРОВЕРЬ @BOCHKA_FILM_BOT'
      : 'ЗАЯВКА ПЕРЕДАНА ПРОДЮСЕРАМ // ОЖИДАЕТ ВЫПИСКИ';
  }

  if (contactEl) {
    const cityNote = passData.cityCinema ? ` (${passData.cityCinema})` : '';
    contactEl.textContent = isSent
      ? `Твой электронный билет${cityNote} оформлен продюсерами и продублирован в чат @bochka_film_bot!`
      : `Заявка${cityNote} передана продюсерам! Другу уже начислено ×2 жизней, а электронный билет придёт на твой подтверждённый номер прямо в @bochka_film_bot.`;
  }

  if (passData.bookingCode && bookingRow && codeIn) {
    bookingRow.removeAttribute('hidden');
    codeIn.value = passData.bookingCode;
  } else {
    bookingRow?.setAttribute('hidden', '');
  }

  if (passData.ticketFileUrl && fileBtn) {
    fileBtn.href = passData.ticketFileUrl;
    fileBtn.removeAttribute('hidden');
  } else {
    fileBtn?.setAttribute('hidden', '');
  }

  if (botBtn) {
    const bot = ENV.tgBotUsername || 'bochka_film_bot';
    botBtn.onclick = () => {
      openExternalLink(`https://t.me/${bot}`);
    };
  }
}

async function handleVerifyPassContactClick() {
  const giftId = state.activePassData?.id || state.incomingPassId;
  const errEl = document.getElementById('pass-claim-error');
  const phoneBadge = document.getElementById('pass-verified-phone-badge');
  const refreshBtn = document.getElementById('btn-refresh-tg-contact');
  errEl?.setAttribute('hidden', '');

  const res = await requestTelegramContact({ giftId });
  if (res.ok) {
    if (res.phone) state.verifiedContactPhone = res.phone;
    window.setTimeout(async () => {
      const fresh = await loadGiftTicketPass(giftId, state.tg?.user);
      if (fresh?.verifiedPhone) state.verifiedContactPhone = fresh.verifiedPhone;
      if (phoneBadge) {
        const numTxt = state.verifiedContactPhone ? `: ${state.verifiedContactPhone}` : '';
        phoneBadge.textContent = `✓ Контакт Telegram подтверждён${numTxt}! Теперь введи город и кинотеатр ниже.`;
        phoneBadge.removeAttribute('hidden');
      }
    }, 650);
    if (phoneBadge) {
      const numTxt = res.phone ? `: ${res.phone}` : '';
      phoneBadge.textContent = `✓ Контакт Telegram подтверждён${numTxt}! Теперь введи город и кинотеатр ниже.`;
      phoneBadge.removeAttribute('hidden');
    }
    refreshBtn?.setAttribute('hidden', '');
    Haptics.success();
    return;
  }

  if (res.reason === 'opened_bot_chat') {
    refreshBtn?.removeAttribute('hidden');
    if (phoneBadge) {
      phoneBadge.textContent =
        'В открывшемся чате @bochka_film_bot нажми кнопку «📱 Подтвердить мой номер телефона» и затем нажми «↻ Проверить статус»!';
      phoneBadge.removeAttribute('hidden');
    }
  }
}

async function handleRefreshPassContactClick() {
  const giftId = state.activePassData?.id || state.incomingPassId;
  const errEl = document.getElementById('pass-claim-error');
  const phoneBadge = document.getElementById('pass-verified-phone-badge');
  const refreshBtn = document.getElementById('btn-refresh-tg-contact');
  errEl?.setAttribute('hidden', '');

  const fresh = await loadGiftTicketPass(giftId, state.tg?.user);
  if (fresh?.hasVerifiedPhone) {
    state.activePassData = fresh;
    state.verifiedContactPhone = fresh.verifiedPhone || '';
    if (phoneBadge) {
      phoneBadge.textContent = `✓ Номер подтверждён в Telegram: ${fresh.verifiedPhone}`;
      phoneBadge.removeAttribute('hidden');
    }
    refreshBtn?.setAttribute('hidden', '');
    Haptics.success();
  } else if (errEl) {
    errEl.textContent =
      'Контакт пока не найден. Открой эту подарочную ссылку внутри Telegram (@bochka_film_bot) и нажми кнопку отправки своего номера!';
    errEl.removeAttribute('hidden');
    Haptics.error();
  }
}

function startLivePassClock(serverOffsetMs = 0) {
  if (state.passClockTimer) clearInterval(state.passClockTimer);
  const clockEl = document.getElementById('pass-live-clock');
  const tick = () => {
    if (!clockEl) return;
    const d = new Date(Date.now() + serverOffsetMs);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const tenths = Math.floor(d.getMilliseconds() / 100);
    clockEl.textContent = `${hh}:${mm}:${ss}.${tenths}`;
  };
  tick();
  state.passClockTimer = window.setInterval(tick, 100);
}

async function handleAcceptIncomingPass() {
  if (!state.activePassData?.id) return;
  const errEl = document.getElementById('pass-claim-error');
  const cityCinema = (document.getElementById('input-pass-city-cinema')?.value || '').trim();
  errEl?.setAttribute('hidden', '');

  if (cityCinema.length < 3) {
    if (errEl) {
      errEl.textContent = 'Укажи свой город и желаемый кинотеатр (минимум 3 символа)!';
      errEl.removeAttribute('hidden');
    }
    Haptics.error();
    return;
  }

  const btn = document.getElementById('btn-accept-gift-pass');
  if (btn) btn.disabled = true;

  try {
    const res = await submitGiftTicketOrder({
      giftId: state.activePassData.id,
      tgUser: state.tg?.user,
      cityCinema,
      fallbackPhone: state.verifiedContactPhone,
    });

    if (!res.ok) {
      if (res.reason === 'self_claim_blocked') {
        document.getElementById('pass-self-warning')?.removeAttribute('hidden');
        document.getElementById('pass-claim-form')?.setAttribute('hidden', '');
      } else if (res.reason === 'already_claimed') {
        await openIncomingPassScreen(state.activePassData.id);
      } else if (errEl) {
        const messages = {
          telegram_required:
            'Открой эту подарочную ссылку внутри Telegram (@bochka_film_bot), чтобы подтвердить аккаунт и получить электронный билет в бот!',
          contact_not_verified:
            'Сначала подтверди свой номер телефона кнопкой «📱 1. Подтвердить номер через Telegram» выше!',
          phone_already_used:
            'На этот номер телефона уже выписывался подарочный билет в рамках акции (1 уникальный номер = 1 билет)!',
          city_required: 'Укажи свой город и желаемый кинотеатр!',
        };
        errEl.textContent =
          messages[res.reason] || 'Не удалось отправить заявку. Проверь интернет и открой ссылку в @bochka_film_bot.';
        errEl.removeAttribute('hidden');
      }
      Haptics.error();
      return;
    }

    document.getElementById('pass-claim-form')?.setAttribute('hidden', '');
    renderPassOrderStatusBox({
      id: state.activePassData.id,
      orderStatus: 'pending',
      cityCinema: res.cityCinema || cityCinema,
      verifiedPhone: res.verifiedPhone || state.verifiedContactPhone,
    });
    Haptics.success();
  } finally {
    if (btn) btn.disabled = false;
  }
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
  recordFunnelEvent('kp_clicks', state.tg?.user).catch(() => {});
  claimSocialOrPromoBonus(state.tg?.user, 'kp_clicked', 'kp')
    .then((res) => {
      if (res?.pointsAdded > 0) {
        state.profile.premierePoints = res.premierePoints;
        updatePremiereBarsUI();
      }
    })
    .catch(() => {});
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

  state.watchChannel?.send('rescued', {
    survived,
    attemptsUsed: state.round.attemptsUsed || 1,
  });

  if (state.round.voiceUrl) {
    window.setTimeout(() => {
      audio.playCleanSenderVoice(state.round.voiceUrl);
    }, 360);
  }

  if (state.round.isDemo && survived) {
    const blitzBonus = state.round.isBlitz ? state.round.blitzTargetsCleared * 95 : 0;
    completeWorkshopLevel(state.tg?.user, state.round.workshopLevel, state.round.airLeft, blitzBonus)
      .then((lvlRes) => {
        if (lvlRes?.ok) {
          state.profile.currentLevel = lvlRes.currentLevel;
          state.profile.premierePoints = lvlRes.premierePoints;
          state.profile.hasPlayedSolo = true;
          updatePremiereBarsUI();
          showToast(`🏆 Уровень ${state.round.workshopLevel} пройден! +${lvlRes.earnedPoints} ⭐ в ТОП-10`);
        }
      })
      .catch(() => {});
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
    await populateFinaleScreen({ premiereResult: null });
    showScreen('finale');
  }, 1250);
}

async function finishPremiereRound(won, winRes) {
  state.round.running = false;
  state.round.pausedForModal = false;
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
    await populateFinaleScreen({ premiereResult: { won, ...(winRes || {}) } });
    showScreen('finale');
  }, won ? 1200 : 420);
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
    if (sizeTag) sizeTag.textContent = `320×320 WEBP · ${processed.sizeKb} КБ`;
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
    state.pack.shareLifeClaimedForUrl = '';

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

async function grantShareLifeOnceForCurrentBarrel() {
  if (!state.pack.lastShareUrl) return;
  if (state.pack.shareLifeClaimedForUrl === state.pack.lastShareUrl) return;
  state.pack.shareLifeClaimedForUrl = state.pack.lastShareUrl;

  const bonus = await claimShareBonusLife(state.tg?.user);
  state.profile.lives = bonus.lives;
  state.profile.rawSharesToday = bonus.rawSharesToday;
  updatePremiereBarsUI();

  if (bonus.granted > 0) {
    showToast(t('shareLifeGrantedToast'));
  } else if (bonus.capped) {
    showToast(t('shareLifeCappedToast'));
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
   ЭКРАН 5: ФИНАЛ РАУНДА, ГОНКА ЗА ПРЕМЬЕРОЙ (0..100) И СТОРИС 9:16
   ============================================================================ */
async function populateFinaleScreen({ premiereResult = null } = {}) {
  const r = state.round;
  const subtag = document.getElementById('finale-subtag');
  const portraitImg = document.getElementById('finale-portrait-img');
  const stampEl = document.getElementById('finale-stamp');
  const msgEl = document.getElementById('finale-message');
  const voiceRow = document.getElementById('finale-voice-row');
  const notifyEl = document.getElementById('finale-notify-line');

  if (premiereResult) {
    if (subtag) subtag.textContent = t('premiereRaceTag');
    if (portraitImg) portraitImg.src = r.portraitDataUrl || createGoldenTicketPortraitDataUrl('');
    if (stampEl) {
      stampEl.classList.toggle('is-failed', !premiereResult.won);
      stampEl.textContent = premiereResult.won
        ? t('nightShiftWonTitle')
        : `${t('premiereBarLabel')}: ${Number(state.profile.premiereScore || 0).toFixed(1)} / 100`;
    }
    if (msgEl) {
      msgEl.textContent = premiereResult.won
        ? `ПРОМОКОД ЗАКРЫТОЙ ПРЕМЬЕРЫ: ${premiereResult.premiereCode}`
        : t('nightShiftEmptyMsg');
    }
    voiceRow?.setAttribute('hidden', '');
    if (notifyEl) notifyEl.style.display = 'none';
  } else {
    if (subtag) subtag.textContent = r.isDemo ? t('revealDemoFrom') : r.senderLabel || t('revealFromFriend');
    if (portraitImg) portraitImg.src = r.portraitDataUrl || DEMO_PORTRAITS[0];
    if (stampEl) {
      stampEl.classList.toggle('is-failed', !r.survived);
      stampEl.textContent = r.survived
        ? t('finaleSurvivedTitle', { n: Math.max(1, r.attemptsUsed || 1) })
        : t('finaleFailedTitle');
    }
    if (msgEl) msgEl.textContent = `«${r.message || t('presetsSelf')[0]}»`;
    if (voiceRow) {
      if (r.voiceUrl) voiceRow.removeAttribute('hidden');
      else voiceRow.setAttribute('hidden', '');
    }
    if (notifyEl) {
      notifyEl.style.display = r.isDemo ? 'none' : 'block';
      notifyEl.textContent = t('finaleNotified');
    }
  }

  // ШАГ 8.2 (ТРИГГЕР Б): Если игрок вскрыл бочку друга — показываем 3 реактивные кнопки (1 клик без спама)
  const reactionsBox = document.getElementById('finale-friend-reactions');
  const cinemaBtn = document.getElementById('btn-cinema-reply');
  const reactionStatus = document.getElementById('finale-reaction-status');
  if (!premiereResult && !r.isDemo && state.incomingPack) {
    reactionsBox?.removeAttribute('hidden');
    cinemaBtn?.setAttribute('hidden', '');
    state.round.reactionLocked = false;
    document.querySelectorAll('.js-finale-reaction').forEach((btn) => {
      btn.disabled = false;
    });
    reactionStatus?.setAttribute('hidden', '');
  } else {
    reactionsBox?.setAttribute('hidden', '');
    cinemaBtn?.removeAttribute('hidden');
  }

  const replayBtn = document.getElementById('btn-replay-round');
  if (replayBtn) {
    if (state.incomingPack && !r.isDemo) {
      replayBtn.textContent = t('btnPlayAgain');
    } else {
      const nextSpec = getWorkshopLevelSpec(state.profile.currentLevel || 1);
      replayBtn.textContent = nextSpec.isBlitz
        ? `⚡ БЛИЦ УР.${nextSpec.level} (10 БОЧЕК)`
        : `▶ УР.${nextSpec.level} · ${nextSpec.barrelCount} ${formatBarrelWord(nextSpec.barrelCount)}`;
    }
  }

  await refreshQuestUI();
}

async function refreshQuestUI() {
  const [synced, freshProfile] = await Promise.all([
    syncFriendsOpenedTokens(state.tg?.user),
    fetchPlayerProfile(state.tg?.user),
  ]);
  state.profile = freshProfile;
  updatePremiereBarsUI();

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

  const winnerBox = document.getElementById('golden-winner-box');
  const codeOut = document.getElementById('output-ticket-code');
  const contactOut = document.getElementById('golden-winner-contact');
  if (state.profile.premiereWon && state.profile.premiereCode && winnerBox) {
    winnerBox.removeAttribute('hidden');
    if (codeOut) codeOut.value = state.profile.premiereCode;
    if (contactOut) contactOut.textContent = 'Пригласительный на закрытую Премьеру со съёмочной группой закреплён за твоим аккаунтом.';
  }

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

  const enterBtn = document.getElementById('btn-enter-night-shift');
  const cdText = document.getElementById('night-shift-cooldown-text');
  if (enterBtn) {
    const unlocked = isPremiereRaceUnlocked(synced, state.profile);
    enterBtn.disabled = !unlocked;
    if (!unlocked) {
      if (cdText) {
        cdText.removeAttribute('hidden');
        cdText.textContent = t('premiereLockedHint');
      }
    } else if (state.profile.lives <= 0) {
      if (cdText) {
        cdText.removeAttribute('hidden');
        cdText.textContent = t('nightShiftCooldown');
      }
    } else {
      cdText?.setAttribute('hidden', '');
    }
  }
}

async function handleKinopoiskScreenshotUpload(file) {
  const fb = document.getElementById('kp-screen-feedback');
  if (!file || !fb) return;

  const result = await verifyKinopoiskScreenshot(file);
  fb.removeAttribute('hidden');

  if (result.ok) {
    markKpScreenshotVerified();
    recordFunnelEvent('kp_screenshot_verified', state.tg?.user, result.blob || null).catch(() => {});
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
  ctx.fillText(ticketCode || 'ПРЕМЬЕРА · 17.12', 256, 294);

  return c.toDataURL('image/webp', 0.85);
}

async function shareOrDownloadPngBlob(pngBlob, fileName) {
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
    await shareOrDownloadPngBlob(pngBlob, `bochka-story-${Date.now()}.png`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================================
   КАСТОМНЫЙ SELF-HOSTED MP4 ПЛЕЕР ТРЕЙЛЕРА (БЕЗ ПЕРЕМОТКИ ВПЕРЁД + 40 СЕК UNLOCK)
   ============================================================================ */
function initVisibilityAndAntiSeekGuards() {
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
    if (closeBtn) closeBtn.style.visibility = 'visible';
    updateTrailerRescueBanner(0);
  } else {
    rescueBox?.setAttribute('hidden', '');
  }

  if (vid && !state.trailer.usingYtFallback) {
    if (forRescue) vid.currentTime = 0;
    vid.muted = false;
    vid.play().catch(() => {
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
  recordFunnelEvent('trailer_completions', state.tg?.user).catch(() => {});
  const bonus = await claimSocialOrPromoBonus(state.tg?.user, 'trailer_watched', 'app').catch(() => null);
  if (bonus?.ok) {
    state.profile.premierePoints = bonus.premierePoints;
    state.profile.lives = bonus.lives;
  }
  await refreshQuestUI();
  Haptics.success();

  if (!state.trailer.forRescue) {
    if (bonus?.pointsAdded > 0) {
      showToast(`🎬 Трейлер зачтён: +${bonus.pointsAdded} ⭐ в ТОП-10 и +${bonus.livesAdded} ❤️!`);
    } else {
      showToast('+1 ЖЕТОН ЦЕХА («КРЫШКА») НАЧИСЛЕН!');
    }
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
   v5.0: СТОЛ «НА СЧЁТ ТРИ!», ЖИВОЕ ПОДГЛЯДЫВАНИЕ, СОЦГРАФ, ТОП-10 И МУЛЬТИ-ШЕРИНГ
   ============================================================================ */
function escapeHtmlSafe(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function openDuelTable(roomId = '', { autoAddTestBots = false } = {}) {
  state.entered = true;
  stopAirTimer();
  state.round.running = false;
  state.round.pausedForModal = false;
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.setAttribute('hidden', ''));

  await audio.unlock(audio.enabled !== false);
  refreshSoundButtonLabel();

  const cleanRoom = roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  await duelCtrl?.openRoom(cleanRoom, { autoAddTestBots });
  showScreen('duel');
}

async function shareCurrentDuelRoom() {
  const roomId = duelCtrl?.roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  const links = buildDuelShareLinks(roomId);
  const count = duelCtrl?.players?.length || 1;
  const text =
    count >= 2
      ? '⚔️ Нас уже двое за столом «БОЧКИ»! Залетай 3-м на счёт три — цех досыплет +450 ⭐ очков ТОП-10 и шанс Золотой бочки с билетом!'
      : '⚔️ Залетай за стол «НА СЧЁТ ТРИ!» в цеху «БОЧКИ»! Хватаем живые бочки синхронно на живой кон:';

  if (state.tg?.inTelegram) {
    openTelegramShare(links.tgUrl, text);
    return;
  }
  const res = await shareNativeOrFallback({
    title: 'БОЧКА — Стол «На счёт три!»',
    text,
    url: links.tgUrl || links.webUrl,
  });
  if (res === 'copied') {
    showToast('Ссылка на стол «На счёт три!» скопирована!');
  }
}

let lastWatchRattleAt = 0;

function closeActiveWatchChannel() {
  if (state.watchChannel) {
    state.watchChannel.close();
    state.watchChannel = null;
  }
  state.watchingBarrelId = '';
}

async function startLiveWatchSpectatorMode(barrelId) {
  if (!barrelId) {
    showScreen('modeA');
    return;
  }
  stopAirTimer();
  state.round.running = false;
  closeActiveWatchChannel();

  const pack = await loadBarrelPack(barrelId);
  showScreen('workshop');
  state.watchingBarrelId = barrelId;

  scene.resetRound({
    barrelCount: 6,
    targetIndex: typeof pack?.targetIndex === 'number' ? pack.targetIndex : 0,
    golden: false,
  });
  scene.setInteractive(false);

  document.getElementById('hud-premiere-strip')?.setAttribute('hidden', '');
  document.getElementById('hud-watch-banner')?.removeAttribute('hidden');
  const tagEl = document.getElementById('hud-mode-tag');
  const titleEl = document.getElementById('hud-urgent-title');
  const statusEl = document.getElementById('hud-watch-status');
  if (tagEl) tagEl.textContent = '👀 ПРЯМОЙ ЭФИР ИЗ ЦЕХА // РЕЖИМ НАБЛЮДАТЕЛЯ';
  if (titleEl) titleEl.textContent = 'ДРУГ ПРЯМО СЕЙЧАС ИЩЕТ ТВОЮ БОЧКУ! ГРЕМИ ЦЕПЯМИ И СЛЕДИ ЗА УДАРАМИ';
  if (statusEl) statusEl.textContent = '👀 ЖДЁМ УДАРА ДРУГА ПО БОЧКАМ...';

  state.watchChannel = createBarrelWatchChannel(barrelId, {
    onRemoteEvent: (ev) => {
      if (ev.type === 'strike' && typeof ev.barrelIndex === 'number') {
        const idx = ev.barrelIndex;
        const b = scene.barrels?.[idx];
        if (b) scene.triggerStrikeFX(idx, b.group.position.clone());
        audio.playStrike(idx);
        if (ev.hitTarget) {
          audio.playLidBlowOff(true);
          scene.triggerRevealDive(idx);
          if (statusEl) statusEl.textContent = '🎉 ДРУГ ВСКРЫЛ ТВОЮ ЖИВУЮ БОЧКУ!';
        } else {
          scene.triggerEmptyBarrelOpen(idx);
          scene.triggerScreamerShake(0.42);
          if (statusEl) {
            statusEl.textContent = `💥 МИМО! Вскрыта бочка №${ev.batchCode || idx + 1} (попыток: ${ev.attemptsLeft ?? 0})`;
          }
        }
      } else if (ev.type === 'rescued') {
        if (statusEl) {
          statusEl.textContent = ev.survived
            ? '🎉 ДРУГ ВЫБРАЛСЯ ИЗ БОЧКИ! ВЫЗЫВАЙ ЕГО «НА СЧЁТ ТРИ!»'
            : '☠️ КИСЛОРОД ВЫШЕЛ — ДРУГ ОСТАЛСЯ В ЦЕХУ!';
        }
      }
    },
  });
}

async function refreshPackFriendsStrip() {
  const box = document.getElementById('pack-friends-box');
  const strip = document.getElementById('pack-friends-strip');
  if (!box || !strip) return;

  const friends = await fetchMyWorkshopFriends(state.tg?.user);
  if (!friends.length) {
    box.setAttribute('hidden', '');
    strip.innerHTML = '';
    return;
  }

  box.removeAttribute('hidden');
  strip.innerHTML = friends
    .map((f) => {
      const name = escapeHtmlSafe(f.friend_name || (f.friend_username ? `@${f.friend_username}` : 'Кент из цеха'));
      const stamp = f.opened_barrel ? 'ВСКРЫВАЛ БОЧКУ' : 'УЖЕ В ЦЕХУ';
      const tgAttr = escapeHtmlSafe(f.friend_tg_id || '');
      return `
        <div class="pack-friend-chip">
          <div class="pack-friend-top">
            <strong>${name}</strong>
            <span class="pack-friend-stamp">${stamp}</span>
          </div>
          <button type="button" class="pack-friend-duel-btn" data-friend-tg="${tgAttr}" data-friend-name="${name}">
            ⚔️ НА СЧЁТ ТРИ!
          </button>
        </div>
      `;
    })
    .join('');

  strip.querySelectorAll('.pack-friend-duel-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetTgId = btn.getAttribute('data-friend-tg') || '';
      const friendName = btn.getAttribute('data-friend-name') || 'Друг';
      const roomId = `d_${Math.random().toString(36).slice(2, 8)}`;
      if (targetTgId) {
        sendDuelChallengePush({
          targetTgId,
          challengerName: state.tg?.user?.name || '',
          roomId,
        }).catch(() => {});
        showToast(`⚔️ Вызов отправлен ${friendName} в Telegram!`);
      }
      await openDuelTable(roomId);
    });
  });
}

async function handleFinaleFriendReaction(reactionType) {
  if (state.round.reactionLocked || !state.incomingPack) return;
  state.round.reactionLocked = true;

  document.querySelectorAll('.js-finale-reaction').forEach((b) => {
    b.disabled = true;
  });

  const roomId = `d_${Math.random().toString(36).slice(2, 8)}`;
  await sendPostRescueReaction(state.incomingPack, reactionType, state.tg?.user, { roomId });
  Haptics.success();

  const noteEl = document.getElementById('finale-reaction-status');
  if (noteEl) {
    noteEl.removeAttribute('hidden');
    if (reactionType === 'cinema') {
      noteEl.textContent = '✓ Отправителю улетел пуш: «Идём в кино 17 декабря!»';
    } else if (reactionType === 'ask_ticket') {
      noteEl.textContent = '✓ Запрос на подарочный билет отправлен автору бочки в Telegram!';
    } else {
      noteEl.textContent = '✓ Стол на троих создан! Отправителю улетел вызов — зови 3-го друга!';
    }
  }

  if (reactionType === 'duel_3p') {
    await openDuelTable(roomId);
    await shareCurrentDuelRoom();
  } else if (reactionType === 'cinema') {
    openTrailerModal({ forRescue: false });
  }
}

async function openLeaderboardModal() {
  const modal = document.getElementById('modal-leaderboard');
  const listEl = document.getElementById('leaderboard-list');
  const rankEl = document.getElementById('leader-me-rank');
  const ptsEl = document.getElementById('leader-me-points');
  const gapEl = document.getElementById('leader-me-gap');

  modal?.removeAttribute('hidden');
  if (listEl) listEl.innerHTML = '<div class="mono-tag">Синхронизация ТОП-10 с сервером...</div>';

  const res = await fetchPremiereLeaderboard(state.tg?.user);
  const myUid = getViewerUid(state.tg?.user);
  const me = res.me || {};

  if (rankEl) rankEl.textContent = me.rank ? `#${me.rank}` : '#—';
  if (ptsEl) ptsEl.textContent = `⭐ ${Number(me.premiere_points ?? state.profile.premierePoints ?? 0)}`;
  if (gapEl) {
    gapEl.textContent = me.in_top10
      ? '🔥 ТЫ В ЗОНЕ ПРИГЛАШЕНИЯ НА ЗАКРЫТУЮ ПРЕМЬЕРУ (ТОП-10)!'
      : `До входа в ТОП-10: +${Math.max(10, Number(me.points_to_top10 || 150))} ⭐`;
  }

  if (!listEl) return;
  const topRows = (res.leaders || []).slice(0, 12);
  if (!topRows.length) {
    listEl.innerHTML = '<div class="mono-tag">Ты можешь стать первым лидером ТОП-10 прямо сейчас!</div>';
    return;
  }

  listEl.innerHTML = topRows
    .map((row, idx) => {
      const rank = Number(row.rank || idx + 1);
      const isMe = row.uid === myUid;
      const cls = `leader-row ${rank <= 3 ? 'is-top3' : ''} ${isMe ? 'is-me' : ''}`.trim();
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const subMeta = `Ур.${row.current_level || 1} · Друзей: ${row.friends_brought || 0} · Побед: ${row.duels_won || 0}`;
      return `
        <div class="${cls}">
          <span class="leader-rank">${medal}</span>
          <div class="leader-name-col">
            <strong>${escapeHtmlSafe(row.name || 'Узник цеха')}${isMe ? ' (ВЫ)' : ''}</strong>
            <small>${escapeHtmlSafe(subMeta)}</small>
          </div>
          <span class="leader-pts">⭐ ${Number(row.premiere_points || 0)}</span>
        </div>
      `;
    })
    .join('');
}

function getActiveShareBundle(kind = 'trailer') {
  const uid = getViewerUid(state.tg?.user);
  if (kind === 'barrel' && state.pack.lastShareUrl) {
    const phrase = document.getElementById('input-custom-phrase')?.value || 'Вытащи меня за 3 попытки';
    return {
      action: 'share_barrel',
      url: state.pack.lastShareUrl,
      webUrl: state.pack.lastWebUrl || state.pack.lastShareUrl,
      text: `🛢 Кто-то заварил тебя в цеху «БОЧКИ»! Надень наушники — 3 попытки и 30 сек воздуха: «${phrase}»`,
    };
  }
  const trLinks = buildTrailerReferralLinks(uid);
  return {
    action: 'share_trailer',
    url: state.tg?.inTelegram ? trLinks.tgUrl : trLinks.webUrl,
    webUrl: trLinks.webUrl,
    text: '🎬 Посмотри официальный трейлер психологического триллера «БОЧКА» (Тиль Швайгер · в кино с 17 декабря) и проверь интуицию в 3D-цеху:',
  };
}

function syncShareHubUrl() {
  const isBarrel = state.shareHubKind === 'barrel' && Boolean(state.pack.lastShareUrl);
  document.getElementById('tab-share-kind-trailer')?.classList.toggle('is-active', !isBarrel);
  document.getElementById('tab-share-kind-barrel')?.classList.toggle('is-active', isBarrel);
  const bundle = getActiveShareBundle(isBarrel ? 'barrel' : 'trailer');
  const out = document.getElementById('share-hub-url-output');
  if (out) out.value = bundle.url;
}

function openShareHubModal(kind = 'trailer') {
  if (kind === 'barrel' && !state.pack.lastShareUrl) {
    state.shareHubKind = 'trailer';
  } else {
    state.shareHubKind = kind;
  }
  syncShareHubUrl();
  document.getElementById('modal-share-hub')?.removeAttribute('hidden');
}

async function triggerMultiSocialShare(platform = 'tg', kind = 'trailer') {
  if (kind === 'barrel' && !state.pack.lastShareUrl) {
    document.getElementById('modal-share-hub')?.setAttribute('hidden', '');
    showScreen('pack');
    showToast('Сначала завари крышку бочки с фото или голосом друга!');
    return;
  }

  const bundle = getActiveShareBundle(kind);
  Haptics.medium();

  if (platform === 'tg') {
    openTelegramShare(bundle.url, bundle.text);
  } else if (platform === 'wa') {
    openWhatsAppShare(bundle.webUrl, bundle.text);
  } else if (platform === 'vk') {
    openVkShare(bundle.webUrl, bundle.text);
  } else if (platform === 'ig') {
    const pngBlob = await generateStoriesPosterPNG({
      portraitSrc: state.pack.processed?.dataUrl || state.round.portraitDataUrl || DEMO_PORTRAITS[0],
      survived: true,
      attemptNum: 1,
      message: kind === 'barrel'
        ? (document.getElementById('input-custom-phrase')?.value || 'Найди живую бочку за 3 удара!')
        : 'ТРИЛЛЕР «БОЧКА» · СМОТРИ ТРЕЙЛЕР НА BOCHKA.QUEST',
      labels: {
        title: t('gateTitle'),
        slogan: t('storiesSlogan'),
        premiere: t('storiesPremiere'),
        survivedStamp: kind === 'barrel' ? 'БОЧКА ЗАВАРЕНА // ССЫЛКА В ДИРЕКТ' : 'ОФИЦИАЛЬНЫЙ ТРЕЙЛЕР // 17 ДЕКАБРЯ',
        failedStamp: t('storiesFailed'),
      },
    });
    const igRes = await openInstagramShareFlow({
      pngBlob,
      fileName: `bochka-${kind}-${Date.now()}.png`,
      shareUrl: bundle.webUrl,
      caption: `${bundle.text} ${bundle.webUrl}`,
    });
    if (igRes === 'downloaded_and_copied') {
      showToast('📸 Постер 9:16 скачан, а ссылка скопирована для стикера Instagram Stories!');
    }
  } else if (platform === 'copy') {
    await copyToClipboard(bundle.url);
    showToast(t('copiedToast'));
  } else {
    const res = await shareNativeOrFallback({
      title: 'БОЧКА — В кино с 17 декабря',
      text: bundle.text,
      url: bundle.webUrl,
    });
    if (res === 'aborted') return;
    if (res === 'copied') showToast(t('copiedToast'));
  }

  if (kind === 'barrel') {
    await grantShareLifeOnceForCurrentBarrel();
  }

  const bonus = await claimSocialOrPromoBonus(state.tg?.user, bundle.action, platform);
  if (bonus?.ok) {
    state.profile.premierePoints = bonus.premierePoints;
    state.profile.lives = bonus.lives;
    updatePremiereBarsUI();
    if (bonus.pointsAdded > 0) {
      const lifeTxt = bonus.livesAdded > 0 ? ` и +${bonus.livesAdded} ❤️` : '';
      showToast(`🔥 Бонус соцсети (${platform.toUpperCase()}): +${bonus.pointsAdded} ⭐ в ТОП-10${lifeTxt}!`);
    }
  }
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
    if (duelCtrl?.isActive) duelCtrl.leaveRoom(false);
    showScreen('modeA');
  });

  document.getElementById('nav-workshop')?.addEventListener('click', () => {
    if (!state.entered) return;
    if (duelCtrl?.isActive) duelCtrl.leaveRoom(false);
    if (state.round.running) showScreen('workshop');
    else showScreen('modeA');
  });

  document.getElementById('nav-trailer')?.addEventListener('click', () => openTrailerModal({ forRescue: false }));

  document.getElementById('nav-leaderboard')?.addEventListener('click', () => openLeaderboardModal());

  document.getElementById('nav-kinopoisk')?.addEventListener('click', async () => {
    markKinopoiskVisited();
    recordFunnelEvent('kp_clicks', state.tg?.user).catch(() => {});
    claimSocialOrPromoBonus(state.tg?.user, 'kp_clicked', 'kp').catch(() => {});
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
    await audio.unlock(true);
    refreshSoundButtonLabel();
    if (isPremiereRaceUnlocked(getQuestState(), state.profile)) {
      startPremiereRaceRound();
    } else {
      await populateFinaleScreen();
      showScreen('finale');
      document.getElementById('golden-hunt-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Экран 1: Входной шлюз
  document.getElementById('btn-enter-sound')?.addEventListener('click', () => enterWorkshopGate(true));
  document.getElementById('btn-enter-mute')?.addEventListener('click', () => enterWorkshopGate(false));

  // Экран 2 (Режим А)
  document.getElementById('btn-start-demo')?.addEventListener('click', () => startDemoRound());
  document.getElementById('btn-go-pack')?.addEventListener('click', () => showScreen('pack'));
  document.getElementById('btn-mode-a-premiere')?.addEventListener('click', () => startPremiereRaceRound());

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

  // Секретная пасхалка «Достучаться до небес» (Экран моря + 10-сек таппер по бочке)
  document.getElementById('btn-ocean-tap-barrel')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleOceanBarrelTap();
  });
  document.getElementById('btn-ocean-start-tap')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.oceanTapper.running) {
      startOceanTapperCountdown();
    }
    handleOceanBarrelTap();
  });
  document.getElementById('btn-ocean-claim-gift')?.addEventListener('click', () => {
    handleReturnFromOcean(true);
  });
  document.getElementById('btn-ocean-story')?.addEventListener('click', () => handleDownloadOceanPostcard());
  document.getElementById('btn-ocean-back')?.addEventListener('click', () => handleReturnFromOcean(false));

  // Вилка «Золотая бочка: Чужой билет в Telegram»
  document.getElementById('btn-close-golden-fork')?.addEventListener('click', () => closeGoldenTicketForkModal());
  document.getElementById('btn-reopen-golden-fork')?.addEventListener('click', () => openGoldenTicketForkModal());
  document.getElementById('btn-burn-ticket-x2')?.addEventListener('click', () => handleBurnTicketChoice());
  document.getElementById('btn-gift-ticket-toggle')?.addEventListener('click', () => {
    document.getElementById('gift-pass-form')?.removeAttribute('hidden');
    Haptics.light();
  });
  document.getElementById('input-gift-friend-photo')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleGiftFriendPhotoChange(file);
  });
  document.getElementById('btn-issue-gift-pass')?.addEventListener('click', () => handleIssueGiftPassClick());
  document.getElementById('btn-copy-gift-pass')?.addEventListener('click', async () => {
    if (!state.giftPass.lastPassUrl) return;
    await copyToClipboard(state.giftPass.lastPassUrl);
    showToast(t('copiedToast'));
  });
  document.getElementById('btn-share-gift-native')?.addEventListener('click', async () => {
    if (!state.giftPass.lastPassUrl) return;
    const res = await shareNativeOrFallback({
      title: 'Подарочный билет в кино — БОЧКА (17 декабря)',
      text: `🎟 Выбил в цеху «БОЧКИ» настоящий билет в кино на твоё имя (${state.giftPass.recipientName})! Подтверди номер в Telegram и выбери кинотеатр в своём городе:`,
      url: state.giftPass.lastPassUrl,
    });
    if (res === 'copied') showToast(t('copiedToast'));
  });
  document.getElementById('btn-share-gift-tg')?.addEventListener('click', () => {
    if (!state.giftPass.lastPassUrl) return;
    openTelegramShare(
      state.giftPass.lastPassUrl,
      `🎟 Выбил в цеху «БОЧКИ» настоящий билет в кино на твоё имя (${state.giftPass.recipientName})! Подтверди номер и выбери кинотеатр по ссылке:`
    );
  });
  document.getElementById('btn-done-gift-pass')?.addEventListener('click', () => closeGoldenTicketForkModal());

  // Near-Miss модалка («До Премьеры остался один рывок!»)
  document.getElementById('btn-close-near-miss')?.addEventListener('click', async () => {
    document.getElementById('modal-near-miss')?.setAttribute('hidden', '');
    await finishPremiereRound(false, null);
  });
  document.getElementById('btn-near-miss-pack')?.addEventListener('click', () => {
    document.getElementById('modal-near-miss')?.setAttribute('hidden', '');
    stopAirTimer();
    state.round.running = false;
    showScreen('pack');
  });

  // Экран активации Подарочного билета (?gift=ID / startapp=gift_ID)
  document.getElementById('btn-verify-tg-contact')?.addEventListener('click', () => handleVerifyPassContactClick());
  document.getElementById('btn-refresh-tg-contact')?.addEventListener('click', () => handleRefreshPassContactClick());
  document.getElementById('btn-accept-gift-pass')?.addEventListener('click', () => handleAcceptIncomingPass());
  document.getElementById('btn-copy-pass-code')?.addEventListener('click', async () => {
    const code = document.getElementById('pass-ticket-code')?.value || '';
    if (!code) return;
    await copyToClipboard(code);
    showToast(t('copiedToast'));
  });
  document.getElementById('btn-pass-go-workshop')?.addEventListener('click', async () => {
    await audio.unlock(true);
    refreshSoundButtonLabel();
    showScreen('modeA');
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
    await grantShareLifeOnceForCurrentBarrel();
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
    if (res !== 'aborted') {
      await grantShareLifeOnceForCurrentBarrel();
    }
    if (res === 'copied') showToast(t('copiedToast'));
  });

  document.getElementById('btn-share-tg')?.addEventListener('click', async () => {
    if (!state.pack.lastShareUrl) return;
    const msg = document.getElementById('input-custom-phrase')?.value || '';
    openTelegramShare(
      state.pack.lastShareUrl,
      `🛢 Кто-то заварил тебя в цеху «БОЧКИ»! Надень наушники — 3 попытки и 30 сек воздуха: «${msg}»`
    );
    await grantShareLifeOnceForCurrentBarrel();
  });

  document.getElementById('btn-pack-go-premiere')?.addEventListener('click', async () => {
    await audio.unlock(true);
    refreshSoundButtonLabel();
    startPremiereRaceRound();
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

  // Экран 5: Финал раунда и Суперигра «Гонка за Премьерой»
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
    startPremiereRaceRound();
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
    recordFunnelEvent('kp_clicks', state.tg?.user).catch(() => {});
    const bonus = await claimSocialOrPromoBonus(state.tg?.user, 'kp_clicked', 'kp').catch(() => null);
    if (bonus?.pointsAdded > 0) {
      state.profile.premierePoints = bonus.premierePoints;
      updatePremiereBarsUI();
    }
    await refreshQuestUI();
    openExternalLink(ENV.kinopoiskUrl);
  };
  document.getElementById('quest-btn-kp')?.addEventListener('click', goKinopoiskAction);
  document.getElementById('btn-modal-kinopoisk')?.addEventListener('click', goKinopoiskAction);

  document.getElementById('btn-close-trailer')?.addEventListener('click', () => closeTrailerModal());
  document.getElementById('btn-modal-calendar')?.addEventListener('click', () => downloadPremiereCalendarICS());

  // =========================================================================
  // v5.0: СТОЛ «НА СЧЁТ ТРИ!», ПОДГЛЯДЫВАНИЕ, СОЦСЕТИ, ТРЕЙЛЕР И РЕЙТИНГ ТОП-10
  // =========================================================================
  document.getElementById('btn-mode-a-duel')?.addEventListener('click', () => openDuelTable());
  document.getElementById('btn-mode-a-share-hub')?.addEventListener('click', () => openShareHubModal('trailer'));
  document.getElementById('btn-hud-leaderboard')?.addEventListener('click', () => openLeaderboardModal());

  // Панель живого наблюдения за другом (?startapp=watch_<barrelId>)
  document.getElementById('btn-watch-rattle')?.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastWatchRattleAt < 2900) {
      showToast('Перезарядка цепей (раз в 3 секунды)!');
      return;
    }
    lastWatchRattleAt = now;
    audio.playChainRattle(1.0);
    scene.triggerScreamerShake(0.35);
    Haptics.heavy();
    state.watchChannel?.send('rattle', {
      senderName: state.tg?.user?.name || 'Автор бочки',
    });
    showToast('⛓ Ты погремел цепями в наушниках друга!');
  });

  document.getElementById('btn-watch-challenge')?.addEventListener('click', async () => {
    const roomId = `r_${state.watchingBarrelId || Math.random().toString(36).slice(2, 7)}`;
    closeActiveWatchChannel();
    await openDuelTable(roomId);
    await shareCurrentDuelRoom();
  });

  document.getElementById('btn-watch-exit')?.addEventListener('click', () => {
    closeActiveWatchChannel();
    showScreen('modeA');
  });

  // Мульти-шеринг на экране упаковки бочки
  document.getElementById('btn-pack-share-wa')?.addEventListener('click', () => triggerMultiSocialShare('wa', 'barrel'));
  document.getElementById('btn-pack-share-vk')?.addEventListener('click', () => triggerMultiSocialShare('vk', 'barrel'));
  document.getElementById('btn-pack-share-ig')?.addEventListener('click', () => triggerMultiSocialShare('ig', 'barrel'));
  document.getElementById('btn-pack-open-share-hub')?.addEventListener('click', () => openShareHubModal('trailer'));

  // Триггер Б: 3 реактивные кнопки ответа другу на Финале
  document.querySelectorAll('.js-finale-reaction').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-reaction') || 'cinema';
      handleFinaleFriendReaction(type);
    });
  });

  document.getElementById('btn-finale-open-duel')?.addEventListener('click', () => openDuelTable());
  document.getElementById('btn-finale-share-hub')?.addEventListener('click', () => openShareHubModal('trailer'));
  document.getElementById('btn-finale-leaderboard')?.addEventListener('click', () => openLeaderboardModal());

  // Кнопки ТОП-10 и мульти-шеринга внутри Near-Miss и Трейлера
  document.getElementById('btn-near-miss-leaderboard')?.addEventListener('click', () => {
    document.getElementById('modal-near-miss')?.setAttribute('hidden', '');
    openLeaderboardModal();
  });
  document.getElementById('btn-near-miss-share-hub')?.addEventListener('click', () => {
    document.getElementById('modal-near-miss')?.setAttribute('hidden', '');
    openShareHubModal('trailer');
  });
  document.getElementById('btn-trailer-share-hub')?.addEventListener('click', () => {
    closeTrailerModal();
    openShareHubModal('trailer');
  });

  // Синхронный стол 2–3 игроков «НА СЧЁТ ТРИ!»
  document.getElementById('btn-duel-close')?.addEventListener('click', () => duelCtrl?.leaveRoom(true));
  document.getElementById('btn-duel-add-bot')?.addEventListener('click', () => duelCtrl?.addSandboxBot());
  document.getElementById('btn-duel-invite-third')?.addEventListener('click', () => shareCurrentDuelRoom());
  document.getElementById('btn-duel-start-go')?.addEventListener('click', () => {
    duelCtrl?.hostInitiateRound({ isFreeRerack: false });
  });
  document.getElementById('btn-duel-rattle-chains')?.addEventListener('click', () => {
    duelCtrl?.triggerSpectatorChainRattle();
  });
  document.getElementById('btn-duel-rematch')?.addEventListener('click', () => {
    duelCtrl?.hostInitiateRound({ isFreeRerack: false });
  });
  document.getElementById('btn-duel-invite-lives')?.addEventListener('click', () => {
    duelCtrl?.leaveRoom(false);
    showScreen('pack');
  });

  // Модалка перехвата повторной ссылки (ШАГ 8.1)
  document.getElementById('btn-close-repeat-duel')?.addEventListener('click', () => {
    document.getElementById('modal-repeat-duel')?.setAttribute('hidden', '');
  });
  document.getElementById('btn-repeat-accept-duel')?.addEventListener('click', async () => {
    document.getElementById('modal-repeat-duel')?.setAttribute('hidden', '');
    const pending = state.repeatRoutePending;
    state.repeatRoutePending = null;
    const roomId = pending?.routing?.suggestedRoomId || `d_${Math.random().toString(36).slice(2, 8)}`;
    if (pending?.routing?.senderTgId) {
      sendDuelChallengePush({
        targetTgId: pending.routing.senderTgId,
        challengerName: state.tg?.user?.name || '',
        roomId,
      }).catch(() => {});
    }
    await openDuelTable(roomId);
  });
  document.getElementById('btn-repeat-open-solo')?.addEventListener('click', async () => {
    document.getElementById('modal-repeat-duel')?.setAttribute('hidden', '');
    const pending = state.repeatRoutePending;
    state.repeatRoutePending = null;
    if (pending?.pack) {
      await startViralFriendRound(pending.pack);
    }
  });

  // Модалка «🏆 Рейтинг ТОП-10 на закрытую Премьеру»
  document.getElementById('btn-close-leaderboard')?.addEventListener('click', () => {
    document.getElementById('modal-leaderboard')?.setAttribute('hidden', '');
  });
  document.getElementById('btn-leader-go-share')?.addEventListener('click', () => {
    document.getElementById('modal-leaderboard')?.setAttribute('hidden', '');
    openShareHubModal('trailer');
  });
  document.getElementById('btn-leader-go-duel')?.addEventListener('click', () => {
    document.getElementById('modal-leaderboard')?.setAttribute('hidden', '');
    openDuelTable();
  });

  // Модалка Мульти-Шеринга (Бочка + Трейлер во все соцсети)
  document.getElementById('btn-close-share-hub')?.addEventListener('click', () => {
    document.getElementById('modal-share-hub')?.setAttribute('hidden', '');
  });
  document.getElementById('tab-share-kind-trailer')?.addEventListener('click', () => {
    state.shareHubKind = 'trailer';
    syncShareHubUrl();
    Haptics.light();
  });
  document.getElementById('tab-share-kind-barrel')?.addEventListener('click', () => {
    if (!state.pack.lastShareUrl) {
      document.getElementById('modal-share-hub')?.setAttribute('hidden', '');
      showScreen('pack');
      showToast('Завари бочку с фото или голосом друга, чтобы получить персональную ссылку!');
      return;
    }
    state.shareHubKind = 'barrel';
    syncShareHubUrl();
    Haptics.light();
  });
  document.getElementById('btn-share-hub-copy')?.addEventListener('click', () => {
    triggerMultiSocialShare('copy', state.shareHubKind);
  });
  document.querySelectorAll('[data-social-platform]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const platform = btn.getAttribute('data-social-platform') || 'tg';
      triggerMultiSocialShare(platform, state.shareHubKind);
    });
  });
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
