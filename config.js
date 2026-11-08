/* Главный конфигурационный файл проекта «БОЧКА: Достучаться до небес».
   Все внешние ссылки, видео-слоты, билеты, соцсети и ключи Firebase меняются только здесь. */
export const CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    databaseURL: '',
    storageBucket: '',
    appId: '',
  },
  region: 'europe-west1',
  appCheckSiteKey: '',
  publicGameUrl: 'https://bochka.quest',
  telegramBotUsername: '',
  telegramAppName: '',
  ticketUrl: 'https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D',
  kinopoiskUrl: 'https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D',
  privacyUrl: '',
  rulesUrl: '',
  contestEnabled: false,
  /* Официальный YouTube-трейлер (делает сайт лёгким и быстрым) + локальные видеофайлы как резерв:
     - YouTube: https://youtu.be/EZFDcXeLTzQ?si=-NIU0mFyayaYjHnf
     - assets/trailer.mp4 (Режиссёрский трейлер Алексея Звонцова)
     - Barrel_MP_TRL_V2.mp4 (Полный официальный трейлер V2)
     - hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4 (Видео от режиссёра / со съёмок) */
  trailer: {
    youtubeId: 'EZFDcXeLTzQ',
    youtubeUrl: 'https://youtu.be/EZFDcXeLTzQ?si=-NIU0mFyayaYjHnf',
    posterWide: 'photo_2026-11-08_00-00-14.jpg',
    posterVert: 'photo_2026-11-08_00-00-26.jpg',
    mp4: 'assets/trailer.mp4',
    fullMp4: 'Barrel_MP_TRL_V2_web.mp4',
    directorMp4: 'hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4',
  },
  socials: {
    telegram: '',
    youtube: 'https://youtu.be/EZFDcXeLTzQ?si=-NIU0mFyayaYjHnf',
    instagram: '',
    tiktok: '',
  },
};

export const MEDIA = {
  crew1: { title: 'crew', type: 'video', url: '', fallbackAsset: 'hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4', storagePath: '', level: 1 },
  crew2: { title: 'crew', type: 'video', url: '', fallbackAsset: 'assets/trailer.mp4', storagePath: '', level: 2 },
  crew3: { title: 'crew', type: 'video', url: '', fallbackAsset: 'Barrel_MP_TRL_V2_web.mp4', storagePath: '', level: 3 },
  poster: { title: 'mediaPoster', type: 'art', art: 'poster', url: 'photo_2026-11-08_00-00-26.jpg', score: 2000 },
  cast: {
    title: 'mediaCast',
    type: 'art-gallery',
    artworks: [
      { kind: 'dossier', label: 'Тиль Швайгер', img: 'assets/images.jpg' },
      { kind: 'dossier', label: 'Филипп Рейнхардт', img: 'assets/images_6.jpg' },
      { kind: 'dossier', label: 'Ирина Кобзева', img: 'assets/images_5.jpg' },
      { kind: 'dossier', label: 'Нэйтан Пол-Коллис', img: 'assets/images_2.jpg' },
    ],
    score: 2500,
  },
  concept: {
    title: 'mediaConcept',
    type: 'art-gallery',
    artworks: [
      { kind: 'poster', label: '200 L' },
      { kind: 'reel', label: 'ARCHIVE / 1712' },
      { kind: 'dossier', label: 'CASE / 04' },
    ],
    score: 10000,
  },
  bts: { title: 'mediaBts', type: 'video', youtubeId: '', url: 'hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4', storagePath: '', score: 250000 },
  interview: { title: 'mediaInterview', type: 'video', youtubeId: '', url: 'Barrel_MP_TRL_V2_web.mp4', storagePath: '', score: 1000000 },
  secret: { title: 'mediaSecret', type: 'video', url: '', fallbackAsset: 'hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4', storagePath: '', bonus: true },
  streakPoster: { title: 'mediaStreak', type: 'art', art: 'poster', url: 'assets/images_3.jpg', streak: true },
};

export const ARCHIVE = ['poster', 'cast', 'concept', 'bts', 'interview', 'secret', 'streakPoster'];

export function unlocked(item, state) {
  if (!item || !state) return false;
  if (item.bonus) return !!(state.bonusWon || state.bestNight > 0 || state.nightWins > 0);
  if (item.streak) return !!(state.poster30 || state.streak >= 30);
  if (item.level) return (state.cleared ?? (state.maxLevel ? state.maxLevel - 1 : 0)) >= item.level;
  const total = Math.max(state.totalEarned || 0, state.peakScore || 0, state.total || 0);
  return total >= (item.score || 0);
}

export function safeUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  if (/^(assets\/)?[A-Za-z0-9_.\u0400-\u04FF -]+\.(jpg|jpeg|png|webp|mp4|ogg|mp3)$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}
