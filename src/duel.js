import { isTestBogSessionActive, Haptics } from './telegram.js';
import { BARREL_BATCH_CODES } from './scene.js';
import {
  getActiveRealtimeClient,
  getViewerUid,
  buildDuelShareLinks,
  startDuelAnte,
  settleDuelRound,
} from './backend.js';

/**
 * Контроллер синхронного мультиплеера на 2–3 игроков «НА СЧЁТ ТРИ!» (Supabase Realtime Presence + Broadcast)
 * и режима «👀 Подглядывать за игрой» (`watch_<barrelId>`).
 * Все промежуточные клики, таймеры и «Погреметь цепями» идут строго через WebSocket в оперативной памяти (0 записей в БД).
 */
export class WorkshopDuelController {
  constructor({ scene, audio, getTgUser, onProfileSync, onToast, onOpenInviteShare, onOpenGoldenFork, onExitToHub }) {
    this.scene = scene;
    this.audio = audio;
    this.getTgUser = getTgUser;
    this.onProfileSync = onProfileSync;
    this.onToast = onToast;
    this.onOpenInviteShare = onOpenInviteShare;
    this.onOpenGoldenFork = onOpenGoldenFork;
    this.onExitToHub = onExitToHub;

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
    this.claims = {}; // { [barrelIndex]: { uid, name, avatar, ts } }
    this.claimTimeLeft = 3.0;

    this.claimInterval = null;
    this.rafId = null;
    this.timeouts = [];
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
    this.claims = {};
    this.spectatorUids = [];

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
      barrelCount: 6,
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
    document.getElementById('duel-overlay')?.setAttribute('hidden', '');
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

    ch.on('broadcast', { event: 'duel_reveal' }, ({ payload }) => {
      if (!this.active || !payload) return;
      this.executeReveal(payload);
    });

    ch.on('broadcast', { event: 'chain_rattle' }, ({ payload }) => {
      if (!this.active || !payload) return;
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
          '🔥 <strong>БАНК НА ТРОИХ: 3 ❤️</strong> + БОНУС ЦЕХА: <strong>+450 ⭐ ОЧКОВ · +0.25 ШКАЛЫ · 28% ЗОЛОТАЯ БОЧКА 🎟</strong>';
        potEl.classList.add('is-triple-bonus');
      } else {
        potEl.innerHTML =
          '⚔️ <strong>БАНК ДУЭЛИ: 2 ❤️</strong> (ставки по 1 ❤️ · Победитель забирает всё + 200 ⭐ в ТОП-10)';
        potEl.classList.remove('is-triple-bonus');
      }
    }

    if (invite3Btn) {
      if (count < 3 && (this.phase === 'lobby' || this.phase === 'finished')) {
        invite3Btn.removeAttribute('hidden');
        invite3Btn.textContent =
          count === 1
            ? '📲 ПОЗВАТЬ ДРУГА ЗА СТОЛ «НА СЧЁТ ТРИ!»'
            : '➕ ПОЗВАТЬ 3-ГО КЕНТА (ЦЕХ ДОБАВИТ +450 ⭐ И ЗОЛОТУЮ БОЧКУ!)';
      } else {
        invite3Btn.setAttribute('hidden', '');
      }
    }

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

    if (startBtn) {
      if (this.phase !== 'lobby') {
        startBtn.setAttribute('hidden', '');
      } else {
        startBtn.removeAttribute('hidden');
        if (count < 2) {
          startBtn.disabled = true;
          startBtn.textContent = '⏳ ОЖИДАНИЕ 2-ГО ИГРОКА В КОМНАТЕ...';
        } else if (!this.isHost()) {
          startBtn.disabled = false;
          startBtn.textContent = `🔥 НА СЧЁТ ТРИ! СТАРТ (${count} ИГРОКА · СТАВКА 1 ❤️)`;
        } else {
          startBtn.disabled = false;
          startBtn.textContent = `🔥 НА СЧЁТ ТРИ! СТАРТ (${count} ИГРОКА · СТАВКА 1 ❤️)`;
        }
      }
    }
  }

