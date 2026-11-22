// ============================================================================
// БОЧКА v18.0: ЕДИНЫЙ ДВИЖОК «НА РАЗ-ДВА-ТРИ!» ПРОТИВ ТИЛЯ (УР. 1–5)
// Восстанавливает душу архива v15.5 в упрощённом виде:
// - 4 / 6 / 8 / 12 / 16 ОДИНАКОВЫХ ЗАКРЫТЫХ 3D-БОЧЕК (0 зелёных подсветок и 0 пинов!)
// - Ритм «РАЗ… ДВА… ТРИ — БЕЙ!»: на «ТРИ!» бьёшь ЛЮБУЮ закрытую бочку вслепую,
//   и Тиль Швайгер бьёт другую закрытую бочку — кто первый найдёт цель!
// - Ур. 1 (4 бочки): ищешь друга/себя быстрее Тиля → фото + скример → закатываешь друга;
//   если проиграл → смотришь трейлер VK (+3 ❤️) и добиваешь!
// - Ур. 2–5 (6 / 8 / 12 / 16 бочек): целевые награды v15.5 (пустая бочка, части билета
//   2/4 → 3/4 → 4/4, ⭐ очки в Супер-приз, редкие карточки) + реальные скримеры (−1 ❤️).
// - Если жизни кончились (0 ❤️): 1-й раз → закатай ещё друга (+3 ❤️), повторный слив
//   всех жизней Тилю → перенос на сцену у моря «Достучись до небес»!
// Без innerHTML (строго createElement + textContent).
// ============================================================================
import { audio } from './audio.js';
import { Haptics } from './telegram.js';
import { showDuolingoCard } from './v16_ux.js';

function el(tag, className = '', text = '') {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== '') n.textContent = String(text);
  return n;
}

export class Til3DBarrelDuel {
  constructor({
    hostEl,
    getScene,
    onVictory,
    onL1TrailerRescue,
    onRecoverFriend,
    onGoOcean,
    onBonusPoints,
    onScreamerHit,
    onScreamerLoss,
    onExit,
  } = {}) {
    this.hostEl = hostEl;
    this.getScene = getScene;
    this.onVictory = onVictory;
    this.onL1TrailerRescue = onL1TrailerRescue;
    this.onRecoverFriend = onRecoverFriend;
    this.onGoOcean = onGoOcean;
    this.onBonusPoints = onBonusPoints;
    this.onScreamerHit = onScreamerHit || onScreamerLoss;
    this.onScreamerLoss = onScreamerLoss || onScreamerHit;
    this.onExit = onExit;

    this.isActive = false;
    this.phase = 'idle'; // 'idle' | 'countdown' | 'go' | 'between' | 'paused_trailer' | 'done'
    this.level = 1;
    this.barrelCount = 4;
    this.maxLives = 3;
    this.lives = 3;
    this.targetIndex = -1;
    this.screamerSet = new Set();
    this.pointsSet = new Set();
    this.openedSet = new Set();
    this.beatIndex = 0;
    this.tilMoves = 0;
    this.playerMoves = 0;
    this.playerActedThisBeat = false;
    this.l1TrailerUsed = false;
    this.defeatsCount = 0; // 1-й слив на Ур.2-5 -> закатай друга; 2-й+ слив -> море «Достучись до небес»!
    this.packMeta = null;
    this._timers = [];
    this._dom = null;
    this._clickLockUntil = 0;

    this._buildUI();
  }

