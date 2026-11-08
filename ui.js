import {
  S,
  save,
  addPoints,
  CARDS,
  TOOLS,
  currentTool,
  setToolLevel,
  upgradeTool,
  barrelCardLevel,
  MAX_BARREL_LEVEL,
  MAX_BARREL_PTS_LEVEL,
  canUpgradeBarrelWithPoints,
  playerSpeedRating,
  barrelCardUpgradeCost,
  barrelPremiereChances,
  buyBarrelCardWithPoints,
  shareTrailerReward,
  friendArrived,
  league,
  profitPerHour,
  cardCost,
  skillLevel,
  skillDuration,
  skillEnergyCost,
  getEquippedSkills,
  toggleEquipSkill,
  spendSkillEnergy,
  buyCard,
  claim,
  dailyReward,
  canClaimDaily,
  comboToday,
  getBoostCost,
  buyBoost,
  getCipherPattern,
  startCipher,
  tapCipherBarrel,
  regenLeft,
  tc,
  invitePrepared,
} from './state.js';
import { CONFIG, MEDIA, safeUrl } from './config.js';
import { net, refreshLeaderboard, syncShareInvitation, syncSaveProfile } from './net.js';
import { t, lang, number } from './i18n.js';
import { sheets, gridRect, drawFrame, barrelRect, oceanRect, CHAR_FRAMES, DOG_FRAMES, drawBarrelFallback } from './assets.js';
import { Actor, drawShadow, drawCone, drawBarrelWrappedLabel } from './sprites.js';
import { drawToolCursor, RU_BARREL_NAMES } from './tapper.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

