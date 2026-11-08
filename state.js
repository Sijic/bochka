import {
  HOUR,
  LIFE_TIME,
  CARDS as SHARED_CARDS,
  dayKey,
  energyLimit as calcEnergyLimit,
  tapPower as calcTapPower,
  boostCost as calcBoostCost,
  dailyReward as calcDailyReward,
  comboCards,
  cipherOf,
} from './shared/economy.js';

const KEY = 'bochka_v4';
const H = HOUR;
export const LIFE_REGEN_MS = LIFE_TIME;
export const OFFLINE_CAP_MS = 3 * H;

export const CARDS = [
  {
    id: 'camera', idx: 0, skillKey: 'fragile', icon: '🔨', rarity: 'РЕДКИЙ', accent: '#E07A5F',
    ru: 'Хрупкая сталь', kz: 'Морт болат', en: 'Brittle Steel',
    desc: 'Делает бочки и цепи хрупкими: любая цепь сбивается с 1 удара, очки ×2!',
    base: 200, income: 60, energyCost: 220, baseDur: 7,
  },
  {
    id: 'light', idx: 1, skillKey: 'shrink', icon: '🛢️', rarity: 'ЭПИЧЕСКИЙ', accent: '#64DFDF',
    ru: 'Одеть бочку (Только ноги)', kz: 'Бөшке кигізу', en: 'Put Barrel On Guard',
    desc: 'Надень бочку прямо на охранника: он ходит вслепую внутри бочки, снизу торчат только ноги, очки ×3!',
    base: 450, income: 140, energyCost: 180, baseDur: 8,
  },
  {
    id: 'props', idx: 2, skillKey: 'freeze', icon: '❄️', rarity: 'МИФИЧЕСКИЙ ★', accent: '#00E5FF',
    ru: 'Абсолютная Заморозка ★', kz: 'Абсолютті Қатыру ★', en: 'Absolute Freeze ★',
    desc: 'САМЫЙ МОЩНЫЙ НАВЫК: заковывает охрану в ледяные глыбы с шипами, останавливает таймер, цепи с 1 удара и очки ×3!',
    base: 1100, income: 450, energyCost: 240, baseDur: 9,
  },
  {
    id: 'stunt', idx: 3, skillKey: 'stealth', icon: '👻', rarity: 'ЭПИЧЕСКИЙ', accent: '#9D4EDD',
    ru: 'Невидимка (Фонарь гаснет)', kz: 'Көрінбейтін', en: 'Flashlight Blackout',
    desc: 'Фонарик охраны коротит, мигает и полностью отрубается — персонаж вообще не видит тебя!',
    base: 2600, income: 550, energyCost: 220, baseDur: 8,
  },
  {
    id: 'till', idx: 4, skillKey: 'distract', icon: '📢', rarity: 'ЭПИЧЕСКИЙ', accent: '#F4A261',
    ru: 'Точка пранка (Все бегут туда)', kz: 'Пранк нүктесі', en: 'Voice Prank Lure',
    desc: 'Куда ткнёшь на экране — там заиграет голосовой пранк, и ВСЕ персонажи сразу побегут в эту точку!',
    base: 6500, income: 1400, energyCost: 200, baseDur: 8,
  },
  {
    id: 'edit', idx: 5, skillKey: 'overcharge', icon: '🔥', rarity: 'ЛЕГЕНДАРНЫЙ', accent: '#FF5400',
    ru: 'Огонь из бочки (Страх охраны)', kz: 'Бөшкеден от', en: 'Fire Barrel',
    desc: 'Из выбранной бочки бьёт столб пламени! Персонажи панически боятся огня, не подходят к ней и дают ×4 очков!',
    base: 15000, income: 3000, energyCost: 240, baseDur: 9,
  },
  {
    id: 'release', idx: 6, skillKey: 'jackpot', icon: '🎁', rarity: 'ЛЕГЕНДАРНЫЙ', accent: '#D4A843',
    ru: 'Выбрать призовые бочки', kz: 'Жүлделі бөшкелер', en: 'Pick Prize Barrels',
    desc: 'Выбирай любые бочки кликом — каждая выбранная бочка становится золотой и сразу выдаёт крупный приз!',
    base: 35000, income: 6800, energyCost: 300, baseDur: 8,
  },
  {
    id: 'xray', idx: 7, skillKey: 'xray', icon: '👁️', rarity: 'РЕДКИЙ', accent: '#80ED99',
    ru: 'Рентген-эхолот бочек', kz: 'Рентген-эхолот', en: 'Barrel X-Ray',
    desc: 'Просвечивает сталь: зелёным виден узник, золотым — ништяки, красным — ловушка!',
    base: 900, income: 210, energyCost: 160, baseDur: 10,
  },
  {
    id: 'oxygen', idx: 8, skillKey: 'oxygen', icon: '💨', rarity: 'ОБЫЧНЫЙ', accent: '#56CFE1',
    ru: 'Кислородный щит O₂', kz: 'Оттегі қалқаны', en: 'Oxygen Shield',
    desc: 'Мгновенно даёт 100% воздуха O₂ и защищает от удушья и потери воздуха!',
    base: 350, income: 95, energyCost: 150, baseDur: 9,
  },
  {
    id: 'magnet', idx: 9, skillKey: 'magnet', icon: '🧲', rarity: 'ЛЕГЕНДАРНЫЙ', accent: '#F72585',
    ru: 'Магнит ништяков и цепей', kz: 'Сыйлық магниті', en: 'Loot Magnet',
    desc: 'Мгновенно срывает цепь в цехе и притягивает все ништяки, телефон ×3 и воздух!',
    base: 22000, income: 4200, energyCost: 300, baseDur: 6,
  },
];

