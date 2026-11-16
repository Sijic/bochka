import { ENV, resolveSiteAsset } from './env.js';
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
  getStoredUiStage,
  computeEffectiveUiStage,
  syncUiStage,
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
  fetchPublicRaffleTransparency,
  getPlayerRecoveryCode,
  restoreProfileByRecoveryCode,
  recordTrafficSource,
} from './backend.js';
import { WorkshopDuelController, createBarrelWatchChannel } from './duel.js';
import { mountTestBogHUD } from './testbog.js';

const AIR_DURATION_SEC = 30.0;
const KP_MIN_AWAY_SEC = 3.5;
const TRAILER_UNLOCK_SEC = 40.0;
const STALE_YT_IDS = new Set(['EZFDcXeLTzQ', 'vAJpT_82uUo']);
const OFFICIAL_YT_TRAILER_ID = (ENV.youtubeFallbackId && !STALE_YT_IDS.has(ENV.youtubeFallbackId))
  ? ENV.youtubeFallbackId
  : 'OmyqxUXmqNY';
const OFFICIAL_YT_WATCH_URL = `https://www.youtube.com/watch?v=${OFFICIAL_YT_TRAILER_ID}`;

const SCREAMER_META = [
  { key: 'steam', i18n: 'screamerHand' },
  { key: 'valve', i18n: 'screamerPastor' },
  { key: 'rust', i18n: 'screamerFather' },
  { key: 'arc', i18n: 'screamerBlogger' },
];

const VOICE_PROMPT_PACKS = [
  [
    '🗣 «Брат, я во второй слева, клянусь!»',
    '🗣 «Не бей по ржавой — там пар!»',
    '🗣 «Слушай дыхание у самого дна...»',
  ],
  [
    '🗣 «Стучу ключом по ободу, слышишь?!»',
    '🗣 «Крышка №19 пустая, ищи правее!»',
    '🗣 «Кислород кончается, бей с размаху!»',
  ],
  [
    '🗣 «В котельной эхо, слушай паузу!»',
    '🗣 «Тут заварено наглухо, давай ломом!»',
    '🗣 «На небе только и разговоров, что о море...»',
  ],
];

const state = {
  tg: null,
  entered: false,
  activeScreen: 'gate',
  uiStage: 1,
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
    packedCount: 0,
    friendsBrought: 0,
    duelsPlayed: 0,
    duelsWon: 0,
    uiStage: 1,
    temuSurgeClaimed: false,
    hasSocialConnection: false,
    repeatLinkEntered: false,
  },

  blitzCooldownUntil: 0,
  lastBlitzDailyPoints: 0,
  lastBlitzDailyCap: 2000,
  blitzTimerId: null,

  // Состояние текущего раунда в цеху ('demo' | 'viral' | 'premiere')
  round: {
    modeType: 'demo',
    isDemo: true,
    zoneId: 1,
    barrelCount: 3,
    workshopLevel: 1,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex: 0,
    steamHazardIndex: -1,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: false,
    dailyShiftCode: '',
    startedAtMs: 0,
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
    useBarrelFilter: true,
    screamerType: 'weld',
    victimCardDataUrl: '',
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
  voicePromptCursor: 0,

  // Сверка отметки «Буду смотреть» по отсутствию на вкладке >= 3.5 сек (+ 4.5 сек фоллбэк WebView)
  kpSync: {
    waiting: false,
    leftTab: false,
    departedAt: 0,
    verified: false,
    fallbackTimer: null,
  },

  // Плеер трейлера: напрямую официальный YouTube (@kinoceh_bel · OmyqxUXmqNY)
  trailer: {
    modalOpen: false,
    forRescue: false,
    muted: false,
    maxTime: 0,
    unlocked40: false,
    usingYtFallback: true,
    ytReady: false,
    ytTimer: null,
    ytWatchedSec: 0,
    ytBootWatchdog: null,
    ytStallWatchdog: null,
    ytAutoplayRetry: null,
    ytStartedPlaying: false,
    ytBlockedInSession: false,
    externalRescueDepartedAt: 0,
    rescueSafetyTimer: null,
  },

  // Синхронизация внешних переходов на лайки YouTube / Instagram (@kinoceh_bel)
  externalLikeSync: {
    active: false,
    platform: '',
    departedAt: 0,
    leftTab: false,
    fallbackTimer: null,
  },

  // Состояние конструктора пранка (Экран 4)
  pack: {
    mode: 'friend',
    frameStyle: 'flashlight',
    screamerType: 'weld',
    zoneId: 1,
    targetBarrelIndex: -1,
    useBarrelFilter: true,
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

function getFactoryZoneSpecByZoneId(rawZoneId = 1) {
  const z = Math.max(1, Math.min(4, Math.round(Number(rawZoneId || 1))));
  if (z === 1) {
    return {
      zoneId: 1,
      barrelCount: 3,
      airSec: 30.0,
      hasSteamHazard: false,
      numbersObscured: false,
      canMicBlow: false,
      zoneTitle: t('zone1Name') || 'УР.1 · РАЗГРУЗОЧНЫЙ ШЛЮЗ',
    };
  }
  if (z === 2) {
    return {
      zoneId: 2,
      barrelCount: 6,
      airSec: 28.0,
      hasSteamHazard: true,
      numbersObscured: false,
      canMicBlow: false,
      zoneTitle: t('zone2Name') || 'УР.2 · СБОРОЧНЫЙ КОНВЕЙЕР',
    };
  }
  if (z === 3) {
    return {
      zoneId: 3,
      barrelCount: 9,
      airSec: 27.0,
      hasSteamHazard: false,
      numbersObscured: false,
      canMicBlow: false,
      zoneTitle: t('zone3Name') || 'УР.3 · ЗАТОПЛЕННАЯ КОТЕЛЬНАЯ',
    };
  }
  return {
    zoneId: 4,
    barrelCount: 12,
    airSec: 26.0,
    hasSteamHazard: false,
    numbersObscured: true,
    canMicBlow: true,
    zoneTitle: t('zone4Name') || 'УР.4 · ПРЕСС-ЦЕХ (19·97)',
  };
}

function getWorkshopLevelSpec(rawLevel = 1) {
  const level = Math.max(1, Math.round(Number(rawLevel || 1)));
  if (level === 1) {
    const z = getFactoryZoneSpecByZoneId(1);
    return { level, ...z, isBlitz: false };
  }
  if (level === 2) {
    const z = getFactoryZoneSpecByZoneId(2);
    return { level, ...z, isBlitz: false };
  }
  if (level === 3) {
    const z = getFactoryZoneSpecByZoneId(3);
    return { level, ...z, isBlitz: false };
  }
  const z4 = getFactoryZoneSpecByZoneId(4);
  if (level <= 7) {
    return {
      level,
      ...z4,
      isBlitz: false,
      airSec: Math.max(24.0, 29.0 - level * 0.6),
    };
  }
  return {
    level,
    ...z4,
    isBlitz: true,
    airSec: 25.0,
  };
}

function formatBarrelWord(n) {
  if (n >= 5) return 'БОЧЕК';
  if (n >= 2) return 'БОЧКИ';
  return 'БОЧКА';
}

function applyProgressiveDisclosureUI({ forceStage = null, skipPromoteFromSocial = false } = {}) {
  const temuModal = document.getElementById('modal-temu-unlock');
  const temuOpen = Boolean(temuModal && !temuModal.hasAttribute('hidden'));

  let nextStage =
    forceStage != null
      ? Number(forceStage)
      : computeEffectiveUiStage(state.profile, getQuestState(), {
          hasDuelParam: Boolean(state.tg?.duelRoomParam),
          routing: state.repeatRoutePending?.routing,
        });

  if ((skipPromoteFromSocial || temuOpen) && (state.uiStage <= 3 || nextStage > 3)) {
    if (nextStage > 3 && Number(state.profile?.duelsPlayed || 0) === 0 && !state.tg?.duelRoomParam) {
      nextStage = Math.min(nextStage, 3);
    }
  }

  nextStage = Math.min(4, Math.max(1, Math.round(nextStage || 1)));
  state.uiStage = nextStage;
  if (state.profile) {
    state.profile.uiStage = nextStage;
  }

  document.body.setAttribute('data-ui-stage', String(nextStage));
  const blitzUnlocked = Number(state.profile?.currentLevel || 1) >= 8;
  document.body.setAttribute('data-blitz-unlocked', blitzUnlocked ? '1' : '0');

  const topPctEl = document.getElementById('top-premiere-pct');
  if (topPctEl) {
    topPctEl.textContent = `${Number(state.profile?.premiereScore || 0).toFixed(1)}%`;
  }
  const topLivesEl = document.getElementById('top-lives-count');
  if (topLivesEl) {
    topLivesEl.textContent = String(Math.max(0, Number(state.profile?.lives ?? 0)));
  }

  if (nextStage <= 2 && state.activeScreen === 'workshop' && !state.watchingBarrelId) {
    const titleEl = document.getElementById('hud-urgent-title');
    if (titleEl) titleEl.textContent = t('stage1TaskLine');
  }

  const packRevengeBtn = document.getElementById('btn-pack-revenge');
  const packRevengeText = document.getElementById('btn-pack-revenge-text');
  if (packRevengeBtn) {
    packRevengeBtn.classList.toggle('btn-temu-pulse', nextStage <= 2);
  }
  if (packRevengeText) {
    packRevengeText.textContent = nextStage <= 2 ? t('stage2PackBonusBtn') : t('btnPackBack');
  }
}

function openBurgerDrawer() {
  document.getElementById('burger-backdrop')?.removeAttribute('hidden');
  document.getElementById('burger-drawer')?.removeAttribute('hidden');
  document.getElementById('btn-burger-menu')?.setAttribute('aria-expanded', 'true');
}

function closeBurgerDrawer() {
  document.getElementById('burger-backdrop')?.setAttribute('hidden', '');
  document.getElementById('burger-drawer')?.setAttribute('hidden', '');
  document.getElementById('btn-burger-menu')?.setAttribute('aria-expanded', 'false');
}

function toggleBurgerDrawer() {
  const drawer = document.getElementById('burger-drawer');
  if (!drawer) return;
  if (drawer.hasAttribute('hidden')) openBurgerDrawer();
  else closeBurgerDrawer();
}

function openTemuUnlockModal(targetScore = 72.0) {
  const modal = document.getElementById('modal-temu-unlock');
  const numEl = document.getElementById('temu-unlock-score-num');
  const fillEl = document.getElementById('temu-unlock-bar-fill');
  if (!modal || !numEl || !fillEl) return;

  const target = Math.max(72.0, Math.min(100, Number(targetScore || 72.0)));
  numEl.textContent = '0.0';
  fillEl.style.transition = 'none';
  fillEl.style.width = '0%';
  modal.removeAttribute('hidden');

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      fillEl.style.transition = 'width 1.15s cubic-bezier(0.22, 1, 0.36, 1)';
      fillEl.style.width = `${target.toFixed(1)}%`;
    });
  });

  const startedAt = performance.now();
  const durationMs = 1100;
  const tick = (now) => {
    const p = Math.min(1, (now - startedAt) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    numEl.textContent = (target * eased).toFixed(1);
    if (p < 1) {
      window.requestAnimationFrame(tick);
    } else {
      numEl.textContent = target.toFixed(1);
    }
  };
  window.requestAnimationFrame(tick);
  Haptics.success();
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
  state.uiStage = getStoredUiStage();
  applyProgressiveDisclosureUI({ forceStage: state.uiStage });

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
    renderVoicePromptChips();
    refreshSoundButtonLabel();
    refreshQuestUI();
    syncExternalLikeButtonsUI();
    applyProgressiveDisclosureUI();
    scene?.setWallQuoteText?.(t('wallSeaQuote'));
  });

  if (typeof window !== 'undefined') {
    window.__bochkaDebug = {
      getState: () => state,
      getScene: () => scene,
      getZoneState: () => scene?.getZoneState?.() || null,
      setZoneLevel: async (lvl) => {
        state.entered = true;
        state.profile.currentLevel = lvl;
        await startDemoRound();
        return scene?.getZoneState?.() || null;
      },
      triggerMicBlow: () => triggerWorkshopMicBlow(),
      startDailyShift: () => startDailyShiftRound(),
      getSpoilerReport: () => buildSpoilerFreeReport(),
      setLang: (l) => setLang(l),
      strikeBarrel: (idx) => {
        const b = scene?.barrels?.[idx];
        return handleBarrelStrike(idx, b ? b.group.position.clone() : null);
      },
      getRecoveryCode: () => getPlayerRecoveryCode(state.tg?.user),
      restoreByCode: (code) => restoreProfileByRecoveryCode(code, state.tg?.user),
      hoverBarrel: (idx) => handleBarrelHover(idx, 200, 200, false),
      openPassScreen: (id) => openIncomingPassScreen(id),
      triggerScreamer: (v) => triggerMiniScreamer(v),
    };
  }

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

  if (state.tg.user?.photoUrl) {
    document.getElementById('btn-tg-avatar')?.removeAttribute('hidden');
  }
  if (state.tg.user?.name) {
    const senderInput = document.getElementById('input-sender-name');
    if (senderInput) senderInput.value = state.tg.user.name;
  }

  initVoiceRecorderInstance();
  initVisibilityAndAntiSeekGuards();
  prewarmYouTubeTrailerPlayer();
  bindUIEvents();
  document.getElementById('btn-enter-sound')?.removeAttribute('disabled');
  document.getElementById('btn-enter-mute')?.removeAttribute('disabled');
  await initPackConstructorDefaults();

  state.profile = await fetchPlayerProfile(state.tg?.user);
  if (state.tg?.trafficSource) {
    state.profile.trafficSource = state.tg.trafficSource;
    recordTrafficSource(state.tg?.user, state.tg.trafficSource).catch(() => {});
  }
  if (state.tg?.duelRoomParam) {
    await syncUiStage(state.tg?.user, 4);
    applyProgressiveDisclosureUI({ forceStage: 4 });
  } else {
    applyProgressiveDisclosureUI();
  }
  updatePremiereBarsUI();
  await refreshQuestUI();
  initLiveFriendFeedbackMonitor();

  // Автооткрытие трейлера по прямой ссылке (?trailer=1&ref=...)
  if (state.tg.trailerAutoOpen) {
    openTrailerModal({ forRescue: false });
  }

  // Единый разбор входящего трафика (Deep Links: gift_ / duel_ / pack_)
  if (state.incomingPassId) {
    await openIncomingPassScreen(state.incomingPassId);
  } else if (state.tg?.duelRoomParam) {
    state.entered = true;
    await openDuelTable(state.tg.duelRoomParam);
  } else if (state.tg?.autoOpenPack && state.incomingParam) {
    await enterWorkshopGate(false);
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
        applyProgressiveDisclosureUI();
        updatePremiereBarsUI();
      },
      setStage: async (stageNum) => {
        const sNum = Math.min(4, Math.max(1, Math.round(Number(stageNum) || 1)));
        document.querySelectorAll('.modal-backdrop').forEach((m) => m.setAttribute('hidden', ''));
        closeBurgerDrawer();
        if (sNum <= 2 && isTestBogSessionActive()) {
          try {
            const rawQ = sessionStorage.getItem('tbog_bochka_v2_quest');
            if (rawQ) {
              const parsedQ = JSON.parse(rawQ);
              parsedQ.packedCount = 0;
              parsedQ.friendsOpened = 0;
              sessionStorage.setItem('tbog_bochka_v2_quest', JSON.stringify(parsedQ));
            }
          } catch { /* ignore */ }
        }
        const patch =
          sNum === 1
            ? {
                uiStage: 1,
                temuSurgeClaimed: false,
                packedCount: 0,
                premiereScore: 0,
                hasSocialConnection: false,
                duelsPlayed: 0,
                friendsBrought: 0,
              }
            : sNum === 2
              ? {
                  uiStage: 2,
                  temuSurgeClaimed: false,
                  packedCount: 0,
                  hasSocialConnection: false,
                  duelsPlayed: 0,
                  friendsBrought: 0,
                }
              : sNum === 3
                ? {
                    uiStage: 3,
                    temuSurgeClaimed: true,
                    packedCount: Math.max(1, Number(state.profile.packedCount || 0)),
                    premiereScore: Math.max(72.0, Number(state.profile.premiereScore || 0)),
                    hasSocialConnection: false,
                    duelsPlayed: 0,
                    friendsBrought: 0,
                  }
                : {
                    uiStage: 4,
                    temuSurgeClaimed: true,
                    packedCount: Math.max(1, Number(state.profile.packedCount || 0)),
                    premiereScore: Math.max(72.0, Number(state.profile.premiereScore || 0)),
                    hasSocialConnection: true,
                  };
        await syncUiStage(null, sNum, { force: true });
        state.profile = patchTestBogProfile(patch);
        applyProgressiveDisclosureUI({ forceStage: sNum, skipPromoteFromSocial: sNum === 3 });
        updatePremiereBarsUI();
        if (sNum >= 4 && state.activeScreen === 'pack') {
          refreshPackFriendsStrip();
        }
        showToast(`🎚 UI Стадия ${sNum} включена (Sandbox)`);
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

        if (target === 'demo' || target === 'zone1') {
          state.profile = patchTestBogProfile({ currentLevel: 1 });
          updatePremiereBarsUI();
          await startDemoRound();
        } else if (target === 'zone2') {
          state.profile = patchTestBogProfile({ currentLevel: 2 });
          updatePremiereBarsUI();
          await startDemoRound();
        } else if (target === 'zone3') {
          state.profile = patchTestBogProfile({ currentLevel: 3 });
          updatePremiereBarsUI();
          await startDemoRound();
        } else if (target === 'zone4' || target === 'level8') {
          state.profile = patchTestBogProfile({ currentLevel: 4 });
          updatePremiereBarsUI();
          await startDemoRound();
        } else if (target === 'blitz') {
          state.profile = patchTestBogProfile({ currentLevel: 8 });
          applyProgressiveDisclosureUI();
          updatePremiereBarsUI();
          await startDemoRound();
        } else if (target === 'temu88') {
          await syncUiStage(null, 3, { force: true });
          state.profile = patchTestBogProfile({
            uiStage: 3,
            temuSurgeClaimed: true,
            packedCount: Math.max(1, Number(state.profile.packedCount || 0)),
            premiereScore: 72.0,
            hasSocialConnection: false,
            duelsPlayed: 0,
            friendsBrought: 0,
          });
          applyProgressiveDisclosureUI({ forceStage: 3, skipPromoteFromSocial: true });
          updatePremiereBarsUI();
          if (state.activeScreen === 'gate') showScreen('pack');
          openTemuUnlockModal(72.0);
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
  closeBurgerDrawer();
  if (!document.getElementById('modal-trailer')?.hasAttribute('hidden')) {
    closeTrailerModal();
  }
  for (const mid of ['modal-leaderboard', 'modal-share-hub', 'modal-prize', 'modal-rules']) {
    document.getElementById(mid)?.setAttribute('hidden', '');
  }
  document.getElementById('topbar')?.toggleAttribute('hidden', name === 'gate');
  document.getElementById('nav-workshop')?.classList.toggle('is-active', name === 'workshop' || name === 'modeA');
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
    document.getElementById('hud-mic-blow-box')?.setAttribute('hidden', '');
    closeActiveWatchChannel();
    audio.stopListening();
    audio.stopMuffledVoiceLoop();
    audio.stopMicBlowDetector?.();
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
    await syncUiStage(state.tg?.user, 4);
    applyProgressiveDisclosureUI({ forceStage: 4 });
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
      state.profile.repeatLinkEntered = true;
      await syncUiStage(state.tg?.user, 4);
      applyProgressiveDisclosureUI({ forceStage: 4 });
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
    await startNewbieOnboardingRound();
  }
}