  _buildUI() {
    if (!this.hostEl) return;
    this.hostEl.textContent = '';

    const wrap = el('div', 'til3d-hud');
    wrap.id = 'til3d-hud-root';

    const topCard = el('div', 'til3d-score-card');

    const stepBadge = el('div', 'til3d-step-badge', 'УР. 1 · 4 БОЧКИ · НА РАЗ-ДВА-ТРИ!');
    stepBadge.id = 'til3d-step-badge';
    topCard.appendChild(stepBadge);

    const scoreRow = el('div', 'til3d-score-row');

    const mySide = el('div', 'til3d-side is-me');
    const myLbl = el('span', 'til3d-side-lbl', 'ЖИЗНИ');
    const myVal = el('strong', 'til3d-side-val', '❤️❤️❤️');
    myVal.id = 'til3d-my-lives';
    mySide.append(myLbl, myVal);

    const midInfo = el('span', 'til3d-vs', '🛢 4');
    midInfo.id = 'til3d-barrels-left';

    const tilSide = el('div', 'til3d-side is-til');
    const tilVal = el('strong', 'til3d-side-val', '0');
    tilVal.id = 'til3d-til-opened';
    const tilLbl = el('span', 'til3d-side-lbl', 'ТИЛЬ');
    tilSide.append(tilVal, tilLbl);

    scoreRow.append(mySide, midInfo, tilSide);
    topCard.appendChild(scoreRow);

    const speechRow = el('div', 'til3d-speech-row');
    const ava = document.createElement('img');
    ava.className = 'til3d-ava';
    ava.src = './public/sprites/til_avatar.webp';
    ava.alt = 'Тиль Швайгер';
    const bubble = el('div', 'til3d-bubble', 'На раз-два-три бьём бочки вслепую — кто первый найдёт друга!');
    bubble.id = 'til3d-bubble';
    speechRow.append(ava, bubble);
    topCard.appendChild(speechRow);

    wrap.appendChild(topCard);

    const banner = el('div', 'til3d-signal is-wait', 'РАЗ…');
    banner.id = 'til3d-signal';
    wrap.appendChild(banner);

    const hint = el('div', 'til3d-bottom-hint', 'На «ТРИ — БЕЙ!» нажми на любую закрытую бочку быстрее Тиля');
    hint.id = 'til3d-bottom-hint';
    wrap.appendChild(hint);

    this.hostEl.appendChild(wrap);
    this._dom = { wrap, stepBadge, myVal, midInfo, tilVal, bubble, banner, hint };
  }

  _setTimer(fn, ms) {
    const id = window.setTimeout(() => {
      this._timers = this._timers.filter((t) => t !== id);
      fn();
    }, ms);
    this._timers.push(id);
    return id;
  }

  _clearTimers() {
    this._timers.forEach((id) => window.clearTimeout(id));
    this._timers = [];
  }

  _getClosedBarrels() {
    const out = [];
    for (let i = 0; i < this.barrelCount; i += 1) {
      if (!this.openedSet.has(i)) out.push(i);
    }
    return out;
  }

  _syncUI() {
    if (!this._dom) return;
    const hearts = '❤️'.repeat(Math.max(0, this.lives)) + '🖤'.repeat(Math.max(0, this.maxLives - this.lives));
    this._dom.myVal.textContent = hearts;
    const left = this._getClosedBarrels().length;
    this._dom.midInfo.textContent = `🛢 ${left}`;
    this._dom.tilVal.textContent = String(this.tilMoves);
  }

  _setSignal(stateCls, bannerText, bubbleText = '') {
    if (!this._dom) return;
    this._dom.banner.className = `til3d-signal is-${stateCls}`;
    this._dom.banner.textContent = bannerText;
    if (bubbleText) {
      this._dom.bubble.textContent = bubbleText;
    }
  }

  _setupHiddenBarrels() {
    const n = this.barrelCount;
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    this.targetIndex = indices[0];
    this.screamerSet.clear();
    this.pointsSet.clear();

    const trapCount = n >= 16 ? 5 : n >= 12 ? 4 : n >= 8 ? 3 : n >= 6 ? 2 : 1;
    let cursor = 1;
    for (let k = 0; k < trapCount && cursor < indices.length; k += 1, cursor += 1) {
      this.screamerSet.add(indices[cursor]);
    }
    // На целевых уровнях (Ур.3–5) прячем бонусные ⭐ очки в 1–2 закрытые бочки (как в v15.5!)
    const bonusCount = this.level >= 4 ? 2 : this.level >= 3 ? 1 : 0;
    for (let k = 0; k < bonusCount && cursor < indices.length; k += 1, cursor += 1) {
      this.pointsSet.add(indices[cursor]);
    }
  }