export const LEAGUES = [
  { ru: 'Деревянная бочка', kz: 'Ағаш бөшке', en: 'Wooden Barrel', min: 0 },
  { ru: 'Ржавая бочка', kz: 'Тот басқан бөшке', en: 'Rusty Barrel', min: 5000 },
  { ru: 'Стальная бочка', kz: 'Болат бөшке', en: 'Steel Barrel', min: 50000 },
  { ru: 'Кровавая бочка', kz: 'Қанды бөшке', en: 'Blood Barrel', min: 250000 },
  { ru: 'Золотая бочка', kz: 'Алтын бөшке', en: 'Golden Barrel', min: 1000000 },
  { ru: 'Алмазная бочка', kz: 'Алмас бөшке', en: 'Diamond Barrel', min: 5000000 },
  { ru: 'Достучаться до небес', kz: 'Аспанға қол созу', en: "Knockin' on Heaven's Door", min: 20000000 },
];

/* 10 уровней курсора-инструмента для ударов по бочкам и разбивания натуральных цепей:
   Рукой (Ур.1) цепь пробить НЕЛЬЗЯ (chainHits: 0);
   Молотком (Ур.2) — 30 ударов; Монтировкой (Ур.3) — 8 ударов; Лопатой (Ур.4) — 6;
   Газовым ключом (Ур.5) — 5; Топором (Ур.6) — 4; Кувалдой (Ур.7) — 3;
   Киркой (Ур.8) — 2; Болторезом (Ур.9) и Отбойным молотком (Ур.10) — с 1 удара! */
export const TOOLS = [
  { lvl: 1,  id: 'hand',       icon: '✊', mult: 1.0,  cost: 0,     breaksChains: false, chainHits: 0,  ru: 'Рука (Кулак)',     kz: 'Қол (Жұдырық)',  en: 'Bare Hand' },
  { lvl: 2,  id: 'hammer',     icon: '🔨', mult: 1.5,  cost: 120,   breaksChains: true,  chainHits: 30, ru: 'Молоток',          kz: 'Балға',          en: 'Hammer' },
  { lvl: 3,  id: 'crowbar',    icon: '🛠️', mult: 2.2,  cost: 300,   breaksChains: true,  chainHits: 8,  ru: 'Монтировка',       kz: 'Монтировка',     en: 'Crowbar' },
  { lvl: 4,  id: 'shovel',     icon: '⛏',  mult: 3.0,  cost: 750,   breaksChains: true,  chainHits: 6,  ru: 'Лопата',           kz: 'Күрек',          en: 'Shovel' },
  { lvl: 5,  id: 'wrench',     icon: '🔧', mult: 4.0,  cost: 1800,  breaksChains: true,  chainHits: 5,  ru: 'Газовый ключ',     kz: 'Газ кілті',      en: 'Pipe Wrench' },
  { lvl: 6,  id: 'axe',        icon: '🪓', mult: 5.2,  cost: 4200,  breaksChains: true,  chainHits: 4,  ru: 'Пожарный топор',   kz: 'Өрт балтасы',    en: 'Fire Axe' },
  { lvl: 7,  id: 'sledge',     icon: '⚒️', mult: 6.8,  cost: 9500,  breaksChains: true,  chainHits: 3,  ru: 'Кувалда',          kz: 'Дәу балға',      en: 'Sledgehammer' },
  { lvl: 8,  id: 'pickaxe',    icon: '⛏️', mult: 8.5,  cost: 20000, breaksChains: true,  chainHits: 2,  ru: 'Кирка',            kz: 'Қайла',          en: 'Pickaxe' },
  { lvl: 9,  id: 'cutter',     icon: '✂️', mult: 11.0, cost: 45000, breaksChains: true,  chainHits: 1,  ru: 'Болторез',         kz: 'Болторез',       en: 'Bolt Cutter' },
  { lvl: 10, id: 'jackhammer', icon: '💥', mult: 15.0, cost: 95000, breaksChains: true,  chainHits: 1,  ru: 'Отбойный молоток', kz: 'Отбойный балға', en: 'Jackhammer' },
];

