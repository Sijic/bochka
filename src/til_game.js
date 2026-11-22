// ============================================================================
// БОЧКА v16.0: Центральный 3-фазный режим «Играть с Тилем» (35–45 сек)
// Референсы: Duolingo (1 экран = 1 действие, облачка-реплики) + Notcoin + триллер.
// Фаза 1: «На счёт три!» (0% -> 30%)
// Фаза 2: «Замри!» (30% -> 75%, зелёный СТУЧИ! / красный 1.5с ТССС! ЗАМРИ!)
// Фаза 3: «Достучись до небес!» (75% -> 100%, финальный спринт + тряска + хаптик)
// ============================================================================
import { audio } from './audio.js';
import { Haptics } from './telegram.js';
import {
  getCachedMediaSlots,
  getTilCurrentLevel,
  setTilCurrentLevel,
  unlockArtifactLevel,
  showArtifactUnlockedCard,
  renderTilVictoryPlayer,
  renderTicketPuzzleWidget,
} from './v16_ux.js';

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

export class TilThreePhaseController {
  constructor(hostEl, callbacks = {}) {
    this.hostEl = hostEl;
    this.cb = callbacks;
    this.level = getTilCurrentLevel();
    this.active = false;
    this.phase = 'idle'; // 'idle' | 'p1_count' | 'p1_go' | 'p2_tap' | 'p2_freeze' | 'p3_sprint' | 'victory'
    this.progress = 0;
    this.taps = 0;
    this.perfectFreezes = 0;
    this.freezeTouched = false;
    this.freezeStartedAt = 0;
    this.p1GoAt = 0;
    this.timers = new Set();
    this.victoryCleanup = null;
    this._audioUnsub = null;
    this._built = false;
    this._dom = {};
  }

  _setTimer(fn, ms) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (this.active) fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  _clearTimers() {
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers.clear();
  }

  stop() {
    this.active = false;
    this.phase = 'idle';
    this._clearTimers();
    audio.stopOceanEasterEggAudio();
    if (this._audioUnsub) {
      try { this._audioUnsub(); } catch { /* ignore */ }
      this._audioUnsub = null;
    }
    if (this.victoryCleanup) {
      try { this.victoryCleanup(); } catch { /* ignore */ }
      this.victoryCleanup = null;
    }
  }

