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

/**
 * Контроллер синхронного мультиплеера на 2–3 игроков «НА СЧЁТ ТРИ!» (Supabase Realtime Presence + Broadcast)
 * и режима «👀 Подглядывать за игрой» (`watch_<barrelId>`).
 * Все промежуточные клики, таймеры и «Погреметь цепями» идут строго через WebSocket в оперативной памяти (0 записей в БД).
 */
export class WorkshopDuelController {
  constructor({ scene, audio, getTgUser, onProfileSync, onToast, onOpenInviteShare, onOpenGoldenFork, onExitToHub, onDuelDefeatToTil, onFlyRating, onFlyLife, onReturnToLevels }) {
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
    this.soloMode = false;
    this.energy = 100;
    this.duelLives = 6; // v12.0: Минимум 6 жизней именно на Дуэль (Тиль всегда пополняет минимум до 6 ❤️!)
    this.duelRoundsWithoutTicket = 0; // Если не нашёл билет за 3 раунда -> возврат на уровни искать пацана!
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
    this.barrelCount = 10;
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

  async openRoom(roomId, { autoAddTestBots = false } = {}) {
    this.leaveRoom(false);

    const tgUser = this.getTgUser?.() || null;
    this.myUid = getViewerUid(tgUser);
    this.myName = tgUser?.name || (isTestBogSessionActive() ? 'Тест-Бог' : 'Игрок');
    this.myAvatar = tgUser?.photoUrl || '';
    this.roomId = String(roomId || `d_${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28);
    this.active = true;
    this.phase = 'lobby';
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
    document.getElementById('duel-spectator-bar')?.setAttribute('hidden', '');
    document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');

    // Показываем кнопку добавления ботов только в песочнице /testbog/
    const botBtn = document.getElementById('btn-duel-add-bot');
    if (botBtn) {
      if (isTestBogSessionActive()) botBtn.removeAttribute('hidden');
      else botBtn.setAttribute('hidden', '');
    }

    this.scene.resetRound({
      barrelCount: 10,
      targetIndex: 0,
      golden: false,
    });
    this.scene.setInteractive(false);

    this.connectRealtimeChannel();
    this.renderLobbyUI();
    this.startBadgeProjectionLoop();
  }

  leaveRoom(triggerCallback = true) {
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
    if (this.players.length >= 3) {
      this.onToast?.('За столом уже максимум 3 игрока!');
      return;
    }
    this.botCounter += 1;
    const names = ['Макс (Кент 🤖)', 'Алина (Кент 🤖)', 'Дэн (Цех 🤖)'];
    const botName = names[(this.botCounter - 1) % names.length];
    this.players.push({
      uid: `bot_${this.botCounter}_${Date.now().toString(36)}`,
      name: botName,
      avatar: '',
      joinedAt: Date.now() + this.botCounter,
      isBot: true,
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
      // Сохраняем локальных песочных ботов (если есть) и ограничиваем стол 3 слотами
      const bots = this.players.filter((p) => p.isBot);
      const merged = [...list, ...bots]
        .sort((a, b) => (a.joinedAt - b.joinedAt) || a.uid.localeCompare(b.uid))
        .slice(0, 3);

      if (merged.length > 0) {
        this.players = merged;
        if (this.phase === 'lobby' || this.phase === 'finished') {
          this.renderLobbyUI();
        } else if (this.phase === 'countdown' || this.phase === 'claim') {
          const presentUids = merged.map((p) => p.uid);
          const presentContenders = this.contenderUids.filter((u) => presentUids.includes(u));
          if (presentContenders.length < 2) {
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

    ch.on('broadcast', { event: 'duel_ante_failed' }, ({ payload }) => {
      if (!this.active || !payload || payload.roundKey !== this.roundKey) return;
      this.contenderUids = this.contenderUids.filter((u) => u !== payload.uid);
      this.roundParticipants = this.roundParticipants.filter((u) => u !== payload.uid);
      if (this.contenderUids.length < 2) {
        this.clearAllTimers();
        this.phase = 'lobby';
        this.antePaidForRound = null;
        this.scene.setInteractive(false);
        this.onToast?.(`⚠️ У ${payload.name || 'игрока'} закончились ❤️ для ставки — раунд остановлен.`);
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
    if (potEl) {
      if (count >= 3) {
        potEl.innerHTML =
          '🔥 <strong>БАНК НА ТРОИХ: 3 ❤️</strong> + БОНУС ЦЕХА: <strong>+450 ⭐ ОЧКОВ · +0.25 ШКАЛЫ · 8% ЗОЛОТАЯ БОЧКА 🎟</strong>';
        potEl.classList.add('is-triple-bonus');
      } else {
        potEl.innerHTML =
          '⚔️ <strong>БАНК ДУЭЛИ: 2 ❤️</strong> (ставки по 1 ❤️ · Победитель забирает банк + 120 ⭐ в ТОП-10)';
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
          const vsBot = this.players.some((p) => p.isBot);
          miniStatus.textContent = isFinished
            ? '🏁 ИТОГ РАУНДА'
            : vsBot
              ? '🤖 БОЙ С БОТОМ (ПОКА ЖДЁМ ДРУЗЕЙ)'
              : `⚔️ БОЙ · ${count} ИГРОКА`;
        }
      } else {
        liveMiniBar.setAttribute('hidden', '');
      }
    }

    const shareLinkBtn = document.getElementById('btn-duel-share-link');
    if (invite3Btn) {
      if (count < 3 && (this.phase === 'lobby' || this.phase === 'finished')) {
        invite3Btn.removeAttribute('hidden');
        shareLinkBtn?.removeAttribute('hidden');
        const need = Math.max(1, 3 - count);
        if (!invite3Btn.dataset.pushCooldown) {
          invite3Btn.textContent =
            count === 1
              ? `📣 ПУШ ВСЕМ ДРУЗЬЯМ В БОЧКЕ (НУЖНО ЕЩЁ ${need})`
              : '📣 ПУШ ДРУЗЬЯМ В БОЧКЕ (+450 ⭐ И БИЛЕТ!)';
        }
      } else {
        invite3Btn.setAttribute('hidden', '');
        shareLinkBtn?.setAttribute('hidden', '');
      }
    }

    // v11.0: На небо к Тилю — СТРОГО только при поражении и пустой энергии (кнопки ожидания в лобби больше нет!)
    this.syncEnergyUI();

    if (slotsEl) {
      const cards = [];
      for (let i = 0; i < 3; i++) {
        const p = this.players[i];
        if (p) {
          const isKnockout = this.spectatorUids.includes(p.uid);
          const initials = (p.name || '?').trim().slice(0, 2).toUpperCase();
          const avatarHtml = p.avatar
            ? `<img src="${escapeAttr(p.avatar)}" alt="" class="duel-slot-avatar-img" />`
            : `<span class="duel-slot-initials">${escapeHtml(initials)}</span>`;
          cards.push(`
            <div class="duel-slot-card is-filled ${isKnockout ? 'is-knockout' : ''}">
              <div class="duel-slot-avatar">${avatarHtml}</div>
              <div class="duel-slot-meta">
                <strong>${escapeHtml(p.name)}</strong>
                <span>${isKnockout ? '☠️ В НОКАУТЕ (ЗРИТЕЛЬ)' : p.uid === this.myUid ? 'ВЫ · В СТРОЮ' : 'В СТРОЮ'}</span>
              </div>
            </div>
          `);
        } else {
          cards.push(`
            <div class="duel-slot-card is-empty">
              <div class="duel-slot-avatar"><span class="duel-slot-initials">+</span></div>
              <div class="duel-slot-meta">
                <strong>${i === 2 ? '3-Й СЛОТ (+БОНУС ЦЕХА)' : 'ЖДЁМ СОПЕРНИКА...'}</strong>
                <span>${i === 2 ? '+450 ⭐ и шанс билета' : 'Отправь ссылку другу'}</span>
              </div>
            </div>
          `);
        }
      }
      slotsEl.innerHTML = cards.join('');
    }

    const soloBtn = document.getElementById('btn-duel-play-solo');
    if (soloBtn) {
      if (this.phase === 'lobby') soloBtn.removeAttribute('hidden');
      else soloBtn.setAttribute('hidden', '');
    }

    if (startBtn) {
      if (this.phase !== 'lobby') {
        startBtn.setAttribute('hidden', '');
      } else {
        startBtn.removeAttribute('hidden');
        if (count < 2) {
          startBtn.disabled = true;
          startBtn.textContent = '⏳ ЖДЁМ ДРУЗЕЙ (ИЛИ ЖМИ «ИГРАТЬ В ОДНОГО» ВЫШЕ)';
        } else if (!this.isHost()) {
          startBtn.disabled = true;
          startBtn.textContent = '⏳ ЖДЁМ СТАРТА ОТ ХОСТА...';
        } else {
          startBtn.disabled = false;
          startBtn.textContent = `🔥 НА СЧЁТ ТРИ! СТАРТ (${count} ИГРОКА · БАНК ×3)`;
        }
      }
    }
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
          uid: 'bot_workshop_master',
          name: 'Мастер Цеха [БОТ]',
          avatar: '',
          joinedAt: Date.now() + 10,
          isBot: true,
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
    const barrelCount = 10;
    const safeCount = 5;

    const prevOpened = isFreeRerack ? [...this.openedIndices] : [];
    const closedRemaining = Array.from({ length: barrelCount }, (_, i) => i).filter(
      (i) => !prevOpened.includes(i)
    );

    // Обновляем партию из 10 бочек ТОЛЬКО на старте новой игры или когда добили все закрытые бочки!
    const needFreshRack = !isFreeRerack || closedRemaining.length < contenders.length || !this.safeIndices.length;

    let safeIndices = this.safeIndices;
    let openedIndices = prevOpened;
    let barrelLoot = this.barrelLoot || {};
    let batchHasTicket = Boolean(this.batchHasTicket);

    if (needFreshRack) {
      const indices = Array.from({ length: barrelCount }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      // v12.5: Сбалансированная, напряжённая Охота за Билетом в партии из 10 бочек:
      // - 🎟 БИЛЕТ В КИНО — РЕДКИЙ (~35% партий в Раундах 1-2, гарантирован на 3-м раунде если ещё не выпадал!)
      // - ТОЛЬКО 1 редкая бочка ❤️ +1 ЖИЗНЬ (макс 6 ❤️, больше не раздувается!)
      // - 2-3 бочки ⭐ БАЛЛЫ (350 / 250 / 150 ⭐)
      // - 3 пустых (💨 −1 ❤️) + 2-3 скримера (☠️ −2 ❤️ — реальная опасность быстро потерять жизни!)
      batchHasTicket = (this.duelRoundsWithoutTicket || 0) >= 2 ? true : Math.random() < 0.35;
      const pointTiers = [350, 250, 150];
      barrelLoot = {};
      safeIndices = [];
      let cursor = 0;

      if (batchHasTicket) {
        const tIdx = indices[cursor++];
        barrelLoot[tIdx] = { kind: 'ticket', value: 1000, label: '🎟 БИЛЕТ В КИНО!' };
        safeIndices.push(tIdx);
      }

      const lIdx = indices[cursor++];
      barrelLoot[lIdx] = { kind: 'life', value: 1, label: '❤️ +1 ЖИЗНЬ' };
      safeIndices.push(lIdx);

      const ptsSlots = batchHasTicket ? 2 : 3;
      for (let p = 0; p < ptsSlots && cursor < barrelCount; p++) {
        const pIdx = indices[cursor++];
        const val = pointTiers[p % pointTiers.length];
        barrelLoot[pIdx] = { kind: 'points', value: val, label: `⭐ +${val}` };
        safeIndices.push(pIdx);
      }

      for (let e = 0; e < 3 && cursor < barrelCount; e++) {
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
    this.contenderUids = payload.contenderUids || this.players.map((p) => p.uid);
    if (!payload.isFreeRerack) {
      this.roundParticipants = Array.from(
        new Set(payload.roundParticipants || this.players.map((p) => p.uid))
      );
    } else if (!this.roundParticipants?.length) {
      this.roundParticipants = Array.from(new Set(this.contenderUids));
    }
    this.spectatorUids = payload.spectatorUids || [];
    this.barrelCount = payload.barrelCount || 10;
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

    // Списываем ставку 1 ❤️ строго 1 раз за новую партию (НЕ при Ничьей и НЕ при Суперфинале 1х1)
    if (!payload.isFreeRerack && !amISpectator && this.antePaidForRound !== this.roundKey) {
      const ante = await startDuelAnte(this.getTgUser?.(), this.roomId, this.roundKey);
      if (!ante.ok) {
        this.broadcast('duel_ante_failed', {
          uid: this.myUid,
          name: this.myName,
          roundKey: this.roundKey,
        });
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
          ? '⚡ СУПЕРФИНАЛ 1 НА 1: ВСЕ БОЧКИ ВСКРЫТЫ — НОВЫЕ 10 БОЧЕК!'
          : `⚡ СУПЕРФИНАЛ 1 НА 1 · ОСТАЛОСЬ ${closedLeft} ЗАКРЫТЫХ БОЧЕК ИЗ ${this.barrelCount}!`;
      } else if (payload.isFreeRerack) {
        bannerSub.textContent = payload.resetRack
          ? '🔄 ВСЕ 10 БОЧЕК ВСКРЫТЫ! НОВАЯ ПАРТИЯ БЕЗ СПИСАНИЯ ЖИЗНЕЙ!'
          : `🔥 НИЧЬЯ! БОЧКИ НЕ ОБНОВЛЯЮТСЯ — ОСТАЛОСЬ ${closedLeft} ЗАКРЫТЫХ!`;
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
    const livesEl = document.getElementById('duel-lives-val');
    const livesPill = document.getElementById('duel-lives-pill');
    const skipBtn = document.getElementById('btn-duel-skip-strike');
    const statusEl = document.getElementById('duel-live-mini-status');
    const pct = Math.max(0, Math.min(100, Math.round(Number(this.energy || 0))));
    const dl = Math.max(0, Math.round(Number(this.duelLives ?? 6)));
    if (valEl) valEl.textContent = `${pct}%`;
    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      fillEl.classList.toggle('is-low', pct <= 20);
    }
    if (livesEl) livesEl.textContent = String(dl);
    if (livesPill) livesPill.classList.toggle('is-low', dl <= 1);
    const closedLeft = Math.max(0, (this.barrelCount || 10) - (this.openedIndices?.length || 0));
    const curRound = Math.min(this.maxDuelRounds || 3, (this.duelRoundsWithoutTicket || 0) + 1);
    if (statusEl) {
      statusEl.textContent = `🎟 РАУНД ${curRound}/${this.maxDuelRounds || 3} · ЗАКРЫТО ${closedLeft}/${this.barrelCount || 10}`;
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
    // Если 3 раунда подряд не нашёл билет — возвращаемся в цех на уровни (искать пацана и набивать ⭐)!
    if (this.duelRoundsWithoutTicket >= (this.maxDuelRounds || 3)) {
      this.duelRoundsWithoutTicket = 0;
      document.getElementById('duel-result-box')?.setAttribute('hidden', '');
      if (this.onReturnToLevels) {
        this.onReturnToLevels();
      } else {
        this.leaveRoom(true);
      }
      return;
    }
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
    const closedLeft = Math.max(0, (this.barrelCount || 10) - (this.openedIndices?.length || 0));
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

    if (this.openedIndices.includes(barrelIndex) || this.scene.barrels?.[barrelIndex]?.struck) {
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

    const existing = this.claims[barrelIndex];
    if (existing && existing.uid !== this.myUid) {
      Haptics.error();
      const bCode = BARREL_BATCH_CODES[barrelIndex] || String(barrelIndex + 1);
      this.onToast?.(`⚔️ Вы ударили в одну бочку №${bCode}! ${existing.name} успел чуть раньше — бей по другой закрытой!`);
      return true;
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
      this.scene.triggerEmptyBarrelOpen(bIdx);
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
      this.audio.playMiniScreamer(0);
      this.scene.triggerScreamerShake(0.45);
    }
    if (anyPoints) {
      this.audio.playLidBlowOff(Boolean(myEntry && myEntry.loot.value > 0));
    }

    // v12.5: Жёсткий баланс Дуэли:
    // - 🎟 БИЛЕТ -> Победа в партии!
    // - ❤️ +1 ЖИЗНЬ -> +1 дуэльная жизнь (максимум 6 ❤️, больше не раздувается!)
    // - ⭐ БАЛЛЫ -> баллы летят прямо в шкалу Супер-приза!
    // - 💨 ПУСТО -> −1 ❤️ · ☠️ СКРИМЕР -> −2 ❤️ (жизни реально быстро тают при ошибках!)
    if (myEntry) {
      const k = myEntry.loot.kind;
      if (k === 'ticket' || k === 'points') {
        this.onFlyRating?.({
          count: k === 'ticket' ? 4 : 3,
          label: myEntry.loot.label,
          barrelIndex: myEntry.barrelIndex,
        });
        if (k === 'points') {
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
    const oppName = detail.oppEntry?.claim?.name || 'Мастер Цеха [БОТ]';
    const oppLoot = detail.oppEntry?.loot || { kind: 'empty', value: 0, label: '💨 ПУСТО' };
    const iFoundTicket = Boolean(ticketWinner && ticketWinner.uid === this.myUid);
    const oppFoundTicket = Boolean(ticketWinner && ticketWinner.uid !== this.myUid);
    const closedLeft = Math.max(0, (this.barrelCount || 10) - (this.openedIndices?.length || 0));

    const serverTicketGranted = Boolean(detail.serverTicketGranted);
    // Начисляем ⭐ очки в рейтинг за найденный билет или бочку с баллами
    const myPointsEarned = myLoot.kind === 'points' ? myLoot.value : iFoundTicket ? 500 : 0;
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

    const outOfRounds = !iFoundTicket && this.duelRoundsWithoutTicket >= (this.maxDuelRounds || 3);
    // v13.0: К Тилю — СТРОГО ТОЛЬКО при 0 ❤️ жизней!
    const needTilRefill = !iFoundTicket && !outOfRounds && this.duelLives <= 0;

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
        ? '⏭ ЭНЕРГИЯ СЭКОНОМЛЕНА — БИЛЕТ ЕЩЁ В ЦЕХУ!'
        : myLoot.kind === 'life'
          ? '❤️ +1 ЖИЗНЬ ИЗ БОЧКИ! ИЩЕМ 🎟 БИЛЕТ ДАЛЬШЕ!'
          : myLoot.kind === 'points'
            ? `⭐ ${myLoot.label} В РЕЙТИНГ! БИЛЕТ ЕЩЁ НЕ НАЙДЕН!`
            : `💨 МИМО (−1 ❤️)! БИЛЕТ ЕЩЁ В ОСТАВШИХСЯ БОЧКАХ!`;
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
      if (outOfRounds) {
        rematchBtn.textContent = '▶ НА УРОВНИ ЦЕХА — ИСКАТЬ ПАЦАНА И НАБИВАТЬ ⭐';
      } else if (needTilRefill) {
        rematchBtn.textContent = '🌊 НА НЕБО К ТИЛЮ — ЗАБРАТЬ 6 ❤️ И ⚡ 100%';
      } else if (!this.batchResolved && closedLeft >= 2) {
        rematchBtn.textContent = `🔨 БИТЬ ДАЛЬШЕ (ИЩЕМ 🎟 БИЛЕТ · ${closedLeft} БОЧЕК · ❤️ ${this.duelLives} · ⚡ ${this.energy}%)`;
      } else {
        const nextR = Math.min(this.maxDuelRounds || 3, (this.duelRoundsWithoutTicket || 0) + 1);
        rematchBtn.textContent = `🔄 НОВАЯ ПАРТИЯ ЗА БИЛЕТОМ (РАУНД ${nextR}/${this.maxDuelRounds || 3} · ❤️ ${this.duelLives})`;
      }
      rematchBtn.removeAttribute('hidden');
    }
    if (inviteLivesBtn) {
      inviteLivesBtn.textContent = '🛢 ЗАКАТАТЬ НОВОГО ДРУГА (+3 ❤️ · +20% К ШКАЛЕ)';
      inviteLivesBtn.removeAttribute('hidden');
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
      const shortName = claim.uid === this.myUid ? 'ТЫ' : (claim.name || '').slice(0, 12);
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
