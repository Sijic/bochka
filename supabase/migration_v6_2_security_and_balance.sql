-- ============================================================================
-- БОЧКА: ДОСТУЧАТЬСЯ ДО НЕБЕС (v6.2-security-and-balance)
-- Безопасность, антиабуз, экономический баланс, Блиц-кап, лимиты Storage и админка
-- ============================================================================

-- 1. Схема, колонки, секвенс и индексы
CREATE SEQUENCE IF NOT EXISTS public.premiere_strike_seq START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  v_cur bigint := 0;
BEGIN
  SELECT COALESCE(total_strikes, 0) INTO v_cur FROM public.global_stats WHERE id = 1;
  IF v_cur > 0 THEN
    PERFORM setval('public.premiere_strike_seq', v_cur, true);
  ELSE
    PERFORM setval('public.premiere_strike_seq', 1, false);
  END IF;
END $$;

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS tickets_won bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tickets_burned bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_tickets_issued integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_reset_stamp text NOT NULL DEFAULT '';

UPDATE public.global_stats gs
SET tickets_won = GREATEST(
  gs.tickets_won,
  COALESCE((SELECT COUNT(*) FROM public.ticket_passes), 0)
  + COALESCE((SELECT COUNT(*) FROM public.users WHERE has_pending_ticket), 0)
)
WHERE gs.id = 1;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lives_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_blitz_at timestamptz,
  ADD COLUMN IF NOT EXISTS daily_blitz_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_blitz_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_strike_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_leaderboard_v62
  ON public.users (premiere_points DESC, duels_won DESC, friends_brought DESC);

-- Уникальность нормализованного телефона в ticket_orders (M7)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ticket_orders
    WHERE verified_phone IS NOT NULL AND length(verified_phone) >= 10
    GROUP BY verified_phone HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_orders_unique_phone
      ON public.ticket_orders (verified_phone)
      WHERE verified_phone IS NOT NULL AND length(verified_phone) >= 10;
  END IF;
END $$;

-- 2. Харденинг Storage бакетов и RLS-политик (C8)
UPDATE storage.buckets
SET
  file_size_limit = 524288,
  allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png','audio/webm','audio/ogg','audio/mp4','audio/mpeg']
WHERE id = 'barrel-media';

UPDATE storage.buckets
SET
  file_size_limit = 524288,
  allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png','application/pdf']
WHERE id = 'cinema-passes';

DROP POLICY IF EXISTS "Anon upload barrel-media" ON storage.objects;
CREATE POLICY "Anon upload barrel-media" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'barrel-media'
    AND (storage.foldername(name))[1] = ANY (ARRAY['portraits','voices'])
    AND name ~* '\.(webp|jpe?g|png|webm|ogg|m4a|mp4|mp3)$'
  );

DROP POLICY IF EXISTS "Anon upload cinema-passes photos" ON storage.objects;
CREATE POLICY "Anon upload cinema-passes photos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'cinema-passes'
    AND (storage.foldername(name))[1] = ANY (ARRAY['passes','kp'])
    AND name ~* '\.(webp|jpe?g|png)$'
  );

DROP POLICY IF EXISTS "Admins upload cinema-passes tickets" ON storage.objects;
CREATE POLICY "Admins upload cinema-passes tickets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cinema-passes'
    AND (storage.foldername(name))[1] = 'tickets'
    AND public.is_admin()
  );