/* ---------- modal ---------- */
let modalOpenedAt = 0;
let modalBackdropClosable = false;
let modalWheelBound = false;
export function modal(title, body, actions = [], opts = {}) {
  const m = $('modal'); if (!m) return;
  modalOpenedAt = performance.now();
  modalBackdropClosable = !!opts.backdropClose;
  $('modalTitle').textContent = title;
  const mb = $('modalBody');
  if (mb) {
    mb.innerHTML = body;
    mb.scrollTop = 0;
  }
  const box = $('modalActions'); box.innerHTML = '';
  if (!actions.length) {
    actions = [{ label: t('ok') }];
    modalBackdropClosable = true;
  }
  const makeActionBtn = (a, extraClass = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (a.ghost ? '' : ' btn--gold') + (extraClass ? ' ' + extraClass : '');
    b.textContent = a.label;
    b.onclick = () => {
      if (performance.now() - modalOpenedAt < 300) return;
      if (a.keep !== true) closeModal();
      if (a.fn) a.fn();
    };
    return b;
  };
  actions.forEach((a) => {
    box.appendChild(makeActionBtn(a));
  });
  /* Дублируем кнопки действий («▶ ИГРАТЬ / ПРОДОЛЖИТЬ») прямо внутри прокручиваемого блока #modalBody
     (и сверху, и в самом низу прокрутки), чтобы при скролле окна кнопка «ИГРАТЬ» всегда выезжала прямо перед глазами! */
  if (mb && actions.length) {
    const bottomInline = document.createElement('div');
    bottomInline.className = 'modal__inline-actions';
    actions.forEach((a) => {
      bottomInline.appendChild(makeActionBtn(a, 'modal__inline-btn'));
    });
    mb.appendChild(bottomInline);
  }
  if (!modalWheelBound) {
    modalWheelBound = true;
    m.addEventListener('wheel', (e) => {
      const bodyEl = $('modalBody');
      if (!bodyEl || m.classList.contains('is-hidden')) return;
      if (!bodyEl.contains(e.target)) {
        bodyEl.scrollTop += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  }
  document.documentElement.classList.add('is-modal-open');
  document.body.classList.add('is-modal-open');
  m.classList.remove('is-hidden');
}
export function closeModal() {
  $('modal')?.classList.add('is-hidden');
  document.documentElement.classList.remove('is-modal-open');
  document.body.classList.remove('is-modal-open');
}
export function modalOpen() { return !$('modal')?.classList.contains('is-hidden'); }

/* ---------- toast ---------- */
let toastEl = null, toastTimer = 0;
export function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.style.opacity = '1';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 2200);
}

/* ---------- HUD (corner plates + live economy counters) ---------- */
export function renderHUD(o) {
  const lives = $('lives'); if (!lives) return;
  const maxSq = Math.max(3, S.livesMax || 3, S.lives + (S.halfLives ? 1 : 0));
  lives.innerHTML = Array.from({ length: maxSq }, (_, i) => `<span class="sq ${i < S.lives ? 'is-on' : (i === S.lives && S.halfLives ? 'is-half' : '')}"></span>`).join('');
  $('airFill').style.width = Math.max(0, Math.min(100, o.air)) + '%';
  $('progFill').style.width = Math.max(0, Math.min(100, o.progress * 100)) + '%';
  const ePct = S.energyMax ? Math.max(0, Math.min(100, (S.energy / S.energyMax) * 100)) : 100;
  if ($('hudEnergyFill')) $('hudEnergyFill').style.width = ePct + '%';
  if ($('hudToolTxt')) {
    const hs = S.handSkillState;
    if (hs) {
      if (hs.state === 'armed') {
        $('hudToolTxt').textContent = `🎯 В РУКЕ: ${hs.icon} ${hs.ru.toUpperCase()} · НАВЕДИ НА ГЕРОЯ/БОЧКУ!`;
      } else {
        $('hudToolTxt').textContent = `⚡ НАВЫК В РУКЕ: ${hs.icon} ${hs.ru.toUpperCase()} (${(hs.timeLeft || 0).toFixed(1)}с)`;
      }
    } else {
      const tl = currentTool();
      const chainHint = tl.chainHits === 0 ? 'ЦЕПЬ ✖' : `ЦЕПЬ: ${tl.chainHits} УД.`;
      $('hudToolTxt').textContent = `${tl.icon} УР.${tl.lvl} ${(tl[lang] || tl.ru).toUpperCase()} · ${chainHint}`;
    }
  }

  const score = number(S.balance + Math.floor(o.points || 0));
  $('statTxt').textContent = o.mode === 'tap'
    ? `${t('levelWord')} ${pad(S.level)} // ${t('scoreWord')}: ${score} // ${o.timer}`
    : `${t('shift')} ${pad(S.nightRuns + 1)} // ${o.timer} // ${score}`;
  $('hintTxt').textContent = S.lives <= 0 ? t('hintDead') : o.mode === 'tap' ? t('hint') : t('hintNight');
  $('btnInvite').classList.toggle('is-hidden', S.lives > 0);
  $('btnModeNight').disabled = false;
  renderHudSkillsBar();

  /* Live counters in #upgrade */
  if ($('upgBalance')) $('upgBalance').textContent = number(S.balance);
  if ($('upgProfit')) $('upgProfit').textContent = number(profitPerHour());
  if ($('claimVal')) $('claimVal').textContent = number(S.pending || 0);
  if ($('btnClaim')) $('btnClaim').disabled = (S.pending || 0) <= 0;
  if ($('upgEnergyTxt')) $('upgEnergyTxt').textContent = `${Math.floor(S.energy)} / ${S.energyMax}`;
  if ($('upgEnergyBar')) $('upgEnergyBar').style.width = ePct + '%';
  if ($('upgRegenTxt')) $('upgRegenTxt').textContent = tc(regenLeft());
}

/* ---------- sprite thumbnails ---------- */
const DOSSIER_POSTER_MAP = {
  priest: { key: 'posterPriest', crop: [0.02, 0.0, 0.96, 0.68] },
  father: { key: 'posterFather', crop: [0.06, 0.02, 0.88, 0.68] },
  boy:    { key: 'posterBoy',    crop: [0.06, 0.02, 0.88, 0.68] },
  girl:   { key: 'posterGirl',   crop: [0.06, 0.02, 0.88, 0.68] },
  capguy: { key: 'posterPriestHand', crop: [0.06, 0.08, 0.88, 0.68] },
  dog:    { key: 'posterBarrelEye',  crop: [0.22, 0.04, 0.74, 0.72] },
};

function charCanvas(sheetKey, frame = 0) {
  const c = document.createElement('canvas'); c.width = 200; c.height = 240;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#080A0E'; ctx.fillRect(0, 0, 200, 240);
  const pInfo = DOSSIER_POSTER_MAP[sheetKey];
  const pImg = pInfo && sheets[pInfo.key];
  if (pImg) {
    const [cx, cy, cw, ch] = pInfo.crop;
    ctx.save();
    ctx.globalAlpha = (sheetKey === 'capguy' || sheetKey === 'dog') ? 0.42 : 0.78;
    ctx.drawImage(
      pImg,
      Math.floor(cx * pImg.width), Math.floor(cy * pImg.height),
      Math.floor(cw * pImg.width), Math.floor(ch * pImg.height),
      0, 0, 200, 240
    );
    ctx.restore();
    const vg = ctx.createLinearGradient(0, 0, 0, 240);
    vg.addColorStop(0, 'rgba(8,10,14,0.18)');
    vg.addColorStop(0.55, 'rgba(8,10,14,0.35)');
    vg.addColorStop(1, 'rgba(8,10,14,0.92)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 200, 240);
  } else {
    const g = ctx.createLinearGradient(100, 0, 100, 240);
    g.addColorStop(0, 'rgba(230,232,234,0.14)');
    g.addColorStop(1, 'rgba(230,232,234,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(130, 0); ctx.lineTo(185, 240); ctx.lineTo(15, 240); ctx.fill();
  }
  const sh = sheets[sheetKey];
  if (sh) {
    const spriteH = (sheetKey === 'capguy' || sheetKey === 'dog') ? 190 : 126;
    const spriteX = (sheetKey === 'capguy' || sheetKey === 'dog') ? 100 : 152;
    drawFrame(ctx, sh, gridRect(sh, frame), spriteX, 234, spriteH);
  } else {
    ctx.fillStyle = '#4A5568'; ctx.fillRect(75, 50, 50, 160);
  }
  return c;
}
function barrelCanvas(key) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 180;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#0B0D11'; ctx.fillRect(0, 0, 160, 180);
  const sh = sheets.barrels;
  if (sh) drawFrame(ctx, sh, barrelRect(sh, key), 80, 172, 150);
  else { ctx.fillStyle = '#5c2c16'; ctx.fillRect(50, 40, 60, 130); }
  return c;
}

/* ---------- sections (fog of war) ---------- */
export function renderSections() {
  document.querySelectorAll('.sec[data-need]').forEach((sec) => {
    const need = Number(sec.dataset.need);
    const ok = S.maxLevel >= need;
    sec.classList.toggle('is-locked', !ok);
    const lbl = sec.querySelector('.sec__lock span'); if (lbl) lbl.textContent = t('lockAfter', { n: pad(need - 1) });
  });
  renderUpgrade();
  renderCast();
  renderArchive();
  renderFriends();
  renderLeaders();
}

/* ---------- ПРОКАЧКА ПЛОЩАДКИ И КАРТОЧКИ НАВЫКОВ ---------- */
export function triggerSkillActivation(cardId) {
  const c = CARDS.find((x) => x.id === cardId || x.skillKey === cardId);
  if (!c) return false;
  document.dispatchEvent(new CustomEvent('arm-skill', { detail: { cardId: c.id, card: c } }));
  renderUpgrade();
  renderHudSkillsBar(true);
  return true;
}

let lastHudSkillSig = '';
export function renderHudSkillsBar(force = false) {
  const bar = $('hudSkillsBar');
  if (!bar) return;
  const eq = getEquippedSkills();
  const curE = Math.floor(S.energy || 0);
  const hs = S.handSkillState;
  const isOceanLvl = (S.level || 1) === 7;
  const hsSig = hs ? `${hs.cardId}:${hs.state}:${Math.ceil(hs.timeLeft || 0)}` : 'none';
  const sig = `${eq.join(',')}|${Math.floor(curE / 10)}|${hsSig}|${isOceanLvl}|${lang}`;
  if (!force && sig === lastHudSkillSig) return;
  lastHudSkillSig = sig;

  const shortNames = {
    fragile: 'Хрупкая',
    shrink: 'Одеть бочку',
    freeze: 'Заморозка ★',
    stealth: 'Фонарь ✖',
    distract: 'Пранк-точка',
    overcharge: 'Огонь 🔥',
    jackpot: 'Призовые!',
    xray: 'Рентген',
    oxygen: 'Щит O₂',
    magnet: 'Магнит',
  };

  bar.innerHTML = '';
  eq.forEach((cid) => {
    const c = CARDS.find((x) => x.id === cid);
    if (!c) return;
    const eCost = skillEnergyCost(c);
    const dur = skillDuration(c);
    const canCast = !isOceanLvl && (!!S.godMode || curE >= eCost);
    const isThisInHand = !isOceanLvl && hs && hs.cardId === c.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `hud-skill-chip ${canCast ? 'is-ready' : 'is-low'} ${isThisInHand ? 'is-in-hand' : ''}`;
    btn.style.setProperty('--sk-accent', isOceanLvl ? '#7E8C9B' : (c.accent || '#D4A843'));
    btn.title = isOceanLvl
      ? 'На уровне «Достучаться до небес» карточки усиления не работают!'
      : `${c.ru}: Включить навык (${dur}с · расход ${eCost} ⚡)`;
    const badgeRight = isOceanLvl
      ? '🔒БЛОК'
      : isThisInHand
        ? `⏱️${Math.ceil(hs.timeLeft)}с`
        : `⚡${eCost}`;
    btn.innerHTML = `<span class="hud-skill-chip__ic">${isOceanLvl ? '🔒' : c.icon}</span><span class="hud-skill-chip__nm">${shortNames[c.skillKey] || c.ru}</span><span class="hud-skill-chip__cost">${badgeRight}</span>`;
    btn.onclick = (e) => {
      e.stopPropagation();
      triggerSkillActivation(c.id);
    };
    bar.appendChild(btn);
  });
}

export function renderUpgrade() {
  if (!$('upgrade')) return;
  const lg = league();
  if ($('upgLeague')) $('upgLeague').textContent = lg[lang] || lg.ru;
  if ($('upgBalance')) $('upgBalance').textContent = number(S.balance);
  if ($('upgProfit')) $('upgProfit').textContent = number(profitPerHour());
  if ($('claimVal')) $('claimVal').textContent = number(S.pending || 0);
  if ($('btnClaim')) $('btnClaim').disabled = (S.pending || 0) <= 0;

  /* 30-дневный стрик */
  if ($('upgStreakTxt')) $('upgStreakTxt').textContent = `${S.streak || 0} / 30`;
  const sGrid = $('streakGrid');
  if (sGrid) {
    sGrid.innerHTML = Array.from({ length: 30 }, (_, i) => {
      const on = i < (S.streak || 0);
      return `<span class="streak-cell ${on ? 'is-on' : ''} ${i === 29 ? 'is-30' : ''}" title="${i + 1}"></span>`;
    }).join('');
  }
  if ($('btnDaily')) {
    const ready = canClaimDaily();
    $('btnDaily').classList.toggle('btn--gold', ready);
  }

  /* Ежедневное комбо из 3 секретных карточек */
  const combo = comboToday();
  if ($('comboStatus')) {
    $('comboStatus').textContent = combo.done
      ? t('comboDone')
      : t('comboLeft', { n: combo.hit.length });
  }
  const cSlots = $('comboSlots');
  if (cSlots) {
    cSlots.innerHTML = combo.ids.map((cid, idx) => {
      const found = combo.done || combo.hit.includes(cid);
      const card = CARDS.find((c) => c.id === cid);
      const title = found && card ? (card[lang] || card.ru) : `СЕКРЕТ #0${idx + 1}`;
      const icon = found && card ? card.icon : '?';
      return `<div class="combo-slot ${found ? 'is-hit' : ''}">
        <span class="combo-slot__icon">${icon}</span>
        <span>${title}</span>
      </div>`;
    }).join('');
  }
  if ($('btnCipher')) {
    $('btnCipher').disabled = combo.done;
  }

  /* Бусты и усиления */
  const bGrid = $('boostsGrid');
  if (bGrid) {
    const now = Date.now();
    const isOceanLvl = (S.level || 1) === 7;
    const multiMax = (S.multi || 0) >= 25;
    const energyMax = (S.energyLevel || 0) >= 25;
    const turboLeft = Math.max(0, 3 - (S.turboUses || 0));
    const turboActive = now < (S.turboUntil || 0);
    const curTool = currentTool();
    const nextToolIdx = Math.min(TOOLS.length - 1, (S.toolLevel || 1));
    const nextTool = TOOLS[nextToolIdx];
    const toolMax = (S.toolLevel || 1) >= 10;
    const toolUnlocked = ((S.toolLevel || 1) + 1) <= (S.maxToolLevel || 3);
    const toolCost = toolUnlocked ? 0 : nextTool.cost;
    const boosts = [
      {
        kind: 'tool',
        title: `${curTool.icon} ${t('toolLabel')}: ${curTool[lang] || curTool.ru}`,
        lvl: `LVL ${curTool.lvl}/10`,
        meta: toolMax ? `×${curTool.mult} · 10 ОРУДИЙ ОТКРЫТО` : `→ ${nextTool.icon} ${nextTool[lang] || nextTool.ru} (×${nextTool.mult})`,
        disabled: !toolMax && !toolUnlocked && !S.godMode && S.balance < toolCost,
        btn: toolMax ? '🔄 СМЕНИТЬ ОРУДИЕ' : toolUnlocked ? `▶ УР.${nextTool.lvl} (${t('free')})` : `${t('buy')} · ${number(toolCost)}`,
      },
      {
        kind: 'multi',
        title: `⚡ ${t('boostMulti')}`,
        lvl: `LVL ${S.multi || 0}/25`,
        meta: multiMax ? t('max') : `+1 ТАП · ${number(getBoostCost('multi'))}`,
        disabled: multiMax || (!S.godMode && S.balance < getBoostCost('multi')),
        btn: multiMax ? t('max') : `${t('buy')} · ${number(getBoostCost('multi'))}`,
      },
      {
        kind: 'energy',
        title: `🔋 ${t('boostEnergy')}`,
        lvl: `LVL ${S.energyLevel || 0}/25`,
        meta: `+500 MAX ⚡`,
        disabled: energyMax || (!S.godMode && S.balance < getBoostCost('energy')),
        btn: energyMax ? t('max') : `${t('buy')} · ${number(getBoostCost('energy'))}`,
      },
      {
        kind: 'turbo',
        title: `🔥 ${t('boostTurbo')}`,
        lvl: isOceanLvl ? '🔒 УР.07' : `${turboLeft}/3`,
        meta: isOceanLvl ? 'БЛОК НА МОРЕ' : turboActive ? 'АКТИВНО ×5 (20с)' : (turboLeft > 0 || S.godMode ? t('free') : '2 500 ОЧК.'),
        disabled: isOceanLvl || (!S.godMode && turboLeft <= 0 && S.balance < 2500),
        btn: isOceanLvl ? '🔒 НЕ РАБОТАЕТ НА МОРЕ' : turboActive ? '🔥 ПРОДЛИТЬ ×5 (20с)' : (turboLeft > 0 || S.godMode ? `🔥 ВКЛЮЧИТЬ ×5 (${turboLeft}/3)` : '🔥 ВКЛЮЧИТЬ ×5 · 2 500'),
      },
      {
        kind: 'refill',
        title: `🛢️ ${t('boostRefill')}`,
        lvl: S.refillUsed && !S.godMode ? '+100% ⚡' : '1/1',
        meta: `${S.energyMax} ⚡ + 100% 💨 O₂`,
        disabled: !!(S.refillUsed && !S.godMode && S.balance < 1500),
        btn: (!S.refillUsed || S.godMode) ? `⚡ ПОЛНЫЙ БАК (${t('free')})` : '⚡ ПОЛНЫЙ БАК · 1 500',
      },
    ];
    bGrid.innerHTML = '';
    boosts.forEach((b) => {
      const el = document.createElement('div');
      el.className = 'shop-card';
      el.innerHTML = `
        <div class="shop-card__head">
          <div class="shop-card__title">${b.title}</div>
          <div class="shop-card__lvl">${b.lvl}</div>
        </div>
        <div class="shop-card__meta">${b.meta}</div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.disabled ? '' : ' btn--gold');
      btn.disabled = b.disabled;
      btn.textContent = b.btn;
      btn.onclick = () => {
        if (b.kind === 'tool') {
          if ((S.toolLevel || 1) >= 10) {
            const next = setToolLevel((S.toolLevel || 1) + 1);
            audio.coin(1.4);
            toast(`🔨 Выбрано орудие: ${next.icon} ${next.ru} (×${next.mult})!`);
            renderUpgrade();
            return;
          }
          const res = upgradeTool();
          if (res.ok) {
            audio.coin(1.5);
            toast(`⬆️ Орудие улучшено: ${res.tool.icon} ${res.tool.ru} (×${res.tool.mult})!`);
            renderUpgrade();
          } else if (res.reason === 'poor') {
            toast(t('poor'));
          }
          return;
        }
        const res = buyBoost(b.kind);
        if (res.ok) {
          audio.coin(1.6);
          if (b.kind === 'turbo') {
            toast('🔥 ТУРБО ×5 ВКЛЮЧЕНО НА 20 СЕКУНД! Стучи по бочкам!');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (b.kind === 'refill') {
            if (window.__BAREL__?.tapper) window.__BAREL__.tapper.air = 100;
            toast(`🛢️ Полный бак заправлен: ${S.energyMax} ⚡ энергии и 100% 💨 O₂!`);
          } else if (b.kind === 'multi') {
            toast(`⚡ Мультитап прокачан до УР. ${S.multi}/25!`);
          } else if (b.kind === 'energy') {
            toast(`🔋 Запас энергии увеличен до ${S.energyMax} ⚡ (УР. ${S.energyLevel}/25)!`);
          }
          renderUpgrade();
        } else if (res.reason === 'ocean_no_boost') {
          toast('🚫 На уровне «Достучаться до небес» бусты и карточки усиления не работают!');
        } else if (res.reason === 'poor') {
          toast(t('poor'));
        }
      };
      el.appendChild(btn);
      bGrid.appendChild(el);
    });
  }

  /* Флагманская карточка «🛢️ КАРТОЧКА БОЧКА · ЗАКРЫТЫЙ ПОКАЗ»:
     качается за каждого приглашённого друга (+1 ур.) И за очень много очков для тех, кто долго играет и копит! */
  renderBarrelPremiereCard();

  /* 10 коллекционных карточек навыков выживания (богатые иллюстрированные карточки + прокачка + выбор в боевой слот + активация в руку за энергию ⚡) */
  const cGrid = $('cardsGrid');
  if (cGrid) {
    cGrid.innerHTML = '';
    const eq = getEquippedSkills();
    const isOceanLvl = (S.level || 1) === 7;
    CARDS.forEach((c) => {
      const rawLvl = S.cards[c.id] || 0;
      const effLvl = skillLevel(c);
      const isMax = rawLvl >= 50;
      const cost = cardCost(c);
      const canBuy = !isMax && (!!S.godMode || S.balance >= cost);
      const eCost = skillEnergyCost(c);
      const dur = skillDuration(c);
      const canCast = !isOceanLvl && (!!S.godMode || S.energy >= eCost);
      const isEquipped = eq.includes(c.id);
      const isMythic = (c.rarity || '').includes('МИФИЧЕСКИЙ') || c.skillKey === 'freeze';
      const powerPct = Math.min(100, Math.round(35 + effLvl * 6.5));
      const durPct = Math.min(100, Math.round((dur / 18) * 100));
      const targetBadge = isOceanLvl
        ? '🔒 БЛОК НА УР. 07 (МОРЕ)'
        : c.skillKey === 'distract'
          ? '🎯 ЦЕЛЬ: ТОЧКА В ЦЕХЕ'
          : (c.skillKey === 'overcharge' || c.skillKey === 'jackpot' || c.skillKey === 'fragile' || c.skillKey === 'xray')
            ? '🎯 ЦЕЛЬ: НА БОЧКУ'
            : '🎯 ЦЕЛЬ: НА ОХРАНУ / БОЧКУ';

      const el = document.createElement('div');
      el.className = `skill-card ${isEquipped ? 'is-equipped' : ''} ${isMythic ? 'is-mythic' : ''}`;
      el.style.setProperty('--sk-accent', c.accent || '#D4A843');
      el.innerHTML = `
        <div class="skill-card__foil"></div>
        <div class="skill-card__top">
          <span class="skill-card__rarity">${isMythic ? '👑 ' : '✦ '}${c.rarity || 'РЕДКИЙ'}</span>
          <span class="skill-card__target">${targetBadge}</span>
          <span class="skill-card__lvl">УР. ${effLvl}</span>
        </div>
        <div class="skill-card__art">
          <div class="skill-card__halo"></div>
          <div class="skill-card__svg-wrap">${renderSkillCardArtSVG(c)}</div>
          <div class="skill-card__cost-pill">⚡ ${eCost} ЭНЕРГИИ · ⏱️ ${dur}с</div>
        </div>
        <div class="skill-card__title">${c[lang] || c.ru}</div>
        <div class="skill-card__desc">${c.desc || ''}</div>
        <div class="skill-card__meters">
          <div class="skill-meter">
            <div class="skill-meter__head"><span>⚡ МОЩЬ ЭФФЕКТА</span><b>УР. ${effLvl}</b></div>
            <div class="skill-meter__bar"><div class="skill-meter__fill" style="width:${powerPct}%"></div></div>
          </div>
          <div class="skill-meter">
            <div class="skill-meter__head"><span>⏱️ ВРЕМЯ ДЕЙСТВИЯ</span><b>${dur}с (+0.8с/ур)</b></div>
            <div class="skill-meter__bar"><div class="skill-meter__fill" style="width:${durPct}%"></div></div>
          </div>
        </div>
        <div class="skill-card__stats">
          <span>💰 Пассив цеха: <b>+${number(c.income)}/ч</b> (Σ +${number(rawLvl * c.income)}/ч)</span>
        </div>
        <div class="skill-card__actions">
          <button type="button" class="btn ${canBuy ? 'btn--gold' : ''} skill-btn-upg" ${!canBuy ? 'disabled' : ''}>
            ${isMax ? t('max') : `⬆️ ПРОКАЧАТЬ НАВЫК · ${number(cost)}`}
          </button>
          <div class="skill-card__subrow">
            <button type="button" class="btn ${isEquipped ? 'btn--gold' : ''} skill-btn-eq">
              ${isEquipped ? '⭐ В БОЮ (СЛОТ)' : '☆ ВЫБРАТЬ В БОЙ'}
            </button>
            <button type="button" class="btn ${canCast ? 'btn--gold' : ''} skill-btn-cast" ${!canCast ? 'disabled' : ''}>
              ${isOceanLvl ? '🔒 БЛОК НА МОРЕ' : `⚡ ВКЛЮЧИТЬ (-${eCost} ⚡)`}
            </button>
          </div>
        </div>
      `;

      const upgBtn = el.querySelector('.skill-btn-upg');
      if (upgBtn) {
        upgBtn.onclick = () => {
          const res = buyCard(c);
          if (!res) { toast(t('poor')); return; }
          audio.coin(res === 'combo' ? 2.2 : 1.3);
          if (res === 'combo') toast(t('comboDone'));
          else toast(`⬆️ Навык «${c.ru}» прокачан до УР.${skillLevel(c)}! Длительность: ${skillDuration(c)}с`);
          renderUpgrade();
          renderHudSkillsBar(true);
          renderArchive();
          renderLeaders();
        };
      }

      const eqBtn = el.querySelector('.skill-btn-eq');
      if (eqBtn) {
        eqBtn.onclick = () => {
          const nowOn = toggleEquipSkill(c.id);
          audio.coin(1.2);
          toast(nowOn ? `⭐ Навык «${c.ru}» добавлен на боевую панель завода!` : `Навык «${c.ru}» убран с верхней панели.`);
          renderUpgrade();
          renderHudSkillsBar(true);
        };
      }

      const castBtn = el.querySelector('.skill-btn-cast');
      if (castBtn) {
        castBtn.onclick = () => {
          if (triggerSkillActivation(c.id)) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        };
      }

      cGrid.appendChild(el);
    });
  }
  renderHudSkillsBar(true);
}

/* ---------- ИЛЛЮСТРИРОВАННЫЕ SVG-СЦЕНЫ ДЛЯ КАЖДОЙ ИЗ 10 КАРТОЧЕК НАВЫКОВ ---------- */
function renderSkillCardArtSVG(c) {
  const sk = c.skillKey || '';
  const acc = c.accent || '#D4A843';

  if (sk === 'freeze') {
    return `
      <svg viewBox="0 0 180 96" class="skill-art-svg" aria-hidden="true">
        <defs>
          <linearGradient id="frzG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#E0FBFC" stop-opacity="0.95"/>
            <stop offset="50%" stop-color="#00E5FF" stop-opacity="0.72"/>
            <stop offset="100%" stop-color="#023E8A" stop-opacity="0.88"/>
          </linearGradient>
        </defs>
        <polygon points="90,6 132,24 142,84 38,84 48,24" fill="url(#frzG)" stroke="#E0FBFC" stroke-width="2"/>
        <polygon points="38,84 18,46 44,58" fill="#48CAE4" opacity="0.8"/>
        <polygon points="142,84 162,44 136,58" fill="#48CAE4" opacity="0.8"/>
        <polyline points="62,22 86,48 74,78" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.85"/>
        <polyline points="114,28 92,52 112,76" fill="none" stroke="#FFFFFF" stroke-width="1.6" opacity="0.7"/>
        <text x="90" y="54" text-anchor="middle" font-size="26">❄️👑</text>
      </svg>`;
  }
  if (sk === 'overcharge') {
    return `
      <svg viewBox="0 0 180 96" class="skill-art-svg" aria-hidden="true">
        <path d="M62,48 Q54,18 76,8 Q72,28 90,4 Q108,26 104,10 Q126,22 118,48 Z" fill="#FF5400" opacity="0.92"/>
        <path d="M72,48 Q68,26 90,14 Q112,26 108,48 Z" fill="#FFD166" opacity="0.95"/>
        <rect x="64" y="44" width="52" height="44" rx="6" fill="#2B1814" stroke="#FF5400" stroke-width="2"/>
        <line x1="64" y1="56" x2="116" y2="56" stroke="#FFD166" stroke-width="2"/>
        <line x1="64" y1="74" x2="116" y2="74" stroke="#FFD166" stroke-width="2"/>
        <text x="90" y="72" text-anchor="middle" font-size="20">🔥</text>
      </svg>`;
  }
  if (sk === 'shrink') {
    return `
      <svg viewBox="0 0 180 96" class="skill-art-svg" aria-hidden="true">
        <line x1="78" y1="68" x2="72" y2="88" stroke="#181C22" stroke-width="6" stroke-linecap="round"/>
        <line x1="102" y1="68" x2="108" y2="88" stroke="#181C22" stroke-width="6" stroke-linecap="round"/>
        <rect x="64" y="84" width="14" height="6" rx="2" fill="#D4A843"/>
        <rect x="102" y="84" width="14" height="6" rx="2" fill="#D4A843"/>
        <rect x="62" y="18" width="56" height="54" rx="8" fill="#324252" stroke="#64DFDF" stroke-width="2"/>
        <line x1="62" y1="32" x2="118" y2="32" stroke="#64DFDF" stroke-width="2"/>
        <line x1="62" y1="56" x2="118" y2="56" stroke="#64DFDF" stroke-width="2"/>
        <text x="90" y="50" text-anchor="middle" fill="#ECE4D2" font-family="monospace" font-size="10" font-weight="bold">В БОЧКЕ</text>
      </svg>`;
  }
  if (sk === 'stealth') {
    return `
      <svg viewBox="0 0 180 96" class="skill-art-svg" aria-hidden="true">
        <circle cx="90" cy="48" r="34" fill="none" stroke="#9D4EDD" stroke-width="2" stroke-dasharray="5 4"/>
        <polygon points="44,52 74,42 74,62" fill="#2A2438" stroke="#9D4EDD" stroke-width="1.8"/>
        <path d="M74,44 L136,24 L136,76 L74,58 Z" fill="#9D4EDD" opacity="0.22" stroke="#C77DFF" stroke-dasharray="4 4"/>
        <polyline points="82,36 96,48 88,54 106,64" fill="none" stroke="#FFD166" stroke-width="2.2"/>
        <text x="90" y="54" text-anchor="middle" font-size="24">👻🔦</text>
      </svg>`;
  }
  if (sk === 'distract') {
    return `
      <svg viewBox="0 0 180 96" class="skill-art-svg" aria-hidden="true">
        <circle cx="90" cy="48" r="18" fill="none" stroke="#FF9F1C" stroke-width="2"/>
        <circle cx="90" cy="48" r="30" fill="none" stroke="#FF9F1C" stroke-width="1.6" stroke-dasharray="6 4"/>
        <circle cx="90" cy="48" r="41" fill="none" stroke="#FFD166" stroke-width="1.2" opacity="0.65"/>
        <text x="90" y="55" text-anchor="middle" font-size="25">📢📻</text>
      </svg>`;
  }
  if (sk === 'jackpot') {
    return `
      <svg viewBox="0 0 180 96" class="skill-art-svg" aria-hidden="true">
        <rect x="64" y="24" width="52" height="58" rx="7" fill="#5A4214" stroke="#FFD166" stroke-width="2.4"/>
        <line x1="64" y1="38" x2="116" y2="38" stroke="#FFD166" stroke-width="2.2"/>
        <line x1="64" y1="66" x2="116" y2="66" stroke="#FFD166" stroke-width="2.2"/>
        <text x="90" y="20" text-anchor="middle" font-size="15">👑✨</text>
        <text x="90" y="58" text-anchor="middle" font-size="22">🎁</text>
      </svg>`;
  }
  return `
    <svg viewBox="0 0 180 96" class="skill-art-svg" aria-hidden="true">
      <circle cx="90" cy="48" r="32" fill="none" stroke="${acc}" stroke-width="2" opacity="0.65"/>
      <polygon points="90,12 124,30 124,66 90,84 56,66 56,30" fill="rgba(16,20,28,0.85)" stroke="${acc}" stroke-width="2"/>
      <text x="90" y="57" text-anchor="middle" font-size="28">${c.icon}</text>
    </svg>`;
}

/* ---------- 7 ВИЗУАЛЬНЫХ ЭВОЛЮЦИЙ КАРТОЧКИ «БОЧКА · ЗАКРЫТЫЙ ПОКАЗ» ---------- */
const BARREL_EVOLUTIONS = [
  {
    tier: 1,
    minLvl: 1,
    name: '🪵 ДЕРЕВЯННАЯ БОЧКА ЦЕХА',
    sub: 'Старый дубовый бочонок со стальными обручами',
    accent: '#C88A4B',
    bgGlow: 'rgba(200, 138, 75, 0.24)',
    stencil: 'ЦЕХ №1',
  },
  {
    tier: 2,
    minLvl: 2,
    name: '🧱 РЖАВАЯ КЛЁПАНАЯ БОЧКА',
    sub: 'Заводская сталь с латунными заклёпками и полосами',
    accent: '#E07A5F',
    bgGlow: 'rgba(224, 122, 95, 0.25)',
    stencil: 'СЕКТОР 3',
  },
  {
    tier: 3,
    minLvl: 3,
    name: '⛓️ БРОНИРОВАННАЯ В ЦЕПЯХ',
    sub: 'Кованая броня, крестовые цепи и тяжёлый замок',
    accent: '#90A4AE',
    bgGlow: 'rgba(144, 164, 174, 0.26)',
    stencil: 'БРОНЯ',
  },
  {
    tier: 4,
    minLvl: 4,
    name: '🔥 ОГНЕННАЯ БОЧКА ИНФЕРНО',
    sub: 'Раскалённый металл с языками ревущего пламени',
    accent: '#FF5400',
    bgGlow: 'rgba(255, 84, 0, 0.28)',
    stencil: 'ИНФЕРНО',
  },
  {
    tier: 5,
    minLvl: 5,
    name: '❄️ КРИО-МОНОЛИТ АБСОЛЮТ',
    sub: 'Глыба вечного льда с ледяными шипами и изморозью',
    accent: '#00E5FF',
    bgGlow: 'rgba(0, 229, 255, 0.28)',
    stencil: 'КРИО ★',
  },
  {
    tier: 6,
    minLvl: 6,
    name: '👑 ЗОЛОТАЯ VIP-БОЧКА ПРЕМЬЕРЫ',
    sub: 'Червонное золото 999 пробы с красной бархатной лентой',
    accent: '#FFD166',
    bgGlow: 'rgba(255, 209, 102, 0.30)',
    stencil: 'VIP ПОКАЗ',
  },
  {
    tier: 7,
    minLvl: 7,
    name: '💎 АЛМАЗНАЯ БОЧКА «ТИЛЬ · МОРЕ»',
    sub: 'Мифический кристалл с волнами океана и билетами в рай',
    accent: '#80ED99',
    bgGlow: 'rgba(128, 237, 153, 0.32)',
    stencil: 'ТИЛЬ ★ VIP',
  },
];

let previewBarrelTier = null;

function getBarrelEvolutionByLevel(lvl) {
  const idx = Math.min(BARREL_EVOLUTIONS.length - 1, Math.max(0, (lvl || 1) - 1));
  return BARREL_EVOLUTIONS[idx];
}

function renderBarrelEvolutionSVG(evo, actualLvl) {
  const t = evo.tier;
  /* Вариация деталей 3D-бочки в зависимости от ступени эволюции (1..7) */
  const bodyGrad = t === 1
    ? ['#6E4726', '#9C6B3B', '#523318']
    : t === 2
      ? ['#542B1E', '#8F4730', '#381B12']
      : t === 3
        ? ['#26303A', '#566676', '#192028']
        : t === 4
          ? ['#5C1206', '#D4380D', '#290602']
          : t === 5
            ? ['#023E8A', '#00B4D8', '#03045E']
            : t === 6
              ? ['#8C6214', '#FFE07D', '#593C06']
              : ['#0F3847', '#64DFDF', '#1A1446'];

  const hoopColor = t === 1 ? '#2B3138'
    : t === 2 ? '#D4A843'
    : t === 3 ? '#CFD8E2'
    : t === 4 ? '#FFD166'
    : t === 5 ? '#E0FBFC'
    : t === 6 ? '#FFF3B0'
    : '#80ED99';

  const topCrown = t === 4
    ? `<path d="M36,28 Q30,6 50,12 Q60,0 70,12 Q88,6 84,28 Z" fill="#FF5400" opacity="0.92"/>
       <path d="M44,28 Q46,12 60,8 Q74,12 76,28 Z" fill="#FFD166"/>`
    : t === 5
      ? `<polygon points="36,28 24,8 48,22 60,4 72,22 96,8 84,28" fill="#90E0EF" stroke="#E0FBFC" stroke-width="1.5"/>`
      : t >= 6
        ? `<polygon points="40,26 44,10 54,18 60,6 66,18 76,10 80,26" fill="#FFD166" stroke="#FFF8D6" stroke-width="1.4"/>`
        : '';

  const chainsOverlay = t === 3
    ? `<line x1="28" y1="42" x2="92" y2="104" stroke="#DCE4EC" stroke-width="4" stroke-dasharray="6 3"/>
       <line x1="92" y1="42" x2="28" y2="104" stroke="#DCE4EC" stroke-width="4" stroke-dasharray="6 3"/>
       <rect x="51" y="64" width="18" height="16" rx="3" fill="#E0B24C" stroke="#14181E" stroke-width="1.5"/>`
    : '';

  const diamondWaves = t === 7
    ? `<path d="M30,86 Q45,78 60,86 T90,86 L90,112 L30,112 Z" fill="#0077B6" opacity="0.55"/>
       <polygon points="60,36 74,54 60,72 46,54" fill="#E0FBFC" opacity="0.55" stroke="#80ED99" stroke-width="1.5"/>`
    : '';

  const friendsEliteAura = actualLvl >= 8
    ? `<circle cx="60" cy="72" r="50" fill="none" stroke="#80ED99" stroke-width="1.6" stroke-dasharray="5 3" opacity="0.78"/>
       <rect x="20" y="2" width="80" height="13" rx="6" fill="rgba(8,22,18,0.92)" stroke="#80ED99" stroke-width="1.2"/>
       <text x="60" y="11" text-anchor="middle" fill="#80ED99" font-family="monospace" font-size="7.2" font-weight="bold">🤝 ЭЛИТА ДРУЗЕЙ · ${actualLvl}/200</text>`
    : '';

  return `
    <svg viewBox="0 0 120 138" class="barrel-evo-svg tier-${t}" aria-hidden="true">
      <defs>
        <linearGradient id="bEvoBody${t}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${bodyGrad[0]}"/>
          <stop offset="45%" stop-color="${bodyGrad[1]}"/>
          <stop offset="100%" stop-color="${bodyGrad[2]}"/>
        </linearGradient>
      </defs>
      <!-- Тень под бочкой -->
      <ellipse cx="60" cy="126" rx="38" ry="8" fill="rgba(0,0,0,0.65)"/>
      ${friendsEliteAura}
      ${topCrown}
      <!-- Цилиндрический корпус бочки -->
      <rect x="28" y="26" width="64" height="94" rx="10" fill="url(#bEvoBody${t})" stroke="${hoopColor}" stroke-width="2.2"/>
      <!-- Верхний эллипс крышки -->
      <ellipse cx="60" cy="28" rx="31" ry="7" fill="${bodyGrad[1]}" stroke="${hoopColor}" stroke-width="2"/>
      ${diamondWaves}
      <!-- Стальные/золотые обручи бочки -->
      <rect x="26" y="42" width="68" height="6" rx="2" fill="${hoopColor}"/>
      <rect x="26" y="70" width="68" height="6" rx="2" fill="${hoopColor}"/>
      <rect x="26" y="98" width="68" height="6" rx="2" fill="${hoopColor}"/>
      <!-- Трафаретная табличка на поясе бочки -->
      <rect x="33" y="51" width="54" height="16" rx="3" fill="rgba(8,10,14,0.88)" stroke="${evo.accent}" stroke-width="1.4"/>
      <text x="60" y="62" text-anchor="middle" fill="#FFF4D6" font-family="monospace" font-size="8.5" font-weight="bold">${evo.stencil}</text>
      ${chainsOverlay}
      <!-- Плашка уровня внизу бочки -->
      <rect x="28" y="108" width="64" height="14" rx="4" fill="#0B0E14" stroke="${evo.accent}" stroke-width="1.4"/>
      <text x="60" y="118" text-anchor="middle" fill="${evo.accent}" font-family="monospace" font-size="8" font-weight="bold">УР. ${actualLvl}/${MAX_BARREL_LEVEL}</text>
    </svg>
  `;
}

/* ---------- ГЛАВНАЯ ФЛАГМАНСКАЯ КАРТОЧКА «БОЧКА · ЗАКРЫТЫЙ ПОКАЗ» ---------- */
export function renderBarrelPremiereCard() {
  const mounts = [$('barrelCardHeroMount'), $('barrelCardFriendsMount')].filter(Boolean);
  if (!mounts.length) return;

  const lvl = barrelCardLevel();
  const activeEvo = previewBarrelTier
    ? (BARREL_EVOLUTIONS.find((e) => e.tier === previewBarrelTier) || getBarrelEvolutionByLevel(lvl))
    : getBarrelEvolutionByLevel(lvl);
  const currentUnlockedTier = Math.min(7, lvl);
  const ch = barrelPremiereChances();
  const refsCount = ch.friendsCount;
  const ptsLvl = ch.ptsLvl;
  const canBuyPts = ch.canBuyPts;
  const cost = barrelCardUpgradeCost();
  const canBuy = canBuyPts && S.balance >= cost;
  const tickets = ch.tickets;
  const chanceMult = ch.mult;
  const incomePerHour = ch.incomePerHour;
  const speedRating = ch.speedRating;
  const pct = Math.min(100, Math.max(4, Math.round((lvl / MAX_BARREL_LEVEL) * 100)));

  const friendsRankLabel = lvl >= 100
    ? '👑 ЛЕГЕНДА БОЧКИ (100–200 УР.)'
    : lvl >= 50
      ? '🌊 МАСТЕР МОРЯ (50–99 УР.)'
      : lvl >= 20
        ? '🔥 ЭЛИТА БРАТСТВА (20–49 УР.)'
        : lvl >= 8
          ? '🤝 ЛИГА ДРУЗЕЙ (8–19 УР.)'
          : '🛠️ БАЗОВЫЕ УРОВНИ (1–7 УР.)';

  const tiersHtml = BARREL_EVOLUTIONS.map((e) => {
    const isUnlocked = lvl >= e.minLvl;
    const isCurrent = activeEvo.tier === e.tier;
    const shortIcon = e.name.split(' ')[0];
    return `
      <button type="button" class="barrel-evo-chip ${isUnlocked ? 'is-unlocked' : 'is-locked'} ${isCurrent ? 'is-active' : ''}" data-evo-tier="${e.tier}" style="--evo-col:${e.accent}">
        <span>${shortIcon} Ур.${e.tier === 7 ? '7–200' : e.tier}</span>
      </button>
    `;
  }).join('');

  const ptsBtnLabel = canBuyPts
    ? `⬆️ ПРОКАЧАТЬ ЗА ОЧКИ (ДО ${MAX_BARREL_PTS_LEVEL} УР.) · ${number(cost)} ОЧКОВ`
    : `🔒 ВЫШЕ ${MAX_BARREL_PTS_LEVEL} УР. (УР. 8–${MAX_BARREL_LEVEL}) — ПРОКАЧКА ТОЛЬКО ДРУЗЬЯМИ!`;

  mounts.forEach((mount) => {
    mount.innerHTML = `
      <div class="barrel-hero-card" style="--barrel-accent:${activeEvo.accent}; --barrel-glow:${activeEvo.bgGlow}">
        <div class="barrel-hero-card__head">
          <div class="barrel-hero-card__badge">🏆 ПОБЕДИТЕЛИ ЗАКРЫТОГО ПОКАЗА: СКОРОСТЬ В РЕЙТИНГЕ + БОЧКА (ДО 200 УР.) + РОЗЫГРЫШ</div>
          <div class="barrel-hero-card__lvl">УР. ${lvl} / ${MAX_BARREL_LEVEL} · СКИН ${currentUnlockedTier}/7</div>
        </div>
        <div class="barrel-hero-card__body">
          <div class="barrel-hero-card__icon-wrap">
            <div class="barrel-hero-card__svg-box">
              ${renderBarrelEvolutionSVG(activeEvo, lvl)}
            </div>
            <div class="barrel-hero-card__skin-name">${activeEvo.name}</div>
            <div class="barrel-hero-card__tickets">⚡ СКОРОСТЬ: ${number(speedRating)} · 🎟️ ×${chanceMult} (${tickets} КУП.)</div>
          </div>
          <div class="barrel-hero-card__info">
            <div class="barrel-hero-card__title">КАРТОЧКА «БОЧКА: ДОСТУЧАТЬСЯ ДО НЕБЕС» (УР. ${lvl} ИЗ ${MAX_BARREL_LEVEL})</div>
            <div class="barrel-hero-card__skin-sub">Облик: <b>${activeEvo.name}</b> · Статус: <b style="color:${lvl >= 8 ? '#80ED99' : 'var(--gold)'}">${friendsRankLabel}</b></div>
            <p class="barrel-hero-card__desc">
              🏆 <b>КТО ПОБЕЖДАЕТ:</b> На закрытый показ с актёрами попадают <b>не только победители розыгрыша купонов</b>, но и лидеры, у которых <b>круче общая скорость в рейтинге (⚡ ${number(speedRating)} ед.) ПЛЮС выше прокачана сама БОЧКА</b>!<br>
              🔒 <b>ПРАВИЛО 200 УРОВНЕЙ БОЧКИ:</b> До <b>7-го уровня</b> бочку можно качать за очки или друзьями, а <b>выше 7-го уровня (с 8 до 200 ур.) саму бочку можно прокачать ТОЛЬКО ДРУЗЬЯМИ</b> (+1 приглашённый друг = +1 уровень бочки до 200 ур.)!
            </p>
            <div class="barrel-evo-strip">
              <span class="barrel-evo-strip__lbl">ЭВОЛЮЦИЯ БОЧКИ (СКИНЫ 1–7 + ЭЛИТА ДРУЗЕЙ 8–200 УР.):</span>
              <div class="barrel-evo-strip__row">${tiersHtml}</div>
            </div>
            <div class="barrel-hero-card__pills">
              <span class="barrel-pill" style="border-color:#FFD166;color:#FFD166">⚡ Скорость в рейтинге: <b>${number(speedRating)} ед.</b></span>
              <span class="barrel-pill" style="border-color:#80ED99;color:#80ED99">🛢️ Уровень Бочки: <b>${lvl} / ${MAX_BARREL_LEVEL}</b></span>
              <span class="barrel-pill">🤝 От друзей (8–200 ур.): <b>+${refsCount}</b></span>
              <span class="barrel-pill">💰 За очки (1–7 ур.): <b>+${ptsLvl}/${MAX_BARREL_PTS_LEVEL - 1}</b></span>
              <span class="barrel-pill">🎟️ Купонов розыгрыша: <b>${tickets} шт. (×${chanceMult})</b></span>
              <span class="barrel-pill">⏱️ Доход бочки: <b>+${number(incomePerHour)} / ч</b></span>
            </div>
            <div class="barrel-hero-card__bar" title="Прогресс уровня Бочки до 200 ур.">
              <div class="barrel-hero-card__fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
        <div class="barrel-hero-card__actions">
          <button type="button" class="btn btn--gold barrel-btn-invite">
            🤝 ПРИГЛАСИТЬ ДРУГА (+1 УР. БОЧКИ ДО 200 УР. · ❤️ ВСЕ ЖИЗНИ · +25 000)
          </button>
          <button type="button" class="btn ${canBuy ? 'btn--gold' : ''} barrel-btn-buypts" ${!canBuy ? 'disabled' : ''}>
            ${ptsBtnLabel}
          </button>
        </div>
      </div>
    `;

    mount.querySelectorAll('.barrel-evo-chip').forEach((chip) => {
      chip.onclick = () => {
        const tNum = Number(chip.getAttribute('data-evo-tier')) || 1;
        previewBarrelTier = tNum === lvl ? null : tNum;
        audio.coin(1.25);
        renderBarrelPremiereCard();
      };
    });

    const invBtn = mount.querySelector('.barrel-btn-invite');
    if (invBtn) {
      invBtn.onclick = () => {
        shareFlow();
      };
    }

    const buyBtn = mount.querySelector('.barrel-btn-buypts');
    if (buyBtn) {
      buyBtn.onclick = () => {
        const res = buyBarrelCardWithPoints();
        if (!res.ok) {
          if (res.reason === 'friends_only_above_7') {
            toast(`🔒 Выше ${MAX_BARREL_PTS_LEVEL}-го уровня (с 8 до ${MAX_BARREL_LEVEL} ур.) Бочка прокачивается ТОЛЬКО ДРУЗЬЯМИ! Пригласи друга (+1 ур. Бочки)!`);
            return;
          }
          toast(`Недостаточно очков! Для прокачки карточки «БОЧКА» (до 7 ур.) нужно ${number(res.cost)} очков.`);
          return;
        }
        previewBarrelTier = null;
        audio.barrelMelodyBeat(0, 4);
        audio.coin(2.4);
        const newEvo = getBarrelEvolutionByLevel(res.level);
        const lockNote = res.level >= MAX_BARREL_PTS_LEVEL
          ? ' · 🔓 С 8 до 200 ур. качается ТОЛЬКО ДРУЗЬЯМИ!'
          : '';
        toast(`🏆 БОЧКА ЭВОЛЮЦИОНИРОВАЛА ДО УР. ${res.level}/${MAX_BARREL_LEVEL} (${newEvo.name})! Купонов: ${res.chances}${lockNote}`);
        renderUpgrade();
        renderFriends();
        renderLeaders();
      };
    }
  });
}

/* ---------- Визуальная бонус-сцена между уровнями:
   3 бочки + Собака лает ритм (Бочка 1), Герой стучит по бочке с Тилем музыку — спрайт из папки ocean.jpg + priest.jpg кадр 7 (Бочка 2 «ТИЛЬ»), Отец с фонарём бьёт (Бочка 3) ---------- */
export function mountVisualRhythmStage(canvasEl, onBarrelTap) {
  if (!canvasEl) return { triggerBeat: () => {}, destroy: () => {} };
  const ctx = canvasEl.getContext('2d');
  const W = canvasEl.width || 500, H = canvasEl.height || 210;
  const pickNames = [...RU_BARREL_NAMES].sort(() => Math.random() - 0.5);
  const slots = [
    { idx: 0, bKey: 'igor',    ruName: pickNames[0] || 'АЛЕКСЕЙ', bx: 102, by: 192, bh: 98,  cKey: 'dog',    dog: true,  cx: 42,  cy: 186, ch: 64,  title: 'БОЧКА 1', role: '🐕 ЛАЙ',        shout: '🐕 ГАВ-РИТМ!', shake: 0, glow: 0, shoutT: 0 },
    { idx: 1, bKey: 'daniyar', ruName: 'ТИЛЬ',                    bx: 256, by: 190, bh: 104, cKey: 'priest', dog: false, cx: 196, cy: 186, ch: 112, title: 'БОЧКА «ТИЛЬ»', role: '🎵 С ТИЛЕМ', shout: '🎵 ТУК-РИТМ ♪', shake: 0, glow: 0, shoutT: 0 },
    { idx: 2, bKey: 'mark',    ruName: pickNames[1] || 'ДМИТРИЙ', bx: 424, by: 192, bh: 98,  cKey: 'father', dog: false, cx: 364, cy: 186, ch: 108, title: 'БОЧКА 3', role: '🔦 ОТЕЦ',       shout: '🔦 БАМ-БАС!',  shake: 0, glow: 0, shoutT: 0 },
  ];
  slots.forEach((s) => {
    s.actor = new Actor(s.cKey, { dog: s.dog, alpha: 1 });
    s.actor.look(1);
    s.actor.play('idle');
    s.resetT = 0;
  });

  const sparks = [];
  const notes = [];
  let pointer = null;
  let toolSwing = 0;
  let beatCounter = 0;
  let alive = true;
  let lastT = performance.now();

  const triggerBeat = (idx) => {
    const s = slots[idx];
    if (!s) return;
    s.shake = 1.0;
    s.glow = 1.0;
    s.shoutT = 0.72;
    s.resetT = 0.52;
    beatCounter++;
    if (idx === 0) {
      s.actor.play('bark');
      audio.barkRhythm(-0.55);
    } else if (idx === 1) {
      s.actor.play('action');
      audio.barrelMelodyBeat(1, beatCounter);
    } else {
      s.actor.play('action');
      audio.barrelMelodyBeat(2, beatCounter);
    }
    for (let i = 0; i < 8; i++) {
      sparks.push({
        x: s.bx + (Math.random() - 0.5) * 26,
        y: s.by - s.bh * 0.55,
        vx: (Math.random() - 0.5) * 220,
        vy: -70 - Math.random() * 160,
        life: 0.35 + Math.random() * 0.25,
      });
    }
    notes.push({
      x: s.bx + (Math.random() - 0.5) * 18,
      y: s.by - s.bh * 0.75,
      sym: ['♪', '♫', '♬'][beatCounter % 3],
      life: 0.85,
    });
  };

  const toCanvasCoords = (e) => {
    const r = canvasEl.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / (r.width || W)) * W,
      ((e.clientY - r.top) / (r.height || H)) * H,
    ];
  };

  const onMove = (e) => {
    const [x, y] = toCanvasCoords(e);
    pointer = { x, y };
  };

  const onDown = (e) => {
    const [x, y] = toCanvasCoords(e);
    pointer = { x, y };
    toolSwing = 1.0;
    /* Находим бочку или персонажа, по которому кликнул игрок */
    let best = null, bestDist = 999;
    slots.forEach((s) => {
      const d = Math.abs(x - (s.bx - 14));
      if (d < bestDist && d < 84) { bestDist = d; best = s; }
    });
    if (best && onBarrelTap) {
      onBarrelTap(best.idx);
    }
  };

  canvasEl.addEventListener('pointermove', onMove);
  canvasEl.addEventListener('pointerdown', onDown);

  const renderLoop = (now) => {
    if (!alive || !document.body.contains(canvasEl)) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    toolSwing = Math.max(0, toolSwing - dt * 4.5);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#08090B';
    ctx.fillRect(0, 0, W, H);

    /* Фон: море из «Достучаться до небес» (ocean.jpg) + стена цеха с надписью «НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ ЧТО О МОРЕ...» */
    const oc = sheets.ocean;
    if (oc) {
      ctx.globalAlpha = 0.48;
      ctx.drawImage(oc, 0, 0, Math.floor(oc.width * 0.702), Math.floor(oc.height * 0.45), 0, 0, W, 145);
      ctx.globalAlpha = 1;
    } else if (sheets.factory) {
      ctx.globalAlpha = 0.32;
      ctx.drawImage(sheets.factory, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.fillRect(85, 6, W - 170, 22);
    ctx.strokeStyle = 'rgba(212,168,67,0.45)';
    ctx.strokeRect(85, 6, W - 170, 22);
    ctx.fillStyle = '#ECE4D2';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('«НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ, ЧТО О МОРЕ…»', W / 2, 21);

    /* Пол цеха / берег */
    ctx.fillStyle = 'rgba(12,14,18,0.88)';
    ctx.fillRect(0, 144, W, H - 144);
    ctx.strokeStyle = 'rgba(212,168,67,0.28)';
    ctx.beginPath(); ctx.moveTo(0, 144); ctx.lineTo(W, 144); ctx.stroke();

    const sh = sheets.barrels;
    const ocSp = sheets.oceanSprites || sheets.ocean;
    slots.forEach((s) => {
      s.shake = Math.max(0, s.shake - dt * 3.2);
      s.glow = Math.max(0, s.glow - dt * 2.6);
      s.shoutT = Math.max(0, s.shoutT - dt);
      if (s.resetT > 0) {
        s.resetT -= dt;
        if (s.resetT <= 0) s.actor.play('idle');
      }
      s.actor.update(dt);

      /* Прожектор над бочкой и персонажем */
      const coneAlpha = 0.12 + s.glow * 0.24;
      drawCone(ctx, s.bx - 12, 0, s.bx - 12, s.by, s.glow > 0.1 ? '212,168,67' : '236,228,210', coneAlpha, 48);

      const sx = s.bx + Math.sin(now * 0.045) * 6 * s.shake;
      const sy = s.by - s.glow * 4;

      if (s.idx === 1) {
        /* Центральная сцена (Бочка 2): качающаяся бочка «ТИЛЬ» с высунутой рукой из ocean.jpg + святой отец (без куска деревянной бочки!), стучащий рукой прямо по бочке «ТИЛЬ» */
        drawShadow(ctx, s.cx + 2, s.cy, 34);
        if (ocSp) {
          const [ox, oy, ow, oh] = oceanRect(ocSp, 'barrelHand');
          const bDrawH = 66;
          const bDrawW = bDrawH * (ow / oh);
          ctx.save();
          ctx.translate(sx + 18, sy - 34);
          ctx.rotate(Math.sin(now * 0.004) * 0.05 + Math.sin(now * 0.05) * 0.09 * s.shake);
          ctx.drawImage(ocSp, ox, oy, ow, oh, -bDrawW / 2, -bDrawH / 2, bDrawW, bDrawH);
          drawBarrelWrappedLabel(ctx, 4, bDrawH * 0.42, bDrawH * 0.94, 'ТИЛЬ', { wFrac: 0.62, hFrac: 0.22, sagFrac: 0.042 });
          ctx.restore();
        }
        if (sheets.priest) {
          /* Кадр 7 из priest.jpg (очищенный от деревянной бочки) в развороте к бочке «ТИЛЬ» — рука лежит и стучит прямо по бочке «ТИЛЬ»! */
          const rect7 = gridRect(sheets.priest, CHAR_FRAMES.special);
          const bounceY = s.glow > 0.1 ? Math.sin(now * 0.06) * 4 : 0;
          drawFrame(ctx, sheets.priest, rect7, s.cx + 14, s.cy + bounceY, s.ch * 1.04, true);
        } else {
          s.actor.draw(ctx, s.cx, s.cy, s.ch);
        }
      } else {
        /* Отрисовка персонажа (Овчарка Рекс / Отец с фонарём) */
        if (s.cKey === 'father') {
          const hp = s.actor.hand(s.cx, s.cy, s.ch);
          drawCone(ctx, hp.x, hp.y, s.bx, s.by - s.bh * 0.48, '236,195,120', 0.22 + s.glow * 0.2, 34);
        }
        drawShadow(ctx, s.cx, s.cy, s.ch * 0.28);
        s.actor.draw(ctx, s.cx, s.cy, s.ch);

        /* Отрисовка бочки с обтягивающей цилиндрической наклейкой имени рядом с персонажем */
        ctx.fillStyle = s.glow > 0.05 ? `rgba(212,168,67,${0.18 + s.glow * 0.35})` : 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.ellipse(s.bx, s.by + 3, 38, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        if (sh) {
          drawFrame(ctx, sh, barrelRect(sh, s.bKey), sx, sy, s.bh);
          drawBarrelWrappedLabel(ctx, sx, sy, s.bh, s.ruName);
        } else {
          drawBarrelFallback(ctx, sx, sy - s.bh / 2, s.bh * 0.6, s.bh, 'closed');
        }
      }

      if (s.glow > 0.05) {
        ctx.strokeStyle = `rgba(212,168,67,${s.glow})`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx - 36, sy - s.bh, 78, s.bh);
      }

      /* Подпись под бочкой */
      ctx.fillStyle = s.glow > 0.1 ? '#D4A843' : '#ECE4D2';
      ctx.font = 'bold 10px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(`${s.role} · ${s.title}`, s.bx - 8, H - 5);

      /* Облачко звука («ГАВ-РИТМ!», «🎵 ТУК-РИТМ ♪», «БАМ-БАС!») */
      if (s.shoutT > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.shoutT * 2.2);
        const by = Math.max(46, s.cy - s.ch - 6);
        ctx.fillStyle = 'rgba(8,9,11,0.92)';
        ctx.strokeStyle = '#D4A843';
        ctx.lineWidth = 1.5;
        ctx.fillRect(s.cx - 44, by - 18, 88, 20);
        ctx.strokeRect(s.cx - 44, by - 18, 88, 20);
        ctx.fillStyle = '#D4A843';
        ctx.font = 'bold 10px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(s.shout, s.cx, by - 4);
        ctx.restore();
      }
    });

    /* Всплывающие музыкальные ноты (♪ ♫ ♬) при стуке по бочке с Тилем */
    for (let i = notes.length - 1; i >= 0; i--) {
      const nt = notes[i];
      nt.life -= dt;
      if (nt.life <= 0) { notes.splice(i, 1); continue; }
      nt.y -= 36 * dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, nt.life * 2);
      ctx.fillStyle = '#D4A843';
      ctx.font = 'bold 18px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(nt.sym, nt.x, nt.y);
      ctx.restore();
    }

    /* Искры при ударе по бочке */
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.life -= dt;
      if (sp.life <= 0) { sparks.splice(i, 1); continue; }
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 420 * dt;
      ctx.fillStyle = '#D4A843';
      ctx.fillRect(sp.x, sp.y, 3.5, 3.5);
    }

    if (pointer) {
      drawToolCursor(ctx, pointer.x + 8, pointer.y + 4, S.toolLevel || 1, toolSwing, 0.9, false);
    }

    requestAnimationFrame(renderLoop);
  };
  requestAnimationFrame(renderLoop);

  return {
    triggerBeat,
    destroy: () => {
      alive = false;
      canvasEl.removeEventListener('pointermove', onMove);
      canvasEl.removeEventListener('pointerdown', onDown);
    },
  };
}

/* ---------- Дневной ритм-шифр ---------- */
let cipherShowing = false;
let cipherStage = null;
function ensureCipherStage() {
  const cEl = $('cipherCanvas');
  if (!cEl || cipherStage) return;
  cipherStage = mountVisualRhythmStage(cEl, (idx) => {
    const btns = document.querySelectorAll('#cipherBarrels .cipher-barrel');
    if (btns[idx]) btns[idx].click();
  });
}

function playCipherDemo() {
  if (cipherShowing) return;
  const c = startCipher();
  if (!c) { toast(t('comboDone')); return; }
  const padBox = $('cipherPad');
  if (!padBox) return;
  padBox.classList.remove('is-hidden');
  ensureCipherStage();
  cipherShowing = true;
  const pattern = getCipherPattern();
  const btns = padBox.querySelectorAll('.cipher-barrel');
  if ($('cipherHintTxt')) $('cipherHintTxt').textContent = t('cipherHint');

  pattern.sequence.forEach((bIdx, i) => {
    const delay = pattern.beats[i] + 250;
    setTimeout(() => {
      const btn = btns[bIdx];
      if (btn) {
        btn.classList.add('is-cue');
        setTimeout(() => btn.classList.remove('is-cue'), 260);
      }
      if (cipherStage) cipherStage.triggerBeat(bIdx);
      else audio.knockTone(bIdx, 0.9);
    }, delay);
  });

  const totalWait = (pattern.beats[pattern.beats.length - 1] || 2100) + 600;
  setTimeout(() => { cipherShowing = false; }, totalWait);
}

/* ---------- ДОСЬЕ И СЕКРЕТНЫЙ АРХИВ ---------- */
const CAST = [
  ['priest', 'castPriest', 'Тиль Швайгер'], ['father', 'castFather', 'Филипп Рейнхардт'], ['boy', 'castBoy', 'Нэйтан Пол-Коллис'],
  ['capguy', 'castCap', 'Ола Кейру'], ['girl', 'castGirl', 'Ирина Кобзева'], ['dog', 'castDog', 'Рекс'],
];
function renderCast() {
  const box = $('cast'); if (!box) return;
  box.innerHTML = '';
  CAST.forEach(([k, label, actor], i) => {
    const d = document.createElement('div'); d.className = 'dossier';
    d.appendChild(charCanvas(k, k === 'dog' ? DOG_FRAMES.idle : CHAR_FRAMES.idle));
    d.insertAdjacentHTML('beforeend', `<div class="dossier__role">${t('role')} / ${pad(i + 1)}</div><div class="dossier__name">${t(label)}</div><div class="dossier__actor">${actor}</div>`);
    box.appendChild(d);
  });
}

function renderArchive() {
  const box = $('archive'); if (!box) return;
  const items = [
    { title: t('arcPoster'), ok: true, lock: t('lockPoints', { n: number(2000) }), imgSrc: 'photo_2026-11-08_00-00-26.jpg' },
    { title: t('arcConcept'), ok: S.total >= 10000, lock: t('lockPoints', { n: number(10000) }), canvas: barrelCanvas('igor') },
    { title: t('arcChurch'), ok: S.total >= 50000, lock: t('lockPoints', { n: number(50000) }), img: sheets.church },
    { title: t('arcBts'), ok: S.total >= 250000, lock: t('lockPoints', { n: number(250000) }), note: t('btsNote') },
    { title: t('arcSecret'), ok: S.bestNight > 0, lock: t('lockNight'), note: t('secretNote') },
    { title: t('arcStreak'), ok: true, lock: t('lockStreak'), imgSrc: 'photo_2026-11-08_00-00-14.jpg' },
  ];
  box.innerHTML = '';
  items.forEach((it) => {
    const d = document.createElement('div'); d.className = 'arch' + (it.ok ? '' : ' is-locked'); d.dataset.lock = it.lock;
    if (it.ok) {
      if (it.img) { const im = document.createElement('img'); im.src = it.img.src; d.appendChild(im); }
      else if (it.imgSrc) { const im = document.createElement('img'); im.src = it.imgSrc; d.appendChild(im); }
      if (it.canvas) d.appendChild(it.canvas);
      if (it.note) d.insertAdjacentHTML('beforeend', `<div class="vcircle">${it.note}</div>`);
    } else d.insertAdjacentHTML('beforeend', '<div class="vcircle">×</div>');
    d.insertAdjacentHTML('beforeend', `<h4>${it.title}</h4>`);
    box.appendChild(d);
  });
}

export function refLink() {
  if (CONFIG.telegramBotUsername && CONFIG.telegramAppName) {
    return `https://t.me/${CONFIG.telegramBotUsername}/${CONFIG.telegramAppName}?startapp=ref_${S.refCode}`;
  }
  const base = safeUrl(CONFIG.publicGameUrl) || (location.href.split('?')[0].split('#')[0]);
  return base + '?ref=' + S.refCode;
}

export function renderFriends() {
  renderBarrelPremiereCard();
  if (!$('refLink')) return;
  $('refLink').textContent = refLink();
  $('refCount').textContent = `${S.refs.length} (Бочка: Ур. ${barrelCardLevel()}/${MAX_BARREL_LEVEL})`;
  $('refList').innerHTML = S.refs.length
    ? S.refs.map((r, idx) => `<li>▸ ${r.name} · +25 000 · 🛢️ +1 УР. БОЧКИ (УР. ${Math.min(MAX_BARREL_LEVEL, 1 + Math.min(6, S.barrelCardPtsLvl || 0) + idx + 1)}/${MAX_BARREL_LEVEL}) · ❤️ ВСЕ ЖИЗНИ${r.commission ? ` (+${number(r.commission)})` : ''}</li>`).join('')
    : `<li>· Приглашай друзей: с 8 до 200 уровня Бочка качается ТОЛЬКО друзьями (+1 друг = +1 ур. Бочки)! ·</li>`;
}

const BOTS = [
  { n: 'Igor_R',      basePts: 42000,  bLvl: 4,  spd: 3100 },
  { n: 'anna.k',      basePts: 88000,  bLvl: 6,  spd: 4800 },
  { n: 'Daniyar',     basePts: 135000, bLvl: 9,  spd: 6900 },
  { n: 'MarkTV',      basePts: 190000, bLvl: 12, spd: 8900 },
  { n: 'oleg_88',     basePts: 245000, bLvl: 15, spd: 11200 },
  { n: 'Artur_Z',     basePts: 310000, bLvl: 19, spd: 13800 },
  { n: 'prank_queen', basePts: 385000, bLvl: 24, spd: 16900 },
  { n: 'knock_knock', basePts: 470000, bLvl: 31, spd: 20400 },
  { n: 'sector3',     basePts: 560000, bLvl: 38, spd: 24500 },
];
let leaderPeriod = 'all';
function renderLeaders() {
  const ol = $('leaders'); if (!ol) return;
  let rows;
  const myScore = leaderPeriod === 'week'
    ? (S.weekEarned ?? S.total)
    : leaderPeriod === 'month'
      ? (S.monthEarned ?? S.total)
      : S.total;
  const myBarrelLvl = barrelCardLevel();
  const mySpeed = playerSpeedRating();
  if (net.online && Array.isArray(net.leaders) && net.leaders.length > 0) {
    rows = net.leaders.map((r) => ({
      n: r.n,
      s: r.s,
      bLvl: r.bLvl || Math.min(MAX_BARREL_LEVEL, Math.max(1, Math.floor(r.s / 25000) + 1)),
      spd: r.spd || Math.round(r.s * 0.045 + 1800),
      me: r.me,
    }));
    if (!rows.some((r) => r.me)) {
      rows.push({ n: t('you') + ' · ' + league()[lang], s: myScore, bLvl: myBarrelLvl, spd: mySpeed, me: true });
    }
  } else {
    const day = Math.floor(Date.now() / 86400000);
    const mult = leaderPeriod === 'week' ? 0.25 : leaderPeriod === 'month' ? 0.6 : 1;
    rows = BOTS.map((bot, i) => ({
      n: bot.n,
      s: Math.floor(bot.basePts * mult * (1 + ((day * (i + 3)) % 7) / 10)),
      bLvl: bot.bLvl,
      spd: Math.round(bot.spd * (0.7 + mult * 0.3)),
      me: false,
    }));
    rows.push({ n: t('you') + ' · ' + league()[lang], s: myScore, bLvl: myBarrelLvl, spd: mySpeed, me: true });
  }
  /* Сортировка лидеров: учитывается общая скорость в рейтинге + уровень прокачки Бочки (до 200 ур. за друзей) + очки */
  const calcRankPower = (r) => (r.s || 0) + (r.spd || 0) * 14 + (r.bLvl || 1) * 12000;
  rows.sort((a, b) => calcRankPower(b) - calcRankPower(a));
  ol.innerHTML = rows.slice(0, 10).map((r, i) => {
    const friendBadge = r.bLvl > 7 ? '🤝' : '🛢️';
    return `<li class="${r.me ? 'is-me' : ''}">
      <span>${pad(i + 1)} · ${r.n}</span>
      <span style="display:inline-flex;gap:8px;align-items:center;font-size:11px">
        <b style="color:#80ED99" title="Уровень карточки БОЧКА (с 8 до 200 ур. — только друзьями)">${friendBadge} УР.${r.bLvl}/${MAX_BARREL_LEVEL}</b>
        <b style="color:#FFD166" title="Общая скорость в рейтинге">⚡ ${number(r.spd)}</b>
        <span>🏆 ${number(r.s)}</span>
      </span>
    </li>`;
  }).join('');
}

/* ---------- Жуткий меняющийся скример с постерами всех актёров и бинауральными криками ---------- */
let screamerVariantCursor = 0;
let screamerRafId = 0;
let screamerTimerId = 0;

const SCREAMER_CAST = [
  /* 0: Ирина Кобзева — Девушка / Свидетель (пронзительный женский истерический визг) */
  {
    screamIdx: 0,
    posterKey: 'posterGirl',
    /* Центр лица на постере 194x259 и размер квадратного кадра (в долях ширины постера), без растяжения */
    center: [0.50, 0.34],
    boxWFrac: 0.82,
    role: '👁️ ИРИНА КОБЗЕВА · СВИДЕТЕЛЬ ЦЕХА',
    cry: '«НЕ ОТКРЫВАЙ БОЧКУ! ОН СМОТРИТ ОТТУДА!»',
  },
  /* 1: Филипп Рейнхардт — Отец / Надсмотрщик (яростный мужской рёв в упор) */
  {
    screamIdx: 1,
    posterKey: 'posterFather',
    center: [0.49, 0.33],
    boxWFrac: 0.82,
    role: '🔦 ФИЛИПП РЕЙНХАРДТ · НАДСМОТРЩИК',
    cry: '«КТО СТУЧАЛ?! ЗАВАРИТЬ КРЫШКУ НАМЕРТВО!»',
  },
  /* 2: Тиль Швайгер — Священник / Пастор (демонический многоголосый вопль) */
  {
    screamIdx: 2,
    posterKey: 'posterPriest',
    center: [0.43, 0.25],
    boxWFrac: 0.82,
    role: '✝️ ТИЛЬ ШВАЙГЕР · ТЫ УЗНАЕШЬ, КТО КОМУ ЛЖЁТ',
    cry: '«НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ, ЧТО О СМЕРТИ!»',
  },
  /* 3: Нэйтан Пол-Коллис — Узник бочки (вопль задыхающегося узника и скрежет ногтей) */
  {
    screamIdx: 3,
    posterKey: 'posterBoy',
    center: [0.51, 0.34],
    boxWFrac: 0.82,
    role: '⛓️ НЭЙТАН ПОЛ-КОЛЛИС · УЗНИК БОЧКИ №4',
    cry: '«ВЫПУСТИ МЕНЯ! ЗДЕСЬ КОНЧИЛСЯ ВОЗДУХ!»',
  },
  /* 4: Тиль Швайгер и рука узника из бочки (внезапный бинауральный крик из темноты) */
  {
    screamIdx: 4,
    posterKey: 'posterPriestHand',
    center: [0.49, 0.37],
    boxWFrac: 0.84,
    role: '🕯️ ПАСТОР · РУКА ИЗ ЗАВАРЕННОЙ БОЧКИ',
    cry: '«НЕ ОБОРАЧИВАЙСЯ! ТЫ УЖЕ ВНУТРИ!»',
  },
  /* 5: Жуткий глаз узника в горловине бочки крупным планом (клаустрофобный визг из бочки) */
  {
    screamIdx: 5,
    posterKey: 'posterBarrelEye',
    center: [0.665, 0.385],
    boxWFrac: 0.38,
    role: '🕳️ ГОРЛОВИНА БОЧКИ · ВЗГЛЯД ИЗНУТРИ',
    cry: '«ОН ДЫШИТ ЧЕРЕЗ ОТВЕРСТИЕ В КРЫШКЕ!»',
  },
];

/* Вычисляет строго квадратный срез (1:1 в пикселях без искажения пропорций лица) вокруг заданного центра */
function getSquarePosterCrop(img, center, boxWFrac) {
  const iw = img.naturalWidth || img.width || 300;
  const ih = img.naturalHeight || img.height || 300;
  const side = Math.min(iw, ih, Math.round(iw * (boxWFrac || 0.8)));
  const cx = center[0] * iw;
  const cy = center[1] * ih;
  const sx = Math.max(0, Math.min(iw - side, Math.round(cx - side * 0.5)));
  const sy = Math.max(0, Math.min(ih - side, Math.round(cy - side * 0.5)));
  return [sx, sy, side, side];
}

export function showScreamer(text, cb) {
  const box = $('screamer'), c = $('screamerCanvas');
  if (!box || !c) { cb && cb(); return; }

  cancelAnimationFrame(screamerRafId);
  clearTimeout(screamerTimerId);

  const profile = SCREAMER_CAST[screamerVariantCursor % SCREAMER_CAST.length];
  screamerVariantCursor++;

  const W = c.width || 640, H = c.height || 640;
  const ctx = c.getContext('2d');

  if ($('screamerRole')) $('screamerRole').textContent = profile.role;
  if ($('screamerTxt')) $('screamerTxt').textContent = `${text || 'ПОПАЛСЯ!'} · ${profile.cry}`;

  box.classList.remove('is-hidden');
  audio.scream(profile.screamIdx);

  const startAt = performance.now();
  const totalMs = 1520;

  const renderFrame = (now) => {
    const elapsed = (now - startAt) / 1000;
    if (elapsed * 1000 >= totalMs || box.classList.contains('is-hidden')) return;

    const frameIdx = Math.floor(elapsed * 60);
    const isInvertStrobe = (frameIdx === 4 || frameIdx === 24 || frameIdx === 52);
    const isBloodStrobe = !isInvertStrobe && (frameIdx % 6 === 0);
    /* Короткая подсознательная вспышка глаза из горловины бочки со своим собственным точным кадрированием */
    const isEyeFlash = profile.posterKey !== 'posterBarrelEye' && (frameIdx === 17 || frameIdx === 43);

    const activeImg = isEyeFlash
      ? (sheets.posterBarrelEye || sheets[profile.posterKey])
      : sheets[profile.posterKey];
    const activeCenter = isEyeFlash ? [0.665, 0.385] : profile.center;
    const activeBoxW = isEyeFlash ? 0.38 : profile.boxWFrac;

    ctx.save();
    ctx.fillStyle = '#040203';
    ctx.fillRect(0, 0, W, H);

    /* 1. Резкий наезд (lunge zoom) и мелкая конвульсивная вибрация всего портрета целиком
          (никаких отдельных накладных кругов или вырезанных кусков челюсти — всё монолитно с лицом!) */
    const pulse = Math.sin(elapsed * 44) * 0.018;
    const lunge = 1.03 + Math.min(0.26, elapsed * 0.58) + pulse;
    const jx = (Math.random() - 0.5) * 14;
    const jy = (Math.random() - 0.5) * 12;
    const rot = (Math.random() - 0.5) * 0.032;

    ctx.save();
    ctx.translate(W * 0.5 + jx, H * 0.5 + jy);
    ctx.rotate(rot);
    ctx.scale(lunge, lunge);

    if (activeImg) {
      const [sx, sy, sw, sh] = getSquarePosterCrop(activeImg, activeCenter, activeBoxW);

      /* Базовый слой лица с жёсткой хоррор-цветокоррекцией */
      if (typeof ctx.filter === 'string') {
        if (isInvertStrobe) {
          ctx.filter = 'invert(92%) contrast(185%) saturate(110%)';
        } else if (isBloodStrobe) {
          ctx.filter = 'contrast(185%) sepia(72%) hue-rotate(-50deg) saturate(320%) brightness(88%)';
        } else {
          ctx.filter = 'contrast(165%) saturate(32%) brightness(92%)';
        }
      }
      ctx.drawImage(activeImg, sx, sy, sw, sh, -W * 0.5, -H * 0.5, W, H);

      /* Внутреннее проваливание настоящих глазниц и мимических теней самого актёра через multiply
         (совпадает с лицом пиксель-в-пиксель, никогда не сползает и не выглядит наклеенным!) */
      if (!isInvertStrobe) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = isBloodStrobe ? 0.62 : 0.46;
        ctx.drawImage(activeImg, sx, sy, sw, sh, -W * 0.5, -H * 0.5, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      /* Тонкое оптическое двоение контура при крике (сдвиг всего 4–6px, чтобы лицо не разваливалось) */
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22;
      if (typeof ctx.filter === 'string') {
        ctx.filter = 'contrast(190%) sepia(100%) hue-rotate(-50deg) saturate(400%)';
      }
      const echoShift = (frameIdx % 2 === 0 ? 1 : -1) * 5;
      ctx.drawImage(activeImg, sx, sy, sw, sh, -W * 0.5 + echoShift, -H * 0.5, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (typeof ctx.filter === 'string') ctx.filter = 'none';
    }

    ctx.restore();

    /* 2. Глубокая кроваво-чёрная виньетка и зернистые царапины плёнки по краям кадра */
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.26, W * 0.5, H * 0.5, W * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.68, isBloodStrobe ? 'rgba(95, 4, 8, 0.48)' : 'rgba(42, 2, 5, 0.36)');
    vig.addColorStop(1, 'rgba(3, 0, 1, 0.96)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    /* Вертикальные царапины старой киноплёнки */
    ctx.strokeStyle = isBloodStrobe ? 'rgba(255, 45, 45, 0.22)' : 'rgba(236, 228, 210, 0.12)';
    ctx.lineWidth = 1.2;
    for (let s = 0; s < 3; s++) {
      const lx = ((frameIdx * 97 + s * 211) % W);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx + (Math.random() - 0.5) * 6, H);
      ctx.stroke();
    }

    ctx.restore();

    screamerRafId = requestAnimationFrame(renderFrame);
  };

  screamerRafId = requestAnimationFrame(renderFrame);

  screamerTimerId = setTimeout(() => {
    cancelAnimationFrame(screamerRafId);
    box.classList.add('is-hidden');
    if (cb) cb();
  }, totalMs);
}

/* ---------- Межуровневый экран: Победа + Визуальная бонус-сцена (3 бочки + Собака лает ритм, Тиль стучит, Отец бьёт) + Видеокружок + кнопка «Продолжить» ---------- */
let echoTimers = [];
let activeEchoStage = null;
function clearEchoTimers() {
  echoTimers.forEach((id) => clearTimeout(id));
  echoTimers = [];
  if (activeEchoStage) {
    activeEchoStage.destroy();
    activeEchoStage = null;
  }
}

export function crewVideo(level, cb, opts = {}) {
  clearEchoTimers();
  const n = Math.min(Math.max(1, level), 3);
  const key = level === 1 ? 'videoP' : level === 2 ? 'videoD' : 'videoA';
  const mediaItem = MEDIA['crew' + n];
  const explicitUrl = safeUrl(mediaItem?.url || '');
  const fallbackAsset = safeUrl(mediaItem?.fallbackAsset || `assets/crew${n}.mp4`);
  const candidate = explicitUrl || fallbackAsset;

  const points = opts.points || 0;
  const nextLvl = level + 1;
  const bonus = 1500 * Math.max(1, level);
  const patternLen = Math.min(5, 2 + Math.max(1, level));
  /* Генерируем ритм-последовательность ударов по 3 бочкам (0: Овчарка лает, 1: Тиль стучит, 2: Отец бьёт) */
  const seq = [];
  for (let i = 0; i < patternLen; i++) {
    seq.push((level + i * 2 + (i % 2)) % 3);
  }
  let userStep = 0;
  let playingDemo = false;
  let echoCompleted = false;

  const dotsHtml = seq.map((_, i) => `<span class="echo-dot" data-edot="${i}"></span>`).join('');
  const unlockHtml = level === 6
    ? `<p style="color:var(--gold);margin-top:6px"><b>🌊 Открыт предфинальный уровень 07: «ДОСТУЧАТЬСЯ ДО НЕБЕС» (ТИЛЬ)</b></p>`
    : (S.nightUnlocked && level === 7)
      ? `<p style="color:var(--gold);margin-top:6px"><b>${t('unlockNight')}</b></p>`
      : '';

  /* Видео от режиссёра (hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4) показывается сразу после 1-го уровня и перед секретным уровнем! */
  const showDirectorSpecial = level === 1 || level >= 6;
  const directorVideoHtml = showDirectorSpecial
    ? `<div class="director-special-box" style="margin:4px 0 6px;border:1px solid var(--gold);background:rgba(10,12,16,0.95);padding:6px">
        <div style="font-family:var(--font-mono);font-size:9.5px;color:var(--gold);letter-spacing:0.1em;margin-bottom:4px">
          🎬 ${level === 1 ? 'ЭКСКЛЮЗИВ ПОСЛЕ 1-ГО УРОВНЯ: ОБРАЩЕНИЕ РЕЖИССЁРА' : 'ЭКСКЛЮЗИВ ПЕРЕД СЕКРЕТНЫМ УРОВНЕМ: ВИДЕО ОТ РЕЖИССЁРА'}
        </div>
        <video src="hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4" autoplay playsinline controls style="width:100%;max-height:118px;display:block;background:#000;object-fit:cover"></video>
      </div>`
    : '';

  const continueLabel = t('continueLvl', { n: pad(nextLvl) });

  const bodyHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px">
      <span style="color:var(--gold);font-family:var(--font-mono);font-size:12px;font-weight:700">
        ${points > 0 ? t('wonText', { n: number(points) }) : ''}
      </span>
      <button type="button" class="btn btn--gold js-echo-next-btn" id="btnEchoTopNext" style="font-size:10.5px;padding:7px 14px;font-weight:700">
        ${continueLabel}
      </button>
    </div>
    ${unlockHtml}
    <div class="echo-box" id="echoBox">
      <div class="echo-box__title">${t('echoTitle')}</div>
      <div class="echo-box__sub">${t('echoSub', { b: number(bonus) })}</div>
      <canvas class="rhythm-stage-canvas" id="echoCanvas" width="500" height="210"></canvas>
      <div class="echo-dots" id="echoDots">${dotsHtml}</div>
      <div class="echo-status" id="echoStatus">${t('echoPlaying')}</div>
      <div class="echo-barrels" id="echoBarrels">
        <button type="button" class="btn echo-barrel" data-eb="0">${t('barrelLow')}</button>
        <button type="button" class="btn echo-barrel" data-eb="1">${t('barrelMid')}</button>
        <button type="button" class="btn echo-barrel" data-eb="2">${t('barrelHigh')}</button>
      </div>
      <div class="echo-actions-row">
        <button type="button" class="btn echo-replay" id="btnEchoReplay">${t('echoReplay')}</button>
        <button type="button" class="btn btn--gold js-echo-next-btn" id="btnEchoMidNext" style="font-size:10.5px;padding:7px 14px;font-weight:700">
          ${continueLabel}
        </button>
      </div>
    </div>
    ${directorVideoHtml}
    <div class="crew-mini">
      <div class="vcircle vcircle--sm" id="crewCircle">▶ ${t('crewNote', { n })}</div>
      <p style="font-size:11.5px;margin:2px 0 0">${t(key)}</p>
    </div>
  `;

  const advanceToNextLevel = () => {
    clearEchoTimers();
    closeModal();
    if (cb) cb();
  };

  const actions = [
    {
      label: continueLabel,
      fn: () => {
        clearEchoTimers();
        if (cb) cb();
      },
    },
  ];
  if (opts.onNight) {
    actions.push({
      label: t('modeNight'),
      ghost: true,
      fn: () => {
        clearEchoTimers();
        opts.onNight();
      },
    });
  }

  modal(`${t('levelDone')} · ${pad(level)}`, bodyHtml, actions, { backdropClose: false });

  document.querySelectorAll('.js-echo-next-btn').forEach((btn) => {
    btn.onclick = () => advanceToNextLevel();
  });

  const updateDots = () => {
    document.querySelectorAll('#echoDots .echo-dot').forEach((d, idx) => {
      d.classList.toggle('is-on', idx < userStep || echoCompleted);
    });
  };

  const handlePlayerBarrelHit = (idx) => {
    const btns = document.querySelectorAll('#echoBarrels .echo-barrel');
    const btn = btns[idx];
    if (btn) {
      btn.classList.add('is-cue');
      setTimeout(() => btn.classList.remove('is-cue'), 200);
    }
    if (activeEchoStage) activeEchoStage.triggerBeat(idx);
    else audio.knockTone(idx, 1.0);

    if (playingDemo || echoCompleted) return;
    if (idx === seq[userStep]) {
      userStep++;
      updateDots();
      const stEl = $('echoStatus');
      if (userStep >= seq.length) {
        echoCompleted = true;
        addPoints(bonus);
        save();
        audio.coin(2.2);
        if (stEl) {
          stEl.textContent = t('echoWon', { b: number(bonus) });
          stEl.style.color = 'var(--gold)';
        }
        document.querySelectorAll('.js-echo-next-btn, #modalActions .btn--gold').forEach((b) => {
          b.style.borderColor = '#5EEAD4';
          b.style.boxShadow = '0 0 22px rgba(94, 234, 212, 0.55)';
        });
        renderUpgrade();
        renderArchive();
        renderLeaders();
      } else if (stEl) {
        stEl.textContent = t('echoYourTurn', { c: userStep, t: seq.length });
        stEl.style.color = 'var(--chalk)';
      }
    } else {
      userStep = 0;
      updateDots();
      const stEl = $('echoStatus');
      if (stEl) {
        stEl.textContent = t('echoFail');
        stEl.style.color = '#E3B4B4';
      }
      const retryTid = setTimeout(() => playEchoSequence(), 750);
      echoTimers.push(retryTid);
    }
  };

  activeEchoStage = mountVisualRhythmStage($('echoCanvas'), (idx) => {
    handlePlayerBarrelHit(idx);
  });

  const playEchoSequence = () => {
    if (echoCompleted || !modalOpen()) return;
    echoTimers.forEach((id) => clearTimeout(id));
    echoTimers = [];
    playingDemo = true;
    userStep = 0;
    updateDots();
    const stEl = $('echoStatus');
    if (stEl) {
      stEl.textContent = t('echoPlaying');
      stEl.style.color = 'var(--gold)';
    }
    const btns = document.querySelectorAll('#echoBarrels .echo-barrel');
    seq.forEach((bIdx, i) => {
      const tid = setTimeout(() => {
        if (!modalOpen()) return;
        if (activeEchoStage) activeEchoStage.triggerBeat(bIdx);
        else audio.knockTone(bIdx, 1.0);
        const btn = btns[bIdx];
        if (btn) {
          btn.classList.add('is-cue');
          setTimeout(() => btn.classList.remove('is-cue'), 280);
        }
        const dot = document.querySelector(`#echoDots [data-edot="${i}"]`);
        if (dot) {
          dot.classList.add('is-cue');
          setTimeout(() => dot.classList.remove('is-cue'), 280);
        }
      }, 320 + i * 560);
      echoTimers.push(tid);
    });
    const endTid = setTimeout(() => {
      playingDemo = false;
      const s = $('echoStatus');
      if (s && !echoCompleted) {
        s.textContent = t('echoYourTurn', { c: 0, t: seq.length });
        s.style.color = 'var(--chalk)';
      }
    }, 360 + seq.length * 560);
    echoTimers.push(endTid);
  };

  const replayBtn = $('btnEchoReplay');
  if (replayBtn) {
    replayBtn.onclick = () => {
      if (echoCompleted) return;
      playEchoSequence();
    };
  }

  document.querySelectorAll('#echoBarrels .echo-barrel').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.eb);
      handlePlayerBarrelHit(idx);
    };
  });

  const initTid = setTimeout(() => playEchoSequence(), 380);
  echoTimers.push(initTid);

  if (!candidate) return;

  const mountVideo = (src) => {
    const circle = $('crewCircle');
    if (!circle) return;
    const v = document.createElement('video');
    v.src = src;
    v.autoplay = true;
    v.playsInline = true;
    v.controls = true;
    v.onerror = () => { v.remove(); };
    circle.innerHTML = '';
    circle.appendChild(v);
  };

  if (explicitUrl) {
    mountVideo(explicitUrl);
  } else {
    fetch(candidate, { method: 'HEAD' })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        if (res.ok && (ct.includes('video') || ct.includes('mp4') || ct.includes('octet-stream'))) {
          mountVideo(candidate);
        }
      })
      .catch(() => { /* keep text placeholder */ });
  }
}

