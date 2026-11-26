import { ENV, resolveSiteAsset } from './env.js';
import { initI18n, setLang, t, applyDomTranslations, onLangChange } from './i18n.js';
import {
  initTelegram,
  buildTelegramStartAppUrl,
  isAdminModeRequested,
  isTestBogRequested,
  isTestBogSessionActive,
  requestTelegramContact,
  requestTelegramWriteAccessIfNeeded,
  openTelegramShare,
  openNativeTelegramShareCard,
  openNativeTelegramShareCardWithConfirmation,
  openWhatsAppShare,
  openVkShare,
  openInstagramShareFlow,
  shareNativeOrFallback,
  copyToClipboard,
  openExternalLink,
  promptAddToHomeScreenSafe,
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
  fetchDuelFriendCandidates,
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
  claimSpecialKnockBonus,
  computeSuperprizeProgress,
  claimGoldenTicketShard,
  claimWorkshopRecoveryLife,
  claimFirstSocialExclusive,
  fetchBranchBattleStats,
  recordHomescreenShortcut,
  sendRevengeClosedPush,
  claimTrailer60sCheckpointServer,
  claimPingPongRevengeBonusServer,
  claimPingPongRelayBonusServer,
  randomShortId,
} from './backend.js';
import { HorrorScreamerPlayer, preloadScreamerFrames } from './screamer-fx.js';

const HORROR_FALLBACK_PORTRAITS = [
  './public/sprites/horror_hero_captive.webp',
  './public/sprites/horror_hero_warden.webp',
  './public/sprites/horror_hero_mechanic.webp',
  './public/sprites/horror_barrel_face.webp',
  './public/sprites/horror_claw_hands.webp',
  './public/sprites/horror_gasmask_weld.webp',
  './public/sprites/horror_cctv_face.webp',
];
function pickRandomHorrorPortrait() {
  return (
    HORROR_FALLBACK_PORTRAITS[Math.floor(Math.random() * HORROR_FALLBACK_PORTRAITS.length)] ||
    HORROR_FALLBACK_PORTRAITS[0]
  );
}
const FIGHTER_AVATARS = [
  './public/sprites/fighter_1.webp?v=2000',
  './public/sprites/fighter_2.webp?v=2000',
  './public/sprites/fighter_3.webp?v=2000',
  './public/sprites/fighter_4.webp?v=2000',
  './public/sprites/fighter_5.webp?v=2000',
  './public/sprites/fighter_6.webp?v=2000',
];
function getPlayerAvatarUrl(tgUser = null) {
  const tgPhoto = String(tgUser?.photoUrl || tgUser?.photo_url || state?.profile?.avatarUrl || '').trim();
  if (tgPhoto && /^(https?:\/\/|\.\/public\/sprites\/fighter_)/i.test(tgPhoto)) {
    return tgPhoto;
  }
  try {
    const saved = String(localStorage.getItem('bochka_fighter_avatar_v20') || '').trim();
    if (saved && FIGHTER_AVATARS.includes(saved)) return saved;
    const picked = FIGHTER_AVATARS[Math.floor(Math.random() * FIGHTER_AVATARS.length)] || FIGHTER_AVATARS[0];
    localStorage.setItem('bochka_fighter_avatar_v20', picked);
    return picked;
  } catch {
    return FIGHTER_AVATARS[0];
  }
}
const RANDOM_PACK_SCREAMERS = [
  'saw_scream',
  'lid_blast',
  'basement_shriek',
  'tesla_siren',
  'horror_banging',
  'horror_scratch',
  'horror_groan',
  'horror_whisper',
  'horror_char_0',
  'horror_char_1',
  'horror_char_2',
  'horror_char_3',
  'horror_char_4',
  'horror_char_5',
  'horror_char_6',
];
function pickRandomPackScreamer() {
  return RANDOM_PACK_SCREAMERS[Math.floor(Math.random() * RANDOM_PACK_SCREAMERS.length)] || 'horror_jumpscare_shriek';
}

const AIR_DURATION_SEC = 30.0;
const KP_MIN_AWAY_SEC = 3.5;
const TRAILER_INTRO_LOCK_SEC = 10.0;
const TRAILER_BASE_REWARD_SEC = 40.0;
const TRAILER_MID_REWARD_SEC = 60.0;
const TRAILER_UNLOCK_SEC = 10.0;
const HINT_STORAGE_KEYS = {
  airDepleted: 'bochka_hint_air_v21',
  firstTicket: 'bochka_hint_ticket_v21',
  firstChip: 'bochka_hint_chip_v21',
  firstPoints: 'bochka_hint_points_v21',
  firstEnergy: 'bochka_hint_energy_v21',
  firstLife: 'bochka_hint_life_v21',
};

function loadHintsShownState() {
  const out = {
    airDepleted: false,
    firstTicket: false,
    firstChip: false,
    firstPoints: false,
    firstEnergy: false,
    firstLife: false,
  };
  try {
    for (const [k, storageKey] of Object.entries(HINT_STORAGE_KEYS)) {
      out[k] = localStorage.getItem(storageKey) === '1';
    }
  } catch { /* ignore private storage */ }
  return out;
}

function persistHintShown(kind) {
  const key = HINT_STORAGE_KEYS[kind];
  if (!key) return;
  try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
}

function resetHintsShownState() {
  try {
    for (const storageKey of Object.values(HINT_STORAGE_KEYS)) {
      localStorage.removeItem(storageKey);
    }
  } catch { /* ignore private storage */ }
  if (typeof state !== 'undefined' && state) {
    state.hintsShown = loadHintsShownState();
    state.contextHintQueue = [];
  }
}
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
    liveRank: 0,
    trophiesCount: 0,
    chipsCount: 0,
    goldenTicketShards: 0,
    goldenLevelsClaimed: [],
    superprizeUnlockedAt: null,
    uiStage: 1,
    temuSurgeClaimed: false,
    hasSocialConnection: false,
    repeatLinkEntered: false,
    mustSendFriendPack: false,
    pendingTicketsCount: 0,
    ticketsExpireAt: 0,
    pointsBoostX2Until: null,
    firstSocialExclusiveClaimed: false,
    homescreenShortcutAdded: false,
    homescreenBonusClaimed: false,
    pushDeclined: false,
    homescreenPillDismissed: false,
    relayBonusClaimed: false,
    bestEscapeSec: null,
    trafficSource: '',
    seedPrefix: '',
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

  // Плеер трейлера: чистый официальный VK Видео через локальный VK.VideoPlayer (91.8с, 0 МБ с GitHub Pages)
  trailer: {
    modalOpen: false,
    forRescue: false,
    afterL1ToPack: false,
    shownInL1Flow: false,
    introLocked: false,
    introWatchedSec: 0,
    maxTime: 0,
    honestWatchedSec: 0,
    prevVkTime: 0,
    lastTickWallMs: 0,
    trailerWatchedFull: false,
    base30sRewarded: false,
    base30sInFlight: false,
    mid60sRewarded: false,
    mid60sInFlight: false,
    fullWatchRewarded: false,
    fullWatchInFlight: false,
    antiSeekRejectedCount: 0,
    lastAntiSeekToastAt: 0,
    unlocked40: false,
    muted: false,
    vkReady: false,
    vkState: '',
    vkTime: 0,
    vkDuration: 91.8,
    vkMuted: false,
    vkVolume: 1,
    vkAutoplaySoundBlocked: false,
    wallClockSec: 0,
    vkTimer: null,
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

  hintsShown: loadHintsShownState(),
  contextHintQueue: [],
  contextHint: {
    open: false,
    kind: '',
    text: '',
    onClose: null,
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
    shareTemplate: 'thriller_challenge',
    customEdited: false,
    userUploadedPhoto: false,
    sealing: false,
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
  vkPlayer: null,
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
      const { WorkshopScene } = await import('./scene.js?v=2000');
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
      scene.setSilentRadarMode(!audio.enabled, state.round?.targetIndex || 0);
      syncSceneRenderPause();
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
    if (!screamersPreloaded) {
      screamersPreloaded = true;
      window.setTimeout(() => {
        preloadScreamerFrames(SCREAMER_META);
        preloadBarrelClosers();
      }, 200);
    }
    const mod = duelModCache || (await import('./duel.js?v=2023'));
    duelModCache = mod;
    if (duelCtrl) return duelCtrl;
    duelCtrl = new mod.WorkshopDuelController({
      scene,
      audio,
      onPhaseChange: () => syncLobbyHomescreenPillUI(),
      getTgUser: () => state.tg?.user || null,
      getTgWriteAccess: () => Boolean(state.profile?.tgWriteAccess),
      onRequestWriteAccess: () => requestAndSyncWriteAccess({ force: false }),
      getPlayerAvatar: () => getPlayerAvatarUrl(state.tg?.user),
      getHasRealFriends: () => getRealFriendsCount() >= 1,
      getProfileStats: () => ({
        lives: Number(state.profile?.lives || 0),
        premierePoints: Number(state.profile?.premierePoints || 0),
        ticketShards: Number(state.profile?.ticketShards || 0),
        pendingTicketsCount: Math.max(0, Math.round(Number(state.profile?.pendingTicketsCount || 0))),
        friendsBrought: Number(state.profile?.friendsBrought || 0),
        friendsCount: getRealFriendsCount(),
        chipsCount: Number(state.profile?.chipsCount || 0),
        trophiesCount: Number(state.profile?.trophiesCount ?? state.profile?.chipsCount ?? 0),
        currentLevel: Math.max(1, Number(state.profile?.currentLevel || 1)),
        duelsPlayed: Number(state.profile?.duelsPlayed || 0),
        duelsWon: Number(state.profile?.duelsWon || 0),
        goldenTicketShards: Number(state.profile?.goldenTicketShards || 0),
        goldenLevelsClaimed: Array.isArray(state.profile?.goldenLevelsClaimed) ? state.profile.goldenLevelsClaimed : [],
      }),
      getTicketShards: () => Number(state.profile?.ticketShards || 0),
      canUseOceanRefill: () => canClaimOceanRefillToday(),
      onCollectGoldenShard: async (superLevel = 1) => {
        const res = await claimGoldenTicketShard(state.tg?.user, superLevel).catch(() => null);
        if (res?.ok) {
          state.profile.goldenTicketShards = Number(res.goldenTicketShards ?? state.profile.goldenTicketShards ?? 0);
          state.profile.goldenLevelsClaimed = Array.isArray(res.goldenLevelsClaimed)
            ? res.goldenLevelsClaimed
            : state.profile.goldenLevelsClaimed;
          state.profile.currentLevel = Math.max(Number(state.profile.currentLevel || 1), Number(superLevel || 1) + 1);
          Haptics.success();
          showToast(
            res.completedGoldenTicket
              ? '🏆 ВСЕ 12/12 ЧАСТЕЙ ЗОЛОТОГО БИЛЕТА СОБРАНЫ! Ты в главном розыгрыше Суперприза!'
              : `✨ Найдена твоя часть Золотого билета (${state.profile.goldenTicketShards}/12)!`
          );
          syncSuperPrizeRatingBarUI();
          duelCtrl?.syncEnergyUI?.();
          if (state.activeScreen === 'modeA') renderModeARankBoard();
        }
        return res;
      },
      onOpenPackForLives: () => {
        state.pack.forLifeRefill = true;
        duelCtrl?.leaveRoom(false);
        showScreen('pack');
      },
      onFoundFriendBarrel: () => {
        duelCtrl?.leaveRoom(false);
        state.pack.forLifeRefill = false;
        showScreen('pack');
      },
      onContextDiscoveryHint: (kind) => maybeShowDuelDiscoveryHint(kind),
      onLifeLostPill: (dmg = 1) => showLifeLostPill(1750, dmg),
      onOpenHallOfFame: () => openHallOfFameModal().catch(() => {}),
      loadDuelCandidates: () => fetchDuelFriendCandidates(state.tg?.user || null),
      onChallengeFriend: (friend, roomId) => challengeSpecificFriend1v1(friend, roomId),
      onOpenPackFriend: () => {
        duelCtrl?.leaveRoom(false);
        showScreen('pack');
      },
      onRoomFull: () => {
        showToast('🔒 За тем столом 1×1 уже играют двое — открыли тебе новый стол!');
        openDuelTable('').catch(() => {});
      },
      onTriggerScreamerFx: (durMs, variant = null, dmg = 1) => triggerMiniScreamer(variant, durMs, dmg),
      onFirstPvpDuelComplete: () => {
        applyFirstSocialExclusive('first_duel_1x1').catch(() => {});
      },
      onUnlockFilmArtifact: () => {
        return loadTrophiesMod()
          .then((mod) => {
            const res = mod.unlockNextArtifactLevel?.();
            if (res?.isNew && res.slot) {
              showToast(`🎬 Открыт артефакт фильма (${res.unlockedCount}/${res.totalSlots}): «${res.slot.title}» — смотри в Зале славы!`);
            }
            return res;
          })
          .catch(() => null);
      },
      onCollectChipFromBarrel: ({ source = 'duel_barrel' } = {}) => {
        return rollRareMovieCardLazy(source)
          .then((res) => {
            if (res?.ok && res.totalCount != null) {
              state.profile.trophiesCount = Number(res.totalCount || 0);
              state.profile.chipsCount = Number(res.totalCount || 0);
              if (duelCtrl) {
                const prevList = Array.isArray(duelCtrl.hofCache?.trophies) ? duelCtrl.hofCache.trophies : [];
                const nextList = res.dropped && res.trophy
                  ? [res.trophy, ...prevList.filter((x) => x.id !== res.trophy.id)]
                  : prevList;
                duelCtrl.hofCache = {
                  ...(duelCtrl.hofCache || {}),
                  ok: true,
                  totalCount: state.profile.trophiesCount,
                  trophies: nextList,
                };
                duelCtrl.syncEnergyUI?.();
              }
              renderModeARankBoard();
            }
            return res;
          })
          .catch(() => null);
      },
      onProfileSync: (patch) => {
        state.profile = { ...state.profile, ...patch };
        if (patch && patch.ticketShards != null) {
          saveLocalV9Flags();
          syncTicketShardsUI({ pulse: true });
          duelCtrl?.syncEnergyUI?.();
        }
        updatePremiereBarsUI();
        refreshHudLevelLabel();
        syncSuperPrizeRatingBarUI();
      },
      onToast: (msg) => showToast(msg),
      onOpenInviteShare: () => pushDuelToFriends(),
      onOpenGoldenFork: () => openGoldenTicketForkModal(),
      onExitToHub: () => showScreen('modeA'),
      onDefeatCinematic: ({ oceanAllowed, roomId, solo } = {}) => {
        playBarrelDefeatCinematic({ oceanAllowed, roomId, solo });
      },
      onDuelDefeatToTil: ({ roomId, solo } = {}) => {
        playBarrelDefeatCinematic({ oceanAllowed: canClaimOceanRefillToday(), roomId, solo });
      },
      onFlyRating: ({ type = 'rating', count = 3, label = '⭐ +БАЛЛЫ', barrelIndex = -1 } = {}) => {
        const pos = barrelIndex >= 0 ? scene?.projectBarrelScreenPos?.(barrelIndex, 1.05) : null;
        flyRewardToHud({
          type,
          count,
          label,
          startX: pos?.visible ? pos.x : null,
          startY: pos?.visible ? pos.y : null,
        });
        syncSuperPrizeRatingBarUI();
      },
      onFlyLife: ({ type = 'lives', count = 1, label = '+1 ❤️', barrelIndex = -1 } = {}) => {
        const pos = barrelIndex >= 0 ? scene?.projectBarrelScreenPos?.(barrelIndex, 1.05) : null;
        flyRewardToHud({
          type,
          count,
          label,
          startX: pos?.visible ? pos.x : null,
          startY: pos?.visible ? pos.y : null,
        });
      },
      onReturnToLevels: () => {
        duelCtrl?.startSoloDuel?.();
      },
    });
    return duelCtrl;
  })();
  return duelInitPromise;
}

async function createWatchChannelLazy(barrelId, opts) {
  const mod = duelModCache || (await import('./duel.js?v=2023'));
  duelModCache = mod;
  return mod.createBarrelWatchChannel(barrelId, opts);
}