function pickNextBarrelHeavenQuote() {
  const pool = t('barrelHeavenQuotes');
  const fallbackPool = [
    'На небе только и разговоров, что о бочке… Увидимся на премьере 17 декабря.',
    'На небе только и разговоров, что о бочке — и о том, кто в ней заперт.',
    'На небе только и разговоров, что о бочке и нашей премьере 17 декабря.',
    'На небе только и разговоров, что о бочке… и о тех, кто сорвал крышку с третьей попытки.',
    'На небе только и разговоров, что о бочке — глупо не закатать в неё лучшего друга.',
    'На небе только и разговоров, что о бочке, ржавой стали и 30 секундах кислорода.',
    'На небе только и разговоров, что о бочке… Слышишь стук? Встречаемся в кино 17 декабря.',
    'На небе только и разговоров, что о бочке — и о том, как грохочет лом в темноте цеха.',
  ];
  const quotes = Array.isArray(pool) && pool.length ? pool : fallbackPool;
  let cursor = 0;
  try {
    const raw = Number.parseInt(localStorage.getItem('bochka_quote_cursor') || '0', 10);
    cursor = Number.isFinite(raw) ? raw : 0;
    localStorage.setItem('bochka_quote_cursor', String((cursor + 1) % quotes.length));
  } catch {
    cursor = Math.floor(Math.random() * quotes.length);
  }
  return quotes[Math.abs(cursor) % quotes.length];
}

