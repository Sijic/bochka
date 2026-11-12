const STORAGE_KEY = 'bochka_v2_lang';

let dictionary = null;
let currentLang = 'ru';
const listeners = new Set();

export async function initI18n(preferredLang = '') {
  const dictUrl = new URL('./dict.json', import.meta.url);
  const res = await fetch(dictUrl);
  dictionary = await res.json();

  const saved = safeGetStorage(STORAGE_KEY);
  const urlLang = new URLSearchParams(window.location.search).get('lang')?.toLowerCase();
  const raw = (urlLang || saved || preferredLang || navigator.language || 'ru').toLowerCase();

  if (raw.startsWith('kk') || raw.startsWith('kz')) {
    currentLang = 'kz';
  } else if (raw.startsWith('en')) {
    currentLang = 'en';
  } else {
    currentLang = 'ru';
  }

  document.documentElement.lang = currentLang === 'kz' ? 'kk' : currentLang;
  return currentLang;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!dictionary || !dictionary[lang]) return;
  currentLang = lang;
  safeSetStorage(STORAGE_KEY, lang);
  document.documentElement.lang = lang === 'kz' ? 'kk' : lang;
  applyDomTranslations();
  listeners.forEach((fn) => fn(currentLang));
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, vars = null) {
  if (!dictionary) return key;
  const pack = dictionary[currentLang] || dictionary.ru;
  let val = pack[key] ?? dictionary.ru[key] ?? key;
  if (typeof val === 'string' && vars) {
    for (const [k, v] of Object.entries(vars)) {
      val = val.replaceAll(`{${k}}`, String(v));
    }
  }
  return val;
}

export function applyDomTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (typeof val === 'string') el.textContent = val;
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (typeof val === 'string') el.setAttribute('placeholder', val);
  });
  root.querySelectorAll('[data-lang-btn]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-lang-btn') === currentLang);
  });
}

function safeGetStorage(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeSetStorage(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore private mode */
  }
}