let trophiesModCache = null;
async function loadTrophiesMod() {
  if (!trophiesModCache) {
    trophiesModCache = await import('./trophies.js?v=2023');
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
  const data = await mod.fetchHallOfFame(state.tg?.user || null);
  if (data?.ok) {
    state.profile.trophiesCount = Math.max(0, Number(data.totalCount || 0));
    state.profile.chipsCount = state.profile.trophiesCount;
    if (duelCtrl) {
      duelCtrl.hofCache = data;
      duelCtrl.syncEnergyUI?.();
    }
    renderModeARankBoard();
  }
  mod.renderHallOfFameModal(body, data, {
    currentLevel: Number(state.profile?.currentLevel || 1),
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
    onPlayTil: () => {
      modal.setAttribute('hidden', '');
      state.round.pausedForModal = false;
      openDuelTable('', { initialMode: 'classic' }).catch(() => {});
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
      if (!state.hintsShown?.firstChip && duelCtrl?.isActive) {
        maybeShowDuelDiscoveryHint('chip');
      }
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
      showToast(`🪙 Фишка «${res.trophy.label}»${num} добавлена в Зал славы!`);
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
  const teaser = document.getElementById('gate-teaser');
  const enterSoundSpan = document.querySelector('#btn-enter-sound span');
  const role = getTeamSeedRole();
  refreshBranchBattleUI().catch(() => {});
  if (role === 'prod' && !state.incomingParam) {
    const pref = buildBroadcastPrefix('prod', state.tg?.user);
    if (banner) {
      banner.textContent = `🎬 КОМАНДА ПРОДЮСЕРОВ (${pref}) — Запакуй СЕБЯ в бочку 1 раз и получи ОДНУ общую ссылку для знакомых и подписчиков! Розыгрыши на команду не действуют.`;
      banner.removeAttribute('hidden');
    }
    if (teaser) {
      teaser.textContent =
        'Шаг 1: запакуй себя (фото + скример/голос) → получишь одну общую ссылку pr_... для своего круга. Шаг 2: можно сразу играть!';
    }
    if (enterSoundSpan) {
      enterSoundSpan.textContent = '🎬 ЗАПАКОВАТЬ СЕБЯ И ПОЛУЧИТЬ ССЫЛКУ';
    }
    return;
  }
  if (role === 'blog') {
    const pref = buildBroadcastPrefix('blog', state.tg?.user);
    if (banner) {
      banner.textContent = `🔥 ВХОД ДЛЯ БЛОГЕРА (${pref}) — Пройди Раунд 1, в Раунде 2 найди пустую бочку и запакуй туда СЕБЯ → получишь ОДНУ общую ссылку (bl_...) для Stories и канала! Твоя аудитория участвует в розыгрыше 1+1 на 100%.`;
      banner.removeAttribute('hidden');
    }
    if (teaser) {
      teaser.textContent = state.incomingParam
        ? 'Сначала выберись из бочки продюсера в Раунде 1, затем в Раунде 2 запакуй себя — и забирай одну общую ссылку для своих Stories!'
        : 'Пройди короткий Раунд 1, в Раунде 2 запакуй себя (лицо + крик/скример) и получи одну общую ссылку для Stories и канала!';
    }
    return;
  }
  banner?.setAttribute('hidden', '');
}

let _x2BoostTimerId = null;
function getActivePointsMultiplier() {
  const raw = state.profile?.pointsBoostX2Until;
  if (!raw) return 1;
  const ts = typeof raw === 'number' ? raw : Date.parse(String(raw));
  return Number.isFinite(ts) && ts > Date.now() ? 2 : 1;
}

function syncX2BoostHudUI() {
  const pill = document.getElementById('hud-x2-boost-pill');
  const timerEl = document.getElementById('hud-x2-timer');
  if (!pill) return;
  const raw = state.profile?.pointsBoostX2Until;
  const ts = raw ? (typeof raw === 'number' ? raw : Date.parse(String(raw))) : 0;
  const remSec = ts > Date.now() ? Math.max(0, Math.ceil((ts - Date.now()) / 1000)) : 0;
  if (remSec <= 0) {
    pill.setAttribute('hidden', '');
    if (_x2BoostTimerId) {
      clearInterval(_x2BoostTimerId);
      _x2BoostTimerId = null;
    }
    return;
  }
  const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
  const ss = String(remSec % 60).padStart(2, '0');
  if (timerEl) timerEl.textContent = `${mm}:${ss}`;
  pill.removeAttribute('hidden');
  if (!_x2BoostTimerId) {
    _x2BoostTimerId = window.setInterval(syncX2BoostHudUI, 1000);
  }
}

async function applyFirstSocialExclusive(trigger = 'friend_or_duel') {
  if (!state.profile) return null;
  if (state.profile.firstSocialExclusiveClaimed && getActivePointsMultiplier() === 2) {
    syncX2BoostHudUI();
    return null;
  }
  const res = await claimFirstSocialExclusive(state.tg?.user, trigger).catch(() => null);
  if (res?.ok && (res.granted || res.alreadyClaimed)) {
    state.profile.firstSocialExclusiveClaimed = true;
    state.profile.hasSocialConnection = true;
    if (res.pointsBoostX2Until) {
      state.profile.pointsBoostX2Until = res.pointsBoostX2Until;
    }
    if (res.premierePoints != null) {
      state.profile.premierePoints = Math.max(Number(state.profile.premierePoints || 0), Number(res.premierePoints));
    }
    syncX2BoostHudUI();
    updatePremiereBarsUI();
    syncSuperPrizeRatingBarUI();
    if (res.granted) {
      rollRareMovieCardLazy('first_social_v207').catch(() => {});
      showToast('🎁 1-й друг / дуэль 1×1: редкая фишка + сборка целого билета в кино + буст ×2 очков на 15 мин!', { durationMs: 4800 });
    }
  }
  return res;
}

function getActiveBranchPrefix() {
  const sp = String(state.profile?.seedPrefix || '').trim().toLowerCase();
  if (/^(pr|bl)_/.test(sp)) return sp;
  const ts = String(state.profile?.trafficSource || state.tg?.trafficSource || '').trim().toLowerCase();
  if (/^(pr|bl)_/.test(ts)) return ts;
  const lastBroadcast = String(state.pack?.lastBroadcastPrefix || '').trim().toLowerCase();
  if (/^(pr|bl)_/.test(lastBroadcast)) return lastBroadcast;
  const role = getTeamSeedRole();
  if (role === 'prod' || role === 'blog') {
    return buildBroadcastPrefix(role, state.tg?.user).toLowerCase();
  }
  return '';
}

async function refreshBranchBattleUI() {
  const pref = getActiveBranchPrefix();
  const data = await fetchBranchBattleStats(pref).catch(() => null);
  const myBr = data?.myBranch || null;
  const top1 = Array.isArray(data?.topBranches) && data.topBranches.length ? data.topBranches[0] : null;
  let text = '';
  if (myBr) {
    const icon = myBr.role === 'blog' ? '🔥' : '🎬';
    text = `${icon} Битва веток · Команда ${myBr.prefix}: ${myBr.members_count} чел. · ${Number(myBr.total_points || 0).toLocaleString('ru-RU')} ⭐ (#${myBr.rank} в рейтинге)`;
  } else if (pref) {
    const icon = pref.startsWith('bl_') ? '🔥' : '🎬';
    text = `${icon} Битва веток · Ветка ${pref}: стань первым и веди знакомых в кино!`;
  } else if (top1) {
    const icon = top1.role === 'blog' ? '🔥' : '🎬';
    text = `${icon} Битва веток: лидирует ${top1.prefix} (${top1.members_count} чел.)`;
  }
  for (const elId of ['gate-branch-battle-pill', 'sent-branch-battle-pill', 'lb-branch-battle-pill']) {
    const el = document.getElementById(elId);
    if (!el) continue;
    if (text && (pref || elId === 'lb-branch-battle-pill')) {
      el.textContent = text;
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
  }
  return data;
}

function buildPersonalShareCopy(template = 'thriller_challenge', bestSec = null) {
  const rawBest = bestSec ?? state.profile?.bestEscapeSec ?? null;
  const numBest = Number(rawBest);
  const hasRealBest = rawBest != null && Number.isFinite(numBest) && numBest > 0;
  const sec = hasRealBest ? Math.max(3, Math.min(30, Math.round(numBest))) : null;
  if (template === 'friend_ticket' || template === 'gift_barrel') {
    return {
      template: 'friend_ticket',
      bestSec: sec,
      phrase:
        'Слушай, у меня в игре по триллеру «БОЧКА» осталась лишняя часть билета в кино — спрятал её в бочке, попробуй вытащить за 30 секунд',
      shareText:
        '🎟 Слушай, у меня в игре по триллеру «БОЧКА» осталась лишняя часть билета в кино — спрятал её в бочке, попробуй вытащить за 30 секунд:',
    };
  }
  const phrase = hasRealBest
    ? `Выбрался из стальной бочки Тиля Швайгера за ${sec} сек (работает даже без звука по радару). Попробуешь быстрее?`
    : 'Закрыл тебя в стальной бочке из триллера с Тилем Швайгером. 30 секунд воздуха, работает даже без звука — проверишь, успеешь выбраться?';
  return {
    template: 'thriller_challenge',
    bestSec: sec,
    phrase,
    shareText: `🛢 ${phrase}`,
  };
}

function updatePackTemplatePreview() {
  const rawTpl = state.pack.shareTemplate || 'thriller_challenge';
  const tpl = rawTpl === 'gift_barrel' ? 'friend_ticket' : rawTpl === 'record_challenge' ? 'thriller_challenge' : rawTpl;
  state.pack.shareTemplate = tpl;
  document.getElementById('btn-tpl-thriller')?.classList.toggle('is-active', tpl === 'thriller_challenge');
  document.getElementById('btn-tpl-friend-ticket')?.classList.toggle('is-active', tpl === 'friend_ticket');
  const prevEl = document.getElementById('pack-template-preview');
  if (prevEl) {
    const copy = buildPersonalShareCopy(tpl, state.profile?.bestEscapeSec);
    prevEl.textContent = `«${copy.phrase}»`;
  }
}

function applySeedPackModeUI(active) {
  const titleEl = document.getElementById('pack-screen-title');
  const role = getTeamSeedRole();
  const needsInitialSeedPack = Boolean(
    active &&
      (role === 'prod' || role === 'blog') &&
      !state.profile?.seedFirstPackDone &&
      !state.profile?.hasBroadcastBarrel
  );
  if (needsInitialSeedPack) {
    const isBlog = role === 'blog';
    if (titleEl) {
      titleEl.textContent = isBlog ? 'Запакуй себя для Stories и канала' : 'Запакуй себя в общую бочку';
    }
    return;
  }
  if (titleEl) titleEl.textContent = '🔥 Отомсти и закатай друга';
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

const OCEAN_REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function canClaimOceanRefillToday() {
  const last = Number(state.profile?.lastOceanRefillAt || 0);
  return !(last > 0 && Date.now() - last < OCEAN_REFILL_COOLDOWN_MS);
}

function loadLocalV9Flags() {
  try {
    const raw = JSON.parse(localStorage.getItem(V9_PROGRESS_STORAGE_KEY) || '{}');
    if (raw && typeof raw === 'object') {
      state.profile.mustSendFriendPack = Boolean(raw.mustSendFriendPack);
      state.profile.seedFirstPackDone = Boolean(raw.seedFirstPackDone);
      state.profile.ticketShards = Math.max(0, Math.min(3, Math.round(Number(raw.ticketShards || 0))));
      state.profile.friendsShardAwardedCount = Math.max(0, Math.round(Number(raw.friendsShardAwardedCount || 0)));
      state.profile.lastOceanRefillAt = Math.max(0, Number(raw.lastOceanRefillAt || 0));
      state.profile.pushDeclined = Boolean(raw.pushDeclined);
      state.profile.homescreenPillDismissed = Boolean(raw.homescreenPillDismissed);
      state.profile.homescreenShortcutAdded = Boolean(state.profile.homescreenShortcutAdded || raw.homescreenShortcutAdded);
      state.profile.homescreenBonusClaimed = Boolean(state.profile.homescreenBonusClaimed || raw.homescreenBonusClaimed);
      if (raw.bestEscapeSec != null && Number(raw.bestEscapeSec) > 0) {
        state.profile.bestEscapeSec = Math.max(3, Math.min(30, Math.round(Number(raw.bestEscapeSec))));
      }
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
        lastOceanRefillAt: Math.max(0, Number(state.profile.lastOceanRefillAt || 0)),
        pendingTicketsCount: Math.max(0, Math.round(Number(state.profile.pendingTicketsCount || 0))),
        ticketsExpireAt: Number(state.profile.ticketsExpireAt || 0),
        pushDeclined: Boolean(state.profile.pushDeclined),
        homescreenPillDismissed: Boolean(state.profile.homescreenPillDismissed),
        homescreenShortcutAdded: Boolean(state.profile.homescreenShortcutAdded),
        homescreenBonusClaimed: Boolean(state.profile.homescreenBonusClaimed),
        bestEscapeSec: state.profile.bestEscapeSec != null ? Number(state.profile.bestEscapeSec) : null,
      })
    );
  } catch { /* ignore */ }
}

function syncLobbyHomescreenPillUI(screenName = state.activeScreen) {
  const pill = document.getElementById('lobby-homescreen-pill');
  if (!pill) return;
  const duelIsLobby =
    screenName === 'duel' && (!duelCtrl?.isActive || duelCtrl?.phase === 'lobby' || duelCtrl?.phase === 'finished');
  const inLobby = screenName === 'modeA' || duelIsLobby;
  const shouldShow =
    Boolean(inLobby) &&
    Boolean(state.profile?.pushDeclined) &&
    !Boolean(state.profile?.tgWriteAccess) &&
    !Boolean(state.profile?.homescreenShortcutAdded) &&
    !Boolean(state.profile?.homescreenPillDismissed);
  if (shouldShow) pill.removeAttribute('hidden');
  else pill.setAttribute('hidden', '');
}

function syncTicketShardsUI({ pulse = false, showFullFlash = false, justEarned = 0 } = {}) {
  const whole = Math.max(0, Math.round(Number(state.profile?.pendingTicketsCount || 0)));
  const shards = showFullFlash ? 4 : Math.max(0, Math.min(3, Math.round(Number(state.profile?.ticketShards || 0))));
  const fullLabel = `${whole} · ${shards}/4`;
  const shardLabel = `${shards}/4`;
  const titleHint = `Целых билетов: ${whole} · Четвертинки: ${shards}/4`;
  for (const id of ['top-shards-count', 'hud-shards-count', 'mode-a-rb-tickets']) {
    const el = document.getElementById(id);
    if (el) el.textContent = fullLabel;
  }
  const burgerShards = document.getElementById('burger-shards-count');
  if (burgerShards) burgerShards.textContent = shardLabel;
  for (const pillId of ['top-ticket-shards', 'hud-ticket-shards', 'duel-shards-pill', 'mode-a-rb-tickets-wrap']) {
    const pill = document.getElementById(pillId);
    if (!pill) continue;
    if (pillId === 'top-ticket-shards' || pillId === 'hud-ticket-shards') {
      pill.title = titleHint;
    }
    pill.querySelector('.ticket-stub-mini')?.classList.toggle('is-complete', shards >= 4 || Boolean(showFullFlash));
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
      const fill = filled ? 'url(#monoG)' : '#1e293b';
      const stroke = isNew ? '#ffffff' : filled ? '#cbd5e1' : '#475569';
      const textCol = filled ? '#0f172a' : '#64748b';
      return (
        `<rect x="${x}" y="52" width="48" height="62" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${isNew ? 3 : 1.5}" ${filled ? '' : 'stroke-dasharray="4 3"'}/>` +
        `<text x="${x + 24}" y="82" text-anchor="middle" font-family="monospace" font-size="14" font-weight="900" fill="${textCol}">${i}/4</text>` +
        `<text x="${x + 24}" y="99" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="${textCol}">${i * 25}%</text>`
      );
    })
    .join('');
  const title = merged ? '🎟 ЦЕЛЫЙ БИЛЕТ СОБРАН!' : `ЧАСТЬ БИЛЕТА (${count} ИЗ 4)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="160" viewBox="0 0 260 160">` +
    `<defs><linearGradient id="monoG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="60%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient></defs>` +
    `<rect x="4" y="4" width="252" height="152" rx="14" fill="#0f141d" stroke="#cbd5e1" stroke-width="2.5"/>` +
    `<text x="130" y="34" text-anchor="middle" font-family="monospace" font-size="14" font-weight="900" fill="#f8fafc">${title}</text>` +
    `${cells}` +
    `<text x="130" y="139" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#cbd5e1">КИНОБИЛЕТ «БОЧКА» · 17 ДЕКАБРЯ</text>` +
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
      showToast('🎟 Все 4 части собраны — целый бесплатный билет в кино готов! Отправь его другу в Telegram!');
    }
    return { merged: true, granted: true, shards: 0, res };
  }
  if (res.reason === 'solo_cap_reached' || res.reason === 'friend_or_duel_required') {
    const keepShards = Math.max(0, Math.min(3, Number(res.shards ?? state.profile?.ticketShards ?? 2)));
    const bonusFallback = Number(res.fallbackPoints || 500);
    state.profile.ticketShards = keepShards;
    state.profile.premierePoints = Math.max(
      Number(res.premierePoints || 0),
      Number(state.profile.premierePoints || 0) + bonusFallback
    );
    saveLocalV9Flags();
    syncTicketShardsUI({ pulse: true });
    updatePremiereBarsUI();
    if (!silent) {
      showToast('🎟 Половина билета в кино (2 из 4 частей) уже собрана! Закатай друга или сыграй 1×1, чтобы собрать целый билет (+500 ⭐)!');
    }
    return { merged: false, granted: false, soloCapReached: true, fallbackPoints: bonusFallback, shards: keepShards, res };
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
      const capLabel = Number(res.maxDaily || 4);
      showToast(
        `⭐ Дневная партия билетов (${capLabel} шт.) на сегодня разобрана — новая откроется в 00:00 МСК! Держи +${bonusFallback} ⭐ в гонку ТОП-20!`
      );
    }
    return { merged: false, granted: false, capReached: true, fallbackPoints: bonusFallback, shards: 0, res };
  }
  const nextShards = Math.max(0, Math.min(3, Number(res.shards || 0)));
  state.profile.ticketShards = nextShards;
  saveLocalV9Flags();
  syncTicketShardsUI({ pulse: nextShards > 0, justEarned: nextShards });
  if (!silent && nextShards > 0) {
    showToast(`🎟 Собрана часть билета (${nextShards} из 4)! Собери все 4 части — получишь бесплатный билет в кино!`);
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
    if (
      Number(freshProfile.premierePoints || 0) === 0 &&
      Number(freshProfile.currentLevel || 1) <= 1 &&
      Number(freshProfile.packedCount || 0) === 0 &&
      Number(freshProfile.duelsPlayed || 0) === 0
    ) {
      resetHintsShownState();
    }
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
      lastOceanRefillAt:
        !preserveProgress && !state.oceanTapper?.refilledThisVisit
          ? 0
          : Math.max(0, Number(prev.lastOceanRefillAt || 0)),
    };
    state.profile = cleanMerged;
    state.uiStage = Math.min(2, Math.max(1, Number(freshProfile.uiStage || 1)));
    saveLocalV9Flags();
    syncTicketShardsUI();
    syncDuel1x1Visibility();
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
  merged.trailerWatchedFull = Boolean(freshProfile.trailerWatchedFull || prev.trailerWatchedFull);
  merged.dailySharePoints = Math.max(0, Number(freshProfile.dailySharePoints ?? prev.dailySharePoints ?? 0));
  merged.avatarUrl = freshProfile.avatarUrl || prev.avatarUrl || '';
  if (!merged.hasBroadcastBarrel && Number(merged.packedCount || 0) <= 0) {
    merged.seedFirstPackDone = false;
  }
  merged.friendsShardAwardedCount = keptFriendsAwarded;
  merged.lastOceanRefillAt = Math.max(
    0,
    Number(prev.lastOceanRefillAt || 0),
    Number(freshProfile.lastOceanRefillAt || 0)
  );
  merged.lastSpecialKnockAt = Math.max(
    0,
    Number(prev.lastSpecialKnockAt || 0),
    Number(freshProfile.lastSpecialKnockAt || 0)
  );
  merged.friendsCount = Math.max(
    Number(prev.friendsCount || 0),
    Number(freshProfile.friendsCount || 0),
    Number(merged.friendsBrought || 0),
    merged.hasSocialConnection ? 1 : 0
  );
  if (typeof merged.lives === 'number') {
    merged.lives = capEarlyLivesIfNoRealFriends(merged.lives);
  }
  state.profile = merged;
  duelCtrl?.syncFromProfile?.(state.profile);
  saveLocalV9Flags();
  syncTicketShardsUI();
  syncDuel1x1Visibility();
  syncSuperPrizeRatingBarUI();
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
  syncTicketShardsUI();
  duelCtrl?.syncEnergyUI?.();
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
  return clean;
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

const SUPERPRIZE_UNLOCK_KEY_PREFIX = 'bochka_superprize_unlock_seen_v1:';
const SUPERPRIZE_LEVEL_KEY_PREFIX = 'bochka_superprize_level_v1:';

let lastRankRefreshAt = 0;

function syncPlayerRankBadges(rank = state.profile?.liveRank) {
  const num = Math.max(0, Math.round(Number(rank || 0)));
  if (num > 0) state.profile.liveRank = num;
  const rankStr = num > 0 ? `#${num}` : '#—';
  const duelStarVal = document.getElementById('duel-rank-star-val');
  if (duelStarVal) duelStarVal.textContent = rankStr;
  const lobbyRankVal = document.getElementById('duel-lobby-rank-val');
  if (lobbyRankVal) lobbyRankVal.textContent = rankStr;
  const topRankBadge = document.getElementById('top-rank-badge');
  if (topRankBadge) topRankBadge.textContent = rankStr;
  const modeAPos = document.getElementById('mode-a-rb-pos');
  if (modeAPos && num > 0) modeAPos.textContent = `Место: ${rankStr}`;
  const modeABtn = document.getElementById('btn-mode-a-open-leaderboard');
  if (modeABtn) modeABtn.textContent = num > 0 ? `★ ${rankStr} Рейтинг ↗` : '🏆 Рейтинг ↗';
}

async function refreshCachedPlayerRank({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRankRefreshAt < 12000) return state.profile?.liveRank || 0;
  lastRankRefreshAt = now;
  try {
    const res = await fetchPremiereLeaderboard(state.tg?.user);
    const r = Number(res?.me?.rank || 0);
    if (r > 0) syncPlayerRankBadges(r);
    return r;
  } catch {
    return 0;
  }
}

async function openSuperprizeUnlockModal() {
  const modal = document.getElementById('modal-superprize-unlock');
  const rankEl = document.getElementById('superprize-unlock-rank');
  if (!modal) return;
  const sp = computeSuperprizeProgress(
    state.profile?.premierePoints,
    state.profile?.goldenLevelsClaimed,
    state.profile?.goldenTicketShards
  );
  if (rankEl) {
    rankEl.textContent = `Уровень ${sp.displayLevel} · Золотой билет: ${sp.goldenCount}/12 · Считаем твоё место...`;
  }
  modal.removeAttribute('hidden');
  try {
    const lb = await fetchPremiereLeaderboard(state.tg?.user);
    const me = lb?.me || {};
    const rankStr = me.rank ? `#${me.rank}` : '#—';
    if (me.rank) syncPlayerRankBadges(me.rank);
    const score = Number(me.rating_score ?? me.effective_points ?? state.profile?.premierePoints ?? 0);
    if (rankEl) {
      rankEl.textContent = `Твоё место в рейтинге: ${rankStr} · Рейтинг: ⭐ ${score.toLocaleString('ru-RU')} · Ур. ${sp.displayLevel}`;
    }
  } catch { /* keep initial text */ }
}

function checkSuperprizeTransitions({ allowModal = true } = {}) {
  const sp = computeSuperprizeProgress(
    state.profile?.premierePoints,
    state.profile?.goldenLevelsClaimed,
    state.profile?.goldenTicketShards
  );
  if (!sp.unlocked) return;
  const uid = getViewerUid(state.tg?.user) || 'anon';
  try {
    const unlockKey = `${SUPERPRIZE_UNLOCK_KEY_PREFIX}${uid}`;
    const lvlKey = `${SUPERPRIZE_LEVEL_KEY_PREFIX}${uid}`;
    const prevSeenLvl = Number(localStorage.getItem(lvlKey) || 0);
    if (!localStorage.getItem(unlockKey)) {
      if (allowModal && state.activeScreen !== 'gate') {
        localStorage.setItem(unlockKey, '1');
        localStorage.setItem(lvlKey, String(sp.displayLevel));
        openSuperprizeUnlockModal().catch(() => {});
        return;
      }
    } else if (sp.displayLevel > Math.max(2, prevSeenLvl)) {
      localStorage.setItem(lvlKey, String(sp.displayLevel));
      showToast(
        `🏆 Уровень ${sp.displayLevel} (${sp.barMax.toLocaleString('ru-RU')} ⭐)! В бочках спрятана твоя новая часть Золотого билета (${sp.superLevel}/12)!`
      );
    } else if (!prevSeenLvl) {
      localStorage.setItem(lvlKey, String(sp.displayLevel));
    }
  } catch { /* ignore storage errors */ }
}

function syncSuperPrizeRatingBarUI() {
  const pct = computeSuperPrizeRatingPct(state.profile);
  const friends = Math.max(0, Math.round(Number(state.profile?.friendsBrought || 0)));
  const pts = Math.max(0, Math.round(Number(state.profile?.premierePoints || 0)));
  const chips = Math.max(0, Math.round(Number(state.profile?.trophiesCount ?? state.profile?.chipsCount ?? 0)));
  const duelsPlayed = Math.max(0, Math.round(Number(state.profile?.duelsPlayed || 0)));
  const duelsWon = Math.max(0, Math.round(Number(state.profile?.duelsWon || 0)));
  const sp = computeSuperprizeProgress(
    pts,
    state.profile?.goldenLevelsClaimed,
    state.profile?.goldenTicketShards
  );

  const hudPct = document.getElementById('hud-rating-pct');
  const hudFill = document.getElementById('hud-rating-fill');
  if (hudPct) hudPct.textContent = sp.unlocked ? `Ур.${sp.displayLevel}` : `${pct}%`;
  if (hudFill) hudFill.style.width = `${sp.unlocked ? sp.pct.toFixed(1) : pct}%`;

  const topPct = document.getElementById('top-rating-pct');
  const topFill = document.getElementById('top-rating-fill');
  if (topPct) topPct.textContent = sp.unlocked ? `Ур.${sp.displayLevel}` : `${pct}%`;
  if (topFill) topFill.style.width = `${sp.unlocked ? sp.pct.toFixed(1) : pct}%`;

  const lbPct = document.getElementById('leader-rating-pct');
  const lbFill = document.getElementById('leader-rating-fill');
  const lbBrk = document.getElementById('leader-rating-breakdown');
  if (lbPct) lbPct.textContent = sp.unlocked ? `Ур.${sp.displayLevel} ✨${sp.goldenCount}/12` : `${pct}%`;
  if (lbFill) lbFill.style.width = `${sp.unlocked ? sp.pct.toFixed(1) : pct}%`;
  if (lbBrk) {
    lbBrk.textContent = sp.unlocked
      ? `🏆 Лига Суперприза (Ур.${sp.displayLevel} · ${sp.barCur.toLocaleString('ru-RU')}/3 000 ⭐ · ✨ Золотой ${sp.goldenCount}/12) · 👥 Друзей: ${friends} · Фишек: ${chips} · ⚔️ Дуэлей: ${duelsPlayed} (${duelsWon} поб.)`
      : `👥 Друзья: ${friends} · Фишки: ${chips} · ⚔️ Дуэли: ${duelsPlayed} · ⭐ Очки: ${pts} (после 5 000 ⭐ — 12 уровней Золотого билета!)`;
  }

  const spStrip = document.getElementById('duel-superprize-strip');
  const spLabel = document.getElementById('duel-superprize-label');
  const spFill = document.getElementById('duel-superprize-fill');
  if (spStrip) spStrip.classList.toggle('is-superprize', sp.unlocked);
  if (spLabel) {
    spLabel.textContent = sp.unlocked
      ? `🏆 Ур. ${sp.displayLevel} · ${sp.barCur.toLocaleString('ru-RU')} / 3 000 ⭐ · ✨ Золотой ${sp.goldenCount}/12`
      : `До суперприза: ${pts.toLocaleString('ru-RU')} / 5 000 очков`;
  }
  if (spFill) {
    spFill.style.width = `${sp.pct.toFixed(1)}%`;
  }
  syncPlayerRankBadges(state.profile?.liveRank);
  if (state.activeScreen !== 'gate') {
    refreshCachedPlayerRank({ force: false });
  }
  checkSuperprizeTransitions({ allowModal: true });
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
  const duelBar = document.getElementById('duel-live-mini-bar');
  const duelOpen = Boolean(duelBar && !duelBar.hidden);
  const duelTargetMap = {
    ticket: 'duel-shards-pill',
    chip: 'duel-vs-player-chips',
    points: 'duel-vs-player-pts',
    rating: 'duel-vs-player-pts',
    energy: 'duel-energy-pill',
    lives: 'duel-lives-pill',
  };
  const targetId =
    type === 'strikes'
      ? 'attempts-squares'
      : type === 'air'
        ? 'hud-air-val'
        : type === 'rating' || type === 'points'
          ? 'hud-pts-pill'
          : 'hud-lives-pill';
  const duelTargetId = duelTargetMap[type] || '';
  const fallbackId =
    type === 'lives'
      ? 'top-lives-pill'
      : type === 'rating' || type === 'points'
        ? 'top-rating-pill'
        : 'nav-leaderboard';
  let targetEl = duelOpen && duelTargetId ? document.getElementById(duelTargetId) : null;
  if (!targetEl || targetEl.getBoundingClientRect().width === 0) {
    targetEl = document.getElementById(targetId);
  }
  if ((!targetEl || targetEl.getBoundingClientRect().width === 0) && duelTargetId) {
    targetEl = document.getElementById(duelTargetId);
  }
  if (!targetEl || targetEl.getBoundingClientRect().width === 0) {
    targetEl = document.getElementById(fallbackId);
  }
  const candidateRect = targetEl ? targetEl.getBoundingClientRect() : null;
  const rect = candidateRect && candidateRect.width > 0
    ? candidateRect
    : { left: window.innerWidth * 0.5, top: 28, width: 20, height: 20 };
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
  document.getElementById('hud-top-stack')?.setAttribute('hidden', '');
  document.getElementById('hud-task-banner')?.setAttribute('hidden', '');
  document.getElementById('hud-hint-text')?.setAttribute('hidden', '');
}

function formatBarrelWord(n) {
  if (n >= 5) return 'БОЧЕК';
  if (n >= 2) return 'БОЧКИ';
  return 'БОЧКА';
}

function getRealFriendsCount() {
  return Math.max(
    0,
    Math.round(
      Math.max(
        Number(state.profile?.friendsCount || 0),
        Number(state.profile?.friendsBrought || 0),
        state.profile?.hasSocialConnection ? 1 : 0
      )
    )
  );
}

let _prevDuel1x1Unlocked = null;
let _duel1x1UnlockAnnounced = false;
function syncDuel1x1Visibility({ announceUnlock = false } = {}) {
  const hasFriend = getRealFriendsCount() >= 1;
  const wasUnlocked = _prevDuel1x1Unlocked;
  _prevDuel1x1Unlocked = hasFriend;
  if (wasUnlocked === null) {
    _duel1x1UnlockAnnounced = hasFriend;
  }

  for (const id of ['btn-hud-duel-1x1', 'btn-burger-duel-1x1', 'btn-sent-duel-1x1']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    if (hasFriend) btn.removeAttribute('hidden');
    else btn.setAttribute('hidden', '');
  }
  document.body.setAttribute('data-duel-1x1-unlocked', hasFriend ? '1' : '0');

  if (hasFriend && !_duel1x1UnlockAnnounced && announceUnlock) {
    _duel1x1UnlockAnnounced = true;
    const hudBtn = document.getElementById('btn-hud-duel-1x1');
    if (hudBtn) {
      hudBtn.classList.remove('is-duel-unlock-pop');
      void hudBtn.offsetWidth;
      hudBtn.classList.add('is-duel-unlock-pop');
    }
    showToast('⚔️ Друг в игре! Открыта кнопка «Дуэль 1×1»!', { className: 'is-special-knock', durationMs: 5200 });
  }
  return hasFriend;
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
  syncDuel1x1Visibility();
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
    '🛢 ЗАКАТАТЬ ДРУГА (+3 ❤️)',
    '🔒 ЗАКАТАТЬ ДРУГА (С УР. 2)'
  );
  const sentLedger = readSentTicketsLedger().filter((x) => x.status === 'waiting_24h' || x.status === 'opened_unactivated');
  const ticketShards = Math.max(0, Math.min(3, Math.round(Number(state.profile?.ticketShards || 0))));
  setLock(
    'btn-burger-send-tickets',
    tickets <= 0 && sentLedger.length === 0,
    tickets > 0
      ? `🎟 ПОДАРИТЬ БИЛЕТ (${tickets} · ${ticketShards}/4)`
      : `🎟 БИЛЕТЫ (${sentLedger.length} · ${ticketShards}/4)`,
    `🔒 ПОДАРИТЬ БИЛЕТ (${tickets} · ${ticketShards}/4)`
  );
  setLock(
    'btn-burger-leaderboard',
    packed <= 0 && lvl <= 1,
    '🏆 РЕЙТИНГ ТОП-20',
    '🔒 РЕЙТИНГ (ПОСЛЕ 1-Й БОЧКИ)'
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
    '🥊 ИГРАТЬ С ТИЛЕМ',
    '🥊 ИГРАТЬ С ТИЛЕМ'
  );
  syncDuel1x1Visibility();
}

function openBurgerDrawer() {
  syncBurgerMenuLocks();
  document.getElementById('burger-backdrop')?.removeAttribute('hidden');
  document.getElementById('burger-drawer')?.removeAttribute('hidden');
  document.getElementById('btn-burger-menu')?.setAttribute('aria-expanded', 'true');
}

function armWorkshopClickGuard(ms = 360) {
  state._workshopClickGuardUntil = Math.max(Number(state._workshopClickGuardUntil || 0), performance.now() + ms);
}