let actionHook = null;
export function setActionHook(fn) { actionHook = fn; }
export function emitAction(action) {
  if (actionHook) {
    try { actionHook({ ...action, at: Date.now() }); } catch (e) { /* ignore */ }
  }
}

function fresh() {
  return {
    balance: 0, total: 0, energy: 1000, energyMax: 1000, multitap: 1,
    multi: 0, energyLevel: 0, toolLevel: 1, maxToolLevel: 3,
    turboUses: 0, turboUntil: 0, refillUsed: false, boostDay: '',
    lives: 3, livesMax: 3, lastLifeTs: Date.now(), air: 100,
    level: 1, maxLevel: 1, cleared: 0, nightUnlocked: false, nightRuns: 0, bestNight: 0,
    cards: {}, barrelCardPtsLvl: 0, trailerSharedCount: 0, godMode: false,
    lastClaim: Date.now(), pending: 0,
    streak: 0, lastDaily: '', poster30: false,
    combo: { date: '', ids: [], done: false, hit: [] },
    cipher: null,
    refs: [], refCode: Math.random().toString(36).slice(2, 8).toUpperCase(), halfLives: 0,
    sharedChannels: [], refTapSent: false,
    survey: null, taps: 0, screenDay: '', screenBonuses: 0, createdAt: Date.now(),
  };
}

let savedRaw = {};
try { savedRaw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { savedRaw = {}; }
export const S = Object.assign(fresh(), savedRaw);
if (!S.toolLevel || S.toolLevel < 1 || S.toolLevel > 10) S.toolLevel = 1;
if (!S.maxToolLevel || S.maxToolLevel < S.toolLevel) S.maxToolLevel = Math.max(3, S.toolLevel);
S.energyMax = calcEnergyLimit(S);
S.multitap = calcTapPower(S);

export function currentTool() {
  const idx = Math.max(0, Math.min(TOOLS.length - 1, (S.toolLevel || 1) - 1));
  return TOOLS[idx];
}

export function setToolLevel(lvl) {
  const next = ((lvl - 1 + TOOLS.length) % TOOLS.length) + 1;
  S.toolLevel = next;
  S.maxToolLevel = Math.max(S.maxToolLevel || 1, next);
  save();
  return currentTool();
}

export function upgradeTool() {
  const nextLvl = Math.min(10, (S.toolLevel || 1) + 1);
  if (nextLvl === S.toolLevel && S.toolLevel >= 10) return { ok: false, reason: 'max' };
  const nextTool = TOOLS[nextLvl - 1];
  const alreadyUnlocked = nextLvl <= (S.maxToolLevel || 1);
  if (!alreadyUnlocked && S.balance < nextTool.cost) {
    return { ok: false, reason: 'poor', cost: nextTool.cost };
  }
  if (!alreadyUnlocked) {
    S.balance -= nextTool.cost;
  }
  S.toolLevel = nextLvl;
  S.maxToolLevel = Math.max(S.maxToolLevel || 1, nextLvl);
  save();
  return { ok: true, tool: currentTool() };
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignore */ }
}

