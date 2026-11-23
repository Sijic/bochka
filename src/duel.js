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
const TIL_AVATAR_URL = './public/sprites/til_avatar.webp?v=1543';

/**
 * Контроллер синхронного мультиплеера 1 на 1 (строго 2 друга) «НА СЧЁТ ТРИ!» (Supabase Realtime Presence + Broadcast)
 * и режима «👀 Подглядывать за игрой» (`watch_<barrelId>`).
 * Все промежуточные клики и таймеры идут строго через WebSocket в оперативной памяти (0 записей в БД).
 */
export class WorkshopDuelController {
  constructor({ scene, audio, getTgUser, getTicketShards, onCollectChipFromBarrel, onProfileSync, onToast, onOpenInviteShare, onOpenGoldenFork, onExitToHub, onDuelDefeatToTil, onFlyRating, onFlyLife, onReturnToLevels, onOpenHallOfFame, loadDuelCandidates, onChallengeFriend, onOpenPackFriend, onRoomFull, onTriggerScreamerFx }) {
    this.scene = scene;
    this.audio = audio;
    this.getTgUser = getTgUser;
    this.onProfileSync = onProfileSync;
    this.onToast = onToast;
    this.onOpenInviteShare = onOpenInviteShare;
    this.onOpenGoldenFork = onOpenGoldenFork;
    this.onExitToHub = onExitToHub;
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
    this.onRoomFull = onRoomFull || null;
    this.onTriggerScreamerFx = onTriggerScreamerFx || null;
    this.duelCandidates = { sent: [], branch: [], loaded: false };
    this.pickerTab = 'sent'; // 'sent' | 'branch'
    this.challengedUids = new Set();
    this.soloMode = false;
    this.tilRoundIdx = 0;
    this.duelMode = 'classic'; // 'classic' | 'chips'
    this.selectedAnteTrophyId = null;
    this.selectedAnteTrophyMeta = null;
    this.opponentChips = {};
    this.hofCache = null;
    this._trophiesMod = null;
    this.energy = 100;
    this.duelLives = 6; // v12.0: Минимум 6 жизней именно на Дуэль (Тиль всегда пополняет минимум до 6 ❤️!)
    this.duelRoundsWithoutTicket = 0;
    this.maxDuelRounds = 3;
    this.batchResolved = false; // true, когда кто-то выбил 🎟 Билет или бочки кончились
    this.skippedThisTurn = false;

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
    this.claimTimeLeft = 3.0;

    this.claimInterval = null;
    this.rafId = null;
    this.timeouts = [];
    this.roundParticipants = [];
    this._lastRemoteRattleAt = 0;
    this.roundWatchdogTimer = null;
    this.lastRattleAt = 0;
    this.botCounter = 0;
  }

  get isActive() {
    return this.active;
  }

  scheduleTimeout(fn, ms) {
    const id = window.setTimeout(fn, ms);
    this.timeouts.push(id);
    return id;
  }

  clearAllTimers() {
    this.timeouts.forEach((id) => clearTimeout(id));
    this.timeouts = [];
    if (this.roundWatchdogTimer) {
      clearTimeout(this.roundWatchdogTimer);
      this.roundWatchdogTimer = null;
    }
    if (this.claimInterval) {
      clearInterval(this.claimInterval);
      this.claimInterval = null;
    }
  }