  _ensureDom() {
    if (this._built && this.hostEl.firstChild) return;
    this.hostEl.textContent = '';

    // 0. КУЛЬТОВЫЙ ФОН «ДОСТУЧАТЬСЯ ДО НЕБЕС»: МОРЕ + ВТОРОЙ ЧЕЛОВЕК НА БЕРЕГУ + ВОЛНЫ
    const skyBg = el('div', 'ocean-sky-bg til16-ocean-bg');
    skyBg.setAttribute('aria-hidden', 'true');
    this.hostEl.appendChild(skyBg);

    const wavesWrap = el('div', 'ocean-waves-wrap til16-ocean-waves');
    wavesWrap.setAttribute('aria-hidden', 'true');
    const seaImg = document.createElement('img');
    seaImg.src = './public/sprites/ocean_sea_real.webp';
    seaImg.alt = 'Северное море — на небе только и разговоров, что о море';
    seaImg.className = 'ocean-panorama-img ocean-photo-real til16-sea-photo';
    seaImg.decoding = 'async';
    wavesWrap.appendChild(seaImg);
    wavesWrap.appendChild(el('div', 'ocean-surf-shimmer'));
    this.hostEl.appendChild(wavesWrap);

    // Светофор-виньетка по краям экрана (не закрывает море и второго человека!)
    const signalVignette = el('div', 'til16-signal-vignette');
    signalVignette.id = 'til16-signal-vignette';
    signalVignette.setAttribute('aria-hidden', 'true');
    this.hostEl.appendChild(signalVignette);

    // 1. ИГРОВАЯ СЦЕНА (3 фазы прямо на берегу Северного моря!)
    const playWrap = el('div', 'til16-play-wrap');
    playWrap.id = 'til16-play-wrap';

    // Верхняя зона в небе (полупрозрачная стеклянная карточка, не закрывает море и сидящего человека!)
    const skyHud = el('div', 'til16-sky-hud');

    const topBar = el('div', 'til16-top-bar');
    const backBtn = el('button', 'til16-back-btn', '←');
    backBtn.type = 'button';
    backBtn.id = 'btn-til16-back';
    backBtn.setAttribute('aria-label', 'Назад на главный экран');
    backBtn.addEventListener('click', () => {
      this.stop();
      this.cb.onExit?.();
    });

    const progWrap = el('div', 'til16-progress-col');
    const progHead = el('div', 'til16-progress-head');
    const progLabel = el('span', 'til16-progress-title', 'Достучись до небес');
    const progPct = el('strong', 'til16-progress-pct', '0%');
    progPct.id = 'til16-progress-pct';
    progHead.appendChild(progLabel);
    progHead.appendChild(progPct);

    const progTrack = el('div', 'til16-progress-track');
    const progFill = el('div', 'til16-progress-fill');
    progFill.id = 'til16-progress-fill';
    progFill.style.width = '0%';
    const m30 = el('span', 'til16-prog-mark');
    m30.style.left = '30%';
    const m75 = el('span', 'til16-prog-mark');
    m75.style.left = '75%';
    progTrack.appendChild(progFill);
    progTrack.appendChild(m30);
    progTrack.appendChild(m75);

    progWrap.appendChild(progHead);
    progWrap.appendChild(progTrack);

    const lvlPill = el('span', 'til16-lvl-pill', 'УР. 1');
    lvlPill.id = 'til16-lvl-pill';

    topBar.appendChild(backBtn);
    topBar.appendChild(progWrap);
    topBar.appendChild(lvlPill);
    skyHud.appendChild(topBar);

    const phaseRow = el('div', 'til16-phase-row');
    const phasePill = el('span', 'til16-phase-pill', 'ФАЗА 1 / 3 · НА СЧЁТ ТРИ!');
    phasePill.id = 'til16-phase-pill';
    phaseRow.appendChild(phasePill);
    skyHud.appendChild(phaseRow);

    const bubbleWrap = el('div', 'til16-speech-wrap');
    const tilAva = document.createElement('img');
    tilAva.className = 'til16-speech-ava';
    tilAva.src = './public/sprites/til_avatar.webp';
    tilAva.alt = 'Тиль Швайгер';
    const bubble = el('div', 'til16-speech-bubble', 'Погнали!');
    bubble.id = 'til16-speech-bubble';
    bubbleWrap.appendChild(tilAva);
    bubbleWrap.appendChild(bubble);
    skyHud.appendChild(bubbleWrap);

    playWrap.appendChild(skyHud);

    // Открытая пляжная интерактивная зона (БЕЗ тёмного прямоугольника — море и второй человек слева видны целиком!)
    const stageBtn = el('button', 'til16-stage-btn til16-beach-stage');
    stageBtn.type = 'button';
    stageBtn.id = 'btn-til16-barrel-tap';
    stageBtn.setAttribute('aria-label', 'Стучать по бочке Тиля на берегу моря');

    const signalRing = el('div', 'til16-signal-ring');
    signalRing.id = 'til16-signal-ring';

    const barrelAnchor = el('div', 'til16-barrel-anchor');
    const tilImg = document.createElement('img');
    tilImg.className = 'til16-barrel-art ocean-barrel-photo';
    tilImg.src = './public/sprites/ocean_barrel_til_hand.webp';
    tilImg.alt = 'Ржавая бочка с надписью ТИЛЬ и торчащей рукой';
    tilImg.draggable = false;
    barrelAnchor.appendChild(tilImg);

    const signalBanner = el('div', 'til16-signal-banner', 'ЖДИ СИГНАЛ...');
    signalBanner.id = 'til16-signal-banner';

    const burstLayer = el('div', 'til16-burst-layer');
    burstLayer.setAttribute('aria-hidden', 'true');

    stageBtn.appendChild(signalRing);
    stageBtn.appendChild(barrelAnchor);
    stageBtn.appendChild(signalBanner);
    stageBtn.appendChild(burstLayer);

    stageBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._handleTap(e);
    });

    playWrap.appendChild(stageBtn);

    const hintText = el('div', 'til16-bottom-hint', 'Жди команду «СТУЧИ!» и жми быстрее Тиля');
    hintText.id = 'til16-bottom-hint';
    playWrap.appendChild(hintText);

    // 2. ПОБЕДНЫЙ ЭКРАН («Приглашение в кино от Тиля Швайгера» + русский режиссёр)
    const winWrap = el('div', 'til16-victory-wrap');
    winWrap.id = 'til16-victory-wrap';
    winWrap.hidden = true;

    const winHead = el('div', 'til16-victory-head');
    winHead.appendChild(el('span', 'til16-win-badge', '🏆 ДОСТУЧАЛСЯ ДО НЕБЕС · 100%'));
    const winTitle = el('h2', 'til16-win-title', 'Приглашение в кино от Тиля Швайгера');
    winHead.appendChild(winTitle);
    winWrap.appendChild(winHead);

    const videoSlotHost = el('div', 'til16-victory-video-host');
    videoSlotHost.id = 'til16-victory-video-host';
    winWrap.appendChild(videoSlotHost);

    // Блок про русского режиссёра и нашу команду (КЛЮЧЕВОЙ ТРИГГЕР!)
    const dirCard = el('div', 'til16-director-card');
    dirCard.id = 'til16-director-card';
    const dirBadge = el('span', 'v16-director-badge', 'СНЯТО В РОССИИ · НАША КОМАНДА');
    const dirTitle = el('strong', 'til16-director-title', 'Фильм снят русским режиссёром Алексеем Звонцовым');
    const dirText = el(
      'p',
      'til16-director-text',
      'Триллер «БОЧКА» сняла наша команда («Киноцех» и ООО «БИГСКРИНПРОДАКШН») под руководством русского режиссёра Алексея Звонцова вместе с Тилем Швайгером. В кино с 17 декабря!'
    );
    dirCard.appendChild(dirBadge);
    dirCard.appendChild(dirTitle);
    dirCard.appendChild(dirText);
    winWrap.appendChild(dirCard);

    // Пазл билета «5 букв»
    const ticketHost = el('div', 'til16-victory-ticket-host');
    ticketHost.id = 'til16-victory-ticket-host';
    winWrap.appendChild(ticketHost);

    // 3 понятные кнопки + следующий уровень
    const winActions = el('div', 'til16-victory-actions');

    const btnTrailer = el('button', 'btn-primary btn-full', '🎬 СМОТРЕТЬ ТРЕЙЛЕР');
    btnTrailer.type = 'button';
    btnTrailer.id = 'btn-til16-win-trailer';
    btnTrailer.addEventListener('click', () => this.cb.onWatchTrailer?.());

    const btnAbout = el('button', 'btn-secondary btn-full', 'ℹ️ УЗНАТЬ БОЛЬШЕ О ФИЛЬМЕ');
    btnAbout.type = 'button';
    btnAbout.id = 'btn-til16-win-about';
    btnAbout.addEventListener('click', () => this.cb.onAboutFilm?.());

    const btnShare = el('button', 'btn-secondary btn-full', '📢 РАССКАЗАТЬ ДРУЗЬЯМ');
    btnShare.type = 'button';
    btnShare.id = 'btn-til16-win-share';
    btnShare.addEventListener('click', () => this.cb.onShareFriends?.());

    const subRow = el('div', 'til16-victory-sub-row');
    const btnNextLvl = el('button', 'btn-ghost btn-compact', '▶ СЛЕДУЮЩИЙ УРОВЕНЬ');
    btnNextLvl.type = 'button';
    btnNextLvl.id = 'btn-til16-next-level';
    btnNextLvl.addEventListener('click', () => {
      this.startRound(this.level + 1);
    });

    const btnPackFriend = el('button', 'btn-ghost btn-compact', '🛢 СПРЯТАТЬ ДРУГА');
    btnPackFriend.type = 'button';
    btnPackFriend.id = 'btn-til16-pack-friend';
    btnPackFriend.addEventListener('click', () => {
      this.stop();
      this.cb.onPackFriend?.();
    });

    subRow.appendChild(btnNextLvl);
    subRow.appendChild(btnPackFriend);

    winActions.appendChild(btnTrailer);
    winActions.appendChild(btnAbout);
    winActions.appendChild(btnShare);
    winActions.appendChild(subRow);
    winWrap.appendChild(winActions);

    this.hostEl.appendChild(playWrap);
    this.hostEl.appendChild(winWrap);

    this._dom = {
      playWrap,
      winWrap,
      signalVignette,
      progFill,
      progPct,
      lvlPill,
      phasePill,
      bubble,
      stageBtn,
      tilImg,
      signalRing,
      signalBanner,
      burstLayer,
      hintText,
      videoSlotHost,
      dirBadge,
      dirTitle,
      dirText,
      ticketHost,
      btnNextLvl,
    };
    this._built = true;
  }

  _setProgress(pct) {
    this.progress = Math.max(0, Math.min(100, Number(pct) || 0));
    const rounded = Math.round(this.progress);
    if (this._dom.progFill) this._dom.progFill.style.width = `${rounded}%`;
    if (this._dom.progPct) this._dom.progPct.textContent = `${rounded}%`;
  }

  _say(text, mood = 'neutral') {
    const b = this._dom.bubble;
    if (!b) return;
    b.textContent = text;
    b.dataset.mood = mood;
    b.classList.remove('is-pop');
    void b.offsetWidth;
    b.classList.add('is-pop');
  }

  _setVisualState(mode, bannerText, hint) {
    const { stageBtn, signalBanner, hintText, signalVignette } = this._dom;
    if (stageBtn) {
      stageBtn.dataset.signal = mode; // 'wait' | 'go' | 'freeze' | 'sprint' | 'caught'
    }
    if (signalVignette) {
      signalVignette.dataset.signal = mode;
    }
    if (signalBanner) signalBanner.textContent = bannerText;
    if (hintText && hint !== undefined) hintText.textContent = hint;
  }

  _spawnPop(text, tone = 'gold') {
    const layer = this._dom.burstLayer;
    if (!layer) return;
    const node = el('span', `til16-pop is-${tone}`, text);
    const rx = 38 + Math.random() * 44;
    const ry = 35 + Math.random() * 34;
    node.style.left = `${rx}%`;
    node.style.top = `${ry}%`;
    layer.appendChild(node);
    window.setTimeout(() => node.remove(), 650);
  }

  _shakeBarrel(strong = false) {
    const img = this._dom.tilImg;
    if (!img) return;
    img.classList.remove('is-hit', 'is-hit-strong');
    void img.offsetWidth;
    img.classList.add(strong ? 'is-hit-strong' : 'is-hit');
  }

  startRound(levelOverride = null) {
    this.stop();
    this._ensureDom();
    this.active = true;
    this.level = Math.max(1, Math.round(Number(levelOverride ?? getTilCurrentLevel()) || 1));
    setTilCurrentLevel(this.level);
    this.progress = 0;
    this.taps = 0;
    this.perfectFreezes = 0;

    this._dom.winWrap.hidden = true;
    this._dom.playWrap.hidden = false;
    this._dom.lvlPill.textContent = `УР. ${this.level}`;
    this._setProgress(0);

    // Запускаем ТУ САМУЮ музыку «Достучаться до небес» + шум волн Северного моря!
    if (audio.enabled && !audio._userMuted) {
      audio.startOceanEasterEggAudio();
    }
    this._audioUnsub = audio.onStateChange(({ enabled, audible }) => {
      if (this.active && enabled && audible && !audio._oceanActive && !audio.modalDucked) {
        audio.startOceanEasterEggAudio();
      }
    });

    // Запускаем Фазу 1 — «На счёт три!»
    this._startPhase1();
  }

  // ---------- ФАЗА 1: «НА СЧЁТ ТРИ!» (0% -> 30%) ----------
  _startPhase1() {
    this._clearTimers();
    this.phase = 'p1_count';
    this._dom.phasePill.textContent = 'ФАЗА 1 / 3 · НА СЧЁТ ТРИ!';
    this._say('Погнали!', 'neutral');
    this._setVisualState('wait', 'РАЗ...', 'Жди зелёную команду «СТУЧИ!»');
    audio.playTilBeat(1);
    Haptics.light();

    const stepMs = Math.max(760, 1020 - (this.level - 1) * 45);
    this._setTimer(() => {
      if (this.phase !== 'p1_count') return;
      this._setVisualState('wait', 'ДВА...', 'Приготовься... не жми раньше!');
      this._say('Тихо...', 'neutral');
      audio.playTilBeat(2);
      Haptics.light();

      const delayBeforeGo = Math.max(480, 720 + Math.random() * 480 - (this.level - 1) * 45);
      this._setTimer(() => {
        if (this.phase !== 'p1_count') return;
        this.phase = 'p1_go';
        this.p1GoAt = performance.now();
        this._setVisualState('go', 'СТУЧИ!', 'Жми по бочке прямо сейчас!');
        this._say('ТРИ! Жми!', 'go');
        audio.playTilGoSignal();
        Haptics.medium();

        // Если игрок не успел нажать за 2.1 сек — мягкий повтор без тупика
        const reactionLimit = Math.max(1350, 2100 - (this.level - 1) * 100);
        this._setTimer(() => {
          if (this.phase !== 'p1_go') return;
          this.phase = 'p1_count';
          this._say('Медленно! Ещё раз', 'warn');
          this._setVisualState('caught', 'ОПОЗДАЛ', 'Давай ещё заход — лови зелёный!');
          Haptics.warning();
          this._setTimer(() => this._startPhase1(), 900);
        }, reactionLimit);
      }, delayBeforeGo);
    }, stepMs);
  }

  // ---------- ФАЗА 2: «ЗАМРИ!» (30% -> 75%) ----------
  _startPhase2() {
    this._clearTimers();
    this.phase = 'p2_tap';
    this._dom.phasePill.textContent = 'ФАЗА 2 / 3 · ЗАМРИ!';
    this._setVisualState('go', 'СТУЧИ!', 'Быстро тапай по бочке! На красный — ЗАМРИ!');
    this._scheduleNextFreeze();
  }

  _scheduleNextFreeze() {
    // На ур.1 пауза ~2.5–3.6с, на ур.2+ чаще и хитрее
    const minWait = Math.max(1500, 2400 - (this.level - 1) * 180);
    const spread = Math.max(700, 1200 - (this.level - 1) * 80);
    const waitMs = minWait + Math.random() * spread;

    this._setTimer(() => {
      if (this.phase !== 'p2_tap') return;
      this.phase = 'p2_freeze';
      this.freezeTouched = false;
      this.freezeStartedAt = performance.now();

      this._setVisualState('freeze', 'ТССС! ЗАМРИ!', 'Не трогай экран 1.5 секунды!');
      this._say('Тссс! Замри!', 'danger');
      audio.playTilFreezeAlert();
      Haptics.heavy();

      this._setTimer(() => {
        if (this.phase !== 'p2_freeze') return;
        if (!this.freezeTouched) {
          // Успешно замер -> бонусный рывок шкалы!
          this.perfectFreezes += 1;
          this._setProgress(Math.min(75, this.progress + 8));
          this._spawnPop('+8% БОНУС!', 'green');
          audio.playTilBonus();
          Haptics.success();
          const praises = ['Красава!', 'Стальные нервы!', 'Не спалился!'];
          this._say(praises[this.perfectFreezes % praises.length], 'good');
          if (this.progress >= 75) {
            this._startPhase3();
            return;
          }
        }
        this.phase = 'p2_tap';
        this._setVisualState('go', 'СТУЧИ!', 'Чисто! Продолжай быстро тапать!');
        this._scheduleNextFreeze();
      }, 1500);
    }, waitMs);
  }

  // ---------- ФАЗА 3: «ДОСТУЧИСЬ ДО НЕБЕС!» (75% -> 100%) ----------
  _startPhase3() {
    this._clearTimers();
    this.phase = 'p3_sprint';
    this._dom.phasePill.textContent = 'ФАЗА 3 / 3 · ДОСТУЧИСЬ ДО НЕБЕС!';
    this._say('Дожимай!', 'go');
    this._setVisualState('sprint', 'ДОЖИМАЙ!', 'Финальный рывок — стучи до 100%!');
    audio.playTilGoSignal();
    Haptics.heavy();
  }

  // ---------- ОБРАБОТКА ТАПА ПО БОЧКЕ ----------
  _handleTap() {
    if (!this.active) return;

    // Фаза 1 — фальстарт
    if (this.phase === 'p1_count') {
      this._clearTimers();
      audio.playTilCaught();
      Haptics.warning();
      this._shakeBarrel(false);
      this._say('Рано! Не дёргайся', 'warn');
      this._setVisualState('caught', 'РАНО!', 'Жди зелёную вспышку «СТУЧИ!»');
      this._setTimer(() => this._startPhase1(), 850);
      return;
    }

    // Фаза 1 — успешный удар на «СТУЧИ!»
    if (this.phase === 'p1_go') {
      this._clearTimers();
      this.taps += 1;
      const ms = Math.max(80, Math.round(performance.now() - this.p1GoAt));
      this._setProgress(30);
      this._shakeBarrel(true);
      this._spawnPop(`+30% · ${ms} мс`, 'green');
      audio.playTilBonus();
      Haptics.success();
      this._say('Быстро!', 'good');
      this._setTimer(() => this._startPhase2(), 550);
      return;
    }

    // Фаза 2 — тап на зелёный «СТУЧИ!»
    if (this.phase === 'p2_tap') {
      this.taps += 1;
      const step = Math.max(3.3, 4.4 - (this.level - 1) * 0.22);
      this._setProgress(Math.min(75, this.progress + step));
      this._shakeBarrel(false);
      this._spawnPop('+1', 'gold');
      audio.playTilTap(this.progress);
      Haptics.light();

      if (this.taps % 5 === 0) {
        this._say('Неплохо!', 'good');
      }
      if (this.progress >= 75) {
        this._startPhase3();
      }
      return;
    }

    // Фаза 2 — тап на красный «ТССС! ЗАМРИ!»
    if (this.phase === 'p2_freeze') {
      // Честное окно человеческой реакции 220мс после переключения
      if (performance.now() - this.freezeStartedAt < 220) {
        return;
      }
      if (this.freezeTouched) return;
      this.freezeTouched = true;
      const penalty = 6;
      this._setProgress(Math.max(30, this.progress - penalty));
      this._shakeBarrel(true);
      this._spawnPop('-6%', 'red');
      audio.playTilCaught();
      Haptics.error();
      this._say('Попался!', 'danger');
      this._setVisualState('caught', 'ПОПАЛСЯ!', 'На красный сигнал нужно замереть!');
      return;
    }

    // Фаза 3 — финальный спринт до 100%
    if (this.phase === 'p3_sprint') {
      this.taps += 1;
      const step = Math.max(2.7, 3.6 - (this.level - 1) * 0.15);
      this._setProgress(Math.min(100, this.progress + step));
      this._shakeBarrel(true);
      this._spawnPop('🔥', 'gold');
      audio.playTilTap(this.progress);
      if (this.progress >= 90) {
        Haptics.heavy();
        this._say('Почти!', 'go');
      } else {
        Haptics.medium();
      }
      if (this.progress >= 100) {
        this._finishRoundVictory();
      }
    }
  }

  async _finishRoundVictory() {
    this._clearTimers();
    this.phase = 'victory';
    this._setProgress(100);
    audio.playTilVictory();
    Haptics.success();
    this._say('Достучался!', 'good');

    const completedLevel = this.level;
    unlockArtifactLevel(completedLevel);
    setTilCurrentLevel(completedLevel + 1);

    let rewardInfo = null;
    if (typeof this.cb.onWin === 'function') {
      try {
        rewardInfo = await this.cb.onWin({
          level: completedLevel,
          taps: this.taps,
          perfectFreezes: this.perfectFreezes,
        });
      } catch { /* ignore */ }
    }

    // 1. Сначала спокойная карточка Duolingo «Собран артефакт!» с видео-кружком уровня
    showArtifactUnlockedCard(completedLevel, {
      onNext: () => {
        this._showVictoryInviteScreen(completedLevel, rewardInfo);
      },
    });
  }

  showVictoryInviteDirectly(completedLevel = 1, rewardInfo = null) {
    this.stop();
    this._ensureDom();
    this.active = true;
    this.phase = 'victory';
    this.level = Math.max(1, Math.round(Number(completedLevel) || 1));
    if (audio.enabled && !audio._userMuted && !audio._oceanActive) {
      audio.startOceanEasterEggAudio();
    }
    this._showVictoryInviteScreen(this.level, rewardInfo);
  }

  _showVictoryInviteScreen(completedLevel, rewardInfo = null) {
    this._dom.playWrap.hidden = true;
    this._dom.winWrap.hidden = false;
    if (this.hostEl) this.hostEl.scrollTop = 0;

    const slots = getCachedMediaSlots();
    const tilSlot = slots.til_victory_video;

    if (this.victoryCleanup) {
      try { this.victoryCleanup(); } catch { /* ignore */ }
    }
    this.victoryCleanup = renderTilVictoryPlayer(this._dom.videoSlotHost, tilSlot);

    if (tilSlot?.director_badge) this._dom.dirBadge.textContent = tilSlot.director_badge;
    if (tilSlot?.director_title) this._dom.dirTitle.textContent = tilSlot.director_title;
    if (tilSlot?.director_text) this._dom.dirText.textContent = tilSlot.director_text;
    if (this._dom.btnNextLvl) {
      this._dom.btnNextLvl.textContent = `▶ УРОВЕНЬ ${completedLevel + 1} С ТИЛЕМ`;
    }

    const ticketData = typeof this.cb.getTicketStatus === 'function'
      ? this.cb.getTicketStatus()
      : { shards: rewardInfo?.shards ?? 1, pendingTickets: rewardInfo?.merged ? 1 : 0 };

    renderTicketPuzzleWidget(this._dom.ticketHost, {
      shards: ticketData.shards,
      pendingTickets: ticketData.pendingTickets,
      nextStepHint:
        ticketData.pendingTickets > 0
          ? '🎉 Все 4 части собраны — подари билет другу!'
          : `+1 часть за следующий уровень с Тилем или бочку другу`,
      onClaim: () => this.cb.onClaimTicket?.(),
    });
  }
}