-- 3. Вспомогательные функции безопасности и экономики
CREATE OR REPLACE FUNCTION public.is_sandbox_uid(p_uid text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_uid IS NULL
    OR length(trim(p_uid)) < 2
    OR trim(p_uid) ~* '^(testbog|tbog_|bot_)';
$$;

CREATE OR REPLACE FUNCTION public.apply_passive_life_regen(p_uid text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  elapsed_hours integer := 0;
  gained integer := 0;
  new_lives integer := 3;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN;
  END IF;

  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF u.lives >= 3 THEN
    IF u.lives_updated_at < now() - interval '1 hour' THEN
      UPDATE public.users SET lives_updated_at = now() WHERE uid = u.uid;
    END IF;
    RETURN;
  END IF;

  elapsed_hours := FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(u.lives_updated_at, u.created_at, now()))) / 3600.0)::integer;
  IF elapsed_hours >= 4 THEN
    gained := LEAST(3 - u.lives, elapsed_hours / 4);
    IF gained > 0 THEN
      new_lives := LEAST(3, u.lives + gained);
      UPDATE public.users
      SET
        lives = new_lives,
        lives_updated_at = CASE
          WHEN new_lives >= 3 THEN now()
          ELSE COALESCE(u.lives_updated_at, now()) + make_interval(hours => gained * 4)
        END,
        updated_at = now()
      WHERE uid = u.uid;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_reserve_ticket_slot(p_increment_strike boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.global_stats%ROWTYPE;
  msk_now timestamp := (now() AT TIME ZONE 'Europe/Moscow');
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  hour_stamp text := to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD-HH24');
  hourly_cap integer := 1;
BEGIN
  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF cfg.daily_reset_date < msk_date THEN
    cfg.daily_tickets_issued := 0;
    cfg.daily_reset_date := msk_date;
  END IF;

  IF COALESCE(cfg.hourly_reset_stamp, '') <> hour_stamp THEN
    cfg.hourly_tickets_issued := 0;
    cfg.hourly_reset_stamp := hour_stamp;
  END IF;

  hourly_cap := GREATEST(1, CEIL(GREATEST(1, COALESCE(cfg.max_daily_tickets, 5))::numeric / 14.0)::integer);

  IF NOT cfg.is_paused
     AND cfg.daily_tickets_issued < cfg.max_daily_tickets
     AND cfg.hourly_tickets_issued < hourly_cap
  THEN
    UPDATE public.global_stats
    SET
      daily_tickets_issued = cfg.daily_tickets_issued + 1,
      daily_reset_date = cfg.daily_reset_date,
      hourly_tickets_issued = cfg.hourly_tickets_issued + 1,
      hourly_reset_stamp = cfg.hourly_reset_stamp,
      tickets_won = tickets_won + 1,
      updated_at = now()
    WHERE id = 1;
    RETURN true;
  END IF;

  UPDATE public.global_stats
  SET
    daily_tickets_issued = cfg.daily_tickets_issued,
    daily_reset_date = cfg.daily_reset_date,
    hourly_tickets_issued = cfg.hourly_tickets_issued,
    hourly_reset_stamp = cfg.hourly_reset_stamp
  WHERE id = 1;
  RETURN false;
END;
$$;

-- 4. Обновление профиля и пассивная регенерация +1 ❤️ / 4ч (до 3)
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
  v_has_social boolean := false;
  v_effective_stage smallint := 1;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_or_sandbox_uid');
  END IF;

  INSERT INTO public.users (uid, tg_user_id, tg_username, display_name, lives, lives_updated_at)
  VALUES (
    trim(p_uid),
    NULLIF(trim(COALESCE(p_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_tg_username, '')), ''),
    COALESCE(p_display_name, ''),
    3,
    now()
  )
  ON CONFLICT (uid) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    PERFORM public.bump_daily_metric('players', 1);
  END IF;

  PERFORM public.apply_passive_life_regen(trim(p_uid));

  UPDATE public.users
  SET
    tg_user_id = COALESCE(NULLIF(trim(COALESCE(p_tg_id, '')), ''), tg_user_id),
    tg_username = COALESCE(NULLIF(trim(COALESCE(p_tg_username, '')), ''), tg_username),
    display_name = CASE WHEN length(trim(COALESCE(p_display_name, ''))) > 0 THEN left(trim(p_display_name), 48) ELSE display_name END,
    daily_shares_count = CASE WHEN daily_shares_date < CURRENT_DATE THEN 0 ELSE daily_shares_count END,
    daily_shares_date = CURRENT_DATE,
    daily_social_mask = CASE WHEN daily_social_date < CURRENT_DATE THEN '' ELSE daily_social_mask END,
    daily_social_date = CURRENT_DATE,
    daily_blitz_points = CASE WHEN daily_blitz_date < CURRENT_DATE THEN 0 ELSE daily_blitz_points END,
    daily_blitz_date = CURRENT_DATE,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  v_has_social := EXISTS (
    SELECT 1
    FROM public.social_connections sc
    WHERE sc.sender_uid = u.uid
       OR sc.receiver_uid = u.uid
       OR (
         u.tg_user_id IS NOT NULL
         AND (sc.sender_tg_id = u.tg_user_id OR sc.receiver_tg_id = u.tg_user_id)
       )
  );

  v_effective_stage := GREATEST(
    COALESCE(u.ui_stage, 1),
    CASE
      WHEN u.duels_played > 0 OR u.friends_brought > 0 THEN 4
      WHEN (u.packed_count >= 1 OR u.temu_surge_claimed) AND u.ui_stage >= 3 AND v_has_social THEN 4
      WHEN (u.packed_count >= 1 OR u.temu_surge_claimed) AND EXISTS (
        SELECT 1 FROM public.social_connections sc WHERE sc.sender_uid = u.uid
      ) THEN 4
      WHEN u.packed_count >= 1 OR u.temu_surge_claimed THEN 3
      ELSE 1
    END
  );

  IF v_effective_stage > COALESCE(u.ui_stage, 1) THEN
    UPDATE public.users
    SET ui_stage = v_effective_stage,
        updated_at = now()
    WHERE uid = u.uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lives', u.lives,
    'premiere_score', u.premiere_score,
    'premiere_points', u.premiere_points,
    'current_level', u.current_level,
    'has_played_solo', u.has_played_solo,
    'friends_brought', u.friends_brought,
    'tickets_gifted', u.tickets_gifted,
    'duels_won', u.duels_won,
    'duels_played', u.duels_played,
    'trailer_rewarded', u.trailer_rewarded,
    'kp_click_rewarded', u.kp_click_rewarded,
    'daily_social_mask', u.daily_social_mask,
    'premiere_won', u.premiere_won,
    'premiere_confirmed', u.premiere_confirmed,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'has_pending_ticket', u.has_pending_ticket,
    'kp_verified', u.kp_verified,
    'kp_screenshot_url', COALESCE(u.kp_screenshot_url, ''),
    'packed_count', u.packed_count,
    'ui_stage', v_effective_stage,
    'temu_surge_claimed', COALESCE(u.temu_surge_claimed, false),
    'has_social_connection', v_has_social,
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps
  );
END;
$$;

-- 5. Создание бочки: стартовый Temu-скачок 72.0 + проверка Storage URL
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
DECLARE
  v_uid text := NULLIF(trim(COALESCE(p_sender_uid, '')), '');
  v_photo text := NULLIF(trim(COALESCE(p_photo_url, '')), '');
  v_voice text := NULLIF(trim(COALESCE(p_voice_url, '')), '');
  v_prev_surge boolean := false;
  v_prev_stage smallint := 1;
  v_surge_now boolean := false;
  v_score numeric(5,2) := 72.00;
  v_ui_stage smallint := 3;
  v_packed integer := 1;
  v_has_social boolean := false;
