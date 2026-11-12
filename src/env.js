const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const winEnv = (typeof window !== 'undefined' && window.__BOCHKA_ENV__) ? window.__BOCHKA_ENV__ : {};

function pick(key, fallback = '') {
  const v = metaEnv[key] ?? winEnv[key] ?? '';
  if (typeof v === 'string' && v.trim() && !v.includes('your-project-ref') && !v.includes('your-supabase-anon')) {
    return v.trim();
  }
  return fallback;
}

export const ENV = {
  supabaseUrl: pick('VITE_SUPABASE_URL', ''),
  supabaseAnonKey: pick('VITE_SUPABASE_ANON_KEY', ''),
  supabaseBucket: pick('VITE_SUPABASE_BUCKET', 'barrel-portraits'),
  tgBotToken: pick('VITE_TG_BOT_TOKEN', ''),
  tgBotUsername: pick('VITE_TG_BOT_USERNAME', ''),
  tgAppName: pick('VITE_TG_APP_NAME', 'app'),
  tgNotifyWebhook: pick('VITE_TG_NOTIFY_WEBHOOK', ''),
  publicUrl: pick('VITE_PUBLIC_URL', 'https://bochka.quest'),
  kinopoiskUrl: pick(
    'VITE_KINOPOISK_URL',
    'https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D'
  ),
  ticketsUrl: pick(
    'VITE_TICKETS_URL',
    'https://www.kinopoisk.ru/film/11226275/?socialAlias=MzcwNjU0MjQ%3D'
  ),
  youtubeId: pick('VITE_YOUTUBE_ID', 'EZFDcXeLTzQ'),
  directorVideo: './hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4',
  posterVert: './photo_2026-11-08_00-00-26.jpg',
  posterWide: './photo_2026-11-08_00-00-14.jpg',
};
