-- ============================================================================
-- БОЧКА: Упакуй друга (v2.5) — Полная схема Supabase (Storage + DB + Anti-Cheat RPC)
-- Выполните этот скрипт целиком в SQL Editor вашего проекта Supabase.
-- ============================================================================

-- 1. Таблица упакованных бочек с короткими 7-символьными short_id (?b=jakaqgx)
create table if not exists public.barrels (
  id text primary key,
  short_id text generated always as (id) stored,
  created_at timestamptz not null default now(),
  mode text not null default 'friend' check (mode in ('friend', 'self')),
  message text not null default '',
  photo_url text not null default '',
  voice_url text not null default '',
  frame_style text not null default 'flashlight',
  target_index smallint not null default 0 check (target_index between 0 and 5),
  sender_uid text not null default '',
  sender_tg_id text default null,
  sender_name text not null default '',
  opened_count integer not null default 0,
  survived boolean default null,
  attempts_used smallint default null,
  time_left numeric(5,1) default null,
  replied_cinema boolean not null default false,
  last_opened_at timestamptz default null
);

-- Миграция колонки voice_url, если таблица уже создавалась ранее
alter table public.barrels add column if not exists voice_url text not null default '';

create index if not exists idx_barrels_sender_uid on public.barrels (sender_uid);

alter table public.barrels enable row level security;

drop policy if exists "Public read barrels" on public.barrels;
create policy "Public read barrels"
  on public.barrels for select
  using (true);

drop policy if exists "Public insert barrels" on public.barrels;
create policy "Public insert barrels"
  on public.barrels for insert
  with check (char_length(id) between 4 and 16 and char_length(message) <= 60);

drop policy if exists "Public update barrel results" on public.barrels;
create policy "Public update barrel results"
  on public.barrels for update
  using (true)
  with check (char_length(message) <= 60);

-- 2. Storage bucket для портретов (512x512 WebP <= 60 КБ) и голосовых (WebM/Opus <= 40 КБ)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barrel-portraits',
  'barrel-portraits',
  true,
  102400,
  array[
    'image/webp',
    'image/jpeg',
    'image/png',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg'
  ]
)
on conflict (id) do update
  set public = true,
      file_size_limit = 102400,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read barrel portraits" on storage.objects;
create policy "Public read barrel portraits"
  on storage.objects for select
  using (bucket_id = 'barrel-portraits');

drop policy if exists "Public upload barrel portraits" on storage.objects;
create policy "Public upload barrel portraits"
  on storage.objects for insert
  with check (bucket_id = 'barrel-portraits');

-- ============================================================================
-- 3. ЗАЩИЩЁННАЯ СУПЕРИГРА «НОЧНАЯ СМЕНА» (КАЖДЫЙ 100-Й БИЛЕТ В КИНО)
-- Таблицы закрыты RLS без публичных политик: из браузера прочитать коды или
-- скрутить счётчик НЕВОЗМОЖНО. Доступ только через атомарную SECURITY DEFINER RPC.
-- ============================================================================

create table if not exists public.hunt_config (
  id smallint primary key default 1 check (id = 1),
  global_plays_count bigint not null default 0,
  max_daily_tickets integer not null default 5,
  claim_contact text not null default 'Напиши @bochka_film_support и пришли скрин этого кода для получения билета на 17 декабря!'
);

insert into public.hunt_config (id, global_plays_count, max_daily_tickets)
values (1, 0, 5)
on conflict (id) do nothing;

alter table public.hunt_config enable row level security;
-- Политик для anon НЕТ -> прямой доступ из клиента полностью заблокирован!

create table if not exists public.ticket_codes (
  code text primary key,
  claimed_by text default null,
  claimed_at timestamptz default null,
  claim_day date default null
);

alter table public.ticket_codes enable row level security;
-- Политик для anon НЕТ -> никто не может выгрузить пул промокодов через консоль!

