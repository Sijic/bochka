// ============================================================================
// БОЧКА v17.0: «ИГРАТЬ С ТИЛЕМ В УДАРЫ ПО ОТКРЫВАНИЮ 3D-БОЧЕК»
// Живая схватка на реакцию и скорость прямо в 3D-цеху (WorkshopScene):
// 4 стоящие 3D-бочки, отсчёт «На счёт три!», зелёная вспышка на целевой бочке,
// вылетающая крышка ломом, серия до 3 победных вскрытий против Тиля Швайгера.
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
  constructor({ hostEl, getScene, onVictory, onGoOcean, onExit, onScreamerLoss } = {}) {
    this.hostEl = hostEl;
    this.getScene = getScene;
    this.onVictory = onVictory;
    this.onGoOcean = onGoOcean;
    this.onExit = onExit;
    this.onScreamerLoss = onScreamerLoss;

    this.isActive = false;
    this.phase = 'idle'; // 'idle' | 'countdown' | 'go' | 'between' | 'done'
    this.level = 2;
    this.barrelCount = 6;
    this.targetWins = 3;
    this.myScore = 0;
    this.tilScore = 0;
    this.targetIndex = -1;
    this.openedSet = new Set();
    this._timers = [];
    this._raf = 0;
    this._dom = null;
    this._lastFalseStartAt = 0;
    this._goStartedAt = 0;
    this._roundIndex = 0;

    this._buildUI();
  }

  _buildUI() {
    if (!this.hostEl) return;
    this.hostEl.textContent = '';

    const wrap = el('div', 'til3d-hud');
    wrap.id = 'til3d-hud-root';

    // Верхняя строка: счёт ТЫ vs ТИЛЬ + шаг Duolingo
    const topCard = el('div', 'til3d-score-card');

    const stepBadge = el('div', 'til3d-step-badge', 'ШАГ 4 ИЗ 5 · СХВАТКА С ТИЛЕМ В 3D-БОЧКИ');
    stepBadge.id = 'til3d-step-badge';
    topCard.appendChild(stepBadge);

    const scoreRow = el('div', 'til3d-score-row');

    const mySide = el('div', 'til3d-side is-me');
    const myLbl = el('span', 'til3d-side-lbl', 'ТЫ');
    const myDots = el('div', 'til3d-dots');
    myDots.id = 'til3d-my-dots';
    const myVal = el('strong', 'til3d-side-val', '0');
    myVal.id = 'til3d-my-score';
    mySide.append(myLbl, myDots, myVal);

    const vs = el('span', 'til3d-vs', 'VS');

    const tilSide = el('div', 'til3d-side is-til');
    const tilVal = el('strong', 'til3d-side-val', '0');
    tilVal.id = 'til3d-til-score';
    const tilDots = el('div', 'til3d-dots');
    tilDots.id = 'til3d-til-dots';
    const tilLbl = el('span', 'til3d-side-lbl', 'ТИЛЬ');
    tilSide.append(tilVal, tilDots, tilLbl);

    scoreRow.append(mySide, vs, tilSide);
    topCard.appendChild(scoreRow);

    // Реплика Тиля
    const speechRow = el('div', 'til3d-speech-row');
    const ava = document.createElement('img');
    ava.className = 'til3d-ava';
    ava.src = './public/sprites/til_avatar.webp';
    ava.alt = 'Тиль Швайгер';
    const bubble = el('div', 'til3d-bubble', 'Кто быстрее собьёт крышки 3 бочек — тот победил!');
    bubble.id = 'til3d-bubble';
    speechRow.append(ava, bubble);
    topCard.appendChild(speechRow);

    wrap.appendChild(topCard);

    // Сигнальная плашка (не загораживает бочки)
    const banner = el('div', 'til3d-signal is-wait', 'ГОТОВЬСЯ...');
    banner.id = 'til3d-signal';
    wrap.appendChild(banner);

    // 3D-привязанный пин прямо над целевой бочкой (можно кликнуть и по нему, и по 3D-бочке!)
    const pin = el('button', 'til3d-barrel-pin is-wait', '⏳ ЖДИ...');
    pin.type = 'button';
    pin.id = 'btn-til3d-target-pin';
    pin.hidden = true;
    pin.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.targetIndex >= 0) {
        this.handleBarrelClick(this.targetIndex, null);
      }
    });
    wrap.appendChild(pin);

    // Нижняя чистая подсказка (0 лишних кнопок)
    const hint = el('div', 'til3d-bottom-hint', 'Жди зелёную вспышку «3! БЕЙ!» и бей по подсвеченной 3D-бочке быстрее Тиля');
    hint.id = 'til3d-bottom-hint';
    wrap.appendChild(hint);

    this.hostEl.appendChild(wrap);
    this._dom = { wrap, stepBadge, myDots, myVal, tilDots, tilVal, bubble, banner, pin, hint };
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

  _syncScoreUI() {
    if (!this._dom) return;
    this._dom.myVal.textContent = String(this.myScore);
    this._dom.tilVal.textContent = String(this.tilScore);

    const renderDots = (container, filled, cls) => {
      container.textContent = '';
      for (let i = 0; i < this.targetWins; i += 1) {
        container.appendChild(el('i', `til3d-dot ${cls}${i < filled ? ' is-on' : ''}`));
      }
    };
    renderDots(this._dom.myDots, this.myScore, 'is-me');
    renderDots(this._dom.tilDots, this.tilScore, 'is-til');
  }

  _setSignal(stateCls, bannerText, bubbleText = '') {
    if (!this._dom) return;
    this._dom.banner.className = `til3d-signal is-${stateCls}`;
    this._dom.banner.textContent = bannerText;
    if (bubbleText) {
      this._dom.bubble.textContent = bubbleText;
    }
  }

  _updatePinLoop() {
    if (!this.isActive) return;
    const scene = this.getScene?.();
    const pin = this._dom?.pin;
    if (scene && pin && this.targetIndex >= 0 && (this.phase === 'countdown' || this.phase === 'go')) {
      const proj = scene.projectBarrelScreenPos?.(this.targetIndex, 1.62);
      if (proj && proj.visible) {
        pin.hidden = false;
        pin.style.left = `${Math.round(proj.x)}px`;
        pin.style.top = `${Math.round(Math.max(170, proj.y))}px`;
      } else {
        pin.hidden = true;
      }
    } else if (pin) {
      pin.hidden = true;
    }
    this._raf = window.requestAnimationFrame(() => this._updatePinLoop());
  }

  start({ level = 2, barrelCount = 6, titleBadge = '', introLine = '' } = {}) {
    this.stop();
    this.isActive = true;
    this.level = Math.max(1, Number(level) || 2);
    this.barrelCount = Math.max(4, Math.min(16, Number(barrelCount) || 6));
    this.myScore = 0;
    this.tilScore = 0;
    this._roundIndex = 0;
    this.openedSet.clear();
    this.phase = 'between';

    const scene = this.getScene?.();
    if (scene) {
      scene.resetRound({ targetIndex: 0, portraitUrl: '', golden: this.level >= 3, barrelCount: this.barrelCount });
      scene.setWorkshopLevelDecor?.(Math.min(5, this.level), 'til_duel');
      scene.setInteractive(true);
    }

    if (this._dom?.stepBadge) {
      this._dom.stepBadge.textContent = titleBadge || `УР. ${this.level} · ${this.barrelCount} БОЧЕК · СХВАТКА С ТИЛЕМ`;
    }
    if (this.hostEl) this.hostEl.removeAttribute('hidden');
    this._syncScoreUI();
    this._setSignal('wait', 'ГОТОВЬСЯ...', introLine || `На раз-два-три! Сбей крышки 3 из ${this.barrelCount} бочек быстрее Тиля!`);
    this._raf = window.requestAnimationFrame(() => this._updatePinLoop());

    this._setTimer(() => this._startNextStrikeRound(), 700);
  }

  stop() {
    this.isActive = false;
    this.phase = 'idle';
    this.targetIndex = -1;
    this._clearTimers();
    if (this._raf) {
      window.cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    const scene = this.getScene?.();
    scene?.setTilBarrelCue?.(-1, 'off');
    if (this._dom?.pin) this._dom.pin.hidden = true;
    if (this.hostEl) this.hostEl.setAttribute('hidden', '');
  }

  _pickAvailableBarrel() {
    const n = this.barrelCount || 6;
    const avail = [];
    for (let i = 0; i < n; i += 1) {
      if (!this.openedSet.has(i)) avail.push(i);
    }
    if (avail.length === 0) {
      this.openedSet.clear();
      const scene = this.getScene?.();
      scene?.resetRound?.({ targetIndex: 0, portraitUrl: '', golden: this.level >= 3, barrelCount: n });
      scene?.setInteractive?.(true);
      return Math.floor(Math.random() * n);
    }
    return avail[Math.floor(Math.random() * avail.length)];
  }

  _startNextStrikeRound() {
    if (!this.isActive) return;
    this._clearTimers();
    this._roundIndex += 1;

    const scene = this.getScene?.();
    this.targetIndex = this._pickAvailableBarrel();
    this.phase = 'countdown';

    scene?.setInteractive?.(true);
    scene?.setTilBarrelCue?.(this.targetIndex, 'wait');
    scene?.triggerBarrelEerieFX?.(this.targetIndex, 'knock_urgent');

    if (this._dom?.pin) {
      this._dom.pin.className = 'til3d-barrel-pin is-wait';
      this._dom.pin.textContent = '⏳ ЖДИ...';
    }

    const wait1 = 550;
    const wait2 = 550 + Math.floor(Math.random() * 450);
    const totalWait = wait1 + wait2;

    this._setSignal('wait', 'НА СЧЁТ ТРИ · 1...', 'Слушай бочку — не бей раньше сигнала!');
    audio.playTilCountTick(1);

    this._setTimer(() => {
      if (!this.isActive || this.phase !== 'countdown') return;
      this._setSignal('wait', 'НА СЧЁТ ТРИ · 2...', 'Сейчас вспыхнет зелёным — готовься!');
      scene?.triggerBarrelEerieFX?.(this.targetIndex, 'knock_urgent');
      audio.playTilCountTick(2);
    }, wait1);

    this._setTimer(() => {
      if (!this.isActive || this.phase !== 'countdown') return;
      this.phase = 'go';
      this._goStartedAt = performance.now();
      scene?.setTilBarrelCue?.(this.targetIndex, 'go');
      scene?.triggerBarrelEerieFX?.(this.targetIndex, 'knock_urgent');
      if (this._dom?.pin) {
        this._dom.pin.className = 'til3d-barrel-pin is-go';
        this._dom.pin.textContent = '👊 БЕЙ!';
      }
      this._setSignal('go', '3! БЕЙ ПО БОЧКЕ!', 'ДАВАЙ! Сбей крышку быстрее меня!');
      audio.playTilGoSignal();
      Haptics.medium();

      // Окно реакции до удара Тиля (честное и бодрое на мобильном экране, даже среди 16 бочек)
      const tilReactionMs = Math.max(1250, 1850 - this.myScore * 140 - (this.level - 1) * 65);
      this._setTimer(() => {
        if (!this.isActive || this.phase !== 'go') return;
        this._resolveTilWonStrike();
      }, tilReactionMs);
    }, totalWait);
  }

  handleBarrelClick(index, worldPoint = null) {
    if (!this.isActive) return;
    const scene = this.getScene?.();

    // 1. Фальстарт — нажал до зелёного сигнала «3! БЕЙ!»
    if (this.phase === 'countdown') {
      const now = performance.now();
      if (now - this._lastFalseStartAt < 350) return;
      this._lastFalseStartAt = now;
      this._clearTimers();
      this.phase = 'between';
      scene?.setTilBarrelCue?.(this.targetIndex, 'til');
      scene?.triggerBarrelEerieFX?.(index, 'latch_rattle');
      if (this._dom?.pin) {
        this._dom.pin.className = 'til3d-barrel-pin is-caught';
        this._dom.pin.textContent = '⚡ РАНО!';
      }
      this._setSignal('caught', 'РАНО! ФАЛЬСТАРТ!', 'Ха-ха, поторопился! Жди зелёную «3! БЕЙ!»');
      audio.playTilFalseStart();
      Haptics.warning();
      this._setTimer(() => {
        if (this.isActive) this._startNextStrikeRound();
      }, 900);
      return;
    }

    // 2. Зелёный сигнал — удар по 3D-бочке!
    if (this.phase === 'go') {
      // Если игрок в азарте ткнул в соседнюю нецелевую закрытую бочку — подсказываем без проигрыша
      if (index !== this.targetIndex && this.targetIndex >= 0) {
        scene?.triggerBarrelEerieFX?.(index, 'latch_rattle');
        audio.playEmptyBarrelClang?.(index);
        Haptics.light();
        this._setSignal('go', 'БЕЙ ПО ЗЕЛЁНОЙ БОЧКЕ!', 'Другая бочка! Бей по подсвеченной зелёной!');
        return;
      }

      this._clearTimers();
      this.phase = 'between';
      const reactMs = Math.max(80, Math.round(performance.now() - this._goStartedAt));
      this.openedSet.add(this.targetIndex);
      this.myScore += 1;

      scene?.setTilBarrelCue?.(-1, 'off');
      scene?.triggerStrikeFX?.(this.targetIndex, worldPoint);
      scene?.triggerEmptyBarrelOpen?.(this.targetIndex, 'sparks');
      audio.playStrike(this.targetIndex);
      audio.playTilBonus();
      Haptics.heavy();

      this._syncScoreUI();
      const praises = [
        `Ого, ${reactMs} мс! Крышка улетела!`,
        `Мощный удар (${reactMs} мс)! Ты быстрее меня!`,
        `Чистая победа (${reactMs} мс)! Моя школа!`,
      ];
      this._setSignal('win', `+1 ТЫ! КРЫШКА СБИТА (${reactMs} мс)`, praises[(this.myScore - 1) % praises.length]);
      if (this._dom?.pin) this._dom.pin.hidden = true;

      if (this.myScore >= this.targetWins) {
        this._finishDuel(true);
      } else {
        this._setTimer(() => this._startNextStrikeRound(), 1050);
      }
    }
  }

  _resolveTilWonStrike() {
    if (!this.isActive) return;
    this._clearTimers();
    this.phase = 'between';
    const scene = this.getScene?.();

    this.openedSet.add(this.targetIndex);
    this.tilScore += 1;

    scene?.setTilBarrelCue?.(this.targetIndex, 'til');
    scene?.triggerStrikeFX?.(this.targetIndex, null);
    scene?.triggerEmptyBarrelOpen?.(this.targetIndex, 'smoke');
    audio.playTilCaught();
    Haptics.error();

    this._syncScoreUI();
    const taunts = [
      'Я успел первым! Соберись на следующую бочку!',
      'Моя крышка! Не зевай на сигнале!',
      'Оп! Тиль снова первый — жми реванш!',
    ];
    this._setSignal('caught', 'ТИЛЬ УСПЕЛ ПЕРВЫМ! (+1 ТИЛЮ)', taunts[(this.tilScore - 1) % taunts.length]);
    if (this._dom?.pin) this._dom.pin.hidden = true;

    this._setTimer(() => {
      scene?.setTilBarrelCue?.(-1, 'off');
      if (this.tilScore >= this.targetWins) {
        this._finishDuel(false);
      } else {
        this._startNextStrikeRound();
      }
    }, 1150);
  }

  _finishDuel(playerWon) {
    this.phase = 'done';
    this._clearTimers();
    const scene = this.getScene?.();
    scene?.setInteractive?.(false);
    scene?.setTilBarrelCue?.(-1, 'off');

    if (playerWon) {
      Haptics.success();
      this._setTimer(() => {
        if (!this.isActive) return;
        const summary = { myScore: this.myScore, tilScore: this.tilScore, level: this.level, barrelCount: this.barrelCount };
        this.stop();
        if (typeof this.onVictory === 'function') {
          this.onVictory(summary);
        }
      }, 900);
    } else {
      // Скример при проигрыше Тилю (сохраняем накал и эмоции!) -> спокойная карточка с 1 кнопкой реванша
      if (typeof this.onScreamerLoss === 'function') {
        try { this.onScreamerLoss(); } catch { /* ignore */ }
      }
      this._setTimer(() => {
        if (!this.isActive) return;
        showDuolingoCard({
          icon: '😱',
          badge: `ТИЛЬ ПОБЕДИЛ · ${this.myScore} : ${this.tilScore}`,
          title: 'Тиль вскрыл 3 бочки быстрее!',
          body: 'На зелёной вспышке «3! БЕЙ!» сразу жми на подсвеченную 3D-бочку — возьми реванш прямо сейчас!',
          buttonText: '🔄 РЕВАНШ (ЕЩЁ РАЗ)',
          tone: 'gold',
          onConfirm: () => {
            this.start({
              level: this.level,
              barrelCount: this.barrelCount,
              titleBadge: this._dom?.stepBadge?.textContent || '',
            });
          },
        });
      }, 1850);
    }
  }
}
