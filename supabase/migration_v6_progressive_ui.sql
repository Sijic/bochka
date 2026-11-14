-- ============================================================================
-- БОЧКА v6.0 PROGRESSIVE DISCLOSURE (TEMU-STYLE STAGED UI)
-- 1. Хранение стадии раскрытия интерфейса (ui_stage 1..4) и флага temu_surge_claimed
-- 2. Идемпотентная миграция действующих игроков (чтобы не терять доступ к дуэлям/рейтингу)
-- 3. Первый стартовый рывок до 88.0 / 100 при упаковке 1-й бочки (create_barrel_pack_rpc)
-- 4. Монотонная синхронизация ui_stage через sync_user_ui_stage_rpc
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ui_stage smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS temu_surge_claimed boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_ui_stage_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_ui_stage_check CHECK (ui_stage BETWEEN 1 AND 4);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_social_conn_receiver
  ON public.social_connections (receiver_uid, updated_at DESC);

-- Идемпотентный backfill действующих пользователей:
-- Новички с 0 упакованных бочек, 0 дуэлей и 0 приведённых друзей остаются на Стадии 1,
-- даже если они только что открыли чужую ?b= ссылку.
UPDATE public.users u
SET
  temu_surge_claimed = (u.temu_surge_claimed OR u.packed_count >= 1 OR u.premiere_score >= 88.00),
  premiere_score = CASE
    WHEN (u.packed_count >= 1 OR u.duels_played > 0 OR u.friends_brought > 0) AND u.premiere_score < 88.00
      THEN 88.00
    ELSE u.premiere_score
  END,
  ui_stage = GREATEST(
    u.ui_stage,
    CASE
      WHEN u.duels_played > 0 OR u.friends_brought > 0 THEN 4
      WHEN (u.packed_count >= 1 OR u.premiere_score >= 88.00)
        AND EXISTS (
          SELECT 1
          FROM public.social_connections sc
          WHERE sc.sender_uid = u.uid OR sc.receiver_uid = u.uid
        ) THEN 4
      WHEN u.packed_count >= 1 OR u.premiere_score >= 88.00 THEN 3
      ELSE 1
    END
  )
WHERE u.ui_stage < 4
   OR (u.packed_count >= 1 AND u.temu_surge_claimed = false);

-- ============================================================================
-- Обновлённый профиль игрока: возвращает ui_stage, temu_surge_claimed, has_social_connection
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
  v_has_social boolean := false;
  v_effective_stage smallint := 1;
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
    daily_social_mask = CASE WHEN daily_social_date < CURRENT_DATE THEN '' ELSE daily_social_mask END,
    daily_social_date = CURRENT_DATE,
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
    'friends_brought', u.friends_brought,
    'daily_shares_count', u.daily_shares_count,
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps,
    'easter_egg_gift_won', u.easter_egg_gift_won,
    'ui_stage', v_effective_stage,
    'temu_surge_claimed', u.temu_surge_claimed,
    'has_social_connection', v_has_social
  );
END;
$$;

-- ============================================================================
-- Обновлённая упаковка бочки: при 1-й упаковке фиксирует рывок до 88.0 / 100 и Стадию 3
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
DECLARE
  v_uid text := NULLIF(trim(COALESCE(p_sender_uid, '')), '');
  v_prev_surge boolean := false;
  v_prev_stage smallint := 1;
  v_surge_now boolean := false;
  v_score numeric(5,2) := 0;
  v_ui_stage smallint := 3;
  v_packed integer := 1;
  v_has_social boolean := false;
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
    v_uid,
    NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_sender_username, '')), ''),
    left(COALESCE(p_sender_name, ''), 40),
    NULLIF(trim(COALESCE(p_photo_url, '')), ''),
    NULLIF(trim(COALESCE(p_voice_url, '')), ''),
    GREATEST(0, LEAST(5, COALESCE(p_target_index, 0)))
  );

  IF v_uid IS NOT NULL AND length(v_uid) >= 2 THEN
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
      packed_count, premiere_score, temu_surge_claimed, ui_stage
    )
    VALUES (
      v_uid,
      NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
      NULLIF(trim(COALESCE(p_sender_username, '')), ''),
      COALESCE(p_sender_name, ''),
      1,
      88.00,
      true,
      3
    )
    ON CONFLICT (uid) DO UPDATE SET
      packed_count = public.users.packed_count + 1,
      premiere_score = GREATEST(public.users.premiere_score, 88.00),
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

-- ============================================================================
-- Монотонное обновление стадии раскрытия UI (1..4) в профиле
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_user_ui_stage_rpc(
  p_uid text,
  p_stage integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := NULLIF(trim(COALESCE(p_uid, '')), '');
  v_stage smallint := GREATEST(1, LEAST(4, COALESCE(p_stage, 1)))::smallint;
  v_res_stage smallint := 1;
BEGIN
  IF v_uid IS NULL OR length(v_uid) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid, lives, ui_stage)
  VALUES (v_uid, 3, v_stage)
  ON CONFLICT (uid) DO UPDATE SET
    ui_stage = GREATEST(public.users.ui_stage, v_stage),
    updated_at = now()
  RETURNING ui_stage INTO v_res_stage;

  RETURN jsonb_build_object('ok', true, 'ui_stage', v_res_stage);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_player_profile(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_ui_stage_rpc(text, integer) TO anon, authenticated;
