import { S, save } from './state.js';
import { sheets, drawFrame, barrelRect } from './assets.js';
import { Actor, drawShadow, moveX, drawBarrelWrappedLabel } from './sprites.js';
import * as audio from './audio.js';
import { t, speak } from './i18n.js';

/* Виртуальный холст в main.js: 960x540, но для Секретного Уровня (Ночная Смена) рендерим панорамную
   архитектурную камеру (1780x1001 в режиме ОБЗОР ЗАВОДА [Z] и 1360x765 крупным планом),
   чтобы весь огромный завод, церковь и улица выглядели в точном масштабе спрайт-листов! */
const BASE_W = 960, BASE_H = 540;
const WORLD_W = 3080;
const SKY_H = 175;
const FH = 220; /* Высота одного этажа в мировых координатах (3 этажа = 660px + 175px небо) */
const WORLD_H = SKY_H + FH * 3 + 155; /* 990px — оптимальный фундамент внизу, чтобы 1-й этаж и верхние ярусы были полностью видны! */

/* Зоны мира по горизонтали:
   0..520       — Старая Деревянная Церковь (с колокольней на верхнем ярусе)
   520..1000    — Ночная Улица под плывущей Луной, облаками и ночными птицами (ТОЛЬКО наземный ярус floor=2!)
   1000..2040   — Завод «Сектор 3» (Корпус А — 4 отсека × 3 этажа)
   2040..3080   — Главный Цех «Корпус Б» (4 отсека × 3 этажа + ТАЙНОЕ ПОМЕЩЕНИЕ С БОЧКОЙ справа на 2-м ярусе) */
const STREET_X = 520;
const SEC3_X = 1000;
const CORPB_X = 2040;
const RW = 260;
const FINAL_ROOM_X = CORPB_X + 760; /* x = 2800..3065 на floor = 1 — Тайное помещение с Главной Бочкой */
const FINAL_BARREL_X = CORPB_X + 915; /* x = 2955 на floor = 1 */

/* Точная отметка пола каждого этажа, на которой ТВЁРДО стоят ногами все персонажи и бочки */
const floorY = (f) => SKY_H + (f + 1) * FH - 12;
const floorFromY = (y) => Math.max(0, Math.min(2, Math.round((y + 12 - SKY_H) / FH - 1)));

const charH = 82;
const dogH = 52;
const barrelH = 66;

/* Все межэтажные лестницы (в Церкви, в Секторе 3 и в Корпусе Б):
   Спроектированы так, чтобы над затопленными коллекторами нужно было ПОДНЯТЬСЯ слева,
   ОБОЙТИ ВСЁ ПО ВЕРХНИМ ЭТАЖАМ (отключая свет и приманивая охрану стуком по бочкам),
   и только на дальней стороне закрыть ЗАДВИЖКУ СЛИВА ВОДЫ! */
const LADDERS = [
  { id: 'lad_church', x: 135, minF: 0, maxF: 2, label: 'Колокольня' },
  { id: 'lad_a1', x: SEC3_X + 95, minF: 0, maxF: 2, label: 'Подъём в обход воды А' },
  { id: 'lad_a_up1', x: SEC3_X + 360, minF: 0, maxF: 1, label: 'Переход 2↔3 ярус А' },
  { id: 'lad_a_up2', x: SEC3_X + 740, minF: 0, maxF: 1, label: 'Спуск к Задвижке №1' },
  { id: 'lad_a3', x: SEC3_X + 955, minF: 0, maxF: 2, label: 'Правая шахта Сектора 3' },
  { id: 'lad_b1', x: CORPB_X + 110, minF: 0, maxF: 2, label: 'Подъём в обход воды Б' },
  { id: 'lad_b_up', x: CORPB_X + 440, minF: 0, maxF: 1, label: 'Верхний переход 2↔3 Б' },
  { id: 'lad_b3', x: CORPB_X + 735, minF: 0, maxF: 2, label: 'Спуск за Ключом №3 и к Бочке' },
];

const findLadder = (x, floor, tol = 40) =>
  LADDERS.find((l) => Math.abs(x - l.x) < tol && floor >= l.minF && floor <= l.maxF);

/* 20 укрытий и звуковых бочек по всему миру:
   По любой БОЧКЕ можно СТУКНУТЬ [E / Тап], чтобы приманить всю охрану сектора на звук и обойти их! */
const HIDING_SPOTS = [
  /* Старая церковь */
  { id: 'h1', floor: 0, x: 205, type: 'barrel', key: 'igor', name: 'ИВАН', airDrain: 6 },
  { id: 'h2', floor: 2, x: 220, type: 'barrel', key: 'daniyar', name: 'ТИЛЬ', airDrain: 6 },
  { id: 'h3', floor: 2, x: 435, type: 'altar', key: 'artur', name: 'АЛТАРЬ', airDrain: 0 },
  /* Ночная улица */
  { id: 'h4', floor: 2, x: 640, type: 'barrel', key: 'oleg', name: 'СЕРГЕЙ', airDrain: 6 },
  { id: 'h5', floor: 2, x: 830, type: 'car', key: 'mark', name: 'МАШИНА', airDrain: 0 },
  { id: 'h6', floor: 2, x: 945, type: 'barrel', key: 'artur', name: 'МАКСИМ', airDrain: 6 },
  /* Завод «Сектор 3» (Корпус А) */
  { id: 'h7', floor: 0, x: SEC3_X + 230, type: 'barrel', key: 'igor', name: 'АНТОН', airDrain: 7 },
  { id: 'h8', floor: 0, x: SEC3_X + 620, type: 'bench', key: 'mark', name: 'ПУЛЬТ', airDrain: 0 },
  { id: 'h9', floor: 1, x: SEC3_X + 290, type: 'bench', key: 'oleg', name: 'ВЕРСТАК', airDrain: 0 },
  { id: 'h10', floor: 1, x: SEC3_X + 540, type: 'barrel', key: 'daniyar', name: 'ПАВЕЛ', airDrain: 7 },
  { id: 'h11', floor: 2, x: SEC3_X + 145, type: 'locker', key: 'artur', name: 'ШКАФЧИК', airDrain: 0 },
  { id: 'h12', floor: 2, x: SEC3_X + 205, type: 'barrel', key: 'oleg', name: 'ВИКТОР', airDrain: 7 },
  /* Главный Цех «Корпус Б» */
  { id: 'h15', floor: 0, x: CORPB_X + 310, type: 'barrel', key: 'daniyar', name: 'АЛЕКСЕЙ', airDrain: 7 },
  { id: 'h16', floor: 0, x: CORPB_X + 560, type: 'bench', key: 'igor', name: 'ТУРБИНА', airDrain: 0 },
  { id: 'h17', floor: 1, x: CORPB_X + 230, type: 'crates', key: 'mark', name: 'ЯЩИКИ', airDrain: 0 },
  { id: 'h18', floor: 1, x: CORPB_X + 390, type: 'barrel', key: 'igor', name: 'ТИЛЬ', airDrain: 6 },
  { id: 'h19', floor: 2, x: CORPB_X + 185, type: 'barrel', key: 'artur', name: 'КИРИЛЛ', airDrain: 7 },
  { id: 'h20', floor: 2, x: CORPB_X + 860, type: 'crates', key: 'mark', name: 'АРХИВ', airDrain: 0 },
];

export class Night {
  constructor(events) {
    this.ev = events;
    this.keys = {};
    this.floats = [];
    this.sparks = [];
    this.clouds = [];
    this.birds = [];
    this.stars = [];
    this.overviewZoom = false; /* Начинаем с комфортного крупного плана, [Z] переключает полный обзор */
    this.initSky();
    this.start();
    this.active = false;
    this.paused = false;
  }

  initSky() {
    this.stars = Array.from({ length: 90 }, (_, i) => ({
      x: (i * 197) % WORLD_W,
      y: 10 + ((i * 89) % 240),
      r: (i % 3 === 0) ? 1.8 : 1.1,
      phase: i * 0.7,
    }));
    this.clouds = Array.from({ length: 14 }, (_, i) => ({
      x: i * 230,
      y: 26 + (i % 4) * 26,
      w: 130 + (i % 3) * 52,
      h: 20 + (i % 2) * 10,
      speed: 9 + (i % 3) * 4,
      alpha: 0.16 + (i % 3) * 0.06,
    }));
    this.birds = Array.from({ length: 12 }, (_, i) => ({
      x: 90 + i * 250,
      y: 34 + (i % 4) * 24,
      vx: (i % 2 === 0 ? 1 : -1) * (44 + (i % 3) * 14),
      wingPhase: i * 1.1,
      scale: 0.8 + (i % 3) * 0.18,
    }));
  }

  start() {
    this.diff = 1 + S.nightRuns * 0.15;
    /* Герой начинает в Старой Церкви (floor = 2 — наземный ярус, x = 180) с плавной вертикальной координатой y */
    this.boy = {
      floor: 2,
      x: 180,
      y: floorY(2),
      vx: 0,
      vy: 0,
      dir: 1,
      climbing: false,
      climbLadder: null,
      climbTargetFloor: null,
      climbStepTimer: 0,
      hidden: false,
      hideSpot: null,
      air: 100,
      stamina: 100,
      seen: 0,
      moving: false,
      sprinting: false,
      targetX: null,
      targetFloor: null,
      pendingAction: false,
    };
    this.camX = 0;
    this.camY = Math.max(0, floorY(2) - 510);
    this.boyActor = new Actor('boy', { fallback: '#4A7A8C' });

    /* Стальные межкомнатные двери с засовами + Бронированная дверь в Тайное Помещение с Бочкой (требует 3 ключа!) */
    this.doors = [
      { id: 'd_church', x: STREET_X, floor: 2, closed: false, hp: 0, label: 'Дверь Церкви' },
      { id: 'd_sec3', x: SEC3_X, floor: 2, closed: false, hp: 0, label: 'Ворота Сектора 3', requiresKey1: true },
      { id: 'd_ctrl', x: SEC3_X + 520, floor: 0, closed: false, hp: 0, label: 'Диспетчерская' },
      { id: 'd_fly', x: SEC3_X + 520, floor: 1, closed: false, hp: 0, label: 'Зал задвижки №1' },
      { id: 'd_corpb1', x: CORPB_X, floor: 1, closed: false, hp: 0, label: 'Переход в Корпус Б' },
      { id: 'd_corpb2', x: CORPB_X, floor: 2, closed: false, hp: 0, label: 'Шлюз Корпуса Б' },
      { id: 'd_final', x: FINAL_ROOM_X, floor: 1, closed: true, hp: 999, label: 'ТАЙНОЕ ПОМЕЩЕНИЕ С БОЧКОЙ', isFinalDoor: true },
    ];

    /* Логическая цепочка прохождения Секретного Уровня:
       1) 🗝️ КЛЮЧ №1 у Алтаря в Церкви -> открывает ворота Сектора 3.
       2) Внизу Сектора 3 и Корпуса Б стоит ГЛУБОКАЯ ВОДА — в неё НЕЛЬЗЯ ВОЙТИ!
       3) Чтобы слить воду, нужно ПОДНЯТЬСЯ по лестнице слева, ОТКЛЮЧИТЬ СВЕТ рубильником ⚡ [E],
          СТУКНУТЬ ПО БОЧКЕ 🛢️ [E / Тап], чтобы приманить охрану на звук, ОБОЙТИ ВСЁ по верхним этажам
          на правую сторону и закрыть ⚙️ ЗАДВИЖКУ СЛИВА №1 и №2!
       4) После слива воды забрать 🗝️ КЛЮЧ №2 и 🗝️ КЛЮЧ №3 со дна осушенных коллекторов.
       5) Открыть 3 ключами Тайное Помещение с Бочкой -> 10 ударов по Главной Бочке -> Поимка в бочку -> Трейлер! */
    this.quests = {
      key1: false,          /* 🗝️ Ключ №1: у Алтаря в Старой Церкви (floor=2, x=435) */
      key2: false,          /* 🗝️ Ключ №2: на дне затопленного коллектора Сектора 3 (floor=2, x=SEC3_X+540) */
      key3: false,          /* 🗝️ Ключ №3: на дне затопленной Насосной Корпуса Б (floor=2, x=CORPB_X+460) */
      sec3LightOff: false,  /* ⚡ Рубильник света №1 (floor=1, x=SEC3_X+175) — отключает прожекторы и свет в Секторе 3 */
      corpbLightOff: false, /* ⚡ Рубильник света №2 (floor=0, x=CORPB_X+185) — отключает прожекторы и свет в Корпусе Б */
      valve1Closed: false,  /* ⚙️ Задвижка №1 НА ДАЛЬНЕЙ СТОРОНЕ Сектора 3 (floor=1, x=SEC3_X+885) — сливает воду №1 */
      valve2Closed: false,  /* ⚙️ Задвижка №2 НА ДАЛЬНЕЙ СТОРОНЕ Корпуса Б (floor=0, x=CORPB_X+685) — сливает воду №2 */
      valve1Angle: 0,
      valve2Angle: 0,
      finalDoorOpen: false, /* Открывается, когда собраны все 3 ключа (key1 + key2 + key3) */
      carAlarmUsed: false,  /* 🚗 Сирена машины на Ночной улице (floor=2, x=830) */
      blackoutUntil: 0,     /* ⚡ Дополнительное отключение света */
      bellCooldown: 0,      /* 🔔 Колокол на колокольне церкви (floor=0, x=150) */
    };

    /* 2 Главных Рубильника Отключения Света (на верхних этажах обхода воды):
       Пока свет включён — прожекторы ярко светят и охрана видит издалека. Отключи свет, чтобы пройти в темноте! */
    this.lightSwitches = [
      { id: 1, x: SEC3_X + 175, floor: 1, questKey: 'sec3LightOff', colStart: 0, colEnd: 3, label: '⚡ РУБИЛЬНИК №1: ОТКЛЮЧИТЬ СВЕТ [E]' },
      { id: 2, x: CORPB_X + 185, floor: 0, questKey: 'corpbLightOff', colStart: 4, colEnd: 7, label: '⚡ РУБИЛЬНИК №2: ОТКЛЮЧИТЬ СВЕТ [E]' },
    ];

    /* Уровень воды в двух затопленных нижних коллекторах (floor=2):
       ВОДА СТОИТ СТЕНОЙ — ЗАЙТИ В НЕЁ НЕЛЬЗЯ!
       Задвижки слива расположены НА ПРОТИВОПОЛОЖНОЙ (ПРАВОЙ) СТОРОНЕ после обхода по верхним этажам! */
    this.water = [100, 100];
    this.floodZones = [
      { idx: 0, minX: SEC3_X + 260, maxX: SEC3_X + 830, valveX: SEC3_X + 885, valveFloor: 1, label: 'Коллектор Сектора 3 (КЛЮЧ №2)' },
      { idx: 1, minX: CORPB_X + 240, maxX: CORPB_X + 680, valveX: CORPB_X + 685, valveFloor: 0, label: 'Насосная Корпуса Б (КЛЮЧ №3)' },
    ];

    /* Финальная сцена в Помещении с Бочкой */
    this.finale = {
      stage: 'explore',     /* 'explore' -> 'tapping_barrel' -> 'captured_cutscene' -> 'done' */
      hits: 0,
      maxHits: 10,
      barrelShake: 0,
      cutsceneT: 0,
      cutsceneDur: 5.5,
      guardsAlerted: false,
      textShown: false,
    };
    /* Визуальная анимация поимки на этаже (когда охрана догоняет, засовывает в бочку, и затем появляется текст) */
    this.caughtAnim = null;

    /* 5 преследователей, стоящих СТРОГО на твёрдых полах этажей (никто не ходит по воздуху над улицей!) */
    this.enemies = [
      { key: 'priest', floor: 2, y: floorY(2), minX: 560, maxX: SEC3_X + 235, x: 890, vx: 0, dir: 1, speed: 54, dog: false, pause: 1.0, alert: false, climbing: false, climbLadder: null, climbTargetFloor: null, lureX: null, lureFloor: null, knockT: 0, barkT: 0, actor: new Actor('priest', {}) },
      { key: 'father', floor: 1, y: floorY(1), minX: SEC3_X + 55, maxX: SEC3_X + 940, x: SEC3_X + 620, vx: 0, dir: -1, speed: 62, dog: false, pause: 0.5, alert: false, climbing: false, climbLadder: null, climbTargetFloor: null, lureX: null, lureFloor: null, knockT: 0, barkT: 0, actor: new Actor('father', {}) },
      { key: 'capguy', floor: 0, y: floorY(0), minX: SEC3_X + 55, maxX: CORPB_X + 740, x: SEC3_X + 420, vx: 0, dir: 1, speed: 68, dog: false, pause: 0.8, alert: false, climbing: false, climbLadder: null, climbTargetFloor: null, lureX: null, lureFloor: null, knockT: 0, barkT: 0, actor: new Actor('capguy', {}) },
      { key: 'dog', floor: 2, y: floorY(2), minX: SEC3_X + 60, maxX: SEC3_X + 240, x: SEC3_X + 165, vx: 0, dir: 1, speed: 88, dog: true, pause: 0.6, alert: false, climbing: false, climbLadder: null, climbTargetFloor: null, lureX: null, lureFloor: null, knockT: 0, barkT: 0, actor: new Actor('dog', { dog: true }) },
      { key: 'father', floor: 1, y: floorY(1), minX: CORPB_X + 60, maxX: FINAL_ROOM_X - 35, x: CORPB_X + 510, vx: 0, dir: -1, speed: 64, dog: false, pause: 1.2, alert: false, climbing: false, climbLadder: null, climbTargetFloor: null, lureX: null, lureFloor: null, knockT: 0, barkT: 0, actor: new Actor('father', {}) },
    ];

    this.girl = {
      floor: 1,
      x: SEC3_X + 310,
      y: floorY(1),
      tx: SEC3_X + 310,
      vx: 0,
      timer: 10,
      scared: 0,
      actor: new Actor('girl', { fallback: '#8C9BAE' }),
    };

    /* 24 потолочных светильника (по 8 отсеков на каждом из 3 этажей двух корпусов завода) — изначально ВКЛЮЧЕНЫ! */
    this.lamps = Array.from({ length: 24 }, () => ({ on: true, flicker: 0 }));
    this.streetLampFlicker = 0;
    this.reels = [
      { floor: 0, x: 165 },
      { floor: 2, x: 760 },
      { floor: 1, x: SEC3_X + 410 },
      { floor: 0, x: SEC3_X + 820 },
      { floor: 1, x: CORPB_X + 520 },
    ];
    this.reelT = 8;
    this.clock = 0;
    this.points = 0;
    this.shake = 0;
    this.active = true;
    this.paused = false;
    this.t = 0;
    this.lure = null;
    this.lureCooldown = 0;
    this.lootedBarrels = new Set();
    this.msg = '🗝️ ШАГ 1: Возьми КЛЮЧ №1 у Алтаря в Церкви [E] → иди в Сектор 3 (внизу вода — поднимись, отключи свет ⚡, стучи по бочке 🛢️ чтобы увести охрану, обойди и слей воду!)';
    this.msgT = 7.0;
  }

