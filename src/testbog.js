import { BARREL_BATCH_CODES } from './scene.js';
import { patchTestBogProfile, resetTestBogSandbox } from './backend.js';

/**
 * Монтирует плавающий пульт управления «⚡ ТЕСТ-БОГ (ПЕСОЧНИЦА — 0 ЗАПРОСОВ В БАЗУ)»
 * поверх игры только при активной сессии `/testbog/`.
 */
export function mountTestBogHUD(hooks) {
  if (document.getElementById('testbog-floating-root')) return;

  const style = document.createElement('style');
  style.textContent = `
    .tbog-root {
      position: fixed;
      left: 12px;
      bottom: 12px;
      z-index: 9999;
      font-family: 'Inter', system-ui, sans-serif;
      color: #f4f1ea;
      max-width: calc(100vw - 24px);
    }
    .tbog-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 14px;
      border-radius: 999px;
      border: 1px solid #eab308;
      background: rgba(12, 14, 18, 0.94);
      color: #fde047;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.72);
    }
    .tbog-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }
    .tbog-drawer {
      width: min(390px, calc(100vw - 24px));
      max-height: min(78vh, 640px);
      overflow-y: auto;
      background: rgba(13, 15, 20, 0.96);
      border: 1px solid rgba(234, 179, 8, 0.65);
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 20px 54px rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
    }
    .tbog-drawer[hidden], .tbog-pill[hidden] {
      display: none !important;
    }
    .tbog-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .tbog-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #fde047;
    }
    .tbog-sub {
      display: block;
      font-size: 10px;
      color: #86efac;
      margin-top: 2px;
    }
    .tbog-head-btns {
      display: flex;
      gap: 5px;
    }
    .tbog-radar {
      padding: 7px 9px;
      margin-bottom: 9px;
      border-radius: 7px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.35);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .tbog-sec-lbl {
      display: block;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: #9ca3af;
      margin: 8px 0 5px;
      letter-spacing: 0.04em;
    }
    .tbog-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }
    .tbog-grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
    }
    .tbog-btn {
      padding: 7px 8px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: #191e27;
      color: #f3f1ea;
      font-size: 11px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      line-height: 1.25;
    }
    .tbog-btn:hover {
      border-color: #eab308;
      color: #fde047;
    }
    .tbog-btn-center {
      text-align: center;
    }
    .tbog-btn-gold {
      background: rgba(234, 179, 8, 0.18);
      border-color: rgba(234, 179, 8, 0.55);
      color: #fde047;
    }
    .tbog-btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.45);
      color: #fca5a5;
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'testbog-floating-root';
  root.className = 'tbog-root';
  root.innerHTML = `
    <button type="button" class="tbog-pill" id="tbog-open-pill" hidden>
      <span class="tbog-dot"></span>
      <span>⚡ ТЕСТ-БОГ · 0 БД</span>
    </button>

    <div class="tbog-drawer" id="tbog-drawer">
      <div class="tbog-head">
        <div>
          <span class="tbog-title">⚡ ПУЛЬТ ТЕСТ-БОГА (SANDBOX)</span>
          <span class="tbog-sub">✓ База Supabase и бот отключены (0 мусора)</span>
        </div>
        <div class="tbog-head-btns">
          <button type="button" class="tbog-btn tbog-btn-center" id="tbog-min-btn" title="Свернуть пульт">—</button>
          <button type="button" class="tbog-btn tbog-btn-danger tbog-btn-center" id="tbog-exit-btn" title="Выйти в обычный режим">Выход</button>
        </div>
      </div>

      <div class="tbog-radar">
        <span id="tbog-radar-text">🎯 Живая бочка: —</span>
        <button type="button" class="tbog-btn tbog-btn-gold tbog-btn-center" id="tbog-crack-target">Вскрыть 🎯</button>
      </div>

      <span class="tbog-sec-lbl">1. МГНОВЕННЫЙ ПЕРЕХОД ПО ЭКРАНАМ И ПАСХАЛКАМ</span>
      <div class="tbog-grid">
        <button type="button" class="tbog-btn" data-tbog-jump="gate">🚪 1. Входной шлюз</button>
        <button type="button" class="tbog-btn" data-tbog-jump="demo">🛢 Ур. 1 (3 бочки)</button>
        <button type="button" class="tbog-btn" data-tbog-jump="level8">🛢 Ур. 8 (10 бочек)</button>
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-jump="blitz">⚡ Блиц 10Б (Ур.9+)</button>
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-jump="duel">⚔️ Стол «На счёт три!»</button>
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-jump="leaders">🏆 Рейтинг ТОП-10</button>
        <button type="button" class="tbog-btn" data-tbog-jump="sharehub">📤 Шеринг + Трейлер</button>
        <button type="button" class="tbog-btn" data-tbog-jump="viral">🆘 3. Бочка друга (5 ходов)</button>
        <button type="button" class="tbog-btn" data-tbog-jump="pack">🎙 4. Упаковать (Фото+Голос)</button>
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-jump="premiere">🏆 5. Гонка за Премьерой</button>
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-jump="ocean">🌊 6. Тиль у моря (19·97)</button>
        <button type="button" class="tbog-btn" data-tbog-jump="fork">🎟 7. Вилка «Чужой билет»</button>
        <button type="button" class="tbog-btn" data-tbog-jump="pass">📱 8. Экран друга (?gift=...)</button>
        <button type="button" class="tbog-btn" data-tbog-jump="nearmiss">😱 9. Ловушка 98.9 / 100</button>
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-jump="win100">🎉 10. Победа 100 / 100!</button>
      </div>

      <span class="tbog-sec-lbl">2. ЖИЗНИ, ВОЗДУХ И ШКАЛА ПРЕМЬЕРЫ (0..100)</span>
      <div class="tbog-grid-4">
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-stat="lives+10">+10 ❤️</button>
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-stat="lives0">0 ❤️</button>
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-stat="air30">30с O₂</button>
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-stat="air3">3с O₂</button>
      </div>
      <div class="tbog-grid-4" style="margin-top:5px">
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-score="0">0.0%</button>
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-score="86.5">86.5%</button>
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-score="98.9">98.9%</button>
        <button type="button" class="tbog-btn tbog-btn-center" data-tbog-score="99.9">99.9%</button>
      </div>

      <span class="tbog-sec-lbl">3. ЗАКАЗАТЬ ИСХОД СЛЕДУЮЩЕГО УДАРА В СУПЕРИГРЕ</span>
      <div class="tbog-grid">
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-force="golden_ticket">🎟 След. удар = Билет</button>
        <button type="button" class="tbog-btn tbog-btn-gold" data-tbog-force="premiere_win">🏆 След. удар = 100/100</button>
        <button type="button" class="tbog-btn" data-tbog-force="empty_screamer">👻 След. удар = Скример</button>
        <button type="button" class="tbog-btn tbog-btn-danger" id="tbog-reset-btn">🔄 Сброс песочницы</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const pill = document.getElementById('tbog-open-pill');
  const drawer = document.getElementById('tbog-drawer');
  const radarText = document.getElementById('tbog-radar-text');

  const setMinimized = (min) => {
    if (min) {
      drawer?.setAttribute('hidden', '');
      pill?.removeAttribute('hidden');
    } else {
      pill?.setAttribute('hidden', '');
      drawer?.removeAttribute('hidden');
    }
  };

  document.getElementById('tbog-min-btn')?.addEventListener('click', () => setMinimized(true));
  pill?.addEventListener('click', () => setMinimized(false));

  document.getElementById('tbog-exit-btn')?.addEventListener('click', () => {
    try {
      sessionStorage.removeItem('bochka_testbog_unlocked');
      sessionStorage.removeItem('bochka_testbog_mode');
      sessionStorage.removeItem('bochka_testbog_force_hit');
    } catch { /* ignore */ }
    window.location.replace('./');
  });

  document.getElementById('tbog-crack-target')?.addEventListener('click', () => {
    hooks.crackTargetBarrel?.();
  });

  document.getElementById('tbog-reset-btn')?.addEventListener('click', () => {
    resetTestBogSandbox();
    hooks.syncProfile?.({
      premiereScore: 0,
      premierePoints: 0,
      currentLevel: 1,
      lives: 5,
      hasPendingTicket: false,
      premiereWon: false,
      premiereCode: '',
    });
    hooks.toast?.('🔄 Песочница очищена (Ур.1, ⭐ 0, 5 ❤️, 0.0 / 100)');
  });

  root.querySelectorAll('[data-tbog-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tbog-jump');
      hooks.jumpTo?.(target);
    });
  });

  root.querySelectorAll('[data-tbog-stat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-tbog-stat');
      if (action === 'lives+10') {
        const cur = hooks.getState?.()?.profile?.lives || 0;
        const next = patchTestBogProfile({ lives: cur + 10 });
        hooks.syncProfile?.(next);
        hooks.toast?.(`⚡ Начислено +10 ❤️ (всего ${next.lives})`);
      } else if (action === 'lives0') {
        const next = patchTestBogProfile({ lives: 0 });
        hooks.syncProfile?.(next);
        hooks.toast?.('⚡ Жизни обнулены (0 ❤️)');
      } else if (action === 'air30') {
        hooks.setAir?.(30.0);
      } else if (action === 'air3') {
        hooks.setAir?.(3.2);
      }
    });
  });

  root.querySelectorAll('[data-tbog-score]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-tbog-score') || 0);
      const next = patchTestBogProfile({ premiereScore: val, premiereWon: false });
      hooks.syncProfile?.(next);
      hooks.toast?.(`⚡ Шкала Премьеры: ${val.toFixed(1)} / 100`);
    });
  });

  root.querySelectorAll('[data-tbog-force]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-tbog-force') || '';
      try {
        sessionStorage.setItem('bochka_testbog_force_hit', f);
      } catch { /* ignore */ }
      const labels = {
        golden_ticket: '🎟 Следующий удар гарантированно выбьет Золотую бочку с билетом!',
        premiere_win: '🏆 Следующий удар гарантированно добьёт 100 / 100 Премьеру!',
        empty_screamer: '👻 Следующий удар вызовет скример пустой бочки!',
      };
      hooks.toast?.(labels[f] || 'Исход задан');
    });
  });

  window.setInterval(() => {
    const st = hooks.getState?.();
    if (!st || !radarText) return;
    const idx = st.round?.targetIndex ?? 0;
    const code = BARREL_BATCH_CODES[idx] || `0${idx + 1}`;
    radarText.textContent = `🎯 Цель: бочка #${idx + 1} (Партия №${code})`;
  }, 450);
}