export const MAX_BARREL_LEVEL = 200;
export const MAX_BARREL_PTS_LEVEL = 7;

export function barrelCardLevel() {
  const ptsLvl = Math.min(MAX_BARREL_PTS_LEVEL - 1, S.barrelCardPtsLvl || 0);
  const friendsLvl = S.refs?.length || 0;
  return Math.min(MAX_BARREL_LEVEL, 1 + ptsLvl + friendsLvl);
}

export function canUpgradeBarrelWithPoints() {
  const ptsLvl = S.barrelCardPtsLvl || 0;
  return ptsLvl < (MAX_BARREL_PTS_LEVEL - 1) && barrelCardLevel() < MAX_BARREL_PTS_LEVEL;
}

export function barrelCardUpgradeCost() {
  const ptsLvl = Math.min(MAX_BARREL_PTS_LEVEL - 1, S.barrelCardPtsLvl || 0);
  return Math.floor(250000 * Math.pow(2.2, ptsLvl));
}

export function playerSpeedRating() {
  const lvl = barrelCardLevel();
  const pph = profitPerHour();
  const clearedLvls = Math.max(1, (S.maxLevel || 1) - 1);
  const nightBonus = (S.nightRuns || 0) * 650 + Math.floor((S.bestNight || 0) * 0.4);
  const tapPower = calcTapPower(S) * 180;
  const speed = Math.round(pph * 0.35 + clearedLvls * 1250 + lvl * 950 + tapPower + nightBonus + Math.sqrt(Math.max(0, S.total || 0)) * 8);
  return speed;
}

export function barrelPremiereChances() {
  const friendsCount = S.refs?.length || 0;
  const ptsLvl = Math.min(MAX_BARREL_PTS_LEVEL - 1, S.barrelCardPtsLvl || 0);
  const lvl = barrelCardLevel();
  const tickets = lvl * 3 + friendsCount * 5;
  const mult = +(1 + (lvl - 1) * 0.25).toFixed(2);
  const incomePerHour = lvl * 2500;
  const speedRating = playerSpeedRating();
  const canBuyPts = canUpgradeBarrelWithPoints();
  return {
    lvl,
    maxLvl: MAX_BARREL_LEVEL,
    maxPtsLvl: MAX_BARREL_PTS_LEVEL,
    canBuyPts,
    friendsCount,
    ptsLvl,
    tickets,
    mult,
    incomePerHour,
    speedRating,
  };
}

export function buyBarrelCardWithPoints() {
  const curLvl = barrelCardLevel();
  if (!canUpgradeBarrelWithPoints()) {
    return {
      ok: false,
      reason: 'friends_only_above_7',
      level: curLvl,
      lvl: curLvl,
      maxPtsLvl: MAX_BARREL_PTS_LEVEL,
      maxLvl: MAX_BARREL_LEVEL,
    };
  }
  const cost = barrelCardUpgradeCost();
  if (S.balance < cost) {
    return { ok: false, reason: 'poor', cost };
  }
  S.balance -= cost;
  S.barrelCardPtsLvl = Math.min(MAX_BARREL_PTS_LEVEL - 1, (S.barrelCardPtsLvl || 0) + 1);
  const newLvl = barrelCardLevel();
  const ch = barrelPremiereChances();
  S.livesMax = Math.max(S.livesMax || 3, Math.min(5, 3 + Math.floor(newLvl / 3)));
  save();
  return { ok: true, level: newLvl, lvl: newLvl, chances: ch.tickets, mult: ch.mult, cost };
}

export function toggleGodMode(forceState) {
  S.godMode = typeof forceState === 'boolean' ? forceState : !S.godMode;
  if (S.godMode) {
    S.livesMax = 5;
    S.lives = 5;
    S.halfLives = 0;
    S.energyMax = Math.max(S.energyMax || 1000, 9999);
    S.energy = S.energyMax;
    S.balance = Math.max(S.balance || 0, 25000000);
    S.total = Math.max(S.total || 0, 25000000);
    S.maxLevel = Math.max(S.maxLevel || 1, 8);
    S.nightUnlocked = true;
    S.maxToolLevel = 10;
    S.turboUses = 0;
    S.refillUsed = false;
  }
  save();
  return S.godMode;
}