  start({
    level = 1,
    barrelCount = 4,
    titleBadge = '',
    introLine = '',
    portraitUrl = '',
    packMeta = null,
    resetDefeats = false,
  } = {}) {
    this.stop();
    this.isActive = true;
    this.level = Math.max(1, Number(level) || 1);
    this.barrelCount = Math.max(4, Math.min(16, Number(barrelCount) || 4));
    this.maxLives = 3;
    this.lives = 3;
    this.beatIndex = 0;
    this.tilMoves = 0;
    this.playerMoves = 0;
    this.playerActedThisBeat = false;
    this.l1TrailerUsed = false;
    this.packMeta = packMeta || null;
    if (resetDefeats) this.defeatsCount = 0;
    this.openedSet.clear();
    this._setupHiddenBarrels();
    this.phase = 'between';
    this._clickLockUntil = 0;

    const scene = this.getScene?.();
    if (scene) {
      const sprite = portraitUrl
        || (this.level === 1
          ? './public/sprites/hero_boy_live.webp'
          : this.level === 2
            ? './public/sprites/empty_barrel_hearts.webp'
            : './public/sprites/cinema_ticket_barrel.webp');
      scene.resetRound({
        targetIndex: this.targetIndex,
        portraitUrl: sprite,
        golden: this.level >= 3,
        barrelCount: this.barrelCount,
      });
      // СТРОГО 0 ЗЕЛЁНЫХ ПОДСВЕТОК! Все бочки одинаковые!
      scene.setTilBarrelCue?.(-1, 'off');
      scene.setWorkshopLevelDecor?.(Math.min(5, this.level), 'til_duel');
      scene.setInteractive(true);
    }

    const trapCount = this.screamerSet.size;
    if (this._dom?.stepBadge) {
      this._dom.stepBadge.textContent = titleBadge
        || (this.level === 1
          ? 'УР. 1 · 4 БОЧКИ · НАЙДИ ДРУГА БЫСТРЕЕ ТИЛЯ!'
          : `УР. ${this.level} · ${this.barrelCount} БОЧЕК · ${trapCount} СКРИМЕРА`);
    }
    if (this._dom?.hint) {
      this._dom.hint.textContent = this.level === 1
        ? 'На «ТРИ — БЕЙ!» выбери любую закрытую бочку вслепую — найди друга быстрее Тиля!'
        : `На «ТРИ — БЕЙ!» бей любую закрытую бочку (${trapCount} скримеров). Найди награду раньше Тиля!`;
    }
    if (this.hostEl) this.hostEl.removeAttribute('hidden');
    this._syncUI();
    this._setSignal(
      'wait',
      'ПРИГОТОВЬСЯ…',
      introLine || (this.level === 1
        ? 'На раз-два-три бьём бочки вслепую! Кто первый найдёт друга!'
        : `В цеху ${this.barrelCount} закрытых бочек. На раз-два-три — кто быстрее найдёт приз!`)
    );

    this._setTimer(() => this._startNextBeat(), 520);
  }