/* ---------- survey ---------- */
function surveyModal() {
  const v = S.survey || {};
  modal(
    t('survey'),
    `<p>${t('surveyText')}</p><input id="svName" placeholder="${t('surveyName')}" value="${v.name || ''}"><input id="svCity" placeholder="${t('surveyCity')}" value="${v.city || ''}"><input id="svPhone" placeholder="${t('surveyPhone')}" value="${v.phone || ''}"><input id="svTg" placeholder="${t('surveyTg')}" value="${v.tg || ''}">`,
    [
      {
        label: t('send'),
        fn: async () => {
          const payload = {
            name: $('svName').value,
            city: $('svCity').value,
            phone: $('svPhone').value,
            telegram: $('svTg').value,
            tg: $('svTg').value,
            consent: true,
            ts: Date.now(),
          };
          S.survey = payload;
          save();
          if (net.online && CONFIG.contestEnabled) {
            await syncSaveProfile(payload);
          }
          toast(t('surveyDone'));
        },
      },
      { label: t('close'), ghost: true },
    ]
  );
}

/* ---------- Мульти-мессенджер приглашения (Telegram, WhatsApp, Instagram, MAX, Threads, TikTok, VK) ---------- */
export const MESSENGERS = [
  { id: 'tg',      label: '✈️ Telegram' },
  { id: 'wa',      label: '💬 WhatsApp' },
  { id: 'ig',      label: '📸 Instagram' },
  { id: 'max',     label: '🟣 MAX (Макс)' },
  { id: 'threads', label: '🧵 Threads' },
  { id: 'tiktok',  label: '🎵 TikTok' },
  { id: 'vk',      label: '💙 VK' },
  { id: 'copy',    label: '📋 Копировать SOS' },
];