async function startNewbieOnboardingRound() {
  const demoChars = t('demoChars');
  const pickIdx = Math.floor(Math.random() * DEMO_PORTRAITS.length);
  const charMeta = Array.isArray(demoChars) && demoChars[pickIdx]
    ? demoChars[pickIdx]
    : { name: 'УЗНИК ЦЕХА', quote: pickNextBarrelHeavenQuote() };

  const rawPortrait = DEMO_PORTRAITS[pickIdx] || DEMO_PORTRAITS[0];
  const targetIndex = 3;

  audio.setSenderVoiceUrl('');

  state.round = {
    modeType: 'viral',
    isDemo: true,
    zoneId: 1,
    barrelCount: 4,
    workshopLevel: 1,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex,
    steamHazardIndex: -1,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: false,
    dailyShiftCode: '',
    startedAtMs: performance.now(),
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
    portraitDataUrl: rawPortrait,
    voiceUrl: '',
    useBarrelFilter: true,
    message: pickNextBarrelHeavenQuote(),
    senderLabel: charMeta.name,
    lastUrgentSec: 9,
  };

  const tagEl = document.getElementById('hud-mode-tag');
  if (tagEl) tagEl.textContent = 'НАЙДИ ЧЕЛОВЕКА В БОЧКЕ // 4 БОЧКИ · 3 ПОПЫТКИ';
  const titleEl = document.getElementById('hud-urgent-title');
  if (titleEl) titleEl.textContent = t('stage1TaskLine');
  document.getElementById('btn-hud-pack')?.setAttribute('hidden', '');
  document.getElementById('hud-premiere-strip')?.setAttribute('hidden', '');
  configureBottomAttemptsMode('squares');

  launchWorkshopGameplay(false);

  processPortraitToWebP(rawPortrait, 'flashlight')
    .then((graded) => {
      if (graded?.dataUrl && state.round.isDemo) {
        state.round.portraitDataUrl = graded.dataUrl;
        scene?.setTargetPortrait?.(state.round.targetIndex, graded.dataUrl);
      }
    })
    .catch(() => {});
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

  let steamHazardIndex = -1;
  if (spec.hasSteamHazard) {
    const hazardPool = pool.filter((idx) => idx !== targetIndex);
    steamHazardIndex = hazardPool.length ? hazardPool[Math.floor(Math.random() * hazardPool.length)] : -1;
  }

  await audio.setSenderVoiceUrl('');

  state.round = {
    modeType: 'demo',
    isDemo: true,
    zoneId: spec.zoneId,
    barrelCount: spec.barrelCount,
    workshopLevel: spec.level,
    isBlitz: spec.isBlitz,
    blitzTargetsCleared: 0,
    targetIndex,
    steamHazardIndex,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: false,
    dailyShiftCode: '',
    startedAtMs: performance.now(),
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
    useBarrelFilter: true,
    message: charMeta.quote,
    senderLabel: charMeta.name,
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = spec.isBlitz
    ? `${spec.zoneTitle} // ⚡ БЛИЦ 12 БОЧЕК`
    : `${spec.zoneTitle} // ${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)}`;
  document.getElementById('hud-urgent-title').textContent = spec.isBlitz
    ? 'БЛИЦ В ПРЕСС-ЦЕХУ: НАХОДИ ЖИВЫЕ БОЧКИ ПОДРЯД (+3.5 СЕК И КОМБО ⭐)!'
    : spec.zoneId === 2
      ? `КОНВЕЙЕР (${spec.barrelCount} БОЧЕК): ОСТОРОЖНО, ТРУБА С ПАРОМ ОТНИМАЕТ −4 СЕК O₂!`
      : spec.zoneId === 3
        ? `ЗАТОПЛЕННАЯ КОТЕЛЬНАЯ (${spec.barrelCount} БОЧЕК): ГУЛКОЕ ЭХО И МИГАЮЩАЯ ТРЕВОГА!`
        : spec.zoneId === 4
          ? `ПРЕСС-ЦЕХ (${spec.barrelCount} БОЧЕК): ДУНЬ В МИКРОФОН 💨, ЧТОБЫ СДУТЬ ПАР С НОМЕРОВ (+4с O₂)!`
          : `НАЙДИ ЖИВУЮ БОЧКУ ИЗ ${spec.barrelCount} ПО СТУКУ ЗА 3 ПОПЫТКИ (+⭐ В ТОП-10)`;
  document.getElementById('btn-hud-pack')?.removeAttribute('hidden');
  document.getElementById('hud-premiere-strip')?.setAttribute('hidden', '');
  configureBottomAttemptsMode('squares');

  launchWorkshopGameplay(false);
}

async function startDailyShiftRound() {
  state.entered = true;
  await audio.unlock(true);
  refreshSoundButtonLabel();

  const now = new Date();
  const dateCode = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  let hash = 2166136261;
  for (let i = 0; i < dateCode.length; i++) {
    hash ^= dateCode.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = Math.abs(hash);
  const zoneId = (seed % 3) + 2; // Ур. 2, 3 или 4 для дневной смены
  const zoneSpec = getFactoryZoneSpecByZoneId(zoneId);
  const targetIndex = seed % zoneSpec.barrelCount;
  const steamHazardIndex = zoneId === 2 ? (targetIndex + 2) % zoneSpec.barrelCount : -1;

  const demoChars = t('demoChars');
  const pickIdx = seed % DEMO_PORTRAITS.length;
  const charMeta = Array.isArray(demoChars) && demoChars[pickIdx]
    ? demoChars[pickIdx]
    : { name: 'СМЕНА ДНЯ', quote: 'Единый расклад цеха на 24 часа!' };
  const graded = await processPortraitToWebP(DEMO_PORTRAITS[pickIdx], 'thermal');

  await audio.setSenderVoiceUrl('');

  state.round = {
    modeType: 'demo',
    isDemo: true,
    zoneId,
    barrelCount: zoneSpec.barrelCount,
    workshopLevel: zoneId,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex,
    steamHazardIndex,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: true,
    dailyShiftCode: dateCode,
    startedAtMs: performance.now(),
    attemptsLeft: 3,
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: zoneSpec.airSec,
    running: true,
    pausedForModal: false,
    pausedForOcean: false,
    strikeBusy: false,
    survived: false,
    reactionLocked: false,
    portraitDataUrl: graded.dataUrl,
    voiceUrl: '',
    useBarrelFilter: true,
    message: charMeta.quote,
    senderLabel: `📅 СМЕНА ДНЯ (${dateCode})`,
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = `📅 СМЕНА ДНЯ (${dateCode}) // ${zoneSpec.zoneTitle}`;
  document.getElementById('hud-urgent-title').textContent = `ЕДИНЫЙ РАСКЛАД НА 24 ЧАСА: ВСКРОЙ СВОЮ БОЧКУ ИЗ ${zoneSpec.barrelCount} И СРАВНИ ОТЧЁТ В ЧАТЕ!`;
  document.getElementById('btn-hud-pack')?.removeAttribute('hidden');
  document.getElementById('hud-premiere-strip')?.setAttribute('hidden', '');
  configureBottomAttemptsMode('squares');

  launchWorkshopGameplay(false);
}

async function startViralFriendRound(pack) {
  let portraitDataUrl = pack?.photoUrl || DEMO_PORTRAITS[0];

  const voiceUrl = pack?.voiceUrl || '';
  await audio.setSenderVoiceUrl(voiceUrl);

  const packZoneId = Math.max(1, Math.min(4, Number(pack?.zoneId || 1)));
  const zoneSpec = getFactoryZoneSpecByZoneId(packZoneId);
  const viralBarrelCount = Math.max(4, zoneSpec.barrelCount);

  const initialTarget =
    typeof pack?.targetIndex === 'number' && pack.targetIndex >= 0 && pack.targetIndex < viralBarrelCount
      ? pack.targetIndex
      : Math.floor(Math.random() * viralBarrelCount);

  const steamHazardIndex =
    packZoneId === 2 ? (initialTarget + 1) % viralBarrelCount : -1;

  state.round = {
    modeType: 'viral',
    isDemo: false,
    zoneId: packZoneId,
    barrelCount: viralBarrelCount,
    workshopLevel: packZoneId,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex: initialTarget,
    steamHazardIndex,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: false,
    dailyShiftCode: '',
    startedAtMs: performance.now(),
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
    useBarrelFilter: true,
    screamerType: pack?.screamerType || 'weld',
    victimCardDataUrl: '',
    message: pack?.message || t('presetsSelf')[0],
    senderLabel: pack?.senderName ? `${t('revealFromFriend')} · ${pack.senderName}` : t('revealFromFriend'),
    lastUrgentSec: 9,
  };

  if (!pack?.photoUrl) {
    processPortraitToWebP(null, pack?.frameStyle || 'flashlight')
      .then((fallbackGraded) => {
        if (fallbackGraded?.dataUrl) {
          state.round.portraitDataUrl = fallbackGraded.dataUrl;
          scene?.setTargetPortrait?.(state.round.targetIndex, fallbackGraded.dataUrl);
        }
      })
      .catch(() => {});
  }

  document.getElementById('hud-mode-tag').textContent = `${t('modeBTag')} // ${zoneSpec.zoneTitle}`;
  document.getElementById('hud-urgent-title').textContent = state.uiStage <= 2 ? t('stage1TaskLine') : t('modeBTitle');
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
    zoneId: 4,
    barrelCount: 6,
    workshopLevel: state.profile.currentLevel || 4,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex: Math.floor(Math.random() * 6),
    steamHazardIndex: -1,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: false,
    dailyShiftCode: '',
    startedAtMs: performance.now(),
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
    useBarrelFilter: true,
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
  for (const id of ['hud-premiere-lives', 'finale-premiere-lives', 'modal-premiere-lives', 'hud-lives-big-num', 'top-lives-count']) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(lives);
  }
  const topPctEl = document.getElementById('top-premiere-pct');
  if (topPctEl) topPctEl.textContent = `${scoreStr}%`;
  document.body.setAttribute('data-blitz-unlocked', Number(state.profile.currentLevel || 1) >= 8 ? '1' : '0');
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
      ? `⚡ УРОВЕНЬ ${spec.level} · БЛИЦ 12 БОЧЕК В ПРЕСС-ЦЕХУ (+⭐)`
      : `▶ ${spec.zoneTitle} · ${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)} (+⭐ В ТОП-10)`;
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

function triggerWorkshopMicBlow() {
  if (!state.round.running || state.round.micBlowUsed) return false;
  state.round.micBlowUsed = true;
  scene?.clearSteamFromBarrels?.();
  audio.playAirBlowWhoosh?.();
  audio.stopMicBlowDetector?.();

  state.round.airLeft = Math.min(35.0, (state.round.airLeft || 20.0) + 4.0);
  updateAirHUD(state.round.airLeft);

  const blowBtn = document.getElementById('btn-hud-mic-blow');
  const blowFill = document.getElementById('hud-mic-blow-fill');
  if (blowBtn) {
    blowBtn.disabled = true;
    blowBtn.textContent = t('micBlowDone') || '✓ ПАР СДУТ (+4 СЕК O₂)';
  }
  if (blowFill) blowFill.style.width = '100%';

  Haptics.success();
  showToast('💨 Пар сдут с номеров бочек! +4 сек кислорода O₂');
  return true;
}

function launchWorkshopGameplay(golden = false) {
  stopAirTimer();
  state.easterCombo = { stage: 0, lastAt: 0, knocks: 0 };
  if (!state.round.startedAtMs) state.round.startedAtMs = performance.now();
  if (!Array.isArray(state.round.strikeLog)) state.round.strikeLog = [];
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');
  renderAttemptSquares(state.round.attemptsLeft, state.round.isBlitz ? 5 : 3);
  updateAirHUD(state.round.airLeft);

  const zoneId = state.round.zoneId || 1;
  scene.resetRound({
    barrelCount: state.round.barrelCount || 3,
    targetIndex: state.round.targetIndex,
    portraitUrl: state.round.portraitDataUrl,
    golden,
  });
  scene.setWorkshopLevelDecor?.(state.round.workshopLevel || zoneId, state.round.modeType, {
    zoneId,
    steamHazardIndex: state.round.steamHazardIndex ?? -1,
    numbersObscured: zoneId === 4 && !state.round.micBlowUsed,
    wallQuoteText: t('wallSeaQuote'),
  });
  audio.setFactoryZoneAcoustics?.(zoneId);
  audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex);
  scene.setInteractive(true);
  scene.setClockUrgency?.({
    airActive: state.uiStage > 2 || zoneId >= 2,
    airLeft: state.round.airLeft,
    isBlitz: Boolean(state.round.isBlitz),
  });

  const micBox = document.getElementById('hud-mic-blow-box');
  const micBtn = document.getElementById('btn-hud-mic-blow');
  const micFill = document.getElementById('hud-mic-blow-fill');
  audio.stopMicBlowDetector?.();
  if (zoneId === 4 && state.round.modeType !== 'premiere') {
    micBox?.removeAttribute('hidden');
    if (micBtn) {
      micBtn.disabled = Boolean(state.round.micBlowUsed);
      micBtn.textContent = state.round.micBlowUsed
        ? (t('micBlowDone') || '✓ ПАР СДУТ (+4 СЕК O₂)')
        : (t('micBlowBtn') || '💨 ДУНЬ В МИКРОФОН / СДУТЬ ПАР (+4с O₂)');
    }
    if (micFill) micFill.style.width = state.round.micBlowUsed ? '100%' : '0%';
    if (!state.round.micBlowUsed) {
      audio.startMicBlowDetector?.({
        onLevel: (lvl) => {
          if (micFill && !state.round.micBlowUsed) {
            micFill.style.width = `${Math.round(lvl * 100)}%`;
          }
        },
        onBlow: () => {
          triggerWorkshopMicBlow();
        },
      });
    }
  } else {
    micBox?.setAttribute('hidden', '');
  }

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
  if (state.uiStage <= 2 && (state.round.zoneId || 1) === 1 && !state.round.isDailyShift) return;
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
    scene.setClockUrgency?.({
      airActive: true,
      airLeft: state.round.airLeft,
      isBlitz: Boolean(state.round.isBlitz),
    });

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
      popRemainingEmptyBarrelsDownTo(1);
      openRescueStep1();
      return;
    }
    if (r.rescueStage === 2) {
      popRemainingEmptyBarrelsDownTo(1);
      openRescueStep2();
      return;
    }
    if (r.rescueStage === 4) {
      const closed = getUnstruckBarrelIndices();
      const winIdx = closed[0] ?? r.targetIndex;
      r.targetIndex = winIdx;
      r.attemptsUsed = 4;
      finishRound(true, { diveBarrelIndex: winIdx, hitTarget: true });
      return;
    }
  }

  if (r.modeType === 'premiere') {
    finishPremiereRound(false, null);
    return;
  }

  // В режиме Блиц (Уровень 8+), если за время нашли хотя бы 1 живую бочку — уровень засчитывается как успешный с комбо-очками!
  if (r.isBlitz && r.blitzTargetsCleared > 0) {
    finishRound(true, { diveBarrelIndex: -1, hitTarget: false });
    return;
  }

  finishRound(false, { diveBarrelIndex: -1, hitTarget: false });
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
  scene?.setClockUrgency?.({ airActive: false, airLeft: state.round.airLeft, isBlitz: false });
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
  if (duelCtrl?.isActive || state.watchingBarrelId || state.uiStage <= 2) return false;
  if (
    state.round.modeType === 'viral' &&
    !alreadyStruck &&
    (state.round.rescueStage >= 4 || state.round.attemptsUsed >= 4) &&
    state.easterCombo.stage === 0
  ) {
    return false;
  }
  const now = performance.now();
  const c = state.easterCombo;
  const batchCode = BARREL_BATCH_CODES[index] || '';

  // Фаза 2: после 19 -> 97 ждём 3 быстрых повторных удара строго по УЖЕ ОТКРЫТОЙ бочке
  if (c.stage === 2) {
    if (!alreadyStruck) {
      state.easterCombo = { stage: 0, lastAt: 0, knocks: 0 };
      return false;
    }
    const winMs = c.knocks === 0 ? 2200 : 1400;
    if (now - c.lastAt <= winMs) {
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
    state.easterCombo = { stage: 0, lastAt: 0, knocks: 0 };
    return false;
  }

  // Фаза 1 -> 2: удар по бочке №97 сразу после бочки №19 (закрытую бочку не перехватываем)
  if (c.stage === 1 && now - c.lastAt <= 5500 && batchCode === '97') {
    state.easterCombo = { stage: 2, lastAt: now, knocks: 0 };
    if (alreadyStruck) {
      scene.triggerStrikeFX(index, worldPoint);
      audio.playStrike(index);
      Haptics.medium();
      return true;
    }
    return false;
  }

  // Старт комбинации: клик по бочке №19 (закрытая бочка всегда открывается как обычный удар)
  if (batchCode === '19') {
    state.easterCombo = { stage: 1, lastAt: now, knocks: 0 };
    if (alreadyStruck) {
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

  if (barrelImg) barrelImg.src = resolveSiteAsset('assets/keyed/ocean_barrel_closed.webp');
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

  if (barrelImg) barrelImg.src = resolveSiteAsset('assets/keyed/ocean_barrel_closed.webp');
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
    barrelImg.src = resolveSiteAsset('assets/keyed/ocean_barrel_arm.webp');
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
let lastSteamWarnAt = 0;

function handleBarrelHover(index, sx, sy, alreadyStruck) {
  const reticle = document.getElementById('barrel-reticle');
  const retId = document.getElementById('reticle-id');

  if (duelCtrl?.isActive || state.watchingBarrelId || !state.round.running || state.round.pausedForModal || index < 0) {
    reticle?.setAttribute('hidden', '');
    audio.stopListening();
    return;
  }

  const isSteamHazard =
    !alreadyStruck &&
    state.round.zoneId === 2 &&
    index === state.round.steamHazardIndex;

  if (isSteamHazard) {
    const now = performance.now();
    if (now - lastSteamWarnAt > 650) {
      lastSteamWarnAt = now;
      scene?.triggerGaugeHazardJitter?.();
      audio.playSteamWarningHiss?.();
    }
  }

  if (reticle && retId) {
    reticle.removeAttribute('hidden');
    reticle.style.left = `${Math.max(78, Math.min(window.innerWidth - 78, sx))}px`;
    reticle.style.top = `${Math.max(96, Math.min(window.innerHeight - 90, sy))}px`;
    const obscured = Boolean(scene?.numbersObscured && !state.round.micBlowUsed);
    const batchNum = obscured ? '?? [ПАР]' : (BARREL_BATCH_CODES[index] || `0${index + 1}`);
    const labelBase = `${t('reticleBatch')}${batchNum}`;
    retId.textContent = alreadyStruck
      ? `${labelBase} // ${t('reticleEmpty')}`
      : isSteamHazard
        ? `${labelBase} // ⚠️ ПАРОВАЯ ТРУБА (−4с O₂)`
        : `${labelBase} // ${t('reticleListening')}`;

    const showPulse =
      !alreadyStruck &&
      state.round.modeType !== 'premiere' &&
      !state.round.isBlitz &&
      Number(state.round.workshopLevel || 1) <= 2 &&
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
  if (!Array.isArray(r.strikeLog)) r.strikeLog = [];
  const elapsedSec = Math.max(0.4, (performance.now() - (r.startedAtMs || performance.now())) / 1000).toFixed(1);

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
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: 100/100 Премьера за ${elapsedSec} сек]`);
      finishPremiereRound(true, res);
      return;
    }

    // Исход Б: Выпала «Золотая бочка с чужим билетом» -> жёсткая вилка (Топка ×2 или Подарок с фейс-контролем)!
    if (res.outcome === 'golden_ticket') {
      scene.triggerEmptyBarrelOpen(index);
      audio.playLidBlowOff(true);
      r.pausedForModal = true;
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Золотая бочка]`);
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
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: +${res.delta}%]`);
      Haptics.success();
    } else {
      // Исход Г: Пустая бочка -> индустриальный выброс пара/искр
      scene.triggerEmptyBarrelOpen(index);
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пусто]`);
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
  // РЕЖИМ 2: 4 БОЧКИ · 3 ПОПЫТКИ МИМО -> ПРОСМОТР ТРЕЙЛЕРА -> 4-Й ПОБЕДНЫЙ УДАР!
  // -------------------------------------------------------------------------
  if (r.modeType === 'viral') {
    r.attemptsUsed += 1;

    // После просмотра трейлера (rescueStage >= 4 или 4-я попытка) игрок 100% угадывает оставшуюся 4-ю бочку!
    if (r.rescueStage >= 4 || r.attemptsUsed >= 4) {
      r.targetIndex = index;
      r.attemptsLeft = 0;
      renderAttemptSquares(0, 3);
      scene.assignTargetBarrelNow(index);
      scene.triggerStrikeFX(index, worldPoint);
      audio.playStrike(index);
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Спас за ${elapsedSec} сек]`);
      state.watchChannel?.send('strike', { barrelIndex: index, rescued: true, hitTarget: true });
      finishRound(true, { diveBarrelIndex: index, hitTarget: true });
      return;
    }

    // Первые 3 попытки (attemptsUsed = 1, 2, 3) угадать НЕВОЗМОЖНО — цель всегда переносится в закрытую бочку!
    const otherClosed = getUnstruckBarrelIndices().filter((i) => i !== index);
    if (otherClosed.length > 0 && index === r.targetIndex) {
      const nextTarget = otherClosed[Math.floor(Math.random() * otherClosed.length)];
      r.targetIndex = nextTarget;
      audio.setTargetIndex(nextTarget);
    }

    scene.triggerStrikeFX(index, worldPoint);
    scene.triggerEmptyBarrelOpen(index);
    audio.playStrike(index);

    if (index === r.steamHazardIndex) {
      r.airLeft = Math.max(0.5, r.airLeft - 4.0);
      updateAirHUD(r.airLeft);
      scene.triggerSteamHazardBurst?.(index);
      audio.playSteamPenaltyBurst?.();
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пар]`);
      showToast('⚠️ Пробитая труба с паром! −4 сек воздуха O₂');
    } else {
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пусто]`);
    }

    r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
    renderAttemptSquares(r.attemptsLeft, 3);
    state.watchChannel?.send('strike', { barrelIndex: index, attemptsLeft: r.attemptsLeft });

    if (r.attemptsLeft > 0) {
      triggerMiniScreamer(r.attemptsUsed - 1);
    } else {
      // После 3 промахов осталась ровно 1 закрытая (4-я) бочка -> открываем Трейлер!
      r.running = false;
      scene.setInteractive(false);
      triggerMiniScreamer(2);
      window.setTimeout(() => openRescueStep1(), 380);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // РЕЖИМ 3: ПРОГРЕССИЯ УРОВНЕЙ ЦЕХА (4 ЗОНЫ: 3, 6, 9, 12 БОЧЕК + БЛИЦ)
  // -------------------------------------------------------------------------
  scene.triggerStrikeFX(index, worldPoint);
  audio.playStrike(index);
  r.attemptsUsed += 1;

  if (index === r.targetIndex) {
    r.strikeLog.push(`[Удар ${r.attemptsUsed}: Спас за ${elapsedSec} сек]`);
    if (r.isBlitz) {
      r.blitzTargetsCleared += 1;
      r.airLeft = Math.min(30.0, r.airLeft + 3.5);
      updateAirHUD(r.airLeft);
      audio.playLidBlowOff(true);
      spawnFloatingScorePopup(0, index, `КОМБО ×${r.blitzTargetsCleared} · +3.5с!`);
      Haptics.success();

      // Мгновенно перезаряжаем 12 бочек Пресс-цеха для следующей волны Блица!
      const nextPool = [];
      for (let i = 0; i < 12; i++) {
        if (BARREL_BATCH_CODES[i] !== '19') nextPool.push(i);
      }
      r.targetIndex = nextPool[Math.floor(Math.random() * nextPool.length)];
      scene.resetRound({
        barrelCount: 12,
        targetIndex: r.targetIndex,
        portraitUrl: r.portraitDataUrl,
        golden: false,
      });
      scene.setWorkshopLevelDecor?.(r.workshopLevel || 8, r.modeType, {
        zoneId: 4,
        steamHazardIndex: -1,
        numbersObscured: !r.micBlowUsed,
        wallQuoteText: t('wallSeaQuote'),
      });
      audio.setBarrelLayout(scene.getBarrelWorldPositions(), r.targetIndex);
      return;
    }

    finishRound(true, { diveBarrelIndex: index, hitTarget: true });
    return;
  }

  scene.triggerEmptyBarrelOpen(index);
  if (index === r.steamHazardIndex) {
    r.airLeft = Math.max(0.5, r.airLeft - 4.0);
    updateAirHUD(r.airLeft);
    scene.triggerSteamHazardBurst?.(index);
    audio.playSteamPenaltyBurst?.();
    r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пар]`);
    showToast('⚠️ Пробитая труба с паром! −4 сек воздуха O₂');
  } else {
    r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пусто]`);
  }

  r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
  renderAttemptSquares(r.attemptsLeft, r.isBlitz ? 5 : 3);

  if (r.attemptsLeft > 0) {
    triggerMiniScreamer();
  } else {
    triggerMiniScreamer();
    finishRound(r.isBlitz && r.blitzTargetsCleared > 0, {
      diveBarrelIndex: index,
      hitTarget: false,
    });
  }
}

function createVictimCardDataUrl(sourceImgUrl = '') {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return sourceImgUrl || DEMO_PORTRAITS[0];

    ctx.fillStyle = '#0d090a';
    ctx.fillRect(0, 0, 480, 480);

    // Заводские красно-чёрные полосы опасности
    for (let x = -480; x < 960; x += 48) {
      ctx.fillStyle = 'rgba(255, 42, 42, 0.16)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 24, 0);
      ctx.lineTo(x + 120, 480);
      ctx.lineTo(x + 96, 480);
      ctx.closePath();
      ctx.fill();
    }

    // Силуэт / прожектор по центру
    const rad = ctx.createRadialGradient(240, 230, 20, 240, 230, 170);
    rad.addColorStop(0, 'rgba(255, 68, 56, 0.34)');
    rad.addColorStop(0.6, 'rgba(24, 12, 14, 0.92)');
    rad.addColorStop(1, 'rgba(9, 7, 8, 0.98)');
    ctx.fillStyle = rad;
    ctx.fillRect(28, 66, 424, 330);

    // Металлический трафарет бочки и штамп жертвы
    ctx.strokeStyle = '#ff4b4b';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, 444, 444);

    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(18, 18, 444, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚨 ЖЕРТВА ЦЕХА №19 // СКРИМЕР', 240, 51);

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 64px monospace';
    ctx.fillText('19·97', 240, 225);

    const victimName = state.tg?.user?.name || 'ИГРОК ЦЕХА';
    ctx.fillStyle = '#f8f9fa';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`ПОЙМАН НА ЛОВУШКЕ: ${victimName.toUpperCase()}`, 240, 285);

    ctx.fillStyle = '#ff8787';
    ctx.font = '18px monospace';
    ctx.fillText('СИРЕНА СРАБОТАЛА · ЗАВОД БОЧКА', 240, 325);

    ctx.fillStyle = '#141115';
    ctx.fillRect(18, 404, 444, 58);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText('🎬 bochka.quest · В КИНО С 17 ДЕКАБРЯ', 240, 440);

    return canvas.toDataURL('image/webp', 0.86);
  } catch (_err) {
    return sourceImgUrl || DEMO_PORTRAITS[0];
  }
}

function triggerMiniScreamer(explicitVariant = null) {
  // Уровень 1 (Вход / Спасение): без жёсткого скримера на стартовом уровне, жёсткий скример — со 2-го уровня и в бочке друга
  const isLevel1Intro =
    explicitVariant === null &&
    Boolean(state.round?.isDemo) &&
    Number(state.round?.workshopLevel || 1) <= 1 &&
    Number(state.profile?.currentLevel || 1) <= 1 &&
    Number(state.uiStage || 1) <= 1 &&
    !state.incomingPack;
  if (isLevel1Intro) {
    scene?.triggerScreamerShake(0.18);
    return;
  }

  const screamerKey = state.round?.screamerType || state.pack?.screamerType || 'weld';
  const screamerMap = {
    weld: 0,
    lunge: 1,
    siren_cam: 2,
    custom_scream: 3,
  };
  const v =
    typeof explicitVariant === 'number'
      ? Math.abs(explicitVariant) % 4
      : typeof screamerMap[screamerKey] === 'number'
        ? screamerMap[screamerKey]
        : (state.screamerCursor++) % 4;

  const meta = SCREAMER_META[v] || SCREAMER_META[0];
  const targetIdx = typeof state.round?.targetIndex === 'number' ? state.round.targetIndex : 0;

  if (screamerKey === 'weld' || v === 0) {
    audio.playMiniScreamer(0);
    scene?.triggerWeldDropImpact?.(targetIdx);
    scene?.triggerScreamerShake(0.46);
    try {
      navigator.vibrate?.([120, 40, 220]);
    } catch (_e) {}
  } else if (screamerKey === 'lunge' || v === 1) {
    audio.playMiniScreamer(1);
    scene?.triggerDarkLungeImpulse?.(targetIdx);
    try {
      navigator.vibrate?.([90, 30, 160]);
    } catch (_e) {}
  } else if (screamerKey === 'siren_cam' || v === 2) {
    if (typeof audio.playFactorySirenKlaxon === 'function') {
      audio.playFactorySirenKlaxon();
    } else {
      audio.playMiniScreamer(2);
    }
    scene?.triggerScreamerShake(0.5);
    state.round.victimCardDataUrl = createVictimCardDataUrl(state.round.portraitDataUrl || DEMO_PORTRAITS[0]);
    try {
      navigator.vibrate?.([180, 60, 180]);
    } catch (_e) {}
  } else {
    audio.playMiniScreamer(2);
    if (state.round?.voiceUrl) {
      audio.playCleanSenderVoice(state.round.voiceUrl, { useBarrelFilter: true });
    }
    scene?.triggerScreamerShake(0.52);
    try {
      navigator.vibrate?.([150, 40, 200]);
    } catch (_e) {}
  }

  if (state.round.zoneId === 4) {
    scene?.triggerWiringArcFlash?.(1.1);
  }

  const el = document.getElementById('screamer-overlay');
  const cap = document.getElementById('screamer-caption');
  if (!el) return;

  el.setAttribute('data-variant', meta.key);
  const customLabels = {
    weld: '⚡ СВАРКА И ПАДАЮЩАЯ БОЧКА!',
    lunge: '🔦 БРОСОК ИЗ ТЕМНОТЫ!',
    siren_cam: '🚨 СИРЕНА ЦЕХА №19 // СНИМОК ЖЕРТВЫ!',
    custom_scream: '🎙 КРИК ИЗ ЗАВАРЕННОЙ БОЧКИ!',
  };
  if (cap) cap.textContent = customLabels[screamerKey] || t(meta.i18n);

  el.removeAttribute('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  window.setTimeout(() => {
    el.setAttribute('hidden', '');
  }, 460);
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
  const expiredWarn = document.getElementById('pass-expired-returned-warning');
  const existingUpsell = document.getElementById('pass-existing-player-upsell');
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
  expiredWarn?.setAttribute('hidden', '');
  existingUpsell?.setAttribute('hidden', '');

  const viewerUid = getViewerUid(state.tg?.user);
  const isOwnPass = Boolean(
    (passData.senderUid && passData.senderUid === viewerUid) ||
      (passData.senderTgId && state.tg?.user?.id && String(passData.senderTgId) === String(state.tg.user.id))
  );

  const isAlreadyFighter = Boolean(
    passData.isExistingPlayer ||
      Number(state.profile?.premierePoints || 0) > 0 ||
      Number(state.profile?.packedCount || 0) > 0 ||
      Number(state.profile?.currentLevel || 1) > 1
  );

  if (passData.expiredReturned || passData.status === 'expired_returned') {
    selfWarn?.setAttribute('hidden', '');
    claimForm?.setAttribute('hidden', '');
    codeBox?.setAttribute('hidden', '');
    expiredWarn?.removeAttribute('hidden');
  } else if (isOwnPass) {
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
  } else if (isAlreadyFighter) {
    selfWarn?.setAttribute('hidden', '');
    claimForm?.setAttribute('hidden', '');
    codeBox?.setAttribute('hidden', '');
    existingUpsell?.removeAttribute('hidden');
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

  if (state.uiStage < 2) {
    syncUiStage(state.tg?.user, 2).catch(() => {});
    applyProgressiveDisclosureUI({ forceStage: 2 });
  }

  document.getElementById('rescue-step-1')?.setAttribute('hidden', '');
  document.getElementById('rescue-step-2')?.removeAttribute('hidden');
  document.getElementById('modal-rescue')?.removeAttribute('hidden');
  Haptics.error();
}

function handleRescueKpOpenClick() {
  state.kpSync.waiting = true;
  state.kpSync.leftTab = false;
  state.kpSync.departedAt = Date.now();
  if (state.kpSync.fallbackTimer) {
    clearTimeout(state.kpSync.fallbackTimer);
    state.kpSync.fallbackTimer = null;
  }

  document.getElementById('rescue-kp-error')?.setAttribute('hidden', '');
  document.getElementById('btn-rescue-kp-claim')?.setAttribute('hidden', '');
  document.getElementById('btn-rescue-kp-no-account')?.setAttribute('hidden', '');
  document.getElementById('rescue-kp-sync')?.removeAttribute('hidden');

  // Резерв для встроенных WebView (Telegram), где visibilitychange иногда не срабатывает при открытии ссылки
  state.kpSync.fallbackTimer = window.setTimeout(() => {
    state.kpSync.fallbackTimer = null;
    if (!state.kpSync.waiting) return;
    state.kpSync.waiting = false;
    state.kpSync.verified = true;
    document.getElementById('rescue-kp-sync')?.setAttribute('hidden', '');
    document.getElementById('rescue-kp-error')?.setAttribute('hidden', '');
    if (state.uiStage <= 2) {
      document.getElementById('btn-rescue-kp-open')?.setAttribute('hidden', '');
    }
    document.getElementById('btn-rescue-kp-claim')?.removeAttribute('hidden');
    document.getElementById('btn-rescue-kp-no-account')?.removeAttribute('hidden');
  }, 4500);

  openExternalLink(ENV.kinopoiskUrl);
}

function evaluateKinopoiskReturn() {
  if (!state.kpSync.waiting) return;
  const awaySec = (Date.now() - state.kpSync.departedAt) / 1000;
  state.kpSync.waiting = false;
  if (state.kpSync.fallbackTimer) {
    clearTimeout(state.kpSync.fallbackTimer);
    state.kpSync.fallbackTimer = null;
  }
  document.getElementById('rescue-kp-sync')?.setAttribute('hidden', '');

  if (awaySec < KP_MIN_AWAY_SEC) {
    document.getElementById('rescue-kp-error')?.removeAttribute('hidden');
    document.getElementById('btn-rescue-kp-no-account')?.removeAttribute('hidden');
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
  if (state.uiStage <= 2) {
    document.getElementById('btn-rescue-kp-open')?.setAttribute('hidden', '');
  }
  document.getElementById('btn-rescue-kp-claim')?.removeAttribute('hidden');
  document.getElementById('btn-rescue-kp-no-account')?.removeAttribute('hidden');
  Haptics.success();
}

function claimKinopoiskFourthLife(bypassNoAccount = false) {
  if (!bypassNoAccount && !state.kpSync.verified) return;
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

  if (state.kpSync.fallbackTimer) {
    clearTimeout(state.kpSync.fallbackTimer);
  }
  state.kpSync = {
    waiting: false,
    leftTab: false,
    departedAt: 0,
    verified: false,
    fallbackTimer: null,
  };

  document.getElementById('rescue-step-2')?.setAttribute('hidden', '');
  document.getElementById('rescue-step-1')?.removeAttribute('hidden');
  document.getElementById('btn-rescue-kp-open')?.removeAttribute('hidden');
  document.getElementById('rescue-kp-sync')?.setAttribute('hidden', '');
  document.getElementById('rescue-kp-error')?.setAttribute('hidden', '');
  document.getElementById('btn-rescue-kp-claim')?.setAttribute('hidden', '');
  document.getElementById('btn-rescue-kp-no-account')?.setAttribute('hidden', '');
  document.getElementById('modal-rescue')?.removeAttribute('hidden');
  Haptics.error();
}

function openRescueTrailerDirectly() {
  state.round.running = false;
  state.round.rescueStage = 3;
  state.round.airLeft = 0;
  state.round.attemptsLeft = 0;
  stopAirTimer();
  audio.stopListening();
  scene.setInteractive(false);
  updateAirHUD(0);
  renderAttemptSquares(0);

  document.getElementById('modal-rescue')?.setAttribute('hidden', '');
  openTrailerModal({ forRescue: true });
}

function claimTrailerFifthLife() {
  if (!state.trailer.unlocked40) return;
  closeTrailerModal();
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');

  // После просмотра трейлера следующий (4-й) удар сразу победный!
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
async function finishRound(survived, { diveBarrelIndex = null, hitTarget = null } = {}) {
  if (!state.round.running && state.round.rescueStage !== 4) return;
  state.round.running = false;
  state.round.survived = survived;
  stopAirTimer();
  audio.stopListening();
  audio.stopMuffledVoiceLoop();

  const didHitTarget = hitTarget !== null ? Boolean(hitTarget) : Boolean(survived);
  audio.playLidBlowOff(didHitTarget);

  if (didHitTarget) {
    const revealIdx =
      typeof diveBarrelIndex === 'number' && diveBarrelIndex >= 0
        ? diveBarrelIndex
        : state.round.targetIndex;
    scene.triggerRevealDive(revealIdx);
  } else if (typeof diveBarrelIndex === 'number' && diveBarrelIndex >= 0) {
    scene.triggerEmptyDive(diveBarrelIndex);
  } else {
    scene.setInteractive(false);
    scene.triggerScreamerShake(0.38);
  }

  state.watchChannel?.send('rescued', {
    survived,
    attemptsUsed: state.round.attemptsUsed || 1,
  });

  if (didHitTarget && state.round.voiceUrl) {
    window.setTimeout(() => {
      audio.playCleanSenderVoice(state.round.voiceUrl, {
        useBarrelFilter: state.round.useBarrelFilter !== false,
      });
    }, 360);
  }

  if (state.round.isDemo && survived) {
    const wasBlitz = Boolean(state.round.isBlitz);
    const completedLvl = state.round.workshopLevel;
    const blitzBonus = wasBlitz ? state.round.blitzTargetsCleared * 95 : 0;
    completeWorkshopLevel(state.tg?.user, completedLvl, state.round.airLeft, blitzBonus)
      .then((lvlRes) => {
        if (lvlRes?.ok) {
          state.profile.currentLevel = lvlRes.currentLevel;
          state.profile.premierePoints = lvlRes.premierePoints;
          state.profile.hasPlayedSolo = true;
          state.lastBlitzDailyPoints = Number(lvlRes.dailyBlitzPoints ?? state.lastBlitzDailyPoints ?? 0);
          state.lastBlitzDailyCap = Number(lvlRes.dailyBlitzCap || 2000);
          if (lvlRes.cooldownBlocked) {
            const rem = Math.max(1, Number(lvlRes.cooldownRemainingSec || 12));
            state.blitzCooldownUntil = Date.now() + rem * 1000;
            showToast(`⏳ Блиц остывает (${rem}с) — забери +150 ⭐ в ShareHub!`);
          } else {
            if (wasBlitz) state.blitzCooldownUntil = Date.now() + 12000;
            const capped = wasBlitz && state.lastBlitzDailyPoints >= state.lastBlitzDailyCap && Number(lvlRes.earnedPoints || 0) === 0;
            showToast(
              capped
                ? `🛑 Дневной лимит Блица ${state.lastBlitzDailyCap} ⭐ достигнут — забери очки в ShareHub!`
                : `🏆 Уровень ${completedLvl} пройден! +${lvlRes.earnedPoints} ⭐ в ТОП-10`
            );
          }
          updatePremiereBarsUI();
          renderBlitzCooldownMicroGoal();
        }
      })
      .catch(() => {});
  }

  if (!state.round.isDemo && state.incomingPack) {
    state.uiStage = Math.max(Number(state.uiStage || 1), 4);
    applyProgressiveDisclosureUI({ forceStage: 4 });
    syncUiStage(state.tg?.user, 4).catch(() => {});
    const elapsedSec = Math.max(
      1,
      Math.min(30, Math.round(AIR_DURATION_SEC - Number(state.round.airLeft || 0)))
    );
    const screamerNames = {
      weld: 'Сварка и падающая бочка',
      lunge: 'Бросок из темноты',
      siren_cam: 'Сирена цеха + Кадр жертвы',
      custom_scream: 'Свой 2-сек крик из бочки',
    };
    recordBarrelResult(state.incomingPack, {
      survived,
      attemptsUsed: state.round.attemptsUsed || 5,
      timeLeft: state.round.airLeft,
      elapsedSec,
      screamerLabel: screamerNames[state.round.screamerType] || 'Сварка и падающая бочка',
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
  renderVoicePromptChips();
  await rebuildPackPortraitPreview(DEMO_PORTRAITS[1]);
}

function renderVoicePromptChips() {
  const wrap = document.getElementById('voice-prompt-chips');
  if (!wrap) return;
  const pack = VOICE_PROMPT_PACKS[state.voicePromptCursor % VOICE_PROMPT_PACKS.length] || VOICE_PROMPT_PACKS[0];
  wrap.innerHTML = '';
  pack.forEach((line, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-prompt-chip' + (idx === 0 ? ' is-active' : '');
    btn.setAttribute('data-voice-prompt', String(idx));
    btn.textContent = line;
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.voice-prompt-chip').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const inputEl = document.getElementById('input-custom-phrase');
      const counterEl = document.getElementById('phrase-counter');
      const cleanPhrase = line.replace(/^🗣\s*[«"]?|[»"]?$/g, '').trim();
      if (inputEl && cleanPhrase) {
        state.pack.customEdited = true;
        inputEl.value = cleanPhrase.slice(0, 45);
        if (counterEl) counterEl.textContent = `${inputEl.value.length}/45`;
      }
      Haptics.light();
    });
    wrap.appendChild(btn);
  });
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
    if (sizeTag) sizeTag.textContent = `${processed.width || 420}×${processed.height || 420} HD WEBP · ${processed.sizeKb} КБ`;
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

    const wasPreStage3 = state.uiStage < 3 && !state.profile.temuSurgeClaimed;

    const created = await createBarrelPack({
      mode: state.pack.mode,
      message: phrase,
      frameStyle: state.pack.frameStyle,
      screamerType: state.pack.screamerType || 'weld',
      zoneId: state.pack.zoneId || 1,
      targetBarrelIndex: state.pack.targetBarrelIndex ?? -1,
      senderName,
      tgUser: state.tg.user,
      processedImage: state.pack.processed,
      recordedVoice: state.pack.voice,
    });

    state.pack.lastShareUrl = created.shareUrl;
    state.pack.lastWebUrl = created.webUrl;
    state.pack.shareLifeClaimedForUrl = '';

    state.profile.premiereScore = Math.max(
      Number(state.profile.premiereScore || 0),
      Number(created.premiereScore || 72)
    );
    state.profile.temuSurgeClaimed = true;
    state.profile.packedCount = Math.max(1, Number(state.profile.packedCount || 0) + 1);

    const outInput = document.getElementById('output-share-url');
    if (outInput) outInput.value = created.shareUrl;

    document.getElementById('share-result-box')?.removeAttribute('hidden');
    revealStep4TrailerBonusBox(false);

    if (created.surgeTriggered || wasPreStage3) {
      await syncUiStage(state.tg?.user, 3);
      openTemuUnlockModal(state.profile.premiereScore || 72.0);
      applyProgressiveDisclosureUI({ forceStage: 3, skipPromoteFromSocial: true });
    } else {
      applyProgressiveDisclosureUI();
    }

    await refreshQuestUI();
    Haptics.success();
  } finally {
    sealBtn.disabled = false;
    sealTxt.textContent = t('btnSealBarrel');
  }
}

function revealStep4TrailerBonusBox(visible = true) {
  const box = document.getElementById('pack-step4-trailer-box');
  if (!box) return;
  if (visible) box.removeAttribute('hidden');
  else box.setAttribute('hidden', '');
}

function syncStep4QuestRowUI(synced = null) {
  const btn = document.getElementById('quest-btn-step4-trailer');
  if (!btn) return;
  let photoSent = Number(synced?.packedCount || 0) >= 1;
  let step4Done = false;
  try {
    if (localStorage.getItem('bochka_photo_barrel_sent') === '1') photoSent = true;
    step4Done = localStorage.getItem('bochka_step4_trailer_shared') === '1';
  } catch { /* ignore */ }
  btn.classList.toggle('is-done', step4Done);
  if (step4Done) {
    btn.textContent = `✓ ${t('questDone')}`;
  } else if (!photoSent) {
    btn.textContent = 'СНАЧАЛА ФОТО';
  } else {
    btn.textContent = t('questOpen');
  }

  const packStep4Btn = document.getElementById('btn-pack-step4-trailer');
  if (packStep4Btn && step4Done) {
    packStep4Btn.classList.add('is-done');
  }
}

function markStep4TrailerShared() {
  try { localStorage.setItem('bochka_step4_trailer_shared', '1'); } catch { /* ignore */ }
  const btn = document.getElementById('btn-pack-step4-trailer');
  if (btn) {
    btn.classList.add('is-done');
    const span = btn.querySelector('span');
    if (span) span.textContent = '✓ ТРЕЙЛЕР ОТПРАВЛЕН ДРУГУ (+150 ⭐)';
  }
  syncStep4QuestRowUI();
}

async function grantShareLifeOnceForCurrentBarrel() {
  if (!state.pack.lastShareUrl) return;
  try { localStorage.setItem('bochka_photo_barrel_sent', '1'); } catch { /* ignore */ }
  revealStep4TrailerBonusBox(true);
  syncStep4QuestRowUI();

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
  const victimCardBox = document.getElementById('finale-victim-card-box');
  const victimCardImg = document.getElementById('victim-card-img');
  const cinemaFeedbackBox = document.getElementById('finale-cinema-feedback-box');
  const cinemaReplyBtn = document.getElementById('btn-cinema-reply');
  const cinemaReplyText = document.getElementById('btn-cinema-reply-text');
  const stageProgBar = document.getElementById('finale-stage-progression-bar');
  const stageProgText = document.getElementById('finale-stage-progression-text');
  const stageNextBtn = document.getElementById('btn-finale-stage-next');

  cinemaFeedbackBox?.setAttribute('hidden', '');
  if (cinemaReplyBtn) cinemaReplyBtn.disabled = false;
  if (cinemaReplyText) cinemaReplyText.textContent = t('btnGoCinema');

  if (!premiereResult && !r.isDemo && !r.survived && r.screamerType === 'siren_cam') {
    if (!r.victimCardDataUrl) {
      r.victimCardDataUrl = createVictimCardDataUrl(r.portraitDataUrl || DEMO_PORTRAITS[0]);
    }
    if (victimCardImg) victimCardImg.src = r.victimCardDataUrl;
    victimCardBox?.removeAttribute('hidden');
  } else {
    victimCardBox?.setAttribute('hidden', '');
  }

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
    const quoteText = r.isDemo ? pickNextBarrelHeavenQuote() : (r.message || pickNextBarrelHeavenQuote());
    if (msgEl) msgEl.textContent = `«${quoteText}»`;
    if (voiceRow) {
      if (r.voiceUrl) voiceRow.removeAttribute('hidden');
      else voiceRow.setAttribute('hidden', '');
    }
    if (notifyEl) {
      notifyEl.style.display = r.isDemo ? 'none' : 'block';
      notifyEl.textContent = t('finaleNotified');
    }
  }

  if (!premiereResult && state.uiStage < 2) {
    syncUiStage(state.tg?.user, 2).catch(() => {});
    applyProgressiveDisclosureUI({ forceStage: 2 });
  }

  // СТРОГО 2 ГЛАВНЫЕ КНОПКИ НА ЭКРАНЕ СПАСЕНИЯ (v6.7: без лишних чипов лайков и скролла)
  document.getElementById('finale-friend-reactions')?.setAttribute('hidden', '');
  document.getElementById('finale-solo-stage2-reaction')?.setAttribute('hidden', '');
  document.getElementById('finale-spoiler-report-box')?.setAttribute('hidden', '');
  document.getElementById('golden-hunt-card')?.setAttribute('hidden', '');
  cinemaReplyBtn?.removeAttribute('hidden');

  if (stageProgBar && stageProgText && stageNextBtn) {
    if (state.uiStage >= 4) {
      stageProgText.textContent = '🏆 Уровень 4 открыт: приглашай друзей в общую игру «На счёт три!» и дари выигранные билеты!';
      stageNextBtn.textContent = '⚔️ В ОБЩУЮ ИГРУ С ДРУЗЬЯМИ И ПРИЗАМИ →';
      stageProgBar.removeAttribute('hidden');
    } else if (state.uiStage === 3) {
      stageProgText.textContent = '🎟 Уровень 3 открыт: играй дальше — впереди розыгрыш бесплатных билетов на премьеру 17 декабря!';
      stageNextBtn.textContent = '🎯 ИГРАТЬ НА БЕСПЛАТНЫЙ БИЛЕТ →';
      stageProgBar.removeAttribute('hidden');
    } else {
      stageProgBar.setAttribute('hidden', '');
    }
  }

  const replayBtn = document.getElementById('btn-replay-round');
  if (replayBtn) {
    if (state.incomingPack && !r.isDemo) {
      replayBtn.textContent = t('btnPlayAgain');
    } else {
      const nextSpec = getWorkshopLevelSpec(state.profile.currentLevel || 1);
      replayBtn.textContent = nextSpec.isBlitz
        ? `⚡ БЛИЦ УР.${nextSpec.level} (12 БОЧЕК)`
        : `▶ УР.${nextSpec.level} · ${nextSpec.barrelCount} ${formatBarrelWord(nextSpec.barrelCount)}`;
    }
  }

  populateSpoilerFreeReportBox();

  await refreshQuestUI();
  renderBlitzCooldownMicroGoal();
  applyProgressiveDisclosureUI();
}

function buildSpoilerFreeReport() {
  const r = state.round;
  const zoneSpec = getFactoryZoneSpecByZoneId(r.zoneId || 1);
  const attempts = Math.max(1, Number(r.attemptsUsed || 1));
  const survived = Boolean(r.survived);

  let rank = 'Практикант';
  if (survived && (attempts === 1 || (r.zoneId || 1) >= 4)) {
    rank = 'Легенда Пресс-цеха';
  } else if (survived && attempts <= 3) {
    rank = 'Слесарь-слухач';
  }

  const logEntries =
    Array.isArray(r.strikeLog) && r.strikeLog.length
      ? r.strikeLog
      : [
          survived
            ? `[Удар ${attempts}: Спас за ${Math.max(1.2, 30 - (r.airLeft || 25)).toFixed(1)} сек]`
            : `[Удар ${attempts}: Воздух 0%]`,
        ];
  const pathStr = logEntries.join(' -> ');

  const shiftLabel = r.isDailyShift
    ? `📅 Смена дня ${r.dailyShiftCode} · ${zoneSpec.zoneTitle}`
    : `${zoneSpec.zoneTitle} (${r.barrelCount || zoneSpec.barrelCount}Б)`;
  const replaySummary = survived
    ? `🎬 Авто-повтор: вскрыл живую бочку с ${attempts}-го удара (остаток O₂: ${Number(r.airLeft || 0).toFixed(1)}с)`
    : `🎬 Авто-повтор: цех сомкнулся на ${attempts}-м ударе — возьми реванш!`;
  const challengeUrl = state.pack.lastShareUrl || 'https://bochka.quest/';

  const reportLines = [
    `🏭 БОЧКА // ${shiftLabel}`,
    `🏅 Ранг слуха: ${rank}`,
    `🔨 ${pathStr}`,
  ];
  if (r.micBlowUsed) {
    reportLines.push('💨 Пар сдут микрофоном (+4с O₂) · На стене: На небе только и разговоров, что о море');
  }
  reportLines.push(replaySummary, `👉 Проверь свой слух: ${challengeUrl}`);
  const reportText = reportLines.join('\n');

  return { rank, reportText, challengeUrl };
}