BEGIN
  IF p_short_id IS NULL OR length(trim(p_short_id)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_short_id');
  END IF;
  IF v_uid IS NOT NULL AND public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  IF v_photo IS NOT NULL AND v_photo !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/barrel-media/' THEN
    v_photo := NULL;
  END IF;
  IF v_voice IS NOT NULL AND v_voice !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/barrel-media/' THEN
    v_voice := NULL;
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
    v_uid,
    NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_sender_username, '')), ''),
    left(COALESCE(p_sender_name, ''), 40),
    v_photo,
    v_voice,
    GREATEST(0, LEAST(9, COALESCE(p_target_index, 0)))
  );

  IF v_uid IS NOT NULL THEN
    SELECT temu_surge_claimed, ui_stage
    INTO v_prev_surge, v_prev_stage
    FROM public.users
    WHERE uid = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
      v_prev_surge := false;
      v_prev_stage := 1;
    END IF;

    v_has_social := EXISTS (
      SELECT 1
      FROM public.social_connections sc
      WHERE sc.sender_uid = v_uid OR sc.receiver_uid = v_uid
    );

    v_surge_now := NOT COALESCE(v_prev_surge, false);

    INSERT INTO public.users (
      uid, tg_user_id, tg_username, display_name,
      packed_count, premiere_score, temu_surge_claimed, ui_stage, lives_updated_at
    )
    VALUES (
      v_uid,
      NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
      NULLIF(trim(COALESCE(p_sender_username, '')), ''),
      left(COALESCE(p_sender_name, ''), 48),
      1,
      72.00,
      true,
      3,
      now()
    )
    ON CONFLICT (uid) DO UPDATE SET
      packed_count = public.users.packed_count + 1,
      premiere_score = GREATEST(public.users.premiere_score, 72.00),
      temu_surge_claimed = true,
      ui_stage = GREATEST(
        public.users.ui_stage,
        CASE
          WHEN NOT public.users.temu_surge_claimed THEN 3
          WHEN v_has_social OR public.users.duels_played > 0 OR public.users.friends_brought > 0 THEN 4
          ELSE 3
        END
      ),
      updated_at = now()
    RETURNING premiere_score, ui_stage, packed_count
    INTO v_score, v_ui_stage, v_packed;
  END IF;

  PERFORM public.bump_daily_metric('barrels_created', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'short_id', trim(p_short_id),
    'surge_triggered', v_surge_now,
    'premiere_score', v_score,
    'ui_stage', v_ui_stage,
    'packed_count', v_packed,
    'temu_surge_claimed', true
  );
END;
$$;