  stop() { this.active = false; }

  keysCollectedCount() {
    return (this.quests.key1 ? 1 : 0) + (this.quests.key2 ? 1 : 0) + (this.quests.key3 ? 1 : 0);
  }

  /* Определяет, играет ли пользователь на сенсорном экране телефона/планшета (чисто под тач) или на ноутбуке/ПК (с клавиатурой) */
  isTouchView() {
    const v = this.view || { x: 0, y: 0, w: BASE_W, h: BASE_H };
    if (v.w < 700) return true;
    try {
      return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  }

  actPrompt() {
    return this.isTouchView() ? '[ТАП]' : '[E]';
  }

  /* Текущая подсказка логики прохождения для верхней плашки */
  currentObjectiveText() {
    const p = this.actPrompt();
    if (this.finale.stage === 'captured_cutscene') {
      if (this.finale.cutsceneT < 1.3) {
        return '🚨 ОХРАНА ВРЫВАЕТСЯ В ПОМЕЩЕНИЕ С БОЧКОЙ!';
      }
      if (this.finale.cutsceneT < 3.4) {
        return '🛢️ ОХРАНА ПОДНИМАЕТ ТЕБЯ И ОПУСКАЕТ В ОТКРЫТУЮ БОЧКУ!';
      }
      return '⛓️ ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ! СМОТРИ ФИНАЛ В КИНО!';
    }
    if (this.caughtAnim) {
      return this.caughtAnim.t < 1.7
        ? '🚨 ОХРАНА ДОГНАЛА И ОПУСКАЕТ ТЕБЯ В БОЧКУ!'
        : '⛓️ ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ!';
    }
    if (this.finale.stage === 'tapping_barrel') {
      return `🛢️ В ПОМЕЩЕНИИ С БОЧКОЙ: БЫСТРО СТУЧИ ПО БОЧКЕ (${p})! УДАРОВ: ${this.finale.hits}/${this.finale.maxHits}`;
    }
    if (!this.quests.key1) {
      return `ШАГ 1: Возьми 🗝️ КЛЮЧ №1 у Алтаря в Церкви ${p} → открой ворота Сектора 3`;
    }
    if (!this.quests.sec3LightOff && !this.quests.valve1Closed) {
      return `ШАГ 2: Внизу ГЛУБОКАЯ ВОДА — не войти! Поднимись по левой лестнице на 2-й ярус и ОТКЛЮЧИ СВЕТ ⚡ ${p}!`;
    }
    if (!this.quests.valve1Closed) {
      return `ШАГ 3: Стукни по БОЧКЕ 🛢️ ${p}, чтобы приманить охрану на звук, ОБОЙДИ по верху направо и закрой ⚙️ ЗАДВИЖКУ №1!`;
    }
    if (!this.quests.key2) {
      return `ШАГ 4: Вода в Секторе 3 слита! Спустись по правой лестнице в осушенный коллектор и забери 🗝️ КЛЮЧ №2 ${p}!`;
    }
    if (!this.quests.corpbLightOff && !this.quests.valve2Closed) {
      return `ШАГ 5: В Корпусе Б снова ГЛУБОКАЯ ВОДА! Поднимись по лестнице слева на 3-й ярус и ОТКЛЮЧИ СВЕТ ⚡ ${p}!`;
    }
    if (!this.quests.valve2Closed) {
      return `ШАГ 6: Примани охрану СТУКОМ ПО БОЧКЕ 🛢️ ${p}, обойди сверху направо и закрой ⚙️ ЗАДВИЖКУ №2 (3-й ярус справа)!`;
    }
    if (!this.quests.key3) {
      return `ШАГ 7: Спустись по правой лестнице в осушенную Насосную Корпуса Б (1-й ярус) и забери 🗝️ КЛЮЧ №3 ${p}!`;
    }
    if (!this.quests.finalDoorOpen) {
      return `ШАГ 8: Все 3/3 ключей собраны! Поднимись на 2-й ярус Корпуса Б справа и открой 🚪 ПОМЕЩЕНИЕ С БОЧКОЙ ${p}!`;
    }
    return `ШАГ 9: Зайди в открытое 🛢️ ПОМЕЩЕНИЕ С БОЧКОЙ (справа на 2-м ярусе) и стучи по Бочке ${p}!`;
  }

  viewSize() {
    const v = this.view || { x: 0, y: 0, w: BASE_W, h: BASE_H };
    const aspect = (v.w || BASE_W) / (v.h || BASE_H);
    const vh = aspect < 1
      ? (this.overviewZoom ? 1380 : 1080)
      : (this.overviewZoom ? 980 : 720);
    const vw = Math.round(vh * aspect);
    return { vw, vh };
  }

  /* Запуск плавного подъёма/спуска Пацана по лестнице */
  startBoyClimb(ladder, targetFloor) {
    const b = this.boy;
    if (!ladder || targetFloor < ladder.minF || targetFloor > ladder.maxF) return false;
    b.climbing = true;
    b.climbLadder = ladder;
    b.climbTargetFloor = targetFloor;
    b.x = ladder.x;
    b.vx = 0;
    return true;
  }

  key(k, down) {
    this.keys[k] = down;
    if (down && (k === 'left' || k === 'right')) {
      this.boy.targetX = null;
      this.boy.targetFloor = null;
      this.boy.pendingAction = false;
    }
    if (down && k === 'act') this.action();
    if (down && k === 'hide') this.toggleHide();
    if (down && k === 'lure') this.dropPhoneLure();
    if (down && k === 'door') this.toggleNearestDoor();
    if (down && k === 'zoom') {
      this.overviewZoom = !this.overviewZoom;
      this.note(this.overviewZoom ? '🔍 КАМЕРА: ПАНОРАМНЫЙ ОБЗОР БОЛЬШОГО ЗАВОДА' : '🔍 КАМЕРА: КРУПНЫЙ ПЛАН ГЕРОЯ', 2.0);
    }
  }

  /* Клик мышью или тап пальцем по любой точке секретного уровня */
  pointer(vx, vy) {
    if (!this.active || this.paused) return;
    if (this.finale.stage === 'captured_cutscene') return;

    const v = this.view || { x: 0, y: 0, w: BASE_W, h: BASE_H };
    const { vw, vh } = this.viewSize();
    const worldX = ((vx - v.x) / v.w) * vw + this.camX;
    const worldY = ((vy - v.y) / v.h) * vh + this.camY;
    const b = this.boy;

    /* 0. Если мы уже в Помещении с Бочкой (или кликнули прямо по Финальной Бочке рядом) — стучим по бочке! */
    if (
      this.finale.stage === 'tapping_barrel' ||
      (this.quests.finalDoorOpen && b.floor === 1 && b.x >= FINAL_ROOM_X - 20 && Math.abs(worldX - FINAL_BARREL_X) < 130)
    ) {
      this.hitFinalBarrel();
      return;
    }

    /* 1. Клик по интерактивному объекту рядом с Пацаном (Ключ, Задвижка, Рубильник света, Бочка для стука, Дверь) — сразу выполняет действие [E]! */
    const clickedFloor = Math.max(0, Math.min(2, Math.floor((worldY - SKY_H) / FH)));
    if (clickedFloor === b.floor && Math.abs(worldX - b.x) < 105 && this.hasInteractiveNear(worldX, clickedFloor)) {
      this.action();
      return;
    }

    /* 2. Клик по двери рядом — запереть/открыть засов */
    const clickedDoor = this.doors.find(
      (d) => d.floor === b.floor && Math.abs(worldX - d.x) < 38 && Math.abs(worldY - (floorY(d.floor) - 55)) < 85
    );
    if (clickedDoor && Math.abs(b.x - clickedDoor.x) < 110) {
      if (clickedDoor.isFinalDoor) {
        this.action();
      } else {
        this.toggleDoor(clickedDoor);
      }
      return;
    }

    /* 3. Клик по самому герою — спрятаться/выйти из укрытия */
    if (Math.abs(worldX - b.x) < 36 && Math.abs(worldY - (b.y - 42)) < 55) {
      this.toggleHide();
      return;
    }

    if (b.hidden) {
      b.hidden = false;
      b.hideSpot = null;
    }

    /* 4. Отправляем Пацана в точку клика (он сам плавно обойдёт воду по лестницам и выполнит действие!) */
    b.targetX = Math.max(55, Math.min(WORLD_W - 45, worldX));
    b.targetFloor = clickedFloor;
    b.pendingAction = this.hasInteractiveNear(b.targetX, clickedFloor);
  }

  hasInteractiveNear(x, floor) {
    if (!this.quests.key1 && floor === 2 && Math.abs(x - 435) < 75) return true;
    if (!this.quests.key2 && floor === 2 && Math.abs(x - (SEC3_X + 540)) < 85) return true;
    if (!this.quests.key3 && floor === 2 && Math.abs(x - (CORPB_X + 460)) < 85) return true;
    if (!this.quests.valve1Closed && floor === 1 && Math.abs(x - (SEC3_X + 885)) < 85) return true;
    if (!this.quests.valve2Closed && floor === 0 && Math.abs(x - (CORPB_X + 685)) < 85) return true;
    for (const sw of this.lightSwitches) {
      if (!this.quests[sw.questKey] && floor === sw.floor && Math.abs(x - sw.x) < 80) return true;
    }
    /* Любая бочка — интерактивна: по ней можно СТУКНУТЬ, чтобы приманить охрану на звук! */
    if (HIDING_SPOTS.some((s) => s.type === 'barrel' && s.floor === floor && Math.abs(x - s.x) < 65)) return true;
    if (floor === 1 && Math.abs(x - FINAL_ROOM_X) < 85) return true;
    if (floor === 1 && Math.abs(x - FINAL_BARREL_X) < 95) return true;
    return false;
  }

  note(txt, dur = 3.0) { this.msg = txt; this.msgT = dur; }

  spawnSparks(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.35 + Math.random() * 0.35,
      });
    }
  }

  /* Громкий СТУК ПО БОЧКЕ на уровне -> приманивает всю охрану сектора на звук к этой бочке, чтобы игрок мог обойти их! */
  knockBarrelLure(spot) {
    if (!spot) return;
    const b = this.boy;
    b.hidden = false;
    b.hideSpot = null;
    this.boyActor.play('action');
    this.shake = 0.55;
    const sy = floorY(spot.floor);
    this.spawnSparks(spot.x, sy - 42, 14);
    audio.knockTone(1, 1.2);
    audio.barrelMelodyBeat(0, 3);

    const pts = Math.floor(450 * this.diff);
    this.points += pts;
    this.lure = {
      x: spot.x,
      floor: spot.floor,
      timer: 10.5,
      label: `🔊 ГУЛ БОЧКИ «${spot.name}»!`,
    };
    this.floats.push({
      x: spot.x,
      y: sy - 96,
      txt: `🛢️🔊 СТУК ПО БОЧКЕ! ОХРАНА БЕЖИТ НА ЗВУК! +${pts}`,
      life: 1.9,
    });
    this.triggerSoundLure(
      spot.x,
      spot.floor,
      1150,
      `🔊 ТЫ СТУКНУЛ ПО БОЧКЕ «${spot.name}»! Вся охрана сектора бежит на звук к бочке — быстро ОБХОДИ ИХ по другому ярусу!`
    );
  }

  /* Удар по Главной Бочке в Тайном Помещении -> на 10-м ударе Пацана ловят, запирают в бочку и запускается Трейлер! */
  hitFinalBarrel() {
    if (!this.active || this.paused) return;
    if (this.finale.stage === 'captured_cutscene' || this.finale.stage === 'done') return;

    const b = this.boy;
    b.hidden = false;
    b.climbing = false;
    b.floor = 1;
    b.y = floorY(1);
    b.x = FINAL_BARREL_X - 42;
    b.dir = 1;
    this.finale.stage = 'tapping_barrel';
    this.finale.hits++;
    this.finale.barrelShake = 1.4;
    this.shake = 0.7;
    this.boyActor.play('action');

    const hitNum = this.finale.hits;
    const pts = Math.floor(850 * this.diff);
    this.points += pts;
    this.spawnSparks(FINAL_BARREL_X, floorY(1) - 42, 14);
    audio.knockTone((hitNum - 1) % 4, 1.15);
    audio.barrelMelodyBeat((hitNum - 1) % 4, 3);

    this.floats.push({
      x: FINAL_BARREL_X,
      y: floorY(1) - 96,
      txt: `💥 СТУК ПО БОЧКЕ ${hitNum}/${this.finale.maxHits}! +${pts}`,
      life: 1.4,
    });

    /* На 4-м ударе грохот разносится по всему заводу — вся охрана сбегается к Тайному Помещению! */
    if (hitNum === 4 && !this.finale.guardsAlerted) {
      this.finale.guardsAlerted = true;
      audio.alarmLock(0);
      this.note('🚨 ГРОХОТ БОЧКИ СЛЫШЕН НА ВЕСЬ ЗАВОД! Охрана бежит в Тайное Помещение — продолжай стучать!', 3.8);
      this.enemies.forEach((e) => {
        e.alert = true;
        e.lureFloor = 1;
        e.lureX = FINAL_ROOM_X - 40;
      });
    } else if (hitNum < this.finale.maxHits) {
      this.note(`🛢️ СТУЧИ ПО БОЧКЕ! Ударов: ${hitNum} из ${this.finale.maxHits} (тапай по бочке или жми [E])!`, 2.5);
    }

    /* На 10-м ударе — КУЛЬМИНАЦИЯ: Охрана врывается в комнату, хватает Пацана и запирает его в Бочку! */
    if (hitNum >= this.finale.maxHits) {
      this.triggerFinalCaptureCutscene();
    }
  }

  triggerFinalCaptureCutscene() {
    this.quests.key1 = true;
    this.quests.key2 = true;
    this.quests.key3 = true;
    this.quests.finalDoorOpen = true;
    const fd = this.doors.find((dr) => dr.isFinalDoor);
    if (fd) fd.closed = false;
    this.finale.stage = 'captured_cutscene';
    this.finale.cutsceneT = 0;
    this.finale.cutsceneDur = 5.5;
    this.finale.textShown = false;
    this.finale.barrelShake = 1.6;
    this.shake = 1.2;
    /* Пацан остаётся ВИДИМЫМ перед бочкой, чтобы зритель видел, как охрана подбегает и опускает его в бочку! */
    this.boy.hidden = false;
    this.boy.climbing = false;
    this.boy.floor = 1;
    this.boy.x = FINAL_BARREL_X - 44;
    this.boy.y = floorY(1);
    this.boy.dir = -1;
    this.boyActor.play('panic');

    /* Охрана стартует у входа в Тайное Помещение и бежит к Пацану */
    const startSpots = [FINAL_ROOM_X - 24, FINAL_ROOM_X + 6, FINAL_BARREL_X + 128, FINAL_ROOM_X - 48];
    const targetSpots = [FINAL_BARREL_X - 58, FINAL_BARREL_X - 36, FINAL_BARREL_X + 48, FINAL_BARREL_X + 86];
    this.enemies.forEach((e, idx) => {
      e.climbing = false;
      e.floor = 1;
      e.y = floorY(1);
      e.x = startSpots[idx % startSpots.length];
      e.captureTargetX = targetSpots[idx % targetSpots.length];
      e.vx = 0;
      e.dir = e.x < FINAL_BARREL_X ? 1 : -1;
      e.alert = true;
      e.knockT = 0;
      e.actor.play('run');
    });

    audio.alarmLock(0);
    speak('Попался! Бери его и опускай прямо в бочку!', 'father');
    this.note('🚨 ОХРАНА ВРЫВАЕТСЯ В ОТСЕК!', 2.2);
  }

  /* Спрятаться в ближайшее укрытие */
  toggleHide() {
    if (!this.active || this.paused) return;
    if (this.finale.stage !== 'explore') return;
    const b = this.boy;
    if (b.climbing) return;
    if (b.hidden) {
      b.hidden = false;
      b.hideSpot = null;
      audio.creak();
      return;
    }
    const spot = HIDING_SPOTS.reduce((best, s) => {
      if (s.floor !== b.floor) return best;
      const dist = Math.abs(s.x - b.x);
      if (dist > 85) return best;
      return (!best || dist < Math.abs(best.x - b.x)) ? s : best;
    }, null);

    if (!spot) {
      this.note('Рядом нет укрытия! Подойдите к бочке, шкафчику, верстаку, ящикам или машине.');
      return;
    }
    b.x = spot.x;
    b.vx = 0;
    b.hidden = true;
    b.hideSpot = spot;
    b.seen = 0;
    b.targetX = null;
    audio.creak();

    if (spot.type === 'barrel' && !this.lootedBarrels.has(spot.id)) {
      this.lootedBarrels.add(spot.id);
      const eGain = 65;
      S.energy = Math.min(S.energyMax || 1000, S.energy + eGain);
      b.air = Math.min(100, b.air + 35);
      save();
      this.floats.push({ x: b.x, y: floorY(b.floor) - 92, txt: `⚡ +${eGain} ЭНЕРГИЯ · 💨 +35% O₂`, life: 1.6 });
      audio.coin(1.5);
    }

    const hint = spot.airDrain === 0
      ? `🗄️ УКРЫТИЕ «${spot.name}»: воздух НЕ тратится! Можно спокойно переждать погоню.`
      : `🛢️ В БОЧКЕ «${spot.name}»: полная скрытность, но следите за запасом воздуха O₂!`;
    this.note(hint, 2.8);
  }

  dropPhoneLure() {
    if (!this.active || this.paused) return;
    const b = this.boy;
    /* Если рядом есть бочка — кнопка [F] стучит по бочке без перезарядки! */
    const nearBarrel = HIDING_SPOTS.find((s) => s.type === 'barrel' && s.floor === b.floor && Math.abs(s.x - b.x) < 120);
    if (nearBarrel) {
      this.knockBarrelLure(nearBarrel);
      return;
    }
    if (this.lureCooldown > 0) {
      this.note(`📱 Перезарядка звонка: ${Math.ceil(this.lureCooldown)} с (или подойди к любой 🛢️ БОЧКЕ и стукни [E / F] без перезарядки!)`);
      return;
    }
    this.lure = { x: b.x + b.dir * 35, floor: b.floor, timer: 9.5, label: '📱 ЗВОНОК!' };
    this.lureCooldown = 10;
    audio.coin(1.8);
    audio.playPrankVoice();
    this.triggerSoundLure(this.lure.x, this.lure.floor, 1050, '📱 Телефон-приманка звонит (голос пранка)! Охрана бежит на звук — обходи их!');
  }

  triggerSoundLure(lx, lfloor, radius, message) {
    this.enemies.forEach((e) => {
      if (Math.abs(e.x - lx) < radius) {
        e.lureX = lx;
        e.lureFloor = lfloor;
        e.alert = true;
        e.pause = 0;
      }
    });
    if (message) this.note(message, 3.8);
  }

  toggleNearestDoor() {
    if (!this.active || this.paused) return;
    const b = this.boy;
    const door = this.doors.find((d) => d.floor === b.floor && Math.abs(d.x - b.x) < 95);
    if (!door) {
      this.note('Подойдите ближе к межкомнатной двери или воротам, чтобы закрыть засов [Q]!');
      return;
    }
    if (door.isFinalDoor) {
      this.action();
      return;
    }
    this.toggleDoor(door);
  }

  toggleDoor(door) {
    door.closed = !door.closed;
    door.hp = door.closed ? 5.0 : 0;
    audio.chainBreak(0);
    this.note(
      door.closed
        ? `🚪 ЗАСОВ ЗАКРЫТ (${door.label})! Преследователи задержаны на 5 секунд!`
        : `🚪 Дверь открыта (${door.label}).`,
      2.4
    );
  }

  /* Контекстное действие [E] (или тап по объекту):
     1) Ключи №1..3
     2) Задвижки слива воды №1 и №2 (на дальних концах обхода!)
     3) Рубильники ОТКЛЮЧЕНИЯ СВЕТА ⚡ №1 и №2
     4) СТУК ПО БОЧКЕ 🛢️ для приманивания всей охраны на звук
     5) Дверь в Помещение с Бочкой -> Стук по Главной Бочке! */
  action() {
    if (!this.active || this.paused || this.boy.hidden) return;
    if (this.finale.stage === 'captured_cutscene') return;

    const b = this.boy;
    this.boyActor.play('action');

    /* 0. Если мы в Тайном Помещении с Бочкой — каждое нажатие [E] бьёт по Главной Бочке! */
    if (
      this.finale.stage === 'tapping_barrel' ||
      (this.quests.finalDoorOpen && b.floor === 1 && Math.abs(b.x - FINAL_BARREL_X) < 115)
    ) {
      this.hitFinalBarrel();
      return;
    }

    /* 1. 🗝️ КЛЮЧ №1 у Алтаря в Старой Церкви (floor=2, x=435) */
    if (!this.quests.key1 && b.floor === 2 && Math.abs(b.x - 435) < 85) {
      this.quests.key1 = true;
      const pts = Math.floor(1200 * this.diff);
      this.points += pts;
      this.spawnSparks(435, floorY(2) - 55, 14);
      this.floats.push({ x: b.x, y: floorY(2) - 95, txt: `🗝️ КЛЮЧ №1 (1/3) +${pts}`, life: 1.8 });
      this.note('🗝️ КЛЮЧ №1 (1/3) взят! Иди направо в Сектор 3 — внизу глубокая вода, поднимись по лестнице слева, отключи свет ⚡ и обойди всё!', 4.5);
      audio.coin(1.9);
      return;
    }

    /* 2. ⚡ РУБИЛЬНИКИ ОТКЛЮЧЕНИЯ СВЕТА (гасят прожекторы и потолочный свет в секторе, чтобы пройти мимо охраны!) */
    for (const sw of this.lightSwitches) {
      if (b.floor === sw.floor && Math.abs(b.x - sw.x) < 88) {
        this.quests[sw.questKey] = true;
        this.quests.blackoutUntil = Math.max(this.quests.blackoutUntil, this.t + 25);
        for (let f = 0; f < 3; f++) {
          for (let c = sw.colStart; c <= sw.colEnd; c++) {
            if (this.lamps[f * 8 + c]) this.lamps[f * 8 + c].on = false;
          }
        }
        const pts = Math.floor(1200 * this.diff);
        this.points += pts;
        this.spawnSparks(sw.x, floorY(sw.floor) - 52, 16);
        this.floats.push({ x: sw.x, y: floorY(sw.floor) - 96, txt: `🌑 СВЕТ ОТКЛЮЧЁН! +${pts}`, life: 2.0 });
        audio.chainBreak(0);
        this.note('🌑 СВЕТ И ПРОЖЕКТОРЫ ОТКЛЮЧЕНЫ! В темноте охрана почти не видит — теперь СТУКНИ ПО БОЧКЕ 🛢️ [E], чтобы приманить всех на звук, и обойди их к ЗАДВИЖКЕ!', 4.6);
        return;
      }
    }

    /* 3. ⚙️ ЗАДВИЖКА №1 на дальней правой стороне 2-го яруса Сектора 3 (floor=1, x=SEC3_X+885) — сливает воду №1! */
    if (!this.quests.valve1Closed && b.floor === 1 && Math.abs(b.x - (SEC3_X + 885)) < 90) {
      this.quests.valve1Closed = true;
      const pts = Math.floor(1800 * this.diff);
      this.points += pts;
      this.spawnSparks(SEC3_X + 885, floorY(1) - 55, 18);
      this.floats.push({ x: b.x, y: floorY(1) - 95, txt: `⚙️ ЗАДВИЖКА №1 ЗАКРЫТА · ВОДА УХОДИТ! +${pts}`, life: 2.0 });
      audio.creak();
      audio.chainBreak(0);
      this.note('🌊 ЗАДВИЖКА №1 ПЕРЕКРЫТА ПОСЛЕ ОБХОДА! Вода внизу Сектора 3 полностью слита — спускайся по правой лестнице на 1-й ярус за 🗝️ КЛЮЧОМ №2!', 4.6);
      return;
    }

    /* 4. 🗝️ КЛЮЧ №2 на дне осушенного коллектора Сектора 3 (floor=2, x=SEC3_X+540) */
    if (!this.quests.key2 && b.floor === 2 && Math.abs(b.x - (SEC3_X + 540)) < 95) {
      if (this.water[0] > 15) {
        this.note('🌊 Ключ №2 под глубокой водой! Поднимись по лестнице, обойди сектор сверху и закрой ⚙️ ЗАДВИЖКУ №1 справа!', 3.8);
        return;
      }
      this.quests.key2 = true;
      const pts = Math.floor(2400 * this.diff);
      this.points += pts;
      this.spawnSparks(SEC3_X + 540, floorY(2) - 45, 18);
      this.floats.push({ x: b.x, y: floorY(2) - 95, txt: `🗝️ КЛЮЧ №2 (2/3) +${pts}`, life: 1.9 });
      audio.coin(2.2);
      this.note('🗝️ КЛЮЧ №2 (2/3) взят со дна осушенного коллектора! Иди направо в Корпус Б — там тоже вода: поднимись, отключи свет ⚡, примани охрану стуком по бочке 🛢️ и закрой ЗАДВИЖКУ №2!', 4.8);
      return;
    }

    /* 5. ⚙️ ЗАДВИЖКА №2 на дальней правой стороне 3-го яруса Корпуса Б (floor=0, x=CORPB_X+685) — сливает воду №2! */
    if (!this.quests.valve2Closed && b.floor === 0 && Math.abs(b.x - (CORPB_X + 685)) < 90) {
      this.quests.valve2Closed = true;
      const pts = Math.floor(2200 * this.diff);
      this.points += pts;
      this.spawnSparks(CORPB_X + 685, floorY(0) - 55, 18);
      this.floats.push({ x: b.x, y: floorY(0) - 95, txt: `⚙️ ЗАДВИЖКА №2 ЗАКРЫТА · НАСОСНАЯ ОСУШЕНА! +${pts}`, life: 2.0 });
      audio.creak();
      audio.chainBreak(0);
      this.note('🌊 ЗАДВИЖКА №2 ПЕРЕКРЫТА! Вода из Насосной Корпуса Б ушла — спускайся по правой лестнице на нижний ярус за 🗝️ КЛЮЧОМ №3!', 4.6);
      return;
    }

    /* 6. 🗝️ КЛЮЧ №3 на дне осушенной Насосной Корпуса Б (floor=2, x=CORPB_X+460) */
    if (!this.quests.key3 && b.floor === 2 && Math.abs(b.x - (CORPB_X + 460)) < 95) {
      if (this.water[1] > 15) {
        this.note('🌊 Ключ №3 под глубокой водой! Сначала поднимись наверх, обойди Корпус Б и перекрой ⚙️ ЗАДВИЖКУ №2!', 3.8);
        return;
      }
      this.quests.key3 = true;
      const pts = Math.floor(3000 * this.diff);
      this.points += pts;
      this.spawnSparks(CORPB_X + 460, floorY(2) - 45, 20);
      this.floats.push({ x: b.x, y: floorY(2) - 95, txt: `🗝️ ВСЕ 3/3 КЛЮЧЕЙ СОБРАНЫ! +${pts}`, life: 2.2 });
      audio.barrelMelodyBeat(0, 4);
      audio.coin(2.5);
      this.note('🗝️ КЛЮЧ №3 (3/3) ПОЛУЧЕН! Поднимайся по правой лестнице на 2-й ярус Корпуса Б в 🛢️ ТАЙНОЕ ПОМЕЩЕНИЕ С БОЧКОЙ!', 4.8);
      return;
    }

    /* 7. 🚪 Открытие бронированной двери в ТАЙНОЕ ПОМЕЩЕНИЕ С БОЧКОЙ (floor=1, x=FINAL_ROOM_X) */
    if (!this.quests.finalDoorOpen && b.floor === 1 && Math.abs(b.x - FINAL_ROOM_X) < 95) {
      const kCount = this.keysCollectedCount();
      if (kCount < 3) {
        audio.alarmLock(0);
        this.note(`🔒 Дверь в Помещение с Бочкой заперта на 3 замка! Собрано ключей: ${kCount}/3. (${this.currentObjectiveText()})`, 4.0);
        return;
      }
      this.quests.finalDoorOpen = true;
      const finalDoor = this.doors.find((d) => d.isFinalDoor);
      if (finalDoor) finalDoor.closed = false;
      this.spawnSparks(FINAL_ROOM_X, floorY(1) - 60, 22);
      audio.chainBreak(0);
      audio.coin(2.2);
      this.floats.push({ x: FINAL_ROOM_X, y: floorY(1) - 105, txt: '🔓 ПОМЕЩЕНИЕ С БОЧКОЙ ОТКРЫТО!', life: 2.0 });
      this.note('🔓 БРОНЕДВЕРЬ ОТКРЫТА! Заходи внутрь к Главной Бочке и начинай СТУЧАТЬ ПО БОЧКЕ [E]!', 4.2);
      return;
    }

    /* 8. 🛢️ СТУК ПО ЛЮБОЙ БОЧКЕ РЯДОМ — приманивает всю охрану сектора на звук к этой бочке, чтобы обойти их! */
    const nearBarrel = HIDING_SPOTS.find((s) => s.type === 'barrel' && s.floor === b.floor && Math.abs(s.x - b.x) < 88);
    if (nearBarrel) {
      this.knockBarrelLure(nearBarrel);
      return;
    }

    /* 9. Дополнительные тактические объекты: Колокол церкви, Сирена машины, Отключение потолочных ламп в отсеке */
    if (b.floor === 0 && b.x < 260 && this.quests.bellCooldown <= 0) {
      this.quests.bellCooldown = 16;
      this.lure = { x: 150, floor: 2, timer: 9, label: '🔔 НАБАТ!' };
      audio.barrelMelodyBeat(0, 4);
      this.triggerSoundLure(220, 2, 1300, '🔔 Церковный колокол звонит! Патрули с улицы стягиваются к церкви!');
      return;
    }

    if (b.floor === 2 && Math.abs(b.x - 830) < 75 && !this.quests.carAlarmUsed) {
      this.quests.carAlarmUsed = true;
      const pts = Math.floor(800 * this.diff);
      this.points += pts;
      this.lure = { x: 830, floor: 2, timer: 10, label: '🚨 СИРЕНА!' };
      this.floats.push({ x: b.x, y: floorY(2) - 95, txt: `🚨 АВТОСИРЕНА +${pts}`, life: 1.5 });
      audio.alarmLock(0);
      this.triggerSoundLure(830, 2, 1400, '🚨 Сработала сигнализация машины на улице! Охрана бежит к воротам!');
      return;
    }

    /* Нажатие [E] в любом освещённом отсеке завода ОТКЛЮЧАЕТ потолочную лампу над головой (делает темноту)! */
    if (b.x >= SEC3_X) {
      const col = Math.max(0, Math.min(7, Math.floor((b.x - SEC3_X) / RW)));
      const li = b.floor * 8 + col;
      if (this.lamps[li] && this.lamps[li].on) {
        this.lamps[li].on = false;
        const pts = Math.floor(350 * this.diff);
        this.points += pts;
        this.floats.push({ x: b.x, y: floorY(b.floor) - 90, txt: `🌑 СВЕТ ВЫКЛ +${pts}`, life: 1.3 });
        audio.chainBreak(0);
        this.note('🌑 Лампа отсека отключена! В темноте охране труднее тебя заметить.', 2.6);
        return;
      }
    }

    this.note(this.currentObjectiveText(), 3.5);
  }

  update(dt) {
    this.t += dt;
    this.msgT -= dt;
    this.shake = Math.max(0, this.shake - dt * 2.8);
    this.finale.barrelShake = Math.max(0, this.finale.barrelShake - dt * 3.0);
    this.lureCooldown = Math.max(0, this.lureCooldown - dt);
    this.quests.bellCooldown = Math.max(0, this.quests.bellCooldown - dt);
    if (this.lure) {
      this.lure.timer -= dt;
      if (this.lure.timer <= 0) this.lure = null;
    }
    this.floats = this.floats.filter((f) => (f.life -= dt) > 0);
    this.floats.forEach((f) => (f.y -= 42 * dt));
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    this.sparks.forEach((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 320 * dt;
    });

    /* Живое ночное небо */
    this.clouds.forEach((c) => {
      c.x += c.speed * dt;
      if (c.x - c.w > WORLD_W + 120) c.x = -c.w - 60;
    });
    this.birds.forEach((bd) => {
      bd.x += bd.vx * dt;
      bd.y += Math.sin(this.t * 2.2 + bd.wingPhase) * 7 * dt;
      if (bd.vx > 0 && bd.x > WORLD_W + 80) bd.x = -60;
      if (bd.vx < 0 && bd.x < -80) bd.x = WORLD_W + 60;
    });
    this.streetLampFlicker = Math.random();

    if (!this.active || this.paused) return;

    /* Плавное вращение вентилей и осушение воды после перекрытия задвижек №1 и №2 */
    if (this.quests.valve1Closed) {
      this.quests.valve1Angle = Math.min(Math.PI * 2, this.quests.valve1Angle + dt * 6);
      this.water[0] = Math.max(0, this.water[0] - dt * 38);
    }
    if (this.quests.valve2Closed) {
      this.quests.valve2Angle = Math.min(Math.PI * 2, this.quests.valve2Angle + dt * 6);
      this.water[1] = Math.max(0, this.water[1] - dt * 38);
    }

    /* Авто-открытие бронедвери в Помещение с Бочкой при сборе всех 3 ключей */
    if (!this.quests.finalDoorOpen && this.keysCollectedCount() >= 3) {
      this.quests.finalDoorOpen = true;
      const finalDoor = this.doors.find((d) => d.isFinalDoor);
      if (finalDoor) finalDoor.closed = false;
      audio.chainBreak(0);
      this.note('🔓 ВСЕ 3 КЛЮЧА СОБРАНЫ! Дверь в Тайное Помещение с Бочкой (Корпус Б, 2-й ярус справа) ОТКРЫТА!', 4.5);
    }

    /* Если идёт финальная катсцена поимки и запирания Пацана в Бочку */
    if (this.finale.stage === 'captured_cutscene') {
      this.finale.cutsceneT += dt;
      const ct = this.finale.cutsceneT;
      const by = floorY(1);
      const targetCamX = Math.max(0, Math.min(WORLD_W - this.viewSize().vw, FINAL_BARREL_X - this.viewSize().vw * 0.5));
      const targetCamY = Math.max(0, Math.min(WORLD_H - this.viewSize().vh, by - this.viewSize().vh * 0.55));
      this.camX += (targetCamX - this.camX) * Math.min(1, dt * 6);
      this.camY += (targetCamY - this.camY) * Math.min(1, dt * 6);

      /* Фаза 1 (0..1.3с): охрана подбегает к Пацану и окружает его у Бочки */
      if (ct < 1.3) {
        this.boy.hidden = false;
        this.boy.x = FINAL_BARREL_X - 42 + Math.sin(this.t * 32) * 2;
        this.boy.y = by;
        this.boyActor.play('panic');
        this.boyActor.update(dt);
      } else if (ct < 3.4) {
        /* Фаза 2 (1.3..3.4с): охрана визуально поднимает Пацана над горловиной бочки и опускает прямо внутрь! */
        const p = Math.min(1, (ct - 1.3) / 2.1);
        this.boy.hidden = false;
        if (p < 0.42) {
          const liftP = p / 0.42;
          this.boy.x = (FINAL_BARREL_X - 42) + 42 * liftP;
          this.boy.y = by - Math.sin(liftP * Math.PI * 0.5) * 92;
        } else {
          const dropP = (p - 0.42) / 0.58;
          this.boy.x = FINAL_BARREL_X + Math.sin(this.t * 45) * 2.5;
          this.boy.y = (by - 92) + dropP * 96;
        }
        this.finale.barrelShake = Math.max(this.finale.barrelShake, 0.9);
        this.boyActor.play('panic');
        this.boyActor.update(dt);
      } else {
        /* Фаза 3 (3.4..5.5с): Пацан полностью внутри бочки, крышка закрыта, цепи заперты, и ПОЯВЛЯЕТСЯ ТЕКСТ! */
        this.boy.hidden = true;
        this.boy.x = FINAL_BARREL_X;
        this.boy.y = by;
        if (!this.finale.textShown) {
          this.finale.textShown = true;
          this.finale.barrelShake = 2.4;
          this.shake = 1.8;
          this.spawnSparks(FINAL_BARREL_X, by - 48, 32);
          audio.chainBreak(0);
          audio.alarmLock(0);
          this.floats.push({
            x: FINAL_BARREL_X,
            y: by - 122,
            txt: '⛓️ ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ!',
            life: 2.4,
          });
          this.note('😱 ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ! Сейчас начнётся трейлер — СМОТРИ ФИНАЛ В КИНО!', 3.0);
        }
      }

      this.enemies.forEach((e) => {
        const tx = e.captureTargetX ?? (FINAL_BARREL_X - 52);
        const dx = tx - e.x;
        if (Math.abs(dx) > 4) {
          e.dir = Math.sign(dx);
          e.x += Math.sign(dx) * Math.min(Math.abs(dx), 230 * dt);
          e.actor.setVelocity(e.dir * 180);
          e.actor.look(e.dir);
          e.actor.play('run');
        } else {
          e.dir = e.x < FINAL_BARREL_X ? 1 : -1;
          e.actor.setVelocity(0);
          e.actor.look(e.dir);
          e.actor.play('action');
        }
        e.actor.update(dt);
      });

      if (this.finale.cutsceneT >= this.finale.cutsceneDur) {
        this.finale.stage = 'done';
        this.active = false;
        this.ev.onWin(Math.floor(this.points + 5000));
      }
      return;
    }

    /* Если идёт визуальная анимация поимки на этаже (сначала визуально засовывают в бочку, затем текст и результат) */
    if (this.caughtAnim) {
      this.caughtAnim.t += dt;
      const ca = this.caughtAnim;
      const by = floorY(ca.floor);
      if (ca.t < 0.75) {
        this.boy.hidden = false;
        this.boy.x = ca.startX;
        this.boy.y = by;
        this.boyActor.play('panic');
        this.boyActor.update(dt);
      } else if (ca.t < 1.85) {
        const p = Math.min(1, (ca.t - 0.75) / 1.1);
        this.boy.hidden = false;
        if (p < 0.45) {
          const lp = p / 0.45;
          this.boy.x = ca.startX + (ca.barrelX - ca.startX) * lp;
          this.boy.y = by - Math.sin(lp * Math.PI * 0.5) * 88;
        } else {
          const dp = (p - 0.45) / 0.55;
          this.boy.x = ca.barrelX + Math.sin(this.t * 42) * 2;
          this.boy.y = (by - 88) + dp * 92;
        }
        this.boyActor.play('panic');
        this.boyActor.update(dt);
      } else {
        this.boy.hidden = true;
        if (!ca.textShown) {
          ca.textShown = true;
          this.shake = 1.5;
          this.spawnSparks(ca.barrelX, by - 46, 24);
          audio.chainBreak(0);
          this.floats.push({
            x: ca.barrelX,
            y: by - 115,
            txt: '⛓️ ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ!',
            life: 1.8,
          });
          this.note('⛓️ ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ!', 2.0);
        }
      }
      this.enemies.forEach((e) => {
        if (e.floor === ca.floor && Math.abs(e.x - ca.barrelX) < 260) {
          const tx = ca.barrelX - 44;
          const dx = tx - e.x;
          if (Math.abs(dx) > 4) {
            e.dir = Math.sign(dx);
            e.x += Math.sign(dx) * Math.min(Math.abs(dx), 220 * dt);
            e.actor.look(e.dir);
            e.actor.play('run');
          } else {
            e.dir = 1;
            e.actor.look(1);
            e.actor.play('action');
          }
        }
        e.actor.update(dt);
      });
      if (ca.t >= ca.dur) {
        const r = ca.reason;
        this.caughtAnim = null;
        this.points = Math.floor(this.points * 0.65);
        this.active = false;
        this.boy.seen = 0;
        this.boy.hidden = false;
        this.boy.hideSpot = null;
        this.ev.onFail(r);
      }
      return;
    }

    const b = this.boy, d = this.diff;
    this.clock += dt * 1.1;

    /* ---------- ПЛАВНОЕ ПЕРЕДВИЖЕНИЕ ПАЦАНА ПО ЭТАЖАМ И ЛЕСТНИЦАМ ---------- */
    b.moving = false;
    b.sprinting = false;

    if (!b.hidden) {
      /* А) Если Пацан сейчас ПЛАВНО ЛЕЗЕТ ПО ЛЕСТНИЦЕ (вверх или вниз) */
      if (b.climbing && b.climbLadder) {
        const lad = b.climbLadder;
        b.x += (lad.x - b.x) * Math.min(1, dt * 18);
        b.vx = 0;
        const climbSpeed = 195;
        let dyDir = 0;

        if (b.climbTargetFloor !== null) {
          const targetY = floorY(b.climbTargetFloor);
          const diffY = targetY - b.y;
          if (Math.abs(diffY) <= 5) {
            b.y = targetY;
            b.floor = b.climbTargetFloor;
            b.climbing = false;
            b.climbLadder = null;
            b.climbTargetFloor = null;
            audio.step(0, false, 0.9);
          } else {
            dyDir = Math.sign(diffY);
            b.y += dyDir * climbSpeed * dt;
            b.floor = floorFromY(b.y);
            b.moving = true;
          }
        } else {
          if (this.keys.up) dyDir = -1;
          else if (this.keys.down) dyDir = 1;
          if (dyDir !== 0) {
            const minY = floorY(lad.minF);
            const maxY = floorY(lad.maxF);
            b.y = Math.max(minY, Math.min(maxY, b.y + dyDir * climbSpeed * dt));
            b.floor = floorFromY(b.y);
            b.moving = true;
          } else {
            /* Плавно доводим до ближайшего этажа, когда отпустили кнопку лестницы */
            const snapF = Math.max(lad.minF, Math.min(lad.maxF, floorFromY(b.y)));
            const targetY = floorY(snapF);
            if (Math.abs(targetY - b.y) <= 6 || this.keys.left || this.keys.right) {
              b.y = targetY;
              b.floor = snapF;
              b.climbing = false;
              b.climbLadder = null;
            } else {
              b.y += Math.sign(targetY - b.y) * climbSpeed * dt;
              b.moving = true;
            }
          }
        }

        if (b.moving) {
          b.climbStepTimer -= dt;
          if (b.climbStepTimer <= 0) {
            b.climbStepTimer = 0.22;
            audio.step(0, false, 1.05);
          }
        }
      } else {
        /* Б) Обычная ходьба / бег строго по твёрдому полу этажа floorY(b.floor) */
        b.y = floorY(b.floor);
        let ax = 0;
        if (this.keys.left) ax -= 1;
        if (this.keys.right) ax += 1;

        /* Ручной вход на лестницу по кнопкам W/S (▲/▼) — запускает ПЛАВНЫЙ подъём/спуск! */
        const nearLad = findLadder(b.x, b.floor, 38);
        if (nearLad && (this.keys.up || this.keys.down)) {
          const wantFloor = this.keys.up ? b.floor - 1 : b.floor + 1;
          if (wantFloor >= nearLad.minF && wantFloor <= nearLad.maxF) {
            this.startBoyClimb(nearLad, wantFloor);
          }
        }

        /* Автоматический маршрут при клике/тапе по точке или по другому этажу (с умным обходом глубокой воды по лестницам!) */
        if (!b.climbing && ax === 0 && b.targetX !== null) {
          const isBlockedByWaterOnFloor2 = (x1, x2) => {
            const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
            return this.floodZones.some((fz) => this.water[fz.idx] > 15 && lo < fz.maxX && hi > fz.minX);
          };

          /* Если мы на 1-м ярусе (floor=2), а цель по ту сторону глубокой воды — поднимаемся по лестнице в обход! */
          let desiredFloor = b.targetFloor !== null ? b.targetFloor : b.floor;
          if (b.floor === 2 && desiredFloor === 2 && isBlockedByWaterOnFloor2(b.x, b.targetX)) {
            const targetInsideWater = this.floodZones.some(
              (fz) => this.water[fz.idx] > 15 && b.targetX > fz.minX - 16 && b.targetX < fz.maxX + 16
            );
            if (!targetInsideWater) {
              desiredFloor = 1;
            }
          }

          if (desiredFloor !== b.floor) {
            const stepFloor = desiredFloor < b.floor ? b.floor - 1 : b.floor + 1;
            const reachableLadders = LADDERS.filter((l) => {
              if (b.floor < l.minF || b.floor > l.maxF) return false;
              if (stepFloor < l.minF || stepFloor > l.maxF) return false;
              if (b.floor === 2 && isBlockedByWaterOnFloor2(b.x, l.x)) return false;
              return true;
            });
            const bestLad = reachableLadders.reduce(
              (best, l) => (!best || Math.abs(l.x - b.x) < Math.abs(best.x - b.x) ? l : best),
              null
            );
            if (bestLad) {
              if (Math.abs(bestLad.x - b.x) < 14) {
                const targetF = ( desiredFloor >= bestLad.minF && desiredFloor <= bestLad.maxF ) ? desiredFloor : stepFloor;
                this.startBoyClimb(bestLad, targetF);
              } else {
                ax = Math.sign(bestLad.x - b.x);
              }
            } else {
              b.targetFloor = b.floor;
            }
          } else {
            const dx = b.targetX - b.x;
            if (Math.abs(dx) > 10) {
              ax = Math.sign(dx);
            } else {
              b.targetX = null;
              b.targetFloor = null;
              if (b.pendingAction) {
                b.pendingAction = false;
                this.action();
              }
            }
          }
        }

        if (!b.climbing) {
          if (this.keys.run && ax !== 0 && b.stamina > 8) {
            b.sprinting = true;
            b.stamina = Math.max(0, b.stamina - 22 * dt);
          } else {
            b.stamina = Math.min(100, b.stamina + 18 * dt);
          }

          const topSpeed = b.sprinting ? 305 : 200;
          const prevX = b.x;
          moveX(b, ax * topSpeed, dt, 1500);

          /* 1. Проверка ворот Сектора 3: требуют Ключ №1 из Церкви! */
          if (!this.quests.key1 && b.floor === 2 && prevX <= SEC3_X - 18 && b.x > SEC3_X - 18) {
            b.x = SEC3_X - 18;
            b.vx = 0;
            b.targetX = null;
            this.note('🔒 Ворота Сектора 3 заперты! Сначала возьми 🗝️ КЛЮЧ №1 у Алтаря в Старой Церкви [E]!', 3.6);
          }

          /* 2. СТРОГАЯ ФИЗИЧЕСКАЯ ПРЕГРАДА ВОДЫ (даже в Режиме Бога в глубокую воду зайти НЕЛЬЗЯ!):
             Вода стоит стеной — нужно подняться по лестнице, отключить свет ⚡, стукнуть по бочке 🛢️ чтобы приманить охрану,
             обойти всё сверху и закрыть Задвижку слива на дальней стороне! */
          if (b.floor === 2) {
            for (const fz of this.floodZones) {
              if (this.water[fz.idx] > 15) {
                const pad = 16;
                if (b.x > fz.minX - pad && b.x < fz.maxX + pad) {
                  const fromLeft = prevX <= (fz.minX + fz.maxX) * 0.5;
                  b.x = fromLeft ? fz.minX - pad : fz.maxX + pad;
                  b.vx = 0;
                  b.targetX = null;
                  const valveNum = fz.idx + 1;
                  this.note(
                    `🌊 В ВОДУ ЗАЙТИ НЕЛЬЗЯ (${fz.label})! Поднимись по лестнице, отключи свет ⚡ [E], стукни по бочке 🛢️ на звук, обойди всё сверху и закрой ⚙️ ЗАДВИЖКУ №${valveNum}!`,
                    4.4
                  );
                }
              }
            }
          }

          /* 3. Проверка бронированной двери в Тайное Помещение с Бочкой (floor = 1, x = FINAL_ROOM_X) */
          if (!this.quests.finalDoorOpen && b.floor === 1 && prevX <= FINAL_ROOM_X - 18 && b.x > FINAL_ROOM_X - 18) {
            if (this.keysCollectedCount() >= 3) {
              this.quests.finalDoorOpen = true;
              const fd = this.doors.find((dr) => dr.isFinalDoor);
              if (fd) fd.closed = false;
              audio.chainBreak(0);
            } else {
              b.x = FINAL_ROOM_X - 18;
              b.vx = 0;
              b.targetX = null;
              this.note(`🔒 Вход в Тайное Помещение с Бочкой заперт! Нужно собрать все 3 ключа (сейчас ${this.keysCollectedCount()}/3)!`, 3.8);
            }
          }

          /* 4. Твёрдые границы этажей (над Ночной Улицей x: 520..1000 НЕТ 2-го и 3-го этажей — никто не ходит по воздуху!) */
          let minX = 48, maxX = WORLD_W - 45;
          if (b.floor === 0) {
            if (b.x < STREET_X) { minX = 75; maxX = 225; }
            else { minX = SEC3_X + 32; maxX = WORLD_W - 45; }
          } else if (b.floor === 1) {
            if (b.x < STREET_X) { minX = 75; maxX = 490; }
            else { minX = SEC3_X + 32; maxX = WORLD_W - 45; }
          }
          if (b.x < minX || b.x > maxX) {
            b.x = Math.max(minX, Math.min(maxX, b.x));
            b.vx = 0;
          }
          if (ax) b.dir = ax;
          b.moving = Math.abs(b.vx) > 6;

          /* 5. Когда Пацан заходит внутрь открытого Тайного Помещения с Бочкой — начинается фаза стука по Бочке! */
          if (this.quests.finalDoorOpen && b.floor === 1 && b.x >= FINAL_ROOM_X + 24 && this.finale.stage === 'explore') {
            this.finale.stage = 'tapping_barrel';
            audio.barrelMelodyBeat(0, 4);
            this.note('🛢️ ТЫ В ПОМЕЩЕНИИ С БОЧКОЙ! Подходи к Главной Бочке и БЫСТРО СТУЧИ ПО НЕЙ (тапай или жми [E])!', 4.5);
          }
        }
      }
      b.air = Math.min(100, b.air + 22 * dt);
    } else {
      b.vx = 0;
      b.stamina = Math.min(100, b.stamina + 20 * dt);
      const drain = b.hideSpot ? b.hideSpot.airDrain : 6;
      if (drain > 0) {
        b.air -= drain * dt * Math.sqrt(d);
        if (b.air <= 0) {
          b.hidden = false;
          b.hideSpot = null;
          b.air = 55;
          this.fail('suffocated');
          return;
        }
      } else {
        b.air = Math.min(100, b.air + 14 * dt);
      }
    }

    /* Плавное панорамирование камеры за координатой b.x и плавной высотой b.y:
       держим Пацана и наземный этаж (floor=2) в центральной части экрана (0.55..0.58 vh),
       чтобы ни нижние кнопки, ни верхняя шапка ничего не закрывали! */
    const { vw, vh } = this.viewSize();
    const targetCamX = Math.max(0, Math.min(WORLD_W - vw, b.x - vw * 0.45));
    const targetCamY = vh > WORLD_H
      ? -(vh - WORLD_H) * 0.46
      : Math.max(0, Math.min(WORLD_H - vh, b.y - vh * 0.72));
    this.camX += (targetCamX - this.camX) * Math.min(1, dt * 6);
    this.camY += (targetCamY - this.camY) * Math.min(1, dt * 6);

    const blackout = this.t < this.quests.blackoutUntil;
    const colIdx = b.x >= SEC3_X ? Math.max(0, Math.min(7, Math.floor((b.x - SEC3_X) / RW))) : -1;
    const lit = !blackout && (colIdx >= 0 ? this.lamps[b.floor * 8 + colIdx]?.on : true);

    this.boyActor.setVelocity(b.climbing ? 110 : b.vx);
    this.boyActor.look(b.dir);
    if (this.boyActor.state !== 'action' || this.boyActor.time > 0.55) {
      this.boyActor.play(b.climbing ? 'walk' : b.sprinting ? 'run' : b.moving ? 'walk' : b.seen > 0.3 ? 'panic' : !lit ? 'flash' : 'idle');
    }
    this.boyActor.update(dt);
    if (!b.climbing && this.boyActor.consumeStep()) {
      audio.step(((b.x - this.camX) / vw) * 2 - 1, false, b.sprinting ? 1.15 : 0.8);
    }

    /* Бобины с киноплёнкой */
    this.reels = this.reels.filter((r) => {
      if (!b.hidden && !b.climbing && r.floor === b.floor && Math.abs(r.x - b.x) < 34) {
        const g = Math.floor(600 * d);
        this.points += g;
        this.floats.push({ x: r.x, y: floorY(r.floor) - 85, txt: `🎞️ +${g}`, life: 1.2 });
        audio.coin(2);
        return false;
      }
      return true;
    });

    /* Девушка ходит строго по твёрдому полу 2-го яруса завода */
    const g = this.girl;
    g.y = floorY(g.floor);
    g.timer -= dt;
    if (g.timer <= 0) {
      g.timer = 9 + Math.random() * 7;
      g.tx = SEC3_X + 90 + Math.random() * (FINAL_ROOM_X - SEC3_X - 180);
    }
    const gdx = g.tx - g.x;
    moveX(g, Math.abs(gdx) > 5 ? Math.sign(gdx) * 55 : 0, dt, 300);
    g.actor.setVelocity(g.vx);
    if (Math.abs(g.vx) > 3) { g.actor.look(g.vx); g.actor.play('walk'); }
    else g.actor.play('flash');
    g.actor.update(dt);

    /* ИИ преследователей: ходят строго по твёрдым полам и плавно поднимаются по лестницам */
    this.enemies.forEach((e) => {
      e.knockT = Math.max(0, e.knockT - dt);
      e.barkT = Math.max(0, e.barkT - dt);

      /* Плавный подъём/спуск врага по лестнице */
      if (e.climbing && e.climbLadder) {
        e.x = e.climbLadder.x;
        e.vx = 0;
        const ty = floorY(e.climbTargetFloor);
        const dy = ty - e.y;
        if (Math.abs(dy) <= 4) {
          e.y = ty;
          e.floor = e.climbTargetFloor;
          e.climbing = false;
          e.climbLadder = null;
          e.climbTargetFloor = null;
        } else {
          e.y += Math.sign(dy) * 115 * dt;
          e.floor = floorFromY(e.y);
        }
        e.actor.setVelocity(90);
        e.actor.play('walk');
        e.actor.update(dt);
        return;
      }

      e.y = floorY(e.floor);
      let st = 'walk', target = 0, accel = e.dog ? 950 : 420;

      if (e.lureX !== null) {
        if (e.lureFloor !== null && e.lureFloor !== e.floor) {
          const stepF = e.lureFloor < e.floor ? e.floor - 1 : e.floor + 1;
          const lad = LADDERS
            .filter((l) => !e.dog && e.floor >= l.minF && e.floor <= l.maxF && stepF >= l.minF && stepF <= l.maxF && l.x >= e.minX - 90 && l.x <= e.maxX + 90)
            .reduce((best, l) => (!best || Math.abs(l.x - e.x) < Math.abs(best.x - e.x) ? l : best), null);
          if (lad) {
            if (Math.abs(e.x - lad.x) < 18) {
              e.climbing = true;
              e.climbLadder = lad;
              e.climbTargetFloor = (e.lureFloor >= lad.minF && e.lureFloor <= lad.maxF) ? e.lureFloor : stepF;
            } else {
              e.dir = Math.sign(lad.x - e.x);
              target = e.dir * e.speed * 1.35;
              st = 'run';
            }
          } else {
            e.lureFloor = e.floor;
          }
        } else {
          const dx = e.lureX - e.x;
          if (Math.abs(dx) < 28) {
            e.lureX = null;
            e.lureFloor = null;
            e.pause = 8.0; /* Охрана надолго собирается у стучащей бочки (8 секунд), давая игроку обойти всё! */
            e.alert = false;
          } else {
            e.dir = Math.sign(dx);
            target = e.dir * e.speed * 1.4;
            st = 'run';
          }
        }
      } else if (e.pause > 0) {
        e.pause -= dt;
        st = e.dog ? 'sniff' : 'flash';
      } else {
        target = e.dir * e.speed * (e.alert ? 1.3 : 1);
        st = e.alert ? 'run' : 'walk';
        if ((e.x < e.minX + 20 && e.dir < 0) || (e.x > e.maxX - 20 && e.dir > 0)) e.dir *= -1;
        if (!e.alert && Math.random() < dt * 0.08) e.pause = 1.2 + Math.random() * 1.4;
      }

      /* Враги не заходят в глубокую воду на 1-м ярусе */
      if (e.floor === 2) {
        for (const fz of this.floodZones) {
          if (this.water[fz.idx] > 15) {
            if (e.dir > 0 && e.x > fz.minX - 28 && e.x < fz.minX) e.dir = -1;
            if (e.dir < 0 && e.x < fz.maxX + 28 && e.x > fz.maxX) e.dir = 1;
          }
        }
      }

      /* Проверка запертых дверей с засовами */
      const blockingDoor = this.doors.find(
        (dr) => dr.closed && dr.floor === e.floor && Math.abs(dr.x - e.x) < 28 && (dr.x - e.x) * e.dir > 0
      );
      if (blockingDoor) {
        target = 0;
        e.vx = 0;
        e.knockT = 0.4;
        if (!blockingDoor.isFinalDoor) {
          blockingDoor.hp -= dt;
          if (blockingDoor.hp <= 0) {
            blockingDoor.closed = false;
            audio.chainBreak(((blockingDoor.x - this.camX) / vw) * 2 - 1);
            this.note(`⚠️ Преследователь выбил засов двери «${blockingDoor.label}»!`);
          }
        }
      }

      /* Обнаружение героя: если СВЕТ НЕ ОТКЛЮЧЁН — прожектор светит далеко (235px); когда свет отключён рубильником — охрана почти слепа (68px)! */
      if (this.finale.stage === 'explore' && !b.climbing && e.floor === b.floor) {
        const dist = Math.abs(e.x - b.x);
        const doorBetween = this.doors.some(
          (dr) => dr.closed && dr.floor === b.floor && ((dr.x > e.x && dr.x < b.x) || (dr.x > b.x && dr.x < e.x))
        );
        const sectorLightOff = (b.x >= CORPB_X && this.quests.corpbLightOff) || (b.x >= SEC3_X && b.x < CORPB_X && this.quests.sec3LightOff);
        const isDarkHere = blackout || sectorLightOff || !lit;
        const viewRange = isDarkHere ? 68 : 235;
        const facing = (b.x - e.x) * e.dir >= -18;

        if (!doorBetween && dist < viewRange && facing && !b.hidden) {
          const rate = isDarkHere ? 0.32 : 1.05;
          b.seen += dt * rate * (e.dog ? 1.15 : 1) * (1.15 - (dist / viewRange) * 0.5);
          if (b.seen >= 1) {
            this.fail('caught');
            return;
          }
        }
      }

      moveX(e, target, dt, accel);
      /* Жёсткое соблюдение границ этажей для всех врагов (чтобы никто не выходил в воздух!) */
      if (e.floor < 2) {
        e.x = Math.max(SEC3_X + 36, Math.min(WORLD_W - 48, e.x));
      } else {
        e.x = Math.max(e.minX, Math.min(e.maxX, e.x));
      }

      const moving = Math.abs(e.vx) > 4;
      if (!moving && (st === 'walk' || st === 'run')) st = 'idle';
      if (moving && (st === 'flash' || st === 'sniff')) st = 'walk';
      if (e.knockT > 0) st = 'action';
      if (e.barkT > 0) st = 'bark';
      e.actor.setVelocity(e.vx);
      e.actor.play(st);
      e.actor.look(moving ? Math.sign(e.vx) : e.dir);
      e.actor.update(dt);
    });

    const anySeeing = !b.hidden && !b.climbing && this.enemies.some((e) => e.floor === b.floor && Math.abs(e.x - b.x) < 175);
    if (!anySeeing) b.seen = Math.max(0, b.seen - dt * 0.95);
    if (S.godMode) {
      b.air = 100;
      b.stamina = 100;
      b.seen = 0;
    }
  }

  fail(reason) {
    if (S.godMode) {
      this.boy.seen = 0;
      this.boy.air = 100;
      this.note('⚡ РЕЖИМ БОГА: Щит защитил от поимки в секретном уровне!', 3.0);
      return;
    }
    if (reason === 'caught' && !this.caughtAnim) {
      audio.alarmLock(0);
      this.caughtAnim = {
        reason,
        t: 0,
        dur: 2.85,
        floor: this.boy.floor,
        startX: this.boy.x,
        barrelX: Math.min(WORLD_W - 65, this.boy.x + 28),
        textShown: false,
      };
      this.note('🚨 ОХРАНА ДОГНАЛА И ОПУСКАЕТ ТЕБЯ В БОЧКУ!', 2.0);
      return;
    }
    this.points = Math.floor(this.points * 0.65);
    this.active = false;
    this.boy.seen = 0;
    this.boy.hidden = false;
    this.boy.hideSpot = null;
    this.ev.onFail(reason);
  }

  resume() {
    this.boy.seen = 0;
    this.boy.hidden = false;
    this.boy.air = 100;
    this.enemies.forEach((e) => {
      e.alert = false;
      if (e.floor === this.boy.floor && Math.abs(e.x - this.boy.x) < 260) {
        e.x = e.x < this.boy.x ? Math.max(e.minX, this.boy.x - 320) : Math.min(e.maxX, this.boy.x + 320);
      }
    });
    this.active = true;
  }

  clockText() {
    return `🗝️${this.keysCollectedCount()}/3`;
  }

  /* 1. Ночное небо во весь мир */
  drawNightSkyAndBirds(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    sky.addColorStop(0, '#040810');
    sky.addColorStop(0.35, '#0C1726');
    sky.addColorStop(0.75, '#132234');
    sky.addColorStop(1, '#080B10');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    this.stars.forEach((st) => {
      const a = 0.35 + Math.sin(this.t * 2.4 + st.phase) * 0.3;
      ctx.fillStyle = `rgba(232,240,255,${a})`;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    });

    const moonX = 740 + Math.sin(this.t * 0.06) * 140;
    const moonY = 74 + Math.sin(this.t * 0.2) * 8;
    const halo = ctx.createRadialGradient(moonX, moonY, 14, moonX, moonY, 170);
    halo.addColorStop(0, 'rgba(248,238,205,0.95)');
    halo.addColorStop(0.25, 'rgba(224,204,152,0.42)');
    halo.addColorStop(0.55, 'rgba(130,168,210,0.14)');
    halo.addColorStop(1, 'rgba(130,168,210,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 170, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F6EED8';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 36, 0, Math.PI * 2);
    ctx.fill();

    this.clouds.forEach((c) => {
      ctx.fillStyle = `rgba(168,192,218,${c.alpha})`;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w * 0.5, c.h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* 2. Отрисовка зданий + МОЩНЫХ СТАЛЬНЫХ ПОМОСТОВ И ПЕРЕКРЫТИЙ ЭТАЖЕЙ (чтобы никто не ходил по воздуху!) */
  drawWorldBuildings(ctx) {
    const ch = sheets.church;
    const fs = sheets.factorySector;
    const fb = sheets.factory;
    const groundY = floorY(2);

    /* А. НОЧНАЯ УЛИЦА (x: 500..1020) */
    if (ch) {
      const cw = ch.width, chH = ch.height;
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.drawImage(
        ch,
        Math.floor(cw * 0.16), Math.floor(chH * 0.75),
        Math.floor(cw * 0.83), Math.floor(chH * 0.245),
        500, groundY - 230, 440, 242
      );
      ctx.restore();
    }
    if (fs) {
      const fw = fs.width, fh = fs.height;
      ctx.drawImage(
        fs,
        0, Math.floor(fh * 0.24),
        Math.floor(fw * 0.285), Math.floor(fh * 0.74),
        790, groundY - 470, 225, 482
      );
    }

    /* Б. СТАРАЯ ДЕРЕВЯННАЯ ЦЕРКОВЬ С КОЛОКОЛЬНЕЙ (x: 20..535) */
    if (ch) {
      const cw = ch.width, chH = ch.height;
      ctx.drawImage(
        ch,
        Math.floor(cw * 0.03), Math.floor(chH * 0.005),
        Math.floor(cw * 0.13), Math.floor(chH * 0.415),
        48, SKY_H + 8, 155, FH * 3 - 6
      );
      ctx.drawImage(
        ch,
        Math.floor(cw * 0.01), Math.floor(chH * 0.005),
        Math.floor(cw * 0.96), Math.floor(chH * 0.425),
        20, SKY_H + Math.round(FH * 1.12), 515, Math.round(FH * 1.92)
      );
    }

    /* В. ЗАВОД «СЕКТОР 3» (x: 1000..2040) */
    if (fs) {
      const fw = fs.width, fh = fs.height;
      ctx.drawImage(
        fs,
        Math.floor(fw * 0.285), Math.floor(fh * 0.02),
        Math.floor(fw * 0.69), Math.floor(fh * 0.96),
        SEC3_X, SKY_H, 1040, FH * 3
      );
    }

    /* Г. ГЛАВНЫЙ ЦЕХ «КОРПУС Б» (x: 2040..3080) */
    if (fb) {
      const fw = fb.width, fh = fb.height;
      ctx.drawImage(
        fb,
        Math.floor(fw * 0.03), Math.floor(fh * 0.02),
        Math.floor(fw * 0.94), Math.floor(fh * 0.96),
        CORPB_X, SKY_H, 1040, FH * 3
      );
    }

    /* Д. ТВЁРДЫЕ СТАЛЬНЫЕ И КАМЕННЫЕ ПОЛЫ / ЭСТАКАДЫ ПОД НОГАМИ НА ВСЕХ ЭТАЖАХ (чтобы персонажи ходили по полу, а не по воздуху!) */
    /* Подземный бетонный фундамент под наземным этажом (чтобы камера могла держать 1-й этаж в центре экрана) */
    const subGrad = ctx.createLinearGradient(0, groundY + 14, 0, WORLD_H);
    subGrad.addColorStop(0, '#141920');
    subGrad.addColorStop(0.4, '#0C0F14');
    subGrad.addColorStop(1, '#06080B');
    ctx.fillStyle = subGrad;
    ctx.fillRect(0, groundY + 14, WORLD_W, WORLD_H - (groundY + 14));
    ctx.strokeStyle = 'rgba(72, 86, 102, 0.25)';
    ctx.lineWidth = 1.5;
    for (let sx = 60; sx < WORLD_W; sx += 180) {
      ctx.strokeRect(sx, groundY + 24, 120, 46);
    }

    this.drawSolidFloorDeck(ctx, 40, 235, floorY(0), 'wood');    /* Пол колокольни Церкви (3 ярус) */
    this.drawSolidFloorDeck(ctx, 40, 505, floorY(1), 'wood');    /* Пол хоров Церкви (2 ярус) */
    this.drawSolidFloorDeck(ctx, 20, WORLD_W, floorY(2), 'ground'); /* Наземный каменный/бетонный пол всего мира (1 ярус) */
    this.drawSolidFloorDeck(ctx, SEC3_X, WORLD_W, floorY(1), 'steel'); /* Стальное перекрытие 2-го яруса Завода */
    this.drawSolidFloorDeck(ctx, SEC3_X, WORLD_W, floorY(0), 'steel'); /* Стальное перекрытие 3-го яруса Завода */

    /* Надписи и указатели корпусов */
    ctx.save();
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#D4A843';
    ctx.fillText('⛪ СТАРАЯ ЦЕРКОВЬ (🗝️ КЛЮЧ №1 У АЛТАРЯ)', 270, SKY_H + 26);
    ctx.fillText('🌙 НОЧНАЯ УЛИЦА', 755, SKY_H + 26);
    ctx.fillText('🏭 СЕКТОР 3 (⚙️ ЗАДВИЖКА №1 · 🗝️ КЛЮЧ №2)', SEC3_X + 520, SKY_H - 12);
    ctx.fillText('⚙️ КОРПУС Б (⚙️ ЗАДВИЖКА №2 · 🗝️ КЛЮЧ №3 · 🛢️ ПОМЕЩЕНИЕ С БОЧКОЙ)', CORPB_X + 520, SKY_H - 12);
    ctx.restore();
  }

  /* Отрисовка мощной физической плиты перекрытия / стального помоста с перилами и балками под ногами персонажей */
  drawSolidFloorDeck(ctx, x1, x2, y, style = 'steel') {
    const w = x2 - x1;
    const h = 18;
    ctx.save();

    /* Задние стальные перила вдоль этажей завода */
    if (style === 'steel') {
      ctx.strokeStyle = 'rgba(92, 110, 128, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y - 34);
      ctx.lineTo(x2, y - 34);
      ctx.moveTo(x1, y - 17);
      ctx.lineTo(x2, y - 17);
      for (let rx = x1 + 40; rx < x2; rx += 130) {
        ctx.moveTo(rx, y - 34);
        ctx.lineTo(rx, y);
      }
      ctx.stroke();
    }

    /* Тело плиты пола прямо под подошвами (y..y+h) */
    const grad = ctx.createLinearGradient(0, y - 2, 0, y + h);
    if (style === 'wood') {
      grad.addColorStop(0, '#5E4028');
      grad.addColorStop(0.35, '#3E2818');
      grad.addColorStop(1, '#1E130B');
    } else if (style === 'ground') {
      grad.addColorStop(0, '#38424E');
      grad.addColorStop(0.3, '#222830');
      grad.addColorStop(1, '#0D1015');
    } else {
      grad.addColorStop(0, '#465464');
      grad.addColorStop(0.25, '#28323C');
      grad.addColorStop(1, '#12171D');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x1, y - 2, w, h);

    /* Яркая верхняя кромка настила, по которой ступают ноги */
    ctx.fillStyle = style === 'wood' ? 'rgba(212,168,105,0.45)' : 'rgba(175,195,215,0.52)';
    ctx.fillRect(x1, y - 2, w, 3);

    /* Заклёпки и сигнальные полосы на стальной балке */
    if (style === 'steel' || style === 'ground') {
      ctx.fillStyle = 'rgba(212,168,67,0.35)';
      for (let hx = x1 + 18; hx < x2 - 28; hx += 84) {
        ctx.fillRect(hx, y + 4, 26, 4);
      }
    }
    ctx.restore();
  }

  /* 3. Отрисовка отсеков, труб с водопадами, задвижек, воды, 3 ключей и ТАЙНОГО ПОМЕЩЕНИЯ С БОЧКОЙ */
  drawFactoryInteriorsAndProps(ctx) {
    const blackout = this.t < this.quests.blackoutUntil;

    /* 24 отсека двух корпусов завода */
    for (let f = 0; f < 3; f++) {
      for (let c = 0; c < 8; c++) {
        const x = SEC3_X + c * RW;
        const y = SKY_H + f * FH;
        const lamp = this.lamps[f * 8 + c];
        const isLit = !blackout && lamp && lamp.on;

        ctx.fillStyle = isLit
          ? `rgba(212,154,69,${0.03 + lamp.flicker * 0.015})`
          : 'rgba(5,8,12,0.58)';
        ctx.fillRect(x, y, RW, FH);

        /* Вертикальные двутавровые колонны между отсеками */
        ctx.fillStyle = '#182028';
        ctx.fillRect(x - 5, y, 10, FH);
        ctx.strokeStyle = 'rgba(82,98,116,0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 5, y, 10, FH);

        /* Потолочный плафон */
        ctx.fillStyle = isLit ? '#E6B45A' : '#3A4452';
        ctx.fillRect(x + RW * 0.5 - 11, y + 5, 22, 6);
        if (isLit) {
          const cone = ctx.createLinearGradient(0, y + 10, 0, y + FH);
          cone.addColorStop(0, 'rgba(248,220,160,0.18)');
          cone.addColorStop(0.6, 'rgba(212,154,69,0.06)');
          cone.addColorStop(1, 'rgba(212,154,69,0)');
          ctx.fillStyle = cone;
          ctx.beginPath();
          ctx.moveTo(x + RW * 0.5 - 12, y + 11);
          ctx.lineTo(x + RW * 0.5 + 12, y + 11);
          ctx.lineTo(x + RW - 16, y + FH);
          ctx.lineTo(x + 16, y + FH);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    /* ---------- ЗАТОПЛЕННЫЕ КОЛЛЕКТОРЫ (В ВОДУ НЕ ВОЙТИ!), ПОТОКИ ВОДЫ И ЗАДВИЖКИ НА ДАЛЬНЕЙ СТОРОНЕ ---------- */
    this.floodZones.forEach((fz, idx) => {
      const wLevel = this.water[fz.idx];
      const valveClosed = idx === 0 ? this.quests.valve1Closed : this.quests.valve2Closed;
      const valveAngle = idx === 0 ? this.quests.valve1Angle : this.quests.valve2Angle;
      const vx = fz.valveX;
      const vy = floorY(fz.valveFloor) - 46;

      /* Магистральная труба от задвижки на верхнем ярусе к затопленному коллектору внизу */
      ctx.save();
      ctx.strokeStyle = '#3A4856';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx, floorY(2) - 20);
      ctx.stroke();

      /* Если задвижка ещё НЕ перекрыта — из прорванной трубы хлещет мощный водопад в нижний ярус! */
      if (!valveClosed && wLevel > 5) {
        const streamX = (fz.minX + fz.maxX) * 0.5;
        const streamTop = floorY(1) + 12;
        const streamBot = floorY(2);
        const sGrad = ctx.createLinearGradient(0, streamTop, 0, streamBot);
        sGrad.addColorStop(0, 'rgba(120, 215, 255, 0.85)');
        sGrad.addColorStop(0.5, 'rgba(64, 175, 230, 0.75)');
        sGrad.addColorStop(1, 'rgba(180, 240, 255, 0.9)');
        ctx.fillStyle = sGrad;
        const sw = 20 + Math.sin(this.t * 14 + idx) * 4;
        ctx.fillRect(streamX - sw * 0.5, streamTop, sw, streamBot - streamTop);

        /* Брызги пены внизу водопада */
        ctx.fillStyle = 'rgba(220, 248, 255, 0.78)';
        for (let sp = 0; sp < 4; sp++) {
          const r = 6 + ((this.t * 25 + sp * 7) % 14);
          ctx.beginPath();
          ctx.arc(streamX - 18 + sp * 12, streamBot - 18, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* Глубокая вода в нижнем коллекторе (СТОИТ СТЕНОЙ — ЗАЙТИ НЕЛЬЗЯ, пока не обойдёшь сверху до Задвижки!) */
      if (wLevel > 2) {
        const wh = (wLevel / 100) * 128;
        const wTop = floorY(2) - wh;
        const wWidth = fz.maxX - fz.minX;
        const wGrad = ctx.createLinearGradient(0, wTop, 0, floorY(2));
        wGrad.addColorStop(0, 'rgba(56, 188, 236, 0.82)');
        wGrad.addColorStop(0.5, 'rgba(18, 96, 142, 0.92)');
        wGrad.addColorStop(1, 'rgba(6, 38, 64, 0.97)');
        ctx.fillStyle = wGrad;
        ctx.fillRect(fz.minX, wTop, wWidth, wh);

        /* Бурлящие волны на поверхности глубокой воды */
        ctx.strokeStyle = '#90E0EF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let sx = fz.minX; sx <= fz.maxX; sx += 16) {
          const sy = wTop + Math.sin(this.t * 4.8 + sx * 0.05 + idx) * 4;
          if (sx === fz.minX) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        /* Физические полосатые барьеры-бортики по краям глубокой воды (показывают, что зайти в воду НЕЛЬЗЯ!) */
        if (wLevel > 15) {
          [fz.minX, fz.maxX].forEach((edgeX) => {
            ctx.fillStyle = '#E63946';
            ctx.fillRect(edgeX - 6, floorY(2) - 134, 12, 134);
            ctx.fillStyle = '#FFD166';
            for (let sy = floorY(2) - 128; sy < floorY(2) - 8; sy += 24) {
              ctx.fillRect(edgeX - 6, sy, 12, 11);
            }
          });

          const bx = (fz.minX + fz.maxX) * 0.5;
          const by = wTop - 22;
          ctx.fillStyle = 'rgba(10, 14, 20, 0.94)';
          ctx.strokeStyle = '#FF595E';
          ctx.lineWidth = 1.8;
          ctx.fillRect(bx - 178, by - 16, 356, 24);
          ctx.strokeRect(bx - 178, by - 16, 356, 24);
          ctx.fillStyle = '#FFD166';
          ctx.font = 'bold 10px "JetBrains Mono"';
          ctx.textAlign = 'center';
          ctx.fillText(
            `🌊 В ВОДУ НЕ ВОЙТИ! ПОДНИМИСЬ СЛЕВА, ОБОЙДИ И ЗАКРОЙ ЗАДВИЖКУ №${idx + 1} СПРАВА`,
            bx,
            by
          );
        }
      }

      /* Большое красное колесо ЗАДВИЖКИ (ВЕНТИЛЯ) со спицами на дальней правой стороне обхода */
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(valveAngle);
      ctx.strokeStyle = valveClosed ? '#52B788' : '#E63946';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 2;
        ctx.moveTo(Math.cos(a) * -22, Math.sin(a) * -22);
        ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
      }
      ctx.stroke();
      ctx.fillStyle = '#ECE4D2';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* Подпись над Задвижкой */
      ctx.fillStyle = 'rgba(10, 14, 20, 0.94)';
      ctx.strokeStyle = valveClosed ? '#52B788' : '#FFD166';
      ctx.lineWidth = 1.6;
      ctx.fillRect(vx - 102, vy - 48, 204, 22);
      ctx.strokeRect(vx - 102, vy - 48, 204, 22);
      ctx.fillStyle = valveClosed ? '#80ED99' : '#FFD166';
      ctx.font = 'bold 10px "JetBrains Mono"';
      ctx.textAlign = 'center';
      const p = this.actPrompt();
      ctx.fillText(
        valveClosed ? `✓ ЗАДВИЖКА №${idx + 1}: ВОДА СЛИТА` : `⚙️ ЗАДВИЖКА №${idx + 1} ${p} (СЛИТЬ ВОДУ)`,
        vx,
        vy - 33
      );
      ctx.restore();
    });

    /* ---------- 2 ГЛАВНЫХ РУБИЛЬНИКА ОТКЛЮЧЕНИЯ СВЕТА (НА ВЕРХНИХ ЭТАЖАХ ОБХОДА ВОДЫ) ---------- */
    const pAct = this.actPrompt();
    this.lightSwitches.forEach((sw) => {
      const isOff = !!this.quests[sw.questKey];
      const sx = sw.x;
      const sy = floorY(sw.floor) - 52;
      ctx.save();

      /* Если свет ещё НЕ отключён — рисуем яркий прожекторный луч охраны вдоль коридора */
      if (!isOff) {
        const beamGrad = ctx.createRadialGradient(sx + 160, sy - 10, 12, sx + 160, sy + 20, 260);
        beamGrad.addColorStop(0, 'rgba(255, 225, 130, 0.24)');
        beamGrad.addColorStop(0.6, 'rgba(255, 195, 85, 0.1)');
        beamGrad.addColorStop(1, 'rgba(255, 195, 85, 0)');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(sx - 40, SKY_H + sw.floor * FH, 520, FH);
      }

      /* Корпус электрощита с рычагом рубильника */
      ctx.fillStyle = '#1C2530';
      ctx.strokeStyle = isOff ? '#52B788' : '#FFD166';
      ctx.lineWidth = 2;
      ctx.fillRect(sx - 16, sy - 22, 32, 42);
      ctx.strokeRect(sx - 16, sy - 22, 32, 42);

      /* Рычаг (вверх = СВЕТ ВКЛ / ОПАСНО, вниз = СВЕТ ОТКЛЮЧЁН / ТЕМНОТА) */
      ctx.strokeStyle = isOff ? '#80ED99' : '#FF595E';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (isOff ? -10 : 10), sy + (isOff ? 14 : -14));
      ctx.stroke();

      /* Плашка над Рубильником */
      ctx.fillStyle = 'rgba(10, 14, 20, 0.94)';
      ctx.strokeStyle = isOff ? '#52B788' : '#FFD166';
      ctx.lineWidth = 1.5;
      ctx.fillRect(sx - 118, sy - 48, 236, 20);
      ctx.strokeRect(sx - 118, sy - 48, 236, 20);
      ctx.fillStyle = isOff ? '#80ED99' : '#FFD166';
      ctx.font = 'bold 9.5px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(
        isOff ? `🌑 СВЕТ №${sw.id} ОТКЛЮЧЁН (ПУТЬ В ТЕМНОТЕ)` : `⚡ РУБИЛЬНИК №${sw.id}: ОТКЛЮЧИТЬ СВЕТ ${pAct}`,
        sx,
        sw.floor === 0 ? sy - 34 : sy - 34
      );
      ctx.restore();
    });

    /* ---------- 3 СЮЖЕТНЫХ КЛЮЧА (НА АЛТАРЕ И НА ДНЕ ДВУХ ЗАТОПЛЕННЫХ КОЛЛЕКТОРОВ) ---------- */
    const keysList = [
      { id: 1, taken: this.quests.key1, x: 435, floor: 2, label: `🗝️ КЛЮЧ №1 (АЛТАРЬ) ${pAct}` },
      { id: 2, taken: this.quests.key2, x: SEC3_X + 540, floor: 2, label: `🗝️ КЛЮЧ №2 (СЛЕЙ ВОДУ №1!) ${pAct}` },
      { id: 3, taken: this.quests.key3, x: CORPB_X + 460, floor: 2, label: `🗝️ КЛЮЧ №3 (СЛЕЙ ВОДУ №2!) ${pAct}` },
    ];
    keysList.forEach((k) => {
      if (k.taken) return;
      const kx = k.x;
      const ky = floorY(k.floor) - 36 + Math.sin(this.t * 4 + k.id) * 5;
      ctx.save();
      const glow = ctx.createRadialGradient(kx, ky, 4, kx, ky, 36);
      glow.addColorStop(0, 'rgba(255, 215, 102, 0.85)');
      glow.addColorStop(1, 'rgba(255, 215, 102, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(kx, ky, 36, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFD166';
      ctx.strokeStyle = '#14181F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(kx - 8, ky, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(kx, ky - 3, 20, 6);
      ctx.fillRect(kx + 12, ky + 3, 4, 6);
      ctx.fillRect(kx + 17, ky + 3, 4, 8);

      ctx.fillStyle = 'rgba(10, 14, 20, 0.92)';
      ctx.strokeStyle = '#FFD166';
      ctx.lineWidth = 1.4;
      ctx.fillRect(kx - 96, ky - 38, 192, 19);
      ctx.strokeRect(kx - 96, ky - 38, 192, 19);
      ctx.fillStyle = '#FFD166';
      ctx.font = 'bold 9.5px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(k.label, kx, ky - 25);
      ctx.restore();
    });

    /* ---------- ТАЙНОЕ ПОМЕЩЕНИЕ С БОЧКОЙ (КОРПУС Б, 2-Й ЯРУС, x = 2800..3065) ---------- */
    this.drawSecretBarrelRoom(ctx);

    /* 20 укрытий и ЗВУКОВЫХ БОЧЕК (по любой бочке можно СТУКНУТЬ [E / Тап], чтобы приманить охрану на звук!) */
    const sh = sheets.barrels;
    HIDING_SPOTS.forEach((s) => {
      const sy = floorY(s.floor);
      if (s.type === 'barrel') {
        if (sh) drawFrame(ctx, sh, barrelRect(sh, s.key), s.x, sy, barrelH);
        drawBarrelWrappedLabel(ctx, s.x, sy, barrelH, s.name);
        ctx.save();
        ctx.fillStyle = 'rgba(10, 16, 24, 0.88)';
        ctx.strokeStyle = '#64C8FF';
        ctx.lineWidth = 1.2;
        ctx.fillRect(s.x - 52, sy - barrelH - 18, 104, 15);
        ctx.strokeRect(s.x - 52, sy - barrelH - 18, 104, 15);
        ctx.fillStyle = '#90E0EF';
        ctx.font = 'bold 8.5px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(`🔊 СТУК НА ЗВУК ${pAct}`, s.x, sy - barrelH - 7);
        ctx.restore();
      } else if (!(s.id === 'h3' && !this.quests.key1)) {
        ctx.save();
        ctx.fillStyle = 'rgba(12,18,24,0.82)';
        ctx.strokeStyle = 'rgba(74,122,140,0.85)';
        ctx.lineWidth = 1;
        ctx.fillRect(s.x - 32, sy - barrelH - 16, 64, 15);
        ctx.strokeRect(s.x - 32, sy - barrelH - 16, 64, 15);
        ctx.fillStyle = '#A8D0E6';
        ctx.font = 'bold 9px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(`🛡️ ${s.name}`, s.x, sy - barrelH - 5);
        ctx.restore();
      }
    });

    /* Межэтажные лестницы с чёткими перекладинами и подписями */
    LADDERS.forEach((l) => {
      const y0 = floorY(l.minF) - 10;
      const y1 = floorY(l.maxF);
      ctx.save();
      ctx.fillStyle = 'rgba(18, 26, 36, 0.72)';
      ctx.fillRect(l.x - 14, y0, 28, y1 - y0);
      ctx.strokeStyle = '#64DFDF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(l.x - 11, y0);
      ctx.lineTo(l.x - 11, y1);
      ctx.moveTo(l.x + 11, y0);
      ctx.lineTo(l.x + 11, y1);
      for (let ry = y0 + 8; ry <= y1; ry += 14) {
        ctx.moveTo(l.x - 11, ry);
        ctx.lineTo(l.x + 11, ry);
      }
      ctx.stroke();
      ctx.restore();
    });

    /* Межкомнатные стальные двери + Бронированная дверь в Тайное Помещение с Бочкой */
    this.doors.forEach((d) => {
      const dy = floorY(d.floor);
      ctx.save();
      if (d.isFinalDoor) {
        const kCount = this.keysCollectedCount();
        if (!this.quests.finalDoorOpen) {
          ctx.fillStyle = '#2B1814';
          ctx.strokeStyle = '#FFD166';
          ctx.lineWidth = 3;
          ctx.fillRect(d.x - 10, dy - 135, 20, 135);
          ctx.strokeRect(d.x - 10, dy - 135, 20, 135);
          ctx.fillStyle = 'rgba(10, 14, 20, 0.94)';
          ctx.fillRect(d.x - 78, dy - 162, 156, 22);
          ctx.strokeRect(d.x - 78, dy - 162, 156, 22);
          ctx.fillStyle = '#FFD166';
          ctx.font = 'bold 10px "JetBrains Mono"';
          ctx.textAlign = 'center';
          ctx.fillText(`🔒 БОЧКА: КЛЮЧИ ${kCount}/3`, d.x, dy - 147);
        } else {
          ctx.strokeStyle = '#80ED99';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(d.x - 6, dy - 135, 12, 135);
          ctx.fillStyle = '#80ED99';
          ctx.font = 'bold 10px "JetBrains Mono"';
          ctx.textAlign = 'center';
          ctx.fillText('🔓 ОТКРЫТО!', d.x, dy - 142);
        }
      } else if (d.closed) {
        ctx.fillStyle = '#3B2318';
        ctx.strokeStyle = '#D4A843';
        ctx.lineWidth = 2.5;
        ctx.fillRect(d.x - 7, dy - 108, 14, 108);
        ctx.strokeRect(d.x - 7, dy - 108, 14, 108);
        ctx.fillStyle = '#D4A843';
        ctx.fillRect(d.x - 18, dy - 120, 36 * (d.hp / 5), 5);
      } else {
        ctx.strokeStyle = 'rgba(140,160,180,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x - 4, dy - 104, 8, 104);
      }
      ctx.restore();
    });
  }

  /* Отрисовка Тайного Помещения с Главной Бочкой, где нужно стучать и где Пацана ловят и запирают в бочку */
  drawSecretBarrelRoom(ctx) {
    const rx = FINAL_ROOM_X;
    const ry = SKY_H + FH;
    const rw = WORLD_W - FINAL_ROOM_X - 18;
    const rh = FH - 12;
    const by = floorY(1);
    const bx = FINAL_BARREL_X + Math.sin(this.t * 48) * 6 * this.finale.barrelShake;

    ctx.save();
    /* Алый прожекторный свет внутри Тайного Помещения с Бочкой */
    const roomGrad = ctx.createRadialGradient(FINAL_BARREL_X, by - 65, 12, FINAL_BARREL_X, by - 65, 185);
    roomGrad.addColorStop(0, 'rgba(228, 92, 54, 0.34)');
    roomGrad.addColorStop(0.55, 'rgba(212, 168, 67, 0.14)');
    roomGrad.addColorStop(1, 'rgba(10, 14, 20, 0)');
    ctx.fillStyle = roomGrad;
    ctx.fillRect(rx, ry, rw, rh);

    ctx.strokeStyle = '#FFD166';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(rx + 2, ry + 4, rw - 4, rh - 4);

    /* Вывеска над Тайным Помещением */
    ctx.fillStyle = 'rgba(12, 16, 22, 0.94)';
    ctx.fillRect(rx + 18, ry + 10, rw - 36, 22);
    ctx.strokeRect(rx + 18, ry + 10, rw - 36, 22);
    ctx.fillStyle = '#FFD166';
    ctx.font = 'bold 10.5px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('🛢️ ТАЙНОЕ ПОМЕЩЕНИЕ С БОЧКОЙ', rx + rw * 0.5, ry + 25);

    /* Подиум и Главная Бочка Финала */
    ctx.fillStyle = '#2A333E';
    ctx.fillRect(FINAL_BARREL_X - 48, by - 8, 96, 10);
    ctx.strokeStyle = '#D4A843';
    ctx.strokeRect(FINAL_BARREL_X - 48, by - 8, 96, 10);

    const sh = sheets.barrels;
    const fbh = 88;
    const isLockedInside = this.finale.stage === 'captured_cutscene' && this.finale.cutsceneT >= 3.4;
    if (sh) {
      /* Когда Пацана уже опустили внутрь бочки (cutsceneT >= 3.4) — из бочки торчит его рука (спрайт 'hand')! */
      const spriteKey = isLockedInside ? 'hand' : 'igor';
      drawFrame(ctx, sh, barrelRect(sh, spriteKey), bx, by - 6, spriteKey === 'hand' ? fbh * 1.15 : fbh);
      drawBarrelWrappedLabel(ctx, bx, by - 6, fbh, isLockedInside ? 'В БОЧКЕ!' : 'ФИНАЛ');
    }

    /* Если Пацана уже опустили в бочку (cutsceneT >= 3.4) — рисуем кованые цепи с замком и выводим текст! */
    if (isLockedInside) {
      ctx.strokeStyle = '#DCE4EC';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx - 28, by - 62);
      ctx.lineTo(bx + 28, by - 26);
      ctx.moveTo(bx + 28, by - 62);
      ctx.lineTo(bx - 28, by - 26);
      ctx.moveTo(bx - 30, by - 44);
      ctx.lineTo(bx + 30, by - 44);
      ctx.stroke();

      ctx.fillStyle = 'rgba(145, 24, 24, 0.96)';
      ctx.strokeStyle = '#FFD166';
      ctx.lineWidth = 2;
      ctx.fillRect(bx - 140, by - 134, 280, 26);
      ctx.strokeRect(bx - 140, by - 134, 280, 26);
      ctx.fillStyle = '#FFF3D6';
      ctx.font = 'bold 10.5px "JetBrains Mono"';
      ctx.fillText('⛓️ ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ!', bx, by - 117);
    } else if (this.finale.stage === 'captured_cutscene') {
      /* Подпись во время визуального опускания Пацана в бочку (0..3.4с) */
      const phaseTxt = this.finale.cutsceneT < 1.3
        ? '🚨 ОХРАНА ВРЫВАЕТСЯ В ОТСЕК!'
        : '🛢️ ОПУСКАЮТ ПРЯМО В БОЧКУ!..';
      ctx.fillStyle = 'rgba(10, 14, 20, 0.94)';
      ctx.strokeStyle = '#FF595E';
      ctx.lineWidth = 1.8;
      ctx.fillRect(bx - 116, by - 156, 232, 24);
      ctx.strokeRect(bx - 116, by - 156, 232, 24);
      ctx.fillStyle = '#FFD166';
      ctx.font = 'bold 10.5px "JetBrains Mono"';
      ctx.fillText(phaseTxt, bx, by - 140);
    } else {
      /* Индикатор ударов по Главной Бочке */
      const promptTxt = this.quests.finalDoorOpen
        ? `💥 СТУЧИ ПО БОЧКЕ ${this.actPrompt()} (${this.finale.hits}/${this.finale.maxHits})`
        : `🔒 СОБЕРИ 3 КЛЮЧА (${this.keysCollectedCount()}/3)`;
      ctx.fillStyle = 'rgba(10, 14, 20, 0.92)';
      ctx.strokeStyle = this.quests.finalDoorOpen ? '#80ED99' : '#FFD166';
      ctx.lineWidth = 1.5;
      ctx.fillRect(bx - 98, by - 116, 196, 20);
      ctx.strokeRect(bx - 98, by - 116, 196, 20);
      ctx.fillStyle = this.quests.finalDoorOpen ? '#80ED99' : '#FFD166';
      ctx.font = 'bold 10px "JetBrains Mono"';
      ctx.fillText(promptTxt, bx, by - 102);
    }
    ctx.restore();
  }

  draw(ctx) {
    const b = this.boy;
    const v = this.view || { x: 0, y: 0, w: BASE_W, h: BASE_H };
    const { vw, vh } = this.viewSize();
    const scaleX = v.w / vw;
    const scaleY = v.h / vh;

    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 9 * this.shake, (Math.random() - 0.5) * 9 * this.shake);
    }
    ctx.fillStyle = '#040810';
    ctx.fillRect(v.x - 200, v.y - 200, v.w + 400, v.h + 400);

    ctx.translate(v.x, v.y);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));

    /* 1. Ночное небо */
    this.drawNightSkyAndBirds(ctx);

    /* 2. Здания и твёрдые стальные полы каждого этажа */
    this.drawWorldBuildings(ctx);

    /* 3. Внутренние отсеки, водопады, задвижки, 3 ключа, лестницы и Тайное Помещение с Бочкой */
    this.drawFactoryInteriorsAndProps(ctx);

    /* 4. Бобины киноплёнки */
    this.reels.forEach((r) => {
      const ry = floorY(r.floor) - 12;
      ctx.fillStyle = '#D49A45';
      ctx.beginPath();
      ctx.arc(r.x, ry, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#070A0E';
      ctx.beginPath();
      ctx.arc(r.x, ry, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    /* 5. Активная звуковая приманка */
    if (this.lure) {
      const ly = floorY(this.lure.floor) - 10;
      const waveR = 16 + ((this.t * 60) % 55);
      ctx.save();
      ctx.strokeStyle = 'rgba(100,200,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.lure.x, ly, waveR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#64C8FF';
      ctx.font = 'bold 11px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(this.lure.label, this.lure.x, ly - 20);
      ctx.restore();
    }

    /* 6. Световые конусы фонариков */
    const g = this.girl;
    const by = b.y;
    if (g.actor.state === 'flash') {
      g.actor.beam(ctx, g.x, g.y, charH, 140, '236,228,210', 0.1, 32);
    }
    this.enemies.forEach((e) => {
      const h = e.dog ? dogH : charH;
      if (!e.dog && !e.climbing) {
        e.actor.beam(ctx, e.x, e.y, h, e.alert ? 190 : 155, e.alert ? '212,62,56' : '236,210,155', e.alert ? 0.18 : 0.13, 38);
      }
    });
    if (!b.hidden && !b.climbing) {
      this.boyActor.beam(ctx, b.x, by, charH, 165, '185,220,245', 0.13, 44);
    }

    /* 7. Девушка в цеху */
    drawShadow(ctx, g.x, g.y, 22);
    g.actor.draw(ctx, g.x, g.y, charH);

    /* 8. Преследователи (стоят строго на твёрдых полах и плавно лазают по лестницам) */
    this.enemies.forEach((e) => {
      const h = e.dog ? dogH : charH;
      if (!e.climbing) drawShadow(ctx, e.x, e.y, h * 0.28);
      e.actor.draw(ctx, e.x, e.y, h);
      if (e.alert || e.lureX !== null) {
        ctx.fillStyle = e.lureX !== null ? '#64C8FF' : '#D4423E';
        ctx.font = 'bold 14px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(e.lureX !== null ? '?!' : '!', e.x, e.y - h - 6);
      }
    });

    /* 9. Главный герой (Пацан) с плавной вертикальной координатой b.y и визуальным погружением в Бочку */
    const shBarrels = sheets.barrels;
    if (this.caughtAnim) {
      const ca = this.caughtAnim;
      const cby = floorY(ca.floor);
      const cbx = ca.barrelX + Math.sin(this.t * 48) * (ca.t >= 1.85 ? 5 : 2);
      const lockedNow = ca.t >= 1.85;
      if (shBarrels) {
        drawFrame(ctx, shBarrels, barrelRect(shBarrels, lockedNow ? 'hand' : 'igor'), cbx, cby, lockedNow ? barrelH * 1.12 : barrelH);
        drawBarrelWrappedLabel(ctx, cbx, cby, barrelH, lockedNow ? 'В БОЧКЕ!' : 'ЛОВУШКА');
      }
      if (!b.hidden) {
        this.boyActor.draw(ctx, b.x, by, charH);
        /* Если Пацан уже опускается внутрь горловины бочки — перекрываем нижнюю часть передней стенкой бочки! */
        if (ca.t >= 1.22 && shBarrels) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cbx - 60, cby - barrelH + 14, 120, barrelH);
          ctx.clip();
          drawFrame(ctx, shBarrels, barrelRect(shBarrels, 'igor'), cbx, cby, barrelH);
          drawBarrelWrappedLabel(ctx, cbx, cby, barrelH, 'В БОЧКЕ!');
          ctx.restore();
        }
      }
      if (lockedNow) {
        ctx.strokeStyle = '#DCE4EC';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cbx - 24, cby - 58);
        ctx.lineTo(cbx + 24, cby - 22);
        ctx.moveTo(cbx + 24, cby - 58);
        ctx.lineTo(cbx - 24, cby - 22);
        ctx.stroke();

        ctx.fillStyle = 'rgba(145, 24, 24, 0.96)';
        ctx.strokeStyle = '#FFD166';
        ctx.lineWidth = 2;
        ctx.fillRect(cbx - 134, cby - 126, 268, 24);
        ctx.strokeRect(cbx - 134, cby - 126, 268, 24);
        ctx.fillStyle = '#FFF3D6';
        ctx.font = 'bold 10.5px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText('⛓️ ТЕБЯ СХВАТИЛИ И ЗАПЕРЛИ В БОЧКУ!', cbx, cby - 110);
      }
    } else if (b.hidden) {
      if (this.finale.stage !== 'captured_cutscene') {
        const spotName = b.hideSpot ? b.hideSpot.name : 'БОЧКА';
        ctx.fillStyle = '#4A7A8C';
        ctx.fillRect(b.x - 24, by - barrelH - 26, 48 * (b.air / 100), 5);
        ctx.fillStyle = '#ECE4D2';
        ctx.font = 'bold 10px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(`👁️ СПРЯТАН (${spotName})`, b.x, by - barrelH - 32);
      }
    } else {
      if (!b.climbing && this.finale.stage !== 'captured_cutscene') drawShadow(ctx, b.x, by, 22);
      /* При плавном подъёме по лестнице рисуем подсветку ступенек под руками и ногами Пацана */
      if (b.climbing) {
        ctx.save();
        ctx.strokeStyle = '#FFD166';
        ctx.lineWidth = 3;
        const rungY = Math.round(by / 14) * 14;
        ctx.beginPath();
        ctx.moveTo(b.x - 12, rungY);
        ctx.lineTo(b.x + 12, rungY);
        ctx.moveTo(b.x - 12, rungY - 28);
        ctx.lineTo(b.x + 12, rungY - 28);
        ctx.stroke();
        ctx.restore();
      }
      this.boyActor.draw(ctx, b.x, by, charH);

      /* В финальной сцене, когда Пацана опускают сверху прямо в Главную Бочку (2.15..3.4с) — передняя стенка бочки перекрывает его ноги! */
      if (this.finale.stage === 'captured_cutscene' && this.finale.cutsceneT >= 2.15 && this.finale.cutsceneT < 3.4 && shBarrels) {
        const fby = floorY(1);
        const fbx = FINAL_BARREL_X + Math.sin(this.t * 48) * 6 * this.finale.barrelShake;
        ctx.save();
        ctx.beginPath();
        ctx.rect(fbx - 65, fby - 78, 130, 82);
        ctx.clip();
        drawFrame(ctx, shBarrels, barrelRect(shBarrels, 'igor'), fbx, fby - 6, 88);
        drawBarrelWrappedLabel(ctx, fbx, fby - 6, 88, 'ФИНАЛ');
        ctx.restore();
      }

      ctx.fillStyle = '#D4A843';
      ctx.font = 'bold 10px "JetBrains Mono"';
      ctx.textAlign = 'center';
      const boyTag = this.finale.stage === 'captured_cutscene'
        ? (this.finale.cutsceneT < 1.3 ? '😱 ОХРАНА!' : '🛢️ В БОЧКУ!')
        : (b.climbing ? '▲▼ ЛЕСТНИЦА' : '▼ ТЫ');
      ctx.fillText(boyTag, b.x, by - charH - 12);
      if (b.seen > 0) {
        ctx.fillStyle = '#D4423E';
        ctx.fillRect(b.x - 24, by - charH - 8, 48 * Math.min(1, b.seen), 5);
      }
    }

    /* Маркер точки назначения при тапе на телефоне / клике мышью */
    if (b.targetX !== null) {
      const tf = b.targetFloor !== null ? b.targetFloor : b.floor;
      const ty = floorY(tf);
      const pulseR = 12 + Math.sin(this.t * 9) * 3;
      ctx.save();
      ctx.strokeStyle = b.pendingAction ? '#FFD166' : '#64DFDF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(b.targetX, ty - 3, pulseR, pulseR * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    /* Искры от ударов по Главной Бочке и задвижкам */
    ctx.fillStyle = '#FFD166';
    this.sparks.forEach((s) => ctx.fillRect(s.x, s.y, 4, 4));

    /* Всплывающие тексты */
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "JetBrains Mono"';
    this.floats.forEach((f) => {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = '#FFD166';
      ctx.fillText(f.txt, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    /* ---------- КОМПАКТНАЯ ВЕРХНЯЯ ПАНЕЛЬ ЗАДАНИЯ И ЧЕК-ЛИСТА (ВВЕРХУ ЭКРАНА, ЧТОБЫ НИЗ И ПЕРСОНАЖ БЫЛИ ПОЛНОСТЬЮ ОТКРЫТЫ!) ---------- */
    const qSteps = [
      this.quests.key1 ? '✓Ключ1' : '○Ключ1',
      this.quests.sec3LightOff ? '✓Свет1' : '○Свет1',
      this.quests.valve1Closed ? '✓Задв1' : '○Задв1',
      this.quests.key2 ? '✓Ключ2' : '○Ключ2',
      this.quests.corpbLightOff ? '✓Свет2' : '○Свет2',
      this.quests.valve2Closed ? '✓Задв2' : '○Задв2',
      this.quests.key3 ? '✓Ключ3' : '○Ключ3',
      this.finale.hits > 0 ? `🛢️${this.finale.hits}/${this.finale.maxHits}` : '○Бочка',
    ].join(' · ');

    const narrow = v.w < 620;
    const cx = v.x + v.w / 2;
    const topOffset = narrow ? (S.godMode ? 208 : 158) : (S.godMode ? 68 : 48);
    const barW = Math.min(740, v.w - 16);
    ctx.save();
    const activeBanner = (this.msgT > 0 && this.msg) ? this.msg : this.currentObjectiveText();
    if (activeBanner) {
      ctx.fillStyle = 'rgba(7,10,14,0.88)';
      ctx.fillRect(cx - barW / 2, v.y + topOffset, barW, 20);
      ctx.strokeStyle = 'rgba(255,209,102,0.82)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - barW / 2, v.y + topOffset, barW, 20);
      ctx.fillStyle = '#FFD166';
      ctx.font = narrow ? 'bold 8.5px "JetBrains Mono"' : 'bold 9.5px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(activeBanner, cx, v.y + topOffset + 13.5, barW - 12);
    }

    ctx.fillStyle = 'rgba(7,10,14,0.82)';
    ctx.strokeStyle = 'rgba(212,168,67,0.5)';
    ctx.lineWidth = 1;
    ctx.fillRect(cx - barW / 2, v.y + topOffset + 22, barW, 17);
    ctx.strokeRect(cx - barW / 2, v.y + topOffset + 22, barW, 17);
    ctx.fillStyle = '#ECE4D2';
    ctx.font = narrow ? '8px "JetBrains Mono", monospace' : '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(qSteps, cx, v.y + topOffset + 33.5, barW - 10);
    ctx.restore();
  }
}