export function shareTrailerNow(ch = 'tg', onStateUpdate) {
  const url = refLink();
  const ytLink = 'https://youtu.be/EZFDcXeLTzQ?si=-NIU0mFyayaYjHnf';
  const kpLink = 'https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D';
  const trailerText = `🎬 СМОТРИ ОФИЦИАЛЬНЫЙ ТРЕЙЛЕР ТРИЛЛЕРА «БОЧКА: Достучаться до небес» (в ролях Тиль Швайгер, Филипп Рейнхардт): ${ytLink} · Кинопоиск: ${kpLink} · Заходи в игру-испытание (дадут бонус и шанс на ЗАКРЫТЫЙ ПОКАЗ): ${url}`;
  navigator.clipboard?.writeText(trailerText).catch(() => {});

  if (ch === 'tg') {
    const tgShareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('🎬 Смотри официальный трейлер триллера «БОЧКА: Достучаться до небес» (Тиль Швайгер, Филипп Рейнхардт) и попробуй выбраться из цеха!');
    if (window.Telegram?.WebApp?.openTelegramLink) {
      try { window.Telegram.WebApp.openTelegramLink(tgShareUrl); } catch { window.open(tgShareUrl, '_blank'); }
    } else {
      window.open(tgShareUrl, '_blank');
    }
  } else if (ch === 'wa') {
    window.open('https://wa.me/?text=' + encodeURIComponent(trailerText), '_blank');
  } else if (ch === 'vk') {
    window.open('https://vk.com/share.php?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(trailerText), '_blank');
  }

  const res = shareTrailerReward(ch);
  audio.coin(2.2);
  toast(`🎬 Трейлер отправлен (ссылка скопирована)! Получено: +1 ❤️ ЖИЗНЬ и +${number(res.points)} ОЧКОВ!`);
  renderFriends();
  renderUpgrade();
  if (onStateUpdate) onStateUpdate(res);
  return res;
}

export function shareViaMessenger(ch, onStateUpdate) {
  const url = refLink();
  const fullText = t('shareText', { url });
  const msgOnly = t('shareText', { url: '' }).trim();
  const mObj = MESSENGERS.find((m) => m.id === ch) || { id: ch, label: ch.toUpperCase() };

  /* Всегда копируем полный SOS-текст со ссылкой в буфер, чтобы можно было сразу вставить в любой чат */
  navigator.clipboard?.writeText(fullText).catch(() => {});

  if (ch === 'tg') {
    const tgShareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(msgOnly);
    if (window.Telegram?.WebApp?.openTelegramLink) {
      try { window.Telegram.WebApp.openTelegramLink(tgShareUrl); } catch { window.open(tgShareUrl, '_blank'); }
    } else {
      window.open(tgShareUrl, '_blank');
    }
  } else if (ch === 'wa') {
    window.open('https://wa.me/?text=' + encodeURIComponent(fullText), '_blank');
  } else if (ch === 'threads') {
    window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(fullText), '_blank');
  } else if (ch === 'vk') {
    window.open('https://vk.com/share.php?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(msgOnly), '_blank');
  } else if (ch === 'max') {
    window.open('https://max.ru/', '_blank');
  } else if (ch === 'ig') {
    window.open('https://www.instagram.com/', '_blank');
  } else if (ch === 'tiktok') {
    window.open('https://www.tiktok.com/', '_blank');
  }

  if (net.online) syncShareInvitation();
  const res = invitePrepared(ch);
  audio.coin(2.1);
  toast(`📲 Игра отправлена через ${mObj.label}! +1 ❤️ ЖИЗНЬ и +${number(res.points || 5000)} очков! Когда друг зайдёт — получишь ВСЕ ЖИЗНИ, +25 000 и +1 УР. БОЧКИ!`);
  renderFriends();
  renderUpgrade();
  if (onStateUpdate) onStateUpdate(res);
}

export function shareFlow(onContinue) {
  const url = refLink();
  const fullText = t('shareText', { url });

  const runPlayNow = () => {
    if (S.lives <= 0) {
      S.lives = 1;
      save();
    }
    closeModal();
    if (onContinue) {
      onContinue();
      return;
    }
    const enterBtn = $('btnEnter');
    if (enterBtn && !$('hero')?.classList.contains('is-started')) {
      enterBtn.click();
      return;
    }
    const b = window.__BAREL__;
    if (b) {
      b.renderHUD(b.hudInfo());
      if (b.tapper && !b.tapper.active && !b.night?.active) {
        b.tapper.start(S.level || 1);
      }
    }
  };

  const renderModalContent = () => {
    const used = Array.isArray(S.sharedChannels) ? S.sharedChannels : [];
    const maxL = Math.max(3, S.livesMax || 3);
    const livesSquares = Array.from({ length: maxL }, (_, i) => `<span class="sq ${i < S.lives ? 'is-on' : ''}"></span>`).join('');
    const bLvl = barrelCardLevel();
    const bTickets = barrelPremiereChances().tickets;
    const playLabel = `▶ ИГРАТЬ · УРОВЕНЬ ${pad(S.level || 1)}`;

    const btnsHtml = MESSENGERS.map((m) => {
      const done = used.includes(m.id);
      return `<button type="button" class="btn msg-pick-btn ${done ? 'is-sent' : 'btn--gold'}" data-share-ch="${m.id}">
        <span>${m.label}</span>
        <span class="msg-pick-badge">${done ? '✓ +1 ❤️' : '+1 ❤️ ЖИЗНЬ'}</span>
      </button>`;
    }).join('');

    const html = `
      <div class="share-lives-row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span>${t('lives')}:</span>
          <div class="squares">${livesSquares}</div>
          <span class="share-lives-count">${S.lives} / ${maxL} ❤️</span>
        </div>
        <button type="button" class="btn btn--gold js-share-play-now" style="font-size:11px;padding:7px 14px;font-weight:800">
          ${playLabel}
        </button>
      </div>

      <div class="crowbar-box" style="border-color:var(--gold);background:rgba(212,168,67,0.10)">
        <div class="crowbar-box__title">🎬 1. ПОДЕЛИСЬ ОФИЦИАЛЬНЫМ ТРЕЙЛЕРОМ — ПОЛУЧИ +1 ❤️ ЖИЗНЬ И +5 000 ОЧКОВ!</div>
        <div class="crowbar-box__sub">Отправь трейлер фильма «БОЧКА: Достучаться до небес» другу или в сторис — жизнь восстановится мгновенно:</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button type="button" class="btn btn--gold" style="flex:1;min-width:140px" id="btnModalShareTrailerTg">🎬 ПОДЕЛИТЬСЯ ТРЕЙЛЕРОМ (TG · +1 ❤️)</button>
          <button type="button" class="btn btn--gold" style="flex:1;min-width:140px" id="btnModalShareTrailerWa">💬 ТРЕЙЛЕР В WHATSAPP (+1 ❤️)</button>
          <button type="button" class="btn" style="flex:1;min-width:120px" id="btnModalShareTrailerCopy">📋 СКОПИРОВАТЬ ТРЕЙЛЕР (+1 ❤️)</button>
        </div>
      </div>

      <div class="crowbar-box" style="border-color:#64DFDF;background:rgba(100,223,223,0.08);margin-top:8px">
        <div class="crowbar-box__title" style="color:#64DFDF">🛢️ 2. ПОДЕЛИСЬ ИГРОЙ И КАЧАЙ КАРТОЧКУ «БОЧКА» (УР. ${bLvl} · 🎟️ ${bTickets} КУПОНОВ НА ЗАКРЫТЫЙ ПОКАЗ)</div>
        <div class="crowbar-box__sub">За репост игры — сразу <b>+1 ❤️ ЖИЗНЬ и +5 000 очков</b>. А за каждого пришедшего друга — <b>❤️ ВСЕ ЖИЗНИ, +25 000 ОЧКОВ (+10% от его тапов) и +1 УРОВЕНЬ КАРТОЧКИ «БОЧКА»</b> для выигрыша билета на ЗАКРЫТЫЙ ПОКАЗ!</div>
      </div>

      <div class="share-msg-preview">${fullText}</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--gold);margin:6px 0 4px">📲 ВЫБЕРИ МЕССЕНДЖЕР — ПОДЕЛИТЬСЯ ИГРОЙ (+1 ❤️ ЖИЗНЬ И +5 000 ОЧКОВ):</div>
      <div class="msg-pick-grid" id="modalMsgGrid">${btnsHtml}</div>

      <div style="font-family:var(--font-mono);font-size:10px;color:var(--gold);margin:8px 0 4px">🎙️ ПРОСЛУШАТЬ ГОЛОСОВЫЕ АУДИО ПРАНКА:</div>
      <div class="msg-pick-grid" id="modalPrankAudioGrid" style="margin-bottom:4px">
        ${audio.PRANK_VOICE_FILES.map((pf) => `<button type="button" class="btn msg-pick-btn ${audio.getActivePrankVoice() === pf.id ? 'btn--gold' : ''}" data-modal-prank="${pf.id}"><span>${audio.getActivePrankVoice() === pf.id ? '⏹️ ' : '▶️ '}${pf.label}</span></button>`).join('')}
      </div>
    `;

    const actions = [
      {
        label: playLabel,
        fn: () => runPlayNow(),
      },
      { label: t('close'), ghost: true },
    ];

    modal('❤️ ВЕРНУТЬ ЖИЗНИ · ПОДЕЛИТЬСЯ ТРЕЙЛЕРОМ И ИГРОЙ', html, actions, { backdropClose: true });

    document.querySelectorAll('.js-share-play-now').forEach((btn) => {
      btn.onclick = () => runPlayNow();
    });

    const bindTrailerBtn = (id, ch) => {
      const b = $(id);
      if (b) {
        b.onclick = () => {
          shareTrailerNow(ch, () => renderModalContent());
        };
      }
    };
    bindTrailerBtn('btnModalShareTrailerTg', 'tg');
    bindTrailerBtn('btnModalShareTrailerWa', 'wa');
    bindTrailerBtn('btnModalShareTrailerCopy', 'copy');

    document.querySelectorAll('#modalPrankAudioGrid [data-modal-prank]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.modalPrank);
        const res = audio.playPrankVoice(idx, () => renderModalContent());
        if (res.stopped) toast(`⏹️ Остановлено: ${res.track.label}`);
        else toast(`▶️ Играет: ${res.track.label}`);
        renderModalContent();
      };
    });

    document.querySelectorAll('#modalMsgGrid [data-share-ch]').forEach((btn) => {
      btn.onclick = () => {
        const ch = btn.dataset.shareCh;
        shareViaMessenger(ch, () => {
          renderModalContent();
        });
      };
    });
  };

  renderModalContent();
}