-- 6. Рефералы и друзья (+2 ❤️ + +2500 ⭐ строго 1 раз за уникального нового игрока)
CREATE OR REPLACE FUNCTION public.mark_barrel_search_started(
  p_barrel_id text,
  p_opener_uid text,
  p_opener_tg_id text DEFAULT NULL,
  p_opener_username text DEFAULT NULL,
  p_opener_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.barrels%ROWTYPE;
  opener_row public.users%ROWTYPE;
  sender_row public.users%ROWTYPE;
  was_solo_virgin boolean := false;
  credited_lives integer := 0;
  ledger_inserted integer := 0;
BEGIN
  IF p_barrel_id IS NULL OR public.is_sandbox_uid(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = trim(p_barrel_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'barrel_not_found');
  END IF;

  PERFORM public.get_or_create_player_profile(p_opener_uid, p_opener_tg_id, p_opener_username, p_opener_name);
  SELECT * INTO opener_row FROM public.users WHERE uid = trim(p_opener_uid) FOR UPDATE;

  was_solo_virgin := NOT opener_row.has_played_solo;

  UPDATE public.users
  SET has_played_solo = true, updated_at = now()
  WHERE uid = trim(p_opener_uid);

  IF b.sender_uid IS NULL
     OR public.is_sandbox_uid(b.sender_uid)
     OR b.sender_uid = trim(p_opener_uid)
     OR (
       b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> ''
       AND NULLIF(trim(COALESCE(p_opener_tg_id, '')), '') = b.sender_tg_id
     )
  THEN
    RETURN jsonb_build_object('ok', true, 'is_self', true, 'credited_lives', 0);
  END IF;

  PERFORM public.get_or_create_player_profile(b.sender_uid, b.sender_tg_id, b.sender_username, b.sender_name);

  INSERT INTO public.social_connections (
    sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel, updated_at
  )
  VALUES (
    b.sender_uid,
    trim(p_opener_uid),
    NULLIF(trim(COALESCE(b.sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_opener_tg_id, '')), ''),
    CASE WHEN length(trim(COALESCE(p_opener_name, ''))) > 0 THEN left(trim(p_opener_name), 40) ELSE 'Друг из Цеха' END,
    NULLIF(trim(COALESCE(p_opener_username, '')), ''),
    false,
    now()
  )
  ON CONFLICT (sender_uid, receiver_uid) DO UPDATE SET
    receiver_tg_id = COALESCE(EXCLUDED.receiver_tg_id, public.social_connections.receiver_tg_id),
    receiver_name = CASE WHEN EXCLUDED.receiver_name <> 'Друг из Цеха' THEN EXCLUDED.receiver_name ELSE public.social_connections.receiver_name END,
    receiver_username = COALESCE(EXCLUDED.receiver_username, public.social_connections.receiver_username),
    updated_at = now();

  INSERT INTO public.social_connections (
    sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel, updated_at
  )
  VALUES (
    trim(p_opener_uid),
    b.sender_uid,
    NULLIF(trim(COALESCE(p_opener_tg_id, '')), ''),
    NULLIF(trim(COALESCE(b.sender_tg_id, '')), ''),
    CASE WHEN length(trim(COALESCE(b.sender_name, ''))) > 0 THEN left(trim(b.sender_name), 40) ELSE 'Автор бочки' END,
    NULLIF(trim(COALESCE(b.sender_username, '')), ''),
    false,
    now()
  )
  ON CONFLICT (sender_uid, receiver_uid) DO UPDATE SET
    updated_at = now();

  IF was_solo_virgin THEN
    INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
    VALUES (b.short_id, trim(p_opener_uid))
    ON CONFLICT (barrel_id, opener_uid) DO NOTHING;
    GET DIAGNOSTICS ledger_inserted = ROW_COUNT;

    IF ledger_inserted > 0 THEN
      credited_lives := 2;
      UPDATE public.users
      SET
        lives = lives + 2,
        lives_updated_at = CASE WHEN lives + 2 >= 3 THEN now() ELSE lives_updated_at END,
        friends_brought = friends_brought + 1,
        premiere_points = premiere_points + 2500,
        updated_at = now()
      WHERE uid = b.sender_uid
      RETURNING * INTO sender_row;
    END IF;
  ELSE
    SELECT * INTO sender_row FROM public.users WHERE uid = b.sender_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'credited_lives', credited_lives,
    'was_new_player', was_solo_virgin,
    'sender_uid', b.sender_uid,
    'sender_tg_id', COALESCE(sender_row.tg_user_id, b.sender_tg_id, ''),
    'sender_lives', COALESCE(sender_row.lives, 0)
  );
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
  opener_virgin boolean := false;
  new_lives integer := 0;
  sender_tg text := '';
  opener_tg text := '';
BEGIN
  IF p_barrel_id IS NULL OR public.is_sandbox_uid(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', false, 'credited', false);
  END IF;

  SELECT NOT has_played_solo, COALESCE(tg_user_id, '')
  INTO opener_virgin, opener_tg
  FROM public.users
  WHERE uid = trim(p_opener_uid);

  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (trim(p_barrel_id), trim(p_opener_uid))
  ON CONFLICT (barrel_id, opener_uid) DO NOTHING;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  IF inserted_rows > 0 THEN
    UPDATE public.barrels SET opens_count = opens_count + 1 WHERE short_id = trim(p_barrel_id);
    PERFORM public.bump_daily_metric('barrels_opened', 1);

    UPDATE public.users
    SET
      has_played_solo = true,
      premiere_points = premiere_points + 150,
      updated_at = now()
    WHERE uid = trim(p_opener_uid);
  ELSE
    UPDATE public.users
    SET has_played_solo = true, updated_at = now()
    WHERE uid = trim(p_opener_uid);
  END IF;

  IF p_sender_uid IS NULL OR public.is_sandbox_uid(p_sender_uid) OR trim(p_sender_uid) = trim(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', true, 'credited', false, 'reason', 'self_or_empty_sender');
  END IF;

  SELECT COALESCE(tg_user_id, ''), lives INTO sender_tg, new_lives FROM public.users WHERE uid = trim(p_sender_uid);
  IF sender_tg <> '' AND sender_tg = opener_tg THEN
    RETURN jsonb_build_object('ok', true, 'credited', false, 'reason', 'same_tg_user');
  END IF;

  UPDATE public.social_connections
  SET opened_barrel = true, updated_at = now()
  WHERE sender_uid = trim(p_sender_uid) AND receiver_uid = trim(p_opener_uid);

  IF inserted_rows = 0 OR NOT COALESCE(opener_virgin, false) THEN
    RETURN jsonb_build_object('ok', true, 'credited', false, 'sender_lives', COALESCE(new_lives, 0), 'sender_tg_id', COALESCE(sender_tg, ''));
  END IF;

  UPDATE public.users
  SET
    lives = lives + 2,
    lives_updated_at = CASE WHEN lives + 2 >= 3 THEN now() ELSE lives_updated_at END,
    friends_brought = friends_brought + 1,
    premiere_points = premiere_points + 2500,
    updated_at = now()
  WHERE uid = trim(p_sender_uid)
  RETURNING lives, COALESCE(tg_user_id, '') INTO new_lives, sender_tg;

  RETURN jsonb_build_object('ok', true, 'credited', true, 'sender_lives', new_lives, 'sender_tg_id', sender_tg);
END;
$$;

-- 7. Суперигра: 72 -> 99.4 порог друзей (>=3 друзей + КП/подаренный билет), sequence без горячей блокировки
CREATE OR REPLACE FUNCTION public.play_premiere_strike(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  cfg public.global_stats%ROWTYPE;
  v_strike_seq bigint;
  roll numeric := random();
  delta numeric(6,2) := 0.00;
  new_score numeric(6,2);
  pts_gain integer := 40;
  outcome text := 'empty_screamer';
  v_qualified_100 boolean := false;
  v_win_every integer := 100;
  v_premiere_won_now boolean := false;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF u.has_pending_ticket THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'pending_ticket_choice',
      'lives', u.lives,
      'premiere_score', u.premiere_score,
      'premiere_points', u.premiere_points,
      'has_pending_ticket', true
    );
  END IF;

  IF u.lives <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_lives',
      'lives', 0,
      'premiere_score', u.premiere_score,
      'premiere_points', u.premiere_points,
      'near_miss', (u.premiere_score >= 90.0)
    );
  END IF;

  v_strike_seq := nextval('public.premiere_strike_seq');
  SELECT win_every_n_hits INTO v_win_every FROM public.global_stats WHERE id = 1;
  v_win_every := GREATEST(10, COALESCE(v_win_every, 100));

  IF u.lives = 3 THEN
    u.lives_updated_at := now();
  END IF;
  u.lives := u.lives - 1;
  u.has_played_solo := true;
  v_qualified_100 := (COALESCE(u.friends_brought, 0) >= 3) AND (COALESCE(u.kp_verified, false) OR COALESCE(u.tickets_gifted, 0) >= 1);

  -- Почасовой и суточный слот-кап на Золотой билет без блокировки строки global_stats на каждом промахе
  IF (v_strike_seq % v_win_every) = 0 THEN
    IF public.try_reserve_ticket_slot(true) THEN
      u.has_pending_ticket := true;
      outcome := 'golden_ticket';
      pts_gain := 250;
    END IF;
  END IF;

  IF outcome <> 'golden_ticket' THEN
    IF u.premiere_score < 35 THEN
      IF roll < 0.78 THEN delta := 35.00; outcome := 'score_hit'; pts_gain := 95; END IF;
    ELSIF u.premiere_score < 60 THEN
      IF roll < 0.68 THEN delta := 25.00; outcome := 'score_hit'; pts_gain := 105; END IF;
    ELSIF u.premiere_score < 80 THEN
      IF roll < 0.56 THEN delta := 12.00; outcome := 'score_hit'; pts_gain := 115; END IF;
    ELSIF u.premiere_score < 90 THEN
      IF roll < 0.44 THEN delta := 7.50; outcome := 'score_hit'; pts_gain := 125; END IF;
    ELSIF u.premiere_score < 95.5 THEN
      IF roll < 0.34 THEN delta := 2.60; outcome := 'score_hit'; pts_gain := 135; END IF;
    ELSIF u.premiere_score < 98.4 THEN
      IF roll < 0.24 THEN delta := 0.85; outcome := 'score_hit'; pts_gain := 145; END IF;
    ELSIF u.premiere_score < 99.4 THEN
      IF roll < 0.16 THEN
        delta := LEAST(0.20, GREATEST(0.00, 99.40 - u.premiere_score));
        IF delta > 0 THEN outcome := 'score_hit'; pts_gain := 160; END IF;
      END IF;
    ELSE
      IF v_qualified_100 AND NOT u.premiere_won THEN
        SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
        IF NOT cfg.is_paused AND cfg.premiere_winners_count < cfg.max_premiere_winners AND roll < 0.18 THEN
          v_premiere_won_now := true;
          outcome := 'premiere_win';
          pts_gain := 500;
          u.premiere_won := true;
          u.premiere_code := COALESCE(NULLIF(u.premiere_code, ''), 'BCH-VIP-' || upper(substr(md5(u.uid || ':' || now()::text), 1, 6)));
          UPDATE public.global_stats
          SET premiere_winners_count = premiere_winners_count + 1, updated_at = now()
          WHERE id = 1;
        END IF;
      END IF;
      IF NOT v_premiere_won_now THEN
        delta := 0.00;
        outcome := 'empty_screamer';
        pts_gain := 60;
      END IF;
    END IF;
  END IF;

  IF u.premiere_won THEN
    new_score := 100.00;
  ELSIF v_qualified_100 THEN
    new_score := LEAST(99.90, u.premiere_score + delta);
  ELSE
    new_score := LEAST(99.40, u.premiere_score + delta);
  END IF;

  IF (v_strike_seq % 10) = 0 OR outcome IN ('golden_ticket', 'premiere_win') THEN
    UPDATE public.global_stats
    SET total_strikes = GREATEST(total_strikes, v_strike_seq), updated_at = now()
    WHERE id = 1;
  END IF;

  UPDATE public.users
  SET
    lives = u.lives,
    lives_updated_at = u.lives_updated_at,
    last_strike_at = now(),
    has_played_solo = true,
    premiere_score = new_score,
    premiere_points = premiere_points + pts_gain,
    has_pending_ticket = u.has_pending_ticket,
    premiere_won = u.premiere_won,
    premiere_code = u.premiere_code,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', outcome,
    'delta', delta,
    'points_gain', pts_gain,
    'premiere_score', new_score,
    'premiere_points', u.premiere_points,
    'lives', u.lives,
    'has_pending_ticket', u.has_pending_ticket,
    'premiere_won', u.premiere_won,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'qualified_for_100', v_qualified_100,
    'near_miss', (u.lives = 0 AND new_score >= 90.0 AND NOT u.premiere_won)
  );
END;
$$;

-- 8. Блиц и уровни (18с кулдаун на Блиц >=8, <=220 ⭐/раунд, <=1500 ⭐/день)
CREATE OR REPLACE FUNCTION public.complete_workshop_level_rpc(
  p_uid text,
  p_level integer,
  p_time_left_sec numeric DEFAULT 0,
  p_bonus_points integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  clean_lvl integer := GREATEST(1, LEAST(99, COALESCE(p_level, 1)));
  earned_pts integer := 0;
  next_lvl integer;
  blitz_today integer := 0;
  is_blitz boolean := (clean_lvl >= 8);
  cd_blocked boolean := false;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  blitz_today := CASE WHEN u.daily_blitz_date < CURRENT_DATE THEN 0 ELSE COALESCE(u.daily_blitz_points, 0) END;

  IF is_blitz AND u.last_blitz_at IS NOT NULL AND (now() - u.last_blitz_at) < interval '18 seconds' THEN
    cd_blocked := true;
    earned_pts := 0;
  ELSE
    earned_pts := LEAST(
      220,
      50 + (LEAST(10, clean_lvl) * 10)
      + ROUND(GREATEST(0, LEAST(20, COALESCE(p_time_left_sec, 0))) * 2)::integer
      + GREATEST(0, LEAST(60, COALESCE(p_bonus_points, 0)))
    );
    IF is_blitz THEN
      earned_pts := GREATEST(0, LEAST(earned_pts, 1500 - blitz_today));
      blitz_today := blitz_today + earned_pts;
    END IF;
  END IF;

  next_lvl := GREATEST(u.current_level, clean_lvl + 1);

  UPDATE public.users
  SET
    has_played_solo = true,
    current_level = next_lvl,
    premiere_points = premiere_points + earned_pts,
    daily_blitz_points = blitz_today,
    daily_blitz_date = CURRENT_DATE,
    last_blitz_at = CASE WHEN is_blitz AND NOT cd_blocked THEN now() ELSE last_blitz_at END,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'earned_points', earned_pts,
    'cooldown_blocked', cd_blocked,
    'daily_blitz_points', blitz_today,
    'current_level', u.current_level,
    'premiere_points', u.premiere_points,
    'lives', u.lives
  );
END;
$$;

-- 9. Вилка: Сжечь (x2 до 12 ❤️ + 150 ⭐) vs Подарить (+4 ❤️ + 3500 ⭐)
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
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;
  IF NOT FOUND OR NOT u.has_pending_ticket THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_ticket');
  END IF;

  boosted_lives := LEAST(12, GREATEST(u.lives + 3, u.lives * 2));

  UPDATE public.users
  SET
    has_pending_ticket = false,
    lives = boosted_lives,
    lives_updated_at = now(),
    premiere_points = premiere_points + 150,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  UPDATE public.global_stats
  SET tickets_burned = tickets_burned + 1, updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'ok', true,
    'lives', boosted_lives,
    'premiere_points', u.premiere_points
  );
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
  v_photo text := NULLIF(trim(COALESCE(p_recipient_photo_url, '')), '');