export function profitPerHour() {
  const barrelIncome = barrelCardLevel() * 2500;
  return barrelIncome + CARDS.reduce((sum, c) => sum + (S.cards[c.id] || 0) * c.income, 0) + Math.floor((S.refs?.length || 0) * 500);
}

export function cardCost(c) {
  const lvl = S.cards[c.id] || 0;
  return Math.floor(c.base * Math.pow(1.6, lvl));
}

export function skillLevel(c) {
  return Math.max(1, (S.cards[c.id] || 0) + 1);
}

export function skillDuration(c) {
  const lvl = S.cards[c.id] || 0;
  return +(c.baseDur + lvl * 0.8).toFixed(1);
}

export function skillEnergyCost(c) {
  const lvl = S.cards[c.id] || 0;
  return Math.max(70, Math.round((c.energyCost || 200) * Math.pow(0.965, Math.min(25, lvl))));
}

export function getEquippedSkills() {
  if (!Array.isArray(S.equippedSkills) || S.equippedSkills.length === 0) {
    S.equippedSkills = ['props', 'light', 'stunt', 'till', 'edit', 'release'];
  } else {
    S.equippedSkills = S.equippedSkills.filter((id) => CARDS.some((c) => c.id === id));
    if (!S.equippedSkills.includes('edit')) {
      if (S.equippedSkills.includes('camera')) {
        S.equippedSkills[S.equippedSkills.indexOf('camera')] = 'edit';
      } else if (S.equippedSkills.length < 6) {
        S.equippedSkills.push('edit');
      }
    }
  }
  return S.equippedSkills;
}

export function toggleEquipSkill(cardId) {
  const eq = getEquippedSkills();
  const idx = eq.indexOf(cardId);
  if (idx >= 0) {
    if (eq.length > 1) eq.splice(idx, 1);
  } else {
    eq.push(cardId);
  }
  save();
  return eq.includes(cardId);
}

export function spendSkillEnergy(cardId) {
  const c = CARDS.find((x) => x.id === cardId || x.skillKey === cardId);
  if (!c) return { ok: false, reason: 'not_found' };
  const cost = skillEnergyCost(c);
  if (S.energy < cost) {
    return { ok: false, reason: 'no_energy', cost, energy: Math.floor(S.energy) };
  }
  S.energy = Math.max(0, S.energy - cost);
  save();
  return {
    ok: true,
    card: c,
    skillKey: c.skillKey,
    cost,
    dur: skillDuration(c),
    lvl: skillLevel(c),
  };
}

export function addPoints(n) {
  if (!Number.isFinite(n) || n === 0) return;
  S.balance = Math.max(0, S.balance + n);
  if (n > 0) S.total += n;
}

export function league() {
  let L = LEAGUES[0];
  for (const l of LEAGUES) if (S.total >= l.min) L = l;
  return L;
}

export function tick() {
  const now = Date.now();
  const today = dayKey(now);
  if (S.boostDay !== today) {
    S.boostDay = today;
    S.turboUses = 0;
    S.refillUsed = false;
  }
  S.energyMax = calcEnergyLimit(S);
  S.multitap = calcTapPower(S) * (now < S.turboUntil ? 5 : 1);
  /* energy: +1/sec (~0.2s tick interval -> +0.75) */
  S.energy = Math.min(S.energyMax, S.energy + 3 * 0.25);
  /* passive income accrual, capped at 3h of offline accumulation */
  const dt = Math.max(0, Math.min(now - S.lastClaim, OFFLINE_CAP_MS));
  S.pending = Math.floor(profitPerHour() * (dt / H));
  /* lives regen: one per 12h */
  if (S.lives < S.livesMax) {
    if (now - S.lastLifeTs >= LIFE_REGEN_MS) {
      const gained = Math.floor((now - S.lastLifeTs) / LIFE_REGEN_MS);
      S.lives = Math.min(S.livesMax, S.lives + gained);
      S.lastLifeTs += gained * LIFE_REGEN_MS;
    }
  } else {
    S.lastLifeTs = now;
  }
}

export function regenLeft() {
  return S.lives >= S.livesMax ? 0 : Math.max(0, LIFE_REGEN_MS - (Date.now() - S.lastLifeTs));
}

