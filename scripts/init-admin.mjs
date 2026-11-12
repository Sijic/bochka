import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';

function readEnvFile(path = '.env') {
  const map = {};
  if (!fs.existsSync(path)) return map;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

function httpsJson(urlStr, { method = 'GET', headers = {}, body = null } = {}) {
  const u = new URL(urlStr);
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        family: 4,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let s = '';
        res.on('data', (d) => (s += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(s || 'null') });
          } catch {
            resolve({ status: res.statusCode, body: s });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const env = readEnvFile('.env');
  const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF;

  if (!supabaseUrl || !serviceKey || !accessToken || !projectRef) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'producer@bochka.quest';
  const adminPassword =
    process.env.ADMIN_PASSWORD ||
    env.PRODUCER_SECRET_PASSWORD ||
    crypto.randomBytes(12).toString('base64url');

  // 1. Create or update admin user in Supabase Auth via Admin API
  const listRes = await httpsJson(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });

  const existing = (listRes.body?.users || []).find(
    (u) => (u.email || '').toLowerCase() === adminEmail.toLowerCase()
  );

  let userId = existing?.id || '';
  if (userId) {
    await httpsJson(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: { password: adminPassword, email_confirm: true },
    });
  } else {
    const createRes = await httpsJson(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: { email: adminEmail, password: adminPassword, email_confirm: true },
    });
    userId = createRes.body?.id || '';
  }

  if (!userId) {
    console.error('Failed to create Supabase Auth admin user');
    process.exit(1);
  }

  // 2. Register user_id in public.admins and verify buckets + pg_cron
  const verifySql = `
    INSERT INTO public.admins (user_id, email)
    VALUES ('${userId}'::uuid, '${adminEmail}')
    ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

    SELECT
      (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS public_tables,
      (SELECT json_agg(id) FROM storage.buckets WHERE id IN ('barrel-media', 'cinema-passes')) AS buckets,
      (SELECT count(*) FROM cron.job WHERE jobname = 'bochka-cleanup-barrel-media-5d') AS cron_jobs;
  `;

  const dbRes = await httpsJson(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { query: verifySql },
  });

  // Save producer password locally in gitignored .env for reference
  let rawEnv = fs.readFileSync('.env', 'utf8');
  if (!rawEnv.includes('PRODUCER_SECRET_PASSWORD=')) {
    rawEnv += `\nPRODUCER_ADMIN_EMAIL=${adminEmail}\nPRODUCER_SECRET_PASSWORD=${adminPassword}\n`;
    fs.writeFileSync('.env', rawEnv);
  }

  console.log('=== КАБИНЕТ ПРОДЮСЕРА ИНИЦИАЛИЗИРОВАН ===');
  console.log('Спец-ссылка: https://bochka.quest/admin/ (или https://bochka.quest/?mode=admin)');
  console.log('Логин (Supabase Auth):', adminEmail);
  console.log('Секретный пароль:', adminPassword);
  console.log('Проверка БД/бакетов/pg_cron:', JSON.stringify(dbRes.body));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