BEGIN
  IF public.is_sandbox_uid(p_sender_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  IF v_photo IS NOT NULL AND v_photo !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cinema-passes/passes/' THEN
    v_photo := NULL;
  END IF;

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
    v_photo,
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
  IF p_receiver_uid IS NOT NULL AND public.is_sandbox_uid(p_receiver_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;
  IF p_city_cinema IS NULL OR length(trim(p_city_cinema)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  SELECT * INTO tp FROM public.ticket_passes WHERE short_id = trim(p_gift_id) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF (tp.sender_tg_id IS NOT NULL AND tp.sender_tg_id <> '' AND tp.sender_tg_id = trim(p_receiver_tg_id))
     OR (tp.sender_uid = trim(COALESCE(p_receiver_uid, '')))
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_claim_blocked');
  END IF;

  IF tp.status <> 'issued' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  SELECT * INTO vc FROM public.verified_contacts WHERE tg_user_id = trim(p_receiver_tg_id);
  IF FOUND THEN
    clean_phone := '+' || regexp_replace(vc.phone, '[^0-9]', '', 'g');
  ELSIF p_fallback_phone IS NOT NULL AND length(regexp_replace(p_fallback_phone, '[^0-9]', '', 'g')) >= 10 THEN
    clean_phone := '+' || regexp_replace(p_fallback_phone, '[^0-9]', '', 'g');
  END IF;

  IF length(regexp_replace(clean_phone, '[^0-9]', '', 'g')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'contact_not_verified');
  END IF;

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
    CASE WHEN length(trim(COALESCE(p_receiver_name, ''))) > 0 THEN left(trim(p_receiver_name), 48) ELSE COALESCE(tp.recipient_name, 'Гость') END,
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

  UPDATE public.users
  SET
    lives = lives + 4,
    lives_updated_at = now(),
    friends_brought = friends_brought + 1,
    tickets_gifted = tickets_gifted + 1,
    premiere_points = premiere_points + 3500,
    updated_at = now()
  WHERE uid = tp.sender_uid
  RETURNING lives INTO new_sender_lives;

  PERFORM public.bump_daily_metric('tickets_ordered', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', order_id,
    'sender_tg_id', COALESCE(tp.sender_tg_id, ''),
    'sender_name', COALESCE(tp.sender_name, ''),
    'sender_lives', COALESCE(new_sender_lives, 4),
    'verified_phone', clean_phone,
    'city_cinema', left(trim(p_city_cinema), 120)
  );
END;
$$;

-- 10. Социальные и промо-бонусы (закрытие дыры trailer_ref_visit + проверка КП URL)
CREATE OR REPLACE FUNCTION public.claim_social_or_promo_bonus_rpc(
  p_uid text,
  p_action text,
  p_platform text DEFAULT 'generic',
  p_ref_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  ref_u public.users%ROWTYPE;
  pts_added integer := 0;
  lives_added integer := 0;
  token_key text;
  mask_now text;
  clean_ref text := NULLIF(trim(COALESCE(p_ref_uid, '')), '');
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  -- Отключено в v6.2 (ECON-REF): награда за реферала трейлера начисляется только при реальном досмотре
  IF p_action = 'trailer_ref_visit' THEN
    RETURN jsonb_build_object('ok', true, 'points_added', 0, 'lives_added', 0, 'already_claimed', true);
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  mask_now := CASE WHEN u.daily_social_date < CURRENT_DATE THEN '' ELSE COALESCE(u.daily_social_mask, '') END;

  IF p_action = 'trailer_watched' THEN
    PERFORM public.bump_daily_metric('trailer_completions', 1);
    IF NOT u.trailer_rewarded THEN
      pts_added := 250;
      lives_added := 1;
      u.trailer_rewarded := true;
    END IF;

    IF clean_ref IS NOT NULL
       AND NOT public.is_sandbox_uid(clean_ref)
       AND clean_ref <> trim(p_uid)
       AND u.trailer_ref_by IS NULL
    THEN
      SELECT * INTO ref_u FROM public.users WHERE uid = clean_ref FOR UPDATE;
      IF FOUND AND (
        ref_u.tg_user_id IS NULL OR u.tg_user_id IS NULL OR ref_u.tg_user_id <> u.tg_user_id
      ) THEN
        u.trailer_ref_by := clean_ref;
        UPDATE public.users
        SET
          lives = lives + 1,
          lives_updated_at = CASE WHEN lives + 1 >= 3 THEN now() ELSE lives_updated_at END,
          premiere_points = premiere_points + 250,
          premiere_score = CASE
            WHEN premiere_won THEN 100.00
            WHEN friends_brought >= 3 AND (kp_verified OR tickets_gifted >= 1) THEN LEAST(99.90, premiere_score + 0.35)
            ELSE LEAST(99.40, premiere_score + 0.35)
          END,
          updated_at = now()
        WHERE uid = clean_ref;
      END IF;
    END IF;

  ELSIF p_action = 'kp_clicked' THEN
    PERFORM public.bump_daily_metric('kp_clicks', 1);
    IF NOT u.kp_click_rewarded THEN
      pts_added := 300;
      u.kp_click_rewarded := true;
    END IF;

  ELSIF p_action IN ('share_barrel', 'share_trailer') THEN
    token_key := '[' || p_action || ':' || left(regexp_replace(COALESCE(p_platform, 'link'), '[^a-z0-9_]', '', 'gi'), 12) || ']';
    IF position(token_key in mask_now) = 0 THEN
      mask_now := mask_now || token_key;
      IF u.daily_shares_count < 4 THEN
        pts_added := 150;
        lives_added := 1;
        u.daily_shares_count := u.daily_shares_count + 1;
      END IF;
    END IF;
  END IF;

  UPDATE public.users
  SET
    lives = lives + lives_added,
    lives_updated_at = CASE WHEN lives + lives_added >= 3 THEN now() ELSE lives_updated_at END,
    premiere_points = premiere_points + pts_added,
    trailer_rewarded = u.trailer_rewarded,
    kp_click_rewarded = u.kp_click_rewarded,
    trailer_ref_by = u.trailer_ref_by,
    daily_shares_count = u.daily_shares_count,
    daily_shares_date = CURRENT_DATE,
    daily_social_mask = mask_now,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'points_added', pts_added,
    'lives_added', lives_added,
    'premiere_points', u.premiere_points,
    'lives', u.lives,
    'already_claimed', (pts_added = 0 AND lives_added = 0)
  );
END;
$$;

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
DECLARE
  v_kp_url text := trim(COALESCE(p_kp_screenshot_url, ''));
BEGIN
  IF p_event IN ('kp_clicks', 'trailer_completions', 'cinema_clicks', 'ocean_opens') THEN
    PERFORM public.bump_daily_metric(p_event, 1);
  END IF;

  IF p_event = 'kp_screenshot_verified' AND NOT public.is_sandbox_uid(p_uid) THEN
    IF v_kp_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cinema-passes/kp/' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kp_screenshot_url');
    END IF;

    UPDATE public.users
    SET
      premiere_points = premiere_points + CASE WHEN NOT kp_verified THEN 500 ELSE 0 END,
      lives = lives + CASE WHEN NOT kp_verified THEN 1 ELSE 0 END,
      lives_updated_at = CASE WHEN NOT kp_verified AND lives + 1 >= 3 THEN now() ELSE lives_updated_at END,
      kp_verified = true,
      kp_screenshot_url = v_kp_url,
      updated_at = now()
    WHERE uid = trim(p_uid);
    PERFORM public.bump_daily_metric('kp_clicks', 1);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

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
  clean_taps integer := GREATEST(0, LEAST(120, COALESCE(p_taps, 0)));
  lives_award integer := 0;
  gift_awarded boolean := false;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

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

  IF clean_taps >= 40 AND NOT u.easter_egg_gift_won AND NOT u.has_pending_ticket THEN
    IF public.try_reserve_ticket_slot(false) THEN
      gift_awarded := true;
    END IF;
  END IF;

  UPDATE public.users
  SET
    easter_egg_claimed = true,
    easter_egg_best_taps = GREATEST(easter_egg_best_taps, clean_taps),
    easter_egg_gift_won = (easter_egg_gift_won OR gift_awarded),
    has_pending_ticket = (has_pending_ticket OR gift_awarded),
    lives = lives + lives_award,
    lives_updated_at = CASE WHEN lives + lives_award >= 3 THEN now() ELSE lives_updated_at END,
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

-- 11. Дуэли «На счёт три!» (C3, BUG-D6, BUG-D7, BUG-D8, 8% на троих / 0% вдвоём)
CREATE OR REPLACE FUNCTION public.start_duel_ante_rpc(
  p_uid text,
  p_room_id text,
  p_round_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  ins_count int := 0;
BEGIN
  IF public.is_sandbox_uid(p_uid) OR p_round_key IS NULL OR length(trim(p_round_key)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  INSERT INTO public.duel_antes (round_key, uid, room_id)
  VALUES (trim(p_round_key), trim(p_uid), left(COALESCE(p_room_id, ''), 32))
  ON CONFLICT (round_key, uid) DO NOTHING;

  GET DIAGNOSTICS ins_count = ROW_COUNT;
  IF ins_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'already_staked', true, 'lives', u.lives, 'premiere_points', u.premiere_points);
  END IF;

  IF u.lives <= 0 THEN
    DELETE FROM public.duel_antes WHERE round_key = trim(p_round_key) AND uid = trim(p_uid);
    RETURN jsonb_build_object('ok', false, 'reason', 'no_lives', 'lives', 0);
  END IF;

  UPDATE public.users
  SET
    lives = lives - 1,
    lives_updated_at = CASE WHEN lives = 3 THEN now() ELSE lives_updated_at END,
    has_played_solo = true,
    premiere_points = premiere_points + 40,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object('ok', true, 'lives', u.lives, 'premiere_points', u.premiere_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_duel_round(
  p_room_id text,
  p_round_key text,
  p_winner_uid text,
  p_player_uids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ins_count int := 0;
  v_valid_uids text[];
  n_players int := 0;
  pot_lives int := 0;
  score_bonus numeric(6,2) := 0.00;
  pts_bonus int := 120;
  golden_drop boolean := false;
  w public.users%ROWTYPE;
BEGIN
  IF p_round_key IS NULL OR public.is_sandbox_uid(p_winner_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  -- Берём строго уникальных участников, подтверждённо внёсших ставку в duel_antes (C3/BUG-D7)
  SELECT COALESCE(array_agg(DISTINCT da.uid), ARRAY[]::text[])
  INTO v_valid_uids
  FROM public.duel_antes da
  WHERE da.round_key = trim(p_round_key)
    AND (p_player_uids IS NULL OR da.uid = ANY(p_player_uids));

  n_players := COALESCE(array_length(v_valid_uids, 1), 0);
  IF n_players < 2 OR NOT (trim(p_winner_uid) = ANY(v_valid_uids)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_or_unpaid_participants');
  END IF;

  n_players := LEAST(3, n_players);
  pot_lives := n_players;

  INSERT INTO public.duel_settlements (round_key, room_id, winner_uid, players_count, pot_lives)
  VALUES (trim(p_round_key), left(COALESCE(p_room_id, ''), 32), trim(p_winner_uid), n_players, pot_lives)
  ON CONFLICT (round_key) DO NOTHING;

  GET DIAGNOSTICS ins_count = ROW_COUNT;
  IF ins_count = 0 THEN
    SELECT * INTO w FROM public.users WHERE uid = trim(p_winner_uid);
    RETURN jsonb_build_object(
      'ok', true,
      'already_settled', true,
      'pot_lives', pot_lives,
      'winner_lives', COALESCE(w.lives, 0),
      'winner_score', COALESCE(w.premiere_score, 0),
      'winner_points', COALESCE(w.premiere_points, 0),
      'has_pending_ticket', COALESCE(w.has_pending_ticket, false)
    );
  END IF;

  -- Начисляем duels_played всем участникам, а не только победителю (BUG-D8)
  UPDATE public.users
  SET duels_played = duels_played + 1, updated_at = now()
  WHERE uid = ANY(v_valid_uids);

  IF n_players >= 3 THEN
    score_bonus := 0.25;
    pts_bonus := 450;
    IF random() < 0.08 AND public.try_reserve_ticket_slot(false) THEN
      golden_drop := true;
    END IF;
  END IF;

  UPDATE public.users
  SET
    lives = lives + pot_lives,
    lives_updated_at = CASE WHEN lives + pot_lives >= 3 THEN now() ELSE lives_updated_at END,
    duels_won = duels_won + 1,
    premiere_points = premiere_points + pts_bonus,
    premiere_score = CASE
      WHEN premiere_won THEN 100.00
      WHEN friends_brought >= 3 AND (kp_verified OR tickets_gifted >= 1) THEN LEAST(99.90, premiere_score + score_bonus)
      ELSE LEAST(99.40, premiere_score + score_bonus)
    END,
    has_pending_ticket = (has_pending_ticket OR golden_drop),
    updated_at = now()
  WHERE uid = trim(p_winner_uid)
  RETURNING * INTO w;

  UPDATE public.social_connections
  SET duels_together = duels_together + 1, updated_at = now()
  WHERE sender_uid = ANY(v_valid_uids)
    AND receiver_uid = ANY(v_valid_uids)
    AND sender_uid <> receiver_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'pot_lives', pot_lives,
    'score_bonus', score_bonus,
    'points_bonus', pts_bonus,
    'golden_ticket_dropped', golden_drop,
    'winner_lives', COALESCE(w.lives, pot_lives),
    'winner_score', COALESCE(w.premiere_score, 0),
    'winner_points', COALESCE(w.premiere_points, 0),
    'has_pending_ticket', COALESCE(w.has_pending_ticket, false)
  );
END;
$$;

-- 12. Лидерборд ТОП-10 (квалификация от >=2 приведённых друзей) и админка KPI (BUG-ADM2)
CREATE OR REPLACE FUNCTION public.get_premiere_leaderboard_rpc(p_uid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leaders_arr jsonb;
  me_row public.users%ROWTYPE;
  my_rank bigint := 0;
  tenth_pts integer := 0;
  my_qualified boolean := false;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO leaders_arr
  FROM (
    SELECT
      row_number() OVER (
        ORDER BY (friends_brought >= 2) DESC, premiere_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
      ) AS rank,
      uid,
      CASE
        WHEN length(trim(COALESCE(display_name, ''))) > 0 THEN left(trim(display_name), 26)
        WHEN tg_username IS NOT NULL AND length(tg_username) > 0 THEN '@' || left(tg_username, 22)
        ELSE 'Игрок #' || upper(right(uid, 4))
      END AS name,
      premiere_points,
      premiere_score,
      current_level,
      friends_brought,
      tickets_gifted,
      duels_won,
      premiere_confirmed,
      (friends_brought >= 2) AS qualified_top10
    FROM public.users
    WHERE premiere_points > 0 OR premiere_score > 0 OR friends_brought > 0
    ORDER BY (friends_brought >= 2) DESC, premiere_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
    LIMIT 25
  ) t;

  SELECT COALESCE(MIN(sub.premiere_points), 0)
  INTO tenth_pts
  FROM (
    SELECT premiere_points
    FROM public.users
    WHERE friends_brought >= 2
    ORDER BY premiere_points DESC, duels_won DESC, premiere_score DESC
    LIMIT 10
  ) sub;

  IF p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    SELECT * INTO me_row FROM public.users WHERE uid = trim(p_uid);
    IF FOUND THEN
      my_qualified := (me_row.friends_brought >= 2);
      SELECT COUNT(*) + 1
      INTO my_rank
      FROM public.users other
      WHERE ((other.friends_brought >= 2) > my_qualified)
         OR (
           (other.friends_brought >= 2) = my_qualified
           AND (
             other.premiere_points > me_row.premiere_points
             OR (other.premiere_points = me_row.premiere_points AND other.duels_won > me_row.duels_won)
             OR (other.premiere_points = me_row.premiere_points AND other.duels_won = me_row.duels_won AND other.premiere_score > me_row.premiere_score)
           )
         );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'leaders', leaders_arr,
    'tenth_points', tenth_pts,
    'me', CASE WHEN me_row.uid IS NOT NULL THEN jsonb_build_object(
      'uid', me_row.uid,
      'rank', my_rank,
      'qualified_top10', my_qualified,
      'in_top10', (my_qualified AND my_rank >= 1 AND my_rank <= 10 AND me_row.premiere_points > 0),
      'premiere_points', me_row.premiere_points,
      'premiere_score', me_row.premiere_score,
      'current_level', me_row.current_level,
      'friends_brought', me_row.friends_brought,
      'tickets_gifted', me_row.tickets_gifted,
      'duels_won', me_row.duels_won,
      'points_to_top10', GREATEST(0, tenth_pts - me_row.premiere_points + CASE WHEN my_rank > 10 THEN 10 ELSE 0 END)
    ) ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  seq_strikes bigint := 0;
  seq_called boolean := false;
  daily_arr jsonb;
  orders_arr jsonb;
  leaders_arr jsonb;
  stats_obj jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  SELECT last_value, is_called INTO seq_strikes, seq_called FROM public.premiere_strike_seq;
  IF NOT COALESCE(seq_called, false) THEN
    seq_strikes := 0;
  END IF;

  stats_obj := row_to_json(gs)::jsonb || jsonb_build_object(
    'total_strikes', GREATEST(COALESCE(gs.total_strikes, 0), COALESCE(seq_strikes, 0)),
    'tickets_won', COALESCE(gs.tickets_won, 0),
    'tickets_burned', COALESCE(gs.tickets_burned, 0),
    'premiere_winners_count', COALESCE(gs.premiere_winners_count, 0)
  );

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
      premiere_points, premiere_score, current_level,
      lives, friends_brought, tickets_gifted, duels_won, packed_count,
      kp_verified, kp_screenshot_url,
      premiere_won, premiere_confirmed, premiere_code,
      updated_at
    FROM public.users
    ORDER BY (friends_brought >= 2) DESC, premiere_points DESC, duels_won DESC, premiere_score DESC, updated_at DESC
    LIMIT 50
  ) l;

  RETURN jsonb_build_object(
    'ok', true,
    'stats', stats_obj,
    'daily', daily_arr,
    'orders', orders_arr,
    'leaders', leaders_arr
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_sandbox_uid(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_player_profile(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_barrel_search_started(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_friend_opened_lives(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.play_premiere_strike(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_win_ticket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workshop_level_rpc(text, integer, numeric, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.burn_ticket_for_x2_lives(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_gift_ticket_link(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_gift_ticket_order(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_social_or_promo_bonus_rpc(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_funnel_event_rpc(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ocean_tapper_reward(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_duel_ante_rpc(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_duel_round(text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_premiere_leaderboard_rpc(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard() TO authenticated;
