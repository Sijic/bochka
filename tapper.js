import { S, save, currentTool, CARDS, skillDuration, skillEnergyCost, spendSkillEnergy } from './state.js';
import { sheets, barrelRect, oceanRect, drawFrame, drawBarrelFallback } from './assets.js';
import { Actor, drawShadow, drawCone, moveX, drawBarrelWrappedLabel, drawBarrelWrappedBadge } from './sprites.js';
import * as audio from './audio.js';
import { walkerLine, speak, t, lang } from './i18n.js';

const W = 960, H = 540;
const NAMES = ['igor', 'anna', 'daniyar', 'mark', 'oleg', 'artur'];

/* Пул постоянно меняющихся российских имён для отрисовки на бочках */
export const RU_BARREL_NAMES = [
  'АЛЕКСЕЙ', 'ДМИТРИЙ', 'СЕРГЕЙ', 'АНДРЕЙ', 'МАКСИМ', 'АРТЁМ', 'ИВАН', 'МИХАИЛ',
  'НИКИТА', 'КИРИЛЛ', 'ЕГОР', 'ПАВЕЛ', 'РОМАН', 'ВЛАДИМИР', 'ДЕНИС', 'ТИМОФЕЙ',
  'МАТВЕЙ', 'ГЛЕБ', 'ВИКТОР', 'РУСЛАН', 'КОНСТАНТИН', 'ЯРОСЛАВ', 'ИЛЬЯ', 'ФЁДОР',
  'ВАДИМ', 'БОРИС', 'СТЕПАН', 'ЛЕОНИД', 'ГРИГОРИЙ', 'ВАЛЕРИЙ', 'НИКОЛАЙ', 'ЮРИЙ',
  'ВЯЧЕСЛАВ', 'СТАНИСЛАВ', 'ГЕННАДИЙ', 'ЕВГЕНИЙ', 'ЗАХАР', 'СЕМЁН', 'ФИЛИПП', 'МАКАР',
  'ЕКАТЕРИНА', 'НАТАЛЬЯ', 'ОЛЬГА', 'ТАТЬЯНА', 'ЕЛЕНА', 'МАРИЯ', 'ДАРЬЯ', 'ПОЛИНА',
  'СВЕТЛАНА', 'ЮЛИЯ', 'КСЕНИЯ', 'ВЕРОНИКА', 'АЛИНА', 'ВАЛЕРИЯ', 'НАДЕЖДА',
];

/* Патрульные уровней завода и церкви (Пацан появляется ТОЛЬКО как управляемый герой в секретном уровне «Ночная смена»!):
   1: Отец, 2: Сообщник, 3: Девушка, 4: Овчарка Рекс, 5: Священник, 6: Отец и Священник (Алтарь),
   + 7-й предфинальный уровень «Достучаться до небес» перед секретным 8-м финальным уровнем («Ночная смена») */
const LV = [
  {
    n: 4, goal: 65, sec: 65, shuffle: 0, window: 2.7, charKey: 'father', titleKey: 'charLvl1',
    chainCount: 2, airDrain: 2.6,
    mechanicTitle: 'УР. 01 · АКУСТИЧЕСКИЙ ПОИСК И ЦЕПИ (ЦЕЛЬ: 65 УДАРОВ)',
    mechanicRule: 'Слушай глухой стук, сбей цепи инструментом (после снятия не стучи!), следи за запасом прочности бочек и замирай под лучом.',
  },
  {
    n: 5, goal: 95, sec: 72, shuffle: 7.0, window: 2.4, charKey: 'capguy', titleKey: 'charLvl2',
    chainCount: 2, airDrain: 2.9,
    mechanicTitle: 'УР. 02 · ПОДВИЖНЫЙ КОНВЕЙЕР И ПРАНК ×3 (ЦЕЛЬ: 95 УДАРОВ)',
    mechanicRule: 'Бочки быстрее меняются местами! Набивай серию без ошибок (от 2 ошибок бочка падает!), лови телефон пранка ×3 и руби цепи.',
  },
  {
    n: 6, goal: 125, sec: 78, shuffle: 5.8, window: 2.2, charKey: 'girl', titleKey: 'charLvl3',
    chainCount: 2, airDrain: 3.4,
    mechanicTitle: 'УР. 03 · ВСПЫШКА КАМЕРЫ И ОХОТА ЗА O₂ (ЦЕЛЬ: 125 УДАРОВ)',
    mechanicRule: 'Кислород тает быстрее! Лови пузырьки 💨 ВОЗДУХ на стоящих бочках, меняй бочки до истощения и берегись вспышки смартфона.',
  },
  {
    n: 8, goal: 155, sec: 85, shuffle: 5.0, window: 2.0, charKey: 'dog', titleKey: 'charLvl4',
    chainCount: 3, airDrain: 3.2,
    mechanicTitle: 'УР. 04 · СКОРОСТНОЙ НЮХ ОВЧАРКИ РЕКСА (ЦЕЛЬ: 155 УДАРОВ)',
    mechanicRule: 'Овчарка Рекс чует стучащую бочку, но при промахе бросается на звук со скоростью ×2! Набей 155 точных попаданий.',
  },
  {
    n: 10, goal: 190, sec: 92, shuffle: 4.4, window: 1.85, charKey: 'priest', titleKey: 'charLvl6',
    chainCount: 3, airDrain: 3.5, blackout: true,
    mechanicTitle: 'УР. 05 · ЗАТМЕНИЯ В ЦЕРКОВНОМ ПОДВАЛЕ (ЦЕЛЬ: 190 УДАРОВ)',
    mechanicRule: 'Свет в подвале гаснет волнами! Ищи бочки при свечах пастора, применяй карточки навыков и набей 190 ударов.',
  },
  {
    n: 10, goal: 24, sec: 125, shuffle: 4.2, window: 1.8, charKey: 'priest', titleKey: 'charLvl1',
    chainCount: 3, airDrain: 2.8, isAltarFather: true,
    mechanicTitle: 'УР. 06 · АЛТАРЬ · СПАСТИ ОТЦА ИЗ ЦЕПЕЙ НА СТЕНЕ (24 УДАРА)',
    mechanicRule: 'Отец прикован к стене алтаря (24 удара)! Каждый удар по цепям Отца отнимает много очков — когда очки кончаются, копи их на бочках или бей дальше ценой своих ❤️ ЖИЗНЕЙ, чтобы спасти Отца!',
  },
  {
    n: 4, goal: 115, sec: 90, shuffle: 0, window: 2.0, charKey: 'ocean', titleKey: 'charLvl7', isOcean: true,
    chainCount: 1, airDrain: 2.8,
    mechanicTitle: 'УР. 07 · ДОСТУЧАТЬСЯ ДО НЕБЕС · КРЫША ЗАВОДА И МОРЕ (115 УДАРОВ)',
    mechanicRule: 'На крыше завода над закатным морем КАРТОЧКИ УСИЛЕНИЯ НЕ РАБОТАЮТ! Стучи по бочке «ТИЛЬ», только пока герой смотрит на море — когда он повернулся и смотрит, СТУЧАТЬ НЕЛЬЗЯ ВООБЩЕ!',
  },
];

export const levelConfig = (level) => {
  if (level <= LV.length) return LV[Math.max(0, level - 1)];
  const extra = level - LV.length;
  return {
    n: Math.min(16, 12 + extra * 2),
    goal: 220 + extra * 35,
    sec: Math.min(95, 78 + extra * 3),
    shuffle: Math.max(2.4, 3.8 - extra * 0.25),
    window: Math.max(1.2, 1.7 - extra * 0.08),
    charKey: WALKERS[(level - 1) % WALKERS.length],
    titleKey: 'charLvl6',
    chainCount: 3,
    airDrain: 3.5,
    mechanicTitle: `УР. 0${level} · ЭКСТРЕМАЛЬНЫЙ ЦЕХ`,
    mechanicRule: 'Максимальная охрана, быстрая смена бочек и 3 бочки в цепях!',
  };
};
/* Все 5 патрульных персонажей цеха (БЕЗ пацана — пацан ходит только в секретном финальном уровне «Ночная смена»!) */
export const WALKERS = ['father', 'capguy', 'girl', 'dog', 'priest'];

