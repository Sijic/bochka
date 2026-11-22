import { ENV, resolveSiteAsset } from './env.js';
import { initI18n, setLang, t, applyDomTranslations, onLangChange } from './i18n.js';
import {
  initTelegram,
  isAdminModeRequested,
  isTestBogRequested,
  isTestBogSessionActive,
  requestTelegramContact,
  requestTelegramWriteAccessIfNeeded,
  openTelegramShare,
  openNativeTelegramShareCard,
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
const BARREL_BATCH_CODES = ['01', '19', '97', '12', '17', '26', '33', '48', '71', '84', '92', '99'];
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
  sendDuelBroadcastPushToFriends,
  fetchMyWorkshopFriends,
  completeWorkshopLevel,
  claimSocialOrPromoBonus,
  claimLifeRecovery,
  fetchPremiereLeaderboard,
  fetchPublicRaffleTransparency,
  getPlayerRecoveryCode,
  restoreProfileByRecoveryCode,
  recordTrafficSource,
  buildBroadcastPrefix,
  registerTeamSeed,
  assignBroadcastVisitor,
  recordPlayerMeta,
  awardV8LevelProgress,
  checkFriendDuplicateConnection,
  fetchMyGameFriends,
  sendDirectGiftTicketToFriend,
  notifyReferrerTicketWon,
  sendLevel1FriendReply,
  syncTelegramWriteAccess,
  requestServerCinemaTicket,
  awardTicketShardServer,
  prepareNativeShareMessage,
  claimPersonalBarrelOpen,
  reconcileServerTicketPasses,
  reclaimServerTicketPass,
  fetchTicketPoolStatus,
  uploadPairTicketReceipt,
  fetchTelegramUserAvatarFallback,
} from './backend.js';
import { HorrorScreamerPlayer, preloadScreamerFrames } from './screamer-fx.js';
import {
  loadMediaSlots,
  showDuolingoCard,
  renderTicketPuzzleWidget,
  openAboutFilmModal,
  getTilCurrentLevel,
} from './v16_ux.js';
import { TilThreePhaseController } from './til_game.js';

const RANDOM_BARREL_SOUNDS = [
  'saw_scream',
  'lid_blast',
  'basement_shriek',
  'tesla_siren',
  'prank_rooster',
  'prank_dog_alarm',
];
function pickRandomBarrelSound() {
  return RANDOM_BARREL_SOUNDS[Math.floor(Math.random() * RANDOM_BARREL_SOUNDS.length)] || 'saw_scream';
}
let tilV16Ctrl = null;

const AIR_DURATION_SEC = 30.0;
const KP_MIN_AWAY_SEC = 3.5;
const TRAILER_UNLOCK_SEC = 20.0;
const STALE_YT_IDS = new Set(['EZFDcXeLTzQ', 'vAJpT_82uUo']);
const OFFICIAL_YT_TRAILER_ID = (ENV.youtubeFallbackId && !STALE_YT_IDS.has(ENV.youtubeFallbackId))
  ? ENV.youtubeFallbackId
  : 'OmyqxUXmqNY';
const OFFICIAL_YT_WATCH_URL = `https://www.youtube.com/watch?v=${OFFICIAL_YT_TRAILER_ID}`;

const SCREAMER_META = [
  { key: 'pastor', img: './public/sprites/horror_hero_captive.webp', imgB: './public/sprites/horror_hero_captive_f2.webp', motion: 'captive_hand_mouth', strobeHex: 0xdc2626, audioIdx: 5, i18n: 'screamerPastor' },
  { key: 'pastor', img: './public/sprites/horror_hero_warden.webp', imgB: './public/sprites/horror_hero_warden_f2.webp', motion: 'warden_eyes', strobeHex: 0xf59e0b, audioIdx: 1, i18n: 'screamerPastor' },
  { key: 'blogger', img: './public/sprites/horror_hero_mechanic.webp', imgB: './public/sprites/horror_hero_mechanic_f2.webp', motion: 'mechanic_flashlight', strobeHex: 0x38bdf8, audioIdx: 3, i18n: 'screamerBlogger' },
  { key: 'hand', img: './public/sprites/horror_barrel_face.webp', imgB: './public/sprites/horror_barrel_face_f2.webp', motion: 'barrel_face', strobeHex: 0xdc2626, audioIdx: 0, i18n: 'screamerHand' },
  { key: 'father', img: './public/sprites/horror_claw_hands.webp', imgB: '', motion: 'claw_hands', strobeHex: 0xffffff, audioIdx: 2, i18n: 'screamerFather' },
  { key: 'hand', img: './public/sprites/horror_gasmask_weld.webp', imgB: '', motion: 'gasmask_weld', strobeHex: 0xf97316, audioIdx: 4, i18n: 'screamerHand' },
  { key: 'blogger', img: './public/sprites/horror_cctv_face.webp', imgB: '', motion: 'cctv_glitch', strobeHex: 0x22c55e, audioIdx: 6, i18n: 'screamerBlogger' },
];
let screamerPlayer = null;

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
    lives: 1,
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
    mustSendFriendPack: false,
    pendingTicketsCount: 0,
    ticketsExpireAt: 0,
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
    barrelCount: 4,
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
    screamerType: 'saw_scream',
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
    screamerType: 'saw_scream',
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
let sceneInitPromise = null;
let voiceRecorder = null;
let duelCtrl = null;
let duelInitPromise = null;
let duelModCache = null;
let screamersPreloaded = false;

async function ensureSceneReady() {
  if (scene) return scene;
  if (sceneInitPromise) return sceneInitPromise;
  sceneInitPromise = (async () => {
    try {
      const { WorkshopScene } = await import('./scene.js');
      if (scene) return scene;
      const canvas = document.getElementById('workshop-canvas');
      scene = new WorkshopScene(canvas, {
        onHoverBarrel: handleBarrelHover,
        onStrikeBarrel: handleBarrelStrike,
        onCameraMove: (camPos) => audio.updateListenerCamera(camPos),
        onCeilingDrip: (x, z) => audio.playSpatialCeilingDrip(x, z),
        onBarrelEerie: (idx, kind) => {
          if (state.activeScreen === 'workshop' && !state.round?.pausedForModal) {
            audio.playBarrelEerieSound?.(idx, kind);
          }
        },
      });
      scene.onEmptyBarrelHit = (idx) => audio.playEmptyBarrelClang?.(idx);
      scene.onSteamBurst = () => audio.playSteamWarningHiss?.();
      audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round?.targetIndex || 0);
      if (!screamersPreloaded) {
        screamersPreloaded = true;
        window.setTimeout(() => preloadScreamerFrames(SCREAMER_META), 250);
      }
      return scene;
    } catch (err) {
      sceneInitPromise = null;
      throw err;
    }
  })();
  return sceneInitPromise;
}

async function ensureDuelReady() {
  if (duelCtrl) return duelCtrl;
  if (duelInitPromise) return duelInitPromise;
  duelInitPromise = (async () => {
    await ensureSceneReady();
    const mod = duelModCache || (await import('./duel.js?v=155'));
    duelModCache = mod;
    if (duelCtrl) return duelCtrl;
    duelCtrl = new mod.WorkshopDuelController({
      scene,
      audio,
      getTgUser: () => state.tg?.user || null,
      onOpenHallOfFame: () => openHallOfFameModal().catch(() => {}),
      onProfileSync: (patch) => {
        state.profile = { ...state.profile, ...patch };
        if (patch && patch.ticketShards != null) {
          saveLocalV9Flags();
          syncTicketShardsUI({ pulse: true });
        }
        updatePremiereBarsUI();
        refreshHudLevelLabel();
      },
      onToast: (msg) => showToast(msg),
      onOpenInviteShare: () => pushDuelToFriends(),
      onOpenGoldenFork: () => openGoldenTicketForkModal(),
      onExitToHub: () => showScreen('modeA'),
      onDuelDefeatToTil: ({ roomId, solo } = {}) => {
        state.oceanTapper.returnDuel = { roomId: roomId || '', solo: Boolean(solo) };
        duelCtrl?.leaveRoom(false);
        triggerOceanEasterEggScene();
      },
      onFlyRating: ({ count = 3, label = '⭐ +БАЛЛЫ', barrelIndex = -1 } = {}) => {
        const pos = barrelIndex >= 0 ? scene?.projectBarrelScreenPos?.(barrelIndex, 1.05) : null;
        flyRewardToHud({
          type: 'rating',
          count,
          label,
          startX: pos?.visible ? pos.x : null,
          startY: pos?.visible ? pos.y : null,
        });
        syncSuperPrizeRatingBarUI();
      },
      onFlyLife: ({ count = 1, label = '+1 ❤️', barrelIndex = -1 } = {}) => {
        const pos = barrelIndex >= 0 ? scene?.projectBarrelScreenPos?.(barrelIndex, 1.05) : null;
        flyRewardToHud({
          type: 'lives',
          count,
          label,
          startX: pos?.visible ? pos.x : null,
          startY: pos?.visible ? pos.y : null,
        });
      },
      onReturnToLevels: () => {
        duelCtrl?.leaveRoom(false);
        showToast('🔄 3 раунда дуэли без части билета — возвращаемся в цех спасать пацана и набивать ⭐!');
        startDemoRound();
      },
    });
    return duelCtrl;
  })();
  return duelInitPromise;
}

async function createWatchChannelLazy(barrelId, opts) {
  const mod = duelModCache || (await import('./duel.js?v=155'));
  duelModCache = mod;
  return mod.createBarrelWatchChannel(barrelId, opts);
}

let trophiesModCache = null;
async function loadTrophiesMod() {
  if (!trophiesModCache) {
    trophiesModCache = await import('./trophies.js?v=155');
  }
  return trophiesModCache;
}

async function openHallOfFameModal() {
  const modal = document.getElementById('modal-hall-of-fame');
  const body = document.getElementById('hof-modal-body');
  if (!modal || !body) return;

  if (state.round.running) {
    state.round.pausedForModal = true;
    scene?.setInteractive(false);
  }
  closeBurgerDrawer();
  modal.removeAttribute('hidden');
  body.textContent = 'Загрузка Зала славы…';

  const mod = await loadTrophiesMod();
  await loadMediaSlots().catch(() => {});
  const data = await mod.fetchHallOfFame(state.tg?.user || null);
  mod.renderHallOfFameModal(body, data, {
    onInviteFriend: () => {
      modal.setAttribute('hidden', '');
      state.round.pausedForModal = false;
      showScreen('pack');
    },
    onOpenChipDuel: () => {
      modal.setAttribute('hidden', '');
      state.round.pausedForModal = false;
      openDuelTable('', { initialMode: 'chips', prefetchedHof: data }).catch(() => {});
    },
    onPlayTil: (lvl) => {
      modal.setAttribute('hidden', '');
      state.round.pausedForModal = false;
      openTilThreePhaseGame(lvl);
    },
  });
}

async function collectBarrelTrophyLazy(barrelId) {
  if (!barrelId) return null;
  try {
    const mod = await loadTrophiesMod();
    const res = await mod.collectBarrelTrophy(state.tg?.user || null, barrelId);
    if (res?.ok && res.collected && res.trophy) {
      const tag = res.trophy.rarity === 'blogger' ? '🌟 Блогерская фишка' : '🪙 Фото-фишка';
      showToast(`${tag} «${res.trophy.label}» добавлена в Зал славы!`);
    }
    return res;
  } catch {
    return null;
  }
}

async function rollRareMovieCardLazy(source) {
  try {
    const mod = await loadTrophiesMod();
    const res = await mod.mintRareMovieCard(state.tg?.user || null, source);
    if (res?.ok && res.dropped && res.trophy) {
      const num = res.trophy.serial_number
        ? ` #${String(res.trophy.serial_number).padStart(3, '0')}/${res.trophy.max_supply || 100}`
        : '';
      showToast(`🃏 Карточка фильма «${res.trophy.label}»${num} в Зале славы!`);
    }
    return res;
  } catch {
    return null;
  }
}

let legalModCache = null;
async function openLegalModal(tab = 'rules') {
  const modal = document.getElementById('modal-legal');
  const body = document.getElementById('legal-modal-body');
  if (!modal || !body) return;

  if (state.round.running) {
    state.round.pausedForModal = true;
    scene?.setInteractive(false);
  }

  modal.removeAttribute('hidden');
  document.querySelectorAll('[data-legal-tab]').forEach((btn) => {
    const active = (btn.getAttribute('data-legal-tab') || 'rules') === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  if (!legalModCache) {
    body.textContent = 'Загрузка документов…';
    legalModCache = await import('./legal.js?v=155');
  }
  legalModCache.renderLegalSectionInto(body, tab);
}

const V9_PROGRESS_STORAGE_KEY = 'bochka_v9_progress';

// v14.1: Распознавание начальных ссылок посева — продюсеры (src_prod1..6 / src_prd1..6) и блогеры с именем на конце (src_blogger_<имя>)
function parseSeedSourceMeta(rawSrc = '') {
  const clean = String(rawSrc || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (!clean.startsWith('src_')) return { isSeed: false, kind: '', num: '', slugName: '', label: '', tag: '' };

  let m = clean.match(/^src_(?:prod|prd)(\d*)(?:_(.+))?$/);
  if (m) {
    const num = m[1] || '';
    const slugName = (m[2] || '').replace(/_+/g, ' ').trim().toUpperCase();
    const label = `ПРОДЮСЕР${num ? ` #${num}` : ''}${slugName ? ` · ${slugName}` : ''}`;
    return { isSeed: true, kind: 'producer', num, slugName, label, tag: clean };
  }

  m = clean.match(/^src_blogger(\d*)(?:_(.+))?$/);
  if (m) {
    const num = m[1] || '';
    const slugName = (m[2] || '').replace(/_+/g, ' ').trim().toUpperCase();
    const label = `БЛОГЕР${num ? ` #${num}` : ''}${slugName ? ` · ${slugName}` : ''}`;
    return { isSeed: true, kind: 'blogger', num, slugName, label, tag: clean };
  }

  m = clean.match(/^src_seed(?:_(.+))?$/);
  if (m) {
    const slugName = (m[1] || '').replace(/_+/g, ' ').trim().toUpperCase();
    const label = `ПОСЕВ${slugName ? ` · ${slugName}` : ''}`;
    return { isSeed: true, kind: 'seed', num: '', slugName, label, tag: clean };
  }

  return { isSeed: false, kind: '', num: '', slugName: '', label: '', tag: clean };
}

// v14.3: Две чистые командные ветки посева (team_prod -> pr_<id>, team_blog / bi_<id> -> bl_<id>)
function getTeamSeedRole() {
  if (state.tg?.teamSeedRole === 'prod' || state.tg?.teamSeedRole === 'blog') {
    return state.tg.teamSeedRole;
  }
  if (state.profile?.isBloggerSeed) return 'blog';
  if (state.profile?.isSeedAdmin) return 'prod';
  return '';
}

function isProducerPackFirstRequired() {
  if (state.incomingParam || state.incomingPassId || state.tg?.duelRoomParam || state.tg?.watchBarrelParam) {
    return false;
  }
  return (
    getTeamSeedRole() === 'prod' &&
    !state.profile?.hasBroadcastBarrel &&
    !state.profile?.seedFirstPackDone &&
    Number(state.profile?.packedCount || 0) <= 0
  );
}

function isInitialSeedPackRequired() {
  return isProducerPackFirstRequired();
}

function refreshInitialSeedGateUI() {
  const banner = document.getElementById('gate-seed-banner');
  const friendCallout = document.getElementById('gate-friend-callout');
  const enterSoundLabel = document.getElementById('btn-enter-sound-label') || document.querySelector('#btn-enter-sound span');
  const packFriendBtn = document.getElementById('btn-gate-pack-friend');
  const role = getTeamSeedRole();

  // Обновляем наглядную шкалу-пазл билета «5 букв» на стартовом экране
  const gatePuzzleHost = document.getElementById('gate-ticket-puzzle');
  if (gatePuzzleHost) {
    renderTicketPuzzleWidget(gatePuzzleHost, {
      shards: Number(state.profile?.ticketShards || 0),
      pendingTickets: Number(state.profile?.pendingTicketsCount || 0),
      nextStepHint: state.incomingParam
        ? 'Открой бочку друга и сыграй с Тилем → +1 часть'
        : 'Следующий шаг: +1 часть за игру с Тилем',
      onClaim: () => {
        audio.unlockSync(true);
        state.entered = true;
        openGoldenTicketForkModal();
      },
    });
  }

  if (role === 'prod' && !state.incomingParam) {
    const pref = buildBroadcastPrefix('prod', state.tg?.user);
    if (banner) {
      banner.textContent = `🎬 КОМАНДА ПРОДЮСЕРОВ (${pref}) — Запакуй СЕБЯ 1 раз и получи общую ссылку pr_... для друзей и чатов.`;
      banner.removeAttribute('hidden');
    }
    friendCallout?.setAttribute('hidden', '');
    if (enterSoundLabel) enterSoundLabel.textContent = '🎬 ЗАПАКОВАТЬ СЕБЯ И ПОЛУЧИТЬ ССЫЛКУ';
    packFriendBtn?.setAttribute('hidden', '');
    return;
  }
  if (role === 'blog') {
    const pref = buildBroadcastPrefix('blog', state.tg?.user);
    if (banner) {
      banner.textContent = `🔥 ВХОД ДЛЯ БЛОГЕРА (${pref}) — Играй с Тилем или запакуй бочку и получи общую ссылку bl_... для Stories!`;
      banner.removeAttribute('hidden');
    }
    friendCallout?.setAttribute('hidden', '');
    if (enterSoundLabel) enterSoundLabel.textContent = '▶ ИГРАТЬ С ТИЛЕМ';
    packFriendBtn?.removeAttribute('hidden');
    return;
  }

  banner?.setAttribute('hidden', '');

  // Путь А: пришёл по бочке от друга
  if (state.incomingParam) {
    friendCallout?.removeAttribute('hidden');
    if (enterSoundLabel) enterSoundLabel.textContent = '🛢 НАЙТИ СЕБЯ В БОЧКЕ';
    packFriendBtn?.setAttribute('hidden', '');
  } else {
    // Путь Б: пришёл напрямую -> сразу «Играть с Тилем» + аккуратная кнопка «Спрятать друга в бочке»
    friendCallout?.setAttribute('hidden', '');
    if (enterSoundLabel) enterSoundLabel.textContent = '▶ ИГРАТЬ С ТИЛЕМ';
    packFriendBtn?.removeAttribute('hidden');
  }
}

function applySeedPackModeUI(active) {
  const ban = document.getElementById('pack-mandatory-banner');
  const tagEl = document.getElementById('pack-screen-tag');
  const titleEl = document.getElementById('pack-screen-title');
  const customDetails = document.getElementById('pack-custom-details');
  const role = getTeamSeedRole();
  if (active && (role === 'prod' || role === 'blog')) {
    const pref = buildBroadcastPrefix(role, state.tg?.user);
    const isBlog = role === 'blog';
    if (tagEl) {
      tagEl.textContent = isBlog
        ? `🔥 БЛОГЕР-БОЧКА · АВТОНУМЕРАЦИЯ ${pref}_1..∞`
        : `🎬 ПРОДЮСЕР-БОЧКА · АВТОНУМЕРАЦИЯ ${pref}_1..∞`;
    }
    if (titleEl) {
      titleEl.textContent = isBlog ? 'ЗАПАКУЙ СЕБЯ ДЛЯ STORIES И КАНАЛА' : 'ЗАПАКУЙ СЕБЯ В ОБЩУЮ БОЧКУ';
    }
    if (ban) {
      ban.textContent = isBlog
        ? `🔥 Запакуй СЕБЯ (своё лицо + крик/скример) 1 раз → получишь ОДНУ общую ссылку bl_... для Stories и канала! Всем подписчикам сервер сам выдаст номера ${pref}_1, ${pref}_2...`
        : `🎬 Запакуй СЕБЯ 1 раз → получишь ОДНУ общую ссылку pr_... для всех друзей и чатов! Каждому сервер сам выдаст номер ${pref}_1, ${pref}_2... (розыгрыши на команду не действуют).`;
      ban.removeAttribute('hidden');
    }
    if (customDetails) customDetails.open = true;
    return;
  }
  if (tagEl) tagEl.textContent = 'ФОТО УЖЕ ГОТОВО — ЖМИ ОТПРАВИТЬ ИЛИ ЗАМЕНИ';
  if (titleEl) titleEl.textContent = 'УПАКУЙ В БОЧКУ ДРУГА';
  if (ban) {
    ban.textContent = '🔒 Чтобы выиграть парный билет 1+1 и играть дальше на супер-приз — отправь пранк другу в 1 касание!';
    if (!state.profile.mustSendFriendPack) ban.setAttribute('hidden', '');
  }
  if (customDetails) customDetails.open = false;
}

const ACTIVE_TG_ACCOUNT_KEY = 'bochka_active_tg_account';

/**
 * v15.2: Изоляция localStorage между разными Telegram-аккаунтами на одном телефоне!
 * В Telegram WebView localStorage общий на весь origin — при переключении аккаунта
 * полностью чистим старый локальный прогресс, чтобы новый аккаунт стартовал с чистого Ур. 1.
 */
function enforceTelegramAccountIsolation(tgUser) {
  try {
    const tgId = tgUser?.id ? String(tgUser.id).trim() : '';
    if (!tgId) return false;
    const nextAcc = `tg_${tgId}`;
    const prevAcc = localStorage.getItem(ACTIVE_TG_ACCOUNT_KEY) || '';
    if (prevAcc === nextAcc) return false;

    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /bochka|tbog/i.test(k) && k !== 'bochka_lang' && k !== ACTIVE_TG_ACCOUNT_KEY) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    const sRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && /bochka|tbog/i.test(k)) sRemove.push(k);
    }
    sRemove.forEach((k) => sessionStorage.removeItem(k));
    localStorage.setItem(ACTIVE_TG_ACCOUNT_KEY, nextAcc);
    state.uiStage = 1;
    state.profile.currentLevel = 1;
    state.profile.premierePoints = 0;
    state.profile.ticketShards = 0;
    state.profile.pendingTicketsCount = 0;
    state.profile.hasPendingTicket = false;
    state.profile.seedFirstPackDone = false;
    state.profile.hasBroadcastBarrel = false;
    state.profile.mustSendFriendPack = false;
    state.profile.packedCount = 0;
    state.profile.hasPlayedSolo = false;
    return true;
  } catch {
    return false;
  }
}

function loadLocalV9Flags() {
  try {
    const raw = JSON.parse(localStorage.getItem(V9_PROGRESS_STORAGE_KEY) || '{}');
    if (raw && typeof raw === 'object') {
      state.profile.mustSendFriendPack = Boolean(raw.mustSendFriendPack);
      state.profile.seedFirstPackDone = Boolean(raw.seedFirstPackDone);
      state.profile.ticketShards = Math.max(0, Math.min(3, Math.round(Number(raw.ticketShards || 0))));
      state.profile.friendsShardAwardedCount = Math.max(0, Math.round(Number(raw.friendsShardAwardedCount || 0)));
      const cnt = Math.max(0, Math.round(Number(raw.pendingTicketsCount || 0)));
      const exp = Number(raw.ticketsExpireAt || 0);
      if (cnt > 0 && exp > Date.now()) {
        state.profile.pendingTicketsCount = cnt;
        state.profile.ticketsExpireAt = exp;
        state.profile.hasPendingTicket = true;
      } else {
        state.profile.pendingTicketsCount = 0;
        state.profile.ticketsExpireAt = 0;
      }
    }
  } catch { /* ignore */ }
}

function saveLocalV9Flags() {
  try {
    localStorage.setItem(
      V9_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        mustSendFriendPack: Boolean(state.profile.mustSendFriendPack),
        seedFirstPackDone: Boolean(state.profile.seedFirstPackDone),
        ticketShards: Math.max(0, Math.min(3, Math.round(Number(state.profile.ticketShards || 0)))),
        friendsShardAwardedCount: Math.max(0, Math.round(Number(state.profile.friendsShardAwardedCount || 0))),
        pendingTicketsCount: Math.max(0, Math.round(Number(state.profile.pendingTicketsCount || 0))),
        ticketsExpireAt: Number(state.profile.ticketsExpireAt || 0),
      })
    );
  } catch { /* ignore */ }
}

function syncTicketShardsUI({ pulse = false, showFullFlash = false, justEarned = 0 } = {}) {
  const shards = showFullFlash ? 4 : Math.max(0, Math.min(3, Math.round(Number(state.profile?.ticketShards || 0))));
  const label = `${shards}/4`;
  for (const id of ['top-shards-count', 'hud-shards-count', 'burger-shards-count']) {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  }
  for (const pillId of ['top-ticket-shards', 'hud-ticket-shards']) {
    const pill = document.getElementById(pillId);
    if (!pill) continue;
    pill.querySelectorAll('.shard-q').forEach((qEl) => {
      const idx = Number(qEl.getAttribute('data-shard') || 0);
      qEl.classList.toggle('is-filled', idx <= shards);
      qEl.classList.remove('is-just-earned');
      if ((justEarned > 0 && idx === justEarned) || (showFullFlash && idx <= 4)) {
        void qEl.offsetWidth;
        qEl.classList.add('is-just-earned');
      }
    });
    if (pulse) {
      pill.classList.remove('is-merging');
      void pill.offsetWidth;
      pill.classList.add('is-merging');
      window.setTimeout(() => pill.classList.remove('is-merging'), 1000);
    }
  }
}

/**
 * v15.2: SVG-картинка выбитой четвертинки кинобилета «БОЧКА» для анимации вылета из бочки (вместо пацана!)
 */
