import { isTestBogSessionActive, Haptics } from './telegram.js';
import {
  getActiveRealtimeClient,
  getViewerUid,
  buildDuelShareLinks,
  startDuelAnte,
  settleDuelRound,
  claimDuelPremiereBankReward,
  awardTicketShardServer,
} from './backend.js';

const BARREL_BATCH_CODES = ['01', '19', '97', '12', '17', '26', '33', '48', '71', '84', '92', '99'];
const MAX_DUEL_PLAYERS = 2; // v17.1: Строго 1 на 1 — за столом играют только двое друзей!
const TIL_BOT_UID = 'bot_workshop_master';
const TIL_BOT_NAME = 'Тиль Швайгер';
const TIL_AVATAR_URL = './public/sprites/til_avatar.webp?v=2000';
const SUPERPRIZE_POINTS_TARGET = 5000;
const FIGHTER_AVATARS = [
  './public/sprites/fighter_1.webp?v=2000',
  './public/sprites/fighter_2.webp?v=2000',
  './public/sprites/fighter_3.webp?v=2000',
  './public/sprites/fighter_4.webp?v=2000',
  './public/sprites/fighter_5.webp?v=2000',
  './public/sprites/fighter_6.webp?v=2000',
];

function getFallbackFighterAvatar(seed = '') {
  const s = String(seed || '0');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return FIGHTER_AVATARS[h % FIGHTER_AVATARS.length] || FIGHTER_AVATARS[0];
}

// Динамическая сложность Тиля от количества жизней игрока (1–6 обычный, 7–11 ускоренный, 12+ ярость -3 ❤️)
function getTilDifficultyProfile(lives = 6, roundIdx = 0) {
  const lv = Math.max(0, Number(lives || 0));
  const r = Math.min(3, Math.max(0, Number(roundIdx || 0)));
  if (lv >= 12) {
    return {
      tier: 'rage',
      claimSec: [4.6, 4.4, 4.2, 4.0][r],
      tilTelegraphMs: [2800, 2650, 2500, 2350][r],
      tilTelegraphDurMs: [600, 580, 550, 520][r],
      screamerDamage: 3,
      extraScreamers: 2,
      prizeSnipeChance: 0.85,
    };
  }
  if (lv >= 7) {
    return {
      tier: 'accelerated',
      claimSec: [5.8, 5.6, 5.4, 5.2][r],
      tilTelegraphMs: [3800, 3650, 3450, 3300][r],
      tilTelegraphDurMs: [720, 700, 680, 650][r],
      screamerDamage: 2,
      extraScreamers: 1,
      prizeSnipeChance: 0.55,
    };
  }
  return {
    tier: 'normal',
    claimSec: [7.5, 7.2, 6.8, 6.5][r],
    tilTelegraphMs: [5300, 5050, 4700, 4450][r],
    tilTelegraphDurMs: [850, 850, 800, 750][r],
    screamerDamage: 2,
    extraScreamers: 0,
    prizeSnipeChance: 0.25,
  };
}

const COUNTDOWN_STEP_MS = 850;
const PLAYER_STRIKE_BEAT_MS = 520;
const TIL_AFTER_PLAYER_TELEGRAPH_MS = 680;
const TIL_IMPACT_BEAT_MS = 380;
const LOOT_READ_PAUSE_MS = 2600;
const LOOT_READ_SCREAMER_MS = 2850;
const RESULT_CARD_DELAY_MS = 2100;
const INPUT_WATCHDOG_LOCK_MS = 2600;
const IDLE_HINT_DELAY_MS = 2700;

/**
 * Контроллер синхронного мультиплеера 1 на 1 (строго 2 друга) «НА СЧЁТ ТРИ!» (Supabase Realtime Presence + Broadcast)
 * и режима «👀 Подглядывать за игрой» (`watch_<barrelId>`).
 * Все промежуточные клики и таймеры идут строго через WebSocket в оперативной памяти (0 записей в БД).
 */
export class WorkshopDuelController {
  constructor({ scene, audio, getTgUser, getPlayerAvatar, getProfileStats, getTicketShards, onCollectChipFromBarrel, canUseOceanRefill, onOpenPackForLives, onFoundFriendBarrel, onContextDiscoveryHint, onLifeLostPill, onProfileSync, onToast, onOpenInviteShare, onOpenGoldenFork, onExitToHub, onDefeatCinematic, onDuelDefeatToTil, onFlyRating, onFlyLife, onReturnToLevels, onOpenHallOfFame, loadDuelCandidates, onChallengeFriend, onOpenPackFriend, onRoomFull, onTriggerScreamerFx }) {
    this.scene = scene;
    this.audio = audio;
    this.getTgUser = getTgUser;
    this.getPlayerAvatar = getPlayerAvatar || null;
    this.getProfileStats = getProfileStats || null;
    this.onProfileSync = onProfileSync;
    this.onToast = onToast;
    this.onOpenInviteShare = onOpenInviteShare;
    this.onOpenGoldenFork = onOpenGoldenFork;
    this.onExitToHub = onExitToHub;
    this.onDefeatCinematic = onDefeatCinematic || null;
    this.onDuelDefeatToTil = onDuelDefeatToTil;
    this.onFlyRating = onFlyRating;
    this.onFlyLife = onFlyLife;
    this.onReturnToLevels = onReturnToLevels;
    this.onOpenHallOfFame = onOpenHallOfFame;
    this.loadDuelCandidates = loadDuelCandidates || null;
    this.onChallengeFriend = onChallengeFriend || null;
    this.onOpenPackFriend = onOpenPackFriend || null;
    this.getTicketShards = getTicketShards || null;
    this.onCollectChipFromBarrel = onCollectChipFromBarrel || null;
    this.canUseOceanRefill = canUseOceanRefill || null;
    this.onOpenPackForLives = onOpenPackForLives || null;
    this.onFoundFriendBarrel = onFoundFriendBarrel || null;
    this.onContextDiscoveryHint = onContextDiscoveryHint || null;
    this.onLifeLostPill = onLifeLostPill || null;
    this.onRoomFull = onRoomFull || null;
    this.onTriggerScreamerFx = onTriggerScreamerFx || null;
    this.duelCandidates = { sent: [], branch: [], loaded: false };
    this.pickerTab = 'sent'; // 'sent' | 'branch'
    this.challengedUids = new Set();
    this.soloMode = false;
    this.friendBarrelHunt = false;
    this.tilRoundIdx = 0;
    this.duelMode = 'classic'; // 'classic' | 'chips'
    this.selectedAnteTrophyId = null;
    this.selectedAnteTrophyMeta = null;
    this.opponentChips = {};
    this.hofCache = null;
    this._trophiesMod = null;
    this.energy = 100;
    this.duelLives = 6;
    this.tilMaxLives = 3;
    this.tilLives = 3;
    this.sessionStats = { playerChips: 0, playerPoints: 0, oppTickets: 0, oppChips: 0, oppPoints: 0 };
    this.duelRoundsWithoutTicket = 0;
    this.maxDuelRounds = 3;
    this.batchResolved = false; // true, когда кто-то выбил 🎟 Билет или бочки кончились
    this.skippedThisTurn = false;
    this.falseStartCount = 0;
    this._idleHintTimer = null;
    this._idleHintVisible = false;
    this._falseStartResetTimer = null;
    this._countdownTimers = [];
    this._trophyPickerOpen = false;
    this._pendingTrophyFinish = false;

    this.active = false;
    this.roomId = '';
    this.channel = null;
    this.myUid = '';
    this.myName = 'Узник цеха';
    this.myAvatar = '';

    this.players = []; // [{ uid, name, avatar, joinedAt, isBot }]
    this.contenderUids = []; // кто сейчас бьёт (2 или 3, а в Суперфинале 2)
    this.spectatorUids = []; // вылетевший 3-й игрок, который гремит цепями
    this.phase = 'idle'; // 'lobby' | 'countdown' | 'claim' | 'reveal' | 'finished'
    this.roundKey = '';
    this.antePaidForRound = '';
    this.barrelCount = 6;
    this.safeIndices = [];
    this.barrelLoot = {}; // { [idx]: { kind: 'ticket'|'points'|'empty'|'screamer', value, label } }
    this.batchHasTicket = false;
    this.openedIndices = []; // уже вскрытые в текущей партии бочки (не закрываются, пока не откроют все!)
    this.claims = {}; // { [barrelIndex]: { uid, name, avatar, ts } }
    this.claimTimeLeft = 7.5;

    this.claimInterval = null;
    this.inputWatchdogInterval = null;
    this.rafId = null;
    this.timeouts = [];
    this.roundParticipants = [];
    this._lastRemoteRattleAt = 0;
    this.roundWatchdogTimer = null;
    this._tilStepTimer = null;
    this._playerAnimating = false;
    this._playerAnimatingSince = 0;
    this._roundStarting = false;
    this._roundStartingSince = 0;
    this._phaseEnteredAt = Date.now();
    this._activeClaimElapsedMs = 0;
    this._tilTelegraphBarrel = -1;
    this._tilState = 'idle'; // 'idle' | 'telegraph' | 'struck'
    this.lastRattleAt = 0;
    this.botCounter = 0;
  }

  get isActive() {
    return this.active;
  }

  setPhase(nextPhase) {
    this.phase = nextPhase;
    this._phaseEnteredAt = Date.now();
  }

  isExternalOverlayBlocking() {
    const blockingIds = [
      'modal-context-hint',
      'modal-til-trophy-pick',
      'barrel-trap-cinematic',
      'modal-barrel-trapped',
      'screamer-overlay',
      'fx-scream',
      'fx-reveal',
      'modal-trailer',
      'modal-golden-fork',
      'modal-hall-of-fame',
      'modal-legal',
      'modal-leaderboard',
      'modal-prize',
      'modal-rules',
      'modal-share-hub',
    ];
    for (const id of blockingIds) {
      const el = document.getElementById(id);
      if (el && !el.hidden) return true;
    }
    return false;
  }

  clearTilTimers() {
    if (this._tilStepTimer) {
      clearTimeout(this._tilStepTimer);
      this._tilStepTimer = null;
    }
    this._tilTelegraphBarrel = -1;
    this.scene?.setBarrelTelegraph?.(-1, false);
  }

  scheduleTimeout(fn, ms) {
    const id = window.setTimeout(fn, ms);
    this.timeouts.push(id);
    return id;
  }

  scheduleStepWhenUnblocked(fn, ms, maxWaitMs = 120000) {
    const startedAt = Date.now();
    const check = () => {
      if (!this.active) return;
      if (this.isExternalOverlayBlocking() && Date.now() - startedAt < maxWaitMs) {
        this._tilStepTimer = window.setTimeout(check, 120);
        return;
      }
      fn();
    };
    this._tilStepTimer = window.setTimeout(check, ms);
  }

  startInputWatchdog() {
    this.stopInputWatchdog();
    this.inputWatchdogInterval = window.setInterval(() => {
      if (!this.active) return;
      const now = Date.now();
      if (this.isExternalOverlayBlocking()) {
        this._phaseEnteredAt = now;
        if (this._playerAnimating) this._playerAnimatingSince = now;
      }

      if (this._playerAnimating && now - (this._playerAnimatingSince || 0) > INPUT_WATCHDOG_LOCK_MS) {
        if (!this.isExternalOverlayBlocking()) {
          this._playerAnimating = false;
          this._playerAnimatingSince = 0;
          this.clearTilTimers();
          if (this.phase === 'claim') {
            const hasMyClaim = Object.values(this.claims || {}).some((c) => c.uid === this.myUid);
            if (hasMyClaim && this.isHost()) {
              this.finalizeClaimsAndBroadcastReveal();
            } else if (!this.spectatorUids.includes(this.myUid)) {
              this.scene?.setDuelDirectClick?.(true);
              this.scene?.setInteractive?.(true);
            }
          }
        }
      }

      if (this._roundStarting && now - (this._roundStartingSince || 0) > 3000) {
        this._roundStarting = false;
      }

      if (
        this.phase === 'claim' &&
        !this.spectatorUids.includes(this.myUid) &&
        !this._playerAnimating &&
        !this.isExternalOverlayBlocking()
      ) {
        if (this.scene && (!this.scene.interactive || this.scene.diving || !this.scene.duelDirectClick)) {
          this.scene.diving = false;
          this.scene.setDuelDirectClick?.(true);
          this.scene.setInteractive(true);
        }
      }

      if (
        this.phase === 'countdown' &&
        now - (this._phaseEnteredAt || now) > 3200 &&
        !this.isExternalOverlayBlocking()
      ) {
        this.beginClaimWindow();
      }

      if (
        this.phase === 'reveal' &&
        now - (this._phaseEnteredAt || now) > 6500 &&
        !this.isExternalOverlayBlocking()
      ) {
        if (this.duelLives <= 0 || this.batchResolved) {
          this.setPhase('finished');
          this.showRoundResultCard(null, { potLives: 0 }, { myEntry: null, oppEntry: null, ticketFound: false });
        } else if (this.isHost()) {
          this.hostInitiateRound({ isFreeRerack: true });
        }
      }
    }, 250);
  }

  stopInputWatchdog() {
    if (this.inputWatchdogInterval) {
      clearInterval(this.inputWatchdogInterval);
      this.inputWatchdogInterval = null;
    }
  }

  clearIdleHint() {
    if (this._idleHintTimer) {
      clearTimeout(this._idleHintTimer);
      this._idleHintTimer = null;
    }
    this._idleHintVisible = false;
    document.getElementById('duel-idle-hint')?.setAttribute('hidden', '');
    this.scene?.setIdleHintPulse?.(false);
  }

  scheduleIdleHint() {
    this.clearIdleHint();
    if (!this.active || this.phase !== 'claim' || this.spectatorUids.includes(this.myUid)) return;
    this._idleHintTimer = window.setTimeout(() => {
      this._idleHintTimer = null;
      if (!this.active || this.phase !== 'claim' || this._playerAnimating || this.skippedThisTurn) return;
      const alreadyClaimed = Object.values(this.claims || {}).some((c) => c.uid === this.myUid);
      if (alreadyClaimed) return;
      if (this.isExternalOverlayBlocking()) {
        this.scheduleIdleHint();
        return;
      }
      this._idleHintVisible = true;
      const hintEl = document.getElementById('duel-idle-hint');
      if (hintEl) {
        hintEl.textContent = 'Бей по бочке!';
        hintEl.removeAttribute('hidden');
      }
      this.scene?.setIdleHintPulse?.(true, this.openedIndices);
    }, IDLE_HINT_DELAY_MS);
  }

  clearAllTimers() {
    this.timeouts.forEach((id) => clearTimeout(id));
    this.timeouts = [];
    if (this._countdownTimers?.length) {
      this._countdownTimers.forEach((id) => clearTimeout(id));
      this._countdownTimers = [];
    }
    if (this._falseStartResetTimer) {
      clearTimeout(this._falseStartResetTimer);
      this._falseStartResetTimer = null;
    }
    this.clearIdleHint();
    this.clearTilTimers();
    if (this.roundWatchdogTimer) {
      clearTimeout(this.roundWatchdogTimer);
      this.roundWatchdogTimer = null;
    }
    if (this.claimInterval) {
      clearInterval(this.claimInterval);
      this.claimInterval = null;
    }
  }