function shareResult() {
  const text = t('resultText', { l: pad(S.maxLevel - 1), p: number(S.total), url: refLink() });
  navigator.clipboard?.writeText(text).then(() => toast(t('copied'))).catch(() => toast(text));
}

/* ---------- countdown to the premiere ---------- */
function countdown() {
  const target = Date.UTC(2026, 11, 17, 0, 0, 0) - 6 * 3600000;
  const tickCd = () => {
    const d = Math.max(0, target - Date.now());
    $('cdD').textContent = String(Math.floor(d / 86400000)).padStart(3, '0');
    $('cdH').textContent = pad(Math.floor(d / 3600000) % 24);
    $('cdM').textContent = pad(Math.floor(d / 60000) % 60);
    $('cdS').textContent = pad(Math.floor(d / 1000) % 60);
  };
  tickCd(); setInterval(tickCd, 1000);
}

/* ---------- bind external links from CONFIG ---------- */
function bindConfigLinks() {
  const ticketHref = safeUrl(CONFIG.ticketUrl || '');
  const btnTickets = $('btnTickets');
  if (btnTickets) {
    if (ticketHref) {
      btnTickets.href = ticketHref;
      btnTickets.target = '_blank';
      btnTickets.rel = 'noopener noreferrer';
      btnTickets.onclick = null;
    } else {
      btnTickets.href = '#';
      btnTickets.onclick = (e) => { e.preventDefault(); toast('placeholder_ticket_url'); };
    }
  }

  const socialMap = [
    ['linkTiktok', CONFIG.socials?.tiktok, 'placeholder_tiktok_url'],
    ['linkInstagram', CONFIG.socials?.instagram, 'placeholder_instagram_url'],
    ['linkYoutube', CONFIG.socials?.youtube, 'placeholder_youtube_url'],
  ];
  socialMap.forEach(([id, rawUrl, placeholder]) => {
    const el = $(id);
    if (!el) return;
    const valid = safeUrl(rawUrl || '');
    if (valid) {
      el.href = valid;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.onclick = null;
    } else {
      el.href = '#';
      el.onclick = (e) => { e.preventDefault(); toast(placeholder); };
    }
  });
}