  /**
   * Запуск раунда (первичный с анте 1 ❤️ либо бесплатная перезарядка / Суперфинал 1х1 на 2 бочках)
   */
  async hostInitiateRound({ isFreeRerack = false, suddenDeathContenders = null } = {}) {
    if (this.players.length < 2) {
      this.onToast?.('Позови хотя бы одного друга за стол (или добавь бота в Тест-Боге)!');
      return;
    }

    const contenders = suddenDeathContenders || this.players.map((p) => p.uid);
    const barrelCount = contenders.length === 2 && suddenDeathContenders ? 2 : 6;
    const safeCount = barrelCount === 2 ? 1 : 3;

    const indices = Array.from({ length: barrelCount }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const safeIndices = indices.slice(0, safeCount);
    const roundKey = isFreeRerack && this.roundKey ? this.roundKey : `rk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const payload = {
      roundKey,
      isFreeRerack: Boolean(isFreeRerack),
      isSuddenDeath: Boolean(suddenDeathContenders),
      contenderUids: contenders,
      spectatorUids: this.players.map((p) => p.uid).filter((u) => !contenders.includes(u)),
      barrelCount,
      safeIndices,
    };

    this.broadcast('duel_start', payload);
    await this.receiveRoundStart(payload);
  }

  async receiveRoundStart(payload) {
    this.clearAllTimers();
    this.clearBarrelClaimBadges();

    this.roundKey = payload.roundKey;
    this.contenderUids = payload.contenderUids || this.players.map((p) => p.uid);
    this.spectatorUids = payload.spectatorUids || [];
    this.barrelCount = payload.barrelCount || 6;
    this.safeIndices = payload.safeIndices || [0, 2, 4];
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
        this.phase = 'finished';
        this.showNoLivesPrompt();
        return;
      }
      this.antePaidForRound = this.roundKey;
      this.onProfileSync?.({ lives: ante.lives, premierePoints: ante.premierePoints });
    }

    this.renderLobbyUI();

    // Готовим 3D сцену (6 бочек в 1-м туре, либо 2 бочки в Суперфинале 1 на 1!)
    this.scene.resetRound({
      barrelCount: this.barrelCount,
      targetIndex: this.safeIndices[0] ?? 0,
      golden: this.players.length >= 3,
    });
    this.scene.setInteractive(false);

    // Обратный отсчёт: РАЗ... ДВА... ТРИ — БЕЙ!
    this.phase = 'countdown';
    const banner = document.getElementById('duel-countdown-banner');
    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');
    banner?.removeAttribute('hidden');

    if (bannerSub) {
      bannerSub.textContent = payload.isSuddenDeath
        ? '⚡ СУПЕРФИНАЛ 1 НА 1: ДВЕ БОЧКИ — ВЫЖИВЕТ ОДИН!'
        : payload.isFreeRerack
          ? '🔄 НИЧЬЯ! БЕСПЛАТНАЯ ПЕРЕЗАРЯДКА ЦЕХА!'
          : 'ПРИГОТОВЬСЯ ХВАТАТЬ СВОЮ БОЧКУ!';
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

  beginClaimWindow() {
    this.phase = 'claim';
    this.claimTimeLeft = 3.0;
    const amISpectator = this.spectatorUids.includes(this.myUid);

    if (!amISpectator) {
      this.scene.setInteractive(true);
    }

    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');

    // Если за столом есть песочные боты (/testbog/) — они захватывают свободные бочки через 0.5..1.7с
    this.players
      .filter((p) => p.isBot && this.contenderUids.includes(p.uid))
      .forEach((bot, idx) => {
        const delay = 520 + idx * 420 + Math.round(Math.random() * 650);
        this.scheduleTimeout(() => {
          if (!this.active || this.phase !== 'claim') return;
          const free = [];
          for (let b = 0; b < this.barrelCount; b++) {
            if (!this.claims[b]) free.push(b);
          }
          if (!free.length) return;
          const pick = free[Math.floor(Math.random() * free.length)];
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
          : myLocked
            ? '✓ Твоя бочка захвачена! Ждём вскрытия...'
            : 'Успей кликнуть по свободной бочке!';
      }

      const claimedCount = new Set(Object.values(this.claims).map((c) => c.uid)).size;
      if (claimedCount >= this.contenderUids.length || this.claimTimeLeft <= 0) {
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

    // Если я уже захватил бочку в этом раунде — игнорируем повторный клик
    const alreadyMine = Object.entries(this.claims).find(([, c]) => c.uid === this.myUid);
    if (alreadyMine) return true;

    const existing = this.claims[barrelIndex];
    if (existing && existing.uid !== this.myUid) {
      Haptics.error();
      this.onToast?.(`⛔ Занято (${existing.name})! Быстрее бей соседнюю бочку!`);
      return true;
    }

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
    return true;
  }

  applyBarrelClaim(claim, shouldBroadcast = false) {
    const idx = Number(claim.barrelIndex);
    if (idx < 0 || idx >= this.barrelCount) return;

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

    // Если кто-то замешкался за 3.0 сек — назначаем ему свободную бочку автоматически
    for (const uid of this.contenderUids) {
      const hasClaim = Object.values(this.claims).some((c) => c.uid === uid);
      if (!hasClaim) {
        for (let b = 0; b < this.barrelCount; b++) {
          if (!this.claims[b]) {
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
      contenderUids: this.contenderUids,
    };

    this.broadcast('duel_reveal', revealPayload);
    this.executeReveal(revealPayload);
  }

  async executeReveal(payload) {
    if (this.phase === 'reveal') return;
    this.phase = 'reveal';
    this.clearAllTimers();
    this.scene.setInteractive(false);

    this.claims = payload.claims || this.claims;
    this.safeIndices = payload.safeIndices || this.safeIndices;
    this.renderBarrelClaimBadges();

    const bannerText = document.getElementById('duel-countdown-text');
    const bannerSub = document.getElementById('duel-countdown-sub');
    if (bannerText) bannerText.textContent = 'ВСКРЫТИЕ БОЧЕК!';

    const survivors = [];
    const eliminated = [];

    for (const [bStr, claim] of Object.entries(this.claims)) {
      const bIdx = Number(bStr);
      const isSafe = this.safeIndices.includes(bIdx);
      this.scene.triggerEmptyBarrelOpen(bIdx);
      if (isSafe) {
        survivors.push(claim);
      } else {
        eliminated.push(claim);
      }
    }

    const myClaimEntry = Object.entries(this.claims).find(([, c]) => c.uid === this.myUid);
    const iSurvived = myClaimEntry ? this.safeIndices.includes(Number(myClaimEntry[0])) : false;

    if (eliminated.length > 0) {
      this.audio.playMiniScreamer(0);
      this.scene.triggerScreamerShake(0.45);
    }
    if (survivors.length > 0) {
      this.audio.playLidBlowOff(iSurvived);
    }

    // Подсвечиваем бейджи над бочками (зелёный = выжил, красный = скример)
    this.renderBarrelClaimBadges(true);

    // СЦЕНАРИЙ 1: ЧИСТЫЙ ПОБЕДИТЕЛЬ (остался ровно 1 выживший!)
    if (survivors.length === 1) {
      const winner = survivors[0];
      if (bannerSub) bannerSub.textContent = `🏆 ВЫЖИЛ ТОЛЬКО ${winner.name.toUpperCase()}!`;

      const settleRes = await settleDuelRound({
        roomId: this.roomId,
        roundKey: this.roundKey,
        winnerUid: winner.uid,
        playerUids: this.players.map((p) => p.uid),
        tgUser: this.getTgUser?.(),
      });

      this.scheduleTimeout(() => {
        if (!this.active) return;
        this.phase = 'finished';
        this.spectatorUids = [];
        document.getElementById('duel-countdown-banner')?.setAttribute('hidden', '');
        document.getElementById('duel-spectator-bar')?.setAttribute('hidden', '');
        this.showRoundResultCard(winner, settleRes);
      }, 1500);
      return;
    }

    // СЦЕНАРИЙ 2: СУПЕРФИНАЛ (из 3 игроков выжили двое — 3-й уходит в зрители с цепями, а 2 бьются на 2 бочках!)
    if (survivors.length === 2 && this.contenderUids.length === 3) {
      const outPlayer = eliminated[0];
      if (bannerText) bannerText.textContent = 'СУПЕРФИНАЛ 1 НА 1!';
      if (bannerSub) {
        bannerSub.textContent = `${outPlayer?.name || '3-й игрок'} в нокауте! Две бочки для двоих финалистов!`;
      }
      this.scheduleTimeout(() => {
        if (!this.active || !this.isHost()) return;
        this.hostInitiateRound({
          isFreeRerack: true,
          suddenDeathContenders: survivors.map((s) => s.uid),
        });
      }, 1900);
      return;
    }

    // СЦЕНАРИЙ 3: НИЧЬЯ (все промахнулись ИЛИ все выжили) -> мгновенная бесплатная перезарядка!
    if (bannerText) bannerText.textContent = '⚡ НИЧЬЯ!';
    if (bannerSub) bannerSub.textContent = 'Перезарядка цеха без списания жизней — ещё раз на счёт три!';
    this.scheduleTimeout(() => {
      if (!this.active || !this.isHost()) return;
      this.hostInitiateRound({
        isFreeRerack: true,
        suddenDeathContenders: this.contenderUids.length === 2 && this.players.length === 3 ? this.contenderUids : null,
      });
    }, 1750);
  }

  showRoundResultCard(winner, settleRes) {
    const box = document.getElementById('duel-result-box');
    const titleEl = document.getElementById('duel-result-title');
    const subEl = document.getElementById('duel-result-sub');
    const rematchBtn = document.getElementById('btn-duel-rematch');
    const inviteLivesBtn = document.getElementById('btn-duel-invite-lives');

    box?.removeAttribute('hidden');
    const iWon = winner.uid === this.myUid;

    if (iWon) {
      Haptics.success();
      this.onProfileSync?.({
        lives: settleRes.winnerLives,
        premiereScore: settleRes.winnerScore,
        premierePoints: settleRes.winnerPoints,
        hasPendingTicket: settleRes.hasPendingTicket,
      });
    } else {
      Haptics.error();
    }

    if (titleEl) {
      titleEl.textContent = iWon
        ? `🏆 ТЫ ЗАБРАЛ ВЕСЬ БАНК: +${settleRes.potLives} ❤️ И +${settleRes.pointsBonus} ⭐!`
        : `💥 ПОБЕДИЛ ${winner.name.toUpperCase()} (ЗАБРАЛ БАНК ${settleRes.potLives} ❤️)`;
    }

    if (subEl) {
      if (iWon && settleRes.goldenTicketDropped) {
        subEl.textContent =
          '🎟 БОНУС ОТ СТОЛА НА ТРОИХ: ТЕБЕ ВЫПАЛА ЗОЛОТАЯ БОЧКА С ПОДАРОЧНЫМ БИЛЕТОМ В КИНО!';
      } else if (this.players.length >= 3) {
        subEl.textContent = iWon
          ? `Бонус стола на троих начислен: +${settleRes.scoreBonus} к шкале Премьеры и +${settleRes.pointsBonus} ⭐ в рейтинг ТОП-10!`
          : 'Все игроки снова в строю! Бери реванш на счёт три — втроём банк выше!';
      } else {
        subEl.textContent =
          'Позови 3-го друга перед реваншем — цех досыплет +450 ⭐ очков ТОП-10 и шанс Золотой бочки с билетом!';
      }
    }

    if (rematchBtn) rematchBtn.removeAttribute('hidden');
    if (inviteLivesBtn) inviteLivesBtn.removeAttribute('hidden');
    this.renderLobbyUI();

    if (iWon && settleRes.goldenTicketDropped) {
      this.scheduleTimeout(() => {
        this.onOpenGoldenFork?.();
      }, 1100);
    }
  }

  showNoLivesPrompt() {
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
      const isSafe = this.safeIndices.includes(idx);
      const stateCls = revealed ? (isSafe ? 'is-safe' : 'is-dead') : 'is-locked';
      badge.className = `duel-barrel-badge ${stateCls}`;
      badge.dataset.barrelIndex = String(idx);

      const initials = (claim.name || '?').trim().slice(0, 2).toUpperCase();
      const ava = claim.avatar
        ? `<img src="${escapeAttr(claim.avatar)}" alt="" />`
        : `<span>${escapeHtml(initials)}</span>`;
      badge.innerHTML = `
        <div class="duel-badge-ava">${ava}</div>
        <small>${escapeHtml((claim.name || '').slice(0, 12))}</small>
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