  async loadTrophiesMod() {
    if (!this._trophiesMod) {
      this._trophiesMod = await import('./trophies.js?v=1910');
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
    this.phase = 'lobby';
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

  async openRoom(roomId, { autoAddTestBots = false, initialMode = 'classic', prefetchedHof = null, autoStartSoloTil = false } = {}) {
    this.leaveRoom(false);
    if (prefetchedHof?.ok) {
      this.hofCache = prefetchedHof;
    }

    const tgUser = this.getTgUser?.() || null;
    this.myUid = getViewerUid(tgUser);
    this.myName = tgUser?.name || (isTestBogSessionActive() ? 'Тест-Бог' : 'Игрок');
    this.myAvatar = tgUser?.photoUrl || '';
    this.roomId = String(roomId || `d_${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28);
    this.active = true;
    this.phase = 'lobby';
    this.soloMode = false;
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
    this.duelLives = Math.max(6, Number(this.duelLives || 6));
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
    this.scene.setInteractive(false);

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
        await this.startSoloDuel();
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
    this.phase = 'idle';
    this.clearAllTimers();
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
      if (!this.active) return;
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
            this.phase = 'lobby';
            this.antePaidForRound = null;
            this.scene.setInteractive(false);
            this.onToast?.('⚠️ Соперник вышел из дуэли — возврат в лобби стола.');
            this.renderLobbyUI();
          } else if (this.isHost() && this.phase === 'claim') {
            const allPresentClaimed = presentContenders.every((u) => Boolean(this.claims[u]));
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
        this.phase = 'lobby';
        this.antePaidForRound = null;
        this.scene.setInteractive(false);
        const msg =
          payload.reason === 'level_required'
            ? `🔒 У ${payload.name || 'игрока'} пока нет 3 уровня для «Дуэли на фишки» — фишки разблокированы.`
            : `⚠️ У ${payload.name || 'игрока'} закончились ❤️ для ставки — раунд остановлен.`;
        this.onToast?.(msg);
        this.renderLobbyUI();
      } else if (this.isHost() && this.phase === 'claim') {
        const allLeftClaimed = this.contenderUids.every((u) => Boolean(this.claims[u]));
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
        potEl.textContent = chipsUnlocked
          ? '🪙 ДУЭЛЬ 1 НА 1 НА ФИШКИ (УР. 3+): двое ставят по фишке — победитель забирает карточку соперника!'
          : '🔒 ДУЭЛЬ НА ФИШКИ: откроется на 3 уровне (пригласи 3 друзей). Обычная дуэль 1 на 1 доступна сразу!';
        potEl.classList.toggle('is-triple-bonus', chipsUnlocked);
      } else {
        potEl.textContent =
          '⚔️ В БОЧКАХ СПРЯТАНЫ: 🎟 ЧАСТЬ БИЛЕТА (4/4), 💎 ФИШКА, ❤️ +1 И ⭐ БАЛЛЫ · ОСТОРОЖНО: ☠️ СКРИМЕРЫ (−2 ❤️)!';
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
            ? '🏁 ИТОГ'
            : vsTil
              ? `🎬 ПРОТИВ ТИЛЯ · ${this.barrelCount || 6}`
              : vsBot
                ? `🤖 БОТ · ${this.barrelCount || 6}`
                : `⚔️ 1×1 · ${this.barrelCount || 6}`;
        }
      } else {
        liveMiniBar.setAttribute('hidden', '');
      }
    }

    const shareLinkBtn = document.getElementById('btn-duel-share-link');
    // v17.1: Убираем массовый пуш «на троих» — теперь точечный выбор 1 друга из списка ниже или личная ссылка 1×1!
    if (invite3Btn) invite3Btn.setAttribute('hidden', '');
    if (shareLinkBtn) {
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
          const initials = (p.name || '?').trim().slice(0, 2).toUpperCase();
          card.className = `duel-slot-card is-filled${isTil ? ' is-til-player' : ''}`;
          const avaWrap = document.createElement('div');
          avaWrap.className = 'duel-slot-avatar';
          if (p.avatar && /^(https?:\/\/|\.?\/|data:image\/)/i.test(String(p.avatar))) {
            const img = document.createElement('img');
            img.src = p.avatar;
            img.alt = p.name || '';
            img.className = 'duel-slot-avatar-img';
            avaWrap.appendChild(img);
          } else {
            const sp = document.createElement('span');
            sp.className = 'duel-slot-initials';
            sp.textContent = initials;
            avaWrap.appendChild(sp);
          }
          const meta = document.createElement('div');
          meta.className = 'duel-slot-meta';
          const st = document.createElement('strong');
          st.textContent = p.name || 'Игрок';
          const sub = document.createElement('span');
          sub.textContent = p.uid === this.myUid
            ? 'ВЫ · ИГРОК 1'
            : isTil
              ? '🎬 ТИЛЬ (РАЗМИНКА)'
              : 'ДРУГ · ИГРОК 2';
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
          st.textContent = 'ЖДЁМ 1 ДРУГА (1×1)';
          const sub = document.createElement('span');
          sub.textContent = 'Выбери из ветки ниже или скинь ссылку';
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
      if (this.phase !== 'lobby') {
        startBtn.setAttribute('hidden', '');
      } else {
        startBtn.removeAttribute('hidden');
        if (isChipsMode && !chipsUnlocked) {
          startBtn.disabled = true;
          startBtn.textContent = '🔒 ОТКРОЕТСЯ НА 3 УРОВНЕ (НУЖНО 3 ДРУГА)';
        } else if (isChipsMode && !this.selectedAnteTrophyId) {
          startBtn.disabled = true;
          startBtn.textContent = '🪙 ВЫБЕРИ ФИШКУ НА КОН ВЫШЕ';
        } else if (count < MAX_DUEL_PLAYERS) {
          startBtn.disabled = true;
          startBtn.textContent = isChipsMode
            ? '⏳ ВЫЗОВИ 1 ДРУГА (УР. 3+) С ФИШКОЙ'
            : '⏳ ВЫБЕРИ 1 ДРУГА ВЫШЕ ИЛИ СКИНЬ ССЫЛКУ';
        } else if (!this.isHost()) {
          startBtn.disabled = true;
          startBtn.textContent = '⏳ ЖДЁМ СТАРТА ОТ ХОСТА...';
        } else {
          startBtn.disabled = false;
          startBtn.textContent = isChipsMode
            ? '🪙 НА СЧЁТ ТРИ! БОЙ 1 НА 1 НА ФИШКИ'
            : '🔥 НА СЧЁТ ТРИ! СТАРТ 1 НА 1';
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

    const head = document.createElement('div');
    head.className = 'dfp-head';
    const title = document.createElement('span');
    title.className = 'dfp-title';
    title.textContent = '👥 ВЫБЕРИ 1 ДРУГА НА ДУЭЛЬ (ТОЛЬКО ВДВОЁМ):';
    head.appendChild(title);
    host.appendChild(head);

    const tabs = document.createElement('div');
    tabs.className = 'dfp-tabs';
    tabs.setAttribute('role', 'tablist');

    const tabSent = document.createElement('button');
    tabSent.type = 'button';
    tabSent.id = 'btn-dfp-tab-sent';
    tabSent.className = `dfp-tab${this.pickerTab === 'sent' ? ' is-active' : ''}`;
    tabSent.textContent = `📨 Кому отправил (${sentList.length})`;
    tabSent.addEventListener('click', () => {
      Haptics.light();
      this.pickerTab = 'sent';
      this.renderFriendPickerUI();
    });

    const tabBranch = document.createElement('button');
    tabBranch.type = 'button';
    tabBranch.id = 'btn-dfp-tab-branch';
    tabBranch.className = `dfp-tab${this.pickerTab === 'branch' ? ' is-active' : ''}`;
    tabBranch.textContent = `🌳 Общая ветка (${branchList.length})`;
    tabBranch.addEventListener('click', () => {
      Haptics.light();
      this.pickerTab = 'branch';
      this.renderFriendPickerUI();
    });

    tabs.append(tabSent, tabBranch);
    host.appendChild(tabs);

    // OASIS UX-2: понятное 1-строчное пояснение разницы между «Кому отправил» и «Общей веткой»
    const tabExplain = document.createElement('p');
    tabExplain.className = 'dfp-tab-explain';
    tabExplain.id = 'dfp-tab-explain';
    tabExplain.textContent = this.pickerTab === 'branch'
      ? 'Друзья твоих друзей по общей цепочке бочек (до 4 колен)'
      : 'Друзья, кому ты уже кидал бочку (или кто прислал тебе)';
    host.appendChild(tabExplain);

    const items = this.pickerTab === 'branch' ? branchList : sentList;
    const listEl = document.createElement('div');
    listEl.className = 'dfp-list';

    if (!this.duelCandidates?.loaded) {
      const loadMsg = document.createElement('p');
      loadMsg.className = 'dfp-empty';
      loadMsg.textContent = 'Загружаем друзей из твоей ветки…';
      listEl.appendChild(loadMsg);
    } else if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dfp-empty-box';
      const txt = document.createElement('p');
      txt.className = 'dfp-empty';
      txt.textContent = this.pickerTab === 'branch'
        ? 'В твоей общей ветке пока нет других игроков — отправь бочку первому другу или скинь ссылку 1×1 ниже!'
        : 'Ты ещё никому не отправлял бочку — закатай друга (он появится здесь) или скинь ссылку 1×1 ниже!';
      empty.appendChild(txt);
      if (this.onOpenPackFriend) {
        const packBtn = document.createElement('button');
        packBtn.type = 'button';
        packBtn.className = 'btn-secondary btn-compact dfp-pack-btn';
        packBtn.textContent = '🛢 ЗАКАТАТЬ ДРУГА В БОЧКУ';
        packBtn.addEventListener('click', () => {
          Haptics.light();
          this.onOpenPackFriend();
        });
        empty.appendChild(packBtn);
      }
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
        if (avaUrl && /^(https?:\/\/|\.?\/|data:image\/)/i.test(avaUrl)) {
          const img = document.createElement('img');
          img.src = avaUrl;
          img.alt = friend.name || 'Друг';
          ava.appendChild(img);
        } else {
          ava.textContent = (friend.name || 'Д').trim().slice(0, 2).toUpperCase();
        }

        const info = document.createElement('div');
        info.className = 'dfp-info';
        const nameEl = document.createElement('strong');
        nameEl.textContent = friend.name || 'Друг из Цеха';
        const tagEl = document.createElement('span');
        if (this.pickerTab === 'branch') {
          const hop = Number(friend.hop || 1);
          tagEl.textContent = hop <= 1
            ? 'Прямой друг в ветке'
            : `Общая ветка · ${hop}-е колено`;
        } else if (friend.relation === 'invited_by') {
          tagEl.textContent = 'Прислал тебе бочку';
        } else {
          tagEl.textContent = friend.opened_barrel
            ? 'Открыл твою бочку ✓'
            : 'Ты отправил ему бочку';
        }
        info.append(nameEl, tagEl);
        left.append(ava, info);

        const key = String(friend.uid || friend.tg_id || friend.name || '');
        const alreadySent = this.challengedUids.has(key);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `dfp-btn${alreadySent ? ' is-sent' : ''}`;
        btn.disabled = alreadySent;
        btn.textContent = alreadySent ? '✓ ПОЗВАН' : '⚔️ ВЫЗВАТЬ 1×1';
        btn.addEventListener('click', async () => {
          Haptics.medium();
          this.challengedUids.add(key);
          btn.disabled = true;
          btn.classList.add('is-sent');
          btn.textContent = '📡 ЗОВЁМ...';
          try {
            await this.onChallengeFriend?.(friend, this.roomId);
            btn.textContent = '✓ ПОЗВАН';
          } catch {
            this.challengedUids.delete(key);
            btn.disabled = false;
            btn.classList.remove('is-sent');
            btn.textContent = '⚔️ ВЫЗВАТЬ 1×1';
          }
        });

        row.append(left, btn);
        listEl.appendChild(row);
      });
    }

    host.appendChild(listEl);
  }

  /**
   * v8.0: Мгновенный запуск дуэли «В одного (Соло)» за Банк Закрытой Премьеры (без ожидания друзей)
   */
  async startSoloDuel() {
    if (!this.active || this._soloStarting || this.phase !== 'lobby') return;
    this._soloStarting = true;
    const soloBtn = document.getElementById('btn-duel-play-solo');
    if (soloBtn) soloBtn.disabled = true;
    try {
      this.soloMode = true;
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
    if (this.players.length < 2) {
      this.onToast?.('Позови хотя бы одного друга за стол (или добавь бота в Тест-Боге)!');
      return;
    }

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

    // Обновляем партию ТОЛЬКО на старте новой игры или когда добили все закрытые бочки!
    const needFreshRack = !isFreeRerack || closedRemaining.length < contenders.length || !this.safeIndices.length;

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
      // v19.3: Раунды с возрастающей сложностью (6 -> 8 -> 10 -> 12 бочек):
      // - 🎟 ЧАСТЬ БИЛЕТА (65% на старте, 100% на следующем раунде) -> 4/4 = целый билет!
      // - 🪙 ФИШКА (коллекционная карточка + 150 ⭐) в КАЖДОМ заходе
      // - ❤️ +1 ЖИЗНЬ (до макс 6 ❤️)
      // - ⭐ БАЛЛЫ (350 / 250 / 150) + пустые (−1 ❤️) + скримеры (☠️ −2 ❤️)
      batchHasTicket = (this.duelRoundsWithoutTicket || 0) >= 1 ? true : Math.random() < 0.65;
      const pointTiers = [350, 250, 150];
      barrelLoot = {};
      safeIndices = [];
      let cursor = 0;

      if (batchHasTicket && cursor < barrelCount) {
        const tIdx = indices[cursor++];
        barrelLoot[tIdx] = { kind: 'ticket', value: 1000, label: '🎟 ЧАСТЬ БИЛЕТА!' };
        safeIndices.push(tIdx);
      }

      if (cursor < barrelCount) {
        const cIdx = indices[cursor++];
        barrelLoot[cIdx] = { kind: 'chip', value: 150, label: '💎 ФИШКА (+150 ⭐)' };
        safeIndices.push(cIdx);
      }

      if (cursor < barrelCount) {
        const lIdx = indices[cursor++];
        barrelLoot[lIdx] = { kind: 'life', value: 1, label: '❤️ +1 ЖИЗНЬ' };
        safeIndices.push(lIdx);
      }

      const ptsSlots = barrelCount <= 6 ? (batchHasTicket ? 1 : 2) : barrelCount <= 8 ? 2 : 3;
      for (let p = 0; p < ptsSlots && cursor < barrelCount; p++) {
        const pIdx = indices[cursor++];
        const val = pointTiers[p % pointTiers.length];
        barrelLoot[pIdx] = { kind: 'points', value: val, label: `⭐ +${val}` };
        safeIndices.push(pIdx);
      }

      const emptySlots = barrelCount <= 8 ? 1 : 2;
      for (let e = 0; e < emptySlots && cursor < barrelCount; e++) {
        const eIdx = indices[cursor++];
        barrelLoot[eIdx] = { kind: 'empty', value: 0, label: '💨 ПУСТО (−1 ❤️)' };
      }

      while (cursor < barrelCount) {
        const sIdx = indices[cursor++];
        barrelLoot[sIdx] = { kind: 'screamer', value: -2, label: '☠️ СКРИМЕР (−2 ❤️)' };
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
  }

  async receiveRoundStart(payload) {
    this.clearAllTimers();
    this.clearBarrelClaimBadges();

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

    // Списываем ставку 1 ❤️ (и блокируем выбранную фишку в режиме 'chips') строго 1 раз за новую партию
    if (!payload.isFreeRerack && !amISpectator && this.antePaidForRound !== this.roundKey) {
      const ante = await startDuelAnte(this.getTgUser?.(), this.roomId, this.roundKey, {
        duelMode: this.duelMode,
        anteTrophyId: this.duelMode === 'chips' ? this.selectedAnteTrophyId : null,
      });
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
          this.phase = 'lobby';
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
        this.phase = 'finished';
        this.showNoLivesPrompt();
        return;
      }
      this.antePaidForRound = this.roundKey;
      this.onProfileSync?.({ lives: ante.lives, premierePoints: ante.premierePoints });
    }

    this.renderLobbyUI();

    // Вскрытые бочки НЕ закрываются обратно, пока игроки не откроют всю партию из 10 бочек!
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
    this.scene.setInteractive(false);

    const closedLeft = Math.max(0, this.barrelCount - this.openedIndices.length);

    // Обратный отсчёт: РАЗ... ДВА... ТРИ — БЕЙ!
    this.phase = 'countdown';
    this.renderLobbyUI();
    const banner = document.getElementById('duel-countdown-banner');
    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');
    banner?.removeAttribute('hidden');

    if (bannerSub) {
      if (payload.isSuddenDeath) {
        bannerSub.textContent = payload.resetRack
          ? `⚡ СУПЕРФИНАЛ 1 НА 1: ВСЕ БОЧКИ ВСКРЫТЫ — НОВЫЕ ${this.barrelCount} БОЧЕК!`
          : `⚡ СУПЕРФИНАЛ 1 НА 1 · ОСТАЛОСЬ ${closedLeft} ЗАКРЫТЫХ БОЧЕК ИЗ ${this.barrelCount}!`;
      } else if (payload.isFreeRerack) {
        bannerSub.textContent = payload.resetRack
          ? `🔄 ВСЕ БОЧКИ ВСКРЫТЫ! НОВЫЕ ${this.barrelCount} БОЧЕК БЕЗ СПИСАНИЯ ЖИЗНЕЙ!`
          : `🔥 ИГРАЕМ ДАЛЬШЕ — ОСТАЛОСЬ ${closedLeft} ЗАКРЫТЫХ БОЧЕК!`;
      } else {
        bannerSub.textContent = `В ЦЕХУ ${this.barrelCount} ЗАКРЫТЫХ БОЧЕК — ПРИГОТОВЬСЯ ХВАТАТЬ СВОЮ!`;
      }
    }

    const steps = ['РАЗ...', 'ДВА...', 'ТРИ — БЕЙ!'];
    steps.forEach((word, i) => {
      this.scheduleTimeout(() => {
        if (!this.active) return;
        const isGo = i === 2;
        if (bannerText) bannerText.textContent = word;
        banner?.classList.toggle('is-go', isGo);
        this.audio.playCountdownBeat(isGo);
        if (isGo) {
          Haptics.heavy();
          this.beginClaimWindow();
        } else {
          Haptics.light();
        }
      }, i * 780);
    });
  }

  refillFromTil() {
    this.duelLives = Math.max(6, Number(this.duelLives || 0));
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
    const pct = Math.max(0, Math.min(100, Math.round(Number(this.energy || 0))));
    const dl = Math.max(0, Math.round(Number(this.duelLives ?? 6)));
    const shards = Math.max(0, Math.min(4, Math.round(Number(this.getTicketShards?.() ?? 0))));
    if (shardsEl) shardsEl.textContent = `${shards}/4`;
    if (valEl) valEl.textContent = `${pct}%`;
    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      fillEl.classList.toggle('is-low', pct <= 20);
    }
    if (livesEl) livesEl.textContent = String(dl);
    if (livesPill) livesPill.classList.toggle('is-low', dl <= 1);
    const closedLeft = Math.max(0, (this.barrelCount || 6) - (this.openedIndices?.length || 0));
    const roundDisplay = Math.max(1, Number(this.tilRoundIdx || 1));
    if (statusEl) {
      statusEl.textContent = this.soloMode
        ? `🎬 Р${roundDisplay} (ТИЛЬ) · ${closedLeft}/${this.barrelCount || 6}`
        : `⚔️ 1×1 · ${closedLeft}/${this.barrelCount || 6}`;
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
    this.onToast?.(`⚡ Ход пропущен! Энергия сохранена (${this.energy}%) — бей по оставшимся бочкам в следующем раунде!`);
    const bannerSub = document.getElementById('duel-countdown-sub');
    if (bannerSub) {
      bannerSub.textContent = `⏭ ТЫ СЭКОНОМИЛ ЭНЕРГИЮ (⚡ ${this.energy}%)! Ждём удар соперника...`;
    }
  }

  continueBatchOrRematch() {
    if (!this.active) return;
    // Если кончились дуэльные жизни (СТРОГО 0 ❤️!) — на Небо к Тилю (он даёт 6 ❤️ + ⚡ 100%)!
    if (this.duelLives <= 0) {
      if (this.onDuelDefeatToTil) {
        document.getElementById('duel-result-box')?.setAttribute('hidden', '');
        this.onToast?.('🌊 Жизни на нуле (0 ❤️) — к Тилю на берег зарядить 6 ❤️ на дуэль!');
        this.onDuelDefeatToTil({ roomId: this.roomId, solo: this.soloMode });
      }
      return;
    }
    // Если жизни ещё есть (> 0 ❤️), а энергия на нуле — восстанавливаем энергию без ухода к Тилю!
    if (this.energy <= 0) {
      this.energy = 100;
      this.syncEnergyUI();
    }
    const closedLeft = Math.max(0, (this.barrelCount || 6) - (this.openedIndices?.length || 0));
    // Пока НИКТО не нашёл 🎟 Билет и есть закрытые бочки — продолжаем драться по этой же партии!
    const keepCurrentBatch = !this.batchResolved && closedLeft >= 2;
    this.hostInitiateRound({ isFreeRerack: keepCurrentBatch });
  }

  beginClaimWindow() {
    this.phase = 'claim';
    this.claimTimeLeft = 3.2;
    this.skippedThisTurn = false;
    const amISpectator = this.spectatorUids.includes(this.myUid);
    this.syncEnergyUI();

    if (!amISpectator) {
      this.scene.setInteractive(true);
    }

    if (this.roundWatchdogTimer) {
      clearTimeout(this.roundWatchdogTimer);
    }
    this.roundWatchdogTimer = window.setTimeout(() => {
      if (!this.active || (this.phase !== 'countdown' && this.phase !== 'claim')) return;
      if (this.isHost()) {
        this.finalizeClaimsAndBroadcastReveal();
      } else if (this.players.filter((p) => this.contenderUids.includes(p.uid)).length < 2) {
        this.clearAllTimers();
        this.phase = 'lobby';
        this.antePaidForRound = null;
        this.scene.setInteractive(false);
        this.renderLobbyUI();
      }
    }, 8500);

    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');

    // Если за столом есть песочные боты (/testbog/) — они захватывают только ЗАКРЫТЫЕ свободные бочки
    this.players
      .filter((p) => p.isBot && this.contenderUids.includes(p.uid))
      .forEach((bot, idx) => {
        const delay = 520 + idx * 420 + Math.round(Math.random() * 650);
        this.scheduleTimeout(() => {
          if (!this.active || this.phase !== 'claim') return;
          const free = [];
          for (let b = 0; b < this.barrelCount; b++) {
            if (!this.openedIndices.includes(b) && !this.claims[b]) free.push(b);
          }
          if (!free.length) return;
          const pick = free[Math.floor(Math.random() * free.length)];
          // v9.1: Визуальный и звуковой удар бота по конкретной бочке — игрок сразу видит, какую именно бочку занял бот!
          this.scene.triggerStrikeFX?.(pick);
          this.audio.playStrike?.(pick);
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
        }, delay);
      });

    // В Суперфинале вылетевший бот-зритель тоже может погреметь цепями
    const botSpec = this.players.find((p) => p.isBot && this.spectatorUids.includes(p.uid));
    if (botSpec) {
      this.scheduleTimeout(() => {
        if (!this.active || this.phase !== 'claim') return;
        this.audio.playChainRattle(0.95);
        this.scene.triggerScreamerShake(0.35);
        this.onToast?.(`⛓ ${botSpec.name} гремит цепями из нокаута!`);
      }, 1100);
    }

    const closedLeft = Math.max(0, this.barrelCount - this.openedIndices.length);
    let lastTs = performance.now();
    this.claimInterval = window.setInterval(() => {
      if (!this.active || this.phase !== 'claim') return;
      const now = performance.now();
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      this.claimTimeLeft = Math.max(0, this.claimTimeLeft - dt);

      if (bannerText) bannerText.textContent = `БЕЙ! ${this.claimTimeLeft.toFixed(1)}с`;
      if (bannerSub) {
        const myLocked = Object.values(this.claims).find((c) => c.uid === this.myUid);
        bannerSub.textContent = amISpectator
          ? 'Ты в нокауте — жми «Погреметь цепями» внизу!'
          : this.skippedThisTurn
            ? `⏭ Ход пропущен · Энергия сохранена (⚡ ${this.energy}%)`
            : myLocked
              ? `✓ Твоя бочка захвачена (⚡ ${this.energy}%)! Ждём вскрытия...`
              : `Бей любую из ${closedLeft} закрытых бочек (−25% ⚡) или жми «Пропустить»!`;
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
    if (this.phase !== 'claim') return true;
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

    this.scene.triggerStrikeFX(barrelIndex, worldPoint);
    this.audio.playStrike(barrelIndex);
    Haptics.medium();

    this.applyBarrelClaim(claimPayload, true);
    this.syncEnergyUI();
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

    // Удаляем прежний выбор этого игрока, если был
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

    // Если игрок сам не нажал удар (или нажал «Пропустить») — НЕ тратим его энергию!
    // Авто-захват остаётся только для ботов/соперников, которые не успели ударить.
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
        for (let b = 0; b < this.barrelCount; b++) {
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
      ? { kind: 'points', value: 250, label: '⭐ +250' }
      : { kind: 'empty', value: 0, label: '💨 ПУСТО' };
  }

  async executeReveal(payload) {
    if (this.phase === 'reveal') return;
    this.phase = 'reveal';
    this.clearAllTimers();
    this.scene.setInteractive(false);

    this.claims = payload.claims || this.claims;
    this.safeIndices = payload.safeIndices || this.safeIndices;
    if (payload.barrelLoot) this.barrelLoot = payload.barrelLoot;
    if (typeof payload.batchHasTicket === 'boolean') this.batchHasTicket = payload.batchHasTicket;
    if (Array.isArray(payload.openedIndices)) {
      this.openedIndices = [...payload.openedIndices];
    }

    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');
    if (bannerText) bannerText.textContent = 'ВСКРЫТИЕ БОЧЕК!';

    const entries = [];
    let anyScreamer = false;
    let anyPoints = false;

    for (const [bStr, claim] of Object.entries(this.claims)) {
      const bIdx = Number(bStr);
      const loot = this.getLootForBarrel(bIdx);
      if (claim.uid === this.myUid && loot.kind === 'ticket') {
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
    }

    const myEntry = entries.find((e) => e.claim.uid === this.myUid) || null;
    const oppEntry = entries.find((e) => e.claim.uid !== this.myUid) || null;

    if (anyScreamer) {
      const randScreamerIdx = Math.floor(Math.random() * 7);
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

    // v19.3: Баланс лута внутри бочек:
    // - 🎟 ЧАСТЬ БИЛЕТА -> Победа в партии (+1/4 части билета)!
    // - 🪙 ФИШКА -> Редкая коллекционная карточка в Коллекцию + 150 ⭐!
    // - ❤️ +1 ЖИЗНЬ -> +1 дуэльная жизнь (максимум 6 ❤️)!
    // - ⭐ БАЛЛЫ -> баллы летят прямо в шкалу Супер-приза!
    // - 💨 ПУСТО -> −1 ❤️ · ☠️ СКРИМЕР -> −2 ❤️!
    if (myEntry) {
      const k = myEntry.loot.kind;
      if (k === 'ticket' || k === 'points' || k === 'chip') {
        this.onFlyRating?.({
          count: k === 'ticket' ? 3 : 2,
          label: myEntry.loot.label,
          barrelIndex: myEntry.barrelIndex,
        });
        if (k === 'chip') {
          this.onCollectChipFromBarrel?.({ barrelIndex: myEntry.barrelIndex, loot: myEntry.loot });
        }
        if (k === 'points' || k === 'chip') {
          claimDuelPremiereBankReward(this.getTgUser?.(), { pointsBonus: myEntry.loot.value, solo: this.soloMode })
            .then((bankRes) => {
              if (bankRes?.ok) {
                this.onProfileSync?.({ premierePoints: bankRes.premierePoints });
              }
            })
            .catch(() => {});
        }
      } else if (k === 'life') {
        this.duelLives = Math.min(6, Math.max(1, Number(this.duelLives || 0) + 1));
        this.onFlyLife?.({ count: 1, label: '+1 ❤️', barrelIndex: myEntry.barrelIndex });
      } else if (k === 'empty') {
        this.duelLives = Math.max(0, Number(this.duelLives || 0) - 1);
      } else if (k === 'screamer') {
        this.duelLives = Math.max(0, Number(this.duelLives || 0) - 2);
      }
    }

    // Показываем прямо над каждой вскрытой бочкой, ЧТО выпало (🎟 БИЛЕТ / ⭐ +250 / ❤️ +1 / 💨 −1 ❤️ / ☠️ −2 ❤️)!
    this.renderBarrelClaimBadges(true);
    this.syncEnergyUI();

    // v13.0: К Тилю на Северное море — СТРОГО ТОЛЬКО ПРИ НУЛЕ ЖИЗНЕЙ (duelLives <= 0)!
    // Если жизни ещё есть (> 0 ❤️), а энергия дошла до 0% — передышка (энергия восстанавливается до 100%) и играем дальше!
    if (this.duelLives > 0 && this.energy <= 0) {
      this.energy = 100;
      this.syncEnergyUI();
    }
    const ticketEntry = entries.find((e) => e.loot.kind === 'ticket') || null;
    const closedLeftNow = Math.max(0, (this.barrelCount || 10) - (this.openedIndices?.length || 0));
    const needTilNow = !ticketEntry && this.duelLives <= 0;
    this.batchResolved = Boolean(ticketEntry || closedLeftNow < 2);

    const summaryLine = entries
      .map((e) => `${e.claim.uid === this.myUid ? 'ТЫ' : e.claim.name}: ${e.loot.label}`)
      .join('  vs  ');

    if (bannerSub) {
      bannerSub.textContent = ticketEntry
        ? ticketEntry.claim.uid === this.myUid
          ? `🎟 БИЛЕТ В КИНО ТВОЙ! (${summaryLine})`
          : `💥 ${ticketEntry.claim.name.toUpperCase()} НАШЁЛ БИЛЕТ РАНЬШЕ! (${summaryLine})`
        : needTilNow
          ? `🌊 ЖИЗНИ НА НУЛЕ (❤️ 0) — ОТПРАВЛЯЕМСЯ К ТИЛЮ ЗА 6 ❤️!`
          : `🔨 ИГРАЕМ ДАЛЬШЕ! ОСТАЛОСЬ ${closedLeftNow} БОЧЕК (${summaryLine})`;
    }

    // v12.5: БЕЗ ПЕРЕРЫВОВ И ВОПРОСОВ «БИТЬ ДАЛЬШЕ?» — пока никто не нашёл билет и есть жизни + энергия, бой идёт АВТОМАТОМ!
    if (!ticketEntry && !needTilNow && closedLeftNow >= 2) {
      this.scheduleTimeout(() => {
        if (!this.active) return;
        this.clearBarrelClaimBadges();
        if (this.isHost()) {
          this.hostInitiateRound({ isFreeRerack: true });
        }
      }, 1550);
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
        })
      : { potLives: 0, winnerLives: null, winnerPoints: null, goldenTicketDropped: false };

    let serverTicketRes = null;
    if (ticketEntry && ticketEntry.claim.uid === this.myUid) {
      serverTicketRes = await awardTicketShardServer(this.getTgUser?.(), 'duel').catch(() => ({
        ok: false,
        shards: 0,
        mergedTicket: false,
        granted: false,
        reason: 'network_error',
        fallbackPoints: 500,
      }));
    }

    this.scheduleTimeout(() => {
      if (!this.active) return;
      this.phase = 'finished';
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
    }, 1650);
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
    const myLoot = detail.myEntry?.loot || { kind: 'skip', value: 0, label: '⏭ ПРОПУСТИЛ (⚡ СОХРАНЕНА)' };
    const oppName = detail.oppEntry?.claim?.name || TIL_BOT_NAME;
    const oppLoot = detail.oppEntry?.loot || { kind: 'empty', value: 0, label: '💨 ПУСТО' };
    const iFoundTicket = Boolean(ticketWinner && ticketWinner.uid === this.myUid);
    const oppFoundTicket = Boolean(ticketWinner && ticketWinner.uid !== this.myUid);
    const closedLeft = Math.max(0, (this.barrelCount || 10) - (this.openedIndices?.length || 0));

    const serverTicketGranted = Boolean(detail.serverTicketGranted);
    if (iFoundTicket && detail.serverTicketRes?.ok && !detail.serverTicketRes.reason) {
      const immediatePatch = {
        ticketShards: detail.serverTicketRes.mergedTicket ? 0 : Number(detail.serverTicketRes.shards || 0),
      };
      if (serverTicketGranted) {
        immediatePatch.hasPendingTicket = true;
        if (detail.serverTicketRes.pendingTicketsCount != null) {
          immediatePatch.pendingTicketsCount = Number(detail.serverTicketRes.pendingTicketsCount);
        }
      }
      this.onProfileSync?.(immediatePatch);
    }
    // Начисляем +500 ⭐ очки в рейтинг за найденную 🎟 часть билета (баллы и фишки уже начислены при вскрытии в executeReveal)
    const myPointsEarned = iFoundTicket ? 500 : 0;
    if (myPointsEarned > 0 || iFoundTicket) {
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
    // v13.0: К Тилю на Северное море — СТРОГО ТОЛЬКО при 0 ❤️ жизней!
    const needTilRefill = !iFoundTicket && this.duelLives <= 0;

    if (iFoundTicket) {
      Haptics.success();
      const sRes = detail.serverTicketRes || {};
      if (serverTicketGranted) {
        if (titleEl) titleEl.textContent = '🎟 4/4 — БИЛЕТ СКЛЕЕН В ДУЭЛИ! (+500 ⭐)';
        if (subEl) {
          subEl.textContent = `Вскрыл призовую бочку раньше ${oppName} (${oppLoot.label})! 4 части склеились в целый бесплатный билет — подари его другу в Telegram!`;
        }
        this.scheduleTimeout(() => this.onOpenGoldenFork?.(), 900);
      } else if (sRes.ok && !sRes.reason && Number(sRes.shards || 0) > 0) {
        const sh = Number(sRes.shards || 1);
        if (titleEl) titleEl.textContent = `🎟 ПОБЕДА! СОБРАНА ЧАСТЬ БИЛЕТА ${sh}/4 (+500 ⭐)`;
        if (subEl) {
          subEl.textContent = `Вскрыл призовую бочку раньше ${oppName}! У тебя уже ${sh} из 4 частей (${sh * 25}%) — собери 4/4 и подари другу бесплатный билет в кино!`;
        }
      } else if (sRes.reason === 'seed_admin_excluded') {
        if (titleEl) titleEl.textContent = '🛡 ПОБЕДА В ДУЭЛИ (РЕЖИМ КОМАНДЫ ПОСЕВА)';
        if (subEl) {
          subEl.textContent = `Победа над ${oppName}! Призовой пул билетов сохранён для реальных зрителей.`;
        }
      } else {
        if (titleEl) titleEl.textContent = '🏆 ПОБЕДА В ДУЭЛИ! БОНУС +500 ⭐ В ТОП-20 МОСКВЫ!';
        if (subEl) {
          subEl.textContent = `Вскрыл призовую бочку раньше ${oppName}! Дневная партия билетов на сегодня разобрана (новая откроется в 00:00 МСК) — вместо 4-й части зачислено +500 ⭐ в рейтинг Закрытого показа в Москве!`;
        }
      }
    } else if (outOfRounds) {
      Haptics.error();
      if (titleEl) titleEl.textContent = '🔄 3 РАУНДА БЕЗ БИЛЕТА — ПОРА В ЦЕХ НА УРОВНИ!';
      if (subEl) {
        subEl.textContent = `${oppFoundTicket ? `${oppName} перехватил 🎟 билет!` : 'Бочки в партии кончились.'} Возвращайся на уровни цеха — спасай пацана и набивай ⭐ для шкалы Закрытого показа!`;
      }
    } else if (oppFoundTicket) {
      Haptics.error();
      const leftRounds = Math.max(1, (this.maxDuelRounds || 3) - this.duelRoundsWithoutTicket);
      if (titleEl) titleEl.textContent = `💥 ПРОИГРАЛ! ${oppName.toUpperCase()} НАШЁЛ 🎟 БИЛЕТ!`;
      if (subEl) {
        subEl.textContent = needTilRefill
          ? `У тебя закончились силы (❤️ ${this.duelLives} · ⚡ ${this.energy}%). Отправляемся к Тилю на берег — он зарядит 6 ❤️ жизней и ⚡ 100% на дуэль!`
          : `Ты открыл: ${myLoot.label}. Осталось попыток-раундов до возврата на уровни: ${leftRounds}. Жми новую партию!`;
      }
    } else if (needTilRefill) {
      Haptics.error();
      if (titleEl) titleEl.textContent = `🌊 СИЛЫ НА НУЛЕ (❤️ ${this.duelLives} · ⚡ ${this.energy}%) — К ТИЛЮ!`;
      if (subEl) {
        subEl.textContent = `Итог хода: Ты (${myLoot.label}) vs ${oppName} (${oppLoot.label}). Тиль на берегу Северного моря даст минимум 6 ❤️ жизней и ⚡ 100% энергии на Дуэль!`;
      }
    } else {
      Haptics.light();
      const statusVerb = mySkipped
        ? '⏭ ЭНЕРГИЯ СЭКОНОМЛЕНА — ЧАСТЬ БИЛЕТА ЕЩЁ В ЦЕХУ!'
        : myLoot.kind === 'life'
          ? '❤️ +1 ЖИЗНЬ ИЗ БОЧКИ! ИЩЕМ 🎟 ЧАСТЬ БИЛЕТА ДАЛЬШЕ!'
          : myLoot.kind === 'chip'
            ? '💎 ФИШКА +150 ⭐ ИЗ БОЧКИ! ИЩЕМ 🎟 ЧАСТЬ БИЛЕТА ДАЛЬШЕ!'
            : myLoot.kind === 'points'
              ? `⭐ ${myLoot.label} В РЕЙТИНГ! ЧАСТЬ БИЛЕТА ЕЩЁ В БОЧКАХ!`
              : myLoot.kind === 'screamer'
                ? '☠️ СКРИМЕР В БОЧКЕ (−2 ❤️)! ЖМЁМ ДАЛЬШЕ!'
                : '💨 МИМО (−1 ❤️)! ЧАСТЬ БИЛЕТА ЕЩЁ В ОСТАВШИХСЯ БОЧКАХ!';
      if (titleEl) titleEl.textContent = statusVerb;
      if (subEl) {
        subEl.textContent = `Ход: Ты (${myLoot.label}) vs ${oppName} (${oppLoot.label}) · В запасе ❤️ ${this.duelLives} и ⚡ ${this.energy}%. Осталось ${closedLeft} закрытых бочек — найди 🎟 Билет раньше соперника!`;
      }
    }

    if (needTilRefill && this.onDuelDefeatToTil) {
      this.scheduleTimeout(() => {
        if (!this.active || this.phase !== 'finished') return;
        box?.setAttribute('hidden', '');
        this.onDuelDefeatToTil({ roomId: this.roomId, solo: this.soloMode });
      }, 2400);
    }

    if (rematchBtn) {
      if (needTilRefill) {
        rematchBtn.textContent = '🌊 НА НЕБО К ТИЛЮ — ЗАБРАТЬ 6 ❤️ И ⚡ 100%';
      } else if (!this.batchResolved && closedLeft >= 2) {
        rematchBtn.textContent = `🔨 БИТЬ ДАЛЬШЕ (ИЩЕМ 🎟 БИЛЕТ · ${closedLeft} БОЧЕК · ❤️ ${this.duelLives} · ⚡ ${this.energy}%)`;
      } else {
        const nextB = [6, 8, 10, 12][Math.min(3, Math.max(0, Number(this.tilRoundIdx || 1)))];
        rematchBtn.textContent = this.soloMode
          ? `🎬 СЛЕДУЮЩИЙ РАУНД ПРОТИВ ТИЛЯ (${nextB} БОЧЕК · ❤️ ${this.duelLives})`
          : `🔄 РЕВАНШ 1 НА 1 (${nextB} БОЧЕК · СТАВКА 1 ❤️)`;
      }
      rematchBtn.removeAttribute('hidden');
    }
    if (inviteLivesBtn) {
      inviteLivesBtn.textContent = '🛢 ЗАКАТАТЬ НОВОГО ДРУГА (+3 ❤️ · +20% К ШКАЛЕ)';
      inviteLivesBtn.removeAttribute('hidden');
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
    if (this.onDuelDefeatToTil) {
      this.onToast?.('⚡ Энергия на нуле — в подвал к Бочке Тиля на 12 сек!');
      this.onDuelDefeatToTil({ roomId: this.roomId, solo: this.soloMode });
      return;
    }
    const box = document.getElementById('duel-result-box');
    const titleEl = document.getElementById('duel-result-title');
    const subEl = document.getElementById('duel-result-sub');
    const rematchBtn = document.getElementById('btn-duel-rematch');

    box?.removeAttribute('hidden');
    if (titleEl) titleEl.textContent = '❤️ НА СЧЕТУ 0 ЖИЗНЕЙ ДЛЯ СТАВКИ!';
    if (subEl) {
      subEl.textContent =
        'Для входа в кон нужна 1 ❤️. Отправь бочку или ссылку на трейлер новому другу (+1 ❤️ сразу и +2 ❤️ за вход) и возвращайся за стол!';
    }
    rematchBtn?.setAttribute('hidden', '');
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

      const initials = (claim.name || '?').trim().slice(0, 2).toUpperCase();
      const ava = claim.avatar
        ? `<img src="${escapeAttr(claim.avatar)}" alt="" />`
        : `<span>${escapeHtml(initials)}</span>`;
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