function closeBurgerDrawer() {
  armWorkshopClickGuard(260);
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
  state.hintsShown = loadHintsShownState();
  state.uiStage = getStoredUiStage();
  loadLocalV9Flags();
  syncTicketShardsUI();
  bindUIEvents();
  if (typeof window !== 'undefined') window.__bochkaMainBound = true;
  refreshInitialSeedGateUI();
  document.getElementById('btn-enter-sound')?.removeAttribute('disabled');
  document.getElementById('btn-enter-mute')?.removeAttribute('disabled');
  applyProgressiveDisclosureUI({ forceStage: state.uiStage });
  if (typeof window !== 'undefined') {
    window.__bochkaGateReadyAt = performance.now();
    if (window.__earlyGateAction === 'sound' || window.__earlyGateAction === 'mute') {
      const wantSound = window.__earlyGateAction === 'sound';
      window.__earlyGateAction = null;
      window.setTimeout(() => enterWorkshopGate(wantSound).catch(() => {}), 0);
    } else if (window.__earlyGateAction === 'legal') {
      window.__earlyGateAction = null;
      window.setTimeout(() => openLegalModal('rules').catch(() => {}), 0);
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

  // v20.6: Асинхронная подгрузка 3D-сцены выполняется строго ПОСЛЕ нажатия входа на Шлюзе (экономия мобильного 4G трафика на старте)
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
        state._workshopClickGuardUntil = 0;
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
      getTrailerDebug: () => ({
        modalOpen: Boolean(state.trailer.modalOpen),
        introLocked: Boolean(state.trailer.introLocked),
        introWatchedSec: Number(state.trailer.introWatchedSec || 0),
        maxTime: Number(state.trailer.maxTime || 0),
        honestWatchedSec: Number(state.trailer.honestWatchedSec || 0),
        prevVkTime: Number(state.trailer.prevVkTime || 0),
        wallClockSec: Number(state.trailer.wallClockSec || 0),
        vkReady: Boolean(state.trailer.vkReady),
        vkState: String(state.trailer.vkState || ''),
        vkTime: Number(state.trailer.vkTime || 0),
        vkDuration: Number(state.trailer.vkDuration || 91.8),
        vkMuted: Boolean(state.trailer.vkMuted),
        vkVolume: Number(state.trailer.vkVolume ?? 1),
        vkAutoplaySoundBlocked: Boolean(state.trailer.vkAutoplaySoundBlocked),
        trailerWatchedFull: Boolean(state.profile?.trailerWatchedFull || state.trailer?.fullWatchRewarded),
        base30sRewarded: Boolean(state.trailer?.base30sRewarded),
        fullWatchRewarded: Boolean(state.trailer?.fullWatchRewarded),
        antiSeekRejectedCount: Number(state.trailer?.antiSeekRejectedCount || 0),
        iframeSrc: document.getElementById('vk-trailer-iframe')?.getAttribute('src') || '',
        hasLocalVideoEl: Boolean(document.getElementById('trailer-video')),
      }),
      openDuel: (code, opts) => openDuelTable(code, opts || {}),
      startWorkshopRecoveryShift: (opts) => startWorkshopRecoveryShift(opts || {}),
      openSuperprizeUnlockModal: () => openSuperprizeUnlockModal(),
      computeSuperprizeProgress: (pts, claimed, count) => computeSuperprizeProgress(pts, claimed, count),
      triggerFirstChipHint: () => maybeShowDuelDiscoveryHint('chip'),
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
      canClaimOceanRefillToday: () => canClaimOceanRefillToday(),
      getDuelPacing: () => duelCtrl?.getPacingDebug?.() || null,
      getContextHintState: () => ({
        open: Boolean(state.contextHint?.open),
        kind: String(state.contextHint?.kind || ''),
        text: String(state.contextHint?.text || ''),
        shown: { ...state.hintsShown },
      }),
      getShareTemplateState: () => ({
        shareTemplate: state.pack.shareTemplate,
        bestEscapeSec: state.profile?.bestEscapeSec ?? null,
        preview: buildPersonalShareCopy(state.pack.shareTemplate, state.profile?.bestEscapeSec),
      }),
      syncLobbyHomescreenPillUI: (s) => syncLobbyHomescreenPillUI(s),
      claimPingPongRelayBonus: (opts) => claimPingPongRelayBonusServer(state.tg?.user, opts || {}),
      resetHints: () => {
        for (const k of Object.values(HINT_STORAGE_KEYS)) {
          try { localStorage.removeItem(k); } catch { /* ignore */ }
        }
        state.hintsShown = {
          airDepleted: false,
          firstTicket: false,
          firstChip: false,
          firstPoints: false,
          firstEnergy: false,
          firstLife: false,
        };
      },
      getPlayerAvatar: () => getPlayerAvatarUrl(state.tg?.user),
      getRealFriendsCount: () => getRealFriendsCount(),
      getSpecialKnockState: () => ({
        lastResult: state.lastSpecialKnockResult || null,
        lastAt: Number(state.profile?.lastSpecialKnockAt || 0),
      }),
      refreshProfileAndUI: async () => {
        const prev = getRealFriendsCount();
        const p = await fetchPlayerProfile(state.tg?.user);
        if (p) {
          mergeFreshProfile(p, { preserveProgress: true });
          updatePremiereBarsUI();
          refreshHudLevelLabel();
          syncDuel1x1Visibility({ announceUnlock: prev === 0 && getRealFriendsCount() > 0 });
        }
        return { profile: state.profile, friendsCount: getRealFriendsCount() };
      },
      openTrailerModal: (opts) => openTrailerModal(opts || {}),
      getTrailerState: () => ({ ...state.trailer }),
      simulateVkTimeUpdate: (sec, dur = 91.8) => handleVkTrailerTimeProgress(Number(sec || 0), Number(dur || 91.8), false),
      triggerDefeatCinematic: (opts) => playBarrelDefeatCinematic(opts || {}),
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

  // Предзагрузка входящей вирусной бочки (?b=jakaqgx или startapp=jakaqgx) + чистый callout для дуэли / моря
  const calloutEl = document.getElementById('gate-friend-callout');
  const calloutTitle = document.getElementById('gate-friend-title');
  const calloutSub = document.getElementById('gate-friend-sub');
  const enterLabel = document.getElementById('btn-enter-sound-label') || document.querySelector('#btn-enter-sound span');

  if (state.tg?.openTilKnock && !state.incomingParam) {
    if (calloutTitle) calloutTitle.textContent = '🌊 СЕВЕРНОЕ МОРЕ · 19·97';
    if (calloutSub) calloutSub.textContent = 'На небе только и разговоров, что о море и о бочке… Тиль ждёт на берегу!';
    calloutEl?.removeAttribute('hidden');
    if (enterLabel) enterLabel.textContent = '🌊 ВЫЙТИ К МОРЮ СО ЗВУКОМ';
  } else if (state.tg?.duelRoomParam) {
    if (calloutTitle) calloutTitle.textContent = '⚔️ ТЕБЯ ВЫЗВАЛИ В ДУЭЛЬ 1 НА 1!';
    if (calloutSub) calloutSub.textContent = 'Заходи за стол — только двое, кто быстрее собьёт крышку бочки на счёт три!';
    calloutEl?.removeAttribute('hidden');
    if (enterLabel) enterLabel.textContent = '⚔️ ЗАЙТИ ЗА СТОЛ 1×1 СО ЗВУКОМ';
  }

  if (state.incomingParam) {
    loadBarrelPack(state.incomingParam).then((pack) => {
      state.incomingPack = pack;
      if (!state.entered && pack?.senderName && getTeamSeedRole() !== 'prod') {
        if (!pack.isBroadcast) {
          if (calloutTitle) calloutTitle.textContent = `🛢 Тебя закрыл ${pack.senderName}!`;
          if (calloutSub) calloutSub.textContent = 'Выберись за 30 сек и закрой его в ответ (со звуком или в тишине).';
          if (enterLabel && !getTeamSeedRole()) {
            enterLabel.textContent = '▶ Выбраться и закрыть в ответ';
          }
        } else {
          if (calloutTitle) calloutTitle.textContent = `🔥 ${pack.senderName} оставил тебе бочку!`;
          if (calloutSub) calloutSub.textContent = 'Выберись за 30 сек и забери шанс на 2 билета в кино в ТВОЁМ городе.';
          if (enterLabel && !getTeamSeedRole()) {
            enterLabel.textContent = '🎧 Найти бочку со звуком';
          }
        }
        calloutEl?.removeAttribute('hidden');
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
  // v19.0: Трейлер работает через VK Видео (РФ без VPN) — YouTube API на старте НЕ прогреваем!
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

  if (state.tg?.teamSeedRole === 'prod' && !state.incomingPassId) {
    state.entered = true;
    applySeedPackModeUI(true);
    showScreen('pack');
    showToast('🎬 Нажми кнопку ниже — сразу получишь общую ссылку для друзей и подписчиков!');
  }

  const bootHydratePromise = Promise.allSettled([
    fetchPlayerProfile(state.tg?.user).then((prof) => {
      mergeFreshProfile(prof, { preserveProgress: false });
      if (earlyRole) {
        state.profile.isSeedAdmin = true;
        if (earlyRole === 'blog') state.profile.isBloggerSeed = true;
      }
    }),
    earlyTrafficPromise,
    earlyTeamPromise,
    earlyBroadcastAssignPromise,
  ]).then(async () => {
    refreshInitialSeedGateUI();
    recordPlayerMeta(state.tg?.user).catch(() => {});
    if (state.tg?.duelRoomParam) {
      await syncUiStage(state.tg?.user, 4);
      applyProgressiveDisclosureUI({ forceStage: 4 });
    } else {
      applyProgressiveDisclosureUI();
    }
    updatePremiereBarsUI();
    syncX2BoostHudUI();
    refreshBranchBattleUI().catch(() => {});
    refreshQuestUI().catch(() => {});
  });

  initLiveFriendFeedbackMonitor();

  // Автооткрытие трейлера по прямой ссылке (?trailer=1&ref=...)
  if (state.tg.trailerAutoOpen) {
    openTrailerModal({ forRescue: false });
  }

  // Только для gift_ / duel_ ждём гидратацию профиля (до 4.5с), остальной вход 100% мгновенный!
  if (state.incomingPassId) {
    await Promise.race([bootHydratePromise, new Promise((r) => window.setTimeout(r, 4500))]);
    await openIncomingPassScreen(state.incomingPassId);
  } else if (state.tg?.duelRoomParam) {
    await Promise.race([bootHydratePromise, new Promise((r) => window.setTimeout(r, 3500))]);
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
  const el = document.getElementById('hud-hint-text');
  if (el) {
    el.setAttribute('hidden', '');
    el.textContent = '';
  }
}

let workshopIntroHintTimer = null;
let workshopIntroFadeTimer = null;
let workshopIntroPulseTimer = null;

function clearWorkshopIntroPulse() {
  if (workshopIntroPulseTimer) {
    clearTimeout(workshopIntroPulseTimer);
    workshopIntroPulseTimer = null;
  }
  document.querySelector('.hud-slim-o2')?.classList.remove('is-intro-pulse');
  document.querySelector('.hud-slim-airbar')?.classList.remove('is-intro-pulse');
}

function hideWorkshopIntroHint(immediate = false) {
  if (workshopIntroHintTimer) {
    clearTimeout(workshopIntroHintTimer);
    workshopIntroHintTimer = null;
  }
  if (workshopIntroFadeTimer) {
    clearTimeout(workshopIntroFadeTimer);
    workshopIntroFadeTimer = null;
  }
  clearWorkshopIntroPulse();
  const el = document.getElementById('workshop-intro-hint');
  if (!el) return;
  if (immediate || el.hasAttribute('hidden')) {
    el.classList.remove('is-fading');
    el.setAttribute('hidden', '');
    return;
  }
  el.classList.add('is-fading');
  workshopIntroFadeTimer = window.setTimeout(() => {
    workshopIntroFadeTimer = null;
    el.classList.remove('is-fading');
    el.setAttribute('hidden', '');
  }, 360);
}

function showWorkshopIntroHint({ targetKind = 'human', durationMs = 4600 } = {}) {
  if (duelCtrl?.isActive || state.watchingBarrelId) {
    hideWorkshopIntroHint(true);
    return;
  }
  const toastEl = document.getElementById('toast');
  if (toastEl && !toastEl.hasAttribute('hidden')) {
    hideWorkshopIntroHint(true);
    return;
  }
  const el = document.getElementById('workshop-intro-hint');
  const goalEl = document.getElementById('workshop-intro-goal');
  const subEl = document.getElementById('workshop-intro-sub');
  if (!el || !goalEl || !subEl) return;

  if (workshopIntroHintTimer) {
    clearTimeout(workshopIntroHintTimer);
    workshopIntroHintTimer = null;
  }
  if (workshopIntroFadeTimer) {
    clearTimeout(workshopIntroFadeTimer);
    workshopIntroFadeTimer = null;
  }
  clearWorkshopIntroPulse();

  if (targetKind === 'human') {
    goalEl.textContent = 'Найди друга в бочке!';
  } else if (targetKind === 'empty') {
    goalEl.textContent = 'Найди пустую бочку!';
  } else {
    goalEl.textContent = 'Найди нужную бочку!';
  }

  const isTouch = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches || window.innerWidth <= 768);
  subEl.textContent = !audio.enabled
    ? '🔇 Тихий радар: коснись светящейся бочки и лови вибрацию!'
    : isTouch
      ? 'Зажми палец на бочке — лови пульс-радар и звук (работает и в тишине!)'
      : 'Зажми или наведи на бочку — лови пульс-радар и звук (работает и в тишине!)';

  el.classList.remove('is-fading');
  el.removeAttribute('hidden');

  document.querySelector('.hud-slim-o2')?.classList.add('is-intro-pulse');
  document.querySelector('.hud-slim-airbar')?.classList.add('is-intro-pulse');
  workshopIntroPulseTimer = window.setTimeout(clearWorkshopIntroPulse, 3000);

  workshopIntroHintTimer = window.setTimeout(() => {
    workshopIntroHintTimer = null;
    hideWorkshopIntroHint(false);
  }, durationMs);
}

let lifeLostPillTimer = null;
function showLifeLostPill(durationMs = 1750, dmg = 1) {
  const pill = document.getElementById('life-lost-pill');
  if (!pill) return;
  const d = Math.max(1, Math.round(Number(dmg) || 1));
  pill.textContent = d > 1
    ? `-${d} ❤️ (${d === 2 ? 'минус 2 жизни' : d === 3 ? 'минус 3 жизни' : `минус ${d} жизней`})`
    : '-1 ❤️ (Потерял жизнь)';
  pill.removeAttribute('hidden');
  pill.classList.remove('is-pop');
  void pill.offsetWidth;
  pill.classList.add('is-pop');
  if (lifeLostPillTimer) clearTimeout(lifeLostPillTimer);
  lifeLostPillTimer = window.setTimeout(() => {
    pill.setAttribute('hidden', '');
    pill.classList.remove('is-pop');
  }, durationMs);
}

function showContextHintModal({
  kind,
  icon = '',
  text = '',
  what = '',
  gives = '',
  where = '',
  spotlightId = '',
  buttonText = 'Понял',
  highlightAir = false,
  onClose = null,
} = {}) {
  const modal = document.getElementById('modal-context-hint');
  const txtEl = document.getElementById('context-hint-text');
  const btnEl = document.getElementById('btn-context-hint-ok');
  const arrowEl = document.getElementById('context-hint-arrow');
  const iconEl = document.getElementById('context-hint-icon');
  const structEl = document.getElementById('context-hint-structured');
  const whatEl = document.getElementById('context-hint-what');
  const givesEl = document.getElementById('context-hint-gives');
  const whereEl = document.getElementById('context-hint-where');
  const hudSlim = document.getElementById('hud-slim');
  if (!modal || !txtEl || !btnEl) {
    onClose?.();
    return;
  }
  document.querySelectorAll('.is-hud-spotlight').forEach((n) => n.classList.remove('is-hud-spotlight'));
  hideWorkshopIntroHint(true);

  state.contextHint = {
    open: true,
    kind: String(kind || ''),
    text: String(text || ''),
    onClose: typeof onClose === 'function' ? onClose : null,
  };

  const hasStructured = Boolean(what || gives || where);
  const normKind = String(kind || '');
  if (iconEl) {
    if (normKind === 'chip' || normKind === 'firstChip') {
      const chipIco = document.createElement('span');
      chipIco.className = 'chip-token-ico is-lg';
      chipIco.setAttribute('aria-hidden', 'true');
      iconEl.replaceChildren(chipIco);
      iconEl.removeAttribute('hidden');
    } else if (normKind === 'ticket' || normKind === 'firstTicket') {
      const stub = document.createElement('span');
      stub.className = 'ticket-stub-mini is-lg';
      stub.setAttribute('aria-hidden', 'true');
      const filled = Math.max(1, Math.min(4, Number(state.profile?.ticketShards || 1)));
      if (filled >= 4) stub.classList.add('is-complete');
      for (let q = 1; q <= 4; q++) {
        const qi = document.createElement('i');
        qi.className = q <= filled ? 'shard-q is-filled' : 'shard-q';
        qi.setAttribute('data-shard', String(q));
        stub.appendChild(qi);
      }
      iconEl.replaceChildren(stub);
      iconEl.removeAttribute('hidden');
    } else if (icon) {
      iconEl.textContent = icon;
      iconEl.removeAttribute('hidden');
    } else {
      iconEl.textContent = '';
      iconEl.setAttribute('hidden', '');
    }
  }
  if (structEl && whatEl && givesEl && whereEl) {
    if (hasStructured) {
      whatEl.textContent = what;
      givesEl.textContent = gives;
      whereEl.textContent = where;
      structEl.removeAttribute('hidden');
    } else {
      structEl.setAttribute('hidden', '');
    }
  }
  txtEl.textContent = state.contextHint.text;
  if (hasStructured && !state.contextHint.text) {
    txtEl.setAttribute('hidden', '');
  } else {
    txtEl.removeAttribute('hidden');
  }
  btnEl.textContent = buttonText;
  if (arrowEl) {
    if (highlightAir) arrowEl.removeAttribute('hidden');
    else arrowEl.setAttribute('hidden', '');
  }
  hudSlim?.classList.toggle('is-hint-highlight', Boolean(highlightAir));
  document.body.classList.toggle('is-air-hint-active', Boolean(highlightAir));
  document.body.classList.toggle('is-duel-spotlight-active', Boolean(spotlightId));
  if (spotlightId) {
    document.getElementById(spotlightId)?.classList.add('is-hud-spotlight');
  }
  modal.dataset.hint = state.contextHint.kind || '';
  modal.removeAttribute('hidden');
  Haptics.light();
}

function dismissContextHintModal() {
  const modal = document.getElementById('modal-context-hint');
  const hudSlim = document.getElementById('hud-slim');
  const cur = state.contextHint || {};
  const cb = cur.onClose;
  if (cur.kind) {
    state.hintsShown[cur.kind] = true;
    persistHintShown(cur.kind);
  }
  state.contextHint = { open: false, kind: '', text: '', onClose: null };
  hudSlim?.classList.remove('is-hint-highlight');
  document.body.classList.remove('is-air-hint-active', 'is-duel-spotlight-active');
  document.querySelectorAll('.is-hud-spotlight').forEach((n) => n.classList.remove('is-hud-spotlight'));
  document.getElementById('context-hint-icon')?.setAttribute('hidden', '');
  document.getElementById('context-hint-structured')?.setAttribute('hidden', '');
  if (modal) delete modal.dataset.hint;
  document.getElementById('context-hint-arrow')?.setAttribute('hidden', '');
  modal?.setAttribute('hidden', '');
  Haptics.light();
  cb?.();
  if (Array.isArray(state.contextHintQueue) && state.contextHintQueue.length > 0) {
    const nextKind = state.contextHintQueue.shift();
    if (nextKind) {
      window.setTimeout(() => {
        maybeShowDuelDiscoveryHint(nextKind);
      }, 140);
    }
  }
}

const DUEL_DISCOVERY_CARDS = {
  ticket: {
    stateKey: 'firstTicket',
    icon: '🎟',
    text: 'Первая часть билета в кино!',
    what: 'Часть билета (1 из 4)',
    gives: 'Собери все 4 части и забери настоящий билет в кинотеатр или подари другу',
    where: 'Счётчик 🎟 в левом верхнем углу VS-панели',
    spotlightId: 'duel-shards-pill',
  },
  chip: {
    stateKey: 'firstChip',
    icon: '🪙',
    text: 'Первая фишка! Артефакты и дуэли — в меню (жми на свой аватар)',
    what: 'Коллекционная фишка (🪙)',
    gives: 'Открывает Зал славы, артефакты и дуэли 1×1 со ставкой на фишки',
    where: 'Жми на свой аватар с подписью «МЕНЮ» в левом верхнем углу',
    spotlightId: 'btn-duel-vs-avatar-menu',
  },
  points: {
    stateKey: 'firstPoints',
    icon: '⭐',
    text: 'Первые очки к суперпризу!',
    what: 'Очки суперприза (⭐)',
    gives: 'Заполняют шкалу до 5 000 очков на главный приз и рейтинг ТОП-20',
    where: 'Золотая полоса «До суперприза» прямо под VS-панелью',
    spotlightId: 'duel-superprize-strip',
  },
  energy: {
    stateKey: 'firstEnergy',
    icon: '⚡',
    text: 'Заряд энергии — это твои удары!',
    what: 'Энергия ударов (⚡)',
    gives: '+2 удара (+50 ⚡) по бочкам! С ростом уровня запас ударов растёт; пока есть энергия — можно добивать бочки',
    where: 'Жёлтая полоса ⚡ под твоей шкалой жизней',
    spotlightId: 'duel-energy-pill',
  },
  life: {
    stateKey: 'firstLife',
    icon: '❤️',
    text: 'Дополнительная жизнь в бою!',
    what: 'Запас жизни (❤️)',
    gives: 'Спасает от скримеров (-2/-3 ❤️) и держит тебя в бою дольше',
    where: 'Красная полоса ❤️ рядом с твоим аватаром',
    spotlightId: 'duel-lives-pill',
  },
};

function clearAvatarMenuHintPulse() {
  if (state._avatarCueTimer) {
    window.clearTimeout(state._avatarCueTimer);
    state._avatarCueTimer = null;
  }
  document.getElementById('btn-duel-vs-avatar-menu')?.classList.remove('is-avatar-menu-pulse');
  document.getElementById('duel-ava-menu-cue')?.setAttribute('hidden', '');
}

function triggerAvatarMenuHintPulse(durationMs = 6500) {
  clearAvatarMenuHintPulse();
  const btn = document.getElementById('btn-duel-vs-avatar-menu');
  const cue = document.getElementById('duel-ava-menu-cue');
  btn?.classList.add('is-avatar-menu-pulse');
  cue?.removeAttribute('hidden');
  state._avatarCueTimer = window.setTimeout(() => {
    clearAvatarMenuHintPulse();
  }, Math.max(1500, Number(durationMs || 6500)));
}

function maybeShowDuelDiscoveryHint(kind) {
  const spec = DUEL_DISCOVERY_CARDS[kind];
  if (!spec || state.hintsShown?.[spec.stateKey]) return false;
  if (state.contextHint?.open) {
    if (!Array.isArray(state.contextHintQueue)) state.contextHintQueue = [];
    if (state.contextHint.kind !== spec.stateKey && !state.contextHintQueue.includes(kind)) {
      state.contextHintQueue.push(kind);
    }
    return true;
  }
  const isChip = kind === 'chip';
  if (isChip) {
    document.getElementById('btn-duel-vs-avatar-menu')?.classList.add('is-avatar-menu-pulse');
  }
  showContextHintModal({
    kind: spec.stateKey,
    icon: spec.icon,
    text: spec.text,
    what: spec.what,
    gives: spec.gives,
    where: spec.where,
    spotlightId: spec.spotlightId,
    buttonText: 'Понял',
    highlightAir: false,
    onClose: isChip ? () => triggerAvatarMenuHintPulse(6500) : null,
  });
  return true;
}

const PAUSED_SCENE_SCREENS = new Set(['gate', 'tilChallenge', 'pack', 'sent', 'finale', 'pass', 'ocean']);

function syncSceneRenderPause() {
  const shouldPause =
    Boolean(state.trailer?.modalOpen) ||
    (!duelCtrl?.isActive && PAUSED_SCENE_SCREENS.has(state.activeScreen));
  scene?.setRenderPaused?.(shouldPause);
}

function showScreen(name) {
  state.activeScreen = name;
  if (name === 'workshop') armWorkshopClickGuard(260);
  if (name === 'workshop' && state._gateGhostGuard) {
    state._gateGhostGuard.until = Math.max(state._gateGhostGuard.until, performance.now() + 850);
    window.requestAnimationFrame(() => {
      if (state._gateGhostGuard) {
        state._gateGhostGuard.until = Math.max(state._gateGhostGuard.until, performance.now() + 650);
      }
    });
  }
  document.body.setAttribute('data-screen', name);
  if (name !== 'workshop') {
    hideWorkshopIntroHint(true);
    document.getElementById('workshop-recovery-bar')?.setAttribute('hidden', '');
  }
  if (name === 'ocean') {
    window.requestAnimationFrame(positionOceanToast);
  } else {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.style.top = '';
      if (['gate', 'tilChallenge', 'pack', 'sent'].includes(name)) {
        toastEl.setAttribute('hidden', '');
      }
    }
  }
  if (state.entered && ['workshop', 'tilChallenge', 'pack', 'modeA', 'finale'].includes(name)) {
    saveSessionResumeSnapshot({ lastScreen: name });
  }
  closeBurgerDrawer();
  if (name !== 'workshop') {
    document.getElementById('workshop-rescue-cta')?.setAttribute('hidden', '');
  }
  if (!document.getElementById('modal-trailer')?.hasAttribute('hidden')) {
    closeTrailerModal({ force: true });
  }
  for (const mid of ['modal-leaderboard', 'modal-share-hub', 'modal-prize', 'modal-rules', 'modal-legal']) {
    document.getElementById(mid)?.setAttribute('hidden', '');
  }
  document.getElementById('topbar')?.toggleAttribute('hidden', ['gate', 'tilChallenge', 'pack', 'sent'].includes(name));
  document.getElementById('nav-workshop')?.classList.toggle('is-active', name === 'workshop' || name === 'modeA');
  if (name === 'pack') {
    state.pack.userUploadedPhoto = false;
    state.pack.sealing = false;
    state.pack.processed = null;
    const fInput = document.getElementById('input-photo-file');
    if (fInput) fInput.value = '';
    document.getElementById('label-pack-upload-photo')?.removeAttribute('hidden');
    document.getElementById('pack-uploaded-confirm')?.setAttribute('hidden', '');
    const sendUpBtn = document.getElementById('btn-pack-send-uploaded');
    if (sendUpBtn) {
      sendUpBtn.disabled = false;
      sendUpBtn.textContent = '⚡ Отправить другу';
      sendUpBtn.setAttribute('hidden', '');
    }
    const quickBtn = document.getElementById('btn-pack-quick-1tap');
    const quickTxt = document.getElementById('btn-pack-quick-1tap-text');
    if (quickBtn) {
      quickBtn.removeAttribute('hidden');
      quickBtn.disabled = false;
    }
    if (quickTxt) quickTxt.textContent = '⚡ Отправить в 1 клик (с аватаром)';
    updatePackTemplatePreview();
    const recPackBtn = document.getElementById('btn-pack-recovery-shift');
    if (recPackBtn) {
      recPackBtn.hidden = Number(state.profile?.lives || 0) > 0;
    }
    applySeedPackModeUI(getTeamSeedRole() === 'prod' || getTeamSeedRole() === 'blog');
  }
  const ids = {
    gate: 'screen-gate',
    modeA: 'screen-mode-a',
    workshop: 'screen-workshop',
    tilChallenge: 'screen-til-challenge',
    pack: 'screen-pack',
    finale: 'screen-finale',
    sent: 'screen-sent',
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
  syncSceneRenderPause();

  if (name === 'modeA') {
    updatePremiereBarsUI();
    syncSuperPrizeRatingBarUI();
    document.getElementById('btn-mode-a-premiere')?.setAttribute('hidden', '');
    enterModeABarrelHub();
  } else {
    leaveModeABarrelHub();
    if (name === 'workshop') {
      syncSuperPrizeRatingBarUI();
    }
  }

  if (name === 'pack') {
    refreshPackFriendsStrip();
  }
  syncLobbyHomescreenPillUI(name);

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
    if (!duelCtrl?.isActive && name !== 'modeA') {
      scene?.setInteractive(false);
    }
  }
}

/**
 * v11.5: Меню-цех прямо на 2 или 3 настоящих стоящих 3D-бочках!
 * Только «ЗАКАТАТЬ ДРУГА», «ТРЕЙЛЕР ДРУГУ» (+1 ❤️ визуально) и (если есть билет) «ПОДАРИТЬ БИЛЕТ»!
 */
const MODE_A_RANK_TIERS = [
  { id: 'stalker', min: 0, label: '🛢 Сталкер', shortMin: '0', fullTitle: '🛢 СТАЛКЕР БОЧЕК' },
  { id: 'listener', min: 700, label: '🔥 Слухач', shortMin: '700', fullTitle: '🔥 МАСТЕР СЛУХА' },
  { id: 'master', min: 1500, label: '⚡ Гроза цеха', shortMin: '1.5k', fullTitle: '⚡ ГРОЗА ЦЕХА' },
  { id: 'legend', min: 5000, label: '👑 Легенда', shortMin: '5k', fullTitle: '👑 ЛЕГЕНДА ЦЕХА №19' },
];

async function renderModeARankBoard() {
  const rankTitleEl = document.getElementById('mode-a-rb-rank-title');
  const posEl = document.getElementById('mode-a-rb-pos');
  const ladderEl = document.getElementById('mode-a-rb-ladder');
  const ptsEl = document.getElementById('mode-a-rb-pts');
  const chipsEl = document.getElementById('mode-a-rb-chips');
  const friendsEl = document.getElementById('mode-a-rb-friends');
  const nextEl = document.getElementById('mode-a-rb-next');
  const leadersEl = document.getElementById('mode-a-rb-leaders');

  const rawPts = Math.max(0, Number(state.profile?.premierePoints || 0));
  const friends = Math.max(0, Number(state.profile?.friendsBrought || 0));
  const bonusPct = Math.min(5, friends) * 10;
  const effPts = Math.round(rawPts * (1 + bonusPct / 100));
  const chipsFallback = Math.max(
    Number(state.profile?.trophiesCount || 0),
    Number(document.getElementById('hub-trophies-count')?.textContent || 0)
  );
  const sp = computeSuperprizeProgress(
    rawPts,
    state.profile?.goldenLevelsClaimed,
    state.profile?.goldenTicketShards
  );

  let currentTierIdx = 0;
  for (let i = 0; i < MODE_A_RANK_TIERS.length; i++) {
    if (effPts >= MODE_A_RANK_TIERS[i].min) currentTierIdx = i;
  }
  const currentTier = MODE_A_RANK_TIERS[currentTierIdx];
  const nextTier = MODE_A_RANK_TIERS[currentTierIdx + 1] || null;

  if (rankTitleEl) rankTitleEl.textContent = sp.unlocked ? `🏆 ЛИГА УР.${sp.displayLevel}` : currentTier.fullTitle;
  if (ptsEl) ptsEl.textContent = sp.unlocked ? `${sp.barCur.toLocaleString('ru-RU')} / 3 000` : (bonusPct > 0 ? `${effPts} (+${bonusPct}%)` : String(effPts));
  if (chipsEl) chipsEl.textContent = String(chipsFallback);
  if (friendsEl) friendsEl.textContent = String(friends);
  const goldenWrapEl = document.getElementById('mode-a-rb-golden-wrap');
  const goldenValEl = document.getElementById('mode-a-rb-golden');
  if (goldenWrapEl) goldenWrapEl.hidden = !sp.unlocked;
  if (goldenValEl) goldenValEl.textContent = `${sp.goldenCount}/12`;
  syncTicketShardsUI();
  if (nextEl) {
    nextEl.textContent = sp.unlocked
      ? `Золотой билет: ${sp.goldenCount}/12 · Ур.${sp.displayLevel} (${sp.barCur}/3 000 ⭐)`
      : nextTier
        ? `До «${nextTier.label}»: ${Math.max(0, nextTier.min - effPts)} ⭐`
        : '🏆 Макс. ранг цеха!';
  }

  if (ladderEl) {
    const stepNodes = MODE_A_RANK_TIERS.map((tier, idx) => {
      const box = document.createElement('div');
      box.className = `mode-a-rb-step${idx <= currentTierIdx ? ' is-reached' : ''}${idx === currentTierIdx ? ' is-current' : ''}`;
      const strong = document.createElement('strong');
      strong.textContent = tier.label;
      const small = document.createElement('small');
      small.textContent = `${tier.shortMin} ⭐`;
      box.append(strong, small);
      return box;
    });
    ladderEl.replaceChildren(...stepNodes);
  }

  if (leadersEl && !leadersEl.childElementCount) {
    const empty = document.createElement('div');
    empty.className = 'mode-a-rb-empty';
    empty.textContent = 'Синхронизация лидеров цеха...';
    leadersEl.replaceChildren(empty);
  }

  try {
    const res = await fetchPremiereLeaderboard(state.tg?.user);
    if (state.activeScreen !== 'modeA') return;
    const myUid = getViewerUid(state.tg?.user);
    const me = res?.me || {};
    const liveEff = Number(me.effective_points ?? effPts);
    const liveBonus = Number(me.friend_bonus_pct ?? bonusPct);
    const liveFriends = Number(me.friends_brought ?? friends);
    if (me.rank) syncPlayerRankBadges(me.rank);
    if (posEl) posEl.textContent = me.rank ? `Место: #${me.rank}` : 'Место: #—';
    if (ptsEl) {
      ptsEl.textContent = sp.unlocked
        ? `${sp.barCur.toLocaleString('ru-RU')} / 3 000 ⭐ (Рейтинг ${liveEff.toLocaleString('ru-RU')})`
        : (liveBonus > 0 ? `${liveEff} (+${liveBonus}%)` : String(liveEff));
    }
    if (friendsEl) friendsEl.textContent = String(liveFriends);
    if (me.chips_count != null && chipsEl) chipsEl.textContent = String(Number(me.chips_count || 0));

    if (leadersEl) {
      const top3 = (res?.leaders || []).slice(0, 3);
      if (!top3.length) {
        const empty = document.createElement('div');
        empty.className = 'mode-a-rb-empty';
        empty.textContent = 'Стань первым в рейтинге цеха!';
        leadersEl.replaceChildren(empty);
        return;
      }
      const chips = top3.map((row, idx) => {
        const rank = Number(row.rank || idx + 1);
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
        const isMe = row.uid === myUid;
        const rowBonus = Number(row.friend_bonus_pct ?? Math.min(5, Number(row.friends_brought || 0)) * 10);
        const rowEff = Number(row.effective_points ?? Math.round(Number(row.premiere_points || 0) * (1 + rowBonus / 100)));
        const chip = document.createElement('div');
        chip.className = `mode-a-rb-leader-chip${isMe ? ' is-me' : ''}`;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'mode-a-rb-leader-name';
        nameSpan.textContent = `${medal} ${row.name || 'Узник'}${isMe ? ' (вы)' : ''}`;
        const ptsSpan = document.createElement('span');
        ptsSpan.className = 'mode-a-rb-leader-pts';
        ptsSpan.textContent = `⭐ ${rowEff}`;
        chip.append(nameSpan, ptsSpan);
        return chip;
      });
      leadersEl.replaceChildren(...chips);
    }
  } catch {
    if (leadersEl && !leadersEl.querySelector('.mode-a-rb-leader-chip')) {
      const empty = document.createElement('div');
      empty.className = 'mode-a-rb-empty';
      empty.textContent = 'Стань первым в рейтинге цеха!';
      leadersEl.replaceChildren(empty);
    }
  }
}

function leaveModeABarrelHub() {
  if (state.hubLabelRafId) {
    cancelAnimationFrame(state.hubLabelRafId);
    state.hubLabelRafId = 0;
  }
  state.hubBarrelActions = null;
  const wrap = document.getElementById('mode-a-barrel-labels');
  if (wrap) wrap.replaceChildren();
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
    wrap.replaceChildren();
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

  renderModeARankBoard().catch(() => {});

  const updatePositions = () => {
    if (state.activeScreen !== 'modeA' || !state.hubBarrelActions) return;
    const boardRect = document.getElementById('mode-a-rank-board')?.getBoundingClientRect?.();
    const maxPillY = boardRect && boardRect.height > 0 ? Math.max(150, boardRect.top - 34) : window.innerHeight - 170;
    const nodes = document.querySelectorAll('#mode-a-barrel-labels .mode-barrel-pill');
    nodes.forEach((node) => {
      const idx = Number(node.dataset.hubIdx);
      const pos = scene?.projectBarrelScreenPos?.(idx, -0.08);
      if (pos?.visible) {
        node.style.left = `${Math.round(pos.x)}px`;
        node.style.top = `${Math.min(maxPillY, Math.round(pos.y + 18))}px`;
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
function applyWriteAccessBonusToProfile(bonus) {
  if (!bonus?.granted) return false;
  const livesAdded = Math.max(0, Number(bonus.lives_added || bonus.livesAdded || 0));
  const ptsAdded = Math.max(0, Number(bonus.points_added || bonus.pointsAdded || 0));
  if (state.profile) {
    state.profile.pushOptinBonusClaimed = true;
    if (bonus.lives != null) {
      state.profile.lives = Math.max(Number(state.profile.lives || 0), Number(bonus.lives));
    } else {
      state.profile.lives = Number(state.profile.lives || 0) + livesAdded;
    }
    if (bonus.premiere_points != null) {
      state.profile.premierePoints = Math.max(Number(state.profile.premierePoints || 0), Number(bonus.premiere_points));
    } else {
      state.profile.premierePoints = Number(state.profile.premierePoints || 0) + ptsAdded;
    }
  }
  duelCtrl?.syncFromProfile?.(state.profile, { allowLivesRefill: true });
  saveLocalV9Flags();
  updatePremiereBarsUI();
  syncSuperPrizeRatingBarUI();
  return true;
}

function requestAndSyncWriteAccess({ force = false } = {}) {
  return requestTelegramWriteAccessIfNeeded({ force })
    .then(async (res) => {
      if (res && !res.skipped && !res.unsupported) {
        const allowed = Boolean(res.allowed);
        if (state.profile) {
          state.profile.tgWriteAccess = allowed;
          if (allowed) {
            state.profile.pushDeclined = false;
          } else {
            state.profile.pushDeclined = true;
          }
          saveLocalV9Flags();
          syncLobbyHomescreenPillUI();
        }
        const syncRes = await syncTelegramWriteAccess(state.tg?.user, allowed).catch(() => null);
        if (allowed && syncRes?.bonus?.granted) {
          applyWriteAccessBonusToProfile(syncRes.bonus);
        }
        return { ...res, bonus: syncRes?.bonus || null };
      }
      return res;
    })
    .catch(() => ({ ok: false, allowed: false, bonus: null }));
}

let _enteringGateLock = false;
async function enterWorkshopGate(withSound, ev = null) {
  if (ev && Number.isFinite(ev.clientX) && Number.isFinite(ev.clientY) && (ev.clientX > 0 || ev.clientY > 0)) {
    state._gateGhostGuard = { x: ev.clientX, y: ev.clientY, until: performance.now() + 1400 };
  }
  // v19.0: Синхронная разблокировка WebAudio ДО любых await — мгновенный звук на iOS/Android!
  audio.unlockSync(Boolean(withSound));
  if (withSound) audio.playSoundReadyClick?.();
  refreshSoundButtonLabel();

  if (_enteringGateLock) return;
  _enteringGateLock = true;
  const lblEl = document.getElementById('btn-enter-sound-label');
  const prevLbl = lblEl?.textContent || '';
  if (lblEl && !scene) lblEl.textContent = '⏳ ЗАГРУЖАЕМ 3D-ЦЕХ…';
  try {
    // v20.7: Не запрашиваем пуши до реальной пользы (отправка другу / рейтинг / дуэль)
    if (state.entered) {
      if (withSound) {
        await audio.unlock(true);
        refreshSoundButtonLabel();
      }
      return;
    }
    state.entered = true;
    try {
      await Promise.all([audio.unlock(withSound), ensureSceneReady()]);
    } catch (err) {
      state.entered = false;
      showToast('⏳ Загружаем 3D-цех — нажми кнопку входа ещё раз');
      return;
    }
    refreshSoundButtonLabel();

    if (state.tg?.openTilKnock && !state.incomingParam) {
      await triggerOceanEasterEggScene();
      return;
    }

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

    loadLocalV9Flags();
    const passiveRegen = applyPassiveDailyLifeAndHourlyStrikes({ silent: false });
    reconcileSentTicketsLifecycle({ silent: false });
    syncSentTicketsWithServer({ silent: false }).catch(() => {});
    syncPendingTicketsFloatingUI();
    syncBurgerMenuLocks();

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
        if (descEl) {
          descEl.textContent = `Этот друг (${routing.senderName || 'игрок'}) уже в деле! Ему теперь можно отправить только выигранный билет, а скример кинь новому другу — или рубитесь за столом Дуэлей 1×1!`;
        }
        document.getElementById('modal-repeat-duel')?.removeAttribute('hidden');
        return;
      }
      await startViralFriendRound(state.incomingPack);
    } else if (isProducerPackFirstRequired()) {
      // v14.3 Ветка А (team_prod): продюсер сразу пакует СЕБЯ 1 раз и получает одну общую ссылку pr_<id>!
      applySeedPackModeUI(true);
      showScreen('pack');
      showToast('🎬 Запакуй СЕБЯ в бочку 1 раз — получишь одну общую ссылку для всех друзей и чатов!');
    } else if (state.profile.mustSendFriendPack) {
      // v9.0: Если игрок закрыл игру на обязательной упаковке друга (Раунд 2) — возвращаем ровно на это же место!
      document.getElementById('pack-mandatory-banner')?.removeAttribute('hidden');
      showScreen('pack');
      showToast('🔒 Отправь друга в бочке, чтобы выиграть билет и продолжить на супер-приз!');
    } else {
      // v19.1: Если игрок уже упаковал друга или ушёл дальше Ур.1 — сразу открываем раунды против Тиля / Дуэль 1×1!
      const snap = passiveRegen?.snapshot || readSessionResume();
      const resumeLvl = Math.max(Number(state.profile?.currentLevel || 1), Number(snap?.currentLevel || 1));
      const alreadyPacked = Number(state.profile?.packedCount || 0) >= 1;
      if (alreadyPacked || resumeLvl >= 3) {
        await syncUiStage(state.tg?.user, 4).catch(() => {});
        applyProgressiveDisclosureUI({ forceStage: 4 });
        await openDuelTable('');
      } else {
        await startNewbieOnboardingRound();
      }
    }
  } finally {
    if (lblEl && state.activeScreen === 'gate' && prevLbl) lblEl.textContent = prevLbl;
    _enteringGateLock = false;
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
  await ensureSceneReady();
  state.trailer.shownInL1Flow = false;
  // v9.0: На Уровне 1 ВСЕГДА ровно 1 жизнь (3 удара ломом), чтобы логично открывался трейлер (+3 ❤️)!
  state.profile.lives = 1;
  const demoChars = t('demoChars');
  const pickIdx = Math.floor(Math.random() * DEMO_PORTRAITS.length);
  const charMeta = Array.isArray(demoChars) && demoChars[pickIdx]
    ? demoChars[pickIdx]
    : { name: 'ДРУГ В БОЧКЕ', quote: pickNextBarrelHeavenQuote() };

  const rawPortrait = './public/sprites/hero_boy_live.webp';
  const l1Pool = [0, 2, 3];
  const targetIndex = l1Pool[Math.floor(Math.random() * l1Pool.length)];

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

function syncWorkshopRecoveryBarUI() {
  const bar = document.getElementById('workshop-recovery-bar');
  const copyEl = document.getElementById('workshop-recovery-copy');
  const backBtn = document.getElementById('btn-recovery-back-to-til');
  if (!bar) return;
  const activeRecovery = Boolean(state.round?.isLifeRecoveryShift && state.activeScreen === 'workshop');
  if (!activeRecovery) {
    bar.setAttribute('hidden', '');
    return;
  }
  bar.removeAttribute('hidden');
  const curLives = Math.max(0, Math.round(Number(state.profile?.lives || 0)));
  if (copyEl) {
    copyEl.textContent = curLives >= 2
      ? '❤️ 2/2 жизни собраны! Возвращайся в бой к Тилю или позови друга за +6 ❤️.'
      : `Сейчас ❤️ ${curLives}/2 · найди бочку за 3 удара → +1 ❤️`;
  }
  if (backBtn) {
    if (curLives >= 1) {
      backBtn.textContent = `🥊 К Тилю (❤️ ${curLives})`;
      backBtn.removeAttribute('hidden');
    } else {
      backBtn.setAttribute('hidden', '');
    }
  }
}

async function startWorkshopRecoveryShift({ fromCancelledShare = false } = {}) {
  duelCtrl?.leaveRoom?.(false);
  state.pack.forLifeRefill = false;
  state.entered = true;
  if (fromCancelledShare) {
    try {
      const uid = getViewerUid(state.tg?.user) || 'anon';
      const k = `bochka_share_cancel_count:${uid}`;
      const next = Number(localStorage.getItem(k) || 0) + 1;
      localStorage.setItem(k, String(next));
    } catch { /* ignore */ }
  }
  await startDemoRound({ recoveryShift: true });
}

async function startDemoRound({ resumeAttempts = null, recoveryShift = false } = {}) {
  await ensureSceneReady();
  const demoChars = t('demoChars');
  const pickIdx = Math.floor(Math.random() * DEMO_PORTRAITS.length);
  const charMeta = Array.isArray(demoChars) && demoChars[pickIdx]
    ? demoChars[pickIdx]
    : { name: 'УЗНИК ЦЕХА', quote: 'Смотри «Бочку» в кино с 17 декабря.' };

  const spec = getWorkshopLevelSpec(state.profile.currentLevel || 1);
  const isRecovery = Boolean(recoveryShift);
  const barrelCount = isRecovery ? 5 : spec.barrelCount;
  // v15.4: Ур.2 (пустая бочка) -> дно с ❤️ жизнями; Ур.3+ -> ВСЕГДА кинобилет (никакого пацана в бочке на Ур.4+!)
  const isEmptyLevel = isRecovery || spec.level === 2;
  const isTicketLevel = !isRecovery && spec.level >= 3;
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
  for (let i = 0; i < barrelCount; i++) {
    if (BARREL_BATCH_CODES[i] !== '19') candidates.push(i);
  }
  const pool = candidates.length ? candidates : [0];
  const targetIndex = pool[Math.floor(Math.random() * pool.length)];

  let steamHazardIndex = -1;
  if (!isRecovery && spec.hasSteamHazard) {
    const hazardPool = pool.filter((idx) => idx !== targetIndex);
    steamHazardIndex = hazardPool.length ? hazardPool[Math.floor(Math.random() * hazardPool.length)] : -1;
  }

  audio.setSenderVoiceUrl(boyVoiceUrl);

  state.round = {
    modeType: !isRecovery && spec.level === 1 ? 'viral' : 'demo',
    isDemo: true,
    isLifeRecoveryShift: isRecovery,
    zoneId: isRecovery ? 1 : spec.zoneId,
    barrelCount,
    workshopLevel: spec.level,
    roundLives: isRecovery ? Math.max(1, Number(state.profile.lives || 0)) : (spec.level === 1 ? 1 : Math.max(1, Number(state.profile.lives || 3))),
    targetKind: isRecovery ? 'recovery_life' : (spec.targetKind || 'human'),
    taskText: isRecovery ? 'В цеху: найди бочку за 3 удара → +1 ❤️' : (spec.taskText || ''),
    isBlitz: !isRecovery && spec.isBlitz,
    blitzTargetsCleared: 0,
    targetIndex,
    steamHazardIndex,
    micBlowUsed: false,
    strikeLog: [],
    isDailyShift: false,
    dailyShiftCode: '',
    startedAtMs: performance.now(),
    attemptsLeft: resumeAttempts != null
      ? Math.max(0, Math.min(!isRecovery && spec.isBlitz ? 5 : 3, Number(resumeAttempts)))
      : (!isRecovery && spec.isBlitz ? 5 : 3),
    attemptsUsed: 0,
    rescueStage: 0,
    airLeft: isRecovery ? 28 : spec.airSec,
    running: true,
    pausedForModal: false,
    pausedForOcean: false,
    strikeBusy: false,
    survived: false,
    reactionLocked: false,
    portraitDataUrl: rawPortrait,
    voiceUrl: boyVoiceUrl,
    useBarrelFilter: true,
    message: isRecovery
      ? 'Ты в цеху: найди бочку за +1 ❤️ (или позови друга за +6 ❤️)!'
      : isLiveBoyLevel
        ? 'Спасибо, что вытащил меня из бочки! Встретимся на премьере 17 декабря!'
        : charMeta.quote,
    senderLabel: isRecovery ? 'ЖИЗНЬ НА ДНЕ БОЧКИ' : isLiveBoyLevel ? 'ПАЦАН ИЗ БОЧКИ' : charMeta.name,
    lastUrgentSec: 9,
  };

  document.getElementById('hud-mode-tag').textContent = isRecovery
    ? '⏳ ЦЕХ · 5 БОЧЕК'
    : spec.isBlitz
      ? `${spec.zoneTitle} // ⚡ БЛИЦ 12 БОЧЕК`
      : `${spec.zoneTitle} // ${spec.barrelCount} ${formatBarrelWord(spec.barrelCount)}`;
  document.getElementById('hud-urgent-title').textContent = isRecovery
    ? 'В ЦЕХУ: НАЙДИ ЖИВУЮ БОЧКУ ЗА 3 УДАРА (+1 ❤️)!'
    : spec.isBlitz
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
  syncWorkshopRecoveryBarUI();
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
    const viewerForPersonalOpen = state.tg?.user
    ? { ...state.tg.user, photoUrl: state.tg.user.photoUrl || getPlayerAvatarUrl(state.tg.user) }
    : { id: 'web_guest', name: 'Игрок', photoUrl: getPlayerAvatarUrl(null) };
  const lockRes = await claimPersonalBarrelOpen(pack.id, viewerForPersonalOpen).catch(() => null);
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
        showToast('📌 Это твоя собственная бочка — перешли её реальному другу в Telegram, чтобы открыть сборку целого билета в кино!');
      } else if (pack?.id) {
        state.profile.hasSocialConnection = true;
        state.profile.friendsCount = Math.max(1, Number(state.profile.friendsCount || 0));
        syncDuel1x1Visibility({ announceUnlock: true });
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
  const uploadedPhoto = !isAutoAvatarBarrel && pack?.photoUrl ? String(pack.photoUrl).trim() : '';
  let resolvedTgPhoto = '';
  let portraitDataUrl = uploadedPhoto;
  if (!portraitDataUrl) {
    const directTgPhoto = String(state.tg?.user?.photoUrl || '').trim();
    if (directTgPhoto) {
      resolvedTgPhoto = directTgPhoto;
      portraitDataUrl = directTgPhoto;
    } else {
      const srvPhoto = await fetchTelegramUserAvatarFallback().catch(() => '');
      if (srvPhoto) {
        resolvedTgPhoto = srvPhoto;
        portraitDataUrl = srvPhoto;
      } else {
        portraitDataUrl = pickRandomHorrorPortrait();
      }
    }
  }

  const voiceUrl = pack?.voiceUrl || '';
  await audio.setSenderVoiceUrl(voiceUrl);

  // v8.0/v20.0: Жёсткая защита от повторной отправки обычной бочки тому же другу (social_connections)
  // Не дёргаем повторно checkFriendDuplicateConnection, если этот визит уже обработан как brand-new через claimPersonalBarrelOpen
  if (pack?.senderUid && state.lastPersonalLockEvent?.ok !== true) {
    checkFriendDuplicateConnection(pack.senderUid, state.tg?.user, { senderTgId: pack?.senderTgId || '' })
      .then((dup) => {
        if (dup?.duplicate) {
          showToast(dup.message || 'Этот друг уже в деле! Ему теперь можно отправить только выигранный билет, а скример кинь новому другу.');
        }
      })
      .catch(() => {});
  }

  // Вход по ссылке друга: всегда Уровень 1 (4 бочки, 1 жизнь = 3 удара)
  state.trailer.shownInL1Flow = false;
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
    screamerType:
      pack?.screamerType && RANDOM_PACK_SCREAMERS.includes(pack.screamerType)
        ? pack.screamerType
        : pickRandomPackScreamer(),
    victimCardDataUrl: '',
    message: pack?.message || t('presetsSelf')[0],
    senderLabel: pack?.senderName ? `${t('revealFromFriend')} · ${pack.senderName}` : t('revealFromFriend'),
    lastUrgentSec: 9,
  };

  if (!uploadedPhoto && resolvedTgPhoto) {
    processPortraitToWebP(resolvedTgPhoto, pack?.frameStyle || 'flashlight')
      .then((fallbackGraded) => {
        if (fallbackGraded?.dataUrl && state.round) {
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
  clearBarrelReticleHover();
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
  showWorkshopIntroHint({ targetKind });
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

  // Первая остановка по воздуху: пауза + акцент на шкалу («Вот линия воздуха — следи за ней!» + «Понял»)
  if (!state.hintsShown.airDepleted) {
    stopAirTimer();
    audio.stopListening();
    r.running = false;
    r.pausedForModal = true;
    scene.setInteractive(false);
    updateAirHUD(0);
    showContextHintModal({
      kind: 'airDepleted',
      text: 'Вот линия воздуха — следи за ней!',
      buttonText: 'Понял',
      highlightAir: true,
      onClose: () => {
        if (state.activeScreen !== 'workshop') return;
        r.airLeft = 25.0;
        r.lastUrgentSec = 9;
        r.running = true;
        r.pausedForModal = false;
        updateAirHUD(r.airLeft);
        scene.setInteractive(true);
        startAirCountdownLoop();
      },
    });
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
      if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
      enterWorkshopTrailerPrompt();
      if (!state.trailer.shownInL1Flow) {
        state.trailer.shownInL1Flow = true;
        openTrailerModal({ forRescue: true });
      }
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

let _specialKnockBusy = false;
async function triggerSpecialKnockBonus(source = 'ocean_rhythm') {
  if (_specialKnockBusy) return null;
  _specialKnockBusy = true;
  try {
    const res = await claimSpecialKnockBonus(state.tg?.user, source).catch(() => null);
    state.lastSpecialKnockResult = res;
    if (!res) return null;
    if (res.granted) {
      state.profile.lives = Math.min(30, Math.max(1, Number(res.lives ?? (Number(state.profile?.lives || 0) + 3))));
      state.profile.lastSpecialKnockAt = Number(res.lastSpecialKnockAt || Date.now());
      duelCtrl?.syncFromProfile?.(state.profile, { allowLivesRefill: true });
      updatePremiereBarsUI();
      refreshHudLevelLabel();
      flyRewardToHud({ type: 'lives', count: 3, label: '+3 ❤️' });
      audio.playRewardChime?.();
      Haptics.success();
      showToast('Спец-стук сработал! +3 доп. жизни!', { className: 'is-special-knock', durationMs: 5200 });
    } else if (res.reason === 'special_knock_cooldown') {
      Haptics.error();
      showToast('⏳ Спец-стук уже использован за последние 24 часа — бонус не дублируется!', { durationMs: 3600 });
    }
    return res;
  } finally {
    _specialKnockBusy = false;
  }
}

/* ============================================================================
   СЕКРЕТНАЯ ПАСХАЛКА «ДОСТУЧАТЬСЯ ДО НЕБЕС»: №19 -> №97 -> 3 УДАРА + СПЕЦ-СТУК (+3 ❤️)
   ============================================================================ */
function checkSecret1997Combo(index, worldPoint, alreadyStruck) {
  if (duelCtrl?.isActive || state.watchingBarrelId) return false;
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

  // Фаза 2: после 19 -> 97 ждём 3 быстрых повторных удара строго по УЖЕ ОТКРЫТОЙ бочке (уровень 3+)
  if (c.stage === 2) {
    if (!alreadyStruck || state.uiStage <= 2) {
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

  // Секретная комбинация 19 -> 97 в цеху -> СПЕЦ-СТУК (+3 ❤️, 1 раз/24ч) и переход в фазу 2 на 3+ уровне
  if (c.stage === 1 && now - c.lastAt <= 5500 && batchCode === '97') {
    state.easterCombo = state.uiStage > 2 ? { stage: 2, lastAt: now, knocks: 0 } : { stage: 0, lastAt: 0, knocks: 0 };
    triggerSpecialKnockBonus('workshop_1997').catch(() => {});
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

let defeatCinematicActive = false;

const BARREL_CLOSER_CAST = [
  { id: 'til', name: 'Тиль', src: './public/sprites/til_avatar.webp?v=2000' },
  { id: 'father', name: 'Отец', src: './public/sprites/horror_hero_warden.webp?v=2000' },
  { id: 'mechanic', name: 'Механик', src: './public/sprites/horror_hero_mechanic.webp?v=2000' },
  { id: 'girl', name: 'Девушка', src: './public/sprites/fighter_4.webp?v=2000' },
];
let _lastBarrelCloserIdx = -1;
let _barrelClosersPreloaded = false;

function preloadBarrelClosers() {
  if (_barrelClosersPreloaded || typeof Image === 'undefined') return;
  _barrelClosersPreloaded = true;
  for (const item of BARREL_CLOSER_CAST) {
    if (!item?.src) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = item.src;
  }
}

function pickNextBarrelCloser() {
  let prev = _lastBarrelCloserIdx;
  try {
    const raw = window.localStorage?.getItem('bochka_last_closer_idx_v20');
    if (raw != null && raw !== '') prev = Number(raw);
  } catch { /* ignore */ }
  const next = Number.isFinite(prev) && prev >= 0 ? (prev + 1) % BARREL_CLOSER_CAST.length : 0;
  _lastBarrelCloserIdx = next;
  try {
    window.localStorage?.setItem('bochka_last_closer_idx_v20', String(next));
  } catch { /* ignore */ }
  return BARREL_CLOSER_CAST[next];
}

/**
 * Единая 4-актная POV-сцена поражения при 0 ❤️ (без текстовых плашек — чистый визуальный взгляд сверху и крышка):
 * 1) затягивает вниз в бочку -> 2) взгляд вверх на край круга -> 3) тяжёлая крышка захлопывается + полная темнота -> 4) «Ты на небе» или попап друга.
 */
function playBarrelDefeatCinematic({ oceanAllowed = true, roomId = '', solo = true } = {}) {
  if (defeatCinematicActive) return;
  defeatCinematicActive = true;
  if (oceanAllowed) {
    state.oceanTapper.returnDuel = { roomId: roomId || '', solo: Boolean(solo) };
  }
  stopAirTimer();
  scene?.setInteractive?.(false);
  audio.stopMuffledVoiceLoop?.();
  audio.playBarrelPullScrape?.();
  scene?.triggerBarrelPullFX?.();
  Haptics.heavy();

  const overlay = document.getElementById('barrel-trap-cinematic');
  const closerEl = document.getElementById('barrel-closer-face');
  const closer = pickNextBarrelCloser();

  if (closerEl) {
    closerEl.style.visibility = 'hidden';
    closerEl.onload = () => {
      closerEl.style.visibility = 'visible';
    };
    closerEl.onerror = () => {
      closerEl.style.visibility = 'hidden';
    };
    closerEl.alt = '';
    closerEl.removeAttribute('src');
    closerEl.src = closer.src;
    if (closerEl.complete && closerEl.naturalWidth > 0) {
      closerEl.style.visibility = 'visible';
    }
  }

  if (overlay) {
    overlay.classList.remove('is-pulling', 'is-closer-looming', 'is-lid-slammed', 'is-pitch-dark', 'is-heaven-flash');
    overlay.removeAttribute('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('is-pulling');
  }

  window.setTimeout(() => {
    overlay?.classList.add('is-closer-looming');
  }, 520);

  window.setTimeout(() => {
    audio.playLidSlamShut?.();
    Haptics.error();
    overlay?.classList.add('is-lid-slammed');
  }, 1480);

  window.setTimeout(() => {
    overlay?.classList.add('is-pitch-dark');
  }, 1880);

  const finishDelay = oceanAllowed ? 3350 : 2900;
  if (oceanAllowed) {
    window.setTimeout(() => {
      overlay?.classList.add('is-heaven-flash');
    }, 2320);
  }

  window.setTimeout(() => {
    overlay?.classList.remove('is-pulling', 'is-closer-looming', 'is-lid-slammed', 'is-pitch-dark', 'is-heaven-flash');
    overlay?.setAttribute('hidden', '');
    defeatCinematicActive = false;
    duelCtrl?.leaveRoom?.(false);
    if (oceanAllowed) {
      triggerOceanEasterEggScene();
    } else {
      const trappedModal = document.getElementById('modal-barrel-trapped');
      trappedModal?.removeAttribute('hidden');
    }
  }, finishDelay);
}

/**
 * Пункт 9: Массовая рассылка (8с антиспам, 15/день): +2 ❤️ каждый раз + +50 ⭐ (до 750 ⭐/день).
 */
async function applyShareBonusReward({ showFeedback = true } = {}) {
  const bonus = await claimShareBonusLife(state.tg?.user).catch(() => null);
  if (!bonus) return null;
  if (typeof bonus.lives === 'number') {
    state.profile.lives = Math.max(0, bonus.lives);
  }
  if (typeof bonus.premierePoints === 'number') {
    state.profile.premierePoints = Math.max(0, bonus.premierePoints);
  }
  if (typeof bonus.rawSharesToday === 'number') {
    state.profile.rawSharesToday = bonus.rawSharesToday;
  }
  if (typeof bonus.dailySharePoints === 'number') {
    state.profile.dailySharePoints = bonus.dailySharePoints;
  }
  if (duelCtrl) {
    duelCtrl.syncFromProfile?.(state.profile, { allowLivesRefill: true });
  }
  updatePremiereBarsUI();
  syncSuperPrizeRatingBarUI();

  if (showFeedback) {
    if (bonus.granted) {
      const lAdd = Number(bonus.livesAdded || 2);
      const pAdd = Number(bonus.pointsAdded || 0);
      if (pAdd > 0) {
        showToast(`🛢 +${lAdd} ❤️ и +${pAdd} ⭐ за рассылку (${bonus.rawSharesToday || 1}/${bonus.dailyLimit || 15})!`);
      } else if (bonus.pointsCapped) {
        showToast(`❤️ +${lAdd} жизни за рассылку! Дневной лимит +750 ⭐ взят — за нового друга ещё +500 ⭐ и +6 ❤️.`);
      } else {
        showToast(`❤️ +${lAdd} жизни за рассылку (${bonus.rawSharesToday || 1}/${bonus.dailyLimit || 15})!`);
      }
      audio.playRewardChime?.();
      Haptics.success();
    } else if (bonus.reason === 'share_cooldown' || bonus.reason === 'cooldown') {
      const wait = Math.max(1, Number(bonus.retryAfterSec || 8));
      showToast(`⏳ Подожди ${wait} сек перед следующей наградой за рассылку.`);
    } else if (bonus.reason === 'daily_limit' || bonus.reason === 'daily_limit_reached' || bonus.capped) {
      showToast(`🛡 Дневной лимит ${bonus.dailyLimit || 15} отправок исчерпан — зови нового друга открыть бочку (+500 ⭐ и +6 ❤️)!`);
    }
  }
  return bonus;
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
    rhythmTimes: [],
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
  if (backBtn) {
    if (Number(state.profile?.lives || 0) > 0) {
      backBtn.textContent = '← В ЦЕХ';
      backBtn.removeAttribute('hidden');
    } else {
      backBtn.setAttribute('hidden', '');
    }
  }
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

  // Секретный ритмический «Спец-стук» на море: 3 быстрых удара -> пауза -> 2 быстрых удара (+3 ❤️, 1 раз/24ч)
  const rArr = Array.isArray(state.oceanTapper.rhythmTimes) ? state.oceanTapper.rhythmTimes : [];
  rArr.push(now);
  if (rArr.length > 8) rArr.shift();
  state.oceanTapper.rhythmTimes = rArr;
  if (rArr.length >= 5) {
    const [t0, t1, t2, t3, t4] = rArr.slice(-5);
    const burst1 = (t1 - t0) <= 480 && (t2 - t1) <= 480;
    const midPause = (t3 - t2) >= 450 && (t3 - t2) <= 2200;
    const burst2 = (t4 - t3) <= 480;
    if (burst1 && midPause && burst2) {
      state.oceanTapper.rhythmTimes = [];
      audio.playStrike(2);
      Haptics.heavy();
      triggerSpecialKnockBonus('ocean_rhythm').catch(() => {});
    }
  }

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
  const refillAllowed = canClaimOceanRefillToday();
  state.oceanTapper.refilledThisVisit = refillAllowed;
  const countEl = document.getElementById('ocean-tap-count');
  const fillEl = document.getElementById('ocean-tap-fill');
  const subEl = document.getElementById('ocean-pulse-sub');
  const pill = document.getElementById('ocean-bonus-pill');
  const promptEl = document.getElementById('ocean-tap-prompt');

  if (countEl) countEl.textContent = '100';
  if (fillEl) fillEl.style.width = '100%';
  if (refillAllowed) {
    if (subEl) subEl.textContent = '⚡ 100% ПРОБИТО! ТИЛЬ ЗАРЯДИЛ 6 ❤️ НА ДУЭЛЬ И +3 ❤️ В ЦЕХ!';
    if (pill) {
      pill.removeAttribute('hidden');
      pill.textContent = '⚡ ТИЛЬ ЗАРЯДИЛ 100% ПУЛЬСА И 6 ❤️ НА ДУЭЛЬ! Поделись открыткой с рейтингом или жми «← В ЦЕХ»!';
    }
    if (promptEl) {
      promptEl.textContent = '⚡ 100% ПУЛЬСА ПРОБИТО! 6 ❤️ ЗАРЯЖЕНО!';
    }
  } else {
    if (subEl) subEl.textContent = '🌊 100% ПРОБИТО! Море уже заряжало жизни за последние 24 часа — закатай друга за +6 ❤️!';
    if (pill) {
      pill.removeAttribute('hidden');
      pill.textContent = '⏳ Пополнение жизней от моря — строго 1 раз в 24 часа. Чтобы получить +6 ❤️ сейчас, закатай нового друга!';
    }
    if (promptEl) {
      promptEl.textContent = '⏳ ЛИМИТ МОРЯ (1 РАЗ / 24 Ч) — ПОПОЛНИ ❤️ ЧЕРЕЗ ДРУГА!';
    }
  }
  const backBtn = document.getElementById('btn-ocean-back');
  if (backBtn) {
    backBtn.textContent = !refillAllowed
      ? '🛢 ЗАКАТАТЬ ДРУГА (+6 ❤️)'
      : state.oceanTapper.returnDuel
        ? '⚡ В ДУЭЛЬ (6 ❤️)'
        : '← В ЦЕХ (+3 ❤️)';
    backBtn.removeAttribute('hidden');
  }
  Haptics.success();

  if (refillAllowed) {
    state.profile.lastOceanRefillAt = Date.now();
    saveLocalV9Flags();
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
  } else {
    showToast('⏳ Пополнение жизней от моря доступно 1 раз в 24 часа — закатай друга за +6 ❤️!');
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
  const refillAllowed = Boolean(state.oceanTapper.refilledThisVisit || canClaimOceanRefillToday());
  if (refillAllowed && (state.oceanTapper.running || (!state.profile.easterEggClaimed && state.oceanTapper.taps === 0))) {
    state.oceanTapper.running = false;
    state.profile.lastOceanRefillAt = Date.now();
    saveLocalV9Flags();
    const reward = await claimOceanTapperReward(state.tg?.user, Math.max(1, state.oceanTapper.taps));
    state.profile.easterEggClaimed = true;
    if (typeof reward.lives === 'number') state.profile.lives = reward.lives;
    if (reward.hasPendingTicket || reward.giftAwarded) state.profile.hasPendingTicket = true;
    updatePremiereBarsUI();
  } else {
    state.oceanTapper.running = false;
  }

  audio.stopOceanEasterEggAudio();

  if (!state.oceanTapper.refilledThisVisit && !canClaimOceanRefillToday() && state.oceanTapper.taps > 0) {
    state.oceanTapper.returnDuel = null;
    state.pack.forLifeRefill = true;
    showScreen('pack');
    return;
  }

  if (state.oceanTapper.returnDuel) {
    const rd = state.oceanTapper.returnDuel;
    state.oceanTapper.returnDuel = null;
    await openDuelTable(rd.roomId || '', { autoStartSoloTil: Boolean(rd.solo) });
    if (state.oceanTapper.refilledThisVisit) {
      duelCtrl?.refillFromTil?.();
      if (rd.solo) {
        showToast('🌊 Тиль зарядил 6 ❤️ жизней и ⚡ 100% энергии — снова в Дуэль за 🎟 билетами!');
      }
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
let _hoverBarrelIdx = -1;
let _hoverStartedAt = 0;
let _hoverHintTimer = null;
let _hoverLastPos = { sx: 0, sy: 0, alreadyStruck: false };

function clearBarrelReticleHover() {
  if (_hoverHintTimer) {
    clearTimeout(_hoverHintTimer);
    _hoverHintTimer = null;
  }
  _hoverBarrelIdx = -1;
  _hoverStartedAt = 0;
  const reticle = document.getElementById('barrel-reticle');
  if (reticle) {
    reticle.setAttribute('hidden', '');
    reticle.classList.remove('is-knocking', 'is-radar-human', 'is-radar-empty', 'is-radar-ticket', 'is-radar-trap');
  }
}

function handleBarrelHover(index, sx, sy, alreadyStruck) {
  const reticle = document.getElementById('barrel-reticle');
  const retId = document.getElementById('reticle-id');

  if (duelCtrl?.isActive) {
    const canListen = !state.watchingBarrelId && (duelCtrl.phase === 'countdown' || duelCtrl.phase === 'claim');
    if (!canListen || index < 0 || alreadyStruck) {
      clearBarrelReticleHover();
      audio.stopListening();
      return;
    }
    if (index !== _hoverBarrelIdx) {
      if (_hoverHintTimer) {
        clearTimeout(_hoverHintTimer);
        _hoverHintTimer = null;
      }
      _hoverBarrelIdx = index;
      _hoverStartedAt = performance.now();
      _hoverHintTimer = window.setTimeout(() => {
        _hoverHintTimer = null;
        if (_hoverBarrelIdx === index && duelCtrl?.isActive) {
          handleBarrelHover(index, _hoverLastPos.sx, _hoverLastPos.sy, _hoverLastPos.alreadyStruck);
        }
      }, 400);
    }
    _hoverLastPos = { sx, sy, alreadyStruck: Boolean(alreadyStruck) };
    audio.setListeningBarrel(index);
    if (reticle && retId) {
      const bCode = BARREL_BATCH_CODES[index] || `0${index + 1}`;
      reticle.removeAttribute('hidden');
      reticle.style.left = `${Math.max(78, Math.min(window.innerWidth - 78, sx))}px`;
      reticle.style.top = `${Math.max(96, Math.min(window.innerHeight - 90, sy))}px`;
      reticle.classList.remove('is-radar-human', 'is-radar-empty', 'is-radar-ticket', 'is-radar-trap');
      reticle.classList.add('is-knocking');
      const dwellMs = performance.now() - _hoverStartedAt;
      if (dwellMs >= 380) {
        const lKind = String(duelCtrl.barrelLoot?.[index]?.kind || 'empty');
        if (['ticket', 'golden_shard', 'friend_barrel'].includes(lKind)) {
          reticle.classList.add('is-radar-ticket');
          retId.textContent = `№${bCode} // 🎟 ЖИВОЙ СТУК`;
        } else if (['chip', 'life', 'energy'].includes(lKind)) {
          reticle.classList.add('is-radar-ticket');
          retId.textContent = `№${bCode} // ⚡ ЗВОН (БОНУС)`;
        } else if (lKind === 'screamer') {
          reticle.classList.add('is-radar-trap');
          retId.textContent = `№${bCode} // ⚠️ СКРЕЖЕТ`;
        } else {
          reticle.classList.add('is-radar-empty');
          retId.textContent = `№${bCode} // 💨 ГЛУХО`;
        }
      } else {
        retId.textContent = `№${bCode} // 👂 СЛУШАЮ...`;
      }
    }
    return;
  }

  if (state.watchingBarrelId || !state.round.running || state.round.pausedForModal || index < 0) {
    clearBarrelReticleHover();
    audio.stopListening();
    return;
  }

  _hoverLastPos = { sx, sy, alreadyStruck: Boolean(alreadyStruck) };
  if (index !== _hoverBarrelIdx) {
    if (_hoverHintTimer) {
      clearTimeout(_hoverHintTimer);
      _hoverHintTimer = null;
    }
    _hoverBarrelIdx = index;
    _hoverStartedAt = performance.now();
    if (reticle) {
      reticle.setAttribute('hidden', '');
      reticle.classList.remove('is-knocking', 'is-radar-human', 'is-radar-empty', 'is-radar-ticket', 'is-radar-trap');
    }
    if (!alreadyStruck) {
      _hoverHintTimer = window.setTimeout(() => {
        _hoverHintTimer = null;
        if (_hoverBarrelIdx === index && state.round.running && !state.round.pausedForModal && !duelCtrl?.isActive) {
          handleBarrelHover(index, _hoverLastPos.sx, _hoverLastPos.sy, _hoverLastPos.alreadyStruck);
        }
      }, audio.enabled ? 860 : 560);
    }
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

  const dwellMs = performance.now() - _hoverStartedAt;
  if (!alreadyStruck && dwellMs >= 650) {
    hideWorkshopIntroHint(false);
  }
  const allowReticleHint = Boolean(isSteamHazard || dwellMs >= (audio.enabled ? 850 : 550));

  if (!allowReticleHint) {
    if (reticle) {
      reticle.setAttribute('hidden', '');
      reticle.classList.remove('is-knocking', 'is-radar-human', 'is-radar-empty', 'is-radar-ticket', 'is-radar-trap');
    }
    if (alreadyStruck) {
      audio.stopListening();
    } else {
      audio.setListeningBarrel(index);
    }
    return;
  }

  const isTarget = !alreadyStruck && index === state.round.targetIndex;
  const acousticHintMode = !alreadyStruck && !isSteamHazard;
  const kind = state.round.targetKind || 'human';

  if (reticle && retId) {
    reticle.removeAttribute('hidden');
    reticle.style.left = `${Math.max(78, Math.min(window.innerWidth - 78, sx))}px`;
    reticle.style.top = `${Math.max(96, Math.min(window.innerHeight - 90, sy))}px`;
    const obscured = Boolean(scene?.numbersObscured && !state.round.micBlowUsed);
    const batchNum = obscured ? '?? [ПАР]' : (BARREL_BATCH_CODES[index] || `0${index + 1}`);
    const labelBase = `${t('reticleBatch')}${batchNum}`;

    reticle.classList.remove('is-radar-human', 'is-radar-empty', 'is-radar-ticket', 'is-radar-trap', 'is-knocking');

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
    } else if (!acousticHintMode) {
      retId.textContent = `${labelBase} // ${t('reticleListening')}`;
    } else if (isTarget) {
      if (kind === 'empty') {
        reticle.classList.add('is-radar-empty');
        retId.textContent = `${labelBase} // 🕳 ПУСТОЕ ЭХО · БЕЗ ЛОВУШКИ`;
        if (canBuzz) {
          lastSilentRadarHapticAt = nowH;
          Haptics.light();
          vib([75]);
        }
      } else if (kind === 'ticket') {
        reticle.classList.add('is-radar-ticket');
        retId.textContent = `${labelBase} // 🎟 ЗВОН БИЛЕТА`;
        if (canBuzz) {
          lastSilentRadarHapticAt = nowH;
          Haptics.success();
          vib([35, 60, 35, 60, 50]);
        }
      } else {
        reticle.classList.add('is-radar-human');
        retId.textContent = `${labelBase} // 🎯 СТУК ИЗНУТРИ`;
        if (canBuzz) {
          lastSilentRadarHapticAt = nowH;
          Haptics.medium();
          vib([45, 90, 55]);
        }
      }
    } else {
      reticle.classList.add('is-radar-trap');
      retId.textContent = `${labelBase} // ⚠️ СКРЕЖЕТ / ЛОВУШКА`;
      if (canBuzz) {
        lastSilentRadarHapticAt = nowH;
        Haptics.light();
        vib([20, 30, 20]);
      }
    }

    const showPulse = Boolean(acousticHintMode && isTarget);
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
  if (bar) bar.setAttribute('hidden', '');
  document.getElementById('hud-top-stack')?.setAttribute('hidden', '');
  if (Number(level || 1) < 2) return;
  const st = await fetchTicketPoolStatus().catch(() => null);
  if (st) state.ticketPoolStatus = st;
}

async function handleBarrelStrike(index, worldPoint, pointerMeta = null) {
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
  if (_openingDuelLock || state.activeScreen !== 'workshop') return;
  if (!document.getElementById('burger-drawer')?.hasAttribute('hidden')) return;
  if (performance.now() < Number(state._workshopClickGuardUntil || 0)) return;
  if (pointerMeta && state._gateGhostGuard && performance.now() < state._gateGhostGuard.until) {
    const gx = Number(pointerMeta.clientX);
    const gy = Number(pointerMeta.clientY);
    if (Number.isFinite(gx) && Number.isFinite(gy) && Math.hypot(gx - state._gateGhostGuard.x, gy - state._gateGhostGuard.y) <= 14) {
      return;
    }
  }

  const r = state.round;
  if (!r.running || r.pausedForModal || r.strikeBusy) return;
  const barrelObj = scene.barrels[index];
  if (!barrelObj) return;

  audio.stopListening();
  clearBarrelReticleHover();
  hideWorkshopIntroHint(false);

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
  // РЕЖИМ 2: 4 БОЧКИ · ЧЕСТНЫЙ ПОИСК ДРУГА (БЕЗ СКРИПТОВАННОГО ТЕЛЕПОРТА!)
  // -------------------------------------------------------------------------
  if (r.modeType === 'viral') {
    r.attemptsUsed += 1;

    // Честное попадание в живую бочку (или добор 4-й оставшейся бочки после трейлера) -> ПОБЕДА И НЫРОК!
    if (index === r.targetIndex || r.rescueStage >= 4 || r.attemptsUsed >= 4) {
      r.targetIndex = index;
      r.attemptsLeft = Math.max(0, 3 - r.attemptsUsed);
      renderAttemptSquares(r.attemptsLeft, 3);
      scene.assignTargetBarrelNow(index);
      scene.triggerStrikeFX(index, worldPoint);
      audio.playStrike(index);
      r.strikeLog.push(`[Удар ${r.attemptsUsed}: Спас за ${elapsedSec} сек]`);
      state.watchChannel?.send('strike', { barrelIndex: index, rescued: true, hitTarget: true });
      finishRound(true, { diveBarrelIndex: index, hitTarget: true });
      return;
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
        if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
        enterWorkshopTrailerPrompt();
        if (!state.trailer.shownInL1Flow) {
          state.trailer.shownInL1Flow = true;
          openTrailerModal({ forRescue: true });
        }
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

function triggerMiniScreamer(explicitVariant = null, durationMsOverride = null, lifeLossDmg = 1) {
  const isLevel1Intro =
    explicitVariant === null &&
    Boolean(state.round?.isDemo) &&
    Number(state.round?.workshopLevel || 1) <= 1 &&
    Number(state.profile?.currentLevel || 1) <= 1 &&
    Number(state.uiStage || 1) <= 1 &&
    !state.incomingPack;

  // Бочка друга: срабатывает ИМЕННО тот скример/страшный звук, который прилетел с бочкой (или рандомный натуральный).
  // Демо-раунды: ротация 7 кадров (4 жёстких хоррор-скримера + 3 реальных страшных героя триллера).
  const SCREAMER_KEYS = ['weld', 'lunge', 'siren_cam', 'custom_scream'];
  const isFriendRound = Boolean(state.incomingPack) && !state.round?.isDemo;
  const forcedKey = isFriendRound
    ? state.round?.screamerType || state.incomingPack?.screamerType || pickRandomPackScreamer()
    : null;
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

  // Натуральный страшный звук: из 15 реальных хоррор-дорожек (без синтетики/петухов)!
  if (forcedKey && !forcedKey.startsWith('horror_char_')) {
    audio.playFullScreamer(forcedKey, { preview: true });
  } else if (forcedKey && forcedKey.startsWith('horror_char_')) {
    audio.playMiniScreamer(Number(forcedKey.slice(-1)));
  } else {
    audio.playMiniScreamer(explicitVariant == null ? null : charAudioIdx);
  }
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
  const showMs = Number(durationMsOverride) > 300 ? Number(durationMsOverride) : 3250;
  showLifeLostPill(Math.min(2100, showMs), lifeLossDmg);
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

  const forkModal = document.getElementById('modal-golden-fork');
  forkModal?.classList.remove('is-gift-form-step');
  forkModal?.removeAttribute('hidden');
  if (forkModal) forkModal.scrollTop = 0;
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
  showToast('+3 ❤️ получены!');
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
  const isRecoveryShift = Boolean(state.round.isLifeRecoveryShift);
  const v8PointsTable = { 1: 150, 2: 150, 3: 300, 4: 350, 5: 400 };
  const elapsedRoundSec = Math.max(
    1,
    Math.min(30, Math.round(AIR_DURATION_SEC - Number(state.round.airLeft || 0)))
  );
  state.round.lastElapsedSec = elapsedRoundSec;
  if (survived && !isRecoveryShift) {
    const prevBest = Number(state.profile?.bestEscapeSec || 30);
    state.profile.bestEscapeSec = Math.max(3, Math.min(prevBest, elapsedRoundSec));
    saveLocalV9Flags();
    const mult = getActivePointsMultiplier();
    const ptsDelta = (v8PointsTable[completedLvl] || 300) * mult;
    const nextLvl = Math.max(Number(state.profile.currentLevel || 1), completedLvl + 1);
    state.profile.currentLevel = nextLvl;
    loadTrophiesMod().then((m) => m.syncUnlockedArtifactsForLevel?.(nextLvl)).catch(() => {});
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
          if (typeof res.lives === 'number') {
            state.profile.lives = Math.max(Number(state.profile.lives || 0), capEarlyLivesIfNoRealFriends(res.lives));
          }
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
    if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
    const revIdx = typeof diveBarrelIndex === 'number' && diveBarrelIndex >= 0 ? diveBarrelIndex : state.round.targetIndex;

    if (isRecoveryShift) {
      if (survived) {
        const recRes = await claimWorkshopRecoveryLife(state.tg?.user).catch(() => null);
        if (recRes?.granted) {
          state.profile.lives = Number(recRes.lives ?? state.profile.lives ?? 1);
          state.profile.premierePoints = Number(recRes.premierePoints ?? state.profile.premierePoints ?? 0);
          duelCtrl?.syncFromProfile?.(state.profile, { allowLivesRefill: true });
          updatePremiereBarsUI();
          syncSuperPrizeRatingBarUI();
          syncWorkshopRecoveryBarUI();
          const pos = scene?.projectBarrelScreenPos?.(revIdx, 1.05);
          flyRewardToHud({
            type: 'lives',
            count: 2,
            label: '+1 ❤️',
            startX: pos?.visible ? pos.x : null,
            startY: pos?.visible ? pos.y : null,
          });
          await playRevealAvatar(1350, {
            barrelIndex: revIdx,
            isBoy: false,
            caption: `⏳ +1 ❤️ В ЦЕХУ (СЕЙЧАС ${state.profile.lives}/2 ❤️)`,
          });
          if (state.activeScreen !== 'workshop') return;
          if (state.profile.lives >= 2) {
            showToast('❤️ 2/2 жизни собраны! Возвращайся к Тилю или позови друга за +6 ❤️!');
          } else {
            showToast('⏳ +1 ❤️ получено в цеху. Следующая попытка через 5 мин или позови друга (+6 ❤️)!');
          }
        } else if (recRes?.reason === 'daily_recovery_limit') {
          showToast('⏳ Лимит на сегодня исчерпан — позови друга (+6 ❤️ и ×2 очки)!');
          state.pack.forLifeRefill = true;
          showScreen('pack');
        } else if (recRes?.reason === 'lives_ceiling_reached') {
          syncWorkshopRecoveryBarUI();
          showToast(`❤️ В цеху уже максимум (${state.profile.lives}/2 ❤️) — возвращайся к Тилю или позови друга (+6 ❤️)!`);
        } else if (recRes?.reason === 'recovery_cooldown') {
          const minsLeft = Math.max(1, Math.ceil((recRes.retryAfterSec || 300) / 60));
          showToast(`⏳ Пауза в цеху — осталось ~${minsLeft} мин. Можно позвать друга (+6 ❤️) или вернуться к Тилю!`);
        }
      } else {
        showToast('💨 Пусто! Попробуй ещё раз выбить +1 ❤️ в цеху или закатай друга (+2…+6 ❤️).');
        window.setTimeout(() => {
          if (state.activeScreen === 'workshop' && !state.round?.running && !duelCtrl?.isActive) {
            startWorkshopRecoveryShift();
          }
        }, 1250);
      }
      return;
    }

    const isBoyRescue = survived && ((completedLvl === 1 && !state.incomingPack) || completedLvl >= 4);

    // Ур.1 (входящая бочка друга или первый старт): пацан/друг вылезает -> сразу 15с трейлер (или сразу Вызов Тиля, если трейлер уже досмотрен после 3 промахов)
    const isL1FriendReveal = survived && completedLvl === 1 && (!state.round.isDemo || Boolean(state.incomingPack));
    if (isL1FriendReveal) {
      await playRevealAvatar(1800, { barrelIndex: revIdx, isBoy: isBoyRescue });
      if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
      if (state.incomingPack && !state.incomingPack.isBroadcast) {
        await populateFinaleScreen({ premiereResult: null });
        if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
        showScreen('finale');
        return;
      }
      if (!state.trailer.shownInL1Flow && Number(state.round?.rescueStage || 0) < 4) {
        state.trailer.shownInL1Flow = true;
        openTrailerModal({ forRescue: false, afterL1ToPack: true });
      } else {
        showScreen('tilChallenge');
      }
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
    if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
    if (survived && completedLvl === 1) {
      if (state.incomingPack && !state.incomingPack.isBroadcast) {
        await populateFinaleScreen({ premiereResult: null });
        if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
        showScreen('finale');
        return;
      }
      if (!state.trailer.shownInL1Flow && Number(state.round?.rescueStage || 0) < 4) {
        state.trailer.shownInL1Flow = true;
        openTrailerModal({ forRescue: false, afterL1ToPack: true });
      } else {
        showScreen('tilChallenge');
      }
      return;
    }
    await populateFinaleScreen({ premiereResult: null });
    if (state.activeScreen !== 'workshop' || duelCtrl?.isActive || _openingDuelLock) return;
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

async function handleQuick1TapPrankClick({ isPingPongRevenge = false, replyToPack = null } = {}) {
  const quickBtn = document.getElementById('btn-pack-quick-1tap');
  const quickTxt = document.getElementById('btn-pack-quick-1tap-text');
  if (state.pack.sealing || quickBtn?.disabled) return;
  if (quickTxt) quickTxt.textContent = 'Отправка…';
  try {
    state.pack.screamerType = pickRandomPackScreamer();
    await handleSealBarrelClick({ forceAutoAvatar: true, isPingPongRevenge, replyToPack });
  } finally {
    if (quickBtn) quickBtn.disabled = false;
    if (quickTxt) quickTxt.textContent = '⚡ Отправить в 1 клик (с аватаром)';
  }
}

async function handleSealBarrelClick({
  forceAutoAvatar = false,
  isPingPongRevenge = false,
  replyToPack = null,
  isRelayNewFriend = false,
} = {}) {
  if (state.pack.sealing) return;
  state.pack.sealing = true;

  const quickBtn = document.getElementById('btn-pack-quick-1tap');
  const quickTxt = document.getElementById('btn-pack-quick-1tap-text');
  const sendUpBtn = document.getElementById('btn-pack-send-uploaded');

  if (voiceRecorder?.isRecording) {
    voiceRecorder.stop();
  }

  if (quickBtn) quickBtn.disabled = true;
  if (sendUpBtn) {
    sendUpBtn.disabled = true;
    if (!sendUpBtn.hidden) sendUpBtn.textContent = 'Отправка…';
  }
  if (quickTxt && !forceAutoAvatar) quickTxt.textContent = 'Отправка…';
  audio.playWeldSeal();

  try {
    const teamRole = getTeamSeedRole();
    const isPersonalMode = Boolean(isPingPongRevenge) || Boolean(isRelayNewFriend);
    const isBroadcastPack = !isPersonalMode && (teamRole === 'prod' || teamRole === 'blog');
    const useAutoAvatar = Boolean(forceAutoAvatar) || !state.pack.userUploadedPhoto;

    if (!useAutoAvatar && !state.pack.processed) {
      await rebuildPackPortraitPreview();
    }
    const shareTpl = (isPingPongRevenge || isRelayNewFriend)
      ? 'thriller_challenge'
      : (state.pack.shareTemplate || 'thriller_challenge');
    const escapeTimeArg =
      Number(state.round?.lastElapsedSec || 0) > 0
        ? state.round.lastElapsedSec
        : (state.profile?.bestEscapeSec ?? null);
    const tplCopy = buildPersonalShareCopy(shareTpl, escapeTimeArg);
    const phrase = isPingPongRevenge
      ? `Выбрался из стальной бочки за ${tplCopy.bestSec || 12} сек и закрыл тебя в ответ — попробуешь быстрее?`
      : tplCopy.phrase;
    const randomSound = pickRandomPackScreamer();
    const broadcastPrefix = isBroadcastPack ? buildBroadcastPrefix(teamRole, state.tg?.user) : '';
    const preId = randomShortId(7);
    const linkType = isBroadcastPack ? (teamRole === 'blog' ? 'bl' : 'pr') : 'pack';
    const preShareUrl = buildTelegramStartAppUrl(`${linkType}_${preId}`);

    const [created, prepShare] = await Promise.all([
      createBarrelPack({
        shortId: preId,
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
        recordedVoice: state.pack.voice,
        isBroadcast: isBroadcastPack,
        broadcastPrefix,
      }),
      prepareNativeShareMessage({
        tgUser: state.tg?.user,
        barrelId: preId,
        linkType,
        senderName: state.tg?.user?.name || '',
        phrase,
        shareUrl: preShareUrl,
        shareTemplate: shareTpl,
        bestSec: tplCopy.bestSec,
      }).catch(() => ({ ok: false, fallback: true, preparedMessageId: '', shareUrl: preShareUrl })),
    ]);

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
      state.profile.hasBroadcastBarrel = true;
      applySeedPackModeUI(false);
    }

    state.profile.mustSendFriendPack = false;
    saveLocalV9Flags();

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
    const fullShareText =
      teamRole === 'blog' && isBroadcastPack
        ? '🛢 Открыл бочку к выходу триллера «БОЧКА»! Попробуй найти меня за 3 удара и забери 2 билета в кино в своём городе (работает без звука):'
        : isBroadcastPack
          ? '🛢 Закрой живую бочку к триллеру «БОЧКА» (0.58 МБ, работает в метро без звука по вибро-радару) — финальный приз 2 билета в кино в твоём городе:'
          : tplCopy.shareText;
    const shareOutcome = isPingPongRevenge && replyToPack?.senderTgId
      ? { ok: true, sent: true, cancelled: false, mode: 'ping_pong_push', preparedMessageId: prepShare?.preparedMessageId || '' }
      : await openNativeTelegramShareCardWithConfirmation({
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

    if (shareOutcome?.cancelled) {
      if (wasLifeRefill || Number(state.profile?.lives || 0) <= 0) {
        showToast('❌ Отправка отменена — жизни не начислены! Подожди в цеху (+1 ❤️) или позови друга.');
        await startWorkshopRecoveryShift({ fromCancelledShare: true });
      } else {
        showToast('❌ Отправка отменена — награда начисляется только после реальной отправки другу.');
      }
      return;
    }

    state.profile.currentLevel = targetNextLevel;
    loadTrophiesMod().then((m) => m.syncUnlockedArtifactsForLevel?.(targetNextLevel)).catch(() => {});
    const prevLives = Math.max(0, Number(state.profile.lives || 0));
    const nextLives = wasLifeRefill ? prevLives : Math.max(3, prevLives);
    state.profile.lives = nextLives;

    // Instant #screen-sent UI (post-share bonus RPCs run cleanly in parallel in background!)
    state.pendingLevelStartFly = { lives: wasProducerFirstPack ? 1 : 3, strikes: 3 };
    Haptics.success();
    updatePremiereBarsUI();
    refreshHudLevelLabel();
    applyProgressiveDisclosureUI({ skipPromoteFromSocial: true });
    showSentScreen({
      wasLifeRefill,
      wasBroadcastPack: isBroadcastPack,
      broadcastRole: teamRole,
      isPingPongRevenge,
      isRelayNewFriend,
      revengeTargetName: replyToPack?.senderName || '',
      revengeBonus: isPingPongRevenge ? { granted: true } : null,
      prevRatingPct,
      packShardRes: null,
    });

    const bgTasks = [
      awardV8LevelProgress(state.tg?.user, {
        level: targetNextLevel,
        pointsDelta: 0,
        livesDelta: wasLifeRefill ? 0 : Math.max(0, nextLives - prevLives),
      }).catch(() => {}),
      syncUiStage(state.tg?.user, wasProducerFirstPack ? 1 : 3).catch(() => {}),
    ];
    if (isPingPongRevenge && replyToPack?.id) {
      bgTasks.push(
        claimPingPongRevengeBonusServer(state.tg?.user, {
          originalBarrelId: replyToPack.id,
          revengeBarrelId: created.id,
        })
          .then((res) => {
            if (res?.ok) {
              if (res.lives != null) {
                state.profile.lives = Math.max(Number(state.profile.lives || 0), Number(res.lives));
              } else if (res.granted) {
                state.profile.lives = Number(state.profile.lives || 0) + 1;
              }
              if (res.premierePoints != null) {
                state.profile.premierePoints = Math.max(Number(state.profile.premierePoints || 0), Number(res.premierePoints));
              } else if (res.granted) {
                state.profile.premierePoints = Number(state.profile.premierePoints || 0) + 200;
              }
              duelCtrl?.syncFromProfile?.(state.profile, { allowLivesRefill: true });
              updatePremiereBarsUI();
            }
          })
          .catch(() => {})
      );
    }
    if (isPingPongRevenge && replyToPack?.senderTgId) {
      bgTasks.push(
        sendRevengeClosedPush({
          targetTgId: replyToPack.senderTgId,
          revengeName: state.tg?.user?.name || 'Твой друг',
          revengeBarrelId: created.id,
        }).catch(() => {})
      );
    }
    if (shareOutcome?.sent) {
      bgTasks.push(
        applyShareBonusReward({ showFeedback: true })
          .then(() => {
            if (!isBroadcastPack) {
              return applyFirstSocialExclusive(isPingPongRevenge ? 'ping_pong_revenge' : 'first_friend_pack_sent');
            }
            return null;
          })
          .catch(() => null)
      );
    }
    if (!isBroadcastPack && Number(state.profile?.ticketShards || 0) === 0 && Number(state.profile?.pendingTicketsCount || 0) === 0) {
      bgTasks.push(
        awardTicketShard('level2_pack', { silent: false })
          .then((packShardRes) => {
            if (packShardRes?.shards > 0) {
              syncTicketShardsUI({ pulse: true, justEarned: packShardRes.shards });
            }
          })
          .catch(() => null)
      );
    }
    Promise.allSettled(bgTasks)
      .then(() => {
        updatePremiereBarsUI();
        refreshHudLevelLabel();
        refreshQuestUI().catch(() => {});
      })
      .catch(() => {});
  } finally {
    state.pack.sealing = false;
    if (quickBtn) quickBtn.disabled = false;
    if (quickTxt) quickTxt.textContent = '⚡ Отправить в 1 клик (с аватаром)';
    if (sendUpBtn) {
      sendUpBtn.disabled = false;
      sendUpBtn.textContent = '⚡ Отправить другу';
    }
  }
}

function showSentScreen({
  wasBroadcastPack = false,
  broadcastRole = '',
  isPingPongRevenge = false,
  isRelayNewFriend = false,
  revengeTargetName = '',
  revengeBonus = null,
} = {}) {
  const txt = document.getElementById('sent-text');
  const btnTxt = document.getElementById('btn-sent-play-text');
  const copyBtn = document.getElementById('btn-sent-copy-link');
  const blogInvBtn = document.getElementById('btn-sent-copy-blogger-invite');
  const seedMetaEl = document.getElementById('sent-seed-meta');
  const tilPlayAva = document.getElementById('sent-play-til-ava');

  if (copyBtn) {
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
      seedMetaEl.textContent = `Ссылка (${pref}_1..∞): ${state.pack.lastShareUrl}`;
      seedMetaEl.removeAttribute('hidden');
    } else {
      seedMetaEl.setAttribute('hidden', '');
    }
  }
  tilPlayAva?.removeAttribute('hidden');
  if (wasBroadcastPack) {
    const isBlog = broadcastRole === 'blog';
    if (txt) {
      txt.textContent = isBlog
        ? 'Общая ссылка для Stories и канала готова!'
        : 'Общая ссылка готова! Дальше играй с Тилем.';
    }
    if (btnTxt) btnTxt.textContent = isBlog ? 'Играть' : 'Поиграть в цех';
  } else if (isRelayNewFriend) {
    if (txt) txt.textContent = '🚀 Эстафетная бочка улетела новому другу! Как только он откроет её — сразу упадут +300 ⭐ и откроется сборка целого билета.';
    if (btnTxt) btnTxt.textContent = 'Играть (×2 очки)';
  } else if (isPingPongRevenge) {
    const revBonusTxt = revengeBonus?.granted ? ' (+1 ❤️ и +200 ⭐ уже начислены!)' : '';
    if (txt) txt.textContent = `🔥 Ответная бочка улетела ${revengeTargetName || 'другу'}!${revBonusTxt} Активен буст ×2 очков на 15 мин.`;
    if (btnTxt) btnTxt.textContent = 'Играть (×2 очки)';
  } else {
    if (txt) txt.textContent = '🔥 Вызов в стальную бочку отправлен! За 1-го друга открыты редкая фишка, сборка целого билета в кино и ×2 очки на 15 мин!';
    if (btnTxt) btnTxt.textContent = 'Играть';
  }
  refreshBranchBattleUI().catch(() => {});
  const relayCard = document.getElementById('sent-relay-card');
  const relayCopy = document.getElementById('sent-relay-copy');
  const targetLabel = String(revengeTargetName || state.incomingPack?.senderName || '').trim() || 'друга';
  const safeTargetLabel = targetLabel.replace(/[<>&"]/g, '');
  if (relayCard) {
    if (isPingPongRevenge && !isRelayNewFriend && !wasBroadcastPack && !state.profile?.relayBonusClaimed) {
      if (relayCopy) {
        relayCopy.innerHTML = `🔥 Ответка улетела! Закрой ещё 1 нового друга (не <strong>${safeTargetLabel}</strong>) — получишь <strong>+300 ⭐</strong> и откроешь <strong>сборку целого билета</strong>.`;
      }
      relayCard.removeAttribute('hidden');
    } else {
      relayCard.setAttribute('hidden', '');
    }
  }
  const pushCard = document.getElementById('sent-push-optin-card');
  const pushCopy = document.getElementById('sent-push-optin-copy');
  if (pushCopy) {
    const labelForPush = String(revengeTargetName || state.incomingPack?.senderName || '').trim() || 'друг';
    pushCopy.innerHTML = `🔔 Узнай в ту же секунду, когда <strong>${labelForPush.replace(/[<>&"]/g, '')}</strong> откроет твою бочку или отомстит! За включение сразу <strong>+1 ❤️ и +150 ⭐</strong> (без рекламы).`;
  }
  if (state.profile?.tgWriteAccess || wasBroadcastPack) {
    pushCard?.setAttribute('hidden', '');
  } else {
    pushCard?.removeAttribute('hidden');
    requestAndSyncWriteAccess({ force: false }).then((res) => {
      if (res?.allowed) {
        pushCard?.setAttribute('hidden', '');
      } else if (res && !res.skipped && !res.unsupported && res.allowed === false) {
        // v20.10: Не показываем попап; ставим pushDeclined для тихой плашки в лобби
        pushCard?.setAttribute('hidden', '');
      }
    }).catch(() => {});
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
  state.pack.shareLifeClaimedForUrl = state.pack.lastShareUrl;
  await applyShareBonusReward({ showFeedback: true });
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
    state.pack.userUploadedPhoto = true;
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
  const playFurtherBtn = $('btn-finale-play-further');

  $('finale-cinema-feedback-box')?.setAttribute('hidden', '');
  $('finale-ticket-win-box')?.setAttribute('hidden', '');
  document.querySelector('#screen-finale .finale-sheet')?.classList.remove('is-ticket-mode');
  packBtn?.classList.remove('btn-revenge-hero');
  playFurtherBtn?.setAttribute('hidden', '');
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
  } else if (completedLvl === 1 && state.incomingPack && !state.incomingPack.isBroadcast) {
    state.finaleMode = 'ping_pong_revenge';
    const sender = state.incomingPack.senderName || 'друга';
    const sec = Math.max(1, Math.round(Number(r.lastElapsedSec || 12)));
    if (nextEl) {
      nextEl.textContent =
        `Ты выбрался из бочки ${sender} за ${sec} сек! Отправь ответку в 1 тап — сразу получишь +1 ❤️, +200 ⭐, редкую фишку и буст ×2 очков.`;
    }
    if (packText) packText.textContent = `🔥 ЗАКРЫТЬ ${sender.toUpperCase()} В ОТВЕТ (+1 ❤️ И +200 ⭐)`;
    packBtn?.classList.add('btn-revenge-hero');
    cinemaBtn?.setAttribute('hidden', '');
    playFurtherBtn?.removeAttribute('hidden');
    state.finaleSecondaryTrailer = false;
  } else if (completedLvl === 1) {
    const alreadyWatchedTrailer = Boolean(state.trailer?.unlocked40 || getQuestState()?.trailerDone);
    if (!alreadyWatchedTrailer) {
      state.finaleMode = 'l1_to_trailer_then_pack';
      if (nextEl) {
        nextEl.textContent =
          'Друг найден! Посмотри официальный трейлер фильма «БОЧКА» (VK Видео) — и сразу закатай своего друга в ответную бочку!';
      }
      if (packText) packText.textContent = '🎬 СМОТРЕТЬ ТРЕЙЛЕР → ЗАКАТАТЬ ДРУГА';
    } else {
      state.finaleMode = 'l1_to_pack';
      if (nextEl) {
        nextEl.textContent =
          'Друг найден! Теперь быстро закатай своего друга в бочку — дальше все раунды идут против Тиля Швайгера за билеты в кино!';
      }
      if (packText) packText.textContent = '🛢 ЗАКАТАТЬ ДРУГА В БОЧКУ (+3 ❤️)';
    }
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
      const capDaily = Number(r.lastShardAward?.res?.maxDaily || 4);
      if (nextEl) nextEl.textContent = `⭐ Партия билетов на сегодня (${capDaily} шт.) разобрана — новая откроется в 00:00 МСК! За 4-й кусок начислено +500 ⭐ в гонку ТОП-20!`;
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
  packBtn?.classList.toggle('btn-temu-pulse', state.finaleMode === 'ping_pong_revenge' || state.finaleMode === 'duels_unlocked' || state.finaleMode === 'l1_reply_yes' || state.finaleMode === 'recover_lives');

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

function getEffectiveTrailerUnlockSec() {
  const dur = Number(state.trailer.vkDuration || 0);
  if (dur > 5 && dur < TRAILER_UNLOCK_SEC) {
    return Math.max(15, Math.floor(dur - 0.3));
  }
  return TRAILER_UNLOCK_SEC;
}

function clearTrailerTimers() {
  if (state.trailer.rescueSafetyTimer) {
    clearTimeout(state.trailer.rescueSafetyTimer);
    state.trailer.rescueSafetyTimer = null;
  }
  if (state.trailer.vkTimer) {
    clearInterval(state.trailer.vkTimer);
    state.trailer.vkTimer = null;
  }
}

async function grantTrailer30sBaseReward() {
  if (state.trailer.base30sRewarded || state.trailer.base30sInFlight || state.trailer.fullWatchRewarded) return;
  state.trailer.base30sInFlight = true;
  try {
    const res = await awardTicketShardServer(state.tg?.user, 'trailer_30s').catch(() => null);
    recordFunnelEvent('trailer_completions', state.tg?.user).catch(() => {});
    state.trailer.base30sRewarded = true;
    state.trailer.unlocked40 = true;

    if (res?.ok) {
      state.profile.lives = Math.max(6, Number(res.lives ?? state.profile?.lives ?? 6));
      if (res.shards != null) {
        state.profile.ticketShards = res.mergedTicket ? 0 : Math.max(0, Math.min(3, Number(res.shards)));
      }
      if (res.premierePoints != null) {
        state.profile.premierePoints = Math.max(
          Number(state.profile?.premierePoints || 0),
          Number(res.premierePoints)
        );
      }
    } else {
      state.profile.lives = Math.max(6, Number(state.profile?.lives || 0));
      const curSh = Number(state.profile?.ticketShards || 0);
      if (curSh < 2) state.profile.ticketShards = curSh + 1;
    }

    duelCtrl?.syncFromProfile?.(state.profile, { allowLivesRefill: true });
    saveLocalV9Flags();
    syncTicketShardsUI({ pulse: true });
    updatePremiereBarsUI();
    syncSuperPrizeRatingBarUI();

    syncTrailerIntroLockUI(Math.max(TRAILER_BASE_REWARD_SEC, Number(state.trailer.honestWatchedSec || 0)));
    audio.playRewardChime?.();
    Haptics.success();
  } finally {
    state.trailer.base30sInFlight = false;
  }
}

async function grantTrailer60sMidReward() {
  if (state.trailer.mid60sRewarded || state.trailer.mid60sInFlight || state.trailer.fullWatchRewarded) return;
  state.trailer.mid60sInFlight = true;
  try {
    const res = await claimTrailer60sCheckpointServer(
      state.tg?.user,
      Math.max(TRAILER_MID_REWARD_SEC, Number(state.trailer.honestWatchedSec || 0))
    ).catch(() => null);
    state.trailer.mid60sRewarded = true;
    state.profile.trailer60sRewarded = true;
    if (res?.ok && res.premierePoints != null) {
      state.profile.premierePoints = Math.max(
        Number(state.profile?.premierePoints || 0),
        Number(res.premierePoints)
      );
    } else if (res?.granted) {
      state.profile.premierePoints = Number(state.profile?.premierePoints || 0) + 100;
    }
    saveLocalV9Flags();
    updatePremiereBarsUI();
    syncSuperPrizeRatingBarUI();

    // Тихий серверный чекпоинт без «праздника» на 60с — сразу вводим в финальный обратный отсчёт до кода 19-97
    syncTrailerIntroLockUI(Math.max(TRAILER_MID_REWARD_SEC, Number(state.trailer.honestWatchedSec || 0)));
  } finally {
    state.trailer.mid60sInFlight = false;
  }
}

async function grantTrailerFullWatchReward() {
  if (state.trailer.fullWatchRewarded || state.trailer.fullWatchInFlight) return;
  state.trailer.fullWatchInFlight = true;
  try {
    const res = await awardTicketShardServer(state.tg?.user, 'trailer_full').catch(() => null);
    recordFunnelEvent('trailer_watched_full', state.tg?.user).catch(() => {});
    state.trailer.base30sRewarded = true;
    state.trailer.mid60sRewarded = true;
    state.trailer.fullWatchRewarded = true;
    state.trailer.unlocked40 = true;
    state.profile.trailerWatchedFull = true;

    if (res?.ok) {
      if (res.lives != null) {
        state.profile.lives = Math.max(Number(state.profile?.lives || 0), Number(res.lives));
      } else {
        state.profile.lives = Number(state.profile?.lives || 0) + 1;
      }
      if (res.shards != null) {
        state.profile.ticketShards = res.mergedTicket ? 0 : Math.max(0, Math.min(3, Number(res.shards)));
      }
      if (res.premierePoints != null) {
        state.profile.premierePoints = Math.max(
          Number(state.profile?.premierePoints || 0),
          Number(res.premierePoints)
        );
      }
    } else {
      state.profile.lives = Number(state.profile?.lives || 0) + 1;
      const curSh = Number(state.profile?.ticketShards || 0);
      if (curSh < 2) state.profile.ticketShards = curSh + 1;
      state.profile.premierePoints = Number(state.profile?.premierePoints || 0) + 250;
    }

    duelCtrl?.syncFromProfile?.(state.profile, { allowLivesRefill: true });
    saveLocalV9Flags();
    syncTicketShardsUI({ pulse: true });
    updatePremiereBarsUI();
    syncSuperPrizeRatingBarUI();

    audio.playRewardChime?.();
    Haptics.success();
    syncTrailerIntroLockUI(Math.max(TRAILER_INTRO_LOCK_SEC, Number(state.trailer.honestWatchedSec || 0)));
  } finally {
    state.trailer.fullWatchInFlight = false;
  }
}

function handleVkTrailerTimeProgress(curTime, vkDur = 91.8, isEnded = false) {
  if (!state.trailer.modalOpen && !isEnded) return { accepted: false, reason: 'closed' };
  const dur = Number(vkDur) > 10 ? Number(vkDur) : (Number(state.trailer.vkDuration) || 91.8);
  state.trailer.vkDuration = dur;
  const t = Math.max(0, Number(curTime) || 0);
  state.trailer.vkTime = t;

  const prev = Number(state.trailer.prevVkTime || 0);
  const nowMs = performance.now();
  const wallSec = state.trailer.lastTickWallMs ? Math.max(0.05, (nowMs - state.trailer.lastTickWallMs) / 1000) : 1.0;
  state.trailer.lastTickWallMs = nowMs;
  const delta = t - prev;

  if (prev === 0 && Number(state.trailer.honestWatchedSec || 0) === 0 && t > 3.0) {
    state.trailer.antiSeekRejectedCount = (state.trailer.antiSeekRejectedCount || 0) + 1;
    state.trailer.prevVkTime = t;
    return { accepted: false, reason: 'seek_jump', delta };
  }
  if (delta > 3.0) {
    state.trailer.antiSeekRejectedCount = (state.trailer.antiSeekRejectedCount || 0) + 1;
    state.trailer.prevVkTime = t;
    if (Date.now() - (state.trailer.lastAntiSeekToastAt || 0) > 4000) {
      state.trailer.lastAntiSeekToastAt = Date.now();
      showToast('⏪ Перемотка не засчитывается — досмотри до середины или до конца!');
    }
    return { accepted: false, reason: 'seek_jump', delta };
  }

  if (delta > 0 && delta <= 3.0) {
    const creditCap = Math.min(delta, wallSec + 1.5);
    const buckets = state.trailer.watchedBuckets || (state.trailer.watchedBuckets = {});
    const bIdx = Math.floor(t);
    const already = Number(buckets[bIdx] || 0);
    const addable = Math.max(0, Math.min(creditCap, Math.max(0, 1.05 - already)));
    if (addable > 0) {
      buckets[bIdx] = Math.min(1.05, already + addable);
      state.trailer.honestWatchedSec = Math.min(dur, Number(state.trailer.honestWatchedSec || 0) + addable);
    }
    state.trailer.maxTime = Math.max(Number(state.trailer.maxTime || 0), state.trailer.honestWatchedSec);
  }
  state.trailer.prevVkTime = t;

  const unlockThreshold = Math.max(82.6, Math.floor(dur * 0.90));
  syncTrailerIntroLockUI(Math.max(Number(state.trailer.introWatchedSec || 0), state.trailer.honestWatchedSec));
  updateTrailerProgressUI(state.trailer.honestWatchedSec, dur, unlockThreshold);

  if (
    !state.trailer.base30sRewarded &&
    !state.trailer.base30sInFlight &&
    !state.trailer.fullWatchRewarded &&
    state.trailer.honestWatchedSec >= TRAILER_BASE_REWARD_SEC
  ) {
    grantTrailer30sBaseReward();
  }

  if (
    state.trailer.base30sRewarded &&
    !state.trailer.mid60sRewarded &&
    !state.trailer.mid60sInFlight &&
    !state.trailer.fullWatchRewarded &&
    state.trailer.honestWatchedSec >= TRAILER_MID_REWARD_SEC
  ) {
    grantTrailer60sMidReward();
  }

  if (
    !state.trailer.fullWatchRewarded &&
    !state.trailer.fullWatchInFlight &&
    (state.trailer.honestWatchedSec >= unlockThreshold ||
      (isEnded && state.trailer.honestWatchedSec >= Math.max(80, Math.floor(dur * 0.87))))
  ) {
    grantTrailerFullWatchReward();
  }
  return {
    accepted: true,
    honestWatchedSec: state.trailer.honestWatchedSec,
    unlockThreshold,
    base30sRewarded: state.trailer.base30sRewarded,
    fullWatchRewarded: state.trailer.fullWatchRewarded,
  };
}

function syncTrailerStepGuideUI(watchedSec = 0, dur = 91.8) {
  const safeDur = Number(dur) > 10 ? Number(dur) : (Number(state.trailer.vkDuration) || 91.8);
  const unlockThreshold = Math.max(82.6, Math.floor(safeDur * 0.90));
  const sec = Math.max(0, Number(watchedSec || 0), Number(state.trailer.honestWatchedSec || 0));
  const toMid = Math.max(0, Math.ceil(TRAILER_BASE_REWARD_SEC - sec));
  const secToEnd = Math.max(0, Math.ceil(unlockThreshold - sec));
  const baseDone = Boolean(state.trailer.base30sRewarded || state.trailer.fullWatchRewarded);
  const fullDone = Boolean(state.trailer.fullWatchRewarded);

  document.getElementById('trailer-mark-mid')?.classList.toggle('is-done', baseDone);
  document.getElementById('trailer-mark-end')?.classList.toggle('is-done', fullDone);

  const guide = document.getElementById('trailer-motivation-copy');
  if (guide) {
    if (fullDone) {
      guide.textContent = '🏆 Трейлер досмотрен! Все призы и секретный код в цеху открыты.';
    } else if (baseDone) {
      guide.textContent = secToEnd > 0
        ? `🔥 Досмотри до конца (осталось ${secToEnd} сек) — откроется секретный код в цеху и +350 ⭐!`
        : '🔥 Почти финал — открываем секретный код и +350 ⭐!';
    } else if (sec < TRAILER_INTRO_LOCK_SEC) {
      guide.textContent = '🎬 Идёт трейлер. Досмотри до середины — получишь приз: 6 ❤️ и +250 ⭐ к билету!';
    } else {
      guide.textContent = toMid > 0
        ? `🎁 Досмотри до середины (осталось ${toMid} сек) — получишь 6 ❤️, +250 ⭐ и шаг к билету!`
        : '🎁 Середина рядом — открываем приз!';
    }
  }

  const flash = document.getElementById('trailer-reward-flash');
  if (flash) {
    if (fullDone) {
      flash.removeAttribute('hidden');
      flash.classList.remove('is-countdown', 'is-final-stretch');
      flash.classList.add('is-finale-unlocked');
      flash.textContent =
        '🏆 Главный приз твой: +350 ⭐ и +1 ❤️! Секретный код в цеху: стукни бочку №19, затем №97 (+3 ❤️)!';
    } else if (baseDone) {
      flash.removeAttribute('hidden');
      flash.classList.remove('is-finale-unlocked');
      flash.classList.add('is-countdown');
      const isFinalStretch = sec >= TRAILER_MID_REWARD_SEC;
      flash.classList.toggle('is-final-stretch', isFinalStretch);
      if (isFinalStretch) {
        flash.textContent =
          `🔥 Осталось ${secToEnd}с до конца — откроется секретный код (+3 ❤️ в цеху) и +350 ⭐!`;
      } else {
        flash.textContent =
          `✅ Приз за середину получен: +6 ❤️ и +250 ⭐! До конца и секретного кода — ${secToEnd}с`;
      }
    } else {
      flash.setAttribute('hidden', '');
      flash.classList.remove('is-countdown', 'is-final-stretch', 'is-finale-unlocked');
    }
  }
}

function syncTrailerIntroLockUI(watchedSec = 0) {
  const sec = Math.max(0, Number(watchedSec || 0));
  state.trailer.introWatchedSec = Math.max(Number(state.trailer.introWatchedSec || 0), sec);
  if (state.trailer.introLocked && state.trailer.introWatchedSec >= TRAILER_INTRO_LOCK_SEC) {
    state.trailer.introLocked = false;
  }
  const locked = Boolean(state.trailer.introLocked);
  const fullRewarded = Boolean(state.trailer.fullWatchRewarded);
  const baseRewarded = Boolean(state.trailer.base30sRewarded);
  const dur = Number(state.trailer.vkDuration) || 91.8;
  const unlockThreshold = Math.max(82.6, Math.floor(dur * 0.90));
  const watchedTotal = Math.max(sec, Number(state.trailer.honestWatchedSec || 0));
  const btnWarmupLocked = !fullRewarded && !baseRewarded && watchedTotal < TRAILER_INTRO_LOCK_SEC;
  const rem = Math.max(0, Math.ceil(TRAILER_INTRO_LOCK_SEC - watchedTotal));
  const toMid = Math.max(0, Math.ceil(TRAILER_BASE_REWARD_SEC - watchedTotal));
  const secToEnd = Math.max(0, Math.ceil(unlockThreshold - watchedTotal));

  const modal = document.getElementById('modal-trailer');
  modal?.classList.toggle('is-intro-locked', locked);
  const closeBtn = document.getElementById('btn-close-trailer');
  if (closeBtn) {
    closeBtn.disabled = locked;
    closeBtn.classList.toggle('is-rescue-locked', locked);
    if (locked || state.trailer.afterL1ToPack || state.trailer.forRescue) {
      closeBtn.setAttribute('hidden', '');
    } else {
      closeBtn.removeAttribute('hidden');
    }
  }

  const toPackBtn = document.getElementById('btn-trailer-to-pack');
  if (toPackBtn) {
    toPackBtn.removeAttribute('hidden');
    toPackBtn.disabled = Boolean((locked || btnWarmupLocked) && !fullRewarded && !baseRewarded);
    toPackBtn.classList.toggle('is-ready', !toPackBtn.disabled);
    toPackBtn.classList.toggle('is-full-reward', fullRewarded);
    toPackBtn.classList.toggle('is-mid-reward', !fullRewarded && baseRewarded);
    toPackBtn.classList.toggle('is-skip-early', !fullRewarded && !baseRewarded && !toPackBtn.disabled);
    if (fullRewarded) {
      toPackBtn.textContent = 'Забрать код 19-97 и все призы — играть!';
    } else if (baseRewarded) {
      toPackBtn.textContent = secToEnd > 0
        ? `Забрать приз и играть (до кода ${secToEnd}с)`
        : 'Конец ролика — открываем код...';
    } else if (toPackBtn.disabled) {
      toPackBtn.textContent = `Смотри трейлер... ${rem}с`;
    } else {
      toPackBtn.textContent = toMid > 0
        ? `Пропустить без приза (${toMid}с до подарка)`
        : 'Пропустить и идти дальше';
    }
  }
  syncTrailerStepGuideUI(watchedTotal, dur);
}

function destroyVkTrailerPlayerAndIframe() {
  if (state.vkPlayer) {
    try { state.vkPlayer.pause?.(); } catch { /* ignore */ }
    try { state.vkPlayer.mute?.(); } catch { /* ignore */ }
    try { state.vkPlayer.destroy?.(); } catch { /* ignore */ }
    state.vkPlayer = null;
  }
  const slot = document.getElementById('yt-fallback-slot');
  if (!slot) return;
  slot.querySelectorAll('iframe').forEach((f) => {
    f.removeAttribute('id');
    f.style.pointerEvents = 'none';
    f.style.display = 'none';
    try { f.src = 'about:blank'; } catch { /* ignore */ }
    try { f.remove(); } catch { /* ignore */ }
  });
  slot.textContent = '';
  slot.setAttribute('hidden', '');
  try { window.focus?.(); } catch { /* ignore */ }
}

function mountVkTrailerPlayer() {
  if (!state.trailer.modalOpen) return;
  const slot = document.getElementById('yt-fallback-slot');
  const customBar = document.getElementById('trailer-custom-bar');

  state.trailer.vkReady = false;
  state.trailer.vkState = '';
  state.trailer.vkTime = 0;
  state.trailer.vkDuration = 0;
  state.trailer.vkMuted = false;
  state.trailer.vkVolume = 1;
  state.trailer.vkAutoplaySoundBlocked = false;
  state.trailer.userPaused = false;
  state.trailer.wallClockSec = 0;

  if (customBar) {
    customBar.removeAttribute('hidden');
    customBar.querySelector('.trailer-progress-track')?.removeAttribute('hidden');
  }
  updateTrailerProgressUI(0, 92, TRAILER_UNLOCK_SEC);

  let bindVkPlayer = null;
  let sendInitHandshake = null;

  if (slot) {
    destroyVkTrailerPlayerAndIframe();
    slot.removeAttribute('hidden');
    const ifr = document.createElement('iframe');
    ifr.id = 'vk-trailer-iframe';
    ifr.className = 'vk-trailer-iframe';
    ifr.src = ENV.vkTrailerEmbedUrl;
    ifr.title = 'БОЧКА — официальный трейлер (VK Видео)';
    ifr.referrerPolicy = 'strict-origin-when-cross-origin';
    ifr.setAttribute('frameborder', '0');
    ifr.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
    ifr.setAttribute('allowfullscreen', '');
    ifr.setAttribute('playsinline', '');

    let wired = false;
    bindVkPlayer = () => {
      if (wired || !state.trailer.modalOpen || document.getElementById('vk-trailer-iframe') !== ifr) return;
      if (!window.VK?.VideoPlayer) return;
      wired = true;
      try {
        const player = window.VK.VideoPlayer(ifr);
        state.vkPlayer = player;
        const syncPlayerAudioState = (ev) => {
          state.trailer.vkMuted = Boolean(ev?.muted ?? player.isMuted?.());
          const v = Number(ev?.volume ?? player.getVolume?.() ?? state.trailer.vkVolume);
          if (Number.isFinite(v)) state.trailer.vkVolume = v;
          const d = Number(ev?.duration ?? player.getDuration?.() ?? 0);
          if (d > 0) state.trailer.vkDuration = d;
        };

        player.on('inited', (ev) => {
          if (!state.trailer.modalOpen || state.vkPlayer !== player) return;
          state.trailer.vkReady = true;
          state.trailer.userPaused = false;
          state.trailer.vkState = String(ev?.state || player.getState?.() || 'unstarted');
          syncPlayerAudioState(ev);
          try {
            if (!state.trailer.muted) {
              player.unmute?.();
              player.setVolume?.(1);
            } else {
              player.mute?.();
            }
            player.play?.();
          } catch { /* ignore */ }
        });

        player.on('started', (ev) => {
          if (!state.trailer.modalOpen || state.vkPlayer !== player) return;
          state.trailer.vkReady = true;
          state.trailer.userPaused = false;
          state.trailer.vkState = String(ev?.state || 'playing');
          syncPlayerAudioState(ev);
        });

        player.on('resumed', (ev) => {
          if (!state.trailer.modalOpen || state.vkPlayer !== player) return;
          state.trailer.userPaused = false;
          state.trailer.vkState = String(ev?.state || 'playing');
          syncPlayerAudioState(ev);
        });

        player.on('paused', () => {
          if (state.vkPlayer === player) {
            state.trailer.vkState = 'paused';
            state.trailer.userPaused = true;
          }
        });

        player.on('volumechange', (ev) => {
          if (state.vkPlayer === player) syncPlayerAudioState(ev);
        });

        player.on('autoplaySoundProhibited', () => {
          if (!state.trailer.modalOpen || state.vkPlayer !== player) return;
          state.trailer.vkAutoplaySoundBlocked = true;
          state.trailer.vkMuted = true;
          try {
            player.mute?.();
            player.play?.();
          } catch { /* ignore */ }
        });

        player.on('timeupdate', (ev) => {
          if (!state.trailer.modalOpen || state.vkPlayer !== player) return;
          state.trailer.vkReady = true;
          const stName = String(ev?.state ?? player.getState?.() ?? '');
          if (stName) state.trailer.vkState = stName;
          syncPlayerAudioState(ev);
          const cur = Math.max(0, Number(ev?.time ?? player.getCurrentTime?.() ?? 0));
          const dur = Number(state.trailer.vkDuration || 91.8);
          handleVkTrailerTimeProgress(cur, dur, false);
        });

        player.on('ended', (ev) => {
          if (!state.trailer.modalOpen || state.vkPlayer !== player) return;
          state.trailer.vkState = 'ended';
          const dur = Number(state.trailer.vkDuration || 91.8);
          const cur = Math.max(dur, Number(ev?.time ?? state.trailer.vkTime ?? dur));
          handleVkTrailerTimeProgress(cur, dur, true);
        });
      } catch { /* fallback wall-clock timer below guarantees unlock */ }
    };

    sendInitHandshake = () => {
      if (!state.trailer.modalOpen || document.getElementById('vk-trailer-iframe') !== ifr) return;
      try {
        ifr.contentWindow?.postMessage({ method: 'init' }, '*');
      } catch { /* ignore */ }
    };

    ifr.onload = () => {
      bindVkPlayer?.();
      sendInitHandshake?.();
    };

    slot.appendChild(ifr);
    bindVkPlayer();
  }

  if (state.trailer.vkTimer) {
    clearInterval(state.trailer.vkTimer);
    state.trailer.vkTimer = null;
  }
  let visibleWallMs = 0;
  let lastTickAt = performance.now();
  let lastInitNudgeAt = lastTickAt;
  let playRetries = 0;
  let lastPlayRetryAt = 0;
  syncTrailerIntroLockUI(0);
  updateTrailerProgressUI(0, 91.8, Math.floor(91.8 * 0.90));
  state.trailer.vkTimer = window.setInterval(() => {
    const now = performance.now();
    const dt = Math.min(500, Math.max(0, now - lastTickAt));
    lastTickAt = now;
    if (!state.trailer.modalOpen || document.hidden) return;
    visibleWallMs += dt * (state.trailer.vkReady ? 1 : 0.62);
    const wallSec = visibleWallMs / 1000;
    state.trailer.wallClockSec = wallSec;
    syncTrailerIntroLockUI(Math.max(wallSec, Number(state.trailer.honestWatchedSec || 0)));

    if (!state.trailer.vkReady && wallSec < 28 && (now - lastInitNudgeAt) >= 1000) {
      lastInitNudgeAt = now;
      bindVkPlayer?.();
      sendInitHandshake?.();
    }

    if (
      state.vkPlayer &&
      state.trailer.vkReady &&
      state.trailer.vkState === 'unstarted' &&
      !state.trailer.userPaused &&
      playRetries < 3 &&
      (now - lastPlayRetryAt) >= 1000
    ) {
      playRetries += 1;
      lastPlayRetryAt = now;
      try {
        if (!state.trailer.muted) {
          state.vkPlayer.unmute?.();
          state.vkPlayer.setVolume?.(1);
        } else {
          state.vkPlayer.mute?.();
        }
        state.vkPlayer.play?.();
      } catch { /* ignore */ }
    }

    if (state.vkPlayer && state.trailer.vkReady && state.trailer.vkState === 'playing') {
      try {
        const vkCur = Number(state.vkPlayer.getCurrentTime?.() ?? -1);
        const vkDur = Number(state.vkPlayer.getDuration?.() || state.trailer.vkDuration || 91.8);
        if (Number.isFinite(vkCur) && vkCur >= 0) {
          handleVkTrailerTimeProgress(vkCur, vkDur, false);
        }
      } catch { /* ignore */ }
    }
  }, 250);
}

/* ============================================================================
   ПЛЕЕР ТРЕЙЛЕРА: ОФИЦИАЛЬНЫЙ VK ВИДЕО (@kinoceh_bel, 91.8 СЕК)
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
      if (state.vkPlayer && typeof state.vkPlayer.pause === 'function') {
        try { state.vkPlayer.pause(); } catch { /* ignore */ }
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
        const keepLives = duelCtrl?.active ? state.profile.lives : prof.lives;
        state.profile = { ...state.profile, ...prof, lives: keepLives };
        duelCtrl?.syncFromProfile?.(state.profile);
        updatePremiereBarsUI();
        syncSuperPrizeRatingBarUI();
        refreshQuestUI();
        if (state.activeScreen === 'pack') refreshPackFriendsStrip();
      }

      if (newlyOpened.length > 0 || nextBrought > baselineFriendsBrought) {
        baselineFriendsBrought = Math.max(baselineFriendsBrought, nextBrought);
        syncDuel1x1Visibility({ announceUnlock: true });
        loadTrophiesMod().then((m) => m.fetchHallOfFame(state.tg?.user)).catch(() => {});
        const first = newlyOpened[0];
        const friendLabel = first?.friend_name || (first?.friend_username ? `@${first.friend_username}` : 'Друг');
        Haptics.success();
        showToast(
          newlyOpened.length > 0
            ? `🔥 Друг «${friendLabel}» вскрыл твою бочку! +500 ⭐, +6 ❤️ и именная «Фишка друга» в коллекции!`
            : '🔥 Твой друг зашёл в игру по бочке! +500 ⭐, +6 ❤️ и «Фишка друга»!',
          { className: 'is-special-knock', durationMs: 5200 }
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
  if (state.vkPlayer && typeof state.vkPlayer.pause === 'function') {
    try { state.vkPlayer.pause(); } catch { /* ignore */ }
  }
}

function setTrailerMuted(nextMuted = false) {
  state.trailer.muted = Boolean(nextMuted);
  if (state.vkPlayer) {
    try {
      if (state.trailer.muted) {
        state.vkPlayer.mute?.();
      } else {
        state.vkPlayer.unmute?.();
        state.vkPlayer.setVolume?.(1);
      }
    } catch { /* ignore */ }
  }
}

function openTrailerModal({ forRescue = false, afterL1ToPack = false } = {}) {
  clearTrailerTimers();
  state.trailer.modalOpen = true;
  syncSceneRenderPause();
  state.trailer.forRescue = Boolean(forRescue);
  state.trailer.afterL1ToPack = Boolean(afterL1ToPack);
  state.trailer.introLocked = Boolean(afterL1ToPack || forRescue);
  state.trailer.introWatchedSec = 0;
  state.trailer.maxTime = 0;
  state.trailer.honestWatchedSec = 0;
  state.trailer.prevVkTime = 0;
  state.trailer.lastTickWallMs = 0;
  state.trailer.watchedBuckets = {};
  state.trailer.antiSeekRejectedCount = 0;
  state.trailer.base30sInFlight = false;
  state.trailer.base30sRewarded = Boolean(state.profile?.trailerWatchedFull);
  state.trailer.mid60sInFlight = false;
  state.trailer.mid60sRewarded = Boolean(state.profile?.trailer60sRewarded || state.profile?.trailerWatchedFull);
  state.trailer.fullWatchInFlight = false;
  state.trailer.fullWatchRewarded = Boolean(state.profile?.trailerWatchedFull);
  state.trailer.externalRescueDepartedAt = 0;
  recordFunnelEvent('trailer_open', state.tg?.user).catch(() => {});

  syncTrailerStepGuideUI(state.trailer.fullWatchRewarded ? 91.8 : 0, 91.8);
  document.getElementById('btn-trailer-to-pack')?.classList.toggle('is-full-reward', Boolean(state.trailer.fullWatchRewarded));
  document.getElementById('btn-trailer-to-pack')?.removeAttribute('hidden');
  audio.stopListening();
  audio.stopMuffledVoiceLoop();
  audio.setModalAudioDuck(true);
  syncExternalLikeButtonsUI();

  const modal = document.getElementById('modal-trailer');
  const closeBtn = document.getElementById('btn-close-trailer');

  state.trailer.muted = false;

  const lockClose = Boolean(state.trailer.introLocked);
  modal?.classList.toggle('is-rescue-only', Boolean(forRescue && state.uiStage <= 2));
  modal?.classList.toggle('is-intro-locked', lockClose);
  modal?.removeAttribute('hidden');

  if (closeBtn) {
    closeBtn.classList.toggle('is-rescue-locked', lockClose);
    if (lockClose || afterL1ToPack || forRescue) closeBtn.setAttribute('hidden', '');
    else closeBtn.removeAttribute('hidden');
  }

  if (forRescue) {
    state.trailer.unlocked40 = false;
  }

  // Единственный и официальный плеер трейлера — VK Видео (91.8 сек, autoplay=1 + js_api=1, 0 МБ трафика с GitHub Pages)
  audio.stopOceanEasterEggAudio?.();
  syncTrailerIntroLockUI(0);
  mountVkTrailerPlayer();
}

function closeTrailerModal({ goToPack = false, goToTilChallenge = false, force = false } = {}) {
  if (state.trailer.introLocked && !force) return;
  armWorkshopClickGuard(260);
  const goTil = Boolean(!goToPack && (state.trailer.afterL1ToPack || goToTilChallenge));
  const goPackOnly = Boolean(goToPack);
  state.trailer.afterL1ToPack = false;
  state.trailer.introLocked = false;
  document.getElementById('btn-trailer-to-pack')?.setAttribute('hidden', '');
  state.trailer.modalOpen = false;
  if (!goTil && !goPackOnly) syncSceneRenderPause();
  state.trailer.externalRescueDepartedAt = 0;
  clearTrailerTimers();
  destroyVkTrailerPlayerAndIframe();

  const modal = document.getElementById('modal-trailer');
  modal?.classList.remove('is-rescue-only', 'is-intro-locked');
  document.getElementById('btn-close-trailer')?.classList.remove('is-rescue-locked');
  modal?.setAttribute('hidden', '');

  audio.setModalAudioDuck(false);

  if (goTil || goPackOnly) {
    recordFunnelEvent('trailer_complete', state.tg?.user).catch(() => {});
    markTrailerCompleted();
    state.trailer.unlocked40 = true;
    state.profile.mustSendFriendPack = false;
    saveLocalV9Flags();
    state.pack.forLifeRefill = false;
    window.setTimeout(() => {
      showScreen(goPackOnly ? 'pack' : 'tilChallenge');
    }, 60);
    return;
  }

  if (state.trailer.forRescue && !state.trailer.unlocked40 && state.activeScreen === 'workshop' && !state.round.running) {
    const isL1PreTrailer = state.round.modeType === 'viral' && Number(state.round.rescueStage || 0) < 4;
    if (isL1PreTrailer) {
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
  const fullDur = Math.max(15, Number(dur || state.trailer.vkDuration || 91.8));
  const target = Number(targetSec || Math.max(82.6, Math.floor(fullDur * 0.90)));
  const watched = Math.max(Number(state.trailer.honestWatchedSec || 0), Number(cur || 0));
  const pct = Math.min(100, Math.max(0, (watched / Math.max(1, target)) * 100));
  if (fill) fill.style.width = `${pct.toFixed(1)}%`;
  syncTrailerStepGuideUI(watched, fullDur);

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
  syncTrailerIntroLockUI(TRAILER_INTRO_LOCK_SEC);
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

let _openingDuelLock = false;
async function openDuelTable(roomId = '', { autoAddTestBots = false, initialMode = 'classic', prefetchedHof = null, autoStartSoloTil = false, huntFriendBarrel = false } = {}) {
  if (_openingDuelLock && !roomId) return;
  _openingDuelLock = true;
  try {
    state.entered = true;
    stopAirTimer();
    state.round.running = false;
    state.round.pausedForModal = false;
    if (state.trailer.modalOpen) closeTrailerModal({ force: true });
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.setAttribute('hidden', ''));
    closeBurgerDrawer();
    syncUiStage(state.tg?.user, 4).catch(() => {});
    applyProgressiveDisclosureUI({ forceStage: 4 });

    await Promise.all([audio.unlock(audio.enabled !== false), ensureDuelReady()]);
    refreshSoundButtonLabel();

    const cleanRoom = roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
    scene?.setRenderPaused?.(false);
    await duelCtrl?.openRoom(cleanRoom, { autoAddTestBots, initialMode, prefetchedHof, autoStartSoloTil, huntFriendBarrel });
    showScreen('duel');
  } finally {
    _openingDuelLock = false;
  }
}

async function challengeSpecificFriend1v1(friend, roomId) {
  const cleanRoom = roomId || duelCtrl?.roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  const rawUid = String(friend?.uid || '').trim();
  const targetTgId = String(
    friend?.tg_id || friend?.receiver_tg_id || friend?.friend_tg_id || (rawUid.startsWith('tg_') ? rawUid.slice(3) : '')
  ).trim();
  const friendName = String(friend?.name || friend?.receiver_name || 'Друг').trim();
  const challengerName = state.tg?.user?.name || 'Друг из Цеха';

  if (targetTgId && /^\d+$/.test(targetTgId)) {
    const res = await sendDuelChallengePush({
      targetTgId,
      challengerName,
      roomId: cleanRoom,
    }).catch(() => ({ ok: false, delivered: false }));
    if (res?.delivered) {
      Haptics.success();
      const msg = `📲 Личный пуш отправлен ${friendName} в Telegram! Ты остаёшься в игре — ждём за столом.`;
      showToast(msg);
      return { ok: true, delivered: true, message: msg };
    }
    const msg = `ℹ️ ${friendName} ещё не запускал @bochka_film_bot — нажми «👤 Вызвать друга» ниже, чтобы скинуть ссылку.`;
    showToast(msg);
    return { ok: true, delivered: false, message: msg };
  }

  const msg = `ℹ️ У ${friendName} нет активного Telegram-бота — нажми «👤 Вызвать друга» ниже, чтобы скинуть ссылку.`;
  showToast(msg);
  return { ok: true, delivered: false, message: msg };
}

/**
 * v15.2+v19.0: Автоматический пуш через бота ВСЕМ друзьям/игрокам в «БОЧКУ» (1-й зашёл -> играет 1×1, остальные в ожидании).
 */
async function pushDuelToFriends() {
  const roomId = duelCtrl?.roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  const count = duelCtrl?.players?.length || 1;
  const need = Math.max(1, 2 - count);
  const btn = document.getElementById('btn-duel-invite-third');

  if (btn?.dataset?.pushCooldown === '1') {
    showToast('⏳ Пуш уже отправлен — кто первый зайдёт, с тем и дуэль 1×1!');
    return;
  }

  const prevLabel = btn?.textContent || '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '📡 Отправляем пуш всем...';
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
        if (tid && /^\d+$/.test(tid) && tid !== myTgId) uniqueTargets.add(tid);
      }
      if (uniqueTargets.size > 0) {
        const results = await Promise.allSettled(
          Array.from(uniqueTargets).map((targetTgId) =>
            sendDuelChallengePush({
              targetTgId,
              challengerName: state.tg?.user?.name || 'Друг из цеха',
              roomId,
            })
          )
        );
        sentCount = results.filter((r) => r.status === 'fulfilled' && r.value?.delivered).length;
        totalCandidates = uniqueTargets.size;
      }
    } catch { /* ignore */ }
  }

  if (btn) btn.disabled = false;

  if (sentCount > 0) {
    Haptics.success();
    showToast(`📣 Пуш отправлен ${sentCount} игрокам! Кто первый зайдёт — сразу в дуэль 1×1, остальные в ожидании.`);
    if (btn) {
      btn.dataset.pushCooldown = '1';
      btn.textContent = `✅ Пуш отправлен (${sentCount}) · Ждём`;
      window.setTimeout(() => {
        if (!btn) return;
        delete btn.dataset.pushCooldown;
        btn.textContent = prevLabel || '📣 Вызвать любого (пуш всем)';
      }, 15000);
    }
    return;
  }

  if (btn) btn.textContent = prevLabel || '📣 Вызвать любого (пуш всем)';

  if (throttledCount > 0) {
    showToast('⏳ Пуш уже разослан минуту назад — кто первый зайдёт, с тем и дуэль 1×1!');
    return;
  }

  showToast('📡 Стол открыт для любого соперника! Кто первый зайдёт — сразу в дуэль 1×1, остальные в ожидании. Можно также нажать «👤 Вызвать друга».');
}

async function shareCurrentDuelRoom() {
  const roomId = duelCtrl?.roomId || `d_${Math.random().toString(36).slice(2, 8)}`;
  const links = buildDuelShareLinks(roomId);
  const count = duelCtrl?.players?.length || 1;
  const text =
    count >= 2
      ? '⚔️ Нас уже двое за столом «БОЧКИ»! Залетай 3-м на счёт три — цех досыплет +450 ⭐ очков ТОП-20 и шанс билета!'
      : '⚔️ Залетай за стол «НА СЧЁТ ТРИ!» в цеху «БОЧКИ»! Хватаем живые бочки синхронно за билет в кино:';

  let sharedOk = false;
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
    sharedOk = true;
  } else {
    const res = await shareNativeOrFallback({
      title: 'БОЧКА — Стол «На счёт три!»',
      text,
      url: links.tgMiniAppUrl || links.webUrl,
    });
    if (res === 'aborted') return;
    if (res === 'copied') {
      showToast('🔗 Ссылка на стол дуэли скопирована — скинь другу в Telegram!');
    }
    sharedOk = true;
  }

  if (sharedOk) {
    const shareReward = await applyShareBonusReward({ showFeedback: true }).catch(() => null);
    if (shareReward?.ok) {
      updatePremiereBarsUI();
    }
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
  if (listEl) {
    const syncTag = document.createElement('div');
    syncTag.className = 'mono-tag';
    syncTag.textContent = 'Синхронизация ТОП-10 с сервером...';
    listEl.replaceChildren(syncTag);
  }

  renderRetentionAndTransparencyPanels();
  refreshBranchBattleUI().catch(() => {});

  const res = await fetchPremiereLeaderboard(state.tg?.user);
  const myUid = getViewerUid(state.tg?.user);
  const me = res.me || {};
  if (me.rank && !state.profile?.tgWriteAccess) {
    requestAndSyncWriteAccess({ force: false });
  }
  const myPts = Number(me.premiere_points ?? state.profile.premierePoints ?? 0);
  const myFriends = Number(me.friends_brought ?? state.profile.friendsBrought ?? 0);
  const myBonusPct = Number(me.friend_bonus_pct ?? Math.min(5, myFriends) * 10);
  const myEffective = Number(me.rating_score ?? me.effective_points ?? Math.round(myPts * (1 + myBonusPct / 100)));
  const myChips = Number(me.chips_count ?? state.profile.trophiesCount ?? 0);
  const myDuelsPlayed = Number(me.duels_played ?? state.profile.duelsPlayed ?? 0);
  const myDuelsWon = Number(me.duels_won ?? state.profile.duelsWon ?? 0);
  const myGolden = Number(me.golden_ticket_shards ?? state.profile.goldenTicketShards ?? 0);
  const sp = computeSuperprizeProgress(myPts, state.profile.goldenLevelsClaimed, myGolden);

  if (me.rank) syncPlayerRankBadges(me.rank);
  if (rankEl) rankEl.textContent = me.rank ? `#${me.rank}` : '#—';
  if (ptsEl) ptsEl.textContent = myBonusPct > 0 ? `⭐ ${myEffective.toLocaleString('ru-RU')} (+${myBonusPct}%)` : `⭐ ${myEffective.toLocaleString('ru-RU')}`;

  const factorGridEl = document.getElementById('leader-factor-grid');
  if (factorGridEl) {
    const tiles = [
      { lbl: '⭐ Очки', val: myPts.toLocaleString('ru-RU') },
      { lbl: '🏅 Уровень', val: `Ур. ${sp.displayLevel}` },
      { lbl: '🎫 Фишки', val: String(myChips) },
      { lbl: '✨ Золотой', val: `${myGolden}/12` },
      { lbl: '👥 Друзья', val: `${myFriends} (+${myBonusPct}%)` },
      { lbl: '⚔️ Дуэли', val: `${myDuelsWon}/${myDuelsPlayed}` },
    ];
    const tileNodes = tiles.map((item) => {
      const tile = document.createElement('div');
      tile.className = 'leader-factor-tile';
      const lblSpan = document.createElement('span');
      lblSpan.className = 'leader-factor-lbl';
      lblSpan.textContent = item.lbl;
      const valStrong = document.createElement('strong');
      valStrong.className = 'leader-factor-val';
      valStrong.textContent = item.val;
      tile.append(lblSpan, valStrong);
      return tile;
    });
    factorGridEl.replaceChildren(...tileNodes);
  }

  if (gapEl) {
    gapEl.textContent = me.in_top10
      ? '🔥 ТЫ В ЗОНЕ ПРИГЛАШЕНИЯ НА ПРЕМЬЕРУ (ТОП-10)!'
      : `До входа в ТОП-10: +${Math.max(10, Number(me.points_to_top10 || 150))} ⭐`;
  }

  if (!listEl) return;
  const topRows = (res.leaders || []).slice(0, 12);
  if (!topRows.length) {
    const emptyTag = document.createElement('div');
    emptyTag.className = 'mono-tag';
    emptyTag.textContent = 'Ты можешь стать первым лидером ТОП-10 прямо сейчас!';
    listEl.replaceChildren(emptyTag);
    return;
  }

  const rowNodes = topRows.map((row, idx) => {
    const rank = Number(row.rank || idx + 1);
    const isMe = row.uid === myUid;
    const rowDiv = document.createElement('div');
    rowDiv.className = `leader-row ${rank <= 3 ? 'is-top3' : ''} ${isMe ? 'is-me' : ''}`.trim();

    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const rankSpan = document.createElement('span');
    rankSpan.className = 'leader-rank';
    rankSpan.textContent = medal;

    const nameCol = document.createElement('div');
    nameCol.className = 'leader-name-col';
    const strongEl = document.createElement('strong');
    strongEl.textContent = `${row.name || 'Узник цеха'}${isMe ? ' (ВЫ)' : ''}`;

    const rowBonusPct = Number(row.friend_bonus_pct ?? Math.min(5, Number(row.friends_brought || 0)) * 10);
    const rowEffPts = Number(row.rating_score ?? row.effective_points ?? Math.round(Number(row.premiere_points || 0) * (1 + rowBonusPct / 100)));
    const rowLvl = Number(row.effective_level ?? row.current_level ?? 1);
    const rowChips = Number(row.chips_count ?? 0);
    const rowFriends = Number(row.friends_brought ?? 0);
    const rowPlayed = Number(row.duels_played ?? 0);
    const rowWon = Number(row.duels_won ?? 0);
    const rowGolden = Number(row.golden_ticket_shards ?? 0);

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'leader-row-tags';
    const tags = [
      `Ур.${rowLvl}`,
      `Фишек: ${rowChips}`,
      `👥 ${rowFriends}${rowBonusPct > 0 ? ` (+${rowBonusPct}%)` : ''}`,
      `⚔️ ${rowWon}/${rowPlayed}`,
      `✨ ${rowGolden}/12`,
    ];
    tags.forEach((tagTxt) => {
      const spTag = document.createElement('span');
      spTag.className = 'leader-row-tag';
      spTag.textContent = tagTxt;
      tagsWrap.appendChild(spTag);
    });
    nameCol.append(strongEl, tagsWrap);

    const ptsSpan = document.createElement('span');
    ptsSpan.className = 'leader-pts';
    ptsSpan.textContent = `⭐ ${rowEffPts.toLocaleString('ru-RU')}`;

    rowDiv.append(rankSpan, nameCol, ptsSpan);
    return rowDiv;
  });
  listEl.replaceChildren(...rowNodes);
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
          <span>🎟 Билетов сегодня: <strong>${Number(tr.daily_tickets_issued || 0)}/${Number(tr.max_daily_tickets || 4)}</strong> (${leftDaily > 0 ? `осталось ${leftDaily}` : 'сброс в 00:00 МСК · сейчас за 4/4 даётся +500 ⭐ в ТОП-20'})</span>
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
    const copy = buildPersonalShareCopy(state.pack.shareTemplate || 'gift_barrel', state.profile?.bestEscapeSec);
    return {
      action: 'share_barrel',
      url: state.pack.lastShareUrl,
      webUrl: state.pack.lastWebUrl || state.pack.lastShareUrl,
      text: copy.shareText,
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
  document.getElementById('btn-burger-duel-1x1')?.addEventListener('click', () => {
    closeBurgerDrawer();
    openDuelTable();
  });
  document.getElementById('btn-hud-duel-1x1')?.addEventListener('click', () => {
    closeBurgerDrawer();
    openDuelTable();
  });
  document.getElementById('btn-sent-duel-1x1')?.addEventListener('click', () => {
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
  document.getElementById('btn-enter-sound')?.addEventListener('click', (e) => enterWorkshopGate(true, e));
  document.getElementById('btn-enter-mute')?.addEventListener('click', (e) => enterWorkshopGate(false, e));

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
  document.getElementById('btn-go-pack')?.addEventListener('click', () => {
    state.pack.forLifeRefill = false;
    showScreen('pack');
  });
  document.getElementById('btn-mode-a-premiere')?.addEventListener('click', () => startPremiereRaceRound());

  // Экран 3 (HUD Цеха) + угловая кнопка звука в шапке
  const toggleWorkshopSound = async () => {
    await audio.toggleSound();
    if (audio.enabled && state.round.running && state.round.voiceUrl) {
      audio.startMuffledVoiceLoop();
    }
    refreshSoundButtonLabel();
  };
  document.getElementById('btn-hud-sound')?.addEventListener('click', toggleWorkshopSound);
  document.getElementById('btn-sound-corner')?.addEventListener('click', toggleWorkshopSound);
  document.getElementById('workshop-silent-radar-pill')?.addEventListener('click', toggleWorkshopSound);
  document.getElementById('btn-enable-tg-push')?.addEventListener('click', async () => {
    const res = await requestAndSyncWriteAccess({ force: true });
    if (res?.allowed) {
      document.getElementById('sent-push-optin-card')?.setAttribute('hidden', '');
      if (state.profile) {
        state.profile.pushDeclined = false;
        saveLocalV9Flags();
      }
      syncLobbyHomescreenPillUI();
      const gotBonus = Boolean(res?.bonus?.granted);
      showToast(
        gotBonus
          ? '🔔 Уведомления включены! Зачислено +1 ❤️ и +150 ⭐!'
          : '🔔 Уведомления бота включены — напишем сразу, когда друг вскроет бочку или отомстит!'
      );
    } else {
      document.getElementById('sent-push-optin-card')?.setAttribute('hidden', '');
      if (state.profile) {
        state.profile.pushDeclined = true;
        saveLocalV9Flags();
      }
      syncLobbyHomescreenPillUI();
      showToast('Хорошо, без уведомлений! Тихий ярлык (+100 ⭐) появится внизу лобби и в меню.');
    }
  });
  document.getElementById('btn-decline-tg-push')?.addEventListener('click', () => {
    document.getElementById('sent-push-optin-card')?.setAttribute('hidden', '');
    if (state.profile) {
      state.profile.pushDeclined = true;
      saveLocalV9Flags();
    }
    syncLobbyHomescreenPillUI();
  });
  document.getElementById('btn-sent-relay-new-friend')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-sent-relay-new-friend');
    if (btn) btn.disabled = true;
    try {
      state.pack.shareTemplate = 'thriller_challenge';
      await handleSealBarrelClick({ forceAutoAvatar: true, isPingPongRevenge: false, isRelayNewFriend: true });
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  async function handleAddHomescreenShortcutClick() {
    closeBurgerDrawer();
    const res = promptAddToHomeScreenSafe();
    const hsRes = await recordHomescreenShortcut(state.tg?.user).catch(() => null);
    if (state.profile) {
      state.profile.homescreenShortcutAdded = true;
      if (hsRes?.granted) {
        state.profile.homescreenBonusClaimed = true;
        if (hsRes.premierePoints != null) {
          state.profile.premierePoints = Math.max(Number(state.profile.premierePoints || 0), Number(hsRes.premierePoints));
        } else {
          state.profile.premierePoints = Number(state.profile.premierePoints || 0) + Number(hsRes.pointsAdded || 100);
        }
      }
      saveLocalV9Flags();
      updatePremiereBarsUI();
      syncSuperPrizeRatingBarUI();
    }
    syncLobbyHomescreenPillUI();
    const ptsMsg = hsRes?.granted ? ' Зачислено +100 ⭐!' : '';
    showToast(
      res.mode === 'tg_native'
        ? `📲 Ярлык «БОЧКИ» добавлен на экран телефона!${ptsMsg}`
        : `📲 Сохрани игру bochka.quest на главный экран («На экран «Домой»» в меню).${ptsMsg}`
    );
  }
  document.getElementById('btn-add-homescreen')?.addEventListener('click', handleAddHomescreenShortcutClick);
  document.getElementById('btn-lobby-add-homescreen')?.addEventListener('click', handleAddHomescreenShortcutClick);
  document.getElementById('btn-lobby-hs-dismiss')?.addEventListener('click', () => {
    if (state.profile) {
      state.profile.homescreenPillDismissed = true;
      saveLocalV9Flags();
    }
    syncLobbyHomescreenPillUI();
  });
  document.querySelectorAll('[data-share-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pack.shareTemplate = btn.getAttribute('data-share-template') || 'thriller_challenge';
      updatePackTemplatePreview();
    });
  });
  document.getElementById('btn-duel-enable-push')?.addEventListener('click', async () => {
    const res = await requestAndSyncWriteAccess({ force: true });
    if (res?.allowed) {
      document.getElementById('btn-duel-enable-push')?.setAttribute('hidden', '');
      showToast(res?.bonus?.granted ? '🔔 Уведомления о дуэлях включены! Зачислено +1 ❤️ и +150 ⭐!' : '🔔 Уведомления бота о вызовах и дуэлях 1×1 включены!');
    } else {
      showToast('Разреши уведомления в @bochka_film_bot, чтобы не пропустить дуэль');
    }
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
    state.pack.forLifeRefill = false;
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
    const modal = document.getElementById('modal-golden-fork');
    const form = document.getElementById('gift-pass-form');
    modal?.classList.add('is-gift-form-step');
    form?.removeAttribute('hidden');
    window.requestAnimationFrame(() => {
      modal?.scrollTo?.({ top: 0, behavior: 'smooth' });
      form?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    Haptics.light();
  });
  document.getElementById('btn-gift-form-back')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-golden-fork');
    modal?.classList.remove('is-gift-form-step');
    document.getElementById('gift-pass-form')?.setAttribute('hidden', '');
    modal?.scrollTo?.({ top: 0, behavior: 'smooth' });
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
      if (state.trailer.introLocked) return;
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

  // Внешняя кнопка «Открыть в VK Видео» и выдача награды
  document.getElementById('btn-trailer-open-yt-app')?.addEventListener('click', () => {
    if (state.trailer.introLocked) return;
    pauseActiveTrailerPlayback();
    state.trailer.externalRescueDepartedAt = Date.now();
    openExternalLink(ENV.vkTrailerUrl || OFFICIAL_YT_WATCH_URL);
  });

  document.getElementById('btn-claim-trailer-life')?.addEventListener('click', () => {
    if (state.trailer.introLocked) return;
    claimTrailerFifthLife();
  });

  document.getElementById('btn-open-kp-trailer')?.addEventListener('click', () => {
    pauseActiveTrailerPlayback();
    openExternalLink(ENV.kinopoiskTrailerUrl);
  });

  // Экран 4: Конструктор пранка (Фото + Голосовуха)
  document.getElementById('btn-close-pack')?.addEventListener('click', () => {
    if (voiceRecorder?.isRecording) voiceRecorder.stop();
    // v14.3 + v9.0: Нельзя закрыть крестиком, пока продюсер (team_prod) не запаковал свою общую бочку или не закрыт замок Раунда 2!
    if (isProducerPackFirstRequired() || state.profile.mustSendFriendPack) {
      const ban = document.getElementById('pack-mandatory-banner');
      if (ban) {
        ban.removeAttribute('hidden');
        ban.classList.remove('is-shake');
        void ban.offsetWidth;
        ban.classList.add('is-shake');
      }
      document.getElementById('btn-pack-quick-1tap')?.classList.add('btn-temu-pulse');
      document.getElementById('btn-seal-barrel')?.classList.add('btn-temu-pulse');
      showToast(
        isInitialSeedPackRequired()
          ? '🔒 Сначала упакуй первую бочку и отправь другу или блогеру — сразу после отправки откроется игра!'
          : '🔒 Чтобы выиграть билет и играть дальше на супер-приз — обязательно отправь друга в бочке!'
      );
      Haptics.error();
      return;
    }
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
      const confirmBox = document.getElementById('pack-uploaded-confirm');
      const thumbImg = document.getElementById('pack-uploaded-thumb');
      const uploadLbl = document.getElementById('label-pack-upload-photo');
      const sendUpBtn = document.getElementById('btn-pack-send-uploaded');
      if (thumbImg && state.pack?.processed?.dataUrl) {
        thumbImg.src = state.pack.processed.dataUrl;
      }
      confirmBox?.removeAttribute('hidden');
      uploadLbl?.setAttribute('hidden', '');
      document.getElementById('btn-pack-quick-1tap')?.setAttribute('hidden', '');
      if (sendUpBtn) {
        sendUpBtn.disabled = false;
        sendUpBtn.textContent = '⚡ Отправить другу';
        sendUpBtn.removeAttribute('hidden');
      }
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

    state.pack.userUploadedPhoto = true;
    await rebuildPackPortraitPreview(tpl.src);
    showToast(`🎬 Шаблон «${tpl.title}» + крик и подпись готовы!`);
    Haptics.light();
  });

  document.getElementById('btn-tg-avatar')?.addEventListener('click', async () => {
    if (state.tg?.user?.photoUrl) {
      state.pack.userUploadedPhoto = true;
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
  document.getElementById('btn-duel-rank-star')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openLeaderboardModal();
  });
  document.getElementById('btn-duel-lobby-rank')?.addEventListener('click', () => openLeaderboardModal());
  document.getElementById('duel-superprize-strip')?.addEventListener('click', () => openLeaderboardModal());
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
  document.getElementById('btn-pack-send-uploaded')?.addEventListener('click', () => {
    handleSealBarrelClick({ forceAutoAvatar: false });
  });
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
    if (state.finaleSecondaryTrailer && state.finaleMode === 'ping_pong_revenge') {
      state.finaleSecondaryTrailer = false;
      if (!audio._userMuted) audio.unlock(true).catch(() => {});
      openTrailerModal({ forRescue: false, afterL1ToPack: true });
      return;
    }
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

  document.getElementById('btn-finale-play-further')?.addEventListener('click', () => {
    if (!audio._userMuted) audio.unlock(true).catch(() => {});
    if (!Boolean(state.trailer?.unlocked40 || getQuestState()?.trailerDone)) {
      openTrailerModal({ forRescue: false, afterL1ToPack: true });
      return;
    }
    state.profile.currentLevel = Math.max(2, Number(state.profile.currentLevel || 2));
    startDemoRound();
  });

  document.getElementById('btn-pack-revenge')?.addEventListener('click', async () => {
    if (state.finaleMode === 'ping_pong_revenge') {
      const targetPack = state.incomingPack;
      if (!audio._userMuted) audio.unlock(true).catch(() => {});
      await handleQuick1TapPrankClick({ isPingPongRevenge: true, replyToPack: targetPack });
      return;
    }
    if (state.finaleMode === 'l1_to_trailer_then_pack') {
      if (state.incomingPack) {
        sendLevel1FriendReply({ pack: state.incomingPack, replyType: 'cinema_accept', viewerTgUser: state.tg?.user }).catch(() => {});
      }
      if (!audio._userMuted) audio.unlock(true).catch(() => {});
      openTrailerModal({ forRescue: false, afterL1ToPack: true });
      return;
    }
    if (state.finaleMode === 'l1_to_pack' || state.finaleMode === 'l1_reply_yes') {
      if (state.incomingPack) {
        sendLevel1FriendReply({ pack: state.incomingPack, replyType: 'cinema_accept', viewerTgUser: state.tg?.user }).catch(() => {});
      }
      state.profile.mustSendFriendPack = true;
      saveLocalV9Flags();
      state.pack.forLifeRefill = false;
      document.getElementById('pack-mandatory-banner')?.setAttribute('hidden', '');
      showScreen('pack');
      showToast('🛢 Быстро закатай друга в бочку — дальше все раунды против Тиля!');
      Haptics.success();
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

  document.getElementById('btn-context-hint-ok')?.addEventListener('click', () => {
    dismissContextHintModal();
  });

  document.getElementById('btn-til-challenge-play')?.addEventListener('click', async () => {
    if (!audio._userMuted) await audio.unlock(true);
    await openDuelTable('', {
      autoStartSoloTil: true,
      huntFriendBarrel: true,
    });
  });

  document.getElementById('btn-sent-play')?.addEventListener('click', async () => {
    if (!audio._userMuted) await audio.unlock(true);
    const wasProdFirst = getTeamSeedRole() === 'prod' && Number(state.profile?.currentLevel || 1) <= 1;
    if (wasProdFirst) {
      await startNewbieOnboardingRound();
      return;
    }
    await openDuelTable('', { autoStartSoloTil: true, huntFriendBarrel: false });
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

  document.getElementById('btn-burger-test-ticket')?.addEventListener('click', async () => {
    closeBurgerDrawer();
    if (duelCtrl?.isActive) duelCtrl.leaveRoom(false);
    await audio.unlock(true).catch(() => {});
    state.profile.currentLevel = 3;
    state.profile.lives = Math.max(3, Number(state.profile.lives || 0));
    startDemoRound();
    showToast('🎟 Уровень 3 (8 бочек): найди бочку с настоящим кинобилетом внутри!');
  });

  // v10.0: В любой момент с кнопки меню можно закатать друга, разослать накопленные билеты или открыть рейтинг на Премьеру!
  document.getElementById('btn-burger-pack-friend')?.addEventListener('click', () => {
    closeBurgerDrawer();
    if (duelCtrl?.isActive) duelCtrl.leaveRoom(false);
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

  document.getElementById('btn-duel-vs-avatar-menu')?.addEventListener('click', () => {
    clearAvatarMenuHintPulse();
    toggleBurgerDrawer();
    Haptics.light();
  });

  document.getElementById('btn-mode-a-open-leaderboard')?.addEventListener('click', () => {
    Haptics.light();
    openLeaderboardModal();
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

  document.getElementById('btn-close-trailer')?.addEventListener('click', () => {
    if (state.trailer.introLocked) return;
    closeTrailerModal();
  });
  document.getElementById('btn-trailer-to-pack')?.addEventListener('click', () => {
    if (state.trailer.introLocked && !state.trailer.fullWatchRewarded) return;
    if (state.trailer.forRescue) {
      if (state.trailer.fullWatchRewarded) {
        closeTrailerModal();
      } else {
        claimTrailerFifthLife();
      }
      return;
    }
    if (state.trailer.afterL1ToPack) {
      closeTrailerModal({ goToTilChallenge: true });
      return;
    }
    closeTrailerModal();
  });
  document.getElementById('btn-trailer-like-yt')?.addEventListener('click', () => {
    if (state.trailer.introLocked) return;
    handleExternalTrailerLike('yt');
  });
  document.getElementById('btn-trailer-sub-yt')?.addEventListener('click', () => {
    if (state.trailer.introLocked) return;
    handleExternalTrailerLike('yt_sub');
  });
  document.getElementById('btn-trailer-like-ig')?.addEventListener('click', () => {
    if (state.trailer.introLocked) return;
    handleExternalTrailerLike('ig');
  });
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
    state.pack.forLifeRefill = true;
    duelCtrl?.leaveRoom(false);
    showScreen('pack');
  });
  document.getElementById('btn-trapped-invite-friend')?.addEventListener('click', () => {
    document.getElementById('modal-barrel-trapped')?.setAttribute('hidden', '');
    state.pack.forLifeRefill = true;
    duelCtrl?.leaveRoom(false);
    showScreen('pack');
  });
  document.getElementById('btn-trapped-workshop-recovery')?.addEventListener('click', () => {
    document.getElementById('modal-barrel-trapped')?.setAttribute('hidden', '');
    startWorkshopRecoveryShift();
  });
  document.getElementById('btn-pack-recovery-shift')?.addEventListener('click', () => {
    startWorkshopRecoveryShift();
  });
  document.getElementById('btn-recovery-back-to-til')?.addEventListener('click', () => {
    state.round.isLifeRecoveryShift = false;
    document.getElementById('workshop-recovery-bar')?.setAttribute('hidden', '');
    openDuelTable('', { autoStartSoloTil: true, huntFriendBarrel: false });
  });
  document.getElementById('btn-recovery-pack-friend')?.addEventListener('click', () => {
    state.round.isLifeRecoveryShift = false;
    document.getElementById('workshop-recovery-bar')?.setAttribute('hidden', '');
    state.pack.forLifeRefill = true;
    showScreen('pack');
  });
  document.getElementById('btn-superprize-unlock-play')?.addEventListener('click', () => {
    document.getElementById('modal-superprize-unlock')?.setAttribute('hidden', '');
  });
  document.getElementById('btn-superprize-unlock-leaders')?.addEventListener('click', () => {
    document.getElementById('modal-superprize-unlock')?.setAttribute('hidden', '');
    openLeaderboardModal();
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
  const txt = audio.enabled ? t('hudSoundOn') : t('hudSoundOff');
  const icon = audio.enabled ? '🔊' : '🔇';
  const btn = document.getElementById('btn-hud-sound');
  if (btn) {
    btn.textContent = icon;
    btn.classList.toggle('is-muted', !audio.enabled);
  }
  const cornerBtn = document.getElementById('btn-sound-corner');
  if (cornerBtn) {
    cornerBtn.textContent = icon;
    cornerBtn.classList.toggle('is-muted', !audio.enabled);
  }
  const radarPill = document.getElementById('workshop-silent-radar-pill');
  if (radarPill) {
    if (audio.enabled) radarPill.setAttribute('hidden', '');
    else radarPill.removeAttribute('hidden');
  }
  scene?.setSilentRadarMode?.(!audio.enabled, state.round?.targetIndex);
  const burgerBtn = document.getElementById('btn-burger-sound');
  if (burgerBtn) {
    burgerBtn.textContent = audio.enabled ? `🔊 ${txt}` : `🔇 ${txt}`;
  }
}

let toastTimer = null;
function positionOceanToast() {
  const el = document.getElementById('toast');
  if (!el) return;
  if (state.activeScreen !== 'ocean') {
    el.style.top = '';
    return;
  }
  const topBox = document.querySelector('#screen-ocean .ocean-top-box')?.getBoundingClientRect();
  const minTop = topBox && topBox.bottom > 40 ? Math.ceil(topBox.bottom + 12) : 236;
  const promptBox = document.getElementById('ocean-tap-prompt')?.getBoundingClientRect();
  const toastH = el.offsetHeight || 44;
  let targetTop = minTop;
  if (promptBox && promptBox.top > 0 && targetTop + toastH > promptBox.top - 8) {
    targetTop = Math.max(minTop, Math.floor(promptBox.top - toastH - 8));
  }
  el.style.top = `${targetTop}px`;
}

function showToast(text, { className = '', durationMs = null } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-special-knock');
  if (className) el.classList.add(className);
  el.removeAttribute('hidden');
  hideWorkshopIntroHint(true);
  positionOceanToast();
  if (state.activeScreen === 'ocean') {
    window.requestAnimationFrame(positionOceanToast);
  }
  if (toastTimer) clearTimeout(toastTimer);
  const ttl = Number(durationMs) > 0 ? Number(durationMs) : (state.activeScreen === 'ocean' ? 1800 : 4600);
  toastTimer = window.setTimeout(() => {
    el.classList.remove('is-special-knock');
    el.setAttribute('hidden', '');
  }, ttl);
}

bootstrap();