  resumeAfterTrailer() {
    if (!this.isActive) return;
    this.l1TrailerUsed = true;
    this.lives = 3;
    this.phase = 'between';
    this.playerActedThisBeat = false;
    const closed = this._getClosedBarrels();
    // Если цель уже была вскрыта Тилем — перепрятываем в оставшуюся закрытую бочку (или ставим свежую партию)
    if (closed.length === 0) {
      this.openedSet.clear();
      this._setupHiddenBarrels();
      const scene = this.getScene?.();
      scene?.resetRound?.({
        targetIndex: this.targetIndex,
        portraitUrl: this.packMeta?.portraitUrl || './public/sprites/hero_boy_live.webp',
        golden: false,
        barrelCount: this.barrelCount,
      });
    } else if (this.openedSet.has(this.targetIndex)) {
      this.targetIndex = closed[Math.floor(Math.random() * closed.length)];
    }
    const scene = this.getScene?.();
    scene?.setTilBarrelCue?.(-1, 'off');
    scene?.setInteractive?.(true);
    this._syncUI();
    this._setSignal('wait', '+3 ❤️ ПОЛУЧЕНО! РАЗ…', 'Второй шанс! На раз-два-три вскрой закрытую бочку!');
    this._setTimer(() => this._startNextBeat(), 450);
  }

  stop() {
    this.isActive = false;
    this.phase = 'idle';
    this.targetIndex = -1;
    this._clearTimers();
    const scene = this.getScene?.();
    scene?.setTilBarrelCue?.(-1, 'off');
    if (this.hostEl) this.hostEl.setAttribute('hidden', '');
  }

  _startNextBeat() {
    if (!this.isActive || this.phase === 'done' || this.phase === 'paused_trailer') return;
    this._clearTimers();

    const closed = this._getClosedBarrels();
    if (closed.length === 0) {
      // Все бочки вскрыты — ставим свежую закрытую партию!
      this.openedSet.clear();
      this._setupHiddenBarrels();
      const scene = this.getScene?.();
      scene?.resetRound?.({
        targetIndex: this.targetIndex,
        portraitUrl: this.level === 1
          ? (this.packMeta?.portraitUrl || './public/sprites/hero_boy_live.webp')
          : this.level === 2
            ? './public/sprites/empty_barrel_hearts.webp'
            : './public/sprites/cinema_ticket_barrel.webp',
        golden: this.level >= 3,
        barrelCount: this.barrelCount,
      });
      scene?.setTilBarrelCue?.(-1, 'off');
      scene?.setInteractive?.(true);
      this._syncUI();
    }

    this.beatIndex += 1;
    this.playerActedThisBeat = false;
    this.phase = 'countdown';
    const scene = this.getScene?.();
    scene?.setTilBarrelCue?.(-1, 'off');
    scene?.setInteractive?.(true);

    this._setSignal('wait', 'РАЗ…', 'Не бей раньше «ТРИ!» — выбирай бочку глазами!');
    audio.playTilCountTick(1);
    Haptics.light();

    this._setTimer(() => {
      if (!this.isActive || this.phase !== 'countdown') return;
      this._setSignal('wait', 'ДВА…', 'Приготовься бить любую закрытую бочку!');
      audio.playTilCountTick(2);
      Haptics.light();
    }, 520);

    this._setTimer(() => {
      if (!this.isActive || this.phase !== 'countdown') return;
      this.phase = 'go';
      this._setSignal('go', 'ТРИ — БЕЙ!', 'ДАВАЙ! Бей любую закрытую бочку быстрее меня!');
      audio.playTilGoSignal();
      Haptics.medium();

      // Если игрок замешкался (3.2 сек без удара) — Тиль делает свой ход первым!
      const timeoutMs = Math.max(2400, 3300 - (this.level - 1) * 140);
      this._setTimer(() => {
        if (!this.isActive || this.phase !== 'go' || this.playerActedThisBeat) return;
        this.phase = 'between';
        this._executeTilStrike('Ты замешкался — бью первым!');
      }, timeoutMs);
    }, 1040);
  }

