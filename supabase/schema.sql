-- ============================================================================
-- БОЧКА: Упакуй друга (v3.0) — Полная серверная схема Supabase
-- (Storage + Barrels + Гонка за Премьерой 0..100 + Именные Билеты + Пасхалка 19-97)
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

-- 2. Storage bucket для портретов (512x512 WebP <= 60 КБ), голоса (Opus <= 40 КБ) и фото именных билетов
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
-- 3. КОНФИГУРАЦИЯ СУПЕРИГРЫ: ПРЕМЬЕРА СО ЗВЁЗДАМИ + ПУЛ ОБЫЧНЫХ БИЛЕТОВ
-- Все таблицы закрыты RLS без публичных политик (доступ строго через SECURITY DEFINER RPC).
-- ============================================================================

create table if not exists public.hunt_config (
  id smallint primary key default 1 check (id = 1),
  global_plays_count bigint not null default 0,
  ticket_every_n integer not null default 100,
  max_daily_tickets integer not null default 5,
  max_premiere_winners integer not null default 10,
  premiere_winners_count integer not null default 0,
  claim_contact text not null default 'Предъяви этот живой именной пропуск на контроле или в боте @bochka_film_support',
  premiere_contact text not null default 'Напиши @bochka_film_support — твоё приглашение на закрытую Премьеру «Бочки» со съёмочной группой подтверждено!'
);

alter table public.hunt_config add column if not exists ticket_every_n integer not null default 100;
alter table public.hunt_config add column if not exists max_premiere_winners integer not null default 10;
alter table public.hunt_config add column if not exists premiere_winners_count integer not null default 0;
alter table public.hunt_config add column if not exists premiere_contact text not null default 'Напиши @bochka_film_support — твоё приглашение на закрытую Премьеру «Бочки» со съёмочной группой подтверждено!';

insert into public.hunt_config (id, global_plays_count, ticket_every_n, max_daily_tickets, max_premiere_winners)
values (1, 0, 100, 5, 10)
on conflict (id) do nothing;

alter table public.hunt_config enable row level security;

create table if not exists public.ticket_codes (
  code text primary key,
  claimed_by text default null,
  claimed_at timestamptz default null,
  claim_day date default null
);

alter table public.ticket_codes enable row level security;

create table if not exists public.hunt_rate_limit (
  user_id text primary key,
  last_try_at timestamptz not null default now(),
  total_tries integer not null default 1
);

alter table public.hunt_rate_limit enable row level security;

-- 4. Профили игроков в Гонке за Премьерой (0..100 баллов + жизни + пасхалка 19-97)
create table if not exists public.player_profiles (
  user_id text primary key,
  premiere_score numeric(6,2) not null default 0,
  lives integer not null default 3,
  raw_shares_today integer not null default 0,
  raw_shares_day date default null,
  easter_egg_claimed boolean not null default false,
  premiere_won boolean not null default false,
  premiere_code text default null,
  pending_ticket_code text default null,
  updated_at timestamptz not null default now()
);

alter table public.player_profiles enable row level security;

-- Журнал уникальных открытий бочек друзьями (для честного начисления +2 жизней без дублей)
create table if not exists public.barrel_opens_ledger (
  barrel_id text not null,
  viewer_uid text not null,
  created_at timestamptz not null default now(),
  primary key (barrel_id, viewer_uid)
);

alter table public.barrel_opens_ledger enable row level security;