function populateSpoilerFreeReportBox() {
  const box = document.getElementById('finale-spoiler-report-box');
  const badge = document.getElementById('finale-rank-badge');
  const out = document.getElementById('output-spoiler-report');
  if (!box || !out) return;

  const { rank, reportText } = buildSpoilerFreeReport();
  if (badge) badge.textContent = rank.toUpperCase();
  out.value = reportText;

  if (state.uiStage <= 2 && !state.round.isDailyShift) {
    box.setAttribute('hidden', '');
  } else {
    box.removeAttribute('hidden');
  }
}

function renderBlitzCooldownMicroGoal() {
  const box = document.getElementById('blitz-cooldown-microgoal');
  if (!box) return;
  if (state.blitzTimerId) {
    clearInterval(state.blitzTimerId);
    state.blitzTimerId = null;
  }

  const now = Date.now();
  const remSec = Math.max(0, Math.ceil((Number(state.blitzCooldownUntil || 0) - now) / 1000));
  const dailyPts = Number(state.lastBlitzDailyPoints || 0);
  const dailyCap = Number(state.lastBlitzDailyCap || 2000);
  const showBox = Boolean(state.round.isBlitz) || remSec > 0 || dailyPts >= dailyCap;

  if (!showBox) {
    box.setAttribute('hidden', '');
    return;
  }

  const paint = () => {
    const secLeft = Math.max(0, Math.ceil((Number(state.blitzCooldownUntil || 0) - Date.now()) / 1000));
    const capHit = dailyPts >= dailyCap;
    const headText = capHit
      ? `🛑 ДНЕВНОЙ ЛИМИТ БЛИЦА (${dailyPts}/${dailyCap} ⭐)`
      : secLeft > 0
        ? `⚡ ОХЛАЖДЕНИЕ БЛИЦА: ${secLeft}с · ЗА ДЕНЬ ${dailyPts}/${dailyCap} ⭐`
        : `⚡ БЛИЦ ГОТОВ К СТАРТУ · ЗА ДЕНЬ ${dailyPts}/${dailyCap} ⭐`;

    box.innerHTML = `
      <div class="retention-card-head">
        <span class="mono-label">${escapeHtmlSafe(headText)}</span>
      </div>
      <small>Пока цех остывает или упёрся в дневной лимит, выполни быструю цель для роста в ТОП-10:</small>
      <div class="blitz-microgoal-actions">
        <button type="button" class="btn-secondary" id="btn-micro-share">📤 Забрать +150 ⭐ в ShareHub</button>
        <button type="button" class="btn-ghost" id="btn-micro-leaders">🏆 Проверить ТОП-10 и квесты</button>
      </div>
    `;
    box.removeAttribute('hidden');
    document.getElementById('btn-micro-share')?.addEventListener('click', () => openShareHubModal('trailer'));
    document.getElementById('btn-micro-leaders')?.addEventListener('click', () => openLeaderboardModal());

    if (secLeft <= 0 && state.blitzTimerId) {
      clearInterval(state.blitzTimerId);
      state.blitzTimerId = null;
    }
  };

  paint();
  if (remSec > 0) {
    state.blitzTimerId = window.setInterval(paint, 1000);
  }
}