  _executeTilStrike(prefixText = '') {
    if (!this.isActive || this.phase === 'done' || this.phase === 'paused_trailer') return;
    const closed = this._getClosedBarrels();
    if (closed.length === 0) {
      this._setTimer(() => this._startNextBeat(), 650);
      return;
    }

    const nonTarget = closed.filter((idx) => idx !== this.targetIndex);
    let pick = -1;

    // На 1–2 тактах Тиль нагнетает саспенс и бьёт нецелевые бочки; с 3-го такта (или когда осталась 1–2 бочки) Тиль реально может забрать цель первым!
    const canSteal = (this.beatIndex >= 3 && (closed.length <= 2 || Math.random() < 0.30)) || closed.length <= 1;
    if (canSteal && !this.openedSet.has(this.targetIndex)) {
      pick = this.targetIndex;
    } else if (nonTarget.length > 0) {
      pick = nonTarget[Math.floor(Math.random() * nonTarget.length)];
    } else {
      pick = closed[0];
    }

    this.openedSet.add(pick);
    this.tilMoves += 1;
    const scene = this.getScene?.();
    scene?.triggerStrikeFX?.(pick, null);
    scene?.triggerEmptyBarrelOpen?.(pick, 'smoke');
    audio.playStrike(pick);
    this._syncUI();

    if (pick === this.targetIndex) {
      audio.playTilCaught();
      Haptics.error();
      this._setSignal('caught', 'ТИЛЬ НАШЁЛ БОЧКУ ПЕРВЫМ!', 'Ха-ха! Я вскрыл её раньше тебя!');
      this._handleDefeat('til_faster');
      return;
    }

    const left = this._getClosedBarrels().length;
    const msg = prefixText
      ? `${prefixText} Пусто — осталось ${left}!`
      : `Тиль вскрыл бочку — пусто! Осталось ${left}. Следующий счёт!`;
    this._setSignal('wait', `ТИЛЬ: ПУСТО (ОСТАЛОСЬ ${left})`, msg);
    this._setTimer(() => this._startNextBeat(), 820);
  }