-- 5. Именные подарочные билеты для друзей с фейс-контролем (?pass=ID)
create table if not exists public.ticket_passes (
  id text primary key,
  ticket_code text not null,
  sender_uid text not null,
  sender_tg_id text default null,
  sender_name text not null default '',
  recipient_name text not null,
  recipient_photo_url text not null,
  accepted boolean not null default false,
  accepted_by_uid text default null,
  accepted_at timestamptz default null,
  sender_x2_credited boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.ticket_passes enable row level security;

-- ============================================================================
-- RPC 1: Получение актуального профиля игрока (шкала Премьеры, жизни, статус)
-- ============================================================================
create or replace function public.get_player_profile(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := left(coalesce(trim(p_user_id), ''), 64);
  v_today date := (now() at time zone 'utc')::date;
  v_prof public.player_profiles%rowtype;
begin
  if char_length(v_uid) < 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_user');
  end if;

  insert into public.player_profiles (user_id, lives, raw_shares_day)
  values (v_uid, 3, v_today)
  on conflict (user_id) do nothing;

  select * into v_prof from public.player_profiles where user_id = v_uid;

  if v_prof.raw_shares_day is distinct from v_today then
    update public.player_profiles
    set raw_shares_today = 0, raw_shares_day = v_today
    where user_id = v_uid
    returning * into v_prof;
  end if;

  return jsonb_build_object(
    'ok', true,
    'premiere_score', v_prof.premiere_score,
    'lives', v_prof.lives,
    'raw_shares_today', v_prof.raw_shares_today,
    'easter_egg_claimed', v_prof.easter_egg_claimed,
    'premiere_won', v_prof.premiere_won,
    'premiere_code', coalesce(v_prof.premiere_code, ''),
    'has_pending_ticket', (v_prof.pending_ticket_code is not null)
  );
end;
$$;

-- ============================================================================
-- RPC 2: Атомарный удар в Гонке за Премьерой (Асимптотика Near-Miss + Золотой билет)
-- Считает всю математику 0..100, потолок MAX_PREMIERE_WINNERS и выпадение обычного билета строго на сервере!
-- ============================================================================
create or replace function public.play_premiere_strike(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := left(coalesce(trim(p_user_id), ''), 64);
  v_today date := (now() at time zone 'utc')::date;
  v_last_try timestamptz;
  v_prof public.player_profiles%rowtype;
  v_cfg public.hunt_config%rowtype;
  v_daily_issued integer;
  v_already_won integer;
  v_won_code text;
  v_empty_prob numeric;
  v_roll numeric := random();
  v_delta numeric(6,2) := 0;
  v_new_score numeric(6,2);
begin
  if char_length(v_uid) < 3 then
    return jsonb_build_object('ok', false, 'status', 'invalid_user');
  end if;

  -- Анти-спам (не чаще 1 удара в 0.9 сек)
  select last_try_at into v_last_try from public.hunt_rate_limit where user_id = v_uid;
  if v_last_try is not null and (now() - v_last_try) < interval '0.9 seconds' then
    return jsonb_build_object('ok', false, 'status', 'rate_limited');
  end if;

  insert into public.hunt_rate_limit (user_id, last_try_at, total_tries)
  values (v_uid, now(), 1)
  on conflict (user_id) do update
    set last_try_at = now(), total_tries = public.hunt_rate_limit.total_tries + 1;

  insert into public.player_profiles (user_id, lives, raw_shares_day)
  values (v_uid, 3, v_today)
  on conflict (user_id) do nothing;

  select * into v_prof from public.player_profiles where user_id = v_uid for update;

  if v_prof.lives <= 0 then
    return jsonb_build_object(
      'ok', false,
      'status', 'no_lives',
      'premiere_score', v_prof.premiere_score,
      'lives', 0
    );
  end if;

  -- Списываем 1 жизнь за удар
  v_prof.lives := v_prof.lives - 1;

  -- Инкрементируем глобальный счётчик ударов
  update public.hunt_config
  set global_plays_count = global_plays_count + 1
  where id = 1
  returning * into v_cfg;

  -- 1. Проверка выпадения ЗОЛОТОЙ БОЧКИ с обычным билетом в кино (который НЕЛЬЗЯ забрать себе!)
  if v_prof.pending_ticket_code is null and (v_cfg.global_plays_count % greatest(1, v_cfg.ticket_every_n)) = 0 then
    select count(*) into v_daily_issued from public.ticket_codes where claim_day = v_today;
    select count(*) into v_already_won from public.ticket_codes where claimed_by = v_uid and claim_day = v_today;

    if v_daily_issued < v_cfg.max_daily_tickets and v_already_won = 0 then
      update public.ticket_codes
      set claimed_by = v_uid, claimed_at = now(), claim_day = v_today
      where code = (
        select code from public.ticket_codes where claimed_by is null limit 1 for update skip locked
      )
      returning code into v_won_code;

      if v_won_code is null then
        v_won_code := 'BOCHKA-1712-' || upper(substr(md5(v_uid || v_cfg.global_plays_count::text || clock_timestamp()::text), 1, 8));
        insert into public.ticket_codes (code, claimed_by, claimed_at, claim_day)
        values (v_won_code, v_uid, now(), v_today);
      end if;

      update public.player_profiles
      set lives = v_prof.lives,
          pending_ticket_code = v_won_code,
          updated_at = now()
      where user_id = v_uid;

      -- ВАЖНО: сам промокод клиенту НЕ отдаём, пока он не выберет Сжечь (x2) или Подарить другу с фото!
      return jsonb_build_object(
        'ok', true,
        'outcome', 'golden_ticket',
        'premiere_score', v_prof.premiere_score,
        'lives', v_prof.lives,
        'has_pending_ticket', true
      );
    end if;
  end if;

  -- 2. Асимптотическая математика Гонки за Премьерой (0..100 баллов)
  if v_prof.premiere_score < 35 then
    v_empty_prob := 0.16;
    v_delta := 35.0;
  elsif v_prof.premiere_score < 60 then
    v_empty_prob := 0.22;
    v_delta := 25.0;
  elsif v_prof.premiere_score < 80 then
    v_empty_prob := 0.26;
    v_delta := 20.0;
  elsif v_prof.premiere_score < 90 then
    v_empty_prob := 0.34;
    v_delta := 10.5;
  elsif v_prof.premiere_score < 94.5 then
    -- После 90 баллов вероятность пустой бочки со скримером утраивается!
    v_empty_prob := 0.68;
    v_delta := 3.0;
  elsif v_prof.premiere_score < 97.5 then
    v_empty_prob := 0.72;
    v_delta := 1.5;
  elsif v_prof.premiere_score < 98.7 then
    v_empty_prob := 0.75;
    v_delta := 0.4;
  else
    v_empty_prob := 0.78;
    v_delta := 0.1;
  end if;

  -- Промах (пустая бочка + фирменный скример из фильма)
  if v_roll < v_empty_prob then
    update public.player_profiles
    set lives = v_prof.lives, updated_at = now()
    where user_id = v_uid;

    return jsonb_build_object(
      'ok', true,
      'outcome', 'empty_screamer',
      'delta', 0,
      'premiere_score', v_prof.premiere_score,
      'lives', v_prof.lives,
      'near_miss', (v_prof.premiere_score >= 90.0 and v_prof.lives = 0)
    );
  end if;

  v_new_score := round(v_prof.premiere_score + v_delta, 1);

  -- Проверка потолка MAX_PREMIERE_WINNERS при достижении 100.0
  if v_new_score >= 100.0 then
    if not v_prof.premiere_won and v_cfg.premiere_winners_count < v_cfg.max_premiere_winners then
      update public.hunt_config
      set premiere_winners_count = premiere_winners_count + 1
      where id = 1 and premiere_winners_count < max_premiere_winners;

      if found then
        v_prof.premiere_won := true;
        v_prof.premiere_code := 'PREMIERE-1712-' || upper(substr(md5(v_uid || clock_timestamp()::text), 1, 8));
        v_new_score := 100.0;

        update public.player_profiles
        set premiere_score = v_new_score,
            lives = v_prof.lives,
            premiere_won = true,
            premiere_code = v_prof.premiere_code,
            updated_at = now()
        where user_id = v_uid;

        return jsonb_build_object(
          'ok', true,
          'outcome', 'premiere_won',
          'delta', round(v_new_score - v_prof.premiere_score, 1),
          'premiere_score', 100.0,
          'lives', v_prof.lives,
          'premiere_code', v_prof.premiere_code,
          'contact', v_cfg.premiere_contact
        );
      end if;
    end if;

    -- Лимит мест на красную дорожку исчерпан -> удерживаем на 99.9 / 100
    v_new_score := 99.9;
  end if;

  v_delta := greatest(0, round(v_new_score - v_prof.premiere_score, 1));

  update public.player_profiles
  set premiere_score = v_new_score,
      lives = v_prof.lives,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'score_hit',
    'delta', v_delta,
    'premiere_score', v_new_score,
    'lives', v_prof.lives,
    'near_miss', (v_new_score >= 90.0 and v_prof.lives = 0)
  );
end;
$$;

-- ============================================================================
-- RPC 3: Обратная совместимость try_win_ticket(user_id)
-- ============================================================================
create or replace function public.try_win_ticket(user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.play_premiere_strike(user_id);
end;
$$;

-- ============================================================================
-- RPC 4: Вирусное пополнение жизней (+1 за отправку до 3/сутки, +2 за вход друга)
-- ============================================================================
create or replace function public.claim_share_life(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := left(coalesce(trim(p_user_id), ''), 64);
  v_today date := (now() at time zone 'utc')::date;
  v_prof public.player_profiles%rowtype;
begin
  if char_length(v_uid) < 3 then
    return jsonb_build_object('ok', false, 'granted', 0);
  end if;

  insert into public.player_profiles (user_id, lives, raw_shares_day)
  values (v_uid, 3, v_today)
  on conflict (user_id) do nothing;

  select * into v_prof from public.player_profiles where user_id = v_uid for update;

  if v_prof.raw_shares_day is distinct from v_today then
    v_prof.raw_shares_today := 0;
    v_prof.raw_shares_day := v_today;
  end if;

  if v_prof.raw_shares_today >= 3 then
    return jsonb_build_object(
      'ok', true,
      'granted', 0,
      'reason', 'daily_share_cap',
      'lives', v_prof.lives,
      'raw_shares_today', v_prof.raw_shares_today
    );
  end if;

  v_prof.raw_shares_today := v_prof.raw_shares_today + 1;
  v_prof.lives := v_prof.lives + 1;

  update public.player_profiles
  set lives = v_prof.lives,
      raw_shares_today = v_prof.raw_shares_today,
      raw_shares_day = v_today,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'granted', 1,
    'lives', v_prof.lives,
    'raw_shares_today', v_prof.raw_shares_today
  );
end;
$$;

create or replace function public.credit_friend_opened_lives(p_barrel_id text, p_viewer_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid text := left(coalesce(trim(p_barrel_id), ''), 32);
  v_vuid text := left(coalesce(trim(p_viewer_uid), ''), 64);
  v_sender_uid text;
  v_new_lives integer;
begin
  if char_length(v_bid) < 3 or char_length(v_vuid) < 3 then
    return jsonb_build_object('ok', false, 'credited', 0);
  end if;

  select sender_uid into v_sender_uid from public.barrels where id = v_bid;
  if v_sender_uid is null or v_sender_uid = '' or v_sender_uid = v_vuid then
    return jsonb_build_object('ok', false, 'credited', 0, 'reason', 'self_or_missing');
  end if;

  insert into public.barrel_opens_ledger (barrel_id, viewer_uid)
  values (v_bid, v_vuid)
  on conflict do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'credited', 0, 'reason', 'already_credited');
  end if;

  insert into public.player_profiles (user_id, lives)
  values (v_sender_uid, 5)
  on conflict (user_id) do update
    set lives = public.player_profiles.lives + 2,
        updated_at = now()
  returning lives into v_new_lives;

  return jsonb_build_object('ok', true, 'credited', 2, 'sender_lives', v_new_lives);
end;
$$;

-- ============================================================================
-- RPC 5: ПРАВИЛО «ЧУЖОГО БИЛЕТА» — Путь А (Сжечь за x2 жизней) и Путь Б (Подарить с фото)
-- ============================================================================
create or replace function public.burn_regular_ticket(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := left(coalesce(trim(p_user_id), ''), 64);
  v_prof public.player_profiles%rowtype;
  v_new_lives integer;
begin
  select * into v_prof from public.player_profiles where user_id = v_uid for update;
  if not found or v_prof.pending_ticket_code is null then
    return jsonb_build_object('ok', false, 'error', 'no_pending_ticket');
  end if;

  -- Возвращаем сожжённый код обратно в свободный пул кинотеатра, чтобы билет не пропал зря!
  update public.ticket_codes
  set claimed_by = null, claimed_at = null, claim_day = null
  where code = v_prof.pending_ticket_code;

  v_new_lives := greatest(4, v_prof.lives * 2);

  update public.player_profiles
  set pending_ticket_code = null,
      lives = v_new_lives,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object('ok', true, 'lives', v_new_lives);
end;
$$;

create or replace function public.create_gift_ticket_pass(
  p_user_id text,
  p_pass_id text,
  p_recipient_name text,
  p_recipient_photo_url text,
  p_sender_name text default '',
  p_sender_tg_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := left(coalesce(trim(p_user_id), ''), 64);
  v_pid text := left(coalesce(trim(p_pass_id), ''), 24);
  v_rname text := left(coalesce(trim(p_recipient_name), ''), 40);
  v_photo text := trim(coalesce(p_recipient_photo_url, ''));
  v_prof public.player_profiles%rowtype;
begin
  if char_length(v_pid) < 5 or char_length(v_rname) < 2 or char_length(v_photo) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_pass_fields');
  end if;

  select * into v_prof from public.player_profiles where user_id = v_uid for update;
  if not found or v_prof.pending_ticket_code is null then
    return jsonb_build_object('ok', false, 'error', 'no_pending_ticket');
  end if;

  insert into public.ticket_passes (
    id, ticket_code, sender_uid, sender_tg_id, sender_name, recipient_name, recipient_photo_url
  ) values (
    v_pid,
    v_prof.pending_ticket_code,
    v_uid,
    p_sender_tg_id,
    left(coalesce(trim(p_sender_name), ''), 32),
    v_rname,
    v_photo
  );

  update public.player_profiles
  set pending_ticket_code = null,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object('ok', true, 'pass_id', v_pid);
end;
$$;

create or replace function public.get_gift_ticket_pass(p_pass_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text := left(coalesce(trim(p_pass_id), ''), 24);
  v_pass public.ticket_passes%rowtype;
  v_contact text;
begin
  select * into v_pass from public.ticket_passes where id = v_pid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select claim_contact into v_contact from public.hunt_config where id = 1;

  return jsonb_build_object(
    'ok', true,
    'id', v_pass.id,
    'recipient_name', v_pass.recipient_name,
    'recipient_photo_url', v_pass.recipient_photo_url,
    'sender_name', v_pass.sender_name,
    'sender_uid', v_pass.sender_uid,
    'sender_tg_id', coalesce(v_pass.sender_tg_id, ''),
    'accepted', v_pass.accepted,
    'ticket_code', case when v_pass.accepted then v_pass.ticket_code else '' end,
    'contact', coalesce(v_contact, ''),
    'server_now_ms', floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );
end;
$$;

create or replace function public.accept_gift_ticket_pass(p_pass_id text, p_recipient_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text := left(coalesce(trim(p_pass_id), ''), 24);
  v_ruid text := left(coalesce(trim(p_recipient_uid), ''), 64);
  v_pass public.ticket_passes%rowtype;
  v_sender_lives integer := 0;
  v_contact text;
begin
  select * into v_pass from public.ticket_passes where id = v_pid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_pass.sender_uid = v_ruid then
    return jsonb_build_object('ok', false, 'error', 'cannot_claim_own_ticket');
  end if;

  if not v_pass.accepted then
    update public.ticket_passes
    set accepted = true,
        accepted_by_uid = v_ruid,
        accepted_at = now(),
        sender_x2_credited = true
    where id = v_pid
    returning * into v_pass;

    -- Начисляем отправителю билета множитель x2 к жизням!
    update public.player_profiles
    set lives = greatest(4, lives * 2),
        updated_at = now()
    where user_id = v_pass.sender_uid
    returning lives into v_sender_lives;
  end if;

  select claim_contact into v_contact from public.hunt_config where id = 1;

  return jsonb_build_object(
    'ok', true,
    'accepted', true,
    'ticket_code', v_pass.ticket_code,
    'recipient_name', v_pass.recipient_name,
    'recipient_photo_url', v_pass.recipient_photo_url,
    'sender_tg_id', coalesce(v_pass.sender_tg_id, ''),
    'sender_lives', v_sender_lives,
    'contact', coalesce(v_contact, ''),
    'server_now_ms', floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );
end;
$$;

-- ============================================================================
-- RPC 6: СЕКРЕТНАЯ ПАСХАЛКА «ДОСТУЧАТЬСЯ ДО НЕБЕС» (19 -> 97 -> 3 стука = +3 жизни)
-- ============================================================================
create or replace function public.claim_easter_egg_1997(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := left(coalesce(trim(p_user_id), ''), 64);
  v_prof public.player_profiles%rowtype;
begin
  if char_length(v_uid) < 3 then
    return jsonb_build_object('ok', false, 'granted', 0);
  end if;

  insert into public.player_profiles (user_id, lives)
  values (v_uid, 3)
  on conflict (user_id) do nothing;

  select * into v_prof from public.player_profiles where user_id = v_uid for update;

  if v_prof.easter_egg_claimed then
    return jsonb_build_object('ok', true, 'granted', 0, 'already_claimed', true, 'lives', v_prof.lives);
  end if;

  v_prof.lives := v_prof.lives + 3;

  update public.player_profiles
  set easter_egg_claimed = true,
      lives = v_prof.lives,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object('ok', true, 'granted', 3, 'already_claimed', false, 'lives', v_prof.lives);
end;
$$;

revoke all on function public.get_player_profile(text) from public;
revoke all on function public.play_premiere_strike(text) from public;
revoke all on function public.try_win_ticket(text) from public;
revoke all on function public.claim_share_life(text) from public;
revoke all on function public.credit_friend_opened_lives(text, text) from public;
revoke all on function public.burn_regular_ticket(text) from public;
revoke all on function public.create_gift_ticket_pass(text, text, text, text, text, text) from public;
revoke all on function public.get_gift_ticket_pass(text) from public;
revoke all on function public.accept_gift_ticket_pass(text, text) from public;
revoke all on function public.claim_easter_egg_1997(text) from public;

grant execute on function public.get_player_profile(text) to anon, authenticated;
grant execute on function public.play_premiere_strike(text) to anon, authenticated;
grant execute on function public.try_win_ticket(text) to anon, authenticated;
grant execute on function public.claim_share_life(text) to anon, authenticated;
grant execute on function public.credit_friend_opened_lives(text, text) to anon, authenticated;
grant execute on function public.burn_regular_ticket(text) to anon, authenticated;
grant execute on function public.create_gift_ticket_pass(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_gift_ticket_pass(text) to anon, authenticated;
grant execute on function public.accept_gift_ticket_pass(text, text) to anon, authenticated;
grant execute on function public.claim_easter_egg_1997(text) to anon, authenticated;