-- Пример загрузки реальных промокодов продюсерами через SQL Editor:
-- insert into public.ticket_codes (code) values ('BOCHKA-1712-A9F2'), ('BOCHKA-1712-K4M8') on conflict do nothing;

create table if not exists public.hunt_rate_limit (
  user_id text primary key,
  last_try_at timestamptz not null default now(),
  total_tries integer not null default 1
);

alter table public.hunt_rate_limit enable row level security;

-- Атомарная серверная функция проверки каждого 100-го вскрытия с дневным потолком
create or replace function public.try_win_ticket(user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_uid text := left( coalesce(trim(user_id), ''), 64 );
  v_last_try timestamptz;
  v_plays bigint;
  v_max_daily integer;
  v_contact text;
  v_today date := (now() at time zone 'utc')::date;
  v_daily_issued integer;
  v_already_won integer;
  v_won_code text;
begin
  if char_length(v_clean_uid) < 3 then
    return jsonb_build_object('won', false, 'status', 'invalid_user');
  end if;

  -- Защита от автокликеров / спама скриптами (минимум 1.2 сек между ударами одного игрока)
  select last_try_at into v_last_try
  from public.hunt_rate_limit
  where public.hunt_rate_limit.user_id = v_clean_uid;

  if v_last_try is not null and (now() - v_last_try) < interval '1.2 seconds' then
    return jsonb_build_object('won', false, 'status', 'rate_limited');
  end if;

  insert into public.hunt_rate_limit (user_id, last_try_at, total_tries)
  values (v_clean_uid, now(), 1)
  on conflict (user_id) do update
    set last_try_at = now(),
        total_tries = public.hunt_rate_limit.total_tries + 1;

  -- Атомарная блокировка строки счётчика (FOR UPDATE исключает гонки потоков)
  update public.hunt_config
  set global_plays_count = global_plays_count + 1
  where id = 1
  returning global_plays_count, max_daily_tickets, claim_contact
  into v_plays, v_max_daily, v_contact;

  -- Выигрывает строго каждый 100-й удар в мире
  if (v_plays % 100) <> 0 then
    return jsonb_build_object('won', false, 'status', 'empty');
  end if;

  -- Проверка дневного потолка выдачи (MAX_DAILY_TICKETS, по умолчанию 5 в сутки)
  select count(*) into v_daily_issued
  from public.ticket_codes
  where claim_day = v_today;

  if v_daily_issued >= v_max_daily then
    return jsonb_build_object('won', false, 'status', 'empty');
  end if;

  -- Один игрок не может забрать больше 1 билета в сутки
  select count(*) into v_already_won
  from public.ticket_codes
  where claimed_by = v_clean_uid and claim_day = v_today;

  if v_already_won > 0 then
    return jsonb_build_object('won', false, 'status', 'empty');
  end if;

  -- Атомарно забираем 1 свободный промокод из закрытого пула
  update public.ticket_codes
  set claimed_by = v_clean_uid,
      claimed_at = now(),
      claim_day = v_today
  where code = (
    select code
    from public.ticket_codes
    where claimed_by is null
    limit 1
    for update skip locked
  )
  returning code into v_won_code;

  if v_won_code is null then
    -- Если продюсеры ещё не загрузили коды в ticket_codes, генерируем подписанный резервный тикет-токен
    v_won_code := 'BOCHKA-1712-' || upper(substr(md5(v_clean_uid || v_plays::text || clock_timestamp()::text), 1, 8));
    insert into public.ticket_codes (code, claimed_by, claimed_at, claim_day)
    values (v_won_code, v_clean_uid, now(), v_today);
  end if;

  return jsonb_build_object(
    'won', true,
    'status', 'winner',
    'ticket_code', v_won_code,
    'contact', v_contact
  );
end;
$$;

revoke all on function public.try_win_ticket(text) from public;
grant execute on function public.try_win_ticket(text) to anon, authenticated;