async function refreshQuestUI() {
  const [synced, freshProfile] = await Promise.all([
    syncFriendsOpenedTokens(state.tg?.user),
    fetchPlayerProfile(state.tg?.user),
  ]);
  state.profile = freshProfile;
  const temuOpen = !document.getElementById('modal-temu-unlock')?.hasAttribute('hidden');
  applyProgressiveDisclosureUI({ skipPromoteFromSocial: temuOpen });
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
  syncStep4QuestRowUI(synced);
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

function getEffectiveTrailerUnlockSec(vidEl = null) {
  if (!state.trailer.usingYtFallback && vidEl && Number.isFinite(vidEl.duration) && vidEl.duration > 5 && vidEl.duration < TRAILER_UNLOCK_SEC) {
    return Math.max(15, Math.floor(vidEl.duration - 0.3));
  }
  return TRAILER_UNLOCK_SEC;
}

function clearTrailerTimers() {
  if (state.trailer.rescueSafetyTimer) {
    clearTimeout(state.trailer.rescueSafetyTimer);
    state.trailer.rescueSafetyTimer = null;
  }
  if (state.trailer.ytBootWatchdog) {
    clearTimeout(state.trailer.ytBootWatchdog);
    state.trailer.ytBootWatchdog = null;
  }
  if (state.trailer.ytStallWatchdog) {
    clearTimeout(state.trailer.ytStallWatchdog);
    state.trailer.ytStallWatchdog = null;
  }
  if (state.trailer.ytAutoplayRetry) {
    clearTimeout(state.trailer.ytAutoplayRetry);
    state.trailer.ytAutoplayRetry = null;
  }
  if (state.trailer.ytTimer) {
    clearInterval(state.trailer.ytTimer);
    state.trailer.ytTimer = null;
  }
}

/* ============================================================================
   ПЛЕЕР ТРЕЙЛЕРА: ОФИЦИАЛЬНЫЙ YOUTUBE (@kinoceh_bel) + ЛОКАЛЬНЫЙ MP4 ФОЛЛБЭК
   ============================================================================ */
function evaluateExternalYouTubeRescueReturn() {
  const departed = Number(state.trailer.externalRescueDepartedAt || 0);
  if (!departed) return;
  state.trailer.externalRescueDepartedAt = 0;
  if (!state.trailer.modalOpen || !state.trailer.forRescue || state.trailer.unlocked40) return;
  if ((Date.now() - departed) / 1000 >= 12) {
    unlockTrailerReward();
  }
}

function initVisibilityAndAntiSeekGuards() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.kpSync.waiting) {
        state.kpSync.leftTab = true;
        state.kpSync.departedAt = Date.now();
      }
      if (state.externalLikeSync.active) {
        state.externalLikeSync.leftTab = true;
        state.externalLikeSync.departedAt = Date.now();
      }
      const vid = document.getElementById('trailer-video');
      if (vid && !vid.paused) {
        vid.pause();
        syncTrailerPlayButton();
      }
      if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
        try { state.ytPlayer.pauseVideo(); } catch { /* ignore */ }
      }
    } else {
      if (state.kpSync.waiting && state.kpSync.leftTab) {
        evaluateKinopoiskReturn();
      }
      if (state.externalLikeSync.active && state.externalLikeSync.leftTab) {
        evaluateExternalLikeReturn();
      }
      evaluateExternalYouTubeRescueReturn();
    }
  });

  window.addEventListener('blur', () => {
    if (state.kpSync.waiting && !state.kpSync.leftTab) {
      state.kpSync.leftTab = true;
      state.kpSync.departedAt = Date.now();
    }
    if (state.externalLikeSync.active && !state.externalLikeSync.leftTab) {
      state.externalLikeSync.leftTab = true;
      state.externalLikeSync.departedAt = Date.now();
    }
  });

  window.addEventListener('focus', () => {
    if (state.kpSync.waiting && state.kpSync.leftTab) {
      evaluateKinopoiskReturn();
    }
    if (state.externalLikeSync.active && state.externalLikeSync.leftTab) {
      evaluateExternalLikeReturn();
    }
    evaluateExternalYouTubeRescueReturn();
  });

  const vid = document.getElementById('trailer-video');
  if (!vid) return;

  vid.addEventListener('ratechange', () => {
    if (vid.playbackRate > 1.02) {
      vid.playbackRate = 1.0;
    }
  });

  vid.addEventListener('loadedmetadata', () => {
    if (!state.trailer.usingYtFallback) {
      updateTrailerProgressUI(vid.currentTime || 0, vid.duration || 29.1, getEffectiveTrailerUnlockSec(vid));
    }
  });

  vid.addEventListener('seeking', () => {
    if (!state.trailer.unlocked40 && vid.currentTime > state.trailer.maxTime + 0.65) {
      vid.currentTime = state.trailer.maxTime;
    }
  });

  vid.addEventListener('timeupdate', () => {
    if (state.trailer.usingYtFallback) return;
    if (!vid.seeking && vid.currentTime > state.trailer.maxTime) {
      if (vid.currentTime - state.trailer.maxTime < 1.8) {
        state.trailer.maxTime = vid.currentTime;
      } else if (!state.trailer.unlocked40) {
        vid.currentTime = state.trailer.maxTime;
      }
    }
    const targetSec = getEffectiveTrailerUnlockSec(vid);
    updateTrailerProgressUI(vid.currentTime, vid.duration || 29.1, targetSec);
    if (state.trailer.maxTime >= targetSec) {
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
    document.getElementById('btn-close-trailer')?.classList.remove('is-rescue-locked');
  });
}

const EXTERNAL_LIKE_META = {
  yt: {
    urlKey: 'youtubeWatchUrl',
    action: 'yt_like_clicked',
    storageKey: 'bochka_yt_liked',
    btnId: 'btn-trailer-like-yt',
    doneLabel: '✓ ЛАЙК YT +50 ⭐',
    i18nKey: 'btnLikeYoutube',
  },
  yt_sub: {
    urlKey: 'youtubeSubscribeUrl',
    action: 'yt_sub_clicked',
    storageKey: 'bochka_yt_subbed',
    btnId: 'btn-trailer-sub-yt',
    doneLabel: '✓ КИНОЦЕХ +50 ⭐',
    i18nKey: 'btnSubYoutube',
  },
  ig: {
    urlKey: 'instagramTrailerUrl',
    action: 'ig_like_clicked',
    storageKey: 'bochka_ig_liked',
    btnId: 'btn-trailer-like-ig',
    doneLabel: '✓ INSTAGRAM +50 ⭐',
    i18nKey: 'btnLikeInstagram',
  },
};

function syncExternalLikeButtonsUI() {
  for (const meta of Object.values(EXTERNAL_LIKE_META)) {
    const btn = document.getElementById(meta.btnId);
    if (!btn) continue;
    let claimed = false;
    try { claimed = localStorage.getItem(meta.storageKey) === '1'; } catch { /* ignore */ }
    btn.classList.toggle('is-done', claimed);
    btn.textContent = claimed ? meta.doneLabel : t(meta.i18nKey);
  }
}