  handleBarrelClick(index, worldPoint = null) {
    if (!this.isActive) return;
    const now = performance.now();
    if (now < this._clickLockUntil) return;
    if (index < 0 || index >= this.barrelCount) return;
    if (this.openedSet.has(index)) return;

    // 1. Фальстарт — ударил ДО «ТРИ — БЕЙ!» -> пропускаешь этот такт, бьёт Тиль!
    if (this.phase === 'countdown') {
      this._clickLockUntil = now + 700;
      this._clearTimers();
      this.phase = 'between';
      const scene = this.getScene?.();
      scene?.triggerBarrelEerieFX?.(index, 'latch_rattle');
      audio.playTilFalseStart();
      Haptics.warning();
      this._setSignal('caught', '⚡ РАНО! ФАЛЬСТАРТ — ХОД ТИЛЯ!', 'Поторопился! Жди «ТРИ — БЕЙ!», сейчас вскрываю я!');
      this._setTimer(() => this._executeTilStrike('Фальстарт! Бью я!'), 650);
      return;
    }

    // 2. Окно удара «ТРИ — БЕЙ!» — честный слепой удар по выбранной закрытой бочке!
    if (this.phase !== 'go' || this.playerActedThisBeat) return;

    this.playerActedThisBeat = true;
    this._clickLockUntil = now + 400;
    this._clearTimers();
    this.phase = 'between';
    this.openedSet.add(index);
    this.playerMoves += 1;

    const scene = this.getScene?.();

    // 2A. НАШЁЛ ЦЕЛЕВУЮ БОЧКУ ПЕРВЫМ!
    if (index === this.targetIndex) {
      this.phase = 'done';
      scene?.setTilBarrelCue?.(-1, 'off');
      scene?.assignTargetBarrelNow?.(index);
      scene?.triggerStrikeFX?.(index, worldPoint);
      audio.playStrike(index);
      audio.playLidBlowOff?.(true);
      Haptics.heavy();
      this._syncUI();

      this._setSignal(
        'win',
        this.level === 1 ? '⚡ НАШЁЛ ДРУГА БЫСТРЕЕ ТИЛЯ!' : '⚡ ПРИЗ ТВОЙ! БЫСТРЕЕ ТИЛЯ!',
        this.level === 1 ? 'Вот он! Ты успел раньше меня!' : 'Чёрт, ты выбил награду первым!'
      );
      this._handleVictory(index);
      return;
    }

    // 2B. СКРИМЕР-ЛОВУШКА!
    if (this.screamerSet.has(index)) {
      this.lives = Math.max(0, this.lives - 1);
      scene?.triggerStrikeFX?.(index, worldPoint);
      scene?.triggerEmptyBarrelOpen?.(index, 'smoke');
      audio.playStrike(index);
      Haptics.error();
      this._syncUI();

      if (typeof this.onScreamerHit === 'function') {
        try { this.onScreamerHit(); } catch { /* ignore */ }
      }

      if (this.lives <= 0) {
        this._setSignal('caught', '😱 СКРИМЕРЫ ДОБИЛИ ТЕБЯ! (0 ❤️)', 'Жизни на нуле!');
        this._handleDefeat('screamers');
        return;
      }

      const left = this._getClosedBarrels().length;
      this._setSignal('caught', `😱 СКРИМЕР! −1 ❤️ (ОСТАЛОСЬ ${this.lives} ❤️)`, `Осторожнее! Осталось ${left} бочек — ход Тиля!`);
      this._setTimer(() => this._executeTilStrike('Скример тебя задел — теперь мой удар!'), 1350);
      return;
    }

    // 2C. БОНУСНЫЕ ⭐ ОЧКИ В СУПЕР-ПРИЗ!
    if (this.pointsSet.has(index)) {
      scene?.triggerStrikeFX?.(index, worldPoint);
      scene?.triggerEmptyBarrelOpen?.(index, 'sparks');
      audio.playStrike(index);
      audio.playTilBonus();
      Haptics.success();
      this._syncUI();
      if (typeof this.onBonusPoints === 'function') {
        try { this.onBonusPoints(100, index); } catch { /* ignore */ }
      }
      const left = this._getClosedBarrels().length;
      this._setSignal('win', `⭐ +100 В СУПЕР-ПРИЗ! (ОСТАЛОСЬ ${left})`, 'Неплохо, баллы забрал — но главную бочку ещё не нашёл!');
      this._setTimer(() => this._executeTilStrike('Мой удар!'), 680);
      return;
    }

    // 2D. ПУСТАЯ БОЧКА
    scene?.triggerStrikeFX?.(index, worldPoint);
    scene?.triggerEmptyBarrelOpen?.(index, 'sparks');
    audio.playStrike(index);
    Haptics.light();

    // На Ур.1 у игрока 3 удара (1 жизнь = 3 удара как в v15.5) — промах тратит 1 ❤️ из 3 попыток
    if (this.level === 1) {
      this.lives = Math.max(0, this.lives - 1);
      if (this.lives === 1 && typeof this.onScreamerHit === 'function') {
        try { this.onScreamerHit(); } catch { /* ignore */ }
      }
      this._syncUI();
      if (this.lives <= 0) {
        this._setSignal('caught', '😱 ПОПЫТКИ КОНЧИЛИСЬ!', 'Посмотри трейлер — заберёшь +3 ❤️ и вскроешь бочку!');
        this._handleDefeat('out_of_strikes');
        return;
      }
    } else {
      this._syncUI();
    }

    const left = this._getClosedBarrels().length;
    this._setSignal('wait', `ПУСТО! ХОД ТИЛЯ (ОСТАЛОСЬ ${left})`, 'Мимо! Теперь вскрываю я!');
    this._setTimer(() => this._executeTilStrike(''), 480);
  }

  _handleVictory(diveBarrelIndex) {
    this.phase = 'done';
    this._clearTimers();
    const scene = this.getScene?.();
    scene?.setInteractive?.(false);
    scene?.setTilBarrelCue?.(-1, 'off');
    Haptics.success();

    this._setTimer(() => {
      if (!this.isActive) return;
      const summary = {
        level: this.level,
        barrelCount: this.barrelCount,
        diveBarrelIndex,
        livesLeft: this.lives,
        playerMoves: this.playerMoves,
        tilMoves: this.tilMoves,
        packMeta: this.packMeta,
      };
      this.stop();
      if (typeof this.onVictory === 'function') {
        this.onVictory(summary);
      }
    }, 620);
  }