  getPacingDebug() {
    const diff = getTilDifficultyProfile(this.duelLives, Math.max(0, Number(this.tilRoundIdx || 1) - 1));
    return {
      phase: this.phase,
      soloMode: this.soloMode,
      friendBarrelHunt: Boolean(this.friendBarrelHunt),
      tilRoundIdx: this.tilRoundIdx,
      barrelCount: this.barrelCount,
      duelLives: this.duelLives,
      tilLives: this.tilLives,
      tilMaxLives: this.tilMaxLives,
      difficultyTier: diff.tier,
      screamerDamage: diff.screamerDamage,
      turnClaimSec: diff.claimSec,
      prizeSnipeChance: diff.prizeSnipeChance,
      falseStartCount: this.falseStartCount,
      idleHintVisible: Boolean(this._idleHintVisible),
      trophyPickerOpen: Boolean(this._trophyPickerOpen),
      claimTimeLeft: this.claimTimeLeft,
      activeClaimElapsedMs: this._activeClaimElapsedMs,
      playerAnimating: this._playerAnimating,
      roundStarting: this._roundStarting,
      tilState: this._tilState,
      tilTelegraphBarrel: this._tilTelegraphBarrel,
      duelDirectClick: Boolean(this.scene?.duelDirectClick),
      interactive: Boolean(this.scene?.interactive),
      diving: Boolean(this.scene?.diving),
      overlayBlocking: this.isExternalOverlayBlocking(),
      timings: {
        countdownStepMs: COUNTDOWN_STEP_MS,
        playerStrikeBeatMs: PLAYER_STRIKE_BEAT_MS,
        tilAfterPlayerTelegraphMs: TIL_AFTER_PLAYER_TELEGRAPH_MS,
        tilImpactBeatMs: TIL_IMPACT_BEAT_MS,
        lootReadPauseMs: LOOT_READ_PAUSE_MS,
        lootReadScreamerMs: LOOT_READ_SCREAMER_MS,
        resultCardDelayMs: RESULT_CARD_DELAY_MS,
        watchdogLockMs: INPUT_WATCHDOG_LOCK_MS,
        idleHintDelayMs: IDLE_HINT_DELAY_MS,
      },
    };
  }

  async loadTrophiesMod() {
    if (!this._trophiesMod) {
      this._trophiesMod = await import('./trophies.js?v=2000');
    }
    return this._trophiesMod;
  }

  bindModeTabsOnce() {
    const tabClassic = document.getElementById('btn-duel-tab-classic');
    const tabChips = document.getElementById('btn-duel-tab-chips');
    const switchLobbyBtn = document.getElementById('btn-duel-switch-lobby');
    if (tabClassic && !tabClassic.dataset.bound) {
      tabClassic.dataset.bound = '1';
      tabClassic.addEventListener('click', () => {
        if (this.phase !== 'lobby' && this.phase !== 'finished') return;
        this.setDuelMode('classic');
      });
    }
    if (tabChips && !tabChips.dataset.bound) {
      tabChips.dataset.bound = '1';
      tabChips.addEventListener('click', () => {
        if (this.phase !== 'lobby' && this.phase !== 'finished') return;
        this.setDuelMode('chips', { forceRefresh: true });
      });
    }
    if (switchLobbyBtn && !switchLobbyBtn.dataset.bound) {
      switchLobbyBtn.dataset.bound = '1';
      switchLobbyBtn.addEventListener('click', () => {
        this.returnToLobby();
      });
    }
  }

  returnToLobby() {
    if (!this.active) return;
    this.clearAllTimers();
    this.clearBarrelClaimBadges();
    this._playerAnimating = false;
    this._roundStarting = false;
    this.setPhase('lobby');
    this.soloMode = false;
    this.duelRoundsWithoutTicket = 0;
    this.tilRoundIdx = 0;
    this.openedIndices = [];
    this.claims = {};
    this.players = this.players.filter((p) => !p.isBot);
    if (!this.players.length) {
      this.players = [
        {
          uid: this.myUid,
          name: this.myName,
          avatar: this.myAvatar,
          joinedAt: Date.now(),
          isBot: false,
        },
      ];
    }
    document.getElementById('duel-result-box')?.setAttribute('hidden', '');
    document.getElementById('duel-live-mini-bar')?.setAttribute('hidden', '');
    document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');
    const overlay = document.getElementById('duel-overlay');
    overlay?.classList.remove('is-playing', 'is-finished');
    this.scene?.resetRound?.({ barrelCount: 6, targetIndex: 0, golden: false });
    this.scene?.setDuelDirectClick?.(false);
    this.scene?.setBarrelTelegraph?.(-1, false);
    this.scene?.setInteractive?.(false);
    this.renderLobbyUI();
    this.refreshFriendPicker();
  }