function createTicketShardDataUrl(shards = 1, merged = false) {
  const count = merged ? 4 : Math.max(1, Math.min(4, Number(shards || 1)));
  const cells = [1, 2, 3, 4]
    .map((i) => {
      const x = 18 + (i - 1) * 56;
      const filled = i <= count;
      const isNew = i === count;
      const fill = filled ? 'url(#goldG)' : '#1e293b';
      const stroke = isNew ? '#ffffff' : filled ? '#facc15' : '#475569';
      const textCol = filled ? '#111827' : '#64748b';
      return (
        `<rect x="${x}" y="52" width="48" height="62" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${isNew ? 3 : 1.5}" ${filled ? '' : 'stroke-dasharray="4 3"'}/>` +
        `<text x="${x + 24}" y="82" text-anchor="middle" font-family="monospace" font-size="14" font-weight="900" fill="${textCol}">${i}/4</text>` +
        `<text x="${x + 24}" y="99" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="${textCol}">${i * 25}%</text>`
      );
    })
    .join('');
  const title = merged ? '4/4 БИЛЕТ СКЛЕЕН!' : `ЧАСТЬ БИЛЕТА ${count}/4`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="160" viewBox="0 0 260 160">` +
    `<defs><linearGradient id="goldG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="55%" stop-color="#eab308"/><stop offset="100%" stop-color="#b45309"/></linearGradient></defs>` +
    `<rect x="4" y="4" width="252" height="152" rx="14" fill="#0f141d" stroke="#facc15" stroke-width="2.5"/>` +
    `<text x="130" y="34" text-anchor="middle" font-family="monospace" font-size="14" font-weight="900" fill="#fef08a">${title}</text>` +
    `${cells}` +
    `<text x="130" y="139" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#e2e8f0">КИНОБИЛЕТ «БОЧКА» · 17 ДЕКАБРЯ</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * v15.2: Анимированный 4-сегментный кинобилет на экране победы #screen-finale
 */
function renderFinaleShardVisual({ shards = 1, merged = false } = {}) {
  const box = document.getElementById('finale-shard-visual');
  const cntEl = document.getElementById('finale-shard-counter');
  const footEl = document.getElementById('finale-shard-footer');
  if (!box) return;
  const filledCount = merged ? 4 : Math.max(0, Math.min(4, Number(shards ?? 0)));
  box.removeAttribute('hidden');
  box.classList.toggle('is-merged', Boolean(merged || filledCount >= 4));
  if (cntEl) cntEl.textContent = `${filledCount} / 4`;
  if (footEl) {
    footEl.textContent = merged
      ? '🎉 Все 4 части склеились в целый бесплатный билет в кино для друга (без чеков)!'
      : filledCount > 0
        ? `Осталось ещё ${4 - filledCount} из 4 — собери целый бесплатный билет другу (без чеков)!`
        : 'Собери 4 куска билета — подари другу бесплатный билет в кино (без чеков)!';
  }
  box.querySelectorAll('.fst-piece').forEach((pEl) => {
    const idx = Number(pEl.getAttribute('data-piece') || 0);
    pEl.classList.toggle('is-collected', filledCount > 0 && idx <= filledCount);
    pEl.classList.remove('is-just-earned');
    if ((filledCount > 0 && idx === filledCount) || (merged && idx <= 4)) {
      void pEl.offsetWidth;
      pEl.classList.add('is-just-earned');
    }
  });
}

async function awardTicketShard(source = 'level', { silent = false } = {}) {
  const res = await awardTicketShardServer(state.tg?.user, source);
  if (!res || !res.ok) {
    return { merged: false, granted: false, capReached: false, shards: Number(state.profile?.ticketShards || 0), res };
  }
  if (res.reason === 'seed_admin_excluded') {
    if (!silent) showToast('🛡 Режим команды посева: билет из призового пула сохранён для реальных зрителей!');
    return { merged: false, granted: false, seedExcluded: true, shards: Number(state.profile?.ticketShards || 0), res };
  }
  if (res.duplicateBlocked) {
    const keepSh = Math.max(0, Math.min(3, Number(res.shards ?? state.profile?.ticketShards ?? 0)));
    state.profile.ticketShards = keepSh;
    syncTicketShardsUI();
    return { merged: false, granted: false, duplicateBlocked: true, shards: keepSh, res };
  }
  if (res.mergedTicket && res.granted) {
    syncTicketShardsUI({ pulse: true, showFullFlash: true });
    state.profile.ticketShards = 0;
    state.profile.pendingTicketsCount = Math.max(
      Number(res.pendingTicketsCount || 0),
      Number(state.profile.pendingTicketsCount || 0) + 1
    );
    state.profile.hasPendingTicket = true;
    state.profile.ticketsExpireAt = Date.now() + 24 * 3600 * 1000;
    saveLocalV9Flags();
    syncPendingTicketsFloatingUI();
    updatePremiereBarsUI();
    window.setTimeout(() => syncTicketShardsUI({ pulse: false }), 1100);
    if (!silent) {
      showToast('🎟 4/4! Четыре части склеились в ЦЕЛЫЙ БЕСПЛАТНЫЙ БИЛЕТ для друга! Отправь его в Telegram!');
    }
    return { merged: true, granted: true, shards: 0, res };
  }
  if (res.reason && res.reason !== 'local_preview') {
    const bonusFallback = Number(res.fallbackPoints || 500);
    state.profile.ticketShards = 0;
    state.profile.premierePoints = Math.max(
      Number(res.premierePoints || 0),
      Number(state.profile.premierePoints || 0) + bonusFallback
    );
    saveLocalV9Flags();
    syncTicketShardsUI({ pulse: true });
    updatePremiereBarsUI();
    if (!silent) {
      showToast(
        `⭐ Дневная партия билетов (6 шт.) сегодня разобрана — новая откроется в 00:00 МСК! Держи +${bonusFallback} ⭐ в рейтинг Закрытого показа в Москве!`
      );
    }
    return { merged: false, granted: false, capReached: true, fallbackPoints: bonusFallback, shards: 0, res };
  }
  const nextShards = Math.max(0, Math.min(3, Number(res.shards || 0)));
  state.profile.ticketShards = nextShards;
  saveLocalV9Flags();
  syncTicketShardsUI({ pulse: true, justEarned: nextShards });
  if (!silent) {
    showToast(`🎟 Собрана часть билета ${nextShards}/4 (${nextShards * 25}%)! Собери 4/4 и подари другу бесплатный билет!`);
  }
  return { merged: false, granted: false, capReached: false, shards: nextShards, res };
}

function mergeFreshProfile(freshProfile, { preserveProgress = true } = {}) {
  if (!freshProfile || typeof freshProfile !== 'object') return;
  const prev = state.profile || {};
  const isFreshSrv = Boolean(freshProfile._isFreshServer);
  if (isFreshSrv) {
    // Сервер подтвердил чистого нового игрока (или база обнулена) — чистим устаревший localStorage!
    try {
      localStorage.removeItem(SESSION_RESUME_STORAGE_KEY);
    } catch { /* ignore */ }
    const cleanMerged = {
      ...prev,
      ...freshProfile,
      currentLevel: 1,
      premierePoints: 0,
      hasPlayedSolo: false,
      packedCount: 0,
      pendingTicketsCount: Math.max(0, Number(freshProfile.pendingTicketsCount || 0)),
      hasPendingTicket: Boolean(freshProfile.hasPendingTicket),
      ticketShards: Math.max(0, Math.min(3, Number(freshProfile.ticketShards || 0))),
      mustSendFriendPack: false,
      seedFirstPackDone: Boolean(freshProfile.hasBroadcastBarrel),
      hasBroadcastBarrel: Boolean(freshProfile.hasBroadcastBarrel),
      repeatLinkEntered: false,
    };
    state.profile = cleanMerged;
    state.uiStage = Math.min(2, Math.max(1, Number(freshProfile.uiStage || 1)));
    saveLocalV9Flags();
    syncTicketShardsUI();
    return;
  }

  const keptPending = Math.max(0, Math.round(Number(prev.pendingTicketsCount || 0)));
  const keptExpire = Number(prev.ticketsExpireAt || 0);
  const keptMustSend = Boolean(prev.mustSendFriendPack);
  const keptShards = Math.max(0, Math.min(3, Math.round(Number(prev.ticketShards || 0))));
  const keptFriendsAwarded = Math.max(0, Math.round(Number(prev.friendsShardAwardedCount || 0)));
  const merged = { ...prev, ...freshProfile };
  if (preserveProgress) {
    merged.currentLevel = Math.max(Number(prev.currentLevel || 1), Number(freshProfile.currentLevel || 1));
    merged.premierePoints = Math.max(Number(prev.premierePoints || 0), Number(freshProfile.premierePoints || 0));
  }
  merged.pendingTicketsCount = Math.max(keptPending, Number(freshProfile.pendingTicketsCount || 0));
  merged.ticketsExpireAt = keptExpire;
  merged.mustSendFriendPack = keptMustSend;
  merged.hasPendingTicket = merged.pendingTicketsCount > 0;
  merged.ticketShards =
    freshProfile.ticketShards != null
      ? Math.max(0, Math.min(3, Number(freshProfile.ticketShards)))
      : keptShards;
  merged.hasBroadcastBarrel = Boolean(freshProfile.hasBroadcastBarrel || prev.hasBroadcastBarrel);
  if (!merged.hasBroadcastBarrel && Number(merged.packedCount || 0) <= 0) {
    merged.seedFirstPackDone = false;
  }
  merged.friendsShardAwardedCount = keptFriendsAwarded;
  if (typeof merged.lives === 'number') {
    merged.lives = capEarlyLivesIfNoRealFriends(merged.lives);
  }
  state.profile = merged;
  saveLocalV9Flags();
  syncTicketShardsUI();
}

/* ============================================================================
   v13.1: ЗАПОМИНАНИЕ ПРОГРЕССА РАУНДОВ + 1 ЖИЗНЬ И 3 УДАРА РАЗ В СУТКИ + 1 УДАР/ЧАС
   ============================================================================ */
const SESSION_RESUME_STORAGE_KEY = 'bochka_v13_session_resume';
const HOURLY_STRIKE_REGEN_MS = 60 * 60 * 1000;

function getMoscowDateKey(ts = Date.now()) {
  try {
    const msk = new Date(ts + 3 * 3600 * 1000);
    return msk.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function readSessionResume() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_RESUME_STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch { /* ignore */ }
  return null;
}

function saveSessionResumeSnapshot(overrides = {}) {
  try {
    const prev = readSessionResume() || {};
    const curLvl = Math.max(
      1,
      Number(overrides.currentLevel ?? state.profile?.currentLevel ?? state.round?.workshopLevel ?? prev.currentLevel ?? 1)
    );
    const maxAtt = state.round?.isBlitz ? 5 : 3;
    const rawAtt = overrides.attemptsLeft != null
      ? Number(overrides.attemptsLeft)
      : state.activeScreen === 'workshop' && state.round?.running
        ? Number(state.round?.attemptsLeft ?? 3)
        : Number(prev.attemptsLeft ?? 3);
    const cleanAtt = Math.max(0, Math.min(maxAtt, Math.round(rawAtt)));
    const curLives = Math.max(0, Math.round(Number(overrides.lives ?? state.profile?.lives ?? prev.lives ?? 1)));
    const curPts = Math.max(0, Math.round(Number(overrides.premierePoints ?? state.profile?.premierePoints ?? prev.premierePoints ?? 0)));

    // Если удары < 3 и таймер почасового восстановления ещё не запущен — фиксируем старт отсчёта!
    let nextRegenAt = overrides.lastStrikeRegenAt !== undefined
      ? Number(overrides.lastStrikeRegenAt || 0)
      : Number(prev.lastStrikeRegenAt || 0);
    if (cleanAtt < 3 && nextRegenAt <= 0) {
      nextRegenAt = Date.now();
    } else if (cleanAtt >= 3) {
      nextRegenAt = 0;
    }

    const snap = {
      currentLevel: curLvl,
      lastScreen: String(overrides.lastScreen || state.activeScreen || prev.lastScreen || 'workshop'),
      attemptsLeft: cleanAtt,
      lives: curLives,
      premierePoints: curPts,
      mustSendFriendPack: Boolean(state.profile?.mustSendFriendPack),
      lastDailyLifeDate: String(overrides.lastDailyLifeDate || prev.lastDailyLifeDate || getMoscowDateKey()),
      lastStrikeRegenAt: nextRegenAt,
      savedAt: Date.now(),
    };
    localStorage.setItem(SESSION_RESUME_STORAGE_KEY, JSON.stringify(snap));
    return snap;
  } catch {
    return null;
  }
}

function applyPassiveDailyLifeAndHourlyStrikes({ silent = false } = {}) {
  const prev = readSessionResume();
  const now = Date.now();
  const todayMsk = getMoscowDateKey(now);
  if (!prev) {
    return {
      dailyLifeGranted: false,
      hourlyStrikesGranted: 0,
      snapshot: saveSessionResumeSnapshot({ lastDailyLifeDate: todayMsk }),
    };
  }

  let lives = Math.max(
    0,
    Math.round(Number(state.profile?.lives != null ? state.profile.lives : prev.lives ?? 1))
  );
  // Если в сохранённой сессии уровень/очки выше — восстанавливаем их без потери прогресса!
  const savedLvl = Math.max(1, Number(prev.currentLevel || 1));
  const savedPts = Math.max(0, Math.round(Number(prev.premierePoints || 0)));
  if (savedLvl > Number(state.profile?.currentLevel || 1)) {
    state.profile.currentLevel = savedLvl;
  }
  if (savedPts > Number(state.profile?.premierePoints || 0)) {
    state.profile.premierePoints = savedPts;
  }

  let attemptsLeft = Math.max(0, Math.min(3, Math.round(Number(prev.attemptsLeft ?? 3))));
  let lastDailyLifeDate = String(prev.lastDailyLifeDate || todayMsk);
  let lastStrikeRegenAt = Number(prev.lastStrikeRegenAt || 0);
  let dailyLifeGranted = false;
  let hourlyStrikesGranted = 0;

  // 1. Суточное восстановление (МСК): строго 1 ❤️ жизнь и 3 удара 1 раз в сутки!
  if (lastDailyLifeDate && lastDailyLifeDate < todayMsk) {
    lastDailyLifeDate = todayMsk;
    if (lives <= 0) {
      lives = 1;
      attemptsLeft = 3;
      lastStrikeRegenAt = 0;
      dailyLifeGranted = true;
    } else if (attemptsLeft < 3) {
      attemptsLeft = 3;
      lastStrikeRegenAt = 0;
      dailyLifeGranted = true;
    }
  }

  // 2. Почасовое восстановление ударов: +1 удар каждый час, если игрок вышел без них (< 3)!
  if (attemptsLeft < 3) {
    if (lastStrikeRegenAt <= 0) {
      lastStrikeRegenAt = Number(prev.savedAt || now);
    }
    const elapsedHours = Math.floor((now - lastStrikeRegenAt) / HOURLY_STRIKE_REGEN_MS);
    if (elapsedHours >= 1) {
      hourlyStrikesGranted = Math.min(3 - attemptsLeft, elapsedHours);
      attemptsLeft = Math.min(3, attemptsLeft + hourlyStrikesGranted);
      lastStrikeRegenAt = attemptsLeft >= 3 ? 0 : lastStrikeRegenAt + hourlyStrikesGranted * HOURLY_STRIKE_REGEN_MS;
      // Если игрок уходил при 0 жизней и 0 ударов, а за час восстановился удар — даём сыграть этим ударом!
      if (lives <= 0 && attemptsLeft > 0) {
        lives = 1;
      }
    }
  } else {
    lastStrikeRegenAt = 0;
  }

  state.profile.lives = lives;
  const snapshot = saveSessionResumeSnapshot({
    currentLevel: state.profile.currentLevel,
    attemptsLeft,
    lives,
    premierePoints: state.profile.premierePoints,
    lastDailyLifeDate,
    lastStrikeRegenAt,
  });

  if (state.activeScreen === 'workshop' && state.round?.running && (dailyLifeGranted || hourlyStrikesGranted > 0)) {
    state.round.attemptsLeft = Math.max(Number(state.round.attemptsLeft || 0), attemptsLeft);
    renderAttemptSquares(state.round.attemptsLeft, state.round.isBlitz ? 5 : 3);
  }
  updatePremiereBarsUI();
  refreshHudLevelLabel();

  if (!silent) {
    if (dailyLifeGranted) {
      showToast('🌅 Новый день! Вернулась 1 ❤️ жизнь и 3 удара!');
    } else if (hourlyStrikesGranted > 0) {
      showToast(`⏳ За время отсутствия восстановилось +${hourlyStrikesGranted} удар(а) (1 удар/час)!`);
    }
  }
  return { dailyLifeGranted, hourlyStrikesGranted, snapshot };
}

function formatNextStrikeRegenHint() {
  const snap = readSessionResume();
  const att = snap ? Math.max(0, Math.min(3, Number(snap.attemptsLeft ?? 0))) : 0;
  if (att >= 3) {
    return '🌅 1 ❤️ жизнь и 3 удара возвращаются 1 раз в сутки · +1 удар каждый час при трате';
  }
  const baseTs = Number(snap?.lastStrikeRegenAt || snap?.savedAt || Date.now());
  const remMs = Math.max(60000, HOURLY_STRIKE_REGEN_MS - ((Date.now() - baseTs) % HOURLY_STRIKE_REGEN_MS));
  const mins = Math.max(1, Math.ceil(remMs / 60000));
  return `⏳ +1 удар восстановится через ~${mins} мин · 🌅 1 ❤️ жизнь и 3 удара — 1 раз в сутки`;
}

function syncPendingTicketsFloatingUI() {
  const btn = document.getElementById('hud-pending-tickets-btn');
  const txt = document.getElementById('hud-pending-tickets-text');
  const burgerCnt = document.getElementById('burger-tickets-count');
  const cnt = Math.max(0, Math.round(Number(state.profile.pendingTicketsCount || 0)));
  if (burgerCnt) burgerCnt.textContent = String(cnt);
  if (!btn) return;
  if (cnt <= 0) {
    btn.setAttribute('hidden', '');
    return;
  }
  const word = cnt === 1 ? 'БИЛЕТ' : cnt <= 4 ? 'БИЛЕТА' : 'БИЛЕТОВ';
  const bonusLives = cnt * 3;
  if (txt) {
    txt.textContent = `🔥 ОТПРАВИТЬ ${cnt} ${word} ДРУЗЬЯМ · ПОКА НЕ СГОРЕЛИ! (+${bonusLives} ❤️)`;
  }
  btn.removeAttribute('hidden');
}

function addPendingCinemaTicket(delta = 1) {
  const next = Math.max(1, Math.round(Number(state.profile.pendingTicketsCount || 0)) + Math.max(1, delta));
  state.profile.pendingTicketsCount = next;
  state.profile.ticketsExpireAt = Date.now() + 24 * 3600 * 1000;
  state.profile.hasPendingTicket = true;
  saveLocalV9Flags();
  syncPendingTicketsFloatingUI();
  updatePremiereBarsUI();
}

function capEarlyLivesIfNoRealFriends(desiredLives) {
  const realFriends = Math.max(0, Math.round(Number(state.profile?.friendsBrought || 0)));
  const clean = Math.max(0, Math.round(Number(desiredLives || 0)));
  // v11.0: Пока реальные друзья ещё не зашли по ссылке, максимум 3 ❤️ жизни (5 быть не может!)
  return realFriends > 0 ? clean : Math.min(3, clean);
}

function consumePendingCinemaTicketAndReward() {
  const prev = Math.max(0, Math.round(Number(state.profile.pendingTicketsCount || 0)));
  const next = Math.max(0, prev - 1);
  state.profile.pendingTicketsCount = next;
  state.profile.hasPendingTicket = next > 0;
  if (next === 0) state.profile.ticketsExpireAt = 0;
  const prevLives = Math.max(0, Number(state.profile.lives || 0));
  const targetLives = capEarlyLivesIfNoRealFriends(Math.max(3, prevLives + 3));
  state.profile.lives = targetLives;
  state.profile.premierePoints = Math.max(0, Number(state.profile.premierePoints || 0) + 500);
  awardV8LevelProgress(state.tg?.user, {
    level: state.profile.currentLevel || 3,
    pointsDelta: 500,
    livesDelta: Math.max(0, targetLives - prevLives),
  }).catch(() => {});
  saveLocalV9Flags();
  syncPendingTicketsFloatingUI();
  updatePremiereBarsUI();
  refreshHudLevelLabel();
  flyRewardToHud({ type: 'lives', count: 3, label: '+1 ❤️' });
  window.setTimeout(() => flyRewardToHud({ type: 'rating', count: 3, label: '⭐ +500' }), 260);
  return next;
}

function computeSuperPrizeRatingPct(profile = state.profile) {
  const friends = Math.max(0, Math.round(Number(profile?.friendsBrought || 0)));
  const pts = Math.max(0, Math.round(Number(profile?.premierePoints || 0)));
  const sentPending = Math.max(0, Math.round(Number(profile?.packedCount || 0)));
  // За реальных друзей, которые зашли по ссылке — главный рывок (+20% каждый!);
  // за саму отправку бочки — небольшой визуальный аванс (+3% за отправку, до +9%);
  // за удары и призы из бочек — плавно по чуть-чуть (+1% за 150 ⭐, до 35% без друзей).
  const soloPct = Math.min(35, Math.floor(pts / 150));
  const pendingSendPct = Math.min(9, sentPending * 3);
  const friendsPct = friends * 20;
  return Math.min(100, soloPct + pendingSendPct + friendsPct);
}

function syncSuperPrizeRatingBarUI() {
  const pct = computeSuperPrizeRatingPct(state.profile);
  const friends = Math.max(0, Math.round(Number(state.profile?.friendsBrought || 0)));
  const pts = Math.max(0, Math.round(Number(state.profile?.premierePoints || 0)));
  const hudPct = document.getElementById('hud-rating-pct');
  const hudFill = document.getElementById('hud-rating-fill');
  if (hudPct) hudPct.textContent = `${pct}%`;
  if (hudFill) hudFill.style.width = `${pct}%`;

  const topPct = document.getElementById('top-rating-pct');
  const topFill = document.getElementById('top-rating-fill');
  if (topPct) topPct.textContent = `${pct}%`;
  if (topFill) topFill.style.width = `${pct}%`;

  const lbPct = document.getElementById('leader-rating-pct');
  const lbFill = document.getElementById('leader-rating-fill');
  const lbBrk = document.getElementById('leader-rating-breakdown');
  if (lbPct) lbPct.textContent = pct >= 100 ? '100% 🏆' : `${pct}%`;
  if (lbFill) lbFill.style.width = `${pct}%`;
  if (lbBrk) {
    lbBrk.textContent = pct >= 100
      ? `🏆 ШКАЛА ЗАПОЛНЕНА! Ты в финале Супер-приза (👥 Друзей: ${friends} · ⭐ Баллов: ${pts})`
      : `👥 Друзья в игре: ${friends} (+20% каждый) · ⭐ Из бочек: ${pts} (добери 100% для Супер-приза!)`;
  }
}

/**
 * v11.0: Проверка совпадения случайного имени на бочке с именем игрока (Telegram / профиль)
 * Возвращает true, если имя на бочке совпадает с полным или кратким именем игрока!
 */
const PLAYER_NAME_ALIAS_GROUPS = [
  ['ЕВГЕНИЙ', 'ЕВГЕНИЯ', 'ЖЕНЯ', 'ЖЕКА', 'EUGENE', 'ZHENYA', 'ZHEKA'],
  ['ИГОРЬ', 'ГАРИК', 'ГАРРИ', 'IGOR', 'GARIK'],
  ['АЛЕКСАНДР', 'АЛЕКСАНДРА', 'САНЯ', 'САША', 'ШУРА', 'ALEX', 'ALEXANDER', 'SASHA', 'SANYA'],
  ['АЛЕКСЕЙ', 'ЛЕХА', 'ЛЁХА', 'ЛЕША', 'ЛЁША', 'ALEXEY', 'LEHA'],
  ['ДМИТРИЙ', 'ДИМА', 'ДИМОН', 'DMITRY', 'DIMA'],
  ['СЕРГЕЙ', 'СЕРЕГА', 'СЕРЁГА', 'SERGEY', 'SEREGA'],
  ['МАКСИМ', 'МАКС', 'MAX', 'MAXIM'],
  ['АНДРЕЙ', 'АНДРЮХА', 'ANDREY'],
  ['НИКОЛАЙ', 'КОЛЯ', 'NIKOLAY', 'KOLYA'],
  ['ИВАН', 'ВАНЯ', 'IVAN', 'VANYA'],
  ['ВЛАДИМИР', 'ВОВА', 'ВОЛОДЯ', 'VLADIMIR', 'VOVA'],
  ['ВЛАДИСЛАВ', 'ВЛАД', 'VLAD'],
  ['МИХАИЛ', 'МИША', 'MIKHAIL', 'MISHA'],
  ['КОНСТАНТИН', 'КОСТЯ', 'KOSTYA'],
  ['РОМАН', 'РОМА', 'ROMAN', 'ROMA'],
  ['ПАВЕЛ', 'ПАША', 'PAVEL', 'PASHA'],
  ['АРТЕМ', 'АРТЁМ', 'ТЕМА', 'ТЁМА', 'ARTEM'],
  ['ТИМУР', 'ТИМА', 'TIMUR', 'TIMA'],
  ['АНАСТАСИЯ', 'НАСТЯ', 'NASTYA'],
  ['ЕКАТЕРИНА', 'КАТЯ', 'KATYA'],
  ['ДАРЬЯ', 'ДАША', 'DASHA'],
  ['ЕЛЕНА', 'ЛЕНА', 'АЛЕНА', 'АЛЁНА', 'LENA', 'ELENA'],
  ['ОЛЬГА', 'ОЛЯ', 'OLGA', 'OLYA'],
  ['АННА', 'АНЯ', 'ANNA', 'ANYA'],
  ['МАРИЯ', 'МАША', 'MARIA', 'MASHA'],
  ['ВИКТОРИЯ', 'ВИКА', 'VIKA'],
  ['КРИСТИНА', 'КРИС', 'KRIS'],
  ['ТАТЬЯНА', 'ТАНЯ', 'TANYA'],
  ['ИРИНА', 'ИРА', 'IRA'],
  ['ЮЛИЯ', 'ЮЛЯ', 'YULYA'],
  ['СВЕТЛАНА', 'СВЕТА', 'SVETA'],
  ['НАДЕЖДА', 'НАДЯ', 'NADYA'],
  ['НАТАЛЬЯ', 'НАТАЛИЯ', 'НАТАША', 'NATASHA'],
  ['ЛЮДМИЛА', 'ЛЮДА', 'LYUDA'],
  ['ЕЛИЗАВЕТА', 'ЛИЗА', 'LIZA'],
  ['СОФИЯ', 'СОФЬЯ', 'СОФА', 'SOFA'],
  ['ВАРВАРА', 'ВАРЯ', 'VARYA'],
  ['ВАЛЕРИЯ', 'ЛЕРА', 'LERA'],
  ['КСЕНИЯ', 'КСЮША', 'KSYUSHA'],
  ['ВАЛЕНТИН', 'ВАЛЕНТИНА', 'ВАЛЯ', 'VALYA'],
  ['МАРГАРИТА', 'РИТА', 'RITA'],
  ['ГАЛИНА', 'ГАЛЯ', 'GALYA'],
  ['ВИКТОР', 'ВИТЯ', 'VITYA'],
  ['ГЕННАДИЙ', 'ГЕНА', 'GENA'],
  ['ЮРИЙ', 'ЮРА', 'YURA'],
  ['АНАТОЛИЙ', 'ТОЛЯ', 'TOLYA'],
  ['СТАНИСЛАВ', 'СТАС', 'STAS'],
  ['ВЯЧЕСЛАВ', 'СЛАВА', 'SLAVA'],
  ['ФЕДОР', 'ФЁДОР', 'ФЕДЯ', 'FEDYA'],
  ['СЕМЕН', 'СЕМЁН', 'СЕМА', 'СЁМА', 'SEMA'],
  ['ГРИГОРИЙ', 'ГРИША', 'GRISHA'],
  ['ПЕТР', 'ПЁТР', 'ПЕТЯ', 'PETYA'],
  ['СТЕПАН', 'СТЕПА', 'СТЁПА', 'STEPA'],
  ['ЛЕОНИД', 'ЛЕНЯ', 'ЛЁНЯ', 'LENYA'],
  ['ВАДИМ', 'ВАДИК', 'VADIK'],
  ['ЭДУАРД', 'ЭДИК', 'EDIK'],
  ['ВИТАЛИЙ', 'ВИТАЛИК', 'VITALIK'],
  ['РОСТИСЛАВ', 'РОСТИК', 'ROSTIK'],
  ['ЯРОСЛАВ', 'ЯРИК', 'YARIK'],
  ['АРСЕНИЙ', 'СЕНЯ', 'SENYA'],
  ['ТАМАРА', 'ТОМА', 'TOMA'],
  ['БАХТИЯР', 'БАХА', 'BAHA'],
  ['НУРЛАН', 'НУРСУЛТАН', 'НУРИК', 'NURIK'],
];

function normalizeNameToken(raw) {
  return String(raw || '')
    .trim()
    .split(/[\s,._-]+/)[0]
    .toUpperCase()
    .replace(/Ё/g, 'Е');
}

function doesBarrelNameMatchPlayer(barrelName, playerNameRaw) {
  const bNorm = normalizeNameToken(barrelName);
  const pNorm = normalizeNameToken(playerNameRaw);
  if (!bNorm || !pNorm || pNorm.length < 2) return false;
  if (bNorm === pNorm) return true;
  for (const grp of PLAYER_NAME_ALIAS_GROUPS) {
    if (grp.includes(bNorm) && grp.includes(pNorm)) return true;
  }
  return false;
}

function applyOwnNameBarrelBonus(barrelIndex) {
  const painted = scene?.getBarrelPaintedName?.(barrelIndex) || '';
  if (!painted) return false;
  const playerName = state.tg?.user?.name || state.profile?.playerNameOverride || '';
  if (!doesBarrelNameMatchPlayer(painted, playerName)) return false;

  const r = state.round;
  if (!r.nameBonusBarrels) r.nameBonusBarrels = new Set();
  if (r.nameBonusBarrels.has(barrelIndex)) return false;
  r.nameBonusBarrels.add(barrelIndex);

  const pos = scene?.projectBarrelScreenPos?.(barrelIndex, 1.05);
  const sx = pos?.visible ? pos.x : null;
  const sy = pos?.visible ? pos.y : null;

  // Если удары уже потрачены (меньше 3) -> даём +2 удара; если все 3 удара на месте -> даём +8 сек кислорода O₂!
  if ((r.attemptsLeft ?? 3) < 3) {
    r.attemptsLeft = Math.min(5, (r.attemptsLeft || 0) + 2);
    renderAttemptSquares(r.attemptsLeft, Math.max(3, r.attemptsLeft));
    flyRewardToHud({ type: 'strikes', count: 2, label: '🟨 +УДАР', startX: sx, startY: sy });
    showToast(`🎯 НА БОЧКЕ ТВОЁ ИМЯ «${painted}»! БОНУС: +2 УДАРА!`);
  } else {
    r.airLeft = Math.min(48.0, Number(r.airLeft || 25) + 8.0);
    updateAirHUD(r.airLeft);
    flyRewardToHud({ type: 'air', count: 2, label: '💨 +4с O₂', startX: sx, startY: sy });
    showToast(`🎯 НА БОЧКЕ ТВОЁ ИМЯ «${painted}»! БОНУС: +8 СЕК КИСЛОРОДА O₂!`);
  }
  Haptics.success();
  return true;
}

/**
 * v11.0: Сочная анимация полёта наград (❤️ жизни, 🟨 удары, ⭐ рейтинг, 💨 O₂) из центра/бочки прямо в HUD со звуком «БАХ!»
 */
function flyRewardToHud({ type = 'lives', count = 3, label = '+1 ❤️', startX = null, startY = null, onStepImpact = null } = {}) {
  const targetId =
    type === 'strikes'
      ? 'attempts-squares'
      : type === 'air'
        ? 'hud-air-val'
        : type === 'rating'
          ? 'hud-pts-pill'
          : 'hud-lives-pill';
  const fallbackId =
    type === 'lives'
      ? 'top-lives-pill'
      : type === 'rating'
        ? 'top-rating-pill'
        : 'nav-leaderboard';
  let targetEl = document.getElementById(targetId);
  if (!targetEl || targetEl.getBoundingClientRect().width === 0) {
    targetEl = document.getElementById(fallbackId);
  }
  const rect = targetEl ? targetEl.getBoundingClientRect() : { left: window.innerWidth * 0.5, top: 24, width: 20, height: 20 };
  const destX = rect.left + rect.width * 0.5;
  const destY = rect.top + rect.height * 0.5;
  const originX = startX ?? window.innerWidth * 0.5;
  const originY = startY ?? window.innerHeight * 0.54;
  const safeCount = Math.max(1, Math.min(5, Math.round(count)));

  for (let i = 0; i < safeCount; i++) {
    window.setTimeout(() => {
      const el = document.createElement('div');
      el.className = `fly-reward-token ${
        type === 'strikes'
          ? 'is-strike'
          : type === 'rating'
            ? 'is-rating'
            : type === 'air'
              ? 'is-air'
              : 'is-life'
      }`;
      el.textContent = label;
      const jitterX = (i - (safeCount - 1) / 2) * 38;
      el.style.left = `${originX + jitterX}px`;
      el.style.top = `${originY}px`;
      document.body.appendChild(el);

      const dx = destX - (originX + jitterX);
      const dy = destY - originY;
      const anim = el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 0 },
          { transform: 'translate(-50%, -62%) scale(1.55)', opacity: 1, offset: 0.24 },
          { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.42 - 42}px)) scale(1.15)`, opacity: 1, offset: 0.62 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`, opacity: 0.9, offset: 0.95 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.25)`, opacity: 0 },
        ],
        { duration: 760, easing: 'cubic-bezier(0.22, 0.88, 0.32, 1)', fill: 'forwards' }
      );
      anim.onfinish = () => {
        el.remove();
        audio.playRewardImpact?.(i);
        Haptics.heavy();
        if (targetEl) {
          targetEl.classList.remove('is-hud-pop');
          void targetEl.offsetWidth;
          targetEl.classList.add('is-hud-pop');
        }
        try { onStepImpact?.(i + 1, safeCount); } catch { /* ignore */ }
      };
    }, i * 220);
  }
}

/**
 * v11.6: Пошаговое видимое наполнение жизней (0 → 1 → 2 → 3) и ударов ([ ][ ][ ] → [🟨][🟨][🟨])
 * строго в момент прилёта каждой иконки в HUD! До прилёта они НЕ отображаются заранее!
 */
function setHudVisualLivesDisplay(val) {
  const txt = String(Math.max(0, Math.round(Number(val || 0))));
  for (const id of ['hud-lives-val', 'top-lives-count', 'hud-lives-big-num', 'hud-premiere-lives']) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }
}

function runStepwiseHudFillAnimation({ targetLives = 3, targetStrikes = 3 } = {}) {
  const livesCnt = Math.max(1, Math.min(3, Math.round(Number(targetLives || 3))));
  const strikesCnt = Math.max(1, Math.min(3, Math.round(Number(targetStrikes || 3))));
  // 1. Сначала скрываем новые жизни и удары (показываем 0 ❤️ и 0 пустых слотов!)
  setHudVisualLivesDisplay(0);
  renderAttemptSquares(0, strikesCnt);

  // 2. По одной запускаем сердца — каждое при ударе в HUD прибавляет 0→1→2→3!
  window.setTimeout(() => {
    if (state.activeScreen !== 'workshop') {
      setHudVisualLivesDisplay(state.profile?.lives ?? livesCnt);
      renderAttemptSquares(state.round?.attemptsLeft ?? strikesCnt, strikesCnt);
      return;
    }
    flyRewardToHud({
      type: 'lives',
      count: livesCnt,
      label: '+1 ❤️',
      onStepImpact: (step) => {
        setHudVisualLivesDisplay(step);
      },
    });
    // 3. Сразу следом запускаем удары — каждый при прилёте зажигает жёлтый квадрат 1→2→3!
    window.setTimeout(() => {
      if (state.activeScreen !== 'workshop') return;
      flyRewardToHud({
        type: 'strikes',
        count: strikesCnt,
        label: '🟨 +УДАР',
        onStepImpact: (step) => {
          renderAttemptSquares(step, strikesCnt);
        },
      });
    }, livesCnt * 220 + 280);
  }, 180);
}

function computePlayerRankTitle() {
  const pts = Number(state.profile?.premierePoints || 0);
  const attempts = Math.max(1, Number(state.round?.attemptsUsed || 1));
  if (pts >= 1500) return '👑 ЛЕГЕНДА ЦЕХА №19';
  if (attempts === 1) return '⚡ СПАСАТЕЛЬ 1-ГО УДАРА';
  if (pts >= 700) return '🔥 МАСТЕР СЛУХА';
  return '🛢 СТАЛКЕР БОЧЕК';
}

function getFactoryZoneSpecByZoneId(rawZoneId = 1) {
  const z = Math.max(1, Math.min(5, Math.round(Number(rawZoneId || 1))));
  if (z === 1) {
    return {
      zoneId: 1,
      barrelCount: 4,
      airSec: 32.0,
      hasSteamHazard: false,
      numbersObscured: false,
      canMicBlow: false,
      pointsReward: 150,
      targetKind: 'human',
      taskText: 'УР. 1 · Удерживай палец на бочке — слушай стук и найди друга!',
      zoneTitle: t('zone1Name') || 'УР.1 · 4 БОЧКИ (ВХОД)',
    };
  }
  if (z === 2) {
    return {
      zoneId: 2,
      barrelCount: 6,
      airSec: 32.0,
      hasSteamHazard: true,
      numbersObscured: false,
      canMicBlow: false,
      pointsReward: 150,
      targetKind: 'empty',
      taskText: 'РАУНД 2 · Сейчас найди ПУСТУЮ бочку, чтобы отправить другу скример и участвовать в розыгрыше билета!',
      zoneTitle: t('zone2Name') || 'УР.2 · 6 БОЧЕК (ПУСТАЯ)',
    };
  }
  if (z === 3) {
    return {
      zoneId: 3,
      barrelCount: 8,
      airSec: 32.0,
      hasSteamHazard: false,
      numbersObscured: false,
      canMicBlow: false,
      pointsReward: 300,
      targetKind: 'ticket',
      taskText: 'УР. 3 · Найди бочку с бесплатным билетом в кино (+300 ⭐)!',
      zoneTitle: t('zone3Name') || 'УР.3 · 8 БОЧЕК (БИЛЕТ)',
    };
  }
  if (z === 4) {
    return {
      zoneId: 4,
      barrelCount: 10,
      airSec: 30.0,
      hasSteamHazard: false,
      numbersObscured: false,
      canMicBlow: false,
      pointsReward: 350,
      targetKind: 'ticket',
      taskText: 'УР. 4 · 10 бочек (+350 ⭐) — до Дуэлей (1 500 ⭐) совсем чуть-чуть!',
      zoneTitle: 'УР.4 · 10 БОЧЕК (К ДУЭЛЯМ)',
    };
  }
  return {
    zoneId: 4,
    barrelCount: 12,
    airSec: 28.0,
    hasSteamHazard: false,
    numbersObscured: false,
    canMicBlow: false,
    pointsReward: 400,
    targetKind: 'ticket',
    taskText: 'УР. 5 · 12 бочек (+400 ⭐) — финальный рывок к 1 500 ⭐ и Дуэлям!',
    zoneTitle: 'УР.5 · 12 БОЧЕК (ПРЕСС-ЦЕХ)',
  };
}

function getWorkshopLevelSpec(rawLevel = 1) {
  const level = Math.max(1, Math.round(Number(rawLevel || 1)));
  if (level <= 5) {
    const z = getFactoryZoneSpecByZoneId(level);
    return { level, ...z, isBlitz: false };
  }
  const z5 = getFactoryZoneSpecByZoneId(5);
  return {
    level,
    ...z5,
    isBlitz: level >= 8,
    airSec: 26.0,
  };
}