export function claim() {
  const p = Math.floor(S.pending || 0);
  if (p <= 0) return 0;
  S.balance += p;
  S.total += p;
  S.pending = 0;
  S.lastClaim = Date.now();
  save();
  emitAction({ type: 'claimIncome' });
  return p;
}

export function loseLife() {
  if (S.godMode) {
    S.lives = S.livesMax;
    return;
  }
  if (S.lives > 0) {
    if (S.lives === S.livesMax) S.lastLifeTs = Date.now();
    S.lives--;
    if (S.lives <= 0) {
      S.sharedChannels = [];
    }
  }
  save();
}

export function canClaimDaily() {
  const today = new Date().toDateString();
  const isoToday = dayKey(Date.now());
  return S.lastDaily !== today && S.lastDaily !== isoToday;
}

export function dailyReward() {
  const now = Date.now();
  const today = new Date(now).toDateString();
  const isoToday = dayKey(now);
  if (S.lastDaily === today || S.lastDaily === isoToday) return null;
  const yesterday = new Date(now - 86400000).toDateString();
  const isoYesterday = dayKey(now - 86400000);
  const cont = S.lastDaily === yesterday || S.lastDaily === isoYesterday;
  S.streak = cont ? (S.streak >= 30 ? 1 : S.streak + 1) : 1;
  S.lastDaily = today;
  const reward = calcDailyReward(S.streak);
  if (S.streak === 30) S.poster30 = true;
  addPoints(reward);
  save();
  emitAction({ type: 'daily' });
  return { reward, streak: S.streak };
}

export function comboToday() {
  const now = Date.now();
  const today = dayKey(now);
  if (!S.combo || S.combo.date !== today) {
    const idxs = comboCards(now);
    const ids = idxs.map((i) => CARDS[i]?.id).filter(Boolean);
    S.combo = { date: today, ids, done: false, hit: [] };
  }
  if (!Array.isArray(S.combo.hit)) S.combo.hit = [];
  return S.combo;
}

export function buyCard(c) {
  const lvl = S.cards[c.id] || 0;
  if (lvl >= 50) return false;
  const cost = cardCost(c);
  if (S.balance < cost) return false;
  S.balance -= cost;
  S.cards[c.id] = lvl + 1;
  const combo = comboToday();
  let comboJustDone = false;
  if (!combo.done && combo.ids.includes(c.id) && !combo.hit.includes(c.id)) {
    combo.hit.push(c.id);
    if (combo.hit.length >= combo.ids.length) {
      combo.done = true;
      comboJustDone = true;
      addPoints(1000000);
    }
  }
  save();
  emitAction({ type: 'buyCard', id: c.idx ?? CARDS.findIndex((x) => x.id === c.id) });
  return comboJustDone ? 'combo' : true;
}

export function getBoostCost(kind) {
  return calcBoostCost({ multi: S.multi || 0, energyLevel: S.energyLevel || 0 }, kind);
}

export function buyBoost(kind) {
  const now = Date.now();
  const today = dayKey(now);
  if (S.boostDay !== today) {
    S.boostDay = today;
    S.turboUses = 0;
    S.refillUsed = false;
  }
  if (kind === 'multi') {
    if ((S.multi || 0) >= 25) return { ok: false, reason: 'max' };
    const cost = getBoostCost('multi');
    if (!S.godMode && S.balance < cost) return { ok: false, reason: 'poor' };
    if (!S.godMode) S.balance -= cost;
    S.multi = (S.multi || 0) + 1;
    S.multitap = calcTapPower(S) * (now < S.turboUntil ? 5 : 1);
    save();
    emitAction({ type: 'boost', kind: 'multi' });
    return { ok: true, lvl: S.multi };
  }
  if (kind === 'energy') {
    if ((S.energyLevel || 0) >= 25) return { ok: false, reason: 'max' };
    const cost = getBoostCost('energy');
    if (!S.godMode && S.balance < cost) return { ok: false, reason: 'poor' };
    if (!S.godMode) S.balance -= cost;
    S.energyLevel = (S.energyLevel || 0) + 1;
    S.energyMax = calcEnergyLimit(S);
    S.energy = Math.min(S.energyMax, S.energy + 500);
    save();
    emitAction({ type: 'boost', kind: 'energy' });
    return { ok: true, lvl: S.energyLevel };
  }
  if (kind === 'turbo') {
    if ((S.level || 1) === 7) return { ok: false, reason: 'ocean_no_boost' };
    const freeLeft = Math.max(0, 3 - (S.turboUses || 0));
    const paidCost = 2500;
    if (freeLeft <= 0 && !S.godMode) {
      if (S.balance < paidCost) return { ok: false, reason: 'poor' };
      S.balance -= paidCost;
    } else if (!S.godMode) {
      S.turboUses = (S.turboUses || 0) + 1;
    }
    S.turboUntil = now + 20000;
    S.multitap = calcTapPower(S) * 5;
    save();
    emitAction({ type: 'boost', kind: 'turbo' });
    return { ok: true, activeUntil: S.turboUntil };
  }
  if (kind === 'refill') {
    const paidCost = 1500;
    if (S.refillUsed && !S.godMode) {
      if (S.balance < paidCost) return { ok: false, reason: 'poor' };
      S.balance -= paidCost;
    } else if (!S.godMode) {
      S.refillUsed = true;
    }
    S.energyMax = calcEnergyLimit(S);
    S.energy = S.energyMax;
    save();
    emitAction({ type: 'boost', kind: 'refill' });
    return { ok: true, energy: S.energy };
  }
  return { ok: false };
}