  updateModeTabsUI() {
    const tabClassic = document.getElementById('btn-duel-tab-classic');
    const tabChips = document.getElementById('btn-duel-tab-chips');
    const panel = document.getElementById('duel-chips-panel');
    const unlocked = Boolean(this.hofCache?.chipDuelUnlocked);
    if (tabClassic) {
      tabClassic.classList.toggle('is-active', this.duelMode === 'classic');
      tabClassic.setAttribute('aria-selected', this.duelMode === 'classic' ? 'true' : 'false');
    }
    if (tabChips) {
      tabChips.classList.toggle('is-active', this.duelMode === 'chips');
      tabChips.classList.toggle('is-locked-tab', !unlocked);
      tabChips.setAttribute('aria-selected', this.duelMode === 'chips' ? 'true' : 'false');
      tabChips.textContent = unlocked ? '🪙 ДУЭЛЬ НА ФИШКИ' : '🔒 ДУЭЛЬ НА ФИШКИ';
    }
    if (panel) {
      if (this.duelMode === 'chips' && this.phase === 'lobby') {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    }
  }

  async setDuelMode(mode = 'classic', { forceRefresh = false } = {}) {
    this.duelMode = mode === 'chips' ? 'chips' : 'classic';
    if (this.duelMode === 'classic') {
      this.updateModeTabsUI();
      this.renderLobbyUI();
      return;
    }

    const panel = document.getElementById('duel-chips-panel');
    if (panel) {
      panel.removeAttribute('hidden');
      panel.textContent = 'Загрузка Зала славы…';
    }
    this.updateModeTabsUI();

    const mod = await this.loadTrophiesMod();
    if (forceRefresh || !this.hofCache) {
      this.hofCache = await mod.fetchHallOfFame(this.getTgUser?.());
    }
    const freeChips = (this.hofCache?.trophies || []).filter((t) => !t.locked_in_duel_id);
    if (this.hofCache?.chipDuelUnlocked) {
      const stillValid = freeChips.some((t) => String(t.id) === String(this.selectedAnteTrophyId));
      if (!stillValid) {
        const first = freeChips[0] || null;
        this.selectedAnteTrophyId = first ? first.id : null;
        this.selectedAnteTrophyMeta = first;
      }
    } else {
      this.selectedAnteTrophyId = null;
      this.selectedAnteTrophyMeta = null;
    }

    const renderPicker = () => {
      mod.renderDuelChipPicker(panel, this.hofCache, {
        selectedTrophyId: this.selectedAnteTrophyId,
        onSelect: (tr) => {
          this.selectedAnteTrophyId = tr.id;
          this.selectedAnteTrophyMeta = tr;
          this.broadcast('duel_chip_select', {
            uid: this.myUid,
            name: this.myName,
            trophy: { id: tr.id, label: tr.label, rarity: tr.rarity, image_url: tr.image_url },
          });
          renderPicker();
          this.renderLobbyUI();
        },
        onInviteFriend: () => {
          this.leaveRoom(false);
          this.onOpenInviteShare?.();
        },
        onSwitchClassic: () => {
          this.setDuelMode('classic');
        },
      });
    };

    renderPicker();
    if (this.selectedAnteTrophyMeta) {
      this.broadcast('duel_chip_select', {
        uid: this.myUid,
        name: this.myName,
        trophy: {
          id: this.selectedAnteTrophyMeta.id,
          label: this.selectedAnteTrophyMeta.label,
          rarity: this.selectedAnteTrophyMeta.rarity,
          image_url: this.selectedAnteTrophyMeta.image_url,
        },
      });
    }
    this.updateModeTabsUI();
    this.renderLobbyUI();
  }

  async openRoom(roomId, { autoAddTestBots = false, initialMode = 'classic', prefetchedHof = null, autoStartSoloTil = false, huntFriendBarrel = false } = {}) {
    this.leaveRoom(false);
    if (prefetchedHof?.ok) {
      this.hofCache = prefetchedHof;
    }

    const tgUser = this.getTgUser?.() || null;
    this.myUid = getViewerUid(tgUser);
    this.myName = tgUser?.name || (isTestBogSessionActive() ? 'Тест-Бог' : 'Игрок');
    this.myAvatar = this.getPlayerAvatar?.() || tgUser?.photoUrl || getFallbackFighterAvatar(this.myUid);
    this.roomId = String(roomId || `d_${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28);
    this.active = true;
    this.setPhase('lobby');
    this.soloMode = false;
    this.friendBarrelHunt = Boolean(huntFriendBarrel);
    this._playerAnimating = false;
    this._roundStarting = false;
    this.tilRoundIdx = 0;
    this.barrelCount = 6;
    this.duelRoundsWithoutTicket = 0;
    this.duelMode = 'classic';
    this.selectedAnteTrophyId = null;
    this.selectedAnteTrophyMeta = null;
    this.opponentChips = {};
    this.roundKey = '';
    this.antePaidForRound = '';
    this.roundParticipants = [];
    this.openedIndices = [];
    this.claims = {};
    this.spectatorUids = [];
    this.energy = 100;
    const profStats = this.getProfileStats?.() || null;
    const profLives = Number(profStats?.lives ?? 0);
    this.duelLives = Math.max(6, Math.min(30, profLives > 0 ? Math.max(Number(this.duelLives || 6), profLives) : Number(this.duelLives || 6)));
    const initDiff = getTilDifficultyProfile(this.duelLives, 0);
    this.tilMaxLives = initDiff.tier === 'rage' ? 4 : 3;
    this.tilLives = this.tilMaxLives;
    this.sessionStats = { playerChips: 0, playerPoints: 0, oppTickets: 0, oppChips: 0, oppPoints: 0 };
    this.falseStartCount = 0;
    this.batchResolved = false;
    this.skippedThisTurn = false;
    this.syncEnergyUI();

    this.players = [
      {
        uid: this.myUid,
        name: this.myName,
        avatar: this.myAvatar,
        joinedAt: Date.now(),
        isBot: false,
      },
    ];

    if (isTestBogSessionActive() && autoAddTestBots) {
      this.addSandboxBot();
    }

    const overlay = document.getElementById('duel-overlay');
    overlay?.removeAttribute('hidden');
    overlay?.classList.remove('is-playing');
    document.body.classList.add('is-duel-active');
    document.getElementById('duel-live-mini-bar')?.setAttribute('hidden', '');
    document.getElementById('duel-result-box')?.setAttribute('hidden', '');
    const resTrophy = document.getElementById('duel-result-trophy');
    if (resTrophy) {
      resTrophy.textContent = '';
      resTrophy.setAttribute('hidden', '');
    }
    document.getElementById('duel-spectator-bar')?.setAttribute('hidden', '');
    document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');

    // Показываем кнопку добавления ботов только в песочнице /testbog/
    const botBtn = document.getElementById('btn-duel-add-bot');
    if (botBtn) {
      if (isTestBogSessionActive()) botBtn.removeAttribute('hidden');
      else botBtn.setAttribute('hidden', '');
    }

    this.scene.resetRound({
      barrelCount: 6,
      targetIndex: 0,
      golden: false,
    });
    this.scene.setDuelDirectClick?.(true);
    this.scene.setBarrelTelegraph?.(-1, false);
    this.scene.setInteractive(false);
    this.startInputWatchdog();

    this.bindModeTabsOnce();
    this._bouncingRoomFull = false;
    this.connectRealtimeChannel();
    this.updateModeTabsUI();
    this.challengedUids.clear();
    this.duelCandidates = { sent: [], branch: [], loaded: false };
    this.renderLobbyUI();
    this.refreshFriendPicker();
    this.startBadgeProjectionLoop();

    if (initialMode === 'chips') {
      await this.setDuelMode('chips', { forceRefresh: !prefetchedHof?.ok });
    } else {
      // Фоново обновляем статус замка на вкладке «Дуэль на фишки» (строго лениво, после входа в Дуэль)
      this.loadTrophiesMod()
        .then((mod) => mod.fetchHallOfFame(this.getTgUser?.()))
        .then((hof) => {
          if (!this.active) return;
          this.hofCache = hof;
          this.updateModeTabsUI();
        })
        .catch(() => {});
      if (autoStartSoloTil) {
        await this.startSoloDuel({ huntFriendBarrel: this.friendBarrelHunt });
      }
    }
  }

  leaveRoom(triggerCallback = true) {
    if (this.duelMode === 'chips' && this.roundKey && this.phase !== 'finished' && this.phase !== 'idle') {
      const rk = this.roundKey;
      const tg = this.getTgUser?.();
      this.loadTrophiesMod()
        .then((mod) => mod.cancelDuelChips(tg, rk))
        .catch(() => {});
    }
    this.active = false;
    this.friendBarrelHunt = false;
    this._trophyPickerOpen = false;
    this._pendingTrophyFinish = false;
    this.setPhase('idle');
    this._playerAnimating = false;
    this._roundStarting = false;
    this.stopInputWatchdog();
    this.clearAllTimers();
    this.scene?.setDuelDirectClick?.(false);
    this.scene?.setBarrelTelegraph?.(-1, false);
    this.scene?.setIdleHintPulse?.(false);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.channel) {
      try {
        const rt = getActiveRealtimeClient();
        if (rt) rt.removeChannel(this.channel);
        else this.channel.unsubscribe();
      } catch { /* ignore */ }
      this.channel = null;
    }
    this.clearBarrelClaimBadges();
    const popWrap = document.getElementById('duel-loot-popouts');
    if (popWrap) popWrap.innerHTML = '';
    document.getElementById('modal-til-trophy-pick')?.setAttribute('hidden', '');
    document.getElementById('duel-countdown-banner')?.classList.remove('is-false-start');
    document.getElementById('duel-vs-opp-wrap')?.classList.remove('is-til-rage');
    document.getElementById('duel-til-rage-badge')?.setAttribute('hidden', '');
    const overlay = document.getElementById('duel-overlay');
    overlay?.setAttribute('hidden', '');
    overlay?.classList.remove('is-playing', 'is-finished');
    document.body.classList.remove('is-duel-active');
    document.getElementById('duel-live-mini-bar')?.setAttribute('hidden', '');
    this.scene?.setActiveBarrelCount(6);
    if (triggerCallback) {
      this.onExitToHub?.();
    }
  }

  isHost() {
    if (this.soloMode) return true;
    if (!this.players.length) return true;
    const sorted = [...this.players].sort((a, b) => (a.joinedAt - b.joinedAt) || a.uid.localeCompare(b.uid));
    return sorted[0]?.uid === this.myUid;
  }

  addSandboxBot() {
    if (this.players.length >= MAX_DUEL_PLAYERS) {
      this.onToast?.('⚔️ В дуэли играют строго двое (1 на 1)!');
      return;
    }
    this.botCounter += 1;
    const isFirstTil = this.botCounter === 1 && !this.players.some((p) => p.uid === TIL_BOT_UID);
    const names = ['Макс (Кент 🤖)', 'Алина (Кент 🤖)', 'Дэн (Цех 🤖)'];
    const botName = isFirstTil ? TIL_BOT_NAME : names[(this.botCounter - 1) % names.length];
    this.players.push({
      uid: isFirstTil ? TIL_BOT_UID : `bot_${this.botCounter}_${Date.now().toString(36)}`,
      name: botName,
      avatar: isFirstTil ? TIL_AVATAR_URL : '',
      joinedAt: Date.now() + this.botCounter,
      isBot: true,
      isTil: isFirstTil,
    });
    this.renderLobbyUI();
  }

  connectRealtimeChannel() {
    const rt = getActiveRealtimeClient();
    if (!rt) return;

    const ch = rt.channel(`duel_${this.roomId}`, {
      config: {
        presence: { key: this.myUid },
        broadcast: { self: false },
      },
    });

    ch.on('presence', { event: 'sync' }, () => {
      if (!this.active || this.soloMode) return;
      const state = ch.presenceState() || {};
      const list = [];
      for (const key of Object.keys(state)) {
        const entries = state[key];
        if (Array.isArray(entries) && entries[0]) {
          list.push({
            uid: entries[0].uid || key,
            name: entries[0].name || 'Игрок',
            avatar: entries[0].avatar || '',
            joinedAt: Number(entries[0].joinedAt || Date.now()),
            isBot: false,
          });
        }
      }
      // v17.2: Строго 1 на 1 — максимум 2 игрока за столом! Если 2 друга уже сидят, 3-го сразу уводим на свежий стол, не ломая пару.
      const realSorted = [...list].sort((a, b) => (a.joinedAt - b.joinedAt) || a.uid.localeCompare(b.uid));
      const othersCount = realSorted.filter((p) => p.uid !== this.myUid).length;
      const inTopTwo = realSorted.slice(0, MAX_DUEL_PLAYERS).some((p) => p.uid === this.myUid);
      const roomIsFullForMe =
        (othersCount >= MAX_DUEL_PLAYERS && !inTopTwo) ||
        (realSorted.length > MAX_DUEL_PLAYERS && !inTopTwo);
      if (roomIsFullForMe) {
        if (this._bouncingRoomFull) return;
        this._bouncingRoomFull = true;
        try { ch.untrack(); } catch { /* ignore */ }
        this.onToast?.('⚔️ За этим столом уже играют двое друзей (1 на 1)! Открываем твой новый стол…');
        this.leaveRoom(false);
        window.setTimeout(() => {
          this.onRoomFull?.();
        }, 60);
        return;
      }

      const myLocal = this.players.find((p) => p.uid === this.myUid) || {
        uid: this.myUid,
        name: this.myName,
        avatar: this.myAvatar,
        joinedAt: Date.now(),
        isBot: false,
      };
      const realWithSelf = realSorted.some((p) => p.uid === this.myUid)
        ? realSorted
        : [myLocal, ...realSorted];
      const bots = this.players.filter((p) => p.isBot);
      const merged = [...realWithSelf, ...bots]
        .sort((a, b) => (a.joinedAt - b.joinedAt) || a.uid.localeCompare(b.uid))
        .slice(0, MAX_DUEL_PLAYERS);

      if (merged.length > 0) {
        this.players = merged;
        if (this.phase === 'lobby' || this.phase === 'finished') {
          this.renderLobbyUI();
        } else if (this.phase === 'countdown' || this.phase === 'claim') {
          const presentUids = merged.map((p) => p.uid);
          const presentContenders = this.contenderUids.filter((u) => presentUids.includes(u));
          if (!this.soloMode && presentContenders.length < 2) {
            this.clearAllTimers();
            this._playerAnimating = false;
            this.setPhase('lobby');
            this.antePaidForRound = null;
            this.scene.setInteractive(false);
            this.onToast?.('⚠️ Соперник вышел из дуэли — возврат в лобби стола.');
            this.renderLobbyUI();
          } else if (this.isHost() && this.phase === 'claim' && !this._playerAnimating) {
            const allPresentClaimed = presentContenders.every((u) => Object.values(this.claims).some((c) => c.uid === u));
            if (allPresentClaimed) {
              this.finalizeClaimsAndBroadcastReveal();
            }
          }
        }
      }
    });

    ch.on('broadcast', { event: 'duel_start' }, ({ payload }) => {
      if (!this.active || !payload) return;
      this.receiveRoundStart(payload);
    });

    ch.on('broadcast', { event: 'barrel_claim' }, ({ payload }) => {
      if (!this.active || !payload) return;
      this.applyBarrelClaim(payload, false);
    });

    ch.on('broadcast', { event: 'duel_chip_select' }, ({ payload }) => {
      if (!this.active || !payload?.uid) return;
      this.opponentChips[payload.uid] = payload.trophy || null;
      this.renderLobbyUI();
    });

    ch.on('broadcast', { event: 'duel_ante_failed' }, ({ payload }) => {
      if (!this.active || !payload || payload.roundKey !== this.roundKey) return;
      if (this.duelMode === 'chips' && this.roundKey) {
        const rk = this.roundKey;
        const tg = this.getTgUser?.();
        this.loadTrophiesMod().then((m) => m.cancelDuelChips(tg, rk)).catch(() => {});
      }
      this.contenderUids = this.contenderUids.filter((u) => u !== payload.uid);
      this.roundParticipants = this.roundParticipants.filter((u) => u !== payload.uid);
      if (this.contenderUids.length < 2) {
        this.clearAllTimers();
        this._playerAnimating = false;
        this.setPhase('lobby');
        this.antePaidForRound = null;
        this.scene.setInteractive(false);
        const msg =
          payload.reason === 'level_required'
            ? `🔒 У ${payload.name || 'игрока'} пока нет 3 уровня для «Дуэли на фишки» — фишки разблокированы.`
            : `⚠️ У ${payload.name || 'игрока'} закончились ❤️ для ставки — раунд остановлен.`;
        this.onToast?.(msg);
        this.renderLobbyUI();
      } else if (this.isHost() && this.phase === 'claim' && !this._playerAnimating) {
        const allLeftClaimed = this.contenderUids.every((u) => Object.values(this.claims).some((c) => c.uid === u));
        if (allLeftClaimed) this.finalizeClaimsAndBroadcastReveal();
      }
    });

    ch.on('broadcast', { event: 'duel_reveal' }, ({ payload }) => {
      if (!this.active || !payload) return;
      this.executeReveal(payload);
    });

    ch.on('broadcast', { event: 'chain_rattle' }, ({ payload }) => {
      if (!this.active || !payload) return;
      const now = Date.now();
      if (now - this._lastRemoteRattleAt < 2500) return;
      this._lastRemoteRattleAt = now;
      this.audio.playChainRattle(1.0);
      this.scene.triggerScreamerShake(0.42);
      Haptics.heavy();
      this.onToast?.(`⛓ ${payload.name || 'Зритель'} гремит цепями из нокаута!`);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.active) {
        await ch.track({
          uid: this.myUid,
          name: this.myName,
          avatar: this.myAvatar,
          joinedAt: this.players[0]?.joinedAt || Date.now(),
        });
      }
    });

    this.channel = ch;
  }

  broadcast(event, payload) {
    if (!this.channel) return;
    try {
      this.channel.send({
        type: 'broadcast',
        event,
        payload,
      });
    } catch { /* ignore */ }
  }

  getShareLinks() {
    return buildDuelShareLinks(this.roomId);
  }

  renderLobbyUI() {
    const slotsEl = document.getElementById('duel-slots-row');
    const potEl = document.getElementById('duel-pot-banner');
    const startBtn = document.getElementById('btn-duel-start-go');
    const invite3Btn = document.getElementById('btn-duel-invite-third');
    const roomTag = document.getElementById('duel-room-code');

    if (roomTag) roomTag.textContent = `СТОЛ #${this.roomId.toUpperCase()}`;

    const count = this.players.length;
    const isChipsMode = this.duelMode === 'chips';
    const chipsUnlocked = Boolean(this.hofCache?.chipDuelUnlocked);
    this.updateModeTabsUI();
    if (potEl) {
      if (isChipsMode) {
        potEl.removeAttribute('hidden');
        potEl.textContent = chipsUnlocked ? '🪙 Выбери фишку' : '🔒 Откроется на 3 уровне';
        potEl.classList.toggle('is-triple-bonus', chipsUnlocked);
      } else {
        potEl.setAttribute('hidden', '');
        potEl.classList.remove('is-triple-bonus');
      }
    }

    const isPlaying = this.phase === 'countdown' || this.phase === 'claim' || this.phase === 'reveal';
    const isFinished = this.phase === 'finished';
    const overlayEl = document.getElementById('duel-overlay');
    overlayEl?.classList.toggle('is-playing', isPlaying);
    overlayEl?.classList.toggle('is-finished', isFinished);
    const liveMiniBar = document.getElementById('duel-live-mini-bar');
    if (liveMiniBar) {
      if (isPlaying || isFinished) {
        liveMiniBar.removeAttribute('hidden');
        const miniStatus = document.getElementById('duel-live-mini-status');
        if (miniStatus) {
          const vsTil = this.players.some((p) => p.isBot && (p.isTil || p.uid === TIL_BOT_UID));
          const vsBot = this.players.some((p) => p.isBot);
          miniStatus.textContent = isFinished
            ? 'ИТОГ'
            : vsTil
              ? `ТИЛЬ · ${this.barrelCount || 6}`
              : vsBot
                ? `БОТ · ${this.barrelCount || 6}`
                : `1×1 · ${this.barrelCount || 6}`;
        }
      } else {
        liveMiniBar.setAttribute('hidden', '');
      }
    }

    const shareLinkBtn = document.getElementById('btn-duel-share-link');
    if (invite3Btn) invite3Btn.setAttribute('hidden', '');
    if (shareLinkBtn) {
      shareLinkBtn.textContent = 'Отправить ссылку другу';
      if (count < MAX_DUEL_PLAYERS && (this.phase === 'lobby' || this.phase === 'finished')) {
        shareLinkBtn.removeAttribute('hidden');
      } else {
        shareLinkBtn.setAttribute('hidden', '');
      }
    }

    this.syncEnergyUI();

    if (slotsEl) {
      slotsEl.textContent = '';
      for (let i = 0; i < MAX_DUEL_PLAYERS; i++) {
        const p = this.players[i];
        const card = document.createElement('div');
        if (p) {
          const isTil = Boolean(p.isTil || p.uid === TIL_BOT_UID);
          card.className = `duel-slot-card is-filled${isTil ? ' is-til-player' : ''}`;
          const avaWrap = document.createElement('div');
          avaWrap.className = 'duel-slot-avatar';
          const resolvedAva = isTil
            ? TIL_AVATAR_URL
            : p.avatar && /^(https?:\/\/|\.?\/|data:image\/)/i.test(String(p.avatar))
              ? p.avatar
              : p.uid === this.myUid
                ? (this.myAvatar || getFallbackFighterAvatar(p.uid))
                : getFallbackFighterAvatar(p.uid || p.name);
          const img = document.createElement('img');
          img.src = resolvedAva;
          img.alt = p.name || '';
          img.className = 'duel-slot-avatar-img';
          img.onerror = () => { img.src = isTil ? TIL_AVATAR_URL : FIGHTER_AVATARS[0]; };
          avaWrap.appendChild(img);
          const meta = document.createElement('div');
          meta.className = 'duel-slot-meta';
          const st = document.createElement('strong');
          st.textContent = p.name || 'Игрок';
          const sub = document.createElement('span');
          sub.textContent = p.uid === this.myUid ? 'Вы' : isTil ? 'Тиль' : 'Друг';
          meta.append(st, sub);
          card.append(avaWrap, meta);
        } else {
          card.className = 'duel-slot-card is-empty';
          const avaWrap = document.createElement('div');
          avaWrap.className = 'duel-slot-avatar';
          const sp = document.createElement('span');
          sp.className = 'duel-slot-initials';
          sp.textContent = '+';
          avaWrap.appendChild(sp);
          const meta = document.createElement('div');
          meta.className = 'duel-slot-meta';
          const st = document.createElement('strong');
          st.textContent = 'Ждём друга';
          const sub = document.createElement('span');
          sub.textContent = 'Выбери ниже';
          meta.append(st, sub);
          card.append(avaWrap, meta);
        }
        slotsEl.appendChild(card);
      }
    }

    this.renderFriendPickerUI();

    const soloBtn = document.getElementById('btn-duel-play-solo');
    if (soloBtn) {
      if (this.phase === 'lobby' && !isChipsMode && count < MAX_DUEL_PLAYERS) soloBtn.removeAttribute('hidden');
      else soloBtn.setAttribute('hidden', '');
    }

    if (startBtn) {
      if (this.phase !== 'lobby' || (count < MAX_DUEL_PLAYERS && !isChipsMode)) {
        startBtn.setAttribute('hidden', '');
      } else {
        startBtn.removeAttribute('hidden');
        if (isChipsMode && !chipsUnlocked) {
          startBtn.disabled = true;
          startBtn.textContent = '🔒 Откроется на 3 уровне';
        } else if (isChipsMode && !this.selectedAnteTrophyId) {
          startBtn.disabled = true;
          startBtn.textContent = '🪙 Выбери фишку выше';
        } else if (count < MAX_DUEL_PLAYERS) {
          startBtn.disabled = true;
          startBtn.textContent = 'Ждём друга…';
        } else if (!this.isHost()) {
          startBtn.disabled = true;
          startBtn.textContent = 'Ждём старта…';
        } else {
          startBtn.disabled = false;
          startBtn.textContent = isChipsMode ? 'Старт на фишки' : 'Старт 1×1';
        }
      }
    }
  }

  async refreshFriendPicker() {
    if (!this.loadDuelCandidates) return;
    try {
      const res = await this.loadDuelCandidates();
      if (!this.active) return;
      const sent = Array.isArray(res?.sent) ? res.sent : [];
      const branch = Array.isArray(res?.branch) ? res.branch : [];
      this.duelCandidates = { sent, branch, loaded: true };
      if (sent.length === 0 && branch.length > 0) {
        this.pickerTab = 'branch';
      }
      this.renderFriendPickerUI();
    } catch {
      this.duelCandidates = { sent: [], branch: [], loaded: true };
      this.renderFriendPickerUI();
    }
  }

  renderFriendPickerUI() {
    const host = document.getElementById('duel-friend-picker');
    if (!host) return;
    const showPicker = this.phase === 'lobby' && this.players.length < MAX_DUEL_PLAYERS;
    if (!showPicker) {
      host.setAttribute('hidden', '');
      return;
    }
    host.removeAttribute('hidden');
    host.textContent = '';

    const sentList = this.duelCandidates?.sent || [];
    const branchList = this.duelCandidates?.branch || [];

    const tabs = document.createElement('div');
    tabs.className = 'dfp-tabs';
    tabs.setAttribute('role', 'tablist');

    const tabSent = document.createElement('button');
    tabSent.type = 'button';
    tabSent.id = 'btn-dfp-tab-sent';
    tabSent.className = `dfp-tab${this.pickerTab === 'sent' ? ' is-active' : ''}`;
    tabSent.textContent = `Мои друзья (${sentList.length})`;
    tabSent.addEventListener('click', () => {
      Haptics.light();
      this.pickerTab = 'sent';
      this.renderFriendPickerUI();
    });

    const tabBranch = document.createElement('button');
    tabBranch.type = 'button';
    tabBranch.id = 'btn-dfp-tab-branch';
    tabBranch.className = `dfp-tab${this.pickerTab === 'branch' ? ' is-active' : ''}`;
    tabBranch.textContent = `Ветка (${branchList.length})`;
    tabBranch.addEventListener('click', () => {
      Haptics.light();
      this.pickerTab = 'branch';
      this.renderFriendPickerUI();
    });

    tabs.append(tabSent, tabBranch);
    host.appendChild(tabs);

    const items = this.pickerTab === 'branch' ? branchList : sentList;
    const listEl = document.createElement('div');
    listEl.className = 'dfp-list';

    if (!this.duelCandidates?.loaded) {
      const loadMsg = document.createElement('p');
      loadMsg.className = 'dfp-empty';
      loadMsg.textContent = 'Загрузка…';
      listEl.appendChild(loadMsg);
    } else if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dfp-empty-box';
      const txt = document.createElement('p');
      txt.className = 'dfp-empty';
      txt.textContent = 'Пока нет друзей — отправь ссылку ниже';
      empty.appendChild(txt);
      listEl.appendChild(empty);
    } else {
      items.slice(0, 15).forEach((friend) => {
        const row = document.createElement('div');
        row.className = 'dfp-row';

        const left = document.createElement('div');
        left.className = 'dfp-left';

        const ava = document.createElement('div');
        ava.className = 'dfp-ava';
        const avaUrl = String(friend.avatar_url || '').trim();
        const img = document.createElement('img');
        img.src = avaUrl && /^(https?:\/\/|\.?\/|data:image\/)/i.test(avaUrl)
          ? avaUrl
          : getFallbackFighterAvatar(friend.uid || friend.tg_id || friend.name);
        img.alt = friend.name || 'Друг';
        img.onerror = () => { img.src = FIGHTER_AVATARS[0]; };
        ava.appendChild(img);

        const info = document.createElement('div');
        info.className = 'dfp-info';
        const nameEl = document.createElement('strong');
        nameEl.textContent = friend.name || 'Друг';
        const tagEl = document.createElement('span');
        tagEl.textContent = this.pickerTab === 'branch'
          ? `Колено ${Math.max(1, Number(friend.hop || 1))}`
          : friend.opened_barrel ? 'В игре' : 'Приглашён';
        info.append(nameEl, tagEl);
        left.append(ava, info);

        const key = String(friend.uid || friend.tg_id || friend.name || '');
        const alreadySent = this.challengedUids.has(key);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `dfp-btn${alreadySent ? ' is-sent' : ''}`;
        btn.disabled = alreadySent;
        btn.textContent = alreadySent ? '✓ Позван' : 'Вызвать';
        btn.addEventListener('click', async () => {
          Haptics.medium();
          this.challengedUids.add(key);
          btn.disabled = true;
          btn.classList.add('is-sent');
          btn.textContent = 'Зовём…';
          try {
            await this.onChallengeFriend?.(friend, this.roomId);
            btn.textContent = '✓ Позван';
          } catch {
            this.challengedUids.delete(key);
            btn.disabled = false;
            btn.classList.remove('is-sent');
            btn.textContent = 'Вызвать';
          }
        });

        row.append(left, btn);
        listEl.appendChild(row);
      });
    }

    host.appendChild(listEl);
  }

  async startSoloDuel({ huntFriendBarrel = undefined } = {}) {
    if (!this.active || this._soloStarting || this.phase !== 'lobby') return;
    this._soloStarting = true;
    const soloBtn = document.getElementById('btn-duel-play-solo');
    if (soloBtn) soloBtn.disabled = true;
    try {
      this.soloMode = true;
      if (typeof huntFriendBarrel === 'boolean') {
        this.friendBarrelHunt = huntFriendBarrel;
      }
      const hasChallenger = this.players.some((p) => p.uid !== this.myUid);
      if (!hasChallenger) {
        this.players.push({
          uid: TIL_BOT_UID,
          name: TIL_BOT_NAME,
          avatar: TIL_AVATAR_URL,
          joinedAt: Date.now() + 10,
          isBot: true,
          isTil: true,
        });
      }
      this.renderLobbyUI();
      document.getElementById('duel-overlay')?.classList.add('is-playing');
      document.getElementById('duel-live-mini-bar')?.removeAttribute('hidden');
      await this.hostInitiateRound();
    } finally {
      this._soloStarting = false;
      if (soloBtn) soloBtn.disabled = false;
    }
  }

  /**
   * Запуск волны за столом «На счёт три!»:
   * В цеху стоят все 10 бочек (5 живых, 5 со скримерами).
   * Вскрытые бочки НЕ обновляются между волнами ничьей и Суперфинала 1х1 — игроки добивают оставшиеся
   * закрытые бочки, и только когда закрытых бочек остаётся меньше числа бьющихся игроков, выкатывается новая партия 10 бочек!
   */
  async hostInitiateRound({ isFreeRerack = false, suddenDeathContenders = null } = {}) {
    if (this._roundStarting) return;
    if (this.players.length < 2) {
      this.onToast?.('Позови хотя бы одного друга за стол (или добавь бота в Тест-Боге)!');
      return;
    }
    this._roundStarting = true;
    this._roundStartingSince = Date.now();
    try {
      const contenders = suddenDeathContenders || this.players.map((p) => p.uid);
      const TIERS = [6, 8, 10, 12];
      const roundIdx = Math.max(0, Number(this.tilRoundIdx || 0));
      const barrelCount = isFreeRerack
        ? (this.barrelCount || 6)
        : TIERS[Math.min(TIERS.length - 1, roundIdx)];

      const prevOpened = isFreeRerack ? [...this.openedIndices] : [];
      const closedRemaining = Array.from({ length: barrelCount }, (_, i) => i).filter(
        (i) => !prevOpened.includes(i)
      );

      const minNeed = this.friendBarrelHunt ? 1 : contenders.length;
      const needFreshRack = !isFreeRerack || closedRemaining.length < minNeed || !this.safeIndices.length;

      let safeIndices = this.safeIndices;
      let openedIndices = prevOpened;
      let barrelLoot = this.barrelLoot || {};
      let batchHasTicket = Boolean(this.batchHasTicket);

      if (needFreshRack) {
        if (!isFreeRerack) {
          this.tilRoundIdx = roundIdx + 1;
        }
        const indices = Array.from({ length: barrelCount }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const isFriendHunt = Boolean(this.friendBarrelHunt && this.soloMode);
        const pointTiers = [350, 250, 150];
        barrelLoot = {};
        safeIndices = [];
        let cursor = 0;

        if (isFriendHunt) {
          batchHasTicket = false;
          const fIdx = indices[cursor++];
          barrelLoot[fIdx] = { kind: 'friend_barrel', value: 200, label: 'Пустая бочка для друга!' };
          safeIndices.push(fIdx);

          if (cursor < barrelCount) {
            const cIdx = indices[cursor++];
            barrelLoot[cIdx] = { kind: 'chip', value: 150, label: 'Фишка' };
            safeIndices.push(cIdx);
          }
          if (cursor < barrelCount) {
            const pIdx = indices[cursor++];
            barrelLoot[pIdx] = { kind: 'points', value: 150, label: '+150' };
            safeIndices.push(pIdx);
          }
          if (cursor < barrelCount) {
            const lIdx = indices[cursor++];
            barrelLoot[lIdx] = { kind: 'life', value: 1, label: '+1 жизнь' };
            safeIndices.push(lIdx);
          }
          if (cursor < barrelCount) {
            const eIdx = indices[cursor++];
            barrelLoot[eIdx] = { kind: 'empty', value: 0, label: 'Пусто' };
          }
          while (cursor < barrelCount) {
            const sIdx = indices[cursor++];
            barrelLoot[sIdx] = { kind: 'screamer', value: -2, label: 'Потерял жизнь' };
          }
        } else {
          const diff = getTilDifficultyProfile(this.duelLives, Math.max(0, Number(this.tilRoundIdx || 1) - 1));
          if (!isFreeRerack) {
            this.tilMaxLives = diff.tier === 'rage' ? 4 : 3;
            this.tilLives = this.tilMaxLives;
          }
          batchHasTicket = (this.duelRoundsWithoutTicket || 0) >= 1 ? true : Math.random() < 0.65;

          const baseScreamers = barrelCount <= 6 ? 1 : barrelCount <= 8 ? 2 : 3;
          const totalScreamers = Math.min(Math.max(1, barrelCount - 2), baseScreamers + diff.extraScreamers);
          const emptySlots = barrelCount <= 6 ? (diff.extraScreamers > 0 ? 0 : 1) : barrelCount <= 8 ? 1 : 2;
          const reservedForTraps = totalScreamers + emptySlots;
          const goodBudget = Math.max(2, barrelCount - reservedForTraps);

          if (batchHasTicket && safeIndices.length < goodBudget && cursor < barrelCount) {
            const tIdx = indices[cursor++];
            barrelLoot[tIdx] = { kind: 'ticket', value: 1000, label: '🎟 Часть билета!' };
            safeIndices.push(tIdx);
          }

          if (safeIndices.length < goodBudget && cursor < barrelCount) {
            const cIdx = indices[cursor++];
            barrelLoot[cIdx] = { kind: 'chip', value: 150, label: '💎 Фишка!' };
            safeIndices.push(cIdx);
          }

          if (safeIndices.length < goodBudget && cursor < barrelCount) {
            const eEnergyIdx = indices[cursor++];
            barrelLoot[eEnergyIdx] = { kind: 'energy', value: 50, label: '⚡ +50% энергии' };
            safeIndices.push(eEnergyIdx);
          }

          if (safeIndices.length < goodBudget && cursor < barrelCount) {
            const lIdx = indices[cursor++];
            barrelLoot[lIdx] = { kind: 'life', value: 1, label: '❤️ +1 жизнь' };
            safeIndices.push(lIdx);
          }

          while (safeIndices.length < goodBudget && cursor < barrelCount) {
            const pIdx = indices[cursor++];
            const val = pointTiers[(safeIndices.length) % pointTiers.length];
            barrelLoot[pIdx] = { kind: 'points', value: val, label: `+${val} ⭐` };
            safeIndices.push(pIdx);
          }

          for (let e = 0; e < emptySlots && cursor < barrelCount - totalScreamers; e++) {
            const eIdx = indices[cursor++];
            barrelLoot[eIdx] = { kind: 'empty', value: 0, label: 'Пусто' };
          }

          while (cursor < barrelCount) {
            const sIdx = indices[cursor++];
            barrelLoot[sIdx] = {
              kind: 'screamer',
              value: -diff.screamerDamage,
              label: `-${diff.screamerDamage} ❤️`,
            };
          }
        }
        openedIndices = [];
        this.batchResolved = false;
      }

      const roundKey =
        isFreeRerack && this.roundKey
          ? this.roundKey
          : `rk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const payload = {
        roundKey,
        duelMode: this.duelMode === 'chips' ? 'chips' : 'classic',
        isFreeRerack: Boolean(isFreeRerack),
        resetRack: needFreshRack,
        isSuddenDeath: Boolean(suddenDeathContenders),
        contenderUids: contenders,
        roundParticipants: Array.from(new Set(contenders)),
        spectatorUids: this.players.map((p) => p.uid).filter((u) => !contenders.includes(u)),
        barrelCount,
        safeIndices,
        barrelLoot,
        batchHasTicket,
        openedIndices,
      };

      this.broadcast('duel_start', payload);
      await this.receiveRoundStart(payload);
    } finally {
      this._roundStarting = false;
    }
  }

  async receiveRoundStart(payload) {
    this.clearAllTimers();
    this.clearBarrelClaimBadges();
    this._playerAnimating = false;
    this._playerAnimatingSince = 0;
    this._tilState = 'idle';
    this._tilTelegraphBarrel = -1;
    if (this.scene) {
      this.scene.diving = false;
      this.scene.setDuelDirectClick?.(true);
      this.scene.setBarrelTelegraph?.(-1, false);
    }

    this.roundKey = payload.roundKey;
    if (payload.duelMode === 'chips' || payload.duelMode === 'classic') {
      this.duelMode = payload.duelMode;
    }
    this.contenderUids = payload.contenderUids || this.players.map((p) => p.uid);
    if (!payload.isFreeRerack) {
      this.roundParticipants = Array.from(
        new Set(payload.roundParticipants || this.players.map((p) => p.uid))
      );
    } else if (!this.roundParticipants?.length) {
      this.roundParticipants = Array.from(new Set(this.contenderUids));
    }
    this.spectatorUids = payload.spectatorUids || [];
    this.barrelCount = payload.barrelCount || 6;
    this.safeIndices = payload.safeIndices || [0, 2, 4, 6, 8];
    this.barrelLoot = payload.barrelLoot || this.barrelLoot || {};
    this.batchHasTicket = Boolean(payload.batchHasTicket);
    this.openedIndices = Array.isArray(payload.openedIndices) ? [...payload.openedIndices] : [];
    this.claims = {};

    document.getElementById('duel-result-box')?.setAttribute('hidden', '');
    document.getElementById('btn-duel-start-go')?.setAttribute('hidden', '');
    document.getElementById('btn-duel-invite-third')?.setAttribute('hidden', '');

    const amISpectator = this.spectatorUids.includes(this.myUid);
    const specBar = document.getElementById('duel-spectator-bar');
    if (specBar) {
      if (amISpectator) specBar.removeAttribute('hidden');
      else specBar.setAttribute('hidden', '');
    }

    // Списываем ставку 1 ❤️ (и блокируем фишку) строго в живом 1×1 PvP — в соло против Тиля жизни считаются через duelLives (6 ❤️)!
    if (!this.soloMode && !payload.isFreeRerack && !amISpectator && this.antePaidForRound !== this.roundKey) {
      const ante = await startDuelAnte(this.getTgUser?.(), this.roomId, this.roundKey, {
        duelMode: this.duelMode,
        anteTrophyId: this.duelMode === 'chips' ? this.selectedAnteTrophyId : null,
      }).catch(() => ({ ok: false, reason: 'network_error' }));
      if (!ante.ok) {
        this.broadcast('duel_ante_failed', {
          uid: this.myUid,
          name: this.myName,
          roundKey: this.roundKey,
          reason: ante.reason || 'no_lives',
        });
        if (this.duelMode === 'chips') {
          this.loadTrophiesMod()
            .then((m) => m.cancelDuelChips(this.getTgUser?.(), this.roundKey))
            .catch(() => {});
          this.setPhase('lobby');
          const msg =
            ante.reason === 'level_required'
              ? '🔒 Дуэль на фишки откроется на 3 уровне (пригласи 3 друзей)!'
              : ante.reason === 'trophy_required' || ante.reason === 'trophy_not_found'
                ? '🪙 Сначала выбери свободную фишку из Зала славы!'
                : ante.reason === 'trophy_locked'
                  ? '🔒 Эта фишка уже участвует в другом бою — выбери другую!'
                  : '⚠️ Не удалось выставить ставку — возврат в лобби.';
          this.onToast?.(msg);
          this.renderLobbyUI();
          return;
        }
        this.setPhase('finished');
        this.showNoLivesPrompt();
        return;
      }
      this.antePaidForRound = this.roundKey;
      this.onProfileSync?.({ lives: ante.lives, premierePoints: ante.premierePoints });
    }

    this.renderLobbyUI();

    // Вскрытые бочки НЕ закрываются обратно, пока игроки не откроют всю партию!
    if (payload.resetRack !== false || this.openedIndices.length === 0) {
      this.scene.resetRound({
        barrelCount: this.barrelCount,
        targetIndex: this.safeIndices[0] ?? 0,
        golden: this.players.length >= 3,
      });
    } else {
      this.scene.setActiveBarrelCount(this.barrelCount);
      for (const idx of this.openedIndices) {
        if (!this.scene.barrels?.[idx]?.struck) {
          this.scene.triggerEmptyBarrelOpen(idx);
        }
      }
    }
    this.scene.setIdleHintPulse?.(false);
    // Обратный отсчёт: 1 — 2 — 3! Бочки интерактивны для перехвата фальстарта!
    this.startCountdownPhase();
  }

  startCountdownPhase() {
    if (!this.active) return;
    if (this._countdownTimers?.length) {
      this._countdownTimers.forEach((id) => clearTimeout(id));
      this._countdownTimers = [];
    }
    this.clearIdleHint();
    this.setPhase('countdown');
    this.renderLobbyUI();

    const amISpectator = this.spectatorUids.includes(this.myUid);
    if (this.scene) {
      this.scene.diving = false;
      this.scene.setDuelDirectClick?.(true);
      this.scene.setInteractive(!amISpectator);
    }

    const banner = document.getElementById('duel-countdown-banner');
    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');
    banner?.classList.remove('is-false-start', 'is-go');
    if (bannerSub) bannerSub.setAttribute('hidden', '');
    banner?.removeAttribute('hidden');

    const steps = ['1', '2', 'БЕЙ!'];
    steps.forEach((word, i) => {
      const tid = window.setTimeout(() => {
        if (!this.active || this.phase !== 'countdown') return;
        const isGo = i === 2;
        if (bannerText) bannerText.textContent = word;
        banner?.classList.toggle('is-go', isGo);
        this.audio.playCountdownBeat(isGo);
        if (isGo) {
          Haptics.heavy();
          this.beginClaimWindow();
          const hideId = window.setTimeout(() => {
            if (this.active && this.phase === 'claim') {
              banner?.setAttribute('hidden', '');
            }
          }, 420);
          this._countdownTimers.push(hideId);
        } else {
          Haptics.light();
        }
      }, i * COUNTDOWN_STEP_MS);
      this._countdownTimers.push(tid);
    });
  }

  handleFalseStart() {
    if (!this.active || this.phase !== 'countdown') return false;
    this.falseStartCount = (this.falseStartCount || 0) + 1;
    if (this._countdownTimers?.length) {
      this._countdownTimers.forEach((id) => clearTimeout(id));
      this._countdownTimers = [];
    }
    if (this._falseStartResetTimer) {
      clearTimeout(this._falseStartResetTimer);
      this._falseStartResetTimer = null;
    }
    this._phaseEnteredAt = Date.now();
    this.audio?.playFalseStartBuzz?.();
    Haptics.error();
    this.scene?.triggerScreamerShake?.(0.28);

    const banner = document.getElementById('duel-countdown-banner');
    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');
    banner?.removeAttribute('hidden');
    banner?.classList.remove('is-go');
    banner?.classList.add('is-false-start');
    if (bannerText) bannerText.textContent = 'ФАЛЬСТАРТ!';
    if (bannerSub) {
      bannerSub.textContent = 'Жди команды БЕЙ!';
      bannerSub.removeAttribute('hidden');
    }

    this._falseStartResetTimer = window.setTimeout(() => {
      this._falseStartResetTimer = null;
      if (!this.active || this.phase !== 'countdown') return;
      this.startCountdownPhase();
    }, 850);
    return true;
  }

  syncFromProfile(profile = null) {
    if (!profile || typeof profile !== 'object') return;
    if (typeof profile.lives === 'number' && this.phase !== 'idle') {
      const nextL = Math.max(0, Math.min(30, Math.round(Number(profile.lives))));
      if (nextL > this.duelLives) {
        this.duelLives = nextL;
      }
    }
    this.syncEnergyUI();
  }

  refillFromTil() {
    const profLives = Number(this.getProfileStats?.()?.lives ?? 0);
    this.duelLives = Math.max(6, Math.min(30, Math.max(Number(this.duelLives || 0), profLives, 6)));
    this.energy = 100;
    this.syncEnergyUI();
  }

  syncEnergyUI() {
    const valEl = document.getElementById('duel-energy-val');
    const fillEl = document.getElementById('duel-energy-fill');
    const shardsEl = document.getElementById('duel-shards-val');
    const livesEl = document.getElementById('duel-lives-val');
    const livesPill = document.getElementById('duel-lives-pill');
    const skipBtn = document.getElementById('btn-duel-skip-strike');
    const statusEl = document.getElementById('duel-live-mini-status');
    const timerEl = document.getElementById('duel-live-timer');

    const pAvaEl = document.getElementById('duel-vs-player-ava');
    const pHpFill = document.getElementById('duel-vs-player-hp-fill');
    const pChipsEl = document.getElementById('duel-vs-player-chips-val');
    const pPtsEl = document.getElementById('duel-vs-player-pts-val');
    const oWrap = document.getElementById('duel-vs-opp-wrap');
    const rageBadge = document.getElementById('duel-til-rage-badge');
    const oHpFill = document.getElementById('duel-vs-opp-hp-fill');
    const oLivesEl = document.getElementById('duel-vs-opp-lives-val');
    const oEnergyFill = document.getElementById('duel-vs-opp-energy-fill');
    const oNameEl = document.getElementById('duel-vs-opp-name');
    const oAvaEl = document.getElementById('duel-vs-opp-ava');
    const oTicketsEl = document.getElementById('duel-vs-opp-tickets-val');
    const oChipsEl = document.getElementById('duel-vs-opp-chips-val');
    const oPtsEl = document.getElementById('duel-vs-opp-pts-val');
    const spLabelEl = document.getElementById('duel-superprize-label');
    const spFillEl = document.getElementById('duel-superprize-fill');

    const pct = Math.max(0, Math.min(100, Math.round(Number(this.energy || 0))));
    const dl = Math.max(0, Math.round(Number(this.duelLives ?? 6)));
    const profStats = this.getProfileStats?.() || {};
    const shards = Math.max(0, Math.min(4, Math.round(Number(this.getTicketShards?.() ?? profStats.ticketShards ?? 0))));
    const roundDisplay = Math.max(1, Number(this.tilRoundIdx || 1));
    const diff = getTilDifficultyProfile(dl, roundDisplay - 1);

    if (pAvaEl) {
      const targetSrc = this.myAvatar || getFallbackFighterAvatar(this.myUid);
      if (pAvaEl.getAttribute('src') !== targetSrc) pAvaEl.src = targetSrc;
      pAvaEl.onerror = () => { pAvaEl.src = FIGHTER_AVATARS[0]; };
    }
    if (shardsEl) shardsEl.textContent = `${shards}/4`;
    if (valEl) valEl.textContent = `${pct}%`;
    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      fillEl.classList.toggle('is-low', pct <= 20);
    }
    if (livesEl) livesEl.textContent = String(dl);
    if (livesPill) livesPill.classList.toggle('is-low', dl <= 1);
    if (pHpFill) {
      const hpDenom = Math.max(6, dl > 12 ? 18 : dl > 6 ? 12 : 6);
      pHpFill.style.width = `${Math.min(100, Math.round((dl / hpDenom) * 100))}%`;
    }
    if (pChipsEl) pChipsEl.textContent = String(Math.max(0, Number(profStats.chipsCount || this.sessionStats?.playerChips || 0)));
    const totalPts = Math.max(0, Math.round(Number(profStats.premierePoints ?? this.sessionStats?.playerPoints ?? 0)));
    if (pPtsEl) pPtsEl.textContent = String(totalPts);

    const spPct = Math.min(100, Math.max(0, (totalPts / SUPERPRIZE_POINTS_TARGET) * 100));
    if (spLabelEl) spLabelEl.textContent = `До суперприза: ${totalPts.toLocaleString('ru-RU')} / 5 000 очков`;
    if (spFillEl) spFillEl.style.width = `${spPct.toFixed(1)}%`;

    const opp = this.players.find((p) => p.uid !== this.myUid) || null;
    const oppIsTil = !opp || Boolean(opp.isBot || opp.isTil || opp.uid === TIL_BOT_UID);
    const tilHp = Math.max(0, Number(this.tilLives ?? 3));
    const tilMax = Math.max(1, Number(this.tilMaxLives || 3));
    if (oLivesEl) oLivesEl.textContent = String(tilHp);
    if (oHpFill) oHpFill.style.width = `${Math.min(100, Math.round((tilHp / tilMax) * 100))}%`;
    if (oNameEl) oNameEl.textContent = oppIsTil ? 'Тиль ⚡' : `${String(opp.name || 'Соперник').slice(0, 10)} ⚡`;
    if (oAvaEl) {
      const oSrc = oppIsTil ? TIL_AVATAR_URL : (opp?.avatar || getFallbackFighterAvatar(opp?.uid || opp?.name));
      if (oAvaEl.getAttribute('src') !== oSrc) oAvaEl.src = oSrc;
      oAvaEl.onerror = () => { oAvaEl.src = TIL_AVATAR_URL; };
    }
    if (oEnergyFill) {
      const chargeDur = Math.max(800, diff.tilTelegraphMs + diff.tilTelegraphDurMs);
      const oppPct = this._tilState === 'struck'
        ? 100
        : this.phase === 'claim'
          ? Math.min(100, Math.round((Number(this._activeClaimElapsedMs || 0) / chargeDur) * 100))
          : 0;
      oEnergyFill.style.width = `${oppPct}%`;
    }
    if (oTicketsEl) oTicketsEl.textContent = String(this.sessionStats?.oppTickets || 0);
    if (oChipsEl) oChipsEl.textContent = String(this.sessionStats?.oppChips || 0);
    if (oPtsEl) oPtsEl.textContent = String(this.sessionStats?.oppPoints || 0);

    const isRage = Boolean(this.soloMode && diff.tier === 'rage');
    if (oWrap) oWrap.classList.toggle('is-til-rage', isRage);
    if (rageBadge) {
      if (isRage) rageBadge.removeAttribute('hidden');
      else rageBadge.setAttribute('hidden', '');
    }

    if (timerEl) {
      timerEl.textContent = `${Math.max(0, Number(this.claimTimeLeft || 0)).toFixed(1)}с`;
      timerEl.classList.toggle('is-telegraph', this._tilState === 'telegraph');
    }
    if (statusEl) {
      statusEl.textContent = `Р${Math.min(4, roundDisplay)}`;
    }
    if (skipBtn) {
      const hasMyClaim = Object.values(this.claims || {}).some((c) => c.uid === this.myUid);
      const canSkip = this.phase === 'claim' && !this.skippedThisTurn && !hasMyClaim && !this.spectatorUids.includes(this.myUid);
      if (canSkip) skipBtn.removeAttribute('hidden');
      else skipBtn.setAttribute('hidden', '');
    }
  }

  skipCurrentStrike() {
    if (!this.active || this.phase !== 'claim' || this.skippedThisTurn) return;
    const hasMyClaim = Object.values(this.claims || {}).some((c) => c.uid === this.myUid);
    if (hasMyClaim) return;
    this.skippedThisTurn = true;
    this.syncEnergyUI();
    Haptics.light();
  }

  triggerDefeatFlow() {
    document.getElementById('duel-result-box')?.setAttribute('hidden', '');
    const oceanAllowed = this.canUseOceanRefill ? Boolean(this.canUseOceanRefill()) : true;
    if (this.onDefeatCinematic) {
      this.onDefeatCinematic({ oceanAllowed, roomId: this.roomId, solo: this.soloMode });
      return;
    }
    if (!oceanAllowed && this.onOpenPackForLives) {
      this.onOpenPackForLives();
      return;
    }
    if (this.onDuelDefeatToTil) {
      this.onDuelDefeatToTil({ roomId: this.roomId, solo: this.soloMode });
    }
  }

  continueBatchOrRematch() {
    if (!this.active || this._roundStarting) return;
    if (this.duelLives <= 0) {
      this.triggerDefeatFlow();
      return;
    }
    // Если жизни ещё есть (> 0 ❤️), а энергия на нуле — восстанавливаем энергию без ухода к Тилю!
    if (this.energy <= 0) {
      this.energy = 100;
      this.syncEnergyUI();
    }
    const closedLeft = Math.max(0, (this.barrelCount || 6) - (this.openedIndices?.length || 0));
    const keepCurrentBatch = !this.batchResolved && closedLeft >= (this.friendBarrelHunt ? 1 : 2);
    this.hostInitiateRound({ isFreeRerack: keepCurrentBatch });
  }

  _pickFreeClosedBarrel(preferIdx = -1, { forBot = false } = {}) {
    const isAllowed = (b) => {
      if (b < 0 || b >= this.barrelCount) return false;
      if (this.openedIndices.includes(b) || this.claims[b]) return false;
      if (forBot && this.friendBarrelHunt && this.barrelLoot?.[b]?.kind === 'friend_barrel') return false;
      return true;
    };
    if (typeof preferIdx === 'number' && isAllowed(preferIdx)) {
      return preferIdx;
    }
    const free = [];
    for (let b = 0; b < this.barrelCount; b++) {
      if (isAllowed(b)) free.push(b);
    }
    if (!free.length) return -1;
    if (forBot && this.soloMode && !this.friendBarrelHunt) {
      const diff = getTilDifficultyProfile(this.duelLives, Math.max(0, Number(this.tilRoundIdx || 1) - 1));
      const prizePool = free.filter((b) => {
        const k = this.barrelLoot?.[b]?.kind;
        return k === 'ticket' || k === 'chip' || k === 'points' || k === 'energy' || k === 'life';
      });
      if (prizePool.length > 0 && Math.random() < diff.prizeSnipeChance) {
        return prizePool[Math.floor(Math.random() * prizePool.length)];
      }
    }
    return free[Math.floor(Math.random() * free.length)];
  }

  _executeTilBotStrike(bot, preferIdx = -1) {
    if (!this.active || this.phase !== 'claim') return false;
    const pick = this._pickFreeClosedBarrel(preferIdx, { forBot: true });
    this._tilTelegraphBarrel = -1;
    this.scene?.setBarrelTelegraph?.(-1, false);
    if (pick < 0) return false;
    this._tilState = 'struck';
    this.scene?.triggerStrikeFX?.(pick);
    this.audio?.playStrike?.(pick);
    this.applyBarrelClaim(
      {
        uid: bot.uid,
        name: bot.name,
        avatar: bot.avatar,
        barrelIndex: pick,
        ts: Date.now(),
      },
      false
    );
    return true;
  }

  beginClaimWindow() {
    this.setPhase('claim');
    const roundIdx = Math.max(0, Number(this.tilRoundIdx || 1) - 1);
    const diff = getTilDifficultyProfile(this.duelLives, roundIdx);
    const pacing = this.soloMode
      ? diff
      : { claimSec: 6.5, tilTelegraphMs: 4600, tilTelegraphDurMs: 750 };
    this.claimTimeLeft = pacing.claimSec;
    this._activeClaimElapsedMs = 0;
    this._tilState = 'idle';
    this._tilTelegraphBarrel = -1;
    this._playerAnimating = false;
    this._playerAnimatingSince = 0;
    this.skippedThisTurn = false;
    const amISpectator = this.spectatorUids.includes(this.myUid);
    this.syncEnergyUI();
    this.scheduleIdleHint();

    if (this.scene) {
      this.scene.diving = false;
      this.scene.setDuelDirectClick?.(true);
      this.scene.setBarrelTelegraph?.(-1, false);
      if (!amISpectator) {
        this.scene.setInteractive(true);
      }
    }

    if (this.roundWatchdogTimer) {
      clearTimeout(this.roundWatchdogTimer);
    }
    this.roundWatchdogTimer = window.setTimeout(() => {
      if (!this.active || (this.phase !== 'countdown' && this.phase !== 'claim')) return;
      if (this._playerAnimating || this.isExternalOverlayBlocking()) return;
      if (this.isHost()) {
        this.finalizeClaimsAndBroadcastReveal();
      } else if (this.players.filter((p) => this.contenderUids.includes(p.uid)).length < 2) {
        this.clearAllTimers();
        this._playerAnimating = false;
        this.setPhase('lobby');
        this.antePaidForRound = null;
        this.scene.setInteractive(false);
        this.renderLobbyUI();
      }
    }, 16000);

    // Не-соло боты в песочнице /testbog/ (с паузой при анимации/модалках)
    if (!this.soloMode) {
      this.players
        .filter((p) => p.isBot && this.contenderUids.includes(p.uid))
        .forEach((bot, idx) => {
          const delay = 1400 + idx * 550 + Math.round(Math.random() * 650);
          this.scheduleStepWhenUnblocked(() => {
            if (!this.active || this.phase !== 'claim' || this._playerAnimating) return;
            this._executeTilBotStrike(bot);
          }, delay);
        });
    }

    // В Суперфинале вылетевший бот-зритель тоже может погреметь цепями
    const botSpec = this.players.find((p) => p.isBot && this.spectatorUids.includes(p.uid));
    if (botSpec) {
      this.scheduleTimeout(() => {
        if (!this.active || this.phase !== 'claim') return;
        this.audio.playChainRattle(0.95);
        this.scene.triggerScreamerShake(0.35);
      }, 1500);
    }

    const timerEl = document.getElementById('duel-live-timer');
    let lastTs = performance.now();
    this.claimInterval = window.setInterval(() => {
      if (!this.active || this.phase !== 'claim') return;
      const now = performance.now();
      if (this._playerAnimating || this.isExternalOverlayBlocking()) {
        lastTs = now;
        return;
      }
      const dt = Math.min(0.25, (now - lastTs) / 1000);
      lastTs = now;
      this.claimTimeLeft = Math.max(0, this.claimTimeLeft - dt);
      this._activeClaimElapsedMs += dt * 1000;

      if (this.soloMode) {
        const tilBot = this.players.find((p) => p.isBot && this.contenderUids.includes(p.uid));
        if (tilBot) {
          const tilAlreadyClaimed = Object.values(this.claims).some((c) => c.uid === tilBot.uid);
          if (!tilAlreadyClaimed) {
            if (this._tilState === 'idle' && this._activeClaimElapsedMs >= pacing.tilTelegraphMs) {
              const pick = this._pickFreeClosedBarrel(-1, { forBot: true });
              if (pick >= 0) {
                this._tilState = 'telegraph';
                this._tilTelegraphBarrel = pick;
                this.scene?.setBarrelTelegraph?.(pick, true);
                this.scene?.triggerBarrelEerieFX?.(pick, 'knock_urgent');
                this.renderBarrelClaimBadges();
              }
            } else if (
              this._tilState === 'telegraph' &&
              this._activeClaimElapsedMs >= pacing.tilTelegraphMs + pacing.tilTelegraphDurMs
            ) {
              this._executeTilBotStrike(tilBot, this._tilTelegraphBarrel);
            }
          }
        }
      }

      if (timerEl) {
        timerEl.textContent = `${this.claimTimeLeft.toFixed(1)}с`;
        timerEl.classList.toggle('is-telegraph', this._tilState === 'telegraph');
      }
      const oppBarEl = document.getElementById('duel-vs-opp-energy-fill');
      if (oppBarEl) {
        const chargeDur = Math.max(800, (pacing.tilTelegraphMs || 4000) + (pacing.tilTelegraphDurMs || 700));
        const oppPct = this._tilState === 'struck'
          ? 100
          : Math.min(100, Math.round((this._activeClaimElapsedMs / chargeDur) * 100));
        oppBarEl.style.width = `${oppPct}%`;
      }

      const claimedCount = new Set(Object.values(this.claims).map((c) => c.uid)).size;
      const expectedClaimers = this.contenderUids.length - (this.skippedThisTurn ? 1 : 0);
      if (claimedCount >= Math.max(1, expectedClaimers) || this.claimTimeLeft <= 0) {
        clearInterval(this.claimInterval);
        this.claimInterval = null;
        if (this.isHost()) {
          this.finalizeClaimsAndBroadcastReveal();
        }
      }
    }, 60);
  }

  /**
   * Перехват удара по 3D бочке из main.js, когда активен стол «На счёт три!»
   */
  handleBarrelClick(barrelIndex, worldPoint) {
    if (!this.active) return false;
    if (this.phase === 'countdown') {
      if (this._playerAnimating || this.isExternalOverlayBlocking()) return true;
      if (this.spectatorUids.includes(this.myUid) || this.openedIndices.includes(barrelIndex)) return true;
      return this.handleFalseStart();
    }
    if (this.phase !== 'claim' || this._playerAnimating) return true;
    this.clearIdleHint();
    if (this.spectatorUids.includes(this.myUid)) {
      this.onToast?.('Ты в нокауте! Жми «⛓ Погреметь цепями» внизу экрана.');
      return true;
    }

    const existing = this.claims[barrelIndex];
    if (existing && existing.uid !== this.myUid) {
      Haptics.error();
      const bCode = BARREL_BATCH_CODES[barrelIndex] || String(barrelIndex + 1);
      this.onToast?.(`⚔️ Вы ударили в одну бочку №${bCode}! ${existing.name} успел чуть раньше — бей по другой закрытой!`);
      return true;
    }

    if (this.openedIndices.includes(barrelIndex) || (!existing && this.scene.barrels?.[barrelIndex]?.struck)) {
      Haptics.light();
      this.onToast?.('🛢 Эта бочка уже вскрыта в прошлом заходе! Бей по закрытой!');
      return true;
    }

    // Если я уже захватил бочку или пропустил ход ради экономии энергии — игнорируем повторный клик
    const alreadyMine = Object.entries(this.claims).find(([, c]) => c.uid === this.myUid);
    if (alreadyMine || this.skippedThisTurn) return true;

    if (this.duelLives <= 0) {
      Haptics.error();
      this.onToast?.('🌊 Жизни кончились (0 ❤️) — к Тилю за 6 ❤️ на дуэль!');
      return true;
    }
    // Пока есть жизни (> 0 ❤️), энергия не выгоняет к Тилю — при 0% она просто перезаряжается на новый рывок!
    if (this.energy < 25) {
      this.energy = 100;
      this.syncEnergyUI();
    }

    // Каждый удар тратит 25% энергии (можно пропустить и сэкономить!)
    this.energy = Math.max(0, this.energy - 25);
    this.syncEnergyUI();

    const claimPayload = {
      uid: this.myUid,
      name: this.myName,
      avatar: this.myAvatar,
      barrelIndex,
      ts: Date.now(),
    };

    // Ставим таймер Тиля на жёсткую паузу на время анимации удара игрока + ответного телеграфа!
    const tilWasOnSameBarrel = this._tilTelegraphBarrel === barrelIndex;
    if (tilWasOnSameBarrel) {
      this._tilTelegraphBarrel = -1;
      this.scene?.setBarrelTelegraph?.(-1, false);
    }
    this._playerAnimating = true;
    this._playerAnimatingSince = Date.now();
    this.scene?.setInteractive?.(false);

    this.scene.triggerStrikeFX(barrelIndex, worldPoint);
    this.audio.playStrike(barrelIndex);
    Haptics.medium();

    this.applyBarrelClaim(claimPayload, true);
    this.syncEnergyUI();

    if (this.soloMode) {
      const tilBot = this.players.find((p) => p.isBot && this.contenderUids.includes(p.uid));
      const tilAlreadyClaimed = tilBot && Object.values(this.claims).some((c) => c.uid === tilBot.uid);
      if (tilBot && !tilAlreadyClaimed) {
        const bannerText = document.getElementById('duel-countdown-text');
        const bannerSub = document.getElementById('duel-countdown-sub');
        this.clearTilTimers();
        this._tilState = 'telegraph';

        this.scheduleStepWhenUnblocked(() => {
          if (!this.active || this.phase !== 'claim') {
            this._playerAnimating = false;
            return;
          }
          const pick = this._pickFreeClosedBarrel(tilWasOnSameBarrel ? -1 : this._tilTelegraphBarrel, { forBot: true });
          if (pick < 0) {
            this._playerAnimating = false;
            if (this.isHost()) this.finalizeClaimsAndBroadcastReveal();
            return;
          }
          this._tilTelegraphBarrel = pick;
          this.scene?.setBarrelTelegraph?.(pick, true);
          this.scene?.triggerBarrelEerieFX?.(pick, 'knock_urgent');
          this.renderBarrelClaimBadges();
          document.getElementById('duel-live-timer')?.classList.add('is-telegraph');

          this.scheduleStepWhenUnblocked(() => {
            if (!this.active || this.phase !== 'claim') {
              this._playerAnimating = false;
              return;
            }
            this._executeTilBotStrike(tilBot, pick);
            this.scheduleStepWhenUnblocked(() => {
              this._playerAnimating = false;
              this._playerAnimatingSince = 0;
              if (this.active && this.phase === 'claim' && this.isHost()) {
                this.finalizeClaimsAndBroadcastReveal();
              }
            }, TIL_IMPACT_BEAT_MS);
          }, TIL_AFTER_PLAYER_TELEGRAPH_MS);
        }, PLAYER_STRIKE_BEAT_MS);
      } else {
        this.scheduleStepWhenUnblocked(() => {
          this._playerAnimating = false;
          this._playerAnimatingSince = 0;
          if (this.active && this.phase === 'claim' && this.isHost()) {
            this.finalizeClaimsAndBroadcastReveal();
          }
        }, PLAYER_STRIKE_BEAT_MS);
      }
    } else {
      // В живой 1×1 дуэли с человеком снимаем короткую блокировку анимации сразу после бита удара
      this.scheduleStepWhenUnblocked(() => {
        this._playerAnimating = false;
        this._playerAnimatingSince = 0;
      }, PLAYER_STRIKE_BEAT_MS);
    }

    return true;
  }

  applyBarrelClaim(claim, shouldBroadcast = false) {
    const idx = Number(claim.barrelIndex);
    if (idx < 0 || idx >= this.barrelCount) return;
    if (this.openedIndices.includes(idx)) return;

    const cur = this.claims[idx];
    if (cur && cur.ts <= claim.ts && cur.uid !== claim.uid) {
      return;
    }

    for (const k of Object.keys(this.claims)) {
      if (this.claims[k]?.uid === claim.uid) {
        delete this.claims[k];
      }
    }

    this.claims[idx] = claim;
    if (shouldBroadcast) {
      this.broadcast('barrel_claim', claim);
    }
    this.renderBarrelClaimBadges();
  }

  finalizeClaimsAndBroadcastReveal() {
    if (this.phase !== 'claim') return;

    for (const uid of this.contenderUids) {
      if (uid === this.myUid) {
        const hasMyClaim = Object.values(this.claims).some((c) => c.uid === this.myUid);
        if (!hasMyClaim) {
          this.skippedThisTurn = true;
          continue;
        }
      }
      const hasClaim = Object.values(this.claims).some((c) => c.uid === uid);
      if (!hasClaim) {
        const isTilBot = uid === TIL_BOT_UID;
        for (let b = 0; b < this.barrelCount; b++) {
          if (isTilBot && this.friendBarrelHunt && this.barrelLoot?.[b]?.kind === 'friend_barrel') continue;
          if (!this.openedIndices.includes(b) && !this.claims[b]) {
            const p = this.players.find((x) => x.uid === uid);
            this.claims[b] = {
              uid,
              name: p?.name || 'Игрок',
              avatar: p?.avatar || '',
              barrelIndex: b,
              ts: Date.now() + 999,
            };
            break;
          }
        }
      }
    }

    const revealPayload = {
      roundKey: this.roundKey,
      claims: this.claims,
      safeIndices: this.safeIndices,
      barrelLoot: this.barrelLoot,
      batchHasTicket: this.batchHasTicket,
      openedIndices: this.openedIndices,
      contenderUids: this.contenderUids,
    };

    this.broadcast('duel_reveal', revealPayload);
    this.executeReveal(revealPayload);
  }

  getLootForBarrel(idx) {
    const item = this.barrelLoot?.[idx];
    if (item) return item;
    return this.safeIndices.includes(idx)
      ? { kind: 'points', value: 150, label: '+150' }
      : { kind: 'empty', value: 0, label: 'Пусто' };
  }

  spawnBarrelLootPopout(barrelIndex, loot, isMine = true) {
    const host = document.getElementById('duel-loot-popouts');
    if (!host || !this.scene || barrelIndex < 0) return;
    const pos = this.scene.projectBarrelScreenPos?.(barrelIndex, 1.55);
    if (!pos?.visible) return;
    const kind = String(loot?.kind || 'empty');
    const icoMap = {
      ticket: '🎟',
      chip: '💎',
      points: '⭐',
      energy: '⚡',
      life: '❤️',
      screamer: '💀',
      empty: '💨',
      friend_barrel: '🛢',
    };
    const pop = document.createElement('div');
    pop.className = `barrel-loot-popout is-${kind}${isMine ? ' is-mine' : ' is-opp'}`;
    pop.style.left = `${Math.max(64, Math.min(window.innerWidth - 64, pos.x))}px`;
    pop.style.top = `${Math.max(104, Math.min(window.innerHeight - 90, pos.y))}px`;

    const icoEl = document.createElement('span');
    icoEl.className = 'blp-ico';
    icoEl.textContent = icoMap[kind] || '🎁';
    const lblEl = document.createElement('strong');
    lblEl.className = 'blp-lbl';
    lblEl.textContent = String(loot?.label || '');
    pop.append(icoEl, lblEl);
    host.appendChild(pop);

    window.setTimeout(() => {
      try { pop.remove(); } catch { /* ignore */ }
    }, 1850);
  }

  openTilTrophyPicker({ onResolved } = {}) {
    const modal = document.getElementById('modal-til-trophy-pick');
    const ticketBtn = document.getElementById('btn-trophy-pick-ticket');
    const chipBtn = document.getElementById('btn-trophy-pick-chip');
    const ptsBtn = document.getElementById('btn-trophy-pick-points');
    const lockBadge = document.getElementById('trophy-ticket-lock-badge');

    if (!modal || !ticketBtn || !chipBtn || !ptsBtn) {
      onResolved?.({ kind: 'points', pickedRes: null });
      return;
    }

    const profStats = this.getProfileStats?.() || {};
    const shards = Math.max(0, Math.round(Number(this.getTicketShards?.() ?? profStats.ticketShards ?? 0)));
    const friends = Math.max(0, Math.round(Number(profStats.friendsBrought ?? 0)));
    const ticketLocked = shards >= 2 && friends < 1;

    ticketBtn.classList.toggle('is-locked', ticketLocked);
    if (lockBadge) {
      if (ticketLocked) lockBadge.removeAttribute('hidden');
      else lockBadge.setAttribute('hidden', '');
    }

    ticketBtn.disabled = false;
    chipBtn.disabled = false;
    ptsBtn.disabled = false;
    this._trophyPickerOpen = true;
    modal.removeAttribute('hidden');
    Haptics.success();

    let settling = false;
    const handlePick = async (kind) => {
      if (settling) return;
      if (kind === 'ticket' && ticketLocked) {
        Haptics.error();
        this.onToast?.('🔒 Уже 2/4! Позови друга или сыграй 1×1, чтобы забрать 3/4 и 4/4.');
        return;
      }
      settling = true;
      ticketBtn.disabled = true;
      chipBtn.disabled = true;
      ptsBtn.disabled = true;

      let pickedRes = { kind };
      try {
        if (kind === 'ticket') {
          const sRes = await awardTicketShardServer(this.getTgUser?.(), 'til_trophy').catch(() => null);
          pickedRes.serverTicketRes = sRes;
          pickedRes.serverTicketGranted = Boolean(sRes?.granted);
          if (sRes?.ok) {
            const patch = {
              ticketShards: sRes.mergedTicket ? 0 : Math.max(0, Math.min(3, Number(sRes.shards || 0))),
            };
            if (sRes.premierePoints != null) patch.premierePoints = Number(sRes.premierePoints);
            if (sRes.granted) patch.hasPendingTicket = true;
            if (sRes.pendingTicketsCount != null) patch.pendingTicketsCount = Number(sRes.pendingTicketsCount);
            this.onProfileSync?.(patch);
          }
          this.onFlyRating?.({ type: 'ticket', count: 3, label: '🎟 +1/4 билета' });
        } else if (kind === 'chip') {
          this.sessionStats.playerChips += 1;
          this.onCollectChipFromBarrel?.({ barrelIndex: -1, loot: { kind: 'chip', value: 150, label: '💎 Новая фишка' } });
          const bankRes = await claimDuelPremiereBankReward(this.getTgUser?.(), { pointsBonus: 150, solo: true }).catch(() => null);
          if (bankRes?.ok) this.onProfileSync?.({ premierePoints: bankRes.premierePoints });
          this.onFlyRating?.({ type: 'chip', count: 3, label: '💎 Новая фишка' });
        } else {
          this.sessionStats.playerPoints += 300;
          const bankRes = await claimDuelPremiereBankReward(this.getTgUser?.(), { pointsBonus: 300, solo: true }).catch(() => null);
          if (bankRes?.ok) this.onProfileSync?.({ premierePoints: bankRes.premierePoints });
          this.onFlyRating?.({ type: 'points', count: 3, label: '+300 ⭐' });
        }
        this.audio?.playRewardChime?.();
        Haptics.success();
      } finally {
        this._trophyPickerOpen = false;
        modal.setAttribute('hidden', '');
        this.syncEnergyUI();
        onResolved?.(pickedRes);
      }
    };

    ticketBtn.onclick = () => handlePick('ticket');
    chipBtn.onclick = () => handlePick('chip');
    ptsBtn.onclick = () => handlePick('points');
  }

  async executeReveal(payload) {
    if (this.phase === 'reveal') return;
    this.setPhase('reveal');
    this.clearIdleHint();
    this._playerAnimating = false;
    this._playerAnimatingSince = 0;
    this._tilState = 'idle';
    this.clearAllTimers();
    this.scene?.setBarrelTelegraph?.(-1, false);
    this.scene.setInteractive(false);
    document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');
    const popHost = document.getElementById('duel-loot-popouts');
    if (popHost) popHost.innerHTML = '';

    this.claims = payload.claims || this.claims;
    this.safeIndices = payload.safeIndices || this.safeIndices;
    if (payload.barrelLoot) this.barrelLoot = payload.barrelLoot;
    if (typeof payload.batchHasTicket === 'boolean') this.batchHasTicket = payload.batchHasTicket;
    if (Array.isArray(payload.openedIndices)) {
      this.openedIndices = [...payload.openedIndices];
    }

    const entries = [];
    let anyScreamer = false;
    let anyPoints = false;

    for (const [bStr, claim] of Object.entries(this.claims)) {
      const bIdx = Number(bStr);
      const loot = this.getLootForBarrel(bIdx);
      if (claim.uid === this.myUid && (loot.kind === 'ticket' || loot.kind === 'friend_barrel')) {
        this.scene.triggerRevealDive?.(bIdx);
      } else {
        this.scene.triggerEmptyBarrelOpen(bIdx);
      }
      if (!this.openedIndices.includes(bIdx)) {
        this.openedIndices.push(bIdx);
      }
      if (loot.kind === 'screamer') anyScreamer = true;
      if (loot.value > 0) anyPoints = true;
      entries.push({ barrelIndex: bIdx, claim, loot });
      this.spawnBarrelLootPopout(bIdx, loot, claim.uid === this.myUid);
    }

    const myEntry = entries.find((e) => e.claim.uid === this.myUid) || null;
    const oppEntry = entries.find((e) => e.claim.uid !== this.myUid) || null;
    const diff = getTilDifficultyProfile(this.duelLives, Math.max(0, Number(this.tilRoundIdx || 1) - 1));

    if (anyScreamer) {
      const randScreamerIdx = Math.floor(Math.random() * 7);
      if (myEntry?.loot?.kind === 'screamer') {
        this.onLifeLostPill?.();
      }
      if (myEntry?.loot?.kind === 'screamer' && this.onTriggerScreamerFx) {
        this.onTriggerScreamerFx(1350, randScreamerIdx);
      } else {
        this.audio.playMiniScreamer(randScreamerIdx);
        this.scene.triggerScreamerShake(0.45);
      }
    }
    if (anyPoints) {
      this.audio.playLidBlowOff(Boolean(myEntry && myEntry.loot.value > 0));
    }

    if (oppEntry?.loot) {
      const ok = oppEntry.loot.kind;
      if (ok === 'ticket') {
        this.sessionStats.oppTickets += 1;
      } else if (ok === 'chip') {
        this.sessionStats.oppChips += 1;
      } else if (ok === 'points') {
        this.sessionStats.oppPoints += Math.max(0, Number(oppEntry.loot.value || 150));
      } else if (ok === 'life') {
        this.tilLives = Math.min(this.tilMaxLives + 2, Number(this.tilLives || 0) + 1);
      } else if (ok === 'empty') {
        this.tilLives = Math.max(0, Number(this.tilLives || 0) - 1);
      } else if (ok === 'screamer') {
        this.tilLives = Math.max(0, Number(this.tilLives || 0) - 2);
      }
    }

    let foundFriendBarrel = false;
    this._lastScreamerDmg = diff.screamerDamage;
    if (myEntry) {
      const k = myEntry.loot.kind;
      if (k === 'friend_barrel') {
        foundFriendBarrel = true;
        Haptics.success();
        this.onFlyRating?.({
          type: 'points',
          count: 2,
          label: myEntry.loot.label,
          barrelIndex: myEntry.barrelIndex,
        });
      } else if (k === 'ticket') {
        this.onFlyRating?.({
          type: 'ticket',
          count: 3,
          label: '🎟 +1/4',
          barrelIndex: myEntry.barrelIndex,
        });
        this.scheduleTimeout(() => {
          if (this.active && this.phase === 'reveal') {
            this.onContextDiscoveryHint?.('ticket');
          }
        }, 420);
      } else if (k === 'points' || k === 'chip') {
        const val = Number(myEntry.loot.value || 150);
        if (k === 'chip') this.sessionStats.playerChips += 1;
        else this.sessionStats.playerPoints += val;
        this.onFlyRating?.({
          type: k === 'chip' ? 'chip' : 'points',
          count: 2,
          label: myEntry.loot.label,
          barrelIndex: myEntry.barrelIndex,
        });
        if (k === 'chip') {
          this.onCollectChipFromBarrel?.({ barrelIndex: myEntry.barrelIndex, loot: myEntry.loot });
        }
        claimDuelPremiereBankReward(this.getTgUser?.(), { pointsBonus: val, solo: this.soloMode })
          .then((bankRes) => {
            if (bankRes?.ok) {
              this.onProfileSync?.({ premierePoints: bankRes.premierePoints });
            }
          })
          .catch(() => {});
        this.scheduleTimeout(() => {
          if (this.active && this.phase === 'reveal') {
            this.onContextDiscoveryHint?.(k);
          }
        }, 420);
      } else if (k === 'energy') {
        this.energy = Math.min(100, Math.max(0, Number(this.energy || 0) + 50));
        this.audio?.playRewardChime?.();
        this.onFlyRating?.({
          type: 'energy',
          count: 2,
          label: '+50% ⚡',
          barrelIndex: myEntry.barrelIndex,
        });
        this.scheduleTimeout(() => {
          if (this.active && this.phase === 'reveal') {
            this.onContextDiscoveryHint?.('energy');
          }
        }, 420);
      } else if (k === 'life') {
        this.duelLives = Math.min(30, Math.max(1, Number(this.duelLives || 0) + 1));
        this.onProfileSync?.({ lives: this.duelLives });
        this.onFlyLife?.({ type: 'lives', count: 1, label: '+1 ❤️', barrelIndex: myEntry.barrelIndex });
        this.scheduleTimeout(() => {
          if (this.active && this.phase === 'reveal') {
            this.onContextDiscoveryHint?.('life');
          }
        }, 420);
      } else if (k === 'empty') {
        this.duelLives = Math.max(0, Number(this.duelLives || 0) - 1);
      } else if (k === 'screamer') {
        this.duelLives = Math.max(0, Number(this.duelLives || 0) - diff.screamerDamage);
      }
    }

    // Компактные метки прямо над вскрытыми бочками
    this.renderBarrelClaimBadges(true);
    this.syncEnergyUI();

    if (foundFriendBarrel) {
      this.batchResolved = true;
      this.friendBarrelHunt = false;
      this.scheduleStepWhenUnblocked(() => {
        if (!this.active) return;
        this.clearBarrelClaimBadges();
        this.onFoundFriendBarrel?.();
      }, 1050, 120000);
      return;
    }

    if (this.duelLives > 0 && this.energy <= 0) {
      this.energy = 100;
      this.syncEnergyUI();
    }
    const ticketEntry = entries.find((e) => e.loot.kind === 'ticket') || null;
    const closedLeftNow = Math.max(0, (this.barrelCount || 10) - (this.openedIndices?.length || 0));
    const needTilNow = this.duelLives <= 0;
    const tilKnockedOut = Boolean(this.soloMode && !this.friendBarrelHunt && this.tilLives <= 0 && !needTilNow);
    const minClosedContinue = this.friendBarrelHunt ? 1 : 2;
    this.batchResolved = Boolean(ticketEntry || tilKnockedOut || closedLeftNow < minClosedContinue);

    const summaryLine = entries
      .map((e) => `${e.claim.uid === this.myUid ? 'ТЫ' : e.claim.name}: ${e.loot.label}`)
      .join(' · ');

    if (needTilNow) {
      this.scheduleStepWhenUnblocked(() => {
        if (!this.active) return;
        this.clearBarrelClaimBadges();
        this.setPhase('finished');
        this.spectatorUids = [];
        document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');
        document.getElementById('duel-spectator-bar')?.setAttribute('hidden', '');
        this.triggerDefeatFlow();
      }, anyScreamer ? 1500 : 1050, 120000);
      return;
    }

    if (!ticketEntry && !tilKnockedOut && closedLeftNow >= minClosedContinue) {
      const pauseMs = anyScreamer ? LOOT_READ_SCREAMER_MS : LOOT_READ_PAUSE_MS;
      this.scheduleStepWhenUnblocked(() => {
        if (!this.active) return;
        this.clearBarrelClaimBadges();
        if (this.isHost()) {
          this.hostInitiateRound({ isFreeRerack: true });
        }
      }, pauseMs, 120000);
      return;
    }

    const playerBeatTilSolo = Boolean(
      this.soloMode &&
      !this.friendBarrelHunt &&
      (tilKnockedOut || (ticketEntry && ticketEntry.claim.uid === this.myUid))
    );

    if (playerBeatTilSolo) {
      this.scheduleStepWhenUnblocked(() => {
        if (!this.active) return;
        this.clearBarrelClaimBadges();
        document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');
        document.getElementById('duel-spectator-bar')?.setAttribute('hidden', '');
        this.openTilTrophyPicker({
          onResolved: (picked) => {
            if (!this.active) return;
            this.setPhase('finished');
            this.spectatorUids = [];
            this.showRoundResultCard(ticketEntry?.claim || { uid: this.myUid, name: this.myName }, { potLives: 0 }, {
              myEntry,
              oppEntry,
              summaryLine,
              ticketFound: picked?.kind === 'ticket',
              serverTicketGranted: Boolean(picked?.serverTicketGranted),
              serverTicketRes: picked?.serverTicketRes || null,
              tilTrophyPicked: picked?.kind || 'points',
              tilDefeatedByPlayer: true,
            });
          },
        });
      }, RESULT_CARD_DELAY_MS, 120000);
      return;
    }

    const settleRes = ticketEntry
      ? await settleDuelRound({
          roomId: this.roomId,
          roundKey: this.roundKey,
          winnerUid: ticketEntry.claim.uid,
          playerUids: Array.from(
            new Set(
              this.roundParticipants?.length
                ? this.roundParticipants
                : this.players.map((p) => p.uid)
            )
          ),
          tgUser: this.getTgUser?.(),
        }).catch(() => ({ potLives: 0, winnerLives: null, winnerPoints: null, goldenTicketDropped: false }))
      : { potLives: 0, winnerLives: null, winnerPoints: null, goldenTicketDropped: false };

    let serverTicketRes = null;
    if (ticketEntry && ticketEntry.claim.uid === this.myUid) {
      const hasRealOpponent = this.players.some((p) => !p.isBot && p.uid !== this.myUid);
      const shardSource = this.soloMode || !hasRealOpponent ? 'solo_til' : 'duel';
      serverTicketRes = await awardTicketShardServer(this.getTgUser?.(), shardSource).catch(() => ({
        ok: false,
        source: shardSource,
        shards: 0,
        mergedTicket: false,
        granted: false,
        reason: 'network_error',
        fallbackPoints: 500,
      }));
    }

    this.scheduleStepWhenUnblocked(() => {
      if (!this.active) return;
      this.setPhase('finished');
      this.spectatorUids = [];
      document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');
      document.getElementById('duel-spectator-bar')?.setAttribute('hidden', '');
      this.showRoundResultCard(ticketEntry?.claim || null, settleRes, {
        myEntry,
        oppEntry,
        summaryLine,
        ticketFound: Boolean(ticketEntry),
        serverTicketGranted: Boolean(serverTicketRes?.granted),
        serverTicketRes,
      });
    }, RESULT_CARD_DELAY_MS, 120000);
  }

  showRoundResultCard(ticketWinner, settleRes, detail = {}) {
    // Убираем плавающие бейджи над бочками, чтобы они НИКОГДА не перекрывали кнопки итоговой карточки!
    this.clearBarrelClaimBadges();
    const box = document.getElementById('duel-result-box');
    const titleEl = document.getElementById('duel-result-title');
    const subEl = document.getElementById('duel-result-sub');
    const rematchBtn = document.getElementById('btn-duel-rematch');
    const inviteLivesBtn = document.getElementById('btn-duel-invite-lives');

    box?.removeAttribute('hidden');
    const mySkipped = !detail.myEntry;
    const myLoot = detail.myEntry?.loot || { kind: 'skip', value: 0, label: 'Пропустил' };
    const oppName = detail.oppEntry?.claim?.name || TIL_BOT_NAME;
    const oppLoot = detail.oppEntry?.loot || { kind: 'empty', value: 0, label: 'Пусто' };
    const iFoundTicket = Boolean(
      (ticketWinner && ticketWinner.uid === this.myUid) || detail.tilDefeatedByPlayer
    );
    const pickedTrophy = detail.tilTrophyPicked || '';
    const oppFoundTicket = Boolean(ticketWinner && ticketWinner.uid !== this.myUid && !detail.tilDefeatedByPlayer);
    const closedLeft = Math.max(0, (this.barrelCount || 10) - (this.openedIndices?.length || 0));

    const serverTicketGranted = Boolean(detail.serverTicketGranted);
    if (iFoundTicket && detail.serverTicketRes?.ok) {
      const sRes = detail.serverTicketRes;
      const isSoftCap = sRes.reason === 'solo_cap_reached' || sRes.reason === 'friend_or_duel_required';
      if (!sRes.reason || isSoftCap) {
        const immediatePatch = {
          ticketShards: sRes.mergedTicket ? 0 : Math.max(0, Math.min(3, Number(sRes.shards || 0))),
        };
        if (sRes.premierePoints != null) {
          immediatePatch.premierePoints = Number(sRes.premierePoints);
        }
        if (serverTicketGranted) {
          immediatePatch.hasPendingTicket = true;
          if (sRes.pendingTicketsCount != null) {
            immediatePatch.pendingTicketsCount = Number(sRes.pendingTicketsCount);
          }
        }
        this.onProfileSync?.(immediatePatch);
      }
    }
    // Начисляем +500 ⭐ в живой 1×1 дуэли (в соло с Тилем трофей уже начислен через Пикер 1 из 3)
    const myPointsEarned = !detail.tilDefeatedByPlayer && iFoundTicket ? 500 : 0;
    if (!detail.tilDefeatedByPlayer && (myPointsEarned > 0 || iFoundTicket)) {
      claimDuelPremiereBankReward(this.getTgUser?.(), { pointsBonus: myPointsEarned, solo: this.soloMode })
        .then((bankRes) => {
          if (bankRes?.ok) {
            const patch = {
              premiereScore: settleRes?.winnerScore,
              premierePoints: bankRes.premierePoints ?? settleRes?.winnerPoints,
            };
            if (detail.serverTicketRes && detail.serverTicketRes.ok) {
              patch.ticketShards = Number(detail.serverTicketRes.shards || 0);
            }
            if (serverTicketGranted) {
              patch.hasPendingTicket = true;
              if (detail.serverTicketRes?.pendingTicketsCount != null) {
                patch.pendingTicketsCount = Number(detail.serverTicketRes.pendingTicketsCount);
              }
            }
            this.onProfileSync?.(patch);
          }
        })
        .catch(() => {});
    }

    // Учёт раундов дуэли без билета: если соперник забрал билет ИЛИ закрытые бочки закончились без твоего билета!
    if (iFoundTicket) {
      this.duelRoundsWithoutTicket = 0;
    } else if (oppFoundTicket || closedLeft < 2) {
      this.duelRoundsWithoutTicket = (this.duelRoundsWithoutTicket || 0) + 1;
    }

    const outOfRounds = false; // v19.1: Все последующие раунды идут против Тиля (6->8->10->12 бочек) без отката в пустой цех!
    // v19.4: К Тилю на Северное море при 0 ❤️ — максимум 1 раз в 24 часа; иначе предлагаем закатать друга за +6 ❤️!
    const needTilRefill = !iFoundTicket && this.duelLives <= 0;
    const oceanAllowed = needTilRefill ? (this.canUseOceanRefill ? Boolean(this.canUseOceanRefill()) : true) : false;

    if (pickedTrophy) {
      Haptics.success();
      if (pickedTrophy === 'chip') {
        if (titleEl) titleEl.textContent = '💎 Трофей Тиля: Новая фишка!';
        if (subEl) subEl.textContent = 'Фишка добавлена в твою коллекцию (+150 ⭐).';
      } else if (pickedTrophy === 'points') {
        if (titleEl) titleEl.textContent = '⭐ Трофей Тиля: +300 очков!';
        if (subEl) subEl.textContent = 'Твоя шкала до суперприза выросла.';
      } else {
        const sRes = detail.serverTicketRes || {};
        if (serverTicketGranted) {
          if (titleEl) titleEl.textContent = '🎟 Билет 4/4 собран!';
          if (subEl) subEl.textContent = 'Подари бесплатный билет другу в Telegram!';
          this.scheduleTimeout(() => this.onOpenGoldenFork?.(), 900);
        } else {
          const sh = Number(sRes.shards ?? (this.getTicketShards?.() || 1));
          if (titleEl) titleEl.textContent = `🎟 Билет: ${sh}/4!`;
          if (subEl) subEl.textContent = 'Трофей Тиля забран — двигайся к 4/4.';
        }
      }
    } else if (iFoundTicket) {
      Haptics.success();
      const sRes = detail.serverTicketRes || {};
      if (serverTicketGranted) {
        if (titleEl) titleEl.textContent = '🎟 Билет 4/4 собран!';
        if (subEl) {
          subEl.textContent = 'Подари бесплатный билет другу в Telegram!';
        }
        this.scheduleTimeout(() => this.onOpenGoldenFork?.(), 900);
      } else if (sRes.reason === 'solo_cap_reached' || sRes.reason === 'friend_or_duel_required') {
        if (titleEl) titleEl.textContent = '🎟 Полбилета уже у тебя (2/4)!';
        if (subEl) {
          subEl.textContent = 'Чтобы забрать 3/4 и 4/4, закатай друга или сыграй 1×1.';
        }
      } else if (sRes.ok && !sRes.reason && Number(sRes.shards || 0) > 0) {
        const sh = Number(sRes.shards || 1);
        if (titleEl) titleEl.textContent = `🎟 Билет: ${sh}/4!`;
        if (subEl) {
          subEl.textContent = `Собери 4/4 и забери билет в кино.`;
        }
      } else if (sRes.reason === 'seed_admin_excluded') {
        if (titleEl) titleEl.textContent = '🛡 Победа в дуэли';
        if (subEl) {
          subEl.textContent = `Победа над ${oppName} (командный режим).`;
        }
      } else {
        if (titleEl) titleEl.textContent = '🏆 Победа! +500 ⭐';
        if (subEl) {
          subEl.textContent = `Ты быстрее ${oppName}! Дневной лимит билетов выдан.`;
        }
      }
    } else if (outOfRounds) {
      Haptics.error();
      if (titleEl) titleEl.textContent = '🔄 Пора на уровни!';
      if (subEl) {
        subEl.textContent = 'Бочки в партии закончились.';
      }
    } else if (oppFoundTicket) {
      Haptics.error();
      if (titleEl) titleEl.textContent = `💥 ${oppName} забрал билет!`;
      if (subEl) {
        subEl.textContent = needTilRefill
          ? oceanAllowed
            ? 'Силы на нуле — летим к Тилю за +6 ❤️!'
            : 'Жизни на нуле — закатай друга за +6 ❤️!'
          : `Попробуй ещё раз против ${oppName}!`;
      }
    } else if (needTilRefill) {
      Haptics.error();
      if (oceanAllowed) {
        if (titleEl) titleEl.textContent = '🌊 Силы на нуле — к Тилю!';
        if (subEl) {
          subEl.textContent = 'Забери +6 ❤️ у моря и продолжай.';
        }
      } else {
        if (titleEl) titleEl.textContent = '❤️ Жизни на нуле!';
        if (subEl) {
          subEl.textContent = 'Закатай друга в бочку и получи +6 ❤️.';
        }
      }
    } else {
      Haptics.light();
      const statusVerb = mySkipped
        ? '⏭ Ход пропущен'
        : myLoot.kind === 'life'
          ? '❤️ +1 жизнь!'
          : myLoot.kind === 'chip'
            ? '💎 Найдена фишка!'
            : myLoot.kind === 'points'
              ? `⭐ +${myLoot.value || 150} очков`
              : myLoot.kind === 'energy'
                ? '⚡ +50% энергии!'
                : myLoot.kind === 'screamer'
                  ? `☠️ Потерял жизнь (-${this._lastScreamerDmg || 2} ❤️)`
                  : '💨 Пусто (-1 ❤️)';
      if (titleEl) titleEl.textContent = statusVerb;
      if (subEl) {
        subEl.textContent = `❤️ ${this.duelLives} · осталось бочек: ${closedLeft}`;
      }
    }

    if (needTilRefill) {
      this.scheduleTimeout(() => {
        if (!this.active || this.phase !== 'finished') return;
        this.triggerDefeatFlow();
      }, 1500);
    }

    const capHit = iFoundTicket && (detail.serverTicketRes?.reason === 'solo_cap_reached' || detail.serverTicketRes?.reason === 'friend_or_duel_required');
    if (rematchBtn) {
      if (needTilRefill) {
        rematchBtn.textContent = oceanAllowed ? '🌊 К Тилю (+6 ❤️)' : '🛢 Закатать друга (+6 ❤️)';
      } else if (!this.batchResolved && closedLeft >= 2) {
        rematchBtn.textContent = '🔨 Бить дальше';
      } else {
        const nextB = [6, 8, 10, 12][Math.min(3, Math.max(0, Number(this.tilRoundIdx || 1)))];
        rematchBtn.textContent = this.soloMode
          ? `Дальше (${nextB} бочек)`
          : `Реванш 1×1 (${nextB} бочек)`;
      }
      rematchBtn.removeAttribute('hidden');
    }
    if (inviteLivesBtn) {
      if (capHit || (needTilRefill && !oceanAllowed)) {
        inviteLivesBtn.textContent = capHit ? '🛢 Закатать друга (3/4 и 4/4)' : '🛢 Закатать друга (+6 ❤️)';
        inviteLivesBtn.removeAttribute('hidden');
      } else {
        inviteLivesBtn.setAttribute('hidden', '');
      }
    }
    const switchLobbyBtn = document.getElementById('btn-duel-switch-lobby');
    if (switchLobbyBtn) {
      if (capHit) {
        switchLobbyBtn.textContent = '⚔️ Дуэль 1×1 с игроком';
        switchLobbyBtn.removeAttribute('hidden');
      } else {
        switchLobbyBtn.setAttribute('hidden', '');
      }
    }

    const resTrophyEl = document.getElementById('duel-result-trophy');
    if (resTrophyEl) {
      const captured = Array.isArray(settleRes?.transferredTrophies) ? settleRes.transferredTrophies : [];
      if (captured.length > 0 && iFoundTicket) {
        if (titleEl) titleEl.textContent = '🏆 ПОБЕДА В ДУЭЛИ НА ФИШКИ!';
        this.loadTrophiesMod()
          .then((mod) => {
            mod.renderCapturedTrophyBanner(resTrophyEl, captured, {
              onOpenHallOfFame: () => {
                this.leaveRoom(false);
                this.onOpenHallOfFame?.();
              },
            });
            return mod.fetchHallOfFame(this.getTgUser?.());
          })
          .then((hof) => {
            if (hof?.ok) this.hofCache = hof;
          })
          .catch(() => {});
      } else {
        resTrophyEl.textContent = '';
        resTrophyEl.setAttribute('hidden', '');
      }
    }

    this.syncEnergyUI();
    this.renderLobbyUI();
  }

  showNoLivesPrompt() {
    this.triggerDefeatFlow();
  }

  triggerSpectatorChainRattle() {
    const now = Date.now();
    if (now - this.lastRattleAt < 2900) {
      this.onToast?.('Перезарядка цепей (раз в 3 секунды)!');
      return;
    }
    this.lastRattleAt = now;
    this.audio.playChainRattle(1.0);
    this.scene.triggerScreamerShake(0.38);
    Haptics.heavy();
    this.broadcast('chain_rattle', {
      uid: this.myUid,
      name: this.myName,
    });
  }

  renderBarrelClaimBadges(revealed = false) {
    const wrap = document.getElementById('duel-barrel-badges');
    if (!wrap) return;
    wrap.innerHTML = '';

    for (const [bStr, claim] of Object.entries(this.claims)) {
      const idx = Number(bStr);
      const badge = document.createElement('div');
      const loot = this.getLootForBarrel(idx);
      const isGood = loot.value > 0;
      const isTrap = loot.kind === 'screamer';
      const stateCls = revealed ? (isGood ? 'is-safe' : isTrap ? 'is-dead' : 'is-empty') : 'is-locked';
      badge.className = `duel-barrel-badge ${stateCls}`;
      badge.dataset.barrelIndex = String(idx);

      const avaSrc = claim.uid === TIL_BOT_UID
        ? TIL_AVATAR_URL
        : claim.avatar && /^(https?:\/\/|\.?\/|data:image\/)/i.test(String(claim.avatar))
          ? claim.avatar
          : getFallbackFighterAvatar(claim.uid || claim.name);
      const ava = `<img src="${escapeAttr(avaSrc)}" alt="" onerror="this.src='${FIGHTER_AVATARS[0]}'" />`;
      const lootTag = revealed ? `<b class="duel-badge-loot">${escapeHtml(loot.label)}</b>` : '';
      const shortName = claim.uid === this.myUid
        ? 'ТЫ'
        : claim.uid === TIL_BOT_UID
          ? 'ТИЛЬ'
          : (claim.name || '').slice(0, 12);
      badge.innerHTML = `
        <div class="duel-badge-ava">${ava}</div>
        <small>${escapeHtml(shortName)}</small>
        ${lootTag}
      `;
      wrap.appendChild(badge);
    }

    if (
      !revealed &&
      this.phase === 'claim' &&
      this._tilState === 'telegraph' &&
      this._tilTelegraphBarrel >= 0 &&
      !this.claims[this._tilTelegraphBarrel]
    ) {
      const tBadge = document.createElement('div');
      tBadge.className = 'duel-barrel-badge is-telegraph';
      tBadge.dataset.barrelIndex = String(this._tilTelegraphBarrel);
      tBadge.innerHTML = `
        <div class="duel-badge-ava"><img src="${escapeAttr(TIL_AVATAR_URL)}" alt="Тиль" /></div>
        <small>🎯 ЦЕЛИТСЯ</small>
      `;
      wrap.appendChild(tBadge);
    }
    this.updateBadgePositions();
  }

  clearBarrelClaimBadges() {
    const wrap = document.getElementById('duel-barrel-badges');
    if (wrap) wrap.innerHTML = '';
  }

  updateBadgePositions() {
    const wrap = document.getElementById('duel-barrel-badges');
    if (!wrap || !this.scene) return;
    const nodes = wrap.querySelectorAll('.duel-barrel-badge');
    nodes.forEach((node) => {
      const idx = Number(node.dataset.barrelIndex);
      const pos = this.scene.projectBarrelScreenPos(idx, 1.38);
      if (pos.visible) {
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
        node.style.opacity = '1';
      } else {
        node.style.opacity = '0';
      }
    });
  }

  startBadgeProjectionLoop() {
    const loop = () => {
      if (!this.active) return;
      this.updateBadgePositions();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }
}

/**
 * Канал живой трансляции «👀 Подглядывать за игрой» (`watch_<barrelId>`):
 * Друг ищет твою бочку -> ты в реальном времени видишь вскрытые бочки и можешь погреметь ему цепями!
 */
export function createBarrelWatchChannel(barrelId, { onRemoteEvent } = {}) {
  const rt = getActiveRealtimeClient();
  if (!rt || !barrelId) return null;

  const ch = rt.channel(`watch_${barrelId}`, {
    config: { broadcast: { self: false } },
  });

  ch.on('broadcast', { event: 'watch_event' }, ({ payload }) => {
    if (payload) onRemoteEvent?.(payload);
  });

  ch.subscribe();

  return {
    send(type, detail = {}) {
      try {
        ch.send({
          type: 'broadcast',
          event: 'watch_event',
          payload: {
            type,
            ...detail,
            batchCode: typeof detail.barrelIndex === 'number' ? BARREL_BATCH_CODES[detail.barrelIndex] || '' : '',
            at: Date.now(),
          },
        });
      } catch { /* ignore */ }
    },
    close() {
      try {
        rt.removeChannel(ch);
      } catch { /* ignore */ }
    },
  };
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
