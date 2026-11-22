// ============================================================================
// БОЧКА v17.3: «НАЙДИ БОЧКУ БЫСТРЕЕ ТИЛЯ» (СЛЕПОЙ ПОИСК + РЕАЛЬНЫЕ СКРИМЕРЫ)
// Никаких зелёных подсветок и подсказок! Все 6/8/12/16 бочек в 3D-цеху выглядят
// одинаково: игрок вслепую бьёт по любой закрытой бочке, рискуя нарваться на
// хоррор-скример (−1 ❤️), пока Тиль Швайгер в реальном времени тоже вскрывает
// бочки одну за другой. Проиграл / сгорели ❤️ → сцена у моря «Достучись до небес»!
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
  constructor({ hostEl, getScene, onVictory, onGoOcean, onExit, onScreamerHit, onScreamerLoss } = {}) {
    this.hostEl = hostEl;
    this.getScene = getScene;
    this.onVictory = onVictory;
    this.onGoOcean = onGoOcean;
    this.onExit = onExit;
    this.onScreamerHit = onScreamerHit || onScreamerLoss;
    this.onScreamerLoss = onScreamerLoss || onScreamerHit;

    this.isActive = false;
    this.phase = 'idle'; // 'idle' | 'playing' | 'screamer' | 'done'
    this.level = 2;
    this.barrelCount = 6;
    this.maxLives = 3;
    this.lives = 3;
    this.targetIndex = -1;
    this.screamerSet = new Set();
    this.openedSet = new Set();
    this.tilMoves = 0;
    this.playerMoves = 0;
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

    const stepBadge = el('div', 'til3d-step-badge', 'УР. 2 · 6 БОЧЕК · ПОИСК ВСЛЕПУЮ');
    stepBadge.id = 'til3d-step-badge';
    topCard.appendChild(stepBadge);

    // Верхняя строка: Жизни игрока ❤️❤️❤️ + Осталось закрытых бочек + Тиль
    const scoreRow = el('div', 'til3d-score-row');

    const mySide = el('div', 'til3d-side is-me');
    const myLbl = el('span', 'til3d-side-lbl', 'ЖИЗНИ');
    const myVal = el('strong', 'til3d-side-val', '❤️❤️❤️');
    myVal.id = 'til3d-my-lives';
    mySide.append(myLbl, myVal);

    const midInfo = el('span', 'til3d-vs', '🛢 6');
    midInfo.id = 'til3d-barrels-left';

    const tilSide = el('div', 'til3d-side is-til');
    const tilVal = el('strong', 'til3d-side-val', '0');
    tilVal.id = 'til3d-til-opened';
    const tilLbl = el('span', 'til3d-side-lbl', 'ТИЛЬ ВСКРЫЛ');
    tilSide.append(tilVal, tilLbl);

    scoreRow.append(mySide, midInfo, tilSide);
    topCard.appendChild(scoreRow);

    // Реплика Тиля (без спойлеров — только атмосфера и накал!)
    const speechRow = el('div', 'til3d-speech-row');
    const ava = document.createElement('img');
    ava.className = 'til3d-ava';
    ava.src = './public/sprites/til_avatar.webp';
    ava.alt = 'Тиль Швайгер';
    const bubble = el('div', 'til3d-bubble', 'Бочка спрятана в темноте! Бей по любой — осторожно, там скримеры!');
    bubble.id = 'til3d-bubble';
    speechRow.append(ava, bubble);
    topCard.appendChild(speechRow);

    wrap.appendChild(topCard);

    // Компактный статус (без стрелок и без указания бочки!)
    const banner = el('div', 'til3d-signal is-wait', 'ИЩИ В ЗАКРЫТЫХ БОЧКАХ!');
    banner.id = 'til3d-signal';
    wrap.appendChild(banner);

    const hint = el('div', 'til3d-bottom-hint', 'Бей по любой закрытой 3D-бочке — внутри может быть скример! Найди раньше Тиля');
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
    // Перемешиваем Фишером-Йейтсом: полностью честный слепой рандом
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    this.targetIndex = indices[0];
    this.screamerSet.clear();
    // Количество скримеров-ловушек по уровню (2 на 6 бочках, 3 на 8, 4 на 12, 5 на 16)
    const trapCount = n >= 16 ? 5 : n >= 12 ? 4 : n >= 8 ? 3 : 2;
    for (let k = 1; k <= trapCount && k < indices.length; k += 1) {
      this.screamerSet.add(indices[k]);
    }
  }

  start({ level = 2, barrelCount = 6, titleBadge = '', introLine = '' } = {}) {
    this.stop();
    this.isActive = true;
    this.level = Math.max(2, Number(level) || 2);
    this.barrelCount = Math.max(4, Math.min(16, Number(barrelCount) || 6));
    this.maxLives = 3;
    this.lives = 3;
    this.tilMoves = 0;
    this.playerMoves = 0;
    this.openedSet.clear();
    this._setupHiddenBarrels();
    this.phase = 'playing';
    this._clickLockUntil = 0;

    const scene = this.getScene?.();
    if (scene) {
      const targetSprite = this.level === 2
        ? './public/sprites/empty_barrel_hearts.webp'
        : './public/sprites/cinema_ticket_barrel.webp';
      scene.resetRound({
        targetIndex: this.targetIndex,
        portraitUrl: targetSprite,
        golden: this.level >= 3,
        barrelCount: this.barrelCount,
      });
      // СТРОГО БЕЗ ПОДСВЕТКИ ЦЕЛЕВОЙ БОЧКИ!
      scene.setTilBarrelCue?.(-1, 'off');
      scene.setWorkshopLevelDecor?.(Math.min(5, this.level), 'til_duel');
      scene.setInteractive(true);
    }

    const trapCount = this.screamerSet.size;
    if (this._dom?.stepBadge) {
      this._dom.stepBadge.textContent = titleBadge || `УР. ${this.level} · ${this.barrelCount} БОЧЕК · ${trapCount} СКРИМЕРА`;
    }
    if (this._dom?.hint) {
      this._dom.hint.textContent = `В цеху ${this.barrelCount} закрытых бочек (${trapCount} со скримерами). Бей наугад быстрее Тиля!`;
    }
    if (this.hostEl) this.hostEl.removeAttribute('hidden');
    this._syncUI();
    this._setSignal(
      'go',
      'БЕЙ ПО ЛЮБОЙ ЗАКРЫТОЙ БОЧКЕ!',
      introLine || `Ищи быстрее меня! Среди ${this.barrelCount} бочек спрятана нужная — но в ${trapCount} сидят скримеры!`
    );

    this._scheduleTilTurn();
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

  _scheduleTilTurn() {
    if (!this.isActive || this.phase !== 'playing') return;
    // Тиль делает ход каждые ~3.9–5.0 сек (на старших уровнях чуть быстрее)
    const baseMs = Math.max(3200, 4700 - (this.level - 2) * 320);
    const delay = baseMs + Math.floor(Math.random() * 900);
    this._setTimer(() => {
      if (!this.isActive || this.phase !== 'playing') return;
      this._runTilMove();
    }, delay);
  }

  _runTilMove() {
    if (!this.isActive || this.phase !== 'playing') return;
    const closed = this._getClosedBarrels();
    if (closed.length === 0) return;

    const nonTarget = closed.filter((idx) => idx !== this.targetIndex);
    let pick = -1;

    // Первые 2 хода Тиль НЕ забирает цель — он бьёт по другим бочкам, нагнетая саспенс!
    // Начиная с 3-го хода Тиль реально может вскрыть цель раньше игрока.
    const canStealTarget = this.tilMoves >= 2 && (closed.length <= 2 || Math.random() < 0.36);
    if (canStealTarget && !this.openedSet.has(this.targetIndex)) {
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
      // Тиль реально вскрыл целевую бочку быстрее игрока!
      audio.playTilCaught();
      Haptics.error();
      this._setSignal('caught', 'ТИЛЬ НАШЁЛ БОЧКУ РАНЬШЕ ТЕБЯ!', 'Ха-ха! Я вскрыл её первым! Встретимся у Северного моря!');
      this._finishDuel(false, 'til_faster');
      return;
    }

    const left = this._getClosedBarrels().length;
    const taunts = [
      `Я вскрыл бочку — пусто! Осталось ${left}. Твой ход!`,
      `Мимо! Круг сужается — осталось ${left} бочек!`,
      `Тиль уже близко! Осталось всего ${left} закрытых бочек!`,
    ];
    this._setSignal('wait', `ТИЛЬ ВСКРЫЛ БОЧКУ (ОСТАЛОСЬ ${left})`, taunts[(this.tilMoves - 1) % taunts.length]);
    this._scheduleTilTurn();
  }

  handleBarrelClick(index, worldPoint = null) {
    if (!this.isActive || this.phase !== 'playing') return;
    const now = performance.now();
    if (now < this._clickLockUntil) return;
    if (index < 0 || index >= this.barrelCount) return;
    if (this.openedSet.has(index)) return;

    this._clickLockUntil = now + 320;
    this.openedSet.add(index);
    this.playerMoves += 1;

    const scene = this.getScene?.();

    // 1. ПОБЕДА — Игрок нашёл целевую бочку быстрее Тиля!
    if (index === this.targetIndex) {
      this._clearTimers();
      this.phase = 'done';
      scene?.setTilBarrelCue?.(-1, 'off');
      scene?.assignTargetBarrelNow?.(index);
      scene?.triggerStrikeFX?.(index, worldPoint);
      scene?.triggerEmptyBarrelOpen?.(index, 'sparks');
      audio.playStrike(index);
      audio.playTilBonus();
      Haptics.heavy();
      this._syncUI();

      this._setSignal(
        'win',
        '⚡ НАШЁЛ БЫСТРЕЕ ТИЛЯ!',
        this.level === 2
          ? 'Вот она — пустая бочка! Закатывай туда друга!'
          : 'Чёрт, ты реально быстрее меня! Забирай награду!'
      );
      this._finishDuel(true, 'found');
      return;
    }

    // 2. СКРИМЕР-ЛОВУШКА!
    if (this.screamerSet.has(index)) {
      this.lives = Math.max(0, this.lives - 1);
      scene?.triggerStrikeFX?.(index, worldPoint);
      scene?.triggerEmptyBarrelOpen?.(index, 'smoke');
      audio.playStrike(index);
      Haptics.error();
      this._syncUI();

      // Запускаем настоящий полноэкранный хоррор-скример + 1 из 10 реальных MP3!
      if (typeof this.onScreamerHit === 'function') {
        try { this.onScreamerHit(); } catch { /* ignore */ }
      }

      if (this.lives <= 0) {
        this._clearTimers();
        this.phase = 'done';
        this._setSignal('caught', '😱 СКРИМЕРЫ ДОБИЛИ ТЕБЯ! (0 ❤️)', 'Живым не ушёл! Отбей 3 ❤️ у Северного моря!');
        this._finishDuel(false, 'screamers');
        return;
      }

      this._clickLockUntil = performance.now() + 1450;
      const left = this._getClosedBarrels().length;
      this._setSignal(
        'caught',
        `😱 СКРИМЕР! −1 ❤️ (ОСТАЛОСЬ ${this.lives} ❤️)`,
        `Осторожнее! Там был не тот! Осталось ${left} бочек — ищи дальше!`
      );
      return;
    }

    // 3. ПУСТАЯ БОЧКА — продолжаем искать!
    scene?.triggerStrikeFX?.(index, worldPoint);
    scene?.triggerEmptyBarrelOpen?.(index, 'sparks');
    audio.playStrike(index);
    Haptics.light();
    this._syncUI();

    const left = this._getClosedBarrels().length;
    this._setSignal(
      'go',
      `ПУСТО! ОСТАЛОСЬ ${left} БОЧЕК`,
      left <= 2
        ? 'Осталось совсем чуть-чуть — бей быстрее меня!'
        : `Здесь пусто! Бей следующую закрытую бочку (осталось ${left})!`
    );
  }

  _finishDuel(playerWon, reason = '') {
    this.phase = 'done';
    this._clearTimers();
    const scene = this.getScene?.();
    scene?.setInteractive?.(false);
    scene?.setTilBarrelCue?.(-1, 'off');

    if (playerWon) {
      Haptics.success();
      this._setTimer(() => {
        if (!this.isActive) return;
        const summary = {
          level: this.level,
          barrelCount: this.barrelCount,
          livesLeft: this.lives,
          playerMoves: this.playerMoves,
          tilMoves: this.tilMoves,
        };
        this.stop();
        if (typeof this.onVictory === 'function') {
          this.onVictory(summary);
        }
      }, 950);
      return;
    }

    // При поражении (Тиль опередил) — тоже даём скример! (При 'screamers' он уже вылетел на последнем ударе)
    if (reason === 'til_faster' && typeof this.onScreamerLoss === 'function') {
      try { this.onScreamerLoss(); } catch { /* ignore */ }
    }

    this._setTimer(() => {
      if (!this.isActive) return;
      const isTilWin = reason === 'til_faster';
      const failedLevel = this.level;
      showDuolingoCard({
        icon: '🌊',
        badge: isTilWin ? 'ТИЛЬ НАШЁЛ ПЕРВЫМ' : 'ЖИЗНИ СГОРЕЛИ НА СКРИМЕРАХ',
        title: isTilWin
          ? 'Тиль опередил! Встретимся у Северного моря!'
          : 'Скримеры выбили все ❤️ — зарядись у моря!',
        body: 'Отправляйся на берег Северного моря «Достучись до небес», простучи пульс Тиля до 100%, забери +3 ❤️ и вернись в этот же цех!',
        buttonText: '🌊 К ТИЛЮ У МОРЯ (+3 ❤️)',
        secondaryText: '🔄 СРАЗУ ЕЩЁ РАЗ В ЦЕХУ',
        tone: 'gold',
        onConfirm: () => {
          this.stop();
          if (typeof this.onGoOcean === 'function') {
            this.onGoOcean(failedLevel);
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
    }, 1850);
  }
}