/* Дневной ритм-шифр из shared/economy.js (разделяет награду +1 000 000 с комбо) */
export function getCipherPattern() {
  return cipherOf(Date.now());
}

export function startCipher() {
  const combo = comboToday();
  if (combo.done) return null;
  const now = Date.now();
  const pattern = cipherOf(now);
  S.cipher = { showUntil: now + 2600, start: 0, progress: 0, sequence: pattern.sequence, beats: pattern.beats };
  save();
  emitAction({ type: 'cipherStart' });
  return S.cipher;
}

export function tapCipherBarrel(index) {
  const now = Date.now();
  const combo = comboToday();
  if (combo.done || !S.cipher) return { status: 'inactive' };
  const pattern = cipherOf(now);
  const step = S.cipher.progress || 0;
  if (index !== pattern.sequence[step]) {
    S.cipher = null;
    save();
    return { status: 'miss' };
  }
  if (step > 0) {
    const offset = now - S.cipher.start;
    if (Math.abs(offset - pattern.beats[step]) > 900) {
      S.cipher = null;
      save();
      return { status: 'miss' };
    }
  } else {
    S.cipher.start = now;
  }
  S.cipher.progress = step + 1;
  emitAction({ type: 'cipherTap', index });
  if (S.cipher.progress >= pattern.sequence.length) {
    S.cipher = null;
    combo.done = true;
    combo.hit = [...combo.ids];
    addPoints(1000000);
    save();
    return { status: 'won', reward: 1000000 };
  }
  save();
  return { status: 'hit', progress: S.cipher.progress, total: pattern.sequence.length };
}

/* Секретные тапы по трейлеру (+5 очков, до 30 раз в сутки, из shared/rules.js) */
export function screenTapBonus() {
  const now = Date.now();
  const today = dayKey(now);
  if (S.screenDay !== today) { S.screenDay = today; S.screenBonuses = 0; }
  if ((S.screenBonuses || 0) >= 30) return 0;
  S.screenBonuses = (S.screenBonuses || 0) + 1;
  addPoints(5);
  save();
  emitAction({ type: 'screen' });
  return 5;
}