/* Отрисовка 10 уровней курсора-инструмента (1: Рука, 2: Молоток, 3: Монтировка, 4: Лопата, 5: Ключ, 6: Топор, 7: Кувалда, 8: Кирка, 9: Болторез, 10: Отбойный молоток) */
export function drawToolCursor(ctx, x, y, toolLvl = 1, swing = 0, scale = 1, hunted = false) {
  ctx.save();
  ctx.translate(x, y);
  const strikeAngle = -0.35 + Math.sin(swing * Math.PI) * 0.95;
  ctx.rotate(strikeAngle);
  ctx.scale(scale, scale);

  /* Тень/контур для читаемости на любом фоне */
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (toolLvl === 1) {
    /* 1. РУКА (КУЛАК) */
    ctx.fillStyle = '#1B1F26';
    ctx.strokeStyle = '#D4A843';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-12, -10, 24, 22, 6);
    ctx.fill();
    ctx.stroke();
    /* Костяшки пальцев */
    ctx.fillStyle = '#D8B49A';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-9 + i * 5, -8, 4, 6);
    }
    /* Манжета перчатки */
    ctx.fillStyle = '#9E5A34';
    ctx.fillRect(-10, 8, 20, 6);
  } else if (toolLvl === 2) {
    /* 2. МОЛОТОК */
    ctx.fillStyle = '#8C5832';
    ctx.strokeStyle = '#12151A';
    ctx.lineWidth = 2;
    ctx.fillRect(-3, -4, 7, 34);
    ctx.strokeRect(-3, -4, 7, 34);
    /* Боёк молотка */
    ctx.fillStyle = '#9AA6B2';
    ctx.strokeStyle = '#ECE4D2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-16, -14);
    ctx.lineTo(14, -14);
    ctx.lineTo(18, -6);
    ctx.lineTo(-16, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (toolLvl === 3) {
    /* 3. МОНТИРОВКА (ФОМКА-ГВОЗДОДЁР) */
    ctx.strokeStyle = '#12151A';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(4, 28);
    ctx.lineTo(-4, -12);
    ctx.quadraticCurveTo(-8, -24, -20, -18);
    ctx.stroke();

    ctx.strokeStyle = '#B8342A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, 28);
    ctx.lineTo(-4, -12);
    ctx.quadraticCurveTo(-8, -24, -20, -18);
    ctx.stroke();
    /* Стальной плоский зуб-гвоздодёр */
    ctx.fillStyle = '#DCE2E8';
    ctx.beginPath();
    ctx.moveTo(-18, -21);
    ctx.lineTo(-25, -15);
    ctx.lineTo(-16, -13);
    ctx.closePath();
    ctx.fill();
  } else if (toolLvl === 4) {
    /* 4. ШТЫКОВАЯ ЛОПАТА */
    ctx.fillStyle = '#8C5832';
    ctx.fillRect(-2.5, -6, 5, 34);
    /* Рукоять D-образная */
    ctx.strokeStyle = '#9E5A34';
    ctx.lineWidth = 3;
    ctx.strokeRect(-6, 24, 12, 6);
    /* Стальное полотно лопаты */
    ctx.fillStyle = '#7E8C9B';
    ctx.strokeStyle = '#ECE4D2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.lineTo(13, -6);
    ctx.lineTo(11, -22);
    ctx.lineTo(0, -30);
    ctx.lineTo(-11, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (toolLvl === 5) {
    /* 5. ТЯЖЁЛЫЙ ГАЗОВЫЙ КЛЮЧ */
    ctx.fillStyle = '#9E2A2B';
    ctx.strokeStyle = '#12151A';
    ctx.lineWidth = 2;
    ctx.fillRect(-4, -6, 8, 36);
    ctx.strokeRect(-4, -6, 8, 36);
    /* Губки газового ключа */
    ctx.fillStyle = '#A8B2BD';
    ctx.beginPath();
    ctx.moveTo(-14, -22);
    ctx.lineTo(10, -22);
    ctx.lineTo(10, -14);
    ctx.lineTo(-4, -14);
    ctx.lineTo(-4, -10);
    ctx.lineTo(8, -10);
    ctx.lineTo(8, -4);
    ctx.lineTo(-14, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (toolLvl === 6) {
    /* 6. ПОЖАРНЫЙ ТОПОР */
    ctx.fillStyle = '#7A4928';
    ctx.fillRect(-3, -10, 6, 40);
    /* Обух и лезвие */
    ctx.fillStyle = '#B8292B';
    ctx.beginPath();
    ctx.moveTo(3, -18);
    ctx.lineTo(14, -14);
    ctx.lineTo(3, -10);
    ctx.fill();
    ctx.fillStyle = '#DCE2E8';
    ctx.strokeStyle = '#9E2A2B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -22);
    ctx.quadraticCurveTo(-22, -26, -24, -14);
    ctx.quadraticCurveTo(-22, -4, -3, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (toolLvl === 7) {
    /* 7. КУВАЛДА */
    ctx.fillStyle = '#6E4223';
    ctx.fillRect(-3.5, -6, 7, 40);
    ctx.fillStyle = '#4A5562';
    ctx.strokeStyle = '#D4A843';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-22, -22, 44, 18, 3);
    ctx.fill();
    ctx.stroke();
  } else if (toolLvl === 8) {
    /* 8. КИРКА */
    ctx.fillStyle = '#7A4928';
    ctx.fillRect(-3, -8, 6, 40);
    ctx.strokeStyle = '#DCE2E8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-26, -10);
    ctx.quadraticCurveTo(0, -24, 26, -10);
    ctx.stroke();
  } else if (toolLvl === 9) {
    /* 9. ГИДРАВЛИЧЕСКИЙ БОЛТОРЕЗ */
    ctx.strokeStyle = '#B8342A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-10, 28); ctx.lineTo(-3, -6);
    ctx.moveTo(10, 28); ctx.lineTo(3, -6);
    ctx.stroke();
    ctx.fillStyle = '#C8D0D8';
    ctx.beginPath();
    ctx.moveTo(-12, -8); ctx.lineTo(-2, -24); ctx.lineTo(0, -8);
    ctx.moveTo(12, -8); ctx.lineTo(2, -24); ctx.lineTo(0, -8);
    ctx.fill();
  } else {
    /* 10. ОТБОЙНЫЙ МОЛОТОК (ПНЕВМОПРОБОЙНИК) */
    ctx.fillStyle = '#D4A843';
    ctx.strokeStyle = '#12151A';
    ctx.lineWidth = 2;
    /* Ручки Т-образные */
    ctx.fillRect(-18, 16, 36, 6);
    /* Пневмокорпус */
    ctx.fillRect(-9, -8, 18, 26);
    ctx.strokeRect(-9, -8, 18, 26);
    /* Бронебойная пика */
    ctx.fillStyle = '#ECE4D2';
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.lineTo(4, -8);
    ctx.lineTo(0, -32);
    ctx.closePath();
    ctx.fill();
  }

  if (hunted) {
    ctx.strokeStyle = '#9E2A2B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -6, 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/* Отрисовка навыка-умения В РУКЕ вместо молотка/инструмента:
   показывает гаджет навыка, прицел наведения («НАВЕДИ НА ПЕРСОНАЖА ИЛИ БОЧКУ») или круговой таймер действия до окончания навыка */
export function drawSkillCursor(ctx, x, y, handSkill, swing = 0, t = 0) {
  if (!handSkill) return;
  const sk = handSkill.skillKey;
  const accent = handSkill.accent || '#64DFDF';
  const isArmed = handSkill.state === 'armed';
  const ratio = handSkill.maxDur > 0 ? Math.max(0, Math.min(1, handSkill.timeLeft / handSkill.maxDur)) : 1;

  ctx.save();
  ctx.translate(x, y);

  /* 1. Прицельное кольцо (если навык взят в руку и ждёт наведения) ИЛИ круговая шкала остатка времени */
  const pulseR = 26 + Math.sin(t * 7) * 3;
  if (isArmed) {
    ctx.save();
    ctx.rotate(t * 1.4);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(0, -6, pulseR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    /* Риски прицела по 4 сторонам */
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (pulseR - 5), -6 + Math.sin(a) * (pulseR - 5));
      ctx.lineTo(Math.cos(a) * (pulseR + 5), -6 + Math.sin(a) * (pulseR + 5));
      ctx.stroke();
    }
    ctx.restore();
  } else {
    /* Фоновое кольцо и убывающая дуга времени работы навыка */
    ctx.strokeStyle = 'rgba(10,14,20,0.85)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -6, 27, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = handSkill.timeLeft < 2.0 ? '#FF5A5F' : accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -6, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
  }

  /* 2. Светящееся ядро и корпус устройства навыка в руке */
  ctx.save();
  const castTilt = -0.18 + Math.sin(swing * Math.PI) * 0.55;
  ctx.rotate(castTilt);

  const glow = ctx.createRadialGradient(0, -8, 2, 0, -8, 24);
  glow.addColorStop(0, accent);
  glow.addColorStop(0.55, 'rgba(20,28,38,0.45)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -8, 24, 0, Math.PI * 2);
  ctx.fill();

  /* Рукоять/перчатка техно-умения */
  ctx.fillStyle = '#181E26';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(-7, 4, 14, 18, 4);
  ctx.fill();
  ctx.stroke();

  /* Специальная форма излучателя под конкретный навык */
  if (sk === 'freeze') {
    /* Мифическое крио-ядро «Абсолютная Заморозка ★» с ледяными кристаллами */
    ctx.fillStyle = 'rgba(0, 229, 255, 0.28)';
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -10, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#E0FBFC';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const a = t * 2.4 + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -15, -10 + Math.sin(a) * -15);
      ctx.lineTo(Math.cos(a) * 15, -10 + Math.sin(a) * 15);
      ctx.stroke();
    }
  } else if (sk === 'shrink') {
    /* Стальная бочка в руке — чтобы надеть её прямо на охранника (только ноги торчат!) */
    ctx.fillStyle = '#384654';
    ctx.strokeStyle = '#64DFDF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-11, -24, 22, 26, 4);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#D4A843';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-11, -17);
    ctx.lineTo(11, -17);
    ctx.moveTo(-11, -6);
    ctx.lineTo(11, -6);
    ctx.stroke();
  } else if (sk === 'overcharge') {
    /* Пылающий факел «Огонь из бочки» */
    const flick = Math.sin(t * 22) * 3;
    ctx.fillStyle = '#FF5400';
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.quadraticCurveTo(-13, -18, 0 + flick, -28);
    ctx.quadraticCurveTo(13, -18, 11, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.arc(0, -11, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (sk === 'distract') {
    /* Рупор-громкоговоритель голосового пранка со звуковыми волнами */
    ctx.fillStyle = '#F4A261';
    ctx.strokeStyle = '#12151A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-16, -18);
    ctx.lineTo(14, -22);
    ctx.lineTo(6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#FFD166';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -14, 16 + ((t * 18) % 8), -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
  } else if (sk === 'magnet') {
    /* Подковообразный электромагнит с молниями */
    ctx.strokeStyle = '#F72585';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -8, 11, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
  } else {
    /* Энергетическая сфера с иконкой навыка */
    ctx.fillStyle = 'rgba(12,16,22,0.92)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -10, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.font = '16px "JetBrains Mono", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(handSkill.icon || '⚡', 0, -10);
  ctx.restore();

  /* 3. Компактная плашка статуса прямо под рукой */
  const targetHintMap = {
    shrink: '🎯 НАЖМИ НА ОХРАННИКА: ОДЕТЬ БОЧКУ',
    freeze: '🎯 НАЖМИ: ЗАМОРОЗИТЬ ВСЕХ ★',
    stealth: '🎯 НАЖМИ: ВЫРУБИТЬ ФОНАРИ',
    distract: '🎯 ТКНИ КУДА УГОДНО: ЗВУК ПРАНКА',
    overcharge: '🎯 НАЖМИ НА БОЧКУ: ПУСТИТЬ ОГОНЬ',
    jackpot: '🎯 ВЫБИРАЙ ПРИЗОВЫЕ БОЧКИ',
  };
  const labelTxt = isArmed
    ? (targetHintMap[sk] || `🎯 НАВЕДИ: ГЕРОЙ / БОЧКА`)
    : `${handSkill.icon} ${handSkill.timeLeft.toFixed(1)}с`;
  ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
  const tw = ctx.measureText(labelTxt).width + 12;
  ctx.fillStyle = 'rgba(8,11,16,0.94)';
  ctx.fillRect(-tw / 2, 24, tw, 16);
  ctx.strokeStyle = isArmed ? '#D4A843' : (handSkill.timeLeft < 2.0 ? '#FF5A5F' : accent);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-tw / 2, 24, tw, 16);
  ctx.fillStyle = '#ECE4D2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(labelTxt, 0, 35.5);

  ctx.restore();
}

export class Tapper {
  constructor(events) {
    this.ev = events; /* { onWin(points), onTrap(), onLose(reason), toast(msg) } */
    this.active = false; this.paused = false;
    this.barrels = []; this.floats = []; this.sparks = []; this.chainLinks = [];
    this.skillBeams = [];
    this.handSkill = null;
    this.levelPoints = 0; this.progress = 0; this.air = 100; this.time = 0;
    this.combo = 1; this.comboUntil = 0; this.streak = 0; this.idle = 0; this.shuffleT = 0; this.specialT = 0; this.knockT = 0;
    this.nameCycleT = 3.8;
    this.cfg = LV[0]; this.level = 1; this.shake = 0; this.t = 0;
    this.light = null; this.goal = 0;
    this.view = { x: 0, y: 0, w: W, h: H };
    this.bh = 150;
    this.toolSwing = 0;
    this.huntCursorT = 0;
    this.huntStrikes = 0;
    this.hunter = null;
    /* Состояние предфинального уровня 07 «Достучаться до небес» */
    this.isOcean = false;
    this.oceanState = 'sea'; /* 'sea' | 'turning' | 'turned' */
    this.oceanStateT = 3.6;
    this.oceanStrikes = 0;
    this.oceanWaveT = 1.2;
    this.oceanSpeech = '';
    this.oceanSpeechT = 0;
    this.tierYs = [];
    this.pillarXs = [];
    this.walker = this.makeWalker('father', 1, 0);
    this.secondWalker = this.makeWalker('capguy', 1, 1);
    this.betweenDog = this.makeBetweenDog();
    this.start(1);
    this.active = false;
  }

  /* Овчарка Рекс, которая стоит и ходит прямо МЕЖДУ бочками на ярусе цеха */
  makeBetweenDog() {
    return {
      actor: new Actor('dog', { dog: true, alpha: 1, fallback: '#5C4328' }),
      x: this.view.x + (this.view.w || W) * 0.5,
      y: this.view.y + (this.view.h || H) * 0.86,
      vx: 0,
      dir: 1,
      targetX: null,
      pose: 'sniff',
      poseT: 2.2,
      barkT: 0,
      tier: 0,
    };
  }

  placeBetweenDog() {
    if (!this.betweenDog || !this.barrels.length) return;
    const bottomTier = Math.max(...this.barrels.map((b) => b.tier || 0));
    const rowBarrels = this.barrels.filter((b) => (b.tier || 0) === bottomTier).sort((a, b) => a.tx - b.tx);
    this.betweenDog.tier = bottomTier;
    this.betweenDog.y = this.tierYs[bottomTier] || (this.view.y + this.view.h * 0.86);
    if (rowBarrels.length >= 2) {
      const gapIdx = Math.floor(rowBarrels.length / 2) - 1;
      const b1 = rowBarrels[Math.max(0, gapIdx)];
      const b2 = rowBarrels[Math.min(rowBarrels.length - 1, Math.max(0, gapIdx) + 1)];
      this.betweenDog.x = (b1.tx + b2.tx) * 0.5;
      this.betweenDog.targetX = this.betweenDog.x;
    } else if (rowBarrels[0]) {
      this.betweenDog.x = rowBarrels[0].tx + 90;
      this.betweenDog.targetX = this.betweenDog.x;
    }
  }

  updateBetweenDog(dt) {
    const d = this.betweenDog;
    if (!d || this.isOcean || !this.barrels.length) return;
    const bottomTier = Math.max(...this.barrels.map((b) => b.tier || 0));
    const rowBarrels = this.barrels.filter((b) => (b.tier || 0) === bottomTier).sort((a, b) => a.x - b.x);
    d.tier = bottomTier;
    d.y = this.tierYs[bottomTier] || d.y;
    d.barkT = Math.max(0, d.barkT - dt);
    if (d.skillEffectT > 0) {
      d.skillEffectT = Math.max(0, d.skillEffectT - dt);
      if (d.skillEffectT <= 0) d.skillEffect = null;
    }

    if ((d.skillEffect === 'freeze' && d.skillEffectT > 0) || (this.skills && this.skills.freeze > 0)) {
      d.vx = 0;
      d.actor.setVelocity(0);
      return;
    }

    /* Овчарка боится горящей бочки («Огонь из бочки») и убегает от пламени! */
    const fireB = this.barrels.find((b) => (b.onFireUntil || 0) > this.t && Math.abs(b.x - d.x) < 220);
    if (fireB) {
      const fleeDir = d.x >= fireB.x ? 1 : -1;
      d.dir = fleeDir;
      d.targetX = fleeDir > 0 ? this.view.x + this.view.w - 75 : this.view.x + 75;
      moveX(d, fleeDir * 115, dt, 680);
      d.actor.play('walk');
      d.actor.setVelocity(d.vx);
      d.actor.look(d.dir);
      d.actor.update(dt);
      return;
    }

    /* Если активна точка голосового пранка («Отвлечь пранком») — овчарка тоже бежит к источнику звука пранка! */
    if (this.prankLure && this.prankLure.timer > 0) {
      const pdx = this.prankLure.x - d.x;
      if (Math.abs(pdx) > 28) {
        d.dir = Math.sign(pdx);
        moveX(d, d.dir * 110, dt, 650);
        d.actor.play('walk');
      } else {
        moveX(d, 0, dt, 620);
        d.actor.play('sniff');
      }
      d.actor.setVelocity(d.vx);
      d.actor.look(d.dir);
      d.actor.update(dt);
      return;
    }

    if (d.barkT > 0) {
      d.vx = 0;
      d.actor.play('bark');
      d.actor.setVelocity(0);
      d.actor.look(d.dir);
      d.actor.update(dt);
      return;
    }

    d.poseT -= dt;
    if (d.poseT <= 0 && rowBarrels.length >= 2) {
      /* Выбираем промежуток МЕЖДУ соседними бочками и переходим туда или принюхиваемся */
      const gaps = [];
      for (let i = 0; i < rowBarrels.length - 1; i++) {
        gaps.push((rowBarrels[i].x + rowBarrels[i + 1].x) * 0.5);
      }
      if (gaps.length) {
        d.targetX = gaps[Math.floor(Math.random() * gaps.length)];
      }
      const poses = ['sniff', 'sit', 'pant', 'idle'];
      d.pose = poses[Math.floor(Math.random() * poses.length)];
      d.poseT = 2.4 + Math.random() * 2.2;
    }

    const dx = (d.targetX ?? d.x) - d.x;
    if (Math.abs(dx) > 6) {
      d.dir = Math.sign(dx);
      moveX(d, d.dir * 68, dt, 520);
      d.actor.play('walk');
    } else {
      moveX(d, 0, dt, 620);
      /* Смотрим на ближайшую бочку рядом */
      const nearB = rowBarrels.reduce((best, b) => (!best || Math.abs(b.x - d.x) < Math.abs(best.x - d.x) ? b : best), null);
      if (nearB) d.dir = nearB.x >= d.x ? 1 : -1;
      d.actor.play(d.pose);
    }
    d.actor.setVelocity(d.vx);
    d.actor.look(d.dir);
    d.actor.update(dt);
  }

  /* Назначает бочкам случайные неповторяющиеся российские имена */
  assignRussianNames() {
    const pool = [...RU_BARREL_NAMES].sort(() => Math.random() - 0.5);
    this.barrels.forEach((b, idx) => {
      if (b.isTillBarrel) {
        b.ruName = 'ТИЛЬ';
      } else {
        b.ruName = pool[idx % pool.length];
      }
    });
  }

  /* Меняет имя на одной из бочек на новое российское имя в процессе игры */
  cycleOneRussianName() {
    const cands = this.barrels.filter((b) => !b.isTillBarrel);
    if (!cands.length) return;
    const used = new Set(this.barrels.map((b) => b.ruName));
    const avail = RU_BARREL_NAMES.filter((n) => !used.has(n));
    if (!avail.length) return;
    const pickB = cands[Math.floor(Math.random() * cands.length)];
    pickB.ruName = avail[Math.floor(Math.random() * avail.length)];
  }

  makeWalker(key, level, slot = 0) {
    const dog = key === 'dog';
    const startX = slot === 0 ? this.view.x + 120 : this.view.x + (this.view.w || W) - 140;
    return {
      key,
      dog,
      slot,
      actor: new Actor(key, { dog, alpha: 1, fallback: '#12151A' }),
      x: startX,
      vx: 0,
      dir: slot === 0 ? 1 : -1,
      speed: dog ? 86 : 42 + level * 5.5,
      pauseT: 0,
      mode: 'walk',
      targetX: null,
      watchT: 0,
      lookT: 0,
      mark: '',
      markT: 0,
      speech: '',
      speechT: 0,
      nextSpeechT: slot === 0 ? 0.9 : 4.2,
      firstHintDone: slot !== 0,
      litBarrel: null,
      beamSwitchT: slot === 0 ? 1.1 : 2.1,
      beamActiveT: 0,
    };
  }

  speakWalker(w, hintType = null) {
    if (!w) return;
    if (!hintType && audio.isVoiceOrPrankBusy && audio.isVoiceOrPrankBusy()) {
      w.nextSpeechT = 4.5;
      return;
    }
    const effectiveHint = (!w.firstHintDone && !hintType) ? 'start' : hintType;
    if (effectiveHint === 'start') w.firstHintDone = true;
    const line = walkerLine(w.key, w.dog ? null : effectiveHint);
    w.speech = line;
    w.speechT = effectiveHint ? 4.4 : 3.8;
    w.nextSpeechT = 8.5 + Math.random() * 5.0;
    if (w.dog) {
      audio.bark();
    } else if (this.active && !audio.isMuted()) {
      if (audio.getActivePrankVoice && audio.getActivePrankVoice() >= 0) return;
      speak(line, w.key);
    }
  }

  /* Раскладка бочек по прочным стальным ярусам цеха (чтобы ни одна бочка не висела в воздухе!) */
  layout() {
    const v = this.view, n = this.barrels.length;
    if (!n) return;
    const narrow = v.w < 620;
    if (this.isOcean) {
      this.bh = narrow ? 90 : 146;
      const roofTierY = Math.round(v.y + v.h * 0.85);
      this.tierYs = [roofTierY];
      this.pillarXs = [Math.round(v.x + v.w * 0.24), Math.round(v.x + v.w * 0.52), Math.round(v.x + v.w * 0.80)];
      const mainB = this.barrels[0];
      if (mainB) {
        mainB.tx = Math.round(v.x + v.w * (narrow ? 0.54 : 0.55));
        mainB.ty = roofTierY;
      }
      if (this.barrels[1]) {
        this.barrels[1].tx = Math.round(v.x + v.w * (narrow ? 0.78 : 0.77));
        this.barrels[1].ty = roofTierY;
      }
      if (this.barrels[2]) {
        this.barrels[2].tx = Math.round(v.x + v.w * (narrow ? 0.91 : 0.90));
        this.barrels[2].ty = roofTierY;
      }
      if (this.barrels[3]) {
        this.barrels[3].tx = Math.round(v.x + v.w * (narrow ? 0.11 : 0.12));
        this.barrels[3].ty = roofTierY;
      }
      return;
    }

    /* На Ур. 06 (Алтарь с прикованным к стене Отцом) всегда используем 2 яруса (0.64 и 0.88),
       чтобы верхняя центральная стена алтаря с Отцом в цепях была полностью открыта! */
    const rows = this.isAltarFather ? 2 : ((narrow && n > 6) ? 3 : (n <= 4 ? 1 : 2));
    const cols = Math.ceil(n / rows);
    this.bh = rows === 1
      ? (narrow ? 98 : 152)
      : rows === 3
        ? (narrow ? 86 : 112)
        : (cols >= 5 ? (narrow ? 78 : 118) : cols >= 4 ? (narrow ? 88 : 128) : (narrow ? 94 : 138));
    this.tierYs = this.isAltarFather
      ? [Math.round(v.y + v.h * 0.65), Math.round(v.y + v.h * 0.89)]
      : rows === 1
        ? [Math.round(v.y + v.h * 0.85)]
        : rows === 3
          ? [Math.round(v.y + v.h * 0.44), Math.round(v.y + v.h * 0.66), Math.round(v.y + v.h * 0.88)]
          : [Math.round(v.y + v.h * 0.56), Math.round(v.y + v.h * 0.86)];

    this.barrels.forEach((b, i) => {
      const r = Math.min(rows - 1, Math.floor(i / cols));
      const rowStart = r * cols;
      const rowBarrelsCount = Math.min(cols, n - rowStart);
      const c = i - rowStart;
      const marginX = Math.max(narrow ? 46 : 76, v.w * 0.10);
      const spanW = Math.max(120, v.w - marginX * 2);
      b.tier = r;
      b.tx = rowBarrelsCount <= 1
        ? v.x + v.w * 0.5
        : Math.round(v.x + marginX + (spanW * c) / (rowBarrelsCount - 1));
      /* Никакого вертикального разброса (jy=0) — дно бочки стоит плотно на стальном настиле яруса! */
      b.ty = this.tierYs[r];
    });

    /* Координаты вертикальных двутавровых столбов цеха между колоннами бочек */
    const bottomRow = this.barrels.filter((b) => (b.tier || 0) === (rows - 1)).sort((a, b) => a.tx - b.tx);
    this.pillarXs = [];
    if (bottomRow.length >= 2) {
      for (let i = 0; i < bottomRow.length - 1; i++) {
        this.pillarXs.push(Math.round((bottomRow[i].tx + bottomRow[i + 1].tx) * 0.5));
      }
    }
    this.placeBetweenDog();
  }

  start(level) {
    this.level = level; this.cfg = levelConfig(level);
    this.isOcean = !!this.cfg.isOcean;
    this.isAltarFather = !!(this.cfg.isAltarFather || level === 6);
    this.goal = this.cfg.goal; this.time = this.cfg.sec;
    this.levelPoints = 0; this.progress = 0; this.air = 100; this.combo = 1; this.comboUntil = 0; this.streak = 0; this.idle = 0;
    this.huntCursorT = 0; this.huntStrikes = 0; this.hunter = null;
    this.nameCycleT = 3.5;
    this.clearHandSkill(true);
    this.skills = { fragile: 0, shrink: 0, freeze: 0, stealth: 0, distract: 0, overcharge: 0, jackpot: 0, xray: 0, oxygen: 0, magnet: 0 };
    this.prankLure = null;
    this.loudspeakerT = 9 + Math.random() * 7;
    this.loudspeakerBannerT = 0;
    this.loudspeakerLabel = '';
    this.barrels = []; this.floats = []; this.sparks = []; this.chainLinks = [];

    if (this.isAltarFather) {
      this.altarFatherActor = new Actor('father', { dog: false, alpha: 1, fallback: '#12151A' });
      const baseTap = Math.round(S.multitap * (1 + (this.level || 6)) * (currentTool().mult || 1));
      this.fatherChained = {
        hitsDone: 0,
        hitsMax: 24,
        hitCost: Math.max(320, baseTap * 4),
        shake: 0,
        freed: false,
        cutscene: false,
        cutsceneT: 0,
        cutsceneDur: 4.8,
        sacrificedAllLives: false,
        livesSacrificed: 0,
        boyActor: new Actor('boy', { fallback: '#4A7A8C' }),
        watchCycleT: 3.6,
        watchedT: 0,
        speech: 'Сынок! Я прикован цепями к стене алтаря! Копи очки на бочках и руби мои цепи, пока пастор не видит!',
        speechT: 5.5,
      };
      this.goal = this.fatherChained.hitsMax;
    } else {
      this.fatherChained = null;
    }

    if (this.isOcean) {
      /* Предфинальный уровень 07 «Крыша завода с видом на море · Достучаться до небес»:
         На крыше завода стена с надписью про море и стальной помост, на котором стоят качающаяся бочка «ТИЛЬ» с рукой и 3 бочки.
         На этом уровне КАРТОЧКИ УСИЛЕНИЯ НЕ РАБОТАЮТ, а когда он смотрит — СТУЧАТЬ НЕЛЬЗЯ ВООБЩЕ! */
      this.oceanState = 'sea';
      this.oceanStateT = 2.9;
      this.oceanStrikes = 0;
      this.oceanWaveT = 0.6;
      this.oceanSpeech = walkerLine('ocean');
      this.oceanSpeechT = 4.2;
      this.barrels.push({
        name: 'igor',
        ruName: 'ТИЛЬ',
        isTillBarrel: true,
        x: 0, y: 0, tx: 0, ty: 0, jx: 0, jy: 0,
        kind: 'hand',
        target: true,
        trap: false,
        knockedDown: false,
        wrongHits: 0,
        tapsLeft: 999,
        maxTaps: 999,
        specialUntil: 999999,
        chainTap: 0,
        chainDamage: 0,
        chainHitsDone: 0,
        chainLoot: 'energy',
        chainRemoved: false,
        chainRemovedUntil: 0,
        hasAirBubble: true,
        shake: 0,
        lid: 0,
      });
      this.barrels.push({
        name: 'daniyar',
        ruName: 'МАКСИМ',
        isTillBarrel: false,
        x: 0, y: 0, tx: 0, ty: 0, jx: 0, jy: 0,
        kind: 'chained',
        target: false,
        trap: false,
        knockedDown: false,
        wrongHits: 0,
        tapsLeft: 20,
        maxTaps: 20,
        specialUntil: this.t + 45,
        chainTap: 0,
        chainDamage: 0,
        chainHitsDone: 0,
        chainLoot: 'energy',
        chainRemoved: false,
        chainRemovedUntil: 0,
        hasAirBubble: false,
        shake: 0,
        lid: 0,
      });
      this.barrels.push({
        name: 'mark',
        ruName: 'СЕРГЕЙ',
        isTillBarrel: false,
        x: 0, y: 0, tx: 0, ty: 0, jx: 0, jy: 0,
        kind: 'phone',
        target: false,
        trap: false,
        knockedDown: false,
        wrongHits: 0,
        tapsLeft: 20,
        maxTaps: 20,
        specialUntil: this.t + 35,
        chainTap: 0,
        chainDamage: 0,
        chainHitsDone: 0,
        chainLoot: 'energy',
        chainRemoved: false,
        chainRemovedUntil: 0,
        hasAirBubble: true,
        shake: 0,
        lid: 0,
      });
      this.barrels.push({
        name: 'anton',
        ruName: 'АРТУР',
        isTillBarrel: false,
        x: 0, y: 0, tx: 0, ty: 0, jx: 0, jy: 0,
        kind: 'closed',
        target: false,
        trap: false,
        knockedDown: false,
        wrongHits: 0,
        tapsLeft: 20,
        maxTaps: 20,
        specialUntil: 0,
        chainTap: 0,
        chainDamage: 0,
        chainHitsDone: 0,
        chainLoot: 'jackpot',
        chainRemoved: false,
        chainRemovedUntil: 0,
        hasAirBubble: true,
        shake: 0,
        lid: 0,
      });
      this.assignRussianNames();
      this.assignBarrelRewards();
      this.layout();
      this.barrels.forEach((b) => { b.x = b.tx; b.y = b.ty; });
      this.walker = this.makeWalker('priest', level, 0);
      this.secondWalker = null;
      this.active = true; this.paused = false;
      return;
    }

    const maxTapsPerBarrel = Math.max(16, 24 - Math.floor(level * 0.8));
    for (let i = 0; i < this.cfg.n; i++) {
      this.barrels.push({
        name: NAMES[i % 6],
        ruName: RU_BARREL_NAMES[i % RU_BARREL_NAMES.length],
        x: 0, y: 0, tx: 0, ty: 0,
        jx: 0,
        jy: 0,
        tier: 0,
        kind: 'closed',
        target: false,
        trap: false,
        knockedDown: false,
        knockedReason: '',
        wrongHits: 0,
        tapsLeft: maxTapsPerBarrel,
        maxTaps: maxTapsPerBarrel,
        rewardType: 'points',
        hasSupply: false,
        hasAirBubble: false,
        chainDamage: 0,
        chainHitsDone: 0,
        chainLoot: 'energy',
        chainRemoved: false,
        chainRemovedUntil: 0,
        specialUntil: 0,
        chainTap: 0,
        shake: 0,
        lid: 0,
      });
    }
    this.assignRussianNames();
    this.layout();
    this.barrels.forEach((b) => { b.x = b.tx; b.y = b.ty; });
    const traps = Math.max(1, Math.floor(this.cfg.n / 4));
    const order = this.barrels.map((_, i) => i).sort(() => Math.random() - 0.5);
    order.slice(0, traps).forEach((i) => { this.barrels[i].trap = true; this.barrels[i].kind = 'fallen'; this.barrels[i].name = 'anna'; });
    this.barrels[order[traps]].target = true;
    /* На старте 1–3 бочки закованы в натуральную цепь со всеми ништяками внутри (Энергия ⚡ и Куш ×4 💰)! */
    const chainCount = this.cfg.chainCount || (this.cfg.n >= 6 ? 2 : 1);
    for (let c = 0; c < chainCount; c++) {
      if (order.length > traps + 1 + c) {
        const chIdx = order[traps + 1 + c];
        const cb = this.barrels[chIdx];
        cb.kind = 'chained';
        cb.chainDamage = 0;
        cb.chainHitsDone = 0;
        cb.chainRemoved = false;
        cb.specialUntil = this.t + 40;
      }
    }
    this.assignBarrelRewards();
    this.airSpawnT = 2.8;
    this.shuffleT = this.cfg.shuffle; this.specialT = 2.5; this.knockT = 0.6;
    /* Главный персонаж уровня (1: Отец, 2: Сообщник, 3: Девушка, 4: Овчарка Рекс, 5: Священник, 6: Священник у алтаря с прикованным Отцом) + напарник */
    const wk1 = this.isAltarFather
      ? 'priest'
      : (this.cfg.charKey && WALKERS.includes(this.cfg.charKey)
        ? this.cfg.charKey
        : WALKERS[(level - 1) % WALKERS.length]);
    const wk2 = this.isAltarFather
      ? 'capguy'
      : (level === 5 ? 'priest' : WALKERS[level % WALKERS.length]);
    this.walker = this.makeWalker(wk1, level, 0);
    this.secondWalker = this.makeWalker(wk2 === wk1 ? 'capguy' : wk2, level, 1);
    this.placeBetweenDog();
    this.active = true; this.paused = false;
  }

  stop() { this.active = false; this.huntCursorT = 0; }

  /* Все главные ништяки (⚡ Энергия и 💰 Куш ×4 + O₂) находятся ИМЕННО ЗА ЦЕПЬЮ!
     (Жизни ❤️ за цепи НЕ даются — жизни даются ТОЛЬКО за «Поделиться трейлером», «Поделиться игрой» и за друзей!) */
  rollChainLoot() {
    const r = Math.random();
    if (r < 0.65) return 'energy';  /* ⚡ Крупный запас Энергии за цепью */
    return 'jackpot';               /* 💰 Крупный куш очков ×4 + Энергия за цепью */
  }

  rollBarrelReward() {
    return Math.random() < 0.42 ? 'air' : 'points';
  }

  assignBarrelRewards() {
    const safe = this.barrels.filter((b) => !b.trap && !b.knockedDown);
    safe.forEach((b) => {
      b.chainLoot = this.rollChainLoot();
      b.hasAirBubble = b.kind !== 'chained' && Math.random() < 0.45;
      b.rewardType = b.hasAirBubble ? 'air' : 'points';
      b.hasSupply = b.hasAirBubble;
    });
    /* Гарантируем, что на уровне сразу есть бочки с воздухом O₂, чтобы не задохнуться,
       а за цепью обязательно спрятаны ништяки (Энергия ⚡ / Куш ×4 💰) */
    const unchained = safe.filter((b) => b.kind !== 'chained');
    if (unchained.length >= 1 && !unchained.some((b) => b.hasAirBubble)) {
      unchained[0].hasAirBubble = true;
      unchained[0].rewardType = 'air';
      unchained[0].hasSupply = true;
    }
    const chained = safe.filter((b) => b.kind === 'chained');
    if (chained.length >= 1) {
      chained[0].chainLoot = 'energy';
    }
  }

  /* Если бочка даёт минус и игрок ошибается (или слишком много тапает по одной бочке и она кончается) —
     бочка ПАДАЕТ набок (knockedDown = true, kind = 'fallen') и остаётся упавшей до конца уровня:
     по ней больше нельзя тапать, меньше бочек — меньше плюшек! */
  knockDownBarrel(b, reason = 'mistake') {
    if (!b || b.knockedDown || b.isTillBarrel) return;
    const wasTarget = !!b.target;
    b.knockedDown = true;
    b.knockedReason = reason;
    b.kind = 'fallen';
    b.trap = false;
    b.target = false;
    b.hasAirBubble = false;
    b.hasSupply = false;
    b.chainRemoved = false;
    b.isPrizeBarrel = false;
    b.onFireUntil = 0;
    b.tapsLeft = 0;
    b.shake = 1.65;
    this.spark(b.x, b.y - this.bh * 0.45);
    audio.creak();
    audio.knock(0, 0.35);

    const standingLeft = this.barrels.filter((x) => !x.trap && !x.knockedDown).length;
    if (reason === 'mistake') {
      this.float(
        b.x,
        b.y - this.bh * 0.96,
        `💥 ОШИБКА! БОЧКА УПАЛА — ОСТ. ${standingLeft} БОЧЕК (МЕНЬШЕ ПЛЮШЕК!)`,
        '#FF4D4D'
      );
    } else {
      this.float(
        b.x,
        b.y - this.bh * 0.96,
        `🛢️ БОЧКА ИСТОЩЕНА И УПАЛА! ОСТ. ${standingLeft} БОЧЕК (МЕНЬШЕ ПЛЮШЕК!)`,
        '#FFD166'
      );
    }

    if (wasTarget && standingLeft > 0) {
      this.retarget();
    }
    if (standingLeft <= 0 && !this.isOcean && !S.godMode) {
      this.active = false;
      this.ev.onLose('caught');
    }
  }

  /* Координаты и логика прикованного цепями к стене Отца на Уровне 06 «СТАРАЯ ЦЕРКОВЬ · АЛТАРЬ» */
  getAltarFatherBox() {
    const v = this.view || { x: 0, y: 0, w: W, h: H };
    const narrow = v.w < 620;
    const h = narrow ? 88 : 118;
    const w = narrow ? 124 : 158;
    const cx = Math.round(v.x + v.w * 0.5);
    const cy = Math.round(v.y + (narrow ? v.h * 0.345 : v.h * 0.34));
    return { cx, cy, w, h, narrow };
  }

  isAltarWatched() {
    if (!this.isAltarFather || !this.fatherChained) return false;
    if (this.skills && (this.skills.freeze > 0 || this.skills.stealth > 0)) return false;
    if (this.prankLure && this.prankLure.timer > 0) return false;
    if (this.huntCursorT > 0) return true;
    if ((this.fatherChained.watchedT || 0) > 0) return true;
    const { cx } = this.getAltarFatherBox();
    const walkers = [this.walker, this.secondWalker].filter(Boolean);
    return walkers.some((w) => {
      if (w.skillEffect && w.skillEffectT > 0) return false;
      return w.mode === 'watch' && Math.abs(w.x - cx) < (this.view?.w || W) * 0.20;
    });
  }

  findHitAltarFather(x, y) {
    if (!this.isAltarFather || !this.fatherChained || this.fatherChained.freed) return false;
    const { cx, cy, w, h } = this.getAltarFatherBox();
    return Math.abs(x - cx) <= w * 0.62 && y <= cy + 28 && y >= cy - h * 1.18;
  }

  startAltarHeavenCutscene(sacrificedAllLives = false) {
    if (!this.fatherChained) return;
    const fc = this.fatherChained;
    const { cx, cy, h } = this.getAltarFatherBox();
    fc.hitsDone = fc.hitsMax;
    fc.freed = true;
    fc.cutscene = true;
    fc.cutsceneT = 0;
    fc.cutsceneDur = 4.8;
    fc.sacrificedAllLives = sacrificedAllLives;
    fc.shake = 2.4;
    this.progress = this.goal;
    this.shake = 1.6;
    this.spark(cx, cy - h * 0.5);
    this.spawnBrokenChains(cx, cy - h * 0.5, 34);
    audio.chainBreak(0);
    audio.barrelMelodyBeat(0, 4);
    audio.coin(2.5);
    fc.speech = sacrificedAllLives
      ? 'Ты отдал все свои ❤️ жизни, чтобы разбить мои цепи! Я свободен... А ты возносишься на небеса к морю!'
      : 'Все цепи алтаря разбиты — я свободен! Поднимаемся наверх — к небесам и морю!';
    fc.speechT = 5.0;
    if (!audio.isMuted()) speak(fc.speech, 'father');
  }

  handleAltarFatherHit(x, y) {
    if (!this.isAltarFather || !this.fatherChained || !this.active) return;
    const fc = this.fatherChained;
    if (fc.cutscene || fc.freed) return;
    const { cx, cy, h } = this.getAltarFatherBox();
    this.idle = 0;
    this.toolSwing = 1.0;

    /* 1. Если пастор или напарник сейчас смотрят на алтарь — бить по цепям Отца НЕЛЬЗЯ! */
    if (this.isAltarWatched() && !S.godMode) {
      this.streak = 0;
      this.air -= 15;
      this.shake = 1.05;
      fc.shake = 1.1;
      audio.alarmLock(0);
      this.float(cx, cy - h * 0.85, '👁️ ОХРАНА СМОТРИТ НА АЛТАРЬ! ЖДИ, ПОКА ОТВЕРНУТСЯ!', '#FF4D4D');
      if (this.walker) this.triggerCursorHunt(this.walker, null);
      if (this.air <= 0) {
        this.air = 60;
        this.active = false;
        this.ev.onLose('suffocated');
      }
      return;
    }

    const tool = currentTool();
    /* 2. Голой рукой цепи Отца на стене алтаря не разбить — нужен инструмент */
    if ((tool.chainHits || 0) <= 0 && this.levelPoints > 0 && !S.godMode) {
      fc.shake = 0.7;
      audio.chainClink(0, 0.75);
      this.float(cx, cy - h * 0.82, '✊ РУКОЙ ЦЕПИ ОТЦА НЕ СБИТЬ! ВОЗЬМИ ИНСТРУМЕНТ (◀ ▶)', '#FF6B6B');
      return;
    }

    /* 3. ЕСЛИ ОЧКИ КОНЧИЛИСЬ (levelPoints <= 0):
       Игрок НЕ знает заранее, что жертва всех жизней ведёт к переходу на Небеса!
       Каждый удар при 0 очков отнимает 1 ❤️ ЖИЗНЬ ради спасения Отца.
       Когда игрок отдаёт ПОСЛЕДНЮЮ (все) ❤️ жизни ради Отца — цепи разлетаются вдребезги и запускается МИНИ-МУЛЬТИК вознесения на Небеса! */
    if (this.levelPoints <= 0) {
      fc.livesSacrificed = (fc.livesSacrificed || 0) + 1;
      S.lives = Math.max(0, (S.lives || 1) - 1);
      save();
      document.dispatchEvent(new CustomEvent('hand-skill-triggered'));

      if (S.lives > 0) {
        fc.hitsDone = Math.min(fc.hitsMax - 1, fc.hitsDone + 2);
        this.progress = fc.hitsDone;
        fc.shake = 1.65;
        this.shake = 1.15;
        this.spark(cx, cy - h * 0.5);
        this.spawnBrokenChains(cx, cy - h * 0.5, 8);
        audio.chainBreak(0);
        fc.speech = `Ты бьёшь ценой своей ❤️ жизни! Осталось сердец: ${S.lives}... Копи очки на бочках или бей до конца ради меня!`;
        fc.speechT = 4.6;
        this.float(
          cx,
          cy - h * 0.92,
          `💔 -1 ❤️ ЖИЗНЬ РАДИ ОТЦА! (ОСТАЛОСЬ ❤️: ${S.lives})`,
          '#FF6B6B'
        );
        return;
      }

      /* Отданы ВСЕ ❤️ жизни ради спасения Отца — запускаем мини-мультик освобождения Отца и вознесения на Небеса! */
      this.startAltarHeavenCutscene(true);
      return;
    }

    /* 4. Каждый удар по цепям Отца на стене отнимает очки (в минус идёшь, чтобы спасти — надо опять набирать очки на бочках и снова бить!) */
    const singleTapBase = Math.round(S.multitap * (1 + (this.level || 6)) * (currentTool().mult || 1));
    const cost = Math.max(fc.hitCost || 320, singleTapBase * 4);
    fc.hitCost = cost;
    const spent = Math.min(Math.floor(this.levelPoints), cost);
    this.levelPoints = Math.max(0, this.levelPoints - cost);

    const strikePower = 1;
    fc.hitsDone = Math.min(fc.hitsMax, fc.hitsDone + strikePower);
    this.progress = fc.hitsDone;
    fc.shake = 1.45;
    this.air = Math.min(100, this.air + 7);
    this.spark(cx, cy - h * 0.5);
    this.spawnBrokenChains(cx, cy - h * 0.5, 6);
    audio.chainBreak(0);

    if (fc.hitsDone >= fc.hitsMax) {
      this.startAltarHeavenCutscene(false);
      return;
    }

    const left = fc.hitsMax - fc.hitsDone;
    if (this.levelPoints <= 0) {
      fc.speech = 'Очки на нуле! Набирай очки на бочках — иначе удары по цепям будут отнимать твои ❤️ жизни!';
      fc.speechT = 4.8;
      this.float(
        cx,
        cy - h * 0.90,
        `⛓️ -${spent} ОЧК. (ОСТ. ${left} УД.) · ⚠️ ОЧКИ 0: КОПИ НА БОЧКАХ ИЛИ ТРАТЬ ❤️ ЖИЗНИ!`,
        '#FFD166'
      );
    } else {
      fc.speech = left <= 4
        ? `Почти спасли! Осталось всего ${left} удара по цепям!`
        : `Цепи трещат (-${spent} очков)! Если очки кончатся — копи на бочках и снова бей!`;
      fc.speechT = 3.4;
      this.float(
        cx,
        cy - h * 0.90,
        `⛓️ УДАР ПО ЦЕПЯМ ОТЦА: -${spent} ОЧКОВ · ПРОГРЕСС ${fc.hitsDone}/${fc.hitsMax}`,
        '#64DFDF'
      );
    }
  }

  retarget() {
    if (this.isOcean) return;
    const cands = this.barrels.filter((b) => !b.trap && !b.knockedDown && !b.chainRemoved && b.kind !== 'chained');
    const pool = cands.length ? cands : this.barrels.filter((b) => !b.trap && !b.knockedDown && !b.chainRemoved);
    this.barrels.forEach((b) => (b.target = false));
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (next) {
      next.target = true;
      if ((next.tapsLeft ?? 10) < 6) next.tapsLeft = 6;
      if (Math.random() < 0.45) {
        next.hasAirBubble = true;
        next.rewardType = 'air';
      }
    }
    this.cycleOneRussianName();
  }

  /* Персонажи ходят прямо по стальным помостам ярусов рядом с бочками! */
  walkerY(w = this.walker) {
    if (this.tierYs && this.tierYs.length >= 2) {
      return w && w.slot === 1 ? this.tierYs[0] - 2 : this.tierYs[this.tierYs.length - 1] - 2;
    }
    if (this.tierYs && this.tierYs.length === 1) {
      return w && w.slot === 1 ? Math.round(this.view.y + this.view.h * 0.55) : this.tierYs[0] - 2;
    }
    return this.view.y + this.view.h * (w && w.slot === 1 ? 0.56 : 0.86);
  }
  walkerH(w = this.walker) {
    const narrow = this.view && this.view.w < 620;
    const baseH = narrow
      ? (w && w.dog ? 58 : (w && w.slot === 1 ? 88 : 96))
      : (w && w.dog ? 76 : (w && w.slot === 1 ? 116 : 128));
    return Math.round(baseH);
  }

  /* Взять навык-умение В РУКУ и СРАЗУ включить его эффект (а на Ур.07 «Достучаться до небес» карточки усиления НЕ работают!) */
  armSkill(cardOrId) {
    const card = typeof cardOrId === 'string'
      ? CARDS.find((c) => c.id === cardOrId || c.skillKey === cardOrId)
      : cardOrId;
    if (!card) return { ok: false, reason: 'not_found' };

    /* НА УРОВНЕ 07 («ДОСТУЧАТЬСЯ ДО НЕБЕС») КАРТОЧКИ УСИЛЕНИЯ НЕ РАБОТАЮТ ВООБЩЕ! */
    if (this.isOcean || (this.level === 7 && this.cfg?.isOcean)) {
      this.clearHandSkill(true);
      const cx = this.view ? this.view.x + this.view.w * 0.5 : 400;
      const cy = this.view ? this.view.y + this.view.h * 0.42 : 240;
      audio.alarmLock(0);
      this.float(cx, cy, '🚫 НА УРОВНЕ «ДОСТУЧАТЬСЯ ДО НЕБЕС» КАРТОЧКИ УСИЛЕНИЯ НЕ РАБОТАЮТ!', '#FF6B6B');
      return { ok: false, reason: 'ocean_no_skills', card };
    }

    const cost = skillEnergyCost(card);
    const dur = skillDuration(card);
    const spendRes = S.godMode
      ? { ok: true, dur, cost: 0, card }
      : spendSkillEnergy(card.id);
    if (!spendRes.ok) {
      return { ok: false, reason: 'no_energy', cost, energy: Math.floor(S.energy || 0), card };
    }

    this.handSkill = {
      cardId: card.id,
      skillKey: card.skillKey,
      icon: card.icon,
      ru: card.ru,
      accent: card.accent || '#64DFDF',
      cost,
      dur: spendRes.dur || dur,
      maxDur: spendRes.dur || dur,
      timeLeft: spendRes.dur || dur,
      state: 'active',
    };
    S.handSkillState = this.handSkill;
    this.activateSkill(card.skillKey, this.handSkill.dur, card.ru);
    document.dispatchEvent(new CustomEvent('hand-skill-triggered', { detail: spendRes }));
    return { ok: true, triggeredNow: true, card, cost, dur: this.handSkill.dur };
  }

  clearHandSkill(silent = false) {
    if (!this.handSkill) return;
    const prev = this.handSkill;
    this.handSkill = null;
    S.handSkillState = null;
    if (!silent) {
      const tl = currentTool();
      const cx = this.view ? this.view.x + this.view.w * 0.5 : 400;
      const cy = this.view ? this.view.y + this.view.h * 0.44 : 250;
      this.float(cx, cy, `⏳ ${prev.icon} НАВЫК КОНЧИЛСЯ — В РУКЕ СНОВА ${tl.icon} ${(tl[lang] || tl.ru).toUpperCase()}!`, '#ECE4D2');
    }
  }

  spawnSkillBeam(x1, y1, x2, y2, color = '#64DFDF', icon = '⚡') {
    this.skillBeams.push({
      x1, y1, x2, y2,
      color,
      icon,
      life: 0.55,
      maxLife: 0.55,
    });
    for (let i = 0; i < 12; i++) {
      this.sparks.push({
        x: x2 + (Math.random() - 0.5) * 28,
        y: y2 + (Math.random() - 0.5) * 28,
        vx: (Math.random() - 0.5) * 360,
        vy: -80 - Math.random() * 260,
        life: 0.45 + Math.random() * 0.35,
      });
    }
  }

  /* Поиск персонажа под точкой клика/тапа (Отец, Святой отец, Сообщник, Девушка, Овчарка Рекс или Герой у моря) */
  findHitCharacter(x, y) {
    const narrow = this.view && this.view.w < 620;
    if (this.isOcean) {
      const v = this.view;
      const heroX = v.x + v.w * (narrow ? 0.28 : 0.31);
      const heroY = v.y + v.h * 0.85;
      const heroH = narrow ? 112 : 168;
      if (Math.abs(x - heroX) < heroH * 0.42 && y <= heroY + 18 && y >= heroY - heroH * 1.05) {
        return { kind: 'ocean', x: heroX, y: heroY, h: heroH, key: 'ocean' };
      }
      if (this.walker) {
        const wy = this.walkerY(this.walker), wh = this.walkerH(this.walker);
        if (Math.abs(x - this.walker.x) < wh * 0.42 && y <= wy + 16 && y >= wy - wh * 1.08) {
          return { kind: 'walker', w: this.walker, x: this.walker.x, y: wy, h: wh, key: this.walker.key };
        }
      }
      return null;
    }

    const candidates = [this.walker, this.secondWalker].filter(Boolean);
    for (const w of candidates) {
      const wy = this.walkerY(w);
      const wh = this.walkerH(w);
      const padX = Math.max(narrow ? 34 : 42, wh * 0.38);
      if (Math.abs(x - w.x) <= padX && y <= wy + 16 && y >= wy - wh * 1.08) {
        return { kind: 'walker', w, x: w.x, y: wy, h: wh, key: w.key };
      }
    }

    if (this.betweenDog) {
      const d = this.betweenDog;
      const dh = narrow ? 56 : 74;
      if (Math.abs(x - d.x) <= dh * 0.55 && y <= d.y + 14 && y >= d.y - dh * 1.05) {
        return { kind: 'dog', d, x: d.x, y: d.y, h: dh, key: 'dog' };
      }
    }
    return null;
  }

  /* Реакция персонажа при нажатии на него обычным инструментом (Молотком, Монтировкой, Кулаком и т.д.) */
  handleCharacterToolTap(hitChar, x, y) {
    if (!hitChar) return;
    const tool = currentTool();
    const toolName = (tool[lang] || tool.ru).toLowerCase();
    const pan = ((hitChar.x - this.view.x) / (this.view.w || W)) * 2 - 1;
    this.spark(x, y);
    audio.knock(pan, 0.75);

    if (hitChar.kind === 'ocean') {
      this.oceanSpeech = 'Эй, братишка! Не стучи мне по спине — стучи по бочке «ТИЛЬ», пока я смотрю на море!';
      this.oceanSpeechT = 3.8;
      this.oceanHeroRecoilT = 0.55;
      audio.voiceMumble(-0.2, 0.92);
      speak(this.oceanSpeech, 'father');
      this.float(hitChar.x, hitChar.y - hitChar.h * 0.95, '🌊 «НЕ ПО МНЕ — СТУЧИ ПО БОЧКЕ ТИЛЯ!»', '#64DFDF');
      return;
    }

    if (hitChar.kind === 'dog') {
      const d = hitChar.d;
      d.barkT = 1.6;
      d.hitRecoilT = 0.55;
      audio.bark();
      this.float(d.x, d.y - hitChar.h - 12, '🐕 ГАВ-РРР! «НЕ ТРОГАЙ ОВЧАРКУ!»', '#D4A843');
      return;
    }

    const w = hitChar.w;
    w.hitRecoilT = 0.58;
    w.mark = '💥';
    w.markT = 1.4;
    w.dir = x >= w.x ? 1 : -1;

    /* Если персонаж светил фонарём на бочку или гнался лучом за курсором — удар по персонажу СБИВАЕТ его луч фонаря! */
    let beamKnocked = false;
    if ((this.huntCursorT > 0 && this.hunter === w) || (w.litBarrel && w.beamActiveT > 0) || w.mode === 'watch') {
      beamKnocked = true;
      if (this.hunter === w) this.huntCursorT = 0;
      w.litBarrel = null;
      w.beamActiveT = 0;
      w.beamSwitchT = 3.4;
      w.mode = 'pause';
      w.pauseT = 2.2;
      this.air = Math.min(100, this.air + 10);
      audio.coin(1.5);
      this.float(w.x, hitChar.y - hitChar.h - 28, '🔦 ФОНАРЬ СБИТ! +10% 💨 O₂', '#64DFDF');
    } else {
      w.mode = 'pause';
      w.pauseT = 1.6;
    }

    const tapLines = {
      priest: [
        `Сын мой! Побойся Бога стучать по святому отцу (${toolName})! Стучи по бочке!`,
        'Ох! Я принёс бочку для вашего мальчика, а ты по пастору колотишь?!',
        'Господь велел стучать в двери небес, а не по голове пастора! Выбери навык сверху!',
      ],
      father: [
        `Ай! Ты чего по мне стучишь (${toolName})?! По бочкам бей, а не по мне!`,
        'Эй! Чуть фонарь из рук не выбил! Ищи бочку, где стучат изнутри!',
        'Ох! Я тебе не стальная бочка! Возьми навык в руку, если хочешь меня заморозить!',
      ],
      capguy: [
        `Ай, по каске прилетело! Полегче (${toolName}), свои же! Руби цепь на бочке!`,
        'Эй! Шахтёрский фонарь чуть не стряхнул! Включи навык сверху и направь на нас!',
        'Ты чего толкаешься?! Все ништяки за цепью на бочках, туда и бей!',
      ],
      girl: [
        'Ой! Не пугай меня так! На, держи глоток воздуха 💨, только по бочкам стучи!',
        'Ай! Чуть телефон не выронила! Слушай, из какой бочки идёт глухой стук!',
        'Хватит щекотать инструментом! Возьми карточку навыка в руку и наведи на бочку!',
      ],
      dog: [
        'ГАВ-ГАВ! РРР-УФ! (Овчарка Рекс клацнула зубами в ответ на удар!)',
      ],
    };

    const pool = tapLines[w.key] || tapLines.father;
    const line = pool[Math.floor(Math.random() * pool.length)];
    w.speech = line;
    w.speechT = 3.8;

    if (w.dog) {
      audio.bark();
    } else {
      audio.voiceMumble(pan, w.key === 'girl' ? 1.45 : w.key === 'priest' ? 0.85 : 0.95);
      if (!audio.isMuted()) speak(line, w.key);
    }

    /* Небольшой бонус воздуха раз в 3.5 сек при взаимодействии с персонажем (особенно с девушкой) */
    if (!beamKnocked && this.t > (w.tapBonusUntil || 0)) {
      w.tapBonusUntil = this.t + 3.5;
      const airBonus = w.key === 'girl' ? 12 : 6;
      this.air = Math.min(100, this.air + airBonus);
      this.float(w.x, hitChar.y - hitChar.h - 10, `💬 РЕАКЦИЯ ГЕРОЯ · 💨+${airBonus}% O₂`, '#D4A843');
    } else if (!beamKnocked) {
      this.float(w.x, hitChar.y - hitChar.h - 10, w.dog ? '🐕 ГАВ-ГАВ!' : '💢 «НЕ ПО МНЕ СТУЧИ!»', '#D4A843');
    }
  }

  /* Применение навыка из руки ПРЯМО НА ПЕРСОНАЖА (Одеть бочку — только ноги торчат, Абсолютная Заморозка ★ во льду, Невидимка — фонарь мигает и отрубается, Точка пранка, Огонь из бочки) */
  applySkillToCharacter(hitChar, skillKey, dur, fromX, fromY) {
    if (!hitChar) return;
    const tx = hitChar.x;
    const ty = hitChar.y - hitChar.h * 0.55;
    this.spawnSkillBeam(fromX ?? tx, (fromY ?? ty) - 20, tx, ty, this.handSkill?.accent || '#64DFDF', this.handSkill?.icon || '⚡');

    const tool = currentTool();
    const base = Math.round(S.multitap * (1 + (this.level || 1)) * (tool.mult || 1));
    const bonusPts = base * 4;
    this.levelPoints += bonusPts;
    this.air = Math.min(100, this.air + 22);

    /* Если выбрана «📢 Точка пранка» — ставим звуковую приманку пранка прямо в точке клика, и ВСЕ бегут туда! */
    if (skillKey === 'distract') {
      const lx = fromX ?? tx;
      const ly = fromY ?? ty;
      this.spawnPrankLureAt(lx, ly, dur);
      return;
    }

    /* Если выбран «🔥 Огонь из бочки» — поджигаем ближайшую к персонажу бочку, чтобы он в страхе убежал от пламени! */
    if (skillKey === 'overcharge' && this.barrels.length > 0) {
      const nearB = this.barrels.reduce((best, b) => (!best || Math.abs(b.x - tx) < Math.abs(best.x - tx) ? b : best), null);
      if (nearB) {
        this.applySkillToBarrel(nearB, 'overcharge', dur, fromX, fromY);
      }
    }

    if (hitChar.kind === 'ocean') {
      this.oceanState = 'sea';
      this.oceanStateT = Math.max(this.oceanStateT, dur);
      this.oceanHeroSkill = skillKey;
      this.oceanHeroSkillT = dur;
      this.oceanSpeech = skillKey === 'shrink'
        ? 'Эй! Кто надел на меня бочку?! Только ноги торчат, смотрю в темноту!'
        : skillKey === 'freeze'
          ? 'Б-б-бррр! Абсолютная заморозка! Я заледенел на берегу моря!'
          : 'Ого!.. Кажется, меня накрыло навыком — смотрю только на море и не поворачиваюсь!';
      this.oceanSpeechT = 4.2;
      speak(this.oceanSpeech, 'father');
      this.float(tx, hitChar.y - hitChar.h - 14, `⚡ ГЕРОЙ ПОД НАВЫКОМ (${dur}с)! +${bonusPts}`, '#64DFDF');
      return;
    }

    if (hitChar.kind === 'dog') {
      const d = hitChar.d;
      d.skillEffect = skillKey;
      d.skillEffectT = dur;
      d.barkT = 0.8;
      audio.bark();
      this.float(d.x, d.y - hitChar.h - 14, `⚡ ОВЧАРКА ПОД НАВЫКОМ (${dur}с)! +${bonusPts}`, '#64DFDF');
      return;
    }

    const w = hitChar.w;
    w.skillEffect = skillKey;
    w.skillEffectT = dur;
    w.hitRecoilT = 0.65;
    w.litBarrel = null;
    w.beamActiveT = 0;
    w.beamSwitchT = dur + 1.5;
    if (skillKey === 'stealth') {
      w.flashlightFlickerT = 1.35;
    }
    if (this.hunter === w) this.huntCursorT = 0;

    const skillReactions = {
      freeze: {
        mark: '❄️👑',
        floatTxt: `❄️ АБСОЛЮТНАЯ ЗАМОРОЗКА ★ (${dur}с) · ЦЕПИ С 1 УДАРА · ×3! +${bonusPts}`,
        color: '#00E5FF',
        speech: w.key === 'priest'
          ? 'Господи, ледяная глыба сковала меня с головы до пят! Не могу пошевелиться!'
          : 'Б-б-бррр! Меня вморозило в крио-монолит льда! Ни шагнуть, ни посветить!',
      },
      shrink: {
        mark: '🛢️',
        floatTxt: `🛢️ БОЧКА НАДЕТА НА ОХРАННИКА (${dur}с) · ТОЛЬКО НОГИ ТОРЧАТ! +${bonusPts}`,
        color: '#64DFDF',
        speech: 'Эй! Кто надел на меня стальную бочку?! Темно внутри, ничего не вижу — только ноги ходят!',
      },
      distract: {
        mark: '📻',
        floatTxt: `📢 ЗВУК ПРАНКА (${dur}с) — ВСЕ БЕГУТ ТУДА! +${bonusPts}`,
        color: '#F4A261',
        speech: 'Слышите?! Там голосовой пранк орёт! Все бежим туда проверять!',
      },
      stealth: {
        mark: '🔦✖',
        floatTxt: `👻 ФОНАРЬ МИГАЕТ И ОТРУБАЕТСЯ (${dur}с)! +${bonusPts}`,
        color: '#9D4EDD',
        speech: 'Чёрт! Фонарь заискрил, замигал и совсем отрубился! В темноте тебя вообще не вижу!',
      },
      fragile: {
        mark: '🔨',
        floatTxt: `🔨 ОХРАННИК ОГЛУШЁН · ЦЕПИ ХРУПКИЕ (${dur}с)! +${bonusPts}`,
        color: '#E07A5F',
        speech: 'Ай! От этой звуковой волны даже стальные цепи трещат по швам!',
      },
      overcharge: {
        mark: '🔥😱',
        floatTxt: `🔥 ОГОНЬ ИЗ БОЧКИ (${dur}с) · ОХРАНА В СТРАХЕ УБЕГАЕТ! +${bonusPts}`,
        color: '#FF5400',
        speech: 'А-а-а! Из бочки пламя хлещет! Боюсь огня — близко туда не подойду!',
      },
      jackpot: {
        mark: '🎁',
        floatTxt: `🎁 ДЖЕКПОТ С ОХРАНЫ + ВЫБИРАЙ ПРИЗОВЫЕ БОЧКИ (${dur}с)! +${bonusPts}`,
        color: '#D4A843',
        speech: 'Эй! Из моих карманов посыпались золотые жетоны для призовых бочек!',
      },
      xray: {
        mark: '👁️',
        floatTxt: `👁️ СКАНЕР ОХРАНЫ: ВИДНЫ ВСЕ БОЧКИ (${dur}с)! +${bonusPts}`,
        color: '#80ED99',
        speech: 'Он считал мою карту обхода! Теперь все бочки просвечиваются насквозь!',
      },
      oxygen: {
        mark: '💨',
        floatTxt: `💨 ОТОБРАН БАЛЛОН O₂ (100% ВОЗДУХА · ${dur}с)! +${bonusPts}`,
        color: '#56CFE1',
        speech: 'Эй! Мой запасной кислородный баллон улетел прямо в бочку!',
      },
      magnet: {
        mark: '🧲',
        floatTxt: `🧲 МАГНИТ СОРВАЛ КЛЮЧИ И ЦЕПИ (${dur}с)! +${bonusPts}`,
        color: '#F72585',
        speech: 'Ай! Магнитом вырвало связку ключей и сорвало цепь с бочки!',
      },
    };

    const react = skillReactions[skillKey] || skillReactions.freeze;
    w.mark = react.mark;
    w.markT = Math.min(dur, 4.5);
    w.speech = react.speech;
    w.speechT = 4.2;

    if (skillKey === 'freeze') {
      w.mode = 'pause';
      w.pauseT = dur;
      w.vx = 0;
    } else if (skillKey === 'shrink') {
      /* В надетой бочке персонаж смешно бродит туда-сюда — только ноги торчат снизу! */
      w.mode = 'walk';
    } else if (skillKey === 'distract' || skillKey === 'overcharge') {
      w.mode = 'walk';
      w.dir = w.x > this.view.x + this.view.w * 0.5 ? 1 : -1;
    } else {
      w.mode = 'pause';
      w.pauseT = Math.min(dur, 2.2);
    }

    const pan = ((w.x - this.view.x) / (this.view.w || W)) * 2 - 1;
    if (w.dog) {
      audio.bark();
    } else {
      const pitch = skillKey === 'shrink' ? 0.78 : (w.key === 'priest' ? 0.85 : 0.98);
      audio.voiceMumble(pan, pitch);
      if (!audio.isMuted()) speak(react.speech, w.key);
    }
    this.float(w.x, hitChar.y - hitChar.h - 16, react.floatTxt, react.color);
  }

  /* Установка звуковой точки голосового пранка в то место (x, y), куда ткнул игрок — ВСЕ бегут туда! */
  spawnPrankLureAt(x, y, dur = 8) {
    const v = this.view || { x: 0, y: 0, w: W, h: H };
    const lx = Math.max(v.x + 48, Math.min(v.x + v.w - 48, x));
    const ly = Math.max(v.y + 115, Math.min(v.y + v.h - 28, y));
    this.prankLure = { x: lx, y: ly, timer: dur, maxTimer: dur };
    this.huntCursorT = 0;
    this.triggerLoudspeakerBroadcast(true);

    [this.walker, this.secondWalker].filter(Boolean).forEach((w, idx) => {
      w.skillEffect = 'distract';
      w.skillEffectT = dur;
      w.litBarrel = null;
      w.beamActiveT = 0;
      w.mode = 'walk';
      w.dir = lx >= w.x ? 1 : -1;
      w.mark = '📻';
      w.markT = dur;
      if (idx === 0) {
        w.speech = 'Слышите?! Там голосовой пранк гремит! Все бежим туда проверять!';
        w.speechT = 4.0;
      }
    });
    if (this.betweenDog) {
      this.betweenDog.targetX = lx;
      this.betweenDog.barkT = 0;
      audio.bark();
    }
    this.float(lx, ly - 26, `📢🔊 ЗВУК ПРАНКА ЗДЕСЬ (${dur}с) — ВСЕ БЕГУТ СЮДА!`, '#F4A261');
  }

  /* Применение навыка из руки ПРЯМО НА БОЧКУ */
  applySkillToBarrel(b, skillKey, dur, fromX, fromY) {
    if (!b) return;
    const bh = this.bh;
    const tx = b.x;
    const ty = b.y - bh * 0.5;
    this.spawnSkillBeam(fromX ?? tx, (fromY ?? ty) - 24, tx, ty, this.handSkill?.accent || '#D4A843', this.handSkill?.icon || '⚡');
    b.shake = 1.45;

    const tool = currentTool();
    const base = Math.round(S.multitap * (1 + (this.level || 1)) * (tool.mult || 1));

    /* А) «📢 Точка пранка» на бочке — ставит кричащий динамик пранка прямо на эту бочку, все бегут к ней */
    if (skillKey === 'distract') {
      this.spawnPrankLureAt(tx, ty, dur);
      return;
    }

    /* Б) «🛢️ Одеть бочку» при клике на бочку — надевает эту бочку прямо на главного охранника! */
    if (skillKey === 'shrink' && this.walker) {
      this.applySkillToCharacter({
        kind: 'walker',
        w: this.walker,
        x: this.walker.x,
        y: this.walkerY(this.walker),
        h: this.walkerH(this.walker),
        key: this.walker.key,
      }, 'shrink', dur, tx, ty);
      return;
    }

    /* В) «🔥 Огонь из бочки» — из выбранной бочки вырывается ревущее пламя, охрана боится и убегает от неё! */
    if (skillKey === 'overcharge') {
      b.onFireUntil = this.t + dur;
      b.trap = false;
      if (b.kind === 'fallen') b.kind = 'closed';
      if (b.kind === 'chained') {
        b.chainDamage = 1;
        this.spawnBrokenChains(b.x, b.y - bh * 0.5, 10);
        b.kind = 'closed';
      }
      b.chainRemoved = false;
      b.hasAirBubble = true;
      const fireBonus = base * 5;
      this.levelPoints += fireBonus;
      this.progress = Math.min(this.goal || 25, this.progress + 2);
      this.air = Math.min(100, this.air + 20);
      audio.chainBreak(0);
      audio.coin(2.1);
      [this.walker, this.secondWalker].filter(Boolean).forEach((w, idx) => {
        if (Math.abs(w.x - b.x) < 250) {
          w.litBarrel = null;
          w.beamActiveT = 0;
          w.mark = '🔥😱';
          w.markT = 3.2;
          w.dir = w.x >= b.x ? 1 : -1;
          if (idx === 0) {
            w.speech = 'Огонь валит прямо из бочки! Боюсь пламени — не подхожу туда!';
            w.speechT = 3.8;
            if (!w.dog && !audio.isMuted()) speak(w.speech, w.key);
          }
        }
      });
      this.float(b.x, b.y - bh * 1.02, `🔥 ОГОНЬ ИЗ БОЧКИ (${dur}с)! ОХРАНА БОИТСЯ! +${fireBonus}`, '#FF5400');
      if (this.progress >= this.goal && this.active) {
        this.active = false;
        this.ev.onWin(Math.floor(this.levelPoints));
      }
      return;
    }

    /* Г) «🎁 Выбрать призовые бочки» — превращает выбранную бочку в Золотую Призовую Бочку и сразу выдаёт ПРИЗ! */
    if (skillKey === 'jackpot') {
      b.trap = false;
      if (b.kind === 'fallen') b.kind = 'closed';
      if (b.kind === 'chained') {
        this.spawnBrokenChains(b.x, b.y - bh * 0.5, 10);
        b.kind = 'closed';
      }
      b.chainRemoved = false;
      b.isPrizeBarrel = true;
      b.prizeUntil = this.t + Math.max(dur, 8);
      b.hasAirBubble = true;
      const prizePts = base * 6;
      const prizeEnergy = 65 + (this.level || 1) * 10;
      this.levelPoints += prizePts;
      S.energy = Math.min(S.energyMax || 1000, (S.energy || 0) + prizeEnergy);
      this.air = Math.min(100, this.air + 25);
      this.progress = Math.min(this.goal || 25, this.progress + 2);
      save();
      audio.barrelMelodyBeat(1, 3);
      audio.coin(2.4);
      this.float(b.x, b.y - bh * 1.02, `🎁 ПРИЗОВАЯ БОЧКА: +${prizePts} · ⚡+${prizeEnergy} · 💨+25% O₂!`, '#FFD166');
      if (this.progress >= this.goal && this.active) {
        this.active = false;
        this.ev.onWin(Math.floor(this.levelPoints));
      }
      return;
    }

    /* 1) Если навык направлен на бочку-ловушку — навык ОБЕЗВРЕЖИВАЕТ ловушку и превращает её в призовую бочку! */
    if (b.trap) {
      b.trap = false;
      b.kind = 'closed';
      b.hasAirBubble = true;
      b.rewardType = 'air';
      const disarmBonus = base * 5;
      this.levelPoints += disarmBonus;
      this.progress = Math.min(this.goal || 25, this.progress + 2);
      this.air = Math.min(100, this.air + 20);
      audio.chainBreak(0);
      audio.coin(2.1);
      this.float(b.x, b.y - bh * 0.95, `🛠️ ЛОВУШКА ОБЕЗВРЕЖЕНА НАВЫКОМ! +${disarmBonus} · 💨+20% O₂`, '#80ED99');
      return;
    }

    /* 2) Если навык направлен на бочку в натуральной цепи — мгновенно срывает цепь с выдачей всех ништяков! */
    if (b.kind === 'chained') {
      b.chainDamage = 1;
      this.handleChainedBarrelHit(b, { ...tool, chainHits: 1 }, base * 2, Math.max(2, this.combo), 0);
      return;
    }

    /* 3) Обычная или целевая бочка — получает мощный заряд навыка */
    b.chainRemoved = false;
    const hitGain = base * 4 * Math.max(1, this.combo);
    this.applyBarrelReward(b, hitGain, 2, 0, this.isOcean);
    if (this.progress >= this.goal && this.active) {
      this.active = false;
      this.ev.onWin(Math.floor(this.levelPoints));
    }
  }

  /* Проверка: светит ли сейчас фонарик Отца или другого персонажа прямо на эту бочку */
  getWatcherOfBarrel(b) {
    if (!b) return null;
    if ((b.onFireUntil || 0) > this.t) return null;
    if (this.prankLure && this.prankLure.timer > 0) return null;
    if (this.skills && (this.skills.stealth > 0 || this.skills.freeze > 0 || this.skills.distract > 0)) return null;
    const list = [this.walker, this.secondWalker].filter(Boolean);
    for (const w of list) {
      if (w.skillEffect && w.skillEffectT > 0) continue;
      if (w.litBarrel === b && w.beamActiveT > 0) return w;
      if (w.mode === 'watch' && w.targetB === b) return w;
    }
    return null;
  }

  /* Включение трансляции голосового пранка через заводской громкоговоритель под потолком */
  triggerLoudspeakerBroadcast(fromSkill = false) {
    const res = audio.playPrankLoudspeaker();
    if (!res || res.stopped) return;
    this.loudspeakerBannerT = 6.5;
    this.loudspeakerLabel = res.track ? res.track.label : '🎙️ ЭФИР ПРАНКА';
    if (this.walker && (fromSkill || this.walker.speechT <= 0.4)) {
      const line = fromSkill
        ? 'Слышите голосовой пранк?! Бежим проверять, откуда звук!'
        : 'Опять этот пранкер взломал громкоговоритель цеха!.. Кто крутит эту запись?!';
      this.walker.speech = line;
      this.walker.speechT = 3.6;
      if (fromSkill) {
        this.walker.litBarrel = null;
        this.walker.beamActiveT = 0;
      }
    }
  }

  /* Активация выбранного навыка за энергию ⚡ прямо во время раунда (кроме Ур. 07 «Достучаться до небес», где карточки усиления не работают!) */
  activateSkill(skillKey, dur = 7, cardTitle = '') {
    if (this.isOcean || (this.level === 7 && this.cfg?.isOcean)) {
      this.clearHandSkill(true);
      return;
    }
    if (!this.skills) {
      this.skills = { fragile: 0, shrink: 0, freeze: 0, stealth: 0, distract: 0, overcharge: 0, jackpot: 0, xray: 0, oxygen: 0, magnet: 0 };
    }
    const v = this.view || { x: 0, y: 0, w: W, h: H };
    const cx = v.x + v.w * 0.5;
    const cy = v.y + v.h * 0.44;
    this.skills[skillKey] = Math.max(this.skills[skillKey] || 0, dur);

    if (skillKey === 'oxygen') {
      this.air = 100;
      audio.coin(2.0);
      this.float(cx, cy, `💨 КИСЛОРОД 100% + ЩИТ (${dur}с)!`, '#56CFE1');
    } else if (skillKey === 'freeze') {
      /* ❄️ АБСОЛЮТНАЯ ЗАМОРОЗКА ★ — сковывает льдом ВСЕХ охранников и овчарку, замораживает таймер, цепи с 1 удара, очки ×3! */
      this.huntCursorT = 0;
      [this.walker, this.secondWalker].filter(Boolean).forEach((w) => {
        w.skillEffect = 'freeze';
        w.skillEffectT = dur;
        w.litBarrel = null;
        w.beamActiveT = 0;
        w.vx = 0;
        w.mode = 'pause';
        w.pauseT = dur;
        w.mark = '❄️👑';
        w.markT = dur;
      });
      if (this.betweenDog) {
        this.betweenDog.skillEffect = 'freeze';
        this.betweenDog.skillEffectT = dur;
        this.betweenDog.vx = 0;
      }
      audio.barrelMelodyBeat(2, 3);
      audio.chainBreak(0);
      this.float(cx, cy, `❄️👑 АБСОЛЮТНАЯ ЗАМОРОЗКА ★ (${dur}с): ВСЕ ВО ЛЬДУ · ЦЕПИ 1 УД. · ×3!`, '#00E5FF');
    } else if (skillKey === 'stealth') {
      /* 👻 НЕВИДИМКА — у всех охранников фонарь мигает 1.35с и полностью отрубается! */
      this.huntCursorT = 0;
      [this.walker, this.secondWalker].filter(Boolean).forEach((w, idx) => {
        w.skillEffect = 'stealth';
        w.skillEffectT = dur;
        w.flashlightFlickerT = 1.35;
        w.litBarrel = null;
        w.beamActiveT = 0;
        w.mark = '🔦⚡';
        w.markT = dur;
        if (idx === 0) {
          w.speech = 'Фонарь заискрил, замигал и отрубается! В темноте тебя вообще не видно!';
          w.speechT = 4.0;
        }
      });
      audio.coin(1.8);
      this.float(cx, cy, `👻 ФОНАРИ МИГАЮТ И ОТРУБАЮТСЯ (${dur}с) — ПЕРСОНАЖИ НЕ ВИДЯТ!`, '#9D4EDD');
    } else if (skillKey === 'distract') {
      /* 📢 ТОЧКА ПРАНКА — сразу включает динамик пранка в противоположном от целевой бочки углу, и можно переставлять кликом! */
      this.huntCursorT = 0;
      const tb = this.barrels.find((b) => b.target && !b.knockedDown);
      const lureX = tb && tb.x < cx ? v.x + v.w - 85 : v.x + 85;
      const lureY = (this.tierYs && this.tierYs[this.tierYs.length - 1]) ? this.tierYs[this.tierYs.length - 1] - 32 : v.y + v.h * 0.78;
      this.spawnPrankLureAt(lureX, lureY, dur);
      audio.coin(1.8);
    } else if (skillKey === 'fragile') {
      audio.chainBreak(0);
      this.float(cx, cy, `🔨 ХРУПКАЯ СТАЛЬ (${dur}с): ЦЕПИ С 1 УДАРА · ×2!`, '#E07A5F');
    } else if (skillKey === 'shrink') {
      /* 🛢️ ОДЕТЬ БОЧКУ — сразу надевает стальные бочки на охранников (снизу торчат только ноги!), очки ×3! */
      this.huntCursorT = 0;
      [this.walker, this.secondWalker].filter(Boolean).forEach((w, idx) => {
        w.skillEffect = 'shrink';
        w.skillEffectT = dur;
        w.litBarrel = null;
        w.beamActiveT = 0;
        w.mode = 'walk';
        w.mark = '🛢️';
        w.markT = dur;
        if (idx === 0) {
          w.speech = 'Эй! Кто надел на меня стальную бочку?! Темно внутри — только ноги ходят!';
          w.speechT = 4.0;
        }
      });
      audio.coin(1.9);
      this.float(cx, cy, `🛢️ ОДЕТЬ БОЧКУ (${dur}с): ОХРАНА В БОЧКАХ (ТОЛЬКО НОГИ) · ×3!`, '#64DFDF');
    } else if (skillKey === 'overcharge') {
      /* 🔥 ОГОНЬ ИЗ БОЧКИ — сразу зажигает пламя из стоящей бочки (охрана в страхе разбегается) + можно зажигать другие кликом! */
      this.huntCursorT = 0;
      const fireCands = this.barrels.filter((b) => !b.trap && !b.knockedDown);
      const fireTarget = fireCands.find((b) => b.target) || fireCands[0];
      if (fireTarget) {
        this.applySkillToBarrel(fireTarget, 'overcharge', dur, cx, cy);
      } else {
        audio.chainBreak(0);
        this.float(cx, cy, `🔥 ОГОНЬ ИЗ БОЧКИ (${dur}с): ОХРАНА БОИТСЯ ПЛАМЕНИ · ×4!`, '#FF5400');
      }
    } else if (skillKey === 'jackpot') {
      /* 🎁 ВЫБРАТЬ ПРИЗОВЫЕ БОЧКИ — сразу делает стоящие бочки золотыми призовыми! */
      const prizeCands = this.barrels.filter((b) => !b.trap && !b.knockedDown);
      prizeCands.slice(0, 3).forEach((b) => {
        b.isPrizeBarrel = true;
        b.prizeUntil = this.t + Math.max(dur, 8);
        b.hasAirBubble = true;
      });
      audio.barrelMelodyBeat(0, 3);
      audio.coin(2.4);
      this.float(cx, cy, `🎁 ПРИЗОВЫЕ БОЧКИ АКТИВНЫ (${dur}с) — СТУЧИ ПО ЗОЛОТЫМ БОЧКАМ!`, '#FFD166');
    } else if (skillKey === 'xray') {
      audio.coin(1.7);
      this.float(cx, cy, `👁️ РЕНТГЕН БОЧЕК (${dur}с): ВИДНО ВСЁ НАСКВОЗЬ!`, '#80ED99');
    } else if (skillKey === 'magnet') {
      this.air = Math.min(100, this.air + 35);
      const tool = currentTool();
      const base = Math.round(S.multitap * (1 + (this.level || 1)) * (tool.mult || 1));
      const chainedB = this.barrels.find((b) => b.kind === 'chained');
      if (chainedB) {
        chainedB.chainDamage = 1;
        this.handleChainedBarrelHit(chainedB, { ...tool, chainHits: 1 }, base, Math.max(2, this.combo), 0);
      } else {
        const bonus = base * 6;
        this.levelPoints += bonus;
        this.progress = Math.min(this.goal || 20, this.progress + 3);
        audio.chainBreak(0);
        audio.coin(2.3);
        this.float(cx, cy, `🧲 МАГНИТ НИШТЯКОВ: +${bonus} · 💨+35% O₂!`, '#F72585');
        if (this.progress >= this.goal && this.active) {
          this.active = false;
          this.ev.onWin(Math.floor(this.levelPoints));
        }
      }
    }
  }

  /* Если игрок ударил по бочке, на которую светил фонарик персонажа — луч приклеивается к курсору! */
  triggerCursorHunt(w, b) {
    const catcher = w || this.walker;
    this.huntCursorT = 4.2;
    this.hunter = catcher;
    catcher.litBarrel = null;
    catcher.beamActiveT = 0;
    catcher.mode = 'watch';
    catcher.watchT = 4.2;
    catcher.targetB = null;
    catcher.mark = '!';
    catcher.markT = 2.5;
    const pan = ((catcher.x - this.view.x) / (this.view.w || W)) * 2 - 1;
    audio.alarmLock(pan);
    this.speakWalker(catcher, 'beamCaught');
    this.ev.toast('beamCaughtToast');
    if (b) {
      this.float(b.x, b.y - this.bh, '🔦 ЛУЧ!', '#9E2A2B');
    }
  }

  /* Реакция патрульного: услышал стук по пустой бочке рядом — бежит к ней и светит фонарём на эту бочку */
  alertWalker(b) {
    const w = this.walker, v = this.view;
    if ((b.onFireUntil || 0) > this.t) return;
    if (this.prankLure && this.prankLure.timer > 0) return;
    if (w.skillEffect && w.skillEffectT > 0) return;
    w.litBarrel = b;
    w.beamActiveT = 2.8;
    if (w.mode === 'watch') { w.watchT = Math.max(w.watchT, 2); this.air -= 3; return; }
    if (w.mode === 'alert' || Math.abs(w.x - b.x) > v.w * 0.65) return;
    w.mode = 'alert'; w.targetX = b.x + (b.x > w.x ? -70 : 70); w.targetB = b; w.dir = b.x > w.x ? 1 : -1;
    w.mark = '!'; w.markT = 1.2;
    if (w.dog) audio.bark(); else audio.creak();
    if (w.speechT <= 0.6) this.speakWalker(w, 'wrong');
    this.float(w.x, this.walkerY(w) - this.walkerH(w) - 10, '!', '#9E2A2B');
  }

  updateSingleWalker(w, dt) {
    if (!w) return;
    const v = this.view, a = w.actor;
    w.markT = Math.max(0, w.markT - dt);
    w.speechT = Math.max(0, w.speechT - dt);
    w.hitRecoilT = Math.max(0, (w.hitRecoilT || 0) - dt);
    w.flashlightFlickerT = Math.max(0, (w.flashlightFlickerT || 0) - dt);
    if (w.skillEffectT > 0) {
      w.skillEffectT = Math.max(0, w.skillEffectT - dt);
      if (w.skillEffectT <= 0) w.skillEffect = null;
    }
    w.nextSpeechT -= dt;
    if (w.slot === 0 && w.nextSpeechT <= 0 && w.x > v.x + 60 && w.x < v.x + v.w - 60) {
      this.speakWalker(w);
    }

    /* 1. Если этот персонаж заморожен навыком «❄️ Абсолютная Заморозка ★» — стоит в глыбе льда без движения и без луча фонаря */
    if ((w.skillEffect === 'freeze' && w.skillEffectT > 0) || (this.skills && this.skills.freeze > 0)) {
      w.vx = 0;
      w.litBarrel = null;
      w.beamActiveT = 0;
      a.setVelocity(0);
      return;
    }
    if (w.skillEffect === 'stealth' || w.skillEffect === 'distract' || w.skillEffect === 'shrink') {
      w.litBarrel = null;
      w.beamActiveT = 0;
    }

    /* 2. Если рядом горит бочка («🔥 Огонь из бочки») — персонаж панически боится пламени и убегает прочь! */
    const fireB = this.barrels.find((b) => (b.onFireUntil || 0) > this.t && Math.abs(b.x - w.x) < 230);
    if (fireB) {
      w.litBarrel = null;
      w.beamActiveT = 0;
      if (this.hunter === w) this.huntCursorT = 0;
      const fleeDir = w.x >= fireB.x ? 1 : -1;
      w.dir = fleeDir;
      w.mode = 'walk';
      w.mark = '🔥😱';
      w.markT = Math.max(w.markT, 0.5);
      if (w.speechT <= 0.2) {
        w.speech = 'Огонь хлещет прямо из бочки! Боюсь пламени — не подхожу туда!';
        w.speechT = 3.2;
      }
      const edgeStop = (fleeDir > 0 && w.x > v.x + v.w - 75) || (fleeDir < 0 && w.x < v.x + 75);
      moveX(w, edgeStop ? 0 : fleeDir * (w.speed * 1.65), dt, 780);
      a.play(Math.abs(w.vx) > 20 ? 'walk' : 'idle');
      a.setVelocity(w.vx);
      a.look(edgeStop ? -fleeDir : fleeDir);
      a.update(dt);
      return;
    }

    /* 3. Если активна звуковая точка голосового пранка («📢 Отвлечь пранком») — ВСЕ персонажи бегут к точке пранка! */
    if (this.prankLure && this.prankLure.timer > 0) {
      w.litBarrel = null;
      w.beamActiveT = 0;
      if (this.hunter === w) this.huntCursorT = 0;
      const pdx = this.prankLure.x - w.x;
      w.mark = '📻';
      w.markT = Math.max(w.markT, 0.4);
      if (Math.abs(pdx) > 34) {
        w.dir = Math.sign(pdx);
        moveX(w, w.dir * Math.max(95, w.speed * 1.75), dt, 740);
        a.play('walk');
      } else {
        moveX(w, 0, dt, 640);
        a.play(w.dog ? 'sniff' : 'point');
      }
      a.setVelocity(w.vx);
      a.look(w.dir);
      a.update(dt);
      return;
    }

    /* Управление лучом фонарика, который по очереди проверяет бочки */
    if (this.huntCursorT > 0 && this.hunter === w) {
      w.litBarrel = null;
      w.beamActiveT = 0;
      const lx = this.light ? this.light.x : v.x + v.w / 2;
      w.dir = lx >= w.x ? 1 : -1;
      const dx = lx - w.x;
      const chaseVx = Math.abs(dx) > 45 ? Math.sign(dx) * 85 : 0;
      moveX(w, chaseVx, dt, 620);
      a.play(Math.abs(w.vx) > 20 ? 'walk' : 'point');
      a.setVelocity(w.vx);
      a.look(w.dir);
      a.update(dt);
      return;
    }

    if (w.beamActiveT > 0) {
      w.beamActiveT -= dt;
      if (w.litBarrel) {
        w.dir = w.litBarrel.x >= w.x ? 1 : -1;
      }
      if (w.beamActiveT <= 0) {
        w.litBarrel = null;
        w.beamSwitchT = 1.8 + Math.random() * 2.2;
      }
    } else if (this.active && this.barrels.length > 0 && !(w.skillEffect && w.skillEffectT > 0)) {
      w.beamSwitchT -= dt;
      if (w.beamSwitchT <= 0) {
        /* Персонаж выбирает стоящую бочку (кроме горящих и упавших!) и наводит на неё луч фонаря на 2.2–3.0 сек */
        const cands = this.barrels.filter((b) => !b.trap && !b.knockedDown && !((b.onFireUntil || 0) > this.t));
        if (cands.length) {
          /* С вероятностью 35% проверяет целевую бочку, иначе соседнюю */
          const targetB = cands.find((b) => b.target);
          const pick = (targetB && Math.random() < 0.35)
            ? targetB
            : cands[Math.floor(Math.random() * cands.length)];
          w.litBarrel = pick;
          w.beamActiveT = 2.1 + Math.random() * 1.1;
          w.dir = pick.x >= w.x ? 1 : -1;
        }
      }
    }

    const y = this.walkerY(w), h = this.walkerH(w);
    let target = 0, accel = w.dog ? 900 : 420;
    const still = Math.abs(w.vx) < 4;
    /* Если на охранника надета бочка («🛢️ Одеть бочку») — он всё время бродит вслепую, только ноги торчат! */
    if (w.skillEffect === 'shrink' && w.skillEffectT > 0) {
      target = w.dir * (w.speed * 0.85);
      a.play('walk');
      if (w.dir > 0 && w.x > v.x + v.w - 75) w.dir = -1;
      if (w.dir < 0 && w.x < v.x + 75) w.dir = 1;
    } else if (w.mode === 'pause') {
      w.pauseT -= dt; a.play(still ? (w.dog ? 'sniff' : 'flash') : 'walk');
      if (w.pauseT <= 0) w.mode = 'walk';
    } else if (w.mode === 'alert') {
      const dx = w.targetX - w.x;
      if (Math.abs(dx) < 8 && Math.abs(w.vx) < 30) { w.mode = 'watch'; w.watchT = 2.4; w.dir = w.targetB && w.targetB.x > w.x ? 1 : -1; }
      else { target = Math.sign(dx) * Math.min(w.dog ? 190 : 110, Math.abs(dx) * 3 + 20); w.dir = Math.sign(dx); accel = w.dog ? 1300 : 650; a.play(Math.abs(w.vx) > 60 ? 'run' : 'walk'); }
    } else if (w.mode === 'watch') {
      w.watchT -= dt; a.play(still ? (w.dog ? 'bark' : 'point') : 'walk');
      if (this.active) this.air -= dt * (w.dog ? 5 : 4);
      if (w.watchT <= 0) { w.mode = 'walk'; w.targetB = null; w.dir = Math.random() < 0.5 ? -1 : 1; }
    } else {
      target = w.dir * w.speed; a.play(still ? 'idle' : 'walk');
      if (w.dir > 0 && w.x > v.x + v.w - 70) { w.dir = -1; w.mode = 'pause'; w.pauseT = 1.2 + Math.random() * 1.6; }
      if (w.dir < 0 && w.x < v.x + 70) { w.dir = 1; w.mode = 'pause'; w.pauseT = 1.2 + Math.random() * 1.6; }
      if (Math.random() < dt * 0.08 && w.x > v.x + 80 && w.x < v.x + v.w - 80) { w.mode = 'pause'; w.pauseT = 1.4 + Math.random() * 1.8; }
    }
    moveX(w, target, dt, accel);
    a.setVelocity(w.vx);
    a.look(w.litBarrel ? (w.litBarrel.x >= w.x ? 1 : -1) : (Math.abs(w.vx) > 10 ? Math.sign(w.vx) : w.dir));
    a.update(dt);
    if (a.consumeStep() && w.x >= v.x - 40 && w.x <= v.x + v.w + 40) {
      const pan = ((w.x - v.x) / (v.w || W)) * 2 - 1;
      audio.step(pan, w.dog, w.mode === 'alert' ? 1.15 : 0.78);
    }
  }

  update(dt) {
    this.t += dt;
    this.toolSwing = Math.max(0, this.toolSwing - dt * 4.5);
    this.floats = this.floats.filter((f) => (f.life -= dt) > 0); this.floats.forEach((f) => (f.y -= 60 * dt));
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0); this.sparks.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; });
    this.chainLinks = this.chainLinks.filter((c) => (c.life -= dt) > 0);
    this.chainLinks.forEach((c) => { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 620 * dt; c.rot += c.vr * dt; });
    this.skillBeams = (this.skillBeams || []).filter((bm) => (bm.life -= dt) > 0);
    this.shake = Math.max(0, this.shake - dt * 4);
    this.barrels.forEach((b) => { b.x += (b.tx - b.x) * Math.min(1, dt * 6); b.y += (b.ty - b.y) * Math.min(1, dt * 6); b.shake = Math.max(0, b.shake - dt * 3); b.lid = Math.max(0, b.lid - dt); });
    if (this.prankLure && this.prankLure.timer > 0) {
      this.prankLure.timer = Math.max(0, this.prankLure.timer - dt);
      if (this.prankLure.timer <= 0) this.prankLure = null;
    }
    if (this.paused) return;

    /* Таймер навыка В РУКЕ: когда время навыка кончается — в руку автоматически возвращается молоток/инструмент! */
    if (this.handSkill && this.handSkill.state === 'active') {
      this.handSkill.timeLeft = Math.max(0, this.handSkill.timeLeft - dt);
      if (this.handSkill.timeLeft <= 0) {
        audio.knock(0, 0.5);
        this.clearHandSkill(false);
      }
    }

    /* Периодическая смена российских имён на бочках */
    this.nameCycleT -= dt;
    if (this.nameCycleT <= 0) {
      this.nameCycleT = 3.2 + Math.random() * 1.8;
      this.cycleOneRussianName();
    }

    /* Таймеры активных навыков и громкоговорителя цеха */
    if (this.skills) {
      Object.keys(this.skills).forEach((k) => {
        if (this.skills[k] > 0) this.skills[k] = Math.max(0, this.skills[k] - dt);
      });
    }
    this.loudspeakerBannerT = Math.max(0, (this.loudspeakerBannerT || 0) - dt);

    const freezeOn = !!(this.skills && this.skills.freeze > 0);
    const oxyShieldOn = !!(this.skills && this.skills.oxygen > 0) || !!S.godMode;
    if (S.godMode) {
      this.air = 100;
      S.energy = Math.max(S.energy || 0, S.energyMax || 5000);
      if (!(this.isAltarFather && this.fatherChained && (this.fatherChained.livesSacrificed > 0 || this.fatherChained.cutscene))) {
        S.lives = Math.max(S.lives || 5, S.livesMax || 5);
      }
    }

    if (this.isOcean) {
      if (this.handSkill) this.clearHandSkill(true);
      this.oceanSpeechT = Math.max(0, this.oceanSpeechT - dt);
      this.oceanWaveT -= dt;
      if (this.oceanWaveT <= 0) {
        this.oceanWaveT = 3.0 + Math.random() * 1.4;
        if (this.active) audio.oceanWave((Math.random() - 0.5) * 0.6);
      }
      if (!this.active) return;
      if (!S.godMode) this.time -= dt;
      this.idle += dt;
      if (!S.godMode) this.air -= dt * (this.cfg.airDrain || 2.8);
      if (this.comboUntil > 0 && this.t > this.comboUntil) this.combo = 1;

      /* Цикл поворота сидящего на крыше завода героя:
         'sea' (смотрит на море, стучать МОЖНО) -> 'turning' (предупреждение 0.85с) -> 'turned' (ПОВЕРНУЛСЯ И СМОТРИТ: СТУЧАТЬ НЕЛЬЗЯ ВООБЩЕ!) */
      this.oceanStateT -= dt;
      if (this.oceanStateT <= 0) {
        if (this.oceanState === 'sea') {
          this.oceanState = 'turning';
          this.oceanStateT = 0.85;
          audio.creak();
        } else if (this.oceanState === 'turning') {
          this.oceanState = 'turned';
          this.oceanStateT = 2.3 + Math.random() * 0.9;
          this.oceanSpeech = 'Тихо! Я смотрю прямо на бочки — СТУЧАТЬ НЕЛЬЗЯ ВООБЩЕ!';
          this.oceanSpeechT = 2.6;
          audio.voiceMumble(-0.35, 0.9);
        } else {
          this.oceanState = 'sea';
          this.oceanStateT = 2.4 + Math.random() * 1.2;
          this.oceanStrikes = 0;
          this.oceanSpeech = walkerLine('ocean');
          this.oceanSpeechT = 3.4;
          if (!audio.isMuted()) speak(this.oceanSpeech, 'priest');
        }
      }

      /* Пока он смотрит на море, бочка «ТИЛЬ» с рукой покачивается и подаёт знак */
      this.knockT -= dt;
      if (this.knockT <= 0 && this.oceanState === 'sea') {
        const tb = this.barrels[0];
        if (tb) {
          tb.shake = 0.85;
          audio.knock(0.22, 0.45);
        }
        this.knockT = 1.2 + Math.random() * 0.6;
      }

      if (this.air <= 0 && !S.godMode) { this.air = 60; this.streak = 0; this.active = false; this.ev.onLose('suffocated'); return; }
      if (this.time <= 0 && !S.godMode) { this.active = false; this.ev.onLose('timeout'); return; }
      return;
    }

    if (this.huntCursorT > 0) {
      this.huntCursorT = Math.max(0, this.huntCursorT - dt);
      if (this.huntCursorT <= 0) {
        this.huntStrikes = 0;
        this.hunter = null;
      }
    }
    this.updateSingleWalker(this.walker, dt);
    this.updateSingleWalker(this.secondWalker, dt);
    if (!freezeOn) {
      this.updateBetweenDog(dt);
    }
    if (this.isAltarFather && this.fatherChained) {
      const fc = this.fatherChained;
      fc.shake = Math.max(0, (fc.shake || 0) - dt * 3.5);
      fc.speechT = Math.max(0, (fc.speechT || 0) - dt);
      if (fc.cutscene) {
        fc.cutsceneT = (fc.cutsceneT || 0) + dt;
        if (this.altarFatherActor) {
          this.altarFatherActor.play('action');
          this.altarFatherActor.update(dt);
        }
        if (fc.boyActor) {
          fc.boyActor.play('walk');
          fc.boyActor.update(dt);
        }
        if (fc.cutsceneT >= (fc.cutsceneDur || 4.8)) {
          fc.cutscene = false;
          S.lives = Math.max(3, S.livesMax || 3);
          save();
          this.active = false;
          this.ev.onWin(Math.max(1500, Math.floor(this.levelPoints) + 1500));
        }
        return;
      }
      if (this.altarFatherActor) {
        this.altarFatherActor.play(fc.shake > 0.1 ? 'point' : 'idle');
        this.altarFatherActor.update(dt);
      }
      /* Пастор периодически проверяет фонарём стену алтаря (2.1 сек), если он не заморожен/не ослеплён/не в бочке */
      const guardDisabled = freezeOn
        || (this.skills && this.skills.stealth > 0)
        || (this.prankLure && this.prankLure.timer > 0)
        || (this.walker && this.walker.skillEffect && this.walker.skillEffectT > 0);
      if (guardDisabled) {
        fc.watchedT = 0;
      } else if (fc.watchedT > 0) {
        fc.watchedT = Math.max(0, fc.watchedT - dt);
      } else {
        fc.watchCycleT = (fc.watchCycleT ?? 4.5) - dt;
        if (fc.watchCycleT <= 0) {
          fc.watchedT = 2.0;
          fc.watchCycleT = 4.6 + Math.random() * 2.2;
        }
      }
      this.progress = fc.hitsDone;
      this.goal = fc.hitsMax;
    }
    if (!this.active) return;
    if (!freezeOn && !S.godMode) this.time -= dt;
    this.idle += dt;
    if (!oxyShieldOn) this.air -= dt * (this.cfg.airDrain || (2 + this.level * 0.35));
    if (this.air < 36 && !this.walker.lowAirWarned && this.walker.speechT <= 0.8) {
      this.walker.lowAirWarned = true;
      this.speakWalker(this.walker, 'lowAir');
    }
    if (this.comboUntil > 0 && this.t > this.comboUntil) this.combo = 1;
    if (this.idle > 3 && this.levelPoints > 0 && !S.godMode && !this.isAltarFather) {
      this.levelPoints = Math.max(0, this.levelPoints - dt * (10 + this.level * 8));
    }
    /* target knocks for hint */
    this.knockT -= dt;
    if (this.knockT <= 0) {
      const tb = this.barrels.find((b) => b.target && !b.knockedDown);
      if (tb) {
        tb.shake = 1;
        audio.knock(((tb.x - this.view.x) / this.view.w) * 2 - 1, 0.5);
        if (this.betweenDog && Math.random() < 0.35) {
          this.betweenDog.dir = tb.x >= this.betweenDog.x ? 1 : -1;
          this.betweenDog.barkT = 0.7;
        }
        /* На 4-м уровне (Овчарка Рекс) пёс своим нюхом подсказывает целевую бочку лаем! */
        if (this.level === 4 && this.walker && this.walker.dog && Math.random() < 0.48) {
          this.walker.dir = tb.x >= this.walker.x ? 1 : -1;
          this.walker.mark = '🐾';
          this.walker.markT = 1.1;
        }
      }
      this.knockT = 1.1 + Math.random() * 0.6;
    }
    /* shuffle */
    if (this.cfg.shuffle) {
      this.shuffleT -= dt;
      if (this.shuffleT <= 0) {
        this.shuffleT = this.cfg.shuffle;
        const standing = this.barrels.filter((b) => !b.knockedDown);
        if (standing.length >= 2) {
          const a = standing[Math.floor(Math.random() * standing.length)];
          const b = standing[Math.floor(Math.random() * standing.length)];
          [a.tx, b.tx] = [b.tx, a.tx]; [a.ty, b.ty] = [b.ty, a.ty];
        }
        this.assignRussianNames();
        if (Math.random() < 0.5) this.retarget();
        audio.creak();
        if (this.walker && this.walker.speechT <= 0.8) this.speakWalker(this.walker, 'shuffle');
      }
    }
    /* Периодическое появление воздуха (💨 ВОЗДУХ) на разных СТОЯЩИХ бочках (на упавших плюшки больше не появляются!) */
    this.airSpawnT = (this.airSpawnT ?? 2.8) - dt;
    if (this.airSpawnT <= 0 || (this.air < 62 && !this.barrels.some((b) => !b.trap && !b.knockedDown && b.kind !== 'chained' && !b.chainRemoved && b.hasAirBubble))) {
      this.airSpawnT = this.air < 55 ? 2.0 : 3.2;
      const airCands = this.barrels.filter((b) => !b.trap && !b.knockedDown && b.kind !== 'chained' && !b.chainRemoved && !b.hasAirBubble);
      if (airCands.length) {
        const pick = airCands[Math.floor(Math.random() * airCands.length)];
        pick.hasAirBubble = true;
        pick.rewardType = 'air';
        pick.hasSupply = true;
      }
    }

    /* Сброс пометки «Цепь снята — не стучать» по истечении таймера */
    this.barrels.forEach((b) => {
      if (b.chainRemoved && this.t >= (b.chainRemovedUntil || 0)) {
        b.chainRemoved = false;
      }
    });

    /* specials: появление рук, телефонов и натуральных цепей ТОЛЬКО на стоящих бочках (меньше бочек — меньше плюшек!) */
    this.specialT -= dt;
    if (this.specialT <= 0) {
      this.specialT = 3.2 - Math.min(1.6, this.level * 0.22);
      const hasChainedNow = this.barrels.some((b) => b.kind === 'chained' && !b.knockedDown);
      const cands = this.barrels.filter((b) => !b.trap && !b.knockedDown && !b.target && !b.chainRemoved && b.kind === 'closed');
      if (cands.length) {
        const b = cands[Math.floor(Math.random() * cands.length)];
        b.kind = !hasChainedNow || Math.random() < 0.48
          ? 'chained'
          : (Math.random() < 0.5 ? 'hand' : 'phone');
        b.specialUntil = b.kind === 'chained'
          ? this.t + 28
          : this.t + this.cfg.window + 2.0;
        b.chainTap = 0;
        if (b.kind === 'chained') {
          b.chainDamage = 0;
          b.chainHitsDone = 0;
          b.chainLoot = this.rollChainLoot();
          b.hasAirBubble = false;
        }
        if (this.walker && this.walker.speechT <= 0.8) {
          this.walker.dir = b.x >= this.walker.x ? 1 : -1;
          this.speakWalker(this.walker, b.kind);
        }
      }
    }
    this.barrels.forEach((b) => {
      if (b.kind !== 'closed' && !b.trap && !b.knockedDown && this.t > b.specialUntil) {
        b.kind = 'closed';
        b.chainDamage = 0;
        b.chainHitsDone = 0;
      }
    });
    if (this.air <= 0 && !S.godMode) { this.air = 60; this.streak = 0; this.active = false; this.ev.onLose('suffocated'); return; }
    if (this.time <= 0 && !S.godMode) { this.active = false; this.ev.onLose('timeout'); return; }
  }

  spawnBrokenChains(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      this.chainLinks.push({
        x: x + (Math.random() - 0.5) * 44,
        y: y + (Math.random() - 0.5) * 32,
        vx: (Math.random() - 0.5) * 380,
        vy: -140 - Math.random() * 260,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 16,
        life: 0.75 + Math.random() * 0.4,
      });
    }
  }

  /* Обработка удара по бочке в натуральной цепи:
     - Рукой (Ур.1, chainHits=0) цепь пробить НЕЛЬЗЯ!
     - Инструментом: Молоток (30 уд.), Монтировка (8 уд.), Лопата (6), Ключ (5), Топор (4), Кувалда (3), Кирка (2), Болторез / Отбойный молоток (1 удар!).
     - Все ништяки (⚡ Энергия и 💰 Куш ×4 + O₂) выдаются именно при сбивании цепи!
     - (Жизни за цепи НЕ даются — жизни даются ТОЛЬКО за Поделиться трейлером, Поделиться игрой и за друзей!)
     - После снятия цепи бочка помечается b.chainRemoved = true («НЕ СТУЧАТЬ ПОСЛЕ СНЯТИЯ ЦЕПИ!»). */
  handleChainedBarrelHit(b, tool, base, effCombo, pan = 0) {
    const bh = this.bh;
    const oneHitSkill = !this.isOcean && !!(S.godMode || (this.skills && (this.skills.freeze > 0 || this.skills.fragile > 0 || this.skills.overcharge > 0 || this.skills.jackpot > 0)));
    const reqHits = oneHitSkill ? 1 : (tool.chainHits || 0);

    /* 1. Голой рукой (Ур. 1) цепь пробить нельзя! */
    if (reqHits <= 0) {
      b.shake = 0.65;
      audio.chainClink(pan, 0.72);
      this.float(b.x, b.y - bh * 0.78, '✊ РУКОЙ НЕЛЬЗЯ! ВОЗЬМИ ИНСТРУМЕНТ (◀ ▶)', '#FF6B6B');
      if (this.walker) {
        this.walker.dir = b.x >= this.walker.x ? 1 : -1;
        this.speakWalker(this.walker, 'handChain');
      }
      return;
    }

    /* 2. Наносим урон цепи выбранным инструментом */
    b.chainDamage = (b.chainDamage || 0) + (1 / reqHits);
    b.chainHitsDone = (b.chainHitsDone || 0) + 1;
    b.specialUntil = Math.max(b.specialUntil || 0, this.t + 16);
    /* Небольшой глоток воздуха при работе по цепи, чтобы на 30 ударах молотком не задохнуться */
    this.air = Math.min(100, this.air + 1.5);

    if (b.chainDamage < 0.999) {
      const leftHits = Math.max(1, Math.ceil((1 - b.chainDamage) * reqHits));
      const toolName = (tool[lang] || tool.ru).toUpperCase();
      audio.chainClink(pan, 0.95);
      this.spawnBrokenChains(b.x, b.y - bh * 0.5, 2);
      this.float(b.x, b.y - bh * 0.80, `⛓️ ЦЕПЬ: ЕЩЁ ${leftHits} УД. (${toolName})`, '#D4A843');
      if (b.chainHitsDone === 1 && this.walker && this.walker.speechT <= 1.2) {
        this.walker.dir = b.x >= this.walker.x ? 1 : -1;
        this.speakWalker(this.walker, 'chained');
      }
      return;
    }

    /* 3. Цепь разбита вдребезги! Выдаём ВСЕ НИШТЯКИ, которые были спрятаны за цепью! */
    b.kind = 'closed';
    b.chainDamage = 0;
    b.chainHitsDone = 0;
    b.chainRemoved = true;
    b.chainRemovedUntil = this.t + 8.5;
    if (b.target) this.retarget();

    audio.chainBreak(pan);
    this.spawnBrokenChains(b.x, b.y - bh * 0.5, 14);
    this.streak++;
    if (!this.isAltarFather) {
      this.progress += 3;
    }

    const loot = b.chainLoot || 'energy';
    const bigPoints = base * 4 * effCombo;
    this.levelPoints += bigPoints;
    this.air = Math.min(100, this.air + 24);

    if (loot === 'jackpot') {
      const eGain = 90 + this.level * 15;
      S.energy = Math.min(S.energyMax || 1000, S.energy + eGain);
      this.levelPoints += bigPoints;
      save();
      audio.coin(2.2);
      this.float(b.x, b.y - bh * 0.98, `💰 КУШ ЗА ЦЕПЬЮ: +${bigPoints * 2} · ⚡+${eGain} · 💨+24% O₂`, '#D4A843');
    } else {
      const eGain = 75 + this.level * 14;
      S.energy = Math.min(S.energyMax || 1000, S.energy + eGain);
      save();
      audio.coin(1.9);
      this.float(b.x, b.y - bh * 0.98, `⚡ НИШТЯК ЗА ЦЕПЬЮ: +${eGain} ЭНЕРГИЯ · +${bigPoints} · 💨+24% O₂`, '#5BC0EB');
    }

    this.float(b.x, b.y - bh * 1.18, '🔓 ЦЕПЬ СНЯТА! БОЛЬШЕ ПО НЕЙ НЕ СТУЧИ!', '#FFCC4D');
    if (this.walker) {
      this.walker.dir = b.x >= this.walker.x ? 1 : -1;
      this.speakWalker(this.walker, 'chainOffWarn');
    }
    if (!this.isAltarFather && this.progress >= this.goal) {
      this.active = false;
      this.ev.onWin(Math.floor(this.levelPoints));
    }
  }

  /* Штраф, если игрок продолжает стучать по бочке ПОСЛЕ того, как снял с неё цепь! */
  handleHitAfterChainRemoved(b, base, pan = 0) {
    const bh = this.bh;
    if (S.godMode) {
      this.float(b.x, b.y - bh * 0.92, '⚡ РЕЖИМ БОГА: БЕЗ ШТРАФА ЗА СНЯТУЮ ЦЕПЬ!', '#80ED99');
      return;
    }
    this.streak = 0;
    this.air -= 15;
    this.shake = 0.95;
    this.levelPoints = Math.max(0, this.levelPoints - base * 3);
    audio.alarmLock(pan);
    this.float(b.x, b.y - bh * 0.92, '🚫 ЦЕПЬ УЖЕ СНЯТА! НЕ СТУЧИ! (-15% O₂)', '#FF4D4D');
    this.alertWalker(b);
    if (this.walker) {
      this.walker.dir = b.x >= this.walker.x ? 1 : -1;
      this.speakWalker(this.walker, 'hitAfterChain');
    }
    if (this.air <= 0) {
      this.air = 60;
      this.active = false;
      this.ev.onLose('suffocated');
    }
  }

  findHitBarrel(x, y) {
    const bh = this.bh;
    if (this.isOcean) {
      const mainB = this.barrels[0];
      const hitMain = mainB && Math.abs(x - mainB.x) < bh * 0.95 && y < mainB.y + 34 && y > mainB.y - bh * 1.15;
      const sideB = !hitMain && this.barrels.slice(1).find((bb) => Math.abs(x - bb.x) < bh * 0.45 && y < bb.y + 18 && y > bb.y - bh * 1.18);
      return hitMain ? mainB : (sideB || null);
    }
    const narrow = this.view && this.view.w < 620;
    const hitPadX = narrow ? 0.48 : 0.38;
    const hitPadY = narrow ? 22 : 14;
    const sorted = [...this.barrels].sort((a, b) => b.y - a.y);
    return sorted.find((bb) => Math.abs(x - bb.x) < (bb.kind === 'fallen' ? bh * 0.68 : bh * hitPadX) && y < bb.y + hitPadY && y > bb.y - (bb.kind === 'fallen' ? bh * 0.72 : bh * 1.22)) || null;
  }

  hit(x, y) {
    if (this.paused) return;
    this.toolSwing = 1.0;
    const bh = this.bh;

    const hitAltarFather = this.findHitAltarFather(x, y);
    const hitChar = this.findHitCharacter(x, y);
    const hitB = this.findHitBarrel(x, y);

    /* ОСОБАЯ ЖЁСТКАЯ МЕХАНИКА УРОВНЯ 07 «ДОСТУЧАТЬСЯ ДО НЕБЕС» (КРЫША ЗАВОДА И МОРЕ):
       1. На этом уровне КАРТОЧКИ УСИЛЕНИЯ И БУСТЫ НЕ РАБОТАЮТ ВООБЩЕ!
       2. Когда герой повернулся и смотрит (oceanState === 'turned') — СТУЧАТЬ НЕЛЬЗЯ ВООБЩЕ! */
    if (this.isOcean) {
      if (this.handSkill) this.clearHandSkill(true);
      if (this.skills) {
        Object.keys(this.skills).forEach((k) => { this.skills[k] = 0; });
      }
      if (!this.active) return;

      /* Когда он смотрит — стучать НЕЛЬЗЯ ВООБЩЕ (любое нажатие сразу карается!) */
      if (this.oceanState === 'turned') {
        this.oceanStrikes++;
        this.streak = 0;
        this.combo = 1;
        this.air = Math.max(0, this.air - 35);
        this.shake = 1.65;
        this.oceanStateT = Math.min(3.6, this.oceanStateT + 0.9);
        this.oceanSpeech = 'Я СМОТРЮ ПРЯМО НА БОЧКУ! Когда я повернулся — стучать НЕЛЬЗЯ ВООБЩЕ!';
        this.oceanSpeechT = 3.2;
        audio.alarmLock(0.2);
        const penaltyPts = Math.max(250, Math.floor(this.levelPoints * 0.25));
        this.levelPoints = Math.max(0, this.levelPoints - penaltyPts);
        this.progress = Math.max(0, this.progress - 4);
        this.float(x, y - 26, `🚫 ОН СМОТРИТ! СТУЧАТЬ НЕЛЬЗЯ ВООБЩЕ! (-${penaltyPts} ОЧК · -4 ПРОГРЕСС)`, '#FF4D4D');
        if (!S.godMode) {
          this.active = false;
          this.ev.onLose('caught');
        }
        return;
      }

      if (hitChar && !hitB) {
        this.handleCharacterToolTap(hitChar, x, y);
        return;
      }

      const b = hitB;
      if (!b) return;
      if (b.knockedDown) {
        b.shake = 0.55;
        audio.knock(0.2, 0.25);
        this.float(b.x, b.y - bh * 0.72, '🚫 БОЧКА УПАЛА И КОНЧИЛАСЬ — СТУЧИ ПО СТОЯЩЕЙ!', '#FF6B6B');
        return;
      }
      if (S.energy < 1 && !S.godMode) { this.ev.toast('noEnergy'); return; }
      this.idle = 0; if (!S.godMode) S.energy -= 1; S.taps++;
      b.shake = 1.35;
      this.spark(b.x, b.y - bh * 0.45);
      const tool = currentTool();
      const base = Math.round(S.multitap * (1 + this.level) * (tool.mult || 1));
      /* На уровне «Достучаться до небес» карточки усиления и турбо-бусты не работают */
      const effCombo = Math.max(1, this.combo);

      if (b.chainRemoved && this.t < (b.chainRemovedUntil || 0)) {
        this.handleHitAfterChainRemoved(b, base, 0.3);
        return;
      }
      if (b.kind === 'chained') {
        this.handleChainedBarrelHit(b, tool, base, effCombo, 0.3);
        return;
      }
      let gain = base * 2, prog = 1;
      if (b.kind === 'phone' && !b.isTillBarrel) {
        this.combo = 3;
        this.comboUntil = this.t + 5;
        b.kind = 'closed';
        this.ev.toast('bonusTap');
      }
      gain *= effCombo;
      this.applyBarrelReward(b, gain, prog, 0.2, true);
      audio.barrelMelodyBeat(this.streak % 3, this.streak);
      if (this.progress >= this.goal) {
        this.active = false;
        this.ev.onWin(Math.floor(this.levelPoints));
      }
      return;
    }

    /* А) Если в руке активен НАВЫК (на Ур. 01–06):
       - клик в пустую точку пола при «📢 Точке пранка» переставляет динамик пранка туда;
       - клик по персонажу (вне целевой бочки) применяет навык прямо на персонажа;
       - клик по бочке выпускает луч навыка в бочку (зажигает огонь / делает золотой призовой / обезвреживает ловушку) И сразу засчитывает удар по бочке! */
    if (this.handSkill && this.handSkill.timeLeft > 0) {
      if (this.handSkill.skillKey === 'distract' && !hitB && !hitAltarFather) {
        this.spawnPrankLureAt(x, y, Math.max(3.5, this.handSkill.timeLeft));
        return;
      }
      if (hitChar && !hitB && !hitAltarFather) {
        this.applySkillToCharacter(hitChar, this.handSkill.skillKey, Math.max(2.5, this.handSkill.timeLeft), x, y);
        return;
      }
      if (hitB && !hitB.knockedDown) {
        this.spawnSkillBeam(x, y - 20, hitB.x, hitB.y - bh * 0.5, this.handSkill.accent, this.handSkill.icon);
        if (hitB.trap) {
          this.applySkillToBarrel(hitB, this.handSkill.skillKey, this.handSkill.timeLeft, x, y);
          return;
        }
        if (this.handSkill.skillKey === 'overcharge') {
          hitB.onFireUntil = this.t + Math.max(4, this.handSkill.timeLeft);
          hitB.hasAirBubble = true;
        } else if (this.handSkill.skillKey === 'jackpot') {
          hitB.isPrizeBarrel = true;
          hitB.prizeUntil = this.t + Math.max(5, this.handSkill.timeLeft);
          hitB.hasAirBubble = true;
        }
      }
    }

    /* А2) Уровень 06 «СТАРАЯ ЦЕРКОВЬ · АЛТАРЬ»: удар по прикованному цепями к стене Отцу! */
    if (hitAltarFather && this.active) {
      this.handleAltarFatherHit(x, y);
      return;
    }

    /* Б) Если в руке обычный инструмент и игрок нажал на ПЕРСОНАЖА (Отец, Святой отец, Сообщник, Девушка, Овчарка) */
    if (hitChar) {
      const charBlocksLight = (hitChar.w && (hitChar.w.litBarrel || hitChar.w.mode === 'watch')) || this.huntCursorT > 0;
      const onTargetBarrel = hitB && (hitB.target || hitB.kind === 'chained' || hitB.isTillBarrel);
      if (!this.active || charBlocksLight || !onTargetBarrel) {
        this.handleCharacterToolTap(hitChar, x, y);
        return;
      }
      /* Даже если персонаж стоял прямо перед целевой бочкой — он тоже реагирует репликой и подпрыгивает! */
      this.handleCharacterToolTap(hitChar, x, y);
    }

    if (!this.active) return;

    /* 1. Если за курсором уже следит луч фонарика — бить НЕЛЬЗЯ! */
    if (this.huntCursorT > 0 && !S.godMode) {
      this.huntStrikes++;
      this.streak = 0;
      this.air -= 16;
      this.shake = 0.9;
      this.huntCursorT = Math.min(5.0, this.huntCursorT + 1.2);
      audio.alarmLock(0);
      this.float(x, y - 24, '🔦 НЕ БИТЬ ПОД ЛУЧОМ!', '#9E2A2B');
      if (this.huntStrikes >= 3 || this.air <= 0) {
        this.active = false;
        this.ev.onLose('caught');
      }
      return;
    }

    const b = hitB;
    if (!b) return;
    if (S.energy < 1 && !S.godMode) { this.ev.toast('noEnergy'); return; }

    /* Если бочка уже упала от ошибок или истощения (knockedDown) — по ней больше нельзя тапать! */
    if (b.knockedDown) {
      b.shake = 0.55;
      const pan = ((b.x - this.view.x) / this.view.w) * 2 - 1;
      audio.knock(pan, 0.25);
      this.float(b.x, b.y - bh * 0.72, '🚫 БОЧКА УПАЛА И ПУСТА — ПЛЮШЕК БОЛЬШЕ НЕТ!', '#FF6B6B');
      return;
    }

    this.idle = 0; if (!S.godMode) S.energy -= 1; S.taps++;
    b.shake = 1.2; this.spark(b.x, b.y - bh * 0.5);
    const pan = ((b.x - this.view.x) / this.view.w) * 2 - 1;

    /* 2. Если именно на эту бочку сейчас светит фонариком Отец или другой персонаж — ПОПАЛСЯ! */
    const watcher = this.getWatcherOfBarrel(b);
    if (watcher && !S.godMode) {
      this.streak = 0;
      this.air -= 12;
      this.shake = 1.0;
      this.triggerCursorHunt(watcher, b);
      return;
    }

    if (b.trap) {
      if (S.godMode) {
        b.trap = false;
        b.kind = 'closed';
        b.hasAirBubble = true;
        this.float(b.x, b.y - bh * 0.95, '⚡ РЕЖИМ БОГА: ЛОВУШКА ОБЕЗВРЕЖЕНА!', '#80ED99');
        return;
      }
      this.streak = 0; b.lid = 1; this.levelPoints = Math.floor(this.levelPoints * 0.5); this.active = false; this.ev.onTrap(); return;
    }

    const tool = currentTool();
    const skillMult = (this.skills?.fragile > 0 ? 2 : 1)
      * (this.skills?.freeze > 0 ? 3 : 1)
      * (this.skills?.shrink > 0 ? 3 : 1)
      * (this.skills?.overcharge > 0 ? 4 : 1);
    const base = Math.round(S.multitap * (1 + this.level) * (tool.mult || 1) * skillMult);
    const turboMult = Date.now() < (S.turboUntil || 0) ? 5 : 1;
    const effCombo = Math.max(this.combo, turboMult);
    const jackpotOn = !!(
      (this.skills && this.skills.jackpot > 0) ||
      (b.isPrizeBarrel && (b.prizeUntil || 0) > this.t) ||
      ((b.onFireUntil || 0) > this.t)
    );

    /* 3. Главное правило: НЕ СТУЧАТЬ по бочке после того, как снял с неё цепь! (если не включён навык «Все бочки призовые!») */
    if (!jackpotOn && b.chainRemoved && this.t < (b.chainRemovedUntil || 0)) {
      this.handleHitAfterChainRemoved(b, base, pan);
      return;
    }

    /* 4. Бочка в натуральной цепи со всеми ништяками внутри */
    if (b.kind === 'chained') {
      this.handleChainedBarrelHit(b, tool, base, effCombo, pan);
      return;
    }

    let gain = 0, prog = 0;
    if (jackpotOn) {
      gain = Math.round(base * 2.5);
      prog = 2;
      b.hasAirBubble = true;
    }
    else if (b.kind === 'hand') { gain = base * 2; prog = 2; }
    else if (b.kind === 'phone') {
      gain = base;
      prog = 1;
      this.combo = 3;
      this.comboUntil = this.t + 5;
      this.ev.toast('bonusTap');
      audio.playPrankVoice();
    }
    else if (b.target) { gain = base; prog = 1; }
    /* Воздух (💨 ВОЗДУХ) нет-нет попадается везде на бочках, чтобы не задохнуться! */
    else if (b.hasAirBubble) {
      gain = base;
      prog = 1;
    }
    else {
      /* Если бочка даёт МИНУС и игрок ошибается: на 1-й ошибке предупреждение, на 2-й ошибке бочка ПАДАЕТ набок и остаётся упавшей на уровне! */
      this.streak = 0;
      this.air -= 8;
      this.levelPoints = Math.max(0, this.levelPoints - base * 2);
      b.wrongHits = (b.wrongHits || 0) + 1;
      if (b.wrongHits >= 2) {
        this.knockDownBarrel(b, 'mistake');
      } else {
        b.shake = 1.45;
        this.float(b.x, b.y - bh, `⚠️ -${base * 2} ОШИБКА! ЕЩЁ 1 ПРОМАХ — БОЧКА УПАДЁТ!`, '#FF6B6B');
        audio.knock(pan, 0.3);
      }
      this.alertWalker(b);
      return;
    }
    gain *= effCombo;
    this.applyBarrelReward(b, gain, prog, pan, false);
    if (!this.isAltarFather && this.progress >= this.goal) {
      this.active = false;
      this.ev.onWin(Math.floor(this.levelPoints));
    }
  }

  /* Обычные бочки и целевая бочка дают очки и регулярно подкидывают ВОЗДУХ (💨), чтобы не задохнуться.
     При этом по одной бочке нельзя тапать бесконечно: когда tapsLeft кончается — бочка падает и пустеет (меньше бочек — меньше плюшек!). */
  applyBarrelReward(b, gain, prog, pan = 0, isOcean = false) {
    const bh = this.bh;
    this.streak++;
    if (!this.isAltarFather) {
      this.progress += prog;
    }

    const giveAirPocket = b.hasAirBubble || this.air < 45 || Math.random() < 0.28;
    if (giveAirPocket) {
      const airGain = Math.round(22 + Math.min(14, this.level * 2));
      this.air = Math.min(100, this.air + airGain);
      this.levelPoints += gain;
      b.hasAirBubble = false;
      b.rewardType = 'points';
      b.hasSupply = false;
      this.float(b.x, b.y - bh * 0.90, `💨 +${airGain}% ВОЗДУХ · +${gain}`, '#64DFDF');
      audio.knock(pan, 1);
      audio.coin(1.35);
    } else {
      this.air = Math.min(100, this.air + (isOcean ? 2.8 : 2.2) + (this.streak % 4 === 0 ? 12 : 0));
      this.levelPoints += gain;
      const prefix = isOcean ? (this.streak % 2 === 0 ? '♪ +' : '♫ +') : '+';
      this.float(b.x, b.y - bh * (isOcean ? 0.82 : 1.0), `${prefix}${gain}`, gain > 50 || isOcean ? '#D49A45' : '#E6E8EA');
      audio.knock(pan, 1);
      audio.coin(1 + Math.min(1, this.streak / 20));
    }

    /* На Уровне 06 (Алтарь): подсказка, когда накоплено достаточно очков для удара по цепям Отца на стене */
    if (this.isAltarFather && this.fatherChained && this.levelPoints >= (this.fatherChained.hitCost || 160) && this.streak % 3 === 0) {
      const { cx, cy, h } = this.getAltarFatherBox();
      this.float(cx, cy - h * 0.95, `⚡ ОЧКИ НАБРАНЫ (${Math.floor(this.levelPoints)}) — БЕЙ ПО ЦЕПЯМ ОТЦА НА СТЕНЕ!`, '#80ED99');
    }

    /* Истощение бочки: по одной бочке много тапать нельзя — она кончается и падает! */
    if (!b.isTillBarrel && !b.knockedDown) {
      b.tapsLeft = Math.max(0, (b.tapsLeft ?? 10) - 1);
      if (b.tapsLeft === 3) {
        this.float(b.x, b.y - bh * 1.18, '⚠️ В БОЧКЕ ОСТАЛОСЬ 3 УДАРА — СКОРО УПАДЁТ!', '#FFD166');
      } else if (b.tapsLeft <= 0) {
        const otherStanding = this.barrels.filter((x) => x !== b && !x.trap && !x.knockedDown);
        if (otherStanding.length >= 1) {
          this.knockDownBarrel(b, 'depleted');
          return;
        }
      }
    }

    /* Голосовая реакция персонажа с подписью над головой при стуке («Кто там?!» / фраза Пастора) */
    if (this.walker && this.walker.speechT <= 0.15 && Math.random() < 0.42) {
      const wKey = this.walker.key;
      const knockLine = wKey === 'priest'
        ? (Math.random() < 0.55 ? 'Я принёс бочку для вашего мальчика… Кто там?!' : 'Тук-тук! Кто там стучит в бочке?!')
        : wKey === 'ocean'
          ? 'На небе только и разговоров, что о море… Кто там стучит у бочки Тиля?'
          : (Math.random() < 0.5 ? 'Кто там?! Кто стучит изнутри?!' : 'Слышишь стук?.. Кто там в бочке?!');
      this.walker.speech = knockLine;
      this.walker.speechT = 3.2;
      audio.voiceMumble(pan, wKey === 'girl' ? 1.45 : wKey === 'priest' ? 0.85 : wKey === 'boy' ? 1.18 : 0.95);
      speak(knockLine, wKey);
    }

    /* Периодически снова появляется пузырёк воздуха на бочках */
    if (Math.random() < 0.34 && !b.knockedDown) {
      b.hasAirBubble = true;
      b.rewardType = 'air';
      b.hasSupply = true;
    }
  }

  float(x, y, txt, color) { this.floats.push({ x, y, txt, color, life: 0.95 }); }
  spark(x, y) { for (let i = 0; i < 8; i++) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 250, life: 0.4 + Math.random() * 0.3 }); }

  drawSingleWalker(ctx, w) {
    if (!w) return;
    const baseY = this.walkerY(w), h = this.walkerH(w), a = w.actor;
    const recoilY = (w.hitRecoilT || 0) > 0 ? Math.sin((w.hitRecoilT / 0.58) * Math.PI) * 14 : 0;
    const y = baseY - recoilY;
    const hp = a.hand(w.x, y, h);
    const beamColor = w.key === 'father' ? '236,195,120' : w.key === 'girl' ? '140,205,235' : '236,228,210';
    const isFrozen = (w.skillEffect === 'freeze' && w.skillEffectT > 0) || !!(this.skills && this.skills.freeze > 0);
    const isStealth = (w.skillEffect === 'stealth' && w.skillEffectT > 0) || !!(this.skills && this.skills.stealth > 0);
    const isWearingBarrel = w.skillEffect === 'shrink' && w.skillEffectT > 0;
    const hasSkillFx = !!(w.skillEffect && w.skillEffectT > 0) || isFrozen || isStealth;

    /* Эффект «👻 Невидимка»: фонарь охранника сначала мигает и искрит (1.35с), а затем ПОЛНОСТЬЮ ОТРУБАЕТСЯ! */
    if (isStealth && !isFrozen && !isWearingBarrel && !w.dog) {
      const flickT = w.flashlightFlickerT || 0;
      if (flickT > 0) {
        const flickerOn = Math.sin(this.t * 58) > 0.12;
        if (flickerOn) {
          a.beam(ctx, w.x, y, h, 145, '190,150,255', 0.22, 36);
        }
        /* Искры короткого замыкания прямо на фонарике в руке */
        ctx.save();
        for (let s = 0; s < 4; s++) {
          const ang = this.t * 25 + s * 1.57;
          ctx.strokeStyle = s % 2 === 0 ? '#00E5FF' : '#FFD166';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(hp.x, hp.y);
          ctx.lineTo(hp.x + Math.cos(ang) * 12, hp.y + Math.sin(ang) * 12);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        /* Фонарь отрубился: луч НЕ горит, из погасшего фонаря в руке идёт тонкий дымок */
        ctx.save();
        const smokeOff = (this.t * 18) % 16;
        ctx.fillStyle = `rgba(180,190,205,${0.42 - smokeOff / 42})`;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y - 4 - smokeOff, 4 + smokeOff * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    /* 1) Если этот персонаж поймал игрока и следит фонариком прямо за курсором */
    else if (!hasSkillFx && this.huntCursorT > 0 && this.hunter === w) {
      const lx = this.light ? this.light.x : this.view.x + this.view.w / 2;
      const ly = this.light ? this.light.y : this.view.y + this.view.h * 0.6;
      drawCone(ctx, hp.x, hp.y, lx, ly, '212,62,56', 0.34, 62);
    }
    /* 2) Если персонаж светит фонариком на конкретную бочку (бить по ней сейчас нельзя!) */
    else if (!hasSkillFx && w.litBarrel && w.beamActiveT > 0) {
      const b = w.litBarrel;
      drawCone(ctx, hp.x, hp.y, b.x, b.y - this.bh * 0.42, '236,185,95', 0.26, 54);
    }
    /* 3) Обычный поисковый луч перед собой */
    else if (!hasSkillFx && w.mode !== 'watch' && !w.dog) {
      a.beam(ctx, w.x, y, h, w.mode === 'pause' ? 250 : 185, beamColor, w.mode === 'pause' ? 0.16 : 0.10, w.mode === 'pause' ? 54 : 42);
    }
    if (!hasSkillFx && w.mode === 'watch' && !(this.huntCursorT > 0 && this.hunter === w)) {
      const tb = w.targetB;
      const tx = tb ? tb.x : (this.light ? this.light.x : w.x + w.dir * 200), ty = tb ? tb.y - this.bh * 0.5 : (this.light ? this.light.y : hp.y);
      drawCone(ctx, hp.x, hp.y, tx, ty, w.dog ? '158,42,43' : beamColor, w.dog ? 0.16 : 0.25, w.dog ? 30 : 50);
    }

    drawShadow(ctx, w.x, baseY, h * 0.34);

    /* Если на персонажа надета бочка («🛢️ Одеть бочку») — рисуем ТОЛЬКО НОГИ снизу, а сверху на торсе и голове качается стальная бочка! */
    if (isWearingBarrel) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x - h, y - h * 0.33, h * 2, h * 0.48);
      ctx.clip();
      w.actor.draw(ctx, w.x, y, h);
      ctx.restore();

      /* Надетая сверху стальная бочка (закрывает голову, руки и фонарь — торчат только шагающие ноги!) */
      ctx.save();
      const wobble = Math.sin(this.t * 11) * 0.065;
      const bBotY = y - h * 0.23;
      const bHeight = h * 0.78;
      ctx.translate(w.x, bBotY - bHeight * 0.5);
      ctx.rotate(wobble);
      if (sheets.barrels) {
        this.drawBarrelSolid(ctx, sheets.barrels, 'igor', 0, bHeight * 0.5, bHeight, 'closed', 'В БОЧКЕ');
      } else {
        drawBarrelFallback(ctx, 0, 0, bHeight * 0.62, bHeight, 'closed');
      }
      /* Узкая смотровая щель в бочке и удивлённые глаза внутри */
      ctx.fillStyle = '#07090C';
      ctx.beginPath();
      ctx.roundRect(-bHeight * 0.18, -bHeight * 0.16, bHeight * 0.36, 8, 3);
      ctx.fill();
      ctx.fillStyle = '#FFD166';
      ctx.beginPath();
      ctx.arc(-6 + w.dir * 2, -bHeight * 0.16 + 4, 2.2, 0, Math.PI * 2);
      ctx.arc(6 + w.dir * 2, -bHeight * 0.16 + 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      w.actor.draw(ctx, w.x, y, h);
    }

    /* Визуальный эффект применённого на персонажа навыка */
    if (hasSkillFx) {
      ctx.save();
      const sk = isFrozen ? 'freeze' : (w.skillEffect || (isStealth ? 'stealth' : ''));
      const remT = isFrozen
        ? Math.max(w.skillEffectT || 0, this.skills?.freeze || 0)
        : Math.max(w.skillEffectT || 0, isStealth ? (this.skills?.stealth || 0) : 0);

      if (sk === 'freeze') {
        /* ❄️👑 МИФИЧЕСКАЯ АБСОЛЮТНАЯ ЗАМОРОЗКА ★ — огромный 3D крио-монолит с острыми ледяными шипами и морозным паром! */
        const iw = h * 0.74, ih = h * 1.12;
        const topY = y - ih;

        /* Морозное сияние вокруг ледяного монолита */
        const iceGlow = ctx.createRadialGradient(w.x, y - ih * 0.5, iw * 0.15, w.x, y - ih * 0.5, iw * 0.95);
        iceGlow.addColorStop(0, 'rgba(0, 229, 255, 0.38)');
        iceGlow.addColorStop(0.6, 'rgba(72, 202, 228, 0.16)');
        iceGlow.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = iceGlow;
        ctx.beginPath();
        ctx.arc(w.x, y - ih * 0.5, iw * 0.95, 0, Math.PI * 2);
        ctx.fill();

        /* Боковые и верхние острые ледяные пики-кристаллы */
        const spikes = [
          [w.x - iw * 0.46, y - ih * 0.25, w.x - iw * 0.76, y - ih * 0.42, w.x - iw * 0.42, y - ih * 0.52],
          [w.x + iw * 0.46, y - ih * 0.28, w.x + iw * 0.78, y - ih * 0.46, w.x + iw * 0.42, y - ih * 0.56],
          [w.x - iw * 0.38, y - ih * 0.65, w.x - iw * 0.68, y - ih * 0.86, w.x - iw * 0.24, y - ih * 0.90],
          [w.x + iw * 0.38, y - ih * 0.68, w.x + iw * 0.68, y - ih * 0.88, w.x + iw * 0.24, y - ih * 0.92],
          [w.x - iw * 0.22, topY + 4, w.x, topY - 22, w.x + iw * 0.22, topY + 4],
        ];
        ctx.fillStyle = 'rgba(144, 224, 239, 0.52)';
        ctx.strokeStyle = '#E0FBFC';
        ctx.lineWidth = 1.6;
        spikes.forEach(([x1, y1, x2, y2, x3, y3]) => {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });

        /* Главная многогранная ледяная глыба */
        const blockGrad = ctx.createLinearGradient(w.x - iw * 0.5, topY, w.x + iw * 0.5, y);
        blockGrad.addColorStop(0, 'rgba(202, 240, 248, 0.46)');
        blockGrad.addColorStop(0.45, 'rgba(0, 180, 216, 0.32)');
        blockGrad.addColorStop(1, 'rgba(3, 4, 94, 0.44)');
        ctx.fillStyle = blockGrad;
        ctx.strokeStyle = '#90E0EF';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(w.x - iw * 0.36, topY);
        ctx.lineTo(w.x + iw * 0.36, topY);
        ctx.lineTo(w.x + iw * 0.52, topY + ih * 0.28);
        ctx.lineTo(w.x + iw * 0.46, y + 4);
        ctx.lineTo(w.x - iw * 0.46, y + 4);
        ctx.lineTo(w.x - iw * 0.52, topY + ih * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        /* Внутренние кристаллические грани преломления льда */
        ctx.strokeStyle = 'rgba(255,255,255,0.68)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(w.x - iw * 0.34, topY + ih * 0.14);
        ctx.lineTo(w.x + iw * 0.22, topY + ih * 0.58);
        ctx.lineTo(w.x - iw * 0.18, topY + ih * 0.88);
        ctx.moveTo(w.x + iw * 0.30, topY + ih * 0.18);
        ctx.lineTo(w.x - iw * 0.25, topY + ih * 0.52);
        ctx.stroke();

        /* Клубы морозного пара у подножия льда */
        ctx.fillStyle = 'rgba(202, 240, 248, 0.35)';
        ctx.beginPath();
        ctx.ellipse(w.x, y + 3, iw * 0.65, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (sk === 'shrink') {
        /* 🛢️ Одет в бочку — пунктирный контур вокруг шагающих из-под бочки ног */
        ctx.strokeStyle = '#64DFDF';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.ellipse(w.x, y - h * 0.14, h * 0.28, h * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (sk === 'distract') {
        /* Звуковые волны пранка вокруг головы */
        const rWave = 14 + ((this.t * 32) % 22);
        ctx.strokeStyle = '#F4A261';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, y - h * 0.85, rWave, 0, Math.PI * 2);
        ctx.stroke();
      } else if (sk === 'stealth') {
        /* 👻 Невидимка: значок перечёркнутого/искрящего фонаря */
        ctx.strokeStyle = (w.flashlightFlickerT || 0) > 0 ? '#FFD166' : '#9D4EDD';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        /* Энергетический ореол навыка вокруг персонажа */
        ctx.strokeStyle = '#D4A843';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.ellipse(w.x, y - h * 0.52, h * 0.44, h * 0.56, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      /* Бейдж остатка времени действия навыка прямо над персонажем */
      const badgeLabelMap = {
        freeze: `❄️👑 ВО ЛЬДУ ★ ${remT.toFixed(1)}с`,
        shrink: `🛢️ В БОЧКЕ · ТОЛЬКО НОГИ ${remT.toFixed(1)}с`,
        stealth: (w.flashlightFlickerT || 0) > 0
          ? `🔦⚡ ФОНАРЬ МИГАЕТ...`
          : `🔦✖ ФОНАРЬ ОТРУБИЛСЯ ${remT.toFixed(1)}с`,
        distract: `📻 БЕЖИТ НА ПРАНК ${remT.toFixed(1)}с`,
      };
      const badgeTxt = badgeLabelMap[sk] || `${w.mark || '⚡'} ${remT.toFixed(1)}с`;
      ctx.font = 'bold 9.5px "JetBrains Mono"';
      const bw = ctx.measureText(badgeTxt).width + 12;
      const byTop = y - h - (sk === 'freeze' ? 32 : 24);
      ctx.fillStyle = 'rgba(8,11,16,0.94)';
      ctx.fillRect(w.x - bw / 2, byTop, bw, 16);
      ctx.strokeStyle = sk === 'freeze' ? '#00E5FF' : sk === 'stealth' ? '#9D4EDD' : '#64DFDF';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(w.x - bw / 2, byTop, bw, 16);
      ctx.fillStyle = '#ECE4D2';
      ctx.textAlign = 'center';
      ctx.fillText(badgeTxt, w.x, byTop + 11.5);
      ctx.restore();
    }

    if (w.dog && w.mode === 'watch') { ctx.fillStyle = '#9E2A2B'; ctx.fillRect(w.x + w.dir * h * 0.28 - 2, y - h * 0.78, 3, 3); ctx.fillRect(w.x + w.dir * h * 0.36 - 2, y - h * 0.78, 3, 3); }
    if (!hasSkillFx && w.markT > 0) { ctx.globalAlpha = Math.min(1, w.markT * 2); ctx.fillStyle = w.mark === '!' ? '#9E2A2B' : '#D4A843'; ctx.font = 'bold 22px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.fillText(w.mark, w.x, y - h - 10); ctx.globalAlpha = 1; }
    if (w.speechT > 0 && w.speech) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, w.speechT * 1.5);
      const narrow = this.view && this.view.w < 620;
      ctx.font = narrow ? '9.5px "JetBrains Mono", monospace' : '11px "JetBrains Mono", monospace';
      const maxTextW = Math.min(narrow ? 280 : 340, this.view.w - 30);
      const words = w.speech.split(' ');
      const lines = [];
      let cur = '';
      for (const word of words) {
        const test = cur ? cur + ' ' + word : word;
        if (ctx.measureText(test).width > maxTextW && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      const padX = narrow ? 8 : 12, lineH = narrow ? 12.5 : 15;
      const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const bw = Math.min(maxTextW + padX * 2, textW + padX * 2);
      const bh = lines.length * lineH + (narrow ? 8 : 10);
      const bx = Math.max(this.view.x + bw / 2 + 8, Math.min(this.view.x + this.view.w - bw / 2 - 8, w.x));
      const by = Math.max(this.view.y + 84 + bh, y - h - (w.markT > 0 ? 30 : 12));
      ctx.fillStyle = 'rgba(8,9,11,0.92)';
      ctx.strokeStyle = 'rgba(212,168,67,0.75)';
      ctx.lineWidth = 1;
      ctx.fillRect(bx - bw / 2, by - bh, bw, bh);
      ctx.strokeRect(bx - bw / 2, by - bh, bw, bh);
      ctx.fillStyle = '#ECE4D2';
      ctx.textAlign = 'center';
      lines.forEach((ln, idx) => {
        ctx.fillText(ln, bx, by - bh + (narrow ? 12.5 : 15) + idx * lineH);
      });
      ctx.restore();
    }
  }

  /* Натуральная кованая 3D-цепь со звеньями, огибающая цилиндр бочки, и массивный навесной замок в центре */
  drawSingleChainLink3D(ctx, x, y, angle, linkLen, linkW, isEdgeLink, dmgRatio = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (isEdgeLink) {
      /* Соединительное звено, повёрнутое ребром (проходит сквозь отверстия соседних звеньев) */
      const el = linkLen * 0.78;
      const ew = Math.max(3.2, linkW * 0.48);
      /* Контактная тень в проушинах соседних звеньев */
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.beginPath();
      ctx.roundRect(-el * 0.54, -ew * 0.5 + 1.5, el * 1.08, ew + 1, ew * 0.5);
      ctx.fill();
      /* Цилиндрический градиент кованой стали */
      const g = ctx.createLinearGradient(0, -ew * 0.5, 0, ew * 0.5);
      g.addColorStop(0, '#DCE4EC');
      g.addColorStop(0.35, '#8E99A6');
      g.addColorStop(0.75, '#434B54');
      g.addColorStop(1, '#1B2026');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#14181D';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-el * 0.5, -ew * 0.5, el, ew, ew * 0.48);
      ctx.fill();
      ctx.stroke();
      /* Продольный металлический блик */
      ctx.strokeStyle = 'rgba(255,250,235,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-el * 0.34, -ew * 0.18);
      ctx.lineTo(el * 0.34, -ew * 0.18);
      ctx.stroke();
    } else {
      /* Звено плашмя (овальное кольцо с реальным сквозным отверстием и толщиной прутка) */
      const rx = linkLen * 0.5;
      const ry = linkW * 0.5;
      const rod = Math.max(2.6, linkW * 0.34);
      /* Падающая тень звена на металл бочки */
      ctx.strokeStyle = 'rgba(0,0,0,0.62)';
      ctx.lineWidth = rod + 1.6;
      ctx.beginPath();
      ctx.ellipse(0.6, 2.1, Math.max(2, rx - rod * 0.35), Math.max(1.5, ry - rod * 0.35), 0, 0, Math.PI * 2);
      ctx.stroke();
      /* Тёмный контур кованого прутка */
      ctx.strokeStyle = '#181C22';
      ctx.lineWidth = rod + 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(2, rx - rod * 0.35), Math.max(1.5, ry - rod * 0.35), 0, 0, Math.PI * 2);
      ctx.stroke();
      /* Основное тело стального звена */
      const lg = ctx.createLinearGradient(-rx, -ry, rx, ry);
      lg.addColorStop(0, '#C4CED8');
      lg.addColorStop(0.45, '#78828E');
      lg.addColorStop(0.8, '#464E58');
      lg.addColorStop(1, '#272C33');
      ctx.strokeStyle = lg;
      ctx.lineWidth = rod * 0.82;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(2, rx - rod * 0.35), Math.max(1.5, ry - rod * 0.35), 0, 0, Math.PI * 2);
      ctx.stroke();
      /* Следы ржавчины / окалины на старом железе */
      ctx.strokeStyle = dmgRatio > 0.4 ? 'rgba(218,92,52,0.55)' : 'rgba(138,72,38,0.42)';
      ctx.lineWidth = rod * 0.45;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(2, rx - rod * 0.35), Math.max(1.5, ry - rod * 0.35), 0, 0.3, 1.35);
      ctx.stroke();
      /* Яркий блик на верхней грани звена */
      ctx.strokeStyle = 'rgba(244,248,252,0.75)';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(2, rx - rod * 0.32), Math.max(1.5, ry - rod * 0.32), 0, Math.PI * 1.12, Math.PI * 1.82);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Отрисовка гирлянды сцепленных 3D-звеньев по изогнутой дуге вокруг цилиндра бочки */
  drawCurvedChainStrand(ctx, x1, y1, x2, y2, sagY, bh, dmgRatio = 0) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const linkLen = Math.max(9.5, bh * 0.088);
    const linkW = Math.max(6.2, bh * 0.056);
    const step = linkLen * 0.56;
    const count = Math.max(5, Math.round(dist / step));

    /* Тёмные скобы-захваты на боковых рёбрах бочки (цепь уходит за спинку бочки) */
    ctx.fillStyle = '#1A1E24';
    ctx.strokeStyle = '#6D7682';
    ctx.lineWidth = 1.2;
    [[x1, y1], [x2, y2]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(ex, ey, linkW * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    /* Сперва рисуем плоские звенья (чётные), затем соединительные ребром (нечётные) поверх стыков */
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i <= count; i++) {
        const isEdge = i % 2 === 1;
        if ((pass === 0 && isEdge) || (pass === 1 && !isEdge)) continue;
        const u = i / count;
        const px = x1 + dx * u;
        const curve = Math.sin(u * Math.PI) * sagY;
        const py = y1 + dy * u + curve;
        /* Производная кривой для точного угла наклона каждого звена */
        const dCurve = (Math.PI * Math.cos(u * Math.PI) * sagY) / Math.max(1, dist);
        const angle = Math.atan2(dy / Math.max(1, dist) + dCurve, dx / Math.max(1, dist));
        this.drawSingleChainLink3D(ctx, px, py, angle, linkLen, linkW, isEdge, dmgRatio);
      }
    }
  }

  /* Визуальные натуральные 3D-цепи поверх бочки + кованый замок и индикатор ударов инструмента */
  drawBarrelChainsOverlay(ctx, sx, sy, bh, b = null) {
    ctx.save();
    const w = bh * 0.56;
    const h = bh * 0.86;
    const dmgRatio = b && typeof b.chainDamage === 'number' ? Math.min(0.99, Math.max(0, b.chainDamage)) : 0;
    const jitter = b && b.shake > 0.05 ? Math.sin(this.t * 55) * 2.2 * b.shake : 0;

    /* 1. Три ветви натуральной кованой цепи, стягивающие бочку крест-накрест и по поясу */
    const leftX = sx - w * 0.49;
    const rightX = sx + w * 0.49;
    const topY = sy - h * 0.78;
    const midY = sy - h * 0.51;
    const botY = sy - h * 0.24;

    /* Горизонтальный поясной обхват с провисанием по цилиндру */
    this.drawCurvedChainStrand(ctx, leftX, midY - 3, rightX, midY - 3, bh * 0.045, bh, dmgRatio);
    /* Диагональные перекрёстные ветви цепи */
    this.drawCurvedChainStrand(ctx, leftX + 2, topY, rightX - 2, botY, bh * 0.032, bh, dmgRatio);
    this.drawCurvedChainStrand(ctx, rightX - 2, topY, leftX + 2, botY, bh * 0.032, bh, dmgRatio);

    /* 2. Центральное стальное кольцо-стяжка и тяжёлый навесной замок */
    const lockX = sx + jitter;
    const lockY = midY + bh * 0.025;
    const lockW = Math.max(18, bh * 0.165);
    const lockH = Math.max(16, bh * 0.145);

    /* Тень под замком */
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.beginPath();
    ctx.roundRect(lockX - lockW * 0.5 + 1.5, lockY - lockH * 0.35 + 2.5, lockW, lockH, 3.5);
    ctx.fill();

    /* Стальная закалённая дужка замка (U-образная) */
    const shackleR = lockW * 0.31;
    ctx.strokeStyle = '#181C22';
    ctx.lineWidth = Math.max(4.2, bh * 0.038);
    ctx.beginPath();
    ctx.arc(lockX, lockY - lockH * 0.34, shackleR, Math.PI, 0, false);
    ctx.stroke();
    ctx.strokeStyle = '#CFD8E2';
    ctx.lineWidth = Math.max(2.4, bh * 0.021);
    ctx.beginPath();
    ctx.arc(lockX, lockY - lockH * 0.34, shackleR, Math.PI * 1.06, Math.PI * 1.94, false);
    ctx.stroke();

    /* Корпус навесного замка (кованая латунь и воронёная сталь с заклёпками) */
    const bodyGrad = ctx.createLinearGradient(lockX - lockW * 0.5, lockY - lockH * 0.35, lockX + lockW * 0.5, lockY + lockH * 0.65);
    if (dmgRatio > 0.5) {
      bodyGrad.addColorStop(0, '#E29A52');
      bodyGrad.addColorStop(0.5, '#A85832');
      bodyGrad.addColorStop(1, '#4B2218');
    } else {
      bodyGrad.addColorStop(0, '#F0CA6D');
      bodyGrad.addColorStop(0.45, '#C89638');
      bodyGrad.addColorStop(0.85, '#7B561B');
      bodyGrad.addColorStop(1, '#3E2A0C');
    }
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#15181E';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(lockX - lockW * 0.5, lockY - lockH * 0.35, lockW, lockH, 3.2);
    ctx.fill();
    ctx.stroke();

    /* Стальная накладка по центру замка и угловые заклёпки */
    ctx.fillStyle = 'rgba(26,30,36,0.38)';
    ctx.fillRect(lockX - lockW * 0.44, lockY + lockH * 0.02, lockW * 0.88, lockH * 0.24);
    ctx.fillStyle = '#FFF0C2';
    const rvOffX = lockW * 0.36;
    const rvTopY = lockY - lockH * 0.21;
    const rvBotY = lockY + lockH * 0.48;
    [[-rvOffX, rvTopY], [rvOffX, rvTopY], [-rvOffX, rvBotY], [rvOffX, rvBotY]].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(lockX + rx, ry, 1.3, 0, Math.PI * 2);
      ctx.fill();
    });

    /* Замочная скважина */
    ctx.fillStyle = '#121418';
    ctx.beginPath();
    ctx.arc(lockX, lockY + lockH * 0.05, Math.max(1.8, lockW * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(lockX - 1.1, lockY + lockH * 0.05, 2.2, lockH * 0.28);

    /* Трещины на замке при надпиленной/надбитой цепи */
    if (dmgRatio > 0.05) {
      ctx.strokeStyle = '#1A0E0A';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(lockX - lockW * 0.35, lockY - lockH * 0.28);
      ctx.lineTo(lockX - lockW * 0.08, lockY + lockH * 0.06);
      if (dmgRatio > 0.45) {
        ctx.lineTo(lockX + lockW * 0.28, lockY + lockH * 0.44);
        ctx.moveTo(lockX + lockW * 0.3, lockY - lockH * 0.22);
        ctx.lineTo(lockX + lockW * 0.02, lockY + lockH * 0.12);
      }
      ctx.stroke();
    }

    /* 3. Индикатор прочности цепи и сколько ударов осталось текущим инструментом */
    if (b) {
      const tool = currentTool();
      const reqHits = tool.chainHits ?? 0;
      const pillY = sy - h - 18;
      let label = '';
      let borderCol = 'rgba(212,168,67,0.85)';
      if (reqHits <= 0) {
        label = '⛓️ РУКОЙ НЕЛЬЗЯ';
        borderCol = 'rgba(212,70,56,0.92)';
      } else {
        const leftHits = Math.max(1, Math.ceil((1 - dmgRatio) * reqHits));
        label = leftHits === 1 ? '⛓️ 1 УДАР!' : `⛓️ ${leftHits} УД.`;
      }
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      const pw = Math.max(58, ctx.measureText(label).width + 12);
      ctx.fillStyle = 'rgba(12,15,20,0.9)';
      ctx.fillRect(sx - pw * 0.5, pillY, pw, 14);
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - pw * 0.5, pillY, pw, 14);
      /* Полоска прогресса сбития цепи */
      if (dmgRatio > 0) {
        ctx.fillStyle = '#50B86C';
        ctx.fillRect(sx - pw * 0.5 + 1, pillY + 11.5, (pw - 2) * dmgRatio, 2);
      }
      ctx.fillStyle = reqHits <= 0 ? '#FF9B94' : '#ECE4D2';
      ctx.textAlign = 'center';
      ctx.fillText(label, sx, pillY + 10);
    }

    ctx.restore();
  }

  /* Отрисовка разорванной цепи у подножия бочки и предупреждения «ЦЕПЬ СНЯТА · НЕ СТУЧАТЬ!» */
  drawBarrelChainRemovedOverlay(ctx, sx, sy, bh) {
    ctx.save();
    /* Разорванные звенья на полу у основания бочки */
    const linkLen = Math.max(9, bh * 0.082);
    const linkW = Math.max(5.8, bh * 0.052);
    this.drawSingleChainLink3D(ctx, sx - bh * 0.22, sy + 2, 0.25, linkLen, linkW, false, 0.5);
    this.drawSingleChainLink3D(ctx, sx - bh * 0.13, sy + 3, -0.18, linkLen, linkW, true, 0.5);
    this.drawSingleChainLink3D(ctx, sx + bh * 0.16, sy + 3, -0.32, linkLen, linkW, false, 0.5);
    this.drawSingleChainLink3D(ctx, sx + bh * 0.25, sy + 1, 0.4, linkLen, linkW, true, 0.5);

    /* Пульсирующее предупреждение над бочкой: после снятия цепи стучать нельзя! */
    const pulse = 0.65 + Math.sin(this.t * 10) * 0.25;
    const pillY = sy - bh * 0.88 - 18;
    const txt = '🔓 НЕ СТУЧАТЬ!';
    ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
    const pw = Math.max(76, ctx.measureText(txt).width + 12);
    ctx.fillStyle = `rgba(145,32,32,${0.88 * pulse + 0.1})`;
    ctx.fillRect(sx - pw * 0.5, pillY, pw, 14);
    ctx.strokeStyle = '#F2C14E';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(sx - pw * 0.5, pillY, pw, 14);
    ctx.fillStyle = '#FFF4D8';
    ctx.textAlign = 'center';
    ctx.fillText(txt, sx, pillY + 10);
    ctx.restore();
  }

  /* Отрисовка плотной непрозрачной бочки с 3D-объёмом металла, бликом на ободе, динамическим российским именем (ruName)
     и трафаретным значком ресурса, если внутри вместо суммы очков спрятана Энергия (⚡), Воздух (💨) или Жизнь (❤️) */
  drawBarrelSolid(ctx, sh, key, sx, sy, bh, kind, ruName = '', rewardBadge = '', barrelObj = null) {
    if (!sh) return;
    const isSpecialTop = key === 'hand' || key === 'phone' || key === 'handNoName';
    const hh = kind === 'fallen' ? bh * 0.65 : isSpecialTop ? bh * 1.18 : bh;
    const rect = barrelRect(sh, key);
    drawFrame(ctx, sh, rect, sx, sy, hh);

    /* 3D-цилиндрический металлический блик и контурный свет прожектора на верхнем ободе вертикальных бочек */
    if (kind !== 'fallen') {
      ctx.save();
      const bw = bh * 0.56;
      const bodyTop = sy - bh * 0.92;
      const bodyH = bh * 0.88;
      const cyl = ctx.createLinearGradient(sx - bw * 0.5, 0, sx + bw * 0.5, 0);
      cyl.addColorStop(0, 'rgba(0,0,0,0.32)');
      cyl.addColorStop(0.26, 'rgba(255,236,195,0.11)');
      cyl.addColorStop(0.52, 'rgba(255,236,195,0.02)');
      cyl.addColorStop(0.82, 'rgba(0,0,0,0.18)');
      cyl.addColorStop(1, 'rgba(0,0,0,0.36)');
      ctx.fillStyle = cyl;
      ctx.fillRect(sx - bw * 0.5, bodyTop, bw, bodyH);

      /* Яркий блик от верхнего прожектора на стальной кромке крышки бочки */
      ctx.strokeStyle = 'rgba(255,242,210,0.34)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(sx, sy - bh * 0.90, bw * 0.46, bh * 0.055, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.restore();
    }

    /* Отрисовка обтягивающей цилиндрической наклейки с постоянно меняющимся российским именем на поясе бочки */
    if (ruName) {
      drawBarrelWrappedLabel(ctx, sx, sy, bh, ruName, { fallen: kind === 'fallen' });
      /* Если в этой бочке спрятан ништяк за цепью (Энергия/Жизнь) или пузырь Воздуха — рисуем обтягивающую бонусную наклейку */
      if (rewardBadge && kind !== 'fallen') {
        drawBarrelWrappedBadge(ctx, sx, sy, bh, rewardBadge);
      }
    }

    if (kind === 'chained') {
      this.drawBarrelChainsOverlay(ctx, sx, sy, bh, barrelObj);
    } else if (barrelObj && barrelObj.chainRemoved && this.t < (barrelObj.chainRemovedUntil || 0)) {
      this.drawBarrelChainRemovedOverlay(ctx, sx, sy, bh);
    }
  }

  /* Отрисовка предфинального уровня 07 «КРЫША ЗАВОДА С ВИДОМ НА МОРЕ · БОЧКА ТИЛЬ»:
     На горизонте шумят волны моря (ocean.jpg), на переднем плане — крыша завода с вентшахтами, трубами и парапетом,
     на крыше стоит кирпично-стальная стена с надписью «НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ, ЧТО О МОРЕ…» и стальной помост,
     на котором сидит герой спиной к бочкам и стоят бочка «ТИЛЬ» с рукой и бочки крыши! */
  drawOceanScene(ctx) {
    const v = this.view;
    const oc = sheets.ocean;
    const ocSp = sheets.oceanSprites || sheets.ocean;
    const narrow = v.w < 620;
    const horizonY = Math.round(v.y + v.h * (narrow ? 0.39 : 0.35));
    const roofDeckY = Math.round(v.y + v.h * 0.72);
    const roofTierY = (this.tierYs && this.tierYs[0]) ? this.tierYs[0] : Math.round(v.y + v.h * 0.85);
    const sunX = Math.round(v.x + v.w * 0.50);
    const sunY = horizonY + 4;
    const sunR = narrow ? 38 : 54;

    /* 1. КИНЕМАТОГРАФИЧЕСКОЕ НЕБО И АЛЫЙ ЗАКАТ НАД МОРЕМ («солнце погружается в волны и становится алым как кровь») */
    ctx.save();
    const skyGrad = ctx.createLinearGradient(0, v.y, 0, horizonY + 12);
    skyGrad.addColorStop(0, '#09111E');
    skyGrad.addColorStop(0.32, '#16243A');
    skyGrad.addColorStop(0.62, '#3D2438');
    skyGrad.addColorStop(0.84, '#8E2D2C');
    skyGrad.addColorStop(1, '#E05A36');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(v.x, v.y, v.w, horizonY - v.y + 4);

    /* Ореол заката и погружающееся в волны алое солнце */
    const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.15, sunX, sunY, sunR * 3.8);
    sunGlow.addColorStop(0, 'rgba(255, 220, 145, 0.92)');
    sunGlow.addColorStop(0.24, 'rgba(240, 92, 54, 0.65)');
    sunGlow.addColorStop(0.55, 'rgba(168, 36, 44, 0.28)');
    sunGlow.addColorStop(1, 'rgba(20, 14, 24, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(v.x, v.y, v.w, horizonY - v.y + 8);

    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, horizonY - v.y + 2);
    ctx.clip();
    const sunDisc = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR * 0.4);
    sunDisc.addColorStop(0, '#FFE599');
    sunDisc.addColorStop(0.45, '#F26430');
    sunDisc.addColorStop(0.82, '#B81D24');
    sunDisc.addColorStop(1, '#6E0D16');
    ctx.fillStyle = sunDisc;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    /* Подсвеченные алым закатом слоистые облака и парящие чайки у горизонта */
    for (let ci = 0; ci < 5; ci++) {
      const cx = v.x + ((ci * 210 + this.t * (6 + ci * 1.5)) % (v.w + 220)) - 110;
      const cy = horizonY - 22 - (ci % 3) * 18;
      const cw = 90 + (ci % 3) * 42;
      ctx.fillStyle = ci % 2 === 0 ? 'rgba(42, 22, 34, 0.55)' : 'rgba(195, 68, 52, 0.28)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, 7 + (ci % 2) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255, 228, 196, 0.65)';
    ctx.lineWidth = 1.4;
    for (let bi = 0; bi < 4; bi++) {
      const bx = v.x + ((bi * 165 + this.t * (18 + bi * 3)) % (v.w + 80)) - 40;
      const by = horizonY - 28 - (bi % 3) * 15 + Math.sin(this.t * 3 + bi) * 4;
      const flap = Math.sin(this.t * 7 + bi * 1.7) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 7, by + flap * 0.5);
      ctx.quadraticCurveTo(bx - 3, by - 3 - flap * 0.4, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 3 - flap * 0.4, bx + 7, by + flap * 0.5);
      ctx.stroke();
    }
    ctx.restore();

    /* 2. ЖИВОЕ ШТОРМОВОЕ МОРЕ ОТ ГОРИЗОНТА ДО КРАЯ КРЫШИ ЗАВОДА (многослойные 3D-волны, барашки пены и алая солнечная дорожка) */
    const seaH = roofDeckY - horizonY;
    const seaGrad = ctx.createLinearGradient(0, horizonY, 0, roofDeckY);
    seaGrad.addColorStop(0, '#2C3E55');
    seaGrad.addColorStop(0.18, '#1B3952');
    seaGrad.addColorStop(0.48, '#112C42');
    seaGrad.addColorStop(0.78, '#0B2032');
    seaGrad.addColorStop(1, '#071522');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(v.x, horizonY, v.w, seaH);

    /* Мягкое наложение текстуры морской ряби без горизонтальных швов */
    if (oc) {
      const srcW = Math.floor(oc.width * 0.702);
      const srcH = oc.height;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.drawImage(oc, 0, Math.floor(srcH * 0.14), srcW, Math.floor(srcH * 0.33), v.x, horizonY, v.w, seaH);
      ctx.restore();
    }

    /* Ало-золотая солнечная дорожка на воде от закатного солнца */
    for (let si = 0; si < 20; si++) {
      const p = si / 20;
      const ry = horizonY + 4 + Math.pow(p, 1.28) * (seaH - 10);
      const shimmerX = sunX + Math.sin(this.t * 3.4 + si * 0.9) * (6 + p * 26);
      const rw = (sunR * 0.55) + p * (narrow ? 95 : 155) + Math.cos(this.t * 4.2 + si) * 10;
      const rh = 1.8 + p * 3.8;
      ctx.fillStyle = p < 0.35
        ? `rgba(255, 210, 128, ${0.52 - p * 0.45})`
        : `rgba(228, 78, 54, ${0.42 - p * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(shimmerX, ry, rw * 0.5, rh * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 7 многослойных накатывающих волн с бирюзово-стальным просветом и белыми пенными гребнями */
    const waveCount = 7;
    for (let wi = 0; wi < waveCount; wi++) {
      const depth = wi / (waveCount - 1); /* 0 у горизонта -> 1 у парапета крыши */
      const baseWaveY = horizonY + 12 + Math.pow(depth, 1.22) * (seaH - 22);
      const amp = 2.2 + depth * (narrow ? 6.5 : 9.0);
      const freq = (0.022 - depth * 0.009);
      const speed = (1.3 + depth * 1.45) * (wi % 2 === 0 ? 1 : -0.85);
      const phase = this.t * speed + wi * 1.35;

      /* Тело волны */
      ctx.beginPath();
      ctx.moveTo(v.x, roofDeckY);
      for (let wx = v.x; wx <= v.x + v.w + 16; wx += 16) {
        const wy = baseWaveY
          + Math.sin(wx * freq + phase) * amp
          + Math.cos(wx * freq * 2.1 - phase * 1.3) * (amp * 0.36);
        ctx.lineTo(wx, wy);
      }
      ctx.lineTo(v.x + v.w + 16, roofDeckY);
      ctx.closePath();

      const wGrad = ctx.createLinearGradient(0, baseWaveY - amp, 0, baseWaveY + amp * 3.6);
      wGrad.addColorStop(0, `rgba(48, 128, 156, ${0.22 + depth * 0.16})`);
      wGrad.addColorStop(0.35, `rgba(18, 56, 82, ${0.45 + depth * 0.25})`);
      wGrad.addColorStop(1, `rgba(7, 22, 36, ${0.65 + depth * 0.25})`);
      ctx.fillStyle = wGrad;
      ctx.fill();

      /* Пенный гребень и алый отсвет заката на кромке волны */
      ctx.beginPath();
      for (let wx = v.x; wx <= v.x + v.w + 12; wx += 12) {
        const wy = baseWaveY
          + Math.sin(wx * freq + phase) * amp
          + Math.cos(wx * freq * 2.1 - phase * 1.3) * (amp * 0.36);
        if (wx === v.x) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.strokeStyle = `rgba(218, 242, 252, ${0.24 + depth * 0.38})`;
      ctx.lineWidth = 1.1 + depth * 1.6;
      ctx.stroke();

      /* Барашки морской пены на гребнях ближних волн */
      if (wi >= 2) {
        ctx.fillStyle = `rgba(235, 248, 255, ${0.20 + depth * 0.28})`;
        const stepFoam = narrow ? 68 : 88;
        for (let fx = v.x + ((wi * 37) % stepFoam); fx < v.x + v.w; fx += stepFoam) {
          const crest = Math.sin(fx * freq + phase);
          if (crest > 0.35) {
            const fy = baseWaveY + crest * amp - 1;
            ctx.beginPath();
            ctx.ellipse(fx, fy, 8 + depth * 10, 1.6 + depth * 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    /* Брызги морского прибоя у подножия стены завода */
    for (let sp = 0; sp < 6; sp++) {
      const splashPhase = (this.t * 0.9 + sp * 0.41) % 1;
      const sx = v.x + (v.w * (0.12 + sp * 0.15)) + Math.sin(this.t * 2 + sp) * 18;
      const sy = roofDeckY - 8 - Math.sin(splashPhase * Math.PI) * 16;
      ctx.fillStyle = `rgba(220, 242, 255, ${(1 - splashPhase) * 0.28})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 6 + splashPhase * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* 3. Архитектура КРЫШИ ЗАВОДА, выходящей к морю: рубероидно-бетонная плита крыши, вентшахты, заводские трубы и парапет */
    ctx.save();
    const roofGrad = ctx.createLinearGradient(0, roofDeckY, 0, v.y + v.h);
    roofGrad.addColorStop(0, '#1F2730');
    roofGrad.addColorStop(0.25, '#171D25');
    roofGrad.addColorStop(0.75, '#11151B');
    roofGrad.addColorStop(1, '#0A0D12');
    ctx.fillStyle = roofGrad;
    ctx.fillRect(v.x, roofDeckY, v.w, v.y + v.h - roofDeckY);

    /* Бетонный бортик-карниз края крыши завода над морем с жёлто-чёрной сигнальной разметкой */
    ctx.fillStyle = '#2B3440';
    ctx.fillRect(v.x, roofDeckY - 6, v.w, 12);
    ctx.strokeStyle = 'rgba(170,188,205,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(v.x, roofDeckY - 6, v.w, 12);
    ctx.fillStyle = 'rgba(212,168,67,0.45)';
    for (let hx = v.x + 16; hx < v.x + v.w - 20; hx += 56) {
      ctx.fillRect(hx, roofDeckY - 3, 22, 5);
    }

    /* Стальное ограждение-перила вдоль края крыши с видом на море */
    const edgeRailY = roofDeckY - 30;
    ctx.strokeStyle = 'rgba(148,168,188,0.75)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(v.x, edgeRailY);
    ctx.lineTo(v.x + v.w, edgeRailY);
    ctx.moveTo(v.x, edgeRailY + 12);
    ctx.lineTo(v.x + v.w, edgeRailY + 12);
    for (let rx = v.x + 28; rx < v.x + v.w; rx += 74) {
      ctx.moveTo(rx, edgeRailY);
      ctx.lineTo(rx, roofDeckY - 6);
    }
    ctx.stroke();

    /* Заводские вентиляционные дефлекторы, трубы с дымком и сигнальный маяк на крыше завода */
    const leftStackX = Math.round(v.x + v.w * 0.07);
    const rightVentX = Math.round(v.x + v.w * 0.92);
    /* Левая кирпично-стальная труба крыши с паром */
    ctx.fillStyle = '#1B2129';
    ctx.strokeStyle = '#3B4654';
    ctx.lineWidth = 1.5;
    ctx.fillRect(leftStackX - 15, roofDeckY - 62, 30, 56);
    ctx.strokeRect(leftStackX - 15, roofDeckY - 62, 30, 56);
    ctx.fillStyle = '#9E2A2B';
    ctx.fillRect(leftStackX - 16, roofDeckY - 54, 32, 7);
    ctx.fillRect(leftStackX - 16, roofDeckY - 38, 32, 7);
    /* Клубы пара из трубы на морском ветру */
    for (let sm = 0; sm < 3; sm++) {
      const sp = (this.t * 0.35 + sm * 0.33) % 1;
      ctx.fillStyle = `rgba(218,230,242,${(1 - sp) * 0.24})`;
      ctx.beginPath();
      ctx.ellipse(leftStackX + 10 + sp * 42, roofDeckY - 68 - sp * 26, 13 + sp * 15, 6 + sp * 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    /* Правая вентиляционная будка крыши с красным маячком */
    ctx.fillStyle = '#1D242D';
    ctx.fillRect(rightVentX - 22, roofDeckY - 44, 44, 38);
    ctx.strokeRect(rightVentX - 22, roofDeckY - 44, 44, 38);
    const beaconPulse = 0.5 + Math.sin(this.t * 5) * 0.45;
    ctx.fillStyle = `rgba(255,77,77,${beaconPulse})`;
    ctx.beginPath();
    ctx.arc(rightVentX, roofDeckY - 50, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 4. СТЕНА НА КРЫШЕ ЗАВОДА с надписью краской: «НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ, ЧТО О МОРЕ…» (компактная, не закрывает небо и закат!) */
    const wallW = Math.min(v.w * (narrow ? 0.92 : 0.62), 540);
    const wallH = narrow ? 46 : 48;
    const wallX = v.x + (v.w - wallW) / 2;
    const wallY = v.y + (narrow ? Math.round(v.h * 0.165) : (S.godMode ? 84 : 58));
    ctx.save();
    /* Боковые стальные фермы-опоры, удерживающие стену на крыше завода (не закрывают солнце и море по центру!) */
    ctx.fillStyle = 'rgba(20, 26, 34, 0.82)';
    ctx.strokeStyle = '#3E4A59';
    ctx.lineWidth = 1.5;
    ctx.fillRect(wallX + 10, wallY + wallH, 7, Math.max(12, roofDeckY - (wallY + wallH)));
    ctx.fillRect(wallX + wallW - 17, wallY + wallH, 7, Math.max(12, roofDeckY - (wallY + wallH)));

    /* Кирпично-бетонная фактура стены крыши */
    if (sheets.factory) {
      const fw = sheets.factory.width, fh = sheets.factory.height;
      ctx.globalAlpha = 0.82;
      ctx.drawImage(
        sheets.factory,
        Math.floor(fw * 0.08), Math.floor(fh * 0.38),
        Math.floor(fw * 0.42), Math.floor(fh * 0.18),
        wallX, wallY, wallW, wallH
      );
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(14,17,22,0.82)';
    ctx.fillRect(wallX, wallY, wallW, wallH);
    ctx.strokeStyle = 'rgba(212,168,67,0.75)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(wallX, wallY, wallW, wallH);

    /* Надпись белой/охристой краской на стене крыши с потёками краски */
    ctx.fillStyle = '#ECE4D2';
    ctx.font = narrow
      ? 'bold 12.5px "Bebas Neue", "Impact", "JetBrains Mono", sans-serif'
      : 'bold 17px "Bebas Neue", "Impact", "JetBrains Mono", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.92)';
    ctx.shadowBlur = 5;
    ctx.fillText(t('oceanWallQuote'), wallX + wallW / 2, wallY + (narrow ? 22 : 25), wallW - 16);
    ctx.font = narrow ? '7.5px "JetBrains Mono", monospace' : '9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(212,168,67,0.94)';
    ctx.fillText(t('oceanWallSub'), wallX + wallW / 2, wallY + (narrow ? 38 : 43), wallW - 16);
    ctx.restore();

    /* 5. СТАЛЬНОЙ ПОМОСТ НА КРЫШЕ ЗАВОДА (на котором стоят все бочки и сидит герой!) */
    this.drawSteelCatwalk(ctx, roofTierY, 0);

    /* 6. Боковые бочки на стальном помосте крыши завода с меняющимися российскими именами */
    const sh = sheets.barrels;
    const bh = this.bh;
    this.barrels.slice(1).forEach((b) => {
      const sx = b.x + Math.sin(this.t * 40) * 5 * b.shake;
      const sy = b.y;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 3, bh * 0.34, bh * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      const key = b.kind === 'closed' ? b.name : b.kind;
      const badge = b.kind === 'chained'
        ? (b.chainLoot === 'life' ? 'life' : 'energy')
        : (!b.chainRemoved && b.hasAirBubble ? 'air' : '');
      if (sh) this.drawBarrelSolid(ctx, sh, key, sx, sy, bh * 0.86, b.kind, b.ruName, badge, b);
      if (b.knockedDown) {
        ctx.save();
        ctx.font = 'bold 8px "JetBrains Mono"';
        ctx.fillStyle = 'rgba(158,42,43,0.92)';
        ctx.fillRect(sx - 38, sy - bh * 0.58 - 14, 76, 13);
        ctx.fillStyle = '#FFD166';
        ctx.textAlign = 'center';
        ctx.fillText('💥 УПАЛА · ПУСТО', sx, sy - bh * 0.58 - 4);
        ctx.restore();
      }
    });

    /* 7. Качающаяся на стальном помосте крыши бочка с высунутой рукой и надписью «ТИЛЬ» (БЕЗ квадратной рамки вокруг неё!) */
    const mainB = this.barrels[0];
    if (mainB) {
      const bx = mainB.x;
      const by = mainB.y;
      const rockAngle = Math.sin(this.t * 3.2) * 0.065 + Math.sin(this.t * 38) * 0.095 * mainB.shake;
      ctx.save();
      ctx.translate(bx, by - bh * 0.38);
      ctx.rotate(rockAngle);

      /* Тень под качающейся бочкой на стальном помосте */
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.beginPath();
      ctx.ellipse(10, bh * 0.40, bh * 0.74, bh * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();

      if (ocSp) {
        const [sx, sy, sw, shRect] = oceanRect(ocSp, 'barrelHand');
        const drawH = bh * 1.05;
        const drawW = drawH * (sw / shRect);
        ctx.drawImage(ocSp, sx, sy, sw, shRect, -drawW * 0.5, -drawH * 0.5, drawW, drawH);

        /* Обтягивающая цилиндрическая наклейка «ТИЛЬ» прямо на боку качающейся бочки */
        ctx.save();
        ctx.translate(drawW * 0.08, bh * 0.42);
        ctx.rotate(-0.08);
        drawBarrelWrappedLabel(ctx, 0, 0, bh * 0.96, 'ТИЛЬ', { wFrac: 0.62, hFrac: 0.21, sagFrac: 0.042 });
        ctx.restore();
      } else if (sh) {
        this.drawBarrelSolid(ctx, sh, 'fallen', 0, bh * 0.38, bh, 'fallen', 'ТИЛЬ');
      }
      ctx.restore();
    }

    /* 8. Сидящий на стальном помосте крыши завода герой из «Достучаться до небес»:
       - когда 'sea': сидит спиной и смотрит на море (sittingMan);
       - когда 'turning': поворачивает голову и плечо вполоборота (sittingManTurning);
       - когда 'turned': повернулся к нам лицом в пиджаке и белом джемпере и смотрит на бочку «ТИЛЬ» (sittingManTurned)! */
    const manX = v.x + v.w * 0.30;
    const manY = roofTierY - 2;
    const manH = bh * 1.24;
    drawShadow(ctx, manX, manY, manH * 0.38);

    if (this.oceanState === 'turned' && mainB) {
      /* Луч взгляда от лица повернувшегося героя прямо на качающуюся бочку «ТИЛЬ» */
      drawCone(ctx, manX + 14, manY - manH * 0.78, mainB.x, mainB.y - bh * 0.38, '212,58,52', 0.34, 62);
    }

    if (ocSp) {
      const manFrameKey = (this.oceanState === 'turned' && sheets.oceanSprites)
        ? 'sittingManTurned'
        : (this.oceanState === 'turning' && sheets.oceanSprites)
          ? 'sittingManTurning'
          : 'sittingMan';
      const [sx, sy, sw, shRect] = oceanRect(ocSp, manFrameKey);
      const drawW = manH * (sw / shRect);
      ctx.save();
      ctx.translate(manX, manY);
      if (this.oceanState === 'turning') {
        ctx.translate(Math.sin(this.t * 24) * 2, 0);
      }
      ctx.drawImage(ocSp, sx, sy, sw, shRect, -drawW / 2, -manH, drawW, manH);
      ctx.restore();
    }

    /* Компактный знак внимания над головой сидящего героя только при повороте */
    if (this.oceanState !== 'sea') {
      ctx.save();
      ctx.font = 'bold 18px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.oceanState === 'turned' ? '#FF4D4D' : '#FFD166';
      ctx.fillText(this.oceanState === 'turned' ? '👁️ !' : '⚠️ ?', manX, manY - manH - 6);
      ctx.restore();
    }

    if (this.oceanSpeechT > 0 && this.oceanSpeech) {
      ctx.save();
      ctx.font = narrow ? '8.5px "JetBrains Mono", monospace' : '10px "JetBrains Mono", monospace';
      const tw = Math.min(narrow ? 260 : 320, ctx.measureText(this.oceanSpeech).width + 18);
      const bx = Math.max(v.x + tw / 2 + 8, Math.min(v.x + v.w - tw / 2 - 8, manX));
      const by = manY - manH - 22;
      ctx.fillStyle = 'rgba(8,9,11,0.90)';
      ctx.strokeStyle = this.oceanState === 'turned' ? '#FF4D4D' : '#D4A843';
      ctx.lineWidth = 1.2;
      ctx.fillRect(bx - tw / 2, by - 17, tw, 20);
      ctx.strokeRect(bx - tw / 2, by - 17, tw, 20);
      ctx.fillStyle = '#ECE4D2';
      ctx.textAlign = 'center';
      ctx.fillText(this.oceanSpeech, bx, by - 4, tw - 10);
      ctx.restore();
    }

    /* 9. Индикатор статуса перенесён в самый низ экрана под помост (чтобы не перекрывать ни героя, ни бочку «ТИЛЬ»!) */
    ctx.save();
    const bannerTxt = this.oceanState === 'turned'
      ? `🚫 ОН ПОВЕРНУЛСЯ И СМОТРИТ (${Math.max(0, this.oceanStateT).toFixed(1)}с) — НЕ СТУЧИ!`
      : this.oceanState === 'turning'
        ? t('oceanTurnWarn')
        : t('oceanSafeHint');
    ctx.font = narrow ? 'bold 9px "JetBrains Mono", monospace' : 'bold 10.5px "JetBrains Mono", monospace';
    const bw = Math.min(v.w - 20, Math.max(260, ctx.measureText(bannerTxt).width + 22));
    const bx = v.x + v.w / 2;
    const by = v.y + v.h - (narrow ? 12 : 10);
    ctx.fillStyle = this.oceanState === 'turned'
      ? 'rgba(168,28,32,0.95)'
      : this.oceanState === 'turning'
        ? 'rgba(180,125,32,0.95)'
        : 'rgba(10,18,28,0.90)';
    ctx.strokeStyle = this.oceanState === 'turned' ? '#FF6B6B' : '#D4A843';
    ctx.lineWidth = 1.4;
    ctx.fillRect(bx - bw / 2, by - 15, bw, 20);
    ctx.strokeRect(bx - bw / 2, by - 15, bw, 20);
    ctx.fillStyle = '#ECE4D2';
    ctx.textAlign = 'center';
    ctx.fillText(bannerTxt, bx, by - 1.5, bw - 10);
    ctx.restore();
  }

  /* Отрисовка Уровня 06 «СТАРАЯ ЦЕРКОВЬ · АЛТАРЬ»:
     Отец прикован тяжёлыми коваными 3D-цепями к центральной каменной стене алтаря! */
  drawAltarChainedFather(ctx) {
    if (!this.isAltarFather || !this.fatherChained || this.fatherChained.freed) return;
    const fc = this.fatherChained;
    const { cx, cy, w, h, narrow } = this.getAltarFatherBox();
    const watched = this.isAltarWatched();
    const dmgRatio = Math.min(0.99, fc.hitsDone / Math.max(1, fc.hitsMax));
    const jitter = fc.shake > 0.05 ? Math.sin(this.t * 52) * 4 * fc.shake : 0;

    ctx.save();
    /* 1. Каменная арка алтаря на задней стене церкви со свечами и железными кольцами */
    const archW = w * 1.15;
    const archH = h * 1.24;
    const archTop = cy - archH + 10;

    const archGrad = ctx.createLinearGradient(cx, archTop, cx, cy + 12);
    archGrad.addColorStop(0, 'rgba(28, 18, 14, 0.94)');
    archGrad.addColorStop(0.6, 'rgba(18, 12, 10, 0.94)');
    archGrad.addColorStop(1, 'rgba(10, 8, 8, 0.96)');
    ctx.fillStyle = archGrad;
    ctx.strokeStyle = watched ? '#FF4D4D' : (this.levelPoints <= 0 ? '#FFD166' : '#D4A843');
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cx - archW * 0.5, archTop, archW, archH, [archW * 0.42, archW * 0.42, 8, 8]);
    ctx.fill();
    ctx.stroke();

    /* Внутреннее золотисто-багровое свечение свечей алтаря */
    const glow = ctx.createRadialGradient(cx, cy - h * 0.48, 8, cx, cy - h * 0.48, archW * 0.65);
    glow.addColorStop(0, watched ? 'rgba(220, 48, 48, 0.34)' : 'rgba(212, 168, 67, 0.28)');
    glow.addColorStop(1, 'rgba(212, 168, 67, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.48, archW * 0.65, 0, Math.PI * 2);
    ctx.fill();

    /* Алтарные свечи по бокам каменной ниши */
    [-archW * 0.40, archW * 0.40].forEach((ox, idx) => {
      const candleX = cx + ox;
      const candleY = cy - h * 0.22;
      ctx.fillStyle = '#EAE0C8';
      ctx.fillRect(candleX - 3, candleY - 16, 6, 16);
      const flick = Math.sin(this.t * 16 + idx * 2) * 1.5;
      ctx.fillStyle = '#FFD166';
      ctx.beginPath();
      ctx.ellipse(candleX + flick * 0.3, candleY - 20, 3.5, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    /* 2. Фигура Отца, прикованного к стене алтаря */
    drawShadow(ctx, cx, cy + 2, h * 0.38);
    if (this.altarFatherActor) {
      this.altarFatherActor.draw(ctx, cx + jitter, cy, h);
    }

    /* 3. Четыре мощные кованые 3D-цепи, идущие от железных колец в каменной стене к рукам и груди Отца */
    const ringLeftX = cx - archW * 0.43;
    const ringRightX = cx + archW * 0.43;
    const ringTopY = cy - h * 0.78;
    const ringBotY = cy - h * 0.34;
    const chestX = cx + jitter;
    const chestY = cy - h * 0.52;

    this.drawCurvedChainStrand(ctx, ringLeftX, ringTopY, chestX - 10, chestY - 8, 8, h * 0.88, dmgRatio);
    this.drawCurvedChainStrand(ctx, ringRightX, ringTopY, chestX + 10, chestY - 8, 8, h * 0.88, dmgRatio);
    this.drawCurvedChainStrand(ctx, ringLeftX, ringBotY, chestX - 12, chestY + 8, 10, h * 0.88, dmgRatio);
    this.drawCurvedChainStrand(ctx, ringRightX, ringBotY, chestX + 12, chestY + 8, 10, h * 0.88, dmgRatio);
    /* Поясная цепь и кованый замок на груди Отца */
    this.drawCurvedChainStrand(ctx, chestX - h * 0.28, chestY, chestX + h * 0.28, chestY, 6, h * 0.88, dmgRatio);

    /* Массивный замок по центру цепей Отца */
    ctx.fillStyle = dmgRatio > 0.5 ? '#C86D3B' : '#E0B24C';
    ctx.strokeStyle = '#14181E';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(chestX - 10, chestY - 7, 20, 18, 3);
    ctx.fill();
    ctx.stroke();

    /* Если пастор сейчас смотрит на алтарь — рисуем красный луч проверки прямо на Отца */
    if (watched && this.walker) {
      drawCone(ctx, this.walker.x, this.walkerY(this.walker) - this.walkerH(this.walker) * 0.7, cx, chestY, '220,48,48', 0.32, 64);
    }

    /* 4. Плашка прогресса цепей Отца и подсказка механики (очки за удар / удар за 1 ❤️ ЖИЗНЬ при 0 очков) */
    const leftHits = Math.max(0, fc.hitsMax - fc.hitsDone);
    const barW = Math.min(this.view.w - 20, narrow ? 316 : 410);
    const barH = narrow ? 38 : 42;
    const barX = cx - barW * 0.5;
    const barY = archTop - barH - 6;

    ctx.fillStyle = 'rgba(10, 12, 16, 0.94)';
    ctx.strokeStyle = watched
      ? '#FF4D4D'
      : this.levelPoints <= 0
        ? '#FFD166'
        : '#64DFDF';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();
    ctx.stroke();

    /* Полоса прогресса разрушения цепей Отца */
    const progFrac = Math.min(1, fc.hitsDone / Math.max(1, fc.hitsMax));
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(barX + 8, barY + barH - 9, barW - 16, 5);
    ctx.fillStyle = this.levelPoints <= 0 ? '#FFD166' : '#80ED99';
    ctx.fillRect(barX + 8, barY + barH - 9, (barW - 16) * progFrac, 5);

    ctx.textAlign = 'center';
    ctx.font = narrow ? 'bold 9.5px "JetBrains Mono"' : 'bold 11px "JetBrains Mono"';
    ctx.fillStyle = '#ECE4D2';
    ctx.fillText(
      `⛓️ ОТЕЦ В ЦЕПЯХ НА СТЕНЕ: ${fc.hitsDone}/${fc.hitsMax} (ОСТ. ${leftHits} УД.) · ОЧКИ: ${Math.floor(this.levelPoints)}`,
      cx,
      barY + 13
    );

    let subTxt = '';
    let subCol = '#64DFDF';
    if (watched) {
      subTxt = '👁️ ПАСТОР СМОТРИТ НА АЛТАРЬ — НЕ СТУЧИ ПО ЦЕПЯМ!';
      subCol = '#FF6B6B';
    } else if (this.levelPoints <= 0) {
      subTxt = `💔 ОЧКИ НА НУЛЕ! КОПИ НА БОЧКАХ ИЛИ БЕЙ ЦЕНОЙ ❤️ ЖИЗНЕЙ РАДИ ОТЦА (❤️: ${S.lives})!`;
      subCol = '#FFD166';
    } else {
      subTxt = `🔨 НАЖМИ НА ОТЦА, ПОКА НЕ ВИДЯТ (-${fc.hitCost} ОЧКОВ ЗА УДАР ПО ЦЕПЯМ!)`;
      subCol = '#80ED99';
    }
    ctx.font = narrow ? 'bold 8px "JetBrains Mono"' : 'bold 9.5px "JetBrains Mono"';
    ctx.fillStyle = subCol;
    ctx.fillText(subTxt, cx, barY + 26, barW - 12);

    /* Реплика прикованного Отца */
    if (fc.speechT > 0 && fc.speech) {
      ctx.font = narrow ? '9px "JetBrains Mono"' : '10.5px "JetBrains Mono"';
      const sw = Math.min(this.view.w - 24, Math.max(220, ctx.measureText(fc.speech).width + 18));
      const sy = cy + 16;
      ctx.fillStyle = 'rgba(12, 14, 18, 0.94)';
      ctx.strokeStyle = '#D4A843';
      ctx.lineWidth = 1.2;
      ctx.fillRect(cx - sw * 0.5, sy, sw, 20);
      ctx.strokeRect(cx - sw * 0.5, sy, sw, 20);
      ctx.fillStyle = '#FFF3D1';
      ctx.fillText(fc.speech, cx, sy + 13.5, sw - 10);
    }
    ctx.restore();
  }

  /* Мини-мультик после сбития всех цепей Отца (или отдачи всех ❤️ жизней ради спасения Отца):
     Цепи разлетаются, Отец свободен на алтаре, а герой в золотом луче поднимается на новый уровень — НА НЕБЕСА («Достучаться до небес»)! */
  drawAltarHeavenCutscene(ctx) {
    if (!this.isAltarFather || !this.fatherChained || !this.fatherChained.cutscene) return;
    const fc = this.fatherChained;
    const v = this.view;
    const narrow = v.w < 620;
    const t = fc.cutsceneT || 0;
    const dur = fc.cutsceneDur || 4.8;
    const p = Math.min(1, t / dur);
    const cx = v.x + v.w * 0.5;
    const cy = v.y + v.h * 0.52;

    ctx.save();
    /* 1. Раскрытие свода церкви в закатно-золотое небо Небес и Моря */
    const bgGrad = ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
    bgGrad.addColorStop(0, `rgba(18, 32, 58, ${0.82 + p * 0.14})`);
    bgGrad.addColorStop(0.38, `rgba(162, 54, 46, ${0.76 + p * 0.18})`);
    bgGrad.addColorStop(0.72, `rgba(32, 22, 26, 0.92)`);
    bgGrad.addColorStop(1, 'rgba(8, 10, 14, 0.96)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(v.x, v.y, v.w, v.h);

    /* 2. Мощный золотой столб небесного света сверху вниз на Алтарь */
    const beamW = (narrow ? 150 : 230) * (0.75 + p * 0.45);
    const beamGrad = ctx.createLinearGradient(cx, v.y, cx, v.y + v.h);
    beamGrad.addColorStop(0, 'rgba(255, 236, 175, 0.85)');
    beamGrad.addColorStop(0.55, 'rgba(255, 200, 110, 0.38)');
    beamGrad.addColorStop(1, 'rgba(212, 168, 67, 0.05)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(cx - beamW * 0.36, v.y);
    ctx.lineTo(cx + beamW * 0.36, v.y);
    ctx.lineTo(cx + beamW * 0.85, v.y + v.h);
    ctx.lineTo(cx - beamW * 0.85, v.y + v.h);
    ctx.closePath();
    ctx.fill();

    /* Плывущие золотые облака Небес в верхней части */
    for (let i = 0; i < 6; i++) {
      const ox = cx + Math.sin(t * 0.9 + i * 1.4) * (v.w * 0.32);
      const oy = v.y + v.h * 0.22 + (i % 3) * 28;
      ctx.fillStyle = `rgba(255, 225, 168, ${0.24 + (i % 2) * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(ox, oy, 75 + (i % 3) * 25, 16 + (i % 2) * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 3. Разлетающиеся в стороны разорванные звенья цепей */
    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * Math.PI * 2 + 0.3;
      const dist = 28 + t * (85 + (k % 3) * 32);
      const lx = cx + Math.cos(ang) * dist;
      const ly = (cy + 40) + Math.sin(ang) * dist * 0.7 + t * t * 38;
      this.drawSingleChainLink3D(ctx, lx, ly, ang + t * 5, 16, 10, k % 2 === 0, 0.8);
    }

    /* 4. Освобождённый Отец на каменном помосте внизу (свободен от цепей!) */
    const fatherY = v.y + v.h * 0.77;
    const charH = narrow ? 96 : 122;
    drawShadow(ctx, cx - 44, fatherY + 2, charH * 0.36);
    if (this.altarFatherActor) {
      this.altarFatherActor.draw(ctx, cx - 44, fatherY, charH);
    }
    ctx.fillStyle = '#80ED99';
    ctx.font = narrow ? 'bold 10px "JetBrains Mono"' : 'bold 12px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('🔓 ОТЕЦ СВОБОДЕН!', cx - 44, fatherY - charH - 10);

    /* 5. Фигура Пацана, плавно поднимающаяся в золотом луче на Небеса (на новый уровень к морю) */
    const boyStartY = fatherY;
    const boyEndY = v.y + v.h * 0.36;
    const boyY = boyStartY - Math.pow(p, 0.85) * (boyStartY - boyEndY);
    const boyX = cx + 42 - p * 22;

    const aura = ctx.createRadialGradient(boyX, boyY - charH * 0.45, 6, boyX, boyY - charH * 0.45, charH * 0.72);
    aura.addColorStop(0, 'rgba(255, 244, 196, 0.88)');
    aura.addColorStop(0.5, 'rgba(255, 200, 102, 0.35)');
    aura.addColorStop(1, 'rgba(255, 200, 102, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(boyX, boyY - charH * 0.45, charH * 0.72, 0, Math.PI * 2);
    ctx.fill();

    if (fc.boyActor) {
      fc.boyActor.draw(ctx, boyX, boyY, charH * 0.92);
    }
    ctx.fillStyle = '#FFD166';
    ctx.fillText('✨ НА НЕБЕСА К МОРЮ ▲', boyX, boyY - charH * 0.95 - 8);

    /* 6. Кинематографические титры мини-мультика */
    const boxW = Math.min(v.w - 24, narrow ? 336 : 520);
    const boxH = narrow ? 96 : 108;
    const boxX = cx - boxW * 0.5;
    const boxY = v.y + v.h * 0.79;

    ctx.fillStyle = 'rgba(8, 10, 14, 0.94)';
    ctx.strokeStyle = '#FFD166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFD166';
    ctx.font = narrow ? 'bold 12px "JetBrains Mono"' : 'bold 15px "JetBrains Mono"';
    ctx.fillText('⛓️💥 ЦЕПИ СБИТЫ — ОТЕЦ СВОБОДЕН!', cx, boxY + 24, boxW - 16);

    ctx.fillStyle = '#ECE4D2';
    ctx.font = narrow ? '10px "JetBrains Mono"' : '12px "JetBrains Mono"';
    ctx.fillText(
      fc.sacrificedAllLives
        ? '💔 Ты отдал все свои ❤️ жизни, чтобы спасти Отца из цепей...'
        : '✨ Ты разорвал цепи Алтаря и спас Отца!',
      cx,
      boxY + 48,
      boxW - 16
    );

    ctx.fillStyle = '#64DFDF';
    ctx.font = narrow ? 'bold 10.5px "JetBrains Mono"' : 'bold 12.5px "JetBrains Mono"';
    ctx.fillText('🌅 ТЫ ПРОШЁЛ НА НОВЫЙ УРОВЕНЬ — НА НЕБЕСА («ДОСТУЧАТЬСЯ ДО НЕБЕС»)!', cx, boxY + 72, boxW - 16);

    /* Полоска перехода на уровень Небес */
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(boxX + 16, boxY + boxH - 12, boxW - 32, 5);
    ctx.fillStyle = '#FFD166';
    ctx.fillRect(boxX + 16, boxY + boxH - 12, (boxW - 32) * p, 5);

    ctx.restore();
  }

  /* Отрисовка разных ярусов завода (Ур. 01–06), арочных окон с луной и облаками,
     вертикальных двутавровых столбов с цепями и стальных помостов под каждым рядом бочек */
  drawFactoryArchitecture(ctx) {
    const v = this.view;
    const lvl = this.level || 1;

    /* 1. Ночное небо за окнами завода: плывущая луна и ночные облака */
    const skyGrad = ctx.createLinearGradient(0, v.y, 0, v.y + v.h * 0.55);
    skyGrad.addColorStop(0, '#070B12');
    skyGrad.addColorStop(0.6, '#101A28');
    skyGrad.addColorStop(1, '#16202B');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(v.x, v.y, v.w, v.h);

    /* 2. Выбор уникальной локации/сектора завода для каждого уровня (01–06) */
    const ZONE_CROPS = {
      /* Ур. 01 (Отец): Главный кран-балочный цех с окнами (верх factory.jpg) */
      1: { sheet: 'factory', crop: [0.03, 0.03, 0.94, 0.34], tint: 'rgba(14,20,28,0.34)', label: 'ЦЕХ №1 · КРАН-БАЛКА' },
      /* Ур. 02 (Сообщник): Мастерская с маховиком, шестернями и часами (средний ярус factory_sector.jpg) */
      2: { sheet: 'factorySector', crop: [0.29, 0.35, 0.68, 0.32], tint: 'rgba(22,18,14,0.34)', label: 'ЦЕХ №2 · МАСТЕРСКАЯ И МАХОВИК' },
      /* Ур. 03 (Девушка): Кирпичный ярус с лестницами и шкафчиками (средний ярус factory.jpg) */
      3: { sheet: 'factory', crop: [0.03, 0.36, 0.94, 0.31], tint: 'rgba(14,22,26,0.34)', label: 'ЦЕХ №3 · КИРПИЧНЫЙ ЯРУС' },
      /* Ур. 04 (Овчарка Рекс): Склад бочек «Сектор 3» с цепями (нижний ярус factory_sector.jpg) */
      4: { sheet: 'factorySector', crop: [0.29, 0.67, 0.68, 0.31], tint: 'rgba(20,16,12,0.32)', label: 'СЕКТОР 3 · СКЛАД БОЧЕК' },
      /* Ур. 05 (Пацан): Диспетчерская под луной (верхний ярус factory_sector.jpg) */
      5: { sheet: 'factorySector', crop: [0.28, 0.03, 0.69, 0.33], tint: 'rgba(12,18,28,0.32)', label: 'ЦЕХ №5 · ДИСПЕТЧЕРСКАЯ' },
      /* Ур. 06 (Священник — Тиль Швайгер): Старая деревянная церковь с витражами и крестом (верх church.jpg) */
      6: { sheet: 'church', crop: [0.14, 0.05, 0.82, 0.37], tint: 'rgba(24,16,12,0.30)', label: 'СТАРАЯ ЦЕРКОВЬ · АЛТАРЬ' },
    };
    const zCfg = ZONE_CROPS[lvl] || ZONE_CROPS[1];
    const bgSheet = sheets[zCfg.sheet] || sheets.factory;
    if (bgSheet) {
      const [fx, fy, fw, fh] = zCfg.crop;
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.drawImage(
        bgSheet,
        Math.floor(fx * bgSheet.width), Math.floor(fy * bgSheet.height),
        Math.floor(fw * bgSheet.width), Math.floor(fh * bgSheet.height),
        v.x, v.y, v.w, v.h
      );
      ctx.restore();
    }
    ctx.fillStyle = zCfg.tint;
    ctx.fillRect(v.x, v.y, v.w, v.h);

    /* 3. Большие индустриальные арочные окна («окна») вдоль задней стены с плывущей луной и облаками */
    const narrow = v.w < 620;
    const winCount = narrow ? 3 : 4;
    const winW = Math.min(138, Math.floor((v.w * 0.62) / winCount));
    const winH = Math.min(176, Math.floor(v.h * (narrow ? 0.22 : 0.33)));
    const winY = v.y + Math.max(narrow ? 128 : 54, Math.floor(v.h * 0.11));

    for (let i = 0; i < winCount; i++) {
      const wx = Math.round(v.x + (v.w * (i + 0.5)) / winCount - winW * 0.5);
      ctx.save();
      /* Арочный проём окна */
      ctx.beginPath();
      ctx.moveTo(wx, winY + winH);
      ctx.lineTo(wx, winY + winW * 0.38);
      ctx.arc(wx + winW * 0.5, winY + winW * 0.38, winW * 0.5, Math.PI, 0, false);
      ctx.lineTo(wx + winW, winY + winH);
      ctx.closePath();
      ctx.clip();

      /* Ночное небо в окне */
      const wg = ctx.createLinearGradient(0, winY, 0, winY + winH);
      wg.addColorStop(0, '#0D1826');
      wg.addColorStop(0.65, '#1B2D42');
      wg.addColorStop(1, '#24374C');
      ctx.fillStyle = wg;
      ctx.fillRect(wx, winY, winW, winH);

      /* В одном из окон видна медленно плывущая Луна */
      if (i === winCount - 2) {
        const mx = wx + winW * 0.56 + Math.sin(this.t * 0.18) * 14;
        const my = winY + winH * 0.34;
        const mg = ctx.createRadialGradient(mx, my, 4, mx, my, 42);
        mg.addColorStop(0, 'rgba(245,236,205,0.95)');
        mg.addColorStop(0.35, 'rgba(232,208,150,0.42)');
        mg.addColorStop(1, 'rgba(232,208,150,0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mx, my, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F3EAD2';
        ctx.beginPath();
        ctx.arc(mx, my, 15, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Плывущие ночные облака за переплётами окна */
      const cloudShift = ((this.t * 14 + i * 50) % (winW + 90)) - 45;
      ctx.fillStyle = 'rgba(180,202,224,0.16)';
      ctx.beginPath();
      ctx.ellipse(wx + cloudShift, winY + winH * 0.48, 38, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(wx + cloudShift + 24, winY + winH * 0.45, 28, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      /* Стальная решётка переплёта окна */
      ctx.strokeStyle = '#14181F';
      ctx.lineWidth = 3;
      for (let c = 1; c <= 2; c++) {
        const gx = wx + (winW * c) / 3;
        ctx.beginPath();
        ctx.moveTo(gx, winY);
        ctx.lineTo(gx, winY + winH);
        ctx.stroke();
      }
      for (let r = 1; r <= 3; r++) {
        const gy = winY + (winH * r) / 4;
        ctx.beginPath();
        ctx.moveTo(wx, gy);
        ctx.lineTo(wx + winW, gy);
        ctx.stroke();
      }
      ctx.restore();

      /* Кирпично-стальная рама арочного окна */
      ctx.save();
      ctx.strokeStyle = lvl === 6 ? '#5A3E28' : '#2C3540';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(wx, winY + winH);
      ctx.lineTo(wx, winY + winW * 0.38);
      ctx.arc(wx + winW * 0.5, winY + winW * 0.38, winW * 0.5, Math.PI, 0, false);
      ctx.lineTo(wx + winW, winY + winH);
      ctx.closePath();
      ctx.stroke();

      /* Косой лунный луч из каждого окна вниз на ярусы с бочками */
      const rayGrad = ctx.createLinearGradient(wx + winW * 0.5, winY + winH * 0.3, wx - 40, v.y + v.h);
      rayGrad.addColorStop(0, lvl === 6 ? 'rgba(212,168,67,0.13)' : 'rgba(135,175,215,0.13)');
      rayGrad.addColorStop(1, 'rgba(135,175,215,0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(wx + 8, winY + winH);
      ctx.lineTo(wx + winW - 8, winY + winH);
      ctx.lineTo(wx + winW + 70, v.y + v.h);
      ctx.lineTo(wx - 90, v.y + v.h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    /* 4. Верхняя кран-балка / стальная ферма под потолком цеха */
    const topBeamY = v.y + (narrow ? 104 : 42);
    ctx.fillStyle = '#161B22';
    ctx.fillRect(v.x, topBeamY, v.w, 16);
    ctx.strokeStyle = '#2E3742';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(v.x, topBeamY, v.w, 16);

    /* 5. Вертикальные двутавровые стальные столбы («столбы») с цепями между колоннами бочек */
    const pillarPositions = (this.pillarXs && this.pillarXs.length)
      ? this.pillarXs
      : [v.x + v.w * 0.28, v.x + v.w * 0.50, v.x + v.w * 0.72];

    pillarPositions.forEach((px, idx) => {
      const pw = 22;
      const x0 = Math.round(px - pw * 0.5);
      /* Тело двутавровой колонны от потолочной балки до пола */
      const pGrad = ctx.createLinearGradient(x0, 0, x0 + pw, 0);
      pGrad.addColorStop(0, '#12161C');
      pGrad.addColorStop(0.28, '#28313B');
      pGrad.addColorStop(0.5, '#1D242C');
      pGrad.addColorStop(0.78, '#2C343E');
      pGrad.addColorStop(1, '#101419');
      ctx.fillStyle = pGrad;
      ctx.fillRect(x0, topBeamY + 16, pw, v.h - 42);

      /* Боковые полки двутавра и заклёпки */
      ctx.strokeStyle = 'rgba(92,108,124,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, topBeamY + 16, pw, v.h - 42);
      ctx.fillStyle = '#485462';
      for (let ry = topBeamY + 28; ry < v.y + v.h - 20; ry += 26) {
        ctx.fillRect(x0 + 3, ry, 3, 3);
        ctx.fillRect(x0 + pw - 6, ry, 3, 3);
      }

      /* Табличка номера опоры и свисающая со столба цепь */
      const tagY = v.y + Math.round(v.h * 0.34);
      ctx.fillStyle = 'rgba(212,154,69,0.85)';
      ctx.fillRect(x0 - 2, tagY, pw + 4, 14);
      ctx.fillStyle = '#0D1015';
      ctx.font = 'bold 9px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(`С-${idx + 1}`, px, tagY + 10);

      /* Свисающая металлическая цепь вдоль столба */
      ctx.strokeStyle = 'rgba(175,186,198,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(px + (idx % 2 === 0 ? 15 : -15), topBeamY + 16);
      ctx.lineTo(px + (idx % 2 === 0 ? 18 : -18), topBeamY + 135);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  /* Отрисовка мощного стального помоста / эстакады под конкретным рядом бочек (чтобы бочки стояли твёрдо!) */
  drawSteelCatwalk(ctx, tierY, tierIdx = 0) {
    const v = this.view;
    const beamY = Math.round(tierY - 4);
    const beamH = 26;

    ctx.save();
    /* 1. Задние стальные перила безопасности вдоль помоста */
    const railTopY = beamY - 48;
    ctx.strokeStyle = 'rgba(72,84,98,0.68)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(v.x, railTopY);
    ctx.lineTo(v.x + v.w, railTopY);
    ctx.moveTo(v.x, railTopY + 22);
    ctx.lineTo(v.x + v.w, railTopY + 22);
    ctx.stroke();
    for (let rx = v.x + 40; rx < v.x + v.w; rx += 92) {
      ctx.beginPath();
      ctx.moveTo(rx, railTopY);
      ctx.lineTo(rx, beamY);
      ctx.stroke();
    }

    /* 2. Верхняя стальная плита настила (на которой стоят дном все бочки и персонажи) */
    const deckGrad = ctx.createLinearGradient(0, beamY - 6, 0, beamY + beamH);
    deckGrad.addColorStop(0, '#36414E');
    deckGrad.addColorStop(0.22, '#232B34');
    deckGrad.addColorStop(0.75, '#151A20');
    deckGrad.addColorStop(1, '#0C0F14');
    ctx.fillStyle = deckGrad;
    ctx.fillRect(v.x, beamY - 5, v.w, beamH + 5);

    /* Светлая кромка стального настила прямо под доньями бочек */
    ctx.fillStyle = 'rgba(150,168,186,0.42)';
    ctx.fillRect(v.x, beamY - 5, v.w, 3);

    /* Диагональные жёлто-чёрные индустриальные полосы и заклёпки по фасаду балки */
    ctx.fillStyle = 'rgba(212,154,69,0.28)';
    for (let hx = v.x + 12; hx < v.x + v.w - 24; hx += 64) {
      ctx.fillRect(hx, beamY + 2, 24, 4);
    }
    ctx.fillStyle = '#566474';
    for (let rx = v.x + 18; rx < v.x + v.w - 10; rx += 36) {
      ctx.fillRect(rx, beamY + 11, 4, 4);
    }

    /* Диагональные стальные раскосы-подпорки под балкой яруса */
    ctx.strokeStyle = '#1E252E';
    ctx.lineWidth = 4;
    const supports = (this.pillarXs && this.pillarXs.length)
      ? this.pillarXs
      : [v.x + v.w * 0.28, v.x + v.w * 0.50, v.x + v.w * 0.72];
    supports.forEach((px) => {
      ctx.beginPath();
      ctx.moveTo(px - 11, beamY + beamH + 28);
      ctx.lineTo(px - 48, beamY + beamH);
      ctx.moveTo(px + 11, beamY + beamH + 28);
      ctx.lineTo(px + 48, beamY + beamH);
      ctx.stroke();
    });

    /* Сигнальные янтарные фонари на балке яруса */
    supports.forEach((px, i) => {
      const lampOn = 0.55 + Math.sin(this.t * 3 + i + tierIdx) * 0.25;
      ctx.fillStyle = `rgba(212,154,69,${lampOn})`;
      ctx.beginPath();
      ctx.arc(px, beamY + 11, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  /* Отрисовка овчарки Рекса, стоящей прямо МЕЖДУ бочками на стальном настиле */
  drawBetweenDogOnTier(ctx, tierIdx) {
    const d = this.betweenDog;
    if (!d || this.isOcean || d.tier !== tierIdx) return;
    const dogH = Math.round(this.bh * 0.56);
    drawShadow(ctx, d.x, d.y, dogH * 0.36);
    d.actor.draw(ctx, d.x, d.y, dogH);
    const dogFrozen = (d.skillEffect === 'freeze' && d.skillEffectT > 0) || !!(this.skills && this.skills.freeze > 0);
    if (dogFrozen) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 229, 255, 0.34)';
      ctx.strokeStyle = '#90E0EF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(d.x - dogH * 0.48, d.y - dogH * 1.04, dogH * 0.96, dogH * 1.08, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (d.barkT > 0) {
      ctx.save();
      ctx.font = 'bold 11px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#D4A843';
      ctx.fillText('ГАВ! ♪', d.x, d.y - dogH - 8);
      ctx.restore();
    }
  }

  draw(ctx) {
    const v = this.view;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    ctx.fillStyle = '#08090B'; ctx.fillRect(v.x - 400, v.y - 400, v.w + 800, v.h + 800);

    if (this.isOcean) {
      this.drawOceanScene(ctx);
      this.chainLinks.forEach((c) => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.strokeStyle = '#DCE2E8';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-6, -3, 12, 6);
        ctx.restore();
      });
      ctx.fillStyle = '#D4A843'; this.sparks.forEach((s) => ctx.fillRect(s.x, s.y, 4, 4));
      ctx.font = 'bold 24px "JetBrains Mono"'; ctx.textAlign = 'center';
      this.floats.forEach((f) => { ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y); });
      ctx.globalAlpha = 1;
      if (this.light) {
        drawToolCursor(ctx, this.light.x + 10, this.light.y + 6, S.toolLevel || 1, this.toolSwing, 1.05, this.oceanState === 'turned');
      }
      ctx.restore();
      return;
    }

    /* 1. Архитектура цеха (разные уровни завода, арочные окна с луной и облаками, двутавровые столбы с цепями) */
    this.drawFactoryArchitecture(ctx);

    /* 2. Стальные помосты под каждым ярусом бочек (чтобы бочки не висели в воздухе!) */
    const tiers = (this.tierYs && this.tierYs.length) ? this.tierYs : [Math.round(v.y + v.h * 0.86)];
    if (tiers.length === 1) {
      /* Если бочки в 1 ряд — рисуем также верхний галерейный помост для напарника */
      this.drawSteelCatwalk(ctx, Math.round(v.y + v.h * 0.55), 0);
    }
    tiers.forEach((ty, idx) => this.drawSteelCatwalk(ctx, ty, idx));

    /* 2Б. На Уровне 06 «СТАРАЯ ЦЕРКОВЬ · АЛТАРЬ» рисуем прикованного цепями к центральной стене Отца! */
    if (this.isAltarFather) {
      this.drawAltarChainedFather(ctx);
    }

    /* 3. Заводские подвесные светильники-колокола, объёмные прожекторные конусы и пылинки в лучах */
    const bh = this.bh, cw = bh * 0.62;
    const lampY = v.y + (v.w < 620 ? 114 : 52);
    this.barrels.forEach((b, bIdx) => {
      /* Объёмный луч прожектора */
      const sg = ctx.createLinearGradient(0, lampY, 0, b.y);
      sg.addColorStop(0, 'rgba(248,236,205,0.20)');
      sg.addColorStop(0.45, 'rgba(236,216,175,0.08)');
      sg.addColorStop(1, 'rgba(236,216,175,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(b.x - 14, lampY);
      ctx.lineTo(b.x + 14, lampY);
      ctx.lineTo(b.x + cw * 1.08, b.y + 4);
      ctx.lineTo(b.x - cw * 1.08, b.y + 4);
      ctx.fill();

      /* Подвесной стальной плафон-колокол под потолочной балкой */
      if ((b.tier || 0) === 0) {
        ctx.fillStyle = '#242C36';
        ctx.beginPath();
        ctx.arc(b.x, lampY, 15, Math.PI, 0, false);
        ctx.lineTo(b.x + 19, lampY + 5);
        ctx.lineTo(b.x - 19, lampY + 5);
        ctx.closePath();
        ctx.fill();
        const bulbGlow = ctx.createRadialGradient(b.x, lampY + 5, 1, b.x, lampY + 5, 24);
        bulbGlow.addColorStop(0, 'rgba(255,246,215,0.92)');
        bulbGlow.addColorStop(0.4, 'rgba(212,154,69,0.35)');
        bulbGlow.addColorStop(1, 'rgba(212,154,69,0)');
        ctx.fillStyle = bulbGlow;
        ctx.beginPath();
        ctx.arc(b.x, lampY + 5, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Медленно парящие пылинки в световом столбе над бочкой */
      for (let m = 0; m < 3; m++) {
        const mf = ((this.t * 0.11 + bIdx * 0.27 + m * 0.33) % 0.85) + 0.08;
        const mx = b.x + Math.sin(this.t * 1.4 + bIdx * 1.9 + m * 2.4) * (cw * mf * 0.65);
        const my = lampY + (b.y - lampY) * mf;
        ctx.fillStyle = `rgba(255,245,215,${(1 - mf) * 0.35})`;
        ctx.beginPath();
        ctx.arc(mx, my, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Световое пятно на стальном настиле вокруг бочки */
      ctx.fillStyle = 'rgba(244,228,195,0.10)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 2, cw, cw * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    /* Клубы лёгкого индустриального пара, поднимающиеся снизу из-под стального помоста */
    for (let st = 0; st < 5; st++) {
      const stX = v.x + ((st * 210 + Math.sin(this.t * 0.4 + st) * 35) % Math.max(200, v.w));
      const stPhase = (this.t * 0.22 + st * 0.21) % 1;
      const stY = v.y + v.h - stPhase * 130;
      const stA = Math.sin(stPhase * Math.PI) * 0.065;
      ctx.fillStyle = `rgba(185,205,222,${stA})`;
      ctx.beginPath();
      ctx.ellipse(stX, stY, 34 + stPhase * 28, 12 + stPhase * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 4. Поярусная отрисовка: напарник на верхнем ярусе -> верхний ряд бочек -> главный персонаж и собака между бочками -> нижний ряд бочек */
    const sh = sheets.barrels;
    const drawBarrelItem = (b) => {
      const sx = b.x + Math.sin(this.t * 40) * 6 * b.shake, sy = b.y;
      const hh = b.kind === 'fallen' ? bh * 0.64 : bh;
      const watchedBy = this.getWatcherOfBarrel(b);
      if (b.target && !b.trap) {
        ctx.fillStyle = 'rgba(212,154,69,0.20)';
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + 2, bh * 0.49, bh * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      /* Концентрическая звуковая волна, когда бочка вибрирует от стука изнутри или удара */
      if (b.shake > 0.08) {
        ctx.save();
        const ringR = bh * (0.42 + (1 - Math.min(1, b.shake)) * 0.35);
        ctx.strokeStyle = `rgba(212,168,67,${Math.min(0.65, b.shake * 0.55)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(sx, sy - hh * 0.48, ringR, ringR * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const drawBh = bh;
      drawShadow(ctx, b.x, b.y + 1, b.kind === 'fallen' ? drawBh * 0.64 : drawBh * 0.38, 0.64);
      const key = b.kind === 'closed' ? b.name : b.kind === 'hand' ? (b.name === 'igor' ? 'hand' : 'handNoName') : b.kind;
      const badge = b.kind === 'chained'
        ? (b.chainLoot === 'life' ? 'life' : 'energy')
        : (!b.chainRemoved && b.hasAirBubble ? 'air' : '');
      if (sh) this.drawBarrelSolid(ctx, sh, key, sx, sy, drawBh, b.kind, b.ruName, badge, b);
      else {
        drawBarrelFallback(ctx, sx, sy - hh / 2, drawBh * 0.6, hh, b.kind);
        ctx.fillStyle = '#E6E8EA';
        ctx.font = '12px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(b.ruName || b.name.toUpperCase(), sx, sy - hh / 2);
      }

      /* 🔥 Эффект «Огонь из бочки» (из бочки вырывается ревущее пламя, охрана боится и не подходит!) */
      if ((b.onFireUntil || 0) > this.t) {
        ctx.save();
        const fireRem = Math.max(0, b.onFireUntil - this.t);
        const topRimY = sy - drawBh * 0.88;
        const bwFlame = drawBh * 0.56;

        /* Огненное зарево вокруг горящей бочки */
        const fg = ctx.createRadialGradient(sx, topRimY, 6, sx, topRimY - drawBh * 0.25, drawBh * 0.85);
        fg.addColorStop(0, 'rgba(255, 209, 102, 0.55)');
        fg.addColorStop(0.45, 'rgba(255, 84, 0, 0.28)');
        fg.addColorStop(1, 'rgba(255, 84, 0, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(sx, topRimY - drawBh * 0.12, drawBh * 0.85, 0, Math.PI * 2);
        ctx.fill();

        /* Языки ревущего пламени из горловины бочки */
        for (let fIdx = 0; fIdx < 5; fIdx++) {
          const offset = (fIdx - 2) * (bwFlame * 0.2);
          const sway = Math.sin(this.t * 18 + fIdx * 1.7) * 8;
          const flameH = drawBh * (0.44 + Math.sin(this.t * 23 + fIdx * 2.1) * 0.12 + (fIdx === 2 ? 0.16 : 0));
          /* Внешний багрово-оранжевый язык пламени */
          ctx.fillStyle = fIdx % 2 === 0 ? 'rgba(255, 84, 0, 0.88)' : 'rgba(230, 57, 70, 0.85)';
          ctx.beginPath();
          ctx.moveTo(sx + offset - bwFlame * 0.18, topRimY + 6);
          ctx.quadraticCurveTo(sx + offset + sway, topRimY - flameH * 0.6, sx + offset + sway * 1.2, topRimY - flameH);
          ctx.quadraticCurveTo(sx + offset - sway * 0.6, topRimY - flameH * 0.5, sx + offset + bwFlame * 0.18, topRimY + 6);
          ctx.closePath();
          ctx.fill();

          /* Внутреннее раскалённое жёлто-белое ядро пламени */
          ctx.fillStyle = 'rgba(255, 214, 102, 0.92)';
          ctx.beginPath();
          ctx.moveTo(sx + offset - bwFlame * 0.09, topRimY + 6);
          ctx.quadraticCurveTo(sx + offset + sway * 0.6, topRimY - flameH * 0.35, sx + offset + sway * 0.8, topRimY - flameH * 0.62);
          ctx.quadraticCurveTo(sx + offset - sway * 0.4, topRimY - flameH * 0.3, sx + offset + bwFlame * 0.09, topRimY + 6);
          ctx.closePath();
          ctx.fill();
        }

        /* Взлетающие вверх огненные угли */
        for (let em = 0; em < 4; em++) {
          const emProg = (this.t * 1.9 + em * 0.25) % 1;
          const emX = sx + Math.sin(this.t * 9 + em * 2.4) * (bwFlame * 0.42);
          const emY = topRimY - emProg * drawBh * 0.78;
          ctx.fillStyle = `rgba(255, 230, 120, ${1 - emProg})`;
          ctx.beginPath();
          ctx.arc(emX, emY, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }

        /* Плашка над горящей бочкой */
        const fTxt = `🔥 ОГОНЬ (${fireRem.toFixed(1)}с) · ОХРАНА БОИТСЯ!`;
        ctx.font = 'bold 8.5px "JetBrains Mono"';
        const ftw = ctx.measureText(fTxt).width + 10;
        ctx.fillStyle = 'rgba(28, 10, 6, 0.92)';
        ctx.fillRect(sx - ftw / 2, topRimY - drawBh * 0.64 - 16, ftw, 15);
        ctx.strokeStyle = '#FF5400';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sx - ftw / 2, topRimY - drawBh * 0.64 - 16, ftw, 15);
        ctx.fillStyle = '#FFD166';
        ctx.textAlign = 'center';
        ctx.fillText(fTxt, sx, topRimY - drawBh * 0.64 - 5);
        ctx.restore();
      }

      /* 🎁 Эффект «Призовая бочка» (выбранная игроком призовая бочка или активный режим выбора призовых бочек) */
      const isChosenPrize = !!(b.isPrizeBarrel && (b.prizeUntil || 0) > this.t);
      if ((isChosenPrize || (this.skills && this.skills.jackpot > 0)) && !b.trap) {
        ctx.save();
        const pulse = 0.72 + Math.sin(this.t * 10) * 0.25;
        ctx.strokeStyle = `rgba(255, 209, 102, ${pulse})`;
        ctx.lineWidth = isChosenPrize ? 3.2 : 2.2;
        ctx.beginPath();
        ctx.ellipse(sx, sy - drawBh * 0.48, drawBh * 0.40, drawBh * 0.54, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (isChosenPrize) {
          const pTxt = '🎁✨ ПРИЗОВАЯ БОЧКА!';
          ctx.font = 'bold 8.5px "JetBrains Mono"';
          const ptw = ctx.measureText(pTxt).width + 10;
          ctx.fillStyle = 'rgba(26, 20, 6, 0.92)';
          ctx.fillRect(sx - ptw / 2, sy - drawBh - 20, ptw, 15);
          ctx.strokeStyle = '#FFD166';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(sx - ptw / 2, sy - drawBh - 20, ptw, 15);
          ctx.fillStyle = '#FFD166';
          ctx.textAlign = 'center';
          ctx.fillText(pTxt, sx, sy - drawBh - 9);
        }
        ctx.restore();
      }

      /* Визуальные эффекты активных навыков на бочках: Хрупкая сталь и Рентген */
      if (this.skills) {
        if (this.skills.fragile > 0 && !b.trap) {
          ctx.save();
          ctx.strokeStyle = 'rgba(224,122,95,0.78)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(sx - drawBh * 0.16, sy - drawBh * 0.78);
          ctx.lineTo(sx + drawBh * 0.05, sy - drawBh * 0.52);
          ctx.lineTo(sx - drawBh * 0.08, sy - drawBh * 0.28);
          ctx.stroke();
          ctx.restore();
        }
        if (this.skills.xray > 0) {
          ctx.save();
          const xColor = b.trap ? '#FF4D4D' : b.target ? '#80ED99' : b.kind === 'chained' ? '#D4A843' : 'rgba(140,155,174,0.35)';
          const xLabel = b.trap ? '☠️ ЛОВУШКА' : b.target ? '🎯 УЗНИК' : b.kind === 'chained' ? '💎 НИШТЯКИ' : '';
          ctx.strokeStyle = xColor;
          ctx.lineWidth = b.target || b.trap || b.kind === 'chained' ? 2.4 : 1;
          ctx.strokeRect(sx - drawBh * 0.34, sy - drawBh * 0.94, drawBh * 0.68, drawBh * 0.92);
          if (xLabel) {
            ctx.fillStyle = 'rgba(8,10,14,0.9)';
            ctx.fillRect(sx - 38, sy - drawBh - 18, 76, 15);
            ctx.fillStyle = xColor;
            ctx.font = 'bold 8.5px "JetBrains Mono"';
            ctx.textAlign = 'center';
            ctx.fillText(xLabel, sx, sy - drawBh - 7);
          }
          ctx.restore();
        }
      }
      if (b.lid > 0) {
        ctx.fillStyle = `rgba(7,10,14,${b.lid})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy - hh, bh * 0.33, bh * 0.4 * b.lid, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      /* Плашка над упавшей от ошибок или истощённой бочкой («меньше бочек — меньше плюшек!») */
      if (b.knockedDown) {
        ctx.save();
        const kdTxt = b.knockedReason === 'depleted' ? '🛢️ КОНЧИЛАСЬ · УПАЛА' : '💥 ОШИБКА · УПАЛА';
        ctx.font = 'bold 8.5px "JetBrains Mono"';
        const kdw = ctx.measureText(kdTxt).width + 12;
        ctx.fillStyle = 'rgba(24, 10, 12, 0.92)';
        ctx.fillRect(sx - kdw / 2, sy - hh - 16, kdw, 14);
        ctx.strokeStyle = '#FF4D4D';
        ctx.lineWidth = 1.1;
        ctx.strokeRect(sx - kdw / 2, sy - hh - 16, kdw, 14);
        ctx.fillStyle = '#FF9B94';
        ctx.textAlign = 'center';
        ctx.fillText(kdTxt, sx, sy - hh - 6);
        ctx.restore();
      } else if (!b.trap && !b.isTillBarrel && typeof b.tapsLeft === 'number' && b.tapsLeft <= 4) {
        ctx.save();
        const tlTxt = `⚠️ ОСТ. ${b.tapsLeft} УД.`;
        ctx.font = 'bold 8px "JetBrains Mono"';
        const tlw = ctx.measureText(tlTxt).width + 10;
        ctx.fillStyle = 'rgba(20, 16, 8, 0.9)';
        ctx.fillRect(sx - tlw / 2, sy + 6, tlw, 13);
        ctx.strokeStyle = '#FFD166';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - tlw / 2, sy + 6, tlw, 13);
        ctx.fillStyle = '#FFD166';
        ctx.textAlign = 'center';
        ctx.fillText(tlTxt, sx, sy + 15);
        ctx.restore();
      }
      if (b.kind !== 'closed' && !b.trap && !b.knockedDown) {
        const left = Math.max(0, b.specialUntil - this.t) / (this.cfg.window + 1.5);
        ctx.fillStyle = '#4A7A8C';
        ctx.fillRect(sx - bh * 0.27, sy + 12, bh * 0.54 * Math.min(1, left), 4);
      }

      /* Если на эту бочку сейчас светит фонарик персонажа — яркий предупреждающий ореол «ЛУЧ! НЕ БИТЬ!» */
      if (watchedBy) {
        ctx.save();
        const pulse = 0.55 + Math.sin(this.t * 12) * 0.25;
        ctx.strokeStyle = `rgba(212,70,56,${pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(sx, sy - hh * 0.48, bh * 0.38, hh * 0.52, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(158,42,43,0.92)';
        ctx.fillRect(sx - 56, sy - hh - 24, 112, 18);
        ctx.strokeStyle = '#D4A843';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sx - 56, sy - hh - 24, 112, 18);
        ctx.fillStyle = '#ECE4D2';
        ctx.font = 'bold 9px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText('🔦 ЛУЧ! НЕ БИТЬ', sx, sy - hh - 11);
        ctx.restore();
      }
    };

    if (tiers.length >= 2) {
      for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
        this.barrels.filter((b) => (b.tier || 0) === tIdx).forEach(drawBarrelItem);
        this.drawBetweenDogOnTier(ctx, tIdx);
        if (tIdx === 0) this.drawSingleWalker(ctx, this.secondWalker);
        if (tIdx === tiers.length - 1) this.drawSingleWalker(ctx, this.walker);
      }
    } else {
      this.barrels.forEach(drawBarrelItem);
      this.drawBetweenDogOnTier(ctx, 0);
      this.drawSingleWalker(ctx, this.secondWalker);
      this.drawSingleWalker(ctx, this.walker);
    }

    /* Разлетающиеся кованые 3D-звенья сбитых цепей */
    this.chainLinks.forEach((c, idx) => {
      this.drawSingleChainLink3D(ctx, c.x, c.y, c.rot, 14, 9, idx % 2 === 1, 0.35);
    });

    /* darkness with the flashlight beam following the pointer */
    const lx = this.light ? this.light.x : v.x + v.w / 2, ly = this.light ? this.light.y : v.y + v.h * 0.6;
    const dg = ctx.createRadialGradient(lx, ly, 45, lx, ly, 390);
    dg.addColorStop(0, 'rgba(8,9,11,0)'); dg.addColorStop(0.55, 'rgba(8,9,11,0.32)'); dg.addColorStop(1, 'rgba(8,9,11,0.65)');
    ctx.fillStyle = dg; ctx.fillRect(v.x - 400, v.y - 400, v.w + 800, v.h + 800);
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 155);
    lg.addColorStop(0, 'rgba(248,236,205,0.13)'); lg.addColorStop(1, 'rgba(236,228,210,0)');
    ctx.fillStyle = lg; ctx.fillRect(lx - 155, ly - 155, 310, 310);

    /* Если луч персонажа преследует курсор — красное пятно прожектора прямо на курсоре и запрет удара */
    if (this.huntCursorT > 0 && this.active) {
      ctx.fillStyle = `rgba(158,42,43,${0.12 + Math.sin(this.t * 14) * 0.05})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.save();
      ctx.strokeStyle = '#D4423E';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(lx, ly, 42 + Math.sin(this.t * 16) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const warnTxt = t('beamHuntWarn', { s: this.huntCursorT.toFixed(1) });
      ctx.font = 'bold 11px "JetBrains Mono"';
      const tw = ctx.measureText(warnTxt).width + 20;
      const wx = Math.max(v.x + tw / 2 + 8, Math.min(v.x + v.w - tw / 2 - 8, lx));
      const wy = Math.max(v.y + 110, ly - 54);
      ctx.fillStyle = 'rgba(158,42,43,0.94)';
      ctx.fillRect(wx - tw / 2, wy - 20, tw, 22);
      ctx.strokeStyle = '#D4A843';
      ctx.strokeRect(wx - tw / 2, wy - 20, tw, 22);
      ctx.fillStyle = '#ECE4D2';
      ctx.textAlign = 'center';
      ctx.fillText(warnTxt, wx, wy - 5);
      ctx.restore();
    } else if (this.walker.mode === 'watch' && this.active) {
      ctx.fillStyle = `rgba(158,42,43,${0.05 + Math.sin(this.t * 8) * 0.03})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }

    /* Яркие летящие искры металла с огненным шлейфом */
    ctx.save();
    ctx.lineCap = 'round';
    this.sparks.forEach((s) => {
      ctx.strokeStyle = '#F5B041';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.032, s.y - s.vy * 0.032);
      ctx.stroke();
      ctx.fillStyle = '#FFF9E6';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    /* Всплывающие индикаторы очков, Энергии, Воздуха и Жизней с чёткой контурной обводкой */
    ctx.save();
    ctx.font = v.w < 620 ? 'bold 17px "JetBrains Mono"' : 'bold 25px "JetBrains Mono"';
    ctx.textAlign = 'center';
    this.floats.forEach((f) => {
      ctx.globalAlpha = Math.min(1, f.life * 2.2);
      ctx.strokeStyle = 'rgba(6,8,12,0.92)';
      ctx.lineWidth = v.w < 620 ? 3 : 4;
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    });
    ctx.restore();
    if (this.idle > 3 && this.levelPoints > 0 && this.active) { ctx.fillStyle = '#9E2A2B'; ctx.font = '14px "JetBrains Mono"'; ctx.fillText('▼ ' + Math.floor(this.levelPoints), v.x + v.w * 0.78, v.y + 100); }
    if (Date.now() < (S.turboUntil || 0) && this.active) { ctx.fillStyle = '#D4A843'; ctx.font = '18px "JetBrains Mono"'; ctx.fillText('TURBO ×5', v.x + v.w * 0.78, v.y + 126); }
    else if (this.combo > 1 && this.active) { ctx.fillStyle = '#D4A843'; ctx.font = '18px "JetBrains Mono"'; ctx.fillText('COMBO ×3', v.x + v.w * 0.78, v.y + 126); }
    if (this.walker.mode === 'watch' && this.active) { ctx.fillStyle = '#9E2A2B'; ctx.font = '14px "JetBrains Mono"'; ctx.fillText('▼ O₂', v.x + v.w * 0.78, v.y + 152); }

    /* Мистическое затмение свечей в церковном подвале на 5-м уровне (Святой отец) */
    if (this.cfg && this.cfg.blackout && this.active && !(this.skills && this.skills.xray > 0)) {
      const eclipse = Math.max(0, Math.sin(this.t * 0.95) - 0.15) * 0.42;
      if (eclipse > 0.01) {
        ctx.fillStyle = `rgba(4,5,9,${eclipse.toFixed(3)})`;
        ctx.fillRect(v.x, v.y, v.w, v.h);
      }
    }

    /* Плашка игровой механики уровня показывается только первые 4.2 сек старта, чтобы не загораживать экран */
    if (this.cfg && this.cfg.mechanicTitle && this.t < 4.2) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (4.2 - this.t) * 1.2);
      const narrow = v.w < 620;
      const mTitle = this.cfg.mechanicTitle;
      ctx.font = narrow ? 'bold 8.5px "JetBrains Mono"' : 'bold 9.5px "JetBrains Mono"';
      const mw = Math.min(v.w - 20, ctx.measureText(mTitle).width + 20);
      const mx = v.x + v.w * 0.5 - mw / 2;
      const my = v.y + v.h - 24;
      ctx.fillStyle = 'rgba(9,13,18,0.88)';
      ctx.fillRect(mx, my, mw, 18);
      ctx.strokeStyle = '#D4A843';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(mx, my, mw, 18);
      ctx.fillStyle = '#ECE4D2';
      ctx.textAlign = 'center';
      ctx.fillText(mTitle, v.x + v.w * 0.5, my + 12.5, mw - 12);
      ctx.restore();
    }

    /* Громкоговоритель цеха (во время эфира аудио-пранка) — компактно снизу, не перекрывает персонажей */
    if (this.loudspeakerBannerT > 0) {
      ctx.save();
      const spX = v.x + v.w * 0.5;
      const spY = v.y + v.h - 26;
      const boxW = Math.min(v.w - 24, 360);
      ctx.fillStyle = 'rgba(12,15,20,0.92)';
      ctx.strokeStyle = '#F4A261';
      ctx.lineWidth = 1.4;
      ctx.fillRect(spX - boxW / 2, spY, boxW, 20);
      ctx.strokeRect(spX - boxW / 2, spY, boxW, 20);
      ctx.fillStyle = '#F4A261';
      ctx.font = v.w < 620 ? 'bold 8px "JetBrains Mono"' : 'bold 9.5px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(`📢 ГРОМКОГОВОРИТЕЛЬ ЦЕХА: ${this.loudspeakerLabel}`, spX, spY + 13.5, boxW - 16);
      ctx.restore();
    }

    /* 📢🔊 Отрисовка установленной игроком ТОЧКИ ГОЛОСОВОГО ПРАНКА (куда ткнул — там орёт пранк и ВСЕ бегут туда!) */
    if (this.prankLure && this.prankLure.timer > 0) {
      ctx.save();
      const px = this.prankLure.x;
      const py = this.prankLure.y;
      /* 3 расходящихся акустических кольца пранка */
      for (let wIdx = 0; wIdx < 3; wIdx++) {
        const phase = ((this.t * 1.6 + wIdx * 0.33) % 1);
        const r = 16 + phase * 68;
        ctx.strokeStyle = `rgba(244, 162, 97, ${(1 - phase) * 0.85})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      /* Корпус колонки/рации пранка в точке клика */
      ctx.fillStyle = '#181E26';
      ctx.strokeStyle = '#F4A261';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(px, py, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = '16px "JetBrains Mono", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📢', px, py);
      ctx.textBaseline = 'alphabetic';

      const pLabel = `📻 ЗВУК ПРАНКА (${this.prankLure.timer.toFixed(1)}с) · ВСЕ БЕГУТ СЮДА!`;
      ctx.font = 'bold 9.5px "JetBrains Mono"';
      const ptw = ctx.measureText(pLabel).width + 14;
      const pbx = Math.max(v.x + ptw / 2 + 8, Math.min(v.x + v.w - ptw / 2 - 8, px));
      ctx.fillStyle = 'rgba(12, 15, 20, 0.94)';
      ctx.fillRect(pbx - ptw / 2, py - 38, ptw, 17);
      ctx.strokeStyle = '#F4A261';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(pbx - ptw / 2, py - 38, ptw, 17);
      ctx.fillStyle = '#FFD166';
      ctx.fillText(pLabel, pbx, py - 26);
      ctx.restore();
    }

    /* ❄️👑 Мифический экранный эффект «Абсолютная Заморозка ★» — морозная кромка по краям цеха и кружащиеся снежинки */
    if (this.skills && this.skills.freeze > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(0, 229, 255, ${0.42 + Math.sin(this.t * 5) * 0.14})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(v.x + 3, v.y + 3, v.w - 6, v.h - 6);
      ctx.fillStyle = 'rgba(224, 251, 252, 0.78)';
      ctx.font = '13px "JetBrains Mono"';
      ctx.textAlign = 'center';
      for (let sf = 0; sf < 12; sf++) {
        const sfx = v.x + ((sf * 97 + Math.sin(this.t * 1.5 + sf) * 28) % Math.max(120, v.w));
        const sfy = v.y + ((this.t * 48 + sf * 67) % Math.max(120, v.h));
        ctx.fillText(sf % 2 === 0 ? '❄️' : '✦', sfx, sfy);
      }
      ctx.restore();
    }

    /* Отрисовка лучей и ударных волн при применении навыка из руки на персонажа или бочку */
    if (this.skillBeams && this.skillBeams.length > 0) {
      ctx.save();
      this.skillBeams.forEach((bm) => {
        const a = Math.max(0, Math.min(1, bm.life / (bm.maxLife || 0.55)));
        ctx.globalAlpha = a;
        ctx.strokeStyle = bm.color || '#64DFDF';
        ctx.lineWidth = 5 * a + 1.5;
        ctx.beginPath();
        ctx.moveTo(bm.x1, bm.y1);
        ctx.lineTo(bm.x2, bm.y2);
        ctx.stroke();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2 * a;
        ctx.beginPath();
        ctx.moveTo(bm.x1, bm.y1);
        ctx.lineTo(bm.x2, bm.y2);
        ctx.stroke();

        /* Расходящаяся ударная волна в точке попадания навыка */
        const ringR = 14 + (1 - a) * 58;
        ctx.strokeStyle = bm.color || '#64DFDF';
        ctx.lineWidth = 2.5 * a;
        ctx.beginPath();
        ctx.arc(bm.x2, bm.y2, ringR, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    if (this.isAltarFather && this.fatherChained && this.fatherChained.cutscene) {
      this.drawAltarHeavenCutscene(ctx);
      ctx.restore();
      return;
    }

    /* Отрисовка текущего курсора В РУКЕ:
       если выбран/активен НАВЫК — вместо молотка рисуется гаджет навыка с прицелом или таймером,
       а когда время навыка кончается — снова рисуется молоток/инструмент (Ур. 1–10)! */
    if (this.light) {
      if (this.handSkill) {
        drawSkillCursor(ctx, this.light.x + 10, this.light.y + 6, this.handSkill, this.toolSwing, this.t);
      } else {
        drawToolCursor(ctx, this.light.x + 10, this.light.y + 6, S.toolLevel || 1, this.toolSwing, 1.05, this.huntCursorT > 0);
      }
    }
    ctx.restore();
  }
}