function hudLevelLabelText() {
  const r = state.round || {};
  const n = Number(r.barrelCount || 4);
  const compact = typeof window !== 'undefined' && window.innerWidth <= 440;
  if (r.modeType === 'premiere') return compact ? 'ПРЕМЬЕРА' : `ПРЕМЬЕРА · ${n} ${formatBarrelWord(n)}`;
  if (r.isDailyShift) return compact ? 'СМЕНА' : `СМЕНА ДНЯ · ${n} ${formatBarrelWord(n)}`;
  if (r.isBlitz) return compact ? 'БЛИЦ' : `БЛИЦ · ${n} ${formatBarrelWord(n)}`;
  return compact ? `УР. ${Number(r.workshopLevel || 1)}` : `УР. ${Number(r.workshopLevel || 1)} · ${n} ${formatBarrelWord(n)}`;
}

function refreshHudLevelLabel() {
  const tag = document.getElementById('hud-mode-tag');
  if (tag) tag.textContent = hudLevelLabelText();
  const livesVal = document.getElementById('hud-lives-val');
  if (livesVal) {
    // На Уровне 1 (по ссылке друга или первый вход, до просмотра трейлера) ВСЕГДА показываем 1 жизнь этого раунда (1 -> 0)!
    const isL1PreTrailer = state.round?.modeType === 'viral' && Number(state.round?.rescueStage || 0) < 4;
    const shownLives = isL1PreTrailer
      ? Math.max(0, Number(state.round?.roundLives ?? 1))
      : Math.max(0, Number(state.profile?.lives ?? 1));
    livesVal.textContent = String(shownLives);
  }
  const ptsVal = document.getElementById('hud-pts-val');
  if (ptsVal) ptsVal.textContent = String(Math.max(0, Math.round(Number(state.profile?.premierePoints || 0))));
  syncSuperPrizeRatingBarUI();
  const taskEl = document.getElementById('hud-task-banner');
  if (taskEl) {
    const spec = getWorkshopLevelSpec(state.round?.workshopLevel || 1);
    taskEl.textContent = state.round?.taskText || spec.taskText || 'Удерживай палец — слушать бочку · Тап — удар ломом';
  }
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
  if (packRevengeBtn) {
    packRevengeBtn.classList.toggle('btn-temu-pulse', nextStage <= 2);
  }
}

function syncBurgerMenuLocks() {
  const lvl = Math.max(1, Number(state.profile?.currentLevel || state.round?.workshopLevel || 1));
  const pts = Math.max(0, Math.round(Number(state.profile?.premierePoints || 0)));
  const packed = Math.max(0, Number(state.profile?.packedCount || 0));
  const tickets = Math.max(0, Number(state.profile?.pendingTicketsCount || 0));
  const hasRescuedL1 = lvl >= 2 || packed >= 1 || Boolean(state.profile?.hasPlayedSolo);

  const headTag = document.querySelector('#burger-drawer .burger-head .mono-tag');
  if (headTag) {
    headTag.textContent = `ЦЕХ // МЕНЮ · 📍 ВЫ НА УР. ${lvl}`;
  }

  const setLock = (id, locked, unlockedHtml, lockedText) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = Boolean(locked);
    btn.classList.toggle('is-locked', Boolean(locked));
    if (locked) {
      btn.textContent = lockedText;
    } else if (unlockedHtml !== null) {
      btn.textContent = unlockedHtml;
    }
  };

  setLock(
    'btn-burger-pack-friend',
    !hasRescuedL1,
    '🛢 ЗАКАТАТЬ И ПРИГЛАСИТЬ ДРУГА (+3 ❤️)',
    '🔒 ЗАКАТАТЬ ДРУГА (ОТКРОЕТСЯ С УР. 2)'
  );
  const sentLedger = readSentTicketsLedger().filter((x) => x.status === 'waiting_24h' || x.status === 'opened_unactivated');
  setLock(
    'btn-burger-send-tickets',
    tickets <= 0 && sentLedger.length === 0,
    tickets > 0
      ? `🎟 ПОДАРИТЬ БИЛЕТ ДРУГУ (${tickets})`
      : `🎟 СТАТУС ОТПРАВЛЕННЫХ БИЛЕТОВ (${sentLedger.length})`,
    '🔒 ПОДАРИТЬ БИЛЕТ ДРУГУ (0 — ВЫБЕЙ НА УР. 3)'
  );
  setLock(
    'btn-burger-leaderboard',
    packed <= 0 && lvl <= 1,
    '🏆 РЕЙТИНГ НА ПРЕМЬЕРУ (⭐ + 🛢)',
    '🔒 РЕЙТИНГ ПРЕМЬЕРЫ (ПОСЛЕ 1-Й БОЧКИ)'
  );
  const testTicketBtn = document.getElementById('btn-burger-test-ticket');
  if (testTicketBtn) {
    if (isTestBogSessionActive()) testTicketBtn.removeAttribute('hidden');
    else testTicketBtn.setAttribute('hidden', '');
  }

  // v15.5: Обычная дуэль доступна сразу с Ур. 1; «Дуэль на фишки» открывается на Ур. 3 (3 приглашённых друга) внутри вкладок Дуэли!
  setLock(
    'btn-burger-duel',
    false,
    '⚔️ ДУЭЛЬ «НА СЧЁТ ТРИ!» (ОБЫЧНАЯ / НА ФИШКИ)',
    '⚔️ ДУЭЛЬ «НА СЧЁТ ТРИ!»'
  );
}