async function completeExternalLikeBonus(platform) {
  const meta = EXTERNAL_LIKE_META[platform];
  if (!meta) return;
  try { localStorage.setItem(meta.storageKey, '1'); } catch { /* ignore */ }
  syncExternalLikeButtonsUI();

  const res = await claimSocialOrPromoBonus(state.tg?.user, meta.action, platform).catch(() => null);
  if (res?.pointsAdded > 0) {
    state.profile.premierePoints = res.premierePoints;
    updatePremiereBarsUI();
  }
  Haptics.success();
  showToast('🔥 Спасибо за поддержку фильма! +50 ⭐ в рейтинг');
}

function handleExternalTrailerLike(platform) {
  const meta = EXTERNAL_LIKE_META[platform];
  if (!meta) return;
  const targetUrl = ENV[meta.urlKey] || ENV.youtubeWatchUrl;

  let alreadyClaimed = false;
  try { alreadyClaimed = localStorage.getItem(meta.storageKey) === '1'; } catch { /* ignore */ }

  pauseActiveTrailerPlayback();
  openExternalLink(targetUrl);
  if (alreadyClaimed) {
    showToast(platform === 'yt_sub' ? 'Подписка «КиноЦех» уже засчитана (+50 ⭐)!' : 'Лайк уже засчитан (+50 ⭐)!');
    return;
  }

  if (state.externalLikeSync.fallbackTimer) {
    clearTimeout(state.externalLikeSync.fallbackTimer);
  }
  state.externalLikeSync = {
    active: true,
    platform,
    departedAt: Date.now(),
    leftTab: false,
    fallbackTimer: window.setTimeout(() => {
      if (!state.externalLikeSync.active || state.externalLikeSync.platform !== platform) return;
      state.externalLikeSync.active = false;
      state.externalLikeSync.fallbackTimer = null;
      completeExternalLikeBonus(platform);
    }, 3800),
  };
}

function evaluateExternalLikeReturn() {
  if (!state.externalLikeSync.active) return;
  const { platform, departedAt, fallbackTimer } = state.externalLikeSync;
  state.externalLikeSync.active = false;
  state.externalLikeSync.fallbackTimer = null;
  if (fallbackTimer) clearTimeout(fallbackTimer);

  const awaySec = (Date.now() - departedAt) / 1000;
  if (awaySec < 3.0) {
    Haptics.error();
    showToast('Поставь лайк под роликом (подожди пару секунд) — и +50 ⭐ начислятся!');
    return;
  }
  completeExternalLikeBonus(platform);
}

function initLiveFriendFeedbackMonitor() {
  const SEEN_KEY = 'bochka_seen_friend_opens_v1';
  const INIT_KEY = 'bochka_seen_friend_init_v1';
  let baselineFriendsBrought = Number(state.profile?.friendsBrought || 0);
  let lastCheckAt = 0;
  let inFlight = false;

  const readSeen = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw : []);
    } catch {
      return new Set();
    }
  };
  const writeSeen = (set) => {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-60))); } catch { /* ignore */ }
  };

  const checkLiveFriendFeedback = async (seedOnly = false) => {
    if (isTestBogSessionActive() || inFlight) return;
    const packedCount = Number(state.profile?.packedCount || 0) || Number(getQuestState()?.packedCount || 0);
    if (!seedOnly && packedCount < 1) return;

    const now = Date.now();
    if (!seedOnly && now - lastCheckAt < 8000) return;
    lastCheckAt = now;
    inFlight = true;

    try {
      const [friends, prof] = await Promise.all([
        fetchMyWorkshopFriends(state.tg?.user).catch(() => []),
        fetchPlayerProfile(state.tg?.user).catch(() => null),
      ]);
      const seen = readSeen();
      const openedNow = Array.isArray(friends) ? friends.filter((f) => Boolean(f.opened_barrel) && f.friend_uid) : [];
      const isInitialized = (() => {
        try { return localStorage.getItem(INIT_KEY) === '1'; } catch { return true; }
      })();

      if (seedOnly || !isInitialized) {
        openedNow.forEach((f) => seen.add(f.friend_uid));
        writeSeen(seen);
        try { localStorage.setItem(INIT_KEY, '1'); } catch { /* ignore */ }
        if (prof) baselineFriendsBrought = Math.max(baselineFriendsBrought, Number(prof.friendsBrought || 0));
        return;
      }

      const newlyOpened = openedNow.filter((f) => !seen.has(f.friend_uid));
      newlyOpened.forEach((f) => seen.add(f.friend_uid));
      if (newlyOpened.length > 0) writeSeen(seen);

      const nextBrought = prof ? Number(prof.friendsBrought || 0) : baselineFriendsBrought;
      if (prof) {
        state.profile = { ...state.profile, ...prof };
        updatePremiereBarsUI();
        refreshQuestUI();
        if (state.activeScreen === 'pack') refreshPackFriendsStrip();
      }

      if (newlyOpened.length > 0 || nextBrought > baselineFriendsBrought) {
        baselineFriendsBrought = Math.max(baselineFriendsBrought, nextBrought);
        const first = newlyOpened[0];
        const friendLabel = first?.friend_name || (first?.friend_username ? `@${first.friend_username}` : 'Друг');
        Haptics.success();
        showToast(
          newlyOpened.length > 0
            ? `🔥 Кент «${friendLabel}» вскрыл твою бочку! +2500 ⭐ и +2 ❤️`
            : '🔥 Твой друг зашёл в игру по бочке! +2500 ⭐ и +2 ❤️'
        );
      }
    } finally {
      inFlight = false;
    }
  };

  checkLiveFriendFeedback(true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkLiveFriendFeedback(false);
  });
  window.addEventListener('focus', () => checkLiveFriendFeedback(false));
  window.setInterval(() => {
    if (!document.hidden) checkLiveFriendFeedback(false);
  }, 25000);
}

function pauseActiveTrailerPlayback() {
  const vid = document.getElementById('trailer-video');
  if (vid && !vid.paused) {
    try { vid.pause(); } catch { /* ignore */ }
  }
  if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
    try { state.ytPlayer.pauseVideo(); } catch { /* ignore */ }
  }
  syncTrailerPlayButton();
}

function setTrailerMuted(nextMuted = false) {
  state.trailer.muted = Boolean(nextMuted);
  const vid = document.getElementById('trailer-video');
  if (vid) {
    vid.muted = state.trailer.muted;
  }
  if (state.ytPlayer) {
    try {
      if (state.trailer.muted) {
        state.ytPlayer.mute?.();
      } else {
        state.ytPlayer.unMute?.();
        state.ytPlayer.setVolume?.(100);
      }
    } catch { /* ignore */ }
  }
  syncTrailerMuteButton();
}

function openTrailerModal({ forRescue = false } = {}) {
  state.trailer.modalOpen = true;
  state.trailer.usingYtFallback = true;
  state.trailer.forRescue = Boolean(forRescue);
  state.trailer.externalRescueDepartedAt = 0;
  audio.stopListening();
  audio.stopMuffledVoiceLoop();
  audio.setModalAudioDuck(true);
  syncExternalLikeButtonsUI();

  const modal = document.getElementById('modal-trailer');
  const rescueBox = document.getElementById('trailer-rescue-box');
  const closeBtn = document.getElementById('btn-close-trailer');

  clearTrailerTimers();
  state.trailer.muted = false;
  syncTrailerMuteButton();

  const lockClose = Boolean(forRescue && state.uiStage <= 2);
  modal?.classList.toggle('is-rescue-only', lockClose);
  modal?.removeAttribute('hidden');

  if (closeBtn) {
    closeBtn.style.visibility = '';
    closeBtn.classList.toggle('is-rescue-locked', lockClose);
  }

  if (forRescue) {
    state.trailer.maxTime = 0;
    state.trailer.ytWatchedSec = 0;
    state.trailer.unlocked40 = false;
    rescueBox?.removeAttribute('hidden');
    if (lockClose) {
      state.trailer.rescueSafetyTimer = window.setTimeout(() => {
        document.getElementById('btn-close-trailer')?.classList.remove('is-rescue-locked');
      }, 6500);
    }
    updateTrailerRescueBanner(0, TRAILER_UNLOCK_SEC);
  } else {
    rescueBox?.setAttribute('hidden', '');
  }

  activateYouTubePrimary({ forRescue });
}

function closeTrailerModal() {
  state.trailer.modalOpen = false;
  state.trailer.usingYtFallback = false;
  state.trailer.ytStartedPlaying = false;
  state.trailer.externalRescueDepartedAt = 0;
  clearTrailerTimers();

  const modal = document.getElementById('modal-trailer');
  modal?.classList.remove('is-rescue-only');
  document.getElementById('btn-close-trailer')?.classList.remove('is-rescue-locked');
  modal?.setAttribute('hidden', '');

  const vid = document.getElementById('trailer-video');
  if (vid) {
    try { vid.pause(); } catch { /* ignore */ }
    vid.muted = true;
    vid.setAttribute('hidden', '');
  }
  if (state.ytPlayer) {
    try { state.ytPlayer.mute?.(); } catch { /* ignore */ }
    try { state.ytPlayer.pauseVideo?.(); } catch { /* ignore */ }
  }
  audio.setModalAudioDuck(false);
  syncTrailerPlayButton();

  if (state.trailer.forRescue && (state.round.rescueStage === 1 || state.round.rescueStage === 3) && !state.trailer.unlocked40 && state.uiStage > 2) {
    document.getElementById('modal-rescue')?.removeAttribute('hidden');
  }
}

function updateTrailerProgressUI(cur, dur, targetSec = null) {
  const fill = document.getElementById('trailer-progress-fill');
  const readout = document.getElementById('trailer-time-readout');
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  if (fill) fill.style.width = `${pct.toFixed(1)}%`;
  if (readout) readout.textContent = `${formatTimeMMSS(cur)} / ${formatTimeMMSS(dur)}`;

  if (state.trailer.forRescue && !state.trailer.unlocked40) {
    updateTrailerRescueBanner(state.trailer.maxTime, targetSec ?? TRAILER_UNLOCK_SEC);
  }
}

function updateTrailerRescueBanner(watchedSec, targetSec = TRAILER_UNLOCK_SEC) {
  const statusEl = document.getElementById('trailer-rescue-status');
  const claimBtn = document.getElementById('btn-claim-trailer-life');
  if (state.trailer.unlocked40) {
    if (statusEl) statusEl.textContent = t('trailerRescueUnlocked');
    if (claimBtn) claimBtn.disabled = false;
    return;
  }
  const rem = Math.max(0, Math.ceil((targetSec || TRAILER_UNLOCK_SEC) - watchedSec));
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
  document.getElementById('btn-close-trailer')?.classList.remove('is-rescue-locked');
  clearTrailerTimers();

  const statusEl = document.getElementById('trailer-rescue-status');
  const claimBtn = document.getElementById('btn-claim-trailer-life');
  if (statusEl) statusEl.textContent = t('trailerRescueUnlocked');
  if (claimBtn) claimBtn.disabled = false;

  markTrailerCompleted();
  recordFunnelEvent('trailer_completions', state.tg?.user).catch(() => {});
  const bonus = await claimSocialOrPromoBonus(
    state.tg?.user,
    'trailer_watched',
    'app',
    state.tg?.trailerRefUid || ''
  ).catch(() => null);
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
  const btn = document.getElementById('btn-trailer-play');
  if (!btn) return;
  let playing = false;
  if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function') {
    try {
      playing = state.ytPlayer.getPlayerState() === 1;
    } catch { playing = false; }
  }
  btn.textContent = playing ? '❚❚ ПАУЗА' : '▶ ПУСК';
}

function syncTrailerMuteButton() {
  const btn = document.getElementById('btn-trailer-mute');
  if (!btn) return;
  const muted = Boolean(state.trailer.muted);
  btn.textContent = muted ? '🔇 ВКЛ ЗВУК' : '🔊 ВЫКЛ ЗВУК';
  btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
}

function showDirectYouTubeFallbackNotice() {
  document.getElementById('btn-close-trailer')?.classList.remove('is-rescue-locked');
  showToast('Нажми «▶ YOUTUBE ↗» — откроется этот же новый трейлер на YouTube');
}

function scheduleYtAutoplayRetry(player) {
  if (state.trailer.ytAutoplayRetry) {
    clearTimeout(state.trailer.ytAutoplayRetry);
  }
  state.trailer.ytAutoplayRetry = window.setTimeout(() => {
    state.trailer.ytAutoplayRetry = null;
    if (!state.trailer.modalOpen) return;
    try {
      const pState = typeof player?.getPlayerState === 'function' ? player.getPlayerState() : -1;
      if (pState !== 1 && pState !== 3) {
        setTrailerMuted(true);
        player.playVideo?.();
      }
    } catch { /* ignore */ }
  }, 600);
}

function startYtPlaybackNow(player, { forRescue = false } = {}) {
  if (!player || !state.trailer.modalOpen) return;
  try {
    const loadedId = player.getVideoData?.()?.video_id || '';
    if (loadedId && loadedId !== OFFICIAL_YT_TRAILER_ID && typeof player.loadVideoById === 'function') {
      player.loadVideoById(OFFICIAL_YT_TRAILER_ID, 0);
    } else {
      if (forRescue) player.seekTo?.(0, true);
      player.playVideo?.();
    }
    if (state.trailer.muted) {
      player.mute?.();
    } else {
      player.unMute?.();
      player.setVolume?.(100);
    }
    scheduleYtAutoplayRetry(player);
    syncTrailerPlayButton();
    syncTrailerMuteButton();
  } catch {
    showDirectYouTubeFallbackNotice();
  }
}

function ensureYouTubeScriptTag() {
  if (window.YT?.Player) return;
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => {
      if (state.trailer.modalOpen) showDirectYouTubeFallbackNotice();
    };
    document.head.appendChild(tag);
  }
}

