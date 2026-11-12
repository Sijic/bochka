-- ============================================================================
-- БОЧКА: Достучаться до небес (v4.0 Master Production Schema)
-- Supabase Free-Tier Optimized (100k+ players, 0 Edge overhead on gameplay clicks)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ТАБЛИЦА АДМИНИСТРАТОРОВ КАБИНЕТА ПРОДЮСЕРА (/admin)
CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. ГЛОБАЛЬНАЯ СТАТИСТИКА, ВОРОНКА И ЖИВЫЕ ЛИМИТЫ РОЗЫГРЫША (Singleton id = 1)
CREATE TABLE IF NOT EXISTS public.global_stats (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_strikes bigint NOT NULL DEFAULT 0,
  win_every_n_hits integer NOT NULL DEFAULT 100 CHECK (win_every_n_hits >= 1),
  max_daily_tickets integer NOT NULL DEFAULT 5 CHECK (max_daily_tickets >= 0),
  daily_tickets_issued integer NOT NULL DEFAULT 0,
  daily_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  max_premiere_winners integer NOT NULL DEFAULT 20 CHECK (max_premiere_winners >= 0),
  premiere_winners_count integer NOT NULL DEFAULT 0,
  is_paused boolean NOT NULL DEFAULT false,
  total_players bigint NOT NULL DEFAULT 0,
  barrels_created bigint NOT NULL DEFAULT 0,
  barrels_opened bigint NOT NULL DEFAULT 0,
  kp_clicks bigint NOT NULL DEFAULT 0,
  trailer_completions bigint NOT NULL DEFAULT 0,
  cinema_intent_clicks bigint NOT NULL DEFAULT 0,
  ocean_secret_opens bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.global_stats (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 3. ПОСУТОЧНАЯ АНАЛИТИКА ДЛЯ ГРАФИКА В /admin
CREATE TABLE IF NOT EXISTS public.daily_metrics (
  day date PRIMARY KEY DEFAULT CURRENT_DATE,
  players integer NOT NULL DEFAULT 0,
  barrels_created integer NOT NULL DEFAULT 0,
  barrels_opened integer NOT NULL DEFAULT 0,
  kp_clicks integer NOT NULL DEFAULT 0,
  trailer_completions integer NOT NULL DEFAULT 0,
  cinema_clicks integer NOT NULL DEFAULT 0,
  ocean_opens integer NOT NULL DEFAULT 0,
  tickets_ordered integer NOT NULL DEFAULT 0
);

-- 4. ИГРОКИ (компактная таблица без base64, индексы по tg_user_id и premiere_score)
CREATE TABLE IF NOT EXISTS public.users (
  uid text PRIMARY KEY,
  tg_user_id text,
  tg_username text,
  display_name text,
  lives integer NOT NULL DEFAULT 3 CHECK (lives >= 0),
  premiere_score numeric(6,2) NOT NULL DEFAULT 0.00 CHECK (premiere_score >= 0 AND premiere_score <= 100),
  premiere_won boolean NOT NULL DEFAULT false,
  premiere_confirmed boolean NOT NULL DEFAULT false,
  premiere_code text,
  has_pending_ticket boolean NOT NULL DEFAULT false,
  kp_verified boolean NOT NULL DEFAULT false,
  kp_screenshot_url text,
  packed_count integer NOT NULL DEFAULT 0,
  friends_brought integer NOT NULL DEFAULT 0,
  daily_shares_count integer NOT NULL DEFAULT 0,
  daily_shares_date date NOT NULL DEFAULT CURRENT_DATE,
  easter_egg_claimed boolean NOT NULL DEFAULT false,
  easter_egg_best_taps integer NOT NULL DEFAULT 0,
  easter_egg_gift_won boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tg_user_id ON public.users (tg_user_id);
CREATE INDEX IF NOT EXISTS idx_users_premiere_score ON public.users (premiere_score DESC, friends_brought DESC);

-- 5. ЗАВАРЕННЫЕ ПРАНК-БОЧКИ (только короткие ID и URL на Storage barrel-media)
CREATE TABLE IF NOT EXISTS public.barrels (
  short_id text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'friend',
  message text NOT NULL DEFAULT '',
  frame_style text NOT NULL DEFAULT 'flashlight',
  sender_uid text,
  sender_tg_id text,
  sender_username text,
  sender_name text NOT NULL DEFAULT '',
  photo_url text,
  voice_url text,
  target_index smallint NOT NULL DEFAULT 0,
  opens_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_barrels_sender_tg_id ON public.barrels (sender_tg_id);
CREATE INDEX IF NOT EXISTS idx_barrels_created_at ON public.barrels (created_at);

-- Реестр уникальных открытий бочек друзьями (+2 жизни только за живого нового друга)
CREATE TABLE IF NOT EXISTS public.barrel_opens_ledger (
  barrel_id text NOT NULL REFERENCES public.barrels(short_id) ON DELETE CASCADE,
  opener_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (barrel_id, opener_uid)
);

-- 6. ПОДТВЕРЖДЁННЫЕ КОНТАКТЫ TELEGRAM (заполняется вебхуком из системного request_contact)
CREATE TABLE IF NOT EXISTS public.verified_contacts (
  tg_user_id text PRIMARY KEY,
  phone text NOT NULL,
  first_name text,
  verified_at timestamptz NOT NULL DEFAULT now()
);

-- 7. ПОДАРОЧНЫЕ ССЫЛКИ НА БИЛЕТ ДРУГУ (startapp=gift_<short_id>)
CREATE TABLE IF NOT EXISTS public.ticket_passes (
  short_id text PRIMARY KEY,
  sender_uid text NOT NULL,
  sender_tg_id text,
  sender_username text,
  sender_name text NOT NULL DEFAULT '',
  recipient_name text NOT NULL DEFAULT '',
  recipient_photo_url text,
  kp_screenshot_url text,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'claimed', 'sent', 'rejected')),
  receiver_uid text,
  receiver_tg_id text,
  receiver_username text,
  sender_rewarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ticket_passes_sender_tg ON public.ticket_passes (sender_tg_id);

-- 8. ЗАЯВКИ НА ВЫПИСКУ ЭЛЕКТРОННЫХ БИЛЕТОВ В КАБИНЕТЕ ПРОДЮСЕРА (/admin)
CREATE TABLE IF NOT EXISTS public.ticket_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id text UNIQUE REFERENCES public.ticket_passes(short_id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'rejected')),
  receiver_uid text,
  receiver_tg_id text NOT NULL,
  receiver_username text,
  receiver_name text NOT NULL DEFAULT '',
  verified_phone text NOT NULL UNIQUE,
  city_cinema text NOT NULL,
  recipient_photo_url text,
  sender_uid text,
  sender_tg_id text,
  sender_username text,
  sender_name text,
  kp_screenshot_url text,
  booking_code text,
  ticket_file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ticket_orders_status ON public.ticket_orders (status, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (СТРОГАЯ ЗАЩИТА ВСЕХ ТАБЛИЦ)
-- ============================================================================
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barrels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barrel_opens_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;

-- Вспомогательная проверка прав продюсера (Supabase Auth)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Admins read own row" ON public.admins;
CREATE POLICY "Admins read own row" ON public.admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins full access global_stats" ON public.global_stats;
CREATE POLICY "Admins full access global_stats" ON public.global_stats
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public keepalive ping global_stats" ON public.global_stats;
CREATE POLICY "Public keepalive ping global_stats" ON public.global_stats
  FOR SELECT TO anon
  USING (id = 1);

DROP POLICY IF EXISTS "Admins read daily_metrics" ON public.daily_metrics;
CREATE POLICY "Admins read daily_metrics" ON public.daily_metrics
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read users" ON public.users;
CREATE POLICY "Admins read users" ON public.users
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update users" ON public.users;
CREATE POLICY "Admins update users" ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access ticket_orders" ON public.ticket_orders;
CREATE POLICY "Admins full access ticket_orders" ON public.ticket_orders
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read ticket_passes" ON public.ticket_passes;
CREATE POLICY "Admins read ticket_passes" ON public.ticket_passes
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- STORAGE BUCKETS: barrel-media (80 KB, 5-day TTL) & cinema-passes (2 MB, permanent)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'barrel-media',
  'barrel-media',
  true,
  81920,
  ARRAY['image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 81920,
  allowed_mime_types = ARRAY['image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cinema-passes',
  'cinema-passes',
  true,
  2097152,
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png', 'application/pdf'];

DROP POLICY IF EXISTS "Public read bochka buckets" ON storage.objects;
CREATE POLICY "Public read bochka buckets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id IN ('barrel-media', 'cinema-passes'));

DROP POLICY IF EXISTS "Anon upload barrel-media" ON storage.objects;
CREATE POLICY "Anon upload barrel-media"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'barrel-media'
    AND (storage.foldername(name))[1] IN ('portraits', 'voices')
  );

DROP POLICY IF EXISTS "Anon upload cinema-passes photos" ON storage.objects;
CREATE POLICY "Anon upload cinema-passes photos"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'cinema-passes'
    AND (storage.foldername(name))[1] IN ('passes', 'kp', 'tickets')
  );

-- ============================================================================
-- ХЕЛПЕР ПОСУТОЧНОЙ ВОРОНКИ
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bump_daily_metric(p_field text, p_delta integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.daily_metrics (day)
  VALUES (CURRENT_DATE)
  ON CONFLICT (day) DO NOTHING;

  IF p_field = 'players' THEN
    UPDATE public.daily_metrics SET players = players + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET total_players = total_players + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'barrels_created' THEN
    UPDATE public.daily_metrics SET barrels_created = barrels_created + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET barrels_created = barrels_created + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'barrels_opened' THEN
    UPDATE public.daily_metrics SET barrels_opened = barrels_opened + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET barrels_opened = barrels_opened + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'kp_clicks' THEN
    UPDATE public.daily_metrics SET kp_clicks = kp_clicks + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET kp_clicks = kp_clicks + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'trailer_completions' THEN
    UPDATE public.daily_metrics SET trailer_completions = trailer_completions + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET trailer_completions = trailer_completions + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'cinema_clicks' THEN
    UPDATE public.daily_metrics SET cinema_clicks = cinema_clicks + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET cinema_intent_clicks = cinema_intent_clicks + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'ocean_opens' THEN
    UPDATE public.daily_metrics SET ocean_opens = ocean_opens + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET ocean_secret_opens = ocean_secret_opens + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'tickets_ordered' THEN
    UPDATE public.daily_metrics SET tickets_ordered = tickets_ordered + p_delta WHERE day = CURRENT_DATE;
  END IF;
END;
$$;

-- ============================================================================
-- RPC 1: РЕГИСТРАЦИЯ / СИНХРОНИЗАЦИЯ ПРОФИЛЯ ИГРОКА
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_or_create_player_profile(
  p_uid text,
  p_tg_id text DEFAULT NULL,
  p_tg_username text DEFAULT NULL,
  p_display_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  inserted_count int := 0;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid, tg_user_id, tg_username, display_name, lives)
  VALUES (
    trim(p_uid),
    NULLIF(trim(COALESCE(p_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_tg_username, '')), ''),
    COALESCE(p_display_name, ''),
    3
  )
  ON CONFLICT (uid) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    PERFORM public.bump_daily_metric('players', 1);
  END IF;

  UPDATE public.users
  SET
    tg_user_id = COALESCE(NULLIF(trim(COALESCE(p_tg_id, '')), ''), tg_user_id),
    tg_username = COALESCE(NULLIF(trim(COALESCE(p_tg_username, '')), ''), tg_username),
    display_name = CASE WHEN length(trim(COALESCE(p_display_name, ''))) > 0 THEN trim(p_display_name) ELSE display_name END,
    daily_shares_count = CASE WHEN daily_shares_date < CURRENT_DATE THEN 0 ELSE daily_shares_count END,
    daily_shares_date = CURRENT_DATE,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'lives', u.lives,
    'premiere_score', u.premiere_score,
    'premiere_won', u.premiere_won,
    'premiere_confirmed', u.premiere_confirmed,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'has_pending_ticket', u.has_pending_ticket,
    'kp_verified', u.kp_verified,
    'kp_screenshot_url', COALESCE(u.kp_screenshot_url, ''),
    'packed_count', u.packed_count,
    'friends_brought', u.friends_brought,
    'daily_shares_count', u.daily_shares_count,
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps,
    'easter_egg_gift_won', u.easter_egg_gift_won
  );
END;
$$;

-- ============================================================================
-- RPC 2: СОЗДАНИЕ И ЧТЕНИЕ ЗАВАРЕННОЙ БОЧКИ (?b=SHORT_ID / startapp=SHORT_ID)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_barrel_pack_rpc(
  p_short_id text,
  p_mode text,
  p_message text,
  p_frame_style text,
  p_sender_uid text,
  p_sender_tg_id text,
  p_sender_username text,
  p_sender_name text,
  p_photo_url text,
  p_voice_url text,
  p_target_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_short_id IS NULL OR length(trim(p_short_id)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_short_id');
  END IF;

  INSERT INTO public.barrels (
    short_id, mode, message, frame_style,
    sender_uid, sender_tg_id, sender_username, sender_name,
    photo_url, voice_url, target_index
  )
  VALUES (
    trim(p_short_id),
    COALESCE(p_mode, 'friend'),
    left(COALESCE(p_message, ''), 80),
    COALESCE(p_frame_style, 'flashlight'),
    NULLIF(trim(COALESCE(p_sender_uid, '')), ''),
    NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_sender_username, '')), ''),
    left(COALESCE(p_sender_name, ''), 40),
    NULLIF(trim(COALESCE(p_photo_url, '')), ''),
    NULLIF(trim(COALESCE(p_voice_url, '')), ''),
    GREATEST(0, LEAST(5, COALESCE(p_target_index, 0)))
  );

  IF p_sender_uid IS NOT NULL AND length(trim(p_sender_uid)) >= 2 THEN
    INSERT INTO public.users (uid, tg_user_id, tg_username, display_name, packed_count)
    VALUES (trim(p_sender_uid), NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''), NULLIF(trim(COALESCE(p_sender_username, '')), ''), COALESCE(p_sender_name, ''), 1)
    ON CONFLICT (uid) DO UPDATE SET
      packed_count = public.users.packed_count + 1,
      updated_at = now();
  END IF;

  PERFORM public.bump_daily_metric('barrels_created', 1);
  RETURN jsonb_build_object('ok', true, 'short_id', trim(p_short_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_barrel_pack_rpc(p_short_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.barrels%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.barrels WHERE short_id = trim(COALESCE(p_short_id, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', b.short_id,
    'mode', b.mode,
    'message', b.message,
    'frame_style', b.frame_style,
    'sender_uid', COALESCE(b.sender_uid, ''),
    'sender_tg_id', COALESCE(b.sender_tg_id, ''),
    'sender_username', COALESCE(b.sender_username, ''),
    'sender_name', COALESCE(b.sender_name, ''),
    'photo_url', COALESCE(b.photo_url, ''),
    'voice_url', COALESCE(b.voice_url, ''),
    'target_index', b.target_index
  );
END;
$$;

-- ============================================================================
-- RPC 3: УЧЁТ СОБЫТИЙ ВОРОНКИ + ПОДТВЕРЖДЕНИЕ СКРИНШОТА КИНОПОИСКА
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_funnel_event_rpc(
  p_event text,
  p_uid text DEFAULT NULL,
  p_kp_screenshot_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event IN ('kp_clicks', 'trailer_completions', 'cinema_clicks', 'ocean_opens') THEN
    PERFORM public.bump_daily_metric(p_event, 1);
  END IF;

  IF p_event = 'kp_screenshot_verified' AND p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    UPDATE public.users
    SET
      kp_verified = true,
      kp_screenshot_url = COALESCE(NULLIF(trim(COALESCE(p_kp_screenshot_url, '')), ''), kp_screenshot_url),
      lives = lives + CASE WHEN NOT kp_verified THEN 1 ELSE 0 END,
      updated_at = now()
    WHERE uid = trim(p_uid);
    PERFORM public.bump_daily_metric('kp_clicks', 1);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================================
-- RPC 4: +1 ЖИЗНЬ ЗА ОТПРАВКУ БОЧКИ (до 3/сутки) И +2 ЖИЗНИ ЗА ОТКРЫТИЕ ДРУГОМ
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_share_life(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
BEGIN
  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF u.daily_shares_date < CURRENT_DATE THEN
    u.daily_shares_count := 0;
    u.daily_shares_date := CURRENT_DATE;
  END IF;

  IF u.daily_shares_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit', 'lives', u.lives, 'daily_shares_count', u.daily_shares_count);
  END IF;

  UPDATE public.users
  SET
    lives = lives + 1,
    daily_shares_count = u.daily_shares_count + 1,
    daily_shares_date = CURRENT_DATE,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object('ok', true, 'lives', u.lives, 'daily_shares_count', u.daily_shares_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_friend_opened_lives(
  p_barrel_id text,
  p_sender_uid text,
  p_opener_uid text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows integer := 0;
  new_lives integer := 0;
  sender_tg text := '';
BEGIN
  IF p_barrel_id IS NULL OR p_opener_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'credited', false);
  END IF;

  UPDATE public.barrels SET opens_count = opens_count + 1 WHERE short_id = trim(p_barrel_id);
  PERFORM public.bump_daily_metric('barrels_opened', 1);

  IF p_sender_uid IS NULL OR length(trim(p_sender_uid)) < 2 OR trim(p_sender_uid) = trim(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', true, 'credited', false, 'reason', 'self_or_empty_sender');
  END IF;

  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (trim(p_barrel_id), trim(p_opener_uid))
  ON CONFLICT (barrel_id, opener_uid) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  IF inserted_rows = 0 THEN
    RETURN jsonb_build_object('ok', true, 'credited', false, 'reason', 'already_counted');
  END IF;

  PERFORM public.get_or_create_player_profile(p_sender_uid, NULL, NULL, '');

  UPDATE public.users
  SET
    lives = lives + 2,
    friends_brought = friends_brought + 1,
    updated_at = now()
  WHERE uid = trim(p_sender_uid)
  RETURNING lives, COALESCE(tg_user_id, '') INTO new_lives, sender_tg;

  RETURN jsonb_build_object('ok', true, 'credited', true, 'sender_lives', new_lives, 'sender_tg_id', sender_tg);
END;
$$;

-- ============================================================================
-- RPC 5: СЕКРЕТНЫЙ УРОВЕНЬ С ТИЛЕМ У МОРЯ (ТАП ПО БОЧКЕ НА ВРЕМЯ — 10 СЕК)
-- Больше тапов -> больше жизней (+3..+5 ❤️), а при 40+ тапах — Подарочный билет для друга!
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_ocean_tapper_reward(
  p_uid text,
  p_taps integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  clean_taps integer := GREATEST(0, LEAST(130, COALESCE(p_taps, 0)));
  lives_award integer := 0;
  gift_awarded boolean := false;
BEGIN
  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF NOT u.easter_egg_claimed THEN
    IF clean_taps >= 40 THEN
      lives_award := 5;
    ELSIF clean_taps >= 20 THEN
      lives_award := 4;
    ELSE
      lives_award := 3;
    END IF;
  END IF;

  -- Если набил 40+ честных ударов за 10 сек и ещё не выбивал морской билет для друга -> даём право на Подарочный билет другу!
  IF clean_taps >= 40 AND NOT u.easter_egg_gift_won AND NOT u.has_pending_ticket THEN
    gift_awarded := true;
  END IF;

  UPDATE public.users
  SET
    easter_egg_claimed = true,
    easter_egg_best_taps = GREATEST(easter_egg_best_taps, clean_taps),
    easter_egg_gift_won = (easter_egg_gift_won OR gift_awarded),
    has_pending_ticket = (has_pending_ticket OR gift_awarded),
    lives = lives + lives_award,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'lives_awarded', lives_award,
    'gift_awarded', gift_awarded,
    'already_claimed', (lives_award = 0 AND NOT gift_awarded),
    'lives', u.lives,
    'best_taps', u.easter_egg_best_taps,
    'has_pending_ticket', u.has_pending_ticket
  );
END;
$$;

-- ============================================================================
-- RPC 6: СУПЕРИГРА «ГОНКА ЗА ПРЕМЬЕРОЙ (0..100)» + ВЫПАДЕНИЕ БИЛЕТА ДРУГУ (try_win_ticket)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.play_premiere_strike(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  cfg public.global_stats%ROWTYPE;
  roll numeric := random();
  delta numeric(6,2) := 0.00;
  new_score numeric(6,2);
  outcome text := 'empty_screamer';
  gen_premiere_code text := NULL;
BEGIN
  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF u.has_pending_ticket THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'pending_ticket_choice',
      'lives', u.lives,
      'premiere_score', u.premiere_score,
      'has_pending_ticket', true
    );
  END IF;

  IF u.lives <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_lives',
      'lives', 0,
      'premiere_score', u.premiere_score,
      'near_miss', (u.premiere_score >= 90.0)
    );
  END IF;

  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF cfg.daily_reset_date < CURRENT_DATE THEN
    cfg.daily_tickets_issued := 0;
    cfg.daily_reset_date := CURRENT_DATE;
  END IF;
  cfg.total_strikes := cfg.total_strikes + 1;

  u.lives := u.lives - 1;

  -- Проверка выпадения Золотой бочки с Подарочным билетом другу (каждый WIN_EVERY_N_HITS удар в рамках MAX_DAILY_TICKETS)
  IF NOT cfg.is_paused
     AND (cfg.total_strikes % cfg.win_every_n_hits) = 0
     AND cfg.daily_tickets_issued < cfg.max_daily_tickets
  THEN
    cfg.daily_tickets_issued := cfg.daily_tickets_issued + 1;
    u.has_pending_ticket := true;
    outcome := 'golden_ticket';
  ELSE
    -- Асимптотика шкалы «Допуск на закрытую Премьеру: 0 / 100» (ШАГ 5)
    IF u.premiere_score < 35 THEN
      IF roll < 0.78 THEN delta := 35.00; outcome := 'score_hit'; END IF;
    ELSIF u.premiere_score < 60 THEN
      IF roll < 0.68 THEN delta := 25.00; outcome := 'score_hit'; END IF;
    ELSIF u.premiere_score < 80 THEN
      IF roll < 0.58 THEN delta := 20.00; outcome := 'score_hit'; END IF;
    ELSIF u.premiere_score < 90 THEN
      IF roll < 0.50 THEN delta := 10.00; outcome := 'score_hit'; END IF;
    ELSIF u.premiere_score < 95 THEN
      IF roll < 0.42 THEN delta := 3.00; outcome := 'score_hit'; END IF;
    ELSIF u.premiere_score < 98.0 THEN
      IF roll < 0.36 THEN delta := 1.50; outcome := 'score_hit'; END IF;
    ELSIF u.premiere_score < 99.4 THEN
      IF roll < 0.30 THEN delta := 0.40; outcome := 'score_hit'; END IF;
    ELSE
      IF NOT cfg.is_paused AND NOT u.premiere_won AND cfg.premiere_winners_count < cfg.max_premiere_winners AND roll < 0.25 THEN
        delta := 100.00 - u.premiere_score;
        outcome := 'premiere_win';
      ELSIF roll < 0.30 THEN
        delta := LEAST(0.10, GREATEST(0.00, 99.90 - u.premiere_score));
        IF delta > 0 THEN outcome := 'score_hit'; END IF;
      END IF;
    END IF;
  END IF;

  new_score := LEAST(100.00, u.premiere_score + delta);

  IF outcome = 'premiere_win' AND new_score >= 100.00 THEN
    cfg.premiere_winners_count := cfg.premiere_winners_count + 1;
    gen_premiere_code := 'PREMIERE-17DEC-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));
    u.premiere_won := true;
    u.premiere_code := gen_premiere_code;
  ELSIF new_score >= 100.00 AND NOT u.premiere_won THEN
    new_score := 99.90;
  END IF;

  UPDATE public.global_stats
  SET
    total_strikes = cfg.total_strikes,
    daily_tickets_issued = cfg.daily_tickets_issued,
    daily_reset_date = cfg.daily_reset_date,
    premiere_winners_count = cfg.premiere_winners_count,
    updated_at = now()
  WHERE id = 1;

  UPDATE public.users
  SET
    lives = u.lives,
    premiere_score = new_score,
    premiere_won = u.premiere_won,
    premiere_code = u.premiere_code,
    has_pending_ticket = u.has_pending_ticket,
    updated_at = now()
  WHERE uid = trim(p_uid);

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', outcome,
    'delta', delta,
    'premiere_score', new_score,
    'lives', u.lives,
    'has_pending_ticket', u.has_pending_ticket,
    'premiere_won', u.premiere_won,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'near_miss', (u.lives = 0 AND new_score >= 90.0 AND NOT u.premiere_won)
  );
END;
$$;

-- Алиас try_win_ticket для совместимости
CREATE OR REPLACE FUNCTION public.try_win_ticket(p_uid text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.play_premiere_strike(p_uid);
$$;

-- ============================================================================
-- RPC 7: ВИЛКА ЧУЖОГО БИЛЕТА — ПУТЬ А (СЖЕЧЬ НА ×2) И ПУТЬ Б (ССЫЛКА gift_<id>)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.burn_ticket_for_x2_lives(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  boosted_lives integer;
BEGIN
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;
  IF NOT FOUND OR NOT u.has_pending_ticket THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_ticket');
  END IF;

  boosted_lives := GREATEST(2, u.lives * 2);

  UPDATE public.users
  SET
    has_pending_ticket = false,
    lives = boosted_lives,
    updated_at = now()
  WHERE uid = trim(p_uid);

  RETURN jsonb_build_object('ok', true, 'lives', boosted_lives);
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_gift_ticket_link(
  p_short_id text,
  p_sender_uid text,
  p_sender_tg_id text DEFAULT NULL,
  p_sender_username text DEFAULT NULL,
  p_sender_name text DEFAULT '',
  p_recipient_name text DEFAULT '',
  p_recipient_photo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.users WHERE uid = trim(p_sender_uid) FOR UPDATE;
  IF NOT FOUND OR NOT u.has_pending_ticket THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_ticket');
  END IF;

  INSERT INTO public.ticket_passes (
    short_id, sender_uid, sender_tg_id, sender_username, sender_name,
    recipient_name, recipient_photo_url, kp_screenshot_url, status
  )
  VALUES (
    trim(p_short_id),
    trim(p_sender_uid),
    NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_sender_username, '')), ''),
    left(COALESCE(p_sender_name, ''), 40),
    left(COALESCE(p_recipient_name, ''), 50),
    NULLIF(trim(COALESCE(p_recipient_photo_url, '')), ''),
    u.kp_screenshot_url,
    'issued'
  );

  UPDATE public.users
  SET
    has_pending_ticket = false,
    updated_at = now()
  WHERE uid = trim(p_sender_uid);

  RETURN jsonb_build_object('ok', true, 'gift_id', trim(p_short_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_gift_pass_public(
  p_short_id text,
  p_viewer_tg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tp public.ticket_passes%ROWTYPE;
  ord public.ticket_orders%ROWTYPE;
  vc public.verified_contacts%ROWTYPE;
  has_verified_phone boolean := false;
  masked_phone text := '';
BEGIN
  SELECT * INTO tp FROM public.ticket_passes WHERE short_id = trim(COALESCE(p_short_id, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF p_viewer_tg_id IS NOT NULL AND length(trim(p_viewer_tg_id)) > 0 THEN
    SELECT * INTO vc FROM public.verified_contacts WHERE tg_user_id = trim(p_viewer_tg_id);
    IF FOUND THEN
      has_verified_phone := true;
      masked_phone := vc.phone;
    END IF;
  END IF;

  SELECT * INTO ord FROM public.ticket_orders WHERE gift_id = tp.short_id;

  RETURN jsonb_build_object(
    'ok', true,
    'gift_id', tp.short_id,
    'status', tp.status,
    'sender_uid', tp.sender_uid,
    'sender_tg_id', COALESCE(tp.sender_tg_id, ''),
    'sender_name', COALESCE(tp.sender_name, ''),
    'recipient_name', COALESCE(tp.recipient_name, ''),
    'recipient_photo_url', COALESCE(tp.recipient_photo_url, ''),
    'has_verified_phone', has_verified_phone,
    'verified_phone', masked_phone,
    'order_status', COALESCE(ord.status, ''),
    'city_cinema', COALESCE(ord.city_cinema, ''),
    'booking_code', CASE WHEN ord.status = 'sent' THEN COALESCE(ord.booking_code, '') ELSE '' END,
    'ticket_file_url', CASE WHEN ord.status = 'sent' THEN COALESCE(ord.ticket_file_url, '') ELSE '' END,
    'server_now_ms', floor(extract(epoch from now()) * 1000)::bigint
  );
END;
$$;

-- Подтверждение подарка получателем по верифицированному номеру Telegram (request_contact) + Город/кинотеатр
CREATE OR REPLACE FUNCTION public.submit_gift_ticket_order(
  p_gift_id text,
  p_receiver_uid text,
  p_receiver_tg_id text,
  p_receiver_username text,
  p_receiver_name text,
  p_city_cinema text,
  p_fallback_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tp public.ticket_passes%ROWTYPE;
  vc public.verified_contacts%ROWTYPE;
  clean_phone text := '';
  order_id uuid;
  new_sender_lives integer := 0;
BEGIN
  IF p_receiver_tg_id IS NULL OR length(trim(p_receiver_tg_id)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'telegram_required');
  END IF;

  IF p_city_cinema IS NULL OR length(trim(p_city_cinema)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  SELECT * INTO tp FROM public.ticket_passes WHERE short_id = trim(p_gift_id) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Нельзя забрать собственный подарок!
  IF (tp.sender_tg_id IS NOT NULL AND tp.sender_tg_id <> '' AND tp.sender_tg_id = trim(p_receiver_tg_id))
     OR (tp.sender_uid = trim(COALESCE(p_receiver_uid, '')))
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_claim_blocked');
  END IF;

  IF tp.status <> 'issued' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Берём телефон, верифицированный через системный request_contact Telegram
  SELECT * INTO vc FROM public.verified_contacts WHERE tg_user_id = trim(p_receiver_tg_id);
  IF FOUND THEN
    clean_phone := regexp_replace(vc.phone, '[^0-9+]', '', 'g');
  ELSIF p_fallback_phone IS NOT NULL AND length(regexp_replace(p_fallback_phone, '[^0-9]', '', 'g')) >= 10 THEN
    clean_phone := regexp_replace(p_fallback_phone, '[^0-9+]', '', 'g');
  END IF;

  IF length(clean_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'contact_not_verified');
  END IF;

  -- Строгий анти-мультиаккаунт: 1 уникальный номер телефона = максимум 1 билет за всю акцию!
  IF EXISTS (SELECT 1 FROM public.ticket_orders o WHERE o.verified_phone = clean_phone) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_already_used');
  END IF;

  INSERT INTO public.ticket_orders (
    gift_id, status,
    receiver_uid, receiver_tg_id, receiver_username, receiver_name,
    verified_phone, city_cinema, recipient_photo_url,
    sender_uid, sender_tg_id, sender_username, sender_name,
    kp_screenshot_url
  )
  VALUES (
    tp.short_id, 'pending',
    trim(COALESCE(p_receiver_uid, '')),
    trim(p_receiver_tg_id),
    NULLIF(trim(COALESCE(p_receiver_username, '')), ''),
    CASE WHEN length(trim(COALESCE(p_receiver_name, ''))) > 0 THEN trim(p_receiver_name) ELSE COALESCE(tp.recipient_name, 'Гость') END,
    clean_phone,
    left(trim(p_city_cinema), 120),
    tp.recipient_photo_url,
    tp.sender_uid,
    tp.sender_tg_id,
    tp.sender_username,
    tp.sender_name,
    tp.kp_screenshot_url
  )
  RETURNING id INTO order_id;

  UPDATE public.ticket_passes
  SET
    status = 'claimed',
    receiver_uid = trim(COALESCE(p_receiver_uid, '')),
    receiver_tg_id = trim(p_receiver_tg_id),
    receiver_username = NULLIF(trim(COALESCE(p_receiver_username, '')), ''),
    sender_rewarded = true,
    claimed_at = now()
  WHERE short_id = tp.short_id;

  -- Мгновенно начисляем отправителю ×2 жизней без ожидания модератора!
  UPDATE public.users
  SET
    lives = GREATEST(2, lives * 2),
    friends_brought = friends_brought + 1,
    updated_at = now()
  WHERE uid = tp.sender_uid
  RETURNING lives INTO new_sender_lives;

  PERFORM public.bump_daily_metric('tickets_ordered', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', order_id,
    'sender_tg_id', COALESCE(tp.sender_tg_id, ''),
    'sender_name', COALESCE(tp.sender_name, ''),
    'sender_lives', COALESCE(new_sender_lives, 2),
    'verified_phone', clean_phone,
    'city_cinema', left(trim(p_city_cinema), 120)
  );
END;
$$;

-- ============================================================================
-- RPC 8: ЗАКРЫТЫЕ RPC КАБИНЕТА ПРОДЮСЕРА (/admin — ТОЛЬКО public.is_admin())
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  daily_arr jsonb;
  orders_arr jsonb;
  leaders_arr jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day ASC), '[]'::jsonb)
  INTO daily_arr
  FROM (
    SELECT * FROM public.daily_metrics ORDER BY day DESC LIMIT 21
  ) d;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO orders_arr
  FROM public.ticket_orders o;

  SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb)
  INTO leaders_arr
  FROM (
    SELECT
      uid, tg_user_id, tg_username, display_name,
      premiere_score, lives, friends_brought, packed_count,
      kp_verified, kp_screenshot_url,
      premiere_won, premiere_confirmed, premiere_code,
      updated_at
    FROM public.users
    ORDER BY premiere_score DESC, friends_brought DESC, updated_at DESC
    LIMIT 50
  ) l;

  RETURN jsonb_build_object(
    'ok', true,
    'stats', row_to_json(gs),
    'daily', daily_arr,
    'orders', orders_arr,
    'leaders', leaders_arr
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_config(
  p_win_every_n_hits integer,
  p_max_daily_tickets integer,
  p_max_premiere_winners integer,
  p_is_paused boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  UPDATE public.global_stats
  SET
    win_every_n_hits = GREATEST(1, COALESCE(p_win_every_n_hits, win_every_n_hits)),
    max_daily_tickets = GREATEST(0, COALESCE(p_max_daily_tickets, max_daily_tickets)),
    max_premiere_winners = GREATEST(0, COALESCE(p_max_premiere_winners, max_premiere_winners)),
    is_paused = COALESCE(p_is_paused, is_paused),
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO gs;

  RETURN jsonb_build_object('ok', true, 'stats', row_to_json(gs));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_premiere_winner(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  gen_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  gen_code := 'VIP-PREMIERE-17DEC-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));

  UPDATE public.users
  SET
    premiere_won = true,
    premiere_confirmed = true,
    premiere_code = COALESCE(premiere_code, gen_code),
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'uid', u.uid,
    'tg_user_id', COALESCE(u.tg_user_id, ''),
    'premiere_code', u.premiere_code
  );
END;
$$;

-- ============================================================================
-- ГРАНТ ПРАВ НА ПУБЛИЧНЫЕ И АДМИНСКИЕ RPC
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_or_create_player_profile(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_barrel_pack_rpc(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_funnel_event_rpc(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_share_life(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_friend_opened_lives(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ocean_tapper_reward(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.play_premiere_strike(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_win_ticket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.burn_ticket_for_x2_lives(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_gift_ticket_link(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gift_pass_public(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_gift_ticket_order(text, text, text, text, text, text, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_config(integer, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_premiere_winner(text) TO authenticated;

-- ============================================================================
-- ЕЖЕДНЕВНАЯ АВТООЧИСТКА pg_cron (04:00 UTC):
-- Удаляет селфи и голосовухи старше 5 суток из barrel-media, НЕ ТРОГАЯ cinema-passes!
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_expired_barrel_media()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'barrel-media'
    AND created_at < now() - interval '5 days';

  UPDATE public.barrels
  SET photo_url = NULL, voice_url = NULL
  WHERE created_at < now() - interval '5 days'
    AND (photo_url IS NOT NULL OR voice_url IS NOT NULL);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bochka-cleanup-barrel-media-5d') THEN
    PERFORM cron.unschedule('bochka-cleanup-barrel-media-5d');
  END IF;
  PERFORM cron.schedule(
    'bochka-cleanup-barrel-media-5d',
    '0 4 * * *',
    $job$SELECT public.cleanup_expired_barrel_media();$job$
  );
END;
$$;