function openBurgerDrawer() {
  syncBurgerMenuLocks();
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
  // v15.2: При смене Telegram-аккаунта на том же телефоне сразу изолируем localStorage от прошлого аккаунта!
  enforceTelegramAccountIsolation(state.tg?.user);

  // v10.5: Параметр ?reset=1 ПОЛНОСТЬЮ чистит ВСЕ ключи localStorage/sessionStorage (включая bochka_v3_profile и bochka_v2_uid!)
  // чтобы даже облачный профиль в Supabase стартовал с нуля: Ур. 1 (4 бочки, ❤️ 1, 0% шкалы)!
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('reset') === '1') {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /bochka|tbog/i.test(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      const sRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && /bochka|tbog/i.test(k)) sRemove.push(k);
      }
      sRemove.forEach((k) => sessionStorage.removeItem(k));
      localStorage.setItem('bochka_v2_uid', `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
      sp.delete('reset');
      const cleanUrl = `${window.location.pathname}${sp.toString() ? '?' + sp.toString() : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  } catch { /* ignore */ }

  // v15.0: МГНОВЕННЫЙ СТАРТ (<1.2 сек): #screen-gate кликабелен СРАЗУ, до загрузки Three.js, текстур и сетевых запросов!
  state.uiStage = getStoredUiStage();
  loadLocalV9Flags();
  loadMediaSlots().catch(() => {});
  audio.onStateChange(() => refreshSoundButtonLabel());
  syncTicketShardsUI();
  bindUIEvents();
  if (typeof window !== 'undefined') window.__bochkaMainBound = true;
  refreshInitialSeedGateUI();
  refreshSoundButtonLabel();
  document.getElementById('btn-enter-sound')?.removeAttribute('disabled');
  document.getElementById('btn-enter-mute')?.removeAttribute('disabled');
  applyProgressiveDisclosureUI({ forceStage: state.uiStage });
  if (typeof window !== 'undefined') {
    window.__bochkaGateReadyAt = performance.now();
    if (window.__earlyGateAction === 'sound' || window.__earlyGateAction === 'mute') {
      const wantSound = window.__earlyGateAction === 'sound';
      window.__earlyGateAction = null;
      if (wantSound) audio.unlockSync(true);
      enterWorkshopGate(wantSound).catch(() => {});
    } else if (window.__earlyGateAction === 'pack_friend') {
      window.__earlyGateAction = null;
      audio.unlockSync(true);
      enterWorkshopGate(true, { startTarget: 'pack' }).catch(() => {});
    } else if (window.__earlyGateAction === 'legal') {
      window.__earlyGateAction = null;
      openLegalModal('rules').catch(() => {});
    }
  }

  const canvas = document.getElementById('workshop-canvas');
  const screamerCanvasEl = document.getElementById('screamer-canvas');
  if (screamerCanvasEl) {
    screamerPlayer = new HorrorScreamerPlayer(screamerCanvasEl);
  }

  // Авторазблокировка WebAudio на первый тап/клик по 3D-цеху
  canvas?.addEventListener(
    'pointerdown',
    () => {
      if (!audio.enabled && !audio._userMuted) {
        audio.unlock(true).catch(() => {});
      }
    },
    { passive: true }
  );

  // Асинхронная фоновая подгрузка Three.js и 3D-цеха после первого кадра шлюза!
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      ensureSceneReady().catch(() => {});
    }, 0);
  });

  window.addEventListener('resize', () => {
    if (scene) audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex);
  });

  initI18n(state.tg.user?.lang || '')
    .then(() => {
      applyDomTranslations();
      updateControlHintText();
    })
    .catch(() => {});

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
      getAudio: () => audio,
      openTilGame: (lvl) => openTilThreePhaseGame(lvl),
      getTilCtrl: () => tilV16Ctrl,
      ensureSceneReady: () => ensureSceneReady(),
      ensureDuelReady: () => ensureDuelReady(),
      getZoneState: () => scene?.getZoneState?.() || null,
      setZoneLevel: async (lvl) => {
        await ensureSceneReady();
        state.entered = true;
        state.profile.currentLevel = lvl;
        await startDemoRound();
        return scene?.getZoneState?.() || null;
      },
      triggerMicBlow: () => triggerWorkshopMicBlow(),
      startDailyShift: () => startDailyShiftRound(),
      getSpoilerReport: () => buildSpoilerFreeReport(),
      setLang: (l) => setLang(l),
      strikeBarrel: async (idx) => {
        await ensureSceneReady();
        const b = scene?.barrels?.[idx];
        return handleBarrelStrike(idx, b ? b.group.position.clone() : null);
      },
      awardTicketShard: (src) => awardTicketShard(src || 'level'),
      getRecoveryCode: () => getPlayerRecoveryCode(state.tg?.user),
      restoreByCode: (code) => restoreProfileByRecoveryCode(code, state.tg?.user),
      hoverBarrel: (idx) => handleBarrelHover(idx, 200, 200, false),
      openPassScreen: (id) => openIncomingPassScreen(id),
      startPremiere: () => startPremiereRaceRound(),
      showScreen: (n) => showScreen(n),
      getDuel: () => duelCtrl,
      openDuel: (code, opts) => openDuelTable(code, opts || {}),
      openHallOfFame: () => openHallOfFameModal(),
      collectBarrelTrophy: (bid) => collectBarrelTrophyLazy(bid),
      mintRareMovieCard: (src) => rollRareMovieCardLazy(src || 'level3'),
      loadTrophiesMod: () => loadTrophiesMod(),
      triggerScreamer: (v) => triggerMiniScreamer(v),
      getBarrelNames: () => scene?.getAllBarrelPaintedNames?.() || [],
      setBarrelName: (idx, name) => scene?.setBarrelPaintedName?.(idx, name),
      setPlayerName: (name) => {
        if (!state.tg) state.tg = {};
        if (!state.tg.user) state.tg.user = {};
        state.tg.user.name = String(name || '');
        state.profile.playerNameOverride = String(name || '');
      },
      reconcileTickets: () => reconcileSentTicketsLifecycle(),
      getSentTickets: () => readSentTicketsLedger(),
      getResumeSnapshot: () => readSessionResume(),
      applyPassiveRegen: (opts) => applyPassiveDailyLifeAndHourlyStrikes(opts || {}),
    };
  }

  // v13.1: Автосохранение прогресса при сворачивании/выходе и минутный тик почасового восстановления ударов
  window.addEventListener('pagehide', () => saveSessionResumeSnapshot());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveSessionResumeSnapshot();
    } else if (state.entered) {
      applyPassiveDailyLifeAndHourlyStrikes({ silent: false });
    }
  });
  window.setInterval(() => {
    if (state.entered && document.visibilityState === 'visible') {
      applyPassiveDailyLifeAndHourlyStrikes({ silent: false });
    }
  }, 60000);

  // Предзагрузка входящей вирусной бочки (?b=jakaqgx или startapp=jakaqgx)
  if (state.incomingParam) {
    loadBarrelPack(state.incomingParam).then((pack) => {
      state.incomingPack = pack;
      if (!state.entered && pack?.senderName && getTeamSeedRole() !== 'prod') {
        const friendTitleEl = document.getElementById('gate-friend-title');
        if (friendTitleEl && !getTeamSeedRole()) {
          friendTitleEl.textContent = `🛢 ${pack.senderName} спрятал тебя в бочке — найди себя!`;
        }
        const enterSpan = document.getElementById('btn-enter-sound-label') || document.querySelector('#btn-enter-sound span');
        if (enterSpan && !getTeamSeedRole()) {
          enterSpan.textContent = '🛢 НАЙТИ СЕБЯ В БОЧКЕ';
        }
      }
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
  // v16.0: YouTube API больше НЕ прогревается автоматически (0 заблокированных запросов в РФ и Беларуси — трейлер играет локально!)
  // v14.3: Регистрируем роль команды (team_prod/team_blog) ИЛИ атомарно нумеруем входящего по pr_/bl_!
  const earlyRole = state.tg?.teamSeedRole || '';
  const earlyTeamPromise = earlyRole
    ? ((state.profile.isSeedAdmin = true),
      (state.profile.isBloggerSeed = earlyRole === 'blog'),
      registerTeamSeed(state.tg?.user, earlyRole).catch(() => {}))
    : Promise.resolve();
  const earlyBroadcastAssignPromise =
    state.incomingParam && (state.tg?.broadcastLinkType === 'pr' || state.tg?.broadcastLinkType === 'bl')
      ? assignBroadcastVisitor(state.incomingParam, state.tg?.user)
          .then((res) => {
            if (res?.seedTrackingCode) {
              state.profile.seedTrackingCode = res.seedTrackingCode;
              state.profile.seedPrefix = res.seedPrefix || '';
              state.profile.seedSeq = res.seedSeq || 0;
            }
          })
          .catch(() => {})
      : Promise.resolve();
  const earlyTrafficPromise = state.tg?.trafficSource
    ? ((state.profile.trafficSource = state.tg.trafficSource),
      recordTrafficSource(state.tg?.user, state.tg.trafficSource).catch(() => {}))
    : Promise.resolve();
  initPackConstructorDefaults().catch(() => {});

  mergeFreshProfile(await fetchPlayerProfile(state.tg?.user), { preserveProgress: false });
  if (earlyRole) {
    state.profile.isSeedAdmin = true;
    if (earlyRole === 'blog') state.profile.isBloggerSeed = true;
  }
  await Promise.all([earlyTrafficPromise, earlyTeamPromise, earlyBroadcastAssignPromise]);
  refreshInitialSeedGateUI();
  recordPlayerMeta(state.tg?.user).catch(() => {});
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

  // Единый разбор входящего трафика (Deep Links: gift_ / duel_ / team_prod)
  // v15.2.1: По обычным ссылкам бочек (pack_ / pr_ / bl_) НЕ перепрыгиваем стартовый шлюз #screen-gate —
  // игрок сначала видит экран входа (с выбором «Со звуком / Тихий радар») и сам нажимает старт!
  if (state.incomingPassId) {
    await openIncomingPassScreen(state.incomingPassId);
  } else if (state.tg?.duelRoomParam) {
    state.entered = true;
    await openDuelTable(state.tg.duelRoomParam);
  } else if (state.tg?.teamSeedRole === 'prod') {
    // v15.3 + v15.4.1: Продюсер зашёл по ссылке team_prod — сразу открываем упаковку и запрашиваем разрешение на пуши от бота!
    state.entered = true;
    applySeedPackModeUI(true);
    showScreen('pack');
    requestAndSyncWriteAccess();
    showToast('🎬 Запакуй СЕБЯ в бочку 1 раз — получишь ОДНУ общую ссылку для всех друзей и чатов!');
  }

  // Если активирована сессия «ТЕСТ-БОГА» (/testbog/) — лениво монтируем плавающий пульт песочницы (0 запросов в БД)
  if (isTestBogSessionActive()) {
    import('./testbog.js').then(({ mountTestBogHUD }) => mountTestBogHUD({
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
    })).catch(() => {});
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
  document.body.setAttribute('data-screen', name);
  if (name === 'ocean') {
    window.requestAnimationFrame(positionOceanToast);
  } else {
    const toastEl = document.getElementById('toast');
    if (toastEl) toastEl.style.top = '';
  }
  if (state.entered && ['workshop', 'pack', 'modeA', 'finale'].includes(name)) {
    saveSessionResumeSnapshot({ lastScreen: name });
  }
  closeBurgerDrawer();
  if (name !== 'workshop') {
    document.getElementById('workshop-rescue-cta')?.setAttribute('hidden', '');
  }
  if (!document.getElementById('modal-trailer')?.hasAttribute('hidden')) {
    closeTrailerModal();
  }
  for (const mid of ['modal-leaderboard', 'modal-share-hub', 'modal-prize', 'modal-rules', 'modal-legal']) {
    document.getElementById(mid)?.setAttribute('hidden', '');
  }
  // v16.0: Чистая верхняя шапка с кнопкой звука и меню всегда доступна (внутри gate/til16 прячутся лишние счётчики)
  document.getElementById('topbar')?.removeAttribute('hidden');
  document.getElementById('nav-workshop')?.classList.toggle('is-active', name === 'workshop' || name === 'modeA');
  if (name === 'pack' && (getTeamSeedRole() === 'prod' || getTeamSeedRole() === 'blog')) {
    applySeedPackModeUI(true);
  }
  const ids = {
    gate: 'screen-gate',
    modeA: 'screen-mode-a',
    workshop: 'screen-workshop',
    pack: 'screen-pack',
    finale: 'screen-finale',
    sent: 'screen-sent',
    pass: 'screen-pass',
    ocean: 'screen-ocean',
    til16: 'screen-til-v16',
  };

  if (name !== 'til16' && tilV16Ctrl) {
    tilV16Ctrl.stop();
  }

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
    document.getElementById('btn-mode-a-premiere')?.setAttribute('hidden', '');
    enterModeABarrelHub();
  } else {
    leaveModeABarrelHub();
  }

  if (name === 'pack') {
    refreshPackFriendsStrip();
  }

  if (name !== 'pass' && state.passClockTimer) {
    clearInterval(state.passClockTimer);
    state.passClockTimer = null;
  }

  if (name !== 'ocean' && name !== 'til16') {
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
    if (!duelCtrl?.isActive && name !== 'modeA') {
      scene?.setInteractive(false);
    }
  }
}

/**
 * v11.5: Меню-цех прямо на 2 или 3 настоящих стоящих 3D-бочках!
 * Только «ЗАКАТАТЬ ДРУГА», «ТРЕЙЛЕР ДРУГУ» (+1 ❤️ визуально) и (если есть билет) «ПОДАРИТЬ БИЛЕТ»!
 */
function leaveModeABarrelHub() {
  if (state.hubLabelRafId) {
    cancelAnimationFrame(state.hubLabelRafId);
    state.hubLabelRafId = 0;
  }
  state.hubBarrelActions = null;
  const wrap = document.getElementById('mode-a-barrel-labels');
  if (wrap) wrap.innerHTML = '';
}

function enterModeABarrelHub() {
  leaveModeABarrelHub();
  const ticketCnt = Math.max(0, Number(state.profile?.pendingTicketsCount || 0));
  const hasTicket = ticketCnt > 0 || Boolean(state.profile?.hasPendingTicket);
  // v11.6: Убрана бочка «Трейлер» — сразу стоит бочка «ЗАКАТАТЬ ДРУГА В БОЧКУ» (+ 2-я золотая «ПОДАРИТЬ БИЛЕТ» если есть билет!)
  const actions = [
    {
      id: 'pack',
      line1: 'ЗАКАТАТЬ ДРУГА',
      line2: 'В БОЧКУ',
      sub: '+3 ❤️ · СКРИМЕР',
      badge: '🛢 ЗАКАТАТЬ ДРУГА В БОЧКУ',
      subBadge: '+3 ❤️ · отправить скример',
      gold: false,
    },
  ];
  if (hasTicket) {
    actions.push({
      id: 'ticket',
      line1: 'ПОДАРИТЬ',
      line2: 'БИЛЕТ',
      sub: `🎟 ×${Math.max(1, ticketCnt)} · +3 ❤️`,
      badge: `🎟 ПОДАРИТЬ БИЛЕТ (${Math.max(1, ticketCnt)})`,
      subBadge: 'выбери друга · +3 ❤️',
      gold: true,
    });
  }
  state.hubBarrelActions = actions;
  scene?.setHubBarrelMenu?.(actions);

  const wrap = document.getElementById('mode-a-barrel-labels');
  if (wrap) {
    wrap.innerHTML = '';
    actions.forEach((act, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mode-barrel-pill${act.gold ? ' is-gold' : ''}`;
      btn.dataset.hubIdx = String(idx);
      btn.dataset.hubAction = act.id;
      const bTitle = document.createElement('strong');
      bTitle.textContent = act.badge;
      const bSub = document.createElement('small');
      bSub.textContent = act.subBadge;
      btn.append(bTitle, bSub);
      btn.addEventListener('click', () => triggerHubBarrelChoice(idx, null));
      wrap.appendChild(btn);
    });
  }

  const updatePositions = () => {
    if (state.activeScreen !== 'modeA' || !state.hubBarrelActions) return;
    const nodes = document.querySelectorAll('#mode-a-barrel-labels .mode-barrel-pill');
    nodes.forEach((node) => {
      const idx = Number(node.dataset.hubIdx);
      const pos = scene?.projectBarrelScreenPos?.(idx, -0.08);
      if (pos?.visible) {
        node.style.left = `${Math.round(pos.x)}px`;
        node.style.top = `${Math.min(window.innerHeight - 54, Math.round(pos.y + 18))}px`;
        node.style.opacity = '1';
      } else {
        node.style.opacity = '0';
      }
    });
    state.hubLabelRafId = requestAnimationFrame(updatePositions);
  };
  state.hubLabelRafId = requestAnimationFrame(updatePositions);
}

async function triggerHubBarrelChoice(index, worldPoint = null) {
  const act = state.hubBarrelActions?.[index];
  if (!act) return;
  await audio.unlock(true).catch(() => {});
  scene?.triggerStrikeFX?.(index, worldPoint);
  audio.playStrike?.(index);
  Haptics.medium();

  const pos = scene?.projectBarrelScreenPos?.(index, 1.0);
  const sx = pos?.visible ? pos.x : window.innerWidth * 0.5;
  const sy = pos?.visible ? pos.y : window.innerHeight * 0.52;

  if (act.id === 'pack') {
    window.setTimeout(() => {
      state.pack.forLifeRefill = false;
      showScreen('pack');
    }, 240);
    return;
  }

  if (act.id === 'trailer') {
    const prevLives = Math.max(0, Number(state.profile.lives || 0));
    const nextLives = capEarlyLivesIfNoRealFriends(prevLives + 1);
    const delta = Math.max(0, nextLives - prevLives);
    state.profile.lives = nextLives;
    if (delta > 0) {
      awardV8LevelProgress(state.tg?.user, { level: state.profile.currentLevel || 1, pointsDelta: 0, livesDelta: delta }).catch(() => {});
    }
    updatePremiereBarsUI();
    refreshHudLevelLabel();
    // Мгновенный полёт +1 ❤️ прямо от вскрытой бочки в верхний HUD (до системного окна шеринга!)
    flyRewardToHud({ type: 'lives', count: 1, label: '+1 ❤️', startX: sx, startY: sy });
    state.pendingLevelStartFly = { lives: Math.min(3, Math.max(1, nextLives)), strikes: 3 };
    showToast(
      delta > 0
        ? '🎬 Трейлер отправлен другу! +1 ❤️ жизнь улетела в копилку!'
        : '🎬 Трейлер отправлен другу! У тебя максимум 3 ❤️ (больше — когда друг реально зайдёт по ссылке!)'
    );
    Haptics.success();

    const links = buildTrailerReferralLinks(state.tg?.user);
    const shareUrl = links?.tgUrl || links?.webUrl || 'https://bochka.quest/';
    const shareText = '🎬 Смотри трейлер триллера «БОЧКА» (в кино с 17 декабря) и проверь свои нервы в цеху:';
    if (state.tg?.inTelegram) {
      openTelegramShare(shareUrl, shareText);
    } else {
      shareNativeOrFallback({ title: 'БОЧКА — трейлер фильма', text: shareText, url: shareUrl }).catch(() => {});
    }
    return;
  }

  if (act.id === 'ticket') {
    window.setTimeout(() => openGoldenTicketForkModal(), 240);
  }
}

/* ============================================================================
   ВХОДНОЙ ШЛЮЗ -> МАРШРУТИЗАТОР (ПРОПУСК / ДУЭЛЬ / ПОДГЛЯДЫВАНИЕ / БОЧКА / ХАБ)
   ============================================================================ */
function requestAndSyncWriteAccess({ force = false } = {}) {
  return requestTelegramWriteAccessIfNeeded({ force })
    .then((res) => {
      if (res && !res.skipped && !res.unsupported) {
        const allowed = Boolean(res.allowed);
        if (state.profile) state.profile.tgWriteAccess = allowed;
        syncTelegramWriteAccess(state.tg?.user, allowed).catch(() => {});
      }
      return res;
    })
    .catch(() => ({ ok: false, allowed: false }));
}

function openTilThreePhaseGame(levelOverride = null) {
  const host = document.getElementById('screen-til-v16');
  if (!host) return;
  state.entered = true;
  if (duelCtrl?.isActive) duelCtrl.leaveRoom(false);
  stopAirTimer();
  state.round.running = false;

  if (!tilV16Ctrl) {
    tilV16Ctrl = new TilThreePhaseController(host, {
      onExit: () => {
        refreshInitialSeedGateUI();
        showScreen('gate');
      },
      onWin: async ({ level }) => {
        state.profile.hasPlayedSolo = true;
        saveLocalV9Flags();
        // +1 часть билета за прохождение раунда с Тилем (учитывает серверный пул и 152-ФЗ)
        const shardRes = await awardTicketShard(`til_v16_lvl_${level}`, { silent: true }).catch(() => null);
        // Попутно можем запросить разрешение пушей после 1-го раунда (не при входе!)
        requestAndSyncWriteAccess();
        refreshInitialSeedGateUI();
        return shardRes;
      },
      getTicketStatus: () => ({
        shards: Number(state.profile?.ticketShards || 0),
        pendingTickets: Number(state.profile?.pendingTicketsCount || 0),
      }),
      onClaimTicket: () => {
        openGoldenTicketForkModal();
      },
      onWatchTrailer: () => {
        openTrailerModal({ forRescue: false });
      },
      onAboutFilm: () => {
        openAboutFilmModal({
          onWatchTrailer: () => openTrailerModal({ forRescue: false }),
          onOpenKinopoisk: () => {
            markKinopoiskVisited();
            recordFunnelEvent('kp_clicks', state.tg?.user).catch(() => {});
            openExternalLink(ENV.kinopoiskUrl);
          },
          onShareFriends: () => {
            showScreen('pack');
          },
        });
      },
      onShareFriends: () => {
        const shareUrl = buildTrailerReferralLinks(state.tg?.user).tgLink || ENV.publicUrl;
        const shareTxt = '🎬 Сыграл с Тилем Швайгером в игру к русскому триллеру «БОЧКА» (реж. Алексей Звонцов, в кино с 17 декабря)! Попробуй достучаться до небес и забрать билет другу:';
        openTelegramShare(shareUrl, shareTxt);
      },
      onPackFriend: () => {
        showScreen('pack');
      },
    });
  }

  showScreen('til16');
  loadMediaSlots()
    .catch(() => {})
    .finally(() => {
      if (state.activeScreen === 'til16') {
        tilV16Ctrl.startRound(levelOverride ?? getTilCurrentLevel());
      }
    });
}

async function enterWorkshopGate(withSound, { startTarget = 'auto' } = {}) {
  // v16.0: СИНХРОННАЯ разблокировка AudioContext ПЕРВОЙ строкой — ДО любых await/fetch/setTimeout!
  audio.unlockSync(Boolean(withSound));
  if (withSound) audio.playSoundReadyClick();
  refreshSoundButtonLabel();

  // Не пугаем новичка запросом пушей до 1-й игры — запрашиваем только у вернувшихся игроков
  if (state.profile?.hasPlayedSolo || Number(state.profile?.currentLevel || 1) >= 2) {
    requestAndSyncWriteAccess();
  }

  state.entered = true;
  loadLocalV9Flags();
  reconcileSentTicketsLifecycle({ silent: true });
  syncSentTicketsWithServer({ silent: true }).catch(() => {});
  syncPendingTicketsFloatingUI();
  syncBurgerMenuLocks();

  // Специальные диплинки (подарочный билет / дуэль / наблюдатель / вилка)
  if (state.incomingPassId) {
    await audio.unlock(withSound);
    await openIncomingPassScreen(state.incomingPassId);
    return;
  }

  if (state.tg?.duelRoomParam) {
    await Promise.all([audio.unlock(withSound), ensureSceneReady()]);
    await syncUiStage(state.tg?.user, 4);
    applyProgressiveDisclosureUI({ forceStage: 4 });
    await openDuelTable(state.tg.duelRoomParam);
    return;
  }

  if (state.tg?.watchBarrelParam) {
    await Promise.all([audio.unlock(withSound), ensureSceneReady()]);
    await startLiveWatchSpectatorMode(state.tg.watchBarrelParam);
    return;
  }

  if (state.tg?.openGiftFork) {
    if (state.profile.hasPendingTicket) {
      openGoldenTicketForkModal();
    } else {
      openTilThreePhaseGame();
    }
    return;
  }

  // Служебный вход команды продюсеров (team_prod): сначала запаковать общую ссылку pr_<id>
  if (isProducerPackFirstRequired()) {
    applySeedPackModeUI(true);
    showScreen('pack');
    return;
  }

  // Явный клик по кнопке «Спрятать друга в бочке» на главном экране
  if (startTarget === 'pack') {
    showScreen('pack');
    return;
  }

  // ПУТЬ А: Пришёл по бочке от друга -> сразу ищет себя в бочке -> после находки кнопка «Играть с Тилем!»
  if (state.incomingParam) {
    try {
      await Promise.all([audio.unlock(withSound), ensureSceneReady()]);
    } catch {
      state.entered = false;
      showDuolingoCard({
        icon: '⏳',
        title: 'Загружаем 3D-цех',
        body: 'Сеть чуть притормозила — нажми «Дальше» и попробуем снова.',
        buttonText: 'ДАЛЬШЕ',
      });
      return;
    }
    if (!state.incomingPack) {
      state.incomingPack = await loadBarrelPack(state.incomingParam);
    }
    const routing = await checkBarrelEntryRouting(state.incomingParam, state.tg?.user);
    if (routing.shouldRouteToDuel && !routing.isSelf) {
      state.repeatRoutePending = { pack: state.incomingPack, routing };
      state.profile.repeatLinkEntered = true;
      await syncUiStage(state.tg?.user, 4);
      applyProgressiveDisclosureUI({ forceStage: 4 });
      openTilThreePhaseGame();
      return;
    }
    await startViralFriendRound(state.incomingPack);
    return;
  }

  // ПУТЬ Б: Пришёл напрямую / по ссылке блогера -> СРАЗУ «Играть с Тилем» (без лишних шагов и ожидания Three.js!)
  openTilThreePhaseGame();
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
  await ensureSceneReady();
  // v9.0: На Уровне 1 ВСЕГДА ровно 1 жизнь (3 удара ломом), чтобы логично открывался трейлер (+3 ❤️)!
  state.profile.lives = 1;
  const demoChars = t('demoChars');
  const pickIdx = Math.floor(Math.random() * DEMO_PORTRAITS.length);
  const charMeta = Array.isArray(demoChars) && demoChars[pickIdx]
    ? demoChars[pickIdx]
    : { name: 'ДРУГ В БОЧКЕ', quote: pickNextBarrelHeavenQuote() };

  const rawPortrait = './public/sprites/hero_boy_live.webp';
  const targetIndex = 3;

  // v9.2: Без робо-голоса! Голос играет ТОЛЬКО если его записал реальный друг в своей ссылке (?b=...).
  audio.setSenderVoiceUrl('');

  state.round = {
    modeType: 'viral',
    isDemo: true,
    zoneId: 1,
    barrelCount: 4,
    workshopLevel: 1,
    roundLives: 1,
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
    message: 'Спасибо, что нашёл меня! Идём в кино на «БОЧКУ» 17 декабря!',
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
  refreshLevel3TicketPoolBar(state.round?.workshopLevel || 1).catch(() => {});

  // v11.6: Пошаговое наполнение сердец (0→1→2→3) и ударов ([ ][ ][ ]→[🟨][🟨][🟨]) при прилёте в HUD!
  if (state.pendingLevelStartFly) {
    const fly = state.pendingLevelStartFly;
    state.pendingLevelStartFly = null;
    runStepwiseHudFillAnimation({
      targetLives: Math.max(1, Math.min(3, Number(fly.lives || state.profile?.lives || 3))),
      targetStrikes: Math.max(1, Math.min(3, Number(fly.strikes || 3))),
    });
  }

  processPortraitToWebP(rawPortrait, 'flashlight')
    .then((graded) => {
      if (graded?.dataUrl && state.round.isDemo) {
        state.round.portraitDataUrl = graded.dataUrl;
        scene?.setTargetPortrait?.(state.round.targetIndex, graded.dataUrl);
      }
    })
    .catch(() => {});
}

async function startDemoRound({ resumeAttempts = null } = {}) {
  await ensureSceneReady();
  const demoChars = t('demoChars');
  const pickIdx = Math.floor(Math.random() * DEMO_PORTRAITS.length);
  const charMeta = Array.isArray(demoChars) && demoChars[pickIdx]
    ? demoChars[pickIdx]
    : { name: 'УЗНИК ЦЕХА', quote: 'Смотри «Бочку» в кино с 17 декабря.' };

  const spec = getWorkshopLevelSpec(state.profile.currentLevel || 1);
  // v15.4: Ур.2 (пустая бочка) -> дно с ❤️ жизнями; Ур.3+ -> ВСЕГДА кинобилет (никакого пацана в бочке на Ур.4+!)
  const isEmptyLevel = spec.level === 2;
  const isTicketLevel = spec.level >= 3;
  const isLiveBoyLevel = false;
  const rawPortrait = isEmptyLevel
    ? './public/sprites/empty_barrel_hearts.webp'
    : isTicketLevel
      ? './public/sprites/cinema_ticket_barrel.webp'
      : DEMO_PORTRAITS[pickIdx] || DEMO_PORTRAITS[0];
  // v9.2: Убран робо-голос! В демо/уровнях звучат только живые эффекты цеха; голос звучит только от реальных друзей.
  const boyVoiceUrl = '';

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

  audio.setSenderVoiceUrl(boyVoiceUrl);

  state.round = {
    modeType: spec.level === 1 ? 'viral' : 'demo',
    isDemo: true,
    zoneId: spec.zoneId,
    barrelCount: spec.barrelCount,
    workshopLevel: spec.level,
    roundLives: spec.level === 1 ? 1 : Math.max(1, Number(state.profile.lives || 3)),
    targetKind: spec.targetKind || 'human',
    taskText: spec.taskText || '',
    isBlitz: spec.isBlitz,
    blitzTargetsCleared: 0,
    targetIndex,
    steamHazardIndex,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: false,
    dailyShiftCode: '',
    startedAtMs: performance.now(),
    attemptsLeft: resumeAttempts != null
      ? Math.max(0, Math.min(spec.isBlitz ? 5 : 3, Number(resumeAttempts)))
      : (spec.isBlitz ? 5 : 3),
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: spec.airSec,
    running: true,
    pausedForModal: false,
    pausedForOcean: false,
    strikeBusy: false,
    survived: false,
    reactionLocked: false,
    portraitDataUrl: rawPortrait,
    voiceUrl: boyVoiceUrl,
    useBarrelFilter: true,
    message: isLiveBoyLevel
      ? 'Спасибо, что вытащил меня из бочки! Встретимся на премьере 17 декабря!'
      : charMeta.quote,
    senderLabel: isLiveBoyLevel ? 'ПАЦАН ИЗ БОЧКИ' : charMeta.name,
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
  refreshLevel3TicketPoolBar(state.round?.workshopLevel || 1).catch(() => {});

  // v11.6: Пошаговое наполнение сердец (0→1→2→3) и ударов ([ ][ ][ ]→[🟨][🟨][🟨]) при прилёте в HUD!
  if (state.pendingLevelStartFly) {
    const fly = state.pendingLevelStartFly;
    state.pendingLevelStartFly = null;
    runStepwiseHudFillAnimation({
      targetLives: Math.max(1, Math.min(3, Number(fly.lives || state.profile?.lives || 3))),
      targetStrikes: Math.max(1, Math.min(3, Number(fly.strikes || 3))),
    });
  }

  processPortraitToWebP(rawPortrait, 'flashlight')
    .then((graded) => {
      if (graded?.dataUrl && state.round.isDemo) {
        state.round.portraitDataUrl = graded.dataUrl;
        scene?.setTargetPortrait?.(state.round.targetIndex, graded.dataUrl);
      }
    })
    .catch(() => {});
}

async function startDailyShiftRound() {
  state.entered = true;
  await Promise.all([audio.unlock(true), ensureSceneReady()]);
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
  refreshLevel3TicketPoolBar(state.round?.workshopLevel || 1).catch(() => {});

  // v11.6: Пошаговое наполнение сердец (0→1→2→3) и ударов ([ ][ ][ ]→[🟨][🟨][🟨]) при прилёте в HUD!
  if (state.pendingLevelStartFly) {
    const fly = state.pendingLevelStartFly;
    state.pendingLevelStartFly = null;
    runStepwiseHudFillAnimation({
      targetLives: Math.max(1, Math.min(3, Number(fly.lives || state.profile?.lives || 3))),
      targetStrikes: Math.max(1, Math.min(3, Number(fly.strikes || 3))),
    });
  }
}

async function startViralFriendRound(pack) {
  await ensureSceneReady();

  // v15.1: Одноразовый замок на чужие личные бочки pack_* (is_broadcast = false) + серверная проверка входа!
  // Многоразовые ссылки продюсеров (pr_*) и блогеров (bl_*) остаются бесконечными 1..N.
  const isIncomingBroadcast = Boolean(
    pack?.isBroadcast || state.tg?.broadcastLinkType === 'pr' || state.tg?.broadcastLinkType === 'bl'
  );
  if (pack?.id && !isIncomingBroadcast) {
    const lockRes = await claimPersonalBarrelOpen(pack.id, state.tg?.user).catch(() => null);
    if (lockRes?.ok) {
      state.lastPersonalLockEvent = lockRes;
      if (lockRes.inheritedRootCode) {
        state.profile.rootTrackingCode = lockRes.inheritedRootCode;
      }
      if (lockRes.inheritedSeedPrefix) {
        state.profile.seedPrefix = lockRes.inheritedSeedPrefix;
      }
      if (lockRes.locked) {
        state.incomingPack = null;
        await startNewbieOnboardingRound();
        showToast('🔒 Эту бочку уже открыли до тебя — держи свежий цех!');
        return;
      }
      if (lockRes.isSelf) {
        showToast('📌 Это твоя собственная бочка — перешли её реальному другу в Telegram, чтобы получить +20% к Премьере и обрывок 3/4!');
      } else if (pack?.id) {
        // v15.5: При вскрытии чужой личной бочки кладём фото-фишку в Зал славы игрока (лениво)
        collectBarrelTrophyLazy(pack.id).catch(() => {});
      }
    }
  } else if (pack?.id && isIncomingBroadcast) {
    // v15.5: При вскрытии блогерской / промо-бочки (bl_* / pr_*) тоже кладём фишку (для bl_* редкость 'blogger')
    collectBarrelTrophyLazy(pack.id).catch(() => {});
  }

  const isAutoAvatarBarrel = Boolean(
    pack?.autoAvatar || pack?.mode === 'auto_avatar' || pack?.frameStyle === 'auto_avatar'
  );
  let portraitDataUrl = '';
  if (isAutoAvatarBarrel) {
    // v16.0: Авто-аватарка друга: 1) Telegram initDataUnsafe.user.photo_url -> 2) Bot API getUserProfilePhotos -> 3) стильный шаблон
    const directTgPhoto = String(state.tg?.user?.photoUrl || '').trim();
    if (directTgPhoto) {
      portraitDataUrl = directTgPhoto;
    } else {
      const srvPhoto = await fetchTelegramUserAvatarFallback().catch(() => '');
      portraitDataUrl = srvPhoto || './public/cards/card_barrel_eye.webp?v=1553';
    }
  } else {
    portraitDataUrl = pack?.photoUrl || './public/cards/card_barrel_eye.webp?v=1553';
  }

  const voiceUrl = pack?.voiceUrl || '';
  await audio.setSenderVoiceUrl(voiceUrl);

  // v8.0: Жёсткая защита от повторной отправки обычной бочки тому же другу (social_connections)
  if (pack?.senderUid) {
    checkFriendDuplicateConnection(pack.senderUid, state.tg?.user, { senderTgId: pack?.senderTgId || '' })
      .then((dup) => {
        if (dup?.duplicate) {
          showToast(dup.message || 'Этот друг уже в деле! Ему теперь можно отправить только выигранный билет, а скример кинь новому другу.');
        }
      })
      .catch(() => {});
  }

  // Вход по ссылке друга: всегда Уровень 1 (4 бочки, 1 жизнь = 3 удара)
  const viralBarrelCount = 4;
  const spec = getWorkshopLevelSpec(1);

  const initialTarget =
    typeof pack?.targetIndex === 'number' && pack.targetIndex >= 0 && pack.targetIndex < viralBarrelCount
      ? pack.targetIndex
      : Math.floor(Math.random() * viralBarrelCount);

  state.round = {
    modeType: 'viral',
    isDemo: false,
    zoneId: 1,
    barrelCount: viralBarrelCount,
    workshopLevel: 1,
    roundLives: 1,
    targetKind: 'human',
    taskText: spec.taskText,
    isBlitz: false,
    blitzTargetsCleared: 0,
    targetIndex: initialTarget,
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
    portraitDataUrl,
    voiceUrl,
    useBarrelFilter: true,
    screamerType: pack?.screamerType || 'saw_scream',
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

  document.getElementById('hud-mode-tag').textContent = `${t('modeBTag')} // ${spec.zoneTitle}`;
  document.getElementById('hud-urgent-title').textContent = state.uiStage <= 2 ? t('stage1TaskLine') : t('modeBTitle');
  document.getElementById('btn-hud-pack')?.setAttribute('hidden', '');
  document.getElementById('hud-premiere-strip')?.setAttribute('hidden', '');
  configureBottomAttemptsMode('squares');

  launchWorkshopGameplay(false);
  refreshLevel3TicketPoolBar(state.round?.workshopLevel || 1).catch(() => {});

  // v11.6: Пошаговое наполнение сердец (0→1→2→3) и ударов ([ ][ ][ ]→[🟨][🟨][🟨]) при прилёте в HUD!
  if (state.pendingLevelStartFly) {
    const fly = state.pendingLevelStartFly;
    state.pendingLevelStartFly = null;
    runStepwiseHudFillAnimation({
      targetLives: Math.max(1, Math.min(3, Number(fly.lives || state.profile?.lives || 3))),
      targetStrikes: Math.max(1, Math.min(3, Number(fly.strikes || 3))),
    });
  }
  if (voiceUrl) {
    audio.startMuffledVoiceLoop();
  }

  // ШАГ 8.2 (ТРИГГЕР А): Отправляем живой пуш автору бочки + включаем WebSocket-трансляцию ударов!
  closeActiveWatchChannel();
  if (pack?.id) {
    createWatchChannelLazy(pack.id, {
      onRemoteEvent: (ev) => {
        if (ev.type === 'rattle' && state.round.running) {
          audio.playChainRattle(1.0);
          scene?.triggerScreamerShake?.(0.38);
          Haptics.heavy();
          showToast(`⛓ ${ev.senderName || 'Автор бочки'} подглядывает и гремит цепями!`);
        }
      },
    })
      .then((ch) => {
        state.watchChannel = ch;
      })
      .catch(() => {});
    notifyBarrelSearchStarted(pack, state.tg?.user).catch(() => {});
  }
}

/* ============================================================================
   ГЛАВНАЯ СУПЕРИГРА v3.0: «ГОНКА ЗА ПРЕМЬЕРОЙ (0..100)» + ЗОЛОТЫЕ БОЧКИ
   ============================================================================ */
async function startPremiereRaceRound() {
  await ensureSceneReady();
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

  mergeFreshProfile(await fetchPlayerProfile(state.tg?.user));
  updatePremiereBarsUI();

  if (state.profile.hasPendingTicket) {
    openGoldenTicketForkModal();
    return;
  }

  if (state.profile.lives <= 0) {
    showScreen('workshop');
    openLivesRecoveryModal();
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
  // v11.0 Железное правило: пока реальные друзья ещё не зашли по ссылке, жизней максимум 3 ❤️ (4 или 5 быть не может!)
  if (Number(state.profile.friendsBrought || 0) <= 0 && Number(state.profile.lives || 0) > 3) {
    state.profile.lives = 3;
  }
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


  const startLbl = document.getElementById('btn-start-level-label');
  const startBtnEl = document.getElementById('btn-start-demo');
  if (startLbl) {
    const noLives = Number(state.profile?.lives || 0) <= 0;
    startBtnEl?.classList.toggle('is-chance-mode', noLives);
    if (noLives) {
      startLbl.textContent = `🎲 ШАНС · УР. ${spec.level}`;
    } else {
      startLbl.textContent = spec.isBlitz
        ? `▶ УР. ${spec.level} · БЛИЦ (12 БОЧЕК)`
        : `▶ ИГРАТЬ УР. ${spec.level} (${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)})`;
    }
  }
  syncBurgerMenuLocks();

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
  // v8.0: механика «подуть в микрофон» полностью удалена
  return false;
}

function launchWorkshopGameplay(golden = false) {
  refreshHudLevelLabel();
  stopAirTimer();
  state.easterCombo = { stage: 0, lastAt: 0, knocks: 0 };
  if (!state.round.startedAtMs) state.round.startedAtMs = performance.now();
  if (!Array.isArray(state.round.strikeLog)) state.round.strikeLog = [];
  state.round.awaitingTrailerRescue = false;
  state.round.lockedBarrelTaps = 0;
  document.getElementById('workshop-rescue-cta')?.setAttribute('hidden', '');
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');
  renderAttemptSquares(state.round.attemptsLeft, state.round.isBlitz ? 5 : 3);
  updateAirHUD(state.round.airLeft);

  const spec = getWorkshopLevelSpec(state.round.workshopLevel || state.round.zoneId || 1);
  const zoneId = state.round.zoneId || spec.zoneId || 1;
  const targetKind = state.round.targetKind || spec.targetKind || 'human';
  scene.resetRound({
    barrelCount: state.round.barrelCount || spec.barrelCount || 4,
    targetIndex: state.round.targetIndex,
    portraitUrl: state.round.portraitDataUrl,
    golden,
  });
  scene.setWorkshopLevelDecor?.(state.round.workshopLevel || zoneId, state.round.modeType, {
    zoneId,
    steamHazardIndex: state.round.steamHazardIndex ?? -1,
    numbersObscured: false,
    wallQuoteText: t('wallSeaQuote'),
  });
  audio.setFactoryZoneAcoustics?.(zoneId);
  audio.setBarrelLayout(scene.getBarrelWorldPositions(), state.round.targetIndex, { targetKind });
  scene.setInteractive(true);
  scene.setClockUrgency?.({
    airActive: true,
    airLeft: state.round.airLeft,
    isBlitz: Boolean(state.round.isBlitz),
  });
  audio.stopMicBlowDetector?.();

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

  if (r.modeType === 'premiere') {
    finishPremiereRound(false, null);
    return;
  }

  // v9.1: В режиме Блиц (Уровень 8+), если время вышло: очки за найденные цели начисляем, но ПАЦАНА НЕ СПАС (без фальшивого «Спасибо что нашёл»!)
  if (r.isBlitz && r.blitzTargetsCleared > 0) {
    r.partialBlitzScore = true;
    r.lastPointsAwarded = Math.max(150, Number(r.blitzTargetsCleared || 1) * 150);
    state.profile.premierePoints = Math.max(0, Number(state.profile.premierePoints || 0) + r.lastPointsAwarded);
    awardV8LevelProgress(state.tg?.user, { level: r.workshopLevel || 8, pointsDelta: r.lastPointsAwarded, livesDelta: 0 }).catch(() => {});
    updatePremiereBarsUI();
    finishRound(false, { diveBarrelIndex: -1, hitTarget: false });
    return;
  }

  // На Уровне 1 (viral, до просмотра трейлера) тратится единственная жизнь раунда (1 -> 0) -> 3.25s скример -> возврат в пустой цех с кнопкой «Смотреть трейлер»!
  if (r.modeType === 'viral' && Number(r.rescueStage || 0) < 4) {
    r.roundLives = 0;
    refreshHudLevelLabel();
    stopAirTimer();
    audio.stopListening();
    r.pausedForModal = true;
    r.running = false;
    scene.setInteractive(false);
    triggerMiniScreamer();
    window.setTimeout(() => {
      enterWorkshopTrailerPrompt();
    }, 3280);
    return;
  }

  // Уровни 2+: воздух O₂ вышел -> −1 реальная жизнь профиля + 3.25-сек скример. Если жизни остались — продолжаем!
  const nextLives = Math.max(0, Number(state.profile?.lives ?? 1) - 1);
  state.profile.lives = nextLives;
  awardV8LevelProgress(state.tg?.user, { level: r.workshopLevel || 1, pointsDelta: 0, livesDelta: -1 }).catch(() => {});
  refreshHudLevelLabel();
  updatePremiereBarsUI();

  stopAirTimer();
  audio.stopListening();
  r.pausedForModal = true;
  scene.setInteractive(false);
  triggerMiniScreamer();

  window.setTimeout(() => {
    if (nextLives > 0 && getUnstruckBarrelIndices().length > 0) {
      r.attemptsLeft = 3;
      r.airLeft = 22.0;
      r.lastUrgentSec = 9;
      r.running = true;
      r.pausedForModal = false;
      renderAttemptSquares(3, r.isBlitz ? 5 : 3);
      updateAirHUD(r.airLeft);
      scene.setInteractive(true);
      startAirCountdownLoop();
      showToast(`💨 Воздух вышел! −1 ❤️ (осталось ${nextLives}) · Ещё 3 удара!`);
      return;
    }
    r.running = false;
    openLivesRecoveryModal({ forLevel: r.workshopLevel || 2 });
  }, 3280);
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
  const modEl = document.getElementById('hud-slim');
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
  if (state.entered && state.activeScreen === 'workshop' && state.round?.running) {
    saveSessionResumeSnapshot({ attemptsLeft });
  }
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
    const tw = document.getElementById('ocean-typewriter');
    if (tw) tw.textContent = 'На небе только и разговоров, что о море и о бочке…';

    if (mist) {
      mist.classList.remove('is-active');
      window.setTimeout(() => mist.setAttribute('hidden', ''), 950);
    }
  }, 600);
}

function resetOceanTapperUI() {
  if (state.oceanTapper.timer) {
    clearInterval(state.oceanTapper.timer);
  }
  const keepDuel = state.oceanTapper?.returnDuel || null;
  state.oceanTapper = {
    running: false,
    finished: false,
    taps: 0,
    energy: 0,
    timeLeft: 0,
    timer: null,
    lastTapAt: 0,
    returnDuel: keepDuel,
  };

  const barrelImg = document.getElementById('ocean-barrel-img');
  const countEl = document.getElementById('ocean-tap-count');
  const fillEl = document.getElementById('ocean-tap-fill');
  const promptEl = document.getElementById('ocean-tap-prompt');
  const subEl = document.getElementById('ocean-pulse-sub');
  const giftBtn = document.getElementById('btn-ocean-claim-gift');
  const backBtn = document.getElementById('btn-ocean-back');
  const pill = document.getElementById('ocean-bonus-pill');

  if (barrelImg) barrelImg.src = './public/sprites/ocean_barrel_til_hand.webp';
  if (countEl) countEl.textContent = '0';
  if (fillEl) fillEl.style.width = '0%';
  if (promptEl) {
    promptEl.removeAttribute('hidden');
    promptEl.textContent = '👊 СТУЧИ ДО НЕБЕС (100%) — ШКАЛА УХОДИТ ВНИЗ!';
  }
  if (subEl) {
    subEl.textContent = '⚡ Бей быстрее! Остановишься — пульс мигом слетит в ноль! Вернёшься в игру только на 100%!';
  }
  if (giftBtn) giftBtn.setAttribute('hidden', '');
  if (backBtn) backBtn.setAttribute('hidden', '');
  if (pill) {
    pill.setAttribute('hidden', '');
    pill.textContent = '';
  }
}

function startOceanTapperCountdown() {
  if (state.oceanTapper.running) return;
  if (state.oceanTapper.timer) clearInterval(state.oceanTapper.timer);

  state.oceanTapper.running = true;
  state.oceanTapper.finished = false;
  if (typeof state.oceanTapper.energy !== 'number') state.oceanTapper.energy = 0;

  let lastTs = performance.now();
  state.oceanTapper.timer = window.setInterval(() => {
    if (!state.oceanTapper.running || state.oceanTapper.finished) return;
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0.01, (now - lastTs) / 1000));
    lastTs = now;

    const e = Number(state.oceanTapper.energy || 0);
    if (e <= 0) return;

    // v15.4.3: Бодрый откат «Стучи до небес» — без быстрых ударов шкала стремительно падает в ноль!
    // При 3–5 тапах/сек шкала стопорится и сползает; при энергичных 6.5–8+ тапах/сек пробивается за ~4–7 сек.
    const decayPerSec = e < 25 ? 14 : e < 50 ? 20 : e < 75 ? 26 : e < 90 ? 31 : 34;
    const nextE = Math.max(0, e - decayPerSec * dt);
    state.oceanTapper.energy = nextE;

    const pct = Math.round(nextE);
    const countEl = document.getElementById('ocean-tap-count');
    const fillEl = document.getElementById('ocean-tap-fill');
    if (countEl) countEl.textContent = String(pct);
    if (fillEl) fillEl.style.width = `${nextE.toFixed(1)}%`;

    if (now - (state.oceanTapper.lastTapAt || 0) > 450 && pct > 0 && pct < 85) {
      const subEl = document.getElementById('ocean-pulse-sub');
      if (subEl) {
        subEl.textContent = '⚠️ ШКАЛА СЛЕТАЕТ В НОЛЬ — СТУЧИ БЫСТРЕЕ, ДОСТУЧИСЬ ДО НЕБЕС!';
      }
    }
  }, 50);
}

const TIL_TAP_QUOTES = [
  '«Достучись до небес — бей быстрее!»',
  '«На небе только и разговоров, что о море…»',
  '«Не останавливайся — пульс уходит в море!»',
  '«На небе только и разговоров, что о бочке…»',
];

function handleOceanBarrelTap() {
  const now = performance.now();
  if (now - state.oceanTapper.lastTapAt < 30) return;
  state.oceanTapper.lastTapAt = now;

  if (state.oceanTapper.finished) return;
  if (!state.oceanTapper.running) {
    startOceanTapperCountdown();
  }

  state.oceanTapper.taps += 1;
  const taps = state.oceanTapper.taps;
  const nextEnergy = Math.min(100, Number(state.oceanTapper.energy || 0) + 5.6);
  state.oceanTapper.energy = nextEnergy;
  const energyPct = Math.round(nextEnergy);

  audio.playStrike((taps % 3) + 1);
  if (energyPct >= 100 || energyPct >= 80) Haptics.heavy();
  else Haptics.light();

  const countEl = document.getElementById('ocean-tap-count');
  const fillEl = document.getElementById('ocean-tap-fill');
  const promptEl = document.getElementById('ocean-tap-prompt');
  const subEl = document.getElementById('ocean-pulse-sub');
  if (countEl) countEl.textContent = String(energyPct);
  if (fillEl) fillEl.style.width = `${nextEnergy.toFixed(1)}%`;
  if (promptEl && taps % 6 === 0) {
    promptEl.textContent = TIL_TAP_QUOTES[(taps / 6) % TIL_TAP_QUOTES.length | 0];
  }
  if (subEl && energyPct < 100) {
    if (energyPct >= 75) {
      subEl.textContent = '🔥 ДОСТУЧИСЬ ДО НЕБЕС! ДАВИ МАКСИМУМ — ШКАЛА ТЯНЕТ НАЗАД!';
    } else if (energyPct >= 40) {
      subEl.textContent = '⚡ БЫСТРЕЕ! НЕ СБАВЛЯЙ ТЕМП — ПУЛЬС БЫСТРО ПАДАЕТ ВНИЗ!';
    } else {
      subEl.textContent = '👊 СТУЧИ ПО БОЧКЕ «ТИЛЬ» ЧАЩЕ — РАЗГОНЯЙ ДО 100%!';
    }
  }

  const targetBtn = document.getElementById('btn-ocean-tap-barrel');
  if (targetBtn) {
    targetBtn.classList.remove('is-knock-hit');
    void targetBtn.offsetWidth;
    targetBtn.classList.add('is-knock-hit');
  }

  if (nextEnergy >= 100) {
    finishOceanTapperGame();
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
  state.oceanTapper.energy = 100;

  const taps = Math.max(15, state.oceanTapper.taps);
  const countEl = document.getElementById('ocean-tap-count');
  const fillEl = document.getElementById('ocean-tap-fill');
  const subEl = document.getElementById('ocean-pulse-sub');
  const pill = document.getElementById('ocean-bonus-pill');
  const promptEl = document.getElementById('ocean-tap-prompt');

  if (countEl) countEl.textContent = '100';
  if (fillEl) fillEl.style.width = '100%';
  if (subEl) subEl.textContent = '⚡ 100% ПРОБИТО! ТИЛЬ ЗАРЯДИЛ 6 ❤️ НА ДУЭЛЬ И +3 ❤️ В ЦЕХ!';
  if (pill) {
    pill.removeAttribute('hidden');
    pill.textContent = '⚡ ТИЛЬ ЗАРЯДИЛ 100% ПУЛЬСА И 6 ❤️ НА ДУЭЛЬ! Поделись открыткой с рейтингом или жми «← В ЦЕХ»!';
  }
  if (promptEl) {
    promptEl.textContent = '⚡ 100% ПУЛЬСА ПРОБИТО! 6 ❤️ ЗАРЯЖЕНО!';
  }
  const backBtn = document.getElementById('btn-ocean-back');
  if (backBtn) {
    backBtn.textContent = state.oceanTapper.returnDuel ? '⚡ В ДУЭЛЬ (6 ❤️)' : '← В ЦЕХ (+3 ❤️)';
    backBtn.removeAttribute('hidden');
  }
  Haptics.success();

  const reward = await claimOceanTapperReward(state.tg?.user, Math.max(1, taps)).catch(() => ({ livesAwarded: 3 }));
  const v8Refill = await awardV8LevelProgress(state.tg?.user, { level: state.profile.currentLevel || 6, pointsDelta: 0, livesDelta: 3 }).catch(() => null);
  state.profile.easterEggClaimed = true;
  state.profile.lives = capEarlyLivesIfNoRealFriends(Math.max(3, Number(v8Refill?.lives ?? reward?.lives ?? state.profile.lives ?? 3)));
  if (duelCtrl) {
    duelCtrl.refillFromTil?.();
  }
  if (reward?.hasPendingTicket || reward?.giftAwarded) state.profile.hasPendingTicket = true;
  updatePremiereBarsUI();
  refreshHudLevelLabel();
  flyRewardToHud({ type: 'lives', count: 3, label: '+3 ❤️' });
  showToast('⚡ Достучался до Тиля (100%)! Получено 6 ❤️ на дуэль и +3 ❤️ в цех!');
  // v15.5: 50% шанс дропа официальной номерной карточки фильма после экрана Тиля (+10% на Ур. 4 Зала)
  rollRareMovieCardLazy('til').catch(() => {});

  if (state.oceanTapper.returnDuel) {
    window.setTimeout(() => {
      handleReturnFromOcean(false);
    }, 1100);
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

  if (state.oceanTapper.returnDuel) {
    const rd = state.oceanTapper.returnDuel;
    state.oceanTapper.returnDuel = null;
    await openDuelTable(rd.roomId || '');
    duelCtrl?.refillFromTil?.();
    if (rd.solo) {
      showToast('🌊 Тиль зарядил 6 ❤️ жизней и ⚡ 100% энергии — снова в Дуэль за 🎟 билетами!');
    }
    return;
  }

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
  const prevText = btn?.textContent || '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ ГОТОВИМ ОТКРЫТКУ С РЕЙТИНГОМ...';
  }
  Haptics.medium();
  try {
    const pts = Math.max(0, Math.round(Number(state.profile?.premierePoints || 0)));
    const ratingPct = computeSuperPrizeRatingPct(state.profile);
    const rankTitle = computePlayerRankTitle();
    const botUsername = ENV.tgBotUsername || 'bochka_film_bot';
    const uid = encodeURIComponent(getViewerUid(state.tg?.user));
    const shareUrl = `https://t.me/${botUsername}?startapp=ref_${uid}`;
    const shareText =
      `🌊 Я достучался до Тиля на Северном море в игре «БОЧКА»!\n` +
      `🏆 Мой рейтинг: ${pts} ⭐ (${ratingPct}% к Закрытому показу в Москве 17 декабря · ${rankTitle})\n` +
      `Попробуй сам и собери билет в кино: ${shareUrl}`;

    const blob = await generateOceanEasterEggStoriesPNG({
      points: pts,
      ratingPct,
      rankTitle,
      botUsername,
    });
    if (!blob) return;

    const file = new File([blob], `bochka-til-rating-${pts}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'БОЧКА — Секретный берег Тиля (17 декабря)',
          text: shareText,
          url: shareUrl,
        });
        Haptics.success();
        showToast('📸 Открытка с твоим рейтингом и ссылкой отправлена!');
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }

    // Фоллбэк: сохраняем картинку 9:16 с рейтингом + открываем нативную отправку ссылки с рейтингом в Telegram!
    await shareOrDownloadPngBlob(blob, `bochka-til-rating-${pts}.png`);
    await copyToClipboard(shareText).catch(() => {});
    if (state.tg?.inTelegram) {
      openTelegramShare(shareUrl, shareText);
    } else {
      showToast('📸 Открытка с рейтингом сохранена, а текст со ссылкой скопирован в буфер!');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText || '📸 ПОДЕЛИТЬСЯ В СОЦСЕТИ (КАРТИНКА + РЕЙТИНГ)';
    }
  }
}

/* ============================================================================
   ПРОСЛУШКА МЕТАЛЛА И ДРАМАТУРГИЯ УДАРОВ / 4 ФИЛЬМОВЫХ СКРИМЕРА
   ============================================================================ */
let lastSteamWarnAt = 0;

let lastSilentRadarHapticAt = 0;
function handleBarrelHover(index, sx, sy, alreadyStruck) {
  const reticle = document.getElementById('barrel-reticle');
  const retId = document.getElementById('reticle-id');

  if (duelCtrl?.isActive || state.watchingBarrelId || !state.round.running || state.round.pausedForModal || index < 0) {
    if (reticle) {
      reticle.setAttribute('hidden', '');
      reticle.classList.remove('is-knocking', 'is-radar-human', 'is-radar-empty', 'is-radar-ticket', 'is-radar-trap');
    }
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

  const isTarget = !alreadyStruck && index === state.round.targetIndex;
  const silentRadarMode = !audio.enabled && !alreadyStruck && !isSteamHazard;
  const kind = state.round.targetKind || 'human';

  if (reticle && retId) {
    reticle.removeAttribute('hidden');
    reticle.style.left = `${Math.max(78, Math.min(window.innerWidth - 78, sx))}px`;
    reticle.style.top = `${Math.max(96, Math.min(window.innerHeight - 90, sy))}px`;
    const obscured = Boolean(scene?.numbersObscured && !state.round.micBlowUsed);
    const batchNum = obscured ? '?? [ПАР]' : (BARREL_BATCH_CODES[index] || `0${index + 1}`);
    const labelBase = `${t('reticleBatch')}${batchNum}`;

    // v14.0: Визуальный сонар-радар вокруг бочки (работает в беззвучном режиме и при удержании пальца)
    reticle.classList.remove('is-radar-human', 'is-radar-empty', 'is-radar-ticket', 'is-radar-trap');

    const nowH = performance.now();
    const canBuzz = nowH - lastSilentRadarHapticAt > 620;
    const vib = (pattern) => {
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(pattern);
        }
      } catch { /* ignore */ }
    };

    if (alreadyStruck) {
      retId.textContent = `${labelBase} // ${t('reticleEmpty')}`;
    } else if (isSteamHazard) {
      retId.textContent = `${labelBase} // ⚠️ ПАРОВАЯ ТРУБА (−3с O₂)`;
      reticle.classList.add('is-radar-trap');
      if (canBuzz) {
        lastSilentRadarHapticAt = nowH;
        Haptics.error();
        vib([25, 35, 25, 35, 25]);
      }
    } else if (isTarget) {
      if (kind === 'empty') {
        reticle.classList.add('is-radar-empty');
        retId.textContent = `${labelBase} // 🕳 ПУСТОЕ ЭХО · ШИРОКОЕ КОЛЬЦО`;
        if (canBuzz) {
          lastSilentRadarHapticAt = nowH;
          Haptics.light();
          vib([75]);
        }
      } else if (kind === 'ticket') {
        reticle.classList.add('is-radar-ticket');
        retId.textContent = `${labelBase} // 🎟 ЗОЛОТОЙ ПРОБЛЕСК · БИЛЕТ 1+1`;
        if (canBuzz) {
          lastSilentRadarHapticAt = nowH;
          Haptics.success();
          vib([35, 60, 35, 60, 50]);
        }
      } else {
        reticle.classList.add('is-radar-human');
        retId.textContent = silentRadarMode
          ? `${labelBase} // 🎯 ЖИВОЙ ПУЛЬС (ТУК-ТУК) · РАДАР`
          : `${labelBase} // 🎯 ЖИВОЙ СТУК ИЗНУТРИ`;
        if (canBuzz) {
          lastSilentRadarHapticAt = nowH;
          Haptics.medium();
          vib([45, 90, 55]);
        }
      }
    } else {
      reticle.classList.add('is-radar-trap');
      retId.textContent = silentRadarMode
        ? `${labelBase} // ⚠️ РВАНАЯ ДРОЖЬ (ЛОВУШКА / ПУСТО)`
        : `${labelBase} // ${t('reticleListening')}`;
      if (canBuzz && silentRadarMode) {
        lastSilentRadarHapticAt = nowH;
        Haptics.light();
        vib([20, 30, 20]);
      }
    }

    const showPulse =
      isTarget &&
      (silentRadarMode ||
        (state.round.modeType !== 'premiere' &&
          !state.round.isBlitz &&
          Number(state.round.workshopLevel || 1) <= 3));
    reticle.classList.toggle('is-knocking', showPulse);
  }

  if (alreadyStruck) {
    audio.stopListening();
  } else {
    audio.setListeningBarrel(index);
  }
}

async function refreshLevel3TicketPoolBar(level = 1) {
  const bar = document.getElementById('hud-ticket-pool-bar');
  if (!bar) return;
  if (Number(level || 1) < 2) {
    bar.setAttribute('hidden', '');
    return;
  }
  const st = await fetchTicketPoolStatus().catch(() => null);
  if (!st) return;
  state.ticketPoolStatus = st;
  const sh = Math.max(0, Math.min(3, Number(state.profile?.ticketShards || 0)));
  bar.removeAttribute('hidden');
  if (st.dailyRemaining > 0 && !st.isPaused) {
    bar.classList.remove('is-empty');
    bar.textContent = `🎟 Собери 4 куска = бесплатный билет другу (${sh}/4) · Сегодня осталось: ${st.dailyRemaining} из ${st.maxDaily}`;
  } else {
    bar.classList.add('is-empty');
    bar.textContent = '⭐ Партия билетов на сегодня разобрана — новая откроется в 00:00 МСК! За 4-й кусок даём +500 ⭐ в ТОП-20 Закрытого показа в Москве!';
  }
}

async function handleBarrelStrike(index, worldPoint) {
  if (!audio.enabled && !audio._userMuted) {
    audio.unlock(true).catch(() => {});
  }
  // Если открыт синхронный стол «На счёт три!» — все клики обрабатывает мультиплеер-контроллер
  if (duelCtrl?.isActive) {
    duelCtrl.handleBarrelClick(index, worldPoint);
    return;
  }
  // v11.5: Если открыто диегетическое меню-цех (выбор прямо по стоящим 3D-бочкам!)
  if (state.activeScreen === 'modeA' && state.hubBarrelActions?.[index]) {
    triggerHubBarrelChoice(index, worldPoint);
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

  // v9.1: Когда попытки или время кончились — по бочкам можно долбить сколько угодно, но ничего не откроется; просто мигает кнопка «Смотреть трейлер»!
  if (r.awaitingTrailerRescue) {
    r.lockedBarrelTaps = (r.lockedBarrelTaps || 0) + 1;
    audio.playEmptyBarrelClang?.(index);
    scene.triggerBarrelEerieFX?.(index, 'latch_rattle');
    Haptics.error();
    const cta = document.getElementById('workshop-rescue-cta');
    const msgEl = document.getElementById('workshop-rescue-msg');
    if (msgEl) {
      msgEl.textContent = '🔒 Бочка заперта! Нажми кнопку ниже — посмотри трейлер, чтобы получить жизнь и спасти друга!';
    }
    if (cta) {
      cta.removeAttribute('hidden');
      cta.classList.remove('is-nudge');
      void cta.offsetWidth;
      cta.classList.add('is-nudge');
    }
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
      openLivesRecoveryModal();
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
      // Исход Г: Пустая бочка -> пока жизни ещё есть, из бочки просто валит пар или чёрный дым; скример — когда жизни кончились!
      scene.triggerEmptyBarrelOpen(index);
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пусто]`);
      if (res.lives <= 0) {
        triggerMiniScreamer();
      }
    }

    if (res.lives <= 0) {
      r.pausedForModal = true;
      window.setTimeout(() => {
        openLivesRecoveryModal();
      }, 3280);
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

    let hitSteamNoPenalty = false;
    if (index === r.steamHazardIndex) {
      // v15.0: Визуальный клуб пара и шипение для атмосферы, но БЕЗ штрафа (0 потерь ударов, 0 потерь O2, 0 потерь жизней!)
      hitSteamNoPenalty = true;
      scene.triggerSteamHazardBurst?.(index);
      audio.playSteamPenaltyBurst?.();
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пар без штрафа]`);
      showToast('💨 Горячий пар впустую! Удар не списан, слушай дальше');
    } else {
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пусто]`);
    }

    // v11.0: Если на бочке краской написано имя самого игрока — БОНУС (+2 удара или +8с O₂ если удары полные!)
    const gotNameBonus = applyOwnNameBarrelBonus(index);
    if (!hitSteamNoPenalty && !gotNameBonus) {
      r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
      renderAttemptSquares(r.attemptsLeft, 3);
    }
    state.watchChannel?.send('strike', { barrelIndex: index, attemptsLeft: r.attemptsLeft });

    if (r.attemptsLeft > 0) {
      // Попытки ещё есть: без скримера — из пустой бочки уже вырвался столб пара или густого дыма!
    } else {
      // Уровень 1: единственная жизнь (1 -> 0) потрачена -> полный 3.25-сек скример -> возвращаемся в цех с надписью «Смотреть трейлер»!
      r.roundLives = 0;
      r.running = false;
      r.pausedForModal = true;
      stopAirTimer();
      audio.stopListening();
      scene.setInteractive(false);
      refreshHudLevelLabel();
      triggerMiniScreamer();
      window.setTimeout(() => {
        enterWorkshopTrailerPrompt();
      }, 3280);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // РЕЖИМ 3: v8.0 ПРОГРЕССИЯ УРОВНЕЙ (Ур.2=6б, Ур.3=8б, Ур.4=10б, Ур.5=12б)
  // Формула: 1 Жизнь = 3 удара ломом!
  // -------------------------------------------------------------------------
  scene.triggerStrikeFX(index, worldPoint);
  audio.playStrike(index);
  r.attemptsUsed += 1;

  if (index === r.targetIndex) {
    r.strikeLog.push(`[Удар ${r.attemptsUsed}: Цель за ${elapsedSec} сек]`);
    if (r.isBlitz) {
      r.blitzTargetsCleared += 1;
      r.airLeft = Math.min(30.0, r.airLeft + 3.5);
      updateAirHUD(r.airLeft);
      audio.playLidBlowOff(true);
      spawnFloatingScorePopup(0, index, `КОМБО ×${r.blitzTargetsCleared} · +3.5с!`);
      Haptics.success();

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
        numbersObscured: false,
        wallQuoteText: t('wallSeaQuote'),
      });
      audio.setBarrelLayout(scene.getBarrelWorldPositions(), r.targetIndex, { targetKind: 'ticket' });
      return;
    }

    finishRound(true, { diveBarrelIndex: index, hitTarget: true });
    return;
  }

  scene.triggerEmptyBarrelOpen(index);
  let hitSteamNoPenaltyProg = false;
  if (index === r.steamHazardIndex) {
    // v15.0: Пар на Ур.2 оставляет клуб пара и шипение, но ПОЛНОСТЬЮ без штрафа (0 ударов, 0 O2, 0 жизней!)
    hitSteamNoPenaltyProg = true;
    scene.triggerSteamHazardBurst?.(index);
    audio.playSteamPenaltyBurst?.();
    r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пар без штрафа]`);
    showToast('💨 Горячий пар впустую! Удар не списан, слушай дальше');
  } else {
    r.strikeLog.push(`[Удар ${r.attemptsUsed}: Пусто]`);
  }

  // v11.0: Если на бочке краской написано имя самого игрока — БОНУС (+2 удара или +8с O₂ если удары полные!)
  const gotProgNameBonus = applyOwnNameBarrelBonus(index);
  if (!hitSteamNoPenaltyProg && !gotProgNameBonus) {
    r.attemptsLeft = Math.max(0, r.attemptsLeft - 1);
    renderAttemptSquares(r.attemptsLeft, r.isBlitz ? 5 : 3);
  }

  if (r.attemptsLeft > 0) {
    // Попытки ещё есть: только выброс пара/дыма из вскрытой пустой бочки (нагнетаем саспенс без спама скримерами)
  } else {
    // 1 Жизнь = 3 удара ломом: попытки кончились -> жёсткий анимированный скример!
    const nextLives = Math.max(0, Number(state.profile?.lives ?? 1) - 1);
    state.profile.lives = nextLives;
    awardV8LevelProgress(state.tg?.user, { level: r.workshopLevel || 1, pointsDelta: 0, livesDelta: -1 }).catch(() => {});
    refreshHudLevelLabel();
    updatePremiereBarsUI();

    if (nextLives > 0 && getUnstruckBarrelIndices().length > 0) {
      stopAirTimer();
      audio.stopListening();
      r.pausedForModal = true;
      scene.setInteractive(false);
      triggerMiniScreamer();
      window.setTimeout(() => {
        r.attemptsLeft = 3;
        r.airLeft = Math.max(22.0, r.airLeft);
        r.lastUrgentSec = 9;
        r.running = true;
        r.pausedForModal = false;
        renderAttemptSquares(3, r.isBlitz ? 5 : 3);
        updateAirHUD(r.airLeft);
        scene.setInteractive(true);
        startAirCountdownLoop();
        showToast(`❤️ −1 жизнь (осталось ${nextLives}) · Ещё 3 удара ломом!`);
      }, 3280);
    } else {
      // v9.2: Жизни кончились (0 ❤️) на ЛЮБОМ уровне 2+ (включая Блиц!) -> НИКАКОГО «Пацан спасён»!
      // Скример -> окно восстановления жизней (главная кнопка: «Закатать и отправить новому другу (+3 ❤️)»)!
      r.running = false;
      r.pausedForModal = true;
      stopAirTimer();
      audio.stopListening();
      scene.setInteractive(false);
      triggerMiniScreamer();
      window.setTimeout(() => openLivesRecoveryModal({ forLevel: r.workshopLevel || 2 }), 3280);
    }
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
  const isLevel1Intro =
    explicitVariant === null &&
    Boolean(state.round?.isDemo) &&
    Number(state.round?.workshopLevel || 1) <= 1 &&
    Number(state.profile?.currentLevel || 1) <= 1 &&
    Number(state.uiStage || 1) <= 1 &&
    !state.incomingPack;

  // Бочка друга: срабатывает ИМЕННО тот скример, который отправитель выбрал при упаковке.
  // Демо-раунды: ротация 7 кадров (4 жёстких хоррор-скримера + 3 реальных страшных героя триллера).
  const SCREAMER_KEYS = ['weld', 'lunge', 'siren_cam', 'custom_scream'];
  const isFriendRound = Boolean(state.incomingPack) && !state.round?.isDemo;
  const forcedKey = isFriendRound ? state.round?.screamerType || state.incomingPack?.screamerType || 'weld' : null;
  const metaIndex = forcedKey && SCREAMER_KEYS.includes(forcedKey)
    ? SCREAMER_KEYS.indexOf(forcedKey)
    : typeof explicitVariant === 'number'
      ? Math.abs(explicitVariant) % SCREAMER_META.length
      : (state.screamerCursor++) % SCREAMER_META.length;
  const meta = SCREAMER_META[metaIndex] || SCREAMER_META[0];
  const charAudioIdx = typeof meta.audioIdx === 'number' ? meta.audioIdx : metaIndex % 7;
  const screamerKey = forcedKey || SCREAMER_KEYS[charAudioIdx % 4];
  const targetIdx = typeof state.round?.targetIndex === 'number' ? state.round.targetIndex : 0;

  if (!audio.enabled && !audio._userMuted) {
    audio.unlock(true).catch(() => {});
  }

  // Каждый из 7 скримеров играет свой УНИКАЛЬНЫЙ реальный актёрский звук/крик (char_0..char_6)!
  audio.playMiniScreamer(charAudioIdx);
  if (charAudioIdx === 0 || charAudioIdx === 4) {
    scene?.triggerWeldDropImpact?.(targetIdx);
  } else if (charAudioIdx === 1 || charAudioIdx === 2 || charAudioIdx === 5) {
    scene?.triggerDarkLungeImpulse?.(targetIdx);
  } else if (charAudioIdx === 6) {
    state.round.victimCardDataUrl = createVictimCardDataUrl(state.round.portraitDataUrl || DEMO_PORTRAITS[0]);
  }
  if (isFriendRound && state.round?.voiceUrl) {
    audio.playCleanSenderVoice(state.round.voiceUrl, { useBarrelFilter: true });
  }
  scene?.triggerScreamerShake(0.58, meta.strobeHex);

  // Двойная вибрация телефона (Telegram HapticFeedback для iPhone + Android navigator.vibrate)
  Haptics.screamer(screamerKey);

  if (state.round.zoneId === 4) {
    scene?.triggerWiringArcFlash?.(1.1);
  }

  const el = document.getElementById('screamer-overlay');
  const imgEl = document.getElementById('screamer-img');
  const cap = document.getElementById('screamer-caption');
  if (!el) return;

  el.setAttribute('data-variant', meta.key);
  el.setAttribute('data-screamer', screamerKey);
  if (imgEl && meta.img) {
    imgEl.src = meta.img;
  }
  // Без мультяшных подписей/эмодзи поверх лица — чистый полноэкранный кино-хоррор удар
  if (cap) {
    cap.textContent = '';
    cap.setAttribute('hidden', '');
  }

  document.body.classList.remove('is-horror-jolt');
  void document.body.offsetWidth;
  document.body.classList.add('is-horror-jolt');

  el.removeAttribute('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  const showMs = 3250;
  if (screamerPlayer) {
    imgEl?.setAttribute('hidden', '');
    screamerPlayer.play({
      imgA: meta.img,
      imgB: meta.imgB || '',
      motion: meta.motion || 'barrel_face',
      durationMs: showMs - 20,
    });
  } else {
    imgEl?.removeAttribute('hidden');
  }
  window.clearTimeout(el._hideTimer);
  el._hideTimer = window.setTimeout(() => {
    screamerPlayer?.stop();
    el.setAttribute('hidden', '');
    document.body.classList.remove('is-horror-jolt');
  }, showMs);
}

/* ============================================================================
   ВИЛКА «ЗОЛОТАЯ БОЧКА: ЧУЖОЙ БИЛЕТ» & NEAR-MISS & ИМЕННОЙ ПРОПУСК (?pass=ID)
   ============================================================================ */
const SENT_TICKETS_STORAGE_KEY = 'bochka_v13_sent_tickets';

function readSentTicketsLedger() {
  try {
    const raw = localStorage.getItem(SENT_TICKETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSentTicketsLedger(items) {
  try {
    localStorage.setItem(SENT_TICKETS_STORAGE_KEY, JSON.stringify((items || []).slice(0, 30)));
  } catch { /* ignore */ }
}

function recordSentTicketInLedger({ passId, recipientName = 'Друг', shareUrl = '' }) {
  const now = Date.now();
  const list = readSentTicketsLedger();
  list.unshift({
    id: passId || `t_${now.toString(36)}`,
    recipientName: String(recipientName || 'Друг').slice(0, 36),
    shareUrl: String(shareUrl || ''),
    sentAt: now,
    expires24hAt: now + 24 * 3600 * 1000,
    remindWeekAt: Date.parse('2026-12-10T00:00:00Z'),
    burnAt: Date.parse('2026-12-16T00:00:00Z'),
    openedByFriend: false,
    activated: false,
    status: 'waiting_24h', // 'waiting_24h' | 'opened_unactivated' | 'activated' | 'returned_24h' | 'reclaimed' | 'burned_dec16'
  });
  writeSentTicketsLedger(list);
}

/**
 * v13.0: Автопроверка всех отправленных билетов в памяти:
 * - Не зашёл друг за 24ч -> билет автоматически возвращается отправителю (+1) для повторной отправки!
 * - За неделю до 17.12 (с 10.12) если друг не активировал -> напоминание другу / запрос на возврат!
 * - За день (16.12) неактивированные билеты сгорают!
 */
function reconcileSentTicketsLifecycle({ silent = false } = {}) {
  const list = readSentTicketsLedger();
  if (!list.length) return { returnedCount: 0, burnedCount: 0, activeWaiting: 0 };
  const now = Date.now();
  let changed = false;
  let returnedCount = 0;
  let burnedCount = 0;
  let activeWaiting = 0;

  for (const item of list) {
    if (item.activated || item.status === 'activated' || item.status === 'returned_24h' || item.status === 'reclaimed' || item.status === 'burned_dec16') {
      continue;
    }
    if (now >= (item.burnAt || Date.parse('2026-12-16T00:00:00Z'))) {
      item.status = 'burned_dec16';
      burnedCount += 1;
      changed = true;
      continue;
    }
    if (item.status === 'waiting_24h' && !item.openedByFriend && now >= (item.expires24hAt || 0)) {
      item.status = 'returned_24h';
      item.returnedAt = now;
      returnedCount += 1;
      changed = true;
      continue;
    }
    activeWaiting += 1;
  }

  if (changed) {
    writeSentTicketsLedger(list);
    if (returnedCount > 0) {
      addPendingCinemaTicket(returnedCount);
      if (!silent) {
        showToast(`🎟 Друг не зашёл по ссылке за 24ч — билет вернулся (${returnedCount} шт.)! Можно отправить повторно!`);
      }
    } else if (burnedCount > 0 && !silent) {
      showToast('🔥 Срок до 16 декабря истёк — неактивированные билеты сгорели.');
    }
  }
  return { returnedCount, burnedCount, activeWaiting };
}

/**
 * v13.0: Серверная синхронизация жизненного цикла билетов с таблицей Supabase `ticket_passes`
 * (24ч автовозврат, ручной возврат с 10.12, сгорание 16.12 и актуальный pending_tickets_count).
 */
async function syncSentTicketsWithServer({ silent = true } = {}) {
  const res = await reconcileServerTicketPasses(state.tg?.user).catch(() => null);
  if (!res?.ok) return res;

  state.profile.pendingTicketsCount = Math.max(0, Number(res.pendingTicketsCount || 0));
  state.profile.hasPendingTicket = state.profile.pendingTicketsCount > 0;
  saveLocalV9Flags();

  if (Array.isArray(res.passes)) {
    const mapped = res.passes.map((p) => {
      const st =
        p.status === 'issued'
          ? 'waiting_24h'
          : p.status === 'expired_returned'
            ? 'returned_24h'
            : p.status === 'claimed' || p.status === 'sent'
              ? 'activated'
              : p.status;
      return {
        passId: p.passId,
        recipientName: p.recipientName || 'Друг',
        shareUrl: '',
        sentAt: Number(p.sentAt || Date.now()),
        expires24hAt: Number(p.expires24hAt || Date.now() + 24 * 3600 * 1000),
        remindWeekAt: Date.parse('2026-12-10T00:00:00+05:00'),
        burnAt: Date.parse('2026-12-16T00:00:00+05:00'),
        status: st,
        openedByFriend: p.status === 'claimed' || p.status === 'sent',
        activated: p.status === 'claimed' || p.status === 'sent',
      };
    });
    writeSentTicketsLedger(mapped);
  }

  syncPendingTicketsFloatingUI();
  syncBurgerMenuLocks();
  updatePremiereBarsUI();

  if (!silent) {
    if (res.returnedCount > 0) {
      showToast(`🎟 Друг не зашёл по ссылке за 24ч — сервер вернул билет (${res.returnedCount} шт.)!`);
    } else if (res.burnedCount > 0) {
      showToast('🔥 Срок до 16 декабря истёк — неактивированные билеты сгорели.');
    }
  }
  return res;
}

function renderSentTicketsLedgerInModal() {
  const box = document.getElementById('golden-fork-ledger-box');
  if (!box) return;
  const list = readSentTicketsLedger();
  const activeItems = list.filter((x) => x.status === 'waiting_24h' || x.status === 'opened_unactivated');
  if (!activeItems.length) {
    box.setAttribute('hidden', '');
    box.innerHTML = '';
    return;
  }
  box.removeAttribute('hidden');
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'mono-tag';
  head.style.marginBottom = '4px';
  head.textContent = `📦 ОТПРАВЛЕННЫЕ БИЛЕТЫ В ПАМЯТИ (${activeItems.length}):`;
  box.appendChild(head);

  const now = Date.now();
  activeItems.slice(0, 4).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ticket-friend-row';
    const hrsLeft = Math.max(1, Math.ceil(((item.expires24hAt || now) - now) / 3600000));
    const lbl = document.createElement('span');
    lbl.textContent =
      item.status === 'waiting_24h'
        ? `⏳ ${item.recipientName} — ждёт входа (вернётся через ~${hrsLeft}ч)`
        : `🔔 ${item.recipientName} — открыл, не активировал (напомнили до 10.12)`;
    row.appendChild(lbl);
    if (item.status === 'opened_unactivated' && now >= (item.remindWeekAt || 0)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary btn-compact';
      btn.textContent = '↩ ВЕРНУТЬ';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const srv = await reclaimServerTicketPass(state.tg?.user, item.passId);
        if (!srv?.ok) {
          btn.disabled = false;
          showToast('⏳ Вернуть билет можно после 10 декабря или если друг не зашёл за 24ч.');
          return;
        }
        item.status = 'reclaimed';
        writeSentTicketsLedger(list);
        if (typeof srv.pendingTicketsCount === 'number') {
          state.profile.pendingTicketsCount = srv.pendingTicketsCount;
          state.profile.hasPendingTicket = srv.pendingTicketsCount > 0;
          saveLocalV9Flags();
        } else {
          addPendingCinemaTicket(1);
        }
        showToast(`🎟 Билет от ${item.recipientName} возвращён! Отправь новому другу!`);
        openGoldenTicketForkModal();
      });
      row.appendChild(btn);
    }
    box.appendChild(row);
  });
}

function finishTicketSendAndReturnToGame({ passId, recipientName, shareUrl, skipTelegramShare = false }) {
  recordSentTicketInLedger({ passId, recipientName, shareUrl });
  const remainingTickets = consumePendingCinemaTicketAndReward();
  state.giftPass.lastPassUrl = shareUrl;
  state.giftPass.recipientName = recipientName;
  updatePremiereBarsUI();

  // СТРОГО 1 отправка на билет: сразу закрываем модалку, скрываем блок отправки на финале и возвращаем в игру!
  document.getElementById('modal-golden-fork')?.setAttribute('hidden', '');
  if (remainingTickets <= 0) {
    document.getElementById('finale-ticket-win-box')?.setAttribute('hidden', '');
    document.querySelector('#screen-finale .finale-sheet')?.classList.remove('is-ticket-mode');
  }
  syncPendingTicketsFloatingUI();
  syncBurgerMenuLocks();

  if (!skipTelegramShare) {
    openTelegramShare(
      shareUrl,
      `🎟 ${recipientName}, погнали в кино на «БОЧКУ» с 17 декабря! Я собрал для тебя бесплатный билет (без чеков!) — открой за 24ч: `
    );
  }

  showToast(
    skipTelegramShare
      ? `🎟 Билет доставлен ${recipientName} прямо в @bochka_film_bot! Продолжаем игру!`
      : remainingTickets > 0
        ? `🎟 Билет отправлен! Осталось ещё ${remainingTickets} шт. (если друг не зайдёт за 24ч — вернётся!)`
        : '🎟 Билет отправлен другу! Если он не зайдёт за 24ч — билет вернётся к тебе. Продолжаем игру!'
  );
  Haptics.success();

  // Сразу возвращаем игрока в игру (на следующий уровень если был на финале Ур.3, либо снимаем паузу цеха/дуэли!)
  state.round.pausedForModal = false;
  if (state.activeScreen === 'finale') {
    window.setTimeout(() => startDemoRound(), 320);
  }
}

function openGoldenTicketForkModal() {
  reconcileSentTicketsLifecycle();
  state.round.pausedForModal = true;
  state.giftPass.processedPhoto = null;
  state.giftPass.lastPassUrl = '';

  const cnt = Math.max(0, Number(state.profile.pendingTicketsCount || 0));
  const titleEl = document.getElementById('golden-fork-title');
  const descEl = document.getElementById('golden-fork-desc');
  const lblEl = document.getElementById('btn-gift-ticket-label');
  const choicesEl = document.getElementById('fork-choices-stack');
  const friendsWrap = document.getElementById('golden-fork-friends-section');

  if (cnt <= 0) {
    if (titleEl) titleEl.textContent = '📦 ТВОИ ОТПРАВЛЕННЫЕ БИЛЕТЫ';
    if (descEl) {
      descEl.textContent =
        'Все выбитые билеты уже отправлены! Если друг не зайдёт по ссылке за 24 часа — билет вернётся сюда автоматически, и ты сможешь отправить его другому другу.';
    }
    choicesEl?.setAttribute('hidden', '');
    friendsWrap?.setAttribute('hidden', '');
  } else {
    const word = cnt === 1 ? 'БИЛЕТ В КИНО' : cnt <= 4 ? `${cnt} БИЛЕТА В КИНО` : `${cnt} БИЛЕТОВ В КИНО`;
    if (titleEl) {
      titleEl.textContent = cnt > 1
        ? `🎟 У ТЕБЯ ${word} ИЗ 4 ЧАСТЕЙ ДЛЯ ДРУЗЕЙ!`
        : '🎟 БИЛЕТ ИЗ 4 ЧАСТЕЙ СКЛЕЕН ДЛЯ ДРУГА!';
    }
    if (descEl) {
      descEl.textContent =
        'Использовать собранный билет самому нельзя — подари его другу в Telegram (чистый бесплатный билет без чеков!), а сам возьми соседнее кресло рядом!';
    }
    if (lblEl) {
      lblEl.textContent = cnt > 1
        ? `🎁 ПОДАРИТЬ ЭТОТ БИЛЕТ ДРУГУ В TELEGRAM (ОСТАЛОСЬ ${cnt})`
        : '🎁 ПОДАРИТЬ ЭТОТ БИЛЕТ ДРУГУ В TELEGRAM';
    }
    choicesEl?.removeAttribute('hidden');
    friendsWrap?.removeAttribute('hidden');
    populateGoldenForkFriendsList().catch(() => {});
  }

  renderSentTicketsLedgerInModal();
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

async function populateGoldenForkFriendsList() {
  const listEl = document.getElementById('golden-fork-friends-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="mono-tag" style="opacity:.7;">Ищем друзей, которые уже играют с тобой…</div>';
  const friends = await fetchMyGameFriends(state.tg?.user).catch(() => []);
  if (!friends.length) {
    listEl.innerHTML =
      '<div class="mono-tag" style="opacity:.78;">Пока никто из друзей ещё не зашёл по твоей ссылке — отправь билет новому другу кнопкой ниже (даёт ещё больше к шкале Супер-приза)!</div>';
    return;
  }
  listEl.innerHTML = '';
  friends.slice(0, 8).forEach((fr) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'ticket-friend-row';
    const label = document.createElement('span');
    const nameStr = fr.receiver_name || 'Друг';
    label.textContent = `👤 ${nameStr}${fr.receiver_username ? ' @' + fr.receiver_username : ''}`;
    const cta = document.createElement('strong');
    cta.textContent = '🎟 ОТПРАВИТЬ В БОТ';
    row.append(label, cta);
    row.addEventListener('click', async () => {
      row.disabled = true;
      cta.textContent = 'ОТПРАВКА…';
      const pass = await createGiftTicketPass({
        tgUser: state.tg?.user,
        senderName: state.tg?.user?.name || 'Друг',
        recipientName: nameStr,
        processedPassPhoto: state.giftPass.processedPhoto,
      });
      if (pass?.ok) {
        const dmRes = await sendDirectGiftTicketToFriend({ tgUser: state.tg?.user, friend: fr, giftId: pass.giftId });
        // v15.4: Если выбрал друга из списка в игре и бот доставил билет в ЛС — НЕ выходим в окно «выбрать кому»!
        finishTicketSendAndReturnToGame({
          passId: pass.giftId || pass.passId,
          recipientName: nameStr,
          shareUrl: pass.shareUrl,
          skipTelegramShare: Boolean(dmRes?.tgSent),
        });
      } else {
        row.disabled = false;
        cta.textContent = '🎟 ОТПРАВИТЬ В БОТ';
      }
    });
    listEl.appendChild(row);
  });
}

function closeGoldenTicketForkModal() {
  document.getElementById('modal-golden-fork')?.setAttribute('hidden', '');
  syncPendingTicketsFloatingUI();
  if (Number(state.profile.pendingTicketsCount || 0) > 0) {
    showToast(`🎟 Билеты сохранены (${state.profile.pendingTicketsCount} шт.) — отправь друзьям, пока не сгорели (+${state.profile.pendingTicketsCount * 3} ❤️)!`);
  }
  if (state.activeScreen === 'workshop' && state.round.modeType === 'premiere') {
    if (state.profile.lives > 0) {
      state.round.pausedForModal = false;
      if (getUnstruckBarrelIndices().length === 0) reloadPremiereBarrelsWave();
    } else {
      finishPremiereRound(false, null);
    }
  } else if (state.activeScreen === 'workshop') {
    state.round.pausedForModal = false;
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
  if (Number(state.profile?.pendingTicketsCount || 0) <= 0) {
    showToast('🎟 Этот билет уже отправлен! Если друг не зайдёт за 24ч — он вернётся автоматически.');
    document.getElementById('modal-golden-fork')?.setAttribute('hidden', '');
    return;
  }
  const recipientName = (document.getElementById('input-gift-friend-name')?.value || '').trim() || 'Друг';
  const errEl = document.getElementById('gift-form-error');

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

    finishTicketSendAndReturnToGame({
      passId: created.giftId || created.passId,
      recipientName,
      shareUrl: created.shareUrl,
    });
  } finally {
    if (issueBtn) issueBtn.disabled = false;
  }
}

function openLivesRecoveryModal({ forLevel = null } = {}) {
  state.round.pausedForModal = true;
  stopAirTimer();
  const lvl = Number(forLevel || state.round?.workshopLevel || state.profile?.currentLevel || 2);
  const titleEl = document.getElementById('lives-recovery-title');
  const pr = document.getElementById('lives-recovery-progress');
  const kpBtn = document.getElementById('btn-life-rec-kp');
  const friendBtn = document.getElementById('btn-life-rec-friend');
  const subBtn = document.querySelector('[data-life-action="sub"]');
  const likeBtn = document.querySelector('[data-life-action="like"]');

  const curPts = Math.max(0, Math.round(Number(state.profile?.premierePoints || 0)));
  const leftToDuels = Math.max(0, 1500 - curPts);

  // v10.0: Проиграл (0 ❤️) -> ТОЛЬКО 1 чёткий путь: закатать и отправить новому другу (+3 ❤️ и +200 ⭐), без лишнего выбора!
  if (titleEl) titleEl.textContent = '☠️ Жизни кончились! Закатай друга и получи +3 ❤️';
  if (pr) {
    pr.textContent = `Чтобы вернуть +3 ❤️ (9 ударов) и набрать больше приглашений и ⭐ баллов на закрытую Премьеру в Москве (сейчас ⭐ ${fmtPoints(curPts)}) — закатай нового друга в бочку!`;
  }
  const regenHint = document.getElementById('lives-recovery-regen-hint');
  if (regenHint) {
    regenHint.textContent = formatNextStrikeRegenHint();
  }
  friendBtn?.removeAttribute('hidden');
  kpBtn?.setAttribute('hidden', '');
  subBtn?.setAttribute('hidden', '');
  likeBtn?.setAttribute('hidden', '');
  document.querySelectorAll('[data-life-action]').forEach((b) => { b.disabled = false; });
  document.getElementById('modal-lives-recovery')?.removeAttribute('hidden');
  Haptics.error();
}

function fmtPoints(n) {
  return Math.max(0, Math.round(Number(n || 0))).toLocaleString('ru-RU');
}

async function handleLifeRecoveryAction(kind) {
  if (kind === 'pack_friend') {
    document.getElementById('modal-lives-recovery')?.setAttribute('hidden', '');
    state.pack.forLifeRefill = true;
    showScreen('pack');
    return;
  }
  const urls = {
    kp: ENV.kinopoiskUrl,
    sub: ENV.youtubeSubscribeUrl || ENV.youtubeWatchUrl,
    like: ENV.youtubeWatchUrl,
  };
  document.querySelectorAll('[data-life-action]').forEach((b) => { b.disabled = true; });
  openExternalLink(urls[kind] || ENV.youtubeWatchUrl);
  await new Promise((resolve) => window.setTimeout(resolve, 2600));
  const res = await claimLifeRecovery(state.tg?.user, kind).catch(() => ({ granted: false }));
  const v8 = await awardV8LevelProgress(state.tg?.user, {
    level: state.round?.workshopLevel || state.profile?.currentLevel || 2,
    pointsDelta: 0,
    livesDelta: 3,
  }).catch(() => null);

  state.profile.lives = Math.max(3, Number(v8?.lives ?? res?.lives ?? 3));
  updatePremiereBarsUI();
  refreshHudLevelLabel();
  document.getElementById('modal-lives-recovery')?.setAttribute('hidden', '');
  showToast('❤️ +3 жизни (9 ударов)! Продолжаем!');
  Haptics.success();

  if (state.round?.modeType === 'premiere') {
    state.round.running = false;
    startPremiereRaceRound();
  } else {
    state.round.pausedForModal = false;
    state.round.attemptsLeft = 3;
    state.round.airLeft = Math.max(22.0, state.round.airLeft || 25.0);
    state.round.running = true;
    renderAttemptSquares(3, 3);
    updateAirHUD(state.round.airLeft);
    scene.setInteractive(true);
    startAirCountdownLoop();
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
  state.pairReceiptUrl = '';
  const poolMeta = await fetchTicketPoolStatus().catch(() => ({ requirePairReceipt: false }));
  state.requirePairReceipt = Boolean(poolMeta?.requirePairReceipt);
  const receiptBox = document.getElementById('pair-receipt-upload-box');
  if (receiptBox) {
    if (state.requirePairReceipt) receiptBox.removeAttribute('hidden');
    else receiptBox.setAttribute('hidden', '');
  }
  const rPrev = document.getElementById('pair-receipt-preview');
  const rStat = document.getElementById('pair-receipt-status');
  if (rPrev) { rPrev.removeAttribute('src'); rPrev.setAttribute('hidden', ''); }
  if (rStat) rStat.textContent = 'На скриншоте должны быть видны кинотеатр, дата, время, ряд и место.';

  const photoEl = document.getElementById('pass-holder-photo');
  const numEl = document.getElementById('pass-virtual-number');
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
  if (numEl) numEl.textContent = `№ BOCHKA-${String(passData.id || '1712').toUpperCase()}`;
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

  // v15.1: Любой реальный друг (кроме самого отправителя) может принять бесплатный билет 1 раз на свой телефон!
  const isAlreadyFighter = false;

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
  const ticketNum = `№ BOCHKA-${String(passData.id || '1712').toUpperCase()}`;
  if (statusTag) {
    statusTag.textContent = isSent
      ? '🎟 БИЛЕТ ВЫПИСАН // @BOCHKA_FILM_BOT'
      : '🎟 БРОНЬ ЗАКРЕПЛЕНА // @BOCHKA_FILM_BOT';
  }

  if (contactEl) {
    contactEl.textContent = isSent
      ? `Бесплатный билет ${ticketNum} выписан и отправлен прямо в чат @bochka_film_bot!`
      : 'Бронь закреплена за твоим номером! Как только кинотеатры откроют продажи на 17 декабря (обычно за 4–7 дней до премьеры), мы выкупим билет и пришлём готовый QR-код прямо сюда в бот @bochka_film_bot.';
  }
  const nativeSub = document.getElementById('pass-native-pair-sub');
  if (nativeSub) {
    const sess = passData.cityCinema ? ` (${passData.cityCinema})` : '';
    nativeSub.textContent = `Мы уже сообщили твоему другу о брони${sess} — жмите «Буду смотреть» на Кинопоиске или подпишитесь на старт продаж на Афише, чтобы взять соседнее место рядом!`;
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
        phoneBadge.textContent = `✓ Контакт Telegram подтверждён${numTxt}! Жми кнопку ниже, чтобы забрать виртуальный билет.`;
        phoneBadge.removeAttribute('hidden');
      }
    }, 650);
    if (phoneBadge) {
      const numTxt = res.phone ? `: ${res.phone}` : '';
      phoneBadge.textContent = `✓ Контакт Telegram подтверждён${numTxt}! Жми кнопку ниже, чтобы забрать виртуальный билет.`;
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
  const phoneBadge = document.getElementById('pass-verified-phone-badge');
  const refreshBtn = document.getElementById('btn-refresh-tg-contact');
  const cityCinema = (document.getElementById('input-pass-city-cinema')?.value || '').trim();
  const pairSeatPref = (document.getElementById('input-pair-seat-pref')?.value || '').trim();
  errEl?.setAttribute('hidden', '');

  if (cityCinema.length < 3) {
    if (errEl) {
      errEl.textContent = 'Укажи город, удобный кинотеатр и желаемый день (например: Москва, Октябрь, 17 или 18 декабря — или просто напишите: любой удобный).';
      errEl.removeAttribute('hidden');
    }
    Haptics.error();
    return;
  }

  if (state.requirePairReceipt === true && !state.pairReceiptUrl) {
    if (errEl) {
      errEl.textContent = 'Загрузи скриншот купленного 1-го билета (с рядом и местом), чтобы мы выкупили соседнее кресло за 0 ₽!';
      errEl.removeAttribute('hidden');
    }
    Haptics.error();
    return;
  }

  const btn = document.getElementById('btn-accept-gift-pass');
  if (btn) btn.disabled = true;

  try {
    if (!state.verifiedContactPhone && !state.activePassData?.hasVerifiedPhone) {
      const cRes = await requestTelegramContact({ giftId: state.activePassData.id });
      if (cRes?.phone) {
        state.verifiedContactPhone = cRes.phone;
      } else if (cRes?.reason === 'opened_bot_chat') {
        refreshBtn?.removeAttribute('hidden');
        if (phoneBadge) {
          phoneBadge.textContent =
            'В чате @bochka_film_bot нажми «📱 Подтвердить номер телефона», вернись и снова нажми кнопку ниже!';
          phoneBadge.removeAttribute('hidden');
        }
        return;
      }
    }

    const res = await submitGiftTicketOrder({
      giftId: state.activePassData.id,
      tgUser: state.tg?.user,
      cityCinema,
      fallbackPhone: state.verifiedContactPhone,
      pairReceiptUrl: state.pairReceiptUrl || '',
      pairSeatPref,
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
            'Открой эту подарочную ссылку внутри Telegram (@bochka_film_bot), чтобы подтвердить аккаунт и забрать 2-й билет рядом за 0 ₽!',
          contact_not_verified:
            'Нажми «📱 Подтвердить номер телефона» в @bochka_film_bot и затем ещё раз нажми кнопку ниже!',
          phone_already_used:
            'На этот номер телефона уже выписывался парный билет в рамках акции (1 уникальный номер = 1 билет)!',
          pair_receipt_required:
            'Загрузи скриншот купленного 1-го билета (с рядом и местом), чтобы получить соседнее кресло за 0 ₽!',
        };
        errEl.textContent =
          messages[res.reason] || 'Не удалось оформить заявку на соседнее кресло. Проверь интернет и открой ссылку в @bochka_film_bot.';
        errEl.removeAttribute('hidden');
        if (res.reason === 'contact_not_verified') {
          document.getElementById('btn-verify-tg-contact')?.removeAttribute('hidden');
        }
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

function enterWorkshopTrailerPrompt() {
  const r = state.round;
  r.roundLives = 0;
  r.attemptsLeft = 0;
  r.rescueStage = 3;
  r.awaitingTrailerRescue = true;
  r.lockedBarrelTaps = 0;
  r.running = true;
  r.pausedForModal = false;
  stopAirTimer();
  audio.stopListening();
  renderAttemptSquares(0, 3);
  refreshHudLevelLabel();
  scene.setInteractive(true);

  const taskEl = document.getElementById('hud-task-banner');
  if (taskEl) {
    taskEl.textContent = '🔒 Попытки кончились! Нажми «Смотреть трейлер», чтобы спасти друга и получить +3 ❤️';
  }
  const cta = document.getElementById('workshop-rescue-cta');
  const msgEl = document.getElementById('workshop-rescue-msg');
  if (msgEl) {
    msgEl.textContent = 'Попытки кончились! Нажми посмотреть трейлер, чтобы спасти друга из бочки и получить ещё шанс (+3 ❤️)';
  }
  if (cta) {
    cta.removeAttribute('hidden');
    cta.classList.remove('is-nudge');
    void cta.offsetWidth;
    cta.classList.add('is-nudge');
  }
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

  document.getElementById('workshop-rescue-cta')?.setAttribute('hidden', '');
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');
  openTrailerModal({ forRescue: true });
}

function claimTrailerFifthLife() {
  if (!state.trailer.unlocked40) return;
  closeTrailerModal();
  document.getElementById('modal-rescue')?.setAttribute('hidden', '');
  document.getElementById('workshop-rescue-cta')?.setAttribute('hidden', '');

  // v8.5: После просмотра трейлера (с 0 ❤️) начисляется ровно +3 жизни (❤️ 3 = 9 ударов) и 4-я бочка готова к вскрытию!
  const prevLives = Math.max(0, Number(state.profile.lives || 0));
  const targetLives = state.round.modeType === 'viral' ? 3 : Math.max(3, prevLives + 3);
  const deltaToSave = targetLives - prevLives;
  state.profile.lives = targetLives;
  state.round.roundLives = targetLives;
  if (deltaToSave !== 0) {
    awardV8LevelProgress(state.tg?.user, { level: 1, pointsDelta: 0, livesDelta: deltaToSave }).catch(() => {});
  }
  state.round.rescueStage = 4;
  state.round.awaitingTrailerRescue = false;
  state.round.lockedBarrelTaps = 0;
  state.round.attemptsLeft = 3;
  state.round.airLeft = 25.0;
  state.round.lastUrgentSec = 9;
  state.round.running = true;
  state.round.pausedForModal = false;
  state.round.strikeBusy = false;

  refreshHudLevelLabel();
  // v11.6: Пошаговое наполнение 0→1→2→3 ❤️ и 0→1→2→3 🟨 ударов при прилёте в HUD!
  runStepwiseHudFillAnimation({ targetLives: targetLives, targetStrikes: 3 });
  const taskEl = document.getElementById('hud-task-banner');
  if (taskEl) {
    taskEl.textContent = '🔥 +3 ❤️ получены! Нажимай на последнюю бочку — спаси друга!';
  }
  updateAirHUD(state.round.airLeft);
  scene.setInteractive(true);
  if (state.round.voiceUrl) {
    audio.startMuffledVoiceLoop();
  }
  startAirCountdownLoop();
  showToast('❤️ +3 жизни (9 ударов ломом)! Вскрывай последнюю бочку — там твой друг!');
  Haptics.success();
}

/* ============================================================================
   ФИНАЛ РАУНДА: СРЫВ КРЫШКИ, ЧИСТЫЙ ГОЛОС ДРУГА И ПИНГ В TELEGRAM
   ============================================================================ */
function playFullScreenScreamer(durationMs = 1800) {
  return new Promise((resolve) => {
    const el = document.getElementById('fx-scream');
    if (!el) {
      resolve();
      return;
    }
    const kind = state.round?.screamerType || 'saw_scream';
    const face = document.getElementById('fx-scream-face');
    const txt = document.getElementById('fx-scream-text');
    const isCustomFriend = Boolean(state.incomingPack && !state.round?.isDemo && state.round?.portraitDataUrl);
    const horrorImgByKind = {
      saw_scream: './public/sprites/horror_barrel_face.webp',
      weld: './public/sprites/horror_gasmask_weld.webp',
      lid_blast: './public/sprites/horror_claw_hands.webp',
      lunge: './public/sprites/horror_claw_hands.webp',
      basement_shriek: './public/sprites/horror_barrel_face.webp',
      tesla_siren: './public/sprites/horror_gasmask_weld.webp',
      siren_cam: './public/sprites/horror_cctv_face.webp',
      custom_scream: './public/sprites/horror_cctv_face.webp',
    };
    if (face) {
      face.src = isCustomFriend
        ? state.round.portraitDataUrl
        : (horrorImgByKind[kind] || './public/sprites/horror_barrel_face.webp');
    }
    if (txt) txt.textContent = isCustomFriend ? 'ТЕБЯ ЗАКАТАЛИ В БОЧКУ' : '';
    el.setAttribute('data-variant', kind);
    el.setAttribute('data-fullbleed', isCustomFriend ? '0' : '1');
    el.classList.remove('is-live', 'is-out');
    el.removeAttribute('hidden');
    void el.offsetWidth;
    el.classList.add('is-live');

    audio.playFullScreamer?.(kind);
    if (kind === 'custom_scream' && state.round?.voiceUrl) {
      audio.playCleanSenderVoice(state.round.voiceUrl, { useBarrelFilter: true });
    }
    const strobeMap = {
      saw_scream: 0xfef08a,
      lid_blast: 0xf97316,
      basement_shriek: 0xdc2626,
      tesla_siren: 0x38bdf8,
      custom_scream: 0xef4444,
    };
    scene?.triggerScreamerShake(0.68, strobeMap[kind] || 0xdc2626);
    Haptics.screamer(kind);
    document.body.classList.add('is-horror-jolt');

    window.setTimeout(() => {
      el.classList.add('is-out');
      document.body.classList.remove('is-horror-jolt');
      window.setTimeout(() => {
        el.setAttribute('hidden', '');
        el.classList.remove('is-live', 'is-out');
        resolve();
      }, 220);
    }, Math.max(300, durationMs - 220));
  });
}

function playRevealAvatar(durationMs = 1500, { barrelIndex = -1, isBoy = false, caption = '', customImgSrc = '' } = {}) {
  return new Promise((resolve) => {
    const el = document.getElementById('fx-reveal');
    if (!el) {
      resolve();
      return;
    }
    const img = document.getElementById('fx-reveal-img');
    const txt = document.getElementById('fx-reveal-text');
    const src =
      customImgSrc ||
      (isBoy ? './public/sprites/hero_boy_live.webp' : (state.round?.portraitDataUrl || DEMO_PORTRAITS[0]));
    if (img) img.src = src;
    if (txt) {
      txt.textContent = caption || (isBoy ? 'ВЫБИРАЮСЬ ИЗ БОЧКИ! СПАСИБО, ЧТО СПАС!' : 'ДЫШУ! СПАСИБО, ЧТО НАШЁЛ МЕНЯ!');
    }

    // Проецируем точные экранные координаты вскрытой 3D-бочки — пацан физически вылезает прямо из неё!
    const bIdx = barrelIndex >= 0 ? barrelIndex : Number(state.round?.targetIndex ?? 0);
    const pos = scene?.projectBarrelScreenPos?.(bIdx, 1.05);
    const bx = pos?.visible ? Math.round(pos.x) : Math.round(window.innerWidth * 0.5);
    const by = pos?.visible ? Math.round(pos.y) : Math.round(window.innerHeight * 0.56);
    el.style.setProperty('--barrel-x', `${bx}px`);
    el.style.setProperty('--barrel-y', `${by}px`);

    el.classList.remove('is-live', 'is-out', 'is-boy-climb');
    if (isBoy) el.classList.add('is-boy-climb');
    el.removeAttribute('hidden');
    void el.offsetWidth;
    el.classList.add('is-live');
    audio.playDeepBreath?.();
    Haptics.success();
    window.setTimeout(() => {
      el.classList.add('is-out');
      window.setTimeout(() => {
        el.setAttribute('hidden', '');
        el.classList.remove('is-live', 'is-out', 'is-boy-climb');
        resolve();
      }, 240);
    }, Math.max(360, durationMs - 240));
  });
}

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

  if (didHitTarget) {
    if (state.round.voiceUrl) {
      window.setTimeout(() => {
        audio.playCleanSenderVoice(state.round.voiceUrl, {
          useBarrelFilter: state.round.useBarrelFilter !== false,
        });
      }, 280);
    } else if ((!state.round.isDemo || state.incomingPack) && state.round.screamerType) {
      // v15.4: Если друг выбрал звук/скример (петух, собака, крик из подвала, циркулярка...) — обязательно проигрываем его при вскрытии бочки!
      window.setTimeout(() => {
        audio.playFullScreamer(state.round.screamerType, { preview: true });
      }, 280);
    }
  }

  const completedLvl = Math.max(1, Number(state.round.workshopLevel || 1));
  const v8PointsTable = { 1: 150, 2: 150, 3: 300, 4: 350, 5: 400 };
  if (survived) {
    const ptsDelta = v8PointsTable[completedLvl] || 300;
    const nextLvl = Math.max(Number(state.profile.currentLevel || 1), completedLvl + 1);
    state.profile.currentLevel = nextLvl;
    state.profile.premierePoints = Math.max(0, Number(state.profile.premierePoints || 0) + ptsDelta);
    state.round.lastPointsAwarded = ptsDelta;

    awardV8LevelProgress(state.tg?.user, {
      level: nextLvl,
      pointsDelta: ptsDelta,
      livesDelta: 0,
    })
      .then((res) => {
        if (res?.ok) {
          state.profile.currentLevel = Math.max(state.profile.currentLevel, res.currentLevel);
          state.profile.premierePoints = Math.max(state.profile.premierePoints, res.premierePoints);
          if (typeof res.lives === 'number') state.profile.lives = capEarlyLivesIfNoRealFriends(res.lives);
          updatePremiereBarsUI();
          refreshHudLevelLabel();
          // Уровень 3 (билет найден): перекрёстный пуш рефереру!
          if (completedLvl === 3 && res.referrerTgId) {
            notifyReferrerTicketWon({ tgUser: state.tg?.user, referrerTgId: res.referrerTgId }).catch(() => {});
          }
        }
      })
      .catch(() => {});
    updatePremiereBarsUI();
    refreshHudLevelLabel();
  }

  if (!state.round.isDemo && state.incomingPack) {
    // v15.2: После 1-й бочки друга поднимаем только до Стадии 2 (НЕ открываем Дуэли раньше Ур. 5!)
    const nextStage = Math.max(Number(state.uiStage || 1), 2);
    state.uiStage = nextStage;
    applyProgressiveDisclosureUI({ forceStage: nextStage });
    syncUiStage(state.tg?.user, nextStage).catch(() => {});
    const elapsedSec = Math.max(
      1,
      Math.min(30, Math.round(AIR_DURATION_SEC - Number(state.round.airLeft || 0)))
    );
    const screamerNames = {
      saw_scream: 'Визг циркулярки и крик',
      lid_blast: 'Взрыв крышки в лицо',
      basement_shriek: 'Крик из подвала',
      tesla_siren: 'Разряд тока и сирена',
      custom_scream: 'Свой крик из бочки',
      weld: 'Визг циркулярки и крик',
      lunge: 'Взрыв крышки в лицо',
      siren_cam: 'Ток и сирена',
    };
    recordBarrelResult(state.incomingPack, {
      survived,
      attemptsUsed: state.round.attemptsUsed || 4,
      timeLeft: state.round.airLeft,
      elapsedSec,
      screamerLabel: screamerNames[state.round.screamerType] || 'Визг циркулярки и крик',
      viewerTgUser: state.tg.user,
    }).catch(() => {});
  }

  window.setTimeout(async () => {
    const revIdx = typeof diveBarrelIndex === 'number' && diveBarrelIndex >= 0 ? diveBarrelIndex : state.round.targetIndex;
    const isBoyRescue = survived && ((completedLvl === 1 && !state.incomingPack) || completedLvl >= 4);

    // v16.0 Путь А (бочка от друга): короткий вау-момент + сразу спокойная карточка «Играть с Тилем!»
    const isL1FriendReveal = survived && completedLvl === 1 && (!state.round.isDemo || Boolean(state.incomingPack));
    if (isL1FriendReveal) {
      await playRevealAvatar(1800, {
        barrelIndex: revIdx,
        isBoy: isBoyRescue,
        caption: state.incomingPack?.senderName
          ? `ТЫ НАШЁЛ СЕБЯ В БОЧКЕ ОТ ${String(state.incomingPack.senderName).toUpperCase()}!`
          : 'ТЫ НАШЁЛ СЕБЯ В БОЧКЕ!',
      });
      const senderLabel = state.incomingPack?.senderName ? `от ${state.incomingPack.senderName}` : 'от друга';
      showDuolingoCard({
        icon: '🛢',
        badge: 'ТЫ ВЫБРАЛСЯ ИЗ БОЧКИ!',
        title: `Бочка ${senderLabel} вскрыта!`,
        body: 'Теперь пора достучаться до небес — сыграй 35-секундный раунд с Тилем Швайгером и собери артефакт фильма!',
        buttonText: '▶ ИГРАТЬ С ТИЛЕМ!',
        tone: 'gold',
        onConfirm: () => {
          openTilThreePhaseGame();
        },
      });
      return;
    }

    // v11.0 Ур.2 (найдена пустая бочка): жизни НЕ улетают заранее — они улетают ровно 3 ❤️ ТОЛЬКО ПОСЛЕ ОТПРАВКИ другу!
    if (survived && completedLvl === 2) {
      state.profile.mustSendFriendPack = true;
      saveLocalV9Flags();
      await playRevealAvatar(1350, {
        barrelIndex: revIdx,
        isBoy: false,
        caption: '🛢 ПУСТАЯ БОЧКА НАЙДЕНА! УПАКУЙ И ОТПРАВЬ ДРУГА!',
      });
      showToast('🛢 Пустая бочка найдена! Отправь друга в бочке — сразу получишь 3 ❤️ и откроешь билеты!');
      state.pack.forLifeRefill = false;
      document.getElementById('pack-mandatory-banner')?.setAttribute('hidden', '');
      showScreen('pack');
      return;
    }

    // v15.0: После Уровня 1 отложенно подгружаем модуль Дуэлей в фоне (не тормозя старт <1.2 сек!)
    if (completedLvl >= 1 && !duelCtrl) {
      window.setTimeout(() => ensureDuelReady().catch(() => {}), 900);
    }

    // v15.0: Механика 4 обрывков билета (25% × 4 = 1 целый бесплатный билет другу БЕЗ чеков!):
    // - Часть 1/4: Ур. 2 (после отправки первой бочки другу)
    // - Часть 2/4: Ур. 3
    // - Часть 3/4: Ур. 4 (ИЛИ мгновенно, когда реальный друг открыл твою бочку!)
    // - Часть 4/4: Ур. 5+ (ИЛИ победа в Дуэли) -> атомарная проверка пула 100 шт. / 6 в сутки МСК!
    let shardAward = null;
    if (survived && completedLvl >= 3) {
      const shardSrc = `level${completedLvl}`;
      shardAward = await awardTicketShard(shardSrc, { silent: true });
      state.round.lastShardAward = shardAward;
      state.round.ticketGranted = Boolean(shardAward?.merged && shardAward?.granted);
      state.round.ticketDeniedReason = shardAward?.res?.reason || '';
      if (shardAward?.capReached && shardAward?.fallbackPoints) {
        state.round.lastPointsAwarded = (state.round.lastPointsAwarded || 300) + shardAward.fallbackPoints;
      }
      if ((state.round.attemptsUsed || 1) === 1) {
        state.profile.premierePoints = Math.max(0, Number(state.profile.premierePoints || 0) + 100);
        state.round.lastPointsAwarded = (state.round.lastPointsAwarded || 300) + 100;
        updatePremiereBarsUI();
      }
      const pos = scene?.projectBarrelScreenPos?.(revIdx, 1.05);
      flyRewardToHud({
        type: 'rating',
        count: 3,
        label: shardAward?.merged
          ? '🎟 4/4 БИЛЕТ СКЛЕЕН!'
          : shardAward?.shards > 0
            ? `🎟 ЧАСТЬ ${shardAward.shards}/4!`
            : `⭐ +${state.round.lastPointsAwarded || 300}`,
        startX: pos?.visible ? pos.x : null,
        startY: pos?.visible ? pos.y : null,
      });
      syncSuperPrizeRatingBarUI();
      // v15.5: Шанс дропа официальной номерной карточки фильма на Ур. 3 (15%) и Ур. 5 (35%)
      if (completedLvl === 3 || completedLvl === 5) {
        rollRareMovieCardLazy(`level${completedLvl}`).catch(() => {});
      }
    }

    if (survived) {
      const isTicketStage = completedLvl >= 3;
      const shownShards = shardAward?.merged
        ? 4
        : Math.max(1, Number(shardAward?.shards || state.profile?.ticketShards || 1));
      let revealCaption = '🎉 ПАЦАН ВЫЛЕЗ ИЗ БОЧКИ! СПАСИБО!';
      if (shardAward?.merged && shardAward?.granted) {
        revealCaption = '🎟 4/4 — БИЛЕТ СКЛЕЕН! ПОДАРИ ДРУГУ В TELEGRAM!';
      } else if (shardAward?.capReached) {
        revealCaption = '⭐ ПУЛ НА СЕГОДНЯ РАЗОБРАН · +500 ⭐ В ТОП-20 МОСКВЫ!';
      } else if (shardAward?.seedExcluded) {
        revealCaption = '🛡 РЕЖИМ КОМАНДЫ · ПРИЗОВОЙ ПУЛ СОХРАНЁН ДЛЯ ЗРИТЕЛЕЙ!';
      } else if (isTicketStage) {
        revealCaption = `🎟 ЧАСТЬ БИЛЕТА ${shownShards}/4 (${shownShards * 25}%) НАЙДЕНА!`;
      }
      await playRevealAvatar(2200, {
        barrelIndex: revIdx,
        isBoy: isTicketStage ? false : isBoyRescue,
        customImgSrc: isTicketStage ? createTicketShardDataUrl(shownShards, Boolean(shardAward?.merged)) : '',
        caption: revealCaption,
      });
    } else {
      await playFullScreenScreamer(2900);
    }
    await populateFinaleScreen({ premiereResult: null });
    showScreen('finale');
    if (shardAward && ((shardAward.merged && shardAward.granted) || shardAward.shards > 0)) {
      window.setTimeout(() => {
        syncTicketShardsUI({
          pulse: true,
          showFullFlash: Boolean(shardAward.merged && shardAward.granted),
          justEarned: shardAward.merged ? 4 : Number(shardAward.shards || 0),
        });
      }, 140);
    }
  }, survived ? 1050 : 550);
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
  // v9.0: Сразу подставляем жёсткий хоррор-шаблон (а не логотип), если у игрока нет TG-аватара
  const preferredSrc = state.tg?.user?.photoUrl || './public/sprites/horror_hero_captive_f2.webp';
  await rebuildPackPortraitPreview(preferredSrc);
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
    let fallback;
    try {
      fallback = await processPortraitToWebP(DEMO_PORTRAITS[1], state.pack.frameStyle);
    } catch {
      fallback = await processPortraitToWebP(null, state.pack.frameStyle);
    }
    state.pack.processed = fallback;
    const previewImg = document.getElementById('pack-preview-img');
    if (previewImg) previewImg.src = fallback.dataUrl;
  }
}

async function handleQuick1TapPrankClick() {
  const quickBtn = document.getElementById('btn-pack-quick-1tap');
  const quickTxt = document.getElementById('btn-pack-quick-1tap-text');
  if (quickBtn?.disabled) return;
  if (quickBtn) quickBtn.disabled = true;
  if (quickTxt) quickTxt.textContent = '⏳ Создаём бочку с авто-аватаркой…';
  try {
    state.pack.screamerType = pickRandomBarrelSound();
    await handleSealBarrelClick({ forceAutoAvatar: true });
  } finally {
    if (quickBtn) quickBtn.disabled = false;
    if (quickTxt) quickTxt.textContent = '⚡ Пропустить и отправить в 1 клик (аватарка друга из Telegram)';
  }
}

async function handleSealBarrelClick({ forceAutoAvatar = false } = {}) {
  requestAndSyncWriteAccess();
  const sealBtn = document.getElementById('btn-seal-barrel');
  const sealTxt = document.getElementById('btn-seal-text');
  const quickBtn = document.getElementById('btn-pack-quick-1tap');
  if (!sealBtn || !sealTxt || sealBtn.disabled) return;

  if (voiceRecorder?.isRecording) {
    voiceRecorder.stop();
  }

  sealBtn.disabled = true;
  if (quickBtn) quickBtn.disabled = true;
  sealTxt.textContent = '⏳ Завариваем крышку…';
  audio.playWeldSeal();

  try {
    const teamRole = getTeamSeedRole();
    const isBroadcastPack = teamRole === 'prod' || teamRole === 'blog';
    // v16.0: Для обычных игроков: если нажали «Пропустить» или фото друга не загружено -> режим auto_avatar!
    const useAutoAvatar = !isBroadcastPack && (Boolean(forceAutoAvatar) || !state.pack.userUploadedPhoto);

    if (!useAutoAvatar && !state.pack.processed) {
      await rebuildPackPortraitPreview();
    }
    const phrase = document.getElementById('input-custom-phrase')?.value || 'Найди себя в бочке!';
    // v16.0: Звук бочки выбирается случайно автоматически (без лишнего экрана выбора!)
    const randomSound = pickRandomBarrelSound();
    state.pack.screamerType = randomSound;

    const broadcastPrefix = isBroadcastPack ? buildBroadcastPrefix(teamRole, state.tg?.user) : '';
    const created = await createBarrelPack({
      mode: useAutoAvatar ? 'auto_avatar' : 'friend',
      autoAvatar: useAutoAvatar,
      message: phrase,
      frameStyle: useAutoAvatar ? 'auto_avatar' : 'flashlight',
      screamerType: randomSound,
      zoneId: 1,
      targetBarrelIndex: -1,
      senderName: state.tg?.user?.name || '',
      tgUser: state.tg.user,
      processedImage: useAutoAvatar ? null : state.pack.processed,
      recordedVoice: null,
      isBroadcast: isBroadcastPack,
      broadcastPrefix,
    });

    state.pack.lastShareUrl = created.shareUrl;
    state.pack.lastBloggerInviteUrl = created.bloggerInviteUrl || '';
    state.pack.lastBroadcastPrefix = created.broadcastPrefix || broadcastPrefix || '';
    state.pack.lastBroadcastRole = isBroadcastPack ? teamRole : '';
    state.pack.lastWebUrl = created.webUrl;
    state.pack.shareLifeClaimedForUrl = '';
    state.profile.premiereScore = Math.max(Number(state.profile.premiereScore || 0), Number(created.premiereScore || 72));
    state.profile.temuSurgeClaimed = true;
    const prevRatingPct = computeSuperPrizeRatingPct(state.profile);
    const wasProducerFirstPack = isProducerPackFirstRequired();
    state.profile.packedCount = Math.max(1, Number(state.profile.packedCount || 0) + 1);
    if (isBroadcastPack) {
      state.profile.seedFirstPackDone = true;
      if (isBroadcastPack) state.profile.hasBroadcastBarrel = true;
      applySeedPackModeUI(false);
    }

    // v9.0: Игрок отправил бочку другу — снимаем обязательный замок Раунда 2 и открываем билеты и супер-приз!
    state.profile.mustSendFriendPack = false;
    saveLocalV9Flags();
    document.getElementById('pack-mandatory-banner')?.setAttribute('hidden', '');

    // v11.0 Честная экономика: после отправки жизни улетают ровно 3 ❤️ (5 быть не может, пока реальные друзья не зашли!).
    const wasLifeRefill = Boolean(state.pack.forLifeRefill);
    state.pack.forLifeRefill = false;
    const prevRoundLvl = Math.max(1, Number(state.round?.workshopLevel || 2));
    const targetNextLevel = wasProducerFirstPack
      ? 1
      : wasLifeRefill
        ? Math.max(2, prevRoundLvl)
        : prevRoundLvl <= 2
          ? 3
          : Math.max(3, prevRoundLvl + 1);
    state.profile.currentLevel = targetNextLevel;
    const prevLives = Math.max(0, Number(state.profile.lives || 0));
    const nextLives = capEarlyLivesIfNoRealFriends(Math.max(3, prevLives + 3));
    state.profile.lives = nextLives;
    awardV8LevelProgress(state.tg?.user, {
      level: targetNextLevel,
      pointsDelta: 0,
      livesDelta: Math.max(0, nextLives - prevLives),
    }).catch(() => {});
    await syncUiStage(state.tg?.user, wasProducerFirstPack ? 1 : 3).catch(() => {});

    const sharePrefix =
      teamRole === 'blog'
        ? '🛢 Я заварил себя в 3D-цеху фильма «БОЧКА»! Надень наушники — вытащи меня за 3 удара, собери 4 части бесплатного билета другу и попади в ТОП-20 на Закрытый показ в Москве 17 декабря'
        : '🛢 Кто-то заварил тебя в цеху «БОЧКИ»! Надень наушники — найди нужную крышку за 3 удара и собери билет в кино';
    const fullShareText = `${sharePrefix}${phrase ? `: «${phrase}»` : ''}`;
    const linkType = isBroadcastPack ? (teamRole === 'blog' ? 'bl' : 'pr') : 'pack';
    const prepShare = await prepareNativeShareMessage({
      tgUser: state.tg?.user,
      barrelId: created.id,
      linkType,
      senderName: state.tg?.user?.name || document.getElementById('input-sender-name')?.value || '',
      phrase,
      shareUrl: created.shareUrl,
    }).catch(() => ({ ok: false, fallback: true, preparedMessageId: '', shareUrl: created.shareUrl }));
    const shareOutcome = openNativeTelegramShareCard({
      preparedMessageId: prepShare?.preparedMessageId || '',
      shareUrl: prepShare?.shareUrl || created.shareUrl,
      shareText: fullShareText,
    });
    state.pack.lastShareMeta = {
      ...shareOutcome,
      linkType,
      startParam: prepShare?.startParam || `${linkType}_${created.id}`,
      prepareCalled: true,
    };
    updatePremiereBarsUI();
    refreshHudLevelLabel();
    // v15.0: Часть 1/4 билета выпадает сразу после отправки первой бочки другу на Уровне 2!
    let packShardRes = null;
    if (!isBroadcastPack && Number(state.profile?.ticketShards || 0) === 0 && Number(state.profile?.pendingTicketsCount || 0) === 0) {
      packShardRes = await awardTicketShard('level2_pack', { silent: false }).catch(() => null);
      if (packShardRes?.shards > 0) {
        syncTicketShardsUI({ pulse: true, justEarned: packShardRes.shards });
      }
    }
    // v12.5: На экране отправки сначала скрываем новые 3 ❤️ (показываем 0 ❤️), чтобы игрок ГЛАЗАМИ увидел прилёт 0→1→2→3 в шапку!
    state.pendingLevelStartFly = { lives: wasProducerFirstPack ? 1 : 3, strikes: 3 };
    Haptics.success();
    applyProgressiveDisclosureUI({ skipPromoteFromSocial: true });
    showSentScreen({ wasLifeRefill, wasBroadcastPack: isBroadcastPack, broadcastRole: teamRole, prevRatingPct, packShardRes });
    setHudVisualLivesDisplay(0);
    window.setTimeout(() => {
      flyRewardToHud({
        type: 'lives',
        count: 3,
        label: '+1 ❤️',
        onStepImpact: (step) => setHudVisualLivesDisplay(step),
      });
      window.setTimeout(() => flyRewardToHud({ type: 'rating', count: 1, label: '🏆 +3%' }), 720);
    }, 180);
    refreshQuestUI().catch(() => {});
  } finally {
    sealBtn.disabled = false;
    if (quickBtn) quickBtn.disabled = false;
    sealTxt.textContent = t('btnSealBarrel');
  }
}

function showSentScreen({ wasLifeRefill = false, wasBroadcastPack = false, broadcastRole = '', prevRatingPct = null, packShardRes = null } = {}) {
  const targetLvl = wasBroadcastPack && broadcastRole === 'prod' ? 1 : Math.max(3, Number(state.profile?.currentLevel || 3));
  const spec = getWorkshopLevelSpec(targetLvl);
  const titleEl = document.getElementById('sent-title');
  const txt = document.getElementById('sent-text');
  const btnTxt = document.getElementById('btn-sent-play-text');
  const copyBtn = document.getElementById('btn-sent-copy-link');
  const blogInvBtn = document.getElementById('btn-sent-copy-blogger-invite');
  const seedMetaEl = document.getElementById('sent-seed-meta');
  const nextPct = computeSuperPrizeRatingPct(state.profile);
  const startPct = prevRatingPct !== null ? Math.min(nextPct, prevRatingPct) : Math.max(0, nextPct - 3);
  const sPct = document.getElementById('sent-rating-pct');
  const sFill = document.getElementById('sent-rating-fill');
  const sNote = document.getElementById('sent-rating-note');
  if (sPct) sPct.textContent = `${startPct}% → ${nextPct}%`;
  if (sFill) {
    sFill.style.transition = 'none';
    sFill.style.width = `${startPct}%`;
    window.setTimeout(() => {
      sFill.style.transition = 'width 0.9s cubic-bezier(0.2, 0.9, 0.2, 1)';
      sFill.style.width = `${nextPct}%`;
      if (sPct) sPct.textContent = `${nextPct}%`;
    }, 160);
  }
  if (sNote) {
    sNote.textContent = wasBroadcastPack
      ? 'Эта одна ссылка работает на 10 000+ человек сразу: каждому сервер сам выдаст порядковый номер _1, _2, _3... без спама в личку!'
      : packShardRes?.shards > 0
        ? `🎟 Получена 1-я часть билета (${packShardRes.shards}/4 · 25%)! ⚔️ Когда друг зайдёт в игру по твоей ссылке — откроются Дуэли «На счёт три!» за билеты и главный приз (Закрытый показ в Москве 17 декабря)!`
        : '⚔️ Когда друг зайдёт в игру по твоей ссылке — откроются Дуэли «На счёт три!» за билеты и главный приз: Закрытый показ в Москве 17 декабря (+20% к шкале и бонусная часть билета)!';
  }
  if (copyBtn) {
    // v16.0: Общая ссылка доступна ТОЛЬКО продюсерам (team_prod) и блогерам (team_blog)!
    // Обычные игроки отправляют бочку строго 1-на-1 конкретному другу.
    if (wasBroadcastPack && state.pack?.lastShareUrl) copyBtn.removeAttribute('hidden');
    else copyBtn.setAttribute('hidden', '');
  }
  if (blogInvBtn) {
    if (wasBroadcastPack && broadcastRole === 'prod' && state.pack?.lastBloggerInviteUrl) {
      blogInvBtn.removeAttribute('hidden');
    } else {
      blogInvBtn.setAttribute('hidden', '');
    }
  }
  if (seedMetaEl) {
    if (wasBroadcastPack && state.pack?.lastShareUrl) {
      const pref = state.pack.lastBroadcastPrefix || (broadcastRole === 'blog' ? 'bl_team' : 'pr_team');
      seedMetaEl.textContent = `🚀 Твоя одна общая ссылка (${pref}_1..∞): ${state.pack.lastShareUrl}`;
      seedMetaEl.removeAttribute('hidden');
    } else {
      seedMetaEl.setAttribute('hidden', '');
    }
  }
  if (wasBroadcastPack) {
    const isBlog = broadcastRole === 'blog';
    if (titleEl) {
      titleEl.textContent = isBlog
        ? '🔥 ГОТОВО! ТВОЯ ОБЩАЯ ССЫЛКА ДЛЯ STORIES И КАНАЛА'
        : '🎬 ГОТОВО! ТВОЯ ОДНА ОБЩАЯ ССЫЛКА ДЛЯ ВСЕХ ДРУЗЕЙ';
    }
    if (txt) {
      txt.textContent = isBlog
        ? 'Скопируй эту одну ссылку в Stories, описание и Telegram-канал — каждый подписчик откроет именно твою бочку и получит номер 1..∞!'
        : 'Кидай эту одну ссылку всем друзьям и в любые чаты без повторной упаковки — каждому сервер выдаст личный номер 1..∞!';
    }
    if (btnTxt) {
      btnTxt.textContent = isBlog
        ? `▶️ ИГРАТЬ ДАЛЬШЕ — УРОВЕНЬ ${spec.level} (${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)})`
        : '▶️ ПОИГРАТЬ В ЦЕХ — УРОВЕНЬ 1 (БЕЗ РОЗЫГРЫШЕЙ)';
    }
  } else {
    if (titleEl) titleEl.textContent = 'БОЧКА УЛЕТЕЛА ДРУГУ!';
    if (txt) {
      txt.textContent = packShardRes?.shards > 0
        ? `Ты получил +1 часть билета (${packShardRes.shards}/4)! Пока друг ищет себя в бочке — сыграй с Тилем Швайгером!`
        : 'Пока друг ищет себя в бочке — сыграй 35-секундный раунд с Тилем Швайгером и открой видео-артефакт!';
    }
    if (btnTxt) btnTxt.textContent = '▶ ИГРАТЬ С ТИЛЕМ';
  }
  showScreen('sent');
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
  const $ = (id) => document.getElementById(id);
  const portraitImg = $('finale-portrait-img');
  const stampEl = $('finale-stamp');
  const msgEl = $('finale-message');
  const nextEl = $('finale-next-step');
  const subtag = $('finale-subtag');
  const ring = $('finale-avatar-ring');
  const cinemaBtn = $('btn-cinema-reply');
  const cinemaText = $('btn-cinema-reply-text');
  const packBtn = $('btn-pack-revenge');
  const packText = $('btn-pack-revenge-text');

  $('finale-cinema-feedback-box')?.setAttribute('hidden', '');
  $('finale-ticket-win-box')?.setAttribute('hidden', '');
  document.querySelector('#screen-finale .finale-sheet')?.classList.remove('is-ticket-mode');
  if (cinemaBtn) cinemaBtn.disabled = false;
  if (cinemaText) cinemaText.textContent = t('btnGoCinema');

  const partialNoRescue = Boolean(r.partialBlitzScore);
  const outOfLives = Number(state.profile?.lives ?? 0) <= 0;
  const lost = premiereResult ? !premiereResult.won : (!r.survived || partialNoRescue);
  const completedLvl = Math.max(1, Number(r.workshopLevel || 1));
  const totalPts = Math.max(0, Math.round(Number(state.profile?.premierePoints || 0)));
  const nextLvl = Math.max(2, Number(state.profile?.currentLevel || completedLvl + 1));
  const spec = getWorkshopLevelSpec(nextLvl);

  if (subtag) subtag.textContent = premiereResult ? t('premiereRaceTag') : r.isDemo ? `УРОВЕНЬ ${completedLvl} · ⭐ ${totalPts} / 1 500` : r.senderLabel || t('revealFromFriend');

  // v15.3: На Уровне 3+ ВСЕГДА показываем анимированный 4-сегментный кинобилет вместо фото пацана!
  const shardVisualEl = $('finale-shard-visual');
  const isShardWin = !lost && !premiereResult && completedLvl >= 3;
  if (isShardWin && shardVisualEl) {
    ring?.setAttribute('hidden', '');
    const mergedNow = Boolean(r.lastShardAward?.merged && r.lastShardAward?.granted);
    const displayShards = mergedNow
      ? 4
      : Math.max(0, Math.min(3, Number(r.lastShardAward?.shards || state.profile?.ticketShards || 0)));
    renderFinaleShardVisual({
      shards: displayShards,
      merged: mergedNow,
    });
    const footEl = document.getElementById('finale-shard-footer');
    if (footEl) {
      if (r.lastShardAward?.seedExcluded) {
        footEl.textContent = '🛡 Режим команды посева: призовые билеты сохранены для зрителей!';
      } else if (r.lastShardAward?.capReached) {
        footEl.textContent = '⭐ Дневная партия билетов (6 шт.) разобрана — тебе начислено +500 ⭐ в ТОП-20 Москвы!';
      }
    }
  } else {
    shardVisualEl?.setAttribute('hidden', '');
    ring?.removeAttribute('hidden');
    let avatarSrc = r.portraitDataUrl || './public/sprites/hero_boy_live.webp';
    if (premiereResult) avatarSrc = r.portraitDataUrl || createGoldenTicketPortraitDataUrl('');
    else if (lost) avatarSrc = './public/sprites/horror_barrel_face.webp';
    if (portraitImg) portraitImg.src = avatarSrc;
    ring?.classList.toggle('is-victim', Boolean(lost && !premiereResult));
  }

  if (stampEl) {
    stampEl.classList.toggle('is-failed', lost);
    if (premiereResult) {
      stampEl.textContent = premiereResult.won
        ? t('nightShiftWonTitle')
        : `${t('premiereBarLabel')}: ${Number(state.profile.premiereScore || 0).toFixed(1)} / 100`;
    } else if (partialNoRescue) {
      stampEl.textContent = `⭐ +${r.lastPointsAwarded || 150} ОЧКОВ, НО ПАЦАНА НЕ СПАС!`;
    } else if (lost && outOfLives) {
      stampEl.textContent = '☠️ ЖИЗНИ КОНЧИЛИСЬ — ПАЦАНА НЕ СПАС!';
    } else if (lost) {
      stampEl.textContent = '☠️ БОЧКА ЗАВАРЕНА — ПАЦАНА НЕ НАШЁЛ!';
    } else if (completedLvl === 1) {
      stampEl.textContent = '🎉 ТЫ НАШЁЛ ДРУГА!';
    } else if (r.lastShardAward?.merged && r.lastShardAward?.granted) {
      stampEl.textContent = '🎟 4/4 — БИЛЕТ СКЛЕЕН ДЛЯ ДРУГА!';
    } else if (r.lastShardAward?.capReached) {
      stampEl.textContent = `⭐ ПУЛ НА СЕГОДНЯ РАЗОБРАН (+${r.lastPointsAwarded || 500} ⭐ В ТОП-20)`;
    } else if (r.lastShardAward?.shards > 0) {
      stampEl.textContent = `🎟 ЧАСТЬ БИЛЕТА ${r.lastShardAward.shards}/4 СОБРАНА! (+${r.lastPointsAwarded || 300} ⭐)`;
    } else if (completedLvl >= 4) {
      stampEl.textContent = `🎉 ПАЦАН СПАСЁН! (+${r.lastPointsAwarded || 350} ⭐)`;
    } else {
      stampEl.textContent = `${t('finaleSurvivedTitle', { n: Math.max(1, r.attemptsUsed || 1) })} (+${r.lastPointsAwarded || 150} ⭐)`;
    }
  }

  if (msgEl) {
    if (premiereResult) {
      msgEl.textContent = premiereResult.won ? `ПРОМОКОД ЗАКРЫТОЙ ПРЕМЬЕРЫ: ${premiereResult.premiereCode}` : t('nightShiftEmptyMsg');
    } else if (partialNoRescue) {
      msgEl.textContent = '«Очки на супер-приз начислены, но время вышло — пацан остался запертым в бочке!»';
    } else if (lost && outOfLives) {
      msgEl.textContent = '«Жизни на нуле, крышка захлопнулась... Верни жизни и попробуй вытащить его снова!»';
    } else if (lost) {
      msgEl.textContent = '«Он остался в темноте цеха. Слушай стук внимательнее и попробуй ещё раз!»';
    } else if (completedLvl === 1) {
      msgEl.textContent = r.message || '«Идём со мной в кино 17 декабря?»';
    } else if (isShardWin) {
      const shN = Number(r.lastShardAward?.shards || state.profile?.ticketShards || 0);
      if (r.lastShardAward?.merged && r.lastShardAward?.granted) {
        msgEl.textContent =
          '«Все 4 части билета собраны и склеены! Отправь целый бесплатный билет другу в Telegram — и пойдёте в кино вместе!»';
      } else if (r.lastShardAward?.seedExcluded) {
        msgEl.textContent =
          '«Режим команды посева: ты прошёл уровень, а призовые билеты сохранены для реальных зрителей!»';
      } else if (r.lastShardAward?.capReached) {
        msgEl.textContent =
          '«Лимит билетов на сегодня (6 шт.) разобран — держи +500 ⭐ в гонку ТОП-20 за Закрытый показ в Москве 17 декабря!»';
      } else {
        msgEl.textContent = `«Ты выбил кусок кинобилета (${Math.max(1, shN)} из 4)! Собери ещё ${Math.max(1, 4 - Math.max(1, shN))} — они склеятся в целый бесплатный билет другу (без чеков)!»`;
      }
    } else if (completedLvl >= 4) {
      msgEl.textContent = `«${r.message || 'Спасибо, что вытащил меня из бочки! Встретимся на премьере 17 декабря!'}»`;
    } else {
      msgEl.textContent = `«${r.isDemo ? pickNextBarrelHeavenQuote() : r.message || pickNextBarrelHeavenQuote()}»`;
    }
  }

  // v9.1: Кнопка повторного прослушивания голоса — ТОЛЬКО если реально спас (не при 0 жизней и не при проигрыше!)
  const replayBtn = $('btn-finale-replay-voice');
  if (replayBtn) {
    if (!lost && r.voiceUrl) replayBtn.removeAttribute('hidden');
    else replayBtn.setAttribute('hidden', '');
  }

  // v9.1: Кнопка шаринга ранга в соцсетях — ТОЛЬКО при реальном спасении на уровнях 3+
  const shareResBtn = $('btn-finale-share-result');
  if (shareResBtn) {
    if (!lost && completedLvl >= 3) {
      const rankTitle = computePlayerRankTitle();
      const tCnt = Math.max(0, Number(state.profile.pendingTicketsCount || 0));
      shareResBtn.textContent = tCnt > 0
        ? `🏆 ПОДЕЛИТЬСЯ В СОЦСЕТЯХ (${rankTitle} · ${tCnt} 🎟 ДРУЗЬЯМ)`
        : `🏆 ПОДЕЛИТЬСЯ В СОЦСЕТЯХ (${rankTitle})`;
      shareResBtn.removeAttribute('hidden');
    } else {
      shareResBtn.setAttribute('hidden', '');
    }
  }

  const tkBadge = $('finale-ticket-badge');
  if (tkBadge) {
    const tCnt = Math.max(1, Number(state.profile.pendingTicketsCount || 1));
    tkBadge.textContent = tCnt > 1
      ? `🎟 НАКОПЛЕНО ${tCnt} БИЛЕТОВ В КИНО ДЛЯ ДРУЗЕЙ (+${tCnt * 3} ❤️)`
      : '🎟 БИЛЕТ В КИНО НА «БОЧКУ» ДЛЯ ДРУГА (+3 ❤️)';
  }
  syncPendingTicketsFloatingUI();

  if (!premiereResult && state.uiStage < 2) {
    syncUiStage(state.tg?.user, 2).catch(() => {});
    applyProgressiveDisclosureUI({ forceStage: 2 });
  }

  // v9.1 Чистая маршрутизация (не больше 2 кнопок! При ❤️ 0 — восстановление жизней, НЕ фальшивая победа!)
  if (premiereResult) {
    state.finaleMode = 'premiere';
    if (nextEl) nextEl.textContent = 'Копи очки и жизни — впереди розыгрыш билетов на закрытую премьеру 17 декабря.';
    if (packText) packText.textContent = '⚔️ ОТКРЫТЬ ДУЭЛИ ЗА ПРЕМЬЕРУ';
    cinemaBtn?.setAttribute('hidden', '');
  } else if (lost && outOfLives) {
    state.finaleMode = 'recover_lives';
    if (nextEl) nextEl.textContent = `У тебя 0 ❤️. Верни +3 жизни за 5 секунд и спаси пацана на Уровне ${completedLvl}!`;
    if (packText) packText.textContent = '❤️ ВЕРНУТЬ +3 ЖИЗНИ И ПРОДОЛЖИТЬ';
    cinemaBtn?.setAttribute('hidden', '');
  } else if (lost) {
    state.finaleMode = 'retry';
    if (nextEl) nextEl.textContent = partialNoRescue
      ? `Очки зачислены (всего ⭐ ${totalPts}), но пацан остался в бочке — попробуй вытащить его на Уровне ${completedLvl}!`
      : 'Слушай стук удержанием пальца на бочке, чтобы не попасть на обманку!';
    if (packText) packText.textContent = `🔄 ПОПРОБОВАТЬ СНОВА (УРОВЕНЬ ${completedLvl})`;
    cinemaBtn?.setAttribute('hidden', '');
  } else if (completedLvl === 1) {
    state.finaleMode = 'l1_reply_yes';
    if (nextEl) nextEl.textContent = 'Отправь другу: «Я тебя нашёл!» и разреши уведомления от бота — чтобы получать ответы друзей, вызовы в Дуэли и бесплатные билеты в кино!';
    if (packText) packText.textContent = '🍿 ОТПРАВИТЬ ДРУГУ И РАЗРЕШИТЬ ПУШИ → РАУНД 2';
    cinemaBtn?.setAttribute('hidden', '');
  } else if (r.lastShardAward?.merged && r.lastShardAward?.granted && Number(state.profile.pendingTicketsCount || 0) > 0) {
    state.finaleMode = 'next';
    document.querySelector('#screen-finale .finale-sheet')?.classList.add('is-ticket-mode');
    if (nextEl) nextEl.textContent = '🎟 4/4 склеены в целый бесплатный билет! Использовать самому нельзя — подари другу в Telegram, а себе возьми соседнее кресло рядом!';
    if (packText) packText.textContent = completedLvl >= 5 ? '⚔️ В ДУЭЛЬ ЗА СЛЕДУЮЩИЙ БИЛЕТ!' : `▶ ИГРАТЬ ДАЛЬШЕ (УР. ${spec.level})`;
    cinemaBtn?.setAttribute('hidden', '');
    await populateLevel3TicketFriendsBox();
  } else if (completedLvl === 3 || completedLvl === 4) {
    state.finaleMode = 'next';
    document.querySelector('#screen-finale .finale-sheet')?.classList.remove('is-ticket-mode');
    document.getElementById('finale-ticket-win-box')?.setAttribute('hidden', '');
    const curSh = Math.max(0, Math.min(3, Number(state.profile?.ticketShards || 0)));
    if (r.lastShardAward?.capReached) {
      if (nextEl) nextEl.textContent = `⭐ Партия билетов на сегодня (6 шт.) разобрана — новая откроется в 00:00 МСК! За 4-й кусок тебе зачислено +500 ⭐ в ТОП-20 Закрытого показа в Москве!`;
    } else {
      if (nextEl) nextEl.textContent = `🎟 Собрано ${curSh}/4 частей билета (${curSh * 25}%)! ${curSh < 4 ? `Осталось ${4 - curSh} кус. до целого бесплатного билета другу (или позови друга в бочку для бонусной части)!` : ''}`;
    }
    if (packText) packText.textContent = `🔥 ИГРАТЬ УРОВЕНЬ ${spec.level} (${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)} · СЛЕДУЮЩАЯ ЧАСТЬ БИЛЕТА!)`;
    cinemaBtn?.setAttribute('hidden', '');
  } else if (totalPts >= 1500 && completedLvl >= 5) {
    state.finaleMode = 'duels_unlocked';
    const ratingPct = computeSuperPrizeRatingPct(state.profile);
    if (ratingPct >= 100) {
      if (nextEl) nextEl.textContent = `🏆 Шкала 100% и ⭐ ${totalPts}! Ты в финале Закрытого показа 17 декабря!`;
      if (packText) packText.textContent = '🏆 В ФИНАЛ ЗА ЗАКРЫТЫЙ ПОКАЗ!';
    } else {
      if (nextEl) nextEl.textContent = `У тебя ⭐ ${totalPts}, шкала Закрытого показа ${ratingPct}%/100%. Заходи в Дуэль — борись за 🎟 билеты в кино и добивай шкалу!`;
      if (packText) packText.textContent = '⚔️ В ДУЭЛЬ ЗА БИЛЕТЫ В КИНО! (6 ❤️)';
    }
    cinemaBtn?.setAttribute('hidden', '');
  } else {
    state.finaleMode = 'next';
    const rem = Math.max(0, 1500 - totalPts);
    if (nextEl) nextEl.textContent = rem > 0
      ? `Очков на супер-приз: ⭐ ${totalPts} / 1 500 — продолжай спасать героев на следующем уровне!`
      : `Очков на супер-приз: ⭐ ${totalPts} — продолжай уровни и копи билеты для друзей!`;
    if (packText) packText.textContent = `🔥 ИГРАТЬ УРОВЕНЬ ${spec.level} (${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)} · +${spec.pointsReward || 350} ⭐)`;
    cinemaBtn?.setAttribute('hidden', '');
  }
  packBtn?.classList.toggle('btn-temu-pulse', state.finaleMode === 'duels_unlocked' || state.finaleMode === 'l1_reply_yes' || state.finaleMode === 'recover_lives');

  await refreshQuestUI();
}

async function populateLevel3TicketFriendsBox() {
  const box = document.getElementById('finale-ticket-win-box');
  const listEl = document.getElementById('ticket-friends-list');
  if (!box || !listEl) return;
  box.removeAttribute('hidden');
  listEl.innerHTML = '<div class="mono-tag">Загружаем друзей, которым ты уже отправлял игру…</div>';

  const friends = await fetchMyGameFriends(state.tg?.user).catch(() => []);
  if (!friends.length) {
    listEl.innerHTML = '<div class="mono-tag" style="opacity:.75;">Пока никто из друзей не открыл твою бочку — отправь билет новому другу кнопкой ниже!</div>';
    return;
  }

  listEl.innerHTML = '';
  friends.slice(0, 6).forEach((fr) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'ticket-friend-row';
    const label = document.createElement('span');
    label.textContent = `👤 ${fr.receiver_name || 'Друг'}${fr.receiver_username ? ' @' + fr.receiver_username : ''}`;
    const cta = document.createElement('strong');
    cta.textContent = '🎟 ОТПРАВИТЬ В ЛС';
    row.append(label, cta);
    row.addEventListener('click', async () => {
      row.disabled = true;
      cta.textContent = 'ОТПРАВКА…';
      const pass = await createGiftTicketPass({
        tgUser: state.tg?.user,
        senderName: state.tg?.user?.name || 'Друг',
        recipientName: fr.receiver_name || 'Друг',
      });
      if (pass?.ok) {
        await sendDirectGiftTicketToFriend({ tgUser: state.tg?.user, friend: fr, giftId: pass.giftId });
        consumePendingCinemaTicketAndReward();
        cta.textContent = '✓ ОТПРАВЛЕНО (+3 ❤️)!';
        showToast(`🎟 Билет улетел ${fr.receiver_name || 'другу'}! Тебе начислено +3 ❤️ и +500 ⭐!`);
        Haptics.success();
      } else {
        row.disabled = false;
        cta.textContent = '🎟 ОТПРАВИТЬ В ЛС';
      }
    });
    listEl.appendChild(row);
  });
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
  mergeFreshProfile(freshProfile);
  const temuOpen = !document.getElementById('modal-temu-unlock')?.hasAttribute('hidden');
  applyProgressiveDisclosureUI({ skipPromoteFromSocial: temuOpen });
  updatePremiereBarsUI();

  const friendsOpenedNow = Math.max(0, Number(synced.friendsOpened || 0));
  const prevFriendsShardCount = Math.max(0, Number(state.profile?.friendsShardAwardedCount || 0));
  if (friendsOpenedNow > prevFriendsShardCount && !state.profile?.isSeedAdmin && !state.profile?.isBloggerSeed) {
    state.profile.friendsShardAwardedCount = friendsOpenedNow;
    saveLocalV9Flags();
    awardTicketShard('friend_opened', { silent: false }).catch(() => {});
  }

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
  if (!ticketCode) {
    return './public/sprites/cinema_ticket_barrel.webp';
  }
  return './public/sprites/cinema_ticket_barrel.webp';
}

function _legacyGoldenTicketCanvasFallback(ticketCode = '') {
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
    if (state.trailer.modalOpen && !state.trailer.usingYtFallback) {
      activateYouTubePrimary({ forRescue: state.trailer.forRescue });
    }
  });

  // Тап по видео: если видео играет без звука — сразу включаем звук, иначе пауза/пуск
  vid.addEventListener('click', () => {
    if (state.trailer.usingYtFallback) return;
    if (vid.muted) {
      setTrailerMuted(false);
      if (vid.paused) vid.play().catch(() => {});
      return;
    }
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
    syncTrailerPlayButton();
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

  // v16.1: Официальный трейлер в VK Видео (работает в РФ, Беларуси и Казахстане без VPN!)
  audio.stopOceanEasterEggAudio();
  state.trailer.usingYtFallback = false;
  const vid = document.getElementById('trailer-video');
  const slot = document.getElementById('yt-fallback-slot');
  const customBar = document.getElementById('trailer-custom-bar');
  if (vid) {
    try { vid.pause(); } catch { /* ignore */ }
    vid.setAttribute('hidden', '');
  }
  if (customBar) {
    customBar.removeAttribute('hidden');
    document.getElementById('btn-trailer-play')?.setAttribute('hidden', '');
    document.getElementById('btn-trailer-mute')?.setAttribute('hidden', '');
    customBar.querySelector('.trailer-progress-track')?.setAttribute('hidden', '');
    document.getElementById('trailer-time-readout')?.setAttribute('hidden', '');
    document.getElementById('btn-trailer-open-yt-app')?.removeAttribute('hidden');
  }
  if (slot) {
    slot.removeAttribute('hidden');
    slot.textContent = '';
    const ifr = document.createElement('iframe');
    ifr.id = 'vk-trailer-iframe';
    ifr.className = 'vk-trailer-iframe';
    ifr.src = ENV.vkTrailerEmbedUrl;
    ifr.title = 'БОЧКА — официальный трейлер (VK Видео)';
    ifr.referrerPolicy = 'strict-origin-when-cross-origin';
    ifr.setAttribute('frameborder', '0');
    ifr.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;');
    ifr.setAttribute('allowfullscreen', '');
    slot.appendChild(ifr);
  }

  if (forRescue) {
    let sec = 0;
    state.trailer.vkTimer = window.setInterval(() => {
      if (!state.trailer.modalOpen || document.hidden) return;
      sec += 1;
      updateTrailerRescueBanner(sec, TRAILER_UNLOCK_SEC);
      if (sec >= TRAILER_UNLOCK_SEC && !state.trailer.unlocked40) {
        state.trailer.unlocked40 = true;
        unlockTrailerRescueReward();
      }
    }, 1000);
  }
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

  if (state.trailer.vkTimer) {
    clearInterval(state.trailer.vkTimer);
    state.trailer.vkTimer = null;
  }
  const slot = document.getElementById('yt-fallback-slot');
  if (slot) {
    slot.textContent = '';
  }
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
  if ((state.activeScreen === 'til16' || state.activeScreen === 'ocean') && audio.enabled && !audio._userMuted) {
    audio.startOceanEasterEggAudio();
  }
  syncTrailerPlayButton();

  if (state.trailer.forRescue && !state.trailer.unlocked40 && state.activeScreen === 'workshop' && !state.round.running) {
    const isL1PreTrailer = state.round.modeType === 'viral' && Number(state.round.rescueStage || 0) < 4;
    if (isL1PreTrailer) {
      // На Ур.1 возвращаем в пустой цех с горящей кнопкой «Смотреть трейлер»
      enterWorkshopTrailerPrompt();
      return;
    }
    const availLives = Number(state.profile?.lives || 0);
    if (availLives > 0 && getUnstruckBarrelIndices().length > 0) {
      state.round.running = true;
      state.round.pausedForModal = false;
      state.round.attemptsLeft = Math.max(1, state.round.attemptsLeft || 3);
      state.round.airLeft = Math.max(20.0, state.round.airLeft || 20.0);
      renderAttemptSquares(state.round.attemptsLeft, state.round.isBlitz ? 5 : 3);
      updateAirHUD(state.round.airLeft);
      scene.setInteractive(true);
      startAirCountdownLoop();
    } else {
      openLivesRecoveryModal({ forLevel: state.round.workshopLevel || 2 });
    }
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
  if (!state.trailer.usingYtFallback) {
    const vid = document.getElementById('trailer-video');
    playing = Boolean(vid && !vid.paused && !vid.ended);
  } else if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function') {
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
        // Мобильный WebView заблокировал автостарт со звуком — мгновенно запускаем YouTube в mute, чтобы картинка пошла сама!
        state.trailer.muted = true;
        player.mute?.();
        player.playVideo?.();
        syncTrailerMuteButton();
        syncTrailerPlayButton();
        showToast('🔇 Трейлер запущен — нажми «ВКЛ ЗВУК» на плеере!');
      }
    } catch { /* ignore */ }
  }, 450);
}

