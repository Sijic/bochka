const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const winEnv = (typeof window !== 'undefined' && window.__BOCHKA_ENV__) ? window.__BOCHKA_ENV__ : {};

function pick(key, fallback = '') {
  const v = metaEnv[key] ?? winEnv[key] ?? '';
  if (typeof v === 'string' && v.trim() && !v.includes('your-project-ref') && !v.includes('your-supabase-anon')) {
    return v.trim();
  }
  return fallback;
}

// ВНИМАНИЕ: Здесь находятся ТОЛЬКО публичные клиентские константы (URL и anon key, защищённые RLS + SECURITY DEFINER RPC).
// Секретные ключи (TELEGRAM_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY, пароли админки) НИКОГДА не попадают в клиентский JS!
export const ENV = {
  supabaseUrl: pick('VITE_SUPABASE_URL', 'https://cevcmsypwohmpethybzf.supabase.co'),
  supabaseAnonKey: pick(
    'VITE_SUPABASE_ANON_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNldmNtc3lwd29obXBldGh5YnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0OTU0OTksImV4cCI6MjExMDA3MTQ5OX0.YOCD9vaqv9-FV2X28xLnzYt1x_NOGRW6wqsCBcw34Bk'
  ),
  supabaseBucket: pick('VITE_SUPABASE_BUCKET', 'barrel-media'),
  supabasePassesBucket: pick('VITE_SUPABASE_PASSES_BUCKET', 'cinema-passes'),
  tgBotUsername: pick('VITE_TG_BOT_USERNAME', 'bochka_film_bot'),
  tgAppName: pick('VITE_TG_APP_NAME', 'play'),
  tgNotifyWebhook: pick(
    'VITE_TG_NOTIFY_WEBHOOK',
    'https://cevcmsypwohmpethybzf.supabase.co/functions/v1/tg-webhook'
  ),
  publicUrl: pick('VITE_PUBLIC_URL', 'https://bochka.quest'),
  kinopoiskUrl: pick('VITE_KINOPOISK_URL', 'https://www.kinopoisk.ru/film/11226275/'),
  kinopoiskTrailerUrl: pick('VITE_KINOPOISK_TRAILER_URL', 'https://www.kinopoisk.ru/film/11226275/video/210300/'),
  trailerMp4: pick('VITE_TRAILER_MP4', './video/trailer.mp4'),
  youtubeFallbackId: pick('VITE_YOUTUBE_FALLBACK_ID', 'vAJpT_82uUo'),
  directorVideo: './hf_20261017_093522_42c309d3-daf2-486e-9539-a8dcb422167c.mp4',
  posterVert: './photo_2026-11-08_00-00-26.jpg',
  posterWide: './photo_2026-11-08_00-00-14.jpg',
};