function ensureYtPlayerMounted() {
  if (state.ytPlayer) return;
  if (!window.YT?.Player) {
    const prevReady = typeof window.onYouTubeIframeAPIReady === 'function'
      ? window.onYouTubeIframeAPIReady
      : null;
    window.onYouTubeIframeAPIReady = () => {
      try { prevReady?.(); } catch { /* ignore */ }
      ensureYtPlayerMounted();
    };
    ensureYouTubeScriptTag();
    return;
  }

  state.ytPlayer = new window.YT.Player('yt-fallback-slot', {
    videoId: OFFICIAL_YT_TRAILER_ID,
    playerVars: {
      autoplay: 0,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: (ev) => {
        state.trailer.ytReady = true;
        try {
          const ifr = ev.target.getIframe?.();
          if (ifr) {
            ifr.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            ifr.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen');
          }
        } catch { /* ignore */ }
        if (!state.trailer.modalOpen) {
          try { ev.target.mute?.(); ev.target.pauseVideo?.(); } catch { /* ignore */ }
          return;
        }
        startYtPlaybackNow(ev.target, { forRescue: state.trailer.forRescue });
      },
      onError: () => {
        if (state.trailer.modalOpen) {
          showDirectYouTubeFallbackNotice();
        }
      },
      onStateChange: (ev) => {
        if (!state.trailer.modalOpen) {
          try { ev.target?.mute?.(); ev.target?.pauseVideo?.(); } catch { /* ignore */ }
          return;
        }
        syncTrailerPlayButton();
        try {
          const ytMuted = Boolean(ev.target?.isMuted?.());
          if (ytMuted !== state.trailer.muted) {
            state.trailer.muted = ytMuted;
            syncTrailerMuteButton();
          }
        } catch { /* ignore */ }

        if (ev.data === 1) {
          state.trailer.ytStartedPlaying = true;
          if (!state.trailer.ytTimer) {
            state.trailer.ytTimer = window.setInterval(() => {
              if (document.hidden || !state.trailer.modalOpen) return;
              state.trailer.ytWatchedSec += 1;
              const cur = Number(ev.target?.getCurrentTime?.() || state.trailer.ytWatchedSec);
              const dur = Number(ev.target?.getDuration?.() || 92);
              updateTrailerProgressUI(cur, dur > 0 ? dur : 92, TRAILER_UNLOCK_SEC);
              updateTrailerRescueBanner(state.trailer.ytWatchedSec, TRAILER_UNLOCK_SEC);
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
          if (ev.data === 0 && state.trailer.ytWatchedSec >= 25) {
            unlockTrailerReward();
          }
        }
      },
    },
  });
}

function prewarmYouTubeTrailerPlayer() {
  ensureYouTubeScriptTag();
  ensureYtPlayerMounted();
}

function activateYouTubePrimary({ forRescue = false } = {}) {
  state.trailer.usingYtFallback = true;
  state.trailer.ytStartedPlaying = false;

  const vid = document.getElementById('trailer-video');
  if (vid && !vid.paused) vid.pause();
  vid?.setAttribute('hidden', '');
  document.getElementById('yt-fallback-slot')?.removeAttribute('hidden');
  document.getElementById('trailer-custom-bar')?.removeAttribute('hidden');
  document.getElementById('btn-trailer-open-yt-app')?.removeAttribute('hidden');
  syncTrailerMuteButton();
  syncTrailerPlayButton();

  ensureYtPlayerMounted();
  if (state.ytPlayer && state.trailer.ytReady) {
    startYtPlaybackNow(state.ytPlayer, { forRescue });
  }
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
  closeBurgerDrawer();
  await syncUiStage(state.tg?.user, 4);
  applyProgressiveDisclosureUI({ forceStage: 4 });

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

  if (state.uiStage < 3) {
    box.setAttribute('hidden', '');
    strip.innerHTML = '';
    return;
  }

  const friends = await fetchMyWorkshopFriends(state.tg?.user);
  if (!friends.length) {
    box.setAttribute('hidden', '');
    strip.innerHTML = '';
    return;
  }

  if (state.uiStage < 4) {
    await syncUiStage(state.tg?.user, 4);
    applyProgressiveDisclosureUI({ forceStage: 4 });
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
    await syncUiStage(state.tg?.user, 4);
    applyProgressiveDisclosureUI({ forceStage: 4 });
    await openDuelTable(roomId);
    await shareCurrentDuelRoom();
  } else if (reactionType === 'cinema' && state.uiStage >= 3) {
    openTrailerModal({ forRescue: false });
  }
}

function closeLeaderboardModal({ startOrResumeGame = false } = {}) {
  document.getElementById('modal-leaderboard')?.setAttribute('hidden', '');
  state.round.pausedForModal = false;

  if (startOrResumeGame) {
    state.entered = true;
    if (state.round.running) {
      showScreen('workshop');
      scene?.setInteractive(true);
    } else {
      startDemoRound();
    }
  } else if (state.activeScreen === 'workshop' && state.round.running) {
    scene?.setInteractive(true);
  }
}

async function openLeaderboardModal() {
  const modal = document.getElementById('modal-leaderboard');
  const listEl = document.getElementById('leaderboard-list');
  const rankEl = document.getElementById('leader-me-rank');
  const ptsEl = document.getElementById('leader-me-points');
  const gapEl = document.getElementById('leader-me-gap');

  if (state.round.running) {
    state.round.pausedForModal = true;
  }
  modal?.removeAttribute('hidden');
  if (listEl) listEl.innerHTML = '<div class="mono-tag">Синхронизация ТОП-10 с сервером...</div>';

  renderRetentionAndTransparencyPanels();

  const res = await fetchPremiereLeaderboard(state.tg?.user);
  const myUid = getViewerUid(state.tg?.user);
  const me = res.me || {};
  const myPts = Number(me.premiere_points ?? state.profile.premierePoints ?? 0);
  const myFriends = Number(me.friends_brought ?? state.profile.friendsBrought ?? 0);
  const myBonusPct = Number(me.friend_bonus_pct ?? Math.min(5, myFriends) * 10);
  const myEffective = Number(me.effective_points ?? Math.round(myPts * (1 + myBonusPct / 100)));

  if (rankEl) rankEl.textContent = me.rank ? `#${me.rank}` : '#—';
  if (ptsEl) ptsEl.textContent = myBonusPct > 0 ? `⭐ ${myEffective} (+${myBonusPct}%)` : `⭐ ${myEffective}`;
  if (gapEl) {
    const tierHint = myFriends === 0
      ? ' · 🤝 Приведи 1-го друга → сразу +150 ⭐ и +10% (2+ друзей → финал ТОП-10)'
      : myFriends === 1
        ? ' · ✓ Ступень 1 (+150 ⭐ и +10% активны) · Ещё 1 друг открывает финал ТОП-10!'
        : myBonusPct < 50
          ? ` · ✓ Допуск в финал ТОП-10 открыт (+${myBonusPct}%, макс +50%)`
          : ' · ✓ Допуск в финал ТОП-10 открыт (макс. +50%)';
    gapEl.textContent = me.in_top10
      ? `🔥 ТЫ В ЗОНЕ ПРИГЛАШЕНИЯ НА ЗАКРЫТУЮ ПРЕМЬЕРУ (ТОП-10)!${tierHint}`
      : `До входа в ТОП-10: +${Math.max(10, Number(me.points_to_top10 || 150))} ⭐${tierHint}`;
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
      const rowBonusPct = Number(row.friend_bonus_pct ?? Math.min(5, Number(row.friends_brought || 0)) * 10);
      const rowEffPts = Number(row.effective_points ?? Math.round(Number(row.premiere_points || 0) * (1 + rowBonusPct / 100)));
      const subMeta = `Ур.${row.current_level || 1} · Друзей: ${row.friends_brought || 0} (+${rowBonusPct}%) · Побед: ${row.duels_won || 0}`;
      return `
        <div class="${cls}">
          <span class="leader-rank">${medal}</span>
          <div class="leader-name-col">
            <strong>${escapeHtmlSafe(row.name || 'Узник цеха')}${isMe ? ' (ВЫ)' : ''}</strong>
            <small>${escapeHtmlSafe(subMeta)}</small>
          </div>
          <span class="leader-pts">⭐ ${rowEffPts}</span>
        </div>
      `;
    })
    .join('');
}

function getDailyMiniEventSpec() {
  const epochDays = Math.floor(Date.now() / 86400000);
  const rotIdx = Math.floor(epochDays / 3) % 5;
  const daysLeft = 3 - (epochDays % 3);
  const suffix = ` (смена модификатора: каждые 3 дня · осталось ${daysLeft} дн.)`;

  if (rotIdx === 0) {
    return { code: 'DOUBLE_BLITZ', title: '⚡ ИВЕНТ СМЕНЫ: ДВОЙНОЙ БЛИЦ', desc: `+30% к очкам на уровнях 8+ (кулдаун 12с, лимит 2000 ⭐/день).${suffix}` };
  }
  if (rotIdx === 1) {
    return { code: 'SPEED_SHIFT', title: '⏱ ИВЕНТ СМЕНЫ: СКОРОСТНАЯ СМЕНА', desc: `×2.5 бонус за сохранённый кислород O₂ и быстрый взлом.${suffix}` };
  }
  if (rotIdx === 2) {
    return { code: 'IRON_STREAK', title: '🛡 ИВЕНТ СМЕНЫ: СТАЛЬНОЙ ХАРАКТЕР', desc: `+35 ⭐ гарантированно к каждому пройденному уровню цеха.${suffix}` };
  }
  if (rotIdx === 3) {
    return { code: 'SECRET_1997', title: '🌊 ИВЕНТ СМЕНЫ: КОД 19·97', desc: `+40 ⭐ бонуса лора на уровнях 5+ при чистом поиске по звуку.${suffix}` };
  }
  return { code: 'PREMIERE_SURGE', title: '🎬 ИВЕНТ СМЕНЫ: ПРЕМЬЕРНЫЙ ШТУРМ', desc: `+25% рейтинговых ⭐ на всех уровнях перед премьерой 17 декабря.${suffix}` };
}

async function renderRetentionAndTransparencyPanels() {
  const evTitle = document.getElementById('daily-event-title');
  const evDesc = document.getElementById('daily-event-desc');
  const remBtn = document.getElementById('btn-toggle-reminders');
  const questsEl = document.getElementById('daily-quests-box');
  const transpEl = document.getElementById('raffle-transparency-box');

  const ev = getDailyMiniEventSpec();
  if (evTitle) evTitle.textContent = ev.title;
  if (evDesc) evDesc.textContent = ev.desc;

  if (remBtn) {
    const syncRemLabel = () => {
      const enabled = localStorage.getItem('bochka_reminders_on') === '1';
      remBtn.textContent = enabled ? '🔔 Напоминания ВКЛ' : '🔔 Напоминать';
      remBtn.classList.toggle('is-on', enabled);
    };
    syncRemLabel();
    if (!remBtn.dataset.bound) {
      remBtn.dataset.bound = '1';
      remBtn.addEventListener('click', async () => {
        const next = localStorage.getItem('bochka_reminders_on') !== '1';
        localStorage.setItem('bochka_reminders_on', next ? '1' : '0');
        syncRemLabel();
        if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          try { await Notification.requestPermission(); } catch {}
        }
        showToast(next ? '🔔 Тизеры смен цеха и секретов 19·97 включены (без спама)!' : 'Напоминания отключены.');
      });
    }
  }

  if (questsEl) {
    const prof = state.profile || {};
    const lvl = Number(prof.currentLevel || 1);
    const friends = Number(prof.friendsBrought || 0);
    const packed = Number(prof.packedCount || 0);
    const duels = Number(prof.duelsWon || 0);
    const quests = [
      { label: 'Пройти уровень цеха (≥ Ур.3)', done: lvl >= 3, val: `${Math.min(lvl, 3)}/3` },
      { label: 'Упаковать бочку другу', done: packed >= 1, val: `${Math.min(packed, 1)}/1` },
      { label: 'Ступень 1 (1 друг): +150 ⭐ и +10% к очкам', done: friends >= 1, val: `${Math.min(friends, 1)}/1` },
      { label: 'Ступень 2 (2 друга): Допуск в финал ТОП-10 Премьеры', done: friends >= 2, val: `${Math.min(friends, 2)}/2` },
    ];
    const badges = [
      { name: '🔥 Спринтер Ур.8', ok: lvl >= 8 },
      { name: '🤝 Связной +1', ok: friends >= 1 },
      { name: '⚔️ Дуэлянт', ok: duels >= 1 },
      { name: '🏆 Мастер цеха', ok: Number(prof.premierePoints || 0) >= 1500 },
    ];
    questsEl.innerHTML = `
      <span class="mono-label">ЗАДАНИЯ СМЕНЫ И ДОСТИЖЕНИЯ:</span>
      <div class="quests-list">
        ${quests.map((q) => `<div class="quest-row ${q.done ? 'is-done' : ''}"><span>${q.done ? '✓' : '○'} ${escapeHtmlSafe(q.label)}</span><strong>${escapeHtmlSafe(q.val)}</strong></div>`).join('')}
      </div>
      <div class="badges-row">
        ${badges.map((b) => `<span class="badge-chip ${b.ok ? 'is-unlocked' : ''}">${escapeHtmlSafe(b.name)}</span>`).join('')}
      </div>
    `;
  }

  if (transpEl) {
    transpEl.innerHTML = '<span class="mono-label">ПРОЗРАЧНЫЙ ФОНД ПРИЗОВ:</span><small>Загрузка живых счётчиков...</small>';
    const tr = await fetchPublicRaffleTransparency();
    if (tr?.ok) {
      const leftDaily = Math.max(0, Number(tr.max_daily_tickets || 0) - Number(tr.daily_tickets_issued || 0));
      const leftPremiere = Math.max(0, Number(tr.max_premiere_winners || 0) - Number(tr.premiere_winners_count || 0));
      transpEl.innerHTML = `
        <span class="mono-label">ПРОЗРАЧНЫЙ ФОНД ПРИЗОВ (LIVE SUPABASE):</span>
        <div class="transparency-grid">
          <span>👥 Игроков в цеху: <strong>${Number(tr.total_players || 0)}</strong></span>
          <span>🎟 Билетов сегодня: <strong>${Number(tr.daily_tickets_issued || 0)}/${Number(tr.max_daily_tickets || 0)}</strong> (осталось ${leftDaily})</span>
          <span>🏆 Приглашений на премьеру: <strong>${Number(tr.premiere_winners_count || 0)}/${Number(tr.max_premiere_winners || 0)}</strong> (свободно ${leftPremiere})</span>
        </div>
      `;
    } else {
      transpEl.innerHTML = '<span class="mono-label">ПРОЗРАЧНЫЙ ФОНД ПРИЗОВ:</span><small>Статистика временно недоступна.</small>';
    }
  }
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
  const trLinks = buildTrailerReferralLinks(state.tg?.user);
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
  const preview = document.getElementById('share-hub-preview-note');
  if (preview) {
    preview.textContent = isBarrel
      ? 'Превью: твоя именная бочка с фото и шифром «БОЧКА 17.12» (+1 ❤️ сразу, +2 ❤️ за открытие)'
      : 'Превью: карточка трейлера 17 декабря + реферальная ссылка (+150 ⭐)';
  }
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
      url: bundle.webUrl || bundle.url,
      text: `${bundle.text} ${bundle.webUrl || bundle.url}`,
      posterBlob: pngBlob,
    });
    if (igRes === 'copied_and_opened' || igRes === 'shared_story') {
      showToast('📸 Постер 9:16 и подпись скопированы для Instagram Stories!');
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
  } else if (kind === 'trailer') {
    markStep4TrailerShared();
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

  document.getElementById('btn-burger-menu')?.addEventListener('click', () => toggleBurgerDrawer());
  document.getElementById('burger-backdrop')?.addEventListener('click', () => closeBurgerDrawer());
  document.getElementById('btn-close-burger')?.addEventListener('click', () => closeBurgerDrawer());

  document.getElementById('btn-burger-rules')?.addEventListener('click', () => {
    closeBurgerDrawer();
    document.getElementById('modal-rules')?.removeAttribute('hidden');
  });
  document.getElementById('btn-close-rules')?.addEventListener('click', () => {
    document.getElementById('modal-rules')?.setAttribute('hidden', '');
  });
  document.getElementById('btn-rules-ok')?.addEventListener('click', () => {
    document.getElementById('modal-rules')?.setAttribute('hidden', '');
  });
  document.getElementById('btn-burger-share')?.addEventListener('click', () => {
    closeBurgerDrawer();
    openShareHubModal('trailer');
  });
  document.getElementById('btn-burger-duel')?.addEventListener('click', () => {
    closeBurgerDrawer();
    openDuelTable();
  });
  document.getElementById('btn-burger-sound')?.addEventListener('click', async () => {
    await audio.toggleSound();
    if (audio.enabled && state.round.running && state.round.voiceUrl) {
      audio.startMuffledVoiceLoop();
    }
    refreshSoundButtonLabel();
  });

  document.getElementById('top-lives-pill')?.addEventListener('click', async () => {
    await refreshQuestUI();
    document.getElementById('modal-prize')?.removeAttribute('hidden');
  });

  document.getElementById('btn-stage2-quick-react')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-stage2-quick-react');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '✓ До встречи в кино 17 декабря!';
    }
    recordFunnelEvent('cinema_intent', state.tg?.user).catch(() => {});
    Haptics.success();
    document.getElementById('btn-pack-revenge')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('btn-temu-unlock-accept')?.addEventListener('click', () => {
    document.getElementById('modal-temu-unlock')?.setAttribute('hidden', '');
    applyProgressiveDisclosureUI({
      forceStage: Math.max(3, state.uiStage),
      skipPromoteFromSocial: true,
    });
    updatePremiereBarsUI();
    document.getElementById('share-result-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('nav-brand')?.addEventListener('click', () => {
    if (!state.entered) return;
    closeBurgerDrawer();
    if (duelCtrl?.isActive) duelCtrl.leaveRoom(false);
    showScreen('modeA');
  });

  document.getElementById('nav-workshop')?.addEventListener('click', () => {
    if (!state.entered) return;
    closeBurgerDrawer();
    if (duelCtrl?.isActive) duelCtrl.leaveRoom(false);
    if (state.round.running) showScreen('workshop');
    else showScreen('modeA');
  });

  document.getElementById('nav-trailer')?.addEventListener('click', () => {
    closeBurgerDrawer();
    openTrailerModal({ forRescue: false });
  });

  document.getElementById('nav-leaderboard')?.addEventListener('click', () => openLeaderboardModal());

  document.getElementById('nav-kinopoisk')?.addEventListener('click', async () => {
    closeBurgerDrawer();
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

  document.getElementById('btn-gate-daily-shift')?.addEventListener('click', () => {
    startDailyShiftRound();
  });

  const handleJoinDuelByShortCode = async () => {
    const codeInput = document.getElementById('input-gate-duel-code');
    const raw = (codeInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (raw.length < 3) {
      showToast('Введи 4-значный код стола «На счёт три!»');
      return;
    }
    state.entered = true;
    await audio.unlock(true);
    refreshSoundButtonLabel();
    await syncUiStage(state.tg?.user, 4);
    applyProgressiveDisclosureUI({ forceStage: 4 });
    await openDuelTable(`d_${raw.slice(0, 6)}`);
  };

  document.getElementById('btn-gate-duel-join')?.addEventListener('click', handleJoinDuelByShortCode);
  document.getElementById('input-gate-duel-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJoinDuelByShortCode();
    }
  });

  document.getElementById('btn-gate-recovery-toggle')?.addEventListener('click', () => {
    const box = document.getElementById('gate-recovery-box');
    const out = document.getElementById('output-recovery-code');
    if (!box) return;
    const isHidden = box.hasAttribute('hidden');
    if (isHidden) {
      if (out) out.value = getPlayerRecoveryCode(state.tg?.user);
      box.removeAttribute('hidden');
    } else {
      box.setAttribute('hidden', '');
    }
    Haptics.light();
  });

  document.getElementById('btn-copy-recovery-code')?.addEventListener('click', async () => {
    const out = document.getElementById('output-recovery-code');
    const code = out?.value || getPlayerRecoveryCode(state.tg?.user);
    if (!code) return;
    await copyToClipboard(code);
    showToast('🔑 Код восстановления прогресса скопирован!');
    Haptics.light();
  });

  document.getElementById('btn-restore-code-apply')?.addEventListener('click', async () => {
    const inp = document.getElementById('input-restore-code');
    const res = await restoreProfileByRecoveryCode(inp?.value || '', state.tg?.user);
    if (!res.ok) {
      showToast('Проверь формат кода восстановления (например, BK-...)');
      return;
    }
    state.profile = res.profile || state.profile;
    updatePremiereBarsUI();
    showToast('✓ Прогресс цеха восстановлен!');
    Haptics.success();
  });

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

  document.getElementById('btn-hud-mic-blow')?.addEventListener('click', () => {
    triggerWorkshopMicBlow();
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
  document.getElementById('btn-rescue-kp-claim')?.addEventListener('click', () => claimKinopoiskFourthLife(false));
  document.getElementById('btn-rescue-kp-no-account')?.addEventListener('click', () => claimKinopoiskFourthLife(true));
  document.querySelectorAll('.trailer-react-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.trailer-react-btn').forEach((b) => b.classList.remove('is-on'));
      btn.classList.add('is-on');
      if (!localStorage.getItem('bochka_trailer_reacted')) {
        localStorage.setItem('bochka_trailer_reacted', btn.dataset.react || '1');
        const res = await claimSocialOrPromoBonus(state.tg?.user, 'trailer_reaction', 'trailer').catch(() => null);
        if (res?.pointsAdded > 0) {
          state.profile.premierePoints = res.premierePoints;
          updatePremiereBarsUI();
        }
        showToast('🔥 Спасибо за оценку трейлера! +25 ⭐ в рейтинг');
      } else {
        showToast('Реакция обновлена!');
      }
    });
  });
  document.getElementById('btn-rescue-watch-trailer')?.addEventListener('click', () => {
    document.getElementById('modal-rescue')?.setAttribute('hidden', '');
    openTrailerModal({ forRescue: true });
  });

  // Универсальный контроллер трейлера (YouTube OmyqxUXmqNY)
  document.getElementById('btn-trailer-play')?.addEventListener('click', () => {
    if (state.ytPlayer) {
      try {
        const pState = state.ytPlayer.getPlayerState?.() ?? -1;
        if (pState === 1) state.ytPlayer.pauseVideo?.();
        else state.ytPlayer.playVideo?.();
      } catch { /* ignore */ }
      syncTrailerPlayButton();
    }
  });

  document.getElementById('btn-trailer-mute')?.addEventListener('click', () => {
    setTrailerMuted(!state.trailer.muted);
  });

  document.getElementById('btn-trailer-open-yt-app')?.addEventListener('click', () => {
    pauseActiveTrailerPlayback();
    state.trailer.externalRescueDepartedAt = Date.now();
    openExternalLink(OFFICIAL_YT_WATCH_URL);
  });

  document.getElementById('btn-claim-trailer-life')?.addEventListener('click', () => claimTrailerFifthLife());

  document.getElementById('btn-open-kp-trailer')?.addEventListener('click', () => {
    pauseActiveTrailerPlayback();
    openExternalLink(ENV.kinopoiskTrailerUrl);
  });

  // Экран 4: Конструктор пранка (Фото + Голосовуха)
  document.getElementById('btn-close-pack')?.addEventListener('click', () => {
    if (voiceRecorder?.isRecording) voiceRecorder.stop();
    if (state.uiStage <= 2) {
      if (state.round.survived || (state.incomingPack && !state.round.isDemo)) showScreen('finale');
      else startNewbieOnboardingRound();
    } else if (state.incomingPack && !state.round.isDemo) {
      showScreen('finale');
    } else {
      showScreen('modeA');
    }
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
      audio.playCleanSenderVoice(state.pack.voice.objectUrl, {
        useBarrelFilter: state.pack.useBarrelFilter !== false,
      });
    }
  });

  document.getElementById('chk-voice-barrel-filter')?.addEventListener('change', (e) => {
    state.pack.useBarrelFilter = Boolean(e.target?.checked);
    Haptics.light();
  });

  document.getElementById('btn-voice-prompt-shuffle')?.addEventListener('click', () => {
    state.voicePromptCursor = (state.voicePromptCursor + 1) % VOICE_PROMPT_PACKS.length;
    renderVoicePromptChips();
    Haptics.light();
  });

  document.querySelectorAll('[data-pack-zone]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-pack-zone]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const z = Math.max(1, Math.min(4, Number(chip.getAttribute('data-pack-zone') || 1)));
      state.pack.zoneId = z;
      Haptics.light();
    });
  });

  document.querySelectorAll('[data-pack-barrel]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-pack-barrel]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.pack.targetBarrelIndex = Number(chip.getAttribute('data-pack-barrel') ?? -1);
      Haptics.light();
    });
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

  let memeTemplateCursor = 0;
  document.getElementById('btn-pack-meme-template')?.addEventListener('click', async () => {
    const frames = ['flashlight', 'weld', 'rec', 'stencil'];
    const idx = memeTemplateCursor % DEMO_PORTRAITS.length;
    const nextFrame = frames[memeTemplateCursor % frames.length];
    memeTemplateCursor += 1;

    state.pack.frameStyle = nextFrame;
    document.querySelectorAll('[data-frame]').forEach((c) => {
      c.classList.toggle('is-active', c.getAttribute('data-frame') === nextFrame);
    });

    const src = state.tg?.user?.photoUrl && memeTemplateCursor === 1
      ? state.tg.user.photoUrl
      : DEMO_PORTRAITS[idx];
    await rebuildPackPortraitPreview(src);
    showToast('🎲 Готовый мем-шаблон подставлен в 1 клик!');
    Haptics.light();
  });

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

  document.querySelectorAll('[data-pack-screamer]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-pack-screamer]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const nextScreamer = chip.getAttribute('data-pack-screamer') || 'weld';
      state.pack.screamerType = nextScreamer;
      state.round.screamerType = nextScreamer;
      if (nextScreamer === 'custom_scream') {
        showToast('🎙 Запиши 2-секундный крик ниже — он ударит по ушам при промахе!');
      } else if (nextScreamer === 'siren_cam') {
        showToast('🚨 Сирена цеха №19 + Авто-карточка жертвы активированы!');
      }
      Haptics.light();
    });
  });

  document.getElementById('btn-upsell-invite-pair')?.addEventListener('click', () => {
    openTelegramShare(
      'https://bochka.quest/',
      '🍿 Пойдём вдвоём в кино на триллер «БОЧКА» 17 декабря! Бери соседнее место:'
    );
    Haptics.light();
  });

  document.getElementById('btn-snap-victim-cam')?.addEventListener('click', async () => {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 480, height: 480 },
          audio: false,
        });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, 480, 480);
          ctx.strokeStyle = '#ff3b3b';
          ctx.lineWidth = 10;
          ctx.strokeRect(5, 5, 470, 470);
          ctx.fillStyle = '#ff3b3b';
          ctx.fillRect(0, 0, 480, 48);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🚨 ЖЕРТВА ЦЕХА №19 // ПОЙМАН НА СКРИМЕРЕ', 240, 32);
          state.round.victimCardDataUrl = canvas.toDataURL('image/webp', 0.86);
        }
        stream.getTracks().forEach((tr) => tr.stop());
      } else {
        state.round.victimCardDataUrl = createVictimCardDataUrl(state.round.portraitDataUrl);
      }
    } catch (_e) {
      state.round.victimCardDataUrl = createVictimCardDataUrl(state.round.portraitDataUrl);
    }
    const imgEl = document.getElementById('victim-card-img');
    if (imgEl && state.round.victimCardDataUrl) imgEl.src = state.round.victimCardDataUrl;
    showToast('📸 Снимок «Жертва цеха №19» готов к отправке в чат!');
    Haptics.success();
  });

  document.getElementById('btn-share-victim-card')?.addEventListener('click', async () => {
    const shareUrl = state.pack.lastShareUrl || 'https://bochka.quest/';
    const caption = '🚨 Меня поймала ловушка «Жертва цеха №19» в триллере «БОЧКА»! Попробуй выбраться за 3 удара:';
    const res = await shareNativeOrFallback({
      title: 'Жертва цеха №19 — БОЧКА',
      text: caption,
      url: shareUrl,
    });
    if (res === 'copied') {
      openTelegramShare(shareUrl, caption);
    }
    Haptics.success();
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
    audio.setModalAudioDuck(true);
    const modal = document.getElementById('modal-circle');
    const vid = document.getElementById('circle-video');
    modal?.removeAttribute('hidden');
    vid?.play().catch(() => {});
  });
  document.getElementById('btn-close-circle')?.addEventListener('click', () => {
    const vid = document.getElementById('circle-video');
    vid?.pause();
    audio.setModalAudioDuck(false);
    document.getElementById('modal-circle')?.setAttribute('hidden', '');
  });

  // Экран 5: Финал раунда и Суперигра «Гонка за Премьерой»
  document.getElementById('btn-finale-replay-voice')?.addEventListener('click', () => {
    if (state.round.voiceUrl) {
      audio.playCleanSenderVoice(state.round.voiceUrl, {
        useBarrelFilter: state.round.useBarrelFilter !== false,
      });
    }
  });

  document.getElementById('btn-copy-spoiler-report')?.addEventListener('click', async () => {
    const { reportText } = buildSpoilerFreeReport();
    await copyToClipboard(reportText);
    showToast('📋 Отчёт цеха скопирован — кидай в чат без спойлеров!');
    Haptics.success();
  });

  document.getElementById('btn-share-spoiler-tg')?.addEventListener('click', () => {
    const { reportText, challengeUrl } = buildSpoilerFreeReport();
    openTelegramShare(challengeUrl, reportText);
    Haptics.light();
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
    const feedbackBox = document.getElementById('finale-cinema-feedback-box');
    const feedbackText = document.getElementById('finale-cinema-feedback-text');
    const replyBtn = document.getElementById('btn-cinema-reply');
    const replyText = document.getElementById('btn-cinema-reply-text');
    if (feedbackText) {
      feedbackText.textContent = state.incomingPack?.senderName
        ? `Отлично! Сигнал отправлен ${state.incomingPack.senderName} в Telegram! Раз идёшь — зови друзей в цех, на премьере будет жарко!`
        : 'Отлично! Раз идёшь — зови друзей в цех, на премьере будет жарко!';
    }
    feedbackBox?.removeAttribute('hidden');
    if (replyText) replyText.textContent = '✓ ИДЁШЬ 17 ДЕКАБРЯ · ДРУГУ УШЛО СООБЩЕНИЕ!';
    if (replyBtn) replyBtn.disabled = true;
    showToast('🍿 Отлично! Раз идёшь — зови друзей в цех, на премьере будет жарко!');
    Haptics.success();
  });

  document.getElementById('btn-cinema-fast-invite')?.addEventListener('click', () => {
    const uid = encodeURIComponent(getViewerUid(state.tg?.user));
    openTelegramShare(
      `https://t.me/bochka_film_bot?startapp=ref_${uid}`,
      '🍿 Я иду на триллер «БОЧКА» 17 декабря! Залетай в 3D-цех и попробуй выбраться за 3 удара:'
    );
    Haptics.light();
  });

  document.getElementById('btn-finale-stage-next')?.addEventListener('click', () => {
    if (state.uiStage >= 4) {
      openDuelTable();
    } else {
      startPremiereRaceRound();
    }
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
    pauseActiveTrailerPlayback();
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
  document.getElementById('btn-trailer-like-yt')?.addEventListener('click', () => handleExternalTrailerLike('yt'));
  document.getElementById('btn-trailer-sub-yt')?.addEventListener('click', () => handleExternalTrailerLike('yt_sub'));
  document.getElementById('btn-trailer-like-ig')?.addEventListener('click', () => handleExternalTrailerLike('ig'));
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

  // Мульти-шеринг на экране упаковки бочки + Шаг 4 (отправить ссылку на трейлер после фото-бочки)
  document.getElementById('btn-pack-share-wa')?.addEventListener('click', () => triggerMultiSocialShare('wa', 'barrel'));
  document.getElementById('btn-pack-share-vk')?.addEventListener('click', () => triggerMultiSocialShare('vk', 'barrel'));
  document.getElementById('btn-pack-share-ig')?.addEventListener('click', () => triggerMultiSocialShare('ig', 'barrel'));
  document.getElementById('btn-pack-open-share-hub')?.addEventListener('click', () => openShareHubModal('trailer'));
  document.getElementById('btn-pack-step4-trailer')?.addEventListener('click', () => {
    triggerMultiSocialShare(state.tg?.inTelegram ? 'tg' : 'native', 'trailer');
  });
  document.getElementById('btn-pack-step4-yt')?.addEventListener('click', async () => {
    const ytText = '🎬 Новый официальный трейлер триллера «БОЧКА» (КиноЦех · в кино с 17 декабря):';
    const res = await shareNativeOrFallback({
      title: 'БОЧКА — Трейлер 2026',
      text: ytText,
      url: ENV.youtubeWatchUrl,
    });
    if (res === 'aborted') return;
    if (res === 'copied') showToast('▶ Ссылка на YouTube-трейлер скопирована!');
    markStep4TrailerShared();
    const bonus = await claimSocialOrPromoBonus(state.tg?.user, 'share_trailer', 'yt_direct').catch(() => null);
    if (bonus?.ok) {
      state.profile.premierePoints = bonus.premierePoints;
      state.profile.lives = bonus.lives;
      updatePremiereBarsUI();
    }
  });
  document.getElementById('quest-btn-step4-trailer')?.addEventListener('click', () => {
    let photoSent = Number(getQuestState()?.packedCount || 0) >= 1;
    try {
      if (localStorage.getItem('bochka_photo_barrel_sent') === '1') photoSent = true;
    } catch { /* ignore */ }
    if (!photoSent) {
      showScreen('pack');
      showToast('Сначала закатай и отправь другу фото-бочку — следом откроется Шаг 4!');
      return;
    }
    openShareHubModal('trailer');
  });

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
    closeLeaderboardModal({ startOrResumeGame: false });
  });
  document.getElementById('btn-leader-close-bottom')?.addEventListener('click', () => {
    closeLeaderboardModal({ startOrResumeGame: false });
  });
  document.getElementById('btn-leader-play-now')?.addEventListener('click', () => {
    closeLeaderboardModal({ startOrResumeGame: true });
  });
  document.getElementById('btn-leader-go-share')?.addEventListener('click', () => {
    closeLeaderboardModal({ startOrResumeGame: false });
    openShareHubModal('trailer');
  });
  document.getElementById('btn-leader-go-duel')?.addEventListener('click', () => {
    closeLeaderboardModal({ startOrResumeGame: false });
    openDuelTable();
  });

  // Закрытие информационных модалок по клику на тёмный фон (backdrop) и по клавише Escape
  for (const modalId of ['modal-leaderboard', 'modal-share-hub', 'modal-prize', 'modal-rules', 'modal-repeat-duel']) {
    const backdropEl = document.getElementById(modalId);
    backdropEl?.addEventListener('click', (e) => {
      if (e.target !== backdropEl) return;
      if (modalId === 'modal-leaderboard') {
        closeLeaderboardModal({ startOrResumeGame: false });
      } else {
        backdropEl.setAttribute('hidden', '');
        state.round.pausedForModal = false;
        if (state.activeScreen === 'workshop' && state.round.running) {
          scene?.setInteractive(true);
        }
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('modal-leaderboard')?.hasAttribute('hidden')) {
      closeLeaderboardModal({ startOrResumeGame: false });
      return;
    }
    for (const modalId of ['modal-share-hub', 'modal-prize', 'modal-rules', 'modal-repeat-duel']) {
      const m = document.getElementById(modalId);
      if (m && !m.hasAttribute('hidden')) {
        m.setAttribute('hidden', '');
        state.round.pausedForModal = false;
        if (state.activeScreen === 'workshop' && state.round.running) {
          scene?.setInteractive(true);
        }
      }
    }
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
  const txt = audio.enabled ? t('hudSoundOn') : t('hudSoundOff');
  const btn = document.getElementById('btn-hud-sound');
  if (btn) {
    btn.textContent = txt;
  }
  const burgerBtn = document.getElementById('btn-burger-sound');
  if (burgerBtn) {
    burgerBtn.textContent = audio.enabled ? `🔊 ${txt}` : `🔇 ${txt}`;
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