  _handleDefeat(reason = '') {
    this._clearTimers();
    const scene = this.getScene?.();
    scene?.setInteractive?.(false);
    scene?.setTilBarrelCue?.(-1, 'off');

    if (reason !== 'screamers' && typeof this.onScreamerLoss === 'function') {
      try { this.onScreamerLoss(); } catch { /* ignore */ }
    }

    // УРОВЕНЬ 1: проиграл (кончились удары или Тиль опередил) -> СМОТРИШЬ ТРЕЙЛЕР VK (+3 ❤️)!
    if (this.level === 1 && !this.l1TrailerUsed) {
      this.phase = 'paused_trailer';
      this._setTimer(() => {
        if (!this.isActive) return;
        showDuolingoCard({
          icon: '🎬',
          badge: reason === 'til_faster' ? 'ТИЛЬ НАШЁЛ ПЕРВЫМ' : 'ПОПЫТКИ КОНЧИЛИСЬ',
          title: 'Посмотри трейлер — забери +3 ❤️ и найди друга!',
          body: 'Официальный трейлер триллера «БОЧКА» (реж. Алексей Звонцов и Тиль Швайгер). После просмотра сразу вернёшься с +3 ❤️!',
          buttonText: '🎬 СМОТРЕТЬ ТРЕЙЛЕР (VK) → +3 ❤️',
          tone: 'gold',
          onConfirm: () => {
            if (typeof this.onL1TrailerRescue === 'function') {
              this.onL1TrailerRescue();
            }
          },
        });
      }, 1750);
      return;
    }

    // УРОВНИ 2–5: сгорели все жизни / Тиль победил!
    this.phase = 'done';
    this.defeatsCount += 1;
    const failedLevel = this.level;

    // Когда Тилю проиграл уже все жизни повторно (defeatsCount >= 2) -> ВЫКИДЫВАЕТ НА УРОВЕНЬ С МОРЕМ «ДОСТУЧИСЬ ДО НЕБЕС»!
    if (this.level >= 2 && this.defeatsCount >= 2 && typeof this.onGoOcean === 'function') {
      this.defeatsCount = 0; // сбрасываем, чтобы море оставалось редкой культовой сценой
      this._setTimer(() => {
        if (!this.isActive) return;
        this.stop();
        this.onGoOcean(failedLevel);
      }, 1650);
      return;
    }

    // 1-й слив жизней на Ур.2–5 -> точно как в архиве v15.5: отправляешь ещё другу за +3 ❤️ (или реванш)!
    this._setTimer(() => {
      if (!this.isActive) return;
      showDuolingoCard({
        icon: '🛢',
        badge: reason === 'til_faster' ? 'ТИЛЬ ОПЕРЕДИЛ' : 'ЖИЗНИ КОНЧИЛИСЬ (0 ❤️)',
        title: 'Закатай ещё друга в бочку — верни +3 ❤️!',
        body: 'Отправь бочку новому другу: сразу получишь +3 ❤️, ускоришь сбор билета 4/4 и наберёшь ⭐ в Супер-приз (Закрытый показ в Москве 17 декабря)!',
        buttonText: '🛢 ЗАКАТАТЬ ЕЩЁ ДРУГА (+3 ❤️)',
        secondaryText: '🔄 РЕВАНШ В ЦЕХУ',
        tone: 'gold',
        onConfirm: () => {
          this.stop();
          if (typeof this.onRecoverFriend === 'function') {
            this.onRecoverFriend(failedLevel);
          }
        },
        onSecondary: () => {
          this.start({
            level: failedLevel,
            barrelCount: this.barrelCount,
            titleBadge: this._dom?.stepBadge?.textContent || '',
          });
        },
      });
    }, 1750);
  }
}