function startYtPlaybackNow(player, { forRescue = false } = {}) {
  if (!player || !state.trailer.modalOpen) return;
  try {
    const loadedId = player.getVideoData?.()?.video_id || '';
    if (state.trailer.muted) {
      player.mute?.();
    } else {
      player.unMute?.();
      player.setVolume?.(100);
    }
    if (loadedId && loadedId !== OFFICIAL_YT_TRAILER_ID && typeof player.loadVideoById === 'function') {
      player.loadVideoById(OFFICIAL_YT_TRAILER_ID, 0);
    } else {
      if (forRescue) player.seekTo?.(0, true);
      player.playVideo?.();
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
      if (state.trailer.modalOpen) ensureYtPlayerMounted();
    };
    ensureYouTubeScriptTag();
    return;
  }

  state.ytPlayer = new window.YT.Player('yt-fallback-slot', {
    videoId: OFFICIAL_YT_TRAILER_ID,
    playerVars: {
      autoplay: 1,
      mute: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      enablejsapi: 1,
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
        if (ev.data === 1) {
          state.trailer.ytStartedPlaying = true;
          try {
            state.trailer.muted = Boolean(ev.target?.isMuted?.());
            syncTrailerMuteButton();
          } catch { /* ignore */ }
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
  // Подгружаем только лёгкий скрипт API YouTube; сам iframe монтируется при открытии видимой модалки (для 100% автоплея на мобильных!)
  ensureYouTubeScriptTag();
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

async function openDuelTable(roomId = '', { autoAddTestBots = false, initialMode = 'classic', prefetchedHof = null } = {}) {
  state.entered = true;
  requestAndSyncWriteAccess();
  stopAirTimer();
  state.round.running = false;
  state.round.pausedForModal = false;
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.setAttribute('hidden', ''));
  closeBurgerDrawer();
  syncUiStage(state.tg?.user, 4).catch(() => {});
  applyProgressiveDisclosureUI({ forceStage: 4 });

  await Promise.all([audio.unlock(audio.enabled !== false), ensureDuelReady()]);
  refreshSoundButtonLabel();

  const cleanRoom = roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  await duelCtrl?.openRoom(cleanRoom, { autoAddTestBots, initialMode, prefetchedHof });
  showScreen('duel');
}

/**
 * v15.2: Автоматический пуш через бота ВСЕМ друзьям, кто играл в «БОЧКУ»,
 * чтобы они залетели прямо в эту дуэль (БЕЗ открытия ручного окна «Кому отправить»!).
 */
async function pushDuelToFriends() {
  const roomId = duelCtrl?.roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  const count = duelCtrl?.players?.length || 1;
  const need = Math.max(1, 3 - count);
  const btn = document.getElementById('btn-duel-invite-third');

  if (btn?.dataset?.pushCooldown === '1') {
    showToast('⏳ Пуш уже отправлен друзьям — ждём их за столом!');
    return;
  }

  const prevLabel = btn?.textContent || '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '📡 РАССЫЛАЕМ ПУШ ДРУЗЬЯМ В БОЧКЕ...';
  }

  let sentCount = 0;
  let throttledCount = 0;
  let totalCandidates = 0;

  try {
    const pushRes = await sendDuelBroadcastPushToFriends({
      roomId,
      challengerName: state.tg?.user?.name || 'Друг из цеха',
      needCount: need,
    });
    sentCount = Number(pushRes?.sentCount || 0);
    throttledCount = Number(pushRes?.throttledCount || 0);
    totalCandidates = Number(pushRes?.totalCandidates || 0);
  } catch { /* ignore */ }

  // Фоллбэк для веба/не-TG клиентов: шлём по соцграфу индивидуально
  if (sentCount === 0 && totalCandidates === 0 && !state.tg?.inTelegram) {
    try {
      const [gameFriends, wsFriends] = await Promise.all([
        fetchMyGameFriends(state.tg?.user).catch(() => []),
        fetchMyWorkshopFriends(state.tg?.user).catch(() => []),
      ]);
      const myTgId = String(state.tg?.user?.id || '');
      const uniqueTargets = new Set();
      for (const f of [...(gameFriends || []), ...(wsFriends || [])]) {
        const tid = String(f?.receiver_tg_id || f?.tg_id || f?.friend_tg_id || '').trim();
        if (tid && tid !== myTgId) uniqueTargets.add(tid);
      }
      if (uniqueTargets.size > 0) {
        await Promise.allSettled(
          Array.from(uniqueTargets).map((targetTgId) =>
            sendDuelChallengePush({
              targetTgId,
              challengerName: state.tg?.user?.name || 'Друг из цеха',
              roomId,
            })
          )
        );
        sentCount = uniqueTargets.size;
        totalCandidates = uniqueTargets.size;
      }
    } catch { /* ignore */ }
  }

  if (btn) btn.disabled = false;

  if (sentCount > 0) {
    Haptics.success();
    showToast(`📣 Пуш-вызов отправлен ${sentCount} друзьям через @bochka_film_bot! Они зайдут прямо за твой стол!`);
    if (btn) {
      btn.dataset.pushCooldown = '1';
      btn.textContent = `✅ ПУШ ОТПРАВЛЕН (${sentCount}) · ЖДЁМ ДРУЗЕЙ`;
      window.setTimeout(() => {
        if (!btn) return;
        delete btn.dataset.pushCooldown;
        btn.textContent = prevLabel || `📣 ПУШ ВСЕМ ДРУЗЬЯМ В БОЧКЕ (НУЖНО ЕЩЁ ${need})`;
      }, 15000);
    }
    return;
  }

  if (btn) btn.textContent = prevLabel || `📣 ПУШ ВСЕМ ДРУЗЬЯМ В БОЧКЕ (НУЖНО ЕЩЁ ${need})`;

  if (throttledCount > 0) {
    showToast('⏳ Пуш этим друзьям уже ушёл минуту назад — ждём их за столом или нажми «Скинуть ссылку» ниже!');
    return;
  }

  showToast('ℹ️ Пока никто из твоих друзей не запускал бота — нажми «🔗 Скинуть ссылку на стол» ниже!');
}

async function shareCurrentDuelRoom() {
  const roomId = duelCtrl?.roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  const links = buildDuelShareLinks(roomId);
  const count = duelCtrl?.players?.length || 1;
  const text =
    count >= 2
      ? '⚔️ Нас уже двое за столом «БОЧКИ»! Залетай 3-м на счёт три — цех досыплет +450 ⭐ очков ТОП-20 и шанс билета!'
      : '⚔️ Залетай за стол «НА СЧЁТ ТРИ!» в цеху «БОЧКИ»! Хватаем живые бочки синхронно за билет в кино:';

  if (state.tg?.inTelegram) {
    const prep = await prepareNativeShareMessage({
      tgUser: state.tg?.user,
      barrelId: roomId,
      linkType: 'duel',
      senderName: state.tg?.user?.name || 'Друг из цеха',
      phrase: 'Залетай за стол дуэли в цеху «БОЧКИ»!',
      shareUrl: links.tgMiniAppUrl,
    }).catch(() => ({ ok: false, fallback: true, preparedMessageId: '' }));
    openNativeTelegramShareCard({
      preparedMessageId: prep?.preparedMessageId || '',
      shareUrl: links.tgMiniAppUrl,
      shareText: text,
    });
    return;
  }
  const res = await shareNativeOrFallback({
    title: 'БОЧКА — Стол «На счёт три!»',
    text,
    url: links.tgMiniAppUrl || links.webUrl,
  });
  if (res === 'copied') {
    showToast('🔗 Ссылка на стол дуэли скопирована — скинь другу в Telegram!');
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

  await ensureSceneReady();
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

  state.watchChannel = await createWatchChannelLazy(barrelId, {
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
  document.getElementById('btn-burger-play-til')?.addEventListener('click', () => {
    audio.unlockSync(true);
    closeBurgerDrawer();
    openTilThreePhaseGame();
  });
  document.getElementById('btn-burger-about-film')?.addEventListener('click', () => {
    closeBurgerDrawer();
    openAboutFilmModal({
      onWatchTrailer: () => openTrailerModal({ forRescue: false }),
      onOpenKinopoisk: () => {
        markKinopoiskVisited();
        recordFunnelEvent('kp_clicks', state.tg?.user).catch(() => {});
        openExternalLink(ENV.kinopoiskUrl);
      },
      onShareFriends: () => showScreen('pack'),
    });
  });
  const handleSoundToggle = async () => {
    await audio.toggleSound();
    if (audio.enabled && state.round.running && state.round.voiceUrl) {
      audio.startMuffledVoiceLoop();
    }
    refreshSoundButtonLabel();
  };
  document.getElementById('btn-burger-sound')?.addEventListener('click', handleSoundToggle);
  document.getElementById('btn-sound-corner')?.addEventListener('click', handleSoundToggle);

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

  // Экран 1: Входной шлюз (синхронная разблокировка звука ПЕРВОЙ строкой в click/pointerdown!)
  const enterSoundBtn = document.getElementById('btn-enter-sound');
  enterSoundBtn?.addEventListener('pointerdown', () => {
    audio.unlockSync(true);
    refreshSoundButtonLabel();
  }, { passive: true });
  enterSoundBtn?.addEventListener('click', () => {
    audio.unlockSync(true);
    refreshSoundButtonLabel();
    enterWorkshopGate(true);
  });

  const gatePackFriendBtn = document.getElementById('btn-gate-pack-friend');
  gatePackFriendBtn?.addEventListener('pointerdown', () => {
    audio.unlockSync(true);
    refreshSoundButtonLabel();
  }, { passive: true });
  gatePackFriendBtn?.addEventListener('click', () => {
    audio.unlockSync(true);
    refreshSoundButtonLabel();
    enterWorkshopGate(true, { startTarget: 'pack' });
  });

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
    if (res.profile) mergeFreshProfile(res.profile, { preserveProgress: false });
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

  document.querySelectorAll('[data-life-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleLifeRecoveryAction(btn.getAttribute('data-life-action') || 'kp'));
  });
  document.getElementById('btn-lives-recovery-close')?.addEventListener('click', () => {
    document.getElementById('modal-lives-recovery')?.setAttribute('hidden', '');
    state.round.running = false;
    showScreen('modeA');
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
  document.getElementById('btn-ocean-tap-barrel')?.addEventListener('click', () => {
    if (performance.now() - (state.oceanTapper.lastTapAt || 0) >= 80) {
      handleOceanBarrelTap();
    }
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
      title: 'Виртуальный билет в кино — БОЧКА (17 декабря)',
      text: `🎟 Дарю тебе виртуальный билет в кино на триллер «БОЧКА» (17 декабря)! Забери свой билет по ссылке:`,
      url: state.giftPass.lastPassUrl,
    });
    if (res === 'copied') showToast(t('copiedToast'));
  });
  document.getElementById('btn-share-gift-tg')?.addEventListener('click', () => {
    if (!state.giftPass.lastPassUrl) return;
    openTelegramShare(
      state.giftPass.lastPassUrl,
      `🎟 Дарю тебе виртуальный билет в кино на триллер «БОЧКА» (17 декабря)! Забери свой билет по ссылке:`
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

  // 5-ходовая модалка Спасения и кнопка трейлера в пустом цеху Ур.1
  document.getElementById('btn-workshop-watch-trailer')?.addEventListener('click', () => {
    Haptics.medium();
    openRescueTrailerDirectly();
  });
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
    if (!state.trailer.usingYtFallback) {
      const vid = document.getElementById('trailer-video');
      if (vid) {
        if (vid.paused || vid.ended) {
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
        syncTrailerPlayButton();
      }
      return;
    }
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
    openExternalLink(ENV.vkTrailerUrl || OFFICIAL_YT_WATCH_URL);
  });

  document.getElementById('btn-claim-trailer-life')?.addEventListener('click', () => claimTrailerFifthLife());

  document.getElementById('btn-open-kp-trailer')?.addEventListener('click', () => {
    pauseActiveTrailerPlayback();
    openExternalLink(ENV.kinopoiskTrailerUrl);
  });

  // Экран 4: Простая упаковка друга (крестик -> 1-клик auto_avatar или назад)
  document.getElementById('btn-close-pack')?.addEventListener('click', () => {
    if (voiceRecorder?.isRecording) voiceRecorder.stop();
    if (isProducerPackFirstRequired()) {
      showDuolingoCard({
        icon: '🎬',
        title: 'Сначала запакуй общую бочку команды',
        body: 'После отправки сразу откроется твоя общая ссылка pr_... и игра.',
        buttonText: 'ПОНЯТНО',
      });
      return;
    }
    if (!state.pack.userUploadedPhoto && getTeamSeedRole() !== 'blog') {
      showDuolingoCard({
        icon: '⚡',
        title: 'Отправить без выбора фото?',
        body: 'Бочка сразу улетит другу в Telegram — когда он откроет её, игра автоматически подставит его аватарку из Telegram!',
        buttonText: '⚡ ОТПРАВИТЬ В 1 КЛИК',
        secondaryText: 'Вернуться на главный экран',
        tone: 'gold',
        onConfirm: () => {
          handleQuick1TapPrankClick();
        },
        onSecondary: () => {
          refreshInitialSeedGateUI();
          showScreen('gate');
        },
      });
      return;
    }
    refreshInitialSeedGateUI();
    showScreen('gate');
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
    state.pack.useBarrelFilter = true;
    const chk = document.getElementById('chk-voice-barrel-filter');
    if (chk) chk.checked = true;
    document.getElementById('btn-play-voice-muffled')?.classList.add('is-active');
    document.getElementById('btn-play-voice-clean')?.classList.remove('is-active');
    if (state.pack.voice?.objectUrl) {
      audio.playOneShotMuffledPreview(state.pack.voice.objectUrl);
    }
    showToast('🛢 Включён эффект железной бочки (друг услышит гулкое эхо)');
  });

  document.getElementById('btn-play-voice-clean')?.addEventListener('click', () => {
    state.pack.useBarrelFilter = false;
    const chk = document.getElementById('chk-voice-barrel-filter');
    if (chk) chk.checked = false;
    document.getElementById('btn-play-voice-clean')?.classList.add('is-active');
    document.getElementById('btn-play-voice-muffled')?.classList.remove('is-active');
    if (state.pack.voice?.objectUrl) {
      audio.playCleanSenderVoice(state.pack.voice.objectUrl, {
        useBarrelFilter: false,
      });
    }
    showToast('🎤 Оригинальный голос без эффекта бочки');
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
      state.pack.userUploadedPhoto = true;
      await rebuildPackPortraitPreview(file);
      const noteEl = document.getElementById('pack-photo-note');
      if (noteEl) noteEl.textContent = '✓ Фото друга загружено! Жми «Отправить другу» — звук бочки выберется случайно.';
      Haptics.light();
    }
  });

  document.getElementById('btn-open-camera')?.addEventListener('click', () => openSelfieCamera());
  document.getElementById('btn-close-camera')?.addEventListener('click', () => closeSelfieCamera());
  document.getElementById('btn-cancel-camera')?.addEventListener('click', () => closeSelfieCamera());
  document.getElementById('btn-snap-photo')?.addEventListener('click', () => captureSelfieFrame());

  const PACK_VIRAL_TEMPLATES = [
    { title: 'Крик из темноты (Пленница)', src: './public/sprites/horror_hero_captive_f2.webp', frame: 'flashlight', screamer: 'basement_shriek', caption: 'Я В БОЧКЕ! ВЫПУСТИ МЕНЯ!' },
    { title: 'Безумный взгляд Пастора', src: './public/sprites/horror_hero_warden_f2.webp', frame: 'stencil', screamer: 'lid_blast', caption: 'СЛУШАЙ СТУК, БРАТ... ТЫ СЛЕДУЮЩИЙ!' },
    { title: 'Маньяк с фонариком', src: './public/sprites/horror_hero_mechanic_f2.webp', frame: 'weld', screamer: 'saw_scream', caption: 'НЕ ОБОРАЧИВАЙСЯ В ЦЕХУ!' },
    { title: 'Лицо на дне бочки', src: './public/sprites/horror_barrel_face_f2.webp', frame: 'rec', screamer: 'basement_shriek', caption: 'КТО ТАМ СТУЧИТ ИЗНУТРИ?!' },
    { title: 'Когти из крышки', src: './public/sprites/horror_claw_hands.webp', frame: 'flashlight', screamer: 'lid_blast', caption: 'НЕ ОТКРЫВАЙ ЭТУ КРЫШКУ!' },
    { title: 'Ночная камера CCTV №4', src: './public/sprites/horror_cctv_face.webp', frame: 'rec', screamer: 'tesla_siren', caption: 'НОЧНАЯ СМЕНА · ОНО ЗА ТОБОЙ!' },
    { title: 'Сварщик в противогазе', src: './public/sprites/horror_gasmask_weld.webp', frame: 'weld', screamer: 'tesla_siren', caption: 'ЗАВАРИЛ ТЕБЯ НАГЛУХО!' },
  ];
  let memeTemplateCursor = 0;
  document.getElementById('btn-pack-meme-template')?.addEventListener('click', async () => {
    const tpl = PACK_VIRAL_TEMPLATES[memeTemplateCursor % PACK_VIRAL_TEMPLATES.length];
    memeTemplateCursor += 1;

    state.pack.frameStyle = tpl.frame;
    state.pack.screamerType = tpl.screamer;
    document.querySelectorAll('[data-frame]').forEach((c) => {
      c.classList.toggle('is-active', c.getAttribute('data-frame') === tpl.frame);
    });
    document.querySelectorAll('[data-pack-screamer]').forEach((c) => {
      c.classList.toggle('is-active', c.getAttribute('data-pack-screamer') === tpl.screamer);
    });
    const phraseInput = document.getElementById('input-custom-phrase');
    if (phraseInput) {
      phraseInput.value = tpl.caption;
      const counter = document.getElementById('phrase-counter');
      if (counter) counter.textContent = `${tpl.caption.length}/45`;
    }

    await rebuildPackPortraitPreview(tpl.src);
    showToast(`🎬 Шаблон «${tpl.title}» + крик и подпись готовы!`);
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

  document.querySelectorAll('[data-preview-screamer]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const key = btn.getAttribute('data-preview-screamer') || 'saw_scream';
      await audio.playScreamerPreview(key);
      Haptics.heavy();
    });
  });

  document.querySelectorAll('[data-pack-screamer]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      document.querySelectorAll('[data-pack-screamer]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const nextScreamer = chip.getAttribute('data-pack-screamer') || 'saw_scream';
      state.pack.screamerType = nextScreamer;
      state.round.screamerType = nextScreamer;
      document.getElementById('voice-pack-box')?.toggleAttribute('hidden', nextScreamer !== 'custom_scream');
      if (nextScreamer !== 'custom_scream') {
        await audio.playScreamerPreview(nextScreamer);
      }
      Haptics.light();
    });
  });

  document.querySelectorAll('[data-caption]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-caption]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const text = chip.getAttribute('data-caption') || '';
      const inp = document.getElementById('input-custom-phrase');
      const cnt = document.getElementById('phrase-counter');
      if (inp) inp.value = text.slice(0, 45);
      if (cnt) cnt.textContent = `${(inp?.value || '').length}/45`;
      state.pack.customEdited = true;
      Haptics.light();
    });
  });

  document.getElementById('btn-ticket-send-new')?.addEventListener('click', () => {
    Haptics.medium();
    openGoldenTicketForkModal();
  });

  document.getElementById('top-rating-pill')?.addEventListener('click', () => {
    Haptics.light();
    openLeaderboardModal();
  });

  // v15.0: Золотые баннеры Суперприза (Закрытый показ в Москве 17 декабря) и корешок 4/4 частей билета
  const openPremiereSuperPrizeModal = () => {
    Haptics.light();
    closeBurgerDrawer();
    updatePremiereBarsUI();
    document.getElementById('modal-prize')?.removeAttribute('hidden');
  };
  for (const id of ['gate-premiere-banner', 'mode-a-premiere-banner', 'btn-burger-premiere-banner']) {
    document.getElementById(id)?.addEventListener('click', openPremiereSuperPrizeModal);
  }
  const onTicketShardsClick = () => {
    Haptics.light();
    const pending = Math.max(0, Number(state.profile?.pendingTicketsCount || 0));
    if (pending > 0) {
      openGoldenTicketForkModal();
    } else {
      const sh = Math.max(0, Math.min(3, Number(state.profile?.ticketShards || 0)));
      showToast(`🎟 Собрано ${sh}/4 частей билета (${sh * 25}%)! Ур.2 (бочка другу) → Ур.3 → Ур.4 или друг → Ур.5/Дуэль = целый бесплатный билет другу!`);
    }
  };
  document.getElementById('top-ticket-shards')?.addEventListener('click', onTicketShardsClick);
  document.getElementById('hud-ticket-shards')?.addEventListener('click', onTicketShardsClick);

  // v9.0: Висящая кнопка накопленных билетов + Отложить билет + Повтор голоса + Соц-шаринг ранга + Дуэль к Тилю
  document.getElementById('hud-pending-tickets-btn')?.addEventListener('click', () => {
    Haptics.medium();
    openGoldenTicketForkModal();
  });

  document.getElementById('btn-defer-ticket-pile')?.addEventListener('click', () => {
    closeGoldenTicketForkModal();
  });

  document.getElementById('btn-finale-replay-voice')?.addEventListener('click', () => {
    if (state.round?.voiceUrl) {
      audio.playCleanSenderVoice(state.round.voiceUrl, {
        useBarrelFilter: state.round.useBarrelFilter !== false,
      });
      Haptics.light();
    }
  });

  document.getElementById('btn-finale-share-result')?.addEventListener('click', async () => {
    const rankTitle = computePlayerRankTitle();
    const attempts = Math.max(1, Number(state.round?.attemptsUsed || 1));
    const pts = Math.max(0, Math.round(Number(state.profile?.premierePoints || 0)));
    const tickets = Math.max(0, Number(state.profile?.pendingTicketsCount || 0));
    const refUrl = buildTrailerReferralLinks(state.tg?.user)?.webUrl || 'https://bochka.quest/';
    const ticketLine = tickets > 0 ? ` · 🎟 У меня уже ${tickets} билет(ов) в кино для друзей!` : '';
    const shareText = `🏆 Мой ранг в «БОЧКЕ»: ${rankTitle}! Спас героя с ${attempts}-й попытки · ⭐ ${pts} очков на супер-приз${ticketLine} Проверь свои нервы в цеху:`;
    if (state.tg?.inTelegram) {
      openTelegramShare(refUrl, shareText);
    } else {
      const res = await shareNativeOrFallback({
        title: `БОЧКА — ${rankTitle}`,
        text: shareText,
        url: refUrl,
      });
      if (res === 'copied') showToast('🏆 Результат и ссылка скопированы — вставь в соцсети или чат!');
    }
    Haptics.success();
  });

  document.getElementById('btn-duel-live-close')?.addEventListener('click', () => duelCtrl?.leaveRoom(true));
  document.getElementById('btn-duel-skip-strike')?.addEventListener('click', () => duelCtrl?.skipCurrentStrike());

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

  document.getElementById('btn-pack-quick-1tap')?.addEventListener('click', () => handleQuick1TapPrankClick());
  document.getElementById('btn-seal-barrel')?.addEventListener('click', () => handleSealBarrelClick());
  document.getElementById('input-pair-receipt-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('pair-receipt-status');
    const prevEl = document.getElementById('pair-receipt-preview');
    if (statusEl) statusEl.textContent = '⏳ Сжимаем и загружаем скриншот 1-го билета…';
    try {
      const processed = await processPortraitToWebP(file, 'none');
      const uploadBlob = processed?.blob || file;
      const up = await uploadPairTicketReceipt(state.activePassData?.id || 'pair', uploadBlob);
      if (up?.ok && up.url) {
        state.pairReceiptUrl = up.url;
        if (prevEl) {
          prevEl.src = processed?.dataUrl || up.url;
          prevEl.removeAttribute('hidden');
        }
        if (statusEl) statusEl.textContent = '✓ Скриншот 1-го билета загружен! Теперь нажми кнопку ниже.';
        Haptics.success();
      } else {
        if (statusEl) statusEl.textContent = `⚠️ Ошибка загрузки (${up?.reason || 'попробуй JPG/PNG < 500 КБ'}).`;
        Haptics.error();
      }
    } catch {
      if (statusEl) statusEl.textContent = '⚠️ Не удалось обработать изображение. Выбери скриншот билета (JPG/PNG).';
    }
  });

  // Экран 5: Финал раунда и Суперигра «Гонка за Премьерой»
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
    if (state.finaleMode === 'l1_reply_yes') {
      // Уровень 1 Кнопка 2: мгновенно отправляем ответ в фоне и без задержки запускаем Уровень 2 (6 бочек — найди пустую)!
      sendLevel1FriendReply({ pack: state.incomingPack, replyType: 'wait_ticket', viewerTgUser: state.tg?.user }).catch(() => {});
      showToast('🎟 Другу ушло сообщение: «Жду билет!» · Погнали на Раунд 2 (6 бочек — найди пустую)!');
      Haptics.success();
      state.profile.currentLevel = 2;
      if (!audio._userMuted) audio.unlock(true).catch(() => {});
      startDemoRound();
      return;
    }
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

  document.getElementById('btn-pack-revenge')?.addEventListener('click', async () => {
    if (state.finaleMode === 'l1_reply_yes') {
      // v15.4.2: Запрашиваем разрешение на пуши от бота сразу после 1-й игры (внутри живого тапа игрока!)
      requestAndSyncWriteAccess();
      // Уровень 1 Кнопка 1: мгновенно шлём ответ в фоне и без задержки запускаем Уровень 2 (6 бочек — найди пустую)!
      sendLevel1FriendReply({ pack: state.incomingPack, replyType: 'cinema_accept', viewerTgUser: state.tg?.user }).catch(() => {});
      showToast('🍿 Другу ушло: «Нашёл тебя! Идём в кино!» · Раунд 2 (6 бочек — найди пустую)!');
      Haptics.success();
      state.profile.currentLevel = 2;
      if (!audio._userMuted) audio.unlock(true).catch(() => {});
      startDemoRound();
      return;
    }
    if (state.finaleMode === 'recover_lives') {
      openLivesRecoveryModal({ forLevel: state.round?.workshopLevel || state.profile?.currentLevel || 2 });
      return;
    }
    if (state.finaleMode === 'duels_unlocked' || state.finaleMode === 'premiere') {
      await openDuelTable();
      return;
    }
    if (state.finaleMode === 'next' || state.finaleMode === 'retry') {
      await audio.unlock(true);
      startDemoRound();
      return;
    }
    showScreen('pack');
  });

  document.getElementById('btn-sent-copy-blogger-invite')?.addEventListener('click', async () => {
    if (!state.pack?.lastBloggerInviteUrl) return;
    await copyToClipboard(state.pack.lastBloggerInviteUrl);
    showToast('✓ Входная ссылка для блогера (bi_...) скопирована!');
    Haptics.success();
  });

  document.getElementById('btn-sent-copy-link')?.addEventListener('click', async () => {
    if (!state.pack?.lastShareUrl) return;
    await copyToClipboard(state.pack.lastShareUrl);
    showToast('✓ Ссылка на твою бочку скопирована — кидай другу или вставляй в Сторис!');
    Haptics.success();
  });

  document.getElementById('btn-sent-play')?.addEventListener('click', () => {
    if (!audio._userMuted) audio.unlockSync(true);
    openTilThreePhaseGame();
  });

  document.getElementById('btn-pass-say-thanks')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-pass-say-thanks');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '✓ СПАСИБО ОТПРАВЛЕНО ДРУГУ! (+25% К ЕГО ШКАЛЕ)';
    }
    showToast('🙏 «Спасибо!» улетело другу — его шкала Супер-приза выросла на +25%!');
    Haptics.success();
  });

  document.getElementById('btn-burger-reset-test')?.addEventListener('click', () => {
    closeBurgerDrawer();
    window.location.href = `${window.location.pathname}?reset=1`;
  });

  document.getElementById('btn-burger-test-ticket')?.addEventListener('click', async () => {
    closeBurgerDrawer();
    await audio.unlock(true).catch(() => {});
    state.profile.currentLevel = 3;
    state.profile.lives = Math.max(3, Number(state.profile.lives || 0));
    startDemoRound();
    showToast('🎟 Уровень 3 (8 бочек): найди бочку с настоящим кинобилетом внутри!');
  });

  // v10.0: В любой момент с кнопки меню можно закатать друга, разослать накопленные билеты или открыть рейтинг на Премьеру!
  document.getElementById('btn-burger-pack-friend')?.addEventListener('click', () => {
    closeBurgerDrawer();
    stopAirTimer();
    state.round.running = false;
    state.pack.forLifeRefill = false;
    showScreen('pack');
  });

  document.getElementById('btn-burger-send-tickets')?.addEventListener('click', () => {
    closeBurgerDrawer();
    reconcileSentTicketsLifecycle();
    const cnt = Math.max(0, Number(state.profile.pendingTicketsCount || 0));
    const activeSent = readSentTicketsLedger().filter((x) => x.status === 'waiting_24h' || x.status === 'opened_unactivated');
    if (cnt > 0 || activeSent.length > 0) {
      openGoldenTicketForkModal();
    } else {
      showToast('🎟 Билетов пока 0 — выбей редкий билет на Уровне 3 или в Дуэли!');
    }
  });

  document.getElementById('btn-burger-leaderboard')?.addEventListener('click', () => {
    closeBurgerDrawer();
    openLeaderboardModal();
  });

  document.getElementById('btn-hud-menu')?.addEventListener('click', () => {
    toggleBurgerDrawer();
    Haptics.light();
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
  document.getElementById('btn-burger-kinopoisk')?.addEventListener('click', () => {
    closeBurgerDrawer();
    goKinopoiskAction();
  });
  const goAfishaAction = () => {
    pauseActiveTrailerPlayback();
    recordFunnelEvent('cinema_intent_clicks', state.tg?.user).catch(() => {});
    openExternalLink(ENV.afishaUrl);
  };
  document.getElementById('btn-modal-afisha')?.addEventListener('click', goAfishaAction);
  document.getElementById('btn-burger-afisha')?.addEventListener('click', () => {
    closeBurgerDrawer();
    goAfishaAction();
  });

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

  // Синхронный стол 2–3 игроков «НА СЧЁТ ТРИ!» + режим «В одного (Соло)»
  document.getElementById('btn-duel-close')?.addEventListener('click', () => duelCtrl?.leaveRoom(true));
  document.getElementById('btn-duel-add-bot')?.addEventListener('click', () => duelCtrl?.addSandboxBot());
  document.getElementById('btn-duel-play-solo')?.addEventListener('click', () => duelCtrl?.startSoloDuel());
  document.getElementById('btn-duel-invite-third')?.addEventListener('click', () => pushDuelToFriends());
  document.getElementById('btn-duel-share-link')?.addEventListener('click', () => shareCurrentDuelRoom());
  document.getElementById('btn-duel-start-go')?.addEventListener('click', () => {
    duelCtrl?.hostInitiateRound({ isFreeRerack: false });
  });
  document.getElementById('btn-duel-rattle-chains')?.addEventListener('click', () => {
    duelCtrl?.triggerSpectatorChainRattle();
  });
  document.getElementById('btn-duel-rematch')?.addEventListener('click', () => {
    duelCtrl?.continueBatchOrRematch();
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
  for (const modalId of ['modal-leaderboard', 'modal-share-hub', 'modal-prize', 'modal-rules', 'modal-repeat-duel', 'modal-legal']) {
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
    for (const modalId of ['modal-share-hub', 'modal-prize', 'modal-rules', 'modal-repeat-duel', 'modal-legal']) {
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

  // Ленивое юридическое модальное окно #modal-legal (подгружает src/legal.js только по клику)
  document.addEventListener('click', (e) => {
    const trigger = e.target?.closest?.('[data-open-legal]');
    if (!trigger) return;
    e.preventDefault();
    const tab = trigger.getAttribute('data-open-legal') || 'rules';
    closeBurgerDrawer();
    openLegalModal(tab).catch(() => {});
  });

  document.querySelectorAll('[data-legal-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const tab = tabBtn.getAttribute('data-legal-tab') || 'rules';
      openLegalModal(tab).catch(() => {});
    });
  });

  const closeLegalModal = () => {
    document.getElementById('modal-legal')?.setAttribute('hidden', '');
    state.round.pausedForModal = false;
    if (state.activeScreen === 'workshop' && state.round.running) {
      scene?.setInteractive(true);
    }
  };
  document.getElementById('btn-close-legal')?.addEventListener('click', closeLegalModal);
  document.getElementById('btn-legal-ok')?.addEventListener('click', closeLegalModal);

  // Ленивое модальное окно «Зал славы (Коллекционер)» (src/trophies.js грузится строго по клику)
  const closeHallOfFameModal = () => {
    const m = document.getElementById('modal-hall-of-fame');
    m?.setAttribute('hidden', '');
    m?.querySelector('#hof-detail-overlay')?.remove();
    state.round.pausedForModal = false;
    if (state.activeScreen === 'workshop' && state.round.running) {
      scene?.setInteractive(true);
    }
  };
  document.getElementById('btn-hub-hall-of-fame')?.addEventListener('click', () => {
    Haptics.light();
    openHallOfFameModal().catch(() => {});
  });
  document.getElementById('btn-burger-hall-of-fame')?.addEventListener('click', () => {
    Haptics.light();
    openHallOfFameModal().catch(() => {});
  });
  document.getElementById('btn-close-hall-of-fame')?.addEventListener('click', closeHallOfFameModal);
  document.getElementById('modal-hall-of-fame')?.addEventListener('click', (e) => {
    if (e.target?.id === 'modal-hall-of-fame') closeHallOfFameModal();
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
  const isOn = audio.ctx ? audio.isActuallyAudible() : Boolean(audio.enabled && !audio._userMuted);
  const txt = isOn ? t('hudSoundOn') : t('hudSoundOff');
  const btn = document.getElementById('btn-hud-sound');
  if (btn) {
    btn.textContent = txt;
  }
  const burgerBtn = document.getElementById('btn-burger-sound');
  if (burgerBtn) {
    burgerBtn.textContent = isOn ? `🔊 ${txt}` : `🔇 ${txt}`;
  }
  const cornerBtn = document.getElementById('btn-sound-corner');
  if (cornerBtn) {
    cornerBtn.textContent = isOn ? '🔊' : '🔇';
    cornerBtn.classList.toggle('is-muted', !isOn);
    cornerBtn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    cornerBtn.title = isOn ? 'Звук включён (нажми, чтобы выключить)' : 'Звук выключен (нажми, чтобы включить)';
  }
}

function positionOceanToast() {
  /* v16.0: быстрые всплывающие тосты полностью удалены */
}

function showToast(text) {
  const clean = String(text || '').trim();
  const legacyEl = document.getElementById('toast');
  if (legacyEl) legacyEl.setAttribute('hidden', '');
  if (!clean) return;
  // v16.0: Никаких мелькающих за 1.4-2.8с тостов! Все важные события — спокойная карточка Duolingo с кнопкой «Дальше».
  showDuolingoCard({
    icon: clean.startsWith('🎟') ? '🎟' : clean.startsWith('🔒') ? '🔒' : clean.startsWith('🎬') ? '🎬' : '🛢',
    title: 'Сообщение',
    body: clean,
    buttonText: 'ДАЛЬШЕ',
    tone: 'gold',
  });
}

bootstrap();