/* ---------- init ---------- */
export function initUI() {
  if ($('btnInvite')) $('btnInvite').onclick = () => shareFlow();
  if ($('btnSplashShareTrailer')) {
    $('btnSplashShareTrailer').onclick = (e) => {
      e.stopPropagation();
      shareTrailerNow('tg');
    };
  }
  if ($('btnShareTrailerSec')) {
    $('btnShareTrailerSec').onclick = () => {
      shareTrailerNow('tg');
    };
  }
  const cycleTool = (delta) => {
    document.dispatchEvent(new CustomEvent('clear-hand-skill'));
    const tl = setToolLevel((S.toolLevel || 1) + delta);
    audio.knock(0, 0.55);
    if ($('hudToolTxt')) {
      $('hudToolTxt').textContent = `${tl.icon} УР.${tl.lvl} ${(tl[lang] || tl.ru).toUpperCase()}`;
    }
    const chainNote = tl.breaksChains ? ' · РАЗБИВАЕТ ЦЕПИ' : '';
    toast(`${tl.icon} ${t('toolUpgrade', { l: tl.lvl, n: tl[lang] || tl.ru, m: tl.mult })}${chainNote}`);
    renderUpgrade();
    renderHudSkillsBar(true);
  };
  if ($('btnToolPrev')) $('btnToolPrev').onclick = () => cycleTool(-1);
  if ($('btnToolNext')) $('btnToolNext').onclick = () => cycleTool(1);
  if ($('hudToolTxt')) $('hudToolTxt').onclick = () => cycleTool(1);
  document.querySelectorAll('#friendsMsgGrid [data-mch]').forEach((btn) => {
    btn.onclick = () => shareViaMessenger(btn.dataset.mch);
  });
  document.querySelectorAll('#friendsPrankAudioGrid [data-prank-idx]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.prankIdx);
      const res = audio.playPrankVoice(idx);
      if (res.stopped) toast(`⏹️ Остановлено: ${res.track.label}`);
      else toast(`▶️ Играет: ${res.track.label}`);
    };
  });
  $('btnSurvey').onclick = surveyModal;
  $('btnShareResult').onclick = shareResult;
  document.querySelectorAll('#leaderTabs [data-lb]').forEach((btn) => {
    btn.onclick = () => {
      leaderPeriod = btn.dataset.lb || 'all';
      document.querySelectorAll('#leaderTabs [data-lb]').forEach((b) => b.classList.toggle('is-on', b === btn));
      if (net.online) refreshLeaderboard(leaderPeriod);
      renderLeaders();
    };
  });

  /* Кнопки раздела «ПРОКАЧКА ПЛОЩАДКИ» */
  if ($('btnClaim')) {
    $('btnClaim').onclick = () => {
      const got = claim();
      if (got > 0) {
        audio.coin(1.6);
        toast(t('claimedToast', { n: number(got) }));
        renderUpgrade();
        renderArchive();
        renderLeaders();
      }
    };
  }
  if ($('btnDaily')) {
    $('btnDaily').onclick = () => {
      const d = dailyReward();
      if (d) {
        audio.coin(1.8);
        toast(`${t('dailyGot')}: +${number(d.reward)} · ${d.streak}/30`);
        renderUpgrade();
        renderArchive();
        renderLeaders();
      } else {
        toast(`${t('dailyWait')} ${S.streak || 1}/30`);
      }
    };
  }
  if ($('btnCipher')) {
    $('btnCipher').onclick = playCipherDemo;
  }
  document.querySelectorAll('.cipher-barrel').forEach((btn) => {
    btn.onclick = () => {
      if (cipherShowing) return;
      const idx = Number(btn.dataset.cidx);
      if (cipherStage) cipherStage.triggerBeat(idx);
      else audio.knockTone(idx, 1);
      btn.classList.add('is-cue');
      setTimeout(() => btn.classList.remove('is-cue'), 180);
      const res = tapCipherBarrel(idx);
      if (res.status === 'miss') {
        toast(t('cipherFail'));
        $('cipherPad')?.classList.add('is-hidden');
      } else if (res.status === 'hit') {
        if ($('cipherHintTxt')) $('cipherHintTxt').textContent = `${res.progress} / ${res.total}`;
      } else if (res.status === 'won') {
        audio.coin(2.4);
        toast(t('comboDone'));
        $('cipherPad')?.classList.add('is-hidden');
        renderUpgrade();
        renderArchive();
        renderLeaders();
      }
    };
  });

  bindConfigLinks();
  $('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && modalBackdropClosable && performance.now() - modalOpenedAt > 350) {
      closeModal();
    }
  });
  document.addEventListener('langchange', () => renderSections());
  document.addEventListener('net-sync', () => renderSections());
  countdown();
}