/* Применение серверного состояния из Firebase Cloud Functions (shared/rules.js -> state.js) */
export function applyServerState(srv, profile) {
  if (!srv) return;
  if (typeof srv.score === 'number') S.balance = Math.floor(srv.score);
  if (typeof srv.totalEarned === 'number') S.total = Math.max(S.total, Math.floor(srv.totalEarned));
  if (typeof srv.energy === 'number') S.energy = srv.energy;
  if (typeof srv.multi === 'number') S.multi = srv.multi;
  if (typeof srv.energyLevel === 'number') S.energyLevel = srv.energyLevel;
  S.energyMax = calcEnergyLimit(S);
  S.multitap = calcTapPower(S);
  if (typeof srv.lives === 'number') {
    S.lives = Math.max(S.lives || 0, Math.floor(srv.lives));
    if (S.lives < S.livesMax) {
      S.halfLives = Math.max(S.halfLives || 0, srv.lives % 1 >= 0.5 ? 1 : 0);
    }
  }
  if (typeof srv.lifeAt === 'number') S.lastLifeTs = srv.lifeAt;
  if (typeof srv.bank === 'number') S.pending = Math.floor(srv.bank);
  if (typeof srv.economyAt === 'number') S.lastClaim = srv.economyAt;
  if (typeof srv.level === 'number') S.level = Math.max(1, srv.level);
  if (typeof srv.cleared === 'number') {
    S.cleared = srv.cleared;
    S.maxLevel = Math.max(S.maxLevel || 1, srv.cleared + 1);
    if (S.maxLevel >= 5) S.nightUnlocked = true;
  }
  if (typeof srv.nightWins === 'number') {
    S.nightRuns = Math.max(S.nightRuns || 0, srv.nightWins);
    if (srv.nightWins > 0) S.bestNight = Math.max(S.bestNight || 0, 2500);
  }
  if (typeof srv.streak === 'number') S.streak = srv.streak;
  if (typeof srv.dailyAt === 'string' && srv.dailyAt) S.lastDaily = srv.dailyAt;
  if (srv.poster30) S.poster30 = true;
  if (Array.isArray(srv.cards)) {
    srv.cards.forEach((lvl, idx) => {
      if (CARDS[idx]) S.cards[CARDS[idx].id] = Number(lvl) || 0;
    });
  }
  if (srv.comboDay) {
    const combo = comboToday();
    if (Array.isArray(srv.comboUpgrades)) {
      combo.hit = srv.comboUpgrades.map((idx) => CARDS[idx]?.id).filter(Boolean);
    }
    if (srv.comboClaimed === srv.comboDay) combo.done = true;
  }
  if (profile?.refCode) S.refCode = profile.refCode;
  if (profile?.alias) S.alias = profile.alias;
  save();
}

/* Поделиться трейлером фильма: даёт +1 полную жизнь и +5 000 очков */
export function shareTrailerReward(channel = 'trailer') {
  S.trailerSharedCount = (S.trailerSharedCount || 0) + 1;
  const prevLives = S.lives;
  S.livesMax = Math.max(S.livesMax || 3, Math.min(5, 3 + Math.floor(barrelCardLevel() / 3)));
  S.lives = Math.min(S.livesMax, (S.lives || 0) + 1);
  S.halfLives = 0;
  addPoints(5000);
  save();
  return {
    granted: true,
    fullLifeRestored: S.lives > prevLives,
    points: 5000,
    lives: S.lives,
    livesMax: S.livesMax,
  };
}

/* Поделиться игрой с другом: даёт +1 жизнь за репост в мессенджер и +5 000 очков */
export function invitePrepared(channel = 'generic') {
  if (!Array.isArray(S.sharedChannels)) S.sharedChannels = [];
  const prevLives = S.lives;
  S.livesMax = Math.max(S.livesMax || 3, Math.min(5, 3 + Math.floor(barrelCardLevel() / 3)));
  if (!S.sharedChannels.includes(channel)) {
    S.sharedChannels.push(channel);
  }
  S.lives = Math.min(S.livesMax, (S.lives || 0) + 1);
  S.halfLives = 0;
  addPoints(5000);
  save();
  return { granted: true, duplicate: false, fullLifeRestored: S.lives > prevLives, points: 5000 };
}

/* Друг перешёл по реферальной ссылке: возвращает ВСЕ жизни, +25 000 очков и +1 уровень КАРТОЧКИ «БОЧКА» */
export function friendArrived(name) {
  S.refs.push({ name: name || `Друг #${S.refs.length + 1}`, ts: Date.now() });
  S.livesMax = Math.max(S.livesMax || 3, Math.min(5, 3 + Math.floor(barrelCardLevel() / 3)));
  S.lives = S.livesMax;
  S.halfLives = 0;
  S.sharedChannels = [];
  addPoints(25000);
  save();
  const ch = barrelPremiereChances();
  return {
    barrelLevel: barrelCardLevel(),
    chances: ch.tickets,
    mult: ch.mult,
    refsCount: S.refs.length,
    points: 25000,
  };
}

export function fmt(n) { return Math.floor(n).toLocaleString('ru-RU'); }
export function tc(ms) {
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
